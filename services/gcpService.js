const { MetricServiceClient } = require("@google-cloud/monitoring");
const { InstancesClient } = require("@google-cloud/compute");

const CloudMetric = require("../models/CloudMetric");
const Resource = require("../models/Resource");
const ProviderConnection = require("../models/ProviderConnection");
const { checkCpuThreshold } = require("./alertService");
const cloudConfig = require("../config/cloudConfig");

let metricClient = null;
let instancesClient = null;

/**
 * Initializes GCP clients lazily
 */
function getGcpClients() {
    if (!cloudConfig.gcp.isConfigured()) {
        return { metricClient: null, instancesClient: null };
    }

    if (!metricClient) {
        let clientOptions = {
            projectId: cloudConfig.gcp.projectId
        };

        // Support loading credentials directly from GOOGLE_SERVICE_ACCOUNT_JSON string (ideal for Render)
        if (cloudConfig.gcp.serviceAccountJson) {
            try {
                const credentials = typeof cloudConfig.gcp.serviceAccountJson === "string"
                    ? JSON.parse(cloudConfig.gcp.serviceAccountJson)
                    : cloudConfig.gcp.serviceAccountJson;
                clientOptions.credentials = credentials;
            } catch (err) {
                console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:", err.message);
            }
        } else if (cloudConfig.gcp.credentialsFile) {
            clientOptions.keyFilename = cloudConfig.gcp.credentialsFile;
        }

        metricClient = new MetricServiceClient(clientOptions);
        instancesClient = new InstancesClient(clientOptions);
    }

    return { metricClient, instancesClient };
}

/**
 * Updates ProviderConnection in DB
 */
async function updateConnectionStatus(status, details = {}) {
    try {
        await ProviderConnection.findOneAndUpdate(
            { provider: "GCP" },
            {
                provider: "GCP",
                configured: cloudConfig.gcp.isConfigured(),
                connectionStatus: status,
                projectIdOrSubscriptionId: cloudConfig.gcp.projectId,
                regionOrZone: cloudConfig.gcp.zone,
                monitoredResourceId: cloudConfig.gcp.instanceId,
                lastSuccessfulSync: details.lastSuccessfulSync || undefined,
                lastErrorCode: details.errorCode || null,
                lastErrorMessage: details.errorMessage || null,
                lastErrorAt: details.errorCode ? new Date() : undefined
            },
            { upsert: true, returnDocument: "after" }
        );
    } catch (err) {
        console.error("Failed to update GCP ProviderConnection:", err.message);
    }
}

/**
 * Fetches GCP Compute Engine CPU metrics and saves them to MongoDB
 */
async function syncGcpMetrics(hours = 3) {
    if (!cloudConfig.gcp.isConfigured()) {
        await updateConnectionStatus("Configuration Required", {
            errorMessage: "GCP_PROJECT_ID or Google credentials missing from environment."
        });
        return {
            success: false,
            configured: false,
            connectionStatus: "Configuration Required",
            message: "GCP is not configured. Set GCP_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON."
        };
    }

    try {
        const { metricClient } = getGcpClients();
        if (!metricClient) {
            throw new Error("GCP MetricServiceClient initialization failed.");
        }

        const projectId = cloudConfig.gcp.projectId;
        const projectName = metricClient.projectPath(projectId);

        const endTimeSec = Math.floor(Date.now() / 1000);
        const startTimeSec = endTimeSec - hours * 60 * 60;

        const request = {
            name: projectName,
            filter: 'metric.type="compute.googleapis.com/instance/cpu/utilization"',
            interval: {
                startTime: {
                    seconds: startTimeSec
                },
                endTime: {
                    seconds: endTimeSec
                }
            },
            aggregation: {
                alignmentPeriod: {
                    seconds: 300 // 5-minute alignment
                },
                perSeriesAligner: "ALIGN_MEAN",
                crossSeriesReducer: "REDUCE_NONE"
            }
        };

        const [timeSeries] = await metricClient.listTimeSeries(request);

        const datapoints = [];
        let resourceId = cloudConfig.gcp.instanceId || "gcp-compute-instance";

        if (timeSeries && timeSeries.length > 0) {
            const series = timeSeries[0];
            if (series.resource && series.resource.labels && series.resource.labels.instance_id) {
                resourceId = series.resource.labels.instance_id;
            }

            for (const point of series.points || []) {
                const timestamp = new Date(Number(point.interval.endTime.seconds) * 1000);
                // GCP CPU utilization is 0.0 to 1.0 (fractional), multiply by 100 for percent
                const rawVal = point.value.doubleValue !== undefined
                    ? point.value.doubleValue
                    : point.value.int64Value;
                const percentVal = Math.round((rawVal * 100) * 100) / 100;

                datapoints.push({
                    time: timestamp,
                    averageCpuPercent: percentVal,
                    maximumCpuPercent: percentVal
                });
            }
        }

        // Sort ascending by timestamp
        datapoints.sort((a, b) => new Date(a.time) - new Date(b.time));

        let latestPoint = null;

        if (datapoints.length > 0) {
            const operations = datapoints.map(point => ({
                updateOne: {
                    filter: {
                        provider: "GCP",
                        resourceId,
                        metricName: "CPUUtilization",
                        timestamp: new Date(point.time)
                    },
                    update: {
                        $set: {
                            value: point.averageCpuPercent,
                            unit: "Percent",
                            source: "cloud"
                        },
                        $setOnInsert: {
                            provider: "GCP",
                            resourceId,
                            metricName: "CPUUtilization",
                            timestamp: new Date(point.time)
                        }
                    },
                    upsert: true
                }
            }));

            await CloudMetric.bulkWrite(operations);

            latestPoint = datapoints[datapoints.length - 1];

            // Evaluate threshold alert
            await checkCpuThreshold({
                provider: "GCP",
                resourceId,
                metricName: "CPUUtilization",
                value: latestPoint.averageCpuPercent
            });

            // Update Resource record in MongoDB
            const { cpuWarning, cpuCritical } = cloudConfig.thresholds;
            let status = "healthy";
            if (latestPoint.averageCpuPercent >= cpuCritical) {
                status = "critical";
            } else if (latestPoint.averageCpuPercent >= cpuWarning) {
                status = "warning";
            }

            await Resource.findOneAndUpdate(
                { provider: "GCP", resourceId },
                {
                    name: `GCP Instance (${resourceId})`,
                    provider: "GCP",
                    resourceId,
                    resourceType: "Compute Engine VM",
                    region: cloudConfig.gcp.zone,
                    status,
                    cpuUsage: latestPoint.averageCpuPercent,
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
            provider: "GCP",
            resourceId,
            metricName: "CPUUtilization",
            count: datapoints.length,
            latest: latestPoint,
            datapoints
        };
    } catch (error) {
        console.error("GCP Monitoring fetch error:", error.code, error.message);

        let connectionStatus = "Monitoring Error";
        if (error.code === 16 || error.message?.includes("UNAUTHENTICATED")) {
            connectionStatus = "Authentication Failed";
        } else if (error.code === 7 || error.message?.includes("PERMISSION_DENIED")) {
            connectionStatus = "Permission Denied";
        }

        await updateConnectionStatus(connectionStatus, {
            errorCode: String(error.code || "Error"),
            errorMessage: error.message
        });

        return {
            success: false,
            configured: true,
            connectionStatus,
            message: `GCP Error: ${error.message}`
        };
    }
}

module.exports = {
    syncGcpMetrics,
    updateConnectionStatus
};
