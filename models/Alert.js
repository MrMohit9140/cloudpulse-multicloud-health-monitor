const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
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
        resourceName: {
            type: String,
            default: ""
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
        threshold: {
            type: Number,
            required: true
        },
        severity: {
            type: String,
            enum: ["warning", "critical"],
            required: true
        },
        status: {
            type: String,
            enum: ["active", "resolved"],
            default: "active"
        },
        message: {
            type: String,
            required: true
        },
        triggeredAt: {
            type: Date,
            default: Date.now
        },
        resolvedAt: {
            type: Date,
            default: null
        },
        notes: {
            type: String,
            default: ""
        }
    },
    { timestamps: true }
);

alertSchema.index({
    provider: 1,
    resourceId: 1,
    metricName: 1,
    status: 1
});

module.exports = mongoose.model("Alert", alertSchema);
