// 1. Load environment variables first
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");

const connectDB = require("./config/database");
const cloudConfig = require("./config/cloudConfig");
const {
    startHealthMonitor,
    stopHealthMonitor
} = require("./services/healthMonitor");

// Middleware imports
const {
    attachUserAndWorkspace,
    ensureAuthenticated
} = require("./middleware/auth");

// Route imports
const authRoutes = require("./routes/auth");
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

// Session Configuration backed by MongoDB
const sessionSecret = process.env.SESSION_SECRET || "cloudpulse_default_session_secret_2026";
app.use(
    session({
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: process.env.MONGODB_URI,
            collectionName: "sessions",
            ttl: 14 * 24 * 60 * 60 // 14 days
        }),
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    })
);

// Global user & workspace context middleware
app.use(attachUserAndWorkspace);

// ----------------------------------------------------
// Public Health Check Endpoint
// ----------------------------------------------------
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        service: "CloudPulse – Multi-Cloud Observability Platform",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: cloudConfig.app.env
    });
});

// ----------------------------------------------------
// Authentication Routes (Public: Login, Register, Password Reset)
// ----------------------------------------------------
app.use(authRoutes);

// ----------------------------------------------------
// Protected Frontend Dashboard Pages
// ----------------------------------------------------
app.get("/", ensureAuthenticated, (req, res) => {
    res.render("dashboard", {
        title: "CloudPulse – Overview & Multi-Cloud Health",
        activePage: "overview",
        env: cloudConfig.app.env
    });
});

app.get("/providers", ensureAuthenticated, (req, res) => {
    res.render("providers", {
        title: "Cloud Providers – CloudPulse",
        activePage: "providers",
        env: cloudConfig.app.env
    });
});

app.get("/resources", ensureAuthenticated, (req, res) => {
    res.render("resources", {
        title: "Resource Inventory – CloudPulse",
        activePage: "resources",
        env: cloudConfig.app.env
    });
});

app.get("/metrics", ensureAuthenticated, (req, res) => {
    res.render("metrics", {
        title: "Metrics & Analytics – CloudPulse",
        activePage: "metrics",
        env: cloudConfig.app.env
    });
});

app.get("/alerts", ensureAuthenticated, (req, res) => {
    res.render("alerts", {
        title: "Alerts & Notifications – CloudPulse",
        activePage: "alerts",
        env: cloudConfig.app.env
    });
});

app.get("/settings", ensureAuthenticated, (req, res) => {
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

// ----------------------------------------------------
// API routes (Protected by ensureAuthenticated)
// ----------------------------------------------------
app.use("/api/dashboard", ensureAuthenticated, dashboardApiRoutes);
app.use("/api/resources", ensureAuthenticated, resourceRoutes);
app.use("/api/providers", ensureAuthenticated, providerRoutes);
app.use("/api/aws", ensureAuthenticated, awsMetricsRoutes);
app.use("/api/azure", ensureAuthenticated, azureMetricsRoutes);
app.use("/api/gcp", ensureAuthenticated, gcpMetricsRoutes);
app.use("/api/metrics", ensureAuthenticated, metricHistoryRoutes);
app.use("/api/alerts", ensureAuthenticated, alertRoutes);

// ----------------------------------------------------
// 404 handler
// ----------------------------------------------------
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

// ----------------------------------------------------
// Global error handler
// ----------------------------------------------------
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

// ----------------------------------------------------
// Server bootstrap
// ----------------------------------------------------
async function startServer() {
    try {
        await connectDB();

        startHealthMonitor();

        const server = app.listen(port, "0.0.0.0", () => {
            console.log("==============================================");
            console.log(" CloudPulse – Multi-Cloud Observability Platform");
            console.log(` Local URL:   http://localhost:${port}`);
            console.log(` Health URL:  http://localhost:${port}/health`);
            console.log(` Environment: ${cloudConfig.app.env}`);
            console.log("==============================================");
        });

        // Graceful shutdown handling
        const gracefulShutdown = (signal) => {
            console.log(`\nReceived ${signal}. Shutting down cleanly...`);
            stopHealthMonitor();
            server.close(() => {
                console.log("HTTP server closed.");
                process.exit(0);
            });
        };

        process.on("SIGINT", () => gracefulShutdown("SIGINT"));
        process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    startServer();
}

module.exports = app;
