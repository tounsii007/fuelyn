// ============================================================
// Transactional email — magic-link delivery.
//
// Uses nodemailer with an SMTP transport built from MAIL_TRANSPORT (an
// SMTP connection URL, e.g. smtps://user:pass@smtp.host:465). When
// MAIL_TRANSPORT is unset getMailTransport() returns null and callers
// fall back to the dev-only echo stub. Production refuses to issue
// magic links without MAIL_TRANSPORT (enforced in the route handler).
// ============================================================

import nodemailer, { type Transporter } from 'nodemailer';

// Envelope From. Override with MAIL_FROM (e.g. "Fuelyn <login@fuelyn.app>").
const DEFAULT_FROM = 'Fuelyn <no-reply@fuelyn.app>';

declare global {
  var __fuelynMailTransport: Transporter | null | undefined;
}

let cached: Transporter | null | undefined = globalThis.__fuelynMailTransport;

/**
 * The shared nodemailer transport, or null when MAIL_TRANSPORT is unset.
 * Pinned to a global so Next.js hot-reload reuses one connection pool.
 */
export function getMailTransport(): Transporter | null {
  if (cached !== undefined) return cached;

  const url = process.env.MAIL_TRANSPORT;
  if (!url || url.trim() === '') {
    cached = null;
    globalThis.__fuelynMailTransport = null;
    return null;
  }

  const transport = nodemailer.createTransport(url);
  cached = transport;
  globalThis.__fuelynMailTransport = transport;
  return transport;
}

export interface MagicLinkEmail {
  to: string;
  link: string;
}

/**
 * Send the single-use magic-link email. Throws when no transport is
 * configured (the caller guards prod on MAIL_TRANSPORT beforehand) or
 * when the SMTP send itself fails.
 */
export async function sendMagicLinkEmail({ to, link }: MagicLinkEmail): Promise<void> {
  const transport = getMailTransport();
  if (!transport) {
    throw new Error('[mail] MAIL_TRANSPORT not configured — cannot send magic-link email');
  }

  await transport.sendMail({
    from: process.env.MAIL_FROM || DEFAULT_FROM,
    to,
    subject: 'Dein Fuelyn-Anmeldelink',
    text: magicLinkText(link),
    html: magicLinkHtml(link),
  });
}

function magicLinkText(link: string): string {
  return [
    'Hallo,',
    '',
    'klicke auf den folgenden Link, um dich bei Fuelyn anzumelden:',
    link,
    '',
    'Der Link ist 15 Minuten gültig und kann nur einmal verwendet werden.',
    'Wenn du das nicht angefordert hast, ignoriere diese E-Mail einfach.',
    '',
    '— Fuelyn',
  ].join('\n');
}

function magicLinkHtml(link: string): string {
  // The link carries `&` (token + email query params); escape it so the
  // href is valid HTML and can't break out of the attribute.
  const href = escapeHtml(link);
  return [
    '<!doctype html>',
    '<html lang="de"><body style="font-family:system-ui,-apple-system,sans-serif;color:#0F172A;line-height:1.5">',
    '<p>Hallo,</p>',
    '<p>klicke auf den Button, um dich bei Fuelyn anzumelden:</p>',
    `<p><a href="${href}" style="display:inline-block;padding:10px 18px;background:#2575EA;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">Bei Fuelyn anmelden</a></p>`,
    '<p style="color:#64748B;font-size:13px">Der Link ist 15 Minuten gültig und kann nur einmal verwendet werden. Wenn du das nicht angefordert hast, ignoriere diese E-Mail einfach.</p>',
    '<p style="color:#94A3B8;font-size:13px">— Fuelyn</p>',
    '</body></html>',
  ].join('');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
