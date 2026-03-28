const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const cors = require("cors");
const express = require("express");
const Razorpay = require("razorpay");
const { createClient } = require("@supabase/supabase-js");

const app = express();

const PORT = Number(process.env.PORT || 5000);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DOWNLOADS_ROOT = path.resolve(PROJECT_ROOT, "downloads");
const ENV_FILE_PATH = path.resolve(__dirname, ".env");

loadEnvFile(ENV_FILE_PATH, { overrideExisting: true });

const FRONTEND_ORIGINS = buildFrontendOrigins(process.env.FRONTEND_ORIGINS);

const SUPABASE_URL = cleanText(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY);
const RAZORPAY_KEY_ID = cleanText(process.env.RAZORPAY_KEY_ID);
const RAZORPAY_KEY_SECRET = cleanText(process.env.RAZORPAY_KEY_SECRET);

const supabase = hasSupabaseConfig()
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
    : null;

const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
});

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || FRONTEND_ORIGINS.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error("Origin not allowed by CORS."));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    exposedHeaders: ["Content-Disposition"]
}));
app.use(express.json({ limit: "1mb" }));

app.get("/health", function (_req, res) {
    res.json({
        success: true,
        service: "AJartivo payments",
        port: PORT
    });
});

app.post("/test/create-order", requireRazorpayConfigured, async function (req, res) {
    try {
        const description = cleanText(req.body && req.body.description) || "AJartivo Razorpay Test Payment";
        const customerName = cleanText(req.body && req.body.customer_name);
        const customerEmail = cleanText(req.body && req.body.customer_email).toLowerCase();
        const amountInRupees = Number(req.body && req.body.amount);
        const amountInPaise = Math.round(amountInRupees * 100);

        if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) {
            return res.status(400).json({ error: "Valid amount is required." });
        }

        if (!Number.isFinite(amountInPaise) || amountInPaise < 100) {
            return res.status(400).json({ error: "Minimum test amount is Rs. 1." });
        }

        const order = await razorpay.orders.create({
            amount: amountInPaise,
            currency: "INR",
            receipt: buildTestReceipt(),
            notes: {
                mode: "standalone_test",
                customer_name: customerName.slice(0, 60),
                customer_email: customerEmail.slice(0, 80),
                description: description.slice(0, 100)
            }
        });

        return res.json({
            success: true,
            key: RAZORPAY_KEY_ID,
            order_id: cleanText(order && order.id),
            amount: Number(order && order.amount || 0),
            currency: cleanText(order && order.currency) || "INR",
            description: description,
            customer_name: customerName,
            customer_email: customerEmail
        });
    } catch (error) {
        return handleServerError(res, error, "Unable to create Razorpay test order.");
    }
});

app.post("/test/verify-payment", requireRazorpayConfigured, async function (req, res) {
    try {
        const orderId = cleanText(req.body && req.body.razorpay_order_id);
        const paymentId = cleanText(req.body && req.body.razorpay_payment_id);
        const signature = cleanText(req.body && req.body.razorpay_signature);

        if (!orderId || !paymentId || !signature) {
            return res.status(400).json({ error: "Missing required payment fields." });
        }

        const expectedSignature = crypto
            .createHmac("sha256", RAZORPAY_KEY_SECRET)
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        if (!safeCompare(expectedSignature, signature)) {
            return res.status(400).json({ error: "Invalid payment signature." });
        }

        const [razorpayOrder, razorpayPayment] = await Promise.all([
            razorpay.orders.fetch(orderId),
            razorpay.payments.fetch(paymentId)
        ]);

        if (!razorpayOrder || !razorpayPayment) {
            return res.status(400).json({ error: "Unable to verify payment details." });
        }

        if (cleanText(razorpayPayment.order_id) !== orderId) {
            return res.status(400).json({ error: "Payment order mismatch." });
        }

        const finalizedPayment = await capturePaymentIfNeeded(razorpayPayment, Number(razorpayOrder.amount || 0));
        if (!isSuccessfulPayment(finalizedPayment)) {
            return res.status(400).json({ error: "Payment is not successful." });
        }

        return res.json({
            success: true,
            test_mode: true,
            order_id: cleanText(razorpayOrder && razorpayOrder.id),
            payment_id: cleanText(finalizedPayment && finalizedPayment.id),
            amount: Number(finalizedPayment && finalizedPayment.amount || razorpayOrder && razorpayOrder.amount || 0),
            currency: cleanText(finalizedPayment && finalizedPayment.currency || razorpayOrder && razorpayOrder.currency || "INR"),
            status: cleanText(finalizedPayment && finalizedPayment.status),
            method: cleanText(finalizedPayment && finalizedPayment.method) || "Razorpay",
            email: cleanText(finalizedPayment && finalizedPayment.email),
            contact: cleanText(finalizedPayment && finalizedPayment.contact),
            captured_at: Number(finalizedPayment && finalizedPayment.created_at)
                ? new Date(Number(finalizedPayment.created_at) * 1000).toISOString()
                : "",
            notes: razorpayOrder && razorpayOrder.notes ? razorpayOrder.notes : {}
        });
    } catch (error) {
        return handleServerError(res, error, "Unable to verify Razorpay test payment.");
    }
});

