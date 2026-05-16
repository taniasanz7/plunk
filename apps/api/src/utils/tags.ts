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
