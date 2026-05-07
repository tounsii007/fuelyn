// ============================================================
// TankPilot — Affiliate Partner Definitions
// Partners with referral/affiliate programs for monetization.
// Replace URLs with actual affiliate tracking links.
// ============================================================

import type { AffiliatePartner } from '@tankpilot/core';

export const AFFILIATE_PARTNERS: AffiliatePartner[] = [
  // ─── Tankkarten ─────────────────────────────────────────
  {
    id: 'dkv',
    name: 'DKV Card',
    description: 'Europas größtes Tankkartennetzwerk — bargeldlos an über 63.000 Stationen tanken.',
    category: 'tankkarte',
    logoUrl: '/partners/dkv.svg',
    affiliateUrl: 'https://www.dkv-euroservice.com/de/tankkarte',
    benefits: [
      'Akzeptiert an 63.000+ Stationen europaweit',
      'Keine Jahresgebühr für Einzelkarten',
      'Monatliche Sammelrechnung mit MwSt.-Ausweis',
      'App mit Stationsfinder',
    ],
    discount: null,
  },
  {
    id: 'uta',
    name: 'UTA Tankkarte',
    description: 'Universelle Tankkarte für Flotten & Vielfahrer in 40+ Ländern.',
    category: 'tankkarte',
    logoUrl: '/partners/uta.svg',
    affiliateUrl: 'https://www.uta.com/de/tankkarte',
    benefits: [
      'Über 74.000 Akzeptanzstellen',
      'Maut, Waschen, Parken inklusive',
      'Digitale Belege & Fuhrpark-Management',
      'Ideal für Unternehmen & Flotten',
    ],
    discount: null,
  },
  {
    id: 'aral-komfort',
    name: 'Aral Komfort Tankkarte',
    description: 'Die beliebteste Tankkarte Deutschlands — Punkte sammeln & sparen.',
    category: 'tankkarte',
    logoUrl: '/partners/aral.svg',
    affiliateUrl: 'https://www.aral.de/de/privatkunden/tankkarte.html',
    benefits: [
      'An allen 2.400+ Aral Stationen nutzbar',
      'PAYBACK-Punkte sammeln',
      'Kontaktloses Bezahlen',
      'Kostenlose Beantragung',
    ],
    discount: 'PAYBACK-Punkte bei jedem Tanken',
  },
  {
    id: 'shell-card',
    name: 'Shell Card',
    description: 'Shell Tankkarte mit Cashback-Programm und Flottenmanagement.',
    category: 'tankkarte',
    logoUrl: '/partners/shell.svg',
    affiliateUrl: 'https://www.shell.de/geschaeftskunden/shell-card.html',
    benefits: [
      '26.000+ Shell Stationen europaweit',
      'Bis zu 1 Ct/L Rabatt',
      'Online-Portal mit Analysen',
      'Kartenlimit individuell einstellbar',
    ],
    discount: 'Bis zu 1 Ct/L Rabatt',
  },

  // ─── Ladekarten (E-Auto) ────────────────────────────────
  {
    id: 'enbw',
    name: 'EnBW mobility+',
    description: 'Deutschlands größtes Ladenetz — überall laden mit einer Karte.',
    category: 'ladekarte',
    logoUrl: '/partners/enbw.svg',
    affiliateUrl: 'https://www.enbw.com/elektromobilitaet/produkte/mobility-plus',
    benefits: [
      'Über 700.000 Ladepunkte europaweit',
      'Einheitliche Preise ohne Roaming-Aufschläge',
      'AC ab 39 Ct/kWh, DC ab 49 Ct/kWh',
      'Auto-Charge an EnBW-Stationen',
    ],
    discount: null,
  },
  {
    id: 'adac-echarge',
    name: 'ADAC e-Charge',
    description: 'ADAC-Ladekarte mit Vorteilspreis für ADAC-Mitglieder.',
    category: 'ladekarte',
    logoUrl: '/partners/adac.svg',
    affiliateUrl: 'https://www.adac.de/rund-ums-fahrzeug/elektromobilitaet/laden/adac-e-charge/',
    benefits: [
      'Sonderpreise für ADAC-Mitglieder',
      'Über 600.000 Ladepunkte in Europa',
      'Transparente kWh-Abrechnung',
      'Keine monatliche Grundgebühr',
    ],
    discount: 'Sonderpreis für ADAC-Mitglieder',
  },
  {
    id: 'maingau',
    name: 'Maingau EinfachStromLaden',
    description: 'Günstiger Ladetarif ohne Grundgebühr — pay-per-use.',
    category: 'ladekarte',
    logoUrl: '/partners/maingau.svg',
    affiliateUrl: 'https://www.maingau-energie.de/e-mobilitaet/autostrom-tarif',
    benefits: [
      'Keine monatliche Grundgebühr',
      'Günstige kWh-Preise',
      '400.000+ Ladepunkte in Europa',
      'App mit Echtzeitverfügbarkeit',
    ],
    discount: 'Keine Grundgebühr',
  },

  // ─── Automobil-Clubs ────────────────────────────────────
  {
    id: 'adac',
    name: 'ADAC Mitgliedschaft',
    description: 'Europas größter Automobilclub — Pannenhilfe, Versicherung & mehr.',
    category: 'club',
    logoUrl: '/partners/adac.svg',
    affiliateUrl: 'https://www.adac.de/mitgliedschaft/',
    benefits: [
      'Pannenhilfe in ganz Europa',
      'Rabatte auf Tanken, Reisen, Versicherungen',
      'TourSet & Routenplaner',
      'Kostenlose Prüfdienstleistungen',
    ],
    discount: 'Ab €59/Jahr',
  },
];

/** Get partners filtered by category. */
export function getPartnersByCategory(category: AffiliatePartner['category']): AffiliatePartner[] {
  return AFFILIATE_PARTNERS.filter((p) => p.category === category);
}

/** Get partners relevant for a given drive type. */
export function getPartnersForDriveType(driveType: 'benzin' | 'diesel' | 'hybrid' | 'elektro'): AffiliatePartner[] {
  switch (driveType) {
    case 'elektro':
      return AFFILIATE_PARTNERS.filter((p) => p.category === 'ladekarte' || p.category === 'club');
    case 'hybrid':
      return AFFILIATE_PARTNERS; // Show all
    default:
      return AFFILIATE_PARTNERS.filter((p) => p.category === 'tankkarte' || p.category === 'club');
  }
}
