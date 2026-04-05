import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./js/firebase-config.js";

const CLOUDINARY_CLOUD_NAME = "dp6us2a5n".trim();
const CLOUDINARY_UPLOAD_PRESET = "ajartivo_upload".trim();
const CLOUDINARY_UPLOAD_URL =
  `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const imageFileInput = document.getElementById("imageFile");
const imageUrlInput = document.getElementById("imageUrl");
const uploadBtn = document.getElementById("uploadBtn");
const saveBtn = document.getElementById("saveBtn");
const uploadForm = document.getElementById("uploadForm");
const previewImage = document.getElementById("previewImage");
const previewPlaceholder = document.getElementById("previewPlaceholder");
const loadingIndicator = document.getElementById("loadingIndicator");
const messageBox = document.getElementById("messageBox");
const statusPill = document.getElementById("statusPill");

let uploadedImageUrl = "";

function setStatus(text) {
  statusPill.textContent = text;
}

function setLoading(isLoading) {
  loadingIndicator.hidden = !isLoading;
  uploadBtn.disabled = isLoading;
  imageFileInput.disabled = isLoading;
  saveBtn.disabled = isLoading || !uploadedImageUrl;
}

function showMessage(type, text) {
  messageBox.hidden = false;
  messageBox.dataset.state = type;
  messageBox.textContent = text;
}

function clearMessage() {
  messageBox.hidden = true;
  messageBox.textContent = "";
  delete messageBox.dataset.state;
}

function validateFile(file) {
  if (!file) {
    throw new Error("Please select an image file first.");
  }

  if (!file.type || !file.type.startsWith("image/")) {
    throw new Error("Only image files are allowed.");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`Image size must be ${MAX_FILE_SIZE_MB} MB or less.`);
  }
}

function updatePreview(imageUrl) {
  if (!imageUrl) {
    previewImage.hidden = true;
    previewImage.removeAttribute("src");
    previewPlaceholder.hidden = false;
    return;
  }

  previewImage.src = imageUrl;
  previewImage.hidden = false;
  previewPlaceholder.hidden = true;
}

function buildProductPayload(imageUrl) {
  return {
    imageUrl: imageUrl,
    createdAt: serverTimestamp()
    // Future ready:
    // title: "",
    // price: 0,
    // downloadLink: ""
  };
}

async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("cloud_name", CLOUDINARY_CLOUD_NAME);

  const response = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: "POST",
    body: formData
  });

  const result = await response.json();

  if (!response.ok || !result.secure_url) {
    const errorMessage =
      result?.error?.message || "Image upload failed. Please try again.";
    throw new Error(errorMessage);
  }

  return result.secure_url;
}

async function handleUpload() {
  clearMessage();

  try {
    const file = imageFileInput.files[0];
    validateFile(file);
    setLoading(true);

    const secureUrl = await uploadToCloudinary(file);
    uploadedImageUrl = secureUrl;
    imageUrlInput.value = secureUrl;
    updatePreview(secureUrl);
    saveBtn.disabled = false;
    setStatus("Uploaded");
    showMessage("success", "Image uploaded successfully. You can now save it to Firestore.");
  } catch (error) {
    uploadedImageUrl = "";
    imageUrlInput.value = "";
    updatePreview("");
    saveBtn.disabled = true;
    setStatus("Failed");
    showMessage("error", error.message || "Upload failed.");
  } finally {
    setLoading(false);
  }
}

async function handleSave(event) {
  event.preventDefault();
  clearMessage();

  if (!uploadedImageUrl) {
    showMessage("error", "Please upload an image before saving.");
    setStatus("Waiting");
    return;
  }

  try {
    saveBtn.disabled = true;
    uploadBtn.disabled = true;
    imageFileInput.disabled = true;
    setStatus("Saving...");

    await addDoc(collection(db, "designs"), buildProductPayload(uploadedImageUrl));

    showMessage("success", "Design saved to Firestore successfully.");
    setStatus("Saved");
    uploadForm.reset();
    uploadedImageUrl = "";
    imageUrlInput.value = "";
    updatePreview("");
  } catch (error) {
    saveBtn.disabled = false;
    showMessage("error", error.message || "Failed to save data in Firestore.");
    setStatus("Save Failed");
  } finally {
    uploadBtn.disabled = false;
    imageFileInput.disabled = false;
    saveBtn.disabled = !uploadedImageUrl;
  }
}

uploadBtn.addEventListener("click", handleUpload);
uploadForm.addEventListener("submit", handleSave);

imageFileInput.addEventListener("change", function () {
  clearMessage();
  uploadedImageUrl = "";
  imageUrlInput.value = "";
  saveBtn.disabled = true;
  updatePreview("");
  setStatus(this.files.length ? "File Selected" : "Ready");
});
