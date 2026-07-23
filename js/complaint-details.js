/**
 * Complaint Details Module
 * Project: Smart College Complaint Portal
 */

import { db } from "./firebase-config.js";
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { 
  requireAuth, 
  setupLayout, 
  showToast, 
  formatDate, 
  renderStatusBadge, 
  renderPriorityBadge, 
  escapeHTML,
  getLocalComplaints
} from "./utils.js";

export function initComplaintDetailsPage() {
  requireAuth(null, async (user, profile) => {
    setupLayout('complaint-details', profile);

    const urlParams = new URLSearchParams(window.location.search);
    const complaintId = urlParams.get('id');

    if (!complaintId) {
      showToast('No complaint ID specified', 'error');
      setTimeout(() => window.location.href = '/student-dashboard.html', 1500);
      return;
    }

    try {
      let complaint = null;
      try {
        const docRef = doc(db, 'complaints', complaintId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          complaint = { id: docSnap.id, ...docSnap.data() };
        }
      } catch (err) {
        console.warn("Notice fetching remote complaint doc:", err);
      }

      if (!complaint) {
        const localList = getLocalComplaints();
        complaint = localList.find(c => c.id === complaintId || c.complaintId === complaintId);
      }

      if (!complaint) {
        showToast('Complaint record not found', 'error');
        setTimeout(() => window.location.href = '/student-dashboard.html', 1500);
        return;
      }

      renderComplaintDetails(complaint, user, profile);

    } catch (err) {
      console.error('Error fetching complaint details:', err);
      showToast(`Failed to load details: ${err.message}`, 'error');
    }
  });
}

