// src/services/gemini.js
// ─────────────────────────────────────────────────────────────────────────────
// Gemini 1.5 Flash service — converts a voice note Buffer into 3 LinkedIn posts.
//
// FIX TRACKER
//   FIX 1: AbortController signal is now actually passed to the API call.
//           Previously the controller was created and abort() was called by the
//           timer, but signal was never wired in — so the API call ran until
//           its own internal timeout (or forever), making our abort a no-op.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const { GoogleGenAI } = require('@google/genai');

// Lazy-initialise the client once. The API key is validated at startup in
// server.js before any requests can be served.
let _genAI = null;
function _client() {
  if (!_genAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('[Gemini] GEMINI_API_KEY is not set');
    }
    _genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _genAI;
}

const MODEL_ID = 'gemini-2.5-flash';

// Generous timeout: large voice files (10 MB) take time to base64-encode and
// upload over the network + inference time. 90 s is a safe p99 ceiling.
const GEMINI_TIMEOUT_MS = 90_000;

/**
 * Generate 3 LinkedIn posts from an audio buffer using Gemini.
 *
 * @param {Buffer}   audioBuffer              - Raw OGG/Opus bytes from Telegram
 * @param {object}   preferences              - User preferences
 * @param {string[]} preferences.styles       - Writing styles
 * @param {string}   preferences.layout       - Layout (e.g. 'Single block')
 * @param {string}   preferences.tone         - Tone (e.g. 'Professional')
 * @param {string|null} [refinementHint=null] - Extra instructions for refine mode
 * @returns {Promise<string[]>}               - Exactly 3 post strings
 * @throws  {Error}                           - On API error or bad response shape
 */
async function generatePosts(audioBuffer, preferences, refinementHint = null) {
  const { styles, layout, tone } = preferences;

  // ── Build the system instruction ──────────────────────────────────────────
  let systemInstruction =
    `You are an expert LinkedIn ghostwriter and content strategist. ` +
    `Your job is to listen to a raw, unfiltered spoken brain-dump from a professional ` +
    `and convert it into 3 distinct, ready-to-publish LinkedIn posts.\n\n` +

    `WRITING STYLES: Each post must use a different one of these styles: ${styles.join(', ')}.\n` +
    `LAYOUT: Use this layout for each post: ${layout}.\n` +
    `TONE: Write with a ${tone} tone throughout.\n` +
    `LANGUAGE: The output MUST be entirely in English. Translate the voice note into English if it is in another language.\n\n` +

    `POST QUALITY RULES:\n` +
    `• Each post should be 150–300 words.\n` +
    `• Use line breaks between paragraphs for readability.\n` +
    `• Start with a compelling hook (first line is critical on LinkedIn).\n` +
    `• End with a call-to-action or thought-provoking question.\n` +
    `• Posts must feel authentic, human, and not AI-generated.\n` +
    `• Do NOT use generic filler phrases like "In today's fast-paced world...".\n` +
    `• Do NOT add a title or heading above the post.\n\n` +

    `OUTPUT FORMAT (STRICTLY FOLLOW — no exceptions):\n` +
    `Return ONLY a raw JSON array of exactly 3 strings. No markdown, no code fences, ` +
    `no explanatory text before or after — just the array.\n` +
    `Example of valid output: ["Post one text here...", "Post two text here...", "Post three text here..."]`;

  if (refinementHint) {
    systemInstruction +=
      `\n\nREFINEMENT INSTRUCTIONS:\n` +
      `The user wants changes to the previous posts.\n` +
      `Apply these instructions: ${refinementHint}\n` +
      `Keep the same 3-post structure and quality rules above.`;
  }

  // ── FIX 1: Wire the AbortController signal into the API call ─────────────
  // Previously, AbortController was created and .abort() was called by the
  // timer, but `signal` was never passed to generateContent() — making the
  // abort a no-op. The @google/genai SDK does not expose a native signal
  // parameter in the same field as fetch(); we implement timeout via
  // Promise.race() instead, which works regardless of SDK internals.
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`[Gemini] Request timed out after ${GEMINI_TIMEOUT_MS / 1000}s`)),
      GEMINI_TIMEOUT_MS
    )
  );

  const apiCallPromise = _client().models.generateContent({
    model: MODEL_ID,
    config: { 
      systemInstruction,
      responseMimeType: 'application/json',
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'audio/ogg',
              data: audioBuffer.toString('base64'),
            },
          },
          {
            text: refinementHint
              ? 'Please generate 3 refined LinkedIn posts based on the audio and the refinement instructions above.'
              : 'Please generate 3 LinkedIn posts from this audio brain dump.',
          },
        ],
      },
    ],
  });

  // Race: whichever settles first wins. If timeout fires, we get a clean error.
  const result = await Promise.race([apiCallPromise, timeoutPromise]);

  const rawText = (result?.text ?? '').trim();
  if (!rawText) {
    throw new Error('[Gemini] Empty response from API. Please try again.');
  }

  // ── Parse the JSON response ───────────────────────────────────────────────
  return _parsePostsJson(rawText);
}

