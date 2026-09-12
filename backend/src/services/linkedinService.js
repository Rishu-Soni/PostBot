const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User } = require('../models');
const AppError = require('../utils/AppError');

/**
 * LinkedIn Service
 * Handles LinkedIn OAuth 2.0 (w_member_social scope) and profile publishing
 * using LinkedIn's official REST API (/rest/posts) and image registration flow.
 */

const LINKEDIN_API_VERSION = '202401';
const RESTLI_PROTOCOL_VERSION = '2.0.0';

/**
 * Helper to retrieve and validate LinkedIn OAuth configuration from environment.
 * Ensures the app boots cleanly even if credentials are not yet supplied.
 *
 * @returns {{ clientId: string, clientSecret: string, redirectUri: string, stateSecret: string }}
 */
const getLinkedInConfig = () => {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;
  const stateSecret =
    process.env.LINKEDIN_STATE_SECRET ||
    process.env.JWT_SECRET ||
    'dev-postbot-jwt-secret-key';

  if (!clientId || !clientSecret || !redirectUri) {
    throw new AppError(
      'LinkedIn OAuth credentials are missing or incomplete. Please configure LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and LINKEDIN_REDIRECT_URI in .env.',
      500
    );
  }

  return { clientId, clientSecret, redirectUri, stateSecret };
};

/**
 * Generates LinkedIn OAuth consent URL with a secure, signed CSRF state payload.
 *
 * @param {string|mongoose.Types.ObjectId} userId - Current user's MongoDB ObjectId
 * @returns {Promise<{ url: string, state: string }>}
 */
const getAuthorizationUrl = async (userId) => {
  if (!userId) {
    throw new AppError('userId is required to generate LinkedIn authorization URL.', 400);
  }

  const { clientId, redirectUri, stateSecret } = getLinkedInConfig();

  // Signed tamper-evident state param encoding userId with a 15-minute expiry
  const state = jwt.sign(
    {
      userId: userId.toString(),
      type: 'linkedin_oauth_state',
    },
    stateSecret,
    { expiresIn: '15m' }
  );

  const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', 'w_member_social');

  return {
    url: authUrl.toString(),
    state,
  };
};

/**
 * Validates OAuth callback state, exchanges authorization code for tokens,
 * and retrieves the LinkedIn member ID (sub claim).
 * Does not write directly to DB — returns token data for the controller to store.
 *
 * @param {string} code - OAuth authorization code
 * @param {string} state - Signed CSRF state token
 * @returns {Promise<{ userId: string, linkedinUserId: string, accessToken: string, refreshToken: string|null, tokenExpiresAt: Date, scope: string }>}
 */
const handleCallback = async (code, state) => {
  if (!code || !state) {
    throw new AppError('Missing required OAuth code or state parameter in callback.', 400);
  }

  const { clientId, clientSecret, redirectUri, stateSecret } = getLinkedInConfig();

  // 1. Verify tamper-evident state token
  let decoded;
  try {
    decoded = jwt.verify(state, stateSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('LinkedIn OAuth state has expired. Please try connecting again.', 400);
    }
    throw new AppError('Invalid or corrupted LinkedIn OAuth state parameter.', 400);
  }

  const userId = decoded.userId;
  if (!userId) {
    throw new AppError('LinkedIn OAuth state does not contain a valid userId.', 400);
  }

  // 2. Exchange authorization code for tokens
  let tokenData;
  try {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });

    const response = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    tokenData = response.data;
  } catch (error) {
    const errData = error.response?.data;
    const description = errData?.error_description || errData?.message || error.message;
    throw new AppError(`LinkedIn OAuth token exchange failed: ${description}`, 400);
  }

  const {
    access_token: accessToken,
    expires_in: expiresIn,
    refresh_token: refreshToken,
    scope,
  } = tokenData;

  if (!accessToken) {
    throw new AppError('LinkedIn OAuth response did not contain an access token.', 502);
  }

  const tokenExpiresAt = new Date(Date.now() + (expiresIn || 5184000) * 1000);

  // 3. Fetch LinkedIn member ID via OpenID userinfo (fallback to /v2/me if needed)
  let linkedinUserId = null;
  try {
    const userinfoResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    linkedinUserId = userinfoResponse.data?.sub;
  } catch (userinfoError) {
    try {
      const meResponse = await axios.get('https://api.linkedin.com/v2/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      linkedinUserId = meResponse.data?.id;
    } catch (meError) {
      const errorMsg =
        userinfoError.response?.data?.message ||
        userinfoError.message ||
        'Could not retrieve LinkedIn member ID';
      throw new AppError(`Failed to fetch LinkedIn profile: ${errorMsg}`, 502);
    }
  }

  if (!linkedinUserId) {
    throw new AppError('Could not identify LinkedIn member ID from user profile.', 502);
  }

  return {
    userId,
    linkedinUserId,
    accessToken,
    refreshToken: refreshToken || null,
    tokenExpiresAt,
    scope: scope || 'w_member_social',
  };
};

