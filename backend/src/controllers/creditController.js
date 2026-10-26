const { CreditTransaction } = require('../models');
const creditService = require('../services/creditService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Returns current authenticated user's credit balance.
 * Route: GET /api/v1/credits/balance
 */
const getBalance = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      creditBalance: req.user.creditBalance || 0,
    },
  });
});

/**
 * Returns paginated credit ledger transaction history.
 * Route: GET /api/v1/credits/transactions
 */
const getTransactions = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const filter = { userId: req.user._id };

  const [transactions, total] = await Promise.all([
    CreditTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    CreditTransaction.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      transactions,
      total,
      page,
      limit,
    },
  });
});

/**
 * Administrative credit adjustment.
 * Route: POST /api/v1/credits/admin/adjust
 * Protected by adminAuth (x-admin-key), NOT user JWT.
 */
const adminAdjust = asyncHandler(async (req, res, next) => {
  const { userId, amount, reason, note } = req.body;
  if (!userId || amount === undefined || amount === null) {
    return next(new AppError('userId and amount are required for credit adjustment.', 400));
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount === 0) {
    return next(new AppError('amount must be a non-zero number.', 400));
  }

  let result;
  if (numAmount > 0) {
    result = await creditService.addCredits({
      userId,
      amount: numAmount,
      reason: reason || 'purchase',
      note: note || 'Administrative credit addition',
    });
  } else {
    result = await creditService.deductCredits({
      userId,
      amount: Math.abs(numAmount),
      reason: reason || 'generation',
      note: note || 'Administrative credit deduction',
    });
  }

  res.status(200).json({
    success: true,
    data: result,
  });
});

module.exports = {
  getBalance,
  getTransactions,
  adminAdjust,
};

