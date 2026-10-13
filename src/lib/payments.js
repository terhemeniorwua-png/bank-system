// Shared helpers for the payment flows (airtime, data, bills).

// Generates a client-side idempotency reference. Reused across retries of the
// same attempt so a double submit can never charge the account twice.
export function newReference(prefix = "PAY") {
  let rand;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    rand = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  } else {
    rand = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand.toUpperCase()}`;
}

// Nigerian mobile number: 0XXXXXXXXXX or 234XXXXXXXXXX.
export function isValidNgPhone(value) {
  const digits = String(value || "").replace(/\s|-/g, "");
  return /^(?:0\d{10}|234\d{10})$/.test(digits);
}

export function normalizePhone(value) {
  const digits = String(value || "").replace(/\s|-/g, "");
  if (/^234\d{10}$/.test(digits)) return `0${digits.slice(3)}`;
  return digits;
}
