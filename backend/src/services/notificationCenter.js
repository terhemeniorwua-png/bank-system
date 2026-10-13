"use strict";

const db = require("../../models");

// Notification categories used across the application.
const TYPES = {
  CREDIT: "credit",
  DEBIT: "debit",
  DEPOSIT: "deposit",
  WITHDRAWAL: "withdrawal",
  FAILED: "failed",
  REVERSAL: "reversal",
  PIN_CREATED: "pin_created",
  PIN_CHANGED: "pin_changed",
  SECURITY_ALERT: "security_alert",
};

// Formats an integer NGN amount as "₦1,234.00" for notification copy. Falls
// back to a plain grouping if the runtime lacks full ICU data.
function formatNaira(amount) {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `NGN ${value.toFixed(2)}`;
  }
}

function displayName(user) {
  if (!user) return "a BBT Cash user";
  const name = user.name ? String(user.name).trim() : "";
  return name || "a BBT Cash user";
}

// Creates one notification. Idempotent when a dedupeKey is supplied: an
// existing row with the same key is returned instead of inserting a duplicate.
// The insert can participate in the caller's financial transaction so the
// notification and the money movement commit together.
async function createNotification(payload, { transaction } = {}) {
  const {
    userId,
    type,
    title,
    message,
    amount = null,
    reference = null,
    transactionId = null,
    metadata = null,
    dedupeKey = null,
  } = payload;

  if (dedupeKey) {
    const existing = await db.Notification.findOne({
      where: { dedupeKey },
      transaction,
    });
    if (existing) return existing;
  }

  return db.Notification.create(
    {
      userId,
      type,
      title,
      message,
      amount,
      reference,
      transactionId,
      metadata,
      dedupeKey,
    },
    { transaction }
  );
}

// Both sides of a transfer share the same underlying transactionId, so the
// dedupe key (per user + type) keeps a retried request from duplicating rows.
const transferDedupeKey = (transactionId, userId, type) =>
  `${transactionId}:${userId}:${type}`;

async function notifyTransferSuccess(
  { sender, receiver, amount, reference, transactionId },
  { transaction } = {}
) {
  await createNotification(
    {
      userId: sender.id,
      type: TYPES.DEBIT,
      title: "Transfer Successful",
      message: `Your transfer of ${formatNaira(amount)} to ${displayName(
        receiver
      )} was successful.`,
      amount,
      reference,
      transactionId,
      metadata: {
        direction: "debit",
        counterpartyName: displayName(receiver),
        accountNumber: sender.accountNumber,
      },
      dedupeKey: `${transactionId}:${sender.id}:${TYPES.DEBIT}`,
    },
    { transaction }
  );

  await createNotification(
    {
      userId: receiver.id,
      type: TYPES.CREDIT,
      title: "Money Received",
      message: `You received ${formatNaira(amount)} from ${displayName(sender)}.`,
      amount,
      reference,
      transactionId,
      metadata: {
        direction: "credit",
        counterpartyName: displayName(sender),
        accountNumber: receiver.accountNumber,
      },
      dedupeKey: `${transactionId}:${receiver.id}:${TYPES.CREDIT}`,
    },
    { transaction }
  );
}

// Deposit notification for the account owner. `method` is a short label such
// as "Bank transfer" or "Card".
async function notifyDeposit(
  { user, amount, reference = null, transactionId = null, method = "Deposit" },
  { transaction } = {}
) {
  return createNotification(
    {
      userId: user.id,
      type: TYPES.DEPOSIT,
      title: "Deposit Successful",
      message: `${formatNaira(amount)} has been deposited into your account.`,
      amount,
      reference,
      transactionId,
      metadata: { method },
      dedupeKey: transactionId ? `${transactionId}:${user.id}:deposit` : null,
    },
    { transaction }
  );
}

// Withdrawal notification for the account owner.
async function notifyWithdrawal(
  { user, amount, reference = null, transactionId = null, method = "ATM" },
  { transaction } = {}
) {
  return createNotification(
    {
      userId: user.id,
      type: TYPES.WITHDRAWAL,
      title: "Withdrawal Successful",
      message: `Your withdrawal of ${formatNaira(amount)} was successful.`,
      amount,
      reference,
      transactionId,
      metadata: { method },
      dedupeKey: transactionId ? `${transactionId}:${user.id}:withdrawal` : null,
    },
    { transaction }
  );
}

// A failed operation notifies the initiator. This never creates a
// success-looking credit/debit notification.
async function notifyFailed(
  { user, amount = null, reference = null, reason = "the transaction could not be completed" },
  { transaction } = {}
) {
  const amountText = amount ? `${formatNaira(amount)} ` : "";
  return createNotification(
    {
      userId: user.id,
      type: TYPES.FAILED,
      title: "Transaction Failed",
      message: `Your transfer ${amountText}failed because ${reason}.`,
      amount,
      reference,
      metadata: { reason },
      dedupeKey: reference ? `${user.id}:failed:${reference}` : null,
    },
    { transaction },
  );
}

// Debit notification for an airtime purchase. Type "debit" so it appears in
// the existing Debit filter; the service details live in metadata.
async function notifyAirtimeDebit(
  { user, amount, network, phone, reference = null, transactionId },
  { transaction } = {}
) {
  return createNotification(
    {
      userId: user.id,
      type: TYPES.DEBIT,
      title: "Airtime Purchase Successful",
      message: `Your account has been debited ${formatNaira(
        amount
      )} for a ${network} airtime purchase to ${phone}.`,
      amount,
      reference,
      transactionId,
      metadata: { serviceType: "airtime", network, phone },
      dedupeKey: `${transactionId}:${user.id}:airtime`,
    },
    { transaction }
  );
}

