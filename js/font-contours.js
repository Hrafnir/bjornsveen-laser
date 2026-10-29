import Clipper from '../vendor/clipper.module.js';
const SCALE=100000;
// OpenType uses non-zero winding: overlapping components are ink, not holes.
// Resolve them into disjoint contours that remain correct with SVG even-odd fill
// and have no internal overlap edges when sent to the laser as cut paths.
export function cleanFontContours(loops) {
  const closed=loops.filter(p=>p.closed!==false&&p.length>=3);
  if(!closed.length)return loops;
  const clip=new Clipper.Clipper(),result=new Clipper.Paths();clip.StrictlySimple=true;
  clip.AddPaths(closed.map(loop=>loop.map(p=>({X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)}))),Clipper.PolyType.ptSubject,true);
  if(!clip.Execute(Clipper.ClipType.ctUnion,result,Clipper.PolyFillType.pftNonZero,Clipper.PolyFillType.pftNonZero))throw Error('Kunne ikke rydde bokstavkonturene.');
  return [...result.map(path=>{const loop=path.map(p=>({x:p.X/SCALE,y:p.Y/SCALE}));loop.closed=true;return loop}),...loops.filter(p=>p.closed===false)];
}
export function strokeFontPaths(strokes,width) {
  const offset=new Clipper.ClipperOffset(2,.0005*SCALE),result=new Clipper.Paths();
  offset.AddPaths(strokes.map(stroke=>stroke.map(p=>({X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)}))),Clipper.JoinType.jtRound,Clipper.EndType.etOpenRound);
  offset.Execute(result,width*SCALE/2);
  return result.map(path=>path.map(p=>({x:p.X/SCALE,y:p.Y/SCALE})));
}
export function stencilFontContours(loops,width){
  const toPath=loop=>loop.map(p=>({X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)}));
  const paths=loops.map(toPath),holes=paths.filter(p=>Clipper.Clipper.Area(p)<0);if(!holes.length)return loops;
  const right=Math.max(...loops.flat().map(p=>p.x))+width,bridges=holes.map(hole=>{
    const xs=hole.map(p=>p.X/SCALE),ys=hole.map(p=>p.Y/SCALE),x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2;
    return toPath([{x,y:y-width/2},{x:right,y:y-width/2},{x:right,y:y+width/2},{x,y:y+width/2}]);
  });
  const clip=new Clipper.Clipper(),result=new Clipper.Paths();clip.AddPaths(paths,Clipper.PolyType.ptSubject,true);clip.AddPaths(bridges,Clipper.PolyType.ptClip,true);
  clip.Execute(Clipper.ClipType.ctDifference,result,Clipper.PolyFillType.pftNonZero,Clipper.PolyFillType.pftNonZero);
  return result.map(path=>path.map(p=>({x:p.X/SCALE,y:p.Y/SCALE})));
}
