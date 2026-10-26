import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectedPath } from '../js/line-tools.js';
import { shapeToWorldSvgPath, pathNodesInWorld, shapeToWorldPolygons } from '../js/geometry.js';
import { nodesToPath, cubicAt } from '../js/bezier.js';
import { removePathAnchors, removePathSegments, connectPathEndpoints, splitPathSegment, nearestSegmentParameter } from '../js/path-edit.js';
import { buildLaserSvgString, buildXcsProjectString, importXcsStringToWorkspace } from '../js/export.js';
const P=(x,y)=>({x,y}), near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const path=(pts,options)=>createConnectedPath(pts.map(p=>P(...p)),options);

test('anchor deletion connects surviving neighbours and removes paths with fewer than two anchors',()=>{
 const s=path([[0,0],[10,20],[30,0],[40,10]],{curved:true}),original=structuredClone(s);
 const [result]=removePathAnchors(s,[1]);assert.equal(result.nodes.length,3);assert.equal(result.id,s.id);assert.equal(result.closedPath,false);
 near(result.nodes[0].out.x,s.nodes[0].out.x);near(result.nodes[0].out.y,s.nodes[0].out.y);near(result.nodes[1].in.x,s.nodes[2].in.x);near(result.nodes[1].in.y,s.nodes[2].in.y);assert.deepEqual(s,original);
 assert.deepEqual(removePathAnchors(s,[0,1,2]),[]);
});
test('deleting a middle Bézier segment creates two open paths and retains all other curves exactly',()=>{
 const s=path([[0,0],[10,20],[30,0],[40,10]],{curved:true});Object.assign(s,{rotation:25,flipX:true,x:70,width:80});
 const world=pathNodesInWorld(s),parts=removePathSegments(s,[1]);assert.equal(parts.length,2);assert.equal(parts[0].id,s.id);assert.notEqual(parts[1].id,s.id);
 assert.equal(shapeToWorldSvgPath(parts[0]),nodesToPath(world.slice(0,2)));assert.equal(shapeToWorldSvgPath(parts[1]),nodesToPath(world.slice(2)));
 parts.forEach(p=>{assert.equal(p.closedPath,false);assert.equal(p.rotation,0);});
});
test('deleting edges opens closed paths in correct order and drops isolated anchors without bridging gaps',()=>{
 const s=path([[0,0],[20,0],[20,20],[0,20]],{closed:true});
 const [open]=removePathSegments(s,[1]);assert.equal(open.closedPath,false);assert.deepEqual(open.nodes.map(n=>[n.x,n.y]),[[20,20],[0,20],[0,0],[20,0]]);
 const parts=removePathSegments(s,[0,2]);assert.equal(parts.length,2);assert.ok(parts.every(s=>s.nodes.length===2));
 assert.deepEqual(removePathSegments(s,[0,1,2,3]),[]);
 const one=path([[0,0],[10,0]]);assert.deepEqual(removePathSegments(one,[0]),[]);
 assert.equal(removePathSegments(path([[0,0],[10,0],[20,0],[30,0]]),[0,2])[0].nodes.length,2);
});
test('opening a filled shape restores outline mode so rendering and export never fill the gap',()=>{
 const s=path([[0,0],[20,0],[20,20],[0,20]],{closed:true,laserMode:'engrave'});s.outlineLaserMode='score';
 const parts=removePathSegments(s,[3]);assert.equal(parts[0].laserMode,'score');assert.equal(shapeToWorldPolygons(parts[0])[0].closed,false);
 assert.match(buildLaserSvgString(parts),/fill="none"/);
 const restored=importXcsStringToWorkspace(buildXcsProjectString(parts)).shapes;assert.equal(restored[0].closedPath,false);
});
test('connecting chosen endpoints handles all four directions without reversing tangents incorrectly',()=>{
 const a=path([[0,0],[10,20],[30,0]],{curved:true}),b=path([[60,0],[70,20],[90,0]],{curved:true});
 for(const ai of [0,2])for(const bi of [0,2]){
  const result=connectPathEndpoints(a,ai,b,bi);assert.equal(result.nodes.length,6);assert.equal(result.closedPath,false);
  const left=result.nodes.slice(0,3),right=result.nodes.slice(3);
  near(left.at(-1).x,a.nodes[ai].x);near(right[0].x,b.nodes[bi].x);
  assert.equal((result.d.match(/C /g)||[]).length,4);assert.equal((result.d.match(/L /g)||[]).length,1);
  assert.deepEqual(ai?left[1].out:left[1].in,a.nodes[1].out);
 }
});
test('coincident endpoints merge once; connecting a single path closes it; incompatible endpoints are rejected',()=>{
 const a=path([[0,0],[10,10],[20,0]],{curved:true}),b=path([[20,0],[30,10],[40,0]],{curved:true});
 assert.equal(connectPathEndpoints(a,2,b,0).nodes.length,5);
 const closed=connectPathEndpoints(a,0,a,2);assert.equal(closed.closedPath,true);assert.equal(closed.nodes.length,3);assert.match(closed.d,/Z$/);
 assert.throws(()=>connectPathEndpoints(a,1,b,0));assert.throws(()=>connectPathEndpoints(closed,0,b,0));
 assert.throws(()=>connectPathEndpoints(a,2,{...b,laserMode:'score'},0));assert.throws(()=>connectPathEndpoints(a,2,{...b,cutStage:'puzzle-outline'},0));
});
test('inserting an anchor splits a cubic exactly under world transforms, including the closing segment',()=>{
 const source=path([[0,0],[20,30],[40,0]],{curved:true,closed:true});Object.assign(source,{x:100,y:70,width:80,height:50,rotation:45,flipY:true});
 const old=pathNodesInWorld(source),t=.37,result=splitPathSegment(source,2,t),nodes=result.nodes;
 assert.equal(nodes.length,4);assert.equal(result.closedPath,true);
 const original=u=>cubicAt(old[2],old[2].out,old[0].in,old[0],u);
 for(let i=0;i<=20;i++){
  const u=i/20,p=original(u),part=u<=t?cubicAt(nodes[2],nodes[2].out,nodes[3].in,nodes[3],u/t):cubicAt(nodes[3],nodes[3].out,nodes[0].in,nodes[0],(u-t)/(1-t));
  near(p.x,part.x);near(p.y,part.y);
 }
 near(nearestSegmentParameter(source,2,original(t)),t,.0001);
});

test('new open paths stay unfilled when the drawing mode was fill engraving',()=>{
 const open=path([[0,0],[10,10],[20,0]],{curved:true,laserMode:'engrave'});
 assert.equal(open.laserMode,'score');assert.equal(open.closedPath,false);assert.match(buildLaserSvgString([open]),/fill="none"/);
 const closed=path([[0,0],[10,10],[20,0]],{closed:true,laserMode:'engrave'});assert.equal(closed.laserMode,'engrave');
});
