// ============================================================================
// Bjørnsveen LaserStudio – Parametric Makerspace Generators
// 1. Finger-joint Box (with Kerf, Open/Closed/Dividers)
// 2. Door Sign & Keyring Generator
// 3. Jigsaw Puzzle Generator
// 4. True Involute Spur Gear & Meshing Gear-Pair Generator
// 5. Snowflake / Mandala / Coaster Ornament Generator
// ============================================================================

import {
  uid,
  roundMm,
  clamp,
  createPathShapeFromPolygons,
  polygonsToSvgPath,
  shapeToWorldSvgPath,
  computePolygonsBBox,
  booleanMultiPolygons
} from './geometry.js';
import { createTextShape } from './fonts.js';
import { getCutStage } from './cut-order.js';
import { LASER_ICONS, createIconShape, traceImageToPolygons } from './icons.js';

// ============================================================================
// 1. FINGER-JOINT BOX GENERATOR ("BOKS-GENERATOR")
// ============================================================================

export { generateFingerJointBox } from './box-generator.js';

// ============================================================================
// 2. DOOR SIGN & KEYRING GENERATOR ("DØRSKILT & NØKKELRING")
// ============================================================================

export function generateSignOrKeyring({
  signStyle = 'rounded',     // 'rounded' | 'plaque' | 'tag' | 'oval' | 'arrow'
  widthMm = 140,
  heightMm = 55,
  cornerRadiusMm = 8,
  holeMode = 'holes-2',      // 'none' | 'keyring-ear' | 'hole-left' | 'holes-2' | 'holes-4'
  holeDiamMm = 4.5,
  innerBorder = true,
  headline = 'BJØRNSVEEN',
  subtitle = 'SKAPERVERKSTED',
  fontKey = 'sans-bold',
  iconId = 'none'
} = {}) {
  const W = clamp(Number(widthMm) || 140, 20, 600);
  const H = clamp(Number(heightMm) || 55, 12, 400);
  const rx = clamp(Number(cornerRadiusMm) || 8, 0, Math.min(W, H) / 2);
  const holeR = clamp((Number(holeDiamMm) || 4.5) / 2, 1, 15);
  const ox = 25;
  const oy = 25;

  const makeCircle = (cx, cy, r, steps = 36) => {
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    pts.closed = true;
    return pts;
  };

  const buildPlateContour = (inset = 0) => {
    const x = ox + inset;
    const y = oy + inset;
    const w = W - inset * 2;
    const h = H - inset * 2;

    if (signStyle === 'oval') {
      const pts = [];
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        pts.push({ x: x + w / 2 + Math.cos(a) * (w / 2), y: y + h / 2 + Math.sin(a) * (h / 2) });
      }
      pts.closed = true;
      return pts;
    }

    if (signStyle === 'tag') {
      const chamfer = Math.min(h * 0.34, w * 0.22);
      const pts = [
        { x: x + chamfer, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x: x + chamfer, y: y + h },
        { x, y: y + h - chamfer },
        { x, y: y + chamfer }
      ];
      pts.closed = true;
      return pts;
    }

    if (signStyle === 'arrow') {
      const tip = Math.min(w * 0.22, h * 0.65);
      const pts = [
        { x, y },
        { x: x + w - tip, y },
        { x: x + w, y: y + h / 2 },
        { x: x + w - tip, y: y + h },
        { x, y: y + h }
      ];
      pts.closed = true;
      return pts;
    }

    if (signStyle === 'plaque') {
      // Classic Victorian plaque with curved side ears
      const earW = Math.min(14, w * 0.12);
      const pts = [];
      pts.push({ x: x + earW, y });
      pts.push({ x: x + w - earW, y });
      // Right ear arc
      for (let i = 0; i <= 20; i++) {
        const a = -Math.PI / 2 + (i / 20) * Math.PI;
        pts.push({
          x: x + w - earW + Math.cos(a) * earW,
          y: y + h / 2 + Math.sin(a) * (h * 0.36)
        });
      }
      pts.push({ x: x + w - earW, y: y + h });
      pts.push({ x: x + earW, y: y + h });
      // Left ear arc
      for (let i = 0; i <= 20; i++) {
        const a = Math.PI / 2 + (i / 20) * Math.PI;
        pts.push({
          x: x + earW + Math.cos(a) * earW,
          y: y + h / 2 + Math.sin(a) * (h * 0.36)
        });
      }
      pts.closed = true;
      return pts;
    }

    // Default: rounded rectangle
    const r = clamp(rx - inset, 0, Math.min(w, h) / 2);
    if (r <= 0.2) {
      const pts = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
      pts.closed = true;
      return pts;
    }
    const pts = [];
    const corners = [
      { cx: x + w - r, cy: y + r, s: -Math.PI / 2, e: 0 },
      { cx: x + w - r, cy: y + h - r, s: 0, e: Math.PI / 2 },
      { cx: x + r, cy: y + h - r, s: Math.PI / 2, e: Math.PI },
      { cx: x + r, cy: y + r, s: Math.PI, e: Math.PI * 1.5 }
    ];
    for (const c of corners) {
      for (let i = 0; i <= 10; i++) {
        const a = c.s + (c.e - c.s) * (i / 10);
        pts.push({ x: c.cx + Math.cos(a) * r, y: c.cy + Math.sin(a) * r });
      }
    }
    pts.closed = true;
    return pts;
  };

  let outerLoops = [buildPlateContour(0)];

  // Mounting holes
  const margin = Math.max(holeR + 3.5, 6);
  if (holeMode === 'keyring-ear') {
    const earOuter = [makeCircle(ox, oy + H / 2, holeR + 3.2, 40)];
    const earHole = [makeCircle(ox, oy + H / 2, holeR, 32)];
    outerLoops = booleanMultiPolygons(outerLoops, earOuter, 'union');
    outerLoops = booleanMultiPolygons(outerLoops, earHole, 'subtract');
  } else if (holeMode === 'hole-left') {
    outerLoops.push(makeCircle(ox + margin, oy + H / 2, holeR));
  } else if (holeMode === 'holes-2') {
    outerLoops.push(
      makeCircle(ox + margin, oy + H / 2, holeR),
      makeCircle(ox + W - margin, oy + H / 2, holeR)
    );
  } else if (holeMode === 'holes-4') {
    outerLoops.push(
      makeCircle(ox + margin, oy + margin, holeR),
      makeCircle(ox + W - margin, oy + margin, holeR),
      makeCircle(ox + W - margin, oy + H - margin, holeR),
      makeCircle(ox + margin, oy + H - margin, holeR)
    );
  }

  const shapes = [];
  shapes.push(createPathShapeFromPolygons(outerLoops, 'cut', `Skilt ytterkant (${roundMm(W)}×${roundMm(H)} mm)`));

  // Optional inner decorative Score border
  if (innerBorder && W > 24 && H > 16) {
    const borderLoop = buildPlateContour(3.5);
    shapes.push(createPathShapeFromPolygons([borderLoop], 'score', 'Skilt pynteramme (Score)'));
  }

  // Optional decorative icon on the left side
  let textCenterX = ox + W / 2;
  if (iconId && iconId !== 'none') {
    const iconDef = LASER_ICONS.find(ic => ic.id === iconId);
    if (iconDef) {
      const iconSize = Math.min(H * 0.56, W * 0.25);
      const iconX = ox + (holeMode === 'hole-left' || holeMode === 'holes-2' ? margin + holeR + 5 : 10);
      const iconY = oy + (H - iconSize) / 2;
      const iconShape = createIconShape(iconDef, iconX, iconY, iconSize, 'engrave');
      shapes.push(iconShape);
      textCenterX = ox + W * 0.57;
    }
  }

  // Headline & Subtitle
  const cleanHead = String(headline || '').trim();
  const cleanSub = String(subtitle || '').trim();
  if (cleanHead) {
    const headSize = cleanSub ? Math.min(H * 0.3, (W * 0.72) / Math.max(4, cleanHead.length * 0.72)) : Math.min(H * 0.44, (W * 0.76) / Math.max(4, cleanHead.length * 0.72));
    const headShape = createTextShape({
      x: ox,
      y: oy,
      text: cleanHead,
      fontKey,
      fontSizeMm: roundMm(clamp(headSize, 4, 80), 1),
      spacingMm: 1.0,
      laserMode: fontKey === 'stencil' ? 'cut' : 'engrave'
    });
    headShape.x = roundMm(textCenterX - headShape.width / 2, 2);
    headShape.y = roundMm(cleanSub ? oy + H * 0.36 - headShape.height / 2 : oy + H / 2 - headShape.height / 2, 2);
    shapes.push(headShape);
  }

  if (cleanSub) {
    const subSize = Math.min(H * 0.17, (W * 0.68) / Math.max(5, cleanSub.length * 0.7));
    const subFont = (fontKey === 'stencil' || fontKey === 'singleline') ? fontKey : 'sans-bold';
    const subShape = createTextShape({
      x: ox,
      y: oy,
      text: cleanSub,
      fontKey: subFont,
      fontSizeMm: roundMm(clamp(subSize, 3.5, 40), 1),
      spacingMm: 1.2,
      laserMode: fontKey === 'stencil' ? 'cut' : (fontKey === 'singleline' ? 'score' : 'engrave')
    });
    subShape.x = roundMm(textCenterX - subShape.width / 2, 2);
    subShape.y = roundMm(oy + H * 0.7 - subShape.height / 2, 2);
    shapes.push(subShape);
  }

  return shapes;
}

