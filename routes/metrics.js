const express = require("express");
const router = express.Router();
const CloudMetric = require("../models/CloudMetric");
const Resource = require("../models/Resource");
const Alert = require("../models/Alert");

// Helper to calculate cutoff date based on time filter
function getCutoffDate(range = "24h") {
    const now = Date.now();
    switch (range) {
        case "1h":
            return new Date(now - 1 * 60 * 60 * 1000);
        case "6h":
            return new Date(now - 6 * 60 * 60 * 1000);
        case "24h":
            return new Date(now - 24 * 60 * 60 * 1000);
        case "7d":
            return new Date(now - 7 * 24 * 60 * 60 * 1000);
        case "30d":
            return new Date(now - 30 * 24 * 60 * 60 * 1000);
        default:
            return new Date(now - 24 * 60 * 60 * 1000);
    }
}

// GET /api/metrics/history - Historical metrics for charts and tables
router.get("/history", async (req, res) => {
    try {
        const { range = "24h", provider, resourceId, limit = 500 } = req.query;
        const cutoff = getCutoffDate(range);

        const query = {
            timestamp: { $gte: cutoff }
        };

        if (provider && ["AWS", "Azure", "GCP"].includes(provider)) {
            query.provider = provider;
        }

        if (resourceId) {
            query.resourceId = resourceId;
        }

        const metrics = await CloudMetric.find(query)
            .sort({ timestamp: 1 })
            .limit(parseInt(limit, 10) || 500)
            .lean();

        // Calculate provider averages & maximums from these historical points
        const providerStats = {
            AWS: { values: [], max: 0, avg: 0 },
            Azure: { values: [], max: 0, avg: 0 },
            GCP: { values: [], max: 0, avg: 0 }
        };

        metrics.forEach(m => {
            if (providerStats[m.provider]) {
                const val = Number(m.value) || 0;
                providerStats[m.provider].values.push(val);
                if (val > providerStats[m.provider].max) {
                    providerStats[m.provider].max = val;
                }
            }
        });

        Object.keys(providerStats).forEach(p => {
            const vals = providerStats[p].values;
            providerStats[p].avg = vals.length > 0
                ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
                : 0;
            providerStats[p].max = Math.round(providerStats[p].max * 100) / 100;
        });

        res.json({
            success: true,
            range,
            count: metrics.length,
            providerStats,
            metrics: metrics.map(m => ({
                id: m._id,
                provider: m.provider,
                resourceId: m.resourceId,
                metricName: m.metricName,
                value: m.value,
                unit: m.unit,
                timestamp: m.timestamp,
                source: m.source
            }))
        });
    } catch (error) {
        console.error("Metric history API error:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve metric history: " + error.message
        });
    }
});

