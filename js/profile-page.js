(function () {
    const services = window.AjArtivoSupabase;
    const resolveUrl = typeof window.AjArtivoResolveUrl === "function"
        ? window.AjArtivoResolveUrl
        : function (path) { return path; };
    if (!services) return;
    const supabase = services.client;

    let currentSession = null;
    let currentProfile = null;
    let formsBound = false;

    init();

    async function init() {
        const authUser = await getLoggedInUser();
        if (!authUser) {
            window.location.href = resolveUrl("/login.html");
            return;
        }

        currentProfile = await loadProfileIdentity(authUser);
        const user = services.refreshSession ? await services.refreshSession() : null;
        currentSession = buildDisplaySession(user, authUser);
        renderPage(currentSession);
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

            currentSession = buildDisplaySession(session, null);
            renderPage(currentSession);
        });

        window.addEventListener("ajartivo:account-updated", function () {
            const session = services.getSession();
            if (!session) return;

            currentSession = buildDisplaySession(session, null);
            renderPage(currentSession);
        });

        formsBound = true;
    }

    function renderPage(session) {
        renderProfile(session);
        renderAccountBenefits(session);
        populateProfileForm(session);
    }

    async function getLoggedInUser() {
        if (!supabase || !supabase.auth || typeof supabase.auth.getUser !== "function") {
            return null;
        }

        const authResult = await supabase.auth.getUser();
        return authResult && authResult.data ? authResult.data.user : null;
    }

    async function loadProfileIdentity(user) {
        if (!user || !cleanText(user.id)) {
            return null;
        }

        try {
            const { data: profile, error } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", user.id)
                .maybeSingle();

            if (error) {
                throw error;
            }

            if (!profile) {
                const { error: insertError } = await supabase
                    .from("profiles")
                    .insert([
                        {
                            id: user.id,
                            email: cleanText(user.email).toLowerCase(),
                            name: "User"
                        }
                    ]);

                if (insertError) {
                    throw insertError;
                }
            }

            const { data: finalProfile, error: finalProfileError } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", user.id)
                .single();

            if (finalProfileError) {
                throw finalProfileError;
            }

            return finalProfile;
        } catch (error) {
            console.error("Profile identity load failed:", error);
            return null;
        }
    }

    function buildDisplaySession(session, authUser) {
        const baseSession = session || {};
        const profile = currentProfile || {};
        const profileName = cleanText(profile.name || profile.full_name);
        const sessionName = cleanText(baseSession.fullName || baseSession.name);
        const authName = cleanText(authUser && authUser.user_metadata && (authUser.user_metadata.full_name || authUser.user_metadata.name));
        const displayName = sessionName || profileName || authName || "User";
        const nameParts = splitName(displayName);

        return {
            ...baseSession,
            name: sessionName || displayName,
            fullName: sessionName || displayName,
            firstName: cleanText(baseSession.firstName) || cleanText(profile.first_name) || nameParts.firstName,
            lastName: cleanText(baseSession.lastName) || cleanText(profile.last_name) || nameParts.lastName,
            address: cleanText(baseSession.address) || cleanText(profile.address),
            mobileNumber: cleanText(baseSession.mobileNumber) || cleanText(profile.mobile_number),
            email: cleanText(baseSession.email) || cleanText(profile.email) || cleanText(authUser && authUser.email),
            createdAt: cleanText(baseSession.createdAt) || cleanText(authUser && authUser.created_at) || new Date().toISOString()
        };
    }

    function renderProfile(session) {
        const fullName = cleanText(session.fullName || session.name) || cleanText(currentProfile && (currentProfile.name || currentProfile.full_name)) || "User";
        const firstName = session.firstName || splitName(fullName).firstName || "Creative";
        const lastName = session.lastName || splitName(fullName).lastName;
        const address = cleanText(session.address || currentProfile && currentProfile.address);
        const mobileNumber = cleanText(session.mobileNumber || currentProfile && currentProfile.mobile_number);
        const firstLetter = firstName.trim().charAt(0).toUpperCase() || "A";
        const avatar = createProfileAvatar(firstLetter);
        const memberSince = formatDate(session.createdAt);
        const email = cleanText(session.email || currentProfile && currentProfile.email) || "member@ajartivo.local";

        setText("profileName", fullName);
        setText("profileEmail", email);
        setText("user-name", fullName);
        setText("user-email", email);
        setValue("profileEmailField", email);

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
                    <strong>${escapeHtml(email)}</strong>
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
            firstName: session.firstName || cleanText(currentProfile && currentProfile.first_name) || splitName(fullName).firstName,
            lastName: session.lastName || cleanText(currentProfile && currentProfile.last_name) || splitName(fullName).lastName
        };

        setValue("profileFirstName", nameParts.firstName);
        setValue("profileLastName", nameParts.lastName);
        setValue("profileAddress", session.address || cleanText(currentProfile && currentProfile.address));
        setValue("profileMobileNumber", session.mobileNumber || cleanText(currentProfile && currentProfile.mobile_number));
        setValue("profileEmailField", session.email || cleanText(currentProfile && currentProfile.email));
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

            currentSession = buildDisplaySession(updatedSession || services.getSession(), null);
            currentProfile = {
                ...(currentProfile || {}),
                name: cleanText(currentSession.fullName || currentSession.name) || "User",
                email: cleanText(currentSession.email),
                first_name: firstName,
                last_name: lastName,
                address: address,
                ...(mobileNumber ? { mobile_number: mobileNumber } : {})
            };
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
            const designUrl = resolveUrl(`/product.html?id=${encodeURIComponent(item.id || "")}`);

            return `
                <article class="profile-media-card">
                    <img src="${image}" alt="${title}" class="profile-media-thumb">
                    <div class="profile-media-body">
                        <strong>${title}</strong>
                        <span>${escapeHtml(price)}</span>
                        <div class="profile-media-actions">
                            <a href="${designUrl}" class="profile-inline-btn">Open Design</a>
                            <button type="button" class="profile-inline-btn danger" data-remove-wishlist="${escapeHtml(item.id || "")}">Remove</button>
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        container.querySelectorAll("[data-remove-wishlist]").forEach((button) => {
            button.addEventListener("click", function () {
                const designId = button.getAttribute("data-remove-wishlist");
                services.removeWishlistItem(designId);
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
                            <a href="${resolveUrl(`/product.html?id=${encodeURIComponent(item.id || "")}`)}" class="profile-inline-btn">View Design</a>
                            <button type="button" class="profile-inline-btn" data-download-history="${escapeHtml(item.id || "")}">Download Again</button>
                        </div>
                    </div>
                </article>
            `;
        }).join("");

        container.querySelectorAll("[data-download-history]").forEach((button) => {
            button.addEventListener("click", async function () {
                const designId = button.getAttribute("data-download-history");
                const item = items.find(function (entry) {
                    return String(entry.id || "") === String(designId || "");
                });

                if (!item || !window.AjArtivoPayment || typeof window.AjArtivoPayment.startDownloadFlow !== "function") {
                    window.location.href = resolveUrl(`/product.html?id=${encodeURIComponent(designId || "")}`);
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
