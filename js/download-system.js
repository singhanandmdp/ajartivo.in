(function () {
    const services = window.AjArtivoSupabase;
    if (!services) return;

    const productTitle = document.getElementById("productTitle");
    if (!productTitle) return;

    const params = new URLSearchParams(window.location.search);
    const productId = cleanText(params.get("id"));
    let currentProduct = null;
    let refreshTimerId = null;
    let accessRequestId = 0;
    let currentAccessState = createAccessState();

    initPage();
    bindLiveRefresh();
    bindPurchaseStateEvents();

    async function initPage() {
        bindStaticInteractions();

        try {
            if (!productId) {
                setText("productTitle", "Product not found");
                setText("productDescription", "Product link is missing or invalid.");
                bindActionButton(null, createAccessState());
                return;
            }

            currentProduct = await services.fetchProductById(productId);

            if (!currentProduct) {
                setText("productTitle", "Product not found");
                setText("productDescription", "This product is not available right now.");
                bindActionButton(null, createAccessState());
                return;
            }

            currentProduct = services.normalizeProduct(currentProduct);
            renderProduct(currentProduct);

            await Promise.all([
                loadRelatedProducts(currentProduct.id),
                bindWishlistButton(currentProduct),
                refreshProductAccess(currentProduct)
            ]);
        } catch (error) {
            console.error("Product load failed:", error);
            setText("productTitle", "Unable to load product");
            setText("productDescription", "Please try again later.");
            bindActionButton(null, createAccessState());
        }
    }

    function bindLiveRefresh() {
        if (document.body.dataset.productLiveBound === "true") {
            return;
        }

        window.addEventListener("ajartivo:products-changed", function () {
            if (refreshTimerId) {
                window.clearTimeout(refreshTimerId);
            }

            refreshTimerId = window.setTimeout(function () {
                initPage();
            }, 250);
        });

        document.body.dataset.productLiveBound = "true";
    }

    function bindPurchaseStateEvents() {
        if (document.body.dataset.productPurchaseBound === "true") {
            return;
        }

        window.addEventListener("ajartivo:purchase-completed", function (event) {
            const detail = event && event.detail ? event.detail : {};
            if (!currentProduct || String(detail.productId) !== String(currentProduct.id)) {
                return;
            }

            currentAccessState = createAccessState({
                loading: false,
                checked: true,
                hasAccess: true,
                reason: "purchased",
                userEmail: cleanText(detail.userEmail).toLowerCase()
            });
            currentProduct = applyAccessState(currentProduct, currentAccessState);
            updateAccessUi(currentProduct, currentAccessState);
        });

        window.addEventListener("ajartivo:session-changed", function () {
            if (!currentProduct || isFreeDesign(currentProduct)) {
                return;
            }

            refreshProductAccess(currentProduct);
        });

        document.body.dataset.productPurchaseBound = "true";
    }

    function renderProduct(product) {
        const title = product.title || "Untitled Design";
        const type = String(product.category || "OTHER").toUpperCase();
        const price = Number(product.price || 0);
        const amount = isFreeDesign(product) ? "Free" : `Rs. ${price}`;

        document.title = `${title} - AJartivo`;
        setText("productTitle", title);
        setText("productDescription", product.description || "Creative product ready for instant access.");
        setText("productTypeChip", type);
        setText("productPrice", amount);
        setText("galleryFormat", type);
        setText("galleryViews", String(Number(product.views || 0)));
        setText("galleryDownloads", String(Number(product.downloads || 0)));

        renderFeatures(product, type);
        renderThumbnails(getProductImages(product), title);
        updateAccessUi(product, deriveInitialAccessState(product));
    }

    async function refreshProductAccess(product) {
        const normalizedProduct = services.normalizeProduct(product);
        const requestId = accessRequestId + 1;
        accessRequestId = requestId;

        if (isFreeDesign(normalizedProduct)) {
            currentAccessState = createAccessState({
                loading: false,
                checked: true,
                hasAccess: true,
                reason: "free",
                userEmail: getCurrentUserEmail()
            });
            currentProduct = applyAccessState(normalizedProduct, currentAccessState);
            updateAccessUi(currentProduct, currentAccessState);
            return currentProduct;
        }

        currentAccessState = createAccessState({
            loading: true,
            checked: false,
            hasAccess: false,
            reason: "checking",
            userEmail: getCurrentUserEmail()
        });
        updateAccessUi(normalizedProduct, currentAccessState);

        const resolvedAccess = await resolveProductAccess(normalizedProduct);
        if (requestId !== accessRequestId) {
            return currentProduct;
        }

        currentAccessState = resolvedAccess;
        currentProduct = applyAccessState(normalizedProduct, resolvedAccess);
        updateAccessUi(currentProduct, resolvedAccess);
        return currentProduct;
    }

    async function resolveProductAccess(product) {
        if (isFreeDesign(product)) {
            return createAccessState({
                loading: false,
                checked: true,
                hasAccess: true,
                reason: "free",
                userEmail: getCurrentUserEmail()
            });
        }

        const userSession = getCurrentUserSession();
        if (!userSession) {
            return createAccessState({
                loading: false,
                checked: true,
                hasAccess: false,
                reason: "paid",
                userEmail: ""
            });
        }

        const hasPurchase = services.hasPurchasedDesign
            ? await services.hasPurchasedDesign(userSession, product.id)
            : false;

        return createAccessState({
            loading: false,
            checked: true,
            hasAccess: hasPurchase,
            reason: hasPurchase ? "purchased" : "paid",
            userEmail: cleanText(userSession.email).toLowerCase()
        });
    }

    function updateAccessUi(product, accessState) {
        const normalizedProduct = applyAccessState(product, accessState);
        const type = String(normalizedProduct.category || "OTHER").toUpperCase();
        const isFree = isFreeDesign(normalizedProduct);
        const unlocked = hasDownloadAccess(normalizedProduct);

        setText("galleryAccess", isFree ? "Free" : unlocked ? "Unlocked" : "Premium");
        setText("productPriceNote", resolvePriceNote(normalizedProduct, accessState));
        renderFeatures(normalizedProduct, type);
        bindActionButton(normalizedProduct, accessState);
    }

    function resolvePriceNote(product, accessState) {
        const signedIn = Boolean(getCurrentUserEmail());

        if (accessState && accessState.loading) {
            return "Checking your purchase access...";
        }

        if (isFreeDesign(product)) {
            if (!signedIn) {
                return "Log in from the popup to download this free product.";
            }
            return "This is a free product. Download starts instantly.";
        }

        if (hasDownloadAccess(product)) {
            return "Purchase verified. Your download is unlocked.";
        }

        if (!signedIn) {
            return "Log in first, then use Buy Now to continue.";
        }

        return "This is a paid product. Use Buy Now to continue.";
    }

    function deriveInitialAccessState(product) {
        if (isFreeDesign(product)) {
            return createAccessState({
                loading: false,
                checked: true,
                hasAccess: true,
                reason: "free",
                userEmail: getCurrentUserEmail()
            });
        }

        if (hasDownloadAccess(product)) {
            return createAccessState({
                loading: false,
                checked: true,
                hasAccess: true,
                reason: "purchased",
                userEmail: getCurrentUserEmail()
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
        const normalizedProduct = services.normalizeProduct(product);
        const isFree = isFreeDesign(normalizedProduct);
        const isPurchased = !isFree && Boolean(accessState && accessState.hasAccess);

        return services.normalizeProduct({
            ...normalizedProduct,
            has_access: isFree || isPurchased,
            isPurchased: isPurchased,
            is_purchased: isPurchased
        });
    }

    function createAccessState(overrides) {
        return {
            loading: false,
            checked: false,
            hasAccess: false,
            reason: "unknown",
            userEmail: "",
            ...(overrides || {})
        };
    }

    async function loadRelatedProducts(currentId) {
        const relatedGrid = document.getElementById("relatedDesignGrid");
        if (!relatedGrid) return;

        relatedGrid.innerHTML = '<div class="empty-state">Loading related products...</div>';

        try {
            const products = await services.fetchRelatedProducts(currentId, 6);

            if (!products.length) {
                relatedGrid.innerHTML = '<div class="empty-state">No related products found.</div>';
                return;
            }

            relatedGrid.innerHTML = products.map(function (product) {
                const title = escapeHtml(product.title);
                const image = escapeHtml(product.image || "/images/preview1.jpg");
                const badge = getProductBadge(product);
                const productUrl = `/product.html?id=${encodeURIComponent(product.id)}`;

                return `
                    <article class="design-card homepage-design-card">
                        <a href="${productUrl}" class="card-link homepage-card-link">
                            <div class="homepage-card-media">
                                <img src="${image}" alt="${title}" class="homepage-card-image">
                                <span class="homepage-type-chip file-type ${badge.className}"${badge.styleAttr}>${badge.label}</span>
                            </div>
                        </a>
                    </article>
                `;
            }).join("");
        } catch (error) {
            console.error("Related products load failed:", error);
            relatedGrid.innerHTML = '<div class="empty-state">Could not load related products right now.</div>';
        }
    }

    function renderFeatures(product, type) {
        const featureList = document.getElementById("productFeatures");
        if (!featureList) return;

        const features = [
            `${type} source file ready for creative work`,
            resolveAccessFeature(product),
            product.protected_download_link || product.download_link ? "Secure delivery after access verification" : "Download link will be added soon",
            `Category: ${type}`
        ];

        featureList.innerHTML = features.map(function (feature) {
            return `<li>${escapeHtml(feature)}</li>`;
        }).join("");
    }

    function resolveAccessFeature(product) {
        if (isFreeDesign(product)) {
            return "Free product with account-based download";
        }

        if (hasDownloadAccess(product)) {
            return "Purchased access is unlocked for your account";
        }

        return "Paid license with Buy Now access";
    }

    function renderThumbnails(images, title) {
        const row = document.getElementById("thumbnailRow");
        const previewImages = Array.isArray(images) && images.length ? images : ["/images/preview1.jpg"];
        const primaryImage = previewImages[0];
        setMainPreviewImage(primaryImage, title);

        if (!row) return;

        row.hidden = previewImages.length <= 1;
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
        mainImage.alt = title || "Product Preview";

        const preloader = new Image();
        preloader.onload = function () {
            mainImage.src = src;
            if (lightboxImage) {
                lightboxImage.src = src;
                lightboxImage.alt = `${title || "Product Preview"} zoomed preview`;
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

    function getProductImages(product) {
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

        const currentItem = services.normalizeProduct(product);
        const buttonState = resolveActionButtonState(currentItem);

        button.disabled = Boolean(accessState && accessState.loading);
        button.textContent = accessState && accessState.loading ? "Checking..." : buttonState.idleText;
        button.dataset.mode = buttonState.mode;

        button.onclick = async function () {
            const activeProduct = currentProduct ? services.normalizeProduct(currentProduct) : currentItem;
            const activeState = resolveActionButtonState(activeProduct);

            button.disabled = true;
            button.textContent = activeState.busyText;

            try {
                await window.AjArtivoPayment.startDownloadFlow(activeProduct);
            } catch (error) {
                console.error("Download failed:", error);
                alert("Unable to start the download right now.");
            } finally {
                const refreshedProduct = currentProduct ? services.normalizeProduct(currentProduct) : activeProduct;
                const refreshedState = resolveActionButtonState(refreshedProduct);

                button.disabled = false;
                button.textContent = refreshedState.idleText;
                button.dataset.mode = refreshedState.mode;
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

    function getProductBadge(product) {
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
        if (document.body.dataset.productStaticBound === "true") {
            return;
        }

        initPreviewZoom();
        initLightbox();
        initCustomDesignButton();
        initShareButton();
        syncPreviewHint();
        window.addEventListener("resize", syncPreviewHint);

        document.body.dataset.productStaticBound = "true";
    }

    function initPreviewZoom() {
        const previewBox = document.getElementById("previewTrigger");
        const image = document.getElementById("mainImage");
        if (!previewBox || !image) return;

        previewBox.addEventListener("mousemove", function (event) {
            if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

            const rect = previewBox.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = ((event.clientY - rect.top) / rect.height) * 100;
            image.style.transformOrigin = `${x}% ${y}%`;
            image.style.transform = "scale(1.85)";
        });

        previewBox.addEventListener("mouseleave", function () {
            image.style.transformOrigin = "center center";
            image.style.transform = "scale(1)";
        });
    }

    function initLightbox() {
        const previewBox = document.getElementById("previewTrigger");
        const lightbox = document.getElementById("productLightbox");
        const closeButton = document.getElementById("lightboxClose");

        if (!previewBox || !lightbox || !closeButton) return;

        previewBox.addEventListener("click", function () {
            if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
            lightbox.hidden = false;
            document.body.style.overflow = "hidden";
        });

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
                title: document.getElementById("productTitle")?.textContent || "AJartivo Product",
                text: "Check out this product on AJartivo.",
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
                alert("Product link copied.");
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
            previewHint.textContent = hasDesktopHover ? "Hover to zoom with precision" : "Tap to open full preview";
        }

        if (zoomPill) {
            zoomPill.textContent = hasDesktopHover ? "Hover zoom on desktop" : "Tap zoom on mobile";
        }
    }

    function isFreeDesign(product) {
        const item = services.normalizeProduct(product);
        return item.is_free === true || (item.is_paid !== true && Number(item.price || 0) <= 0);
    }

    function hasDownloadAccess(product) {
        const item = services.normalizeProduct(product);
        return item.is_free === true || item.has_access === true || item.isPurchased === true || item.is_purchased === true;
    }

    function resolveActionButtonState(product) {
        const signedIn = Boolean(getCurrentUserEmail());

        if (hasDownloadAccess(product)) {
            if (isFreeDesign(product) && !signedIn) {
                return {
                    mode: "login-download",
                    idleText: "Login to Download",
                    busyText: "Opening..."
                };
            }

            return {
                mode: "download",
                idleText: "Download",
                busyText: "Preparing..."
            };
        }

        if (!signedIn) {
            return {
                mode: "login-buy",
                idleText: "Login to Buy",
                busyText: "Opening..."
            };
        }

        return {
            mode: "buy",
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
})();
