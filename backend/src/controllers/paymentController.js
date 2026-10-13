"use strict";

const db = require("../../models");
const notificationCenter = require("../services/notificationCenter");
const emailOutbox = require("../services/notifications");
const paymentProvider = require("../services/paymentProvider");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REFERENCE_PATTERN = /^[A-Za-z0-9-]{6,64}$/;
const PHONE_PATTERN = /^(?:0\d{10}|234\d{10})$/;

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  // Marks the message as safe to return to the client (see app.js handler).
  error.expose = true;
  if (code) error.code = code;
  return error;
}

// Converts "1234", 1234 or "1,234.00" into an integer NGN amount. Rejects
// non-integers, negatives and NaN. Money is never handled as a float.
function toIntegerAmount(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function normalizePhone(raw) {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/\s|-/g, "");
  if (!PHONE_PATTERN.test(digits)) return null;
  return digits.startsWith("234") ? `0${digits.slice(3)}` : digits;
}

// A client may supply its own idempotency reference; otherwise a unique,
// readable server reference is generated. The transactions.reference column is
// unique, which is what makes duplicate submissions safe.
function buildReference(prefix, raw) {
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    const value = String(raw).trim();
    if (!REFERENCE_PATTERN.test(value)) {
      throw httpError(400, "Invalid transaction reference");
    }
    return value;
  }

  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

function serializeTransaction(record) {
  return {
    id: record.id,
    type: record.type,
    status: record.status,
    amount: record.amount,
    fee: record.fee,
    reference: record.reference,
    providerReference: record.providerReference,
    metadata: record.metadata || null,
    createdAt: record.createdAt,
  };
}

function bodyFor(message, record, extra = {}) {
  return {
    status: record.status,
    message,
    paymentMode: paymentProvider.mode,
    simulated: true,
    transaction: serializeTransaction(record),
    ...extra,
  };
}

function successBody(message, record, extra = {}) {
  return bodyFor(message, record, extra);
}

// Returns the stored outcome for an idempotent replay, preserving the real
// status (success / pending / failed) instead of always claiming success.
function respondWithRecord(res, record, extra = {}) {
  if (record.status === "pending") {
    return res
      .status(202)
      .json(bodyFor("Payment is pending provider confirmation.", record, extra));
  }
  if (record.status === "failed") {
    return res
      .status(402)
      .json(bodyFor("This payment previously failed.", record, extra));
  }
  return res.status(200).json(bodyFor("Payment already processed", record, extra));
}

