const express = require("express");
const router = express.Router();
const Resource = require("../models/Resource");

// GET /api/resources
router.get("/", async (req, res) => {
    try {
        const {
            provider,
            status,
            region,
            resourceType,
            search,
            sortBy = "updatedAt",
            sortOrder = "desc",
            page = 1,
            limit = 50
        } = req.query;

        const query = {};

        if (provider && ["AWS", "Azure", "GCP"].includes(provider)) {
            query.provider = provider;
        }

        if (status && ["healthy", "warning", "critical", "unknown"].includes(status)) {
            query.status = status;
        }

        if (region) {
            query.region = { $regex: String(region).trim(), $options: "i" };
        }

        if (resourceType) {
            query.resourceType = { $regex: String(resourceType).trim(), $options: "i" };
        }

        if (search) {
            const searchRegex = { $regex: String(search).trim(), $options: "i" };
            query.$or = [
                { name: searchRegex },
                { resourceId: searchRegex },
                { region: searchRegex }
            ];
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
        const skip = (pageNum - 1) * limitNum;

        const sortObj = {};
        sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;

        const [resources, totalMatching, allResources] = await Promise.all([
            Resource.find(query).sort(sortObj).skip(skip).limit(limitNum).lean(),
            Resource.countDocuments(query),
            Resource.find().lean() // For summary counts
        ]);

        const counts = {
            total: allResources.length,
            healthy: allResources.filter(r => r.status === "healthy").length,
            warning: allResources.filter(r => r.status === "warning").length,
            critical: allResources.filter(r => r.status === "critical").length,
            unknown: allResources.filter(r => r.status === "unknown" || !r.status).length,
            aws: allResources.filter(r => r.provider === "AWS").length,
            azure: allResources.filter(r => r.provider === "Azure").length,
            gcp: allResources.filter(r => r.provider === "GCP").length,
            cloud: allResources.filter(r => r.source === "cloud").length,
            demo: allResources.filter(r => r.source === "demo").length
        };

        res.json({
            success: true,
            counts,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalMatching,
                totalPages: Math.ceil(totalMatching / limitNum) || 1
            },
            resources
        });
    } catch (error) {
        console.error("Resource API error:", error.message);
        res.status(500).json({
            success: false,
            message: "Unable to load resources: " + error.message
        });
    }
});

module.exports = router;
