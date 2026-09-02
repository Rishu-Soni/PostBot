/**
 * Email Notifier tests: template routing, mock email provider isolation.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import User from '../models/User.js';

// We mock the generic sendEmail function to intercept and verify calls,
// preventing any real network requests regardless of configured provider.
jest.unstable_mockModule('../services/notifier.js', async () => {
  const originalModule = await import('../services/notifier.js');
  return {
    ...originalModule,
    sendEmail: jest.fn().mockResolvedValue({ id: 'mocked_email_id' }),
  };
});

const {
  notifyUser,
  sendPostPublishedEmail,
  sendReconnectLinkedInEmail,
  sendPublishFailedEmail,
  sendEmail,
} = await import('../services/notifier.js');

let user;

beforeEach(async () => {
  jest.clearAllMocks();
  user = new User({
    name: 'Notifier User',
    email: 'notify@example.com',
    passwordHash: 'hash',
  });
  await user.save();
});

describe('sendPostPublishedEmail', () => {
  it('calls sendEmail with correct subject containing day number and topic', async () => {
    const journey = { title: 'Test Journey' };
    const entry = { dayNumber: 5, topic: 'Testing' };
    const postUrn = 'urn:li:share:123';

    await sendPostPublishedEmail(user.email, user.name, { journey, entry, postUrn });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const args = sendEmail.mock.calls[0];
    expect(args[0]).toBe('notify@example.com');
    // Subject pattern check
    expect(args[1]).toMatch(/Day 5.*Testing/i);
    // HTML body check
    expect(args[2]).toContain(postUrn);
  });
});

describe('sendReconnectLinkedInEmail', () => {
  it('calls sendEmail with reconnect subject and settings URL', async () => {
    const error = new Error('Token expired');

    await sendReconnectLinkedInEmail(user.email, user.name, { error });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const args = sendEmail.mock.calls[0];
    // Subject pattern check
    expect(args[1]).toMatch(/Action Required.*Reconnect/i);
    // HTML body check
    expect(args[2]).toContain('/settings');
    expect(args[2]).toContain('Token expired');
  });
});

describe('sendPublishFailedEmail', () => {
  it('calls sendEmail with failure subject containing journey title', async () => {
    const journey = { title: 'My Failed Journey' };
    const entry = { dayNumber: 2 };
    const error = new Error('API Timeout');
    const attempts = 3;

    await sendPublishFailedEmail(user.email, user.name, { journey, entry, error, attempts });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const args = sendEmail.mock.calls[0];
    // Subject pattern check
    expect(args[1]).toMatch(/Failed to publish.*My Failed Journey/i);
    // HTML body check
    expect(args[2]).toContain('API Timeout');
    expect(args[2]).toContain('Day 2');
    expect(args[2]).toContain('3 attempts');
  });
});

describe('notifyUser routing', () => {
  it('routes "post_published" type correctly', async () => {
    await notifyUser(user._id, 'post_published', {
      journey: { title: 'T' },
      entry: { dayNumber: 1, topic: 'A' },
      postUrn: 'urn:123',
    });
    expect(sendEmail).toHaveBeenCalled();
    expect(sendEmail.mock.calls[0][1]).toMatch(/Day 1/);
  });

  it('routes "reconnect_linkedin" type correctly', async () => {
    await notifyUser(user._id, 'reconnect_linkedin', { error: new Error('Err') });
    expect(sendEmail).toHaveBeenCalled();
    expect(sendEmail.mock.calls[0][1]).toMatch(/Reconnect/);
  });

  it('routes "publish_failed" type correctly', async () => {
    await notifyUser(user._id, 'publish_failed', {
      journey: { title: 'T' },
      entry: { dayNumber: 1 },
      error: new Error('Err'),
      attempts: 3,
    });
    expect(sendEmail).toHaveBeenCalled();
    expect(sendEmail.mock.calls[0][1]).toMatch(/Failed/);
  });

  it('logs warning and does not crash for unknown notification type', async () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await notifyUser(user._id, 'unknown_type', {});
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown notification type'));
    expect(sendEmail).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('throws error if user not found', async () => {
    const fakeId = '507f1f77bcf86cd799439011';
    await expect(notifyUser(fakeId, 'post_published', {}))
      .rejects.toThrow(/User not found/);
  });
});
