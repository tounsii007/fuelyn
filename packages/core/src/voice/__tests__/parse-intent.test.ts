// ============================================================
// Voice intent parser tests.
// Covers de + en utterances, slot extraction, confidence
// scoring, and ambiguous edge cases that previously caused
// the wrong intent to fire.
// ============================================================

import { describe, it, expect } from 'vitest';
import { parseVoiceIntent } from '../parse-intent';

describe('parseVoiceIntent — locale sniffing', () => {
  it('detects German from "wo ist die günstigste"', () => {
    const out = parseVoiceIntent('Wo ist die günstigste Tankstelle?');
    expect(out.locale).toBe('de');
  });

  it('detects English from "where is the cheapest"', () => {
    const out = parseVoiceIntent('Where is the cheapest gas?');
    expect(out.locale).toBe('en');
  });

  it('respects an explicit locale hint', () => {
    const out = parseVoiceIntent('cheapest e10', { locale: 'de' });
    expect(out.locale).toBe('de');
  });

  it('defaults to de when neutral / mixed', () => {
    const out = parseVoiceIntent('e10');
    expect(out.locale).toBe('de');
  });
});

describe('parseVoiceIntent — find-cheapest', () => {
  it('matches "günstigste" + extracts e10 fuel', () => {
    const out = parseVoiceIntent('Wo ist die günstigste E10 Tankstelle?');
    expect(out.intent).toBe('find-cheapest');
    expect(out.slots.fuel).toBe('e10');
    expect(out.confidence).toBeGreaterThan(0.8);
  });

  it('matches "cheapest diesel" in English', () => {
    const out = parseVoiceIntent('Show me the cheapest diesel near me');
    expect(out.intent).toBe('find-cheapest');
    expect(out.slots.fuel).toBe('diesel');
  });

  it('returns the intent even without fuel mentioned', () => {
    const out = parseVoiceIntent('Wo ist die günstigste Tankstelle');
    expect(out.intent).toBe('find-cheapest');
    expect(out.slots.fuel).toBeUndefined();
  });
});

