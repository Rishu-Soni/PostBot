import axios from 'axios';

/**
 * Normalizes hashtags from array or string into a formatted hashtag string.
 * e.g. ['buildinpublic', '#dev'] -> '#buildinpublic #dev'
 *
 * @param {string[]|string} hashtags
 * @returns {string}
 */
export const formatHashtags = (hashtags) => {
  if (!hashtags) return '';
  let tagsList = [];
  if (Array.isArray(hashtags)) {
    tagsList = hashtags;
  } else if (typeof hashtags === 'string') {
    tagsList = hashtags.split(/[\s,]+/);
  }

  return tagsList
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter((tag) => tag.length > 0)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
    .join(' ');
};

/**
 * Builds the LLM prompt combining journey template and daily entry context.
 *
 * @param {Object} journey - Journey mongoose document or plain object
 * @param {Object} entry - DailyEntry mongoose document or plain object
 * @returns {string} Formatted prompt string for the LLM
 */
export const buildPrompt = (journey = {}, entry = {}) => {
  const dayNumber = entry.dayNumber || 1;
  const journeyTitle = journey.title || 'My 30-Day Build';
  const topic = entry.topic || 'Daily progress update';
  const challenge = entry.challenge || 'None specified';
  const extraNotes = entry.extraNotes || 'None specified';
  const formattedHashtags = formatHashtags(journey.hashtags);
  const rawTemplate = journey.template || 'Day {{dayNumber}}: {{topic}}\n\nChallenge: {{challenge}}\n\nNotes: {{extraNotes}}\n\n{{hashtags}}';

  return `You are writing an authentic, engaging "building in public" post for LinkedIn.

Context for Today's Post:
- Journey Title / Goal: ${journeyTitle}
- Day Number: ${dayNumber}
- Topic for Today: ${topic}
- Challenge / Hurdle Faced: ${challenge}
- Key Takeaways / Extra Notes: ${extraNotes}
- Hashtags: ${formattedHashtags}

Journey Post Template / Structural Blueprint:
"""
${rawTemplate}
"""

Writing Rules & Constraints:
1. Perspective: Always write in the first person ("I", "me", "my").
2. Voice & Tone: Match the energetic, transparent, and reflective energy of a real founder/developer "building in public" on LinkedIn. Keep it authentic, practical, and conversational—avoid corporate buzzwords or generic AI fluff.
3. Template & Placeholders: Use the Journey Post Template as the structural blueprint. Seamlessly fill in its placeholders (like {{topic}}, {{challenge}}, {{extraNotes}}, {{day}}, {{dayNumber}}, {{title}}, {{hashtags}}) with the daily context provided.
4. Formatting: Use concise paragraphs, crisp line breaks, and bullet points where helpful to make it easy to skim on mobile devices.
5. Length: Keep the total post under ~1300 characters (LinkedIn's comfortable post length).
6. Closing: End the post naturally with the provided hashtags: ${formattedHashtags}.
7. Output: Output ONLY the plain text of the post. Do NOT include markdown code block formatting (no \`\`\`), no quotes surrounding the entire response, and no conversational preamble or outro (e.g. "Here is your post:").`;
};

/**
 * Cleans and validates raw LLM output text.
 *
 * @param {string} rawText
 * @returns {string} Cleaned plain text string
 */
export const cleanGeneratedText = (rawText) => {
  if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new Error('LLM API returned an empty or invalid response.');
  }

  let text = rawText.trim();

  // Strip wrapping markdown code blocks if model wrapped the output
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '').trim();
  }

  // Strip wrapping quotes if entire text is surrounded by double quotes
  if (text.startsWith('"') && text.endsWith('"') && text.length > 2) {
    text = text.slice(1, -1).trim();
  }

  if (text.length === 0) {
    throw new Error('LLM API returned empty content after parsing.');
  }

  return text;
};

/**
 * Generates LinkedIn post text by building a prompt and calling the configured LLM API.
 * Defaults to Google Gemini API (GEMINI_API_KEY / GOOGLE_API_KEY), with support for
 * OpenAI (OPENAI_API_KEY) and Anthropic (ANTHROPIC_API_KEY) if configured.
 *
 * @param {Object} journey - Journey document or object
 * @param {Object} entry - DailyEntry document or object
 * @returns {Promise<string>} Plain text generated LinkedIn post
 * @throws {Error} Clear error if generation fails or API returns empty response
 */
export const generatePostText = async (journey, entry) => {
  const prompt = buildPrompt(journey, entry);

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!geminiKey && !openAiKey && !anthropicKey) {
    throw new Error(
      'LLM API key not configured. Please set GEMINI_API_KEY (or OPENAI_API_KEY / ANTHROPIC_API_KEY) in process.env.'
    );
  }

  try {
    // 1. Google Gemini API (Primary)
    if (geminiKey) {
      const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

      const payload = {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
      };

      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return cleanGeneratedText(rawText);
    }

    // 2. OpenAI API
    if (openAiKey) {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      const url = 'https://api.openai.com/v1/chat/completions';

      const payload = {
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an authentic, energetic LinkedIn creator specializing in building in public.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      };

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        timeout: 30000,
      });

      const rawText = response.data?.choices?.[0]?.message?.content;
      return cleanGeneratedText(rawText);
    }

    // 3. Anthropic Claude API
    if (anthropicKey) {
      const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
      const url = 'https://api.anthropic.com/v1/messages';

      const payload = {
        model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      };

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: 30000,
      });

      const rawText = response.data?.content?.[0]?.text;
      return cleanGeneratedText(rawText);
    }
  } catch (error) {
    const apiError =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      error.message;

    throw new Error(`LLM generation failed: ${apiError}`);
  }
};

export default {
  buildPrompt,
  formatHashtags,
  cleanGeneratedText,
  generatePostText,
};
