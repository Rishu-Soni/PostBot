const mongoose = require('mongoose');
const { ContentBatch, Post, User, CreditTransaction } = require('../models');
const aiService = require('../services/aiService');
const imageService = require('../services/imageService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Intake guided prompt, elaborate strategy internally, and recommend day count.
 * Creates ContentBatch with status: 'draft'.
 * Never returns elaboratedStrategy to the client.
 * Route: POST /api/v1/batches
 */
const createBatch = asyncHandler(async (req, res) => {
  const { theme, professionalLevel, tone, writingStyle, brainDump } = req.body;

  const intake = {
    theme,
    professionalLevel: professionalLevel || null,
    tone: tone || null,
    writingStyle: writingStyle || null,
    brainDump,
  };

  // Call AI elaboration stub (internal, hidden from user)
  const { elaboratedStrategy, recommendedDayCount } = await aiService.elaborateBrainDump(intake);

  const batch = await ContentBatch.create({
    userId: req.user._id,
    intake,
    elaboratedStrategy,
    recommendedDayCount,
    finalDayCount: recommendedDayCount,
    status: 'draft',
  });

  res.status(201).json({
    success: true,
    data: {
      batchId: batch._id,
      recommendedDayCount: batch.recommendedDayCount,
    },
  });
});

/**
 * List the current user's content batches (paginated).
 * Route: GET /api/v1/batches
 */
const listBatches = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const filter = { userId: req.user._id };
  if (req.query.status) {
    filter.status = req.query.status;
  }

  const [batches, total] = await Promise.all([
    ContentBatch.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ContentBatch.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      batches,
      total,
      page,
      limit,
    },
  });
});

/**
 * Fetch a single batch and its posts for the confirmation screen.
 * elaboratedStrategy is excluded by schema default (select: false).
 * Route: GET /api/v1/batches/:batchId
 */
const getBatch = asyncHandler(async (req, res) => {
  const batch = req.batchIdDoc;

  const posts = await Post.find({ batchId: batch._id }).sort({ dayIndex: 1 });

  res.status(200).json({
    success: true,
    data: {
      batch,
      posts,
    },
  });
});

/**
 * Adjust day count within ±2 of recommendedDayCount and generate daily posts.
 * Follows credit-charge ordering rule (§5): generates posts first, charges on success.
 * Route: PATCH /api/v1/batches/:batchId/day-count
 */
const updateDayCount = asyncHandler(async (req, res, next) => {
  const batch = req.batchIdDoc;
  const { finalDayCount } = req.body;

  if (batch.status !== 'draft') {
    return next(new AppError('Day count can only be adjusted while batch is in draft status.', 400));
  }

  // Enforce the ±2 adjustment rule
  const diff = Math.abs(finalDayCount - batch.recommendedDayCount);
  if (diff > 2) {
    return next(
      new AppError(
        `Final day count must be within ±2 days of the recommended count (${batch.recommendedDayCount}). Received: ${finalDayCount}.`,
        400
      )
    );
  }

  // Pre-check credits before starting external calls (1 credit per generated post)
  if ((req.user.creditBalance || 0) < finalDayCount) {
    return next(
      new AppError(
        `Insufficient credits. Generating ${finalDayCount} posts requires ${finalDayCount} credits, but you have ${req.user.creditBalance || 0}.`,
        402
      )
    );
  }

  // Fetch hidden elaboratedStrategy needed for generation
  const batchWithStrategy = await ContentBatch.findById(batch._id).select('+elaboratedStrategy');
  if (!batchWithStrategy) {
    return next(new AppError('Batch record not found.', 404));
  }

  // Step 1: Call external AI and image pipelines first (outside database transaction)
  const generatedPostsData = [];
  for (let dayIndex = 1; dayIndex <= finalDayCount; dayIndex++) {
    const { caption, hashtags } = await aiService.generatePostContent(
      batchWithStrategy.elaboratedStrategy,
      dayIndex,
      finalDayCount
    );

    const imageData = await imageService.findOrGenerateImage({
      caption,
      topic: batch.intake.theme,
      userKey: req.user.imageGenApiKey,
      provider: req.user.imageGenProvider,
    });

    generatedPostsData.push({
      batchId: batch._id,
      userId: req.user._id,
      dayIndex,
      caption,
      hashtags: hashtags || [],
      image: imageData,
      editHistory: [],
      regenerationCount: 0,
      // Note: scheduledTime is required in the Post schema; initialize with a tentative placeholder
      scheduledTime: new Date(Date.now() + dayIndex * 24 * 60 * 60 * 1000),
      status: 'pending',
    });
  }

  // Step 2: Now that all generations succeeded, deduct credits and insert docs atomically
  // Note: Multi-document transactions require a MongoDB replica set (even a single-node replica set).
  const session = await mongoose.startSession();
  session.startTransaction();

  let createdPosts;
  try {
    const user = await User.findById(req.user._id).session(session);
    if (user.creditBalance < finalDayCount) {
      throw new AppError('Insufficient credits to complete post generation.', 402);
    }

    user.creditBalance -= finalDayCount;
    await user.save({ session });

    // Record credit transaction
    await CreditTransaction.create(
      [
        {
          userId: user._id,
          reason: 'generation',
          amount: -finalDayCount,
          balanceAfter: user.creditBalance,
          note: `Generated ${finalDayCount} posts for batch ${batch._id}`,
        },
      ],
      { session }
    );

    // Clean up any previously generated draft posts for this batch
    await Post.deleteMany({ batchId: batch._id }).session(session);

    // Insert new posts
    createdPosts = await Post.insertMany(generatedPostsData, { session });

    // Update batch day count
    batch.finalDayCount = finalDayCount;
    await batch.save({ session });

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
      batch,
      posts: createdPosts,
    },
  });
});

