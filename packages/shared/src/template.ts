/**
 * Email template engine — LiquidJS-backed.
 *
 * Public surface:
 *  - `renderTemplate(template, variables): Promise<string>`        — body/HTML context, RAW output
 *  - `renderTemplateSync(template, variables): string`             — body/HTML context, sync
 *  - `renderSubject(template, variables): Promise<string>`         — subject (plain-text), HTML-ESCAPED output
 *  - `renderSubjectSync(template, variables): string`              — subject, sync
 *
 * Capabilities (full Liquid grammar via {@link https://liquidjs.com/}):
 *  - `{{ var }}` substitution
 *  - `{{ nested.path.to.value }}` dotted access
 *  - `{% if %}` / `{% elsif %}` / `{% else %}` / `{% endif %}` conditionals
 *  - `{% assign x = ... | filter %}` and `{% capture %}` blocks
 *  - `{% raw %}…{% endraw %}` to emit Liquid syntax verbatim (NOT touched by the `??` rewrite)
 *  - Standard Liquid filters: `default`, `capitalize`, `upcase`, `downcase`, `date`, `plus`, `minus`, `modulo`, etc.
 *  - Date math via filter chains, e.g.:
 *      {% assign dow = "now" | date: "%w" %}
 *      {% assign offset = 8 | minus: dow | modulo: 7 %}
 *
 * Backward compat with Plunk's previous 38-line engine:
 *  - `{{ var ?? default }}` is rewritten in a pre-pass to `{{ var | falsy_default: default }}`.
 *  - The `falsy_default` filter mirrors the legacy behavior exactly: it falls back to the default
 *    for ALL JavaScript-falsy values (`null`, `undefined`, `""`, `0`, `false`), NOT just nullish.
 *    This differs from LiquidJS's stock `default` filter, which is nullish-or-empty (treats `0`/`false`
 *    as defined). The legacy `??` operator was falsy, so we preserve that semantic.
 *  - The default value, written without quotes (e.g. `{{ name ?? Guest }}`), was passed verbatim
 *    as a string by the previous engine. We preserve that by quoting the literal in the rewrite.
 *  - Bare top-level keys also fall back to the `data` sub-object if not found at the top level
 *    (the previous engine's third lookup strategy). We replicate this by merging data.* into the
 *    top-level scope (top-level wins on conflict — matching legacy order).
 *
 * Chained `??` (e.g. `{{ x ?? y ?? z }}`):
 *  - The legacy 38-line engine ALSO did not support this — it took only the first default.
 *  - Rather than carry the legacy bug forward, the rewrite throws a clear error so the template
 *    author rewrites with explicit `| falsy_default:` chains. See `rewriteLegacyFallback`.
 *
 * XSS / escaping policy — body vs subject:
 *  - **Body** (HTML email): `renderTemplate`/`renderTemplateSync` use a RAW engine — `{{var}}` is
 *    emitted unescaped. This matches the previous engine and is required for templates that
 *    interpolate `<a>`/`<img>` snippets via merge fields.
 *  - **Subject** (plain-text MIME header): `renderSubject`/`renderSubjectSync` use a SECOND engine
 *    configured with `outputEscape: 'escape'`. Subjects do NOT render HTML in any client and a
 *    raw `<` from a user-controlled merge field (e.g. `firstName = "<script>"`) is at best
 *    confusing and at worst will be re-interpreted by downstream MIME parsers. HTML-escape on
 *    output keeps the subject byte-clean.
 *
 * Performance:
 *  - Two singleton Liquid engines (raw + escaped) are created at module load and reused. LiquidJS
 *    caches the parsed AST per template-string by default when `cache: true` is set, which matters
 *    for high-volume sends (millions of contacts × same template body).
 */
import {Liquid} from 'liquidjs';

