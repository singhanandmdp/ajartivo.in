document.addEventListener("DOMContentLoaded", () => {
    loadHeader();
    loadFooter();
    loadSidebar();
    initSearch();
    initSearchResults();
    initQuickCategoryNavigation();
    initHeroSlider();

    if ("requestIdleCallback" in window) {
        window.requestIdleCallback(() => initHeroSearchEnhancements(), { timeout: 1200 });
    } else {
        window.setTimeout(initHeroSearchEnhancements, 700);
    }
});

function cleanText(value) {
    if (typeof window.AjArtivoCleanText === "function") {
        return window.AjArtivoCleanText(value);
    }

    return String(value || "").trim();
}

function getSiteBasePath() {
    const scriptElement = document.querySelector('script[src*="js/script.js"]');
    const scriptSrc = scriptElement ? scriptElement.getAttribute("src") || "" : "";

    if (scriptSrc) {
        const resolvedScriptUrl = new URL(scriptSrc, window.location.href);
        return resolvedScriptUrl.pathname.replace(/\/js\/script\.js$/i, "");
    }

    const path = window.location.pathname;
    const pagesIndex = path.indexOf("/pages/");
    if (pagesIndex >= 0) {
        return path.slice(0, pagesIndex);
    }

    const lastSlashIndex = path.lastIndexOf("/");
    return lastSlashIndex > 0 ? path.slice(0, lastSlashIndex) : "";
}

function resolveSiteUrl(path) {
    if (!path) return window.location.href;
    if (/^(?:[a-z]+:)?\/\//i.test(path)) return path;

    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const basePath = getSiteBasePath();
    return `${basePath}${normalizedPath}`;
}

window.AjArtivoResolveUrl = resolveSiteUrl;

function rewriteRootRelativeUrls(container) {
    if (!container) return;

    container.querySelectorAll("[href], [src]").forEach((element) => {
        ["href", "src"].forEach((attributeName) => {
            const value = element.getAttribute(attributeName);
            if (!value || !value.startsWith("/")) return;

            element.setAttribute(attributeName, resolveSiteUrl(value));
        });
    });
}

function normalizeAppAnchorHref(value) {
    if (!value || !value.startsWith("/")) return value;

    const guardedPrefixes = [
        "/product.html",
        "/login.html",
        "/signup.html",
        "/dashboard.html",
        "/pages/",
        "/about/",
        "/tools/",
        "/terms.html",
        "/privacy.html",
        "/icons/",
        "/images/",
        "/css/",
        "/js/",
        "/payment.js"
    ];

    const shouldRewrite = guardedPrefixes.some((prefix) => value === prefix || value.startsWith(`${prefix}?`) || value.startsWith(`${prefix}#`) || value.startsWith(`${prefix}/`));
    return shouldRewrite ? resolveSiteUrl(value) : value;
}

function rewriteDocumentAppLinks() {
    document.querySelectorAll("a[href], img[src], link[href], script[src]").forEach((element) => {
        if (element.hasAttribute("href")) {
            const href = element.getAttribute("href");
            const rewrittenHref = normalizeAppAnchorHref(href);
            if (rewrittenHref && rewrittenHref !== href) {
                element.setAttribute("href", rewrittenHref);
            }
        }

        if (element.hasAttribute("src")) {
            const src = element.getAttribute("src");
            const rewrittenSrc = normalizeAppAnchorHref(src);
            if (rewrittenSrc && rewrittenSrc !== src) {
                element.setAttribute("src", rewrittenSrc);
            }
        }
    });
}

document.addEventListener("click", (event) => {
    const anchor = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    const rewrittenHref = normalizeAppAnchorHref(href);
    if (!rewrittenHref || rewrittenHref === href) return;

    event.preventDefault();
    anchor.setAttribute("href", rewrittenHref);
    window.location.href = rewrittenHref;
}, true);

rewriteDocumentAppLinks();

window.addEventListener("ajartivo:session-changed", () => {
    initAuthUI();
});

window.addEventListener("ajartivo:account-updated", () => {
    initAuthUI();
});

function initQuickCategoryNavigation() {
    const cards = document.querySelectorAll(".quick-category-grid .category-card[data-category]");
    if (!cards.length) return;

    cards.forEach((card) => {
        if (card.dataset.navReady === "true") return;

        const category = String(card.dataset.category || "").trim().toUpperCase();
        if (!category) return;

        const goToCategory = () => {
            window.location.href = resolveSiteUrl(`/pages/search.html?category=${encodeURIComponent(category)}`);
        };

        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");

        card.addEventListener("click", goToCategory);
        card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                goToCategory();
            }
        });

        card.dataset.navReady = "true";
    });
}

