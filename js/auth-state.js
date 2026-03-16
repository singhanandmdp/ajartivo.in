firebase.auth().onAuthStateChanged((user) => {

    const guestMenu = document.getElementById("guestMenu");
    const userMenu = document.getElementById("userMenu");
    const userName = document.getElementById("userName");
    const memberBox = document.getElementById("memberAccess");
    const headerAvatar = document.getElementById("headerAvatar");
    const profileCardAvatar = document.getElementById("profileCardAvatar");
    const profileFullName = document.getElementById("profileFullName");
    const profileUserId = document.getElementById("profileUserId");
    const profileBadge = document.querySelector(".profile-badge");

    if (user) {

        const name = user.displayName || user.email;
        const firstName = name.trim().split(/\s+/)[0];
        const firstLetter = firstName.charAt(0).toUpperCase();
        const shortId = user.uid ? user.uid.slice(0, 8).toUpperCase() : "AJ000001";
        const avatarDataUrl = createLetterAvatar(firstLetter);

        // HEADER UPDATE
        if (guestMenu && userMenu) {
            guestMenu.style.display = "none";
            userMenu.style.display = "flex";
        }

        if (userName) {
            userName.textContent = firstName;
        }

        // HEADER AVATAR
        if (headerAvatar) {

            if (user.photoURL) {

                headerAvatar.src = user.photoURL;

            } else {
                headerAvatar.src = avatarDataUrl;

            }

        }

        if (profileCardAvatar) {
            profileCardAvatar.src = user.photoURL || avatarDataUrl;
        }

        if (profileFullName) {
            profileFullName.textContent = name.toUpperCase();
        }

        if (profileUserId) {
            profileUserId.textContent = `ID: ${shortId}`;
        }

        if (profileBadge) {
            profileBadge.textContent = user.emailVerified ? "Verified user" : "Free user";
        }

        // SIDEBAR UPDATE
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
            guestMenu.style.display = "flex";
            userMenu.style.display = "none";
        }

        if (memberBox) {
            memberBox.classList.remove("logged-in");
        }

    }

});
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
