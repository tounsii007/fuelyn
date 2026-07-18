// ============================================================
// Localized affiliate-partner marketing text (Iteration 23).
//
// Structural data (id, name, category, logoUrl, affiliateUrl) lives
// in affiliate-partners.ts; the user-facing copy (description,
// discount label, benefits) is localized here. de is the source;
// en/en-US/fr were produced by a native-translation pass. discount
// is '' when the partner has no discount badge.
//
// GENERATED — see scratchpad/gen-partner-text.js. Edit the source
// (affiliate-partners.ts / translations) and regenerate.
// ============================================================

import type { AppLocale } from '@fuelyn/core';

export interface PartnerText {
  description: string;
  discount: string;
  benefits: readonly string[];
}

export const PARTNER_TEXT: Record<AppLocale, Record<string, PartnerText>> = {
  'de': {
    'dkv': {
      description: 'Europas größtes Tankkartennetzwerk — bargeldlos an über 63.000 Stationen tanken.',
      discount: '',
      benefits: [
        'Akzeptiert an 63.000+ Stationen europaweit',
        'Keine Jahresgebühr für Einzelkarten',
        'Monatliche Sammelrechnung mit MwSt.-Ausweis',
        'App mit Stationsfinder',
      ],
    },
    'uta': {
      description: 'Universelle Tankkarte für Flotten & Vielfahrer in 40+ Ländern.',
      discount: '',
      benefits: [
        'Über 74.000 Akzeptanzstellen',
        'Maut, Waschen, Parken inklusive',
        'Digitale Belege & Fuhrpark-Management',
        'Ideal für Unternehmen & Flotten',
      ],
    },
    'aral-komfort': {
      description: 'Die beliebteste Tankkarte Deutschlands — Punkte sammeln & sparen.',
      discount: 'PAYBACK-Punkte bei jedem Tanken',
      benefits: [
        'An allen 2.400+ Aral Stationen nutzbar',
        'PAYBACK-Punkte sammeln',
        'Kontaktloses Bezahlen',
        'Kostenlose Beantragung',
      ],
    },
    'shell-card': {
      description: 'Shell Tankkarte mit Cashback-Programm und Flottenmanagement.',
      discount: 'Bis zu 1 Ct/L Rabatt',
      benefits: [
        '26.000+ Shell Stationen europaweit',
        'Bis zu 1 Ct/L Rabatt',
        'Online-Portal mit Analysen',
        'Kartenlimit individuell einstellbar',
      ],
    },
    'enbw': {
      description: 'Deutschlands größtes Ladenetz — überall laden mit einer Karte.',
      discount: '',
      benefits: [
        'Über 700.000 Ladepunkte europaweit',
        'Einheitliche Preise ohne Roaming-Aufschläge',
        'AC ab 39 Ct/kWh, DC ab 49 Ct/kWh',
        'Auto-Charge an EnBW-Stationen',
      ],
    },
    'adac-echarge': {
      description: 'ADAC-Ladekarte mit Vorteilspreis für ADAC-Mitglieder.',
      discount: 'Sonderpreis für ADAC-Mitglieder',
      benefits: [
        'Sonderpreise für ADAC-Mitglieder',
        'Über 600.000 Ladepunkte in Europa',
        'Transparente kWh-Abrechnung',
        'Keine monatliche Grundgebühr',
      ],
    },
    'maingau': {
      description: 'Günstiger Ladetarif ohne Grundgebühr — pay-per-use.',
      discount: 'Keine Grundgebühr',
      benefits: [
        'Keine monatliche Grundgebühr',
        'Günstige kWh-Preise',
        '400.000+ Ladepunkte in Europa',
        'App mit Echtzeitverfügbarkeit',
      ],
    },
    'adac': {
      description: 'Europas größter Automobilclub — Pannenhilfe, Versicherung & mehr.',
      discount: 'Ab €59/Jahr',
      benefits: [
        'Pannenhilfe in ganz Europa',
        'Rabatte auf Tanken, Reisen, Versicherungen',
        'TourSet & Routenplaner',
        'Kostenlose Prüfdienstleistungen',
      ],
    },
  },
  'en': {
    'dkv': {
      description: 'Europe\'s largest fuel-card network — pay cashless at over 63,000 stations.',
      discount: '',
      benefits: [
        'Accepted at 63,000+ stations across Europe',
        'No annual fee on individual cards',
        'Monthly consolidated invoice with VAT breakdown',
        'App with station finder',
      ],
    },
    'uta': {
      description: 'A universal fuel card for fleets and high-mileage drivers across 40+ countries.',
      discount: '',
      benefits: [
        'Over 74,000 acceptance points',
        'Tolls, car washes and parking included',
        'Digital receipts and fleet management',
        'Ideal for businesses and fleets',
      ],
    },
    'aral-komfort': {
      description: 'Germany\'s most popular fuel card — collect points and save.',
      discount: 'PAYBACK points on every fill-up',
      benefits: [
        'Usable at all 2,400+ Aral stations',
        'Collect PAYBACK points',
        'Contactless payment',
        'Free to apply',
      ],
    },
    'shell-card': {
      description: 'The Shell fuel card with a cashback programme and fleet management.',
      discount: 'Up to 1 Ct/L off',
      benefits: [
        '26,000+ Shell stations across Europe',
        'Up to 1 Ct/L off',
        'Online portal with analytics',
        'Individually adjustable card limits',
      ],
    },
    'enbw': {
      description: 'Germany\'s largest charging network — charge anywhere with a single card.',
      discount: '',
      benefits: [
        'Over 700,000 charge points across Europe',
        'Consistent pricing with no roaming surcharges',
        'AC from 39 Ct/kWh, DC from 49 Ct/kWh',
        'Auto-charge at EnBW stations',
      ],
    },
    'adac-echarge': {
      description: 'The ADAC charging card with preferential rates for ADAC members.',
      discount: 'Special rate for ADAC members',
      benefits: [
        'Special rates for ADAC members',
        'Over 600,000 charge points across Europe',
        'Transparent kWh billing',
        'No monthly base fee',
      ],
    },
    'maingau': {
      description: 'An affordable charging tariff with no base fee — pay-per-use.',
      discount: 'No base fee',
      benefits: [
        'No monthly base fee',
        'Low kWh rates',
        '400,000+ charge points across Europe',
        'App with real-time availability',
      ],
    },
    'adac': {
      description: 'Europe\'s largest motoring club — breakdown cover, insurance and more.',
      discount: 'From €59/year',
      benefits: [
        'Breakdown cover across Europe',
        'Discounts on fuel, travel and insurance',
        'TourSet and route planner',
        'Free vehicle inspection services',
      ],
    },
  },
  'en-US': {
    'dkv': {
      description: 'Europe\'s largest fuel card network — pay cashless at over 63,000 stations.',
      discount: '',
      benefits: [
        'Accepted at 63,000+ stations across Europe',
        'No annual fee for individual cards',
        'Monthly consolidated invoice with VAT breakdown',
        'App with built-in station finder',
      ],
    },
    'uta': {
      description: 'A universal fuel card for fleets and high-mileage drivers in 40+ countries.',
      discount: '',
      benefits: [
        'Over 74,000 acceptance points',
        'Tolls, car washes, and parking included',
        'Digital receipts and fleet management',
        'Ideal for businesses and fleets',
      ],
    },
    'aral-komfort': {
      description: 'Germany\'s most popular fuel card — earn points and save at the pump.',
      discount: 'Earn PAYBACK points every time you fuel up',
      benefits: [
        'Usable at all 2,400+ Aral stations',
        'Earn PAYBACK points',
        'Contactless payment',
        'Free to apply',
      ],
    },
    'shell-card': {
      description: 'The Shell fuel card with a cashback program and fleet management.',
      discount: 'Up to 1 Ct/L off',
      benefits: [
        '26,000+ Shell stations across Europe',
        'Up to 1 Ct/L discount',
        'Online portal with analytics',
        'Individually adjustable card limits',
      ],
    },
    'enbw': {
      description: 'Germany\'s largest charging network — charge anywhere with a single card.',
      discount: '',
      benefits: [
        'Over 700,000 charge points across Europe',
        'Flat pricing with no roaming surcharges',
        'AC from 39 Ct/kWh, DC from 49 Ct/kWh',
        'Auto-charge at EnBW stations',
      ],
    },
    'adac-echarge': {
      description: 'The ADAC charging card with preferred pricing for ADAC members.',
      discount: 'Special pricing for ADAC members',
      benefits: [
        'Special rates for ADAC members',
        'Over 600,000 charge points across Europe',
        'Transparent kWh-based billing',
        'No monthly base fee',
      ],
    },
    'maingau': {
      description: 'An affordable charging rate with no base fee — pay per use.',
      discount: 'No base fee',
      benefits: [
        'No monthly base fee',
        'Low kWh rates',
        '400,000+ charge points across Europe',
        'App with real-time availability',
      ],
    },
    'adac': {
      description: 'Europe\'s largest automobile club — roadside assistance, insurance, and more.',
      discount: 'From €59/year',
      benefits: [
        'Roadside assistance across Europe',
        'Discounts on fuel, travel, and insurance',
        'TourSet and route planner',
        'Free vehicle inspection services',
      ],
    },
  },
  'fr': {
    'dkv': {
      description: 'Le plus grand réseau de cartes carburant d\'Europe : faites le plein sans espèces dans plus de 63 000 stations.',
      discount: '',
      benefits: [
        'Acceptée dans plus de 63 000 stations partout en Europe',
        'Aucuns frais annuels pour les cartes individuelles',
        'Facture mensuelle groupée avec TVA détaillée',
        'Application avec localisateur de stations',
      ],
    },
    'uta': {
      description: 'La carte carburant universelle pour les flottes et les gros rouleurs, dans plus de 40 pays.',
      discount: '',
      benefits: [
        'Plus de 74 000 points d\'acceptation',
        'Péage, lavage et stationnement inclus',
        'Justificatifs numériques et gestion de parc',
        'Idéale pour les entreprises et les flottes',
      ],
    },
    'aral-komfort': {
      description: 'La carte carburant préférée des Allemands : cumulez des points et économisez.',
      discount: 'Points PAYBACK à chaque plein',
      benefits: [
        'Utilisable dans les 2 400 stations Aral et plus',
        'Cumul de points PAYBACK',
        'Paiement sans contact',
        'Demande gratuite',
      ],
    },
    'shell-card': {
      description: 'La carte carburant Shell avec programme de cashback et gestion de flotte.',
      discount: 'Jusqu\'à 1 Ct/L de remise',
      benefits: [
        'Plus de 26 000 stations Shell en Europe',
        'Jusqu\'à 1 Ct/L de remise',
        'Portail en ligne avec analyses détaillées',
        'Plafond de carte personnalisable',
      ],
    },
    'enbw': {
      description: 'Le plus grand réseau de recharge d\'Allemagne : rechargez partout avec une seule carte.',
      discount: '',
      benefits: [
        'Plus de 700 000 points de recharge en Europe',
        'Tarifs uniformes, sans surcoût d\'itinérance',
        'AC à partir de 39 Ct/kWh, DC à partir de 49 Ct/kWh',
        'Recharge automatique dans les stations EnBW',
      ],
    },
    'adac-echarge': {
      description: 'La carte de recharge ADAC, à tarif préférentiel pour les membres ADAC.',
      discount: 'Tarif préférentiel pour les membres ADAC',
      benefits: [
        'Tarifs spéciaux pour les membres ADAC',
        'Plus de 600 000 points de recharge en Europe',
        'Facturation transparente au kWh',
        'Aucun abonnement mensuel',
      ],
    },
    'maingau': {
      description: 'Un tarif de recharge avantageux sans abonnement : payez à l\'usage.',
      discount: 'Sans abonnement',
      benefits: [
        'Aucun abonnement mensuel',
        'Prix du kWh avantageux',
        'Plus de 400 000 points de recharge en Europe',
        'Application avec disponibilité en temps réel',
      ],
    },
    'adac': {
      description: 'Le plus grand automobile-club d\'Europe : assistance dépannage, assurance et bien plus.',
      discount: 'À partir de 59 €/an',
      benefits: [
        'Assistance dépannage dans toute l\'Europe',
        'Remises sur le carburant, les voyages et les assurances',
        'TourSet et planificateur d\'itinéraires',
        'Prestations de contrôle gratuites',
      ],
    },
  },
};