// GET /api/metrics/analytics - Aggregated dataset specifically for the 7 Chart.js analytics charts
router.get("/analytics", async (req, res) => {
    try {
        const { range = "24h" } = req.query;
        const cutoff = getCutoffDate(range);

        const [metrics, resources, alerts] = await Promise.all([
            CloudMetric.find({ timestamp: { $gte: cutoff } }).sort({ timestamp: 1 }).lean(),
            Resource.find().lean(),
            Alert.find().lean()
        ]);

        // 1. CPU Utilization Over Time (Timeseries grouped by 10-15 minute buckets or raw points)
        const timeseries = {
            labels: [],
            aws: [],
            azure: [],
            gcp: []
        };

        // Group points by formatted timestamp
        const timeMap = new Map();
        metrics.forEach(m => {
            const dateStr = new Date(m.timestamp).toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
            if (!timeMap.has(dateStr)) {
                timeMap.set(dateStr, { aws: null, azure: null, gcp: null });
            }
            const entry = timeMap.get(dateStr);
            if (m.provider === "AWS") entry.aws = m.value;
            if (m.provider === "Azure") entry.azure = m.value;
            if (m.provider === "GCP") entry.gcp = m.value;
        });

        const sortedKeys = Array.from(timeMap.keys()).sort();
        // Take at most 40 representative data points so charts remain crisp
        const step = Math.max(1, Math.floor(sortedKeys.length / 40));
        for (let i = 0; i < sortedKeys.length; i += step) {
            const k = sortedKeys[i];
            const item = timeMap.get(k);
            timeseries.labels.push(k);
            timeseries.aws.push(item.aws);
            timeseries.azure.push(item.azure);
            timeseries.gcp.push(item.gcp);
        }

        // 2 & 3. Average & Maximum CPU utilization by provider
        const providerMetrics = { AWS: [], Azure: [], GCP: [] };
        metrics.forEach(m => {
            if (providerMetrics[m.provider]) {
                providerMetrics[m.provider].push(m.value);
            }
        });

        // Fallback to Resource cpuUsage if timeseries is sparse
        if (providerMetrics.AWS.length === 0) {
            resources.filter(r => r.provider === "AWS" && r.cpuUsage != null).forEach(r => providerMetrics.AWS.push(r.cpuUsage));
        }
        if (providerMetrics.Azure.length === 0) {
            resources.filter(r => r.provider === "Azure" && r.cpuUsage != null).forEach(r => providerMetrics.Azure.push(r.cpuUsage));
        }
        if (providerMetrics.GCP.length === 0) {
            resources.filter(r => r.provider === "GCP" && r.cpuUsage != null).forEach(r => providerMetrics.GCP.push(r.cpuUsage));
        }

        const avgCpu = {
            AWS: providerMetrics.AWS.length ? Math.round((providerMetrics.AWS.reduce((a, b) => a + b, 0) / providerMetrics.AWS.length) * 10) / 10 : 0,
            Azure: providerMetrics.Azure.length ? Math.round((providerMetrics.Azure.reduce((a, b) => a + b, 0) / providerMetrics.Azure.length) * 10) / 10 : 0,
            GCP: providerMetrics.GCP.length ? Math.round((providerMetrics.GCP.reduce((a, b) => a + b, 0) / providerMetrics.GCP.length) * 10) / 10 : 0
        };

        const maxCpu = {
            AWS: providerMetrics.AWS.length ? Math.round(Math.max(...providerMetrics.AWS) * 10) / 10 : 0,
            Azure: providerMetrics.Azure.length ? Math.round(Math.max(...providerMetrics.Azure) * 10) / 10 : 0,
            GCP: providerMetrics.GCP.length ? Math.round(Math.max(...providerMetrics.GCP) * 10) / 10 : 0
        };

        // 4. Resource health distribution
        const healthDistribution = {
            healthy: resources.filter(r => r.status === "healthy").length,
            warning: resources.filter(r => r.status === "warning").length,
            critical: resources.filter(r => r.status === "critical").length,
            unknown: resources.filter(r => !r.status || r.status === "unknown").length
        };

        // 5. Total resources by cloud provider
        const providerDistribution = {
            AWS: resources.filter(r => r.provider === "AWS").length,
            Azure: resources.filter(r => r.provider === "Azure").length,
            GCP: resources.filter(r => r.provider === "GCP").length
        };

        // 6. Historical performance comparison (Current vs Past 24h baseline)
        const performanceComparison = {
            providers: ["AWS", "Azure", "GCP"],
            averageCpu: [avgCpu.AWS, avgCpu.Azure, avgCpu.GCP],
            peakCpu: [maxCpu.AWS, maxCpu.Azure, maxCpu.GCP]
        };

        // 7. Alert distribution by severity
        const alertDistribution = {
            activeCritical: alerts.filter(a => a.status === "active" && a.severity === "critical").length,
            activeWarning: alerts.filter(a => a.status === "active" && a.severity === "warning").length,
            resolvedCritical: alerts.filter(a => a.status === "resolved" && a.severity === "critical").length,
            resolvedWarning: alerts.filter(a => a.status === "resolved" && a.severity === "warning").length
        };

        res.json({
            success: true,
            range,
            timeseries,
            avgCpu,
            maxCpu,
            healthDistribution,
            providerDistribution,
            performanceComparison,
            alertDistribution
        });
    } catch (error) {
        console.error("Analytics API error:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to generate analytics dataset: " + error.message
        });
    }
});

module.exports = router;
