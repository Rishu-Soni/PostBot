const crypto = require('crypto');
const AppError = require('../utils/AppError');
const { getAdminKey } = require('../config/env');

/**
 * Validates the x-admin-key header for internal administrative endpoints
 * (such as manual cron triggers and admin credit operations).
 * Enforces constant-time comparison via crypto.timingSafeEqual to eliminate
 * timing attacks. Bypasses user JWT authentication.
 */
const adminAuth = (req, res, next) => {
  const providedKey = req.headers['x-admin-key'];
  const expectedKey = getAdminKey();

  if (!providedKey || typeof providedKey !== 'string') {
    return next(
      new AppError('Unauthorized. Valid x-admin-key header is required for internal operations.', 401)
    );
  }

  const providedBuf = Buffer.from(providedKey, 'utf8');
  const expectedBuf = Buffer.from(expectedKey, 'utf8');

  // timingSafeEqual requires equal buffer lengths or it throws
  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return next(
      new AppError('Unauthorized. Valid x-admin-key header is required for internal operations.', 401)
    );
  }

  next();
};

module.exports = adminAuth;
