const OpenAI = require('openai');
const AppError = require('../utils/AppError');

/**
 * AI Service
 * Handles LLM interactions: founder brain-dump elaboration, post content generation
 * following the Hook -> Story/Value -> CTA structure, and selective post regeneration.
 */

/**
 * Helper to initialize and retrieve OpenAI-compatible client.
 * Validates API key at invocation time so the app boots cleanly even without keys.
 * Supports OpenAI, Mistral AI, Groq, OpenRouter, and any OpenAI-compatible endpoint.
 *
 * @returns {OpenAI}
 */
const getOpenAIClient = () => {
  const apiKey = (process.env.AI_PROVIDER_API_KEY || process.env.OPENAI_API_KEY || '').trim();

  if (!apiKey) {
    throw new AppError(
      'AI provider API key is missing. Please configure AI_PROVIDER_API_KEY in .env.',
      500
    );
  }

  let baseURL = (
    process.env.AI_PROVIDER_BASE_URL ||
    process.env.AI_BASE_URL ||
    'https://generativelanguage.googleapis.com/v1beta/openai/'
  ).trim();

  // If using Google Gemini, route through its official OpenAI compatibility layer
  if (baseURL.includes('generativelanguage.googleapis.com')) {
    baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
  }

  return new OpenAI({
    apiKey,
    baseURL,
  });
};

/**
 * Resolves the appropriate model name based on provider and env configuration.
 * Automatically handles Gemini, Mistral, and other providers.
 *
 * @returns {string}
 */
const getModel = () => {
  const explicitModel = (process.env.AI_MODEL || process.env.OPENAI_MODEL || '').trim();
  if (explicitModel) {
    if (explicitModel === 'gemini-flash-latest' || explicitModel === 'gemini-2.5-flash') {
      return 'gemini-3.5-flash-lite';
    }
    return explicitModel;
  }

  const baseURL = (
    process.env.AI_PROVIDER_BASE_URL ||
    process.env.AI_BASE_URL ||
    ''
  ).trim();

  if (baseURL.includes('generativelanguage.googleapis.com')) {
    return 'gemini-3.5-flash-lite';
  }
  if (baseURL.includes('mistral.ai')) {
    return 'mistral-small-latest';
  }
  return 'gemini-3.5-flash-lite';
};

/**
 * Executes a chat completion with automatic fallback across models
 * if a provider quota (429 RESOURCE_EXHAUSTED) error is returned.
 *
 * @param {OpenAI} openai
 * @param {Object} params
 * @returns {Promise<Object>}
 */
