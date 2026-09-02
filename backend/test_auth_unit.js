import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { requireAuth } from './src/middleware/requireAuth.js';
import { signup, login, getMe } from './src/controllers/auth.controller.js';
import User from './src/models/User.js';

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

async function runUnitTests() {
  console.log('--- STARTING UNIT TESTS FOR AUTH SYSTEM ---');
  const secret = process.env.JWT_SECRET || 'postbot_jwt_secret_dev_key_2026_secure';

  // -------------------------------------------------------------
  // Test 1: requireAuth Middleware
  // -------------------------------------------------------------
  console.log('\n[Suite 1] requireAuth Middleware Tests');

  // Test 1.1: Missing Authorization Header
  {
    let statusCode = null;
    let jsonBody = null;
    let nextCalled = false;
    const req = { headers: {} };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
        return this;
      },
    };
    const next = () => {
      nextCalled = true;
    };

    requireAuth(req, res, next);
    assert(statusCode === 401 && !nextCalled, 'Returns 401 when Authorization header is missing');
    assert(jsonBody?.error?.includes('missing or malformed'), 'Returns clear error message on missing header');
  }

  // Test 1.2: Malformed Header (Not Bearer)
  {
    let statusCode = null;
    const req = { headers: { authorization: 'Basic 12345' } };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };
    requireAuth(req, res, () => {});
    assert(statusCode === 401, 'Returns 401 when header format is not Bearer <token>');
  }

  // Test 1.3: Invalid Token
  {
    let statusCode = null;
    let jsonBody = null;
    const req = { headers: { authorization: 'Bearer invalid_signature_token' } };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
        return this;
      },
    };
    requireAuth(req, res, () => {});
    assert(statusCode === 401, 'Returns 401 when token is invalid');
    assert(jsonBody?.error?.includes('Invalid authentication token'), 'Returns invalid token error message');
  }

  // Test 1.4: Valid Token
  {
    const testUserId = '64b0f9c2d123456789012345';
    const validToken = jwt.sign({ userId: testUserId }, secret, { expiresIn: '7d' });
    let nextCalled = false;
    const req = { headers: { authorization: `Bearer ${validToken}` } };
    const res = {
      status() {
        return this;
      },
      json() {
        return this;
      },
    };
    const next = () => {
      nextCalled = true;
    };

    requireAuth(req, res, next);
    assert(nextCalled === true, 'Calls next() when token is valid');
    assert(req.userId === testUserId, 'Attaches req.userId matching token payload');
  }

  // -------------------------------------------------------------
  // Test 2: Signup Controller Logic
  // -------------------------------------------------------------
  console.log('\n[Suite 2] Signup Controller Tests');

  // Test 2.1: Missing required fields
  {
    let statusCode = null;
    let jsonBody = null;
    const req = { body: { email: 'test@example.com' } };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
        return this;
      },
    };
    await signup(req, res);
    assert(statusCode === 400, 'Returns 400 when name or password is missing');
    assert(jsonBody?.error?.includes('required'), 'Error informs required fields');
  }

  // Test 2.2: Short password
  {
    let statusCode = null;
    const req = { body: { name: 'Test', email: 'test@example.com', password: '123' } };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };
    await signup(req, res);
    assert(statusCode === 400, 'Returns 400 when password is shorter than 6 chars');
  }

  // Test 2.3: Duplicate Email Check
  {
    const originalFindOne = User.findOne;
    User.findOne = async () => ({ email: 'existing@example.com' });

    let statusCode = null;
    let jsonBody = null;
    const req = { body: { name: 'Test', email: 'existing@example.com', password: 'Password123' } };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
        return this;
      },
    };
    await signup(req, res);
    assert(statusCode === 400, 'Returns 400 when email already exists');
    assert(jsonBody?.error?.includes('already exists'), 'Informs email already exists');

    User.findOne = originalFindOne;
  }

  // Test 2.4: Successful Signup creates user and returns 7d JWT & sanitized user
  {
    const originalFindOne = User.findOne;
    const originalSave = User.prototype.save;
    User.findOne = async () => null;
    User.prototype.save = async function () {
      this._id = '64b0f9c2d123456789012345';
      return this;
    };

    let statusCode = null;
    let jsonBody = null;
    const req = {
      body: {
        name: 'Alice Johnson',
        email: 'Alice@Example.com',
        password: 'SecurePassword123!',
      },
    };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
        return this;
      },
    };

    await signup(req, res);
    assert(statusCode === 201, 'Returns 201 on successful signup');
    assert(!!jsonBody?.token, 'Returns JWT token');
    const decoded = jwt.verify(jsonBody.token, secret);
    assert(decoded.userId === '64b0f9c2d123456789012345', 'Token encodes userId in payload');
    assert(jsonBody.user?.name === 'Alice Johnson', 'Returns sanitized user name');
    assert(jsonBody.user?.email === 'alice@example.com', 'Returns normalized lowercase email');
    assert(jsonBody.user?.passwordHash === undefined, 'Sanitized user does NOT expose passwordHash');

    User.findOne = originalFindOne;
    User.prototype.save = originalSave;
  }

  // -------------------------------------------------------------
  // Test 3: Login Controller Logic
  // -------------------------------------------------------------
  console.log('\n[Suite 3] Login Controller Tests');

  // Test 3.1: User not found
  {
    const originalFindOne = User.findOne;
    User.findOne = async () => null;

    let statusCode = null;
    const req = { body: { email: 'nonexistent@example.com', password: 'Password123' } };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };
    await login(req, res);
    assert(statusCode === 401, 'Returns 401 when email not found');

    User.findOne = originalFindOne;
  }

  // Test 3.2: Wrong password
  {
    const originalFindOne = User.findOne;
    const dummyHash = await bcrypt.hash('CorrectPassword123', 10);
    User.findOne = async () => ({
      _id: '64b0f9c2d123456789012345',
      name: 'Bob',
      email: 'bob@example.com',
      passwordHash: dummyHash,
    });

    let statusCode = null;
    const req = { body: { email: 'bob@example.com', password: 'WrongPassword' } };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };
    await login(req, res);
    assert(statusCode === 401, 'Returns 401 when password does not match hash');

    User.findOne = originalFindOne;
  }

  // Test 3.3: Correct password -> returns token & sanitized user
  {
    const originalFindOne = User.findOne;
    const dummyHash = await bcrypt.hash('CorrectPassword123', 10);
    User.findOne = async () => ({
      _id: '64b0f9c2d123456789012345',
      name: 'Bob',
      email: 'bob@example.com',
      passwordHash: dummyHash,
      timezone: 'UTC',
    });

    let statusCode = null;
    let jsonBody = null;
    const req = { body: { email: 'bob@example.com', password: 'CorrectPassword123' } };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
        return this;
      },
    };
    await login(req, res);
    assert(statusCode === 200, 'Returns 200 on successful login');
    assert(!!jsonBody?.token, 'Returns JWT token on login');
    assert(jsonBody?.user?.passwordHash === undefined, 'Sanitized user does not contain passwordHash');

    User.findOne = originalFindOne;
  }

  // -------------------------------------------------------------
  // Test 4: GetMe Profile Controller
  // -------------------------------------------------------------
  console.log('\n[Suite 4] getMe Profile Controller Tests');

  {
    const originalFindById = User.findById;
    User.findById = (id) => ({
      select: async (fields) => ({
        _id: id,
        name: 'Bob',
        email: 'bob@example.com',
        timezone: 'UTC',
        linkedin: {
          memberId: 'mem_123',
          accessTokenEnc: 'secret_token',
        },
      }),
    });

    let statusCode = null;
    let jsonBody = null;
    const req = { userId: '64b0f9c2d123456789012345' };
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
        return this;
      },
    };

    await getMe(req, res);
    assert(statusCode === 200, 'Returns 200 on getMe');
    assert(jsonBody?.user?.name === 'Bob', 'Returns correct user profile');
    assert(jsonBody?.user?.passwordHash === undefined, 'Does not expose passwordHash');
    assert(jsonBody?.user?.linkedin?.accessTokenEnc === undefined, 'Does not expose linkedin accessTokenEnc');

    User.findById = originalFindById;
  }

  console.log(`\n========================================`);
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runUnitTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