function buildFrontendOrigins(rawOrigins) {
    const defaults = [
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "https://ajartivo.in",
        "https://www.ajartivo.in"
    ];

    const configuredOrigins = cleanText(rawOrigins)
        .split(",")
        .map(function (origin) {
            return cleanText(origin);
        })
        .filter(Boolean);

    return Array.from(new Set(defaults.concat(configuredOrigins)));
}

app.post("/create-order", requireConfiguredServer, requireAuthenticatedUser, async function (req, res) {
    try {
        const productId = cleanText(req.body && req.body.product_id);
        if (!productId) {
            return res.status(400).json({ error: "Product ID is required." });
        }

        const product = await getProductById(productId);
        if (!product) {
            return res.status(404).json({ error: "Product not found." });
        }

        if (!isPaidProduct(product)) {
            return res.status(400).json({ error: "This product does not require payment." });
        }

        console.log("[AJartivo Backend] /create-order request", {
            product_id: product.id,
            amount_in_paise: product.amount_in_paise,
            razorpay_key_id: maskCredential(RAZORPAY_KEY_ID),
            razorpay_secret_loaded: Boolean(RAZORPAY_KEY_SECRET),
            razorpay_secret_length: cleanText(RAZORPAY_KEY_SECRET).length
        });

        const existingPurchase = await findExistingPurchase(req.authUser, product.id);
        if (existingPurchase) {
            return res.json({
                success: true,
                alreadyPurchased: true,
                product_id: product.id,
                download_url: `/download/${encodeURIComponent(product.id)}`
            });
        }

        const order = await razorpay.orders.create({
            amount: product.amount_in_paise,
            currency: "INR",
            receipt: buildReceipt(product.id),
            notes: {
                product_id: String(product.id),
                user_id: req.authUser.id
            }
        });

        console.log("[AJartivo Backend] /create-order success", {
            order_id: cleanText(order && order.id),
            amount: Number(order && order.amount || 0),
            currency: cleanText(order && order.currency)
        });

        return res.json({
            success: true,
            alreadyPurchased: false,
            key: RAZORPAY_KEY_ID,
            order_id: order.id,
            amount: Number(order.amount || 0),
            currency: order.currency || "INR",
            product_id: product.id,
            product_title: product.title || "AJartivo Design"
        });
    } catch (error) {
        return handleServerError(res, error, "Unable to create Razorpay order.");
    }
});

