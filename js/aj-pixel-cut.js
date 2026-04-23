(function () {
    "use strict";

    const LOCAL_BACKEND_BASE_URL = "http://localhost:5000";
    const LIVE_BACKEND_BASE_URL = "https://ajartivo-backend.onrender.com";
    const HISTORY_KEY = "ajpc_history_v1";
    const USAGE_KEY = "ajpc_usage_v1";

    const dropZone = document.getElementById("ajPixelCutDrop");
    const fileInput = document.getElementById("ajPixelCutFile");
    const runButton = document.getElementById("ajPixelCutRun");
    const statusEl = document.getElementById("ajPixelCutStatus");
    const metaEl = document.getElementById("ajPixelCutMeta");
    const beforeImgEl = document.getElementById("ajPixelCutBeforeImage");
    const afterCanvasEl = document.getElementById("ajPixelCutAfterCanvas");
    const resetBtn = document.getElementById("ajPixelCutReset");
    const downloadBtn = document.getElementById("ajPixelCutDownloadBtn");
    const downloadEl = document.getElementById("ajPixelCutDownload");
    const bgColorEl = document.getElementById("ajPixelCutBgColor");
    const lightToggleEl = document.getElementById("ajPixelCutLightToggle");
    const refineToggleEl = document.getElementById("ajPixelCutRefineToggle");
    const refinePanelEl = document.getElementById("ajPixelCutRefinePanel");
    const refineEraseEl = document.getElementById("ajPixelCutRefineErase");
    const refineRestoreEl = document.getElementById("ajPixelCutRefineRestore");
    const brushSizeEl = document.getElementById("ajPixelCutBrushSize");
    const refineResetEl = document.getElementById("ajPixelCutRefineReset");
    const resizeToggleEl = document.getElementById("ajPixelCutResizeToggle");
    const resizePanelEl = document.getElementById("ajPixelCutResizePanel");
    const widthEl = document.getElementById("ajPixelCutWidth");
    const heightEl = document.getElementById("ajPixelCutHeight");
    const lockRatioEl = document.getElementById("ajPixelCutLockRatio");
    const applyResizeEl = document.getElementById("ajPixelCutApplyResize");
    const editMoreEl = document.getElementById("ajPixelCutEditMore");

    if (!dropZone || !fileInput || !runButton || !statusEl || !metaEl || !beforeImgEl || !afterCanvasEl || !downloadBtn || !downloadEl) {
        return;
    }

    const quotaTextEl = document.getElementById("ajPixelCutQuotaText");
    const usageTextEl = document.getElementById("ajPixelCutUsageText");
    const usageBarEl = document.getElementById("ajPixelCutUsageBar");
    const historyListEl = document.getElementById("ajPixelCutHistoryList");
    const historyMoreEl = document.getElementById("ajPixelCutHistoryMore");
    const afterCtx = afterCanvasEl.getContext("2d", { willReadFrequently: true });
    if (!afterCtx) return;

    let selectedFile = null;
    let selectedFileUrl = "";
    let outputUrl = "";
    let backgroundColor = "";
    let refineEnabled = false;
    let refineMode = "erase";
    let brushSize = 24;
    let isDrawing = false;
    let drawRect = { x: 0, y: 0, w: 0, h: 0 };
    let sourceCutoutCanvas = null;
    let workingCutoutCanvas = null;
    let exportSize = { width: 0, height: 0 };
    let baseRatio = 1;

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
        if (downloadBtn) downloadBtn.disabled = Boolean(isBusy);
    }

    function safeParseJson(raw, fallback) {
        try {
            const parsed = JSON.parse(raw);
            return parsed == null ? fallback : parsed;
        } catch (_error) {
            return fallback;
        }
    }

    function readLocal(key, fallback) {
        if (!key) return fallback;
        try {
            const raw = window.localStorage.getItem(key);
            if (!raw) return fallback;
            return safeParseJson(raw, fallback);
        } catch (_error) {
            return fallback;
        }
    }

    function writeLocal(key, value) {
        if (!key) return;
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch (_error) {
            // ignore write errors
        }
    }

    function clampNumber(value, min, max) {
        const num = Number(value);
        if (!Number.isFinite(num)) return min;
        return Math.min(max, Math.max(min, num));
    }

    function formatMb(bytes) {
        const mb = Number(bytes || 0) / (1024 * 1024);
        if (mb < 0.95) return `${Math.max(0, Math.round(mb * 10) / 10)} MB`;
        return `${Math.max(0, Math.round(mb))} MB`;
    }

    function formatDate(ts) {
        const date = new Date(Number(ts || 0));
        if (Number.isNaN(date.getTime())) return "";
        return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }

    function resizeCanvasToDisplaySize(canvas) {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
        const w = Math.max(2, Math.floor(rect.width * dpr));
        const h = Math.max(2, Math.floor(rect.height * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        return { width: w, height: h };
    }

    function computeContainRect(containerW, containerH, contentW, contentH) {
        if (!contentW || !contentH) return { x: 0, y: 0, w: containerW, h: containerH };
        const scale = Math.min(containerW / contentW, containerH / contentH);
        const w = contentW * scale;
        const h = contentH * scale;
        return { x: (containerW - w) / 2, y: (containerH - h) / 2, w, h };
    }

    function syncExportInputs() {
        if (!widthEl || !heightEl) return;
        if (!exportSize.width || !exportSize.height) return;
        widthEl.value = String(Math.round(exportSize.width));
        heightEl.value = String(Math.round(exportSize.height));
    }

    function renderAfter() {
        const size = resizeCanvasToDisplaySize(afterCanvasEl);
        afterCtx.clearRect(0, 0, size.width, size.height);

        if (!workingCutoutCanvas) {
            afterCtx.fillStyle = "rgba(255,255,255,0.72)";
            afterCtx.font = `${Math.max(14, Math.round(size.width / 44))}px sans-serif`;
            afterCtx.textAlign = "center";
            afterCtx.textBaseline = "middle";
            afterCtx.fillText("After preview", size.width / 2, size.height / 2);
            drawRect = { x: 0, y: 0, w: 0, h: 0 };
            return;
        }

        if (backgroundColor) {
            afterCtx.fillStyle = backgroundColor;
            afterCtx.fillRect(0, 0, size.width, size.height);
        }

        const targetW = exportSize.width || workingCutoutCanvas.width;
        const targetH = exportSize.height || workingCutoutCanvas.height;
        drawRect = computeContainRect(size.width, size.height, targetW, targetH);
        afterCtx.imageSmoothingEnabled = true;
        afterCtx.imageSmoothingQuality = "high";
        afterCtx.drawImage(workingCutoutCanvas, drawRect.x, drawRect.y, drawRect.w, drawRect.h);
    }

    function revokeUrl(url) {
        if (!url) return;
        try {
            URL.revokeObjectURL(url);
        } catch (_error) {
            // ignore
        }
    }

    function resetOutput() {
        revokeUrl(outputUrl);
        outputUrl = "";
        sourceCutoutCanvas = null;
        workingCutoutCanvas = null;
        exportSize = { width: 0, height: 0 };
        renderAfter();
    }

    function updateSelectedFile(file) {
        selectedFile = file || null;

        revokeUrl(selectedFileUrl);
        selectedFileUrl = "";
        beforeImgEl.classList.remove("is-visible");
        beforeImgEl.removeAttribute("src");
        resetOutput();

        if (!selectedFile) {
            setMeta("No file selected.");
            return;
        }

        selectedFileUrl = URL.createObjectURL(selectedFile);
        beforeImgEl.src = selectedFileUrl;
        beforeImgEl.classList.add("is-visible");
        setMeta(`${selectedFile.name} - ${Math.max(1, Math.round(selectedFile.size / 1024))} KB`);

        const probe = new Image();
        probe.onload = () => {
            const w = probe.naturalWidth || 1;
            const h = probe.naturalHeight || 1;
            baseRatio = w / h;
            if (!exportSize.width || !exportSize.height) {
                exportSize = { width: w, height: h };
                syncExportInputs();
                renderAfter();
            }
        };
        probe.src = selectedFileUrl;
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

        dropZone.addEventListener("click", (event) => {
            const target = event && event.target ? event.target : null;
            const tag = target && target.tagName ? String(target.tagName).toUpperCase() : "";
            if (tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "LABEL" || tag === "CANVAS") {
                return;
            }
            fileInput.click();
        });

        dropZone.addEventListener("keydown", (event) => {
            if (!event) return;
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInput.click();
            }
        });
    }

    function readUsage() {
        const usage = readLocal(USAGE_KEY, { count: 0, bytes: 0 });
        return {
            count: Math.max(0, Number(usage && usage.count || 0)),
            bytes: Math.max(0, Number(usage && usage.bytes || 0))
        };
    }

    function bumpUsage(file) {
        const usage = readUsage();
        const next = {
            count: usage.count + 1,
            bytes: usage.bytes + Math.max(0, Number(file && file.size || 0))
        };
        writeLocal(USAGE_KEY, next);
        return next;
    }

    function readHistory() {
        const history = readLocal(HISTORY_KEY, []);
        return Array.isArray(history) ? history : [];
    }

    function writeHistory(items) {
        writeLocal(HISTORY_KEY, Array.isArray(items) ? items : []);
    }

    function pushHistory(item) {
        const items = readHistory();
        const next = [item].concat(items).slice(0, 12);
        writeHistory(next);
        return next;
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function renderHistory() {
        if (!historyListEl) return;

        const items = readHistory();
        const visible = items.slice(0, 3);
        const remaining = Math.max(0, items.length - visible.length);

        if (historyMoreEl) {
            historyMoreEl.textContent = remaining ? `+ ${remaining} more` : "";
        }

        if (!visible.length) {
            historyListEl.innerHTML = `<div class="ajpc-history-item"><div class="ajpc-history-thumb"></div><div class="ajpc-history-copy"><strong>No exports yet</strong><span>Remove a background to see history.</span></div></div>`;
            return;
        }

        historyListEl.innerHTML = visible.map((item) => {
            const name = cleanText(item && item.name);
            const date = formatDate(item && item.ts);
            const thumb = cleanText(item && item.thumb);
            const thumbHtml = thumb ? `<img src="${escapeHtml(thumb)}" alt="">` : "";
            return `
                <div class="ajpc-history-item">
                    <div class="ajpc-history-thumb">${thumbHtml}</div>
                    <div class="ajpc-history-copy">
                        <strong>${escapeHtml(name || "Export")}</strong>
                        <span>${escapeHtml(date || "Just now")}</span>
                    </div>
                </div>
            `;
        }).join("");
    }

    function renderUsage() {
        const usage = readUsage();
        const quotaMax = 3;
        const bytesMax = 200 * 1024 * 1024;

        if (quotaTextEl) {
            quotaTextEl.textContent = `${Math.min(usage.count, quotaMax)} / ${quotaMax} completed`;
        }

        if (usageTextEl) {
            usageTextEl.textContent = `${formatMb(usage.bytes)} of ${formatMb(bytesMax)}`;
        }

        if (usageBarEl) {
            const percentQuota = quotaMax ? usage.count / quotaMax : 0;
            const percentBytes = bytesMax ? usage.bytes / bytesMax : 0;
            const percent = clampNumber(Math.max(percentQuota, percentBytes) * 100, 0, 100);
            usageBarEl.style.width = `${percent}%`;
        }
    }

    function fileToThumbDataUrl(file) {
        if (!file) return Promise.resolve("");

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onerror = () => resolve("");
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    const targetW = 172;
                    const targetH = 108;
                    const canvas = document.createElement("canvas");
                    canvas.width = targetW;
                    canvas.height = targetH;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) return resolve("");
                    ctx.fillStyle = "#0b1024";
                    ctx.fillRect(0, 0, targetW, targetH);

                    const scale = Math.max(targetW / img.width, targetH / img.height);
                    const drawW = img.width * scale;
                    const drawH = img.height * scale;
                    const dx = (targetW - drawW) / 2;
                    const dy = (targetH - drawH) / 2;
                    ctx.drawImage(img, dx, dy, drawW, drawH);
                    resolve(canvas.toDataURL("image/jpeg", 0.72));
                };
                img.onerror = () => resolve("");
                img.src = String(reader.result || "");
            };
            reader.readAsDataURL(file);
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

            resetOutput();
            outputUrl = URL.createObjectURL(blob);

            const img = new Image();
            img.decoding = "async";
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = outputUrl;
            });

            const w = Math.max(1, img.naturalWidth || img.width || 1);
            const h = Math.max(1, img.naturalHeight || img.height || 1);

            sourceCutoutCanvas = document.createElement("canvas");
            sourceCutoutCanvas.width = w;
            sourceCutoutCanvas.height = h;
            const sctx = sourceCutoutCanvas.getContext("2d");
            if (!sctx) throw new Error("Canvas not available");
            sctx.drawImage(img, 0, 0);

            workingCutoutCanvas = document.createElement("canvas");
            workingCutoutCanvas.width = w;
            workingCutoutCanvas.height = h;
            const wctx = workingCutoutCanvas.getContext("2d");
            if (!wctx) throw new Error("Canvas not available");
            wctx.drawImage(img, 0, 0);

            exportSize = { width: w, height: h };
            baseRatio = w / h;
            syncExportInputs();
            renderAfter();
            setStatus("Done. Use background + refine + resize on right.", "info");

            bumpUsage(selectedFile);
            renderUsage();

            const thumb = await fileToThumbDataUrl(selectedFile);
            pushHistory({
                ts: Date.now(),
                name: selectedFile && selectedFile.name ? String(selectedFile.name) : "Export",
                thumb
            });
            renderHistory();
            } catch (error) {
            setStatus(cleanText(error && error.message) || "Network error. Please try again.", "error");
        } finally {
            setBusy(false);
        }
    }

    function setBackgroundColor(next) {
        backgroundColor = cleanText(next);
        renderAfter();
    }

    function setLightOn(isOn) {
        document.body.classList.toggle("ajpc-is-light", Boolean(isOn));
    }

    function togglePanel(panelEl) {
        if (!panelEl) return;
        if (panelEl.hasAttribute("hidden")) {
            panelEl.removeAttribute("hidden");
        } else {
            panelEl.setAttribute("hidden", "");
        }
    }

    function setActiveSeg(activeEl, inactiveEl) {
        if (activeEl) activeEl.classList.add("is-active");
        if (inactiveEl) inactiveEl.classList.remove("is-active");
    }

    function updateOtherDimension(changed) {
        if (!lockRatioEl || !lockRatioEl.checked) return;
        if (!widthEl || !heightEl) return;
        if (!baseRatio || !Number.isFinite(baseRatio)) return;

        const w = Number(widthEl.value || 0);
        const h = Number(heightEl.value || 0);
        if (changed === "w" && w > 0) {
            heightEl.value = String(Math.max(16, Math.round(w / baseRatio)));
        } else if (changed === "h" && h > 0) {
            widthEl.value = String(Math.max(16, Math.round(h * baseRatio)));
        }
    }

    function applyResize() {
        if (!workingCutoutCanvas) return;
        const w = Math.max(16, Number(widthEl && widthEl.value || 0));
        const h = Math.max(16, Number(heightEl && heightEl.value || 0));
        exportSize = { width: w, height: h };
        renderAfter();
    }

    function downloadCurrent() {
        if (!workingCutoutCanvas) {
            setStatus("Remove background first.", "error");
            return;
        }

        const w = Math.max(1, Math.round(exportSize.width || workingCutoutCanvas.width));
        const h = Math.max(1, Math.round(exportSize.height || workingCutoutCanvas.height));

        const out = document.createElement("canvas");
        out.width = w;
        out.height = h;
        const octx = out.getContext("2d");
        if (!octx) return;

        if (backgroundColor) {
            octx.fillStyle = backgroundColor;
            octx.fillRect(0, 0, w, h);
        }

        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = "high";
        octx.drawImage(workingCutoutCanvas, 0, 0, w, h);

        out.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            downloadEl.href = url;
            downloadEl.download = "output.png";
            downloadEl.click();
            window.setTimeout(() => revokeUrl(url), 1200);
        }, "image/png");
    }

    function mapPointerToImage(event) {
        if (!workingCutoutCanvas) return null;
        if (!drawRect || !drawRect.w || !drawRect.h) return null;

        const rect = afterCanvasEl.getBoundingClientRect();
        const px = (event.clientX - rect.left) * (afterCanvasEl.width / rect.width);
        const py = (event.clientY - rect.top) * (afterCanvasEl.height / rect.height);

        if (px < drawRect.x || py < drawRect.y || px > drawRect.x + drawRect.w || py > drawRect.y + drawRect.h) {
            return null;
        }

        const nx = (px - drawRect.x) / drawRect.w;
        const ny = (py - drawRect.y) / drawRect.h;
        return { x: nx * workingCutoutCanvas.width, y: ny * workingCutoutCanvas.height };
    }

    function paintAt(event) {
        if (!refineEnabled) return;
        if (!workingCutoutCanvas || !sourceCutoutCanvas) return;
        const point = mapPointerToImage(event);
        if (!point) return;
        const wctx = workingCutoutCanvas.getContext("2d");
        if (!wctx) return;

        const radius = Math.max(2, Number(brushSize) || 24);

        if (refineMode === "restore") {
            wctx.save();
            wctx.beginPath();
            wctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
            wctx.clip();
            wctx.globalCompositeOperation = "source-over";
            wctx.drawImage(sourceCutoutCanvas, 0, 0);
            wctx.restore();
        } else {
            wctx.save();
            wctx.globalCompositeOperation = "destination-out";
            wctx.beginPath();
            wctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
            wctx.fill();
            wctx.restore();
        }

        renderAfter();
    }

    function initRefineHandlers() {
        afterCanvasEl.style.touchAction = "none";

        afterCanvasEl.addEventListener("pointerdown", (event) => {
            if (!refineEnabled) return;
            isDrawing = true;
            try {
                afterCanvasEl.setPointerCapture(event.pointerId);
            } catch (_error) {
                // ignore
            }
            paintAt(event);
        });

        afterCanvasEl.addEventListener("pointermove", (event) => {
            if (!isDrawing) return;
            paintAt(event);
        });

        function stop(event) {
            if (!isDrawing) return;
            isDrawing = false;
            try {
                afterCanvasEl.releasePointerCapture(event.pointerId);
            } catch (_error) {
                // ignore
            }
        }

        afterCanvasEl.addEventListener("pointerup", stop);
        afterCanvasEl.addEventListener("pointercancel", stop);
        afterCanvasEl.addEventListener("pointerleave", () => { isDrawing = false; });
    }

    function wireControls() {
        document.querySelectorAll("[data-ajpc-bg]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const value = btn.getAttribute("data-ajpc-bg");
                if (value === "transparent") {
                    setBackgroundColor("");
                } else {
                    setBackgroundColor(value);
                }
            });
        });

        if (bgColorEl) {
            bgColorEl.addEventListener("input", () => setBackgroundColor(bgColorEl.value));
        }

        if (lightToggleEl) {
            lightToggleEl.addEventListener("change", () => setLightOn(lightToggleEl.checked));
        }

        if (refineToggleEl && refinePanelEl) {
            refineToggleEl.addEventListener("click", () => {
                togglePanel(refinePanelEl);
                refineEnabled = !refinePanelEl.hasAttribute("hidden");
                afterCanvasEl.style.cursor = refineEnabled ? "crosshair" : "default";
            });
        }

        if (refineEraseEl && refineRestoreEl) {
            refineEraseEl.addEventListener("click", () => {
                refineMode = "erase";
                setActiveSeg(refineEraseEl, refineRestoreEl);
            });
            refineRestoreEl.addEventListener("click", () => {
                refineMode = "restore";
                setActiveSeg(refineRestoreEl, refineEraseEl);
            });
        }

        if (brushSizeEl) {
            brushSizeEl.addEventListener("input", () => {
                brushSize = Math.max(2, Number(brushSizeEl.value) || 24);
            });
        }

        if (refineResetEl) {
            refineResetEl.addEventListener("click", () => {
                if (!workingCutoutCanvas || !sourceCutoutCanvas) return;
                const wctx = workingCutoutCanvas.getContext("2d");
                if (!wctx) return;
                wctx.clearRect(0, 0, workingCutoutCanvas.width, workingCutoutCanvas.height);
                wctx.drawImage(sourceCutoutCanvas, 0, 0);
                renderAfter();
            });
        }

        if (resizeToggleEl && resizePanelEl) {
            resizeToggleEl.addEventListener("click", () => togglePanel(resizePanelEl));
        }

        if (widthEl) widthEl.addEventListener("input", () => updateOtherDimension("w"));
        if (heightEl) heightEl.addEventListener("input", () => updateOtherDimension("h"));
        if (applyResizeEl) applyResizeEl.addEventListener("click", applyResize);

        if (downloadBtn) downloadBtn.addEventListener("click", downloadCurrent);

        if (resetBtn) {
            resetBtn.addEventListener("click", () => {
                resetOutput();
                setStatus("Output cleared.", "info");
            });
        }

        if (editMoreEl) {
            editMoreEl.addEventListener("click", () => {
                if (refinePanelEl) refinePanelEl.removeAttribute("hidden");
                if (resizePanelEl) resizePanelEl.removeAttribute("hidden");
                refineEnabled = true;
                afterCanvasEl.style.cursor = "crosshair";
            });
        }
    }

    bindDropZone();
    initRefineHandlers();
    wireControls();

    fileInput.addEventListener("change", () => {
        const file = fileInput.files ? fileInput.files[0] : null;
        updateSelectedFile(file);
    });

    runButton.addEventListener("click", uploadAndRemoveBackground);

    window.addEventListener("resize", () => renderAfter());

    updateSelectedFile(null);
    setBackgroundColor("");
    setLightOn(false);
    setStatus("Ready.", "info");

    renderUsage();
    renderHistory();
})();
