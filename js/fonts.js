import { parse } from '../vendor/opentype.module.js';
import { FONT_FILES } from './font-files.js';
// ============================================================================
// Bjørnsveen LaserStudio – Laser Font, Rich Typography & Text-on-Path Engine
// Includes:
// 1. 30+ Categorized Fonts (Laser Stencil, Single-Line Score, Sans, Serif, Script, Gaming/Theme)
// 2. Local TTF outlines via OpenType.js, independent of installed fonts
// 3. Text-on-Path Engine: Follow ANY shape outline (Circle, Heart, Sign, Curved Line) or Arc/Ring
// ============================================================================

import {
  uid,
  roundMm,
  clamp,
  computePolygonsBBox,
  polygonsToSvgPath,
  parseSvgPathToPolygons,
  booleanMultiPolygons
} from './geometry.js';

// Single-stroke glyph definitions in a [0..1] x [0..1] grid (y=0 top, y=1 bottom)
const SINGLE_LINE_GLYPHS = {
  'A': [[[0, 1], [0.5, 0], [1, 1]], [[0.2, 0.65], [0.8, 0.65]]],
  'B': [[[0, 1], [0, 0], [0.7, 0], [0.95, 0.15], [0.95, 0.35], [0.7, 0.5], [0, 0.5]], [[0.7, 0.5], [1, 0.65], [1, 0.85], [0.75, 1], [0, 1]]],
  'C': [[[1, 0.2], [0.75, 0], [0.25, 0], [0, 0.25], [0, 0.75], [0.25, 1], [0.75, 1], [1, 0.8]]],
  'D': [[[0, 1], [0, 0], [0.65, 0], [1, 0.25], [1, 0.75], [0.65, 1], [0, 1]]],
  'E': [[[1, 0], [0, 0], [0, 1], [1, 1]], [[0, 0.5], [0.75, 0.5]]],
  'F': [[[1, 0], [0, 0], [0, 1]], [[0, 0.5], [0.75, 0.5]]],
  'G': [[[1, 0.2], [0.75, 0], [0.25, 0], [0, 0.25], [0, 0.75], [0.25, 1], [0.8, 1], [1, 0.75], [1, 0.5], [0.55, 0.5]]],
  'H': [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.5], [1, 0.5]]],
  'I': [[[0.2, 0], [0.8, 0]], [[0.5, 0], [0.5, 1]], [[0.2, 1], [0.8, 1]]],
  'J': [[[0.2, 0], [0.9, 0]], [[0.65, 0], [0.65, 0.8], [0.4, 1], [0.15, 1], [0, 0.8]]],
  'K': [[[0, 0], [0, 1]], [[1, 0], [0, 0.55]], [[0.3, 0.38], [1, 1]]],
  'L': [[[0, 0], [0, 1], [1, 1]]],
  'M': [[[0, 1], [0, 0], [0.5, 0.55], [1, 0], [1, 1]]],
  'N': [[[0, 1], [0, 0], [1, 1], [1, 0]]],
  'O': [[[0.25, 0], [0.75, 0], [1, 0.25], [1, 0.75], [0.75, 1], [0.25, 1], [0, 0.75], [0, 0.25], [0.25, 0]]],
  'P': [[[0, 1], [0, 0], [0.75, 0], [1, 0.15], [1, 0.38], [0.75, 0.52], [0, 0.52]]],
  'Q': [[[0.25, 0], [0.75, 0], [1, 0.25], [1, 0.75], [0.75, 1], [0.25, 1], [0, 0.75], [0, 0.25], [0.25, 0]], [[0.55, 0.65], [1.05, 1.05]]],
  'R': [[[0, 1], [0, 0], [0.75, 0], [1, 0.15], [1, 0.38], [0.75, 0.52], [0, 0.52]], [[0.55, 0.52], [1, 1]]],
  'S': [[[0.95, 0.18], [0.75, 0], [0.25, 0], [0, 0.18], [0, 0.38], [0.25, 0.5], [0.75, 0.5], [1, 0.65], [1, 0.85], [0.75, 1], [0.25, 1], [0, 0.82]]],
  'T': [[[0, 0], [1, 0]], [[0.5, 0], [0.5, 1]]],
  'U': [[[0, 0], [0, 0.75], [0.25, 1], [0.75, 1], [1, 0.75], [1, 0]]],
  'V': [[[0, 0], [0.5, 1], [1, 0]]],
  'W': [[[0, 0], [0.25, 1], [0.5, 0.45], [0.75, 1], [1, 0]]],
  'X': [[[0, 0], [1, 1]], [[1, 0], [0, 1]]],
  'Y': [[[0, 0], [0.5, 0.5], [1, 0]], [[0.5, 0.5], [0.5, 1]]],
  'Z': [[[0, 0], [1, 0], [0, 1], [1, 1]]],
  'Æ': [[[0, 1], [0.45, 0], [0.45, 1]], [[0.45, 0], [1, 0]], [[0.2, 0.55], [0.85, 0.55]], [[0.45, 1], [1, 1]]],
  'Ø': [[[0.25, 0], [0.75, 0], [1, 0.25], [1, 0.75], [0.75, 1], [0.25, 1], [0, 0.75], [0, 0.25], [0.25, 0]], [[0, 1], [1, 0]]],
  'Å': [[[0, 1], [0.5, 0.18], [1, 1]], [[0.22, 0.7], [0.78, 0.7]], [[0.5, -0.15], [0.65, -0.02], [0.5, 0.12], [0.35, -0.02], [0.5, -0.15]]],
  '0': [[[0.25, 0], [0.75, 0], [1, 0.25], [1, 0.75], [0.75, 1], [0.25, 1], [0, 0.75], [0, 0.25], [0.25, 0]]],
  '1': [[[0.2, 0.2], [0.5, 0], [0.5, 1]], [[0.2, 1], [0.8, 1]]],
  '2': [[[0, 0.25], [0.25, 0], [0.75, 0], [1, 0.25], [1, 0.45], [0, 1], [1, 1]]],
  '3': [[[0, 0.15], [0.25, 0], [0.75, 0], [1, 0.2], [1, 0.38], [0.7, 0.5], [0.35, 0.5]], [[0.7, 0.5], [1, 0.65], [1, 0.85], [0.75, 1], [0.25, 1], [0, 0.85]]],
  '4': [[[0.75, 1], [0.75, 0], [0, 0.68], [1, 0.68]]],
  '5': [[[1, 0], [0, 0], [0, 0.45], [0.75, 0.45], [1, 0.62], [1, 0.85], [0.75, 1], [0.2, 1], [0, 0.85]]],
  '6': [[[0.9, 0.15], [0.7, 0], [0.25, 0], [0, 0.25], [0, 0.8], [0.25, 1], [0.75, 1], [1, 0.8], [1, 0.6], [0.75, 0.45], [0, 0.45]]],
  '7': [[[0, 0], [1, 0], [0.35, 1]]],
  '8': [[[0.25, 0], [0.75, 0], [0.95, 0.18], [0.95, 0.35], [0.75, 0.5], [0.25, 0.5], [0.05, 0.35], [0.05, 0.18], [0.25, 0]], [[0.25, 0.5], [0, 0.65], [0, 0.85], [0.25, 1], [0.75, 1], [1, 0.85], [1, 0.65], [0.75, 0.5]]],
  '9': [[[1, 0.5], [0.25, 0.5], [0, 0.35], [0, 0.15], [0.25, 0], [0.75, 0], [1, 0.2], [1, 0.75], [0.75, 1], [0.25, 1]]],
  '-': [[[0.15, 0.5], [0.85, 0.5]]],
  '+': [[[0.5, 0.2], [0.5, 0.8]], [[0.15, 0.5], [0.85, 0.5]]],
  '!': [[[0.5, 0], [0.5, 0.72]], [[0.5, 0.92], [0.5, 1]]],
  '?': [[[0.1, 0.2], [0.3, 0], [0.75, 0], [0.95, 0.2], [0.95, 0.38], [0.5, 0.58], [0.5, 0.72]], [[0.5, 0.92], [0.5, 1]]],
  '.': [[[0.45, 0.9], [0.55, 0.9], [0.55, 1], [0.45, 1], [0.45, 0.9]]],
  ',': [[[0.55, 0.88], [0.4, 1.1]]],
  ':': [[[0.45, 0.25], [0.55, 0.25]], [[0.45, 0.85], [0.55, 0.85]]],
  '/': [[[0.1, 1], [0.9, 0]]],
  '(': [[[0.7, 0], [0.35, 0.3], [0.35, 0.7], [0.7, 1]]],
  ')': [[[0.3, 0], [0.65, 0.3], [0.65, 0.7], [0.3, 1]]],
  '&': [[[0.95, 1], [0.15, 0.35], [0.15, 0.12], [0.38, 0], [0.62, 0], [0.78, 0.15], [0.78, 0.32], [0.05, 0.68], [0.05, 0.88], [0.28, 1], [0.68, 1], [0.95, 0.65]]]
};

