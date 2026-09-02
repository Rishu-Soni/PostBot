/**
 * Text generator service tests: prompt building, hashtag formatting, text cleaning, mocked LLM API.
 * Uses axios-mock-adapter to intercept Gemini API calls.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import {
  formatHashtags,
  buildPrompt,
  cleanGeneratedText,
  generatePostText,
} from '../services/textGenerator.js';

let mock;

beforeEach(() => {
  mock = new MockAdapter(axios, { onNoMatch: 'throwException' });
  process.env.GEMINI_API_KEY = 'test_key';
});

afterEach(() => {
  mock.restore();
  delete process.env.GEMINI_API_KEY;
});

describe('formatHashtags', () => {
  it('converts array of tags to hashtag string', () => {
    expect(formatHashtags(['buildinpublic', 'dev'])).toBe('#buildinpublic #dev');
  });

  it('preserves existing # prefix', () => {
    expect(formatHashtags(['#buildinpublic', 'dev'])).toBe('#buildinpublic #dev');
  });

  it('handles comma-separated string', () => {
    expect(formatHashtags('buildinpublic, dev')).toBe('#buildinpublic #dev');
  });

  it('returns empty string for null/undefined', () => {
    expect(formatHashtags(null)).toBe('');
    expect(formatHashtags(undefined)).toBe('');
  });

  it('returns empty string for empty array', () => {
    expect(formatHashtags([])).toBe('');
  });

  it('trims whitespace from tags', () => {
    expect(formatHashtags(['  buildinpublic  ', '  dev '])).toBe('#buildinpublic #dev');
  });
});

describe('buildPrompt', () => {
  it('fills all placeholders from journey and entry', () => {
    const journey = {
      title: 'My Journey',
      hashtags: ['dev', 'tech'],
      template: 'Day {{dayNumber}}: {{topic}}\n{{challenge}}\n{{hashtags}}',
    };
    const entry = {
      dayNumber: 5,
      topic: 'Building APIs',
      challenge: 'Rate limiting',
      extraNotes: 'Learned a lot',
    };

    const prompt = buildPrompt(journey, entry);

    expect(prompt).toContain('My Journey');
    expect(prompt).toContain('5');
    expect(prompt).toContain('Building APIs');
    expect(prompt).toContain('Rate limiting');
    expect(prompt).toContain('#dev #tech');
    expect(prompt).toContain('Learned a lot');
  });

  it('uses defaults when journey/entry are empty', () => {
    const prompt = buildPrompt({}, {});
    expect(prompt).toContain('My 30-Day Build');
    expect(prompt).toContain('Daily progress update');
  });
});

describe('cleanGeneratedText', () => {
  it('strips markdown code blocks', () => {
    const raw = '```\nHello World\n```';
    expect(cleanGeneratedText(raw)).toBe('Hello World');
  });

  it('strips language-tagged code blocks', () => {
    const raw = '```text\nHello World\n```';
    expect(cleanGeneratedText(raw)).toBe('Hello World');
  });

  it('strips wrapping double quotes', () => {
    expect(cleanGeneratedText('"Hello World"')).toBe('Hello World');
  });

  it('throws on empty/null input', () => {
    expect(() => cleanGeneratedText('')).toThrow();
    expect(() => cleanGeneratedText(null)).toThrow();
    expect(() => cleanGeneratedText(undefined)).toThrow();
  });

  it('preserves clean text without modification', () => {
    expect(cleanGeneratedText('Hello World')).toBe('Hello World');
  });
});

describe('generatePostText (mocked Gemini API)', () => {
  const geminiUrlRegex = /generativelanguage\.googleapis\.com/;

  it('returns cleaned text from mocked Gemini API response', async () => {
    mock.onPost(geminiUrlRegex).reply(200, {
      candidates: [
        {
          content: {
            parts: [{ text: 'Day 1 of My Journey 🚀\n\nToday I learned about APIs.' }],
          },
        },
      ],
    });

    const result = await generatePostText(
      { title: 'Test Journey', hashtags: ['dev'], template: '{{topic}}' },
      { dayNumber: 1, topic: 'APIs', challenge: 'None' }
    );

    expect(result).toContain('Day 1');
    expect(result).toContain('APIs');
  });

  it('throws on API 500 error', async () => {
    mock.onPost(geminiUrlRegex).reply(500, {
      error: { message: 'Internal server error' },
    });

    await expect(
      generatePostText(
        { title: 'Test', template: '{{topic}}' },
        { topic: 'test' }
      )
    ).rejects.toThrow(/LLM generation failed/);
  });

  it('throws when no API key is configured', async () => {
    const savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      await expect(
        generatePostText({ title: 'Test', template: '{{topic}}' }, { topic: 'test' })
      ).rejects.toThrow(/not configured/i);
    } finally {
      process.env.GEMINI_API_KEY = savedKey;
    }
  });

  it('throws when API returns empty candidates', async () => {
    mock.onPost(geminiUrlRegex).reply(200, {
      candidates: [
        { content: { parts: [{ text: '' }] } },
      ],
    });

    await expect(
      generatePostText({ title: 'Test', template: '{{topic}}' }, { topic: 'test' })
    ).rejects.toThrow(/empty or invalid/);
  });
});
