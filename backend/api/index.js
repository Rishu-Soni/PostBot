/**
 * Vercel Serverless Entry Point
 *
 * Loads environment variables, imports the Express app, and exports it
 * as a serverless function handler. No app.listen(), no cron jobs —
 * those are only used in local development via server.js.
 */
require('dotenv').config();
const app = require('../src/app');

module.exports = app;
