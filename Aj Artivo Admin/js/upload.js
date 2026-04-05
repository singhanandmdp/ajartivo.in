import { supabase } from "./supabase-auth.js";

const LOCAL_BACKEND_BASE_URL = "http://localhost:5000";
const LIVE_BACKEND_BASE_URL = "https://ajartivo-in.onrender.com";
const MAX_DESIGN_FILE_MB = 50;
const MAX_PREVIEW_FILE_MB = 10;
const DESIGN_FILE_TYPES = [".png", ".jpg", ".jpeg", ".zip", ".psd", ".ai", ".cdr"];
const PREVIEW_FILE_TYPES = [".png", ".jpg", ".jpeg", ".webp"];
const DEFAULT_DESCRIPTION = "High-quality design file with clean and professional layout.\nEasy to use and suitable for personal, business, and print purposes.\n\nInstant download available after login.";
const WATERMARK_IMAGE_PATH = "./images/watermark.png";

let previewObjectUrl = "";
let uploadedPreviewAsset = null;
let mergedPreviewAsset = null;

document.addEventListener("DOMContentLoaded", function () {
  if (document.body.dataset.page !== "upload") {
    return;
  }

  const form = document.getElementById("designForm");
  const titleInput = document.getElementById("title");
  const priceInput = document.getElementById("price");
  const categoryInput = document.getElementById("category");
  const designFileInput = document.getElementById("designFile");
  const designUrlInput = document.getElementById("designUrl");
  const designUrlWrap = document.getElementById("designUrlWrap");
  const designUrlToggle = document.getElementById("designUrlToggle");
  const designDropzonePicker = document.getElementById("designDropzonePicker");
  const previewFileInput = document.getElementById("previewFile");
  const descriptionInput = document.getElementById("description");
  const tagsInput = document.getElementById("tags");
  const premiumInput = document.getElementById("isPremium");
  const formMessage = document.getElementById("formMessage");
  const submitButton = document.getElementById("submitButton");
  const uploadStatus = document.getElementById("uploadStatus");
  const backendState = document.getElementById("backendState");
  const uploadCount = document.getElementById("uploadCount");
  const designCards = document.getElementById("designCards");
  const designFileMeta = document.getElementById("designFileMeta");
  const previewFileMeta = document.getElementById("previewFileMeta");
  const previewPlaceholder = document.getElementById("previewPlaceholder");
  const previewImage = document.getElementById("previewImage");
  const summaryMode = document.getElementById("summaryMode");
  const summaryCategory = document.getElementById("summaryCategory");
  const summaryPremium = document.getElementById("summaryPremium");
  const summaryPrice = document.getElementById("summaryPrice");
  const summaryPreviewSource = document.getElementById("summaryPreviewSource");
  const formSectionTitle = document.getElementById("formSectionTitle");
  const formSectionNote = document.getElementById("formSectionNote");
  const cancelEditButton = document.getElementById("cancelEditButton");
  let activeEditDesign = null;

  form.addEventListener("submit", handleSubmit);
  designFileInput.addEventListener("change", handleDesignFileChange);
  previewFileInput.addEventListener("change", handlePreviewFileChange);
  premiumInput.addEventListener("change", updateSummary);
  priceInput.addEventListener("input", updateSummary);
  if (designUrlInput) {
    designUrlInput.addEventListener("input", updateSummary);
  }
  if (designUrlToggle) {
    designUrlToggle.addEventListener("click", toggleDesignUrlField);
  }
  if (cancelEditButton) {
    cancelEditButton.addEventListener("click", function () {
      clearEditMode();
    });
  }
  updateSummary();
  renderEmptyState("Loading recent uploads...");
  loadLatestDesigns();

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      const isEditing = Boolean(activeEditDesign && activeEditDesign.id);
      setBusy(true, isEditing ? "Updating..." : "Publishing...");
      setFormMessage(isEditing ? "Preparing update..." : "Preparing upload...", "warning");

      const payload = await buildPayload();
      const savedDesign = await saveDesignPayload(payload);

      setFormMessage(`${isEditing ? "Updated" : "Saved"} "${savedDesign.title}" successfully.`, "success");
      uploadStatus.textContent = isEditing ? "Updated" : "Published";
      backendState.textContent = isEditing ? "Update complete" : "Upload complete";
      resetForm();
      await loadLatestDesigns();
    } catch (error) {
      setFormMessage(getErrorMessage(error), "danger");
      uploadStatus.textContent = "Failed";
      backendState.textContent = "Error returned";
    } finally {
      setBusy(false, "Publish Design");
    }
  }

  async function saveDesignPayload(payload) {
    const adminStore = window.AdminData || { connected: false };
    const isEditing = Boolean(activeEditDesign && activeEditDesign.id);

    setFormMessage(isEditing ? "Saving design update to Supabase..." : "Saving design record to Supabase...", "warning");
    backendState.textContent = isEditing ? "Updating record" : "Saving record";

    if (adminStore.connected) {
      if (isEditing && typeof adminStore.updateDesign === "function") {
        return await adminStore.updateDesign(activeEditDesign.id, payload);
      }

      if (!isEditing && typeof adminStore.addDesign === "function") {
        return await adminStore.addDesign(payload);
      }
    }

    const result = await apiRequest("/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }, { auth: true });

    return result.design;
  }

  async function buildPayload() {
    const title = String(titleInput.value || "").trim();
    const designFile = designFileInput.files && designFileInput.files[0];
    const designUrlValue = cleanText(designUrlInput && designUrlInput.value);
    const previewFile = previewFileInput.files && previewFileInput.files[0];
    const descriptionValue = String(descriptionInput.value || "").trim();
    const tagsValue = String(tagsInput.value || "").trim();
    const price = normalizePrice(priceInput.value);

    if (!title) {
      throw new Error("Title is required.");
    }

    if (price < 0) {
      throw new Error("Price negative nahi ho sakta.");
    }

    if (!designFile && !designUrlValue && !(activeEditDesign && activeEditDesign.file_url)) {
      throw new Error("Please choose a design file or add a design file URL.");
    }

    let fileUrl = cleanText(activeEditDesign && (activeEditDesign.file_url || activeEditDesign.download_link));
    let category = cleanText(categoryInput && categoryInput.value) || cleanText(activeEditDesign && activeEditDesign.category) || "FILE";
    if (designUrlValue) {
      if (!isValidHttpUrl(designUrlValue)) {
        throw new Error("Design file URL must be a valid http or https link.");
      }
      fileUrl = designUrlValue;
      category = inferCategoryFromName(designUrlValue);
      if (categoryInput) {
        categoryInput.value = category;
      }
    } else if (designFile) {
      validateFile(designFile, DESIGN_FILE_TYPES, MAX_DESIGN_FILE_MB, "design file");
      setFormMessage("Uploading main design...", "warning");
      backendState.textContent = "Uploading design";

      const designUploadResult = await uploadBinaryFile(designFile, "design");
      fileUrl = String(designUploadResult.file_url || "").trim();
      category = String(designUploadResult.category || inferCategoryFromName(designFile.name)).trim();
      if (categoryInput) {
        categoryInput.value = category;
      }
    }

    let imageUrl = "";

    if (uploadedPreviewAsset && isValidHttpUrl(uploadedPreviewAsset.preview_url)) {
      imageUrl = String(uploadedPreviewAsset.preview_url || "").trim();
    } else if (previewFile) {
      validateFile(previewFile, PREVIEW_FILE_TYPES, MAX_PREVIEW_FILE_MB, "preview image");
      const preparedPreviewAsset = await ensureMergedPreviewAsset(previewFile);

      setFormMessage("Uploading merged preview image...", "warning");
      backendState.textContent = "Uploading preview";

      const previewUploadResult = await uploadBinaryFile(preparedPreviewAsset.file, "preview");
      imageUrl = String(previewUploadResult.file_url || "").trim();

      uploadedPreviewAsset = {
        preview_url: imageUrl,
        file_url: imageUrl,
        signature: preparedPreviewAsset.signature
      };
    } else if (!designFile && activeEditDesign && isValidHttpUrl(activeEditDesign.image_url)) {
      imageUrl = String(activeEditDesign.image_url || "").trim();
    } else if (activeEditDesign && isValidHttpUrl(activeEditDesign.image_url)) {
      imageUrl = String(activeEditDesign.image_url || "").trim();
    } else {
      throw new Error("Please upload a preview image or paste a preview image URL.");
    }

    const normalizedDescription = descriptionValue || DEFAULT_DESCRIPTION;
    const normalizedTags = parseTags(tagsValue, title);

    return {
      title: title,
      price: price,
      image_url: imageUrl,
      file_url: fileUrl,
      category: category,
      description: normalizedDescription,
      tags: normalizedTags,
      is_premium: premiumInput.checked === true
    };
  }

  async function loadLatestDesigns() {
    try {
      backendState.textContent = "Fetching latest uploads";

      let designs = [];
      const adminStore = window.AdminData || { connected: false };

      if (adminStore.connected && typeof adminStore.getDesigns === "function") {
        designs = await adminStore.getDesigns();
      } else {
        const result = await apiRequest("/designs?limit=8", {
          method: "GET"
        });
        designs = Array.isArray(result.designs) ? result.designs : [];
      }

      const latestDesigns = Array.isArray(designs)
        ? [...designs]
            .sort(function (a, b) {
              return new Date(b && b.created_at || 0).getTime() - new Date(a && a.created_at || 0).getTime();
            })
            .slice(0, 8)
        : [];

      uploadCount.textContent = `${latestDesigns.length} recent uploads`;
      backendState.textContent = "Supabase synced";
      renderDesignCards(latestDesigns);
    } catch (error) {
      backendState.textContent = "Could not fetch uploads";
      renderEmptyState(getErrorMessage(error));
    }
  }

  function renderDesignCards(designs) {
    if (!designs.length) {
      renderEmptyState("No designs uploaded yet.");
      return;
    }

    designCards.innerHTML = designs.map(function (design) {
      const title = escapeHtml(design.title || "Untitled Design");
      const image = escapeHtml(design.image_url || "");
      const fileUrl = escapeHtml(design.file_url || "#");
      const premiumClass = design.is_premium ? "premium-chip" : "free-chip";
      const premiumLabel = design.is_premium ? "Premium" : "Free";
      const category = escapeHtml(design.category || "FILE");
      const createdAt = escapeHtml(formatDate(design.created_at));
      const priceText = escapeHtml(formatPrice(design.price));
      const designPayload = escapeHtml(JSON.stringify({
        id: design.id,
        title: design.title || "",
        price: normalizePrice(design.price),
        image_url: design.image_url || "",
        file_url: design.file_url || design.download_link || "",
        category: design.category || "FILE",
        description: design.description || "",
        tags: Array.isArray(design.tags) ? design.tags : [],
        is_premium: design.is_premium === true
      }));

      return (
        `<article class="latest-card">` +
          (image
            ? `<img src="${image}" alt="${title}">`
            : `<div class="state-empty">No preview image</div>`) +
          `<div class="latest-card-body">` +
            `<div class="card-topline">` +
              `<span class="type-chip">${category}</span>` +
              `<span class="type-chip ${premiumClass}">${premiumLabel}</span>` +
            `</div>` +
            `<h3>${title}</h3>` +
            `<p class="card-meta">${createdAt}</p>` +
            `<p class="card-meta">${priceText}</p>` +
            `<div class="card-actions">` +
              `<a class="btn card-btn card-btn-open" href="${fileUrl}" target="_blank" rel="noreferrer">Open File</a>` +
              `<button type="button" class="btn card-btn card-btn-edit edit-design-btn" data-design="${designPayload}">Edit</button>` +
              (image
                ? `<a class="btn card-btn card-btn-preview" href="${image}" target="_blank" rel="noreferrer">Open Preview</a>`
                : "") +
              `<button type="button" class="btn card-btn card-btn-delete delete-design-btn" data-design-id="${escapeHtml(String(design.id || ""))}" data-design-title="${title}">Delete</button>` +
            `</div>` +
          `</div>` +
        `</article>`
      );
    }).join("");

    designCards.querySelectorAll(".edit-design-btn").forEach(function (button) {
      button.addEventListener("click", function () {
        const rawDesign = button.getAttribute("data-design") || "";
        if (!rawDesign) {
          return;
        }

        try {
          startEditMode(JSON.parse(rawDesign));
        } catch (_error) {
          setFormMessage("Could not load this design for editing.", "danger");
        }
      });
    });

    designCards.querySelectorAll(".delete-design-btn").forEach(function (button) {
      button.addEventListener("click", async function () {
        const designId = String(button.getAttribute("data-design-id") || "").trim();
        const designTitle = String(button.getAttribute("data-design-title") || "this design").trim();

        if (!designId) {
          setFormMessage("Could not find this design to delete.", "danger");
          return;
        }

        const confirmed = window.confirm(`Delete "${designTitle}" permanently?`);
        if (!confirmed) {
          return;
        }

        try {
          button.disabled = true;
          button.textContent = "Deleting...";
          backendState.textContent = "Deleting design";
          await deleteDesignRecord(designId);

          if (activeEditDesign && String(activeEditDesign.id) === designId) {
            clearEditMode();
          }

          setFormMessage(`Deleted "${designTitle}" successfully.`, "success");
          uploadStatus.textContent = "Deleted";
          await loadLatestDesigns();
        } catch (error) {
          setFormMessage(getErrorMessage(error), "danger");
          backendState.textContent = "Delete failed";
        } finally {
          button.disabled = false;
          button.textContent = "Delete";
        }
      });
    });
  }

  async function deleteDesignRecord(designId) {
    const adminStore = window.AdminData || { connected: false };

    if (adminStore.connected && typeof adminStore.deleteDesign === "function") {
      return await adminStore.deleteDesign(designId);
    }

    throw new Error("Delete design is not available right now.");
  }

  function renderEmptyState(message) {
    designCards.innerHTML = `<div class="state-empty">${escapeHtml(message)}</div>`;
  }

  function handleDesignFileChange() {
    const file = designFileInput.files && designFileInput.files[0];
    if (!file) {
      designFileMeta.textContent = "No file selected yet.";
      if (categoryInput) {
        categoryInput.value = activeEditDesign && activeEditDesign.category
          ? String(activeEditDesign.category || "").trim()
          : "";
      }
      updatePreviewPanel();
      updateSummary();
      return;
    }

    designFileMeta.textContent = `${file.name} • ${formatBytes(file.size)}`;
    if (designUrlInput) {
      designUrlInput.value = "";
    }
    if (designUrlWrap) {
      designUrlWrap.classList.add("is-hidden");
      designUrlWrap.style.display = "none";
    }
    if (designDropzonePicker) {
      designDropzonePicker.hidden = false;
    }
    if (designUrlToggle) {
      designUrlToggle.setAttribute("aria-expanded", "false");
    }
    if (categoryInput) {
      categoryInput.value = inferCategoryFromName(file.name);
    }
    updatePreviewPanel();
    updateSummary();
  }

  async function handlePreviewFileChange() {
    clearPreviewUploadState(false);
    const file = previewFileInput.files && previewFileInput.files[0];
    if (previewFileMeta) {
      previewFileMeta.textContent = file
        ? `${file.name} • ${formatBytes(file.size)}`
        : "Allowed: PNG, JPG, JPEG, WEBP";
    }
    await updatePreviewPanel();
  }

  function updateSummary() {
    const designFile = designFileInput.files && designFileInput.files[0];
    const selectedCategory = designFile
      ? inferCategoryFromName(designFile.name)
      : String(categoryInput && categoryInput.value || "").trim();
    const normalizedPrice = normalizePrice(priceInput.value);

    summaryCategory.textContent = selectedCategory || "Not selected";
    summaryPremium.textContent = premiumInput.checked ? "Premium" : "Free";
    summaryPrice.textContent = formatPrice(normalizedPrice);
    summaryMode.textContent = "Upload to R2";

    if (previewFileInput.files && previewFileInput.files[0]) {
      summaryPreviewSource.textContent = "Watermarked local preview";
    } else {
      summaryPreviewSource.textContent = "Waiting";
    }
  }

  async function updatePreviewPanel() {
    clearObjectUrl();
    const previewFile = previewFileInput.files && previewFileInput.files[0];

    if (!previewFile) {
      mergedPreviewAsset = null;
      previewImage.hidden = true;
      previewImage.removeAttribute("src");
      previewPlaceholder.hidden = false;
      updateSummary();
      return;
    }

    try {
      setFormMessage("Preview image merge ho raha hai...", "warning");
      const preparedPreviewAsset = await ensureMergedPreviewAsset(previewFile);
      previewObjectUrl = preparedPreviewAsset.previewUrl;
      previewImage.src = preparedPreviewAsset.previewUrl;
      previewImage.hidden = false;
      previewPlaceholder.hidden = true;
      setFormMessage("Merged preview ready. Submit par yahi image upload hogi.", "success");
    } catch (error) {
      mergedPreviewAsset = null;
      previewImage.hidden = true;
      previewImage.removeAttribute("src");
      previewPlaceholder.hidden = false;
      setFormMessage("Could not generate watermarked preview image.", "danger");
    }

    updateSummary();
  }

  async function uploadBinaryFile(file, uploadKind) {
    const response = await apiRequest("/upload", {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name),
        "X-File-Type": encodeURIComponent(file.type || "application/octet-stream"),
        "X-Upload-Kind": uploadKind
      },
      body: file
    }, { auth: true });

    if (!response.file_url) {
      throw new Error(`Upload completed but no file URL was returned for ${uploadKind}.`);
    }
    return response;
  }

  async function apiRequest(path, options, configOptions) {
    const requestOptions = {
      method: options && options.method ? options.method : "GET",
      headers: { ...(options && options.headers ? options.headers : {}) },
      body: options && typeof options.body !== "undefined" ? options.body : undefined
    };

    if (configOptions && configOptions.auth) {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Admin session expired. Please log in again.");
      }
      requestOptions.headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${resolveBackendBaseUrl()}${path}`, requestOptions);
    const payload = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      throw new Error(String(payload.error || `Request failed with status ${response.status}.`).trim());
    }

    return payload;
  }

  async function getAccessToken() {
    const result = await supabase.auth.getSession();
    if (result.error) {
      throw result.error;
    }

    return String(result.data && result.data.session && result.data.session.access_token || "").trim();
  }

  function setBusy(isBusy, label) {
    form.querySelectorAll("input, button, textarea").forEach(function (element) {
      element.disabled = isBusy;
    });

    submitButton.querySelector("span").textContent = isBusy
      ? label
      : activeEditDesign
      ? "Update Design"
      : "Publish Design";
  }

  function setFormMessage(message, type) {
    formMessage.hidden = !message;
    formMessage.textContent = message || "";
    formMessage.classList.remove("status-success", "status-warning", "status-danger");

    if (!message) {
      return;
    }

    if (type === "success") {
      formMessage.classList.add("status-success");
    } else if (type === "danger") {
      formMessage.classList.add("status-danger");
    } else {
      formMessage.classList.add("status-warning");
    }
  }

  function resetForm() {
    form.reset();
    designFileMeta.textContent = "No file selected yet.";
    if (previewFileMeta) {
      previewFileMeta.textContent = "Allowed: PNG, JPG, JPEG, WEBP";
    }
    if (categoryInput) {
      categoryInput.value = "";
    }
    if (designUrlWrap) {
      designUrlWrap.classList.add("is-hidden");
      designUrlWrap.style.display = "none";
    }
    if (designDropzonePicker) {
      designDropzonePicker.hidden = false;
    }
    if (designUrlToggle) {
      designUrlToggle.setAttribute("aria-expanded", "false");
    }
    clearPreviewUploadState();
    priceInput.value = "0";
    clearEditModeState();
    updatePreviewPanel();
    uploadStatus.textContent = "Ready";
  }

  function startEditMode(design) {
    activeEditDesign = design && design.id ? design : null;
    if (!activeEditDesign) {
      return;
    }

    form.reset();
    titleInput.value = String(activeEditDesign.title || "").trim();
    priceInput.value = String(normalizePrice(activeEditDesign.price));
    if (categoryInput) {
      categoryInput.value = String(activeEditDesign.category || "").trim();
    }
    descriptionInput.value = String(activeEditDesign.description || "").trim();
    tagsInput.value = Array.isArray(activeEditDesign.tags) ? activeEditDesign.tags.join(", ") : "";
    premiumInput.checked = activeEditDesign.is_premium === true;

    const imageUrl = String(activeEditDesign.image_url || "").trim();
    if (designUrlInput) {
      designUrlInput.value = "";
    }
    designFileMeta.textContent = "Upload a new file only if you want to replace the current design file.";
    if (previewFileMeta) {
      previewFileMeta.textContent = "Allowed: PNG, JPG, JPEG, WEBP";
    }
    if (imageUrl) {
      uploadedPreviewAsset = {
        preview_url: imageUrl,
        signature: ""
      };
    } else {
      clearPreviewUploadState();
    }

    applyEditModeUi();
    updatePreviewPanel();
    updateSummary();
    setFormMessage(`Editing "${activeEditDesign.title}".`, "warning");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearEditMode() {
    resetForm();
    setFormMessage("", "");
  }

  function clearEditModeState() {
    activeEditDesign = null;
    applyEditModeUi();
  }

  function applyEditModeUi() {
    const isEditing = Boolean(activeEditDesign && activeEditDesign.id);

    if (formSectionTitle) {
      formSectionTitle.textContent = isEditing ? "Edit Design Entry" : "New Design Entry";
    }

    if (formSectionNote) {
      formSectionNote.textContent = isEditing
        ? "Update any field and save changes to this design."
        : "Upload design file and preview image, then publish.";
    }

    if (cancelEditButton) {
      cancelEditButton.hidden = !isEditing;
      cancelEditButton.disabled = false;
    }

    submitButton.querySelector("span").textContent = isEditing ? "Update Design" : "Publish Design";
  }

  function clearPreviewUploadState(clearPreviewUrlInput) {
    uploadedPreviewAsset = null;
    mergedPreviewAsset = null;
  }

  function toggleDesignUrlField() {
    if (!designUrlWrap || !designUrlToggle) {
      return;
    }

    const willOpen = designUrlWrap.classList.contains("is-hidden");
    designUrlWrap.classList.toggle("is-hidden", !willOpen);
    designUrlWrap.style.display = willOpen ? "grid" : "none";
    if (designDropzonePicker) {
      designDropzonePicker.hidden = willOpen;
    }
    designUrlToggle.setAttribute("aria-expanded", willOpen ? "true" : "false");

    if (willOpen && designUrlInput) {
      designFileInput.value = "";
      designFileMeta.textContent = "No file selected yet.";
      designUrlInput.focus();
    }
  }

  window.toggleDesignUrlField = toggleDesignUrlField;
});

function validateFile(file, allowedExtensions, maxSizeMb, label) {
  const extension = readExtension(file && file.name);
  const maxBytes = maxSizeMb * 1024 * 1024;

  if (!file) {
    throw new Error(`Missing ${label}.`);
  }

  if (!allowedExtensions.includes(extension)) {
    throw new Error(`Invalid ${label} type. Allowed: ${allowedExtensions.join(", ").toUpperCase()}.`);
  }

  if (Number(file.size || 0) > maxBytes) {
    throw new Error(`${capitalize(label)} must be ${maxSizeMb} MB or smaller.`);
  }
}

function resolveBackendBaseUrl() {
  const metaTag = document.querySelector('meta[name="ajartivo-backend-url"]');
  const configuredUrl = String(window.AJARTIVO_BACKEND_URL || (metaTag && metaTag.content) || "").trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  const hostname = String(window.location && window.location.hostname || "").trim().toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return LOCAL_BACKEND_BASE_URL;
  }

  return LIVE_BACKEND_BASE_URL;
}

function inferCategoryFromName(value) {
  const extension = readExtension(value).replace(/^\./, "");
  return extension ? extension.toUpperCase() : "FILE";
}

function isPreviewableImage(value) {
  return [".png", ".jpg", ".jpeg", ".webp"].includes(readExtension(value));
}

function readExtension(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const match = normalized.match(/(\.[a-z0-9]+)(?:$|[?#])/i);
  return match ? match[1].toLowerCase() : "";
}

function isValidHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function createFileSignature(file) {
  if (!file) {
    return "";
  }

  return [
    String(file.name || "").trim(),
    Number(file.size || 0),
    Number(file.lastModified || 0)
  ].join("::");
}

function normalizePrice(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.round(parsed);
}

function formatPrice(value) {
  const amount = normalizePrice(value);
  if (amount <= 0) {
    return "Free";
  }

  return `Rs. ${amount}`;
}

function formatDate(value) {
  const app = window.AdminApp;
  if (app && typeof app.formatDate === "function") {
    return app.formatDate(value);
  }

  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function clearObjectUrl() {
  if (!previewObjectUrl) {
    return;
  }

  if (/^blob:/i.test(previewObjectUrl)) {
    URL.revokeObjectURL(previewObjectUrl);
  }
  previewObjectUrl = "";
}

function capitalize(value) {
  const text = String(value || "").trim();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getErrorMessage(error) {
  return String(error && error.message || "Something went wrong. Please try again.").trim();
}

function cleanText(value) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[<>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTags(value, fallbackTitle) {
  const tags = String(value || "")
    .split(",")
    .map(function (item) {
      return cleanText(item);
    })
    .filter(Boolean)
    .filter(function (item, index, list) {
      return list.indexOf(item) === index;
    });

  if (tags.length) {
    return tags;
  }

  const fallback = cleanText(fallbackTitle);
  return fallback ? [fallback] : [];
}

async function createWatermarkedPreviewUrl(file) {
  const asset = await createWatermarkedPreviewAsset(file);
  return asset.previewUrl;
}

async function ensureMergedPreviewAsset(file) {
  const nextSignature = createFileSignature(file);
  if (mergedPreviewAsset && mergedPreviewAsset.signature === nextSignature) {
    return mergedPreviewAsset;
  }

  const asset = await createWatermarkedPreviewAsset(file);
  mergedPreviewAsset = asset;
  return asset;
}

async function createWatermarkedPreviewAsset(file) {
  const [sourceImage, watermarkImage] = await Promise.all([
    loadImageFromFile(file),
    loadImageFromUrl(WATERMARK_IMAGE_PATH)
  ]);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = sourceImage.naturalWidth;
  canvas.height = sourceImage.naturalHeight;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);

  const watermarkScale = calculateWatermarkScale(
    canvas.width,
    canvas.height,
    watermarkImage.naturalWidth,
    watermarkImage.naturalHeight
  );

  const watermarkWidth = Math.max(120, Math.round(watermarkImage.naturalWidth * watermarkScale));
  const watermarkHeight = Math.max(120, Math.round(watermarkImage.naturalHeight * watermarkScale));
  const watermarkX = Math.round((canvas.width - watermarkWidth) / 2);
  const watermarkY = Math.round((canvas.height - watermarkHeight) / 2);

  context.save();
  context.globalAlpha = 0.26;
  context.drawImage(watermarkImage, watermarkX, watermarkY, watermarkWidth, watermarkHeight);
  context.restore();

  const blob = await canvasToBlob(canvas, "image/png", 0.92);
  const outputName = createMergedPreviewName(file && file.name);
  const mergedFile = new File([blob], outputName, {
    type: "image/png",
    lastModified: Date.now()
  });

  return {
    file: mergedFile,
    blob: blob,
    previewUrl: URL.createObjectURL(blob),
    signature: createFileSignature(file)
  };
}

function calculateWatermarkScale(imageWidth, imageHeight, watermarkWidth, watermarkHeight) {
  const scaleByWidth = imageWidth / watermarkWidth;
  const scaleByHeight = imageHeight / watermarkHeight;
  return Math.max(scaleByWidth, scaleByHeight);
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
      reject(new Error("Could not load image."));
    };
    image.src = source;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (!blob) {
        reject(new Error("Could not generate merged preview file."));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function createMergedPreviewName(fileName) {
  const normalizedName = String(fileName || "preview").trim();
  const baseName = normalizedName.replace(/\.[^./\\]+$/, "") || "preview";
  return `${baseName}-merged-preview.png`;
}
