(function () {
    const services = window.AjArtivoSupabase;
    const resolveUrl = typeof window.AjArtivoResolveUrl === "function"
        ? window.AjArtivoResolveUrl
        : function (path) { return path; };
    if (!services) return;

    const designTitleElement = document.getElementById("productTitle");
    if (!designTitleElement) return;

    const params = new URLSearchParams(window.location.search);
    const designId = cleanText(params.get("id"));
    let currentDesign = null;
    let refreshTimerId = null;
    let accessRequestId = 0;
    let currentAccessPromise = null;
    let currentAccessState = createAccessState();

    initPage();
    bindLiveRefresh();
    bindPurchaseStateEvents();

    async function initPage() {
        bindStaticInteractions();

        try {
            if (!designId) {
                setText("productTitle", "Design not found");
                setText("productDescription", "Design link is missing or invalid.");
                bindActionButton(null, createAccessState());
                return;
            }

            currentDesign = await services.fetchDesignById(designId);

            if (!currentDesign) {
                setText("productTitle", "Design not found");
                setText("productDescription", "This design is not available right now.");
                bindActionButton(null, createAccessState());
                return;
            }

            currentDesign = services.normalizeDesign(currentDesign);
            renderDesign(currentDesign);

            await Promise.all([
                loadRelatedDesigns(currentDesign.id),
                bindWishlistButton(currentDesign),
                refreshDesignAccess(currentDesign)
            ]);
        } catch (error) {
            console.error("Design load failed:", error);
            setText("productTitle", "Unable to load design");
            setText("productDescription", "Please try again later.");
            bindActionButton(null, createAccessState());
        }
    }

    function bindLiveRefresh() {
        if (document.body.dataset.designLiveBound === "true") {
            return;
        }

        window.addEventListener("ajartivo:designs-changed", function () {
            if (refreshTimerId) {
                window.clearTimeout(refreshTimerId);
            }

            refreshTimerId = window.setTimeout(function () {
                initPage();
            }, 250);
        });

        document.body.dataset.designLiveBound = "true";
    }

    function bindPurchaseStateEvents() {
        if (document.body.dataset.designPurchaseBound === "true") {
            return;
        }

        window.addEventListener("ajartivo:purchase-completed", function (event) {
            const detail = event && event.detail ? event.detail : {};
            if (!currentDesign || String(detail.designId) !== String(currentDesign.id)) {
                return;
            }

            currentAccessState = createAccessState({
                loading: false,
                checked: true,
                hasAccess: true,
                reason: "purchased",
                userEmail: cleanText(detail.userEmail).toLowerCase()
            });
            currentDesign = applyAccessState(currentDesign, currentAccessState);
            updateAccessUi(currentDesign, currentAccessState);
        });

        window.addEventListener("ajartivo:session-changed", function () {
            if (!currentDesign) {
                return;
            }

            refreshDesignAccess(currentDesign);
        });

        window.addEventListener("ajartivo:account-updated", function () {
            if (!currentDesign) {
                return;
            }

            refreshDesignAccess(currentDesign);
        });

        document.body.dataset.designPurchaseBound = "true";
    }

    function renderDesign(product) {
        const title = product.title || "Untitled Design";
        const type = String(product.category || "OTHER").toUpperCase();
        const price = Number(product.price || 0);
        const amount = isFreeDesign(product) ? "Free" : `Rs. ${price}`;

        document.title = `${title} - AJartivo`;
        setText("productTitle", title);
        setText("productDescription", product.description || "Creative design ready for instant access.");
        setText("productTypeChip", type);
        setText("productPrice", amount);
        setText("galleryFormat", type);
        setText("galleryViews", String(Number(product.views || 0)));
        setText("galleryDownloads", String(Number(product.downloads || 0)));

        renderFeatures(product, type);
        renderGalleryCaption(product, type);
        renderThumbnails(getDesignImages(product), title);
        updateAccessUi(product, deriveInitialAccessState(product));
    }

    async function refreshDesignAccess(product) {
        const normalizedProduct = services.normalizeDesign(product);
        const requestId = accessRequestId + 1;
        accessRequestId = requestId;

        currentAccessState = createAccessState({
            loading: true,
            checked: false,
            hasAccess: false,
            reason: "checking",
            userEmail: getCurrentUserEmail()
        });
        updateAccessUi(normalizedProduct, currentAccessState);

        currentAccessPromise = resolveDesignAccess(normalizedProduct);
        const resolvedAccess = await currentAccessPromise;
        if (requestId !== accessRequestId) {
            return currentDesign;
        }

        currentAccessState = resolvedAccess;
        currentDesign = applyAccessState(normalizedProduct, resolvedAccess);
        updateAccessUi(currentDesign, resolvedAccess);
        currentAccessPromise = null;
        return currentDesign;
    }

    async function resolveDesignAccess(product) {
        const userSession = getCurrentUserSession();
        if (!userSession) {
            return createAccessState({
                loading: false,
                checked: true,
                hasAccess: false,
                reason: "login_required",
                userEmail: "",
                message: isFreeDesign(product)
                    ? "Log in to download this free design."
                    : "Log in first to review your access options."
            });
        }

        if (window.AjArtivoPayment && typeof window.AjArtivoPayment.fetchDownloadAccess === "function") {
            try {
                const authSession = await services.getAuthSession({ sync: false });
                const summary = await window.AjArtivoPayment.fetchDownloadAccess(product.id, {
                    id: cleanText(authSession && authSession.user && authSession.user.id),
                    email: cleanText(authSession && authSession.user && authSession.user.email).toLowerCase(),
                    accessToken: cleanText(authSession && authSession.access_token)
                });

                return createAccessState({
                    loading: false,
                    checked: true,
                    hasAccess: Boolean(summary && summary.access && summary.access.allowed),
                    reason: cleanText(summary && summary.access && summary.access.status) || "restricted",
                    userEmail: cleanText(userSession.email).toLowerCase(),
                    message: cleanText(summary && summary.access && summary.access.message),
                    freeRemaining: Number(summary && summary.account && summary.account.free_download_remaining || 0),
                    weeklyPremiumRemaining: Number(summary && summary.account && summary.account.weekly_premium_remaining || 0),
                    premiumActive: Boolean(summary && summary.account && summary.account.premium_active),
                    canBuy: Boolean(summary && summary.access && summary.access.can_buy),
                    canUpgrade: Boolean(summary && summary.access && summary.access.can_upgrade)
                });
            } catch (error) {
                console.error("Access summary load failed:", error);

                return createAccessState({
                    loading: false,
                    checked: true,
                    hasAccess: false,
                    reason: "unavailable",
                    userEmail: cleanText(userSession.email).toLowerCase(),
                    message: resolveAccessFailureMessage(error, product),
                    canBuy: isFreeDesign(product) !== true,
                    canUpgrade: isFreeDesign(product) !== true
                });
            }
        }

        return createAccessState({
            loading: false,
            checked: true,
            hasAccess: false,
            reason: "restricted",
            userEmail: cleanText(userSession.email).toLowerCase(),
            message: "Access could not be confirmed right now."
        });
    }

    function updateAccessUi(product, accessState) {
        const normalizedProduct = applyAccessState(product, accessState);
        const type = String(normalizedProduct.category || "OTHER").toUpperCase();
        const isFree = isFreeDesign(normalizedProduct);
        const unlocked = hasDownloadAccess(normalizedProduct);

        setText("galleryAccess", isFree ? "Free" : unlocked ? "Unlocked" : "Premium");
        setText("productPriceNote", resolvePriceNote(normalizedProduct, accessState));
        setText("membershipBadge", accessState && accessState.premiumActive ? "Premium Active" : "Free Member");
        setText("freeDownloadRemaining", `${Number(accessState && accessState.freeRemaining || 0)} / 5 remaining`);
        setText("weeklyPremiumRemaining", `${Number(accessState && accessState.weeklyPremiumRemaining || 0)} / 2 remaining`);
        setText("downloadAccessStatus", resolveAccessHeadline(normalizedProduct, accessState));
        renderFeatures(normalizedProduct, type);
        renderGalleryCaption(normalizedProduct, type, accessState);
        bindActionButton(normalizedProduct, accessState);
    }

    function resolvePriceNote(product, accessState) {
        if (accessState && cleanText(accessState.message)) {
            return accessState.message;
        }

        const signedIn = Boolean(getCurrentUserEmail());

        if (isFreeDesign(product)) {
            if (!signedIn) {
                return "Login is required before any download starts.";
            }
            return "Your free file is ready for secure instant download.";
        }

        if (hasDownloadAccess(product)) {
            return "Purchase verified. Your download is unlocked.";
        }

        if (!signedIn) {
            return "Login is required before any download starts.";
        }

        return "Secure access is being handled automatically for this design.";
    }

    function resolveAccessHeadline(product, accessState) {
        if (accessState && accessState.premiumActive) {
            return isFreeDesign(product)
                ? "Premium access: unlimited free downloads"
                : "Premium access with weekly premium allowance";
        }

        if (hasDownloadAccess(product)) {
            return "Download unlocked for your account";
        }

        if (isFreeDesign(product)) {
            return "Logged-in users can download this file";
        }

        return "Premium design with secure account-based access";
    }

    function resolveAccessFailureMessage(error, product) {
        const message = cleanText(error && error.message).toLowerCase();

        if (message.includes("did not respond in time") || message.includes("timeout") || message.includes("aborted")) {
            return isFreeDesign(product)
                ? "Access check timed out. Tap Download to try again."
                : "Access check timed out. Tap Download Options to try again.";
        }

        if (message.includes("not reachable") || message.includes("failed to fetch") || message.includes("network")) {
            return isFreeDesign(product)
                ? "Access service is unavailable. Tap Download to retry."
                : "Access service is unavailable. Tap Download Options to retry.";
        }

        return isFreeDesign(product)
            ? "Access could not be confirmed right now. Tap Download to retry."
            : "Access could not be confirmed right now. Tap Download Options to retry.";
    }

    function deriveInitialAccessState(product) {
        if (hasDownloadAccess(product)) {
            return createAccessState({
                loading: false,
                checked: true,
                hasAccess: true,
                reason: "purchased",
                userEmail: getCurrentUserEmail()
            });
        }

        if (!getCurrentUserSession()) {
            return createAccessState({
                loading: false,
                checked: true,
                hasAccess: false,
                reason: "login_required",
                userEmail: "",
                message: isFreeDesign(product)
                    ? "Log in to download this free design."
                    : "Log in first to review your access options."
            });
        }

        return createAccessState({
            loading: true,
            checked: false,
            hasAccess: false,
            reason: "checking",
            userEmail: getCurrentUserEmail()
        });
    }

    function applyAccessState(product, accessState) {
        const normalizedProduct = services.normalizeDesign(product);
        const isPurchased = Boolean(
            normalizedProduct.isPurchased === true ||
            normalizedProduct.is_purchased === true ||
            (accessState && accessState.reason === "purchased")
        );
        const hasAccess = Boolean(accessState && accessState.hasAccess);

        return services.normalizeDesign({
            ...normalizedProduct,
            has_access: hasAccess,
            isPurchased: isPurchased,
            is_purchased: isPurchased,
            premium_active: Boolean(accessState && accessState.premiumActive),
            free_download_remaining: Number(accessState && accessState.freeRemaining || 0),
            weekly_premium_remaining: Number(accessState && accessState.weeklyPremiumRemaining || 0),
            access_message: cleanText(accessState && accessState.message),
            can_buy: Boolean(accessState && accessState.canBuy),
            can_upgrade: Boolean(accessState && accessState.canUpgrade)
        });
    }

    function createAccessState(overrides) {
        return {
            loading: false,
            checked: false,
            hasAccess: false,
            reason: "unknown",
            userEmail: "",
            message: "",
            freeRemaining: 0,
            weeklyPremiumRemaining: 0,
            premiumActive: false,
            canBuy: false,
            canUpgrade: false,
            ...(overrides || {})
        };
    }

    async function loadRelatedDesigns(currentId) {
        const relatedGrid = document.getElementById("relatedDesignGrid");
        if (!relatedGrid) return;

        relatedGrid.innerHTML = '<div class="empty-state">Loading related designs...</div>';

        try {
            const designs = await services.fetchRelatedDesigns(currentId, 6);

            if (!designs.length) {
                relatedGrid.innerHTML = '<div class="empty-state">No related designs found.</div>';
                return;
            }

            relatedGrid.innerHTML = designs.map(function (design) {
                const title = escapeHtml(design.title);
                const image = escapeHtml(design.image || "/images/preview1.jpg");
                const badge = getDesignBadge(design);
                const designUrl = resolveUrl(`/product.html?id=${encodeURIComponent(design.id)}`);

                return `
                    <article class="design-card homepage-design-card">
                        <a href="${designUrl}" class="card-link homepage-card-link">
                            <div class="homepage-card-media">
                                <img src="${image}" alt="${title}" class="homepage-card-image">
                                <span class="homepage-type-chip file-type ${badge.className}"${badge.styleAttr}>${badge.label}</span>
                            </div>
                        </a>
                    </article>
                `;
            }).join("");
        } catch (error) {
            console.error("Related designs load failed:", error);
            relatedGrid.innerHTML = '<div class="empty-state">Could not load related designs right now.</div>';
        }
    }

    function renderFeatures(product, type) {
        const featureList = document.getElementById("productFeatures");
        if (!featureList) return;

        const features = [
            `${type} source file ready for creative work`,
            resolveAccessFeature(product),
            product.download_enabled === true ? "Secure delivery after access verification" : "Download link will be added soon",
            `Category: ${type}`
        ];

        featureList.innerHTML = features.map(function (feature) {
            return `<li>${escapeHtml(feature)}</li>`;
        }).join("");
    }

    function renderGalleryCaption(product, type, accessState) {
        const tagRow = document.getElementById("productGalleryTags");
        const note = document.getElementById("productGalleryNote");
        if (!tagRow || !note) return;

        const tags = [
            type,
            isFreeDesign(product) ? "Free Access" : hasDownloadAccess(product) ? "Unlocked" : "Premium",
            product.download_enabled === true ? "Instant Download" : "Coming Soon"
        ];

        tagRow.innerHTML = tags.map(function (tag) {
            return `<span class="product-gallery-tag">${escapeHtml(tag)}</span>`;
        }).join("");

        const fallback = isFreeDesign(product)
            ? "Simple creative file with quick login-based download access."
            : "Premium creative file with secure access and quick delivery.";
        const message = cleanText(product && product.description) || cleanText(accessState && accessState.message) || fallback;
        note.textContent = shortenText(message, 92);
    }

    function resolveAccessFeature(product) {
        if (isFreeDesign(product)) {
            return "Free design with account-based download";
        }

        if (product.premium_active === true) {
            return `Premium membership active with ${Number(product.weekly_premium_remaining || 0)} weekly premium downloads remaining`;
        }

        if (hasDownloadAccess(product)) {
            return "Purchased access is unlocked for your account";
        }

        return "Paid license with Buy Now access";
    }

    function renderThumbnails(images, title) {
        const row = document.getElementById("thumbnailRow");
        const previewImages = Array.isArray(images) && images.length
            ? Array.from(new Set(images.map((image) => cleanText(image)).filter(Boolean)))
            : ["/images/preview1.jpg"];
        const primaryImage = previewImages[0];
        setMainPreviewImage(primaryImage, title);

        if (!row) return;

        if (previewImages.length <= 1) {
            row.hidden = true;
            row.innerHTML = "";
            return;
        }

        row.hidden = false;
        row.innerHTML = previewImages.map((image, index) => `
            <button class="thumbnail-btn${index === 0 ? " active" : ""}" type="button" data-preview="${escapeHtml(image)}" aria-label="Show preview ${index + 1}">
                <img src="${escapeHtml(image)}" alt="${escapeHtml(title)} thumbnail ${index + 1}" loading="lazy" decoding="async">
            </button>
        `).join("");

        row.querySelectorAll(".thumbnail-btn").forEach(function (button) {
            button.addEventListener("click", function () {
                const previewUrl = button.dataset.preview || "";
                if (!previewUrl) return;

                setMainPreviewImage(previewUrl, title);
                row.querySelectorAll(".thumbnail-btn").forEach((item) => item.classList.remove("active"));
                button.classList.add("active");
            });
        });
    }

    function setMainPreviewImage(src, title) {
        const previewBox = document.getElementById("previewTrigger");
        const mainImage = document.getElementById("mainImage");
        const lightboxImage = document.getElementById("lightboxImage");
        if (!previewBox || !mainImage || !src) return;

        previewBox.classList.add("is-loading");
        mainImage.alt = title || "Design Preview";

        const preloader = new Image();
        preloader.onload = function () {
            mainImage.src = src;
            if (lightboxImage) {
                lightboxImage.src = src;
                lightboxImage.alt = `${title || "Design Preview"} zoomed preview`;
            }
            requestAnimationFrame(() => previewBox.classList.remove("is-loading"));
        };
        preloader.onerror = function () {
            mainImage.src = src;
            if (lightboxImage) {
                lightboxImage.src = src;
            }
            previewBox.classList.remove("is-loading");
        };
        preloader.src = src;
    }

    function getDesignImages(product) {
        const images = Array.isArray(product && product.previewImages)
            ? product.previewImages
            : Array.isArray(product && product.gallery)
            ? product.gallery
            : [product && product.image];

        return images
            .map((image) => cleanText(image))
            .filter(Boolean);
    }

    function bindActionButton(product, accessState) {
        const button = document.getElementById("downloadBtn");
        if (!button) return;

        if (!product || !product.id) {
            button.disabled = true;
            button.textContent = "Unavailable";
            button.onclick = null;
            return;
        }

        const currentItem = services.normalizeDesign(product);
        const buttonState = resolveActionButtonState(currentItem);

        button.disabled = false;
        button.textContent = buttonState.idleText;
        button.dataset.mode = buttonState.mode;
        button.setAttribute("aria-busy", accessState && accessState.loading ? "true" : "false");

        button.onclick = async function () {
            let activeProduct = currentDesign ? services.normalizeDesign(currentDesign) : currentItem;
            let activeState = resolveActionButtonState(activeProduct);

            if (currentAccessPromise) {
                try {
                    await currentAccessPromise;
                } catch (_error) {
                    // Fall through to the standard action flow and let it handle any retry path.
                }

                activeProduct = currentDesign ? services.normalizeDesign(currentDesign) : activeProduct;
                activeState = resolveActionButtonState(activeProduct);
            }

            button.disabled = true;
            button.textContent = activeState.busyText;

            try {
                if (activeState.mode === "buy-now" && typeof window.AjArtivoPayment.buyNow === "function") {
                    await window.AjArtivoPayment.buyNow(activeProduct);
                } else {
                    await window.AjArtivoPayment.startDownloadFlow(activeProduct);
                }
            } catch (error) {
                console.error("Download failed:", error);
                alert("Unable to start the download right now.");
            } finally {
                const refreshedProduct = currentDesign ? services.normalizeDesign(currentDesign) : activeProduct;
                const refreshedState = resolveActionButtonState(refreshedProduct);

                button.disabled = false;
                button.textContent = refreshedState.idleText;
                button.dataset.mode = refreshedState.mode;
                button.setAttribute("aria-busy", currentAccessPromise ? "true" : "false");
            }
        };
    }

    async function bindWishlistButton(product) {
        const button = document.getElementById("wishlistBtn");
        if (!button || !product || !product.id) return;

        const updateButtonState = function (saved) {
            button.dataset.saved = saved ? "true" : "false";
            button.textContent = saved ? "Saved in Wishlist" : "Save to Wishlist";
        };

        updateButtonState(await window.AjArtivoPayment.isInWishlist(product.id));

        button.onclick = async function () {
            button.disabled = true;

            try {
                const result = await window.AjArtivoPayment.toggleWishlist(product);
                updateButtonState(Boolean(result && result.saved));
            } catch (error) {
                console.error("Wishlist update failed:", error);
                alert("Unable to update wishlist right now.");
            } finally {
                button.disabled = false;
            }
        };
    }

    function getDesignBadge(product) {
        const format = String(product.category || "").trim().toUpperCase();
        const knownClass = format.toLowerCase();
        const knownFormats = new Set(["psd", "cdr", "ai", "png", "jpg", "jpeg", "pdf", "svg", "eps"]);

        if (format && knownFormats.has(knownClass)) {
            return { label: escapeHtml(format), className: knownClass, styleAttr: "" };
        }

        if (format) {
            return {
                label: escapeHtml(format),
                className: "other",
                styleAttr: ` style="background:${colorFromText(format)};"`
            };
        }

        return {
            label: isFreeDesign(product) ? "FREE" : "PREMIUM",
            className: isFreeDesign(product) ? "free" : "premium",
            styleAttr: ""
        };
    }

    function colorFromText(value) {
        let hash = 0;
        const text = String(value || "");
        for (let index = 0; index < text.length; index += 1) {
            hash = ((hash << 5) - hash) + text.charCodeAt(index);
            hash |= 0;
        }

        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 66%, 42%)`;
    }

    function bindStaticInteractions() {
        if (document.body.dataset.designStaticBound === "true") {
            return;
        }

        initPreviewZoom();
        initLightbox();
        initCustomDesignButton();
        initShareButton();
        syncPreviewHint();
        window.addEventListener("resize", syncPreviewHint);

        document.body.dataset.designStaticBound = "true";
    }

    function initPreviewZoom() {
        const previewBox = document.getElementById("previewTrigger");
        const previewStage = previewBox ? previewBox.querySelector(".preview-stage") : null;
        const image = document.getElementById("mainImage");
        if (!previewBox || !previewStage || !image) return;

        const zoomScale = 2;
        let zoomed = false;
        let dragging = false;
        let dragMoved = false;
        let offsetX = 0;
        let offsetY = 0;
        let startX = 0;
        let startY = 0;
        let startOffsetX = 0;
        let startOffsetY = 0;

        applyTransform(1, 0, 0);

        previewBox.addEventListener("mousemove", function (event) {
            if (zoomed || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

            const rect = previewStage.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = ((event.clientY - rect.top) / rect.height) * 100;
            image.style.transformOrigin = `${x}% ${y}%`;
            image.style.transform = "translate3d(0, 0, 0) scale(1.08)";
        });

        previewBox.addEventListener("mouseleave", function () {
            if (zoomed) return;
            image.style.transformOrigin = "center center";
            image.style.transform = "translate3d(0, 0, 0) scale(1)";
        });

        previewStage.addEventListener("pointerdown", function (event) {
            if (!zoomed) return;

            dragging = true;
            dragMoved = false;
            startX = event.clientX;
            startY = event.clientY;
            startOffsetX = offsetX;
            startOffsetY = offsetY;
            previewBox.classList.add("is-dragging");
            previewStage.setPointerCapture(event.pointerId);
            event.preventDefault();
        });

        previewStage.addEventListener("pointermove", function (event) {
            if (dragging && zoomed) {
                const rect = previewStage.getBoundingClientRect();
                const nextX = startOffsetX + (event.clientX - startX);
                const nextY = startOffsetY + (event.clientY - startY);
                const clamped = clampOffsets(nextX, nextY, rect, zoomScale);

                offsetX = clamped.x;
                offsetY = clamped.y;
                dragMoved = true;
                applyTransform(zoomScale, offsetX, offsetY);
                return;
            }

            if (zoomed) {
                return;
            }

            if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

            const rect = previewStage.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = ((event.clientY - rect.top) / rect.height) * 100;
            image.style.transformOrigin = `${x}% ${y}%`;
            image.style.transform = "translate3d(0, 0, 0) scale(1.08)";
        });

        previewStage.addEventListener("pointerup", function (event) {
            if (dragging) {
                dragging = false;
                previewBox.classList.remove("is-dragging");
                if (previewStage.hasPointerCapture(event.pointerId)) {
                    previewStage.releasePointerCapture(event.pointerId);
                }
            }
        });

        previewStage.addEventListener("pointercancel", function (event) {
            if (dragging) {
                dragging = false;
                previewBox.classList.remove("is-dragging");
                if (previewStage.hasPointerCapture(event.pointerId)) {
                    previewStage.releasePointerCapture(event.pointerId);
                }
            }
        });

        previewBox.addEventListener("click", function (event) {
            if (dragMoved) {
                dragMoved = false;
                event.preventDefault();
                return;
            }

            zoomed = !zoomed;
            previewBox.classList.toggle("is-zoomed", zoomed);
            image.style.transformOrigin = "center center";

            if (!zoomed) {
                offsetX = 0;
                offsetY = 0;
                applyTransform(1, 0, 0);
                return;
            }

            applyTransform(zoomScale, offsetX, offsetY);
        });

        function applyTransform(scale, x, y) {
            image.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
        }

        function clampOffsets(x, y, rect, scale) {
            const maxX = Math.max(0, ((scale - 1) * rect.width) / 2);
            const maxY = Math.max(0, ((scale - 1) * rect.height) / 2);

            return {
                x: Math.min(maxX, Math.max(-maxX, x)),
                y: Math.min(maxY, Math.max(-maxY, y))
            };
        }
    }

    function initLightbox() {
        const lightbox = document.getElementById("productLightbox");
        const closeButton = document.getElementById("lightboxClose");

        if (!lightbox || !closeButton) return;

        closeButton.addEventListener("click", closeLightbox);
        lightbox.addEventListener("click", function (event) {
            if (event.target === lightbox) {
                closeLightbox();
            }
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && !lightbox.hidden) {
                closeLightbox();
            }
        });

        function closeLightbox() {
            lightbox.hidden = true;
            document.body.style.overflow = "";
        }
    }

    function initCustomDesignButton() {
        const button = document.getElementById("customDesignBtn");
        if (!button) return;

        button.addEventListener("click", function () {
            alert("Custom design requests can be connected here next.");
        });
    }

    function initShareButton() {
        const button = document.getElementById("shareBtn");
        if (!button) return;

        button.addEventListener("click", async function () {
            const shareData = {
                title: document.getElementById("productTitle")?.textContent || "AJartivo Design",
                text: "Check out this design on AJartivo.",
                url: window.location.href
            };

            if (navigator.share) {
                try {
                    await navigator.share(shareData);
                    return;
                } catch (error) {
                    if (error && error.name === "AbortError") return;
                }
            }

            try {
                await navigator.clipboard.writeText(window.location.href);
                alert("Design link copied.");
            } catch (error) {
                console.error("Share failed:", error);
                alert("Unable to share right now.");
            }
        });
    }

    function syncPreviewHint() {
        const previewHint = document.querySelector(".preview-hint");
        const zoomPill = document.querySelector(".product-zoom-pill");
        const hasDesktopHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

        if (previewHint) {
            previewHint.textContent = hasDesktopHover ? "Click to zoom, drag to explore" : "Tap to zoom, drag to explore";
        }

        if (zoomPill) {
            zoomPill.textContent = hasDesktopHover ? "2x zoom with drag inside frame" : "Tap zoom with drag inside frame";
        }
    }

    function isFreeDesign(product) {
        const item = services.normalizeDesign(product);
        return item.is_free === true || (item.is_paid !== true && Number(item.price || 0) <= 0);
    }

    function hasDownloadAccess(product) {
        const item = services.normalizeDesign(product);
        return item.has_access === true || item.isPurchased === true || item.is_purchased === true;
    }

    function resolveActionButtonState(product) {
        const signedIn = Boolean(getCurrentUserEmail());

        if (hasDownloadAccess(product)) {
            return {
                mode: "download",
                idleText: "Download",
                busyText: "Preparing..."
            };
        }

        if (signedIn && isFreeDesign(product)) {
            return {
                mode: "download",
                idleText: "Download",
                busyText: "Preparing..."
            };
        }

        if (!signedIn) {
            return {
                mode: "login-download",
                idleText: "Login to Download",
                busyText: "Opening..."
            };
        }

        return {
            mode: "buy-now",
            idleText: "Buy Now",
            busyText: "Opening..."
        };
    }

    function getCurrentUserSession() {
        const session = services.getSession ? services.getSession() : null;
        if (!session || !cleanText(session.email)) {
            return null;
        }

        return session;
    }

    function getCurrentUserEmail() {
        const session = getCurrentUserSession();
        return cleanText(session && session.email).toLowerCase();
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function cleanText(value) {
        return String(value || "").trim();
    }

    function shortenText(value, limit) {
        const text = cleanText(value).replace(/\s+/g, " ");
        if (!text || text.length <= limit) {
            return text;
        }

        return `${text.slice(0, Math.max(0, limit - 3)).trim()}...`;
    }
})();
