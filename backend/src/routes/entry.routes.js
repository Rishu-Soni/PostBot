import express from 'express';
import {
  bulkCreateEntries,
  getEntriesByJourney,
  updateEntry,
  updateEntryStatus,
  generateEntryText,
  generateEntryImage,
} from '../controllers/entry.controller.js';

const router = express.Router({ mergeParams: true });

// POST /api/journeys/:journeyId/entries/bulk - Bulk create planned daily entries
router.post('/bulk', bulkCreateEntries);

// GET /api/journeys/:journeyId/entries - List all entries for a journey sorted by dayNumber
router.get('/', getEntriesByJourney);

// POST /api/journeys/:journeyId/entries/:entryId/generate-text - Generate LinkedIn post text via LLM
router.post('/:entryId/generate-text', generateEntryText);

// POST /api/journeys/:journeyId/entries/:entryId/generate-image - Generate visual post image via AI & Cloudinary
router.post('/:entryId/generate-image', generateEntryImage);


// PATCH /api/journeys/:journeyId/entries/:entryId - Update topic/challenge/extraNotes (allowed for planned/generated)
router.patch('/:entryId', updateEntry);

// PATCH /api/journeys/:journeyId/entries/:entryId/status - Update entry status (for testing & state progression)
router.patch('/:entryId/status', updateEntryStatus);

export default router;
