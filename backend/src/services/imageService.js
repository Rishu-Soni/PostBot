/**
 * Image Service Stub
 * Coordinates the multi-step image pipeline: stock photo search (Unsplash/Pexels/Pixabay),
 * AI generation fallback, and direct user upload processing.
 */

/**
 * Searches stock image providers, and if no match is found, falls back
 * to AI image generation (user's key or platform default).
 *
 * @param {Object} params
 * @param {string} params.caption - Post caption text to extract image query from
 * @param {string} [params.topic] - Primary topic or theme of the post
 * @param {string} [params.userKey] - Optional user-provided image gen API key
 * @param {string} [params.provider] - Image gen provider ("openai", "stability", etc.)
 * @returns {Promise<{ url: string, source: 'stock'|'ai_generated', stockProvider?: string, aiProvider?: string, altText?: string }>}
 */
const findOrGenerateImage = async ({ caption, topic, userKey, provider }) => {
  // TODO: implement stock photo discovery and AI image fallback pipeline
  throw new Error('Not implemented: imageService.findOrGenerateImage');
};

/**
 * Processes and uploads a user-provided image buffer to persistent storage (e.g. S3/Cloudinary/GCS).
 *
 * @param {Express.Multer.File} file - Multer file object with buffer and mimetype
 * @returns {Promise<{ url: string, source: 'user_upload' }>}
 */
const uploadUserImage = async (file) => {
  // TODO: implement image storage upload
  throw new Error('Not implemented: imageService.uploadUserImage');
};

module.exports = {
  findOrGenerateImage,
  uploadUserImage,
};
