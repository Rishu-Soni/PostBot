const { Post, User, ContentBatch } = require('../models');
const linkedinService = require('./linkedinService');
const notificationService = require('./notificationService');

/**
 * Imminent token expiry window in milliseconds.
 * If a user's LinkedIn access token expires within 1 hour, proactively refresh it.
 */
const IMMINENT_EXPIRY_THRESHOLD_MS = 60 * 60 * 1000;

/**
 * Executes a single complete scheduler pass across all due pending posts (§6).
 * Called automatically by the cron runner or manually via POST /api/v1/internal/scheduler/run-now.
 *
 * 1. Queries due pending posts (scheduledTime <= now).
 * 2. Validates user LinkedIn credentials and proactively refreshes expiring tokens.
 * 3. Publishes due posts sequentially to respect LinkedIn API burst limits.
 * 4. Dispatches failure notifications on API or token errors.
 * 5. Detects batch exhaustion and triggers low-stock reminders.
 *
 * @returns {Promise<{ processedCount: number, postedCount: number, failedCount: number, exhaustedBatchesCount: number }>}
 */
const runSchedulerPass = async () => {
  const now = new Date();
  console.log(`[Scheduler] Starting scheduler pass at ${now.toISOString()}`);

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
    processedCount++;

    try {
      // Step 2: Load owning user with LinkedIn tokens explicitly selected
      const user = await User.findById(post.userId).select('+linkedin.accessToken +linkedin.refreshToken');

      if (!user) {
        console.warn(`[Scheduler] Owning user ${post.userId} not found for post ${post._id}. Marking post failed.`);
        post.status = 'failed';
        post.failureReason = 'User account not found';
        await post.save();
        failedCount++;
        await checkBatchExhaustion(post, null);
        continue;
      }

      // Check if LinkedIn account is connected
      if (!user.linkedin?.isConnected || !user.linkedin?.accessToken) {
        console.warn(`[Scheduler] LinkedIn not connected for user ${user._id} on post ${post._id}.`);
        post.status = 'failed';
        post.failureReason = 'token_expired';
        await post.save();
        failedCount++;
        await notificationService.notifyTokenExpired(user, post);
        await checkBatchExhaustion(post, user);
        continue;
      }

      // Step 3: Check token expiration and refresh if expired or expiring imminently
      const tokenExpiresAt = user.linkedin.tokenExpiresAt ? new Date(user.linkedin.tokenExpiresAt).getTime() : 0;
      const isExpiredOrImminent = !tokenExpiresAt || tokenExpiresAt - Date.now() <= IMMINENT_EXPIRY_THRESHOLD_MS;

      if (isExpiredOrImminent) {
        try {
          console.log(`[Scheduler] Proactively refreshing LinkedIn token for user ${user._id}...`);
          await linkedinService.refreshToken(user);
        } catch (refreshErr) {
          console.warn(`[Scheduler] Token refresh failed for user ${user._id}:`, refreshErr.message);
          post.status = 'failed';
          post.failureReason = 'token_expired';
          await post.save();
          failedCount++;
          await notificationService.notifyTokenExpired(user, post);
          await checkBatchExhaustion(post, user);
          continue;
        }
      }

      // Step 4: Publish post to LinkedIn
      try {
        const result = await linkedinService.createPost(user, post);
        post.status = 'posted';
        post.linkedinPostId = result.linkedinPostId;
        post.postedAt = result.postedAt || new Date();
        post.failureReason = null;
        await post.save();
        postedCount++;
        console.log(`[Scheduler] Successfully published post ${post._id} to LinkedIn. URN: ${post.linkedinPostId}`);
      } catch (postErr) {
        console.warn(`[Scheduler] LinkedIn publish failed for post ${post._id}:`, postErr.message);
        post.status = 'failed';
        post.failureReason = postErr.message || 'LinkedIn publication failed';
        await post.save();
        failedCount++;
        await notificationService.notifyPostingFailure(user, post, postErr);
      }

      // Step 5: Check batch exhaustion after updating post
      await checkBatchExhaustion(post, user);
    } catch (passError) {
      console.error(`[Scheduler] Unexpected error processing post ${post._id}:`, passError.message);
      try {
        post.status = 'failed';
        post.failureReason = passError.message || 'Unexpected scheduling error';
        await post.save();
      } catch (_) {}
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
