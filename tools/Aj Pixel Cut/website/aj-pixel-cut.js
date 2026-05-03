const uploadBox = document.getElementById("uploadBox");
const fileInput = document.getElementById("fileInput");
const reuploadBtn = document.getElementById("reuploadBtn");

const beforeCanvas = document.getElementById("beforeCanvas");
const beforeCtx = beforeCanvas.getContext("2d");
const afterCanvas = document.getElementById("afterCanvas");
const afterCtx = afterCanvas.getContext("2d");
const brushPreview = document.getElementById("brushPreview");

const resultWrapper = document.getElementById("resultWrapper");
const downloadBtn = document.getElementById("downloadBtn");
const actionRow = document.querySelector(".action-row");
const scan = document.getElementById("scan");
const imgWrap = document.querySelector(".img-wrap");
const beforeStage = document.getElementById("beforeStage");
const afterStage = document.getElementById("afterStage");
const beforeSizeBadge = document.getElementById("beforeSizeBadge");
const afterSizeBadge = document.getElementById("afterSizeBadge");

const colorCircles = document.querySelectorAll(".color-circle[data-color]");
const colorPicker = document.getElementById("colorPicker");
const gradientPreset = document.getElementById("gradientPreset");
const gradientStart = document.getElementById("gradientStart");
const gradientEnd = document.getElementById("gradientEnd");
const gradientAngle = document.getElementById("gradientAngle");

const refineBtn = document.getElementById("refineBtn");
const resizeBtn = document.getElementById("resizeBtn");
const textBtn = document.getElementById("textBtn");
const outlineBtn = document.getElementById("outlineBtn");
const eraseModeBtn = document.getElementById("eraseModeBtn");
const restoreModeBtn = document.getElementById("restoreModeBtn");
const restoreRemovedBtn = document.getElementById("restoreRemovedBtn");
const restoreOriginalBtn = document.getElementById("restoreOriginalBtn");
const historyUndoBtn = document.getElementById("historyUndoBtn");
const historyRedoBtn = document.getElementById("historyRedoBtn");

const refinePanel = document.getElementById("refinePanel");
const resizePanel = document.getElementById("resizePanel");
const textPanel = document.getElementById("textPanel");
const outlinePanel = document.getElementById("outlinePanel");
const gradientPanel = document.getElementById("gradientPanel");
const cropOverlay = document.getElementById("cropOverlay");
const cropBox = document.getElementById("cropBox");
const outlineShadowBtn = document.getElementById("outlineShadowBtn");
const outlineHardBtn = document.getElementById("outlineHardBtn");
const textInput = document.getElementById("textInput");
const textSizeInput = document.getElementById("textSize");
const textColorInput = document.getElementById("textColor");
const textPosXInput = document.getElementById("textPosX");
const textPosYInput = document.getElementById("textPosY");
const textBoldBtn = document.getElementById("textBoldBtn");
const textItalicBtn = document.getElementById("textItalicBtn");
const textUnderlineBtn = document.getElementById("textUnderlineBtn");

const brushSizeInput = document.getElementById("brushSize");
const brushHardnessInput = document.getElementById("brushHardness");
const cropRadiusInput = document.getElementById("cropRadius");
const outlineSizeInput = document.getElementById("outlineSize");
const outlineColorInput = document.getElementById("outlineColor");

let baseCanvas = document.createElement("canvas");
let baseCtx = baseCanvas.getContext("2d");
let originalCanvas = document.createElement("canvas");
let originalCtx = originalCanvas.getContext("2d");
let maskCanvas = document.createElement("canvas");
let maskCtx = maskCanvas.getContext("2d");
let restoreMaskCanvas = document.createElement("canvas");
let restoreMaskCtx = restoreMaskCanvas.getContext("2d");

let selectedBackground = { type: "transparent", value: "transparent" };
let selectedOutline = { enabled: false, size: 8, color: "#ffffff", mode: "shadow" };
let cropRadius = 0;
let selectedText = {
    enabled: false,
    value: "",
    size: 64,
    color: "#ffffff",
    x: 50,
    y: 50,
    bold: true,
    italic: false,
    underline: false
};
let brushSize = Number(brushSizeInput.value);
let brushHardness = Number(brushHardnessInput.value);
let refineMode = false;
let refineAction = "erase";
let isPainting = false;
let currentImageUrl = "";
let currentOriginalUrl = "";
let beforeZoom = 1;
let beforePanX = 0;
let beforePanY = 0;
let sharedZoom = 1;
let isBeforePanning = false;
let panStartX = 0;
let panStartY = 0;
let panOriginX = 0;
let panOriginY = 0;
let spacePressed = false;
let hardnessLabelTimer = null;
let activeUploadController = null;
let uploadToken = 0;
let cropRect = { x: 0, y: 0, w: 0, h: 0 };
let cropInteraction = null;
let textDrag = null;
let brushStrokeChanged = false;
let historyStack = [];
let historyIndex = -1;
let restoreSource = "original";
let restoreMaskDirty = false;
let renderFrameId = 0;
const minCropSize = 24;
const subjectCornerRadius = 18;
const subjectCornerFeather = 8;
const subjectEdgeFeather = 12;

function setButtonActive(button, active){
    button.classList.toggle("active", active);
}

function closePanels(){
    [refinePanel, resizePanel, textPanel, outlinePanel, gradientPanel].forEach(panel=>{
        panel.classList.remove("active");
    });
    refineBtn.classList.remove("active");
    resizeBtn.classList.remove("active");
    outlineBtn.classList.toggle("active", selectedOutline.enabled);
    textBtn.classList.toggle("active", selectedText.enabled);
    gradientPreset.classList.toggle("active", selectedBackground.type === "gradient");
    updateAfterStageCursor();
}

function setActiveBackgroundCircle(color){
    colorCircles.forEach(circle=>circle.classList.remove("active"));
    colorCircles.forEach(circle=>{
        if(circle.getAttribute("data-color") === color){
            circle.classList.add("active");
        }
    });
}

function applyBackground(choice){
    if(choice === "transparent"){
        selectedBackground = { type: "transparent", value: "transparent" };
        gradientPreset.classList.remove("active");
        setActiveBackgroundCircle("transparent");
    }else if(choice === "gradient"){
        selectedBackground = { type: "gradient" };
        gradientPreset.classList.add("active");
    }else{
        selectedBackground = { type: "solid", value: choice };
        gradientPreset.classList.remove("active");
        setActiveBackgroundCircle(choice);
    }
    renderCanvas();
}

function applyStageTransform(stage, zoom, panX, panY){
    stage.style.setProperty("--preview-zoom", zoom);
    stage.style.setProperty("--preview-pan-x", `${panX}px`);
    stage.style.setProperty("--preview-pan-y", `${panY}px`);
}

function applyPreviewTransforms(){
    if(beforeStage){
        applyStageTransform(beforeStage, sharedZoom, beforePanX, beforePanY);
    }
    if(afterStage){
        applyStageTransform(afterStage, sharedZoom, beforePanX, beforePanY);
    }
}

function updateAfterStageCursor(){
    if(!afterStage){
        return;
    }

    if(textDrag){
        afterStage.style.cursor = "grabbing";
        return;
    }

    if(selectedText.enabled && !refineMode && !resizePanel.classList.contains("active")){
        afterStage.style.cursor = "move";
        return;
    }

    afterStage.style.cursor = "";
}