// ---------------------------------------------------------------------------
// Core payment pipeline shared by airtime, data and bills.
//
//   1. debit and reserve within a locked transaction (balance rows are locked
//      with SELECT ... FOR UPDATE so concurrent requests cannot overspend)
//   2. execute with the provider (simulated)
//   3. on success, mark success + write the debit notification
//      on failure, refund and write reversal/failure notifications
//   4. email after the database transaction has committed
// ---------------------------------------------------------------------------
async function processPayment(req, res, options) {
  const { kind, prefix, service, recipient, amount, fee = 0, metadata } = options;

  const total = Number(amount) + Number(fee);
  if (!Number.isInteger(total) || total <= 0) {
    throw httpError(400, "Invalid amount");
  }

  const user = await db.User.findByPk(req.user.id);
  if (!user) throw httpError(404, "Account not found");

  // Defence in depth: middleware already requires a PIN, but never allow a
  // PIN-less account to move money.
  if (!user.pin) {
    return res.status(403).json({
      status: "error",
      code: "PIN_SETUP_REQUIRED",
      message: "Please create your transaction PIN to continue.",
    });
  }

  const reference = buildReference(prefix, req.body.reference);

  // Fast idempotency check: an already-processed reference returns the original
  // result instead of charging again.
  const existing = await db.Transaction.findOne({ where: { reference } });
  if (existing) {
    if (existing.senderId !== user.id || existing.type !== kind) {
      return res.status(409).json({
        status: "error",
        message: "Duplicate transaction reference",
      });
    }
    return respondWithRecord(res, existing, { idempotent: true });
  }

  // Reserve funds and create the pending transaction atomically.
  let record;
  try {
    record = await db.sequelize.transaction(async (transaction) => {
      const locked = await db.User.findByPk(user.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (locked.amount < total) {
        throw httpError(400, "Insufficient balance");
      }

      locked.amount -= total;
      await locked.save({ transaction });

      return db.Transaction.create(
        {
          type: kind,
          status: "pending",
          amount: total,
          fee: Number(fee) || 0,
          reference,
          senderId: locked.id,
          senderAccountNumber: locked.accountNumber,
          receiverAccountNumber: null,
          metadata,
        },
        { transaction }
      );
    });
  } catch (error) {
    // Two concurrent requests with the same reference: one insert wins, the
    // other hits the unique index. Return the winner's result.
    if (error.name === "SequelizeUniqueConstraintError") {
      const duplicate = await db.Transaction.findOne({ where: { reference } });
      if (duplicate && duplicate.senderId === user.id) {
        return respondWithRecord(res, duplicate, { idempotent: true });
      }
      return res.status(409).json({
        status: "error",
        message: "Duplicate transaction reference",
      });
    }

    if (error.status) {
      return res.status(error.status).json({
        status: "error",
        ...(error.code ? { code: error.code } : {}),
        message: error.message,
      });
    }

    throw error;
  }

  // Execute with the provider (simulated). Any thrown error is treated as a
  // failure so reserved funds are always returned.
  let result;
  try {
    result = await paymentProvider.executePayment({
      kind,
      providerId: metadata && metadata.providerId,
      recipient,
      amount: total,
      reference,
      metadata,
    });
  } catch {
    result = { status: "failed", reason: "provider_error" };
  }

  if (result.status === "success") {
    await db.sequelize.transaction(async (transaction) => {
      record.status = "success";
      record.providerReference = result.providerReference || null;
      await record.save({ transaction });

      if (kind === "airtime") {
        await notificationCenter.notifyAirtimeDebit(
          {
            user,
            amount: total,
            network: metadata.network,
            phone: metadata.phone,
            reference,
            transactionId: record.id,
          },
          { transaction }
        );
      } else if (kind === "data") {
        await notificationCenter.notifyDataDebit(
          {
            user,
            amount: total,
            network: metadata.network,
            planName: metadata.planName,
            allowance: metadata.allowance,
            phone: metadata.phone,
            reference,
            transactionId: record.id,
          },
          { transaction }
        );
      } else {
        await notificationCenter.notifyBillDebit(
          {
            user,
            amount: total,
            category: metadata.category,
            provider: metadata.providerName,
            customerRef: metadata.customerRef,
            reference,
            transactionId: record.id,
          },
          { transaction }
        );
      }
    });

    // Email is delivered only after the payment has committed. deliverBrandedEmail
    // never throws, so an email failure can never repeat or reverse a payment.
    await emailOutbox
      .deliverBrandedEmail({
        userId: user.id,
        toEmail: user.email,
        type: kind,
        subject: "Debit Alert \u2014 BBT Cash",
        heading: options.emailHeading,
        greetingName: user.name,
        paragraphs: options.emailParagraphs,
        details: [
          { label: "Amount", value: notificationCenter.formatNaira(total) },
          { label: "Reference", value: reference },
          ...(options.emailDetails || []),
        ],
      })
      .catch(() => {});

    return res
      .status(200)
      .json(successBody(options.successMessage, record));
  }

  if (result.status === "pending") {
    record.providerReference = result.providerReference || null;
    await record.save();

    return res.status(202).json({
      status: "pending",
      message:
        "Your payment is pending provider confirmation. You will be notified once it is completed.",
      paymentMode: paymentProvider.mode,
      simulated: true,
      transaction: serializeTransaction(record),
    });
  }

  // Failed: return the reserved funds and record the reversal in one atomic
  // step. No successful debit notification is ever created for a failure.
  await db.sequelize.transaction(async (transaction) => {
    const locked = await db.User.findByPk(user.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    locked.amount += total;
    await locked.save({ transaction });

    record.status = "failed";
    record.providerReference = result.providerReference || null;
    await record.save({ transaction });

    await notificationCenter.notifyPaymentReversal(
      {
        user: locked,
        amount: total,
        reference,
        transactionId: record.id,
        reason: "the payment could not be completed",
      },
      { transaction }
    );

    await notificationCenter.notifyPaymentFailed(
      {
        user: locked,
        amount: total,
        service,
        reference,
        reason: "the payment could not be completed",
      },
      { transaction }
    );
  });

  return res.status(402).json({
    status: "failed",
    message: "Payment failed. Your account has been refunded.",
    paymentMode: paymentProvider.mode,
    simulated: true,
    transaction: serializeTransaction(record),
  });
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------
const getBillCategories = async (req, res) => {
  return res.status(200).json({
    status: "success",
    paymentMode: paymentProvider.mode,
    simulated: true,
    categories: paymentProvider.getBillCategories(),
  });
};

const getBillProviders = async (req, res) => {
  const category = String(req.query.category || "");
  const providers = paymentProvider.getBillProviders(category);

  if (!providers) {
    return res.status(404).json({
      status: "error",
      message: "Unknown bill category",
    });
  }

  return res.status(200).json({
    status: "success",
    paymentMode: paymentProvider.mode,
    simulated: true,
    category,
    providers,
  });
};

// Simulated customer/meter validation. Never required before payment, but
// useful for confirming the identifier format.
const validateBillCustomerController = async (req, res) => {
  const { category, provider, customerRef } = req.body;

  const providerRecord = paymentProvider.getBillProvider(category, provider);
  if (!providerRecord) {
    return res.status(404).json({
      status: "error",
      message: "Unknown bill provider",
    });
  }

  const result = await paymentProvider.validateBillCustomer({ customerRef });

  if (!result.valid) {
    return res.status(404).json({
      status: "error",
      message:
        result.reason === "customer_not_found"
          ? "Customer could not be found for the supplied details"
          : "Invalid customer details",
      simulated: true,
    });
  }

  return res.status(200).json({
    status: "success",
    paymentMode: paymentProvider.mode,
    simulated: true,
    customer: {
      name: result.customerName,
      reference: result.customerRef,
    },
  });
};

const payBill = async (req, res) => {
  const { category, provider, customerRef, planId } = req.body;

  const providerRecord = paymentProvider.getBillProvider(category, provider);
  if (!providerRecord) {
    throw httpError(404, "Unknown bill provider");
  }

  const normalizedRef = String(customerRef).trim();

  let amount;
  let plan = null;

  if (providerRecord.amountMode === "fixed") {
    plan = (providerRecord.plans || []).find((p) => p.id === planId);
    if (!plan) {
      throw httpError(400, "Please select a valid plan");
    }
    amount = plan.price;
  } else {
    amount = toIntegerAmount(req.body.amount);
    if (amount === null) {
      throw httpError(400, "Please enter a valid amount");
    }
    if (amount < providerRecord.min || amount > providerRecord.max) {
      throw httpError(
        400,
        `Amount must be between ${providerRecord.min} and ${providerRecord.max}`
      );
    }
  }

  const metadata = {
    serviceType: "bill",
    category,
    providerId: providerRecord.id,
    providerName: providerRecord.name,
    customerRef: normalizedRef,
    planId: plan ? plan.id : null,
    planName: plan ? plan.name : null,
  };

  return processPayment(req, res, {
    kind: "bill",
    prefix: "BIL",
    service: "bill payment",
    recipient: normalizedRef,
    amount,
    metadata,
    successMessage: "Bill payment successful",
    emailHeading: "Bill Payment Successful",
    emailParagraphs: [
      `Your ${providerRecord.name} bill payment of ${notificationCenter.formatNaira(
        amount
      )} was successful.`,
    ],
    emailDetails: [
      { label: "Provider", value: providerRecord.name },
      { label: "Customer Ref", value: normalizedRef },
      ...(plan ? [{ label: "Plan", value: plan.name }] : []),
    ],
  });
};

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const getNetworks = async (req, res) => {
  return res.status(200).json({
    status: "success",
    paymentMode: paymentProvider.mode,
    simulated: true,
    networks: paymentProvider.getNetworks(),
  });
};

const getDataPlans = async (req, res) => {
  const network = String(req.query.network || "");
  const plans = paymentProvider.getDataPlans(network);

  if (!plans) {
    return res.status(404).json({
      status: "error",
      message: "Unknown network",
    });
  }

  return res.status(200).json({
    status: "success",
    paymentMode: paymentProvider.mode,
    simulated: true,
    network,
    plans,
  });
};

const purchaseData = async (req, res) => {
  const { network, planId, phone } = req.body;

  const networkRecord = paymentProvider.getNetwork(network);
  if (!networkRecord) {
    throw httpError(404, "Unknown network");
  }

  const plan = paymentProvider.getDataPlan(network, planId);
  if (!plan) {
    throw httpError(400, "Unknown data plan");
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw httpError(400, "Please enter a valid phone number");
  }

  const metadata = {
    serviceType: "data",
    networkId: networkRecord.id,
    network: networkRecord.name,
    planId: plan.id,
    planName: plan.name,
    allowance: plan.allowance,
    phone: normalizedPhone,
  };

  return processPayment(req, res, {
    kind: "data",
    prefix: "DAT",
    service: "data purchase",
    recipient: normalizedPhone,
    amount: plan.price,
    metadata,
    successMessage: "Data purchase successful",
    emailHeading: "Data Purchase Successful",
    emailParagraphs: [
      `Your ${networkRecord.name} ${plan.allowance} data bundle purchase of ${notificationCenter.formatNaira(
        plan.price
      )} to ${normalizedPhone} was successful.`,
    ],
    emailDetails: [
      { label: "Network", value: networkRecord.name },
      { label: "Plan", value: `${plan.name} (${plan.validity})` },
      { label: "Recipient", value: normalizedPhone },
    ],
  });
};

// ---------------------------------------------------------------------------
// Airtime
// ---------------------------------------------------------------------------
const purchaseAirtime = async (req, res) => {
  const { network, phone } = req.body;

  const networkRecord = paymentProvider.getNetwork(network);
  if (!networkRecord) {
    throw httpError(404, "Unknown network");
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw httpError(400, "Please enter a valid phone number");
  }

  const amount = toIntegerAmount(req.body.amount);
  if (amount === null) {
    throw httpError(400, "Please enter a valid amount");
  }

  if (amount < networkRecord.min || amount > networkRecord.max) {
    throw httpError(
      400,
      `Airtime amount must be between ${networkRecord.min} and ${networkRecord.max}`
    );
  }

  const metadata = {
    serviceType: "airtime",
    networkId: networkRecord.id,
    network: networkRecord.name,
    phone: normalizedPhone,
  };

  return processPayment(req, res, {
    kind: "airtime",
    prefix: "AIR",
    service: "airtime purchase",
    recipient: normalizedPhone,
    amount,
    metadata,
    successMessage: "Airtime purchase successful",
    emailHeading: "Airtime Purchase Successful",
    emailParagraphs: [
      `Your ${networkRecord.name} airtime purchase of ${notificationCenter.formatNaira(
        amount
      )} to ${normalizedPhone} was successful.`,
    ],
    emailDetails: [
      { label: "Network", value: networkRecord.name },
      { label: "Recipient", value: normalizedPhone },
    ],
  });
};

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
async function listPaymentHistory(req, res, types) {
  const transactions = await db.Transaction.findAll({
    where: {
      senderId: req.user.id,
      type: Array.isArray(types) ? types : [types],
    },
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json({
    status: "success",
    paymentMode: paymentProvider.mode,
    simulated: true,
    transactions,
  });
}

const getBillHistory = (req, res) => listPaymentHistory(req, res, "bill");
const getDataHistory = (req, res) => listPaymentHistory(req, res, "data");
const getAirtimeHistory = (req, res) => listPaymentHistory(req, res, "airtime");

module.exports = {
  getBillCategories,
  getBillProviders,
  validateBillCustomer: validateBillCustomerController,
  payBill,
  getBillHistory,
  getNetworks,
  getDataPlans,
  purchaseData,
  getDataHistory,
  purchaseAirtime,
  getAirtimeHistory,
  // Exposed for unit-style reuse/testing.
  __internal: { toIntegerAmount, normalizePhone, buildReference, UUID_PATTERN },
};
