(function () {
    const services = window.AjArtivoSupabase;
    if (!services) return;

    const trendingGrid = document.getElementById("trendingGrid");
    const popularGrid = document.getElementById("popularDesignGrid");
    let refreshTimerId = null;

    if (!trendingGrid && !popularGrid) return;

    loadHomepageProducts();
    bindLiveRefresh();

    async function loadHomepageProducts() {
        try {
            const products = await services.fetchProducts();
            const latestProducts = [...products]
                .sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));

            if (trendingGrid) {
                renderProductCards(trendingGrid, latestProducts.slice(0, 6));
            }

            if (popularGrid) {
                const popularProducts = [...products]
                    .sort((a, b) => Number(b.downloads || 0) - Number(a.downloads || 0))
                    .slice(0, 6);

                renderProductCards(popularGrid, popularProducts);
            }
        } catch (error) {
            console.error("Failed to load homepage products:", error);
            if (trendingGrid) {
                trendingGrid.innerHTML = '<div class="empty-state">Could not load products right now.</div>';
            }
            if (popularGrid) {
                popularGrid.innerHTML = '<div class="empty-state">Could not load popular products right now.</div>';
            }
        }
    }

    function bindLiveRefresh() {
        if (document.body.dataset.homeProductsLiveBound === "true") {
            return;
        }

        window.addEventListener("ajartivo:products-changed", function () {
            if (refreshTimerId) {
                window.clearTimeout(refreshTimerId);
            }

            refreshTimerId = window.setTimeout(function () {
                loadHomepageProducts();
            }, 250);
        });

        document.body.dataset.homeProductsLiveBound = "true";
    }

    function renderProductCards(container, products) {
        if (!products.length) {
            container.innerHTML = '<div class="empty-state">No products found yet.</div>';
            return;
        }

        container.innerHTML = products.map(function (product) {
            const title = escapeHtml(product.title);
            const image = escapeHtml(product.image || "/images/preview1.jpg");
            const productUrl = `/product.html?id=${encodeURIComponent(product.id)}`;
            const badge = getProductBadge(product);

            return `
                <article class="product-card homepage-design-card" data-product-id="${escapeHtml(product.id)}">
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
            label: product.is_paid ? "PREMIUM" : "FREE",
            className: product.is_paid ? "premium" : "free",
            styleAttr: ""
        };
    }

    function getCreatedAtMs(product) {
        const date = new Date(product.created_at || product.createdAt || 0);
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
