const express = require("express");
const router = express.Router();
const Alert = require("../models/Alert");
const { resolveAlert } = require("../services/alertService");

// GET /api/alerts/active - Active alerts
router.get("/active", async (req, res) => {
    try {
        const { provider } = req.query;
        const query = { status: "active" };
        if (provider) query.provider = provider;

        const alerts = await Alert.find(query)
            .sort({ triggeredAt: -1 })
            .lean();

        res.json({
            success: true,
            count: alerts.length,
            alerts
        });
    } catch (error) {
        console.error("Active alerts error:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to fetch active alerts: " + error.message
        });
    }
});

// GET /api/alerts/history - Alert history
router.get("/history", async (req, res) => {
    try {
        const { provider, severity, limit = 100 } = req.query;
        const query = {};
        if (provider) query.provider = provider;
        if (severity) query.severity = severity;

        const alerts = await Alert.find(query)
            .sort({ triggeredAt: -1 })
            .limit(parseInt(limit, 10) || 100)
            .lean();

        res.json({
            success: true,
            count: alerts.length,
            alerts
        });
    } catch (error) {
        console.error("Alert history error:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to fetch alert history: " + error.message
        });
    }
});

// GET /api/alerts - All alerts with filtering and pagination
router.get("/", async (req, res) => {
    try {
        const {
            provider,
            severity,
            status,
            resourceId,
            page = 1,
            limit = 50
        } = req.query;

        const query = {};
        if (provider) query.provider = provider;
        if (severity) query.severity = severity;
        if (status) query.status = status;
        if (resourceId) query.resourceId = resourceId;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
        const skip = (pageNum - 1) * limitNum;

        const [alerts, totalMatching] = await Promise.all([
            Alert.find(query).sort({ triggeredAt: -1 }).skip(skip).limit(limitNum).lean(),
            Alert.countDocuments(query)
        ]);

        res.json({
            success: true,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalMatching,
                totalPages: Math.ceil(totalMatching / limitNum) || 1
            },
            alerts
        });
    } catch (error) {
        console.error("Alerts list error:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to fetch alerts: " + error.message
        });
    }
});

// PATCH /api/alerts/:id/resolve - Manually resolve an alert
router.patch("/:id/resolve", async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        const updated = await resolveAlert(id, notes || "Resolved manually via dashboard");
        if (!updated) {
            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });
        }

        res.json({
            success: true,
            message: "Alert resolved successfully",
            alert: updated
        });
    } catch (error) {
        console.error("Resolve alert error:", error.message);
        res.status(500).json({
            success: false,
            message: "Failed to resolve alert: " + error.message
        });
    }
});

module.exports = router;
