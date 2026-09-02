import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

import Journey from './src/models/Journey.js';
import {
  createJourney,
  getJourneys,
  getJourneyById,
  updateJourney,
  updateJourneyStatus,
} from './src/controllers/journey.controller.js';
import journeyRouter from './src/routes/journey.routes.js';
import app from './src/app.js';

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

// Mock response creator
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

async function runJourneyUnitTests() {
  console.log('--- STARTING UNIT & INTEGRATION TESTS FOR JOURNEY REST API ---');

  const secret = process.env.JWT_SECRET || 'postbot_jwt_secret_dev_key_2026_secure';
  const userA_id = new mongoose.Types.ObjectId().toString();
  const userB_id = new mongoose.Types.ObjectId().toString();

  // In-memory mock journey store for testing
  let mockJourneys = [];

  const originalFind = Journey.find;
  const originalFindOne = Journey.findOne;
  const originalSave = Journey.prototype.save;

  // Mock save implementation
  Journey.prototype.save = async function () {
    if (!this._id) {
      this._id = new mongoose.Types.ObjectId();
    }
    const idx = mockJourneys.findIndex((j) => j._id.toString() === this._id.toString());
    const docData = {
      _id: this._id,
      userId: this.userId,
      title: this.title,
      hashtags: this.hashtags || [],
      template: this.template,
      startDate: this.startDate,
      currentDay: this.currentDay ?? 0,
      status: this.status || 'active',
      postTimeLocal: this.postTimeLocal || '09:00',
      imageStyle: this.imageStyle,
      save: this.save,
    };
    if (idx >= 0) {
      mockJourneys[idx] = { ...mockJourneys[idx], ...docData };
    } else {
      mockJourneys.push(docData);
    }
    return this;
  };

  // Mock find implementation
  Journey.find = (filter = {}) => {
    return {
      sort: async () => {
        return mockJourneys.filter((j) => {
          if (filter.userId && j.userId.toString() !== filter.userId.toString()) return false;
          return true;
        });
      },
    };
  };

  // Mock findOne implementation
  Journey.findOne = async (filter = {}) => {
    const found = mockJourneys.find((j) => {
      if (filter._id && j._id.toString() !== filter._id.toString()) return false;
      if (filter.userId && j.userId.toString() !== filter.userId.toString()) return false;
      return true;
    });

    if (!found) return null;

    // Return object with save method for updates
    const doc = new Journey(found);
    doc._id = found._id;
    doc.save = async function () {
      const idx = mockJourneys.findIndex((item) => item._id.toString() === doc._id.toString());
      if (idx >= 0) {
        mockJourneys[idx] = {
          ...mockJourneys[idx],
          title: this.title,
          hashtags: this.hashtags,
          template: this.template,
          startDate: this.startDate,
          currentDay: this.currentDay,
          status: this.status,
          postTimeLocal: this.postTimeLocal,
          imageStyle: this.imageStyle,
        };
      }
      return doc;
    };
    return doc;
  };

  try {
    // -------------------------------------------------------------
    // Test Suite 1: POST /api/journeys Validation & Creation
    // -------------------------------------------------------------
    console.log('\n[Suite 1] POST /api/journeys (createJourney)');

    // 1.1 Missing title
    {
      const req = {
        userId: userA_id,
        body: {
          template: 'Day 1: {{topic}}',
        },
      };
      const res = createMockRes();
      await createJourney(req, res);
      assert(res.statusCode === 400, 'Rejects creation when title is missing (400)');
      assert(res.body?.error?.includes('Title is required'), 'Returns title required error message');
    }

    // 1.2 Missing template
    {
      const req = {
        userId: userA_id,
        body: {
          title: '30 Days of Rust',
        },
      };
      const res = createMockRes();
      await createJourney(req, res);
      assert(res.statusCode === 400, 'Rejects creation when template is missing (400)');
      assert(res.body?.error?.includes('Template is required'), 'Returns template required error message');
    }

    // 1.3 Template missing {{topic}} placeholder
    {
      const req = {
        userId: userA_id,
        body: {
          title: '30 Days of Rust',
          template: 'Today I learned something cool without placeholder!',
        },
      };
      const res = createMockRes();
      await createJourney(req, res);
      assert(res.statusCode === 400, 'Rejects template missing {{topic}} placeholder (400)');
      assert(
        res.body?.error?.includes('{{topic}}'),
        'Returns error explaining {{topic}} placeholder is required'
      );
    }

    // 1.4 Successful creation with full payload
    let createdJourneyUserA = null;
    {
      const req = {
        userId: userA_id,
        body: {
          title: '30 Days of Web3 & Rust',
          hashtags: ['#rust', 'web3', '#coding'],
          template: 'Day {{day}}: {{topic}}\nKey takeaways: {{takeaways}}\n#buildinpublic',
          startDate: '2026-09-01T00:00:00.000Z',
          postTimeLocal: '10:30',
          imageStyle: 'cyberpunk-neon',
        },
      };
      const res = createMockRes();
      await createJourney(req, res);
      assert(res.statusCode === 201, 'Successfully creates journey (201)');
      assert(res.body?.journey?.title === '30 Days of Web3 & Rust', 'Saves correct title');
      assert(res.body?.journey?.userId.toString() === userA_id, 'Scopes journey to req.userId');
      assert(res.body?.journey?.status === 'active', 'Defaults status to active');
      assert(res.body?.journey?.currentDay === 0, 'Defaults currentDay to 0');
      assert(res.body?.journey?.postTimeLocal === '10:30', 'Saves custom postTimeLocal');
      assert(res.body?.journey?.imageStyle === 'cyberpunk-neon', 'Saves imageStyle');
      assert(
        Array.isArray(res.body?.journey?.hashtags) && res.body?.journey?.hashtags.length === 3,
        'Normalizes hashtags array'
      );
      createdJourneyUserA = res.body?.journey;
    }

    // 1.5 Successful creation with minimal payload & string hashtags
    {
      const req = {
        userId: userA_id,
        body: {
          title: 'Minimal Journey',
          template: 'Exploring {{topic}} today!',
          hashtags: 'ai, machinelearning, tech',
        },
      };
      const res = createMockRes();
      await createJourney(req, res);
      assert(res.statusCode === 201, 'Creates journey with minimal body and string hashtags (201)');
      assert(res.body?.journey?.postTimeLocal === '09:00', 'Defaults postTimeLocal to 09:00');
      assert(
        JSON.stringify(res.body?.journey?.hashtags) === JSON.stringify(['ai', 'machinelearning', 'tech']),
        'Normalizes comma-separated hashtags string into array'
      );
    }

    // 1.6 User B creates a journey
    let createdJourneyUserB = null;
    {
      const req = {
        userId: userB_id,
        body: {
          title: 'User B Journey',
          template: 'Day topic: {{topic}}',
        },
      };
      const res = createMockRes();
      await createJourney(req, res);
      assert(res.statusCode === 201, 'User B can create their own journey (201)');
      createdJourneyUserB = res.body?.journey;
    }

    // -------------------------------------------------------------
    // Test Suite 2: GET /api/journeys (List Scoping)
    // -------------------------------------------------------------
    console.log('\n[Suite 2] GET /api/journeys (getJourneys)');

    // 2.1 User A list
    {
      const req = { userId: userA_id };
      const res = createMockRes();
      await getJourneys(req, res);
      assert(res.statusCode === 200, 'Returns 200 on getJourneys');
      assert(Array.isArray(res.body?.journeys), 'Returns journeys array');
      assert(res.body.journeys.length === 2, 'User A sees only their 2 journeys');
      assert(
        res.body.journeys.every((j) => j.userId.toString() === userA_id),
        'All returned journeys belong strictly to User A'
      );
    }

    // 2.2 User B list
    {
      const req = { userId: userB_id };
      const res = createMockRes();
      await getJourneys(req, res);
      assert(res.statusCode === 200, 'Returns 200 on getJourneys for User B');
      assert(res.body.journeys.length === 1, 'User B sees only their 1 journey');
      assert(res.body.journeys[0].userId.toString() === userB_id, 'Returned journey belongs strictly to User B');
    }

    // -------------------------------------------------------------
    // Test Suite 3: GET /api/journeys/:id (Single Journey & Isolation)
    // -------------------------------------------------------------
    console.log('\n[Suite 3] GET /api/journeys/:id (getJourneyById)');

    // 3.1 Invalid ObjectId
    {
      const req = { userId: userA_id, params: { id: 'invalid-id-format' } };
      const res = createMockRes();
      await getJourneyById(req, res);
      assert(res.statusCode === 404, 'Returns 404 on malformed ObjectId');
      assert(res.body?.error === 'Journey not found', 'Returns standard not found error');
    }

    // 3.2 Non-existent ID
    {
      const randomId = new mongoose.Types.ObjectId().toString();
      const req = { userId: userA_id, params: { id: randomId } };
      const res = createMockRes();
      await getJourneyById(req, res);
      assert(res.statusCode === 404, 'Returns 404 for non-existent journey ID');
    }

    // 3.3 User A gets own journey
    {
      const req = { userId: userA_id, params: { id: createdJourneyUserA._id.toString() } };
      const res = createMockRes();
      await getJourneyById(req, res);
      assert(res.statusCode === 200, 'User A successfully retrieves own journey (200)');
      assert(res.body?.journey?._id.toString() === createdJourneyUserA._id.toString(), 'Returns matching journey');
    }

    // 3.4 User B tries to read User A's journey -> 404 (NEVER leak another user's journey)
    {
      const req = { userId: userB_id, params: { id: createdJourneyUserA._id.toString() } };
      const res = createMockRes();
      await getJourneyById(req, res);
      assert(res.statusCode === 404, 'User B receives 404 when requesting User A journey');
      assert(res.body?.error === 'Journey not found', 'Error does not leak journey existence');
    }

    // -------------------------------------------------------------
    // Test Suite 4: PATCH /api/journeys/:id (Update Editable Fields)
    // -------------------------------------------------------------
    console.log('\n[Suite 4] PATCH /api/journeys/:id (updateJourney)');

    // 4.1 Empty title rejection
    {
      const req = {
        userId: userA_id,
        params: { id: createdJourneyUserA._id.toString() },
        body: { title: '   ' },
      };
      const res = createMockRes();
      await updateJourney(req, res);
      assert(res.statusCode === 400, 'Rejects empty title update (400)');
      assert(res.body?.error?.includes('Title cannot be empty'), 'Error explains title cannot be empty');
    }

    // 4.2 Invalid template update (missing {{topic}})
    {
      const req = {
        userId: userA_id,
        params: { id: createdJourneyUserA._id.toString() },
        body: { template: 'Template without placeholder' },
      };
      const res = createMockRes();
      await updateJourney(req, res);
      assert(res.statusCode === 400, 'Rejects template update missing {{topic}} (400)');
      assert(res.body?.error?.includes('{{topic}}'), 'Error explains {{topic}} requirement');
    }

    // 4.3 Negative currentDay rejection
    {
      const req = {
        userId: userA_id,
        params: { id: createdJourneyUserA._id.toString() },
        body: { currentDay: -5 },
      };
      const res = createMockRes();
      await updateJourney(req, res);
      assert(res.statusCode === 400, 'Rejects negative currentDay (400)');
    }

    // 4.4 User B tries to update User A's journey -> 404
    {
      const req = {
        userId: userB_id,
        params: { id: createdJourneyUserA._id.toString() },
        body: { title: 'Hacked Title' },
      };
      const res = createMockRes();
      await updateJourney(req, res);
      assert(res.statusCode === 404, 'User B receives 404 attempting to update User A journey');
    }

    // 4.5 Successful update by owner
    {
      const req = {
        userId: userA_id,
        params: { id: createdJourneyUserA._id.toString() },
        body: {
          title: '30 Days of Advanced Rust & Solana',
          template: 'Updated Day {{day}}: Focus on {{topic}}!',
          postTimeLocal: '08:00',
          imageStyle: 'minimalist-dark',
          currentDay: 5,
        },
      };
      const res = createMockRes();
      await updateJourney(req, res);
      assert(res.statusCode === 200, 'Owner successfully updates editable fields (200)');
      assert(res.body?.journey?.title === '30 Days of Advanced Rust & Solana', 'Title updated');
      assert(res.body?.journey?.postTimeLocal === '08:00', 'postTimeLocal updated');
      assert(res.body?.journey?.imageStyle === 'minimalist-dark', 'imageStyle updated');
      assert(res.body?.journey?.currentDay === 5, 'currentDay updated');
    }

    // -------------------------------------------------------------
    // Test Suite 5: PATCH /api/journeys/:id/status (Status Management)
    // -------------------------------------------------------------
    console.log('\n[Suite 5] PATCH /api/journeys/:id/status (updateJourneyStatus)');

    // 5.1 Invalid status value
    {
      const req = {
        userId: userA_id,
        params: { id: createdJourneyUserA._id.toString() },
        body: { status: 'deleted' },
      };
      const res = createMockRes();
      await updateJourneyStatus(req, res);
      assert(res.statusCode === 400, 'Rejects invalid status value (400)');
      assert(
        res.body?.error?.includes('active, paused, completed'),
        'Error lists valid allowed statuses'
      );
    }

    // 5.2 User B tries to update User A's status -> 404
    {
      const req = {
        userId: userB_id,
        params: { id: createdJourneyUserA._id.toString() },
        body: { status: 'paused' },
      };
      const res = createMockRes();
      await updateJourneyStatus(req, res);
      assert(res.statusCode === 404, 'User B receives 404 attempting to change User A status');
    }

    // 5.3 Valid status updates: active -> paused -> completed
    {
      // Pause
      const reqPause = {
        userId: userA_id,
        params: { id: createdJourneyUserA._id.toString() },
        body: { status: 'paused' },
      };
      const resPause = createMockRes();
      await updateJourneyStatus(reqPause, resPause);
      assert(resPause.statusCode === 200, 'Successfully updates status to paused (200)');
      assert(resPause.body?.journey?.status === 'paused', 'Status is paused');

      // Complete
      const reqComplete = {
        userId: userA_id,
        params: { id: createdJourneyUserA._id.toString() },
        body: { status: 'completed' },
      };
      const resComplete = createMockRes();
      await updateJourneyStatus(reqComplete, resComplete);
      assert(resComplete.statusCode === 200, 'Successfully updates status to completed (200)');
      assert(resComplete.body?.journey?.status === 'completed', 'Status is completed');

      // Active
      const reqActive = {
        userId: userA_id,
        params: { id: createdJourneyUserA._id.toString() },
        body: { status: 'active' },
      };
      const resActive = createMockRes();
      await updateJourneyStatus(reqActive, resActive);
      assert(resActive.statusCode === 200, 'Successfully reactivates journey status to active (200)');
      assert(resActive.body?.journey?.status === 'active', 'Status is active');
    }

    // -------------------------------------------------------------
    // Test Suite 6: Route & Middleware Layer Verification
    // -------------------------------------------------------------
    console.log('\n[Suite 6] Express Route & requireAuth Integration');

    // Verify router has routes mounted
    const routes = journeyRouter.stack.filter((r) => r.route).map((r) => ({
      path: r.route.path,
      methods: Object.keys(r.route.methods),
    }));

    assert(routes.some((r) => r.path === '/' && r.methods.includes('post')), 'POST / registered');
    assert(routes.some((r) => r.path === '/' && r.methods.includes('get')), 'GET / registered');
    assert(routes.some((r) => r.path === '/:id' && r.methods.includes('get')), 'GET /:id registered');
    assert(routes.some((r) => r.path === '/:id' && r.methods.includes('patch')), 'PATCH /:id registered');
    assert(
      routes.some((r) => r.path === '/:id/status' && r.methods.includes('patch')),
      'PATCH /:id/status registered'
    );

    // Verify app has /api/journeys mounted
    const appJourneysRoute = app._router.stack.find(
      (layer) => layer.regexp && layer.regexp.test('/api/journeys')
    );
    assert(!!appJourneysRoute, 'app.use("/api/journeys", journeyRoutes) successfully mounted in app.js');

  } finally {
    // Restore original methods
    Journey.find = originalFind;
    Journey.findOne = originalFindOne;
    Journey.prototype.save = originalSave;
  }

  console.log(`\n======================================================`);
  console.log(`JOURNEY TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log(`======================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runJourneyUnitTests().catch((err) => {
  console.error('Journey test execution error:', err);
  process.exit(1);
});
