import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawingDocument, normalizeDrawingDocument, drawingParts, flatPoint, unflatPoint, point3d, isoPoint, dimensionAnchor, dimensionValue, syncDrawingSources, splitDrawingGroup } from '../js/drawing-model.js';
import { drawingPages, renderDrawingSheet, renderDrawingGeometry, drawingPrintHtml, drawingBounds, drawingAnnotatedBounds } from '../js/drawing-renderer.js';
import { createPathShapeFromPolygons, computePolygonsBBox } from '../js/geometry.js';
import { workspacePayload } from '../js/storage.js';
import { buildXcsProjectString, importXcsStringToWorkspace } from '../js/export.js';
const rect=(id='plate',x=20,y=30,w=100,h=60)=>({id,type:'rect',name:'Plate',x,y,width:w,height:h,rotation:0,laserMode:'cut'});
const near=(a,b)=>assert.ok(Math.abs(a-b)<.00001,`${a} != ${b}`);
const settings={presetKey:'mdf-3mm',thicknessMm:3};

test('documentation references source geometry and never changes the production layout',()=>{
 const shapes=[rect(),{...rect('hidden'),hidden:true},{...rect('guide'),laserMode:'guide'}],before=JSON.stringify(shapes);
 const doc=createDrawingDocument(shapes,settings,'MDF');assert.equal(doc.items.length,1);assert.equal(doc.finish,'mdf');assert.equal(doc.thickness,3);
 Object.assign(doc.items[0],{x:160,y:90,z:12,rotation:90,plane:'xz'});
 const parts=drawingParts(doc,shapes);assert.equal(parts.length,1);renderDrawingSheet(doc,shapes);assert.equal(JSON.stringify(shapes),before);
 near(parts[0].bounds.width,100);near(parts[0].bounds.height,60);
});
test('flat coordinates, snapped dimensions and part-relative references follow translations and rotation',()=>{
 const shapes=[rect()],doc=createDrawingDocument(shapes,settings),p=drawingParts(doc,shapes)[0];
 const a=flatPoint(p,{x:0,y:0}),b=flatPoint(p,{x:100,y:60});
 const d={a:dimensionAnchor(p,a),b:dimensionAnchor(p,b),kind:'aligned',offset:10};
 near(dimensionValue(d,[p]),Math.hypot(100,60));Object.assign(p.item,{x:-35,y:80,rotation:37});
 near(dimensionValue(d,[p]),Math.hypot(100,60));
 const q=unflatPoint(p,flatPoint(p,{x:43,y:21}));near(q.x,43);near(q.y,21);
 shapes[0].width=200;near(dimensionValue(d,drawingParts(doc,shapes)),Math.hypot(200,60));
});
test('material orientations extrude by exact thickness and support upright walls and stacked plates',()=>{
 const doc=createDrawingDocument([rect()],settings),p=drawingParts(doc,[rect()])[0];
 for(const plane of ['xy','xz','yz'])for(const rotation of [0,90,37]){
  Object.assign(p.item,{plane,assemblyRotation:rotation,z:12});
  const a=point3d(p,{x:20,y:30},0),b=point3d(p,{x:20,y:30},3);
  near(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z),3);
  const c=point3d(p,{x:20,y:0}),d=point3d(p,{x:20,y:60});
  if(plane!=='xy'){near(c.z,72);near(d.z,12)}else{near(c.z,12);near(d.z,12)}
  assert.ok(Object.values(isoPoint(b)).every(Number.isFinite));
 }
});
test('holes remain empty in the top and bottom of extruded compound parts; open paths have no extrusion',()=>{
 const outer=[{x:0,y:0},{x:100,y:0},{x:100,y:60},{x:0,y:60}],hole=[{x:40,y:20},{x:60,y:20},{x:60,y:40},{x:40,y:40}];
 const ring=createPathShapeFromPolygons([outer,hole]);
 const line={id:'line',type:'line',x1:0,y1:0,x2:80,y2:10,x:0,y:0,width:80,height:10,laserMode:'cut'};
 const doc=createDrawingDocument([ring,line],settings),parts=drawingParts(doc,[ring,line]);
 assert.equal(doc.items[1].solid,false);
 const svg=renderDrawingGeometry(parts,{view:'iso'});
 assert.ok((svg.match(/fill-rule="evenodd"/g)||[]).length>=2);assert.doesNotMatch(svg,/NaN|Infinity/);
});
test('new sources synchronize once, hidden/deleted sources are skipped and grouped parts stay together on split',()=>{
 const a=rect('a'),b=rect('b',180),group={id:'group',type:'group',name:'Prosjekt',children:[{id:'sub',type:'group',children:[a]},b]};
 const doc=createDrawingDocument([group],settings);Object.assign(doc.items[0],{x:50,y:40,rotation:35});
 const parent=drawingParts(doc,[group])[0],expected=flatPoint(parent,{x:50,y:30});
 splitDrawingGroup(doc,doc.items[0],[group]);assert.equal(doc.items.length,2);assert.equal(doc.items[0].sourceId,'sub');
 const first=drawingParts(doc,[group])[0],actual=flatPoint(first,{x:50,y:30});near(actual.x,expected.x);near(actual.y,expected.y);
 syncDrawingSources(doc,[group]);assert.equal(doc.items.length,2);syncDrawingSources(doc,[group,rect('new')]);assert.equal(doc.items.length,3);
 assert.equal(drawingParts(doc,[]).length,0);
});
test('document metadata and placements survive local payload and native XCS roundtrip',()=>{
 const shapes=[rect()],doc=createDrawingDocument(shapes,settings,'MDF');Object.assign(doc,{title:'Lampe – ÆØÅ',author:'Elev',notes:'Arbeidsbeskrivelse'});doc.items[0].z=15;doc.includeDetails=false;assert.equal(drawingPages(doc,shapes).length,2);
 const saved=workspacePayload({shapes,workDrawing:doc});assert.deepEqual(saved.workDrawing,doc);
 const xcs=buildXcsProjectString(shapes,{laserSettings:settings,workDrawing:doc}),opened=importXcsStringToWorkspace(xcs);assert.deepEqual(opened.workDrawing,doc);
 const laser=JSON.parse(xcs);assert.equal(laser.canvas[0].displays.length,1,'documentation leaked into cut geometry');
});
test('A4/A3 sheets contain real paper sizes, title block, units, scales, details and paginated part lists',()=>{
 const shapes=Array.from({length:23},(_,i)=>rect('p'+i,i*110)),doc=createDrawingDocument(shapes,settings,'MDF');
 const pages=drawingPages(doc,shapes);assert.equal(pages.length,26);assert.equal(pages.filter(p=>p.kind==='list').length,2);
 for(const paper of ['A4','A3']){
  doc.paper=paper;const svg=renderDrawingSheet(doc,shapes,pages[3],{pageNumber:4,totalPages:pages.length});
  assert.match(svg,paper==='A4'?/width="297mm" height="210mm"/:/width="420mm" height="297mm"/);
  assert.match(svg,/Alle mål i mm/);assert.match(svg,/Ark 4\/26/);assert.match(svg,/Målestokk:/);assert.doesNotMatch(svg,/NaN|Infinity/);
  const html=drawingPrintHtml(doc,[svg,svg]);assert.match(html,/break-after:page/);assert.equal((html.match(/class="sheet"/g)||[]).length,2);
 }
 doc.scale='5';assert.throws(()=>renderDrawingSheet(doc,shapes,pages[0]),/ikke plass/);
});
test('text is escaped in standalone SVG and print HTML and imported metadata is normalized',()=>{
 const shapes=[rect()],doc=createDrawingDocument(shapes,settings);doc.title='<script>alert("x")</script>';doc.notes='<img onerror="x">';doc.items[0].name='" onload="x';
 const svg=renderDrawingSheet(doc,shapes);assert.doesNotMatch(svg,/<script|onload="x|<img onerror/);assert.match(svg,/&lt;script&gt;/);
 const html=drawingPrintHtml(doc,[svg]);assert.doesNotMatch(html,/<script/);
 const raw={...doc,paper:'invalid',thickness:Infinity,items:[{...doc.items[0],x:NaN},doc.items[0]],dimensions:[{a:{u:NaN},b:{}}]};
 const normalized=normalizeDrawingDocument(raw,shapes,settings);assert.equal(normalized.paper,'A4');assert.equal(normalized.items.length,1);assert.equal(normalized.items[0].x,0);assert.equal(normalized.dimensions.length,0);
});


test('assembly placement and manual annotation extents do not change the flat drawing',()=>{
 const shapes=[rect()],doc=createDrawingDocument(shapes,settings),part=drawingParts(doc,shapes)[0],before=drawingBounds([part]);
 Object.assign(part.item,{assemblyX:700,assemblyY:-400,assemblyRotation:37,z:10,plane:'yz'});
 assert.deepEqual(drawingBounds([part]),before);assert.notDeepEqual(drawingBounds([part],'iso'),before);
 doc.dimensions.push({a:dimensionAnchor(part,{x:20,y:30}),b:dimensionAnchor(part,{x:120,y:30}),kind:'aligned',offset:1000});
 assert.ok(drawingAnnotatedBounds(doc,[part]).height>=1000);assert.doesNotMatch(renderDrawingSheet(doc,shapes),/NaN|Infinity/);
});
test('image puzzle material uses its silhouette and embeds rotated bitmap data',()=>{
 const image={...rect('image',10,20,100,80),type:'image',laserMode:'engrave',rotation:90,flipX:true,dataUrl:'data:image/png;base64,AA==',imageMeta:{puzzleClip:[[{x:.2,y:.2},{x:.8,y:.2},{x:.5,y:.8}]]}};
 const doc=createDrawingDocument([image],settings),parts=drawingParts(doc,[image]);near(parts[0].bounds.width,48);near(parts[0].bounds.height,60);
 const svg=renderDrawingGeometry(parts,{view:'iso'});assert.match(svg,/<image/);assert.match(svg,/data:image\/png;base64,AA==/);assert.match(svg,/transform="matrix/);
});
