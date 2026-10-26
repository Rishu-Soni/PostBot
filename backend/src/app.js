const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const connectDB = require('./config/db');
const { validateEnv } = require('./config/env');
const { globalRateLimiter } = require('./middleware/rateLimiter');
const mongoSanitize = require('./middleware/mongoSanitize');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const apiRoutes = require('./routes');
const linkedinController = require('./controllers/linkedinController');
const AppError = require('./utils/AppError');

// Validate critical environment secrets on boot (loud failure in production if missing)
validateEnv();

const app = express();

// 1. Proxy Trust Configuration (crucial for accurate IP resolution behind Render/Railway/Cloudflare)
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 1);

// 2. Security Headers
app.use(helmet());

const isProd = process.env.NODE_ENV === 'production';

const getAllowedOrigins = () => {
  const configured = (process.env.CLIENT_URL || '')
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (isProd) {
    // In production, only permit explicitly configured CLIENT_URL or verified production domains
    const productionDomains = ['https://postbot.pages.dev'];
    return [...new Set([...configured, ...productionDomains])];
  }

  // Development defaults
  const localDefaults = [
    'http://localhost:5173',
    'http://localhost:5000',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5000',
    'https://postbot.pages.dev',
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

  // Allow localhost in non-production environments only
  if (!isProd && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) {
    return true;
  }

  return false;
};

// 3. Cross-Origin Resource Sharing
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
    credentials: true,
  })
);

// 4. Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. NoSQL / MongoDB Operator Injection Sanitizer (defense-in-depth)
app.use(mongoSanitize);

// 6. Global API Rate Limiting
app.use(globalRateLimiter);

// 7. Database connection middleware — ensures MongoDB is connected before any route handler
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

// 8. Root & Health Check Endpoints
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

// 9. Top-Level OAuth Redirect Handlers
app.get('/linkedin/callback', linkedinController.handleRedirect);
app.get('/api/linkedin/callback', linkedinController.handleRedirect);

// 10. Mount Primary API v1 Router
app.use('/api/v1', apiRoutes);

// 11. Unmatched Route Fallthrough (404)
app.use(notFound);

// 12. Centralized Global Error Handler
app.use(errorHandler);

module.exports = app;
