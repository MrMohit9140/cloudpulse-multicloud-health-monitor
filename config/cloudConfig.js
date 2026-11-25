/**
 * Cloud Configuration & Provider Credential Checks
 * Centralizes thresholds, environment settings, and provider status indicators.
 */

const cloudConfig = {
    app: {
        port: parseInt(process.env.PORT, 10) || 9090,
        env: process.env.NODE_ENV || "development",
        demoMode: process.env.DEMO_MODE === "true" || process.env.DEMO_MODE === undefined // enabled by default for safe local exploration
    },
    thresholds: {
        cpuWarning: parseFloat(process.env.THRESHOLD_CPU_WARNING) || 70.0,
        cpuCritical: parseFloat(process.env.THRESHOLD_CPU_CRITICAL) || 90.0
    },
    monitoring: {
        intervalMs: parseInt(process.env.MONITORING_INTERVAL_MS, 10) || 60000, // 60 seconds
        enabled: process.env.BACKGROUND_MONITORING !== "false"
    },
    aws: {
        region: process.env.AWS_REGION || "ap-southeast-2",
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || null,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || null,
        instanceId: process.env.AWS_EC2_INSTANCE_ID || null,
        isConfigured() {
            return Boolean(this.instanceId && (this.region || process.env.AWS_REGION));
        }
    },
    azure: {
        tenantId: process.env.AZURE_TENANT_ID || null,
        clientId: process.env.AZURE_CLIENT_ID || null,
        clientSecret: process.env.AZURE_CLIENT_SECRET || null,
        subscriptionId: process.env.AZURE_SUBSCRIPTION_ID || null,
        vmResourceId: process.env.AZURE_VM_RESOURCE_ID || null,
        isConfigured() {
            return Boolean(
                this.tenantId &&
                this.clientId &&
                this.clientSecret &&
                this.subscriptionId &&
                this.vmResourceId
            );
        }
    },
    gcp: {
        projectId: process.env.GCP_PROJECT_ID || null,
        serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || null,
        credentialsFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || null,
        instanceId: process.env.GCP_INSTANCE_ID || null,
        zone: process.env.GCP_ZONE || "us-central1-a",
        isConfigured() {
            return Boolean(
                this.projectId &&
                (this.serviceAccountJson || this.credentialsFile || process.env.GOOGLE_APPLICATION_CREDENTIALS)
            );
        }
    }
};

module.exports = cloudConfig;