function setSizeBadges(width, height){
    const sizeText = width && height ? `${width}x${height}` : "--";
    if(beforeSizeBadge){
        beforeSizeBadge.textContent = sizeText;
    }
    if(afterSizeBadge){
        afterSizeBadge.textContent = sizeText;
    }
}

function clampStagePan(stage, zoom, panState){
    if(!stage){
        return;
    }

    const width = stage.clientWidth || 0;
    const height = stage.clientHeight || 0;
    const maxX = Math.max(0, (zoom - 1) * width / 2);
    const maxY = Math.max(0, (zoom - 1) * height / 2);

    panState.x = Math.min(maxX, Math.max(-maxX, panState.x));
    panState.y = Math.min(maxY, Math.max(-maxY, panState.y));

    if(zoom <= 1){
        panState.x = 0;
        panState.y = 0;
    }

    return panState;
}

function setSharedZoom(nextZoom){
    sharedZoom = Math.min(5, Math.max(0.5, nextZoom));
    beforeZoom = sharedZoom;
    const clamped = clampStagePan(beforeStage, sharedZoom, { x: beforePanX, y: beforePanY });
    beforePanX = clamped.x;
    beforePanY = clamped.y;
    applyPreviewTransforms();
}

function requestRenderCanvas(){
    if(renderFrameId){
        return;
    }

    renderFrameId = window.requestAnimationFrame(()=>{
        renderFrameId = 0;
        renderCanvas();
    });
}

function cloneBackground(background){
    return background.type === "solid"
        ? { type: "solid", value: background.value }
        : { type: background.type };
}

function cloneOutline(outline){
    return {
        enabled: outline.enabled,
        size: outline.size,
        color: outline.color,
        mode: outline.mode || "shadow"
    };
}

function cloneText(text){
    return {
        enabled: text.enabled,
        value: text.value,
        size: text.size,
        color: text.color,
        x: text.x,
        y: text.y,
        bold: text.bold,
        italic: text.italic,
        underline: text.underline
    };
}

