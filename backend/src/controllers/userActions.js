const { Op } = require("sequelize");
const db = require("../../models");
const notificationCenter = require("../services/notificationCenter");
const emailOutbox = require("../services/notifications");
const { hashPin, verifyPin } = require("../services/pin");
const pinAttempts = require("../services/pinAttempts");

require("dotenv").config();

const isValidAmount = (value) => {
  const raw = String(value);
  return /^\d+$/.test(raw) && raw.trim() !== "" && Number(raw) > 0;
};

const httpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// Best-effort transactional emails. These never affect the financial
// operation: each delivery is recorded in the email outbox and failures are
// logged, not thrown.
async function sendTransferEmails(sender, receiver, amount, reference) {
  const naira = notificationCenter.formatNaira(amount);
  const details = [
    { label: "Amount", value: naira },
    { label: "Reference", value: reference || "N/A" },
  ];

  await Promise.allSettled([
    emailOutbox.deliverBrandedEmail({
      userId: sender.id,
      toEmail: sender.email,
      type: "transfer_debit",
      subject: "Debit Alert \u2014 BBT Cash",
      heading: "Transfer Successful",
      greetingName: sender.name,
      paragraphs: [
        `Your transfer of ${naira} to ${receiver.name} was successful.`,
      ],
      details: [
        { label: "Recipient", value: receiver.name },
        { label: "Recipient Account", value: receiver.accountNumber },
        ...details,
      ],
    }),
    emailOutbox.deliverBrandedEmail({
      userId: receiver.id,
      toEmail: receiver.email,
      type: "transfer_credit",
      subject: "Credit Alert \u2014 BBT Cash",
      heading: "Money Received",
      greetingName: receiver.name,
      paragraphs: [`You received ${naira} from ${sender.name}.`],
      details: [
        { label: "Sender", value: sender.name },
        { label: "Sender Account", value: sender.accountNumber },
        ...details,
      ],
    }),
  ]);
}

const deposit = async (req, res) => {
  const accNum = req.body.accountNumber;
  const amount = String(req.body.amount);

  if (!isValidAmount(amount)) {
    return res.status(400).json({
      message: "Invaid fund",
    });
  }

  const user = await db.User.findOne({ where: { accountNumber: accNum } });

  if (!user) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  let depositRef = null;

  await db.sequelize.transaction(async (transaction) => {
    user.amount = user.amount + Number(amount);
    await user.save({ transaction });

    const created = await db.Transaction.create(
      {
        type: "deposit",
        status: "success",
        amount: Number(amount),
        receiverId: user.id,
        receiverAccountNumber: user.accountNumber,
      },
      { transaction }
    );

    depositRef = created.reference || created.id;

    // The deposit notification commits with the balance change.
    await notificationCenter.notifyDeposit(
      {
        user,
        amount: Number(amount),
        reference: created.reference || null,
        transactionId: created.id,
        method: "Deposit",
      },
      { transaction }
    );
  });

  // Notification email is only sent after the transaction has committed.
  await emailOutbox
    .deliverBrandedEmail({
      userId: user.id,
      toEmail: user.email,
      type: "deposit",
      subject: "Credit Alert \u2014 BBT Cash",
      heading: "Deposit Successful",
      greetingName: user.name,
      paragraphs: [
        `${notificationCenter.formatNaira(Number(amount))} has been deposited into your account.`,
      ],
      details: [{ label: "Reference", value: depositRef || "N/A" }],
    })
    .catch(() => {});

  return res.status(200).json({
    message: "Deposit successful",
    userDetails: user.toSafeJSON(),
  });
};

// Balance
const balance = async (req, res) => {
  const { accountNumber } = req.body;

  // The authenticated user's PIN was already verified by userAuthorization.
  // Ownership is enforced here: only the account owned by the caller is
  // returned, regardless of the account number supplied.
  const user = await db.User.findByPk(req.user.id);

  if (!user || (accountNumber && accountNumber !== user.accountNumber)) {
    return res.status(404).json({
      message: "user not found",
    });
  }

  res.status(200).json({
    balance: `Your balance is ${user.amount}`,
  });
};

