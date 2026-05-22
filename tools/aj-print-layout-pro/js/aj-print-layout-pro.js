(function () {
    "use strict";

    const LOCAL_BACKEND_BASE_URL = "http://localhost:5101";
    const LIVE_BACKEND_BASE_URL = "https://print-layout-backend.vercel.app";
    const EXPORT_MODAL_COUNTDOWN_START = 3;
    const EXPORT_MODAL_STEP_MS = 650;
    const EXPORT_MODAL_MIN_VISIBLE_MS = 1800;
    const EXPORT_DPI = 300;
    const PDF_JS_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.js";
    const PDF_JS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js";
    let pdfJsLoadPromise = null;

    const TOOL_PRESETS = {
        "business-card": {
            label: "Business Card",
            count: 25,
            cols: 5,
            rows: 5,
            sheet: "12x18",
            fit: "cover",
            orientation: "portrait",
            businessCardRotation: 0,
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

    const state = {
        toolId: "business-card",
        activeSide: "front",
        sheetSize: "12x18",
        orientation: "portrait",
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
        businessCardRotation: 0,
        businessFitToCard: false,
        previewBackgroundMode: "white",
        previewBackgroundColor: "#ffffff",
        businessCutLeft: 2.402,
        businessCutTop: 3.585,
        businessCutMarks: true,
        frontAsset: null,
        backAsset: null,
        previewExportRect: null,
        isExporting: false
    };

    const dom = {};
    const canvas = {
        previewStage: null,
        previewLayer: null
    };

    const exportUi = {
        countdownTimer: 0,
        startTime: 0,
        isVisible: false,
        isErrored: false,
        lastFormat: "",
        lastError: "",
        abortController: null,
        dismissRequested: false
    };

    const previewZoomDragState = {
        active: false,
        pointerId: null,
        startY: 0,
        startZoom: 100
    };

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        cacheDom();
        applyQueryParams();
        bindUi();
        syncUi();
        initCanvas();
        scheduleRender();
    }

    function applyQueryParams() {
        const params = new URLSearchParams(window.location.search);
        const tool = params.get("tool") || params.get("id");
        if (tool && TOOL_PRESETS[tool]) {
            if (dom.previewMount) {
                document.body.classList.add("is-studio-mode");
            }
            applyToolPreset(tool);
        }
    }

    function cacheDom() {
        dom.smartFillPanel = document.getElementById("smartFillPanel");
        dom.smartFillButtons = Array.from(document.querySelectorAll("[data-smart-fill]"));
        dom.toolSelect = document.getElementById("toolModeSelect");
        dom.sheetSelect = document.getElementById("sheetSizeSelect");
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
        dom.thumbRotateButtons = Array.from(document.querySelectorAll("[data-thumb-rotate]"));
        dom.frontThumb = document.getElementById("frontThumb");
        dom.backThumb = document.getElementById("backThumb");
        dom.frontName = document.getElementById("frontName");
        dom.backName = document.getElementById("backName");
        dom.previewMount = document.getElementById("sheetPreviewMount");
        dom.statusText = document.getElementById("studioStatusText");
        dom.layoutCount = document.getElementById("layoutCount");
        dom.layoutSheet = document.getElementById("layoutSheet");
        dom.layoutMeta = document.getElementById("layoutMeta");
        dom.livePreviewLabel = document.getElementById("livePreviewLabel");
        dom.supportNote = document.getElementById("supportNote");
        dom.exportPdf = document.getElementById("exportPdfButton");
        dom.exportJpg = document.getElementById("exportJpgButton");
        dom.exportModal = document.getElementById("exportStatusModal");
        dom.exportModalBackdrop = dom.exportModal && dom.exportModal.querySelector(".print-layout-export-modal-backdrop");
        dom.exportModalClose = document.getElementById("exportModalCloseButton");
        dom.exportModalTitle = document.getElementById("exportModalTitle");
        dom.exportModalStatus = document.getElementById("exportModalStatus");
        dom.exportModalCountdown = document.getElementById("exportModalCountdown");
        dom.exportModalProgress = document.getElementById("exportModalProgress");
        dom.exportModalNote = document.getElementById("exportModalNote");
        dom.exportModalRetry = document.getElementById("exportModalRetryButton");
        dom.layoutSheetLabel = document.getElementById("layoutSheetLabel");
        dom.smartFillPanel = document.getElementById("smartFillPanel");
    }

    function bindUi() {
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
                setSheetOrientation(event.target.value);
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

        dom.thumbRotateButtons.forEach(function (button) {
            button.addEventListener("click", function () {
                const side = button.getAttribute("data-thumb-rotate") === "back" ? "back" : "front";
                void rotateUploadedAsset(side);
            });
        });

        if (dom.exportPdf) {
            dom.exportPdf.addEventListener("click", function () {
                runExport("pdf");
            });
        }

        if (dom.exportJpg) {
            dom.exportJpg.addEventListener("click", function () {
                runExport("jpg");
            });
        }

        if (dom.exportModalRetry) {
            dom.exportModalRetry.addEventListener("click", function () {
                if (exportUi.lastFormat && !state.isExporting) {
                    runExport(exportUi.lastFormat);
                }
            });
        }

        if (dom.exportModalClose) {
            dom.exportModalClose.addEventListener("click", function () {
                closeExportModal();
            });
        }

        if (dom.exportModalBackdrop) {
            dom.exportModalBackdrop.addEventListener("click", function () {
                closeExportModal();
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
        setSheetOrientation(preset.orientation || "portrait");
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
        setSheetOrientation("portrait");
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
        if (dom.smartFillSelect) dom.smartFillSelect.value = state.smartFill;
        if (dom.customWidth) dom.customWidth.value = state.customWidth;
        if (dom.customHeight) dom.customHeight.value = state.customHeight;
        if (dom.businessCardWidth) dom.businessCardWidth.value = state.businessCardWidth;
        if (dom.businessCardHeight) dom.businessCardHeight.value = state.businessCardHeight;
        if (dom.businessGapX) dom.businessGapX.value = state.businessGapX;
        if (dom.businessGapY) dom.businessGapY.value = state.businessGapY;
        if (dom.businessBorderMargin) dom.businessBorderMargin.value = state.businessBorderMargin;
        if (dom.businessCardRotation) dom.businessCardRotation.value = state.orientation === "portrait" ? "0" : "90";
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
        if (dom.thumbRotateButtons) {
            dom.thumbRotateButtons.forEach(function (button) {
                const side = button.getAttribute("data-thumb-rotate") === "back" ? "back" : "front";
                const asset = side === "back" ? state.backAsset : state.frontAsset;
                const sideLabel = side === "back" ? "back" : "front";
                button.disabled = !asset || asset.isRotating;
                button.setAttribute(
                    "aria-label",
                    asset ? "Rotate " + sideLabel + " design 90 degrees" : "Upload " + sideLabel + " design before rotating"
                );
            });
        }
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
        return state.toolId === "business-card" && state.orientation === "landscape";
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
                image: assetPreview.image || await loadImage(assetPreview.preview),
                rotation: 0,
                isRotating: false
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
        canvas.previewStage.width(dom.previewMount.clientWidth || 720);
        canvas.previewStage.height(dom.previewMount.clientHeight || 560);
        scheduleRender();
    }

    function ensurePdfJs() {
        if (window.pdfjsLib) {
            if (window.pdfjsLib.GlobalWorkerOptions) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
            }
            return Promise.resolve(window.pdfjsLib);
        }

        if (!pdfJsLoadPromise) {
            pdfJsLoadPromise = new Promise(function (resolve, reject) {
                const script = document.createElement("script");
                script.src = PDF_JS_CDN_URL;
                script.async = true;
                script.onload = function () {
                    if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
                        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
                    }
                    resolve(window.pdfjsLib);
                };
                script.onerror = function () {
                    pdfJsLoadPromise = null;
                    reject(new Error("PDF.js unavailable"));
                };
                document.head.appendChild(script);
            });
        }

        return pdfJsLoadPromise;
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
        renderPreview();
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
        const previewScale = Math.max(1, previewWidth / Math.max(1, dimensions.width));
        const pad = Math.max(10, (isBusiness ? state.businessBorderMargin : toInches(state.margin)) * previewScale);
        const spacing = Math.max(8, (isBusiness ? state.businessGapX : toInches(state.spacing)) * previewScale);
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
        return ensurePdfJs().then(function () {
            return file.arrayBuffer();
        }).then(function (buffer) {
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
            const previewImage = await loadImage(preview);
            return {
                preview: preview,
                previewUrl: preview,
                exportBlob: await dataUrlToBlob(preview),
                sourceKind: "pdf-preview",
                image: previewImage
            };
        }

        if (shouldUseBackendPreview(file)) {
            const previewBlob = await fetchBackendPreview(file);
            const previewUrl = URL.createObjectURL(previewBlob);
            return {
                preview: previewUrl,
                previewUrl: previewUrl,
                exportBlob: file,
                sourceKind: "backend-preview",
                image: await loadImage(previewUrl)
            };
        }

        const previewUrl = URL.createObjectURL(file);
        try {
            const image = await loadImage(previewUrl);
            return {
                preview: previewUrl,
                previewUrl: previewUrl,
                exportBlob: file,
                sourceKind: "local-file",
                image: image
            };
        } catch (error) {
            try {
                URL.revokeObjectURL(previewUrl);
            } catch (_revokeError) {
                // Ignore revocation failures.
            }
            throw error;
        }
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

    function toInches(value) {
        return Number(value || 0) / 72;
    }

    function buildExportPayload(format) {
        const sheet = buildExportSheetSpec();
        const pages = buildExportPages(sheet, format);
        const sources = {
            front: buildSourceDescriptor(state.frontAsset, "front"),
            back: buildSourceDescriptor(state.backAsset, "back")
        };
        const layout = {
            version: 2,
            toolId: state.toolId,
            activeSide: state.activeSide,
            sheet: sheet,
            pages: pages,
            items: pages.length ? pages[0].items : [],
            marks: pages.length ? pages[0].marks : [],
            sources: sources,
            export: { format: format === "jpg" ? "jpg" : "pdf" }
        };

        return {
            settings: {
                toolId: state.toolId,
                sheetSize: state.sheetSize,
                orientation: state.orientation,
                activeSide: state.activeSide,
                businessCardWidth: state.businessCardWidth,
                businessCardHeight: state.businessCardHeight,
                businessGapX: state.businessGapX,
                businessGapY: state.businessGapY,
                businessBorderMargin: state.businessBorderMargin,
                businessCardRotation: state.businessCardRotation,
                businessFitToCard: state.businessFitToCard,
                businessCutMarks: state.businessCutMarks,
                businessCutLeft: state.businessCutLeft,
                businessCutTop: state.businessCutTop,
                previewBackgroundMode: state.previewBackgroundMode,
                previewBackgroundColor: state.previewBackgroundColor,
                customWidth: state.customWidth,
                customHeight: state.customHeight,
                margin: state.margin,
                spacing: state.spacing,
                bleed: state.bleed,
                zoom: state.zoom,
                sheet: sheet,
                layout: layout,
                pages: pages,
                items: layout.items,
                export: layout.export
            },
            frontFile: buildFilePayload(state.frontAsset, "front"),
            backFile: buildFilePayload(state.backAsset, "back"),
            hasBackSide: Boolean(state.backAsset)
        };
    }

    function buildExportSheetSpec() {
        const dimensions = getSheetDimensions();
        return {
            width: Number(dimensions.width) || 1,
            height: Number(dimensions.height) || 1,
            dpi: EXPORT_DPI
        };
    }

    function buildExportPages(sheet, format) {
        const pages = [];
        const sides = format === "jpg"
            ? [state.activeSide === "back" && state.backAsset ? "back" : "front"]
            : (state.backAsset ? ["front", "back"] : ["front"]);

        for (let i = 0; i < sides.length; i += 1) {
            const side = sides[i];
            const asset = getAssetForSide(side);
            if (!asset) {
                continue;
            }

            const page = buildLayoutPage(side, asset, sheet);
            if (page && page.items.length) {
                pages.push(page);
            }
        }

        return pages;
    }

    function buildLayoutPage(side, asset, sheet) {
        if (state.toolId === "business-card") {
            return buildBusinessCardPage(side, asset, sheet);
        }

        if (state.toolId === "invitation-small") {
            return buildInvitationPage(side, asset, sheet);
        }

        return buildGenericGridPage(side, asset, sheet);
    }

    function buildBusinessCardPage(side, asset, sheet) {
        const isLandscapeCard = isBusinessCardLandscape();
        const cardWidthIn = isLandscapeCard ? clamp(state.businessCardHeight, 1, 6) : clamp(state.businessCardWidth, 1, 6);
        const cardHeightIn = isLandscapeCard ? clamp(state.businessCardWidth, 1, 6) : clamp(state.businessCardHeight, 1, 6);
        const gapXIn = isLandscapeCard ? clamp(state.businessGapY, 0, 1) : clamp(state.businessGapX, 0, 1);
        const gapYIn = isLandscapeCard ? clamp(state.businessGapX, 0, 1) : clamp(state.businessGapY, 0, 1);
        const placement = buildGridPlacement({
            sheet: sheet,
            boundsIn: {
                x: clamp(state.businessBorderMargin, 0, 1),
                y: clamp(state.businessBorderMargin, 0, 1),
                width: Math.max(0, sheet.width - (clamp(state.businessBorderMargin, 0, 1) * 2)),
                height: Math.max(0, sheet.height - (clamp(state.businessBorderMargin, 0, 1) * 2))
            },
            cols: 5,
            rows: 5,
            itemCount: 25,
            itemWidthIn: cardWidthIn,
            itemHeightIn: cardHeightIn,
            spacingXIn: gapXIn,
            spacingYIn: gapYIn,
            fit: state.businessFitToCard ? "stretch" : "contain",
            sourceKey: side,
            sourceRotation: Number(asset.rotation) || 0,
            includeMarks: state.businessCutMarks,
            markShiftXIn: Number(state.businessCutLeft) - 2.402,
            markShiftYIn: Number(state.businessCutTop) - 3.585,
            itemInsetIn: state.businessFitToCard ? 0 : Math.max(0.02, Math.min(cardWidthIn, cardHeightIn) * 0.08),
            itemKind: "business-card"
        });

        return {
            side: side,
            sourceKey: side,
            sourceRotation: Number(asset.rotation) || 0,
            background: state.previewBackgroundMode === "color" ? state.previewBackgroundColor : "#ffffff",
            items: placement.items,
            marks: placement.marks,
            grid: placement.grid
        };
    }

    function buildGenericGridPage(side, asset, sheet) {
        const tool = TOOL_PRESETS[state.toolId] || TOOL_PRESETS["business-card"];
        const spacingIn = toInches(state.spacing);
        const marginIn = toInches(state.margin);
        const placement = buildGridPlacement({
            sheet: sheet,
            boundsIn: {
                x: marginIn,
                y: marginIn,
                width: Math.max(0, sheet.width - marginIn * 2),
                height: Math.max(0, sheet.height - marginIn * 2)
            },
            cols: Math.max(1, Number(tool.cols) || 1),
            rows: Math.max(1, Number(tool.rows) || 1),
            itemCount: Math.max(1, Number(tool.count) || 1),
            spacingXIn: spacingIn,
            spacingYIn: spacingIn,
            fit: tool.fit || "cover",
            sourceKey: side,
            sourceRotation: Number(asset.rotation) || 0,
            includeMarks: state.cropMarks,
            itemKind: tool.label || state.toolId
        });

        return {
            side: side,
            sourceKey: side,
            sourceRotation: Number(asset.rotation) || 0,
            background: state.previewBackgroundMode === "color" ? state.previewBackgroundColor : "#ffffff",
            items: placement.items,
            marks: placement.marks,
            grid: placement.grid
        };
    }

    function buildInvitationPage(side, asset, sheet) {
        const spacingIn = toInches(state.spacing);
        const marginIn = toInches(state.margin);
        const contentWidthIn = Math.max(0, sheet.width - marginIn * 2);
        const contentHeightIn = Math.max(0, sheet.height - marginIn * 2);
        const blankHeightIn = contentHeightIn * 0.32;
        const topHeightIn = Math.max(0.1, contentHeightIn - blankHeightIn - spacingIn);
        const cardWidthIn = Math.max(0.1, (contentWidthIn - spacingIn * 4) / 5);
        const cardHeightIn = Math.max(0.1, Math.min(topHeightIn, cardWidthIn / 1.7));
        const topPlacement = buildGridPlacement({
            sheet: sheet,
            boundsIn: {
                x: marginIn,
                y: marginIn,
                width: contentWidthIn,
                height: topHeightIn
            },
            cols: 5,
            rows: 1,
            itemCount: 5,
            itemWidthIn: cardWidthIn,
            itemHeightIn: cardHeightIn,
            spacingXIn: spacingIn,
            spacingYIn: 0,
            fit: "cover",
            sourceKey: side,
            sourceRotation: Number(asset.rotation) || 0,
            includeMarks: false,
            itemKind: "invitation-top"
        });

        const blankYIn = marginIn + contentHeightIn - blankHeightIn;
        const smartFill = buildInvitationSmartFillPage(side, asset, sheet, {
            x: marginIn,
            y: blankYIn,
            width: contentWidthIn,
            height: blankHeightIn
        }, spacingIn);

        return {
            side: side,
            sourceKey: side,
            sourceRotation: Number(asset.rotation) || 0,
            background: state.previewBackgroundMode === "color" ? state.previewBackgroundColor : "#ffffff",
            items: topPlacement.items.concat(smartFill.items),
            marks: topPlacement.marks.concat(smartFill.marks),
            grid: {
                top: topPlacement.grid,
                smartFill: smartFill.grid
            }
        };
    }

    function buildInvitationSmartFillPage(side, asset, sheet, boundsIn, spacingIn) {
        const smartFill = state.smartFill || "keep-blank";
        if (smartFill === "keep-blank") {
            return {
                items: [],
                marks: [],
                grid: null
            };
        }

        let cols = 4;
        let rows = 2;
        let fit = "cover";

        if (smartFill === "labels") {
            cols = 6;
            rows = 2;
            fit = "contain";
        } else if (smartFill === "mini-tags") {
            cols = 5;
            rows = 2;
            fit = "contain";
        }

        const fillPadIn = Math.max(0.12, spacingIn * 0.8);
        const fillBounds = {
            x: boundsIn.x + fillPadIn,
            y: boundsIn.y + fillPadIn,
            width: Math.max(0, boundsIn.width - fillPadIn * 2),
            height: Math.max(0, boundsIn.height - fillPadIn * 2)
        };

        const fillPlacement = buildGridPlacement({
            sheet: sheet,
            boundsIn: fillBounds,
            cols: cols,
            rows: rows,
            itemCount: cols * rows,
            spacingXIn: spacingIn,
            spacingYIn: spacingIn,
            fit: fit,
            sourceKey: side,
            sourceRotation: Number(asset.rotation) || 0,
            includeMarks: state.cropMarks,
            itemKind: "invitation-fill"
        });

        return fillPlacement;
    }

    function buildGridPlacement(options) {
        const sheet = options.sheet || { width: 1, height: 1, dpi: EXPORT_DPI };
        const bounds = options.boundsIn || {
            x: Number(options.marginIn) || 0,
            y: Number(options.marginIn) || 0,
            width: Math.max(0, sheet.width - ((Number(options.marginIn) || 0) * 2)),
            height: Math.max(0, sheet.height - ((Number(options.marginIn) || 0) * 2))
        };
        const cols = Math.max(1, Math.floor(Number(options.cols) || 1));
        const rows = Math.max(1, Math.floor(Number(options.rows) || 1));
        const spacingXIn = Math.max(0, Number(options.spacingXIn) || 0);
        const spacingYIn = Math.max(0, Number(options.spacingYIn) || spacingXIn);
        let itemWidthIn = Number(options.itemWidthIn);
        let itemHeightIn = Number(options.itemHeightIn);

        if (!Number.isFinite(itemWidthIn) || itemWidthIn <= 0) {
            itemWidthIn = Math.max(0.001, (bounds.width - (spacingXIn * (cols - 1))) / cols);
        }

        if (!Number.isFinite(itemHeightIn) || itemHeightIn <= 0) {
            itemHeightIn = Math.max(0.001, (bounds.height - (spacingYIn * (rows - 1))) / rows);
        }

        const minTotalW = cols * itemWidthIn + (cols - 1) * spacingXIn;
        const minTotalH = rows * itemHeightIn + (rows - 1) * spacingYIn;
        const fitScale = Math.min(
            1,
            bounds.width / Math.max(minTotalW, 0.001),
            bounds.height / Math.max(minTotalH, 0.001)
        );
        const drawItemW = itemWidthIn * fitScale;
        const drawItemH = itemHeightIn * fitScale;
        const drawGapX = cols > 1 ? Math.max(0, (bounds.width - cols * drawItemW) / (cols - 1)) : 0;
        const drawGapY = rows > 1 ? Math.max(0, (bounds.height - rows * drawItemH) / (rows - 1)) : 0;
        const totalW = cols * drawItemW + (cols - 1) * drawGapX;
        const totalH = rows * drawItemH + (rows - 1) * drawGapY;
        const startX = bounds.x + Math.max(0, (bounds.width - totalW) / 2);
        const startY = bounds.y + Math.max(0, (bounds.height - totalH) / 2);
        const itemCount = Math.max(0, Number(options.itemCount) || (cols * rows));
        const sourceKey = cleanText(options.sourceKey) || "front";
        const sourceRotation = Number(options.sourceRotation) || 0;
        const itemFit = cleanText(options.fit) || "cover";
        const itemInsetIn = Math.max(0, Number(options.itemInsetIn) || 0);
        const itemKind = cleanText(options.itemKind) || "grid";
        const includeMarks = options.includeMarks !== false;
        const markShiftXIn = Number(options.markShiftXIn) || 0;
        const markShiftYIn = Number(options.markShiftYIn) || 0;
        const items = [];

        for (let row = 0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) {
                const index = row * cols + col;
                if (index >= itemCount) {
                    continue;
                }

                const xIn = startX + col * (drawItemW + drawGapX);
                const yIn = startY + row * (drawItemH + drawGapY);
                items.push({
                    imageKey: sourceKey,
                    sourceKey: sourceKey,
                    x: roundTo(xIn * sheet.dpi, 2),
                    y: roundTo(yIn * sheet.dpi, 2),
                    width: roundTo(drawItemW * sheet.dpi, 2),
                    height: roundTo(drawItemH * sheet.dpi, 2),
                    rotation: sourceRotation,
                    fit: itemFit,
                    inset: roundTo(itemInsetIn * sheet.dpi, 2),
                    kind: itemKind,
                    index: index + 1
                });
            }
        }

        const marks = includeMarks ? buildGridMarks({
            startXIn: startX,
            startYIn: startY,
            itemWidthIn: drawItemW,
            itemHeightIn: drawItemH,
            gapXIn: drawGapX,
            gapYIn: drawGapY,
            cols: cols,
            rows: rows,
            shiftXIn: markShiftXIn,
            shiftYIn: markShiftYIn,
            sheet: sheet
        }) : [];

        return {
            items: items,
            marks: marks,
            grid: {
                xIn: startX,
                yIn: startY,
                itemWidthIn: drawItemW,
                itemHeightIn: drawItemH,
                gapXIn: drawGapX,
                gapYIn: drawGapY,
                cols: cols,
                rows: rows,
                fitScale: fitScale
            }
        };
    }

    function buildGridMarks(options) {
        const sheet = options.sheet || { dpi: EXPORT_DPI };
        const cols = Math.max(1, Math.floor(Number(options.cols) || 1));
        const rows = Math.max(1, Math.floor(Number(options.rows) || 1));
        const itemWidthIn = Math.max(0.001, Number(options.itemWidthIn) || 0.001);
        const itemHeightIn = Math.max(0.001, Number(options.itemHeightIn) || 0.001);
        const gapXIn = Math.max(0, Number(options.gapXIn) || 0);
        const gapYIn = Math.max(0, Number(options.gapYIn) || 0);
        const startXIn = Number(options.startXIn) || 0;
        const startYIn = Number(options.startYIn) || 0;
        const shiftXIn = Number(options.shiftXIn) || 0;
        const shiftYIn = Number(options.shiftYIn) || 0;
        const dpi = Number(sheet.dpi) || EXPORT_DPI;
        const markSizeIn = Math.max(0.01, Math.min(gapXIn || itemWidthIn * 0.12, gapYIn || itemHeightIn * 0.12) * 0.25);
        const marks = [];

        for (let row = 0; row < rows - 1; row += 1) {
            for (let col = 0; col < cols - 1; col += 1) {
                const xIn = startXIn + itemWidthIn + (gapXIn / 2) + (col * (itemWidthIn + gapXIn)) + shiftXIn;
                const yIn = startYIn + itemHeightIn + (gapYIn / 2) + (row * (itemHeightIn + gapYIn)) + shiftYIn;
                const xPx = roundTo(xIn * dpi, 2);
                const yPx = roundTo(yIn * dpi, 2);
                const sizePx = roundTo(markSizeIn * dpi, 2);

                marks.push({
                    x1: roundTo(xPx - (sizePx / 2), 2),
                    y1: yPx,
                    x2: roundTo(xPx + (sizePx / 2), 2),
                    y2: yPx,
                    stroke: "rgba(15, 23, 42, 0.45)",
                    strokeWidth: 1.2
                });
                marks.push({
                    x1: xPx,
                    y1: roundTo(yPx - (sizePx / 2), 2),
                    x2: xPx,
                    y2: roundTo(yPx + (sizePx / 2), 2),
                    stroke: "rgba(15, 23, 42, 0.45)",
                    strokeWidth: 1.2
                });
            }
        }

        return marks;
    }

    function buildSourceDescriptor(asset, side) {
        if (!asset) {
            return null;
        }

        return {
            side: side,
            name: asset.name || (side === "back" ? "Back Side" : "Front Side"),
            fileName: asset.file && asset.file.name ? asset.file.name : asset.name || (side + ".jpg"),
            mimeType: asset.file && asset.file.type ? asset.file.type : "",
            rotation: Number(asset.rotation) || 0,
            sourceKind: asset.sourceKind || "local-file"
        };
    }

    function buildFilePayload(asset, side) {
        if (!asset || !asset.file) {
            return null;
        }

        return {
            file: asset.file,
            name: asset.file.name || asset.name || (side + ".jpg")
        };
    }

    function getAssetForSide(side) {
        return side === "back" ? state.backAsset : state.frontAsset;
    }

    function setSheetOrientation(value) {
        const isLandscape = String(value).toLowerCase() === "landscape" || Number(value) === 90;
        state.orientation = isLandscape ? "landscape" : "portrait";
        state.businessCardRotation = isLandscape ? 90 : 0;
    }

    async function rotateUploadedAsset(side) {
        const asset = side === "back" ? state.backAsset : state.frontAsset;
        const sideLabel = side === "back" ? "back" : "front";

        if (!asset || !asset.image) {
            setStatus("Upload a " + sideLabel + " design first.");
            return;
        }

        if (asset.isRotating) {
            return;
        }

        asset.isRotating = true;
        updateThumbs();

        try {
            const rotatedPreview = createRotatedDataUrl(asset.image, 90);
            const rotatedImage = await loadImage(rotatedPreview);
            const previousPreviewUrl = asset.previewUrl || asset.preview;

            asset.preview = rotatedPreview;
            asset.previewUrl = rotatedPreview;
            asset.image = rotatedImage;
            asset.rotation = ((Number(asset.rotation) || 0) + 90) % 360;

            if (previousPreviewUrl && typeof previousPreviewUrl === "string" && previousPreviewUrl.startsWith("blob:")) {
                releaseAssetPreview({ previewUrl: previousPreviewUrl });
            }

            setStatus("Rotated the " + sideLabel + " design 90 degrees.");
        } catch (error) {
            console.error(error);
            setStatus("Rotation failed. Please try again.");
        } finally {
            asset.isRotating = false;
            updateThumbs();
            scheduleRender();
        }
    }

    function createRotatedDataUrl(image, degrees) {
        const normalized = ((Number(degrees) % 360) + 360) % 360;
        const quarterTurn = normalized === 90 || normalized === 270;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
            throw new Error("Canvas unavailable.");
        }

        canvas.width = quarterTurn ? image.height : image.width;
        canvas.height = quarterTurn ? image.width : image.height;

        context.save();
        context.translate(canvas.width / 2, canvas.height / 2);
        context.rotate(normalized * Math.PI / 180);
        context.drawImage(image, -image.width / 2, -image.height / 2);
        context.restore();

        return canvas.toDataURL("image/png");
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

    async function runExport(format) {
        if (state.isExporting) {
            return;
        }

        state.isExporting = true;
        exportUi.lastFormat = format;
        exportUi.lastError = "";
        exportUi.isErrored = false;
        exportUi.dismissRequested = false;
        const startedAt = Date.now();
        beginExportFeedback(format);

        let exportSucceeded = false;
        let exportCancelled = false;

        try {
            setStatus(format === "jpg" ? "Preparing JPG download..." : "Preparing PDF download...");
            await waitForPaint();
            await sleep(120);
            await exportSheet(format);
            exportSucceeded = true;
        } catch (error) {
            console.error(error);
            if (isAbortError(error)) {
                exportCancelled = true;
            } else {
                showExportFailure(error, format);
            }
        } finally {
            const elapsed = Date.now() - startedAt;
            if (exportSucceeded && elapsed < EXPORT_MODAL_MIN_VISIBLE_MS) {
                await sleep(EXPORT_MODAL_MIN_VISIBLE_MS - elapsed);
            }

            state.isExporting = false;
            if (exportSucceeded || exportCancelled) {
                finishExportFeedback();
                if (exportCancelled) {
                    setStatus("Export cancelled.");
                }
            }
        }
    }

    async function exportSheet(format) {
        await exportSheetViaBackend(format);
    }

    async function exportSheetViaBackend(format) {
        if (!canvas.previewStage) {
            setStatus("Please upload a file first.");
            return;
        }

        const payload = buildExportPayload(format);
        if (!payload.frontFile && !payload.backFile) {
            setStatus("Please upload a file first.");
            return;
        }

        const fileBase = slugify((TOOL_PRESETS[state.toolId] || TOOL_PRESETS["business-card"]).label + "-" + state.sheetSize);
        const formData = new FormData();
        formData.append("format", format === "jpg" ? "jpg" : "pdf");
        formData.append("settings", JSON.stringify(payload.settings));
        formData.append("activeSide", state.activeSide);
        if (payload.frontFile) {
            formData.append("frontFile", payload.frontFile.file, payload.frontFile.name);
        }
        if (payload.backFile) {
            formData.append("backFile", payload.backFile.file, payload.backFile.name);
        }

        setStatus("Preparing the layout payload for backend export...");
        await waitForPaint();

        setStatus("Sending original files and layout to the export backend...");
        await waitForPaint();

        const backendUrl = resolveBackendBaseUrl("/tools/aj-print-layout-pro/export");
        const controller = typeof AbortController === "function" ? new AbortController() : null;
        exportUi.abortController = controller;

        if (exportUi.dismissRequested) {
            if (controller) {
                controller.abort();
            } else {
                throw new Error("Export cancelled.");
            }
        }

        let response;
        try {
            response = await fetch(backendUrl, {
                method: "POST",
                body: formData,
                credentials: "include",
                signal: controller ? controller.signal : undefined
            });
        } finally {
            if (exportUi.abortController === controller) {
                exportUi.abortController = null;
            }
        }

        if (!response.ok) {
            const message = await readErrorText(response);
            throw new Error(message || "Backend export failed.");
        }

        const blob = await response.blob();
        const fileName = getDownloadFileName(response, fileBase, format);
        downloadBlob(blob, fileName);
        setStatus(format === "jpg"
            ? "JPG export generated by the backend from original files and layout JSON."
            : (payload.hasBackSide ? "PDF export generated by the backend from front and back layout pages." : "PDF export generated by the backend from a single layout page."));
    }

    function waitForPaint() {
        return new Promise(function (resolve) {
            requestAnimationFrame(function () {
                requestAnimationFrame(resolve);
            });
        });
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
        });
    }

    function beginExportFeedback(format) {
        if (!dom.exportModal) return;

        exportUi.isVisible = true;
        exportUi.isErrored = false;
        exportUi.startTime = Date.now();

        if (exportUi.countdownTimer) {
            clearInterval(exportUi.countdownTimer);
            exportUi.countdownTimer = 0;
        }

        if (dom.exportModalTitle) {
            dom.exportModalTitle.textContent = format === "jpg" ? "Preparing JPG download" : "Preparing PDF download";
        }

        if (dom.exportModalStatus) {
            dom.exportModalStatus.textContent = "Optimizing the sheet and starting the export engine...";
        }

        if (dom.exportModalNote) {
            dom.exportModalNote.textContent = "Please keep this tab open. The file will download as soon as the preview is ready.";
        }

        if (dom.exportModalCountdown) {
            dom.exportModalCountdown.textContent = String(EXPORT_MODAL_COUNTDOWN_START);
        }

        if (dom.exportModalProgress) {
            dom.exportModalProgress.style.width = "18%";
        }

        if (dom.exportModalRetry) {
            dom.exportModalRetry.hidden = true;
        }

        dom.exportModal.classList.add("is-visible");
        dom.exportModal.classList.remove("is-error");
        updateExportButtons(true);

        let remaining = EXPORT_MODAL_COUNTDOWN_START;
        exportUi.countdownTimer = window.setInterval(function () {
            if (!exportUi.isVisible) {
                if (exportUi.countdownTimer) {
                    clearInterval(exportUi.countdownTimer);
                    exportUi.countdownTimer = 0;
                }
                return;
            }

            remaining -= 1;

            if (remaining > 0) {
                if (dom.exportModalCountdown) {
                    dom.exportModalCountdown.textContent = String(remaining);
                }

                if (dom.exportModalProgress) {
                    dom.exportModalProgress.style.width = String(Math.min(84, 18 + ((EXPORT_MODAL_COUNTDOWN_START - remaining) * 22))) + "%";
                }

                if (dom.exportModalStatus) {
                    dom.exportModalStatus.textContent = remaining === 2
                        ? "Rendering the layout..."
                        : "Finalizing the download...";
                }
                return;
            }

            if (dom.exportModalCountdown) {
                dom.exportModalCountdown.textContent = "...";
            }

            if (dom.exportModalProgress) {
                dom.exportModalProgress.style.width = "82%";
            }

            if (dom.exportModalStatus) {
                dom.exportModalStatus.textContent = "Finalizing the file for download...";
            }

            if (exportUi.countdownTimer) {
                clearInterval(exportUi.countdownTimer);
                exportUi.countdownTimer = 0;
            }
        }, EXPORT_MODAL_STEP_MS);
    }

    function finishExportFeedback() {
        exportUi.isVisible = false;
        exportUi.isErrored = false;

        if (exportUi.countdownTimer) {
            clearInterval(exportUi.countdownTimer);
            exportUi.countdownTimer = 0;
        }

        if (dom.exportModal) {
            dom.exportModal.classList.remove("is-visible");
            dom.exportModal.classList.remove("is-error");
        }
        if (dom.exportModalRetry) {
            dom.exportModalRetry.hidden = true;
        }
        updateExportButtons(false);

        if (dom.exportModalCountdown) {
            dom.exportModalCountdown.textContent = String(EXPORT_MODAL_COUNTDOWN_START);
        }

        if (dom.exportModalProgress) {
            dom.exportModalProgress.style.width = "0%";
        }

        if (dom.exportModalNote) {
            dom.exportModalNote.textContent = "Please keep this tab open. The file will download as soon as the preview is ready.";
        }
    }

    function showExportFailure(error, format) {
        const message = cleanText(error && error.message) || "Export failed. Please try again.";
        exportUi.lastError = message;
        exportUi.isErrored = true;

        if (dom.exportModal) {
            dom.exportModal.classList.add("is-visible");
            dom.exportModal.classList.add("is-error");
        }

        if (dom.exportModalTitle) {
            dom.exportModalTitle.textContent = format === "jpg" ? "JPG export failed" : "PDF export failed";
        }

        if (dom.exportModalStatus) {
            dom.exportModalStatus.textContent = message;
        }

        if (dom.exportModalCountdown) {
            dom.exportModalCountdown.textContent = "!";
        }

        if (dom.exportModalProgress) {
            dom.exportModalProgress.style.width = "100%";
        }

        if (dom.exportModalNote) {
            dom.exportModalNote.textContent = "You can retry the export or close this popup.";
        }

        if (dom.exportModalRetry) {
            dom.exportModalRetry.hidden = false;
        }
    }

    function closeExportModal() {
        exportUi.dismissRequested = true;
        if (exportUi.abortController) {
            try {
                exportUi.abortController.abort();
            } catch (_error) {
                // Ignore abort failures.
            }
        }

        finishExportFeedback();
    }

    function isAbortError(error) {
        const name = String(error && error.name || "").toLowerCase();
        const message = String(error && error.message || "").toLowerCase();
        return name === "aborterror" || message.indexOf("aborted") !== -1 || message.indexOf("cancelled") !== -1;
    }

    function updateExportButtons(isDisabled) {
        if (dom.exportPdf) {
            dom.exportPdf.disabled = Boolean(isDisabled);
        }
        if (dom.exportJpg) {
            dom.exportJpg.disabled = Boolean(isDisabled);
        }
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
        return isTiffFile(file) || isHeicFile(file);
    }

    function isHeicFile(file) {
        const name = String(file && file.name || "").toLowerCase();
        const type = String(file && file.type || "").toLowerCase();
        return type === "image/heic" || type === "image/heif" || /\.(heic|heif)$/.test(name);
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
        anchor.rel = "noopener";
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        window.requestAnimationFrame(function () {
            anchor.click();
            window.setTimeout(function () {
                anchor.remove();
            }, 0);
        });
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

    function getDownloadFileName(response, fallbackBase, format) {
        const contentType = cleanText(response && response.headers && response.headers.get("content-type")).toLowerCase();
        const disposition = cleanText(response && response.headers && response.headers.get("content-disposition"));
        const parsedName = parseContentDispositionFileName(disposition);

        if (parsedName) {
            return parsedName;
        }

        if (contentType.indexOf("pdf") !== -1 || format === "pdf") {
            return `${fallbackBase}.pdf`;
        }

        return `${fallbackBase}.jpg`;
    }

    function parseContentDispositionFileName(value) {
        const text = cleanText(value);
        if (!text) {
            return "";
        }

        const utf8Match = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(text);
        if (utf8Match && utf8Match[1]) {
            try {
                return decodeURIComponent(utf8Match[1].replace(/["']/g, ""));
            } catch (_error) {
                return cleanText(utf8Match[1]).replace(/^['"]|['"]$/g, "");
            }
        }

        const plainMatch = /filename\s*=\s*([^;]+)/i.exec(text);
        if (plainMatch && plainMatch[1]) {
            return cleanText(plainMatch[1]).replace(/^['"]|['"]$/g, "");
        }

        return "";
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
        const text = String(message || "");
        if (dom.statusText) dom.statusText.textContent = text;
        if (dom.supportNote) dom.supportNote.textContent = text;
        if (exportUi.isVisible && dom.exportModalStatus) {
            dom.exportModalStatus.textContent = text;
        }
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
})();
