const admin = require("firebase-admin");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const functions = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");

admin.initializeApp();
const db = admin.firestore();

const runtimeConfig = functions.config() || {};
const REGION = cleanString(process.env.FUNCTION_REGION || readConfig(runtimeConfig, ["app", "region"], "")) || "us-central1";
const DAILY_FREE_LIMIT_PER_USER = readNumberSetting(
  process.env.DAILY_FREE_LIMIT_PER_USER,
  readConfig(runtimeConfig, ["downloads", "free_limit_per_user"], 5),
  5
);
const DAILY_IP_LIMIT = readNumberSetting(
  process.env.DAILY_IP_LIMIT,
  readConfig(runtimeConfig, ["downloads", "free_ip_limit_per_day"], 5),
  5
);
const DOWNLOAD_URL_TTL_MS = readNumberSetting(
  process.env.DOWNLOAD_URL_TTL_MS,
  readConfig(runtimeConfig, ["downloads", "url_ttl_ms"], 2 * 60 * 1000),
  2 * 60 * 1000
);

const MAX_FAILED_ATTEMPTS = readNumberSetting(
  process.env.MAX_FAILED_ATTEMPTS,
  readConfig(runtimeConfig, ["security", "max_failed_attempts"], 5),
  5
);
const LOGIN_LOCK_MINUTES = readNumberSetting(
  process.env.LOGIN_LOCK_MINUTES,
  readConfig(runtimeConfig, ["security", "login_lock_minutes"], 15),
  15
);

const RAZORPAY_KEY_ID = cleanString(
  process.env.RAZORPAY_KEY_ID || readConfig(runtimeConfig, ["razorpay", "key_id"], "")
);
const RAZORPAY_KEY_SECRET = cleanString(
  process.env.RAZORPAY_KEY_SECRET || readConfig(runtimeConfig, ["razorpay", "key_secret"], "")
);
const RAZORPAY_CURRENCY = "INR";

const ADMIN_UID_WHITELIST = toSet(
  process.env.ADMIN_UID_WHITELIST || readConfig(runtimeConfig, ["admin", "uid_whitelist"], ""),
  false
);
const ADMIN_EMAIL_WHITELIST = toSet(
  process.env.ADMIN_EMAIL_WHITELIST || readConfig(runtimeConfig, ["admin", "email_whitelist"], ""),
  true
);

exports.preLoginCheck = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  const email = normalizeEmail(req.body && req.body.email);
  if (!email) {
    return json(res, 400, { error: "Valid email is required." });
  }

  const ip = readClientIp(req);
  const dateKey = dayKeyUTC();
  const key = hashKey(`${dateKey}|${email}|${ip}`);
  const ref = db.collection("loginRateLimits").doc(key);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : null;

  if (!data) {
    return json(res, 200, { allowed: true });
  }

  const now = Date.now();
  const lockUntil = Number(data.lockUntil || 0);
  if (lockUntil > now) {
    const retryAfterSeconds = Math.ceil((lockUntil - now) / 1000);
    return json(res, 200, { allowed: false, retryAfterSeconds: retryAfterSeconds });
  }

  return json(res, 200, { allowed: true });
});

exports.reportLoginAttempt = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  const email = normalizeEmail(req.body && req.body.email);
  const success = Boolean(req.body && req.body.success);
  if (!email) {
    return json(res, 400, { error: "Valid email is required." });
  }

  const ip = readClientIp(req);
  const dateKey = dayKeyUTC();
  const key = hashKey(`${dateKey}|${email}|${ip}`);
  const ref = db.collection("loginRateLimits").doc(key);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    let failedAttempts = Number(data.failedAttempts || 0);
    let lockUntil = Number(data.lockUntil || 0);

    if (success) {
      failedAttempts = 0;
      lockUntil = 0;
    } else {
      failedAttempts += 1;
      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        lockUntil = now + LOGIN_LOCK_MINUTES * 60 * 1000;
      }
    }

    tx.set(
      ref,
      {
        email: email,
        ip: ip,
        failedAttempts: failedAttempts,
        lockUntil: lockUntil,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        dateKey: dateKey
      },
      { merge: true }
    );
  });

  return json(res, 200, { ok: true });
});

