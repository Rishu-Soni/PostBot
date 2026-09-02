import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';

/**
 * Configure Cloudinary if credentials are provided in process.env.
 */
export const configureCloudinary = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const cloudinaryUrl = process.env.CLOUDINARY_URL;

  if (cloudinaryUrl) {
    cloudinary.config({ secure: true });
    return true;
  }

  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    return true;
  }

  return false;
};

/**
 * Builds the image generation prompt combining journey.imageStyle with entry.topic.
 * Ensures visual consistency across the entire journey while spotlighting the day's subject.
 *
 * @param {Object} journey - Journey document or plain object
 * @param {Object} entry - DailyEntry document or plain object
 * @returns {string} Formatted prompt string for the image model
 */
export const buildImagePrompt = (journey = {}, entry = {}) => {
  const topic = (entry.topic || 'Building in public daily milestone update').trim();
  const rawStyle = (journey.imageStyle || '').trim();
  const defaultStyle =
    'Modern minimalist 3D digital illustration, sleek tech aesthetic with deep indigo, violet, and electric cyan accents, professional LinkedIn graphic';

  const style = rawStyle || defaultStyle;

  // Build high-definition prompt
  let prompt = `${topic}. Visual style: ${style}.`;

  if (entry.challenge && typeof entry.challenge === 'string' && entry.challenge.trim().length > 0) {
    prompt += ` Context: ${entry.challenge.trim()}.`;
  }

  prompt += ' Crisp lighting, vibrant clean geometry, premium digital art, 4k resolution, no typos, no watermarks, uncluttered composition.';

  return prompt;
};

/**
 * Uploads an image buffer or remote URL to Cloudinary and returns the secure public HTTPS URL.
 * If Cloudinary credentials are not configured, returns null to signal direct provider URL fallback.
 *
 * @param {Buffer|string} imageBufferOrUrl - Image buffer, base64 data URI, or remote HTTP URL
 * @param {Object} options - Upload options (folder, public_id, etc.)
 * @returns {Promise<string|null>} Cloudinary secure_url or null if Cloudinary not configured
 */
export const uploadToCloudinary = async (imageBufferOrUrl, options = {}) => {
  const isConfigured = configureCloudinary();
  if (!isConfigured) {
    return null;
  }

  const folder = options.folder || 'postbot/journeys';
  const publicId = options.publicId || `post_${Date.now()}`;

  // If buffer was provided, upload using base64 data URI format
  let uploadSource = imageBufferOrUrl;
  if (Buffer.isBuffer(imageBufferOrUrl)) {
    uploadSource = `data:image/jpeg;base64,${imageBufferOrUrl.toString('base64')}`;
  }

  const result = await cloudinary.uploader.upload(uploadSource, {
    folder,
    public_id: publicId,
    resource_type: 'image',
    overwrite: true,
  });

  return result.secure_url;
};

/**
 * Generates an image using Pollinations.ai (Flux / SD engine).
 * Returns both the image buffer and the direct public URL.
 *
 * @param {string} prompt - Detailed image generation prompt
 * @param {Object} options - Custom generation parameters
 * @returns {Promise<{ buffer: Buffer, directUrl: string }>}
 */
export const fetchImageFromPollinations = async (prompt, options = {}) => {
  const width = options.width || 1024;
  const height = options.height || 1024;
  const seed = options.seed || Math.floor(Math.random() * 1000000);
  const model = options.model || 'flux';

  const directUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    prompt
  )}?width=${width}&height=${height}&nologo=true&seed=${seed}&model=${model}`;

  try {
    const response = await axios.get(directUrl, {
      responseType: 'arraybuffer',
      timeout: 45000,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('Pollinations API returned empty image data.');
    }

    return {
      buffer: Buffer.from(response.data),
      directUrl,
    };
  } catch (error) {
    // If arraybuffer fetch times out or fails, return direct URL so frontend can still display it
    if (directUrl) {
      return {
        buffer: null,
        directUrl,
      };
    }
    throw new Error(`Pollinations image fetch failed: ${error.message}`);
  }
};

/**
 * Generates an image using Stability AI API if STABILITY_API_KEY is configured.
 *
 * @param {string} prompt - Image generation prompt
 * @param {string} apiKey - Stability AI API Key
 * @returns {Promise<{ buffer: Buffer, directUrl: string }>}
 */
export const fetchImageFromStability = async (prompt, apiKey) => {
  const engineId = process.env.STABILITY_ENGINE || 'stable-diffusion-xl-1024-v1-0';
  const url = `https://api.stability.ai/v1/generation/${engineId}/text-to-image`;

  const response = await axios.post(
    url,
    {
      text_prompts: [{ text: prompt, weight: 1 }],
      cfg_scale: 7,
      height: 1024,
      width: 1024,
      samples: 1,
      steps: 30,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 60000,
    }
  );

  const base64Image = response.data?.artifacts?.[0]?.base64;
  if (!base64Image) {
    throw new Error('Stability AI API returned invalid image artifacts.');
  }

  const buffer = Buffer.from(base64Image, 'base64');
  return {
    buffer,
    directUrl: `data:image/png;base64,${base64Image}`,
  };
};

/**
 * Generates a visual post image for a given journey and daily entry:
 * 1. Builds an image prompt combining journey.imageStyle with entry.topic.
 * 2. Calls image generation API (Pollinations.ai / Stability AI).
 * 3. Uploads resulting binary/URL image to Cloudinary (or falls back to direct public URL).
 * 4. Returns the resulting public HTTPS image URL.
 *
 * @param {Object} journey - Journey document or plain object
 * @param {Object} entry - DailyEntry document or plain object
 * @returns {Promise<string>} Public image URL
 * @throws {Error} Clear error if prompt building or generation fails
 */
export const generatePostImage = async (journey = {}, entry = {}) => {
  const prompt = buildImagePrompt(journey, entry);
  const provider = process.env.IMAGE_PROVIDER || 'pollinations';
  const stabilityKey = process.env.STABILITY_API_KEY;

  let imageData;

  try {
    if (provider === 'stability' && stabilityKey) {
      imageData = await fetchImageFromStability(prompt, stabilityKey);
    } else {
      imageData = await fetchImageFromPollinations(prompt);
    }
  } catch (apiError) {
    const errorMsg =
      apiError.response?.data?.message || apiError.response?.data?.error || apiError.message;
    throw new Error(`Image generation failed: ${errorMsg}`);
  }

  // Upload to Cloudinary if configured
  try {
    const journeyIdStr = journey._id ? journey._id.toString() : 'journey';
    const dayNumber = entry.dayNumber || 1;
    const publicId = `journey_${journeyIdStr}_day_${dayNumber}_${Date.now()}`;

    const uploadSource = imageData.buffer || imageData.directUrl;
    const cloudinaryUrl = await uploadToCloudinary(uploadSource, {
      folder: 'postbot/journeys',
      publicId,
    });

    if (cloudinaryUrl) {
      return cloudinaryUrl;
    }
  } catch (uploadError) {
    console.warn('Cloudinary upload warning (falling back to direct provider URL):', uploadError.message);
  }

  // Fallback to direct public image URL from provider
  if (imageData.directUrl) {
    return imageData.directUrl;
  }

  throw new Error('Failed to obtain a public URL for the generated image.');
};

export default {
  buildImagePrompt,
  configureCloudinary,
  uploadToCloudinary,
  fetchImageFromPollinations,
  fetchImageFromStability,
  generatePostImage,
};
