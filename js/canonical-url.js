(function () {
    function stripHtmlExtensionFromPath(path) {
        return String(path || "")
            .replace(/\/index\.html(?=([?#]|$))/i, "/")
            .replace(/\.html(?=([?#]|$))/i, "");
    }

    var currentPath = String(window.location.pathname || "");
    var cleanPath = stripHtmlExtensionFromPath(currentPath);
    if (!cleanPath || cleanPath === currentPath) {
        return;
    }

    window.history.replaceState({}, "", cleanPath + String(window.location.search || "") + String(window.location.hash || ""));
})();
