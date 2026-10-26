import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDisplayColor, displayColor, colorLeaves, selectionColors } from '../js/appearance.js';
import { createPathShapeFromPolygons, performBooleanOnShapes, shapeToWorldPolygons, pointInMultiPolygon } from '../js/geometry.js';
import { encodeClipboard, decodeClipboard, cloneWithFreshIds } from '../js/object-commands.js';
import { workspacePayload } from '../js/storage.js';
import { buildLaserSvgString, buildXcsProjectString, importXcsStringToWorkspace } from '../js/export.js';
const triangle=()=>({...createPathShapeFromPolygons([[{x:20,y:100},{x:70,y:0},{x:120,y:100}]],'engrave'),displayColor:'#a855f7'});
const star=()=>({id:'star',type:'star',x:55,y:45,width:30,height:30,sides:5,innerRatio:.42,laserMode:'cut',displayColor:'#22c55e'});
test('display colors validate imported values and keep mode defaults',()=>{
 assert.equal(normalizeDisplayColor(' #ABC '),'#aabbcc');
 for(const c of ['red','url(x)','" onmouseover="x',null,{},'#12345678']) assert.equal(normalizeDisplayColor(c),null);
 assert.equal(displayColor({laserMode:'cut',displayColor:'bad'}),'#ff1e1e');
 assert.equal(displayColor({laserMode:'engrave',displayColor:'#ABC'}),'#aabbcc');
});
test('group colors reflect visible vector leaves without tinting photos or labels',()=>{
 const a=triangle(),b=star(),g={type:'group',children:[a,b,{type:'image'},{type:'path',guideLabel:true},{...a,hidden:true}]};
 assert.deepEqual(colorLeaves([g]),[a,b]);assert.deepEqual(selectionColors([g]),['#a855f7','#22c55e']);
});
test('outline star subtracts a real hole from colored engraving and preserves bounds and base operation',()=>{
 const a=triangle(),b=star(),result=performBooleanOnShapes([a,b],'subtract');
 assert.ok(result);assert.equal(result.displayColor,a.displayColor);assert.equal(result.laserMode,'engrave');
 const loops=shapeToWorldPolygons(result);assert.equal(loops.length,2);
 assert.equal(pointInMultiPolygon({x:70,y:60},loops),false);assert.equal(pointInMultiPolygon({x:70,y:90},loops),true);
 assert.equal(result.x,a.x);assert.equal(result.y,a.y);assert.equal(result.width,a.width);assert.equal(result.height,a.height);
 assert.equal(shapeToWorldPolygons(a).length,1);
 const second=performBooleanOnShapes([result,{...b,x:63,y:80,width:12,height:12}],'subtract');assert.equal(shapeToWorldPolygons(second).length,3);
});
test('colors survive workspace, clipboard and native XCS; laser SVG retains operation colors and holes',()=>{
 const a=performBooleanOnShapes([triangle(),star()],'subtract'),b=star();
 const payload=workspacePayload({shapes:[a,b]});assert.equal(payload.shapes[0].displayColor,a.displayColor);
 const pasted=cloneWithFreshIds(decodeClipboard(encodeClipboard([a,b])));assert.equal(pasted[0].displayColor,a.displayColor);
 const reopened=importXcsStringToWorkspace(buildXcsProjectString([a,b]));assert.equal(reopened.shapes[0].displayColor,a.displayColor);
 const svg=buildLaserSvgString([a,b]);assert.ok(!svg.includes('#a855f7'));assert.ok(!svg.includes('#22c55e'));assert.match(svg,/fill="#000000"/);assert.match(svg,/fill-rule="evenodd"/);
});
