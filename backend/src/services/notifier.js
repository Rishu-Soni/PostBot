import axios from 'axios';
import User from '../models/User.js';

const RESEND_API_URL = 'https://api.resend.com/emails';
const SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';
const DEFAULT_FROM = process.env.EMAIL_FROM || 'PostBot <onboarding@resend.dev>';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Custom error class for email delivery failures.
 */
export class EmailDeliveryError extends Error {
  constructor(message, provider = null, details = null, statusCode = null) {
    super(message);
    this.name = 'EmailDeliveryError';
    this.provider = provider;
    this.details = details;
    this.statusCode = statusCode;
  }
}

/**
 * Helper to construct the LinkedIn feed URL from a post URN or ID.
 * E.g. "urn:li:share:123456789" -> "https://www.linkedin.com/feed/update/urn:li:share:123456789"
 *
 * @param {string} postUrn
 * @returns {string} Fully qualified LinkedIn URL
 */
export const getLinkedInPostUrl = (postUrn) => {
  if (!postUrn) return 'https://www.linkedin.com/feed/';
  const cleanUrn = String(postUrn).trim();
  if (cleanUrn.startsWith('http://') || cleanUrn.startsWith('https://')) {
    return cleanUrn;
  }
  return `https://www.linkedin.com/feed/update/${cleanUrn}`;
};

/**
 * Automatically determine the active email provider based on configuration.
 *
 * @returns {'resend'|'sendgrid'|'mock'}
 */
export const getActiveEmailProvider = () => {
  const explicitProvider = process.env.EMAIL_PROVIDER?.toLowerCase()?.trim();
  if (explicitProvider === 'sendgrid' || explicitProvider === 'resend' || explicitProvider === 'mock') {
    return explicitProvider;
  }
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim()) {
    return 'resend';
  }
  if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.trim()) {
    return 'sendgrid';
  }
  return 'mock';
};

/**
 * Low-level email sending function supporting Resend and SendGrid REST APIs.
 * If no API key is configured (or in test environment without keys), logs mock output cleanly.
 *
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient email address(es)
 * @param {string} options.subject - Email subject line
 * @param {string} options.html - HTML body
 * @param {string} [options.text] - Plain text fallback body
 * @param {string} [options.from] - Sender address override
 * @returns {Promise<Object>} Delivery result object
 */
