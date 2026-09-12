const { Resend } = require('resend');
const twilio = require('twilio');
const { Notification } = require('../models');
const AppError = require('../utils/AppError');

/**
 * Notification Service
 * Dispatches multi-channel failure and low-stock alerts via Email (Resend) and SMS (Twilio),
 * logging Notification audit documents with delivery tracking.
 */

let resendClient = null;
const getResendClient = () => {
  if (!process.env.EMAIL_PROVIDER_API_KEY) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(process.env.EMAIL_PROVIDER_API_KEY);
  }
  return resendClient;
};

let twilioClient = null;
const getTwilioClient = () => {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return null;
  }
  if (!twilioClient) {
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
};

/**
 * Attempts sending an email alert via Resend.
 * Fails safely if API keys are missing or provider throws.
 */
const sendEmail = async ({ to, subject, text }) => {
  const client = getResendClient();
  if (!client) {
    throw new Error('EMAIL_PROVIDER_API_KEY is not configured');
  }
  const from = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';
  const response = await client.emails.send({
    from,
    to,
    subject,
    text,
  });

  if (response.error) {
    throw new Error(response.error.message || 'Resend email dispatch error');
  }
  return response;
};

/**
 * Attempts sending an SMS alert via Twilio.
 * Fails safely if credentials are not configured or Twilio throws.
 */
const sendSms = async ({ to, body }) => {
  const client = getTwilioClient();
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!client || !from) {
    throw new Error('Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER) are incomplete');
  }
  return await client.messages.create({
    body,
    from,
    to,
  });
};

/**
 * Dispatches alert messages across user-enabled channels (Email and/or SMS).
 * Wraps each channel independently so one failure does not prevent the other.
 * Updates the Notification record with successful channels, status, and failure notes.
 *
 * @param {Object} user - User document with notificationPrefs
 * @param {Object} notification - Mongoose Notification document
 * @param {string} subject - Email subject line
 * @param {string} message - Alert message body
 * @returns {Promise<Object>} Updated Notification document
 */
const dispatchAlerts = async (user, notification, subject, message) => {
  const attemptedChannels = [];
  const successfulChannels = [];
  const channelErrors = [];

  // 1. Email dispatch (enabled by default unless explicitly disabled)
  const isEmailEnabled = user?.notificationPrefs?.emailEnabled !== false;
  const recipientEmail = user?.notificationPrefs?.email || user?.email;

  if (isEmailEnabled && recipientEmail) {
    attemptedChannels.push('email');
    try {
      await sendEmail({
        to: recipientEmail,
        subject,
        text: message,
      });
      successfulChannels.push('email');
    } catch (err) {
      console.warn(`[NotificationService] Email delivery to ${recipientEmail} failed:`, err.message);
      channelErrors.push(`Email error: ${err.message}`);
    }
  }

  // 2. SMS dispatch (requires smsEnabled === true and valid phone)
  const isSmsEnabled = Boolean(user?.notificationPrefs?.smsEnabled);
  const recipientPhone = user?.notificationPrefs?.phone;

  if (isSmsEnabled && recipientPhone) {
    attemptedChannels.push('sms');
    try {
      await sendSms({
        to: recipientPhone,
        body: `[PostBot] ${message}`,
      });
      successfulChannels.push('sms');
    } catch (err) {
      console.warn(`[NotificationService] SMS delivery to ${recipientPhone} failed:`, err.message);
      channelErrors.push(`SMS error: ${err.message}`);
    }
  }

  // 3. Update deliveryStatus and channels on the Notification document
  let deliveryStatus = 'pending';
  if (attemptedChannels.length > 0) {
    deliveryStatus = successfulChannels.length > 0 ? 'sent' : 'failed';
  }

  notification.channels = successfulChannels;
  notification.deliveryStatus = deliveryStatus;

  if (channelErrors.length > 0) {
    notification.message = `${message}\n[Delivery Notes: ${channelErrors.join('; ')}]`;
  }

  await notification.save();
  return notification;
};