/**
 * Refreshes an expired or expiring LinkedIn OAuth access token using a stored refresh token.
 *
 * @param {Object|string} user - User document or user ID containing refresh token
 * @returns {Promise<{ accessToken: string, refreshToken: string, tokenExpiresAt: Date }>}
 */
const refreshToken = async (user) => {
  let userDoc = user;

  if (typeof user === 'string' || user instanceof mongoose.Types.ObjectId) {
    userDoc = await User.findById(user).select('+linkedin.accessToken +linkedin.refreshToken');
  } else if (!userDoc?.linkedin?.refreshToken && userDoc?._id) {
    userDoc = await User.findById(userDoc._id).select('+linkedin.accessToken +linkedin.refreshToken');
  }

  const currentRefreshToken = userDoc?.linkedin?.refreshToken;
  if (!currentRefreshToken) {
    throw new AppError(
      'No LinkedIn refresh token found for user. Please reconnect your LinkedIn account.',
      401
    );
  }

  const { clientId, clientSecret } = getLinkedInConfig();

  let refreshData;
  try {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    refreshData = response.data;
  } catch (error) {
    const errData = error.response?.data;
    const description = errData?.error_description || errData?.message || error.message;
    throw new AppError(
      `LinkedIn token refresh rejected: ${description}. Please reconnect your LinkedIn account.`,
      401
    );
  }

  const {
    access_token: newAccessToken,
    expires_in: expiresIn,
    refresh_token: newRefreshToken,
  } = refreshData;

  if (!newAccessToken) {
    throw new AppError('LinkedIn refresh response did not contain an access token.', 502);
  }

  const tokenExpiresAt = new Date(Date.now() + (expiresIn || 5184000) * 1000);

  // If userDoc is a Mongoose document, update the fields in memory/db
  if (userDoc?.linkedin) {
    userDoc.linkedin.accessToken = newAccessToken;
    if (newRefreshToken) {
      userDoc.linkedin.refreshToken = newRefreshToken;
    }
    userDoc.linkedin.tokenExpiresAt = tokenExpiresAt;
    if (typeof userDoc.save === 'function') {
      await userDoc.save();
    }
  }

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken || currentRefreshToken,
    tokenExpiresAt,
  };
};

/**
 * Disconnects LinkedIn account.
 * LinkedIn does not provide a programmatic OAuth2 token revocation endpoint.
 * Clears/no-ops gracefully; the calling controller manages clearing the DB credentials.
 *
 * @param {Object|string} user - User document or User ID
 * @returns {Promise<void>}
 */
const disconnect = async (user) => {
  // LinkedIn does not expose an official token revocation endpoint for personal OAuth2 tokens.
  // The controller immediately updates isConnected = false and clears stored tokens in MongoDB.
  return;
};

/**
 * Publishes a Post directly to the user's personal LinkedIn profile.
 * Implements the two-step image-register-then-post flow against LinkedIn's /rest/posts API.
 *
 * @param {Object} user - User document with access token and linkedinUserId
 * @param {Object} post - Post document to publish (caption, hashtags, image)
 * @returns {Promise<{ linkedinPostId: string, postedAt: Date }>}
 */
