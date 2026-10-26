// ============================================================================
// Bjørnsveen LaserStudio – Vector Icon Library & Image-to-Vector Tracer
// ============================================================================

import {
  createPathShapeFromPolygons,
  parseSvgPathToPolygons,
  computePolygonsBBox,
  marchingSquaresZeroIsoline,
  simplifyRdpPolygon,
  clamp
} from './geometry.js';

export const LASER_ICONS = [
  // Natur & Dyr
  {
    id: 'pine-tree',
    name: 'Grantre',
    category: 'Natur & Dyr',
    d: 'M 50 5 L 20 42 L 35 42 L 12 70 L 30 70 L 8 92 L 43 92 L 43 105 L 57 105 L 57 92 L 92 92 L 70 70 L 88 70 L 65 42 L 80 42 Z'
  },
  {
    id: 'paw',
    name: 'Dyrepote',
    category: 'Natur & Dyr',
    d: 'M 50 52 C 33 52 22 65 22 79 C 22 90 31 96 41 94 C 46 93 54 93 59 94 C 69 96 78 90 78 79 C 78 65 67 52 50 52 Z M 23 30 C 16 30 12 37 14 45 C 16 53 23 56 29 53 C 35 50 36 41 33 35 C 30 31 27 30 23 30 Z M 41 18 C 34 18 30 26 32 34 C 34 42 40 46 46 43 C 52 40 54 31 51 24 C 49 20 45 18 41 18 Z M 59 18 C 55 18 51 20 49 24 C 46 31 48 40 54 43 C 60 46 66 42 68 34 C 70 26 66 18 59 18 Z M 77 30 C 73 30 70 31 67 35 C 64 41 65 50 71 53 C 77 56 84 53 86 45 C 88 37 84 30 77 30 Z'
  },
  {
    id: 'cat',
    name: 'Katt',
    category: 'Natur & Dyr',
    d: 'M 22 10 L 22 45 C 16 55 16 72 25 84 C 33 94 42 96 50 96 C 58 96 67 94 75 84 C 84 72 84 55 78 45 L 78 10 L 60 28 C 53 26 47 26 40 28 Z'
  },
  {
    id: 'butterfly',
    name: 'Sommerfugl',
    category: 'Natur & Dyr',
    d: 'M 48 25 C 35 5 8 8 8 32 C 8 48 25 56 38 56 C 22 60 14 74 20 88 C 26 100 42 95 48 76 L 48 92 L 52 92 L 52 76 C 58 95 74 100 80 88 C 86 74 78 60 62 56 C 75 56 92 48 92 32 C 92 8 65 5 52 25 L 52 15 L 48 15 Z'
  },
  {
    id: 'fish',
    name: 'Fisk',
    category: 'Natur & Dyr',
    d: 'M 10 50 C 25 22 60 22 76 42 L 95 24 L 90 50 L 95 76 L 76 58 C 60 78 25 78 10 50 Z M 28 44 C 25 44 23 46 23 49 C 23 52 25 54 28 54 C 31 54 33 52 33 49 C 33 46 31 44 28 44 Z'
  },
  {
    id: 'mountains',
    name: 'Fjelltopper',
    category: 'Natur & Dyr',
    d: 'M 5 85 L 35 25 L 55 62 L 72 35 L 95 85 Z'
  },

  // Gaming, Sport & Hobby
  {
    id: 'gamepad',
    name: 'Gaming-kontroller',
    category: 'Gaming & Hobby',
    d: 'M 26 28 C 14 28 6 40 4 62 C 2 80 12 88 22 82 L 34 68 L 66 68 L 78 82 C 88 88 98 80 96 62 C 94 40 86 28 74 28 Z M 24 40 L 30 40 L 30 46 L 36 46 L 36 52 L 30 52 L 30 58 L 24 58 L 24 52 L 18 52 L 18 46 L 24 46 Z M 74 42 C 77 42 79 44 79 47 C 79 50 77 52 74 52 C 71 52 69 50 69 47 C 69 44 71 42 74 42 Z M 64 50 C 67 50 69 52 69 55 C 69 58 67 60 64 60 C 61 60 59 58 59 55 C 59 52 61 50 64 50 Z'
  },
  {
    id: 'lightning',
    name: 'Lyn',
    category: 'Gaming & Hobby',
    d: 'M 58 5 L 18 56 L 46 56 L 36 96 L 82 42 L 52 42 Z'
  },
  {
    id: 'crown',
    name: 'Krone',
    category: 'Gaming & Hobby',
    d: 'M 10 78 L 18 26 L 38 50 L 50 18 L 62 50 L 82 26 L 90 78 Z M 10 84 L 90 84 L 90 92 L 10 92 Z'
  },
  {
    id: 'rocket',
    name: 'Rakett',
    category: 'Gaming & Hobby',
    d: 'M 50 6 C 34 22 28 45 28 68 L 14 82 L 28 82 L 34 94 L 66 94 L 72 82 L 86 82 L 72 68 C 72 45 66 22 50 6 Z M 50 34 C 56 34 60 38 60 44 C 60 50 56 54 50 54 C 44 54 40 50 40 44 C 40 38 44 34 50 34 Z'
  },
  {
    id: 'music-note',
    name: 'Musikknote',
    category: 'Gaming & Hobby',
    d: 'M 38 18 L 88 10 L 88 68 C 88 78 78 86 68 86 C 58 86 52 79 52 71 C 52 63 60 56 70 56 C 73 56 76 57 78 58 L 78 26 L 48 31 L 48 76 C 48 86 38 94 28 94 C 18 94 12 87 12 79 C 12 71 20 64 30 64 C 33 64 36 65 38 66 Z'
  },
  {
    id: 'trophy',
    name: 'Pokal / Trofé',
    category: 'Gaming & Hobby',
    d: 'M 25 12 L 75 12 L 75 22 L 92 22 L 92 42 C 92 54 82 62 70 62 C 66 70 59 75 55 77 L 55 86 L 72 86 L 72 95 L 28 95 L 28 86 L 45 86 L 45 77 C 41 75 34 70 30 62 C 18 62 8 54 8 42 L 8 22 L 25 22 Z M 16 30 L 16 42 C 16 48 21 53 27 54 L 25 30 Z M 75 30 L 73 54 C 79 53 84 48 84 42 L 84 30 Z'
  },

  // Skilt, Piler & Symboler
  {
    id: 'shield',
    name: 'Våpenskjold',
    category: 'Skilt & Symboler',
    d: 'M 50 6 L 88 20 L 88 52 C 88 76 68 90 50 96 C 32 90 12 76 12 52 L 12 20 Z'
  },
  {
    id: 'arrow-right',
    name: 'Pil høyre',
    category: 'Skilt & Symboler',
    d: 'M 8 36 L 56 36 L 56 16 L 94 50 L 56 84 L 56 64 L 8 64 Z'
  },
  {
    id: 'compass',
    name: 'Kompassrose',
    category: 'Skilt & Symboler',
    d: 'M 50 4 L 61 39 L 96 50 L 61 61 L 50 96 L 39 61 L 4 50 L 39 39 Z'
  },
  {
    id: 'wrench',
    name: 'Skaperverksted-nøkkel',
    category: 'Skilt & Symboler',
    d: 'M 68 10 C 56 10 46 20 46 32 C 46 36 47 40 49 43 L 12 80 C 8 84 8 90 12 94 C 16 98 22 98 26 94 L 63 57 C 66 59 70 60 74 60 C 86 60 96 50 96 38 L 80 44 L 68 38 L 62 26 L 78 12 C 74 11 71 10 68 10 Z'
  },
  {
    id: 'flame',
    name: 'Flamme',
    category: 'Skilt & Symboler',
    d: 'M 52 6 C 52 6 82 32 82 62 C 82 82 67 96 50 96 C 33 96 18 82 18 62 C 18 46 28 32 34 26 C 32 36 38 44 42 44 C 38 28 52 6 52 6 Z'
  },
  {
    id: 'badge-seal',
    name: 'Medaljong / Stempel',
    category: 'Skilt & Symboler',
    d: 'M 50 4 L 60 14 L 74 10 L 79 24 L 93 27 L 91 41 L 100 52 L 91 63 L 93 77 L 79 80 L 74 94 L 60 90 L 50 100 L 40 90 L 26 94 L 21 80 L 7 77 L 9 63 L 0 52 L 9 41 L 7 27 L 21 24 L 26 10 L 40 14 Z'
  }
];

