require("dotenv").config();

const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const routes = require('./routes/user.route');
const { router: paystackRouter, webhookHandler } = require('./routes/paystack.route');
const logger = require('./middleware/logger');
const cors = require('./middleware/cors');
const authenticate = require('./middleware/authentication');
const { Transaction } = require('../models');


const app = express();

app.set('trust proxy', 1);

app.use(cors);

// Paystack webhook: needs the RAW body, so it MUST come before express.json().
// It's server-to-server, so it doesn't depend on CORS.
app.post(
  "/webhooks/paystack",
  express.raw({ type: "application/json" }),
  webhookHandler
);

// 2 mb allows the base64 profile-picture upload; every other endpoint only
// ever sends small JSON bodies.
app.use(express.json({ limit: "2mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: {
    message: "Too many requests. Please try again later."
  }
});

app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.get('/', (req, res) => {
  res.json({
    "status": "success",
    "message": "Successful"
  });
});

// app.use(limiter)
app.use('/user', logger, routes);

// Public receipt status: safe because references are unguessable UUIDs and
// only status and amount are returned. Must come before the authenticated mount.
app.get('/payments/status/:reference', logger, async (req, res, next) => {
  try {
    const ref = req.params.reference;
    if (!/^dep_[0-9a-f-]{36}$/i.test(ref)) {
      return res.status(404).json({ status: 'error', message: 'Not found' });
    }
    const tx = await Transaction.findOne({ where: { reference: ref, type: 'deposit' } });
    if (!tx) {
      return res.status(404).json({ status: 'error', message: 'Not found' });
    }
    res.json({
      status: 'success',
      deposit: { reference: tx.reference, status: tx.status, amount: tx.amount },
    });
  } catch (err) {
    next(err);
  }
});

// Payments: authenticate sets req.user from the login token
app.use('/payments', logger, authenticate, paystackRouter);

// Centralised error handler (unchanged)
app.use((err, req, res, next) => {
  console.error(err);

  if (res.headersSent) {
    return next(err);
  }

  if (err && err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      status: "error",
      message: "Duplicate record"
    });
  }

  if (err && err.expose === true && err.status) {
    return res.status(err.status).json({
      status: "error",
      ...(err.code ? { code: err.code } : {}),
      message: err.message,
    });
  }

  return res.status(500).json({
    status: "error",
    message: "Something went wrong"
  });
});

module.exports = app;