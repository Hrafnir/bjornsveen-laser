import Clipper from '../vendor/clipper.module.js';
import { computePolygonsBBox } from './geometry.js';
import { isoPoint } from './drawing-model.js';
const SCALE=100000, EPS=1e-6;
const integerCache=new WeakMap();
const integer=loops=>{if(!integerCache.has(loops))integerCache.set(loops,loops.map(l=>l.map(p=>({X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)}))));return integerCache.get(loops);};
export function polygonBoolean(subject,clip=[],operation='difference') {
  if(!subject.length)return [];
  const c=new Clipper.Clipper(),out=new Clipper.Paths();
  c.AddPaths(integer(subject),Clipper.PolyType.ptSubject,true);
  if(clip.length)c.AddPaths(integer(clip),Clipper.PolyType.ptClip,true);
  c.Execute({difference:Clipper.ClipType.ctDifference,intersection:Clipper.ClipType.ctIntersection,union:Clipper.ClipType.ctUnion}[operation],out,Clipper.PolyFillType.pftEvenOdd,Clipper.PolyFillType.pftEvenOdd);
  return out.map(l=>l.map(p=>({x:p.X/SCALE,y:p.Y/SCALE})));
}
const depth=p=>p.x+p.y+p.z;
// Orthographic projection has viewing direction (1,1,1). Each planar face's
// depth is affine in paper coordinates. Average face depth cannot resolve holes
// or intersecting walls; compare depth at every overlap instead.
export function projectSurface(worldLoops,extra={}) {
  const loops=worldLoops.map(l=>l.map(isoPoint)),points=loops.flat(),world=worldLoops.flat();
  const a=points[0];if(!a)return null;
  for(let i=1;i<points.length-1;i++){
    const b=points[i],c=points[i+1],dx=b.x-a.x,dy=b.y-a.y,ex=c.x-a.x,ey=c.y-a.y,det=dx*ey-dy*ex;
    if(Math.abs(det)<EPS)continue;
    const dz=depth(world[i])-depth(world[0]),ez=depth(world[i+1])-depth(world[0]);
    const x=(dz*ey-dy*ez)/det,y=(dx*ez-dz*ex)/det;
    return {...extra,loops,bounds:computePolygonsBBox(loops),plane:{x,y,c:depth(world[0])-x*a.x-y*a.y}};
  }
  return null;
}
const overlaps=(a,b)=>a.x<=b.x+b.width+EPS&&b.x<=a.x+a.width+EPS&&a.y<=b.y+b.height+EPS&&b.y<=a.y+a.height+EPS;
const value=(plane,p)=>plane.x*p.x+plane.y*p.y+plane.c;
function halfPlane(plane,bounds) {
  const pad=1,x=bounds.x-pad,y=bounds.y-pad,w=bounds.width+pad*2,h=bounds.height+pad*2;
  const input=[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],out=[];
  for(let i=0;i<input.length;i++){
    const a=input[i],b=input[(i+1)%input.length],da=value(plane,a)-EPS,db=value(plane,b)-EPS;
    if(da>=0)out.push(a);
    if((da>=0)!==(db>=0)){const t=da/(da-db);out.push({x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)});}
  }
  return out.length>=3?[out]:[];
}
export function visibleSurfaceRegions(input) {
  const faces=input.filter(Boolean);
  return faces.map((face,index)=>{
    let visible=face.loops;
    for(let j=0;j<faces.length&&visible.length;j++){
      const other=faces[j];if(other.nonOccluding||j===index||!overlaps(face.bounds,other.bounds))continue;
      const delta={x:other.plane.x-face.plane.x,y:other.plane.y-face.plane.y,c:other.plane.c-face.plane.c};
      const left=Math.max(face.bounds.x,other.bounds.x),right=Math.min(face.bounds.x+face.bounds.width,other.bounds.x+other.bounds.width),top=Math.max(face.bounds.y,other.bounds.y),bottom=Math.min(face.bounds.y+face.bounds.height,other.bounds.y+other.bounds.height);
      const values=[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}].map(p=>value(delta,p));
      if(Math.max(...values)<=EPS)continue;
      const front=Math.min(...values)>EPS?other.loops:polygonBoolean(other.loops,halfPlane(delta,other.bounds),'intersection');
      if(front.length)visible=polygonBoolean(visible,front);
    }
    return {...face,visible};
  }).filter(f=>f.visible.length);
}