function ensureStylesheet(href) {
    const resolvedHref = resolveSiteUrl(href);
    const absoluteHref = new URL(resolvedHref, window.location.origin).href;
    const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .some((link) => link.href === absoluteHref);

    if (existing) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = resolvedHref;
    document.head.appendChild(link);
}

function loadHeader() {
    const container = document.getElementById("site-header");
    if (!container) return;

    fetch(resolveSiteUrl("/pages/header.html"))
        .then((res) => res.text())
        .then((data) => {
            container.innerHTML = data;
            rewriteRootRelativeUrls(container);
            initSearch();
            initMobileHeaderSearch();
            initHeaderVoiceSearch();
            initSidebarMenu();
            initProfileDropdown();
            initAuthUI();
        })
        .catch((err) => console.log("Header load error:", err));
}

function loadFooter() {
    const container = document.getElementById("site-footer");
    if (!container) return;

    ensureStylesheet("/css/style.css");

    fetch(resolveSiteUrl("/pages/footer.html"))
        .then((res) => res.text())
        .then((data) => {
            container.innerHTML = data;
            rewriteRootRelativeUrls(container);
        })
        .catch((err) => console.log("Footer load error:", err));
}

function loadSidebar() {
    const sidebar = document.getElementById("sidebarMenu");
    if (!sidebar) return;

    ensureStylesheet("/css/sidebar.css");

    fetch(resolveSiteUrl("/pages/sidebar.html"))
        .then((res) => res.text())
        .then((data) => {
            sidebar.innerHTML = data;
            rewriteRootRelativeUrls(sidebar);
            initSidebarMenu();
            if ("requestIdleCallback" in window) {
                window.requestIdleCallback(() => updateSidebarDesignCounts(), { timeout: 1500 });
            } else {
                window.setTimeout(updateSidebarDesignCounts, 900);
            }
        })
        .catch((err) => console.log("Sidebar load error:", err));
}

async function updateSidebarDesignCounts() {
    const psdCount = document.getElementById("psdCount");
    const cdrCount = document.getElementById("cdrCount");
    const aiCount = document.getElementById("aiCount");
    if (!psdCount || !cdrCount || !aiCount) return;

    const services = window.AjArtivoSupabase;
    if (!services) return;

    try {
        const designs = await services.fetchDesigns();
        const counts = { psd: 0, cdr: 0, ai: 0 };

        designs.forEach((design) => {
            const rawType = String(design.category || design.type || "").trim().toUpperCase();

            if (rawType === "PSD") {
                counts.psd += 1;
                return;
            }

            if (rawType === "CDR") {
                counts.cdr += 1;
                return;
            }

            if (rawType === "AI" || rawType === "ILLUSTRATOR") {
                counts.ai += 1;
            }
        });

        psdCount.textContent = String(counts.psd);
        cdrCount.textContent = String(counts.cdr);
        aiCount.textContent = String(counts.ai);
    } catch (error) {
        console.error("Sidebar counts load error:", error);
    }
}

function searchDesign(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const query = input.value.trim();
    if (!query) return;

    window.location.href = resolveSiteUrl("/pages/search.html?q=" + encodeURIComponent(query));
}

function quickSearch(query) {
    if (!query) return;
    window.location.href = resolveSiteUrl("/pages/search.html?q=" + encodeURIComponent(query));
}

function initSearch() {
    ["heroSearchInput", "headerSearchInput", "mobileHeaderSearchInput"].forEach((inputId) => {
        const input = document.getElementById(inputId);
        if (!input || input.dataset.searchReady === "true") return;

        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                searchDesign(inputId);
            }
        });

        input.dataset.searchReady = "true";
    });
}

function initMobileHeaderSearch() {
    const header = document.querySelector(".header");
    const toggleBtn = document.getElementById("mobileSearchToggle");
    const searchWrap = document.getElementById("mobileHeaderSearch");
    const searchInput = document.getElementById("mobileHeaderSearchInput");
    if (!header || !toggleBtn || !searchWrap || !searchInput) return;
    if (toggleBtn.dataset.mobileSearchReady === "true") return;

    toggleBtn.addEventListener("click", function () {
        const isOpen = header.classList.toggle("mobile-search-open");
        if (isOpen) {
            searchInput.focus();
        } else {
            searchInput.blur();
        }
    });

    document.addEventListener("click", function (event) {
        if (!header.contains(event.target)) {
            header.classList.remove("mobile-search-open");
        }
    });

    toggleBtn.dataset.mobileSearchReady = "true";
}

