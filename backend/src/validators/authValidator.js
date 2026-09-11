const Joi = require('joi');

const registerSchema = Joi.object({
  body: Joi.object({
    name: Joi.string().trim().min(1).max(100).required().messages({
      'any.required': 'Name is required',
      'string.empty': 'Name cannot be empty',
    }),
    email: Joi.string().trim().email().lowercase().required().messages({
      'any.required': 'Email is required',
      'string.email': 'Email must be a valid email address',
    }),
    password: Joi.string().min(6).max(128).required().messages({
      'any.required': 'Password is required',
      'string.min': 'Password must be at least 6 characters long',
    }),
  }).required(),
});

const loginSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().trim().email().lowercase().required().messages({
      'any.required': 'Email is required',
      'string.email': 'Email must be a valid email address',
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required',
      'string.empty': 'Password cannot be empty',
    }),
  }).required(),
});

module.exports = {
  registerSchema,
  loginSchema,
};
