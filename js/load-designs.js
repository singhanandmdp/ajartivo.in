(function () {
    const services = window.AjArtivoSupabase;
    const resolveUrl = typeof window.AjArtivoResolveUrl === "function"
        ? window.AjArtivoResolveUrl
        : function (path) { return path; };

    if (!services) return;

    const trendingGrid = document.getElementById("trendingGrid");
    const popularGrid = document.getElementById("popularDesignGrid");
    const PERF_PREFIX = "[AJartivo Perf][homepage]";
    const CACHE_TTL_MS = 5 * 60 * 1000;
    let refreshTimerId = null;
    let inFlightPromise = null;

    if (!trendingGrid && !popularGrid) return;

    hydrateFromCache();
    loadHomepageDesigns("initial");
    bindLiveRefresh();

    function hydrateFromCache() {
        const cachedDesigns = typeof services.getCachedDesigns === "function"
            ? services.getCachedDesigns({ maxAgeMs: CACHE_TTL_MS })
            : [];

        if (!cachedDesigns.length) {
            return;
        }

        logPerf("cache-render", cachedDesigns.length);
        renderHomepageDesigns(cachedDesigns, "cache");
    }

    async function loadHomepageDesigns(source) {
        if (inFlightPromise) {
            logPerf("deduped-fetch", source || "unknown");
            return inFlightPromise;
        }

        inFlightPromise = (async function () {
            const startedAt = performance.now();
            try {
                const designs = await services.fetchDesigns({
                    source: `homepage-${source || "unknown"}`,
                    preferCache: true,
                    cacheTtlMs: CACHE_TTL_MS
                });

                renderHomepageDesigns(designs, source || "unknown");
                logPerf("fetch-complete", source || "unknown", `${Math.round(performance.now() - startedAt)}ms`, designs.length);
                return designs;
            } catch (error) {
                console.error("Failed to load homepage designs:", error);
                showHomepageError();
                return [];
            } finally {
                inFlightPromise = null;
            }
        })();

        return inFlightPromise;
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
                loadHomepageDesigns("realtime");
            }, 250);
        });

        document.body.dataset.homeDesignsLiveBound = "true";
    }

    function renderHomepageDesigns(designs, source) {
        const latestDesigns = [...designs].sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));
        const popularDesigns = [...designs]
            .sort((a, b) => Number(b.downloads || 0) - Number(a.downloads || 0))
            .slice(0, 6);

        if (trendingGrid) {
            renderDesignCards(trendingGrid, latestDesigns.slice(0, 6), "trending", source);
        }

        if (popularGrid) {
            renderDesignCards(popularGrid, popularDesigns, "popular", source);
        }
    }

    function renderDesignCards(container, designs, bucket, source) {
        if (!designs.length) {
            container.replaceChildren(buildEmptyState("No designs found yet."));
            container.dataset.renderSignature = "";
            return;
        }

        const signature = `${bucket}:${designs.map((design) => `${design.id}:${design.created_at || design.createdAt || ""}:${design.downloads || 0}`).join("|")}`;
        if (container.dataset.renderSignature === signature) {
            logPerf("render-skipped", bucket, source || "unknown", designs.length);
            return;
        }

        const fragment = document.createDocumentFragment();

        designs.forEach(function (design) {
            const title = escapeHtml(design.title || design.name || "Untitled Design");
            const image = escapeHtml(design.image || design.image_url || design.preview_url || "/images/preview1.jpg");
            const designUrl = buildProductUrl(design);
            const badge = getDesignBadge(design);
            const article = document.createElement("article");

            article.className = "design-card homepage-design-card";
            article.dataset.designId = escapeHtml(design.id);
            article.innerHTML = `
                <a href="${designUrl}" class="card-link homepage-card-link">
                    <div class="homepage-card-media">
                        <img src="${image}" alt="${title}" class="homepage-card-image" loading="lazy" decoding="async">
                        <span class="homepage-type-chip file-type ${badge.className}"${badge.styleAttr}>${badge.label}</span>
                    </div>
                </a>
            `;
            fragment.appendChild(article);
        });

        container.replaceChildren(fragment);
        container.dataset.renderSignature = signature;
        logPerf("rendered", bucket, source || "unknown", designs.length);
    }

    function buildEmptyState(message) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = message;
        return empty;
    }

    function showHomepageError() {
        if (trendingGrid) {
            trendingGrid.replaceChildren(buildEmptyState("Could not load designs right now."));
        }
        if (popularGrid) {
            popularGrid.replaceChildren(buildEmptyState("Could not load popular designs right now."));
        }
    }

    function buildProductUrl(design) {
        if (typeof window.AjArtivoBuildProductUrl === "function") {
            return window.AjArtivoBuildProductUrl(design);
        }

        const slug = typeof window.AjArtivoSlugify === "function"
            ? window.AjArtivoSlugify(design && (design.slug || design.title || design.name || design.id))
            : "";

        if (slug) {
            return resolveUrl(`/product/${encodeURIComponent(slug)}`);
        }

        return resolveUrl(`/product.html?id=${encodeURIComponent(design && design.id || "")}`);
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

    function logPerf() {
        if (!window.console || typeof window.console.log !== "function") {
            return;
        }

        const parts = Array.prototype.slice.call(arguments).filter(Boolean);
        if (!parts.length) return;
        window.console.log.apply(window.console, [PERF_PREFIX].concat(parts));
    }
})();
