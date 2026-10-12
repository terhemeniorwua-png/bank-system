const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const db = require("../../models");

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

  await db.sequelize.transaction(async (transaction) => {
    user.amount = user.amount + Number(amount);
    await user.save({ transaction });

    await db.Transaction.create(
      {
        type: "deposit",
        status: "success",
        amount: Number(amount),
        receiverId: user.id,
        receiverAccountNumber: user.accountNumber,
      },
      { transaction }
    );
  });

  return res.status(200).json({
    message: "Deposit successful",
    userDetails: user.toSafeJSON(),
  });
};

// Balance
const balance = async (req, res) => {
  const { pin, accountNumber } = req.body;

  const user = await db.User.findOne({
    where: { accountNumber, pin },
  });

  if (!user) {
    return res.status(404).json({
      message: "user not found",
    });
  }

  res.status(200).json({
    balance: `Your balance is ${user.amount}`,
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

      await db.Transaction.create(
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

      return {
        sender: senderAccount,
        receiverName: receiverAccount.name,
      };
    });

    return res.status(200).json({
      status: "sucess",
      message: `Transfer to ${result.receiverName} successful. Your balance is ${result.sender.amount}`,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    // Concurrent duplicate reference hitting the unique index.
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ message: "Duplicate transaction" });
    }

    throw error;
  }
};

// Pin update
const pinUpdate = async (req, res) => {
  const { accountNumber, pin, newPin } = req.body;

  const user = await db.User.findOne({
    where: { accountNumber, pin },
  });

  if (!user) {
    return res.status(404).json({
      message: "Account not found",
    });
  }

  user.pin = newPin;
  await user.save();

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      status: "error",
      message: "Token is not configured",
    });
  }

  const token = jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      pin: user.pin,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRING_TIME,
    }
  );

  return res.status(200).json({
    message: "Your pin has been updated",
    token: token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      accountNumber: user.accountNumber,
    },
  });
};

// Create pin
const createPin = async (req, res) => {
  const { accNum, pin } = req.body;
  const format = /^\d{4}$/;

  const user = await db.User.findOne({ where: { accountNumber: accNum } });

  if (!user) {
    return res.status(404).json({
      message: "Account not found",
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

  user.pin = String(pin);
  await user.save();

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
  transfer,
  createPin,
  pinUpdate,
  transactionHistory,
};
