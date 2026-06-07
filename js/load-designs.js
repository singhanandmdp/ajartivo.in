(function () {
    const services = window.AjArtivoSupabase;
    const resolveUrl = typeof window.AjArtivoResolveUrl === "function"
        ? window.AjArtivoResolveUrl
        : resolveLocalSiteUrl;

    if (!services) return;

    const trendingGrid = document.getElementById("trendingGrid");
    const popularGrid = document.getElementById("popularDesignGrid");
    const loadMoreButton = document.getElementById("homepageLoadMoreBtn");
    const paginationContainer = document.getElementById("homepagePagination");
    const metaElement = document.getElementById("homepageDesignMeta");
    const activeFilterRow = document.getElementById("homepageActiveFilterRow");
    const clearFiltersButton = document.getElementById("homepageClearFiltersBtn");
    const PERF_PREFIX = "[AJartivo Perf][homepage]";
    const CACHE_TTL_MS = 5 * 60 * 1000;
    const PAGE_SIZE = 20;
    const INITIAL_VISIBLE_COUNT = 12;
    const LOAD_MORE_STEP = 8;
    let refreshTimerId = null;
    let inFlightPromise = null;
    let allDesigns = [];
    let activePageItems = [];
    let currentState = readStateFromUrl();
    let visibleCount = INITIAL_VISIBLE_COUNT;

    if (!trendingGrid) return;

    function resolveLocalSiteUrl(path) {
        if (!path) return window.location.href;
        if (/^(?:[a-z]+:)?\/\//i.test(path)) return path;

        const input = String(path || "");
        const suffixMatch = input.match(/^([^?#]*)([?#].*)?$/);
        const normalizedInput = String(suffixMatch ? suffixMatch[1] : input)
            .replace(/\/index\.html(?=([?#]|$))/i, "/")
            .replace(/\.html(?=([?#]|$))/i, "");
        const suffix = suffixMatch && suffixMatch[2] ? suffixMatch[2] : "";

        if (normalizedInput.startsWith("/product/")) {
            const slug = normalizedInput.slice("/product/".length).replace(/\/+$/, "");
            if (slug) {
                return `/product/${encodeURIComponent(slug)}${suffix}`;
            }
        }

        if (normalizedInput === "/product") {
            return `/product${suffix}`;
        }

        if (normalizedInput.startsWith("/product?")) {
            return `/product${suffix}`;
        }

        if (!path.startsWith("/")) {
            return `/${normalizedInput}${suffix}`;
        }

        const pathname = String(window.location && window.location.pathname || "");
        const markers = ["/pages/", "/about/", "/tools/", "/Profile/"];
        for (let i = 0; i < markers.length; i += 1) {
            const markerIndex = pathname.indexOf(markers[i]);
            if (markerIndex >= 0) {
                return `${pathname.slice(0, markerIndex)}${normalizedInput}`;
            }
        }

        const lastSlashIndex = pathname.lastIndexOf("/");
        const basePath = lastSlashIndex > 0 ? pathname.slice(0, lastSlashIndex) : "";
        return `${basePath}${normalizedInput}${suffix}`;
    }

    bindFilterControls();
    hydrateFromCache();
    loadHomepageDesigns("initial");
    bindLiveRefresh();
    bindHistoryNavigation();

    function hydrateFromCache() {
        const cachedDesigns = typeof services.getCachedDesigns === "function"
            ? services.getCachedDesigns({ maxAgeMs: CACHE_TTL_MS })
            : [];

        if (!cachedDesigns.length) {
            return;
        }

        allDesigns = cachedDesigns.slice();
        renderHomepageDesigns("cache");
        logPerf("cache-render", cachedDesigns.length);
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

                allDesigns = Array.isArray(designs) ? designs.slice() : [];
                renderHomepageDesigns(source || "unknown");
                logPerf("fetch-complete", source || "unknown", `${Math.round(performance.now() - startedAt)}ms`, allDesigns.length);
                return allDesigns;
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

    function bindHistoryNavigation() {
        window.addEventListener("popstate", function () {
            currentState = readStateFromUrl();
            visibleCount = INITIAL_VISIBLE_COUNT;
            renderHomepageDesigns("popstate");
        });
    }

    function bindFilterControls() {
        const controls = getFilterControls();
        const values = currentState;

        if (controls.fileTypeFilter) controls.fileTypeFilter.value = values.category || "";
        if (controls.licenseFilter) controls.licenseFilter.value = values.price || "";
        if (controls.aiFilter) controls.aiFilter.value = values.ai || "";
        if (controls.orientationFilter) controls.orientationFilter.value = values.orientation || "";
        if (controls.colorFilter) controls.colorFilter.value = values.color || "";
        if (controls.sortFilter) controls.sortFilter.value = values.sort || "latest";

        const selectControls = [
            controls.fileTypeFilter,
            controls.licenseFilter,
            controls.aiFilter,
            controls.orientationFilter,
            controls.colorFilter,
            controls.sortFilter
        ];

        selectControls.forEach(function (control) {
            if (!control || control.dataset.bound === "true") {
                return;
            }

            control.addEventListener("change", function () {
                currentState = readStateFromControls();
                currentState.page = 1;
                visibleCount = INITIAL_VISIBLE_COUNT;
                updateUrlFromState({ push: true });
                renderHomepageDesigns("filters");
            });

            control.dataset.bound = "true";
        });

        if (clearFiltersButton && clearFiltersButton.dataset.bound !== "true") {
            clearFiltersButton.addEventListener("click", function () {
                clearFilterControls();
                currentState = {
                    category: "",
                    price: "",
                    sort: "latest",
                    ai: "",
                    orientation: "",
                    color: "",
                    page: 1
                };
                visibleCount = INITIAL_VISIBLE_COUNT;
                updateUrlFromState({ push: true, clear: true });
                renderHomepageDesigns("filters-cleared");
            });

            clearFiltersButton.dataset.bound = "true";
        }

        if (loadMoreButton && loadMoreButton.dataset.bound !== "true") {
            loadMoreButton.addEventListener("click", function () {
                visibleCount = Math.min(visibleCount + LOAD_MORE_STEP, PAGE_SIZE, activePageItems.length);
                renderHomepageDesigns("load-more");
            });
            loadMoreButton.dataset.bound = "true";
        }
    }

    function clearFilterControls() {
        const controls = getFilterControls();
        if (controls.fileTypeFilter) controls.fileTypeFilter.value = "";
        if (controls.licenseFilter) controls.licenseFilter.value = "";
        if (controls.aiFilter) controls.aiFilter.value = "";
        if (controls.orientationFilter) controls.orientationFilter.value = "";
        if (controls.colorFilter) controls.colorFilter.value = "";
        if (controls.sortFilter) controls.sortFilter.value = "latest";
    }

    function getFilterControls() {
        return {
            fileTypeFilter: document.getElementById("homepageFileTypeFilter"),
            licenseFilter: document.getElementById("homepageLicenseFilter"),
            sortFilter: document.getElementById("homepageSortFilter"),
            aiFilter: document.getElementById("homepageAiFilter"),
            orientationFilter: document.getElementById("homepageOrientationFilter"),
            colorFilter: document.getElementById("homepageColorFilter")
        };
    }

    function readStateFromControls() {
        const controls = getFilterControls();
        return {
            category: cleanText(controls.fileTypeFilter && controls.fileTypeFilter.value).toUpperCase(),
            price: cleanText(controls.licenseFilter && controls.licenseFilter.value).toLowerCase(),
            sort: cleanText(controls.sortFilter && controls.sortFilter.value).toLowerCase() || "latest",
            ai: cleanText(controls.aiFilter && controls.aiFilter.value).toLowerCase(),
            orientation: cleanText(controls.orientationFilter && controls.orientationFilter.value).toLowerCase(),
            color: cleanText(controls.colorFilter && controls.colorFilter.value).toLowerCase(),
            page: Math.max(1, Number(currentState && currentState.page) || 1)
        };
    }

    function readStateFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return {
            category: cleanText(params.get("category")).toUpperCase(),
            price: cleanText(params.get("price")).toLowerCase(),
            sort: cleanText(params.get("sort")).toLowerCase() || "latest",
            ai: cleanText(params.get("ai")).toLowerCase(),
            orientation: cleanText(params.get("orientation")).toLowerCase(),
            color: cleanText(params.get("color")).toLowerCase(),
            page: Math.max(1, Number(params.get("page") || 1))
        };
    }

    function updateUrlFromState(options) {
        const params = new URLSearchParams();
        const state = currentState || {};
        const shouldClear = Boolean(options && options.clear);

        if (!shouldClear && state.category) params.set("category", state.category);
        if (!shouldClear && state.price) params.set("price", state.price);
        if (!shouldClear && state.sort && state.sort !== "latest") params.set("sort", state.sort);
        if (!shouldClear && state.ai) params.set("ai", state.ai);
        if (!shouldClear && state.orientation) params.set("orientation", state.orientation);
        if (!shouldClear && state.color) params.set("color", state.color);
        if (!shouldClear && Number(state.page) > 1) params.set("page", String(state.page));

        const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`;
        const method = options && options.push ? "pushState" : "replaceState";
        window.history[method]({}, "", nextUrl);
    }

    function renderHomepageDesigns(source) {
        const filteredDesigns = applyHomepageFilters(allDesigns, currentState);
        const pageCount = Math.max(1, Math.ceil(filteredDesigns.length / PAGE_SIZE));
        currentState.page = Math.min(Math.max(1, Number(currentState.page) || 1), pageCount);
        const start = (currentState.page - 1) * PAGE_SIZE;
        activePageItems = filteredDesigns.slice(start, start + PAGE_SIZE);
        const renderCount = Math.min(visibleCount, activePageItems.length);
        const itemsToRender = activePageItems.slice(0, renderCount);
        const popularItems = getPopularDesigns(filteredDesigns.length ? filteredDesigns : allDesigns).slice(0, 6);
        const popularSection = document.getElementById("popularDesignsSection");

        renderHomepageCards(trendingGrid, itemsToRender);
        renderPopularSection(popularSection, popularItems);
        renderMeta(filteredDesigns.length, start, renderCount);
        renderActiveFilterChips(activeFilterRow, currentState);
        renderLoadMoreButton(activePageItems.length, renderCount);
        renderPagination(pageCount, currentState.page, paginationContainer);
        updateUrlFromState();

        logPerf("rendered", source || "unknown", itemsToRender.length, filteredDesigns.length, `page ${currentState.page}/${pageCount}`);
    }

    function renderPopularSection(section, designs) {
        if (!section || !popularGrid) return;

        if (!designs.length) {
            section.hidden = true;
            popularGrid.replaceChildren(buildEmptyState("No popular designs found yet."));
            popularGrid.dataset.renderSignature = "";
            return;
        }

        section.hidden = false;
        renderHomepageCards(popularGrid, designs);
    }

    function renderHomepageCards(container, designs) {
        if (!container) return;

        if (!designs.length) {
            container.replaceChildren(buildEmptyState("No designs found yet."));
            container.dataset.renderSignature = "";
            return;
        }

        const signature = designs.map((design) => `${design.id}:${design.created_at || design.createdAt || ""}:${design.downloads || 0}`).join("|");
        if (container.dataset.renderSignature === signature) {
            return;
        }

        const fragment = document.createDocumentFragment();
        designs.forEach(function (design) {
            const title = escapeHtml(design.title || design.name || "Untitled Design");
            const image = escapeHtml(design.image || design.image_url || design.preview_url || resolveUrl("/images/preview1.jpg"));
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
    }

    function renderMeta(total, start, renderCount) {
        if (!metaElement) return;

        if (!total) {
            metaElement.textContent = "No matching designs";
            return;
        }

        const first = start + 1;
        const last = start + renderCount;
        metaElement.textContent = `Showing ${first}-${last} of ${total} designs`;
    }

    function renderLoadMoreButton(totalOnPage, renderedCount) {
        if (!loadMoreButton) return;

        const hasMore = renderedCount < totalOnPage;
        loadMoreButton.hidden = !hasMore;
        loadMoreButton.textContent = hasMore
            ? `Load More ${Math.min(LOAD_MORE_STEP, totalOnPage - renderedCount)}`
            : "Load More";
    }

    function renderPagination(pageCount, currentPage, container) {
        if (!container) return;

        if (pageCount <= 1) {
            container.innerHTML = "";
            return;
        }

        const buttons = [];
        const maxWindow = 7;
        const half = Math.floor(maxWindow / 2);
        const start = Math.max(1, currentPage - half);
        const end = Math.min(pageCount, start + maxWindow - 1);
        const adjustedStart = Math.max(1, end - maxWindow + 1);

        buttons.push(renderPageButton("Prev", Math.max(1, currentPage - 1), currentPage === 1));
        if (adjustedStart > 1) {
            buttons.push(renderPageButton("1", 1, false, currentPage === 1));
            if (adjustedStart > 2) {
                buttons.push('<span class="page-dots">...</span>');
            }
        }

        for (let page = adjustedStart; page <= end; page += 1) {
            buttons.push(renderPageButton(String(page), page, false, page === currentPage));
        }

        if (end < pageCount) {
            if (end < pageCount - 1) {
                buttons.push('<span class="page-dots">...</span>');
            }
            buttons.push(renderPageButton(String(pageCount), pageCount, false, currentPage === pageCount));
        }

        buttons.push(renderPageButton("Next", Math.min(pageCount, currentPage + 1), currentPage === pageCount));

        container.innerHTML = buttons.join("");
        container.querySelectorAll("button[data-page]").forEach((button) => {
            button.addEventListener("click", function () {
                if (button.disabled) return;
                const nextPage = Number(button.dataset.page || 1);
                currentState.page = nextPage;
                visibleCount = INITIAL_VISIBLE_COUNT;
                updateUrlFromState({ push: true });
                renderHomepageDesigns("pagination");
            });
        });
    }

    function renderPageButton(label, page, disabled, active) {
        const activeClass = active ? " active" : "";
        const disabledAttr = disabled ? " disabled" : "";
        return `<button type="button" data-page="${page}" class="${activeClass.trim()}"${disabledAttr}>${label}</button>`;
    }

    function renderActiveFilterChips(container, state) {
        if (!container) return;

        const chips = [];
        if (state.category) chips.push(`Type: ${state.category}`);
        if (state.price) chips.push(`License: ${state.price}`);
        if (state.ai) chips.push(`AI: ${state.ai}`);
        if (state.orientation) chips.push(`Orientation: ${state.orientation}`);
        if (state.color) chips.push(`Color: ${state.color}`);
        if (state.sort && state.sort !== "latest") chips.push(`Sort: ${state.sort.replace("_", " ")}`);

        container.innerHTML = chips.map((chip) => `<span class="active-filter-chip">${escapeHtml(chip)}</span>`).join("");
    }

    function applyHomepageFilters(designs, state) {
        let result = Array.isArray(designs) ? designs.slice() : [];
        const category = cleanText(state && state.category).toUpperCase();
        const priceFilter = cleanText(state && state.price).toLowerCase();
        const aiFilter = cleanText(state && state.ai).toLowerCase();
        const orientationFilter = cleanText(state && state.orientation).toLowerCase();
        const colorFilter = cleanText(state && state.color).toLowerCase();

        if (category) {
            result = result.filter((design) => normalizeDesignFormat(design) === category);
        }

        if (priceFilter === "free") {
            result = result.filter((design) => !isPremiumDesign(design));
        }

        if (priceFilter === "premium") {
            result = result.filter((design) => isPremiumDesign(design));
        }

        if (aiFilter) {
            result = result.filter((design) => {
                const aiGenerated = detectAiGenerated(design);
                return aiFilter === "yes" ? aiGenerated : !aiGenerated;
            });
        }

        if (orientationFilter) {
            result = result.filter((design) => detectOrientation(design) === orientationFilter);
        }

        if (colorFilter) {
            result = result.filter((design) => detectColor(design) === colorFilter);
        }

        sortDesigns(result, cleanText(state && state.sort).toLowerCase() || "latest");
        return result;
    }

    function sortDesigns(designs, sortFilter) {
        if (!Array.isArray(designs)) return;

        if (sortFilter === "oldest") {
            designs.sort((a, b) => getCreatedAtMs(a) - getCreatedAtMs(b));
            return;
        }

        if (sortFilter === "downloads") {
            designs.sort((a, b) => Number(b.downloads || 0) - Number(a.downloads || 0));
            return;
        }

        if (sortFilter === "views") {
            designs.sort((a, b) => Number(b.views || 0) - Number(a.views || 0));
            return;
        }

        if (sortFilter === "trending") {
            designs.sort((a, b) => trendingScore(b) - trendingScore(a));
            return;
        }

        if (sortFilter === "price_low") {
            designs.sort((a, b) => numericPrice(a) - numericPrice(b));
            return;
        }

        if (sortFilter === "price_high") {
            designs.sort((a, b) => numericPrice(b) - numericPrice(a));
            return;
        }

        if (sortFilter === "az") {
            designs.sort((a, b) => designTitle(a).localeCompare(designTitle(b)));
            return;
        }

        if (sortFilter === "za") {
            designs.sort((a, b) => designTitle(b).localeCompare(designTitle(a)));
            return;
        }

        designs.sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));
    }

    function trendingScore(design) {
        const downloads = Number(design.downloads || 0);
        const views = Number(design.views || 0);
        const createdAt = getCreatedAtMs(design);
        const ageDays = Math.max(1, Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000)));
        const freshnessBoost = Math.max(0, 30 - ageDays) / 30;
        return downloads * 3 + views + freshnessBoost * 10;
    }

    function popularScore(design) {
        const downloads = Number(design.downloads || 0);
        const views = Number(design.views || 0);
        const createdAt = getCreatedAtMs(design);
        const ageDays = Math.max(1, Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000)));
        const recencyBoost = Math.max(0, 45 - ageDays) / 45;
        const wishlistBoost = Number(design.wishlist_count || design.wishlisted_count || design.saved_count || 0) || 0;

        return downloads * 4 + views * 1.5 + wishlistBoost * 6 + recencyBoost * 8;
    }

    function getPopularDesigns(designs) {
        return [...(Array.isArray(designs) ? designs : [])]
            .sort((a, b) => popularScore(b) - popularScore(a));
    }

    function numericPrice(design) {
        const price = Number(design.price || 0);
        return Number.isFinite(price) && price > 0 ? price : 0;
    }

    function designTitle(design) {
        return String(design.title || design.name || "").toLowerCase();
    }

    function getCreatedAtMs(design) {
        const createdAt = design && (design.createdAt || design.created_at);
        const asDate = new Date(createdAt || 0);
        const millis = asDate.getTime();
        return Number.isFinite(millis) ? millis : 0;
    }

    function detectAiGenerated(design) {
        if (design.aiGenerated === true || design.ai === true || design.isAiGenerated === true) {
            return true;
        }

        const textBlob = [
            design.title,
            design.name,
            design.description,
            Array.isArray(design.tags) ? design.tags.join(" ") : ""
        ].join(" ").toLowerCase();

        return /\bai\b|\bai-generated\b|\bgenerated\b/.test(textBlob);
    }

    function detectOrientation(design) {
        const direct = String(design.orientation || design.layout || "").trim().toLowerCase();
        if (direct) {
            return normalizeOrientation(direct);
        }

        const textBlob = [
            design.title,
            design.name,
            design.description,
            Array.isArray(design.tags) ? design.tags.join(" ") : ""
        ].join(" ").toLowerCase();

        if (/\bpanoramic\b/.test(textBlob)) return "panoramic";
        if (/\bhorizontal\b/.test(textBlob)) return "horizontal";
        if (/\bvertical\b/.test(textBlob)) return "vertical";
        if (/\blandscape\b/.test(textBlob)) return "landscape";
        if (/\bportrait\b/.test(textBlob)) return "portrait";
        if (/\bsquare\b/.test(textBlob)) return "square";
        return "";
    }

    function normalizeOrientation(value) {
        const map = {
            horizontal: "horizontal",
            vertical: "vertical",
            landscape: "landscape",
            portrait: "portrait",
            square: "square",
            panoramic: "panoramic"
        };

        return map[value] || "";
    }

    function detectColor(design) {
        const direct = String(design.color || "").trim().toLowerCase();
        if (direct) return direct;

        const palette = Array.isArray(design.colors)
            ? design.colors.join(" ")
            : String(design.colorPalette || "");

        const textBlob = [
            design.title,
            design.name,
            design.description,
            Array.isArray(design.tags) ? design.tags.join(" ") : "",
            palette
        ].join(" ").toLowerCase();

        const knownColors = ["red", "blue", "green", "black", "yellow", "orange", "purple", "white"];
        return knownColors.find((color) => textBlob.includes(color)) || "";
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
        ).trim().toUpperCase();

        if (raw) {
            return raw;
        }

        const title = String(design && (design.title || design.name || "")).toLowerCase();
        if (/\bpsd\b/.test(title)) return "PSD";
        if (/\bcdr\b/.test(title)) return "CDR";
        if (/\bai\b/.test(title)) return "AI";
        if (/\bpng\b/.test(title)) return "PNG";
        if (/\bjpg\b|\bjpeg\b/.test(title)) return "JPG";
        if (/\bpdf\b/.test(title)) return "PDF";
        if (/\bsvg\b/.test(title)) return "SVG";
        if (/\beps\b/.test(title)) return "EPS";
        return "";
    }

    function isPremiumDesign(design) {
        const price = Number(design && design.price || 0);
        if (design && design.is_premium === true) {
            return true;
        }

        if (design && design.is_paid === true) {
            return price > 0;
        }

        return price > 0;
    }

    function buildEmptyState(message) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = message;
        return empty;
    }

    function showHomepageError() {
        trendingGrid.replaceChildren(buildEmptyState("Could not load designs right now."));
        if (metaElement) {
            metaElement.textContent = "";
        }
        if (loadMoreButton) {
            loadMoreButton.hidden = true;
        }
        if (paginationContainer) {
            paginationContainer.innerHTML = "";
        }
    }

    function buildProductUrl(design) {
        if (typeof window.AjArtivoBuildProductUrl === "function") {
            return window.AjArtivoBuildProductUrl(design);
        }

        const slug = getDesignSlug(design);

        if (slug) {
            const productPath = `/product/${encodeURIComponent(slug)}`;
            return resolveUrl(productPath);
        }

        return resolveUrl("/product");
    }

    function getDesignSlug(design) {
        const item = design || {};
        const explicitSlug = cleanText(item.slug);
        if (explicitSlug) {
            return slugify(explicitSlug);
        }

        const titleSource = cleanText(item.title || item.name || item.product_name || item.category || item.type || item.format || item.fileType);
        return slugify(titleSource || "ajartivo-product");
    }

    function slugify(value, uniqueKey) {
        const base = String(value || "")
            .toLowerCase()
            .replace(/['"]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "ajartivo-product";
        const suffix = uniqueKey ? `-${hashText(uniqueKey).slice(0, 8)}` : "";
        return `${base}${suffix}`;
    }

    function hashText(value) {
        let hash = 2166136261;
        const text = String(value || "");
        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }

        return (hash >>> 0).toString(16).padStart(8, "0");
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
            label: isPremiumDesign(design) ? "PREMIUM" : "FREE",
            className: isPremiumDesign(design) ? "premium" : "free",
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

    function cleanText(value) {
        return String(value || "").trim();
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
