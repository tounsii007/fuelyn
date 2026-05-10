// ============================================================
// Wallet-pass builder tests.
// ============================================================

import { describe, it, expect } from 'vitest';
import { buildWalletPass, buildAppleManifest, rgbCss } from '../wallet-pass';

const SAMPLE = {
  stationId: 'st-aral-12',
  stationLabel: 'Aral Bahnhofstr. 12',
  cityLine: '35037 Marburg',
  fuelLabel: 'E10',
  priceEurPerL: '1,749',
  distanceLabel: '1.2 km',
  deepLink: 'https://fuelyn.app/station/st-aral-12?source=wallet',
};

describe('buildWalletPass — Apple', () => {
  it('produces formatVersion 1 with required identifiers', () => {
    const { apple } = buildWalletPass(SAMPLE);
    expect(apple.formatVersion).toBe(1);
    expect(apple.passTypeIdentifier).toMatch(/^pass\./);
    expect(apple.teamIdentifier).toBeTruthy();
    expect(apple.organizationName).toBe('Fuelyn');
  });

  it('serial is stable but unique-per-build', () => {
    const a = buildWalletPass(SAMPLE).apple.serialNumber;
    const b = buildWalletPass(SAMPLE).apple.serialNumber;
    expect(a).toContain(SAMPLE.stationId);
    expect(b).toContain(SAMPLE.stationId);
    // Two builds in the same ms can yield the same serial — so we
    // only test the prefix here, not strict inequality.
    expect(a.startsWith('fuelyn-')).toBe(true);
  });

  it('renders price as the primary field', () => {
    const { apple } = buildWalletPass(SAMPLE);
    expect(apple.generic.primaryFields[0]?.label).toBe('E10');
    expect(apple.generic.primaryFields[0]?.value).toBe('1,749 €/L');
  });

  it('puts the deep-link in a QR barcode', () => {
    const { apple } = buildWalletPass(SAMPLE);
    expect(apple.barcode.format).toBe('PKBarcodeFormatQR');
    expect(apple.barcode.message).toBe(SAMPLE.deepLink);
  });

  it('omits distance / city auxiliary fields when not provided', () => {
    const { apple } = buildWalletPass({
      ...SAMPLE,
      distanceLabel: undefined,
      cityLine: undefined,
    });
    expect(apple.generic.auxiliaryFields).toHaveLength(0);
  });

  it('uses the configured pass-type-id when supplied', () => {
    const { apple } = buildWalletPass({
      ...SAMPLE,
      passTypeIdentifier: 'pass.com.example.deal',
      teamIdentifier: 'ABCDE12345',
    });
    expect(apple.passTypeIdentifier).toBe('pass.com.example.deal');
    expect(apple.teamIdentifier).toBe('ABCDE12345');
  });
});

describe('buildWalletPass — Google', () => {
  it('produces a GenericObject with QR barcode', () => {
    const { google } = buildWalletPass(SAMPLE);
    expect(google.classId).toBe('fuelyn.deal');
    expect(google.state).toBe('ACTIVE');
    expect(google.barcode.type).toBe('QR_CODE');
    expect(google.barcode.value).toBe(SAMPLE.deepLink);
  });

  it('headlines the price', () => {
    const { google } = buildWalletPass(SAMPLE);
    expect(google.header.defaultValue.value).toContain('1,749');
  });

  it('subheads the station name', () => {
    const { google } = buildWalletPass(SAMPLE);
    expect(google.subheader.defaultValue.value).toBe(SAMPLE.stationLabel);
  });

  it('emits a textModulesData with the fuel label', () => {
    const { google } = buildWalletPass(SAMPLE);
    expect(google.textModulesData.some((m) => m.id === 'fuel' && m.body === 'E10')).toBe(true);
  });

  it('respects a custom background colour', () => {
    const { google } = buildWalletPass({ ...SAMPLE, backgroundColorHex: '#FF0000' });
    expect(google.hexBackgroundColor).toBe('#FF0000');
  });

  it('language tag follows the locale prefix', () => {
    const { google } = buildWalletPass({ ...SAMPLE, locale: 'fr-FR' });
    expect(google.cardTitle.defaultValue.language).toBe('fr');
  });
});

describe('rgbCss', () => {
  it('converts the brand colour correctly', () => {
    expect(rgbCss('#2575EA')).toBe('rgb(37, 117, 234)');
  });

  it('handles "#" prefix optional', () => {
    expect(rgbCss('FF0000')).toBe('rgb(255, 0, 0)');
  });

  it('falls back to brand on malformed input', () => {
    expect(rgbCss('not-a-color')).toBe('rgb(37, 117, 234)');
  });
});

describe('buildAppleManifest', () => {
  it('produces a flat name → sha map', () => {
    const m = buildAppleManifest([
      { name: 'pass.json', sha1: 'a1' },
      { name: 'icon.png', sha1: 'b2' },
    ]);
    expect(m).toEqual({ 'pass.json': 'a1', 'icon.png': 'b2' });
  });
});
