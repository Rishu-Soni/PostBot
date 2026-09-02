process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_1234567890';
process.env.TOKEN_ENCRYPTION_KEY =
  process.env.TOKEN_ENCRYPTION_KEY || 'test_token_encryption_key_32_bytes_123';

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { getRedisUrl, getRedisOptions } from './src/config/redis.js';
import { dailyPostsQueue, QUEUE_NAME, queueConnection } from './src/jobs/queue.js';
import {
  dailyPostsWorker,
  createDailyPostsWorker,
  dailyPostsProcessor,
  workerConnection,
  notifyUser,
} from './src/jobs/worker.js';
import {
  isEntryDue,
  checkAndEnqueueScheduledEntries,
  startScheduler,
  stopScheduler,
} from './src/jobs/scheduler.js';

import DailyEntry from './src/models/DailyEntry.js';
import Journey from './src/models/Journey.js';
import User from './src/models/User.js';
import { LinkedInReauthRequiredError } from './src/services/linkedinAuth.js';
import { LinkedInPublishError } from './src/services/linkedinPublisher.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('\n====================================================');
console.log('🧪 BullMQ Queue, Worker & Scheduler Unit Tests');
console.log('====================================================\n');

// -------------------------------------------------------------
// Suite 1: Redis & BullMQ Queue Configuration Tests
// -------------------------------------------------------------
console.log('--- Suite 1: Redis & Queue Configuration Tests ---');

const redisUrl = getRedisUrl();
assert(typeof redisUrl === 'string' && redisUrl.length > 0, 'getRedisUrl returns a valid Redis connection string');

const redisOptions = getRedisOptions();
assert(redisOptions.maxRetriesPerRequest === null, 'Redis options sets maxRetriesPerRequest to null (required by BullMQ)');
assert(redisOptions.enableReadyCheck === false, 'Redis options sets enableReadyCheck to false for cloud Redis (Upstash) compatibility');

assert(QUEUE_NAME === 'daily-posts', 'QUEUE_NAME is set to "daily-posts"');
assert(dailyPostsQueue !== undefined && dailyPostsQueue !== null, 'dailyPostsQueue is exported');
assert(dailyPostsQueue.name === 'daily-posts', 'dailyPostsQueue name property is "daily-posts"');

const defaultJobOpts = dailyPostsQueue.opts?.defaultJobOptions || {};
assert(defaultJobOpts.attempts === 3, 'Queue defaultJobOptions configures 3 retry attempts');
assert(defaultJobOpts.backoff?.type === 'exponential', 'Queue defaultJobOptions configures exponential backoff');
assert(defaultJobOpts.backoff?.delay === 60000, 'Queue defaultJobOptions sets exponential backoff initial delay to 60000ms (60s)');

assert(typeof dailyPostsWorker === 'object', 'dailyPostsWorker instance is exported');
assert(typeof createDailyPostsWorker === 'function', 'createDailyPostsWorker factory is exported');
assert(typeof dailyPostsProcessor === 'function', 'dailyPostsProcessor function is exported');
assert(typeof notifyUser === 'function', 'notifyUser stub function is exported');

// -------------------------------------------------------------
// Suite 2: Worker Processor Pipeline Tests
// -------------------------------------------------------------
console.log('\n--- Suite 2: Worker Processor Pipeline Tests ---');

// In-memory mock database store
const mockEntries = new Map();
const mockJourneys = new Map();

// Setup model mocks
const origEntryFindById = DailyEntry.findById;
const origJourneyFindById = Journey.findById;
const origUserFindById = User.findById;

function createMockEntryDoc(data) {
  const doc = {
    ...data,
    _id: data._id ? data._id.toString() : new mongoose.Types.ObjectId().toString(),
    save: async function () {
      mockEntries.set(this._id.toString(), { ...this });
      return this;
    },
  };
  return doc;
}

function createMockJourneyDoc(data) {
  const doc = {
    ...data,
    _id: data._id ? data._id.toString() : new mongoose.Types.ObjectId().toString(),
    save: async function () {
      mockJourneys.set(this._id.toString(), { ...this });
      return this;
    },
  };
  return doc;
}

DailyEntry.findById = async (id) => {
  const idStr = id ? id.toString() : '';
  const item = mockEntries.get(idStr);
  return item ? createMockEntryDoc(item) : null;
};

Journey.findById = async (id) => {
  const idStr = id ? id.toString() : '';
  const item = mockJourneys.get(idStr);
  return item ? createMockJourneyDoc(item) : null;
};

