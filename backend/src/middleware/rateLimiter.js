const rateLimit = require('express-rate-limit');
const AppError = require('../utils/AppError');

/**
 * Standard error handler for rate limit violations returning consistent JSON.
 */
const rateLimitHandler = (req, res, next, options) => {
  next(new AppError(options.message || 'Too many requests, please try again later.', 429));
};

/**
 * Global rate limiter for standard API protection.
 */
const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP address, please try again after 15 minutes.',
  handler: rateLimitHandler,
});

/**
 * Strict rate limiter specifically guarding AI and image generation routes
 * against automated quota abuse and excessive spending.
 */
const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // limit each IP to 30 generation/regeneration requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'AI generation rate limit exceeded. Please wait a few minutes before trying again.',
  handler: rateLimitHandler,
});

// Default export is aiRateLimiter for direct use in route stacks
module.exports = aiRateLimiter;
module.exports.aiRateLimiter = aiRateLimiter;
module.exports.globalRateLimiter = globalRateLimiter;
