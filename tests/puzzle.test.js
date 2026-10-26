import test from 'node:test';
import assert from 'node:assert/strict';
import { generateJigsawPuzzle } from '../js/generators.js';
import { shapeToWorldPolygons } from '../js/geometry.js';
import { buildXcsProjectString, buildLaserSvgString, importXcsStringToWorkspace, getDefaultLaserSettings } from '../js/export.js';
import { workspacePayload } from '../js/storage.js';

const stages = ['puzzle-horizontal', 'puzzle-vertical', 'puzzle-outline'];
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.02, `${a} != ${b}`);
const stageLayers = xcs => Object.entries(xcs.canvas[0].layerData)
  .filter(([color]) => xcs.canvas[0].displays.some(d => d.layerTag === color && d.bjornsveenShape.cutStage))
  .sort((a, b) => a[1].order - b[1].order);

test('puzzles contain horizontal, vertical and outline stages with each shared edge cut once', () => {
  for (const [cols, rows, seed] of [[2, 2, 1], [4, 3, 42], [16, 16, 9000]]) {
    const puzzle = generateJigsawPuzzle({ cols, rows, seed, widthMm: 157, heightMm: 113 });
    assert.deepEqual(puzzle.map(s => s.cutStage), stages);
    const [horizontal, vertical, outline] = puzzle.map(s => shapeToWorldPolygons(s));
    assert.equal(horizontal.length, rows - 1);
    assert.equal(vertical.length, cols - 1);
    horizontal.forEach((line, index) => {
      assert.equal(line.closed, false);
      near(line[0].x, 20); near(line.at(-1).x, 177);
      near(line[0].y, 20 + (index + 1) * 113 / rows); near(line.at(-1).y, line[0].y);
    });
    vertical.forEach((line, index) => {
      assert.equal(line.closed, false);
      near(line[0].y, 20); near(line.at(-1).y, 133);
      near(line[0].x, 20 + (index + 1) * 157 / cols); near(line.at(-1).x, line[0].x);
    });
    assert.equal(outline.length, 1);
    assert.notEqual(outline[0].closed, false);
    // Open paths must not acquire a closing straight cut through the tabs.
    assert.doesNotMatch(puzzle[0].d + puzzle[1].d, /z/i);
    const again = generateJigsawPuzzle({ cols, rows, seed, widthMm: 157, heightMm: 113 });
    assert.equal(puzzle[0].d, again[0].d); assert.equal(puzzle[1].d, again[1].d);
  }
});

test('XCS schedules puzzle cuts by separate layers regardless of nesting or object order', () => {
  const puzzle = generateJigsawPuzzle();
  const other = { ...puzzle[2], id: 'other', cutStage: undefined };
  const engraving = { ...other, id: 'engrave', laserMode: 'engrave' };
  const score = { ...other, id: 'score', laserMode: 'score' };
  const shapes = [{ id: 'group', type: 'group', children: [puzzle[2], { id: 'nested', type: 'group', children: [puzzle[1], puzzle[0]] }] }, other, score, engraving];
  const before = JSON.stringify(shapes);
  const cfg = getDefaultLaserSettings(); Object.assign(cfg.cut, { power: 72, speed: 13, repeat: 2 });
  for (const machineKey of ['xtool-p3', 'xtool-f2']) {
    const xcs = JSON.parse(buildXcsProjectString(shapes, { machineKey, laserSettings: cfg }));
    const layers = stageLayers(xcs);
    assert.equal(layers.length, 3);
    assert.deepEqual(layers.map(([color]) => xcs.canvas[0].displays.find(d => d.layerTag === color).bjornsveenShape.cutStage), stages);
    const [firstColor, firstLayer] = layers[0];
    assert.notEqual(firstColor, '#ff0000');
    for (const color of ['#000000', '#0000ff', '#ff0000']) assert.ok(xcs.canvas[0].layerData[color].order < firstLayer.order);
    const device = xcs.device.data.value[0][1];
    assert.equal(device.data[device.mode].isProcessByLayer, true);
    assert.equal(device.data[device.mode].processPath, 'layer');
    assert.equal(device.data[device.mode].pathPlanning, 'custom');
    for (const display of xcs.canvas[0].displays.filter(d => d.bjornsveenShape.cutStage)) {
      assert.equal(display.processingType, 'VECTOR_CUTTING');
      const params = display.data.VECTOR_CUTTING.parameter.customize;
      assert.equal(params.power, 72); assert.equal(params.speed, 13); assert.equal(params.repeat, 2);
      assert.deepEqual(device.displays.value.find(([id]) => id === display.id)[1].data, display.data);
    }
  }
  assert.equal(JSON.stringify(shapes), before);
});

