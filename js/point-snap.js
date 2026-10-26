import { shapeToWorldPolygons, pathNodesInWorld, rotatePoint, dist } from './geometry.js';

// Use the same box/flip/rotation transform as the rendered path, but keep only
// its editable nodes, not the tessellation points between curve nodes.
export function pathNodeWorldPoints(shape) {
  if (!Array.isArray(shape.nodes) || !shape.nodes.length) return [];
  return pathNodesInWorld(shape).map(p => ({x:p.x,y:p.y}));
}

function shapePoints(shape) {
  if (shape.type === 'path' && shape.nodes?.length) return pathNodeWorldPoints(shape);
  const { x, y, width: w, height: h } = shape;
  const center = { x: x + w / 2, y: y + h / 2 };
  const world = points => points.map(p => rotatePoint(p, center, Number(shape.rotation) || 0));
  if (shape.type === 'ellipse') return world([
    { x, y: center.y }, { x: center.x, y }, { x: x + w, y: center.y }, { x: center.x, y: y + h }
  ]);
  if (shape.type === 'rect' && Number(shape.rx) > 0.05) {
    const r = Math.min(Number(shape.rx), w / 2, h / 2);
    // Tangency points are on the rounded contour; the missing sharp corners aren't.
    return world([
      { x: x + r, y }, { x: x + w - r, y }, { x: x + w, y: y + r }, { x: x + w, y: y + h - r },
      { x: x + w - r, y: y + h }, { x: x + r, y: y + h }, { x, y: y + h - r }, { x, y: y + r }
    ]);
  }
  const loops = shapeToWorldPolygons(shape, 0.05);
  if (shape.type === 'line') return loops.flatMap(loop => loop.length ? [loop[0], loop.at(-1)] : []);
  return loops.flat();
}

export function objectSnapPoints(shapes, { excludeIds = new Set() } = {}) {
  const result = [];
  function visit(list) {
    for (const shape of list) {
      if (excludeIds.has(shape.id) || shape.hidden || shape.guideLabel || shape.type === 'text' || shape.type === 'image') continue;
      if (shape.type === 'group') { visit(shape.children || []); continue; }
      shapePoints(shape).forEach((point, index) => {
        if (Number.isFinite(point.x) && Number.isFinite(point.y)) result.push({ shapeId: shape.id, point, index });
      });
    }
  }
  visit(shapes);
  return result;
}

export function findObjectSnapPoint(shapes, point, radius, options) {
  let best = null;
  for (const candidate of objectSnapPoints(shapes, options)) {
    const distance = dist(candidate.point, point);
    if (distance <= radius && (!best || distance < best.distance)) best = { ...candidate, distance };
  }
  return best;
}
