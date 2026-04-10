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

// Calls the Gemini API with a hard timeout and automatic retries for transient errors.
async function callGemini(payload, maxRetries = 3) {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`[System] Request timed out after ${TIMEOUT / 1000}s`)),
        TIMEOUT
      );
    });

    try {
      const result = await Promise.race([
        getGenAI().models.generateContent(payload),
        timeoutPromise,
      ]);
      const text = (result?.text ?? '').trim();
      if (!text) throw new Error('[System] Empty response from API. Please try again.');
      return text;
    } catch (err) {
      const errStr = String(err.status || err.message || err.toString());
      const is503 = errStr.includes('503') || errStr.includes('UNAVAILABLE');
      const is429 = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota');
      const is500 = errStr.includes('500') || errStr.includes('INTERNAL');

      // 503: Service Unavailable (High Demand), 429: Rate Limit, 500: Internal Error
      if ((is503 || is429 || is500) && attempt < maxRetries - 1) {
        attempt++;
        const backoffMs = attempt * 2000; // 2s, 4s...
        console.warn(`[System] Transient error detected (${is503 ? '503' : is429 ? '429' : '500'}). Retrying attempt ${attempt}/${maxRetries} in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      // If we exhaust retries or the error is unrecoverable, throw friendly message
      if (is503) {
        throw new Error('[System] The server is currently experiencing extremely high demand. Please wait a moment and try again.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
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
    const posts = JSON.parse(rawText);
    if (!Array.isArray(posts) || posts.length < 3) {
      throw new Error(`Expected at least 3 posts, got ${Array.isArray(posts) ? posts.length : typeof posts}`);
    }
    return posts.slice(0, 3).map(p => (typeof p === 'string' ? p.trim() : JSON.stringify(p)));
  } catch (err) {
    console.error('[System] JSON parse failed. Raw:\n', rawText, '\nError:', err.message);
    throw new Error('[System] Could not parse response as JSON. Please try again.');
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

  return await callGemini({
    model: MODEL,
    config: { systemInstruction },
    contents,
  });
}

module.exports = { generatePosts, revisePosts, generateDummyPost };
