const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const OpenAI = require('openai');
const AppError = require('../utils/AppError');

/**
 * Image Service
 * Implements the multi-tiered image pipeline:
 * 1. Licensed stock image search in strict order: Unsplash -> Pexels -> Pixabay with keyword relevance check.
 * 2. AI generation fallback via DALL-E (user's personal key or platform default key at 0 credit cost).
 * 3. Persistent user image upload via Cloudinary CDN storage.
 */

// Common stop words to exclude when extracting search keywords
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'cannot', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for',
  'from', 'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him',
  'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'isn', 'it', 'its', 'itself', 'just', 'me',
  'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your', 'yours',
]);

/**
 * Helper to extract 2-4 clean search keywords and a concise query string from topic and caption.
 *
 * @param {string} [caption]
 * @param {string} [topic]
 * @returns {{ query: string, keywords: string[] }}
 */
const extractSearchKeywords = (caption = '', topic = '') => {
  const combinedText = `${topic} ${caption}`
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();

  const words = combinedText
    .split(' ')
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  // Pick top unique meaningful keywords
  const uniqueWords = [...new Set(words)];
  const keywords = uniqueWords.slice(0, 5);

  // If topic is present, prioritize it for the primary search query; otherwise use top keywords
  const query = topic && topic.trim().length > 0
    ? topic.trim().replace(/[^\w\s]/g, '').split(' ').slice(0, 3).join(' ')
    : keywords.slice(0, 3).join(' ') || 'business startup';

  return { query, keywords };
};

/**
 * Basic relevance check: determines if an image's metadata contains keyword overlap
 * with the post's core subject matter.
 *
 * @param {string[]} postKeywords
 * @param {string[]} imageTagsAndDescription
 * @returns {boolean}
 */
const isRelevantMatch = (postKeywords, imageTagsAndDescription) => {
  if (!postKeywords || postKeywords.length === 0) return true;
  const imageText = imageTagsAndDescription.join(' ').toLowerCase();

  return postKeywords.some((keyword) => imageText.includes(keyword.toLowerCase()));
};

/**
 * Tier 1: Search Unsplash API for relevant licensed stock photo.
 *
 * @param {string} query
 * @param {string[]} keywords
 * @returns {Promise<{ url: string, source: 'stock', stockProvider: 'unsplash', altText: string }|null>}
 */
const searchUnsplash = async (query, keywords) => {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return null;

  try {
    const response = await axios.get('https://api.unsplash.com/search/photos', {
      params: {
        query,
        per_page: 10,
        orientation: 'landscape',
      },
      headers: {
        Authorization: `Client-ID ${accessKey}`,
      },
      timeout: 5000,
    });

    const results = response.data?.results;
    if (!results || results.length === 0) return null;

    for (const photo of results) {
      const metadata = [
        photo.alt_description || '',
        photo.description || '',
        ...(photo.tags || []).map((t) => t.title || ''),
      ];

      if (isRelevantMatch(keywords, metadata)) {
        return {
          url: photo.urls.regular || photo.urls.small,
          source: 'stock',
          stockProvider: 'unsplash',
          aiProvider: null,
          altText: photo.alt_description || photo.description || query,
        };
      }
    }

    // If no strict keyword overlap was matched among candidates, return first result as fallback
    const fallbackPhoto = results[0];
    return {
      url: fallbackPhoto.urls.regular || fallbackPhoto.urls.small,
      source: 'stock',
      stockProvider: 'unsplash',
      aiProvider: null,
      altText: fallbackPhoto.alt_description || fallbackPhoto.description || query,
    };
  } catch (error) {
    // Gracefully cascade to next provider if Unsplash fails or is rate-limited
    return null;
  }
};

/**
 * Tier 2: Search Pexels API for relevant licensed stock photo.
 *
 * @param {string} query
 * @param {string[]} keywords
 * @returns {Promise<{ url: string, source: 'stock', stockProvider: 'pexels', altText: string }|null>}
 */
const searchPexels = async (query, keywords) => {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await axios.get('https://api.pexels.com/v1/search', {
      params: {
        query,
        per_page: 10,
        orientation: 'landscape',
      },
      headers: {
        Authorization: apiKey,
      },
      timeout: 5000,
    });

    const photos = response.data?.photos;
    if (!photos || photos.length === 0) return null;

    for (const photo of photos) {
      const metadata = [photo.alt || ''];
      if (isRelevantMatch(keywords, metadata)) {
        return {
          url: photo.src.large || photo.src.medium,
          source: 'stock',
          stockProvider: 'pexels',
          aiProvider: null,
          altText: photo.alt || query,
        };
      }
    }

    const fallbackPhoto = photos[0];
    return {
      url: fallbackPhoto.src.large || fallbackPhoto.src.medium,
      source: 'stock',
      stockProvider: 'pexels',
      aiProvider: null,
      altText: fallbackPhoto.alt || query,
    };
  } catch (error) {
    return null;
  }
};

/**
 * Tier 3: Search Pixabay API for relevant licensed stock photo.
 *
 * @param {string} query
 * @param {string[]} keywords
 * @returns {Promise<{ url: string, source: 'stock', stockProvider: 'pixabay', altText: string }|null>}
 */
