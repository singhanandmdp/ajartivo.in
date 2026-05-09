(function () {
    function stripHtmlExtensionFromPath(path) {
        return String(path || "")
            .replace(/\/index\.html(?=([?#]|$))/i, "/")
            .replace(/\.html(?=([?#]|$))/i, "");
    }

    function collapseDuplicateLeadingSegment(path) {
        let current = String(path || "");
        const duplicatePrefixPattern = /^\/([^/]+)\/\1(?=\/|$)/;

        while (duplicatePrefixPattern.test(current)) {
            current = current.replace(duplicatePrefixPattern, "/$1");
        }
        return current;
    }

    var currentPath = String(window.location.pathname || "");
    var cleanPath = collapseDuplicateLeadingSegment(stripHtmlExtensionFromPath(currentPath));
    if (!cleanPath || cleanPath === currentPath) {
        return;
    }

    window.history.replaceState({}, "", cleanPath + String(window.location.search || "") + String(window.location.hash || ""));
})();
