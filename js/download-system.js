(function () {
    const services = window.AjArtivoFirebase;
    if (!services) return;

    const productTitle = document.getElementById("productTitle");
    if (!productTitle) return;

    const params = new URLSearchParams(window.location.search);
    const designId = params.get("id");
    const designName = params.get("name");
    let currentDesign = null;

    initPage();

    async function initPage() {
        bindStaticInteractions();

        try {
            currentDesign = await fetchDesign();
            if (!currentDesign) {
                setText("productTitle", "Design not found");
                setText("productDescription", "This design is not available right now.");
                bindDownload(null);
                return;
            }

            renderProduct(currentDesign);
            await loadRelatedDesigns(currentDesign.id);
            await bindWishlistButton(currentDesign);
            incrementViews(currentDesign.id);
        } catch (error) {
            console.error("Product load failed:", error);
            setText("productTitle", "Unable to load design");
            setText("productDescription", "Please try again later.");
        }
    }

    async function fetchDesign() {
        if (designId) {
            const doc = await services.db.collection("designs").doc(designId).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
        }

        if (designName) {
            const snapshot = await services.db.collection("designs")
                .where("title", "==", designName)
                .limit(1)
                .get();

            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                return { id: doc.id, ...doc.data() };
            }
        }

        return null;
    }

    function renderProduct(design) {
        const title = design.title || "Untitled Design";
        const type = normalizeDesignFormat(design) || "OTHER";
        const price = Number(design.price);
        const amount = Number.isFinite(price) && price > 0 ? `Rs. ${price}` : "Free";
        const premium = isPremiumDesign(design);

        document.title = `${title} - AJartivo`;
        setText("productTitle", title);
        setText("productDescription", design.description || "Premium design package.");
        setText("productTypeChip", type);
        setText("productPrice", amount);
        setText("productPriceNote", "One-time purchase with editable source files and external download delivery.");
        setText("galleryFormat", type);
        setText("galleryAccess", premium ? "Premium" : "Free");
        setText("galleryViews", String(Number(design.views || 0)));
        setText("galleryDownloads", String(Number(design.downloads || 0)));

        renderFeatures(design, type);
        renderThumbnails(collectPreviewImages(design), title);
        bindDownload(design);
    }

    async function loadRelatedDesigns(currentId) {
        const relatedGrid = document.getElementById("relatedDesignGrid");
        if (!relatedGrid) return;

        relatedGrid.innerHTML = '<div class="empty-state">Loading related designs...</div>';

        try {
            const snapshot = await services.db.collection("designs")
                .orderBy("createdAt", "desc")
                .get();

            const designs = snapshot.docs
                .map(function (doc) {
                    return { id: doc.id, ...doc.data() };
                })
                .filter(function (design) {
                    return design.id !== currentId;
                });

            if (!designs.length) {
                relatedGrid.innerHTML = '<div class="empty-state">No uploaded related designs found.</div>';
                return;
            }

            relatedGrid.innerHTML = designs.map(function (design) {
                const title = escapeHtml(design.title || "Untitled Design");
                const badge = getDesignBadge(design);
                const image = escapeHtml(design.image || "/images/trending1.jpg");
                const productUrl = `/product.html?id=${encodeURIComponent(design.id)}`;

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
            console.error("Related designs load failed:", error);
            relatedGrid.innerHTML = '<div class="empty-state">Could not load related designs right now.</div>';
        }
    }

    function renderFeatures(design, type) {
        const featureList = document.getElementById("productFeatures");
        if (!featureList) return;

        const tags = Array.isArray(design.tags) ? design.tags : [];
        const features = [
            `Editable ${String(type || "design").toUpperCase()} template ready for production work`,
            design.description || "Built for fast customization and marketplace delivery",
            tags.length ? `Tags: ${tags.join(", ")}` : "Curated for creators and print-ready workflows",
            `Views: ${Number(design.views || 0)} | Downloads: ${Number(design.downloads || 0)}`
        ];

        featureList.innerHTML = features.map(function (feature) {
            return `<li>${escapeHtml(feature)}</li>`;
        }).join("");
    }

    function renderThumbnails(images, title) {
        const row = document.getElementById("thumbnailRow");
        const previewImages = Array.isArray(images) && images.length ? images : ["/images/trending1.jpg"];
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

    function collectPreviewImages(design) {
        const candidates = [];

        if (Array.isArray(design.previewImages)) {
            candidates.push(...design.previewImages);
        }

        if (Array.isArray(design.images)) {
            candidates.push(...design.images);
        }

        candidates.push(
            design.preview1,
            design.preview2,
            design.preview3,
            design.preview4,
            design.preview5,
            design.image
        );

        const clean = candidates
            .map((item) => String(item || "").trim())
            .filter(Boolean);

        return [...new Set(clean)];
    }

    function setMainPreviewImage(src, title) {
        const previewBox = document.getElementById("previewTrigger");
        const mainImage = document.getElementById("mainImage");
        const lightboxImage = document.getElementById("lightboxImage");
        if (!previewBox || !mainImage || !src) return;

        previewBox.classList.add("is-loading");
        mainImage.alt = title || "Product Preview";
        mainImage.loading = "lazy";
        mainImage.decoding = "async";

        const preloader = new Image();
        preloader.decoding = "async";
        preloader.onload = function () {
            mainImage.src = src;
            if (lightboxImage) {
                lightboxImage.src = src;
                lightboxImage.alt = `${title || "Product Preview"} zoomed preview`;
            }

            requestAnimationFrame(() => {
                previewBox.classList.remove("is-loading");
            });
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

    function bindDownload(design) {
        const button = document.getElementById("downloadBtn");
        if (!button) return;

        if (!design || !design.id) {
            button.disabled = true;
            button.textContent = "Download Coming Soon";
            return;
        }

        const premium = window.AjArtivoPayment && window.AjArtivoPayment.isPremiumDesign
            ? window.AjArtivoPayment.isPremiumDesign(design)
            : Number(design.price || 0) > 0;

        button.disabled = false;
        button.textContent = premium ? "Buy & Download" : "Download Free";
        button.onclick = async function () {
            button.disabled = true;
            button.textContent = "Processing...";

            try {
                if (!window.AjArtivoPayment || !window.AjArtivoPayment.startDownloadFlow) {
                    throw new Error("Payment system is not ready.");
                }

                await window.AjArtivoPayment.startDownloadFlow(design);
            } catch (error) {
                console.error("Secure download failed:", error);
                alert(error.message || "Unable to download right now.");
            } finally {
                button.disabled = false;
                button.textContent = premium ? "Buy & Download" : "Download Free";
            }
        };
    }

    function isPremiumDesign(design) {
        if (window.AjArtivoPayment && typeof window.AjArtivoPayment.isPremiumDesign === "function") {
            return window.AjArtivoPayment.isPremiumDesign(design);
        }

        const amount = Number(design && design.price ? design.price : 0);
        return Number.isFinite(amount) && amount > 0;
    }

    function normalizeDesignFormat(design) {
        const raw = String(
            (design && (
                design.extension ||
                design.fileType ||
                design.format ||
                design.category ||
                design.type
            )) || ""
        )
            .trim()
            .replace(/^\./, "")
            .toUpperCase();

        const aliasMap = {
            ILLUSTRATOR: "AI",
            PHOTOSHOP: "PSD",
            CORELDRAW: "CDR",
            JPEG: "JPG"
        };

        return aliasMap[raw] || raw;
    }

    function getDesignBadge(design) {
        const format = normalizeDesignFormat(design);
        const knownClass = format.toLowerCase();
        const knownFormats = new Set(["psd", "cdr", "ai", "pmd", "png", "jpg", "jpeg", "pdf", "svg", "eps", "ttf"]);

        if (format && knownFormats.has(knownClass)) {
            return { label: escapeHtml(format), className: knownClass, styleAttr: "" };
        }

        if (format) {
            const color = colorFromText(format);
            return {
                label: escapeHtml(format),
                className: "other",
                styleAttr: ` style="background:${color};"`
            };
        }

        const premium = isPremiumDesign(design);
        return {
            label: premium ? "PREMIUM" : "FREE",
            className: premium ? "premium" : "free",
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

    function incrementViews(id) {
        if (!id) return;
        services.db.collection("designs").doc(id).update({
            views: services.increment(1)
        }).catch(function (error) {
            console.error("View counter update failed:", error);
        });
    }

    function bindStaticInteractions() {
        initPreviewZoom();
        initLightbox();
        initCustomDesignButton();
        initShareButton();
        syncPreviewHint();
        window.addEventListener("resize", syncPreviewHint);
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
            alert("Custom design section is ready. Share the exact workflow and we will connect it next.");
        });
    }

    function initShareButton() {
        const button = document.getElementById("shareBtn");
        if (!button) return;

        button.addEventListener("click", async function () {
            const shareData = {
                title: document.getElementById("productTitle")?.textContent || "AjArtivo Design",
                text: "Check out this design on AjArtivo.",
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

    async function bindWishlistButton(design) {
        const button = document.getElementById("wishlistBtn");
        if (!button) return;

        if (!design || !design.id) {
            button.disabled = true;
            button.textContent = "Wishlist unavailable";
            return;
        }

        const updateButtonState = function (saved) {
            button.dataset.saved = saved ? "true" : "false";
            button.textContent = saved ? "Saved in Wishlist" : "Save to Wishlist";
        };

        updateButtonState(false);

        try {
            const currentUser = services.auth.currentUser;
            if (currentUser && window.AjArtivoPayment && typeof window.AjArtivoPayment.isInWishlist === "function") {
                const saved = await window.AjArtivoPayment.isInWishlist(design.id, currentUser);
                updateButtonState(saved);
            }
        } catch (error) {
            console.error("Wishlist state check failed:", error);
        }

        button.onclick = async function () {
            button.disabled = true;

            try {
                if (!window.AjArtivoPayment || typeof window.AjArtivoPayment.toggleWishlist !== "function") {
                    throw new Error("Wishlist system is not ready.");
                }

                const result = await window.AjArtivoPayment.toggleWishlist(design);
                updateButtonState(Boolean(result && result.saved));
                alert(result && result.saved ? "Added to wishlist." : "Removed from wishlist.");
            } catch (error) {
                console.error("Wishlist update failed:", error);
                alert(error.message || "Unable to update wishlist right now.");
            } finally {
                button.disabled = false;
            }
        };
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

})();
