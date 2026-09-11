const Joi = require('joi');

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const createBatchSchema = Joi.object({
  body: Joi.object({
    theme: Joi.string().trim().min(1).max(200).required().messages({
      'any.required': 'Theme is required',
      'string.empty': 'Theme cannot be empty',
    }),
    professionalLevel: Joi.string().trim().allow(null, '').optional(),
    tone: Joi.string().trim().allow(null, '').optional(),
    writingStyle: Joi.string().trim().allow(null, '').optional(),
    brainDump: Joi.string().trim().min(1).required().messages({
      'any.required': 'Brain dump is required',
      'string.empty': 'Brain dump cannot be empty',
    }),
  }).required(),
});

const batchIdParamSchema = Joi.object({
  params: Joi.object({
    batchId: Joi.string().pattern(objectIdPattern).required().messages({
      'string.pattern.base': 'batchId must be a valid 24-character hexadecimal ObjectId',
      'any.required': 'batchId parameter is required',
    }),
  }).required(),
});

const updateDayCountSchema = Joi.object({
  params: Joi.object({
    batchId: Joi.string().pattern(objectIdPattern).required().messages({
      'string.pattern.base': 'batchId must be a valid 24-character hexadecimal ObjectId',
      'any.required': 'batchId parameter is required',
    }),
  }).required(),
  body: Joi.object({
    finalDayCount: Joi.number().integer().min(1).required().messages({
      'any.required': 'finalDayCount is required',
      'number.base': 'finalDayCount must be a number',
      'number.min': 'finalDayCount must be at least 1',
    }),
  }).required(),
});

const listBatchesQuerySchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string().valid('draft', 'confirmed', 'active', 'exhausted').optional(),
  }).optional(),
});

module.exports = {
  createBatchSchema,
  batchIdParamSchema,
  updateDayCountSchema,
  listBatchesQuerySchema,
};
