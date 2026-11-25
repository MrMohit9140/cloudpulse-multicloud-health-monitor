const express = require("express");
const router = express.Router();
const ProviderConnection = require("../models/ProviderConnection");
const Resource = require("../models/Resource");
const cloudConfig = require("../config/cloudConfig");

// GET /api/providers
router.get("/", async (req, res) => {
    try {
        const providersList = ["AWS", "Azure", "GCP"];
        const connections = await ProviderConnection.find().lean();
        const resources = await Resource.find().lean();

        const providerData = providersList.map(name => {
            const conn = connections.find(c => c.provider === name) || {};
            const providerResources = resources.filter(r => r.provider === name);

            let isConfigured = false;
            let identifier = null;

            if (name === "AWS") {
                isConfigured = cloudConfig.aws.isConfigured();
                identifier = cloudConfig.aws.instanceId ? `EC2: ${cloudConfig.aws.instanceId}` : null;
            } else if (name === "Azure") {
                isConfigured = cloudConfig.azure.isConfigured();
                identifier = cloudConfig.azure.subscriptionId ? `Sub: ${cloudConfig.azure.subscriptionId.substring(0, 8)}...` : null;
            } else if (name === "GCP") {
                isConfigured = cloudConfig.gcp.isConfigured();
                identifier = cloudConfig.gcp.projectId ? `Project: ${cloudConfig.gcp.projectId}` : null;
            }

            const defaultStatus = isConfigured ? "Not Connected" : "Configuration Required";

            return {
                provider: name,
                configured: isConfigured,
                connectionStatus: conn.connectionStatus || defaultStatus,
                identifier: identifier || conn.projectIdOrSubscriptionId || conn.monitoredResourceId,
                regionOrZone: conn.regionOrZone,
                lastSuccessfulSync: conn.lastSuccessfulSync || null,
                lastErrorCode: conn.lastErrorCode || null,
                lastErrorMessage: conn.lastErrorMessage || null,
                resourceCounts: {
                    total: providerResources.length,
                    healthy: providerResources.filter(r => r.status === "healthy").length,
                    warning: providerResources.filter(r => r.status === "warning").length,
                    critical: providerResources.filter(r => r.status === "critical").length,
                    unknown: providerResources.filter(r => r.status === "unknown" || !r.status).length
                }
            };
        });

        res.json({
            success: true,
            providers: providerData
        });
    } catch (error) {
        console.error("Providers API error:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve provider connection statuses: " + error.message
        });
    }
});

module.exports = router;
