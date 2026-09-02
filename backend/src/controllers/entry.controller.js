import mongoose from 'mongoose';
import Journey from '../models/Journey.js';
import DailyEntry from '../models/DailyEntry.js';
import { generatePostText } from '../services/textGenerator.js';
import { generatePostImage } from '../services/imageGenerator.js';


/**
 * Helper to verify that a journey exists and belongs to the authenticated user.
 */
const verifyJourneyOwner = async (journeyId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(journeyId)) {
    return null;
  }
  return Journey.findOne({
    _id: journeyId,
    userId,
  });
};

/**
 * POST /api/journeys/:journeyId/entries/bulk
 * Accepts an array of { dayNumber, scheduledDate, topic, challenge, extraNotes }.
 * Creates DailyEntry docs with status "planned".
 * Rejects if any dayNumber already exists for that journey.
 */
export const bulkCreateEntries = async (req, res) => {
  try {
    const { journeyId } = req.params;
    const journey = await verifyJourneyOwner(journeyId, req.userId);

    if (!journey) {
      return res.status(404).json({
        error: 'Journey not found',
      });
    }

    const rawEntries = Array.isArray(req.body) ? req.body : req.body?.entries;

    if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
      return res.status(400).json({
        error: 'Entries must be a non-empty array',
      });
    }

    // Validate each entry in the payload
    const dayNumbers = [];
    const sanitizedDocs = [];

    for (let i = 0; i < rawEntries.length; i++) {
      const item = rawEntries[i];

      if (!item || typeof item !== 'object') {
        return res.status(400).json({
          error: `Entry at index ${i} is invalid`,
        });
      }

      const dayNumber = Number(item.dayNumber);
      if (isNaN(dayNumber) || !Number.isInteger(dayNumber) || dayNumber <= 0) {
        return res.status(400).json({
          error: `Entry at index ${i} must have a valid positive integer dayNumber`,
        });
      }

      if (!item.scheduledDate) {
        return res.status(400).json({
          error: `Entry at index ${i} requires scheduledDate`,
        });
      }

      const scheduledDate = new Date(item.scheduledDate);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({
          error: `Entry at index ${i} has an invalid scheduledDate`,
        });
      }

      dayNumbers.push(dayNumber);

      sanitizedDocs.push({
        journeyId: journey._id,
        dayNumber,
        scheduledDate,
        topic: typeof item.topic === 'string' ? item.topic.trim() : '',
        challenge: typeof item.challenge === 'string' ? item.challenge.trim() : '',
        extraNotes: typeof item.extraNotes === 'string' ? item.extraNotes.trim() : '',
        status: 'planned',
      });
    }

    // Check for duplicate dayNumbers within the payload itself
    const uniqueDayNumbers = new Set(dayNumbers);
    if (uniqueDayNumbers.size !== dayNumbers.length) {
      return res.status(400).json({
        error: 'Duplicate day numbers found within submission payload',
      });
    }

    // Check if any dayNumber already exists for this journey in the database
    const existingEntries = await DailyEntry.find({
      journeyId: journey._id,
      dayNumber: { $in: dayNumbers },
    });

    if (existingEntries.length > 0) {
      const existingDays = existingEntries
        .map((e) => e.dayNumber)
        .sort((a, b) => a - b);

      return res.status(400).json({
        error: `Day number(s) already exist for this journey: ${existingDays.join(', ')}`,
        existingDays,
      });
    }

    const createdEntries = await DailyEntry.insertMany(sanitizedDocs);

    return res.status(201).json({
      message: 'Entries created successfully',
      entries: createdEntries,
    });
  } catch (error) {
    console.error('Bulk create entries error:', error);
    return res.status(500).json({
      error: 'Failed to create entries. Please try again.',
    });
  }
};

/**
 * GET /api/journeys/:journeyId/entries
 * List all entries for the journey, sorted by dayNumber ascending.
 */
export const getEntriesByJourney = async (req, res) => {
  try {
    const { journeyId } = req.params;
    const journey = await verifyJourneyOwner(journeyId, req.userId);

    if (!journey) {
      return res.status(404).json({
        error: 'Journey not found',
      });
    }

    const entries = await DailyEntry.find({ journeyId: journey._id }).sort({ dayNumber: 1 });

    return res.status(200).json({
      entries,
    });
  } catch (error) {
    console.error('Get entries by journey error:', error);
    return res.status(500).json({
      error: 'Failed to retrieve entries',
    });
  }
};

/**
 * PATCH /api/journeys/:journeyId/entries/:entryId
 * Edit topic/challenge/extraNotes.
 * Only allowed while status is "planned" or "generated" (not after "posted", "failed", "skipped").
 */
