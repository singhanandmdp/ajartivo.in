import { supabase as client } from "./supabase-auth.js";

window.AdminData = {
  connected: true,
  getDesigns: getDesigns,
  addDesign: addDesign,
  updateDesign: updateDesign,
  deleteDesign: deleteDesign,
  incrementDesignDownloads: incrementDesignDownloads,
  getPayments: getPayments,
  addPayment: addPayment,
  getUsers: getUsers,
  addUser: addUser,
  deleteUser: deleteUser
};

async function getDesigns() {
  const { data, error } = await client.from("products").select("*");
  if (error) throw toReadableError(error);
  return (Array.isArray(data) ? data : []).map(normalizeDesign).sort(sortByCreatedAtDesc);
}

async function addDesign(payload) {
  await requireAuthenticatedUser();

  const normalized = normalizeDesign(payload);
  const fullRecord = buildProductInsertRecord(normalized, false);

  try {
    const inserted = await insertProductRecord(fullRecord);
    return normalizeDesign(inserted);
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw toReadableError(error);
    }
  }

  console.warn("Retrying product insert with compatible schema payload.");
  const fallbackRecord = buildProductInsertRecord(normalized, true);
  const inserted = await insertProductRecord(fallbackRecord);
  return normalizeDesign(inserted);
}

async function updateDesign(id, payload) {
  await requireAuthenticatedUser();

  const normalized = normalizeDesign(payload);
  const fullRecord = buildProductUpdateRecord(normalized, false);

  try {
    const updated = await updateProductRecord(id, fullRecord);
    return normalizeDesign(updated);
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw toReadableError(error);
    }
  }

  console.warn("Retrying product update with compatible schema payload.");
  const fallbackRecord = buildProductUpdateRecord(normalized, true);
  const updated = await updateProductRecord(id, fallbackRecord);
  return normalizeDesign(updated);
}

async function deleteDesign(id) {
  await requireAuthenticatedUser();
  const { error } = await client.from("products").delete().eq("id", id);
  if (error) throw toReadableError(error);
}

async function incrementDesignDownloads(id, quantity) {
  const { data, error } = await client.from("products").select("downloads").eq("id", id).single();
  if (error) throw toReadableError(error);

  const nextCount = Number(data && data.downloads || 0) + Math.max(1, Number(quantity || 1));
  const payload = {
    downloads: nextCount
  };

  try {
    payload.updated_at = new Date().toISOString();
    const { error: updateError } = await client.from("products").update(payload).eq("id", id);
    if (updateError) throw updateError;
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw toReadableError(error);
    }

    const { error: fallbackError } = await client
      .from("products")
      .update({ downloads: nextCount })
      .eq("id", id);

    if (fallbackError) throw toReadableError(fallbackError);
  }
}

async function getPayments() {
  const { data, error } = await client.from("payments").select("*");
  if (error) throw toReadableError(error);
  return (Array.isArray(data) ? data : []).map(normalizePayment).sort(sortByCreatedAtDesc);
}

async function addPayment(payload) {
  await requireAuthenticatedUser();

  const { data, error } = await client
    .from("payments")
    .insert(mapPaymentForInsert(payload))
    .select("*")
    .single();

  if (error) throw toReadableError(error);
  return normalizePayment(data);
}

async function getUsers() {
  const { data, error } = await client.from("users").select("*");
  if (error) throw toReadableError(error);
  return (Array.isArray(data) ? data : []).map(normalizeUser).sort(sortByCreatedAtDesc);
}

async function addUser(payload) {
  await requireAuthenticatedUser();

  const record = {
    id: crypto.randomUUID(),
    name: cleanText(payload && payload.name),
    email: cleanText(payload && payload.email).toLowerCase(),
    role: cleanText(payload && payload.role),
    status: cleanText(payload && payload.status) || "Active",
    created_at: new Date().toISOString()
  };

  const { data, error } = await client.from("users").insert(record).select("*").single();
  if (error) throw toReadableError(error);
  return normalizeUser(data);
}

async function deleteUser(id) {
  await requireAuthenticatedUser();
  const { error } = await client.from("users").delete().eq("id", id);
  if (error) throw toReadableError(error);
}

async function insertProductRecord(record) {
  const { data, error } = await client.from("products").insert(record).select("*").single();
  if (error) throw error;
  return data;
}

