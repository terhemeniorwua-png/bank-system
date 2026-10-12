
const express = require('express');
const router = express.Router();


const authenticate = require('../middleware/authentication');
// const { admin } = require('../controllers/roleController');
const { userAuthorization, adminAuthorization } = require('../middleware/authorization');
const { validate }  = require('../middleware/validator');
const { registrationValidation } = require('../validators/registration');
const { userFinalReg, login } = require('../controllers/user');
const loginValidation = require('../validators/login');
const { deposit, balance, transfer, pinUpdate, createPin, transactionHistory } = require('../controllers/userActions');
const addMoney = require('../controllers/admin');



router.post('/register', validate(registrationValidation), userFinalReg)
router.post('/login', validate(loginValidation), login)
router.put('/deposit', authenticate, deposit)
router.get('/balance', authenticate, userAuthorization, balance)
router.post('/transfer', authenticate, userAuthorization, transfer)
router.post('/createPin', authenticate, createPin)
router.post('/pinChange', authenticate, userAuthorization, pinUpdate)
router.get('/transactions', authenticate, transactionHistory)
router.post('/adminDeposit/:accountNumber', authenticate, adminAuthorization, addMoney)

module.exports = router;