export const FONT_CATALOG = [
  // 1. Laser-Spesial (Sjablong & Enkelstreg)
  {
    key: 'stencil',
    category: '⚡ Laser-spesial (Sjablong & Hurtig-score)',
    label: '✂️ Laser Sjablong – Kraftig (Faller ikke ut ved kutt!)',
    family: '"Black Ops One", Impact, "Arial Black", sans-serif',
    weight: '900',
    stencil: true
  },
  {
    key: 'stencil-serif',
    category: '⚡ Laser-spesial (Sjablong & Hurtig-score)',
    label: '✂️ Laser Sjablong – Militær / Klassisk',
    family: '"Stardos Stencil", Rockwell, Georgia, serif',
    weight: '900',
    stencil: true
  },
  {
    key: 'stencil-round',
    category: '⚡ Laser-spesial (Sjablong & Hurtig-score)',
    label: '✂️ Laser Sjablong – Avrundet',
    family: '"Fredoka", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif',
    weight: '800',
    stencil: true
  },
  {
    key: 'singleline',
    category: '⚡ Laser-spesial (Sjablong & Hurtig-score)',
    label: '⚡ Laser Enkelstreg (10x raskere Score-linje!)',
    family: 'monospace',
    weight: '400',
    singleLine: true
  },

  // 2. Moderne & Skilt (Sans-Serif)
  {
    key: 'sans-bold',
    category: '🪧 Moderne & Skilt (Sans-Serif)',
    label: 'Moderne Kraftig (Montserrat / Arial Black)',
    family: '"Montserrat", "Arial Black", "Helvetica Neue", sans-serif',
    weight: '900'
  },
  {
    key: 'impact',
    category: '🪧 Moderne & Skilt (Sans-Serif)',
    label: 'Plakat & Overskrift (Anton / Impact)',
    family: '"Anton", Impact, "Arial Narrow", sans-serif',
    weight: '900'
  },
  {
    key: 'bebas',
    category: '🪧 Moderne & Skilt (Sans-Serif)',
    label: 'Høy & Smal Skiltfont (Bebas Neue / Oswald)',
    family: '"Bebas Neue", "Oswald", Impact, sans-serif',
    weight: '800'
  },
  {
    key: 'futura',
    category: '🪧 Moderne & Skilt (Sans-Serif)',
    label: 'Geometrisk Design (Montserrat, lokal)',
    family: 'Futura, "Century Gothic", "Montserrat", sans-serif',
    weight: '800'
  },
  {
    key: 'avenir',
    category: '🪧 Moderne & Skilt (Sans-Serif)',
    label: 'Nordisk Ren (Montserrat, lokal)',
    family: '"Avenir Next", Avenir, "Helvetica Neue", sans-serif',
    weight: '800'
  },
  {
    key: 'rounded',
    category: '🪧 Moderne & Skilt (Sans-Serif)',
    label: 'Myk & Avrundet (Fredoka / Arial Rounded)',
    family: '"Fredoka", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif',
    weight: '700'
  },
  {
    key: 'righteous',
    category: '🪧 Moderne & Skilt (Sans-Serif)',
    label: 'Moderne Dekor / Funky (Righteous / Bauhaus)',
    family: '"Righteous", Futura, "Arial Rounded MT Bold", sans-serif',
    weight: '700'
  },
  {
    key: 'gill',
    category: '🪧 Moderne & Skilt (Sans-Serif)',
    label: 'Klassisk Skilt (Montserrat, lokal)',
    family: '"Gill Sans", "Trebuchet MS", sans-serif',
    weight: '700'
  },
  {
    key: 'optima',
    category: '🪧 Moderne & Skilt (Sans-Serif)',
    label: 'Slank & Elegant (Cinzel, lokal)',
    family: 'Optima, Candara, "Segoe UI", sans-serif',
    weight: '700'
  },
  {
    key: 'verdana',
    category: '🪧 Moderne & Skilt (Sans-Serif)',
    label: 'Bred & Ekstra Tydelig (Montserrat, lokal)',
    family: 'Verdana, Tahoma, Geneva, sans-serif',
    weight: '800'
  },

  // 3. Klassisk, Tradisjon & Hytteskilt (Serif & Slab)
  {
    key: 'serif',
    category: '🏛️ Klassisk, Hytteskilt & Tradisjon (Serif)',
    label: 'Klassisk Dørskilt (Playfair Display, lokal)',
    family: 'Georgia, "Times New Roman", serif',
    weight: '800'
  },
  {
    key: 'cinzel',
    category: '🏛️ Klassisk, Hytteskilt & Tradisjon (Serif)',
    label: 'Romersk / Herskapelig (Cinzel / Trajan)',
    family: '"Cinzel", "Trajan Pro", Copperplate, Georgia, serif',
    weight: '800'
  },
  {
    key: 'copperplate',
    category: '🏛️ Klassisk, Hytteskilt & Tradisjon (Serif)',
    label: 'Støpt Metallskilt (Cinzel, lokal)',
    family: 'Copperplate, "Cinzel", Georgia, serif',
    weight: '800'
  },
  {
    key: 'playfair',
    category: '🏛️ Klassisk, Hytteskilt & Tradisjon (Serif)',
    label: 'Kontrast & Luksus (Playfair / Didot / Bodoni)',
    family: '"Playfair Display", "Abril Fatface", Didot, "Bodoni MT", serif',
    weight: '800'
  },
  {
    key: 'abril',
    category: '🏛️ Klassisk, Hytteskilt & Tradisjon (Serif)',
    label: 'Kraftig Fest-Serif (Abril Fatface / Ultra)',
    family: '"Abril Fatface", "Playfair Display", Georgia, serif',
    weight: '900'
  },
  {
    key: 'baskerville',
    category: '🏛️ Klassisk, Hytteskilt & Tradisjon (Serif)',
    label: 'Tradisjonell Boktrykk (Playfair Display, lokal)',
    family: 'Baskerville, Palatino, "Palatino Linotype", serif',
    weight: '700'
  },
  {
    key: 'rockwell',
    category: '🏛️ Klassisk, Hytteskilt & Tradisjon (Serif)',
    label: 'Kraftig Verksted / Slab (Alfa Slab / Rockwell)',
    family: '"Alfa Slab One", Rockwell, "Courier New", serif',
    weight: '900'
  },
  {
    key: 'western',
    category: '🏛️ Klassisk, Hytteskilt & Tradisjon (Serif)',
    label: 'Western / Saloon / Villmark (Rye / Playbill)',
    family: '"Rye", Playbill, Rockwell, Copperplate, serif',
    weight: '700'
  },

  // 4. Kursiv, Håndskrift & Kalligrafi (Script)
  {
    key: 'script',
    category: '✍️ Kursiv, Håndskrift & Kalligrafi',
    label: 'Elegant Kalligrafi (Great Vibes / Snell Roundhand)',
    family: '"Great Vibes", "Snell Roundhand", "Zapfino", cursive',
    weight: '700'
  },
  {
    key: 'pacifico',
    category: '✍️ Kursiv, Håndskrift & Kalligrafi',
    label: 'Tykke Penselstrøk – God til utskjæring! (Pacifico / SignPainter)',
    family: '"Pacifico", "SignPainter", "Brush Script MT", cursive',
    weight: '700'
  },
  {
    key: 'lobster',
    category: '✍️ Kursiv, Håndskrift & Kalligrafi',
    label: 'Retro Kafé-Script (Lobster / Brush Script)',
    family: '"Lobster", "SignPainter", "Brush Script MT", cursive',
    weight: '700'
  },
  {
    key: 'dancing',
    category: '✍️ Kursiv, Håndskrift & Kalligrafi',
    label: 'Levende Kursiv (Dancing Script / Satisfy)',
    family: '"Dancing Script", "Satisfy", "Apple Chancery", cursive',
    weight: '700'
  },
  {
    key: 'chancery',
    category: '✍️ Kursiv, Håndskrift & Kalligrafi',
    label: 'Eventyr & Snirkler (Great Vibes, lokal)',
    family: '"Apple Chancery", "URW Chancery L", Georgia, cursive',
    weight: '700 italic'
  },
  {
    key: 'caveat',
    category: '✍️ Kursiv, Håndskrift & Kalligrafi',
    label: 'Naturlig Håndskrift (Caveat / Bradley Hand)',
    family: '"Caveat", "Bradley Hand", "Comic Sans MS", cursive',
    weight: '700'
  },
  {
    key: 'marker',
    category: '✍️ Kursiv, Håndskrift & Kalligrafi',
    label: 'Sprittusj / Street Art (Permanent Marker / Marker Felt)',
    family: '"Permanent Marker", "Marker Felt", "Chalkboard SE", cursive',
    weight: '700'
  },
  {
    key: 'chalk',
    category: '✍️ Kursiv, Håndskrift & Kalligrafi',
    label: 'Tavlekritt / Barnerom (Fredoka, lokal)',
    family: '"Chalkboard SE", "Comic Sans MS", "Fredoka", cursive',
    weight: '700'
  },
  {
    key: 'amatic',
    category: '✍️ Kursiv, Håndskrift & Kalligrafi',
    label: 'Håndtegnet Smal (Amatic SC / Herculanum)',
    family: '"Amatic SC", Herculanum, "Marker Felt", sans-serif',
    weight: '700'
  },

  // 5. Gaming, Sci-Fi, Viking & Tema
  {
    key: 'orbitron',
    category: '🎮 Gaming, Sci-Fi, Viking & Tema',
    label: 'Sci-Fi / Cyber / Robot (Orbitron / Eurostile)',
    family: '"Orbitron", Eurostile, "Bank Gothic", Futura, sans-serif',
    weight: '900'
  },
  {
    key: 'bangers',
    category: '🎮 Gaming, Sci-Fi, Viking & Tema',
    label: 'Tegneserie / Action / Gamer (Bangers / Impact)',
    family: '"Bangers", Impact, "Arial Black", cursive',
    weight: '700'
  },
  {
    key: 'pixel',
    category: '🎮 Gaming, Sci-Fi, Viking & Tema',
    label: 'Retro Arcade / Minecraft-stil (Press Start 2P)',
    family: '"Press Start 2P", "Courier New", Menlo, monospace',
    weight: '700'
  },
  {
    key: 'medieval',
    category: '🎮 Gaming, Sci-Fi, Viking & Tema',
    label: 'Viking / Middelalder / Rollespill (Cinzel, lokal)',
    family: 'Luminari, Trattatello, Herculanum, "Cinzel", fantasy',
    weight: '700'
  },
  {
    key: 'typewriter',
    category: '🎮 Gaming, Sci-Fi, Viking & Tema',
    label: 'Skrivemaskin / Detektiv (Special Elite / American Typewriter)',
    family: '"Special Elite", "American Typewriter", "Courier New", monospace',
    weight: '700'
  },
  {
    key: 'mono',
    category: '🎮 Gaming, Sci-Fi, Viking & Tema',
    label: 'Teknisk Maskinskrift (Special Elite, lokal)',
    family: '"Courier New", Menlo, Monaco, monospace',
    weight: '800'
  }
];

