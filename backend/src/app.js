
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

app.use(express.json());

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

  return res.status(500).json({
    status: "error",
    message: "Something went wrong"
  });
});


module.exports = app;







