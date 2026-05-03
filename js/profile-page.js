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
    let downloadHistoryObserver = null;

    init();

    async function init() {
        const authUser = await resolveAuthenticatedUser();
        if (!authUser) {
            window.location.href = resolveUrl("/login.html");
            return;
        }

        currentProfile = await loadProfileIdentity(authUser);
        const user = services.refreshSession
            ? await services.refreshSession({
                awaitAccountSummary: false,
                timeoutMs: 4000
            })
            : null;
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
        const profileAvatarButton = document.getElementById("profileAvatarButton");
        const profileAvatarInput = document.getElementById("profileAvatarInput");
        const dashboardSaveButton = document.querySelector("[data-dashboard-save]");

        if (profileDetailsForm) {
            profileDetailsForm.addEventListener("submit", handleProfileSave);
        }

        if (passwordChangeForm) {
            passwordChangeForm.addEventListener("submit", handlePasswordSave);
        }

        if (profileAvatarButton && profileAvatarInput) {
            renderAvatarButton(profileAvatarButton, false);
            profileAvatarButton.addEventListener("click", function () {
                profileAvatarInput.click();
            });

            profileAvatarInput.addEventListener("change", handleAvatarSelection);
        }

        if (dashboardSaveButton && profileDetailsForm) {
            dashboardSaveButton.addEventListener("click", function () {
                profileDetailsForm.requestSubmit();
            });
        }

        bindDashboardNavigation();

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
        updateDashboardHistoryLabel();
    }

    async function getLoggedInUser() {
        if (!supabase || !supabase.auth || typeof supabase.auth.getUser !== "function") {
            return null;
        }

        const authResult = await supabase.auth.getUser();
        return authResult && authResult.data ? authResult.data.user : null;
    }

    async function resolveAuthenticatedUser() {
        let authUser = await getLoggedInUser();
        if (authUser || !hasActiveAuthCallback()) {
            return authUser;
        }

        const deadline = Date.now() + 6000;
        while (Date.now() < deadline) {
            await delay(200);
            authUser = await getLoggedInUser();
            if (authUser) {
                return authUser;
            }
        }

        return null;
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
                        buildProfilePayload(user)
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

    function buildProfilePayload(user) {
        const metadata = user && user.user_metadata ? user.user_metadata : {};
        const nameParts = splitName(cleanText(metadata.full_name || metadata.name) || "User");

        return {
            id: cleanText(user && user.id),
            name: cleanText(metadata.full_name || metadata.name) || "User",
            email: cleanText(user && user.email).toLowerCase(),
            avatar_url: cleanText(metadata.avatar_url || metadata.picture),
            address: cleanText(metadata.address),
            mobile_number: cleanText(metadata.mobile_number || metadata.phone_number || metadata.phone),
            first_name: nameParts.firstName,
            last_name: nameParts.lastName
        };
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
            avatarUrl: cleanText(
                baseSession.avatarUrl ||
                baseSession.avatar_url ||
                profile.avatar_url ||
                authUser && authUser.user_metadata && (authUser.user_metadata.avatar_url || authUser.user_metadata.picture)
            ),
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
        const avatarUrl = cleanText(session.avatarUrl || currentProfile && currentProfile.avatar_url);
        const avatar = avatarUrl || createProfileAvatar(firstLetter);
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

        const headerAvatar = document.getElementById("headerAvatar");
        if (headerAvatar) {
            headerAvatar.src = avatar;
        }

        const profileCardAvatar = document.getElementById("profileCardAvatar");
        if (profileCardAvatar) {
            profileCardAvatar.src = avatar;
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

    async function handleAvatarSelection(event) {
        const input = event && event.target;
        const file = input && input.files && input.files[0] ? input.files[0] : null;
        const trigger = document.getElementById("profileAvatarButton");

        if (!file) {
            return;
        }

        renderAvatarButton(trigger, true);
        setInlineStatus("profileAvatarStatus", "Uploading profile image...", "success");

        try {
            const updatedSession = await services.uploadProfileAvatar(file);
            currentSession = buildDisplaySession(updatedSession || services.getSession(), null);
            currentProfile = {
                ...(currentProfile || {}),
                avatar_url: cleanText(currentSession && currentSession.avatarUrl)
            };
            if (currentSession) {
                renderPage(currentSession);
            }
            setInlineStatus("profileAvatarStatus", "Profile image updated successfully.", "success");
        } catch (error) {
            setInlineStatus("profileAvatarStatus", mapProfileError(error), "error");
        } finally {
            if (input) {
                input.value = "";
            }
            renderAvatarButton(trigger, false);
        }
    }

    function renderAccountBenefits(session) {
        const premiumActive = session && session.premiumActive === true;
        const planName = cleanText(session && session.planName) || (premiumActive ? "Premium" : "Free");
        const planLabel = premiumActive ? `${planName} Active` : "Free Member";
        const freeRemainingValue = Number(session && session.freeDownloadRemaining || 0);
        const weeklyRemainingValue = Number(session && session.weeklyPremiumRemaining || 0);
        const freeRemaining = freeRemainingValue < 0
            ? "Unlimited"
            : `${freeRemainingValue} left`;
        const weeklyRemaining = weeklyRemainingValue < 0
            ? "Unlimited"
            : `${weeklyRemainingValue} left`;
        const premiumExpiry = premiumActive && session && session.premiumExpiry
            ? formatDate(session.premiumExpiry)
            : "Not active";
        const accessSummary = premiumActive
            ? `${planName} gives premium downloads plus designer tool access.`
            : "Free users can browse the marketplace and use limited tool runs.";

        setText("accountPlanBadge", planLabel);
        setText("accountFreeRemaining", freeRemaining);
        setText("accountWeeklyRemaining", weeklyRemaining);
        setText("accountPremiumExpiry", premiumExpiry);
        setText("accountAccessSummary", accessSummary);
    }

    function buildProductUrl(design) {
        if (typeof window.AjArtivoBuildProductUrl === "function") {
            return window.AjArtivoBuildProductUrl(design);
        }

        const slug = typeof window.AjArtivoSlugify === "function"
            ? window.AjArtivoSlugify(design && (design.slug || design.title || design.name || design.id))
            : "";

        if (slug) {
            return resolveUrl(`/product/${encodeURIComponent(slug)}`);
        }

        return resolveUrl(`/product.html?id=${encodeURIComponent(design && design.id || "")}`);
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
            const designUrl = buildProductUrl(item);

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
        updateDashboardHistoryLabel(items.length);
        container.classList.add("profile-history-grid");
        disconnectDownloadHistoryObserver();

        if (!items.length) {
            container.innerHTML = '<article class="profile-empty-card">No downloads yet.</article>';
            return;
        }

        const PAGE_SIZE = 6;
        let renderedCount = 0;
        const sentinel = document.createElement("div");
        sentinel.className = "profile-history-sentinel";
        sentinel.setAttribute("aria-hidden", "true");
        container.innerHTML = "";

        const renderNextBatch = function () {
            const nextItems = items.slice(renderedCount, renderedCount + PAGE_SIZE);
            if (!nextItems.length) {
                disconnectDownloadHistoryObserver();
                sentinel.remove();
                return;
            }

            const markup = nextItems.map(function (item) {
                const title = escapeHtml(item.title || "Untitled Design");
                const image = escapeHtml(item.image || "/images/preview1.jpg");
                const dateText = escapeHtml(formatDateTime(item.downloadedAt));
                const priceText = item.is_paid ? `Rs. ${Number(item.price || 0)}` : "Free";

                return `
                    <article class="profile-media-card">
                        <img src="${image}" alt="${title}" class="profile-media-thumb" loading="lazy" decoding="async">
                        <div class="profile-media-body">
                            <strong>${title}</strong>
                            <span>${priceText}</span>
                            <small>${dateText}</small>
                            <div class="profile-media-actions">
                                <a href="${buildProductUrl(item)}" class="profile-inline-btn">View Design</a>
                                <button type="button" class="profile-inline-btn" data-download-history="${escapeHtml(item.id || "")}">Download Again</button>
                            </div>
                        </div>
                    </article>
                `;
            }).join("");

            sentinel.insertAdjacentHTML("beforebegin", markup);
            renderedCount += nextItems.length;
            bindHistoryButtons(container, items);

            if (renderedCount >= items.length) {
                disconnectDownloadHistoryObserver();
                sentinel.remove();
            }
        };

        container.appendChild(sentinel);
        renderNextBatch();

        if (renderedCount < items.length && typeof IntersectionObserver === "function") {
            downloadHistoryObserver = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        renderNextBatch();
                    }
                });
            }, {
                root: null,
                rootMargin: "0px 0px 220px 0px",
                threshold: 0.05
            });
            downloadHistoryObserver.observe(sentinel);
        }
    }

    function bindHistoryButtons(container, items) {
        container.querySelectorAll("[data-download-history]").forEach(function (button) {
            if (button.dataset.bound === "true") return;
            button.dataset.bound = "true";

            button.addEventListener("click", async function () {
                const designId = button.getAttribute("data-download-history");
                const item = items.find(function (entry) {
                    return String(entry.id || "") === String(designId || "");
                });

                if (!item || !window.AjArtivoPayment || typeof window.AjArtivoPayment.startDownloadFlow !== "function") {
                    window.location.href = buildProductUrl(item || { id: designId });
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

    function disconnectDownloadHistoryObserver() {
        if (downloadHistoryObserver && typeof downloadHistoryObserver.disconnect === "function") {
            downloadHistoryObserver.disconnect();
        }
        downloadHistoryObserver = null;
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

    function setInlineStatus(id, message, tone) {
        const element = document.getElementById(id);
        if (!element) return;

        element.hidden = !message;
        element.textContent = message || "";
        element.classList.remove("is-success", "is-error");
        if (message) {
            element.classList.add(tone === "success" ? "is-success" : "is-error");
        }
    }

    function renderAvatarButton(button, isLoading) {
        if (!button) return;

        button.disabled = isLoading;
        if (isLoading) {
            button.textContent = "...";
            return;
        }

        button.innerHTML = '<img src="icons/upload_img.svg" alt="Upload Profile Image">';
    }

    function bindDashboardNavigation() {
        const navButtons = Array.from(document.querySelectorAll("[data-dashboard-nav]"));
        if (!navButtons.length) {
            return;
        }

        navButtons.forEach(function (button) {
            button.addEventListener("click", function () {
                const target = cleanText(button.getAttribute("data-dashboard-nav"));
                const section = document.querySelector(`[data-dashboard-section="${target}"]`);
                if (!section) {
                    return;
                }

                section.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
                setActiveDashboardNav(target);
            });
        });

        const sections = Array.from(document.querySelectorAll("[data-dashboard-section]"));
        if (!sections.length || typeof IntersectionObserver !== "function") {
            return;
        }

        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    setActiveDashboardNav(entry.target.getAttribute("data-dashboard-section"));
                }
            });
        }, {
            rootMargin: "-20% 0px -55% 0px",
            threshold: 0.05
        });

        sections.forEach(function (section) {
            observer.observe(section);
        });
    }

    function setActiveDashboardNav(target) {
        const normalizedTarget = cleanText(target);
        document.querySelectorAll("[data-dashboard-nav]").forEach(function (button) {
            button.classList.toggle("is-active", cleanText(button.getAttribute("data-dashboard-nav")) === normalizedTarget);
        });
    }

    function updateDashboardHistoryLabel(countOverride) {
        const count = Number.isFinite(Number(countOverride))
            ? Number(countOverride)
            : (services.readList("ajartivo_download_history") || []).length;
        const historyButtonLabel = document.querySelector('[data-dashboard-nav="history"] span:last-child');
        if (historyButtonLabel && count > 0) {
            historyButtonLabel.textContent = `Download History (${count})`;
        }
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

    function hasActiveAuthCallback() {
        try {
            const searchParams = new URLSearchParams(window.location.search);
            const hashParams = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
            const keys = [
                "code",
                "access_token",
                "refresh_token",
                "expires_at",
                "expires_in",
                "provider_token",
                "provider_refresh_token",
                "token_type",
                "type",
                "error",
                "error_code",
                "error_description"
            ];

            return keys.some(function (key) {
                return searchParams.has(key) || hashParams.has(key);
            });
        } catch (error) {
            console.warn("Profile auth callback detection failed:", error);
            return false;
        }
    }

    function delay(ms) {
        return new Promise(function (resolve) {
            window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
        });
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