// ============================================================================
// 3. JIGSAW PUZZLE GENERATOR ("PUSLESPILL-GENERATOR")
// ============================================================================

export { generateJigsawPuzzle } from './puzzle-generator.js';

// ============================================================================
// 4. TRUE INVOLUTE SPUR GEAR GENERATOR ("TANNHJUL-GENERATOR")
// ============================================================================

/**
 * Generates mathematically accurate Involute Spur Gear polygon loops.
 * Any two gears with the same `moduleMm` and `pressureAngleDeg` mesh accurately!
 */
export function buildSingleInvoluteGearLoops({
  cx = 60,
  cy = 60,
  moduleMm = 2.5,
  teeth = 16,
  pressureAngleDeg = 20,
  boreDiamMm = 5.0,
  spokeCount = 0,
  rotationOffsetRad = 0
} = {}) {
  const m = clamp(Number(moduleMm) || 2.5, 0.8, 12);
  const N = clamp(Math.round(Number(teeth) || 16), 6, 120);
  const alpha = clamp(Number(pressureAngleDeg) || 20, 14.5, 25) * (Math.PI / 180);

  const pitchRadius = (m * N) / 2;
  const baseRadius = pitchRadius * Math.cos(alpha);
  const addendum = m;
  const dedendum = 1.2 * m;
  const outerRadius = pitchRadius + addendum;
  const rootRadius = Math.max(1.5, pitchRadius - dedendum);

  // Involute function inv(phi) = tan(phi) - phi
  const invAlpha = Math.tan(alpha) - alpha;
  // Half tooth angular thickness at pitch circle
  const halfToothAnglePitch = Math.PI / (2 * N);
  // Half tooth angular thickness at base circle
  const halfToothAngleBase = halfToothAnglePitch + invAlpha;

  const maxPhi = Math.acos(clamp(baseRadius / outerRadius, 0, 1));
  const involuteSteps = 8;

  const gearOutline = [];
  for (let i = 0; i < N; i++) {
    const centerAngle = rotationOffsetRad + (i * 2 * Math.PI) / N;

    // Left flank (from root -> base -> outer)
    const leftPts = [];
    if (rootRadius < baseRadius) {
      const rootA = centerAngle - halfToothAngleBase;
      leftPts.push({
        x: cx + Math.cos(rootA) * rootRadius,
        y: cy + Math.sin(rootA) * rootRadius
      });
    }
    for (let s = 0; s <= involuteSteps; s++) {
      const phi = (s / involuteSteps) * maxPhi;
      const r = baseRadius / Math.cos(phi);
      if (r < rootRadius) continue;
      const invPhi = Math.tan(phi) - phi;
      const a = centerAngle - halfToothAngleBase + invPhi;
      leftPts.push({
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r
      });
    }

    // Right flank (from outer -> base -> root)
    const rightPts = [];
    for (let s = involuteSteps; s >= 0; s--) {
      const phi = (s / involuteSteps) * maxPhi;
      const r = baseRadius / Math.cos(phi);
      if (r < rootRadius) continue;
      const invPhi = Math.tan(phi) - phi;
      const a = centerAngle + halfToothAngleBase - invPhi;
      rightPts.push({
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r
      });
    }
    if (rootRadius < baseRadius) {
      const rootA = centerAngle + halfToothAngleBase;
      rightPts.push({
        x: cx + Math.cos(rootA) * rootRadius,
        y: cy + Math.sin(rootA) * rootRadius
      });
    }

    gearOutline.push(...leftPts, ...rightPts);
  }
  gearOutline.closed = true;

  const loops = [gearOutline];

  // Center axle bore hole
  const boreR = clamp((Number(boreDiamMm) || 0) / 2, 0, rootRadius * 0.7);
  if (boreR >= 0.4) {
    const hole = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      hole.push({ x: cx + Math.cos(a) * boreR, y: cy + Math.sin(a) * boreR });
    }
    hole.closed = true;
    loops.push(hole);
  }

  // Lightening holes / spokes in gear web
  const spokes = clamp(Math.round(Number(spokeCount) || 0), 0, 10);
  const webInnerR = boreR + Math.max(3, m * 1.4);
  const webOuterR = rootRadius - Math.max(3, m * 1.5);
  if (spokes >= 3 && webOuterR - webInnerR >= 4) {
    const ringMidR = (webInnerR + webOuterR) / 2;
    const holeR = Math.min((webOuterR - webInnerR) * 0.46, (Math.PI * ringMidR) / spokes * 0.58);
    if (holeR >= 1.8) {
      for (let k = 0; k < spokes; k++) {
        const ka = rotationOffsetRad + (k * 2 * Math.PI) / spokes;
        const hcx = cx + Math.cos(ka) * ringMidR;
        const hcy = cy + Math.sin(ka) * ringMidR;
        const sHole = [];
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2;
          sHole.push({ x: hcx + Math.cos(a) * holeR, y: hcy + Math.sin(a) * holeR });
        }
        sHole.closed = true;
        loops.push(sHole);
      }
    }
  }

  return { loops, pitchRadius, outerRadius, rootRadius };
}

