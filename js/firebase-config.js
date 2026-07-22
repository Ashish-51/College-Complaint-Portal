/**
 * Firebase Configuration and Initialization Module
 * Project: Smart College Complaint Portal
 */

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  projectId: "gen-lang-client-0159838804",
  appId: "1:410910445234:web:ca93b135b31b12821043ab",
  apiKey: "AIzaSyAMTnalofFSg2UQNlbeiacbWkInSyYpuf4",
  authDomain: "gen-lang-client-0159838804.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-smartcollegecomp-39ede956-8a65-4286-bde0-508a69f495ef",
  storageBucket: "gen-lang-client-0159838804.firebasestorage.app",
  messagingSenderId: "410910445234"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Authentication
export const auth = getAuth(app);

// Initialize Firestore (handling custom database ID if provisioned)
let dbInstance;
try {
  if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
    dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } else {
    dbInstance = getFirestore(app);
  }
} catch (e) {
  console.warn("Fallback to default Firestore database", e);
  dbInstance = getFirestore(app);
}

export const db = dbInstance;

// Initialize Storage
export const storage = getStorage(app);
export default app;
