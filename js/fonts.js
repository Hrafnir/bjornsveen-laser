// ============================================================================
// Bjørnsveen LaserStudio – Laser Font & Text-to-Path Engine
// Includes:
// 1. Single-Line Score Font ("Laser Enkelstreg") for 10x faster scoring
// 2. Stencil Font ("Laser Sjablong") with bridges so islands (O, A, B, D, P, R, Å, Ø) never fall out!
// 3. High-Resolution Subpixel Vectorizer for all system/display fonts + Curved Text
// ============================================================================

import {
  uid,
  roundMm,
  clamp,
  computePolygonsBBox,
  polygonsToSvgPath,
  marchingSquaresZeroIsoline,
  simplifyRdpPolygon
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

const FONT_FAMILIES = {
  'stencil': 'Impact, "Arial Black", sans-serif',
  'sans-bold': '"Arial Black", Impact, system-ui, sans-serif',
  'rounded': '"Trebuchet MS", "Arial Rounded MT Bold", system-ui, sans-serif',
  'serif': 'Georgia, "Times New Roman", serif',
  'mono': '"Courier New", Menlo, monospace',
  'script': '"Snell Roundhand", "Apple Chancery", "Brush Script MT", Georgia, cursive'
};

/**
 * Generates polygon loops in millimeter coordinates for a text object.
 */
export function generateTextPolygons( {
  text = 'BJØRNSVEEN',
  fontKey = 'sans-bold',
  fontSizeMm = 18,
  spacingMm = 1.2,
  curve = 0
} = {}) {
  const cleanText = String(text || 'TEKST').trim() || 'TEKST';
  const capHeight = clamp(Number(fontSizeMm) || 18, 2, 400);
  const letterGap = Number(spacingMm) || 0;
  const curveVal = Number(curve) || 0;

  // 1. If Single-Line Score font is chosen
  if (fontKey === 'singleline') {
    const rawLoops = buildSingleLinePolygons(cleanText, capHeight, letterGap);
    return curveVal !== 0 ? warpLoopsAlongArc(rawLoops, curveVal) : rawLoops;
  }

  // 2. Render outline font (with automatic stencil bridges if fontKey === 'stencil')
  const rawLoops = traceCanvasTextToPolygons(cleanText, fontKey, capHeight, letterGap);
  return curveVal !== 0 ? warpLoopsAlongArc(rawLoops, curveVal) : rawLoops;
}

function buildSingleLinePolygons(text, heightMm, spacingMm) {
  const upper = text.toUpperCase();
  const charW = heightMm * 0.66;
  const stepX = charW + spacingMm;
  const loops = [];
  let cursorX = 0;

  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i];
    if (ch === ' ') {
      cursorX += charW * 0.65;
      continue;
    }
    const strokes = SINGLE_LINE_GLYPHS[ch] || SINGLE_LINE_GLYPHS['O'];
    for (const stroke of strokes) {
      const loop = stroke.map(([nx, ny]) => ({
        x: cursorX + nx * charW,
        y: ny * heightMm
      }));
      loop.closed = false;
      loops.push(loop);
    }
    cursorX += stepX;
  }
  return loops;
}

/**
 * Renders text onto an offscreen canvas at high DPI, applies stencil bridges if requested,
 * and extracts subpixel vector contours via Marching Squares.
 */
