import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { collection, getDocs, getFirestore, query, where } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB7bZTUWQ1T7p6a_Z5NQPAUPJJTQFDyWMpc",
  authDomain: "ajartivo.firebaseapp.com",
  projectId: "ajartivo",
  storageBucket: "ajartivo.firebasestorage.app",
  messagingSenderId: "185169143149",
  appId: "1:185169143149:web:f2aa9c9dd6e537461a664",
  measurementId: "G-RC3WLTENN"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const params = new URLSearchParams(window.location.search);
const name = params.get("name");

let currentImage = "";

loadProduct();
initProductInteractions();

async function loadProduct() {
  let design = null;

  if (name) {
    design = await findFirestoreDesign(name);

    if (!design) {
      design = await findJsonDesign(name);
    }
  }

  const normalizedDesign = normalizeDesign(design, name);
  renderProduct(normalizedDesign);
}

function renderProduct(design) {
  const title = design.title || design.name || "Premium Design";
  const type = design.type || design.category || "PSD";
  const description = design.description || `Premium ${type} design package with editable source files and production-ready layout support.`;
  const price = formatPrice(design.price, type);
  const previews = getPreviewImages(design);

  document.title = `${title} - AJartivo`;
  setText("productTitle", title);
  setText("productDescription", description);
  setText("productPrice", price.amount);
  setText("productPriceNote", price.note);
  setText("productTypeChip", type.toUpperCase());
  renderFeatures(design, type);
  renderThumbnails(previews);
  updateMainImage(previews[0], title);
  bindDownload(design.download);
}

function normalizeDesign(design, fallbackName) {
  if (design) return design;

  return {
    name: fallbackName || "Birthday Banner",
    title: fallbackName || "Birthday Banner",
    type: params.get("type") || "PSD",
    image: "images/trending1.jpg",
    preview1: "images/preview1.jpg",
    preview2: "images/preview2.jpg",
    preview3: "images/preview3.jpg",
    description: "A polished, editable design layout built for creators who need professional results fast on both digital and print workflows.",
    price: "499"
  };
}

function renderFeatures(design, type) {
  const featureList = document.getElementById("productFeatures");
  if (!featureList) return;

  const fileType = (type || "design").toUpperCase();
  const features = [
    `Editable ${fileType} source file ready for quick customization`,
    "Professional preview layout optimized for client presentation",
    "Clean asset structure for fast text, image, and color replacement",
    "Instant download workflow with mobile and desktop friendly browsing"
  ];

  featureList.innerHTML = features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("");
}

function renderThumbnails(images) {
  const row = document.getElementById("thumbnailRow");
  if (!row) return;

  row.innerHTML = images.map((image, index) => `
    <button class="thumbnail-btn${index === 0 ? " active" : ""}" type="button" data-preview="${escapeHtml(image)}" aria-label="Show preview ${index + 1}">
      <img src="${escapeHtml(image)}" alt="Thumbnail ${index + 1}">
    </button>
  `).join("");

  row.querySelectorAll(".thumbnail-btn").forEach((button) => {
    button.addEventListener("click", () => {
      updateMainImage(button.dataset.preview || "", document.getElementById("productTitle")?.textContent || "Product preview");
      row.querySelectorAll(".thumbnail-btn").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });
}

function updateMainImage(src, altText) {
  if (!src) return;

  currentImage = src;

  const mainImage = document.getElementById("mainImage");
  const lightboxImage = document.getElementById("lightboxImage");

  if (mainImage) {
    mainImage.src = src;
    mainImage.alt = altText;
  }

  if (lightboxImage) {
    lightboxImage.src = src;
    lightboxImage.alt = `${altText} zoomed preview`;
  }
}

function bindDownload(downloadUrl) {
  const downloadBtn = document.getElementById("downloadBtn");
  if (!downloadBtn) return;

  if (downloadUrl) {
    downloadBtn.disabled = false;
    downloadBtn.textContent = "Download ZIP";
    downloadBtn.onclick = () => {
      window.open(downloadUrl, "_blank", "noopener");
    };
    return;
  }

  downloadBtn.textContent = "Download Coming Soon";
  downloadBtn.disabled = true;
}

function initProductInteractions() {
  initPreviewZoom();
  initLightbox();
  syncPreviewHint();
  initCustomDesignButton();
  initShareButton();
}

function initPreviewZoom() {
  const previewBox = document.getElementById("previewTrigger");
  const image = document.getElementById("mainImage");

  if (!previewBox || !image) return;

  previewBox.addEventListener("mousemove", (event) => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches === false) return;

    const rect = previewBox.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    image.style.transformOrigin = `${x}% ${y}%`;
    image.style.transform = "scale(1.85)";
  });

  previewBox.addEventListener("mouseleave", () => {
    image.style.transformOrigin = "center center";
    image.style.transform = "scale(1)";
  });
}

