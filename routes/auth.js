const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const User = require("../models/User");
const Workspace = require("../models/Workspace");
const WorkspaceMember = require("../models/WorkspaceMember");
const { ensureAuthenticated, ensureGuest } = require("../middleware/auth");

// ----------------------------------------------------
// GET /login - Login Page
// ----------------------------------------------------
router.get("/login", ensureGuest, (req, res) => {
    res.render("auth/login", {
        title: "Log In – CloudPulse",
        returnTo: req.query.returnTo || "",
        error: req.query.error || null,
        success: req.query.success || null
    });
});

// ----------------------------------------------------
// POST /api/auth/login - Process Login
// ----------------------------------------------------
router.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        // Update last login timestamp
        user.lastLogin = new Date();
        await user.save();

        // Regenerate session to prevent session fixation
        req.session.regenerate(async (err) => {
            if (err) {
                console.error("Session regeneration failed:", err);
                return res.status(500).json({
                    success: false,
                    message: "Login session failed to initialize."
                });
            }

            req.session.userId = user._id.toString();

            if (rememberMe) {
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
            } else {
                req.session.cookie.maxAge = 24 * 60 * 60 * 1000; // 24 hours
            }

            // Find user's primary or personal workspace
            let membership = await WorkspaceMember.findOne({ userId: user._id })
                .populate("workspaceId");

            // If user has no workspace yet (edge case), create one
            if (!membership || !membership.workspaceId) {
                const slug = `personal-${user._id.toString().substring(18)}-${Date.now().toString(36)}`;
                const personalWorkspace = await Workspace.create({
                    name: `${user.fullName}'s Workspace`,
                    slug,
                    type: "personal",
                    ownerId: user._id
                });
                membership = await WorkspaceMember.create({
                    workspaceId: personalWorkspace._id,
                    userId: user._id,
                    role: "Owner"
                });
                membership.workspaceId = personalWorkspace;
            }

            req.session.currentWorkspaceId = membership.workspaceId._id.toString();

            res.json({
                success: true,
                message: "Login successful.",
                user: user.toSafeObject(),
                workspace: {
                    id: membership.workspaceId._id,
                    name: membership.workspaceId.name,
                    slug: membership.workspaceId.slug,
                    role: membership.role
                }
            });
        });
    } catch (err) {
        console.error("Login error:", err.message);
        res.status(500).json({
            success: false,
            message: "An internal error occurred during login."
        });
    }
});

// ----------------------------------------------------
// GET /register - Registration Page
// ----------------------------------------------------
router.get("/register", ensureGuest, (req, res) => {
    res.render("auth/register", {
        title: "Create Account – CloudPulse",
        error: req.query.error || null
    });
});

// ----------------------------------------------------
// POST /api/auth/register - Process Registration
// ----------------------------------------------------
router.post("/api/auth/register", async (req, res) => {
    try {
        const { fullName, email, password, confirmPassword, acceptTerms } = req.body;

        // Validation
        if (!fullName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Full name, email, and password are required."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters long."
            });
        }

        if (confirmPassword && password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "Passwords do not match."
            });
        }

        if (acceptTerms === false || acceptTerms === "false") {
            return res.status(400).json({
                success: false,
                message: "You must accept the terms of service."
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Duplicate check
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "An account with this email address already exists."
            });
        }

        // 1. Create User
        const user = await User.create({
            fullName: fullName.trim(),
            email: normalizedEmail,
            password,
            lastLogin: new Date()
        });

        // 2. Automatically create user's personal workspace
        const workspaceSlug = `personal-${user._id.toString().substring(18)}-${Date.now().toString(36)}`;
        const workspace = await Workspace.create({
            name: `${user.fullName}'s Workspace`,
            slug: workspaceSlug,
            type: "personal",
            ownerId: user._id,
            description: "Personal default workspace"
        });

        // 3. Add user as Owner of this workspace
        await WorkspaceMember.create({
            workspaceId: workspace._id,
            userId: user._id,
            role: "Owner"
        });

        // 4. Regenerate session and log user in automatically
        req.session.regenerate((err) => {
            if (err) {
                console.error("Session init failed on register:", err);
                return res.status(201).json({
                    success: true,
                    message: "Account created successfully. Please log in.",
                    user: user.toSafeObject()
                });
            }

            req.session.userId = user._id.toString();
            req.session.currentWorkspaceId = workspace._id.toString();

            res.status(201).json({
                success: true,
                message: "Account and personal workspace created successfully.",
                user: user.toSafeObject(),
                workspace: {
                    id: workspace._id,
                    name: workspace.name,
                    slug: workspace.slug,
                    role: "Owner"
                }
            });
        });
    } catch (err) {
        console.error("Registration error:", err.message);
        res.status(500).json({
            success: false,
            message: "Registration failed: " + err.message
        });
    }
});

// ----------------------------------------------------
// GET /forgot-password - Forgot Password Request Page
// ----------------------------------------------------
router.get("/forgot-password", ensureGuest, (req, res) => {
    res.render("auth/forgot-password", {
        title: "Forgot Password – CloudPulse",
        error: null,
        success: null
    });
});

