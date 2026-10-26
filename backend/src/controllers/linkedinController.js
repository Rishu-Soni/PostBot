const jwt = require('jsonwebtoken');
const { User } = require('../models');
const linkedinService = require('../services/linkedinService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const { getJwtSecret } = require('../config/env');

/**
 * Safely extracts target client webapp URL from OAuth state or environment.
 */
const resolveClientUrl = (state) => {
  if (state) {
    const stateSecret = process.env.LINKEDIN_STATE_SECRET || getJwtSecret();

    let decoded = null;
    try {
      decoded = jwt.verify(state, stateSecret);
    } catch {
      try {
        decoded = jwt.decode(state);
      } catch {
        decoded = null;
      }
    }

    if (decoded?.clientUrl && typeof decoded.clientUrl === 'string') {
      const clean = decoded.clientUrl.trim().replace(/\/+$/, '');
      if (/^https?:\/\//i.test(clean)) {
        return clean;
      }
    }
  }

  const configuredOrigins = (process.env.CLIENT_URL || '')
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  if (process.env.NODE_ENV !== 'production') {
    const local = configuredOrigins.find(
      (u) => u.includes('localhost') || u.includes('127.0.0.1')
    );
    if (local) return local;
    return 'http://localhost:5173';
  }

  return configuredOrigins[0] || 'https://58162827.postbot.pages.dev';
};

/**
 * Top-level browser redirect handler for LinkedIn OAuth callback.
 * Route: GET /linkedin/callback
 * Redirects the user's browser back to the webapp's callback page with query parameters.
 */
const handleRedirect = (req, res) => {
  const clientUrl = resolveClientUrl(req.query.state);
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(req.query)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, value);
    }
  }

  const queryString = searchParams.toString();
  const targetUrl = `${clientUrl}/linkedin/callback${queryString ? `?${queryString}` : ''}`;

  return res.redirect(302, targetUrl);
};

/**
 * Initiate LinkedIn OAuth 2.0 flow.
 * Route: GET /api/v1/linkedin/connect
 */
const connect = asyncHandler(async (req, res) => {
  const { redirectUri, clientUrl } = req.query;
  const targetClientUrl =
    clientUrl ||
    req.headers.origin ||
    req.headers.referer ||
    null;

  const { url, state } = await linkedinService.getAuthorizationUrl(
    req.user._id,
    redirectUri,
    targetClientUrl
  );

  res.status(200).json({
    success: true,
    data: {
      authUrl: url,
      state,
    },
  });
});

/**
 * OAuth callback handler receiving code and state from LinkedIn consent.
 * Route: GET /api/v1/linkedin/callback
 */
const callback = asyncHandler(async (req, res, next) => {
  // If request is from browser navigation (e.g. redirected by OAuth provider directly to this endpoint)
  const isBrowserNavigation =
    req.headers.accept?.includes('text/html') && !req.headers.authorization;

  if (isBrowserNavigation) {
    return handleRedirect(req, res);
  }

  const code = req.query.code || req.body?.code;
  const state = req.query.state || req.body?.state;

  if (!code || !state) {
    return next(
      new AppError('Missing required OAuth code or state parameter in callback.', 400)
    );
  }

  let tokenData;
  try {
    tokenData = await linkedinService.handleCallback(code, state);
  } catch (err) {
    // If token exchange failed, check if this is a duplicate call where user was already connected in the last 60 seconds
    try {
      const stateSecret = process.env.LINKEDIN_STATE_SECRET || getJwtSecret();
      const decoded = jwt.verify(state, stateSecret);
      if (decoded?.userId) {
        const existingUser = await User.findById(decoded.userId);
        if (
          existingUser?.linkedin?.isConnected &&
          existingUser?.linkedin?.connectedAt &&
          Date.now() - new Date(existingUser.linkedin.connectedAt).getTime() < 60000
        ) {
          return res.status(200).json({
            success: true,
            data: {
              message: 'LinkedIn account successfully connected.',
              isConnected: true,
            },
          });
        }
      }
    } catch {
      // Ignore fallback check and proceed to return original error
    }

    return next(err);
  }

  const user = await User.findById(tokenData.userId || req.user?._id);
  if (!user) {
    return next(new AppError('User associated with LinkedIn callback not found.', 404));
  }

  user.linkedin = {
    linkedinUserId: tokenData.linkedinUserId,
    accessToken: tokenData.accessToken,
    refreshToken: tokenData.refreshToken,
    tokenExpiresAt: tokenData.tokenExpiresAt,
    scope: tokenData.scope || 'w_member_social',
    connectedAt: new Date(),
    isConnected: true,
  };

  await user.save();

  res.status(200).json({
    success: true,
    data: {
      message: 'LinkedIn account successfully connected.',
      isConnected: true,
    },
  });
});

/**
 * Disconnect LinkedIn account and revoke/clear credentials.
 * Route: DELETE /api/v1/linkedin/disconnect
 */
const disconnect = asyncHandler(async (req, res) => {
  await linkedinService.disconnect(req.user._id);

  const user = await User.findById(req.user._id);
  if (user) {
    user.linkedin.isConnected = false;
    user.linkedin.accessToken = null;
    user.linkedin.refreshToken = null;
    user.linkedin.tokenExpiresAt = null;
    await user.save();
  }

  res.status(200).json({
    success: true,
    data: {
      message: 'LinkedIn account disconnected successfully.',
      isConnected: false,
    },
  });
});

/**
 * Check LinkedIn connection and token status.
 * Route: GET /api/v1/linkedin/status
 */
const getStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+linkedin.accessToken +linkedin.tokenExpiresAt');
  const linkedin = user?.linkedin || {};
  res.status(200).json({
    success: true,
    data: {
      isConnected: Boolean(linkedin.isConnected),
      connectedAt: linkedin.connectedAt || null,
      tokenExpiresAt: linkedin.tokenExpiresAt || null,
      scope: linkedin.scope || null,
    },
  });
});

module.exports = {
  connect,
  callback,
  disconnect,
  getStatus,
  handleRedirect,
};
