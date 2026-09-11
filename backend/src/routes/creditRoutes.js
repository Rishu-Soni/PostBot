const express = require('express');
const router = express.Router();
const creditController = require('../controllers/creditController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { queryTransactionsSchema } = require('../validators');

// Get current credit balance
router.get('/balance', auth, creditController.getBalance);

// Get paginated transaction ledger
router.get('/transactions', auth, validate(queryTransactionsSchema), creditController.getTransactions);

module.exports = router;
