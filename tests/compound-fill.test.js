import test from 'node:test';
import assert from 'node:assert/strict';
import {createBetweenEngraving, canEngraveBetweenContours} from '../js/compound-fill.js';
import {shapeToWorldPolygons, pointInMultiPolygon} from '../js/geometry.js';
import {buildLaserSvgString, buildXcsProjectString, importXcsStringToWorkspace} from '../js/export.js';
const hex=(x,y,size)=>({id:'h'+size,type:'polygon',x,y,width:size,height:size,sides:6,laserMode:'cut'});
const inside=(shape,x,y)=>pointInMultiPolygon({x,y},shapeToWorldPolygons(shape));
test('nested hexagons form an engraved border regardless of ordering or grouping',()=>{
 const outer={...hex(0,0,100),displayColor:'#a855f7'},inner=hex(10,10,80);
 for(const input of [[outer,inner],[inner,outer],[{type:'group',children:[inner,outer]}]]){
  const s=createBetweenEngraving(input);assert.equal(s.laserMode,'engrave');assert.equal(s.displayColor,outer.displayColor);
  assert.equal(inside(s,50,4),true);assert.equal(inside(s,50,50),false);assert.equal(shapeToWorldPolygons(s).length,2);
 }
 assert.equal(outer.laserMode,'cut');assert.equal(inner.laserMode,'cut');
});
test('multiple holes, nested islands and overlap use one consistent alternating fill',()=>{
 const rect=(x,y,w,h)=>({type:'rect',x,y,width:w,height:h,laserMode:'engrave'});
 const s=createBetweenEngraving([rect(0,0,100,100),rect(10,10,20,20),rect(60,60,20,20)]);
 assert.ok(inside(s,50,50));assert.ok(!inside(s,20,20));assert.ok(!inside(s,70,70));
 const island=createBetweenEngraving([rect(0,0,100,100),rect(10,10,80,80),rect(40,40,20,20)]);
 assert.ok(inside(island,50,50));assert.ok(!inside(island,20,20));
 const overlap=createBetweenEngraving([rect(0,0,50,50),rect(25,0,50,50)]);assert.ok(!inside(overlap,40,20));assert.ok(inside(overlap,10,20));
});
test('invalid groups and open paths cannot silently discard objects; identical contours report empty area',()=>{
 for(const shapes of [[hex(0,0,100)],[hex(0,0,100),{type:'line',x1:0,y1:0,x2:20,y2:20}],[{type:'group',children:[hex(0,0,100),{type:'image',width:10,height:10}]}],[hex(0,0,100),{...hex(10,10,80),hidden:true}]]){
  assert.equal(canEngraveBetweenContours(shapes),false);assert.throws(()=>createBetweenEngraving(shapes));
 }
 assert.throws(()=>createBetweenEngraving([hex(0,0,100),hex(0,0,100)]),/ikke noe område/);
});
test('engraving and its hole survive SVG and native XCS export',()=>{
 const s=createBetweenEngraving([hex(0,0,100),hex(10,10,80)]);
 assert.match(buildLaserSvgString([s]),/fill-rule="evenodd"/);
 const reopened=importXcsStringToWorkspace(buildXcsProjectString([s])).shapes[0];assert.equal(reopened.laserMode,'engrave');assert.ok(!inside(reopened,50,50));assert.ok(inside(reopened,50,4));
});
