const Joi = require('joi');

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const notificationIdParamSchema = Joi.object({
  params: Joi.object({
    id: Joi.string().pattern(objectIdPattern).required().messages({
      'string.pattern.base': 'id must be a valid 24-character hexadecimal ObjectId',
      'any.required': 'id parameter is required',
    }),
  }).required(),
});

const queryNotificationsSchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    resolved: Joi.boolean().optional(),
  }).optional(),
});

module.exports = {
  notificationIdParamSchema,
  queryNotificationsSchema,
};
