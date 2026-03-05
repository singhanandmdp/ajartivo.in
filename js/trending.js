// FIREBASE IMPORT
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

// FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyB7bZTUWQ1T7p6a_Z5NQPAUPJJTQFDyWMpc",
  authDomain: "ajartivo.firebaseapp.com",
  projectId: "ajartivo",
  storageBucket: "ajartivo.firebasestorage.app",
  messagingSenderId: "185169143149",
  appId: "1:185169143149:web:f2aa9c9dd6e537461a664",
  measurementId: "G-RC3WLTENN"
};

// INITIALIZE
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// LOAD DESIGNS
async function loadDesigns() {

  const grid = document.getElementById("trendingGrid");

  const querySnapshot = await getDocs(collection(db, "designs"));

  querySnapshot.forEach((doc) => {

    const data = doc.data();

    const card = `
    <a href="product.html?name=${data.title}&type=${data.category}" class="card-link">
        <div class="design-card">
            <img src="${data.image}">
            <div class="card-info">
                <h3>${data.title}</h3>
                <span class="file-type ${data.category.toLowerCase()}">${data.category}</span>
            </div>
        </div>
    </a>
    `;

    grid.innerHTML += card;

  });

}

loadDesigns();