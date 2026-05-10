// ============================================================
// Pkpass packager tests — manifest path only (signing path
// requires real Apple Pass-Type-ID PEMs which CI doesn't have).
// ============================================================

import { describe, it, expect } from 'vitest';
import { packagePkpass } from '../pkpass-signer';

describe('packagePkpass — manifest path', () => {
  it('builds a manifest of file → sha1 hex', () => {
    const out = packagePkpass([
      { name: 'pass.json', content: '{"a":1}' },
      { name: 'icon.png', content: Buffer.from([1, 2, 3]) },
    ]);
    expect(Object.keys(out.manifest).sort()).toEqual(['icon.png', 'pass.json']);
    expect(out.manifest['pass.json']).toMatch(/^[0-9a-f]{40}$/);
    expect(out.manifest['icon.png']).toMatch(/^[0-9a-f]{40}$/);
  });

  it('returns signed=false when credentials missing', () => {
    delete process.env.FUELYN_PKPASS_CERT_PATH;
    delete process.env.FUELYN_PKPASS_KEY_PATH;
    delete process.env.FUELYN_PKPASS_WWDR_PATH;
    const out = packagePkpass([{ name: 'pass.json', content: '{}' }]);
    expect(out.signed).toBe(false);
    expect(out.signature).toBeNull();
    expect(out.files).toHaveLength(1);
  });

  it('includes the original files in the bundle untouched', () => {
    const files = [
      { name: 'pass.json', content: '{"x":2}' },
      { name: 'logo.png', content: Buffer.from('LOGO') },
    ];
    const out = packagePkpass(files);
    expect(out.files).toEqual(files);
  });
});
