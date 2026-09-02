/** @type {import('jest').Config} */
export default {
  // ESM support — no transform needed for native Node ESM
  transform: {},

  // Test file discovery
  testMatch: ['<rootDir>/src/__tests__/**/*.test.js'],

  // Global setup: in-memory MongoDB, dotenv loading
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.js'],

  // Generous timeout for worker/queue tests
  testTimeout: 30000,

  moduleNameMapper: {
    '^ioredis$': 'ioredis-mock'
  },

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/__tests__/**',
    '!src/server.js',
    '!src/jobs/test-job.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],

  // Force sequential execution for integration tests sharing MongoDB
  maxWorkers: 1,

  // ESM module file extensions
  moduleFileExtensions: ['js', 'json', 'mjs'],
};
