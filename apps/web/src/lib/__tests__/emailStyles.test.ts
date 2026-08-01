import {describe, expect, it} from 'vitest';
import {detectCustomHtmlPatterns, wrapEmailWithStyles} from '../emailStyles';

describe('detectCustomHtmlPatterns', () => {
  describe('empty / whitespace input', () => {
    it('returns false for empty string', () => {
      expect(detectCustomHtmlPatterns('')).toBe(false);
    });

    it('returns false for whitespace-only string', () => {
      expect(detectCustomHtmlPatterns('   \n\t  ')).toBe(false);
    });
  });

  describe('content TipTap can round-trip (should NOT be flagged as custom)', () => {
    it('returns false for a basic paragraph', () => {
      expect(detectCustomHtmlPatterns('<p>Hello</p>')).toBe(false);
    });

    it('returns false for headings, lists, blockquote, bold, italic', () => {
      expect(
        detectCustomHtmlPatterns(
          '<h1>Title</h1><p><strong>bold</strong> <em>italic</em></p><ul><li>one</li></ul><blockquote>quote</blockquote>',
        ),
      ).toBe(false);
    });

    it('returns false for <span> with inline color style (TipTap TextStyle output)', () => {
      expect(detectCustomHtmlPatterns('<span style="color: rgb(220, 38, 38)">red</span>')).toBe(false);
    });

    it('returns false for <span> with background-color: initial (TipTap export artifact)', () => {
      expect(detectCustomHtmlPatterns('<span style="background-color: initial">stuff</span>')).toBe(false);
    });

    it('returns false for <span> with background-color: transparent (TipTap export artifact)', () => {
      expect(detectCustomHtmlPatterns('<span style="background-color: transparent">stuff</span>')).toBe(false);
    });

    it('returns false for <a> with inline style (TipTap Link output)', () => {
      expect(detectCustomHtmlPatterns('<a href="https://example.com" style="color: red">link</a>')).toBe(false);
    });

    it('returns false for paragraph with inline text-align style', () => {
      expect(detectCustomHtmlPatterns('<p style="text-align: center">centered</p>')).toBe(false);
    });

    it('returns false when an href URL contains "id=" or "contactId=" (must not match custom-attr regex)', () => {
      expect(
        detectCustomHtmlPatterns('<a href="https://example.com/u?contactId=abc&id=123">unsub</a>'),
      ).toBe(false);
    });

    it('returns false for allowed class prefixes', () => {
      expect(detectCustomHtmlPatterns('<p class="prose">x</p>')).toBe(false);
      expect(detectCustomHtmlPatterns('<span class="variable-mention">x</span>')).toBe(false);
      expect(detectCustomHtmlPatterns('<img class="email-image" src="x" />')).toBe(false);
    });

    it('returns false for a TipTap-style colored span wrapped in a paragraph', () => {
      expect(
        detectCustomHtmlPatterns('<p>Hello <span style="color: rgb(220, 38, 38);">world</span>!</p>'),
      ).toBe(false);
    });
  });

  describe('content TipTap can NOT round-trip (should be flagged as custom)', () => {
    it('returns true for <div>', () => {
      expect(detectCustomHtmlPatterns('<div>stuff</div>')).toBe(true);
    });

    it('returns true for <table> markup (no TipTap Table extension loaded)', () => {
      expect(detectCustomHtmlPatterns('<table><tr><td>x</td></tr></table>')).toBe(true);
    });

    it('returns true for a single <table> tag', () => {
      expect(detectCustomHtmlPatterns('<table>x</table>')).toBe(true);
    });

    it('returns true for <style> tag', () => {
      expect(detectCustomHtmlPatterns('<style>p { color: red; }</style>')).toBe(true);
    });

    it('returns true for @media query inside a style block', () => {
      expect(detectCustomHtmlPatterns('@media (max-width: 600px) { ... }')).toBe(true);
    });

    it('returns true for custom data-* attribute', () => {
      expect(detectCustomHtmlPatterns('<p data-foo="bar">x</p>')).toBe(true);
    });

    it('returns true for aria-* attribute', () => {
      expect(detectCustomHtmlPatterns('<p aria-label="x">y</p>')).toBe(true);
    });

    it('returns true for role= attribute', () => {
      expect(detectCustomHtmlPatterns('<p role="presentation">x</p>')).toBe(true);
    });

    it('returns true for id= attribute on an element', () => {
      expect(detectCustomHtmlPatterns('<p id="main">x</p>')).toBe(true);
    });

    it('returns true for a disallowed CSS class', () => {
      expect(detectCustomHtmlPatterns('<p class="custom">x</p>')).toBe(true);
    });

    it('returns true for <section>, <article>, <header>, <footer>, <nav>, <aside>, <main>', () => {
      expect(detectCustomHtmlPatterns('<section>x</section>')).toBe(true);
      expect(detectCustomHtmlPatterns('<article>x</article>')).toBe(true);
      expect(detectCustomHtmlPatterns('<header>x</header>')).toBe(true);
      expect(detectCustomHtmlPatterns('<footer>x</footer>')).toBe(true);
      expect(detectCustomHtmlPatterns('<nav>x</nav>')).toBe(true);
      expect(detectCustomHtmlPatterns('<aside>x</aside>')).toBe(true);
      expect(detectCustomHtmlPatterns('<main>x</main>')).toBe(true);
    });

    it('returns true for form/input/button/iframe/svg', () => {
      expect(detectCustomHtmlPatterns('<form>x</form>')).toBe(true);
      expect(detectCustomHtmlPatterns('<input type="text" />')).toBe(true);
      expect(detectCustomHtmlPatterns('<button>x</button>')).toBe(true);
      expect(detectCustomHtmlPatterns('<iframe src="x"></iframe>')).toBe(true);
      expect(detectCustomHtmlPatterns('<svg><circle /></svg>')).toBe(true);
    });
  });
});

describe('wrapEmailWithStyles', () => {
  it('wraps custom HTML fragments in a minimal document shell without prose styles', () => {
    const html = wrapEmailWithStyles('<div style="color: red"><table><tr><td>x</td></tr></table></div>');

    expect(html).toBe(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
<div style="color: red"><table><tr><td>x</td></tr></table></div>
</body>
</html>`);
    expect(html).not.toContain('class="prose prose-sm max-w-none"');
    expect(html).not.toContain('Tailwind Typography');
  });

  it('preserves complete custom HTML documents byte-for-byte', () => {
    const document =
      '<!doctype html><html><head><style>td{color:red}</style></head><body><table><tr><td>x</td></tr></table></body></html>';

    expect(wrapEmailWithStyles(document)).toBe(document);
  });

  it('preserves complete HTML documents even when the body only contains visual-editor markup', () => {
    const document = '<!doctype html><html><head><title>x</title></head><body><p>Hello</p></body></html>';

    expect(wrapEmailWithStyles(document)).toBe(document);
  });
});
