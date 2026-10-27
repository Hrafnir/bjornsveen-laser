import test from 'node:test';
import assert from 'node:assert/strict';
import { generateJigsawPuzzle, buildImagePuzzle, imagePuzzlePoint, PUZZLE_STYLES } from '../js/puzzle-generator.js';
import { detectPuzzleSilhouette } from '../js/puzzle-image.js';
import { shapeToWorldPolygons, computePolygonsBBox, pointInMultiPolygon } from '../js/geometry.js';
import { workspacePayload } from '../js/storage.js';
const near=(a,b,t=.03)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const pixels=(transparent=false)=>{
 const width=100,height=80,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const inside=x>=20&&x<80&&y>=10&&y<70,i=(y*width+x)*4;
  data.set(inside?[30,60,100,255]:[255,255,255,transparent?0:255],i);
 }return{data,width,height};
};
for(const style of PUZZLE_STYLES) test(`${style.id} cuts are open, deterministic and clipped to an oval`,()=>{
 const options={pieceStyle:style.id,outlineType:'ellipse',widthMm:140,heightMm:90,cols:6,rows:4,x:0,y:0};
 const puzzle=generateJigsawPuzzle(options),again=generateJigsawPuzzle(options);
 assert.deepEqual(puzzle.map(s=>s.cutStage),['puzzle-horizontal','puzzle-vertical','puzzle-outline']);
 assert.equal(puzzle[0].d,again[0].d);assert.equal(puzzle[1].d,again[1].d);
 const boundary=shapeToWorldPolygons(puzzle[2],.025);
 for(const s of puzzle.slice(0,2))for(const loop of shapeToWorldPolygons(s,.025)){
  assert.equal(loop.closed,false);
  for(let i=1;i<loop.length;i++){
   const a=loop[i-1],b=loop[i];
   assert.ok(pointInMultiPolygon({x:(a.x+b.x)/2,y:(a.y+b.y)/2},boundary),'cut segment outside outline');
  }
 }
 assert.ok(puzzle[2].nodes.length<40,'editable outline should use few anchors');
});
test('zero-radius frame keeps exact corners, inset reduces dimensions and invalid settings fail',()=>{
 const p=generateJigsawPuzzle({widthMm:100,heightMm:80,cornerRadiusMm:0,x:0,y:0})[2];
 assert.equal(p.nodes.length,4);near(p.width,100);near(p.height,80);
 const inset=generateJigsawPuzzle({widthMm:100,heightMm:80,cornerRadiusMm:0,insetMm:3})[2];
 near(inset.width,94);near(inset.height,74);
 for(const bad of [{rows:2.5},{cols:17},{widthMm:NaN},{insetMm:50},{pieceStyle:'unknown'},{cornerRadiusMm:-1}])assert.throws(()=>generateJigsawPuzzle({...bad,widthMm:bad.widthMm??40,heightMm:40}));
});
test('a concave custom boundary splits grid lines at exterior notches',()=>{
 const outlineLoops=[[{x:0,y:0},{x:100,y:0},{x:100,y:80},{x:65,y:80},{x:65,y:25},{x:35,y:25},{x:35,y:80},{x:0,y:80}]];
 const p=generateJigsawPuzzle({outlineLoops,cols:4,rows:4,pieceStyle:'straight'});
 assert.equal(shapeToWorldPolygons(p[0]).length,5);
 for(const loop of shapeToWorldPolygons(p[0]))for(const point of loop)assert.ok(point.y<=25.03||point.x<=35.03||point.x>=64.97);
});
test('transparency and uniform background produce a physical-size silhouette, opaque auto uses the frame',()=>{
 for(const transparent of [true,false]){
  const result=detectPuzzleSilhouette(pixels(transparent),{widthMm:200,heightMm:80,mode:'silhouette'});
  assert.equal(result.kind,transparent?'transparency':'background');
  const b=computePolygonsBBox(result.loops);near(b.x,40);near(b.y,10);near(b.width,120);near(b.height,60);
 }
 assert.equal(detectPuzzleSilhouette(pixels(),{widthMm:200,heightMm:80,mode:'auto'}).kind,'frame');
 const empty=pixels(true);empty.data.fill(0);assert.throws(()=>detectPuzzleSilhouette(empty,{widthMm:100,heightMm:80}));
 const photo=pixels();[0,99,7900,7999].forEach((i,j)=>photo.data.set([[255,0,0,255],[0,255,0,255],[0,0,255,255],[0,0,0,255]][j],i*4));
 assert.throws(()=>detectPuzzleSilhouette(photo,{widthMm:100,heightMm:80,mode:'silhouette'}),/ensfarget/);
});
test('silhouette keeps the main outline and ignores internal holes and disconnected speckles',()=>{
 const image=pixels(true);for(let y=30;y<40;y++)for(let x=40;x<50;x++)image.data[(y*100+x)*4+3]=0;
 image.data.set([0,0,0,255],0);
 const result=detectPuzzleSilhouette(image,{widthMm:100,heightMm:80});
 assert.equal(result.loops.length,1);assert.ok(result.discarded>=1);near(computePolygonsBBox(result.loops).width,60);
});
test('photo rotation and flips are shared by cuts, mask and editable anchors without changing the source',()=>{
 const source={id:'photo',type:'image',x:70,y:20,width:120,height:90,rotation:37,flipX:true,flipY:true,laserMode:'engrave',srcDataUrl:'data:image/png;base64,AA',imageMeta:{contrast:10}};
 const before=JSON.stringify(source),group=buildImagePuzzle(source,{outlineType:'ellipse',rows:3,cols:4});
 assert.equal(JSON.stringify(source),before);assert.equal(group.children.length,4);
 const pic=group.children[0],outline=group.children[3];assert.equal(pic.id,'photo');assert.equal(pic.imageMeta.contrast,10);
 assert.ok(outline.nodes.some(n=>n.in&&n.out));assert.ok(outline.nodes.length<40);
 const local=pic.imageMeta.puzzleClip[0].map(p=>({x:p.x*source.width,y:p.y*source.height}));
 const world=shapeToWorldPolygons(outline,.05)[0];
 for(const p of world){const q=imagePuzzlePoint(source,p,true);assert.ok(local.some(v=>Math.hypot(v.x-q.x,v.y-q.y)<.2));}
 const p={x:33,y:44},q=imagePuzzlePoint(source,imagePuzzlePoint(source,p),true);near(p.x,q.x);near(p.y,q.y);
 const saved=workspacePayload({shapes:[group]}).shapes[0];assert.deepEqual(saved.puzzleMeta,group.puzzleMeta);assert.deepEqual(saved.children[0].imageMeta.puzzleClip,pic.imageMeta.puzzleClip);
});
