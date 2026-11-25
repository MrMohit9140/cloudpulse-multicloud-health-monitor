const mongoose = require("mongoose");

const providerConnectionSchema = new mongoose.Schema(
    {
        provider: {
            type: String,
            required: true,
            unique: true,
            enum: ["AWS", "Azure", "GCP"]
        },
        configured: {
            type: Boolean,
            default: false
        },
        connectionStatus: {
            type: String,
            required: true,
            enum: [
                "Connected",
                "Not Connected",
                "Configuration Required",
                "Authentication Failed",
                "Permission Denied",
                "Monitoring Error"
            ],
            default: "Configuration Required"
        },
        regionOrZone: {
            type: String,
            default: null
        },
        projectIdOrSubscriptionId: {
            type: String,
            default: null
        },
        monitoredResourceId: {
            type: String,
            default: null
        },
        lastSuccessfulSync: {
            type: Date,
            default: null
        },
        lastErrorCode: {
            type: String,
            default: null
        },
        lastErrorMessage: {
            type: String,
            default: null
        },
        lastErrorAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("ProviderConnection", providerConnectionSchema);
