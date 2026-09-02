import axios from 'axios';
import User from '../models/User.js';
import {
  ensureFreshLinkedInToken,
  LinkedInReauthRequiredError,
} from './linkedinAuth.js';

const LINKEDIN_API_BASE = 'https://api.linkedin.com/rest';
const DEFAULT_LINKEDIN_VERSION = '202501';
const RESTLI_PROTOCOL_VERSION = '2.0.0';

/**
 * Custom typed error indicating a LinkedIn API publishing or upload failure.
 * Attaches the raw LinkedIn error body and HTTP status for observability and logging.
 */
export class LinkedInPublishError extends Error {
  constructor(message, linkedinError = null, status = null) {
    super(message);
    this.name = 'LinkedInPublishError';
    this.linkedinError = linkedinError;
    this.status = status;
  }
}

/**
 * Helper to construct standard LinkedIn REST API headers.
 *
 * @param {string} accessToken Decrypted OAuth access token
 * @returns {Object} Headers object
 */
const getLinkedInHeaders = (accessToken) => {
  const version = process.env.LINKEDIN_VERSION || DEFAULT_LINKEDIN_VERSION;
  return {
    Authorization: `Bearer ${accessToken}`,
    'LinkedIn-Version': version,
    'X-Restli-Protocol-Version': RESTLI_PROTOCOL_VERSION,
    'Content-Type': 'application/json',
  };
};

/**
 * Helper to format author member URN.
 *
 * @param {string} memberId Raw member ID or URN
 * @returns {string} Fully qualified URN (e.g. urn:li:person:12345)
 */
export const formatAuthorUrn = (memberId) => {
  if (!memberId) {
    throw new LinkedInReauthRequiredError('LinkedIn member ID is missing');
  }
  const cleanId = String(memberId).trim();
  if (cleanId.startsWith('urn:li:')) {
    return cleanId;
  }
  return `urn:li:person:${cleanId}`;
};

/**
 * Downloads image from remote URL, registers upload with LinkedIn Images API,
 * uploads binary payload, and returns the registered image URN.
 *
 * @param {string} imageUrl Remote URL of the image
 * @param {string} authorUrn LinkedIn member URN
 * @param {string} accessToken Fresh LinkedIn OAuth access token
 * @returns {Promise<string>} Registered image URN (e.g. urn:li:image:C56...)
 */
export const uploadImageToLinkedIn = async (imageUrl, authorUrn, accessToken) => {
  if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
    throw new LinkedInPublishError('Image URL is required for LinkedIn image upload');
  }

  const cleanImageUrl = imageUrl.trim();

  // 1. Download image binary
  let imageBuffer;
  try {
    const imageRes = await axios.get(cleanImageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });
    imageBuffer = Buffer.from(imageRes.data);
  } catch (err) {
    const status = err.response?.status;
    const errBody = err.response?.data;
    throw new LinkedInPublishError(
      `Failed to download image from ${cleanImageUrl}: ${err.message}`,
      errBody,
      status
    );
  }

  // 2. Initialize image upload with LinkedIn Images API
  let initResponse;
  try {
    initResponse = await axios.post(
      `${LINKEDIN_API_BASE}/images?action=initializeUpload`,
      {
        initializeUploadRequest: {
          owner: authorUrn,
        },
      },
      {
        headers: getLinkedInHeaders(accessToken),
        timeout: 20000,
      }
    );
  } catch (err) {
    const status = err.response?.status;
    const linkedinError = err.response?.data || err.message;
    const errSummary = typeof linkedinError === 'object' ? JSON.stringify(linkedinError) : linkedinError;
    throw new LinkedInPublishError(
      `LinkedIn initializeUpload failed (${status || 'UNKNOWN'}): ${errSummary}`,
      err.response?.data,
      status
    );
  }

  const uploadUrl = initResponse.data?.value?.uploadUrl || initResponse.data?.uploadUrl;
  const imageUrn = initResponse.data?.value?.image || initResponse.data?.image;

  if (!uploadUrl || !imageUrn) {
    throw new LinkedInPublishError(
      'Invalid response from LinkedIn initializeUpload: missing uploadUrl or image URN',
      initResponse.data
    );
  }

  // 3. Upload binary file to the provided uploadUrl via PUT
  try {
    await axios.put(uploadUrl, imageBuffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 60000,
    });
  } catch (err) {
    const status = err.response?.status;
    const linkedinError = err.response?.data || err.message;
    const errSummary = typeof linkedinError === 'object' ? JSON.stringify(linkedinError) : linkedinError;
    throw new LinkedInPublishError(
      `LinkedIn image binary upload PUT failed (${status || 'UNKNOWN'}): ${errSummary}`,
      err.response?.data,
      status
    );
  }

  return imageUrn;
};

