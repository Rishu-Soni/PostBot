/**
 * Global test setup and teardown for backend Jest tests.
 * - Loads .env.test environment variables
 * - Starts MongoMemoryServer and connects Mongoose
 * - Cleans up between tests for isolation
 */
import { beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load test environment variables FIRST
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

let mongoServer;

// Give enough time for MongoMemoryServer to download the binary
jest.setTimeout(60000);

beforeAll(async () => {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  // Override MONGODB_URI for any code that reads from process.env
  process.env.MONGODB_URI = uri;

  // Connect Mongoose
  await mongoose.connect(uri);
});

afterAll(async () => {
  // Clear all collections at the end of the test file
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }

  // Disconnect Mongoose and stop the in-memory server
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});
