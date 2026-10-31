'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { Transaction, User } = require('../../models');
const {
  createPendingDeposit,
  markFailed,
  verifyTransaction,
  creditDeposit,
} = require('../services/deposit.service');

const PAYSTACK = 'https://api.paystack.co';
const secret = process.env.PAYSTACK_SECRET_KEY;
const callbackUrl = process.env.PAYSTACK_CALLBACK_URL;

if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not set');

const MIN_DEPOSIT_NGN = 100;
const MAX_DEPOSIT_NGN = 5_000_000;

// ---- Webhook (mounted in app.js with express.raw) ----
async function webhookHandler(req, res) {
  const expected = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
  const received = String(req.headers['x-paystack-signature'] || '');
  const a = Buffer.from(expected);
  const b = Buffer.from(received);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.sendStatus(401);
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.sendStatus(400);
  }

  if (event.event !== 'charge.success') return res.sendStatus(200);

  try {
    const verified = await verifyTransaction(event.data.reference);
    if (!verified || verified.status !== 'success') {
      console.warn('Paystack verify did not confirm', event.data.reference);
      return res.sendStatus(200);
    }

    const outcome = await creditDeposit(verified);
    console.log('paystack webhook', event.data.reference, outcome);
    return res.sendStatus(200);
  } catch (err) {
    console.error('Webhook processing failed:', err);
    return res.sendStatus(500); // non-2xx makes Paystack retry later
  }
}

// ---- Routes ----
const router = express.Router();

// Start a deposit
router.post('/deposits', async (req, res, next) => {
  try {
    const amountNaira = Number(req.body.amountNaira);

    // Balances are whole naira, so only whole-naira deposits are accepted
    if (!Number.isInteger(amountNaira) || amountNaira < MIN_DEPOSIT_NGN || amountNaira > MAX_DEPOSIT_NGN) {
      return res.status(400).json({ status: 'error', message: 'Invalid amount' });
    }

    const reference = `dep_${crypto.randomUUID()}`;
    await createPendingDeposit({ user: req.user, amountNaira, reference });

    const r = await fetch(`${PAYSTACK}/transaction/initialize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: req.user.email,
        amount: amountNaira * 100, // kobo
        reference,
        callback_url: callbackUrl,
      }),
    });
    const data = await r.json();

    if (!r.ok || !data.status) {
      await markFailed(reference);
      return res.status(502).json({ status: 'error', message: 'Could not start payment' });
    }

    res.json({ status: 'success', authorizationUrl: data.data.authorization_url, reference });
  } catch (err) {
    next(err);
  }
});

// The frontend's callback page polls this to show the result
router.get('/deposits/:reference', async (req, res, next) => {
  try {
    const tx = await Transaction.findOne({
      where: { reference: req.params.reference, type: 'deposit', receiverId: req.user.id },
    });
    if (!tx) return res.status(404).json({ status: 'error', message: 'Not found' });

    res.json({
      status: 'success',
      deposit: { reference: tx.reference, status: tx.status, amount: tx.amount },
    });
  } catch (err) {
    next(err);
  }
});

// Current balance (whole naira, from users.amount)
router.get('/account', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'amount'] });
    res.json({ status: 'success', balanceNaira: user ? user.amount : 0, currency: 'NGN' });
  } catch (err) {
    next(err);
  }
});

module.exports = { router, webhookHandler };