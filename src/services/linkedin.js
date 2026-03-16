// src/services/linkedin.js
// ─────────────────────────────────────────────────────────────────────────────
// LinkedIn REST API v2 integration.
//
// FIX TRACKER
//   FIX 8: Added axios timeout (10 s) to exchangeCodeForToken() and
//           refreshAccessToken(). Previously these could hang indefinitely if
//           LinkedIn's token endpoint was slow or down, blocking all async
//           resources while waiting.
//   FIX 9: getValidAccessToken() now accepts a null/invalid userDoc gracefully
//           (additional guard layer beyond the null check now in actions.js).
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const axios = require('axios');

const LINKEDIN_BASE      = 'https://api.linkedin.com/v2';
const LINKEDIN_AUTH_BASE = 'https://www.linkedin.com/oauth/v2';

const SCOPES = ['openid', 'profile', 'email', 'w_member_social'];

// ── OAuth helpers ─────────────────────────────────────────────────────────────

/**
 * Build the LinkedIn OAuth 2.0 authorisation URL.
 * The `stateParam` (telegramId) is sent as the OAuth `state` to detect CSRF:
 * when LinkedIn redirects back, we verify `state` matches the expected telegramId.
 *
 * @param {string} stateParam
 * @returns {string}
 */
function buildAuthUrl(stateParam) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.LINKEDIN_CLIENT_ID,
    redirect_uri:  process.env.LINKEDIN_REDIRECT_URI,
    state:         stateParam,
    scope:         SCOPES.join(' '),
  });
  return `${LINKEDIN_AUTH_BASE}/authorization?${params.toString()}`;
}

/**
 * Exchange an authorisation code for access + refresh tokens.
 *
 * FIX 8: Added 10 s timeout — previously could hang indefinitely.
 *
 * @param {string} code
 * @returns {Promise<{ accessToken: string, refreshToken: string|null, expiresIn: number }>}
 */
async function exchangeCodeForToken(code) {
  const params = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  process.env.LINKEDIN_REDIRECT_URI,
    client_id:     process.env.LINKEDIN_CLIENT_ID,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET,
  });

  const response = await axios.post(
    `${LINKEDIN_AUTH_BASE}/accessToken`,
    params.toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10_000, // FIX 8
    }
  );

  const { access_token, refresh_token, expires_in } = response.data;

  if (!access_token) {
    throw new Error('[LinkedIn] Token exchange succeeded but no access_token in response');
  }

  return {
    accessToken:  access_token,
    refreshToken: refresh_token ?? null,
    expiresIn:    expires_in,
  };
}

/**
 * Refresh an expired access token.
 * NOTE: LinkedIn refresh tokens are only available for select app types.
 * Standard developer apps must prompt users to re-authorise after ~60 days.
 *
 * FIX 8: Added 10 s timeout.
 *
 * @param {string} refreshToken
 * @returns {Promise<{ accessToken: string, expiresIn: number }>}
 */
async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     process.env.LINKEDIN_CLIENT_ID,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET,
  });

  const response = await axios.post(
    `${LINKEDIN_AUTH_BASE}/accessToken`,
    params.toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10_000, // FIX 8
    }
  );

  return {
    accessToken: response.data.access_token,
    expiresIn:   response.data.expires_in,
  };
}

// ── Profile helper ────────────────────────────────────────────────────────────

/**
 * Fetch the authenticated user's LinkedIn person URN.
 * Required to identify the post author in ugcPosts.
 *
 * @param {string} accessToken
 * @returns {Promise<string>} e.g. "urn:li:person:abc123"
 */
async function getPersonUrn(accessToken) {
  const response = await axios.get(`${LINKEDIN_BASE}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10_000,
  });

  const sub = response.data.sub;
  if (!sub) {
    throw new Error('[LinkedIn] Could not retrieve member ID from userinfo endpoint');
  }
  return `urn:li:person:${sub}`;
}

// ── Posting ───────────────────────────────────────────────────────────────────

/**
 * Create a text-only LinkedIn UGC post on behalf of the authenticated user.
 *
 * @param {string} accessToken
 * @param {string} postText - The post body (plain text, up to ~3000 chars)
 * @returns {Promise<{ postUrl: string }>}
 */
async function postToLinkedIn(accessToken, postText) {
  const authorUrn = await getPersonUrn(accessToken);

  const ugcPayload = {
    author:          authorUrn,
    lifecycleState:  'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary:    { text: postText },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const response = await axios.post(
    `${LINKEDIN_BASE}/ugcPosts`,
    ugcPayload,
    {
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      timeout: 15_000,
    }
  );

  const postId  = response.data.id ?? response.headers['x-restli-id'];
  const postUrl = postId
    ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}/`
    : 'https://www.linkedin.com/feed/';

  return { postUrl };
}

// ── Token validation ──────────────────────────────────────────────────────────

/**
 * Return a valid access token, refreshing pro-actively if within 7 days of expiry.
 *
 * FIX 9: Guards against null userDoc being passed (defence-in-depth beyond
 *        the null check in actions.js).
 *
 * @param {object|null} userDoc - Mongoose User document (may be null)
 * @returns {Promise<string>}   - Valid access token
 * @throws  {Error}             - 'NOT_CONNECTED' or 'TOKEN_EXPIRED' sentinels
 */
async function getValidAccessToken(userDoc) {
  // FIX 9: Treat a null/missing userDoc the same as NOT_CONNECTED.
  if (!userDoc || !userDoc.linkedinAccessToken) {
    throw new Error('NOT_CONNECTED');
  }

  const now      = Date.now();
  const expiryMs = userDoc.linkedinTokenExpiry
    ? new Date(userDoc.linkedinTokenExpiry).getTime()
    : 0;

  const sevenDaysMs    = 7 * 24 * 60 * 60 * 1000;
  const isExpiringSoon = expiryMs > 0 && (expiryMs - now) < sevenDaysMs;
  const isExpired      = expiryMs > 0 && now >= expiryMs;

  if (isExpired) {
    if (userDoc.linkedinRefreshToken) {
      try {
        const { accessToken, expiresIn } = await refreshAccessToken(userDoc.linkedinRefreshToken);
        userDoc.linkedinAccessToken = accessToken;
        userDoc.linkedinTokenExpiry = new Date(Date.now() + expiresIn * 1000);
        await userDoc.save();
        return accessToken;
      } catch {
        throw new Error('TOKEN_EXPIRED');
      }
    }
    throw new Error('TOKEN_EXPIRED');
  }

  if (isExpiringSoon && userDoc.linkedinRefreshToken) {
    // Silently refresh in the background — don't block the current post action.
    refreshAccessToken(userDoc.linkedinRefreshToken)
      .then(async ({ accessToken, expiresIn }) => {
        userDoc.linkedinAccessToken = accessToken;
        userDoc.linkedinTokenExpiry = new Date(Date.now() + expiresIn * 1000);
        await userDoc.save();
        console.log(`[LinkedIn] Pro-actively refreshed token for ${userDoc.telegramId}`);
      })
      .catch((err) => console.warn('[LinkedIn] Background token refresh failed:', err.message));
  }

  return userDoc.linkedinAccessToken;
}

module.exports = {
  buildAuthUrl,
  exchangeCodeForToken,
  postToLinkedIn,
  getValidAccessToken,
};
