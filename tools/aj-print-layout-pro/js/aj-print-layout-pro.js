(function () {
    "use strict";

    const LOCAL_BACKEND_BASE_URL = "http://localhost:5101";
    const LIVE_BACKEND_BASE_URL = "https://print-layout-backend.onrender.com";
    const BACKEND_PREVIEW_THRESHOLD_BYTES = 10 * 1024 * 1024;

    const TOOL_PRESETS = {
        "business-card": {
            label: "Business Card",
            count: 25,
            cols: 5,
            rows: 5,
            sheet: "12x18",
            fit: "cover",
            orientation: "landscape",
            businessCardRotation: 90,
            businessFitToCard: false,
            margin: 0.125,
            spacing: 0.25,
            bleed: 10,
            zoom: 100,
            cardWidth: 2.15,
            cardHeight: 3.3,
            gapX: 0.25,
            gapY: 0.313,
            borderMargin: 0.125
        },
        "id-card": { label: "ID Card", count: 25, cols: 5, rows: 5, sheet: "12x18", fit: "contain", orientation: "portrait", margin: 36, spacing: 16, bleed: 8, zoom: 100 },
        certificate: { label: "Certificate", count: 2, cols: 1, rows: 2, sheet: "A4", fit: "contain", orientation: "portrait", margin: 50, spacing: 22, bleed: 8, zoom: 100 },
        "invitation-small": { label: "Invitation Card", count: 5, cols: 5, rows: 1, sheet: "12x18", fit: "cover", orientation: "portrait", smartFill: "business-card", margin: 44, spacing: 18, bleed: 10, zoom: 100 },
        "invitation-large": { label: "Large Invitation", count: 4, cols: 2, rows: 2, sheet: "12x18", fit: "cover", orientation: "portrait", margin: 42, spacing: 18, bleed: 10, zoom: 100 },
        sticker: { label: "Sticker", count: 24, cols: 6, rows: 4, sheet: "A4", fit: "cover", orientation: "portrait", margin: 34, spacing: 14, bleed: 8, zoom: 100 },
        labels: { label: "Labels", count: 18, cols: 6, rows: 3, sheet: "A4", fit: "contain", orientation: "portrait", margin: 34, spacing: 14, bleed: 8, zoom: 100 },
        flyer: { label: "Flyer", count: 4, cols: 2, rows: 2, sheet: "A3", fit: "contain", orientation: "portrait", margin: 40, spacing: 18, bleed: 10, zoom: 96 },
        custom: { label: "Custom Layout", count: 16, cols: 4, rows: 4, sheet: "Custom", fit: "cover", orientation: "portrait", margin: 42, spacing: 18, bleed: 10, zoom: 100, customWidth: 12, customHeight: 18 }
    };

    const SHEET_PRESETS = {
        "12x18": { label: "12x18", width: 18, height: 12 },
        A4: { label: "A4", width: 11.69, height: 8.27 },
        A3: { label: "A3", width: 16.54, height: 11.69 },
        "13x19": { label: "13x19", width: 19, height: 13 },
        Letter: { label: "Letter", width: 11, height: 8.5 },
        Legal: { label: "Legal", width: 14, height: 8.5 },
        Custom: { label: "Custom", width: 18, height: 12 }
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

    const ICON_ASSET_MAP = {
        cardIcon: "business-card.svg",
        idIcon: "id-card.svg",
        certificateIcon: "certificate.svg",
        inviteIcon: "invitation-card.svg",
        stickerIcon: "sticker.svg",
        labelIcon: "labels.svg",
        flyerIcon: "flyer.svg",
        customIcon: "custom-layout.svg",
        autoIcon: "auto-layout.svg",
        spaceIcon: "smart-space-fill.svg",
        duplexIcon: "back-to-back-printing.svg",
        exportIcon: "pdf-jpg-export.svg",
        marginIcon: "margin-control.svg",
        cropIcon: "crop-marks.svg",
        uploadIcon: "drag-drop-upload.svg",
        previewIcon: "live-preview.svg",
        optimizeIcon: "smart-sheet-optimization.svg",
        sheetIcon: "sheet-size.svg"
    };

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
        businessCardWidth: 2.15,
        businessCardHeight: 3.3,
        businessGapX: 0.25,
        businessGapY: 0.313,
        businessBorderMargin: 0.125,
        businessCardRotation: 90,
        businessFitToCard: false,
        previewBackgroundMode: "white",
        previewBackgroundColor: "#ffffff",
        businessCutLeft: 2.402,
        businessCutTop: 3.585,
        businessCutMarks: true,
        frontAsset: null,
        backAsset: null,
        editorImage: null,
        previewExportRect: null,
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
        const tool = params.get("tool") || params.get("id");
        if (tool && TOOL_PRESETS[tool]) {
            if (dom.previewMount || dom.editorMount) {
                document.body.classList.add("is-studio-mode");
            }
            applyToolPreset(tool);
        }
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
        dom.businessCardPanel = document.getElementById("businessCardPanel");
        dom.businessCardWidth = document.getElementById("businessCardWidth");
        dom.businessCardHeight = document.getElementById("businessCardHeight");
        dom.businessGapX = document.getElementById("businessGapX");
        dom.businessGapY = document.getElementById("businessGapY");
        dom.businessBorderMargin = document.getElementById("businessBorderMargin");
        dom.businessCardRotation = document.getElementById("businessCardRotation");
        dom.businessFitToCard = document.getElementById("businessFitToCardToggle");
        dom.previewBackgroundMode = document.getElementById("previewBackgroundMode");
        dom.previewBackgroundColor = document.getElementById("previewBackgroundColor");
        dom.businessCutMarksToggle = document.getElementById("businessCutMarksToggle");
        dom.businessSideLabel = document.getElementById("businessSideLabel");
        dom.resetBusinessCardButton = document.getElementById("resetBusinessCardButton");
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
        dom.thumbUploadButtons = Array.from(document.querySelectorAll("[data-thumb-upload]"));
        dom.frontThumb = document.getElementById("frontThumb");
        dom.backThumb = document.getElementById("backThumb");
        dom.frontName = document.getElementById("frontName");
        dom.backName = document.getElementById("backName");
        dom.editorMount = document.getElementById("layoutEditorMount");
        dom.previewMount = document.getElementById("sheetPreviewMount");
        dom.statusText = document.getElementById("studioStatusText");
        dom.layoutCount = document.getElementById("layoutCount");
        dom.layoutSheet = document.getElementById("layoutSheet");
        dom.layoutMeta = document.getElementById("layoutMeta");
        dom.livePreviewLabel = document.getElementById("livePreviewLabel");
        dom.supportNote = document.getElementById("supportNote");
        dom.exportPdf = document.getElementById("exportPdfButton");
        dom.exportJpg = document.getElementById("exportJpgButton");
        dom.layoutSheetLabel = document.getElementById("layoutSheetLabel");
        dom.smartFillPanel = document.getElementById("smartFillPanel");
    }

    function renderStaticSections() {
        if (dom.categoryGrid) {
            dom.categoryGrid.innerHTML = CATEGORY_DATA.map(function (item) {
                return `<article class="print-layout-tool-card" data-tool-target="${escapeHtml(item[0])}" tabindex="0" role="button" aria-label="Open ${escapeHtml(item[1])} tool">
                    <span class="print-layout-tool-glow" aria-hidden="true"></span>
                    <div class="print-layout-card-top">
                        <span class="print-layout-tool-chip">${escapeHtml(item[1])}</span>
                        <div class="print-layout-icon" aria-hidden="true">${iconHtml(item[3])}</div>
                    </div>
                    <h3>${escapeHtml(item[1])}</h3>
                    <p>${escapeHtml(item[2])}</p>
                    <div class="print-layout-tool-footer">
                        <span class="print-layout-tool-meta">${escapeHtml(item[0].replace(/-/g, " "))}</span>
                        <span class="print-layout-tool-launch" aria-hidden="true">${iconHtml("arrowIcon")}</span>
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
                openTool(button.getAttribute("data-tool-target") || "business-card");
            });
            button.addEventListener("keydown", function (event) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openTool(button.getAttribute("data-tool-target") || "business-card");
                }
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

        bindBusinessCardInput(dom.businessCardWidth, function (value) {
            state.businessCardWidth = value;
            syncUi();
            scheduleRender();
        });
        bindBusinessCardInput(dom.businessCardHeight, function (value) {
            state.businessCardHeight = value;
            syncUi();
            scheduleRender();
        });
        bindBusinessCardInput(dom.businessGapX, function (value) {
            state.businessGapX = value;
            syncUi();
            scheduleRender();
        });
        bindBusinessCardInput(dom.businessGapY, function (value) {
            state.businessGapY = value;
            syncUi();
            scheduleRender();
        });
        bindBusinessCardInput(dom.businessBorderMargin, function (value) {
            state.businessBorderMargin = value;
            scheduleRender();
        });

        if (dom.businessCardRotation) {
            dom.businessCardRotation.addEventListener("change", function (event) {
                state.businessCardRotation = Number(event.target.value) === 90 ? 90 : 0;
                syncUi();
                scheduleRender();
            });
        }

        if (dom.businessFitToCard) {
            dom.businessFitToCard.addEventListener("change", function (event) {
                state.businessFitToCard = Boolean(event.target.checked);
                scheduleRender();
            });
        }

        if (dom.previewBackgroundMode) {
            dom.previewBackgroundMode.addEventListener("change", function (event) {
                state.previewBackgroundMode = event.target.value === "color" ? "color" : "white";
                updateControlVisibility();
                syncUi();
                scheduleRender();
            });
        }

        if (dom.previewBackgroundColor) {
            dom.previewBackgroundColor.addEventListener("input", function (event) {
                state.previewBackgroundColor = event.target.value || "#ffffff";
                scheduleRender();
            });
        }

        if (dom.businessCutMarksToggle) {
            dom.businessCutMarksToggle.addEventListener("change", function (event) {
                state.businessCutMarks = Boolean(event.target.checked);
                scheduleRender();
            });
        }

        if (dom.resetBusinessCardButton) {
            dom.resetBusinessCardButton.addEventListener("click", function () {
                resetBusinessCardDefaults();
                syncUi();
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
                releaseAssetPreview(state.frontAsset);
                releaseAssetPreview(state.backAsset);
                state.frontAsset = null;
                state.backAsset = null;
                state.editorImage = null;
                updateThumbs();
                setStatus("Uploads cleared.");
                scheduleRender();
            });
        }

        dom.thumbUploadButtons.forEach(function (button) {
            button.addEventListener("click", function () {
                state.activeSide = button.getAttribute("data-thumb-upload") === "back" ? "back" : "front";
                updateSideButtons();
                selectActiveAsset();
                if (dom.fileInput) dom.fileInput.click();
            });
        });

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

    function openTool(toolId) {
        const safeTool = TOOL_PRESETS[toolId] ? toolId : "business-card";
        const targetUrl = buildToolUrl(safeTool);
        window.location.href = targetUrl;
    }

    function buildToolUrl(toolId) {
        const url = new URL("studio.html", window.location.href);
        url.searchParams.set("tool", toolId);
        return url.pathname + url.search + url.hash;
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

    function bindBusinessCardInput(input, onChange) {
        if (!input) return;
        const min = Number(input.min || 0);
        const max = Number(input.max || 100);
        const readValue = function () {
            const raw = String(input.value || "").trim().replace(/,/g, ".");
            if (!raw || raw === "." || raw === "-" || raw === "-.") return null;
            const value = Number(raw);
            if (!Number.isFinite(value)) return null;
            return roundTo(clamp(value, min, max), 3);
        };
        const commit = function () {
            const value = readValue();
            if (value === null) return;
            input.value = String(value);
            onChange(value);
        };
        input.addEventListener("change", function () {
            commit();
            syncUi();
            scheduleRender();
        });
        input.addEventListener("blur", function () {
            commit();
            syncUi();
            scheduleRender();
        });
        commit();
    }

    function setTool(toolId) {
        applyToolPreset(TOOL_PRESETS[toolId] ? toolId : "business-card");
        syncUi();
        scheduleRender();
    }

    function applyToolPreset(toolId) {
        state.toolId = TOOL_PRESETS[toolId] ? toolId : "business-card";
        const preset = TOOL_PRESETS[state.toolId];
        state.sheetSize = preset.sheet || "12x18";
        state.orientation = preset.orientation || "portrait";
        state.businessCardRotation = preset.businessCardRotation != null ? Number(preset.businessCardRotation) : state.businessCardRotation;
        state.businessFitToCard = preset.businessFitToCard != null ? Boolean(preset.businessFitToCard) : state.businessFitToCard;
        state.smartFill = preset.smartFill || (state.toolId === "invitation-small" ? "business-card" : "business-card");
        state.margin = Number(preset.margin != null ? preset.margin : state.margin);
        state.spacing = Number(preset.spacing != null ? preset.spacing : state.spacing);
        state.bleed = Number(preset.bleed != null ? preset.bleed : state.bleed);
        state.zoom = Number(preset.zoom != null ? preset.zoom : state.zoom);
        if (preset.customWidth != null) state.customWidth = preset.customWidth;
        if (preset.customHeight != null) state.customHeight = preset.customHeight;
    }

    function resetBusinessCardDefaults(shouldSync) {
        state.businessCardWidth = 2.15;
        state.businessCardHeight = 3.3;
        state.businessGapX = 0.25;
        state.businessGapY = 0.313;
        state.businessBorderMargin = 0.125;
        state.businessCardRotation = 90;
        state.businessFitToCard = false;
        state.previewBackgroundMode = "white";
        state.previewBackgroundColor = "#ffffff";
        state.businessCutLeft = 2.402;
        state.businessCutTop = 3.585;
        state.businessCutMarks = true;
        if (shouldSync !== false) {
            syncUi();
        }
    }

    function syncUi() {
        const tool = TOOL_PRESETS[state.toolId] || TOOL_PRESETS["business-card"];
        if (dom.toolSelect) dom.toolSelect.value = state.toolId;
        if (dom.sheetSelect) dom.sheetSelect.value = state.sheetSize;
        if (dom.orientationSelect) dom.orientationSelect.value = state.orientation;
        if (dom.smartFillSelect) dom.smartFillSelect.value = state.smartFill;
        if (dom.customWidth) dom.customWidth.value = state.customWidth;
        if (dom.customHeight) dom.customHeight.value = state.customHeight;
        if (dom.businessCardWidth) dom.businessCardWidth.value = state.businessCardWidth;
        if (dom.businessCardHeight) dom.businessCardHeight.value = state.businessCardHeight;
        if (dom.businessGapX) dom.businessGapX.value = state.businessGapX;
        if (dom.businessGapY) dom.businessGapY.value = state.businessGapY;
        if (dom.businessBorderMargin) dom.businessBorderMargin.value = state.businessBorderMargin;
        if (dom.businessCardRotation) dom.businessCardRotation.value = String(state.businessCardRotation);
        if (dom.businessFitToCard) dom.businessFitToCard.checked = state.businessFitToCard;
        if (dom.previewBackgroundMode) dom.previewBackgroundMode.value = state.previewBackgroundMode;
        if (dom.previewBackgroundColor) dom.previewBackgroundColor.value = state.previewBackgroundColor;
        if (dom.businessCutMarksToggle) dom.businessCutMarksToggle.checked = state.businessCutMarks;
        if (dom.cropMarks) dom.cropMarks.checked = state.cropMarks;
        if (dom.margin) dom.margin.value = state.margin;
        if (dom.spacing) dom.spacing.value = state.spacing;
        if (dom.bleed) dom.bleed.value = state.bleed;
        if (dom.zoom) dom.zoom.value = state.zoom;
        if (dom.businessSideLabel) {
            dom.businessSideLabel.textContent = state.activeSide === "back"
                ? "Editing back side."
                : "Editing front side.";
        }

        if (dom.layoutCount) dom.layoutCount.textContent = String(tool.count);
        if (dom.layoutSheet) dom.layoutSheet.textContent = getSheetPreset().label;
        if (dom.layoutSheetLabel) dom.layoutSheetLabel.textContent = getSheetPreset().label;
        if (dom.layoutMeta) {
            if (state.toolId === "business-card") {
                const businessLayout = getBusinessCardLayout(getSheetDimensions());
                dom.layoutMeta.textContent = (businessLayout.isLandscapeCard ? "Landscape" : "Portrait") + " card " + roundTo(businessLayout.cardWIn, 2) + " x " + roundTo(businessLayout.cardHIn, 2) + " in";
            } else {
                dom.layoutMeta.textContent = tool.sheet === "Custom" ? "Custom sheet layout active." : "Default sheet: " + tool.sheet;
            }
        }
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
        if (dom.businessCardPanel) {
            dom.businessCardPanel.classList.toggle("print-layout-hide", state.toolId !== "business-card");
        }
        const bgGroup = dom.previewBackgroundColor && dom.previewBackgroundColor.closest(".print-layout-control");
        if (bgGroup) {
            bgGroup.classList.toggle("print-layout-hide", state.previewBackgroundMode !== "color");
        }
        const marginGroup = dom.margin && dom.margin.closest(".print-layout-control");
        if (marginGroup) {
            marginGroup.classList.toggle("print-layout-hide", state.toolId === "business-card");
        }
        const spacingGroup = dom.spacing && dom.spacing.closest(".print-layout-control");
        if (spacingGroup) {
            spacingGroup.classList.toggle("print-layout-hide", state.toolId === "business-card");
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
        if (dom.frontName) dom.frontName.textContent = state.frontAsset ? state.frontAsset.name : "Front Side";
        if (dom.backName) dom.backName.textContent = state.backAsset ? state.backAsset.name : "Back Side";
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

    function isBusinessCardLandscape() {
        return state.toolId === "business-card" && Number(state.businessCardRotation) === 90;
    }

    function getBusinessCardLayout(dimensions) {
        const cols = 5;
        const rows = 5;
        const isLandscapeCard = isBusinessCardLandscape();
        const cardWIn = isLandscapeCard ? clamp(state.businessCardHeight, 1, 6) : clamp(state.businessCardWidth, 1, 6);
        const cardHIn = isLandscapeCard ? clamp(state.businessCardWidth, 1, 6) : clamp(state.businessCardHeight, 1, 6);
        const gapMinXIn = isLandscapeCard ? clamp(state.businessGapY, 0, 1) : clamp(state.businessGapX, 0, 1);
        const gapMinYIn = isLandscapeCard ? clamp(state.businessGapX, 0, 1) : clamp(state.businessGapY, 0, 1);
        const marginIn = clamp(state.businessBorderMargin, 0, 1);
        const usableWIn = Math.max(0, dimensions.width - marginIn * 2);
        const usableHIn = Math.max(0, dimensions.height - marginIn * 2);
        const minTotalWIn = cols * cardWIn + (cols - 1) * gapMinXIn;
        const minTotalHIn = rows * cardHIn + (rows - 1) * gapMinYIn;
        const fitScale = Math.min(
            1,
            usableWIn / Math.max(minTotalWIn, 0.001),
            usableHIn / Math.max(minTotalHIn, 0.001)
        );
        const drawCardWIn = cardWIn * fitScale;
        const drawCardHIn = cardHIn * fitScale;
        const gapXIn = cols > 1 ? Math.max(0, (usableWIn - cols * drawCardWIn) / (cols - 1)) : 0;
        const gapYIn = rows > 1 ? Math.max(0, (usableHIn - rows * drawCardHIn) / (rows - 1)) : 0;
        return {
            cols: cols,
            rows: rows,
            isLandscapeCard: isLandscapeCard,
            marginIn: marginIn,
            cardWIn: drawCardWIn,
            cardHIn: drawCardHIn,
            gapXIn: gapXIn,
            gapYIn: gapYIn
        };
    }

    async function handleUpload(file) {
        if (!isSupportedFile(file)) {
            setStatus("Please upload JPG, PNG, WEBP, TIFF, or PDF files.");
            return;
        }

        try {
            const previousAsset = state.activeSide === "back" ? state.backAsset : state.frontAsset;

            const assetPreview = await loadAssetPreview(file);
            const asset = {
                file: file,
                name: file.name,
                preview: assetPreview.preview,
                previewUrl: assetPreview.previewUrl,
                exportBlob: assetPreview.exportBlob,
                sourceKind: assetPreview.sourceKind,
                image: await loadImage(assetPreview.preview)
            };

            if (state.activeSide === "back") {
                state.backAsset = asset;
            } else {
                state.frontAsset = asset;
            }

            releaseAssetPreview(previousAsset);

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
        if (!window.Konva || !dom.previewMount) {
            return;
        }

        if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js";
        }

        if (dom.editorMount) {
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

            canvas.editorStage.on("click tap", function (event) {
                if (event.target === canvas.editorStage) {
                    canvas.editorTransformer.nodes([]);
                    canvas.editorLayer.batchDraw();
                }
            });
        }

        canvas.previewStage = new Konva.Stage({
            container: dom.previewMount,
            width: dom.previewMount.clientWidth || 720,
            height: dom.previewMount.clientHeight || 560
        });
        canvas.previewLayer = new Konva.Layer();
        canvas.previewStage.add(canvas.previewLayer);

        resizeStages();
    }

    function resizeStages() {
        if (!canvas.previewStage) return;
        if (canvas.editorStage && dom.editorMount) {
            canvas.editorStage.width(dom.editorMount.clientWidth || 520);
            canvas.editorStage.height(dom.editorMount.clientHeight || 380);
        }
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
        if (!canvas.previewStage) return;
        if (canvas.editorStage) renderEditor();
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
            fillLinearGradientColorStops: [0, "rgba(255,255,255,0.95)", 0.45, "rgba(219,234,254,0.95)", 1, "rgba(238,242,255,0.95)"]
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
            const fit = fitToBox(asset.image, box.width, box.height, "cover");
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
                fill: "rgba(255,255,255,0.8)",
                stroke: "rgba(148,163,184,0.26)",
                dash: [12, 10],
                strokeWidth: 1.2
            }));
            layer.add(new Konva.Text({
                x: 110,
                y: Math.max(92, height * 0.32),
                width: width - 220,
                text: "Drop a JPG, PNG, WEBP, or PDF file here to begin editing the master tile.",
                fill: "#1d4ed8",
                align: "center",
                fontSize: 20,
                fontStyle: "bold"
            }));
            layer.add(new Konva.Text({
                x: 110,
                y: Math.max(146, height * 0.46),
                width: width - 220,
                text: "Drag, resize, and rotate handles are enabled once an asset loads.",
                fill: "#5b6079",
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
        const dimensions = getSheetDimensions();
        const ratio = dimensions.width / dimensions.height;
        const zoom = state.zoom / 100;
        const backgroundColor = state.previewBackgroundMode === "color" ? (state.previewBackgroundColor || "#ffffff") : "#ffffff";
        const isBusiness = state.toolId === "business-card";
        const baseWidth = isBusiness
            ? Math.max(280, Math.min(width, height * ratio))
            : Math.max(320, Math.min(width - 24, height * ratio - 24));
        const previewWidth = baseWidth * zoom;
        const previewHeight = previewWidth / ratio;
        const x = Math.max(0, (width - previewWidth) / 2);
        const y = Math.max(0, (height - previewHeight) / 2);
        state.previewExportRect = { x: x, y: y, width: previewWidth, height: previewHeight };
        const pad = Math.max(10, (isBusiness ? state.businessBorderMargin : state.margin * 0.8) * 96 * zoom);
        const spacing = Math.max(8, (isBusiness ? state.businessGapX : state.spacing / 18) * 96 * zoom);
        const asset = activeAsset();
        const image = asset && asset.image ? asset.image : null;

        const outerGlow = isBusiness ? 0 : 4;
        if (outerGlow > 0) {
            layer.add(new Konva.Rect({
                x: x - outerGlow, y: y - outerGlow, width: previewWidth + outerGlow * 2, height: previewHeight + outerGlow * 2,
                cornerRadius: 26,
                fillLinearGradientStartPoint: { x: 0, y: 0 },
                fillLinearGradientEndPoint: { x: previewWidth, y: previewHeight },
                fillLinearGradientColorStops: [0, "rgba(255,255,255,0.96)", 0.5, "rgba(239,246,255,0.96)", 1, "rgba(226,232,240,0.96)"]
            }));
        }
        if (!isBusiness) {
        layer.add(new Konva.Rect({
            x: x, y: y, width: previewWidth, height: previewHeight,
            cornerRadius: 22,
            fill: backgroundColor,
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
        }

        const contentX = isBusiness ? x : x + pad;
        const contentY = isBusiness ? y + 6 : y + pad + 12;
        const contentW = isBusiness ? previewWidth : previewWidth - pad * 2;
        const contentH = isBusiness ? previewHeight - 8 : previewHeight - pad * 2 - 24;

        if (state.toolId === "business-card") {
            renderBusinessCardPreview(layer, { x: contentX, y: contentY, width: contentW, height: contentH }, image, zoom, dimensions, backgroundColor);
        } else if (state.toolId === "invitation-small") {
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

        layer.draw();
    }

    function renderBusinessCardPreview(layer, box, image, zoom, dimensions, backgroundColor) {
        const layout = getBusinessCardLayout(dimensions);
        const cols = layout.cols;
        const rows = layout.rows;
        const cardWIn = layout.cardWIn;
        const cardHIn = layout.cardHIn;
        const gapXIn = layout.gapXIn;
        const gapYIn = layout.gapYIn;
        const marginIn = layout.marginIn;

        const sheetWIn = dimensions.width;
        const sheetHIn = dimensions.height;
        const scale = Math.min((box.width - 8) / sheetWIn, (box.height - 8) / sheetHIn);
        const sheetW = sheetWIn * scale;
        const sheetH = sheetHIn * scale;
        const sheetX = box.x + Math.max(0, (box.width - sheetW) / 2);
        const sheetY = box.y + Math.max(0, (box.height - sheetH) / 2);

        layer.add(new Konva.Rect({
            x: sheetX,
            y: sheetY,
            width: sheetW,
            height: sheetH,
            fill: backgroundColor,
            listening: false,
            stroke: "rgba(15,23,42,0.14)",
            strokeWidth: 1,
            shadowColor: "rgba(2,6,23,0.22)",
            shadowBlur: 22,
            shadowOpacity: 0.35,
            shadowOffset: { x: 0, y: 12 }
        }));

        const pxPerIn = scale;
        const marginPx = marginIn * pxPerIn;
        const drawCardW = cardWIn * pxPerIn;
        const drawCardH = cardHIn * pxPerIn;
        const drawGapX = gapXIn * pxPerIn;
        const drawGapY = gapYIn * pxPerIn;
        const usableW = sheetW - marginPx * 2;
        const usableH = sheetH - marginPx * 2;
        const drawTotalW = cols * drawCardW + (cols - 1) * drawGapX;
        const drawTotalH = rows * drawCardH + (rows - 1) * drawGapY;
        const startX = sheetX + marginPx + Math.max(0, (usableW - drawTotalW) / 2);
        const startY = sheetY + marginPx + Math.max(0, (usableH - drawTotalH) / 2);

        state.previewExportRect = {
            x: sheetX,
            y: sheetY,
            width: sheetW,
            height: sheetH
        };

        for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < cols; c += 1) {
                const cellX = startX + c * (drawCardW + drawGapX);
                const cellY = startY + r * (drawCardH + drawGapY);
                layer.add(makeBusinessCell({
                    x: cellX,
                    y: cellY,
                    width: drawCardW,
                    height: drawCardH,
                    image: image,
                    fitMode: state.businessFitToCard ? "stretch" : "contain",
                    index: r * cols + c + 1
                }));
            }
        }

        if (state.businessCutMarks) {
            drawBusinessCutMarks(
                layer,
                {
                    x: startX,
                    y: startY,
                    cardW: drawCardW,
                    cardH: drawCardH,
                    gapX: drawGapX,
                    gapY: drawGapY,
                    fitScale: scale
                },
                cols,
                rows
            );
        }
    }

    function drawBusinessCutMarks(layer, grid, cols, rows) {
        const markColor = "rgba(37, 99, 235, 0.72)";
        const strokeWidth = 1.2;
        const stepX = grid.cardW + grid.gapX;
        const stepY = grid.cardH + grid.gapY;
        const defaultCutLeft = 2.402;
        const defaultCutTop = 3.585;
        const shiftX = (clamp(state.businessCutLeft, 0, 12) - defaultCutLeft) * 96 * grid.fitScale;
        const shiftY = (clamp(state.businessCutTop, 0, 18) - defaultCutTop) * 96 * grid.fitScale;
        const firstCutX = grid.x + grid.cardW + (grid.gapX / 2) + shiftX;
        const firstCutY = grid.y + grid.cardH + (grid.gapY / 2) + shiftY;
        const size = Math.max(4, Math.min(grid.gapX, grid.gapY) * 0.25);

        for (let r = 0; r < rows - 1; r += 1) {
            for (let c = 0; c < cols - 1; c += 1) {
                const x = firstCutX + c * stepX;
                const y = firstCutY + r * stepY;
                layer.add(new Konva.Line({
                    points: [x - size / 2, y, x + size / 2, y],
                    stroke: markColor,
                    strokeWidth: strokeWidth,
                    lineCap: "round"
                }));
                layer.add(new Konva.Line({
                    points: [x, y - size / 2, x, y + size / 2],
                    stroke: markColor,
                    strokeWidth: strokeWidth,
                    lineCap: "round"
                }));
            }
        }
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

    function makeBusinessCell(opts) {
        const group = new Konva.Group({ x: opts.x, y: opts.y });
        group.add(new Konva.Rect({
            x: 0, y: 0, width: opts.width, height: opts.height,
            cornerRadius: 0,
            fill: "rgba(255,255,255,0.98)",
            stroke: "rgba(15,23,42,0.10)",
            strokeWidth: 1,
            shadowColor: "rgba(2,6,23,0.08)",
            shadowBlur: 8,
            shadowOpacity: 0.16,
            shadowOffset: { x: 0, y: 4 }
        }));

        if (opts.image) {
            if (opts.fitMode === "stretch") {
                group.add(new Konva.Image({
                    image: opts.image,
                    x: 0,
                    y: 0,
                    width: opts.width,
                    height: opts.height
                }));
            } else {
                const inset = Math.max(2, Math.min(opts.width, opts.height) * 0.08);
                const imageFit = fitToBox(
                    opts.image,
                    Math.max(1, opts.width - inset * 2),
                    Math.max(1, opts.height - inset * 2),
                    "contain"
                );
                group.add(new Konva.Image({
                    image: opts.image,
                    x: inset + imageFit.x,
                    y: inset + imageFit.y,
                    width: imageFit.width,
                    height: imageFit.height,
                    crop: imageFit.crop
                }));
            }
        } else {
            group.add(new Konva.Rect({
                x: 0, y: 0, width: opts.width, height: opts.height,
                cornerRadius: 0,
                fillLinearGradientStartPoint: { x: 0, y: 0 },
                fillLinearGradientEndPoint: { x: opts.width, y: opts.height },
                fillLinearGradientColorStops: [0, "rgba(99,102,241,0.85)", 1, "rgba(244,63,94,0.85)"]
            }));
            group.add(new Konva.Text({
                x: 0, y: 0, width: opts.width, height: opts.height,
                text: "Business " + opts.index,
                align: "center",
                verticalAlign: "middle",
                fill: "#ffffff",
                fontSize: Math.max(10, Math.min(opts.width, opts.height) * 0.16),
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

    async function loadAssetPreview(file) {
        if (isPdfFile(file)) {
            const preview = await renderPdfPreview(file);
            return {
                preview: preview,
                previewUrl: preview,
                exportBlob: await dataUrlToBlob(preview),
                sourceKind: "pdf-preview"
            };
        }

        if (shouldUseBackendPreview(file)) {
            try {
                const previewBlob = await fetchBackendPreview(file);
                const previewUrl = URL.createObjectURL(previewBlob);
                return {
                    preview: previewUrl,
                    previewUrl: previewUrl,
                    exportBlob: file,
                    sourceKind: "backend-preview"
                };
            } catch (_error) {
                if (!isTiffFile(file)) {
                    const previewUrl = URL.createObjectURL(file);
                    return {
                        preview: previewUrl,
                        previewUrl: previewUrl,
                        exportBlob: file,
                        sourceKind: "local-fallback"
                    };
                }
                throw _error;
            }
        }

        const previewUrl = URL.createObjectURL(file);
        return {
            preview: previewUrl,
            previewUrl: previewUrl,
            exportBlob: file,
            sourceKind: "local-file"
        };
    }

    async function fetchBackendPreview(file) {
        const backendUrl = resolveBackendBaseUrl("/tools/aj-print-layout-pro/preview");
        const formData = new FormData();
        formData.append("file", file, file.name || "upload");

        const response = await fetch(backendUrl, {
            method: "POST",
            body: formData,
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error("Backend preview failed.");
        }

        return response.blob();
    }

    async function dataUrlToBlob(dataUrl) {
        const response = await fetch(dataUrl);
        return response.blob();
    }

    function resolveBackendBaseUrl(path) {
        const base = getBackendBaseUrl();
        return new URL(path, base).href;
    }

    function getBackendBaseUrl() {
        if (isLocalRuntime()) {
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

            return LOCAL_BACKEND_BASE_URL;
        }

        const dedicatedMeta = document.querySelector('meta[name="ajartivo-print-layout-backend-url"]');
        if (dedicatedMeta && cleanText(dedicatedMeta.content)) {
            return cleanText(dedicatedMeta.content).replace(/\/+$/, "");
        }

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

        return LIVE_BACKEND_BASE_URL;
    }

    function isLocalRuntime() {
        const hostname = String(window.location && window.location.hostname || "").toLowerCase();
        return !hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    }

    function releaseAssetPreview(asset) {
        const previewUrl = asset && asset.previewUrl ? asset.previewUrl : asset && asset.preview;
        if (typeof previewUrl === "string" && previewUrl.startsWith("blob:")) {
            try {
                URL.revokeObjectURL(previewUrl);
            } catch (_error) {
                // Ignore revocation failures.
            }
        }
    }

    async function exportSheet(format) {
        if (state.toolId === "business-card" && hasRenderableBackendAssets()) {
            try {
                await exportSheetViaBackend(format);
                return;
            } catch (error) {
                console.error(error);
                setStatus("Backend export failed, falling back to browser export.");
            }
        }

        await exportSheetLegacy(format);
    }

    function hasRenderableBackendAssets() {
        return Boolean((state.frontAsset && state.frontAsset.exportBlob) || (state.backAsset && state.backAsset.exportBlob));
    }

    async function exportSheetViaBackend(format) {
        const backendUrl = resolveBackendBaseUrl("/tools/aj-print-layout-pro/export");
        const fileBase = slugify((TOOL_PRESETS[state.toolId] || TOOL_PRESETS["business-card"]).label + "-" + state.sheetSize);
        const formData = new FormData();
        formData.append("format", format === "jpg" ? "jpg" : "pdf");
        formData.append("settings", JSON.stringify({
            toolId: state.toolId,
            sheetSize: state.sheetSize,
            orientation: state.orientation,
            businessCardWidth: state.businessCardWidth,
            businessCardHeight: state.businessCardHeight,
            businessGapX: state.businessGapX,
            businessGapY: state.businessGapY,
            businessBorderMargin: state.businessBorderMargin,
            businessCardRotation: state.businessCardRotation,
            businessFitToCard: state.businessFitToCard,
            businessCutMarks: state.businessCutMarks,
            previewBackgroundMode: state.previewBackgroundMode,
            previewBackgroundColor: state.previewBackgroundColor,
            customWidth: state.customWidth,
            customHeight: state.customHeight
        }));
        formData.append("activeSide", state.activeSide);

        const frontAsset = state.frontAsset || state.backAsset;
        const backAsset = state.backAsset;
        if (frontAsset && frontAsset.exportBlob) {
            formData.append("frontFile", frontAsset.exportBlob, frontAsset.name || "front.jpg");
        }
        if (backAsset && backAsset.exportBlob) {
            formData.append("backFile", backAsset.exportBlob, backAsset.name || "back.jpg");
        }

        setStatus("Preparing backend export...");
        await waitForPaint();

        const response = await fetch(backendUrl, {
            method: "POST",
            body: formData,
            credentials: "include"
        });

        if (!response.ok) {
            const message = await readErrorText(response);
            throw new Error(message || "Backend export failed.");
        }

        const blob = await response.blob();
        const fileName = format === "jpg" ? `${fileBase}.jpg` : `${fileBase}.pdf`;
        downloadBlob(blob, fileName);
        setStatus(format === "jpg" ? "JPG export generated by backend at 300 DPI." : "PDF export generated by backend with front and back pages.");
    }

    async function exportSheetLegacy(format) {
        if (!canvas.previewStage) return;
        const fileBase = slugify((TOOL_PRESETS[state.toolId] || TOOL_PRESETS["business-card"]).label + "-" + state.sheetSize);
        const sheet = getSheetDimensions();
        const exportDpi = 300;
        const exportRect = state.previewExportRect || { x: 0, y: 0, width: canvas.previewStage.width(), height: canvas.previewStage.height() };
        const targetWidth = Math.max(1, Math.round(sheet.width * exportDpi));
        const targetHeight = Math.max(1, Math.round(sheet.height * exportDpi));
        const pixelRatio = targetWidth / Math.max(1, exportRect.width);
        setStatus("Preparing export...");
        await waitForPaint();
        const target = patchJpegDpi(canvas.previewStage.toDataURL({
            x: exportRect.x,
            y: exportRect.y,
            width: exportRect.width,
            height: exportRect.height,
            pixelRatio: pixelRatio,
            mimeType: "image/jpeg",
            quality: 0.98
        }), exportDpi);

        if (format === "jpg") {
            downloadUrl(target, fileBase + ".jpg");
            setStatus("JPG export generated at " + exportDpi + " DPI.");
            return;
        }

        if (!window.jspdf || !window.jspdf.jsPDF) {
            setStatus("jsPDF is unavailable, so PDF export could not run.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: sheet.width >= sheet.height ? "landscape" : "portrait",
            unit: "in",
            format: [sheet.width, sheet.height]
        });
        doc.addImage(target, "JPEG", 0, 0, sheet.width, sheet.height, undefined, "FAST");
        doc.save(fileBase + ".pdf");
        setStatus("PDF export generated at sheet size.");
    }

    function waitForPaint() {
        return new Promise(function (resolve) {
            requestAnimationFrame(function () {
                requestAnimationFrame(resolve);
            });
        });
    }

    function patchJpegDpi(dataUrl, dpi) {
        const prefix = "data:image/jpeg;base64,";
        if (!dataUrl || dataUrl.indexOf(prefix) !== 0) {
            return dataUrl;
        }

        const bytes = base64ToBytes(dataUrl.slice(prefix.length));
        if (bytes.length < 20 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
            return dataUrl;
        }

        let offset = 2;
        while (offset + 3 < bytes.length) {
            if (bytes[offset] !== 0xFF) {
                offset += 1;
                continue;
            }

            const marker = bytes[offset + 1];
            if (marker === 0xDA) {
                break;
            }

            const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
            if (marker === 0xE0 && offset + 17 < bytes.length) {
                const ident = String.fromCharCode(
                    bytes[offset + 4],
                    bytes[offset + 5],
                    bytes[offset + 6],
                    bytes[offset + 7],
                    bytes[offset + 8]
                );
                if (ident === "JFIF\u0000") {
                    bytes[offset + 11] = 0x01;
                    bytes[offset + 12] = (dpi >> 8) & 0xFF;
                    bytes[offset + 13] = dpi & 0xFF;
                    bytes[offset + 14] = (dpi >> 8) & 0xFF;
                    bytes[offset + 15] = dpi & 0xFF;
                    return prefix + bytesToBase64(bytes);
                }
            }

            offset += 2 + segmentLength;
        }

        return dataUrl;
    }

    function base64ToBytes(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function bytesToBase64(bytes) {
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
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
        const dimensions = getSheetDimensions();
        return dimensions.width / dimensions.height;
    }

    function getSheetDimensions() {
        if (state.sheetSize === "Custom") {
            const width = clamp(state.customWidth, 4, 40);
            const height = clamp(state.customHeight, 4, 40);
            return state.orientation === "portrait"
                ? { width: Math.min(width, height), height: Math.max(width, height) }
                : { width: Math.max(width, height), height: Math.min(width, height) };
        }

        const preset = getSheetPreset();
        const width = Number(preset.width || 18);
        const height = Number(preset.height || 12);
        return state.orientation === "portrait"
            ? { width: Math.min(width, height), height: Math.max(width, height) }
            : { width: Math.max(width, height), height: Math.min(width, height) };
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
        return type.startsWith("image/") || type === "application/pdf" || /\.(jpg|jpeg|png|webp|avif|gif|bmp|tif|tiff|pdf)$/.test(name);
    }

    function isPdfFile(file) {
        const name = String(file && file.name || "").toLowerCase();
        const type = String(file && file.type || "").toLowerCase();
        return type === "application/pdf" || /\.pdf$/.test(name);
    }

    function isTiffFile(file) {
        const name = String(file && file.name || "").toLowerCase();
        const type = String(file && file.type || "").toLowerCase();
        return type === "image/tiff" || type === "image/tif" || /\.(tif|tiff)$/.test(name);
    }

    function shouldUseBackendPreview(file) {
        return isTiffFile(file) || Number(file && file.size || 0) >= BACKEND_PREVIEW_THRESHOLD_BYTES;
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

    function downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        downloadUrl(url, fileName);
        window.setTimeout(function () {
            try {
                URL.revokeObjectURL(url);
            } catch (_error) {
                // Ignore revocation failures.
            }
        }, 4000);
    }

    async function readErrorText(response) {
        try {
            return cleanText(await response.text());
        } catch (_error) {
            return "";
        }
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

    function roundTo(value, decimals) {
        const factor = Math.pow(10, decimals || 0);
        return Math.round(Number(value) * factor) / factor;
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
        const assetFile = ICON_ASSET_MAP[name];
        if (assetFile) {
            return `<img src="../icons/${assetFile}" alt="" aria-hidden="true" draggable="false">`;
        }

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
            sheetIcon: '<svg viewBox="0 0 24 24"><path d="M7 3h8l4 4v14H7z"></path><path d="M15 3v4h4"></path></svg>',
            arrowIcon: '<svg viewBox="0 0 24 24"><path d="M5 12h12"></path><path d="M13 6l6 6-6 6"></path></svg>'
        };
        return icons[name] || icons.sheetIcon;
    }
})();
