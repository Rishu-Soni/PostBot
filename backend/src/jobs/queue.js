import { Queue } from 'bullmq';
import { createRedisClient } from '../config/redis.js';

export const QUEUE_NAME = 'daily-posts';

/**
 * Dedicated Redis connection client for the BullMQ Queue.
 */
export const queueConnection = createRedisClient();

/**
 * BullMQ Queue for daily post scheduling and processing.
 */
export const dailyPostsQueue = new Queue(QUEUE_NAME, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000, // 60s initial backoff
    },
    removeOnComplete: {
      age: 24 * 3600, // keep completed jobs for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // keep failed jobs for 7 days
    },
  },
});

export default dailyPostsQueue;
