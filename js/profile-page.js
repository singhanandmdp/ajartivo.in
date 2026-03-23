const services = window.AjArtivoFirebase;

if (services && services.auth) {
    services.auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = "/login.html";
            return;
        }

        const name = user.displayName || user.email || "User";
        const firstLetter = name.trim().charAt(0).toUpperCase();
        const shortId = user.uid ? user.uid.slice(0, 8).toUpperCase() : "AJ000001";
        const avatar = user.photoURL || createProfileAvatar(firstLetter);
        const isVerified = Boolean(user.emailVerified);
        const provider = user.providerData[0]?.providerId || "firebase";
        const userEmail = user.email || "No email added";
        const accountType = isVerified ? "Verified account" : "Free account";
        const memberSince = formatMemberSince(user.metadata?.creationTime);

        setText("profileName", name);
        setText("profileEmail", userEmail);

        const profileAvatar = document.getElementById("profileAvatar");
        if (profileAvatar) {
            profileAvatar.src = avatar;
        }

        const profilePill = document.querySelector(".profile-pill");
        if (profilePill) {
            profilePill.textContent = "Creative Member";
        }

        renderUserData({
            name,
            email: userEmail,
            provider,
            shortId,
            accountType,
            memberSince
        });

        await Promise.all([
            loadWishlist(user),
            loadDownloadHistory(user)
        ]);
    });
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function createProfileAvatar(letter) {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;

    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 96, 96);
    gradient.addColorStop(0, "#ff8f70");
    gradient.addColorStop(1, "#4f46e5");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 96, 96);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 42px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, 48, 50);

    return canvas.toDataURL();
}

function renderUserData({ name, email, provider, shortId, accountType, memberSince }) {
    const userData = document.getElementById("userData");
    if (!userData) return;

    userData.innerHTML = `
        <article class="profile-info-box">
            <span>Name</span>
            <strong>${escapeHtml(name)}</strong>
        </article>
        <article class="profile-info-box">
            <span>Email</span>
            <strong>${escapeHtml(email)}</strong>
        </article>
        <article class="profile-info-box">
            <span>Login Provider</span>
            <strong>${escapeHtml(formatProvider(provider))}</strong>
        </article>
        <article class="profile-info-box">
            <span>User ID</span>
            <strong>${escapeHtml(shortId)}</strong>
        </article>
        <article class="profile-info-box">
            <span>Account Type</span>
            <strong>${escapeHtml(accountType)}</strong>
        </article>
        <article class="profile-info-box">
            <span>Member Since</span>
            <strong>${escapeHtml(memberSince)}</strong>
        </article>
    `;
}

