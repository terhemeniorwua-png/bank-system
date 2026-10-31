'use strict';

const db = require('../../models');
const { sequelize, User, Transaction, Notification } = db;

const PAYSTACK = 'https://api.paystack.co';

async function createPendingDeposit({ user, amountNaira, reference }) {
  return Transaction.create({
    type: 'deposit',
    status: 'pending', // the model default is 'success', so always set this explicitly
    amount: amountNaira,
    receiverId: user.id,
    receiverAccountNumber: user.accountNumber,
    reference,
    metadata: { provider: 'paystack' },
  });
}

async function markFailed(reference) {
  await Transaction.update(
    { status: 'failed' },
    { where: { reference, status: 'pending' } }
  );
}

// Ask Paystack directly, so a forged webhook can never credit anyone.
async function verifyTransaction(reference) {
  const r = await fetch(
    `${PAYSTACK}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
  );
  const body = await r.json();
  if (!r.ok || !body.status) return null;
  return body.data;
}

// Credits the user exactly once. Safe to call repeatedly for the same reference.
async function creditDeposit(paystackData) {
  return sequelize.transaction(async (t) => {
    // Lock order is always transaction row -> user row. Keep it the same everywhere.
    const tx = await Transaction.findOne({
      where: { reference: paystackData.reference, type: 'deposit' },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!tx) return 'unknown_reference';
    if (tx.status === 'success') return 'already_processed';

    const expectedKobo = tx.amount * 100;
    if (paystackData.amount !== expectedKobo || paystackData.currency !== 'NGN') {
      await tx.update({ status: 'review' }, { transaction: t }); // never credit a mismatch
      return 'mismatch';
    }

    const user = await User.findByPk(tx.receiverId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!user) return 'user_missing';

    await user.update({ amount: user.amount + tx.amount }, { transaction: t });

    await tx.update(
      {
        status: 'success',
        providerReference: String(paystackData.id),
      },
      { transaction: t }
    );

    // dedupeKey is unique, so even a bug can't send the notification twice
    await Notification.findOrCreate({
      where: { dedupeKey: `deposit:${tx.reference}` },
      defaults: {
        userId: user.id,
        type: 'deposit',
        title: 'Deposit successful',
        message: `Your wallet was credited with ₦${tx.amount.toLocaleString()}.`,
        amount: tx.amount,
        reference: tx.reference,
        transactionId: tx.id,
      },
      transaction: t,
    });

    return 'credited';
  });
}

module.exports = { createPendingDeposit, markFailed, verifyTransaction, creditDeposit };