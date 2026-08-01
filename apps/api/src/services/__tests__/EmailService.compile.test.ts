import type {Contact, Project} from '@plunk/db';
import {describe, expect, it, vi} from 'vitest';
import {EmailService} from '../EmailService';

vi.mock('../../database/prisma.js', () => ({prisma: {}}));

describe('EmailService.compile custom HTML', () => {
  const contact = {id: 'contact-123', data: {}} as Contact;
  const project = {name: 'Project', language: 'en', subscription: {id: 'subscription-123'}} as Project;

  it('wraps custom HTML fragments in a minimal document shell without prose styles', () => {
    const html = EmailService.compile({
      content: '<div style="color: red"><table><tr><td>x</td></tr></table></div>',
      contact,
      project,
      includeUnsubscribe: false,
    });

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

  it('preserves complete custom HTML documents byte-for-byte when no footer is inserted', () => {
    const document =
      '<!doctype html><html><head><style>td{color:red}</style></head><body><table><tr><td>x</td></tr></table></body></html>';

    expect(
      EmailService.compile({
        content: document,
        contact,
        project,
        includeUnsubscribe: false,
      }),
    ).toBe(document);
  });

  it('preserves complete HTML documents even when the body only contains visual-editor markup', () => {
    const document = '<!doctype html><html><head><title>x</title></head><body><p>Hello</p></body></html>';

    expect(
      EmailService.compile({
        content: document,
        contact,
        project,
        includeUnsubscribe: false,
      }),
    ).toBe(document);
  });

  it.each(['</BODY>', '</BoDy>'])(
    'inserts the unsubscribe footer before a complete custom document closing %s tag',
    closingBodyTag => {
      const document = `<!doctype html><html><head><title>x</title></head><body><table><tr><td>x</td></tr></table>${closingBodyTag}</html>`;

      const html = EmailService.compile({
        content: document,
        contact,
        project,
        includeUnsubscribe: true,
      });

      expect(html).toContain(closingBodyTag);
      expect(html.indexOf('/unsubscribe/contact-123')).toBeGreaterThan(-1);
      expect(html.indexOf('/unsubscribe/contact-123')).toBeLessThan(html.indexOf(closingBodyTag));
      expect(html.endsWith(`${closingBodyTag}</html>`)).toBe(true);
    },
  );
});