function renderComplaintDetails(item, currentUser, userProfile) {
  const container = document.getElementById('details-content');
  if (!container) return;

  const isAdmin = userProfile?.role === 'admin';
  const isOwner = item.userId === currentUser.uid;
  const isPending = (item.status || 'Pending').toLowerCase() === 'pending';

  const status = item.status || 'Pending';

  container.innerHTML = `
    <!-- Top Action Toolbar -->
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
      <a href="${isAdmin ? '/admin-dashboard.html' : '/my-complaints.html'}" class="btn btn-secondary btn-sm">
        <svg style="width:16px;height:16px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        Back to Dashboard
      </a>
      <div style="display:flex; gap:10px;">
        ${(isOwner && isPending) ? `
          <button class="btn btn-danger btn-sm" id="detail-delete-btn">Delete Complaint</button>
        ` : ''}
        ${isAdmin ? `
          <button class="btn btn-danger btn-sm" id="admin-detail-delete-btn">Delete Record</button>
        ` : ''}
      </div>
    </div>

    <!-- Main Grid -->
    <div class="grid-3">
      <!-- Main Info Panel -->
      <div style="grid-column: span 2;" class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 16px;">
          <div>
            <span class="badge" style="background:#f1f5f9; color:#475569; margin-bottom: 8px;">${escapeHTML(item.category)}</span>
            <h2 style="font-size:22px; font-weight:800; color:var(--text-primary); line-height:1.3;">${escapeHTML(item.title)}</h2>
          </div>
          <div>${renderStatusBadge(item.status)}</div>
        </div>

        <!-- Status Stepper -->
        <div class="status-stepper">
          <div class="status-step ${['pending', 'in progress', 'resolved'].includes(status.toLowerCase()) ? 'active' : ''}">
            <div class="step-bubble">1</div>
            <div class="step-label">Pending</div>
          </div>
          <div class="status-step ${['in progress', 'resolved'].includes(status.toLowerCase()) ? 'active' : ''}">
            <div class="step-bubble">2</div>
            <div class="step-label">In Progress</div>
          </div>
          <div class="status-step ${status.toLowerCase() === 'resolved' ? 'completed' : ''}">
            <div class="step-bubble">3</div>
            <div class="step-label">${status.toLowerCase() === 'rejected' ? 'Rejected' : 'Resolved'}</div>
          </div>
        </div>

        <hr style="border:none; border-top:1px solid var(--border-color); margin: 24px 0;" />

        <h3 style="font-size:15px; font-weight:700; margin-bottom: 8px;">Description</h3>
        <p style="font-size:14px; color:var(--text-secondary); line-height:1.6; white-space:pre-line; margin-bottom: 24px;">
          ${escapeHTML(item.description)}
        </p>

        ${item.imageUrl ? `
          <h3 style="font-size:15px; font-weight:700; margin-bottom: 12px;">Attachment Image</h3>
          <div style="max-width:340px; border-radius: var(--radius-md); overflow:hidden; border:1px solid var(--border-color);">
            <img src="${item.imageUrl}" id="enlarge-image" style="width:100%; height:auto; display:block; cursor:pointer;" alt="Complaint Photo" />
          </div>
          <span style="font-size:12px; color:var(--text-muted); display:block; margin-top:4px;">Click image to view full size</span>
        ` : ''}
      </div>

      <!-- Sidebar Metadata Panel -->
      <div class="card" style="align-self: flex-start;">
        <h3 style="font-size:16px; font-weight:700; margin-bottom: 16px; border-bottom:1px solid var(--border-color); padding-bottom:12px;">
          Facility Metadata
        </h3>

        <div style="display:flex; flex-direction:column; gap: 14px; font-size:14px;">
          <div>
            <div style="font-size:12px; color:var(--text-muted); font-weight:600;">BUILDING & ROOM</div>
            <div style="font-weight:600; color:var(--text-primary);">${escapeHTML(item.building)} - Room ${escapeHTML(item.roomNumber || 'N/A')}</div>
          </div>

          <div>
            <div style="font-size:12px; color:var(--text-muted); font-weight:600;">PRIORITY</div>
            <div style="margin-top:2px;">${renderPriorityBadge(item.priority)}</div>
          </div>

          <div>
            <div style="font-size:12px; color:var(--text-muted); font-weight:600;">REPORTED BY</div>
            <div style="font-weight:600; color:var(--text-primary);">${escapeHTML(item.studentName || 'Student')}</div>
            <div style="font-size:12px; color:var(--text-secondary);">${escapeHTML(item.studentEmail || '')}</div>
          </div>

          <div>
            <div style="font-size:12px; color:var(--text-muted); font-weight:600;">SUBMITTED ON</div>
            <div style="color:var(--text-primary);">${formatDate(item.createdAt)}</div>
          </div>

          <div>
            <div style="font-size:12px; color:var(--text-muted); font-weight:600;">LAST UPDATED</div>
            <div style="color:var(--text-primary);">${formatDate(item.updatedAt)}</div>
          </div>
        </div>

        ${isAdmin ? `
          <hr style="border:none; border-top:1px solid var(--border-color); margin: 20px 0;" />
          <h4 style="font-size:14px; font-weight:700; margin-bottom: 12px;">Admin Management</h4>
          
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label">Update Status</label>
            <select class="form-select" id="admin-detail-status">
              <option value="Pending" ${status === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
              <option value="In Progress" ${status === 'In Progress' ? 'selected' : ''}>⚡ In Progress</option>
              <option value="Resolved" ${status === 'Resolved' ? 'selected' : ''}>✓ Resolved</option>
              <option value="Rejected" ${status === 'Rejected' ? 'selected' : ''}>✕ Rejected</option>
            </select>
          </div>

          <div class="form-group" style="margin-bottom:16px;">
            <label class="form-label">Assign Priority</label>
            <select class="form-select" id="admin-detail-priority">
              <option value="Low" ${item.priority === 'Low' ? 'selected' : ''}>🌱 Low</option>
              <option value="Medium" ${item.priority === 'Medium' ? 'selected' : ''}>⚡ Medium</option>
              <option value="High" ${item.priority === 'High' ? 'selected' : ''}>🔥 High</option>
            </select>
          </div>

          <button class="btn btn-primary btn-sm" style="width:100%;" id="save-admin-changes-btn">Save Status & Priority</button>
        ` : ''}
      </div>
    </div>
  `;

  // Image Modal Handler
  document.getElementById('enlarge-image')?.addEventListener('click', () => {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';
    modal.innerHTML = `
      <div style="max-width:90vw; max-height:90vh; position:relative;">
        <img src="${item.imageUrl}" style="max-width:100%; max-height:85vh; border-radius:12px; display:block;" />
        <button style="position:absolute; top:-15px; right:-15px; background:#dc2626; color:white; border:none; border-radius:50%; width:32px; height:32px; font-size:18px; cursor:pointer;" id="close-img-modal">&times;</button>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('close-img-modal')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  });

  // Admin Save Changes Handler
  if (isAdmin) {
    document.getElementById('save-admin-changes-btn')?.addEventListener('click', async () => {
      const newStatus = document.getElementById('admin-detail-status').value;
      const newPriority = document.getElementById('admin-detail-priority').value;

      try {
        await updateDoc(doc(db, 'complaints', item.id), {
          status: newStatus,
          priority: newPriority,
          updatedAt: new Date().toISOString()
        });
        showToast('Complaint details updated successfully', 'success');
        window.location.reload();
      } catch (err) {
        showToast(`Update failed: ${err.message}`, 'error');
      }
    });

    document.getElementById('admin-detail-delete-btn')?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete this complaint record permanently?')) {
        try {
          await deleteDoc(doc(db, 'complaints', item.id));
          showToast('Complaint deleted', 'success');
          window.location.href = '/admin-dashboard.html';
        } catch (err) {
          showToast(`Delete failed: ${err.message}`, 'error');
        }
      }
    });
  }

  // Student Delete Handler
  if (isOwner && isPending) {
    document.getElementById('detail-delete-btn')?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete this pending complaint?')) {
        try {
          await deleteDoc(doc(db, 'complaints', item.id));
          showToast('Complaint deleted', 'success');
          window.location.href = '/my-complaints.html';
        } catch (err) {
          showToast(`Delete failed: ${err.message}`, 'error');
        }
      }
    });
  }
}
