/**
 * LinkedIn OAuth tests: /connect redirect, /callback token exchange, status endpoint.
 * Mocks LinkedIn's token and userinfo endpoints entirely via global.fetch stubs.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import supertest from 'supertest';
import jwtLib from 'jsonwebtoken';
import app from '../app.js';
import User from '../models/User.js';

const request = supertest(app);

// Helper: create a user and get a valid JWT
async function createUserAndToken(overrides = {}) {
  const signupRes = await request.post('/api/auth/signup').send({
    name: overrides.name || 'OAuth User',
    email: overrides.email || `oauth_${Date.now()}@example.com`,
    password: 'password123',
  });
  return { token: signupRes.body.token, user: signupRes.body.user };
}

describe('LinkedIn OAuth — GET /api/linkedin/connect', () => {
  let token;

  beforeAll(async () => {
    const result = await createUserAndToken({ email: 'connect@example.com' });
    token = result.token;
  });

  it('returns JSON with correct authorize URL when Accept: application/json', async () => {
    const res = await request
      .get('/api/linkedin/connect')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.url).toBeDefined();

    const url = new URL(res.body.url);
    expect(url.hostname).toBe('www.linkedin.com');
    expect(url.pathname).toBe('/oauth/v2/authorization');
    expect(url.searchParams.get('client_id')).toBe(process.env.LINKEDIN_CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(process.env.LINKEDIN_REDIRECT_URI);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toContain('w_member_social');

    // State should be a valid JWT
    const state = url.searchParams.get('state');
    const decoded = jwtLib.verify(state, process.env.JWT_SECRET);
    expect(decoded.userId).toBeDefined();
  });

  it('rejects connect without authentication', async () => {
    const res = await request.get('/api/linkedin/connect');
    expect(res.status).toBe(401);
  });
});

describe('LinkedIn OAuth — GET /api/linkedin/callback', () => {
  let userId;
  let validState;
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Reset fetch mock before each test
    global.fetch = originalFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  beforeAll(async () => {
    const result = await createUserAndToken({ email: 'callback@example.com' });
    userId = result.user._id;
    // Create a valid signed state
    validState = jwtLib.sign(
      { userId, timestamp: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
  });

  it('exchanges auth code for tokens, saves encrypted, and redirects', async () => {
    // Mock fetch for token exchange AND userinfo
    global.fetch = jest.fn((url, options) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      // Token exchange endpoint
      if (urlStr.includes('/oauth/v2/accessToken')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'mock_access_token_abc123',
            refresh_token: 'mock_refresh_token_xyz789',
            expires_in: 5184000, // 60 days
            refresh_token_expires_in: 31536000, // 365 days
            scope: 'openid profile w_member_social',
          }),
        });
      }

      // Userinfo endpoint
      if (urlStr.includes('/v2/userinfo')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            sub: 'li_member_12345',
            name: 'Test LinkedIn User',
          }),
        });
      }

      return Promise.reject(new Error(`Unmocked fetch URL: ${urlStr}`));
    });

    const res = await request
      .get('/api/linkedin/callback')
      .query({ code: 'mock_auth_code', state: validState });

    // Should redirect to frontend /settings?connected=true
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/settings?connected=true');

    // Verify user document was updated with encrypted tokens
    const updatedUser = await User.findById(userId);
    expect(updatedUser.linkedin).toBeDefined();
    expect(updatedUser.linkedin.memberId).toBe('li_member_12345');
    expect(updatedUser.linkedin.accessTokenEnc).toBeDefined();
    expect(updatedUser.linkedin.accessTokenEnc).not.toBe('mock_access_token_abc123'); // Must be encrypted
    expect(updatedUser.linkedin.refreshTokenEnc).toBeDefined();
    expect(updatedUser.linkedin.accessTokenExpiresAt).toBeDefined();
  });

  it('redirects with error when code is missing', async () => {
    const res = await request
      .get('/api/linkedin/callback')
      .query({ state: validState });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=');
    expect(res.headers.location).toContain('Missing');
  });

  it('redirects with error when state is missing', async () => {
    const res = await request
      .get('/api/linkedin/callback')
      .query({ code: 'some_code' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=');
  });

  it('redirects with error when state JWT is expired/invalid', async () => {
    const expiredState = jwtLib.sign(
      { userId, timestamp: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: '0s' }
    );
    // Wait for token to expire
    await new Promise((r) => setTimeout(r, 50));

    const res = await request
      .get('/api/linkedin/callback')
      .query({ code: 'some_code', state: expiredState });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=');
    expect(decodeURIComponent(res.headers.location)).toMatch(/invalid|expired/i);
  });

  it('redirects with error when LinkedIn token exchange fails', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({
          error: 'invalid_grant',
          error_description: 'Authorization code expired',
        }),
      })
    );

    const freshState = jwtLib.sign(
      { userId, timestamp: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const res = await request
      .get('/api/linkedin/callback')
      .query({ code: 'bad_code', state: freshState });

    expect(res.status).toBe(302);
    expect(decodeURIComponent(res.headers.location)).toMatch(/expired|failed/i);
  });

  it('redirects with error when LinkedIn returns OAuth error param', async () => {
    const res = await request
      .get('/api/linkedin/callback')
      .query({ error: 'user_cancelled_authorize', error_description: 'User cancelled' });

    expect(res.status).toBe(302);
    expect(decodeURIComponent(res.headers.location)).toContain('User cancelled');
  });
});

describe('LinkedIn OAuth — GET /api/linkedin/status', () => {
  it('returns connected: true for user with LinkedIn tokens', async () => {
    const { token, user } = await createUserAndToken({ email: 'statusconn@example.com' });

    // Manually set LinkedIn fields on the user
    const { encrypt } = await import('../services/tokenCrypto.js');
    await User.findByIdAndUpdate(user._id, {
      linkedin: {
        memberId: 'li_member_999',
        accessTokenEnc: encrypt('fake_access_token'),
        refreshTokenEnc: encrypt('fake_refresh_token'),
        accessTokenExpiresAt: new Date(Date.now() + 86400000),
        scope: 'openid profile w_member_social',
      },
    });

    const res = await request
      .get('/api/linkedin/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.memberId).toBe('li_member_999');
    // Must not leak tokens
    expect(res.body.accessTokenEnc).toBeUndefined();
    expect(res.body.refreshTokenEnc).toBeUndefined();
  });

  it('returns connected: false for user without LinkedIn tokens', async () => {
    const { token } = await createUserAndToken({ email: 'statusdisconn@example.com' });

    const res = await request
      .get('/api/linkedin/status')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
    expect(res.body.memberId).toBeNull();
  });
});