app.post("/verify-payment", requireConfiguredServer, requireAuthenticatedUser, async function (req, res) {
    try {
        const productId = cleanText(req.body && req.body.product_id);
        const orderId = cleanText(req.body && req.body.razorpay_order_id);
        const paymentId = cleanText(req.body && req.body.razorpay_payment_id);
        const signature = cleanText(req.body && req.body.razorpay_signature);

        if (!productId || !orderId || !paymentId || !signature) {
            return res.status(400).json({ error: "Missing required payment fields." });
        }

        const product = await getProductById(productId);
        if (!product) {
            return res.status(404).json({ error: "Product not found." });
        }

        if (!isPaidProduct(product)) {
            return res.status(400).json({ error: "This product does not require payment." });
        }

        const expectedSignature = crypto
            .createHmac("sha256", RAZORPAY_KEY_SECRET)
            .update(`${orderId}|${paymentId}`)
            .digest("hex");

        if (!safeCompare(expectedSignature, signature)) {
            return res.status(400).json({ error: "Invalid payment signature." });
        }

        const [razorpayOrder, razorpayPayment] = await Promise.all([
            razorpay.orders.fetch(orderId),
            razorpay.payments.fetch(paymentId)
        ]);

        if (!razorpayOrder || !razorpayPayment) {
            return res.status(400).json({ error: "Unable to verify payment details." });
        }

        if (cleanText(razorpayPayment.order_id) !== orderId) {
            return res.status(400).json({ error: "Payment order mismatch." });
        }

        if (Number(razorpayOrder.amount || 0) !== product.amount_in_paise) {
            return res.status(400).json({ error: "Order amount mismatch." });
        }

        if (cleanText(razorpayOrder.notes && razorpayOrder.notes.product_id) !== String(product.id)) {
            return res.status(400).json({ error: "Product mismatch detected." });
        }

        if (cleanText(razorpayOrder.notes && razorpayOrder.notes.user_id) !== req.authUser.id) {
            return res.status(403).json({ error: "Authenticated user does not match this order." });
        }

        const finalizedPayment = await capturePaymentIfNeeded(razorpayPayment, product.amount_in_paise);
        if (!isSuccessfulPayment(finalizedPayment)) {
            return res.status(400).json({ error: "Payment is not successful." });
        }

        const existingPurchase = await findExistingPurchase(req.authUser, product.id);
        if (existingPurchase) {
            return res.json({
                success: true,
                alreadyPurchased: true,
                payment_id: existingPurchase.payment_id || finalizedPayment.id,
                order_id: existingPurchase.order_id || orderId,
                download_url: `/download/${encodeURIComponent(product.id)}`
            });
        }

        const purchaseRecord = await savePurchaseRecord({
            authUser: req.authUser,
            product: product,
            order: razorpayOrder,
            payment: finalizedPayment,
            signature: signature
        });

        await savePaymentRecord({
            authUser: req.authUser,
            product: product,
            order: razorpayOrder,
            payment: finalizedPayment
        });

        return res.json({
            success: true,
            alreadyPurchased: false,
            payment_id: cleanText(finalizedPayment.id),
            order_id: cleanText(razorpayOrder.id),
            amount: Number(finalizedPayment.amount || 0),
            purchase_id: cleanText(purchaseRecord && purchaseRecord.id),
            download_url: `/download/${encodeURIComponent(product.id)}`
        });
    } catch (error) {
        return handleServerError(res, error, "Unable to verify payment.");
    }
});

app.get("/download/:productId", requireConfiguredServer, requireAuthenticatedUser, async function (req, res) {
    try {
        const product = await getProductById(req.params.productId);
        if (!product) {
            return res.status(404).json({ error: "Product not found." });
        }

        if (isPaidProduct(product)) {
            const existingPurchase = await findExistingPurchase(req.authUser, product.id);
            if (!existingPurchase) {
                return res.status(403).json({ error: "Payment required before download." });
            }
        }

        await incrementProductDownloads(product.id);
        await sendProtectedFile(res, product);
    } catch (error) {
        return handleServerError(res, error, "Unable to prepare download.");
    }
});

async function requireAuthenticatedUser(req, res, next) {
    try {
        if (!supabase) {
            return res.status(500).json({ error: "Supabase is not configured on the backend." });
        }

        const token = extractBearerToken(req.headers.authorization);
        if (!token) {
            return res.status(401).json({ error: "Authentication required." });
        }

        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data || !data.user) {
            return res.status(401).json({ error: "Invalid or expired Supabase token." });
        }

        const user = data.user;
        req.authUser = {
            id: cleanText(user.id),
            email: cleanText(user.email).toLowerCase(),
            name: cleanText(
                user.user_metadata && (
                    user.user_metadata.full_name ||
                    user.user_metadata.name
                )
            )
        };

        next();
    } catch (error) {
        return handleServerError(res, error, "Authentication failed.");
    }
}

