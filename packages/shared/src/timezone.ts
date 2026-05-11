/**
 * Timezone helpers for per-recipient local-time scheduling.
 *
 * Used by:
 *   - CampaignService when a campaign has Campaign.sendAtLocal set ("send at HH:MM in
 *     each contact's local timezone").
 *   - WorkflowExecutionService when a DELAY step uses the localTime variant
 *     ("wait until next Monday 7am in the contact's local timezone").
 *
 * Treatment of null timezone: callers may pass `null` / `undefined`; helpers fall back to UTC.
 *
 * Implementation: dayjs (already a dependency of the API and web apps) with the
 * `utc` and `timezone` plugins. The `timezone` plugin uses Node's Intl IANA TZ
 * database under the hood on Node 20+.
 *
 * Why we always reconstruct a fresh `dayjs.tz(...)` from explicit Y-M-D / H:M
 * components rather than chaining `.add(days).hour(h)`:
 *   The dayjs `timezone` plugin's wall-clock arithmetic preserves the *original*
 *   UTC offset across `.add()` and setter chains. Adding 2 days to a Saturday in
 *   CET (UTC+1) and then calling `.hour(7)` yields 07:00 with offset +60, even if
 *   the target Monday is now in CEST (UTC+2). Reconstructing via
 *   `dayjs.tz('YYYY-MM-DD HH:MM:00', zone)` forces dayjs to look up the offset
 *   from the IANA database for that specific local instant, which is what we want.
 *
 * DST behavior (verified against dayjs 1.11 + Node 20 ICU):
 *   - "spring forward" (clock skips an hour): when the requested wall-clock falls
 *     in the gap (e.g. Madrid 02:30 on 2026-03-29), dayjs auto-advances and returns
 *     the next valid wall-clock instant (post-jump). For Madrid 02:30 → 01:30 UTC
 *     (== 03:30 CEST). We do NOT detect or smooth over the gap separately — dayjs
 *     already returns a valid instant.
 *   - "fall back" (clock repeats an hour): dayjs picks the *first* (pre-shift /
 *     CEST) occurrence by default. For Madrid 02:30 on 2026-10-25 it returns
 *     00:30 UTC (== 02:30 CEST, the earlier of the two repeated wall-clock instants).
 */

import dayjs from 'dayjs';
import timezonePlugin from 'dayjs/plugin/timezone.js';
import utcPlugin from 'dayjs/plugin/utc.js';

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

/**
 * Validate that a string is a known IANA timezone name (e.g. "Europe/Madrid").
 * Returns true for valid IANA names. Returns false for null/undefined/empty/invalid.
 *
 * Intl accepts a few non-IANA POSIX-style abbreviations like "PST" or "EST" — we
 * reject those by requiring the zone to be either exactly "UTC" or to contain a
 * slash, mirroring what luxon's Info.isValidIANAZone enforces. Combined with a
 * try/catch around Intl.DateTimeFormat construction this gives us strict IANA
 * validation without an external library.
 */
