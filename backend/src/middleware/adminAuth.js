const AppError = require('../utils/AppError');

const ADMIN_KEY = process.env.ADMIN_KEY || 'dev-postbot-admin-secret';

/**
 * Validates the x-admin-key header for internal administrative endpoints
 * (such as manual cron triggers). Bypasses user JWT authentication.
 */
const adminAuth = (req, res, next) => {
  const providedKey = req.headers['x-admin-key'];

  if (!providedKey || providedKey !== ADMIN_KEY) {
    return next(
      new AppError('Unauthorized. Valid x-admin-key header is required for internal operations.', 401)
    );
  }

  next();
};

module.exports = adminAuth;
