const { onRequest } = require("firebase-functions/https");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
});

// Create Order
exports.createOrder = onRequest(async (req, res) => {
  try {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ error: "Razorpay is not configured." });
    }

    const options = {
      amount: req.body.amount,
      currency: "INR",
      receipt: "receipt_" + Date.now()
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Verify Payment
exports.verifyPayment = onRequest((req, res) => {
  const { order_id, payment_id, signature } = req.body;
  if (!RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: "Razorpay is not configured." });
  }

  const body = order_id + "|" + payment_id;

  const expected = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expected === signature) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});
