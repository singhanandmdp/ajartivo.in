(function () {
    "use strict";

    const currentScript = document.currentScript;
    const baseUrl = currentScript && currentScript.src ? new URL(".", currentScript.src) : new URL("./", window.location.href);

    function writeScript(relativePath) {
        const src = new URL(relativePath, baseUrl).href;
        document.write(`<script src="${src}"><\/script>`);
    }

    writeScript("../../js/canonical-url.js");
    writeScript("../../js/script.js");
})();

