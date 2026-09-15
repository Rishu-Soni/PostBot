const { Post, User, ContentBatch } = require('../models');
const linkedinService = require('./linkedinService');
const notificationService = require('./notificationService');

/**
 * Imminent token expiry window in milliseconds.
 * If a user's LinkedIn access token expires within 1 hour, proactively refresh it.
 */
const IMMINENT_EXPIRY_THRESHOLD_MS = 60 * 60 * 1000;
const STUCK_PROCESSING_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Executes a single complete scheduler pass across all due pending posts (§6).
 * Called automatically by the cron runner or manually via POST /api/v1/internal/scheduler/run-now.
 *
 * 1. Resets any posts stuck in 'processing' state back to 'pending'.
 * 2. Queries due pending posts (scheduledTime <= now).
 * 3. Atomically claims each due post with status 'processing'.
 * 4. Validates user LinkedIn credentials and proactively refreshes expiring tokens.
 * 5. Publishes due posts sequentially to respect LinkedIn API burst limits.
 * 6. Dispatches failure notifications on API or token errors.
 * 7. Detects batch exhaustion and triggers low-stock reminders.
 *
 * @returns {Promise<{ processedCount: number, postedCount: number, failedCount: number, exhaustedBatchesCount: number }>}
 */
const runSchedulerPass = async () => {
  const now = new Date();
  console.log(`[Scheduler] Starting scheduler pass at ${now.toISOString()}`);

  // Step 1: Reset posts stuck in 'processing' state (e.g. from crashed server processes) older than 10 minutes
  const stuckCutoff = new Date(Date.now() - STUCK_PROCESSING_THRESHOLD_MS);
  const resetResult = await Post.updateMany(
    {
      status: 'processing',
      updatedAt: { $lte: stuckCutoff },
    },
    {
      $set: { status: 'pending' },
    }
  );

  if (resetResult.modifiedCount > 0) {
    console.warn(
      `[Scheduler] Reset ${resetResult.modifiedCount} stuck 'processing' post(s) back to 'pending'.`
    );
  }

  // Step 2: Query due pending posts
  const duePosts = await Post.find({
    status: 'pending',
    scheduledTime: { $lte: now },
  }).sort({ scheduledTime: 1 });

  let processedCount = 0;
  let postedCount = 0;
  let failedCount = 0;
  let exhaustedBatchesCount = 0;

  // Track batches that have reached exhaustion in this pass to avoid duplicate notifications
  const exhaustedBatchesInPass = new Set();

  /**
   * Helper to evaluate whether a post's parent ContentBatch has fully resolved all posts.
   * Only triggers low-stock notification once per batch per pass.
   */
  const checkBatchExhaustion = async (post, userDoc) => {
    if (!post?.batchId) return;
    const batchIdStr = post.batchId.toString();

    if (exhaustedBatchesInPass.has(batchIdStr)) {
      return;
    }

    const batch = await ContentBatch.findById(post.batchId);
    if (!batch || batch.status === 'exhausted') {
      exhaustedBatchesInPass.add(batchIdStr);
      return;
    }

    // Check if any posts in this batch remain unresolved (i.e. not posted and not failed)
    const remainingCount = await Post.countDocuments({
      batchId: batch._id,
      status: { $nin: ['posted', 'failed'] },
    });

    if (remainingCount === 0) {
      batch.status = 'exhausted';
      await batch.save();
      exhaustedBatchesInPass.add(batchIdStr);
      exhaustedBatchesCount++;

      console.log(`[Scheduler] ContentBatch ${batch._id} is now exhausted. Dispatching low-stock notification.`);
      try {
        const targetUser = userDoc || (await User.findById(batch.userId));
        if (targetUser) {
          await notificationService.notifyLowStock(targetUser, batch);
        }
      } catch (notifyErr) {
        console.error(`[Scheduler] Error sending low-stock notification for batch ${batch._id}:`, notifyErr.message);
      }
    }
  };

  // Process posts sequentially to protect against LinkedIn rate limits and bursting
  for (const post of duePosts) {
    // Atomically claim the post so overlapping passes or worker instances cannot process it concurrently
    const claimedPost = await Post.findOneAndUpdate(
      { _id: post._id, status: 'pending' },
      { $set: { status: 'processing' } },
      { new: true }
    );

    if (!claimedPost) {
      console.log(`[Scheduler] Post ${post._id} was already claimed by another pass. Skipping.`);
      continue;
    }

    processedCount++;

    try {
      // Step 3: Load owning user with LinkedIn tokens explicitly selected
      const user = await User.findById(claimedPost.userId).select('+linkedin.accessToken +linkedin.refreshToken');

      if (!user) {
        console.warn(`[Scheduler] Owning user ${claimedPost.userId} not found for post ${claimedPost._id}. Marking post failed.`);
        claimedPost.status = 'failed';
        claimedPost.failureReason = 'User account not found';
        await claimedPost.save();
        failedCount++;
        await checkBatchExhaustion(claimedPost, null);
        continue;
      }

      // Check if LinkedIn account is connected
      if (!user.linkedin?.isConnected || !user.linkedin?.accessToken) {
        console.warn(`[Scheduler] LinkedIn not connected for user ${user._id} on post ${claimedPost._id}.`);
        claimedPost.status = 'failed';
        claimedPost.failureReason = 'token_expired';
        await claimedPost.save();
        failedCount++;
        await notificationService.notifyTokenExpired(user, claimedPost);
        await checkBatchExhaustion(claimedPost, user);
        continue;
      }

      // Step 4: Check token expiration and refresh if expired or expiring imminently
      const tokenExpiresAt = user.linkedin.tokenExpiresAt ? new Date(user.linkedin.tokenExpiresAt).getTime() : 0;
      const isExpiredOrImminent = !tokenExpiresAt || tokenExpiresAt - Date.now() <= IMMINENT_EXPIRY_THRESHOLD_MS;

      if (isExpiredOrImminent) {
        try {
          console.log(`[Scheduler] Proactively refreshing LinkedIn token for user ${user._id}...`);
          await linkedinService.refreshToken(user);
        } catch (refreshErr) {
          console.warn(`[Scheduler] Token refresh failed for user ${user._id}:`, refreshErr.message);
          claimedPost.status = 'failed';
          claimedPost.failureReason = 'token_expired';
          await claimedPost.save();
          failedCount++;
          await notificationService.notifyTokenExpired(user, claimedPost);
          await checkBatchExhaustion(claimedPost, user);
          continue;
        }
      }

      // Step 5: Publish post to LinkedIn
      try {
        const result = await linkedinService.createPost(user, claimedPost);
        claimedPost.status = 'posted';
        claimedPost.linkedinPostId = result.linkedinPostId;
        claimedPost.postedAt = result.postedAt || new Date();
        claimedPost.failureReason = null;
        await claimedPost.save();
        postedCount++;
        console.log(`[Scheduler] Successfully published post ${claimedPost._id} to LinkedIn. URN: ${claimedPost.linkedinPostId}`);
      } catch (postErr) {
        console.warn(`[Scheduler] LinkedIn publish failed for post ${claimedPost._id}:`, postErr.message);
        claimedPost.status = 'failed';
        claimedPost.failureReason = postErr.message || 'LinkedIn publication failed';
        await claimedPost.save();
        failedCount++;
        await notificationService.notifyPostingFailure(user, claimedPost, postErr);
      }

      // Step 6: Check batch exhaustion after updating post
      await checkBatchExhaustion(claimedPost, user);
    } catch (passError) {
      console.error(`[Scheduler] Unexpected error processing post ${claimedPost._id}:`, passError.message);
      try {
        claimedPost.status = 'failed';
        claimedPost.failureReason = passError.message || 'Unexpected scheduling error';
        await claimedPost.save();
      } catch (saveErr) {
        console.error(`[Scheduler] Critical: failed to mark post ${claimedPost._id} as failed:`, saveErr.message);
      }
      failedCount++;
    }
  }

  const summary = {
    processedCount,
    postedCount,
    failedCount,
    exhaustedBatchesCount,
  };

  console.log(
    `[Scheduler] Pass completed. Processed: ${processedCount}, Posted: ${postedCount}, Failed: ${failedCount}, Batches Exhausted: ${exhaustedBatchesCount}`
  );

  return summary;
};

module.exports = {
  runSchedulerPass,
};
