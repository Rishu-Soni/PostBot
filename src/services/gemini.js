'use strict';

const { GoogleGenAI } = require('@google/genai');

// Lazy-init: SDK is created on first use so the module can be safely required
// before environment variables are loaded (e.g., during serverless cold-start).
let _genAI = null;
function getGenAI() {
  if (!_genAI) _genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _genAI;
}

const MODEL   = 'gemini-2.5-flash';
const TIMEOUT = 90_000;

// Calls the Gemini API with a hard timeout.
// Timer is cleared immediately when Gemini resolves so no dangling timers accumulate.
async function callGemini(payload) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`[Gemini] Request timed out after ${TIMEOUT / 1000}s`)),
      TIMEOUT
    );
  });

  try {
    const result = await Promise.race([
      getGenAI().models.generateContent(payload),
      timeoutPromise,
    ]);
    const text = (result?.text ?? '').trim();
    if (!text) throw new Error('[Gemini] Empty response from API. Please try again.');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function generatePosts(audioBuffer, { styles, layout, tone, layoutExample }, refinementHint = null) {
  let systemInstruction;

  if (refinementHint) {
    systemInstruction = `You are an elite LinkedIn ghostwriter. The user wants to revise an existing post using voice instructions.

${refinementHint}

CRITICAL REVISION RULES:
1. STRICT FORMAT PRESERVATION: You MUST perfectly mirror the layout, paragraph spacing, line lengths, tone, and emoji usage of the original post. Do NOT restructure the post.
2. ACCURATE MODIFICATION: Listen to the audio and apply the user's specific changes to the content.
3. OUTPUT: Generate 3 distinct variations of the revised post.
4. FORMAT: Return EXCLUSIVELY a raw JSON array of exactly 3 strings. No markdown code blocks, no extra text.
Example: ["Variation 1...", "Variation 2...", "Variation 3..."]`;
  } else {
    const architectureRules = layoutExample
      ? `VIRAL POST ARCHITECTURE & QUALITY RULES:
1. STRICT LAYOUT MATCHING (CRITICAL):
   - You MUST exactly mirror the layout, paragraph breaks, and sentence lengths of the example post provided.
   - Do NOT force a typical "Hook-Body-Conclusion" structure if it conflicts with the example.
2. BAN LIST: Do not use AI-sounding jargon (e.g., "delve", "unlock", "supercharge", "testament"). Sound human.
3. HASHTAGS: Match the hashtag usage pattern (amount/placement) of the example post.`
      : `VIRAL POST ARCHITECTURE & QUALITY RULES:
1. THE HOOK (First 2 Lines):
   - Line 1: A concise, direct, and punchy scroll-stopper (e.g., a bold claim, a surprising failure, or a contrarian thought).
   - Line 2: Create an "information gap" that sets the stakes and forces the reader to click "see more". No fluff.
2. THE BODY (150-300 words):
   - Format with maximum whitespace. Strictly 1-2 sentences per paragraph.
   - Translate the raw voice note into a compelling, story-driven narrative.
   - BAN LIST: Do not use AI-sounding jargon. Sound like a real, authentic human.
3. THE ENGAGEMENT DRIVER (Ending):
   - Conclude with a polarizing, thought-provoking question or a subtle call-to-action that sparks debate.
   - CRITICAL: Do NOT directly ask for comments. Ask a question so specific they feel compelled to answer.
4. HASHTAGS:
   - Append 5-8 highly relevant, high-traffic hashtags at the very bottom.`;

    systemInstruction = `You are an elite, top 1% LinkedIn ghostwriter known for crafting viral, high-converting posts. Your task is to analyze the provided raw spoken brain-dump and transform it into 3 distinct, ready-to-publish LinkedIn posts.

CORE PARAMETERS:
- WRITING STYLES: Create one post for each of these styles: ${styles.join(', ')}.
- LAYOUT & STRUCTURE: ${layoutExample ? `Strictly mirror the structural layout of this example post:\n"${layoutExample}"\n(Ignore the content, just mimic the paragraph breaks, sentence length, and structural flow).` : `Strictly follow this layout: ${layout}.`}
- TONE: Maintain a ${tone} tone throughout all posts.
- LANGUAGE: Strictly English.

${architectureRules}

FORMATTING STRICT RULES:
- NO titles, NO headers, NO introductory text.
- RETURN EXCLUSIVELY A RAW JSON ARRAY containing exactly 3 string elements.
- Do not wrap the output in markdown code blocks. No extra text before or after the array.
Example exact output format:
["First post text...", "Second post text...", "Third post text..."]`;
  }

  // Telegram voice notes are always OGG/Opus; we declare the correct MIME type.
  const text = await callGemini({
    model: MODEL,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'audio/ogg; codecs=opus', data: audioBuffer.toString('base64') } },
        { text: refinementHint ? 'Generate 3 refined LinkedIn posts based on the audio and the original post.' : 'Generate 3 LinkedIn posts from this audio brain dump.' },
      ],
    }],
  });

  return parsePostsJson(text);
}

