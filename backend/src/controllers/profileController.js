const db = require("../../models");
const { verifyPin } = require("../services/pin");
const pinAttempts = require("../services/pinAttempts");
const notificationCenter = require("../services/notificationCenter");

// Decoded avatar size ceiling (bytes). The zod validator already caps the
// base64 string length; this is defence in depth.
const MAX_AVATAR_BYTES = 1024 * 1024;

// Update the authenticated user's profile picture. The image is sent as a
// base64 data URL so no multipart handling or file storage service is needed.
// Clients are expected to downscale/compress the photo before uploading.
const updateAvatar = async (req, res) => {
  const { avatar } = req.body;

  const base64 = avatar.slice(avatar.indexOf(",") + 1);
  const bytes = Buffer.byteLength(base64, "base64");

  if (bytes > MAX_AVATAR_BYTES) {
    return res.status(413).json({
      status: "error",
      message: "Image is too large. Please choose a photo under 1 MB.",
    });
  }

  const user = await db.User.findByPk(req.user.id);

  if (!user) {
    return res.status(404).json({
      status: "error",
      message: "Account not found",
    });
  }

  user.avatar = avatar;
  await user.save();

  return res.status(200).json({
    status: "success",
    message: "Profile picture updated successfully.",
    user: user.toSafeJSON(),
  });
};

// Remove the authenticated user's profile picture.
const removeAvatar = async (req, res) => {
  const user = await db.User.findByPk(req.user.id);

  if (!user) {
    return res.status(404).json({
      status: "error",
      message: "Account not found",
    });
  }

  user.avatar = null;
  await user.save();

  return res.status(200).json({
    status: "success",
    message: "Profile picture removed.",
    user: user.toSafeJSON(),
  });
};

// Verify the authenticated user's current transaction PIN without changing
// anything. Used by the step-by-step PIN reset flow to unlock the "new PIN"
// step. Shares the same failure counter and lockout as changePin so brute
// force protection applies across the whole flow.
const verifyCurrentPin = async (req, res) => {
  const { pin } = req.body;

  const user = await db.User.findByPk(req.user.id);

  if (!user) {
    return res.status(404).json({
      status: "error",
      message: "Account not found",
    });
  }

  if (!user.pin) {
    return res.status(409).json({
      status: "error",
      message: "You have not created a transaction PIN yet",
    });
  }

  const lock = pinAttempts.check(user.id);
  if (lock.locked) {
    const minutes = Math.ceil(lock.retryAfterMs / 60000);
    return res.status(429).json({
      status: "error",
      message: `Too many failed PIN attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    });
  }

  const { ok } = await verifyPin(pin, user.pin);

  if (!ok) {
    pinAttempts.recordFailure(user.id);

    try {
      await notificationCenter.notifySecurityAlert(
        user,
        "Someone tried to reset your transaction PIN but entered the wrong current PIN. If this was not you, secure your account immediately."
      );
    } catch {
      // Ignore notification errors.
    }

    return res.status(400).json({
      status: "error",
      message: "Your current PIN is incorrect",
    });
  }

  pinAttempts.reset(user.id);

  return res.status(200).json({
    status: "success",
    message: "PIN verified successfully.",
  });
};

module.exports = { updateAvatar, removeAvatar, verifyCurrentPin };