FONT_CATALOG.push(...[
  {
    "key": "sairastencilone",
    "category": "🆕 Flere skrifttyper",
    "label": "Saira Stencil One",
    "family": "\"Saira Stencil One\"",
    "weight": "400"
  },
  {
    "key": "cormorantgaramond",
    "category": "🆕 Flere skrifttyper",
    "label": "Cormorant Garamond",
    "family": "\"Cormorant Garamond\"",
    "weight": "400"
  },
  {
    "key": "ebgaramond",
    "category": "🆕 Flere skrifttyper",
    "label": "EB Garamond",
    "family": "\"EB Garamond\"",
    "weight": "400"
  },
  {
    "key": "inconsolata",
    "category": "🆕 Flere skrifttyper",
    "label": "Inconsolata",
    "family": "\"Inconsolata\"",
    "weight": "400"
  },
  {
    "key": "josefinsans",
    "category": "🆕 Flere skrifttyper",
    "label": "Josefin Sans",
    "family": "\"Josefin Sans\"",
    "weight": "400"
  },
  {
    "key": "lato",
    "category": "🆕 Flere skrifttyper",
    "label": "Lato",
    "family": "\"Lato\"",
    "weight": "400"
  },
  {
    "key": "merriweather",
    "category": "🆕 Flere skrifttyper",
    "label": "Merriweather",
    "family": "\"Merriweather\"",
    "weight": "400"
  },
  {
    "key": "nunito",
    "category": "🆕 Flere skrifttyper",
    "label": "Nunito",
    "family": "\"Nunito\"",
    "weight": "400"
  },
  {
    "key": "raleway",
    "category": "🆕 Flere skrifttyper",
    "label": "Raleway",
    "family": "\"Raleway\"",
    "weight": "400"
  },
  {
    "key": "robotoslab",
    "category": "🆕 Flere skrifttyper",
    "label": "Roboto Slab",
    "family": "\"Roboto Slab\"",
    "weight": "400"
  },
  {
    "key": "sacramento",
    "category": "🆕 Flere skrifttyper",
    "label": "Sacramento",
    "family": "\"Sacramento\"",
    "weight": "400"
  },
  {
    "key": "unifrakturmaguntia",
    "category": "🆕 Flere skrifttyper",
    "label": "UnifrakturMaguntia",
    "family": "\"UnifrakturMaguntia\"",
    "weight": "400"
  }
]);

