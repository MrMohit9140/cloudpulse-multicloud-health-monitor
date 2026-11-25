const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const connectDB = require("../config/database");
const Resource = require("../models/Resource");
const CloudMetric = require("../models/CloudMetric");
const Alert = require("../models/Alert");
const ProviderConnection = require("../models/ProviderConnection");
const cloudConfig = require("../config/cloudConfig");

const sampleResources = [
    {
        name: "Application Gateway EC2",
        provider: "AWS",
        resourceId: "demo-aws-ec2-01",
        resourceType: "EC2 Instance",
        region: "ap-southeast-2",
        status: "healthy",
        cpuUsage: 42.5,
        memoryUsage: 58.2,
        source: "demo",
        lastChecked: new Date()
    },
    {
        name: "Order Processing Worker",
        provider: "AWS",
        resourceId: "demo-aws-worker-02",
        resourceType: "EC2 Instance",
        region: "us-east-1",
        status: "warning",
        cpuUsage: 78.4,
        memoryUsage: 81.0,
        source: "demo",
        lastChecked: new Date()
    },
    {
        name: "Enterprise Database VM",
        provider: "Azure",
        resourceId: "demo-azure-vm-sql01",
        resourceType: "Azure Virtual Machine",
        region: "eastus",
        status: "healthy",
        cpuUsage: 54.1,
        memoryUsage: 68.9,
        source: "demo",
        lastChecked: new Date()
    },
    {
        name: "Payment Gateway VM",
        provider: "Azure",
        resourceId: "demo-azure-vm-pay02",
        resourceType: "Azure Virtual Machine",
        region: "centralindia",
        status: "critical",
        cpuUsage: 93.7,
        memoryUsage: 94.2,
        source: "demo",
        lastChecked: new Date()
    },
    {
        name: "Frontend Ingress Cluster",
        provider: "GCP",
        resourceId: "demo-gcp-gke-node01",
        resourceType: "Compute Engine VM",
        region: "asia-south1",
        status: "healthy",
        cpuUsage: 36.8,
        memoryUsage: 45.3,
        source: "demo",
        lastChecked: new Date()
    },
    {
        name: "Analytics Processing Engine",
        provider: "GCP",
        resourceId: "demo-gcp-bigdata-vm",
        resourceType: "Compute Engine VM",
        region: "us-central1-a",
        status: "warning",
        cpuUsage: 82.3,
        memoryUsage: 76.5,
        source: "demo",
        lastChecked: new Date()
    }
];

const sampleAlerts = [
    {
        provider: "Azure",
        resourceId: "demo-azure-vm-pay02",
        resourceName: "Payment Gateway VM",
        metricName: "Percentage CPU",
        value: 93.7,
        threshold: 90.0,
        severity: "critical",
        status: "active",
        message: 'Azure resource "Payment Gateway VM" CPU utilization is 93.70% (threshold: 90%).',
        triggeredAt: new Date(Date.now() - 25 * 60 * 1000)
    },
    {
        provider: "GCP",
        resourceId: "demo-gcp-bigdata-vm",
        resourceName: "Analytics Processing Engine",
        metricName: "CPUUtilization",
        value: 82.3,
        threshold: 70.0,
        severity: "warning",
        status: "active",
        message: 'GCP resource "Analytics Processing Engine" CPU utilization is 82.30% (threshold: 70%).',
        triggeredAt: new Date(Date.now() - 48 * 60 * 1000)
    },
    {
        provider: "AWS",
        resourceId: "demo-aws-worker-02",
        resourceName: "Order Processing Worker",
        metricName: "CPUUtilization",
        value: 78.4,
        threshold: 70.0,
        severity: "warning",
        status: "active",
        message: 'AWS resource "Order Processing Worker" CPU utilization is 78.40% (threshold: 70%).',
        triggeredAt: new Date(Date.now() - 90 * 60 * 1000)
    },
    {
        provider: "AWS",
        resourceId: "demo-aws-ec2-01",
        resourceName: "Application Gateway EC2",
        metricName: "CPUUtilization",
        value: 62.0,
        threshold: 70.0,
        severity: "warning",
        status: "resolved",
        message: "CPU utilization returned to normal (62.00%).",
        triggeredAt: new Date(Date.now() - 180 * 60 * 1000),
        resolvedAt: new Date(Date.now() - 110 * 60 * 1000),
        notes: "Auto-resolved after traffic surge subsided"
    }
];

