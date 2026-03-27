(function () {
    // Central Firebase initialization file for production pages (index/product).
    const firebaseConfig = {
        apiKey: "AIzaSyB7bZTUWQI7p6a_Z5NQPAUPJJTQFDyWMpc",
        authDomain: "ajartivo.firebaseapp.com",
        projectId: "ajartivo",
        storageBucket: "ajartivo.firebasestorage.app",
        messagingSenderId: "185169143149",
        appId: "1:185169143149:web:f2aa9ac9dd6e537461a664"
    };

    if (typeof firebase === "undefined") {
        console.error("Firebase SDK is not loaded.");
        return;
    }

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    const app = firebase.app();
    const auth = firebase.auth();
    const db = firebase.firestore();
    const storage = firebase.storage();

    // Shared service object consumed by auth, payment, and design scripts.
    window.AjArtivoFirebase = {
        app: app,
        auth: auth,
        db: db,
        storage: storage,
        config: firebaseConfig,
        timestamp: firebase.firestore.FieldValue.serverTimestamp,
        increment: firebase.firestore.FieldValue.increment
    };
})();
