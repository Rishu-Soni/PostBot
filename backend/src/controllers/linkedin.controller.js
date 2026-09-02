import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { encrypt } from '../services/tokenCrypto.js';

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
const LINKEDIN_SCOPE = 'openid profile w_member_social';

const getFrontendUrl = () => {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
};

/**
 * GET /api/linkedin/connect
 * Initiates the LinkedIn OAuth flow. Protected by requireAuth.
 * Generates signed state containing req.userId and redirects to LinkedIn authorization URL.
 */
export const connectLinkedIn = async (req, res) => {
  try {
    const { LINKEDIN_CLIENT_ID, LINKEDIN_REDIRECT_URI, JWT_SECRET } = process.env;

    if (!LINKEDIN_CLIENT_ID || !LINKEDIN_REDIRECT_URI) {
      return res.status(500).json({
        error: 'LinkedIn OAuth is not configured properly in environment variables',
      });
    }

    if (!JWT_SECRET) {
      return res.status(500).json({
        error: 'JWT_SECRET is not configured in environment variables',
      });
    }

    // Sign a tamper-proof state param containing userId with 15 minutes expiration
    const state = jwt.sign(
      {
        userId: req.userId,
        timestamp: Date.now(),
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const queryParams = new URLSearchParams({
      response_type: 'code',
      client_id: LINKEDIN_CLIENT_ID,
      redirect_uri: LINKEDIN_REDIRECT_URI,
      state,
      scope: LINKEDIN_SCOPE,
    });

    const authUrl = `${LINKEDIN_AUTH_URL}?${queryParams.toString()}`;

    // If client requested JSON response or format=json
    if (req.headers.accept?.includes('application/json') || req.query.format === 'json') {
      return res.status(200).json({ url: authUrl });
    }

    // Default: 302 redirect browser
    return res.redirect(authUrl);
  } catch (error) {
    console.error('LinkedIn connect error:', error);
    return res.status(500).json({
      error: 'Failed to initialize LinkedIn authorization',
    });
  }
};

/**
 * GET /api/linkedin/callback
 * LinkedIn OAuth callback handler.
 * Verifies signed state, exchanges code for access token, queries userinfo for memberId,
 * encrypts tokens via AES-256-GCM, saves to User document, and redirects to frontend /settings.
 */
export const linkedinCallback = async (req, res) => {
  const frontendUrl = getFrontendUrl();
  const { code, state, error, error_description } = req.query;

  // Handle OAuth provider error (e.g. user cancelled consent)
  if (error) {
    const errorMsg = error_description || error || 'LinkedIn authorization was cancelled or failed';
    return res.redirect(`${frontendUrl}/settings?error=${encodeURIComponent(errorMsg)}`);
  }

  if (!code || !state) {
    return res.redirect(
      `${frontendUrl}/settings?error=${encodeURIComponent('Missing authorization code or state parameter')}`
    );
  }

  // Verify signed state
  let userId;
  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    if (!decoded || !decoded.userId) {
      throw new Error('Invalid state payload');
    }
    userId = decoded.userId;
  } catch (err) {
    console.error('Invalid or expired LinkedIn OAuth state:', err);
    return res.redirect(
      `${frontendUrl}/settings?error=${encodeURIComponent('Invalid or expired LinkedIn authorization session')}`
    );
  }

  try {
    // Verify user exists in database
    const user = await User.findById(userId);
    if (!user) {
      return res.redirect(`${frontendUrl}/settings?error=${encodeURIComponent('User account not found')}`);
    }

    const { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI } = process.env;

    // Exchange authorization code for tokens
    const tokenRequestBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET,
      redirect_uri: LINKEDIN_REDIRECT_URI,
    });

    const tokenResponse = await fetch(LINKEDIN_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenRequestBody.toString(),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('LinkedIn token exchange failed:', tokenData);
      const errMsg = tokenData.error_description || tokenData.error || 'Failed to obtain access token from LinkedIn';
      return res.redirect(`${frontendUrl}/settings?error=${encodeURIComponent(errMsg)}`);
    }

    // Fetch LinkedIn profile userinfo to extract memberId
    const userinfoResponse = await fetch(LINKEDIN_USERINFO_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userInfo = await userinfoResponse.json();

    if (!userinfoResponse.ok || (!userInfo.sub && !userInfo.id)) {
      console.error('LinkedIn userinfo fetch failed:', userInfo);
      const errMsg = userInfo.message || 'Failed to retrieve member profile from LinkedIn';
      return res.redirect(`${frontendUrl}/settings?error=${encodeURIComponent(errMsg)}`);
    }

    const memberId = userInfo.sub || userInfo.id;

    // Encrypt sensitive tokens using AES-256-GCM
    const accessTokenEnc = encrypt(tokenData.access_token);
    const refreshTokenEnc = tokenData.refresh_token ? encrypt(tokenData.refresh_token) : undefined;

    // Calculate expiry dates
    const accessTokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : undefined;

    const refreshTokenExpiresAt = tokenData.refresh_token_expires_in
      ? new Date(Date.now() + tokenData.refresh_token_expires_in * 1000)
      : undefined;

    // Update user document
    user.linkedin = {
      memberId,
      accessTokenEnc,
      ...(refreshTokenEnc && { refreshTokenEnc }),
      ...(accessTokenExpiresAt && { accessTokenExpiresAt }),
      ...(refreshTokenExpiresAt && { refreshTokenExpiresAt }),
      scope: tokenData.scope || LINKEDIN_SCOPE,
    };

    await user.save();

    // Redirect to frontend settings with success flag
    return res.redirect(`${frontendUrl}/settings?connected=true`);
  } catch (error) {
    console.error('LinkedIn callback processing error:', error);
    return res.redirect(
      `${frontendUrl}/settings?error=${encodeURIComponent('Failed to complete LinkedIn connection')}`
    );
  }
};

/**
 * GET /api/linkedin/status
 * Returns connection status for current authenticated user.
 * Protected by requireAuth. Never returns tokens.
 */
export const getLinkedInStatus = async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    const isConnected = Boolean(user.linkedin && user.linkedin.memberId && user.linkedin.accessTokenEnc);

    return res.status(200).json({
      connected: isConnected,
      memberId: isConnected ? user.linkedin.memberId : null,
      expiresAt: isConnected ? user.linkedin.accessTokenExpiresAt || null : null,
      scope: isConnected ? user.linkedin.scope || null : null,
    });
  } catch (error) {
    console.error('Get LinkedIn status error:', error);
    return res.status(500).json({
      error: 'Failed to retrieve LinkedIn connection status',
    });
  }
};

export default {
  connectLinkedIn,
  linkedinCallback,
  getLinkedInStatus,
};
