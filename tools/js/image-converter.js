(function () {
    "use strict";

    const currentScript = document.currentScript;
    const baseUrl = currentScript && currentScript.src ? new URL(".", currentScript.src) : new URL("./", window.location.href);

    function writeScript(relativePath) {
        const src = new URL(relativePath, baseUrl).href;
        document.write(`<script src="${src}"><\/script>`);
    }

    writeScript("../../js/supabase-config.js");
    writeScript("../../js/auth.js");
    writeScript("../../js/download-auth.js");
    writeScript("../../js/image-converter.js");
})();

