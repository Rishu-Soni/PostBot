import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Worker } from 'bullmq';
import { createRedisClient } from '../config/redis.js';
import { QUEUE_NAME } from './queue.js';
import DailyEntry from '../models/DailyEntry.js';
import Journey from '../models/Journey.js';
import { generatePostText } from '../services/textGenerator.js';
import { generatePostImage } from '../services/imageGenerator.js';
import { publishEntry } from '../services/linkedinPublisher.js';
import { LinkedInReauthRequiredError } from '../services/linkedinAuth.js';

import { notifyUser } from '../services/notifier.js';

// Dedicated Redis connection for the BullMQ Worker (Worker requires blocking commands)
export const workerConnection = createRedisClient();

export { notifyUser };

/**
 * Default service dependencies for the daily posts processor.
 */
export const defaultWorkerServices = {
  generatePostText,
  generatePostImage,
  publishEntry,
  notifyUser,
};

/**
 * Real processor for the "daily-posts" queue.
 * Given a job payload containing { entryId }, performs:
 * 1. Loads DailyEntry and parent Journey.
 * 2. If entry.status is "planned", generates text and image, saves results, sets status to "generated".
 * 3. Calls publishEntry from linkedinPublisher. On success: saves linkedinPostUrn, postedAt, sets status to "posted".
 * 4. On LinkedInReauthRequiredError: sets status "failed", entry.error = "reauth required", and calls notifyUser stub.
 * 5. On any other failure: sets status "failed", saves error message, and rethrows for BullMQ retry.
 *
 * @param {import('bullmq').Job} job
 * @param {object} [servicesOverride] - Optional services override for testing
 * @returns {Promise<object>}
 */
export const dailyPostsProcessor = async (job, servicesOverride = {}) => {
  const {
    generatePostText: genText,
    generatePostImage: genImage,
    publishEntry: pubEntry,
    notifyUser: notify,
  } = { ...defaultWorkerServices, ...servicesOverride };

  const entryId = job.data?.entryId || job.data?.id;
  console.log(`[Worker:${QUEUE_NAME}] 📥 Processing job ID: ${job.id} (Name: ${job.name}, Entry: ${entryId})`);

  if (!entryId) {
    throw new Error(`[Worker:${QUEUE_NAME}] Missing entryId in job payload`);
  }

  // 1. Load DailyEntry
  const entry = await DailyEntry.findById(entryId);
  if (!entry) {
    throw new Error(`[Worker:${QUEUE_NAME}] DailyEntry not found for ID: ${entryId}`);
  }

  // Double-post protection: If already posted, immediately return to avoid double-posting
  if (entry.status === 'posted') {
    console.log(`[Worker:${QUEUE_NAME}] ⚠️ Entry ${entryId} is already posted. Skipping to prevent double-post.`);
    return {
      success: true,
      alreadyPosted: true,
      entryId: entry._id.toString(),
      linkedinPostUrn: entry.linkedinPostUrn,
      postedAt: entry.postedAt,
    };
  }

  // Load parent Journey
  const journey = await Journey.findById(entry.journeyId);
  if (!journey) {
    throw new Error(`[Worker:${QUEUE_NAME}] Parent Journey not found for ID: ${entry.journeyId}`);
  }

  try {
    // 2. If status is "planned", generate text and image, save, set status "generated"
    if (entry.status === 'planned') {
      console.log(`[Worker:${QUEUE_NAME}] 🤖 Generating post text & image for entry ${entryId} (Day ${entry.dayNumber})...`);

      // Generate text if not already present
      if (!entry.generatedText || !entry.generatedText.trim()) {
        entry.generatedText = await genText(journey, entry);
      }

      // Generate image if not already present
      if (!entry.generatedImageUrl || !entry.generatedImageUrl.trim()) {
        try {
          entry.generatedImageUrl = await genImage(journey, entry);
        } catch (imgErr) {
          console.warn(`[Worker:${QUEUE_NAME}] Image generation warning (proceeding with text):`, imgErr.message);
        }
      }

      entry.status = 'generated';
      entry.error = undefined;
      await entry.save();
      console.log(`[Worker:${QUEUE_NAME}] 📝 Content generated for entry ${entryId}`);
    }

    // 3. Call publishEntry from linkedinPublisher
    console.log(`[Worker:${QUEUE_NAME}] 🚀 Publishing entry ${entryId} to LinkedIn...`);
    const postUrn = await pubEntry(journey.userId, entry);

    // Save linkedinPostUrn, postedAt, and set status "posted"
    entry.linkedinPostUrn = postUrn;
    entry.postedAt = entry.postedAt || new Date();
    entry.status = 'posted';
    entry.error = undefined;
    await entry.save();

    // Update journey currentDay if applicable
    if (entry.dayNumber && (journey.currentDay === undefined || entry.dayNumber > journey.currentDay)) {
      journey.currentDay = entry.dayNumber;
      await journey.save().catch((e) => console.warn(`[Worker] Failed to update journey currentDay: ${e.message}`));
    }

    console.log(`[Worker:${QUEUE_NAME}] ✅ Successfully published entry ${entryId} to LinkedIn: ${postUrn}`);

    // Notify user of successful publication (Template 1: Your post published today)
    try {
      await notify(journey.userId, 'post_published', {
        journey,
        entry,
        postUrn,
      });
    } catch (notifyErr) {
      console.warn(`[Worker:${QUEUE_NAME}] Warning sending post_published email: ${notifyErr.message}`);
    }

    return {
      success: true,
      entryId: entry._id.toString(),
      postUrn,
      status: 'posted',
      postedAt: entry.postedAt,
    };
  } catch (err) {
    console.error(`[Worker:${QUEUE_NAME}] ❌ Error processing entry ${entryId}:`, err.message || err);

    // 4. On LinkedInReauthRequiredError: set status "failed", entry.error = "reauth required", and call notifyUser (Template 2)
    if (
      err instanceof LinkedInReauthRequiredError ||
      err?.name === 'LinkedInReauthRequiredError' ||
      err?.message?.toLowerCase().includes('reauth') ||
      err?.message?.toLowerCase().includes('re-authentication')
    ) {
      entry.status = 'failed';
      entry.error = 'reauth required';
      await entry.save().catch((saveErr) => console.error(`[Worker] Error saving entry failure: ${saveErr.message}`));

      try {
        await notify(journey.userId, 'reconnect_linkedin', {
          journey,
          entry,
          error: err,
        });
      } catch (notifyErr) {
        console.warn(`[Worker:${QUEUE_NAME}] Warning sending reconnect_linkedin email: ${notifyErr.message}`);
      }

      // Return gracefully with unrecoverable flag so BullMQ does not endlessly retry an expired token
      return {
        success: false,
        entryId: entry._id.toString(),
        status: 'failed',
        error: 'reauth required',
        unrecoverable: true,
      };
    }

    // 5. On any other failure: set status "failed", save the error message, and rethrow for BullMQ retry
    entry.status = 'failed';
    entry.error = err.message || String(err);
    await entry.save().catch((saveErr) => console.error(`[Worker] Error saving entry failure: ${saveErr.message}`));

    // If this is the final attempt (e.g., job.attemptsMade is at or near attempts limit), dispatch failure notification
    const maxAttempts = job?.opts?.attempts || 3;
    const isFinalAttempt = job?.attemptsMade !== undefined && job.attemptsMade >= maxAttempts - 1;
    if (isFinalAttempt) {
      try {
        await notify(journey.userId, 'publish_failed', {
          journey,
          entry,
          error: err,
          attempts: (job.attemptsMade || 0) + 1,
        });
      } catch (notifyErr) {
        console.warn(`[Worker:${QUEUE_NAME}] Warning sending publish_failed email: ${notifyErr.message}`);
      }
    }

    throw err;
  }
};

