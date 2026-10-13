"use strict";

const bcrypt = require("bcrypt");

require("dotenv").config({ quiet: true });

const SALT_ROUNDS = Number(process.env.SALT_ROUNDS) || 10;
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$/;

// True when a stored value is already a bcrypt hash.
const isHashed = (value) =>
  typeof value === "string" && BCRYPT_PATTERN.test(value);

// Hashes a four-digit transaction PIN for storage. PINs are never stored or
// logged in plaintext.
function hashPin(pin) {
  return bcrypt.hash(String(pin), SALT_ROUNDS);
}

// Verifies a candidate PIN against the stored value. Existing accounts may
// still hold a legacy plaintext PIN; those rows are accepted once and the
// caller can transparently upgrade them to a hash (needsRehash === true).
async function verifyPin(candidate, stored) {
  if (stored === null || stored === undefined || stored === "") {
    return { ok: false, needsRehash: false };
  }

  if (isHashed(stored)) {
    const ok = await bcrypt.compare(String(candidate), stored);
    return { ok, needsRehash: false };
  }

  const ok = String(candidate) === String(stored);
  return { ok, needsRehash: ok };
}

module.exports = { hashPin, verifyPin, isHashed };
