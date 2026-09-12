const OpenAI = require('openai');
const AppError = require('../utils/AppError');

/**
 * AI Service
 * Handles LLM interactions: founder brain-dump elaboration, post content generation
 * following the Hook -> Story/Value -> CTA structure, and selective post regeneration.
 */

/**
 * Helper to initialize and retrieve OpenAI client.
 * Validates API key at invocation time so the app boots cleanly even without keys.
 *
 * @returns {OpenAI}
 */
const getOpenAIClient = () => {
  const apiKey = process.env.AI_PROVIDER_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new AppError(
      'AI provider API key is missing. Please configure AI_PROVIDER_API_KEY in .env.',
      500
    );
  }

  return new OpenAI({ apiKey });
};

/**
 * Elaborates a raw founder brain-dump into a comprehensive multi-day content strategy
 * and recommends an optimal day count based on the supported substance.
 *
 * Infers implied thoughts and unsaid context from the founder's raw thoughts,
 * organizing them into distinct daily sub-topics with logical progression.
 *
 * @param {Object} intake - Prompt intake { theme, professionalLevel, tone, writingStyle, brainDump }
 * @returns {Promise<{ elaboratedStrategy: string, recommendedDayCount: number }>}
 */
const elaborateBrainDump = async (intake) => {
  if (!intake || !intake.brainDump) {
    throw new AppError('Intake brainDump is required for content elaboration.', 400);
  }

  const openai = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const systemPrompt = `You are an elite LinkedIn ghostwriter and content strategist for tech founders and executives.
Your mission is to take a founder's raw, unrefined weekly brain-dump and transform it into a structured multi-day LinkedIn content strategy.

Founders are often busy, informal, and leave critical context unstated. You must:
1. INFER GAPS: Unpack the unspoken implications, underlying motivations, tactical lessons, and industry context behind their notes.
2. DISSECT SUB-TOPICS: Break down the input into genuinely distinct, substantive sub-topics. Do NOT pad thin ideas into artificial days.
3. RECOMMEND DAY COUNT: Evaluate how many high-impact, non-repetitive posts this raw material genuinely supports:
   - Minimum: 3 days (if the brain dump is narrow or concise).
   - Standard: 5 to 7 days (if there is solid weekly substance).
   - Maximum: 10 days (if the brain dump covers multiple complex topics, lessons, or narratives).
   - NEVER default blindly to 7. Base it strictly on supported substance.
4. STRUCTURE EACH SUB-TOPIC: For every recommended day, establish:
   - Day number (1 to N)
   - Specific sub-topic theme & unique angle
   - Core insight / value lesson
   - Suggested hook angle (contrarian, observational, framework, story)
   - Call to Action (CTA) direction

You must output your response as valid JSON matching this schema:
{
  "recommendedDayCount": number,
  "substanceEvaluation": "brief explanation of why this day count was chosen based on the input depth",
  "strategyOverview": "executive narrative arc tying the week together",
  "days": [
    {
      "dayIndex": number,
      "subtopic": "title of the day's post focus",
      "angle": "specific angle or perspective",
      "coreInsight": "the main takeaway or value for the reader",
      "hookDirection": "suggested hook angle or question",
      "ctaDirection": "suggested call-to-action direction"
    }
  ]
}`;

  const userPrompt = `Intake Information:
- Theme / Primary Domain: ${intake.theme || 'Founder Journey & Growth'}
- Professional Level: ${intake.professionalLevel || 'Founder / Executive'}
- Desired Tone: ${intake.tone || 'Insightful, authentic, conversational'}
- Writing Style: ${intake.writingStyle || 'Punchy, spaced for readability, actionable'}

Raw Founder Brain-Dump:
"""
${intake.brainDump}
"""

Analyze the depth, determine the recommended day count, and build the elaborated strategy.`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const parsed = JSON.parse(response.choices[0].message.content);

    // Validate and clamp recommended day count between 3 and 10
    const rawDays = parsed.days && Array.isArray(parsed.days) ? parsed.days.length : 5;
    const countFromModel = typeof parsed.recommendedDayCount === 'number'
      ? parsed.recommendedDayCount
      : rawDays;
    const recommendedDayCount = Math.min(10, Math.max(3, countFromModel));

    // Format the elaborated strategy as structured, highly readable markdown for downstream generation
    const dailyBreakdown = (parsed.days || [])
      .map(
        (d) => `### Day ${d.dayIndex}: ${d.subtopic}
- **Angle:** ${d.angle}
- **Core Insight:** ${d.coreInsight}
- **Hook Direction:** ${d.hookDirection}
- **CTA Direction:** ${d.ctaDirection}`
      )
      .join('\n\n');

    const elaboratedStrategy = `# Content Strategy & Narrative Arc
**Theme:** ${intake.theme || 'Founder Growth'}
**Tone:** ${intake.tone || 'Insightful'} | **Style:** ${intake.writingStyle || 'Punchy'}
**Recommended Schedule:** ${recommendedDayCount} days (${parsed.substanceEvaluation || 'Based on input depth'})

## Strategic Overview
${parsed.strategyOverview || 'Multi-day thought leadership calendar.'}

## Daily Sub-topic Breakdown
${dailyBreakdown}
`;

    return {
      elaboratedStrategy,
      recommendedDayCount,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Failed to elaborate brain-dump: ${error.message || 'AI provider request failed'}`,
      error.status || 502
    );
  }
};

/**
 * Generates LinkedIn caption and up to 5 candidate hashtags for a specific day in a batch.
 *
 * Follows LinkedIn best practice:
 * - Magnetic Hook (first 1-2 lines, stops scrolling)
 * - Story / Value delivery (short paragraphs, spaced for mobile readability, zero fluff)
 * - Clear Call to Action (CTA) (engaging question or invitation to discuss)
 * - Up to 5 relevant hashtags (mix of broad & niche, no banned/spam tags)
 *
 * @param {string} elaboratedStrategy - Internal hidden strategy text
 * @param {number} dayIndex - 1-based index of the post within the batch
 * @param {number} totalDays - Total count of days in the batch
 * @returns {Promise<{ caption: string, hashtags: string[] }>}
 */
const generatePostContent = async (elaboratedStrategy, dayIndex, totalDays) => {
  if (!elaboratedStrategy) {
    throw new AppError('elaboratedStrategy is required to generate post content.', 400);
  }
  if (!dayIndex || dayIndex < 1) {
    throw new AppError('Valid dayIndex (>= 1) is required to generate post content.', 400);
  }

  const openai = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const systemPrompt = `You are a world-class LinkedIn ghostwriter specializing in viral yet high-credibility founder content.
Generate a complete, publishing-ready LinkedIn post for Day ${dayIndex} of a ${totalDays || 7}-day content series.

POST STRUCTURE RULES:
1. HOOK:
   - First 1-2 lines must instantly hook the reader before the "...see more" cutoff.
   - Use contrast, counter-intuitive insight, vulnerability, or a bold observation.
   - No generic openings like "I'm excited to announce" or "Have you ever thought about...".
2. STORY & VALUE DELIVERY:
   - Structure with generous white space (1-2 sentences per line/paragraph).
   - Use conversational, punchy syntax. Bullet points or numbered lists are welcome if applicable.
   - Deliver concrete, actionable value, founder realization, or framework.
3. CALL TO ACTION (CTA):
   - End with an authentic, specific question that invites founders, operators, or peers to comment.
   - Avoid generic "Thoughts?" or "Agree?".
4. HASHTAGS:
   - Provide an array of up to 5 hashtags tailored specifically to this post's topic.
   - Mix 1-2 broad hashtags (e.g. #Startups, #Entrepreneurship) with 2-3 niche tags (e.g. #Bootstrapping, #B2BSaaS).
   - Ensure every hashtag starts with "#".
   - Do NOT reuse the exact same 5 tags across every post in a batch.
   - Maximum 5 hashtags total.

Output your response strictly as JSON:
{
  "caption": "Full post text formatted with proper linebreaks and spacing",
  "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4"]
}`;

  const userPrompt = `Comprehensive Content Strategy:
"""
${elaboratedStrategy}
"""

Task:
Generate the LinkedIn post for Day ${dayIndex} of ${totalDays}. Ensure the content focuses specifically on the theme and angle planned for Day ${dayIndex}.`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.75,
    });

    const parsed = JSON.parse(response.choices[0].message.content);

    // Sanitize hashtags: ensure array of up to 5 strings starting with #
    let hashtags = [];
    if (Array.isArray(parsed.hashtags)) {
      hashtags = parsed.hashtags
        .filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
        .map((tag) => (tag.trim().startsWith('#') ? tag.trim() : `#${tag.trim()}`))
        .slice(0, 5);
    }

    const caption = typeof parsed.caption === 'string' ? parsed.caption.trim() : '';
    if (!caption) {
      throw new Error('AI returned an empty caption.');
    }

    return {
      caption,
      hashtags,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Failed to generate post content for day ${dayIndex}: ${error.message || 'AI request failed'}`,
      error.status || 502
    );
  }
};

/**
 * Selectively regenerates part or all of a post's content based on the target section.
 * Enforces an anti-duplication rule: receives existing content as "already tried"
 * to ensure the new generation explores a fresh angle.
 *
 * @param {Object} post - Current Post document (with caption and hashtags)
 * @param {('caption'|'hashtags'|'whole')} part - The section to regenerate
 * @returns {Promise<{ caption?: string, hashtags?: string[] }>}
 */
const regeneratePostContent = async (post, part) => {
  if (!post) {
    throw new AppError('Post object is required for regeneration.', 400);
  }

  // Check if caller attempted to pass 'image' to aiService
  if (part === 'image') {
    throw new AppError(
      'Image regeneration is handled by imageService, not aiService.',
      400
    );
  }

  const validParts = ['caption', 'hashtags', 'whole'];
  if (!validParts.includes(part)) {
    throw new AppError(
      `Invalid regeneration part '${part}'. Expected one of: ${validParts.join(', ')}.`,
      400
    );
  }

  const openai = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const systemPrompt = `You are a master LinkedIn content strategist.
The user wants to regenerate a portion of their LinkedIn post.
Crucial rule: You must produce something MEANINGFULLY DIFFERENT from the previous attempt — not a near-duplicate, minor rephrasing, or superficial edit.
- If regenerating 'caption' or 'whole': Choose a fresh hook mechanism, a contrasting emotional angle, or an alternate narrative framework (e.g. personal story vs tactical teardown vs contrarian opinion).
- If regenerating 'hashtags' or 'whole': Choose a fresh, highly targeted mix of up to 5 niche and industry hashtags.
- Ensure the caption follows: Hook -> Story/Value -> CTA.
- Maximum 5 hashtags, each starting with '#'.

Output strictly as JSON:
{
  "caption": "regenerated caption text (include if part is 'caption' or 'whole')",
  "hashtags": ["#Tag1", "#Tag2", "#Tag3"] (include if part is 'hashtags' or 'whole')
}`;

  const userPrompt = `Regeneration Target: '${part}'

Current Post Day Index: ${post.dayIndex || 'N/A'}
Previous Caption (DO NOT REPEAT THIS ANGLE):
"""
${post.caption || 'None'}
"""

Previous Hashtags:
${JSON.stringify(post.hashtags || [])}

Generate a completely refreshed ${part} with an alternative perspective and novel framing.`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.85, // Slightly higher temperature for meaningful diversity
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    const result = {};

    if (part === 'caption' || part === 'whole') {
      if (typeof parsed.caption === 'string' && parsed.caption.trim()) {
        result.caption = parsed.caption.trim();
      }
    }

    if (part === 'hashtags' || part === 'whole') {
      if (Array.isArray(parsed.hashtags)) {
        result.hashtags = parsed.hashtags
          .filter((t) => typeof t === 'string' && t.trim().length > 0)
          .map((t) => (t.trim().startsWith('#') ? t.trim() : `#${t.trim()}`))
          .slice(0, 5);
      }
    }

    return result;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Failed to regenerate post ${part}: ${error.message || 'AI request failed'}`,
      error.status || 502
    );
  }
};

module.exports = {
  elaborateBrainDump,
  generatePostContent,
  regeneratePostContent,
};
