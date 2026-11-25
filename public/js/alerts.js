/**
 * CloudPulse – Alert Management Page Client Script
 */

let currentTab = "active"; // "active" or "history"
let currentProvider = "";
let currentSeverity = "";

const escapeHtml = str => String(str || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[c]);

function formatTime(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

async function loadAlertStats() {
    try {
        const [activeRes, allRes] = await Promise.all([
            fetch("/api/alerts/active"),
            fetch("/api/alerts?limit=500")
        ]);

        const activeData = await activeRes.json();
        const allData = await allRes.json();

        const activeAlerts = activeData.alerts || [];
        const allAlerts = allData.alerts || [];

        const activeCount = activeAlerts.length;
        const criticalCount = activeAlerts.filter(a => a.severity === "critical").length;
        const warningCount = activeAlerts.filter(a => a.severity === "warning").length;
        const resolvedCount = allAlerts.filter(a => a.status === "resolved").length;

        if (document.getElementById("alertStatActive")) document.getElementById("alertStatActive").textContent = activeCount;
        if (document.getElementById("alertStatCritical")) document.getElementById("alertStatCritical").textContent = criticalCount;
        if (document.getElementById("alertStatWarning")) document.getElementById("alertStatWarning").textContent = warningCount;
        if (document.getElementById("alertStatResolved")) document.getElementById("alertStatResolved").textContent = resolvedCount;

    } catch (err) {
        console.error("Failed to load alert stats:", err.message);
    }
}

async function loadAlertsTable() {
    const tbody = document.getElementById("alertsTableBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2.5rem;">Loading alerts...</td></tr>`;

    try {
        const endpoint = currentTab === "active" ? "/api/alerts/active" : "/api/alerts/history";
        const query = new URLSearchParams();
        if (currentProvider) query.set("provider", currentProvider);
        if (currentSeverity) query.set("severity", currentSeverity);

        const res = await fetch(`${endpoint}?${query.toString()}`);
        const data = await res.json();

        if (!data.success) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2.5rem; color: #ef4444;">${data.message}</td></tr>`;
            return;
        }

        const alerts = data.alerts || [];
        if (alerts.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                        No ${currentTab} alerts found matching the criteria.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = alerts.map(a => {
            const isResolved = a.status === "resolved";
            const providerColor = a.provider === "AWS" ? "#ff9900" : a.provider === "Azure" ? "#0078d4" : "#4285f4";

            return `
                <tr>
                    <td><span class="alert-badge ${a.severity}">${escapeHtml(a.severity)}</span></td>
                    <td><strong style="color: ${providerColor};">${escapeHtml(a.provider)}</strong></td>
                    <td>
                        <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(a.resourceName || a.resourceId)}</div>
                        <div class="resource-id-mono">${escapeHtml(a.resourceId)}</div>
                    </td>
                    <td>${escapeHtml(a.metricName)}</td>
                    <td><strong style="color: ${a.severity === 'critical' ? '#ef4444' : '#f59e0b'};">${Number(a.value).toFixed(1)}%</strong></td>
                    <td>${Number(a.threshold).toFixed(1)}%</td>
                    <td>${formatTime(a.triggeredAt)}</td>
                    <td>
                        <span class="status-pill ${isResolved ? 'connected' : 'error'}">
                            ${escapeHtml(a.status)}
                        </span>
                    </td>
                    <td>
                        ${isResolved
                            ? `<span style="font-size: 0.75rem; color: var(--text-muted);">${formatTime(a.resolvedAt)}</span>`
                            : `<button class="action-resolve-btn" onclick="resolveAlertClick('${a._id}')">Resolve ✓</button>`
                        }
                    </td>
                </tr>
            `;
        }).join("");

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2.5rem; color: #ef4444;">Error: ${err.message}</td></tr>`;
    }
}

async function resolveAlertClick(alertId) {
    const notes = prompt("Enter optional resolution note:", "Resolved manually via dashboard");
    if (notes === null) return; // User cancelled prompt

    try {
        const res = await fetch(`/api/alerts/${alertId}/resolve`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes })
        });
        const data = await res.json();
        if (data.success) {
            loadAlertsTable();
            loadAlertStats();
        } else {
            alert("Failed to resolve alert: " + data.message);
        }
    } catch (err) {
        alert("Error: " + err.message);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // Tab switching
    const tabActive = document.getElementById("tabActiveBtn");
    const tabHistory = document.getElementById("tabHistoryBtn");

    tabActive?.addEventListener("click", () => {
        tabActive.classList.add("active");
        tabHistory?.classList.remove("active");
        currentTab = "active";
        loadAlertsTable();
    });

    tabHistory?.addEventListener("click", () => {
        tabHistory.classList.add("active");
        tabActive?.classList.remove("active");
        currentTab = "history";
        loadAlertsTable();
    });

    // Filters
    document.getElementById("alertProviderFilter")?.addEventListener("change", e => {
        currentProvider = e.target.value;
        loadAlertsTable();
    });

    document.getElementById("alertSeverityFilter")?.addEventListener("change", e => {
        currentSeverity = e.target.value;
        loadAlertsTable();
    });

    document.getElementById("refreshAlertsTableBtn")?.addEventListener("click", () => {
        loadAlertsTable();
        loadAlertStats();
    });

    loadAlertStats();
    loadAlertsTable();
});
