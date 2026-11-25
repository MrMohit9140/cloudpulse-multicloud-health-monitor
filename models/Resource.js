const mongoose = require("mongoose");

const resourceSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        provider: {
            type: String,
            enum: ["AWS", "Azure", "GCP"],
            required: true
        },
        resourceId: {
            type: String,
            required: true
        },
        resourceType: {
            type: String,
            default: "Virtual Machine"
        },
        region: {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: ["healthy", "warning", "critical", "unknown"],
            default: "unknown"
        },
        cpuUsage: {
            type: Number,
            min: 0,
            max: 100,
            default: null
        },
        memoryUsage: {
            type: Number,
            min: 0,
            max: 100,
            default: null
        },
        source: {
            type: String,
            enum: ["demo", "cloud"],
            default: "demo"
        },
        endpoint: {
            type: String,
            trim: true,
            default: null
        },
        responseTimeMs: {
            type: Number,
            min: 0,
            default: null
        },
        lastChecked: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

resourceSchema.index(
    { provider: 1, resourceId: 1 },
    { unique: true }
);

module.exports = mongoose.model("Resource", resourceSchema);
