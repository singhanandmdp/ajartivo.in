const fs = require("fs");
const path = require("path");

const {
    cleanText,
    config,
    ensureTrailingSeparator,
    isHttpUrl
} = require("../config");
const { getSupabaseAdminClient } = require("../supabaseClient");
const { createHttpError } = require("../utils/http");

const PRODUCT_TABLES = ["products", "designs"];

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

    const supabase = getSupabaseAdminClient();

    for (const tableName of PRODUCT_TABLES) {
        for (const candidate of candidates) {
            const { data, error } = await supabase
                .from(tableName)
                .select("*")
                .eq("id", candidate)
                .maybeSingle();

            if (error) {
                if (isMissingRelationError(error)) {
                    break;
                }

                throw error;
            }

            if (data) {
                return normalizeProductRecord(data, tableName);
            }
        }
    }

    return null;
}

function normalizeProductRecord(record, sourceTable) {
    const product = record || {};
    const price = Number(product.price || 0);
    const normalizedPrice = Number.isFinite(price) ? price : 0;
    const isFree = product.is_free === true || normalizedPrice <= 0 && product.is_premium !== true && product.is_paid !== true;
    const isPremium = product.is_premium === true || (isFree !== true && (product.is_paid === true || normalizedPrice > 0));
    const paid = isPremium === true || normalizedPrice > 0;

    return {
        ...product,
        id: cleanText(product.id),
        source_table: cleanText(sourceTable) || "products",
        title: cleanText(product.title || product.name) || "AJartivo Design",
        description: cleanText(product.description),
        price: normalizedPrice,
        is_free: isFree,
        is_premium: isPremium,
        is_paid: paid,
        download_link: cleanText(product.download_link || product.download || product.file_url),
        downloads: Number(product.downloads || 0) || 0,
        amount_in_paise: Math.round(Math.max(0, normalizedPrice) * 100)
    };
}

function isPaidProduct(product) {
    return Boolean(product && product.is_paid === true && product.amount_in_paise > 0) ||
        Number(product && product.amount_in_paise || 0) > 0;
}

async function incrementProductDownloads(productOrId) {
    const product = typeof productOrId === "object" && productOrId
        ? productOrId
        : await getProductById(productOrId);

    if (!product || !product.id) {
        return;
    }

    const supabase = getSupabaseAdminClient();
    const nextValue = Number(product.downloads || 0) + 1;
    const tableName = cleanText(product.source_table) || "products";

    const { error } = await supabase
        .from(tableName)
        .update({ downloads: nextValue })
        .eq("id", product.id);

    if (error) {
        throw error;
    }
}

async function sendProtectedFile(res, product) {
    const downloadLink = cleanText(product && product.download_link);
    if (!downloadLink) {
        throw createHttpError(404, "Download file is not configured for this product.");
    }

    const downloadName = buildDownloadFileName(product, downloadLink);
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);

    if (isHttpUrl(downloadLink)) {
        const remoteResponse = await fetch(downloadLink);
        if (!remoteResponse.ok) {
            throw createHttpError(502, "Remote file download failed.");
        }

        const contentType = cleanText(remoteResponse.headers.get("content-type")) || "application/octet-stream";
        const arrayBuffer = await remoteResponse.arrayBuffer();
        res.setHeader("Content-Type", contentType);
        res.status(200).send(Buffer.from(arrayBuffer));
        return;
    }

    const filePath = resolveLocalDownloadPath(downloadLink);
    if (!fs.existsSync(filePath)) {
        throw createHttpError(404, "Download file was not found on the server.");
    }

    await new Promise(function (resolve, reject) {
        res.download(filePath, downloadName, function (error) {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

function resolveLocalDownloadPath(downloadLink) {
    const rawPath = cleanText(downloadLink);
    const resolvedPath = path.isAbsolute(rawPath)
        ? path.resolve(rawPath)
        : path.resolve(config.projectRoot, rawPath.replace(/^[/\\]+/, ""));

    const normalizedDownloadsRoot = ensureTrailingSeparator(config.downloadsRoot);
    const normalizedResolvedPath = path.resolve(resolvedPath);

    if (
        normalizedResolvedPath !== config.downloadsRoot &&
        !normalizedResolvedPath.startsWith(normalizedDownloadsRoot)
    ) {
        throw createHttpError(400, "Only files inside the downloads directory can be served.");
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

function isMissingRelationError(error) {
    const code = cleanText(error && error.code).toUpperCase();
    const message = cleanText(error && (error.message || error.details)).toLowerCase();

    return code === "42P01" || (message.includes("relation") && message.includes("does not exist"));
}

module.exports = {
    buildDownloadFileName,
    getProductById,
    incrementProductDownloads,
    isPaidProduct,
    sendProtectedFile
};
