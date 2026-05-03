(function () {
    const SUPABASE_URL = "https://hlmyjnslyijgdrfuktun.supabase.co";
    const SUPABASE_PUBLIC_KEY = "sb_publishable_VZYzXaf0npSI8sdhgsIFjQ_1i-SMZY6";
    const SESSION_KEY = "ajartivo_session";
    const WISHLIST_KEY = "ajartivo_wishlist";
    const DOWNLOAD_HISTORY_KEY = "ajartivo_download_history";
    const DESIGNS_CACHE_KEY = "ajartivo_designs_cache_v1";
    const TEMPORARY_USER_DATA_RESET_VERSION = "20260403-new-user-experience";
    const USER_DATA_RESET_MARKER_KEY = "ajartivo_user_data_reset_version";
    const TEMPORARY_USER_DATA_KEYS = [SESSION_KEY, WISHLIST_KEY, DOWNLOAD_HISTORY_KEY];
    const LOCAL_BACKEND_BASE_URL = "http://localhost:5000";
    const LIVE_BACKEND_BASE_URL = "https://ajartivo-backend.onrender.com";
    const ACCOUNT_SUMMARY_TIMEOUT_MS = 6000;
    const BASE_URL = resolveBackendBaseUrl();
    const DESIGNS_SELECT_FIELDS = "id,title,description,price,is_free,is_premium,is_paid,category,image,image_url,preview_url,download_link,file_url,download_url,downloads,views,created_at,extra_images,gallery,tags";
    let designsChannel = null;
    let designsCache = [];
    let designsCacheLoaded = false;
    let designsPreloadPromise = null;

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

    window.AjArtivoCleanText = cleanText;
    window.AjArtivoGetBackendBaseUrl = function () {
        return BASE_URL;
    };
    window.AJARTIVO_BACKEND_URL = BASE_URL;

    window.AjArtivoSupabase = {
        client: supabase,        fetchDesigns: fetchDesigns,        fetchDesignById: fetchDesignById,        fetchRelatedDesigns: fetchRelatedDesigns,
        preloadDesigns: preloadDesigns,
        getCachedDesignById: getCachedDesignById,
        hasPurchasedDesign: hasPurchasedDesign,        normalizeDesign: normalizeDesign,
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
        uploadProfileAvatar: uploadProfileAvatar,
        updatePassword: updatePassword,
        readList: readList,
        writeList: writeList,
        addWishlistItem: addWishlistItem,
        removeWishlistItem: removeWishlistItem,
        isWishlisted: isWishlisted,
        addDownloadHistoryItem: addDownloadHistoryItem,
        resetStoredUserData: resetStoredUserData,        subscribeToDesignChanges: subscribeToDesignChanges
    };

    initializeApp();

    async function initializeApp() {
        await applyTemporaryUserDataReset();
        hydrateDesignCache();
        await hydrateSession();
        preloadDesigns();
        subscribeToDesignChanges();
        supabase.auth.onAuthStateChange(function (_event, session) {
            const syncedSession = syncSessionFromAuth(session);
            if (syncedSession && cleanText(syncedSession.accessToken)) {
                refreshAccountSummary({
                    timeoutMs: ACCOUNT_SUMMARY_TIMEOUT_MS,
                    silent: true
                }).catch(function () {
                    return getSession();
                });
            }
        });
    }

    async function fetchDesigns() {
        if (designsCacheLoaded && designsCache.length) {
            return designsCache.slice();
        }

        let result = await supabase.from("designs").select(DESIGNS_SELECT_FIELDS);

        if (result.error || !Array.isArray(result.data) || !result.data.length) {
            const fallback = await supabase.from("designs").select("*");
            if (!fallback.error && Array.isArray(fallback.data) && fallback.data.length) {
                result = fallback;
            }
        }

        if (result.error) {
            console.error("Supabase designs fetch failed:", result.error);
            return designsCacheLoaded ? designsCache.slice() : [];
        }

        const normalizedDesigns = Array.isArray(result.data) ? result.data.map(normalizeDesign) : [];
        setDesignsCache(normalizedDesigns);
        return normalizedDesigns;
    }

    async function fetchDesignById(id) {
        const designId = cleanText(id);
        if (!designId) {
            console.warn("Supabase design fetch skipped: missing design ID.");
            return null;
        }

        const cachedDesign = getCachedDesignById(designId);
        const result = await readSingleDesign("designs", designId);

        if (result.error) {
            console.error("Supabase design fetch failed:", result.error);
            if (cachedDesign) {
                preloadDesigns();
                return cachedDesign;
            }
            return null;
        }
        const normalizedDesign = result.data ? normalizeDesign(result.data) : null;
        if (normalizedDesign) {
            upsertDesignCache(normalizedDesign);
            return normalizedDesign;
        }

        return cachedDesign || null;
    }

    async function fetchRelatedDesigns(currentId, limit) {
        const designs = await fetchDesigns();
        return designs
            .filter((design) => String(design.id) !== String(currentId))
            .sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a))
            .slice(0, limit || 6);
    }

    async function preloadDesigns() {
        if (designsPreloadPromise) {
            return designsPreloadPromise;
        }

        designsPreloadPromise = fetchDesigns()
            .catch(function (error) {
                console.error("Supabase design preload failed:", error);
                return designsCache.slice();
            })
            .finally(function () {
                designsPreloadPromise = null;
            });

        return designsPreloadPromise;
    }

    function getCachedDesignById(id) {
        const designId = cleanText(id);
        if (!designId) {
            return null;
        }

        const match = designsCache.find(function (design) {
            return String(design.id) === String(designId);
        });

        return match ? normalizeDesign(match) : null;
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

    function normalizeDesign(record) {
        const design = record || {};
        const normalizedId = String(design.id || "").trim();
        const title = cleanText(design.title) || "Untitled Design";
        const image = cleanText(design.image || design.image_url || design.preview_url || design.previewUrl) || "/images/preview1.jpg";
        const category = cleanText(design.category).toUpperCase();
        const createdAt = cleanText(design.created_at) || new Date(0).toISOString();
        const rawPrice = design.price;
        const hasExplicitPrice = rawPrice !== null && typeof rawPrice !== "undefined" && String(rawPrice).trim() !== "";
        const price = Number(design.price || 0);
        const normalizedPrice = Number.isFinite(price) ? price : 0;
        const premiumFlag = design.is_premium === true || design.is_paid === true;
        const freeFlag = design.is_free === true;
        const priceBasedPremium = hasExplicitPrice ? normalizedPrice > 0 : false;
        const isPremium = premiumFlag || priceBasedPremium;
        const isFree = isPremium ? false : (freeFlag || (hasExplicitPrice ? normalizedPrice <= 0 : true));
        const isPaid = isPremium === true || normalizedPrice > 0;
        const isPurchased = design.isPurchased === true || design.is_purchased === true;
        const hasAccess = design.has_access === true || isPurchased;
        const rawDownloadLink = cleanText(design.download_link || design.file_url || design.downloadUrl || design.download);
        const hasDownloadAsset = Boolean(rawDownloadLink);
        const publicDownloadLink = "";
        const previewImages = collectDesignImages(design, image);
        const tags = collectDesignTags(design, title);

        return {
            ...design,
            id: normalizedId,
            title: title,
            name: title,
            image: image,
            image_url: cleanText(design.image_url || image),
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
            file_url: cleanText(design.file_url || design.download_link || design.downloadUrl || design.download),
            downloadLink: publicDownloadLink,
            downloadUrl: publicDownloadLink,
            fileUrl: publicDownloadLink,
            protected_download_link: "",
            protectedDownloadLink: "",
            description: cleanText(design.description) || `${title} ready for instant access.`,
            tags: tags,
            downloads: Number(design.downloads || 0) || 0,
            views: Number(design.views || 0) || 0,
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

    async function refreshSession(options) {
        const session = await getAuthSession();
        if (!session) {
            return null;
        }

        if (options && options.awaitAccountSummary === false) {
            refreshAccountSummary({
                timeoutMs: Number(options.timeoutMs) || ACCOUNT_SUMMARY_TIMEOUT_MS,
                silent: true
            }).catch(function () {
                return getSession();
            });
            return getSession();
        }

        await refreshAccountSummary(options);
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
            avatarUrl: cleanText(user && (user.avatarUrl || user.avatar_url)),
            email: cleanText(user && user.email) || "member@ajartivo.local",
            createdAt: cleanText(user && user.createdAt) || new Date().toISOString(),
            emailVerified: Boolean(user && user.emailVerified),
            provider: cleanText(user && user.provider) || "local",
            role: cleanText(user && user.role) || "user",
            isBanned: Boolean(user && (user.isBanned || user.is_banned)),
            accessToken: cleanText(user && (user.accessToken || user.access_token)),
            refreshToken: cleanText(user && (user.refreshToken || user.refresh_token)),
            expiresAt: Number(user && (user.expiresAt || user.expires_at)) || 0,
            isPremium: Boolean(user && (user.isPremium || user.is_premium)),
            premiumActive: Boolean(user && (user.premiumActive || user.premium_active)),
            planId: cleanText(user && (user.planId || user.plan_id || user.activePlanId || user.active_plan_id || user.current_plan_id)),
            planName: cleanText(user && (user.planName || user.plan_name || user.activePlanName || user.active_plan_name)) || (Boolean(user && (user.premiumActive || user.premium_active)) ? "Premium" : "Free"),
            premiumExpiry: cleanText(user && (user.premiumExpiry || user.premium_expiry)),
            monthlyDownloadLimit: Number(user && (user.monthlyDownloadLimit || user.monthly_download_limit)) || 0,
            downloadsUsedMonth: Number(user && (user.downloadsUsedMonth || user.downloads_used_month)) || 0,
            downloadsRemainingMonth: Number(user && (user.downloadsRemainingMonth || user.downloads_remaining_month)) || 0,
            dailyAiLimit: Number(user && (user.dailyAiLimit || user.daily_ai_limit)) || 0,
            aiGenerationsUsedToday: Number(user && (user.aiGenerationsUsedToday || user.ai_generations_used_today)) || 0,
            aiRemainingToday: Number(user && (user.aiRemainingToday || user.ai_remaining_today)) || 0,
            printLayoutLimit: cleanText(user && (user.printLayoutLimit || user.print_layout_limit)),
            toolsAccess: user && (user.toolsAccess || user.tools_access) && typeof (user.toolsAccess || user.tools_access) === "object"
                ? (user.toolsAccess || user.tools_access)
                : {},
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

    async function signIn(email, password, options) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: cleanText(email).toLowerCase(),
            password: cleanText(password)
        });

        if (error) {
            throw error;
        }

        syncSessionFromAuth(data ? data.session : null);
        await refreshSession(options);
        return getSession();
    }

    async function signUp(options) {
        const signupOptions = options || {};
        const email = cleanText(signupOptions.email).toLowerCase();
        const password = cleanText(signupOptions.password);
        const address = cleanText(signupOptions.address);
        const names = buildNameParts(signupOptions, email);
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
            await refreshSession(signupOptions);
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

    async function uploadProfileAvatar(file) {
        const authSession = await getAuthSession({ sync: false });
        if (!authSession || !authSession.user) {
            throw new Error("You need to log in again before uploading a profile image.");
        }

        const imageFile = file instanceof File ? file : null;
        if (!imageFile) {
            throw new Error("Please choose a valid image file.");
        }

        const fileName = cleanText(imageFile.name);
        const fileType = cleanText(imageFile.type) || "application/octet-stream";
        if (!/\.(png|jpe?g|webp)$/i.test(fileName)) {
            throw new Error("Profile image must be PNG, JPG, JPEG, or WEBP.");
        }

        if (Number(imageFile.size || 0) > 10 * 1024 * 1024) {
            throw new Error("Profile image must be 10 MB or smaller.");
        }

        const token = cleanText(authSession.access_token);
        if (!token) {
            throw new Error("Session token missing. Please log in again.");
        }

        const response = await fetch(`${BASE_URL}/account/avatar`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": fileType,
                "X-File-Name": encodeURIComponent(imageFile.name),
                "X-File-Type": encodeURIComponent(fileType)
            },
            body: imageFile
        });

        const payload = await response.json().catch(function () {
            return {};
        });

        if (!response.ok) {
            throw new Error(cleanText(payload && payload.error) || `Avatar upload failed with status ${response.status}.`);
        }

        const currentSession = getSession() || {};
        const accountSummary = normalizeAccountSummary(payload && payload.account ? payload.account : {});
        const avatarUrl = cleanText(payload && payload.avatar_url) || cleanText(accountSummary.avatarUrl);

        setSession({
            ...currentSession,
            ...accountSummary,
            avatarUrl: avatarUrl || cleanText(currentSession.avatarUrl)
        });

        const updatedSession = getSession();
        dispatchSessionChange(updatedSession);
        return updatedSession;
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

    function addWishlistItem(design) {
        const items = readList(WISHLIST_KEY).filter((item) => String(item.id) !== String(design.id));
        items.unshift(buildStoredDesign(design, "savedAt"));
        writeList(WISHLIST_KEY, items);
        return items;
    }

    function removeWishlistItem(designId) {
        const items = readList(WISHLIST_KEY).filter((item) => String(item.id) !== String(designId));
        writeList(WISHLIST_KEY, items);
        return items;
    }

    function isWishlisted(designId) {
        return readList(WISHLIST_KEY).some((item) => String(item.id) === String(designId));
    }

    function addDownloadHistoryItem(design) {
        const items = readList(DOWNLOAD_HISTORY_KEY);
        items.unshift(buildStoredDesign(design, "downloadedAt"));
        writeList(DOWNLOAD_HISTORY_KEY, items.slice(0, 50));
        return items;
    }

    function buildStoredDesign(design, timestampKey) {
        const normalized = normalizeDesign(design);
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

    function buildProtectedDownloadRoute(designId) {
        const normalizedId = cleanText(designId);
        return normalizedId ? `/download/${encodeURIComponent(normalizedId)}` : "";
    }

    async function refreshAccountSummary(options) {
        const session = await getAuthSession();
        if (!session || !session.user || !cleanText(session.access_token)) {
            return getSession();
        }

        const controller = typeof AbortController === "function" ? new AbortController() : null;
        const timeoutMs = Math.max(1500, Number(options && options.timeoutMs) || ACCOUNT_SUMMARY_TIMEOUT_MS);
        let timeoutId = 0;

        if (controller) {
            timeoutId = window.setTimeout(function () {
                controller.abort();
            }, timeoutMs);
        }

        try {
            const response = await fetch(`${BASE_URL}/account/summary`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${cleanText(session.access_token)}`
                },
                ...(controller ? { signal: controller.signal } : {})
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
            dispatchAccountUpdated(buildAccountSummaryFromSession(updatedSession));
            return updatedSession;
        } catch (error) {
            if (!(options && options.silent === true && error && error.name === "AbortError")) {
                console.error("Account summary refresh failed:", error);
            }
            return getSession();
        } finally {
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
        }
    }

    function normalizeAccountSummary(account) {
        const summary = account || {};
        return {
            role: cleanText(summary.role) || "user",
            isBanned: summary.is_banned === true,
            firstName: cleanText(summary.first_name),
            lastName: cleanText(summary.last_name),
            address: cleanText(summary.address),
            mobileNumber: cleanText(summary.mobile_number),
            avatarUrl: cleanText(summary.avatar_url),
            isPremium: summary.is_premium === true,
            premiumActive: summary.premium_active === true,
            planId: cleanText(summary.active_plan_id || summary.current_plan_id),
            planName: cleanText(summary.active_plan_name) || (summary.premium_active === true ? "Premium" : "Free"),
            premiumExpiry: cleanText(summary.premium_expiry),
            monthlyDownloadLimit: Number(summary.monthly_download_limit || 0) || 0,
            downloadsUsedMonth: Number(summary.downloads_used_month || 0) || 0,
            downloadsRemainingMonth: Number(summary.downloads_remaining_month || 0) || 0,
            dailyAiLimit: Number(summary.daily_ai_limit || 0) || 0,
            aiGenerationsUsedToday: Number(summary.ai_generations_used_today || 0) || 0,
            aiRemainingToday: Number(summary.ai_remaining_today || 0) || 0,
            printLayoutLimit: cleanText(summary.print_layout_limit),
            toolsAccess: summary.tools_access && typeof summary.tools_access === "object" ? summary.tools_access : {},
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
            role: session && session.role,
            is_banned: session && session.isBanned,
            first_name: session && session.firstName,
            last_name: session && session.lastName,
            address: session && session.address,
            mobile_number: session && session.mobileNumber,
            avatar_url: session && session.avatarUrl,
            is_premium: session && session.isPremium,
            premium_active: session && session.premiumActive,
            active_plan_id: session && session.planId,
            active_plan_name: session && session.planName,
            premium_expiry: session && session.premiumExpiry,
            monthly_download_limit: session && session.monthlyDownloadLimit,
            downloads_used_month: session && session.downloadsUsedMonth,
            downloads_remaining_month: session && session.downloadsRemainingMonth,
            daily_ai_limit: session && session.dailyAiLimit,
            ai_generations_used_today: session && session.aiGenerationsUsedToday,
            ai_remaining_today: session && session.aiRemainingToday,
            print_layout_limit: session && session.printLayoutLimit,
            tools_access: session && session.toolsAccess,
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

        if (hasActiveAuthCallback()) {
            writeStorageText(USER_DATA_RESET_MARKER_KEY, TEMPORARY_USER_DATA_RESET_VERSION);
            return;
        }

        try {
            const authResult = await supabase.auth.getSession();
            if (authResult && authResult.data && authResult.data.session) {
                writeStorageText(USER_DATA_RESET_MARKER_KEY, TEMPORARY_USER_DATA_RESET_VERSION);
                return;
            }
        } catch (error) {
            console.warn("Supabase auth session check failed before temporary reset:", error);
        }

        await resetStoredUserData();
        writeStorageText(USER_DATA_RESET_MARKER_KEY, TEMPORARY_USER_DATA_RESET_VERSION);
    }

    function hasActiveAuthCallback() {
        try {
            const searchParams = new URLSearchParams(window.location.search);
            const hashParams = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
            const authKeys = [
                "code",
                "access_token",
                "refresh_token",
                "expires_at",
                "expires_in",
                "provider_token",
                "provider_refresh_token",
                "token_type",
                "type",
                "error",
                "error_code",
                "error_description"
            ];

            return authKeys.some(function (key) {
                return searchParams.has(key) || hashParams.has(key);
            });
        } catch (error) {
            console.warn("Auth callback detection failed:", error);
            return false;
        }
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

    function hydrateDesignCache() {
        const cached = readSessionJson(DESIGNS_CACHE_KEY, []);
        if (!Array.isArray(cached) || !cached.length) {
            return;
        }

        designsCache = cached.map(normalizeDesign);
        designsCacheLoaded = true;
    }

    function setDesignsCache(items) {
        designsCache = Array.isArray(items) ? items.map(normalizeDesign) : [];
        designsCacheLoaded = true;
        writeSessionJson(DESIGNS_CACHE_KEY, designsCache);
    }

    function upsertDesignCache(item) {
        const normalizedItem = normalizeDesign(item);
        const nextCache = designsCache.filter(function (design) {
            return String(design.id) !== String(normalizedItem.id);
        });
        nextCache.unshift(normalizedItem);
        setDesignsCache(nextCache);
    }

    function readSessionJson(key, fallbackValue) {
        try {
            const raw = sessionStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallbackValue;
        } catch (error) {
            console.error("Session storage read failed:", error);
            return fallbackValue;
        }
    }

    function writeSessionJson(key, value) {
        try {
            sessionStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error("Session storage write failed:", error);
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

    function collectDesignImages(design, primaryImage) {
        const extraImages = Array.isArray(design && design.extra_images)
            ? design.extra_images
            : Array.isArray(design && design.extraImages)
            ? design.extraImages
            : Array.isArray(design && design.gallery)
            ? design.gallery
            : [];

        return [primaryImage]
            .concat(extraImages)
            .map(cleanText)
            .filter(Boolean)
            .filter(function (image, index, list) {
                return list.indexOf(image) === index;
            });
    }

    function collectDesignTags(design, fallbackTitle) {
        const rawTags = Array.isArray(design && design.tags)
            ? design.tags
            : typeof (design && design.tags) === "string"
            ? design.tags.split(",")
            : [];

        const tags = rawTags
            .map(cleanText)
            .filter(Boolean)
            .filter(function (tag, index, list) {
                return list.indexOf(tag) === index;
            });

        if (tags.length) {
            return tags;
        }

        const fallback = cleanText(fallbackTitle);
        return fallback ? [fallback] : [];
    }

    async function readSingleDesign(tableName, designId) {
        const { data, error } = await supabase
            .from(tableName)
            .select("*")
            .eq("id", designId)
            .maybeSingle();

        if (!error || data) {
            return { data: data || null, error: null };
        }

        return { data: null, error: error };
    }

    function getCreatedAtMs(design) {
        const value = cleanText(design && (design.created_at || design.createdAt));
        const date = new Date(value || 0);
        const millis = date.getTime();
        return Number.isFinite(millis) ? millis : 0;
    }

    async function hydrateSession() {
        const session = await getAuthSession();
        if (!session || !session.user) {
            return null;
        }

        refreshAccountSummary({
            timeoutMs: ACCOUNT_SUMMARY_TIMEOUT_MS,
            silent: true
        }).catch(function () {
            return getSession();
        });
        return getSession();
    }

    function subscribeToDesignChanges() {
        if (designsChannel || typeof supabase.channel !== "function") {
            return designsChannel;
        }

        designsChannel = supabase
            .channel("ajartivo-designs-live")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "designs" },
                dispatchDesignChange
            )
            .subscribe(function (status) {
                if (status === "CHANNEL_ERROR") {
                    console.error("Supabase realtime subscription failed for designs.");
                }
            });

        return designsChannel;
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
            "avatarUrl",
            "role",
            "isBanned",
            "accessToken",
            "refreshToken",
            "expiresAt",
            "isPremium",
            "premiumActive",
            "planId",
            "planName",
            "premiumExpiry",
            "monthlyDownloadLimit",
            "downloadsUsedMonth",
            "downloadsRemainingMonth",
            "dailyAiLimit",
            "aiGenerationsUsedToday",
            "aiRemainingToday",
            "printLayoutLimit",
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

    function dispatchDesignChange(payload) {
        window.dispatchEvent(new CustomEvent("ajartivo:designs-changed", {
            detail: {
                change: payload || null,
                receivedAt: new Date().toISOString()
            }
        }));
        window.dispatchEvent(new CustomEvent("ajartivo:designs-changed-legacy", {
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
            avatarUrl: cleanText(metadata && (metadata.avatar_url || metadata.picture)),
            email: email || "member@ajartivo.local",
            createdAt: joinedAt,
            emailVerified: Boolean(user && user.email_confirmed_at),
            provider: provider,
            role: cleanText(metadata && metadata.role) || "user",
            isBanned: metadata && metadata.is_banned === true,
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

    function dispatchAccountUpdated(account) {
        window.dispatchEvent(new CustomEvent("ajartivo:account-updated", {
            detail: {
                account: account || getAccountSummary()
            }
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
        const configuredUrl = normalizeBackendBaseUrl(
            window.AJARTIVO_BACKEND_URL ||
            (document.querySelector('meta[name="ajartivo-backend-url"]') || {}).content
        );
        if (configuredUrl) {
            return configuredUrl;
        }

        if (isLocalRuntime()) {
            return LOCAL_BACKEND_BASE_URL;
        }

        return LIVE_BACKEND_BASE_URL;
    }

    function normalizeBackendBaseUrl(value) {
        const normalized = cleanText(value).replace(/\/+$/, "");
        if (!normalized) {
            return "";
        }

        if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(normalized) && !isLocalRuntime()) {
            console.warn("Ignoring local backend URL on non-local host.");
            return LIVE_BACKEND_BASE_URL;
        }

        return normalized;
    }

    function isLocalRuntime() {
        const hostname = cleanText(window.location && window.location.hostname).toLowerCase();
        return !hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local");
    }
})();
