import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '../vendor/opentype.module.js';
import {FONT_FILES} from '../js/font-files.js';
import {cleanFontContours,stencilFontContours} from '../js/font-contours.js';
import {registerFontFile,createTextShape,generateTextPolygons} from '../js/fonts.js';
import {parseSvgPathToPolygons,computePolygonsBBox,pointInMultiPolygon} from '../js/geometry.js';
import {pigpenGlyph,pigpenText} from '../js/pigpen.js';
import {buildLaserSvgString,buildXcsProjectString} from '../js/export.js';
const fonts=new Map();for(const file of new Set(Object.values(FONT_FILES))){const b=readFileSync(new URL('../fonts/'+file,import.meta.url)),bytes=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);registerFontFile(file,bytes);fonts.set(file,parse(bytes))}
const rectangle=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
const area=p=>p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a.x*b.y-a.y*b.x},0)/2;
const total=loops=>loops.reduce((sum,p)=>sum+area(p),0);
const winding=(point,loops)=>{let n=0;for(const loop of loops)for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length],cross=(b.x-a.x)*(point.y-a.y)-(point.x-a.x)*(b.y-a.y);if(a.y<=point.y&&b.y>point.y&&cross>0)n++;if(a.y>point.y&&b.y<=point.y&&cross<0)n--}return n};
test('overlapping glyph components become a union, genuine counters stay empty and duplicate edges disappear',()=>{
 const a=rectangle(0,0,10,10),b=rectangle(5,0,10,10),hole=rectangle(1,2,2,4).reverse(),clean=cleanFontContours([a,b,hole]);
 assert.equal(total(clean),142);assert.equal(clean.length,2);assert.ok(pointInMultiPolygon({x:7,y:5},clean));assert.ok(!pointInMultiPolygon({x:2,y:3},clean));assert.equal(total(cleanFontContours([a,a])),100);
});
test('every bundled font matches its nonzero glyph fill after contour cleaning, including ÆØÅ',()=>{
 let overlapSamples=0;
 for(const [file,font] of fonts)for(const ch of 'BJØRNSVEENÆÅæøåfi&'){
  const raw=parseSvgPathToPolygons(font.charToGlyph(ch).getPath(0,0,22).toPathData(5),.025),clean=cleanFontContours(raw),box=computePolygonsBBox(raw);
  for(let y=0;y<15;y++)for(let x=0;x<15;x++){
   const point={x:box.x+(x+.37)*box.width/15,y:box.y+(y+.41)*box.height/15},n=winding(point,raw);if(Math.abs(n)>1)overlapSamples++;
   assert.equal(pointInMultiPolygon(point,clean),n!==0,`${file}: ${ch} at ${JSON.stringify(point)}`);
  }
  // Each resulting edge must be a boundary, not an interior double cut.
  for(const loop of clean)for(let i=0;i<loop.length;i++){
   const a=loop[i],b=loop[(i+1)%loop.length],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<.01)continue;
   const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},eps=.0001;
   assert.notEqual(pointInMultiPolygon({x:mid.x-dy/len*eps,y:mid.y+dx/len*eps},clean),pointInMultiPolygon({x:mid.x+dy/len*eps,y:mid.y-dx/len*eps},clean),file+': interior edge');
  }
 }
 assert.ok(overlapSamples>50,'regression fixture must actually exercise overlapping native contours');
});
test('overlapping handwriting and tight tracking are welded after final arc/path layout',()=>{
 for(const fontKey of ['script','lobster','allura','sans-bold'])for(const curve of [0,70]){
  const options={text:'office ÆØÅ',fontKey,spacingMm:-1,curve,fontSizeMm:18},expected=cleanFontContours(generateTextPolygons(options)),shape=createTextShape({...options,x:0,y:0}),actual=parseSvgPathToPolygons(shape.d,.02);
  assert.ok(Math.abs(total(actual)-total(expected))<.1,`${fontKey}: union area changed`);assert.equal(actual.length,expected.length);
  assert.equal(actual.length,cleanFontContours(actual).length,'repeated cleanup must not remove extra cut contours');
  const svg=buildLaserSvgString([shape]),xcs=buildXcsProjectString([shape]);assert.ok(svg.includes('path')&&!svg.includes('<text'));assert.ok(xcs.includes(shape.id));
 }
});
test('single-line fonts keep their original open score strokes',()=>{
 const loops=generateTextPolygons({text:'AB Ø',fontKey:'singleline'}),clean=cleanFontContours(loops);assert.deepEqual(clean,loops);assert.ok(loops.every(l=>l.closed===false));assert.equal(createTextShape({text:'AB',fontKey:'singleline'}).laserMode,'score');
});
test('synthetic stencil opens counters only and leaves glyphs without counters intact',()=>{
 const solid=[rectangle(0,0,10,10)];assert.deepEqual(stencilFontContours(solid,.5),solid);
 const ring=cleanFontContours([...solid,rectangle(3,3,4,4).reverse()]),stencil=stencilFontContours(ring,.5);assert.ok(stencil.every(l=>area(l)>0));assert.ok(total(stencil)<total(ring));
});
test('Pigpen has 26 distinct symbols, correct dotted pairs, Nordic transliteration and vector export',()=>{
 const symbols=Array.from({length:26},(_,i)=>pigpenGlyph(String.fromCharCode(65+i)));assert.equal(new Set(symbols.map(s=>JSON.stringify(s))).size,26);
 for(let i=0;i<9;i++)assert.ok(total(symbols[i+9])>total(symbols[i]));for(let i=18;i<22;i++)assert.ok(total(symbols[i+4])>total(symbols[i]));
 assert.equal(pigpenText('Æ Ø Å é'),'AE O A E');assert.equal(pigpenGlyph('!'),null);
 const a=createTextShape({text:'ÆØÅ',fontKey:'pigpen'}),b=createTextShape({text:'AEOA',fontKey:'pigpen'});assert.equal(a.d,b.d);
 for(const writingDirection of ['horizontal','up','down','stacked-down','stacked-up']){const shape=createTextShape({text:'PIGPEN 123!',fontKey:'pigpen',writingDirection});assert.ok(shape.width>0&&shape.height>0);assert.ok(buildLaserSvgString([shape]).includes('path'));}
});
