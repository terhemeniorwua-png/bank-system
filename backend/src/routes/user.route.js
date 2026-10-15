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
const { changePinValidation } = require('../validators/pin');
const {
  avatarUpdateValidation,
  verifyPinValidation,
} = require('../validators/avatar');
const {
  updateAvatar,
  removeAvatar,
  verifyCurrentPin,
} = require('../controllers/profileController');
const {
  billValidateValidation,
  billPayValidation,
  dataPurchaseValidation,
  airtimePurchaseValidation,
} = require('../validators/payment');
const {
  deposit,
  balance,
  accountBalance,
  transfer,
  createPin,
  changePin,
  transactionHistory,
} = require('../controllers/userActions');
const {
  listBanks,
  validateTransferAccount,
} = require('../controllers/transferController');
const {
  getBillCategories,
  getBillProviders,
  validateBillCustomer,
  payBill,
  getBillHistory,
  getNetworks,
  getDataPlans,
  purchaseData,
  getDataHistory,
  purchaseAirtime,
  getAirtimeHistory,
} = require('../controllers/paymentController');
const {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
} = require('../controllers/notificationController');
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

const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    status: 'error',
    message: 'Too many PIN requests. Please try again later.',
  },
});

const avatarLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    status: 'error',
    message: 'Too many picture updates. Please try again later.',
  },
});

router.post('/register', validate(registrationValidation), signup);
router.post('/signup', validate(registrationValidation), signup);
router.post('/verify-email', verifyLimiter, validate(verifyEmailValidation), verifyEmail);
router.post('/resend-verification', resendLimiter, validate(resendVerificationValidation), resendVerification);
router.post('/login', authLimiter, validate(loginValidation), login);
router.get('/me', authenticate, me);

// Profile picture: the image is sent as a base64 data URL in a JSON body and
// is only stored after the session has been authenticated.
router.post('/avatar', avatarLimiter, authenticate, validate(avatarUpdateValidation), updateAvatar);
router.delete('/avatar', avatarLimiter, authenticate, removeAvatar);

router.put('/deposit', authenticate, deposit);
router.get('/balance', authenticate, userAuthorization, balance);
router.get('/account/balance', authenticate, accountBalance);
// Bank catalog and recipient-account validation for the transfer flow. Only a
// valid session is required here; the PIN is verified when the transfer is
// actually created.
router.get('/banks', authenticate, listBanks);
router.post('/transfer/validate-account', authenticate, validateTransferAccount);
router.post('/transfer', authenticate, userAuthorization, transfer);
router.post('/createPin', authenticate, createPin);

// Payments: airtime, data and bills. Browsing the catalog only needs a valid
// session; every purchase additionally requires (and verifies) the PIN.
router.get('/bills/categories', authenticate, getBillCategories);
router.get('/bills/providers', authenticate, getBillProviders);
router.post('/bills/validate', authenticate, validate(billValidateValidation), validateBillCustomer);
router.post('/bills/pay', authenticate, userAuthorization, validate(billPayValidation), payBill);
router.get('/bills/history', authenticate, getBillHistory);

router.get('/data/networks', authenticate, getNetworks);
router.get('/data/plans', authenticate, getDataPlans);
router.post('/data/purchase', authenticate, userAuthorization, validate(dataPurchaseValidation), purchaseData);
router.get('/data/history', authenticate, getDataHistory);

router.get('/airtime/networks', authenticate, getNetworks);
router.post('/airtime/purchase', authenticate, userAuthorization, validate(airtimePurchaseValidation), purchaseAirtime);
router.get('/airtime/history', authenticate, getAirtimeHistory);
router.patch('/change-pin', pinLimiter, authenticate, validate(changePinValidation), changePin);
router.post('/change-pin', pinLimiter, authenticate, validate(changePinValidation), changePin);
router.post('/pinChange', pinLimiter, authenticate, validate(changePinValidation), changePin);
// Step 1 of the step-by-step reset flow: confirm the old PIN before the user
// is allowed to choose a new one. Shares the lockout counter with change-pin.
router.post('/verify-pin', pinLimiter, authenticate, validate(verifyPinValidation), verifyCurrentPin);
router.get('/transactions', authenticate, transactionHistory);
router.post('/adminDeposit/:accountNumber', authenticate, adminAuthorization, addMoney);

router.get('/notifications', authenticate, listNotifications);
router.get('/notifications/unread-count', authenticate, unreadCount);
router.patch('/notifications/read-all', authenticate, markAllRead);
router.patch('/notifications/:id/read', authenticate, markRead);

module.exports = router;