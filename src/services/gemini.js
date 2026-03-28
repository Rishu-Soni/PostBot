'use strict';

const { GoogleGenAI } = require('@google/genai');

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-2.5-flash';
const TIMEOUT = 90_000;

async function callGemini(payload) {
  const result = await Promise.race([
    genAI.models.generateContent(payload),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`[Gemini] Request timed out after ${TIMEOUT / 1000}s`)), TIMEOUT)),
  ]);
  const text = (result?.text ?? '').trim();
  if (!text) throw new Error('[Gemini] Empty response from API. Please try again.');
  return text;
}

async function generatePosts(audioBuffer, { styles, layout, tone, layoutExample }, refinementHint = null) {
  const systemInstruction =
    `You are an elite, top 1% LinkedIn ghostwriter known for crafting viral, high-converting posts. Your task is to analyze the provided raw spoken brain-dump and transform it into 3 distinct, ready-to-publish LinkedIn posts.

CORE PARAMETERS:
- WRITING STYLES: Create one post for each of these styles: ${styles.join(', ')}.
- LAYOUT & STRUCTURE: ${layoutExample ? `Strictly mirror the structural layout of this example post:\n"${layoutExample}"\n(Ignore the content, just mimic the paragraph breaks, sentence length, and structural flow).` : `Strictly follow this layout: ${layout}.`}
- TONE: Maintain a ${tone} tone throughout all posts.
- LANGUAGE: Strictly English.

VIRAL POST ARCHITECTURE & QUALITY RULES:
1. THE HOOK (First 2 Lines):
   - Line 1: A concise, direct, and punchy scroll-stopper (e.g., a bold claim, a surprising failure, or a contrarian thought).
   - Line 2: Create an "information gap" that sets the stakes and forces the reader to click "see more". No fluff.
2. THE BODY (150-300 words):
   - Format with maximum whitespace. Strictly 1-2 sentences per paragraph.
   - Translate the raw voice note into a compelling, story-driven narrative.
   - BAN LIST: Do not use AI-sounding jargon (e.g., "delve", "unlock", "supercharge", "testament", "tapestry", "navigate the landscape"). Sound like a real, authentic human.
3. THE ENGAGEMENT DRIVER (Ending):
   - Conclude with a polarizing, thought-provoking question or a subtle call-to-action that sparks debate.
   - CRITICAL: Do NOT directly ask for comments. Ask a question so specific they feel compelled to answer.
4. HASHTAGS:
   - Append 5-8 highly relevant, high-traffic hashtags at the very bottom.

FORMATTING STRICT RULES:
- NO titles, NO headers, NO introductory text.
- RETURN EXCLUSIVELY A RAW JSON ARRAY containing exactly 3 string elements.
- Do not wrap the output in markdown code blocks. No extra text before or after the array.
Example exact output format:
["First post text...", "Second post text...", "Third post text..."]` +
    (refinementHint ? `\n\nREFINEMENT INSTRUCTIONS:\nApply these instructions: ${refinementHint}\nKeep the same 3-post structure.` : '');

  const text = await callGemini({
    model: MODEL,
    config: { systemInstruction, responseMimeType: 'application/json' },
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'audio/ogg', data: audioBuffer.toString('base64') } },
        { text: refinementHint ? 'Generate 3 refined LinkedIn posts based on the audio and the refinement instructions above.' : 'Generate 3 LinkedIn posts from this audio brain dump.' },
      ],
    }],
  });

  return parsePostsJson(text);
}

// Takes a single selected post + user instructions.
// Returns 3 new variation strings, all refined versions of that one post.
// Replaces ALL session posts so the user can revise any of the 3 again indefinitely.
async function revisePosts(postText, instructions) {
  const systemInstruction =
    `You are an elite LinkedIn ghostwriter. The user has selected one post and wants it improved based on their instructions.

ORIGINAL POST:
${postText}

USER REVISION INSTRUCTIONS: ${instructions}

Your task:
- Generate 3 distinct, refined variations of this post, each applying the user's revision instructions in a different creative way.
- All 3 must stay true to the core idea of the original post.
- Apply the same quality rules: compelling hook, authentic voice, no AI jargon, 150-300 words, 5-8 relevant hashtags at the bottom.
- Return ONLY a raw JSON array of exactly 3 strings. No markdown, no code fences, no extra text.

Example output format:
["Variation 1...", "Variation 2...", "Variation 3..."]`;

  const text = await callGemini({
    model: MODEL,
    config: { systemInstruction, responseMimeType: 'application/json' },
    contents: [{ role: 'user', parts: [{ text: 'Apply the revision instructions and return 3 refined variation posts.' }] }],
  });

  return parsePostsJson(text);
}

function parsePostsJson(rawText) {
  let json = rawText;

  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) json = fenceMatch[1].trim();

  if (!json.startsWith('[')) {
    const start = json.indexOf('['), end = json.lastIndexOf(']');
    if (start !== -1 && end > start) json = json.slice(start, end + 1);
  }

  json = json.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, match =>
    match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
  );

  let posts;
  try {
    posts = JSON.parse(json);
  } catch {
    console.error('[Gemini] JSON parse failed. Raw:\n', rawText);
    throw new Error('[Gemini] Could not parse response as JSON. Please try again.');
  }

  if (!Array.isArray(posts)) throw new Error('[Gemini] Response is not a JSON array. Please try again.');

  posts = posts.slice(0, 3).map(p => (typeof p === 'string' ? p.trim() : JSON.stringify(p)));

  if (posts.length < 3) throw new Error(`[Gemini] Expected 3 posts but received ${posts.length}. Please try again.`);

  return posts;
}

async function extractPreferences(exampleText) {
  const systemInstruction = 
    `You are an expert copywriter analyzer. A user has provided an example of their writing.
    Analyze the text and extract their preferred 'Tone' and 'Styles'.
    
    Valid Styles (Pick up to 3): Punchy & Direct, Storytelling, Analytical, Conversational.
    Valid Tones (Pick exactly 1): Professional, Casual, Motivational, Humorous.
    
    Return ONLY a JSON object with two keys:
    {
      "preferredTone": "Tone Name",
      "preferredStyles": ["Style 1", "Style 2"]
    }
    No markdown formatting, no comments, just the raw JSON.`;

  const text = await callGemini({
    model: MODEL,
    config: { systemInstruction, responseMimeType: 'application/json' },
    contents: [{ role: 'user', parts: [{ text: exampleText }] }],
  });
  
  try {
    const rawMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    const jsonStr = rawMatch ? rawMatch[1] : text;
    return JSON.parse(jsonStr.trim());
  } catch (err) {
    console.error('[Gemini] Failed to parse preferences:', text);
    throw new Error('Analysis failed. Please try again.');
  }
}

module.exports = { generatePosts, revisePosts, extractPreferences };
