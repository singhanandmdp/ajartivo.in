(function () {
    const services = window.AjArtivoSupabase;
    const resolveUrl = typeof window.AjArtivoResolveUrl === "function"
        ? window.AjArtivoResolveUrl
        : function (path) { return path; };
    if (!services) return;

    const trendingGrid = document.getElementById("trendingGrid");
    const popularGrid = document.getElementById("popularDesignGrid");
    let refreshTimerId = null;

    if (!trendingGrid && !popularGrid) return;

    loadHomepageDesigns();
    bindLiveRefresh();

    async function loadHomepageDesigns() {
        try {
            const designs = await services.fetchDesigns();
            const latestDesigns = [...designs]
                .sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));

            if (trendingGrid) {
                renderDesignCards(trendingGrid, latestDesigns.slice(0, 6));
            }

            if (popularGrid) {
                const popularDesigns = [...designs]
                    .sort((a, b) => Number(b.downloads || 0) - Number(a.downloads || 0))
                    .slice(0, 6);

                renderDesignCards(popularGrid, popularDesigns);
            }
        } catch (error) {
            console.error("Failed to load homepage designs:", error);
            if (trendingGrid) {
                trendingGrid.innerHTML = '<div class="empty-state">Could not load designs right now.</div>';
            }
            if (popularGrid) {
                popularGrid.innerHTML = '<div class="empty-state">Could not load popular designs right now.</div>';
            }
        }
    }

    function bindLiveRefresh() {
        if (document.body.dataset.homeDesignsLiveBound === "true") {
            return;
        }

        window.addEventListener("ajartivo:designs-changed", function () {
            if (refreshTimerId) {
                window.clearTimeout(refreshTimerId);
            }

            refreshTimerId = window.setTimeout(function () {
                loadHomepageDesigns();
            }, 250);
        });

        document.body.dataset.homeDesignsLiveBound = "true";
    }

    function renderDesignCards(container, designs) {
        if (!designs.length) {
            container.innerHTML = '<div class="empty-state">No designs found yet.</div>';
            return;
        }

        container.innerHTML = designs.map(function (design) {
            const title = escapeHtml(design.title);
            const image = escapeHtml(design.image || "/images/preview1.jpg");
            const designUrl = resolveUrl(`/product.html?id=${encodeURIComponent(design.id)}`);
            const badge = getDesignBadge(design);

            return `
                <article class="design-card homepage-design-card" data-design-id="${escapeHtml(design.id)}">
                    <a href="${designUrl}" class="card-link homepage-card-link">
                        <div class="homepage-card-media">
                            <img src="${image}" alt="${title}" class="homepage-card-image">
                            <span class="homepage-type-chip file-type ${badge.className}"${badge.styleAttr}>${badge.label}</span>
                        </div>
                    </a>
                </article>
            `;
        }).join("");
    }

    function getDesignBadge(design) {
        const format = String(design.category || "").trim().toUpperCase();
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
            label: design.is_premium ? "PREMIUM" : "FREE",
            className: design.is_premium ? "premium" : "free",
            styleAttr: ""
        };
    }

    function getCreatedAtMs(design) {
        const date = new Date(design.created_at || design.createdAt || 0);
        const millis = date.getTime();
        return Number.isFinite(millis) ? millis : 0;
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
