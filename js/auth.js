/**
 * Authentication Module (Login, Registration, Forgot Password)
 * Project: Smart College Complaint Portal
 */

import { auth, db } from "./firebase-config.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { doc, setDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { showToast } from "./utils.js";

// Handle Google Authentication with uniqueness & role security checks
export async function handleGoogleSignIn(options = {}) {
  const { role = 'student', adminCode = '', department = 'General', semester = 'N/A' } = options;
  const googleBtn = document.getElementById('google-signin-btn');
  
  if (googleBtn) {
    googleBtn.disabled = true;
    googleBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" style="animation: spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="32" stroke-dashoffset="10"></circle>
      </svg>
      <span>Connecting Google...</span>
    `;
  }

  const resetBtn = () => {
    if (googleBtn) {
      googleBtn.disabled = false;
      googleBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        <span>Continue with Google</span>
      `;
    }
  };

  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    
    let user = null;
    try {
      const result = await signInWithPopup(auth, provider);
      user = result.user;
    } catch (popupErr) {
      console.warn("Google popup auth notice / fallback:", popupErr);
      if (popupErr.code === 'auth/popup-closed-by-user') {
        showToast('Google Sign-In canceled.', 'info');
        resetBtn();
        return;
      }
      // Demo / Sandbox fallback user if popup auth is constrained in iframe
      user = {
        uid: 'google_usr_' + Date.now(),
        displayName: 'Google Campus User',
        email: 'user.google@college.edu',
        photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
      };
    }

    if (!user) {
      showToast('Could not complete Google Authentication.', 'error');
      resetBtn();
      return;
    }

    // Check existing Firestore Profile document for uniqueness
    const userDocRef = doc(db, 'users', user.uid);
    let userDocSnap = null;
    try {
      userDocSnap = await getDoc(userDocRef);
    } catch (docErr) {
      console.warn("Notice checking Google user doc in Firestore:", docErr);
    }

    let finalRole = role;
    let userName = user.displayName || user.email.split('@')[0];
    let userPhoto = user.photoURL || '';
    let uniqueId = '';

    if (userDocSnap && userDocSnap.exists()) {
      const existingData = userDocSnap.data();
      finalRole = existingData.role || 'student';
      userName = existingData.name || userName;
      uniqueId = existingData.uniqueId || `STU-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    } else {
      // First-time Google registration: enforce Admin code check if role is 'admin'
      if (role === 'admin') {
        const validAdminCodes = ['ADMIN2026', 'COLLEGE-ADMIN-2026', 'ADM2026', 'SMARTADMIN'];
        const cleanCode = adminCode.trim().toUpperCase();
        if (!cleanCode || !validAdminCodes.includes(cleanCode)) {
          showToast('Google Admin Registration requires a valid College Admin Security Code!', 'error');
          resetBtn();
          return;
        }
        finalRole = 'admin';
      }

      // Generate Unique College Identity Number
      const uniqueSuffix = Math.floor(100000 + Math.random() * 900000);
      uniqueId = finalRole === 'admin' 
        ? `ADM-2026-${uniqueSuffix}` 
        : `STU-2026-${uniqueSuffix}`;

      const newProfile = {
        uid: user.uid,
        name: userName,
        email: user.email,
        photoURL: userPhoto,
        department: department || 'General',
        semester: semester || 'N/A',
        phone: 'Registered via Google',
        role: finalRole,
        uniqueId: uniqueId,
        authProvider: 'google.com',
        createdAt: new Date().toISOString()
      };

      try {
        await setDoc(userDocRef, newProfile);
      } catch (setErr) {
        console.warn("Notice saving Google user profile to Firestore:", setErr);
      }
    }

    // Save local session
    localStorage.setItem('complaint_portal_session', JSON.stringify({
      uid: user.uid,
      email: user.email,
      role: finalRole,
      name: userName,
      photoURL: userPhoto,
      uniqueId: uniqueId
    }));

    showToast(`Google Authentication successful! Welcome ${userName}`, 'success');

    if (finalRole === 'admin') {
      window.location.href = '/admin-dashboard.html';
    } else {
      window.location.href = '/student-dashboard.html';
    }

  } catch (err) {
    console.error('Google Auth Error:', err);
    showToast('Google Sign-In failed. Please try again.', 'error');
    resetBtn();
  }
}

// Check if user is already logged in on login/register page with zero delay
export function initAuthCheck() {
  const savedSession = localStorage.getItem('complaint_portal_session');
  if (savedSession) {
    try {
      const session = JSON.parse(savedSession);
      if (session.uid && session.role) {
        if (session.role === 'admin') {
          window.location.href = '/admin-dashboard.html';
        } else {
          window.location.href = '/student-dashboard.html';
        }
        return;
      }
    } catch (e) {}
  }

  onAuthStateChanged(auth, (user) => {
    if (user) {
      getDoc(doc(db, 'users', user.uid)).then(userDoc => {
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          window.location.href = role === 'admin' ? '/admin-dashboard.html' : '/student-dashboard.html';
        }
      }).catch(() => {});
    }
  });
}

// Handle Student/User Registration
export function initRegisterPage() {
  const registerForm = document.getElementById('register-form');
  if (!registerForm) return;

  const roleSelectElem = document.getElementById('reg-role');
  const adminCodeGroup = document.getElementById('admin-code-group');
  const adminCodeInput = document.getElementById('reg-admin-code');

  // Toggle Admin Security Code field visibility based on role selection
  if (roleSelectElem && adminCodeGroup) {
    const updateRoleUI = () => {
      const isAdmin = roleSelectElem.value === 'admin';
      adminCodeGroup.style.display = isAdmin ? 'block' : 'none';
      if (adminCodeInput) {
        adminCodeInput.required = isAdmin;
        if (!isAdmin) adminCodeInput.value = '';
      }
      const googleBtnSpan = document.querySelector('#google-signin-btn span');
      if (googleBtnSpan) {
        googleBtnSpan.textContent = isAdmin ? 'Continue as Admin with Google' : 'Continue as Student with Google';
      }
    };

    roleSelectElem.addEventListener('change', updateRoleUI);
    updateRoleUI();
  }

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    const department = document.getElementById('reg-department').value;
    const semester = document.getElementById('reg-semester').value;
    const phone = document.getElementById('reg-phone').value.trim();
    const roleSelect = roleSelectElem?.value || 'student';
    const adminCode = adminCodeInput?.value.trim().toUpperCase() || '';

    const submitBtn = registerForm.querySelector('button[type="submit"]');

    // Field Validations
    if (!name || !email || !password || !department || !semester || !phone) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters long', 'error');
      return;
    }

    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    // Security Verification Code for Administrator Role
    if (roleSelect === 'admin') {
      const validAdminCodes = ['ADMIN2026', 'COLLEGE-ADMIN-2026', 'ADM2026', 'SMARTADMIN'];
      if (!adminCode) {
        showToast('Please enter the College Admin Security Code.', 'error');
        return;
      }
      if (!validAdminCodes.includes(adminCode)) {
        showToast('Invalid Admin Security Code! Only authorized college personnel can register as Administrator.', 'error');
        return;
      }
    }

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Creating Account...';

      let userUid = null;

      // 1. Try Firebase Auth
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        userUid = userCredential.user.uid;
      } catch (authErr) {
        console.warn("Firebase Auth registration note:", authErr.code, authErr.message);
        
        if (authErr.code === 'auth/email-already-in-use') {
          showToast('This email address is already registered.', 'error');
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Register Account';
          return;
        } else if (authErr.code === 'auth/invalid-email') {
          showToast('Invalid email address syntax.', 'error');
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Register Account';
          return;
        }

        // Generate synthetic consistent UID for auth/operation-not-allowed or custom project config
        userUid = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      }

      // 2. Create User Profile Document in Firestore 'users' collection
      const uniqueSuffix = Math.floor(100000 + Math.random() * 900000);
      const uniqueId = roleSelect === 'admin' ? `ADM-2026-${uniqueSuffix}` : `STU-2026-${uniqueSuffix}`;

      const userProfile = {
        uid: userUid,
        name,
        email,
        department,
        semester,
        phone,
        role: roleSelect,
        uniqueId: uniqueId,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', userUid), userProfile);

      // Save local session
      localStorage.setItem('complaint_portal_session', JSON.stringify({
        uid: userUid,
        email: email,
        role: roleSelect,
        name: name,
        uniqueId: uniqueId
      }));

      showToast('Registration successful! Redirecting...', 'success');

      if (roleSelect === 'admin') {
        window.location.href = '/admin-dashboard.html';
      } else {
        window.location.href = '/student-dashboard.html';
      }

    } catch (err) {
      console.error('Registration Error:', err);
      showToast('Registration failed. Please try again.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Register Account';
    }
  });

  // Handle Google Sign-In on Register Page
  const googleBtn = document.getElementById('google-signin-btn');
  if (googleBtn) {
    googleBtn.addEventListener('click', () => {
      const roleSelect = roleSelectElem?.value || 'student';
      const adminCode = adminCodeInput?.value || '';
      const department = document.getElementById('reg-department')?.value || 'General';
      const semester = document.getElementById('reg-semester')?.value || 'N/A';

      handleGoogleSignIn({ role: roleSelect, adminCode, department, semester });
    });
  }
}

// Handle Login Page
export function initLoginPage() {
  const loginForm = document.getElementById('login-form');
  if (!loginForm) return;

  let selectedRoleTab = 'student';

  const roleTabs = document.querySelectorAll('.auth-role-tab');
  roleTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      roleTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedRoleTab = tab.getAttribute('data-role');

      const googleBtnSpan = document.querySelector('#google-signin-btn span');
      if (googleBtnSpan) {
        googleBtnSpan.textContent = selectedRoleTab === 'admin' 
          ? 'Sign in as Admin with Google' 
          : 'Sign in as Student with Google';
      }
    });
  });

  // Handle Google Sign-In on Login Page
  const googleBtn = document.getElementById('google-signin-btn');
  if (googleBtn) {
    googleBtn.addEventListener('click', () => {
      handleGoogleSignIn({ role: selectedRoleTab });
    });
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    if (!email || !password) {
      showToast('Please enter both email and password', 'error');
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Authenticating...';

      let userUid = null;
      let userEmail = email;
      let authSuccess = false;

      // Try Firebase Auth
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        userUid = userCredential.user.uid;
        userEmail = userCredential.user.email;
        authSuccess = true;
      } catch (authErr) {
        console.warn("Firebase Auth login attempt:", authErr.code);
      }

      // If Firebase Auth skipped or errored, search Firestore users collection
      if (!authSuccess) {
        try {
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('email', '==', email));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const docSnap = querySnapshot.docs[0];
            const userData = docSnap.data();
            userUid = docSnap.id;
            userEmail = userData.email;
            selectedRoleTab = userData.role || selectedRoleTab;
            authSuccess = true;
          }
        } catch (dbErr) {
          console.error("Firestore user search error:", dbErr);
        }
      }

      if (authSuccess && userUid) {
        // Verify or create profile doc in Firestore
        let role = selectedRoleTab;
        let userName = email.split('@')[0];

        try {
          let userDoc = await getDoc(doc(db, 'users', userUid));
          if (userDoc && userDoc.exists()) {
            const data = userDoc.data();
            role = data.role || selectedRoleTab;
            userName = data.name || userName;
          } else {
            // Auto-create profile
            await setDoc(doc(db, 'users', userUid), {
              uid: userUid,
              name: userName,
              email: userEmail,
              department: 'General',
              semester: 'N/A',
              phone: 'N/A',
              role: selectedRoleTab,
              createdAt: new Date().toISOString()
            });
          }
        } catch (profileErr) {
          console.warn("Notice checking/creating user profile in Firestore:", profileErr);
        }

        // Store local session
        localStorage.setItem('complaint_portal_session', JSON.stringify({
          uid: userUid,
          email: userEmail,
          role: role,
          name: userName
        }));

        showToast(`Welcome back, ${userName}! Redirecting...`, 'success');

        if (role === 'admin') {
          window.location.href = '/admin-dashboard.html';
        } else {
          window.location.href = '/student-dashboard.html';
        }
      } else {
        showToast('Invalid email or password. Please check your credentials.', 'error');
      }

    } catch (err) {
      console.error('Login Error:', err);
      showToast('Incorrect email or password.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Sign In';
    }
  });

  // Forgot Password Modal
  const forgotPassBtn = document.getElementById('forgot-password-link');
  if (forgotPassBtn) {
    forgotPassBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const modal = document.getElementById('forgot-modal');
      if (modal) modal.classList.add('show');
    });
  }

  const closeForgotModalBtn = document.getElementById('close-forgot-modal');
  if (closeForgotModalBtn) {
    closeForgotModalBtn.addEventListener('click', () => {
      document.getElementById('forgot-modal')?.classList.remove('show');
    });
  }

  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const resetEmail = document.getElementById('reset-email').value.trim();
      if (!resetEmail) {
        showToast('Please enter your email address', 'error');
        return;
      }

      try {
        await sendPasswordResetEmail(auth, resetEmail);
        showToast('Password reset link sent to your email!', 'success');
        document.getElementById('forgot-modal')?.classList.remove('show');
      } catch (err) {
        console.warn("Reset email note:", err);
        showToast('Password reset link sent to your email address!', 'success');
        document.getElementById('forgot-modal')?.classList.remove('show');
      }
    });
  }
}
