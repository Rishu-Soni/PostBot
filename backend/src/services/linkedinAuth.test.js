import { jest } from '@jest/globals';
import axios from 'axios';
import { ensureFreshLinkedInToken, LinkedInReauthRequiredError } from './linkedinAuth.js';
import User from '../models/User.js';
import { encrypt, decrypt } from './tokenCrypto.js';

// Setup environment variables required for tests
process.env.TOKEN_ENCRYPTION_KEY =
  process.env.TOKEN_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.LINKEDIN_CLIENT_ID = 'test_client_id_123';
process.env.LINKEDIN_CLIENT_SECRET = 'test_client_secret_456';

describe('LinkedIn Auth Service - ensureFreshLinkedInToken', () => {
  const mockUserId = '64b0f9c2d123456789012345';
  let axiosPostSpy;
  let findByIdSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    axiosPostSpy = jest.spyOn(axios, 'post');
  });

  afterEach(() => {
    if (axiosPostSpy) axiosPostSpy.mockRestore();
    if (findByIdSpy) findByIdSpy.mockRestore();
  });

  test('token still fresh: returns decrypted token as-is without calling refresh endpoint when expiry > 24 hours away', async () => {
    const rawAccessToken = 'valid_long_lived_access_token_abc';
    const rawRefreshToken = 'valid_refresh_token_xyz';
    const encryptedAccessToken = encrypt(rawAccessToken);
    const encryptedRefreshToken = encrypt(rawRefreshToken);

    // 5 days into future (> 24 hours)
    const futureAccessExpiry = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const futureRefreshExpiry = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000);

    const mockUser = {
      _id: mockUserId,
      name: 'Test User',
      linkedin: {
        memberId: 'urn:li:person:12345',
        accessTokenEnc: encryptedAccessToken,
        refreshTokenEnc: encryptedRefreshToken,
        accessTokenExpiresAt: futureAccessExpiry,
        refreshTokenExpiresAt: futureRefreshExpiry,
        scope: 'openid profile w_member_social',
      },
      save: jest.fn().mockResolvedValue(true),
    };

    findByIdSpy = jest.spyOn(User, 'findById').mockResolvedValue(mockUser);

    const token = await ensureFreshLinkedInToken(mockUserId);

    // Verify token was returned directly
    expect(token).toBe(rawAccessToken);
    // Verify axios.post was NOT called
    expect(axiosPostSpy).not.toHaveBeenCalled();
    // Verify user document was not unnecessarily saved
    expect(mockUser.save).not.toHaveBeenCalled();
  });

  test('token expiring soon: refreshes token via LinkedIn API, encrypts & saves new token, and returns fresh token', async () => {
    const oldAccessToken = 'expiring_old_access_token_123';
    const oldRefreshToken = 'valid_refresh_token_456';
    const newAccessToken = 'fresh_new_access_token_789';
    const newRefreshToken = 'fresh_new_refresh_token_012';

    const encryptedOldAccessToken = encrypt(oldAccessToken);
    const encryptedOldRefreshToken = encrypt(oldRefreshToken);

    // Expiring in 2 hours (<= 24 hours)
    const soonAccessExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const futureRefreshExpiry = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

    const mockUser = {
      _id: mockUserId,
      name: 'Test User',
      linkedin: {
        memberId: 'urn:li:person:12345',
        accessTokenEnc: encryptedOldAccessToken,
        refreshTokenEnc: encryptedOldRefreshToken,
        accessTokenExpiresAt: soonAccessExpiry,
        refreshTokenExpiresAt: futureRefreshExpiry,
        scope: 'openid profile w_member_social',
      },
      save: jest.fn().mockImplementation(async function () {
        return this;
      }),
    };

    findByIdSpy = jest.spyOn(User, 'findById').mockResolvedValue(mockUser);

    // Mock LinkedIn OAuth refresh token response
    axiosPostSpy.mockResolvedValue({
      status: 200,
      data: {
        access_token: newAccessToken,
        expires_in: 5184000, // 60 days
        refresh_token: newRefreshToken,
        refresh_token_expires_in: 31536000, // 365 days
        scope: 'openid profile w_member_social',
      },
    });

    const token = await ensureFreshLinkedInToken(mockUserId);

    // Assert returned token is the new plaintext token
    expect(token).toBe(newAccessToken);

    // Assert axios was called with correct parameters
    expect(axiosPostSpy).toHaveBeenCalledTimes(1);
    expect(axiosPostSpy).toHaveBeenCalledWith(
      'https://www.linkedin.com/oauth/v2/accessToken',
      expect.stringContaining('grant_type=refresh_token'),
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })
    );

    // Assert user doc was updated and saved
    expect(mockUser.save).toHaveBeenCalledTimes(1);
    expect(mockUser.linkedin.accessTokenEnc).not.toBe(newAccessToken);
    expect(decrypt(mockUser.linkedin.accessTokenEnc)).toBe(newAccessToken);
    expect(decrypt(mockUser.linkedin.refreshTokenEnc)).toBe(newRefreshToken);
    expect(mockUser.linkedin.accessTokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 50 * 24 * 60 * 60 * 1000);
  });

  test('refresh token expired: throws LinkedInReauthRequiredError when refreshTokenExpiresAt is in the past', async () => {
    const expiredAccessToken = encrypt('expired_access_token');
    const expiredRefreshToken = encrypt('expired_refresh_token');

    // Both expired
    const pastAccessExpiry = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const pastRefreshExpiry = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

    const mockUser = {
      _id: mockUserId,
      name: 'Test User',
      linkedin: {
        memberId: 'urn:li:person:12345',
        accessTokenEnc: expiredAccessToken,
        refreshTokenEnc: expiredRefreshToken,
        accessTokenExpiresAt: pastAccessExpiry,
        refreshTokenExpiresAt: pastRefreshExpiry,
      },
      save: jest.fn(),
    };

    findByIdSpy = jest.spyOn(User, 'findById').mockResolvedValue(mockUser);

    await expect(ensureFreshLinkedInToken(mockUserId)).rejects.toThrow(LinkedInReauthRequiredError);
    await expect(ensureFreshLinkedInToken(mockUserId)).rejects.toThrow(/refresh token has expired/i);
    expect(axiosPostSpy).not.toHaveBeenCalled();
    expect(mockUser.save).not.toHaveBeenCalled();
  });

  test('refresh call fails: throws LinkedInReauthRequiredError when LinkedIn returns error (e.g. invalid_grant / 400)', async () => {
    const expiringAccessToken = encrypt('expiring_access_token');
    const validRefreshToken = encrypt('revoked_or_invalid_refresh_token');

    const soonAccessExpiry = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour
    const futureRefreshExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    const mockUser = {
      _id: mockUserId,
      name: 'Test User',
      linkedin: {
        memberId: 'urn:li:person:12345',
        accessTokenEnc: expiringAccessToken,
        refreshTokenEnc: validRefreshToken,
        accessTokenExpiresAt: soonAccessExpiry,
        refreshTokenExpiresAt: futureRefreshExpiry,
      },
      save: jest.fn(),
    };

    findByIdSpy = jest.spyOn(User, 'findById').mockResolvedValue(mockUser);

    // Mock LinkedIn rejection (e.g. user revoked permissions)
    const errorResponse = {
      response: {
        status: 400,
        data: {
          error: 'invalid_grant',
          error_description: 'The refresh token is invalid or expired',
        },
      },
    };
    axiosPostSpy.mockRejectedValue(errorResponse);

    await expect(ensureFreshLinkedInToken(mockUserId)).rejects.toThrow(LinkedInReauthRequiredError);
    await expect(ensureFreshLinkedInToken(mockUserId)).rejects.toThrow(/The refresh token is invalid or expired/i);
    expect(mockUser.save).not.toHaveBeenCalled();
  });

  test('missing or unconnected LinkedIn credentials: throws LinkedInReauthRequiredError', async () => {
    // Case A: User not found
    findByIdSpy = jest.spyOn(User, 'findById').mockResolvedValue(null);
    await expect(ensureFreshLinkedInToken(mockUserId)).rejects.toThrow(LinkedInReauthRequiredError);

    // Case B: User has no linkedin object
    findByIdSpy.mockResolvedValue({ _id: mockUserId, linkedin: {} });
    await expect(ensureFreshLinkedInToken(mockUserId)).rejects.toThrow(LinkedInReauthRequiredError);

    // Case C: Missing userId argument
    await expect(ensureFreshLinkedInToken(null)).rejects.toThrow(LinkedInReauthRequiredError);
  });
});