function snapshotCanvas(canvas, ctx){
    if(!canvas || !ctx || !canvas.width || !canvas.height){
        return null;
    }

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function restoreCanvasFromSnapshot(canvas, ctx, snapshot){
    if(!canvas || !ctx || !snapshot){
        return;
    }

    canvas.width = snapshot.width;
    canvas.height = snapshot.height;
    ctx.putImageData(snapshot, 0, 0);
}

function syncTextStyleButtons(){
    if(textBoldBtn){
        textBoldBtn.classList.toggle("active", selectedText.bold);
    }
    if(textItalicBtn){
        textItalicBtn.classList.toggle("active", selectedText.italic);
    }
    if(textUnderlineBtn){
        textUnderlineBtn.classList.toggle("active", selectedText.underline);
    }
}

function setTextStyle(key){
    selectedText[key] = !selectedText[key];
    syncTextStyleButtons();
    renderCanvas();
    pushHistory();
}

function syncOutlineModeButtons(){
    if(outlineShadowBtn){
        outlineShadowBtn.classList.toggle("active", selectedOutline.mode === "shadow");
    }
    if(outlineHardBtn){
        outlineHardBtn.classList.toggle("active", selectedOutline.mode === "hard");
    }
}

function setOutlineMode(mode){
    selectedOutline.mode = mode === "hard" ? "hard" : "shadow";
    syncOutlineModeButtons();
    renderCanvas();
    pushHistory();
}

function syncRestoreSourceButtons(){
    if(restoreRemovedBtn){
        restoreRemovedBtn.classList.toggle("active", restoreSource === "removed");
    }
    if(restoreOriginalBtn){
        restoreOriginalBtn.classList.toggle("active", restoreSource === "original");
    }
}

function captureImageState(){
    return {
        original: snapshotCanvas(originalCanvas, originalCtx),
        base: snapshotCanvas(baseCanvas, baseCtx),
        mask: snapshotMask(),
        restoreMask: snapshotRestoreMask(),
        cropRect: { ...cropRect },
        selectedBackground: cloneBackground(selectedBackground),
        selectedOutline: cloneOutline(selectedOutline),
        selectedText: cloneText(selectedText),
        cropRadius,
        gradientStart: gradientStart.value,
        gradientEnd: gradientEnd.value,
        gradientAngle: gradientAngle.value,
        colorPicker: colorPicker.value,
        refineAction,
        restoreSource
    };
}

function syncHistoryButtons(){
    if(historyUndoBtn){
        historyUndoBtn.disabled = historyIndex <= 0;
    }
    if(historyRedoBtn){
        historyRedoBtn.disabled = historyIndex >= historyStack.length - 1 || historyIndex < 0;
    }
}

function pushHistory(){
    if(!baseCanvas.width || !baseCanvas.height){
        return;
    }

    const state = captureImageState();
    historyStack = historyStack.slice(0, historyIndex + 1);
    historyStack.push(state);
    if(historyStack.length > 40){
        historyStack.shift();
        historyIndex = historyStack.length - 1;
    }else{
        historyIndex = historyStack.length - 1;
    }
    syncHistoryButtons();
}

function applyHistoryState(state){
    if(!state || !baseCanvas.width || !baseCanvas.height){
        return;
    }

    restoreCanvasFromSnapshot(originalCanvas, originalCtx, state.original);
    restoreCanvasFromSnapshot(baseCanvas, baseCtx, state.base);
    restoreCanvasFromSnapshot(maskCanvas, maskCtx, state.mask);
    restoreCanvasFromSnapshot(restoreMaskCanvas, restoreMaskCtx, state.restoreMask);
    cropRect = { ...state.cropRect };
    selectedBackground = cloneBackground(state.selectedBackground);
    selectedOutline = cloneOutline(state.selectedOutline);
    selectedOutline.mode = selectedOutline.mode || "shadow";
    selectedText = Object.assign({
        enabled: false,
        value: "",
        size: 64,
        color: "#ffffff",
        x: 50,
        y: 50,
        bold: true,
        italic: false,
        underline: false
    }, state.selectedText || {});
    cropRadius = state.cropRadius ?? 0;
    refineAction = state.refineAction || "erase";
    restoreSource = state.restoreSource || "original";

    gradientStart.value = state.gradientStart;
    gradientEnd.value = state.gradientEnd;
    gradientAngle.value = state.gradientAngle;
    colorPicker.value = state.colorPicker;
    cropRadiusInput.value = Math.round(cropRadius);
    outlineSizeInput.value = selectedOutline.size;
    outlineColorInput.value = selectedOutline.color;
    syncOutlineModeButtons();
    textInput.value = selectedText.value || "";
    textSizeInput.value = selectedText.size;
    textColorInput.value = selectedText.color;
    textPosXInput.value = selectedText.x;
    textPosYInput.value = selectedText.y;
    syncTextStyleButtons();

    eraseModeBtn.classList.toggle("active", refineAction === "erase");
    restoreModeBtn.classList.toggle("active", refineAction === "restore");
    syncRestoreSourceButtons();

    if(selectedBackground.type === "transparent"){
        gradientPreset.classList.remove("active");
        setActiveBackgroundCircle("transparent");
    }else if(selectedBackground.type === "gradient"){
        gradientPreset.classList.add("active");
        colorCircles.forEach(circle=>circle.classList.remove("active"));
    }else{
        gradientPreset.classList.remove("active");
        setActiveBackgroundCircle(selectedBackground.value);
    }

    outlineBtn.classList.toggle("active", selectedOutline.enabled);
    outlinePanel.classList.toggle("active", selectedOutline.enabled);
    textBtn.classList.toggle("active", selectedText.enabled);
    textPanel.classList.toggle("active", selectedText.enabled);

    renderCanvas();
    renderBeforeCanvas();
}

function undoHistory(){
    if(historyIndex <= 0){
        return;
    }

    historyIndex -= 1;
    applyHistoryState(historyStack[historyIndex]);
    syncHistoryButtons();
}

function redoHistory(){
    if(historyIndex < 0 || historyIndex >= historyStack.length - 1){
        return;
    }

    historyIndex += 1;
    applyHistoryState(historyStack[historyIndex]);
    syncHistoryButtons();
}

function resetCropRect(){
    cropRect = {
        x: 0,
        y: 0,
        w: baseCanvas.width,
        h: baseCanvas.height
    };
}

function clampCropRect(rect){
    const next = { ...rect };
    next.w = Math.max(minCropSize, Math.min(next.w, baseCanvas.width));
    next.h = Math.max(minCropSize, Math.min(next.h, baseCanvas.height));

    if(next.x < 0){
        next.w += next.x;
        next.x = 0;
    }
    if(next.y < 0){
        next.h += next.y;
        next.y = 0;
    }
    if(next.x + next.w > baseCanvas.width){
        next.w = baseCanvas.width - next.x;
    }
    if(next.y + next.h > baseCanvas.height){
        next.h = baseCanvas.height - next.y;
    }

    next.w = Math.max(minCropSize, Math.min(next.w, baseCanvas.width));
    next.h = Math.max(minCropSize, Math.min(next.h, baseCanvas.height));

    if(next.x + next.w > baseCanvas.width){
        next.x = Math.max(0, baseCanvas.width - next.w);
    }
    if(next.y + next.h > baseCanvas.height){
        next.y = Math.max(0, baseCanvas.height - next.h);
    }

    return {
        x: Math.round(next.x),
        y: Math.round(next.y),
        w: Math.round(next.w),
        h: Math.round(next.h)
    };
}

function renderBeforeCanvas(){
    if(!beforeCanvas || !beforeCtx || !originalCanvas.width || !originalCanvas.height){
        return;
    }

    beforeCanvas.width = originalCanvas.width;
    beforeCanvas.height = originalCanvas.height;
    beforeCtx.clearRect(0, 0, beforeCanvas.width, beforeCanvas.height);
    beforeCtx.drawImage(originalCanvas, 0, 0);
}

function syncCropOverlayVisibility(){
    if(!cropOverlay){
        return;
    }

    const shouldShow = !!baseCanvas.width && !!baseCanvas.height && resizePanel.classList.contains("active");
    cropOverlay.style.display = shouldShow ? "block" : "none";
    cropOverlay.classList.toggle("active", shouldShow);
}

function updateCropOverlay(){
    if(!cropOverlay || !cropBox || !baseCanvas.width || !baseCanvas.height){
        return;
    }

    cropOverlay.style.aspectRatio = `${baseCanvas.width} / ${baseCanvas.height}`;
    syncCropOverlayVisibility();

    const radius = Math.max(0, Math.min(cropRadius, Math.floor(Math.min(cropRect.w, cropRect.h) / 2)));
    cropBox.style.borderRadius = `${radius}px`;

    if(cropOverlay.style.display === "none"){
        return;
    }

    cropBox.style.left = `${(cropRect.x / baseCanvas.width) * 100}%`;
    cropBox.style.top = `${(cropRect.y / baseCanvas.height) * 100}%`;
    cropBox.style.width = `${(cropRect.w / baseCanvas.width) * 100}%`;
    cropBox.style.height = `${(cropRect.h / baseCanvas.height) * 100}%`;
}

function getCropPointFromEvent(event){
    const rect = cropOverlay.getBoundingClientRect();
    return {
        x: ((event.clientX - rect.left) / rect.width) * baseCanvas.width,
        y: ((event.clientY - rect.top) / rect.height) * baseCanvas.height
    };
}

function beginCropInteraction(event, mode){
    if(!baseCanvas.width || !resizePanel.classList.contains("active")){
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    cropInteraction = {
        mode,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startRect: { ...cropRect },
        changed: false
    };

    cropOverlay.setPointerCapture(event.pointerId);
}

function applyCropInteraction(event){
    if(!cropInteraction || cropInteraction.pointerId !== event.pointerId){
        return;
    }

    const overlayRect = cropOverlay.getBoundingClientRect();
    const scaleX = baseCanvas.width / overlayRect.width;
    const scaleY = baseCanvas.height / overlayRect.height;
    const dx = (event.clientX - cropInteraction.startX) * scaleX;
    const dy = (event.clientY - cropInteraction.startY) * scaleY;
    const start = cropInteraction.startRect;

    if(cropInteraction.mode === "move"){
        const next = {
            x: Math.min(Math.max(0, start.x + dx), baseCanvas.width - start.w),
            y: Math.min(Math.max(0, start.y + dy), baseCanvas.height - start.h),
            w: start.w,
            h: start.h
        };
        cropInteraction.changed = cropInteraction.changed || next.x !== start.x || next.y !== start.y;
        cropRect = next;
    }else{
        let next = { ...start };
        if(cropInteraction.mode.includes("e")){
            next.w = start.w + dx;
        }
        if(cropInteraction.mode.includes("s")){
            next.h = start.h + dy;
        }
        if(cropInteraction.mode.includes("w")){
            next.x = start.x + dx;
            next.w = start.w - dx;
        }
        if(cropInteraction.mode.includes("n")){
            next.y = start.y + dy;
            next.h = start.h - dy;
        }
        const clamped = clampCropRect(next);
        cropInteraction.changed = cropInteraction.changed || clamped.x !== start.x || clamped.y !== start.y || clamped.w !== start.w || clamped.h !== start.h;
        cropRect = clamped;
    }

    updateCropOverlay();
    requestRenderCanvas();
}

function endCropInteraction(event){
    if(!cropInteraction || cropInteraction.pointerId !== event.pointerId){
        return;
    }

    if(cropInteraction.changed){
        pushHistory();
    }
    cropInteraction = null;
    if(cropOverlay.hasPointerCapture(event.pointerId)){
        cropOverlay.releasePointerCapture(event.pointerId);
    }
}

function beginTextDrag(event){
    if(!selectedText.enabled || !afterCanvas.width || !afterCanvas.height || resizePanel.classList.contains("active") || refineMode){
        return false;
    }

    const bounds = getTextOverlayBounds(afterCanvas.width, afterCanvas.height);
    if(!bounds){
        return false;
    }

    const rect = afterCanvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * afterCanvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * afterCanvas.height;

    if(x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom){
        return false;
    }

    textDrag = {
        pointerId: event.pointerId,
        offsetX: x - ((selectedText.x / 100) * afterCanvas.width),
        offsetY: y - ((selectedText.y / 100) * afterCanvas.height)
    };
    event.preventDefault();
    event.stopPropagation();
    afterStage.setPointerCapture(event.pointerId);
    afterStage.style.cursor = "grabbing";
    return true;
}

function applyTextDrag(event){
    if(!textDrag || textDrag.pointerId !== event.pointerId || !afterCanvas.width || !afterCanvas.height){
        return;
    }

    const rect = afterCanvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * afterCanvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * afterCanvas.height;

    selectedText.x = Math.max(0, Math.min(100, ((x - textDrag.offsetX) / afterCanvas.width) * 100));
    selectedText.y = Math.max(0, Math.min(100, ((y - textDrag.offsetY) / afterCanvas.height) * 100));

    if(textPosXInput){
        textPosXInput.value = Math.round(selectedText.x);
    }
    if(textPosYInput){
        textPosYInput.value = Math.round(selectedText.y);
    }

    requestRenderCanvas();
}

function endTextDrag(event){
    if(!textDrag || textDrag.pointerId !== event.pointerId){
        return;
    }

    textDrag = null;
    if(afterStage.hasPointerCapture(event.pointerId)){
        afterStage.releasePointerCapture(event.pointerId);
    }
    updateAfterStageCursor();
    pushHistory();
}

function initMask(){
    maskCanvas.width = baseCanvas.width;
    maskCanvas.height = baseCanvas.height;
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    maskCtx.fillStyle = "white";
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
}

function snapshotMask(){
    return maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
}

function initRestoreMask(){
    restoreMaskCanvas.width = baseCanvas.width;
    restoreMaskCanvas.height = baseCanvas.height;
    restoreMaskCtx.clearRect(0, 0, restoreMaskCanvas.width, restoreMaskCanvas.height);
    restoreMaskDirty = false;
}

function snapshotRestoreMask(){
    return restoreMaskCtx.getImageData(0, 0, restoreMaskCanvas.width, restoreMaskCanvas.height);
}

function restoreMask(imageData){
    maskCtx.putImageData(imageData, 0, 0);
    renderCanvas();
}

function commitRestoreMask(){
    if(!restoreMaskDirty || !baseCanvas.width || !baseCanvas.height){
        return false;
    }

    const restoredCanvas = createMaskedCanvas(originalCanvas, restoreMaskCanvas);
    baseCtx.save();
    baseCtx.globalCompositeOperation = "source-over";
    baseCtx.drawImage(restoredCanvas, 0, 0);
    baseCtx.restore();

    restoreMaskCtx.clearRect(0, 0, restoreMaskCanvas.width, restoreMaskCanvas.height);
    restoreMaskDirty = false;
    return true;
}

function createMaskedCanvas(sourceCanvas, sourceMaskCanvas){
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = baseCanvas.width;
    outputCanvas.height = baseCanvas.height;
    const outputCtx = outputCanvas.getContext("2d");

    outputCtx.drawImage(sourceCanvas, 0, 0);
    outputCtx.globalCompositeOperation = "destination-in";
    outputCtx.drawImage(sourceMaskCanvas, 0, 0);
    outputCtx.globalCompositeOperation = "source-over";

    return outputCanvas;
}

function createVisibleForegroundCanvas(){
    const visibleCanvas = document.createElement("canvas");
    visibleCanvas.width = baseCanvas.width;
    visibleCanvas.height = baseCanvas.height;
    const visibleCtx = visibleCanvas.getContext("2d");
    const restoreSourceCanvas = restoreSource === "original" ? originalCanvas : baseCanvas;

    visibleCtx.drawImage(createMaskedCanvas(baseCanvas, maskCanvas), 0, 0);
    visibleCtx.drawImage(createMaskedCanvas(restoreSourceCanvas, restoreMaskCanvas), 0, 0);

    return visibleCanvas;
}

function drawRoundedRectPath(ctx, x, y, width, height, radius){
    const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));

    ctx.beginPath();
    if(r <= 0){
        ctx.rect(x, y, width, height);
        return;
    }

    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
}

