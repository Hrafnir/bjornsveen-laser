import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectedPath, joinOpenPaths, openLinePoints, findLineEndpoint, constrainLinePoint } from '../js/line-tools.js';
import { snapTranslation, shapeTouchesSelection, setShapeAppearance } from '../js/editor-tools.js';
import { createVectorOffset } from '../js/vector-offset.js';
import { shapeToWorldPolygons, computePolygonsBBox, createPathShapeFromPolygons, pointInMultiPolygon } from '../js/geometry.js';
import { buildLaserSvgString, buildXcsProjectString, importXcsStringToWorkspace } from '../js/export.js';
const P=(x,y)=>({x,y}), near=(a,b,t=.002)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const line=(...p)=>createConnectedPath(p);
const rect=(x=0,y=0,w=20,h=10)=>({id:`r${x}${y}`,type:'rect',x,y,width:w,height:h,laserMode:'cut'});

test('join sorts reversed, unordered lines into one continuous open or closed path',()=>{
 const a=line(P(0,0),P(10,0)),b=line(P(10,10),P(10,0)),c=line(P(0,10),P(10,10));
 const joined=joinOpenPaths([b,c,a],0);assert.equal(joined.closedPath,false);assert.equal(joined.nodes.length,4);
 const closed=joinOpenPaths([c,line(P(0,10),P(0,0)),b,a],0);
 assert.equal(closed.closedPath,true);assert.equal(closed.nodes.length,4);assert.equal(shapeToWorldPolygons(closed)[0].closed,true);
});
test('join closes real small gaps but rejects disconnections, branches and mixed processing',()=>{
 const a=line(P(0,0),P(10,0)),b=line(P(10.2,0),P(20,0));
 near(joinOpenPaths([a,b],.3).nodes[1].x,10.1);
 assert.throws(()=>joinOpenPaths([a,b],.1));
 assert.throws(()=>joinOpenPaths([a,line(P(10,0),P(20,0)),line(P(10,0),P(10,10))]));
 assert.throws(()=>joinOpenPaths([a,{...b,laserMode:'score'}]));
 assert.throws(()=>joinOpenPaths([a,{...b,cutStage:'flex-slits'}]));
 assert.throws(()=>joinOpenPaths([a,rect()]));
});
test('endpoint snaps ignore hidden, closed and multisegment collections, preserving off-grid ends',()=>{
 const curve={type:'line',id:'curve',x:0,y:0,width:20,height:20,x1:0,y1:0,x2:20.1234,y2:10.4321,cx:5,cy:20,curved:true,laserMode:'cut'};
 const hit=findLineEndpoint([rect(),curve],P(20,10),1);assert.equal(hit.shapeId,'curve');near(hit.point.x,20.1234,.0001);
 assert.equal(findLineEndpoint([{...curve,hidden:true}],P(20,10),1),null);
 assert.equal(findLineEndpoint([curve],P(20,10),1,{laserMode:'score'}),null);
 const multi=createPathShapeFromPolygons([Object.assign([P(0,0),P(1,1)],{closed:false}),Object.assign([P(2,2),P(3,3)],{closed:false})]);
 assert.equal(openLinePoints(multi),null);
 const snapped=constrainLinePoint(P(0,0),P(10,9),true);near(snapped.x,snapped.y);
});
test('rotated curve and line geometry survives joining in world coordinates and native export',()=>{
 const a={type:'line',id:'a',x:0,y:0,width:20,height:20,x1:0,y1:0,x2:20,y2:20,cx:0,cy:20,curved:true,rotation:30,laserMode:'score'};
 const pts=openLinePoints(a),b=line(pts.at(-1),P(50,50));b.laserMode='score';
 const joined=joinOpenPaths([a,b],.001);assert.ok(joined.nodes.length>10);
 near(joined.nodes[0].x,pts[0].x);near(joined.nodes[0].y,pts[0].y);
 const svg=buildLaserSvgString([joined]);assert.match(svg,/fill="none"/);
 const restored=importXcsStringToWorkspace(buildXcsProjectString([joined]));assert.equal(restored.shapes[0].closedPath,false);
 near(shapeToWorldPolygons(restored.shapes[0])[0].at(-1).x,50);
});
test('moving objects snaps endpoints before edges, and supports adjacency for groups and rectangles',()=>{
 const a=line(P(0,0),P(10,10)),b=line(P(30.123,20.456),P(50,30));
 const endpoint=snapTranslation([a],[b],P(20,10),2);near(endpoint.x,20.123);near(endpoint.y,10.456);assert.ok(endpoint.point);
 const edge=snapTranslation([rect()],[rect(40,0)],P(19.6,3),1);near(edge.x,20);assert.equal(edge.guideX,40);
 const group={type:'group',children:[a]};assert.ok(snapTranslation([group],[b],P(20,10),2).point);
 const far=snapTranslation([rect()],[rect(100,100)],P(20,0),1);assert.equal(far.snapX,false);assert.equal(far.snapY,false);
});
test('crossing selection hits partial lines, curves and groups without selecting empty bounding-box space',()=>{
 const a=line(P(0,0),P(100,100));
 assert.equal(shapeTouchesSelection(a,{x:49,y:49,width:2,height:2}),true);
 assert.equal(shapeTouchesSelection(a,{x:0,y:90,width:5,height:5}),false);
 assert.equal(shapeTouchesSelection(rect(),{x:19,y:2,width:5,height:4}),true);
 assert.equal(shapeTouchesSelection({...rect(),hidden:true},{x:19,y:2,width:5,height:4}),false);
 assert.equal(shapeTouchesSelection({type:'group',children:[a]},{x:49,y:49,width:2,height:2}),true);
 const hole=[P(5,2),P(15,2),P(15,8),P(5,8)],outer=[P(0,0),P(20,0),P(20,10),P(0,10)];
 const donut=createPathShapeFromPolygons([outer,hole],'engrave');
 assert.equal(shapeTouchesSelection(donut,{x:8,y:4,width:1,height:1}),false);
 assert.equal(shapeTouchesSelection(donut,{x:1,y:4,width:1,height:1}),true);
});
test('fill and outline set matching laser operations, retaining score and skipping guide labels',()=>{
 const a={...rect(),laserMode:'score'},guide={...rect(),guideLabel:true,laserMode:'guide'};
 setShapeAppearance([{type:'group',children:[a,guide]}],true);assert.equal(a.laserMode,'engrave');assert.equal(guide.laserMode,'guide');
 let xcs=JSON.parse(buildXcsProjectString([a]));assert.equal(xcs.canvas[0].displays[0].processingType,'FILL_VECTOR_ENGRAVING');
 setShapeAppearance([a],false);assert.equal(a.laserMode,'score');
 assert.throws(()=>setShapeAppearance([line(P(0,0),P(2,2))],true));
});
test('vector offsets preserve exact rectangular edges, tiny distances and collapsing insets',()=>{
 for(const d of [.05,2,-2]) { const s=createVectorOffset([rect()],d),b=computePolygonsBBox(shapeToWorldPolygons(s));near(b.x,-d);near(b.y,-d);near(b.width,20+2*d);near(b.height,10+2*d); }
 assert.throws(()=>createVectorOffset([rect()],-6));assert.throws(()=>createVectorOffset([rect()],0));assert.throws(()=>createVectorOffset([rect()],NaN));
});
test('contour offset preserves holes, merges overlapping objects and buffers open curves',()=>{
 const donut=createPathShapeFromPolygons([[P(0,0),P(40,0),P(40,40),P(0,40)],[P(10,10),P(30,10),P(30,30),P(10,30)]]);
 const loops=shapeToWorldPolygons(createVectorOffset([donut],2));assert.equal(loops.length,2);assert.equal(pointInMultiPolygon(P(20,20),loops),false);assert.equal(pointInMultiPolygon(P(11,20),loops),true);
 const merged=shapeToWorldPolygons(createVectorOffset([rect(),rect(10,0)],1));assert.equal(merged.length,1);assert.equal(pointInMultiPolygon(P(15,5),merged),true);
 const l=line(P(0,0),P(20,0));const b=computePolygonsBBox(shapeToWorldPolygons(createVectorOffset([l],2)));near(b.height,4);near(b.width,24,.03);
 assert.throws(()=>createVectorOffset([l],-2));
});
test('parallel offsets keep open paths, direction and real millimeter distances',()=>{
 const l=line(P(0,0),P(20,0),P(20,20));
 for(const d of [-2,2]) {const s=createVectorOffset([l],d,{kind:'parallel'});assert.equal(s.closedPath,false);near(s.nodes[0].y,d);near(s.nodes[1].x,20-d);near(s.nodes[1].y,d);near(s.nodes[2].x,20-d);}
 assert.throws(()=>createVectorOffset([rect()],2,{kind:'parallel'}));
 assert.throws(()=>createVectorOffset([line(P(0,0),P(2,0),P(2,2))],3,{kind:'parallel'}));
});