export const updateEntry = async (req, res) => {
  try {
    const { journeyId, entryId } = req.params;
    const journey = await verifyJourneyOwner(journeyId, req.userId);

    if (!journey) {
      return res.status(404).json({
        error: 'Journey not found',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(entryId)) {
      return res.status(404).json({
        error: 'Entry not found',
      });
    }

    const entry = await DailyEntry.findOne({
      _id: entryId,
      journeyId: journey._id,
    });

    if (!entry) {
      return res.status(404).json({
        error: 'Entry not found',
      });
    }

    // Only allowed while status is 'planned' or 'generated'
    if (entry.status !== 'planned' && entry.status !== 'generated') {
      return res.status(400).json({
        error: `Cannot edit an entry with status "${entry.status}". Editing is only permitted when status is "planned" or "generated".`,
      });
    }

    const { topic, challenge, extraNotes } = req.body;

    if (topic !== undefined) {
      entry.topic = typeof topic === 'string' ? topic.trim() : topic;
    }
    if (challenge !== undefined) {
      entry.challenge = typeof challenge === 'string' ? challenge.trim() : challenge;
    }
    if (extraNotes !== undefined) {
      entry.extraNotes = typeof extraNotes === 'string' ? extraNotes.trim() : extraNotes;
    }

    await entry.save();

    return res.status(200).json({
      message: 'Entry updated successfully',
      entry,
    });
  } catch (error) {
    console.error('Update entry error:', error);
    return res.status(500).json({
      error: 'Failed to update entry',
    });
  }
};

/**
 * PATCH /api/journeys/:journeyId/entries/:entryId/status
 * Helper to update entry status for pipeline progression & testing (e.g. marking as "posted").
 */
export const updateEntryStatus = async (req, res) => {
  try {
    const { journeyId, entryId } = req.params;
    const journey = await verifyJourneyOwner(journeyId, req.userId);

    if (!journey) {
      return res.status(404).json({
        error: 'Journey not found',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(entryId)) {
      return res.status(404).json({
        error: 'Entry not found',
      });
    }

    const entry = await DailyEntry.findOne({
      _id: entryId,
      journeyId: journey._id,
    });

    if (!entry) {
      return res.status(404).json({
        error: 'Entry not found',
      });
    }

    const { status } = req.body;
    const allowedStatuses = ['planned', 'generated', 'posted', 'failed', 'skipped'];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Status must be one of: planned, generated, posted, failed, skipped',
      });
    }

    entry.status = status;
    if (status === 'posted' && !entry.postedAt) {
      entry.postedAt = new Date();
    }

    await entry.save();

    return res.status(200).json({
      message: 'Entry status updated successfully',
      entry,
    });
  } catch (error) {
    console.error('Update entry status error:', error);
    return res.status(500).json({
      error: 'Failed to update entry status',
    });
  }
};

/**
 * POST /api/journeys/:journeyId/entries/:entryId/generate-text
 * Generates LinkedIn post text using LLM, updates entry.generatedText, sets status to 'generated',
 * and returns the updated entry document.
 */
export const generateEntryText = async (req, res) => {
  try {
    const { journeyId, entryId } = req.params;
    const journey = await verifyJourneyOwner(journeyId, req.userId);

    if (!journey) {
      return res.status(404).json({
        error: 'Journey not found',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(entryId)) {
      return res.status(404).json({
        error: 'Entry not found',
      });
    }

    const entry = await DailyEntry.findOne({
      _id: entryId,
      journeyId: journey._id,
    });

    if (!entry) {
      return res.status(404).json({
        error: 'Entry not found',
      });
    }

    if (entry.status === 'posted') {
      return res.status(400).json({
        error: 'Cannot generate text for an entry that has already been posted.',
      });
    }

    // Call LLM text generation service
    const generatedText = await generatePostText(journey, entry);

    entry.generatedText = generatedText;
    entry.status = 'generated';
    entry.error = undefined;

    await entry.save();

    return res.status(200).json({
      message: 'Post text generated successfully',
      entry,
    });
  } catch (error) {
    console.error('Generate entry text error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate post text',
    });
  }
};

/**
 * POST /api/journeys/:journeyId/entries/:entryId/generate-image
 * Generates LinkedIn post image, uploads to Cloudinary (or provider URL),
 * updates entry.generatedImageUrl, sets status to 'generated', and returns updated entry.
 */
export const generateEntryImage = async (req, res) => {
  try {
    const { journeyId, entryId } = req.params;
    const journey = await verifyJourneyOwner(journeyId, req.userId);

    if (!journey) {
      return res.status(404).json({
        error: 'Journey not found',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(entryId)) {
      return res.status(404).json({
        error: 'Entry not found',
      });
    }

    const entry = await DailyEntry.findOne({
      _id: entryId,
      journeyId: journey._id,
    });

    if (!entry) {
      return res.status(404).json({
        error: 'Entry not found',
      });
    }

    if (entry.status === 'posted') {
      return res.status(400).json({
        error: 'Cannot generate image for an entry that has already been posted.',
      });
    }

    // Call Image generation service
    const imageUrl = await generatePostImage(journey, entry);

    entry.generatedImageUrl = imageUrl;
    entry.status = 'generated';
    entry.error = undefined;

    await entry.save();

    return res.status(200).json({
      message: 'Post image generated successfully',
      entry,
    });
  } catch (error) {
    console.error('Generate entry image error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate post image',
    });
  }
};

export default {
  bulkCreateEntries,
  getEntriesByJourney,
  updateEntry,
  updateEntryStatus,
  generateEntryText,
  generateEntryImage,
};

