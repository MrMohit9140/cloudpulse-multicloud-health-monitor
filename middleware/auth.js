const User = require("../models/User");
const Workspace = require("../models/Workspace");
const WorkspaceMember = require("../models/WorkspaceMember");

/**
 * Attaches authenticated user, active workspace, and role to req & res.locals
 */
async function attachUserAndWorkspace(req, res, next) {
    res.locals.user = null;
    res.locals.currentWorkspace = null;
    res.locals.currentRole = null;
    res.locals.userWorkspaces = [];

    if (!req.session || !req.session.userId) {
        req.user = null;
        req.currentWorkspace = null;
        req.currentRole = null;
        return next();
    }

    try {
        const user = await User.findById(req.session.userId);
        if (!user) {
            req.session.destroy(() => {});
            req.user = null;
            return next();
        }

        req.user = user;
        res.locals.user = user.toSafeObject();

        // Retrieve user's workspaces
        const memberships = await WorkspaceMember.find({ userId: user._id })
            .populate("workspaceId")
            .lean();

        const validMemberships = memberships.filter(m => m.workspaceId != null);
        res.locals.userWorkspaces = validMemberships.map(m => ({
            id: m.workspaceId._id,
            name: m.workspaceId.name,
            slug: m.workspaceId.slug,
            type: m.workspaceId.type,
            role: m.role
        }));

        // Determine active workspace
        let activeMembership = null;
        if (req.session.currentWorkspaceId) {
            activeMembership = validMemberships.find(
                m => m.workspaceId._id.toString() === req.session.currentWorkspaceId.toString()
            );
        }

        if (!activeMembership && validMemberships.length > 0) {
            activeMembership = validMemberships[0];
            req.session.currentWorkspaceId = activeMembership.workspaceId._id.toString();
        }

        if (activeMembership) {
            req.currentWorkspace = activeMembership.workspaceId;
            req.currentRole = activeMembership.role;
            res.locals.currentWorkspace = activeMembership.workspaceId;
            res.locals.currentRole = activeMembership.role;
        }

        next();
    } catch (err) {
        console.error("Error in attachUserAndWorkspace middleware:", err.message);
        next();
    }
}

/**
 * Ensures request is authenticated
 */
function ensureAuthenticated(req, res, next) {
    if (req.user) {
        return next();
    }

    const isApi = req.xhr || req.path.startsWith("/api/") || (req.headers.accept && req.headers.accept.includes("application/json"));
    if (isApi) {
        return res.status(401).json({
            success: false,
            message: "Authentication required. Please log in."
        });
    }

    const returnTo = req.originalUrl && req.originalUrl !== "/login" ? `?returnTo=${encodeURIComponent(req.originalUrl)}` : "";
    return res.redirect(`/login${returnTo}`);
}

/**
 * Ensures user is a guest (not logged in) - for login/register pages
 */
function ensureGuest(req, res, next) {
    if (req.user) {
        return res.redirect("/");
    }
    next();
}

/**
 * Role-Based Access Control (RBAC) middleware for workspace operations
 */
function requireRole(allowedRoles = []) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }

        const role = req.currentRole;
        if (!role || !allowedRoles.includes(role)) {
            const isApi = req.xhr || req.path.startsWith("/api/") || (req.headers.accept && req.headers.accept.includes("application/json"));
            if (isApi) {
                return res.status(403).json({
                    success: false,
                    message: `Permission denied. Required role: ${allowedRoles.join(" or ")} (Current: ${role || "None"})`
                });
            }
            return res.status(403).render("dashboard", {
                title: "403 Access Denied – CloudPulse",
                activePage: "overview",
                env: process.env.NODE_ENV || "development",
                errorMessage: `Access denied. You need ${allowedRoles.join(" or ")} permissions.`
            });
        }

        next();
    };
}

module.exports = {
    attachUserAndWorkspace,
    ensureAuthenticated,
    ensureGuest,
    requireRole
};
