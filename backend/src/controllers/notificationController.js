const { Notification } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Returns paginated list of failure and low-stock alerts.
 * Route: GET /api/v1/notifications
 */
const listNotifications = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const filter = { userId: req.user._id };
  if (req.query.resolved !== undefined) {
    filter.resolved = req.query.resolved === 'true' || req.query.resolved === true;
  }

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      notifications,
      total,
      page,
      limit,
    },
  });
});

/**
 * Mark an alert notification as resolved (e.g., after user reconnects LinkedIn).
 * Route: PATCH /api/v1/notifications/:id/resolve
 */
const resolveNotification = asyncHandler(async (req, res) => {
  const notification = req.idDoc;

  notification.resolved = true;
  await notification.save();

  res.status(200).json({
    success: true,
    data: {
      notification,
    },
  });
});

module.exports = {
  listNotifications,
  resolveNotification,
};