const createPost = async (user, post) => {
  let userDoc = user;
  if (typeof user === 'string' || user instanceof mongoose.Types.ObjectId) {
    userDoc = await User.findById(user).select('+linkedin.accessToken');
  } else if (!userDoc?.linkedin?.accessToken && userDoc?._id) {
    userDoc = await User.findById(userDoc._id).select('+linkedin.accessToken');
  }

  const accessToken = userDoc?.linkedin?.accessToken;
  const linkedinUserId = userDoc?.linkedin?.linkedinUserId;

  if (!accessToken) {
    throw new AppError(
      'LinkedIn access token not found for user. Please reconnect your LinkedIn account.',
      401
    );
  }

  if (!linkedinUserId) {
    throw new AppError(
      'LinkedIn member ID not found. Please reconnect your LinkedIn account.',
      400
    );
  }

  if (!post) {
    throw new AppError('Post object is required to publish to LinkedIn.', 400);
  }

  // 1. Format commentary (caption + hashtags appended)
  const rawCaption = (post.caption || '').trim();
  const rawHashtags = Array.isArray(post.hashtags) ? post.hashtags : [];

  const formattedTags = rawHashtags
    .map((tag) => {
      const clean = String(tag).replace(/^#+/, '').trim();
      return clean ? `#${clean}` : '';
    })
    .filter(Boolean)
    .join(' ');

  let commentary = rawCaption;
  if (formattedTags) {
    commentary = commentary ? `${commentary}\n\n${formattedTags}` : formattedTags;
  }

  if (!commentary) {
    throw new AppError(
      'Post must contain a caption or hashtags to publish to LinkedIn.',
      400
    );
  }

  // 2. Image registration and binary upload flow (if post has an image)
  let imageUrn = null;
  const imageUrl = post.image?.url;

  if (imageUrl) {
    // Step A: Initialize upload with LinkedIn
    let uploadUrl = null;
    try {
      const initResponse = await axios.post(
        'https://api.linkedin.com/rest/images?action=initializeUpload',
        {
          initializeUploadRequest: {
            owner: `urn:li:person:${linkedinUserId}`,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'LinkedIn-Version': LINKEDIN_API_VERSION,
            'X-Restli-Protocol-Version': RESTLI_PROTOCOL_VERSION,
            'Content-Type': 'application/json',
          },
        }
      );

      uploadUrl = initResponse.data?.value?.uploadUrl;
      imageUrn = initResponse.data?.value?.image;
    } catch (initError) {
      const errData = initError.response?.data;
      const detail = errData?.message || initError.message;
      throw new AppError(`Failed to initialize LinkedIn image upload: ${detail}`, 502);
    }

    if (!uploadUrl || !imageUrn) {
      throw new AppError(
        'LinkedIn did not return an image upload URL or image URN.',
        502
      );
    }

    // Step B: Download the image and upload the binary to LinkedIn's uploadUrl
    let imageBuffer;
    let contentType = 'application/octet-stream';
    try {
      const imageDownload = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
      });
      imageBuffer = Buffer.from(imageDownload.data);
      contentType = imageDownload.headers['content-type'] || 'image/jpeg';
    } catch (downloadError) {
      throw new AppError(
        `Failed to fetch post image from source URL: ${downloadError.message}`,
        400
      );
    }

    try {
      await axios.put(uploadUrl, imageBuffer, {
        headers: {
          'Content-Type': contentType,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 30000,
      });
    } catch (uploadError) {
      const detail = uploadError.response?.data || uploadError.message;
      throw new AppError(`Failed to upload image binary to LinkedIn: ${detail}`, 502);
    }
  }

  // 3. Construct post payload for /rest/posts
  const postPayload = {
    author: `urn:li:person:${linkedinUserId}`,
    commentary,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  if (imageUrn) {
    postPayload.content = {
      media: {
        id: imageUrn,
        title: post.image?.altText || 'PostBot Image',
      },
    };
  }

  // 4. Send POST request to /rest/posts
  let createResponse;
  try {
    createResponse = await axios.post(
      'https://api.linkedin.com/rest/posts',
      postPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'LinkedIn-Version': LINKEDIN_API_VERSION,
          'X-Restli-Protocol-Version': RESTLI_PROTOCOL_VERSION,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (postError) {
    const errData = postError.response?.data;
    const detail = errData?.message || postError.message;
    throw new AppError(`Failed to publish post to LinkedIn: ${detail}`, 502);
  }

  // LinkedIn returns the created post's URN in the x-restli-id or x-linkedin-id header, or response body
  const linkedinPostId =
    createResponse.headers['x-restli-id'] ||
    createResponse.headers['x-linkedin-id'] ||
    createResponse.data?.id ||
    createResponse.data?.urn ||
    null;

  return {
    linkedinPostId: linkedinPostId || `urn:li:share:${Date.now()}`,
    postedAt: new Date(),
  };
};

module.exports = {
  getAuthorizationUrl,
  handleCallback,
  disconnect,
  createPost,
  refreshToken,
};
