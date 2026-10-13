const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const db = require("../../models");
const emailService = require("../services/email");
const notifications = require("../services/notifications");
const notificationCenter = require("../services/notificationCenter");

require("dotenv").config({ quiet: true });

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ACCOUNT_NUMBER_RETRIES = 5;

const httpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const safeDeliveryMessage = (error) => {
  const raw = (error && error.message) || String(error);
  return raw.slice(0, 300);
};

// Cryptographically secure 10-digit account number. Never derived from the
// database row id, so it cannot be guessed from account creation order.
const generateAccountNumber = () => {
  let number = "";
  for (let i = 0; i < 10; i += 1) {
    number += crypto.randomInt(0, 10);
  }
  return number;
};

// Six-digit numeric verification code, preserving leading zeros (e.g. "004512").
const generateCode = () => {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += crypto.randomInt(0, 10);
  }
  return code;
};

const hashCode = (code) =>
  crypto.createHash("sha256").update(String(code)).digest("hex");

const hashesMatch = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
};

// Signup initiation. Validates the input, stores a hashed six-digit code for a
// pending (not yet created) account, and emails the code.
const signup = async (req, res) => {
  const { name, email, password } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();

  const existing = await db.User.findOne({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({
      status: "error",
      message: "Email already registered",
    });
  }

  const passwordHash = await bcrypt.hash(
    password,
    Number(process.env.SALT_ROUNDS) || 10
  );

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  // Store the pending signup atomically with a unique email to prevent
  // concurrent signups from creating more than one pending record.
  try {
    await db.EmailVerification.create({
      email: normalizedEmail,
      codeHash: hashCode(code),
      data: {
        name,
        phone: null,
        passwordHash,
      },
      expiresAt,
      attempts: 0,
      lastSentAt: new Date(),
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      const existingPending = await db.EmailVerification.findOne({
        where: { email: normalizedEmail },
      });
      if (existingPending) {
        existingPending.set({
          codeHash: hashCode(code),
          data: { name, phone: null, passwordHash },
          expiresAt,
          attempts: 0,
          usedAt: null,
          lastSentAt: new Date(),
        });
        await existingPending.save();
      }
    } else {
      throw error;
    }
  }

  try {
    await emailService.sendVerificationEmail({
      to: normalizedEmail,
      name,
      code,
    });
  } catch (error) {
    const message = safeDeliveryMessage(error);
    console.error(
      `[email] verification delivery failed for ${normalizedEmail}: ${message}`
    );
    // No pending record survives a failed send so the user can retry signup.
    await db.EmailVerification.destroy({ where: { email: normalizedEmail } });
    return res.status(502).json({
      status: "error",
      message: "We could not send your verification email. Please try again.",
    });
  }

  return res.status(200).json({
    status: "success",
    message: "A verification code has been sent to your email.",
    email: normalizedEmail,
  });
};

// Verify a submitted code. On success the user account and banking account are
// created atomically and the verification record is invalidated.
const verifyEmail = async (req, res) => {
  const { email, code } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();

  const alreadyRegistered = await db.User.findOne({
    where: { email: normalizedEmail },
  });
  if (alreadyRegistered) {
    return res.status(409).json({
      status: "error",
      message: "Email already registered",
    });
  }

  const record = await db.EmailVerification.findOne({
    where: { email: normalizedEmail },
  });

  if (!record) {
    return res.status(400).json({
      status: "error",
      message: "Invalid or expired verification code",
    });
  }

  if (record.usedAt || record.expiresAt.getTime() < Date.now()) {
    await record.destroy();
    return res.status(400).json({
      status: "error",
      message: "Invalid or expired verification code",
    });
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await record.destroy();
    return res.status(429).json({
      status: "error",
      message: "Too many verification attempts. Please request a new code.",
    });
  }

  if (!hashesMatch(hashCode(code), record.codeHash)) {
    record.attempts += 1;
    if (record.attempts >= MAX_ATTEMPTS) {
      await record.destroy();
      return res.status(429).json({
        status: "error",
        message: "Too many verification attempts. Please request a new code.",
      });
    }
    await record.save();
    return res.status(400).json({
      status: "error",
      message: "Invalid verification code",
    });
  }

  let user;
  try {
    await db.sequelize.transaction(async (transaction) => {
      const locked = await db.EmailVerification.findOne({
        where: { email: normalizedEmail },
        lock: transaction.LOCK.UPDATE,
        transaction,
      });

      if (
        !locked ||
        locked.usedAt ||
        locked.expiresAt.getTime() < Date.now() ||
        locked.attempts >= MAX_ATTEMPTS ||
        !hashesMatch(hashCode(code), locked.codeHash)
      ) {
        throw httpError(400, "Invalid or expired verification code");
      }

      // Invalidate the single-use code inside the transaction.
      await locked.destroy({ transaction });
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        status: "error",
        message: error.message,
      });
    }
    throw error;
  }

  // Create the user outside the transaction so an account-number collision can
  // be retried with a freshly generated number.
  try {
    user = await createVerifiedUser(record.data, normalizedEmail);
  } catch (error) {
    console.error(
      `[auth] account creation failed for ${normalizedEmail}: ${safeDeliveryMessage(error)}`
    );
    throw httpError(500, "Unable to create your account. Please try again.");
  }

  // The account-creation confirmation email is a notification, not the
  // mechanism that creates the account. A delivery failure never rolls back
  // the committed account; the outbox records status so it can be retried.
  let confirmationEmailStatus = "failed";
  try {
    const notification = await notifications.deliverAccountCreatedEmail(
      user,
      normalizedEmail
    );
    confirmationEmailStatus =
      notification.status === "sent" ? "sent" : "failed";
  } catch (notificationError) {
    console.error(
      `[email] notification record failed for ${normalizedEmail}: ${safeDeliveryMessage(notificationError)}`
    );
  }

  return res.status(200).json({
    status: "success",
    message: "Account created successfully",
    user: {
      name: user.name,
      email: user.email,
      accountNumber: user.accountNumber,
      accountType: user.role,
    },
    emailVerified: true,
    confirmationEmail: confirmationEmailStatus,
  });
};

// Create the user with a unique, collision-retried account number.
async function createVerifiedUser(pendingData, email) {
  const name = pendingData.name;
  const passwordHash = pendingData.passwordHash;
  const phone = pendingData.phone || null;

  for (let attempt = 0; attempt < MAX_ACCOUNT_NUMBER_RETRIES; attempt += 1) {
    try {
      return await db.User.create({
        name,
        email,
        phone,
        role: "user",
        password: passwordHash,
        accountNumber: generateAccountNumber(),
        amount: 0,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      });
    } catch (error) {
      if (error.name === "SequelizeUniqueConstraintError") {
        const byEmail = await db.User.findOne({ where: { email } });
        if (byEmail) {
          return byEmail;
        }
        continue;
      }
      throw error;
    }
  }

  throw httpError(500, "Unable to assign a unique account number.");
}

// Resend a verification code for a pending signup, respecting a cooldown.
const resendVerification = async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();

  const record = await db.EmailVerification.findOne({
    where: { email: normalizedEmail },
  });

  if (!record) {
    return res.status(400).json({
      status: "error",
      message: "No pending verification found for this email",
    });
  }

  if (record.usedAt || record.expiresAt.getTime() < Date.now()) {
    await record.destroy();
    return res.status(400).json({
      status: "error",
      message: "No pending verification found for this email",
    });
  }

  const now = Date.now();
  const lastSent = record.lastSentAt ? record.lastSentAt.getTime() : 0;
  const waitMs = lastSent + RESEND_COOLDOWN_MS - now;
  if (waitMs > 0) {
    const seconds = Math.ceil(waitMs / 1000);
    return res.status(429).json({
      status: "error",
      message: `Please wait ${seconds} second${seconds === 1 ? "" : "s"} before requesting another code.`,
    });
  }

  const code = generateCode();
  const expiresAt = new Date(now + CODE_TTL_MS);

  try {
    await emailService.sendVerificationEmail({
      to: normalizedEmail,
      name: (record.data && record.data.name) || "",
      code,
    });
  } catch (error) {
    const message = safeDeliveryMessage(error);
    console.error(
      `[email] verification resend failed for ${normalizedEmail}: ${message}`
    );
    return res.status(502).json({
      status: "error",
      message: "We could not send your verification email. Please try again.",
    });
  }

  record.codeHash = hashCode(code);
  record.expiresAt = expiresAt;
  record.attempts = 0;
  record.usedAt = null;
  record.lastSentAt = new Date();
  await record.save();

  return res.status(200).json({
    status: "success",
    message: "A new verification code has been sent.",
    email: normalizedEmail,
  });
};

