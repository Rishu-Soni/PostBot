const AppError = require('../utils/AppError');

/**
 * Centralized global error handling middleware.
 * Formats every response into the mandatory shape:
 *   { success: false, message: <string>, errors?: [...] }
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.name = err.name;
  error.stack = err.stack;
  error.statusCode = err.statusCode || 500;
  error.isOperational = err.isOperational || false;
  error.errors = err.errors || undefined;

  // Handle Mongoose Bad ObjectId (CastError)
  if (err.name === 'CastError') {
    error = new AppError(`Invalid resource identifier: ${err.value}`, 400);
  }

  // Handle Mongoose Duplicate Key Error (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    error = new AppError(`Duplicate value for ${field}. Please use another value.`, 409);
  }

  // Handle Mongoose Schema Validation Errors
  if (err.name === 'ValidationError' && err.errors) {
    const formattedErrors = Object.values(err.errors).map((el) => ({
      field: el.path,
      message: el.message,
    }));
    error = new AppError('Database validation failed', 400, formattedErrors);
  }

  // Handle Multer upload errors
  if (err.name === 'MulterError') {
    let msg = err.message;
    if (err.code === 'LIMIT_FILE_SIZE') {
      msg = 'Uploaded file exceeds the maximum allowed size of 5MB.';
    }
    error = new AppError(msg, 400);
  }

  // Handle JWT verification errors
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid authentication token.', 401);
  }
  if (err.name === 'TokenExpiredError') {
    error = new AppError('Authentication token has expired. Please log in again.', 401);
  }

  const statusCode = error.statusCode || 500;

  // Production/Operational vs Unexpected Internal Errors
  if (error.isOperational) {
    const responsePayload = {
      success: false,
      message: error.message,
    };

    if (error.errors && Array.isArray(error.errors) && error.errors.length > 0) {
      responsePayload.errors = error.errors;
    }

    return res.status(statusCode).json(responsePayload);
  }

  // Programmer or unknown error: log full stack server-side and don't leak internals to client
  console.error('[UNHANDLED SERVER ERROR]:', err);

  return res.status(500).json({
    success: false,
    message: 'An unexpected internal server error occurred. Please try again later.',
  });
};

module.exports = errorHandler;
