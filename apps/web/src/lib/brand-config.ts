// ============================================================
// Brand Configuration — Colors, Gradients & Icons
// ============================================================

export interface BrandConfig {
  readonly color: string;         // Primary brand color
  readonly gradient: string;      // CSS gradient for badges
  readonly bgColor: string;       // Light tint for backgrounds
  readonly textColor: string;     // Text on brand background
  readonly initials: string;      // 1-3 letter abbreviation
  readonly icon?: string;         // Optional SVG path for inline icon
}

const BRAND_MAP: Record<string, BrandConfig> = {
  // ── Major Brands ──────────────────────────────────────────
  aral: {
    color: '#004B93',
    gradient: 'linear-gradient(135deg, #0062C4 0%, #003D7A 100%)',
    bgColor: '#E8F0FA',
    textColor: '#FFFFFF',
    initials: 'A',
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-1-3H7l3-9h2l3 9h-3l-1 3z',
  },
  shell: {
    color: '#FFB900',
    gradient: 'linear-gradient(135deg, #FFCC33 0%, #E5A300 100%)',
    bgColor: '#FFF8E1',
    textColor: '#1A1A1A',
    initials: 'S',
    icon: 'M12 2c-1.5 0-3 .5-4 1.5C6 5.5 5 8 5 10c0 3 2 5.5 4 7 1 .8 2 1.5 3 3 1-1.5 2-2.2 3-3 2-1.5 4-4 4-7 0-2-1-4.5-3-6.5C15 2.5 13.5 2 12 2z',
  },
  esso: {
    color: '#1D4289',
    gradient: 'linear-gradient(135deg, #2856A8 0%, #152F66 100%)',
    bgColor: '#E6EDF7',
    textColor: '#FFFFFF',
    initials: 'E',
  },
  total: {
    color: '#D32030',
    gradient: 'linear-gradient(135deg, #E8334A 0%, #B01828 100%)',
    bgColor: '#FCE8EA',
    textColor: '#FFFFFF',
    initials: 'T',
  },
  totalenergies: {
    color: '#D32030',
    gradient: 'linear-gradient(135deg, #E8334A 0%, #B01828 50%, #FF6B35 100%)',
    bgColor: '#FCE8EA',
    textColor: '#FFFFFF',
    initials: 'TE',
  },
  jet: {
    color: '#F5C518',
    gradient: 'linear-gradient(135deg, #FFD700 0%, #E5B300 100%)',
    bgColor: '#FFFDE6',
    textColor: '#1A1A1A',
    initials: 'JET',
  },
  star: {
    color: '#E2001A',
    gradient: 'linear-gradient(135deg, #FF1A33 0%, #C40016 100%)',
    bgColor: '#FDE7EA',
    textColor: '#FFFFFF',
    initials: '★',
  },
  agip: {
    color: '#006633',
    gradient: 'linear-gradient(135deg, #008844 0%, #004D26 100%)',
    bgColor: '#E6F2EC',
    textColor: '#FFFFFF',
    initials: 'AG',
  },
  eni: {
    color: '#FFD100',
    gradient: 'linear-gradient(135deg, #FFE033 0%, #E5BB00 100%)',
    bgColor: '#FFFDE6',
    textColor: '#1A1A1A',
    initials: 'eni',
  },
  omv: {
    color: '#003893',
    gradient: 'linear-gradient(135deg, #0050C8 0%, #002B70 100%)',
    bgColor: '#E6ECF6',
    textColor: '#FFFFFF',
    initials: 'OMV',
  },
  westfalen: {
    color: '#E30613',
    gradient: 'linear-gradient(135deg, #FF1F2E 0%, #C00510 100%)',
    bgColor: '#FDE7E8',
    textColor: '#FFFFFF',
    initials: 'W',
  },
  hem: {
    color: '#00529B',
    gradient: 'linear-gradient(135deg, #0068C4 0%, #003D74 100%)',
    bgColor: '#E6EEF6',
    textColor: '#FFFFFF',
    initials: 'HEM',
  },
  avia: {
    color: '#EE2D24',
    gradient: 'linear-gradient(135deg, #FF4038 0%, #CC241D 100%)',
    bgColor: '#FDE8E7',
    textColor: '#FFFFFF',
    initials: 'AV',
  },
  bft: {
    color: '#009640',
    gradient: 'linear-gradient(135deg, #00B84D 0%, #007A34 100%)',
    bgColor: '#E6F4EC',
    textColor: '#FFFFFF',
    initials: 'bft',
  },
  raiffeisen: {
    color: '#F39200',
    gradient: 'linear-gradient(135deg, #FFAA22 0%, #D47D00 100%)',
    bgColor: '#FEF3E1',
    textColor: '#FFFFFF',
    initials: 'R',
  },
  q1: {
    color: '#009FE3',
    gradient: 'linear-gradient(135deg, #22B4F5 0%, #0088CC 100%)',
    bgColor: '#E6F5FC',
    textColor: '#FFFFFF',
    initials: 'Q1',
  },
  globus: {
    color: '#003F72',
    gradient: 'linear-gradient(135deg, #005899 0%, #002E55 100%)',
    bgColor: '#E6ECF2',
    textColor: '#FFFFFF',
    initials: 'GL',
  },
  kaufland: {
    color: '#E10915',
    gradient: 'linear-gradient(135deg, #FF2230 0%, #C00710 100%)',
    bgColor: '#FDE7E8',
    textColor: '#FFFFFF',
    initials: 'K',
  },
  sb: {
    color: '#6B7280',
    gradient: 'linear-gradient(135deg, #8B95A5 0%, #555E6C 100%)',
    bgColor: '#F1F2F4',
    textColor: '#FFFFFF',
    initials: 'SB',
  },
  supermarkt: {
    color: '#6B7280',
    gradient: 'linear-gradient(135deg, #8B95A5 0%, #555E6C 100%)',
    bgColor: '#F1F2F4',
    textColor: '#FFFFFF',
    initials: 'SM',
  },

  // ── Additional brands ─────────────────────────────────────
  sprint: {
    color: '#FF6600',
    gradient: 'linear-gradient(135deg, #FF8833 0%, #DD5500 100%)',
    bgColor: '#FFF0E6',
    textColor: '#FFFFFF',
    initials: 'SP',
  },
  classic: {
    color: '#8B5CF6',
    gradient: 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)',
    bgColor: '#F0EBFE',
    textColor: '#FFFFFF',
    initials: 'CL',
  },
  oil: {
    color: '#2563EB',
    gradient: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
    bgColor: '#EBF0FE',
    textColor: '#FFFFFF',
    initials: 'OIL',
  },
  'oil!': {
    color: '#2563EB',
    gradient: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
    bgColor: '#EBF0FE',
    textColor: '#FFFFFF',
    initials: 'OIL',
  },
  orlen: {
    color: '#E30613',
    gradient: 'linear-gradient(135deg, #FF1F2E 0%, #C00510 100%)',
    bgColor: '#FDE7E8',
    textColor: '#FFFFFF',
    initials: 'OR',
  },
  roth: {
    color: '#0066B3',
    gradient: 'linear-gradient(135deg, #0080DD 0%, #005090 100%)',
    bgColor: '#E6F0F8',
    textColor: '#FFFFFF',
    initials: 'RO',
  },
  edeka: {
    color: '#1461A4',
    gradient: 'linear-gradient(135deg, #1A78CC 0%, #0F4E85 100%)',
    bgColor: '#E6EFF8',
    textColor: '#FFFFFF',
    initials: 'ED',
  },
  markant: {
    color: '#005CA9',
    gradient: 'linear-gradient(135deg, #0074D4 0%, #004880 100%)',
    bgColor: '#E6EFF8',
    textColor: '#FFFFFF',
    initials: 'MK',
  },
  calpam: {
    color: '#009CDE',
    gradient: 'linear-gradient(135deg, #22B4F5 0%, #0084BB 100%)',
    bgColor: '#E6F5FC',
    textColor: '#FFFFFF',
    initials: 'CA',
  },
  go: {
    color: '#FF5722',
    gradient: 'linear-gradient(135deg, #FF7043 0%, #E64A19 100%)',
    bgColor: '#FFF0EB',
    textColor: '#FFFFFF',
    initials: 'GO',
  },
  hoyer: {
    color: '#E30613',
    gradient: 'linear-gradient(135deg, #FF1F2E 0%, #C00510 100%)',
    bgColor: '#FDE7E8',
    textColor: '#FFFFFF',
    initials: 'HO',
  },
  score: {
    color: '#D32030',
    gradient: 'linear-gradient(135deg, #E8334A 0%, #B01828 100%)',
    bgColor: '#FCE8EA',
    textColor: '#FFFFFF',
    initials: 'SC',
  },
};