test('XCS selection and hidden objects never export unrequested puzzle stages', () => {
  const puzzle = generateJigsawPuzzle();
  const selected = JSON.parse(buildXcsProjectString(puzzle, { onlySelected: true, selectedIds: new Set([puzzle[1].id]) }));
  assert.equal(selected.canvas[0].displays.length, 1);
  assert.equal(stageLayers(selected).length, 1);
  const hidden = JSON.parse(buildXcsProjectString([puzzle[0], { ...puzzle[1], hidden: true }, { ...puzzle[2], laserMode: 'guide' }]));
  assert.equal(hidden.canvas[0].displays.length, 1);
  assert.equal(stageLayers(hidden).length, 1);
});

test('saving and reopening XCS retains cut stages and their order', () => {
  const saved = workspacePayload({ shapes: generateJigsawPuzzle() });
  const restored = importXcsStringToWorkspace(buildXcsProjectString(saved.shapes)).shapes;
  assert.deepEqual(restored.map(s => s.cutStage), stages);
  const xcs = JSON.parse(buildXcsProjectString(restored.reverse()));
  assert.deepEqual(stageLayers(xcs).map(([color]) => xcs.canvas[0].displays.find(d => d.layerTag === color).bjornsveenShape.cutStage), stages);
});

test('SVG exports three ordered color groups, keeping internal paths open', () => {
  const puzzle = generateJigsawPuzzle();
  const svg = buildLaserSvgString([{ id: 'group', type: 'group', children: [...puzzle].reverse() }]);
  const positions = stages.map(id => svg.indexOf(`<g id="${id}"`));
  assert.ok(positions[0] > 0 && positions[0] < positions[1] && positions[1] < positions[2]);
  const paths = [...svg.matchAll(/<path [^>]+>/g)].map(m => m[0]);
  assert.equal(paths.length, 3);
  assert.equal(new Set(paths.map(p => p.match(/stroke="([^"]+)"/)[1])).size, 3);
  paths.forEach((path, index) => assert.ok(path.includes(`data-cut-stage="${stages[index]}"`)));
  for (const path of paths.slice(0, 2)) assert.doesNotMatch(path.match(/ d="([^"]+)"/)[1], /z/i);
});

test('ordinary cuts and puzzle shapes changed to engraving retain their normal processing', () => {
  const puzzle = generateJigsawPuzzle();
  const changed = puzzle.map(s => ({ ...s, laserMode: 'engrave' }));
  const xcs = JSON.parse(buildXcsProjectString(changed));
  assert.equal(Object.keys(xcs.canvas[0].layerData).length, 3);
  assert.ok(xcs.canvas[0].displays.every(d => d.layerTag === '#000000' && d.processingType === 'FILL_VECTOR_ENGRAVING'));
  assert.doesNotMatch(buildLaserSvgString(changed), /data-cut-stage=/);
  const ordinary = JSON.parse(buildXcsProjectString([{ ...puzzle[2], cutStage: undefined }]));
  assert.equal(Object.keys(ordinary.canvas[0].layerData).length, 3);
  assert.equal(ordinary.canvas[0].displays[0].layerTag, '#ff0000');
});
