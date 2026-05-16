/**
 * Tests for detectUnsubscribeSignal — the HEADLESS-template safety check.
 *
 * Background: HEADLESS templates skip Plunk's auto-injected footer, so the
 * author is responsible for providing an unsubscribe path. The editor uses
 * this detector to surface a warning when no such signal is present.
 *
 * Patch #20 layouts/master-templates: the unsubscribe link can legitimately
 * live in the wrapping Layout's body (e.g. shared footer with {{unsubscribeUrl}}).
 * The detector must therefore accept an optional second argument and consider
 * a signal in EITHER body sufficient. Old single-arg callers must keep working.
 */
import {describe, expect, it} from 'vitest';

import {detectUnsubscribeSignal} from '../unsubscribe.js';

describe('detectUnsubscribeSignal — body-only (back-compat)', () => {
  it('detects {{unsubscribeUrl}} in the body', () => {
    expect(detectUnsubscribeSignal('<p>Hi</p><a href="{{unsubscribeUrl}}">Unsubscribe</a>')).toBe(true);
  });

  it('detects {{manageUrl}} in the body', () => {
    expect(detectUnsubscribeSignal('<a href="{{manageUrl}}">Manage preferences</a>')).toBe(true);
  });

  it('detects href containing "unsubscribe"', () => {
    expect(detectUnsubscribeSignal('<a href="https://example.com/unsubscribe?id=1">x</a>')).toBe(true);
  });

  it('detects href containing "opt-out"', () => {
    expect(detectUnsubscribeSignal('<a href="https://example.com/opt-out">x</a>')).toBe(true);
  });

  it('detects anchor text "Unsubscribe"', () => {
    expect(detectUnsubscribeSignal('<a href="https://example.com/x">Unsubscribe</a>')).toBe(true);
  });

  it('returns false when no signal is present', () => {
    expect(detectUnsubscribeSignal('<p>Just a friendly hello</p>')).toBe(false);
  });

  it('returns false for empty body', () => {
    expect(detectUnsubscribeSignal('')).toBe(false);
  });
});

describe('detectUnsubscribeSignal — with layout body (patch #20)', () => {
  const FOOTER_WITH_UNSUB = '<footer><a href="{{unsubscribeUrl}}">Unsubscribe</a></footer>';
  const PLAIN_BODY = '<p>Bonus content goes here.</p>';

  it('returns true when signal lives only in the layout body', () => {
    // The bug being fixed: template body has no unsub link, but the Layout footer does.
    expect(detectUnsubscribeSignal(PLAIN_BODY, FOOTER_WITH_UNSUB)).toBe(true);
  });

  it('returns true when signal is in the template body, layout is empty', () => {
    expect(
      detectUnsubscribeSignal('<a href="{{unsubscribeUrl}}">u</a>', '<p>empty layout</p>'),
    ).toBe(true);
  });

  it('returns true when both bodies carry a signal', () => {
    expect(detectUnsubscribeSignal('<a href="{{manageUrl}}">m</a>', FOOTER_WITH_UNSUB)).toBe(true);
  });

  it('returns false when neither body carries a signal', () => {
    expect(detectUnsubscribeSignal(PLAIN_BODY, '<footer>(c) 2026</footer>')).toBe(false);
  });

  it('falls back to body-only when layoutBody is null', () => {
    expect(detectUnsubscribeSignal('<a href="{{unsubscribeUrl}}">u</a>', null)).toBe(true);
    expect(detectUnsubscribeSignal(PLAIN_BODY, null)).toBe(false);
  });

  it('falls back to body-only when layoutBody is undefined', () => {
    expect(detectUnsubscribeSignal('<a href="{{unsubscribeUrl}}">u</a>', undefined)).toBe(true);
    expect(detectUnsubscribeSignal(PLAIN_BODY, undefined)).toBe(false);
  });

  it('falls back to body-only when layoutBody is empty string', () => {
    expect(detectUnsubscribeSignal(PLAIN_BODY, '')).toBe(false);
  });
});