const FONT_MAP = Object.fromEntries(FONT_CATALOG.map(f => [f.key, f]));

/**
 * Generates HTML `<optgroup>` and `<option>` markup for font `<select>` dropdowns.
 */
export function getFontOptionsHtml(selectedKey = 'sans-bold', query = '') {
  const groups = new Map();
  for (const item of FONT_CATALOG) {
    if (query && item.key !== selectedKey && !`${item.label} ${item.category}`.toLocaleLowerCase('nb').includes(query.toLocaleLowerCase('nb'))) continue;
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  let html = '';
  for (const [cat, items] of groups.entries()) {
    html += `<optgroup label="${cat}">`;
    for (const item of items) {
      const sel = item.key === selectedKey ? ' selected' : '';
      html += `<option value="${item.key}"${sel}>${item.label}</option>`;
    }
    html += `</optgroup>`;
  }
  return html;
}

/**
 * Generates polygon loops in millimeter coordinates for a text object.
 */
export function generateTextPolygons({
  text = 'BJØRNSVEEN',
  fontKey = 'sans-bold',
  fontSizeMm = 18,
  spacingMm = 1.2,
  writingDirection = 'horizontal',
  curve = 0,
  customPath = null,
  customPathClosed = false,
  pathOffsetPct = 0,
  pathNormalOffsetMm = 0,
  pathFlip = false
} = {}) {
  const cleanText = String(text ?? '').trim().normalize('NFC');
  if (!cleanText) return [];
  const capHeight = clamp(Number(fontSizeMm) || 18, 2, 400);
  const letterGap = Number(spacingMm) || 0;
  const curveVal = Number(curve) || 0;

  const fontDef = FONT_MAP[fontKey] || FONT_MAP['sans-bold'];

  const direction = normalizeTextDirection(writingDirection, curve, customPath);

  // 1. Build flat high-precision loops first
  let rawLoops;
  if (fontDef && fontDef.singleLine) {
    rawLoops = buildSingleLinePolygons(cleanText, capHeight, letterGap, direction);
  } else {
    rawLoops = outlineTextToPolygons(cleanText, fontKey, capHeight, letterGap, direction);
  }
  if (!rawLoops || rawLoops.length === 0) return [];

  // 2. If bound to a custom shape outline / path (e.g., Circle, Heart, Sign, Curved Line)
  if (Array.isArray(customPath) && customPath.length >= 2) {
    return warpLoopsAlongCustomPath(rawLoops, customPath, {
      closed: Boolean(customPathClosed ?? customPath.closed),
      offsetPct: Number(pathOffsetPct) || 0,
      normalOffsetMm: Number(pathNormalOffsetMm) || 0,
      flip: Boolean(pathFlip)
    });
  }

  // 3. Otherwise, if curved via the built-in Arc / Circle slider (-180..+180)
  if (Math.abs(curveVal) > 0.5) {
    return warpLoopsAlongArc(rawLoops, curveVal);
  }

  return orientTextLoops(rawLoops, direction);
}

function buildSingleLinePolygons(text, heightMm, spacingMm, direction = 'horizontal') {
  if (direction.startsWith('stacked-')) {
    const entries = Array.from(text).map(ch => buildSingleLinePolygons(ch, heightMm, 0));
    return stackGlyphs(entries, heightMm, spacingMm, direction === 'stacked-up');
  }
  const upper = text.toUpperCase();
  const charW = heightMm * 0.66;
  const stepX = charW + spacingMm;
  const loops = [];
  let cursorX = 0;

  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i];
    if (ch === ' ') {
      cursorX += charW * 0.65 + spacingMm;
      continue;
    }
    const strokes = SINGLE_LINE_GLYPHS[ch] || SINGLE_LINE_GLYPHS['O'];
    for (const stroke of strokes) {
      // Subdivide segments so single-line characters bend smoothly along curves/circles
      const pts = [];
      for (let s = 0; s < stroke.length; s++) {
        const [nx, ny] = stroke[s];
        const p = { x: cursorX + nx * charW, y: ny * heightMm };
        if (s > 0) {
          const prev = pts[pts.length - 1];
          const segLen = Math.hypot(p.x - prev.x, p.y - prev.y);
          const steps = Math.max(1, Math.ceil(segLen / (heightMm * 0.08)));
          for (let k = 1; k < steps; k++) {
            const t = k / steps;
            pts.push({
              x: prev.x + (p.x - prev.x) * t,
              y: prev.y + (p.y - prev.y) * t
            });
          }
        }
        pts.push(p);
      }
      pts.closed = false;
      pts.glyphIndex = i;
      loops.push(pts);
    }
    cursorX += stepX;
  }
  return loops;
}

