import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import { dailyPostsQueue, queueConnection } from './queue.js';
import DailyEntry from '../models/DailyEntry.js';

async function addTestJob() {
  console.log('----------------------------------------------------');
  console.log('📤 BullMQ Manual Test Job Dispatcher');
  console.log(`📡 Redis Target: ${process.env.REDIS_URL || 'redis://127.0.0.1:6379'}`);
  console.log('----------------------------------------------------');

  let entryId = process.argv[2];

  if (!entryId) {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/postbot';
    try {
      await mongoose.connect(mongoUri);
      const plannedEntry = await DailyEntry.findOne({ status: 'planned' });
      if (plannedEntry) {
        entryId = plannedEntry._id.toString();
        console.log(`ℹ️ Found planned DailyEntry in database with ID: ${entryId}`);
      }
      await mongoose.disconnect();
    } catch {
      // Ignore if local MongoDB not connected
    }
  }

  const samplePayload = {
    entryId: entryId || 'mock_test_entry_id_123',
    triggeredAt: new Date().toISOString(),
    source: 'manual_cli_dispatcher',
  };

  try {
    console.log(`⏳ Adding job "publish-daily-post" for entry ${samplePayload.entryId}...`);
    const job = await dailyPostsQueue.add('publish-daily-post', samplePayload, {
      jobId: `publish-entry-${samplePayload.entryId}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000,
      },
    });

    console.log(`✅ Success! Job added with ID: "${job.id}"`);
    console.log('📦 Job Data Payload:');
    console.log(JSON.stringify(job.data, null, 2));
    console.log('----------------------------------------------------');
    console.log('👀 Check your running backend/worker logs to watch the pipeline execute this job.');
  } catch (error) {
    console.error('❌ Error adding test job to queue:', error.message || error);
  } finally {
    await dailyPostsQueue.close();
    queueConnection.disconnect(false);
    process.exit(0);
  }
}

addTestJob();
