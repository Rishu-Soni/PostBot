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
const TIMEOUT = 90_000; // 90 s hard cap per attempt

/**
 * Calls the Gemini API with a per-attempt hard timeout and exponential back-off
 * for transient errors (503 / 429 / 500).
 *
 * Bug-fixes applied:
 *  1. result.text()  — the @google/genai SDK exposes text as a METHOD, not a
 *     property. Using `result.text` returned the function reference (truthy),
 *     so the empty-check never fired and JSON.parse received stringified source
 *     code, causing "JSON parse failed" errors downstream.
 *  2. Retry off-by-one: the old guard was `attempt < maxRetries - 1`, meaning
 *     the 3rd retry (when maxRetries = 3) was never executed — we bailed out
 *     immediately on the 3rd failure instead of trying once more.
 *  3. Exhaustion fallthrough: the while-loop could exit silently (return undefined)
 *     when all attempts were used. Callers don't guard against undefined.
 *  4. Timer leak: clearTimeout was inside finally{} but the reject-Promise from
 *     timeoutPromise was created once and raced every iteration — the timer from
 *     a *previous* iteration's race could fire during the next one. Now each
 *     iteration creates a fresh timer and clears it immediately after the race.
 */
async function callGemini(payload, maxRetries = 3) {
  let lastErr;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let timer;
    try {
      // Race: Gemini call vs. hard-timeout sentinel.
      const result = await Promise.race([
        getGenAI().models.generateContent(payload),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`[System] Request timed out after ${TIMEOUT / 1000}s. Please try again.`)),
            TIMEOUT
          );
        }),
      ]);

      // CRITICAL FIX: .text is a METHOD in @google/genai SDK, not a property.
      // Calling it as a property returns the function itself (truthy string "function…"),
      // which passes the empty-check and then breaks JSON.parse downstream.
      const text = (typeof result.text === 'function' ? result.text() : result.text ?? '').trim();
      if (!text) throw new Error('[System] Empty response received. Please try again.');
      return text;

    } catch (err) {
      lastErr = err;
      const msg = String(err.status || err.message || err.toString());
      const is503 = msg.includes('503') || msg.includes('UNAVAILABLE');
      const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
      const is500 = msg.includes('500') || msg.includes('INTERNAL');
      const isTransient = is503 || is429 || is500;

      if (isTransient && attempt < maxRetries) {
        // Exponential back-off: 2 s, 4 s, 8 s …
        const backoffMs = Math.pow(2, attempt) * 1000;
        const kind = is503 ? '503' : is429 ? '429' : '500';
        console.warn(`[System] Transient error detected (${kind}). Retrying attempt ${attempt + 1}/${maxRetries} in ${backoffMs}ms...`);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }

      // All retries exhausted — log and convert to user-friendly message.
      if (is503) throw new Error('[System] The service is experiencing high demand right now. Please wait a moment and try again.');
      if (is429) throw new Error('[System] Rate limit reached. Please wait 30 seconds and try again.');
      if (is500) throw new Error('[System] An internal error occurred on the AI server. Please try again.');
      throw err;

    } finally {
      // Always clear the timer whether we succeeded, threw, or are about to retry.
      clearTimeout(timer);
    }
  }

  // Safety net — this line should never be reached because the loop always
  // returns or throws, but guards against any future refactoring that disrupts that.
  throw lastErr || new Error('[System] Unexpected: all retries exhausted without a result or error.');
}

