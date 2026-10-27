import { createPathShapeFromPolygons, parseSvgPathToPolygons } from '../js/geometry.js';
import { buildBoxModel } from '../js/box-generator.js';
import { buildXcsProjectString, importXcsStringToWorkspace } from '../js/export.js';
import { normalizeDrawingDocument } from '../js/drawing-model.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectSurface, visibleSurfaceRegions, polygonBoolean } from '../js/drawing-surfaces.js';
import { createDrawingDocument, drawingParts, point3d } from '../js/drawing-model.js';
import { renderDrawingGeometry, renderDrawingSheet, drawingPages, renderDimension } from '../js/drawing-renderer.js';
import { materialById, DRAWING_MATERIALS } from '../js/drawing-materials.js';
import { drawingPageKey, sheetViewBox, setSheetViewBox, clampAnnotation } from '../js/drawing-page-layout.js';
const contains=(loops,p)=>loops.reduce((inAll,loop)=>{let inside=false;for(let i=0,j=loop.length-1;i<loop.length;j=i++){const a=loop[i],b=loop[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inAll!==inside;},false);
const outer=[{x:0,y:0},{x:100,y:0},{x:100,y:60},{x:0,y:60}],hole=[{x:30,y:20},{x:70,y:20},{x:70,y:40},{x:30,y:40}];
function plate(loops,pose={}){const part={bounds:{x:0,y:0,width:100,height:60},item:{x:0,y:0,z:0,rotation:0,plane:'xy',...pose}};let faces=[];for(const z of [0,6])faces.push(projectSurface(loops.map(l=>l.map(p=>point3d(part,p,z)))));for(const loop of loops)for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length];faces.push(projectSurface([[point3d(part,a),point3d(part,b),point3d(part,b,6),point3d(part,a,6)]]));}return faces.filter(Boolean);}
function verifyOcclusion(faces){const shown=visibleSurfaceRegions(faces);let checked=0;for(let y=-90.37;y<120;y+=3.13)for(let x=-140.19;x<140;x+=3.79){const p={x,y},expected=faces.filter(f=>contains(f.loops,p)).map(f=>f.plane.x*x+f.plane.y*y+f.plane.c);if(!expected.length){assert(!shown.some(f=>contains(f.visible,p)));continue;}const visible=shown.filter(f=>contains(f.visible,p));assert(visible.length,'unintentional opening at '+JSON.stringify(p));const front=Math.max(...expected);for(const f of visible)assert(Math.abs(f.plane.x*x+f.plane.y*y+f.plane.c-front)<.001,'rear surface shows through material');checked++;}assert(checked>100);}
test('depth clipping gives continuous opaque material with holes, upright plates and intersecting assemblies',()=>{for(const plane of ['xy','xz','yz'])for(const rotation of [0,37,90,180])verifyOcclusion(plate([outer,hole],{plane,assemblyRotation:rotation}));verifyOcclusion([...plate([outer,hole]),...plate([outer],{plane:'xz',assemblyY:-30,z:3})]);});
test('curved surfaces have complete coverage without exposing rear facets',()=>{const ellipse=Array.from({length:48},(_,i)=>({x:50+50*Math.cos(i*Math.PI/24),y:30+30*Math.sin(i*Math.PI/24)}));verifyOcclusion(plate([ellipse]));});
test('open lines stay open in both views; material edges do not introduce tessellation seams',()=>{const line={id:'line',type:'line',x1:0,y1:0,x2:80,y2:0,x:0,y:0,width:80,height:0,laserMode:'score'};const doc=createDrawingDocument([line]);for(const view of ['flat','iso']){const svg=renderDrawingGeometry(drawingParts(doc,[line]),{view});assert.match(svg,/<path/);assert.doesNotMatch(svg,/d="M[^"<>]* Z"[^>]*stroke="#42566c"/);assert.doesNotMatch(svg,/NaN|Infinity/);}});
test('material bank has distinct faces/edges and per-part choices survive project model',()=>{assert(DRAWING_MATERIALS.length>=12);assert(materialById('mdf'));assert(new Set(DRAWING_MATERIALS.map(m=>m.face)).size>10);});
test('paper layout moves and resizes views without changing source shapes; custom pages and notes export',()=>{const shapes=[{id:'r',type:'rect',x:0,y:0,width:50,height:30,laserMode:'cut'}],before=JSON.stringify(shapes),doc=createDrawingDocument(shapes);doc.customPages=[{id:'own',title:'Montering'}];const page=drawingPages(doc,shapes).at(-1);assert.equal(drawingPageKey(page),'custom:own');setSheetViewBox(doc,page,'flat',{x:20,y:35,width:90,height:75});assert.equal(sheetViewBox(doc,page,'flat').width,90);doc.annotations=[clampAnnotation(doc,{id:'n',page:'custom:own',kind:'callout',text:'Lim delene sammen. ÆØÅ',x:150,y:120,width:100,fontSize:3,targetX:90,targetY:80})];const svg=renderDrawingSheet(doc,shapes,page);assert.match(svg,/Lim delene sammen/);assert.match(svg,/data-annotation-id="n"/);assert.doesNotMatch(svg,/stroke-dasharray="2 1"/);assert.equal(JSON.stringify(shapes),before);doc.paper='A3';assert(sheetViewBox(doc,page,'flat').width>90);});
test('dimension labels rotate with their lines; editing label retains true measured value',()=>{const svg=renderDimension({x:0,y:0},{x:0,y:50},{kind:'vertical',offset:-10,labelText:'Høyde',id:'test'});assert.match(svg,/rotate\(90 /);assert.match(svg,/Høyde · 50/);assert.match(svg,/data-dimension-id="test"/);});

test('finger-jointed parts and slots retain solid surface coverage',()=>{
 const model=buildBoxModel({boxType:'hinged',lengthMm:100,widthMm:70,heightMm:50,thicknessMm:3});
 for(const part of model.parts.slice(0,5))verifyOcclusion(plate([part.outline,...(part.holes||[])]));
});
test('notes, custom pages, materials and layout roundtrip in native projects',()=>{
 const shapes=[{id:'r',type:'rect',x:0,y:0,width:50,height:30,laserMode:'cut'}],doc=createDrawingDocument(shapes,{thicknessMm:3});
 Object.assign(doc,{materialId:'mdf',annotations:[{id:'note',page:'custom:own',text:'Puss og lim. ÆØÅ',x:20,y:35,width:80,fontSize:3}],customPages:[{id:'own',title:'Montering'}]});doc.items[0].materialId='oak';doc.items[0].thickness=6;setSheetViewBox(doc,drawingPages(doc,shapes).at(-1),'flat',{x:30,width:100});
 const opened=importXcsStringToWorkspace(buildXcsProjectString(shapes,{workDrawing:doc})),result=normalizeDrawingDocument(opened.workDrawing,opened.shapes);
 assert.deepEqual(result.annotations,doc.annotations.map(a=>({...a,kind:'note'})));assert.deepEqual(result.sheetLayouts,doc.sheetLayouts);assert.equal(result.items[0].materialId,'oak');
 assert.match(renderDrawingSheet(result,shapes,{kind:'list',start:0,title:'Deleliste'}),/Eik/);
});
test('long notes retain all words on additional pages; overflowing text boxes block export',()=>{
 const doc=createDrawingDocument([]);doc.notes='Detaljert beskrivelse. '.repeat(100)+'SISTE_AVSNITT';
 const pages=drawingPages(doc,[]),html=pages.map(p=>renderDrawingSheet(doc,[],p)).join('');assert.match(html,/SISTE_AVSNITT/);assert(pages.some(p=>p.kind==='notes'));
 doc.annotations=[{id:'a',page:'overview',text:'Tekst '.repeat(500),x:20,y:150,width:25,fontSize:5}];assert.throws(()=>renderDrawingSheet(doc,[]),/får ikke plass/);
 const preview=renderDrawingSheet(doc,[],undefined,{editing:true});assert.match(preview,/data-text-overflow/);
});

test('the rendered material keeps full coverage after back-face culling at every orientation',()=>{
 const shape=createPathShapeFromPolygons([outer,hole]);Object.assign(shape,shape.origBBox);
 for(const plane of ['xy','xz','yz'])for(const rotation of [0,37,90,180,270]){
  const doc=createDrawingDocument([shape],{thicknessMm:6});Object.assign(doc.items[0],{plane,assemblyRotation:rotation});const svg=renderDrawingGeometry(drawingParts(doc,[shape]),{view:'iso'});
  const regions=[...svg.matchAll(/<path d="([^"]+)" fill="url\(#[^"]+\)" fill-rule="evenodd" data-material-face=/g)].map(m=>parseSvgPathToPolygons(m[1]));assert(regions.length);
  const faces=plate([outer,hole],{plane,assemblyRotation:rotation});
  for(let y=-80.33;y<100;y+=4.17)for(let x=-130.19;x<130;x+=4.91){const p={x,y};assert.equal(regions.some(loops=>contains(loops,p)),faces.some(f=>contains(f.loops,p)),plane+' '+rotation+' '+JSON.stringify(p));}
 }
});
