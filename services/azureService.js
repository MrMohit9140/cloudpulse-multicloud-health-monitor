const { MonitorClient } = require("@azure/arm-monitor");
const { ClientSecretCredential } = require("@azure/identity");

const CloudMetric = require("../models/CloudMetric");
const Resource = require("../models/Resource");
const ProviderConnection = require("../models/ProviderConnection");
const { checkCpuThreshold } = require("./alertService");
const cloudConfig = require("../config/cloudConfig");

let monitorClient = null;

/**
 * Initializes the Azure MonitorClient lazily to prevent crashing if credentials are missing
 */
function getAzureMonitorClient() {
    if (!cloudConfig.azure.isConfigured()) {
        return null;
    }

    if (!monitorClient) {
        const credential = new ClientSecretCredential(
            cloudConfig.azure.tenantId,
            cloudConfig.azure.clientId,
            cloudConfig.azure.clientSecret
        );

        monitorClient = new MonitorClient(
            credential,
            cloudConfig.azure.subscriptionId
        );
    }

    return monitorClient;
}

/**
 * Updates ProviderConnection record in MongoDB
 */
async function updateConnectionStatus(status, details = {}) {
    try {
        await ProviderConnection.findOneAndUpdate(
            { provider: "Azure" },
            {
                provider: "Azure",
                configured: cloudConfig.azure.isConfigured(),
                connectionStatus: status,
                projectIdOrSubscriptionId: cloudConfig.azure.subscriptionId,
                monitoredResourceId: cloudConfig.azure.vmResourceId,
                lastSuccessfulSync: details.lastSuccessfulSync || undefined,
                lastErrorCode: details.errorCode || null,
                lastErrorMessage: details.errorMessage || null,
                lastErrorAt: details.errorCode ? new Date() : undefined
            },
            { upsert: true, returnDocument: "after" }
        );
    } catch (err) {
        console.error("Failed to update Azure ProviderConnection:", err.message);
    }
}

/**
 * Fetches Azure VM CPU metrics from Azure Monitor and saves them to MongoDB
 */
async function syncAzureMetrics(hours = 3) {
    if (!cloudConfig.azure.isConfigured()) {
        await updateConnectionStatus("Configuration Required", {
            errorMessage: "Azure credentials or VM Resource ID missing from environment."
        });
        return {
            success: false,
            configured: false,
            connectionStatus: "Configuration Required",
            message: "Azure VM is not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_SUBSCRIPTION_ID, and AZURE_VM_RESOURCE_ID."
        };
    }

    try {
        const client = getAzureMonitorClient();
        if (!client) {
            throw new Error("Azure client initialization failed.");
        }

        const resourceId = cloudConfig.azure.vmResourceId;
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

        const result = await client.metrics.list(resourceId, {
            metricnames: "Percentage CPU",
            timespan: `${startTime.toISOString()}/${endTime.toISOString()}`,
            interval: "PT5M",
            aggregation: "Average,Maximum"
        });

        const metric = (result.value || []).find(
            item => item.name?.value === "Percentage CPU"
        );

        const timeSeries = metric?.timeseries || [];
        const datapoints = timeSeries
            .flatMap(series => series.data || [])
            .filter(point => point.timeStamp && point.average !== undefined && point.average !== null)
            .sort((a, b) => new Date(a.timeStamp) - new Date(b.timeStamp));

        let latestPoint = null;

        if (datapoints.length > 0) {
            const operations = datapoints.map(point => ({
                updateOne: {
                    filter: {
                        provider: "Azure",
                        resourceId,
                        metricName: "Percentage CPU",
                        timestamp: new Date(point.timeStamp)
                    },
                    update: {
                        $set: {
                            value: point.average,
                            unit: "Percent",
                            source: "cloud"
                        },
                        $setOnInsert: {
                            provider: "Azure",
                            resourceId,
                            metricName: "Percentage CPU",
                            timestamp: new Date(point.timeStamp)
                        }
                    },
                    upsert: true
                }
            }));

            await CloudMetric.bulkWrite(operations);

            latestPoint = datapoints[datapoints.length - 1];

            // Evaluate threshold alert
            await checkCpuThreshold({
                provider: "Azure",
                resourceId,
                metricName: "Percentage CPU",
                value: latestPoint.average
            });

            // Update Resource record
            const { cpuWarning, cpuCritical } = cloudConfig.thresholds;
            let status = "healthy";
            if (latestPoint.average >= cpuCritical) {
                status = "critical";
            } else if (latestPoint.average >= cpuWarning) {
                status = "warning";
            }

            // Extract VM name from resourceId if possible (/virtualMachines/vmName)
            const parts = resourceId.split("/");
            const vmName = parts[parts.indexOf("virtualMachines") + 1] || "Azure VM";

            await Resource.findOneAndUpdate(
                { provider: "Azure", resourceId },
                {
                    name: vmName,
                    provider: "Azure",
                    resourceId,
                    resourceType: "Azure Virtual Machine",
                    region: parts[parts.indexOf("resourceGroups") + 1] || "Azure",
                    status,
                    cpuUsage: Math.round(latestPoint.average * 100) / 100,
                    source: "cloud",
                    lastChecked: new Date()
                },
                { upsert: true }
            );
        }

        await updateConnectionStatus("Connected", {
            lastSuccessfulSync: new Date()
        });

        return {
            success: true,
            configured: true,
            connectionStatus: "Connected",
            provider: "Azure",
            resourceId,
            metricName: "Percentage CPU",
            count: datapoints.length,
            latest: latestPoint,
            datapoints: datapoints.map(point => ({
                time: point.timeStamp,
                averageCpuPercent: point.average,
                maximumCpuPercent: point.maximum
            }))
        };
    } catch (error) {
        console.error("Azure Monitor fetch error:", error.name, error.message);

        let connectionStatus = "Monitoring Error";
        const message = error.message || "";

        if (
            message.includes("AADSTS") ||
            error.name === "AuthenticationError" ||
            error.statusCode === 401
        ) {
            connectionStatus = "Authentication Failed";
        } else if (error.statusCode === 403 || message.includes("AuthorizationFailed")) {
            connectionStatus = "Permission Denied";
        }

        await updateConnectionStatus(connectionStatus, {
            errorCode: error.code || error.name || "Error",
            errorMessage: error.message
        });

        return {
            success: false,
            configured: true,
            connectionStatus,
            message: `Azure Error: ${error.message}`
        };
    }
}

module.exports = {
    syncAzureMetrics,
    updateConnectionStatus
};
