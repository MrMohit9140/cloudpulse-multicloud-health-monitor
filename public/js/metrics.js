/**
 * CloudPulse – Metrics & Analytics Client Script
 * Renders the 7 required Chart.js interactive charts with multi-cloud comparisons and CSV export.
 */

let currentRange = "24h";

// References to existing chart instances to destroy before re-rendering
const charts = {
    cpuOverTime: null,
    avgCpu: null,
    maxCpu: null,
    health: null,
    provider: null,
    performance: null,
    alerts: null
};

async function loadAnalyticsCharts(range = "24h") {
    currentRange = range;
    try {
        const res = await fetch(`/api/metrics/analytics?range=${range}`);
        const data = await res.json();
        if (!data.success) return;

        // ----------------------------------------------------
        // 1. CPU Utilization Over Time (Multi-Provider Line Chart)
        // ----------------------------------------------------
        const ctx1 = document.getElementById("chartCpuOverTime")?.getContext("2d");
        if (ctx1) {
            const labels = data.timeseries.labels.map(l => l.includes("T") ? l.split("T")[1] : l);
            if (charts.cpuOverTime) charts.cpuOverTime.destroy();

            charts.cpuOverTime = new Chart(ctx1, {
                type: "line",
                data: {
                    labels,
                    datasets: [
                        {
                            label: "AWS EC2",
                            data: data.timeseries.aws,
                            borderColor: "#ff9900",
                            backgroundColor: "rgba(255, 153, 0, 0.08)",
                            tension: 0.3,
                            borderWidth: 2,
                            fill: true,
                            spanGaps: true
                        },
                        {
                            label: "Azure Virtual Machines",
                            data: data.timeseries.azure,
                            borderColor: "#0078d4",
                            backgroundColor: "rgba(0, 120, 212, 0.08)",
                            tension: 0.3,
                            borderWidth: 2,
                            fill: true,
                            spanGaps: true
                        },
                        {
                            label: "Google Compute Engine",
                            data: data.timeseries.gcp,
                            borderColor: "#4285f4",
                            backgroundColor: "rgba(66, 133, 244, 0.08)",
                            tension: 0.3,
                            borderWidth: 2,
                            fill: true,
                            spanGaps: true
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, max: 100, ticks: { callback: v => v + "%" }, grid: { color: "#f1f5f9" } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }

        // ----------------------------------------------------
        // 2. Average CPU Utilization by Provider (Bar Chart)
        // ----------------------------------------------------
        const ctx2 = document.getElementById("chartAvgCpuByProvider")?.getContext("2d");
        if (ctx2) {
            if (charts.avgCpu) charts.avgCpu.destroy();

            charts.avgCpu = new Chart(ctx2, {
                type: "bar",
                data: {
                    labels: ["AWS", "Azure", "GCP"],
                    datasets: [{
                        label: "Average CPU (%)",
                        data: [data.avgCpu.AWS, data.avgCpu.Azure, data.avgCpu.GCP],
                        backgroundColor: ["#ff9900", "#0078d4", "#4285f4"],
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, max: 100, ticks: { callback: v => v + "%" }, grid: { color: "#f1f5f9" } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        // ----------------------------------------------------
        // 3. Maximum CPU Utilization by Provider (Bar Chart)
        // ----------------------------------------------------
        const ctx3 = document.getElementById("chartMaxCpuByProvider")?.getContext("2d");
        if (ctx3) {
            if (charts.maxCpu) charts.maxCpu.destroy();

            charts.maxCpu = new Chart(ctx3, {
                type: "bar",
                data: {
                    labels: ["AWS", "Azure", "GCP"],
                    datasets: [{
                        label: "Maximum CPU (%)",
                        data: [data.maxCpu.AWS, data.maxCpu.Azure, data.maxCpu.GCP],
                        backgroundColor: ["#ea580c", "#0284c7", "#3b82f6"],
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, max: 100, ticks: { callback: v => v + "%" }, grid: { color: "#f1f5f9" } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        // ----------------------------------------------------
        // 4. Resource Health Distribution (Doughnut Chart)
        // ----------------------------------------------------
        const ctx4 = document.getElementById("chartHealthDistribution")?.getContext("2d");
        if (ctx4) {
            if (charts.health) charts.health.destroy();

            const h = data.healthDistribution;
            charts.health = new Chart(ctx4, {
                type: "doughnut",
                data: {
                    labels: ["Healthy (< 70%)", "Warning (70-90%)", "Critical (≥ 90%)"],
                    datasets: [{
                        data: [h.healthy, h.warning, h.critical],
                        backgroundColor: ["#10b981", "#f59e0b", "#ef4444"],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: "68%",
                    plugins: { legend: { position: "bottom" } }
                }
            });
        }

        // ----------------------------------------------------
        // 5. Total Resources by Cloud Provider (Polar / Doughnut)
        // ----------------------------------------------------
        const ctx5 = document.getElementById("chartProviderDistribution")?.getContext("2d");
        if (ctx5) {
            if (charts.provider) charts.provider.destroy();

            const p = data.providerDistribution;
            charts.provider = new Chart(ctx5, {
                type: "doughnut",
                data: {
                    labels: ["AWS Resources", "Azure Resources", "GCP Resources"],
                    datasets: [{
                        data: [p.AWS, p.Azure, p.GCP],
                        backgroundColor: ["#ff9900", "#0078d4", "#4285f4"],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: "68%",
                    plugins: { legend: { position: "bottom" } }
                }
            });
        }

        // ----------------------------------------------------
        // 6. Historical Performance Comparison (Grouped Bar)
        // ----------------------------------------------------
        const ctx6 = document.getElementById("chartPerformanceComparison")?.getContext("2d");
        if (ctx6) {
            if (charts.performance) charts.performance.destroy();

            const comp = data.performanceComparison;
            charts.performance = new Chart(ctx6, {
                type: "bar",
                data: {
                    labels: comp.providers,
                    datasets: [
                        {
                            label: "Average CPU (%)",
                            data: comp.averageCpu,
                            backgroundColor: "#3b82f6",
                            borderRadius: 6
                        },
                        {
                            label: "Peak Observed (%)",
                            data: comp.peakCpu,
                            backgroundColor: "#f43f5e",
                            borderRadius: 6
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, max: 100, ticks: { callback: v => v + "%" }, grid: { color: "#f1f5f9" } }
                    },
                    plugins: { legend: { position: "top" } }
                }
            });
        }

        // ----------------------------------------------------
        // 7. Alert Distribution by Severity (Bar Chart)
        // ----------------------------------------------------
        const ctx7 = document.getElementById("chartAlertDistribution")?.getContext("2d");
        if (ctx7) {
            if (charts.alerts) charts.alerts.destroy();

            const a = data.alertDistribution;
            charts.alerts = new Chart(ctx7, {
                type: "bar",
                data: {
                    labels: ["Active Critical", "Active Warning", "Resolved Incidents"],
                    datasets: [{
                        label: "Incident Count",
                        data: [a.activeCritical, a.activeWarning, a.resolvedCritical + a.resolvedWarning],
                        backgroundColor: ["#ef4444", "#f59e0b", "#10b981"],
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: "#f1f5f9" } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

    } catch (err) {
        console.error("Failed to render analytics charts:", err.message);
    }
}

// ----------------------------------------------------
// CSV Telemetry Export
// ----------------------------------------------------
async function exportCsvTelemetry() {
    try {
        const res = await fetch(`/api/metrics/history?range=${currentRange}&limit=1000`);
        const data = await res.json();
        if (!data.success || !data.metrics.length) {
            alert("No metric datapoints available for export in this time range.");
            return;
        }

        const headers = ["Timestamp", "Provider", "ResourceId", "MetricName", "Value(%)", "Unit", "Source"];
        const rows = data.metrics.map(m => [
            `"${m.timestamp}"`,
            `"${m.provider}"`,
            `"${m.resourceId}"`,
            `"${m.metricName}"`,
            m.value,
            `"${m.unit || 'Percent'}"`,
            `"${m.source || 'cloud'}"`
        ]);

        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
        const blob = new Blob(["\uFEFF", csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `cloudpulse-telemetry-${currentRange}-${Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        alert("Failed to export CSV: " + err.message);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // Range filter button clicks
    document.querySelectorAll(".time-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".time-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            loadAnalyticsCharts(btn.dataset.range);
        });
    });

    document.getElementById("exportMetricsCsvBtn")?.addEventListener("click", exportCsvTelemetry);

    loadAnalyticsCharts(currentRange);
});
