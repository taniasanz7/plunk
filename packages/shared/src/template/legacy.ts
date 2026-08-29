/**
 * The pre-Liquid renderer, kept as a safety net.
 *
 * Templates are authored by users and stored indefinitely, so a template that Liquid
 * refuses to parse must not take a campaign down with it. When parsing fails,
 * `renderTemplate` falls back to this function: plain `{{variable}}` and
 * `{{variable ?? default}}` placeholders still resolve, and anything Liquid-specific is
 * left as literal text. `validateTemplate` is what surfaces the actual error to the
 * author.
 *
 * Supports `{{variable}}`, `{{variable ?? defaultValue}}` and nested access
 * (`{{data.firstName}}`).
 */
function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function renderLegacyTemplate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{(.*?)\}\}/g, (_match, key) => {
    const [mainKey, defaultValue] = key.split('??').map((s: string) => s.trim());

    // Handle nested property access (e.g., data.firstName)
    const getValue = (obj: Record<string, unknown>, path: string): unknown => {
      return path.split('.').reduce((current: Record<string, unknown> | unknown, segment) => {
        if (current && typeof current === 'object' && !Array.isArray(current)) {
          const record = current as Record<string, unknown>;
          return hasOwn(record, segment) ? record[segment] : undefined;
        }
        return undefined;
      }, obj);
    };

    const getOwnValue = (obj: unknown, path: string): unknown => {
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const record = obj as Record<string, unknown>;
        return hasOwn(record, path) ? record[path] : undefined;
      }
      return undefined;
    };

    // Try multiple lookup strategies
    const value =
      getValue(variables, mainKey) || // Try as nested path (e.g., data.firstName)
      getOwnValue(variables, mainKey) || // Try as top-level property
      getOwnValue(variables.data, mainKey); // Try in data object

    // Handle array values (for lists)
    if (Array.isArray(value)) {
      return value.map((e: string) => `<li>${e}</li>`).join('\n');
    }

    return value ?? defaultValue ?? '';
  });
}
