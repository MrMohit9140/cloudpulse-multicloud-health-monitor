const express = require("express");
const router = express.Router();
const Resource = require("../models/Resource");
const Alert = require("../models/Alert");
const ProviderConnection = require("../models/ProviderConnection");

// GET /api/dashboard/summary - Live dashboard statistics computed directly from DB
router.get("/summary", async (req, res) => {
    try {
        const [resources, alerts, connections] = await Promise.all([
            Resource.find().lean(),
            Alert.find({ status: "active" }).lean(),
            ProviderConnection.find().lean()
        ]);

        const totalResources = resources.length;
        const healthyResources = resources.filter(r => r.status === "healthy").length;
        const warningResources = resources.filter(r => r.status === "warning").length;
        const criticalResources = resources.filter(r => r.status === "critical").length;

        // Connected providers count (providers with connectionStatus === "Connected")
        const connectedProviders = connections.filter(c => c.connectionStatus === "Connected").length;

        // Active alerts
        const activeAlerts = alerts.length;
        const activeWarnings = alerts.filter(a => a.severity === "warning").length;
        const activeCritical = alerts.filter(a => a.severity === "critical").length;

        // Calculate average CPU utilization across all resources that report cpuUsage
        const cpuValues = resources
            .map(r => r.cpuUsage)
            .filter(val => val != null && Number.isFinite(Number(val)));

        const averageCpu = cpuValues.length > 0
            ? Math.round((cpuValues.reduce((sum, val) => sum + Number(val), 0) / cpuValues.length) * 100) / 100
            : 0;

        res.json({
            success: true,
            summary: {
                totalResources,
                healthyResources,
                warningResources,
                criticalResources,
                connectedProviders,
                activeAlerts,
                activeWarnings,
                activeCritical,
                averageCpu
            },
            updatedAt: new Date()
        });
    } catch (error) {
        console.error("Dashboard summary API error:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to compute dashboard summary: " + error.message
        });
    }
});

module.exports = router;
