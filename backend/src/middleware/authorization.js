const jwt = require("jsonwebtoken");
const db = require("../../models");
const { verifyPin, isHashed, hashPin } = require("../services/pin");

// Verify the bearer token, confirm the caller's role, and check the supplied
// transaction PIN against the value stored in the database. On success the
// decoded token is attached as req.user and the current user row as
// req.userRecord.
async function authorizeWithPin(req, res, requiredRole) {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Access denied. No token provided." });
    return false;
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    res.status(401).json({ message: "Invalid or expired token." });
    return false;
  }

  const user = await db.User.findByPk(decoded.id);

  if (!user) {
    res.status(401).json({ message: "Invalid or expired token." });
    return false;
  }

  if (requiredRole && user.role !== requiredRole) {
    res.status(400).json({
      message:
        requiredRole === "admin"
          ? "Access denied, only Admin."
          : "Access denied, only user.",
    });
    return false;
  }

  const { pin } = req.body || {};

  if (!pin) {
    res.status(400).json({ message: "PIN is required in request body." });
    return false;
  }

  const { ok } = await verifyPin(pin, user.pin);

  if (!ok) {
    res.status(400).json({ message: "Invalid PIN." });
    return false;
  }

  // Transparently upgrade any legacy plaintext PIN to a bcrypt hash.
  if (user.pin && !isHashed(user.pin)) {
    user.pin = await hashPin(pin);
    await user.save();
  }

  req.user = decoded;
  req.userRecord = user;
  return true;
}

const userAuthorization = async (req, res, next) => {
  const authorized = await authorizeWithPin(req, res, "user");
  if (authorized) next();
};

const adminAuthorization = async (req, res, next) => {
  const authorized = await authorizeWithPin(req, res, "admin");
  if (authorized) next();
};

module.exports = {
  authorizeWithPin,
  userAuthorization,
  adminAuthorization,
};
