/**
 * Tests for the LiquidJS-backed template engine (patch #7).
 *
 * Coverage targets per the patch spec:
 *   1. Plain {{var}} and {{nested.path}} (regression).
 *   2. {{var ?? default}} falsy-fallback semantics.
 *   3. {% if %}/{% else %}/{% endif %} branches.
 *   4. {% assign x = ... | filter %} → {{x}}.
 *   5. "Advance to next Monday" date-math from migration notes.
 *   6. HTML output is NOT auto-escaped (email body context).
 *   7. Async behavior works correctly.
 *
 * Plus: scope-merge backward compat, capitalize/upcase filters, default vs falsy_default
 * distinction, and the sync helper for the EmailEditor preview path.
 */
import {describe, expect, it} from 'vitest';

import {renderSubject, renderSubjectSync, renderTemplate, renderTemplateSync} from '../template.js';

describe('renderTemplate (LiquidJS) — backward compat', () => {
  it('renders {{var}} substitution', async () => {
    expect(await renderTemplate('Hello {{name}}!', {name: 'World'})).toBe('Hello World!');
  });

  it('renders {{nested.path}} dotted access', async () => {
    expect(await renderTemplate('Hi {{data.firstName}}!', {data: {firstName: 'Ada'}})).toBe('Hi Ada!');
  });

  it('returns empty string for undefined variables (no exception)', async () => {
    expect(await renderTemplate('Hi {{missing}}!', {})).toBe('Hi !');
  });

  it('renders the bare-key fallback to data.* (legacy lookup strategy 3)', async () => {
    // Legacy engine looked up bare keys in `data` if not found at top level.
    expect(await renderTemplate('Hi {{firstName}}!', {data: {firstName: 'Ada'}})).toBe('Hi Ada!');
  });

  it('top-level wins over data.* on key collision (matches legacy precedence)', async () => {
    expect(
      await renderTemplate('{{firstName}}', {firstName: 'TopLevel', data: {firstName: 'NestedVal'}}),
    ).toBe('TopLevel');
  });
});

describe('renderTemplate — legacy ?? falsy fallback', () => {
  it('falls back when value is undefined', async () => {
    expect(await renderTemplate('Hello {{name ?? "Guest"}}!', {})).toBe('Hello Guest!');
  });

  it('falls back when value is null', async () => {
    expect(await renderTemplate('Hello {{name ?? "Guest"}}!', {name: null})).toBe('Hello Guest!');
  });

  it('falls back when value is the empty string (FALSY, not nullish)', async () => {
    // This is the key distinction from LiquidJS's stock `default` filter (which would also
    // fall back here, since `default` treats '' as default-triggering — but kept as a
    // regression check for the falsy contract).
    expect(await renderTemplate('Hello {{name ?? "Guest"}}!', {name: ''})).toBe('Hello Guest!');
  });

  it('falls back when value is 0 (FALSY — differs from LiquidJS stock `default`)', async () => {
    // Stock LiquidJS `default` treats `0` as defined and would NOT fall back. Our
    // falsy_default mirrors the legacy `||` semantic and DOES fall back for 0.
    expect(await renderTemplate('Count: {{count ?? "none"}}', {count: 0})).toBe('Count: none');
  });

  it('falls back when value is false', async () => {
    expect(await renderTemplate('Active: {{active ?? "no"}}', {active: false})).toBe('Active: no');
  });

  it('does NOT fall back for truthy non-empty strings', async () => {
    expect(await renderTemplate('Hello {{name ?? "Guest"}}!', {name: 'Ada'})).toBe('Hello Ada!');
  });

  it('does NOT fall back for truthy numbers', async () => {
    expect(await renderTemplate('Count: {{count ?? "none"}}', {count: 5})).toBe('Count: 5');
  });

  it('accepts bare-word default (unquoted) — legacy convenience', async () => {
    // Legacy engine took everything after `??` as a literal string; we preserve that.
    expect(await renderTemplate('Hello {{name ?? Guest}}!', {})).toBe('Hello Guest!');
  });

  it('accepts single-quoted default', async () => {
    expect(await renderTemplate("Hello {{name ?? 'Guest'}}!", {})).toBe('Hello Guest!');
  });

  it('accepts empty-string default', async () => {
    expect(await renderTemplate('Greeting: {{name ?? ""}}', {})).toBe('Greeting: ');
  });
});

