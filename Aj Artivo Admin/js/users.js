document.addEventListener("DOMContentLoaded", function () {
  if (document.body.dataset.page !== "users") {
    return;
  }

  const table = document.getElementById("usersTable");
  const usersCount = document.getElementById("usersCount");
  const usersStatus = document.getElementById("usersStatus");
  const grantPlanSelect = document.getElementById("grantPlanSelect");
  let activePlans = [];

  boot();

  async function boot() {
    setStatus("Loading users and plans...", "warning");

    try {
      await loadPlans();
      await render();
      setStatus("", "");
    } catch (error) {
      setStatus(getErrorMessage(error), "danger");
      table.innerHTML = "<tr><td colspan='6' class='empty'>Could not load users.</td></tr>";
    }
  }

  function statusClass(status) {
    if (status === "Premium Active" || status === "Active") {
      return "status-pill status-success";
    }
    if (status === "Premium Expired" || status === "Free Member") {
      return "status-pill status-warning";
    }
    return "status-pill status-danger";
  }

  async function getUsersSafe() {
    const store = window.AdminData || { connected: false };
    if (store.connected && typeof store.getAdminUsers === "function") {
      try {
        return await store.getAdminUsers(100);
      } catch (error) {
        if (typeof store.getUsers === "function") {
          return await store.getUsers();
        }
      }
    }
    return [];
  }

  async function getPlansSafe() {
    const store = window.AdminData || { connected: false };
    if (store.connected && typeof store.getPlans === "function") {
      try {
        return await store.getPlans();
      } catch (error) {
        return [];
      }
    }
    return [];
  }

  async function grantPremiumSafe(userId, planId) {
    const store = window.AdminData || { connected: false };
    if (!(store.connected && typeof store.grantPremiumMembership === "function")) {
      throw new Error("Premium grant is not available right now.");
    }
    return store.grantPremiumMembership(userId, planId);
  }

  async function revokePremiumSafe(userId) {
    const store = window.AdminData || { connected: false };
    if (!(store.connected && typeof store.revokePremiumMembership === "function")) {
      throw new Error("Premium revoke is not available right now.");
    }
    return store.revokePremiumMembership(userId);
  }

  async function setBanStateSafe(userId, isBanned) {
    const store = window.AdminData || { connected: false };
    if (!(store.connected && typeof store.setUserBanState === "function")) {
      throw new Error("Ban control is not available right now.");
    }
    return store.setUserBanState(userId, isBanned);
  }

  async function loadPlans() {
    activePlans = await getPlansSafe();

    if (!grantPlanSelect) {
      return;
    }

    if (!activePlans.length) {
      grantPlanSelect.innerHTML = "<option value=''>No plans available</option>";
      grantPlanSelect.disabled = true;
      return;
    }

    grantPlanSelect.disabled = false;
    grantPlanSelect.innerHTML = activePlans.map(function (plan) {
      const price = Number(plan && plan.price || 0);
      const duration = Number(plan && plan.duration_days || 0);
      const label = `${escapeHtml(plan.name || "Plan")} - Rs. ${price} / ${duration} days`;
      return `<option value="${escapeHtml(plan.plan_id || plan.id || "")}">${label}</option>`;
    }).join("");
  }

  async function render() {
    const users = await getUsersSafe();
    const visibleUsers = users.filter(function (user) {
      return String(user && user.role || "").trim().toLowerCase() !== "admin";
    });

    if (usersCount) {
      usersCount.textContent = `${visibleUsers.length} user${visibleUsers.length === 1 ? "" : "s"}`;
    }

    if (visibleUsers.length === 0) {
      table.innerHTML = "<tr><td colspan='6' class='empty'>No users found.</td></tr>";
      return;
    }

    table.innerHTML = visibleUsers.map(function (user) {
      const status = getUserStatus(user);
      const planName = String(user && (user.active_plan_name || user.plan_name) || "").trim() || "Free";
      const premiumCycle = formatPremiumCycle(user);
      const freeAccess = formatFreeAccess(user);

      return (
        "<tr>" +
          "<td><div class='user-cell'><strong>" + escapeHtml(user.name || "User") + "</strong><span class='user-subline'>" + escapeHtml(user.role || "user") + "</span></div></td>" +
          "<td>" + escapeHtml(user.email || "") + "</td>" +
          "<td><div class='plan-stack'><strong>" + escapeHtml(planName) + "</strong><small>" + escapeHtml(freeAccess) + "</small></div></td>" +
          "<td><span class='" + statusClass(status) + "'>" + escapeHtml(status) + "</span></td>" +
          "<td>" + escapeHtml(premiumCycle) + "</td>" +
          "<td><div class='table-actions'>" +
            "<button class='btn btn-primary' data-action='grant' data-user-id='" + escapeHtml(user.id) + "'" + (grantPlanSelect && grantPlanSelect.disabled ? " disabled" : "") + ">Give Premium</button>" +
            "<button class='btn btn-soft' data-action='revoke' data-user-id='" + escapeHtml(user.id) + "'" + (user.premium_active === true ? "" : " disabled") + ">Remove Premium</button>" +
            "<button class='btn " + (user.is_banned === true ? "btn-soft" : "btn-warning") + "' data-action='ban' data-ban-state='" + (user.is_banned === true ? "false" : "true") + "' data-user-id='" + escapeHtml(user.id) + "'>" + (user.is_banned === true ? "Unban" : "Ban") + "</button>" +
          "</div></td>" +
        "</tr>"
      );
    }).join("");

    table.querySelectorAll("[data-action='grant']").forEach(function (button) {
      button.addEventListener("click", function () {
        handleGrant(button);
      });
    });

    table.querySelectorAll("[data-action='revoke']").forEach(function (button) {
      button.addEventListener("click", function () {
        handleRevoke(button);
      });
    });

    table.querySelectorAll("[data-action='ban']").forEach(function (button) {
      button.addEventListener("click", function () {
        handleBanToggle(button);
      });
    });
  }

  async function handleGrant(button) {
    const userId = button.getAttribute("data-user-id");
    const planId = grantPlanSelect ? grantPlanSelect.value : "";
    if (!userId || !planId) {
      setStatus("Select a plan before granting premium.", "danger");
      return;
    }

    await runRowAction(button, `Granting premium using ${grantPlanSelect.options[grantPlanSelect.selectedIndex].text}...`, function () {
      return grantPremiumSafe(userId, planId);
    }, "Premium granted successfully.");
  }

  async function handleRevoke(button) {
    const userId = button.getAttribute("data-user-id");
    if (!userId) {
      return;
    }

    await runRowAction(button, "Removing premium access...", function () {
      return revokePremiumSafe(userId);
    }, "Premium access removed.");
  }

  async function handleBanToggle(button) {
    const userId = button.getAttribute("data-user-id");
    const nextBanState = button.getAttribute("data-ban-state") === "true";
    if (!userId) {
      return;
    }

    await runRowAction(button, nextBanState ? "Banning user..." : "Removing ban...", function () {
      return setBanStateSafe(userId, nextBanState);
    }, nextBanState ? "User banned and premium access removed." : "User unbanned successfully.");
  }

  async function runRowAction(button, loadingMessage, handler, successMessage) {
    const idleLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Working...";
    setStatus(loadingMessage, "warning");

    try {
      await handler();
      await render();
      setStatus(successMessage, "success");
    } catch (error) {
      setStatus(getErrorMessage(error), "danger");
    } finally {
      button.disabled = false;
      button.textContent = idleLabel;
    }
  }

  function setStatus(message, type) {
    if (!usersStatus) {
      return;
    }

    usersStatus.hidden = !message;
    usersStatus.textContent = message || "";
    usersStatus.classList.remove("status-success", "status-warning", "status-danger");

    if (!message) {
      return;
    }

    usersStatus.classList.add(
      type === "success"
        ? "status-success"
        : type === "danger"
        ? "status-danger"
        : "status-warning"
    );
  }

  function getUserStatus(user) {
    if (user && user.is_banned === true) {
      return "Banned";
    }

    if (user && user.premium_active === true) {
      return "Premium Active";
    }

    if (String(user && user.premium_expiry || "").trim()) {
      return "Premium Expired";
    }

    return "Free Member";
  }

  function formatPremiumCycle(user) {
    if (user && user.is_banned === true) {
      return "Blocked from marketplace access";
    }

    const remaining = Number(user && user.weekly_premium_remaining);
    const expiry = String(user && user.premium_expiry || "").trim();
    const expiryLabel = expiry
      ? `Until ${new Date(expiry).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
      : "No active premium";

    if (user && user.premium_active === true) {
      return remaining < 0 ? `${expiryLabel} • Unlimited` : `${expiryLabel} • ${remaining} left`;
    }

    return expiry ? `${expiryLabel} • Inactive` : "Premium not active";
  }

  function formatFreeAccess(user) {
    const remaining = Number(user && user.free_download_remaining);
    return remaining < 0 ? "Free access available" : `${remaining} free downloads left`;
  }

  function getErrorMessage(error) {
    return String(error && error.message || "Request failed.").trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
});