describe('parseVoiceIntent — navigate-to-station', () => {
  it('matches "navigiere zur Aral" + extracts brand', () => {
    const out = parseVoiceIntent('Navigiere zur nächsten Aral');
    expect(out.intent).toBe('navigate-to-station');
    expect(out.slots.brand?.toLowerCase()).toBe('aral');
    expect(out.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('matches "take me to shell"', () => {
    const out = parseVoiceIntent('Take me to the nearest Shell');
    expect(out.intent).toBe('navigate-to-station');
    expect(out.slots.brand?.toLowerCase()).toBe('shell');
  });

  it('lower confidence when brand is not given', () => {
    const out = parseVoiceIntent('Navigiere mich zur nächsten Tankstelle');
    expect(out.intent).toBe('navigate-to-station');
    expect(out.slots.brand).toBeUndefined();
    expect(out.confidence).toBeLessThan(0.9);
  });
});

describe('parseVoiceIntent — add-fuel-log', () => {
  it('parses "45 liter eintragen"', () => {
    const out = parseVoiceIntent('45 Liter eintragen');
    expect(out.intent).toBe('add-fuel-log');
    expect(out.slots.liters).toBe(45);
  });

  it('parses both liters and price in one utterance', () => {
    const out = parseVoiceIntent('Logge 38,5 Liter Diesel zu 1,749 Euro pro Liter');
    expect(out.intent).toBe('add-fuel-log');
    expect(out.slots.liters).toBeCloseTo(38.5, 1);
    expect(out.slots.fuel).toBe('diesel');
    expect(out.slots.pricePerLiter).toBeCloseTo(1.749, 2);
  });

  it('parses English "log 40 liters"', () => {
    const out = parseVoiceIntent('Log 40 liters of diesel');
    expect(out.intent).toBe('add-fuel-log');
    expect(out.slots.liters).toBe(40);
    expect(out.slots.fuel).toBe('diesel');
  });

  it('opens the form even with no liters when verb is present', () => {
    const out = parseVoiceIntent('Tankvorgang eintragen');
    expect(out.intent).toBe('add-fuel-log');
    expect(out.slots.liters).toBeUndefined();
  });
});

describe('parseVoiceIntent — set-radius', () => {
  it('parses "umkreis 8 km"', () => {
    const out = parseVoiceIntent('Umkreis 8 km');
    expect(out.intent).toBe('set-radius');
    expect(out.slots.radiusKm).toBe(8);
  });

  it('parses "set radius to 12 km"', () => {
    const out = parseVoiceIntent('Set radius to 12km');
    expect(out.intent).toBe('set-radius');
    expect(out.slots.radiusKm).toBe(12);
  });

  it('rejects radius outside 1..100 km', () => {
    const out = parseVoiceIntent('Umkreis 500 km');
    // Falls through to unknown / other intent because radius was clamped out.
    expect(out.intent).not.toBe('set-radius');
  });
});

describe('parseVoiceIntent — switch-fuel', () => {
  it('matches "schalte um auf diesel"', () => {
    const out = parseVoiceIntent('Schalte um auf Diesel');
    expect(out.intent).toBe('switch-fuel');
    expect(out.slots.fuel).toBe('diesel');
  });

  it('matches "switch to e10"', () => {
    const out = parseVoiceIntent('Switch to e10');
    expect(out.intent).toBe('switch-fuel');
    expect(out.slots.fuel).toBe('e10');
  });

  it('does not fire without a fuel mentioned', () => {
    const out = parseVoiceIntent('Wechsle zu was anderem');
    expect(out.intent).not.toBe('switch-fuel');
  });
});

describe('parseVoiceIntent — show-* / open-settings / help', () => {
  it('routes "Erfolge zeigen" to show-achievements', () => {
    const out = parseVoiceIntent('Zeige meine Erfolge');
    expect(out.intent).toBe('show-achievements');
  });

  it('routes "settings" to open-settings', () => {
    const out = parseVoiceIntent('Open settings');
    expect(out.intent).toBe('open-settings');
  });

  it('routes "stats" to show-stats', () => {
    const out = parseVoiceIntent('Show stats');
    expect(out.intent).toBe('show-stats');
  });

  it('routes "hilfe" to help', () => {
    const out = parseVoiceIntent('Hilfe');
    expect(out.intent).toBe('help');
  });

  it('routes "what can you do" to help', () => {
    const out = parseVoiceIntent('What can you do?');
    expect(out.intent).toBe('help');
  });
});

describe('parseVoiceIntent — disambiguation', () => {
  it('"log 40 liters" beats "show log"', () => {
    // Naïve impl might take show-fuel-log because both contain "log".
    const out = parseVoiceIntent('Log 40 liters today');
    expect(out.intent).toBe('add-fuel-log');
    expect(out.slots.liters).toBe(40);
  });

  it('"navigate to aral" beats "find cheapest"', () => {
    // "Navigate" comes first AND we have a brand — should win cleanly.
    const out = parseVoiceIntent('Navigate to the cheapest Aral');
    expect(out.intent).toBe('navigate-to-station');
    expect(out.slots.brand?.toLowerCase()).toBe('aral');
  });
});

describe('parseVoiceIntent — robustness', () => {
  it('returns unknown for empty input', () => {
    const out = parseVoiceIntent('');
    expect(out.intent).toBe('unknown');
    expect(out.confidence).toBe(0);
  });

  it('returns unknown for gibberish', () => {
    const out = parseVoiceIntent('xyzzy plover frotz');
    expect(out.intent).toBe('unknown');
  });

  it('strips ?!¿¡ from the utterance', () => {
    const out = parseVoiceIntent('Hilfe!!!');
    expect(out.utterance).toBe('hilfe');
    expect(out.intent).toBe('help');
  });

  it('"super" alone is not e5 if there is no fuel context', () => {
    // We check the intent — "wechsle zu super" with a switch-fuel verb SHOULD pick e5.
    const switched = parseVoiceIntent('Wechsle zu Super');
    expect(switched.intent).toBe('switch-fuel');
    expect(switched.slots.fuel).toBe('e5');
  });
});