/**
 * Smooths a 2D scalar field with `passes` iterations of a 3x3 separable [1, 2, 1]/4 tent filter.
 * Eliminates pixel-grid staircasing on curves and diagonals before Marching Squares contouring!
 */
const loadedFonts = new Map();
export function registerFontFile(file, bytes) { loadedFonts.set(file, parse(bytes)); }
export async function initializeFonts() {
  await Promise.all([...new Set(Object.values(FONT_FILES))].map(async file => {
    if (loadedFonts.has(file)) return;
    const response = await fetch(new URL(`../fonts/${file}`, import.meta.url));
    if (!response.ok) throw new Error(`Kunne ikke laste lokal font: ${file}`);
    registerFontFile(file, await response.arrayBuffer());
  }));
}

export const TEXT_DIRECTIONS = ['horizontal', 'down', 'up', 'stacked-down', 'stacked-up'];
function normalizeTextDirection(direction, curve, customPath) {
  return Math.abs(Number(curve) || 0) > 0.5 || customPath?.length >= 2 || !TEXT_DIRECTIONS.includes(direction) ? 'horizontal' : direction;
}
function mapGlyphLoop(loop, transform) {
  const result = loop.map(transform);
  result.closed = loop.closed !== false;
  result.glyphIndex = loop.glyphIndex;
  return result;
}
function orientTextLoops(loops, direction) {
  if (direction === 'down') return loops.map(loop => mapGlyphLoop(loop, p => ({x:-p.y,y:p.x})));
  if (direction === 'up') return loops.map(loop => mapGlyphLoop(loop, p => ({x:p.y,y:-p.x})));
  return loops;
}
function stackGlyphs(entries, heightMm, spacingMm, upward) {
  const all = entries.flat();
  if (!all.length) return [];
  const bbox = computePolygonsBBox(all), factor = heightMm / Math.max(.1, bbox.height);
  const boxes = entries.map(loops => computePolygonsBBox(loops));
  const width = Math.max(...boxes.map(box => box.width)) * factor;
  return entries.flatMap((loops, index) => loops.map(loop => {
    const box = boxes[index];
    const result = mapGlyphLoop(loop, p => ({
      x: (width - box.width * factor) / 2 + (p.x - box.x) * factor,
      y: (upward ? -index : index) * (heightMm + spacingMm) + (heightMm - box.height * factor) / 2 + (p.y - box.y) * factor
    }));
    result.glyphIndex = index;
    return result;
  }));
}
function outlineTextToPolygons(text, fontKey, heightMm, spacingMm, direction = 'horizontal') {
  const file = FONT_FILES[fontKey] || FONT_FILES['sans-bold'];
  const font = loadedFonts.get(file);
  if (!font) throw new Error('Fontene er ikke klare. Last siden på nytt.');
  const def = FONT_MAP[fontKey] || FONT_MAP['sans-bold'];
  const cap = font.charToGlyph('H').getBoundingBox();
  const emSize = heightMm * font.unitsPerEm / Math.max(1, cap.y2 - cap.y1);
  const stacked = direction.startsWith('stacked-');
  // Spaced Latin letters must stay separate instead of collapsing into fi/ff ligatures.
  const glyphs = font.stringToGlyphs(text, {features:{liga:!stacked && spacingMm === 0,rlig:!stacked && spacingMm === 0}});
  let cursor = 0;
  const entries = [];
  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i];
    let paths = parseSvgPathToPolygons(glyph.getPath(stacked ? 0 : cursor, 0, emSize).toPathData(5), 0.06);
    if (def.stencil && paths.length) {
      const box = computePolygonsBBox(paths), bridge = Math.max(0.15, heightMm * 0.105);
      const x = box.x + box.width / 2, y = box.y - 1, bottom = box.y + box.height + 1;
      paths = booleanMultiPolygons(paths, [[{x:x-bridge/2,y},{x:x+bridge/2,y},{x:x+bridge/2,y:bottom},{x:x-bridge/2,y:bottom}]], 'subtract');
    }
    paths.forEach(loop => { loop.glyphIndex = i; });
    entries.push(paths);
    cursor += (glyph.advanceWidth || font.unitsPerEm/2) * emSize/font.unitsPerEm;
    if (i+1 < glyphs.length) cursor += font.getKerningValue(glyph,glyphs[i+1]) * emSize/font.unitsPerEm;
  }
  if (stacked) return stackGlyphs(entries, heightMm, spacingMm, direction === 'stacked-up');
  const loops = entries.flat();
  if (!loops.length) return [];
  const bbox = computePolygonsBBox(loops), factor = heightMm / Math.max(0.1,bbox.height);
  // Apply tracking AFTER scaling letter height, so 1 mm stays exactly 1 mm.
  return loops.map(loop => mapGlyphLoop(loop, pt => ({
    x:(pt.x-bbox.x)*factor + loop.glyphIndex*spacingMm,
    y:(pt.y-bbox.y)*factor
  })));
}