/**
 * Confirm batch: validate all posts have caption & image, schedule posting times,
 * and activate the batch.
 * Route: POST /api/v1/batches/:batchId/confirm
 */
const confirmBatch = asyncHandler(async (req, res, next) => {
  const batch = req.batchIdDoc;

  if (batch.status !== 'draft') {
    return next(new AppError('Only draft batches can be confirmed.', 400));
  }

  const posts = await Post.find({ batchId: batch._id }).sort({ dayIndex: 1 });
  if (posts.length === 0) {
    return next(
      new AppError(
        'Cannot confirm batch: no posts have been generated yet. Please set day count first.',
        400
      )
    );
  }

  // Reject if any post is missing caption or image
  for (const post of posts) {
    if (!post.caption || !post.image || !post.image.url) {
      return next(
        new AppError(
          `Post for day ${post.dayIndex} is missing caption or image. All posts must be complete before confirming.`,
          400
        )
      );
    }
  }

  // Parse user posting schedule preferences
  const defaultPostTime = req.user.defaultPostTime || '09:00';
  const [targetHourStr, targetMinuteStr] = defaultPostTime.split(':');
  const targetHour = parseInt(targetHourStr, 10) || 9;
  const targetMinute = parseInt(targetMinuteStr, 10) || 0;

  // Compute scheduledTime per post: dayIndex days from now at preferred posting time
  const now = new Date();
  for (const post of posts) {
    const scheduledDate = new Date(now);
    scheduledDate.setUTCDate(now.getUTCDate() + post.dayIndex);
    scheduledDate.setUTCHours(targetHour, targetMinute, 0, 0);

    post.scheduledTime = scheduledDate;
    post.status = 'pending';
    await post.save();
  }

  batch.status = 'active';
  batch.confirmedAt = new Date();
  await batch.save();

  res.status(200).json({
    success: true,
    data: {
      batch,
      scheduledPostsCount: posts.length,
    },
  });
});

/**
 * Cancel and delete an in-progress batch and its draft posts.
 * Only allowed while batch.status === 'draft'.
 * Route: DELETE /api/v1/batches/:batchId
 */
const deleteBatch = asyncHandler(async (req, res, next) => {
  const batch = req.batchIdDoc;

  if (batch.status !== 'draft') {
    return next(
      new AppError('Only draft batches can be cancelled and deleted.', 400)
    );
  }

  await Post.deleteMany({ batchId: batch._id });
  await ContentBatch.findByIdAndDelete(batch._id);

  res.status(200).json({
    success: true,
    data: {
      message: 'Batch and associated draft posts were cancelled and deleted successfully.',
    },
  });
});

module.exports = {
  createBatch,
  listBatches,
  getBatch,
  updateDayCount,
  confirmBatch,
  deleteBatch,
};
