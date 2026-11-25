const mongoose = require("mongoose");

const workspaceSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Workspace name is required"],
            trim: true,
            maxlength: [100, "Workspace name cannot exceed 100 characters"]
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        type: {
            type: String,
            enum: ["personal", "organization"],
            default: "personal"
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        description: {
            type: String,
            trim: true,
            default: ""
        },
        plan: {
            type: String,
            enum: ["free", "pro", "enterprise"],
            default: "free"
        },
        settings: {
            alertEmail: {
                type: String,
                default: null
            },
            publicStatusPageEnabled: {
                type: Boolean,
                default: false
            },
            retentionDays: {
                type: Number,
                default: 30
            }
        }
    },
    { timestamps: true }
);

workspaceSchema.index({ ownerId: 1 });

module.exports = mongoose.model("Workspace", workspaceSchema);
