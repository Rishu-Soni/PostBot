import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.routes.js';
import linkedinRoutes from './routes/linkedin.routes.js';
import journeyRoutes from './routes/journey.routes.js';

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors());

// Request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Request body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/linkedin', linkedinRoutes);
app.use('/api/journeys', journeyRoutes);

export default app;
