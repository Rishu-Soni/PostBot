const mongoose = require('mongoose');
const { Post, User, CreditTransaction } = require('../models');
const aiService = require('../services/aiService');
const imageService = require('../services/imageService');
const linkedinService = require('../services/linkedinService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Fetch a single post by ID.
 * Route: GET /api/v1/posts/:postId
 */
const getPost = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      post: req.postIdDoc,
    },
  });
});

/**
 * Manual edit for post caption or hashtags.
 * Free and unlimited. Only allowed while post.status === 'pending'.
 * Route: PATCH /api/v1/posts/:postId
 */
const updatePost = asyncHandler(async (req, res, next) => {
  const post = req.postIdDoc;
  const { caption, hashtags } = req.body;

  if (post.status !== 'pending') {
    return next(new AppError('Only pending posts can be manually edited.', 400));
  }

  let fieldEdited = 'caption';
  if (caption !== undefined) {
    post.caption = caption;
    fieldEdited = 'caption';
  }
  if (hashtags !== undefined) {
    post.hashtags = hashtags;
    fieldEdited = 'hashtags';
  }

  post.editHistory.push({
    editedAt: new Date(),
    field: fieldEdited,
    type: 'manual_edit',
  });

  await post.save();

  res.status(200).json({
    success: true,
    data: {
      post,
    },
  });
});

/**
 * Regenerate post parts (caption, hashtags, image, or whole).
 * Follows credit-charge ordering rule in §5:
 * Call external AI/image service first, only deduct 1 credit on success within a transaction.
 * Route: POST /api/v1/posts/:postId/regenerate
 */
const regenerate = asyncHandler(async (req, res, next) => {
  const post = req.postIdDoc;
  const { part } = req.body;

  if (post.status !== 'pending') {
    return next(new AppError('Only pending posts can be regenerated.', 400));
  }

  // Pre-check balance before making expensive external calls
  if ((req.user.creditBalance || 0) < 1) {
    return next(
      new AppError('Insufficient credits. Regenerating a post costs 1 credit.', 402)
    );
  }

  // Step 1: External AI / image generation first (outside database transaction)
  let regeneratedCaption = post.caption;
  let regeneratedHashtags = post.hashtags;
  let regeneratedImage = post.image;

  if (part === 'caption' || part === 'hashtags' || part === 'whole') {
    const aiResult = await aiService.regeneratePostContent(post, part);
    if (aiResult.caption && (part === 'caption' || part === 'whole')) {
      regeneratedCaption = aiResult.caption;
    }
    if (aiResult.hashtags && (part === 'hashtags' || part === 'whole')) {
      regeneratedHashtags = aiResult.hashtags;
    }
  }

  if (part === 'image' || part === 'whole') {
    regeneratedImage = await imageService.findOrGenerateImage({
      caption: regeneratedCaption,
      topic: 'LinkedIn Post',
      userKey: req.user.imageGenApiKey,
      provider: req.user.imageGenProvider,
    });
  }

  // Step 2: Now that external generation succeeded, deduct credit & update post atomically
  // Note: Multi-document transactions require a MongoDB replica set (even a single-node replica set).
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(req.user._id).session(session);
    if (user.creditBalance < 1) {
      throw new AppError('Insufficient credits to complete post regeneration.', 402);
    }

    user.creditBalance -= 1;
    await user.save({ session });

    // Record credit transaction row
    await CreditTransaction.create(
      [
        {
          userId: user._id,
          postId: post._id,
          reason: 'regeneration',
          amount: -1,
          balanceAfter: user.creditBalance,
          note: `Regenerated post part: ${part}`,
        },
      ],
      { session }
    );

    // Update post fields
    post.caption = regeneratedCaption;
    post.hashtags = regeneratedHashtags;
    post.image = regeneratedImage;
    post.regenerationCount = (post.regenerationCount || 0) + 1;

    post.editHistory.push({
      editedAt: new Date(),
      field: part === 'whole' ? 'caption' : part,
      type: 'regeneration',
    });

    await post.save({ session });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  res.status(200).json({
    success: true,
    data: {
      post,
    },
  });
});

/**
 * Direct user image upload for a post.
 * Sets image.source = 'user_upload' at 0 credit cost.
 * Route: POST /api/v1/posts/:postId/image
 */
const uploadImage = asyncHandler(async (req, res, next) => {
  const post = req.postIdDoc;

  if (!req.file) {
    return next(new AppError('No image file provided. Please upload an image.', 400));
  }

  if (post.status !== 'pending') {
    return next(new AppError('Images can only be uploaded to pending posts.', 400));
  }

  // Process and upload file through imageService
  const uploadResult = await imageService.uploadUserImage(req.file);

  post.image = {
    url: uploadResult.url,
    source: 'user_upload',
    stockProvider: null,
    aiProvider: null,
    altText: post.image?.altText || null,
  };

  post.editHistory.push({
    editedAt: new Date(),
    field: 'image',
    type: 'manual_edit',
  });

  await post.save();

  res.status(200).json({
    success: true,
    data: {
      post,
    },
  });
});

/**
 * Immediate post-now validation and retry action.
 * Directly publishes the post via linkedinService, bypassing the scheduler.
 * Accepts posts with status 'pending' or 'failed' (allows retrying failed posts).
 * Rejects posts already 'posted' or in another state.
 * No credit is charged for retries.
 * Route: POST /api/v1/posts/:postId/post-now
 */
const postNow = asyncHandler(async (req, res, next) => {
  const post = req.postIdDoc;

  if (post.status === 'posted') {
    return next(new AppError('This post has already been published to LinkedIn.', 400));
  }

  if (post.status !== 'pending' && post.status !== 'failed') {
    return next(
      new AppError(
        `Cannot publish post with status '${post.status}'. Only 'pending' or 'failed' posts can be published.`,
        400
      )
    );
  }

  // Load user with OAuth access and refresh tokens
  const userWithToken = await User.findById(req.user._id).select(
    '+linkedin.accessToken +linkedin.refreshToken'
  );

  if (!userWithToken?.linkedin?.isConnected || !userWithToken?.linkedin?.accessToken) {
    return next(
      new AppError(
        'LinkedIn account is not connected. Please connect your LinkedIn profile before posting.',
        409
      )
    );
  }

  // Proactively check token expiry and refresh if expired or expiring imminently
  const tokenExpiresAt = userWithToken.linkedin.tokenExpiresAt
    ? new Date(userWithToken.linkedin.tokenExpiresAt).getTime()
    : 0;
  if (!tokenExpiresAt || tokenExpiresAt - Date.now() <= 60 * 60 * 1000) {
    try {
      await linkedinService.refreshToken(userWithToken);
    } catch (refreshErr) {
      post.status = 'failed';
      post.failureReason = 'token_expired';
      await post.save();
      return next(
        new AppError(
          `Failed to refresh expired LinkedIn token: ${refreshErr.message}`,
          401
        )
      );
    }
  }

  // Reset failureReason going into the attempt
  post.failureReason = null;

  try {
    const publishResult = await linkedinService.createPost(userWithToken, post);

    post.status = 'posted';
    post.linkedinPostId = publishResult.linkedinPostId;
    post.postedAt = publishResult.postedAt || new Date();
    post.failureReason = null;
    await post.save();

    res.status(200).json({
      success: true,
      data: {
        post,
      },
    });
  } catch (publishErr) {
    post.status = 'failed';
    post.failureReason = publishErr.message || 'LinkedIn publication failed';
    await post.save();
    return next(publishErr);
  }
});

module.exports = {
  getPost,
  updatePost,
  regenerate,
  uploadImage,
  postNow,
};
