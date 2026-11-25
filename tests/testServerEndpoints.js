/**
 * Automated HTTP Endpoint Tester
 * Boots the Express app and exercises all user and REST API endpoints.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const app = require("../main");
const connectDB = require("../config/database");
const mongoose = require("mongoose");

const PORT = 9191; // dedicated testing port

async function runEndpointTests() {
    let server;
    try {
        server = app.listen(PORT, "127.0.0.1");
        await new Promise(resolve => setTimeout(resolve, 1500));

        const baseUrl = `http://127.0.0.1:${PORT}`;
        const endpoints = [
            { path: "/health", expectStatus: 200 },
            { path: "/", expectStatus: 200 },
            { path: "/resources", expectStatus: 200 },
            { path: "/metrics", expectStatus: 200 },
            { path: "/alerts", expectStatus: 200 },
            { path: "/providers", expectStatus: 200 },
            { path: "/settings", expectStatus: 200 },
            { path: "/api/dashboard/summary", expectStatus: 200 },
            { path: "/api/providers", expectStatus: 200 },
            { path: "/api/resources", expectStatus: 200 },
            { path: "/api/alerts/active", expectStatus: 200 },
            { path: "/api/metrics/analytics", expectStatus: 200 },
            { path: "/api/aws/metrics", expectStatus: 200 },
            { path: "/api/azure/metrics", expectStatus: 200 },
            { path: "/api/gcp/metrics", expectStatus: 200 }
        ];

        console.log(`Testing all HTTP endpoints against ${baseUrl}...\n`);

        let passed = 0;
        let failed = 0;

        for (const ep of endpoints) {
            try {
                const res = await fetch(`${baseUrl}${ep.path}`);
                if (res.status === ep.expectStatus) {
                    console.log(`  ✓ [${res.status}] ${ep.path}`);
                    passed++;
                } else {
                    console.error(`  ✗ [${res.status}] ${ep.path} (expected ${ep.expectStatus})`);
                    failed++;
                }
            } catch (err) {
                console.error(`  ✗ [ERR] ${ep.path}: ${err.message}`);
                failed++;
            }
        }

        console.log(`\nEndpoint Results: ${passed} Passed, ${failed} Failed`);
        if (failed > 0) process.exitCode = 1;

    } catch (err) {
        console.error("Test execution failed:", err);
        process.exitCode = 1;
    } finally {
        if (server) {
            server.close();
        }
        await mongoose.disconnect();
        console.log("Server closed.");
    }
}

runEndpointTests();
