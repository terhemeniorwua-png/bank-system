const crypto = require("node:crypto");
const express = require("express");

const PAYSTACK = "https://api.paystack.co";
const secret = process.env.PAYSTACK_SECRET_KEY;
const callbackUrl = process.env.PAYSTACK_CALLBACK_URL;

if (!secret) throw new Error("PAYSTACK_SECRET_KEY is not set");

// ---- Webhook handler (mounted in app.js with express.raw) ----
async function webhookHandler(req, res) {
  const expected = crypto
    .createHmac("sha512", secret)
    .update(req.body) // req.body is a raw Buffer here
    .digest("hex");

  const received = String(req.headers["x-paystack-signature"] || "");
  const a = Buffer.from(expected);
  const b = Buffer.from(received);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.sendStatus(401);
  }

  res.sendStatus(200); // reply fast, then process

  try {
    const event = JSON.parse(req.body.toString());

    if (event.event === "charge.success") {
      // 1. look up the deposit by event.data.reference
      // 2. skip if it's already marked SUCCESS (idempotency)
      // 3. check event.data.amount and event.data.currency match what you stored
      // 4. credit the account inside ONE database transaction
    }
  } catch (err) {
    console.error("Webhook processing failed:", err);
  }
}

// ---- Deposit routes ----
const router = express.Router();

router.post("/deposits", async (req, res, next) => {
  try {
    const { amountNaira } = req.body; // validate properly (e.g. with zod)

    if (typeof amountNaira !== "number" || !(amountNaira > 0)) {
      return res.status(400).json({ status: "error", message: "Invalid amount" });
    }

    const reference = `dep_${crypto.randomUUID()}`;
    // 1. save a PENDING deposit row in your DB with this reference

    const r = await fetch(`${PAYSTACK}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: req.user.email, // must come from your auth middleware
        amount: Math.round(amountNaira * 100), // kobo, integer
        reference,
        callback_url: callbackUrl,
      }),
    });

    const data = await r.json();

    if (!r.ok || !data.status) {
      return res.status(502).json({ status: "error", message: "Could not start payment" });
    }

    res.json({
      status: "success",
      authorizationUrl: data.data.authorization_url,
      reference,
    });
  } catch (err) {
    next(err); // handled by your central error handler
  }
});

module.exports = { router, webhookHandler };