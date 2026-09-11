const AppError = require('../utils/AppError');

/**
 * Ensures the authenticated user has an active, connected LinkedIn account.
 * Rejects with 409 Conflict if not connected.
 */
const linkedinGuard = (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required before checking LinkedIn connection', 401));
  }

  const isConnected = req.user.linkedin && req.user.linkedin.isConnected;
  if (!isConnected) {
    return next(
      new AppError(
        'LinkedIn account is not connected. Please connect your LinkedIn profile before proceeding.',
        409
      )
    );
  }

  next();
};

module.exports = linkedinGuard;