function applySoftCornersToCanvas(source, radius, feather){
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(source, 0, 0, width, height);

    if(radius > 0 || feather > 0){
        const mask = document.createElement("canvas");
        mask.width = width;
        mask.height = height;
        const maskCtx = mask.getContext("2d");
        maskCtx.fillStyle = "#ffffff";
        maskCtx.filter = feather > 0 ? `blur(${feather}px)` : "none";
        drawRoundedRectPath(maskCtx, 0, 0, width, height, radius);
        maskCtx.fill();
        maskCtx.filter = "none";

        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = "source-over";
    }

    return canvas;
}

function applySubjectEdgeFeatherToCanvas(source, feather){
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(source, 0, 0, width, height);

    if(feather > 0){
        const softMask = document.createElement("canvas");
        softMask.width = width;
        softMask.height = height;
        const softMaskCtx = softMask.getContext("2d");
        softMaskCtx.filter = `blur(${feather}px)`;
        softMaskCtx.drawImage(source, 0, 0, width, height);
        softMaskCtx.filter = "none";

        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(softMask, 0, 0);
        ctx.globalCompositeOperation = "source-over";
    }
    return canvas;
}

function drawTextOverlay(ctx, width, height){
    const value = (selectedText.value || "").trim();
    if(!selectedText.enabled || !value){
        return;
    }

    const lines = value.split(/\r?\n/);
    const fontSize = Math.max(12, Math.round(selectedText.size));
    const fontParts = [];
    if(selectedText.italic){
        fontParts.push("italic");
    }
    fontParts.push(selectedText.bold ? "700" : "400");
    fontParts.push(`${fontSize}px`);
    fontParts.push("Inter, Arial, sans-serif");

    const x = (selectedText.x / 100) * width;
    const y = (selectedText.y / 100) * height;
    const lineHeight = Math.round(fontSize * 1.22);
    const totalHeight = (lines.length - 1) * lineHeight;
    const startY = y - (totalHeight / 2);

    ctx.save();
    ctx.font = fontParts.join(" ");
    ctx.fillStyle = selectedText.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = Math.max(0, Math.round(fontSize * 0.06));

    lines.forEach((line, index)=>{
        const currentY = startY + (index * lineHeight);
        const textLine = line || " ";
        if(selectedText.underline){
            const metrics = ctx.measureText(textLine);
            const underlineY = currentY + Math.round(fontSize * 0.42);
            ctx.save();
            ctx.strokeStyle = selectedText.color;
            ctx.lineWidth = Math.max(1, Math.round(fontSize * 0.06));
            ctx.beginPath();
            ctx.moveTo(x - (metrics.width / 2), underlineY);
            ctx.lineTo(x + (metrics.width / 2), underlineY);
            ctx.stroke();
            ctx.restore();
        }
        ctx.fillText(textLine, x, currentY);
    });

    ctx.restore();
}

function getTextOverlayBounds(width, height){
    const value = (selectedText.value || "").trim();
    if(!selectedText.enabled || !value){
        return null;
    }

    const lines = value.split(/\r?\n/);
    const fontSize = Math.max(12, Math.round(selectedText.size));
    const fontParts = [];
    if(selectedText.italic){
        fontParts.push("italic");
    }
    fontParts.push(selectedText.bold ? "700" : "400");
    fontParts.push(`${fontSize}px`);
    fontParts.push("Inter, Arial, sans-serif");

    const measureCanvas = document.createElement("canvas");
    const measureCtx = measureCanvas.getContext("2d");
    measureCtx.font = fontParts.join(" ");

    const lineHeight = Math.round(fontSize * 1.22);
    const textWidths = lines.map(line => measureCtx.measureText(line || " ").width);
    const maxWidth = Math.max(...textWidths, 1);
    const totalHeight = Math.max(fontSize, (lines.length - 1) * lineHeight + fontSize);
    const x = (selectedText.x / 100) * width;
    const y = (selectedText.y / 100) * height;
    const padding = Math.round(fontSize * 0.18);

    return {
        left: x - (maxWidth / 2) - padding,
        top: y - (totalHeight / 2) - padding,
        right: x + (maxWidth / 2) + padding,
        bottom: y + (totalHeight / 2) + padding
    };
}

