import test from 'node:test';
import assert from 'node:assert/strict';
import { FLEX_PRESETS, buildFlexModel, buildFlexSlits, flexModelToShapes, roundedWallRoute, roundedFlexOutline } from '../js/flex-generator.js';
import { groupBoxParts } from '../js/box-generator.js';
import { computePolygonsBBox, shapeToWorldPolygons, pointInMultiPolygon } from '../js/geometry.js';
import { buildLaserSvgString, buildXcsProjectString, importXcsStringToWorkspace } from '../js/export.js';
const near = (a, b, tol = 1e-7) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const wallParts = m => m.parts.filter(p => p.id.startsWith('wall-'));

test('every flex example produces finite, grouped parts and matching labels', () => {
  for (const preset of FLEX_PRESETS) {
    const model = buildFlexModel(preset.options), shapes = flexModelToShapes(model), grouped = groupBoxParts(shapes);
    assert.equal(grouped.length, model.parts.length);
    assert.equal(shapes.filter(s => s.guideLabel).length, model.parts.length);
    assert.ok(shapes.some(s => s.cutStage === 'flex-slits'));
    for (const shape of shapes) assert.ok([shape.x, shape.y, shape.width, shape.height].every(Number.isFinite));
    for (const part of model.parts) for (const hole of part.holes) for (const p of hole) assert.ok(pointInMultiPolygon(p, [part.outline]));
  }
});

test('developed wall length uses material mid-plane, with four exact quarter arcs', () => {
  for (const t of [1, 3, 6]) for (const R of [18, 40]) {
    const L = 160, W = 80, route = roundedWallRoute(L, W, R, t);
    near(route.length, 2 * (L - 2 * R) + 2 * (W - 2 * R) + 2 * Math.PI * (R - t / 2));
    near(route.at(0).x, L / 2); near(route.at(0).y, t / 2);
    near(route.at(route.length).x, L / 2); near(route.at(route.length).y, t / 2);
    near(route.at(route.length / 2).x, L / 2); near(route.at(route.length / 2).y, W - t / 2);
    assert.equal(route.bends.length, 4);
    for (const b of route.bends) near(b.width, Math.PI * (R - t / 2) / 2);
  }
});

test('split and continuous walls account for every seam once and keep slits at bends only', () => {
  for (const wallPieces of [1, 2]) {
    const m = buildFlexModel({ flexType: 'rounded-lid', wallPieces, seamGapMm: 0.4 });
    near(wallParts(m).reduce((n, w) => n + w.width, 0) + wallPieces * m.seamGap, m.route.length);
    assert.equal(wallParts(m).reduce((n, w) => n + w.bends.length, 0), 4);
    for (const w of wallParts(m)) for (const line of w.slits) {
      assert.equal(line.closed, false); assert.equal(line.length, 2);
      assert.ok(w.bends.some(b => line[0].x > b.x && line[0].x < b.x + b.width));
      assert.ok(line[0].y >= -m.kerf / 2 && line[1].y <= w.height + m.kerf / 2);
    }
  }
});

test('slits retain real bridges, exact pitch, staggered phase and open edge access', () => {
  const o = { x: 0, width: 40, height: 70, pitch: 2, cutLength: 18, bridge: 2, kerf: 0.17 };
  const lines = buildFlexSlits(o), columns = new Map();
  for (const l of lines) { if (!columns.has(l[0].x)) columns.set(l[0].x, []); columns.get(l[0].x).push(l); }
  const xs = [...columns.keys()];
  xs.slice(1).forEach((x, i) => near(x - xs[i], o.pitch));
  assert.equal(new Set(lines.map(l => JSON.stringify(l))).size, lines.length);
  for (const column of columns.values()) {
    for (let i = 1; i < column.length; i++) near(column[i][0].y - column[i - 1][1].y, o.bridge);
    assert.ok(column.every(l => l[1].y - l[0].y < o.height));
  }
  near(columns.get(xs[0])[0][1].y - columns.get(xs[1])[0][1].y, (o.cutLength + o.bridge) / 2);
  assert.ok(lines.some(l => l[0].y === -o.kerf / 2));
  assert.ok(lines.some(l => l[1].y === o.height + o.kerf / 2));
  const bounded = buildFlexSlits({ ...o, margin: 3 });
  assert.ok(bounded.every(l => l[0].y >= 3 && l[1].y <= 67));
});

test('flex pattern remains one connected piece after the cut width is removed', () => {
  // Independent rectangular-cell flood fill, including edge-reaching cuts.
  const m = buildFlexModel({ flexWidthMm: 120, widthMm: 50, cutLengthMm: 18, kerfMm: 0.2 });
  const p = m.parts[0], k = m.kerf / 2;
  const cuts = p.slits.map(l => ({ left: l[0].x - k, right: l[0].x + k, top: Math.max(0, l[0].y - k), bottom: Math.min(p.height, l[1].y + k) }));
  const sorted = a => [...new Set(a)].sort((a, b) => a - b);
  const X = sorted([0, p.width, ...cuts.flatMap(c => [c.left, c.right])]), Y = sorted([0, p.height, ...cuts.flatMap(c => [c.top, c.bottom])]);
  const cols = X.length - 1, rows = Y.length - 1, material = new Set();
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const px = (X[x] + X[x + 1]) / 2, py = (Y[y] + Y[y + 1]) / 2;
    if (!cuts.some(c => px > c.left && px < c.right && py > c.top && py < c.bottom)) material.add(y * cols + x);
  }
  const remaining = new Set(material), queue = [remaining.values().next().value]; remaining.delete(queue[0]);
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i], x = n % cols, y = Math.floor(n / cols);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
      const next = ny * cols + nx; if (remaining.delete(next)) queue.push(next);
    }
  }
  assert.equal(remaining.size, 0, 'Detached pieces in flex pattern');
});

