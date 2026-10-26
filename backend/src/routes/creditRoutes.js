const express = require('express');
const router = express.Router();
const creditController = require('../controllers/creditController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const validate = require('../middleware/validate');
const { queryTransactionsSchema } = require('../validators');

const AppError = require('../utils/AppError');

// Get current credit balance
router.get('/balance', auth, creditController.getBalance);

// Get paginated transaction ledger
router.get('/transactions', auth, validate(queryTransactionsSchema), creditController.getTransactions);

// Credit purchase endpoint - gated/disabled until real billing is implemented
router.post('/purchase', auth, (req, res, next) => {
  return next(new AppError('Credit purchasing is not yet implemented. Payment integration pending.', 501));
});

// Admin manual credit adjustment - strictly requires x-admin-key (rejects user JWT)
router.post('/admin/adjust', adminAuth, creditController.adminAdjust);

module.exports = router;

