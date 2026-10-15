const mongoose = require('mongoose');
const dns = require('dns');

// On Windows / environments where local router DNS rejects SRV lookups for MongoDB Atlas,
// fallback to reliable public DNS resolvers to prevent querySrv ECONNREFUSED
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch {
  // Gracefully ignore in sandbox/restricted environments
}

/**
 * Serverless-safe MongoDB connection function.
 * Reuses existing connection when possible (critical for Vercel cold starts).
 * Never calls process.exit — errors propagate to the request handler.
 *
 * @returns {Promise<typeof mongoose>}
 */
let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    return;
  }

  // If mongoose already has an active connection, reuse it
  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    return;
  }

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/postbot?replicaSet=rs0';

  try {
    await mongoose.connect(mongoUri, { dbName: 'postbot' });
    isConnected = true;
    console.log(`[MongoDB] Connected successfully: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (error) {
    isConnected = false;
    console.error(`[MongoDB] Failed to connect: ${error.message}`);
    throw error;
  }

  // Reset flag if connection is lost, so next request will reconnect
  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('[MongoDB] Connection lost. Will reconnect on next request.');
  });
};

module.exports = connectDB;
