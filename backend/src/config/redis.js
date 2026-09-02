import Redis from 'ioredis';

/**
 * Returns the configured Redis connection URL.
 * @returns {string}
 */
export const getRedisUrl = () => {
  return process.env.REDIS_URL || 'redis://127.0.0.1:6379';
};

/**
 * Standard Redis connection options for BullMQ compatibility.
 * BullMQ requires maxRetriesPerRequest to be null.
 * @returns {object}
 */
export const getRedisOptions = () => {
  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  };
};

/**
 * Creates and returns a configured ioredis client instance.
 * @param {object} customOptions - Optional overrides for Redis configuration.
 * @returns {Redis}
 */
export const createRedisClient = (customOptions = {}) => {
  const url = getRedisUrl();
  const options = {
    ...getRedisOptions(),
    ...customOptions,
  };

  const client = new Redis(url, options);

  client.on('error', (err) => {
    // Only log if not in test environment or handle gracefully
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[Redis] Connection error: ${err.message}`);
    }
  });

  return client;
};

export default createRedisClient;
