const { CreditTransaction } = require('../models');
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

module.exports = {
  getBalance,
  getTransactions,
};
