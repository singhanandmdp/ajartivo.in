const cors = require("cors");
const express = require("express");

const { config, maskCredential } = require("./config");
const downloadRoutes = require("./routes/download");
const paymentRoutes = require("./routes/payment");
const { errorHandler, notFoundHandler } = require("./utils/http");

const app = express();

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || config.frontendOrigins.includes(origin)) {
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
        port: config.port
    });
});

app.use(paymentRoutes);
app.use(downloadRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, function () {
    console.log(`[AJartivo Backend] running on http://localhost:${config.port}`);
    console.log("[AJartivo Backend] Razorpay config", {
        razorpayKeyId: maskCredential(config.razorpay.keyId),
        razorpaySecretLoaded: Boolean(config.razorpay.keySecret)
    });
    console.log("[AJartivo Backend] Allowed origins", config.frontendOrigins);
});

module.exports = app;
