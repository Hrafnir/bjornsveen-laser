import { cleanBoxLoop, boxModelToShapes, groupBoxParts } from './box-generator.js';
import { computePolygonsBBox, polygonsToSvgPath } from './geometry.js';

export const FLEX_TYPES = [
  { id: 'panel', name: 'Flexpanel / trehengsel', note: 'En flat del med et bøyeområde i midten. Snittene følger bøyeaksen. Endemarg 0 åpner snittene mot kanten, slik at en stiv ramme ikke hindrer bøying.' },
  { id: 'rounded', name: 'Avrundet, åpen boks', note: 'Veggen bøyes rundt bunnens avrundede hjørner. Lim styreringen sentrert på bunnen, og lim veggen oppå bunnen rundt ringen. Lim skjøtelappen på innsiden av veggskjøten.' },
  { id: 'rounded-lid', name: 'Avrundet boks med lokk', note: 'Lim styreringen sentrert på bunnen og veggen rundt ringen. Lim skjøtelappene på innsiden. Lim lokkinnlegget sentrert under lokket; klaringen gjør lokket avtakbart.' }
];
export const FLEX_PRESETS = [
  { id: 'hinge', name: 'Trehengsel', options: { flexType: 'panel', lengthMm: 120, widthMm: 70, flexWidthMm: 35 } },
  { id: 'sample', name: 'Prøvebit', options: { flexType: 'panel', lengthMm: 80, widthMm: 50, flexWidthMm: 40 } },
  { id: 'tray', name: 'Avrundet brett', options: { flexType: 'rounded', lengthMm: 150, widthMm: 100, heightMm: 40, radiusMm: 25 } },
  { id: 'lid', name: 'Boks med lokk', options: { flexType: 'rounded-lid', lengthMm: 140, widthMm: 90, heightMm: 65, radiusMm: 22 } },
  { id: 'capsule', name: 'Kapselboks', options: { flexType: 'rounded-lid', lengthMm: 160, widthMm: 80, heightMm: 60, radiusMm: 40 } }
];
const pt = (x, y) => ({ x, y });
const rect = (w, h) => cleanBoxLoop([pt(0, 0), pt(w, 0), pt(w, h), pt(0, h)]);
function number(options, key, fallback, min, max, label) {
  const n = Number(options[key] ?? fallback);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label}: velg ${min}–${max} mm.`);
  return n;
}

export function roundedFlexOutline(w, h, r) {
  if (r <= 1e-8) return rect(w, h);
  // Chord error <= 0.01 mm, independent of the chosen radius.
  const steps = Math.max(8, Math.ceil((Math.PI / 2) / (2 * Math.acos(1 - Math.min(0.01 / r, 1)))));
  return cleanBoxLoop([[w - r, r, -Math.PI / 2], [w - r, h - r, 0], [r, h - r, Math.PI / 2], [r, r, Math.PI]].flatMap(([cx, cy, start]) =>
    Array.from({ length: steps + 1 }, (_, i) => pt(cx + r * Math.cos(start + i * Math.PI / (2 * steps)), cy + r * Math.sin(start + i * Math.PI / (2 * steps))))));
}

// Open, single-pass slits. Alternating half-period phase leaves staggered bridges.
// At margin 0, terminal slits reach the compensated outline: no rigid edge band.
export function buildFlexSlits({ x, width, height, pitch, cutLength, bridge, margin = 0, kerf = 0 }) {
  if (![x, width, height, pitch, cutLength, bridge, margin, kerf].every(Number.isFinite) || width <= 0 || margin < 0 || kerf < 0 || pitch < kerf + 0.4 || bridge < kerf + 0.4 || cutLength <= bridge) throw new Error('Øk avstand/bro mellom snittene. Det må stå igjen minst 0,4 mm materiale etter kerf, og snittet må være lengre enn broen.');
  if (height - 2 * margin < cutLength + 2 * bridge) throw new Error('Bøyeområdet er for kort langs snittene. Øk delen, reduser endemargen eller bruk kortere snitt.');
  const edge = Math.max(pitch / 2, kerf / 2 + 0.4);
  const count = Math.floor((width - 2 * edge) / pitch) + 1;
  if (count < 3) throw new Error('Bøyeområdet må ha plass til minst tre snittkolonner. Øk radius/bøyebredde eller reduser snittavstanden.');
  const period = cutLength + bridge, result = [];
  if (count * (Math.ceil(height / period) + 2) > 12000) throw new Error('For tett flexmønster. Øk snittavstanden eller reduser delen.');
  for (let col = 0; col < count; col++) {
    const sx = x + (width - (count - 1) * pitch) / 2 + col * pitch;
    for (let start = margin - period + (col % 2) * period / 2; start < height - margin; start += period) {
      let a = Math.max(margin, start), b = Math.min(height - margin, start + cutLength);
      if (b - a < Math.max(0.5, kerf * 2)) continue;
      if (margin === 0 && a === 0) a -= kerf / 2;
      if (margin === 0 && b === height) b += kerf / 2;
      const line = [pt(sx, a), pt(sx, b)]; line.closed = false; result.push(line);
    }
  }
  return result;
}

// Developed length is measured at the material's mid-plane, never at the
// outer perimeter. Seams start halfway along a straight rear/front wall.
export function roundedWallRoute(L, W, R, t) {
  const r = R - t / 2, a = L - 2 * R, b = W - 2 * R;
  const segments = [], bends = []; let length = 0;
  const line = (len, x, y, dx, dy) => { if (len > 1e-8) { segments.push({ start: length, length: len, at: s => pt(x + dx * s, y + dy * s) }); length += len; } };
  const arc = (cx, cy, angle) => {
    const len = Math.PI * r / 2;
    bends.push({ start: length, width: len });
    segments.push({ start: length, length: len, at: s => pt(cx + r * Math.cos(angle + s / r), cy + r * Math.sin(angle + s / r)) }); length += len;
  };
  line(a / 2, L / 2, t / 2, 1, 0); arc(L - R, R, -Math.PI / 2);
  line(b, L - t / 2, R, 0, 1); arc(L - R, W - R, 0);
  line(a, L - R, W - t / 2, -1, 0); arc(R, W - R, Math.PI / 2);
  line(b, t / 2, W - R, 0, -1); arc(R, R, Math.PI);
  line(a / 2, R, t / 2, 1, 0);
  const at = distance => {
    const s = Math.max(0, Math.min(length, distance));
    const segment = segments.find(seg => s <= seg.start + seg.length + 1e-8) || segments.at(-1);
    return segment.at(Math.max(0, Math.min(segment.length, s - segment.start)));
  };
  return { length, bends, at };
}

export function buildFlexModel(options = {}) {
  const type = options.flexType ?? 'panel';
  if (!FLEX_TYPES.some(p => p.id === type)) throw new Error('Ukjent flextype.');
  const thickness = number(options, 'thicknessMm', 3, 0.5, 12, 'Materialtykkelse');
  const kerf = number(options, 'kerfMm', 0.08, 0, Math.min(1, thickness / 3), 'Hele snittbredden');
  const pitch = number(options, 'pitchMm', 2, 0.5, 20, 'Snittavstand');
  const cutLength = number(options, 'cutLengthMm', 18, 2, 100, 'Snittlengde');
  const bridge = number(options, 'bridgeMm', 2, 0.5, 12, 'Bro mellom snitt');
  const L = number(options, 'lengthMm', 120, 20, 900, 'Lengde');
  const W = number(options, 'widthMm', 70, 20, 600, 'Bredde');
  const gap = number(options, 'partGapMm', 6, 2, 30, 'Deleavstand');
  const parts = [], pattern = { pitch, cutLength, bridge, kerf };
  const add = (id, name, width, height, outline = rect(width, height), holes = []) => {
    const part = { id, name, width, height, outline, holes, slits: [] }; parts.push(part); return part;
  };
  const model = { type, thickness, kerf, gap, parts, pattern, addLabels: options.addLabels !== false };
  if (type === 'panel') {
    const axis = options.axis ?? 'vertical';
    if (!['vertical', 'horizontal'].includes(axis)) throw new Error('Ukjent bøyeakse.');
    const across = axis === 'vertical' ? L : W, along = axis === 'vertical' ? W : L;
    const flexWidth = number(options, 'flexWidthMm', 40, 5, across, 'Bøyebredde');
    const margin = number(options, 'endMarginMm', 0, 0, along / 3, 'Endemarg');
    if (margin > 0 && margin < kerf + 0.4) throw new Error('Endemargen må være 0 eller gi minst 0,4 mm restmateriale etter kerf.');
    const part = add('flex-panel', 'Flexpanel', L, W);
    part.slits = buildFlexSlits({ ...pattern, x: (across - flexWidth) / 2, width: flexWidth, height: along, margin });
    if (axis === 'horizontal') part.slits = part.slits.map(line => { const rotated = line.map(p => pt(p.y, p.x)); rotated.closed = false; return rotated; });
    return Object.assign(model, { outer: { length: L, width: W, height: thickness }, axis, flexWidth, margin });
  }
  const t = thickness, hasLid = type === 'rounded-lid';
  const H = number(options, 'heightMm', 60, 20, 400, 'Ytre høyde med lokk');
  const R = number(options, 'radiusMm', 22, t + 1, Math.min(L, W) / 2, 'Ytre hjørneradius');
  const clearance = number(options, 'clearanceMm', 0.2, 0.05, Math.min(1, t / 2), 'Lokk- og styreringsklaring');
  const seamGap = number(options, 'seamGapMm', 0.2, 0, 1, 'Åpning i veggskjøt');
  const wallPieces = Number(options.wallPieces ?? 2);
  if (![1, 2].includes(wallPieces)) throw new Error('Velg én eller to veggdeler.');
  const joinWidth = Math.max(12, 6 * t), ringWidth = Math.max(4, 2 * t), inset = t + clearance;
  if (L - 2 * R < joinWidth + 2 * t) throw new Error('Den rette langsiden er for kort til skjøtelappen. Øk lengden eller reduser radius.');
  if (Math.min(L, W) <= 2 * (inset + ringWidth) + 4) throw new Error('Boksen er for smal til styreringen. Øk bredden eller reduser materialtykkelsen.');
  const B = H - (hasLid ? t : 0), wallH = B - t;
  const joinH = wallH - t - (hasLid ? t : 0) - 2 * clearance;
  if (joinH < 2 * t) throw new Error('Boksen er for lav til skjøtelapp og lokk. Øk høyden.');
  const route = roundedWallRoute(L, W, R, t);
  add('bottom', 'Avrundet bunn', L, W, roundedFlexOutline(L, W, R));
  const ringW = L - 2 * inset, ringH = W - 2 * inset, ringR = R - inset;
  const ringHole = roundedFlexOutline(ringW - 2 * ringWidth, ringH - 2 * ringWidth, Math.max(0, ringR - ringWidth)).map(p => pt(p.x + ringWidth, p.y + ringWidth));
  add('ring', 'Styrering – lim på bunn', ringW, ringH, roundedFlexOutline(ringW, ringH, ringR), [ringHole]);
  for (let i = 0; i < wallPieces; i++) {
    const start = i * route.length / wallPieces + seamGap / 2, end = (i + 1) * route.length / wallPieces - seamGap / 2;
    const wall = add('wall-' + i, `Flexvegg ${i + 1}`, end - start, wallH);
    wall.routeStart = start; wall.bends = [];
    for (const bend of route.bends) {
      if (bend.start < start || bend.start + bend.width > end) continue;
      wall.bends.push({ x: bend.start - start, width: bend.width });
      wall.slits.push(...buildFlexSlits({ ...pattern, x: bend.start - start, width: bend.width, height: wallH }));
    }
    add('join-' + i, `Skjøtelapp ${i + 1}`, joinWidth, joinH);
  }
  if (hasLid) {
    add('lid', 'Løst lokk', L, W, roundedFlexOutline(L, W, R));
    add('locator', 'Lokkinnlegg', ringW, ringH, roundedFlexOutline(ringW, ringH, ringR));
  }
  return Object.assign(model, { outer: { length: L, width: W, height: H }, inner: { length: L - 2 * t, width: W - 2 * t, height: H - (hasLid ? 3 : 1) * t }, radius: R, bodyTop: B, clearance, seamGap, wallPieces, route });
}

export const flexModelToShapes = model => boxModelToShapes(model);
export const generateFlexParts = options => groupBoxParts(flexModelToShapes(buildFlexModel(options)));

// Nominal assembly, with the same developed route and slit positions as the cuts.
export function renderFlexAssemblySvg(model) {
  if (model.type === 'panel') throw new Error('Flexpanel vises flatt; bøyeradius avhenger av materialet.');
  const { length: L, width: W, height: H } = model.outer, t = model.thickness, R = model.radius;
  const project = (x, y, z) => pt(0.86 * x - 0.68 * y, 0.34 * (x + y) - 0.95 * z);
  const draw = [], paths = [];
  const path = (loops, fill, stroke = '#806647', width = 0.4) => {
    paths.push(...loops); draw.push(`<path d="${polygonsToSvgPath(loops, 3)}" fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="${width}"/>`);
  };
  const plate = (part, x, y, z, fill) => {
    path([part.outline.map(p => project(p.x + x, p.y + y, z)), ...part.holes.map(h => h.map(p => project(p.x + x, p.y + y, z)))], fill);
  };
  const byId = id => model.parts.find(p => p.id === id);
  plate(byId('bottom'), 0, 0, t, '#e6c9a2');
  plate(byId('ring'), t + model.clearance, t + model.clearance, 2 * t, '#d8b78b');
  const surfaces = [];
  for (const wall of model.parts.filter(p => p.id.startsWith('wall-'))) {
    const steps = Math.ceil(wall.width / 2);
    for (let i = 0; i < steps; i++) {
      const s = wall.routeStart + wall.width * i / steps, e = wall.routeStart + wall.width * (i + 1) / steps;
      const a = model.route.at(s), b = model.route.at(e);
      surfaces.push({ depth: (a.x + a.y + b.x + b.y) / 2, loop: [project(a.x, a.y, t), project(b.x, b.y, t), project(b.x, b.y, model.bodyTop), project(a.x, a.y, model.bodyTop)] });
    }
  }
  surfaces.sort((a, b) => a.depth - b.depth);
  for (const face of surfaces) path([face.loop], face.depth < (L + W) / 2 ? '#dfc29b' : '#c39c6c', 'none');
  // Only show front-facing slits, so the far wall does not shine through wood.
  for (const wall of model.parts.filter(p => p.id.startsWith('wall-'))) for (const slit of wall.slits) {
    const s = wall.routeStart + slit[0].x, a = model.route.at(s), b = model.route.at(s + 0.01);
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx - dy >= 0) continue;
    const line = slit.map(p => project(a.x, a.y, t + Math.max(0, Math.min(wall.height, p.y)))); line.closed = false;
    path([line], 'none', '#735b40', 0.45);
  }
  const rim = roundedFlexOutline(L, W, R).map(p => project(p.x, p.y, model.bodyTop));
  const innerRim = roundedFlexOutline(L - 2 * t, W - 2 * t, R - t).map(p => project(p.x + t, p.y + t, model.bodyTop));
  path([rim, innerRim], '#f2d7b3');
  if (byId('lid')) {
    const z = H + 20;
    plate(byId('locator'), t + model.clearance, t + model.clearance, z - t, '#bd9363');
    plate(byId('lid'), 0, 0, z, '#efd5b0');
  }
  const bounds = computePolygonsBBox(paths), pad = 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Avrundet flexboks, lokk vist løftet" viewBox="${bounds.x - pad} ${bounds.y - pad} ${bounds.width + 2 * pad} ${bounds.height + 2 * pad}">${draw.join('')}</svg>`;
}
