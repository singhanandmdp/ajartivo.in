(function () {
    const services = window.AjArtivoSupabase;
    if (!services) return;

    const BASE_URL = typeof window.AjArtivoGetBackendBaseUrl === "function"
        ? window.AjArtivoGetBackendBaseUrl()
        : "";
    const ui = {
        status: document.getElementById("adminStatus"),
        refreshBtn: document.getElementById("refreshAdminBtn"),
        statUsers: document.getElementById("statUsers"),
        statPremium: document.getElementById("statPremium"),
        statBanned: document.getElementById("statBanned"),
        usersTable: document.getElementById("adminUsersTable"),
        designForm: document.getElementById("adminDesignForm"),
        designTitle: document.getElementById("adminDesignTitle"),
        designDescription: document.getElementById("adminDesignDescription"),
        designPrice: document.getElementById("adminDesignPrice"),
        designCategory: document.getElementById("adminDesignCategory"),
        designImageUrl: document.getElementById("adminDesignImageUrl"),
        designFileUrl: document.getElementById("adminDesignFileUrl"),
        designTags: document.getElementById("adminDesignTags"),
        designPremium: document.getElementById("adminDesignPremium")
    };

    if (!ui.usersTable) return;

    init();

    async function init() {
        try {
            const session = services.getSession ? services.getSession() : null;
            if (!session || cleanText(session.role).toLowerCase() !== "admin") {
                setStatus("Admin access is required for this page.", "error");
                ui.usersTable.innerHTML = '<tr><td colspan="6">You do not have admin access.</td></tr>';
                return;
            }

            bindEvents();
            await loadAdminData();
        } catch (error) {
            setStatus(error && error.message ? error.message : "Admin page failed to load.", "error");
        }
    }

    function bindEvents() {
        ui.refreshBtn.addEventListener("click", loadAdminData);
        ui.designForm.addEventListener("submit", handleDesignPublish);
    }

    async function loadAdminData() {
        setStatus("Loading admin data...", "success");

        const [overview, users] = await Promise.all([
            requestJson("/admin/overview"),
            requestJson("/admin/users?limit=50")
        ]);

        renderOverview(overview && overview.overview ? overview.overview : {});
        renderUsers(users && users.users ? users.users : []);
        setStatus("Admin workspace is ready.", "success");
    }

    function renderOverview(overview) {
        const totals = overview && overview.totals ? overview.totals : {};
        ui.statUsers.textContent = String(Number(totals.users || 0));
        ui.statPremium.textContent = String(Number(totals.premium_active || 0));
        ui.statBanned.textContent = String(Number(totals.banned || 0));
    }

    function renderUsers(users) {
        if (!Array.isArray(users) || !users.length) {
            ui.usersTable.innerHTML = '<tr><td colspan="6">No users found.</td></tr>';
            return;
        }

        ui.usersTable.innerHTML = users.map(function (user) {
            const fullName = escapeHtml(cleanText(user.name) || cleanText(user.email));
            const email = escapeHtml(cleanText(user.email));
            const planName = escapeHtml(cleanText(user.active_plan_name) || "Free");
            const status = user.is_banned === true
                ? "Banned"
                : user.premium_active === true
                ? "Premium Active"
                : "Free";
            const downloads = Number(user.downloads_remaining_month || 0);
            const aiToday = Number(user.ai_remaining_today || 0);

            return `
                <tr>
                    <td>
                        <strong>${fullName}</strong><br>
                        <small>${email}</small>
                    </td>
                    <td>${planName}</td>
                    <td>${escapeHtml(status)}</td>
                    <td>${downloads < 0 ? "Unlimited" : `${downloads} left`}</td>
                    <td>${aiToday < 0 ? "Unlimited" : `${aiToday} left`}</td>
                    <td>
                        <div class="admin-actions">
                            <button class="admin-btn-mini" data-admin-action="grant" data-user-id="${escapeHtml(user.id)}" data-plan-id="basic_299_3m">Basic</button>
                            <button class="admin-btn-mini" data-admin-action="grant" data-user-id="${escapeHtml(user.id)}" data-plan-id="advanced_599_6m">Advanced</button>
                            <button class="admin-btn-mini" data-admin-action="grant" data-user-id="${escapeHtml(user.id)}" data-plan-id="ultimate_999_1y">Ultimate</button>
                            <button class="admin-btn-mini" data-admin-action="revoke" data-user-id="${escapeHtml(user.id)}">Remove</button>
                            <button class="admin-btn-mini" data-admin-action="ban" data-user-id="${escapeHtml(user.id)}" data-is-banned="${user.is_banned === true ? "false" : "true"}">${user.is_banned === true ? "Unban" : "Ban"}</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        ui.usersTable.querySelectorAll("[data-admin-action]").forEach(function (button) {
            button.addEventListener("click", handleUserAction);
        });
    }

    async function handleUserAction(event) {
        const button = event.currentTarget;
        const action = cleanText(button.getAttribute("data-admin-action"));
        const userId = cleanText(button.getAttribute("data-user-id"));
        const planId = cleanText(button.getAttribute("data-plan-id"));
        const isBanned = button.getAttribute("data-is-banned") === "true";

        button.disabled = true;

        try {
            if (action === "grant") {
                await requestJson("/admin/subscriptions/grant", {
                    method: "POST",
                    body: {
                        user_id: userId,
                        plan_id: planId
                    }
                });
                setStatus(`Granted ${planId} to selected user.`, "success");
            } else if (action === "revoke") {
                await requestJson("/admin/subscriptions/revoke", {
                    method: "POST",
                    body: {
                        user_id: userId
                    }
                });
                setStatus("Premium removed successfully.", "success");
            } else if (action === "ban") {
                await requestJson(`/admin/users/${encodeURIComponent(userId)}/ban`, {
                    method: "POST",
                    body: {
                        is_banned: isBanned
                    }
                });
                setStatus(isBanned ? "User banned successfully." : "User unbanned successfully.", "success");
            }

            await loadAdminData();
        } catch (error) {
            setStatus(error && error.message ? error.message : "Admin action failed.", "error");
        } finally {
            button.disabled = false;
        }
    }

    async function handleDesignPublish(event) {
        event.preventDefault();
        const payload = {
            title: cleanText(ui.designTitle.value),
            description: cleanText(ui.designDescription.value),
            price: Number(ui.designPrice.value || 0),
            category: cleanText(ui.designCategory.value),
            image_url: cleanText(ui.designImageUrl.value),
            file_url: cleanText(ui.designFileUrl.value),
            tags: cleanText(ui.designTags.value).split(",").map(cleanText).filter(Boolean),
            is_premium: ui.designPremium.checked === true
        };

        try {
            await requestJson("/admin/designs", {
                method: "POST",
                body: payload
            });
            ui.designForm.reset();
            setStatus("Design published successfully.", "success");
        } catch (error) {
            setStatus(error && error.message ? error.message : "Could not publish design.", "error");
        }
    }

    async function requestJson(route, options) {
        const authSession = await services.getAuthSession({ sync: true });
        if (!authSession || !authSession.user || !cleanText(authSession.access_token)) {
            throw new Error("Admin login is required.");
        }

        const settings = options || {};
        const response = await fetch(`${BASE_URL}${route}`, {
            method: cleanText(settings.method) || "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${cleanText(authSession.access_token)}`
            },
            body: cleanText(settings.method).toUpperCase() === "POST"
                ? JSON.stringify(settings.body || {})
                : undefined
        });
        const payload = await response.json().catch(function () {
            return {};
        });

        if (!response.ok) {
            throw new Error(cleanText(payload && payload.error) || "Admin request failed.");
        }

        return payload;
    }

    function setStatus(message, tone) {
        ui.status.hidden = !message;
        ui.status.textContent = message || "";
        ui.status.style.background = tone === "error"
            ? "rgba(239, 68, 68, 0.12)"
            : "rgba(22, 163, 74, 0.12)";
        ui.status.style.color = tone === "error" ? "#7f1d1d" : "#14532d";
    }

    function cleanText(value) {
        return typeof window.AjArtivoCleanText === "function"
            ? window.AjArtivoCleanText(value)
            : String(value || "").trim();
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})();
