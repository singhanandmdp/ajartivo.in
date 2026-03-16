import { getAuth, onAuthStateChanged }
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const auth = getAuth();

const adminEmail = "anandsinghks2014@gmail.com";

onAuthStateChanged(auth, (user) => {

    if (user) {

        if (user.email !== adminEmail) {

            window.location.href = "/pages/profile.html";

        }

    } else {

        window.location.href = "/login.html";

    }

});