export const sendEmail = async ({ to, subject, html, text, from = DEFAULT_FROM }) => {
  if (!to) {
    throw new EmailDeliveryError('Recipient email ("to") is required');
  }
  if (!subject) {
    throw new EmailDeliveryError('Email "subject" is required');
  }
  if (!html && !text) {
    throw new EmailDeliveryError('Email "html" or "text" content is required');
  }

  const recipients = Array.isArray(to) ? to : [to];
  const provider = getActiveEmailProvider();

  // Mock / offline fallback
  if (provider === 'mock') {
    const mockId = `mock_email_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log(`[Notifier:Mock] 📧 [${provider.toUpperCase()}] To: ${recipients.join(', ')} | Subject: "${subject}"`);
    return {
      success: true,
      provider: 'mock',
      id: mockId,
      mocked: true,
      to: recipients,
      subject,
    };
  }

  // 1. Resend API
  if (provider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      throw new EmailDeliveryError('RESEND_API_KEY is missing in environment', 'resend');
    }

    try {
      const response = await axios.post(
        RESEND_API_URL,
        {
          from,
          to: recipients,
          subject,
          html,
          text: text || html.replace(/<[^>]*>?/gm, ''),
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      console.log(`[Notifier:Resend] ✉️ Email sent to ${recipients.join(', ')} (ID: ${response.data?.id || 'ok'})`);
      return {
        success: true,
        provider: 'resend',
        id: response.data?.id,
        data: response.data,
      };
    } catch (err) {
      const statusCode = err.response?.status;
      const details = err.response?.data || err.message;
      const errorMsg = `Resend API failed (${statusCode || 'ERR'}): ${typeof details === 'object' ? JSON.stringify(details) : details}`;
      console.error(`[Notifier:Resend] ❌ ${errorMsg}`);
      throw new EmailDeliveryError(errorMsg, 'resend', details, statusCode);
    }
  }

  // 2. SendGrid API
  if (provider === 'sendgrid') {
    const apiKey = process.env.SENDGRID_API_KEY?.trim();
    if (!apiKey) {
      throw new EmailDeliveryError('SENDGRID_API_KEY is missing in environment', 'sendgrid');
    }

    // Parse sender name & email
    let fromEmail = from;
    let fromName = 'PostBot';
    const match = from.match(/^(.*?)\s*<(.+)>$/);
    if (match) {
      fromName = match[1].trim();
      fromEmail = match[2].trim();
    }

    const payload = {
      personalizations: [
        {
          to: recipients.map((email) => ({ email: email.trim() })),
        },
      ],
      from: {
        email: fromEmail,
        name: fromName,
      },
      subject,
      content: [
        {
          type: 'text/plain',
          value: text || html.replace(/<[^>]*>?/gm, ''),
        },
        {
          type: 'text/html',
          value: html,
        },
      ],
    };

    try {
      const response = await axios.post(SENDGRID_API_URL, payload, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      const messageId = response.headers?.['x-message-id'] || 'sg_ok';
      console.log(`[Notifier:SendGrid] ✉️ Email sent to ${recipients.join(', ')} (Message ID: ${messageId})`);
      return {
        success: true,
        provider: 'sendgrid',
        id: messageId,
        status: response.status,
      };
    } catch (err) {
      const statusCode = err.response?.status;
      const details = err.response?.data || err.message;
      const errorMsg = `SendGrid API failed (${statusCode || 'ERR'}): ${typeof details === 'object' ? JSON.stringify(details) : details}`;
      console.error(`[Notifier:SendGrid] ❌ ${errorMsg}`);
      throw new EmailDeliveryError(errorMsg, 'sendgrid', details, statusCode);
    }
  }

  throw new EmailDeliveryError(`Unsupported email provider: ${provider}`);
};

/**
 * Base responsive HTML email wrapper template.
 */
const renderEmailShell = ({ title, preheader, bodyContent }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #0f172a;
      padding: 40px 16px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #1e293b;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid #334155;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .header {
      background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
      padding: 32px 24px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .header .subtitle {
      margin-top: 6px;
      color: #bae6fd;
      font-size: 14px;
    }
    .content {
      padding: 32px 24px;
    }
    .card {
      background-color: #0f172a;
      border-radius: 12px;
      padding: 20px;
      margin: 20px 0;
      border: 1px solid #334155;
    }
    .btn-primary {
      display: inline-block;
      background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%);
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 28px;
      font-size: 15px;
      font-weight: 600;
      border-radius: 8px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
    }
    .btn-danger {
      display: inline-block;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 28px;
      font-size: 15px;
      font-weight: 600;
      border-radius: 8px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    }
    .btn-warning {
      display: inline-block;
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 28px;
      font-size: 15px;
      font-weight: 600;
      border-radius: 8px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
    }
    .footer {
      padding: 24px;
      text-align: center;
      border-top: 1px solid #334155;
      font-size: 12px;
      color: #94a3b8;
    }
    .footer a {
      color: #38bdf8;
      text-decoration: none;
    }
    .tag {
      display: inline-block;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 6px;
      background-color: #334155;
      color: #f1f5f9;
      margin-bottom: 12px;
    }
    .error-box {
      background-color: #450a0a;
      border: 1px solid #991b1b;
      border-radius: 8px;
      padding: 14px;
      color: #fca5a5;
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      word-break: break-word;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#0f172a;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader || title}
  </div>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>PostBot</h1>
        <div class="subtitle">Autonomous LinkedIn Journey Publishing</div>
      </div>
      <div class="content">
        ${bodyContent}
      </div>
      <div class="footer">
        <p>Sent automatically by <a href="${FRONTEND_URL}">PostBot</a>.</p>
        <p>Manage your journeys and automation settings at <a href="${FRONTEND_URL}/settings">${FRONTEND_URL}/settings</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;

// ============================================================================
// TEMPLATE 1: "Your post published today" (Link to LinkedIn Post)
// ============================================================================

/**
 * Generates HTML & Plain text for Template 1: Post Published Successfully.
 */
export const buildPostPublishedTemplate = ({ user, journey, entry, postUrn }) => {
  const userName = user?.name || 'Creator';
  const journeyTitle = journey?.title || 'Daily Journey';
  const dayNumber = entry?.dayNumber || 1;
  const topic = entry?.topic || 'Daily Milestone';
  const commentary = entry?.generatedText || '';
  const postUrl = getLinkedInPostUrl(postUrn || entry?.linkedinPostUrn);
  const imageUrl = entry?.generatedImageUrl;

  const subject = `🚀 Your post published today! (Day ${dayNumber}: ${topic})`;
  const preheader = `Day ${dayNumber} of "${journeyTitle}" is now live on LinkedIn. View your live post!`;

  const bodyContent = `
    <span class="tag" style="background-color: #065f46; color: #a7f3d0;">✅ Published Successfully</span>
    <h2 style="margin: 0 0 12px 0; font-size: 20px; color: #ffffff;">Your post published today! 🎉</h2>
    <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6; margin: 0 0 18px 0;">
      Hi ${userName}, great news! <strong>Day ${dayNumber}</strong> of your journey <em>"${journeyTitle}"</em> was just published automatically to your LinkedIn feed.
    </p>

    <div class="card">
      <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #38bdf8; margin-bottom: 6px;">
        Topic: ${topic}
      </div>
      <p style="color: #e2e8f0; font-size: 14px; line-height: 1.5; margin: 0 0 12px 0; font-style: italic; border-left: 3px solid #0ea5e9; padding-left: 12px;">
        "${commentary.length > 300 ? commentary.substring(0, 300) + '...' : commentary}"
      </p>
      ${
        imageUrl
          ? `<div style="margin-top: 14px; text-align: center;">
              <img src="${imageUrl}" alt="Post Visual" style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #334155; max-height: 240px; object-fit: cover;" />
            </div>`
          : ''
      }
    </div>

    <div style="text-align: center; margin: 28px 0 20px 0;">
      <a href="${postUrl}" class="btn-primary" target="_blank" rel="noopener noreferrer">
        👀 View Post on LinkedIn
      </a>
    </div>

    <p style="text-align: center; font-size: 13px; color: #94a3b8; margin-top: 12px;">
      Or view your full journey calendar in <a href="${FRONTEND_URL}/journeys/${journey?._id || ''}" style="color: #38bdf8;">PostBot Dashboard</a>.
    </p>
  `;

  const text = `PostBot: Your post published today! 🎉

Hi ${userName},

Day ${dayNumber} of your journey "${journeyTitle}" has been successfully published to LinkedIn!

Topic: ${topic}
Preview:
"${commentary}"

View your live LinkedIn post here:
${postUrl}

Manage your journey:
${FRONTEND_URL}/journeys/${journey?._id || ''}
`;

  return {
    subject,
    html: renderEmailShell({ title: subject, preheader, bodyContent }),
    text,
  };
};

/**
 * Sends Template 1: Post Published Successfully email.
 */
export const sendPostPublishedEmail = async ({ user, journey, entry, postUrn }) => {
  const recipient = user?.email || (typeof user === 'string' && user.includes('@') ? user : null);
  if (!recipient) {
    throw new Error('Valid user email address is required to send post published notification');
  }

  const { subject, html, text } = buildPostPublishedTemplate({ user, journey, entry, postUrn });
  return sendEmail({ to: recipient, subject, html, text });
};

// ============================================================================
// TEMPLATE 2: "We couldn't publish — reconnect LinkedIn" (Reauth Required)
// ============================================================================

/**
 * Generates HTML & Plain text for Template 2: LinkedIn Re-authentication Required.
 */
export const buildReconnectLinkedInTemplate = ({ user, journey, entry, error }) => {
  const userName = user?.name || 'Creator';
  const journeyTitle = journey?.title || 'Daily Journey';
  const dayNumber = entry?.dayNumber || 1;
  const topic = entry?.topic || 'Daily Post';
  const settingsUrl = `${FRONTEND_URL}/settings`;

  const subject = `⚠️ We couldn't publish — reconnect LinkedIn`;
  const preheader = `Your LinkedIn session expired. Please reconnect your account to continue automated publishing.`;

  const bodyContent = `
    <span class="tag" style="background-color: #78350f; color: #fde68a;">⚠️ Re-authentication Required</span>
    <h2 style="margin: 0 0 12px 0; font-size: 20px; color: #ffffff;">We couldn't publish — reconnect LinkedIn</h2>
    <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6; margin: 0 0 18px 0;">
      Hi ${userName}, PostBot was scheduled to publish <strong>Day ${dayNumber}</strong> of your journey <em>"${journeyTitle}"</em> today, but your LinkedIn authorization token has expired or was disconnected.
    </p>

    <div class="card">
      <div style="font-size: 13px; color: #94a3b8; margin-bottom: 6px;">
        <strong>Missed Milestone:</strong> Day ${dayNumber} &bull; <em>${topic}</em>
      </div>
      <div style="font-size: 13px; color: #f87171;">
        <strong>Reason:</strong> LinkedIn OAuth token is expired or unauthorized.
      </div>
    </div>

    <div style="text-align: center; margin: 28px 0 20px 0;">
      <a href="${settingsUrl}" class="btn-warning" target="_blank" rel="noopener noreferrer">
        🔗 Reconnect LinkedIn Account
      </a>
    </div>

    <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
      👉 Reconnecting takes less than 10 seconds. Once re-authenticated, your scheduled daily posts will automatically resume without interruption.
    </p>
  `;

  const text = `PostBot: We couldn't publish — reconnect LinkedIn ⚠️

Hi ${userName},

PostBot attempted to publish Day ${dayNumber} (${topic}) of your journey "${journeyTitle}", but your LinkedIn authorization has expired or was revoked.

To fix this and resume automated publishing, please reconnect your LinkedIn profile:
${settingsUrl}

Once reconnected, your daily posts will continue as scheduled.
`;

  return {
    subject,
    html: renderEmailShell({ title: subject, preheader, bodyContent }),
    text,
  };
};

/**
 * Sends Template 2: LinkedIn Re-authentication Required email.
 */
export const sendReconnectLinkedInEmail = async ({ user, journey, entry, error }) => {
  const recipient = user?.email || (typeof user === 'string' && user.includes('@') ? user : null);
  if (!recipient) {
    throw new Error('Valid user email address is required to send reconnect LinkedIn notification');
  }

  const { subject, html, text } = buildReconnectLinkedInTemplate({ user, journey, entry, error });
  return sendEmail({ to: recipient, subject, html, text });
};

// ============================================================================
// TEMPLATE 3: "Generation/publish failed after retries" (Include Error)
// ============================================================================

/**
 * Generates HTML & Plain text for Template 3: Failed After Retries.
 */
export const buildPublishFailedTemplate = ({ user, journey, entry, error, attempts }) => {
  const userName = user?.name || 'Creator';
  const journeyTitle = journey?.title || 'Daily Journey';
  const dayNumber = entry?.dayNumber || 1;
  const topic = entry?.topic || 'Daily Post';
  const errorMessage = error?.message || (typeof error === 'string' ? error : 'Unknown server error');
  const journeyUrl = `${FRONTEND_URL}/journeys/${journey?._id || ''}`;
  const totalAttempts = attempts || 3;

  const subject = `❌ Generation/publish failed after retries (${journeyTitle} - Day ${dayNumber})`;
  const preheader = `PostBot could not complete Day ${dayNumber} after ${totalAttempts} attempts: ${errorMessage}`;

  const bodyContent = `
    <span class="tag" style="background-color: #7f1d1d; color: #fecaca;">❌ Publishing Failed</span>
    <h2 style="margin: 0 0 12px 0; font-size: 20px; color: #ffffff;">Generation/publish failed after retries</h2>
    <p style="color: #cbd5e1; font-size: 15px; line-height: 1.6; margin: 0 0 18px 0;">
      Hi ${userName}, PostBot encountered persistent errors while trying to process and publish <strong>Day ${dayNumber}</strong> of your journey <em>"${journeyTitle}"</em>. The job failed after <strong>${totalAttempts} retry attempts</strong>.
    </p>

    <div class="card">
      <div style="font-size: 13px; color: #cbd5e1; margin-bottom: 8px;">
        <strong>Details:</strong> Day ${dayNumber} &bull; <em>${topic}</em>
      </div>
      <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #f87171; margin-bottom: 6px;">
        Error Message:
      </div>
      <div class="error-box">${errorMessage}</div>
    </div>

    <div style="text-align: center; margin: 28px 0 20px 0;">
      <a href="${journeyUrl}" class="btn-danger" target="_blank" rel="noopener noreferrer">
        🛠️ Review & Retry in Dashboard
      </a>
    </div>

    <p style="text-align: center; font-size: 13px; color: #94a3b8; margin-top: 12px;">
      You can edit the prompt or manually regenerate this entry directly in your <a href="${journeyUrl}" style="color: #38bdf8;">Journey Workspace</a>.
    </p>
  `;

  const text = `PostBot: Generation/publish failed after retries ❌

Hi ${userName},

PostBot encountered errors processing Day ${dayNumber} (${topic}) of "${journeyTitle}". All ${totalAttempts} automated retry attempts were exhausted.

Error Details:
${errorMessage}

Please review or retry the post in your dashboard:
${journeyUrl}
`;

  return {
    subject,
    html: renderEmailShell({ title: subject, preheader, bodyContent }),
    text,
  };
};

/**
 * Sends Template 3: Generation / Publish Failed After Retries email.
 */
export const sendPublishFailedEmail = async ({ user, journey, entry, error, attempts }) => {
  const recipient = user?.email || (typeof user === 'string' && user.includes('@') ? user : null);
  if (!recipient) {
    throw new Error('Valid user email address is required to send publish failed notification');
  }

  const { subject, html, text } = buildPublishFailedTemplate({ user, journey, entry, error, attempts });
  return sendEmail({ to: recipient, subject, html, text });
};

// ============================================================================
// Unified notifyUser Dispatcher
// ============================================================================

/**
 * Unified notification dispatcher replacing the legacy Prompt 5.3 stub.
 * Resolves user document from DB if passed as string ID, and routes to the appropriate email template.
 *
 * @param {string|Object} userOrId - MongoDB user ID, user document, or email string
 * @param {string} type - Notification reason ('post_published' | 'reconnect_linkedin' | 'publish_failed' | etc.)
 * @param {Object} [payload={}] - Additional context ({ journey, entry, postUrn, error, attempts, user })
 * @returns {Promise<Object>} Result of sending the notification
 */
export const notifyUser = async (userOrId, type, payload = {}) => {
  let user = payload.user || (typeof userOrId === 'object' && userOrId?.email ? userOrId : null);

  // If user object not provided, resolve from database
  if (!user && userOrId) {
    const userId = userOrId?._id || userOrId;
    if (typeof userId === 'string' && userId.includes('@')) {
      user = { email: userId, name: userId.split('@')[0] };
    } else {
      try {
        user = await User.findById(userId);
      } catch (err) {
        console.warn(`[Notifier] Could not fetch User with ID ${userId}: ${err.message}`);
      }
    }
  }

  if (!user || !user.email) {
    console.warn(`[Notifier] ⚠️ Notification skipped: No recipient email found for user "${userOrId?._id || userOrId}"`);
    return { success: false, skipped: true, reason: 'missing_email' };
  }

  const cleanType = String(type || '').toLowerCase();
  console.log(`[Notifier] 🔔 Dispatching notification "${cleanType}" to ${user.email}...`);

  try {
    switch (cleanType) {
      case 'post_published':
      case 'published':
      case 'success':
        return await sendPostPublishedEmail({
          user,
          journey: payload.journey,
          entry: payload.entry,
          postUrn: payload.postUrn,
        });

      case 'reconnect_linkedin':
      case 'reauth_required':
      case 'reauth':
        return await sendReconnectLinkedInEmail({
          user,
          journey: payload.journey,
          entry: payload.entry,
          error: payload.error,
        });

      case 'publish_failed':
      case 'generation_failed':
      case 'failed':
        return await sendPublishFailedEmail({
          user,
          journey: payload.journey,
          entry: payload.entry,
          error: payload.error,
          attempts: payload.attempts,
        });

      default:
        console.warn(`[Notifier] Unknown notification type: "${cleanType}". Falling back to generic notification.`);
        return await sendEmail({
          to: user.email,
          subject: `PostBot Update: ${cleanType}`,
          text: `Notification: ${cleanType}\n\nDetails: ${JSON.stringify(payload, null, 2)}`,
          html: `<p>Notification: <strong>${cleanType}</strong></p><pre>${JSON.stringify(payload, null, 2)}</pre>`,
        });
    }
  } catch (err) {
    console.error(`[Notifier] ❌ Error sending "${cleanType}" notification:`, err.message || err);
    return {
      success: false,
      error: err.message,
      provider: err.provider,
    };
  }
};

export default {
  sendEmail,
  notifyUser,
  sendPostPublishedEmail,
  sendReconnectLinkedInEmail,
  sendPublishFailedEmail,
  buildPostPublishedTemplate,
  buildReconnectLinkedInTemplate,
  buildPublishFailedTemplate,
  getLinkedInPostUrl,
  getActiveEmailProvider,
  EmailDeliveryError,
};
