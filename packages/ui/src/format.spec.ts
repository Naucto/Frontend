import { formatBytes, formatCompact, formatCount, formatElapsed, formatRelative } from './format';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const NOW = new Date('2024-03-15T00:00:00Z').getTime();

describe('formatRelative', () => {
  it('reads an invalid date as nothing to show', () => {
    expect(formatRelative('not-a-date', NOW)).toBe('');
  });

  it('treats a future moment the same as one just past', () => {
    expect(formatRelative(NOW + HOUR, NOW)).toBe('just now');
  });

  it('is "just now" right up to the minute', () => {
    expect(formatRelative(NOW - (MINUTE - 1_000), NOW)).toBe('just now');
  });

  it('counts single minutes from the minute', () => {
    expect(formatRelative(NOW - MINUTE, NOW)).toBe('1 minute ago');
  });

  it('counts single hours from the hour', () => {
    expect(formatRelative(NOW - HOUR, NOW)).toBe('1 hour ago');
  });

  it('is "yesterday" from a full day', () => {
    expect(formatRelative(NOW - DAY, NOW)).toBe('yesterday');
  });

  it('counts days from two full days', () => {
    expect(formatRelative(NOW - 2 * DAY, NOW)).toBe('2 days ago');
  });

  it('counts weeks from a full week', () => {
    expect(formatRelative(NOW - WEEK, NOW)).toBe('1 week ago');
  });

  it('falls back to month and year from five weeks', () => {
    const then = NOW - 5 * WEEK;
    expect(formatRelative(then, NOW)).toBe(
      new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(then),
    );
  });
});

describe('formatElapsed', () => {
  it('is "just now" right up to the minute, and never negative', () => {
    expect(formatElapsed(NOW - (MINUTE - 1_000), NOW)).toBe('just now');
    expect(formatElapsed(NOW + HOUR, NOW)).toBe('just now');
  });

  it('counts minutes from the minute', () => {
    expect(formatElapsed(NOW - MINUTE, NOW)).toBe('1 min');
  });

  it('counts hours from the hour', () => {
    expect(formatElapsed(NOW - HOUR, NOW)).toBe('1 h');
  });

  it('counts days from the day', () => {
    expect(formatElapsed(NOW - DAY, NOW)).toBe('1 d');
  });

  it('reads an invalid date as nothing to show', () => {
    expect(formatElapsed('not-a-date', NOW)).toBe('');
  });
});

describe('formatBytes', () => {
  it('stays in kilobytes just under a megabyte', () => {
    expect(formatBytes(1024 * 1024 - 1)).toBe('1024 KB');
  });

  it('switches to megabytes at a full megabyte', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
  });
});

describe('formatCount', () => {
  it('groups thousands with a thin space', () => {
    expect(formatCount(1008)).toBe('1 008');
  });
});

describe('formatCompact', () => {
  it('shortens to one decimal and a lowercase unit', () => {
    expect(formatCompact(1247)).toBe('1.2k');
  });
});
