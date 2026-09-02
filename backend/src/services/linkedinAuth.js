import axios from 'axios';
import User from '../models/User.js';
import { encrypt, decrypt } from './tokenCrypto.js';

/**
 * ============================================================================
 * LinkedIn OAuth 2.0 Token Lifetimes & Refresh Strategy
 * ============================================================================
 * - Access Token Lifetime: 60 days (5,184,000 seconds) from issue date.
 * - Refresh Token Lifetime: 365 days / 1 year (31,536,000 seconds).
 *
 * Why this service exists:
 * LinkedIn access tokens expire after 60 days. To ensure automated or background
 * publishing jobs never fail mid-flight due to an expired access token, we
 * proactively refresh any access token that is within 24 hours of expiration.
 *
 * Refresh Token Lifespan & Re-Authentication:
 * Refresh tokens are valid for up to 365 days. If the user does not perform any
 * activity that refreshes tokens within 365 days, or if the user explicitly revokes
 * access in their LinkedIn account settings, the refresh token expires/becomes invalid.
 * In such cases, the refresh request fails and we throw `LinkedInReauthRequiredError`
 * so the application can signal that the user needs to reconnect LinkedIn.
 * ============================================================================
 */

const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Custom typed error indicating user re-authentication is required.
 * Allows calling code / jobs to distinguish between transient failures and
 * "user must reconnect LinkedIn account".
 */
export class LinkedInReauthRequiredError extends Error {
  constructor(message = 'LinkedIn re-authentication required') {
    super(message);
    this.name = 'LinkedInReauthRequiredError';
  }
}

/**
 * Ensures the specified user has a fresh, valid LinkedIn access token.
 * - Decrypts the existing access token if valid and > 24 hours away from expiry.
 * - Automatically refreshes the access token via LinkedIn OAuth if expiring soon (<= 24h)
 *   or already expired, encrypts and saves the updated tokens to MongoDB, and returns the fresh token.
 * - Throws `LinkedInReauthRequiredError` if refresh token is expired, missing, or refresh call fails.
 *
 * @param {string} userId MongoDB User ID
 * @returns {Promise<string>} Fresh decrypted LinkedIn access token
 * @throws {LinkedInReauthRequiredError} When re-connection / OAuth consent is required
 */
export const ensureFreshLinkedInToken = async (userId) => {
  if (!userId) {
    throw new LinkedInReauthRequiredError('User ID is required');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new LinkedInReauthRequiredError('User not found');
  }

  if (!user.linkedin || !user.linkedin.accessTokenEnc) {
    throw new LinkedInReauthRequiredError('LinkedIn account is not connected');
  }

  const now = new Date();

  // If refresh token timestamp is present and already expired
  if (user.linkedin.refreshTokenExpiresAt && new Date(user.linkedin.refreshTokenExpiresAt) <= now) {
    throw new LinkedInReauthRequiredError('LinkedIn refresh token has expired. User re-authentication required.');
  }

  const accessTokenExpiresAt = user.linkedin.accessTokenExpiresAt
    ? new Date(user.linkedin.accessTokenExpiresAt)
    : null;

  // 1. If access token is still fresh (> 24 hours remaining), return decrypted token as-is
  if (accessTokenExpiresAt && accessTokenExpiresAt.getTime() - now.getTime() > REFRESH_THRESHOLD_MS) {
    return decrypt(user.linkedin.accessTokenEnc);
  }

  // 2. If expiring soon or expired, refresh token using LinkedIn token endpoint
  if (!user.linkedin.refreshTokenEnc) {
    throw new LinkedInReauthRequiredError('No refresh token available. User re-authentication required.');
  }

  const decryptedRefreshToken = decrypt(user.linkedin.refreshTokenEnc);
  const { LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET } = process.env;

  const requestBody = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: decryptedRefreshToken,
    client_id: LINKEDIN_CLIENT_ID || '',
    client_secret: LINKEDIN_CLIENT_SECRET || '',
  });

  let response;
  try {
    response = await axios.post(LINKEDIN_TOKEN_URL, requestBody.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  } catch (error) {
    const errorMsg =
      error.response?.data?.error_description ||
      error.response?.data?.error ||
      error.message ||
      'LinkedIn token refresh call failed';
    throw new LinkedInReauthRequiredError(`LinkedIn token refresh failed: ${errorMsg}`);
  }

  const tokenData = response?.data;
  if (!tokenData || !tokenData.access_token) {
    throw new LinkedInReauthRequiredError('Invalid response from LinkedIn token refresh endpoint');
  }

  // Encrypt and persist new tokens & expiry dates
  user.linkedin.accessTokenEnc = encrypt(tokenData.access_token);

  if (tokenData.expires_in) {
    user.linkedin.accessTokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
  }

  if (tokenData.refresh_token) {
    user.linkedin.refreshTokenEnc = encrypt(tokenData.refresh_token);
  }

  if (tokenData.refresh_token_expires_in) {
    user.linkedin.refreshTokenExpiresAt = new Date(Date.now() + tokenData.refresh_token_expires_in * 1000);
  }

  if (tokenData.scope) {
    user.linkedin.scope = tokenData.scope;
  }

  await user.save();

  return tokenData.access_token;
};

export default {
  ensureFreshLinkedInToken,
  LinkedInReauthRequiredError,
};