function glyphAnchors(loops) {
  const groups = new Map();
  for (const loop of loops) {
    const key = loop.glyphIndex ?? 0;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(loop);
  }
  return new Map([...groups].map(([id, glyph]) => {
    const b = computePolygonsBBox(glyph);
    return [id, b.x + b.width / 2];
  }));
}

function warpLoopsAlongArc(loops, curve) {
  if (!loops.length || !curve) return loops;
  const box = computePolygonsBBox(loops), w = Math.max(1, box.width), h = Math.max(1, box.height);
  const amount = clamp(Number(curve) || 0, -180, 180), angle = Math.abs(amount) / 180 * Math.PI * 2;
  if (angle < .02) return loops;
  const radius = (Math.abs(amount) > 150 ? w + h * .55 : w) / angle;
  const sign = amount > 0 ? 1 : -1, cx = box.x + w / 2, cy = box.y + h / 2;
  const anchors = glyphAnchors(loops);
  return loops.map(loop => {
    const gx = anchors.get(loop.glyphIndex ?? 0), theta = (gx - cx) / radius;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    return mapGlyphLoop(loop, p => ({
      x:cx + sin*radius + cos*(p.x-gx) - sign*sin*(p.y-cy),
      y:box.y + sign*(radius-cos*radius) + sign*sin*(p.x-gx) + cos*(p.y-cy)
    }));
  });
}

