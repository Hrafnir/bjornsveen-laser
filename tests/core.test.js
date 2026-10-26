import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPathShapeFromPolygons, analyzeShapesForLaser, removeDuplicateShapes, shapeToWorldPolygons, computePolygonsBBox, geometrySignature } from '../js/geometry.js';
import { buildXcsProjectString, importXcsStringToWorkspace, getDefaultLaserSettings, buildLaserSvgString } from '../js/export.js';
import { bitmapExportSize } from '../js/icons.js';
import { workspacePayload } from '../js/storage.js';
import { FONT_FILES } from '../js/font-files.js';
import { registerFontFile, createTextShape } from '../js/fonts.js';
import { lengthPx, parseTransform, multiply } from '../js/svg-import.js';
const square=[{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}];
const shape=()=>createPathShapeFromPolygons([square],'cut');
test('different paths with identical bounds are never deleted',()=>{
 const a=shape(), b=createPathShapeFromPolygons([[{x:10,y:0},{x:20,y:20},{x:0,y:20}]],'cut');
 assert.deepEqual(analyzeShapesForLaser([a,b],600,400).duplicateShapeIds,[]);
});
test('reversed and cyclic closed paths are duplicate geometry',()=>{
 const a=shape(), b=createPathShapeFromPolygons([[...square.slice(2),...square.slice(0,2)].reverse()],'cut');
 assert.equal(geometrySignature(a),geometrySignature(b));
 assert.deepEqual(analyzeShapesForLaser([a,b],600,400).duplicateShapeIds,[b.id]);
});
test('holes, open paths, operations and position distinguish objects',()=>{
 const a=shape(); const open=[...square];open.closed=false;
 for(const b of [createPathShapeFromPolygons([open]),createPathShapeFromPolygons([square,[{x:5,y:5},{x:6,y:5},{x:6,y:6}]]),{...a,laserMode:'score'},{...a,x:0.01}]) assert.notEqual(geometrySignature(a),geometrySignature(b));
});
test('duplicate removal recurses into groups, preserving unrelated children',()=>{
 const a=shape(), b=shape(), c={...shape(),x:60};
 const group={id:'g',type:'group',children:[b,c]};
 const result=removeDuplicateShapes([a,group],new Set(analyzeShapesForLaser([a,group],600,400).duplicateShapeIds));
 assert.equal(result.length,2);assert.deepEqual(result[1].children.map(x=>x.id),[c.id]);
 assert.equal(group.children.length,2);
});
test('bitmap bounds alone never mark images as duplicates',()=>{
 const a={...shape(),type:'image',dataUrl:'a'},b={...shape(),type:'image',dataUrl:'b'};
 assert.deepEqual(analyzeShapesForLaser([a,b],600,400).duplicateShapeIds,[]);
});
test('machine selection takes precedence over material presets',()=>{
 const cfg=getDefaultLaserSettings();cfg.presetKey='glass-uv';
 assert.equal(JSON.parse(buildXcsProjectString([shape()],{machineKey:'xtool-p3',laserSettings:cfg})).extId,'P3');
 assert.equal(JSON.parse(buildXcsProjectString([shape()],{machineKey:'sheet-a4',targetMachine:'xtool-f2',laserSettings:cfg})).extId,'GS009-CLASS-4');
});
test('native metadata keeps the independent machine and empty projects',()=>{
 const imported=importXcsStringToWorkspace(buildXcsProjectString([],{machineKey:'custom',targetMachine:'xtool-f2',bedWidth:123,bedHeight:456}));
 assert.deepEqual(imported.shapes,[]);assert.equal(imported.targetMachine,'xtool-f2');assert.equal(imported.bedWidth,123);
});
test('XCS paths keep world bounds without native metadata',()=>{
 const a={...shape(),x:120,y:70,rotation:45};const xcs=JSON.parse(buildXcsProjectString([a]));
 delete xcs.bjornsveenProject; xcs.canvas[0].displays.forEach(d=>delete d.bjornsveenShape);
 const b=importXcsStringToWorkspace(JSON.stringify(xcs)).shapes[0];
 const expected=computePolygonsBBox(shapeToWorldPolygons(a)),actual=computePolygonsBBox(shapeToWorldPolygons(b));
 for(const k of ['x','y','width','height'])assert.ok(Math.abs(expected[k]-actual[k])<0.02,k);
});
test('P3 bitmap parameters preserve scan mode, density and repeat',()=>{
 const cfg=getDefaultLaserSettings();Object.assign(cfg.bitmap,{dpi:508,bitmapScanMode:'oneWay',bitmapMode:'Stucki',repeat:3,airPump:70});
 const img={...shape(),type:'image',srcDataUrl:'data:image/png;base64,AA==',xcsDataUrl:'clean',imageMeta:{filter:'inherit'}};
 const xcs=JSON.parse(buildXcsProjectString([img],{laserSettings:cfg}));
 const d=xcs.canvas[0].displays[0];const c=d.data.BITMAP_ENGRAVING.parameter.customize;
 assert.equal(c.density,200);assert.equal(c.repeat,3);assert.equal(c.bitmapMode,'Stucki');assert.equal(c.bitmapScanMode,'oneWay');assert.equal(c.airPump,70);assert.equal(d.base64,'clean');
});
test('photo export derives resolution from physical size and keeps source ceiling',()=>{
 const s={width:200,height:100,imageMeta:{sourceWidthPx:4000,sourceHeightPx:2000}};
 assert.deepEqual(bitmapExportSize(s,254),{width:2000,height:1000});
 assert.deepEqual(bitmapExportSize(s,1000),{width:4000,height:2000});
});
test('saved payload keeps original photos, empty workspace and settings but strips caches',()=>{
 const payload=workspacePayload({machineKey:'custom',targetMachine:'xtool-f2',bedWidth:50,shapes:[{srcDataUrl:'original',xcsDataUrl:'processed',_cachedD:'cache',imageMeta:{sharpness:0}}]});
 assert.equal(payload.shapes[0].srcDataUrl,'original');assert.equal(payload.shapes[0].xcsDataUrl,undefined);assert.equal(payload.shapes[0]._cachedD,undefined);assert.equal(payload.shapes[0].imageMeta.sharpness,0);
 assert.deepEqual(workspacePayload({shapes:[]}).shapes,[]);
});
test('SVG units and transform composition',()=>{
 assert.equal(lengthPx('1in'),96);assert.equal(lengthPx('25.4mm'),96);assert.equal(lengthPx('2.54cm'),96);
 assert.deepEqual(parseTransform('translate(10 20) scale(2)'),[2,0,0,2,10,20]);
 const rotated=parseTransform('rotate(90 10 20)');assert.ok(Math.abs(rotated[4]-30)<1e-9);assert.ok(Math.abs(rotated[5]-10)<1e-9);
 assert.throws(()=>parseTransform('garbage'));assert.throws(()=>lengthPx('50%'));
});
test('SVG labels escape XML metacharacters',()=>assert.match(buildLaserSvgString([{...shape(),name:'A & B "test"'}]),/A &amp; B &quot;test&quot;/));
test('all bundled fonts parse and generate Norwegian vector contours without Canvas',()=>{
 for(const file of new Set(Object.values(FONT_FILES))) {const b=readFileSync(new URL('../fonts/'+file,import.meta.url));registerFontFile(file,b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
 for(const fontKey of Object.keys(FONT_FILES)) {
   const text=createTextShape({text:'ÆØÅ Oab',fontKey,fontSizeMm:18});
   assert.ok(text.d.length>10,fontKey);assert.ok(Number.isFinite(text.width),fontKey);assert.ok(Math.abs(text.height-18)<0.02,fontKey);
 }
});
