const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const { ContentBatch, Post, User, CreditTransaction } = require('../models');
const aiService = require('../services/aiService');
const imageService = require('../services/imageService');
const creditService = require('../services/creditService');
const { cleanupExpiredDrafts } = require('../services/schedulerService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Intake guided prompt, elaborate strategy internally, and recommend day count.
 * Creates ContentBatch with status: 'draft'.
 * Never returns elaboratedStrategy to the client.
 * Route: POST /api/v1/batches
 */
const createBatch = asyncHandler(async (req, res) => {
  const { theme, professionalLevel, tone, writingStyle, brainDump, weeklyGoal, voiceDNA, layoutTemplates } = req.body;

  const intake = {
    theme: theme || 'Weekly Founder Insights',
    professionalLevel: professionalLevel || voiceDNA?.role || null,
    tone: tone || voiceDNA?.baseTone || null,
    writingStyle: writingStyle || null,
    brainDump,
    weeklyGoal: weeklyGoal || null,
    voiceDNA: voiceDNA || null,
    layoutTemplates: layoutTemplates || [],
  };

  // Call AI elaboration stub (internal, hidden from user)
  const { elaboratedStrategy, recommendedDayCount, extractedTheme, strategyOverview, postsStrategy } =
    await aiService.elaborateBrainDump(intake);

  const batch = await ContentBatch.create({
    userId: req.user._id,
    intake,
    extractedTheme: extractedTheme || intake.theme,
    strategyOverview,
    postsStrategy: postsStrategy || [],
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
      extractedTheme: batch.extractedTheme,
      strategyOverview: batch.strategyOverview,
      postsStrategy: batch.postsStrategy,
    },
  });
});

/**
 * List the current user's content batches (paginated).
 * Purges drafts older than 3 days before querying.
 * Route: GET /api/v1/batches
 */