const DEFAULT_BRAND: BrandConfig = {
  color: '#64748B',
  gradient: 'linear-gradient(135deg, #8B95A5 0%, #555E6C 100%)',
  bgColor: '#F1F5F9',
  textColor: '#FFFFFF',
  initials: '⛽',
};

/**
 * Get brand config for a station brand string.
 * Matches case-insensitively and handles partial matches.
 */
export function getBrandConfig(brand: string): BrandConfig {
  if (!brand) return DEFAULT_BRAND;

  const lower = brand.toLowerCase().trim();

  // Direct match
  if (BRAND_MAP[lower]) return BRAND_MAP[lower]!;

  // Partial match (e.g. "ARAL AG" → "aral", "Shell Deutschland" → "shell")
  for (const [key, config] of Object.entries(BRAND_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return config;
  }

  // Generate dynamic config from brand name
  const initials = brand.length <= 3
    ? brand.toUpperCase()
    : brand.substring(0, 2).toUpperCase();

  // Deterministic color from brand name
  let hash = 0;
  for (let i = 0; i < brand.length; i++) {
    hash = brand.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  const color = `hsl(${hue}, 55%, 45%)`;

  return {
    color,
    gradient: `linear-gradient(135deg, hsl(${hue}, 55%, 55%) 0%, hsl(${hue}, 55%, 35%) 100%)`,
    bgColor: `hsl(${hue}, 55%, 95%)`,
    textColor: '#FFFFFF',
    initials,
  };
}
