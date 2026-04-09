/**
 * Country name normalizer.
 * Maps common aliases, abbreviations, and alternate spellings to a single
 * canonical country name. Applied on the backend before saving to DB so that
 * all data is consistent regardless of source (Gemini AI, Google Places API,
 * frontend address parsing, etc.).
 */

const COUNTRY_CANONICAL = {
    // ── Americas ──
    'usa': 'United States',
    'us': 'United States',
    'u.s.': 'United States',
    'u.s.a.': 'United States',
    'united states of america': 'United States',
    'america': 'United States',
    'the united states': 'United States',
    'the us': 'United States',
    'the usa': 'United States',

    // ── UK / British Isles ──
    'uk': 'United Kingdom',
    'u.k.': 'United Kingdom',
    'great britain': 'United Kingdom',
    'britain': 'United Kingdom',
    'england': 'United Kingdom',
    'scotland': 'United Kingdom',
    'wales': 'United Kingdom',
    'northern ireland': 'United Kingdom',

    // ── Europe ──
    'czech republic': 'Czechia',
    'the czech republic': 'Czechia',
    'holland': 'Netherlands',
    'the netherlands': 'Netherlands',
    'turkiye': 'Turkey',
    'türkiye': 'Turkey',
    'republic of turkey': 'Turkey',

    // ── Middle East ──
    'uae': 'United Arab Emirates',
    'u.a.e.': 'United Arab Emirates',
    'the uae': 'United Arab Emirates',

    // ── Asia ──
    'south korea': 'South Korea',
    'republic of korea': 'South Korea',
    'korea': 'South Korea',
    'north korea': 'North Korea',
    'dprk': 'North Korea',
    'burma': 'Myanmar',
    'viet nam': 'Vietnam',
    'the philippines': 'Philippines',

    // ── Africa ──
    'ivory coast': "Côte d'Ivoire",
    "cote d'ivoire": "Côte d'Ivoire",
    'tanzania': 'Tanzania',
    'united republic of tanzania': 'Tanzania',
    'democratic republic of the congo': 'DR Congo',
    'democratic republic of congo': 'DR Congo',
    'drc': 'DR Congo',
    'dr congo': 'DR Congo',
    'republic of the congo': 'Congo',
    'congo': 'Congo',
    'swaziland': 'Eswatini',

    // ── Microstates / Special ──
    'vatican': 'Vatican City',
    'vatican city state': 'Vatican City',
    'holy see': 'Vatican City',
    'palestine': 'Palestine',
    'state of palestine': 'Palestine',
    'taiwan': 'Taiwan',
    'republic of china': 'Taiwan',
    'hong kong': 'Hong Kong',
    'hong kong sar': 'Hong Kong',
    'macau': 'Macau',
    'macao': 'Macau',

    // ── Oceania ──
    'new zealand': 'New Zealand',
    'aotearoa': 'New Zealand',

    // ── South America ──
    'brasil': 'Brazil',
};

/**
 * Normalize a country name to its canonical form.
 * Returns the canonical name if a mapping exists, otherwise returns the
 * original name with only leading/trailing whitespace trimmed.
 *
 * @param {string} name - Raw country name from any source
 * @returns {string} Canonical country name
 */
export function normalizeCountryName(name) {
    if (!name || typeof name !== 'string') return 'Unknown';

    const trimmed = name.trim();
    if (!trimmed) return 'Unknown';

    // Lowercase + strip diacritics for lookup
    const key = trimmed
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    // Direct alias match
    if (COUNTRY_CANONICAL[key]) {
        return COUNTRY_CANONICAL[key];
    }

    // No alias found — return the trimmed original (preserves casing from Google Places API)
    return trimmed;
}
