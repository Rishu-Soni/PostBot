const mongoose = require('mongoose');

/**
 * Connects to MongoDB replica set using MONGO_URI from environment.
 * Exits process loudly with exit code 1 if connection fails.
 *
 * @returns {Promise<typeof mongoose>}
 */
const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/postbot?replicaSet=rs0';

  try {
    const conn = await mongoose.connect(mongoUri);
    console.log(`[MongoDB] Connected successfully: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error(`[MongoDB] Fatal: Failed to connect to MongoDB at ${mongoUri}: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
