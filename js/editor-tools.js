import { shapeToWorldPolygons, getShapesBBox, pointInMultiPolygon, dist } from './geometry.js';
import { openLinePoints } from './line-tools.js';

export function vectorLeaves(shapes) {
  return shapes.flatMap(s => s.hidden || s.guideLabel || s.laserMode === 'guide' ? [] : s.type === 'group' ? vectorLeaves(s.children || []) : s.type === 'image' ? [] : [s]);
}
export function canFillShape(shape) {
  const loops = shapeToWorldPolygons(shape);
  return loops.length > 0 && loops.every(l => l.closed !== false && l.length >= 3);
}
export function setShapeAppearance(shapes, filled) {
  const leaves = vectorLeaves(shapes);
  if (!leaves.length) throw new Error('Velg en vektorfigur først.');
  if (filled && leaves.some(s => !canFillShape(s))) throw new Error('Fylt figur krever lukkede konturer. Koble endene på linjen først.');
  for (const s of leaves) {
    if (filled) {
      if (s.laserMode === 'cut' || s.laserMode === 'score') s.outlineLaserMode = s.laserMode;
      s.laserMode = 'engrave';
    } else s.laserMode = s.laserMode === 'score' ? 'score' : s.outlineLaserMode === 'score' ? 'score' : 'cut';
  }
}

const contains = (r, p) => p.x >= r.x - 1e-8 && p.x <= r.x + r.width + 1e-8 && p.y >= r.y - 1e-8 && p.y <= r.y + r.height + 1e-8;
function segmentTouchesRect(a, b, r) {
  // Liang–Barsky clipping, including boundary/corner contact and zero-length edges.
  let lo = 0, hi = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy], q = [a.x - r.x, r.x + r.width - a.x, a.y - r.y, r.y + r.height - a.y];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) { if (q[i] < -1e-8) return false; }
    else { const u = q[i] / p[i]; if (p[i] < 0) lo = Math.max(lo, u); else hi = Math.min(hi, u); }
    if (lo > hi + 1e-8) return false;
  }
  return true;
}
export function shapeTouchesSelection(shape, rect) {
  if (shape.hidden || shape.guideLabel) return false;
  if (shape.type === 'group') return (shape.children || []).some(s => shapeTouchesSelection(s, rect));
  const loops = shapeToWorldPolygons(shape, 0.05);
  for (const loop of loops) {
    if (loop.some(p => contains(rect, p))) return true;
    const n = loop.closed === false ? loop.length - 1 : loop.length;
    for (let i = 0; i < n; i++) if (segmentTouchesRect(loop[i], loop[(i + 1) % loop.length], rect)) return true;
  }
  if (shape.laserMode === 'engrave' || shape.type === 'image') {
    return pointInMultiPolygon({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, loops.filter(l => l.closed !== false));
  }
  return false;
}

function endpoints(shapes) {
  return shapes.flatMap(s => {
    if (s.hidden || s.guideLabel || s.laserMode === 'guide') return [];
    if (s.type === 'group') return endpoints(s.children || []);
    const points = openLinePoints(s);
    return points ? [points[0], points.at(-1)] : [];
  });
}
export function snapTranslation(moving, targets, delta, radius) {
  const result = { ...delta, snapX: false, snapY: false, guides: [] };
  const targetPoints = endpoints(targets), movingPoints = endpoints(moving);
  let best = null;
  for (const p of movingPoints) for (const q of targetPoints) {
    const distance = dist({ x: p.x + delta.x, y: p.y + delta.y }, q);
    if (distance <= radius && (!best || distance < best.distance)) best = { distance, p, q };
  }
  if (best) return { x: best.q.x - best.p.x, y: best.q.y - best.p.y, snapX: true, snapY: true, point: best.q, guides: [] };
  const b = getShapesBBox(moving);
  const moved = { x: b.x + delta.x, y: b.y + delta.y, width: b.width, height: b.height };
  let bx = radius + 1e-8, by = radius + 1e-8;
  for (const s of targets) {
    if (s.hidden || s.guideLabel || s.laserMode === 'guide') continue;
    const t = getShapesBBox([s]);
    const overlapsY = moved.y <= t.y + t.height + radius && moved.y + moved.height >= t.y - radius;
    const overlapsX = moved.x <= t.x + t.width + radius && moved.x + moved.width >= t.x - radius;
    if (overlapsY) for (const a of [moved.x, moved.x + moved.width / 2, moved.x + moved.width]) for (const v of [t.x, t.x + t.width / 2, t.x + t.width]) {
      if (Math.abs(v - a) < bx) { bx = Math.abs(v - a); result.x = delta.x + v - a; result.snapX = true; result.guideX = v; }
    }
    if (overlapsX) for (const a of [moved.y, moved.y + moved.height / 2, moved.y + moved.height]) for (const v of [t.y, t.y + t.height / 2, t.y + t.height]) {
      if (Math.abs(v - a) < by) { by = Math.abs(v - a); result.y = delta.y + v - a; result.snapY = true; result.guideY = v; }
    }
  }
  return result;
}
