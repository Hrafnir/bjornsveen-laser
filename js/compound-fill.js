import Clipper from '../vendor/clipper.module.js';
import { shapeToWorldPolygons, createPathShapeFromPolygons } from './geometry.js';
import { inheritDisplayColor } from './appearance.js';
const SCALE = 10000;

function collectContours(shapes) {
  const leaves = [];
  const visit = shape => {
    // Never discard unrelated hidden objects, guides or photos when replacing a group.
    if (shape.hidden || shape.guideLabel || shape.laserMode === 'guide' || shape.type === 'image') {
      throw new Error('Velg bare synlige vektorformer. Gå inn i gruppen for å velge konturene uten bilder eller hjelpelinjer.');
    }
    if (shape.type === 'group') (shape.children || []).forEach(visit);
    else leaves.push(shape);
  };
  shapes.forEach(visit);
  const contours = leaves.flatMap(shape => {
    const loops = shapeToWorldPolygons(shape, 0.15);
    if (!loops.length || loops.some(loop => loop.closed === false || loop.length < 3)) {
      throw new Error('Gravering mellom konturer krever lukkede former. Koble linjeendene først.');
    }
    return loops;
  });
  if (contours.length < 2) throw new Error('Velg ytterkonturen og minst én innerkontur, gjerne som en gruppe.');
  return { contours, leaves };
}

export function canEngraveBetweenContours(shapes) {
  try { collectContours(shapes); return true; } catch { return false; }
}

export function createBetweenEngraving(shapes) {
  const { contours, leaves } = collectContours(shapes);
  const clip = new Clipper.Clipper(), result = new Clipper.Paths();
  clip.AddPaths(contours.map(loop => loop.map(p => ({X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)}))), Clipper.PolyType.ptSubject, true);
  // Alternate filled/empty regions at each boundary, independent of object order or winding.
  clip.Execute(Clipper.ClipType.ctUnion, result, Clipper.PolyFillType.pftEvenOdd, Clipper.PolyFillType.pftEvenOdd);
  if (!result.length) throw new Error('Konturene dekker hverandre helt. Det er ikke noe område mellom dem å gravere.');
  const loops = result.map(loop => loop.map(p => ({x:p.X/SCALE,y:p.Y/SCALE})));
  const shape = createPathShapeFromPolygons(loops, 'engrave', 'Gravering mellom konturer');
  Object.assign(shape, shape.origBBox);
  // Follow the outer object's appearance even when it is at the front of the selection.
  const outer = leaves.reduce((a,b) => a.width*a.height >= b.width*b.height ? a : b);
  shape.outlineLaserMode = 'cut';
  return inheritDisplayColor(shape, outer);
}