export function isValidTimezone(tz: string | null | undefined): tz is string {
  if (!tz || typeof tz !== 'string') return false;
  // Reject POSIX-style abbreviations (PST, EST, GMT, ...). Real IANA names are
  // either "UTC" exactly or contain a region/city separator.
  if (tz !== 'UTC' && !tz.includes('/')) return false;
  try {
    // The Intl constructor throws RangeError on unknown zones.
    new Intl.DateTimeFormat('en-US', {timeZone: tz});
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a contact-supplied timezone to a dayjs-compatible zone string.
 * Null / undefined / empty / non-IANA => "UTC".
 */
export function resolveTimezone(tz: string | null | undefined): string {
  return isValidTimezone(tz) ? tz : 'UTC';
}

/**
 * Parse an "HH:MM" 24-hour time string into {hour, minute}.
 * Throws if the input doesn't match the format or is out of range.
 */
export function parseHHMM(value: string): {hour: number; minute: number} {
  const m = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.exec(value);
  if (!m) {
    throw new Error(`Invalid HH:MM time string: ${value}`);
  }
  return {hour: parseInt(m[1]!, 10), minute: parseInt(m[2]!, 10)};
}

/**
 * Build "YYYY-MM-DD HH:MM:00" string for a given dayjs-in-zone day plus HH:MM.
 * The returned string is suitable for `dayjs.tz(str, zone)`, which re-resolves
 * the UTC offset for that specific local instant.
 */
function buildLocalTimestampString(dayInZone: dayjs.Dayjs, hour: number, minute: number): string {
  const ymd = dayInZone.format('YYYY-MM-DD');
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${ymd} ${hh}:${mm}:00`;
}

/**
 * Compute the next absolute Date at which the given local-time HH:MM occurs in the
 * given timezone, relative to `now`.
 *
 * Rule: if `HH:MM today (local)` is strictly after `now`, return today; otherwise
 * return tomorrow. (i.e. always returns a future instant.)
 *
 * DST notes:
 *   - Spring-forward: if HH:MM falls in the skipped hour, dayjs returns the next
 *     valid wall-clock instant (post-jump). E.g. asking for 02:30 in Europe/Madrid
 *     on 2026-03-29 yields 01:30 UTC (== 03:30 CEST).
 *   - Fall-back: dayjs picks the first (pre-shift / earlier) occurrence of the
 *     repeated wall-clock hour. E.g. asking for 02:30 in Europe/Madrid on
 *     2026-10-25 yields 00:30 UTC (== 02:30 CEST, the pre-shift instance).
 *
 * @param hhmm    "HH:MM" 24-hour time
 * @param tz      IANA timezone name (or null/undefined => UTC)
 * @param now     reference instant (defaults to Date.now())
 */
export function nextLocalTime(hhmm: string, tz: string | null | undefined, now: Date = new Date()): Date {
  const {hour, minute} = parseHHMM(hhmm);
  const zone = resolveTimezone(tz);
  const reference = dayjs(now).tz(zone);

  // Build target: today at HH:MM in the resolved zone, via fresh dayjs.tz() so
  // the offset is re-resolved for the target local instant (DST-correct).
  let target = dayjs.tz(buildLocalTimestampString(reference, hour, minute), zone);

  if (target.valueOf() <= reference.valueOf()) {
    const nextDay = reference.add(1, 'day');
    target = dayjs.tz(buildLocalTimestampString(nextDay, hour, minute), zone);
  }

  return new Date(target.utc().valueOf());
}

/**
 * Compute the next absolute Date at which the given local-time HH:MM occurs in the
 * given timezone *AND* falls on one of the allowed days-of-week, relative to `now`.
 *
 * Day-of-week numbering follows ISO 8601:
 *   1 = Monday, 2 = Tuesday, ..., 7 = Sunday.
 *
 * (Internally we convert to/from dayjs's `.day()` which uses 0=Sunday..6=Saturday.)
 *
 * If `allowedDaysOfWeek` is empty or undefined, behaves like `nextLocalTime` (any day).
 *
 * Used by the workflow DELAY localTime variant for "send at 7am on Mondays" semantics.
 *
 * Same DST behavior as `nextLocalTime`: spring-forward auto-advances to the next
 * valid wall-clock; fall-back picks the earlier (pre-shift) of the two repeated
 * wall-clock instants.
 */
export function nextLocalTimeOnDayOfWeek(
  hhmm: string,
  tz: string | null | undefined,
  allowedDaysOfWeek: number[] | undefined,
  now: Date = new Date(),
): Date {
  const {hour, minute} = parseHHMM(hhmm);
  const zone = resolveTimezone(tz);
  const reference = dayjs(now).tz(zone);

  const allowed = (allowedDaysOfWeek ?? []).filter(d => Number.isInteger(d) && d >= 1 && d <= 7);
  // No constraint => behave like nextLocalTime.
  if (allowed.length === 0) {
    return nextLocalTime(hhmm, tz, now);
  }

  // Walk forward up to 14 days. Reconstruct each candidate via dayjs.tz() so the
  // UTC offset is re-resolved correctly across DST transitions inside the window.
  for (let offset = 0; offset < 14; offset++) {
    const candidateDay = reference.add(offset, 'day');
    const candidate = dayjs.tz(buildLocalTimestampString(candidateDay, hour, minute), zone);
    // Convert dayjs day() (0=Sun..6=Sat) to ISO weekday (1=Mon..7=Sun).
    const dayJsDow = candidate.day();
    const isoDow = dayJsDow === 0 ? 7 : dayJsDow;
    if (!allowed.includes(isoDow)) continue;
    if (candidate.valueOf() <= reference.valueOf()) continue;
    return new Date(candidate.utc().valueOf());
  }

  // Defensive fallback (unreachable for any non-empty allowed set):
  return nextLocalTime(hhmm, tz, now);
}

/**
 * Compute milliseconds to delay from `now` until the next local-time HH:MM in `tz`.
 * Returns a non-negative integer. Convenience wrapper around `nextLocalTime`.
 */
export function msUntilNextLocalTime(hhmm: string, tz: string | null | undefined, now: Date = new Date()): number {
  return Math.max(0, nextLocalTime(hhmm, tz, now).getTime() - now.getTime());
}

/**
 * Compute the absolute UTC Date for a specific local calendar date+time in `tz`.
 *
 * Unlike {@link nextLocalTime}, this does NOT auto-advance to the next day when the
 * resolved moment is in the past — callers should validate the result against `now`
 * themselves. Used by campaign `sendAtLocal` when a specific `sendAtLocalDate` is set
 * (e.g. "Tuesday May 12 at 06:00 in each contact's local timezone").
 *
 * Same DST behavior as `nextLocalTime`:
 *   - Spring-forward: HH:MM inside the skipped hour returns the next valid wall-clock.
 *   - Fall-back: HH:MM inside the repeated hour returns the first (pre-shift) instant.
 *
 * @param yyyymmdd  "YYYY-MM-DD" local calendar date in `tz`
 * @param hhmm      "HH:MM" 24-hour local time in `tz`
 * @param tz        IANA timezone name (or null/undefined => UTC)
 */
export function localDateTimeToUtc(
  yyyymmdd: string,
  hhmm: string,
  tz: string | null | undefined,
): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) {
    throw new Error(`localDateTimeToUtc: date must be YYYY-MM-DD, got "${yyyymmdd}"`);
  }
  const {hour, minute} = parseHHMM(hhmm);
  const zone = resolveTimezone(tz);
  const local = dayjs.tz(`${yyyymmdd}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`, zone);
  return new Date(local.utc().valueOf());
}

/**
 * Compute milliseconds to delay from `now` until the next allowed-DOW + HH:MM in `tz`.
 * Returns a non-negative integer.
 */
export function msUntilNextLocalTimeOnDayOfWeek(
  hhmm: string,
  tz: string | null | undefined,
  allowedDaysOfWeek: number[] | undefined,
  now: Date = new Date(),
): number {
  return Math.max(0, nextLocalTimeOnDayOfWeek(hhmm, tz, allowedDaysOfWeek, now).getTime() - now.getTime());
}
