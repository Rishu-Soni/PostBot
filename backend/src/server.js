import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load .env from backend root or workspace root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

import app from './app.js';
import { connectDB } from './config/db.js';
import { dailyPostsWorker, workerConnection } from './jobs/worker.js';
import { dailyPostsQueue, queueConnection } from './jobs/queue.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';

const PORT = process.env.PORT || 5000;

// Connect to Database before starting the server
await connectDB();

// Start repeatable background scheduler
const scheduler = startScheduler(60000);

const server = app.listen(PORT, () => {
  console.log(`🚀 PostBot Backend server running on port ${PORT}`);
  console.log(`👷 BullMQ Worker started for "daily-posts" queue (Redis: ${process.env.REDIS_URL || 'redis://127.0.0.1:6379'})`);
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  stopScheduler(scheduler);

  server.close(() => {
    console.log('🚪 HTTP server closed.');
  });

  try {
    // Close worker and queue to prevent dangling jobs / connections
    await dailyPostsWorker.close();
    await workerConnection.quit();
    await dailyPostsQueue.close();
    await queueConnection.quit();
    console.log('👷 BullMQ Worker and Queue connections closed.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during graceful shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
