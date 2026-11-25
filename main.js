
// 1. Load environment variables first
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const connectDB = require("./config/database");
const cloudConfig = require("./config/cloudConfig");
const {
    startHealthMonitor,
    stopHealthMonitor
} = require("./services/healthMonitor");

// Route imports
const dashboardApiRoutes = require("./routes/dashboard");
const resourceRoutes = require("./routes/resources");
const providerRoutes = require("./routes/providers");
const awsMetricsRoutes = require("./routes/awsMetrics");
const azureMetricsRoutes = require("./routes/azureMetrics");
const gcpMetricsRoutes = require("./routes/gcpMetrics");
const metricHistoryRoutes = require("./routes/metrics");
const alertRoutes = require("./routes/alerts");

const app = express();

// Render provides PORT through the environment
const port = process.env.PORT || cloudConfig.app.port || 9090;

// EJS configuration
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        service: "CloudPulse – Multi-Cloud Health Monitor",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: cloudConfig.app.env
    });
});

// Frontend pages
app.get("/", (req, res) => {
    res.render("dashboard", {
        title: "CloudPulse – Overview & Multi-Cloud Health",
        activePage: "overview",
        env: cloudConfig.app.env
    });
});

app.get("/providers", (req, res) => {
    res.render("providers", {
        title: "Cloud Providers – CloudPulse",
        activePage: "providers",
        env: cloudConfig.app.env
    });
});

app.get("/resources", (req, res) => {
    res.render("resources", {
        title: "Resource Inventory – CloudPulse",
        activePage: "resources",
        env: cloudConfig.app.env
    });
});

app.get("/metrics", (req, res) => {
    res.render("metrics", {
        title: "Metrics & Analytics – CloudPulse",
        activePage: "metrics",
        env: cloudConfig.app.env
    });
});

app.get("/alerts", (req, res) => {
    res.render("alerts", {
        title: "Alerts & Notifications – CloudPulse",
        activePage: "alerts",
        env: cloudConfig.app.env
    });
});

app.get("/settings", (req, res) => {
    res.render("settings", {
        title: "Settings & Cloud Setup – CloudPulse",
        activePage: "settings",
        env: cloudConfig.app.env,
        config: {
            awsConfigured: cloudConfig.aws.isConfigured(),
            azureConfigured: cloudConfig.azure.isConfigured(),
            gcpConfigured: cloudConfig.gcp.isConfigured(),
            demoMode: cloudConfig.app.demoMode,
            thresholds: cloudConfig.thresholds,
            intervalMs: cloudConfig.monitoring.intervalMs
        }
    });
});

// API routes
app.use("/api/dashboard", dashboardApiRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/aws", awsMetricsRoutes);
app.use("/api/azure", azureMetricsRoutes);
app.use("/api/gcp", gcpMetricsRoutes);

app.use("/api/metrics", metricHistoryRoutes);
app.use("/api/alerts", alertRoutes);

// 404 handler
app.use((req, res) => {
    if (req.accepts("html")) {
        return res.status(404).render("dashboard", {
            title: "404 Not Found – CloudPulse",
            activePage: "overview",
            env: cloudConfig.app.env
        });
    }

    res.status(404).json({
        success: false,
        message: "Endpoint not found"
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error("Unhandled Application Error:", err.stack);

    const statusCode = err.status || 500;

    res.status(statusCode).json({
        success: false,
        message:
            cloudConfig.app.env === "production"
                ? "Internal server error"
                : err.message
    });
});

// Start server
async function startServer() {
    try {
        await connectDB();

        startHealthMonitor();

        const server = app.listen(port, "0.0.0.0", () => {
            console.log("==============================================");
            console.log(" CloudPulse – Multi-Cloud Health Monitor");
            console.log(` Local URL: http://localhost:${port}`);
            console.log(` Health URL: http://localhost:${port}/health`);
            console.log(` Environment: ${cloudConfig.app.env}`);
            console.log(" Azure: Disabled");
            console.log("==============================================");
        });

        // Graceful shutdown
        const gracefulShutdown = (signal) => {
            console.log(`Received ${signal}. Shutting down...`);

            stopHealthMonitor();

            server.close(() => {
                console.log("HTTP server closed.");
                process.exit(0);
            });
        };

        process.on("SIGINT", () => gracefulShutdown("SIGINT"));
        process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

    } catch (error) {
        console.error("Fatal Server Startup Failure:", error.message);
        process.exit(1);
    }
}

startServer();

module.exports = app;
