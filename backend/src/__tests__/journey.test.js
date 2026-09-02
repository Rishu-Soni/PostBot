/**
 * Journey CRUD tests: create/list/get/update/status-change, template validation, ownership checks.
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import supertest from 'supertest';
import app from '../app.js';

const request = supertest(app);

let userAToken, userBToken;
let journeyId;

beforeAll(async () => {
  // Create two users for ownership tests
  const resA = await request.post('/api/auth/signup').send({
    name: 'User A',
    email: 'usera_journey@example.com',
    password: 'password123',
  });
  userAToken = resA.body.token;

  const resB = await request.post('/api/auth/signup').send({
    name: 'User B',
    email: 'userb_journey@example.com',
    password: 'password123',
  });
  userBToken = resB.body.token;
});

describe('Journey — POST /api/journeys', () => {
  it('creates a journey with valid data', async () => {
    const res = await request
      .post('/api/journeys')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Test Journey',
        hashtags: ['buildinpublic', 'dev'],
        template: 'Day {{dayNumber}}: {{topic}}\n{{hashtags}}',
        startDate: new Date().toISOString(),
        postTimeLocal: '09:00',
        imageStyle: 'minimalist 3D',
      });

    expect(res.status).toBe(201);
    expect(res.body.journey).toBeDefined();
    expect(res.body.journey.title).toBe('Test Journey');
    expect(res.body.journey.status).toBe('active');
    journeyId = res.body.journey._id;
  });

  it('rejects creation with missing title', async () => {
    const res = await request
      .post('/api/journeys')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        template: '{{topic}}',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it('rejects creation with missing template', async () => {
    const res = await request
      .post('/api/journeys')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'No Template',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/template/i);
  });

  it('rejects creation when template is missing {{topic}} placeholder', async () => {
    const res = await request
      .post('/api/journeys')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'No Topic',
        template: 'Day {{dayNumber}}: just text',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/\{\{topic\}\}/);
  });
});

describe('Journey — GET /api/journeys', () => {
  it('lists only current user journeys', async () => {
    // Create a journey for user B
    await request
      .post('/api/journeys')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({
        title: 'User B Journey',
        template: '{{topic}} post',
      });

    const res = await request
      .get('/api/journeys')
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.journeys)).toBe(true);
    // User A should only see their own journeys
    for (const j of res.body.journeys) {
      expect(j.title).not.toBe('User B Journey');
    }
  });
});

describe('Journey — GET /api/journeys/:id', () => {
  it('returns the correct journey for the owner', async () => {
    const res = await request
      .get(`/api/journeys/${journeyId}`)
      .set('Authorization', `Bearer ${userAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.journey._id).toBe(journeyId);
  });

  it('returns 404 (not 403) when another user tries to access', async () => {
    const res = await request
      .get(`/api/journeys/${journeyId}`)
      .set('Authorization', `Bearer ${userBToken}`);

    // Must be 404 to not leak existence
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 404 for invalid ObjectId', async () => {
    const res = await request
      .get('/api/journeys/invalid-id')
      .set('Authorization', `Bearer ${userAToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Journey — PATCH /api/journeys/:id', () => {
  it('updates title and template', async () => {
    const res = await request
      .patch(`/api/journeys/${journeyId}`)
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        title: 'Updated Journey',
        template: 'New template: {{topic}}',
      });

    expect(res.status).toBe(200);
    expect(res.body.journey.title).toBe('Updated Journey');
    expect(res.body.journey.template).toBe('New template: {{topic}}');
  });

  it('rejects update that removes {{topic}} from template', async () => {
    const res = await request
      .patch(`/api/journeys/${journeyId}`)
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        template: 'No topic placeholder here',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/\{\{topic\}\}/);
  });

  it('returns 404 when user B tries to update user A journey', async () => {
    const res = await request
      .patch(`/api/journeys/${journeyId}`)
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ title: 'Hacked Title' });

    expect(res.status).toBe(404);
  });
});

describe('Journey — PATCH /api/journeys/:id/status', () => {
  it('updates status to paused', async () => {
    const res = await request
      .patch(`/api/journeys/${journeyId}/status`)
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ status: 'paused' });

    expect(res.status).toBe(200);
    expect(res.body.journey.status).toBe('paused');
  });

  it('updates status to completed', async () => {
    const res = await request
      .patch(`/api/journeys/${journeyId}/status`)
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.journey.status).toBe('completed');
  });

  it('rejects invalid status value', async () => {
    const res = await request
      .patch(`/api/journeys/${journeyId}/status`)
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ status: 'invalid_status' });

    expect(res.status).toBe(400);
  });

  it('returns 404 when user B tries to change user A journey status', async () => {
    const res = await request
      .patch(`/api/journeys/${journeyId}/status`)
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ status: 'active' });

    expect(res.status).toBe(404);
  });
});
