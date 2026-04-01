const { cleanText } = require("../config");
const { getSupabaseAdminClient } = require("../supabaseClient");
const { createHttpError } = require("../utils/http");

async function requireAuthenticatedUser(req, _res, next) {
    try {
        const token = extractBearerToken(req.headers.authorization);
        if (!token) {
            return next(createHttpError(401, "Authentication required."));
        }

        const supabase = getSupabaseAdminClient();
        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data || !data.user) {
            return next(createHttpError(401, "Invalid or expired Supabase token."));
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

        req.authToken = token;
        next();
    } catch (error) {
        next(error.status ? error : createHttpError(500, "Authentication failed."));
    }
}

function extractBearerToken(headerValue) {
    const value = cleanText(headerValue);
    if (!value.toLowerCase().startsWith("bearer ")) {
        return "";
    }

    return cleanText(value.slice(7));
}

module.exports = {
    extractBearerToken,
    requireAuthenticatedUser
};
