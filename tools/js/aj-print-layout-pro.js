(function () {
    "use strict";

    const TOOL_PRESETS = {
        "business-card": { label: "Business Card", count: 25, cols: 5, rows: 5, sheet: "12x18", fit: "cover" },
        "id-card": { label: "ID Card", count: 25, cols: 5, rows: 5, sheet: "12x18", fit: "contain" },
        certificate: { label: "Certificate", count: 2, cols: 1, rows: 2, sheet: "A4", fit: "contain" },
        "invitation-small": { label: "Invitation Card", count: 5, cols: 5, rows: 1, sheet: "12x18", fit: "cover", smartFill: true },
        "invitation-large": { label: "Large Invitation", count: 4, cols: 2, rows: 2, sheet: "12x18", fit: "cover" },
        sticker: { label: "Sticker", count: 24, cols: 6, rows: 4, sheet: "A4", fit: "cover" },
        labels: { label: "Labels", count: 18, cols: 6, rows: 3, sheet: "A4", fit: "contain" },
        flyer: { label: "Flyer", count: 4, cols: 2, rows: 2, sheet: "A3", fit: "contain" },
        custom: { label: "Custom Layout", count: 16, cols: 4, rows: 4, sheet: "Custom", fit: "cover" }
    };

    const SHEET_PRESETS = {
        "12x18": { label: "12x18", ratio: 1.5 },
        A4: { label: "A4", ratio: 1.414 },
        A3: { label: "A3", ratio: 1.414 },
        "13x19": { label: "13x19", ratio: 1.462 },
        Letter: { label: "Letter", ratio: 1.294 },
        Legal: { label: "Legal", ratio: 1.647 },
        Custom: { label: "Custom", ratio: 1.5 }
    };

    const CATEGORY_DATA = [
        ["business-card", "Business Card", "25-up business card sheets with crop marks, bleed, and clean spacing.", "cardIcon"],
        ["id-card", "ID Card", "Compact id card layouts with portrait or landscape handling.", "idIcon"],
        ["certificate", "Certificate", "Two-up certificate layouts with centered spacing and premium balance.", "certificateIcon"],
        ["invitation-small", "Invitation Card", "Small invitation mode with smart space fill for the open bottom area.", "inviteIcon"],
        ["sticker", "Sticker", "Dense sticker sheets that stay crisp during export.", "stickerIcon"],
        ["labels", "Labels", "Label grids that keep alignment clean and production-friendly.", "labelIcon"],
        ["flyer", "Flyer", "Flyer arrangements for larger artwork and simple imposition.", "flyerIcon"],
        ["custom", "Custom Layout", "Custom sheet dimensions and flexible repeat settings.", "customIcon"]
    ];

    const FEATURE_DATA = [
        ["Auto Layout", "Generate repeated print layouts automatically from a single design.", "autoIcon"],
        ["Smart Space Fill", "Use leftover invitation space for extra cards, labels, or mini tags.", "spaceIcon"],
        ["Back To Back Printing", "Keep front and back side previews easy to manage.", "duplexIcon"],
        ["PDF & JPG Export", "Export high quality output without leaving the browser.", "exportIcon"],
        ["Margin Control", "Adjust margins for a cleaner print boundary.", "marginIcon"],
        ["Crop Marks", "Add precise cut marks for finishing work.", "cropIcon"],
        ["Drag & Drop Upload", "Upload JPG, PNG, WEBP, or PDF files quickly.", "uploadIcon"],
        ["Live Preview", "See each change update the preview in real time.", "previewIcon"],
        ["Smart Sheet Optimization", "Keep the sheet efficient while staying print ready.", "optimizeIcon"]
    ];

    const SIZE_DATA = [
        ["12x18", "Common for cards, invitation sheets, and mixed layouts."],
        ["A4", "Best for labels, certificates, and compact print jobs."],
        ["A3", "More room for larger flyer and poster-style layouts."],
        ["13x19", "Premium production size with wide layout flexibility."],
        ["Letter", "Useful for US office workflows and proofs."],
        ["Legal", "Long format for special jobs and extended compositions."],
        ["Custom", "User defined sheet size for special production needs."]
    ];

    const state = {
        toolId: "business-card",
        activeSide: "front",
        sheetSize: "12x18",
        orientation: "landscape",
        smartFill: "business-card",
        cropMarks: true,
        margin: 42,
        spacing: 18,
        bleed: 10,
        zoom: 100,
        customWidth: 12,
        customHeight: 18,
        frontAsset: null,
        backAsset: null,
        editorImage: null,
        editorBox: { x: 150, y: 100, width: 420, height: 260, rotation: 0 }
    };

    const dom = {};
    const canvas = {
        editorStage: null,
        editorLayer: null,
        editorTransformer: null,
        previewStage: null,
        previewLayer: null
    };

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        cacheDom();
        applyQueryParams();
        renderStaticSections();
        bindUi();
        syncUi();
        initCanvas();
        scheduleRender();
    }

    function applyQueryParams() {
        const params = new URLSearchParams(window.location.search);
        const requestedTool = resolveToolId(params.get("id") || params.get("tool") || params.get("slug"));
        if (requestedTool) {
            setTool(requestedTool);
        }
    }

    function resolveToolId(value) {
        const candidate = slugify(value);
        if (!candidate) return "";
        if (TOOL_PRESETS[candidate]) return candidate;

        const matched = Object.keys(TOOL_PRESETS).find(function (toolId) {
            return slugify(toolId) === candidate || slugify(TOOL_PRESETS[toolId].label) === candidate;
        });

        return matched || "";
    }

    function cacheDom() {
        dom.categoryGrid = document.getElementById("toolCategoryGrid");
        dom.featureGrid = document.getElementById("featureGrid");
        dom.sizeGrid = document.getElementById("sizeGrid");
        dom.smartFillPanel = document.getElementById("smartFillPanel");
        dom.smartFillButtons = Array.from(document.querySelectorAll("[data-smart-fill]"));
        dom.toolSelect = document.getElementById("toolModeSelect");
        dom.sheetSelect = document.getElementById("sheetSizeSelect");
        dom.orientationSelect = document.getElementById("orientationSelect");
        dom.smartFillSelect = document.getElementById("smartFillSelect");
        dom.customWidth = document.getElementById("customWidth");
        dom.customHeight = document.getElementById("customHeight");
        dom.margin = document.getElementById("marginRange");
        dom.spacing = document.getElementById("spacingRange");
        dom.bleed = document.getElementById("bleedRange");
        dom.zoom = document.getElementById("zoomRange");
        dom.marginValue = document.getElementById("marginValue");
        dom.spacingValue = document.getElementById("spacingValue");
        dom.bleedValue = document.getElementById("bleedValue");
        dom.zoomValue = document.getElementById("zoomValue");
        dom.cropMarks = document.getElementById("cropMarksToggle");
        dom.sideButtons = Array.from(document.querySelectorAll("[data-side-toggle]"));
        dom.dropzone = document.getElementById("printLayoutDropzone");
        dom.fileInput = document.getElementById("printLayoutFileInput");
        dom.browseButton = document.getElementById("printLayoutBrowseButton");
        dom.clearButton = document.getElementById("printLayoutClearButton");
        dom.frontThumb = document.getElementById("frontThumb");
        dom.backThumb = document.getElementById("backThumb");
        dom.frontName = document.getElementById("frontName");
        dom.backName = document.getElementById("backName");
        dom.editorMount = document.getElementById("layoutEditorMount");
        dom.previewMount = document.getElementById("sheetPreviewMount");
        dom.statusText = document.getElementById("studioStatusText");
        dom.libraryWarning = document.getElementById("libraryWarning");
        dom.layoutCount = document.getElementById("layoutCount");
        dom.layoutSheet = document.getElementById("layoutSheet");
        dom.layoutMeta = document.getElementById("layoutMeta");
        dom.livePreviewLabel = document.getElementById("livePreviewLabel");
        dom.supportNote = document.getElementById("supportNote");
        dom.exportPdf = document.getElementById("exportPdfButton");
        dom.exportJpg = document.getElementById("exportJpgButton");
        dom.smartFillPanel = document.getElementById("smartFillPanel");
    }

    function renderStaticSections() {
        if (dom.categoryGrid) {
            dom.categoryGrid.innerHTML = CATEGORY_DATA.map(function (item) {
                return `<article class="print-layout-tool-card">
                    <div class="print-layout-card-top">
                        <div>
                            <span class="print-layout-tool-chip">${escapeHtml(item[1])}</span>
                            <h3>${escapeHtml(item[1])}</h3>
                        </div>
                        <div class="print-layout-icon" aria-hidden="true">${iconHtml(item[3])}</div>
                    </div>
                    <p>${escapeHtml(item[2])}</p>
                    <div class="print-layout-tool-footer">
                        <span class="print-layout-tool-chip">SVG icon</span>
                        <button type="button" class="print-layout-tool-open" data-tool-target="${escapeHtml(item[0])}">Open Studio</button>
                    </div>
                </article>`;
            }).join("");
        }

        if (dom.featureGrid) {
            dom.featureGrid.innerHTML = FEATURE_DATA.map(function (item) {
                return `<article class="print-layout-feature-card">
                    <div class="print-layout-feature-top">
                        <div>
                            <span class="print-layout-section-label">Feature</span>
                            <h3>${escapeHtml(item[0])}</h3>
                        </div>
                        <div class="print-layout-feature-icon" aria-hidden="true">${iconHtml(item[2])}</div>
                    </div>
                    <p>${escapeHtml(item[1])}</p>
                </article>`;
            }).join("");
        }

        if (dom.sizeGrid) {
            dom.sizeGrid.innerHTML = SIZE_DATA.map(function (item) {
                return `<article class="print-layout-size-card">
                    <div class="print-layout-size-top">
                        <div>
                            <span class="print-layout-size-chip">${escapeHtml(item[0])}</span>
                            <h3>${escapeHtml(item[0])}</h3>
                        </div>
                        <div class="print-layout-size-icon" aria-hidden="true">${iconHtml("sheetIcon")}</div>
                    </div>
                    <p>${escapeHtml(item[1])}</p>
                </article>`;
            }).join("");
        }
    }

    function bindUi() {
        document.querySelectorAll("[data-tool-target]").forEach(function (button) {
            button.addEventListener("click", function () {
                const toolId = button.getAttribute("data-tool-target") || "business-card";
                const url = new URL("studio.html", window.location.href);
                url.searchParams.set("tool", toolId);
                window.location.href = url.toString();
            });
        });

        if (dom.toolSelect) {
            dom.toolSelect.addEventListener("change", function (event) {
                setTool(event.target.value);
            });
        }

        if (dom.sheetSelect) {
            dom.sheetSelect.addEventListener("change", function (event) {
                state.sheetSize = event.target.value;
                syncUi();
                scheduleRender();
            });
        }

        if (dom.orientationSelect) {
            dom.orientationSelect.addEventListener("change", function (event) {
                state.orientation = event.target.value;
                scheduleRender();
            });
        }

        if (dom.smartFillSelect) {
            dom.smartFillSelect.addEventListener("change", function (event) {
                state.smartFill = event.target.value;
                updateSmartFillButtons();
                scheduleRender();
            });
        }

        if (dom.customWidth) {
            dom.customWidth.addEventListener("input", function (event) {
                state.customWidth = clamp(event.target.value, 4, 40);
                scheduleRender();
            });
        }

        if (dom.customHeight) {
            dom.customHeight.addEventListener("input", function (event) {
                state.customHeight = clamp(event.target.value, 4, 40);
                scheduleRender();
            });
        }

        if (dom.cropMarks) {
            dom.cropMarks.addEventListener("change", function (event) {
                state.cropMarks = Boolean(event.target.checked);
                scheduleRender();
            });
        }

        bindRange(dom.margin, dom.marginValue, function (value) {
            state.margin = value;
            scheduleRender();
        });
        bindRange(dom.spacing, dom.spacingValue, function (value) {
            state.spacing = value;
            scheduleRender();
        });
        bindRange(dom.bleed, dom.bleedValue, function (value) {
            state.bleed = value;
            scheduleRender();
        });
        bindRange(dom.zoom, dom.zoomValue, function (value) {
            state.zoom = value;
            scheduleRender();
        });

        dom.sideButtons.forEach(function (button) {
            button.addEventListener("click", function () {
                state.activeSide = button.getAttribute("data-side-toggle") || "front";
                updateSideButtons();
                selectActiveAsset();
                scheduleRender();
            });
        });

        dom.smartFillButtons.forEach(function (button) {
            button.addEventListener("click", function () {
                state.smartFill = button.getAttribute("data-smart-fill") || "keep-blank";
                if (dom.smartFillSelect) dom.smartFillSelect.value = state.smartFill;
                updateSmartFillButtons();
                scheduleRender();
            });
        });

        if (dom.dropzone) {
            dom.dropzone.addEventListener("click", function (event) {
                if (event.target.closest("button, input")) return;
                if (dom.fileInput) dom.fileInput.click();
            });
            ["dragenter", "dragover"].forEach(function (type) {
                dom.dropzone.addEventListener(type, function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    dom.dropzone.classList.add("is-dragover");
                });
            });
            ["dragleave", "drop"].forEach(function (type) {
                dom.dropzone.addEventListener(type, function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    dom.dropzone.classList.remove("is-dragover");
                });
            });
            dom.dropzone.addEventListener("drop", function (event) {
                const files = Array.from((event.dataTransfer && event.dataTransfer.files) || []);
                if (files.length) handleUpload(files[0]);
            });
        }

        if (dom.fileInput) {
            dom.fileInput.addEventListener("change", function (event) {
                const file = event.target.files && event.target.files[0];
                if (file) handleUpload(file);
            });
        }

        if (dom.browseButton) {
            dom.browseButton.addEventListener("click", function () {
                if (dom.fileInput) dom.fileInput.click();
            });
        }

        if (dom.clearButton) {
            dom.clearButton.addEventListener("click", function () {
                state.frontAsset = null;
                state.backAsset = null;
                state.editorImage = null;
                updateThumbs();
                setStatus("Uploads cleared.");
                scheduleRender();
            });
        }

        if (dom.exportPdf) {
            dom.exportPdf.addEventListener("click", function () {
                exportSheet("pdf");
            });
        }

        if (dom.exportJpg) {
            dom.exportJpg.addEventListener("click", function () {
                exportSheet("jpg");
            });
        }

        window.addEventListener("resize", debounce(function () {
            resizeStages();
        }, 120));
    }

    function bindRange(input, output, onChange) {
        if (!input) return;
        const min = Number(input.min || 0);
        const max = Number(input.max || 100);
        const update = function () {
            const value = clamp(input.value, min, max);
            input.value = String(value);
            if (output) output.textContent = String(Math.round(value));
            onChange(value);
        };
        input.addEventListener("input", update);
        update();
    }

    function setTool(toolId) {
        state.toolId = TOOL_PRESETS[toolId] ? toolId : "business-card";
        if (state.toolId === "invitation-small") {
            state.smartFill = "business-card";
        }
        syncUi();
        scheduleRender();
    }

    function syncUi() {
        const tool = TOOL_PRESETS[state.toolId] || TOOL_PRESETS["business-card"];
        if (dom.toolSelect) dom.toolSelect.value = state.toolId;
        if (dom.sheetSelect) dom.sheetSelect.value = state.sheetSize;
        if (dom.orientationSelect) dom.orientationSelect.value = state.orientation;
        if (dom.smartFillSelect) dom.smartFillSelect.value = state.smartFill;
        if (dom.customWidth) dom.customWidth.value = state.customWidth;
        if (dom.customHeight) dom.customHeight.value = state.customHeight;
        if (dom.cropMarks) dom.cropMarks.checked = state.cropMarks;

        if (dom.layoutCount) dom.layoutCount.textContent = String(tool.count);
        if (dom.layoutSheet) dom.layoutSheet.textContent = getSheetPreset().label;
        if (dom.layoutMeta) dom.layoutMeta.textContent = tool.sheet === "Custom" ? "Custom sheet layout active." : "Default sheet: " + tool.sheet;
        if (dom.livePreviewLabel) dom.livePreviewLabel.textContent = tool.label;
        if (dom.statusText) dom.statusText.textContent = tool.label + " is ready.";

        updateSideButtons();
        updateSmartFillButtons();
        updateThumbs();
        updateControlVisibility();
    }

    function updateControlVisibility() {
        const isInvitation = state.toolId === "invitation-small";
        if (dom.smartFillPanel) {
            dom.smartFillPanel.classList.toggle("is-visible", isInvitation);
        }
        const customGroup = dom.customWidth && dom.customWidth.closest(".print-layout-control");
        if (customGroup) {
            customGroup.classList.toggle("print-layout-hide", state.sheetSize !== "Custom");
        }
        if (dom.customHeight) {
            const customGroup2 = dom.customHeight.closest(".print-layout-control");
            if (customGroup2) {
                customGroup2.classList.toggle("print-layout-hide", state.sheetSize !== "Custom");
            }
        }
    }

    function updateSideButtons() {
        dom.sideButtons.forEach(function (button) {
            button.classList.toggle("is-active", button.getAttribute("data-side-toggle") === state.activeSide);
        });
    }

    function updateSmartFillButtons() {
        dom.smartFillButtons.forEach(function (button) {
            button.classList.toggle("is-active", button.getAttribute("data-smart-fill") === state.smartFill);
        });
    }

    function updateThumbs() {
        if (dom.frontName) dom.frontName.textContent = state.frontAsset ? state.frontAsset.name : "No front design yet";
        if (dom.backName) dom.backName.textContent = state.backAsset ? state.backAsset.name : "No back design yet";
        if (dom.frontThumb) setThumb(dom.frontThumb, state.frontAsset);
        if (dom.backThumb) setThumb(dom.backThumb, state.backAsset);
        const current = activeAsset();
        state.editorImage = current && current.image ? current.image : null;
    }

    function setThumb(node, asset) {
        if (!node) return;
        if (!asset) {
            node.removeAttribute("src");
            return;
        }
        node.src = asset.preview;
    }

    function activeAsset() {
        return state.activeSide === "back" ? (state.backAsset || state.frontAsset) : (state.frontAsset || state.backAsset);
    }

    async function handleUpload(file) {
        if (!isSupportedFile(file)) {
            setStatus("Please upload JPG, PNG, WEBP, or PDF files.");
            return;
        }

        try {
            let preview = "";
            if (isPdfFile(file)) {
                preview = await renderPdfPreview(file);
            } else {
                preview = await readFileAsDataUrl(file);
            }

            const asset = {
                file: file,
                name: file.name,
                preview: preview,
                image: await loadImage(preview)
            };

            if (state.activeSide === "back") {
                state.backAsset = asset;
            } else {
                state.frontAsset = asset;
            }

            updateThumbs();
            setStatus("Loaded " + file.name + " for " + state.activeSide + " side.");
            scheduleRender();
        } catch (error) {
            console.error(error);
            setStatus("Upload failed. Please try another file.");
        } finally {
            if (dom.fileInput) dom.fileInput.value = "";
        }
    }

    function initCanvas() {
        if (!window.Konva || !dom.editorMount || !dom.previewMount) {
            if (dom.libraryWarning) {
                dom.libraryWarning.textContent = "Konva.js, jsPDF, or PDF.js is unavailable. The page shell still loads.";
            }
            return;
        }

        if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js";
        }

        canvas.editorStage = new Konva.Stage({
            container: dom.editorMount,
            width: dom.editorMount.clientWidth || 520,
            height: dom.editorMount.clientHeight || 380
        });
        canvas.editorLayer = new Konva.Layer();
        canvas.editorStage.add(canvas.editorLayer);
        canvas.editorTransformer = new Konva.Transformer({
            rotateEnabled: true,
            keepRatio: false,
            borderStroke: "#60a5fa",
            anchorStroke: "#60a5fa",
            anchorFill: "#050816",
            anchorSize: 10
        });
        canvas.editorLayer.add(canvas.editorTransformer);

        canvas.previewStage = new Konva.Stage({
            container: dom.previewMount,
            width: dom.previewMount.clientWidth || 720,
            height: dom.previewMount.clientHeight || 560
        });
        canvas.previewLayer = new Konva.Layer();
        canvas.previewStage.add(canvas.previewLayer);

        canvas.editorStage.on("click tap", function (event) {
            if (event.target === canvas.editorStage) {
                canvas.editorTransformer.nodes([]);
                canvas.editorLayer.batchDraw();
            }
        });

        resizeStages();
    }

    function resizeStages() {
        if (!canvas.editorStage || !canvas.previewStage) return;
        canvas.editorStage.width(dom.editorMount.clientWidth || 520);
        canvas.editorStage.height(dom.editorMount.clientHeight || 380);
        canvas.previewStage.width(dom.previewMount.clientWidth || 720);
        canvas.previewStage.height(dom.previewMount.clientHeight || 560);
        scheduleRender();
    }

    function scheduleRender() {
        if (scheduleRender._raf) cancelAnimationFrame(scheduleRender._raf);
        scheduleRender._raf = requestAnimationFrame(function () {
            scheduleRender._raf = 0;
            renderCanvas();
        });
    }

    function renderCanvas() {
        if (!canvas.editorStage || !canvas.previewStage) return;
        renderEditor();
        renderPreview();
    }

    function renderEditor() {
        const layer = canvas.editorLayer;
        if (!layer) return;
        layer.destroyChildren();

        const width = canvas.editorStage.width();
        const height = canvas.editorStage.height();
        const pad = 22;
        const asset = activeAsset();

        layer.add(new Konva.Rect({
            x: 0, y: 0, width: width, height: height,
            cornerRadius: 20,
            fillLinearGradientStartPoint: { x: 0, y: 0 },
            fillLinearGradientEndPoint: { x: width, y: height },
            fillLinearGradientColorStops: [0, "rgba(96,165,250,0.08)", 0.45, "rgba(15,23,42,0.92)", 1, "rgba(168,85,247,0.12)"]
        }));
        layer.add(new Konva.Rect({
            x: pad, y: pad, width: width - pad * 2, height: height - pad * 2,
            cornerRadius: 18,
            stroke: "rgba(191, 219, 254, 0.22)",
            dash: [10, 10],
            strokeWidth: 1.3
        }));

        if (asset && asset.image) {
            const box = state.editorBox;
            const fit = fitIntoBox(asset.image, box.width, box.height, "cover");
            const imageNode = new Konva.Image({
                image: asset.image,
                x: box.x + fit.x,
                y: box.y + fit.y,
                width: fit.width,
                height: fit.height,
                rotation: box.rotation,
                draggable: true,
                shadowColor: "rgba(2, 6, 23, 0.28)",
                shadowBlur: 18,
                shadowOpacity: 0.34,
                shadowOffset: { x: 0, y: 10 }
            });

            imageNode.dragBoundFunc(function (pos) {
                return {
                    x: clamp(pos.x, 28, width - imageNode.width() - 28),
                    y: clamp(pos.y, 28, height - imageNode.height() - 28)
                };
            });

            imageNode.on("dragend transformend", function () {
                state.editorBox.x = imageNode.x();
                state.editorBox.y = imageNode.y();
                state.editorBox.width = imageNode.width() * imageNode.scaleX();
                state.editorBox.height = imageNode.height() * imageNode.scaleY();
                state.editorBox.rotation = imageNode.rotation();
                imageNode.scaleX(1);
                imageNode.scaleY(1);
                scheduleRender();
            });

            canvas.editorTransformer.nodes([imageNode]);
            layer.add(imageNode);
            const badge = new Konva.Label({ x: 28, y: 24 });
            badge.add(new Konva.Tag({ fill: "rgba(5,10,22,0.78)", cornerRadius: 999 }));
            badge.add(new Konva.Text({ text: state.activeSide === "back" ? "Back Face" : "Front Face", padding: 10, fill: "#eff6ff", fontSize: 14, fontStyle: "bold" }));
            layer.add(badge);
        } else {
            layer.add(new Konva.Rect({
                x: 70, y: 54, width: width - 140, height: height - 108,
                cornerRadius: 24,
                fill: "rgba(255,255,255,0.05)",
                stroke: "rgba(148,163,184,0.2)",
                dash: [12, 10],
                strokeWidth: 1.2
            }));
            layer.add(new Konva.Text({
                x: 110,
                y: Math.max(92, height * 0.32),
                width: width - 220,
                text: "Drop a JPG, PNG, WEBP, or PDF file here to begin editing the master tile.",
                fill: "#dbeafe",
                align: "center",
                fontSize: 20,
                fontStyle: "bold"
            }));
            layer.add(new Konva.Text({
                x: 110,
                y: Math.max(146, height * 0.46),
                width: width - 220,
                text: "Drag, resize, and rotate handles are enabled once an asset loads.",
                fill: "#9fb0cb",
                align: "center",
                fontSize: 15,
                lineHeight: 1.7
            }));
            canvas.editorTransformer.nodes([]);
        }

        layer.add(canvas.editorTransformer);
        layer.draw();
    }

    function renderPreview() {
        const layer = canvas.previewLayer;
        if (!layer) return;
        layer.destroyChildren();

        const width = canvas.previewStage.width();
        const height = canvas.previewStage.height();
        const tool = TOOL_PRESETS[state.toolId] || TOOL_PRESETS["business-card"];
        const sheet = getSheetPreset();
        const ratio = getSheetRatio();
        const zoom = state.zoom / 100;
        const baseWidth = Math.max(320, Math.min(width - 24, height * ratio - 24));
        const previewWidth = baseWidth * zoom;
        const previewHeight = previewWidth / ratio;
        const x = Math.max(12, (width - previewWidth) / 2);
        const y = Math.max(12, (height - previewHeight) / 2);
        const pad = Math.max(18, state.margin * 0.8 * zoom);
        const spacing = Math.max(8, state.spacing * zoom);
        const asset = activeAsset();
        const image = asset && asset.image ? asset.image : null;

        layer.add(new Konva.Rect({
            x: x - 10, y: y - 10, width: previewWidth + 20, height: previewHeight + 20,
            cornerRadius: 26,
            fillLinearGradientStartPoint: { x: 0, y: 0 },
            fillLinearGradientEndPoint: { x: previewWidth, y: previewHeight },
            fillLinearGradientColorStops: [0, "rgba(255,255,255,0.08)", 0.5, "rgba(96,165,250,0.14)", 1, "rgba(15,23,42,0.92)"]
        }));
        layer.add(new Konva.Rect({
            x: x, y: y, width: previewWidth, height: previewHeight,
            cornerRadius: 22,
            fill: "rgba(255,255,255,0.94)",
            stroke: "rgba(148,163,184,0.28)",
            strokeWidth: 1.2,
            shadowColor: "rgba(2,6,23,0.2)",
            shadowBlur: 18,
            shadowOpacity: 0.32,
            shadowOffset: { x: 0, y: 10 }
        }));

        layer.add(new Konva.Label({
            x: x + 18,
            y: y + 16,
            children: [
                new Konva.Tag({ fill: "rgba(5,10,22,0.92)", cornerRadius: 999 }),
                new Konva.Text({ text: tool.label + " • " + sheet.label, padding: 10, fill: "#eff6ff", fontSize: 14, fontStyle: "bold" })
            ]
        }));

        const contentX = x + pad;
        const contentY = y + pad + 28;
        const contentW = previewWidth - pad * 2;
        const contentH = previewHeight - pad * 2 - 40;

        if (state.toolId === "invitation-small") {
            renderInvitationPreview(layer, { x: contentX, y: contentY, width: contentW, height: contentH }, image, spacing);
        } else {
            const cols = tool.cols;
            const rows = tool.rows;
            const cellW = (contentW - spacing * (cols - 1)) / cols;
            const cellH = (contentH - spacing * (rows - 1)) / rows;
            let count = 0;

            for (let r = 0; r < rows; r += 1) {
                for (let c = 0; c < cols; c += 1) {
                    if (count >= tool.count) continue;
                    const cellX = contentX + c * (cellW + spacing);
                    const cellY = contentY + r * (cellH + spacing);
                    layer.add(makeCell({ x: cellX, y: cellY, width: cellW, height: cellH, image: image, fit: tool.fit, index: count + 1 }));
                    count += 1;
                }
            }
        }

        if (state.cropMarks) {
            addMarks(layer, x, y, previewWidth, previewHeight);
        }

        layer.add(new Konva.Text({
            x: x + 18,
            y: y + previewHeight - 34,
            text: "Live preview updates as you change settings",
            fill: "#475569",
            fontSize: 12,
            fontStyle: "bold"
        }));

        layer.draw();
    }

    function renderInvitationPreview(layer, box, image, spacing) {
        const blankHeight = box.height * 0.32;
        const topHeight = box.height - blankHeight - spacing;
        const cardW = (box.width - spacing * 4) / 5;
        const cardH = Math.min(topHeight, cardW / 1.7);

        for (let i = 0; i < 5; i += 1) {
            const x = box.x + i * (cardW + spacing);
            layer.add(makeCell({ x: x, y: box.y, width: cardW, height: cardH, image: image, fit: "cover", index: i + 1 }));
        }

        const blankY = box.y + box.height - blankHeight;
        layer.add(new Konva.Rect({
            x: box.x,
            y: blankY,
            width: box.width,
            height: blankHeight,
            cornerRadius: 18,
            fill: "rgba(96,165,250,0.06)",
            stroke: "rgba(96,165,250,0.22)",
            dash: [10, 10],
            strokeWidth: 1.2
        }));

        const fillMode = state.smartFill || "keep-blank";
        layer.add(new Konva.Label({
            x: box.x + 16,
            y: blankY + 10,
            children: [
                new Konva.Tag({ fill: "rgba(5,10,22,0.84)", cornerRadius: 999 }),
                new Konva.Text({
                    text: fillMode === "keep-blank" ? "Keep Blank" : "Smart Space Fill: " + smartFillLabel(fillMode),
                    padding: 8,
                    fill: "#eff6ff",
                    fontSize: 12,
                    fontStyle: "bold"
                })
            ]
        }));

        if (fillMode === "business-card") {
            const fillCols = 4;
            const fillRows = 2;
            const fillPad = 12;
            const fillW = (box.width - fillPad * 2 - spacing * (fillCols - 1)) / fillCols;
            const fillH = (blankHeight - 34 - spacing * (fillRows - 1) - fillPad) / fillRows;
            for (let r = 0; r < fillRows; r += 1) {
                for (let c = 0; c < fillCols; c += 1) {
                    const x = box.x + fillPad + c * (fillW + spacing);
                    const y = blankY + 30 + r * (fillH + spacing);
                    layer.add(makeCell({ x: x, y: y, width: fillW, height: fillH, image: image, fit: "cover", index: r * fillCols + c + 1, tint: true }));
                }
            }
        }
    }

    function makeCell(opts) {
        const group = new Konva.Group({ x: opts.x, y: opts.y });
        group.add(new Konva.Rect({
            x: 0, y: 0, width: opts.width, height: opts.height,
            cornerRadius: 14,
            fill: opts.tint ? "rgba(96,165,250,0.08)" : "rgba(255,255,255,0.96)",
            stroke: "rgba(15,23,42,0.12)",
            strokeWidth: 1.1,
            shadowColor: "rgba(2,6,23,0.12)",
            shadowBlur: 10,
            shadowOpacity: 0.22,
            shadowOffset: { x: 0, y: 6 }
        }));

        if (opts.image) {
            const fit = fitToBox(opts.image, opts.width, opts.height, opts.fit || "cover");
            group.add(new Konva.Image({ image: opts.image, x: fit.x, y: fit.y, width: fit.width, height: fit.height, crop: fit.crop }));
        } else {
            group.add(new Konva.Rect({
                x: 0, y: 0, width: opts.width, height: opts.height,
                cornerRadius: 14,
                fillLinearGradientStartPoint: { x: 0, y: 0 },
                fillLinearGradientEndPoint: { x: opts.width, y: opts.height },
                fillLinearGradientColorStops: [0, "rgba(96,165,250,0.28)", 0.5, "rgba(168,85,247,0.22)", 1, "rgba(251,113,133,0.22)"]
            }));
            group.add(new Konva.Text({
                x: 0, y: 0, width: opts.width, height: opts.height,
                text: "Design " + opts.index,
                align: "center",
                verticalAlign: "middle",
                fill: "#ffffff",
                fontSize: Math.max(10, Math.min(opts.width, opts.height) * 0.18),
                fontStyle: "bold"
            }));
        }

        return group;
    }

    function addMarks(layer, x, y, width, height) {
        const color = "rgba(15,23,42,0.35)";
        [[x, y, x + 18, y], [x, y, x, y + 18], [x + width - 18, y, x + width, y], [x + width, y, x + width, y + 18], [x, y + height, x + 18, y + height], [x, y + height - 18, x, y + height], [x + width - 18, y + height, x + width, y + height], [x + width, y + height - 18, x + width, y + height]]
            .forEach(function (points) {
                layer.add(new Konva.Line({ points: points, stroke: color, strokeWidth: 1.2 }));
            });
    }

    function renderPdfPreview(file) {
        if (!window.pdfjsLib) {
            return Promise.reject(new Error("PDF.js unavailable"));
        }
        const bufferPromise = file.arrayBuffer();
        return bufferPromise.then(function (buffer) {
            return window.pdfjsLib.getDocument({ data: buffer }).promise;
        }).then(function (pdf) {
            return pdf.getPage(1);
        }).then(function (page) {
            const viewport = page.getViewport({ scale: 2 });
            const canvasEl = document.createElement("canvas");
            const ctx = canvasEl.getContext("2d");
            canvasEl.width = Math.floor(viewport.width);
            canvasEl.height = Math.floor(viewport.height);
            return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
                return canvasEl.toDataURL("image/png");
            });
        });
    }

    function exportSheet(format) {
        if (!canvas.previewStage) return;
        const fileBase = slugify((TOOL_PRESETS[state.toolId] || TOOL_PRESETS["business-card"]).label + "-" + state.sheetSize);
        const target = canvas.previewStage.toDataURL({ pixelRatio: 2, mimeType: format === "jpg" ? "image/jpeg" : "image/png", quality: 0.96 });

        if (format === "jpg") {
            downloadUrl(target, fileBase + ".jpg");
            setStatus("JPG export generated.");
            return;
        }

        if (!window.jspdf || !window.jspdf.jsPDF) {
            setStatus("jsPDF is unavailable, so PDF export could not run.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: canvas.previewStage.width() >= canvas.previewStage.height() ? "landscape" : "portrait",
            unit: "px",
            format: [canvas.previewStage.width(), canvas.previewStage.height()]
        });
        doc.addImage(target, "PNG", 0, 0, canvas.previewStage.width(), canvas.previewStage.height(), undefined, "FAST");

        if (state.backAsset && state.frontAsset) {
            doc.addPage([canvas.previewStage.width(), canvas.previewStage.height()], canvas.previewStage.width() >= canvas.previewStage.height() ? "landscape" : "portrait");
            state.activeSide = "back";
            scheduleRender();
            requestAnimationFrame(function () {
                const backTarget = canvas.previewStage.toDataURL({ pixelRatio: 2, mimeType: "image/jpeg", quality: 0.96 });
                doc.addImage(backTarget, "JPEG", 0, 0, canvas.previewStage.width(), canvas.previewStage.height(), undefined, "FAST");
                doc.save(fileBase + ".pdf");
                state.activeSide = "front";
                scheduleRender();
                setStatus("PDF export generated.");
            });
            return;
        }

        doc.save(fileBase + ".pdf");
        setStatus("PDF export generated.");
    }

    function fitToBox(image, boxWidth, boxHeight, fitMode) {
        const ratio = image.width / image.height;
        let drawWidth = boxWidth;
        let drawHeight = boxHeight;
        let crop = { x: 0, y: 0, width: image.width, height: image.height };

        if (fitMode === "contain") {
            if (ratio > boxWidth / boxHeight) {
                drawHeight = boxWidth / ratio;
            } else {
                drawWidth = boxHeight * ratio;
            }
        } else if (ratio > boxWidth / boxHeight) {
            const cropWidth = image.height * (boxWidth / boxHeight);
            crop = { x: (image.width - cropWidth) / 2, y: 0, width: cropWidth, height: image.height };
        } else {
            const cropHeight = image.width / (boxWidth / boxHeight);
            crop = { x: 0, y: (image.height - cropHeight) / 2, width: image.width, height: cropHeight };
        }

        return {
            x: (boxWidth - drawWidth) / 2,
            y: (boxHeight - drawHeight) / 2,
            width: drawWidth,
            height: drawHeight,
            crop: crop
        };
    }

    function getToolPreset() {
        return TOOL_PRESETS[state.toolId] || TOOL_PRESETS["business-card"];
    }

    function getSheetPreset() {
        return SHEET_PRESETS[state.sheetSize] || SHEET_PRESETS["12x18"];
    }

    function getSheetRatio() {
        if (state.sheetSize === "Custom") {
            const width = clamp(state.customWidth, 4, 40);
            const height = clamp(state.customHeight, 4, 40);
            return state.orientation === "portrait" ? width / height : height / width;
        }
        const ratio = getSheetPreset().ratio;
        return state.orientation === "portrait" ? 1 / ratio : ratio;
    }

    function selectActiveAsset() {
        const current = activeAsset();
        state.editorImage = current && current.image ? current.image : null;
        scheduleRender();
    }

    function activeAsset() {
        return state.activeSide === "back"
            ? (state.backAsset || state.frontAsset)
            : (state.frontAsset || state.backAsset);
    }

    function isSupportedFile(file) {
        const name = String(file && file.name || "").toLowerCase();
        const type = String(file && file.type || "").toLowerCase();
        return type.startsWith("image/") || type === "application/pdf" || /\.(jpg|jpeg|png|webp|pdf)$/.test(name);
    }

    function isPdfFile(file) {
        const name = String(file && file.name || "").toLowerCase();
        const type = String(file && file.type || "").toLowerCase();
        return type === "application/pdf" || /\.pdf$/.test(name);
    }

    function readFileAsDataUrl(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result || "")); };
            reader.onerror = function () { reject(reader.error || new Error("Unable to read file")); };
            reader.readAsDataURL(file);
        });
    }

    function loadImage(src) {
        return new Promise(function (resolve, reject) {
            const image = new Image();
            image.onload = function () { resolve(image); };
            image.onerror = reject;
            image.src = src;
        });
    }

    function downloadUrl(url, fileName) {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }

    function smartFillLabel(value) {
        if (value === "business-card") return "Business Card";
        if (value === "labels") return "Labels";
        if (value === "mini-tags") return "Mini Tags";
        return "Keep Blank";
    }

    function setStatus(message) {
        if (dom.statusText) dom.statusText.textContent = message;
        if (dom.supportNote) dom.supportNote.textContent = message;
    }

    function clamp(value, min, max) {
        const n = Number(value);
        if (Number.isNaN(n)) return min;
        return Math.max(min, Math.min(max, n));
    }

    function slugify(text) {
        return String(text || "download").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function debounce(fn, wait) {
        let timer = 0;
        return function () {
            const args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function () {
                fn.apply(null, args);
            }, wait);
        };
    }

    function iconHtml(name) {
        const icons = {
            cardIcon: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="3"></rect><path d="M8 9h8"></path><path d="M8 13h5"></path></svg>',
            idIcon: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="3"></rect><path d="M8 9h8"></path><path d="M8 13h4"></path><circle cx="16" cy="14" r="1.3"></circle></svg>',
            certificateIcon: '<svg viewBox="0 0 24 24"><path d="M7 3h10v18H7z"></path><path d="M9 7h6"></path><path d="M9 11h6"></path><path d="M12 15l2 3 2-1-1-2"></path></svg>',
            inviteIcon: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"></path><path d="M8 8h8"></path><path d="M8 12h5"></path><path d="M8 16h4"></path></svg>',
            stickerIcon: '<svg viewBox="0 0 24 24"><path d="M6 4h12l2 2v12l-2 2H8l-4-4V6z"></path><path d="M8 10h6"></path></svg>',
            labelIcon: '<svg viewBox="0 0 24 24"><path d="M5 5h10l4 4v10H5z"></path><path d="M15 5v4h4"></path><path d="M8 12h6"></path></svg>',
            flyerIcon: '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="16" rx="2"></rect><path d="M8 8h8"></path><path d="M8 12h8"></path></svg>',
            customIcon: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="M8 8h8"></path><path d="M8 12h4"></path></svg>',
            autoIcon: '<svg viewBox="0 0 24 24"><path d="M4 12h16"></path><path d="M12 4v16"></path><path d="M8 8l4-4 4 4"></path><path d="M16 16l-4 4-4-4"></path></svg>',
            spaceIcon: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="3"></rect><path d="M8 9h8"></path><path d="M8 13h4"></path><path d="M13 13h3"></path></svg>',
            duplexIcon: '<svg viewBox="0 0 24 24"><path d="M6 4h9l3 3v13H6z"></path><path d="M9 8h6"></path><path d="M9 12h6"></path><path d="M13 4v4h5"></path></svg>',
            exportIcon: '<svg viewBox="0 0 24 24"><path d="M12 3v12"></path><path d="M8 7l4-4 4 4"></path><path d="M5 15v4h14v-4"></path></svg>',
            marginIcon: '<svg viewBox="0 0 24 24"><path d="M5 5h14v14H5z"></path><path d="M8 8h8"></path><path d="M8 12h4"></path></svg>',
            cropIcon: '<svg viewBox="0 0 24 24"><path d="M6 3v15h15"></path><path d="M3 6h15v15"></path></svg>',
            uploadIcon: '<svg viewBox="0 0 24 24"><path d="M12 16V4"></path><path d="M8 8l4-4 4 4"></path><path d="M5 16v4h14v-4"></path></svg>',
            previewIcon: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="12" rx="3"></rect><path d="M8 11l2 2 4-5"></path></svg>',
            optimizeIcon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path></svg>',
            sheetIcon: '<svg viewBox="0 0 24 24"><path d="M7 3h8l4 4v14H7z"></path><path d="M15 3v4h4"></path></svg>'
        };
        return icons[name] || icons.sheetIcon;
    }
})();
