import express from 'express';
import {
  createJourney,
  getJourneys,
  getJourneyById,
  updateJourney,
  updateJourneyStatus,
} from '../controllers/journey.controller.js';
import entryRoutes from './entry.routes.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// All journey endpoints are protected by authentication middleware
router.use(requireAuth);

// POST /api/journeys - Create journey
router.post('/', createJourney);

// GET /api/journeys - List all journeys for current user
router.get('/', getJourneys);

// GET /api/journeys/:id - Get single journey by id
router.get('/:id', getJourneyById);

// PATCH /api/journeys/:id - Update journey editable fields
router.patch('/:id', updateJourney);

// PATCH /api/journeys/:id/status - Update journey status (active/paused/completed)
router.patch('/:id/status', updateJourneyStatus);

// Nested daily entry routes under /api/journeys/:journeyId/entries
router.use('/:journeyId/entries', entryRoutes);

export default router;
