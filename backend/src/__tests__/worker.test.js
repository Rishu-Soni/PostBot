/**
 * Worker/processor tests: tests the dailyPostsProcessor directly with mock dependencies.
 * Validates planned->generated->posted lifecycle, double-post protection, error handling.
 */
import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import DailyEntry from '../models/DailyEntry.js';
import Journey from '../models/Journey.js';
import User from '../models/User.js';

// We import the processor logic directly to inject mock services
import { dailyPostsProcessor } from '../jobs/worker.js';
import { LinkedInReauthRequiredError } from '../services/linkedinAuth.js';

let user, journey;

beforeAll(async () => {
  user = new User({
    name: 'Worker User',
    email: 'worker@example.com',
    passwordHash: 'hash',
  });
  await user.save();

  journey = new Journey({
    userId: user._id,
    title: 'Worker Journey',
    template: '{{topic}}',
  });
  await journey.save();
});

// Helper: creates a fresh DailyEntry for testing
async function createEntry(status = 'planned') {
  const entry = new DailyEntry({
    journeyId: journey._id,
    dayNumber: 1,
    scheduledDate: new Date(),
    topic: 'Worker Test',
    status,
  });
  await entry.save();
  return entry;
}

// Create basic mock services that succeed
const createMockServices = () => ({
  generatePostText: jest.fn().mockResolvedValue('Mocked text'),
  generatePostImage: jest.fn().mockResolvedValue('Mocked image url'),
  publishEntry: jest.fn().mockResolvedValue('urn:li:share:123'),
  notifyUser: jest.fn().mockResolvedValue(true),
});

describe('dailyPostsProcessor', () => {
  it('processes a planned entry: generates text/image, publishes, and updates status', async () => {
    const entry = await createEntry('planned');
    const mockJob = { id: 'job_1', data: { entryId: entry._id.toString() }, opts: { attempts: 3 }, attemptsMade: 0 };
    const services = createMockServices();

    const result = await dailyPostsProcessor(mockJob, services);

    expect(result.success).toBe(true);
    expect(result.status).toBe('posted');
    expect(result.postUrn).toBe('urn:li:share:123');

    // Verify mocks called
    expect(services.generatePostText).toHaveBeenCalled();
    expect(services.generatePostImage).toHaveBeenCalled();
    expect(services.publishEntry).toHaveBeenCalled();
    expect(services.notifyUser).toHaveBeenCalledWith(user._id, 'post_published', expect.any(Object));

    // Verify DB state
    const updatedEntry = await DailyEntry.findById(entry._id);
    expect(updatedEntry.status).toBe('posted');
    expect(updatedEntry.generatedText).toBe('Mocked text');
    expect(updatedEntry.generatedImageUrl).toBe('Mocked image url');
    expect(updatedEntry.linkedinPostUrn).toBe('urn:li:share:123');
  });

  it('skips processing if entry is already posted (double-post protection)', async () => {
    const entry = await createEntry('posted');
    const mockJob = { id: 'job_2', data: { entryId: entry._id.toString() } };
    const services = createMockServices();

    const result = await dailyPostsProcessor(mockJob, services);

    expect(result.alreadyPosted).toBe(true);
    expect(services.generatePostText).not.toHaveBeenCalled();
    expect(services.publishEntry).not.toHaveBeenCalled();
  });

  it('handles LinkedInReauthRequiredError gracefully without BullMQ retry', async () => {
    const entry = await createEntry('generated');
    const mockJob = { id: 'job_3', data: { entryId: entry._id.toString() }, opts: { attempts: 3 }, attemptsMade: 0 };
    const services = createMockServices();

    // Make publish throw reauth error
    services.publishEntry.mockRejectedValue(new LinkedInReauthRequiredError('Reauth needed'));

    const result = await dailyPostsProcessor(mockJob, services);

    // It should RETURN (not throw) so BullMQ doesn't infinitely retry
    expect(result.success).toBe(false);
    expect(result.unrecoverable).toBe(true);
    expect(result.error).toBe('reauth required');

    // Verify DB state
    const updatedEntry = await DailyEntry.findById(entry._id);
    expect(updatedEntry.status).toBe('failed');
    expect(updatedEntry.error).toBe('reauth required');

    // Verify notifyUser was called with the reconnect template
    expect(services.notifyUser).toHaveBeenCalledWith(user._id, 'reconnect_linkedin', expect.any(Object));
  });

  it('throws generic errors for BullMQ retry, marks as failed', async () => {
    const entry = await createEntry('planned');
    const mockJob = { id: 'job_4', data: { entryId: entry._id.toString() }, opts: { attempts: 3 }, attemptsMade: 0 };
    const services = createMockServices();

    services.generatePostText.mockRejectedValue(new Error('LLM API down'));

    await expect(dailyPostsProcessor(mockJob, services)).rejects.toThrow('LLM API down');

    // Verify DB state
    const updatedEntry = await DailyEntry.findById(entry._id);
    expect(updatedEntry.status).toBe('failed');
    expect(updatedEntry.error).toContain('LLM API down');

    // Because it's attempt 0 (not final), publish_failed notifyUser should NOT be called
    expect(services.notifyUser).not.toHaveBeenCalled();
  });

  it('sends publish_failed notification on final attempt failure', async () => {
    const entry = await createEntry('failed');
    // Simulate final attempt (attempts: 3, attemptsMade: 2 -> next is final)
    const mockJob = { id: 'job_5', data: { entryId: entry._id.toString() }, opts: { attempts: 3 }, attemptsMade: 2 };
    const services = createMockServices();

    services.publishEntry.mockRejectedValue(new Error('Persistent network error'));

    await expect(dailyPostsProcessor(mockJob, services)).rejects.toThrow('Persistent network error');

    // Verify notifyUser was called with publish_failed
    expect(services.notifyUser).toHaveBeenCalledWith(user._id, 'publish_failed', expect.any(Object));
  });

  it('proceeds even if image generation fails', async () => {
    const entry = await createEntry('planned');
    const mockJob = { id: 'job_6', data: { entryId: entry._id.toString() }, opts: { attempts: 3 }, attemptsMade: 0 };
    const services = createMockServices();

    services.generatePostImage.mockRejectedValue(new Error('Image API down'));

    const result = await dailyPostsProcessor(mockJob, services);

    // Should still succeed as a text-only post
    expect(result.success).toBe(true);
    expect(services.publishEntry).toHaveBeenCalled();

    const updatedEntry = await DailyEntry.findById(entry._id);
    expect(updatedEntry.generatedText).toBe('Mocked text');
    expect(updatedEntry.generatedImageUrl).toBeUndefined();
  });
});
