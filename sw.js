self.addEventListener("install", function () {
    self.skipWaiting();
});

self.addEventListener("activate", function (event) {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
    if (event.request.method !== "GET" || event.request.mode !== "navigate") {
        return;
    }

    const url = new URL(event.request.url);
    const scopePath = new URL(self.registration.scope).pathname.replace(/\/+$/, "/");
    const requestPath = normalizePathname(url.pathname);
    const rewritten = rewriteNavigationRequest(requestPath, scopePath, url);

    if (!rewritten) {
        return;
    }

    event.respondWith(fetch(rewritten.toString(), { credentials: "same-origin" }));
});

function normalizePathname(pathname) {
    let current = String(pathname || "");
    const duplicatePrefixPattern = /^\/([^/]+)\/\1(?=\/|$)/;

    while (duplicatePrefixPattern.test(current)) {
        current = current.replace(duplicatePrefixPattern, "/$1");
    }

    return current;
}

function rewriteNavigationRequest(requestPath, scopePath, url) {
    const normalizedScopePath = String(scopePath || "/").replace(/\/+$/, "/");
    const normalizedRequestPath = String(requestPath || "/");
    const routePath = normalizedRequestPath.startsWith(normalizedScopePath)
        ? normalizedRequestPath.slice(normalizedScopePath.length - 1)
        : normalizedRequestPath;

    if (routePath.startsWith("/product/")) {
        const slug = routePath.slice("/product/".length).replace(/\/+$/, "");
        if (!slug) {
            return null;
        }

        const rewrittenProduct = new URL(normalizedScopePath + "product.html", url.origin);
        rewrittenProduct.searchParams.set("slug", slug);
        const designId = url.searchParams.get("id");
        if (designId) {
            rewrittenProduct.searchParams.set("id", designId);
        }
        return rewrittenProduct;
    }

    if (routePath === "/product") {
        const rewrittenProduct = new URL(normalizedScopePath + "product.html", url.origin);
        const slug = url.searchParams.get("slug");
        const designId = url.searchParams.get("id");
        if (slug) {
            rewrittenProduct.searchParams.set("slug", slug);
        }
        if (designId) {
            rewrittenProduct.searchParams.set("id", designId);
        }
        if (slug || designId) {
            return rewrittenProduct;
        }
    }

    const routeMap = {
        "/": "index.html",
        "/about": "about/index.html",
        "/dashboard": "dashboard.html",
        "/login": "login.html",
        "/signup": "signup.html",
        "/premium": "premium.html",
        "/privacy": "privacy.html",
        "/refund": "refund.html",
        "/terms": "terms.html",
        "/pages/contact": "pages/contact.html",
        "/pages/license": "pages/license.html",
        "/pages/privacy": "pages/privacy.html",
        "/pages/profile": "pages/profile.html",
        "/pages/search": "pages/search.html",
        "/tools/dashboard": "tools/dashboard.html",
        "/tools/aj-pixel-enhancer": "tools/aj-pixel-enhancer.html",
        "/tools/image-resizer": "tools/image-resizer.html",
        "/tools/image-converter": "tools/image-converter.html",
        "/tools/aj-colour-converter": "tools/aj-colour-converter.html",
        "/tools/aj-print-layout-pro": "tools/aj-print-layout-pro.html",
        "/tools/Aj Pixel Cut/website/aj-pixel-cut": "tools/Aj Pixel Cut/website/aj-pixel-cut.html"
    };

    const cleanRoute = routePath.replace(/\/+$/, "") || "/";
    const mappedTarget = routeMap[cleanRoute];
    if (mappedTarget) {
        return new URL(normalizedScopePath + mappedTarget, url.origin);
    }

    return null;
}
