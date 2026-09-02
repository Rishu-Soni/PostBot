/**
 * Token refresh tests: ensureFreshLinkedInToken.
 * Uses axios-mock-adapter to mock LinkedIn's token endpoint.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import User from '../models/User.js';
import { encrypt, decrypt } from '../services/tokenCrypto.js';
import {
  ensureFreshLinkedInToken,
  LinkedInReauthRequiredError,
} from '../services/linkedinAuth.js';

const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

let mock;

beforeEach(() => {
  mock = new MockAdapter(axios, { onNoMatch: 'throwException' });
});

afterEach(() => {
  mock.restore();
});

// Helper: create a user with LinkedIn tokens
async function createLinkedInUser(overrides = {}) {
  const user = new User({
    name: 'Token User',
    email: `tokenuser_${Date.now()}@example.com`,
    passwordHash: 'hashed_password',
    linkedin: {
      memberId: 'li_member_refresh',
      accessTokenEnc: encrypt(overrides.accessToken || 'access_token_value'),
      refreshTokenEnc: overrides.refreshToken !== undefined
        ? (overrides.refreshToken ? encrypt(overrides.refreshToken) : undefined)
        : encrypt('refresh_token_value'),
      accessTokenExpiresAt: overrides.accessTokenExpiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      refreshTokenExpiresAt: overrides.refreshTokenExpiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      scope: 'openid profile w_member_social',
    },
  });
  await user.save();
  return user;
}

describe('ensureFreshLinkedInToken', () => {
  it('returns decrypted token as-is when access token is still fresh (>24h remaining)', async () => {
    const user = await createLinkedInUser({
      accessToken: 'my_fresh_access_token',
      accessTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days out
    });

    const token = await ensureFreshLinkedInToken(user._id);

    expect(token).toBe('my_fresh_access_token');
    // No HTTP call should have been made
    expect(mock.history.post.length).toBe(0);
  });

  it('refreshes token when expiring soon (<24h remaining) and saves new tokens', async () => {
    const user = await createLinkedInUser({
      accessToken: 'old_access_token',
      accessTokenExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours — within 24h threshold
    });

    // Mock LinkedIn refresh endpoint
    mock.onPost(LINKEDIN_TOKEN_URL).reply(200, {
      access_token: 'new_refreshed_access_token',
      refresh_token: 'new_refreshed_refresh_token',
      expires_in: 5184000,
      refresh_token_expires_in: 31536000,
      scope: 'openid profile w_member_social',
    });

    const token = await ensureFreshLinkedInToken(user._id);

    expect(token).toBe('new_refreshed_access_token');
    expect(mock.history.post.length).toBe(1);

    // Verify persisted
    const updatedUser = await User.findById(user._id);
    const savedAccessToken = decrypt(updatedUser.linkedin.accessTokenEnc);
    expect(savedAccessToken).toBe('new_refreshed_access_token');
  });

  it('throws LinkedInReauthRequiredError when refresh token is expired', async () => {
    const user = await createLinkedInUser({
      accessTokenExpiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000), // 1h — needs refresh
      refreshTokenExpiresAt: new Date(Date.now() - 1000), // Already expired
    });

    await expect(ensureFreshLinkedInToken(user._id))
      .rejects.toThrow(LinkedInReauthRequiredError);

    await expect(ensureFreshLinkedInToken(user._id))
      .rejects.toThrow(/expired/i);
  });

  it('throws LinkedInReauthRequiredError when no refresh token available', async () => {
    const user = await createLinkedInUser({
      accessTokenExpiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000), // Needs refresh
      refreshToken: null, // No refresh token
    });

    // Clear the refreshTokenEnc
    await User.findByIdAndUpdate(user._id, { 'linkedin.refreshTokenEnc': undefined });

    await expect(ensureFreshLinkedInToken(user._id))
      .rejects.toThrow(LinkedInReauthRequiredError);

    await expect(ensureFreshLinkedInToken(user._id))
      .rejects.toThrow(/no refresh token/i);
  });

  it('throws LinkedInReauthRequiredError when LinkedIn refresh API returns an error', async () => {
    const user = await createLinkedInUser({
      accessTokenExpiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000), // Needs refresh
    });

    mock.onPost(LINKEDIN_TOKEN_URL).reply(400, {
      error: 'invalid_grant',
      error_description: 'The provided authorization grant is invalid or expired',
    });

    await expect(ensureFreshLinkedInToken(user._id))
      .rejects.toThrow(LinkedInReauthRequiredError);

    await expect(ensureFreshLinkedInToken(user._id))
      .rejects.toThrow(/refresh failed/i);
  });

  it('throws LinkedInReauthRequiredError when user is not found', async () => {
    const fakeId = '507f1f77bcf86cd799439011';
    await expect(ensureFreshLinkedInToken(fakeId))
      .rejects.toThrow(LinkedInReauthRequiredError);
  });

  it('throws LinkedInReauthRequiredError when LinkedIn is not connected', async () => {
    const user = new User({
      name: 'No LinkedIn',
      email: `nolinkedin_${Date.now()}@example.com`,
      passwordHash: 'hashed_password',
    });
    await user.save();

    await expect(ensureFreshLinkedInToken(user._id))
      .rejects.toThrow(LinkedInReauthRequiredError);
  });
});