async function generateSampleTimeseries() {
    const points = [];
    const now = Date.now();
    const intervals = 24; // Hourly points over past 24 hours

    const profiles = [
        { provider: "AWS", resourceId: "demo-aws-ec2-01", base: 40, variance: 15 },
        { provider: "Azure", resourceId: "demo-azure-vm-sql01", base: 55, variance: 20 },
        { provider: "GCP", resourceId: "demo-gcp-gke-node01", base: 35, variance: 12 }
    ];

    for (let i = intervals; i >= 0; i--) {
        const timestamp = new Date(now - i * 60 * 60 * 1000);
        profiles.forEach(p => {
            const wave = Math.sin(i / 3) * p.variance;
            const jitter = (Math.random() - 0.5) * 6;
            const cpu = Math.max(5, Math.min(98, Math.round((p.base + wave + jitter) * 10) / 10));

            points.push({
                provider: p.provider,
                resourceId: p.resourceId,
                metricName: p.provider === "Azure" ? "Percentage CPU" : "CPUUtilization",
                value: cpu,
                unit: "Percent",
                timestamp,
                source: "demo"
            });
        });
    }

    return points;
}

async function seedDatabase() {
    console.log("--------------------------------------------------");
    console.log(" CloudPulse – Seeding Demo Multi-Cloud Records     ");
    console.log("--------------------------------------------------");

    try {
        await connectDB();

        // 1. Clean ONLY demo records - never touch real cloud data
        console.log("Cleaning existing demo records...");
        await Resource.deleteMany({ source: "demo" });
        await CloudMetric.deleteMany({ source: "demo" });
        await Alert.deleteMany({ resourceId: { $regex: /^demo-/ } });

        // 2. Insert sample resources
        console.log(`Inserting ${sampleResources.length} sample multi-cloud resources...`);
        await Resource.insertMany(sampleResources);

        // 3. Insert historical timeseries metrics
        const timeseriesPoints = await generateSampleTimeseries();
        console.log(`Inserting ${timeseriesPoints.length} timeseries metric datapoints...`);
        await CloudMetric.insertMany(timeseriesPoints);

        // 4. Insert sample alerts
        console.log(`Inserting ${sampleAlerts.length} sample multi-cloud alerts...`);
        await Alert.insertMany(sampleAlerts);

        // 5. Initialize ProviderConnection records if missing
        const defaultConnections = [
            {
                provider: "AWS",
                configured: cloudConfig.aws.isConfigured(),
                connectionStatus: cloudConfig.aws.isConfigured() ? "Connected" : "Configuration Required",
                regionOrZone: cloudConfig.aws.region,
                monitoredResourceId: cloudConfig.aws.instanceId || "i-01fb627927411c6f6",
                lastSuccessfulSync: new Date()
            },
            {
                provider: "Azure",
                configured: cloudConfig.azure.isConfigured(),
                connectionStatus: cloudConfig.azure.isConfigured() ? "Connected" : "Configuration Required",
                projectIdOrSubscriptionId: cloudConfig.azure.subscriptionId || null,
                monitoredResourceId: cloudConfig.azure.vmResourceId || null,
                lastSuccessfulSync: cloudConfig.azure.isConfigured() ? new Date() : null
            },
            {
                provider: "GCP",
                configured: cloudConfig.gcp.isConfigured(),
                connectionStatus: cloudConfig.gcp.isConfigured() ? "Connected" : "Configuration Required",
                projectIdOrSubscriptionId: cloudConfig.gcp.projectId || null,
                regionOrZone: cloudConfig.gcp.zone,
                lastSuccessfulSync: cloudConfig.gcp.isConfigured() ? new Date() : null
            }
        ];

        for (const conn of defaultConnections) {
            await ProviderConnection.findOneAndUpdate(
                { provider: conn.provider },
                { $set: conn },
                { upsert: true }
            );
        }

        console.log("==================================================");
        console.log(" Seed Completed Successfully!                     ");
        console.log(" All multi-cloud resources & metrics are ready.   ");
        console.log("==================================================");
    } catch (error) {
        console.error("Seeding failed with error:", error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log("MongoDB disconnected.");
    }
}

if (require.main === module) {
    seedDatabase();
}

module.exports = { seedDatabase };
