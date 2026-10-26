import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothNodes,nodesToPath,nodesBounds,cubicAt,moveAnchor,moveControl,mapNodes,fitBezier} from '../js/bezier.js';
import {buildSmoothSplineLoop,shapeToWorldSvgPath,shapeToWorldPolygons,pathNodesInWorld,rebuildPathShapeFromNodes} from '../js/geometry.js';
import {createConnectedPath,joinOpenPaths} from '../js/line-tools.js';
import {buildLaserSvgString,buildXcsProjectString,importXcsStringToWorkspace} from '../js/export.js';
const P=(x,y)=>({x,y}),near=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const anchors=[P(10,20),P(110,22),P(40,70),P(120,80)];
test('smooth L curves retain exactly the clicked anchors and the original spline shape',()=>{
 const shape=createConnectedPath(anchors,{curved:true});
 assert.equal(shape.nodes.length,4); assert.equal(shape.nodeModel,'bezier'); assert.equal((shape.d.match(/C /g)||[]).length,3);
 assert.ok(shape.d.length<400);
 const old=buildSmoothSplineLoop(anchors,false,.05);
 const sampled=[];
 for(let i=1;i<shape.nodes.length;i++) {
  const a=shape.nodes[i-1],b=shape.nodes[i];if(i===1)sampled.push(a);
  for(let j=1;j<=48;j++)sampled.push(cubicAt(a,a.out,b.in,b,j/48));
 }
 old.forEach((p,i)=>{near(p.x,sampled[i].x);near(p.y,sampled[i].y)});
});
test('cubic bounds include true extrema, not the control polygon or sample approximation',()=>{
 const nodes=[{x:0,y:0,out:P(0,100)},{x:100,y:0,in:P(100,100)}];
 assert.deepEqual(nodesBounds(nodes),{x:0,y:0,width:100,height:75});
});
test('anchors translate both handles; smooth handles remain aligned and Alt breaks the link',()=>{
 const n={x:10,y:10,in:P(5,10),out:P(20,10),smooth:true};
 moveAnchor(n,P(20,30));assert.deepEqual(n.in,P(15,30));assert.deepEqual(n.out,P(30,30));
 moveControl(n,'out',P(20,50));assert.deepEqual(n.in,P(20,25));
 moveControl(n,'out',P(40,40),true);assert.deepEqual(n.in,P(20,25));assert.equal(n.smooth,false);
});
test('world transforms preserve full handles and baking an edit never moves the other anchors',()=>{
 const s=createConnectedPath(anchors,{curved:true});
 Object.assign(s,{x:200,y:90,width:s.width*1.5,height:s.height*.6,flipX:true,rotation:37});
 const before=shapeToWorldSvgPath(s),nodes=pathNodesInWorld(s);
 s.nodes=nodes; s.rotation=0;s.flipX=false;rebuildPathShapeFromNodes(s);
 assert.equal(shapeToWorldSvgPath(s),before);assert.equal(s.nodes.length,4);
 const stationary=structuredClone(s.nodes.slice(1));moveAnchor(s.nodes[0],P(180,70));rebuildPathShapeFromNodes(s);
 assert.deepEqual(s.nodes.slice(1),stationary);
});
test('joining reversed transformed Bézier paths retains cubics and only merges the shared anchor',()=>{
 const a=createConnectedPath(anchors,{curved:true}); a.rotation=30;
 const world=pathNodesInWorld(a),b=createConnectedPath([P(250,100),P(world.at(-1).x,world.at(-1).y)]);
 const joined=joinOpenPaths([b,a],.0001);
 assert.equal(joined.nodes.length,5);assert.equal((joined.d.match(/C /g)||[]).length,3);
 const reversed=joined.nodes.slice(1).reverse();
 world.forEach((p,i)=>{near(p.x,reversed[i].x);near(p.y,reversed[i].y);if(p.out){near(p.out.x,reversed[i].in.x);near(p.out.y,reversed[i].in.y)}});
});
test('native project, SVG and xTool display paths retain compact cubic commands and edit handles',()=>{
 const shape=createConnectedPath(anchors,{curved:true});shape.rotation=15;shape.x+=25;
 const xcs=buildXcsProjectString([shape]);const raw=JSON.parse(xcs);
 assert.match(buildLaserSvgString([shape]),/C /);
 assert.match(raw.canvas[0].displays[0].dPath,/C /);
 const restored=importXcsStringToWorkspace(xcs).shapes[0];
 assert.deepEqual(restored.nodes,shape.nodes);assert.equal(shapeToWorldSvgPath(restored),shapeToWorldSvgPath(shape));
});
function pointSegment(p,a,b) {
 const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
test('explicit fitting reduces dense old S curves with small geometric error and exact endpoints',()=>{
 const original=buildSmoothSplineLoop(anchors,false,.05),nodes=fitBezier(original,.1);
 assert.ok(nodes.length<20,`${nodes.length} anchors`);assert.ok(nodes.length<original.length/5);
 assert.deepEqual(P(nodes[0].x,nodes[0].y),original[0]);assert.deepEqual(P(nodes.at(-1).x,nodes.at(-1).y),original.at(-1));
 const dense=[];for(let i=1;i<nodes.length;i++)for(let t=0;t<=1;t+=.005)dense.push(cubicAt(nodes[i-1],nodes[i-1].out,nodes[i].in,nodes[i],t));
 const error=Math.max(...dense.map(p=>Math.min(...original.slice(1).map((b,i)=>pointSegment(p,original[i],b)))));
 assert.ok(error<.12,`error ${error}`);
});
test('closed fitting keeps the seam joined, corners sharp, and does not mutate source samples',()=>{
 const points=[P(0,0),P(10,0),P(20,0),P(20,10),P(20,20),P(10,20),P(0,20),P(0,10)];
 const saved=structuredClone(points),nodes=fitBezier(points,.01,true);
 assert.deepEqual(points,saved);assert.match(nodesToPath(nodes,true),/Z$/);assert.ok(nodes.length<=8);
 assert.deepEqual(nodesBounds(nodes,true),{x:0,y:0,width:20,height:20});
 assert.deepEqual(fitBezier([], .1, true),[]);
});
