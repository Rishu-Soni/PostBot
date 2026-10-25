const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const connectDB = require('./config/db');
const { globalRateLimiter } = require('./middleware/rateLimiter');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const apiRoutes = require('./routes');
const linkedinController = require('./controllers/linkedinController');
const AppError = require('./utils/AppError');

const app = express();

// 1. Security Headers
app.use(helmet());

const getAllowedOrigins = () => {
  const configured = (process.env.CLIENT_URL || '')
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const localDefaults = [
    'http://localhost:5173',
    'http://localhost:5000',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5000',
  ];

  return [...new Set([...configured, ...localDefaults])];
};

const isOriginAllowed = (origin) => {
  if (!origin) return true; // Allow curl, server-to-server, and mobile native requests

  const normalized = origin.trim().replace(/\/+$/, '');
  const allowedList = getAllowedOrigins();

  if (allowedList.includes(normalized)) {
    return true;
  }

  // Allow all Cloudflare Pages production and preview subdomains (*.pages.dev)
  if (/^https:\/\/([a-zA-Z0-9-]+\.)*pages\.dev$/.test(normalized)) {
    return true;
  }

  // Allow localhost in non-production environments
  if (
    process.env.NODE_ENV !== 'production' &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)
  ) {
    return true;
  }

  return false;
};

// 2. Cross-Origin Resource Sharing
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(new AppError(`Origin ${origin} not allowed by CORS policy.`, 403));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
    credentials: true,
  })
);

// 3. Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 4. Global API Rate Limiting
app.use(globalRateLimiter);

// 5. Database connection middleware — ensures MongoDB is connected before any route handler
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('[DB Middleware] Database connection failed:', error.message);
    res.status(503).json({
      success: false,
      message: 'Service temporarily unavailable. Database connection failed.',
    });
  }
});

// 6. Root & Health Check Endpoints
app.get('/health', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? 'connected' : 'disconnected';
    res.status(200).json({
      success: true,
      message: 'Backend is running',
      status: 'ok',
      database: dbStatus,
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(200).json({
      success: true,
      message: 'Backend is running',
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? 'connected' : 'disconnected';
    res.status(200).json({
      success: true,
      message: 'Backend is running',
      status: 'ok',
      database: dbStatus,
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(200).json({
      success: true,
      message: 'Backend is running',
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  }
});

// 7. Top-Level OAuth Redirect Handlers
app.get('/linkedin/callback', linkedinController.handleRedirect);
app.get('/api/linkedin/callback', linkedinController.handleRedirect);

// 8. Mount Primary API v1 Router
app.use('/api/v1', apiRoutes);

// 8. Unmatched Route Fallthrough (404)
app.use(notFound);

// 9. Centralized Global Error Handler
app.use(errorHandler);

module.exports = app;