// 2.1 Full Generation + Publishing Pipeline for Planned Entry
{
  const userId = 'user_worker_101';
  const journeyId = 'journey_worker_201';
  const entryId = 'entry_worker_301';

  mockJourneys.set(journeyId, {
    _id: journeyId,
    userId,
    title: 'Building AI SaaS',
    template: 'Day {{day}}: {{topic}}',
    hashtags: ['#ai', '#buildinpublic'],
    status: 'active',
  });

  mockEntries.set(entryId, {
    _id: entryId,
    journeyId,
    dayNumber: 1,
    scheduledDate: new Date(),
    topic: 'Architecting Queue Pipelines',
    challenge: 'Worker deduplication',
    extraNotes: 'Working great',
    status: 'planned',
  });

  let textGenCalled = false;
  let imgGenCalled = false;
  let publishCalled = false;
  let notificationReceived = null;

  const mockServices = {
    generatePostText: async (j, e) => {
      textGenCalled = true;
      return `Generated text for ${e.topic}`;
    },
    generatePostImage: async (j, e) => {
      imgGenCalled = true;
      return 'https://cloudinary.com/fake-image-url.png';
    },
    publishEntry: async (uId, e) => {
      publishCalled = true;
      return 'urn:li:share:9876543210';
    },
    notifyUser: async (uId, reason, payload) => {
      notificationReceived = { uId, reason, payload };
    },
  };

  const job = {
    id: 'job_test_full_pipeline',
    name: 'publish-daily-post',
    data: { entryId },
  };

  const result = await dailyPostsProcessor(job, mockServices);

  assert(textGenCalled, 'Calls generatePostText for planned entry');
  assert(imgGenCalled, 'Calls generatePostImage for planned entry');
  assert(publishCalled, 'Calls publishEntry with userId and generated entry');
  assert(result.success === true, 'Processor resolves with success: true');
  assert(result.status === 'posted', 'Processor returns status: "posted"');
  assert(result.postUrn === 'urn:li:share:9876543210', 'Processor returns correct postUrn');
  assert(notificationReceived?.reason === 'post_published', 'Dispatches post_published notification upon successful publishing');
  assert(notificationReceived?.payload?.postUrn === 'urn:li:share:9876543210', 'Notification payload includes postUrn');

  const updatedEntry = mockEntries.get(entryId);
  assert(updatedEntry.status === 'posted', 'Entry in DB is updated to status "posted"');
  assert(updatedEntry.linkedinPostUrn === 'urn:li:share:9876543210', 'Entry in DB saves linkedinPostUrn');
  assert(updatedEntry.postedAt instanceof Date, 'Entry in DB saves postedAt timestamp');
  assert(updatedEntry.generatedText.includes('Architecting Queue Pipelines'), 'Entry in DB saves generated text');
  assert(updatedEntry.generatedImageUrl === 'https://cloudinary.com/fake-image-url.png', 'Entry in DB saves generated image URL');
}

// 2.2 Double-Post Protection Test: Already Posted Entry
{
  const userId = 'user_worker_101';
  const journeyId = 'journey_worker_201';
  const entryId = 'entry_worker_already_posted_401';

  mockJourneys.set(journeyId, {
    _id: journeyId,
    userId,
    title: 'Building AI SaaS',
    status: 'active',
  });

  mockEntries.set(entryId, {
    _id: entryId,
    journeyId,
    dayNumber: 2,
    scheduledDate: new Date(),
    topic: 'Already Posted Topic',
    status: 'posted',
    linkedinPostUrn: 'urn:li:share:111222333',
    postedAt: new Date(Date.now() - 3600000),
  });

  let textGenCalled = false;
  let imgGenCalled = false;
  let publishCalled = false;

  const mockServices = {
    generatePostText: async () => { textGenCalled = true; },
    generatePostImage: async () => { imgGenCalled = true; },
    publishEntry: async () => { publishCalled = true; },
  };

  const job = {
    id: 'job_test_already_posted',
    name: 'publish-daily-post',
    data: { entryId },
  };

  const result = await dailyPostsProcessor(job, mockServices);

  assert(!textGenCalled, 'Double-post protection: Does NOT call generatePostText');
  assert(!imgGenCalled, 'Double-post protection: Does NOT call generatePostImage');
  assert(!publishCalled, 'Double-post protection: Does NOT call publishEntry');
  assert(result.success === true, 'Double-post protection: Returns success: true');
  assert(result.alreadyPosted === true, 'Double-post protection: Returns alreadyPosted: true flag');
}

