/**
 * My Complaints Module
 * Project: Smart College Complaint Portal
 */

import { db } from "./firebase-config.js";
import { 
  collection, 
  query, 
  where, 
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
  mergeComplaints,
  filterUserComplaints
} from "./utils.js";

let studentComplaintsData = [];
let activeEditId = null;

export function initMyComplaintsPage() {
  requireAuth('student', (user, profile) => {
    setupLayout('my-complaints', profile);

    const processComplaints = (remoteList = []) => {
      const merged = mergeComplaints(remoteList);
      studentComplaintsData = filterUserComplaints(merged, user, profile);
      applyStudentFiltersAndRender();
    };

    // Render local complaints immediately
    processComplaints([]);

    const complaintsRef = collection(db, 'complaints');
    onSnapshot(complaintsRef, (snapshot) => {
      const remoteList = [];
      snapshot.forEach(docSnap => {
        remoteList.push({ id: docSnap.id, ...docSnap.data() });
      });

      processComplaints(remoteList);
    }, (err) => {
      console.warn("Notice loading complaints:", err);
      processComplaints([]);
    });

    setupFilterListeners();
    setupEditModal();
  });
}

function setupFilterListeners() {
  const searchInput = document.getElementById('student-search');
  const catFilter = document.getElementById('student-filter-category');
  const statusFilter = document.getElementById('student-filter-status');
  const priorityFilter = document.getElementById('student-filter-priority');

  const handler = () => applyStudentFiltersAndRender();

  searchInput?.addEventListener('input', handler);
  catFilter?.addEventListener('change', handler);
  statusFilter?.addEventListener('change', handler);
  priorityFilter?.addEventListener('change', handler);
}

function applyStudentFiltersAndRender() {
  const queryText = (document.getElementById('student-search')?.value || '').toLowerCase().trim();
  const selectedCat = document.getElementById('student-filter-category')?.value || 'all';
  const selectedStatus = document.getElementById('student-filter-status')?.value || 'all';
  const selectedPriority = document.getElementById('student-filter-priority')?.value || 'all';

  let filtered = studentComplaintsData.filter(c => {
    const titleMatch = (c.title || '').toLowerCase().includes(queryText);
    const descMatch = (c.description || '').toLowerCase().includes(queryText);
    const catSearchMatch = (c.category || '').toLowerCase().includes(queryText);
    const matchesSearch = !queryText || titleMatch || descMatch || catSearchMatch;

    const matchesCat = selectedCat === 'all' || (c.category || '') === selectedCat;
    const matchesStatus = selectedStatus === 'all' || (c.status || '') === selectedStatus;
    const matchesPriority = selectedPriority === 'all' || (c.priority || '') === selectedPriority;

    return matchesSearch && matchesCat && matchesStatus && matchesPriority;
  });

  renderTable(filtered);
}

function renderTable(complaints) {
  const tableBody = document.getElementById('my-complaints-tbody');
  if (!tableBody) return;

  if (complaints.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <h4>No Complaints Found</h4>
            <p style="font-size:13px; margin-bottom: 12px;">You haven't submitted any complaints matching these filters.</p>
            <a href="/submit-complaint.html" class="btn btn-primary btn-sm">Submit New Complaint</a>
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
            <a href="/complaint-details.html?id=${c.id}" class="btn btn-secondary btn-sm" title="View Details">Details</a>
            ${isPending ? `
              <button class="btn btn-outline btn-sm edit-btn" data-id="${c.id}">Edit</button>
              <button class="btn btn-danger btn-sm delete-btn" data-id="${c.id}">Delete</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Attach event handlers
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      openEditModal(id);
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      if (confirm('Are you sure you want to delete this pending complaint?')) {
        try {
          await deleteDoc(doc(db, 'complaints', id));
          showToast('Complaint deleted successfully', 'success');
        } catch (err) {
          showToast(`Delete failed: ${err.message}`, 'error');
        }
      }
    });
  });
}

function openEditModal(complaintId) {
  const item = studentComplaintsData.find(c => c.id === complaintId);
  if (!item) return;

  activeEditId = complaintId;

  document.getElementById('edit-title').value = item.title || '';
  document.getElementById('edit-category').value = item.category || 'Classroom';
  document.getElementById('edit-building').value = item.building || 'Main Block';
  document.getElementById('edit-room').value = item.roomNumber || '';
  document.getElementById('edit-priority').value = item.priority || 'Low';
  document.getElementById('edit-description').value = item.description || '';

  const modal = document.getElementById('edit-modal');
  if (modal) modal.classList.add('show');
}

function setupEditModal() {
  const modal = document.getElementById('edit-modal');
  const closeBtn = document.getElementById('close-edit-modal');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  const editForm = document.getElementById('edit-complaint-form');

  closeBtn?.addEventListener('click', () => modal?.classList.remove('show'));
  cancelBtn?.addEventListener('click', () => modal?.classList.remove('show'));

  editForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeEditId) return;

    const title = document.getElementById('edit-title').value.trim();
    const category = document.getElementById('edit-category').value;
    const building = document.getElementById('edit-building').value;
    const roomNumber = document.getElementById('edit-room').value.trim();
    const priority = document.getElementById('edit-priority').value;
    const description = document.getElementById('edit-description').value.trim();

    if (!title || title.length < 5) {
      showToast('Title must be at least 5 characters long', 'error');
      return;
    }

    if (!description || description.length < 15) {
      showToast('Description must be at least 15 characters long', 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'complaints', activeEditId), {
        title,
        category,
        building,
        roomNumber,
        priority,
        description,
        updatedAt: new Date().toISOString()
      });

      showToast('Complaint updated successfully', 'success');
      modal?.classList.remove('show');
    } catch (err) {
      showToast(`Update failed: ${err.message}`, 'error');
    }
  });
}