describe('renderTemplate — Liquid {% if %} conditionals', () => {
  it('renders the truthy branch', async () => {
    const tpl = '{% if user.firstName %}Hi {{user.firstName}}!{% else %}Hello!{% endif %}';
    expect(await renderTemplate(tpl, {user: {firstName: 'Ada'}})).toBe('Hi Ada!');
  });

  it('renders the else branch when undefined', async () => {
    const tpl = '{% if user.firstName %}Hi {{user.firstName}}!{% else %}Hello!{% endif %}';
    expect(await renderTemplate(tpl, {user: {}})).toBe('Hello!');
  });

  it('treats empty string as falsy in {% if %} (jsTruthy: true)', async () => {
    // Stock Liquid would render the IF branch for ''. With jsTruthy, '' is falsy.
    const tpl = '{% if name %}has{% else %}no{% endif %}';
    expect(await renderTemplate(tpl, {name: ''})).toBe('no');
  });

  it('treats 0 as falsy in {% if %} (jsTruthy: true)', async () => {
    const tpl = '{% if count %}has{% else %}no{% endif %}';
    expect(await renderTemplate(tpl, {count: 0})).toBe('no');
  });

  it('handles elsif chains', async () => {
    const tpl = '{% if tier == "gold" %}G{% elsif tier == "silver" %}S{% else %}-{% endif %}';
    expect(await renderTemplate(tpl, {tier: 'silver'})).toBe('S');
  });
});

describe('renderTemplate — {% assign %} and filter pipelines', () => {
  it('assigns and uses a captured value', async () => {
    const tpl = '{% assign greeting = "hi" | capitalize %}{{greeting}}, {{name}}';
    expect(await renderTemplate(tpl, {name: 'Ada'})).toBe('Hi, Ada');
  });

  it('chains filters', async () => {
    const tpl = '{{ name | downcase | capitalize }}';
    expect(await renderTemplate(tpl, {name: 'ADA LOVELACE'})).toBe('Ada lovelace');
  });

  it('supports the LiquidJS stock `default` filter (nullish-or-empty by default)', async () => {
    expect(await renderTemplate('{{ name | default: "Guest" }}', {name: ''})).toBe('Guest');
  });

  it('with jsTruthy:true, stock `default` ALSO falls back for 0 (matches falsy_default)', async () => {
    // Note: with our engine config (jsTruthy: true), LiquidJS's stock `default` filter
    // converges with our `falsy_default` for `0` and `false`. The reason we still need a
    // custom filter is so the legacy `??` rewrite is independent of the engine's jsTruthy
    // setting — a future config change couldn't silently invert ?? semantics.
    expect(await renderTemplate('{{ count | default: "none" }}', {count: 0})).toBe('none');
  });
});

describe('renderTemplate — date math (advance to next Monday)', () => {
  it('produces a deterministic offset given an explicit reference date', async () => {
    // The migration notes call out an "advance to next Monday" pattern using
    // `date: "%w"` + `minus`/`modulo`/`times`. %w returns 0..6 (Sun..Sat).
    // Goal: number of days to advance from `today` to reach the NEXT Monday (1).
    // Formula: (8 - dow) % 7 — returns 1..7, where 7 means "today is Monday → next is in 7 days".
    // Use a known input by passing the date as an ISO string from the scope.
    //
    // Wed 2026-05-13 → dow=3 → (8-3)%7 = 5 days to next Monday (2026-05-18). ✓
    const tpl =
      '{% assign dow = ref | date: "%w" %}{% assign days = 8 | minus: dow | modulo: 7 %}' +
      '{% if days == 0 %}7{% else %}{{ days }}{% endif %}';
    expect(await renderTemplate(tpl, {ref: '2026-05-13'})).toBe('5');
  });

  it('yields 7 when the reference is already a Monday', async () => {
    // Mon 2026-05-11 → dow=1 → (8-1)%7 = 0 → branch "7"
    const tpl =
      '{% assign dow = ref | date: "%w" %}{% assign days = 8 | minus: dow | modulo: 7 %}' +
      '{% if days == 0 %}7{% else %}{{ days }}{% endif %}';
    expect(await renderTemplate(tpl, {ref: '2026-05-11'})).toBe('7');
  });
});