function createRefineHintCanvas(rect, width, height){
    const hintCanvas = document.createElement("canvas");
    hintCanvas.width = Math.max(1, Math.round(width));
    hintCanvas.height = Math.max(1, Math.round(height));
    const hintCtx = hintCanvas.getContext("2d");

    hintCtx.save();
    hintCtx.globalAlpha = 0.2;
    hintCtx.drawImage(originalCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, hintCanvas.width, hintCanvas.height);
    hintCtx.restore();

    return hintCanvas;
}

function createPreviewCanvas(rect, width, height){
    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = Math.max(1, Math.round(width));
    previewCanvas.height = Math.max(1, Math.round(height));
    const previewCtx = previewCanvas.getContext("2d");

    buildBackgroundFill(previewCtx, previewCanvas.width, previewCanvas.height);

    if(refineMode){
        previewCtx.drawImage(createRefineHintCanvas(rect, previewCanvas.width, previewCanvas.height), 0, 0);
    }

    const foregroundCanvas = createVisibleForegroundCanvas();
    const croppedForegroundCanvas = createCroppedCanvas(foregroundCanvas, rect, previewCanvas.width, previewCanvas.height);

    if(selectedOutline.enabled && selectedOutline.size > 0){
        const outlineCanvas = createOutlineCanvas(croppedForegroundCanvas, previewCanvas.width, previewCanvas.height);
        previewCtx.drawImage(outlineCanvas, 0, 0);
    }

    previewCtx.drawImage(croppedForegroundCanvas, 0, 0);
    drawTextOverlay(previewCtx, previewCanvas.width, previewCanvas.height);
    return previewCanvas;
}

function cropCanvas(sourceCanvas, rect){
    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = Math.max(1, Math.round(rect.w));
    croppedCanvas.height = Math.max(1, Math.round(rect.h));
    const croppedCtx = croppedCanvas.getContext("2d");
    croppedCtx.drawImage(
        sourceCanvas,
        Math.round(rect.x),
        Math.round(rect.y),
        Math.round(rect.w),
        Math.round(rect.h),
        0,
        0,
        croppedCanvas.width,
        croppedCanvas.height
    );
    return croppedCanvas;
}

function commitCrop(){
    const exportRect = clampCropRect(cropRect);

    if(
        exportRect.x === 0 &&
        exportRect.y === 0 &&
        exportRect.w === baseCanvas.width &&
        exportRect.h === baseCanvas.height
    ){
        return false;
    }

    const croppedOriginal = cropCanvas(originalCanvas, exportRect);
    const croppedBase = cropCanvas(baseCanvas, exportRect);
    const croppedMask = cropCanvas(maskCanvas, exportRect);
    const croppedRestoreMask = cropCanvas(restoreMaskCanvas, exportRect);

    originalCanvas.width = croppedOriginal.width;
    originalCanvas.height = croppedOriginal.height;
    originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
    originalCtx.drawImage(croppedOriginal, 0, 0);

    baseCanvas.width = croppedBase.width;
    baseCanvas.height = croppedBase.height;
    baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
    baseCtx.drawImage(croppedBase, 0, 0);

    maskCanvas.width = croppedMask.width;
    maskCanvas.height = croppedMask.height;
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    maskCtx.drawImage(croppedMask, 0, 0);

    restoreMaskCanvas.width = croppedRestoreMask.width;
    restoreMaskCanvas.height = croppedRestoreMask.height;
    restoreMaskCtx.clearRect(0, 0, restoreMaskCanvas.width, restoreMaskCanvas.height);
    restoreMaskCtx.drawImage(croppedRestoreMask, 0, 0);

    cropRect = {
        x: 0,
        y: 0,
        w: baseCanvas.width,
        h: baseCanvas.height
    };

    setSizeBadges(baseCanvas.width, baseCanvas.height);
    renderBeforeCanvas();

    return true;
}

function createOutlineCanvas(foregroundCanvas, width, height){
    const outlineCanvas = document.createElement("canvas");
    outlineCanvas.width = width;
    outlineCanvas.height = height;
    const outlineCtx = outlineCanvas.getContext("2d");

    if(selectedOutline.mode === "hard"){
        const radius = Math.max(1, Math.round(selectedOutline.size));
        const step = Math.max(1, Math.ceil(radius / 4));
        const angleStep = Math.PI / 8;

        for(let distance = step; distance <= radius; distance += step){
            for(let angle = 0; angle < Math.PI * 2; angle += angleStep){
                const x = Math.round(Math.cos(angle) * distance);
                const y = Math.round(Math.sin(angle) * distance);
                outlineCtx.drawImage(foregroundCanvas, x, y);
            }
        }
    }else{
        outlineCtx.filter = `blur(${selectedOutline.size}px)`;
        outlineCtx.drawImage(foregroundCanvas, 0, 0);
        outlineCtx.filter = "none";
    }

    outlineCtx.globalCompositeOperation = "source-in";
    outlineCtx.fillStyle = selectedOutline.color;
    outlineCtx.fillRect(0, 0, width, height);

    return outlineCanvas;
}

function createCroppedCanvas(sourceCanvas, rect, width, height){
    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = width;
    croppedCanvas.height = height;
    const croppedCtx = croppedCanvas.getContext("2d");
    croppedCtx.drawImage(sourceCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, width, height);
    return croppedCanvas;
}

function buildBackgroundFill(ctx, width, height){
    if(selectedBackground.type === "solid"){
        ctx.fillStyle = selectedBackground.value;
        ctx.fillRect(0, 0, width, height);
        return;
    }

    if(selectedBackground.type === "gradient"){
        const angle = Number(gradientAngle.value || 135) * Math.PI / 180;
        const x = Math.cos(angle);
        const y = Math.sin(angle);
        const gradient = ctx.createLinearGradient(
            width * (0.5 - x * 0.5),
            height * (0.5 - y * 0.5),
            width * (0.5 + x * 0.5),
            height * (0.5 + y * 0.5)
        );
        gradient.addColorStop(0, gradientStart.value);
        gradient.addColorStop(1, gradientEnd.value);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }
}

function renderCanvas(){
    if(!baseCanvas.width || !baseCanvas.height){
        return;
    }

    const previewRect = { x: 0, y: 0, w: baseCanvas.width, h: baseCanvas.height };
    const previewCanvas = createPreviewCanvas(previewRect, previewRect.w, previewRect.h);

    afterCanvas.width = Math.max(1, Math.round(previewRect.w));
    afterCanvas.height = Math.max(1, Math.round(previewRect.h));

    afterCtx.clearRect(0, 0, afterCanvas.width, afterCanvas.height);
    afterCtx.drawImage(previewCanvas, 0, 0);
    imgWrap.style.background = "transparent";

    applyPreviewTransforms();
    updateCropOverlay();
    updateAfterStageCursor();
}

function showBrushPreview(event){
    const rect = afterStage.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    brushPreview.style.display = "block";
    updateBrushPreviewVisual();
    brushPreview.style.left = `${x}px`;
    brushPreview.style.top = `${y}px`;
}

function updateBrushPreviewVisual(){
    const hardnessRatio = Math.min(100, Math.max(0, brushHardness)) / 100;
    const softEdge = Math.round((1 - hardnessRatio) * 56) + 10;
    const innerStop = Math.max(18, 100 - softEdge);
    const borderAlpha = 0.55 + (hardnessRatio * 0.4);
    const label = hardnessRatio < 0.33 ? "Soft" : hardnessRatio < 0.66 ? "Medium" : "Hard";

    brushPreview.style.width = `${brushSize}px`;
    brushPreview.style.height = `${brushSize}px`;
    brushPreview.style.background = `radial-gradient(circle at center,
        rgba(255,255,255,${0.22 + hardnessRatio * 0.18}) 0%,
        rgba(255,255,255,${0.18 + hardnessRatio * 0.22}) ${innerStop}%,
        rgba(255,255,255,0.02) 100%)`;
    brushPreview.style.borderColor = `rgba(255,255,255,${borderAlpha})`;
    brushPreview.dataset.hardnessLabel = `${label} ${Math.round(hardnessRatio * 100)}%`;
}