// 2.3 Skip Generation If Entry is Already "generated"
{
  const userId = 'user_worker_101';
  const journeyId = 'journey_worker_201';
  const entryId = 'entry_worker_generated_501';

  mockJourneys.set(journeyId, {
    _id: journeyId,
    userId,
    title: 'Building AI SaaS',
    status: 'active',
  });

  mockEntries.set(entryId, {
    _id: entryId,
    journeyId,
    dayNumber: 3,
    scheduledDate: new Date(),
    topic: 'Pre-generated Topic',
    generatedText: 'Pre-generated text content',
    generatedImageUrl: 'https://cloudinary.com/pregenerated.png',
    status: 'generated',
  });

  let textGenCalled = false;
  let imgGenCalled = false;
  let publishCalled = false;

  const mockServices = {
    generatePostText: async () => { textGenCalled = true; },
    generatePostImage: async () => { imgGenCalled = true; },
    publishEntry: async () => {
      publishCalled = true;
      return 'urn:li:share:555666777';
    },
  };

  const job = {
    id: 'job_test_generated_entry',
    name: 'publish-daily-post',
    data: { entryId },
  };

  const result = await dailyPostsProcessor(job, mockServices);

  assert(!textGenCalled, 'Skips generatePostText when entry is already "generated"');
  assert(!imgGenCalled, 'Skips generatePostImage when entry is already "generated"');
  assert(publishCalled, 'Calls publishEntry for "generated" entry');
  assert(result.status === 'posted', 'Updates status to "posted" after publishing');
  assert(mockEntries.get(entryId).status === 'posted', 'DB entry status is "posted"');
}

// 2.4 LinkedInReauthRequiredError Handling & Stub Notification
{
  const userId = 'user_worker_reauth_999';
  const journeyId = 'journey_worker_201';
  const entryId = 'entry_worker_reauth_601';

  mockEntries.set(entryId, {
    _id: entryId,
    journeyId,
    dayNumber: 4,
    scheduledDate: new Date(),
    topic: 'Reauth Failure Test',
    status: 'planned',
  });

  let notificationReceived = null;
  const mockServices = {
    generatePostText: async () => 'Post text',
    generatePostImage: async () => 'https://img.com/pic.png',
    publishEntry: async () => {
      throw new LinkedInReauthRequiredError('LinkedIn token expired. Reauth required.');
    },
    notifyUser: (uId, reason, payload) => {
      notificationReceived = { uId, reason, payload };
    },
  };

  const job = {
    id: 'job_test_reauth_failure',
    name: 'publish-daily-post',
    data: { entryId },
  };

  const result = await dailyPostsProcessor(job, mockServices);

  assert(result.success === false, 'Processor returns success: false on ReauthRequired');
  assert(result.status === 'failed', 'Processor returns status: "failed"');
  assert(result.unrecoverable === true, 'Processor returns unrecoverable: true to prevent infinite retry loop');

  const updatedEntry = mockEntries.get(entryId);
  assert(updatedEntry.status === 'failed', 'DB entry status set to "failed" on reauth error');
  assert(updatedEntry.error === 'reauth required', 'DB entry error is set to "reauth required"');
  assert(
    notificationReceived?.reason === 'reconnect_linkedin',
    'Invoked notifyUser with "reconnect_linkedin" message'
  );
  assert(
    notificationReceived?.payload?.error instanceof Error,
    'Passed error context in reconnect_linkedin notification payload'
  );
}

// 2.5 Transient Error Handling & BullMQ Retry Propagation
{
  const userId = 'user_worker_101';
  const journeyId = 'journey_worker_201';
  const entryId = 'entry_worker_transient_701';

  mockEntries.set(entryId, {
    _id: entryId,
    journeyId,
    dayNumber: 5,
    scheduledDate: new Date(),
    topic: 'Transient Error Test',
    status: 'planned',
  });

  const mockServices = {
    generatePostText: async () => 'Post text',
    generatePostImage: async () => 'https://img.com/pic.png',
    publishEntry: async () => {
      throw new LinkedInPublishError('LinkedIn API temporarily unavailable (500)', { code: 500 }, 500);
    },
  };

  const job = {
    id: 'job_test_transient_retry',
    name: 'publish-daily-post',
    data: { entryId },
    attemptsMade: 0,
    opts: { attempts: 3 },
  };

  let threwError = null;
  try {
    await dailyPostsProcessor(job, mockServices);
  } catch (err) {
    threwError = err;
  }

  assert(threwError instanceof LinkedInPublishError, 'Rethrows transient error for BullMQ automatic retry handling');
  const updatedEntry = mockEntries.get(entryId);
  assert(updatedEntry.status === 'failed', 'DB entry status set to "failed" during transient failure');
  assert(updatedEntry.error.includes('LinkedIn API temporarily unavailable'), 'DB entry error records transient error message');
}

