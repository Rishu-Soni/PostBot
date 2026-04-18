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
const TIMEOUT = 180_000; // 180 s hard cap per attempt (supports ~2 min audio files)

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
async function callGemini(payload, maxRetries = 4) {
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
        // Exponential back-off: 4 s, 8 s, 16 s...
        const backoffMs = Math.pow(2, attempt + 1) * 1000;
        const kind = is503 ? '503' : is429 ? '429' : '500';
        console.warn(`[System] Transient error detected (${kind}). Retrying attempt ${attempt + 1}/${maxRetries} in ${backoffMs}ms...`);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }

      // All retries exhausted — log and convert to user-friendly message.
      // FIX: Removed double-escaped backslash (\\\\'s) that was producing a literal \' in the string.
      if (is503) throw new Error("[System] Google's AI servers are heavily overloaded by this request. Please try waiting a moment or trimming your input.");
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

async function generatePosts(inputData, { layoutExample }, refinementHint = null, isVoice = true) {
  let systemInstruction;

  if (refinementHint) {
    systemInstruction = `You are an elite LinkedIn ghostwriter. The user wants to revise an existing post.

${refinementHint}

CRITICAL REVISION RULES:
1. STRICT FORMAT PRESERVATION: You MUST perfectly mirror the layout, paragraph spacing, line lengths, tone, and emoji usage of the [ORIGINAL POST CONTENT]. Do NOT restructure the post.
2. ACCURATE MODIFICATION: Follow the specific instructions from the user to revise the content.
3. OUTPUT: Generate 3 distinct variations of the revised post.
4. FORMAT: Return EXCLUSIVELY a raw JSON array of exactly 3 strings. No markdown code blocks, no extra text.

🚨 LAYOUT PRESERVATION — CRITICAL:
You MUST use explicit newline characters (\\n) in the returned JSON strings to maintain all original paragraph breaks.
Do NOT flatten the post into a single wall of text. Each paragraph break in the original MUST appear as \\n\\n in the JSON string.

Example of correctly formatted output:
["Line 1 of post\\n\\nLine 2 of post\\n\\nLine 3 of post", "Variation 2 line 1\\n\\nVariation 2 line 2...", "Variation 3..."]`;
  } else {
    systemInstruction = `You are an elite, top 1% LinkedIn ghostwriter. Your job is to clone the WRITING STYLE of an example post and apply it to completely different content.

You will receive:
[EXEMPLAR_POST] — A post whose STYLE you must clone exactly.
[USER_BRAIN_DUMP] — The raw content that your new posts must be about.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧬 STEP 1 — EXTRACT THE STYLE DNA FROM [EXEMPLAR_POST]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before writing anything, silently analyse the [EXEMPLAR_POST] and extract every one of these style attributes:

- **Vocabulary register**: Are the words simple/conversational or sophisticated/formal? What is the average word complexity?
- **Professionalism level**: Is the tone casual, semi-professional, or corporate? Replicate that exact level.
- **Sentence length & rhythm**: Are sentences short and punchy? Long and flowing? A mix? Mirror the exact rhythm.
- **Hook style**: How does the post open? A question? A bold claim? A statistic? A personal story? Use the same hook type.
- **Paragraph structure**: How many lines per paragraph? Are there single-sentence punchy paragraphs or longer blocks? Replicate exactly.
- **Emoji usage**: How many emojis? Where are they placed (start, mid, end of line)? Are they decorative or functional? Mirror exactly — if there are none, use none.
- **Punctuation style**: Ellipses? Dashes? Exclamation marks? Copy the punctuation personality precisely.
- **Closing style**: Does the post end with a question, a CTA, hashtags, or a reflection? Use the same closing pattern.
- **Emotional register**: Is the writing vulnerable, authoritative, inspiring, analytical? Replicate that energy.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 STEP 2 — CONTENT FIREWALL (ABSOLUTE RULE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Extract ALL facts, stories, opinions, topics, and subject matter EXCLUSIVELY from [USER_BRAIN_DUMP].
- You are STRICTLY FORBIDDEN from using any topics, names, companies, events, opinions, or stories from [EXEMPLAR_POST].
- NEVER hallucinate or add facts not present in the [USER_BRAIN_DUMP].
- Do not use AI-sounding filler words (e.g., "delve", "unlock", "supercharge", "testament", "foster"). Sound like a real human wrote this.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✍️ STEP 3 — WRITE 3 VARIATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write 3 distinct LinkedIn posts. Each must:
- Use the SAME vocabulary register, professionalism, sentence rhythm, and emotional tone as [EXEMPLAR_POST].
- Be about ENTIRELY different angles of the [USER_BRAIN_DUMP] content.
- Feel like the same author wrote both the exemplar and the new posts.

🚨 LINE BREAK RULE — CRITICAL:
You MUST use explicit \\n characters inside the JSON strings to encode every line break and paragraph gap.
Each blank line between paragraphs = \\n\\n in the JSON string. A soft line break (same paragraph, new line) = \\n.
Do NOT output a flat wall of text. The vertical spacing MUST mirror the [EXEMPLAR_POST] exactly.

### OUTPUT FORMAT
- NO titles, NO headers, NO preamble.
- Return EXCLUSIVELY a raw JSON array of exactly 3 strings.
- Do not wrap in markdown code blocks. No extra text before or after.

Example of correct output format:
["Hook line\\n\\nSecond paragraph\\n\\nClosing CTA #hashtag", "Hook line variation 2\\n\\nParagraph 2...", "Hook line variation 3\\n\\nParagraph 2..."]`;
  }

  const parts = isVoice
    ? [
        { inlineData: { mimeType: 'audio/ogg; codecs=opus', data: inputData.toString('base64') } },
        { text: refinementHint
            ? 'Generate 3 refined LinkedIn posts based on the audio and the original post.'
            : `[EXEMPLAR_POST]:\n"${layoutExample}"\n\n[USER_BRAIN_DUMP]: Listen to the attached audio.`
        },
      ]
    : [
        { text: refinementHint
            ? `Generate 3 refined LinkedIn posts based on the text instructions and the original post. Instructions:\n"${inputData}"`
            : `[EXEMPLAR_POST]:\n"${layoutExample}"\n\n[USER_BRAIN_DUMP]:\n"${inputData}"`
        }
      ];

  const responseText = await callGemini({
    model: MODEL,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    contents: [{
      role: 'user',
      parts,
    }],
  });

  return parsePostsJson(responseText);
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

🚨 LAYOUT LOCK — CRITICAL:
You MUST use explicit newline characters (\\n) within the JSON strings to preserve the exact vertical white spacing and paragraph breaks of the [ORIGINAL POST CONTENT].
Do NOT return a solid block of text. Each paragraph break = \\n\\n in the JSON string.

Example of correctly formatted output:
["Revised line 1\\n\\nRevised paragraph 2\\n\\nClosing line", "Variation 2 line 1\\n\\nVariation 2 paragraph 2...", "Variation 3..."]`;

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
