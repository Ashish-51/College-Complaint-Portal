/**
 * Admin Dashboard & Management Console Module
 * Project: Smart College Complaint Portal
 */

import { db } from "./firebase-config.js";
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc 
} from "firebase/firestore";
import { 
  requireAuth, 
  setupLayout, 
  showToast, 
  formatDate, 
  renderStatusBadge, 
  renderPriorityBadge, 
  escapeHTML,
  mergeComplaints
} from "./utils.js";
import Chart from "chart.js/auto";

let categoryChartInstance = null;
let statusChartInstance = null;
let monthlyChartInstance = null;
let allComplaintsData = [];

export function initAdminDashboard() {
  requireAuth('admin', (user, profile) => {
    setupLayout('admin-dashboard', profile);

    const processComplaints = (remoteList = []) => {
      allComplaintsData = mergeComplaints(remoteList);

      updateAdminStats(allComplaintsData);
      renderCharts(allComplaintsData);
      applyFiltersAndRenderTable();
    };

    // Render local complaints immediately
    processComplaints([]);

    // Realtime Complaints Listener
    const complaintsRef = collection(db, 'complaints');
    onSnapshot(complaintsRef, (snapshot) => {
      const remoteList = [];
      snapshot.forEach(docSnap => {
        remoteList.push({ id: docSnap.id, ...docSnap.data() });
      });

      processComplaints(remoteList);
    }, (error) => {
      console.warn("Notice loading admin complaints:", error);
      processComplaints([]);
    });

    // Event Listeners for Search & Filters
    setupFilterListeners();
  });
}

function updateAdminStats(complaints) {
  const total = complaints.length;
  const pending = complaints.filter(c => (c.status || '').toLowerCase() === 'pending').length;
  const resolved = complaints.filter(c => (c.status || '').toLowerCase() === 'resolved').length;
  const rejected = complaints.filter(c => (c.status || '').toLowerCase() === 'rejected').length;
  const highPriority = complaints.filter(c => (c.priority || '').toLowerCase() === 'high').length;

  const totalEl = document.getElementById('admin-stat-total');
  if (totalEl) totalEl.textContent = total;
  const pendingEl = document.getElementById('admin-stat-pending');
  if (pendingEl) pendingEl.textContent = pending;
  const resolvedEl = document.getElementById('admin-stat-resolved');
  if (resolvedEl) resolvedEl.textContent = resolved;
  const rejectedEl = document.getElementById('admin-stat-rejected');
  if (rejectedEl) rejectedEl.textContent = rejected;
  const highEl = document.getElementById('admin-stat-high');
  if (highEl) highEl.textContent = highPriority;
}