/**
 * Shared engine config — the only difference between the body and subject engines is `outputEscape`.
 *
 * Configuration rationale:
 *  - `cache: true`              — parse-once-per-template-string, important at scale.
 *  - `strictFilters: false`     — missing filter does NOT throw at render time.
 *  - `strictVariables: false`   — undefined variables render as empty string, matching old engine.
 *  - `jsTruthy: true`           — adopt JS truthiness (`0`, `''` are falsy in `{% if %}`).
 *  - `relativeReference: true`  — allow `{{ data.foo }}` style without complaining.
 */
const baseEngineConfig = {
  cache: true,
  strictFilters: false,
  strictVariables: false,
  jsTruthy: true,
  relativeReference: true,
} as const;

/** Engine for HTML email **bodies** — emits `{{var}}` raw (no auto-escape). */
const bodyEngine = new Liquid(baseEngineConfig);

/**
 * Engine for plain-text email **subjects** — emits `{{var}}` HTML-escaped.
 *
 * Subjects appear in MIME headers and inbox lists; they are NEVER rendered as HTML by any
 * mail client. A merge-field with `<` characters in a subject is, at minimum, confusing and
 * at worst gets re-parsed by downstream tooling that does HTML-decoding. Escape on output
 * keeps the subject safe regardless of who controls the merge field.
 */
const subjectEngine = new Liquid({...baseEngineConfig, outputEscape: 'escape'});

/**
 * Falsy-fallback filter: mirrors the legacy `??` operator. Registered on BOTH engines so
 * the `??` rewrite works identically in body and subject contexts.
 *
 * Returns `fallback` when `value` is JS-falsy (`null`, `undefined`, `''`, `0`, `false`, `NaN`).
 */
const falsyDefault = (value: unknown, fallback: unknown): unknown => {
  if (!value) {
    return fallback ?? '';
  }
  return value;
};
bodyEngine.registerFilter('falsy_default', falsyDefault);
subjectEngine.registerFilter('falsy_default', falsyDefault);

/**
 * Match a `{% raw %}…{% endraw %}` block. LiquidJS itself does NOT support the
 * `{%- raw -%}` whitespace-strip variant for raw blocks (it errors at parse time), so we
 * only match the plain form here. Used to split the input so the `??` rewrite skips
 * raw-block contents (which are intended to render verbatim, not be processed).
 */
const RAW_BLOCK_RE = /\{%\s*raw\s*%\}[\s\S]*?\{%\s*endraw\s*%\}/g;

/**
 * Match `{{ ... ?? ... }}` where neither side already contains a pipe. Partially-Liquid
 * expressions like `{{ x | upcase ?? 'fallback' }}` are intentionally NOT matched — those
 * need to be hand-converted to `| falsy_default:` directly.
 */
const FALLBACK_RE = /\{\{\s*([^{}|]*?)\s*\?\?\s*([^{}|]*?)\s*\}\}/g;

/**
 * Pre-pass: rewrite legacy `{{ x ?? y }}` syntax to LiquidJS's filter pipeline.
 *
 *   {{ name ?? "Guest" }}   → {{ name | falsy_default: "Guest" }}
 *   {{ name ?? Guest }}     → {{ name | falsy_default: "Guest" }}     (bare word becomes string literal)
 *   {{ data.x ?? '' }}      → {{ data.x | falsy_default: "" }}
 *
 * The legacy engine performed `key.split('??').map(s => s.trim())` and then used `defaultValue`
 * as a literal string (no parsing). We preserve that: bare-word defaults are wrapped in quotes
 * so LiquidJS receives them as a string literal. Already-quoted defaults pass through.
 *
 * **Raw blocks**: `{% raw %}{{ x ?? y }}{% endraw %}` is intended to emit `{{ x ?? y }}` literally.
 * The rewrite splits the input on raw-block boundaries, applies the `??` substitution only to
 * segments OUTSIDE raw blocks, then reassembles. Without this, raw-quoted Liquid samples in
 * documentation or onboarding emails would silently render the wrong syntax.
 *
 * **Chained `??`**: `{{ x ?? y ?? z }}` was never supported by the legacy engine (which split
 * once on `??` and treated everything after as the literal default). Rather than carry that
 * silent breakage forward, this function throws a clear error pointing at the offending tag.
 */
