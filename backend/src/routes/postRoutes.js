const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const { Post } = require('../models');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ownsResource } = require('../middleware/ownership');
const creditCheck = require('../middleware/creditCheck');
const rateLimiter = require('../middleware/rateLimiter');
const linkedinGuard = require('../middleware/linkedinGuard');
const upload = require('../middleware/upload');
const { validateImageBuffer } = require('../middleware/upload');
const { updatePostSchema, regeneratePostSchema } = require('../validators');

// Fetch single post
router.get(
  '/:postId',
  auth,
  ownsResource(Post, 'postId'),
  postController.getPost
);

// Manual edit (caption / hashtags) - free & unlimited
router.patch(
  '/:postId',
  auth,
  ownsResource(Post, 'postId'),
  validate(updatePostSchema),
  postController.updatePost
);

// Regenerate part or whole post - 1 credit per use
router.post(
  '/:postId/regenerate',
  auth,
  ownsResource(Post, 'postId'),
  rateLimiter,
  creditCheck,
  validate(regeneratePostSchema),
  postController.regenerate
);

// Direct user image upload - 0 credits (supports both /image and /image/upload)
router.post(
  '/:postId/image',
  auth,
  ownsResource(Post, 'postId'),
  upload.single('image'),
  validateImageBuffer,
  postController.uploadImage
);
router.post(
  '/:postId/image/upload',
  auth,
  ownsResource(Post, 'postId'),
  upload.single('image'),
  validateImageBuffer,
  postController.uploadImage
);


// Stock photo selection - 0 credits (free manual choice)
router.post(
  '/:postId/image/stock',
  auth,
  ownsResource(Post, 'postId'),
  postController.stockImage
);

// On-demand AI image generation - 1 credit (calls AI, charges on success)
router.post(
  '/:postId/image/generate',
  auth,
  ownsResource(Post, 'postId'),
  rateLimiter,
  creditCheck,
  postController.generateImage
);

// Immediate publish validation button (bypasses scheduler)
router.post(
  '/:postId/post-now',
  auth,
  ownsResource(Post, 'postId'),
  linkedinGuard,
  postController.postNow
);

module.exports = router;
