const Alert = require("../models/Alert");
const Resource = require("../models/Resource");
const cloudConfig = require("../config/cloudConfig");

/**
 * Normalizes metric name to identify CPU metrics across AWS, Azure, GCP
 */
function isCpuMetric(metricName) {
    if (!metricName) return false;
    const lower = metricName.toLowerCase();
    return lower.includes("cpu") || lower.includes("percentage cpu") || lower.includes("utilization");
}

/**
 * Checks CPU threshold and creates/updates/resolves alerts.
 * Duplicate alert prevention: updates the existing active alert instead of creating a new one.
 */
async function checkCpuThreshold({ provider, resourceId, resourceName, metricName, value }) {
    if (!metricName || !isCpuMetric(metricName) || !Number.isFinite(Number(value)) || !resourceId) {
        return null;
    }

    const numValue = Number(value);
    const resolvedProvider = provider || "AWS";
    const resolvedMetricName = metricName || "CPUUtilization";

    const { cpuWarning, cpuCritical } = cloudConfig.thresholds;

    let severity = null;
    let threshold = null;

    if (numValue >= cpuCritical) {
        severity = "critical";
        threshold = cpuCritical;
    } else if (numValue >= cpuWarning) {
        severity = "warning";
        threshold = cpuWarning;
    }

    const filter = {
        provider: resolvedProvider,
        resourceId,
        metricName: resolvedMetricName,
        status: "active"
    };

    const activeAlert = await Alert.findOne(filter);

    // CPU has returned below warning threshold -> Auto-resolve active alert
    if (!severity) {
        if (activeAlert) {
            activeAlert.status = "resolved";
            activeAlert.resolvedAt = new Date();
            activeAlert.message = `CPU utilization returned to normal (${numValue.toFixed(2)}%).`;
            await activeAlert.save();
            return activeAlert;
        }
        return null;
    }

    // Try to resolve resource name if not provided
    let finalResourceName = resourceName;
    if (!finalResourceName) {
        const resObj = await Resource.findOne({ provider: resolvedProvider, resourceId });
        finalResourceName = resObj ? resObj.name : `${resolvedProvider} Resource (${resourceId})`;
    }

    const message = `${resolvedProvider} resource "${finalResourceName}" CPU utilization is ${numValue.toFixed(2)}% (threshold: ${threshold}%).`;

    // If an active alert already exists, update it to prevent duplicate alerts
    if (activeAlert) {
        activeAlert.value = numValue;
        activeAlert.threshold = threshold;
        activeAlert.severity = severity;
        activeAlert.message = message;
        activeAlert.resourceName = finalResourceName;
        await activeAlert.save();
        return activeAlert;
    }

    // No active alert exists, create a new one
    return Alert.create({
        provider: resolvedProvider,
        resourceId,
        resourceName: finalResourceName,
        metricName: resolvedMetricName,
        value: numValue,
        threshold,
        severity,
        status: "active",
        message,
        triggeredAt: new Date()
    });
}

/**
 * Creates an operational or connectivity alert (e.g. Authentication Failed, Monitoring Error)
 */
async function createOperationalAlert({ provider, resourceId, message, severity = "warning" }) {
    if (!provider) return null;

    const filter = {
        provider,
        resourceId: resourceId || `${provider}-System`,
        metricName: "Connectivity",
        status: "active"
    };

    const existing = await Alert.findOne(filter);
    if (existing) {
        existing.message = message;
        existing.severity = severity;
        await existing.save();
        return existing;
    }

    return Alert.create({
        provider,
        resourceId: resourceId || `${provider}-System`,
        resourceName: `${provider} Monitoring Client`,
        metricName: "Connectivity",
        value: 0,
        threshold: 0,
        severity,
        status: "active",
        message,
        triggeredAt: new Date()
    });
}

/**
 * Manually resolve an alert by ID
 */
async function resolveAlert(alertId, notes = "") {
    const alert = await Alert.findById(alertId);
    if (!alert) return null;

    alert.status = "resolved";
    alert.resolvedAt = new Date();
    if (notes) alert.notes = notes;
    await alert.save();
    return alert;
}

module.exports = {
    checkCpuThreshold,
    createOperationalAlert,
    resolveAlert,
    isCpuMetric
};
