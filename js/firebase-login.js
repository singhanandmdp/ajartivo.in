// 1. Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyB7bZTUWQI7p6a_Z5NQPAUPJJTQFDyWMpc",
  authDomain: "ajartivo.firebaseapp.com",
  projectId: "ajartivo",
  storageBucket: "ajartivo.firebasestorage.app",
  messagingSenderId: "185169143149",
  appId: "1:185169143149:web:f2aa9ac9dd6e537461a664",
  measurementId: "G-RC3VWLTENN"
};

// 2. Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();


// 3. Helper Function
const handleAuthResponse = (promise) => {

    promise
    .then(() => {

        window.location.href = "index.html";

    })
    .catch((error) => {

        console.error("Auth Error:", error.code);
        alert(error.message);

    });

};



// ===========================
// EMAIL LOGIN
// ===========================

const loginBtn = document.getElementById("loginBtn");

if(loginBtn){

loginBtn.addEventListener("click", () => {

    const email = document.getElementById("email")?.value;
    const password = document.getElementById("password")?.value;

    if (!email || !password) {

        alert("Please enter both email and password.");
        return;

    }

    handleAuthResponse(
        auth.signInWithEmailAndPassword(email, password)
    );

});

}



// ===========================
// GOOGLE LOGIN
// ===========================

const googleBtn = document.getElementById("googleLogin");

if(googleBtn){

googleBtn.addEventListener("click", () => {

    const provider = new firebase.auth.GoogleAuthProvider();

    handleAuthResponse(
        auth.signInWithPopup(provider)
    );

});

}



// ===========================
// FACEBOOK LOGIN
// ===========================

const facebookBtn = document.getElementById("facebookLogin");

if(facebookBtn){

facebookBtn.addEventListener("click", () => {

    const provider = new firebase.auth.FacebookAuthProvider();

    handleAuthResponse(
        auth.signInWithPopup(provider)
    );

});

}