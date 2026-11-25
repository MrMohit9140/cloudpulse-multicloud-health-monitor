/**
 * CloudPulse – Main Dashboard Client Script
 * Handles real-time polling, Chart.js multi-cloud charts, provider cards, and notifications.
 */

const $ = id => document.getElementById(id);

// Chart instances (retained to prevent duplicate canvas context errors)
let cpuOverTimeChart = null;
let healthDonutChart = null;
let providerDonutChart = null;

// Helpers
function formatNumber(val, decimals = 1) {
    if (val == null || !Number.isFinite(Number(val))) return "--";
    return Number(val).toFixed(decimals);
}

function formatRelativeTime(dateStr) {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "Unknown";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function escapeHtml(str) {
    if (str == null) return "";
    return String(str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
}

// ----------------------------------------------------
// Clock & Header
// ----------------------------------------------------
function startLiveClock() {
    function tick() {
        const now = new Date();
        const text = now.toLocaleTimeString([], { hour12: false });
        const el = $("liveClockText");
        if (el) el.textContent = text;
    }
    tick();
    setInterval(tick, 1000);
}

// ----------------------------------------------------
// Notifications Dropdown
// ----------------------------------------------------
function setupNotifications() {
    const trigger = $("notificationToggle");
    const dropdown = $("notificationDropdown");
    if (!trigger || !dropdown) return;

    trigger.addEventListener("click", e => {
        e.stopPropagation();
        dropdown.hidden = !dropdown.hidden;
        trigger.setAttribute("aria-expanded", String(!dropdown.hidden));
    });

    document.addEventListener("click", e => {
        if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
            dropdown.hidden = true;
            trigger.setAttribute("aria-expanded", "false");
        }
    });
}

function updateNotificationsUI(alerts = []) {
    const badge = $("notificationBadge");
    const sidebarBadge = $("sidebarAlertBadge");
    const subtitle = $("notificationSubtitle");
    const list = $("notificationList");

    const count = alerts.length;

    if (badge) {
        badge.textContent = count > 99 ? "99+" : count;
        badge.style.display = count > 0 ? "flex" : "none";
    }

    if (sidebarBadge) {
        sidebarBadge.textContent = count > 99 ? "99+" : count;
        sidebarBadge.style.display = count > 0 ? "inline-block" : "none";
    }

    if (subtitle) {
        subtitle.textContent = count === 0 ? "No active alerts" : `${count} active alert${count === 1 ? "" : "s"}`;
    }

    if (!list) return;

    if (count === 0) {
        list.innerHTML = `
            <div class="notification-empty">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <p>All cloud resources within healthy thresholds.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = alerts.slice(0, 6).map(alert => `
        <div style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-subtle); display: flex; gap: 0.65rem; align-items: flex-start;">
            <span style="color: ${alert.severity === 'critical' ? '#ef4444' : '#f59e0b'}; font-weight: 700; font-size: 0.9rem;">
                ${alert.severity === 'critical' ? '×' : '!'}
            </span>
            <div style="flex: 1;">
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 0.2rem;">
                    <strong>${escapeHtml(alert.provider)} · ${escapeHtml(alert.resourceName || alert.resourceId)}</strong>
                    <span style="color: var(--text-muted);">${formatRelativeTime(alert.triggeredAt)}</span>
                </div>
                <p style="font-size: 0.78rem; color: var(--text-secondary); line-height: 1.3;">${escapeHtml(alert.message)}</p>
            </div>
        </div>
    `).join("");
}

// ----------------------------------------------------
// Fetch & Render Summary Cards
// ----------------------------------------------------
async function loadSummaryStats() {
    try {
        const res = await fetch("/api/dashboard/summary");
        const data = await res.json();
        if (!data.success) return;

        const s = data.summary;
        if ($("statTotalResources")) $("statTotalResources").textContent = s.totalResources;
        if ($("statHealthyResources")) $("statHealthyResources").textContent = s.healthyResources;
        if ($("statWarningResources")) $("statWarningResources").textContent = s.warningResources;
        if ($("statCriticalResources")) $("statCriticalResources").textContent = s.criticalResources;
        if ($("statConnectedProviders")) $("statConnectedProviders").textContent = `${s.connectedProviders} / 3`;
        if ($("statAverageCpu")) $("statAverageCpu").textContent = `${formatNumber(s.averageCpu)}%`;
        if ($("statActiveAlerts")) $("statActiveAlerts").textContent = s.activeAlerts;
    } catch (err) {
        console.error("Failed to load dashboard summary:", err.message);
    }
}

// ----------------------------------------------------
// Fetch & Render Cloud Provider Cards
// ----------------------------------------------------
async function loadProviderCards() {
    try {
        const res = await fetch("/api/providers");
        const data = await res.json();
        if (!data.success) return;

        data.providers.forEach(p => {
            const code = p.provider.toLowerCase();
            const pill = $(`${code}StatusPill`);
            const total = $(`${code}Total`);
            const healthy = $(`${code}Healthy`);
            const warning = $(`${code}Warning`);
            const critical = $(`${code}Critical`);
            const sync = $(`${code}LastSync`);
            const ident = $(`${code}Identifier`);

            if (pill) {
                pill.textContent = p.connectionStatus;
                pill.className = "status-pill";
                if (p.connectionStatus === "Connected") {
                    pill.classList.add("connected");
                } else if (p.connectionStatus === "Configuration Required") {
                    pill.classList.add("configuration-required");
                } else if (p.connectionStatus.includes("Error") || p.connectionStatus.includes("Failed") || p.connectionStatus.includes("Denied")) {
                    pill.classList.add("error");
                } else {
                    pill.classList.add("not-connected");
                }
            }

            if (total) total.textContent = p.resourceCounts.total;
            if (healthy) healthy.textContent = p.resourceCounts.healthy;
            if (warning) warning.textContent = p.resourceCounts.warning;
            if (critical) critical.textContent = p.resourceCounts.critical;
            if (sync) sync.textContent = formatRelativeTime(p.lastSuccessfulSync);
            if (ident && p.identifier) ident.textContent = p.identifier;

            // Also update providers detail page if on /providers
            if ($(`detail${p.provider}Status`)) {
                $(`detail${p.provider}Status`).textContent = p.connectionStatus;
                $(`detail${p.provider}Status`).className = pill.className;
            }
            if ($(`detail${p.provider}Sync`)) {
                $(`detail${p.provider}Sync`).textContent = formatRelativeTime(p.lastSuccessfulSync);
            }
            if ($(`detailAwsRegion`) && p.provider === "AWS" && p.regionOrZone) {
                $(`detailAwsRegion`).textContent = p.regionOrZone;
            }
            if ($(`detailAwsInstance`) && p.provider === "AWS" && p.identifier) {
                $(`detailAwsInstance`).textContent = p.identifier;
            }
            if ($(`detailAzureSub`) && p.provider === "Azure" && p.identifier) {
                $(`detailAzureSub`).textContent = p.identifier;
            }
            if ($(`detailGcpProject`) && p.provider === "GCP" && p.identifier) {
                $(`detailGcpProject`).textContent = p.identifier;
            }
        });
    } catch (err) {
        console.error("Failed to load provider cards:", err.message);
    }
}

// ----------------------------------------------------
// Charts: Multi-Cloud CPU & Distributions
// ----------------------------------------------------
async function loadDashboardCharts(range = "24h") {
    try {
        const res = await fetch(`/api/metrics/analytics?range=${range}`);
        const data = await res.json();
        if (!data.success) return;

        // 1. CPU Utilization Over Time
        const cpuCanvas = $("dashMultiCloudCpuChart");
        if (cpuCanvas) {
            const ctx = cpuCanvas.getContext("2d");
            const labels = data.timeseries.labels.map(l => {
                const parts = l.split("T");
                return parts.length > 1 ? parts[1] : l;
            });

            const chartData = {
                labels,
                datasets: [
                    {
                        label: "AWS EC2",
                        data: data.timeseries.aws,
                        borderColor: "#ff9900",
                        backgroundColor: "rgba(255, 153, 0, 0.08)",
                        borderWidth: 2,
                        tension: 0.35,
                        fill: true,
                        spanGaps: true,
                        pointRadius: 2
                    },
                    {
                        label: "Azure VM",
                        data: data.timeseries.azure,
                        borderColor: "#0078d4",
                        backgroundColor: "rgba(0, 120, 212, 0.08)",
                        borderWidth: 2,
                        tension: 0.35,
                        fill: true,
                        spanGaps: true,
                        pointRadius: 2
                    },
                    {
                        label: "Google Cloud VM",
                        data: data.timeseries.gcp,
                        borderColor: "#4285f4",
                        backgroundColor: "rgba(66, 133, 244, 0.08)",
                        borderWidth: 2,
                        tension: 0.35,
                        fill: true,
                        spanGaps: true,
                        pointRadius: 2
                    }
                ]
            };

            if (cpuOverTimeChart) {
                cpuOverTimeChart.data = chartData;
                cpuOverTimeChart.update();
            } else {
                cpuOverTimeChart = new Chart(ctx, {
                    type: "line",
                    data: chartData,
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { intersect: false, mode: "index" },
                        plugins: {
                            legend: { position: "top", labels: { usePointStyle: true, boxWidth: 6 } }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 100,
                                ticks: { callback: v => v + "%" },
                                grid: { color: "#f1f5f9" }
                            },
                            x: { grid: { display: false } }
                        }
                    }
                });
            }
        }

        // 2. Health Donut Chart
        const healthCanvas = $("dashHealthDonutChart");
        if (healthCanvas) {
            const ctx = healthCanvas.getContext("2d");
            const h = data.healthDistribution;
            const healthData = {
                labels: ["Healthy", "Warning", "Critical"],
                datasets: [{
                    data: [h.healthy, h.warning, h.critical],
                    backgroundColor: ["#10b981", "#f59e0b", "#ef4444"],
                    borderWidth: 0
                }]
            };

            if (healthDonutChart) {
                healthDonutChart.data = healthData;
                healthDonutChart.update();
            } else {
                healthDonutChart = new Chart(ctx, {
                    type: "doughnut",
                    data: healthData,
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: "70%",
                        plugins: {
                            legend: { position: "bottom", labels: { boxWidth: 10 } }
                        }
                    }
                });
            }
        }

        // 3. Provider Share Donut Chart
        const providerCanvas = $("dashProviderDonutChart");
        if (providerCanvas) {
            const ctx = providerCanvas.getContext("2d");
            const p = data.providerDistribution;
            const providerData = {
                labels: ["AWS", "Azure", "GCP"],
                datasets: [{
                    data: [p.AWS, p.Azure, p.GCP],
                    backgroundColor: ["#ff9900", "#0078d4", "#4285f4"],
                    borderWidth: 0
                }]
            };

            if (providerDonutChart) {
                providerDonutChart.data = providerData;
                providerDonutChart.update();
            } else {
                providerDonutChart = new Chart(ctx, {
                    type: "doughnut",
                    data: providerData,
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: "70%",
                        plugins: {
                            legend: { position: "bottom", labels: { boxWidth: 10 } }
                        }
                    }
                });
            }
        }
    } catch (err) {
        console.error("Failed to load dashboard analytics charts:", err.message);
    }
}

// ----------------------------------------------------
// Active Alerts Box & Notifications
// ----------------------------------------------------
async function loadActiveAlerts() {
    try {
        const res = await fetch("/api/alerts/active");
        const data = await res.json();
        if (!data.success) return;

        const alerts = data.alerts || [];
        updateNotificationsUI(alerts);

        const list = $("dashActiveAlertsList");
        if (!list) return;

        if (alerts.length === 0) {
            list.innerHTML = `
                <div class="notification-empty">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <p>All cloud resources running within healthy thresholds.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = alerts.slice(0, 4).map(alert => `
            <div style="background-color: ${alert.severity === 'critical' ? '#fef2f2' : '#fffbeb'}; border: 1px solid ${alert.severity === 'critical' ? '#fecaca' : '#fde68a'}; border-radius: var(--radius-md); padding: 0.85rem 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                    <span class="alert-badge ${alert.severity}">${alert.severity}</span>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(alert.provider)} · ${formatRelativeTime(alert.triggeredAt)}</span>
                </div>
                <div style="font-size: 0.82rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.2rem;">${escapeHtml(alert.resourceName || alert.resourceId)}</div>
                <p style="font-size: 0.78rem; color: var(--text-secondary);">${escapeHtml(alert.message)}</p>
            </div>
        `).join("");
    } catch (err) {
        console.error("Failed to load active alerts:", err.message);
    }
}

