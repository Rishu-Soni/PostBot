/**
 * Auth tests: signup validation, duplicate email, login success/failure, JWT middleware.
 * Uses supertest against the Express app with in-memory MongoDB.
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';

const request = supertest(app);

describe('Auth — POST /api/auth/signup', () => {
  it('registers a new user with valid data and returns JWT', async () => {
    const res = await request.post('/api/auth/signup').send({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
    // passwordHash must never leak
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects signup with missing name', async () => {
    const res = await request.post('/api/auth/signup').send({
      email: 'noname@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('rejects signup with missing email', async () => {
    const res = await request.post('/api/auth/signup').send({
      name: 'No Email',
      password: 'password123',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('rejects signup with invalid email format', async () => {
    const res = await request.post('/api/auth/signup').send({
      name: 'Bad Email',
      email: 'not-an-email',
      password: 'password123',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid email/i);
  });

  it('rejects signup with short password (< 6 chars)', async () => {
    const res = await request.post('/api/auth/signup').send({
      name: 'Short Pass',
      email: 'short@example.com',
      password: '12345',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 characters/i);
  });

  it('rejects duplicate email registration', async () => {
    // First signup
    await request.post('/api/auth/signup').send({
      name: 'First User',
      email: 'duplicate@example.com',
      password: 'password123',
    });

    // Second signup with same email
    const res = await request.post('/api/auth/signup').send({
      name: 'Second User',
      email: 'duplicate@example.com',
      password: 'password456',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });
});

describe('Auth — POST /api/auth/login', () => {
  beforeAll(async () => {
    // Create a user to test login against
    await request.post('/api/auth/signup').send({
      name: 'Login User',
      email: 'login@example.com',
      password: 'correctpassword',
    });
  });

  it('logs in with correct credentials', async () => {
    const res = await request.post('/api/auth/login').send({
      email: 'login@example.com',
      password: 'correctpassword',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('login@example.com');
  });

  it('rejects login with wrong password', async () => {
    const res = await request.post('/api/auth/login').send({
      email: 'login@example.com',
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  it('rejects login with non-existent email', async () => {
    const res = await request.post('/api/auth/login').send({
      email: 'nobody@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  it('rejects login with missing fields', async () => {
    const res = await request.post('/api/auth/login').send({
      email: 'login@example.com',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });
});

describe('Auth — GET /api/auth/me (JWT middleware)', () => {
  let validToken;

  beforeAll(async () => {
    const res = await request.post('/api/auth/signup').send({
      name: 'Me User',
      email: 'me@example.com',
      password: 'password123',
    });
    validToken = res.body.token;
  });

  it('returns user profile with valid JWT', async () => {
    const res = await request
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('me@example.com');
  });

  it('rejects request with no token', async () => {
    const res = await request.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing/i);
  });

  it('rejects request with invalid token', async () => {
    const res = await request
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('rejects request with expired token', async () => {
    const secret = process.env.JWT_SECRET;
    const expiredToken = jwt.sign({ userId: 'someid' }, secret, { expiresIn: '0s' });
    // Small delay to ensure expiry
    await new Promise((r) => setTimeout(r, 50));

    const res = await request
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
  });
});