export function generateInvoluteGears({
  mode = 'pair',          // 'single' | 'pair'
  moduleMm = 2.5,
  teeth1 = 14,
  teeth2 = 24,
  boreDiamMm = 5.0,
  spokeCount = 5,
  showPitchGuides = true
} = {}) {
  const m = clamp(Number(moduleMm) || 2.5, 0.8, 12);
  const N1 = clamp(Math.round(Number(teeth1) || 14), 6, 100);
  const N2 = clamp(Math.round(Number(teeth2) || 24), 6, 100);

  const r1 = (m * N1) / 2;
  const r2 = (m * N2) / 2;
  const c1x = 20 + r1 + m * 2;
  const c1y = 20 + Math.max(r1, mode === 'pair' ? r2 : r1) + m * 2;

  const shapes = [];

  // Gear 1
  const g1 = buildSingleInvoluteGearLoops({
    cx: c1x,
    cy: c1y,
    moduleMm: m,
    teeth: N1,
    boreDiamMm,
    spokeCount: N1 >= 16 ? spokeCount : 0,
    rotationOffsetRad: 0
  });
  shapes.push(
    createPathShapeFromPolygons(g1.loops, 'cut', `Tannhjul 1 (Z=${N1}, Modul=${m}mm, Øp=${roundMm(r1 * 2)}mm)`)
  );

  // Pitch circle guide for Gear 1
  if (showPitchGuides) {
    shapes.push({
      id: uid('guide'),
      type: 'ellipse',
      name: `Delehjulssirkel Z=${N1} (Ø ${roundMm(r1 * 2, 1)} mm)`,
      laserMode: 'guide',
      x: roundMm(c1x - r1, 2),
      y: roundMm(c1y - r1, 2),
      width: roundMm(r1 * 2, 2),
      height: roundMm(r1 * 2, 2),
      rotation: 0
    });
  }

  // Gear 2 (Meshing partner at exact center distance C = r1 + r2)
  if (mode === 'pair') {
    const centerDist = r1 + r2;
    const c2x = c1x + centerDist;
    const c2y = c1y;
    // Phase offset so tooth of Gear 1 meshes into valley of Gear 2
    const phaseRad = Math.PI + (Math.PI / N2);
    const g2 = buildSingleInvoluteGearLoops({
      cx: c2x,
      cy: c2y,
      moduleMm: m,
      teeth: N2,
      boreDiamMm,
      spokeCount: N2 >= 16 ? spokeCount : 0,
      rotationOffsetRad: phaseRad
    });
    shapes.push(
      createPathShapeFromPolygons(g2.loops, 'cut', `Tannhjul 2 (Z=${N2}, Modul=${m}mm, Øp=${roundMm(r2 * 2)}mm)`)
    );

    if (showPitchGuides) {
      shapes.push({
        id: uid('guide'),
        type: 'ellipse',
        name: `Delehjulssirkel Z=${N2} (Ø ${roundMm(r2 * 2, 1)} mm)`,
        laserMode: 'guide',
        x: roundMm(c2x - r2, 2),
        y: roundMm(c2y - r2, 2),
        width: roundMm(r2 * 2, 2),
        height: roundMm(r2 * 2, 2),
        rotation: 0
      });
      // Center-to-center axle line guide
      shapes.push({
        id: uid('guide'),
        type: 'line',
        name: `Senteravstand akslinger: ${roundMm(centerDist, 2)} mm`,
        laserMode: 'guide',
        x: c1x,
        y: c1y,
        width: centerDist,
        height: 0.1,
        x1: c1x,
        y1: c1y,
        x2: c2x,
        y2: c2y,
        rotation: 0
      });
    }
  }

  return shapes;
}

