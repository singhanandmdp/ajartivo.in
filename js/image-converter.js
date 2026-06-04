(function () {
    "use strict";

    const LOCAL_BACKEND_BASE_URL = "http://localhost:5000";
    const LIVE_BACKEND_BASE_URL = "https://ajartivo-backend.onrender.com";
    const BACKEND_HEALTH_TIMEOUT_MS = 2500;

    const dropZone = document.getElementById("converterDropZone");
    const fileInput = document.getElementById("converterFileInput");
    const pickBtn = document.getElementById("converterPickBtn");
    const addMoreBtn = document.getElementById("converterAddMoreBtn");
    const convertBtn = document.getElementById("converterConvertBtn");
    const clearBtn = document.getElementById("converterClearBtn");
    const formatEl = document.getElementById("converterFormat");
    const qualityEl = document.getElementById("converterQuality");
    const qualityValueEl = document.getElementById("converterQualityValue");
    const backgroundEl = document.getElementById("converterBackground");
    const keepMetadataEl = document.getElementById("converterKeepMetadata");
    const hintEl = document.getElementById("converterHint");
    const statusEl = document.getElementById("converterStatus");
    const statusMetaEl = document.getElementById("converterStatusMeta");
    const statusCountEl = document.getElementById("converterStatusCount");
    const progressBarEl = document.getElementById("converterProgressBar");
    const queueEl = document.getElementById("converterQueue");
    const resultsEl = document.getElementById("converterResults");
    const queuePanelEl = document.getElementById("converterQueuePanel");
    const resultsPanelEl = document.getElementById("converterResultsPanel");
    const backendStateEl = document.getElementById("converterBackendState");
    const fileCountEl = document.getElementById("converterFileCount");
    const totalSizeEl = document.getElementById("converterTotalSize");
    const outputCountEl = document.getElementById("converterOutputCount");
    const queueMetaEl = document.getElementById("converterQueueMeta");

    if (!dropZone || !fileInput || !formatEl || !queueEl || !resultsEl) {
        return;
    }

    const state = {
        items: [],
        backendStatus: "checking",
        outputFormat: cleanText(formatEl.value) || "jpg",
        quality: qualityEl ? Number(qualityEl.value) || 88 : 88,
        background: cleanText(backgroundEl && backgroundEl.value) || "#ffffff",
        keepMetadata: keepMetadataEl ? keepMetadataEl.checked === true : false,
        busyCount: 0
    };

    const previewUrls = new Map();
    const outputUrls = new Map();

    function cleanText(value) {
        if (typeof window.AjArtivoCleanText === "function") {
            return window.AjArtivoCleanText(value);
        }

        return String(value || "").trim();
    }

    function isLocalRuntime() {
        const hostname = cleanText(window.location && window.location.hostname).toLowerCase();
        return !hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local");
    }

    function resolveBackendBaseUrl() {
        const configured = cleanText(window.AJARTIVO_BACKEND_URL);
        if (configured) {
            return configured.replace(/\/+$/, "");
        }

        if (typeof window.AjArtivoGetBackendBaseUrl === "function") {
            const base = cleanText(window.AjArtivoGetBackendBaseUrl());
            if (base) {
                return base.replace(/\/+$/, "");
            }
        }

        const meta = document.querySelector('meta[name="ajartivo-backend-url"]');
        if (meta && cleanText(meta.content)) {
            return cleanText(meta.content).replace(/\/+$/, "");
        }

        return isLocalRuntime() ? LOCAL_BACKEND_BASE_URL : LIVE_BACKEND_BASE_URL;
    }

    function getBackendCandidates() {
        const ordered = [];
        const local = LOCAL_BACKEND_BASE_URL.replace(/\/+$/, "");
        const live = LIVE_BACKEND_BASE_URL.replace(/\/+$/, "");
        const resolved = resolveBackendBaseUrl();

        [resolved, local, live].forEach(function (baseUrl) {
            const normalized = cleanText(baseUrl).replace(/\/+$/, "");
            if (normalized && ordered.indexOf(normalized) < 0) {
                ordered.push(normalized);
            }
        });

        return ordered;
    }

    function resolveFileExtension(format) {
        const normalized = cleanText(format).toLowerCase();
        if (normalized === "jpeg" || normalized === "jpg") {
            return "jpg";
        }

        if (normalized === "tiff") {
            return "tif";
        }

        if (normalized === "heic") {
            return "heic";
        }

        if (normalized === "heif") {
            return "heif";
        }

        return normalized || "jpg";
    }

    function resolveOutputMime(format) {
        const normalized = cleanText(format).toLowerCase();
        if (normalized === "jpg" || normalized === "jpeg") {
            return "image/jpeg";
        }

        if (normalized === "png") {
            return "image/png";
        }

        if (normalized === "webp") {
            return "image/webp";
        }

        if (normalized === "avif") {
            return "image/avif";
        }

        if (normalized === "tiff" || normalized === "tif") {
            return "image/tiff";
        }

        if (normalized === "gif") {
            return "image/gif";
        }

        if (normalized === "heic") {
            return "image/heic";
        }

        if (normalized === "heif") {
            return "image/heif";
        }

        if (normalized === "bmp") {
            return "image/bmp";
        }

        if (normalized === "ico") {
            return "image/vnd.microsoft.icon";
        }

        if (normalized === "svg") {
            return "image/svg+xml";
        }

        return "image/jpeg";
    }

    function getOutputFileName(fileName, format) {
        const safeName = cleanText(fileName).replace(/\.[^.]+$/, "") || "converted-image";
        return `${safeName}.${resolveFileExtension(format)}`;
    }

    function formatBytes(bytes) {
        const value = Number(bytes || 0);
        if (!Number.isFinite(value) || value <= 0) {
            return "0 MB";
        }

        const mb = value / (1024 * 1024);
        if (mb < 0.95) {
            return `${Math.max(0, Math.round(mb * 10) / 10)} MB`;
        }

        return `${Math.max(0, Math.round(mb * 10) / 10)} MB`;
    }

    function safeId() {
        return `img_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    }

    function setStatus(message, tone) {
        if (!statusEl) return;
        statusEl.textContent = cleanText(message);
        statusEl.classList.toggle("is-error", tone === "error");
    }

    function setBackendState(message, tone) {
        if (!backendStateEl) return;
        backendStateEl.textContent = cleanText(message);
        backendStateEl.dataset.state = tone || "info";
    }

    function setBusy(isBusy) {
        if (convertBtn) {
            convertBtn.disabled = Boolean(isBusy);
            convertBtn.textContent = isBusy ? "Working..." : "Start conversion";
        }

        if (clearBtn) {
            clearBtn.disabled = Boolean(isBusy);
        }

        if (pickBtn) {
            pickBtn.disabled = Boolean(isBusy);
        }

        if (addMoreBtn) {
            addMoreBtn.disabled = Boolean(isBusy);
        }
    }

    function updateQualityLabel() {
        if (qualityValueEl) {
            qualityValueEl.textContent = String(state.quality);
        }
    }

    function updateHint() {
        if (!hintEl) {
            return;
        }

        const format = cleanText(state.outputFormat).toLowerCase();
        if (backgroundEl) {
            const backgroundDisabled = format !== "jpg" && format !== "jpeg";
            backgroundEl.disabled = backgroundDisabled;
        }

        const displayFormat = format === "jpeg" ? "JPG" : String(format || "jpg").toUpperCase();
        hintEl.textContent = `${displayFormat} selected.`;
    }

    function updateStats() {
        if (fileCountEl) {
            fileCountEl.textContent = String(state.items.length);
        }

        if (totalSizeEl) {
            const totalSize = state.items.reduce(function (sum, item) {
                return sum + Number(item.file && item.file.size || 0);
            }, 0);
            totalSizeEl.textContent = formatBytes(totalSize);
        }

        if (outputCountEl) {
            const readyCount = state.items.filter(function (item) {
                return item.status === "done";
            }).length;
            outputCountEl.textContent = String(readyCount);
        }

        if (statusCountEl) {
            const doneCount = state.items.filter(function (item) {
                return item.status === "done";
            }).length;
            statusCountEl.textContent = `${doneCount} done`;
        }

        if (progressBarEl) {
            const doneCount = state.items.filter(function (item) {
                return item.status === "done";
            }).length;
            const totalCount = state.items.length || 1;
            const percent = Math.max(0, Math.min(100, Math.round((doneCount / totalCount) * 100)));
            progressBarEl.style.width = `${percent}%`;
        }

        if (queueMetaEl) {
            if (!state.items.length) {
                queueMetaEl.textContent = "Add a photo to start.";
            } else {
                const queued = state.items.filter(function (item) {
                    return item.status === "queued" || item.status === "converting";
                }).length;
                queueMetaEl.textContent = `${state.items.length} file${state.items.length === 1 ? "" : "s"} added, ${queued} waiting.`;
            }
        }

        if (statusMetaEl) {
            const readyCount = state.items.filter(function (item) {
                return item.status === "done";
            }).length;
            const failedCount = state.items.filter(function (item) {
                return item.status === "error";
            }).length;
            if (!state.items.length) {
                statusMetaEl.textContent = "No files yet";
            } else if (failedCount > 0) {
                statusMetaEl.textContent = `${failedCount} need a retry`;
            } else if (readyCount === state.items.length) {
                statusMetaEl.textContent = "All done";
            } else {
                statusMetaEl.textContent = "Working";
            }
        }
    }

    function setBackendOnline(isOnline, detail) {
        state.backendStatus = isOnline ? "online" : "offline";
        if (isOnline) {
            setBackendState("Tools ready", "success");
            if (detail) {
                setStatus(detail, "info");
            }
            return;
        }

        setBackendState("Browser mode", "warning");
        if (detail) {
            setStatus(detail, "info");
        }
    }

    async function probeBackend() {
        const candidates = getBackendCandidates();
        for (let index = 0; index < candidates.length; index += 1) {
            const baseUrl = candidates[index];
            const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
            const timeoutId = controller ? window.setTimeout(function () {
                controller.abort();
            }, BACKEND_HEALTH_TIMEOUT_MS) : null;

            try {
                const response = await fetch(`${baseUrl}/health`, {
                    method: "GET",
                    signal: controller ? controller.signal : undefined,
                    cache: "no-store"
                });

                if (!response.ok) {
                    throw new Error(`Backend returned ${response.status}`);
                }

                setBackendOnline(true, `Backend ready for heavy formats like TIFF.`);
                return;
            } catch (_error) {
                // try next backend candidate
            } finally {
                if (timeoutId) {
                    window.clearTimeout(timeoutId);
                }
            }
        }

        setBackendOnline(false, "Backend unavailable right now. TIFF needs a working backend, but JPG/PNG/WEBP can still use browser mode.");
    }

    function createItem(file) {
        return {
            id: safeId(),
            file: file,
            status: "queued",
            message: "Waiting in queue",
            error: "",
            outputFormat: "",
            previewUrl: "",
            previewState: "loading",
            previewWidth: 0,
            previewHeight: 0,
            outputUrl: "",
            outputName: "",
            backendUsed: false,
            browserUsed: false
        };
    }

    function fileSignature(file) {
        return [cleanText(file && file.name), Number(file && file.size || 0), Number(file && file.lastModified || 0)].join(":");
    }

    function isLikelyImageFile(file) {
        if (!file) return false;
        if (String(file.type || "").toLowerCase().indexOf("image/") === 0) {
            return true;
        }

        return /\.(png|jpe?g|webp|avif|tif|tiff|bmp|gif|ico|svg|heic|heif)$/i.test(String(file.name || ""));
    }

    function revokeObjectUrl(url) {
        if (!url) return;
        try {
            URL.revokeObjectURL(url);
        } catch (_error) {
            // ignore
        }
    }

    function preparePreview(item) {
        if (!item || !item.file) return;

        const url = URL.createObjectURL(item.file);
        previewUrls.set(item.id, url);
        item.previewUrl = url;

        const image = new Image();
        image.onload = function () {
            item.previewState = "ready";
            item.previewWidth = image.naturalWidth || image.width || 0;
            item.previewHeight = image.naturalHeight || image.height || 0;
            render();
        };
        image.onerror = function () {
            item.previewState = "fallback";
            render();
        };
        image.src = url;
    }

    function addFiles(fileList) {
        const files = Array.from(fileList || []).filter(isLikelyImageFile);
        if (!files.length) {
            setStatus("Please choose image files only.", "error");
            return;
        }

        const existing = new Set(state.items.map(function (item) {
            return fileSignature(item.file);
        }));

        files.forEach(function (file) {
            const signature = fileSignature(file);
            if (existing.has(signature)) {
                return;
            }

            const item = createItem(file);
            state.items.push(item);
            existing.add(signature);
            preparePreview(item);
        });

        updateStats();
        render();
        setStatus(`${files.length} file(s) added to the queue.`, "info");
    }

    function clearQueue() {
        state.items.forEach(function (item) {
            revokeObjectUrl(item.previewUrl);
            revokeObjectUrl(item.outputUrl);
        });

        state.items = [];
        previewUrls.clear();
        outputUrls.clear();
        fileInput.value = "";
        setStatus("Queue cleared.", "info");
        updateStats();
        render();
    }

    function removeItem(itemId) {
        const index = state.items.findIndex(function (item) {
            return item.id === itemId;
        });

        if (index < 0) {
            return;
        }

        const item = state.items[index];
        revokeObjectUrl(item.previewUrl);
        revokeObjectUrl(item.outputUrl);
        previewUrls.delete(item.id);
        outputUrls.delete(item.id);
        state.items.splice(index, 1);
        updateStats();
        render();
    }

    function resetResult(item) {
        revokeObjectUrl(item.outputUrl);
        outputUrls.delete(item.id);
        item.outputUrl = "";
        item.outputName = "";
        item.status = "queued";
        item.message = "Ready for conversion";
        item.error = "";
        item.backendUsed = false;
        item.browserUsed = false;
    }

    function loadImageFromFile(file) {
        return new Promise(function (resolve, reject) {
            const url = URL.createObjectURL(file);
            const image = new Image();

            image.onload = function () {
                revokeObjectUrl(url);
                resolve(image);
            };

            image.onerror = function () {
                revokeObjectUrl(url);
                reject(new Error("This file could not be decoded in the browser."));
            };

            image.src = url;
        });
    }

    async function decodeSourceImage(file) {
        if (typeof window.createImageBitmap === "function") {
            try {
                return await window.createImageBitmap(file);
            } catch (_error) {
                // Fall back to the classic image element path.
            }
        }

        return loadImageFromFile(file);
    }

    function canvasToBlob(canvas, mimeType, quality) {
        return new Promise(function (resolve) {
            canvas.toBlob(function (blob) {
                resolve(blob || null);
            }, mimeType, quality);
        });
    }

    function parseHexColor(value) {
        const normalized = cleanText(value).replace(/^#/, "");
        if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(normalized)) {
            return { r: 255, g: 255, b: 255 };
        }

        const hex = normalized.length === 3
            ? normalized.split("").map(function (char) {
                return `${char}${char}`;
            }).join("")
            : normalized;

        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16)
        };
    }

    async function canvasToArrayBuffer(canvas, mimeType) {
        const blob = await canvasToBlob(canvas, mimeType);
        if (!blob) {
            return null;
        }

        return blob.arrayBuffer();
    }

    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        let binary = "";

        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            const chunk = bytes.subarray(offset, offset + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }

        return window.btoa(binary);
    }

    async function encodeSvgBlob(canvas, width, height) {
        const pngBuffer = await canvasToArrayBuffer(canvas, "image/png");
        if (!pngBuffer) {
            throw new Error("Could not build the SVG preview.");
        }

        const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="data:image/png;base64,${arrayBufferToBase64(pngBuffer)}" width="${width}" height="${height}"/></svg>`;
        return new Blob([svg], { type: "image/svg+xml" });
    }

    async function encodeIcoBlob(canvas, width, height) {
        const pngBuffer = await canvasToArrayBuffer(canvas, "image/png");
        if (!pngBuffer) {
            throw new Error("Could not build the ICO file.");
        }

        const pngBytes = new Uint8Array(pngBuffer);
        const headerSize = 6 + 16;
        const buffer = new ArrayBuffer(headerSize + pngBytes.length);
        const view = new DataView(buffer);

        view.setUint16(0, 0, true);
        view.setUint16(2, 1, true);
        view.setUint16(4, 1, true);
        view.setUint8(6, width >= 256 ? 0 : width);
        view.setUint8(7, height >= 256 ? 0 : height);
        view.setUint8(8, 0);
        view.setUint8(9, 0);
        view.setUint16(10, 1, true);
        view.setUint16(12, 32, true);
        view.setUint32(14, pngBytes.length, true);
        view.setUint32(18, headerSize, true);
        new Uint8Array(buffer, headerSize).set(pngBytes);

        return new Blob([buffer], { type: "image/vnd.microsoft.icon" });
    }

    async function encodeBmpBlob(canvas, width, height) {
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Canvas is not available in this browser.");
        }

        const imageData = ctx.getImageData(0, 0, width, height).data;
        const bg = parseHexColor(state.background);
        const rowSize = width * 3;
        const rowPadding = (4 - (rowSize % 4)) % 4;
        const pixelDataSize = (rowSize + rowPadding) * height;
        const fileSize = 54 + pixelDataSize;
        const buffer = new ArrayBuffer(fileSize);
        const view = new DataView(buffer);
        let offset = 54;

        view.setUint8(0, 0x42);
        view.setUint8(1, 0x4d);
        view.setUint32(2, fileSize, true);
        view.setUint32(10, 54, true);
        view.setUint32(14, 40, true);
        view.setInt32(18, width, true);
        view.setInt32(22, height, true);
        view.setUint16(26, 1, true);
        view.setUint16(28, 24, true);
        view.setUint32(30, 0, true);
        view.setUint32(34, pixelDataSize, true);

        for (let y = height - 1; y >= 0; y -= 1) {
            for (let x = 0; x < width; x += 1) {
                const index = (y * width + x) * 4;
                const alpha = imageData[index + 3] / 255;
                const red = Math.round((imageData[index] * alpha) + (bg.r * (1 - alpha)));
                const green = Math.round((imageData[index + 1] * alpha) + (bg.g * (1 - alpha)));
                const blue = Math.round((imageData[index + 2] * alpha) + (bg.b * (1 - alpha)));
                view.setUint8(offset, blue);
                view.setUint8(offset + 1, green);
                view.setUint8(offset + 2, red);
                offset += 3;
            }

            for (let padding = 0; padding < rowPadding; padding += 1) {
                view.setUint8(offset, 0);
                offset += 1;
            }
        }

        return new Blob([buffer], { type: "image/bmp" });
    }

    function applyBackground(ctx, width, height) {
        if (!ctx) return;
        const format = cleanText(state.outputFormat).toLowerCase();
        if (format !== "jpg" && format !== "jpeg") {
            return;
        }

        ctx.save();
        ctx.fillStyle = state.background || "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
    }

    async function convertWithBrowser(file) {
        const format = cleanText(state.outputFormat).toLowerCase();
        const backendOnlyFormats = new Set(["tiff", "tif", "gif", "heic", "heif"]);
        if (backendOnlyFormats.has(format)) {
            throw new Error(`${format.toUpperCase()} export requires the backend converter.`);
        }

        const source = await decodeSourceImage(file);
        const width = Number(source.width || source.naturalWidth || 0);
        const height = Number(source.height || source.naturalHeight || 0);
        if (!width || !height) {
            throw new Error("The browser could not read this image size.");
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Canvas is not available in this browser.");
        }

        applyBackground(ctx, width, height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(source, 0, 0, width, height);

        if (typeof source.close === "function") {
            try {
                source.close();
            } catch (_error) {
                // ignore
            }
        }

        if (format === "svg") {
            return encodeSvgBlob(canvas, width, height);
        }

        if (format === "ico") {
            return encodeIcoBlob(canvas, width, height);
        }

        if (format === "bmp") {
            return encodeBmpBlob(canvas, width, height);
        }

        const mimeType = resolveOutputMime(format);
        const quality = format === "png" ? undefined : Math.max(0.01, Math.min(1, Number(state.quality || 88) / 100));
        const blob = await canvasToBlob(canvas, mimeType, quality);
        if (!blob || !blob.size) {
            throw new Error("Browser export failed for the selected format.");
        }

        return blob;
    }

    async function convertViaBackend(file) {
        const query = new URLSearchParams({
            format: cleanText(state.outputFormat).toLowerCase(),
            quality: String(state.quality),
            name: file.name || "image",
            background: state.background || "#ffffff",
            keepMetadata: state.keepMetadata ? "1" : "0"
        });
        const lastErrors = [];
        const candidates = getBackendCandidates();

        for (let index = 0; index < candidates.length; index += 1) {
            const baseUrl = candidates[index];
            try {
                const response = await fetch(`${baseUrl}/tools/image-convert?${query.toString()}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/octet-stream"
                    },
                    body: file.slice ? file.slice(0, file.size, file.type || "application/octet-stream") : await file.arrayBuffer()
                });

                if (!response.ok) {
                    let errorMessage = `Backend conversion failed (${response.status}).`;
                    try {
                        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
                        if (contentType.indexOf("application/json") >= 0) {
                            const payload = await response.json();
                            if (payload && payload.error) {
                                errorMessage = cleanText(payload.error);
                            }
                        } else {
                            const text = await response.text();
                            if (text) {
                                errorMessage = text.slice(0, 180);
                            }
                        }
                    } catch (_error) {
                        // ignore parse errors
                    }

                    throw new Error(errorMessage);
                }

                setBackendOnline(true, "Backend is working. TIFF conversion is available.");
                return response.blob();
            } catch (error) {
                lastErrors.push(`${baseUrl}: ${cleanText(error && error.message) || "request failed"}`);
            }
        }

        throw new Error(`TIFF conversion needs the backend. Tried: ${lastErrors.join(" | ") || "no backend available"}`);
    }

    async function convertItem(item) {
        if (!item || item.status === "converting") {
            return;
        }

        resetResult(item);
        item.status = "converting";
        item.message = "Sending to converter...";
        item.error = "";
        render();
        updateStats();

        try {
            let blob = null;
            let backendError = null;

            if (state.backendStatus !== "offline") {
                try {
                    blob = await convertViaBackend(item.file);
                    item.backendUsed = true;
                } catch (error) {
                    backendError = error;
                }
            }

            if (!blob) {
                try {
                    blob = await convertWithBrowser(item.file);
                    item.browserUsed = true;
                } catch (browserError) {
                    if (backendError) {
                        throw new Error(`${cleanText(backendError.message)} ${cleanText(browserError.message)}`.trim());
                    }

                    throw browserError;
                }
            }

            const outputName = getOutputFileName(item.file.name, state.outputFormat);
            const outputUrl = URL.createObjectURL(blob);
            outputUrls.set(item.id, outputUrl);

            revokeObjectUrl(item.outputUrl);
            item.outputUrl = outputUrl;
            item.outputName = outputName;
            item.outputFormat = cleanText(state.outputFormat).toLowerCase() || "jpg";
            item.status = "done";
            item.message = item.backendUsed ? "Converted by backend" : "Converted in browser";
            item.error = "";
        } catch (error) {
            item.status = "error";
            item.error = cleanText(error && error.message) || "Conversion failed.";
            item.message = "Conversion failed";
        }

        render();
        updateStats();
    }

    async function convertQueue() {
        if (!state.items.length) {
            fileInput.click();
            return;
        }

        setBusy(true);
        setStatus("Working on files...", "info");

        const total = state.items.length;
        let completed = 0;

        for (let index = 0; index < state.items.length; index += 1) {
            const item = state.items[index];
            await convertItem(item);
            completed += 1;
            if (statusMetaEl) {
                statusMetaEl.textContent = `${completed} of ${total} done`;
            }
        }

        setBusy(false);
        setStatus("All files finished.", "info");
        updateStats();
    }

    async function convertSingle(itemId) {
        const item = state.items.find(function (entry) {
            return entry.id === itemId;
        });

        if (!item) {
            return;
        }

        setBusy(true);
        await convertItem(item);
        setBusy(false);
    }

    async function downloadOutput(itemId) {
        try {
            const item = state.items.find(function (entry) {
                return entry.id === itemId;
            });

            if (!item || !item.outputUrl) {
                return;
            }

            if (window.AjArtivoDownloadAuth && typeof window.AjArtivoDownloadAuth.withDownloadAuth === "function") {
                await window.AjArtivoDownloadAuth.withDownloadAuth(function () {
                    triggerDownloadOutput(item);
                }, {
                    reason: "download",
                    nextPath: `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
                });
                return;
            }

            triggerDownloadOutput(item);
        } catch (error) {
            console.error("Image converter download failed:", error);
            alert("Unable to start the download right now.");
        }
    }

    function triggerDownloadOutput(item) {
        const anchor = document.createElement("a");
        anchor.href = item.outputUrl;
        anchor.download = item.outputName || getOutputFileName(item.file.name, state.outputFormat);
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
    }

    function renderFileCard(item) {
        const subtitleParts = [
            formatBytes(item.file.size),
            item.previewWidth && item.previewHeight ? `${item.previewWidth} x ${item.previewHeight}` : "previewing"
        ].filter(Boolean);
        const statusClass = item.status === "done"
            ? "is-done"
            : item.status === "error"
                ? "is-error"
                : item.status === "converting"
                    ? "is-processing"
                    : "is-waiting";
        const statusLabel = item.status === "done"
            ? "Ready"
            : item.status === "error"
                ? "Failed"
                : item.status === "converting"
                    ? "Converting"
                    : "Waiting";

        return `
            <article class="converter-file-card" data-item-id="${item.id}">
                <div class="converter-file-preview">
                    ${item.previewState === "ready" && item.previewUrl
                        ? `<img src="${item.previewUrl}" alt="${escapeHtml(item.file.name)}">`
                        : `<div class="converter-file-fallback">${escapeHtml(fileFallbackLabel(item.file.name))}</div>`}
                </div>
                <div class="converter-file-meta">
                    <div class="converter-file-title">${escapeHtml(item.file.name)}</div>
                    <div class="converter-file-subtitle">${escapeHtml(subtitleParts.join(" - "))}</div>
                    <span class="converter-status-pill ${statusClass}">${statusLabel}</span>
                    ${item.error ? `<div class="converter-file-subtitle">${escapeHtml(item.error)}</div>` : ""}
                </div>
                <div class="converter-file-actions">
                    <button type="button" class="converter-mini-btn is-primary" data-action="convert" data-item-id="${item.id}">Convert this</button>
                    <button type="button" class="converter-mini-btn" data-action="remove" data-item-id="${item.id}">Delete</button>
                </div>
            </article>
        `;
    }

    function renderResultCard(item) {
        if (item.status !== "done" || !item.outputUrl) {
            return "";
        }

        const sourceLabel = item.backendUsed
            ? "Processed by backend"
            : "Processed in browser";
        const outputFormat = cleanText(item.outputFormat) || cleanText(state.outputFormat);

        return `
            <article class="converter-result-card" data-item-id="${item.id}">
                <div class="converter-result-preview">
                    <img src="${item.outputUrl}" alt="${escapeHtml(item.outputName || item.file.name)}">
                </div>
                <div class="converter-result-meta">
                    <div class="converter-result-title">${escapeHtml(item.outputName || item.file.name)}</div>
                    <div class="converter-result-subtitle">${escapeHtml(sourceLabel)} - ${escapeHtml(resolveOutputMime(outputFormat))}</div>
                    <span class="converter-status-pill is-done">Ready to download</span>
                </div>
                <div class="converter-result-actions">
                    <a class="converter-mini-btn is-primary" href="#" data-action="download" data-item-id="${item.id}" data-download-name="${escapeHtml(item.outputName || getOutputFileName(item.file.name, outputFormat))}">Download</a>
                    <button type="button" class="converter-mini-btn" data-action="reconvert" data-item-id="${item.id}">Reconvert</button>
                    <button type="button" class="converter-mini-btn" data-action="remove" data-item-id="${item.id}">Delete</button>
                </div>
            </article>
        `;
    }

    function fileFallbackLabel(name) {
        const ext = String(name || "").split(".").pop().toUpperCase();
        return ext ? `${ext}\nPreview` : "Image\nPreview";
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function render() {
        updateQualityLabel();
        updateHint();
        updateStats();

        const hasFiles = state.items.length > 0;
        const hasResults = state.items.some(function (item) {
            return item.status === "done" && item.outputUrl;
        });

        if (queuePanelEl) {
            queuePanelEl.classList.toggle("is-hidden", !hasFiles);
        }

        if (resultsPanelEl) {
            resultsPanelEl.classList.toggle("is-hidden", !hasResults);
        }

        if (queueEl) {
            if (state.items.length) {
                queueEl.innerHTML = state.items.map(renderFileCard).join("");
            } else {
                queueEl.innerHTML = "";
            }
        }

        if (resultsEl) {
            const results = state.items.filter(function (item) {
                return item.status === "done" && item.outputUrl;
            });

            if (results.length) {
                resultsEl.innerHTML = results.map(renderResultCard).join("");
            } else {
                resultsEl.innerHTML = "";
            }
        }
    }

    function setListeners() {
        dropZone.addEventListener("dragover", function (event) {
            event.preventDefault();
            dropZone.classList.add("is-active");
        });

        dropZone.addEventListener("dragleave", function () {
            dropZone.classList.remove("is-active");
        });

        dropZone.addEventListener("drop", function (event) {
            event.preventDefault();
            dropZone.classList.remove("is-active");
            addFiles(event.dataTransfer ? event.dataTransfer.files : []);
        });

        dropZone.addEventListener("click", function (event) {
            const target = event && event.target ? event.target : null;
            const tagName = target && target.tagName ? String(target.tagName).toUpperCase() : "";
            if (tagName === "BUTTON" || tagName === "A" || tagName === "INPUT" || tagName === "SELECT") {
                return;
            }

            fileInput.click();
        });

        dropZone.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInput.click();
            }
        });

        if (pickBtn) {
            pickBtn.addEventListener("click", function () {
                fileInput.click();
            });
        }

        if (resultsEl) {
            resultsEl.addEventListener("click", function (event) {
                const trigger = event && event.target ? event.target.closest('[data-action="download"]') : null;
                if (!trigger) {
                    return;
                }

                event.preventDefault();
                downloadOutput(cleanText(trigger.getAttribute("data-item-id")));
            });
        }

        if (addMoreBtn) {
            addMoreBtn.addEventListener("click", function () {
                fileInput.click();
            });
        }

        if (convertBtn) {
            convertBtn.addEventListener("click", function () {
                convertQueue();
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener("click", function () {
                clearQueue();
            });
        }

        if (fileInput) {
            fileInput.addEventListener("change", function () {
                addFiles(fileInput.files || []);
                fileInput.value = "";
            });
        }

        if (formatEl) {
            formatEl.addEventListener("change", function () {
                state.outputFormat = cleanText(formatEl.value) || "jpg";
                render();
            });
        }

        if (qualityEl) {
            qualityEl.addEventListener("input", function () {
                state.quality = Number(qualityEl.value) || 88;
                updateQualityLabel();
                updateHint();
            });
        }

        if (backgroundEl) {
            backgroundEl.addEventListener("input", function () {
                state.background = cleanText(backgroundEl.value) || "#ffffff";
            });
        }

        if (keepMetadataEl) {
            keepMetadataEl.addEventListener("change", function () {
                state.keepMetadata = keepMetadataEl.checked === true;
            });
        }

        queueEl.addEventListener("click", function (event) {
            const target = event.target && event.target.closest ? event.target.closest("[data-action][data-item-id]") : null;
            if (!target) return;

            const action = cleanText(target.getAttribute("data-action"));
            const itemId = cleanText(target.getAttribute("data-item-id"));

            if (action === "convert") {
                convertSingle(itemId);
            } else if (action === "remove") {
                removeItem(itemId);
            }
        });

        resultsEl.addEventListener("click", function (event) {
            const target = event.target && event.target.closest ? event.target.closest("[data-action][data-item-id]") : null;
            if (!target) return;

            const action = cleanText(target.getAttribute("data-action"));
            const itemId = cleanText(target.getAttribute("data-item-id"));

            if (action === "remove") {
                removeItem(itemId);
            } else if (action === "reconvert") {
                const item = state.items.find(function (entry) {
                    return entry.id === itemId;
                });

                if (!item) return;
                resetResult(item);
                render();
                convertSingle(itemId);
            }
        });

        window.addEventListener("beforeunload", function () {
            state.items.forEach(function (item) {
                revokeObjectUrl(item.previewUrl);
                revokeObjectUrl(item.outputUrl);
            });
        });
    }

    function initialize() {
        updateQualityLabel();
        updateHint();
        render();
        setListeners();
        probeBackend();
        setBackendState("Checking tools...", "info");
        setStatus("Ready. Add files to begin.", "info");
    }

    initialize();
})();
