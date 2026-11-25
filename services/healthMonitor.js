const Resource = require("../models/Resource");
const ProviderConnection = require("../models/ProviderConnection");
const { syncAwsMetrics } = require("./awsService");
const { syncGcpMetrics } = require("./gcpService");
const cloudConfig = require("../config/cloudConfig");

let isRunning = false;
let monitorIntervalId = null;

async function checkEndpointResource(resource) {
    if (!resource.endpoint) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const start = Date.now();

    try {
        const response = await fetch(resource.endpoint, {
            method: "GET",
            signal: controller.signal
        });

        resource.responseTimeMs = Date.now() - start;

        if (response.ok) {
            resource.status = "healthy";
        } else if (response.status >= 500) {
            resource.status = "critical";
        } else {
            resource.status = "warning";
        }
    } catch (error) {
        resource.status = "critical";
        resource.responseTimeMs = null;
    } finally {
        clearTimeout(timeout);
    }

    resource.lastChecked = new Date();
    await resource.save();
}

async function ensureProviderConnections() {
    const providers = [
        { name: "AWS", configured: cloudConfig.aws.isConfigured() },
        { name: "GCP", configured: cloudConfig.gcp.isConfigured() },
        { name: "Azure", configured: false }
    ];

    for (const provider of providers) {
        const existing = await ProviderConnection.findOne({
            provider: provider.name
        });

        if (!existing) {
            await ProviderConnection.create({
                provider: provider.name,
                configured: provider.configured,
                connectionStatus: provider.configured
                    ? "Not Connected"
                    : "Configuration Required"
            });
        }
    }
}

async function runMonitoringCycle() {
    if (isRunning) return;

    isRunning = true;

    try {
        await ensureProviderConnections();

        const tasks = [
            // AWS monitoring
            (async () => {
                try {
                    return await syncAwsMetrics();
                } catch (error) {
                    console.error("AWS monitoring error:", error.message);
                    return {
                        success: false,
                        provider: "AWS",
                        error: error.message
                    };
                }
            })(),

            // GCP real API calls are skipped in demo mode.
            // We will add the safe demo simulator after inspecting gcpService.js.
            (async () => {
                if (
                    cloudConfig.app.demoMode ||
                    !cloudConfig.gcp.isConfigured()
                ) {
                    return {
                        success: true,
                        provider: "GCP",
                        mode: "DEMO",
                        message: "Real GCP monitoring skipped"
                    };
                }

                try {
                    return await syncGcpMetrics();
                } catch (error) {
                    console.error("GCP monitoring error:", error.message);
                    return {
                        success: false,
                        provider: "GCP",
                        error: error.message
                    };
                }
            })(),

            // HTTP endpoint monitoring
            (async () => {
                try {
                    const endpointResources = await Resource.find({
                        endpoint: { $type: "string", $ne: "" }
                    });

                    for (const resource of endpointResources) {
                        await checkEndpointResource(resource);
                    }
                } catch (error) {
                    console.error(
                        "Endpoint health check error:",
                        error.message
                    );
                }
            })()
        ];

        await Promise.allSettled(tasks);
    } catch (error) {
        console.error(
            "[HealthMonitor] Monitoring cycle error:",
            error.message
        );
    } finally {
        isRunning = false;
    }
}

function startHealthMonitor() {
    if (monitorIntervalId) {
        console.warn("[HealthMonitor] Already running.");
        return;
    }

    if (!cloudConfig.monitoring.enabled) {
        console.log("[HealthMonitor] Background monitoring disabled.");
        return;
    }

    const interval = cloudConfig.monitoring.intervalMs;

    console.log(
        `[HealthMonitor] Starting monitoring (${interval}ms interval)...`
    );

    runMonitoringCycle();
    monitorIntervalId = setInterval(runMonitoringCycle, interval);
}

function stopHealthMonitor() {
    if (monitorIntervalId) {
        clearInterval(monitorIntervalId);
        monitorIntervalId = null;
        console.log("[HealthMonitor] Health monitor stopped.");
    }
}

module.exports = {
    startHealthMonitor,
    stopHealthMonitor,
    runMonitoringCycle
};