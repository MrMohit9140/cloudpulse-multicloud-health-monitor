const mongoose = require("mongoose");

const cloudMetricSchema = new mongoose.Schema(
    {
        provider: {
            type: String,
            required: true,
            enum: ["AWS", "Azure", "GCP"]
        },
        resourceId: {
            type: String,
            required: true
        },
        metricName: {
            type: String,
            required: true,
            default: "CPUUtilization"
        },
        value: {
            type: Number,
            required: true
        },
        unit: {
            type: String,
            default: "Percent"
        },
        timestamp: {
            type: Date,
            required: true
        },
        source: {
            type: String,
            enum: ["demo", "cloud"],
            default: "cloud"
        }
    },
    { timestamps: true }
);

// Prevent duplicate observations for the same resource and metric at the exact timestamp.
cloudMetricSchema.index(
    {
        provider: 1,
        resourceId: 1,
        metricName: 1,
        timestamp: 1
    },
    { unique: true }
);

// Additional helpful indexes for querying historical performance
cloudMetricSchema.index({ provider: 1, timestamp: -1 });
cloudMetricSchema.index({ timestamp: -1 });

module.exports = mongoose.model("CloudMetric", cloudMetricSchema);