function initHeaderVoiceSearch() {
    const micButton = document.getElementById("headerMicBtn");
    const input = document.getElementById("headerSearchInput");

    if (!micButton || !input || micButton.dataset.voiceReady === "true") return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        micButton.hidden = true;
        micButton.dataset.voiceReady = "true";
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.addEventListener("start", () => {
        micButton.classList.add("is-listening");
    });

    recognition.addEventListener("end", () => {
        micButton.classList.remove("is-listening");
    });

    recognition.addEventListener("result", (event) => {
        const transcript = event.results[0] && event.results[0][0] ? event.results[0][0].transcript : "";
        if (!transcript) return;

        input.value = transcript.trim();
        input.focus();
    });

    micButton.addEventListener("click", () => {
        recognition.start();
    });

    micButton.dataset.voiceReady = "true";
}

function initSearchResults() {
    const container = document.getElementById("results");
    const title = document.getElementById("searchTitle");
    const resultMeta = document.getElementById("searchResultMeta");
    const activeFilterRow = document.getElementById("activeFilterRow");
    const paginationTop = document.getElementById("searchPagination");
    const paginationBottom = document.getElementById("searchPaginationBottom");
    if (!container || !title) return;

    const services = window.AjArtivoSupabase;
    if (!services) return;

    const params = new URLSearchParams(window.location.search);
    const rawQuery = (params.get("q") || "").trim();
    const query = rawQuery.toLowerCase();
    const category = (params.get("category") || "").trim().toUpperCase();
    const priceFilter = (params.get("price") || "").trim().toLowerCase();
    const sortFilter = (params.get("sort") || "latest").trim().toLowerCase();
    const aiFilter = (params.get("ai") || "").trim().toLowerCase();
    const orientationFilter = (params.get("orientation") || "").trim().toLowerCase();
    const colorFilter = (params.get("color") || "").trim().toLowerCase();
    const page = Math.max(1, Number(params.get("page") || 1));
    const pageSize = 18;

    bindSearchFilterControls({
        category: category,
        price: priceFilter,
        sort: sortFilter,
        ai: aiFilter,
        orientation: orientationFilter,
        color: colorFilter
    });

    const titleParts = [];
    if (category) titleParts.push(`${category} Designs`);
    if (priceFilter === "free") titleParts.push("Free Resources");
    if (priceFilter === "premium") titleParts.push("Premium Resources");
    if (sortFilter === "trending") titleParts.push("Trending Designs");
    if (sortFilter === "downloads") titleParts.push("Most Downloaded");
    if (sortFilter === "views") titleParts.push("Most Viewed");
    if (sortFilter === "price_low") titleParts.push("Price: Low to High");
    if (sortFilter === "price_high") titleParts.push("Price: High to Low");
    if (rawQuery) titleParts.push(`Search: "${rawQuery}"`);

    title.innerText = titleParts.length ? titleParts.join(" | ") : "All Designs";
    renderAppliedFilterChips(activeFilterRow, {
        category,
        priceFilter,
        sortFilter,
        aiFilter,
        orientationFilter,
        colorFilter
    });
    container.innerHTML = '<div class="empty-state">Loading designs...</div>';

    services.fetchDesigns()
        .then((designsResult) => {
            let designs = Array.isArray(designsResult) ? [...designsResult] : [];

            if (category) {
                designs = designs.filter((design) => {
                    const type = normalizeDesignFormat(design);
                    return type === category;
                });
            }

            if (priceFilter === "free") {
                designs = designs.filter((design) => {
                    const value = Number(design.price || 0);
                    return !Number.isFinite(value) || value <= 0;
                });
            }

            if (priceFilter === "premium") {
                designs = designs.filter((design) => isPremiumDesign(design));
            }

            if (query) {
                designs = designs.filter((design) => {
                    const textBlob = [
                        design.title,
                        design.name,
                        design.description,
                        Array.isArray(design.tags) ? design.tags.join(" ") : "",
                        normalizeDesignFormat(design),
                        design.color,
                        design.orientation
                    ].join(" ").toLowerCase();

                    return textBlob.includes(query);
                });
            }

            if (aiFilter) {
                designs = designs.filter((design) => {
                    const aiGenerated = detectAiGenerated(design);
                    return aiFilter === "yes" ? aiGenerated : !aiGenerated;
                });
            }

            if (orientationFilter) {
                designs = designs.filter((design) => {
                    const orientation = detectOrientation(design);
                    return orientation === orientationFilter;
                });
            }

            if (colorFilter) {
                designs = designs.filter((design) => {
                    const color = detectColor(design);
                    return color === colorFilter;
                });
            }

            sortDesigns(designs, sortFilter);

            const total = designs.length;
            const pageCount = Math.max(1, Math.ceil(total / pageSize));
            const currentPage = Math.min(page, pageCount);
            const start = (currentPage - 1) * pageSize;
            const pagedDesigns = designs.slice(start, start + pageSize);

            if (resultMeta) {
                resultMeta.textContent = total
                    ? `Showing ${start + 1}-${Math.min(start + pageSize, total)} of ${total} designs`
                    : "No matching designs";
            }

            renderSearchDesignCards(container, pagedDesigns);
            renderSearchPagination(pageCount, currentPage, paginationTop);
            renderSearchPagination(pageCount, currentPage, paginationBottom);
        })
        .catch((error) => {
            console.error("Search results load error:", error);
            container.innerHTML = '<div class="empty-state">Could not load designs right now.</div>';
            if (resultMeta) {
                resultMeta.textContent = "";
            }
        });
}