describe('renderTemplate — XSS / escaping behavior (email body context)', () => {
  it('does NOT auto-escape HTML in {{var}} output', async () => {
    // Email bodies are HTML; we deliberately keep raw output. If the existing engine
    // ever auto-escaped, mass-injection of <b>/<a>/<img> tags via merge fields would break
    // every dynamic email overnight.
    expect(await renderTemplate('{{html}}', {html: '<b>hi</b>'})).toBe('<b>hi</b>');
  });

  it('preserves ampersands and quotes raw (no escape)', async () => {
    expect(await renderTemplate('{{s}}', {s: 'a & b "c"'})).toBe('a & b "c"');
  });

  it('escapes only when the explicit | escape filter is applied', async () => {
    expect(await renderTemplate('{{ html | escape }}', {html: '<b>hi</b>'})).toBe('&lt;b&gt;hi&lt;/b&gt;');
  });
});

describe('renderTemplate — async surface', () => {
  it('returns a Promise<string>', () => {
    const result = renderTemplate('Hi {{name}}', {name: 'Ada'});
    expect(result).toBeInstanceOf(Promise);
  });

  it('awaits cleanly', async () => {
    const out = await renderTemplate('Hi {{name}}', {name: 'Ada'});
    expect(typeof out).toBe('string');
    expect(out).toBe('Hi Ada');
  });

  it('runs concurrently safely (singleton engine, multiple in-flight renders)', async () => {
    const tasks = Array.from({length: 50}, (_, i) =>
      renderTemplate('id={{i}}', {i: String(i)}),
    );
    const results = await Promise.all(tasks);
    expect(results).toEqual(Array.from({length: 50}, (_, i) => `id=${i}`));
  });
});

describe('renderTemplateSync — EmailEditor preview path', () => {
  it('renders synchronously without a Promise', () => {
    const out = renderTemplateSync('Hi {{name}}!', {name: 'Ada'});
    expect(out).toBe('Hi Ada!');
  });

  it('handles {% if %} and {% assign %} synchronously', () => {
    const tpl = '{% assign g = "hi" | capitalize %}{% if name %}{{g}} {{name}}{% endif %}';
    expect(renderTemplateSync(tpl, {name: 'Ada'})).toBe('Hi Ada');
  });

  it('handles ?? fallback synchronously', () => {
    expect(renderTemplateSync('{{name ?? "Guest"}}', {})).toBe('Guest');
  });
});

describe('renderTemplate — workflow-scope shape (regression)', () => {
  // Mirrors the scope built in WorkflowExecutionService.ts:553 and email-processor.ts:104.
  it('renders all reserved scope keys', async () => {
    const scope = {
      id: 'contact-uuid',
      email: 'ada@example.com',
      firstName: 'Ada',
      data: {firstName: 'Ada', course: 'CHP'},
      unsubscribeUrl: 'https://x/unsub/1',
      subscribeUrl: 'https://x/sub/1',
      manageUrl: 'https://x/manage/1',
    };
    const tpl =
      'Hi {{firstName}} ({{email}}), course={{data.course}}. ' +
      '<a href="{{unsubscribeUrl}}">unsub</a>';
    expect(await renderTemplate(tpl, scope)).toBe(
      'Hi Ada (ada@example.com), course=CHP. <a href="https://x/unsub/1">unsub</a>',
    );
  });

  it('Dittofeed-shape pattern: {% if user.firstName %} with falsy default elsewhere', async () => {
    // A stylized version of an owner-template fragment per migration_notes.md item 3.
    const tpl =
      '{% if firstName %}Hola {{firstName | capitalize}}{% else %}Hola{% endif %}, ' +
      'tu curso es {{course ?? "(ninguno)"}}.';
    expect(await renderTemplate(tpl, {firstName: 'ada', course: 'CHP'})).toBe('Hola Ada, tu curso es CHP.');
    expect(await renderTemplate(tpl, {})).toBe('Hola, tu curso es (ninguno).');
  });
});

