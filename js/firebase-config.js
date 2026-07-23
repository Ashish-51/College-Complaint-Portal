/**
 * Firebase Configuration and Initialization Module
 * Project: Smart College Complaint Portal
 */

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

import firebaseAppletConfig from "../firebase-applet-config.json";

const firebaseConfig = firebaseAppletConfig;

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Authentication
export const auth = getAuth(app);

// Initialize Firestore
let dbInstance;
try {
  if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
    dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } else {
    dbInstance = getFirestore(app);
  }
} catch (e) {
  console.warn("Using default Firestore instance", e);
  dbInstance = getFirestore(app);
}

export const db = dbInstance;

// Initialize Storage
export const storage = getStorage(app);
export default app;
