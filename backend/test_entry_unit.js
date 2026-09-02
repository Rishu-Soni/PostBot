import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

import Journey from './src/models/Journey.js';
import DailyEntry from './src/models/DailyEntry.js';
import {
  bulkCreateEntries,
  getEntriesByJourney,
  updateEntry,
  updateEntryStatus,
} from './src/controllers/entry.controller.js';
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

async function runEntryUnitTests() {
  console.log('--- STARTING UNIT & INTEGRATION TESTS FOR DAILY ENTRY API ---');

  const userA_id = new mongoose.Types.ObjectId().toString();
  const userB_id = new mongoose.Types.ObjectId().toString();

  const journeyA_id = new mongoose.Types.ObjectId().toString();
  const journeyB_id = new mongoose.Types.ObjectId().toString();

  // In-memory mock store
  let mockJourneys = [
    {
      _id: new mongoose.Types.ObjectId(journeyA_id),
      userId: userA_id,
      title: 'User A Journey',
      template: 'Day {{day}}: {{topic}}',
      status: 'active',
    },
    {
      _id: new mongoose.Types.ObjectId(journeyB_id),
      userId: userB_id,
      title: 'User B Journey',
      template: 'Day {{day}}: {{topic}}',
      status: 'active',
    },
  ];

  let mockEntries = [];

  const originalJourneyFindOne = Journey.findOne;
  const originalEntryFind = DailyEntry.find;
  const originalEntryFindOne = DailyEntry.findOne;
  const originalEntryInsertMany = DailyEntry.insertMany;

  // Mock Journey.findOne
  Journey.findOne = async (filter = {}) => {
    const found = mockJourneys.find((j) => {
      if (filter._id && j._id.toString() !== filter._id.toString()) return false;
      if (filter.userId && j.userId.toString() !== filter.userId.toString()) return false;
      return true;
    });
    return found ? { ...found } : null;
  };

  // Mock DailyEntry.find
  DailyEntry.find = (filter = {}) => {
    return {
      sort: async (sortCriteria = {}) => {
        let results = mockEntries.filter((e) => {
          if (filter.journeyId && e.journeyId.toString() !== filter.journeyId.toString()) return false;
          if (filter.dayNumber && filter.dayNumber.$in) {
            if (!filter.dayNumber.$in.includes(e.dayNumber)) return false;
          }
          return true;
        });

        if (sortCriteria.dayNumber === 1) {
          results = [...results].sort((a, b) => a.dayNumber - b.dayNumber);
        }
        return results;
      },
      then(resolve) {
        let results = mockEntries.filter((e) => {
          if (filter.journeyId && e.journeyId.toString() !== filter.journeyId.toString()) return false;
          if (filter.dayNumber && filter.dayNumber.$in) {
            if (!filter.dayNumber.$in.includes(e.dayNumber)) return false;
          }
          return true;
        });
        resolve(results);
      },
    };
  };

  // Mock DailyEntry.insertMany
  DailyEntry.insertMany = async (docs = []) => {
    const created = docs.map((doc) => {
      const newDoc = {
        _id: new mongoose.Types.ObjectId(),
        ...doc,
      };
      mockEntries.push(newDoc);
      return newDoc;
    });
    return created;
  };

  // Mock DailyEntry.findOne
  DailyEntry.findOne = async (filter = {}) => {
    const found = mockEntries.find((e) => {
      if (filter._id && e._id.toString() !== filter._id.toString()) return false;
      if (filter.journeyId && e.journeyId.toString() !== filter.journeyId.toString()) return false;
      return true;
    });

    if (!found) return null;

    const entryInstance = new DailyEntry(found);
    entryInstance._id = found._id;
    entryInstance.save = async function () {
      const idx = mockEntries.findIndex((item) => item._id.toString() === entryInstance._id.toString());
      if (idx >= 0) {
        mockEntries[idx] = {
          ...mockEntries[idx],
          topic: this.topic,
          challenge: this.challenge,
          extraNotes: this.extraNotes,
          status: this.status,
          postedAt: this.postedAt,
        };
      }
      return entryInstance;
    };
    return entryInstance;
  };

  try {
    // -------------------------------------------------------------
    // Suite 1: POST /api/journeys/:journeyId/entries/bulk
    // -------------------------------------------------------------
    console.log('\n[Suite 1] POST /api/journeys/:journeyId/entries/bulk (bulkCreateEntries)');

    // 1.1 Invalid journeyId format
    {
      const req = {
        userId: userA_id,
        params: { journeyId: 'invalid-id' },
        body: [{ dayNumber: 1, scheduledDate: '2026-09-02', topic: 'Intro' }],
      };
      const res = createMockRes();
      await bulkCreateEntries(req, res);
      assert(res.statusCode === 404, 'Returns 404 for invalid journeyId format');
      assert(res.body?.error === 'Journey not found', 'Returns Journey not found message');
    }

    // 1.2 Journey belongs to another user (User B) -> User A gets 404
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyB_id },
        body: [{ dayNumber: 1, scheduledDate: '2026-09-02', topic: 'Intro' }],
      };
      const res = createMockRes();
      await bulkCreateEntries(req, res);
      assert(res.statusCode === 404, 'Returns 404 if User A tries to bulk create for User B journey');
    }

    // 1.3 Empty payload
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id },
        body: [],
      };
      const res = createMockRes();
      await bulkCreateEntries(req, res);
      assert(res.statusCode === 400, 'Rejects empty array submission (400)');
      assert(res.body?.error?.includes('non-empty array'), 'Explains non-empty array requirement');
    }

    // 1.4 Invalid dayNumber in payload
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id },
        body: [{ dayNumber: -1, scheduledDate: '2026-09-02', topic: 'Intro' }],
      };
      const res = createMockRes();
      await bulkCreateEntries(req, res);
      assert(res.statusCode === 400, 'Rejects negative dayNumber (400)');
    }

    // 1.5 Missing scheduledDate in payload
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id },
        body: [{ dayNumber: 1, scheduledDate: '', topic: 'Intro' }],
      };
      const res = createMockRes();
      await bulkCreateEntries(req, res);
      assert(res.statusCode === 400, 'Rejects missing scheduledDate (400)');
    }

    // 1.6 Duplicate dayNumber within payload
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id },
        body: [
          { dayNumber: 1, scheduledDate: '2026-09-02', topic: 'Intro' },
          { dayNumber: 1, scheduledDate: '2026-09-03', topic: 'Intro Dup' },
        ],
      };
      const res = createMockRes();
      await bulkCreateEntries(req, res);
      assert(res.statusCode === 400, 'Rejects duplicate day numbers in single submission (400)');
      assert(res.body?.error?.includes('Duplicate day numbers'), 'Error mentions duplicate day numbers');
    }

    // 1.7 Successful 7-day bulk creation
    let createdDays = [];
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id },
        body: [
          { dayNumber: 1, scheduledDate: '2026-09-01', topic: 'Rust Ownership', challenge: 'Borrowing rules', extraNotes: 'Note 1' },
          { dayNumber: 2, scheduledDate: '2026-09-02', topic: 'Lifetimes', challenge: 'Lifetime elision', extraNotes: 'Note 2' },
          { dayNumber: 3, scheduledDate: '2026-09-03', topic: 'Smart Pointers', challenge: 'Rc vs Arc', extraNotes: 'Note 3' },
          { dayNumber: 4, scheduledDate: '2026-09-04', topic: 'Traits', challenge: 'Dynamic dispatch', extraNotes: 'Note 4' },
          { dayNumber: 5, scheduledDate: '2026-09-05', topic: 'Async Rust', challenge: 'Tokio tasks', extraNotes: 'Note 5' },
          { dayNumber: 6, scheduledDate: '2026-09-06', topic: 'Error Handling', challenge: 'anyhow vs thiserror', extraNotes: 'Note 6' },
          { dayNumber: 7, scheduledDate: '2026-09-07', topic: 'Macros', challenge: 'Procedural macros', extraNotes: 'Note 7' },
        ],
      };
      const res = createMockRes();
      await bulkCreateEntries(req, res);
      assert(res.statusCode === 201, 'Successfully creates 7 planned entries in bulk (201)');
      assert(res.body?.entries?.length === 7, 'Created exactly 7 entries');
      assert(
        res.body?.entries?.every((e) => e.status === 'planned'),
        'All created entries default to status "planned"'
      );
      assert(
        res.body?.entries?.[0].topic === 'Rust Ownership',
        'Saves topic correctly'
      );
      createdDays = res.body?.entries;
    }

    // 1.8 Rejects if any dayNumber already exists for that journey
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id },
        body: [
          { dayNumber: 7, scheduledDate: '2026-09-08', topic: 'Day 7 again' },
          { dayNumber: 8, scheduledDate: '2026-09-09', topic: 'Day 8' },
        ],
      };
      const res = createMockRes();
      await bulkCreateEntries(req, res);
      assert(res.statusCode === 400, 'Rejects bulk creation if dayNumber already exists in DB (400)');
      assert(res.body?.error?.includes('already exist for this journey'), 'Explains existing days conflict');
      assert(res.body?.existingDays?.includes(7), 'Identifies conflicting dayNumber 7');
    }

    // -------------------------------------------------------------
    // Suite 2: GET /api/journeys/:journeyId/entries
    // -------------------------------------------------------------
    console.log('\n[Suite 2] GET /api/journeys/:journeyId/entries (getEntriesByJourney)');

    // 2.1 User A lists entries
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id },
      };
      const res = createMockRes();
      await getEntriesByJourney(req, res);
      assert(res.statusCode === 200, 'Returns 200 when listing entries');
      assert(Array.isArray(res.body?.entries), 'Returns entries array');
      assert(res.body?.entries?.length === 7, 'Returns all 7 entries');
      assert(
        res.body.entries[0].dayNumber === 1 && res.body.entries[6].dayNumber === 7,
        'Entries are sorted ascending by dayNumber'
      );
    }

    // 2.2 User B cannot list User A entries -> 404
    {
      const req = {
        userId: userB_id,
        params: { journeyId: journeyA_id },
      };
      const res = createMockRes();
      await getEntriesByJourney(req, res);
      assert(res.statusCode === 404, 'User B receives 404 trying to list User A journey entries');
    }

    // -------------------------------------------------------------
    // Suite 3: PATCH /api/journeys/:journeyId/entries/:entryId
    // -------------------------------------------------------------
    console.log('\n[Suite 3] PATCH /api/journeys/:journeyId/entries/:entryId (updateEntry)');

    const entry1 = createdDays[0];
    const entry2 = createdDays[1];

    // 3.1 Edit 'planned' entry -> allowed
    {
      const req = {
        userId: userA_id,
        params: {
          journeyId: journeyA_id,
          entryId: entry1._id.toString(),
        },
        body: {
          topic: 'Updated Rust Memory Model & Ownership',
          challenge: 'Updated Borrowing rules & references',
          extraNotes: 'Updated extra notes',
        },
      };
      const res = createMockRes();
      await updateEntry(req, res);
      assert(res.statusCode === 200, 'Successfully edits entry with status "planned" (200)');
      assert(
        res.body?.entry?.topic === 'Updated Rust Memory Model & Ownership',
        'Topic was updated'
      );
      assert(
        res.body?.entry?.challenge === 'Updated Borrowing rules & references',
        'Challenge was updated'
      );
      assert(
        res.body?.entry?.extraNotes === 'Updated extra notes',
        'Extra notes were updated'
      );
    }

    // 3.2 Edit 'generated' entry -> allowed
    {
      // First update status to 'generated'
      const reqStatus = {
        userId: userA_id,
        params: { journeyId: journeyA_id, entryId: entry2._id.toString() },
        body: { status: 'generated' },
      };
      const resStatus = createMockRes();
      await updateEntryStatus(reqStatus, resStatus);
      assert(resStatus.statusCode === 200, 'Updated entry status to "generated"');

      // Now edit entry2
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id, entryId: entry2._id.toString() },
        body: { topic: 'Lifetimes in Structs' },
      };
      const res = createMockRes();
      await updateEntry(req, res);
      assert(res.statusCode === 200, 'Successfully edits entry with status "generated" (200)');
      assert(res.body?.entry?.topic === 'Lifetimes in Structs', 'Topic updated for generated entry');
    }

    // 3.3 Edit 'posted' entry -> REJECTED (400)
    {
      // Update status to 'posted'
      const reqStatus = {
        userId: userA_id,
        params: { journeyId: journeyA_id, entryId: entry1._id.toString() },
        body: { status: 'posted' },
      };
      const resStatus = createMockRes();
      await updateEntryStatus(reqStatus, resStatus);
      assert(resStatus.statusCode === 200, 'Updated entry1 status to "posted"');

      // Attempt to edit posted entry
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id, entryId: entry1._id.toString() },
        body: { topic: 'Attempt to edit after posted' },
      };
      const res = createMockRes();
      await updateEntry(req, res);
      assert(res.statusCode === 400, 'Rejects editing entry with status "posted" (400)');
      assert(
        res.body?.error?.includes('Cannot edit an entry with status "posted"'),
        'Error explains editing is not permitted on posted entries'
      );
    }

    // 3.4 User B cannot edit User A entry -> 404
    {
      const req = {
        userId: userB_id,
        params: { journeyId: journeyA_id, entryId: entry2._id.toString() },
        body: { topic: 'Hacked topic' },
      };
      const res = createMockRes();
      await updateEntry(req, res);
      assert(res.statusCode === 404, 'User B receives 404 attempting to edit User A entry');
    }

    // -------------------------------------------------------------
    // Suite 4: PATCH /api/journeys/:journeyId/entries/:entryId/status
    // -------------------------------------------------------------
    console.log('\n[Suite 4] PATCH /api/journeys/:journeyId/entries/:entryId/status (updateEntryStatus)');

    // 4.1 Invalid status
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id, entryId: entry2._id.toString() },
        body: { status: 'invalid_status' },
      };
      const res = createMockRes();
      await updateEntryStatus(req, res);
      assert(res.statusCode === 400, 'Rejects invalid status value (400)');
      assert(res.body?.error?.includes('planned, generated, posted, failed, skipped'), 'Lists allowed statuses');
    }

    // 4.2 Set status to 'planned' again
    {
      const req = {
        userId: userA_id,
        params: { journeyId: journeyA_id, entryId: entry1._id.toString() },
        body: { status: 'planned' },
      };
      const res = createMockRes();
      await updateEntryStatus(req, res);
      assert(res.statusCode === 200, 'Re-enables entry by setting status back to "planned"');
      assert(res.body?.entry?.status === 'planned', 'Entry status is planned');
    }

  } finally {
    Journey.findOne = originalJourneyFindOne;
    DailyEntry.find = originalEntryFind;
    DailyEntry.findOne = originalEntryFindOne;
    DailyEntry.insertMany = originalEntryInsertMany;
  }

  console.log(`\n======================================================`);
  console.log(`DAILY ENTRY TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log(`======================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runEntryUnitTests().catch((err) => {
  console.error('Entry test execution error:', err);
  process.exit(1);
});