// ============================================================================
// 5. SNOWFLAKE, MANDALA & ORNAMENT GENERATOR ("DEKOR & MANDALA")
// ============================================================================

export function generateMandalaOrnament({
  style = 'snowflake',    // 'snowflake' | 'mandala' | 'coaster' | 'starburst'
  diameterMm = 85,
  arms = 6,
  complexity = 3,
  hangingLoop = true
} = {}) {
  const D = clamp(Number(diameterMm) || 85, 25, 400);
  const R = D / 2;
  const N = clamp(Math.round(Number(arms) || 6), 4, 16);
  const comp = clamp(Math.round(Number(complexity) || 3), 1, 5);
  const cx = 20 + R;
  const cy = 24 + R;

  const makeRectArm = (rStart, rEnd, width, angleRad) => {
    const hw = width / 2;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const nx = -sin;
    const ny = cos;
    const pts = [
      { x: cx + cos * rStart + nx * hw, y: cy + sin * rStart + ny * hw },
      { x: cx + cos * rEnd + nx * (hw * 0.7), y: cy + sin * rEnd + ny * (hw * 0.7) },
      { x: cx + cos * (rEnd + width * 0.6), y: cy + sin * (rEnd + width * 0.6) },
      { x: cx + cos * rEnd - nx * (hw * 0.7), y: cy + sin * rEnd - ny * (hw * 0.7) },
      { x: cx + cos * rStart - nx * hw, y: cy + sin * rStart - ny * hw }
    ];
    pts.closed = true;
    return pts;
  };

  const makeCircle = (x, y, r, steps = 40) => {
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    }
    pts.closed = true;
    return pts;
  };

  let accLoops = [];

  if (style === 'snowflake') {
    const stemW = Math.max(3.2, R * 0.09);
    accLoops = [makeCircle(cx, cy, R * 0.22, 32)];

    for (let i = 0; i < N; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / N;
      accLoops = booleanMultiPolygons(accLoops, [makeRectArm(R * 0.1, R * 0.94, stemW, a)], 'union');

      // Side branches along each snowflake arm
      for (let b = 1; b <= comp; b++) {
        const frac = 0.32 + (b / (comp + 1)) * 0.52;
        const brOriginX = cx + Math.cos(a) * (R * frac);
        const brOriginY = cy + Math.sin(a) * (R * frac);
        const brLen = R * (0.36 - b * 0.05);
        const brW = stemW * 0.78;

        for (const side of [-1, 1]) {
          const ba = a + side * (Math.PI / 3);
          const cos = Math.cos(ba);
          const sin = Math.sin(ba);
          const nx = -sin * (brW / 2);
          const ny = cos * (brW / 2);
          const branch = [
            { x: brOriginX + nx, y: brOriginY + ny },
            { x: brOriginX + cos * brLen + nx * 0.7, y: brOriginY + sin * brLen + ny * 0.7 },
            { x: brOriginX + cos * (brLen + brW * 0.5), y: brOriginY + sin * (brLen + brW * 0.5) },
            { x: brOriginX + cos * brLen - nx * 0.7, y: brOriginY + sin * brLen - ny * 0.7 },
            { x: brOriginX - nx, y: brOriginY - ny }
          ];
          branch.closed = true;
          accLoops = booleanMultiPolygons(accLoops, [branch], 'union');
        }
      }
    }
    // Center hexagon/circle cutout
    accLoops = booleanMultiPolygons(accLoops, [makeCircle(cx, cy, R * 0.09, N * 2)], 'subtract');
  } else if (style === 'mandala' || style === 'coaster') {
    // Scalloped outer petal disc with geometric radial cutouts
    const outerPts = [];
    const totalSteps = N * 24;
    for (let i = 0; i < totalSteps; i++) {
      const a = (i / totalSteps) * Math.PI * 2;
      const wave = style === 'coaster' ? Math.cos(a * N) * (R * 0.04) : Math.abs(Math.cos((a * N) / 2)) * (R * 0.14);
      const r = R * 0.86 + wave;
      outerPts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    outerPts.closed = true;
    accLoops = [outerPts];

    // Add concentric decorative diamond/teardrop cutouts
    for (let ring = 1; ring <= Math.min(3, comp); ring++) {
      const ringR = R * (0.24 * ring);
      const petalW = (Math.PI * ringR) / N * 0.52;
      const petalLen = R * 0.14;
      for (let i = 0; i < N; i++) {
        const a = -Math.PI / 2 + ((i + (ring % 2) * 0.5) * 2 * Math.PI) / N;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const nx = -sin * petalW * 0.5;
        const ny = cos * petalW * 0.5;
        const diamond = [
          { x: cx + cos * (ringR - petalLen), y: cy + sin * (ringR - petalLen) },
          { x: cx + cos * ringR + nx, y: cy + sin * ringR + ny },
          { x: cx + cos * (ringR + petalLen), y: cy + sin * (ringR + petalLen) },
          { x: cx + cos * ringR - nx, y: cy + sin * ringR - ny }
        ];
        diamond.closed = true;
        accLoops = booleanMultiPolygons(accLoops, [diamond], 'subtract');
      }
    }
    accLoops = booleanMultiPolygons(accLoops, [makeCircle(cx, cy, R * 0.08, N * 2)], 'subtract');
  } else {
    // Starburst ornament
    const pts = [];
    for (let i = 0; i < N * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / N;
      const r = i % 2 === 0 ? R : R * (0.35 + comp * 0.05);
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    pts.closed = true;
    accLoops = [pts];
    accLoops = booleanMultiPolygons(accLoops, [makeCircle(cx, cy, R * 0.14, N)], 'subtract');
  }

  // Optional hanging loop welded to the top of the ornament
  if (hangingLoop) {
    const bbox = computePolygonsBBox(accLoops);
    const topY = bbox.y + 1.5;
    const earOuter = [makeCircle(cx, topY - 3, 5.2, 32)];
    const earInner = [makeCircle(cx, topY - 3, 2.2, 24)];
    accLoops = booleanMultiPolygons(accLoops, earOuter, 'union');
    accLoops = booleanMultiPolygons(accLoops, earInner, 'subtract');
  }

  return [createPathShapeFromPolygons(accLoops, 'cut', `Dekor / Mandala (Ø ${roundMm(D)} mm)`)];
}

// ============================================================================
// 6. INTERACTIVE MODAL UI CONTROLLER FOR ALL GENERATORS
// ============================================================================

export function renderShapesPreviewSvg(shapes, { strokeScale = 0.0045 } = {}) {
  if (!shapes || shapes.length === 0) return '<svg></svg>';
  const allLoops = [];
  for (const s of shapes) {
    if (s.d) {
      // Quick bounds from shape x/y/w/h
      allLoops.push([
        { x: s.x, y: s.y },
        { x: s.x + s.width, y: s.y + s.height }
      ]);
    } else {
      allLoops.push([
        { x: s.x, y: s.y },
        { x: s.x + (s.width || 10), y: s.y + (s.height || 10) }
      ]);
    }
  }
  const bbox = computePolygonsBBox(allLoops);
  const pad = Math.max(bbox.width, bbox.height) * 0.08 + 6;
  const vx = bbox.x - pad;
  const vy = bbox.y - pad;
  const vw = bbox.width + pad * 2;
  const vh = bbox.height + pad * 2;
  const strokeW = Math.max(vw, vh) * strokeScale;

  const renderOne = (s) => {
    if (s.type === 'group' && Array.isArray(s.children)) {
      return s.children.map(renderOne).join('\n');
    }
    if (s.type === 'image' && (s.dataUrl || s.srcDataUrl)) {
      const href = s.dataUrl || s.srcDataUrl;
      const cx=s.x+s.width/2,cy=s.y+s.height/2;
      const transform=`rotate(${s.rotation||0} ${cx} ${cy}) translate(${cx} ${cy}) scale(${s.flipX?-1:1} ${s.flipY?-1:1}) translate(${-cx} ${-cy})`;
      return `<image x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" preserveAspectRatio="none" transform="${transform}" href="${href}" />`;
    }
    if (s.guideLabel && s.laserMode === 'guide') {
      const text = String(s.textMeta?.text || s.name).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[c]));
      const cx = s.x + s.width / 2, cy = s.y + s.height / 2;
      return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif" font-size="${s.height * 1.25}" font-weight="600" fill="#047857" transform="rotate(${s.rotation || 0} ${cx} ${cy})">${text}</text>`;
    }
    const color = getCutStage(s)?.color || (
      s.laserMode === 'cut' ? '#ff1e1e' :
      s.laserMode === 'score' ? '#3b82f6' :
      s.laserMode === 'guide' ? '#10b981' : '#111827');
    const fill = s.laserMode === 'engrave' ? '#111827' : 'none';
    const dash = s.laserMode === 'guide' && s.type !== 'text' ? `stroke-dasharray="${strokeW * 3},${strokeW * 2}"` : '';
    const sw = s.laserMode === 'engrave' ? 0 : strokeW;

    if (s.type === 'rect') {
      return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" rx="${s.rx || 0}" fill="${fill}" stroke="${color}" stroke-width="${sw}" ${dash}/>`;
    }
    if (s.type === 'ellipse') {
      return `<ellipse cx="${s.x + s.width / 2}" cy="${s.y + s.height / 2}" rx="${s.width / 2}" ry="${s.height / 2}" fill="${fill}" stroke="${color}" stroke-width="${sw}" ${dash}/>`;
    }
    if (s.type === 'line') {
      return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${color}" stroke-width="${sw}" ${dash}/>`;
    }
    if (s.d) {
      return `<path d="${shapeToWorldSvgPath(s)}" fill="${fill}" fill-rule="evenodd" stroke="${color}" stroke-width="${sw}" ${dash}/>`;
    }
    return '';
  };

  const elements = shapes.map(renderOne).join('\n');

  return {
    svgHtml: `<svg viewBox="${vx} ${vy} ${vw} ${vh}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="#f8fafc" rx="4"/>
      ${elements}
    </svg>`,
    bbox
  };
}