// Balance for the authenticated account without requiring the PIN again (used
// by the dashboard, where the session is already authenticated).
const accountBalance = async (req, res) => {
  const user = await db.User.findByPk(req.user.id);

  if (!user) {
    return res.status(404).json({
      status: "error",
      message: "User not found",
    });
  }

  return res.status(200).json({
    status: "success",
    balance: user.amount,
    amount: user.amount,
    currency: "NGN",
    accountNumber: user.accountNumber,
  });
};

// Transfer
const transfer = async (req, res) => {
  const { to, amount, from, reference } = req.body;
  const transferAmount = Number(amount);

  if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
    return res.status(400).json({
      message: "Invalid amount",
    });
  }

  if (from && req.user && req.user.id && req.userRecord) {
    if (from !== req.userRecord.accountNumber) {
      return res.status(403).json({
        message: "You can only transfer from your own account",
      });
    }
  }

  try {
    const result = await db.sequelize.transaction(async (transaction) => {
      // Idempotency: reject a replay of an already-processed transfer.
      if (reference) {
        const duplicate = await db.Transaction.findOne({
          where: { reference },
          transaction,
        });
        if (duplicate) {
          throw httpError(409, "Duplicate transaction");
        }
      }

      // Lock both rows in a deterministic order to avoid deadlocks.
      const accounts = await db.User.findAll({
        where: { accountNumber: { [Op.in]: [from, to] } },
        order: [["accountNumber", "ASC"]],
        lock: transaction.LOCK.UPDATE,
        transaction,
      });

      const senderAccount = accounts.find((u) => u.accountNumber === from);
      const receiverAccount = accounts.find((u) => u.accountNumber === to);

      if (!senderAccount) {
        throw httpError(404, "Source account not found");
      }

      if (!receiverAccount) {
        throw httpError(404, "Recipient not found");
      }

      if (senderAccount.amount < transferAmount) {
        throw httpError(400, "Insufficient fund");
      }

      senderAccount.amount -= transferAmount;
      receiverAccount.amount += transferAmount;

      await senderAccount.save({ transaction });
      await receiverAccount.save({ transaction });

      const created = await db.Transaction.create(
        {
          type: "transfer",
          status: "success",
          amount: transferAmount,
          reference: reference || null,
          senderId: senderAccount.id,
          receiverId: receiverAccount.id,
          senderAccountNumber: senderAccount.accountNumber,
          receiverAccountNumber: receiverAccount.accountNumber,
        },
        { transaction }
      );

      // Debit + credit notifications commit atomically with the transfer.
      await notificationCenter.notifyTransferSuccess(
        {
          sender: senderAccount,
          receiver: receiverAccount,
          amount: transferAmount,
          reference: reference || null,
          transactionId: created.id,
        },
        { transaction }
      );

      return {
        sender: senderAccount,
        receiver: receiverAccount,
        receiverName: receiverAccount.name,
      };
    });

    // Emails are sent only after the transfer has committed.
    await sendTransferEmails(
      result.sender,
      result.receiver,
      transferAmount,
      reference || null
    );

    return res.status(200).json({
      status: "sucess",
      message: `Transfer to ${result.receiverName} successful. Your balance is ${result.sender.amount}`,
    });
  } catch (error) {
    if (error.statusCode) {
      // Notify the initiator about a genuine failure (not a replay/duplicate).
      if (
        (error.statusCode === 400 || error.statusCode === 404) &&
        req.user &&
        req.user.id
      ) {
        try {
          const initiator = await db.User.findByPk(req.user.id);
          if (initiator) {
            await notificationCenter.notifyFailed({
              user: initiator,
              amount: transferAmount > 0 ? transferAmount : null,
              reference: reference || null,
              reason: error.message.toLowerCase(),
            });
          }
        } catch {
          // A notification failure must never change the HTTP outcome.
        }
      }

      return res.status(error.statusCode).json({ message: error.message });
    }

    // Concurrent duplicate reference hitting the unique index.
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ message: "Duplicate transaction" });
    }

    throw error;
  }
};

