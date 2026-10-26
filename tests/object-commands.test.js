import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeClipboard, decodeClipboard, cloneWithFreshIds, reorderObjects } from '../js/object-commands.js';
const shape = (id, props = {}) => ({ id, type: 'rect', x: 12, y: 18, width: 40, height: 30, laserMode: 'engrave', ...props });
const list = ['a','b','c','d','e'].map(id => shape(id));
const order = (ids, direction) => reorderObjects(list, new Set(ids), direction).map(s => s.id).join('');
test('stacking keeps multi-selection stable at every boundary and leaves the source intact', () => {
  assert.equal(order(['b','c'], 'forward'), 'adbce');
  assert.equal(order(['b','d'], 'forward'), 'acbed');
  assert.equal(order(['b','d'], 'backward'), 'badce');
  assert.equal(order(['a','e'], 'front'), 'bcdae');
  assert.equal(order(['b','d'], 'back'), 'bdace');
  assert.equal(order(['d','e'], 'forward'), 'abcde');
  assert.equal(order(['a','b'], 'backward'), 'abcde');
  assert.equal(order(['a','b','c','d','e'], 'front'), 'abcde');
  assert.equal(list.map(s => s.id).join(''), 'abcde');
});
test('native clipboard roundtrip preserves groups, laser stages, images, names and hidden children without caches', () => {
  const input = [shape('g', {type:'group', children:[shape('p', {cutStage:'horizontal', nodes:[{x:1,y:2}], _cachedPath:'cache'}), shape('image', {type:'image', hidden:true, srcDataUrl:'data:image/png;base64,abc', exportDataUrl:'cache'})]})];
  const result = decodeClipboard(encodeClipboard(input));
  assert.equal(result[0].children[0].cutStage, 'horizontal');
  assert.deepEqual(result[0].children[0].nodes, [{x:1,y:2}]);
  assert.equal(result[0].children[0]._cachedPath, undefined);
  assert.equal(result[0].children[1].hidden, true);
  assert.equal(result[0].children[1].srcDataUrl, 'data:image/png;base64,abc');
  assert.equal(result[0].children[1].exportDataUrl, undefined);
});
test('each paste gets fresh IDs and internal references, while detached text retains its custom path', () => {
  const source = [shape('group', {type:'group', children:[shape('path'), shape('text', {textMeta:{customPathSourceId:'path',customPath:[{x:3,y:8}]}})]})];
  const copy = cloneWithFreshIds(source), second = cloneWithFreshIds(source);
  assert.notEqual(copy[0].id, source[0].id);
  assert.notEqual(copy[0].id, second[0].id);
  assert.equal(copy[0].children[1].textMeta.customPathSourceId, copy[0].children[0].id);
  const detached = cloneWithFreshIds([source[0].children[1]])[0];
  assert.equal(detached.textMeta.customPathSourceId, undefined);
  assert.deepEqual(detached.textMeta.customPath, [{x:3,y:8}]);
  assert.equal(source[0].children[1].textMeta.customPathSourceId, 'path');
});
test('unsupported or invalid native clipboard data is rejected before insertion', () => {
  assert.equal(decodeClipboard('Hei'), null);
  assert.equal(decodeClipboard('<svg/>'), null);
  assert.throws(() => decodeClipboard(encodeClipboard([shape('bad', {x:null})])));
  assert.throws(() => decodeClipboard(encodeClipboard([shape('bad', {type:'unknown'})])));
  assert.throws(() => decodeClipboard(encodeClipboard([shape('bad', {type:'group'})])));
});
