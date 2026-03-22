(function () {
    const services = window.AjArtivoFirebase;
    if (!services) return;

    const { auth } = services;
    const SECURITY_API_BASE = "https://us-central1-ajartivo.cloudfunctions.net";

    const PROTECTED_ROUTE_PATTERNS = [
        /\/pages\/profile\.html$/i,
        /\/admin/i
    ];

    const ADMIN_ROUTE_PATTERNS = [
        /\/admin/i
    ];

    const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
    const ABSOLUTE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
    let inactivityTimer = null;

    window.AjArtivoAuth = {
        redirectAfterLogin(user) {
            if (!user) return;
            const next = getNextUrl();
            window.location.href = next || "/pages/profile.html";
        }
    };

    bindEmailLogin();
    bindSignup();
    bindLogout();
    bindSocialLogin();
    handleRouteSecurity();
    redirectLoggedInAuthPages();

    function bindEmailLogin() {
        const loginBtn = document.getElementById("loginBtn");
        if (!loginBtn) return;

        loginBtn.addEventListener("click", async function () {
            const email = document.getElementById("email")?.value.trim().toLowerCase();
            const password = document.getElementById("password")?.value || "";

            if (!isValidEmail(email)) {
                alert("Please enter a valid email.");
                return;
            }

            if (!password) {
                alert("Please enter password.");
                return;
            }

            loginBtn.disabled = true;

            try {
                const gate = await postSecurity("preLoginCheck", { email: email });
                if (gate && gate.allowed === false) {
                    const waitSeconds = Number(gate.retryAfterSeconds || 60);
                    alert(`Too many attempts. Try again in ${waitSeconds} seconds.`);
                    return;
                }

                const credential = await auth.signInWithEmailAndPassword(email, password);
                const user = credential.user;

                if (!user) {
                    throw new Error("Unable to login. Please try again.");
                }

                await user.reload();
                if (!user.emailVerified) {
                    await auth.signOut();
                    alert("Please verify your email before login. Check your inbox.");
                    return;
                }

                await postSecurity("reportLoginAttempt", { email: email, success: true });
                window.AjArtivoAuth.redirectAfterLogin(user);
            } catch (error) {
                console.error("Login error:", error);
                await postSecurity("reportLoginAttempt", { email: email, success: false });
                alert(readableAuthError(error));
            } finally {
                loginBtn.disabled = false;
            }
        });
    }

    function bindSignup() {
        const signupForm = document.getElementById("signupForm");
        if (!signupForm) return;

        signupForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            const fullname = document.getElementById("fullname")?.value.trim();
            const email = document.getElementById("email")?.value.trim().toLowerCase();
            const password = document.getElementById("password")?.value || "";

            if (!fullname || !isValidEmail(email)) {
                alert("Please enter full name and valid email.");
                return;
            }

            const passwordError = validateStrongPassword(password);
            if (passwordError) {
                alert(passwordError);
                return;
            }

            try {
                const credential = await auth.createUserWithEmailAndPassword(email, password);
                if (!credential.user) {
                    throw new Error("Account creation failed. Please retry.");
                }

                await credential.user.updateProfile({ displayName: fullname });
                await credential.user.sendEmailVerification({
                    url: window.location.origin + "/login.html",
                    handleCodeInApp: false
                });
                await auth.signOut();

                alert("Account created. Verification email sent. Verify email before login.");
                window.location.href = "/login.html";
            } catch (error) {
                console.error("Signup error:", error);
                alert(readableAuthError(error));
            }
        });
    }

    function bindSocialLogin() {
        const googleBtn = document.getElementById("googleLogin") || document.querySelector(".google-btn");
        const facebookBtn = document.getElementById("facebookLogin");

        if (googleBtn) {
            googleBtn.addEventListener("click", async function () {
                try {
                    const provider = new firebase.auth.GoogleAuthProvider();
                    const credential = await auth.signInWithPopup(provider);
                    window.AjArtivoAuth.redirectAfterLogin(credential.user);
                } catch (error) {
                    console.error("Google login error:", error);
                    alert(readableAuthError(error));
                }
            });
        }

        if (facebookBtn) {
            facebookBtn.addEventListener("click", async function () {
                try {
                    const provider = new firebase.auth.FacebookAuthProvider();
                    const credential = await auth.signInWithPopup(provider);
                    window.AjArtivoAuth.redirectAfterLogin(credential.user);
                } catch (error) {
                    console.error("Facebook login error:", error);
                    alert(readableAuthError(error));
                }
            });
        }
    }

    function bindLogout() {
        document.addEventListener("click", function (event) {
            const target = event.target;
            if (!target) return;

            const logoutIds = ["logoutBtn", "sidebarLogout", "logout"];
            if (!logoutIds.includes(target.id)) return;

            auth.signOut()
                .then(function () {
                    clearSessionTimers();
                    window.location.href = "/login.html";
                })
                .catch(function (error) {
                    console.error("Logout error:", error);
                });
        });
    }

    function handleRouteSecurity() {
        auth.onAuthStateChanged(async function (user) {
            const path = window.location.pathname || "";
            const onProtectedRoute = PROTECTED_ROUTE_PATTERNS.some((pattern) => pattern.test(path));
            const onAdminRoute = ADMIN_ROUTE_PATTERNS.some((pattern) => pattern.test(path));

            if (!user) {
                clearSessionTimers();
                if (onProtectedRoute) {
                    goLoginWithNext();
                }
                return;
            }

            await user.reload();
            if (requiresEmailVerification(user) && !user.emailVerified) {
                await auth.signOut();
                if (onProtectedRoute) {
                    alert("Please verify your email first.");
                    goLoginWithNext();
                }
                return;
            }

            startSessionGuards();

            if (onAdminRoute) {
                const allowed = await checkAdminAccess(user);
                if (!allowed) {
                    alert("Unauthorized admin access.");
                    window.location.href = "/index.html";
                }
            }
        });
    }

    function redirectLoggedInAuthPages() {
        const isAuthPage = /\/(login|signup)\.html$/i.test(window.location.pathname);
        if (!isAuthPage) return;

        auth.onAuthStateChanged(async function (user) {
            if (!user) return;
            await user.reload();
            if (requiresEmailVerification(user) && !user.emailVerified) return;
            window.AjArtivoAuth.redirectAfterLogin(user);
        });
    }

    function requiresEmailVerification(user) {
        if (!user || !Array.isArray(user.providerData)) return false;
        return user.providerData.some(function (provider) {
            return provider && provider.providerId === "password";
        });
    }

    function startSessionGuards() {
        const now = Date.now();
        const authStart = Number(localStorage.getItem("aj_auth_start") || now);
        const lastActive = Number(localStorage.getItem("aj_last_active") || now);

        if (!localStorage.getItem("aj_auth_start")) {
            localStorage.setItem("aj_auth_start", String(now));
        }
        localStorage.setItem("aj_last_active", String(now));

        if (now - authStart > ABSOLUTE_TIMEOUT_MS) {
            forceLogout("Session expired. Please login again.");
            return;
        }

        if (now - lastActive > INACTIVITY_TIMEOUT_MS) {
            forceLogout("Logged out due to inactivity.");
            return;
        }

        resetInactivityTimer();
        bindActivityListeners();
    }

    function bindActivityListeners() {
        if (window.__ajAuthActivityBound) return;
        window.__ajAuthActivityBound = true;

        const handler = throttle(function () {
            localStorage.setItem("aj_last_active", String(Date.now()));
            resetInactivityTimer();
        }, 3000);

        ["click", "keydown", "mousemove", "touchstart"].forEach(function (eventName) {
            document.addEventListener(eventName, handler, { passive: true });
        });
    }

    function resetInactivityTimer() {
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
        }

        inactivityTimer = setTimeout(function () {
            forceLogout("Logged out due to inactivity.");
        }, INACTIVITY_TIMEOUT_MS);
    }

    function clearSessionTimers() {
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }
        localStorage.removeItem("aj_auth_start");
        localStorage.removeItem("aj_last_active");
    }

    async function forceLogout(message) {
        try {
            await auth.signOut();
        } catch (error) {
            console.error("Forced logout failed:", error);
        } finally {
            clearSessionTimers();
            if (message) alert(message);
            goLoginWithNext();
        }
    }

    function goLoginWithNext() {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = "/login.html?next=" + next;
    }

    function getNextUrl() {
        const params = new URLSearchParams(window.location.search);
        const next = params.get("next");
        if (!next) return "";
        if (!next.startsWith("/")) return "";
        return next;
    }

    async function checkAdminAccess(user) {
        try {
            const token = await user.getIdToken(true);
            const response = await fetch(SECURITY_API_BASE + "/adminGuardCheck", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token
                },
                body: JSON.stringify({})
            });
            if (!response.ok) return false;
            const payload = await response.json();
            return Boolean(payload.allowed);
        } catch (error) {
            console.error("Admin check failed:", error);
            return false;
        }
    }

    async function postSecurity(endpoint, payload) {
        const response = await fetch(SECURITY_API_BASE + "/" + endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload || {})
        });

        if (!response.ok) {
            throw new Error("Security validation failed.");
        }

        return response.json();
    }

    function isValidEmail(email) {
        if (!email) return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function validateStrongPassword(password) {
        if (typeof password !== "string" || password.length < 12) {
            return "Password must be at least 12 characters.";
        }
        if (!/[A-Z]/.test(password)) {
            return "Password must include at least one uppercase letter.";
        }
        if (!/[a-z]/.test(password)) {
            return "Password must include at least one lowercase letter.";
        }
        if (!/[0-9]/.test(password)) {
            return "Password must include at least one number.";
        }
        if (!/[^A-Za-z0-9]/.test(password)) {
            return "Password must include at least one special character.";
        }
        return "";
    }

    function readableAuthError(error) {
        const code = String(error && error.code ? error.code : "");
        if (code === "auth/wrong-password" || code === "auth/user-not-found") {
            return "Invalid email or password.";
        }
        if (code === "auth/too-many-requests") {
            return "Too many attempts. Please try later.";
        }
        if (code === "auth/email-already-in-use") {
            return "Email already registered. Please login.";
        }
        return error && error.message ? error.message : "Authentication failed.";
    }

    function throttle(fn, waitMs) {
        let last = 0;
        return function () {
            const now = Date.now();
            if (now - last < waitMs) return;
            last = now;
            fn();
        };
    }
})();
