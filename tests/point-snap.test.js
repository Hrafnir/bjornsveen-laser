import test from 'node:test';
import assert from 'node:assert/strict';
import { findObjectSnapPoint, objectSnapPoints, pathNodeWorldPoints } from '../js/point-snap.js';
import { createConnectedPath } from '../js/line-tools.js';
import { snapTranslation } from '../js/editor-tools.js';
import { shapeToWorldPolygons, rotatePoint, rebuildPathShapeFromNodes } from '../js/geometry.js';
const rect={id:'rect',type:'rect',x:100.1234,y:80.4321,width:40,height:30,laserMode:'engrave'};
const P=(x,y)=>({x,y}), near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('rectangle corners snap exactly off-grid regardless of processing mode, including rotated corners',()=>{
 const hit=findObjectSnapPoint([rect],P(99,81),2);assert.equal(hit.shapeId,'rect');near(hit.point.x,rect.x);near(hit.point.y,rect.y);
 const rotated={...rect,rotation:37},corner=shapeToWorldPolygons(rotated)[0][0];
 const r=findObjectSnapPoint([rotated],P(corner.x+.1,corner.y-.2),1);near(r.point.x,corner.x);near(r.point.y,corner.y);
 assert.equal(findObjectSnapPoint([rect],P(90,70),1),null);
});
test('group recursion ignores hidden parents, hidden children and excluded objects',()=>{
 const group={id:'g',type:'group',children:[{...rect,hidden:true},{...rect,id:'visible'}]};
 assert.equal(objectSnapPoints([group]).length,4);
 assert.equal(objectSnapPoints([{...group,hidden:true}]).length,0);
 assert.equal(objectSnapPoints([group],{excludeIds:new Set(['g'])}).length,0);
 assert.equal(objectSnapPoints([group],{excludeIds:new Set(['visible'])}).length,0);
 assert.equal(objectSnapPoints([{...rect,guideLabel:true}]).length,0);
 assert.equal(objectSnapPoints([{...rect,laserMode:'guide'}]).length,4);
});
test('curves expose editable nodes with scale, mirror and rotation instead of sampled curve points',()=>{
 const path=createConnectedPath([P(10,10),P(20,30),P(40,10)]);path.curved=true;rebuildPathShapeFromNodes(path);
 const source={...path.origBBox};Object.assign(path,{x:100,y:120,width:60,height:40,flipX:true,rotation:30});
 const actual=pathNodeWorldPoints(path);assert.equal(actual.length,3);
 const expected=path.nodes.map(p=>rotatePoint({x:path.x+(1-(p.x-source.x)/source.width)*path.width,y:path.y+(p.y-source.y)/source.height*path.height},{x:130,y:140},30));
 actual.forEach((p,i)=>{near(p.x,expected[i].x);near(p.y,expected[i].y)});
 assert.equal(objectSnapPoints([path]).length,3);
});
test('rounded rectangles use real tangent points and ellipse points lie on the outline',()=>{
 const rounded={...rect,rx:8};assert.equal(findObjectSnapPoint([rounded],P(rect.x,rect.y),1),null);
 assert.ok(findObjectSnapPoint([rounded],P(rect.x+8,rect.y),.1));
 const ellipse={...rect,type:'ellipse',rotation:40};const points=objectSnapPoints([ellipse]);assert.equal(points.length,4);
 for(const {point} of points){const p=rotatePoint(point,P(rect.x+20,rect.y+15),-40);near(((p.x-rect.x-20)/20)**2+((p.y-rect.y-15)/15)**2,1)}
});
test('moving a line or grouped line snaps its endpoint to a rectangle corner in both axes',()=>{
 const line=createConnectedPath([P(20,20),P(40,40)]);
 const snap=snapTranslation([line],[rect],P(60,40),1);
 near(snap.x,rect.x-40);near(snap.y,rect.y-40);assert.ok(snap.point);
 const grouped=snapTranslation([{type:'group',children:[line]}],[{type:'group',children:[rect]}],P(60,40),1);
 near(grouped.x,snap.x);near(grouped.y,snap.y);
});
