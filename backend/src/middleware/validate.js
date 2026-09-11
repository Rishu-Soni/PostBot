const AppError = require('../utils/AppError');

/**
 * Generic factory for Joi schema validation.
 * Validates req.body, req.params, and/or req.query.
 * Rejects with 400 and structured field-level error messages.
 *
 * @param {import('joi').Schema} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
const validate = (schema) => (req, res, next) => {
  if (!schema || typeof schema.validate !== 'function') {
    return next();
  }

  const schemaDescription = schema.describe ? schema.describe() : {};
  const schemaKeys = schemaDescription.keys ? Object.keys(schemaDescription.keys) : [];

  const isMultipartSchema = ['body', 'params', 'query'].some((key) => schemaKeys.includes(key));

  let dataToValidate;
  if (isMultipartSchema) {
    dataToValidate = {};
    if (schemaKeys.includes('body')) dataToValidate.body = req.body;
    if (schemaKeys.includes('params')) dataToValidate.params = req.params;
    if (schemaKeys.includes('query')) dataToValidate.query = req.query;
  } else {
    dataToValidate = req.body;
  }

  const { error, value } = schema.validate(dataToValidate, {
    abortEarly: false,
    stripUnknown: false,
  });

  if (error) {
    const formattedErrors = error.details.map((detail) => {
      const pathArray = [...detail.path];
      if (isMultipartSchema && ['body', 'params', 'query'].includes(pathArray[0])) {
        pathArray.shift();
      }
      return {
        field: pathArray.join('.') || 'root',
        message: detail.message.replace(/"/g, ''),
      };
    });

    return next(new AppError('Validation failed', 400, formattedErrors));
  }

  // Assign sanitized/casted values back to the request object
  if (isMultipartSchema) {
    if (value.body !== undefined) req.body = value.body;
    if (value.params !== undefined) req.params = value.params;
    if (value.query !== undefined) req.query = value.query;
  } else {
    req.body = value;
  }

  next();
};

module.exports = validate;
