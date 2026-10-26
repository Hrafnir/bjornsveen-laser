import { uid, roundMm, shapeToWorldPolygons, createPathShapeFromPolygons, computePolygonsBBox, polygonsToSvgPath, pointInMultiPolygon } from './geometry.js';
import { createTextShape } from './fonts.js';

export const BOX_TYPES = [
  { id: 'open', name: 'Åpen boks', note: 'Fem deler. Lim fingerskjøtene etter prøvemontering.' },
  { id: 'lid', name: 'Boks med løst lokk', note: 'Lim sentreringsplaten midt under lokket. Klaringen gjør lokket avtakbart.' },
  { id: 'sliding', name: 'Boks med skyvelokk', note: 'Fire skinner limes på innsiden av sideveggene. Bruk lokket som avstandsmal, med valgt klaring over lokket. Den lave fronten er åpningen.' },
  { id: 'hinged', name: 'Boks med hengsellokk', note: 'For to løse, utvendige hengsler mellom bakvegg og lokk. Hullmål må passe hengslene dine; skruer/hengsler følger ikke med i kuttefilen.' },
  { id: 'tray', name: 'Brett med bærehåndtak', note: 'Åpen boks med avrundede håndtakshull i kortsidene.' },
  { id: 'dividers', name: 'Sorteringsboks med rom', note: 'Skilleveggene tres sammen halv-i-halv. Ved rom i bare én retning må skilleveggene limes fast.' },
  { id: 'closed', name: 'Lukket boks med fast topp', note: 'Seks deler med fingerskjøter. Toppen monteres sammen med veggene og er ikke et avtakbart lokk.' }
];
const EPS = 1e-8;
const pt = (x, y) => ({ x, y });
const rect = (w, h) => [pt(0, 0), pt(w, 0), pt(w, h), pt(0, h)];
const area = loop => loop.reduce((a, p, i) => { const q = loop[(i + 1) % loop.length]; return a + p.x * q.y - q.x * p.y; }, 0) / 2;

