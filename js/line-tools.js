import { shapeToWorldPolygons, createPathShapeFromPolygons, dist } from './geometry.js';

// Only a single open contour can join a chain. In particular, do not join
// generated flex slit collections, closed outlines, text or grouped parts.
export function openLinePoints(shape) {
  if (!shape || shape.hidden || !['line', 'path'].includes(shape.type)) return null;
  const loops = shapeToWorldPolygons(shape, 0.05);
  if (loops.length !== 1 || loops[0].closed !== false) return null;
  const points = loops[0].filter((p, i, all) => i === 0 || dist(p, all[i - 1]) > 1e-7).map(p => ({ x: p.x, y: p.y }));
  if (points.length < 2 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  return points;
}

export function findLineEndpoint(shapes, point, radius, options = {}) {
  let best = null;
  for (const shape of shapes) {
    if (options.excludeIds?.has(shape.id)) continue;
    if (options.laserMode && (shape.laserMode || 'cut') !== options.laserMode) continue;
    if ('cutStage' in options && (shape.cutStage || null) !== (options.cutStage || null)) continue;
    const points = openLinePoints(shape);
    if (!points) continue;
    for (const index of [0, points.length - 1]) {
      const distance = dist(points[index], point);
      if (distance <= radius && (!best || distance < best.distance)) best = { shapeId: shape.id, point: points[index], index, distance };
    }
  }
  return best;
}

export function constrainLinePoint(anchor, point, shift) {
  if (!anchor || !shift) return { ...point };
  const length = dist(anchor, point), angle = Math.round(Math.atan2(point.y - anchor.y, point.x - anchor.x) / (Math.PI / 12)) * Math.PI / 12;
  return { x: anchor.x + length * Math.cos(angle), y: anchor.y + length * Math.sin(angle) };
}

export function createConnectedPath(points, { closed = false, laserMode = 'cut', cutStage, name } = {}) {
  const nodes = points.filter((p, i, all) => i === 0 || dist(p, all[i - 1]) > 1e-6).map(p => ({ x: p.x, y: p.y }));
  if (closed && nodes.length > 2 && dist(nodes[0], nodes.at(-1)) < 1e-6) nodes.pop();
  if (nodes.length < (closed ? 3 : 2)) throw new Error('Legg til flere forskjellige punkter før du fullfører.');
  const loop = nodes.map(p => ({ ...p })); loop.closed = closed;
  const shape = createPathShapeFromPolygons([loop], laserMode, name || (closed ? 'Sammenkoblet form' : 'Sammenhengende linje'));
  // Keep snapping exact even when original endpoints are off the grid.
  Object.assign(shape, shape.origBBox);
  shape.nodes = nodes; shape.closedPath = closed; shape.curved = false;
  if (cutStage) shape.cutStage = cutStage;
  return shape;
}

export function joinOpenPaths(shapes, tolerance = 0.5) {
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 5) throw new Error('Koblingsavstand må være mellom 0 og 5 mm.');
  if (shapes.length < 2) throw new Error('Velg minst to åpne linjer eller stier.');
  const mode = shapes[0].laserMode || 'cut', stage = shapes[0].cutStage || null;
  if (shapes.some(s => (s.laserMode || 'cut') !== mode || (s.cutStage || null) !== stage)) throw new Error('Linjene må ha samme laserlag og kutterekkefølge.');
  const paths = shapes.map(openLinePoints);
  if (paths.some(p => !p)) throw new Error('Velg bare åpne enkeltlinjer eller stier. Løs opp grupper ved behov.');
  const ends = paths.flatMap((points, path) => [{ point: points[0], path, side: 0 }, { point: points.at(-1), path, side: 1 }]);
  const mates = ends.map((end, i) => ends.flatMap((other, j) => i !== j && end.path !== other.path && dist(end.point, other.point) <= tolerance + 1e-7 ? [j] : []));
  if (mates.some(m => m.length > 1)) throw new Error('Flere endepunkter møtes samme sted. Velg én ubrutt kjede, eller reduser koblingsavstanden.');
  const free = mates.flatMap((m, i) => m.length ? [] : [i]);
  if (![0, 2].includes(free.length)) throw new Error('Linjene henger ikke sammen. Tegn forbindelsen med L eller øk koblingsavstanden.');
  const start = free[0] ?? 0, visited = new Set(), nodes = [];
  let current = start;
  while (!visited.has(ends[current].path)) {
    const end = ends[current], source = paths[end.path];
    visited.add(end.path);
    const points = (end.side === 0 ? source : [...source].reverse()).map(p => ({ ...p }));
    if (nodes.length) {
      const last = nodes.at(-1), first = points[0], mid = { x: (last.x + first.x) / 2, y: (last.y + first.y) / 2 };
      nodes[nodes.length - 1] = mid; points[0] = mid; nodes.push(...points.slice(1));
    } else nodes.push(...points);
    const exit = end.path * 2 + (end.side === 0 ? 1 : 0);
    if (!mates[exit].length) break;
    current = mates[exit][0];
  }
  if (visited.size !== paths.length) throw new Error('Utvalget inneholder flere separate kjeder. Koble én kjede om gangen.');
  const closed = free.length === 0;
  if (closed) {
    const a = nodes[0], b = nodes.at(-1);
    nodes[0] = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; nodes.pop();
  }
  return createConnectedPath(nodes, { closed, laserMode: mode, cutStage: stage });
}