const searchPixabay = async (query, keywords) => {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await axios.get('https://pixabay.com/api/', {
      params: {
        key: apiKey,
        q: query,
        per_page: 10,
        image_type: 'photo',
        orientation: 'horizontal',
      },
      timeout: 5000,
    });

    const hits = response.data?.hits;
    if (!hits || hits.length === 0) return null;

    for (const hit of hits) {
      const metadata = [hit.tags || ''];
      if (isRelevantMatch(keywords, metadata)) {
        return {
          url: hit.largeImageURL || hit.webformatURL,
          source: 'stock',
          stockProvider: 'pixabay',
          aiProvider: null,
          altText: hit.tags || query,
        };
      }
    }

    const fallbackHit = hits[0];
    return {
      url: fallbackHit.largeImageURL || fallbackHit.webformatURL,
      source: 'stock',
      stockProvider: 'pixabay',
      aiProvider: null,
      altText: fallbackHit.tags || query,
    };
  } catch (error) {
    return null;
  }
};

/**
 * Generates an image using OpenAI DALL-E when stock photo search yields no results.
 * Supports user-supplied BYO key or platform default key at 0 credit cost.
 *
 * @param {string} topic
 * @param {string} caption
 * @param {string} [userKey]
 * @returns {Promise<{ url: string, source: 'ai_generated', stockProvider: null, aiProvider: string, altText: string }>}
 */
const generateAIImage = async (topic, caption, userKey) => {
  const apiKey = userKey || process.env.DEFAULT_IMAGE_GEN_API_KEY;

  if (!apiKey) {
    throw new AppError(
      'No stock image found, and no AI image generation key is configured. Please provide an image generation key or set DEFAULT_IMAGE_GEN_API_KEY in .env.',
      500
    );
  }

  const captionSnippet = (caption || topic || 'Professional insight')
    .slice(0, 160)
    .replace(/\s+/g, ' ')
    .trim();

  const prompt = `A clean, modern, professional editorial photograph or conceptual digital art piece for a LinkedIn post. Theme: "${topic || 'Tech & Leadership'}". Context: "${captionSnippet}". Clean composition, natural lighting, high aesthetic quality, strictly NO text overlays, NO typography, NO watermark.`;

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      throw new Error('AI image generation provider returned an empty image URL.');
    }

    return {
      url: imageUrl,
      source: 'ai_generated',
      stockProvider: null,
      aiProvider: userKey ? 'user_key' : 'platform_default',
      altText: `AI generated image for ${topic || 'LinkedIn post'}`,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      `AI image generation failed: ${error.message || 'Provider request failed'}`,
      error.status || 502
    );
  }
};

/**
 * Searches stock image providers in order (Unsplash -> Pexels -> Pixabay),
 * and if no match is found, falls back to AI image generation.
 *
 * Supports both object parameter destructuring and positional arguments.
 *
 * @param {Object|string} paramsOrCaption - Parameter object or caption string
 * @param {string} [topicArg] - Topic if called positionally
 * @param {string} [userKeyArg] - User API key if called positionally
 * @param {string} [providerArg] - Provider name if called positionally
 * @returns {Promise<{ url: string, source: 'stock'|'ai_generated', stockProvider?: string|null, aiProvider?: string|null, altText?: string }>}
 */
const findOrGenerateImage = async (
  paramsOrCaption,
  topicArg,
  userKeyArg,
  providerArg
) => {
  let caption;
  let topic;
  let userKey;
  let provider;

  if (typeof paramsOrCaption === 'object' && paramsOrCaption !== null) {
    ({
      caption,
      topic,
      userKey,
      provider,
    } = paramsOrCaption);
  } else {
    caption = paramsOrCaption;
    topic = topicArg;
    userKey = userKeyArg;
    provider = providerArg;
  }

  const { query, keywords } = extractSearchKeywords(caption, topic);

  // 1. Try Unsplash
  const unsplashResult = await searchUnsplash(query, keywords);
  if (unsplashResult) return unsplashResult;

  // 2. Try Pexels
  const pexelsResult = await searchPexels(query, keywords);
  if (pexelsResult) return pexelsResult;

  // 3. Try Pixabay
  const pixabayResult = await searchPixabay(query, keywords);
  if (pixabayResult) return pixabayResult;

  // 4. No stock match found -> AI generation fallback (costs 0 credits)
  return await generateAIImage(topic, caption, userKey);
};

/**
 * Processes and uploads a user-provided image buffer to persistent Cloudinary CDN storage.
 * Supports both Multer file object ({ buffer, mimetype }) and positional arguments (buffer, mimetype).
 *
 * @param {Express.Multer.File|Buffer} fileOrBuffer - Multer file object or raw Buffer
 * @param {string} [mimetypeArg] - MIME type string (required if buffer is passed directly)
 * @returns {Promise<{ url: string, source: 'user_upload' }>}
 */
const uploadUserImage = async (fileOrBuffer, mimetypeArg) => {
  let buffer;
  let mimetype;

  if (Buffer.isBuffer(fileOrBuffer)) {
    buffer = fileOrBuffer;
    mimetype = mimetypeArg || 'image/jpeg';
  } else if (fileOrBuffer && fileOrBuffer.buffer) {
    buffer = fileOrBuffer.buffer;
    mimetype = fileOrBuffer.mimetype || 'image/jpeg';
  } else {
    throw new AppError('Invalid image file or buffer provided for upload.', 400);
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError(
      'Cloudinary persistent storage credentials are missing. Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.',
      500
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  const base64Data = buffer.toString('base64');
  const dataUri = `data:${mimetype};base64,${base64Data}`;

  try {
    const uploadResponse = await cloudinary.uploader.upload(dataUri, {
      folder: 'postbot_uploads',
      resource_type: 'image',
    });

    const secureUrl = uploadResponse.secure_url || uploadResponse.url;
    if (!secureUrl) {
      throw new Error('Cloudinary returned an empty upload URL.');
    }

    return {
      url: secureUrl,
      source: 'user_upload',
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Cloudinary image upload failed: ${error.message || 'Storage error'}`,
      502
    );
  }
};

module.exports = {
  findOrGenerateImage,
  uploadUserImage,
};
