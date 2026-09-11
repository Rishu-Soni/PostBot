/**
 * AI Service Stub
 * Handles LLM interactions: brain dump elaboration, post content generation,
 * and selective regeneration.
 */

/**
 * Elaborates a raw founder brain-dump into a comprehensive multi-day content strategy
 * and recommends an optimal day count based on the supported substance.
 *
 * @param {Object} intake - Prompt intake { theme, professionalLevel, tone, writingStyle, brainDump }
 * @returns {Promise<{ elaboratedStrategy: string, recommendedDayCount: number }>}
 */
const elaborateBrainDump = async (intake) => {
  // TODO: implement with LLM provider (e.g., Gemini/Anthropic/OpenAI)
  throw new Error('Not implemented: aiService.elaborateBrainDump');
};

/**
 * Generates LinkedIn caption and up to 5 candidate hashtags for a specific day in a batch.
 *
 * @param {string} elaboratedStrategy - Internal hidden strategy text
 * @param {number} dayIndex - 1-based index of the post within the batch
 * @param {number} totalDays - Total count of days in the batch
 * @returns {Promise<{ caption: string, hashtags: string[] }>}
 */
const generatePostContent = async (elaboratedStrategy, dayIndex, totalDays) => {
  // TODO: implement post generation
  throw new Error('Not implemented: aiService.generatePostContent');
};

/**
 * Selectively regenerates part or all of a post's content based on the target section.
 *
 * @param {Object} post - Current Post Mongoose document
 * @param {('caption'|'hashtags'|'whole')} part - The section to regenerate
 * @returns {Promise<{ caption?: string, hashtags?: string[] }>}
 */
const regeneratePostContent = async (post, part) => {
  // TODO: implement selective post regeneration
  throw new Error('Not implemented: aiService.regeneratePostContent');
};

module.exports = {
  elaborateBrainDump,
  generatePostContent,
  regeneratePostContent,
};