async function updateProductRecord(id, record) {
  const { data, error } = await client
    .from("products")
    .update(record)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function requireAuthenticatedUser() {
  const { data, error } = await client.auth.getUser();
  if (error) throw toReadableError(error);
  if (!data || !data.user) {
    throw new Error("Admin session expired. Please log in again.");
  }
  return data.user;
}

function normalizeDesign(record) {
  const item = record || {};
  const extraImages = Array.isArray(item.extra_images)
    ? item.extra_images
    : Array.isArray(item.extraImages)
    ? item.extraImages
    : Array.isArray(item.gallery)
    ? item.gallery
    : [];

  return {
    ...item,
    id: String(item.id || "").trim(),
    name: cleanText(item.name || item.title) || "Untitled Design",
    title: cleanText(item.title || item.name) || "Untitled Design",
    category: cleanText(item.category).toUpperCase() || "OTHER",
    paymentMode: resolvePaymentMode(item),
    price: Number(item.price || item.Price || 0),
    Price: Number(item.Price || item.price || 0),
    description: cleanText(item.description),
    previewUrl: cleanText(item.previewUrl || item.preview_url || item.image),
    image: cleanText(item.image || item.previewUrl || item.preview_url),
    downloadUrl: cleanText(item.downloadUrl || item.download_link || item.download),
    download: cleanText(item.download || item.downloadUrl || item.download_link),
    download_link: cleanText(item.download_link || item.downloadUrl || item.download),
    extraImages: extraImages.filter(Boolean),
    gallery: extraImages.filter(Boolean),
    downloadCount: Number(item.downloadCount || item.downloads || 0),
    downloads: Number(item.downloads || item.downloadCount || 0),
    createdAt: cleanText(item.createdAt || item.created_at) || new Date().toISOString(),
    created_at: cleanText(item.created_at || item.createdAt) || new Date().toISOString()
  };
}

function buildProductInsertRecord(payload, compatibleMode) {
  const normalized = normalizeDesign(payload);
  const timestamp = new Date().toISOString();
  const baseRecord = buildBaseProductRecord(normalized);

  if (compatibleMode) {
    return {
      ...baseRecord,
      created_at: timestamp
    };
  }

  return {
    ...baseRecord,
    name: normalized.name,
    payment_mode: normalized.paymentMode,
    preview_url: normalized.previewUrl,
    extra_images: normalized.extraImages,
    created_at: timestamp,
    updated_at: timestamp
  };
}

function buildProductUpdateRecord(payload, compatibleMode) {
  const normalized = normalizeDesign(payload);
  const baseRecord = buildBaseProductRecord(normalized);

  if (compatibleMode) {
    return baseRecord;
  }

  return {
    ...baseRecord,
    name: normalized.name,
    payment_mode: normalized.paymentMode,
    preview_url: normalized.previewUrl,
    extra_images: normalized.extraImages,
    updated_at: new Date().toISOString()
  };
}

function buildBaseProductRecord(normalized) {
  return {
    title: normalized.title,
    category: normalized.category,
    price: normalized.price,
    is_paid: normalized.paymentMode === "paid",
    description: normalized.description,
    image: normalized.previewUrl,
    download_link: normalized.downloadUrl,
    downloads: Number(normalized.downloadCount || 0)
  };
}

function normalizePayment(record) {
  const item = record || {};
  const rawStatus = cleanText(item.status).toLowerCase();
  return {
    ...item,
    id: String(item.id || "").trim(),
    payer: cleanText(item.payer),
    designId: cleanText(item.designId || item.design_id),
    designName: cleanText(item.designName || item.design_name) || "Manual",
    quantity: Math.max(1, Number(item.quantity || 1)),
    amount: Number(item.amount || 0),
    method: cleanText(item.method) || "UPI",
    status: rawStatus === "paid" ? "Paid" : rawStatus === "failed" ? "Failed" : "Pending",
    createdAt: cleanText(item.createdAt || item.created_at) || new Date().toISOString()
  };
}

function mapPaymentForInsert(payload) {
  const item = normalizePayment(payload);
  return {
    payer: item.payer,
    design_id: item.designId,
    design_name: item.designName,
    quantity: item.quantity,
    amount: item.amount,
    method: item.method,
    status: item.status,
    created_at: new Date().toISOString()
  };
}

function normalizeUser(record) {
  const item = record || {};
  return {
    ...item,
    id: String(item.id || "").trim(),
    name: cleanText(item.name) || "Admin User",
    email: cleanText(item.email).toLowerCase(),
    role: cleanText(item.role) || "viewer",
    status: cleanText(item.status) || "Active",
    createdAt: cleanText(item.createdAt || item.created_at) || new Date().toISOString()
  };
}

function resolvePaymentMode(item) {
  const mode = cleanText(item.paymentMode || item.payment_mode).toLowerCase();
  if (mode === "free") return "free";
  if (mode === "paid") return "paid";
  return Number(item.price || item.Price || 0) > 0 || item.is_paid === true ? "paid" : "free";
}

function sortByCreatedAtDesc(a, b) {
  return getCreatedAtMs(b) - getCreatedAtMs(a);
}

function getCreatedAtMs(item) {
  const value = cleanText(item && (item.createdAt || item.created_at));
  const date = new Date(value || 0);
  const millis = date.getTime();
  return Number.isFinite(millis) ? millis : 0;
}

function cleanText(value) {
  return String(value || "").trim();
}

function isMissingColumnError(error) {
  const message = getErrorMessage(error);
  const code = String(error && error.code || "").trim().toUpperCase();
  return (
    code === "PGRST204" ||
    code === "42703" ||
    message.includes("column") && message.includes("does not exist") ||
    message.includes("could not find the") && message.includes("column")
  );
}

function toReadableError(error) {
  const message = getErrorMessage(error);
  const code = String(error && error.code || "").trim().toUpperCase();

  if (!message) {
    return new Error("Supabase request failed.");
  }

  if (message.includes("jwt") && message.includes("expired")) {
    return new Error("Admin session expired. Please log in again.");
  }

  if (message.includes("row-level security") || code === "42501" || message.includes("permission denied")) {
    return new Error("Supabase permission denied. Please check the admin policy or login session.");
  }

  if (message.includes("failed to fetch") || message.includes("network")) {
    return new Error("Supabase connection failed. Please check the network and try again.");
  }

  return new Error(error && error.message ? error.message : "Supabase request failed.");
}

function getErrorMessage(error) {
  return String(error && (error.message || error.details || error.hint) || "").trim().toLowerCase();
}
