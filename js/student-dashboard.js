/**
 * Student Dashboard Module
 * Project: Smart College Complaint Portal
 */

import { db } from "./firebase-config.js";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  doc 
} from "firebase/firestore";
import { 
  requireAuth, 
  setupLayout, 
  showToast, 
  formatDate, 
  renderStatusBadge, 
  renderPriorityBadge, 
  escapeHTML 
} from "./utils.js";

export function initStudentDashboard() {
  requireAuth('student', (user, profile) => {
    setupLayout('student-dashboard', profile);

    const greetingHeading = document.getElementById('student-greeting');
    if (greetingHeading) {
      greetingHeading.textContent = `Welcome back, ${profile?.name || 'Student'}`;
    }

    // Subscribe to Firestore Complaints for logged-in user
    const complaintsRef = collection(db, 'complaints');
    const q = query(complaintsRef, where('userId', '==', user.uid));

    onSnapshot(q, (snapshot) => {
      const complaints = [];
      snapshot.forEach(docSnap => {
        complaints.push({ id: docSnap.id, ...docSnap.data() });
      });

      // Sort by createdAt descending
      complaints.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      updateDashboardStats(complaints);
      renderRecentComplaints(complaints.slice(0, 5));
    }, (error) => {
      console.error("Error listening to student complaints:", error);
      showToast("Failed to load complaints stream.", "error");
    });
  });
}

function updateDashboardStats(complaints) {
  const total = complaints.length;
  const pending = complaints.filter(c => (c.status || '').toLowerCase() === 'pending').length;
  const inProgress = complaints.filter(c => (c.status || '').toLowerCase().includes('progress')).length;
  const resolved = complaints.filter(c => (c.status || '').toLowerCase() === 'resolved').length;
  const rejected = complaints.filter(c => (c.status || '').toLowerCase() === 'rejected').length;

  const totalEl = document.getElementById('stat-total');
  if (totalEl) totalEl.textContent = total;
  const pendingEl = document.getElementById('stat-pending');
  if (pendingEl) pendingEl.textContent = pending;
  const resolvedEl = document.getElementById('stat-resolved');
  if (resolvedEl) resolvedEl.textContent = resolved;
  const rejectedEl = document.getElementById('stat-rejected');
  if (rejectedEl) rejectedEl.textContent = rejected;
}

function renderRecentComplaints(complaints) {
  const tableBody = document.getElementById('recent-complaints-tbody');
  if (!tableBody) return;

  if (complaints.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <h4>No Complaints Submitted Yet</h4>
            <p style="font-size:13px; margin-bottom: 12px;">Have an issue on campus? Report facility issues easily.</p>
            <a href="/submit-complaint.html" class="btn btn-primary btn-sm">Submit First Complaint</a>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = complaints.map(c => {
    const isPending = (c.status || 'Pending').toLowerCase() === 'pending';

    return `
      <tr>
        <td>
          <div style="font-weight: 600; color: var(--text-primary);">${escapeHTML(c.title)}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${escapeHTML(c.building)} - Rm ${escapeHTML(c.roomNumber || 'N/A')}</div>
        </td>
        <td><span class="badge" style="background:#f1f5f9; color:#475569;">${escapeHTML(c.category)}</span></td>
        <td>${renderPriorityBadge(c.priority)}</td>
        <td>${renderStatusBadge(c.status)}</td>
        <td style="font-size: 13px; color: var(--text-secondary);">${formatDate(c.createdAt)}</td>
        <td>
          <div style="display: flex; gap: 8px;">
            <a href="/complaint-details.html?id=${c.id}" class="btn btn-secondary btn-sm" title="View Details">View</a>
            ${isPending ? `
              <button class="btn btn-outline btn-sm delete-complaint-btn" data-id="${c.id}" title="Delete Complaint">Delete</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach delete handlers
  document.querySelectorAll('.delete-complaint-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const complaintId = e.target.getAttribute('data-id');
      if (confirm('Are you sure you want to delete this pending complaint?')) {
        try {
          await deleteDoc(doc(db, 'complaints', complaintId));
          showToast('Complaint deleted successfully', 'success');
        } catch (err) {
          showToast(`Delete failed: ${err.message}`, 'error');
        }
      }
    });
  });
}
