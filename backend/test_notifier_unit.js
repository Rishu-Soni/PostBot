process.env.NODE_ENV = 'test';

import axios from 'axios';
import mongoose from 'mongoose';
import {
  sendEmail,
  notifyUser,
  sendPostPublishedEmail,
  sendReconnectLinkedInEmail,
  sendPublishFailedEmail,
  buildPostPublishedTemplate,
  buildReconnectLinkedInTemplate,
  buildPublishFailedTemplate,
  getLinkedInPostUrl,
  getActiveEmailProvider,
  EmailDeliveryError,
} from './src/services/notifier.js';
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

console.log('\n====================================================');
console.log('🧪 Email Notifier Service Unit Tests');
console.log('====================================================\n');

// -------------------------------------------------------------
// Suite 1: Provider Detection and URL Helpers
// -------------------------------------------------------------
console.log('--- Suite 1: Provider Detection and URL Helpers ---');

{
  // Test 1.1: Default / Mock Provider Detection
  delete process.env.RESEND_API_KEY;
  delete process.env.SENDGRID_API_KEY;
  delete process.env.EMAIL_PROVIDER;
  assert(getActiveEmailProvider() === 'mock', 'getActiveEmailProvider returns "mock" when no keys are configured');

  // Test 1.2: Resend detection
  process.env.RESEND_API_KEY = 're_test_key_123';
  assert(getActiveEmailProvider() === 'resend', 'getActiveEmailProvider returns "resend" when RESEND_API_KEY is present');

  // Test 1.3: SendGrid detection
  delete process.env.RESEND_API_KEY;
  process.env.SENDGRID_API_KEY = 'SG.test_key_456';
  assert(getActiveEmailProvider() === 'sendgrid', 'getActiveEmailProvider returns "sendgrid" when SENDGRID_API_KEY is present');

  // Test 1.4: Explicit override
  process.env.EMAIL_PROVIDER = 'resend';
  assert(getActiveEmailProvider() === 'resend', 'getActiveEmailProvider respects explicit EMAIL_PROVIDER override');

  delete process.env.SENDGRID_API_KEY;
  delete process.env.EMAIL_PROVIDER;

  // Test 1.5: LinkedIn URL Helper
  assert(
    getLinkedInPostUrl('urn:li:share:123456789') === 'https://www.linkedin.com/feed/update/urn:li:share:123456789',
    'getLinkedInPostUrl formats URN into full LinkedIn feed update URL'
  );
  assert(
    getLinkedInPostUrl('https://www.linkedin.com/feed/update/urn:li:share:999') ===
      'https://www.linkedin.com/feed/update/urn:li:share:999',
    'getLinkedInPostUrl preserves existing full https URL'
  );
  assert(
    getLinkedInPostUrl(null) === 'https://www.linkedin.com/feed/',
    'getLinkedInPostUrl returns default feed URL on null/empty input'
  );
}

// -------------------------------------------------------------
// Suite 2: Template 1 - Post Published Today
// -------------------------------------------------------------
console.log('\n--- Suite 2: Template 1 - Post Published Today ---');

{
  const mockUser = { name: 'Alice Builder', email: 'alice@example.com' };
  const mockJourney = { _id: 'journey_101', title: 'Building My SaaS in 30 Days' };
  const mockEntry = {
    dayNumber: 7,
    topic: 'Automating Customer Onboarding',
    generatedText: 'Today we automated our entire user welcome flow with background jobs! 🚀 #buildinpublic',
    generatedImageUrl: 'https://images.example.com/post-pic.jpg',
    linkedinPostUrn: 'urn:li:share:777888999',
  };

  const template = buildPostPublishedTemplate({
    user: mockUser,
    journey: mockJourney,
    entry: mockEntry,
    postUrn: 'urn:li:share:777888999',
  });

  assert(template.subject.includes('Day 7'), 'Subject includes day number');
  assert(template.subject.includes('Automating Customer Onboarding'), 'Subject includes topic');
  assert(template.html.includes('https://www.linkedin.com/feed/update/urn:li:share:777888999'), 'HTML includes LinkedIn post link');
  assert(template.html.includes('Building My SaaS in 30 Days'), 'HTML includes journey title');
  assert(template.html.includes('Alice Builder'), 'HTML addresses user by name');
  assert(template.html.includes('https://images.example.com/post-pic.jpg'), 'HTML includes image preview thumbnail');
  assert(template.html.includes('Automating Customer Onboarding'), 'HTML includes post topic');
  assert(template.text.includes('https://www.linkedin.com/feed/update/urn:li:share:777888999'), 'Plain text contains LinkedIn post link');
  assert(template.text.includes('Today we automated our entire user welcome flow'), 'Plain text contains commentary snippet');
}

