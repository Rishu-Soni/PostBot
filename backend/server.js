require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { startSchedulerJob } = require('./src/jobs/scheduler.cron');

const PORT = process.env.PORT || 5000;

/**
 * Boots the application:
 * 1. Connects to MongoDB replica set.
 * 2. Starts recurring scheduler cron runner.
 * 3. Starts Express HTTP server listener.
 */
const startServer = async () => {
  // 1. Establish database connection (fails loudly if unavailable)
  await connectDB();

  // 2. Start recurring scheduler cron job
  startSchedulerJob();

  // 3. Start Express server listener
  const server = app.listen(PORT, () => {
    console.log(
      `[Server] PostBot server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`
    );
  });

  // Graceful shutdown handling
  const shutdown = (signal) => {
    console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log('[Server] HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer();
