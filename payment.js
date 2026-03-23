(function () {
    const services = window.AjArtivoFirebase;
    if (!services) return;

    const FRONTEND_RAZORPAY_KEY = "rzp_live_SUjeQN7Wu5zSJz";
    const projectId = cleanString(services.config && services.config.projectId);
    const functionRegion = cleanString(window.AJARTIVO_FUNCTION_REGION) || "us-central1";
    const FUNCTION_BASE = projectId
        ? `https://${functionRegion}-${projectId}.cloudfunctions.net`
        : "https://us-central1-ajartivo.cloudfunctions.net";

    window.AjArtivoPayment = {
        startDownloadFlow: startDownloadFlow,
        isPremiumDesign: isPremiumDesign
    };

    let loginModalState = null;

    // Main download entry point for both FREE and PREMIUM designs.
    async function startDownloadFlow(design) {
        if (!design || !design.id) {
            alert("Design not found.");
            return;
        }

        const premium = isPremiumDesign(design);

        if (!premium) {
            const directDownloadUrl = resolveDirectDownloadUrl(design);
            if (!directDownloadUrl) {
                alert("Download file not found for this design.");
                return;
            }

            downloadFile(directDownloadUrl, buildDownloadFileName(design, directDownloadUrl));
            return;
        }

        const user = await requireVerifiedUser();
        if (!user) return;

        const directDownloadUrl = resolveDirectDownloadUrl(design);
        if (!directDownloadUrl) {
            alert("Download URL not found for this premium design.");
            return;
        }

        await openDirectCheckout(design, directDownloadUrl, user);
    }

    function resolveDirectDownloadUrl(design) {
        const candidates = [
            design && design.downloadUrl,
            design && design.fileUrl,
            design && design.zipUrl,
            design && design.downloadLink,
            design && design.fileLink,
            design && design.url,
            design && design.sourceFile,
            design && design.sourceUrl
        ];

        for (const candidate of candidates) {
            const value = cleanString(candidate);
            if (value) {
                return value;
            }
        }

        return "";
    }

    async function openDirectCheckout(design, downloadUrl, user) {
        if (typeof Razorpay === "undefined") {
            alert("Razorpay checkout failed to load.");
            return;
        }

        const amount = Number(design && design.price ? design.price : 0);
        const amountInPaise = Math.round(amount * 100);

        if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
            alert("Invalid premium amount.");
            return;
        }

        const checkout = new Razorpay({
            key: FRONTEND_RAZORPAY_KEY,
            amount: amountInPaise,
            currency: "INR",
            name: "AJartivo",
            description: "Design Purchase",
            handler: function () {
                alert("Payment Successful");
                downloadFile(downloadUrl, buildDownloadFileName(design, downloadUrl));
            },
            prefill: {
                name: user && user.displayName ? user.displayName : "",
                email: user && user.email ? user.email : ""
            },
            theme: {
                color: "#2563eb"
            },
            modal: {
                ondismiss: function () {
                    alert("Payment cancelled.");
                }
            }
        });

        checkout.on("payment.failed", function (response) {
            const reason = response && response.error && response.error.description
                ? response.error.description
                : "Payment failed. Please try again.";
            alert(reason);
        });

        checkout.open();
    }

    function isPremiumDesign(design) {
        if (!design) return false;

        const declaredType = String(design.accessType || design.tier || design.plan || "")
            .trim()
            .toUpperCase();

        if (declaredType === "PREMIUM") return true;
        if (declaredType === "FREE") return false;

        const amount = Number(design.price || 0);
        return Number.isFinite(amount) && amount > 0;
    }

    async function requireVerifiedUser() {
        const user = services.auth.currentUser;
        if (!user) {
            const loggedInUser = await openLoginPopup();
            if (!loggedInUser) return null;
            await loggedInUser.reload();
            if (!loggedInUser.emailVerified && requiresEmailVerification(loggedInUser)) {
                alert("Please verify your email first.");
                return null;
            }
            return loggedInUser;
        }

        await user.reload();
        if (!user.emailVerified && requiresEmailVerification(user)) {
            alert("Please verify your email first.");
            return null;
        }

        return user;
    }

    function requiresEmailVerification(user) {
        if (!user || !Array.isArray(user.providerData)) return false;
        return user.providerData.some(function (provider) {
            return provider && provider.providerId === "password";
        });
    }

    async function openLoginPopup() {
        if (loginModalState && loginModalState.promise) {
            return loginModalState.promise;
        }

        loginModalState = {};
        ensureLoginModalStyles();

        const wrapper = document.createElement("div");
        wrapper.className = "aj-login-modal";
        wrapper.innerHTML = `
            <div class="aj-login-backdrop"></div>
            <div class="aj-login-dialog" role="dialog" aria-modal="true" aria-label="Login Required">
                <button type="button" class="aj-login-close" aria-label="Close">x</button>
                <div class="aj-login-logo-wrap">
                    <img src="/images/logo.png" alt="AJ Artivo">
                </div>
                <h3>Welcome back</h3>
                <p>Login to continue download</p>
                <div class="aj-login-error" id="ajLoginError"></div>
                <input type="email" id="ajLoginEmail" placeholder="Email address">
                <input type="password" id="ajLoginPassword" placeholder="Password">
                <button type="button" class="aj-login-submit" id="ajLoginSubmit">Login</button>
                <div class="aj-login-social">
                    <button type="button" id="ajLoginGoogle">Google</button>
                    <button type="button" id="ajLoginFacebook">Facebook</button>
                </div>
                <a href="/signup.html" class="aj-login-signup">Create account</a>
            </div>
        `;

        document.body.appendChild(wrapper);
        document.body.classList.add("aj-login-open");

        const closeBtn = wrapper.querySelector(".aj-login-close");
        const backdrop = wrapper.querySelector(".aj-login-backdrop");
        const submitBtn = wrapper.querySelector("#ajLoginSubmit");
        const googleBtn = wrapper.querySelector("#ajLoginGoogle");
        const facebookBtn = wrapper.querySelector("#ajLoginFacebook");
        const emailInput = wrapper.querySelector("#ajLoginEmail");
        const passwordInput = wrapper.querySelector("#ajLoginPassword");
        const errorBox = wrapper.querySelector("#ajLoginError");

        const cleanup = () => {
            document.body.classList.remove("aj-login-open");
            wrapper.remove();
            loginModalState = null;
        };

        const resolveAndClose = (user) => {
            if (loginModalState && typeof loginModalState.resolve === "function") {
                loginModalState.resolve(user || null);
            }
            cleanup();
        };

        const showError = (message) => {
            if (!errorBox) return;
            errorBox.textContent = message || "";
            errorBox.style.display = message ? "block" : "none";
        };

        const toReadableAuthError = (error) => {
            const code = String(error && error.code ? error.code : "");
            if (code === "auth/wrong-password" || code === "auth/user-not-found") return "Invalid email or password.";
            if (code === "auth/too-many-requests") return "Too many attempts. Try again later.";
            if (code === "auth/popup-closed-by-user") return "";
            return error && error.message ? error.message : "Login failed.";
        };

        closeBtn.addEventListener("click", () => resolveAndClose(null));
        backdrop.addEventListener("click", () => resolveAndClose(null));

        const onEsc = (event) => {
            if (event.key === "Escape") {
                resolveAndClose(null);
            }
        };
        document.addEventListener("keydown", onEsc, { once: true });

        const setBusy = (busy) => {
            [submitBtn, googleBtn, facebookBtn].forEach((btn) => {
                if (btn) btn.disabled = busy;
            });
        };

        submitBtn.addEventListener("click", async () => {
            const email = (emailInput.value || "").trim().toLowerCase();
            const password = passwordInput.value || "";
            if (!email || !password) {
                showError("Enter email and password.");
                return;
            }

            setBusy(true);
            showError("");
            try {
                const credential = await services.auth.signInWithEmailAndPassword(email, password);
                resolveAndClose(credential.user || null);
            } catch (error) {
                showError(toReadableAuthError(error));
                setBusy(false);
            }
        });

        googleBtn.addEventListener("click", async () => {
            setBusy(true);
            showError("");
            try {
                const provider = new firebase.auth.GoogleAuthProvider();
                const credential = await services.auth.signInWithPopup(provider);
                resolveAndClose(credential.user || null);
            } catch (error) {
                const message = toReadableAuthError(error);
                if (message) showError(message);
                setBusy(false);
            }
        });

        facebookBtn.addEventListener("click", async () => {
            setBusy(true);
            showError("");
            try {
                const provider = new firebase.auth.FacebookAuthProvider();
                const credential = await services.auth.signInWithPopup(provider);
                resolveAndClose(credential.user || null);
            } catch (error) {
                const message = toReadableAuthError(error);
                if (message) showError(message);
                setBusy(false);
            }
        });

        emailInput.focus();

        loginModalState.promise = new Promise((resolve) => {
            loginModalState.resolve = resolve;
        });
        return loginModalState.promise;
    }

    function ensureLoginModalStyles() {
        if (document.getElementById("ajLoginModalStyles")) return;
        const style = document.createElement("style");
        style.id = "ajLoginModalStyles";
        style.textContent = `
            body.aj-login-open { overflow: hidden; }
            .aj-login-modal { position: fixed; inset: 0; z-index: 6000; display: grid; place-items: center; }
            .aj-login-backdrop { position: absolute; inset: 0; background: rgba(2, 6, 23, 0.62); backdrop-filter: blur(4px); }
            .aj-login-dialog { position: relative; width: min(92vw, 430px); border-radius: 24px; background: #f8fafc; padding: 26px 22px 22px; display: grid; gap: 12px; box-shadow: 0 28px 60px rgba(15, 23, 42, 0.28); }
            .aj-login-close { position: absolute; top: 12px; right: 12px; width: 34px; height: 34px; border: none; border-radius: 50%; background: #e2e8f0; color: #1e293b; cursor: pointer; font-weight: 700; }
            .aj-login-logo-wrap { width: 74px; height: 74px; margin: 0 auto 2px; border-radius: 18px; background: #ffffff; padding: 10px; box-shadow: 0 10px 22px rgba(15, 23, 42, 0.12); }
            .aj-login-logo-wrap img { width: 100%; height: 100%; object-fit: contain; }
            .aj-login-dialog h3 { margin: 0; text-align: center; color: #0f172a; font-size: 40px; }
            .aj-login-dialog p { margin: -2px 0 8px; text-align: center; color: #64748b; }
            .aj-login-dialog input { width: 100%; min-height: 48px; border-radius: 14px; border: 1px solid #cbd5e1; padding: 0 14px; background: #ffffff; }
            .aj-login-submit { min-height: 50px; border: none; border-radius: 14px; font-weight: 700; color: #fff; cursor: pointer; background: linear-gradient(135deg,#2563eb,#3b82f6); }
            .aj-login-social { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .aj-login-social button { min-height: 46px; border-radius: 14px; border: 1px solid #cbd5e1; background: #fff; font-weight: 700; color: #0f172a; cursor: pointer; }
            .aj-login-signup { text-align: center; color: #2563eb; font-weight: 700; text-decoration: none; }
            .aj-login-error { display: none; margin-top: -2px; color: #dc2626; font-size: 13px; text-align: center; }
        `;
        document.head.appendChild(style);
    }

    async function requestDownloadAccess(designId, token, allowPaymentRequired) {
        try {
            return await postSecure(
                "requestDownloadAccess",
                { designId: designId, nonce: generateNonce(designId) },
                token
            );
        } catch (error) {
            if (allowPaymentRequired && error && error.status === 402) {
                return { requiresPayment: true };
            }

            const message = readableError(error);
            alert(message);
            return null;
        }
    }

    async function openCheckoutAndVerify(orderPayload, design, token) {
        if (typeof Razorpay === "undefined") {
            alert("Razorpay checkout failed to load.");
            return;
        }

        const options = {
            key: String(orderPayload.keyId || "").trim(),
            amount: Number(orderPayload.amount || 0),
            currency: orderPayload.currency || "INR",
            name: "AJartivo",
            description: "Design Purchase",
            order_id: orderPayload.orderId,
            handler: async function (response) {
                try {
                    const verification = await postSecure(
                        "verifyPayment",
                        {
                            designId: design.id,
                            orderId: response.razorpay_order_id,
                            paymentId: response.razorpay_payment_id,
                            signature: response.razorpay_signature
                        },
                        token
                    );

                    if (!verification || !verification.downloadUrl) {
                        throw new Error("Payment verified but download link was not returned.");
                    }

                    alert("Payment Successful");
                    downloadFile(verification.downloadUrl, buildDownloadFileName(design, verification.downloadUrl));
                } catch (error) {
                    alert(readableError(error));
                }
            },
            prefill: {
                name: services.auth.currentUser?.displayName || "",
                email: services.auth.currentUser?.email || ""
            },
            theme: {
                color: "#2563eb"
            }
        };

        if (!options.key) {
            alert("Payment gateway key is not configured.");
            return;
        }

        const checkout = new Razorpay(options);
        checkout.on("payment.failed", function (response) {
            const reason = response && response.error && response.error.description
                ? response.error.description
                : "Payment failed. Please try again.";
            alert(reason);
        });

        checkout.open();
    }

    async function postSecure(endpoint, payload, idToken) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch(FUNCTION_BASE + "/" + endpoint, {
                method: "POST",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + idToken
                },
                body: JSON.stringify(payload || {}),
                signal: controller.signal
            });

            let body = {};
            try {
                body = await response.json();
            } catch (error) {
                body = {};
            }

            if (!response.ok) {
                const err = new Error(body.error || "Request failed.");
                err.status = response.status;
                err.payload = body;
                throw err;
            }

            return body;
        } catch (error) {
            if (error && error.name === "AbortError") {
                throw new Error("Request timed out. Please try again.");
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    async function downloadFile(url, fileName) {
        const cleanUrl = cleanString(url);
        if (!cleanUrl) {
            alert("Download URL is missing.");
            return;
        }

        const safeFileName = fileName || "aj-file";

        try {
            const response = await fetch(cleanUrl, { mode: "cors" });
            if (!response.ok) {
                throw new Error("Download request failed.");
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            triggerBrowserDownload(objectUrl, safeFileName);

            window.setTimeout(() => {
                URL.revokeObjectURL(objectUrl);
            }, 30000);
            return;
        } catch (error) {
            triggerBrowserDownload(cleanUrl, safeFileName);
        }
    }

    function triggerBrowserDownload(url, fileName) {
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName || "aj-file";
        link.rel = "noopener";
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    function buildDownloadFileName(design, url) {
        const title = cleanString((design && (design.title || design.name)) || "file");
        const baseName = slugify(title) || "file";
        const extension = resolveFileExtension(design, url);
        return `aj-${baseName}${extension}`;
    }

    function resolveFileExtension(design, url) {
        const urlPath = cleanString(url).split("?")[0].split("#")[0];
        const lastSegment = urlPath.split("/").pop() || "";
        const directMatch = lastSegment.match(/(\.[a-z0-9]{2,8})$/i);
        if (directMatch) {
            return directMatch[1].toLowerCase();
        }

        const rawExtension = cleanString(
            (design && (
                design.extension ||
                design.fileExtension ||
                design.fileType ||
                design.format ||
                design.category ||
                design.type
            )) || ""
        ).replace(/^\./, "");

        return rawExtension ? `.${rawExtension.toLowerCase()}` : "";
    }

    function slugify(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    }

    function generateNonce(designId) {
        const raw = `${designId}|${Date.now()}|${Math.random().toString(36).slice(2, 12)}`;
        return raw;
    }

    function readableError(error) {
        if (!error) return "Something went wrong.";
        if (error.message) return error.message;
        return "Something went wrong.";
    }

    function cleanString(value) {
        return String(value || "").trim();
    }
})();