/**
 * Factory to create and configure the BullMQ Worker instance.
 *
 * @param {Function} [processorOverride] - Optional processor function override
 * @param {object} [optionsOverride] - Optional worker options override
 * @returns {Worker}
 */
export const createDailyPostsWorker = (processorOverride, optionsOverride = {}) => {
  const processor = processorOverride || dailyPostsProcessor;

  const worker = new Worker(QUEUE_NAME, processor, {
    connection: workerConnection,
    concurrency: 5,
    ...optionsOverride,
  });

  worker.on('ready', () => {
    console.log(`[Worker:${QUEUE_NAME}] ⚡ Worker is ready and waiting for jobs`);
  });

  worker.on('active', (job) => {
    console.log(`[Worker:${QUEUE_NAME}] 🚀 Job ${job.id} (${job.name}) started`);
  });

  worker.on('completed', (job, result) => {
    console.log(`[Worker:${QUEUE_NAME}] ✅ Job ${job.id} (${job.name}) completed successfully:`, result);
  });

  worker.on('failed', async (job, err) => {
    console.error(`[Worker:${QUEUE_NAME}] ❌ Job ${job?.id || 'unknown'} failed with error:`, err?.message || err);

    // Template 3: If retries are exhausted, send failure notification
    const maxAttempts = job?.opts?.attempts || 3;
    const isFinalAttempt = job && job.attemptsMade >= maxAttempts;

    if (isFinalAttempt && job?.data?.entryId) {
      console.log(`[Worker:${QUEUE_NAME}] 🔔 Job ${job.id} exhausted all ${maxAttempts} attempts. Sending failure notification...`);
      try {
        const entry = await DailyEntry.findById(job.data.entryId);
        if (entry) {
          const journey = await Journey.findById(entry.journeyId);
          if (journey) {
            await notifyUser(journey.userId, 'publish_failed', {
              journey,
              entry,
              error: err,
              attempts: job.attemptsMade,
            });
          }
        }
      } catch (notifyErr) {
        console.error(`[Worker:${QUEUE_NAME}] Error sending retry-exhausted failure notification:`, notifyErr.message);
      }
    }
  });

  worker.on('error', (err) => {
    console.error(`[Worker:${QUEUE_NAME}] ⚠️ Worker encountered an error:`, err?.message || err);
  });

  return worker;
};

// Singleton worker instance created and active, except in test environment to avoid real Redis connections
export const dailyPostsWorker = process.env.NODE_ENV !== 'test' ? createDailyPostsWorker() : null;

// Standalone execution support: node src/jobs/worker.js
const __filename = fileURLToPath(import.meta.url);
const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectExecution) {
  const __dirname = path.dirname(__filename);
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
  dotenv.config();

  const { connectDB } = await import('../config/db.js');
  await connectDB();

  console.log(`👷 Standalone BullMQ Worker process running for queue "${QUEUE_NAME}"...`);

  // Handle graceful shutdown in standalone mode
  const shutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}. Gracefully shutting down worker...`);
    try {
      await dailyPostsWorker.close();
      await workerConnection.quit();
      console.log('✅ Worker closed cleanly. Exiting.');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during worker shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default dailyPostsWorker;
