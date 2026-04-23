(function () {
    "use strict";

    const LOCAL_BACKEND_BASE_URL = "http://localhost:5000";
    const LIVE_BACKEND_BASE_URL = "https://ajartivo-backend.onrender.com";

    const dropZone = document.getElementById("ajPixelCutDrop");
    const fileInput = document.getElementById("ajPixelCutFile");
    const runButton = document.getElementById("ajPixelCutRun");
    const statusEl = document.getElementById("ajPixelCutStatus");
    const metaEl = document.getElementById("ajPixelCutMeta");
    const previewEl = document.getElementById("ajPixelCutPreview");
    const downloadEl = document.getElementById("ajPixelCutDownload");

    if (!dropZone || !fileInput || !runButton || !statusEl || !metaEl || !previewEl || !downloadEl) {
        return;
    }

    let selectedFile = null;
    let currentObjectUrl = "";

    function cleanText(value) {
        if (typeof window.AjArtivoCleanText === "function") {
            return window.AjArtivoCleanText(value);
        }
        return String(value || "").trim();
    }

    function resolveBackendBaseUrl() {
        const globalConfigured = cleanText(window.AJARTIVO_BACKEND_URL);
        if (globalConfigured) {
            return globalConfigured.replace(/\/+$/, "");
        }

        if (typeof window.AjArtivoGetBackendBaseUrl === "function") {
            const base = cleanText(window.AjArtivoGetBackendBaseUrl());
            if (base) return base;
        }

        const meta = document.querySelector('meta[name="ajartivo-backend-url"]');
        const content = meta ? cleanText(meta.content) : "";
        if (content) return content.replace(/\/+$/, "");

        if (isLocalRuntime()) {
            return LOCAL_BACKEND_BASE_URL;
        }

        return LIVE_BACKEND_BASE_URL;
    }

    function isLocalRuntime() {
        const hostname = cleanText(window.location && window.location.hostname).toLowerCase();
        return !hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local");
    }

    function resolveRemoveBgUrl() {
        const meta = document.querySelector('meta[name="aj-pixel-cut-api"]');
        const configured = meta ? cleanText(meta.content) : "";
        if (configured) return configured;

        const backendBase = resolveBackendBaseUrl();
        return `${backendBase.replace(/\/+$/, "")}/remove-bg`;
    }

    function setStatus(message, kind) {
        statusEl.textContent = cleanText(message);
        statusEl.classList.toggle("is-error", kind === "error");
    }

    function setMeta(message) {
        metaEl.textContent = cleanText(message);
    }

    function setBusy(isBusy) {
        runButton.disabled = Boolean(isBusy);
        runButton.textContent = isBusy ? "Processing..." : "Remove Background";
    }

    function revokePreviewUrl() {
        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = "";
        }
    }

    function updateSelectedFile(file) {
        selectedFile = file || null;

        revokePreviewUrl();
        previewEl.classList.remove("is-visible");
        previewEl.removeAttribute("src");
        downloadEl.classList.remove("is-visible");
        downloadEl.setAttribute("href", "#");

        if (!selectedFile) {
            setMeta("No file selected.");
            return;
        }

        setMeta(`${selectedFile.name} - ${Math.max(1, Math.round(selectedFile.size / 1024))} KB`);
    }

    function bindDropZone() {
        dropZone.addEventListener("dragover", (event) => {
            event.preventDefault();
            dropZone.classList.add("is-active");
        });

        dropZone.addEventListener("dragleave", () => {
            dropZone.classList.remove("is-active");
        });

        dropZone.addEventListener("drop", (event) => {
            event.preventDefault();
            dropZone.classList.remove("is-active");
            const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
            updateSelectedFile(file);
        });
    }

    async function uploadAndRemoveBackground() {
        if (!selectedFile) {
            setStatus("Select or drop an image first.", "error");
            return;
        }

        const url = resolveRemoveBgUrl();
        const formData = new FormData();
        formData.append("image", selectedFile);

        setBusy(true);
        setStatus("Uploading image...", "info");

        try {
            const response = await fetch(url, {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                let errorMessage = `Request failed (${response.status}).`;
                try {
                    const data = await response.json();
                    if (data && data.error) {
                        errorMessage = cleanText(data.error);
                    }
                } catch (_error) {
                    // ignore JSON parse errors
                }

                setStatus(errorMessage, "error");
                return;
            }

            const blob = await response.blob();
            if (!blob || !blob.size) {
                setStatus("Empty response received.", "error");
                return;
            }

            revokePreviewUrl();
            currentObjectUrl = URL.createObjectURL(blob);
            previewEl.src = currentObjectUrl;
            previewEl.classList.add("is-visible");
            downloadEl.href = currentObjectUrl;
            downloadEl.classList.add("is-visible");
            setStatus("Done. Preview ready.", "info");
        } catch (error) {
            setStatus(cleanText(error && error.message) || "Network error. Please try again.", "error");
        } finally {
            setBusy(false);
        }
    }

    bindDropZone();

    fileInput.addEventListener("change", () => {
        const file = fileInput.files ? fileInput.files[0] : null;
        updateSelectedFile(file);
    });

    runButton.addEventListener("click", uploadAndRemoveBackground);

    updateSelectedFile(null);
    setStatus("Ready.", "info");
})();