/**
 * Publishes a DailyEntry to LinkedIn on behalf of the user.
 *
 * 1. Calls `ensureFreshLinkedInToken(userId)`; propagates `LinkedInReauthRequiredError`
 *    distinctly so callers can notify the user to reconnect.
 * 2. If `entry.generatedImageUrl` exists: downloads the image, calls LinkedIn
 *    POST /rest/images?action=initializeUpload, PUTs binary to uploadUrl, and captures image URN.
 * 3. Calls POST /rest/posts with LinkedIn-Version and X-Restli-Protocol-Version: 2.0.0,
 *    body containing author, commentary: entry.generatedText, visibility: PUBLIC, and media if present.
 * 4. On success, returns created post URN/ID. On failure, throws LinkedInPublishError with error body attached.
 *
 * @param {string|Object} userId MongoDB user ID or user document
 * @param {Object} entry DailyEntry document or plain object
 * @returns {Promise<string>} LinkedIn post URN (e.g. urn:li:share:123456789)
 * @throws {LinkedInReauthRequiredError} If LinkedIn re-authentication is required
 * @throws {LinkedInPublishError} If LinkedIn API publishing/upload fails
 */
export const publishEntry = async (userId, entry) => {
  if (!userId) {
    throw new LinkedInReauthRequiredError('User ID is required to publish entry');
  }

  if (!entry) {
    throw new LinkedInPublishError('DailyEntry object is required to publish');
  }

  if (!entry.generatedText || typeof entry.generatedText !== 'string' || !entry.generatedText.trim()) {
    throw new LinkedInPublishError('DailyEntry must have generatedText to publish to LinkedIn');
  }

  const actualUserId = userId?._id || userId;

  // 1. Ensure fresh access token (let LinkedInReauthRequiredError propagate distinctly)
  const accessToken = await ensureFreshLinkedInToken(actualUserId);

  // Retrieve user to obtain memberId
  const user = typeof userId === 'object' && userId?.linkedin?.memberId
    ? userId
    : await User.findById(actualUserId);

  if (!user || !user.linkedin || !user.linkedin.memberId) {
    throw new LinkedInReauthRequiredError('LinkedIn member ID not found. User re-authentication required.');
  }

  const authorUrn = formatAuthorUrn(user.linkedin.memberId);

  // 2. Upload image if generatedImageUrl is present
  let imageUrn = null;
  if (entry.generatedImageUrl && typeof entry.generatedImageUrl === 'string' && entry.generatedImageUrl.trim().length > 0) {
    imageUrn = await uploadImageToLinkedIn(entry.generatedImageUrl, authorUrn, accessToken);
  }

  // 3. Construct post body
  const postBody = {
    author: authorUrn,
    commentary: entry.generatedText.trim(),
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  if (imageUrn) {
    postBody.content = {
      media: {
        id: imageUrn,
        altText: entry.topic ? String(entry.topic).trim() : 'Daily Journey Update',
      },
    };
  }

  // 4. Call POST /rest/posts
  let postResponse;
  try {
    postResponse = await axios.post(
      `${LINKEDIN_API_BASE}/posts`,
      postBody,
      {
        headers: getLinkedInHeaders(accessToken),
        timeout: 25000,
      }
    );
  } catch (err) {
    const status = err.response?.status;
    const linkedinError = err.response?.data || err.message;
    const errSummary = typeof linkedinError === 'object' ? JSON.stringify(linkedinError) : linkedinError;
    throw new LinkedInPublishError(
      `LinkedIn create post failed (${status || 'UNKNOWN'}): ${errSummary}`,
      err.response?.data,
      status
    );
  }

  // Extract post URN from x-restli-id response header or body
  const headers = postResponse?.headers || {};
  const restliHeaderKey = Object.keys(headers).find(
    (k) => k.toLowerCase() === 'x-restli-id' || k.toLowerCase() === 'x-linkedin-id'
  );
  const rawPostUrn = restliHeaderKey ? headers[restliHeaderKey] : (postResponse.data?.id || null);

  if (!rawPostUrn) {
    throw new LinkedInPublishError(
      'LinkedIn post created but no post URN/ID was returned in headers or response body',
      postResponse.data,
      postResponse.status
    );
  }

  const postUrn = decodeURIComponent(rawPostUrn);

  // Update entry object in memory and persist if Mongoose document
  if (entry) {
    entry.linkedinPostUrn = postUrn;
    entry.status = 'posted';
    entry.postedAt = new Date();
    if (typeof entry.save === 'function') {
      try {
        await entry.save();
      } catch (saveErr) {
        console.warn(`[LinkedInPublisher] Failed to update entry status in DB: ${saveErr.message}`);
      }
    }
  }

  return postUrn;
};

export default {
  publishEntry,
  uploadImageToLinkedIn,
  formatAuthorUrn,
  LinkedInPublishError,
  LinkedInReauthRequiredError,
};