// ----------------------------------------------------
// Monitored Resources Table Preview
// ----------------------------------------------------
async function loadResourcesPreview() {
    const tbody = $("dashResourceTableBody");
    if (!tbody) return;

    try {
        const res = await fetch("/api/resources?limit=6");
        const data = await res.json();
        if (!data.success) return;

        const resources = data.resources || [];
        if (resources.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem;">No resources discovered yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = resources.map(r => {
            const cpu = r.cpuUsage != null ? `${formatNumber(r.cpuUsage)}%` : "N/A";
            const statusClass = r.status === "healthy" ? "healthy" : r.status === "warning" ? "warning" : r.status === "critical" ? "critical" : "unknown";
            return `
                <tr>
                    <td class="resource-name-cell">${escapeHtml(r.name || r.resourceId)}</td>
                    <td>
                        <span style="font-weight: 600; color: ${r.provider === 'AWS' ? '#ff9900' : r.provider === 'Azure' ? '#0078d4' : '#4285f4'};">
                            ${escapeHtml(r.provider)}
                        </span>
                    </td>
                    <td class="resource-id-mono">${escapeHtml(r.resourceId)}</td>
                    <td>${escapeHtml(r.resourceType || "Virtual Machine")}</td>
                    <td>${escapeHtml(r.region || "—")}</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span>${cpu}</span>
                            <div style="flex: 1; height: 6px; background-color: #e2e8f0; border-radius: 9999px; overflow: hidden; width: 60px;">
                                <div style="width: ${Math.min(100, r.cpuUsage || 0)}%; height: 100%; background-color: ${r.cpuUsage >= 90 ? '#ef4444' : r.cpuUsage >= 70 ? '#f59e0b' : '#10b981'};"></div>
                            </div>
                        </div>
                    </td>
                    <td><span class="status-pill ${statusClass === 'healthy' ? 'connected' : statusClass === 'warning' ? 'configuration-required' : statusClass === 'critical' ? 'error' : 'not-connected'}">${r.status || 'unknown'}</span></td>
                    <td><span class="source-tag ${r.source === 'cloud' ? 'cloud' : 'demo'}">${r.source || 'demo'}</span></td>
                    <td>${formatRelativeTime(r.lastChecked)}</td>
                </tr>
            `;
        }).join("");
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #ef4444;">Failed to load resources: ${err.message}</td></tr>`;
    }
}

// ----------------------------------------------------
// Global Refresh & Initial Load
// ----------------------------------------------------
async function loadDashboardData() {
    const spinner = document.querySelector(".refresh-spinner");
    if (spinner) spinner.classList.add("spinning");

    try {
        await Promise.allSettled([
            loadSummaryStats(),
            loadProviderCards(),
            loadDashboardCharts($("dashTimeRangeSelect")?.value || "24h"),
            loadActiveAlerts(),
            loadResourcesPreview()
        ]);
    } finally {
        if (spinner) spinner.classList.remove("spinning");
    }
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
    startLiveClock();
    setupNotifications();

    $("mobileMenuToggle")?.addEventListener("click", () => {
        $("sidebar")?.classList.toggle("open");
    });

    $("globalRefreshBtn")?.addEventListener("click", loadDashboardData);

    $("dashTimeRangeSelect")?.addEventListener("change", e => {
        loadDashboardCharts(e.target.value);
    });

    // Initial load
    loadDashboardData();

    // Periodic automatic background refresh (30s)
    setInterval(loadDashboardData, 30000);
});
