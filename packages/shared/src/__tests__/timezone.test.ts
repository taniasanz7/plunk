import dayjs from 'dayjs';
import timezonePlugin from 'dayjs/plugin/timezone.js';
import utcPlugin from 'dayjs/plugin/utc.js';
import {describe, expect, it} from 'vitest';

import {
  isValidTimezone,
  msUntilNextLocalTime,
  msUntilNextLocalTimeOnDayOfWeek,
  nextLocalTime,
  nextLocalTimeOnDayOfWeek,
  parseHHMM,
  resolveTimezone,
} from '../timezone.js';

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

describe('timezone helpers (Patch #11)', () => {
  describe('isValidTimezone', () => {
    it('accepts valid IANA timezone names', () => {
      expect(isValidTimezone('Europe/Madrid')).toBe(true);
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
      expect(isValidTimezone('Pacific/Auckland')).toBe(true);
    });

    it('rejects invalid / empty / null timezone strings', () => {
      expect(isValidTimezone('Not/A_Zone')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
      expect(isValidTimezone(null)).toBe(false);
      expect(isValidTimezone(undefined)).toBe(false);
      expect(isValidTimezone('PST')).toBe(false); // POSIX abbreviation, not a real IANA name
    });
  });

  describe('resolveTimezone', () => {
    it('falls back to UTC for null / undefined / invalid', () => {
      expect(resolveTimezone(null)).toBe('UTC');
      expect(resolveTimezone(undefined)).toBe('UTC');
      expect(resolveTimezone('')).toBe('UTC');
      expect(resolveTimezone('Bogus/Zone')).toBe('UTC');
    });

    it('returns the original IANA name when valid', () => {
      expect(resolveTimezone('Europe/Madrid')).toBe('Europe/Madrid');
      expect(resolveTimezone('America/New_York')).toBe('America/New_York');
    });
  });

  describe('parseHHMM', () => {
    it('parses well-formed HH:MM', () => {
      expect(parseHHMM('07:00')).toEqual({hour: 7, minute: 0});
      expect(parseHHMM('23:30')).toEqual({hour: 23, minute: 30});
      expect(parseHHMM('00:00')).toEqual({hour: 0, minute: 0});
      expect(parseHHMM('9:05')).toEqual({hour: 9, minute: 5}); // single-digit hour ok
    });

    it('throws on invalid input', () => {
      expect(() => parseHHMM('25:00')).toThrow();
      expect(() => parseHHMM('07:60')).toThrow();
      expect(() => parseHHMM('7:0')).toThrow();
      expect(() => parseHHMM('hello')).toThrow();
    });
  });

  describe('nextLocalTime', () => {
    it('returns today if HH:MM is later today (in target tz)', () => {
      // Reference: 2026-06-15 06:00 UTC. In Europe/Madrid (UTC+2 in summer DST), local is 08:00.
      // Asking for 09:00 local should return today at 09:00 Madrid = 07:00 UTC.
      const ref = new Date('2026-06-15T06:00:00Z');
      const result = nextLocalTime('09:00', 'Europe/Madrid', ref);
      expect(result.toISOString()).toBe('2026-06-15T07:00:00.000Z');
    });

    it('returns tomorrow if HH:MM has already passed today', () => {
      // Reference: 2026-06-15 12:00 UTC -> 14:00 Madrid. Asking for 09:00 -> tomorrow 09:00 Madrid.
      const ref = new Date('2026-06-15T12:00:00Z');
      const result = nextLocalTime('09:00', 'Europe/Madrid', ref);
      expect(result.toISOString()).toBe('2026-06-16T07:00:00.000Z');
    });

    it('treats null / undefined / invalid timezone as UTC', () => {
      const ref = new Date('2026-06-15T06:00:00Z');
      expect(nextLocalTime('09:00', null, ref).toISOString()).toBe('2026-06-15T09:00:00.000Z');
      expect(nextLocalTime('09:00', undefined, ref).toISOString()).toBe('2026-06-15T09:00:00.000Z');
      expect(nextLocalTime('09:00', 'Bogus/Zone', ref).toISOString()).toBe('2026-06-15T09:00:00.000Z');
    });

    it('handles DST spring-forward gap (Europe/Madrid 2026-03-29 02:00 -> 03:00)', () => {
      // Reference: 2026-03-29 00:30 UTC -> 01:30 CET (Madrid, before jump).
      // Madrid jumps from 02:00 CET -> 03:00 CEST at 01:00 UTC. Asking for "02:30 local"
      // on this day falls into the skipped hour; dayjs auto-advances to the next valid
      // wall-clock instant, which is 03:30 CEST = 01:30 UTC.
      const ref = new Date('2026-03-29T00:30:00Z');
      const result = nextLocalTime('02:30', 'Europe/Madrid', ref);
      expect(result.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    });

    it('handles DST fall-back transition (Europe/Madrid 2026-10-25)', () => {
      // Reference: 2026-10-25 00:00 UTC. Madrid fall-back: 03:00 CEST -> 02:00 CET at
      // 01:00 UTC, so 02:30 happens twice. dayjs picks the first (pre-shift, CEST)
      // occurrence: 02:30 CEST = 00:30 UTC.
      const ref = new Date('2026-10-25T00:00:00Z');
      const result = nextLocalTime('02:30', 'Europe/Madrid', ref);
      expect(result.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    });

    it('handles disparate timezones independently', () => {
      // Same reference (12:00 UTC). Sending at "07:00 local":
      //   - Europe/Madrid (UTC+2 summer): 14:00 local now -> tomorrow 07:00 local = 05:00 UTC.
      //   - America/New_York (UTC-4 summer): 08:00 local now -> tomorrow 07:00 local = 11:00 UTC.
      //   - UTC: 12:00 -> tomorrow 07:00 UTC.
      const ref = new Date('2026-06-15T12:00:00Z');
      const madrid = nextLocalTime('07:00', 'Europe/Madrid', ref);
      const ny = nextLocalTime('07:00', 'America/New_York', ref);
      const utc = nextLocalTime('07:00', null, ref);
      expect(madrid.toISOString()).toBe('2026-06-16T05:00:00.000Z');
      expect(ny.toISOString()).toBe('2026-06-16T11:00:00.000Z');
      expect(utc.toISOString()).toBe('2026-06-16T07:00:00.000Z');
    });
  });

  describe('nextLocalTimeOnDayOfWeek', () => {
    it('Monday 07:00 in Europe/Madrid from a Saturday afternoon resolves to Monday', () => {
      // 2026-05-09 14:00 UTC = Saturday 16:00 Madrid (CEST, UTC+2).
      // Next Monday 07:00 Madrid = 2026-05-11 05:00 UTC.
      const sat = new Date('2026-05-09T14:00:00Z');
      const result = nextLocalTimeOnDayOfWeek('07:00', 'Europe/Madrid', [1], sat);
      expect(result.toISOString()).toBe('2026-05-11T05:00:00.000Z');
      // Sanity: Monday in Madrid time. dayjs.day() is 0=Sun..6=Sat.
      expect(dayjs(result).tz('Europe/Madrid').day()).toBe(1);
    });

    it('null/undefined timezone is treated as UTC', () => {
      // Saturday 14:00 UTC -> next Monday 07:00 UTC.
      const sat = new Date('2026-05-09T14:00:00Z');
      const result = nextLocalTimeOnDayOfWeek('07:00', null, [1], sat);
      expect(result.toISOString()).toBe('2026-05-11T07:00:00.000Z');
    });

    it('returns next-week occurrence when same DOW but HH:MM already passed today', () => {
      // Monday 08:00 UTC asking for Monday 07:00 UTC -> next Monday (a week later).
      const mon = new Date('2026-05-11T08:00:00Z');
      const result = nextLocalTimeOnDayOfWeek('07:00', 'UTC', [1], mon);
      expect(result.toISOString()).toBe('2026-05-18T07:00:00.000Z');
    });

    it('empty allowedDaysOfWeek behaves like nextLocalTime', () => {
      const ref = new Date('2026-06-15T06:00:00Z');
      const a = nextLocalTimeOnDayOfWeek('09:00', 'Europe/Madrid', [], ref);
      const b = nextLocalTime('09:00', 'Europe/Madrid', ref);
      expect(a.toISOString()).toBe(b.toISOString());
    });

    it('finds the right day across a week-boundary', () => {
      // From Wednesday, asking for Tue 09:00 UTC -> next Tuesday (6 days later).
      const wed = new Date('2026-05-13T12:00:00Z');
      const result = nextLocalTimeOnDayOfWeek('09:00', 'UTC', [2], wed);
      expect(result.toISOString()).toBe('2026-05-19T09:00:00.000Z');
    });

    it('DST transition during the delay window (EU spring-forward)', () => {
      // From 2026-03-28 (Saturday before EU DST jump on Sunday 29 March).
      // Asking for next Monday 07:00 in Europe/Madrid. Monday is the day after DST kicks in,
      // so Monday 07:00 Madrid = 05:00 UTC (CEST = UTC+2), not 06:00 UTC (CET).
      const sat = new Date('2026-03-28T14:00:00Z');
      const result = nextLocalTimeOnDayOfWeek('07:00', 'Europe/Madrid', [1], sat);
      expect(result.toISOString()).toBe('2026-03-30T05:00:00.000Z');
    });
  });

  describe('msUntilNextLocalTime / msUntilNextLocalTimeOnDayOfWeek', () => {
    it('returns non-negative ms until next instant', () => {
      const ref = new Date('2026-06-15T06:00:00Z');
      const ms = msUntilNextLocalTime('09:00', 'Europe/Madrid', ref);
      expect(ms).toBe(60 * 60 * 1000); // 1 hour exactly
    });

    it('Monday 7am from Saturday in Madrid -> 39h delay', () => {
      const sat = new Date('2026-05-09T14:00:00Z');
      const ms = msUntilNextLocalTimeOnDayOfWeek('07:00', 'Europe/Madrid', [1], sat);
      // 2026-05-09 14:00 UTC -> 2026-05-11 05:00 UTC = 39 hours = 39 * 3600 * 1000 ms.
      expect(ms).toBe(39 * 60 * 60 * 1000);
    });
  });
});
