(function () {
    const SUPABASE_URL = "https://hlmyjnslyijgdrfuktun.supabase.co";
    const SUPABASE_PUBLIC_KEY = "sb_publishable_VZYzXaf0npSI8sdhgsIFjQ_1i-SMZY6";
    const SESSION_KEY = "ajartivo_session";
    const WISHLIST_KEY = "ajartivo_wishlist";
    const DOWNLOAD_HISTORY_KEY = "ajartivo_download_history";
    const TEMPORARY_USER_DATA_RESET_VERSION = "20260403-new-user-experience";
    const USER_DATA_RESET_MARKER_KEY = "ajartivo_user_data_reset_version";
    const TEMPORARY_USER_DATA_KEYS = [SESSION_KEY, WISHLIST_KEY, DOWNLOAD_HISTORY_KEY];
    const LOCAL_BACKEND_BASE_URL = "http://localhost:5000";
    const LIVE_BACKEND_BASE_URL = "https://ajartivo-in.onrender.com";
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
        getAccountSummary: getAccountSummary,
        refreshAccountSummary: refreshAccountSummary,
        refreshSession: refreshSession,
        setSession: setSession,
        clearSession: clearSession,
        signIn: signIn,
        signUp: signUp,
        signOut: signOut,
        signInWithOAuth: signInWithOAuth,
        updateProfile: updateProfile,
        updatePassword: updatePassword,
        readList: readList,
        writeList: writeList,
        addWishlistItem: addWishlistItem,
        removeWishlistItem: removeWishlistItem,
        isWishlisted: isWishlisted,
        addDownloadHistoryItem: addDownloadHistoryItem,
        resetStoredUserData: resetStoredUserData,
        subscribeToProductChanges: subscribeToProductChanges
    };

    initializeApp();

    async function initializeApp() {
        await applyTemporaryUserDataReset();
        await hydrateSession();
        subscribeToProductChanges();
        supabase.auth.onAuthStateChange(function (_event, session) {
            syncSessionFromAuth(session);
        });
    }

    async function fetchProducts() {
        let result = await supabase.from("products").select("*");

        if (result.error || !Array.isArray(result.data) || !result.data.length) {
            const fallback = await supabase.from("designs").select("*");
            if (!fallback.error && Array.isArray(fallback.data) && fallback.data.length) {
                result = fallback;
            }
        }

        if (result.error) {
            console.error("Supabase products fetch failed:", result.error);
            return [];
        }

        return Array.isArray(result.data) ? result.data.map(normalizeProduct) : [];
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
        const image = cleanText(product.image || product.image_url || product.preview_url || product.previewUrl) || "/images/preview1.jpg";
        const category = cleanText(product.category).toUpperCase();
        const createdAt = cleanText(product.created_at) || new Date(0).toISOString();
        const price = Number(product.price || 0);
        const normalizedPrice = Number.isFinite(price) ? price : 0;
        const isFree = product.is_free === true || (product.is_premium !== true && product.is_paid !== true && normalizedPrice <= 0);
        const isPremium = product.is_premium === true || (isFree !== true && (product.is_paid === true || normalizedPrice > 0));
        const isPaid = isPremium === true || normalizedPrice > 0;
        const isPurchased = product.isPurchased === true || product.is_purchased === true;
        const hasAccess = product.has_access === true || isPurchased;
        const rawDownloadLink = cleanText(product.download_link || product.file_url || product.downloadUrl || product.download);
        const hasDownloadAsset = Boolean(rawDownloadLink);
        const publicDownloadLink = "";
        const previewImages = collectProductImages(product, image);

        return {
            ...product,
            id: normalizedId,
            title: title,
            name: title,
            image: image,
            image_url: cleanText(product.image_url || image),
            category: category,
            type: category,
            format: category,
            fileType: category,
            created_at: createdAt,
            createdAt: createdAt,
            price: normalizedPrice,
            is_premium: isPremium,
            is_paid: isPaid,
            is_free: isFree,
            has_access: hasAccess,
            isPurchased: isPurchased,
            is_purchased: isPurchased,
            accessType: hasAccess ? "UNLOCKED" : isFree ? "FREE" : "PREMIUM",
            download_enabled: hasDownloadAsset,
            download_link: publicDownloadLink,
            file_url: cleanText(product.file_url || product.download_link || product.downloadUrl || product.download),
            downloadLink: publicDownloadLink,
            downloadUrl: publicDownloadLink,
            fileUrl: publicDownloadLink,
            protected_download_link: "",
            protectedDownloadLink: "",
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

    function getAccountSummary() {
        const session = getSession();
        return session ? buildAccountSummaryFromSession(session) : null;
    }

    async function getAuthSession(options) {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
            console.error("Supabase auth session read failed:", error);
            return null;
        }

        const session = data ? data.session : null;
        const shouldSync = !options || options.sync !== false;
        if (shouldSync) {
            syncSessionFromAuth(session);
        }
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

        await refreshAccountSummary();
        return getSession();
    }

    function setSession(user) {
        const names = buildNameParts(user, cleanText(user && user.email).toLowerCase());
        const address = cleanText(user && (user.address || user.address_line || user.location));
        const mobileNumber = cleanText(user && (user.mobileNumber || user.mobile_number || user.phoneNumber || user.phone_number || user.phone));
        writeJson(SESSION_KEY, {
            id: cleanText(user && user.id) || `local-${Date.now()}`,
            name: names.fullName || "Creative Member",
            fullName: names.fullName || "Creative Member",
            firstName: names.firstName || "Creative",
            lastName: names.lastName,
            address: address,
            mobileNumber: mobileNumber,
            email: cleanText(user && user.email) || "member@ajartivo.local",
            createdAt: cleanText(user && user.createdAt) || new Date().toISOString(),
            emailVerified: Boolean(user && user.emailVerified),
            provider: cleanText(user && user.provider) || "local",
            accessToken: cleanText(user && (user.accessToken || user.access_token)),
            refreshToken: cleanText(user && (user.refreshToken || user.refresh_token)),
            expiresAt: Number(user && (user.expiresAt || user.expires_at)) || 0,
            isPremium: Boolean(user && (user.isPremium || user.is_premium)),
            premiumActive: Boolean(user && (user.premiumActive || user.premium_active)),
            premiumExpiry: cleanText(user && (user.premiumExpiry || user.premium_expiry)),
            freeDownloadCount: Number(user && (user.freeDownloadCount || user.free_download_count)) || 0,
            freeDownloadRemaining: Number(user && (user.freeDownloadRemaining || user.free_download_remaining)) || 0,
            weeklyPremiumDownloadCount: Number(user && (user.weeklyPremiumDownloadCount || user.weekly_premium_download_count)) || 0,
            weeklyPremiumRemaining: Number(user && (user.weeklyPremiumRemaining || user.weekly_premium_remaining)) || 0,
            weeklyResetDate: cleanText(user && (user.weeklyResetDate || user.weekly_reset_date)),
            premiumBadge: cleanText(user && (user.premiumBadge || user.premium_badge))
        });
    }

    function clearSession() {
        removeStorageItem(SESSION_KEY);
    }

    async function signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: cleanText(email).toLowerCase(),
            password: cleanText(password)
        });

        if (error) {
            throw error;
        }

        syncSessionFromAuth(data ? data.session : null);
        await refreshAccountSummary();
        return getSession();
    }

    async function signUp(options) {
        const email = cleanText(options && options.email).toLowerCase();
        const password = cleanText(options && options.password);
        const address = cleanText(options && options.address);
        const names = buildNameParts(options, email);
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: names.fullName,
                    name: names.fullName,
                    first_name: names.firstName,
                    last_name: names.lastName,
                    address: address
                }
            }
        });

        if (error) {
            throw error;
        }

        const user = data ? data.user : null;
        const session = data ? data.session : null;

        if (session) {
            syncSessionFromAuth(session);
            await refreshAccountSummary();
        } else {
            clearSession();
        }

        return {
            user: user,
            session: session ? getSession() : session,
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

    async function updateProfile(options) {
        const authSession = await getAuthSession({ sync: false });
        if (!authSession || !authSession.user) {
            throw new Error("You need to log in again before editing your profile.");
        }

        const email = cleanText(authSession.user.email).toLowerCase();
        const names = buildNameParts(options, email);
        const address = cleanText(options && options.address);
        const mobileNumber = cleanText(options && options.mobileNumber);
        if (!names.firstName) {
            throw new Error("First name is required.");
        }

        const profilePayload = {
            id: cleanText(authSession.user.id),
            email: email,
            first_name: names.firstName,
            last_name: names.lastName,
            address: address
        };

        if (mobileNumber) {
            profilePayload.mobile_number = mobileNumber;
        }

        const { error: profileError } = await supabase
            .from("profiles")
            .upsert(profilePayload, {
                onConflict: "id"
            })
            .select("id")
            .single();

        if (profileError) {
            throw profileError;
        }

        const { data, error } = await supabase.auth.updateUser({
            data: {
                full_name: names.fullName,
                name: names.fullName,
                first_name: names.firstName,
                last_name: names.lastName,
                address: address,
                ...(mobileNumber ? { mobile_number: mobileNumber } : {})
            }
        });

        if (error) {
            throw error;
        }

        const currentSession = getSession() || {};
        const updatedUser = normalizeAuthUser(data && data.user ? data.user : authSession.user, authSession);
        setSession({
            ...currentSession,
            ...updatedUser
        });
        dispatchSessionChange(getSession());

        return getSession();
    }

    async function updatePassword(nextPassword) {
        const authSession = await getAuthSession({ sync: false });
        if (!authSession || !authSession.user) {
            throw new Error("You need to log in again before changing your password.");
        }

        const password = cleanText(nextPassword);
        if (password.length < 6) {
            throw new Error("Password must be at least 6 characters long.");
        }

        const { error } = await supabase.auth.updateUser({
            password: password
        });

        if (error) {
            throw error;
        }

        return true;
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
            download_link: buildProtectedDownloadRoute(normalized.id),
            is_paid: normalized.is_paid,
            has_access: true,
            isPurchased: normalized.is_paid === true || normalized.isPurchased === true,
            is_purchased: normalized.is_paid === true || normalized.is_purchased === true,
            [timestampKey]: new Date().toISOString()
        };
    }

    function buildProtectedDownloadRoute(productId) {
        const normalizedId = cleanText(productId);
        return normalizedId ? `/download/${encodeURIComponent(normalizedId)}` : "";
    }

    async function refreshAccountSummary() {
        const session = await getAuthSession();
        if (!session || !session.user || !cleanText(session.access_token)) {
            return getSession();
        }

        try {
            const response = await fetch(`${resolveBackendBaseUrl()}/account/summary`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${cleanText(session.access_token)}`
                }
            });

            if (!response.ok) {
                return getSession();
            }

            const payload = await response.json().catch(function () {
                return {};
            });
            const currentSession = getSession() || {};
            const accountSummary = normalizeAccountSummary(payload && payload.account ? payload.account : {});

            setSession({
                ...currentSession,
                ...accountSummary
            });

            const updatedSession = getSession();
            dispatchSessionChange(updatedSession);
            return updatedSession;
        } catch (error) {
            console.error("Account summary refresh failed:", error);
            return getSession();
        }
    }

    function normalizeAccountSummary(account) {
        const summary = account || {};
        return {
            firstName: cleanText(summary.first_name),
            lastName: cleanText(summary.last_name),
            address: cleanText(summary.address),
            mobileNumber: cleanText(summary.mobile_number),
            isPremium: summary.is_premium === true,
            premiumActive: summary.premium_active === true,
            premiumExpiry: cleanText(summary.premium_expiry),
            freeDownloadCount: Number(summary.free_download_count || 0) || 0,
            freeDownloadRemaining: Number(summary.free_download_remaining || 0) || 0,
            weeklyPremiumDownloadCount: Number(summary.weekly_premium_download_count || 0) || 0,
            weeklyPremiumRemaining: Number(summary.weekly_premium_remaining || 0) || 0,
            weeklyResetDate: cleanText(summary.weekly_reset_date),
            premiumBadge: cleanText(summary.premium_badge) || (summary.premium_active === true ? "Premium Active" : "Free Member")
        };
    }

    function buildAccountSummaryFromSession(session) {
        return normalizeAccountSummary({
            first_name: session && session.firstName,
            last_name: session && session.lastName,
            address: session && session.address,
            mobile_number: session && session.mobileNumber,
            is_premium: session && session.isPremium,
            premium_active: session && session.premiumActive,
            premium_expiry: session && session.premiumExpiry,
            free_download_count: session && session.freeDownloadCount,
            free_download_remaining: session && session.freeDownloadRemaining,
            weekly_premium_download_count: session && session.weeklyPremiumDownloadCount,
            weekly_premium_remaining: session && session.weeklyPremiumRemaining,
            weekly_reset_date: session && session.weeklyResetDate,
            premium_badge: session && session.premiumBadge
        });
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

    async function applyTemporaryUserDataReset() {
        const currentVersion = readStorageText(USER_DATA_RESET_MARKER_KEY);
        if (currentVersion === TEMPORARY_USER_DATA_RESET_VERSION) {
            return;
        }

        await resetStoredUserData();
        writeStorageText(USER_DATA_RESET_MARKER_KEY, TEMPORARY_USER_DATA_RESET_VERSION);
    }

    async function resetStoredUserData() {
        let hadSession = Boolean(getSession());

        try {
            const authResult = await supabase.auth.getSession();
            hadSession = hadSession || Boolean(authResult && authResult.data && authResult.data.session);
        } catch (error) {
            console.warn("Supabase auth session check failed during reset:", error);
        }

        try {
            await supabase.auth.signOut({ scope: "local" });
        } catch (error) {
            console.warn("Supabase sign-out skipped during temporary reset:", error);
        }

        TEMPORARY_USER_DATA_KEYS.forEach(removeStorageItem);
        clearSupabaseAuthStorage();

        if (hadSession) {
            dispatchSessionChange(null);
        }
    }

    function clearSupabaseAuthStorage() {
        try {
            const keysToRemove = [];
            for (let index = 0; index < localStorage.length; index += 1) {
                const key = cleanText(localStorage.key(index));
                if (/^sb-.*auth-token$/i.test(key)) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach(removeStorageItem);
        } catch (error) {
            console.warn("Supabase auth storage cleanup failed:", error);
        }
    }

    function removeStorageItem(key) {
        const storageKey = cleanText(key);
        if (!storageKey) {
            return;
        }

        try {
            localStorage.removeItem(storageKey);
        } catch (error) {
            console.error("Local storage remove failed:", error);
        }
    }

    function readStorageText(key) {
        try {
            return cleanText(localStorage.getItem(key));
        } catch (error) {
            console.error("Local storage read failed:", error);
            return "";
        }
    }

    function writeStorageText(key, value) {
        try {
            localStorage.setItem(key, cleanText(value));
        } catch (error) {
            console.error("Local storage write failed:", error);
        }
    }

    function buildNameParts(source, fallbackEmail) {
        const details = source || {};
        const firstNameInput = cleanText(details.firstName || details.first_name);
        const lastNameInput = cleanText(details.lastName || details.last_name);
        const fullNameInput = cleanText(details.fullName || details.full_name || details.name);
        const derivedFromFull = splitFullName(fullNameInput);
        const fallbackName = cleanText(fallbackEmail).split("@")[0];

        const firstName = firstNameInput || derivedFromFull.firstName || fallbackName || "Creative";
        const lastName = lastNameInput || derivedFromFull.lastName;
        const fullName = fullNameInput || [firstName, lastName].filter(Boolean).join(" ") || "Creative Member";

        return {
            firstName: firstName,
            lastName: lastName,
            fullName: fullName
        };
    }

    function splitFullName(value) {
        const fullName = cleanText(value);
        if (!fullName) {
            return { firstName: "", lastName: "" };
        }

        const parts = fullName.split(/\s+/).filter(Boolean);
        return {
            firstName: parts[0] || "",
            lastName: parts.slice(1).join(" ")
        };
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
                dispatchProductChange
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "designs" },
                dispatchProductChange
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
        const previousSession = getSession();
        if (!user) {
            clearSession();
            if (previousSession) {
                dispatchSessionChange(null);
            }
            return null;
        }

        const normalizedUser = normalizeAuthUser(user, session);
        setSession(normalizedUser);
        if (!isSameSessionState(previousSession, normalizedUser)) {
            dispatchSessionChange(normalizedUser);
        }
        return normalizedUser;
    }

    function isSameSessionState(previousSession, nextSession) {
        if (!previousSession && !nextSession) {
            return true;
        }

        if (!previousSession || !nextSession) {
            return false;
        }

        return [
            "id",
            "email",
            "name",
            "fullName",
            "firstName",
            "lastName",
            "address",
            "mobileNumber",
            "accessToken",
            "refreshToken",
            "expiresAt",
            "isPremium",
            "premiumActive",
            "premiumExpiry",
            "freeDownloadCount",
            "freeDownloadRemaining",
            "weeklyPremiumDownloadCount",
            "weeklyPremiumRemaining",
            "weeklyResetDate",
            "premiumBadge"
        ].every(function (key) {
            return cleanText(previousSession[key]) === cleanText(nextSession[key]);
        });
    }

    function dispatchProductChange(payload) {
        window.dispatchEvent(new CustomEvent("ajartivo:products-changed", {
            detail: {
                change: payload || null,
                receivedAt: new Date().toISOString()
            }
        }));
    }

    function normalizeAuthUser(user, session) {
        const email = cleanText(user && user.email).toLowerCase();
        const names = buildNameParts(user && user.user_metadata ? user.user_metadata : user, email);
        const joinedAt = cleanText(user && (user.created_at || user.createdAt)) || new Date().toISOString();
        const identities = Array.isArray(user && user.identities) ? user.identities : [];
        const provider = cleanText(
            user && (
                user.app_metadata && user.app_metadata.provider ||
                identities[0] && identities[0].provider
            )
        ) || "email";
        const metadata = user && user.user_metadata ? user.user_metadata : user;

        return {
            id: cleanText(user && user.id) || `member-${Date.now()}`,
            name: names.fullName || email.split("@")[0] || "Creative Member",
            fullName: names.fullName || email.split("@")[0] || "Creative Member",
            firstName: names.firstName || email.split("@")[0] || "Creative",
            lastName: names.lastName,
            address: cleanText(metadata && metadata.address),
            mobileNumber: cleanText(metadata && (metadata.mobile_number || metadata.phone_number || metadata.phone)),
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

    function resolveBackendBaseUrl() {
        const configuredUrl = cleanText(
            window.AJARTIVO_BACKEND_URL ||
            (document.querySelector('meta[name="ajartivo-backend-url"]') || {}).content
        );
        if (configuredUrl) {
            return configuredUrl.replace(/\/+$/, "");
        }

        const hostname = cleanText(window.location && window.location.hostname).toLowerCase();
        if (hostname === "localhost" || hostname === "127.0.0.1") {
            return LOCAL_BACKEND_BASE_URL;
        }

        return LIVE_BACKEND_BASE_URL;
    }
})();
