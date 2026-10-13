const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const authenticate = require('../middleware/authentication');
const { userAuthorization, adminAuthorization } = require('../middleware/authorization');
const { validate } = require('../middleware/validator');
const { registrationValidation } = require('../validators/registration');
const {
  verifyEmailValidation,
  resendVerificationValidation,
} = require('../validators/verification');
const {
  signup,
  verifyEmail,
  resendVerification,
  login,
  me,
} = require('../controllers/auth');
const loginValidation = require('../validators/login');
const {
  deposit,
  balance,
  transfer,
  pinUpdate,
  createPin,
  transactionHistory,
} = require('../controllers/userActions');
const addMoney = require('../controllers/admin');

// IP-based throttling is disabled under the automated test environment so the
// suite remains deterministic; per-email cooldowns and attempt limits are still
// enforced by the controller.
const skipInTest = () => process.env.NODE_ENV === 'test';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    status: 'error',
    message: 'Too many requests. Please try again later.',
  },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    status: 'error',
    message: 'Too many verification attempts. Please try again later.',
  },
});

const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    status: 'error',
    message: 'Too many requests. Please try again later.',
  },
});

router.post('/register', validate(registrationValidation), signup);
router.post('/signup', validate(registrationValidation), signup);
router.post('/verify-email', verifyLimiter, validate(verifyEmailValidation), verifyEmail);
router.post('/resend-verification', resendLimiter, validate(resendVerificationValidation), resendVerification);
router.post('/login', authLimiter, validate(loginValidation), login);
router.get('/me', authenticate, me);

router.put('/deposit', authenticate, deposit);
router.get('/balance', authenticate, userAuthorization, balance);
router.post('/transfer', authenticate, userAuthorization, transfer);
router.post('/createPin', authenticate, createPin);
router.post('/pinChange', authenticate, userAuthorization, pinUpdate);
router.get('/transactions', authenticate, transactionHistory);
router.post('/adminDeposit/:accountNumber', authenticate, adminAuthorization, addMoney);

module.exports = router;