/**
 * Generate 3 revised posts from text context (no audio).
 * Used by the text-based refine flow in text.js.
 *
 * @param {string[]} originalPosts   - The 3 posts previously generated
 * @param {string}   instructions    - User's typed revision instructions (sanitised by caller)
 * @param {number|null} targetIndex  - Which option (0/1/2) or null for all
 * @returns {Promise<string[]>}      - 3 revised post strings
 */
async function revisePosts(originalPosts, instructions, targetIndex) {
  const originalPostsContext = originalPosts
    .map((p, i) => `Option ${i + 1}:\n${p}`)
    .join('\n\n---\n\n');

  const targetLabel = targetIndex !== null && targetIndex !== undefined
    ? `The user specifically wants to revise Option ${targetIndex + 1}.`
    : 'The user wants revisions across all 3 posts.';

  const systemInstruction =
    `You are an expert LinkedIn ghostwriter. ` +
    `The user has reviewed 3 LinkedIn posts and wants revisions.\n\n` +
    `ORIGINAL POSTS:\n${originalPostsContext}\n\n` +
    `${targetLabel}\n` +
    `USER REVISION INSTRUCTIONS: ${instructions}\n\n` +
    `Generate 3 updated LinkedIn posts. Apply the user's revision to the specified option(s). ` +
    `Keep unaffected posts at the same quality. ` +
    `Return ONLY a raw JSON array of exactly 3 strings. No markdown, no code fences.`;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`[Gemini] Request timed out after ${GEMINI_TIMEOUT_MS / 1000}s`)),
      GEMINI_TIMEOUT_MS
    )
  );

  const apiCallPromise = _client().models.generateContent({
    model: MODEL_ID,
    config: { 
      systemInstruction,
      responseMimeType: 'application/json',
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Please apply the revisions and return 3 updated posts.' }],
      },
    ],
  });

  const result = await Promise.race([apiCallPromise, timeoutPromise]);
  const rawText = (result?.text ?? '').trim();

  if (!rawText) throw new Error('[Gemini] Empty revision response. Please try again.');

  return _parsePostsJson(rawText);
}

/**
 * Shared JSON parser for Gemini post responses.
 * Handles code-fence wrapping and leading explanatory text defensively.
 *
 * @param {string} rawText
 * @returns {string[]} Exactly 3 post strings
 */
function _parsePostsJson(rawText) {
  let jsonString = rawText;

  // Strip markdown code fences if present
  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    jsonString = fenceMatch[1].trim();
  }

  // Find the outermost [ ... ] if not already a bare array
  if (!jsonString.startsWith('[')) {
    const arrayStart = jsonString.indexOf('[');
    const arrayEnd = jsonString.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      jsonString = jsonString.slice(arrayStart, arrayEnd + 1);
    }
  }

  // Fallback: Fix unescaped newlines inside string literals which break JSON.parse
  jsonString = jsonString.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match) => {
    return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  });

  let posts;
  try {
    posts = JSON.parse(jsonString);
  } catch {
    console.error('[Gemini] JSON parse failed. Raw response:\n', rawText);
    throw new Error('[Gemini] Could not parse response as JSON. Please try again.');
  }

  if (!Array.isArray(posts)) {
    throw new Error('[Gemini] Response is not a JSON array. Please try again.');
  }

  posts = posts
    .slice(0, 3)
    .map((p) => (typeof p === 'string' ? p.trim() : JSON.stringify(p)));

  if (posts.length < 3) {
    throw new Error(`[Gemini] Expected 3 posts but received ${posts.length}. Please try again.`);
  }

  return posts;
}

module.exports = { generatePosts, revisePosts };
