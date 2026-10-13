"use strict";

// Simple, dependency-free CORS middleware.
//
// Allowed origins come from the FRONTEND_URL environment variable so the
// frontend URL is never hardcoded in source. One or more origins may be
// supplied, comma-separated, and any path (e.g. a /login route) is reduced to
// its origin. Requests with no Origin header (server-to-server, curl, tests)
// are passed through untouched.
function parseAllowedOrigins(raw) {
  return String(raw || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return value;
      }
    });
}

function cors(req, res, next) {
  const origin = req.headers.origin;
  const allowedOrigins = parseAllowedOrigins(process.env.FRONTEND_URL);

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
}

module.exports = cors;
