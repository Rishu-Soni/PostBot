import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Environment setup for testing
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_1234567890';
process.env.TOKEN_ENCRYPTION_KEY =
  process.env.TOKEN_ENCRYPTION_KEY || 'test_token_encryption_key_32_bytes_123';
process.env.LINKEDIN_CLIENT_ID = 'test_linkedin_client_id';
process.env.LINKEDIN_CLIENT_SECRET = 'test_linkedin_client_secret';
process.env.LINKEDIN_REDIRECT_URI = 'http://localhost:5000/api/linkedin/callback';
process.env.LINKEDIN_VERSION = '202501';

import {
  publishEntry,
  uploadImageToLinkedIn,
  formatAuthorUrn,
  LinkedInPublishError,
} from './src/services/linkedinPublisher.js';
import { LinkedInReauthRequiredError } from './src/services/linkedinAuth.js';
import { encrypt } from './src/services/tokenCrypto.js';
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

// In-memory mock database store for User model
const mockUsers = new Map();

// Helper to mock User.findById
const originalFindById = User.findById;

function setupUserFindByIdMock() {
  User.findById = (id) => {
    const idStr = id ? id.toString() : '';
    const userDoc = mockUsers.get(idStr);
    if (!userDoc) return Promise.resolve(null);
    return Promise.resolve({
      ...userDoc,
      _id: idStr,
      save: async function () {
        mockUsers.set(idStr, { ...this });
        return this;
      },
    });
  };
}

function restoreUserFindByIdMock() {
  User.findById = originalFindById;
}

