// ============================================================
// mail/transport — nodemailer is mocked (no real SMTP). We verify
// the dev/no-transport behaviour (null transport, sendMagicLinkEmail
// throws), the transport being built from MAIL_TRANSPORT, and that a
// magic-link send carries the address + a German subject + text/html
// bodies with the (HTML-escaped) link. The module memoises its
// transport on a global, so each test resets modules + the global and
// re-imports fresh.
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createTransportMock, sendMailMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn(async (_options: Record<string, unknown>) => ({ messageId: 'test' }));
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { createTransportMock, sendMailMock };
});

vi.mock('nodemailer', () => ({ default: { createTransport: createTransportMock } }));

interface SentMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

describe('mail/transport', () => {
  beforeEach(() => {
    vi.resetModules();
    createTransportMock.mockClear();
    sendMailMock.mockClear();
    delete (globalThis as { __fuelynMailTransport?: unknown }).__fuelynMailTransport;
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('has no transport when MAIL_TRANSPORT is unset', async () => {
    const { getMailTransport } = await import('./transport');
    expect(getMailTransport()).toBeNull();
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('sendMagicLinkEmail throws when no transport is configured', async () => {
    const { sendMagicLinkEmail } = await import('./transport');
    await expect(
      sendMagicLinkEmail({ to: 'driver@example.com', link: 'https://x/y' }),
    ).rejects.toThrow(/MAIL_TRANSPORT/);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('builds the transport from MAIL_TRANSPORT and sends the magic-link email', async () => {
    vi.stubEnv('MAIL_TRANSPORT', 'smtps://user:pass@smtp.example.com:465');
    const { sendMagicLinkEmail } = await import('./transport');

    const link = 'https://fuelyn.app/auth/claim?token=abc&email=driver%40example.com';
    await sendMagicLinkEmail({ to: 'driver@example.com', link });

    expect(createTransportMock).toHaveBeenCalledWith('smtps://user:pass@smtp.example.com:465');
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const msg = sendMailMock.mock.calls[0]![0] as unknown as SentMessage;
    expect(msg.to).toBe('driver@example.com');
    expect(msg.subject).toContain('Fuelyn');
    expect(msg.text).toContain('https://fuelyn.app/auth/claim?token=abc');
    expect(msg.html).toContain('href=');
    // The link's `&` is HTML-escaped in the html body.
    expect(msg.html).toContain('&amp;email=');
    expect(msg.from).toContain('Fuelyn');
  });

  it('honours the MAIL_FROM override', async () => {
    vi.stubEnv('MAIL_TRANSPORT', 'smtp://localhost:25');
    vi.stubEnv('MAIL_FROM', 'Login <login@fuelyn.app>');
    const { sendMagicLinkEmail } = await import('./transport');

    await sendMagicLinkEmail({ to: 'x@y.de', link: 'https://z' });

    const msg = sendMailMock.mock.calls[0]![0] as unknown as SentMessage;
    expect(msg.from).toBe('Login <login@fuelyn.app>');
  });
});