test('horizontal hinge rotates only the pattern, with preserved dimensions and edge openings', () => {
  const vertical = buildFlexModel({ lengthMm: 120, widthMm: 70 });
  const horizontal = buildFlexModel({ lengthMm: 70, widthMm: 120, axis: 'horizontal' });
  for (let i = 0; i < vertical.parts[0].slits.length; i++) {
    const a = vertical.parts[0].slits[i], b = horizontal.parts[0].slits[i];
    a.forEach((p, j) => { near(p.x, b[j].y); near(p.y, b[j].x); });
    assert.equal(b.closed, false);
  }
});

test('rounded profiles are smooth at capsule limit; locator, ring and seam patches have clearance', () => {
  for (const flexType of ['rounded', 'rounded-lid']) {
    const m = buildFlexModel({ flexType, lengthMm: 160, widthMm: 80, radiusMm: 40 });
    const t = m.thickness, c = m.clearance, ring = m.parts.find(p => p.id === 'ring');
    near(ring.width + 2 * c, m.inner.length);
    const ringB = computePolygonsBBox([ring.outline]); near(ringB.width, ring.width); near(ringB.height, ring.height);
    for (const p of m.parts.filter(p => p.id.startsWith('join-'))) {
      assert.ok(p.width + 2 * t <= 160 - 80);
      near(p.height + t + (flexType === 'rounded-lid' ? t : 0) + 2 * c, wallParts(m)[0].height);
    }
    const outline = roundedFlexOutline(160, 80, 40);
    for (let i = 0; i < outline.length; i++) assert.ok(Math.hypot(outline[i].x - outline[(i + 1) % outline.length].x, outline[i].y - outline[(i + 1) % outline.length].y) > 1e-6);
    if (flexType === 'rounded-lid') {
      near(m.inner.height, m.outer.height - 3 * t);
      near(m.parts.find(p => p.id === 'lid').width, m.outer.length);
    }
  }
});

test('SVG and XCS preserve open slits once, kerf, physical bounds and cut order after grouping', () => {
  const m = buildFlexModel({ flexType: 'rounded-lid', kerfMm: 0.17 });
  const shapes = flexModelToShapes(m), groups = groupBoxParts(shapes);
  for (const s of shapes.filter(s => s.cutStage === 'flex-slits')) {
    const p = m.parts.find(p => p.id === s.boxPart.id), loops = shapeToWorldPolygons(s);
    assert.equal(loops.length, p.slits.length); assert.ok(loops.every(l => l.length === 2 && l.closed === false));
    assert.doesNotMatch(s.d, /z/i);
    near(loops[0][1].y - loops[0][0].y, p.slits[0][1].y - p.slits[0][0].y, 0.002);
  }
  const svg = buildLaserSvgString([...groups].reverse());
  assert.ok(svg.indexOf('id="flex-slits"') < svg.indexOf('id="box-holes"'));
  assert.ok(svg.indexOf('id="box-holes"') < svg.indexOf('id="box-outline"'));
  assert.doesNotMatch(svg, /<text/);
  const data = JSON.parse(buildXcsProjectString([...groups].reverse()));
  const { displays, layerData } = data.canvas[0];
  const order = stage => layerData[displays.find(d => d.bjornsveenShape.cutStage === stage).layerTag].order;
  assert.ok(order('flex-slits') < order('box-holes') && order('box-holes') < order('box-outline'));
  const paths = displays.filter(d => d.bjornsveenShape.cutStage === 'flex-slits');
  assert.ok(paths.every(d => d.processingType === 'VECTOR_CUTTING' && !d.isClose && !d.isClosePath));
  const restored = importXcsStringToWorkspace(JSON.stringify(data));
  assert.equal(restored.shapes.length, groups.length);
  const flatten = a => a.flatMap(s => s.children ? flatten(s.children) : [s]);
  assert.equal(flatten(restored.shapes).filter(s => s.cutStage === 'flex-slits').length, wallParts(m).length);
});

test('layout keeps all compensated outlines separated', () => {
  for (const preset of FLEX_PRESETS) {
    const m = buildFlexModel(preset.options), outlines = flexModelToShapes(m).filter(s => s.cutStage === 'box-outline');
    for (let i = 0; i < outlines.length; i++) for (let j = i + 1; j < outlines.length; j++) {
      const a = outlines[i], b = outlines[j], gap = m.gap - 0.002;
      assert.ok(a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x || a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y);
    }
  }
});

test('unsafe webs, overlong cuts, impossible radii and invalid inputs are rejected', () => {
  for (const options of [
    { pitchMm: 0 }, { pitchMm: 0.5, kerfMm: 0.3 }, { bridgeMm: 0.5, kerfMm: 0.3 },
    { cutLengthMm: 100 }, { cutLengthMm: 2, bridgeMm: 3 }, { flexWidthMm: 5, pitchMm: 3 },
    { endMarginMm: 0.1 }, { thicknessMm: NaN }, { axis: 'diagonal' },
    { flexType: 'rounded', radiusMm: 2 }, { flexType: 'rounded', radiusMm: 100 },
    { flexType: 'rounded', wallPieces: 3 }, { flexType: 'rounded', lengthMm: 80, widthMm: 80, radiusMm: 40 }
  ]) assert.throws(() => buildFlexModel(options), JSON.stringify(options));
});
