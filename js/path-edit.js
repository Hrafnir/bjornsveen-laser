import { mapNodes, moveAnchor, cubicAt } from './bezier.js';
import { pathNodesInWorld, rebuildPathShapeFromNodes, uid, dist } from './geometry.js';

const cloneNodes = nodes => mapNodes(nodes, p => ({x:p.x, y:p.y}));
export const isEditablePath = s => s?.type === 'path' && Array.isArray(s.nodes) && s.nodes.length >= 2;
export const isPathEndpoint = (s, i) => isEditablePath(s) && !s.closedPath && (i === 0 || i === s.nodes.length - 1);

function makePath(source, nodes, closed, id = source.id) {
  const shape = {...source, id, nodes:cloneNodes(nodes), nodeModel:'bezier', closedPath:closed, rotation:0, flipX:false, flipY:false};
  delete shape._cachedD; delete shape._cachedRawLoops;
  if (!closed) {
    delete shape.nodes[0].in; delete shape.nodes.at(-1).out;
    // SVG fill implicitly closes open paths. A cut must remain visibly open.
    if (shape.laserMode === 'engrave') shape.laserMode = shape.outlineLaserMode === 'score' ? 'score' : 'cut';
  }
  return rebuildPathShapeFromNodes(shape);
}

// Removing an anchor connects its remaining neighbours. Removing an edge does
// not connect across the gap: it opens a loop or splits a path into pieces.
export function removePathAnchors(shape, indices) {
  const removed = new Set(indices);
  const nodes = pathNodesInWorld(shape).filter((_,i) => !removed.has(i));
  return nodes.length < 2 ? [] : [makePath(shape, nodes, Boolean(shape.closedPath) && nodes.length >= 3)];
}
export function removePathSegments(shape, indices) {
  const nodes = pathNodesInWorld(shape), n = nodes.length, closed = Boolean(shape.closedPath);
  const edges = closed ? n : n-1;
  const removed = new Set(indices.filter(i => Number.isInteger(i) && i>=0 && i<edges));
  if (!removed.size) return [makePath(shape,nodes,closed)];
  const pieces = [], start = closed ? ([...removed][0]+1)%n : 0;
  let run = [nodes[start]];
  for (let step=0; step<edges; step++) {
    const edge = (start+step)%n, next = (edge+1)%n;
    if (removed.has(edge)) { if (run.length>=2) pieces.push(run); run=[nodes[next]]; }
    else run.push(nodes[next]);
  }
  if (!closed && run.length>=2) pieces.push(run);
  return pieces.map((points,i) => makePath(shape,points,false,i?uid('path'):shape.id));
}

const reverse = nodes => [...nodes].reverse().map(n => ({...n,in:n.out,out:n.in}));
export function connectPathEndpoints(a, ai, b, bi) {
  if (!isPathEndpoint(a,ai) || !isPathEndpoint(b,bi)) throw new Error('Velg to endepunkter på åpne stier.');
  if ((a.laserMode||'cut') !== (b.laserMode||'cut') || (a.cutStage||null) !== (b.cutStage||null)) throw new Error('Endepunktene må ha samme laserlag og kutterekkefølge.');
  if (a.id === b.id) {
    if (ai===bi) throw new Error('Velg to forskjellige endepunkter.');
    const nodes = pathNodesInWorld(a);
    if (dist(nodes[0],nodes.at(-1))<1e-6 && nodes.length>2) {
      nodes[0].in=nodes.pop().in; nodes[0].smooth=false;
    } else { delete nodes[0].in; delete nodes.at(-1).out; }
    if (nodes.length<3 && !nodes.some(n=>n.in||n.out)) throw new Error('En rett linje alene kan ikke lukkes til en figur.');
    return makePath(a,nodes,true);
  }
  let left=pathNodesInWorld(a),right=pathNodesInWorld(b);
  if (ai===0) left=reverse(left);
  if (bi!==0) right=reverse(right);
  const last=left.at(-1), first=right[0];
  if (dist(last,first)<1e-6) {
    moveAnchor(first,last); last.out=first.out; last.smooth=false;
    left.push(...right.slice(1));
  } else {
    // A new straight bridge, with the existing adjacent curves unchanged.
    delete last.out; delete first.in; left.push(...right);
  }
  return makePath(a,left,false);
}

export function splitPathSegment(shape,index,t=.5) {
  const nodes=pathNodesInWorld(shape), count=shape.closedPath?nodes.length:nodes.length-1;
  if (!Number.isInteger(index)||index<0||index>=count) throw new Error('Velg et linjestykke først.');
  t=Math.max(.001,Math.min(.999,t));
  const a=nodes[index], b=nodes[(index+1)%nodes.length];
  const mix=(p,q)=>({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});
  let node;
  if(a.out||b.in) {
    const p=mix(a,a.out||a), q=mix(a.out||a,b.in||b), r=mix(b.in||b,b);
    const s=mix(p,q), u=mix(q,r);
    node={...mix(s,u),in:s,out:u,smooth:true}; a.out=p;b.in=r;
  } else node=mix(a,b);
  nodes.splice(index+1,0,node);
  return makePath(shape,nodes,Boolean(shape.closedPath));
}

// Find a parameter for inserting a point. Refinement is done in world space,
// so clicking a scaled, rotated or mirrored segment behaves identically.
export function nearestSegmentParameter(shape,index,point) {
  const nodes=pathNodesInWorld(shape),a=nodes[index],b=nodes[(index+1)%nodes.length];
  const at=t=>cubicAt(a,a.out||a,b.in||b,b,t);
  let best=0, distance=Infinity;
  for(let i=0;i<=64;i++){const d=dist(at(i/64),point);if(d<distance){distance=d;best=i/64;}}
  let lo=Math.max(0,best-1/64),hi=Math.min(1,best+1/64);
  for(let i=0;i<20;i++){const l=lo+(hi-lo)/3,r=hi-(hi-lo)/3;if(dist(at(l),point)<dist(at(r),point))hi=r;else lo=l;}
  // Straight SVG L segments have linear parameterization.
  if(!a.out&&!b.in){const dx=b.x-a.x,dy=b.y-a.y;return Math.max(.001,Math.min(.999,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)));}
  return (lo+hi)/2;
}