function renderCharts(complaints) {
  // 1. Complaints by Category
  const categoryCounts = {};
  complaints.forEach(c => {
    const cat = c.category || 'Others';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  const categoryCanvas = document.getElementById('chart-category');
  if (categoryCanvas) {
    if (categoryChartInstance) categoryChartInstance.destroy();
    categoryChartInstance = new Chart(categoryCanvas, {
      type: 'doughnut',
      data: {
        labels: Object.keys(categoryCounts),
        datasets: [{
          data: Object.values(categoryCounts),
          backgroundColor: [
            '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#f59e0b',
            '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'
          ]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  // 2. Complaints by Status
  const statusCounts = { 'Pending': 0, 'In Progress': 0, 'Resolved': 0, 'Rejected': 0 };
  complaints.forEach(c => {
    const st = c.status || 'Pending';
    if (statusCounts[st] !== undefined) statusCounts[st]++;
    else statusCounts[st] = 1;
  });

  const statusCanvas = document.getElementById('chart-status');
  if (statusCanvas) {
    if (statusChartInstance) statusChartInstance.destroy();
    statusChartInstance = new Chart(statusCanvas, {
      type: 'bar',
      data: {
        labels: Object.keys(statusCounts),
        datasets: [{
          label: 'Complaints',
          data: Object.values(statusCounts),
          backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    });
  }

  // 3. Monthly Complaints Trend
  const monthlyCounts = {};
  complaints.forEach(c => {
    if (c.createdAt) {
      const d = new Date(c.createdAt);
      if (!isNaN(d.getTime())) {
        const monthYear = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        monthlyCounts[monthYear] = (monthlyCounts[monthYear] || 0) + 1;
      }
    }
  });

  const monthlyCanvas = document.getElementById('chart-monthly');
  if (monthlyCanvas) {
    if (monthlyChartInstance) monthlyChartInstance.destroy();
    monthlyChartInstance = new Chart(monthlyCanvas, {
      type: 'line',
      data: {
        labels: Object.keys(monthlyCounts).length ? Object.keys(monthlyCounts) : ['Current'],
        datasets: [{
          label: 'Monthly Volume',
          data: Object.values(monthlyCounts).length ? Object.values(monthlyCounts) : [complaints.length],
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    });
  }
}

function setupFilterListeners() {
  const searchInput = document.getElementById('admin-search');
  const catFilter = document.getElementById('filter-category');
  const statusFilter = document.getElementById('filter-status');
  const priorityFilter = document.getElementById('filter-priority');

  const handler = () => applyFiltersAndRenderTable();

  searchInput?.addEventListener('input', handler);
  catFilter?.addEventListener('change', handler);
  statusFilter?.addEventListener('change', handler);
  priorityFilter?.addEventListener('change', handler);
}

function applyFiltersAndRenderTable() {
  const queryText = (document.getElementById('admin-search')?.value || '').toLowerCase().trim();
  const selectedCat = document.getElementById('filter-category')?.value || 'all';
  const selectedStatus = document.getElementById('filter-status')?.value || 'all';
  const selectedPriority = document.getElementById('filter-priority')?.value || 'all';

  let filtered = allComplaintsData.filter(c => {
    // Search match
    const titleMatch = (c.title || '').toLowerCase().includes(queryText);
    const studentMatch = (c.studentName || '').toLowerCase().includes(queryText);
    const catMatchSearch = (c.category || '').toLowerCase().includes(queryText);
    const statusMatchSearch = (c.status || '').toLowerCase().includes(queryText);
    const matchesSearch = !queryText || titleMatch || studentMatch || catMatchSearch || statusMatchSearch;

    // Category match
    const matchesCat = selectedCat === 'all' || (c.category || '') === selectedCat;

    // Status match
    const matchesStatus = selectedStatus === 'all' || (c.status || '') === selectedStatus;

    // Priority match
    const matchesPriority = selectedPriority === 'all' || (c.priority || '') === selectedPriority;

    return matchesSearch && matchesCat && matchesStatus && matchesPriority;
  });

  renderAdminTable(filtered);
}

function renderAdminTable(complaints) {
  const tableBody = document.getElementById('admin-complaints-tbody');
  if (!tableBody) return;

  if (complaints.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <h4>No Complaints Found</h4>
            <p style="font-size:13px;">No complaints match your search or filter parameters.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = complaints.map(c => `
    <tr>
      <td>
        <div style="font-weight:600; color:var(--text-primary);">${escapeHTML(c.title)}</div>
        <div style="font-size:12px; color:var(--text-muted);">${escapeHTML(c.building)} - Rm ${escapeHTML(c.roomNumber || 'N/A')}</div>
      </td>
      <td>
        <div style="font-weight:500;">${escapeHTML(c.studentName || 'Student')}</div>
        <div style="font-size:11px; color:var(--text-muted);">${escapeHTML(c.studentEmail || '')}</div>
      </td>
      <td><span class="badge" style="background:#f1f5f9; color:#475569;">${escapeHTML(c.category)}</span></td>
      <td>
        <select class="form-select status-select-inline" data-id="${c.id}" style="padding: 4px 8px; font-size: 12px; font-weight:600; width:125px;">
          <option value="Pending" ${c.status === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
          <option value="In Progress" ${c.status === 'In Progress' ? 'selected' : ''}>⚡ In Progress</option>
          <option value="Resolved" ${c.status === 'Resolved' ? 'selected' : ''}>✓ Resolved</option>
          <option value="Rejected" ${c.status === 'Rejected' ? 'selected' : ''}>✕ Rejected</option>
        </select>
      </td>
      <td>
        <select class="form-select priority-select-inline" data-id="${c.id}" style="padding: 4px 8px; font-size: 12px; font-weight:600; width:110px;">
          <option value="Low" ${c.priority === 'Low' ? 'selected' : ''}>🌱 Low</option>
          <option value="Medium" ${c.priority === 'Medium' ? 'selected' : ''}>⚡ Medium</option>
          <option value="High" ${c.priority === 'High' ? 'selected' : ''}>🔥 High</option>
        </select>
      </td>
      <td style="font-size:12px; color:var(--text-secondary);">${formatDate(c.createdAt)}</td>
      <td>
        <div style="display:flex; gap:6px;">
          <a href="/complaint-details.html?id=${c.id}" class="btn btn-secondary btn-sm" title="View Details">View</a>
          <button class="btn btn-danger btn-sm admin-delete-btn" data-id="${c.id}" title="Delete Complaint">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  // Inline Status Change Event Listeners
  document.querySelectorAll('.status-select-inline').forEach(select => {
    select.addEventListener('change', async (e) => {
      const id = e.target.getAttribute('data-id');
      const newStatus = e.target.value;
      try {
        await updateDoc(doc(db, 'complaints', id), {
          status: newStatus,
          updatedAt: new Date().toISOString()
        });
        showToast(`Complaint status updated to ${newStatus}`, 'success');
      } catch (err) {
        showToast(`Failed to update status: ${err.message}`, 'error');
      }
    });
  });

  // Inline Priority Change Event Listeners
  document.querySelectorAll('.priority-select-inline').forEach(select => {
    select.addEventListener('change', async (e) => {
      const id = e.target.getAttribute('data-id');
      const newPriority = e.target.value;
      try {
        await updateDoc(doc(db, 'complaints', id), {
          priority: newPriority,
          updatedAt: new Date().toISOString()
        });
        showToast(`Priority updated to ${newPriority}`, 'success');
      } catch (err) {
        showToast(`Failed to update priority: ${err.message}`, 'error');
      }
    });
  });

  // Delete Event Listeners
  document.querySelectorAll('.admin-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      if (confirm('Admin Action: Are you sure you want to delete this complaint record permanently?')) {
        try {
          await deleteDoc(doc(db, 'complaints', id));
          showToast('Complaint removed successfully', 'success');
        } catch (err) {
          showToast(`Delete failed: ${err.message}`, 'error');
        }
      }
    });
  });
}