// Each letter follows the path tangent as a rigid shape, never as stretched rubber.
export function warpLoopsAlongCustomPath(loops, pathPoints, {
  closed = false,
  offsetPct = 0,
  normalOffsetMm = 0,
  flip = false
} = {}) {
  if (!loops || loops.length === 0 || !Array.isArray(pathPoints) || pathPoints.length < 2) {
    return loops;
  }

  // 1. Build clean path vertex list and segment arc-length table
  let pts = pathPoints.map(p => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 }));
  const area = pts.reduce((sum, p, i) => { const q = pts[(i+1)%pts.length]; return sum + p.x*q.y-q.x*p.y; }, 0);
  if (closed && area < 0) pts.reverse();
  if (flip) pts.reverse();

  const segs = [];
  let totalLen = 0;
  const segCount = closed ? pts.length : pts.length - 1;

  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-5) continue;
    segs.push({
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      tx: dx / len,
      ty: dy / len,
      startS: totalLen,
      len
    });
    totalLen += len;
  }

  if (segs.length === 0 || totalLen < 0.5) return loops;

  // Compute smoothed vertex tangents so letters don't kink sharply across polygon/circle vertices
  const nSegs = segs.length;
  for (let i = 0; i < nSegs; i++) {
    const prevSeg = closed ? segs[(i - 1 + nSegs) % nSegs] : segs[Math.max(0, i - 1)];
    const currSeg = segs[i];
    const nextSeg = closed ? segs[(i + 1) % nSegs] : segs[Math.min(nSegs - 1, i + 1)];

    let t0x = prevSeg.tx + currSeg.tx;
    let t0y = prevSeg.ty + currSeg.ty;
    const l0 = Math.hypot(t0x, t0y) || 1;
    currSeg.t0x = t0x / l0;
    currSeg.t0y = t0y / l0;

    let t1x = currSeg.tx + nextSeg.tx;
    let t1y = currSeg.ty + nextSeg.ty;
    const l1 = Math.hypot(t1x, t1y) || 1;
    currSeg.t1x = t1x / l1;
    currSeg.t1y = t1y / l1;
  }

  const normalSign = 1; // Local x = tangent, local up = left normal: rigid rotation.

  // Sample position, smoothed tangent, and outward normal at arc-length `s`
  const sampleAtArcLength = (sInput) => {
    let s = sInput;
    if (closed) {
      s = ((s % totalLen) + totalLen) % totalLen;
    } else {
      if (s <= 0) {
        const first = segs[0];
        const nx = first.ty * normalSign;
        const ny = -first.tx * normalSign;
        return {
          x: first.ax + first.tx * s,
          y: first.ay + first.ty * s,
          nx,
          ny,
          tx: first.tx, ty: first.ty
        };
      }
      if (s >= totalLen) {
        const last = segs[nSegs - 1];
        const extra = s - totalLen;
        const nx = last.ty * normalSign;
        const ny = -last.tx * normalSign;
        return {
          x: last.bx + last.tx * extra,
          y: last.by + last.ty * extra,
          nx,
          ny,
          tx: last.tx, ty: last.ty
        };
      }
    }

    // Binary search for segment containing s
    let lo = 0;
    let hi = nSegs - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].startS + segs[mid].len < s) lo = mid + 1;
      else hi = mid;
    }
    const seg = segs[lo];
    const t = clamp((s - seg.startS) / seg.len, 0, 1);
    const px = seg.ax + (seg.bx - seg.ax) * t;
    const py = seg.ay + (seg.by - seg.ay) * t;

    // Interpolate tangent only near segment ends if angle change is gentle (< 35 deg)
    const dotEnds = seg.t0x * seg.t1x + seg.t0y * seg.t1y;
    let tx = seg.tx;
    let ty = seg.ty;
    if (dotEnds > 0.82) {
      tx = seg.t0x * (1 - t) + seg.t1x * t;
      ty = seg.t0y * (1 - t) + seg.t1y * t;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
    }

    const nx = ty * normalSign;
    const ny = -tx * normalSign;
    return { x: px, y: py, nx, ny, tx, ty };
  };

  const bbox = computePolygonsBBox(loops);
  const textCx = bbox.x + bbox.width / 2;
  const baselineY = bbox.y + bbox.height; // Bottom of letters sits on the path outline!

  // Where along the path should the center of the text sit?
  // For closed shapes (like a Circle): start at the top-center of the shape by default, plus offsetPct!
  let anchorS = totalLen * 0.5;
  if (closed) {
    // Project the top-center of the shape onto the contour, including long straight top edges.
    const bounds = computePolygonsBBox([pts]), top = {x:bounds.x+bounds.width/2,y:bounds.y};
    let bestS = 0, bestDistance = Infinity;
    for (const seg of segs) {
      const along = clamp((top.x-seg.ax)*seg.tx+(top.y-seg.ay)*seg.ty,0,seg.len);
      const distance = Math.hypot(seg.ax+along*seg.tx-top.x,seg.ay+along*seg.ty-top.y);
      if (distance < bestDistance) { bestDistance=distance; bestS=seg.startS+along; }
    }
    anchorS = bestS + (offsetPct / 100) * totalLen;
  } else {
    anchorS = totalLen * clamp(0.5 + offsetPct / 100, 0, 1);
  }

  const anchors = glyphAnchors(loops);
  return loops.map(loop => {
    const gx = anchors.get(loop.glyphIndex ?? 0);
    const sample = sampleAtArcLength(anchorS + gx - textCx);
    return mapGlyphLoop(loop, pt => {
      const above = baselineY - pt.y + Number(normalOffsetMm || 0);
      return {
        x: sample.x + sample.tx*(pt.x-gx) + sample.nx*above,
        y: sample.y + sample.ty*(pt.x-gx) + sample.ny*above
      };
    });
  });
}