function renderSearchDesignCards(container, designs) {
    if (!designs.length) {
        container.innerHTML = '<div class="empty-state">No matching designs found.</div>';
        return;
    }

    container.innerHTML = designs.map((design) => {
        const title = escapeText(design.title || design.name || "Untitled Design");
        const badge = getDesignBadge(design);
        const image = escapeText(design.image || "/images/trending1.jpg");
        const productUrl = resolveSiteUrl(`/product.html?id=${encodeURIComponent(design.id)}`);

        return `
            <article class="design-card homepage-design-card">
                <a href="${productUrl}" class="card-link homepage-card-link">
                    <div class="homepage-card-media">
                        <img src="${image}" alt="${title}" class="homepage-card-image" loading="lazy" decoding="async">
                        <span class="homepage-type-chip file-type ${badge.className}"${badge.styleAttr}>${badge.label}</span>
                    </div>
                </a>
            </article>
        `;
    }).join("");
}

function bindSearchFilterControls(state) {
    const fileTypeFilter = document.getElementById("fileTypeFilter");
    const licenseFilter = document.getElementById("licenseFilter");
    const sortFilter = document.getElementById("sortFilter");
    const aiFilter = document.getElementById("aiFilter");
    const orientationFilter = document.getElementById("orientationFilter");
    const colorFilter = document.getElementById("colorFilter");
    const clearFiltersBtn = document.getElementById("clearFiltersBtn");

    const controls = [fileTypeFilter, licenseFilter, sortFilter, aiFilter, orientationFilter, colorFilter];
    if (!controls.some(Boolean)) return;

    if (fileTypeFilter) fileTypeFilter.value = state.category || "";
    if (licenseFilter) licenseFilter.value = state.price || "";
    if (sortFilter) sortFilter.value = state.sort || "latest";
    if (aiFilter) aiFilter.value = state.ai || "";
    if (orientationFilter) orientationFilter.value = state.orientation || "";
    if (colorFilter) colorFilter.value = state.color || "";

    controls.forEach((control) => {
        if (!control || control.dataset.bound === "true") return;
        control.addEventListener("change", applySearchFilterSelection);
        control.dataset.bound = "true";
    });

    if (clearFiltersBtn && clearFiltersBtn.dataset.bound !== "true") {
        clearFiltersBtn.addEventListener("click", () => {
            const params = new URLSearchParams(window.location.search);
            ["category", "price", "sort", "ai", "orientation", "color", "page"].forEach((key) => params.delete(key));
            window.location.href = resolveSiteUrl("/pages/search.html" + (params.toString() ? `?${params.toString()}` : ""));
        });
        clearFiltersBtn.dataset.bound = "true";
    }
}

function applySearchFilterSelection() {
    const params = new URLSearchParams(window.location.search);

    const setParam = (key, value) => {
        if (value) {
            params.set(key, value);
        } else {
            params.delete(key);
        }
    };

    const fileTypeFilter = document.getElementById("fileTypeFilter");
    const licenseFilter = document.getElementById("licenseFilter");
    const sortFilter = document.getElementById("sortFilter");
    const aiFilter = document.getElementById("aiFilter");
    const orientationFilter = document.getElementById("orientationFilter");
    const colorFilter = document.getElementById("colorFilter");

    setParam("category", fileTypeFilter ? fileTypeFilter.value : "");
    setParam("price", licenseFilter ? licenseFilter.value : "");
    setParam("sort", sortFilter ? sortFilter.value : "");
    setParam("ai", aiFilter ? aiFilter.value : "");
    setParam("orientation", orientationFilter ? orientationFilter.value : "");
    setParam("color", colorFilter ? colorFilter.value : "");
    params.delete("page");

    window.location.href = resolveSiteUrl("/pages/search.html?" + params.toString());
}