function numberOption(options, key, fallback, min, max) {
  const labels = { thicknessMm: 'Materialtykkelse', kerfMm: 'Snittbredde', fingerWidthMm: 'Tappbredde', lidClearanceMm: 'Klaring', partGapMm: 'Avstand mellom delene', lengthMm: 'Lengde', widthMm: 'Bredde', heightMm: 'Høyde', hingeHoleSpacingMm: 'Hullavstand', hingeSetbackMm: 'Hullrad fra kant', hingeHoleDiameterMm: 'Hulldiameter' };
  const value = Number(options[key] ?? fallback);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${labels[key] || key}: velg en verdi mellom ${min} og ${max} mm.`);
  return value;
}
function countOption(options, key, fallback) {
  const value = Number(options[key] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 12) throw new Error('Antall rom må være et heltall fra 1 til 12.');
  return value;
}

export function cleanBoxLoop(points) {
  let loop = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > EPS);
  if (Math.hypot(loop[0].x - loop.at(-1).x, loop[0].y - loop.at(-1).y) < EPS) loop.pop();
  let changed = true;
  while (changed && loop.length > 3) {
    changed = false;
    loop = loop.filter((p, i, all) => {
      const a = all[(i + all.length - 1) % all.length], b = all[(i + 1) % all.length];
      const cross = (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x);
      const dot = (p.x - a.x) * (b.x - p.x) + (p.y - a.y) * (b.y - p.y);
      if (Math.abs(cross) < EPS && dot >= 0) { changed = true; return false; }
      return true;
    });
  }
  loop.closed = true;
  return loop;
}

// Analytic miter offset, in mm. Positive expands material; holes use a negative
// distance. Unlike the generic raster offset, this preserves square finger corners.
export function offsetBoxLoop(points, distance) {
  const loop = cleanBoxLoop(points);
  if (!distance) return loop;
  const sign = area(loop) > 0 ? 1 : -1;
  return cleanBoxLoop(loop.map((p, i) => {
    const prev = loop[(i + loop.length - 1) % loop.length], next = loop[(i + 1) % loop.length];
    const a = pt(p.x - prev.x, p.y - prev.y), b = pt(next.x - p.x, next.y - p.y);
    const al = Math.hypot(a.x, a.y), bl = Math.hypot(b.x, b.y);
    const n1 = pt(sign * a.y / al, -sign * a.x / al), n2 = pt(sign * b.y / bl, -sign * b.x / bl);
    const q = pt(p.x + n1.x * distance, p.y + n1.y * distance);
    const r = pt(p.x + n2.x * distance, p.y + n2.y * distance);
    const cross = a.x * b.y - a.y * b.x;
    if (Math.abs(cross) < EPS) throw new Error('Ugyldig kontur: en kant går tilbake over seg selv.');
    const u = ((r.x - q.x) * b.y - (r.y - q.y) * b.x) / cross;
    return pt(q.x + u * a.x, q.y + u * a.y);
  }));
}

// Shared physical span, identical on both mating faces. Odd symmetric segments
// make front/back and left/right interchangeable. End margins reserve the corner
// cubes for the base/top, avoiding three-way corner collisions.
function fingerProfile(length, from, to, t, target, startsFull) {
  const span = to - from;
  if (span < 3 * t - EPS) throw new Error('Boksen er for liten for materialtykkelsen. Øk målene eller bruk tynnere materiale.');
  let count = Math.max(3, Math.round(span / target));
  if (count % 2 === 0) count++;
  while (count > 3 && span / count < t) count -= 2;
  return Array.from({ length: count }, (_, i) => ({
    start: i ? from + span * i / count : 0,
    end: i === count - 1 ? length : from + span * (i + 1) / count,
    inset: (i % 2 === 0) === startsFull ? 0 : t
  }));
}
const flat = length => [{ start: 0, end: length, inset: 0 }];
function panelLoop(w, h, profiles) {
  const [top, right, bottom, left] = profiles;
  const edges = [
    top.flatMap(r => [pt(r.start, r.inset), pt(r.end, r.inset)]),
    right.flatMap(r => [pt(w - r.inset, r.start), pt(w - r.inset, r.end)]),
    bottom.flatMap(r => [pt(r.start, h - r.inset), pt(r.end, h - r.inset)]).reverse(),
    left.flatMap(r => [pt(r.inset, r.start), pt(r.inset, r.end)]).reverse()
  ];
  // Intersect adjacent terminal edges. Concatenating their untrimmed endpoints
  // used to draw diagonal cuts and small triangular gaps at the panel corners.
  for (let i = 0; i < 4; i++) {
    const prev = edges[(i + 3) % 4], current = edges[i];
    const p = i % 2 === 0 ? pt(prev.at(-1).x, current[0].y) : pt(current[0].x, prev.at(-1).y);
    prev[prev.length - 1] = p; current[0] = p;
  }
  return cleanBoxLoop(edges.flat());
}
function circle(cx, cy, radius) {
  return Array.from({ length: 96 }, (_, i) => pt(cx + radius * Math.cos(i * Math.PI / 48), cy + radius * Math.sin(i * Math.PI / 48)));
}
function roundedHole(cx, cy, w, h) {
  const r = h / 2;
  return Array.from({ length: 66 }, (_, i) => {
    const side = i < 33 ? 1 : -1, angle = side === 1 ? -Math.PI / 2 + (i / 32) * Math.PI : Math.PI / 2 + ((i - 33) / 32) * Math.PI;
    return pt(cx + side * (w / 2 - r) + r * Math.cos(angle), cy + r * Math.sin(angle));
  });
}
function dividerLoop(w, h, centers, slotWidth, fromTop) {
  const top = [pt(0, 0)];
  for (const center of centers) top.push(pt(center - slotWidth / 2, 0), pt(center - slotWidth / 2, h / 2), pt(center + slotWidth / 2, h / 2), pt(center + slotWidth / 2, 0));
  top.push(pt(w, 0), pt(w, h), pt(0, h));
  return cleanBoxLoop(fromTop ? top : top.map(p => pt(p.x, h - p.y)).reverse());
}

function validatePartHoles(part) {
  const segmentCrosses = (a, b, c, d) => {
    const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return cross(a, b, c) * cross(a, b, d) < -EPS && cross(c, d, a) * cross(c, d, b) < -EPS;
  };
  const crosses = (a, b) => a.some((p, i) => b.some((q, j) => segmentCrosses(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length])));
  for (let i = 0; i < part.holes.length; i++) {
    const hole = part.holes[i];
    if (!hole.every(p => pointInMultiPolygon(p, [part.outline])) || crosses(hole, part.outline)) throw new Error(`Hullene i ${part.name} kommer utenfor delen. Juster hullmål eller øk boksen.`);
    for (let j = 0; j < i; j++) {
      const other = part.holes[j];
      if (crosses(hole, other) || pointInMultiPolygon(hole[0], [other]) || pointInMultiPolygon(other[0], [hole])) throw new Error(`Hull i ${part.name} overlapper. Flytt hengselhullene eller slå av fingerhullet.`);
    }
  }
}

export function buildBoxModel(options = {}) {
  const type = options.boxType ?? 'open';
  if (!BOX_TYPES.some(b => b.id === type)) throw new Error('Ukjent bokstype.');
  const t = numberOption(options, 'thicknessMm', 3, 0.5, 25);
  const kerf = numberOption(options, 'kerfMm', 0.08, 0, Math.min(1, t / 3));
  const finger = numberOption(options, 'fingerWidthMm', 14, t, 80);
  const clearance = numberOption(options, 'lidClearanceMm', 0.2, 0.05, Math.min(1, t / 2));
  const gap = numberOption(options, 'partGapMm', 6, 2, 30);
  const jointTop = type === 'closed', overlay = ['lid', 'hinged'].includes(type), sliding = type === 'sliding';
  const roof = type === 'lid' ? 2 * t : sliding ? 2 * t + clearance : (jointTop || overlay) ? t : 0;
  let L = numberOption(options, 'lengthMm', 120, 20, 900);
  let W = numberOption(options, 'widthMm', 85, 20, 900);
  let H = numberOption(options, 'heightMm', 55, 15, 500);
  if (options.dimMode === 'inner') { L += 2 * t; W += 2 * t; H += t + roof; }
  else if (options.dimMode && options.dimMode !== 'outer') throw new Error('Velg indre eller ytre mål.');
  const B = H - (overlay ? t : 0), frontH = sliding ? H - 2 * t - clearance : B;
  const inner = { length: L - 2 * t, width: W - 2 * t, height: H - t - roof };
  if (inner.height <= t || L < 5 * t || W < 5 * t) throw new Error('Det er for lite plass inni boksen for denne materialtykkelsen.');
  const topMargin = jointTop ? t : 0;
  const alongL = full => fingerProfile(L, t, L - t, t, finger, full);
  const alongW = full => fingerProfile(W, t, W - t, t, finger, full);
  const vertical = (height, full) => fingerProfile(height, topMargin, height - t, t, finger, full);
  const parts = [];
  const add = (id, name, width, height, outline, holes = [], face = null) => {
    const part = { id, name, width, height, outline: cleanBoxLoop(outline), holes: holes.map(cleanBoxLoop), face };
    parts.push(part); return part;
  };
  add('bottom', 'Bunn', L, W, panelLoop(L, W, [alongL(true), alongW(true), alongL(true), alongW(true)]), [], 'bottom');
  add('back', 'Bakvegg', L, B, panelLoop(L, B, [jointTop ? alongL(false) : flat(L), vertical(B, true), alongL(false), vertical(B, true)]), [], 'back');
  add('front', 'Frontvegg', L, frontH, panelLoop(L, frontH, [jointTop ? alongL(false) : flat(L), vertical(frontH, true), alongL(false), vertical(frontH, true)]), [], 'front');
  let frontSide = vertical(B, false);
  if (sliding) {
    const delta = B - frontH;
    frontSide = [{ start: 0, end: delta, inset: 0 }, ...vertical(frontH, false).map(r => ({ ...r, start: r.start + delta, end: r.end + delta }))];
  }
  for (const [id, name] of [['left', 'Venstre side'], ['right', 'Høyre side']]) {
    // Both side panels are drawn front-to-back (same physical edge coordinate).
    add(id, name, W, B, panelLoop(W, B, [jointTop ? alongW(false) : flat(W), vertical(B, false), alongW(false), frontSide]), [], id);
  }
  if (jointTop) add('top', 'Fast topp', L, W, panelLoop(L, W, [alongL(true), alongW(true), alongL(true), alongW(true)]), [], 'top');
  if (overlay) add('lid', 'Lokk', L, W, rect(L, W));
  if (type === 'lid') add('locator', 'Sentreringsplate – lim under lokket', inner.length - 2 * clearance, inner.width - 2 * clearance, rect(inner.length - 2 * clearance, inner.width - 2 * clearance));
  if (sliding) {
    add('lid', 'Skyvelokk', inner.length - 2 * clearance, W - t - clearance, rect(inner.length - 2 * clearance, W - t - clearance));
    for (const id of ['left-lower', 'right-lower', 'left-upper', 'right-upper']) add('rail-' + id, 'Skinne ' + ({'left-lower':'venstre nedre','right-lower':'høyre nedre','left-upper':'venstre øvre','right-upper':'høyre øvre'}[id]), inner.width, t, rect(inner.width, t));
  }
  const lid = parts.find(p => p.id === 'lid');
  if (lid && options.fingerHoleLid !== false) {
    const r = Math.min(8, (Math.min(lid.width, lid.height) - 4 * t) / 4);
    if (r < 1.5) throw new Error('Lokket er for lite til fingerhullet. Slå av fingerhull eller øk boksen.');
    const cx = lid.width / 2, cy = lid.height / 2;
    lid.holes.push(circle(cx, cy, r));
    const locator = parts.find(p => p.id === 'locator');
    if (locator) locator.holes.push(circle(locator.width / 2, locator.height / 2, r));
  }
  if (type === 'tray') {
    const holeH = Math.min(16, B - 4 * t), holeW = Math.min(50, W - 6 * t);
    if (holeH < 6 || holeW < holeH + 6) throw new Error('Boksen er for liten til bærehåndtak. Øk bredde/høyde eller velg åpen boks.');
    for (const part of parts.filter(p => ['left', 'right'].includes(p.id))) part.holes.push(roundedHole(W / 2, 2 * t + holeH / 2, holeW, holeH));
  }
  if (type === 'hinged' && options.hingeHoles !== false) {
    const spacing = numberOption(options, 'hingeHoleSpacingMm', 12, 4, 80);
    const setback = numberOption(options, 'hingeSetbackMm', 8, 2, 40);
    const radius = numberOption(options, 'hingeHoleDiameterMm', 3, 1, 8) / 2;
    const back = parts.find(p => p.id === 'back');
    if (L / 4 - spacing / 2 - radius < 2 * t || spacing + 2 * radius >= L / 2 || setback - radius < t || setback + radius > Math.min(B, W) - 2 * t) throw new Error('Hengselhullene kommer for nær fingerskjøtene. Juster hullmål eller øk boksen.');
    for (const center of [L / 4, 3 * L / 4]) for (const x of [center - spacing / 2, center + spacing / 2]) {
      back.holes.push(circle(x, setback, radius));
      lid.holes.push(circle(x, W - setback, radius));
    }
  }
  const hasDividers = type === 'dividers' || options.addDividers === true;
  const columns = hasDividers ? countOption(options, 'compartmentCols', 2) : 1;
  const rows = hasDividers ? countOption(options, 'compartmentRows', 2) : 1;
  const cellL = (inner.length - (columns - 1) * t) / columns, cellW = (inner.width - (rows - 1) * t) / rows;
  if (Math.min(cellL, cellW) < Math.max(5, 2 * t)) throw new Error('Rommene blir for små. Velg færre rom eller en større boks.');
  const endPlay = clearance, divH = inner.height - clearance - (sliding ? t : 0);
  const xCenters = Array.from({ length: columns - 1 }, (_, i) => (i + 1) * cellL + (i + 0.5) * t);
  const yCenters = Array.from({ length: rows - 1 }, (_, i) => (i + 1) * cellW + (i + 0.5) * t);
  for (let i = 0; i < rows - 1; i++) add('divider-long-' + i, `Lang skillevegg ${i + 1}`, inner.length - 2 * endPlay, divH, dividerLoop(inner.length - 2 * endPlay, divH, xCenters.map(x => x - endPlay), t, true));
  for (let i = 0; i < columns - 1; i++) add('divider-short-' + i, `Kort skillevegg ${i + 1}`, inner.width - 2 * endPlay, divH, dividerLoop(inner.width - 2 * endPlay, divH, yCenters.map(y => y - endPlay), t, false));
  parts.forEach(validatePartHoles);
  return { type, thickness: t, kerf, gap, clearance, outer: { length: L, width: W, height: H }, inner, bodyHeight: B, frontHeight: frontH, parts, compartments: { columns, rows, cellLength: cellL, cellWidth: cellW }, addLabels: options.addLabels !== false };
}

// Layout uses compensated bounds, not nominal dimensions, so cuts cannot overlap.
export function boxModelToShapes(model) {
  const shapes = [], labels = [];
  const cuts = model.parts.map(part => ({ part, outline: offsetBoxLoop(part.outline, model.kerf / 2), holes: part.holes.map(loop => offsetBoxLoop(loop, -model.kerf / 2)) }));
  const totalArea = cuts.reduce((sum, c) => { const b = computePolygonsBBox([c.outline]); return sum + (b.width + model.gap) * (b.height + model.gap); }, 0);
  const rowWidth = Math.max(...cuts.map(c => computePolygonsBBox([c.outline]).width), Math.sqrt(totalArea) * 1.4);
  let x = 10, y = 10, rowHeight = 0;
  const shapeAt = (loops, dx, dy, name, stage, part) => {
    const placed = loops.map(loop => loop.map(p => pt(roundMm(p.x + dx, 3), roundMm(p.y + dy, 3))));
    const shape = createPathShapeFromPolygons(placed, 'cut', name);
    // Keep the 0.001 mm path coordinates at scale 1:1, rather than rounding its
    // bounding box to 0.01 mm and inadvertently rescaling mating edges.
    Object.assign(shape, shape.origBBox);
    shape.cutStage = stage;
    shape.boxPart = { id: part.id, name: part.name, nominalWidth: part.width, nominalHeight: part.height };
    return shape;
  };
  for (const { part, outline, holes } of cuts) {
    const b = computePolygonsBBox([outline]);
    if (x > 10 && x - 10 + b.width > rowWidth) { x = 10; y += rowHeight + model.gap; rowHeight = 0; }
    const dx = x - b.x, dy = y - b.y;
    if (holes.length) shapes.push(shapeAt(holes, dx, dy, `Boks ${part.name} – hull`, 'box-holes', part));
    shapes.push(shapeAt([outline], dx, dy, `Boks ${part.name}`, 'box-outline', part));
    let labelHeight = 0;
    if (model.addLabels) {
      const labelText = part.id === 'locator' ? 'Lokkinnlegg' : part.name.replace(' side', '').replace('Skinne venstre', 'Skinne V').replace('Skinne høyre', 'Skinne H');
      const label = createTextShape({ x: 0, y: 0, text: labelText, fontKey: 'singleline', fontSizeMm: 8, spacingMm: 0, laserMode: 'guide' });
      const labelScale = Math.min(1, Math.max(1, b.width - 2) / label.width);
      label.width *= labelScale; label.height *= labelScale;
      label.x = x + (b.width - label.width) / 2; label.y = y + b.height + 3;
      label.guideLabel = true;
      label.boxPart = { id: part.id, name: part.name };
      labels.push(label);
      labelHeight = label.height + 5;
    }
    x += b.width + model.gap; rowHeight = Math.max(rowHeight, b.height + labelHeight);
  }
  return [...shapes, ...labels];
}

export function groupBoxParts(shapes) {
  const parts = new Map();
  for (const shape of shapes) {
    const id = shape.boxPart.id;
    if (!parts.has(id)) parts.set(id, []);
    parts.get(id).push(shape);
  }
  return [...parts.values()].map(children => ({
    id: uid('group'), type: 'group', name: `Boks ${children[0].boxPart.name}`, laserMode: 'cut', rotation: 0,
    ...computePolygonsBBox(children.filter(s => !s.guideLabel).flatMap(s => shapeToWorldPolygons(s))), children
  }));
}

export function generateFingerJointBox(options = {}) {
  return groupBoxParts(boxModelToShapes(buildBoxModel(options)));
}

// Assembly illustration uses the same nominal panel outlines as the cut model.
// The lid is lifted to keep the interior visible; hardware is not simulated.
export function renderBoxAssemblySvg(model) {
  const { length: L, width: W, height: H } = model.outer, B = model.bodyHeight, t = model.thickness;
  const project = (x, y, z) => pt(0.86 * x - 0.68 * y, 0.34 * (x + y) - 0.95 * z);
  const paths = [];
  const add = (part, map, fill, normal, stroke = '#475569') => {
    if (!part) return;
    const loops = [part.outline, ...part.holes].map(loop => loop.map(p => map(p.x, p.y)));
    const delta = project(...normal);
    for (const loop of loops) for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      paths.push({ loops: [[a, b, pt(b.x - delta.x, b.y - delta.y), pt(a.x - delta.x, a.y - delta.y)]], fill, stroke });
    }
    paths.push({ loops, fill, stroke });
  };
  const byId = id => model.parts.find(p => p.id === id);
  add(byId('front'), (x, y) => project(x, t, model.frontHeight - y), '#c6a477', [0, t, 0]);
  add(byId('left'), (x, y) => project(t, x, B - y), '#d8b58a', [t, 0, 0]);
  add(byId('bottom'), (x, y) => project(x, y, t), '#f3ddba', [0, 0, t]);
  const { columns, rows, cellLength, cellWidth } = model.compartments;
  for (let i = 0; i < rows - 1; i++) add(byId('divider-long-' + i), (x, y) => project(t + model.clearance + x, t + (i + 1) * cellWidth + (i + 0.5) * t, t + byId('divider-long-' + i).height - y), '#dec19b', [0, t, 0]);
  for (let i = 0; i < columns - 1; i++) add(byId('divider-short-' + i), (x, y) => project(t + (i + 1) * cellLength + (i + 0.5) * t, t + model.clearance + x, t + byId('divider-short-' + i).height - y), '#cfaa7c', [t, 0, 0]);
  if (model.type === 'sliding') {
    for (const side of ['left', 'right']) for (const level of ['upper', 'lower']) {
      const x = side === 'left' ? 2 * t : L - t;
      const z = level === 'upper' ? B : model.frontHeight;
      add(byId(`rail-${side}-${level}`), (u, v) => project(x, t + u, z - v), '#b48a60', [t, 0, 0]);
    }
  }
  add(byId('back'), (x, y) => project(x, W, B - y), '#e5c69e', [0, t, 0]);
  add(byId('right'), (x, y) => project(L, x, B - y), '#bb9469', [t, 0, 0]);
  const lid = byId('lid') || byId('top');
  if (lid) {
    const dx = model.type === 'sliding' ? t + model.clearance : 0;
    const z = H + Math.max(15, H * 0.3);
    add(byId('locator'), (x, y) => project(t + model.clearance + x, t + model.clearance + y, z - t), '#cfaa7c', [0, 0, t]);
    add(lid, (x, y) => project(x + dx, y, z), '#f5dfbf', [0, 0, t], '#93704b');
  }
  const bbox = computePolygonsBBox(paths.flatMap(p => p.loops));
  const pad = 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sammensatt boks med lokk løftet for oversikt" viewBox="${bbox.x - pad} ${bbox.y - pad} ${bbox.width + 2 * pad} ${bbox.height + 2 * pad}">
    ${paths.map(p => `<path d="${polygonsToSvgPath(p.loops, 3)}" fill="${p.fill}" fill-rule="evenodd" stroke="${p.stroke}" stroke-width="0.55" stroke-linejoin="round"/>`).join('\n')}
  </svg>`;
}