/**
 * Creates or updates a `text` vector shape in exact millimeters.
 */
export function createTextShape({
  x = 40,
  y = 40,
  text = 'BJØRNSVEEN',
  fontKey = 'sans-bold',
  fontSizeMm = 18,
  spacingMm = 1.2,
  writingDirection = 'horizontal',
  curve = 0,
  customPath = null,
  customPathClosed = false,
  customPathSourceId = null,
  customPathSourceName = null,
  pathOffsetPct = 0,
  pathNormalOffsetMm = 0,
  pathFlip = false,
  laserMode = 'engrave'
} = {}) {
  const loops = generateTextPolygons({
    text,
    fontKey,
    fontSizeMm,
    spacingMm,
    writingDirection,
    curve,
    customPath,
    customPathClosed,
    pathOffsetPct,
    pathNormalOffsetMm,
    pathFlip
  });

  const rawBBox = computePolygonsBBox(loops);
  const hasCustomPath = Array.isArray(customPath) && customPath.length >= 2;

  // When bound to a custom shape on the canvas, keep world coordinates aligned with that shape!
  const shiftedLoops = hasCustomPath
    ? loops
    : loops.map(loop => {
        const s = loop.map(pt => ({
          x: pt.x - rawBBox.x + x,
          y: pt.y - rawBBox.y + y
        }));
        s.closed = loop.closed !== false;
        return s;
      });

  const bbox = computePolygonsBBox(shiftedLoops);
  const d = polygonsToSvgPath(shiftedLoops, 3);

  // Single-line font defaults to score or cut rather than filled engrave
  const finalMode = fontKey === 'singleline' && laserMode === 'engrave' ? 'score' : laserMode;

  return {
    id: uid('text'),
    type: 'text',
    name: `Tekst: "${text.slice(0, 16)}"`,
    laserMode: finalMode,
    x: roundMm(bbox.x, 2),
    y: roundMm(bbox.y, 2),
    width: roundMm(bbox.width, 2),
    height: roundMm(bbox.height, 2),
    rotation: 0,
    flipX: false,
    flipY: false,
    d,
    origBBox: { ...bbox },
    textMeta: {
      layoutVersion: 2,
      text,
      fontKey,
      fontSizeMm,
      spacingMm,
      writingDirection: normalizeTextDirection(writingDirection, curve, customPath),
      curve,
      customPath: hasCustomPath ? customPath : null,
      customPathClosed: Boolean(customPathClosed),
      customPathSourceId: customPathSourceId || null,
      customPathSourceName: customPathSourceName || null,
      pathOffsetPct: Number(pathOffsetPct) || 0,
      pathNormalOffsetMm: Number(pathNormalOffsetMm) || 0,
      pathFlip: Boolean(pathFlip)
    }
  };
}

export function updateTextShape(shape, newMeta) {
  const meta = { ...(shape.textMeta || {}), ...newMeta };
  shape.textMeta = meta;

  if (!String(meta.text ?? '').trim()) {
    shape.name = 'Tekst: (tom)';
    shape.d = '';
    shape._cachedD = null;
    shape._cachedRawLoops = null;
    return shape;
  }

  const rebuilt = createTextShape({
    x: shape.x,
    y: shape.y,
    ...meta,
    laserMode: shape.laserMode
  });
  shape.name = rebuilt.name;
  shape.x = rebuilt.x;
  shape.y = rebuilt.y;
  shape.width = rebuilt.width;
  shape.height = rebuilt.height;
  shape.d = rebuilt.d;
  shape._cachedD = null;
  shape._cachedRawLoops = null;
  shape.origBBox = rebuilt.origBBox;
  shape.textMeta = rebuilt.textMeta;
  if (meta.fontKey === 'singleline' && shape.laserMode === 'engrave') {
    shape.laserMode = 'score';
  }
  return shape;
}
