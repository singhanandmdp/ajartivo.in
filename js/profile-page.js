const adminEmail = "anandsinghks2014@gmail.com";

firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = "/login.html";
        return;
    }

    const name = user.displayName || user.email || "User";
    const firstLetter = name.trim().charAt(0).toUpperCase();
    const shortId = user.uid ? user.uid.slice(0, 8).toUpperCase() : "AJ000001";
    const avatar = user.photoURL || createProfileAvatar(firstLetter);
    const isVerified = Boolean(user.emailVerified);
    const isAdmin = user.email === adminEmail;
    const provider = user.providerData[0]?.providerId || "firebase";
    const userEmail = user.email || "No email added";
    const accountType = isAdmin ? "Admin account" : (isVerified ? "Verified account" : "Free account");
    const memberSince = formatMemberSince(user.metadata?.creationTime);

    setText("profileName", name);
    setText("profileEmail", userEmail);

    const profileAvatar = document.getElementById("profileAvatar");
    if (profileAvatar) {
        profileAvatar.src = avatar;
    }

    const profilePill = document.querySelector(".profile-pill");
    if (profilePill) {
        profilePill.textContent = isAdmin ? "Admin account" : "Creative Member";
    }

    const adminPanel = document.getElementById("adminPanel");
    if (adminPanel) {
        adminPanel.hidden = !isAdmin;
    }

    renderUserData({
        name,
        email: userEmail,
        provider,
        shortId,
        accountType,
        memberSince
    });
});

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

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
