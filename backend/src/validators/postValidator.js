const Joi = require('joi');

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const postIdParamSchema = Joi.object({
  params: Joi.object({
    postId: Joi.string().pattern(objectIdPattern).required().messages({
      'string.pattern.base': 'postId must be a valid 24-character hexadecimal ObjectId',
      'any.required': 'postId parameter is required',
    }),
  }).required(),
});

const updatePostSchema = Joi.object({
  params: Joi.object({
    postId: Joi.string().pattern(objectIdPattern).required().messages({
      'string.pattern.base': 'postId must be a valid 24-character hexadecimal ObjectId',
      'any.required': 'postId parameter is required',
    }),
  }).required(),
  body: Joi.object({
    caption: Joi.string().trim().min(1).optional().messages({
      'string.empty': 'Caption cannot be empty',
    }),
    hashtags: Joi.array()
      .items(Joi.string().trim().pattern(/^#?[a-zA-Z0-9_]+$/))
      .max(5)
      .optional()
      .messages({
        'array.max': 'A post can have at most 5 candidate hashtags',
      }),
  })
    .or('caption', 'hashtags')
    .required()
    .messages({
      'object.missing': 'At least one field (caption or hashtags) must be provided for manual edit',
    }),
});

const regeneratePostSchema = Joi.object({
  params: Joi.object({
    postId: Joi.string().pattern(objectIdPattern).required().messages({
      'string.pattern.base': 'postId must be a valid 24-character hexadecimal ObjectId',
      'any.required': 'postId parameter is required',
    }),
  }).required(),
  body: Joi.object({
    part: Joi.string()
      .valid('caption', 'hashtags', 'image', 'whole')
      .required()
      .messages({
        'any.required': 'part is required',
        'any.only': "part must be one of: 'caption', 'hashtags', 'image', 'whole'",
      }),
  }).required(),
});

module.exports = {
  postIdParamSchema,
  updatePostSchema,
  regeneratePostSchema,
};
