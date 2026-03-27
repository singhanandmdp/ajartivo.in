(function () {
    const SUPABASE_URL = "https://hlmyjnslyijgdrfuktun.supabase.co";
    const SUPABASE_PUBLIC_KEY = "sb_publishable_VZYzXaf0npSI8sdhgsIFjQ_1i-SMZY6";
    const SESSION_KEY = "ajartivo_session";
    const WISHLIST_KEY = "ajartivo_wishlist";
    const DOWNLOAD_HISTORY_KEY = "ajartivo_download_history";
    let productsChannel = null;

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
        console.error("Supabase CDN failed to load.");
        return;
    }

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });

    window.AjArtivoSupabase = {
        client: supabase,
        fetchProducts: fetchProducts,
        fetchProductById: fetchProductById,
        fetchRelatedProducts: fetchRelatedProducts,
        hasPurchasedDesign: hasPurchasedDesign,
        normalizeProduct: normalizeProduct,
        getSession: getSession,
        getAuthSession: getAuthSession,
        getAccessToken: getAccessToken,
        refreshSession: refreshSession,
        setSession: setSession,
        clearSession: clearSession,
        signIn: signIn,
        signUp: signUp,
        signOut: signOut,
        signInWithOAuth: signInWithOAuth,
        readList: readList,
        writeList: writeList,
        addWishlistItem: addWishlistItem,
        removeWishlistItem: removeWishlistItem,
        isWishlisted: isWishlisted,
        addDownloadHistoryItem: addDownloadHistoryItem,
        subscribeToProductChanges: subscribeToProductChanges
    };

    hydrateSession();
    subscribeToProductChanges();
    supabase.auth.onAuthStateChange(function (_event, session) {
        syncSessionFromAuth(session);
    });

    async function fetchProducts() {
        const { data, error } = await supabase.from("products").select("*");
        if (error) {
            console.error("Supabase products fetch failed:", error);
            return [];
        }

        return Array.isArray(data) ? data.map(normalizeProduct) : [];
    }

    async function fetchProductById(id) {
        const productId = cleanText(id);
        if (!productId) {
            console.warn("Supabase product fetch skipped: missing product ID.");
            return null;
        }

        let result = await readSingleProduct("products", productId);

        if (!result.data && !result.error) {
            result = await readSingleProduct("designs", productId);
        }

        if (result.error) {
            console.error("Supabase product fetch failed:", result.error);
            return null;
        }

        return result.data ? normalizeProduct(result.data) : null;
    }

    async function fetchRelatedProducts(currentId, limit) {
        const products = await fetchProducts();
        return products
            .filter((product) => String(product.id) !== String(currentId))
            .sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a))
            .slice(0, limit || 6);
    }

    async function hasPurchasedDesign(userRef, designId) {
        const identity = normalizeUserReference(userRef);
        const normalizedDesignId = cleanText(designId);

        if (!identity.id || !normalizedDesignId) {
            return false;
        }

        const { data, error } = await supabase
            .from("purchases")
            .select("design_id")
            .eq("user_id", identity.id)
            .eq("design_id", normalizedDesignId)
            .limit(1);

        if (error) {
            console.error("Supabase purchase lookup failed:", error);
            return false;
        }

        return Array.isArray(data) && data.length > 0;
    }

    function normalizeProduct(record) {
        const product = record || {};
        const normalizedId = String(product.id || "").trim();
        const title = cleanText(product.title) || "Untitled Design";
        const image = cleanText(product.image || product.preview_url || product.previewUrl) || "/images/preview1.jpg";
        const category = cleanText(product.category).toUpperCase();
        const createdAt = cleanText(product.created_at) || new Date(0).toISOString();
        const price = Number(product.price || 0);
        const normalizedPrice = Number.isFinite(price) ? price : 0;
        const isPaid = product.is_paid === true || normalizedPrice > 0;
        const isFree = product.is_free === true || (!isPaid && normalizedPrice <= 0);
        const isPurchased = product.isPurchased === true || product.is_purchased === true;
        const hasAccess = product.has_access === true || isPurchased || isFree;
        const rawDownloadLink = cleanText(product.download_link || product.downloadUrl || product.download);
        const publicDownloadLink = isPaid ? "" : rawDownloadLink;
        const previewImages = collectProductImages(product, image);

        return {
            ...product,
            id: normalizedId,
            title: title,
            name: title,
            image: image,
            category: category,
            type: category,
            format: category,
            fileType: category,
            created_at: createdAt,
            createdAt: createdAt,
            price: normalizedPrice,
            is_paid: isPaid,
            is_free: isFree,
            has_access: hasAccess,
            isPurchased: isPurchased,
            is_purchased: isPurchased,
            accessType: isFree ? "FREE" : hasAccess ? "UNLOCKED" : "PREMIUM",
            download_link: publicDownloadLink,
            downloadLink: publicDownloadLink,
            downloadUrl: publicDownloadLink,
            fileUrl: publicDownloadLink,
            protected_download_link: rawDownloadLink,
            protectedDownloadLink: rawDownloadLink,
            description: cleanText(product.description) || `${title} ready for instant access.`,
            downloads: Number(product.downloads || 0) || 0,
            views: Number(product.views || 0) || 0,
            previewImages: previewImages,
            gallery: previewImages
        };
    }

    function getSession() {
        const value = readJson(SESSION_KEY, null);
        return value && typeof value === "object" ? value : null;
    }

    async function getAuthSession() {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
            console.error("Supabase auth session read failed:", error);
            return null;
        }

        const session = data ? data.session : null;
        syncSessionFromAuth(session);
        return session;
    }

    async function getAccessToken() {
        const session = await getAuthSession();
        return cleanText(session && session.access_token);
    }

    async function refreshSession() {
        const session = await getAuthSession();
        if (!session) {
            return null;
        }

        return getSession();
    }

    function setSession(user) {
        writeJson(SESSION_KEY, {
            id: cleanText(user && user.id) || `local-${Date.now()}`,
            name: cleanText(user && user.name) || "Creative Member",
            email: cleanText(user && user.email) || "member@ajartivo.local",
            createdAt: cleanText(user && user.createdAt) || new Date().toISOString(),
            emailVerified: Boolean(user && user.emailVerified),
            provider: cleanText(user && user.provider) || "local",
            accessToken: cleanText(user && (user.accessToken || user.access_token)),
            refreshToken: cleanText(user && (user.refreshToken || user.refresh_token)),
            expiresAt: Number(user && (user.expiresAt || user.expires_at)) || 0
        });
    }

    function clearSession() {
        localStorage.removeItem(SESSION_KEY);
    }

    async function signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: cleanText(email).toLowerCase(),
            password: cleanText(password)
        });

        if (error) {
            throw error;
        }

        return syncSessionFromAuth(data ? data.session : null);
    }

    async function signUp(options) {
        const email = cleanText(options && options.email).toLowerCase();
        const password = cleanText(options && options.password);
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password
        });

        if (error) {
            throw error;
        }

        const user = data ? data.user : null;
        const session = data ? data.session : null;

        syncSessionFromAuth(session || (user ? { user: user } : null));

        return {
            user: user,
            session: session,
            requiresEmailVerification: !session
        };
    }

    async function signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) {
            throw error;
        }

        clearSession();
    }

    async function signInWithOAuth(provider, redirectTo) {
        const normalizedProvider = cleanText(provider).toLowerCase();
        if (!normalizedProvider) {
            throw new Error("Missing OAuth provider.");
        }

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: normalizedProvider,
            options: {
                redirectTo: cleanText(redirectTo) || window.location.href
            }
        });

        if (error) {
            throw error;
        }

        return data;
    }

    function readList(key) {
        const value = readJson(key, []);
        return Array.isArray(value) ? value : [];
    }

    function writeList(key, items) {
        writeJson(key, Array.isArray(items) ? items : []);
    }

    function addWishlistItem(product) {
        const items = readList(WISHLIST_KEY).filter((item) => String(item.id) !== String(product.id));
        items.unshift(buildStoredProduct(product, "savedAt"));
        writeList(WISHLIST_KEY, items);
        return items;
    }

    function removeWishlistItem(productId) {
        const items = readList(WISHLIST_KEY).filter((item) => String(item.id) !== String(productId));
        writeList(WISHLIST_KEY, items);
        return items;
    }

    function isWishlisted(productId) {
        return readList(WISHLIST_KEY).some((item) => String(item.id) === String(productId));
    }

    function addDownloadHistoryItem(product) {
        const items = readList(DOWNLOAD_HISTORY_KEY);
        items.unshift(buildStoredProduct(product, "downloadedAt"));
        writeList(DOWNLOAD_HISTORY_KEY, items.slice(0, 50));
        return items;
    }

    function buildStoredProduct(product, timestampKey) {
        const normalized = normalizeProduct(product);
        return {
            id: normalized.id,
            title: normalized.title,
            image: normalized.image,
            price: normalized.price,
            category: normalized.category,
            download_link: normalized.protected_download_link || normalized.download_link,
            is_paid: normalized.is_paid,
            [timestampKey]: new Date().toISOString()
        };
    }

    function readJson(key, fallbackValue) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallbackValue;
        } catch (error) {
            console.error("Local storage read failed:", error);
            return fallbackValue;
        }
    }

    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error("Local storage write failed:", error);
        }
    }

    function cleanText(value) {
        return String(value || "").trim();
    }

    function collectProductImages(product, primaryImage) {
        const extraImages = Array.isArray(product && product.extra_images)
            ? product.extra_images
            : Array.isArray(product && product.extraImages)
            ? product.extraImages
            : Array.isArray(product && product.gallery)
            ? product.gallery
            : [];

        return [primaryImage]
            .concat(extraImages)
            .map(cleanText)
            .filter(Boolean)
            .filter(function (image, index, list) {
                return list.indexOf(image) === index;
            });
    }

    async function readSingleProduct(tableName, productId) {
        const { data, error } = await supabase
            .from(tableName)
            .select("*")
            .eq("id", productId)
            .maybeSingle();

        if (!error || data) {
            return { data: data || null, error: null };
        }

        const numericProductId = Number(productId);
        if (!Number.isInteger(numericProductId)) {
            return { data: null, error: error };
        }

        const retry = await supabase
            .from(tableName)
            .select("*")
            .eq("id", numericProductId)
            .maybeSingle();

        return {
            data: retry.data || null,
            error: retry.error || null
        };
    }

    function getCreatedAtMs(product) {
        const value = cleanText(product && (product.created_at || product.createdAt));
        const date = new Date(value || 0);
        const millis = date.getTime();
        return Number.isFinite(millis) ? millis : 0;
    }

    async function hydrateSession() {
        await refreshSession();
    }

    function subscribeToProductChanges() {
        if (productsChannel || typeof supabase.channel !== "function") {
            return productsChannel;
        }

        productsChannel = supabase
            .channel("ajartivo-products-live")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "products" },
                function (payload) {
                    window.dispatchEvent(new CustomEvent("ajartivo:products-changed", {
                        detail: {
                            change: payload || null,
                            receivedAt: new Date().toISOString()
                        }
                    }));
                }
            )
            .subscribe(function (status) {
                if (status === "CHANNEL_ERROR") {
                    console.error("Supabase realtime subscription failed for products.");
                }
            });

        return productsChannel;
    }

    function syncSessionFromAuth(session) {
        const user = session && session.user ? session.user : session && session.id ? session : null;
        if (!user) {
            clearSession();
            dispatchSessionChange(null);
            return null;
        }

        const normalizedUser = normalizeAuthUser(user, session);
        setSession(normalizedUser);
        dispatchSessionChange(normalizedUser);
        return normalizedUser;
    }

    function normalizeAuthUser(user, session) {
        const metadata = user && user.user_metadata ? user.user_metadata : {};
        const fullName = cleanText(metadata.full_name || metadata.name || user.full_name || user.name);
        const email = cleanText(user && user.email).toLowerCase();
        const joinedAt = cleanText(user && (user.created_at || user.createdAt)) || new Date().toISOString();
        const identities = Array.isArray(user && user.identities) ? user.identities : [];
        const provider = cleanText(
            user && (
                user.app_metadata && user.app_metadata.provider ||
                identities[0] && identities[0].provider
            )
        ) || "email";

        return {
            id: cleanText(user && user.id) || `member-${Date.now()}`,
            name: fullName || email.split("@")[0] || "Creative Member",
            email: email || "member@ajartivo.local",
            createdAt: joinedAt,
            emailVerified: Boolean(user && user.email_confirmed_at),
            provider: provider,
            accessToken: cleanText(session && session.access_token),
            refreshToken: cleanText(session && session.refresh_token),
            expiresAt: Number(session && session.expires_at) || 0
        };
    }

    function dispatchSessionChange(user) {
        window.dispatchEvent(new CustomEvent("ajartivo:session-changed", {
            detail: { user: user || null }
        }));
    }

    function normalizeUserReference(userRef) {
        if (!userRef) {
            return { id: "", email: "" };
        }

        if (typeof userRef === "string") {
            const raw = cleanText(userRef);
            return {
                id: raw.includes("@") ? "" : raw,
                email: raw.includes("@") ? raw.toLowerCase() : ""
            };
        }

        return {
            id: cleanText(userRef.id),
            email: cleanText(userRef.email).toLowerCase()
        };
    }
})();
