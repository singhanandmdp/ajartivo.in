const {
    getRazorpayConfigurationError,
    getSupabaseConfigurationError
} = require("../config");
const { createHttpError } = require("../utils/http");

function requireSupabaseConfigured(_req, _res, next) {
    const configError = getSupabaseConfigurationError();
    if (configError) {
        return next(createHttpError(500, configError));
    }

    next();
}

function requireRazorpayConfigured(_req, _res, next) {
    const configError = getRazorpayConfigurationError();
    if (configError) {
        return next(createHttpError(500, configError));
    }

    next();
}

function requirePaymentConfigured(req, res, next) {
    requireSupabaseConfigured(req, res, function (error) {
        if (error) {
            next(error);
            return;
        }

        requireRazorpayConfigured(req, res, next);
    });
}

module.exports = {
    requirePaymentConfigured,
    requireRazorpayConfigured,
    requireSupabaseConfigured
};
