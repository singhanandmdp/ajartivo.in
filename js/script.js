document.addEventListener("DOMContentLoaded", () => {

    fetch("/header.html")
        .then(res => res.text())
        .then(html => {
            const headerContainer = document.getElementById("site-header");
            if (headerContainer) {
                headerContainer.innerHTML = html;

                // 🔥 HEADER LOAD HONE KE BAAD MENU INIT
                initMenu();
            }
        })
        .catch(err => console.error("Header load failed:", err));
});

/* ================= MENU LOGIC ================= */
function initMenu() {

    const menuBtn = document.querySelector(".menu-icon");
    const sidebar = document.getElementById("sidebarMenu");
    const overlay = document.getElementById("menuOverlay");

    // Agar sidebar/page me nahi hai → safely exit
    if (!menuBtn || !sidebar || !overlay) {
        console.warn("Menu elements missing on this page");
        return;
    }

    menuBtn.addEventListener("click", () => {
        sidebar.classList.add("active");
        overlay.classList.add("active");
    });

    overlay.addEventListener("click", () => {
        sidebar.classList.remove("active");
        overlay.classList.remove("active");
    });
}
