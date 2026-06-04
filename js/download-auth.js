(function () {
    "use strict";

    function cleanText(value) {
        if (typeof window.AjArtivoCleanText === "function") {
            return window.AjArtivoCleanText(value);
        }

        return String(value || "").trim();
    }

    function getServices() {
        return window.AjArtivoSupabase || null;
    }

    function getSession() {
        const services = getServices();
        if (!services || typeof services.getSession !== "function") {
            return null;
        }

        return services.getSession();
    }

    function resolveNextPath(nextPath) {
        const fallback = `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
        return cleanText(nextPath) || fallback;
    }

    function resolveLoginUrl(nextPath) {
        const loginBase = typeof window.AjArtivoResolveUrl === "function"
            ? window.AjArtivoResolveUrl("/login")
            : "/login";
        const url = new URL(loginBase, window.location.href);
        url.searchParams.set("next", resolveNextPath(nextPath));
        return url.toString();
    }

    async function ensureDownloadSession(options) {
        const session = getSession();
        if (session) {
            return session;
        }

        const nextPath = resolveNextPath(options && options.nextPath);
        const reason = cleanText(options && options.reason) || "download";
        const authModal = window.AjArtivoAuthModal && typeof window.AjArtivoAuthModal.open === "function"
            ? window.AjArtivoAuthModal
            : null;

        if (authModal) {
            return authModal.open({
                nextPath: nextPath,
                reason: reason,
                redirectOnSuccess: false
            });
        }

        window.location.href = resolveLoginUrl(nextPath);
        return null;
    }

    async function withDownloadAuth(action, options) {
        const session = await ensureDownloadSession(options);
        if (!session || typeof action !== "function") {
            return null;
        }

        return action(session);
    }

    window.AjArtivoDownloadAuth = {
        ensureDownloadSession: ensureDownloadSession,
        getSession: getSession,
        resolveLoginUrl: resolveLoginUrl,
        withDownloadAuth: withDownloadAuth
    };
}());
