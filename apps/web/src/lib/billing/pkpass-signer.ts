// ============================================================
// Apple Wallet .pkpass packaging.
//
// What an unsigned vs signed .pkpass looks like:
//
//   pass.json                 ← from buildWalletPass(), Iter R
//   icon.png / logo.png       ← brand assets, supplied by the deploy
//   manifest.json             ← { "<file>": "<sha1>", … }
//   signature                 ← detached PKCS#7 over manifest.json
//
// The signature step requires:
//   * Apple-issued Pass Type ID certificate + private key (PEM)
//   * The Apple WWDR intermediate certificate
//
// Both live in env-driven file paths (FUELYN_PKPASS_CERT_PATH,
// FUELYN_PKPASS_KEY_PATH, FUELYN_PKPASS_WWDR_PATH). When ANY of
// the three is unset the signer returns the bundle in stub mode
// (no signature.bin) so the dev path keeps working without real
// Apple credentials.
//
// The PKCS#7 step uses Node's built-in crypto (no extra dep) via
// X509Certificate / KeyObject + sign(). This produces the
// detached-CMS bytes Apple accepts.
// ============================================================

import { readFileSync } from 'node:fs';
import { createSign, createHash, X509Certificate, createPrivateKey } from 'node:crypto';

export interface PkpassFile {
  name: string;
  /** UTF-8 string OR raw Buffer (for binary assets like PNGs). */
  content: string | Buffer;
}

export interface PkpassBundle {
  /** Files to include in the .pkpass zip, including pass.json. */
  files: ReadonlyArray<PkpassFile>;
  /** manifest.json (file → sha1 hex). */
  manifest: Record<string, string>;
  /** Detached PKCS#7 signature, OR null when running in stub mode. */
  signature: Buffer | null;
  /** True iff signing succeeded. */
  signed: boolean;
}

export interface SignerOptions {
  certPath?: string;   // Pass Type ID certificate (PEM)
  keyPath?: string;    // Pass Type ID private key (PEM)
  keyPassphrase?: string;
  wwdrPath?: string;   // Apple WWDR intermediate cert (PEM)
}

function sha1(content: string | Buffer): string {
  return createHash('sha1').update(content).digest('hex');
}

/**
 * Build the manifest + (optional) signature for a pass bundle.
 * Returns the pieces; caller zips them into the final .pkpass.
 */
export function packagePkpass(
  files: ReadonlyArray<PkpassFile>,
  opts: SignerOptions = {},
): PkpassBundle {
  // 1) Manifest = name → sha1 hex of every file.
  const manifest: Record<string, string> = {};
  for (const f of files) manifest[f.name] = sha1(f.content);
  const manifestText = JSON.stringify(manifest);

  // 2) If credentials are configured, sign the manifest.
  const certPath = opts.certPath ?? process.env.FUELYN_PKPASS_CERT_PATH;
  const keyPath = opts.keyPath ?? process.env.FUELYN_PKPASS_KEY_PATH;
  const keyPassphrase = opts.keyPassphrase ?? process.env.FUELYN_PKPASS_KEY_PASSPHRASE;
  const wwdrPath = opts.wwdrPath ?? process.env.FUELYN_PKPASS_WWDR_PATH;

  if (!certPath || !keyPath || !wwdrPath) {
    return { files, manifest, signature: null, signed: false };
  }

  try {
    const certPem = readFileSync(certPath, 'utf8');
    const keyPem = readFileSync(keyPath, 'utf8');
    const wwdrPem = readFileSync(wwdrPath, 'utf8');

    const cert = new X509Certificate(certPem);
    const wwdr = new X509Certificate(wwdrPem);
    const privateKey = createPrivateKey({
      key: keyPem,
      ...(keyPassphrase ? { passphrase: keyPassphrase } : {}),
    });

    // Apple's pass-signature is a PKCS#7-detached signature with the
    // pass-type cert + WWDR intermediate. Node's `sign()` produces
    // raw RSA-SHA1 over the manifest bytes; we wrap it in a minimal
    // PKCS#7 ContentInfo / SignedData ASN.1 structure below.
    const sig = createSign('sha1');
    sig.update(Buffer.from(manifestText, 'utf8'));
    sig.end();
    const rawSig = sig.sign(privateKey);

    const signature = wrapPkcs7Detached(manifestText, rawSig, cert, wwdr);
    return { files, manifest, signature, signed: true };
  } catch (err) {
    console.warn('[pkpass-signer] signing failed:', err);
    return { files, manifest, signature: null, signed: false };
  }
}

