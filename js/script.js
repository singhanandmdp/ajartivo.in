document.addEventListener("DOMContentLoaded", () => {
    loadHeader();
    loadFooter();
    loadSidebar();
    initSearch();
    initSearchResults();
    initHeroSlider();

    if ("requestIdleCallback" in window) {
        window.requestIdleCallback(() => initHeroSearchEnhancements(), { timeout: 1200 });
    } else {
        window.setTimeout(initHeroSearchEnhancements, 700);
    }
});

function ensureStylesheet(href) {
    const absoluteHref = new URL(href, window.location.origin).href;
    const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .some((link) => link.href === absoluteHref);

    if (existing) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
}

function loadHeader() {
    const container = document.getElementById("site-header");
    if (!container) return;

    fetch("/pages/header.html")
        .then((res) => res.text())
        .then((data) => {
            container.innerHTML = data;
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

    fetch("/pages/footer.html")
        .then((res) => res.text())
        .then((data) => {
            container.innerHTML = data;
        })
        .catch((err) => console.log("Footer load error:", err));
}

function loadSidebar() {
    const sidebar = document.getElementById("sidebarMenu");
    if (!sidebar) return;

    ensureStylesheet("/css/sidebar.css");

    fetch("/pages/sidebar.html")
        .then((res) => res.text())
        .then((data) => {
            sidebar.innerHTML = data;
            initSidebarMenu();
            updateSidebarDesignCounts();
        })
        .catch((err) => console.log("Sidebar load error:", err));
}

async function updateSidebarDesignCounts() {
    const psdCount = document.getElementById("psdCount");
    const cdrCount = document.getElementById("cdrCount");
    const aiCount = document.getElementById("aiCount");
    if (!psdCount || !cdrCount || !aiCount) return;

    const services = window.AjArtivoFirebase;
    if (!services || !services.db) return;

    try {
        const snapshot = await services.db.collection("designs").get();
        const counts = { psd: 0, cdr: 0, ai: 0 };

        snapshot.forEach((doc) => {
            const data = doc.data() || {};
            const rawType = String(data.category || data.type || "").trim().toUpperCase();

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

    window.location.href = "/pages/search.html?q=" + encodeURIComponent(query);
}

function quickSearch(query) {
    if (!query) return;
    window.location.href = "/pages/search.html?q=" + encodeURIComponent(query);
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
    if (!container || !title) return;

    const services = window.AjArtivoFirebase;
    if (!services || !services.db) return;

    const params = new URLSearchParams(window.location.search);
    const rawQuery = (params.get("q") || "").trim();
    const query = rawQuery.toLowerCase();
    const category = (params.get("category") || "").trim().toUpperCase();
    const priceFilter = (params.get("price") || "").trim().toLowerCase();
    const sortFilter = (params.get("sort") || "").trim().toLowerCase();

    const titleParts = [];
    if (category) titleParts.push(`${category} Designs`);
    if (priceFilter === "free") titleParts.push("Free Resources");
    if (sortFilter === "trending") titleParts.push("Trending Designs");
    if (rawQuery) titleParts.push(`Search: "${rawQuery}"`);

    title.innerText = titleParts.length ? titleParts.join(" | ") : "All Designs";
    container.innerHTML = '<div class="empty-state">Loading designs...</div>';

    services.db.collection("designs")
        .orderBy("createdAt", "desc")
        .get()
        .then((snapshot) => {
            let designs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

            if (category) {
                designs = designs.filter((design) => {
                    const type = String(design.category || design.type || "").trim().toUpperCase();
                    if (category === "AI") {
                        return type === "AI" || type === "ILLUSTRATOR";
                    }
                    return type === category;
                });
            }

            if (priceFilter === "free") {
                designs = designs.filter((design) => {
                    const value = Number(design.price || 0);
                    return !Number.isFinite(value) || value <= 0;
                });
            }

            if (query) {
                designs = designs.filter((design) => {
                    const textBlob = [
                        design.title,
                        design.name,
                        design.description,
                        Array.isArray(design.tags) ? design.tags.join(" ") : ""
                    ].join(" ").toLowerCase();

                    return textBlob.includes(query);
                });
            }

            if (sortFilter === "trending") {
                designs.sort((a, b) => Number(b.downloads || 0) - Number(a.downloads || 0));
            }

            renderSearchDesignCards(container, designs);
        })
        .catch((error) => {
            console.error("Search results load error:", error);
            container.innerHTML = '<div class="empty-state">Could not load designs right now.</div>';
        });
}

function renderSearchDesignCards(container, designs) {
    if (!designs.length) {
        container.innerHTML = '<div class="empty-state">No matching designs found.</div>';
        return;
    }

    container.innerHTML = designs.map((design) => {
        const title = escapeText(design.title || design.name || "Untitled Design");
        const type = escapeText(design.category || design.type || "Other");
        const image = escapeText(design.image || "/images/trending1.jpg");
        const productUrl = `/product.html?id=${encodeURIComponent(design.id)}`;

        return `
            <article class="design-card homepage-design-card">
                <a href="${productUrl}" class="card-link homepage-card-link">
                    <img src="${image}" alt="${title}">
                    <div class="card-info">
                        <h3>${title}</h3>
                        <div class="homepage-card-meta">
                            <span class="file-type ${type.toLowerCase()}">${type}</span>
                        </div>
                    </div>
                </a>
            </article>
        `;
    }).join("");
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

    const autoplayDelay = 8000;
    let activeIndex = slides.findIndex((slide) => slide.classList.contains("is-active"));
    let intervalId = null;
    const preloadedSlides = new Set([0]);
    let preloadCursor = 1;

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
    window.setTimeout(preloadNextSlide, autoplayDelay);
    window.setTimeout(preloadNextSlide, autoplayDelay * 2);
    window.setTimeout(preloadNextSlide, autoplayDelay * 3);
}

async function loadHeroImages() {
    const fallbackImages = ["/images/hero/hero-bg.jpg"];

    try {
        const response = await fetch("/images/hero/manifest.json", { cache: "no-store" });
        if (!response.ok) return fallbackImages;

        const manifest = await response.json();
        if (!Array.isArray(manifest) || !manifest.length) return fallbackImages;

        return manifest;
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
    if (typeof firebase === "undefined" || !firebase.auth) return;

    firebase.auth().onAuthStateChanged((user) => {
        const guestMenu = document.getElementById("guestMenu");
        const userMenu = document.getElementById("userMenu");
        const userName = document.getElementById("userName");
        const memberBox = document.getElementById("memberAccess");
        const headerAvatar = document.getElementById("headerAvatar");
        const profileCardAvatar = document.getElementById("profileCardAvatar");
        const profileFullName = document.getElementById("profileFullName");
        const profileUserId = document.getElementById("profileUserId");
        const profileInitial = document.getElementById("profileInitial");
        const profileVerifiedText = document.getElementById("profileVerifiedText");

        if (user) {
            const displayName = user.displayName || user.email || "User";
            const firstName = displayName.trim().split(/\s+/)[0];
            const firstLetter = firstName.charAt(0).toUpperCase();
            const shortId = user.uid ? user.uid.slice(0, 8).toUpperCase() : "AJ000001";
            const avatarDataUrl = createLetterAvatar(firstLetter);

            if (guestMenu && userMenu) {
                guestMenu.style.display = "none";
                userMenu.style.display = "block";
            }

            if (userName) {
                userName.textContent = firstName;
            }

            if (headerAvatar) {
                headerAvatar.src = user.photoURL || avatarDataUrl;
            }

            if (profileCardAvatar) {
                profileCardAvatar.src = user.photoURL || avatarDataUrl;
            }

            if (profileFullName) {
                profileFullName.textContent = displayName;
            }

            if (profileUserId) {
                profileUserId.textContent = `ID: ${shortId}`;
            }

            if (profileInitial) {
                profileInitial.textContent = firstLetter;
            }

            if (profileVerifiedText) {
                profileVerifiedText.textContent = user.emailVerified ? "Verified user" : "Free user";
            }

            if (memberBox) {
                memberBox.classList.add("logged-in");
                const avatarHTML = user.photoURL
                    ? `<img src="${user.photoURL}" alt="${firstName}" class="member-avatar">`
                    : `<div class="member-avatar-letter">${firstLetter}</div>`;

                memberBox.innerHTML = `
                    <div class="member-account-row">
                        <a href="/pages/profile.html" class="member-user">
                            ${avatarHTML}
                            <div class="member-user-text">
                                <strong>${firstName}</strong>
                                <span>ID: ${shortId}</span>
                            </div>
                        </a>
                        <a href="#" id="sidebarLogout" class="sidebar-logout">Logout</a>
                    </div>
                `;
            }
        } else {
            if (guestMenu && userMenu) {
                guestMenu.style.display = "block";
                userMenu.style.display = "none";
            }

            if (memberBox) {
                memberBox.classList.remove("logged-in");
                memberBox.innerHTML = `
                    <div class="member-text">
                        <h5>Member Access</h5>
                        <p>Login to download premium design files.</p>
                    </div>
                    <a href="/login.html" class="member-login-btn">
                        <img src="/icons/login.svg" class="icon-svg" alt="Login">
                        Login
                    </a>
                `;
            }
        }
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
