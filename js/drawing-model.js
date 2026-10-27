import { uid, shapeToWorldPolygons, computePolygonsBBox, rotatePoint } from './geometry.js';
import { objectSnapPoints } from './point-snap.js';

export const PAPER_SIZES = { A4: [297,210], A3: [420,297] };
export const MATERIAL_COLORS = { wood:'#d9b88b', mdf:'#bd9971', acrylic:'#9dcbd7', metal:'#bec7d2', white:'#edf0f3' };
export const drawingLeaves = shapes => shapes.flatMap(s => s.hidden || s.guideLabel || s.laserMode==='guide' ? [] : s.type==='group' ? drawingLeaves(s.children||[]) : [s]);
export function drawingSourceMap(shapes) {
  const map=new Map();
  function visit(list,hidden=false){for(const s of list){if(hidden||s.hidden||s.guideLabel||s.laserMode==='guide')continue;map.set(s.id,s);if(s.type==='group')visit(s.children||[]);}}
  visit(shapes);return map;
}
export function drawingShapeLoops(shape) {
  if(shape.type==='image'&&Array.isArray(shape.imageMeta?.puzzleClip)&&shape.imageMeta.puzzleClip.length){
    const c={x:shape.x+shape.width/2,y:shape.y+shape.height/2};
    return shape.imageMeta.puzzleClip.map(loop=>loop.map(p=>rotatePoint({x:shape.x+(shape.flipX?1-p.x:p.x)*shape.width,y:shape.y+(shape.flipY?1-p.y:p.y)*shape.height},c,shape.rotation||0)));
  }
  return shapeToWorldPolygons(shape,.15);
}
export function sourceGeometry(shape) {
  const leaves=drawingLeaves([shape]);
  const loops=leaves.flatMap(drawingShapeLoops);
  const bounds=computePolygonsBBox(loops);
  return {leaves,bounds,loops};
}
export function newDrawingItem(shape) {
  const {bounds,leaves}=sourceGeometry(shape);
  return {id:uid('drawing-part'),sourceId:shape.id,name:shape.name||'Del',x:bounds.x,y:bounds.y,assemblyX:bounds.x,assemblyY:bounds.y,assemblyRotation:0,z:0,rotation:0,plane:'xy',visible:true,
    solid:leaves.some(s=>s.type==='image'||(s.laserMode==='cut'&&shapeToWorldPolygons(s).some(l=>l.closed!==false&&l.length>2)))};
}
export function createDrawingDocument(shapes,settings={},materialName='') {
  const preset=settings.presetKey||'';
  return {version:1,title:'Arbeidstegning',project:'',author:'',revision:'A',date:new Date().toLocaleDateString('sv-SE'),notes:'',paper:'A4',scale:'auto',material:materialName||'Materiale',thickness:Number(settings.thicknessMm)||0,
    finish:preset.includes('mdf')?'mdf':preset.includes('acrylic')?'acrylic':preset.includes('alu')?'metal':'wood',autoDimensions:true,includeDetails:true,
    items:shapes.filter(s=>!s.hidden&&drawingLeaves([s]).length).map(newDrawingItem),dimensions:[]};
}
// Read legacy/partial metadata defensively; never mutate a source workspace.
export function normalizeDrawingDocument(raw,shapes,settings={},materialName='') {
  if(!raw||raw.version!==1)return createDrawingDocument(shapes,settings,materialName);
  const doc={...createDrawingDocument([],settings,materialName),...structuredClone(raw)};
  for(const key of ['title','project','author','revision','date','notes','material'])doc[key]=String(doc[key]??'').slice(0,key==='notes'?3000:180);
  doc.paper=Object.hasOwn(PAPER_SIZES,doc.paper)?doc.paper:'A4';
  doc.finish=Object.hasOwn(MATERIAL_COLORS,doc.finish)?doc.finish:'wood';
  doc.scale=['auto','0.1','0.2','0.5','1','2','5'].includes(String(doc.scale))?String(doc.scale):'auto';
  doc.thickness=Number.isFinite(Number(doc.thickness))?Math.max(0,Math.min(100,Number(doc.thickness))):0;
  const seen=new Set();
  doc.items=(Array.isArray(doc.items)?doc.items:[]).filter(p=>p&&typeof p.id==='string'&&typeof p.sourceId==='string'&&!seen.has(p.id)&&seen.add(p.id)).map(p=>{
    const q={...p};for(const k of ['x','y','z','rotation'])q[k]=Number.isFinite(Number(p[k]))?Math.max(-100000,Math.min(100000,Number(p[k]))):0;
    for(const [k,fallback] of [['assemblyX','x'],['assemblyY','y'],['assemblyRotation','rotation']])q[k]=Number.isFinite(Number(p[k]))?Math.max(-100000,Math.min(100000,Number(p[k]))):q[fallback];
    q.name=String(p.name||'Del').slice(0,180);q.plane=['xy','xz','yz'].includes(p.plane)?p.plane:'xy';q.visible=p.visible!==false;q.solid=p.solid!==false;
    if(q.thickness!=null)q.thickness=Math.max(0,Math.min(100,Number(q.thickness)||0));return q;
  });
  doc.dimensions=(Array.isArray(doc.dimensions)?doc.dimensions:[]).filter(d=>d&&d.a&&d.b&&[d.a.u,d.a.v,d.b.u,d.b.v].every(Number.isFinite)).map(d=>({...d,kind:['aligned','horizontal','vertical'].includes(d.kind)?d.kind:'aligned',offset:Number.isFinite(d.offset)?Math.max(-1000,Math.min(1000,d.offset)):10}));
  return doc;
}
export function drawingParts(doc,shapes) {
  const sources=drawingSourceMap(shapes);
  return doc.items.filter(i=>i.visible!==false&&sources.has(i.sourceId)).map(item=>{
    const source=sources.get(item.sourceId),geometry=sourceGeometry(source);
    return {item,source,...geometry,thickness:item.thickness??doc.thickness};
  }).filter(p=>p.leaves.length);
}
export function flatPoint(part,p) {
  const b=part.bounds,c={x:b.width/2,y:b.height/2};
  const q=rotatePoint(p,c,part.item.rotation||0);return{x:q.x+part.item.x,y:q.y+part.item.y};
}
export function unflatPoint(part,p) {
  return rotatePoint({x:p.x-part.item.x,y:p.y-part.item.y},{x:part.bounds.width/2,y:part.bounds.height/2},-(part.item.rotation||0));
}
export function point3d(part,p,depth=0) {
  // X/Y locate the center projected onto the ground; Z is the plate's base.
  const b=part.bounds,u=p.x-b.width/2,v=p.y-b.height/2;
  let x=u,y=v,z=depth;
  if(part.item.plane==='xz'){y=-depth;z=b.height-p.y;}
  if(part.item.plane==='yz'){x=depth;y=u;z=b.height-p.y;}
  const angle=(part.item.assemblyRotation??part.item.rotation??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return{x:(part.item.assemblyX??part.item.x)+b.width/2+x*c-y*s,y:(part.item.assemblyY??part.item.y)+b.height/2+x*s+y*c,z:part.item.z+z};
}
export const isoPoint=p=>({x:(p.x-p.y)*Math.sqrt(3)/2,y:(p.x+p.y)/2-p.z});
export function dimensionAnchor(part,scenePoint) {
  const p=unflatPoint(part,scenePoint);return{itemId:part.item.id,u:part.bounds.width?p.x/part.bounds.width:0,v:part.bounds.height?p.y/part.bounds.height:0};
}
export function resolveAnchor(ref,parts) {
  const part=parts.find(p=>p.item.id===ref.itemId);return part?flatPoint(part,{x:ref.u*part.bounds.width,y:ref.v*part.bounds.height}):null;
}
export function dimensionValue(d,parts) {
  const a=resolveAnchor(d.a,parts),b=resolveAnchor(d.b,parts);if(!a||!b)return null;
  return d.kind==='horizontal'?Math.abs(b.x-a.x):d.kind==='vertical'?Math.abs(b.y-a.y):Math.hypot(b.x-a.x,b.y-a.y);
}
export function partSnapPoints(part) {
  const b=part.bounds;
  const points=objectSnapPoints([part.source]).map(p=>({x:p.point.x-b.x,y:p.point.y-b.y}));
  points.push({x:0,y:0},{x:b.width,y:0},{x:b.width,y:b.height},{x:0,y:b.height},{x:b.width/2,y:b.height/2});
  return points.map(p=>flatPoint(part,p));
}
export function syncDrawingSources(doc,shapes) {
  const ids=new Set(doc.items.map(i=>i.sourceId));
  const hasUsedChild=s=>s.type==='group'&&(s.children||[]).some(c=>ids.has(c.id)||hasUsedChild(c));
  for(const shape of shapes)if(!ids.has(shape.id)&&!hasUsedChild(shape)&&!shape.hidden&&drawingLeaves([shape]).length)doc.items.push(newDrawingItem(shape));
  return doc;
}
export function splitDrawingGroup(doc,item,shapes) {
  const source=drawingSourceMap(shapes).get(item.sourceId);if(source?.type!=='group')return false;
  const parent=sourceGeometry(source);
  // Splitting a tilted group would require arbitrary 3D transforms, so flatten
  // first explicitly rather than silently moving its components into new planes.
  if(item.plane!=='xy')throw Error('Legg gruppen flatt før du deler den opp i tegningen.');
  const parts=(source.children||[]).filter(s=>!s.hidden&&drawingLeaves([s]).length).map(shape=>{
    const child=newDrawingItem(shape),b=sourceGeometry(shape).bounds;
    const center=flatPoint({item,bounds:parent.bounds},{x:b.x-parent.bounds.x+b.width/2,y:b.y-parent.bounds.y+b.height/2});
    const assembled=point3d({item,bounds:parent.bounds},{x:b.x-parent.bounds.x+b.width/2,y:b.y-parent.bounds.y+b.height/2});
    return {...child,x:center.x-b.width/2,y:center.y-b.height/2,assemblyX:assembled.x-b.width/2,assemblyY:assembled.y-b.height/2,assemblyRotation:item.assemblyRotation??item.rotation,z:item.z,rotation:item.rotation,thickness:item.thickness};
  });
  doc.items.splice(doc.items.indexOf(item),1,...parts);
  doc.dimensions=doc.dimensions.filter(d=>d.a.itemId!==item.id&&d.b.itemId!==item.id);return true;
}
