/**
 * Detects whether an email body contains an unsubscribe signal.
 *
 * Used to warn authors of HEADLESS emails that no unsubscribe mechanism
 * was found — Plunk cannot verify the link works, but can check for common patterns.
 *
 * When `layoutBody` is provided and non-empty, the same checks are run against
 * the layout body too — this is needed for templates that delegate the footer
 * (and unsubscribe link) to a master template / Layout via `layoutId`.
 *
 * Returns true if any of the following are present in either body:
 * - Plunk template variables: {{unsubscribeUrl}} or {{manageUrl}}
 * - An <a> tag whose href contains unsubscribe-related keywords
 * - An <a> tag whose visible text contains unsubscribe-related keywords
 */
export function detectUnsubscribeSignal(body: string, layoutBody?: string | null): boolean {
  const hasSignal = (b: string | null | undefined): boolean => {
    if (!b) return false;

    // Plunk's own managed unsubscribe variables
    if (/\{\{(?:unsubscribeUrl|manageUrl)\}\}/.test(b)) return true;

    // href containing unsubscribe keywords
    if (/href=["'][^"']*(?:unsubscribe|opt[_-]?out|remove)[^"']*["']/i.test(b)) return true;

    // Anchor text containing unsubscribe keywords
    if (/<a\b[^>]*>(?:[^<]*(?:unsubscribe|opt[_-]?\s*out|manage\s+preferences|email\s+preferences|remove\s+me)[^<]*)<\/a>/i.test(b))
      return true;

    return false;
  };

  return hasSignal(body) || hasSignal(layoutBody);
}
