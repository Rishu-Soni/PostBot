/**
 * LinkedIn Service Stub
 * Handles LinkedIn OAuth 2.0 (w_member_social scope) and profile publishing
 * using LinkedIn's official REST API (/rest/posts).
 */

/**
 * Generates LinkedIn OAuth consent URL with a secure, signed CSRF state payload.
 *
 * @param {string} userId - Current user's MongoDB ObjectId
 * @returns {Promise<{ url: string, state: string }>}
 */
const getAuthorizationUrl = async (userId) => {
  // TODO: implement LinkedIn OAuth URL construction with CSRF state
  throw new Error('Not implemented: linkedinService.getAuthorizationUrl');
};

/**
 * Validates the OAuth callback state, exchanges authorization code for tokens,
 * and retrieves the LinkedIn member ID.
 *
 * @param {string} code - OAuth authorization code
 * @param {string} state - CSRF state token
 * @returns {Promise<{ linkedinUserId: string, accessToken: string, refreshToken: string, tokenExpiresAt: Date, scope: string }>}
 */
const handleCallback = async (code, state) => {
  // TODO: implement token exchange and member profile fetch
  throw new Error('Not implemented: linkedinService.handleCallback');
};

/**
 * Clears LinkedIn credentials and marks isConnected = false.
 *
 * @param {string} userId - User's MongoDB ObjectId
 * @returns {Promise<void>}
 */
const disconnect = async (userId) => {
  // TODO: implement token revocation/clearing
  throw new Error('Not implemented: linkedinService.disconnect');
};

/**
 * Publishes a Post directly to the user's personal LinkedIn profile.
 *
 * @param {Object} user - User document with access token
 * @param {Object} post - Post document to publish
 * @returns {Promise<{ linkedinPostId: string, postedAt: Date }>}
 */
const createPost = async (user, post) => {
  // TODO: implement personal profile share using LinkedIn /rest/posts API
  throw new Error('Not implemented: linkedinService.createPost');
};

/**
 * Refreshes an expired or expiring LinkedIn OAuth access token.
 *
 * @param {Object} user - User document containing refresh token
 * @returns {Promise<{ accessToken: string, refreshToken: string, tokenExpiresAt: Date }>}
 */
const refreshToken = async (user) => {
  // TODO: implement LinkedIn OAuth token refresh flow
  throw new Error('Not implemented: linkedinService.refreshToken');
};

module.exports = {
  getAuthorizationUrl,
  handleCallback,
  disconnect,
  createPost,
  refreshToken,
};