/* ======= ONLY THIS FUNCTION CHANGED ======= */

function initLightbox() {
  const previewBox = document.getElementById("previewTrigger");
  const lightbox = document.getElementById("productLightbox");
  const closeButton = document.getElementById("lightboxClose");

  if (!previewBox || !lightbox || !closeButton) return;

  previewBox.addEventListener("click", () => {
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
  });

  closeButton.addEventListener("click", closeLightbox);

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !lightbox.hidden) {
      closeLightbox();
    }
  });

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.style.overflow = "";
  }
}

/* ======= END CHANGE ======= */

function syncPreviewHint() {
  const previewHint = document.querySelector(".preview-hint");
  const zoomPill = document.querySelector(".product-zoom-pill");
  const hasDesktopHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  if (previewHint) {
    previewHint.textContent = hasDesktopHover ? "Hover to zoom with precision" : "Tap to open full preview";
  }

  if (zoomPill) {
    zoomPill.textContent = hasDesktopHover ? "Hover zoom on desktop" : "Tap zoom on mobile";
  }
}

window.addEventListener("resize", syncPreviewHint);

function initCustomDesignButton() {
  const button = document.getElementById("customDesignBtn");
  if (!button) return;

  button.addEventListener("click", () => {
    alert("Custom design feature is added on the page. Workflow details will be connected next.");
  });
}

function initShareButton() {
  const button = document.getElementById("shareBtn");
  if (!button) return;

  button.addEventListener("click", async () => {
    const shareData = {
      title: document.getElementById("productTitle")?.textContent || "AJartivo Design",
      text: "Check out this premium AJartivo design.",
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(window.location.href);
      alert("Product link copied.");
    } catch (error) {
      console.error("Copy failed:", error);
      alert("Unable to share right now.");
    }
  });
}

function getPreviewImages(design) {
  const images = [design.preview1, design.preview2, design.preview3, design.image].filter(Boolean);
  return [...new Set(images)];
}

function formatPrice(rawPrice, type) {
  const defaultPrices = {
    PSD: 499,
    CDR: 599,
    AI: 699,
    EPS: 649
  };

  const numericPrice = Number(rawPrice);
  const fallbackPrice = defaultPrices[(type || "").toUpperCase()] || 549;
  const finalPrice = Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice : fallbackPrice;

  return {
    amount: `Rs. ${finalPrice}`,
    note: "One-time purchase with editable source files, preview assets, and smooth access on phone or PC."
  };
}

async function findFirestoreDesign(title) {
  try {
    const snapshot = await getDocs(query(collection(db, "designs"), where("title", "==", title)));
    if (!snapshot.empty) {
      return snapshot.docs[0].data();
    }

    const nameSnapshot = await getDocs(query(collection(db, "designs"), where("name", "==", title)));
    if (!nameSnapshot.empty) {
      return nameSnapshot.docs[0].data();
    }
  } catch (error) {
    console.error("Firestore product load failed:", error);
  }

  return null;
}

async function findJsonDesign(title) {
  try {
    const response = await fetch("designs.json");
    const data = await response.json();
    return data.find((item) => item.name === title) || null;
  } catch (error) {
    console.error("JSON product fallback failed:", error);
    return null;
  }
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}