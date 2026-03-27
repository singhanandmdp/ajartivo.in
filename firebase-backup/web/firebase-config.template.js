import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

export const firebaseConfig = {
  apiKey: "AIzaSyB7bZTUWQI7p6a_Z5NQPAUPJJTQFDyWMpc",
  authDomain: "ajartivo.firebaseapp.com",
  projectId: "ajartivo",
  storageBucket: "ajartivo.firebasestorage.app",
  messagingSenderId: "185169143149",
  appId: "1:185169143149:web:f2aa9ac9dd6e537461a664",
  measurementId: "G-RC3WMLTENN"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const ADMIN_EMAIL = "anand2825@ajartivo.in";