// -------------------------------------------------------------
// Suite 3: Template 2 - Reconnect LinkedIn Required
// -------------------------------------------------------------
console.log('\n--- Suite 3: Template 2 - Reconnect LinkedIn Required ---');

{
  const mockUser = { name: 'Bob Founder', email: 'bob@example.com' };
  const mockJourney = { _id: 'journey_202', title: 'AI Engineering Sprint' };
  const mockEntry = {
    dayNumber: 12,
    topic: 'Fine-Tuning Open Source LLMs',
  };
  const mockError = new Error('LinkedIn OAuth token expired or revoked');

  const template = buildReconnectLinkedInTemplate({
    user: mockUser,
    journey: mockJourney,
    entry: mockEntry,
    error: mockError,
  });

  assert(template.subject.includes("We couldn't publish — reconnect LinkedIn"), 'Subject conveys reconnect requirement');
  assert(template.html.includes('/settings'), 'HTML contains link to /settings for re-authentication');
  assert(template.html.includes('Day 12'), 'HTML includes the missed day number');
  assert(template.html.includes('AI Engineering Sprint'), 'HTML includes journey title');
  assert(template.html.includes('Bob Founder'), 'HTML addresses user by name');
  assert(template.text.includes('/settings'), 'Plain text includes link to settings');
}

// -------------------------------------------------------------
// Suite 4: Template 3 - Generation/Publish Failed After Retries
// -------------------------------------------------------------
console.log('\n--- Suite 4: Template 3 - Generation/Publish Failed After Retries ---');

{
  const mockUser = { name: 'Carol Dev', email: 'carol@example.com' };
  const mockJourney = { _id: 'journey_303', title: 'Indie Hacker 100 Days' };
  const mockEntry = {
    dayNumber: 25,
    topic: 'Database Sharding & Caching',
  };
  const mockError = new Error('LinkedIn API 503 Service Unavailable: Rate limit exceeded');

  const template = buildPublishFailedTemplate({
    user: mockUser,
    journey: mockJourney,
    entry: mockEntry,
    error: mockError,
    attempts: 3,
  });

  assert(template.subject.includes('Generation/publish failed after retries'), 'Subject indicates failure after retries');
  assert(template.subject.includes('Day 25'), 'Subject includes day number');
  assert(template.html.includes('LinkedIn API 503 Service Unavailable'), 'HTML includes error message');
  assert(template.html.includes('3 retry attempts'), 'HTML notes retry attempts count');
  assert(template.html.includes('/journeys/journey_303'), 'HTML contains link to review journey entry');
  assert(template.text.includes('LinkedIn API 503 Service Unavailable'), 'Plain text includes error details');
  assert(template.text.includes('/journeys/journey_303'), 'Plain text includes dashboard review link');
}

// -------------------------------------------------------------
// Suite 5: Low-Level sendEmail Provider Dispatch & Validation
// -------------------------------------------------------------
console.log('\n--- Suite 5: Low-Level sendEmail Provider Dispatch & Validation ---');

