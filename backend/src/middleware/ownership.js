const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Generic ownership guard middleware factory.
 * Verifies that the resource identified by req.params[paramName] exists and
 * belongs to the currently authenticated user (req.user).
 *
 * Enforces defensive access control:
 * - Returns 404 if the resource does not exist (or invalid ID format) to avoid leaking existence.
 * - Returns 403 only when the resource exists but belongs to another user.
 *
 * Attaches the loaded document to req[paramName + 'Doc'] and req.resource.
 *
 * @param {import('mongoose').Model} Model - Mongoose model to query
 * @param {string} paramName - Name of the route parameter (e.g., 'batchId', 'postId', 'id')
 * @param {string} [userField='userId'] - Property name on the document representing the owner
 * @returns {Function} Express middleware function
 */
const ownsResource = (Model, paramName, userField = 'userId') =>
  asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required before checking resource ownership', 401));
    }

    const resourceId = req.params[paramName];
    if (!resourceId || !mongoose.Types.ObjectId.isValid(resourceId)) {
      return next(new AppError('Resource not found', 404));
    }

    const doc = await Model.findById(resourceId);
    if (!doc) {
      return next(new AppError('Resource not found', 404));
    }

    const docOwnerId = doc[userField] ? doc[userField].toString() : null;
    const currentUserId = (req.user._id || req.user.id).toString();

    if (docOwnerId !== currentUserId) {
      return next(new AppError('You do not have permission to access this resource', 403));
    }

    // Attach document to request for downstream controller convenience
    req[`${paramName}Doc`] = doc;
    req.resource = doc;

    next();
  });

module.exports = {
  ownsResource,
};
