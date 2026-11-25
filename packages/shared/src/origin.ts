/**
 * Countries of origin are stored as full English names ("Germany", not "DE"), so a list shows
 * the same name whichever file or person entered it.
 */

/** Common codes that aren't ISO 3166 alpha-2, and the alpha-3 codes of brewing countries. */
const ALIASES: Record<string, string> = {
  UK: 'GB',
  EN: 'GB',
  ENG: 'GB',
  GBR: 'GB',
  USA: 'US',
  GER: 'DE',
  DEU: 'DE',
  BEL: 'BE',
  CZE: 'CZ',
  FRA: 'FR',
  NLD: 'NL',
  AUT: 'AT',
  POL: 'PL',
  SVN: 'SI',
  SLO: 'SI',
  NZL: 'NZ',
  AUS: 'AU',
  CAN: 'CA',
  IRL: 'IE',
  DNK: 'DK',
  DEN: 'DK',
  SWE: 'SE',
  FIN: 'FI',
  NOR: 'NO',
  JPN: 'JP',
  ZAF: 'ZA',
  ARG: 'AR',
  CHN: 'CN',
  ESP: 'ES',
  ITA: 'IT',
  CHE: 'CH',
  SUI: 'CH',
  UKR: 'UA',
  HUN: 'HU',
  SVK: 'SK',
};

/** A few spellings files use for the same country. */
const NAMES: Record<string, string> = {
  'united states of america': 'United States',
  usa: 'United States',
  'u.s.a.': 'United States',
  'u.s.': 'United States',
  america: 'United States',
  england: 'United Kingdom',
  'great britain': 'United Kingdom',
  britain: 'United Kingdom',
  scotland: 'United Kingdom',
  'czech republic': 'Czechia',
  holland: 'Netherlands',
  'the netherlands': 'Netherlands',
  deutschland: 'Germany',
  belgique: 'Belgium',
};

let regionNames: Intl.DisplayNames | null | undefined;
function regionName(code: string): string | null {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) ?? null;
  } catch {
    return null;
  }
}

/** "DE" → "Germany", "usa" → "United States", "UK" → "United Kingdom"; anything else is kept (trimmed). */
export function normalizeOrigin(value: string): string {
  const s = value.trim().replace(/\s+/g, ' ');
  if (!s) return '';
  const named = NAMES[s.toLowerCase()];
  if (named) return named;
  if (/^[a-z]{2,3}$/i.test(s)) {
    const upper = s.toUpperCase();
    const code = ALIASES[upper] ?? (upper.length === 2 ? upper : null);
    const name = code ? regionName(code) : null;
    if (name) return name;
  }
  return s;
}

/** Offered in origin fields next to the countries already in the library. */
export const COMMON_ORIGINS = [
  'Argentina',
  'Australia',
  'Austria',
  'Belgium',
  'Canada',
  'Czechia',
  'Denmark',
  'Finland',
  'France',
  'Germany',
  'Ireland',
  'Japan',
  'Netherlands',
  'New Zealand',
  'Norway',
  'Poland',
  'Slovenia',
  'South Africa',
  'Sweden',
  'United Kingdom',
  'United States',
] as const;
