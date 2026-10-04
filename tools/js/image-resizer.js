(function () {
    "use strict";

    window.AjArtivoTools = window.AjArtivoTools || {};
    window.AjArtivoTools.imageResizer = true;

    document.addEventListener("DOMContentLoaded", initResizerStudio);

    function initResizerStudio() {
        const fileInput = document.getElementById("resizerFileInput");
        const dropZone = document.getElementById("resizerDropZone");
        const canvas = document.getElementById("resizerPreviewCanvas");
        const canvasWrap = document.getElementById("resizerCanvasWrap");
        const widthInput = document.getElementById("resizerWidth");
        const heightInput = document.getElementById("resizerHeight");
        const lockBtn = document.getElementById("aspectLockBtn");
        const formatSelect = document.getElementById("resizerFormat");
        const qualitySlider = document.getElementById("resizerQuality");
        const qualityVal = document.getElementById("qualityVal");
        const downloadBtn = document.getElementById("resizerDownloadBtn");
        const metaOrig = document.getElementById("metaOriginalDim");
        const metaNew = document.getElementById("metaNewDim");
        const metaSize = document.getElementById("metaFileSize");

        // Crop UI Elements
        const toggleCropBtn = document.getElementById("toggleCropBtn");
        const toggleCropBtnText = document.getElementById("toggleCropBtnText");
        const cropStatusPill = document.getElementById("cropStatusPill");
        const cropActiveActions = document.getElementById("cropActiveActions");
        const cropRatioToolbar = document.getElementById("cropRatioToolbar");
        const cropRatioChips = document.querySelectorAll(".crop-ratio-chip");
        const cropCustomRatioRow = document.getElementById("cropCustomRatioRow");
        const customRatioWInput = document.getElementById("customRatioW");
        const customRatioHInput = document.getElementById("customRatioH");
        const applyCustomRatioBtn = document.getElementById("applyCustomRatioBtn");
        const applyCropBtn = document.getElementById("applyCropBtn");
        const resetCropBtn = document.getElementById("resetCropBtn");
        const revertOriginalBtn = document.getElementById("revertOriginalBtn");
        const cancelCropBtn = document.getElementById("cancelCropBtn");

        const cropOverlay = document.getElementById("resizerCropOverlay");
        const cropBoxEl = document.getElementById("resizerCropBox");
        const cropDimBadge = document.getElementById("cropDimBadge");
        const cropScrimTop = document.getElementById("cropScrimTop");
        const cropScrimBottom = document.getElementById("cropScrimBottom");
        const cropScrimLeft = document.getElementById("cropScrimLeft");
        const cropScrimRight = document.getElementById("cropScrimRight");

        if (!canvas || !fileInput) return;

        const ctx = canvas.getContext("2d");

        // Core Image State
        let masterSourceImage = null; // Uncropped original image
        let sourceImage = null;       // Active working image
        let originalWidth = 0;
        let originalHeight = 0;
        let aspectRatio = 1;
        let isLocked = true;
        let fileName = "resized-image";
        let hasBeenCropped = false;

        // Crop State
        let isCropMode = false;
        let cropRatioMode = "free"; // "free", "1:1", "16:9", "9:16", "4:3", "3:2", "custom"
        let activeCropRatio = null; // null for free-form, or number (W / H)
        let customRatioW = 5;
        let customRatioH = 4;
        let cropBox = { x: 0, y: 0, w: 100, h: 100 };
        const MIN_CROP_SIZE = 28;

        // Drag State
        let isDragging = false;
        let dragMode = null; // "box", "nw", "ne", "se", "sw", "n", "e", "s", "w"
        let dragStartX = 0;
        let dragStartY = 0;
        let initCropBox = { x: 0, y: 0, w: 0, h: 0 };

        // ----------------------------------------
        // Dropzone & File Upload Handling
        // ----------------------------------------
        if (dropZone) {
            ["dragenter", "dragover"].forEach(function (eventName) {
                dropZone.addEventListener(eventName, function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    dropZone.style.borderColor = "#3b82f6";
                });
            });

            ["dragleave", "drop"].forEach(function (eventName) {
                dropZone.addEventListener(eventName, function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    dropZone.style.borderColor = "";
                });
            });

            dropZone.addEventListener("drop", function (e) {
                const files = e.dataTransfer && e.dataTransfer.files;
                if (files && files.length > 0) {
                    loadImageFile(files[0]);
                }
            });

            dropZone.addEventListener("click", function () {
                fileInput.click();
            });
        }

        fileInput.addEventListener("change", function () {
            if (fileInput.files && fileInput.files.length > 0) {
                loadImageFile(fileInput.files[0]);
            }
        });

        function loadImageFile(file) {
            if (!file.type.startsWith("image/")) {
                alert("Please select a valid image file.");
                return;
            }

            fileName = file.name.replace(/\.[^/.]+$/, "");
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = new Image();
                img.onload = function () {
                    masterSourceImage = img;
                    sourceImage = img;
                    hasBeenCropped = false;
                    if (revertOriginalBtn) revertOriginalBtn.style.display = "none";

                    originalWidth = img.naturalWidth || img.width;
                    originalHeight = img.naturalHeight || img.height;
                    aspectRatio = originalWidth / originalHeight;

                    widthInput.value = originalWidth;
                    heightInput.value = originalHeight;

                    if (metaOrig) metaOrig.textContent = `${originalWidth} × ${originalHeight} px`;
                    if (downloadBtn) downloadBtn.disabled = false;

                    // If crop mode was already open, adapt crop box
                    if (isCropMode) {
                        resetCropBoxToImage();
                    }

                    renderPreview();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        // ----------------------------------------
        // Preview Rendering
        // ----------------------------------------
        function renderPreview() {
            if (!sourceImage) return;

            const targetW = parseInt(widthInput.value, 10) || originalWidth;
            const targetH = parseInt(heightInput.value, 10) || originalHeight;

            canvas.width = targetW;
            canvas.height = targetH;

            ctx.clearRect(0, 0, targetW, targetH);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(sourceImage, 0, 0, targetW, targetH);

            if (metaNew) metaNew.textContent = `${targetW} × ${targetH} px`;

            // Estimate download size
            const format = (formatSelect && formatSelect.value) || "image/png";
            const quality = (parseInt(qualitySlider.value, 10) || 90) / 100;
            canvas.toBlob(function (blob) {
                if (blob && metaSize) {
                    metaSize.textContent = formatBytes(blob.size);
                }
            }, format, quality);

            // Re-sync crop overlay position after rendering canvas
            if (isCropMode) {
                requestAnimationFrame(syncCropOverlayBounds);
            }
        }

        // ----------------------------------------
        // Interactive Drag-and-Drop Crop System
        // ----------------------------------------
        function toggleCropMode(enable) {
            isCropMode = typeof enable === "boolean" ? enable : !isCropMode;

            if (isCropMode) {
                if (!sourceImage) {
                    alert("Please upload an image first to crop.");
                    isCropMode = false;
                    return;
                }

                toggleCropBtn.classList.add("active");
                if (toggleCropBtnText) toggleCropBtnText.textContent = "Exit Crop";
                if (cropStatusPill) {
                    cropStatusPill.textContent = "Cropping Active";
                    cropStatusPill.classList.add("cropping");
                }
                if (cropActiveActions) cropActiveActions.style.display = "flex";
                if (cropRatioToolbar) cropRatioToolbar.style.display = "flex";
                if (cropOverlay) cropOverlay.style.display = "block";

                syncCropOverlayBounds();
                resetCropBoxToImage();
            } else {
                toggleCropBtn.classList.remove("active");
                if (toggleCropBtnText) toggleCropBtnText.textContent = "Crop Area";
                if (cropStatusPill) {
                    cropStatusPill.textContent = hasBeenCropped ? "Cropped" : "Ready";
                    cropStatusPill.classList.remove("cropping");
                }
                if (cropActiveActions) cropActiveActions.style.display = "none";
                if (cropRatioToolbar) cropRatioToolbar.style.display = "none";
                if (cropOverlay) cropOverlay.style.display = "none";
            }
        }

        function syncCropOverlayBounds() {
            if (!cropOverlay || !canvas || !canvasWrap) return;
            const canvasRect = canvas.getBoundingClientRect();
            const wrapRect = canvasWrap.getBoundingClientRect();

            cropOverlay.style.left = `${Math.round(canvasRect.left - wrapRect.left)}px`;
            cropOverlay.style.top = `${Math.round(canvasRect.top - wrapRect.top)}px`;
            cropOverlay.style.width = `${Math.round(canvasRect.width)}px`;
            cropOverlay.style.height = `${Math.round(canvasRect.height)}px`;
        }

        function getOverlayDimensions() {
            if (!cropOverlay) return { width: 400, height: 300 };
            const rect = cropOverlay.getBoundingClientRect();
            return {
                width: Math.max(1, rect.width),
                height: Math.max(1, rect.height)
            };
        }

        function resetCropBoxToImage() {
            const dims = getOverlayDimensions();
            const ow = dims.width;
            const oh = dims.height;

            if (activeCropRatio === null) {
                // Free-form: fill 90% centered
                const marginX = Math.round(ow * 0.05);
                const marginY = Math.round(oh * 0.05);
                cropBox.x = marginX;
                cropBox.y = marginY;
                cropBox.w = Math.max(MIN_CROP_SIZE, ow - marginX * 2);
                cropBox.h = Math.max(MIN_CROP_SIZE, oh - marginY * 2);
            } else {
                // Constrained aspect ratio: fit max rectangle with activeCropRatio centered
                let boxW = ow * 0.9;
                let boxH = boxW / activeCropRatio;

                if (boxH > oh * 0.9) {
                    boxH = oh * 0.9;
                    boxW = boxH * activeCropRatio;
                }

                boxW = Math.max(MIN_CROP_SIZE, Math.round(boxW));
                boxH = Math.max(MIN_CROP_SIZE, Math.round(boxH));

                cropBox.w = boxW;
                cropBox.h = boxH;
                cropBox.x = Math.max(0, Math.round((ow - boxW) / 2));
                cropBox.y = Math.max(0, Math.round((oh - boxH) / 2));
            }

            updateCropVisuals();
        }

        function applyCurrentRatioToCropBox() {
            const dims = getOverlayDimensions();
            const ow = dims.width;
            const oh = dims.height;

            if (activeCropRatio === null) {
                // Free-form: keep current dimensions clamped
                clampCropBoxToBounds(ow, oh);
            } else {
                // Adapt current box around its center to match activeCropRatio
                const centerX = cropBox.x + cropBox.w / 2;
                const centerY = cropBox.y + cropBox.h / 2;

                let newW = cropBox.w;
                let newH = newW / activeCropRatio;

                if (newH > oh) {
                    newH = oh * 0.9;
                    newW = newH * activeCropRatio;
                }
                if (newW > ow) {
                    newW = ow * 0.9;
                    newH = newW / activeCropRatio;
                }

                newW = Math.max(MIN_CROP_SIZE, Math.round(newW));
                newH = Math.max(MIN_CROP_SIZE, Math.round(newH));

                cropBox.w = newW;
                cropBox.h = newH;
                cropBox.x = Math.round(centerX - newW / 2);
                cropBox.y = Math.round(centerY - newH / 2);

                clampCropBoxToBounds(ow, oh);
            }

            updateCropVisuals();
        }

        function clampCropBoxToBounds(ow, oh) {
            if (cropBox.w > ow) cropBox.w = ow;
            if (cropBox.h > oh) cropBox.h = oh;
            if (cropBox.x < 0) cropBox.x = 0;
            if (cropBox.y < 0) cropBox.y = 0;
            if (cropBox.x + cropBox.w > ow) cropBox.x = Math.max(0, ow - cropBox.w);
            if (cropBox.y + cropBox.h > oh) cropBox.y = Math.max(0, oh - cropBox.h);
        }

        function updateCropVisuals() {
            if (!cropBoxEl || !cropOverlay) return;
            const dims = getOverlayDimensions();
            const ow = dims.width;
            const oh = dims.height;

            // Position & size of crop box
            cropBoxEl.style.left = `${cropBox.x}px`;
            cropBoxEl.style.top = `${cropBox.y}px`;
            cropBoxEl.style.width = `${cropBox.w}px`;
            cropBoxEl.style.height = `${cropBox.h}px`;

            // Position scrims
            if (cropScrimTop) {
                cropScrimTop.style.top = "0px";
                cropScrimTop.style.left = "0px";
                cropScrimTop.style.width = "100%";
                cropScrimTop.style.height = `${cropBox.y}px`;
            }
            if (cropScrimBottom) {
                const bottomY = cropBox.y + cropBox.h;
                cropScrimBottom.style.top = `${bottomY}px`;
                cropScrimBottom.style.left = "0px";
                cropScrimBottom.style.width = "100%";
                cropScrimBottom.style.height = `${Math.max(0, oh - bottomY)}px`;
            }
            if (cropScrimLeft) {
                cropScrimLeft.style.top = `${cropBox.y}px`;
                cropScrimLeft.style.left = "0px";
                cropScrimLeft.style.width = `${cropBox.x}px`;
                cropScrimLeft.style.height = `${cropBox.h}px`;
            }
            if (cropScrimRight) {
                const rightX = cropBox.x + cropBox.w;
                cropScrimRight.style.top = `${cropBox.y}px`;
                cropScrimRight.style.left = `${rightX}px`;
                cropScrimRight.style.width = `${Math.max(0, ow - rightX)}px`;
                cropScrimRight.style.height = `${cropBox.h}px`;
            }

            // Dimension Badge in natural source pixels
            if (cropDimBadge && sourceImage) {
                const scaleX = sourceImage.naturalWidth / ow;
                const scaleY = sourceImage.naturalHeight / oh;
                const naturalW = Math.round(cropBox.w * scaleX);
                const naturalH = Math.round(cropBox.h * scaleY);
                const ratioText = getRatioLabel();
                cropDimBadge.textContent = `${naturalW} × ${naturalH} px · ${ratioText}`;
            }
        }

        function getRatioLabel() {
            if (cropRatioMode === "free") return "Free";
            if (cropRatioMode === "1:1") return "1:1";
            if (cropRatioMode === "16:9") return "16:9";
            if (cropRatioMode === "9:16") return "9:16";
            if (cropRatioMode === "4:3") return "4:3";
            if (cropRatioMode === "3:2") return "3:2";
            if (cropRatioMode === "custom") return `${customRatioW}:${customRatioH}`;
            return "Crop";
        }

        // ----------------------------------------
        // Drag & Handle Interactions
        // ----------------------------------------
        function onPointerDown(e) {
            if (!isCropMode) return;
            const target = e.target;

            if (target.classList.contains("crop-handle")) {
                dragMode = target.getAttribute("data-handle");
            } else if (target === cropBoxEl || cropBoxEl.contains(target)) {
                dragMode = "box";
            } else {
                return;
            }

            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            initCropBox = { x: cropBox.x, y: cropBox.y, w: cropBox.w, h: cropBox.h };

            cropBoxEl.classList.add("is-active");
            document.body.style.userSelect = "none";

            window.addEventListener("pointermove", onPointerMove);
            window.addEventListener("pointerup", onPointerUp);
            window.addEventListener("pointercancel", onPointerUp);
            e.preventDefault();
        }

        function onPointerMove(e) {
            if (!isDragging) return;
            const dims = getOverlayDimensions();
            const ow = dims.width;
            const oh = dims.height;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;

            if (dragMode === "box") {
                // Moving entire crop box
                let nextX = initCropBox.x + dx;
                let nextY = initCropBox.y + dy;
                nextX = Math.max(0, Math.min(nextX, ow - initCropBox.w));
                nextY = Math.max(0, Math.min(nextY, oh - initCropBox.h));
                cropBox.x = Math.round(nextX);
                cropBox.y = Math.round(nextY);
                updateCropVisuals();
                return;
            }

            // Resizing handles
            let newX = initCropBox.x;
            let newY = initCropBox.y;
            let newW = initCropBox.w;
            let newH = initCropBox.h;

            if (activeCropRatio === null) {
                // Free-form resizing
                switch (dragMode) {
                    case "se":
                        newW = Math.max(MIN_CROP_SIZE, Math.min(initCropBox.w + dx, ow - initCropBox.x));
                        newH = Math.max(MIN_CROP_SIZE, Math.min(initCropBox.h + dy, oh - initCropBox.y));
                        break;
                    case "sw":
                        newW = Math.max(MIN_CROP_SIZE, initCropBox.w - dx);
                        if (initCropBox.x + initCropBox.w - newW < 0) {
                            newW = initCropBox.x + initCropBox.w;
                        }
                        newX = initCropBox.x + initCropBox.w - newW;
                        newH = Math.max(MIN_CROP_SIZE, Math.min(initCropBox.h + dy, oh - initCropBox.y));
                        break;
                    case "ne":
                        newW = Math.max(MIN_CROP_SIZE, Math.min(initCropBox.w + dx, ow - initCropBox.x));
                        newH = Math.max(MIN_CROP_SIZE, initCropBox.h - dy);
                        if (initCropBox.y + initCropBox.h - newH < 0) {
                            newH = initCropBox.y + initCropBox.h;
                        }
                        newY = initCropBox.y + initCropBox.h - newH;
                        break;
                    case "nw":
                        newW = Math.max(MIN_CROP_SIZE, initCropBox.w - dx);
                        if (initCropBox.x + initCropBox.w - newW < 0) {
                            newW = initCropBox.x + initCropBox.w;
                        }
                        newX = initCropBox.x + initCropBox.w - newW;

                        newH = Math.max(MIN_CROP_SIZE, initCropBox.h - dy);
                        if (initCropBox.y + initCropBox.h - newH < 0) {
                            newH = initCropBox.y + initCropBox.h;
                        }
                        newY = initCropBox.y + initCropBox.h - newH;
                        break;
                    case "e":
                        newW = Math.max(MIN_CROP_SIZE, Math.min(initCropBox.w + dx, ow - initCropBox.x));
                        break;
                    case "w":
                        newW = Math.max(MIN_CROP_SIZE, initCropBox.w - dx);
                        if (initCropBox.x + initCropBox.w - newW < 0) {
                            newW = initCropBox.x + initCropBox.w;
                        }
                        newX = initCropBox.x + initCropBox.w - newW;
                        break;
                    case "s":
                        newH = Math.max(MIN_CROP_SIZE, Math.min(initCropBox.h + dy, oh - initCropBox.y));
                        break;
                    case "n":
                        newH = Math.max(MIN_CROP_SIZE, initCropBox.h - dy);
                        if (initCropBox.y + initCropBox.h - newH < 0) {
                            newH = initCropBox.y + initCropBox.h;
                        }
                        newY = initCropBox.y + initCropBox.h - newH;
                        break;
                }
            } else {
                // Fixed aspect ratio resizing
                const ratio = activeCropRatio;
                switch (dragMode) {
                    case "se": {
                        let w = initCropBox.w + dx;
                        let h = w / ratio;
                        if (initCropBox.x + w > ow) {
                            w = ow - initCropBox.x;
                            h = w / ratio;
                        }
                        if (initCropBox.y + h > oh) {
                            h = oh - initCropBox.y;
                            w = h * ratio;
                        }
                        newW = Math.max(MIN_CROP_SIZE, Math.round(w));
                        newH = Math.max(MIN_CROP_SIZE, Math.round(h));
                        break;
                    }
                    case "sw": {
                        let w = initCropBox.w - dx;
                        let h = w / ratio;
                        if (initCropBox.y + h > oh) {
                            h = oh - initCropBox.y;
                            w = h * ratio;
                        }
                        if (initCropBox.x + initCropBox.w - w < 0) {
                            w = initCropBox.x + initCropBox.w;
                            h = w / ratio;
                        }
                        newW = Math.max(MIN_CROP_SIZE, Math.round(w));
                        newH = Math.max(MIN_CROP_SIZE, Math.round(h));
                        newX = initCropBox.x + initCropBox.w - newW;
                        break;
                    }
                    case "ne": {
                        let w = initCropBox.w + dx;
                        let h = w / ratio;
                        if (initCropBox.x + w > ow) {
                            w = ow - initCropBox.x;
                            h = w / ratio;
                        }
                        if (initCropBox.y + initCropBox.h - h < 0) {
                            h = initCropBox.y + initCropBox.h;
                            w = h * ratio;
                        }
                        newW = Math.max(MIN_CROP_SIZE, Math.round(w));
                        newH = Math.max(MIN_CROP_SIZE, Math.round(h));
                        newY = initCropBox.y + initCropBox.h - newH;
                        break;
                    }
                    case "nw": {
                        let w = initCropBox.w - dx;
                        let h = w / ratio;
                        if (initCropBox.x + initCropBox.w - w < 0) {
                            w = initCropBox.x + initCropBox.w;
                            h = w / ratio;
                        }
                        if (initCropBox.y + initCropBox.h - h < 0) {
                            h = initCropBox.y + initCropBox.h;
                            w = h * ratio;
                        }
                        newW = Math.max(MIN_CROP_SIZE, Math.round(w));
                        newH = Math.max(MIN_CROP_SIZE, Math.round(h));
                        newX = initCropBox.x + initCropBox.w - newW;
                        newY = initCropBox.y + initCropBox.h - newH;
                        break;
                    }
                    case "e":
                    case "w": {
                        let w = dragMode === "e" ? initCropBox.w + dx : initCropBox.w - dx;
                        let h = w / ratio;
                        if (h > oh) {
                            h = oh;
                            w = h * ratio;
                        }
                        newW = Math.max(MIN_CROP_SIZE, Math.round(w));
                        newH = Math.max(MIN_CROP_SIZE, Math.round(h));
                        if (dragMode === "w") {
                            newX = initCropBox.x + initCropBox.w - newW;
                        }
                        // Symmetrically center vertically
                        const centerY = initCropBox.y + initCropBox.h / 2;
                        newY = Math.max(0, Math.min(Math.round(centerY - newH / 2), oh - newH));
                        break;
                    }
                    case "s":
                    case "n": {
                        let h = dragMode === "s" ? initCropBox.h + dy : initCropBox.h - dy;
                        let w = h * ratio;
                        if (w > ow) {
                            w = ow;
                            h = w / ratio;
                        }
                        newW = Math.max(MIN_CROP_SIZE, Math.round(w));
                        newH = Math.max(MIN_CROP_SIZE, Math.round(h));
                        if (dragMode === "n") {
                            newY = initCropBox.y + initCropBox.h - newH;
                        }
                        // Symmetrically center horizontally
                        const centerX = initCropBox.x + initCropBox.w / 2;
                        newX = Math.max(0, Math.min(Math.round(centerX - newW / 2), ow - newW));
                        break;
                    }
                }
            }

            cropBox.x = newX;
            cropBox.y = newY;
            cropBox.w = newW;
            cropBox.h = newH;
            clampCropBoxToBounds(ow, oh);
            updateCropVisuals();
        }

        function onPointerUp() {
            if (!isDragging) return;
            isDragging = false;
            dragMode = null;
            if (cropBoxEl) cropBoxEl.classList.remove("is-active");
            document.body.style.userSelect = "";

            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerUp);
        }

        if (cropBoxEl) {
            cropBoxEl.addEventListener("pointerdown", onPointerDown);
        }

        // ----------------------------------------
        // Ratio Chips & Custom Ratio Controls
        // ----------------------------------------
        cropRatioChips.forEach(function (chip) {
            chip.addEventListener("click", function () {
                cropRatioChips.forEach(function (c) {
                    c.classList.remove("active");
                    c.setAttribute("aria-selected", "false");
                });
                chip.classList.add("active");
                chip.setAttribute("aria-selected", "true");

                const r = chip.getAttribute("data-ratio");
                cropRatioMode = r;

                if (r === "custom") {
                    if (cropCustomRatioRow) cropCustomRatioRow.style.display = "flex";
                    customRatioW = Math.max(1, parseInt(customRatioWInput.value, 10) || 5);
                    customRatioH = Math.max(1, parseInt(customRatioHInput.value, 10) || 4);
                    activeCropRatio = customRatioW / customRatioH;
                } else {
                    if (cropCustomRatioRow) cropCustomRatioRow.style.display = "none";
                    if (r === "free") activeCropRatio = null;
                    else if (r === "1:1") activeCropRatio = 1;
                    else if (r === "16:9") activeCropRatio = 16 / 9;
                    else if (r === "9:16") activeCropRatio = 9 / 16;
                    else if (r === "4:3") activeCropRatio = 4 / 3;
                    else if (r === "3:2") activeCropRatio = 3 / 2;
                }

                applyCurrentRatioToCropBox();
            });
        });

        if (applyCustomRatioBtn) {
            applyCustomRatioBtn.addEventListener("click", function () {
                const w = Math.max(1, parseInt(customRatioWInput.value, 10) || 1);
                const h = Math.max(1, parseInt(customRatioHInput.value, 10) || 1);
                customRatioW = w;
                customRatioH = h;
                activeCropRatio = w / h;
                applyCurrentRatioToCropBox();
            });
        }

        // ----------------------------------------
        // Crop Actions: Apply, Reset, Revert, Cancel
        // ----------------------------------------
        if (toggleCropBtn) {
            toggleCropBtn.addEventListener("click", function () {
                toggleCropMode();
            });
        }

        if (resetCropBtn) {
            resetCropBtn.addEventListener("click", function () {
                resetCropBoxToImage();
            });
        }

        if (cancelCropBtn) {
            cancelCropBtn.addEventListener("click", function () {
                toggleCropMode(false);
            });
        }

        if (applyCropBtn) {
            applyCropBtn.addEventListener("click", function () {
                if (!sourceImage) return;
                const dims = getOverlayDimensions();
                const scaleX = sourceImage.naturalWidth / dims.width;
                const scaleY = sourceImage.naturalHeight / dims.height;

                const srcX = Math.max(0, Math.round(cropBox.x * scaleX));
                const srcY = Math.max(0, Math.round(cropBox.y * scaleY));
                const srcW = Math.min(sourceImage.naturalWidth - srcX, Math.round(cropBox.w * scaleX));
                const srcH = Math.min(sourceImage.naturalHeight - srcY, Math.round(cropBox.h * scaleY));

                if (srcW < 2 || srcH < 2) return;

                // Offscreen canvas crop execution
                const cropCanvas = document.createElement("canvas");
                cropCanvas.width = srcW;
                cropCanvas.height = srcH;
                const cCtx = cropCanvas.getContext("2d");
                cCtx.imageSmoothingEnabled = true;
                cCtx.imageSmoothingQuality = "high";
                cCtx.drawImage(sourceImage, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

                const croppedImg = new Image();
                croppedImg.onload = function () {
                    sourceImage = croppedImg;
                    originalWidth = srcW;
                    originalHeight = srcH;
                    aspectRatio = srcW / srcH;

                    widthInput.value = srcW;
                    heightInput.value = srcH;

                    hasBeenCropped = true;
                    if (revertOriginalBtn) revertOriginalBtn.style.display = "inline-flex";
                    if (metaOrig) metaOrig.textContent = `${srcW} × ${srcH} px`;

                    toggleCropMode(false);
                    renderPreview();
                };
                croppedImg.src = cropCanvas.toDataURL("image/png");
            });
        }

        if (revertOriginalBtn) {
            revertOriginalBtn.addEventListener("click", function () {
                if (!masterSourceImage) return;
                sourceImage = masterSourceImage;
                originalWidth = masterSourceImage.naturalWidth || masterSourceImage.width;
                originalHeight = masterSourceImage.naturalHeight || masterSourceImage.height;
                aspectRatio = originalWidth / originalHeight;

                widthInput.value = originalWidth;
                heightInput.value = originalHeight;

                hasBeenCropped = false;
                revertOriginalBtn.style.display = "none";
                if (metaOrig) metaOrig.textContent = `${originalWidth} × ${originalHeight} px`;

                if (isCropMode) {
                    resetCropBoxToImage();
                }

                renderPreview();
            });
        }

        // Window resize repositioning
        window.addEventListener("resize", function () {
            if (isCropMode) {
                syncCropOverlayBounds();
                updateCropVisuals();
            }
        });

        // ----------------------------------------
        // Width / Height input handling
        // ----------------------------------------
        widthInput.addEventListener("input", function () {
            const w = parseInt(widthInput.value, 10);
            if (w > 0 && isLocked && aspectRatio > 0) {
                heightInput.value = Math.round(w / aspectRatio);
            }
            renderPreview();
        });

        heightInput.addEventListener("input", function () {
            const h = parseInt(heightInput.value, 10);
            if (h > 0 && isLocked && aspectRatio > 0) {
                widthInput.value = Math.round(h * aspectRatio);
            }
            renderPreview();
        });

        if (lockBtn) {
            lockBtn.addEventListener("click", function () {
                isLocked = !isLocked;
                lockBtn.classList.toggle("locked", isLocked);
                lockBtn.title = isLocked ? "Aspect Ratio Locked" : "Aspect Ratio Free";
                lockBtn.innerHTML = isLocked ? '<i class="fa-solid fa-link"></i>' : '<i class="fa-solid fa-link-slash"></i>';
            });
        }

        // ----------------------------------------
        // ----------------------------------------
        // Presets & Filter Category Controls + Real-Time Search
        // ----------------------------------------
        const categoryButtons = document.querySelectorAll(".preset-category-btn");
        const presetChips = document.querySelectorAll(".preset-chip");
        const presetGroupSelect = document.getElementById("presetGroupSelect");
        const presetSearchInput = document.getElementById("presetSearchInput");
        const presetSearchClear = document.getElementById("presetSearchClear");
        const presetSearchEmpty = document.getElementById("presetSearchEmpty");
        const presetSearchKeyword = document.getElementById("presetSearchKeyword");

        function filterPresets() {
            const query = (presetSearchInput ? presetSearchInput.value : "").trim().toLowerCase();
            const activeCategoryBtn = document.querySelector(".preset-category-btn.active");
            const activeCategory = activeCategoryBtn ? activeCategoryBtn.getAttribute("data-category") : "all";

            if (presetSearchClear) {
                presetSearchClear.hidden = !query;
            }

            let visibleCount = 0;

            presetChips.forEach(function (chip) {
                const chipCat = chip.getAttribute("data-category") || "";
                const chipText = (chip.textContent || "").toLowerCase();
                const chipW = chip.getAttribute("data-w") || "";
                const chipH = chip.getAttribute("data-h") || "";
                const dimCombined = `${chipW}x${chipH} ${chipW}×${chipH} ${chipW} ${chipH}`;

                const matchesCategory = (activeCategory === "all" || chipCat === activeCategory);
                const matchesQuery = !query ||
                    chipText.includes(query) ||
                    dimCombined.includes(query) ||
                    chipCat.includes(query);

                if (matchesQuery && matchesCategory) {
                    chip.classList.remove("is-hidden");
                    visibleCount += 1;
                } else {
                    chip.classList.add("is-hidden");
                }
            });

            // If user searched a keyword not found in current sub-category,
            // fall back to showing matches across all categories
            if (query && visibleCount === 0 && activeCategory !== "all") {
                presetChips.forEach(function (chip) {
                    const chipCat = chip.getAttribute("data-category") || "";
                    const chipText = (chip.textContent || "").toLowerCase();
                    const chipW = chip.getAttribute("data-w") || "";
                    const chipH = chip.getAttribute("data-h") || "";
                    const dimCombined = `${chipW}x${chipH} ${chipW}×${chipH} ${chipW} ${chipH}`;

                    const matchesQuery = chipText.includes(query) ||
                        dimCombined.includes(query) ||
                        chipCat.includes(query);

                    if (matchesQuery) {
                        chip.classList.remove("is-hidden");
                        visibleCount += 1;
                    }
                });
            }

            // Filter options in the grouped select dropdown
            if (presetGroupSelect) {
                Array.from(presetGroupSelect.options).forEach(function (opt) {
                    if (!opt.value) return;
                    const optText = (opt.textContent || "").toLowerCase();
                    const optMatches = !query || optText.includes(query) || opt.value.includes(query);
                    opt.hidden = !optMatches;
                });
            }

            // Show or hide empty search feedback
            if (presetSearchEmpty) {
                if (query && visibleCount === 0) {
                    presetSearchEmpty.hidden = false;
                    if (presetSearchKeyword) {
                        presetSearchKeyword.textContent = query;
                    }
                } else {
                    presetSearchEmpty.hidden = true;
                }
            }
        }

        if (presetSearchInput) {
            presetSearchInput.addEventListener("input", filterPresets);
            presetSearchInput.addEventListener("keydown", function (e) {
                if (e.key === "Escape") {
                    presetSearchInput.value = "";
                    filterPresets();
                    presetSearchInput.blur();
                }
            });
        }

        if (presetSearchClear) {
            presetSearchClear.addEventListener("click", function () {
                if (presetSearchInput) {
                    presetSearchInput.value = "";
                    filterPresets();
                    presetSearchInput.focus();
                }
            });
        }

        categoryButtons.forEach(function (btn) {
            btn.addEventListener("click", function () {
                categoryButtons.forEach(function (b) {
                    b.classList.remove("active");
                    b.setAttribute("aria-selected", "false");
                });
                btn.classList.add("active");
                btn.setAttribute("aria-selected", "true");

                filterPresets();
            });
        });

        // Grouped Dropdown Selection
        if (presetGroupSelect) {
            presetGroupSelect.addEventListener("change", function () {
                const val = presetGroupSelect.value;
                if (!val) return;

                const parts = val.split("x").map(function (n) { return parseInt(n, 10); });
                if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
                    widthInput.value = parts[0];
                    heightInput.value = parts[1];

                    // Find and activate matching category and chip
                    const selectedOption = presetGroupSelect.options[presetGroupSelect.selectedIndex];
                    const cat = selectedOption ? selectedOption.getAttribute("data-category") : null;

                    if (cat) {
                        const matchingCatBtn = document.querySelector(`.preset-category-btn[data-category="${cat}"]`);
                        if (matchingCatBtn) {
                            matchingCatBtn.click();
                        }
                    }

                    presetChips.forEach(function (chip) {
                        const cw = parseInt(chip.getAttribute("data-w"), 10);
                        const ch = parseInt(chip.getAttribute("data-h"), 10);
                        if (cw === parts[0] && ch === parts[1]) {
                            chip.classList.add("active");
                        } else {
                            chip.classList.remove("active");
                        }
                    });

                    renderPreview();
                }
            });
        }

        // Preset chips click
        presetChips.forEach(function (chip) {
            chip.addEventListener("click", function () {
                presetChips.forEach(function (c) { c.classList.remove("active"); });
                chip.classList.add("active");

                const w = parseInt(chip.getAttribute("data-w"), 10);
                const h = parseInt(chip.getAttribute("data-h"), 10);

                if (w && h) {
                    widthInput.value = w;
                    heightInput.value = h;

                    if (presetGroupSelect) {
                        presetGroupSelect.value = `${w}x${h}`;
                    }

                    renderPreview();
                }
            });
        });

        if (qualitySlider && qualityVal) {
            qualitySlider.addEventListener("input", function () {
                qualityVal.textContent = `${qualitySlider.value}%`;
                renderPreview();
            });
        }

        if (formatSelect) {
            formatSelect.addEventListener("change", renderPreview);
        }

        // ----------------------------------------
        // Download Resized Image
        // ----------------------------------------
        if (downloadBtn) {
            downloadBtn.addEventListener("click", function () {
                if (!sourceImage) return;

                const format = (formatSelect && formatSelect.value) || "image/png";
                const ext = format === "image/jpeg" ? "jpg" : format === "image/webp" ? "webp" : "png";
                const quality = (parseInt(qualitySlider.value, 10) || 90) / 100;

                canvas.toBlob(function (blob) {
                    if (!blob) return;
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `${fileName}-${canvas.width}x${canvas.height}.${ext}`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
                }, format, quality);
            });
        }

        function formatBytes(bytes) {
            if (bytes === 0) return "0 Bytes";
            const k = 1024;
            const sizes = ["Bytes", "KB", "MB"];
            const i = Math.floor(Math.log(bytes) / Math.pow(k, i));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
        }

        // Sample placeholder image for instant preview if empty
        const sampleImg = new Image();
        sampleImg.onload = function () {
            masterSourceImage = sampleImg;
            sourceImage = sampleImg;
            originalWidth = sampleImg.naturalWidth;
            originalHeight = sampleImg.naturalHeight;
            aspectRatio = originalWidth / originalHeight;
            widthInput.value = originalWidth;
            heightInput.value = originalHeight;
            if (metaOrig) metaOrig.textContent = `${originalWidth} × ${originalHeight} px`;
            if (downloadBtn) downloadBtn.disabled = false;
            renderPreview();
        };
        sampleImg.src = "../Images/aj image resizer.webp";
    }
})();
