(function () {
    const services = window.AjArtivoSupabase;
    if (!services) return;

    bindLogin();
    bindSignup();
    bindLogout();
    bindOAuthButtons();
    bindPasswordToggle();
    initProfileRouteGuard();

    function bindLogin() {
        const loginBtn = document.getElementById("loginBtn");
        if (!loginBtn) return;

        loginBtn.addEventListener("click", async function () {
            const email = cleanText(document.getElementById("email")?.value).toLowerCase();
            const password = cleanText(document.getElementById("password")?.value);

            if (!isValidEmail(email)) {
                alert("Please enter a valid email address.");
                return;
            }

            if (!password) {
                alert("Please enter your password.");
                return;
            }

            loginBtn.disabled = true;
            const originalText = loginBtn.textContent;
            loginBtn.textContent = "Logging in...";

            try {
                await services.signIn(email, password);

                const params = new URLSearchParams(window.location.search);
                const next = cleanText(params.get("next"));
                window.location.href = next && next.startsWith("/") ? next : "/pages/profile.html";
            } catch (error) {
                alert(mapAuthError(error, "login"));
            } finally {
                loginBtn.disabled = false;
                loginBtn.textContent = originalText;
            }
        });
    }

    function bindSignup() {
        const signupForm = document.getElementById("signupForm");
        if (!signupForm) return;

        signupForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            const fullname = cleanText(document.getElementById("fullname")?.value);
            const email = cleanText(document.getElementById("email")?.value).toLowerCase();
            const password = cleanText(document.getElementById("password")?.value);
            const submitBtn = signupForm.querySelector('button[type="submit"]');
            const originalText = submitBtn ? submitBtn.textContent : "";

            if (!fullname) {
                alert("Please enter your full name.");
                return;
            }

            if (!isValidEmail(email)) {
                alert("Please enter a valid email address.");
                return;
            }

            if (password.length < 6) {
                alert("Please use a password with at least 6 characters.");
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Creating account...";
            }

            try {
                const result = await services.signUp({
                    fullName: fullname,
                    email: email,
                    password: password
                });

                if (result && result.requiresEmailVerification) {
                    alert("Account created. Please verify your email from the Supabase confirmation email, then log in.");
                    window.location.href = "/login.html";
                    return;
                }

                alert("Signup successful. Check your email for the next steps.");
                window.location.href = "/pages/profile.html";
            } catch (error) {
                alert(mapAuthError(error, "signup"));
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                }
            }
        });
    }

    function bindLogout() {
        document.addEventListener("click", async function (event) {
            const target = event.target;
            if (!target) return;

            const logoutIds = ["logoutBtn", "sidebarLogout", "logout"];
            if (!logoutIds.includes(target.id)) return;

            event.preventDefault();

            try {
                await services.signOut();
            } catch (error) {
                console.error("Supabase logout failed:", error);
                services.clearSession();
            }

            window.location.href = "/login.html";
        });
    }

    async function initProfileRouteGuard() {
        const path = window.location.pathname || "";
        const requiresSession = /\/pages\/profile\.html$/i.test(path) || /\/Profile\/profile\.html$/i.test(path);
        if (!requiresSession) return;

        const session = await services.refreshSession();
        if (!session) {
            const next = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = `/login.html?next=${next}`;
        }
    }

    function bindOAuthButtons() {
        const googleButtons = [
            document.getElementById("googleLogin"),
            document.querySelector(".google-btn")
        ].filter(Boolean);
        const facebookButton = document.getElementById("facebookLogin");

        googleButtons.forEach(function (button) {
            if (button.dataset.oauthReady === "true") return;

            button.addEventListener("click", async function () {
                const redirectUrl = buildOAuthRedirectUrl();
                try {
                    await services.signInWithOAuth("google", redirectUrl);
                } catch (error) {
                    alert(mapAuthError(error, "oauth"));
                }
            });

            button.dataset.oauthReady = "true";
        });

        if (facebookButton && facebookButton.dataset.oauthReady !== "true") {
            facebookButton.addEventListener("click", async function () {
                const redirectUrl = buildOAuthRedirectUrl();
                try {
                    await services.signInWithOAuth("facebook", redirectUrl);
                } catch (error) {
                    alert(mapAuthError(error, "oauth"));
                }
            });

            facebookButton.dataset.oauthReady = "true";
        }
    }

    function bindPasswordToggle() {
        const passwordInput = document.getElementById("password");
        const toggleButton = document.getElementById("passwordToggle");

        if (!passwordInput || !toggleButton) {
            return;
        }

        toggleButton.addEventListener("click", function () {
            const shouldShow = passwordInput.type === "password";
            passwordInput.type = shouldShow ? "text" : "password";
            toggleButton.textContent = shouldShow ? "Hide" : "Show";
            toggleButton.setAttribute("aria-pressed", shouldShow ? "true" : "false");
            toggleButton.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
        });
    }

    function buildOAuthRedirectUrl() {
        const params = new URLSearchParams(window.location.search);
        const next = cleanText(params.get("next"));
        const url = new URL(window.location.origin + "/login.html");

        if (next && next.startsWith("/")) {
            url.searchParams.set("next", next);
        }

        return url.toString();
    }

    function mapAuthError(error, mode) {
        const message = cleanText(error && (error.message || error.error_description || error.code)).toLowerCase();

        if (message.includes("invalid login credentials")) {
            return "Incorrect email or password.";
        }

        if (message.includes("email not confirmed")) {
            return "Please verify your email before logging in.";
        }

        if (message.includes("user already registered")) {
            return "An account with this email already exists. Please log in instead.";
        }

        if (message.includes("password should be at least")) {
            return "Password must be at least 6 characters long.";
        }

        if (message.includes("provider is not enabled")) {
            return "This social login provider is not enabled in Supabase.";
        }

        if (message.includes("failed to fetch") || message.includes("network")) {
            return "Network error. Please check your connection and try again.";
        }

        if (mode === "signup") {
            return "Signup could not be completed. Please review your details and try again.";
        }

        if (mode === "oauth") {
            return "Social login could not be started. Please check the Supabase provider settings.";
        }

        return "Login could not be completed. Please try again.";
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
    }

    function cleanText(value) {
        return String(value || "").trim();
    }
})();