describe('renderTemplate — {% raw %} blocks must be untouched by the ?? rewrite', () => {
  // Regression: the ?? rewrite is a regex pre-pass over the entire template. Without raw-block
  // awareness, `{% raw %}{{ x ?? y }}{% endraw %}` was rewritten to
  // `{% raw %}{{ x | falsy_default: "y" }}{% endraw %}`, breaking the literal output guarantee.
  it('renders the literal `{{ x ?? y }}` from inside a raw block', async () => {
    const tpl = '{% raw %}{{ x ?? y }}{% endraw %}';
    expect(await renderTemplate(tpl, {})).toBe('{{ x ?? y }}');
  });

  it('still rewrites ?? in surrounding (non-raw) segments', async () => {
    const tpl = 'before:{{name ?? "Guest"}} sample:{% raw %}{{ x ?? y }}{% endraw %} after:{{age ?? "?"}}';
    expect(await renderTemplate(tpl, {name: 'Ada'})).toBe('before:Ada sample:{{ x ?? y }} after:?');
  });

  it('handles multiple raw blocks interleaved with rewriteable expressions', async () => {
    const tpl =
      '{{a ?? "A"}}|{% raw %}{{a ?? z}}{% endraw %}|{{b ?? "B"}}|{% raw %}{{b ?? z}}{% endraw %}';
    expect(await renderTemplate(tpl, {})).toBe('A|{{a ?? z}}|B|{{b ?? z}}');
  });

  it('does not rewrite `??` inside raw block even when surrounded by other Liquid', async () => {
    const tpl = '{% if name %}{{name}}{% endif %} sample={% raw %}{{ x ?? "y" }}{% endraw %}';
    expect(await renderTemplate(tpl, {name: 'Ada'})).toBe('Ada sample={{ x ?? "y" }}');
  });
});

describe('renderTemplate — chained `??` is rejected with a clear error', () => {
  it('throws on `{{ x ?? y ?? z }}` rather than silently dropping the third operand', async () => {
    await expect(renderTemplate('{{ x ?? y ?? z }}', {})).rejects.toThrow(/chained '\?\?' is not supported/);
  });

  it('error message mentions the filter-chain alternative', async () => {
    await expect(renderTemplate('Hi {{name ?? alt ?? fallback}}', {})).rejects.toThrow(/falsy_default/);
  });
});

describe('renderSubject — HTML-escaped subject context', () => {
  // Subjects are plain-text MIME headers; raw `<` from a user-controlled merge field shouldn't
  // leak into a context where downstream tooling might HTML-decode it. The subject engine
  // applies `outputEscape: 'escape'`.
  it('escapes `<script>` from a merge-field merge value', async () => {
    expect(await renderSubject('Hi {{name}}', {name: '<script>alert(1)</script>'})).toBe(
      'Hi &lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('escapes ampersands and quotes', async () => {
    expect(await renderSubject('{{s}}', {s: 'a & b "c"'})).toBe('a &amp; b &#34;c&#34;');
  });

  it('still resolves dotted access and ?? fallback', async () => {
    expect(await renderSubject('Hello {{user.first ?? "Guest"}}', {})).toBe('Hello Guest');
  });

  it('renderTemplate (body) emits the SAME expression raw (escape policy is per-engine)', async () => {
    // Body context: same input renders un-escaped.
    expect(await renderTemplate('Hi {{name}}', {name: '<script>alert(1)</script>'})).toBe(
      'Hi <script>alert(1)</script>',
    );
  });
});

describe('renderSubjectSync — sync variant for previews', () => {
  it('renders synchronously', () => {
    expect(renderSubjectSync('Hi {{name}}', {name: 'Ada'})).toBe('Hi Ada');
  });

  it('escapes HTML in the merge value', () => {
    expect(renderSubjectSync('{{x}}', {x: '<b>'})).toBe('&lt;b&gt;');
  });
});
