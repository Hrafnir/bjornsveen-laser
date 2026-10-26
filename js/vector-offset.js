import Clipper from '../vendor/clipper.module.js';
import { shapeToWorldPolygons, createPathShapeFromPolygons } from './geometry.js';
import { openLinePoints, createConnectedPath } from './line-tools.js';
const SCALE = 10000;
const path = loop => loop.map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }));
const union = (paths, fill = Clipper.PolyFillType.pftNonZero) => {
  const clip = new Clipper.Clipper(), result = new Clipper.Paths();
  clip.AddPaths(paths, Clipper.PolyType.ptSubject, true);
  clip.Execute(Clipper.ClipType.ctUnion, result, fill, fill);
  return result;
};
function leafShapes(shapes) {
  return shapes.flatMap(s => s.hidden || s.guideLabel || s.laserMode === 'guide' ? [] : s.type === 'group' ? leafShapes(s.children || []) : [s]);
}

export function createVectorOffset(shapes, offsetMm, { kind = 'contour', join = 'miter', laserMode = 'cut' } = {}) {
  if (!Number.isFinite(offsetMm) || Math.abs(offsetMm) < 0.001 || Math.abs(offsetMm) > 100) throw new Error('Offset må være mellom −100 og 100 mm, og kan ikke være 0.');
  if (kind === 'parallel') {
    if (shapes.length !== 1) throw new Error('Velg én åpen linje eller sti for parallell offset.');
    const points = openLinePoints(shapes[0]);
    if (!points) throw new Error('Parallell offset krever én åpen linje eller kurve.');
    const normals = points.slice(1).map((b, i) => { const a = points[i], len = Math.hypot(b.x - a.x, b.y - a.y); return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }; });
    const out = points.flatMap((p, i) => {
      const a = normals[Math.max(0, i - 1)], b = normals[Math.min(normals.length - 1, i)];
      const den = 1 + a.x * b.x + a.y * b.y;
      if (den < 1e-6) throw new Error('Linjen snur tilbake på seg selv. Del den opp før offset.');
      const dx = (a.x + b.x) * offsetMm / den, dy = (a.y + b.y) * offsetMm / den;
      if (Math.hypot(dx, dy) > 4 * Math.abs(offsetMm)) return [{ x: p.x + a.x * offsetMm, y: p.y + a.y * offsetMm }, { x: p.x + b.x * offsetMm, y: p.y + b.y * offsetMm }];
      return [{ x: p.x + dx, y: p.y + dy }];
    });
    if (out.length === points.length) for (let i = 1; i < out.length; i++) {
      if ((out[i].x-out[i-1].x)*(points[i].x-points[i-1].x)+(out[i].y-out[i-1].y)*(points[i].y-points[i-1].y) <= 1e-8) throw new Error('Offseten vender et linjestykke bakover. Bruk mindre avstand.');
    }
    // Reject foldovers instead of silently making an extra crossing cut.
    const cross = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    for(let i=0;i<out.length-1;i++) for(let j=i+2;j<out.length-1;j++) {
      const a=out[i],b=out[i+1],c=out[j],d=out[j+1];
      if(cross(a,b,c)*cross(a,b,d)<-1e-10 && cross(c,d,a)*cross(c,d,b)<-1e-10) throw new Error('Offsetlinjen krysser seg selv. Bruk mindre avstand.');
    }
    return createConnectedPath(out, { laserMode, name: `Parallell offset (${offsetMm} mm)` });
  }
  if (kind !== 'contour' || !['miter', 'round'].includes(join)) throw new Error('Ukjent offsettype.');
  const closed = [], open = [];
  for (const shape of leafShapes(shapes)) {
    const loops = shapeToWorldPolygons(shape, 0.02);
    const area = loops.filter(l => l.closed !== false && l.length >= 3).map(path);
    // Resolve each object's holes using the same even-odd fill rule as SVG,
    // then union objects. Overlapping selected objects must not cancel out.
    if (area.length) closed.push(...union(area, Clipper.PolyFillType.pftEvenOdd));
    open.push(...loops.filter(l => l.closed === false && l.length >= 2).map(path));
  }
  if (!closed.length && !open.length) throw new Error('Velg minst én figur eller linje.');
  if (open.length && offsetMm < 0) throw new Error('Åpne linjer har ingen innside. Velg positiv konturavstand eller parallell offset.');
  const offset = new Clipper.ClipperOffset(4, 0.01 * SCALE), output = new Clipper.Paths();
  const joinType = join === 'round' ? Clipper.JoinType.jtRound : Clipper.JoinType.jtMiter;
  if (closed.length) offset.AddPaths(union(closed), joinType, Clipper.EndType.etClosedPolygon);
  if (open.length) offset.AddPaths(open, joinType, Clipper.EndType.etOpenRound);
  offset.Execute(output, offsetMm * SCALE);
  if (!output.length) throw new Error('Offseten fjerner hele figuren. Bruk mindre innvendig avstand.');
  const loops = output.map(p => p.map(q => ({ x: q.X / SCALE, y: q.Y / SCALE })));
  const result = createPathShapeFromPolygons(loops, laserMode, `Offset (${offsetMm > 0 ? '+' : ''}${offsetMm} mm)`);
  Object.assign(result, result.origBBox);
  return result;
}
