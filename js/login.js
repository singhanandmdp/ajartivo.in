import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
    getAuth,
    signInWithPopup,
    GoogleAuthProvider,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {

    apiKey: "YOUR_API_KEY",
    authDomain: "ajartivo.firebaseapp.com",
    projectId: "ajartivo",
    storageBucket: "ajartivo.appspot.com",
    messagingSenderId: "185169143149",
    appId: "1:185169143149:web:xxxx"

};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const adminEmail = "anandsinghks2014@gmail.com";

document.getElementById("googleLogin").onclick = () => {

    signInWithPopup(auth, provider).then((result) => {

        const user = result.user;

        if (user.email === adminEmail) {

            window.location.href = "/admin/admin-dashboard.html";

        } else {

            window.location.href = "/pages/profile.html";

        }

    });

};

onAuthStateChanged(auth, (user) => {

    if (user) {

        if (user.email === adminEmail) {

            window.location.href = "/admin/admin-dashboard.html";

        } else {

            window.location.href = "/pages/profile.html";

        }

    }

});
