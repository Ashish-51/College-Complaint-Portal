/**
 * Utility Functions & Helpers
 * Project: Smart College Complaint Portal
 */

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

/**
 * Display a floating toast alert
 */
export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Format timestamp or ISO string into a friendly date
 */
export function formatDate(dateVal) {
  if (!dateVal) return 'N/A';
  let d;
  if (typeof dateVal === 'string') {
    d = new Date(dateVal);
  } else if (dateVal.toDate) {
    d = dateVal.toDate();
  } else {
    d = new Date(dateVal);
  }

  if (isNaN(d.getTime())) return 'N/A';

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Escape HTML special chars to prevent XSS
 */
export function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Render HTML badge for complaint status
 */
export function renderStatusBadge(status) {
  const s = (status || 'Pending').toLowerCase();
  if (s.includes('progress')) return `<span class="badge badge-progress">⚡ In Progress</span>`;
  if (s.includes('resolved')) return `<span class="badge badge-resolved">✓ Resolved</span>`;
  if (s.includes('rejected')) return `<span class="badge badge-rejected">✕ Rejected</span>`;
  return `<span class="badge badge-pending">⏳ Pending</span>`;
}

/**
 * Render HTML badge for complaint priority
 */
export function renderPriorityBadge(priority) {
  const p = (priority || 'Low').toLowerCase();
  if (p === 'high') return `<span class="badge badge-high">🔥 High</span>`;
  if (p === 'medium') return `<span class="badge badge-medium">⚡ Medium</span>`;
  return `<span class="badge badge-low">🌱 Low</span>`;
}

/**
 * Convert file to compressed Base64 string for lightweight database storage
 */
export function fileToBase64(file, maxWidth = 800, quality = 0.75) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      resolve('');
      return;
    }

    // Failsafe timeout so processing never blocks submission
    const failsafeTimer = setTimeout(() => resolve(''), 1200);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        clearTimeout(failsafeTimer);
        try {
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxWidth) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxWidth) / height);
              height = maxWidth;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedBase64);
        } catch (err) {
          resolve(e.target?.result || '');
        }
      };
      img.onerror = () => {
        clearTimeout(failsafeTimer);
        resolve(e.target?.result || '');
      };
    };
    reader.onerror = () => {
      clearTimeout(failsafeTimer);
      resolve('');
    };
  });
}

/**
 * Fetch User Profile Document from Firestore with fast local cache fallback
 */
export async function fetchUserProfile(uid) {
  const savedSession = localStorage.getItem('complaint_portal_session');
  let cachedProfile = null;
  if (savedSession) {
    try {
      const session = JSON.parse(savedSession);
      if (!uid || session.uid === uid) {
        cachedProfile = session;
      }
    } catch (e) {}
  }

  // If local session exists, return it immediately to avoid network wait
  if (cachedProfile && cachedProfile.role) {
    // Optionally fetch background refresh
    getDoc(doc(db, 'users', uid)).then(docSnap => {
      if (docSnap.exists()) {
        const fresh = docSnap.data();
        localStorage.setItem('complaint_portal_session', JSON.stringify({
          ...cachedProfile,
          ...fresh
        }));
      }
    }).catch(() => {});
    return cachedProfile;
  }

  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const freshData = userDoc.data();
      localStorage.setItem('complaint_portal_session', JSON.stringify(freshData));
      return freshData;
    }
  } catch (err) {
    console.warn('Notice fetching user profile (offline or network issue):', err);
  }

  return cachedProfile || null;
}

/**
 * Global Route Authentication Guard
 * Ensures user is authenticated and has correct role with zero delay
 */
export function requireAuth(allowedRole = null, callback) {
  let processed = false;

  const verifyAndProceed = async (firebaseUser) => {
    if (processed) return;

    let uid = firebaseUser ? firebaseUser.uid : null;
    let email = firebaseUser ? firebaseUser.email : null;

    const savedSession = localStorage.getItem('complaint_portal_session');
    let localProfile = null;
    if (savedSession) {
      try {
        localProfile = JSON.parse(savedSession);
        if (!uid && localProfile.uid) {
          uid = localProfile.uid;
          email = localProfile.email;
        }
      } catch (e) {
        console.error("Error reading saved session:", e);
      }
    }

    if (!uid) {
      window.location.href = '/login.html';
      return;
    }

    processed = true;
    const profile = localProfile || await fetchUserProfile(uid);

    const userObj = {
      uid: uid,
      email: email || profile?.email || 'user@college.edu',
      metadata: firebaseUser?.metadata || { creationTime: profile?.createdAt || new Date().toISOString() }
    };

    if (allowedRole && profile && profile.role !== allowedRole) {
      showToast('Unauthorized access for your account role.', 'error');
      if (profile.role === 'admin') {
        window.location.href = '/admin-dashboard.html';
      } else {
        window.location.href = '/student-dashboard.html';
      }
      return;
    }

    if (callback) {
      callback(userObj, profile || { uid, name: 'User', role: allowedRole || 'student' });
    }
  };

  // Instant check using saved session if available
  const savedSession = localStorage.getItem('complaint_portal_session');
  if (savedSession) {
    try {
      const session = JSON.parse(savedSession);
      if (session.uid) {
        verifyAndProceed(null);
      }
    } catch (e) {}
  }

  if (!processed) {
    onAuthStateChanged(auth, (user) => {
      verifyAndProceed(user);
    });

    setTimeout(() => {
      if (!processed) {
        verifyAndProceed(auth.currentUser);
      }
    }, 100);
  }
}

