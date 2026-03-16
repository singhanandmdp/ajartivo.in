(function () {
    const services = window.AjArtivoFirebase;
    if (!services) return;

    const { auth } = services;
    const adminEmail = "anandsinghks2014@gmail.com";

    window.AjArtivoAuth = {
        adminEmail,
        isAdminEmail(email) {
            return String(email || "").toLowerCase() === adminEmail.toLowerCase();
        },
        redirectAfterLogin(user) {
            if (!user) return;
            window.location.href = this.isAdminEmail(user.email) ? "/admin/admin-dashboard.html" : "/pages/profile.html";
        }
    };

    bindEmailLogin();
    bindSocialLogin();
    bindSignup();
    bindLogout();
    redirectLoggedInAuthPages();
    protectAdminPages();

    function bindEmailLogin() {
        const loginBtn = document.getElementById("loginBtn");
        if (!loginBtn) return;

        loginBtn.addEventListener("click", function () {
            const email = document.getElementById("email")?.value.trim();
            const password = document.getElementById("password")?.value;

            if (!email || !password) {
                alert("Please enter both email and password.");
                return;
            }

            auth.signInWithEmailAndPassword(email, password)
                .then(function (credential) {
                    window.AjArtivoAuth.redirectAfterLogin(credential.user);
                })
                .catch(function (error) {
                    console.error("Login error:", error);
                    alert(error.message);
                });
        });
    }

    function bindSocialLogin() {
        const googleBtn = document.getElementById("googleLogin") || document.querySelector(".google-btn");
        const facebookBtn = document.getElementById("facebookLogin");

        if (googleBtn) {
            googleBtn.addEventListener("click", function () {
                const provider = new firebase.auth.GoogleAuthProvider();
                auth.signInWithPopup(provider)
                    .then(function (result) {
                        window.AjArtivoAuth.redirectAfterLogin(result.user);
                    })
                    .catch(function (error) {
                        console.error("Google login error:", error);
                        alert(error.message);
                    });
            });
        }

        if (facebookBtn) {
            facebookBtn.addEventListener("click", function () {
                const provider = new firebase.auth.FacebookAuthProvider();
                auth.signInWithPopup(provider)
                    .then(function (result) {
                        window.AjArtivoAuth.redirectAfterLogin(result.user);
                    })
                    .catch(function (error) {
                        console.error("Facebook login error:", error);
                        alert(error.message);
                    });
            });
        }
    }

    function bindSignup() {
        const signupForm = document.getElementById("signupForm");
        if (!signupForm) return;

        signupForm.addEventListener("submit", function (event) {
            event.preventDefault();

            const fullname = document.getElementById("fullname")?.value.trim();
            const email = document.getElementById("email")?.value.trim();
            const password = document.getElementById("password")?.value;

            if (!fullname || !email || !password) {
                alert("Please fill all fields.");
                return;
            }

            auth.createUserWithEmailAndPassword(email, password)
                .then(function (credential) {
                    return credential.user.updateProfile({
                        displayName: fullname
                    });
                })
                .then(function () {
                    alert("Account created successfully.");
                    window.location.href = "/login.html";
                })
                .catch(function (error) {
                    console.error("Signup error:", error);
                    alert(error.message);
                });
        });
    }

    function bindLogout() {
        document.addEventListener("click", function (event) {
            const target = event.target;
            if (!target) return;

            const logoutIds = ["logoutBtn", "sidebarLogout", "logout"];
            if (!logoutIds.includes(target.id)) return;

            auth.signOut()
                .then(function () {
                    window.location.href = "/login.html";
                })
                .catch(function (error) {
                    console.error("Logout error:", error);
                });
        });
    }

    function redirectLoggedInAuthPages() {
        const isAuthPage = /\/(login|signup)\.html$/i.test(window.location.pathname);
        if (!isAuthPage) return;

        auth.onAuthStateChanged(function (user) {
            if (user) {
                window.AjArtivoAuth.redirectAfterLogin(user);
            }
        });
    }

    function protectAdminPages() {
        const isAdminPage = document.body?.dataset?.adminPage === "true";
        if (!isAdminPage) return;

        auth.onAuthStateChanged(function (user) {
            if (!user) {
                window.location.href = "/login.html";
                return;
            }

            if (!window.AjArtivoAuth.isAdminEmail(user.email)) {
                window.location.href = "/pages/profile.html";
            }
        });
    }
})();