async function loadWishlist(user) {
    const container = document.getElementById("wishlistList");
    if (!container || !services || !services.db) return;

    container.innerHTML = '<article class="profile-empty-card">Loading wishlist...</article>';

    try {
        const snapshot = await services.db.collection("userWishlists")
            .where("uid", "==", user.uid)
            .get();

        const items = snapshot.docs
            .map((doc) => ({ docId: doc.id, ...doc.data() }))
            .sort((a, b) => toMillis(b.savedAt) - toMillis(a.savedAt));

        setText("wishlistCount", `${items.length} item${items.length === 1 ? "" : "s"}`);

        if (!items.length) {
            container.innerHTML = '<article class="profile-empty-card">No wishlist items yet.</article>';
            return;
        }

        container.innerHTML = items.map((item) => {
            const title = escapeHtml(item.title || "Untitled Design");
            const image = escapeHtml(item.image || "/images/preview1.jpg");
            const price = Number(item.price || 0) > 0 ? `Rs. ${Number(item.price || 0)}` : "Free";
            const productUrl = `/product.html?id=${encodeURIComponent(item.designId || "")}`;

            return `
                <article class="profile-media-card">
                    <img src="${image}" alt="${title}" class="profile-media-thumb">
                    <div class="profile-media-body">
                        <strong>${title}</strong>
                        <span>${escapeHtml(price)}</span>
                        <div class="profile-media-actions">
                            <a href="${productUrl}" class="profile-inline-btn">Open Product</a>
                            <button type="button" class="profile-inline-btn danger" data-remove-wishlist="${escapeHtml(item.docId)}">Remove</button>
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        container.querySelectorAll("[data-remove-wishlist]").forEach((button) => {
            button.addEventListener("click", async () => {
                const docId = button.getAttribute("data-remove-wishlist");
                if (!docId) return;
                button.disabled = true;
                try {
                    await services.db.collection("userWishlists").doc(docId).delete();
                    await loadWishlist(user);
                } catch (error) {
                    console.error("Wishlist removal failed:", error);
                    alert("Unable to remove wishlist item right now.");
                    button.disabled = false;
                }
            });
        });
    } catch (error) {
        console.error("Wishlist load failed:", error);
        container.innerHTML = '<article class="profile-empty-card">Could not load wishlist right now.</article>';
    }
}

async function loadDownloadHistory(user) {
    const container = document.getElementById("downloadHistoryList");
    if (!container || !services || !services.db) return;

    container.innerHTML = '<article class="profile-empty-card">Loading download history...</article>';

    try {
        const snapshot = await services.db.collection("userDownloadHistory")
            .where("uid", "==", user.uid)
            .get();

        const items = snapshot.docs
            .map((doc) => ({ docId: doc.id, ...doc.data() }))
            .sort((a, b) => toMillis(b.downloadedAt) - toMillis(a.downloadedAt));

        setText("downloadHistoryCount", `${items.length} download${items.length === 1 ? "" : "s"}`);

        if (!items.length) {
            container.innerHTML = '<article class="profile-empty-card">No downloads yet.</article>';
            return;
        }

        container.innerHTML = items.map((item) => {
            const title = escapeHtml(item.title || "Untitled Design");
            const image = escapeHtml(item.image || "/images/preview1.jpg");
            const dateText = escapeHtml(formatDateTime(item.downloadedAt));
            const fileName = escapeHtml(item.fileName || "aj-file");

            return `
                <article class="profile-media-card">
                    <img src="${image}" alt="${title}" class="profile-media-thumb">
                    <div class="profile-media-body">
                        <strong>${title}</strong>
                        <span>${fileName}</span>
                        <small>${dateText}</small>
                        <div class="profile-media-actions">
                            <a href="/product.html?id=${encodeURIComponent(item.designId || "")}" class="profile-inline-btn">View Product</a>
                            <button type="button" class="profile-inline-btn" data-download-url="${escapeHtml(item.fileUrl || "")}" data-download-name="${fileName}">Download Again</button>
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        container.querySelectorAll("[data-download-url]").forEach((button) => {
            button.addEventListener("click", async () => {
                const url = button.getAttribute("data-download-url");
                const name = button.getAttribute("data-download-name");
                if (!url) {
                    alert("Download link not found.");
                    return;
                }

                try {
                    await forceDownload(url, name || "aj-file");
                } catch (error) {
                    console.error("Download retry failed:", error);
                    alert("Unable to start the download right now.");
                }
            });
        });
    } catch (error) {
        console.error("Download history load failed:", error);
        container.innerHTML = '<article class="profile-empty-card">Could not load download history right now.</article>';
    }
}

async function forceDownload(url, fileName) {
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl) return;

    try {
        const response = await fetch(cleanUrl, { mode: "cors" });
        if (!response.ok) {
            throw new Error("Download request failed.");
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        triggerDownload(objectUrl, fileName);
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    } catch (error) {
        triggerDownload(cleanUrl, fileName);
    }
}

function triggerDownload(url, fileName) {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "aj-file";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function formatProvider(provider) {
    if (!provider) return "Firebase";
    if (provider === "google.com") return "Google";
    if (provider === "facebook.com") return "Facebook";
    if (provider === "password") return "Email & Password";
    return provider;
}

function formatMemberSince(creationTime) {
    if (!creationTime) return "Not available";

    const date = new Date(creationTime);
    if (Number.isNaN(date.getTime())) return "Not available";

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function formatDateTime(value) {
    const millis = toMillis(value);
    if (!millis) return "Just now";

    return new Date(millis).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function toMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.seconds === "number") return value.seconds * 1000;

    const date = new Date(value);
    const millis = date.getTime();
    return Number.isFinite(millis) ? millis : 0;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
