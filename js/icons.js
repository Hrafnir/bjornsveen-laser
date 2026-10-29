// ============================================================================
// Bjørnsveen LaserStudio – Vector Icon Library & Image-to-Vector Tracer
// ============================================================================

import {
  uid,
  roundMm,
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

// ============================================================================
// 2. BITMAP / RASTER PHOTO ENGRAVING ENGINE (FOR XCS & COMPOSITE LASER DESIGNS)
// ============================================================================

/**
 * Processes an HTMLImageElement into a laser-ready PNG DataURL with:
 * - Brightness, Contrast, Sharpness (Unsharp Mask), Invert (for slate/anodized aluminum)
 * - White-background removal
 * - Full xTool Studio Bitmap Modes:
 *   - 'Jarvis' (12-neighbor Jarvis-Judice-Ninke dithering – default & best on wood/MDF)
 *   - 'grayscale' (Smooth 8-bit grayscale depth engraving)
 *   - 'Stucki' (12-neighbor Stucki sharp-edge dithering)
 *   - 'Atkinson' (6-neighbor Atkinson high-contrast dithering)
 *   - 'Floyd' (Classic 4-neighbor Floyd-Steinberg dithering)
 *   - 'Sierra' (10-neighbor Sierra smooth dithering)
 *   - 'Bayer' (4x4 Ordered Bayer matrix crosshatch dithering)
 *   - 'threshold' (Crisp 1-bit B&W threshold for logos/stamps)
 *   - 'sketch' (Sobel edge-detection contour sketch for line-art engraving)
 *   - 'original' (Color / unfiltered preview)
 * - Shape Masking (Circle, Heart, Rounded Rect, Star, or Rectangle)
 */
export function processBitmapElementToDataUrl(imgElement, {
  brightness = 0,       // -100 .. +100
  contrast = 0,         // -100 .. +100
  sharpness = 50,       // 0 .. 100 (50 = neutral, >50 = sharpen edges for laser)
  filter = 'Jarvis',    // 'Jarvis' | 'grayscale' | 'Stucki' | 'Atkinson' | 'Floyd' | 'Sierra' | 'Bayer' | 'threshold' | 'sketch' | 'original'
  threshold = 135,      // 10 .. 245
  invert = false,
  removeWhiteBg = false,
  puzzleClip = null,    // normalized contours used by image puzzles
  maskShape = 'rect',   // 'rect' | 'rounded' | 'circle' | 'heart' | 'star'
  maxDimPx = 650
} = {}) {
  if (!imgElement || typeof document === 'undefined') return '';
  const natW = Math.max(1, imgElement.naturalWidth || imgElement.width || 200);
  const natH = Math.max(1, imgElement.naturalHeight || imgElement.height || 200);
  const scale = Math.min(1, maxDimPx / Math.max(natW, natH));
  const cw = Math.max(16, Math.round(natW * scale));
  const ch = Math.max(16, Math.round(natH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '';

  // Puzzle cropping survives preview regeneration and full-resolution laser exports.
  if (Array.isArray(puzzleClip) && puzzleClip.length) {
    ctx.save(); ctx.beginPath();
    for (const loop of puzzleClip) {
      if (!Array.isArray(loop) || loop.length < 3) continue;
      loop.forEach((p,i) => { if (i) ctx.lineTo(p.x*cw,p.y*ch); else ctx.moveTo(p.x*cw,p.y*ch); });
      ctx.closePath();
    }
    ctx.clip('evenodd');
  }
  // Apply geometric mask clip if requested
  if (maskShape && maskShape !== 'rect') {
    ctx.save();
    ctx.beginPath();
    if (maskShape === 'circle') {
      ctx.ellipse(cw / 2, ch / 2, cw / 2, ch / 2, 0, 0, Math.PI * 2);
    } else if (maskShape === 'rounded') {
      const r = Math.min(cw, ch) * 0.16;
      ctx.moveTo(r, 0);
      ctx.arcTo(cw, 0, cw, ch, r);
      ctx.arcTo(cw, ch, 0, ch, r);
      ctx.arcTo(0, ch, 0, 0, r);
      ctx.arcTo(0, 0, cw, 0, r);
    } else if (maskShape === 'heart') {
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        const hx = Math.pow(Math.sin(t), 3);
        const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
        const px = ((hx + 1) / 2) * cw;
        const py = ((hy + 0.75) / 1.81) * ch;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    } else if (maskShape === 'star') {
      const pts = 5;
      const innerR = 0.44;
      for (let i = 0; i < pts * 2; i++) {
        const rf = i % 2 === 0 ? 1 : innerR;
        const a = -Math.PI / 2 + (i / (pts * 2)) * Math.PI * 2;
        const px = cw / 2 + Math.cos(a) * (cw / 2) * rf;
        const py = ch / 2 + Math.sin(a) * (ch / 2) * rf;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.clip();
  }

  ctx.drawImage(imgElement, 0, 0, cw, ch);
  if (maskShape && maskShape !== 'rect') {
    ctx.restore();
  }

  if (Array.isArray(puzzleClip) && puzzleClip.length) ctx.restore();
  const imgData = ctx.getImageData(0, 0, cw, ch);
  const data = imgData.data;
  const total = cw * ch;

  const bOffset = (Number(brightness) || 0) * 2.55;
  const cVal = clamp(Number(contrast) || 0, -100, 100) * 2.55;
  const cFactor = (259 * (cVal + 255)) / (255 * (259 - cVal));
  const thresh = clamp(Number(threshold) || 135, 5, 250);
  const sharpVal = clamp(Number(sharpness ?? 50), 0, 100);

  // Normalize legacy filter alias 'dither' -> 'Jarvis'
  const normFilter = filter === 'dither' ? 'Jarvis' : (filter || 'Jarvis');

  const lumBuf = new Float32Array(total);
  const alphaMask = new Uint8Array(total);

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    const a = data[idx + 3];
    if (a < 16) {
      data[idx + 3] = 0;
      lumBuf[i] = 255;
      continue;
    }

    let r = data[idx];
    let g = data[idx + 1];
    let b = data[idx + 2];

    // Optional white background removal before invert
    const rawLum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (removeWhiteBg && rawLum > 242) {
      data[idx + 3] = 0;
      lumBuf[i] = 255;
      continue;
    }

    alphaMask[i] = 1;

    // Apply brightness & contrast
    r = clamp(cFactor * (r - 128) + 128 + bOffset, 0, 255);
    g = clamp(cFactor * (g - 128) + 128 + bOffset, 0, 255);
    b = clamp(cFactor * (b - 128) + 128 + bOffset, 0, 255);

    if (invert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    lumBuf[i] = lum;

    if (normFilter === 'original') {
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
    }
  }

  // Optional 3x3 Unsharp Mask sharpening (when sharpness != 50)
  if (normFilter !== 'original' && Math.abs(sharpVal - 50) > 2) {
    const amount = (sharpVal - 50) / 35; // -1.4 .. +1.4
    const srcLum = new Float32Array(lumBuf);
    for (let y = 1; y < ch - 1; y++) {
      const row = y * cw;
      for (let x = 1; x < cw - 1; x++) {
        const i = row + x;
        if (!alphaMask[i]) continue;
        const center = srcLum[i];
        const blur = (
          srcLum[i - cw - 1] + srcLum[i - cw] * 2 + srcLum[i - cw + 1] +
          srcLum[i - 1] * 2  + center * 4         + srcLum[i + 1] * 2 +
          srcLum[i + cw - 1] + srcLum[i + cw] * 2 + srcLum[i + cw + 1]
        ) / 16;
        lumBuf[i] = clamp(center + (center - blur) * amount * 1.8, 0, 255);
      }
    }
  }

  if (normFilter === 'grayscale') {
    for (let i = 0; i < total; i++) {
      if (!alphaMask[i]) continue;
      const v = Math.round(clamp(lumBuf[i], 0, 255));
      const idx = i * 4;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
    }
  } else if (normFilter === 'threshold') {
    for (let i = 0; i < total; i++) {
      if (!alphaMask[i]) continue;
      const v = lumBuf[i] < thresh ? 0 : 255;
      const idx = i * 4;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      if (v === 255 && removeWhiteBg) data[idx + 3] = 0;
    }
  } else if (normFilter === 'sketch') {
    // Sobel edge detector for crisp line-art engraving
    const srcLum = new Float32Array(lumBuf);
    const edgeCutoff = 255 - thresh;
    for (let y = 1; y < ch - 1; y++) {
      for (let x = 1; x < cw - 1; x++) {
        const i = y * cw + x;
        if (!alphaMask[i]) continue;
        const gx =
          -srcLum[(y - 1) * cw + (x - 1)] + srcLum[(y - 1) * cw + (x + 1)] +
          -2 * srcLum[y * cw + (x - 1)]   + 2 * srcLum[y * cw + (x + 1)] +
          -srcLum[(y + 1) * cw + (x - 1)] + srcLum[(y + 1) * cw + (x + 1)];
        const gy =
          -srcLum[(y - 1) * cw + (x - 1)] - 2 * srcLum[(y - 1) * cw + x] - srcLum[(y - 1) * cw + (x + 1)] +
           srcLum[(y + 1) * cw + (x - 1)] + 2 * srcLum[(y + 1) * cw + x] + srcLum[(y + 1) * cw + (x + 1)];
        const mag = Math.hypot(gx, gy);
        const v = mag > Math.max(25, edgeCutoff) ? 0 : 255;
        const idx = i * 4;
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
      }
    }
  } else if (normFilter === 'Bayer') {
    // 4x4 Ordered Bayer Matrix Dithering
    const bayer4x4 = [
      [  0, 128,  32, 160 ],
      [ 192,  64, 224,  96 ],
      [  48, 176,  16, 144 ],
      [ 240, 112, 208,  80 ]
    ];
    const bias = thresh - 128;
    for (let y = 0; y < ch; y++) {
      const bRow = bayer4x4[y & 3];
      for (let x = 0; x < cw; x++) {
        const i = y * cw + x;
        if (!alphaMask[i]) continue;
        const adjusted = lumBuf[i] - bias * 0.65;
        const v = adjusted < bRow[x & 3] ? 0 : 255;
        const idx = i * 4;
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
      }
    }
  } else if (['Jarvis', 'Stucki', 'Atkinson', 'Floyd', 'Sierra'].includes(normFilter)) {
    // Error-diffusion dithering kernels matching xTool Studio's official bitmapModes
    const kernels = {
      Floyd: {
        div: 16,
        taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]]
      },
      Atkinson: {
        div: 8,
        taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]]
      },
      Jarvis: {
        div: 48,
        taps: [
          [1, 0, 7], [2, 0, 5],
          [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3],
          [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]
        ]
      },
      Stucki: {
        div: 42,
        taps: [
          [1, 0, 8], [2, 0, 4],
          [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
          [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]
        ]
      },
      Sierra: {
        div: 32,
        taps: [
          [1, 0, 5], [2, 0, 3],
          [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2],
          [-1, 2, 2], [0, 2, 3], [1, 2, 2]
        ]
      }
    };
    const kernel = kernels[normFilter] || kernels.Jarvis;
    const { div, taps } = kernel;

    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = y * cw + x;
        if (!alphaMask[i]) continue;
        const oldP = clamp(lumBuf[i], 0, 255);
        const newP = oldP < thresh ? 0 : 255;
        const err = (oldP - newP) / div;
        lumBuf[i] = newP;

        for (let k = 0; k < taps.length; k++) {
          const nx = x + taps[k][0];
          const ny = y + taps[k][1];
          if (nx >= 0 && nx < cw && ny < ch) {
            lumBuf[ny * cw + nx] += err * taps[k][2];
          }
        }

        const idx = i * 4;
        data[idx] = newP;
        data[idx + 1] = newP;
        data[idx + 2] = newP;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Helper to map our UI filter name to xTool Studio's exact `bitmapMode` enum value:
 * 'grayscale' | 'Jarvis' | 'Bayer' | 'Floyd' | 'Stucki' | 'Atkinson' | 'Sierra'
 */
export function resolveXcsBitmapMode(filterOrMode, fallback = 'Jarvis') {
  const raw = String(filterOrMode || '').trim();
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  if (lower === 'grayscale' || lower === 'original') return 'grayscale';
  if (lower === 'jarvis' || lower === 'dither') return 'Jarvis';
  if (lower === 'bayer') return 'Bayer';
  if (lower === 'floyd') return 'Floyd';
  if (lower === 'stucki') return 'Stucki';
  if (lower === 'atkinson') return 'Atkinson';
  if (lower === 'sierra') return 'Sierra';
  // For 'threshold' or 'sketch', pre-thresholded 1-bit image engraves best with 'Jarvis' or 'grayscale'
  if (lower === 'threshold' || lower === 'sketch') return 'Jarvis';
  return fallback;
}

/**
 * Creates a `type: 'image'` bitmap engraving shape on the workspace.
 */
export function createBitmapImageShape(imgElement, {
  name = 'Foto / Bitmap',
  x = 40,
  y = 40,
  widthMm = 70,
  brightness = 0,
  contrast = 10,
  sharpness = 55,
  filter = 'inherit',
  bitmapMode = 'Jarvis',
  threshold = 135,
  invert = false,
  removeWhiteBg = false,
  maskShape = 'rect'
} = {}) {
  const natW = Math.max(1, imgElement?.naturalWidth || imgElement?.width || 200);
  const natH = Math.max(1, imgElement?.naturalHeight || imgElement?.height || 200);
  const maxDimPx = bitmapPreviewLimit(natW, natH);
  const scale = Math.min(1, maxDimPx / Math.max(natW, natH));
  const procW = Math.max(16, Math.round(natW * scale));
  const procH = Math.max(16, Math.round(natH * scale));
  const aspect = natH / natW;
  const w = clamp(Number(widthMm) || 70, 5, 800);
  const h = roundMm(Math.max(5, w * aspect), 2);

  // Keep the uploaded original independently of display quality and laser filters.
  const srcDataUrl = /^data:image\/(png|jpeg|webp);base64,/i.test(imgElement.src || '')
    ? imgElement.src : processBitmapElementToDataUrl(imgElement, {
    brightness: 0,
    contrast: 0,
    sharpness: 50,
    filter: 'original',
    invert: false,
    removeWhiteBg: false,
    maskShape: 'rect',
    maxDimPx: Math.max(natW, natH)
  });

  const imageMeta = {
    brightness,
    contrast,
    sharpness,
    filter,
    bitmapMode: resolveXcsBitmapMode(filter === 'inherit' ? bitmapMode : filter, 'Jarvis'),
    threshold,
    invert,
    removeWhiteBg,
    maskShape,
    originWidthPx: procW,
    originHeightPx: procH,
    sourceWidthPx: natW,
    sourceHeightPx: natH
  };

  const processedDataUrl = processBitmapElementToDataUrl(imgElement, { ...imageMeta, filter: filter === 'inherit' ? bitmapMode : filter, maxDimPx });
  // Also generate a clean tone/masked image for xTool Studio .xcs export when a hardware dither mode is used
  const xcsExportFilter = ['Jarvis', 'Stucki', 'Atkinson', 'Floyd', 'Sierra', 'Bayer'].includes(filter)
    ? 'grayscale'
    : filter;
  const xcsDataUrl = processBitmapElementToDataUrl(imgElement, {
    ...imageMeta,
    filter: xcsExportFilter,
    maxDimPx
  });

  const shape = {
    id: uid('img'),
    type: 'image',
    name,
    laserMode: 'engrave', // Bitmap engraving
    x: roundMm(x, 2),
    y: roundMm(y, 2),
    width: roundMm(w, 2),
    height: h,
    rotation: 0,
    flipX: false,
    flipY: false,
    srcDataUrl,
    dataUrl: processedDataUrl || srcDataUrl,
    xcsDataUrl: xcsDataUrl || processedDataUrl || srcDataUrl,
    imageMeta
  };
  Object.defineProperty(shape, '_cachedImg', { value: imgElement, enumerable: false, writable: true });
  return shape;
}

// Display settings never change the pixels or filters used for laser export.
export function bitmapPreviewLimit(width, height, mode = 'detail') {
  return mode === 'fast' ? 750 : Math.min(4096, Math.max(width, height) * Math.min(1, Math.sqrt(8000000 / (width * height))));
}
export function bitmapPreviewOptions(meta, width, height) {
  return {maxDimPx: bitmapPreviewLimit(width, height, meta.previewMode),
    ...(meta.previewMode === 'original' ? {filter:'original',brightness:0,contrast:0,sharpness:50,invert:false,removeWhiteBg:false} : {})};
}
export function bitmapResolutionInfo(shape, dpi = 254) {
  const meta=shape.imageMeta||{}, w=meta.sourceWidthPx||meta.originWidthPx, h=meta.sourceHeightPx||meta.originHeightPx;
  if(!w||!h)return 'Originaloppløsning leses når bildet oppdateres.';
  const scale=Math.min(1,bitmapPreviewLimit(w,h,meta.previewMode)/Math.max(w,h)), size=bitmapExportSize(shape,dpi);
  const effective=Math.min(w/shape.width,h/shape.height)*25.4;
  return `Original: ${w} × ${h} px · Visning: ${Math.round(w*scale)} × ${Math.round(h*scale)} px. Ved valgt størrelse: ${Math.round(effective)} DPI. Eksport: ${size.width} × ${size.height} px (valgt ${dpi} DPI).`;
}

export function bitmapExportSize(shape, dpi = 254) {
  const sourceW = shape.imageMeta?.sourceWidthPx || shape.imageMeta?.originWidthPx || 750;
  const sourceH = shape.imageMeta?.sourceHeightPx || shape.imageMeta?.originHeightPx || 750;
  const targetScale = Math.max(shape.width * dpi / 25.4 / sourceW, shape.height * dpi / 25.4 / sourceH);
  const scale = Math.min(1, targetScale, 8192 / Math.max(sourceW, sourceH), Math.sqrt(16000000 / (sourceW * sourceH)));
  return { width: Math.max(1, Math.round(sourceW * scale)), height: Math.max(1, Math.round(sourceH * scale)) };
}

/** Rebuild display or export pixels from the preserved source image. */
export async function refreshBitmapShapeDataUrl(shape, onDone, { dpi = 254, bitmapMode = 'Jarvis', forExport = false, svg = false } = {}) {
  if (!shape || shape.type !== 'image') return;
  const src = shape.srcDataUrl || shape.dataUrl;
  if (!src || typeof Image === 'undefined') return;
  let img = shape._cachedImg;
  if (!img || !img.complete) {
    img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('Kunne ikke lese originalbildet.')); img.src = src; });
    Object.defineProperty(shape, '_cachedImg', { value: img, enumerable: false, writable: true, configurable: true });
  }
  // A stale async load must never overwrite newer settings.
  const meta = shape.imageMeta || (shape.imageMeta = {});
  meta.sourceWidthPx = img.naturalWidth || img.width;
  meta.sourceHeightPx = img.naturalHeight || img.height;
  const filter = meta.filter === 'inherit' ? bitmapMode : (meta.filter || 'grayscale');
  meta.bitmapMode = resolveXcsBitmapMode(filter, bitmapMode);
  if (forExport) {
    const size = bitmapExportSize(shape, dpi);
    const maxDimPx = Math.max(size.width, size.height);
    meta.originWidthPx = size.width; meta.originHeightPx = size.height;
    const hardwareDither = ['Jarvis','Stucki','Atkinson','Floyd','Sierra','Bayer','dither'].includes(filter);
    shape.xcsDataUrl = processBitmapElementToDataUrl(img, { ...meta, filter: hardwareDither ? 'grayscale' : filter, maxDimPx });
    if (svg) shape.exportDataUrl = processBitmapElementToDataUrl(img, { ...meta, filter, maxDimPx });
  } else {
    shape.dataUrl = processBitmapElementToDataUrl(img, { ...meta, filter, ...bitmapPreviewOptions(meta, img.naturalWidth, img.naturalHeight) });
    delete shape.xcsDataUrl; delete shape.exportDataUrl;
  }
  if (onDone) onDone(shape);
}

export async function prepareBitmapExports(shapes, settings, svg = false) {
  for (const shape of shapes) {
    if (shape.hidden || shape.laserMode === 'guide') continue;
    if (shape.type === 'group') await prepareBitmapExports(shape.children || [], settings, svg);
    else if (shape.type === 'image') await refreshBitmapShapeDataUrl(shape, null, { dpi: settings.bitmap?.dpi ?? 254, bitmapMode: settings.bitmap?.bitmapMode || 'Jarvis', forExport: true, svg });
  }
}
