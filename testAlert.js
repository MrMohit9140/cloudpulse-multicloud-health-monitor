
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("./config/database");
const Alert = require("./models/Alert");
const { checkCpuThreshold } = require("./services/alertService");

const TEST_RESOURCE_ID = "TEST-CPU-ALERTS-001";

async function runAlertTests() {
    try {
        // Connect to MongoDB Atlas
        await connectDB();

        console.log("\n===== CPU ALERT TEST STARTED =====\n");

        // Remove old test records so this run starts clean.
        await Alert.deleteMany({
            resourceId: TEST_RESOURCE_ID
        });

        // Test 1: CPU reaches 85% - Warning
        console.log("TEST 1: Simulating CPU at 85%...");

        await checkCpuThreshold({
            provider: "AWS",
            resourceId: TEST_RESOURCE_ID,
            metricName: "CPUUtilization",
            value: 85
        });

        let alert = await Alert.findOne({
            resourceId: TEST_RESOURCE_ID,
            status: "active"
        });

        console.log("Expected severity: warning");
        console.log("Actual severity:", alert?.severity);
        console.log("Alert value:", alert?.value);

        if (!alert || alert.severity !== "warning") {
            throw new Error("Warning alert test failed");
        }

        // Test 2: CPU reaches 95% - Critical
        console.log("\nTEST 2: Simulating CPU at 95%...");

        await checkCpuThreshold({
            provider: "AWS",
            resourceId: TEST_RESOURCE_ID,
            metricName: "CPUUtilization",
            value: 95
        });

        alert = await Alert.findOne({
            resourceId: TEST_RESOURCE_ID,
            status: "active"
        });

        console.log("Expected severity: critical");
        console.log("Actual severity:", alert?.severity);
        console.log("Alert value:", alert?.value);

        if (!alert || alert.severity !== "critical") {
            throw new Error("Critical alert test failed");
        }

        // Test 3: CPU falls to 40% - Resolve alert
        console.log("\nTEST 3: Simulating CPU at 40%...");

        await checkCpuThreshold({
            provider: "AWS",
            resourceId: TEST_RESOURCE_ID,
            metricName: "CPUUtilization",
            value: 40
        });

        alert = await Alert.findOne({
            resourceId: TEST_RESOURCE_ID
        }).sort({ triggeredAt: -1 });

        console.log("Expected status: resolved");
        console.log("Actual status:", alert?.status);
        console.log("Resolved at:", alert?.resolvedAt);

        if (!alert || alert.status !== "resolved") {
            throw new Error("Alert resolution test failed");
        }

        console.log("\n===== ALL ALERT TESTS PASSED =====");
        console.log("A test alert record remains in MongoDB for inspection.");

    } catch (error) {
        console.error("\nALERT TEST FAILED:", error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log("MongoDB connection closed.");
    }
}

runAlertTests();