function showHardnessLabelTemporarily(){
    brushPreview.classList.add("show-hardness-label");
    window.clearTimeout(hardnessLabelTimer);
    hardnessLabelTimer = window.setTimeout(()=>{
        brushPreview.classList.remove("show-hardness-label");
    }, 700);
}

function showHardnessPreviewInCenter(){
    const rect = afterStage.getBoundingClientRect();
    brushPreview.style.display = "block";
    updateBrushPreviewVisual();
    brushPreview.classList.remove("show-hardness-label");
    brushPreview.style.left = `${rect.width / 2}px`;
    brushPreview.style.top = `${rect.height / 2}px`;
}

function playBrushHardnessPreview(){
    brushPreview.classList.remove("hardness-anim");
    void brushPreview.offsetWidth;
    brushPreview.classList.add("hardness-anim");
    window.clearTimeout(playBrushHardnessPreview._timer);
    playBrushHardnessPreview._timer = window.setTimeout(()=>{
        brushPreview.classList.remove("hardness-anim");
    }, 220);
}

function hideBrushPreview(){
    brushPreview.style.display = "none";
}

function canvasPoint(event){
    const rect = afterCanvas.getBoundingClientRect();
    const ratioX = (event.clientX - rect.left) / rect.width;
    const ratioY = (event.clientY - rect.top) / rect.height;

    if(afterCanvas.width === baseCanvas.width && afterCanvas.height === baseCanvas.height){
        return {
            x: ratioX * baseCanvas.width,
            y: ratioY * baseCanvas.height
        };
    }

    return {
        x: cropRect.x + (ratioX * cropRect.w),
        y: cropRect.y + (ratioY * cropRect.h)
    };
}

function createBrushStamp(radius){
    const diameter = Math.max(1, Math.ceil(radius * 2));
    const stamp = document.createElement("canvas");
    stamp.width = diameter;
    stamp.height = diameter;
    const stampCtx = stamp.getContext("2d");

    const hardness = (Math.min(100, Math.max(0, brushHardness)) / 100) * 0.75;
    const innerRadius = Math.max(0, radius * hardness);
    const outerRadius = radius;
    const center = diameter / 2;

    stampCtx.beginPath();
    stampCtx.arc(center, center, outerRadius, 0, Math.PI * 2);
    if(hardness >= 1){
        stampCtx.fillStyle = "rgba(255,255,255,1)";
        stampCtx.fill();
        return stamp;
    }

    const gradient = stampCtx.createRadialGradient(center, center, innerRadius, center, center, outerRadius);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    stampCtx.fillStyle = gradient;
    stampCtx.fill();

    return stamp;
}

function applyBrush(point){
    const rect = afterCanvas.getBoundingClientRect();
    const scale = rect.width / afterCanvas.width || 1;
    const brushRadius = brushSize / (2 * scale);
    const stamp = createBrushStamp(brushRadius);
    brushStrokeChanged = true;

    if(refineAction === "erase"){
        maskCtx.save();
        maskCtx.globalCompositeOperation = "destination-out";
        maskCtx.drawImage(stamp, point.x - brushRadius, point.y - brushRadius);
        maskCtx.restore();

        restoreMaskCtx.save();
        restoreMaskCtx.globalCompositeOperation = "destination-out";
        restoreMaskCtx.drawImage(stamp, point.x - brushRadius, point.y - brushRadius);
        restoreMaskCtx.restore();
        restoreMaskDirty = true;
    }else if(restoreSource === "original"){
        restoreMaskCtx.save();
        restoreMaskCtx.globalCompositeOperation = "source-over";
        restoreMaskCtx.drawImage(stamp, point.x - brushRadius, point.y - brushRadius);
        restoreMaskCtx.restore();
        restoreMaskDirty = true;
    }else{
        maskCtx.save();
        maskCtx.globalCompositeOperation = "source-over";
        maskCtx.drawImage(stamp, point.x - brushRadius, point.y - brushRadius);
        maskCtx.restore();
    }
    renderCanvas();
}

function finalizeBrushStroke(){
    if(isPainting && brushStrokeChanged){
        pushHistory();
    }
    isPainting = false;
    brushStrokeChanged = false;
}

async function handleFile(file){
    if(!file){
        return;
    }

    uploadToken += 1;
    const currentToken = uploadToken;
    if(activeUploadController){
        activeUploadController.abort();
    }
    activeUploadController = new AbortController();

    if(currentOriginalUrl){
        URL.revokeObjectURL(currentOriginalUrl);
        currentOriginalUrl = "";
    }
    if(currentImageUrl){
        URL.revokeObjectURL(currentImageUrl);
        currentImageUrl = "";
    }

    sharedZoom = 1;
    beforeZoom = 1;
    beforePanX = 0;
    beforePanY = 0;
    textDrag = null;
    afterStage.style.cursor = "";
    applyPreviewTransforms();

    const originalUrl = URL.createObjectURL(file);
    currentOriginalUrl = originalUrl;
    const originalImage = new Image();
    originalImage.src = originalUrl;
    await originalImage.decode();

    originalCanvas.width = originalImage.naturalWidth;
    originalCanvas.height = originalImage.naturalHeight;
    originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
    originalCtx.drawImage(originalImage, 0, 0);
    setSizeBadges(originalCanvas.width, originalCanvas.height);
    renderBeforeCanvas();

    uploadBox.style.display = "none";
    reuploadBtn.parentElement.style.display = "flex";
    resultWrapper.style.display = "flex";
    scan.style.display = "block";
    afterCanvas.style.display = "none";
    hideBrushPreview();
    actionRow.style.display = "none";

    const formData = new FormData();
    formData.append("image", file);

    try{
        const res = await fetch("http://127.0.0.1:5000/smart-remove-bg", {
            method: "POST",
            body: formData,
            signal: activeUploadController.signal
        });

        if(currentToken !== uploadToken){
            return;
        }

        if(!res.ok){
            const text = await res.text();
            throw new Error(text || `Request failed (${res.status})`);
        }

        const blob = await res.blob();
        currentImageUrl = URL.createObjectURL(blob);

        const sourceImage = new Image();
        sourceImage.src = currentImageUrl;
        await sourceImage.decode();

        const softenedCanvas = applySoftCornersToCanvas(sourceImage, subjectCornerRadius, subjectCornerFeather);
        const edgeFeatheredCanvas = applySubjectEdgeFeatherToCanvas(softenedCanvas, subjectEdgeFeather);
        baseCanvas.width = softenedCanvas.width;
        baseCanvas.height = softenedCanvas.height;
        baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
        baseCtx.drawImage(edgeFeatheredCanvas, 0, 0);
        initMask();
        initRestoreMask();
        resetCropRect();
        historyStack = [];
        historyIndex = -1;
        restoreSource = "original";
        syncRestoreSourceButtons();

        scan.style.display = "none";
        afterCanvas.style.display = "block";
        actionRow.style.display = "flex";
        downloadBtn.style.display = "inline-block";
        selectedText.enabled = false;
        selectedText.value = "";
        selectedText.size = 64;
        selectedText.color = "#ffffff";
        selectedText.x = 50;
        selectedText.y = 50;
        selectedText.bold = true;
        selectedText.italic = false;
        selectedText.underline = false;
        textBtn.classList.remove("active");
        textPanel.classList.remove("active");
        textInput.value = "";
        textSizeInput.value = 64;
        textColorInput.value = "#ffffff";
        textPosXInput.value = 50;
        textPosYInput.value = 50;
        syncTextStyleButtons();
        renderCanvas();
        pushHistory();
    }catch(err){
        if(err.name === "AbortError"){
            return;
        }
        scan.style.display = "none";
        alert("Error: " + err.message);
    }
}

