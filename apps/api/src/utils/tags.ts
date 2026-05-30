/**
 * Shared helpers for the free-form `tags: String[]` field on Template and Workflow.
 *
 * Normalization rules:
 * - trim whitespace
 * - drop empty entries
 * - de-duplicate while preserving first-occurrence order
 *
 * Returns `undefined` if `input` is `undefined` (so callers can use the
 * "only-update-when-provided" pattern), or a normalized string[] otherwise.
 */
export function normalizeTags(input: string[] | undefined | null): string[] | undefined {
  if (input === undefined) return undefined;
  if (input === null) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Parse the multi-value `?tag=` filter query param on the templates/workflows
 * list endpoints into a normalized `string[]`.
 *
 * Accepts every shape Express's `qs` query parser can hand us for repeated keys
 * plus a CSV fallback, so the wire stays back-compatible with the old
 * single-tag callers:
 *   - `?tag=a`            -> `['a']`            (string)
 *   - `?tag=a&tag=b`      -> `['a', 'b']`       (string[])
 *   - `?tag=a,b`          -> `['a', 'b']`       (CSV inside one value)
 *   - absent / empty      -> `undefined`        (no filter)
 *
 * Values are trimmed + de-duplicated via `normalizeTags`. Returns `undefined`
 * (rather than `[]`) when nothing usable was supplied, so the service can use
 * the "only filter when provided" pattern and never emit an empty `hasSome`.
 */
export function parseTagsQuery(raw: unknown): string[] | undefined {
  const values: string[] = [];

  const collect = (value: unknown) => {
    if (typeof value !== 'string') return;
    // Split on commas so a single `?tag=a,b` value also works.
    for (const part of value.split(',')) values.push(part);
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) collect(entry);
  } else {
    collect(raw);
  }

  const normalized = normalizeTags(values);
  return normalized && normalized.length > 0 ? normalized : undefined;
}
