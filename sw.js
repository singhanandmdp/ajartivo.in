self.addEventListener("install", function (event) {
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
    const requestPath = url.pathname;

    if (!requestPath.startsWith(scopePath + "product/")) {
        return;
    }

    const slug = requestPath.slice((scopePath + "product/").length).replace(/\/+$/, "");
    if (!slug) {
        return;
    }

    const rewritten = new URL(scopePath + "product.html", url.origin);
    rewritten.searchParams.set("slug", slug);

    event.respondWith(fetch(rewritten.toString(), { credentials: "same-origin" }));
});