async function runLinkedInPublisherUnitTests() {
  console.log('--- STARTING UNIT TESTS FOR LINKEDIN PUBLISHER SERVICE ---');
  setupUserFindByIdMock();

  // Save original axios methods
  const originalGet = axios.get;
  const originalPost = axios.post;
  const originalPut = axios.put;

  // =========================================================================
  // Suite 1: Helper Functions & Author URN Formatting
  // =========================================================================
  console.log('\n[Suite 1] formatAuthorUrn and Header Helpers');

  {
    // Test 1.1: Formats raw alphanumeric member ID
    const rawId = '7819ab234';
    assert(
      formatAuthorUrn(rawId) === 'urn:li:person:7819ab234',
      'Formats raw member ID into urn:li:person:{id}'
    );

    // Test 1.2: Preserves already formatted person URN
    const personUrn = 'urn:li:person:ABC123xyz';
    assert(
      formatAuthorUrn(personUrn) === 'urn:li:person:ABC123xyz',
      'Preserves person URN that already starts with urn:li:'
    );

    // Test 1.3: Preserves organization URN
    const orgUrn = 'urn:li:organization:998877';
    assert(
      formatAuthorUrn(orgUrn) === 'urn:li:organization:998877',
      'Preserves organization URN'
    );

    // Test 1.4: Handles whitespace trimming
    assert(
      formatAuthorUrn('   member123   ') === 'urn:li:person:member123',
      'Trims surrounding whitespace when formatting member ID'
    );

    // Test 1.5: Throws LinkedInReauthRequiredError on missing member ID
    let threw = false;
    try {
      formatAuthorUrn('');
    } catch (err) {
      threw = err instanceof LinkedInReauthRequiredError;
    }
    assert(threw, 'Throws LinkedInReauthRequiredError when member ID is empty');
  }

  // =========================================================================
  // Suite 2: uploadImageToLinkedIn Image Upload Flow
  // =========================================================================
  console.log('\n[Suite 2] uploadImageToLinkedIn Service Method');

  {
    const sampleImageUrl = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';
    const authorUrn = 'urn:li:person:testMember123';
    const accessToken = 'test_access_token_abc';

    let getCalled = false;
    let postInitCalled = false;
    let putBinaryCalled = false;
    let capturedInitHeaders = null;
    let capturedInitBody = null;
    let capturedPutHeaders = null;
    let capturedPutBody = null;

    axios.get = async (url, config) => {
      if (url === sampleImageUrl) {
        getCalled = true;
        return {
          data: Buffer.from('fake_image_bytes_12345'),
          headers: { 'content-type': 'image/jpeg' },
          status: 200,
        };
      }
      return originalGet(url, config);
    };

    axios.post = async (url, body, config) => {
      if (url.includes('/images?action=initializeUpload')) {
        postInitCalled = true;
        capturedInitHeaders = config?.headers;
        capturedInitBody = body;
        return {
          status: 200,
          data: {
            value: {
              uploadUrl: 'https://api.linkedin.com/mediaUpload/testUploadUrl123',
              image: 'urn:li:image:D4E10AQH_sampleImageUrn',
              uploadUrlExpiresAt: 1700000000,
            },
          },
        };
      }
      return originalPost(url, body, config);
    };

    axios.put = async (url, body, config) => {
      if (url === 'https://api.linkedin.com/mediaUpload/testUploadUrl123') {
        putBinaryCalled = true;
        capturedPutHeaders = config?.headers;
        capturedPutBody = body;
        return { status: 201 };
      }
      return originalPut(url, body, config);
    };

    const resultImageUrn = await uploadImageToLinkedIn(sampleImageUrl, authorUrn, accessToken);

    assert(getCalled, 'Downloads image binary from remote URL');
    assert(postInitCalled, 'Calls LinkedIn POST /rest/images?action=initializeUpload');
    assert(
      capturedInitHeaders?.Authorization === `Bearer ${accessToken}`,
      'Sends Bearer Authorization header in initializeUpload'
    );
    assert(
      capturedInitHeaders?.['LinkedIn-Version'] === '202501',
      'Sends LinkedIn-Version header in initializeUpload'
    );
    assert(
      capturedInitHeaders?.['X-Restli-Protocol-Version'] === '2.0.0',
      'Sends X-Restli-Protocol-Version: 2.0.0 in initializeUpload'
    );
    assert(
      capturedInitBody?.initializeUploadRequest?.owner === authorUrn,
      'Passes authorUrn as initializeUploadRequest.owner'
    );
    assert(putBinaryCalled, 'PUTs binary data to returned uploadUrl');
    assert(
      capturedPutHeaders?.['Content-Type'] === 'application/octet-stream',
      'Sets Content-Type: application/octet-stream on binary PUT'
    );
    assert(
      capturedPutBody instanceof Buffer,
      'PUT body contains raw binary Buffer'
    );
    assert(
      resultImageUrn === 'urn:li:image:D4E10AQH_sampleImageUrn',
      'Returns registered image URN (urn:li:image:...)'
    );
  }

  // Test 2.2: uploadImageToLinkedIn error handling on initializeUpload failure
  {
    axios.get = async () => ({
      data: Buffer.from('image_bytes'),
      headers: {},
      status: 200,
    });

    axios.post = async () => {
      const error = new Error('Request failed with status code 403');
      error.response = {
        status: 403,
        data: { message: 'Not enough permissions to upload image', serviceErrorCode: 100 },
      };
      throw error;
    };

    let caughtError = null;
    try {
      await uploadImageToLinkedIn('https://example.com/pic.jpg', 'urn:li:person:user1', 'tok');
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError instanceof LinkedInPublishError, 'Throws LinkedInPublishError on API failure');
    assert(caughtError?.status === 403, 'Attaches HTTP status 403 to error');
    assert(
      caughtError?.linkedinError?.serviceErrorCode === 100,
      'Attaches raw LinkedIn error body to LinkedInPublishError'
    );
  }

  // =========================================================================
  // Suite 3: publishEntry - Text-Only Post Execution
  // =========================================================================
  console.log('\n[Suite 3] publishEntry - Text-Only Post');

  {
    const userId = '507f1f77bcf86cd799439011';
    const futureExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h from now (fresh)
    const validAccessToken = 'AQV_text_only_valid_access_token_12345';

    mockUsers.set(userId, {
      _id: userId,
      name: 'Test Creator',
      email: 'creator@example.com',
      linkedin: {
        memberId: 'mem_text_only_777',
        accessTokenEnc: encrypt(validAccessToken),
        accessTokenExpiresAt: futureExpiry,
        refreshTokenEnc: encrypt('refresh_token_xyz'),
        refreshTokenExpiresAt: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000),
      },
    });

    const entry = {
      _id: 'entry_text_101',
      topic: 'Day 1: Building a SaaS with AI',
      generatedText: '🚀 Day 1 of my #BuildingInPublic journey! Focused on backend architecture today. What tools do you use? #indiehacker #nodejs',
      status: 'generated',
    };

    let postCalled = false;
    let capturedHeaders = null;
    let capturedBody = null;

    axios.post = async (url, body, config) => {
      if (url.includes('/rest/posts')) {
        postCalled = true;
        capturedHeaders = config?.headers;
        capturedBody = body;
        return {
          status: 201,
          headers: {
            'x-restli-id': 'urn:li:share:7123456789012345678',
          },
          data: {},
        };
      }
      return originalPost(url, body, config);
    };

    const postUrn = await publishEntry(userId, entry);

    assert(postCalled, 'Calls LinkedIn POST /rest/posts');
    assert(
      capturedHeaders?.Authorization === `Bearer ${validAccessToken}`,
      'Sends decrypted fresh access token in Authorization header'
    );
    assert(
      capturedHeaders?.['LinkedIn-Version'] === '202501',
      'Sends LinkedIn-Version header in POST /rest/posts'
    );
    assert(
      capturedHeaders?.['X-Restli-Protocol-Version'] === '2.0.0',
      'Sends X-Restli-Protocol-Version: 2.0.0'
    );
    assert(
      capturedHeaders?.['Content-Type'] === 'application/json',
      'Sends Content-Type: application/json'
    );
    assert(
      capturedBody?.author === 'urn:li:person:mem_text_only_777',
      'Author URN is correctly formatted with user memberId'
    );
    assert(
      capturedBody?.commentary === entry.generatedText,
      'Post commentary matches entry.generatedText'
    );
    assert(
      capturedBody?.visibility === 'PUBLIC',
      'Post visibility is PUBLIC'
    );
    assert(
      capturedBody?.distribution?.feedDistribution === 'MAIN_FEED',
      'Distribution feed is MAIN_FEED'
    );
    assert(
      capturedBody?.content === undefined,
      'Text-only post does NOT include content.media'
    );
    assert(
      postUrn === 'urn:li:share:7123456789012345678',
      'Returns created post URN extracted from x-restli-id header'
    );
    assert(
      entry.status === 'posted',
      'Updates entry status to "posted"'
    );
    assert(
      entry.linkedinPostUrn === 'urn:li:share:7123456789012345678',
      'Sets entry.linkedinPostUrn to returned post URN'
    );
    assert(
      entry.postedAt instanceof Date,
      'Sets entry.postedAt timestamp'
    );
  }

  // =========================================================================
  // Suite 4: publishEntry - Text + Image Post Execution
  // =========================================================================
  console.log('\n[Suite 4] publishEntry - Text + Image Post');

  {
    const userId = '507f1f77bcf86cd799439022';
    const futureExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const validAccessToken = 'AQV_image_post_token_99999';

    mockUsers.set(userId, {
      _id: userId,
      name: 'Image Creator',
      email: 'image_creator@example.com',
      linkedin: {
        memberId: 'urn:li:person:mem_image_888',
        accessTokenEnc: encrypt(validAccessToken),
        accessTokenExpiresAt: futureExpiry,
        refreshTokenEnc: encrypt('refresh_token_img'),
        refreshTokenExpiresAt: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000),
      },
    });

    const entry = {
      _id: 'entry_img_202',
      topic: 'Day 2: AI Code Generation in Action',
      generatedText: 'Day 2 update! Here is the architecture diagram for our queue system. #buildinpublic',
      generatedImageUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c',
      status: 'generated',
    };

    let downloadCalled = false;
    let initUploadCalled = false;
    let putBinaryCalled = false;
    let postCreatedCalled = false;
    let capturedPostBody = null;

    axios.get = async (url) => {
      if (url === entry.generatedImageUrl) {
        downloadCalled = true;
        return {
          data: Buffer.from('sample_png_bytes'),
          headers: { 'content-type': 'image/png' },
          status: 200,
        };
      }
      return originalGet(url);
    };

    axios.post = async (url, body, config) => {
      if (url.includes('/images?action=initializeUpload')) {
        initUploadCalled = true;
        return {
          status: 200,
          data: {
            value: {
              uploadUrl: 'https://api.linkedin.com/mediaUpload/uniqueUploadUrl',
              image: 'urn:li:image:C4D10AQG_FullStackPostImage',
            },
          },
        };
      }
      if (url.includes('/rest/posts')) {
        postCreatedCalled = true;
        capturedPostBody = body;
        return {
          status: 201,
          headers: {
            'x-restli-id': 'urn:li:ugcPost:9876543210987654321',
          },
          data: {},
        };
      }
      return originalPost(url, body, config);
    };

    axios.put = async (url) => {
      if (url === 'https://api.linkedin.com/mediaUpload/uniqueUploadUrl') {
        putBinaryCalled = true;
        return { status: 201 };
      }
      return originalPut(url);
    };

    const postUrn = await publishEntry(userId, entry);

    assert(downloadCalled, 'Downloads entry.generatedImageUrl');
    assert(initUploadCalled, 'Registers upload with LinkedIn Images API');
    assert(putBinaryCalled, 'PUTs image binary to uploadUrl');
    assert(postCreatedCalled, 'Creates post on LinkedIn POST /rest/posts');
    assert(
      capturedPostBody?.content?.media?.id === 'urn:li:image:C4D10AQG_FullStackPostImage',
      'Attaches uploaded image URN inside content.media.id'
    );
    assert(
      capturedPostBody?.content?.media?.altText === entry.topic,
      'Sets media altText from entry.topic'
    );
    assert(
      postUrn === 'urn:li:ugcPost:9876543210987654321',
      'Returns created post URN for image post'
    );
    assert(
      entry.status === 'posted',
      'Updates entry status to "posted"'
    );
  }

  // =========================================================================
  // Suite 5: Error Propagation and Re-authentication Handling
  // =========================================================================
  console.log('\n[Suite 5] Error Handling & Re-authentication Propagation');

  // Test 5.1: Missing User ID
  {
    let threw = false;
    try {
      await publishEntry(null, { generatedText: 'Hello' });
    } catch (err) {
      threw = err instanceof LinkedInReauthRequiredError;
    }
    assert(threw, 'Throws LinkedInReauthRequiredError when userId is null/undefined');
  }

  // Test 5.2: Unconnected LinkedIn user propagates LinkedInReauthRequiredError
  {
    const userId = '507f1f77bcf86cd799439033';
    mockUsers.set(userId, {
      _id: userId,
      name: 'Unconnected User',
      email: 'no_linkedin@example.com',
      linkedin: {},
    });

    let threw = false;
    try {
      await publishEntry(userId, { generatedText: 'Testing no auth' });
    } catch (err) {
      threw = err instanceof LinkedInReauthRequiredError;
    }
    assert(threw, 'Propagates LinkedInReauthRequiredError when user has not connected LinkedIn');
  }

  // Test 5.3: Expired refresh token propagates LinkedInReauthRequiredError
  {
    const userId = '507f1f77bcf86cd799439044';
    mockUsers.set(userId, {
      _id: userId,
      name: 'Expired User',
      email: 'expired@example.com',
      linkedin: {
        memberId: 'mem_expired_999',
        accessTokenEnc: encrypt('expired_token'),
        accessTokenExpiresAt: new Date(Date.now() - 1000), // expired
        refreshTokenEnc: encrypt('expired_refresh'),
        refreshTokenExpiresAt: new Date(Date.now() - 1000), // expired refresh token
      },
    });

    let threw = false;
    try {
      await publishEntry(userId, { generatedText: 'Testing expired token' });
    } catch (err) {
      threw = err instanceof LinkedInReauthRequiredError;
    }
    assert(threw, 'Propagates LinkedInReauthRequiredError distinctly when refresh token is expired');
  }

  // Test 5.4: Missing generatedText throws LinkedInPublishError
  {
    const userId = '507f1f77bcf86cd799439011';
    let caught = null;
    try {
      await publishEntry(userId, { generatedText: '' });
    } catch (err) {
      caught = err;
    }
    assert(caught instanceof LinkedInPublishError, 'Throws LinkedInPublishError when generatedText is empty');
  }

  // Test 5.5: LinkedIn POST /rest/posts API failure attaches response body
  {
    const userId = '507f1f77bcf86cd799439011';
    axios.post = async (url) => {
      if (url.includes('/rest/posts')) {
        const error = new Error('Request failed with status code 422');
        error.response = {
          status: 422,
          data: {
            message: 'Duplicate commentary detected or commentary is too long',
            serviceErrorCode: 100,
          },
        };
        throw error;
      }
      return originalPost(url);
    };

    let caught = null;
    try {
      await publishEntry(userId, {
        topic: 'Duplicate post',
        generatedText: 'Duplicate content',
      });
    } catch (err) {
      caught = err;
    }

    assert(caught instanceof LinkedInPublishError, 'Throws LinkedInPublishError on post creation failure');
    assert(caught?.status === 422, 'Attaches HTTP status 422');
    assert(
      caught?.linkedinError?.serviceErrorCode === 100,
      'Attaches LinkedIn response body (serviceErrorCode 100) for logging'
    );
    assert(
      caught?.message.includes('Duplicate commentary'),
      'Error message includes LinkedIn error message summary'
    );
  }

  // Restore mocks
  axios.get = originalGet;
  axios.post = originalPost;
  axios.put = originalPut;
  restoreUserFindByIdMock();

  console.log('\n======================================================');
  console.log(`LINKEDIN PUBLISHER TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runLinkedInPublisherUnitTests().catch((err) => {
  console.error('Test execution failed with unexpected error:', err);
  process.exit(1);
});