/**
 * Creates a notification and dispatches urgent email + SMS alerts for a scheduled post failure.
 *
 * @param {Object} user - User document
 * @param {Object} post - Failed Post document
 * @param {Error|string} error - Cause or Error object of the posting failure
 * @returns {Promise<Object>} Created and updated Notification document
 */
const notifyPostingFailure = async (user, post, error) => {
  const failureReason = error?.message || (typeof error === 'string' ? error : 'Unknown error');
  const message = `Scheduled post for day ${post?.dayIndex ?? 'N/A'} failed to publish to LinkedIn. Reason: ${failureReason}`;

  const notification = await Notification.create({
    userId: user._id,
    postId: post?._id || null,
    batchId: post?.batchId || null,
    type: 'posting_failure',
    channels: [],
    message,
    deliveryStatus: 'pending',
    resolved: false,
  });

  return await dispatchAlerts(
    user,
    notification,
    'PostBot Alert: Scheduled LinkedIn Post Failed',
    message
  );
};

/**
 * Creates a notification and dispatches alerts when a user's LinkedIn OAuth token has expired or cannot refresh.
 *
 * @param {Object} user - User document
 * @param {Object} [post=null] - Optional Post document that triggered the check
 * @returns {Promise<Object>} Created and updated Notification document
 */
const notifyTokenExpired = async (user, post = null) => {
  const message =
    'Your LinkedIn OAuth authorization has expired or could not be refreshed. Please reconnect your LinkedIn account in PostBot to resume scheduled posting.';

  const notification = await Notification.create({
    userId: user._id,
    postId: post?._id || null,
    batchId: post?.batchId || null,
    type: 'token_expired',
    channels: [],
    message,
    deliveryStatus: 'pending',
    resolved: false,
  });

  return await dispatchAlerts(
    user,
    notification,
    'PostBot Action Required: Reconnect Your LinkedIn Account',
    message
  );
};

/**
 * Dispatches a reminder when all posts in an active batch have been posted/exhausted.
 *
 * @param {Object} user - User document
 * @param {Object} batch - Exhausted ContentBatch document
 * @returns {Promise<Object>} Created and updated Notification document
 */
const notifyLowStock = async (user, batch) => {
  const theme = batch?.intake?.theme ? ` ("${batch.intake.theme}")` : '';
  const message =
    `All scheduled posts in your content batch${theme} have been posted or resolved. Submit a fresh weekly brain-dump to keep your LinkedIn queue active!`;

  const notification = await Notification.create({
    userId: user._id,
    postId: null,
    batchId: batch?._id || null,
    type: 'low_stock',
    channels: [],
    message,
    deliveryStatus: 'pending',
    resolved: false,
  });

  return await dispatchAlerts(
    user,
    notification,
    'PostBot Reminder: Your LinkedIn Content Queue Is Empty',
    message
  );
};

/**
 * Retrieves a paginated list of user notification records.
 *
 * @param {string} userId - User ID
 * @param {Object} [options]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=10]
 * @param {boolean|string} [options.resolved]
 * @returns {Promise<{ notifications: Object[], total: number, page: number, limit: number }>}
 */
const getNotifications = async (userId, options = {}) => {
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const filter = { userId };
  if (options.resolved !== undefined) {
    filter.resolved = options.resolved === true || options.resolved === 'true';
  }

  const [notifications, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
  ]);

  return {
    notifications,
    total,
    page,
    limit,
  };
};

/**
 * Marks a specific notification record as resolved with defense-in-depth ownership verification.
 *
 * @param {string} notificationId - Notification document ID
 * @param {string} userId - User ID for ownership validation
 * @returns {Promise<Object>} Updated Notification document
 */
const resolveNotification = async (notificationId, userId) => {
  const notification = await Notification.findById(notificationId);
  if (!notification) {
    throw new AppError('Notification record not found.', 404);
  }

  if (userId && notification.userId.toString() !== userId.toString()) {
    throw new AppError('You do not have permission to modify this notification.', 403);
  }

  notification.resolved = true;
  await notification.save();

  return notification;
};

module.exports = {
  notifyPostingFailure,
  notifyTokenExpired,
  notifyLowStock,
  getNotifications,
  resolveNotification,
};
