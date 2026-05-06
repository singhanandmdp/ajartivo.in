(function () {
    const services = window.AjArtivoSupabase;
    if (!services) return;

    const BASE_URL = typeof window.AjArtivoGetBackendBaseUrl === "function"
        ? window.AjArtivoGetBackendBaseUrl()
        : "";
    const ui = {
        imageInput: document.getElementById("toolsImageInput"),
        originalCanvas: document.getElementById("toolsOriginalCanvas"),
        resultCanvas: document.getElementById("toolsResultCanvas"),
        planName: document.getElementById("toolsPlanName"),
        planMeta: document.getElementById("toolsPlanMeta"),
        usageRemaining: document.getElementById("toolsUsageRemaining"),
        printLimit: document.getElementById("toolsPrintLimit"),
        status: document.getElementById("toolsStatus"),
        downloadResultBtn: document.getElementById("downloadResultBtn"),
        layoutSummary: document.getElementById("layoutSummary"),
        bgTolerance: document.getElementById("bgTolerance"),
        enhanceScale: document.getElementById("enhanceScale"),
        resizeWidth: document.getElementById("resizeWidth"),
        resizeHeight: document.getElementById("resizeHeight"),
        resizeLockRatio: document.getElementById("resizeLockRatio"),
        convertFormat: document.getElementById("convertFormat"),
        convertQuality: document.getElementById("convertQuality"),
        paperPreset: document.getElementById("paperPreset"),
        layoutWidth: document.getElementById("layoutWidth"),
        layoutHeight: document.getElementById("layoutHeight"),
        layoutGap: document.getElementById("layoutGap"),
        customPaperWidth: document.getElementById("customPaperWidth"),
        customPaperHeight: document.getElementById("customPaperHeight"),
        runBgCut: document.getElementById("runBgCut"),
        runEnhancer: document.getElementById("runEnhancer"),
        runResizer: document.getElementById("runResizer"),
        runConverter: document.getElementById("runConverter"),
        runLayout: document.getElementById("runLayout")
    };
    const state = {
        sourceImage: null,
        lastMimeType: "image/png",
        lastFileName: "ajartivo-tool-output.png",
        busy: false
    };

    if (!ui.imageInput || !ui.originalCanvas || !ui.resultCanvas) return;

    init();

    function init() {
        bindEvents();
        refreshToolSummary();
        primeCanvas(ui.originalCanvas, "Upload image");
        primeCanvas(ui.resultCanvas, "Tool output");
    }

    function bindEvents() {
        ui.imageInput.addEventListener("change", handleImageSelection);
        ui.downloadResultBtn.addEventListener("click", downloadCurrentOutput);
        ui.runBgCut.addEventListener("click", function () {
            runTool("background_remover", function () {
                renderBackgroundCut();
            });
        });
        ui.runEnhancer.addEventListener("click", function () {
            runTool("image_enhancer", function () {
                renderEnhancedImage();
            });
        });
        ui.runResizer.addEventListener("click", function () {
            runTool("image_resizer", function () {
                renderResizedImage();
            });
        });
        ui.runConverter.addEventListener("click", function () {
            runTool("image_converter", function () {
                renderConvertedImage();
            });
        });
        ui.runLayout.addEventListener("click", function () {
            runTool("print_layout_pro", function () {
                renderPrintLayout();
            });
        });
        ui.resizeWidth.addEventListener("input", syncResizeHeight);
        ui.paperPreset.addEventListener("change", syncPaperPreset);
    }

    async function handleImageSelection(event) {
        const file = event.target && event.target.files && event.target.files[0] ? event.target.files[0] : null;
        if (!file) return;

        try {
            const imageBitmap = await loadBitmap(file);
            state.sourceImage = imageBitmap;
            state.lastFileName = normalizeFileName(file.name, "png");
            state.lastMimeType = "image/png";
            drawImageToCanvas(imageBitmap, ui.originalCanvas, imageBitmap.width, imageBitmap.height);
            drawImageToCanvas(imageBitmap, ui.resultCanvas, imageBitmap.width, imageBitmap.height);
            setStatus(`Loaded ${file.name}. Choose a tool to process it.`, "success");
            ui.layoutSummary.textContent = `${imageBitmap.width} × ${imageBitmap.height}px source image ready.`;
            if (!ui.resizeWidth.value) ui.resizeWidth.value = imageBitmap.width;
            if (!ui.resizeHeight.value) ui.resizeHeight.value = imageBitmap.height;
        } catch (error) {
            setStatus(error && error.message ? error.message : "Could not open this image.", "error");
        } finally {
            ui.imageInput.value = "";
        }
    }

    async function runTool(toolId, renderer) {
        if (state.busy) return;
        if (!state.sourceImage) {
            setStatus("Upload an image before using designer tools.", "error");
            return;
        }

        state.busy = true;
        toggleButtons(true);
        setStatus("Checking tool access...", "success");

        try {
            await ensureToolAccess(toolId);
            renderer();
            await refreshToolSummary();
        } catch (error) {
            setStatus(error && error.message ? error.message : "Tool run failed.", "error");
        } finally {
            state.busy = false;
            toggleButtons(false);
        }
    }

    async function ensureToolAccess(toolId) {
        const authSession = await services.getAuthSession({ sync: true });
        if (!authSession || !authSession.user || !cleanText(authSession.access_token)) {
            if (window.AjArtivoAuthModal && typeof window.AjArtivoAuthModal.open === "function") {
                await window.AjArtivoAuthModal.open({
                    reason: "login",
                    redirectOnSuccess: false
                });
            }
        }

        const nextSession = await services.getAuthSession({ sync: true });
        if (!nextSession || !nextSession.user || !cleanText(nextSession.access_token)) {
            throw new Error("Login is required to use designer tools.");
        }

        const response = await fetch(`${BASE_URL}/tools/consume`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${cleanText(nextSession.access_token)}`
            },
            body: JSON.stringify({
                tool_id: toolId
            })
        });

        const payload = await response.json().catch(function () {
            return {};
        });

        if (!response.ok) {
            throw new Error(cleanText(payload && payload.error) || "Tool access request failed.");
        }

        if (payload && payload.account) {
            syncSessionAccount(payload.account);
            renderToolSummary(payload.account);
        }
    }

    async function refreshToolSummary() {
        try {
            const authSession = await services.getAuthSession({ sync: true });
            if (!authSession || !authSession.user || !cleanText(authSession.access_token)) {
                renderToolSummary(null);
                return;
            }

            const response = await fetch(`${BASE_URL}/tools/summary`, {
                headers: {
                    "Authorization": `Bearer ${cleanText(authSession.access_token)}`
                }
            });
            const payload = await response.json().catch(function () {
                return {};
            });
            if (!response.ok) {
                throw new Error(cleanText(payload && payload.error) || "Could not load tool summary.");
            }

            syncSessionAccount(payload.account || null);
            renderToolSummary(payload.account || null);
        } catch (error) {
            renderToolSummary(null);
            setStatus(error && error.message ? error.message : "Could not load tool summary.", "error");
        }
    }

    function renderToolSummary(account) {
        const summary = account || {};
        const planName = cleanText(summary.active_plan_name) || "Free";
        const premiumActive = summary.premium_active === true;
        const remaining = Number(summary.ai_remaining_today || 0);
        const dailyLimit = Number(summary.daily_ai_limit || 0);

        ui.planName.textContent = planName;
        ui.planMeta.textContent = premiumActive
            ? (dailyLimit < 0 ? "Unlimited designer tool access today." : `${remaining} of ${dailyLimit} tool runs left today.`)
            : "Free users get limited tool runs. Login to start.";
        ui.usageRemaining.textContent = dailyLimit < 0 ? "Unlimited" : String(remaining);
        ui.printLimit.textContent = cleanText(summary.print_layout_limit) || "Starter";
    }

    function renderBackgroundCut() {
        const tolerance = Number(ui.bgTolerance.value || 70);
        const sourceCanvas = imageToCanvas(state.sourceImage);
        const context = sourceCanvas.getContext("2d");
        const imageData = context.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
        const data = imageData.data;

        for (let index = 0; index < data.length; index += 4) {
            const red = data[index];
            const green = data[index + 1];
            const blue = data[index + 2];
            const maxDistance = Math.max(255 - red, 255 - green, 255 - blue);

            if (maxDistance <= tolerance) {
                data[index + 3] = 0;
            }
        }

        context.putImageData(imageData, 0, 0);
        drawImageToCanvas(sourceCanvas, ui.resultCanvas, sourceCanvas.width, sourceCanvas.height);
        state.lastMimeType = "image/png";
        state.lastFileName = normalizeFileName(state.lastFileName, "png");
        setStatus("Background removed. Export as PNG for transparency.", "success");
    }

    function renderEnhancedImage() {
        const scale = Math.max(2, Number(ui.enhanceScale.value || 2));
        const width = state.sourceImage.width * scale;
        const height = state.sourceImage.height * scale;
        const scaledCanvas = document.createElement("canvas");
        scaledCanvas.width = width;
        scaledCanvas.height = height;
        const scaledContext = scaledCanvas.getContext("2d");
        scaledContext.imageSmoothingEnabled = true;
        scaledContext.imageSmoothingQuality = "high";
        scaledContext.drawImage(state.sourceImage, 0, 0, width, height);

        const sharpened = applySharpen(scaledCanvas);
        drawImageToCanvas(sharpened, ui.resultCanvas, width, height);
        state.lastMimeType = "image/png";
        state.lastFileName = normalizeFileName(state.lastFileName, "png");
        setStatus(`Enhanced image generated at ${scale}x scale.`, "success");
    }

    function renderResizedImage() {
        const targetWidth = Math.max(1, Number(ui.resizeWidth.value || state.sourceImage.width));
        const targetHeight = Math.max(1, Number(ui.resizeHeight.value || state.sourceImage.height));
        drawImageToCanvas(state.sourceImage, ui.resultCanvas, targetWidth, targetHeight);
        state.lastMimeType = "image/png";
        state.lastFileName = normalizeFileName(state.lastFileName, "png");
        setStatus(`Resized output prepared at ${targetWidth} × ${targetHeight}px.`, "success");
    }

    function renderConvertedImage() {
        const format = cleanText(ui.convertFormat.value) || "image/png";
        drawImageToCanvas(state.sourceImage, ui.resultCanvas, state.sourceImage.width, state.sourceImage.height);
        state.lastMimeType = format;
        state.lastFileName = normalizeFileName(state.lastFileName, extensionFromMime(format));
        setStatus(`Converted output is ready for ${format.replace("image/", "").toUpperCase()} download.`, "success");
    }

    function renderPrintLayout() {
        const paper = resolvePaperSize();
        const itemWidthIn = Math.max(0.5, Number(ui.layoutWidth.value || 3.5));
        const itemHeightIn = Math.max(0.5, Number(ui.layoutHeight.value || 2));
        const gapIn = Math.max(0, Number(ui.layoutGap.value || 0.15));
        const dpi = 150;
        const paperWidthPx = Math.round(paper.width * dpi);
        const paperHeightPx = Math.round(paper.height * dpi);
        const itemWidthPx = Math.round(itemWidthIn * dpi);
        const itemHeightPx = Math.round(itemHeightIn * dpi);
        const gapPx = Math.round(gapIn * dpi);
        const cols = Math.max(1, Math.floor((paperWidthPx + gapPx) / (itemWidthPx + gapPx)));
        const rows = Math.max(1, Math.floor((paperHeightPx + gapPx) / (itemHeightPx + gapPx)));
        const total = cols * rows;

        const layoutCanvas = document.createElement("canvas");
        layoutCanvas.width = paperWidthPx;
        layoutCanvas.height = paperHeightPx;
        const context = layoutCanvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, paperWidthPx, paperHeightPx);

        const sourceCanvas = imageToCanvas(state.sourceImage);
        for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
            for (let colIndex = 0; colIndex < cols; colIndex += 1) {
                const x = colIndex * (itemWidthPx + gapPx);
                const y = rowIndex * (itemHeightPx + gapPx);
                context.drawImage(sourceCanvas, x, y, itemWidthPx, itemHeightPx);
            }
        }

        drawImageToCanvas(layoutCanvas, ui.resultCanvas, layoutCanvas.width, layoutCanvas.height);
        state.lastMimeType = "image/png";
        state.lastFileName = normalizeFileName("ajartivo-print-layout.png", "png");
        ui.layoutSummary.textContent = `${cols} columns × ${rows} rows = ${total} copies on ${paper.label}.`;
        setStatus("Print layout generated successfully.", "success");
    }

    function downloadCurrentOutput() {
        if (!ui.resultCanvas.width || !ui.resultCanvas.height) {
            setStatus("Generate an output before downloading.", "error");
            return;
        }

        const quality = Math.max(0.5, Math.min(1, Number(ui.convertQuality.value || 92) / 100));
        const mimeType = cleanText(state.lastMimeType) || "image/png";
        const dataUrl = ui.resultCanvas.toDataURL(mimeType, quality);
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = state.lastFileName || "ajartivo-tool-output.png";
        link.click();
    }

    function syncResizeHeight() {
        if (!ui.resizeLockRatio.checked || !state.sourceImage) return;
        const nextWidth = Math.max(1, Number(ui.resizeWidth.value || state.sourceImage.width));
        const ratio = state.sourceImage.height / state.sourceImage.width;
        ui.resizeHeight.value = Math.round(nextWidth * ratio);
    }

    function syncPaperPreset() {
        const preset = resolvePaperSize();
        ui.customPaperWidth.value = preset.width;
        ui.customPaperHeight.value = preset.height;
    }

    function resolvePaperSize() {
        const preset = cleanText(ui.paperPreset.value).toLowerCase();
        if (preset === "13x19") return { width: 13, height: 19, label: "13 × 19 in" };
        if (preset === "a4") return { width: 8.27, height: 11.69, label: "A4" };
        if (preset === "custom") {
            return {
                width: Math.max(1, Number(ui.customPaperWidth.value || 12)),
                height: Math.max(1, Number(ui.customPaperHeight.value || 18)),
                label: "Custom"
            };
        }

        return { width: 12, height: 18, label: "12 × 18 in" };
    }

    function syncSessionAccount(account) {
        if (!account || !services.getSession || !services.setSession) {
            return;
        }

        const current = services.getSession() || {};
        services.setSession({
            ...current,
            planId: cleanText(account.active_plan_id),
            planName: cleanText(account.active_plan_name),
            premiumActive: account.premium_active === true,
            dailyAiLimit: Number(account.daily_ai_limit || 0),
            aiGenerationsUsedToday: Number(account.ai_generations_used_today || 0),
            aiRemainingToday: Number(account.ai_remaining_today || 0),
            printLayoutLimit: cleanText(account.print_layout_limit),
            toolsAccess: account.tools_access || {}
        });
        window.dispatchEvent(new CustomEvent("ajartivo:account-updated", {
            detail: {
                account: account
            }
        }));
    }

    function applySharpen(canvas) {
        const width = canvas.width;
        const height = canvas.height;
        const sourceContext = canvas.getContext("2d");
        const source = sourceContext.getImageData(0, 0, width, height);
        const result = sourceContext.createImageData(width, height);
        const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

        for (let y = 1; y < height - 1; y += 1) {
            for (let x = 1; x < width - 1; x += 1) {
                for (let channel = 0; channel < 4; channel += 1) {
                    let value = 0;
                    let weightIndex = 0;

                    for (let ky = -1; ky <= 1; ky += 1) {
                        for (let kx = -1; kx <= 1; kx += 1) {
                            const pixelIndex = ((y + ky) * width + (x + kx)) * 4 + channel;
                            value += source.data[pixelIndex] * kernel[weightIndex];
                            weightIndex += 1;
                        }
                    }

                    const outputIndex = (y * width + x) * 4 + channel;
                    result.data[outputIndex] = Math.max(0, Math.min(255, value));
                }
            }
        }

        const sharpenCanvas = document.createElement("canvas");
        sharpenCanvas.width = width;
        sharpenCanvas.height = height;
        sharpenCanvas.getContext("2d").putImageData(result, 0, 0);
        return sharpenCanvas;
    }

    function drawImageToCanvas(source, targetCanvas, width, height) {
        targetCanvas.width = width;
        targetCanvas.height = height;
        const context = targetCanvas.getContext("2d");
        context.clearRect(0, 0, width, height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(source, 0, 0, width, height);
    }

    function imageToCanvas(image) {
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext("2d").drawImage(image, 0, 0);
        return canvas;
    }

    function primeCanvas(canvas, label) {
        const context = canvas.getContext("2d");
        canvas.width = 960;
        canvas.height = 640;
        context.fillStyle = "#f8fafc";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#94a3b8";
        context.font = "700 34px sans-serif";
        context.textAlign = "center";
        context.fillText(label, canvas.width / 2, canvas.height / 2);
    }

    function loadBitmap(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () {
                const image = new Image();
                image.onload = function () {
                    resolve(image);
                };
                image.onerror = function () {
                    reject(new Error("Could not decode this image file."));
                };
                image.src = reader.result;
            };
            reader.onerror = function () {
                reject(new Error("Could not read this image file."));
            };
            reader.readAsDataURL(file);
        });
    }

    function normalizeFileName(fileName, extension) {
        const base = cleanText(fileName).replace(/\.[a-z0-9]+$/i, "") || "ajartivo-tool-output";
        return `${base}.${cleanText(extension).replace(/^\./, "") || "png"}`;
    }

    function extensionFromMime(mimeType) {
        if (/jpeg/i.test(mimeType)) return "jpg";
        if (/webp/i.test(mimeType)) return "webp";
        return "png";
    }

    function toggleButtons(disabled) {
        [
            ui.runBgCut,
            ui.runEnhancer,
            ui.runResizer,
            ui.runConverter,
            ui.runLayout,
            ui.downloadResultBtn
        ].forEach(function (button) {
            if (button) {
                button.disabled = disabled;
            }
        });
    }

    function setStatus(message, tone) {
        ui.status.hidden = !message;
        ui.status.textContent = message || "";
        ui.status.style.background = tone === "error"
            ? "rgba(239, 68, 68, 0.12)"
            : "rgba(37, 99, 235, 0.12)";
        ui.status.style.color = tone === "error" ? "#fecaca" : "#dbeafe";
    }

    function cleanText(value) {
        return typeof window.AjArtivoCleanText === "function"
            ? window.AjArtivoCleanText(value)
            : String(value || "").trim();
    }
})();
