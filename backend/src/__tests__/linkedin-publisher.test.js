/**
 * LinkedIn publisher tests: formatAuthorUrn, text-only publish, text+image publish,
 * error handling, and reauth propagation.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

// Mock ensureFreshLinkedInToken before importing the publisher
jest.unstable_mockModule('../services/linkedinAuth.js', () => ({
  ensureFreshLinkedInToken: jest.fn(),
  LinkedInReauthRequiredError: class LinkedInReauthRequiredError extends Error {
    constructor(message) {
      super(message);
      this.name = 'LinkedInReauthRequiredError';
    }
  },
}));

// Now import the publisher
const { publishEntry, LinkedInPublishError, formatAuthorUrn } = await import('../services/linkedinPublisher.js');
const { ensureFreshLinkedInToken, LinkedInReauthRequiredError } = await import('../services/linkedinAuth.js');

let mock;

beforeEach(() => {
  mock = new MockAdapter(axios, { onNoMatch: 'throwException' });
  jest.clearAllMocks();
});

afterEach(() => {
  mock.restore();
});

describe('formatAuthorUrn', () => {
  it('formats raw ID into URN', () => {
    expect(formatAuthorUrn('123456')).toBe('urn:li:person:123456');
  });

  it('passes through existing URN unchanged', () => {
    expect(formatAuthorUrn('urn:li:person:abcdef')).toBe('urn:li:person:abcdef');
  });

  it('throws on empty/null input', () => {
    expect(() => formatAuthorUrn('')).toThrow();
    expect(() => formatAuthorUrn(null)).toThrow();
  });
});

describe('publishEntry', () => {
  const userId = { linkedin: { memberId: 'user_abc' } };
  const entry = {
    _id: 'entry_123',
    generatedText: 'Hello LinkedIn world',
  };

  it('throws if generatedText is missing', async () => {
    await expect(publishEntry(userId, { _id: 'e1' }))
      .rejects.toThrow(/must have generatedText/);
  });

  it('propagates LinkedInReauthRequiredError distinctly', async () => {
    // Make the token getter throw a reauth error
    ensureFreshLinkedInToken.mockRejectedValueOnce(new LinkedInReauthRequiredError('Token expired'));

    await expect(publishEntry(userId, entry))
      .rejects.toThrow(LinkedInReauthRequiredError);
  });

  it('publishes text-only post successfully', async () => {
    // 1. Mock token
    ensureFreshLinkedInToken.mockResolvedValueOnce({
      accessToken: 'valid_token',
      memberId: 'li_user_1',
    });

    // 2. Mock LinkedIn UGC post endpoint
    mock.onPost('https://api.linkedin.com/rest/posts').reply(201, {}, {
      'x-restli-id': 'urn:li:share:12345',
    });

    const urn = await publishEntry(userId, entry);

    expect(urn).toBe('urn:li:share:12345');
    // Ensure it was a text post (no image asset in body)
    const postData = JSON.parse(mock.history.post[0].data);
    expect(postData.content).toBeUndefined(); // Simple text posts don't have content attachments
    expect(postData.commentary).toBe('Hello LinkedIn world');
  });

  it('publishes text+image post successfully', async () => {
    const entryWithImage = {
      ...entry,
      generatedImageUrl: 'https://image.pollinations.ai/test.jpg',
    };

    ensureFreshLinkedInToken.mockResolvedValueOnce({
      accessToken: 'valid_token',
      memberId: 'li_user_1',
    });

    // 1. Mock image download
    mock.onGet('https://image.pollinations.ai/test.jpg').reply(200, Buffer.from('image-data'));

    // 2. Mock LinkedIn image upload init
    mock.onPost('https://api.linkedin.com/rest/images?action=initializeUpload').reply(200, {
      value: {
        uploadUrl: 'https://api.linkedin.com/upload-target',
        image: 'urn:li:image:999',
      },
    });

    // 3. Mock LinkedIn image binary upload
    mock.onPut('https://api.linkedin.com/upload-target').reply(200);

    // 4. Mock LinkedIn UGC post endpoint
    mock.onPost('https://api.linkedin.com/rest/posts').reply(201, {}, {
      'x-restli-id': 'urn:li:share:67890',
    });

    const urn = await publishEntry(userId, entryWithImage);

    expect(urn).toBe('urn:li:share:67890');
    // Verify image was attached
    const postData = JSON.parse(mock.history.post[1].data);
    expect(postData.content.media.id).toBe('urn:li:image:999');
  });

  it('throws LinkedInPublishError with status on 401 response', async () => {
    ensureFreshLinkedInToken.mockResolvedValueOnce({
      accessToken: 'bad_token',
      memberId: 'li_user_1',
    });

    mock.onPost('https://api.linkedin.com/rest/posts').reply(401, {
      message: 'Unauthenticated',
    });

    await expect(publishEntry(userId, entry))
      .rejects.toThrow(LinkedInPublishError);

    try {
      await publishEntry(userId, entry);
    } catch (err) {
      expect(err.status).toBe(401);
      expect(err.message).toMatch(/Unauthenticated/);
    }
  });

  it('throws LinkedInPublishError if x-restli-id is missing from success response', async () => {
    ensureFreshLinkedInToken.mockResolvedValueOnce({
      accessToken: 'valid_token',
      memberId: 'li_user_1',
    });

    // Return 201 but omit the URN header
    mock.onPost('https://api.linkedin.com/rest/posts').reply(201, {});

    await expect(publishEntry(userId, entry))
      .rejects.toThrow(/no post URN\/ID was returned/);
  });
});