// Change the authenticated user's transaction PIN.
const changePin = async (req, res) => {
  const currentPin = req.body.currentPin ?? req.body.pin;
  const newPin = req.body.newPin;
  const confirmPin = req.body.confirmPin ?? req.body.newPin;

  const format = /^\d{4}$/;

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

  if (
    currentPin === undefined ||
    newPin === undefined ||
    confirmPin === undefined
  ) {
    return res.status(400).json({
      status: "error",
      message: "Current PIN, new PIN and confirmation are required",
    });
  }

  if (!format.test(String(newPin))) {
    return res.status(400).json({
      status: "error",
      message: "Your new PIN must be exactly 4 digits",
    });
  }

  if (String(newPin) !== String(confirmPin)) {
    return res.status(400).json({
      status: "error",
      message: "New PIN and confirmation do not match",
    });
  }

  const { ok } = await verifyPin(currentPin, user.pin);

  if (!ok) {
    const failures = pinAttempts.recordFailure(user.id);

    try {
      await notificationCenter.notifySecurityAlert(
        user,
        "Someone tried to change your transaction PIN but entered the wrong current PIN. If this was not you, secure your account immediately."
      );
    } catch {
      // Ignore notification errors.
    }

    if (failures >= pinAttempts.MAX_FAILURES) {
      try {
        await notificationCenter.notifySecurityAlert(
          user,
          "We detected repeated failed attempts to change your transaction PIN. If this was not you, secure your account immediately."
        );
      } catch {
        // Ignore notification errors.
      }
    }

    return res.status(400).json({
      status: "error",
      message: "Your current PIN is incorrect",
    });
  }

  // Compare against the current PIN whether it is stored as a hash or legacy
  // plaintext.
  const sameAsCurrent = await verifyPin(newPin, user.pin);
  if (sameAsCurrent.ok) {
    return res.status(400).json({
      status: "error",
      message: "Your new PIN must be different from your current PIN",
    });
  }

  user.pin = await hashPin(newPin);
  await user.save();

  pinAttempts.reset(user.id);

  await notificationCenter
    .notifyPinChanged(user)
    .catch(() => {});

  await emailOutbox
    .deliverBrandedEmail({
      userId: user.id,
      toEmail: user.email,
      type: "pin_changed",
      subject: "Security Notice \u2014 Your PIN was changed",
      heading: "Transaction PIN Changed",
      greetingName: user.name,
      paragraphs: [
        "Your transaction PIN was changed successfully.",
        "If you did not make this change, secure your account immediately.",
      ],
      details: [],
    })
    .catch(() => {});

  return res.status(200).json({
    status: "success",
    message: "Your transaction PIN has been changed successfully.",
  });
};

// Create pin
const createPin = async (req, res) => {
  const { accNum, pin } = req.body;
  const format = /^\d{4}$/;

  const user = await db.User.findByPk(req.user.id);

  if (!user) {
    return res.status(404).json({
      message: "Account not found",
    });
  }

  if (accNum && accNum !== user.accountNumber) {
    return res.status(403).json({
      message: "You can only set a PIN for your own account",
    });
  }

  if (user.pin) {
    return res.status(400).json({
      message: "Pin already exist",
    });
  }

  if (!format.test(String(pin))) {
    return res.status(400).json({
      message: "Invalid pin",
    });
  }

  user.pin = await hashPin(pin);
  await user.save();

  await notificationCenter.notifyPinCreated(user).catch(() => {});

  return res.status(200).json({
    message: "Pin created successfully",
  });
};

// Transaction history for the authenticated account.
const transactionHistory = async (req, res) => {
  const user = await db.User.findByPk(req.user.id);

  if (!user) {
    return res.status(404).json({
      message: "user not found",
    });
  }

  const transactions = await db.Transaction.findAll({
    where: {
      [Op.or]: [
        { senderAccountNumber: user.accountNumber },
        { receiverAccountNumber: user.accountNumber },
      ],
    },
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json({
    status: "success",
    transactions,
  });
};

module.exports = {
  deposit,
  balance,
  accountBalance,
  transfer,
  createPin,
  changePin,
  transactionHistory,
};
