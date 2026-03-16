document.addEventListener("DOMContentLoaded", () => {
    loadHeader();
    loadFooter();
    loadSidebar();
    initSearch();
    initSearchResults();
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
        })
        .catch((err) => console.log("Sidebar load error:", err));
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
    ["heroSearchInput", "headerSearchInput"].forEach((inputId) => {
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

function initSearchResults() {
    const container = document.getElementById("results");
    const title = document.getElementById("searchTitle");
    if (!container || !title) return;

    const query = new URLSearchParams(window.location.search).get("q");
    if (!query) return;

    title.innerText = "Search Results for: " + query;
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

        if (!guestMenu || !userMenu) return;

        if (user) {
            guestMenu.style.display = "none";
            userMenu.style.display = "block";

            if (userName) {
                const displayName = user.displayName || user.email || "User";
                userName.textContent = displayName.trim().split(/\s+/)[0];
            }
        } else {
            guestMenu.style.display = "block";
            userMenu.style.display = "none";
        }
    });
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