function rewriteLegacyFallback(template: string): string {
  // Walk the input, alternating between non-raw and raw segments.
  let out = '';
  let lastIndex = 0;
  RAW_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RAW_BLOCK_RE.exec(template)) !== null) {
    // Outside-of-raw segment: apply the rewrite.
    out += rewriteSegment(template.slice(lastIndex, match.index));
    // Raw block: keep verbatim.
    out += match[0];
    lastIndex = match.index + match[0].length;
  }
  // Trailing non-raw segment.
  out += rewriteSegment(template.slice(lastIndex));
  return out;
}

function rewriteSegment(segment: string): string {
  return segment.replace(FALLBACK_RE, (match, lhs: string, rhs: string) => {
    const left = lhs.trim();
    const right = rhs.trim();
    // Detect chained `??` (the rhs still contains `??`, indicating `x ?? y ?? z` from the source).
    // The lhs cannot contain `??` because the regex is non-greedy and matches the *first* `??`,
    // but check both sides for safety against future regex changes.
    if (right.includes('??') || left.includes('??')) {
      throw new Error(
        `Template error: chained '??' is not supported (in ${match.trim()}). ` +
          "Rewrite as a filter chain, e.g. '{{ x | falsy_default: y | falsy_default: z }}'.",
      );
    }
    // Already quoted? pass through. Otherwise wrap as a string literal.
    const isQuoted =
      (right.startsWith('"') && right.endsWith('"')) || (right.startsWith("'") && right.endsWith("'"));
    const rightLiteral = isQuoted ? right : JSON.stringify(right);
    return `{{ ${left} | falsy_default: ${rightLiteral} }}`;
  });
}

/**
 * Build the variable scope passed to LiquidJS.
 *
 * Backward-compat lookup: the legacy engine's third strategy was to look up bare keys inside
 * `variables.data`. LiquidJS resolves `{{ foo }}` only against the top-level scope. To preserve
 * "bare key falls through to data.*", we merge `data` keys into the top-level scope (without
 * overwriting existing top-level keys, which take precedence — matching the legacy order:
 * top-level wins).
 */
function buildScope(variables: Record<string, unknown>): Record<string, unknown> {
  const data = variables.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return {
      ...(data as Record<string, unknown>),
      ...variables, // top-level overrides data.* on conflict
    };
  }
  return variables;
}

/**
 * Render an HTML email **body** template. Output is RAW — `{{var}}` is not auto-escaped.
 * Templates that want HTML-escape can opt in with `| escape`.
 *
 * @returns The rendered string. Never throws on undefined variables (renders as empty string).
 */
export async function renderTemplate(template: string, variables: Record<string, unknown>): Promise<string> {
  const rewritten = rewriteLegacyFallback(template);
  const scope = buildScope(variables);
  return bodyEngine.parseAndRender(rewritten, scope);
}

/**
 * Synchronous body render — for call sites that cannot easily become async (React preview).
 */
export function renderTemplateSync(template: string, variables: Record<string, unknown>): string {
  const rewritten = rewriteLegacyFallback(template);
  const scope = buildScope(variables);
  return bodyEngine.parseAndRenderSync(rewritten, scope);
}

/**
 * Render an email **subject** template. Output is HTML-ESCAPED — `{{var}}` containing `<`
 * renders as `&lt;`. Subjects are plain-text MIME headers; a raw `<` from a user-controlled
 * merge field shouldn't leak into a context where downstream tooling might HTML-decode it.
 */
export async function renderSubject(template: string, variables: Record<string, unknown>): Promise<string> {
  const rewritten = rewriteLegacyFallback(template);
  const scope = buildScope(variables);
  return subjectEngine.parseAndRender(rewritten, scope);
}

/**
 * Synchronous subject render — for the EmailEditor preview. Same escape policy as
 * {@link renderSubject}.
 */
export function renderSubjectSync(template: string, variables: Record<string, unknown>): string {
  const rewritten = rewriteLegacyFallback(template);
  const scope = buildScope(variables);
  return subjectEngine.parseAndRenderSync(rewritten, scope);
}
