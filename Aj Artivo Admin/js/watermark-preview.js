(function () {
  const WATERMARK_SOURCE = "./images/watermark.png";
  const OUTPUT_TYPE = "image/png";

  const imageInput = document.getElementById("imageInput");
  const uploadButton = document.getElementById("uploadButton");
  const mergeCanvas = document.getElementById("mergeCanvas");
  const canvasPlaceholder = document.getElementById("canvasPlaceholder");
  const finalPreview = document.getElementById("finalPreview");
  const previewPlaceholder = document.getElementById("previewPlaceholder");
  const fileMeta = document.getElementById("fileMeta");
  const statusText = document.getElementById("statusText");

  if (!imageInput || !mergeCanvas || !finalPreview) {
    return;
  }

  const context = mergeCanvas.getContext("2d");
  let finalImageUrl = "";

  imageInput.addEventListener("change", handleFileSelection);
  uploadButton.addEventListener("click", function () {
    window.alert("Upload button is ready for backend integration.");
  });

  async function handleFileSelection(event) {
    const selectedFile = event.target.files && event.target.files[0];

    if (!selectedFile) {
      resetPreviewState();
      return;
    }

    if (!selectedFile.type.startsWith("image/")) {
      resetPreviewState();
      window.alert("Please select a valid image file.");
      return;
    }

    fileMeta.textContent = `${selectedFile.name} (${formatBytes(selectedFile.size)})`;
    statusText.textContent = "Merging watermark";
    uploadButton.disabled = true;

    try {
      const [baseImage, watermarkImage] = await Promise.all([
        loadImageFromFile(selectedFile),
        loadImageFromUrl(WATERMARK_SOURCE)
      ]);

      drawMergedPreview(baseImage, watermarkImage);
      const mergedImageDataUrl = mergeCanvas.toDataURL(OUTPUT_TYPE, 0.92);

      updateFinalPreview(mergedImageDataUrl);
      statusText.textContent = "Merged preview ready";
    } catch (error) {
      console.error("Watermark merge failed:", error);
      resetPreviewState();
      statusText.textContent = "Merge failed";
      window.alert("Could not generate the watermarked preview.");
    } finally {
      uploadButton.disabled = false;
    }
  }

  function drawMergedPreview(baseImage, watermarkImage) {
    mergeCanvas.width = baseImage.naturalWidth;
    mergeCanvas.height = baseImage.naturalHeight;

    context.clearRect(0, 0, mergeCanvas.width, mergeCanvas.height);
    context.globalAlpha = 1;
    context.drawImage(baseImage, 0, 0, mergeCanvas.width, mergeCanvas.height);

    const watermarkScale = calculateWatermarkScale(
      mergeCanvas.width,
      mergeCanvas.height,
      watermarkImage.naturalWidth,
      watermarkImage.naturalHeight
    );

    const watermarkWidth = Math.max(120, Math.round(watermarkImage.naturalWidth * watermarkScale));
    const watermarkHeight = Math.max(120, Math.round(watermarkImage.naturalHeight * watermarkScale));
    const watermarkX = Math.round((mergeCanvas.width - watermarkWidth) / 2);
    const watermarkY = Math.round((mergeCanvas.height - watermarkHeight) / 2);

    context.save();
    context.globalAlpha = 0.4;
    context.drawImage(watermarkImage, watermarkX, watermarkY, watermarkWidth, watermarkHeight);
    context.restore();

    mergeCanvas.hidden = false;
    canvasPlaceholder.hidden = true;
  }

  function calculateWatermarkScale(imageWidth, imageHeight, watermarkWidth, watermarkHeight) {
    const maxWatermarkWidth = imageWidth * 0.42;
    const maxWatermarkHeight = imageHeight * 0.28;
    const scaleByWidth = maxWatermarkWidth / watermarkWidth;
    const scaleByHeight = maxWatermarkHeight / watermarkHeight;
    return Math.min(scaleByWidth, scaleByHeight);
  }

  function updateFinalPreview(nextUrl) {
    if (finalImageUrl) {
      finalImageUrl = "";
    }

    finalPreview.src = nextUrl;
    finalPreview.hidden = false;
    previewPlaceholder.hidden = true;
  }

  function resetPreviewState() {
    mergeCanvas.hidden = true;
    canvasPlaceholder.hidden = false;
    finalPreview.hidden = true;
    finalPreview.removeAttribute("src");
    previewPlaceholder.hidden = false;
    context.clearRect(0, 0, mergeCanvas.width, mergeCanvas.height);
    statusText.textContent = "Waiting for image";
    fileMeta.textContent = "PNG, JPG, and WEBP files are supported.";
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();

      reader.onload = function () {
        loadImageFromUrl(reader.result).then(resolve).catch(reject);
      };

      reader.onerror = function () {
        reject(new Error("Could not read selected image."));
      };

      reader.readAsDataURL(file);
    });
  }

  function loadImageFromUrl(source) {
    return new Promise(function (resolve, reject) {
      const image = new Image();
      image.onload = function () {
        resolve(image);
      };
      image.onerror = function () {
        reject(new Error(`Could not load image: ${source}`));
      };
      image.src = source;
    });
  }

  function formatBytes(value) {
    const size = Number(value || 0);
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  }
})();
