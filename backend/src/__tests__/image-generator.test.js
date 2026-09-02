/**
 * Image generator service tests: prompt building, mocked Pollinations API, Cloudinary fallback.
 * Uses axios-mock-adapter for image fetch + jest.mock for Cloudinary.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import {
  buildImagePrompt,
  fetchImageFromPollinations,
  generatePostImage,
  configureCloudinary,
} from '../services/imageGenerator.js';

let mock;

beforeEach(() => {
  mock = new MockAdapter(axios, { onNoMatch: 'throwException' });
  // Clear Cloudinary env vars so tests hit the direct URL fallback
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
  delete process.env.CLOUDINARY_URL;
});

afterEach(() => {
  mock.restore();
});

describe('buildImagePrompt', () => {
  it('combines imageStyle with topic', () => {
    const prompt = buildImagePrompt(
      { imageStyle: 'cyberpunk neon' },
      { topic: 'Building an API' }
    );
    expect(prompt).toContain('Building an API');
    expect(prompt).toContain('cyberpunk neon');
  });

  it('uses default style when imageStyle is empty', () => {
    const prompt = buildImagePrompt({}, { topic: 'Building in public' });
    expect(prompt).toContain('Building in public');
    expect(prompt).toContain('minimalist');
  });

  it('includes challenge context when provided', () => {
    const prompt = buildImagePrompt(
      {},
      { topic: 'APIs', challenge: 'Rate limiting issues' }
    );
    expect(prompt).toContain('Rate limiting issues');
  });

  it('handles empty journey and entry gracefully', () => {
    const prompt = buildImagePrompt({}, {});
    expect(prompt).toBeDefined();
    expect(prompt.length).toBeGreaterThan(10);
  });
});

describe('fetchImageFromPollinations', () => {
  it('returns buffer and directUrl on success', async () => {
    // Mock the pollinations GET request
    mock.onGet(/image\.pollinations\.ai/).reply(200, Buffer.from('fake-image-data'));

    const result = await fetchImageFromPollinations('test prompt');
    expect(result.directUrl).toContain('image.pollinations.ai');
    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it('falls back to direct URL on timeout/error', async () => {
    mock.onGet(/image\.pollinations\.ai/).timeout();

    const result = await fetchImageFromPollinations('test prompt');
    // Should still return directUrl even on failure
    expect(result.directUrl).toContain('image.pollinations.ai');
    expect(result.buffer).toBeNull();
  });
});

describe('generatePostImage (integration)', () => {
  it('returns direct pollinations URL when Cloudinary is not configured', async () => {
    mock.onGet(/image\.pollinations\.ai/).reply(200, Buffer.from('fake-image'));

    const url = await generatePostImage(
      { imageStyle: 'test style' },
      { topic: 'Test topic', dayNumber: 1 }
    );

    expect(url).toContain('image.pollinations.ai');
  });

  it('falls back to directUrl when image fetch partially fails', async () => {
    // Return empty data, which should trigger fallback but still provide directUrl
    mock.onGet(/image\.pollinations\.ai/).reply(200, Buffer.alloc(0));

    // Because pollinations returns empty data, it throws, but the catch inside
    // fetchImageFromPollinations returns directUrl. The outer fallback handles it.
    const url = await generatePostImage({}, { topic: 'Fallback test' });
    expect(url).toBeDefined();
  });
});

describe('configureCloudinary', () => {
  it('returns false when no Cloudinary credentials are set', () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    delete process.env.CLOUDINARY_URL;
    expect(configureCloudinary()).toBe(false);
  });

  it('returns true when CLOUDINARY_URL is set', () => {
    process.env.CLOUDINARY_URL = 'cloudinary://key:secret@cloud';
    expect(configureCloudinary()).toBe(true);
    delete process.env.CLOUDINARY_URL;
  });

  it('returns true when individual credentials are set', () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test';
    process.env.CLOUDINARY_API_KEY = 'test';
    process.env.CLOUDINARY_API_SECRET = 'test';
    const result = configureCloudinary();
    expect(result).toBe(true);
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
  });
});