/**
 * Fast Logout utility - Instant redirect and async Firebase signout
 */
export function handleLogout() {
  localStorage.removeItem('complaint_portal_session');
  try {
    signOut(auth).catch(() => {});
  } catch (e) {}
  window.location.href = '/login.html';
}

/**
 * Render standard layout components (Sidebar, Top Navbar)
 */
export function setupLayout(activePage, userProfile) {
  const role = userProfile?.role || 'student';
  const name = userProfile?.name || 'User';
  const email = userProfile?.email || '';

  // Render Sidebar if container exists
  const sidebarContainer = document.getElementById('sidebar-container');
  if (sidebarContainer) {
    const isAdmin = role === 'admin';
    const navItems = isAdmin ? [
      { id: 'admin-dashboard', label: 'Admin Dashboard', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>', href: '/admin-dashboard.html' },
      { id: 'all-complaints', label: 'Manage Complaints', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>', href: '/admin-dashboard.html#complaints' },
      { id: 'profile', label: 'My Profile', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>', href: '/profile.html' }
    ] : [
      { id: 'student-dashboard', label: 'Dashboard', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>', href: '/student-dashboard.html' },
      { id: 'submit-complaint', label: 'Submit Complaint', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>', href: '/submit-complaint.html' },
      { id: 'my-complaints', label: 'My Complaints', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>', href: '/my-complaints.html' },
      { id: 'profile', label: 'Profile', icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>', href: '/profile.html' }
    ];

    sidebarContainer.innerHTML = `
      <aside class="sidebar" id="app-sidebar">
        <div class="sidebar-header">
          <div class="brand-icon">C</div>
          <div>
            <div class="brand-title">Smart College</div>
            <div class="brand-subtitle">Complaint Portal</div>
          </div>
        </div>
        <nav class="sidebar-nav">
          <div class="nav-section-title">Navigation</div>
          ${navItems.map(item => `
            <a href="${item.href}" class="nav-item ${activePage === item.id ? 'active' : ''}">
              ${item.icon}
              <span>${item.label}</span>
            </a>
          `).join('')}
        </nav>
        <div class="sidebar-footer">
          <div class="user-mini-profile">
            <div class="avatar">${name.charAt(0).toUpperCase()}</div>
            <div class="user-info">
              <div class="user-name">${escapeHTML(name)}</div>
              <div class="user-role-badge">${role} • ${userProfile?.department || 'College'}</div>
            </div>
          </div>
        </div>
      </aside>
    `;
  }

  // Setup Top Navbar
  const topNavContainer = document.getElementById('top-navbar-container');
  if (topNavContainer) {
    topNavContainer.innerHTML = `
      <header class="top-navbar">
        <div style="display: flex; align-items: center; gap: 12px;">
          <button class="mobile-nav-toggle" id="mobile-sidebar-toggle" aria-label="Toggle Navigation">
            <svg style="width:24px;height:24px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <h1 class="page-heading" id="page-heading-text">Smart Portal</h1>
        </div>
        <div class="top-navbar-actions">
          <button class="btn btn-secondary btn-sm" id="global-logout-btn">
            <svg style="width:16px;height:16px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
            Logout
          </button>
        </div>
      </header>
    `;

    document.getElementById('global-logout-btn')?.addEventListener('click', handleLogout);

    const toggleBtn = document.getElementById('mobile-sidebar-toggle');
    const sidebar = document.getElementById('app-sidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });
    }
  }
}

/**
 * Local Complaint Cache Helpers
 */
export function getLocalComplaints() {
  try {
    const data = localStorage.getItem('local_submitted_complaints');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

export function saveLocalComplaint(complaint) {
  try {
    const existing = getLocalComplaints();
    const updated = [complaint, ...existing.filter(c => c.id !== complaint.id && c.complaintId !== complaint.complaintId)];
    localStorage.setItem('local_submitted_complaints', JSON.stringify(updated.slice(0, 100)));
  } catch (e) {}
}

export function mergeComplaints(remoteList) {
  const localList = getLocalComplaints();
  const map = new Map();

  // First add remote complaints
  remoteList.forEach(item => {
    const id = item.id || item.complaintId;
    if (id) map.set(id, item);
  });

  // Then merge local complaints if not already in remote
  localList.forEach(item => {
    const id = item.id || item.complaintId;
    if (id && !map.has(id)) {
      map.set(id, item);
    }
  });

  const merged = Array.from(map.values());
  merged.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return merged;
}

export function filterUserComplaints(complaints, user, profile) {
  const userUids = [user?.uid, profile?.uid].filter(Boolean);
  const userEmails = [user?.email, profile?.email].filter(e => Boolean(e)).map(e => e.toLowerCase());

  return complaints.filter(c => {
    if (!c) return false;
    if (c.userId && userUids.includes(c.userId)) return true;
    if (c.studentEmail && userEmails.includes(c.studentEmail.toLowerCase())) return true;
    if (!c.userId && !c.studentEmail) return true;
    return false;
  });
}
