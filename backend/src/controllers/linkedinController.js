const { User } = require('../models');
const linkedinService = require('../services/linkedinService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Initiate LinkedIn OAuth 2.0 flow.
 * Route: GET /api/v1/linkedin/connect
 */
const connect = asyncHandler(async (req, res) => {
  const { url, state } = await linkedinService.getAuthorizationUrl(req.user._id);

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
  const { code, state } = req.query;

  if (!code || !state) {
    return next(
      new AppError('Missing required OAuth code or state parameter in callback.', 400)
    );
  }

  const tokenData = await linkedinService.handleCallback(code, state);

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

module.exports = {
  connect,
  callback,
  disconnect,
};
