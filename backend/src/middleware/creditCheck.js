const AppError = require('../utils/AppError');

/**
 * Checks that the authenticated user has sufficient credit balance.
 * Can be used directly as standard middleware (checks for at least 1 credit)
 * or invoked as a factory: creditCheck(requiredCredits).
 *
 * Rejects with HTTP 402 Payment Required if creditBalance is insufficient.
 */
const creditCheck = (reqOrAmount = 1, res, next) => {
  if (typeof reqOrAmount === 'number') {
    const requiredCredits = reqOrAmount;
    return (req, res, next) => {
      if (!req.user) {
        return next(new AppError('Authentication required before checking credits', 401));
      }
      if ((req.user.creditBalance || 0) < requiredCredits) {
        return next(
          new AppError(
            `Insufficient credits. This action requires ${requiredCredits} credit(s), but your balance is ${req.user.creditBalance || 0}.`,
            402
          )
        );
      }
      next();
    };
  }

  // Used directly as middleware (default 1 credit)
  const req = reqOrAmount;
  if (!req.user) {
    return next(new AppError('Authentication required before checking credits', 401));
  }
  if ((req.user.creditBalance || 0) < 1) {
    return next(
      new AppError(
        `Insufficient credits. This action requires 1 credit, but your balance is ${req.user.creditBalance || 0}.`,
        402
      )
    );
  }
  next();
};

module.exports = creditCheck;
