/**
 * Notification Service Stub
 * Handles dispatching email and SMS alerts (e.g. via SendGrid/Twilio)
 * and logging Notification records for auditability.
 */

/**
 * Creates a notification and dispatches urgent email + SMS alerts for a scheduled post failure.
 *
 * @param {Object} user - User document
 * @param {Object} post - Failed Post document
 * @param {string} failureReason - Cause of the posting failure
 * @returns {Promise<Object>} Created Notification document
 */
const notifyPostingFailure = async (user, post, failureReason) => {
  // TODO: implement alert dispatch and notification logging
  throw new Error('Not implemented: notificationService.notifyPostingFailure');
};

/**
 * Creates a notification and dispatches alerts when a user's LinkedIn OAuth token has expired.
 *
 * @param {Object} user - User document
 * @returns {Promise<Object>} Created Notification document
 */
const notifyTokenExpired = async (user) => {
  // TODO: implement token expiry notification
  throw new Error('Not implemented: notificationService.notifyTokenExpired');
};

/**
 * Dispatches a reminder when all posts in an active batch have been posted/exhausted.
 *
 * @param {Object} user - User document
 * @param {Object} batch - Exhausted ContentBatch document
 * @returns {Promise<Object>} Created Notification document
 */
const notifyLowStock = async (user, batch) => {
  // TODO: implement low stock notification
  throw new Error('Not implemented: notificationService.notifyLowStock');
};

/**
 * Retrieves a paginated list of user notification records.
 *
 * @param {string} userId - User ID
 * @param {Object} [options]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=10]
 * @param {boolean} [options.resolved]
 * @returns {Promise<{ notifications: Object[], total: number, page: number, limit: number }>}
 */
const getNotifications = async (userId, options) => {
  // TODO: implement notification retrieval
  throw new Error('Not implemented: notificationService.getNotifications');
};

/**
 * Marks a specific notification record as resolved.
 *
 * @param {string} notificationId - Notification document ID
 * @param {string} userId - User ID for ownership validation
 * @returns {Promise<Object>} Updated Notification document
 */
const resolveNotification = async (notificationId, userId) => {
  // TODO: implement notification resolution
  throw new Error('Not implemented: notificationService.resolveNotification');
};

module.exports = {
  notifyPostingFailure,
  notifyTokenExpired,
  notifyLowStock,
  getNotifications,
  resolveNotification,
};