exports.requestDownloadAccess = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  let decodedToken;
  try {
    decodedToken = await verifyBearerToken(req);
  } catch (error) {
    return json(res, 401, { error: "Unauthorized request." });
  }

  if (!decodedToken.email_verified) {
    return json(res, 403, { error: "Email verification required." });
  }

  const uid = decodedToken.uid;
  const email = normalizeEmail(decodedToken.email);
  const designId = cleanString(req.body && req.body.designId);
  const nonce = cleanString(req.body && req.body.nonce);
  const ip = readClientIp(req);
  const dateKey = dayKeyUTC();
  const now = Date.now();

  if (!designId || !nonce) {
    return json(res, 400, { error: "Invalid request payload." });
  }

  const designRef = db.collection("designs").doc(designId);
  const designSnap = await designRef.get();
  if (!designSnap.exists) {
    return json(res, 404, { error: "Design not found." });
  }

  const design = designSnap.data() || {};
  const filePath = resolveStoragePath(design);
  if (!filePath) {
    return json(res, 400, { error: "File is not configured for secure download." });
  }

  const premium = isPremiumDesign(design);
  const nonceRef = db.collection("downloadNonces").doc(`${uid}_${dateKey}_${designId}_${hashKey(nonce)}`);
  const userPurchaseRef = db.collection("userPurchases").doc(`${uid}_${designId}`);

  if (premium) {
    const purchaseSnap = await userPurchaseRef.get();
    if (!purchaseSnap.exists) {
      return json(res, 402, { error: "Payment required.", requiresPayment: true });
    }

    try {
      await db.runTransaction(async (tx) => {
        const nonceSnap = await tx.get(nonceRef);
        if (nonceSnap.exists) {
          throw new Error("Duplicate request detected.");
        }

        tx.set(nonceRef, {
          uid: uid,
          designId: designId,
          ip: ip,
          dateKey: dateKey,
          type: "premium",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAtMs: now + DOWNLOAD_URL_TTL_MS
        });

        tx.update(designRef, { downloads: admin.firestore.FieldValue.increment(1) });

        tx.set(db.collection("downloadEvents").doc(), {
          uid: uid,
          email: email,
          ip: ip,
          dateKey: dateKey,
          designId: designId,
          flow: "premium",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
    } catch (error) {
      return json(res, 429, { error: error.message || "Download blocked." });
    }

    try {
      const downloadUrl = await getSignedDownloadUrl(filePath);
      return json(res, 200, {
        downloadUrl: downloadUrl,
        expiresInSeconds: Math.floor(DOWNLOAD_URL_TTL_MS / 1000),
        premium: true
      });
    } catch (error) {
      console.error("Premium signed URL generation failed:", error);
      return json(res, 500, { error: "Failed to generate secure download URL." });
    }
  }

  const userDailyRef = db.collection("downloadDaily").doc(`${uid}_${dateKey}`);
  const ipDailyRef = db.collection("downloadIpDaily").doc(`${ip}_${dateKey}`);
  let shouldIncrementDesignDownloads = false;
  let userDailyCount = 0;

  try {
    await db.runTransaction(async (tx) => {
      const [userSnap, ipSnap, nonceSnap] = await Promise.all([
        tx.get(userDailyRef),
        tx.get(ipDailyRef),
        tx.get(nonceRef)
      ]);

      if (nonceSnap.exists) {
        throw new Error("Duplicate request detected.");
      }

      const userData = userSnap.exists ? userSnap.data() : {};
      const ipData = ipSnap.exists ? ipSnap.data() : {};

      const alreadyDownloadedToday = Boolean(userData.files && userData.files[designId]);
      const currentUserCount = Number(userData.count || 0);
      const currentIpCount = Number(ipData.count || 0);

      if (!alreadyDownloadedToday && currentUserCount >= DAILY_FREE_LIMIT_PER_USER) {
        throw new Error("Daily limit reached");
      }

      if (!alreadyDownloadedToday && currentIpCount >= DAILY_IP_LIMIT) {
        throw new Error("IP-based daily limit reached. Try again tomorrow.");
      }

      const nextUserCount = alreadyDownloadedToday ? currentUserCount : currentUserCount + 1;
      const nextIpCount = alreadyDownloadedToday ? currentIpCount : currentIpCount + 1;

      userDailyCount = nextUserCount;
      shouldIncrementDesignDownloads = !alreadyDownloadedToday;

      tx.set(
        userDailyRef,
        {
          uid: uid,
          email: email,
          ip: ip,
          dateKey: dateKey,
          count: nextUserCount,
          files: { [designId]: true },
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      tx.set(
        ipDailyRef,
        {
          ip: ip,
          dateKey: dateKey,
          count: nextIpCount,
          users: { [uid]: true },
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      tx.set(nonceRef, {
        uid: uid,
        designId: designId,
        ip: ip,
        dateKey: dateKey,
        type: "free",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAtMs: now + DOWNLOAD_URL_TTL_MS
      });

      tx.set(db.collection("downloadEvents").doc(), {
        uid: uid,
        email: email,
        ip: ip,
        dateKey: dateKey,
        designId: designId,
        flow: "free",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (shouldIncrementDesignDownloads) {
        tx.update(designRef, { downloads: admin.firestore.FieldValue.increment(1) });
      }
    });
  } catch (error) {
    const message = String(error && error.message ? error.message : "Download limit reached.");
    return json(res, 429, { error: message });
  }

  try {
    const downloadUrl = await getSignedDownloadUrl(filePath);
    return json(res, 200, {
      downloadUrl: downloadUrl,
      expiresInSeconds: Math.floor(DOWNLOAD_URL_TTL_MS / 1000),
      remainingDailyDownloads: Math.max(0, DAILY_FREE_LIMIT_PER_USER - userDailyCount),
      premium: false
    });
  } catch (error) {
    console.error("Free signed URL generation failed:", error);
    return json(res, 500, { error: "Failed to generate secure download URL." });
  }
});

exports.requestSecureDownload = exports.requestDownloadAccess;

exports.createOrder = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  const razorpay = getRazorpayClient();
  if (!razorpay) {
    return json(res, 500, { error: "Razorpay is not configured on server." });
  }

  let decodedToken;
  try {
    decodedToken = await verifyBearerToken(req);
  } catch (error) {
    return json(res, 401, { error: "Unauthorized request." });
  }

  const uid = decodedToken.uid;
  const email = normalizeEmail(decodedToken.email);
  const designId = cleanString(req.body && req.body.designId);
  const requestedAmount = Number(req.body && req.body.amount);
  if (!designId) {
    return json(res, 400, { error: "designId is required." });
  }

  const designSnap = await db.collection("designs").doc(designId).get();
  if (!designSnap.exists) {
    return json(res, 404, { error: "Design not found." });
  }

  const design = designSnap.data() || {};
  if (!isPremiumDesign(design)) {
    return json(res, 400, { error: "Order is only required for premium designs." });
  }

  const amountPaise = resolvePremiumAmountPaise(design);
  if (!amountPaise) {
    return json(res, 400, { error: "Invalid premium amount configured." });
  }

  if (Number.isFinite(requestedAmount) && requestedAmount > 0) {
    const requestedPaise = Math.round(requestedAmount * 100);
    if (requestedPaise !== amountPaise) {
      return json(res, 400, { error: "Amount mismatch." });
    }
  }

  const receipt = `aj_${uid.slice(0, 8)}_${Date.now()}`;
  try {
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: RAZORPAY_CURRENCY,
      receipt: receipt,
      notes: {
        uid: uid,
        designId: designId
      }
    });

    await db.collection("paymentOrders").doc(order.id).set({
      uid: uid,
      email: email,
      designId: designId,
      amount: Number(order.amount),
      currency: String(order.currency || RAZORPAY_CURRENCY),
      status: "created",
      receipt: receipt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ip: readClientIp(req)
    });

    return json(res, 200, {
      orderId: order.id,
      amount: Number(order.amount),
      currency: String(order.currency || RAZORPAY_CURRENCY),
      keyId: RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error("createOrder failed:", error);
    return json(res, 500, { error: "Unable to create order right now." });
  }
});

exports.verifyPayment = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  const razorpaySecret = getRazorpaySecret();
  if (!razorpaySecret) {
    return json(res, 500, { error: "Razorpay secret is missing on server." });
  }

  let decodedToken;
  try {
    decodedToken = await verifyBearerToken(req);
  } catch (error) {
    return json(res, 401, { error: "Unauthorized request." });
  }

  const uid = decodedToken.uid;
  const email = normalizeEmail(decodedToken.email);
  const orderId = cleanString(req.body && req.body.orderId);
  const paymentId = cleanString(req.body && req.body.paymentId);
  const signature = cleanString(req.body && req.body.signature);
  const requestedDesignId = cleanString(req.body && req.body.designId);

  if (!orderId || !paymentId || !signature) {
    return json(res, 400, { error: "Invalid payment payload." });
  }

  const orderRef = db.collection("paymentOrders").doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    return json(res, 404, { error: "Order not found." });
  }

  const orderData = orderSnap.data() || {};
  if (String(orderData.uid || "") !== uid) {
    return json(res, 403, { error: "Order does not belong to this user." });
  }

  const designId = String(orderData.designId || "");
  if (!designId || (requestedDesignId && requestedDesignId !== designId)) {
    return json(res, 400, { error: "Order/design mismatch." });
  }

  const expectedSignature = crypto
    .createHmac("sha256", razorpaySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  if (expectedSignature !== signature) {
    return json(res, 400, { error: "Payment signature verification failed." });
  }

  const designSnap = await db.collection("designs").doc(designId).get();
  if (!designSnap.exists) {
    return json(res, 404, { error: "Design not found." });
  }

  const design = designSnap.data() || {};
  const filePath = resolveStoragePath(design);
  if (!filePath) {
    return json(res, 400, { error: "File is not configured for secure download." });
  }

  const purchaseRef = db.collection("userPurchases").doc(`${uid}_${designId}`);

  await db.runTransaction(async (tx) => {
    tx.set(
      orderRef,
      {
        status: "paid",
        paymentId: paymentId,
        signature: signature,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    tx.set(
      purchaseRef,
      {
        uid: uid,
        email: email,
        designId: designId,
        orderId: orderId,
        paymentId: paymentId,
        amount: Number(orderData.amount || 0),
        currency: String(orderData.currency || RAZORPAY_CURRENCY),
        purchasedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    tx.set(db.collection("paymentEvents").doc(), {
      uid: uid,
      email: email,
      designId: designId,
      orderId: orderId,
      paymentId: paymentId,
      action: "verified",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  try {
    const downloadUrl = await getSignedDownloadUrl(filePath);
    return json(res, 200, {
      success: true,
      downloadUrl: downloadUrl,
      expiresInSeconds: Math.floor(DOWNLOAD_URL_TTL_MS / 1000)
    });
  } catch (error) {
    console.error("verifyPayment URL generation failed:", error);
    return json(res, 500, { error: "Payment verified but download link failed." });
  }
});

exports.adminGuardCheck = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  let decodedToken;
  try {
    decodedToken = await verifyBearerToken(req);
  } catch (error) {
    return json(res, 401, { allowed: false });
  }

  const uid = decodedToken.uid;
  const email = normalizeEmail(decodedToken.email);
  const hasAdminClaim = Boolean(decodedToken.admin === true || decodedToken.role === "admin");
  const inUidWhitelist = ADMIN_UID_WHITELIST.has(uid);
  const inEmailWhitelist = ADMIN_EMAIL_WHITELIST.has(email);

  const allowed = hasAdminClaim && inUidWhitelist && inEmailWhitelist;
  return json(res, 200, { allowed: allowed });
});

async function verifyBearerToken(req) {
  const authHeader = req.get("authorization") || req.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Missing bearer token.");
  }
  const idToken = authHeader.slice("Bearer ".length).trim();
  return admin.auth().verifyIdToken(idToken, true);
}

function isPremiumDesign(design) {
  const declared = cleanString(design.accessType || design.tier || design.plan).toUpperCase();
  if (declared === "PREMIUM") return true;
  if (declared === "FREE") return false;

  const price = Number(design.price || 0);
  return Number.isFinite(price) && price > 0;
}

function resolvePremiumAmountPaise(design) {
  const amount = Number(design.price || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function getRazorpaySecret() {
  return cleanString(RAZORPAY_KEY_SECRET);
}

function getRazorpayClient() {
  const secret = getRazorpaySecret();
  if (!secret || !RAZORPAY_KEY_ID) return null;

  return new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: secret
  });
}

function resolveStoragePath(design) {
  const directPath = cleanString(design.storagePath || design.downloadPath || "");
  if (directPath) {
    return directPath.replace(/^\/+/, "");
  }

  const legacy = cleanString(design.download || "");
  if (!legacy) return "";

  if (legacy.startsWith("gs://")) {
    const withoutScheme = legacy.replace(/^gs:\/\//, "");
    const slashIndex = withoutScheme.indexOf("/");
    if (slashIndex === -1) return "";
    return withoutScheme.slice(slashIndex + 1);
  }

  return "";
}

async function getSignedDownloadUrl(filePath) {
  const [downloadUrl] = await admin
    .storage()
    .bucket()
    .file(filePath)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + DOWNLOAD_URL_TTL_MS,
      responseDisposition: "attachment"
    });

  return downloadUrl;
}

function readClientIp(req) {
  const xff = req.get("x-forwarded-for");
  const ipFromHeader = xff ? xff.split(",")[0].trim() : "";
  const ip = ipFromHeader || req.ip || "0.0.0.0";
  return ip.slice(0, 64);
}

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  const email = cleanString(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function dayKeyUTC() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hashKey(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function toSet(csv, lowerCase) {
  return new Set(
    String(csv || "")
      .split(",")
      .map((item) => (lowerCase ? item.trim().toLowerCase() : item.trim()))
      .filter(Boolean)
  );
}

function readConfig(configRoot, pathParts, fallbackValue) {
  let current = configRoot;
  for (const part of pathParts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return fallbackValue;
    }
    current = current[part];
  }
  return current == null ? fallbackValue : current;
}

function readNumberSetting(primaryValue, secondaryValue, fallbackValue) {
  const primary = Number(primaryValue);
  if (Number.isFinite(primary) && primary > 0) return primary;

  const secondary = Number(secondaryValue);
  if (Number.isFinite(secondary) && secondary > 0) return secondary;

  return Number(fallbackValue);
}

function json(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}
