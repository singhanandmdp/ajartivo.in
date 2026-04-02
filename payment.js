(function () {
    const services = window.AjArtivoSupabase;
    if (!services) return;

    const LOCAL_BACKEND_BASE_URL = "http://localhost:5000";
    const LIVE_BACKEND_BASE_URL = "https://ajartivo-in.onrender.com";
    const API_BASE = resolveBackendBaseUrl();
    const BACKEND_REQUEST_TIMEOUT_MS = 15000;

    window.AjArtivoPayment = {
        startDownloadFlow: startDownloadFlow,
        buyNow: buyNow,
        upgradeToPremium: upgradeToPremium,
        fetchDownloadAccess: fetchDownloadAccess,
        refreshAccountSummary: refreshAccountSummary,
        hasDownloadAccess: hasDownloadAccess,
        isSignedIn: isSignedIn,
        isPremiumDesign: isPremiumDesign,
        toggleWishlist: toggleWishlist,
        isInWishlist: isInWishlist
    };

    let downloadPopupState = null;
    let loginPopupState = null;
    let accessPopupState = null;

    function resolveBackendBaseUrl() {
        const configuredUrl = cleanText(
            window.AJARTIVO_BACKEND_URL ||
            (document.querySelector('meta[name="ajartivo-backend-url"]') || {}).content
        );
        if (configuredUrl) {
            return configuredUrl.replace(/\/+$/, "");
        }

        const hostname = cleanText(window.location && window.location.hostname).toLowerCase();
        if (hostname === "localhost" || hostname === "127.0.0.1") {
            return LOCAL_BACKEND_BASE_URL;
        }

        return LIVE_BACKEND_BASE_URL;
    }

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

        if (isFreeDownload(item)) {
            await downloadFile(item, authContext);
            return;
        }

        try {
            const summary = await fetchDownloadAccess(item.id, authContext);
            if (summary && summary.access && summary.access.allowed === true) {
                await downloadFile(item, authContext);
                await refreshAccountSummary();
                emitAccountUpdated();
                return;
            }
            await openAccessPopup(item, summary, authContext);
        } catch (error) {
            console.error("[AJartivo Payment] access check failed", error);
            alert(error && error.message ? error.message : "Unable to check download access right now.");
        }
    }

    async function buyNow(product, authOverride) {
        const item = services.normalizeProduct(product);
        const authContext = authOverride || await getAuthContext({ reason: "buy" });
        if (!authContext) {
            return null;
        }

        return openDesignCheckout(item, authContext);
    }

    async function upgradeToPremium(authOverride) {
        const authContext = authOverride || await getAuthContext({ reason: "buy" });
        if (!authContext) {
            return null;
        }

        return openPremiumCheckout(authContext);
    }

    async function fetchDownloadAccess(designId, authContext) {
        const normalizedId = cleanText(designId);
        if (!normalizedId) {
            throw new Error("Design ID is required.");
        }

        return requestJson(`${API_BASE}/access/design/${encodeURIComponent(normalizedId)}`, {
            method: "GET",
            authContext: authContext
        });
    }

    async function refreshAccountSummary() {
        return services.refreshAccountSummary ? services.refreshAccountSummary() : services.getSession();
    }

    async function openDesignCheckout(product, authContext) {
        if (typeof window.Razorpay === "undefined") {
            throw new Error("Payment system failed to load.");
        }

        let order;
        order = await createOrder(product, authContext);

        if (order && order.alreadyPurchased) {
            const unlockedProduct = markProductAsPurchased(product);
            await refreshAccountSummary();
            emitPurchaseCompleted(unlockedProduct, authContext, order);
            await downloadFile(unlockedProduct, authContext);
            return order;
        }

        return new Promise(function (resolve, reject) {
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
                        await refreshAccountSummary();
                        emitPurchaseCompleted(unlockedProduct, authContext, result);
                        await downloadFile(unlockedProduct, authContext);
                        resolve(result);
                    } catch (error) {
                        reject(error);
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
                reject(new Error(reason));
            });

            checkout.open();
        });
    }

    function buildPrefill(authContext) {
        const session = services.getSession ? services.getSession() : null;
        return {
            name: cleanText(authContext && authContext.name) || cleanText(session && session.name),
            email: cleanText(authContext && authContext.email) || cleanText(session && session.email)
        };
    }

    async function createOrder(product, authContext) {
        return requestJson("/create-order", {
            method: "POST",
            authContext: authContext,
            payload: {
                product_id: cleanText(product && product.id)
            }
        });
    }

    async function verifyPayment(payload, authContext) {
        return requestJson("/verify-payment", {
            method: "POST",
            authContext: authContext,
            payload: payload
        });
    }

    async function createPremiumOrder(authContext) {
        return requestJson("/create-premium-order", {
            method: "POST",
            authContext: authContext,
            payload: {}
        });
    }

    async function verifyPremiumPayment(payload, authContext) {
        return requestJson("/verify-premium-payment", {
            method: "POST",
            authContext: authContext,
            payload: payload
        });
    }

    async function requestJson(route, options) {
        const settings = options || {};
        const endpoint = isAbsoluteUrl(route) ? route : `${API_BASE}${route}`;
        let response;
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        const timeoutId = controller
            ? window.setTimeout(function () {
                controller.abort();
            }, BACKEND_REQUEST_TIMEOUT_MS)
            : 0;

        try {
            response = await fetch(endpoint, {
                method: cleanText(settings.method) || "GET",
                headers: buildRequestHeaders(settings.authContext, settings.method),
                signal: controller ? controller.signal : undefined,
                body: cleanText(settings.method).toUpperCase() === "POST"
                    ? JSON.stringify(settings.payload || {})
                    : undefined
            });
        } catch (error) {
            throw mapPaymentRequestError(error, endpoint);
        } finally {
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
        }

        const responseText = await response.text().catch(function () {
            return "";
        });
        const data = parseJsonResponse(responseText);

        if (
            response.status === 401 &&
            settings.authContext &&
            settings._authRetry !== true
        ) {
            const refreshedAuthContext = await refreshAuthContext(settings.authContext);
            if (refreshedAuthContext) {
                return requestJson(route, {
                    ...settings,
                    authContext: refreshedAuthContext,
                    _authRetry: true
                });
            }
        }

        if (data === null && response.ok) {
            throw new Error(`Backend returned an invalid JSON response from ${endpoint}.`);
        }

        if (!response.ok) {
            const errorMessage = cleanText(
                data && (
                    data.error ||
                    data.message ||
                    data.details
                )
            );
            const statusText = cleanText(response.statusText);
            throw new Error(
                errorMessage ||
                (response.status === 404
                    ? `API endpoint not found: ${endpoint}`
                    : `Request failed. HTTP ${response.status}${statusText ? ` ${statusText}` : ""}`)
            );
        }

        return data;
    }

    async function openPremiumCheckout(authContext) {
        if (typeof window.Razorpay === "undefined") {
            throw new Error("Payment system failed to load.");
        }

        const order = await createPremiumOrder(authContext);
        if (order && order.alreadyPremium) {
            await refreshAccountSummary();
            emitAccountUpdated(order.account || null);
            return order;
        }

        return new Promise(function (resolve, reject) {
            const checkout = new window.Razorpay({
                key: cleanText(order && order.key),
                amount: Number(order && order.amount || 0),
                currency: cleanText(order && order.currency) || "INR",
                name: "AJartivo",
                description: cleanText(order && order.plan_name) || "Premium Subscription",
                order_id: cleanText(order && order.order_id),
                handler: async function (response) {
                    try {
                        const result = await verifyPremiumPayment({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature
                        }, authContext);

                        if (!result || result.success !== true) {
                            throw new Error("Premium verification failed.");
                        }

                        await refreshAccountSummary();
                        emitAccountUpdated(result.account || null);
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                },
                prefill: buildPrefill(authContext),
                notes: {
                    purchase_type: "premium_subscription",
                    user_id: cleanText(authContext && authContext.id)
                },
                theme: {
                    color: "#1e3a8a"
                }
            });

            checkout.on("payment.failed", function (response) {
                const reason = response && response.error && response.error.description
                    ? response.error.description
                    : "Premium payment failed. Please try again.";
                reject(new Error(reason));
            });

            checkout.open();
        });
    }

    async function getAuthContext(options) {
        if (services.refreshSession) {
            await services.refreshSession().catch(function () {
                return null;
            });
        }

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
            return services.getAuthSession({ sync: true });
        }

        if (services.client && services.client.auth && typeof services.client.auth.getSession === "function") {
            const result = await services.client.auth.getSession();
            return result && result.data ? result.data.session : null;
        }

        return null;
    }

    async function refreshAuthContext(authContext) {
        let refreshedSession = null;

        if (
            services.client &&
            services.client.auth &&
            typeof services.client.auth.refreshSession === "function"
        ) {
            const refreshResult = await services.client.auth.refreshSession().catch(function () {
                return null;
            });
            refreshedSession = refreshResult && refreshResult.data ? refreshResult.data.session : null;
        }

        if (!refreshedSession && services.getAuthSession) {
            refreshedSession = await services.getAuthSession({ sync: true }).catch(function () {
                return null;
            });
        }

        if (!refreshedSession || !refreshedSession.user || !cleanText(refreshedSession.access_token)) {
            return null;
        }

        return {
            id: cleanText(refreshedSession.user.id) || cleanText(authContext && authContext.id),
            email: cleanText(refreshedSession.user.email).toLowerCase() || cleanText(authContext && authContext.email).toLowerCase(),
            name: cleanText(
                refreshedSession.user.user_metadata &&
                (refreshedSession.user.user_metadata.full_name || refreshedSession.user.user_metadata.name)
            ) || cleanText(authContext && authContext.name),
            accessToken: cleanText(refreshedSession.access_token),
            sessionUser: services.getSession ? services.getSession() : null
        };
    }

    function buildRequestHeaders(authContext, method) {
        const headers = {
            "Authorization": `Bearer ${cleanText(authContext && authContext.accessToken)}`
        };

        if (cleanText(method).toUpperCase() === "POST") {
            headers["Content-Type"] = "application/json";
        }

        return headers;
    }

    function buildAuthHeaders(authContext) {
        return buildRequestHeaders(authContext, "GET");
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

        const accessBadge = reason === "buy" ? "Premium purchase access" : "Secure download access";
        const benefitOne = reason === "buy" ? "Fast checkout" : "Instant downloads";
        const benefitTwo = reason === "buy" ? "Verified payment" : "Secure access";
        const benefitThree = "Member benefits";
        const wrapper = document.createElement("div");
        wrapper.className = "aj-login-modal";
        wrapper.hidden = true;
        wrapper.style.display = "none";
        wrapper.innerHTML = `
            <div class="aj-login-backdrop"></div>
            <div class="aj-login-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
                <div class="aj-login-glow aj-login-glow-one" aria-hidden="true"></div>
                <div class="aj-login-glow aj-login-glow-two" aria-hidden="true"></div>
                <button type="button" class="aj-login-close" aria-label="Close">&times;</button>
                <div class="aj-login-hero">
                    <div class="aj-login-head">
                        <div class="aj-login-brand">
                            <p class="aj-login-kicker">AJartivo Access</p>
                            <span class="aj-login-badge">${escapeHtml(accessBadge)}</span>
                        </div>
                    </div>
                    <div class="aj-login-copy">
                        <h3 class="aj-login-title">${escapeHtml(title)}</h3>
                        <p class="aj-login-subtitle">${escapeHtml(subtitle)}</p>
                    </div>
                    <div class="aj-login-perks" aria-hidden="true">
                        <span>${escapeHtml(benefitOne)}</span>
                        <span>${escapeHtml(benefitTwo)}</span>
                        <span>${escapeHtml(benefitThree)}</span>
                    </div>
                    <div class="aj-login-trust" aria-hidden="true">
                        <strong>Secure member sign in</strong>
                        <span>Unlock your download access, order history, and premium benefits in one place.</span>
                    </div>
                </div>
                <div class="aj-login-form-shell">
                    <p class="aj-login-error" hidden></p>
                    <p class="aj-login-helper">Google sign-in is required before any download or purchase action.</p>
                    <button type="button" class="aj-login-submit aj-login-google">Continue with Google</button>
                    <div class="aj-login-actions">
                        <a class="aj-login-link" href="/signup.html">Create account</a>
                        <a class="aj-login-link aj-login-link-strong" href="/login.html">Open full login page</a>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(wrapper);
        wrapper.hidden = false;
        wrapper.style.display = "grid";
        document.body.classList.add("aj-login-open");

        const submitButton = wrapper.querySelector(".aj-login-submit");
        const closeButton = wrapper.querySelector(".aj-login-close");
        const backdrop = wrapper.querySelector(".aj-login-backdrop");
        const errorNode = wrapper.querySelector(".aj-login-error");
        const defaultSubmitText = submitButton ? submitButton.textContent : "Continue with Google";
        const redirectTo = window.location.href;

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
                    submitButton.disabled = true;
                    submitButton.textContent = "Redirecting...";
                    showError("");

                    try {
                        if (!services.signInWithOAuth) {
                            throw new Error("Google login is not available right now.");
                        }
                        await services.signInWithOAuth("google", redirectTo);
                    } catch (error) {
                        console.error("[AJartivo Payment] login popup sign-in failed", error);
                        showError(mapLoginError(error));
                        submitButton.disabled = false;
                        submitButton.textContent = defaultSubmitText;
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

                if (submitButton) {
                    submitButton.focus();
                }
            })
        };

        return loginPopupState.promise;
    }

    async function downloadFile(product, authContext) {
        const fileName = buildDownloadFileName(product, "");
        return new Promise(function (resolve) {
            let resolvedOnce = false;

            const popupControls = showDownloadPopup({
                title: cleanText(product.title) || "Preparing your file",
                fileName: fileName,
                waitSeconds: 8,
                onClose: function () {
                    if (!resolvedOnce) {
                        resolve(null);
                    }
                },
                onDownload: attemptDownload
            });

            async function attemptDownload() {
                if (popupControls) {
                    popupControls.setStatus("Preparing your secure download...");
                    popupControls.setAction({
                        disabled: true,
                        label: "Preparing..."
                    });
                }

                try {
                    const response = await fetch(`${API_BASE}/download/${encodeURIComponent(product.id)}`, {
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
                        popupControls.setStatus("Download started. If it does not begin, use Download Again.");
                        popupControls.setAction({
                            disabled: false,
                            label: "Download Again"
                        });
                    }

                    if (!resolvedOnce) {
                        resolvedOnce = true;
                        resolve({
                            started: true,
                            fileName: resolvedFileName
                        });
                    }
                } catch (error) {
                    console.error("[AJartivo Payment] secure download failed", error);
                    if (popupControls) {
                        popupControls.setStatus(cleanText(error && error.message) || "Download failed.");
                        popupControls.setAction({
                            disabled: false,
                            label: "Try Again"
                        });
                    }
                    alert(error && error.message ? error.message : "Unable to download this file right now.");
                }
            }
        });
    }

    function isPremiumDesign(product) {
        const item = services.normalizeProduct(product);
        return item.is_premium === true;
    }

    function hasDownloadAccess(product) {
        const item = services.normalizeProduct(product);
        return item.is_free === true || item.has_access === true || item.isPurchased === true || item.is_purchased === true;
    }

    function isFreeDownload(product) {
        const item = services.normalizeProduct(product);
        return item.is_free === true || (item.is_paid !== true && Number(item.price || 0) <= 0);
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
        const waitSeconds = normalizeCountdown(options && options.waitSeconds, 8);
        const onClose = options && typeof options.onClose === "function" ? options.onClose : function () {};
        const onDownload = options && typeof options.onDownload === "function" ? options.onDownload : function () {};

        downloadPopupState.title.textContent = title;
        downloadPopupState.file.textContent = fileName;
        downloadPopupState.status.textContent = `Please wait ${waitSeconds} seconds before starting the secure download.`;
        downloadPopupState.countdown.textContent = String(waitSeconds);
        downloadPopupState.onClose = onClose;
        downloadPopupState.root.hidden = false;
        downloadPopupState.root.style.display = "grid";
        document.body.classList.add("aj-download-open");
        downloadPopupState.action.disabled = true;
        downloadPopupState.action.textContent = `Download in ${waitSeconds}s`;

        if (downloadPopupState.timerId) {
            window.clearInterval(downloadPopupState.timerId);
        }

        let remaining = waitSeconds;
        downloadPopupState.timerId = window.setInterval(function () {
            remaining -= 1;
            if (remaining <= 0) {
                remaining = 0;
                window.clearInterval(downloadPopupState.timerId);
                downloadPopupState.timerId = null;
                downloadPopupState.status.textContent = "Your download is ready. Click Download Now.";
                downloadPopupState.action.disabled = false;
                downloadPopupState.action.textContent = "Download Now";
            }
            downloadPopupState.countdown.textContent = String(remaining);
        }, 1000);

        downloadPopupState.action.onclick = async function () {
            if (downloadPopupState.action.disabled) {
                return;
            }

            await onDownload();
        };

        return {
            setStatus: function (message) {
                downloadPopupState.status.textContent = cleanText(message) || "We are preparing your file.";
            },
            setAction: function (settings) {
                const nextSettings = settings || {};
                downloadPopupState.action.disabled = nextSettings.disabled === true;
                downloadPopupState.action.textContent = cleanText(nextSettings.label) || "Download Now";
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
                <div class="aj-download-topbar">
                    <div class="aj-download-brand">
                        <span class="aj-download-brand-mark" aria-hidden="true">AJ</span>
                        <div class="aj-download-brand-copy">
                            <strong>Ajartivo</strong>
                            <span>Secure delivery</span>
                        </div>
                    </div>
                    <span class="aj-download-badge">Download Status</span>
                </div>
                <button type="button" class="aj-download-close" aria-label="Close">&times;</button>
                <p class="aj-download-kicker">Protected file access</p>
                <h3 class="aj-download-title"></h3>
                <p class="aj-download-file"></p>
                <div class="aj-download-countdown-wrap">
                    <span class="aj-download-countdown-label">Secure timer</span>
                    <strong class="aj-download-countdown">8</strong>
                </div>
                <p class="aj-download-status">We are preparing your file.</p>
                <button type="button" class="aj-download-retry" disabled>Download in 8s</button>
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
            if (downloadPopupState && typeof downloadPopupState.onClose === "function") {
                const onClose = downloadPopupState.onClose;
                downloadPopupState.onClose = null;
                onClose();
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
            action: wrapper.querySelector(".aj-download-retry"),
            timerId: null,
            onClose: null
        };
    }

    function normalizeCountdown(value, fallbackValue) {
        const parsedValue = Number(value);
        if (Number.isFinite(parsedValue) && parsedValue >= 5 && parsedValue <= 10) {
            return parsedValue;
        }

        return fallbackValue;
    }

    async function openAccessPopup(product, summary, authContext) {
        ensureAccessPopup();
        if (!accessPopupState) return null;

        const popup = accessPopupState;
        popup.root.hidden = false;
        popup.root.style.display = "grid";
        document.body.classList.add("aj-access-open");

        const render = function (state) {
            const account = state && state.account ? state.account : {};
            const access = state && state.access ? state.access : {};
            const premiumActive = account.premium_active === true;
            const freeRemaining = Number(account.free_download_remaining || 0);
            const weeklyRemaining = Number(account.weekly_premium_remaining || 0);

            popup.kicker.textContent = premiumActive ? "AJartivo Premium Access" : "AJartivo Secure Download";
            popup.title.textContent = cleanText(product && product.title) || "AJartivo Design";
            popup.message.textContent = cleanText(access.message) || "Review your account access before downloading.";
            popup.freeStat.textContent = `You have ${freeRemaining} out of 5 free downloads remaining`;
            popup.premiumStat.textContent = premiumActive
                ? "Premium Active: Unlimited downloads"
                : "Premium inactive: Upgrade to unlock premium benefits";
            popup.weeklyStat.textContent = `You have ${weeklyRemaining} out of 2 premium downloads remaining this week`;

            popup.downloadBtn.disabled = access.allowed !== true;
            popup.downloadBtn.hidden = access.allowed !== true;
            popup.downloadBtn.textContent = "Download";
            popup.upgradeBtn.disabled = premiumActive === true;
            popup.upgradeBtn.hidden = access.can_upgrade !== true;
            popup.upgradeBtn.textContent = premiumActive === true ? "Premium Active" : "Upgrade to Premium";
            popup.buyBtn.disabled = access.can_buy !== true;
            popup.buyBtn.hidden = access.can_buy !== true;
            popup.buyBtn.textContent = "Buy Now";
        };

        render(summary);

        popup.downloadBtn.onclick = async function () {
            if (!summary || !summary.access || summary.access.allowed !== true) {
                return;
            }

            popup.downloadBtn.disabled = true;
            popup.downloadBtn.textContent = "Preparing...";

            try {
                await downloadFile(product, authContext);
                await refreshAccountSummary();
                emitAccountUpdated();
                closeAccessPopup();
            } catch (error) {
                console.error("[AJartivo Payment] secure download failed", error);
                alert(error && error.message ? error.message : "Unable to download this file right now.");
            } finally {
                const refreshedSummary = await fetchDownloadAccess(product.id, authContext).catch(function () {
                    return summary;
                });
                summary = refreshedSummary;
                render(summary);
            }
        };

        popup.upgradeBtn.onclick = async function () {
            if (popup.upgradeBtn.disabled) {
                return;
            }

            popup.upgradeBtn.disabled = true;
            popup.upgradeBtn.textContent = "Opening...";

            try {
                await openPremiumCheckout(authContext);
                await refreshAccountSummary();
                summary = await fetchDownloadAccess(product.id, authContext);
                render(summary);
            } catch (error) {
                console.error("[AJartivo Payment] premium checkout failed", error);
                alert(error && error.message ? error.message : "Unable to start premium upgrade.");
            } finally {
                popup.upgradeBtn.disabled = summary && summary.account && summary.account.premium_active === true;
                popup.upgradeBtn.textContent = popup.upgradeBtn.disabled ? "Premium Active" : "Upgrade to Premium";
            }
        };

        popup.buyBtn.onclick = async function () {
            if (popup.buyBtn.disabled) {
                return;
            }

            popup.buyBtn.disabled = true;
            popup.buyBtn.textContent = "Opening...";

            try {
                closeAccessPopup();
                await openDesignCheckout(product, authContext);
            } catch (error) {
                console.error("[AJartivo Payment] design checkout failed", error);
                alert(error && error.message ? error.message : "Unable to start the purchase flow.");
            } finally {
                popup.buyBtn.disabled = false;
                popup.buyBtn.textContent = "Buy This Design";
            }
        };
    }

    function ensureAccessPopup() {
        if (accessPopupState && accessPopupState.root) return;

        ensureAccessPopupStyles();

        const wrapper = document.createElement("div");
        wrapper.className = "aj-access-modal";
        wrapper.hidden = true;
        wrapper.style.display = "none";
        wrapper.innerHTML = `
            <div class="aj-access-backdrop"></div>
            <div class="aj-access-dialog" role="dialog" aria-modal="true" aria-label="Download access">
                <div class="aj-access-topbar">
                    <div class="aj-access-brand">
                        <span class="aj-access-brand-mark" aria-hidden="true">AJ</span>
                        <div class="aj-access-brand-copy">
                            <strong>Ajartivo</strong>
                            <span>Secure access</span>
                        </div>
                    </div>
                    <span class="aj-access-badge">Premium Download</span>
                </div>
                <button type="button" class="aj-access-close" aria-label="Close">&times;</button>
                <p class="aj-access-kicker"></p>
                <h3 class="aj-access-title"></h3>
                <p class="aj-access-message"></p>
                <div class="aj-access-metrics">
                    <article class="aj-access-metric">
                        <span>Free downloads</span>
                        <strong class="aj-access-free-stat"></strong>
                    </article>
                    <article class="aj-access-metric">
                        <span>Premium status</span>
                        <strong class="aj-access-premium-stat"></strong>
                    </article>
                    <article class="aj-access-metric">
                        <span>Weekly premium</span>
                        <strong class="aj-access-weekly-stat"></strong>
                    </article>
                </div>
                <div class="aj-access-actions">
                    <button type="button" class="aj-access-primary">Download Now</button>
                    <button type="button" class="aj-access-secondary">Upgrade to Premium</button>
                    <button type="button" class="aj-access-secondary aj-access-buy">Buy This Design</button>
                </div>
            </div>
        `;

        document.body.appendChild(wrapper);

        const close = function () {
            wrapper.hidden = true;
            wrapper.style.display = "none";
            document.body.classList.remove("aj-access-open");
        };

        wrapper.querySelector(".aj-access-backdrop").addEventListener("click", close);
        wrapper.querySelector(".aj-access-close").addEventListener("click", close);

        accessPopupState = {
            root: wrapper,
            kicker: wrapper.querySelector(".aj-access-kicker"),
            title: wrapper.querySelector(".aj-access-title"),
            message: wrapper.querySelector(".aj-access-message"),
            freeStat: wrapper.querySelector(".aj-access-free-stat"),
            premiumStat: wrapper.querySelector(".aj-access-premium-stat"),
            weeklyStat: wrapper.querySelector(".aj-access-weekly-stat"),
            downloadBtn: wrapper.querySelector(".aj-access-primary"),
            upgradeBtn: wrapper.querySelector(".aj-access-secondary"),
            buyBtn: wrapper.querySelector(".aj-access-buy"),
            close: close
        };
    }

    function closeAccessPopup() {
        if (!accessPopupState || !accessPopupState.close) return;
        accessPopupState.close();
    }

    function ensureDownloadPopupStyles() {
        if (document.getElementById("ajDownloadPopupStyles")) return;

        const style = document.createElement("style");
        style.id = "ajDownloadPopupStyles";
        style.textContent = `
            body.aj-download-open { overflow: hidden; }
            .aj-download-modal { position: fixed; inset: 0; z-index: 7000; place-items: center; padding: 20px; }
            .aj-download-backdrop {
                position: absolute;
                inset: 0;
                background:
                    radial-gradient(circle at 20% 18%, rgba(96, 165, 250, 0.18), transparent 24%),
                    radial-gradient(circle at 80% 14%, rgba(255, 255, 255, 0.12), transparent 20%),
                    rgba(9, 16, 29, 0.78);
                backdrop-filter: blur(14px);
            }
            .aj-download-dialog {
                position: relative;
                z-index: 1;
                width: min(92vw, 460px);
                padding: 22px;
                border-radius: 30px;
                background:
                    radial-gradient(circle at top right, rgba(96, 165, 250, 0.14), transparent 28%),
                    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(244, 247, 252, 0.98) 100%);
                border: 1px solid rgba(255, 255, 255, 0.82);
                box-shadow: 0 38px 100px rgba(15, 23, 42, 0.38);
                display: grid;
                gap: 16px;
                overflow: hidden;
            }
            .aj-download-dialog::before {
                content: "";
                position: absolute;
                inset: 0 0 auto 0;
                height: 5px;
                background: linear-gradient(90deg, #1d4ed8, #60a5fa, #dbeafe);
                opacity: 0.98;
            }
            .aj-download-topbar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding-right: 56px;
            }
            .aj-download-brand {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .aj-download-brand-mark {
                width: 42px;
                height: 42px;
                border-radius: 14px;
                display: grid;
                place-items: center;
                background: linear-gradient(135deg, #1e3a8a, #3b82f6);
                color: #ffffff;
                font-size: 13px;
                font-weight: 900;
                letter-spacing: 0.08em;
                box-shadow: 0 14px 28px rgba(37, 99, 235, 0.24);
            }
            .aj-download-brand-copy {
                display: grid;
                gap: 2px;
            }
            .aj-download-brand-copy strong {
                color: #0f172a;
                font-size: 15px;
                line-height: 1.2;
            }
            .aj-download-brand-copy span {
                color: #64748b;
                font-size: 12px;
                line-height: 1.2;
            }
            .aj-download-badge {
                display: inline-flex;
                align-items: center;
                min-height: 34px;
                padding: 0 14px;
                border-radius: 999px;
                background: rgba(15, 23, 42, 0.05);
                border: 1px solid rgba(148, 163, 184, 0.18);
                color: #334155;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 0.1em;
                text-transform: uppercase;
            }
            .aj-download-close {
                position: absolute;
                top: 16px;
                right: 16px;
                width: 42px;
                height: 42px;
                border: 1px solid rgba(148, 163, 184, 0.18);
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.88);
                color: #0f172a;
                cursor: pointer;
                font-size: 24px;
                line-height: 1;
                font-weight: 500;
                box-shadow: 0 12px 24px rgba(15, 23, 42, 0.10);
            }
            .aj-download-kicker { margin: 4px 0 0; color: #2563eb; font-size: 11px; font-weight: 900; letter-spacing: 0.18em; text-transform: uppercase; }
            .aj-download-title { margin: 0; color: #0f172a; font-size: 34px; line-height: 1.02; letter-spacing: -0.03em; }
            .aj-download-file {
                margin: 0;
                color: #64748b;
                word-break: break-word;
                font-size: 14px;
                line-height: 1.6;
                padding-bottom: 2px;
                border-bottom: 1px solid rgba(226, 232, 240, 0.9);
            }
            .aj-download-countdown-wrap {
                display: grid;
                gap: 8px;
                justify-items: center;
                padding: 22px 20px;
                border-radius: 24px;
                background: linear-gradient(180deg, rgba(238, 245, 255, 0.98), rgba(248, 250, 252, 0.98));
                color: #0f172a;
                border: 1px solid rgba(191, 219, 254, 0.8);
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.96);
            }
            .aj-download-countdown-label { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.16em; color: #2563eb; }
            .aj-download-countdown { font-size: 52px; line-height: 1; color: #0f172a; text-shadow: 0 12px 28px rgba(96, 165, 250, 0.18); }
            .aj-download-status { margin: 0; color: #334155; line-height: 1.7; font-size: 15px; }
            .aj-download-retry {
                min-height: 56px;
                border: none;
                border-radius: 18px;
                background:
                    linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0) 36%),
                    linear-gradient(135deg, #0f172a, #1e3a8a 55%, #2563eb);
                color: #fff;
                cursor: pointer;
                font-weight: 800;
                letter-spacing: 0.01em;
                box-shadow: 0 20px 36px rgba(30, 58, 138, 0.28);
                transition: transform .2s ease, box-shadow .2s ease;
            }
            .aj-download-retry:hover { transform: translateY(-1px); box-shadow: 0 24px 42px rgba(30, 58, 138, 0.32); }
            @media (max-width: 560px) {
                .aj-download-modal { padding: 14px; align-items: end; }
                .aj-download-dialog { width: min(100vw - 12px, 480px); border-radius: 28px 28px 24px 24px; padding: 18px; }
                .aj-download-topbar { align-items: flex-start; flex-direction: column; padding-right: 54px; }
                .aj-download-title { font-size: 30px; }
            }
        `;
        document.head.appendChild(style);
    }

    function ensureAccessPopupStyles() {
        if (document.getElementById("ajAccessPopupStyles")) return;

        const style = document.createElement("style");
        style.id = "ajAccessPopupStyles";
        style.textContent = `
            body.aj-access-open { overflow: hidden; }
            .aj-access-modal { position: fixed; inset: 0; z-index: 7200; place-items: center; padding: 20px; }
            .aj-access-backdrop {
                position: absolute;
                inset: 0;
                background:
                    radial-gradient(circle at 18% 18%, rgba(96, 165, 250, 0.18), transparent 24%),
                    radial-gradient(circle at 78% 14%, rgba(255, 255, 255, 0.12), transparent 20%),
                    rgba(9, 16, 29, 0.80);
                backdrop-filter: blur(14px);
            }
            .aj-access-dialog {
                position: relative;
                z-index: 1;
                width: min(94vw, 660px);
                padding: 22px;
                border-radius: 32px;
                display: grid;
                gap: 18px;
                background:
                    radial-gradient(circle at top right, rgba(96, 165, 250, 0.14), transparent 28%),
                    linear-gradient(180deg, rgba(255, 255, 255, 0.985) 0%, rgba(244, 247, 252, 0.98) 100%);
                box-shadow: 0 38px 110px rgba(15, 23, 42, 0.40);
                border: 1px solid rgba(255, 255, 255, 0.84);
                overflow: hidden;
            }
            .aj-access-dialog::before {
                content: "";
                position: absolute;
                inset: 0 0 auto 0;
                height: 5px;
                background: linear-gradient(90deg, #1d4ed8, #60a5fa, #dbeafe);
                opacity: 0.98;
            }
            .aj-access-topbar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding-right: 56px;
            }
            .aj-access-brand {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .aj-access-brand-mark {
                width: 44px;
                height: 44px;
                border-radius: 15px;
                display: grid;
                place-items: center;
                background: linear-gradient(135deg, #0f172a, #1e3a8a 58%, #3b82f6);
                color: #ffffff;
                font-size: 13px;
                font-weight: 900;
                letter-spacing: 0.08em;
                box-shadow: 0 14px 28px rgba(30, 58, 138, 0.26);
            }
            .aj-access-brand-copy {
                display: grid;
                gap: 2px;
            }
            .aj-access-brand-copy strong {
                color: #0f172a;
                font-size: 15px;
                line-height: 1.2;
            }
            .aj-access-brand-copy span {
                color: #64748b;
                font-size: 12px;
                line-height: 1.2;
            }
            .aj-access-badge {
                display: inline-flex;
                align-items: center;
                min-height: 34px;
                padding: 0 14px;
                border-radius: 999px;
                background: rgba(15, 23, 42, 0.05);
                border: 1px solid rgba(148, 163, 184, 0.18);
                color: #334155;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 0.1em;
                text-transform: uppercase;
            }
            .aj-access-close {
                position: absolute;
                top: 16px;
                right: 16px;
                width: 42px;
                height: 42px;
                border: 1px solid rgba(148, 163, 184, 0.18);
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.88);
                color: #0f172a;
                cursor: pointer;
                font-size: 24px;
                line-height: 1;
                font-weight: 500;
                box-shadow: 0 12px 24px rgba(15, 23, 42, 0.10);
            }
            .aj-access-kicker { margin: 2px 0 0; color: #2563eb; font-size: 11px; font-weight: 900; letter-spacing: 0.18em; text-transform: uppercase; }
            .aj-access-title { margin: 0; color: #0f172a; font-size: clamp(32px, 5vw, 40px); line-height: 1.02; letter-spacing: -0.04em; max-width: 520px; }
            .aj-access-message { margin: 0; color: #475569; font-size: 15px; line-height: 1.8; max-width: 560px; }
            .aj-access-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
            .aj-access-metric {
                padding: 18px;
                border-radius: 24px;
                background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 248, 252, 0.95));
                border: 1px solid rgba(226, 232, 240, 0.92);
                display: grid;
                gap: 10px;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.96);
            }
            .aj-access-metric span { color: #2563eb; font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; font-weight: 900; }
            .aj-access-metric strong { color: #0f172a; font-size: 18px; line-height: 1.55; }
            .aj-access-actions {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 12px;
                padding: 14px;
                border-radius: 24px;
                background:
                    radial-gradient(circle at top right, rgba(96, 165, 250, 0.10), transparent 28%),
                    linear-gradient(180deg, rgba(15, 23, 42, 0.05), rgba(255, 255, 255, 0.72));
                border: 1px solid rgba(191, 219, 254, 0.36);
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, 0.8),
                    0 18px 32px rgba(148, 163, 184, 0.10);
            }
            .aj-access-primary,
            .aj-access-secondary {
                position: relative;
                overflow: hidden;
                min-height: 56px;
                padding: 0 20px;
                border: none;
                border-radius: 18px;
                font-weight: 800;
                font-size: 15px;
                cursor: pointer;
                letter-spacing: 0.01em;
                isolation: isolate;
                transition: transform .24s ease, box-shadow .24s ease, filter .24s ease, border-color .24s ease;
                animation: ajAccessActionRise .55s ease both;
            }
            .aj-access-primary::before,
            .aj-access-secondary::before {
                content: "";
                position: absolute;
                inset: 0;
                background: linear-gradient(120deg, transparent 22%, rgba(255, 255, 255, 0.22) 46%, transparent 70%);
                transform: translateX(-140%);
                animation: ajAccessSheen 4.6s ease-in-out infinite;
                pointer-events: none;
                z-index: -1;
            }
            .aj-access-primary {
                background:
                    linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 38%),
                    linear-gradient(135deg, #0b1220, #162447 52%, #2563eb 100%);
                color: #fff;
                border: 1px solid rgba(96, 165, 250, 0.16);
                box-shadow:
                    0 18px 32px rgba(15, 23, 42, 0.28),
                    0 0 0 1px rgba(96, 165, 250, 0.06) inset;
            }
            .aj-access-secondary {
                background:
                    linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0) 36%),
                    linear-gradient(135deg, #eff6ff, #dbeafe 52%, #c7d2fe);
                color: #0f172a;
                border: 1px solid rgba(96, 165, 250, 0.22);
                box-shadow:
                    0 16px 28px rgba(59, 130, 246, 0.14),
                    inset 0 1px 0 rgba(255, 255, 255, 0.82);
            }
            .aj-access-buy {
                grid-column: 1 / -1;
                min-height: 58px;
                background:
                    linear-gradient(180deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0) 36%),
                    linear-gradient(135deg, #1e293b, #334155 55%, #475569);
                color: #f8fafc;
                border: 1px solid rgba(148, 163, 184, 0.18);
                box-shadow:
                    0 16px 30px rgba(15, 23, 42, 0.22),
                    inset 0 1px 0 rgba(255, 255, 255, 0.08);
            }
            .aj-access-primary:hover,
            .aj-access-secondary:hover {
                transform: translateY(-2px) scale(1.01);
                filter: brightness(1.03);
            }
            .aj-access-primary:hover {
                box-shadow:
                    0 24px 42px rgba(15, 23, 42, 0.32),
                    0 0 24px rgba(59, 130, 246, 0.18);
            }
            .aj-access-buy:hover {
                transform: translateY(-2px);
                box-shadow:
                    0 22px 36px rgba(15, 23, 42, 0.28),
                    0 0 20px rgba(148, 163, 184, 0.12);
            }
            .aj-access-primary:disabled,
            .aj-access-secondary:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; transform: none; animation: none; }
            .aj-access-primary:disabled::before,
            .aj-access-secondary:disabled::before { animation: none; }
            .aj-access-buy { animation-delay: .08s; }
            @keyframes ajAccessActionRise {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            @keyframes ajAccessSheen {
                0%, 18% {
                    transform: translateX(-140%);
                }
                30%, 100% {
                    transform: translateX(140%);
                }
            }
            @media (max-width: 680px) {
                .aj-access-modal { padding: 14px; align-items: end; }
                .aj-access-dialog { width: min(100vw - 12px, 680px); padding: 18px; border-radius: 28px 28px 24px 24px; }
                .aj-access-topbar { align-items: flex-start; flex-direction: column; padding-right: 54px; }
                .aj-access-metrics,
                .aj-access-actions { grid-template-columns: 1fr; }
                .aj-access-buy { grid-column: auto; }
            }
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

        emitAccountUpdated();
    }

    function emitAccountUpdated(account) {
        window.dispatchEvent(new CustomEvent("ajartivo:account-updated", {
            detail: {
                account: account || (services.getAccountSummary ? services.getAccountSummary() : null)
            }
        }));
    }

    function ensureLoginPopupStyles() {
        if (document.getElementById("ajLoginPopupStyles")) return;

        const style = document.createElement("style");
        style.id = "ajLoginPopupStyles";
        style.textContent = `
            body.aj-login-open { overflow: hidden; }
            .aj-login-modal { position: fixed; inset: 0; z-index: 7100; place-items: center; padding: 24px; }
            .aj-login-backdrop {
                position: absolute;
                inset: 0;
                background:
                    radial-gradient(circle at 18% 18%, rgba(96, 165, 250, 0.22), transparent 28%),
                    radial-gradient(circle at 82% 20%, rgba(255, 255, 255, 0.14), transparent 24%),
                    rgba(9, 16, 29, 0.76);
                backdrop-filter: blur(14px);
            }
            .aj-login-dialog {
                position: relative;
                z-index: 1;
                width: min(92vw, 500px);
                display: grid;
                gap: 20px;
                padding: 24px;
                border-radius: 34px;
                background:
                    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(246, 249, 255, 0.94)),
                    linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
                border: 1px solid rgba(255, 255, 255, 0.82);
                box-shadow:
                    0 36px 100px rgba(15, 23, 42, 0.34),
                    inset 0 1px 0 rgba(255, 255, 255, 0.9);
                overflow: hidden;
            }
            .aj-login-dialog::before {
                content: "";
                position: absolute;
                inset: 0 0 auto 0;
                height: 6px;
                background: linear-gradient(90deg, #0f172a, #2563eb, #93c5fd);
                opacity: 0.95;
            }
            .aj-login-glow {
                position: absolute;
                border-radius: 50%;
                pointer-events: none;
                filter: blur(10px);
                opacity: 0.7;
            }
            .aj-login-glow-one {
                top: -50px;
                right: -36px;
                width: 160px;
                height: 160px;
                background: radial-gradient(circle, rgba(96, 165, 250, 0.28), transparent 70%);
            }
            .aj-login-glow-two {
                left: -50px;
                bottom: -56px;
                width: 180px;
                height: 180px;
                background: radial-gradient(circle, rgba(226, 232, 240, 0.58), transparent 72%);
            }
            .aj-login-close {
                position: absolute;
                top: 16px;
                right: 16px;
                width: 42px;
                height: 42px;
                border: 1px solid rgba(148, 163, 184, 0.18);
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.84);
                color: #0f172a;
                cursor: pointer;
                font-size: 24px;
                line-height: 1;
                font-weight: 500;
                box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
                transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
            }
            .aj-login-close:hover {
                transform: translateY(-1px);
                background: #ffffff;
                box-shadow: 0 16px 28px rgba(15, 23, 42, 0.12);
            }
            .aj-login-head,
            .aj-login-hero,
            .aj-login-form-shell,
            .aj-login-trust,
            .aj-login-copy,
            .aj-login-field,
            .aj-login-actions,
            .aj-login-error,
            .aj-login-submit,
            .aj-login-perks {
                position: relative;
                z-index: 1;
            }
            .aj-login-hero {
                display: grid;
                gap: 16px;
                padding: 18px 18px 20px;
                border-radius: 26px;
                background:
                    radial-gradient(circle at top right, rgba(96, 165, 250, 0.18), transparent 34%),
                    radial-gradient(circle at bottom left, rgba(226, 232, 240, 0.78), transparent 30%),
                    linear-gradient(180deg, rgba(244, 248, 255, 0.95), rgba(255, 255, 255, 0.88));
                border: 1px solid rgba(226, 232, 240, 0.82);
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, 0.92),
                    0 16px 36px rgba(148, 163, 184, 0.12);
            }
            .aj-login-brand {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding-right: 60px;
            }
            .aj-login-kicker {
                margin: 0;
                color: #2563eb;
                font-size: 11px;
                font-weight: 900;
                letter-spacing: 0.16em;
                text-transform: uppercase;
            }
            .aj-login-badge {
                display: inline-flex;
                align-items: center;
                min-height: 32px;
                padding: 0 14px;
                border-radius: 999px;
                background: linear-gradient(135deg, rgba(239, 246, 255, 0.98), rgba(219, 234, 254, 0.92));
                color: #1d4ed8;
                border: 1px solid rgba(96, 165, 250, 0.22);
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }
            .aj-login-copy {
                display: grid;
                gap: 10px;
            }
            .aj-login-title {
                margin: 0;
                color: #0f172a;
                font-size: clamp(30px, 5.4vw, 38px);
                line-height: 1.02;
                letter-spacing: -0.04em;
                max-width: 260px;
            }
            .aj-login-subtitle {
                margin: 0;
                color: #475569;
                font-size: 15px;
                line-height: 1.75;
                max-width: 360px;
            }
            .aj-login-perks {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
            }
            .aj-login-perks span {
                display: inline-flex;
                align-items: center;
                min-height: 34px;
                padding: 0 14px;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.72);
                color: #334155;
                border: 1px solid rgba(226, 232, 240, 0.92);
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
                font-size: 12px;
                font-weight: 700;
            }
            .aj-login-trust {
                display: grid;
                gap: 6px;
                padding: 16px 18px;
                border-radius: 20px;
                background: linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(29, 78, 216, 0.92));
                color: #ffffff;
                box-shadow: 0 18px 34px rgba(15, 23, 42, 0.20);
            }
            .aj-login-trust strong {
                font-size: 14px;
                font-weight: 800;
                letter-spacing: 0.01em;
            }
            .aj-login-trust span {
                color: rgba(255, 255, 255, 0.74);
                font-size: 13px;
                line-height: 1.6;
            }
            .aj-login-form-shell {
                display: grid;
                gap: 16px;
                padding: 20px;
                border-radius: 26px;
                background: rgba(255, 255, 255, 0.78);
                border: 1px solid rgba(226, 232, 240, 0.9);
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, 0.92),
                    0 18px 34px rgba(148, 163, 184, 0.10);
            }
            .aj-login-error {
                margin: 0;
                min-height: 22px;
                padding: 10px 14px;
                border-radius: 16px;
                background: rgba(254, 242, 242, 0.96);
                border: 1px solid rgba(248, 113, 113, 0.18);
                color: #dc2626;
                font-size: 13px;
                line-height: 1.5;
            }
            .aj-login-error[hidden] {
                display: none;
            }
            .aj-login-helper {
                margin: 0;
                color: #475569;
                font-size: 14px;
                line-height: 1.7;
            }
            .aj-login-field {
                display: grid;
                gap: 9px;
                color: #0f172a;
                font-size: 13px;
                font-weight: 800;
                letter-spacing: 0.01em;
            }
            .aj-login-password-wrap {
                position: relative;
            }
            .aj-login-input {
                min-height: 54px;
                width: 100%;
                border: 1px solid rgba(148, 163, 184, 0.24);
                border-radius: 18px;
                padding: 0 16px;
                font: inherit;
                color: #0f172a;
                background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(241, 245, 249, 0.98));
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
                transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
            }
            .aj-login-input:focus {
                outline: none;
                border-color: rgba(37, 99, 235, 0.44);
                background: #ffffff;
                box-shadow:
                    0 0 0 4px rgba(37, 99, 235, 0.10),
                    inset 0 1px 0 rgba(255, 255, 255, 0.96);
            }
            .aj-login-input::placeholder {
                color: #94a3b8;
            }
            .aj-login-password-wrap .aj-login-input {
                padding-right: 84px;
            }
            .aj-login-toggle {
                position: absolute;
                top: 50%;
                right: 10px;
                transform: translateY(-50%);
                min-width: 62px;
                height: 38px;
                border: none;
                border-radius: 12px;
                background: rgba(226, 232, 240, 0.8);
                color: #1e293b;
                font-size: 12px;
                font-weight: 800;
                cursor: pointer;
                transition: background 0.2s ease, color 0.2s ease;
            }
            .aj-login-toggle:hover {
                background: rgba(191, 219, 254, 0.9);
                color: #1d4ed8;
            }
            .aj-login-submit {
                min-height: 58px;
                border: none;
                border-radius: 20px;
                background:
                    linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0) 38%),
                    linear-gradient(135deg, #1d4ed8, #2563eb 48%, #60a5fa);
                color: #fff;
                font-size: 15px;
                font-weight: 800;
                letter-spacing: 0.01em;
                cursor: pointer;
                box-shadow: 0 20px 34px rgba(37, 99, 235, 0.24);
                transition: transform 0.22s ease, box-shadow 0.22s ease, filter 0.22s ease;
            }
            .aj-login-submit:hover {
                transform: translateY(-2px);
                box-shadow: 0 26px 42px rgba(37, 99, 235, 0.30);
                filter: brightness(1.02);
            }
            .aj-login-submit:disabled {
                opacity: 0.76;
                cursor: wait;
                transform: none;
            }
            .aj-login-google {
                background:
                    linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0) 38%),
                    linear-gradient(135deg, #0f172a, #1d4ed8 56%, #60a5fa);
            }
            .aj-login-actions {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
                padding-top: 2px;
            }
            .aj-login-link {
                color: #1d4ed8;
                text-decoration: none;
                font-size: 14px;
                font-weight: 700;
                transition: color 0.2s ease, opacity 0.2s ease;
            }
            .aj-login-link:hover {
                color: #0f172a;
            }
            .aj-login-link-strong {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 42px;
                padding: 0 16px;
                border-radius: 999px;
                background: rgba(15, 23, 42, 0.05);
                color: #0f172a;
            }
            .aj-login-link-strong:hover {
                background: rgba(15, 23, 42, 0.08);
                color: #0f172a;
            }
            @media (max-width: 560px) {
                .aj-login-modal { padding: 16px; }
                .aj-login-dialog { width: min(100vw - 16px, 500px); padding: 18px; border-radius: 28px; gap: 16px; }
                .aj-login-hero,
                .aj-login-form-shell { padding: 18px 16px; border-radius: 22px; }
                .aj-login-brand { align-items: flex-start; flex-direction: column; padding-right: 56px; }
                .aj-login-title { max-width: none; font-size: 32px; }
                .aj-login-subtitle { max-width: none; }
                .aj-login-actions { flex-direction: column; align-items: stretch; }
                .aj-login-link,
                .aj-login-link-strong { justify-content: center; text-align: center; }
            }
        `;
        document.head.appendChild(style);
    }

    function mapLoginError(error) {
        const message = cleanText(error && (error.message || error.error_description || error.code)).toLowerCase();

        if (message.includes("popup") || message.includes("oauth") || message.includes("provider")) {
            return "Google login could not be started. Please try again.";
        }

        if (message.includes("failed to fetch") || message.includes("network")) {
            return "Network error. Please check your connection and try again.";
        }

        return cleanText(error && error.message) || "Login failed. Please try again.";
    }

    function mapPaymentRequestError(error, endpoint) {
        const message = cleanText(error && error.message).toLowerCase();

        if ((error && error.name === "AbortError") || message.includes("aborted") || message.includes("timeout")) {
            return new Error(`Payment backend did not respond in time at ${endpoint}. Please try again.`);
        }

        if (message.includes("failed to fetch") || message.includes("network")) {
            return new Error(`Payment backend is not reachable at ${endpoint}. Please verify the backend is running and accessible.`);
        }

        return error instanceof Error ? error : new Error("Payment request failed.");
    }

    function isAbsoluteUrl(value) {
        return /^https?:\/\//i.test(cleanText(value));
    }

    function parseJsonResponse(value) {
        const responseText = cleanText(value);
        if (!responseText) {
            return {};
        }

        try {
            return JSON.parse(responseText);
        } catch (error) {
            return null;
        }
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
