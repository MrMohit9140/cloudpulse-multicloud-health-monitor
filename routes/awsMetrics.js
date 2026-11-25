const express = require("express");
const router = express.Router();
const { syncAwsMetrics } = require("../services/awsService");

// GET /api/aws/metrics
router.get("/metrics", async (req, res) => {
    try {
        const hours = parseInt(req.query.hours, 10) || 3;
        const result = await syncAwsMetrics(hours);

        if (!result.configured) {
            return res.status(200).json({
                success: false,
                configured: false,
                connectionStatus: result.connectionStatus,
                message: result.message,
                datapoints: []
            });
        }

        if (!result.success) {
            return res.status(200).json({
                success: false,
                configured: true,
                connectionStatus: result.connectionStatus,
                message: result.message,
                datapoints: []
            });
        }

        res.json(result);
    } catch (error) {
        console.error("AWS metrics route error:", error);
        res.status(500).json({
            success: false,
            message: "Unable to fetch or save AWS metrics: " + error.message
        });
    }
});

module.exports = router;
