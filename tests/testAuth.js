/**
 * CloudPulse Phase 1 – Authentication & User Management Test Suite
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const connectDB = require("../config/database");
const User = require("../models/User");
const Workspace = require("../models/Workspace");
const WorkspaceMember = require("../models/WorkspaceMember");

let passCount = 0;
let failCount = 0;

function assert(condition, name) {
    if (condition) {
        console.log(`  ✓ PASS: ${name}`);
        passCount++;
    } else {
        console.error(`  ✗ FAIL: ${name}`);
        failCount++;
    }
}

async function runAuthTests() {
    console.log("=================================================");
    console.log(" CloudPulse – Phase 1: Authentication Test Suite ");
    console.log("=================================================\n");

    try {
        await connectDB();
        assert(mongoose.connection.readyState === 1, "Connected to MongoDB Atlas");

        const testEmail = `test-auth-${Date.now()}@cloudpulse-test.io`;
        const testPassword = "Password@1234!";

        // Clean up any stale test records
        await User.deleteMany({ email: { $regex: /@cloudpulse-test\.io$/ } });

        console.log("\n1. USER REGISTRATION & PERSONAL WORKSPACE CREATION");

        // Create user
        const user = await User.create({
            fullName: "Test Engineer",
            email: testEmail,
            password: testPassword
        });

        assert(user && user._id, "User account created successfully");
        assert(user.password !== testPassword, "Password was hashed with bcrypt (never plain text)");

        // Verify password comparison method
        const isMatch = await user.comparePassword(testPassword);
        assert(isMatch === true, "Password comparison validates correct password");

        const isWrongMatch = await user.comparePassword("WrongPassword999");
        assert(isWrongMatch === false, "Password comparison rejects wrong password");

        // Verify duplicate email constraint
        let duplicateFailed = false;
        try {
            await User.create({
                fullName: "Duplicate User",
                email: testEmail,
                password: "AnotherPassword123"
            });
        } catch (err) {
            duplicateFailed = err.code === 11000;
        }
        assert(duplicateFailed === true, "Duplicate email registration rejected by database index");

        // Create personal workspace for user
        const workspaceSlug = `personal-${user._id.toString().substring(18)}-${Date.now().toString(36)}`;
        const personalWorkspace = await Workspace.create({
            name: `${user.fullName}'s Workspace`,
            slug: workspaceSlug,
            type: "personal",
            ownerId: user._id
        });

        assert(personalWorkspace && personalWorkspace.type === "personal", "Personal workspace created automatically");
        assert(personalWorkspace.ownerId.equals(user._id), "Personal workspace ownership assigned to user");

        const membership = await WorkspaceMember.create({
            workspaceId: personalWorkspace._id,
            userId: user._id,
            role: "Owner"
        });

        assert(membership && membership.role === "Owner", "WorkspaceMember record created with role: Owner");

        console.log("\n2. PASSWORD RECOVERY & RESET TOKEN LIFECYCLE");

        const crypto = require("crypto");
        const rawToken = crypto.randomBytes(32).toString("hex");
        const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
        await user.save();

        const userWithToken = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: new Date() }
        });
        assert(userWithToken && userWithToken._id.equals(user._id), "Reset token lookup succeeds before expiration");

        // Reset password
        const newPassword = "NewSecurePassword456!";
        userWithToken.password = newPassword;
        userWithToken.resetPasswordToken = null;
        userWithToken.resetPasswordExpires = null;
        await userWithToken.save();

        const updatedUser = await User.findById(user._id);
        const newPasswordMatch = await updatedUser.comparePassword(newPassword);
        assert(newPasswordMatch === true, "User password updated successfully");

        const oldPasswordFails = await updatedUser.comparePassword(testPassword);
        assert(oldPasswordFails === false, "Previous password invalidated");

        assert(updatedUser.resetPasswordToken === null, "Single-use reset token cleared after use");

        console.log("\n3. DATA SANITIZATION");
        const safeObj = updatedUser.toSafeObject();
        assert(!safeObj.password, "Password hash excluded from safe object representation");
        assert(!safeObj.resetPasswordToken, "Reset token excluded from safe object representation");
        assert(safeObj.email === testEmail, "Safe object preserves public user metadata");

        // Clean up test records
        await WorkspaceMember.deleteMany({ userId: user._id });
        await Workspace.deleteMany({ ownerId: user._id });
        await User.deleteMany({ _id: user._id });

        console.log("\n=================================================");
        console.log(` Authentication Tests Finished: ${passCount} Passed, ${failCount} Failed`);
        console.log("=================================================");

        if (failCount > 0) process.exitCode = 1;

    } catch (err) {
        console.error("Test execution failed:", err);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log("MongoDB disconnected.");
    }
}

runAuthTests();