function requireConfiguredServer(_req, res, next) {
    const configError = getConfigurationError();
    if (configError) {
        return res.status(500).json({ error: configError });
    }

    next();
}

function requireRazorpayConfigured(_req, res, next) {
    const configError = getRazorpayConfigurationError();
    if (configError) {
        return res.status(500).json({ error: configError });
    }

    next();
}

async function getProductById(productId) {
    const normalizedId = cleanText(productId);
    if (!normalizedId) {
        return null;
    }

    const candidates = [normalizedId];
    const numericId = Number(normalizedId);
    if (Number.isInteger(numericId)) {
        candidates.push(numericId);
    }

    for (const candidate of candidates) {
        const { data, error } = await supabase
            .from("products")
            .select("*")
            .eq("id", candidate)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (data) {
            return normalizeProductRecord(data);
        }
    }

    return null;
}

function normalizeProductRecord(record) {
    const product = record || {};
    const price = Number(product.price || 0);
    const paid = product.is_paid === true || price > 0;

    return {
        ...product,
        id: cleanText(product.id),
        title: cleanText(product.title || product.name) || "AJartivo Design",
        description: cleanText(product.description),
        price: Number.isFinite(price) ? price : 0,
        is_paid: paid,
        download_link: cleanText(product.download_link),
        downloads: Number(product.downloads || 0) || 0,
        amount_in_paise: Math.round(Math.max(0, price) * 100)
    };
}

function isPaidProduct(product) {
    return Boolean(product && product.is_paid === true && product.amount_in_paise > 0) || Number(product && product.amount_in_paise || 0) > 0;
}

async function findExistingPurchase(authUser, productId) {
    const productKey = cleanText(productId);
    const userId = cleanText(authUser && authUser.id);
    if (!userId || !productKey) {
        return null;
    }

    const { data, error } = await supabase
        .from("purchases")
        .select("*")
        .eq("user_id", userId)
        .eq("design_id", productKey)
        .limit(1);

    if (error) {
        throw error;
    }

    return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function savePurchaseRecord(context) {
    const payload = buildPurchasePayload(context, false);

    try {
        return await insertPurchase(payload);
    } catch (error) {
        if (isDuplicateError(error)) {
            return await findExistingPurchase(context.authUser, context.product.id);
        }

        if (!isMissingColumnError(error)) {
            throw error;
        }
    }

    const fallbackPayload = buildPurchasePayload(context, true);
    try {
        return await insertPurchase(fallbackPayload);
    } catch (error) {
        if (isDuplicateError(error)) {
            return await findExistingPurchase(context.authUser, context.product.id);
        }

        throw error;
    }
}

function buildPurchasePayload(context, compatibleMode) {
    const payment = context.payment || {};
    const order = context.order || {};
    const createdAt = new Date().toISOString();
    const basePayload = {
        user_id: context.authUser.id,
        design_id: String(context.product.id),
        payment_id: cleanText(payment.id),
        amount: Number(payment.amount || context.product.amount_in_paise || 0)
    };

    if (compatibleMode) {
        return basePayload;
    }

    return {
        ...basePayload,
        order_id: cleanText(order.id),
        status: "paid",
        currency: cleanText(payment.currency || order.currency || "INR"),
        payment_method: cleanText(payment.method),
        razorpay_signature: cleanText(context.signature),
        paid_at: Number(payment.created_at)
            ? new Date(Number(payment.created_at) * 1000).toISOString()
            : createdAt,
        created_at: createdAt,
        updated_at: createdAt
    };
}

async function insertPurchase(payload) {
    const { data, error } = await supabase
        .from("purchases")
        .insert(payload)
        .select("*")
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function savePaymentRecord(context) {
    const payload = {
        payer: context.authUser.email || context.authUser.id,
        design_id: String(context.product.id),
        design_name: context.product.title,
        quantity: 1,
        amount: context.product.price,
        method: cleanText(context.payment && context.payment.method) || "Razorpay",
        status: "Paid",
        payment_id: cleanText(context.payment && context.payment.id),
        order_id: cleanText(context.order && context.order.id),
        created_at: new Date().toISOString()
    };

    const { error } = await supabase.from("payments").insert(payload);
    if (error) {
        return;
    }
}

async function capturePaymentIfNeeded(payment, amountInPaise) {
    const status = cleanText(payment && payment.status).toLowerCase();
    if (status === "captured") {
        return payment;
    }

    if (status !== "authorized") {
        return payment;
    }

    return razorpay.payments.capture(cleanText(payment.id), Number(amountInPaise), cleanText(payment.currency || "INR"));
}

function isSuccessfulPayment(payment) {
    const status = cleanText(payment && payment.status).toLowerCase();
    return status === "captured" || status === "authorized";
}

async function incrementProductDownloads(productId) {
    const product = await getProductById(productId);
    if (!product) {
        return;
    }

    const nextValue = Number(product.downloads || 0) + 1;
    const updatePayload = {
        downloads: nextValue
    };

    try {
        updatePayload.updated_at = new Date().toISOString();
        const { error } = await supabase
            .from("products")
            .update(updatePayload)
            .eq("id", product.id);

        if (error && !isMissingColumnError(error)) {
            throw error;
        }

        if (!error) {
            return;
        }
    } catch (error) {
        if (!isMissingColumnError(error)) {
            throw error;
        }
    }

    const { error } = await supabase
        .from("products")
        .update({ downloads: nextValue })
        .eq("id", product.id);

    if (error) {
        throw error;
    }
}

async function sendProtectedFile(res, product) {
    const downloadLink = cleanText(product && product.download_link);
    if (!downloadLink) {
        res.status(404).json({ error: "Download file is not configured for this product." });
        return;
    }

    const downloadName = buildDownloadFileName(product, downloadLink);
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);

    if (isHttpUrl(downloadLink)) {
        const remoteResponse = await fetch(downloadLink);
        if (!remoteResponse.ok) {
            throw new Error("Remote file download failed.");
        }

        const contentType = cleanText(remoteResponse.headers.get("content-type")) || "application/octet-stream";
        const arrayBuffer = await remoteResponse.arrayBuffer();
        res.setHeader("Content-Type", contentType);
        res.status(200).send(Buffer.from(arrayBuffer));
        return;
    }

    const filePath = resolveLocalDownloadPath(downloadLink);
    if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "Download file was not found on the server." });
        return;
    }

    res.download(filePath, downloadName);
}

