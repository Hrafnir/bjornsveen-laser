import { uid } from './geometry.js';
import { workspacePayload } from './storage.js';

export const CLIPBOARD_MIME = 'application/x-laserstudio-shapes';
const FORMAT = 'bjornsveen-laserstudio/clipboard';
const TYPES = new Set(['rect', 'ellipse', 'polygon', 'star', 'heart', 'line', 'path', 'text', 'image', 'group']);

export function encodeClipboard(shapes) {
  return JSON.stringify({ format: FORMAT, version: 1, shapes: workspacePayload({ shapes }).shapes });
}

// Return null for ordinary text/SVG; reject malformed native clipboard data.
export function decodeClipboard(text) {
  if (!text.trim().startsWith('{')) return null;
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (data?.format !== FORMAT) return null;
  if (data.version !== 1 || !Array.isArray(data.shapes) || !data.shapes.length) throw new Error('Ugyldige objektdata på utklippstavlen.');
  let count = 0;
  function validate(shape, depth = 0) {
    if (++count > 10000 || depth > 30 || !shape || !TYPES.has(shape.type) ||
      !['x', 'y', 'width', 'height'].every(k => Number.isFinite(shape[k])) || shape.width < 0 || shape.height < 0 ||
      (shape.laserMode != null && !['cut', 'score', 'engrave', 'guide'].includes(shape.laserMode))) {
      throw new Error('Ugyldig objekt på utklippstavlen.');
    }
    if (shape.children && shape.type !== 'group') throw new Error('Ugyldig objektstruktur på utklippstavlen.');
    if (shape.type === 'group') {
      if (!Array.isArray(shape.children)) throw new Error('Ugyldig gruppe på utklippstavlen.');
      shape.children.forEach(child => validate(child, depth + 1));
    }
  }
  data.shapes.forEach(shape => validate(shape));
  return data.shapes;
}

export function cloneWithFreshIds(shapes) {
  const copies = workspacePayload({ shapes }).shapes;
  const ids = new Map();
  const visit = (list, fn) => list.forEach(shape => { fn(shape); if (shape.children) visit(shape.children, fn); });
  visit(copies, shape => { const id = uid(shape.type); ids.set(shape.id, id); shape.id = id; });
  visit(copies, shape => {
    if (shape.textMeta?.customPathSourceId) {
      const replacement = ids.get(shape.textMeta.customPathSourceId);
      if (replacement) shape.textMeta.customPathSourceId = replacement;
      else delete shape.textMeta.customPathSourceId;
    }
  });
  return copies;
}

// Lists use SVG paint order: the final object is in front. Keep selected order stable.
export function reorderObjects(list, selectedIds, direction) {
  const result = [...list];
  const selected = shape => selectedIds.has(shape.id);
  if (direction === 'front') return [...result.filter(s => !selected(s)), ...result.filter(selected)];
  if (direction === 'back') return [...result.filter(selected), ...result.filter(s => !selected(s))];
  if (direction === 'forward') {
    for (let i = result.length - 2; i >= 0; i--) {
      if (selected(result[i]) && !selected(result[i + 1])) [result[i], result[i + 1]] = [result[i + 1], result[i]];
    }
  } else if (direction === 'backward') {
    for (let i = 1; i < result.length; i++) {
      if (selected(result[i]) && !selected(result[i - 1])) [result[i], result[i - 1]] = [result[i - 1], result[i]];
    }
  }
  return result;
}