function traceCanvasTextToPolygons(text, fontKey, capHeightMm, spacingMm) {
  const pxPerMm = clamp(56 / capHeightMm, 2.5, 9); // Fast subpixel resolution (~68px tall letters)
  const fontPx = Math.round(capHeightMm * pxPerMm * 1.22);
  const spacingPx = spacingMm * pxPerMm;
  const family = FONT_FAMILIES[fontKey] || FONT_FAMILIES['sans-bold'];
  const weight = fontKey === 'script' ? 'bold italic' : '900';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.font = `${weight} ${fontPx}px ${family}`;

  // Measure characters individually to support exact letter spacing and stencil bridges
  const chars = Array.from(text);
  const charMetrics = chars.map(ch => {
    const m = ctx.measureText(ch);
    return { ch, width: Math.max(fontPx * 0.25, m.width) };
  });

  const totalW = charMetrics.reduce((acc, c) => acc + c.width, 0) + Math.max(0, chars.length - 1) * spacingPx;
  const pad = Math.ceil(fontPx * 0.35);
  const cw = Math.max(32, Math.ceil(totalW + pad * 2));
  const ch = Math.max(32, Math.ceil(fontPx * 1.5 + pad * 2));

  canvas.width = cw;
  canvas.height = ch;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);

  ctx.font = `${weight} ${fontPx}px ${family}`;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'alphabetic';

  const baselineY = pad + fontPx * 0.95;
  let curX = pad;

  const isStencil = fontKey === 'stencil';
  const bridgeWidthPx = Math.max(3, fontPx * 0.11);

  for (const item of charMetrics) {
    ctx.fillStyle = '#000000';
    ctx.fillText(item.ch, curX, baselineY);

    // If Stencil font: cut vertical bridge through center of enclosed characters so inner pieces stay attached!
    if (isStencil && /[ABDOPQRÆØÅabdopqræøå04689@#%&]/.test(item.ch)) {
      const centerX = curX + item.width * 0.5 - bridgeWidthPx * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(centerX, baselineY - fontPx * 1.05, bridgeWidthPx, fontPx * 1.25);
    }

    curX += item.width + spacingPx;
  }

  const imgData = ctx.getImageData(0, 0, cw, ch).data;
  const field = new Float32Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) {
    // Luminance in [0..255]; <= 128 is inside letter (negative)
    const r = imgData[i * 4];
    field[i] = r - 128;
  }

  const scaleMm = 1 / pxPerMm;
  const rawLoops = marchingSquaresZeroIsoline(field, cw, ch, 0, 0, scaleMm);
  if (!rawLoops || rawLoops.length === 0) return [];

  const simplified = rawLoops
    .map(loop => simplifyRdpPolygon(loop, 0.08 * (capHeightMm / 18)))
    .filter(l => l.length >= 3);

  // Normalize top-left to (0, 0) and scale height to exact requested capHeightMm
  const bbox = computePolygonsBBox(simplified);
  const actualH = Math.max(0.1, bbox.height);
  const scaleFactor = capHeightMm / actualH;

  return simplified.map(loop => {
    const out = loop.map(pt => ({
      x: (pt.x - bbox.x) * scaleFactor,
      y: (pt.y - bbox.y) * scaleFactor
    }));
    out.closed = true;
    return out;
  });
}

/**
 * Warps polygon loops along a circular arc when `curve` != 0 (-100..100).
 */
function warpLoopsAlongArc(loops, curve) {
  if (!loops || loops.length === 0 || !curve) return loops;
  const bbox = computePolygonsBBox(loops);
  const w = Math.max(1, bbox.width);
  const h = Math.max(1, bbox.height);
  const cx = bbox.x + w / 2;

  // Total bend angle up to +-150 degrees
  const maxAngle = (Math.abs(curve) / 100) * (Math.PI * 0.85);
  if (maxAngle < 0.02) return loops;

  const radius = w / maxAngle;
  const sign = curve > 0 ? 1 : -1;

  return loops.map(loop => {
    const warped = loop.map(pt => {
      const dx = pt.x - cx;
      const dy = pt.y - (bbox.y + h / 2);
      const theta = dx / radius;
      if (sign > 0) {
        // Arch upward (rainbow)
        const r = radius - dy;
        return {
          x: cx + Math.sin(theta) * r,
          y: bbox.y + radius - Math.cos(theta) * r
        };
      } else {
        // Arch downward (smile)
        const r = radius + dy;
        return {
          x: cx + Math.sin(theta) * r,
          y: bbox.y - radius + Math.cos(theta) * r
        };
      }
    });
    warped.closed = loop.closed !== false;
    return warped;
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
  curve = 0,
  laserMode = 'engrave'
} = {}) {
  const loops = generateTextPolygons({ text, fontKey, fontSizeMm, spacingMm, curve });
  const rawBBox = computePolygonsBBox(loops);
  const shiftedLoops = loops.map(loop => {
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
      text,
      fontKey,
      fontSizeMm,
      spacingMm,
      curve
    }
  };
}

export function updateTextShape(shape, newMeta) {
  const meta = { ...(shape.textMeta || {}), ...newMeta };
  const rebuilt = createTextShape({
    x: shape.x,
    y: shape.y,
    ...meta,
    laserMode: shape.laserMode
  });
  shape.name = rebuilt.name;
  shape.width = rebuilt.width;
  shape.height = rebuilt.height;
  shape.d = rebuilt.d;
  shape.origBBox = rebuilt.origBBox;
  shape.textMeta = rebuilt.textMeta;
  if (meta.fontKey === 'singleline' && shape.laserMode === 'engrave') {
    shape.laserMode = 'score';
  }
  return shape;
}
