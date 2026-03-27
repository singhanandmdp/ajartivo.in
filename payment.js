(function () {
    const services = window.AjArtivoSupabase;
    if (!services) return;

    const BACKEND_BASE_URL = "http://localhost:5000";

    window.AjArtivoPayment = {
        startDownloadFlow: startDownloadFlow,
        buyNow: buyNow,
        hasDownloadAccess: hasDownloadAccess,
        isSignedIn: isSignedIn,
        isPremiumDesign: isPremiumDesign,
        toggleWishlist: toggleWishlist,
        isInWishlist: isInWishlist
    };

    let downloadPopupState = null;
    let loginPopupState = null;

    async function startDownloadFlow(product) {
        const item = services.normalizeProduct(product);

        if (!item.id) {
            alert("Product not found.");
            return;
        }

        const authContext = await getAuthContext({
            reason: hasDownloadAccess(item) ? "download" : "buy"
        });
        if (!authContext) {
            return;
        }

        if (!hasDownloadAccess(item) && isPremiumDesign(item)) {
            await buyNow(item, authContext);
            return;
        }

        await downloadFile(item, authContext);
    }

    async function buyNow(product, authOverride) {
        const item = services.normalizeProduct(product);

        if (hasDownloadAccess(item)) {
            const authContext = authOverride || await getAuthContext({ reason: "download" });
            if (!authContext) {
                return;
            }

            await downloadFile(item, authContext);
            return;
        }

        const authContext = authOverride || await getAuthContext({ reason: "buy" });
        if (!authContext) {
            return;
        }

        await openCheckout(item, authContext);
    }

    async function openCheckout(product, authContext) {
        if (typeof window.Razorpay === "undefined") {
            alert("Payment system failed to load.");
            return;
        }

        let order;
        try {
            order = await createOrder(product, authContext);
        } catch (error) {
            console.error("[AJartivo Payment] order creation failed", error);
            alert(error && error.message ? error.message : "Unable to create payment order right now.");
            return;
        }

        if (order && order.alreadyPurchased) {
            const unlockedProduct = markProductAsPurchased(product);
            emitPurchaseCompleted(unlockedProduct, authContext, order);
            await downloadFile(unlockedProduct, authContext);
            return;
        }

        const checkout = new window.Razorpay({
            key: cleanText(order && order.key),
            amount: Number(order && order.amount || 0),
            currency: cleanText(order && order.currency) || "INR",
            name: "AJartivo",
            description: product.title || "Design Purchase",
            order_id: cleanText(order && order.order_id),
            handler: async function (response) {
                try {
                    const result = await verifyPayment({
                        razorpay_order_id: response.razorpay_order_id,
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_signature: response.razorpay_signature,
                        product_id: product.id
                    }, authContext);

                    if (!result || result.success !== true) {
                        throw new Error("Payment verification failed.");
                    }

                    const unlockedProduct = markProductAsPurchased(product);
                    emitPurchaseCompleted(unlockedProduct, authContext, result);
                    await downloadFile(unlockedProduct, authContext);
                } catch (error) {
                    console.error("[AJartivo Payment] payment verification failed", error);
                    alert(error && error.message ? error.message : "Payment was completed, but verification failed.");
                }
            },
            prefill: buildPrefill(authContext),
            notes: {
                product_id: cleanText(product && product.id),
                user_id: cleanText(authContext && authContext.id)
            },
            theme: {
                color: "#1e3a8a"
            }
        });

        checkout.on("payment.failed", function (response) {
            const reason = response && response.error && response.error.description
                ? response.error.description
                : "Payment failed. Please try again.";
            console.error("[AJartivo Payment] checkout payment.failed", response);
            alert(reason);
        });

        checkout.open();
    }

    function buildPrefill(authContext) {
        const session = services.getSession ? services.getSession() : null;
        return {
            name: cleanText(authContext && authContext.name) || cleanText(session && session.name),
            email: cleanText(authContext && authContext.email) || cleanText(session && session.email)
        };
    }

    async function createOrder(product, authContext) {
        return postJson("/create-order", {
            product_id: cleanText(product && product.id)
        }, authContext);
    }

    async function verifyPayment(payload, authContext) {
        return postJson("/verify-payment", payload, authContext);
    }

    async function postJson(route, payload, authContext) {
        const endpoint = `${BACKEND_BASE_URL}${route}`;
        let response;

        try {
            response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    ...buildAuthHeaders(authContext),
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload || {})
            });
        } catch (error) {
            throw mapPaymentRequestError(error, endpoint);
        }

        const data = await response.json().catch(function () {
            return {};
        });

        if (!response.ok) {
            throw new Error(data.error || `Request failed. HTTP ${response.status}`);
        }

        return data;
    }

    async function getAuthContext(options) {
        let authSession = await readAuthSession();

        if (!authSession) {
            const loginResult = await openLoginPopup(options);
            if (!loginResult) {
                return null;
            }

            authSession = await readAuthSession();
        }

        if (!authSession || !authSession.user || !cleanText(authSession.access_token)) {
            alert("Authentication failed. Please log in again.");
            return null;
        }

        return {
            id: cleanText(authSession.user.id),
            email: cleanText(authSession.user.email).toLowerCase(),
            name: cleanText(
                authSession.user.user_metadata &&
                (authSession.user.user_metadata.full_name || authSession.user.user_metadata.name)
            ),
            accessToken: cleanText(authSession.access_token),
            sessionUser: services.getSession ? services.getSession() : null
        };
    }

    async function readAuthSession() {
        if (services.getAuthSession) {
            return services.getAuthSession();
        }

        if (services.client && services.client.auth && typeof services.client.auth.getSession === "function") {
            const result = await services.client.auth.getSession();
            return result && result.data ? result.data.session : null;
        }

        return null;
    }

    function buildAuthHeaders(authContext) {
        return {
            "Authorization": `Bearer ${cleanText(authContext && authContext.accessToken)}`
        };
    }

    function getCurrentSession() {
        const session = services.getSession ? services.getSession() : null;
        const email = cleanText(session && session.email).toLowerCase();
        if (!email) {
            return null;
        }

        return session;
    }

    function isSignedIn() {
        return Boolean(getCurrentSession());
    }

    async function openLoginPopup(options) {
        if (loginPopupState && loginPopupState.promise) {
            return loginPopupState.promise;
        }

        ensureLoginPopupStyles();

        const reason = cleanText(options && options.reason).toLowerCase() === "buy" ? "buy" : "download";
        const title = reason === "buy" ? "Log in to Buy" : "Log in to Download";
        const subtitle = reason === "buy"
            ? "Sign in to continue with this purchase."
            : "Sign in to continue with this download.";

        const wrapper = document.createElement("div");
        wrapper.className = "aj-login-modal";
        wrapper.hidden = true;
        wrapper.style.display = "none";
        wrapper.innerHTML = `
            <div class="aj-login-backdrop"></div>
            <div class="aj-login-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
                <button type="button" class="aj-login-close" aria-label="Close">x</button>
                <p class="aj-login-kicker">AJartivo Access</p>
                <h3 class="aj-login-title">${escapeHtml(title)}</h3>
                <p class="aj-login-subtitle">${escapeHtml(subtitle)}</p>
                <p class="aj-login-error" hidden></p>
                <label class="aj-login-field">
                    <span>Email</span>
                    <input type="email" class="aj-login-input aj-login-email" placeholder="Email address" autocomplete="email">
                </label>
                <label class="aj-login-field">
                    <span>Password</span>
                    <input type="password" class="aj-login-input aj-login-password" placeholder="Password" autocomplete="current-password">
                </label>
                <button type="button" class="aj-login-submit">Log In</button>
                <div class="aj-login-actions">
                    <a class="aj-login-link" href="/signup.html">Create account</a>
                    <a class="aj-login-link" href="/login.html">Open full login page</a>
                </div>
            </div>
        `;

        document.body.appendChild(wrapper);
        wrapper.hidden = false;
        wrapper.style.display = "grid";
        document.body.classList.add("aj-login-open");

        const emailInput = wrapper.querySelector(".aj-login-email");
        const passwordInput = wrapper.querySelector(".aj-login-password");
        const submitButton = wrapper.querySelector(".aj-login-submit");
        const closeButton = wrapper.querySelector(".aj-login-close");
        const backdrop = wrapper.querySelector(".aj-login-backdrop");
        const errorNode = wrapper.querySelector(".aj-login-error");

        loginPopupState = {
            root: wrapper,
            promise: new Promise(function (resolve) {
                let closed = false;

                const cleanup = function () {
                    if (closed) return;
                    closed = true;
                    document.body.classList.remove("aj-login-open");
                    wrapper.remove();
                    loginPopupState = null;
                };

                const finish = function (session) {
                    cleanup();
                    resolve(session || null);
                };

                const showError = function (message) {
                    if (!errorNode) return;
                    const text = cleanText(message);
                    errorNode.hidden = !text;
                    errorNode.textContent = text;
                };

                const close = function () {
                    finish(null);
                };

                const submit = async function () {
                    const email = cleanText(emailInput && emailInput.value).toLowerCase();
                    const password = cleanText(passwordInput && passwordInput.value);

                    if (!isValidEmail(email)) {
                        showError("Enter a valid email address.");
                        return;
                    }

                    if (!password) {
                        showError("Enter your password.");
                        return;
                    }

                    submitButton.disabled = true;
                    submitButton.textContent = "Logging in...";
                    showError("");

                    try {
                        const session = services.signIn
                            ? await services.signIn(email, password)
                            : null;

                        if (!session || !cleanText(session.email)) {
                            throw new Error("Login was successful, but session could not be loaded.");
                        }

                        finish(session);
                    } catch (error) {
                        console.error("[AJartivo Payment] login popup sign-in failed", error);
                        showError(mapLoginError(error));
                        submitButton.disabled = false;
                        submitButton.textContent = "Log In";
                    }
                };

                if (closeButton) {
                    closeButton.addEventListener("click", close);
                }

                if (backdrop) {
                    backdrop.addEventListener("click", close);
                }

                wrapper.addEventListener("keydown", function (event) {
                    if (event.key === "Escape") {
                        close();
                    }
                });

                if (submitButton) {
                    submitButton.addEventListener("click", submit);
                }

                if (passwordInput) {
                    passwordInput.addEventListener("keydown", function (event) {
                        if (event.key === "Enter") {
                            submit();
                        }
                    });
                }

                if (emailInput) {
                    emailInput.focus();
                }
            })
        };

        return loginPopupState.promise;
    }

    async function downloadFile(product, authContext) {
        const fileName = buildDownloadFileName(product, "");
        const popupControls = showDownloadPopup({
            title: cleanText(product.title) || "Preparing your file",
            fileName: fileName,
            onRetry: async function () {
                await attemptDownload();
            }
        });

        async function attemptDownload() {
            if (popupControls) {
                popupControls.setStatus("Preparing your secure download...");
            }

            const response = await fetch(`${BACKEND_BASE_URL}/download/${encodeURIComponent(product.id)}`, {
                method: "GET",
                headers: buildAuthHeaders(authContext)
            });

            if (!response.ok) {
                throw new Error(await readErrorMessage(response, "Unable to download this file."));
            }

            const resolvedFileName = parseFileNameFromDisposition(response.headers.get("Content-Disposition")) || fileName;
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);

            triggerBrowserDownload(objectUrl, resolvedFileName);
            services.addDownloadHistoryItem({
                ...product,
                download_link: resolvedFileName
            });

            window.setTimeout(function () {
                URL.revokeObjectURL(objectUrl);
            }, 30000);

            if (popupControls) {
                popupControls.setStatus("Download started. If it does not begin, use Download again.");
            }
        }

        try {
            await attemptDownload();
        } catch (error) {
            console.error("[AJartivo Payment] secure download failed", error);
            if (popupControls) {
                popupControls.setStatus(cleanText(error && error.message) || "Download failed.");
            }
            alert(error && error.message ? error.message : "Unable to download this file right now.");
        }
    }

    function isPremiumDesign(product) {
        const item = services.normalizeProduct(product);
        return item.is_free !== true && (item.is_paid === true || Number(item.price || 0) > 0);
    }

    function hasDownloadAccess(product) {
        const item = services.normalizeProduct(product);
        return item.is_free === true || item.has_access === true || item.isPurchased === true || item.is_purchased === true;
    }

    async function toggleWishlist(product) {
        const item = services.normalizeProduct(product);

        if (!item.id) {
            throw new Error("Product not found.");
        }

        if (services.isWishlisted(item.id)) {
            services.removeWishlistItem(item.id);
            return { saved: false };
        }

        services.addWishlistItem(item);
        return { saved: true };
    }

    async function isInWishlist(productId) {
        return services.isWishlisted(productId);
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

    function buildDownloadFileName(product, url) {
        const title = cleanText(product.title) || "file";
        const baseName = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "file";
        const extension = resolveFileExtension(product, url);
        return `aj-${baseName}${extension}`;
    }

    function resolveFileExtension(product, url) {
        const path = cleanText(url).split("?")[0].split("#")[0];
        const fileName = path.split("/").pop() || "";
        const directMatch = fileName.match(/(\.[a-z0-9]{2,8})$/i);
        if (directMatch) {
            return directMatch[1].toLowerCase();
        }

        const category = cleanText(product.category).replace(/^\./, "");
        return category ? `.${category.toLowerCase()}` : "";
    }

    function parseFileNameFromDisposition(contentDisposition) {
        const value = cleanText(contentDisposition);
        if (!value) {
            return "";
        }

        const utfMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
        if (utfMatch && utfMatch[1]) {
            return decodeURIComponent(utfMatch[1]);
        }

        const plainMatch = value.match(/filename="?([^"]+)"?/i);
        return plainMatch && plainMatch[1] ? plainMatch[1] : "";
    }

    async function readErrorMessage(response, fallbackMessage) {
        try {
            const data = await response.json();
            return cleanText(data && data.error) || fallbackMessage;
        } catch (_error) {
            return fallbackMessage;
        }
    }

    function showDownloadPopup(options) {
        ensureDownloadPopup();
        if (!downloadPopupState) return null;

        const title = cleanText(options && options.title) || "Preparing download";
        const fileName = cleanText(options && options.fileName) || "aj-file";
        const onRetry = options && typeof options.onRetry === "function" ? options.onRetry : function () {};

        downloadPopupState.title.textContent = title;
        downloadPopupState.file.textContent = fileName;
        downloadPopupState.status.textContent = "We are preparing your file.";
        downloadPopupState.countdown.textContent = "12";
        downloadPopupState.root.hidden = false;
        downloadPopupState.root.style.display = "grid";
        document.body.classList.add("aj-download-open");

        if (downloadPopupState.timerId) {
            window.clearInterval(downloadPopupState.timerId);
        }

        let remaining = 12;
        downloadPopupState.timerId = window.setInterval(function () {
            remaining -= 1;
            if (remaining <= 0) {
                remaining = 0;
                window.clearInterval(downloadPopupState.timerId);
                downloadPopupState.timerId = null;
                downloadPopupState.status.textContent = "If your file has not started yet, use Download again.";
            }
            downloadPopupState.countdown.textContent = String(remaining);
        }, 1000);

        downloadPopupState.retry.onclick = async function () {
            downloadPopupState.status.textContent = "Trying the download again...";
            await onRetry();
        };

        return {
            setStatus: function (message) {
                downloadPopupState.status.textContent = cleanText(message) || "We are preparing your file.";
            }
        };
    }

    function ensureDownloadPopup() {
        if (downloadPopupState && downloadPopupState.root) return;

        ensureDownloadPopupStyles();

        const wrapper = document.createElement("div");
        wrapper.className = "aj-download-modal";
        wrapper.hidden = true;
        wrapper.style.display = "none";
        wrapper.innerHTML = `
            <div class="aj-download-backdrop"></div>
            <div class="aj-download-dialog" role="dialog" aria-modal="true" aria-label="Download status">
                <button type="button" class="aj-download-close" aria-label="Close">x</button>
                <p class="aj-download-kicker">Download status</p>
                <h3 class="aj-download-title"></h3>
                <p class="aj-download-file"></p>
                <div class="aj-download-countdown-wrap">
                    <span class="aj-download-countdown-label">Retry timer</span>
                    <strong class="aj-download-countdown">12</strong>
                </div>
                <p class="aj-download-status">We are preparing your file.</p>
                <button type="button" class="aj-download-retry">Download again</button>
            </div>
        `;

        document.body.appendChild(wrapper);

        const dialog = wrapper.querySelector(".aj-download-dialog");
        const backdrop = wrapper.querySelector(".aj-download-backdrop");
        const closeButton = wrapper.querySelector(".aj-download-close");

        const close = function () {
            wrapper.hidden = true;
            wrapper.style.display = "none";
            document.body.classList.remove("aj-download-open");
            if (downloadPopupState && downloadPopupState.timerId) {
                window.clearInterval(downloadPopupState.timerId);
                downloadPopupState.timerId = null;
            }
        };

        if (backdrop) {
            backdrop.addEventListener("click", close);
        }

        if (closeButton) {
            closeButton.addEventListener("click", close);
        }

        wrapper.addEventListener("click", function (event) {
            if (dialog && !dialog.contains(event.target)) {
                close();
            }
        }, true);

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && downloadPopupState && !downloadPopupState.root.hidden) {
                close();
            }
        });

        downloadPopupState = {
            root: wrapper,
            title: wrapper.querySelector(".aj-download-title"),
            file: wrapper.querySelector(".aj-download-file"),
            countdown: wrapper.querySelector(".aj-download-countdown"),
            status: wrapper.querySelector(".aj-download-status"),
            retry: wrapper.querySelector(".aj-download-retry"),
            timerId: null
        };
    }

    function ensureDownloadPopupStyles() {
        if (document.getElementById("ajDownloadPopupStyles")) return;

        const style = document.createElement("style");
        style.id = "ajDownloadPopupStyles";
        style.textContent = `
            body.aj-download-open { overflow: hidden; }
            .aj-download-modal { position: fixed; inset: 0; z-index: 7000; place-items: center; padding: 20px; }
            .aj-download-backdrop { position: absolute; inset: 0; background: rgba(8, 15, 31, 0.66); backdrop-filter: blur(6px); }
            .aj-download-dialog { position: relative; z-index: 1; width: min(92vw, 430px); padding: 28px; border-radius: 28px; background: linear-gradient(180deg, #fffdf8 0%, #fff8ee 100%); border: 1px solid rgba(251, 191, 36, 0.22); box-shadow: 0 30px 70px rgba(15, 23, 42, 0.28); display: grid; gap: 14px; text-align: center; }
            .aj-download-close { position: absolute; top: 14px; right: 14px; width: 38px; height: 38px; border: none; border-radius: 50%; background: rgba(226, 232, 240, 0.92); color: #0f172a; cursor: pointer; font-size: 18px; font-weight: 700; }
            .aj-download-kicker { margin: 0; color: #b45309; font-size: 12px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
            .aj-download-title { margin: 0; color: #0f172a; font-size: 30px; line-height: 1.12; }
            .aj-download-file { margin: 0; color: #64748b; word-break: break-word; font-size: 15px; }
            .aj-download-countdown-wrap { display: grid; gap: 6px; justify-items: center; padding: 16px; border-radius: 22px; background: linear-gradient(180deg, #fff4d9, #fef3c7); color: #0f172a; border: 1px solid rgba(245, 158, 11, 0.18); }
            .aj-download-countdown-label { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #92400e; }
            .aj-download-countdown { font-size: 46px; line-height: 1; color: #111827; }
            .aj-download-status { margin: 0; color: #334155; line-height: 1.65; font-size: 16px; }
            .aj-download-retry { min-height: 50px; border: none; border-radius: 16px; background: linear-gradient(135deg, #d97706, #f59e0b); color: #fff; cursor: pointer; font-weight: 800; }
        `;
        document.head.appendChild(style);
    }

    function markProductAsPurchased(product) {
        return services.normalizeProduct({
            ...product,
            has_access: true,
            isPurchased: true,
            is_purchased: true
        });
    }

    function emitPurchaseCompleted(product, authContext, result) {
        window.dispatchEvent(new CustomEvent("ajartivo:purchase-completed", {
            detail: {
                productId: cleanText(product && product.id),
                userId: cleanText(authContext && authContext.id),
                userEmail: cleanText(authContext && authContext.email).toLowerCase(),
                amount: Number(result && result.amount || 0),
                paymentId: cleanText(result && result.payment_id),
                product: product || null
            }
        }));
    }

    function ensureLoginPopupStyles() {
        if (document.getElementById("ajLoginPopupStyles")) return;

        const style = document.createElement("style");
        style.id = "ajLoginPopupStyles";
        style.textContent = `
            body.aj-login-open { overflow: hidden; }
            .aj-login-modal { position: fixed; inset: 0; z-index: 7100; place-items: center; padding: 20px; }
            .aj-login-backdrop { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.58); backdrop-filter: blur(6px); }
            .aj-login-dialog { position: relative; z-index: 1; width: min(92vw, 440px); display: grid; gap: 14px; padding: 28px; border-radius: 28px; background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); box-shadow: 0 28px 80px rgba(15, 23, 42, 0.24); }
            .aj-login-close { position: absolute; top: 14px; right: 14px; width: 38px; height: 38px; border: none; border-radius: 50%; background: #e2e8f0; color: #0f172a; cursor: pointer; font-size: 18px; font-weight: 700; }
            .aj-login-kicker { margin: 0; color: #2563eb; font-size: 12px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
            .aj-login-title { margin: 0; color: #0f172a; font-size: 30px; line-height: 1.1; }
            .aj-login-subtitle { margin: 0; color: #475569; font-size: 15px; line-height: 1.6; }
            .aj-login-error { margin: 0; min-height: 20px; color: #dc2626; font-size: 14px; }
            .aj-login-field { display: grid; gap: 8px; color: #0f172a; font-size: 14px; font-weight: 600; }
            .aj-login-input { min-height: 48px; width: 100%; border: 1px solid #cbd5e1; border-radius: 16px; padding: 0 14px; font: inherit; color: #0f172a; background: #fff; }
            .aj-login-submit { min-height: 50px; border: none; border-radius: 16px; background: linear-gradient(135deg, #1d4ed8, #2563eb); color: #fff; font-weight: 800; cursor: pointer; }
            .aj-login-submit:disabled { opacity: 0.7; cursor: wait; }
            .aj-login-actions { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
            .aj-login-link { color: #1d4ed8; text-decoration: none; font-weight: 700; }
        `;
        document.head.appendChild(style);
    }

    function mapLoginError(error) {
        const message = cleanText(error && (error.message || error.error_description || error.code)).toLowerCase();

        if (message.includes("invalid login credentials")) {
            return "Incorrect email or password.";
        }

        if (message.includes("email not confirmed")) {
            return "Please verify your email before logging in.";
        }

        if (message.includes("failed to fetch") || message.includes("network")) {
            return "Network error. Please check your connection and try again.";
        }

        return cleanText(error && error.message) || "Login failed. Please try again.";
    }

    function mapPaymentRequestError(error, endpoint) {
        const message = cleanText(error && error.message).toLowerCase();

        if (message.includes("failed to fetch") || message.includes("network")) {
            return new Error(`Payment backend is not reachable at ${endpoint}. Start the backend server and try again.`);
        }

        return error instanceof Error ? error : new Error("Payment request failed.");
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function cleanText(value) {
        return String(value || "").trim();
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
    }
})();