const createChatCompletionWithFallback = async (openai, params) => {
  const primaryModel = params.model;
  const isGemini = (openai.baseURL || '').includes('generativelanguage.googleapis.com');

  const geminiFallbacks = ['gemini-3.5-flash-lite', 'gemini-2.5-flash'];
  const modelsToTry = isGemini
    ? [primaryModel, ...geminiFallbacks.filter((m) => m !== primaryModel)]
    : [primaryModel];

  let lastError;
  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i];
    try {
      return await openai.chat.completions.create({
        ...params,
        model: currentModel,
      });
    } catch (err) {
      lastError = err;
      const isQuotaOrRateLimit =
        err.status === 429 ||
        (err.message && (err.message.includes('quota') || err.message.includes('RESOURCE_EXHAUSTED')));

      if (isQuotaOrRateLimit && i < modelsToTry.length - 1) {
        console.warn(
          `[AI Service] Quota limit reached on '${currentModel}'. Retrying with fallback model '${modelsToTry[i + 1]}' (attempt ${i + 1}/${modelsToTry.length})...`
        );
        continue;
      }
      break;
    }
  }

  if (
    lastError?.status === 429 ||
    (lastError?.message && (lastError.message.includes('quota') || lastError.message.includes('RESOURCE_EXHAUSTED')))
  ) {
    throw new AppError(
      'AI request quota exceeded on Gemini Free Tier. Please update AI_PROVIDER_API_KEY in backend/.env or wait until quota resets at midnight Pacific Time.',
      429
    );
  }

  throw lastError;
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
  const model = getModel();
  console.log(`[AI Service] Elaborating brain-dump via endpoint: ${openai.baseURL} (model: ${model})`);

  const voiceDNA = intake.voiceDNA || {};
  const layoutTemplates = Array.isArray(intake.layoutTemplates) && intake.layoutTemplates.length > 0
    ? intake.layoutTemplates
    : [
        { id: 'metric-teardown', name: 'The Metric Teardown', skeleton: '[1-line metric hook] -> [The bottleneck] -> [3 bullet fixes] -> [Result + takeaway]' },
        { id: 'contrarian-rant', name: 'The Contrarian Rant', skeleton: '[Unpopular opinion hook] -> [Why common advice fails] -> [What actually works] -> [1-line mic drop]' },
        { id: 'founder-micro-story', name: 'The Founder Micro-Story', skeleton: '[Specific moment in time] -> [The conflict/mistake] -> [The pivot] -> [Lesson learned]' },
        { id: 'tactical-framework', name: 'The Tactical Framework', skeleton: '[Big promise hook] -> [Numbered step-by-step breakdown] -> [Save/Bookmark CTA]' },
      ];

  const templatesCatalogue = layoutTemplates
    .map((t) => `- ID: "${t.id}" | Name: "${t.name}" | Skeleton: ${t.skeleton}${t.referenceSample ? ' | (Cloned custom reference style)' : ''}`)
    .join('\n');

  const systemPrompt = `You are an elite LinkedIn ghostwriter and content strategist for tech founders and executives.
Your mission is to take a founder's raw, unrefined weekly brain-dump, their optional weekly goal, their Voice DNA, and available layout templates, and build a structured multi-day LinkedIn content strategy.

FOUNDER CONTENT STRATEGY PRINCIPLES:
1. AUTO-EXTRACT WEEKLY THEME: Do not force a generic label. Synthesize a sharp, compelling overarching weekly focus from their raw notes.
2. INFER GAPS: Unpack the unspoken implications, underlying motivations, tactical lessons, and industry context behind their notes.
3. DISSECT SUB-TOPICS: Break down the input into genuinely distinct, substantive sub-topics. Do NOT pad thin ideas into artificial days.
4. RECOMMEND DAY COUNT: Evaluate how many high-impact, non-repetitive posts this raw material genuinely supports:
   - Minimum: 1 day (if the brain dump is narrow or concise).
   - Standard: 5 to 7 days (if there is solid weekly substance).
   - Maximum: 10 days (if the brain dump covers multiple complex topics, lessons, or narratives).
   - NEVER default blindly to 7. Base it strictly on supported substance.
5. AUTO-MATCH LAYOUT SKELETONS: For each recommended day, examine its core substance and match it to the best available layout template from the catalog:
   - Stories with dropoffs, metrics, MRR, or conversion rates -> The Metric Teardown
   - Hot takes, industry myths, or strong opinions -> The Contrarian Rant
   - Personal founder struggles, bugs, or pivots -> The Founder Micro-Story
   - Step-by-step guides, systems, or tactical playbooks -> The Tactical Framework
   - Or any matching custom cloned template.

You must output your response as valid JSON matching this schema:
{
  "extractedTheme": "A concise, high-impact weekly theme title synthesized from the brain-dump",
  "recommendedDayCount": number,
  "substanceEvaluation": "brief explanation of why this day count was chosen based on the input depth",
  "strategyOverview": "executive narrative arc tying the week together",
  "days": [
    {
      "dayIndex": number,
      "subtopic": "title of the day's post focus",
      "angle": "specific angle or perspective",
      "hookPreview": "magnetic 1-2 line opening hook preview",
      "matchedTemplateId": "template ID from the provided catalog",
      "matchedTemplateName": "exact template name",
      "tone": "Direct & Contrarian | Actionable Teardown | Personal Story | Deep-Dive Case Study",
      "coreInsight": "the main takeaway or value for the reader",
      "ctaDirection": "suggested call-to-action direction"
    }
  ]
}`;

  const antiRulesList = Array.isArray(voiceDNA.antiRules) ? voiceDNA.antiRules.join('; ') : 'No generic AI openings, no hashtag spam';

  const userPrompt = `Intake & Writing Profile:
- Role / Identity: ${voiceDNA.role || intake.professionalLevel || 'Senior Founder / CEO'}
- Target Reader / Audience: ${voiceDNA.targetAudience || 'B2B SaaS Founders, Operators, Tech Leaders'}
- Base Voice Tone: ${voiceDNA.baseTone || intake.tone || 'Direct & Contrarian'}
- Anti-Cringe Guardrails: ${antiRulesList}${voiceDNA.customAntiRule ? `; ${voiceDNA.customAntiRule}` : ''}
${intake.weeklyGoal ? `- Founder Weekly Goal / Plug: ${intake.weeklyGoal}` : ''}

Available Layout Templates:
${templatesCatalogue}

Raw Founder Brain-Dump:
"""
${intake.brainDump}
"""

Analyze the depth, extract the theme, match the optimal layout skeleton for each post, and return the strategy JSON.`;

  try {
    const response = await createChatCompletionWithFallback(openai, {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const parsed = JSON.parse(response.choices[0].message.content);

    // Validate and clamp recommended day count between 1 and 10
    const rawDays = parsed.days && Array.isArray(parsed.days) ? parsed.days.length : 5;
    const countFromModel = typeof parsed.recommendedDayCount === 'number'
      ? parsed.recommendedDayCount
      : rawDays;
    const recommendedDayCount = Math.min(10, Math.max(1, countFromModel));

    // Build structured per-post strategy array
    const postsStrategy = (parsed.days || []).map((d, idx) => {
      const dayNum = d.dayIndex || idx + 1;
      const matched = layoutTemplates.find((t) => t.id === d.matchedTemplateId) || layoutTemplates[0];
      return {
        dayIndex: dayNum,
        subtopic: d.subtopic || `Day ${dayNum} Focus`,
        angle: d.angle || 'Tactical insight',
        hookPreview: d.hookPreview || `Day ${dayNum} hook...`,
        matchedTemplateId: matched?.id || 'metric-teardown',
        matchedTemplateName: matched?.name || d.matchedTemplateName || 'The Metric Teardown',
        tone: d.tone || voiceDNA.baseTone || intake.tone || 'Direct & Contrarian',
        coreInsight: d.coreInsight || '',
        ctaDirection: d.ctaDirection || '',
      };
    });

    // Format the elaborated strategy as structured markdown
    const dailyBreakdown = postsStrategy
      .map(
        (d) => `### Day ${d.dayIndex}: ${d.subtopic}
- **Angle:** ${d.angle}
- **Hook Preview:** ${d.hookPreview}
- **Assigned Layout Template:** ${d.matchedTemplateName} (${d.matchedTemplateId})
- **Tone:** ${d.tone}
- **Core Insight:** ${d.coreInsight}
- **CTA Direction:** ${d.ctaDirection}`
      )
      .join('\n\n');

    const extractedTheme = parsed.extractedTheme || intake.theme || 'Weekly Founder Insights';
    const strategyOverview = parsed.strategyOverview || 'Multi-day thought leadership calendar.';

    const elaboratedStrategy = `# Content Strategy & Narrative Arc
**Theme:** ${extractedTheme}
**Base Tone:** ${voiceDNA.baseTone || intake.tone || 'Direct & Contrarian'}
**Recommended Schedule:** ${recommendedDayCount} days (${parsed.substanceEvaluation || 'Based on input depth'})
${intake.weeklyGoal ? `**Weekly Goal/Plug:** ${intake.weeklyGoal}\n` : ''}
## Strategic Overview
${strategyOverview}

## Daily Sub-topic Breakdown
${dailyBreakdown}
`;

    return {
      elaboratedStrategy,
      recommendedDayCount,
      extractedTheme,
      strategyOverview,
      postsStrategy,
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
 * Generates LinkedIn caption and up to 5 candidate hashtags for a specific day in a batch,
 * tailored to the selected layout template skeleton and post-specific tone override.
 *
 * @param {string} elaboratedStrategy - Internal hidden strategy text
 * @param {number} dayIndex - 1-based index of the post within the batch
 * @param {number} totalDays - Total count of days in the batch
 * @param {Object} [postConfig] - Optional per-post configuration { angle, hookPreview, layoutTemplate, tone, voiceDNA }
 * @returns {Promise<{ caption: string, hashtags: string[] }>}
 */
const generatePostContent = async (elaboratedStrategy, dayIndex, totalDays, postConfig = {}) => {
  if (!elaboratedStrategy) {
    throw new AppError('elaboratedStrategy is required to generate post content.', 400);
  }
  if (!dayIndex || dayIndex < 1) {
    throw new AppError('Valid dayIndex (>= 1) is required to generate post content.', 400);
  }

  const openai = getOpenAIClient();
  const model = getModel();
  console.log(`[AI Service] Generating post day ${dayIndex}/${totalDays} via endpoint: ${openai.baseURL} (model: ${model})`);

  const assignedTemplate = postConfig.layoutTemplate || postConfig.matchedTemplateName || 'High-Impact LinkedIn Layout';
  const assignedTone = postConfig.tone || 'Direct & Contrarian';
  const voiceDNA = postConfig.voiceDNA || {};
  const antiRules = Array.isArray(voiceDNA.antiRules) ? [...voiceDNA.antiRules] : [];
  if (voiceDNA.customAntiRule) antiRules.push(voiceDNA.customAntiRule);

  let templateGuidance = '';
  if (typeof postConfig.layoutTemplate === 'object' && postConfig.layoutTemplate.skeleton) {
    templateGuidance = `MANDATORY STRUCTURAL SKELETON:
Follow this exact structural flow:
${postConfig.layoutTemplate.skeleton}`;
    if (postConfig.layoutTemplate.referenceSample) {
      templateGuidance += `\nCLONED REFERENCE STYLE (Replicate line breaks, rhythm, and sentence length without copying the topic):\n"""\n${postConfig.layoutTemplate.referenceSample}\n"""`;
    }
  } else if (typeof postConfig.layoutTemplate === 'string') {
    templateGuidance = `STRUCTURAL FORMAT:
Adopt the layout pattern corresponding to: ${postConfig.layoutTemplate}`;
  }

  const systemPrompt = `You are a world-class LinkedIn ghostwriter specializing in viral yet high-credibility founder content.
Generate a complete, publishing-ready LinkedIn post for Day ${dayIndex} of a ${totalDays || 7}-day content series.

POST TONE & STYLE:
- Tone Override for this post: ${assignedTone}
- Role / Author Persona: ${voiceDNA.role || 'Senior Founder / CEO'}
- Target Reader Audience: ${voiceDNA.targetAudience || 'B2B SaaS Founders, Operators, Tech Leaders'}

${templateGuidance ? `${templateGuidance}\n` : ''}
POST STRUCTURE RULES:
1. HOOK:
   - First 1-2 lines must instantly hook the reader before the "...see more" cutoff.
   - Use contrast, counter-intuitive insight, vulnerability, or a bold observation.
   ${postConfig.hookPreview ? `- Build upon or refine this preferred hook angle: "${postConfig.hookPreview}"` : ''}
   - No generic openings like "I'm excited to announce" or "Have you ever thought about...".
2. STORY & VALUE DELIVERY:
   - Structure with generous white space (1-2 sentences per line/paragraph max).
   - Use conversational, punchy syntax. Bullet points or numbered lists are welcome where appropriate.
   - Deliver concrete, actionable value, founder realization, or framework.
3. CALL TO ACTION (CTA):
   - End with an authentic, specific question that invites peers to engage or share their experience.
   - Avoid generic "Thoughts?" or "Agree?".
4. ANTI-CRINGE GUARDRAILS (STRICT):
${antiRules.map((r) => `   - ${r}`).join('\n')}
5. HASHTAGS:
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

Task for Day ${dayIndex}:
- Assigned Angle: ${postConfig.angle || 'Follow strategy arc for Day ' + dayIndex}
- Assigned Layout: ${typeof assignedTemplate === 'string' ? assignedTemplate : assignedTemplate?.name || 'Assigned Template'}
- Target Tone: ${assignedTone}
${postConfig.hookPreview ? `- Preferred Hook Direction: "${postConfig.hookPreview}"` : ''}

Generate the complete LinkedIn post matching these exact requirements.`;

  try {
    const response = await createChatCompletionWithFallback(openai, {
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
  const model = getModel();
  console.log(`[AI Service] Regenerating post section '${part}' via endpoint: ${openai.baseURL} (model: ${model})`);

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
    const response = await createChatCompletionWithFallback(openai, {
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