/**
 * Creates a scalable vector shape from an icon definition, scaled to `targetSizeMm`.
 */
export function createIconShape(iconDef, x = 50, y = 50, targetSizeMm = 45, laserMode = 'engrave') {
  const rawLoops = parseSvgPathToPolygons(iconDef.d, 0.25);
  const rawBBox = computePolygonsBBox(rawLoops);
  const scale = targetSizeMm / Math.max(rawBBox.width, rawBBox.height, 1);

  const scaledLoops = rawLoops.map(loop => {
    const out = loop.map(pt => ({
      x: x + (pt.x - rawBBox.x) * scale,
      y: y + (pt.y - rawBBox.y) * scale
    }));
    out.closed = true;
    return out;
  });

  return createPathShapeFromPolygons(scaledLoops, laserMode, iconDef.name);
}

// ============================================================================
// IMAGE-TO-VECTOR TRACER (Subpixel Marching Squares + RDP Simplification)
// ============================================================================

/**
 * Traces a loaded HTMLImageElement into clean millimeter vector polygon loops.
 */
export function traceImageToPolygons(imgElement, {
  threshold = 128,
  invert = false,
  targetWidthMm = 80,
  smoothing = 0.18
} = {}) {
  if (!imgElement) return [];
  const maxRes = 260;
  const aspect = (imgElement.naturalHeight || imgElement.height || 100) / (imgElement.naturalWidth || imgElement.width || 100);
  const cw = maxRes;
  const ch = clamp(Math.round(maxRes * aspect), 24, 340);

  const canvas = document.createElement('canvas');
  canvas.width = cw + 4;
  canvas.height = ch + 4;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Fill border with background so edge contours always close cleanly
  ctx.fillStyle = invert ? '#000000' : '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imgElement, 2, 2, cw, ch);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const totalPixels = canvas.width * canvas.height;
  const field = new Float32Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    // Transparent pixels count as white background
    const lum = a < 50 ? 255 : (0.299 * r + 0.587 * g + 0.114 * b);
    const val = invert ? (threshold - lum) : (lum - threshold);
    field[i] = val;
  }

  const mmPerPixel = targetWidthMm / cw;
  const rawLoops = marchingSquaresZeroIsoline(field, canvas.width, canvas.height, 0, 0, mmPerPixel);

  // Filter out tiny speckle noise (< 1.2 mm perimeter) and simplify
  const cleanLoops = [];
  for (const loop of rawLoops) {
    if (loop.length < 4) continue;
    const simp = simplifyRdpPolygon(loop, smoothing);
    if (simp.length >= 3) {
      simp.closed = true;
      cleanLoops.push(simp);
    }
  }
  return cleanLoops;
}
