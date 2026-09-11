const schedulerService = require('../services/schedulerService');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Manually trigger a scheduler pass for testing without waiting for cron.
 * Protected by admin key, not user JWT.
 * Route: POST /api/v1/internal/scheduler/run-now
 */
const runSchedulerNow = asyncHandler(async (req, res) => {
  const result = await schedulerService.runSchedulerPass();

  res.status(200).json({
    success: true,
    data: {
      message: 'Scheduler pass executed successfully.',
      result,
    },
  });
});

module.exports = {
  runSchedulerNow,
};