{
  // Test 5.1: Missing required fields
  let threw = null;
  try {
    await sendEmail({ to: null, subject: 'Hi', html: '<p>Hi</p>' });
  } catch (err) {
    threw = err;
  }
  assert(threw instanceof EmailDeliveryError, 'Throws EmailDeliveryError when "to" recipient is missing');

  // Test 5.2: Mock Delivery Mode
  delete process.env.RESEND_API_KEY;
  delete process.env.SENDGRID_API_KEY;
  const mockResult = await sendEmail({
    to: 'test@example.com',
    subject: 'Mock Email Test',
    html: '<p>Hello Mock World</p>',
  });
  assert(mockResult.success === true, 'Mock sendEmail returns success: true');
  assert(mockResult.mocked === true, 'Mock sendEmail returns mocked: true');
  assert(mockResult.provider === 'mock', 'Mock sendEmail returns provider: "mock"');

  // Test 5.3: Resend REST API Client Mock
  const origAxiosPost = axios.post;
  let resendRequestCaptured = null;
  axios.post = async (url, payload, config) => {
    if (url.includes('api.resend.com')) {
      resendRequestCaptured = { url, payload, config };
      return { data: { id: 're_msg_123456789' } };
    }
    return origAxiosPost(url, payload, config);
  };

  process.env.RESEND_API_KEY = 're_test_live_key_999';
  const resendResult = await sendEmail({
    to: 'resend_user@example.com',
    subject: 'Resend Test',
    html: '<p>Testing Resend Provider</p>',
  });

  assert(resendResult.success === true, 'Resend sendEmail returns success: true');
  assert(resendResult.provider === 'resend', 'Resend sendEmail returns provider: "resend"');
  assert(resendResult.id === 're_msg_123456789', 'Resend sendEmail captures returned message ID');
  assert(
    resendRequestCaptured.config.headers.Authorization === 'Bearer re_test_live_key_999',
    'Resend sends Bearer Authorization header with API key'
  );
  assert(
    resendRequestCaptured.payload.to.includes('resend_user@example.com'),
    'Resend sends recipient list in payload'
  );

  // Test 5.4: SendGrid REST API Client Mock
  delete process.env.RESEND_API_KEY;
  process.env.SENDGRID_API_KEY = 'SG.test_live_key_888';
  let sendgridRequestCaptured = null;
  axios.post = async (url, payload, config) => {
    if (url.includes('api.sendgrid.com')) {
      sendgridRequestCaptured = { url, payload, config };
      return { status: 202, headers: { 'x-message-id': 'sg_msg_987654321' } };
    }
    return origAxiosPost(url, payload, config);
  };

  const sgResult = await sendEmail({
    to: 'sg_user@example.com',
    subject: 'SendGrid Test',
    html: '<p>Testing SendGrid Provider</p>',
  });

  assert(sgResult.success === true, 'SendGrid sendEmail returns success: true');
  assert(sgResult.provider === 'sendgrid', 'SendGrid sendEmail returns provider: "sendgrid"');
  assert(sgResult.id === 'sg_msg_987654321', 'SendGrid sendEmail captures returned x-message-id');
  assert(
    sendgridRequestCaptured.config.headers.Authorization === 'Bearer SG.test_live_key_888',
    'SendGrid sends Bearer Authorization header with API key'
  );
  assert(
    sendgridRequestCaptured.payload.personalizations[0].to[0].email === 'sg_user@example.com',
    'SendGrid sends correctly formatted personalizations structure'
  );

  // Restore axios
  axios.post = origAxiosPost;
  delete process.env.SENDGRID_API_KEY;
}

// -------------------------------------------------------------
// Suite 6: notifyUser Unified Dispatcher Tests
// -------------------------------------------------------------
console.log('\n--- Suite 6: notifyUser Unified Dispatcher Tests ---');

{
  // Setup User mock
  const origUserFindById = User.findById;
  const mockUserStore = new Map([
    ['user_abc_123', { _id: 'user_abc_123', name: 'Dan Builder', email: 'dan@example.com' }],
  ]);

  User.findById = async (id) => {
    return mockUserStore.get(String(id)) || null;
  };

  // Test 6.1: notifyUser with User ID string (DB resolution)
  const mockJourney = { _id: 'journey_dan', title: 'Dan SaaS' };
  const mockEntry = { dayNumber: 1, topic: 'Launch Day' };

  const notifyPublishedRes = await notifyUser('user_abc_123', 'post_published', {
    journey: mockJourney,
    entry: mockEntry,
    postUrn: 'urn:li:share:dan_1',
  });
  assert(notifyPublishedRes.success === true, 'notifyUser resolves user by ID and dispatches post_published');

  // Test 6.2: notifyUser with Reconnect LinkedIn
  const notifyReconnectRes = await notifyUser('user_abc_123', 'reconnect_linkedin', {
    journey: mockJourney,
    entry: mockEntry,
    error: new Error('Token revoked'),
  });
  assert(notifyReconnectRes.success === true, 'notifyUser dispatches reconnect_linkedin');

  // Test 6.3: notifyUser with Publish Failed
  const notifyFailedRes = await notifyUser('user_abc_123', 'publish_failed', {
    journey: mockJourney,
    entry: mockEntry,
    error: new Error('LinkedIn 500 error'),
    attempts: 3,
  });
  assert(notifyFailedRes.success === true, 'notifyUser dispatches publish_failed');

  // Test 6.4: notifyUser skips when user has no email
  const notifyNoEmailRes = await notifyUser('nonexistent_user', 'post_published', {});
  assert(notifyNoEmailRes.success === false, 'notifyUser returns success: false when user not found');
  assert(notifyNoEmailRes.skipped === true, 'notifyUser sets skipped: true flag when user has no email');

  // Restore User.findById
  User.findById = origUserFindById;
}

// -------------------------------------------------------------
// Summary
// -------------------------------------------------------------
console.log('\n====================================================');
console.log(`📊 Email Notifier Unit Tests Summary: ${passed} passed, ${failed} failed`);
console.log('====================================================\n');

process.exit(failed > 0 ? 1 : 0);