async function generatePosts(audioBuffer, { layoutExample }, refinementHint = null) {
  let systemInstruction;

  if (refinementHint) {
    systemInstruction = `You are an elite LinkedIn ghostwriter. The user wants to revise an existing post using voice instructions.

${refinementHint}

CRITICAL REVISION RULES:
1. STRICT FORMAT PRESERVATION: You MUST perfectly mirror the layout, paragraph spacing, line lengths, tone, and emoji usage of the [ORIGINAL POST CONTENT]. Do NOT restructure the post.
2. ACCURATE MODIFICATION: Listen to the audio and apply the specific changes from the [USER REFINEMENT INSTRUCTION] to the content.
3. OUTPUT: Generate 3 distinct variations of the revised post.
4. FORMAT: Return EXCLUSIVELY a raw JSON array of exactly 3 strings. No markdown code blocks, no extra text.
Example: ["Variation 1...", "Variation 2...", "Variation 3..."]`;
  } else {
    systemInstruction = `You are an elite, top 1% LinkedIn ghostwriter known for crafting high-converting viral posts. Your task is to analyze a raw spoken brain-dump and transform it into 3 distinct, ready-to-publish LinkedIn posts.

You will receive two variables from the user:
[EXEMPLAR_POST] - The master template to mimic.
[USER_BRAIN_DUMP] - The raw transcription containing the factual narrative.

### 🚨 THE CONTENT FIREWALL 🚨
You must strictly separate FORMATTING from CONTENT. 
1. **From the [EXEMPLAR_POST]**: Extract ONLY the structural DNA. This includes the paragraph spacing, sentence length rhythm, hook style, emoji frequency, formatting tricks (like bullet points or dashes), and the overall tone of voice (e.g., punchy, educational, or storytelling).
2. **From the [USER_BRAIN_DUMP]**: Extract 100% of the facts, narratives, opinions, topics, and subject matter.

CRITICAL CONSTRAINTS:
- YOU ARE STRICTLY FORBIDDEN from borrowing any subjects, facts, names, companies, stories, or events from the [EXEMPLAR_POST]. It is a structural blueprint ONLY.
- NEVER hallucinate or inject facts outside of what is provided in the [USER_BRAIN_DUMP].
- Do not use AI-sounding jargon (e.g., "delve", "unlock", "supercharge", "testament"). Sound human.
- Make sure to format emojis and spaces exactly as patterned in the [EXEMPLAR_POST].
- Ensure you output 3 different angles or variations of the same core story/facts.

### OUTPUT FORMAT
- NO titles, NO headers, NO introductory text.
- RETURN EXCLUSIVELY A RAW JSON ARRAY containing exactly 3 string elements representing the 3 generated posts.
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
        { text: refinementHint
            ? 'Generate 3 refined LinkedIn posts based on the audio and the original post.'
            : `[EXEMPLAR_POST]:\n"${layoutExample}"\n\n[USER_BRAIN_DUMP]: Listen to the attached audio.`
        },
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

[ORIGINAL POST CONTENT]:
"${postText}"

[USER REFINEMENT INSTRUCTION]: 
"${instructions}"

CRITICAL REVISION RULES:
1. STRICT FORMAT PRESERVATION (CRITICAL): You MUST perfectly mirror the layout, paragraph spacing, line lengths, tone, and emoji usage of the [ORIGINAL POST CONTENT]. Do NOT rewrite the entire post into a different format.
2. ACCURATE MODIFICATION: Apply the changes from the [USER REFINEMENT INSTRUCTION] aggressively to the content (change facts, add text, remove text as requested). If an instruction conflicts with the original, prioritize the instruction but KEEP the overall structure intact.
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
    // Strip any accidental markdown fences that some model configs emit
    const cleaned = rawText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const posts = JSON.parse(cleaned);
    if (!Array.isArray(posts) || posts.length < 3) {
      throw new Error(`Expected at least 3 posts, got ${Array.isArray(posts) ? posts.length : typeof posts}`);
    }
    return posts.slice(0, 3).map(p => (typeof p === 'string' ? p.trim() : JSON.stringify(p)));
  } catch (err) {
    console.error('[System] JSON parse failed. Raw:\n', rawText, '\nError:', err.message);
    throw new Error('[System] Could not parse the AI response. Please try again.');
  }
}

async function generateDummyPost(input, isVoice = false) {
  const systemInstruction = `You are an elite LinkedIn ghostwriter. The user has described their desired vibe for their posts.
Your task is to generate a single 250-word dummy LinkedIn post that perfectly captures this vibe, style, layout, and tone.
The topic can be a generic professional story or advice (e.g., a career learning or a milestone).
DO NOT include any markdown code blocks, titles, or headers. Return ONLY the raw post text formatted exactly how they want it.`;

  const contents = [{
    role: 'user',
    parts: isVoice
      ? [
          { inlineData: { mimeType: 'audio/ogg; codecs=opus', data: input.toString('base64') } },
          { text: 'Listen to my vibe description and generate the dummy post.' }
        ]
      : [{ text: `Vibe description: "${input}"\n\nGenerate the dummy post.` }]
  }];

  const result = await callGemini({
    model: MODEL,
    config: { systemInstruction },
    contents,
  });

  if (!result || !result.trim()) {
    throw new Error('[System] Received an empty response. Please try again.');
  }
  return result;
}

module.exports = { generatePosts, revisePosts, generateDummyPost };