// Debit notification for a data bundle purchase.
async function notifyDataDebit(
  { user, amount, network, planName, allowance, phone, reference = null, transactionId },
  { transaction } = {}
) {
  const bundle = allowance ? `${network} ${allowance} (${planName})` : `${network} ${planName}`;
  return createNotification(
    {
      userId: user.id,
      type: TYPES.DEBIT,
      title: "Data Purchase Successful",
      message: `Your account has been debited ${formatNaira(
        amount
      )} for a ${bundle} data bundle to ${phone}.`,
      amount,
      reference,
      transactionId,
      metadata: { serviceType: "data", network, planName, allowance, phone },
      dedupeKey: `${transactionId}:${user.id}:data`,
    },
    { transaction }
  );
}

// Debit notification for a bill payment.
async function notifyBillDebit(
  { user, amount, category, provider, customerRef, reference = null, transactionId },
  { transaction } = {}
) {
  const categoryLabel = category ? String(category).replace(/-/g, " ") : "bill";
  return createNotification(
    {
      userId: user.id,
      type: TYPES.DEBIT,
      title: "Bill Payment Successful",
      message: `Your account has been debited ${formatNaira(
        amount
      )} for your ${categoryLabel} bill payment${
        provider ? ` to ${provider}` : ""
      }.`,
      amount,
      reference,
      transactionId,
      metadata: { serviceType: "bill", category, provider, customerRef },
      dedupeKey: `${transactionId}:${user.id}:bill`,
    },
    { transaction }
  );
}

// Reversal/refund notification. Created when money that was reserved for a
// payment is returned to the user.
async function notifyPaymentReversal(
  { user, amount, reference = null, transactionId = null, reason = "the payment could not be completed" },
  { transaction } = {}
) {
  return createNotification(
    {
      userId: user.id,
      type: TYPES.REVERSAL,
      title: "Payment Reversed",
      message: `Your account has been refunded ${formatNaira(
        amount
      )} because ${reason}.`,
      amount,
      reference,
      transactionId,
      metadata: { event: "reversal", reason },
      dedupeKey: transactionId ? `${transactionId}:${user.id}:reversal` : null,
    },
    { transaction }
  );
}

// Failure notification for a payment that never resulted in a successful
// debit. Deliberately distinct from notifyFailed (transfer copy).
async function notifyPaymentFailed(
  { user, amount = null, service = "payment", reference = null, reason = "the payment could not be completed" },
  { transaction } = {}
) {
  const amountText = amount ? `${formatNaira(amount)} ` : "";
  return createNotification(
    {
      userId: user.id,
      type: TYPES.FAILED,
      title: "Payment Failed",
      message: `Your ${service} ${amountText}failed because ${reason}.`,
      amount,
      reference,
      metadata: { reason, service },
      dedupeKey: reference ? `${user.id}:payment_failed:${reference}` : null,
    },
    { transaction }
  );
}

async function notifyPinCreated(user, { transaction } = {}) {
  return createNotification(
    {
      userId: user.id,
      type: TYPES.PIN_CREATED,
      title: "Transaction PIN Created",
      message: "Your transaction PIN has been created successfully.",
      metadata: { event: "pin_created" },
    },
    { transaction }
  );
}

async function notifyPinChanged(user, { transaction } = {}) {
  return createNotification(
    {
      userId: user.id,
      type: TYPES.PIN_CHANGED,
      title: "Transaction PIN Changed",
      message:
        "Your transaction PIN was changed successfully. If you did not make this change, secure your account immediately.",
      metadata: { event: "pin_changed" },
    },
    { transaction }
  );
}

async function notifySecurityAlert(user, detail, { transaction } = {}) {
  return createNotification(
    {
      userId: user.id,
      type: TYPES.SECURITY_ALERT,
      title: "Security Alert",
      message:
        detail ||
        "We detected repeated failed attempts to verify your transaction PIN. If this was not you, secure your account immediately.",
      metadata: { event: "security_alert" },
      dedupeKey: `security_alert:${user.id}:${new Date().toISOString().slice(0, 13)}`,
    },
    { transaction }
  );
}

// Alerts the account owner when someone enters the wrong password for their
// account. Deduplicated per user per hour so repeated guesses cannot flood the
// notification feed.
async function notifyLoginAttempt(user, { transaction } = {}) {
  return createNotification(
    {
      userId: user.id,
      type: TYPES.SECURITY_ALERT,
      title: "Failed Login Attempt",
      message:
        "Someone entered an incorrect password for your account. If this was not you, change your password immediately.",
      metadata: { event: "login_attempt" },
      dedupeKey: `login_attempt:${user.id}:${new Date().toISOString().slice(0, 13)}`,
    },
    { transaction }
  );
}

module.exports = {
  TYPES,
  formatNaira,
  displayName,
  createNotification,
  notifyTransferSuccess,
  notifyDeposit,
  notifyWithdrawal,
  notifyFailed,
  notifyAirtimeDebit,
  notifyDataDebit,
  notifyBillDebit,
  notifyPaymentReversal,
  notifyPaymentFailed,
  notifyPinCreated,
  notifyPinChanged,
  notifySecurityAlert,
  notifyLoginAttempt,
};
