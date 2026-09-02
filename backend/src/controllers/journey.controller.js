import mongoose from 'mongoose';
import Journey from '../models/Journey.js';

/**
 * Helper to normalize hashtags into a string array
 */
const normalizeHashtags = (hashtags) => {
  if (Array.isArray(hashtags)) {
    return hashtags
      .map((h) => (typeof h === 'string' ? h.trim() : ''))
      .filter((h) => h.length > 0);
  }
  if (typeof hashtags === 'string') {
    return hashtags
      .split(/[\s,]+/)
      .map((h) => h.trim())
      .filter((h) => h.length > 0);
  }
  return [];
};

/**
 * POST /api/journeys
 * Create a new journey for the authenticated user.
 * Body: title, hashtags, template, startDate, postTimeLocal, imageStyle
 */
export const createJourney = async (req, res) => {
  try {
    const {
      title,
      hashtags,
      template,
      startDate,
      postTimeLocal,
      imageStyle,
    } = req.body;

    // Validate title presence
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        error: 'Title is required and must not be empty',
      });
    }

    // Validate template presence and mandatory {{topic}} placeholder
    if (!template || typeof template !== 'string' || template.trim().length === 0) {
      return res.status(400).json({
        error: 'Template is required',
      });
    }

    if (!template.includes('{{topic}}')) {
      return res.status(400).json({
        error: 'Template must contain at least the {{topic}} placeholder',
      });
    }

    // Create new journey scoped to req.userId
    const newJourney = new Journey({
      userId: req.userId,
      title: title.trim(),
      hashtags: normalizeHashtags(hashtags),
      template: template.trim(),
      startDate: startDate ? new Date(startDate) : undefined,
      postTimeLocal: postTimeLocal || '09:00',
      imageStyle: typeof imageStyle === 'string' ? imageStyle.trim() : undefined,
      status: 'active',
      currentDay: 0,
    });

    await newJourney.save();

    return res.status(201).json({
      message: 'Journey created successfully',
      journey: newJourney,
    });
  } catch (error) {
    console.error('Create journey error:', error);
    return res.status(500).json({
      error: 'Failed to create journey. Please try again.',
    });
  }
};

/**
 * GET /api/journeys
 * List all journeys belonging to the authenticated user.
 */
export const getJourneys = async (req, res) => {
  try {
    const journeys = await Journey.find({ userId: req.userId }).sort({ _id: -1 });

    return res.status(200).json({
      journeys,
    });
  } catch (error) {
    console.error('Get journeys error:', error);
    return res.status(500).json({
      error: 'Failed to retrieve journeys',
    });
  }
};

/**
 * GET /api/journeys/:id
 * Retrieve a single journey by ID for the authenticated user.
 * Returns 404 if not found or owned by a different user.
 */
export const getJourneyById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        error: 'Journey not found',
      });
    }

    const journey = await Journey.findOne({
      _id: id,
      userId: req.userId,
    });

    if (!journey) {
      return res.status(404).json({
        error: 'Journey not found',
      });
    }

    return res.status(200).json({
      journey,
    });
  } catch (error) {
    console.error('Get journey by id error:', error);
    return res.status(500).json({
      error: 'Failed to retrieve journey',
    });
  }
};

/**
 * PATCH /api/journeys/:id
 * Update editable fields of a journey (title, hashtags, template, startDate, postTimeLocal, imageStyle, currentDay).
 * Returns 404 if not found or owned by another user.
 */
export const updateJourney = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        error: 'Journey not found',
      });
    }

    const journey = await Journey.findOne({
      _id: id,
      userId: req.userId,
    });

    if (!journey) {
      return res.status(404).json({
        error: 'Journey not found',
      });
    }

    const {
      title,
      hashtags,
      template,
      startDate,
      postTimeLocal,
      imageStyle,
      currentDay,
    } = req.body;

    // Validate title if provided
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({
          error: 'Title cannot be empty',
        });
      }
      journey.title = title.trim();
    }

    // Validate template if provided
    if (template !== undefined) {
      if (typeof template !== 'string' || template.trim().length === 0) {
        return res.status(400).json({
          error: 'Template cannot be empty',
        });
      }
      if (!template.includes('{{topic}}')) {
        return res.status(400).json({
          error: 'Template must contain at least the {{topic}} placeholder',
        });
      }
      journey.template = template.trim();
    }

    // Update hashtags if provided
    if (hashtags !== undefined) {
      journey.hashtags = normalizeHashtags(hashtags);
    }

    // Update startDate if provided
    if (startDate !== undefined) {
      journey.startDate = startDate ? new Date(startDate) : undefined;
    }

    // Update postTimeLocal if provided
    if (postTimeLocal !== undefined) {
      if (typeof postTimeLocal === 'string') {
        journey.postTimeLocal = postTimeLocal.trim();
      }
    }

    // Update imageStyle if provided
    if (imageStyle !== undefined) {
      journey.imageStyle = typeof imageStyle === 'string' ? imageStyle.trim() : undefined;
    }

    // Update currentDay if provided
    if (currentDay !== undefined) {
      if (typeof currentDay !== 'number' || currentDay < 0) {
        return res.status(400).json({
          error: 'currentDay must be a non-negative number',
        });
      }
      journey.currentDay = currentDay;
    }

    await journey.save();

    return res.status(200).json({
      message: 'Journey updated successfully',
      journey,
    });
  } catch (error) {
    console.error('Update journey error:', error);
    return res.status(500).json({
      error: 'Failed to update journey',
    });
  }
};

/**
 * PATCH /api/journeys/:id/status
 * Set journey status to active, paused, or completed.
 * Returns 404 if not found or owned by another user.
 */
export const updateJourneyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['active', 'paused', 'completed'];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Status must be one of: active, paused, completed',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        error: 'Journey not found',
      });
    }

    const journey = await Journey.findOne({
      _id: id,
      userId: req.userId,
    });

    if (!journey) {
      return res.status(404).json({
        error: 'Journey not found',
      });
    }

    journey.status = status;
    await journey.save();

    return res.status(200).json({
      message: 'Journey status updated successfully',
      journey,
    });
  } catch (error) {
    console.error('Update journey status error:', error);
    return res.status(500).json({
      error: 'Failed to update journey status',
    });
  }
};

export default {
  createJourney,
  getJourneys,
  getJourneyById,
  updateJourney,
  updateJourneyStatus,
};
