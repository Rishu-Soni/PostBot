import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

import Journey from './src/models/Journey.js';
import DailyEntry from './src/models/DailyEntry.js';
import {
  buildImagePrompt,
  configureCloudinary,
  uploadToCloudinary,
  fetchImageFromPollinations,
  fetchImageFromStability,
  generatePostImage,
} from './src/services/imageGenerator.js';
import {
  generateEntryImage,
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

async function runImageGeneratorUnitTests() {
  console.log('--- STARTING UNIT & INTEGRATION TESTS FOR IMAGE GENERATOR & GENERATE-IMAGE ENDPOINT ---');

  // =============================================================
  // Suite 1: Helper functions (buildImagePrompt & configureCloudinary)
  // =============================================================
  console.log('\n[Suite 1] Helper functions (buildImagePrompt, configureCloudinary, uploadToCloudinary)');

  // 1.1 buildImagePrompt with custom imageStyle and entry topic
  {
    const journey = {
      imageStyle: 'Cyberpunk futuristic neon isometric 3D render, dark violet background',
    };
    const entry = {
      topic: 'Building an AI Agent in Node.js',
      challenge: 'Managing memory leaks in event loops',
      dayNumber: 4,
    };

    const prompt = buildImagePrompt(journey, entry);
    assert(prompt.includes('Building an AI Agent in Node.js'), 'Prompt includes entry topic');
    assert(
      prompt.includes('Cyberpunk futuristic neon isometric 3D render'),
      'Prompt includes journey imageStyle for visual consistency'
    );
    assert(
      prompt.includes('Managing memory leaks in event loops'),
      'Prompt includes entry challenge context'
    );
    assert(prompt.includes('no watermarks'), 'Prompt specifies negative constraints (no watermarks)');
  }

  // 1.2 buildImagePrompt with default style fallback
  {
    const journey = {};
    const entry = { topic: 'Launching on Product Hunt' };
    const prompt = buildImagePrompt(journey, entry);

    assert(prompt.includes('Launching on Product Hunt'), 'Prompt includes topic');
    assert(
      prompt.includes('Modern minimalist') || prompt.includes('illustration'),
      'Prompt provides high quality default style when journey.imageStyle is not provided'
    );
  }

  // 1.3 uploadToCloudinary returns null when Cloudinary not configured
  {
    const origCloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const origApiKey = process.env.CLOUDINARY_API_KEY;
    const origApiSecret = process.env.CLOUDINARY_API_SECRET;
    const origCloudUrl = process.env.CLOUDINARY_URL;

    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    delete process.env.CLOUDINARY_URL;

    const result = await uploadToCloudinary('https://example.com/image.png');
    assert(result === null, 'uploadToCloudinary returns null when credentials are not configured');

    process.env.CLOUDINARY_CLOUD_NAME = origCloudName;
    process.env.CLOUDINARY_API_KEY = origApiKey;
    process.env.CLOUDINARY_API_SECRET = origApiSecret;
    process.env.CLOUDINARY_URL = origCloudUrl;
  }

  // 1.4 uploadToCloudinary uploads and returns secure_url when configured
  {
    const origUpload = cloudinary.uploader.upload;
    process.env.CLOUDINARY_CLOUD_NAME = 'test_cloud';
    process.env.CLOUDINARY_API_KEY = 'test_key';
    process.env.CLOUDINARY_API_SECRET = 'test_secret';

    cloudinary.uploader.upload = async (source, opts) => {
      assert(opts.folder === 'postbot/journeys', 'Cloudinary upload targets postbot/journeys folder');
      return {
        secure_url: 'https://res.cloudinary.com/test_cloud/image/upload/v1234/postbot/journeys/sample.jpg',
      };
    };

    const uploadedUrl = await uploadToCloudinary('data:image/jpeg;base64,123456');
    assert(
      uploadedUrl === 'https://res.cloudinary.com/test_cloud/image/upload/v1234/postbot/journeys/sample.jpg',
      'uploadToCloudinary returns secure_url from Cloudinary'
    );

    cloudinary.uploader.upload = origUpload;
  }

  // =============================================================
  // Suite 2: generatePostImage Service Execution
  // =============================================================
  console.log('\n[Suite 2] generatePostImage service execution & fallback logic');

  const origAxiosGet = axios.get;
  const origAxiosPost = axios.post;

  try {
    const journey = {
      _id: new mongoose.Types.ObjectId(),
      imageStyle: 'Isometric 3D vector illustration',
    };
    const entry = {
      dayNumber: 1,
      topic: 'Setting up Node backend',
    };

    // 2.1 Pollinations generation returns public URL
    {
      delete process.env.STABILITY_API_KEY;
      delete process.env.CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_API_KEY;
      delete process.env.CLOUDINARY_API_SECRET;
      delete process.env.CLOUDINARY_URL;

      axios.get = async (url) => {
        assert(url.includes('image.pollinations.ai/prompt'), 'Calls Pollinations.ai prompt URL');
        return {
          status: 200,
          data: Buffer.from('mock_image_bytes'),
        };
      };

      const imageUrl = await generatePostImage(journey, entry);
      assert(
        imageUrl.startsWith('https://image.pollinations.ai/prompt/'),
        'generatePostImage returns valid Pollinations URL when Cloudinary not configured'
      );
    }

    // 2.2 Pollinations generation uploads to Cloudinary when configured
    {
      process.env.CLOUDINARY_CLOUD_NAME = 'demo_cloud';
      process.env.CLOUDINARY_API_KEY = 'demo_key';
      process.env.CLOUDINARY_API_SECRET = 'demo_secret';

      const origUpload = cloudinary.uploader.upload;
      cloudinary.uploader.upload = async () => ({
        secure_url: 'https://res.cloudinary.com/demo_cloud/image/upload/journey_post_1.jpg',
      });

      axios.get = async () => ({
        status: 200,
        data: Buffer.from('binary_image_data'),
      });

      const imageUrl = await generatePostImage(journey, entry);
      assert(
        imageUrl === 'https://res.cloudinary.com/demo_cloud/image/upload/journey_post_1.jpg',
        'generatePostImage returns Cloudinary hosted URL'
      );

      cloudinary.uploader.upload = origUpload;
    }

    // 2.3 Stability AI generation when configured
    {
      delete process.env.CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_API_KEY;
      delete process.env.CLOUDINARY_API_SECRET;
      process.env.IMAGE_PROVIDER = 'stability';
      process.env.STABILITY_API_KEY = 'sk-stability-test';

      axios.post = async (url, payload, config) => {
        assert(url.includes('api.stability.ai'), 'Calls Stability AI endpoint');
        assert(config.headers.Authorization === 'Bearer sk-stability-test', 'Passes Stability Bearer Auth');
        return {
          status: 200,
          data: {
            artifacts: [
              {
                base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
              },
            ],
          },
        };
      };

      const imageUrl = await generatePostImage(journey, entry);
      assert(imageUrl.startsWith('data:image/png;base64,'), 'Stability AI returns base64 image data URL');

      delete process.env.IMAGE_PROVIDER;
      delete process.env.STABILITY_API_KEY;
    }
  } finally {
    axios.get = origAxiosGet;
    axios.post = origAxiosPost;
  }

  // =============================================================
  // Suite 3: POST /api/journeys/:journeyId/entries/:entryId/generate-image
  // =============================================================
  console.log('\n[Suite 3] POST /api/journeys/:journeyId/entries/:entryId/generate-image (generateEntryImage controller)');

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
      imageStyle: 'Modern 3D isometric vector illustration',
      status: 'active',
    },
    {
      _id: new mongoose.Types.ObjectId(journeyB_id),
      userId: userB_id,
      title: 'User B Journey',
      imageStyle: 'Watercolor',
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
      challenge: 'Mongoose schema relationships',
      extraNotes: 'Used modular routers',
      status: 'planned',
      generatedText: 'Day 1 Post Text',
      generatedImageUrl: undefined,
    },
    {
      _id: new mongoose.Types.ObjectId(entry2_id),
      journeyId: new mongoose.Types.ObjectId(journeyA_id),
      dayNumber: 2,
      scheduledDate: new Date('2026-09-02'),
      topic: 'Implementing Image Generator & Cloudinary',
      challenge: 'Handling binary buffers and fallbacks',
      status: 'generated',
      generatedText: 'Day 2 Post Text',
      generatedImageUrl: 'https://example.com/old-image.jpg',
    },
    {
      _id: new mongoose.Types.ObjectId(entryPosted_id),
      journeyId: new mongoose.Types.ObjectId(journeyA_id),
      dayNumber: 3,
      scheduledDate: new Date('2026-09-03'),
      topic: 'Live on LinkedIn',
      status: 'posted',
      generatedText: 'Published post text',
      generatedImageUrl: 'https://example.com/published.jpg',
    },
  ];

  const origJourneyFindOne = Journey.findOne;
  const origEntryFindOne = DailyEntry.findOne;
  const origEntryFind = DailyEntry.find;

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
          generatedImageUrl: this.generatedImageUrl,
          error: this.error,
          postedAt: this.postedAt,
        };
      }
      return entryDoc;
    };
    return entryDoc;
  };

  try {
    // 3.1 Invalid journeyId format -> 404
    {
      const req = {
        userId: userA_id,
        params: { journeyId: 'invalid-id', entryId: entry1_id },
      };
      const res = createMockRes();
      await generateEntryImage(req, res);
      assert(res.statusCode === 404, 'Returns 404 for invalid journeyId format');
      assert(res.body?.error === 'Journey not found', 'Journey not found error message');
    }

    // 3.2 User B cannot generate image for User A's journey -> 404 (ownership check)
    {
      const req = {
        userId: userB_id,
        params: { journeyId: journeyA_id, entryId: entry1_id },
      };
      const res = createMockRes();
      await generateEntryImage(req, res);
      assert(res.statusCode === 404, 'User B cannot generate image for User A journey (404 ownership check)');
    }

    // 3.3 Invalid entryId format -> 404
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id, entryId: 'invalid-entry-id' },
      };
      const res = createMockRes();
      await generateEntryImage(req, res);
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
      await generateEntryImage(req, res);
      assert(res.statusCode === 404, 'Returns 404 for nonexistent entry ID');
    }

    // 3.5 Rejects generating image for 'posted' entry -> 400
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id, entryId: entryPosted_id },
      };
      const res = createMockRes();
      await generateEntryImage(req, res);
      assert(res.statusCode === 400, 'Rejects generating image for already posted entry (400)');
      assert(res.body?.error?.includes('already been posted'), 'Explains posted entries cannot be modified');
    }

    // 3.6 Successful image generation for planned entry:
    // Updates entry.generatedImageUrl, sets status to 'generated', returns updated entry
    {
      axios.get = async () => ({
        status: 200,
        data: Buffer.from('generated_image_bytes'),
      });

      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id, entryId: entry1_id },
      };
      const res = createMockRes();
      await generateEntryImage(req, res);

      assert(res.statusCode === 200, 'Returns 200 on successful image generation');
      assert(res.body?.entry?.status === 'generated', 'Entry status updated to "generated"');
      assert(
        Boolean(res.body?.entry?.generatedImageUrl),
        'Saves generated image URL to entry.generatedImageUrl'
      );

      // Verify DB persistence
      const updatedInDb = mockEntries.find((e) => e._id.toString() === entry1_id);
      assert(updatedInDb.status === 'generated', 'Database record status updated to "generated"');
      assert(
        Boolean(updatedInDb.generatedImageUrl),
        'Database record generatedImageUrl persisted'
      );
      assert(
        Boolean(updatedInDb.generatedText),
        'Database record now has both generatedText and generatedImageUrl (fully assembled!)'
      );
    }

    // 3.7 Verify assembled entry visible in GET /api/journeys/:journeyId/entries
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
      assert(Boolean(day1Entry?.generatedImageUrl), 'Day 1 entry includes generatedImageUrl');
      assert(Boolean(day1Entry?.generatedText), 'Day 1 entry includes generatedText');
    }

    // 3.8 Re-generating image on an already 'generated' entry is allowed
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id, entryId: entry2_id },
      };
      const res = createMockRes();
      await generateEntryImage(req, res);

      assert(res.statusCode === 200, 'Re-generation of image on "generated" entry returns 200');
      assert(res.body?.entry?.status === 'generated', 'Entry remains in status "generated"');
      assert(
        Boolean(res.body?.entry?.generatedImageUrl),
        'Entry generatedImageUrl updated with new image'
      );
    }
  } finally {
    Journey.findOne = origJourneyFindOne;
    DailyEntry.findOne = origEntryFindOne;
    DailyEntry.find = origEntryFind;
    axios.get = origAxiosGet;
  }

  console.log(`\n======================================================`);
  console.log(`IMAGE GENERATOR TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log(`======================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runImageGeneratorUnitTests().catch((err) => {
  console.error('Image generator test execution error:', err);
  process.exit(1);
});
