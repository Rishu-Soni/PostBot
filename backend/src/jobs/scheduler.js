import { dailyPostsQueue, QUEUE_NAME } from './queue.js';
import DailyEntry from '../models/DailyEntry.js';
import Journey from '../models/Journey.js';
import User from '../models/User.js';

/**
 * Determines whether a daily entry is due for publishing based on:
 * - The scheduled date
 * - The parent journey's local post time (HH:mm)
 * - The user's timezone (e.g. 'America/New_York', 'Asia/Kolkata', 'UTC')
 *
 * @param {Date|string} scheduledDate - The entry's scheduled date
 * @param {string} [postTimeLocal='09:00'] - The 24h local time (HH:mm)
 * @param {string} [timezone='UTC'] - The IANA timezone string of the user
 * @returns {boolean} True if the scheduled time has arrived or passed
 */
export const isEntryDue = (scheduledDate, postTimeLocal = '09:00', timezone = 'UTC') => {
  try {
    const now = new Date();
    const cleanTz = (timezone && typeof timezone === 'string' && timezone.trim()) ? timezone.trim() : 'UTC';

    // Format current time in user's timezone using native Intl
    let dtf;
    try {
      dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone: cleanTz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      // Fallback to UTC if timezone is invalid
      dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }

    const parts = dtf.formatToParts(now);
    const partMap = {};
    for (const p of parts) {
      partMap[p.type] = p.value;
    }

    const nowYear = partMap.year;
    const nowMonth = partMap.month;
    const nowDay = partMap.day;
    const nowHour = partMap.hour === '24' ? '00' : partMap.hour;
    const nowMinute = partMap.minute;

    const currentLocalDate = `${nowYear}-${nowMonth}-${nowDay}`;
    const currentLocalTime = `${nowHour}:${nowMinute}`;

    // Format entry's scheduled date as YYYY-MM-DD
    const entryDateObj = new Date(scheduledDate);
    if (isNaN(entryDateObj.getTime())) {
      return false;
    }

    const entryYear = entryDateObj.getUTCFullYear();
    const entryMonth = String(entryDateObj.getUTCMonth() + 1).padStart(2, '0');
    const entryDay = String(entryDateObj.getUTCDate()).padStart(2, '0');
    const entryLocalDate = `${entryYear}-${entryMonth}-${entryDay}`;

    // Clean postTimeLocal (HH:mm)
    const cleanPostTime = String(postTimeLocal || '09:00').trim().padStart(5, '0');

    // If entry scheduled date is before current local date, it's overdue -> due
    if (entryLocalDate < currentLocalDate) {
      return true;
    }

    // If entry scheduled date is today, check if current time is >= postTimeLocal
    if (entryLocalDate === currentLocalDate) {
      return currentLocalTime >= cleanPostTime;
    }

    // If scheduled date is in the future, not due
    return false;
  } catch (err) {
    console.error(`[Scheduler] Error evaluating isEntryDue for timezone "${timezone}":`, err.message);
    return false;
  }
};

/**
 * Scans MongoDB for planned DailyEntry records that are due according to the user's
 * local timezone and journey post time, and enqueues a publish job for each.
 *
 * Uses deterministic BullMQ Job IDs (`publish-entry-${entryId}`) to guarantee that
 * no entry can ever be enqueued twice concurrently.
 *
 * @returns {Promise<{ scanned: number, enqueued: number, enqueuedEntryIds: string[] }>}
 */
export const checkAndEnqueueScheduledEntries = async () => {
  try {
    // Find all entries that are still in "planned" status
    const plannedEntries = await DailyEntry.find({ status: 'planned' })
      .populate({
        path: 'journeyId',
        populate: { path: 'userId' },
      });

    let enqueuedCount = 0;
    const enqueuedEntryIds = [];

    for (const entry of plannedEntries) {
      const journey = entry.journeyId;
      if (!journey) {
        continue;
      }

      // Skip paused or completed journeys
      if (journey.status === 'paused' || journey.status === 'completed') {
        continue;
      }

      const user = journey.userId;
      const userTimezone = user?.timezone || 'UTC';
      const postTimeLocal = journey.postTimeLocal || '09:00';

      const isDue = isEntryDue(entry.scheduledDate, postTimeLocal, userTimezone);

      if (isDue) {
        const entryIdStr = entry._id.toString();
        const deterministicJobId = `publish-entry-${entryIdStr}`;

        try {
          await dailyPostsQueue.add(
            'publish-daily-post',
            { entryId: entryIdStr },
            {
              jobId: deterministicJobId,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 60000,
              },
            }
          );

          enqueuedCount++;
          enqueuedEntryIds.push(entryIdStr);
          console.log(
            `[Scheduler] ⏰ Enqueued post for entry ${entryIdStr} (Day ${entry.dayNumber}, User TZ: ${userTimezone}, Time: ${postTimeLocal})`
          );
        } catch (queueErr) {
          // If a job with the same deterministic ID already exists in the queue, BullMQ rejects duplication
          console.warn(`[Scheduler] Notice adding job for entry ${entryIdStr}: ${queueErr.message}`);
        }
      }
    }

    return {
      scanned: plannedEntries.length,
      enqueued: enqueuedCount,
      enqueuedEntryIds,
    };
  } catch (error) {
    console.error('[Scheduler] ❌ Error in checkAndEnqueueScheduledEntries:', error.message || error);
    return {
      scanned: 0,
      enqueued: 0,
      enqueuedEntryIds: [],
      error: error.message,
    };
  }
};

let schedulerInterval = null;

/**
 * Starts the periodic cron-like scheduler check.
 *
 * @param {number} [intervalMs=60000] - Interval between checks in ms (default: 60s)
 * @returns {NodeJS.Timeout} Timer reference
 */
export const startScheduler = (intervalMs = 60000) => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  console.log(`[Scheduler] ⏱️ Starting repeatable post scheduler (interval: ${intervalMs / 1000}s)`);

  // Run initial check immediately
  checkAndEnqueueScheduledEntries().catch((err) => {
    console.error('[Scheduler] Initial check error:', err.message);
  });

  // Schedule recurring check
  schedulerInterval = setInterval(() => {
    checkAndEnqueueScheduledEntries().catch((err) => {
      console.error('[Scheduler] Periodic check error:', err.message);
    });
  }, intervalMs);

  return schedulerInterval;
};

/**
 * Stops the running scheduler timer cleanly.
 *
 * @param {NodeJS.Timeout} [timer] - Optional specific timer to clear
 */
export const stopScheduler = (timer) => {
  const targetTimer = timer || schedulerInterval;
  if (targetTimer) {
    clearInterval(targetTimer);
    if (targetTimer === schedulerInterval) {
      schedulerInterval = null;
    }
    console.log('[Scheduler] 🛑 Repeatable post scheduler stopped.');
  }
};

export default {
  isEntryDue,
  checkAndEnqueueScheduledEntries,
  startScheduler,
  stopScheduler,
};