const listBatches = asyncHandler(async (req, res) => {
  // Purge any drafts older than 3 days across the database
  await cleanupExpiredDrafts();

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
 * If the draft is older than 3 days, deletes it entirely from the database and returns 404.
 * elaboratedStrategy is excluded by schema default (select: false).
 * Route: GET /api/v1/batches/:batchId
 */
const getBatch = asyncHandler(async (req, res, next) => {
  const batch = req.batchIdDoc;

  // Check if draft has expired (7-day limit)
  if (batch.status === 'draft') {
    const isExpired =
      (batch.expiresAt && new Date(batch.expiresAt) <= new Date()) ||
      (batch.createdAt && new Date(batch.createdAt) <= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

    if (isExpired) {
      await Post.deleteMany({ batchId: batch._id });
      await ContentBatch.findByIdAndDelete(batch._id);
      return next(
        new AppError('This draft batch has expired (7-day retention limit) and was permanently deleted from the database.', 404)
      );
    }
  }

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
  const finalDayCount = req.body.finalDayCount;
  const scheduledDates = req.body.scheduledDates || req.body.dates;
  const postConfigs = req.body.postConfigs || req.body.postsStrategy || [];

  if (batch.status !== 'draft') {
    return next(new AppError('Day count can only be adjusted while batch is in draft status.', 400));
  }

  // Enforce the ±2 adjustment rule with floor protection (Fix 2)
  const minAllowed = Math.max(1, batch.recommendedDayCount - 2);
  const maxAllowed = batch.recommendedDayCount + 2;
  if (finalDayCount < minAllowed || finalDayCount > maxAllowed) {
    return next(
      new AppError(`finalDayCount must be between ${minAllowed} and ${maxAllowed}`, 400)
    );
  }

  // Query existing posts for this batch to support resumable partial batch generation (Fix 4)
  const existingPosts = await Post.find({ batchId: batch._id }).sort({ dayIndex: 1 });
  const maxExistingDay = existingPosts.length > 0 ? Math.max(...existingPosts.map((p) => p.dayIndex)) : 0;

  // Guard against finalDayCount being decreased below the number of days already generated
  if (finalDayCount < existingPosts.length || finalDayCount < maxExistingDay) {
    return next(
      new AppError(
        `Cannot reduce finalDayCount to ${finalDayCount}. ${existingPosts.length} day(s) have already been generated (up to day ${maxExistingDay}) for this batch.`,
        400
      )
    );
  }

  // Compute which dayIndex values are still missing (1..finalDayCount)
  const existingDayIndices = new Set(existingPosts.map((p) => p.dayIndex));
  const missingDayIndices = [];
  for (let d = 1; d <= finalDayCount; d++) {
    if (!existingDayIndices.has(d)) {
      missingDayIndices.push(d);
    }
  }

  // If all days for the requested finalDayCount already exist, simply update finalDayCount and return
  if (missingDayIndices.length === 0) {
    batch.finalDayCount = finalDayCount;
    await batch.save();

    if (Array.isArray(scheduledDates)) {
      for (const p of existingPosts) {
        if (scheduledDates[p.dayIndex - 1]) {
          const d = new Date(scheduledDates[p.dayIndex - 1]);
          if (!isNaN(d.getTime())) {
            p.scheduledTime = d;
            await p.save();
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        batch,
        posts: existingPosts,
      },
    });
  }

  // Pre-check credits only for the missing days generated in this call (1 credit per post)
  const creditsNeeded = missingDayIndices.length;
  if ((req.user.creditBalance || 0) < creditsNeeded) {
    return next(
      new AppError(
        `Insufficient credits. Generating ${creditsNeeded} remaining post(s) requires ${creditsNeeded} credits, but you have ${req.user.creditBalance || 0}.`,
        402
      )
    );
  }

  // Fetch hidden elaboratedStrategy needed for generation
  const batchWithStrategy = await ContentBatch.findById(batch._id).select('+elaboratedStrategy');
  if (!batchWithStrategy) {
    return next(new AppError('Batch record not found.', 404));
  }

  // Generate missing days sequentially. Save & charge per day (Fix 4: resumable partial batch generation)
  for (const dayIndex of missingDayIndices) {
    const dayConfig = postConfigs.find((c) => c.dayIndex === dayIndex) ||
      (batchWithStrategy.postsStrategy && batchWithStrategy.postsStrategy.find((c) => c.dayIndex === dayIndex)) ||
      {};

    if (!dayConfig.voiceDNA && batchWithStrategy.intake?.voiceDNA) {
      dayConfig.voiceDNA = batchWithStrategy.intake.voiceDNA;
    }

    const { caption, hashtags } = await aiService.generatePostContent(
      batchWithStrategy.elaboratedStrategy,
      dayIndex,
      finalDayCount,
      dayConfig
    );

    // Images are no longer auto-generated — users choose to upload or generate on the review page
    const imageData = null;

    // Save post & charge 1 credit in an atomic transaction for this successfully generated day
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const user = await User.findById(req.user._id).session(session);
      if ((user.creditBalance || 0) < 1) {
        throw new AppError('Insufficient credits to complete post generation.', 402);
      }

      user.creditBalance -= 1;
      await user.save({ session });

      let postScheduledTime;
      let isExplicitlyScheduled = false;
      if (Array.isArray(scheduledDates) && scheduledDates[dayIndex - 1]) {
        const d = new Date(scheduledDates[dayIndex - 1]);
        if (!isNaN(d.getTime())) {
          postScheduledTime = d;
          isExplicitlyScheduled = true;
        }
      }
      if (!postScheduledTime) {
        postScheduledTime = new Date(Date.now() + dayIndex * 24 * 60 * 60 * 1000);
      }

      const [newPost] = await Post.create(
        [
          {
            batchId: batch._id,
            userId: req.user._id,
            dayIndex,
            caption,
            hashtags: hashtags || [],
            image: imageData,
            editHistory: [],
            regenerationCount: 0,
            scheduledTime: postScheduledTime,
            manuallyScheduled: isExplicitlyScheduled,
            status: 'pending',
          },
        ],
        { session }
      );

      await CreditTransaction.create(
        [
          {
            userId: user._id,
            postId: newPost._id,
            reason: 'generation',
            amount: -1,
            balanceAfter: user.creditBalance,
            note: `Generated post for day ${dayIndex} of batch ${batch._id}`,
          },
        ],
        { session }
      );

      await session.commitTransaction();
    } catch (dayError) {
      await session.abortTransaction();
      throw dayError;
    } finally {
      session.endSession();
    }
  }

  // Update batch finalDayCount once all missing days have completed
  batch.finalDayCount = finalDayCount;
  await batch.save();

  const allPosts = await Post.find({ batchId: batch._id }).sort({ dayIndex: 1 });

  res.status(200).json({
    success: true,
    data: {
      batch,
      posts: allPosts,
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

  if (batch.finalDayCount && posts.length < batch.finalDayCount) {
    return next(
      new AppError(
        `Cannot confirm batch: only ${posts.length} of ${batch.finalDayCount} posts have been generated. Please complete post generation first.`,
        400
      )
    );
  }

  // Reject if any post is missing a caption (images are optional — text-only posts are valid on LinkedIn)
  for (const post of posts) {
    if (!post.caption) {
      return next(
        new AppError(
          `Post for day ${post.dayIndex} is missing a caption. All posts must have a caption before confirming.`,
          400
        )
      );
    }
  }

  // Parse user posting schedule preferences and timezone
  const defaultPostTime = req.user.defaultPostTime || '09:00';
  const [targetHourStr, targetMinuteStr] = defaultPostTime.split(':');
  const targetHour = parseInt(targetHourStr, 10) || 9;
  const targetMinute = parseInt(targetMinuteStr, 10) || 0;

  const userTimezone = req.user.timezone || 'UTC';
  let nowInUserTz = DateTime.now().setZone(userTimezone);
  if (!nowInUserTz.isValid) {
    nowInUserTz = DateTime.now().setZone('UTC');
  }

  // Compute scheduledTime per post: skip posts that were manually scheduled so user's choice is preserved
  for (const post of posts) {
    const isManuallyScheduled =
      post.manuallyScheduled ||
      (post.editHistory && post.editHistory.some((e) => e.type === 'reschedule'));

    if (!isManuallyScheduled) {
      let scheduledDt;
      if (post.scheduledTime && !isNaN(new Date(post.scheduledTime).getTime())) {
        const dt = DateTime.fromJSDate(new Date(post.scheduledTime)).setZone(userTimezone);
        scheduledDt = dt.set({ hour: targetHour, minute: targetMinute, second: 0, millisecond: 0 });
      } else {
        scheduledDt = nowInUserTz
          .plus({ days: post.dayIndex })
          .set({ hour: targetHour, minute: targetMinute, second: 0, millisecond: 0 });
      }

      post.scheduledTime = scheduledDt.toJSDate();
    }

    post.status = 'pending';
    await post.save();
  }

  batch.status = 'active';
  batch.confirmedAt = new Date();
  batch.expiresAt = null;
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
 * Delete a batch and its associated posts.
 * Cancels any remaining scheduled posts and refunds credits for unposted posts.
 * Route: DELETE /api/v1/batches/:batchId
 */
const deleteBatch = asyncHandler(async (req, res, next) => {
  const batch = req.batchIdDoc;

  const posts = await Post.find({ batchId: batch._id });
  const unpostedPosts = posts.filter(
    (p) => p.status !== 'posted' && !p.creditRefunded
  );
  const unrefundedCount = unpostedPosts.length;
  if (unrefundedCount > 0) {
    const isDraft = batch.status === 'draft';
    await creditService.addCredits(
      req.user._id,
      unrefundedCount,
      'refund',
      `Refund for ${unrefundedCount} ${isDraft ? 'unconfirmed' : 'unposted'} post(s) from deleted batch ${batch._id}`
    );
  }

  await Post.deleteMany({ batchId: batch._id });
  await ContentBatch.findByIdAndDelete(batch._id);

  res.status(200).json({
    success: true,
    data: {
      message: 'Batch and associated posts were deleted successfully.',
      refundedCredits: unrefundedCount,
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
