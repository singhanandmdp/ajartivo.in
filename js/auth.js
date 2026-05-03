(function () {
    const services = window.AjArtivoSupabase;
    if (!services || !services.client || !services.client.auth) return;

    const supabase = services.client;
    const HOME_PATH = resolveAppPath("/");
    const DASHBOARD_PATH = resolveAppPath("/dashboard.html");
    const LOGIN_PATH = resolveAppPath("/login.html");
    const DEFAULT_NEXT = HOME_PATH;
    const RESEND_SECONDS = 60;

    const ui = {};
    const state = {
        open: false,
        email: "",
        nextPath: DEFAULT_NEXT,
        reason: "login",
        sendMode: "otp",
        verificationType: "email",
        redirectOnSuccess: true,
        sending: false,
        verifying: false,
        otpSent: false,
        timerId: 0,
        secondsLeft: 0,
        resolver: null
    };

    init();

    function getAppBasePath() {
        const scriptElement = document.currentScript || document.querySelector('script[src*="js/auth.js"]');
        const scriptSrc = scriptElement ? scriptElement.getAttribute("src") || "" : "";

        if (scriptSrc) {
            const resolvedScriptUrl = new URL(scriptSrc, window.location.href);
            return resolvedScriptUrl.pathname.replace(/\/js\/auth\.js(?:\?.*)?$/i, "");
        }

        const path = window.location.pathname;
        const pagesIndex = path.indexOf("/pages/");
        if (pagesIndex >= 0) {
            return path.slice(0, pagesIndex);
        }

        const profileIndex = path.indexOf("/profile/");
        if (profileIndex >= 0) {
            return path.slice(0, profileIndex);
        }

        const aboutIndex = path.indexOf("/about/");
        if (aboutIndex >= 0) {
            return path.slice(0, aboutIndex);
        }

        const lastSlashIndex = path.lastIndexOf("/");
        return lastSlashIndex > 0 ? path.slice(0, lastSlashIndex) : "";
    }

    function resolveAppPath(path) {
        if (!path) return window.location.pathname;
        if (/^(?:[a-z]+:)?\/\//i.test(path)) return path;

        const normalizedPath = path.startsWith("/") ? path : `/${path}`;
        return `${getAppBasePath()}${normalizedPath}`;
    }

    function init() {
        bindLogin();
        bindSignup();
        bindGoogleButtons();
        bindPasswordToggle();
        bindLogout();
        bindOpeners();
        exposeModalApi();
        initRouteGuards();
    }

    function exposeModalApi() {
        window.AjArtivoAuthModal = {
            open: openModal,
            close: function () {
                closeModal(null);
            }
        };
    }

    function bindOpeners() {
        document.addEventListener("click", function (event) {
            const trigger = event.target && event.target.closest('[data-open-auth-modal]');
            if (!trigger || shouldIgnoreTrigger(trigger)) return;

            event.preventDefault();
            openModal({
                nextPath: cleanText(trigger.getAttribute("data-next")) || readNextPath() || DEFAULT_NEXT,
                reason: cleanText(trigger.getAttribute("data-auth-reason")) || "login",
                redirectOnSuccess: true
            });
        });
    }

    async function initRouteGuards() {
        const path = cleanText(window.location.pathname).toLowerCase();
        const authState = await resolveRouteAuthState();
        const session = authState.session;

        if (path.endsWith(LOGIN_PATH)) {
            if (session) {
                await ensureProfileExists(authState.authUser);
                redirectAfterLogin(readNextPath() || DEFAULT_NEXT);
            }
            return;
        }

        if (isProtectedPath(path) && !session) {
            window.location.href = buildAuthRequiredUrl(window.location.pathname + window.location.search);
            return;
        }
    }

    async function resolveRouteAuthState() {
        let authUser = null;
        let rawSession = await readSupabaseSession();

        if (!rawSession && hasActiveAuthCallback()) {
            rawSession = await waitForSupabaseSession(6000);
        }

        if (rawSession && rawSession.user) {
            authUser = rawSession.user;
        }

        const session = rawSession && services.refreshSession
            ? await services.refreshSession({
                awaitAccountSummary: false,
                timeoutMs: 4000
            })
            : rawSession && services.getSession
                ? services.getSession()
                : null;

        return {
            authUser: authUser,
            session: session
        };
    }

    async function readSupabaseSession() {
        try {
            const authResult = await supabase.auth.getSession();
            return authResult && authResult.data ? authResult.data.session : null;
        } catch (error) {
            console.warn("Supabase route session read failed:", error);
            return null;
        }
    }

    async function waitForSupabaseSession(timeoutMs) {
        const deadline = Date.now() + Math.max(500, Number(timeoutMs) || 0);

        while (Date.now() < deadline) {
            const session = await readSupabaseSession();
            if (session && session.user) {
                return session;
            }

            await delay(200);
        }

        return null;
    }

    function hasActiveAuthCallback() {
        try {
            const searchParams = new URLSearchParams(window.location.search);
            const hashParams = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
            const keys = [
                "code",
                "access_token",
                "refresh_token",
                "expires_at",
                "expires_in",
                "provider_token",
                "provider_refresh_token",
                "token_type",
                "type",
                "error",
                "error_code",
                "error_description"
            ];

            return keys.some(function (key) {
                return searchParams.has(key) || hashParams.has(key);
            });
        } catch (error) {
            console.warn("Auth callback detection failed:", error);
            return false;
        }
    }

    function delay(ms) {
        return new Promise(function (resolve) {
            window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
        });
    }

    function isProtectedPath(path) {
        return /\/dashboard\.html$/i.test(path)
            || /\/pages\/profile\.html$/i.test(path)
            || /\/profile\/profile\.html$/i.test(path);
    }

    function buildAuthRequiredUrl(nextPath) {
        return `${window.location.origin}${LOGIN_PATH}?next=${encodeURIComponent(sanitizeNext(nextPath))}`;
    }

    function bindLogin() {
        const loginForm = document.getElementById("loginForm");
        if (!loginForm) return;

        const messageNode = document.getElementById("loginMessage");

        loginForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            const email = cleanText(document.getElementById("email") && document.getElementById("email").value).toLowerCase();
            const password = cleanText(document.getElementById("password") && document.getElementById("password").value);
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const originalText = submitBtn ? submitBtn.textContent : "Login";

            if (!isValidEmail(email)) {
                setInlineMessage(messageNode, "Please enter a valid email address.", "error");
                return;
            }

            if (!password) {
                setInlineMessage(messageNode, "Please enter your password.", "error");
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Logging in...";
            }
            setInlineMessage(messageNode, "Checking your account...");

            try {
                const { data: { user }, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (error) {
                    alert(error.message);
                    return;
                }

                if (!user) {
                    alert("Login user not found.");
                    return;
                }

                await ensureProfileExists(user);

                if (services.refreshSession) {
                    await services.refreshSession({
                        awaitAccountSummary: false,
                        timeoutMs: 4000
                    });
                }

                setInlineMessage(messageNode, "Login successful. Redirecting...", "success");
                redirectAfterLogin(readNextPath() || DASHBOARD_PATH);
            } catch (error) {
                setInlineMessage(messageNode, mapLoginError(error), "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                }
            }
        });
    }

    function bindSignup() {
        const signupForm = document.getElementById("signupForm");
        if (!signupForm) return;
        const messageNode = document.getElementById("signupMessage");

        signupForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            const fullName = cleanText(document.getElementById("fullname") && document.getElementById("fullname").value);
            const email = cleanText(document.getElementById("email") && document.getElementById("email").value).toLowerCase();
            const address = cleanText(document.getElementById("address") && document.getElementById("address").value);
            const password = cleanText(document.getElementById("password") && document.getElementById("password").value);
            const submitBtn = signupForm.querySelector('button[type="submit"]');
            const originalText = submitBtn ? submitBtn.textContent : "";

            if (!fullName) {
                setInlineMessage(messageNode, "Please enter your full name.", "error");
                return;
            }

            if (!isValidEmail(email)) {
                setInlineMessage(messageNode, "Please enter a valid email address.", "error");
                return;
            }

            if (password.length < 6) {
                setInlineMessage(messageNode, "Please use a password with at least 6 characters.", "error");
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Creating account...";
            }
            setInlineMessage(messageNode, "Creating your account and sending OTP...");

            try {
                const { data, error } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            full_name: fullName,
                            name: fullName,
                            address: address
                        }
                    }
                });
                const user = data ? data.user : null;
                const session = data ? data.session : null;

                if (error) {
                    alert(error.message);
                    return;
                }

                if (user) {
                    await ensureProfileExists(user, fullName || "User");
                }

                if (!session) {
                    setInlineMessage(messageNode, `OTP sent to ${email}. Enter the 6-digit code to verify your account.`, "success");
                    openModal({
                        reason: "signup",
                        email: email,
                        nextPath: DEFAULT_NEXT,
                        redirectOnSuccess: true,
                        sendMode: "signup",
                        verificationType: "signup",
                        preSent: true
                    });
                    return;
                }

                if (services.refreshSession) {
                    await services.refreshSession({
                        awaitAccountSummary: false,
                        timeoutMs: 4000
                    });
                }

                redirectAfterLogin(DEFAULT_NEXT);
            } catch (error) {
                setInlineMessage(messageNode, mapAuthError(error), "error");
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                }
            }
        });
    }

    function bindGoogleButtons() {
        const buttons = Array.from(document.querySelectorAll(".google-btn, [data-google-login]"));
        if (!buttons.length || !services.signInWithOAuth) return;

        buttons.forEach(function (button) {
            button.addEventListener("click", async function () {
                const originalMarkup = button.innerHTML;
                const nextPath = readNextPath() || DEFAULT_NEXT;
                button.disabled = true;
                button.textContent = "Connecting...";

                try {
                    await services.signInWithOAuth("google", buildRedirectUrl(nextPath));
                } catch (error) {
                    console.error("Google sign-in failed:", error);
                    const targetMessage = document.getElementById("loginMessage") || document.getElementById("signupMessage");
                    setInlineMessage(targetMessage, mapLoginError(error), "error");
                    button.disabled = false;
                    button.innerHTML = originalMarkup;
                }
            });
        });
    }

    function bindPasswordToggle() {
        const passwordInput = document.getElementById("password");
        const toggleButton = document.getElementById("passwordToggle");
        if (!passwordInput || !toggleButton) return;

        toggleButton.addEventListener("click", function () {
            const show = passwordInput.type === "password";
            passwordInput.type = show ? "text" : "password";
            toggleButton.textContent = show ? "Hide" : "Show";
            toggleButton.setAttribute("aria-pressed", show ? "true" : "false");
        });
    }

    function bindLogout() {
        document.addEventListener("click", async function (event) {
            const trigger = event.target && event.target.closest("#logoutBtn, #sidebarLogout, #logout, #dashboardLogout, [data-auth-logout]");
            if (!trigger) return;

            event.preventDefault();

            try {
                await supabase.auth.signOut();
            } catch (error) {
                console.error("Supabase logout failed:", error);
                if (services.clearSession) services.clearSession();
            }

            window.location.href = `${window.location.origin}${HOME_PATH}`;
        });
    }

    function shouldIgnoreTrigger(trigger) {
        return Boolean(trigger.closest("#userMenu"));
    }

    function ensureModal() {
        if (ui.root) return;
        ensureModalStyles();

        const root = document.createElement("div");
        root.className = "aj-auth-modal";
        root.hidden = true;
        root.innerHTML = `
            <div class="aj-auth-backdrop"></div>
            <div class="aj-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="ajAuthTitle">
                <button type="button" class="aj-auth-close" aria-label="Close">&times;</button>
                <div class="aj-auth-hero">
                    <p class="aj-auth-kicker">AJartivo Secure Access</p>
                    <h2 class="aj-auth-title" id="ajAuthTitle">Login with Email OTP</h2>
                    <p class="aj-auth-subtitle">Enter your email, receive a 6-digit OTP, and sign in securely.</p>
                    <div class="aj-auth-pill-row"><span>6-digit code</span><span>Modern flow</span><span>Session sync</span></div>
                </div>
                <div class="aj-auth-panel">
                    <label class="aj-auth-label" for="ajAuthEmail">Email address</label>
                    <input id="ajAuthEmail" class="aj-auth-input" type="email" placeholder="you@example.com" autocomplete="email">
                    <button id="ajAuthSendOtp" type="button" class="aj-auth-btn aj-auth-btn-primary">Send OTP</button>
                    <div id="ajAuthOtpShell" class="aj-auth-otp-shell" hidden>
                        <p class="aj-auth-label aj-auth-otp-title">Enter 6-digit OTP</p>
                        <div class="aj-auth-otp-grid">
                            <input class="aj-auth-otp" data-otp-index="0" type="text" inputmode="numeric" maxlength="1" autocomplete="one-time-code">
                            <input class="aj-auth-otp" data-otp-index="1" type="text" inputmode="numeric" maxlength="1" autocomplete="one-time-code">
                            <input class="aj-auth-otp" data-otp-index="2" type="text" inputmode="numeric" maxlength="1" autocomplete="one-time-code">
                            <input class="aj-auth-otp" data-otp-index="3" type="text" inputmode="numeric" maxlength="1" autocomplete="one-time-code">
                            <input class="aj-auth-otp" data-otp-index="4" type="text" inputmode="numeric" maxlength="1" autocomplete="one-time-code">
                            <input class="aj-auth-otp" data-otp-index="5" type="text" inputmode="numeric" maxlength="1" autocomplete="one-time-code">
                        </div>
                        <div class="aj-auth-action-row">
                            <button id="ajAuthVerifyOtp" type="button" class="aj-auth-btn aj-auth-btn-primary">Verify OTP</button>
                            <button id="ajAuthResendOtp" type="button" class="aj-auth-btn aj-auth-btn-secondary" disabled>Resend OTP in 60s</button>
                        </div>
                    </div>
                    <p id="ajAuthMessage" class="aj-auth-message aj-auth-message-info">Enter your email to get started.</p>
                </div>
            </div>
        `;

        document.body.appendChild(root);
        ui.root = root;
        ui.backdrop = root.querySelector(".aj-auth-backdrop");
        ui.dialog = root.querySelector(".aj-auth-dialog");
        ui.close = root.querySelector(".aj-auth-close");
        ui.title = root.querySelector(".aj-auth-title");
        ui.subtitle = root.querySelector(".aj-auth-subtitle");
        ui.email = root.querySelector("#ajAuthEmail");
        ui.sendOtp = root.querySelector("#ajAuthSendOtp");
        ui.otpShell = root.querySelector("#ajAuthOtpShell");
        ui.otpInputs = Array.from(root.querySelectorAll(".aj-auth-otp"));
        ui.verifyOtp = root.querySelector("#ajAuthVerifyOtp");
        ui.resendOtp = root.querySelector("#ajAuthResendOtp");
        ui.message = root.querySelector("#ajAuthMessage");

        ui.close.addEventListener("click", function () { closeModal(null); });
        ui.backdrop.addEventListener("click", function () { closeModal(null); });
        root.addEventListener("keydown", function (event) {
            if (event.key === "Escape") closeModal(null);
        });
        ui.sendOtp.addEventListener("click", function () { sendOtp(); });
        ui.verifyOtp.addEventListener("click", function () { verifyOtp(); });
        ui.resendOtp.addEventListener("click", function () {
            if (state.secondsLeft > 0) return;
            sendOtp(true);
        });
        ui.email.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                sendOtp();
            }
        });

        bindOtpInputs();
    }

    function bindOtpInputs() {
        ui.otpInputs.forEach(function (input, index) {
            input.addEventListener("input", function () {
                input.value = input.value.replace(/\D/g, "").slice(-1);
                if (input.value && index < ui.otpInputs.length - 1) {
                    ui.otpInputs[index + 1].focus();
                    ui.otpInputs[index + 1].select();
                }
            });

            input.addEventListener("keydown", function (event) {
                if (event.key === "Backspace" && !input.value && index > 0) {
                    ui.otpInputs[index - 1].focus();
                    ui.otpInputs[index - 1].select();
                }
                if (event.key === "ArrowLeft" && index > 0) {
                    event.preventDefault();
                    ui.otpInputs[index - 1].focus();
                }
                if (event.key === "ArrowRight" && index < ui.otpInputs.length - 1) {
                    event.preventDefault();
                    ui.otpInputs[index + 1].focus();
                }
                if (event.key === "Enter") {
                    event.preventDefault();
                    verifyOtp();
                }
            });

            input.addEventListener("paste", function (event) {
                event.preventDefault();
                const digits = String(event.clipboardData && event.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
                if (!digits) return;
                ui.otpInputs.forEach(function (otpInput, otpIndex) {
                    otpInput.value = digits[otpIndex] || "";
                });
                const targetIndex = Math.min(digits.length, 5);
                ui.otpInputs[targetIndex].focus();
                ui.otpInputs[targetIndex].select();
            });
        });
    }

    function openModal(options) {
        ensureModal();

        if (state.open) {
            return Promise.resolve(services.getSession ? services.getSession() : null);
        }

        const existingSession = services.getSession ? services.getSession() : null;
        if (existingSession && !(options && options.redirectOnSuccess === false)) {
            redirectAfterLogin(options && options.nextPath || readNextPath() || DEFAULT_NEXT);
            return Promise.resolve(existingSession);
        }

        state.open = true;
        state.email = cleanText(options && options.email).toLowerCase();
        state.nextPath = sanitizeNext(options && options.nextPath);
        state.reason = cleanText(options && options.reason) || "login";
        state.sendMode = cleanText(options && options.sendMode) || "otp";
        state.verificationType = cleanText(options && options.verificationType) || "email";
        state.redirectOnSuccess = !(options && options.redirectOnSuccess === false);
        state.sending = false;
        state.verifying = false;
        state.otpSent = Boolean(options && options.preSent);
        stopTimer();
        resetModalUi();
        updateModalCopy();

        ui.root.hidden = false;
        document.body.classList.add("aj-auth-open");
        window.requestAnimationFrame(function () {
            ui.root.classList.add("is-visible");
            if (state.otpSent) {
                startTimer(RESEND_SECONDS);
                focusOtpInput();
            } else {
                ui.email.focus();
            }
        });

        return new Promise(function (resolve) {
            state.resolver = resolve;
        });
    }

    function closeModal(result) {
        if (!state.open || !ui.root) return;

        state.open = false;
        stopTimer();
        ui.root.classList.remove("is-visible");
        document.body.classList.remove("aj-auth-open");

        window.setTimeout(function () {
            if (ui.root) {
                ui.root.hidden = true;
            }
        }, 220);

        if (typeof state.resolver === "function") {
            state.resolver(result || null);
        }
        state.resolver = null;
    }

    function resetModalUi() {
        const hasPresetEmail = Boolean(state.email);

        ui.email.disabled = hasPresetEmail;
        ui.email.value = state.email;
        ui.sendOtp.disabled = state.sendMode === "signup";
        ui.sendOtp.hidden = state.sendMode === "signup";
        ui.sendOtp.textContent = "Send OTP";
        ui.otpShell.hidden = !state.otpSent;
        ui.verifyOtp.disabled = false;
        ui.verifyOtp.textContent = "Verify OTP";
        ui.resendOtp.disabled = true;
        ui.resendOtp.textContent = `Resend OTP in ${RESEND_SECONDS}s`;
        ui.otpInputs.forEach(function (input) { input.value = ""; });
        setMessage(
            state.sendMode === "signup"
                ? `We sent a 6-digit verification code to ${state.email}.`
                : "Enter your email to receive a secure 6-digit OTP.",
            "info"
        );
    }

    function updateModalCopy() {
        const isSignup = state.reason === "signup";
        const isBuy = state.reason === "buy";
        ui.title.textContent = isSignup
            ? "Verify your email"
            : isBuy
            ? "Login to Continue Purchase"
            : "Login with Email OTP";
        ui.subtitle.textContent = isSignup
            ? "Complete signup by entering the 6-digit OTP sent to your email."
            : isBuy
            ? "Verify your email with a 6-digit OTP to continue checkout securely."
            : "Enter your email, receive a 6-digit OTP, and sign in securely.";
    }

    async function sendOtp(isResend) {
        const email = cleanText(ui.email.value).toLowerCase();
        if (!isValidEmail(email)) {
            setMessage("Please enter a valid email address.", "error");
            ui.email.focus();
            return;
        }

        if (state.sending) return;

        state.sending = true;
        state.email = email;
        ui.sendOtp.disabled = true;
        ui.resendOtp.disabled = true;
        ui.sendOtp.textContent = isResend ? "Resending..." : "Sending...";
        if (isResend) {
            ui.resendOtp.textContent = "Resending...";
        }

        setMessage(isResend ? "Resending OTP..." : "Sending OTP...", "info");

        try {
            let error = null;

            if (state.sendMode === "signup") {
                if (typeof supabase.auth.resend !== "function") {
                    throw new Error("Unable to resend signup OTP right now.");
                }

                const resendResult = await supabase.auth.resend({
                    type: "signup",
                    email: email
                });
                error = resendResult ? resendResult.error : null;
            } else {
                const otpResult = await supabase.auth.signInWithOtp({
                    email: email,
                    options: {
                        shouldCreateUser: true
                    }
                });
                error = otpResult ? otpResult.error : null;
            }

            if (error) throw error;

            state.otpSent = true;
            ui.otpShell.hidden = false;
            ui.email.disabled = true;
            ui.otpInputs.forEach(function (input) { input.value = ""; });
            setMessage(`OTP sent to ${email}. Please check your inbox.`, "success");
            startTimer(RESEND_SECONDS);

            window.setTimeout(function () {
                ui.otpInputs[0].focus();
            }, 80);
        } catch (error) {
            setMessage(resolveOtpError(error, "send"), "error");
        } finally {
            state.sending = false;
            ui.sendOtp.disabled = false;
            ui.sendOtp.textContent = "Send OTP";
        }
    }

    async function verifyOtp() {
        if (!state.otpSent || !state.email) {
            setMessage("Please send OTP first.", "error");
            return;
        }

        const otp = ui.otpInputs.map(function (input) { return cleanText(input.value); }).join("");
        if (!/^\d{6}$/.test(otp)) {
            setMessage("Please enter the complete 6-digit OTP.", "error");
            focusOtpInput();
            return;
        }

        if (state.verifying) return;

        state.verifying = true;
        ui.verifyOtp.disabled = true;
        ui.verifyOtp.textContent = "Verifying...";
        ui.resendOtp.disabled = true;
        setMessage("Verifying OTP...", "info");

        try {
            const { data, error } = await supabase.auth.verifyOtp({
                email: state.email,
                token: otp,
                type: state.verificationType
            });

            if (error) throw error;

            await ensureProfileExists(data && data.session && data.session.user);

            const session = services.refreshSession
                ? await services.refreshSession({
                    awaitAccountSummary: false,
                    timeoutMs: 4000
                })
                : data && data.session
                ? data.session
                : null;

            setMessage("OTP verified successfully.", "success");
            closeModal(session);

            if (state.redirectOnSuccess) {
                redirectAfterLogin(state.nextPath);
            }
        } catch (error) {
            setMessage(resolveOtpError(error, "verify"), "error");
            focusOtpInput(true);
        } finally {
            state.verifying = false;
            ui.verifyOtp.disabled = false;
            ui.verifyOtp.textContent = "Verify OTP";
            if (state.secondsLeft === 0) {
                ui.resendOtp.disabled = false;
            }
        }
    }

    function focusOtpInput(selectCurrent) {
        const target = ui.otpInputs.find(function (input) {
            return !cleanText(input.value);
        }) || ui.otpInputs[0];

        if (!target) return;
        target.focus();
        if (selectCurrent) {
            target.select();
        }
    }

    function startTimer(seconds) {
        stopTimer();
        state.secondsLeft = Number(seconds) || RESEND_SECONDS;
        updateResendButton();

        state.timerId = window.setInterval(function () {
            state.secondsLeft -= 1;
            if (state.secondsLeft <= 0) {
                stopTimer();
                ui.resendOtp.disabled = false;
                ui.resendOtp.textContent = "Resend OTP";
                return;
            }

            updateResendButton();
        }, 1000);
    }

    function updateResendButton() {
        ui.resendOtp.disabled = true;
        ui.resendOtp.textContent = `Resend OTP in ${state.secondsLeft}s`;
    }

    function stopTimer() {
        if (state.timerId) {
            window.clearInterval(state.timerId);
            state.timerId = 0;
        }
        state.secondsLeft = 0;
    }

    function redirectAfterLogin(nextPath) {
        window.location.href = buildRedirectUrl(nextPath);
    }

    function buildRedirectUrl(nextPath) {
        return `${window.location.origin}${sanitizeNext(nextPath)}`;
    }

    function readNextPath() {
        return sanitizeNext(new URLSearchParams(window.location.search).get("next"));
    }

    function sanitizeNext(value) {
        const next = cleanText(value || DEFAULT_NEXT);

        if (!next) {
            return DEFAULT_NEXT;
        }

        if (/^(?:[a-z]+:)?\/\//i.test(next)) {
            try {
                const parsed = new URL(next, window.location.origin);
                if (parsed.origin !== window.location.origin) {
                    return DEFAULT_NEXT;
                }

                return `${parsed.pathname}${parsed.search}${parsed.hash}`;
            } catch (error) {
                return DEFAULT_NEXT;
            }
        }

        if (!next.startsWith("/")) {
            return DEFAULT_NEXT;
        }

        const appBasePath = getAppBasePath();
        if (appBasePath && (next === appBasePath || next.startsWith(`${appBasePath}/`))) {
            return next;
        }

        return resolveAppPath(next);
    }

    function setMessage(message, tone) {
        ui.message.textContent = cleanText(message);
        ui.message.className = `aj-auth-message aj-auth-message-${tone || "info"}`;
    }

    function resolveOtpError(error, mode) {
        const message = cleanText(error && (error.message || error.error_description || error.code)).toLowerCase();

        if (message.includes("expired")) return "OTP expired. Please request a new OTP.";
        if (message.includes("invalid")) return "Invalid OTP. Please check the code and try again.";
        if (message.includes("email rate limit exceeded")) return "Too many OTP requests. Please wait a moment and try again.";
        if (message.includes("rate limit")) return "Too many requests. Please wait before trying again.";
        if (message.includes("failed to fetch") || message.includes("network")) return "Network error. Please check your connection and try again.";

        return mode === "send"
            ? (cleanText(error && error.message) || "Unable to send OTP right now.")
            : (cleanText(error && error.message) || "Unable to verify OTP right now.");
    }

    function setInlineMessage(node, message, tone) {
        if (!node) return;

        const text = cleanText(message);
        const isAuthMessage = node.classList.contains("auth-message");
        node.hidden = !text;
        node.textContent = text;
        node.className = `${isAuthMessage ? "auth-message" : "form-message"}${tone === "error" ? " is-error" : tone === "success" ? " is-success" : ""}`;
    }

    function mapLoginError(error) {
        const message = cleanText(error && (error.message || error.error_description || error.code)).toLowerCase();
        if (message.includes("invalid login credentials")) return "Email or password is incorrect.";
        if (message.includes("email not confirmed")) return "Please verify your email with OTP first, then log in.";
        if (message.includes("failed to fetch") || message.includes("network")) return "Network error. Please check your connection and try again.";
        return "Login could not be completed. Please try again.";
    }

    function mapAuthError(error) {
        const message = cleanText(error && (error.message || error.error_description || error.code)).toLowerCase();
        if (message.includes("user already registered")) return "An account with this email already exists. Please log in instead.";
        if (message.includes("password should be at least")) return "Password must be at least 6 characters long.";
        if (message.includes("email rate limit exceeded")) return "Too many OTP requests. Please wait a moment and try again.";
        if (message.includes("failed to fetch") || message.includes("network")) return "Network error. Please check your connection and try again.";
        return "Authentication could not be completed. Please try again.";
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
    }

    function cleanText(value) {
        return String(value || "").trim();
    }

    async function ensureProfileExists(user, fallbackName) {
        const authUser = user || null;
        if (!authUser || !cleanText(authUser.id)) {
            return null;
        }

        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", authUser.id)
            .maybeSingle();

        if (profileError) {
            throw profileError;
        }

        if (!profile) {
            const { error: insertError } = await supabase
                .from("profiles")
                .insert([
                    buildProfilePayload(authUser, fallbackName)
                ]);

            if (insertError) {
                throw insertError;
            }
        }

        const { data: finalProfile, error: finalProfileError } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", authUser.id)
            .single();

        if (finalProfileError) {
            throw finalProfileError;
        }

        return finalProfile;
    }

    function buildProfilePayload(user, fallbackName) {
        const fullName = resolveProfileName(user, fallbackName);
        const nameParts = splitNameParts(fullName);
        const metadata = user && user.user_metadata ? user.user_metadata : {};

        return {
            id: cleanText(user && user.id),
            email: cleanText(user && user.email).toLowerCase(),
            first_name: nameParts.firstName,
            last_name: nameParts.lastName,
            address: cleanText(metadata.address),
            mobile_number: cleanText(metadata.mobile_number || metadata.phone_number || metadata.phone),
            avatar_url: cleanText(metadata.avatar_url || metadata.picture)
        };
    }

    function resolveProfileName(user, fallbackName) {
        const metadata = user && user.user_metadata ? user.user_metadata : {};
        return cleanText(fallbackName)
            || cleanText(metadata.full_name || metadata.name)
            || "User";
    }

    function splitNameParts(fullName) {
        const normalizedName = cleanText(fullName);
        if (!normalizedName) {
            return {
                firstName: "",
                lastName: ""
            };
        }

        const parts = normalizedName.split(/\s+/).filter(Boolean);
        return {
            firstName: parts[0] || "",
            lastName: parts.slice(1).join(" ")
        };
    }

    function ensureModalStyles() {
        if (document.getElementById("ajAuthModalStyles")) return;

        const style = document.createElement("style");
        style.id = "ajAuthModalStyles";
        style.textContent = `
            body.aj-auth-open{overflow:hidden}
            .aj-auth-modal{position:fixed;inset:0;z-index:7600;display:grid;place-items:center;padding:16px;opacity:0;pointer-events:none;transition:opacity .22s ease}
            .aj-auth-modal.is-visible{opacity:1;pointer-events:auto}
            .aj-auth-backdrop{position:absolute;inset:0;background:radial-gradient(circle at 18% 18%,rgba(59,130,246,.22),transparent 28%),radial-gradient(circle at 82% 16%,rgba(255,255,255,.12),transparent 24%),rgba(7,12,24,.78);backdrop-filter:blur(14px)}
            .aj-auth-dialog{position:relative;z-index:1;width:min(94vw,560px);display:grid;gap:18px;padding:24px;border-radius:30px;border:1px solid rgba(255,255,255,.14);background:linear-gradient(135deg,rgba(255,255,255,.95),rgba(244,248,255,.92));box-shadow:0 34px 90px rgba(15,23,42,.34);transform:translateY(18px) scale(.98);transition:transform .24s ease;overflow:hidden}
            .aj-auth-modal.is-visible .aj-auth-dialog{transform:translateY(0) scale(1)}
            .aj-auth-dialog::before{content:"";position:absolute;inset:0 0 auto 0;height:5px;background:linear-gradient(90deg,#0f172a,#2563eb,#60a5fa)}
            .aj-auth-close{position:absolute;top:16px;right:16px;width:42px;height:42px;border:1px solid rgba(148,163,184,.18);border-radius:50%;background:rgba(255,255,255,.88);color:#0f172a;cursor:pointer;font-size:24px;line-height:1;box-shadow:0 10px 22px rgba(15,23,42,.08)}
            .aj-auth-hero,.aj-auth-panel,.aj-auth-message{position:relative;z-index:1}
            .aj-auth-hero{display:grid;gap:12px;padding:18px;border-radius:24px;background:radial-gradient(circle at top right,rgba(96,165,250,.16),transparent 34%),linear-gradient(180deg,rgba(248,251,255,.98),rgba(241,245,249,.94));border:1px solid rgba(226,232,240,.92)}
            .aj-auth-kicker{margin:0;color:#2563eb;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
            .aj-auth-title{margin:0;color:#0f172a;font-size:clamp(28px,5vw,36px);line-height:1.04;letter-spacing:-.04em}
            .aj-auth-subtitle{margin:0;color:#475569;font-size:15px;line-height:1.75}
            .aj-auth-pill-row{display:flex;flex-wrap:wrap;gap:10px}
            .aj-auth-pill-row span{display:inline-flex;align-items:center;min-height:32px;padding:0 12px;border-radius:999px;background:rgba(255,255,255,.82);color:#334155;border:1px solid rgba(226,232,240,.92);font-size:12px;font-weight:700}
            .aj-auth-panel{display:grid;gap:14px}
            .aj-auth-label{color:#0f172a;font-size:13px;font-weight:800}
            .aj-auth-input,.aj-auth-otp{border:1px solid rgba(148,163,184,.26);background:linear-gradient(180deg,#fff,#f8fafc);color:#0f172a;box-shadow:inset 0 1px 0 rgba(255,255,255,.86)}
            .aj-auth-input{width:100%;min-height:54px;padding:0 16px;border-radius:18px;font:inherit}
            .aj-auth-input:focus,.aj-auth-otp:focus{outline:none;border-color:rgba(37,99,235,.48);box-shadow:0 0 0 4px rgba(37,99,235,.10)}
            .aj-auth-btn{min-height:54px;border:none;border-radius:18px;padding:0 18px;font-size:15px;font-weight:800;cursor:pointer;transition:transform .2s ease,filter .2s ease}
            .aj-auth-btn:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.02)}
            .aj-auth-btn:disabled{opacity:.72;cursor:wait}
            .aj-auth-btn-primary{background:linear-gradient(135deg,#2563eb,#1d4ed8 56%,#60a5fa);color:#fff;box-shadow:0 18px 28px rgba(37,99,235,.22)}
            .aj-auth-btn-secondary{background:#eef2ff;color:#1e3a8a;border:1px solid rgba(96,165,250,.16)}
            .aj-auth-otp-shell{display:grid;gap:14px}
            .aj-auth-otp-title{margin:0}
            .aj-auth-otp-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
            .aj-auth-otp{min-height:56px;border-radius:18px;text-align:center;font-size:24px;font-weight:900;font-family:inherit}
            .aj-auth-action-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
            .aj-auth-message{margin:0;min-height:24px;font-size:14px;line-height:1.6}
            .aj-auth-message-info{color:#475569}
            .aj-auth-message-success{color:#15803d}
            .aj-auth-message-error{color:#b91c1c}
            @media (max-width:640px){.aj-auth-dialog{padding:18px;border-radius:26px;width:min(100vw - 12px,560px)}.aj-auth-otp-grid{gap:8px}.aj-auth-otp{min-height:50px;font-size:22px}.aj-auth-action-row{grid-template-columns:1fr}}
        `;

        document.head.appendChild(style);
    }
})();
