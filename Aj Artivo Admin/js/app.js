(function () {
  const PROFILE_KEY = "ajartivo_admin_profile";

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY)) || null;
    } catch (error) {
      return null;
    }
  }

  function setSession(session) {
    if (!session) {
      localStorage.removeItem(PROFILE_KEY);
      dispatchSessionUpdate(null);
      return null;
    }

    localStorage.setItem(PROFILE_KEY, JSON.stringify(session));
    dispatchSessionUpdate(session);
    return session;
  }

  function updateSession(patch) {
    const current = getSession() || {};
    const next = {
      ...current,
      ...patch
    };

    return setSession(next);
  }

  function getDisplayName(session) {
    const activeSession = session || getSession();
    return String(
      activeSession && (
        activeSession.name ||
        activeSession.username ||
        activeSession.email
      ) || "Admin"
    ).trim();
  }

  function dispatchSessionUpdate(session) {
    window.dispatchEvent(
      new CustomEvent("ajartivo:session-updated", {
        detail: session
      })
    );
  }

  function bindLogout() {
    const buttons = document.querySelectorAll("[data-action='logout']");
    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        if (window.AjartivoAuth && typeof window.AjartivoAuth.logout === "function") {
          window.AjartivoAuth.logout();
          return;
        }
        window.location.href = "index.html";
      });
    });
  }

  function injectMobileTopbar() {
    if (document.body.dataset.page === "login") {
      return;
    }

    const main = document.querySelector(".main");
    if (!main || document.getElementById("mobileTopbar")) {
      return;
    }

    const topbar = document.createElement("div");
    topbar.className = "mobile-topbar panel";
    topbar.id = "mobileTopbar";
    topbar.innerHTML =
      "<div class='mobile-topbar-head'><strong>AjArtivo Admin</strong><button type='button' class='btn btn-outline mobile-logout' data-action='logout'>Logout</button></div>" +
      "<nav class='mobile-nav' aria-label='Mobile Navigation'>" +
      "<a data-nav='dashboard' href='dashboard.html'>Dashboard</a>" +
      "<a data-nav='upload' href='upload.html'>Upload</a>" +
      "<a data-nav='users' href='users.html'>Users</a>" +
      "<a data-nav='payments' href='payments.html'>Payments</a>" +
      "</nav>";
    main.insertBefore(topbar, main.firstChild);
  }

  function setActiveMenu() {
    const page = document.body.dataset.page;
    const links = document.querySelectorAll("[data-nav]");
    links.forEach(function (link) {
      if (link.dataset.nav === page) {
        link.classList.add("active");
      }
    });
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }

    return new Date(value).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function updateYear() {
    const yearNodes = document.querySelectorAll("[data-year]");
    yearNodes.forEach(function (node) {
      node.textContent = String(new Date().getFullYear());
    });
  }

  window.AdminApp = {
    bindLogout: bindLogout,
    setActiveMenu: setActiveMenu,
    formatCurrency: formatCurrency,
    formatDate: formatDate,
    getSession: getSession,
    setSession: setSession,
    updateSession: updateSession,
    getDisplayName: getDisplayName
  };

  document.addEventListener("DOMContentLoaded", function () {
    injectMobileTopbar();
    setActiveMenu();
    bindLogout();
    updateYear();
  });
})();
