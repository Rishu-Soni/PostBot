const cron = require('node-cron');
const schedulerService = require('../services/schedulerService');

/**
 * Recurring Scheduler Cron Job
 * Periodically triggers schedulerService.runSchedulerPass() using node-cron.
 * Prevents overlapping passes with an execution lock.
 */

let scheduledTask = null;
let isPassInProgress = false;

/**
 * Starts the recurring scheduler cron job.
 * Reads interval from process.env.SCHEDULER_CRON_EXPRESSION or defaults to every 5 minutes.
 *
 * @returns {cron.ScheduledTask} The initialized cron task
 */
const startSchedulerJob = () => {
  const cronExpression = process.env.SCHEDULER_CRON_EXPRESSION || '*/5 * * * *';

  if (!cron.validate(cronExpression)) {
    console.warn(
      `[Scheduler Cron] Invalid cron expression: "${cronExpression}". Falling back to default "*/5 * * * *".`
    );
  }

  const activeExpression = cron.validate(cronExpression) ? cronExpression : '*/5 * * * *';

  console.log(`[Scheduler Cron] Registering cron job with schedule: "${activeExpression}"`);

  scheduledTask = cron.schedule(activeExpression, async () => {
    if (isPassInProgress) {
      console.log('[Scheduler Cron] Previous scheduler pass is still in progress. Skipping cycle.');
      return;
    }

    isPassInProgress = true;
    try {
      await schedulerService.runSchedulerPass();
    } catch (err) {
      console.error('[Scheduler Cron] Error executing scheduler pass:', err.message);
    } finally {
      isPassInProgress = false;
    }
  });

  return scheduledTask;
};

/**
 * Stops the running scheduler cron job.
 */
const stopSchedulerJob = () => {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('[Scheduler Cron] Scheduler cron job stopped.');
  }
};

module.exports = {
  startSchedulerJob,
  stopSchedulerJob,
};