function renderSearchPagination(pageCount, currentPage, container) {
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
        button.addEventListener("click", () => {
            if (button.disabled) return;
            const nextPage = Number(button.dataset.page || 1);
            const params = new URLSearchParams(window.location.search);
            params.set("page", String(nextPage));
            window.location.href = resolveSiteUrl("/pages/search.html?" + params.toString());
        });
    });
}

function renderPageButton(label, page, disabled, active) {
    const activeClass = active ? " active" : "";
    const disabledAttr = disabled ? " disabled" : "";
    return `<button type="button" data-page="${page}" class="${activeClass.trim()}"${disabledAttr}>${label}</button>`;
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

function renderAppliedFilterChips(container, state) {
    if (!container) return;

    const chips = [];
    if (state.category) chips.push(`Type: ${state.category}`);
    if (state.priceFilter) chips.push(`License: ${state.priceFilter}`);
    if (state.aiFilter) chips.push(`AI: ${state.aiFilter}`);
    if (state.orientationFilter) chips.push(`Orientation: ${state.orientationFilter}`);
    if (state.colorFilter) chips.push(`Color: ${state.colorFilter}`);
    if (state.sortFilter && state.sortFilter !== "latest") chips.push(`Sort: ${state.sortFilter.replace("_", " ")}`);

    container.innerHTML = chips.map((chip) => `<span class="active-filter-chip">${escapeText(chip)}</span>`).join("");
}

function isPremiumDesign(design) {
    if (window.AjArtivoPayment && typeof window.AjArtivoPayment.isPremiumDesign === "function") {
        return window.AjArtivoPayment.isPremiumDesign(design);
    }

    return Boolean(design && design.is_premium === true);
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
        return { label: escapeText(format), className: knownClass, styleAttr: "" };
    }

    if (format) {
        const color = colorFromText(format);
        return {
            label: escapeText(format),
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

function escapeText(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function initHeroSearchEnhancements() {
    const heroInput = document.getElementById("heroSearchInput");
    const heroSearch = heroInput ? heroInput.closest(".hero-search") : null;
    const heroSearchWrap = heroInput ? heroInput.closest(".hero-search-wrap") : null;
    const hero = document.getElementById("heroHome");
    const heroSearchPanel = document.getElementById("heroSearchPanel");
    const heroSearchPanelClose = document.getElementById("heroSearchPanelClose");
    if (!heroInput || !heroSearch) return;

    if (heroInput.dataset.heroEnhanced === "true") return;

    heroInput.setAttribute("placeholder", "Search for banners, cards, logos...");

    heroInput.addEventListener("focus", () => {
        heroSearch.classList.add("is-focused");
        if (heroSearchWrap) {
            heroSearchWrap.classList.add("panel-open");
        }
        if (hero) {
            hero.classList.add("has-search-panel");
        }
    });

    heroInput.addEventListener("blur", () => {
        heroSearch.classList.remove("is-focused");
        window.setTimeout(() => {
            const activeInsideWrap = heroSearchWrap && heroSearchWrap.contains(document.activeElement);
            if (activeInsideWrap) return;

            if (heroSearchWrap) {
                heroSearchWrap.classList.remove("panel-open");
            }
            if (hero) {
                hero.classList.remove("has-search-panel");
            }
        }, 120);
    });

    if (heroSearchPanel) {
        heroSearchPanel.addEventListener("mousedown", (event) => {
            event.preventDefault();
        });

        heroSearchPanel.querySelectorAll("button").forEach((button) => {
            button.addEventListener("click", () => {
                if (button.classList.contains("hero-search-panel-close")) {
                    closeHeroSearchPanel();
                    heroInput.blur();
                    return;
                }

                const value = button.textContent.trim();
                if (value && !button.classList.contains("hero-search-clear")) {
                    heroInput.value = value;
                }

                if (button.classList.contains("hero-search-chip")) {
                    heroInput.focus();
                } else {
                    closeHeroSearchPanel();
                }
            });
        });
    }

    if (heroSearchPanelClose) {
        heroSearchPanelClose.addEventListener("click", () => {
            closeHeroSearchPanel();
        });
    }

    document.addEventListener("click", (event) => {
        if (!heroSearchWrap || !heroSearchWrap.contains(event.target)) {
            closeHeroSearchPanel();
        }
    });

    function closeHeroSearchPanel() {
        if (heroSearchWrap) {
            heroSearchWrap.classList.remove("panel-open");
        }
        if (hero) {
            hero.classList.remove("has-search-panel");
        }
    }

    heroInput.dataset.heroEnhanced = "true";
}

async function initHeroSlider() {
    const hero = document.getElementById("heroHome");
    if (!hero) return;

    const slider = document.getElementById("heroSlider");
    const dotsContainer = document.getElementById("heroDots");
    const progressBar = document.getElementById("heroProgressBar");

    if (!slider || !dotsContainer || !progressBar) return;

    const imagePaths = await loadHeroImages();

    slider.innerHTML = imagePaths
        .map((imagePath, index) => `
            <div class="hero-slide${index === 0 ? " is-active" : ""}" data-bg="${imagePath}"${index === 0 ? ` style="background-image: url('${imagePath}');"` : ""}></div>
        `)
        .join("");

    const slides = Array.from(slider.querySelectorAll(".hero-slide"));
    if (!slides.length) return;

    const autoplayDelay = 9000;
    let activeIndex = slides.findIndex((slide) => slide.classList.contains("is-active"));
    let intervalId = null;
    const preloadedSlides = new Set([0]);
    let preloadCursor = 1;
    let preloadTimerId = null;

    if (activeIndex < 0) {
        activeIndex = 0;
        slides[0].classList.add("is-active");
    }

    dotsContainer.innerHTML = "";

    slides.forEach((_, index) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "hero-dot";
        dot.setAttribute("aria-label", `Go to hero slide ${index + 1}`);

        dot.addEventListener("click", () => {
            setActiveSlide(index);
            restartAutoplay();
        });

        dotsContainer.appendChild(dot);
    });

    function updateProgress() {
        progressBar.style.animation = "none";
        void progressBar.offsetWidth;
        progressBar.style.animation = `heroProgressFill ${autoplayDelay}ms linear forwards`;
    }

    function ensureSlideImage(index) {
        const slide = slides[index];
        if (!slide || preloadedSlides.has(index)) return;

        const imagePath = slide.dataset.bg;
        if (!imagePath) return;

        slide.style.backgroundImage = `url('${imagePath}')`;
        preloadedSlides.add(index);
    }

    function preloadNextSlide() {
        if (preloadCursor >= slides.length) return;

        const currentIndex = preloadCursor;
        const slide = slides[currentIndex];
        preloadCursor += 1;

        if (!slide || preloadedSlides.has(currentIndex)) {
            preloadNextSlide();
            return;
        }

        const imagePath = slide.dataset.bg;
        if (!imagePath) {
            preloadNextSlide();
            return;
        }

        const image = new Image();
        image.src = imagePath;
        image.onload = () => {
            slide.style.backgroundImage = `url('${imagePath}')`;
            preloadedSlides.add(currentIndex);
        };
    }

    function queueNextPreload(delay) {
        if (preloadTimerId) {
            window.clearTimeout(preloadTimerId);
        }

        preloadTimerId = window.setTimeout(() => {
            preloadNextSlide();
            if (preloadCursor < slides.length) {
                queueNextPreload(autoplayDelay);
            }
        }, delay);
    }

    function setActiveSlide(nextIndex) {
        ensureSlideImage(nextIndex);

        slides.forEach((slide, index) => {
            slide.classList.toggle("is-active", index === nextIndex);
        });

        Array.from(dotsContainer.children).forEach((dot, index) => {
            dot.classList.toggle("is-active", index === nextIndex);
        });

        activeIndex = nextIndex;
        updateProgress();
    }

    function goToNextSlide() {
        const nextIndex = (activeIndex + 1) % slides.length;
        setActiveSlide(nextIndex);
    }

    function startAutoplay() {
        if (intervalId) return;
        intervalId = window.setInterval(goToNextSlide, autoplayDelay);
    }

    function stopAutoplay() {
        if (!intervalId) return;
        window.clearInterval(intervalId);
        intervalId = null;
    }

    function restartAutoplay() {
        stopAutoplay();
        startAutoplay();
    }

    hero.addEventListener("mouseenter", stopAutoplay);
    hero.addEventListener("mouseleave", startAutoplay);

    setActiveSlide(activeIndex);
    startAutoplay();
    queueNextPreload(1800);
}

async function loadHeroImages() {
    const fallbackImages = ["images/Hero/hero-bg.jpg"];

    try {
        const response = await fetch("images/Hero/manifest.json", { cache: "no-store" });
        if (!response.ok) return fallbackImages;

        const manifest = await response.json();
        if (!Array.isArray(manifest) || !manifest.length) return fallbackImages;

        return manifest.map((imagePath) => String(imagePath || "").replace(/^\/+/, "")).filter(Boolean);
    } catch (error) {
        console.log("Hero manifest load error:", error);
        return fallbackImages;
    }
}

function initSidebarMenu() {
    const menuBtn = document.getElementById("menu-btn");
    const sidebar = document.getElementById("sidebarMenu");
    const overlay = document.getElementById("menuOverlay");
    const closeBtn = document.getElementById("sidebarClose");

    if (menuBtn && sidebar && menuBtn.dataset.menuReady !== "true") {
        menuBtn.addEventListener("click", () => {
            sidebar.classList.add("active");
            if (overlay) overlay.classList.add("active");
            document.body.classList.add("sidebar-open");
        });
        menuBtn.dataset.menuReady = "true";
    }

    if (overlay && sidebar && overlay.dataset.menuReady !== "true") {
        overlay.addEventListener("click", () => {
            sidebar.classList.remove("active");
            overlay.classList.remove("active");
            document.body.classList.remove("sidebar-open");
        });
        overlay.dataset.menuReady = "true";
    }

    if (closeBtn && sidebar && closeBtn.dataset.menuReady !== "true") {
        closeBtn.addEventListener("click", () => {
            sidebar.classList.remove("active");
            if (overlay) overlay.classList.remove("active");
            document.body.classList.remove("sidebar-open");
        });
        closeBtn.dataset.menuReady = "true";
    }
}

function initAuthUI() {
    const services = window.AjArtivoSupabase;
    const user = services && typeof services.getSession === "function" ? services.getSession() : null;
    const guestMenu = document.getElementById("guestMenu");
    const userMenu = document.getElementById("userMenu");
    const userName = document.getElementById("userName");
    const headerPlanBadge = document.getElementById("headerPlanBadge");
    const memberBox = document.getElementById("memberAccess");
    const headerAvatar = document.getElementById("headerAvatar");
    const profileCardAvatar = document.getElementById("profileCardAvatar");
    const profileFullName = document.getElementById("profileFullName");
    const profileUserId = document.getElementById("profileUserId");
    const profileInitial = document.getElementById("profileInitial");
    const profileVerifiedText = document.getElementById("profileVerifiedText");
    const profilePlanBadge = document.getElementById("profilePlanBadge");
    const profileExpiryText = document.getElementById("profileExpiryText");
    const profileFreeCounter = document.getElementById("profileFreeCounter");
    const profileFreeStatMeta = document.getElementById("profileFreeStatMeta");
    const profileDownloadStatLabel = document.getElementById("profileDownloadStatLabel");
    const profileWeeklyCounter = document.getElementById("profileWeeklyCounter");
    const profileDownloadStatMeta = document.getElementById("profileDownloadStatMeta");
    const profileUpgradeCtaText = document.getElementById("profileUpgradeCtaText");

    if (user) {
        const displayName = user.fullName || user.name || user.email || "User";
        const firstName = user.firstName || displayName.trim().split(/\s+/)[0] || "User";
        const firstLetter = firstName.charAt(0).toUpperCase() || "U";
        const shortId = (user.id || "AJ000001").slice(0, 8).toUpperCase();
        const avatarUrl = cleanText(
            user.avatarUrl ||
            user.avatar_url ||
            user.profileAvatar ||
            user.profile_avatar
        );
        const avatarDataUrl = avatarUrl || createLetterAvatar(firstLetter);
        const applyAvatar = function (node) {
            if (!node) return;
            node.src = avatarDataUrl;
            node.onerror = function () {
                node.onerror = null;
                node.src = createLetterAvatar(firstLetter);
            };
        };
        const premiumActive = user.premiumActive === true;
        const planName = cleanText(user.planName) || (premiumActive ? "Premium" : "Free");
        const premiumLabel = premiumActive ? `${planName} Active` : "Free Member";
        const freeRemaining = Number(user.downloadsRemainingMonth || user.freeDownloadRemaining || 0);
        const weeklyRemaining = Number(user.aiRemainingToday || user.weeklyPremiumRemaining || 0);
        const downloadStats = getProfileDownloadStats(services);
        const premiumExpiry = user.premiumExpiry
            ? new Date(user.premiumExpiry).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric"
            })
            : "";
        const expiryLabel = premiumActive && premiumExpiry
            ? `Active until ${premiumExpiry}`
            : "Upgrade to unlock premium benefits";

        if (guestMenu && userMenu) {
            guestMenu.style.display = "none";
            userMenu.style.display = "block";
        }

        if (userName) {
            userName.textContent = firstName;
        }

        if (headerPlanBadge) {
            headerPlanBadge.textContent = premiumLabel;
        }

        applyAvatar(headerAvatar);

        applyAvatar(profileCardAvatar);

        if (profileFullName) {
            profileFullName.textContent = firstName;
        }

        if (profileUserId) {
            profileUserId.textContent = user.email || `ID: ${shortId}`;
        }

        if (profileInitial) {
            profileInitial.textContent = firstLetter;
            profileInitial.style.display = avatarUrl ? "none" : "inline-flex";
        }

        if (profileVerifiedText) {
            profileVerifiedText.textContent = "Verified Account";
        }

        if (profilePlanBadge) {
            profilePlanBadge.textContent = premiumLabel;
        }

        if (profileExpiryText) {
            profileExpiryText.textContent = expiryLabel;
        }

        if (profileFreeCounter) {
            profileFreeCounter.textContent = freeRemaining < 0 ? "Open" : String(freeRemaining);
        }

        if (profileFreeStatMeta) {
            profileFreeStatMeta.textContent = premiumActive
                ? (Number(user.monthlyDownloadLimit || 0) < 0 ? "Unlimited premium downloads" : `${Number(user.downloadsUsedMonth || 0)} used this month`)
                : (freeRemaining < 0 ? "Free download access" : "Free account");
        }

        if (profileDownloadStatLabel) {
            profileDownloadStatLabel.textContent = "Tool usage";
        }

        if (profileWeeklyCounter) {
            profileWeeklyCounter.textContent = weeklyRemaining < 0 ? "Open" : String(weeklyRemaining);
        }

        if (profileDownloadStatMeta) {
            profileDownloadStatMeta.textContent = premiumActive
                ? `${downloadStats.total} files downloaded so far`
                : `PNG ${downloadStats.png} • JPG ${downloadStats.jpg} • PSD ${downloadStats.psd}`;
        }

        if (profileUpgradeCtaText) {
            profileUpgradeCtaText.textContent = premiumActive ? "Manage Premium Plan" : "Upgrade to Premium";
        }

        if (memberBox) {
            memberBox.classList.add("logged-in");
            memberBox.innerHTML = `
                <div class="member-account-row">
                    <a href="${resolveSiteUrl("/dashboard.html")}" class="member-user">
                        ${avatarUrl
                            ? `<img class="member-avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(firstName)}">`
                            : `<div class="member-avatar-letter">${firstLetter}</div>`}
                        <div class="member-user-text">
                            <strong>${firstName}</strong>
                            <span>${premiumLabel} • ID: ${shortId}</span>
                        </div>
                    </a>
                    <a href="#" id="sidebarLogout" class="sidebar-logout">Logout</a>
                </div>
            `;
            const sidebarAvatar = memberBox.querySelector(".member-avatar");
            applyAvatar(sidebarAvatar);
        }

        return;
    }

    if (guestMenu && userMenu) {
        guestMenu.style.display = "block";
        userMenu.style.display = "none";
    }

    if (memberBox) {
        memberBox.classList.remove("logged-in");
        memberBox.innerHTML = `
            <div class="member-text">
                <h5>Member Access</h5>
                <p>Login to manage your saved designs.</p>
            </div>
            <a href="${resolveSiteUrl("/login.html")}" class="member-login-btn">
                <img src="${resolveSiteUrl("/icons/login.svg")}" class="icon-svg" alt="Login">
                Login
            </a>
        `;
    }
}

function getProfileDownloadStats(services) {
    const items = services && typeof services.readList === "function"
        ? services.readList("ajartivo_download_history")
        : [];

    return items.reduce(function (stats, item) {
        const rawCategory = String(item && item.category || "").trim().toUpperCase();
        const category = rawCategory === "JPEG" ? "JPG" : rawCategory;

        stats.total += 1;

        if (category === "PNG") {
            stats.png += 1;
        } else if (category === "JPG") {
            stats.jpg += 1;
        } else if (category === "PSD") {
            stats.psd += 1;
        }

        return stats;
    }, {
        total: 0,
        png: 0,
        jpg: 0,
        psd: 0
    });
}

function createLetterAvatar(firstLetter) {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 40;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#6366f1";
    ctx.fillRect(0, 0, 40, 40);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(firstLetter, 20, 20);

    return canvas.toDataURL();
}

function initProfileDropdown() {
    const trigger = document.getElementById("profileTrigger");
    const dropdown = trigger ? trigger.closest(".dropdown") : null;

    if (!trigger || !dropdown || trigger.dataset.dropdownReady === "true") {
        return;
    }

    trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropdown.classList.toggle("open");
    });

    document.addEventListener("click", (event) => {
        if (!dropdown.contains(event.target)) {
            dropdown.classList.remove("open");
        }
    });

    trigger.dataset.dropdownReady = "true";
}
