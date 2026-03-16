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
        const type = design.category || "Other";
        const price = Number(design.price);
        const amount = Number.isFinite(price) && price > 0 ? `Rs. ${price}` : "Free";

        document.title = `${title} - AJartivo`;
        setText("productTitle", title);
        setText("productDescription", design.description || "Premium design package.");
        setText("productTypeChip", type.toUpperCase());
        setText("productPrice", amount);
        setText("productPriceNote", "One-time purchase with editable source files and external download delivery.");

        renderFeatures(design, type);
        renderThumbnails(design.image, title);
        bindDownload(design);
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

    function renderThumbnails(imageUrl, title) {
        const row = document.getElementById("thumbnailRow");
        const mainImage = document.getElementById("mainImage");
        const lightboxImage = document.getElementById("lightboxImage");
        const image = imageUrl || "/images/trending1.jpg";

        if (mainImage) {
            mainImage.src = image;
            mainImage.alt = title;
        }

        if (lightboxImage) {
            lightboxImage.src = image;
            lightboxImage.alt = `${title} zoomed preview`;
        }

        if (!row) return;

        row.innerHTML = `
            <button class="thumbnail-btn active" type="button" data-preview="${escapeHtml(image)}" aria-label="Show preview">
                <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}">
            </button>
        `;
    }

    function bindDownload(design) {
        const button = document.getElementById("downloadBtn");
        if (!button) return;

        if (!design || !design.download) {
            button.disabled = true;
            button.textContent = "Download Coming Soon";
            return;
        }

        button.disabled = false;
        button.textContent = "Download ZIP";
        button.onclick = function () {
            services.db.collection("designs").doc(design.id).update({
                downloads: services.increment(1)
            }).catch(function (error) {
                console.error("Download counter update failed:", error);
            }).finally(function () {
                window.open(design.download, "_blank", "noopener");
            });
        };
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
