
const express = require("express");
const rateLimit = require("express-rate-limit");
const routes = require('./routes/user.route');
const logger = require('./middleware/logger');
const cors = require('./middleware/cors');

require("dotenv").config();

const app = express();

// Allow the configured frontend origin(s) to call the API. The URL is read
// from FRONTEND_URL at request time; it is never hardcoded here.
app.use(cors);

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


app.get('/', (req, res, next) => {
  res.json({
    "status": "success",
    "message": "Successful"
  })
  next()
});

// app.use(limiter)
app.use('/user', logger, routes);

// Centralised error handler (keeps errors out of individual routes and never
// leaks stack traces or database details to clients).
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

  // Errors explicitly marked as safe by application code carry their own
  // status and message; everything else stays a generic 500 so internal
  // details are never leaked.
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