// ----------------------------------------------------
// POST /api/auth/forgot-password - Send Reset Token
// ----------------------------------------------------
router.post("/api/auth/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email address is required."
            });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        // Never disclose whether a user exists
        if (!user) {
            return res.json({
                success: true,
                message: "If that email address exists in our system, password reset instructions have been issued."
            });
        }

        // Generate reset token
        const rawToken = crypto.randomBytes(32).toString("hex");
        const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
        await user.save();

        const resetUrl = `${req.protocol}://${req.get("host")}/reset-password/${rawToken}`;

        // Check if SMTP is configured
        const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
        if (!hasSmtp) {
            console.log("=================================================");
            console.log(" [DEV / NO-SMTP] PASSWORD RESET LINK GENERATED:  ");
            console.log(` Target User: ${user.email}                       `);
            console.log(` Reset URL:   ${resetUrl}                         `);
            console.log("=================================================");
        }

        res.json({
            success: true,
            message: "Password reset link generated.",
            devResetUrl: hasSmtp ? undefined : resetUrl,
            smtpConfigured: hasSmtp
        });
    } catch (err) {
        console.error("Forgot password error:", err.message);
        res.status(500).json({
            success: false,
            message: "Error processing password reset request."
        });
    }
});

// ----------------------------------------------------
// GET /reset-password/:token - Reset Password Page
// ----------------------------------------------------
router.get("/reset-password/:token", ensureGuest, async (req, res) => {
    try {
        const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.render("auth/login", {
                title: "Log In – CloudPulse",
                returnTo: "",
                error: "Password reset token is invalid or has expired. Please request a new one.",
                success: null
            });
        }

        res.render("auth/reset-password", {
            title: "Reset Password – CloudPulse",
            token: req.params.token,
            error: null
        });
    } catch (err) {
        res.redirect("/login?error=Invalid+reset+token");
    }
});

// ----------------------------------------------------
// POST /api/auth/reset-password - Complete Password Reset
// ----------------------------------------------------
router.post("/api/auth/reset-password", async (req, res) => {
    try {
        const { token, password, confirmPassword } = req.body;

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                message: "Token and new password are required."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters long."
            });
        }

        if (confirmPassword && password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "Passwords do not match."
            });
        }

        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Password reset token is invalid or has expired."
            });
        }

        // Set new password (pre-save hook will hash it)
        user.password = password;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();

        res.json({
            success: true,
            message: "Your password has been successfully reset. You can now log in."
        });
    } catch (err) {
        console.error("Reset password error:", err.message);
        res.status(500).json({
            success: false,
            message: "Failed to reset password: " + err.message
        });
    }
});

// ----------------------------------------------------
// POST /api/auth/logout & GET /logout
// ----------------------------------------------------
function performLogout(req, res) {
    if (req.session) {
        req.session.destroy((err) => {
            if (err) console.error("Session destruction error:", err);
            res.clearCookie("connect.sid");
            if (req.xhr || req.path.startsWith("/api/")) {
                return res.json({ success: true, message: "Logged out successfully." });
            }
            return res.redirect("/login?success=You+have+been+logged+out.");
        });
    } else {
        res.redirect("/login");
    }
}

router.post("/api/auth/logout", performLogout);
router.get("/logout", performLogout);

// ----------------------------------------------------
// GET /api/auth/me - Current Authenticated User Profile
// ----------------------------------------------------
router.get("/api/auth/me", ensureAuthenticated, async (req, res) => {
    res.json({
        success: true,
        user: req.user.toSafeObject(),
        currentWorkspace: req.currentWorkspace,
        currentRole: req.currentRole,
        workspaces: res.locals.userWorkspaces || []
    });
});

// ----------------------------------------------------
// GET /profile - User Profile View
// ----------------------------------------------------
router.get("/profile", ensureAuthenticated, (req, res) => {
    res.render("profile", {
        title: "User Profile – CloudPulse",
        activePage: "profile",
        env: process.env.NODE_ENV || "development",
        user: req.user.toSafeObject(),
        workspaces: res.locals.userWorkspaces || []
    });
});

// ----------------------------------------------------
// PATCH /api/auth/profile - Update Profile
// ----------------------------------------------------
router.patch("/api/auth/profile", ensureAuthenticated, async (req, res) => {
    try {
        const { fullName, avatar } = req.body;
        if (fullName) req.user.fullName = fullName.trim();
        if (avatar !== undefined) req.user.avatar = avatar;

        await req.user.save();

        res.json({
            success: true,
            message: "Profile updated successfully.",
            user: req.user.toSafeObject()
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ----------------------------------------------------
// POST /api/auth/change-password - Change Password
// ----------------------------------------------------
router.post("/api/auth/change-password", ensureAuthenticated, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Current password and new password are required."
            });
        }

        const isMatch = await req.user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: "Current password is incorrect."
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: "New password must be at least 8 characters long."
            });
        }

        if (confirmPassword && newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "New passwords do not match."
            });
        }

        req.user.password = newPassword;
        await req.user.save();

        res.json({
            success: true,
            message: "Password changed successfully."
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ----------------------------------------------------
// POST /api/auth/switch-workspace - Switch Active Workspace
// ----------------------------------------------------
router.post("/api/auth/switch-workspace", ensureAuthenticated, async (req, res) => {
    try {
        const { workspaceId } = req.body;
        if (!workspaceId) {
            return res.status(400).json({ success: false, message: "Workspace ID is required." });
        }

        // Verify membership
        const membership = await WorkspaceMember.findOne({
            workspaceId,
            userId: req.user._id
        }).populate("workspaceId");

        if (!membership || !membership.workspaceId) {
            return res.status(403).json({ success: false, message: "You are not a member of this workspace." });
        }

        req.session.currentWorkspaceId = workspaceId;

        res.json({
            success: true,
            message: `Switched to workspace: ${membership.workspaceId.name}`,
            workspace: {
                id: membership.workspaceId._id,
                name: membership.workspaceId.name,
                slug: membership.workspaceId.slug,
                role: membership.role
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
