import {beforeEach, describe, expect, it, vi, type Mock} from 'vitest';

vi.mock('@aws-sdk/client-ses', () => {
  const SESMock = vi.fn();
  SESMock.prototype.sendRawEmail = vi.fn().mockResolvedValue({MessageId: 'test-message-id'});
  return {SES: SESMock};
});

vi.mock('../../app/constants.js', () => ({
  AWS_SES_ACCESS_KEY_ID: 'test-key-id',
  AWS_SES_REGION: 'us-east-1',
  AWS_SES_SECRET_ACCESS_KEY: 'test-secret',
  MAIL_FROM_SUBDOMAIN: 'mail',
  SES_CONFIGURATION_SET: 'test-config-set',
  SES_CONFIGURATION_SET_NO_TRACKING: 'test-no-tracking-set',
  TRACKING_TOGGLE_ENABLED: true,
}));

describe('SESService MIME content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const html =
    '<main><h1>Quarterly update</h1><p>Hello <strong>world</strong> &amp; team.</p><a href="https://example.com/report">Read report</a><img src="cid:image1"></main>';

  function getRawMessage(ses: typeof import('../SESService').ses) {
    const callArgs = (ses.sendRawEmail as Mock).mock.calls[0][0];
    return new TextDecoder().decode(callArgs.RawMessage.Data);
  }

  function getMimePartBody(rawMessage: string, contentType: string) {
    const partStart = rawMessage.indexOf(`Content-Type: ${contentType}; charset=utf-8`);
    expect(partStart).toBeGreaterThanOrEqual(0);

    const bodyStart = rawMessage.indexOf('\n\n', partStart);
    expect(bodyStart).toBeGreaterThanOrEqual(0);

    const nextBoundary = rawMessage.indexOf('\n--', bodyStart + 2);
    expect(nextBoundary).toBeGreaterThanOrEqual(0);

    return rawMessage.slice(bodyStart + 2, nextBoundary);
  }

  function getMimePart(rawMessage: string, contentType: string) {
    const partStart = rawMessage.indexOf(`Content-Type: ${contentType}; charset=utf-8`);
    expect(partStart).toBeGreaterThanOrEqual(0);

    const nextBoundary = rawMessage.indexOf('\n--', partStart);
    expect(nextBoundary).toBeGreaterThanOrEqual(0);

    return rawMessage.slice(partStart, nextBoundary);
  }

  function decodeBase64MimeBody(body: string) {
    return Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8');
  }

  it('adds text/plain before text/html inside nested alternative content', async () => {
    const {sendRawEmail, ses} = await import('../SESService');

    await sendRawEmail({
      from: {name: 'Sender', email: 'sender@example.com'},
      to: ['recipient@example.com'],
      content: {
        subject: 'Test Subject',
        html,
      },
      attachments: [
        {
          filename: 'report.pdf',
          content: 'JVBERi0x',
          contentType: 'application/pdf',
          disposition: 'attachment',
        },
        {
          filename: 'image.png',
          content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          contentType: 'image/png',
          contentId: 'image1',
          disposition: 'inline',
        },
      ],
    });

    const rawMessage = getRawMessage(ses);

    const mixedMatch = rawMessage.match(/Content-Type: multipart\/mixed; boundary="([^"]+)"/);
    const relatedMatch = rawMessage.match(/Content-Type: multipart\/related; boundary="([^"]+)"/);

    expect(mixedMatch?.[1]).toBeDefined();
    expect(relatedMatch?.[1]).toBeDefined();
    expect(rawMessage).toContain(`--${mixedMatch?.[1]}\nContent-Type: multipart/related`);
    expect(rawMessage).toContain(`--${relatedMatch?.[1]}\nContent-Type: multipart/alternative`);
    expect(rawMessage).toContain(`--${relatedMatch?.[1]}\nContent-Type: image/png`);
    expect(rawMessage).toContain(`--${mixedMatch?.[1]}\nContent-Type: application/pdf`);

    const plainHeaderIndex = rawMessage.indexOf('Content-Type: text/plain; charset=utf-8');
    const htmlHeaderIndex = rawMessage.indexOf('Content-Type: text/html; charset=utf-8');

    expect(plainHeaderIndex).toBeGreaterThanOrEqual(0);
    expect(htmlHeaderIndex).toBeGreaterThan(plainHeaderIndex);

    const plainBody = decodeBase64MimeBody(getMimePartBody(rawMessage, 'text/plain'));
    const htmlBody = getMimePartBody(rawMessage, 'text/html');

    expect(plainBody).toContain('QUARTERLY UPDATE');
    expect(plainBody).toContain('Hello world & team.');
    expect(plainBody).toContain('Read report');
    expect(plainBody).toContain('https://example.com/report');
    expect(plainBody).not.toContain('<main>');
    expect(plainBody).not.toContain('<strong>');
    expect(plainBody).not.toContain('<a ');
    expect(htmlBody).toContain(html);
  });

  it('base64 encodes generated UTF-8 text/plain content with MIME line wrapping', async () => {
    const {sendRawEmail, ses} = await import('../SESService');

    await sendRawEmail({
      from: {name: 'Sender', email: 'sender@example.com'},
      to: ['recipient@example.com'],
      content: {
        subject: 'Test Subject',
        html: '<p>Español: canción, piñata, corazón 😄</p>',
      },
    });

    const rawMessage = getRawMessage(ses);
    const plainPart = getMimePart(rawMessage, 'text/plain');
    const plainBody = getMimePartBody(rawMessage, 'text/plain');
    const plainLines = plainBody.split('\n');
    const htmlPart = getMimePart(rawMessage, 'text/html');

    expect(plainPart).toContain('Content-Transfer-Encoding: base64');
    expect(htmlPart).toContain('Content-Transfer-Encoding: 7bit');
    expect(plainLines.every(line => line.length <= 76)).toBe(true);
    expect(decodeBase64MimeBody(plainBody)).toContain('Español: canción, piñata, corazón 😄');
  });

  it('omits hidden preheader text from generated text/plain content', async () => {
    const {sendRawEmail, ses} = await import('../SESService');

    await sendRawEmail({
      from: {name: 'Sender', email: 'sender@example.com'},
      to: ['recipient@example.com'],
      content: {
        subject: 'Test Subject',
        html: [
          '<div style="display:none; max-height:0; overflow:hidden;">Hidden preview one</div>',
          '<div style="display: none; max-height:0; overflow:hidden;">Hidden preview two</div>',
          '<p>Visible campaign body</p>',
        ].join(''),
      },
    });

    const plainBody = decodeBase64MimeBody(getMimePartBody(getRawMessage(ses), 'text/plain'));

    expect(plainBody).not.toContain('Hidden preview one');
    expect(plainBody).not.toContain('Hidden preview two');
    expect(plainBody).toContain('Visible campaign body');
  });
});
