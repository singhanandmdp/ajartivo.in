(function () {
    const services = window.AjArtivoSupabase;
    if (!services) return;

    let currentSession = null;
    let formsBound = false;

    init();

    async function init() {
        const user = await services.refreshSession();
        if (!user) return;

        currentSession = user;
        renderPage(user);
        bindEvents();
        loadWishlist();
        loadDownloadHistory();
    }

    function bindEvents() {
        if (formsBound) return;

        const profileDetailsForm = document.getElementById("profileDetailsForm");
        const passwordChangeForm = document.getElementById("passwordChangeForm");

        if (profileDetailsForm) {
            profileDetailsForm.addEventListener("submit", handleProfileSave);
        }

        if (passwordChangeForm) {
            passwordChangeForm.addEventListener("submit", handlePasswordSave);
        }

        window.addEventListener("ajartivo:session-changed", function () {
            const session = services.getSession();
            if (!session) return;

            currentSession = session;
            renderPage(session);
        });

        window.addEventListener("ajartivo:account-updated", function () {
            const session = services.getSession();
            if (!session) return;

            currentSession = session;
            renderPage(session);
        });

        formsBound = true;
    }

    function renderPage(session) {
        renderProfile(session);
        renderAccountBenefits(session);
        populateProfileForm(session);
    }

    function renderProfile(session) {
        const fullName = session.fullName || session.name || "Creative Member";
        const firstName = session.firstName || splitName(fullName).firstName || "Creative";
        const lastName = session.lastName || splitName(fullName).lastName;
        const address = cleanText(session.address);
        const mobileNumber = cleanText(session.mobileNumber);
        const firstLetter = firstName.trim().charAt(0).toUpperCase() || "A";
        const avatar = createProfileAvatar(firstLetter);
        const memberSince = formatDate(session.createdAt);

        setText("profileName", fullName);
        setText("profileEmail", session.email || "member@ajartivo.local");
        setValue("profileEmailField", session.email || "member@ajartivo.local");

        const profilePill = document.querySelector(".profile-pill");
        if (profilePill) {
            profilePill.textContent = session && session.premiumActive === true ? "Premium Active" : "Free Member";
        }

        const profileAvatar = document.getElementById("profileAvatar");
        if (profileAvatar) {
            profileAvatar.src = avatar;
        }

        const userData = document.getElementById("userData");
        if (userData) {
            userData.innerHTML = `
                <article class="profile-info-box">
                    <span>First name</span>
                    <strong>${escapeHtml(firstName)}</strong>
                </article>
                <article class="profile-info-box">
                    <span>Last name</span>
                    <strong>${escapeHtml(lastName || "Not added")}</strong>
                </article>
                <article class="profile-info-box">
                    <span>Address</span>
                    <strong>${escapeHtml(address || "Not added")}</strong>
                </article>
                <article class="profile-info-box">
                    <span>Mobile number</span>
                    <strong>${escapeHtml(mobileNumber || "Not added")}</strong>
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

    function populateProfileForm(session) {
        const fullName = session.fullName || session.name || "";
        const nameParts = {
            firstName: session.firstName || splitName(fullName).firstName,
            lastName: session.lastName || splitName(fullName).lastName
        };

        setValue("profileFirstName", nameParts.firstName);
        setValue("profileLastName", nameParts.lastName);
        setValue("profileAddress", session.address || "");
        setValue("profileMobileNumber", session.mobileNumber || "");
        setValue("profileEmailField", session.email || "");
    }

    async function handleProfileSave(event) {
        event.preventDefault();

        const submitButton = document.getElementById("profileSaveBtn");
        const firstName = cleanText(readValue("profileFirstName"));
        const lastName = cleanText(readValue("profileLastName"));
        const address = cleanText(readValue("profileAddress"));
        const mobileNumber = cleanText(readValue("profileMobileNumber"));

        if (!firstName) {
            setStatus("profileDetailsStatus", "First name is required.", "error");
            return;
        }

        toggleButtonState(submitButton, true, "Saving...");

        try {
            const updatedSession = await services.updateProfile({
                firstName: firstName,
                lastName: lastName,
                address: address,
                mobileNumber: mobileNumber
            });

            currentSession = updatedSession || services.getSession();
            if (currentSession) {
                renderPage(currentSession);
            }

            setStatus("profileDetailsStatus", "Profile updated successfully.", "success");
        } catch (error) {
            setStatus("profileDetailsStatus", mapProfileError(error), "error");
        } finally {
            toggleButtonState(submitButton, false, "Save Changes");
        }
    }

    async function handlePasswordSave(event) {
        event.preventDefault();

        const submitButton = document.getElementById("passwordSaveBtn");
        const newPassword = cleanText(readValue("profileNewPassword"));
        const confirmPassword = cleanText(readValue("profileConfirmPassword"));

        if (newPassword.length < 6) {
            setStatus("passwordChangeStatus", "Password must be at least 6 characters.", "error");
            return;
        }

        if (newPassword !== confirmPassword) {
            setStatus("passwordChangeStatus", "Passwords do not match.", "error");
            return;
        }

        toggleButtonState(submitButton, true, "Updating...");

        try {
            await services.updatePassword(newPassword);
            setValue("profileNewPassword", "");
            setValue("profileConfirmPassword", "");
            setStatus("passwordChangeStatus", "Password updated successfully.", "success");
        } catch (error) {
            setStatus("passwordChangeStatus", mapProfileError(error), "error");
        } finally {
            toggleButtonState(submitButton, false, "Update Password");
        }
    }

    function renderAccountBenefits(session) {
        const premiumActive = session && session.premiumActive === true;
        const planLabel = premiumActive ? "Premium Active" : "Free Member";
        const freeRemaining = `${Number(session && session.freeDownloadRemaining || 0)} / 5`;
        const weeklyRemaining = `${Number(session && session.weeklyPremiumRemaining || 0)} / 2`;
        const premiumExpiry = premiumActive && session && session.premiumExpiry
            ? formatDate(session.premiumExpiry)
            : "Not active";
        const accessSummary = premiumActive
            ? "Unlimited free downloads and 2 premium downloads per week."
            : "Free users can download up to 5 free designs lifetime.";

        setText("accountPlanBadge", planLabel);
        setText("accountFreeRemaining", freeRemaining);
        setText("accountWeeklyRemaining", weeklyRemaining);
        setText("accountPremiumExpiry", premiumExpiry);
        setText("accountAccessSummary", accessSummary);
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

            return `
                <article class="profile-media-card">
                    <img src="${image}" alt="${title}" class="profile-media-thumb">
                    <div class="profile-media-body">
                        <strong>${title}</strong>
                        <span>${item.is_paid ? `Rs. ${Number(item.price || 0)}` : "Free"}</span>
                        <small>${dateText}</small>
                        <div class="profile-media-actions">
                            <a href="/product.html?id=${encodeURIComponent(item.id || "")}" class="profile-inline-btn">View Product</a>
                            <button type="button" class="profile-inline-btn" data-download-history="${escapeHtml(item.id || "")}">Download Again</button>
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        container.querySelectorAll("[data-download-history]").forEach((button) => {
            button.addEventListener("click", async function () {
                const productId = button.getAttribute("data-download-history");
                const item = items.find(function (entry) {
                    return String(entry.id || "") === String(productId || "");
                });

                if (!item || !window.AjArtivoPayment || typeof window.AjArtivoPayment.startDownloadFlow !== "function") {
                    window.location.href = `/product.html?id=${encodeURIComponent(productId || "")}`;
                    return;
                }

                button.disabled = true;

                try {
                    await window.AjArtivoPayment.startDownloadFlow(item);
                } catch (error) {
                    console.error("Download history retry failed:", error);
                    alert("Unable to restart the download right now.");
                } finally {
                    button.disabled = false;
                }
            });
        });
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

    function setStatus(id, message, tone) {
        const element = document.getElementById(id);
        if (!element) return;

        element.hidden = false;
        element.textContent = message;
        element.classList.remove("is-success", "is-error");
        element.classList.add(tone === "success" ? "is-success" : "is-error");
    }

    function toggleButtonState(button, disabled, label) {
        if (!button) return;

        button.disabled = disabled;
        button.textContent = label;
    }

    function readValue(id) {
        const element = document.getElementById(id);
        return element ? element.value : "";
    }

    function setValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.value = value;
        }
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    function splitName(value) {
        const fullName = cleanText(value);
        if (!fullName) {
            return { firstName: "", lastName: "" };
        }

        const parts = fullName.split(/\s+/).filter(Boolean);
        return {
            firstName: parts[0] || "",
            lastName: parts.slice(1).join(" ")
        };
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
        if (provider === "google") return "Google";
        if (provider === "facebook") return "Facebook";
        return "Email";
    }

    function mapProfileError(error) {
        const message = cleanText(error && (error.message || error.error_description || error.code)).toLowerCase();

        if (message.includes("same password")) {
            return "Please choose a different password.";
        }

        if (message.includes("weak password")) {
            return "Please use a stronger password.";
        }

        if (message.includes("log in again")) {
            return "Please log in again and retry.";
        }

        return cleanText(error && error.message) || "Something went wrong. Please try again.";
    }

    function cleanText(value) {
        return String(value || "").trim();
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
