import test from 'node:test';
import assert from 'node:assert/strict';
import {bitmapPreviewLimit,bitmapPreviewOptions,bitmapResolutionInfo,bitmapExportSize} from '../js/icons.js';
import {geometricImageBoundary} from '../js/puzzle-image.js';
import {buildImagePuzzle} from '../js/puzzle-generator.js';
import {shapeToWorldPolygons} from '../js/geometry.js';
import {buildLaserSvgString} from '../js/export.js';
const photo={type:'image',id:'test',x:0,y:0,width:178,height:100.176,rotation:0,imageMeta:{sourceWidthPx:1672,sourceHeightPx:941,maskShape:'rounded'}};
test('detail preview keeps supplied image resolution and bounds large images by pixel budget',()=>{
 assert.equal(bitmapPreviewLimit(1672,941),1672);
 assert.equal(bitmapPreviewLimit(1672,941,'fast'),750);
 for(const [w,h] of [[16000,9000],[9000,16000],[12000,12000]]){const limit=bitmapPreviewLimit(w,h),s=limit/Math.max(w,h);assert.ok(limit<=4096);assert.ok(w*h*s*s<=8000000.001)}
 assert.match(bitmapResolutionInfo(photo),/239 DPI/);
 for(const previewMode of ['detail','original','fast'])assert.deepEqual(bitmapExportSize({...photo,imageMeta:{...photo.imageMeta,previewMode}}),{width:1672,height:941});
 assert.equal(bitmapPreviewOptions({previewMode:'original'},1672,941).filter,'original');
 assert.equal(bitmapPreviewOptions({previewMode:'detail'},1672,941).filter,undefined);
});
test('automatic rounded image frame uses eight precise Bezier anchors and exports cubic curves',()=>{
 const options=geometricImageBoundary(photo,photo.width,photo.height),group=buildImagePuzzle(photo,options),outline=group.children[3];
 assert.equal(outline.nodes.length,8);assert.ok(outline.d.includes('C'));
 const r=photo.height*.16,cx=photo.width-r,cy=photo.height-r;
 for(const p of shapeToWorldPolygons(outline,.001)[0])if(p.x>cx&&p.y>cy)assert.ok(Math.abs(Math.hypot(p.x-cx,p.y-cy)-r)<.006,'raster bumps must not survive in rounded corner');
 assert.ok(buildLaserSvgString([outline]).includes('C '));
});
test('known masks scale with image aspect and rotation without being traced from pixels',()=>{
 for(const maskShape of ['rounded','circle']){
 const source={...photo,width:220,height:70,rotation:37,flipX:true,imageMeta:{...photo.imageMeta,maskShape}};
 const options=geometricImageBoundary(source,source.width,source.height),group=buildImagePuzzle(source,options);
 assert.equal(group.children[3].nodes.length,maskShape==='circle'?4:8);
 assert.equal(group.children[0].imageMeta.puzzleClip.length,1);
 }
 assert.equal(geometricImageBoundary({...photo,imageMeta:{maskShape:'rect'}},178,100),null);
});
