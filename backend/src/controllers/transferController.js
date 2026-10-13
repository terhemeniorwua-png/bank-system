"use strict";

const db = require("../../models");
const banks = require("../services/banks");

// Lists the supported banks. BBT Cash Bank is the default and the only bank
// that can currently be resolved internally.
const listBanks = async (req, res) => {
  return res.status(200).json({
    status: "success",
    defaultBank: banks.DEFAULT_BANK_ID,
    banks: banks.listBanks(),
  });
};

// Resolves and validates a recipient account for the selected bank before a
// transfer is attempted.
//
//   * BBT Cash Bank: validate the account-number format, then look the account
//     up in the database. Only the account's name and number are returned.
//   * External bank: validate the format only. No provider is configured, so
//     the request cannot proceed and is rejected with a clear message rather
//     than being reported as verified.
//
// The sender is taken from the authenticated session, never from the request
// body.
const validateTransferAccount = async (req, res) => {
  const bankId = req.body.bank ?? req.body.bankId ?? banks.DEFAULT_BANK_ID;
  const bank = banks.getBank(bankId);

  const format = banks.validateAccountFormat(bank, req.body.accountNumber);

  if (!format.valid) {
    return res.status(400).json({
      status: "error",
      code: format.code,
      message: format.message,
    });
  }

  if (!banks.isInternalBank(bank)) {
    // An 11-digit number is only format-valid; there is no provider to verify
    // or execute an external transfer, so it must not be treated as valid.
    return res.status(503).json({
      status: "error",
      code: "EXTERNAL_TRANSFER_UNAVAILABLE",
      message:
        "Transfers to other banks are not available yet. Please choose BBT Cash Bank or try again later.",
    });
  }

  const recipient = await db.User.findOne({
    where: { accountNumber: format.accountNumber },
    attributes: ["id", "name", "accountNumber"],
  });

  if (!recipient) {
    return res.status(404).json({
      status: "error",
      code: "recipient_not_found",
      message: "Recipient account not found. Please check the account number.",
    });
  }

  return res.status(200).json({
    status: "success",
    bank: { id: bank.id, name: bank.name, internal: true },
    account: {
      name: recipient.name,
      accountNumber: recipient.accountNumber,
      bankId: bank.id,
      bankName: bank.name,
      internal: true,
    },
  });
};

module.exports = {
  listBanks,
  validateTransferAccount,
};
