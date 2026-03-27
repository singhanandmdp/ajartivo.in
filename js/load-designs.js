(function () {
    const services = window.AjArtivoFirebase;
    if (!services) return;

    const { db } = services;
    const trendingGrid = document.getElementById("trendingGrid");
    const popularGrid = document.getElementById("popularDesignGrid");

    if (!trendingGrid && !popularGrid) return;

    loadHomepageDesigns();

    async function loadHomepageDesigns() {
        try {
            const snapshot = await db.collection("designs")
                .orderBy("createdAt", "desc")
                .limit(12)
                .get();

            const designs = snapshot.docs.map(function (doc) {
                return { id: doc.id, ...doc.data() };
            });

            if (trendingGrid) {
                renderDesignCards(trendingGrid, designs.slice(0, 6));
            }

            if (popularGrid) {
                const popularDesigns = [...designs]
                    .sort(function (a, b) {
                        return Number(b.downloads || 0) - Number(a.downloads || 0);
                    })
                    .slice(0, 6);

                renderDesignCards(popularGrid, popularDesigns);
            }
        } catch (error) {
            console.error("Failed to load designs:", error);
            if (trendingGrid) {
                trendingGrid.innerHTML = '<div class="empty-state">Could not load designs right now.</div>';
            }
            if (popularGrid) {
                popularGrid.innerHTML = '<div class="empty-state">Could not load popular designs right now.</div>';
            }
        }
    }

    function renderDesignCards(container, designs) {
        if (!designs.length) {
            container.innerHTML = '<div class="empty-state">No designs found yet.</div>';
            return;
        }

        container.innerHTML = designs.map(function (design) {
            const title = escapeHtml(design.title || "Untitled Design");
            const image = escapeHtml(design.image || "/images/trending1.jpg");
            const productUrl = `/product.html?id=${encodeURIComponent(design.id)}`;
            const badge = getDesignBadge(design);

            return `
                <article class="product-card homepage-design-card" data-design-id="${escapeHtml(design.id)}">
                    <a href="${productUrl}" class="card-link homepage-card-link">
                        <div class="homepage-card-media">
                            <img src="${image}" alt="${title}" class="homepage-card-image">
                            <span class="homepage-type-chip file-type ${badge.className}"${badge.styleAttr}>${badge.label}</span>
                        </div>
                    </a>
                </article>
            `;
        }).join("");
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

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})();
