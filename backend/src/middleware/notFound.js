const AppError = require('../utils/AppError');

/**
 * Catches any unhandled routes and forwards an operational 404 AppError
 * to the centralized error handler.
 */
const notFound = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};

module.exports = notFound;