function resolveLocalDownloadPath(downloadLink) {
    const rawPath = cleanText(downloadLink);
    const resolvedPath = path.isAbsolute(rawPath)
        ? path.resolve(rawPath)
        : path.resolve(PROJECT_ROOT, rawPath.replace(/^[/\\]+/, ""));

    const normalizedDownloadsRoot = ensureTrailingSeparator(DOWNLOADS_ROOT);
    const normalizedResolvedPath = path.resolve(resolvedPath);

    if (
        normalizedResolvedPath !== DOWNLOADS_ROOT &&
        !normalizedResolvedPath.startsWith(normalizedDownloadsRoot)
    ) {
        throw new Error("Only files inside the downloads directory can be served.");
    }

    return normalizedResolvedPath;
}

function buildDownloadFileName(product, downloadLink) {
    const extension = path.extname(cleanText(downloadLink).split("?")[0].split("#")[0]) || "";
    const baseName = cleanText(product && product.title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "ajartivo-file";

    return `aj-${baseName}${extension.toLowerCase()}`;
}

function buildReceipt(productId) {
    const baseReceipt = `aj_${cleanText(productId)}_${Date.now()}`;
    return baseReceipt.slice(0, 40);
}

function buildTestReceipt() {
    return `aj_test_${Date.now()}`.slice(0, 40);
}

function extractBearerToken(headerValue) {
    const value = cleanText(headerValue);
    if (!value.toLowerCase().startsWith("bearer ")) {
        return "";
    }

    return cleanText(value.slice(7));
}

function safeCompare(expected, actual) {
    const left = Buffer.from(cleanText(expected), "utf8");
    const right = Buffer.from(cleanText(actual), "utf8");

    if (!left.length || left.length !== right.length) {
        return false;
    }

    return crypto.timingSafeEqual(left, right);
}

function isHttpUrl(value) {
    return /^https?:\/\//i.test(cleanText(value));
}

function isDuplicateError(error) {
    const code = cleanText(error && error.code).toUpperCase();
    const message = cleanText(error && (error.message || error.details)).toLowerCase();
    return code === "23505" || message.includes("duplicate");
}

function isMissingColumnError(error) {
    const code = cleanText(error && error.code).toUpperCase();
    const message = cleanText(error && (error.message || error.details)).toLowerCase();
    return (
        code === "42703" ||
        code === "PGRST204" ||
        message.includes("column") && message.includes("does not exist")
    );
}

function ensureTrailingSeparator(value) {
    return value.endsWith(path.sep) ? value : `${value}${path.sep}`;
}

function getConfigurationError() {
    return getSupabaseConfigurationError() || getRazorpayConfigurationError();
}

function hasSupabaseConfig() {
    return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabaseConfigurationError() {
    if (!SUPABASE_URL) {
        return "SUPABASE_URL is missing on the backend.";
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
        return "SUPABASE_SERVICE_ROLE_KEY is missing on the backend.";
    }

    return "";
}

function getRazorpayConfigurationError() {
    if (!RAZORPAY_KEY_ID) {
        return "RAZORPAY_KEY_ID is missing on the backend.";
    }

    if (!RAZORPAY_KEY_SECRET) {
        return "RAZORPAY_KEY_SECRET is missing on the backend.";
    }

    return "";
}

function loadEnvFile(filePath, options) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const overrideExisting = Boolean(
        options === true ||
        options && options.overrideExisting === true
    );

    const fileContents = fs.readFileSync(filePath, "utf8");
    fileContents
        .split(/\r?\n/)
        .forEach(function (line) {
            const trimmedLine = String(line || "").trim();
            if (!trimmedLine || trimmedLine.startsWith("#")) {
                return;
            }

            const separatorIndex = trimmedLine.indexOf("=");
            if (separatorIndex <= 0) {
                return;
            }

            const key = trimmedLine.slice(0, separatorIndex).trim();
            const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
            const normalizedValue = rawValue.replace(/^['"]|['"]$/g, "");

            if (overrideExisting || !process.env[key]) {
                process.env[key] = normalizedValue;
            }
        });
}

function maskCredential(value) {
    const normalized = cleanText(value);
    if (!normalized) {
        return "(missing)";
    }

    if (normalized.length <= 8) {
        return `${normalized.slice(0, 2)}***`;
    }

    return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function handleServerError(res, error, fallbackMessage) {
    const message = cleanText(error && error.message) || fallbackMessage || "Server request failed.";
    const status = Number(error && error.statusCode || error && error.status) || 500;
    console.error("[AJartivo Backend]", {
        message: message,
        statusCode: Number(error && error.statusCode || 0) || null,
        errorCode: cleanText(
            error && (
                error.code ||
                error.error && error.error.code
            )
        ),
        errorDescription: cleanText(
            error && (
                error.description ||
                error.error && error.error.description
            )
        ),
        errorSource: cleanText(
            error && (
                error.source ||
                error.error && error.error.source
            )
        ),
        errorStep: cleanText(
            error && (
                error.step ||
                error.error && error.error.step
            )
        ),
        errorReason: cleanText(
            error && (
                error.reason ||
                error.error && error.error.reason
            )
        ),
        rawErrorPayload: error && error.error ? error.error : null,
        razorpayKeyId: maskCredential(RAZORPAY_KEY_ID),
        razorpaySecretLoaded: Boolean(RAZORPAY_KEY_SECRET),
        razorpaySecretLength: cleanText(RAZORPAY_KEY_SECRET).length,
        stack: cleanText(error && error.stack),
        details: error
    });
    return res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
}

function cleanText(value) {
    return String(value || "").trim();
}

app.listen(PORT, function () {
    console.log(`[AJartivo Backend] running on http://localhost:${PORT}`);
    console.log("[AJartivo Backend] Razorpay config", {
        razorpayKeyId: maskCredential(RAZORPAY_KEY_ID),
        razorpaySecretLoaded: Boolean(RAZORPAY_KEY_SECRET),
        razorpaySecretLength: cleanText(RAZORPAY_KEY_SECRET).length
    });
});
