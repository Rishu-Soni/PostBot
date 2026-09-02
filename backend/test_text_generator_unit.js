import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

import Journey from './src/models/Journey.js';
import DailyEntry from './src/models/DailyEntry.js';
import {
  formatHashtags,
  buildPrompt,
  cleanGeneratedText,
  generatePostText,
} from './src/services/textGenerator.js';
import {
  generateEntryText,
  getEntriesByJourney,
} from './src/controllers/entry.controller.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

function createMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

async function runTextGeneratorUnitTests() {
  console.log('--- STARTING UNIT & INTEGRATION TESTS FOR TEXT GENERATOR & GENERATE-TEXT ENDPOINT ---');

  // =============================================================
  // Suite 1: formatHashtags & buildPrompt & cleanGeneratedText Helpers
  // =============================================================
  console.log('\n[Suite 1] Helper functions (formatHashtags, buildPrompt, cleanGeneratedText)');

  // 1.1 formatHashtags with array
  {
    const tags = formatHashtags(['buildinpublic', '#indiehackers', 'saas']);
    assert(
      tags === '#buildinpublic #indiehackers #saas',
      'formatHashtags correctly normalizes array of strings with and without #'
    );
  }

  // 1.2 formatHashtags with comma/space delimited string
  {
    const tags = formatHashtags('buildinpublic, startup, #ai');
    assert(
      tags === '#buildinpublic #startup #ai',
      'formatHashtags correctly parses string with commas and whitespace'
    );
  }

  // 1.3 formatHashtags with null/undefined
  {
    assert(formatHashtags(null) === '', 'formatHashtags returns empty string for null');
    assert(formatHashtags(undefined) === '', 'formatHashtags returns empty string for undefined');
  }

  // 1.4 buildPrompt verifies inclusion of all fields & rules
  {
    const journey = {
      title: 'Building PostBot in 30 Days',
      hashtags: ['buildinpublic', 'automation'],
      template: '🚀 Day {{dayNumber}}: {{topic}}\n\nStruggle: {{challenge}}\nNotes: {{extraNotes}}\n\n{{hashtags}}',
    };
    const entry = {
      dayNumber: 3,
      topic: 'AI Prompt Engineering for LinkedIn',
      challenge: 'Avoiding cliché AI jargon and keeping tone punchy',
      extraNotes: 'Used Gemini 1.5 Flash for sub-second responses',
    };

    const prompt = buildPrompt(journey, entry);
    assert(prompt.includes('Building PostBot in 30 Days'), 'Prompt includes journey title');
    assert(prompt.includes('Day Number: 3'), 'Prompt includes entry dayNumber');
    assert(prompt.includes('AI Prompt Engineering for LinkedIn'), 'Prompt includes entry topic');
    assert(prompt.includes('Avoiding cliché AI jargon and keeping tone punchy'), 'Prompt includes entry challenge');
    assert(prompt.includes('Used Gemini 1.5 Flash for sub-second responses'), 'Prompt includes entry extraNotes');
    assert(prompt.includes('#buildinpublic #automation'), 'Prompt includes formatted hashtags');
    assert(prompt.includes('First person ("I", "me", "my")') || prompt.includes('first person'), 'Prompt instructs first person perspective');
    assert(prompt.includes('1300 characters'), 'Prompt enforces ~1300 char LinkedIn length constraint');
  }

  // 1.5 cleanGeneratedText stripping markdown fences and quotes
  {
    const fenced = '```markdown\n🚀 Day 1: Starting out!\n\nExcited to share progress.\n```';
    assert(cleanGeneratedText(fenced) === '🚀 Day 1: Starting out!\n\nExcited to share progress.', 'cleanGeneratedText strips markdown fences');

    const quoted = '"🚀 Day 2: Overcoming obstacles\n\nLearned a lot."';
    assert(cleanGeneratedText(quoted) === '🚀 Day 2: Overcoming obstacles\n\nLearned a lot.', 'cleanGeneratedText strips surrounding quotes');

    let threwEmpty = false;
    try {
      cleanGeneratedText('   ');
    } catch (e) {
      threwEmpty = true;
    }
    assert(threwEmpty, 'cleanGeneratedText throws error on empty/whitespace string');
  }

  // =============================================================
  // Suite 2: generatePostText Service with Mocked LLM API Calls
  // =============================================================
  console.log('\n[Suite 2] generatePostText service execution & error handling');

  const originalAxiosPost = axios.post;
  const originalEnv = { ...process.env };

  try {
    const journey = {
      title: 'Solopreneur SaaS Journey',
      hashtags: ['buildinpublic', 'saas'],
      template: 'Day {{day}}: {{topic}}\n\n{{challenge}}\n\n{{hashtags}}',
    };
    const entry = {
      dayNumber: 5,
      topic: 'Database Architecture',
      challenge: 'Multi-tenant schema design',
      extraNotes: 'Decided on single database with tenant IDs',
    };

    // 2.1 Throws error if no API key is set
    {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      let caughtErr = null;
      try {
        await generatePostText(journey, entry);
      } catch (err) {
        caughtErr = err;
      }
      assert(caughtErr !== null, 'Throws error if no LLM API key is present in process.env');
      assert(caughtErr?.message?.includes('LLM API key not configured'), 'Error clearly mentions missing LLM API key');
    }

    // 2.2 Calls Gemini API and extracts text successfully
    {
      process.env.GEMINI_API_KEY = 'test_gemini_key_123';
      let capturedUrl = '';
      let capturedPayload = null;

      axios.post = async (url, payload) => {
        capturedUrl = url;
        capturedPayload = payload;
        return {
          status: 200,
          data: {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: '🚀 Day 5: Multi-tenant database design!\n\nDesigning data schemas is always tricky when balancing speed and isolation.\n\n#buildinpublic #saas',
                    },
                  ],
                },
              },
            ],
          },
        };
      };

      const result = await generatePostText(journey, entry);
      assert(capturedUrl.includes('generativelanguage.googleapis.com'), 'Calls Google Gemini endpoint');
      assert(capturedUrl.includes('test_gemini_key_123'), 'Includes Gemini API key in request URL');
      assert(result.includes('Day 5: Multi-tenant database design!'), 'Extracts generated post text cleanly');
      assert(result.includes('#buildinpublic #saas'), 'Includes hashtags in response');
    }

    // 2.3 Throws clear error on Gemini API HTTP failure
    {
      process.env.GEMINI_API_KEY = 'test_gemini_key_123';
      axios.post = async () => {
        const error = new Error('Request failed with status code 400');
        error.response = {
          status: 400,
          data: {
            error: {
              message: 'API key not valid. Please pass a valid API key.',
            },
          },
        };
        throw error;
      };

      let caughtErr = null;
      try {
        await generatePostText(journey, entry);
      } catch (err) {
        caughtErr = err;
      }
      assert(caughtErr !== null, 'Throws error when Gemini API call fails');
      assert(caughtErr?.message?.includes('API key not valid'), 'Propagates clear API failure reason');
    }

    // 2.4 Throws error when Gemini returns empty candidates or text
    {
      process.env.GEMINI_API_KEY = 'test_gemini_key_123';
      axios.post = async () => ({
        status: 200,
        data: { candidates: [] },
      });

      let caughtErr = null;
      try {
        await generatePostText(journey, entry);
      } catch (err) {
        caughtErr = err;
      }
      assert(caughtErr !== null, 'Throws error when LLM API returns empty candidates');
      assert(caughtErr?.message?.includes('empty or invalid response'), 'Error describes empty response');
    }

    // 2.5 Calls OpenAI API when OPENAI_API_KEY is configured
    {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-test-openai-key';

      let capturedUrl = '';
      let capturedAuth = '';
      axios.post = async (url, payload, config) => {
        capturedUrl = url;
        capturedAuth = config?.headers?.Authorization;
        return {
          status: 200,
          data: {
            choices: [
              {
                message: {
                  content: '🚀 Day 5: Built on OpenAI model!\n\n#buildinpublic #saas',
                },
              },
            ],
          },
        };
      };

      const result = await generatePostText(journey, entry);
      assert(capturedUrl.includes('api.openai.com/v1/chat/completions'), 'Calls OpenAI chat completions endpoint');
      assert(capturedAuth === 'Bearer sk-test-openai-key', 'Passes OpenAI Bearer authorization');
      assert(result.includes('Built on OpenAI model!'), 'Extracts OpenAI generated content correctly');
    }
  } finally {
    axios.post = originalAxiosPost;
    process.env = originalEnv;
  }

  // =============================================================
  // Suite 3: POST /api/journeys/:journeyId/entries/:entryId/generate-text
  // =============================================================
  console.log('\n[Suite 3] POST /api/journeys/:journeyId/entries/:entryId/generate-text (generateEntryText controller)');

  const userA_id = new mongoose.Types.ObjectId().toString();
  const userB_id = new mongoose.Types.ObjectId().toString();

  const journeyA_id = new mongoose.Types.ObjectId().toString();
  const journeyB_id = new mongoose.Types.ObjectId().toString();

  const entry1_id = new mongoose.Types.ObjectId().toString();
  const entry2_id = new mongoose.Types.ObjectId().toString();
  const entryPosted_id = new mongoose.Types.ObjectId().toString();

  let mockJourneys = [
    {
      _id: new mongoose.Types.ObjectId(journeyA_id),
      userId: userA_id,
      title: 'Building PostBot 30 Days',
      hashtags: ['buildinpublic', 'saas'],
      template: '🔥 Day {{dayNumber}}: {{topic}}\n\nChallenge: {{challenge}}\nNotes: {{extraNotes}}\n\n{{hashtags}}',
      status: 'active',
    },
    {
      _id: new mongoose.Types.ObjectId(journeyB_id),
      userId: userB_id,
      title: 'User B Journey',
      hashtags: ['coding'],
      template: 'Day {{day}}: {{topic}}',
      status: 'active',
    },
  ];

  let mockEntries = [
    {
      _id: new mongoose.Types.ObjectId(entry1_id),
      journeyId: new mongoose.Types.ObjectId(journeyA_id),
      dayNumber: 1,
      scheduledDate: new Date('2026-09-01'),
      topic: 'Setting up Node.js Backend & MongoDB Models',
      challenge: 'Refining Mongoose schema relationships',
      extraNotes: 'Used modular routers',
      status: 'planned',
      generatedText: undefined,
    },
    {
      _id: new mongoose.Types.ObjectId(entry2_id),
      journeyId: new mongoose.Types.ObjectId(journeyA_id),
      dayNumber: 2,
      scheduledDate: new Date('2026-09-02'),
      topic: 'Implementing LinkedIn OAuth Flow',
      challenge: 'Handling token refresh exchange',
      extraNotes: 'AES encryption working smoothly',
      status: 'generated',
      generatedText: 'Old generated text',
    },
    {
      _id: new mongoose.Types.ObjectId(entryPosted_id),
      journeyId: new mongoose.Types.ObjectId(journeyA_id),
      dayNumber: 3,
      scheduledDate: new Date('2026-09-03'),
      topic: 'Publishing post to LinkedIn',
      challenge: 'None',
      extraNotes: 'Already live',
      status: 'posted',
      generatedText: 'Already published post text',
    },
  ];

  const origJourneyFindOne = Journey.findOne;
  const origEntryFindOne = DailyEntry.findOne;
  const origEntryFind = DailyEntry.find;
  const origAxiosPost = axios.post;

  Journey.findOne = async (filter = {}) => {
    const found = mockJourneys.find((j) => {
      if (filter._id && j._id.toString() !== filter._id.toString()) return false;
      if (filter.userId && j.userId.toString() !== filter.userId.toString()) return false;
      return true;
    });
    return found ? { ...found } : null;
  };

  DailyEntry.find = (filter = {}) => {
    return {
      sort: async (sortCriteria = {}) => {
        let results = mockEntries.filter((e) => {
          if (filter.journeyId && e.journeyId.toString() !== filter.journeyId.toString()) return false;
          return true;
        });
        if (sortCriteria.dayNumber === 1) {
          results = [...results].sort((a, b) => a.dayNumber - b.dayNumber);
        }
        return results;
      },
    };
  };

  DailyEntry.findOne = async (filter = {}) => {
    const found = mockEntries.find((e) => {
      if (filter._id && e._id.toString() !== filter._id.toString()) return false;
      if (filter.journeyId && e.journeyId.toString() !== filter.journeyId.toString()) return false;
      return true;
    });

    if (!found) return null;

    const entryDoc = new DailyEntry(found);
    entryDoc._id = found._id;
    entryDoc.save = async function () {
      const idx = mockEntries.findIndex((item) => item._id.toString() === entryDoc._id.toString());
      if (idx >= 0) {
        mockEntries[idx] = {
          ...mockEntries[idx],
          topic: this.topic,
          challenge: this.challenge,
          extraNotes: this.extraNotes,
          status: this.status,
          generatedText: this.generatedText,
          error: this.error,
          postedAt: this.postedAt,
        };
      }
      return entryDoc;
    };
    return entryDoc;
  };

  try {
    // 3.1 Invalid journeyId -> 404
    {
      const req = {
        userId: userA_id,
        params: { journeyId: 'invalid-id', entryId: entry1_id },
      };
      const res = createMockRes();
      await generateEntryText(req, res);
      assert(res.statusCode === 404, 'Returns 404 for invalid journeyId format');
      assert(res.body?.error === 'Journey not found', 'Journey not found error message');
    }

    // 3.2 User B cannot generate text for User A's journey -> 404 (ownership check)
    {
      const req = {
        userId: userB_id,
        params: { journeyId: journeyA_id, entryId: entry1_id },
      };
      const res = createMockRes();
      await generateEntryText(req, res);
      assert(res.statusCode === 404, 'User B cannot generate text for User A journey (404 ownership check)');
    }

    // 3.3 Invalid entryId -> 404
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id, entryId: 'nonexistent-entry-id' },
      };
      const res = createMockRes();
      await generateEntryText(req, res);
      assert(res.statusCode === 404, 'Returns 404 for invalid entryId format');
      assert(res.body?.error === 'Entry not found', 'Entry not found error message');
    }

    // 3.4 Nonexistent entry -> 404
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id, entryId: new mongoose.Types.ObjectId().toString() },
      };
      const res = createMockRes();
      await generateEntryText(req, res);
      assert(res.statusCode === 404, 'Returns 404 for nonexistent entry ID');
    }

    // 3.5 Rejects generating text for 'posted' entry -> 400
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id, entryId: entryPosted_id },
      };
      const res = createMockRes();
      await generateEntryText(req, res);
      assert(res.statusCode === 400, 'Rejects generating text for already posted entry (400)');
      assert(res.body?.error?.includes('already been posted'), 'Explains posted entries cannot be regenerated');
    }

    // 3.6 Handles LLM failure gracefully -> returns 500
    {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id, entryId: entry1_id },
      };
      const res = createMockRes();
      await generateEntryText(req, res);
      assert(res.statusCode === 500, 'Returns 500 if text generation fails');
      assert(res.body?.error?.includes('LLM API key not configured'), 'Returns clear failure message in response');
    }

    // 3.7 Successful text generation for planned entry:
    // Updates entry.generatedText, sets status to 'generated', returns updated entry
    {
      process.env.GEMINI_API_KEY = 'test_key_abc';
      axios.post = async () => ({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: `🔥 Day 1: Setting up Node.js Backend & MongoDB Models\n\nI spent today laying down the foundation for PostBot.\n\nChallenge: Refining Mongoose schema relationships to support flexible journeys without messy duplication.\n\nNotes: Used modular routers and clean service layers.\n\n#buildinpublic #saas`,
                  },
                ],
              },
            },
          ],
        },
      });

      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id, entryId: entry1_id },
      };
      const res = createMockRes();
      await generateEntryText(req, res);

      assert(res.statusCode === 200, 'Returns 200 on successful text generation');
      assert(res.body?.entry?.status === 'generated', 'Entry status updated to "generated"');
      assert(
        res.body?.entry?.generatedText?.includes('Day 1: Setting up Node.js Backend'),
        'Saves generated text to entry.generatedText'
      );

      // Verify the mock database was updated
      const updatedInDb = mockEntries.find((e) => e._id.toString() === entry1_id);
      assert(updatedInDb.status === 'generated', 'Database record has status="generated"');
      assert(
        updatedInDb.generatedText.includes('Setting up Node.js Backend'),
        'Database record has generatedText persisted'
      );
    }

    // 3.8 Verify visible via GET /api/journeys/:journeyId/entries
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id },
      };
      const res = createMockRes();
      await getEntriesByJourney(req, res);

      assert(res.statusCode === 200, 'GET /entries returns 200');
      const day1Entry = res.body?.entries?.find((e) => e.dayNumber === 1);
      assert(day1Entry !== undefined, 'Found Day 1 entry in list');
      assert(day1Entry?.status === 'generated', 'Day 1 entry shows status="generated" in list');
      assert(
        day1Entry?.generatedText?.includes('Setting up Node.js Backend'),
        'Day 1 entry shows generatedText in GET /entries response'
      );
    }

    // 3.9 Re-generating text on an already 'generated' entry is allowed
    {
      axios.post = async () => ({
        status: 200,
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: `🔥 Day 2: Re-generated LinkedIn OAuth post with extra punchiness!\n\n#buildinpublic #saas`,
                  },
                ],
              },
            },
          ],
        },
      });

      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id, entryId: entry2_id },
      };
      const res = createMockRes();
      await generateEntryText(req, res);

      assert(res.statusCode === 200, 'Re-generation on "generated" entry returns 200');
      assert(res.body?.entry?.status === 'generated', 'Entry remains in status "generated"');
      assert(
        res.body?.entry?.generatedText?.includes('Re-generated LinkedIn OAuth post'),
        'Entry generatedText was replaced with new version'
      );
    }
  } finally {
    Journey.findOne = origJourneyFindOne;
    DailyEntry.findOne = origEntryFindOne;
    DailyEntry.find = origEntryFind;
    axios.post = origAxiosPost;
    process.env = originalEnv;
  }

  console.log(`\n======================================================`);
  console.log(`TEXT GENERATOR TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log(`======================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTextGeneratorUnitTests().catch((err) => {
  console.error('Text generator test execution error:', err);
  process.exit(1);
});