// Takes a single selected post + user instructions.
// Returns 3 new variation strings, all refined versions of that one post.
async function revisePosts(postText, instructions) {
  const systemInstruction =
    `You are an elite LinkedIn ghostwriter. The user has selected a specific post for revision, and provided text instructions for the changes.

ORIGINAL POST:
"${postText}"

USER REVISION INSTRUCTIONS: 
"${instructions}"

CRITICAL REVISION RULES:
1. STRICT FORMAT PRESERVATION (CRITICAL): You MUST perfectly mirror the layout, paragraph spacing, line lengths, tone, and emoji usage of the ORIGINAL POST. Do NOT rewrite the entire post into a different format.
2. ACCURATE MODIFICATION: Apply the user's revision instructions aggressively to the content (change facts, add text, remove text as requested). If an instruction conflicts with the original, prioritize the instruction but KEEP the overall structure intact.
3. OUTPUT: Generate 3 distinct variations of the revised post.
4. FORMAT: Return EXCLUSIVELY a raw JSON array of exactly 3 strings. No markdown code blocks, no extra text.
Example exact output format:
["Variation 1...", "Variation 2...", "Variation 3..."]`;

  const text = await callGemini({
    model: MODEL,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    contents: [{ role: 'user', parts: [{ text: 'Apply the revision instructions and return 3 refined variation posts as JSON.' }] }],
  });

  return parsePostsJson(text);
}

function parsePostsJson(rawText) {
  try {
    const posts = JSON.parse(rawText);
    if (!Array.isArray(posts) || posts.length < 3) {
      throw new Error(`Expected at least 3 posts, got ${Array.isArray(posts) ? posts.length : typeof posts}`);
    }
    return posts.slice(0, 3).map(p => (typeof p === 'string' ? p.trim() : JSON.stringify(p)));
  } catch (err) {
    console.error('[Gemini] JSON parse failed. Raw:\n', rawText, '\nError:', err.message);
    throw new Error('[Gemini] Could not parse response as JSON. Please try again.');
  }
}

async function extractPreferences(exampleText) {
  const systemInstruction =
    `You are an expert copywriter analyzer. A user has provided an example of their writing.
Analyze the text and extract their preferred 'Tone' and 'Styles'.

Valid Styles (Pick up to 3): Punchy & Direct, Storytelling, Analytical, Conversational.
Valid Tones (Pick exactly 1): Professional, Casual, Motivational, Humorous.

Return ONLY a raw JSON object with exactly two keys:
{ "preferredTone": "Tone Name", "preferredStyles": ["Style 1", "Style 2"] }
No markdown formatting, no comments, just the raw JSON.`;

  const text = await callGemini({
    model: MODEL,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          preferredTone:   { type: 'STRING' },
          preferredStyles: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['preferredTone', 'preferredStyles'],
      },
    },
    contents: [{ role: 'user', parts: [{ text: exampleText }] }],
  });

  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('[Gemini] Failed to parse preferences:', text);
    throw new Error('Analysis failed. Please try again.');
  }
}

module.exports = { generatePosts, revisePosts, extractPreferences };
