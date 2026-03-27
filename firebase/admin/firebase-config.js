import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  getDocs,
  addDoc,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB7bZTUWQI7p6a_Z5NQPAUPJJTQFDyWMpc",
  authDomain: "ajartivo.firebaseapp.com",
  projectId: "ajartivo",
  storageBucket: "ajartivo.firebasestorage.app",
  messagingSenderId: "185169143149",
  appId: "1:185169143149:web:f2aa9ac9dd6e537461a664",
  measurementId: "G-RC3WMLTENN"
};

export const ADMIN_EMAIL = "anand2825@ajartivo.in";
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

function normalizeFromFirestore(snapshot) {
  const data = snapshot.data() || {};
  const createdAt =
    data.createdAt && typeof data.createdAt.toDate === "function"
      ? data.createdAt.toDate().toISOString()
      : data.createdAt || new Date().toISOString();

  const extraImages = Array.isArray(data.extraImages)
    ? data.extraImages
    : Array.isArray(data.gallery)
    ? data.gallery
    : [];

  return {
    id: snapshot.id,
    name: data.name || data.title || "Untitled Design",
    title: data.title || data.name || "Untitled Design",
    category: data.category || "Other",
    paymentMode:
      data.paymentMode ||
      (Number(data.price ?? data.Price ?? 0) === 0 ? "free" : "paid"),
    price: Number(data.price ?? data.Price ?? 0),
    Price: Number(data.Price ?? data.price ?? 0),
    description: data.description || "",
    previewUrl: data.previewUrl || data.image || "",
    image: data.image || data.previewUrl || "",
    downloadUrl: data.downloadUrl || data.download || "",
    download: data.download || data.downloadUrl || "",
    extraImages: extraImages.filter(Boolean),
    gallery: extraImages.filter(Boolean),
    tags: Array.isArray(data.tags) ? data.tags : [],
    downloadCount: Number(data.downloadCount || 0),
    createdAt: createdAt
  };
}

function normalizePaymentStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "paid") {
    return "Paid";
  }
  if (value === "pending") {
    return "Pending";
  }
  if (value === "failed") {
    return "Failed";
  }
  return "Pending";
}

function normalizePaymentFromFirestore(snapshot) {
  const data = snapshot.data() || {};
  const createdAt =
    data.createdAt && typeof data.createdAt.toDate === "function"
      ? data.createdAt.toDate().toISOString()
      : data.createdAt || new Date().toISOString();

  return {
    id: snapshot.id,
    payer: String(data.payer || "").trim(),
    designId: String(data.designId || "").trim(),
    designName: String(data.designName || "Manual").trim(),
    quantity: Math.max(1, Number(data.quantity || 1)),
    amount: Number(data.amount || 0),
    method: String(data.method || "UPI").trim(),
    status: normalizePaymentStatus(data.status),
    createdAt: createdAt
  };
}

function mapToFirestore(payload) {
  const cleanName = String(payload.name || payload.title || "").trim();
  const cleanDescription = String(payload.description || "").trim();
  const cleanDownload = String(payload.downloadUrl || payload.download || "").trim();
  const cleanPreview = String(payload.previewUrl || payload.image || "").trim();
  const cleanCategory = String(payload.category || "Other").trim();
  const paymentMode =
    String(payload.paymentMode || "").toLowerCase() === "free" ? "free" : "paid";
  const price = Number(payload.price ?? payload.Price ?? 0);
  const extraImages = Array.isArray(payload.extraImages)
    ? payload.extraImages.filter(Boolean)
    : Array.isArray(payload.gallery)
    ? payload.gallery.filter(Boolean)
    : [];
  const tags = cleanName
    ? cleanName
        .toLowerCase()
        .split(" ")
        .filter(Boolean)
        .slice(0, 4)
    : [];
  const downloadCount = Number(payload.downloadCount || 0);

  return {
    title: cleanName,
    name: cleanName,
    category: cleanCategory,
    paymentMode: paymentMode,
    price: price,
    Price: price,
    description: cleanDescription,
    download: cleanDownload,
    downloadUrl: cleanDownload,
    image: cleanPreview,
    previewUrl: cleanPreview,
    extraImages: extraImages,
    gallery: extraImages,
    tags: tags,
    downloadCount: downloadCount,
    createdAt: serverTimestamp()
  };
}

function mapToFirestoreForUpdate(payload) {
  const mapped = mapToFirestore(payload);
  delete mapped.createdAt;
  mapped.updatedAt = serverTimestamp();
  return mapped;
}

function mapPaymentToFirestore(payload) {
  return {
    payer: String(payload.payer || "").trim(),
    designId: String(payload.designId || "").trim(),
    designName: String(payload.designName || "Manual").trim(),
    quantity: Math.max(1, Number(payload.quantity || 1)),
    amount: Number(payload.amount || 0),
    method: String(payload.method || "UPI").trim(),
    status: normalizePaymentStatus(payload.status),
    createdAt: serverTimestamp()
  };
}

const AjartivoFirebase = {
  connected: true,
  async getDesigns() {
    const snapshot = await getDocs(query(collection(db, "designs"), orderBy("createdAt", "desc")));
    return snapshot.docs.map(normalizeFromFirestore);
  },
  async addDesign(payload) {
    const docRef = await addDoc(collection(db, "designs"), mapToFirestore(payload));
    const freshDoc = await getDoc(doc(db, "designs", docRef.id));
    return normalizeFromFirestore(freshDoc);
  },
  async updateDesign(id, payload) {
    const ref = doc(db, "designs", id);
    await setDoc(ref, mapToFirestoreForUpdate(payload), { merge: true });
    const freshDoc = await getDoc(ref);
    return normalizeFromFirestore(freshDoc);
  },
  async deleteDesign(id) {
    await deleteDoc(doc(db, "designs", id));
  },
  async incrementDesignDownloads(id, quantity) {
    const ref = doc(db, "designs", id);
    await updateDoc(ref, {
      downloadCount: increment(Math.max(1, Number(quantity || 1))),
      updatedAt: serverTimestamp()
    });
  },
  async getPayments() {
    const snapshot = await getDocs(query(collection(db, "payments"), orderBy("createdAt", "desc")));
    return snapshot.docs.map(normalizePaymentFromFirestore);
  },
  async addPayment(payload) {
    const docRef = await addDoc(collection(db, "payments"), mapPaymentToFirestore(payload));
    const freshDoc = await getDoc(doc(db, "payments", docRef.id));
    return normalizePaymentFromFirestore(freshDoc);
  }
};

window.AjartivoFirebase = AjartivoFirebase;
window.AjartivoAuthCore = { auth: auth, ADMIN_EMAIL: ADMIN_EMAIL };