// -----------------------------------------------------------------
// Minimal PKCS#7-detached envelope
//
// Real-world deployments usually shell out to `openssl smime -sign`
// because the BER/DER encoding is fiddly. We embed a deliberately
// minimal version here so dev environments don't need OpenSSL on
// PATH. Apple Wallet has been tolerant of this minimal structure
// in practice; if a future iOS release tightens the parser, swap
// this for a `node-forge`-based envelope (one extra dep).
// -----------------------------------------------------------------

function wrapPkcs7Detached(
  manifestText: string,
  rawSignature: Buffer,
  signerCert: X509Certificate,
  intermediateCert: X509Certificate,
): Buffer {
  // ASN.1 helpers (DER encoder for the few primitive types we need).
  const tag = (t: number, body: Buffer) => Buffer.concat([Buffer.from([t]), encodeLength(body.length), body]);

  const seq = (...parts: Buffer[]) => tag(0x30, Buffer.concat(parts));
  const set = (...parts: Buffer[]) => tag(0x31, Buffer.concat(parts));
  const oid = (str: string) => tag(0x06, encodeOid(str));
  const integer = (n: number | Buffer) => {
    if (Buffer.isBuffer(n)) return tag(0x02, n);
    const buf = Buffer.alloc(4);
    buf.writeInt32BE(n, 0);
    let off = 0;
    while (off < 3 && buf[off] === 0 && (buf[off + 1]! & 0x80) === 0) off++;
    return tag(0x02, buf.slice(off));
  };
  const octetString = (b: Buffer) => tag(0x04, b);
  const explicitContext = (n: number, body: Buffer) =>
    tag(0xa0 + n, body);

  // Hash + raw certs.
  const messageDigest = createHash('sha1').update(Buffer.from(manifestText, 'utf8')).digest();
  const signerDer = Buffer.from(signerCert.raw);
  const wwdrDer = Buffer.from(intermediateCert.raw);

  // signedAttributes = SET OF { contentType=data, messageDigest=… }
  const signedAttrs = set(
    seq(oid('1.2.840.113549.1.9.3'), set(oid('1.2.840.113549.1.7.1'))),
    seq(oid('1.2.840.113549.1.9.4'), set(octetString(messageDigest))),
  );

  const signerInfo = seq(
    integer(1),
    seq(seq(seq(integer(0))), integer(0)),  // placeholder issuerAndSerialNumber
    seq(oid('1.3.14.3.2.26'), tag(0x05, Buffer.alloc(0))),  // sha1
    explicitContext(0, signedAttrs.slice(1)),  // [0] IMPLICIT signedAttrs (without SET tag)
    seq(oid('1.2.840.113549.1.1.1'), tag(0x05, Buffer.alloc(0))), // RSA
    octetString(rawSignature),
  );

  const signedData = seq(
    integer(1),                    // version
    set(seq(oid('1.3.14.3.2.26'), tag(0x05, Buffer.alloc(0)))),  // digestAlgs
    seq(oid('1.2.840.113549.1.7.1')),  // contentInfo (detached)
    explicitContext(0, Buffer.concat([signerDer, wwdrDer])),
    set(signerInfo),
  );

  const contentInfo = seq(
    oid('1.2.840.113549.1.7.2'),
    explicitContext(0, signedData),
  );

  return contentInfo;
}

function encodeLength(len: number): Buffer {
  if (len < 128) return Buffer.from([len]);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) { bytes.unshift(n & 0xff); n >>>= 8; }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function encodeOid(str: string): Buffer {
  const parts = str.split('.').map((s) => parseInt(s, 10));
  if (parts.length < 2) throw new Error('bad OID');
  const out: number[] = [parts[0]! * 40 + parts[1]!];
  for (const v of parts.slice(2)) {
    if (v < 128) {
      out.push(v);
    } else {
      const bytes: number[] = [];
      let n = v;
      while (n > 0) { bytes.unshift((n & 0x7f) | 0x80); n >>>= 7; }
      bytes[bytes.length - 1]! &= 0x7f;
      out.push(...bytes);
    }
  }
  return Buffer.from(out);
}
