/**
 * CloudPulse – Resource Inventory Page Script
 */

let currentProvider = "";
let currentStatus = "";
let currentSearch = "";
let currentPage = 1;
const limit = 20;

const escapeHtml = str => String(str || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[c]);

function formatRelativeTime(dateStr) {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "Unknown";
    return date.toLocaleString();
}

async function fetchResources() {
    const tbody = document.getElementById("inventoryTableBody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 2rem;">Loading inventory...</td></tr>`;

    try {
        const query = new URLSearchParams({
            page: currentPage,
            limit
        });

        if (currentProvider) query.set("provider", currentProvider);
        if (currentStatus) query.set("status", currentStatus);
        if (currentSearch) query.set("search", currentSearch);

        const res = await fetch(`/api/resources?${query.toString()}`);
        const data = await res.json();

        if (!data.success) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 2rem; color: #ef4444;">${data.message}</td></tr>`;
            return;
        }

        const resources = data.resources || [];
        if (resources.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 2rem;">No matching resources found.</td></tr>`;
            return;
        }

        tbody.innerHTML = resources.map(r => {
            const cpu = r.cpuUsage != null ? `${Number(r.cpuUsage).toFixed(1)}%` : "N/A";
            const mem = r.memoryUsage != null ? `${Number(r.memoryUsage).toFixed(1)}%` : "N/A";
            const statusClass = r.status === "healthy" ? "connected" : r.status === "warning" ? "configuration-required" : r.status === "critical" ? "error" : "not-connected";
            const providerColor = r.provider === "AWS" ? "#ff9900" : r.provider === "Azure" ? "#0078d4" : "#4285f4";

            return `
                <tr>
                    <td class="resource-name-cell">${escapeHtml(r.name || r.resourceId)}</td>
                    <td><strong style="color: ${providerColor};">${escapeHtml(r.provider)}</strong></td>
                    <td class="resource-id-mono">${escapeHtml(r.resourceId)}</td>
                    <td>${escapeHtml(r.resourceType || "Virtual Machine")}</td>
                    <td>${escapeHtml(r.region || "—")}</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span>${cpu}</span>
                            <div style="width: 50px; height: 5px; background: #e2e8f0; border-radius: 9999px; overflow: hidden;">
                                <div style="width: ${Math.min(100, r.cpuUsage || 0)}%; height: 100%; background: ${r.cpuUsage >= 90 ? '#ef4444' : r.cpuUsage >= 70 ? '#f59e0b' : '#10b981'};"></div>
                            </div>
                        </div>
                    </td>
                    <td>${mem}</td>
                    <td><span class="status-pill ${statusClass}">${escapeHtml(r.status || 'unknown')}</span></td>
                    <td><span class="source-tag ${r.source === 'cloud' ? 'cloud' : 'demo'}">${escapeHtml(r.source || 'demo')}</span></td>
                    <td>${formatRelativeTime(r.lastChecked)}</td>
                </tr>
            `;
        }).join("");

        const p = data.pagination;
        const summary = document.getElementById("paginationSummary");
        if (summary) {
            const start = (p.page - 1) * p.limit + 1;
            const end = Math.min(p.total, p.page * p.limit);
            summary.textContent = `Showing ${p.total > 0 ? start : 0} to ${end} of ${p.total} resources`;
        }

        const prevBtn = document.getElementById("prevPageBtn");
        const nextBtn = document.getElementById("nextPageBtn");
        if (prevBtn) prevBtn.disabled = p.page <= 1;
        if (nextBtn) nextBtn.disabled = p.page >= p.totalPages;

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 2rem; color: #ef4444;">Error: ${err.message}</td></tr>`;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // Provider pill buttons
    document.querySelectorAll(".pill-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".pill-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentProvider = btn.dataset.provider || "";
            currentPage = 1;
            fetchResources();
        });
    });

    // Status filter
    const statusFilter = document.getElementById("statusFilter");
    if (statusFilter) {
        statusFilter.addEventListener("change", e => {
            currentStatus = e.target.value;
            currentPage = 1;
            fetchResources();
        });
    }

    // Search input (debounced)
    let searchTimeout = null;
    const searchInput = document.getElementById("resourceSearch");
    if (searchInput) {
        searchInput.addEventListener("input", e => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentSearch = e.target.value.trim();
                currentPage = 1;
                fetchResources();
            }, 300);
        });
    }

    // Pagination
    document.getElementById("prevPageBtn")?.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            fetchResources();
        }
    });

    document.getElementById("nextPageBtn")?.addEventListener("click", () => {
        currentPage++;
        fetchResources();
    });

    fetchResources();
});
