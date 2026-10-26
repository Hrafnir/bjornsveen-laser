import test from 'node:test';
import assert from 'node:assert/strict';
import { BOX_TYPES, buildBoxModel, boxModelToShapes, offsetBoxLoop, groupBoxParts } from '../js/box-generator.js';
import { pointInMultiPolygon, shapeToWorldPolygons, computePolygonsBBox } from '../js/geometry.js';
import { buildXcsProjectString, buildLaserSvgString, importXcsStringToWorkspace } from '../js/export.js';

const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const mids = values => [...new Set(values.map(v => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b).flatMap((v, i, a) => i ? [(v + a[i - 1]) / 2] : []);
const inside = (part, x, y) => pointInMultiPolygon({ x, y }, [part.outline]);

// Independent solid assembly check: extrude each nominal face by the stock
// thickness and ensure the shell is covered once, including all triple corners.
function checkAssembly(model) {
  const { length: L, width: W } = model.outer, B = model.bodyHeight, F = model.frontHeight, t = model.thickness;
  const faces = Object.fromEntries(model.parts.filter(p => p.face).map(p => [p.face, p]));
  const X = [0, t, L - t, L], Y = [0, t, W - t, W], Z = [0, t, B - t, B, F];
  for (const p of model.parts.filter(p => p.face)) for (const q of p.outline) {
    if (['bottom', 'top'].includes(p.face)) { X.push(q.x); Y.push(q.y); }
    else { (['front', 'back'].includes(p.face) ? X : Y).push(q.x); Z.push((p.face === 'front' ? F : B) - q.y); }
  }
  let checked = 0;
  for (const x of mids(X)) for (const y of mids(Y)) for (const z of mids(Z)) {
    let coverage = 0;
    if (z < t && inside(faces.bottom, x, y)) coverage++;
    if (faces.top && z > B - t && inside(faces.top, x, y)) coverage++;
    if (y < t && z < F && inside(faces.front, x, F - z)) coverage++;
    if (y > W - t && inside(faces.back, x, B - z)) coverage++;
    if (x < t && inside(faces.left, y, B - z)) coverage++;
    if (x > L - t && inside(faces.right, y, B - z)) coverage++;
    const expected = z < t || x < t || x > L - t || (y < t && z < F) || y > W - t || (faces.top && z > B - t) ? 1 : 0;
    assert.equal(coverage, expected, `${model.type} at (${x}, ${y}, ${z}): solid coverage ${coverage}`);
    checked++;
  }
  assert.ok(checked > 100);
}

function assertSimple(loop) {
  const cross = (a, b, p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 1e-7);
    for (let j = i + 2; j < loop.length; j++) {
      if (i === 0 && j === loop.length - 1) continue;
      const c = loop[j], d = loop[(j + 1) % loop.length];
      assert.ok(!(cross(a, b, c) * cross(a, b, d) < -1e-9 && cross(c, d, a) * cross(c, d, b) < -1e-9), `Crossing edges ${i} / ${j}`);
    }
  }
}

test('box faces assemble without gaps or collisions at seams and triple corners', () => {
  for (const boxType of ['open', 'closed', 'lid', 'sliding', 'hinged']) for (const thicknessMm of [1.5, 3, 6]) {
    checkAssembly(buildBoxModel({ boxType, thicknessMm, lengthMm: 123.4, widthMm: 86.7, heightMm: 64.2, fingerWidthMm: 11.1 }));
  }
});

test('every box variant has square, simple finger contours and complete part counts', () => {
  const counts = { open: 5, closed: 6, lid: 7, sliding: 10, hinged: 6, tray: 5, dividers: 7 };
  for (const { id: boxType } of BOX_TYPES) {
    const model = buildBoxModel({ boxType });
    assert.equal(model.parts.length, counts[boxType]);
    for (const part of model.parts) {
      assertSimple(part.outline);
      for (let i = 0; i < part.outline.length; i++) {
        const a = part.outline[i], b = part.outline[(i + 1) % part.outline.length];
        assert.ok(Math.abs(a.x - b.x) < 1e-8 || Math.abs(a.y - b.y) < 1e-8, `${boxType}/${part.id}: diagonal outer cut`);
      }
      part.holes.forEach(assertSimple);
      for (const hole of part.holes) for (const p of hole) assert.ok(inside(part, p.x, p.y), `${part.id}: hole outside material`);
    }
  }
});

test('full kerf correction offsets every edge by half the cut width, including holes', () => {
  for (const kerfMm of [0.08, 0.17, 0.3]) {
    const model = buildBoxModel({ boxType: 'hinged', kerfMm });
    for (const part of model.parts) for (const [loop, distance] of [[part.outline, kerfMm / 2], ...part.holes.map(h => [h, -kerfMm / 2])]) {
      const cut = offsetBoxLoop(loop, distance);
      assert.equal(cut.length, loop.length);
      const sign = Math.sign(loop.reduce((sum, p, i) => { const q = loop[(i + 1) % loop.length]; return sum + p.x * q.y - q.x * p.y; }, 0));
      loop.forEach((a, i) => {
        const b = loop[(i + 1) % loop.length], p = cut[i];
        const signedDistance = ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
        near(signedDistance, -sign * distance);
      });
      assertSimple(cut);
    }
  }
});

test('inner dimensions roundtrip to the same external box for every lid construction', () => {
  for (const { id: boxType } of BOX_TYPES) {
    const inner = buildBoxModel({ boxType, dimMode: 'inner', lengthMm: 120, widthMm: 90, heightMm: 60 });
    assert.deepEqual(inner.inner, { length: 120, width: 90, height: 60 });
    const outer = buildBoxModel({ boxType, lengthMm: inner.outer.length, widthMm: inner.outer.width, heightMm: inner.outer.height });
    assert.deepEqual(inner.parts, outer.parts);
  }
});

test('compartment thickness, half-lap positions and end clearance account for every divider', () => {
  for (const [cols, rows] of [[1, 4], [5, 1], [3, 4]]) {
    const model = buildBoxModel({ boxType: 'lid', addDividers: true, compartmentCols: cols, compartmentRows: rows });
    const { cellLength, cellWidth } = model.compartments, t = model.thickness;
    near(cols * cellLength + (cols - 1) * t, model.inner.length);
    near(rows * cellWidth + (rows - 1) * t, model.inner.width);
    const longs = model.parts.filter(p => p.id.startsWith('divider-long'));
    const shorts = model.parts.filter(p => p.id.startsWith('divider-short'));
    assert.equal(longs.length, rows - 1); assert.equal(shorts.length, cols - 1);
    for (const part of [...longs, ...shorts]) {
      const isLong = part.id.startsWith('divider-long');
      const count = isLong ? cols : rows, cell = isLong ? cellLength : cellWidth;
      near(part.width, (isLong ? model.inner.length : model.inner.width) - 2 * model.clearance);
      for (let n = 1; n < count; n++) {
        const center = n * cell + (n - 0.5) * t - model.clearance;
        assert.equal(inside(part, center, part.height * (isLong ? 0.25 : 0.75)), false);
        assert.equal(inside(part, center, part.height * (isLong ? 0.75 : 0.25)), true);
        const cut = offsetBoxLoop(part.outline, model.kerf / 2);
        const edges = cut.filter(p => Math.abs(p.x - (center - (t - model.kerf) / 2)) < 1e-7);
        assert.ok(edges.length >= 2, 'slot toolpath width must be stock thickness minus kerf');
      }
    }
  }
});

test('sliding lid has clearance above front and overlap on both lower rails', () => {
  const model = buildBoxModel({ boxType: 'sliding' });
  const lid = model.parts.find(p => p.id === 'lid'), t = model.thickness, c = model.clearance;
  near(lid.width, model.inner.length - 2 * c);
  near(model.outer.height - model.frontHeight, 2 * t + c);
  assert.ok(t - c > 0);
  assert.equal(model.parts.filter(p => p.id.startsWith('rail-')).length, 4);
});

test('compensated parts remain 1:1 through layout and XCS, with holes cut first', () => {
  const model = buildBoxModel({ boxType: 'hinged', addDividers: true, compartmentCols: 3, kerfMm: 0.17, addLabels: false });
  const shapes = boxModelToShapes(model);
  const outlines = shapes.filter(s => s.cutStage === 'box-outline');
  for (const s of outlines) {
    const part = model.parts.find(p => p.id === s.boxPart.id);
    const expected = computePolygonsBBox([offsetBoxLoop(part.outline, model.kerf / 2)]);
    const actual = computePolygonsBBox(shapeToWorldPolygons(s));
    near(actual.width, expected.width, 0.002); near(actual.height, expected.height, 0.002);
    near(s.width, s.origBBox.width); near(s.height, s.origBBox.height);
  }
  for (let i = 0; i < outlines.length; i++) for (let j = i + 1; j < outlines.length; j++) {
    const a = outlines[i], b = outlines[j], gap = model.gap - 0.002;
    assert.ok(a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x || a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y);
  }
  const xcs = JSON.parse(buildXcsProjectString([...shapes].reverse()));
  const { displays, layerData } = xcs.canvas[0];
  const hole = displays.find(d => d.bjornsveenShape.cutStage === 'box-holes'), contour = displays.find(d => d.bjornsveenShape.cutStage === 'box-outline');
  assert.ok(layerData[hole.layerTag].order < layerData[contour.layerTag].order);
  assert.ok(displays.every(d => d.processingType === 'VECTOR_CUTTING'));
  for (const d of displays) { near(d.width, d.bjornsveenShape.width, 0.002); near(d.height, d.bjornsveenShape.height, 0.002); }
  const restored = importXcsStringToWorkspace(JSON.stringify(xcs));
  assert.deepEqual(restored.shapes.map(s => s.cutStage), [...shapes].reverse().map(s => s.cutStage));
  const svg = buildLaserSvgString([...shapes].reverse());
  assert.ok(svg.indexOf('<g id="box-holes"') < svg.indexOf('<g id="box-outline"'));
});

test('impossible stock, tiny joints, fractional counts and crowded hinge holes are rejected', () => {
  for (const options of [
    { thicknessMm: 25, lengthMm: 20 }, { heightMm: 15, thicknessMm: 6 },
    { boxType: 'dividers', compartmentCols: 2.5 }, { boxType: 'dividers', compartmentRows: 12, widthMm: 30 },
    { boxType: 'hinged', hingeHoleSpacingMm: 60 }, { kerfMm: 2 }, { lengthMm: Infinity }, { boxType: 'unknown' }
  ]) assert.throws(() => buildBoxModel(options), JSON.stringify(options));
});

test('combined hinge and finger holes cannot overlap', () => {
  assert.throws(() => buildBoxModel({ boxType: 'hinged', hingeHoleSpacingMm: 45, hingeSetbackMm: 40 }), /overlapper/);
  assert.doesNotThrow(() => buildBoxModel({ boxType: 'hinged', hingeHoleSpacingMm: 45, hingeSetbackMm: 40, fingerHoleLid: false }));
});

test('each movable box part keeps its holes and readable, non-exported label together', () => {
  const model = buildBoxModel({ boxType: 'hinged' });
  const flat = boxModelToShapes(model), groups = groupBoxParts(flat);
  assert.equal(groups.length, model.parts.length);
  for (const group of groups) {
    const label = group.children.find(s => s.guideLabel);
    const outline = group.children.find(s => s.cutStage === 'box-outline');
    assert.ok(label && outline);
    assert.ok(label.y > outline.y + outline.height);
    assert.equal(label.boxPart.id, outline.boxPart.id);
    assert.equal(label.laserMode, 'guide');
    const bounds = computePolygonsBBox(shapeToWorldPolygons(group));
    near(bounds.width, outline.width); near(bounds.height, outline.height);
    near(group.width, outline.width); near(group.height, outline.height);
  }
  const xcs = JSON.parse(buildXcsProjectString(groups));
  assert.ok(xcs.canvas[0].displays.every(d => !d.bjornsveenShape.guideLabel));
  assert.equal(Object.keys(xcs.canvas[0].groupData).length, model.parts.length);
  assert.doesNotMatch(buildLaserSvgString(groups), /<text/);
});

test('dividers below a sliding lid clear both lower rails', () => {
  const model = buildBoxModel({ boxType: 'sliding', addDividers: true, compartmentCols: 3, compartmentRows: 2 });
  const railBottom = model.frontHeight - model.thickness;
  for (const divider of model.parts.filter(p => p.id.startsWith('divider-'))) {
    near(railBottom - (model.thickness + divider.height), model.clearance);
    assert.ok(divider.height > 0);
  }
});
