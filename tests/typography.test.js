import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../vendor/opentype.module.js';
import { FONT_FILES } from '../js/font-files.js';
import { registerFontFile, generateTextPolygons, createTextShape, updateTextShape, FONT_CATALOG } from '../js/fonts.js';
import { computePolygonsBBox, shapeToWorldPolygons } from '../js/geometry.js';
import { buildLaserSvgString, buildXcsProjectString, importXcsStringToWorkspace } from '../js/export.js';
for(const file of new Set(Object.values(FONT_FILES))){const b=readFileSync(new URL('../fonts/'+file,import.meta.url));registerFontFile(file,b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const byGlyph=loops=>{const result=new Map();for(const loop of loops){if(!result.has(loop.glyphIndex))result.set(loop.glyphIndex,[]);result.get(loop.glyphIndex).push(...loop)}return result};
const area=loop=>loop.reduce((sum,p,i)=>{const q=loop[(i+1)%loop.length];return sum+p.x*q.y-q.x*p.y},0)/2;
const base={text:'ÅB iø',fontKey:'playfair',fontSizeMm:16,spacingMm:2};
function assertRigid(flat, curved){
 assert.equal(curved.length,flat.length);
 const a=byGlyph(flat),b=byGlyph(curved);assert.deepEqual([...a.keys()],[...b.keys()]);
 for(const [id,points] of a){const actual=b.get(id);assert.equal(actual.length,points.length);for(let i=1;i<points.length;i++)near(Math.hypot(points[i].x-points[0].x,points[i].y-points[0].y),Math.hypot(actual[i].x-actual[0].x,actual[i].y-actual[0].y));}
 flat.forEach((loop,i)=>near(area(loop),area(curved[i]),1e-5));
}
test('up/down rotate actual contours 90 degrees while keeping every glyph intact',()=>{
 const flat=generateTextPolygons(base), box=computePolygonsBBox(flat);
 for(const writingDirection of ['up','down']){const loops=generateTextPolygons({...base,writingDirection}),b=computePolygonsBBox(loops);near(b.width,box.height);near(b.height,box.width);assertRigid(flat,loops);}
});
test('stacked letters stay upright and advance in the chosen direction with exact added spacing',()=>{
 for(const fontKey of ['sans-bold','singleline'])for(const direction of ['stacked-up','stacked-down']){
  const a=generateTextPolygons({text:'ABC',fontKey,fontSizeMm:10,spacingMm:1,writingDirection:direction});
  const b=generateTextPolygons({text:'ABC',fontKey,fontSizeMm:10,spacingMm:3,writingDirection:direction});
  const ga=byGlyph(a),gb=byGlyph(b),sign=direction==='stacked-up'?-1:1;
  for(const [i,pts] of ga){near(gb.get(i)[0].y-pts[0].y,sign*i*2);near(gb.get(i)[0].x,pts[0].x);}
  assert.ok(sign*(ga.get(2)[0].y-ga.get(0)[0].y)>0);
 }
});
test('tracking remains in millimeters for accents, lowercase and ligature-prone words',()=>{
 for(const text of ['ÅÅ','gg','office']){
  const a=byGlyph(generateTextPolygons({...base,text,spacingMm:1}));const b=byGlyph(generateTextPolygons({...base,text,spacingMm:3}));
  assert.equal(a.size,Array.from(text).length);
  for(const [id,p] of a)near(b.get(id)[0].x-p[0].x,2*id);
 }
});
test('arcs and full circles preserve letter proportions, holes, accents and winding',()=>{
 const flat=generateTextPolygons(base);
 for(const curve of [-180,-55,55,180])assertRigid(flat,generateTextPolygons({...base,curve}));
});
test('rounded/sharp paths, flipped direction and reversed winding use rigid letters',()=>{
 const flat=generateTextPolygons(base);
 const shapes=[{type:'rect',x:20,y:30,width:100,height:65,rx:12},{type:'rect',x:20,y:30,width:35,height:20}];
 for(const shape of shapes){const path=shapeToWorldPolygons(shape,.2)[0];for(const reverse of [false,true])for(const flip of [false,true]){
  assertRigid(flat,generateTextPolygons({...base,customPath:reverse?[...path].reverse():path,customPathClosed:true,pathFlip:flip,pathNormalOffsetMm:4}));
 }}
 const open=[{x:0,y:0},{x:5,y:0},{x:5,y:5}];
 for(const offset of [-100,0,100])assertRigid(flat,generateTextPolygons({...base,customPath:open,pathOffsetPct:offset}));
});
test('closed path text is centered over the top and translation does not alter its layout',()=>{
 const path=shapeToWorldPolygons({type:'rect',x:100,y:100,width:120,height:80,rx:12},.2)[0];
 const a=generateTextPolygons({...base,text:'HHH',customPath:path,customPathClosed:true});
 const box=computePolygonsBBox(a);near(box.x+box.width/2,160,.01);
 const b=generateTextPolygons({...base,text:'HHH',customPath:path.map(p=>({x:p.x-230,y:p.y+70})),customPathClosed:true});
 a.forEach((loop,i)=>loop.forEach((p,j)=>{near(b[i][j].x,p.x-230);near(b[i][j].y,p.y+70)}));
});
test('direction, font, spacing and vector bounds roundtrip through saved projects and exports',()=>{
 for(const writingDirection of ['horizontal','up','down','stacked-up','stacked-down']){
  const shape=createTextShape({...base,writingDirection,x:50,y:70,fontKey:'lato'});
  const restored=importXcsStringToWorkspace(buildXcsProjectString([shape])).shapes[0];
  assert.equal(restored.textMeta.writingDirection,writingDirection);assert.equal(restored.textMeta.fontKey,'lato');assert.equal(restored.textMeta.spacingMm,2);assert.equal(restored.d,shape.d);
  assert.match(buildLaserSvgString([shape]),/path/);assert.ok(!buildLaserSvgString([shape]).includes('<text'));
  updateTextShape(restored,{text:'Ny ÆØÅ'});assert.equal(restored.textMeta.writingDirection,writingDirection);near(restored.x,50,.02);near(restored.y,70,.02);
 }
 const old=createTextShape(base);delete old.textMeta.writingDirection;updateTextShape(old,{spacingMm:4});assert.equal(old.textMeta.writingDirection,'horizontal');
});
test('all 12 added font families have native Norwegian glyphs, license files and distinct binaries',()=>{
 const added=FONT_CATALOG.filter(f=>f.category.startsWith('🆕'));assert.equal(added.length,12);
 const hashes=new Set();
 for(const def of added){const file=FONT_FILES[def.key],b=readFileSync(new URL('../fonts/'+file,import.meta.url));const font=parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
  for(const char of 'ÆØÅæøå')assert.ok(font.charToGlyphIndex(char)>0,`${def.label}: ${char}`);
  hashes.add(b.toString('base64'));const license=readFileSync(new URL('../fonts/'+def.key+(def.key==='robotoslab'?'-LICENSE.txt':'-OFL.txt'),import.meta.url),'utf8');assert.ok(license.length>1000);
 }assert.equal(hashes.size,12);
});
