const { sequelize, Account, Deposit, LedgerEntry } = require("../models/payments");
require("dotenv")
const PAYSTACK = process.env.PAYSTACK_URL;

async function createPendingDeposit({ userId, amountKobo, reference }) {
  const [account] = await Account.findOrCreate({
    where: { userId },
    defaults: { userId },
  });

  return Deposit.create({
    accountId: account.id,
    reference,
    amountKobo,
    currency: account.currency,
    status: "PENDING",
  });
}

// Ask Paystack directly, so we never credit based on the webhook payload alone
async function verifyTransaction(reference) {
  const r = await fetch(`${PAYSTACK}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });
  const body = await r.json();
  if (!r.ok || !body.status) return null;
  return body.data;
}

// Credits the account exactly once. Safe to call repeatedly for the same reference.
async function creditDeposit(paystackData) {
  return sequelize.transaction(async (t) => {
    // Lock order is always deposit -> account. Keep it the same everywhere.
    const deposit = await Deposit.findOne({
      where: { reference: paystackData.reference },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!deposit) return "unknown_reference";
    if (deposit.status === "SUCCESS") return "already_processed";

    const amountMatches = BigInt(paystackData.amount) === BigInt(deposit.amountKobo);
    const currencyMatches = paystackData.currency === deposit.currency;

    if (!amountMatches || !currencyMatches) {
      // Don't credit. Flag for a human to look at.
      await deposit.update({ status: "REVIEW" }, { transaction: t });
      return "mismatch";
    }

    const account = await Account.findByPk(deposit.accountId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    // BIGINT comes back from Postgres as a string, so use BigInt for the math
    const newBalance = BigInt(account.balanceKobo) + BigInt(deposit.amountKobo);

    await LedgerEntry.create(
      {
        accountId: account.id,
        depositId: deposit.id,
        type: "CREDIT",
        amountKobo: deposit.amountKobo,
        balanceAfterKobo: newBalance.toString(),
        reference: `deposit:${deposit.reference}`, // unique: a second credit is impossible
        description: "Paystack deposit",
      },
      { transaction: t }
    );

    await account.update({ balanceKobo: newBalance.toString() }, { transaction: t });

    await deposit.update(
      {
        status: "SUCCESS",
        paidAt: paystackData.paid_at ? new Date(paystackData.paid_at) : new Date(),
        paystackTransactionId: String(paystackData.id),
      },
      { transaction: t }
    );

    return "credited";
  });
}

module.exports = { createPendingDeposit, verifyTransaction, creditDeposit };