function downloadWithBackground(){
    if(!baseCanvas.width || !baseCanvas.height){
        return;
    }

    const exportRect = clampCropRect(cropRect);
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = Math.max(1, Math.round(exportRect.w));
    outputCanvas.height = Math.max(1, Math.round(exportRect.h));
    const ctx = outputCanvas.getContext("2d");

    buildBackgroundFill(ctx, outputCanvas.width, outputCanvas.height);

    const foregroundCanvas = createVisibleForegroundCanvas();
    const croppedForegroundCanvas = createCroppedCanvas(foregroundCanvas, exportRect, outputCanvas.width, outputCanvas.height);

    if(selectedOutline.enabled && selectedOutline.size > 0){
        const outlineCanvas = createOutlineCanvas(croppedForegroundCanvas, outputCanvas.width, outputCanvas.height);
        ctx.drawImage(outlineCanvas, 0, 0, outputCanvas.width, outputCanvas.height);
    }

    ctx.drawImage(croppedForegroundCanvas, 0, 0, outputCanvas.width, outputCanvas.height);
    drawTextOverlay(ctx, outputCanvas.width, outputCanvas.height);

    outputCanvas.toBlob((blob)=>{
        if(!blob){
            alert("Could not create download file.");
            return;
        }

        const url = URL.createObjectURL(blob);
        const tempLink = document.createElement("a");
        tempLink.href = url;
        tempLink.download = "ajartivo.png";
        tempLink.click();
        setTimeout(()=> URL.revokeObjectURL(url), 1000);
    }, "image/png");
}

function setRestoreSource(source){
    restoreSource = source;
    syncRestoreSourceButtons();
    renderCanvas();
    pushHistory();
}

/* EVENTS */
uploadBox.addEventListener("click", ()=> fileInput.click());
reuploadBtn.addEventListener("click", ()=>{
    fileInput.value = "";
    fileInput.click();
});
fileInput.addEventListener("change", ()=> handleFile(fileInput.files[0]));

uploadBox.addEventListener("dragover", (e)=> e.preventDefault());
uploadBox.addEventListener("drop", (e)=>{
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
});

colorCircles.forEach(circle=>{
    circle.addEventListener("click", ()=>{
        applyBackground(circle.getAttribute("data-color"));
        pushHistory();
    });
});

colorPicker.addEventListener("input", ()=>{
    applyBackground(colorPicker.value);
    pushHistory();
});

gradientPreset.addEventListener("click", ()=>{
    applyBackground("gradient");
    setButtonActive(gradientPreset, true);
    gradientPanel.classList.toggle("active");
    refinePanel.classList.remove("active");
    resizePanel.classList.remove("active");
    textPanel.classList.remove("active");
    outlinePanel.classList.remove("active");
    refineBtn.classList.remove("active");
    resizeBtn.classList.remove("active");
    outlineBtn.classList.remove("active");
    pushHistory();
});

gradientStart.addEventListener("input", ()=>{
    if(selectedBackground.type === "gradient"){
        renderCanvas();
        pushHistory();
    }
});

gradientEnd.addEventListener("input", ()=>{
    if(selectedBackground.type === "gradient"){
        renderCanvas();
        pushHistory();
    }
});

gradientAngle.addEventListener("input", ()=>{
    if(selectedBackground.type === "gradient"){
        renderCanvas();
        pushHistory();
    }
});

refineBtn.addEventListener("click", ()=>{
    refineMode = !refineMode;
    setButtonActive(refineBtn, refineMode);
    refinePanel.classList.toggle("active", refineMode);
    resizePanel.classList.remove("active");
    textPanel.classList.remove("active");
    outlinePanel.classList.remove("active");
    gradientPanel.classList.remove("active");
    resizeBtn.classList.remove("active");
    outlineBtn.classList.remove("active");
    gradientPreset.classList.remove("active");
    if(!refineMode){
        hideBrushPreview();
    }
});

resizeBtn.addEventListener("click", ()=>{
    resizePanel.classList.toggle("active");
    resizeBtn.classList.toggle("active");
    refinePanel.classList.remove("active");
    textPanel.classList.remove("active");
    outlinePanel.classList.remove("active");
    gradientPanel.classList.remove("active");
    refineBtn.classList.remove("active");
    outlineBtn.classList.remove("active");
    gradientPreset.classList.remove("active");
    hideBrushPreview();
    if(!resizePanel.classList.contains("active")){
        cropInteraction = null;
        renderCanvas();
    }
    updateCropOverlay();
});

outlineBtn.addEventListener("click", ()=>{
    selectedOutline.enabled = !selectedOutline.enabled;
    outlineBtn.classList.toggle("active", selectedOutline.enabled);
    outlinePanel.classList.toggle("active", selectedOutline.enabled);
    syncOutlineModeButtons();
    refinePanel.classList.remove("active");
    resizePanel.classList.remove("active");
    textPanel.classList.remove("active");
    gradientPanel.classList.remove("active");
    refineBtn.classList.remove("active");
    resizeBtn.classList.remove("active");
    gradientPreset.classList.remove("active");
    renderCanvas();
    pushHistory();
});

textBtn.addEventListener("click", ()=>{
    selectedText.enabled = !selectedText.enabled;
    textBtn.classList.toggle("active", selectedText.enabled);
    textPanel.classList.toggle("active", selectedText.enabled);
    refinePanel.classList.remove("active");
    resizePanel.classList.remove("active");
    outlinePanel.classList.remove("active");
    gradientPanel.classList.remove("active");
    refineBtn.classList.remove("active");
    resizeBtn.classList.remove("active");
    outlineBtn.classList.remove("active");
    renderCanvas();
    updateAfterStageCursor();
    pushHistory();
});

outlineShadowBtn.addEventListener("click", ()=>{
    setOutlineMode("shadow");
});

outlineHardBtn.addEventListener("click", ()=>{
    setOutlineMode("hard");
});

eraseModeBtn.addEventListener("click", ()=>{
    refineAction = "erase";
    eraseModeBtn.classList.add("active");
    restoreModeBtn.classList.remove("active");
});

restoreModeBtn.addEventListener("click", ()=>{
    refineAction = "restore";
    restoreModeBtn.classList.add("active");
    eraseModeBtn.classList.remove("active");
    setRestoreSource("original");
});

restoreRemovedBtn.addEventListener("click", ()=>{
    setRestoreSource("removed");
});

restoreOriginalBtn.addEventListener("click", ()=>{
    setRestoreSource("original");
});

historyUndoBtn.addEventListener("click", undoHistory);
historyRedoBtn.addEventListener("click", redoHistory);

brushSizeInput.addEventListener("input", ()=>{
    brushSize = Number(brushSizeInput.value);
    updateBrushPreviewVisual();
});

