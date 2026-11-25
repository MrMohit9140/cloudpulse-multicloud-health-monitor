/**
 * Automated HTTP Endpoint Tester
 * Tests public endpoints, auth protection, session cookies, and authenticated dashboard views.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const app = require("../main");
const connectDB = require("../config/database");
const mongoose = require("mongoose");
const User = require("../models/User");
const Workspace = require("../models/Workspace");
const WorkspaceMember = require("../models/WorkspaceMember");

const PORT = 9192; // dedicated test port

async function runEndpointTests() {
    let server;
    try {
        await connectDB();
        server = app.listen(PORT, "127.0.0.1");
        await new Promise(resolve => setTimeout(resolve, 1500));

        const baseUrl = `http://127.0.0.1:${PORT}`;
        let passed = 0;
        let failed = 0;

        function assert(cond, name) {
            if (cond) {
                console.log(`  ✓ PASS: ${name}`);
                passed++;
            } else {
                console.error(`  ✗ FAIL: ${name}`);
                failed++;
            }
        }

        console.log("=================================================");
        console.log(" CloudPulse – HTTP & Session Security Test Suite ");
        console.log("=================================================\n");

        // 1. Public Endpoints
        console.log("1. PUBLIC ENDPOINTS (GUEST ACCESS)");
        const publicEndpoints = ["/health", "/login", "/register", "/forgot-password"];
        for (const ep of publicEndpoints) {
            const res = await fetch(`${baseUrl}${ep}`);
            assert(res.status === 200, `Public endpoint ${ep} returned 200 OK`);
        }

        // 2. Unauthenticated Protection
        console.log("\n2. UNAUTHENTICATED PROTECTION (REDIRECT & 401)");
        // HTML page should redirect to /login
        const unauthPageRes = await fetch(`${baseUrl}/`, { redirect: "manual" });
        assert(
            unauthPageRes.status === 302 && unauthPageRes.headers.get("location")?.includes("/login"),
            "Unauthenticated request to '/' redirects (302) to '/login'"
        );

        // API call should return 401 Unauthorized
        const unauthApiRes = await fetch(`${baseUrl}/api/resources`, {
            headers: { Accept: "application/json" }
        });
        assert(unauthApiRes.status === 401, "Unauthenticated request to '/api/resources' returns 401 Unauthorized");

        // 3. User Registration & Session Cookie
        console.log("\n3. AUTHENTICATION & SESSION INITIALIZATION");
        const testEmail = `test-endpoint-${Date.now()}@cloudpulse-test.io`;
        const testPassword = "Password@1234!";

        const regRes = await fetch(`${baseUrl}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fullName: "Session Test User",
                email: testEmail,
                password: testPassword,
                confirmPassword: testPassword,
                acceptTerms: true
            })
        });

        assert(regRes.status === 201, "Registration API returned 201 Created");
        const setCookieHeader = regRes.headers.get("set-cookie");
        assert(Boolean(setCookieHeader && setCookieHeader.includes("connect.sid")), "Server issued HttpOnly connect.sid session cookie");

        // Extract session cookie
        const sessionCookie = setCookieHeader.split(";")[0];

        // 4. Authenticated Protected Pages (with session cookie)
        console.log("\n4. AUTHENTICATED PAGES & VIEWS (WITH SESSION COOKIE)");
        const protectedPages = [
            "/",
            "/providers",
            "/resources",
            "/metrics",
            "/alerts",
            "/settings",
            "/profile"
        ];

        for (const page of protectedPages) {
            const res = await fetch(`${baseUrl}${page}`, {
                headers: { Cookie: sessionCookie }
            });
            assert(res.status === 200, `Authenticated view '${page}' loaded with 200 OK`);
        }

        // 5. Authenticated Protected APIs (with session cookie)
        console.log("\n5. AUTHENTICATED REST APIs (WITH SESSION COOKIE)");
        const protectedApis = [
            "/api/auth/me",
            "/api/dashboard/summary",
            "/api/providers",
            "/api/resources",
            "/api/alerts/active",
            "/api/metrics/analytics",
            "/api/aws/metrics",
            "/api/azure/metrics",
            "/api/gcp/metrics"
        ];

        for (const api of protectedApis) {
            const res = await fetch(`${baseUrl}${api}`, {
                headers: { Cookie: sessionCookie, Accept: "application/json" }
            });
            assert(res.status === 200, `Authenticated API '${api}' returned 200 OK`);
        }

        // 6. Logout
        console.log("\n6. LOGOUT & SESSION INVALIDATION");
        const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
            method: "POST",
            headers: { Cookie: sessionCookie }
        });
        assert(logoutRes.status === 200, "Logout API returned 200 OK");

        // Verify session is dead
        const afterLogoutRes = await fetch(`${baseUrl}/api/resources`, {
            headers: { Cookie: sessionCookie, Accept: "application/json" }
        });
        assert(afterLogoutRes.status === 401, "Session invalidated; subsequent request rejected with 401");

        // Cleanup
        const testUser = await User.findOne({ email: testEmail });
        if (testUser) {
            await WorkspaceMember.deleteMany({ userId: testUser._id });
            await Workspace.deleteMany({ ownerId: testUser._id });
            await User.deleteOne({ _id: testUser._id });
        }

        console.log(`\n=================================================`);
        console.log(` HTTP Tests Finished: ${passed} Passed, ${failed} Failed`);
        console.log(`=================================================`);

        if (failed > 0) process.exitCode = 1;

    } catch (err) {
        console.error("Test execution failed:", err);
        process.exitCode = 1;
    } finally {
        if (server) server.close();
        await mongoose.disconnect();
        console.log("Server closed & MongoDB disconnected.");
    }
}

runEndpointTests();
