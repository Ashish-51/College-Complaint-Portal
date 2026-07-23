/**
 * Complaint Submission Module
 * Project: Smart College Complaint Portal
 */

import { db, storage } from "./firebase-config.js";
import { collection, doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { requireAuth, setupLayout, showToast, fileToBase64, saveLocalComplaint } from "./utils.js";

export function initSubmitComplaintPage() {
  requireAuth('student', (user, profile) => {
    setupLayout('submit-complaint', profile);

    const form = document.getElementById('complaint-form');
    if (!form) return;

    const fileInput = document.getElementById('complaint-image');
    const dropzone = document.getElementById('image-dropzone');
    const previewContainer = document.getElementById('image-preview-container');
    let selectedFile = null;

    // Drag and drop handlers
    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });

      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleFileSelect(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          handleFileSelect(e.target.files[0]);
        }
      });
    }

    function handleFileSelect(file) {
      // Validate File Size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        showToast('Image file size must not exceed 5MB', 'error');
        return;
      }

      // Validate File Type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(file.type)) {
        showToast('Only JPG, JPEG, and PNG images are allowed', 'error');
        return;
      }

      selectedFile = file;

      // Show Live Preview
      const reader = new FileReader();
      reader.onload = (e) => {
        previewContainer.innerHTML = `
          <div class="image-preview-wrapper">
            <img src="${e.target.result}" class="image-preview" alt="Preview" />
            <button type="button" class="remove-image-btn" id="clear-image-btn">&times;</button>
          </div>
        `;

        document.getElementById('clear-image-btn')?.addEventListener('click', () => {
          selectedFile = null;
          if (fileInput) fileInput.value = '';
          previewContainer.innerHTML = '';
        });
      };
      reader.readAsDataURL(file);
    }

    // Form Submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const title = document.getElementById('complaint-title').value.trim();
      const category = document.getElementById('complaint-category').value;
      const building = document.getElementById('complaint-building').value;
      const roomNumber = document.getElementById('complaint-room').value.trim();
      const priority = document.getElementById('complaint-priority').value;
      const description = document.getElementById('complaint-description').value.trim();

      const submitBtn = form.querySelector('button[type="submit"]');

      // Validations
      if (!title || !category || !building || !priority || !description) {
        showToast('Please complete all required fields', 'error');
        return;
      }

      if (title.length < 5) {
        showToast('Title must be at least 5 characters long', 'error');
        return;
      }

      if (description.length < 15) {
        showToast('Description must be at least 15 characters long', 'error');
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Submitting Complaint...';

        let imageUrl = '';

        // Handle Image Upload with instant compressed base64
        if (selectedFile) {
          try {
            imageUrl = await fileToBase64(selectedFile, 800, 0.75);
          } catch (storageErr) {
            console.warn('Image processing note:', storageErr);
          }
        }

        const now = new Date().toISOString();
        const complaintDocRef = doc(collection(db, 'complaints'));

        const complaintData = {
          id: complaintDocRef.id,
          complaintId: complaintDocRef.id,
          title,
          category,
          building,
          roomNumber,
          priority,
          description,
          status: 'Pending',
          imageUrl: imageUrl || '',
          userId: user.uid,
          studentName: profile?.name || 'Student',
          studentEmail: profile?.email || user.email,
          createdAt: now,
          updatedAt: now
        };

        // Immediately save locally so UI never loses it
        saveLocalComplaint(complaintData);

        // Async write to Firestore without blocking navigation
        setDoc(complaintDocRef, complaintData).catch((setErr) => {
          console.warn('Background Firestore write notice:', setErr);
        });

        showToast('Complaint submitted successfully!', 'success');

        // Immediate redirect without delay
        window.location.href = '/my-complaints.html';

      } catch (err) {
        console.error('Submission error:', err);
        showToast(`Failed to submit complaint: ${err.message || 'Network issue'}`, 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Submit Complaint';
      }
    });
  });
}