brushHardnessInput.addEventListener("input", ()=>{
    brushHardness = Number(brushHardnessInput.value);
    if(brushPreview.style.display === "block"){
        updateBrushPreviewVisual();
        showHardnessLabelTemporarily();
        playBrushHardnessPreview();
    }else{
        showHardnessPreviewInCenter();
        showHardnessLabelTemporarily();
        playBrushHardnessPreview();
    }
});

cropRadiusInput.addEventListener("input", ()=>{
    cropRadius = Number(cropRadiusInput.value);
    updateCropOverlay();
});

textInput.addEventListener("input", ()=>{
    selectedText.value = textInput.value;
    renderCanvas();
    window.clearTimeout(textInput._historyTimer);
    textInput._historyTimer = window.setTimeout(()=>{
        pushHistory();
    }, 450);
});

textSizeInput.addEventListener("input", ()=>{
    selectedText.size = Number(textSizeInput.value);
    renderCanvas();
    pushHistory();
});

textColorInput.addEventListener("input", ()=>{
    selectedText.color = textColorInput.value;
    renderCanvas();
    pushHistory();
});

textPosXInput.addEventListener("input", ()=>{
    selectedText.x = Number(textPosXInput.value);
    renderCanvas();
    pushHistory();
});

textPosYInput.addEventListener("input", ()=>{
    selectedText.y = Number(textPosYInput.value);
    renderCanvas();
    pushHistory();
});

textBoldBtn.addEventListener("click", ()=>{
    setTextStyle("bold");
});

textItalicBtn.addEventListener("click", ()=>{
    setTextStyle("italic");
});

textUnderlineBtn.addEventListener("click", ()=>{
    setTextStyle("underline");
});

outlineSizeInput.addEventListener("input", ()=>{
    selectedOutline.size = Number(outlineSizeInput.value);
    renderCanvas();
    pushHistory();
});

outlineColorInput.addEventListener("input", ()=>{
    selectedOutline.color = outlineColorInput.value;
    renderCanvas();
    pushHistory();
});

document.querySelectorAll(".panel-close").forEach(button=>{
    button.addEventListener("click", ()=>{
        const panel = document.getElementById(button.dataset.panel);
        panel.classList.remove("active");
        if(button.dataset.panel === "refinePanel"){
            refineMode = false;
            refineBtn.classList.remove("active");
            const hadRestoreEdits = restoreMaskDirty;
            if(hadRestoreEdits){
                pushHistory();
                commitRestoreMask();
            }
            hideBrushPreview();
            renderCanvas();
            if(hadRestoreEdits){
                pushHistory();
            }
        }
        if(button.dataset.panel === "resizePanel"){
            resizeBtn.classList.remove("active");
            cropInteraction = null;
            const cropSnapshot = clampCropRect(cropRect);
            const isRealCrop = cropSnapshot.x !== 0 || cropSnapshot.y !== 0 || cropSnapshot.w !== baseCanvas.width || cropSnapshot.h !== baseCanvas.height;
            if(isRealCrop){
                pushHistory();
            }
            const didCrop = commitCrop();
            updateCropOverlay();
            renderCanvas();
            if(didCrop){
                pushHistory();
            }
        }
        if(button.dataset.panel === "textPanel"){
            window.clearTimeout(textInput._historyTimer);
            pushHistory();
            textBtn.classList.toggle("active", selectedText.enabled);
            textPanel.classList.toggle("active", selectedText.enabled);
        }
        if(button.dataset.panel === "outlinePanel"){
            outlineBtn.classList.toggle("active", selectedOutline.enabled);
            syncOutlineModeButtons();
        }
        if(button.dataset.panel === "gradientPanel"){
            gradientPreset.classList.remove("active");
        }
    });
});

if(cropOverlay && cropBox){
    cropBox.addEventListener("pointerdown", (e)=>{
        const handle = e.target.closest(".crop-handle");
        beginCropInteraction(e, handle ? handle.dataset.handle : "move");
    });

    cropOverlay.addEventListener("pointermove", applyCropInteraction);
    cropOverlay.addEventListener("pointerup", endCropInteraction);
    cropOverlay.addEventListener("pointercancel", endCropInteraction);
}

beforeStage.addEventListener("pointerdown", (e)=>{
    if(beforeZoom <= 1){
        return;
    }
    e.preventDefault();
    isBeforePanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOriginX = beforePanX;
    panOriginY = beforePanY;
    beforeStage.setPointerCapture(e.pointerId);
});

beforeStage.addEventListener("pointermove", (e)=>{
    if(!isBeforePanning){
        return;
    }

    e.preventDefault();
    beforePanX = panOriginX + (e.clientX - panStartX);
    beforePanY = panOriginY + (e.clientY - panStartY);
    const clamped = clampStagePan(beforeStage, beforeZoom, { x: beforePanX, y: beforePanY });
    beforePanX = clamped.x;
    beforePanY = clamped.y;
    applyPreviewTransforms();
});

beforeStage.addEventListener("pointerup", ()=>{
    isBeforePanning = false;
});

beforeStage.addEventListener("pointercancel", ()=>{
    isBeforePanning = false;
});

beforeStage.addEventListener("wheel", (e)=>{
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setSharedZoom(sharedZoom + delta);
    const clamped = clampStagePan(beforeStage, sharedZoom, { x: beforePanX, y: beforePanY });
    beforePanX = clamped.x;
    beforePanY = clamped.y;
    applyPreviewTransforms();
}, { passive: false });

afterStage.addEventListener("pointerdown", (e)=>{
    if(!selectedText.enabled || refineMode || resizePanel.classList.contains("active")){
        return;
    }
    beginTextDrag(e);
});

afterStage.addEventListener("pointermove", (e)=>{
    applyTextDrag(e);
});

afterStage.addEventListener("pointerup", (e)=>{
    endTextDrag(e);
});

afterStage.addEventListener("pointercancel", (e)=>{
    endTextDrag(e);
});

afterStage.addEventListener("wheel", (e)=>{
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setSharedZoom(sharedZoom + delta);
}, { passive: false });

afterCanvas.addEventListener("pointerenter", (e)=>{
    if(refineMode){
        showBrushPreview(e);
    }
});

afterCanvas.addEventListener("pointermove", (e)=>{
    if(refineMode){
        showBrushPreview(e);
        if(isPainting){
            applyBrush(canvasPoint(e));
        }
    }
});

window.addEventListener("keydown", (e)=>{
    if(e.code === "Space"){
        spacePressed = true;
        if(refineMode){
            afterCanvas.style.cursor = "grab";
        }
    }
});

window.addEventListener("keyup", (e)=>{
    if(e.code === "Space"){
        spacePressed = false;
        if(refineMode){
            afterCanvas.style.cursor = "default";
        }
    }
});

afterCanvas.addEventListener("pointerdown", (e)=>{
    if(!refineMode || !baseCanvas.width){
        return;
    }
    isPainting = true;
    brushStrokeChanged = false;
    afterCanvas.setPointerCapture(e.pointerId);
    applyBrush(canvasPoint(e));
});

afterCanvas.addEventListener("pointerup", ()=>{
    finalizeBrushStroke();
});

afterCanvas.addEventListener("pointerleave", ()=>{
    hideBrushPreview();
    finalizeBrushStroke();
});

afterCanvas.addEventListener("pointercancel", ()=>{
    hideBrushPreview();
    finalizeBrushStroke();
});

downloadBtn.addEventListener("click", (e)=>{
    e.preventDefault();
    downloadWithBackground();
});