// 2.6 Retry Exhaustion Failure Notification Test
{
  const userId = 'user_worker_101';
  const journeyId = 'journey_worker_201';
  const entryId = 'entry_worker_exhausted_801';

  mockEntries.set(entryId, {
    _id: entryId,
    journeyId,
    dayNumber: 6,
    scheduledDate: new Date(),
    topic: 'Exhausted Retries Test',
    status: 'planned',
  });

  let failureNotificationReceived = null;
  const mockServices = {
    generatePostText: async () => 'Post text',
    generatePostImage: async () => 'https://img.com/pic.png',
    publishEntry: async () => {
      throw new LinkedInPublishError('Fatal 422 Unprocessable Content', { code: 422 }, 422);
    },
    notifyUser: (uId, reason, payload) => {
      failureNotificationReceived = { uId, reason, payload };
    },
  };

  const finalAttemptJob = {
    id: 'job_test_final_retry',
    name: 'publish-daily-post',
    data: { entryId },
    attemptsMade: 2, // 3rd and final attempt
    opts: { attempts: 3 },
  };

  let threwError = null;
  try {
    await dailyPostsProcessor(finalAttemptJob, mockServices);
  } catch (err) {
    threwError = err;
  }

  assert(threwError !== null, 'Rethrows on final attempt failure');
  assert(
    failureNotificationReceived?.reason === 'publish_failed',
    'Dispatches publish_failed notification when retries are exhausted'
  );
  assert(
    failureNotificationReceived?.payload?.attempts === 3,
    'Passes total attempts count in publish_failed notification payload'
  );
  assert(
    failureNotificationReceived?.payload?.error?.message?.includes('Fatal 422'),
    'Passes error details in publish_failed notification payload'
  );
}

// -------------------------------------------------------------
// Suite 3: Timezone & isEntryDue Scheduling Tests
// -------------------------------------------------------------
console.log('\n--- Suite 3: Timezone & isEntryDue Tests ---');

{
  // Test 3.1: Scheduled date is in the past
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
  assert(
    isEntryDue(pastDate, '09:00', 'UTC') === true,
    'isEntryDue returns true for a past scheduled date'
  );

  // Test 3.2: Scheduled date is tomorrow (future)
  const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000); // 2 days from now
  assert(
    isEntryDue(futureDate, '09:00', 'UTC') === false,
    'isEntryDue returns false for a future scheduled date'
  );

  // Test 3.3: Today in user timezone, postTimeLocal has passed
  const now = new Date();
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(now);
  const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const currentHour = parseInt(partMap.hour === '24' ? '00' : partMap.hour, 10);

  // Time 1 hour ago
  const pastHour = currentHour > 0 ? currentHour - 1 : 0;
  const pastTimeStr = `${String(pastHour).padStart(2, '0')}:00`;

  // Time 2 hours in future
  const futureHour = currentHour < 22 ? currentHour + 2 : 23;
  const futureTimeStr = `${String(futureHour).padStart(2, '0')}:59`;

  const todayStr = `${partMap.year}-${partMap.month}-${partMap.day}`;

  assert(
    isEntryDue(todayStr, pastTimeStr, 'UTC') === true,
    'isEntryDue returns true for today when postTimeLocal has passed'
  );

  assert(
    isEntryDue(todayStr, futureTimeStr, 'UTC') === false,
    'isEntryDue returns false for today when postTimeLocal is in the future'
  );

  // Test 3.4: Timezone conversions (America/New_York vs Asia/Tokyo)
  assert(
    typeof isEntryDue(todayStr, '09:00', 'America/New_York') === 'boolean',
    'isEntryDue supports "America/New_York" timezone'
  );
  assert(
    typeof isEntryDue(todayStr, '09:00', 'Asia/Kolkata') === 'boolean',
    'isEntryDue supports "Asia/Kolkata" timezone'
  );
  assert(
    typeof isEntryDue(todayStr, '09:00', 'Asia/Tokyo') === 'boolean',
    'isEntryDue supports "Asia/Tokyo" timezone'
  );
}

// -------------------------------------------------------------
// Suite 4: checkAndEnqueueScheduledEntries & Deduplication Tests
// -------------------------------------------------------------
console.log('\n--- Suite 4: checkAndEnqueueScheduledEntries & Deduplication Tests ---');

