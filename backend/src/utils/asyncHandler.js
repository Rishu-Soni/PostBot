/**
 * Wraps an async express route handler or controller to catch unhandled rejections
 * and forward them directly to express next(err) middleware.
 *
 * @param {Function} fn - Async controller/handler function (req, res, next)
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
