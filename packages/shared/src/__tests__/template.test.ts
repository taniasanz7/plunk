/**
 * Tests for renderWithLayout — the layouts / master-templates render path
 * (patch #20). A Layout wraps a template body via a {{contentSlot}}
 * placeholder; this is the SYNCHRONOUS renderTemplate-based implementation
 * that the send pipeline (WorkflowExecutionService, Actions) relies on.
 */
import {describe, expect, it} from 'vitest';

import {renderTemplate, renderWithLayout} from '../template.js';

describe('renderWithLayout — passthrough (no layout)', () => {
  it('renders the template body alone when layoutBody is null', () => {
    expect(renderWithLayout('Hello {{name}}!', null, {name: 'World'})).toBe('Hello World!');
  });

  it('renders the template body alone when layoutBody is undefined', () => {
    expect(renderWithLayout('Hello {{name}}!', undefined, {name: 'World'})).toBe('Hello World!');
  });

  it('renders the template body alone when layoutBody is empty string', () => {
    expect(renderWithLayout('Hi {{name}}', '', {name: 'A'})).toBe('Hi A');
  });

  it('matches renderTemplate output exactly in the passthrough case', () => {
    const body = 'Hello {{data.firstName ?? Guest}}';
    const vars = {data: {firstName: 'Jane'}};
    expect(renderWithLayout(body, null, vars)).toBe(renderTemplate(body, vars));
  });
});

describe('renderWithLayout — wrapping in a layout', () => {
  const LAYOUT = '<div class="wrap">{{contentSlot}}</div>';

  it('splices the rendered template body into {{contentSlot}}', () => {
    expect(renderWithLayout('<p>Hi {{name}}</p>', LAYOUT, {name: 'Sam'})).toBe(
      '<div class="wrap"><p>Hi Sam</p></div>',
    );
  });

  it('tolerates whitespace inside the contentSlot placeholder', () => {
    expect(renderWithLayout('<p>x</p>', '<main>{{  contentSlot  }}</main>', {})).toBe(
      '<main><p>x</p></main>',
    );
  });

  it('renders the layout’s own variables (e.g. {{unsubscribeUrl}})', () => {
    const layout = '<body>{{contentSlot}}<footer><a href="{{unsubscribeUrl}}">Unsub</a></footer></body>';
    const out = renderWithLayout('<p>Body</p>', layout, {
      unsubscribeUrl: 'https://example.com/u/1',
    });
    expect(out).toBe('<body><p>Body</p><footer><a href="https://example.com/u/1">Unsub</a></footer></body>');
  });

  it('does NOT HTML-escape the template body markup when splicing', () => {
    const body = '<table><tr><td style="color:red">Cell</td></tr></table>';
    const out = renderWithLayout(body, '<div>{{contentSlot}}</div>', {});
    expect(out).toBe(`<div>${body}</div>`);
  });

  it('shares the variable scope between layout and template body', () => {
    const layout = '<h1>{{title}}</h1>{{contentSlot}}';
    const out = renderWithLayout('<p>Hi {{name}}</p>', layout, {title: 'Hello', name: 'Jo'});
    expect(out).toBe('<h1>Hello</h1><p>Hi Jo</p>');
  });

  it('replaces every occurrence when {{contentSlot}} appears more than once', () => {
    const layout = '{{contentSlot}}|{{contentSlot}}';
    expect(renderWithLayout('X', layout, {})).toBe('X|X');
  });

  it('leaves the layout unchanged when it has no contentSlot (body is dropped)', () => {
    // No slot => nothing to splice into; the layout renders standalone.
    expect(renderWithLayout('<p>orphan</p>', '<div>no slot</div>', {})).toBe('<div>no slot</div>');
  });

  it('splices a body containing $-sequences verbatim (no String.replace mangling)', () => {
    // A template body may legitimately contain `$&`, `$$`, `` $` ``, `$'`,
    // `$1` etc. (e.g. literal copy, prices, regex docs). The splice must
    // insert them literally and never interpret them as String.replace
    // special replacement patterns.
    const body = "Price $$5 — match $& back $` ahead $' group $1 end";
    expect(renderWithLayout(body, '<div>{{contentSlot}}</div>', {})).toBe(`<div>${body}</div>`);
  });
});
