/**
 * Scheduler tests: validates isEntryDue logic across timezones and edge cases.
 */
import { describe, it, expect } from '@jest/globals';
import { isEntryDue } from '../jobs/scheduler.js';

describe('isEntryDue', () => {
  // Use a fixed "now" date for deterministic tests by overriding global.Date
  const RealDate = Date;
  const mockNow = new Date('2026-09-02T12:00:00.000Z'); // 12:00 PM UTC

  beforeEach(() => {
    global.Date = class extends RealDate {
      constructor(...args) {
        if (args.length === 0) {
          super(mockNow);
        } else {
          super(...args);
        }
      }
      static now() {
        return mockNow.getTime();
      }
    };
  });

  afterEach(() => {
    global.Date = RealDate;
  });

  it('returns true if entry scheduled date is in the past', () => {
    const pastDate = '2026-09-01T00:00:00.000Z'; // Yesterday
    expect(isEntryDue(pastDate, '09:00', 'UTC')).toBe(true);
    expect(isEntryDue(pastDate, '18:00', 'UTC')).toBe(true); // Even if post time is later, day is past
  });

  it('returns false if entry scheduled date is in the future', () => {
    const futureDate = '2026-09-03T00:00:00.000Z'; // Tomorrow
    expect(isEntryDue(futureDate, '09:00', 'UTC')).toBe(false);
  });

  it('returns true if scheduled today and current time >= post time', () => {
    const today = '2026-09-02T00:00:00.000Z';
    // Current mock time is 12:00 UTC. Post time is 09:00 -> due.
    expect(isEntryDue(today, '09:00', 'UTC')).toBe(true);
    // Post time is exactly 12:00 -> due.
    expect(isEntryDue(today, '12:00', 'UTC')).toBe(true);
  });

  it('returns false if scheduled today but current time < post time', () => {
    const today = '2026-09-02T00:00:00.000Z';
    // Current mock time is 12:00 UTC. Post time is 14:00 -> not due.
    expect(isEntryDue(today, '14:00', 'UTC')).toBe(false);
  });

  it('correctly handles user timezones (America/New_York)', () => {
    const today = '2026-09-02T00:00:00.000Z';
    // Mock time: 12:00 UTC -> 08:00 AM EDT (New York)
    // Post time 09:00 New York -> not due yet (it is 8am there)
    expect(isEntryDue(today, '09:00', 'America/New_York')).toBe(false);

    // Post time 07:00 New York -> due (it is 8am there)
    expect(isEntryDue(today, '07:00', 'America/New_York')).toBe(true);
  });

  it('correctly handles user timezones (Asia/Kolkata)', () => {
    const today = '2026-09-02T00:00:00.000Z';
    // Mock time: 12:00 UTC -> 17:30 IST (Kolkata)
    // Post time 18:00 Kolkata -> not due yet (it is 17:30 there)
    expect(isEntryDue(today, '18:00', 'Asia/Kolkata')).toBe(false);

    // Post time 16:00 Kolkata -> due
    expect(isEntryDue(today, '16:00', 'Asia/Kolkata')).toBe(true);
  });

  it('falls back to UTC for invalid timezones', () => {
    const today = '2026-09-02T00:00:00.000Z';
    // "Fake/Timezone" will throw in Intl.DateTimeFormat, caught and fallback to UTC (12:00)
    // 09:00 UTC -> due
    expect(isEntryDue(today, '09:00', 'Fake/Timezone')).toBe(true);
    // 14:00 UTC -> not due
    expect(isEntryDue(today, '14:00', 'Fake/Timezone')).toBe(false);
  });

  it('handles invalid scheduledDate by returning false', () => {
    expect(isEntryDue('invalid-date-string')).toBe(false);
    expect(isEntryDue(null)).toBe(false);
  });
});
