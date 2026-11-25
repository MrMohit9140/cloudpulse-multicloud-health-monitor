const {
    CloudWatchClient,
    GetMetricStatisticsCommand
} = require("@aws-sdk/client-cloudwatch");
const { EC2Client, DescribeInstancesCommand } = require("@aws-sdk/client-ec2");

const CloudMetric = require("../models/CloudMetric");
const Resource = require("../models/Resource");
const ProviderConnection = require("../models/ProviderConnection");
const { checkCpuThreshold } = require("./alertService");
const cloudConfig = require("../config/cloudConfig");

let cloudWatchClient = null;
let ec2Client = null;

function getClients() {
    const region = cloudConfig.aws.region || "ap-southeast-2";
    const credentials = (cloudConfig.aws.accessKeyId && cloudConfig.aws.secretAccessKey)
        ? {
            accessKeyId: cloudConfig.aws.accessKeyId,
            secretAccessKey: cloudConfig.aws.secretAccessKey
        }
        : undefined; // Defaults to environment variables or IAM instance role

    if (!cloudWatchClient) {
        cloudWatchClient = new CloudWatchClient({ region, credentials });
    }
    if (!ec2Client) {
        ec2Client = new EC2Client({ region, credentials });
    }

    return { cloudWatchClient, ec2Client };
}

/**
 * Updates ProviderConnection status in DB
 */
async function updateConnectionStatus(status, details = {}) {
    try {
        await ProviderConnection.findOneAndUpdate(
            { provider: "AWS" },
            {
                provider: "AWS",
                configured: cloudConfig.aws.isConfigured(),
                connectionStatus: status,
                regionOrZone: cloudConfig.aws.region,
                monitoredResourceId: cloudConfig.aws.instanceId,
                lastSuccessfulSync: details.lastSuccessfulSync || undefined,
                lastErrorCode: details.errorCode || null,
                lastErrorMessage: details.errorMessage || null,
                lastErrorAt: details.errorCode ? new Date() : undefined
            },
            { upsert: true, returnDocument: "after" }
        );
    } catch (err) {
        console.error("Failed to update AWS ProviderConnection:", err.message);
    }
}

/**
 * Fetches EC2 metrics from CloudWatch and saves them to MongoDB
 */
async function syncAwsMetrics(hours = 3) {
    const instanceId = cloudConfig.aws.instanceId;

    if (!cloudConfig.aws.isConfigured() || !instanceId) {
        await updateConnectionStatus("Configuration Required", {
            errorMessage: "AWS_EC2_INSTANCE_ID or AWS_REGION is missing in environment."
        });
        return {
            success: false,
            configured: false,
            connectionStatus: "Configuration Required",
            message: "AWS EC2 instance is not configured. Add AWS_EC2_INSTANCE_ID and AWS credentials."
        };
    }

    try {
        const { cloudWatchClient } = getClients();

        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

        const command = new GetMetricStatisticsCommand({
            Namespace: "AWS/EC2",
            MetricName: "CPUUtilization",
            Dimensions: [
                {
                    Name: "InstanceId",
                    Value: instanceId
                }
            ],
            StartTime: startTime,
            EndTime: endTime,
            Period: 300,
            Statistics: ["Average", "Maximum"]
        });

        const result = await cloudWatchClient.send(command);

        const datapoints = (result.Datapoints || [])
            .filter(point => point.Timestamp && point.Average !== undefined)
            .sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));

        let latestPoint = null;

        if (datapoints.length > 0) {
            const operations = datapoints.map(point => ({
                updateOne: {
                    filter: {
                        provider: "AWS",
                        resourceId: instanceId,
                        metricName: "CPUUtilization",
                        timestamp: new Date(point.Timestamp)
                    },
                    update: {
                        $set: {
                            value: point.Average,
                            unit: "Percent",
                            source: "cloud"
                        },
                        $setOnInsert: {
                            provider: "AWS",
                            resourceId: instanceId,
                            metricName: "CPUUtilization",
                            timestamp: new Date(point.Timestamp)
                        }
                    },
                    upsert: true
                }
            }));

            await CloudMetric.bulkWrite(operations);

            latestPoint = datapoints[datapoints.length - 1];

            // Evaluate thresholds
            await checkCpuThreshold({
                provider: "AWS",
                resourceId: instanceId,
                metricName: "CPUUtilization",
                value: latestPoint.Average
            });

            // Update Resource record in MongoDB
            const { cpuWarning, cpuCritical } = cloudConfig.thresholds;
            let status = "healthy";
            if (latestPoint.Average >= cpuCritical) {
                status = "critical";
            } else if (latestPoint.Average >= cpuWarning) {
                status = "warning";
            }

            await Resource.findOneAndUpdate(
                { provider: "AWS", resourceId: instanceId },
                {
                    name: `EC2 Instance (${instanceId})`,
                    provider: "AWS",
                    resourceId: instanceId,
                    resourceType: "EC2 Instance",
                    region: cloudConfig.aws.region,
                    status,
                    cpuUsage: Math.round(latestPoint.Average * 100) / 100,
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
            provider: "AWS",
            resourceId: instanceId,
            metricName: "CPUUtilization",
            count: datapoints.length,
            latest: latestPoint,
            datapoints: datapoints.map(point => ({
                time: point.Timestamp,
                averageCpuPercent: point.Average,
                maximumCpuPercent: point.Maximum
            }))
        };
    } catch (error) {
        console.error("AWS CloudWatch fetch error:", error.name, error.message);

        let connectionStatus = "Monitoring Error";
        if (error.name === "UnrecognizedClientException" || error.name === "InvalidSignatureException" || error.name === "AuthFailure") {
            connectionStatus = "Authentication Failed";
        } else if (error.name === "AccessDeniedException" || error.name === "UnauthorizedOperation") {
            connectionStatus = "Permission Denied";
        }

        await updateConnectionStatus(connectionStatus, {
            errorCode: error.name || "Error",
            errorMessage: error.message
        });

        return {
            success: false,
            configured: true,
            connectionStatus,
            message: `AWS Error: ${error.message}`
        };
    }
}

module.exports = {
    syncAwsMetrics,
    updateConnectionStatus
};
