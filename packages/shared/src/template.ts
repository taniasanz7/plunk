/**
 * Render email template by replacing variables
 * Supports {{variable}} and {{variable ?? defaultValue}} syntax
 * Also supports nested access like {{data.firstName}}
 *
 * Example:
 * renderTemplate('Hello {{name}}!', { name: 'World' }) -> 'Hello World!'
 * renderTemplate('Hello {{data.name}}!', { data: { name: 'World' } }) -> 'Hello World!'
 * renderTemplate('Hello {{name ?? Guest}}!', {}) -> 'Hello Guest!'
 */
export function renderTemplate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{(.*?)\}\}/g, (match, key) => {
    const [mainKey, defaultValue] = key.split('??').map((s: string) => s.trim());

    // Handle nested property access (e.g., data.firstName)
    const getValue = (obj: Record<string, unknown>, path: string): unknown => {
      return path.split('.').reduce((current: Record<string, unknown> | unknown, key) => {
        if (current && typeof current === 'object' && !Array.isArray(current)) {
          return (current as Record<string, unknown>)[key];
        }
        return undefined;
      }, obj);
    };

    // Try multiple lookup strategies
    const value =
      getValue(variables, mainKey) || // Try as nested path (e.g., data.firstName)
      variables[mainKey] || // Try as top-level property
      (variables.data as Record<string, unknown>)?.[mainKey]; // Try in data object

    // Handle array values (for lists)
    if (Array.isArray(value)) {
      return value.map((e: string) => `<li>${e}</li>`).join('\n');
    }

    return value ?? defaultValue ?? '';
  });
}

/**
 * Render a template body wrapped inside a layout (master template).
 *
 * The layout body is expected to contain a `{{contentSlot}}` placeholder
 * (with optional surrounding whitespace) that marks where the template body
 * should be injected. The injection is verbatim HTML — the rendered template
 * body is NOT HTML-escaped when it lands in the layout, so styles, tables,
 * and inline markup pass through intact.
 *
 * Implementation is two-pass to be robust to any underlying template engine
 * (including engines that HTML-escape variable values):
 *   1. Render the template body with the variable scope.
 *   2. Replace `{{contentSlot}}` in the layout body with a unique marker
 *      token, render the layout body for its own variables, then splice
 *      the rendered template body into the marker position.
 *
 * When `layoutBody` is null/undefined/empty, behaves as a passthrough that
 * just renders the template body (the existing single-template code path).
 */
export function renderWithLayout(
  templateBody: string,
  layoutBody: string | null | undefined,
  variables: Record<string, unknown>,
): string {
  if (!layoutBody) {
    return renderTemplate(templateBody, variables);
  }

  // Render template body for its own {{variable}} placeholders.
  const renderedContent = renderTemplate(templateBody, variables);

  // Swap {{contentSlot}} for a token that no reasonable user would type and
  // that does not interact with HTML escaping or template syntax. We use
  // null bytes around a fixed label so it's unambiguous and stable across
  // engines.
  const CONTENT_SLOT_TOKEN = ' __PLUNK_CONTENT_SLOT__ ';
  const layoutWithMarker = layoutBody.replace(/\{\{\s*contentSlot\s*\}\}/g, CONTENT_SLOT_TOKEN);

  // Render the layout body for its own variables (e.g. {{unsubscribeUrl}},
  // {{firstName}}, etc.). The marker token survives unchanged because it
  // doesn't look like a template variable.
  const renderedLayout = renderTemplate(layoutWithMarker, variables);

  // Splice the rendered content into the marker position(s) verbatim.
  return renderedLayout.split(CONTENT_SLOT_TOKEN).join(renderedContent);
}