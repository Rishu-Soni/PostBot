/**
 * DailyEntry CRUD tests: bulk creation, duplicate dayNumber rejection, edit blocked after "posted".
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import supertest from 'supertest';
import app from '../app.js';

const request = supertest(app);

let token, journeyId;

beforeAll(async () => {
  const signupRes = await request.post('/api/auth/signup').send({
    name: 'Entry User',
    email: 'entryuser@example.com',
    password: 'password123',
  });
  token = signupRes.body.token;

  const journeyRes = await request
    .post('/api/journeys')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Entry Journey',
      template: 'Day {{dayNumber}}: {{topic}}',
      startDate: new Date().toISOString(),
    });
  journeyId = journeyRes.body.journey._id;
});

describe('DailyEntry — POST /api/journeys/:journeyId/entries/bulk', () => {
  it('bulk creates 7 entries with valid data', async () => {
    const entries = [];
    const baseDate = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i);
      entries.push({
        dayNumber: i + 1,
        scheduledDate: d.toISOString(),
        topic: `Topic for day ${i + 1}`,
        challenge: `Challenge ${i + 1}`,
        extraNotes: '',
      });
    }

    const res = await request
      .post(`/api/journeys/${journeyId}/entries/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send(entries);

    expect(res.status).toBe(201);
    expect(res.body.entries).toHaveLength(7);
    expect(res.body.entries[0].status).toBe('planned');
    expect(res.body.entries[0].dayNumber).toBe(1);
  });

  it('rejects duplicate dayNumbers within payload', async () => {
    const entries = [
      { dayNumber: 100, scheduledDate: new Date().toISOString(), topic: 'A' },
      { dayNumber: 100, scheduledDate: new Date().toISOString(), topic: 'B' },
    ];

    const res = await request
      .post(`/api/journeys/${journeyId}/entries/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send(entries);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/duplicate/i);
  });

  it('rejects dayNumbers that already exist in DB', async () => {
    const entries = [
      { dayNumber: 1, scheduledDate: new Date().toISOString(), topic: 'Dup' },
    ];

    const res = await request
      .post(`/api/journeys/${journeyId}/entries/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send(entries);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exist/i);
  });

  it('rejects entries with missing scheduledDate', async () => {
    const res = await request
      .post(`/api/journeys/${journeyId}/entries/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send([{ dayNumber: 50 }]);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scheduledDate/i);
  });

  it('rejects empty array', async () => {
    const res = await request
      .post(`/api/journeys/${journeyId}/entries/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send([]);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-empty/i);
  });
});

describe('DailyEntry — GET /api/journeys/:journeyId/entries', () => {
  it('lists entries sorted by dayNumber ascending', async () => {
    const res = await request
      .get(`/api/journeys/${journeyId}/entries`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.entries.length).toBeGreaterThan(0);

    // Verify ascending sort
    for (let i = 1; i < res.body.entries.length; i++) {
      expect(res.body.entries[i].dayNumber).toBeGreaterThan(
        res.body.entries[i - 1].dayNumber
      );
    }
  });
});

describe('DailyEntry — PATCH /api/journeys/:journeyId/entries/:entryId', () => {
  let entryId;

  beforeAll(async () => {
    // Get first entry
    const res = await request
      .get(`/api/journeys/${journeyId}/entries`)
      .set('Authorization', `Bearer ${token}`);
    entryId = res.body.entries[0]._id;
  });

  it('allows editing topic when status is "planned"', async () => {
    const res = await request
      .patch(`/api/journeys/${journeyId}/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ topic: 'Updated Topic' });

    expect(res.status).toBe(200);
    expect(res.body.entry.topic).toBe('Updated Topic');
  });

  it('blocks editing when status is "posted"', async () => {
    // First, set status to posted
    await request
      .patch(`/api/journeys/${journeyId}/entries/${entryId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'posted' });

    const res = await request
      .patch(`/api/journeys/${journeyId}/entries/${entryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ topic: 'Hacked' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot edit/i);
  });
});

describe('DailyEntry — Ownership checks', () => {
  let otherUserToken;

  beforeAll(async () => {
    const res = await request.post('/api/auth/signup').send({
      name: 'Other Entry User',
      email: 'other_entry@example.com',
      password: 'password123',
    });
    otherUserToken = res.body.token;
  });

  it('returns 404 when another user tries to list entries of a journey they do not own', async () => {
    const res = await request
      .get(`/api/journeys/${journeyId}/entries`)
      .set('Authorization', `Bearer ${otherUserToken}`);

    expect(res.status).toBe(404);
  });
});
