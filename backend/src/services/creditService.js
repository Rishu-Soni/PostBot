const mongoose = require('mongoose');
const { User, CreditTransaction } = require('../models');
const AppError = require('../utils/AppError');

/**
 * Credit Service
 * Manages the append-only CreditTransaction ledger and user balance modifications.
 * All balance writes are executed atomically within a Mongoose transaction session.
 */

/**
 * Deducts credits and appends a CreditTransaction ledger entry.
 * Runs atomically inside a Mongoose transaction session.
 * Supports both positional parameters and object destructuring.
 *
 * @param {string|Object} userIdOrOptions - User ID or parameters object
 * @param {number} [amountArg] - Credits to deduct (must be > 0)
 * @param {string} [postIdArg] - Associated Post ID if applicable
 * @param {('generation'|'regeneration')} [reasonArg='generation'] - Spend reason
 * @param {string} [noteArg] - Optional ledger note
 * @param {import('mongoose').ClientSession} [sessionArg] - Optional external session
 * @returns {Promise<{ newBalance: number, creditBalance: number, transaction: Object }>}
 */
const deductCredits = async (
  userIdOrOptions,
  amountArg,
  postIdArg,
  reasonArg,
  noteArg,
  sessionArg
) => {
  let userId;
  let amount;
  let postId = null;
  let reason = 'generation';
  let note = null;
  let externalSession = null;

  if (
    typeof userIdOrOptions === 'object' &&
    userIdOrOptions !== null &&
    !(userIdOrOptions instanceof mongoose.Types.ObjectId)
  ) {
    ({
      userId,
      amount,
      reason = 'generation',
      postId = null,
      note = null,
      session: externalSession = null,
    } = userIdOrOptions);
  } else {
    userId = userIdOrOptions;
    amount = amountArg;
    postId = postIdArg || null;
    reason = reasonArg || 'generation';
    note = noteArg || null;
    externalSession = sessionArg || null;
  }

  if (!userId) {
    throw new AppError('userId is required to deduct credits.', 400);
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new AppError('Credit deduction amount must be a positive number.', 400);
  }

  // NOTE: Multi-document transactions require MongoDB running as a replica set (even a single-node replica set).
  const session = externalSession || (await mongoose.startSession());
  const isManagedSession = !externalSession;

  const executeOperation = async (activeSession) => {
    const user = await User.findById(userId).session(activeSession);
    if (!user) {
      throw new AppError('User not found.', 404);
    }

    if ((user.creditBalance || 0) < numericAmount) {
      throw new AppError(
        `Insufficient credits. Required: ${numericAmount}, Available: ${user.creditBalance || 0}.`,
        402
      );
    }

    user.creditBalance -= numericAmount;
    await user.save({ session: activeSession });

    const [transaction] = await CreditTransaction.create(
      [
        {
          userId: user._id,
          postId: postId || null,
          reason,
          amount: -numericAmount, // Stored as negative for spend
          balanceAfter: user.creditBalance,
          note:
            note ||
            (reason === 'regeneration'
              ? 'Post regeneration deduction'
              : 'Post generation deduction'),
        },
      ],
      { session: activeSession }
    );

    return {
      newBalance: user.creditBalance,
      creditBalance: user.creditBalance,
      transaction,
    };
  };

  if (isManagedSession) {
    session.startTransaction();
    try {
      const result = await executeOperation(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error instanceof AppError
        ? error
        : new AppError(error.message || 'Failed to deduct credits.', 500);
    } finally {
      session.endSession();
    }
  } else {
    return await executeOperation(session);
  }
};

/**
 * Adds credits and logs a purchase or refund transaction.
 * Runs atomically inside a Mongoose transaction session.
 * Supports both positional parameters and object destructuring.
 *
 * @param {string|Object} userIdOrOptions - User ID or parameters object
 * @param {number} [amountArg] - Credits to add (must be > 0)
 * @param {('purchase'|'refund')} [reasonArg='purchase'] - Reason
 * @param {string} [noteArg] - Optional note
 * @param {import('mongoose').ClientSession} [sessionArg] - Optional external session
 * @returns {Promise<{ newBalance: number, creditBalance: number, transaction: Object }>}
 */
const addCredits = async (
  userIdOrOptions,
  amountArg,
  reasonArg,
  noteArg,
  sessionArg
) => {
  let userId;
  let amount;
  let reason = 'purchase';
  let note = null;
  let externalSession = null;

  if (
    typeof userIdOrOptions === 'object' &&
    userIdOrOptions !== null &&
    !(userIdOrOptions instanceof mongoose.Types.ObjectId)
  ) {
    ({
      userId,
      amount,
      reason = 'purchase',
      note = null,
      session: externalSession = null,
    } = userIdOrOptions);
  } else {
    userId = userIdOrOptions;
    amount = amountArg;
    reason = reasonArg || 'purchase';
    note = noteArg || null;
    externalSession = sessionArg || null;
  }

  if (!userId) {
    throw new AppError('userId is required to add credits.', 400);
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new AppError('Credit addition amount must be a positive number.', 400);
  }

  // NOTE: Multi-document transactions require MongoDB running as a replica set (even a single-node replica set).
  const session = externalSession || (await mongoose.startSession());
  const isManagedSession = !externalSession;

  const executeOperation = async (activeSession) => {
    const user = await User.findById(userId).session(activeSession);
    if (!user) {
      throw new AppError('User not found.', 404);
    }

    user.creditBalance = (user.creditBalance || 0) + numericAmount;
    await user.save({ session: activeSession });

    const [transaction] = await CreditTransaction.create(
      [
        {
          userId: user._id,
          postId: null,
          reason,
          amount: numericAmount, // Stored as positive for additions
          balanceAfter: user.creditBalance,
          note:
            note ||
            (reason === 'refund' ? 'Credit refund' : 'Credit purchase'),
        },
      ],
      { session: activeSession }
    );

    return {
      newBalance: user.creditBalance,
      creditBalance: user.creditBalance,
      transaction,
    };
  };

  if (isManagedSession) {
    session.startTransaction();
    try {
      const result = await executeOperation(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error instanceof AppError
        ? error
        : new AppError(error.message || 'Failed to add credits.', 500);
    } finally {
      session.endSession();
    }
  } else {
    return await executeOperation(session);
  }
};

/**
 * Retrieves the current credit balance for a user.
 *
 * @param {string} userId - User ID
 * @returns {Promise<number>} Current credit balance
 */
const getBalance = async (userId) => {
  if (!userId) {
    throw new AppError('userId is required to retrieve credit balance.', 400);
  }

  const user = await User.findById(userId).select('creditBalance');
  if (!user) {
    throw new AppError('User not found.', 404);
  }

  return user.creditBalance || 0;
};

/**
 * Retrieves a paginated list of credit ledger transactions for a user.
 * Sorted descending by creation time.
 *
 * @param {string} userId - User ID
 * @param {Object} [pagination]
 * @param {number} [pagination.page=1] - Page number
 * @param {number} [pagination.limit=10] - Items per page
 * @returns {Promise<{ transactions: Object[], total: number, page: number, limit: number, totalPages: number }>}
 */
const getTransactions = async (userId, pagination = {}) => {
  if (!userId) {
    throw new AppError('userId is required to retrieve transactions.', 400);
  }

  const page = Math.max(1, parseInt(pagination.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(pagination.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const filter = { userId };

  const [transactions, total] = await Promise.all([
    CreditTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CreditTransaction.countDocuments(filter),
  ]);

  return {
    transactions,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
};

module.exports = {
  deductCredits,
  addCredits,
  getBalance,
  getTransactions,
};
