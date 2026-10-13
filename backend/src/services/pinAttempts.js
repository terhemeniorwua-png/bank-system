"use strict";

// Lightweight, dependency-free tracker for failed PIN verification attempts.
// The project does not use Redis, so a process-local counter with a rolling
// window is used. This is sufficient to stop rapid brute-force guessing on a
// single instance; a shared store would be required behind a load balancer.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

const failures = new Map(); // userId -> { count, firstAt }

function currentRecord(userId) {
  const record = failures.get(userId);
  if (record && Date.now() - record.firstAt > WINDOW_MS) {
    failures.delete(userId);
    return null;
  }
  return record || null;
}

// Returns whether the user is temporarily locked out of PIN verification.
function check(userId) {
  const record = currentRecord(userId);
  if (!record || record.count < MAX_FAILURES) {
    return { locked: false, retryAfterMs: 0 };
  }
  return {
    locked: true,
    retryAfterMs: Math.max(0, WINDOW_MS - (Date.now() - record.firstAt)),
  };
}

function recordFailure(userId) {
  const record = currentRecord(userId);
  if (!record) {
    failures.set(userId, { count: 1, firstAt: Date.now() });
    return 1;
  }
  record.count += 1;
  return record.count;
}

function reset(userId) {
  failures.delete(userId);
}

function resetAll() {
  failures.clear();
}

module.exports = { check, recordFailure, reset, resetAll, MAX_FAILURES, WINDOW_MS };
