import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Fallback environment test variables
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_1234567890';
process.env.TOKEN_ENCRYPTION_KEY =
  process.env.TOKEN_ENCRYPTION_KEY || 'test_token_encryption_key_32_bytes_123';
process.env.LINKEDIN_CLIENT_ID = 'test_linkedin_client_id';
process.env.LINKEDIN_CLIENT_SECRET = 'test_linkedin_client_secret';
process.env.LINKEDIN_REDIRECT_URI = 'http://localhost:5000/api/linkedin/callback';
process.env.FRONTEND_URL = 'http://localhost:5173';

import { encrypt, decrypt } from './src/services/tokenCrypto.js';
import {
  connectLinkedIn,
  linkedinCallback,
  getLinkedInStatus,
} from './src/controllers/linkedin.controller.js';
import {
  ensureFreshLinkedInToken,
  LinkedInReauthRequiredError,
} from './src/services/linkedinAuth.js';
import axios from 'axios';
import User from './src/models/User.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runLinkedInUnitTests() {
  console.log('--- STARTING UNIT TESTS FOR LINKEDIN OAUTH & CRYPTO ---');

  // =========================================================================
  // Suite 1: AES-256-GCM Token Encryption & Decryption
  // =========================================================================
  console.log('\n[Suite 1] AES-256-GCM Token Crypto Service');

  // Test 1.1: Encrypt and decrypt a token
  {
    const sampleToken = 'AQV...sample_linkedin_access_token_1234567890';
    const encrypted = encrypt(sampleToken);
    assert(typeof encrypted === 'string', 'Encryption returns a string');
    assert(encrypted.split(':').length === 3, 'Encrypted string has iv:authTag:ciphertext format');

    const decrypted = decrypt(encrypted);
    assert(decrypted === sampleToken, 'Decrypted string matches original plaintext');
  }

  // Test 1.2: Unique IV on each encryption
  {
    const sample = 'my_secret_token';
    const enc1 = encrypt(sample);
    const enc2 = encrypt(sample);
    assert(enc1 !== enc2, 'Subsequent encryptions generate different ciphertexts (random IVs)');
    assert(decrypt(enc1) === sample && decrypt(enc2) === sample, 'Both distinct ciphertexts decrypt to same plaintext');
  }

  // Test 1.3: Tamper detection (GCM authentication tag verification)
  {
    const sample = 'tamper_test_token';
    const encrypted = encrypt(sample);
    const [iv, authTag, ciphertext] = encrypted.split(':');

    // Corrupt ciphertext
    const corruptedCipher = ciphertext.slice(0, -2) + (ciphertext.endsWith('00') ? 'ff' : '00');
    let threwCipher = false;
    try {
      decrypt(`${iv}:${authTag}:${corruptedCipher}`);
    } catch {
      threwCipher = true;
    }
    assert(threwCipher, 'Decryption throws on tampered ciphertext');

    // Corrupt authTag
    const corruptedTag = authTag.slice(0, -2) + (authTag.endsWith('00') ? 'ff' : '00');
    let threwTag = false;
    try {
      decrypt(`${iv}:${corruptedTag}:${ciphertext}`);
    } catch {
      threwTag = true;
    }
    assert(threwTag, 'Decryption throws on tampered authentication tag');
  }

  // Test 1.4: Null and undefined handling
  {
    assert(encrypt(null) === null, 'Encrypt handles null gracefully');
    assert(encrypt(undefined) === undefined, 'Encrypt handles undefined gracefully');
    assert(decrypt(null) === null, 'Decrypt handles null gracefully');
    assert(decrypt(undefined) === undefined, 'Decrypt handles undefined gracefully');
  }

  // =========================================================================
  // Suite 2: Connect Controller (GET /api/linkedin/connect)
  // =========================================================================
  console.log('\n[Suite 2] LinkedIn Connect Controller');

  // Test 2.1: JSON format response
  {
    let statusCode = null;
    let jsonBody = null;
    const req = {
      userId: '64b0f9c2d123456789012345',
      headers: { accept: 'application/json' },
      query: {},
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
        return this;
      },
    };

    await connectLinkedIn(req, res);
    assert(statusCode === 200, 'Returns 200 for JSON request');
    assert(!!jsonBody?.url, 'Returns authorization URL in JSON');

    const authUrl = new URL(jsonBody.url);
    assert(authUrl.origin === 'https://www.linkedin.com', 'URL points to LinkedIn OAuth host');
    assert(authUrl.pathname === '/oauth/v2/authorization', 'URL uses LinkedIn authorization endpoint');
    assert(authUrl.searchParams.get('client_id') === 'test_linkedin_client_id', 'Includes correct client_id');
    assert(authUrl.searchParams.get('scope') === 'openid profile w_member_social', 'Requests openid, profile, w_member_social scopes');
    assert(authUrl.searchParams.get('response_type') === 'code', 'Requests response_type=code');

    const state = authUrl.searchParams.get('state');
    assert(!!state, 'Generates state query param');
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    assert(decoded.userId === '64b0f9c2d123456789012345', 'State JWT securely encodes req.userId');
  }

  // Test 2.2: Redirect response
  {
    let redirectUrl = null;
    const req = {
      userId: '64b0f9c2d123456789012345',
      headers: {},
      query: {},
    };
    const res = {
      redirect(url) {
        redirectUrl = url;
      },
    };

    await connectLinkedIn(req, res);
    assert(!!redirectUrl && redirectUrl.startsWith('https://www.linkedin.com/oauth/v2/authorization'), 'Redirects browser directly when not requesting JSON');
  }

  // =========================================================================
  // Suite 3: Callback Controller (GET /api/linkedin/callback)
  // =========================================================================
  console.log('\n[Suite 3] LinkedIn Callback Controller');

  // Test 3.1: Provider error handling
  {
    let redirectUrl = null;
    const req = {
      query: {
        error: 'user_cancelled_authorize',
        error_description: 'The user cancelled the authorization',
      },
    };
    const res = {
      redirect(url) {
        redirectUrl = url;
      },
    };

    await linkedinCallback(req, res);
    assert(redirectUrl.includes('/settings?error='), 'Redirects to /settings?error when provider sends error');
    assert(redirectUrl.includes('user%20cancelled'), 'Encodes error message in query parameter');
  }

  // Test 3.2: Invalid state handling
  {
    let redirectUrl = null;
    const req = {
      query: {
        code: 'valid_mock_code',
        state: 'invalid_tampered_jwt_state',
      },
    };
    const res = {
      redirect(url) {
        redirectUrl = url;
      },
    };

    await linkedinCallback(req, res);
    assert(redirectUrl.includes('/settings?error='), 'Redirects to /settings?error on invalid state parameter');
  }

  // Test 3.3: Successful OAuth token exchange, encryption & DB update
  {
    const testUserId = '64b0f9c2d123456789012345';
    const validState = jwt.sign({ userId: testUserId }, process.env.JWT_SECRET, { expiresIn: '15m' });

    let savedUser = null;
    const mockUserDoc = {
      _id: testUserId,
      name: 'Jane Doe',
      email: 'jane@example.com',
      linkedin: {},
      save: async function () {
        savedUser = this;
        return this;
      },
    };

    const originalFindById = User.findById;
    User.findById = async (id) => {
      if (id === testUserId) return mockUserDoc;
      return null;
    };

    // Mock global fetch for LinkedIn Token and UserInfo endpoints
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      if (url === 'https://www.linkedin.com/oauth/v2/accessToken') {
        return {
          ok: true,
          json: async () => ({
            access_token: 'mock_access_token_xyz123',
            expires_in: 5184000, // 60 days
            refresh_token: 'mock_refresh_token_abc789',
            refresh_token_expires_in: 31536000, // 1 year
            scope: 'openid profile w_member_social',
          }),
        };
      }
      if (url === 'https://api.linkedin.com/v2/userinfo') {
        return {
          ok: true,
          json: async () => ({
            sub: 'urn:li:person:MockMemberId999',
            name: 'Jane Doe',
            email: 'jane@example.com',
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    };

    let redirectUrl = null;
    const req = {
      query: {
        code: 'valid_auth_code_123',
        state: validState,
      },
    };
    const res = {
      redirect(url) {
        redirectUrl = url;
      },
    };

    await linkedinCallback(req, res);

    assert(redirectUrl === 'http://localhost:5173/settings?connected=true', 'Redirects to /settings?connected=true on successful OAuth connection');
    assert(savedUser !== null, 'User document was updated and saved');
    assert(savedUser.linkedin?.memberId === 'urn:li:person:MockMemberId999', 'Saved memberId extracted from OpenID userinfo sub');
    assert(!!savedUser.linkedin?.accessTokenEnc, 'Saved encrypted access token');
    assert(savedUser.linkedin.accessTokenEnc !== 'mock_access_token_xyz123', 'Access token is NOT plaintext');
    assert(decrypt(savedUser.linkedin.accessTokenEnc) === 'mock_access_token_xyz123', 'Encrypted access token decrypts to original token');
    assert(!!savedUser.linkedin?.refreshTokenEnc, 'Saved encrypted refresh token');
    assert(decrypt(savedUser.linkedin.refreshTokenEnc) === 'mock_refresh_token_abc789', 'Encrypted refresh token decrypts to original token');
    assert(savedUser.linkedin.accessTokenExpiresAt instanceof Date, 'Saved accessTokenExpiresAt timestamp');
    assert(savedUser.linkedin.refreshTokenExpiresAt instanceof Date, 'Saved refreshTokenExpiresAt timestamp');

    // Restore mocks
    User.findById = originalFindById;
    global.fetch = originalFetch;
  }

  // =========================================================================
  // Suite 4: Status Controller (GET /api/linkedin/status)
  // =========================================================================
  console.log('\n[Suite 4] LinkedIn Status Controller');

  // Test 4.1: User not connected
  {
    const originalFindById = User.findById;
    User.findById = async () => ({
      _id: 'user_123',
      name: 'Unconnected User',
      linkedin: {},
    });

    let statusCode = null;
    let jsonBody = null;
    const req = { userId: 'user_123' };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
        return this;
      },
    };

    await getLinkedInStatus(req, res);
    assert(statusCode === 200, 'Returns 200 for status check');
    assert(jsonBody?.connected === false, 'Returns connected: false when no credentials saved');
    assert(jsonBody?.memberId === null, 'Returns memberId: null when not connected');

    User.findById = originalFindById;
  }

  // Test 4.2: User connected (Ensure tokens are NEVER returned)
  {
    const originalFindById = User.findById;
    const expiryDate = new Date(Date.now() + 3600000);
    User.findById = async () => ({
      _id: 'user_456',
      name: 'Connected User',
      linkedin: {
        memberId: 'urn:li:person:User456',
        accessTokenEnc: 'sensitive_encrypted_access_token',
        refreshTokenEnc: 'sensitive_encrypted_refresh_token',
        accessTokenExpiresAt: expiryDate,
        scope: 'openid profile w_member_social',
      },
    });

    let statusCode = null;
    let jsonBody = null;
    const req = { userId: 'user_456' };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
        return this;
      },
    };

    await getLinkedInStatus(req, res);
    assert(statusCode === 200, 'Returns 200 for connected user');
    assert(jsonBody?.connected === true, 'Returns connected: true');
    assert(jsonBody?.memberId === 'urn:li:person:User456', 'Returns memberId');
    assert(jsonBody?.expiresAt === expiryDate, 'Returns token expiration date');
    assert(jsonBody?.accessTokenEnc === undefined, 'NEVER leaks accessTokenEnc in response');
    assert(jsonBody?.refreshTokenEnc === undefined, 'NEVER leaks refreshTokenEnc in response');
    assert(jsonBody?.access_token === undefined, 'NEVER leaks plaintext access_token');
    assert(jsonBody?.refresh_token === undefined, 'NEVER leaks plaintext refresh_token');

    User.findById = originalFindById;
  }

  // =========================================================================
  // Suite 5: LinkedIn Auth Service (ensureFreshLinkedInToken & Refresh)
  // =========================================================================
  console.log('\n[Suite 5] LinkedIn Auth Service (ensureFreshLinkedInToken)');

  // Test 5.1: Token still fresh (> 24 hours) - returns token directly without axios call
  {
    const originalFindById = User.findById;
    const rawAccess = 'token_valid_for_long_time_123';
    const futureAccessExpiry = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const futureRefreshExpiry = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000);

    let saveCalled = false;
    User.findById = async () => ({
      _id: 'user_fresh',
      linkedin: {
        memberId: 'urn:li:person:fresh1',
        accessTokenEnc: encrypt(rawAccess),
        refreshTokenEnc: encrypt('refresh_token_abc'),
        accessTokenExpiresAt: futureAccessExpiry,
        refreshTokenExpiresAt: futureRefreshExpiry,
      },
      save: async () => {
        saveCalled = true;
      },
    });

    const originalAxiosPost = axios.post;
    let axiosCalled = false;
    axios.post = async () => {
      axiosCalled = true;
      return { data: {} };
    };

    const token = await ensureFreshLinkedInToken('user_fresh');
    assert(token === rawAccess, 'Returns decrypted access token when > 24 hours remain');
    assert(axiosCalled === false, 'Does not call LinkedIn API when token is fresh');
    assert(saveCalled === false, 'Does not re-save user when token is fresh');

    User.findById = originalFindById;
    axios.post = originalAxiosPost;
  }

  // Test 5.2: Token expiring soon (<= 24 hours) - successfully refreshes and saves new tokens
  {
    const originalFindById = User.findById;
    const oldAccess = 'expiring_old_access_token';
    const oldRefresh = 'valid_refresh_token_to_use';
    const newAccess = 'refreshed_new_access_token_xyz';
    const newRefresh = 'refreshed_new_refresh_token_xyz';

    const soonAccessExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
    const futureRefreshExpiry = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

    let savedUser = null;
    User.findById = async () => ({
      _id: 'user_refresh_needed',
      linkedin: {
        memberId: 'urn:li:person:refresh1',
        accessTokenEnc: encrypt(oldAccess),
        refreshTokenEnc: encrypt(oldRefresh),
        accessTokenExpiresAt: soonAccessExpiry,
        refreshTokenExpiresAt: futureRefreshExpiry,
      },
      save: async function () {
        savedUser = this;
        return this;
      },
    });

    const originalAxiosPost = axios.post;
    let postedUrl = null;
    let postedBody = null;
    axios.post = async (url, body) => {
      postedUrl = url;
      postedBody = body;
      return {
        data: {
          access_token: newAccess,
          expires_in: 5184000,
          refresh_token: newRefresh,
          refresh_token_expires_in: 31536000,
          scope: 'openid profile w_member_social',
        },
      };
    };

    const token = await ensureFreshLinkedInToken('user_refresh_needed');
    assert(token === newAccess, 'Returns new fresh access token when refreshed');
    assert(postedUrl === 'https://www.linkedin.com/oauth/v2/accessToken', 'Calls LinkedIn token endpoint for refresh');
    assert(postedBody.includes('grant_type=refresh_token'), 'Sends grant_type=refresh_token in request');
    assert(postedBody.includes(encodeURIComponent(oldRefresh)) || postedBody.includes(oldRefresh), 'Sends decrypted refresh token');
    assert(savedUser !== null, 'Saved updated user document to DB');
    assert(decrypt(savedUser.linkedin.accessTokenEnc) === newAccess, 'Persisted newly encrypted access token');
    assert(decrypt(savedUser.linkedin.refreshTokenEnc) === newRefresh, 'Persisted newly encrypted refresh token');
    assert(savedUser.linkedin.accessTokenExpiresAt.getTime() > Date.now() + 50 * 24 * 60 * 60 * 1000, 'Updated access token expiration date');

    User.findById = originalFindById;
    axios.post = originalAxiosPost;
  }

  // Test 5.3: Refresh token expired - throws LinkedInReauthRequiredError
  {
    const originalFindById = User.findById;
    const pastAccessExpiry = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const pastRefreshExpiry = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    User.findById = async () => ({
      _id: 'user_expired_refresh',
      linkedin: {
        memberId: 'urn:li:person:exp1',
        accessTokenEnc: encrypt('expired_acc'),
        refreshTokenEnc: encrypt('expired_ref'),
        accessTokenExpiresAt: pastAccessExpiry,
        refreshTokenExpiresAt: pastRefreshExpiry,
      },
    });

    let threwExpected = false;
    let threwTypedError = false;
    try {
      await ensureFreshLinkedInToken('user_expired_refresh');
    } catch (err) {
      threwExpected = true;
      if (err instanceof LinkedInReauthRequiredError) {
        threwTypedError = true;
      }
    }
    assert(threwExpected && threwTypedError, 'Throws LinkedInReauthRequiredError when refresh token is expired');

    User.findById = originalFindById;
  }

  // Test 5.4: Refresh call rejected by LinkedIn (e.g. 400 invalid_grant) - throws LinkedInReauthRequiredError
  {
    const originalFindById = User.findById;
    const soonAccessExpiry = new Date(Date.now() + 1 * 60 * 60 * 1000);
    const futureRefreshExpiry = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

    User.findById = async () => ({
      _id: 'user_failed_refresh',
      linkedin: {
        memberId: 'urn:li:person:fail1',
        accessTokenEnc: encrypt('expiring_acc'),
        refreshTokenEnc: encrypt('invalid_ref'),
        accessTokenExpiresAt: soonAccessExpiry,
        refreshTokenExpiresAt: futureRefreshExpiry,
      },
    });

    const originalAxiosPost = axios.post;
    axios.post = async () => {
      const err = new Error('Request failed with status code 400');
      err.response = {
        status: 400,
        data: {
          error: 'invalid_grant',
          error_description: 'A valid refresh token is required to refresh an access token',
        },
      };
      throw err;
    };

    let threwTypedError = false;
    let errorMsgContainsDetails = false;
    try {
      await ensureFreshLinkedInToken('user_failed_refresh');
    } catch (err) {
      if (err instanceof LinkedInReauthRequiredError) {
        threwTypedError = true;
      }
      if (err.message?.includes('A valid refresh token is required')) {
        errorMsgContainsDetails = true;
      }
    }
    assert(threwTypedError, 'Throws LinkedInReauthRequiredError on LinkedIn API refresh failure');
    assert(errorMsgContainsDetails, 'LinkedInReauthRequiredError message includes error_description from LinkedIn');

    User.findById = originalFindById;
    axios.post = originalAxiosPost;
  }

  console.log(`\n========================================`);
  console.log(`LINKEDIN TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runLinkedInUnitTests().catch((err) => {
  console.error('LinkedIn test execution error:', err);
  process.exit(1);
});