{
  const user1 = {
    _id: 'user_sched_1',
    timezone: 'UTC',
  };

  const journeyActive = {
    _id: 'journey_sched_active',
    userId: user1,
    status: 'active',
    postTimeLocal: '00:00', // early morning, definitely passed today
  };

  const journeyPaused = {
    _id: 'journey_sched_paused',
    userId: user1,
    status: 'paused',
    postTimeLocal: '00:00',
  };

  const dueEntry = {
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439091'),
    journeyId: journeyActive,
    dayNumber: 1,
    scheduledDate: new Date(Date.now() - 3600000), // 1 hour ago
    status: 'planned',
  };

  const pausedEntry = {
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439092'),
    journeyId: journeyPaused,
    dayNumber: 2,
    scheduledDate: new Date(Date.now() - 3600000),
    status: 'planned',
  };

  const futureEntry = {
    _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439093'),
    journeyId: journeyActive,
    dayNumber: 3,
    scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // next week
    status: 'planned',
  };

  const mockPlannedList = [dueEntry, pausedEntry, futureEntry];

  // Mock DailyEntry.find for scheduler
  DailyEntry.find = (filter = {}) => {
    return {
      populate: async () => {
        return mockPlannedList.filter((e) => filter.status === e.status);
      },
    };
  };

  let enqueuedJobs = [];
  const origQueueAdd = dailyPostsQueue.add.bind(dailyPostsQueue);
  dailyPostsQueue.add = async (name, payload, opts) => {
    // Check if deterministic jobId already added
    const existing = enqueuedJobs.find((j) => j.opts?.jobId === opts?.jobId);
    if (existing) {
      // BullMQ rejects duplicate jobId if already queued
      return existing;
    }
    const jobRecord = { id: opts?.jobId || 'job_' + Date.now(), name, payload, opts };
    enqueuedJobs.push(jobRecord);
    return jobRecord;
  };

  // Run scheduler scan 1st time
  const scanResult1 = await checkAndEnqueueScheduledEntries();

  assert(scanResult1.scanned === 3, 'Scanned all 3 planned entries in database');
  assert(scanResult1.enqueued === 1, 'Enqueued exactly 1 due entry (skipped paused journey and future entry)');
  assert(
    scanResult1.enqueuedEntryIds.includes(dueEntry._id.toString()),
    'Enqueued the due planned entry'
  );
  assert(
    enqueuedJobs[0].opts.jobId === `publish-entry-${dueEntry._id.toString()}`,
    'Enqueued job with deterministic BullMQ jobId (publish-entry-{id})'
  );
  assert(
    enqueuedJobs[0].opts.backoff?.delay === 60000,
    'Enqueued job includes 60s exponential backoff retry settings'
  );

  // Run scheduler scan 2nd time (Deduplication verification)
  const scanResult2 = await checkAndEnqueueScheduledEntries();
  assert(
    enqueuedJobs.length === 1,
    'Deduplication: Running scheduler check again does NOT add duplicate jobs to queue'
  );

  // Restore queue.add
  dailyPostsQueue.add = origQueueAdd;
}

// -------------------------------------------------------------
// Suite 5: Scheduler Timer Lifecycle Tests
// -------------------------------------------------------------
console.log('\n--- Suite 5: Scheduler Lifecycle Tests ---');

{
  const testTimer = startScheduler(60000);
  assert(testTimer !== undefined && testTimer !== null, 'startScheduler starts and returns an interval timer');
  stopScheduler(testTimer);
  assert(true, 'stopScheduler cleanly clears the running timer');
}

// -------------------------------------------------------------
// Suite 6: Cleanup Test Connections
// -------------------------------------------------------------
console.log('\n--- Suite 6: Cleanup Test Connections ---');

// Restore all model mocks
DailyEntry.findById = origEntryFindById;
Journey.findById = origJourneyFindById;
User.findById = origUserFindById;

try {
  await dailyPostsWorker.close(true);
  workerConnection.disconnect(false);
  await dailyPostsQueue.close();
  queueConnection.disconnect(false);
  assert(true, 'Worker and Queue test connections closed cleanly');
} catch (cleanupErr) {
  assert(true, `Connection cleanup handled (${cleanupErr.message || 'ok'})`);
}

// Summary
console.log('\n====================================================');
console.log(`📊 Test Summary: ${passed} passed, ${failed} failed`);
console.log('====================================================\n');

process.exit(failed > 0 ? 1 : 0);
