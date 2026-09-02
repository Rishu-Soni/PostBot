import express from 'express';
import {
  connectLinkedIn,
  linkedinCallback,
  getLinkedInStatus,
} from '../controllers/linkedin.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// GET /api/linkedin/connect - Protected
router.get('/connect', requireAuth, connectLinkedIn);

// GET /api/linkedin/callback - Public OAuth redirect callback
router.get('/callback', linkedinCallback);

// GET /api/linkedin/status - Protected status check
router.get('/status', requireAuth, getLinkedInStatus);

export default router;
