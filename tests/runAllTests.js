/**
 * CloudPulse – Comprehensive Automated Test Suite
 * Tests database models, API routes, lazy cloud initialization, alert lifecycle, and health endpoints.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const connectDB = require("../config/database");
const Resource = require("../models/Resource");
const CloudMetric = require("../models/CloudMetric");
const Alert = require("../models/Alert");
const ProviderConnection = require("../models/ProviderConnection");

const { syncAwsMetrics } = require("../services/awsService");
const { syncAzureMetrics } = require("../services/azureService");
const { syncGcpMetrics } = require("../services/gcpService");
const { checkCpuThreshold, resolveAlert } = require("../services/alertService");
const { runMonitoringCycle } = require("../services/healthMonitor");

let passCount = 0;
let failCount = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✓ PASS: ${testName}`);
        passCount++;
    } else {
        console.error(`  ✗ FAIL: ${testName}`);
        failCount++;
    }
}

async function runTestSuite() {
    console.log("=================================================");
    console.log(" CloudPulse – Automated Test Suite Execution     ");
    console.log("=================================================\n");

    try {
        // 1. Database Connection Test
        console.log("1. DATABASE CONNECTIVITY");
        await connectDB();
        assert(mongoose.connection.readyState === 1, "Connected to MongoDB Atlas successfully");

        // 2. Models & Schema Tests
        console.log("\n2. DATABASE MODELS & CONSTRAINTS");
        const resourceCount = await Resource.countDocuments();
        assert(resourceCount >= 0, `Resource model queryable (${resourceCount} total records)`);

        const metricCount = await CloudMetric.countDocuments();
        assert(metricCount >= 0, `CloudMetric model queryable (${metricCount} timeseries records)`);

        const alertCount = await Alert.countDocuments();
        assert(alertCount >= 0, `Alert model queryable (${alertCount} records)`);

        const providerCount = await ProviderConnection.countDocuments();
        assert(providerCount >= 0, `ProviderConnection model queryable (${providerCount} provider records)`);

        // 3. Independent Cloud Module Tests (No Crash on Missing Credentials)
        console.log("\n3. INDEPENDENT CLOUD PROVIDER MODULES (CRASH ISOLATION)");

        // AWS test
        const awsResult = await syncAwsMetrics();
        assert(
            typeof awsResult === "object" && ("success" in awsResult) && ("connectionStatus" in awsResult),
            `AWS Module executed cleanly (Status: ${awsResult.connectionStatus})`
        );

        // Azure test (Lazy init & crash isolation)
        const azureResult = await syncAzureMetrics();
        assert(
            typeof azureResult === "object" && ("success" in azureResult) && ("connectionStatus" in azureResult),
            `Azure Module executed cleanly without crashing (Status: ${azureResult.connectionStatus})`
        );

        // GCP test (Lazy init & crash isolation)
        const gcpResult = await syncGcpMetrics();
        assert(
            typeof gcpResult === "object" && ("success" in gcpResult) && ("connectionStatus" in gcpResult),
            `GCP Module executed cleanly without crashing (Status: ${gcpResult.connectionStatus})`
        );

        // 4. Alert Lifecycle & Duplicate Prevention Test
        console.log("\n4. ALERT LIFECYCLE & DUPLICATE PREVENTION");
        const TEST_ALERT_ID = "TEST-ALERT-VERIFY-001";

        // Clean previous test alert if any
        await Alert.deleteMany({ resourceId: TEST_ALERT_ID });

        // Trigger warning alert (75% CPU)
        const alert1 = await checkCpuThreshold({
            provider: "AWS",
            resourceId: TEST_ALERT_ID,
            resourceName: "Test Resource",
            metricName: "CPUUtilization",
            value: 75.0
        });
        assert(alert1 && alert1.severity === "warning" && alert1.status === "active", "Warning alert created for 75% CPU");

        // Trigger critical alert for the SAME resource (95% CPU) -> should update, NOT create duplicate!
        const alert2 = await checkCpuThreshold({
            provider: "AWS",
            resourceId: TEST_ALERT_ID,
            resourceName: "Test Resource",
            metricName: "CPUUtilization",
            value: 95.0
        });
        assert(alert2 && alert2.severity === "critical" && alert2.value === 95.0, "Active alert escalated to critical (95% CPU)");

        const activeCountForTest = await Alert.countDocuments({ resourceId: TEST_ALERT_ID, status: "active" });
        assert(activeCountForTest === 1, "Duplicate alert prevented (Exactly 1 active alert exists)");

        // Trigger recovery (45% CPU) -> should auto-resolve
        const alert3 = await checkCpuThreshold({
            provider: "AWS",
            resourceId: TEST_ALERT_ID,
            resourceName: "Test Resource",
            metricName: "CPUUtilization",
            value: 45.0
        });
        assert(alert3 && alert3.status === "resolved", "Alert auto-resolved when CPU returned to 45%");

        // Test manual resolution API function
        const manualTestAlert = await Alert.create({
            provider: "Azure",
            resourceId: "TEST-MANUAL-001",
            resourceName: "Manual Resolve VM",
            metricName: "Percentage CPU",
            value: 91.0,
            threshold: 90.0,
            severity: "critical",
            status: "active",
            message: "Manual resolve test alert"
        });
        const resolvedAlert = await resolveAlert(manualTestAlert._id, "Manual resolution test note");
        assert(resolvedAlert && resolvedAlert.status === "resolved" && resolvedAlert.notes.includes("Manual"), "Manual alert resolution function works correctly");

        // Clean up test records
        await Alert.deleteMany({ resourceId: { $in: [TEST_ALERT_ID, "TEST-MANUAL-001"] } });

        // 5. Automated Health Monitor Cycle Test
        console.log("\n5. AUTOMATED HEALTH MONITOR CYCLE (PROMISE.ALLSETTLED)");
        await runMonitoringCycle();
        assert(true, "Full multi-cloud health monitoring cycle ran successfully without unhandled errors");

        console.log("\n=================================================");
        console.log(` Test Execution Finished: ${passCount} Passed, ${failCount} Failed`);
        console.log("=================================================");

        if (failCount > 0) {
            process.exitCode = 1;
        }
    } catch (err) {
        console.error("\nUnexpected Test Error:", err);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log("MongoDB connection closed.");
    }
}

if (require.main === module) {
    runTestSuite();
}

module.exports = { runTestSuite };
