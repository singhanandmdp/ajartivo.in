(function () {
    const services = window.AjArtivoSupabase;
    if (!services) return;

    init();

    async function init() {
        const user = await services.refreshSession();
        if (!user) return;

        renderProfile(user);
        loadWishlist();
        loadDownloadHistory();
    }

    function renderProfile(session) {
        const name = session.name || "Creative Member";
        const firstLetter = name.trim().charAt(0).toUpperCase() || "A";
        const avatar = createProfileAvatar(firstLetter);
        const memberSince = formatDate(session.createdAt);

        setText("profileName", name);
        setText("profileEmail", session.email || "member@ajartivo.local");

        const profileAvatar = document.getElementById("profileAvatar");
        if (profileAvatar) {
            profileAvatar.src = avatar;
        }

        const userData = document.getElementById("userData");
        if (userData) {
            userData.innerHTML = `
                <article class="profile-info-box">
                    <span>Name</span>
                    <strong>${escapeHtml(name)}</strong>
                </article>
                <article class="profile-info-box">
                    <span>Email</span>
                    <strong>${escapeHtml(session.email || "member@ajartivo.local")}</strong>
                </article>
                <article class="profile-info-box">
                    <span>Login Mode</span>
                    <strong>${escapeHtml(resolveLoginMode(session))}</strong>
                </article>
                <article class="profile-info-box">
                    <span>Member Since</span>
                    <strong>${escapeHtml(memberSince)}</strong>
                </article>
            `;
        }
    }

    function loadWishlist() {
        const container = document.getElementById("wishlistList");
        if (!container) return;

        const items = services.readList("ajartivo_wishlist");
        setText("wishlistCount", `${items.length} item${items.length === 1 ? "" : "s"}`);

        if (!items.length) {
            container.innerHTML = '<article class="profile-empty-card">Your wishlist is empty.</article>';
            return;
        }

        container.innerHTML = items.map((item) => {
            const title = escapeHtml(item.title || "Untitled Design");
            const image = escapeHtml(item.image || "/images/preview1.jpg");
            const price = item.is_paid ? `Rs. ${Number(item.price || 0)}` : "Free";
            const productUrl = `/product.html?id=${encodeURIComponent(item.id || "")}`;

            return `
                <article class="profile-media-card">
                    <img src="${image}" alt="${title}" class="profile-media-thumb">
                    <div class="profile-media-body">
                        <strong>${title}</strong>
                        <span>${escapeHtml(price)}</span>
                        <div class="profile-media-actions">
                            <a href="${productUrl}" class="profile-inline-btn">Open Product</a>
                            <button type="button" class="profile-inline-btn danger" data-remove-wishlist="${escapeHtml(item.id || "")}">Remove</button>
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        container.querySelectorAll("[data-remove-wishlist]").forEach((button) => {
            button.addEventListener("click", function () {
                const productId = button.getAttribute("data-remove-wishlist");
                services.removeWishlistItem(productId);
                loadWishlist();
            });
        });
    }

    function loadDownloadHistory() {
        const container = document.getElementById("downloadHistoryList");
        if (!container) return;

        const items = services.readList("ajartivo_download_history");
        setText("downloadHistoryCount", `${items.length} download${items.length === 1 ? "" : "s"}`);

        if (!items.length) {
            container.innerHTML = '<article class="profile-empty-card">No downloads yet.</article>';
            return;
        }

        container.innerHTML = items.map((item) => {
            const title = escapeHtml(item.title || "Untitled Design");
            const image = escapeHtml(item.image || "/images/preview1.jpg");
            const dateText = escapeHtml(formatDateTime(item.downloadedAt));
            const downloadUrl = escapeHtml(item.download_link || "");

            return `
                <article class="profile-media-card">
                    <img src="${image}" alt="${title}" class="profile-media-thumb">
                    <div class="profile-media-body">
                        <strong>${title}</strong>
                        <span>${item.is_paid ? `Rs. ${Number(item.price || 0)}` : "Free"}</span>
                        <small>${dateText}</small>
                        <div class="profile-media-actions">
                            <a href="/product.html?id=${encodeURIComponent(item.id || "")}" class="profile-inline-btn">View Product</a>
                            <a href="${downloadUrl}" class="profile-inline-btn" target="_blank" rel="noopener">Download Again</a>
                        </div>
                    </div>
                </article>
            `;
        }).join("");
    }

    function createProfileAvatar(letter) {
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 96;

        const ctx = canvas.getContext("2d");
        const gradient = ctx.createLinearGradient(0, 0, 96, 96);
        gradient.addColorStop(0, "#ff8f70");
        gradient.addColorStop(1, "#2563eb");

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 96, 96);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 42px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(letter, 48, 50);

        return canvas.toDataURL();
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    function formatDate(value) {
        const date = new Date(value || Date.now());
        if (Number.isNaN(date.getTime())) return "Not available";

        return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    function formatDateTime(value) {
        const date = new Date(value || Date.now());
        if (Number.isNaN(date.getTime())) return "Just now";

        return date.toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function resolveLoginMode(session) {
        const provider = String(session && session.provider || "").trim().toLowerCase();
        if (provider === "google") return "Supabase Auth (Google)";
        if (provider === "facebook") return "Supabase Auth (Facebook)";
        return "Supabase Auth (Email)";
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