// User Login
const login = async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();

  const getUser = await db.User.findOne({ where: { email: normalizedEmail } });

  if (!getUser) {
    // A pending (unverified) signup should tell the user to verify rather than
    // report invalid credentials.
    const pending = await db.EmailVerification.findOne({
      where: { email: normalizedEmail },
    });

    if (pending && pending.data && pending.data.passwordHash) {
      const matchesPendingPassword = await bcrypt.compare(
        password,
        pending.data.passwordHash
      );
      if (matchesPendingPassword) {
        return res.status(403).json({
          status: "error",
          message: "Please verify your email before logging in.",
        });
      }
    }

    return res.status(401).json({
      status: "error",
      message: "Invalid email or password",
    });
  }

  if (!getUser.emailVerified) {
    return res.status(403).json({
      status: "error",
      message: "Please verify your email before logging in.",
    });
  }

  const isPasswordCorrect = await bcrypt.compare(password, getUser.password);

  if (!isPasswordCorrect) {
    // Alert the real account owner that someone failed to authenticate as them.
    // Never let a notification problem affect the login response.
    await notificationCenter.notifyLoginAttempt(getUser).catch(() => {});

    return res.status(401).json({
      status: "error",
      message: "Invalid email or password",
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      status: "error",
      message: "Token is not configured",
    });
  }

  const token = jwt.sign(
    {
      id: getUser.id,
      name: getUser.name,
      email: getUser.email,
      role: getUser.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRING_TIME,
    }
  );

  return res.status(200).json({
    status: "success",
    message: "Login successful",
    details: {
      id: getUser.id,
      name: getUser.name,
      email: getUser.email,
      accountNum: getUser.accountNumber,
      role: getUser.role,
      token,
    },
  });
};

// Authenticated user profile.
const me = async (req, res) => {
  const user = await db.User.findByPk(req.user.id);

  if (!user) {
    return res.status(404).json({
      status: "error",
      message: "User not found",
    });
  }

  return res.status(200).json({
    status: "success",
    user: { ...user.toSafeJSON(), hasPin: Boolean(user.pin) },
  });
};

module.exports = {
  signup,
  verifyEmail,
  resendVerification,
  login,
  me,
  generateAccountNumber,
  generateCode,
  hashCode,
  hashesMatch,
};