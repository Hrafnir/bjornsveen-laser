import { fitBezier, mapNodes } from './bezier.js';
import Clipper from '../vendor/clipper.module.js';
import { uid, createPathShapeFromPolygons, shapeToWorldPolygons, computePolygonsBBox, rotatePoint, rebuildPathShapeFromNodes } from './geometry.js';
import { PUZZLE_CUT_STAGES } from './cut-order.js';
const SCALE = 10000;
const toClip = loop => loop.map(p => ({X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)}));
const fromClip = loop => loop.map(p => ({x:p.X/SCALE,y:p.Y/SCALE}));
export const PUZZLE_STYLES = [{id:'classic',name:'Klassiske låsebrikker'},{id:'angular',name:'Kantede låsebrikker'},{id:'wave',name:'Bølgebrikker (uten låsehode)'},{id:'straight',name:'Rette ruter'}];

/**
 * Generates a single interlocking jigsaw puzzle tab segment between (x0,y0) and (x1,y1).
 */
function sampleJigsawEdge(x0, y0, x1, y1, flipSign = 1, tabScale = 0.22, skew = 0) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const nx = -dy * flipSign;
  const ny = dx * flipSign;

  const pt = (u, v) => ({
    x: x0 + dx * u + nx * v,
    y: y0 + dy * u + ny * v
  });

  const s = tabScale;
  const c = skew * 0.04;
  // Classic interlocking puzzle neck + rounded head constructed from 3 cubic Beziers
  const beziers = [
    [pt(0, 0), pt(0.35, -s * 0.08), pt(0.40 + c, -s * 0.22), pt(0.37 + c, s * 0.32)],
    [pt(0.37 + c, s * 0.32), pt(0.30 + c, s * 1.05), pt(0.70 + c, s * 1.05), pt(0.63 + c, s * 0.32)],
    [pt(0.63 + c, s * 0.32), pt(0.60 + c, -s * 0.22), pt(0.65, -s * 0.08), pt(1, 0)]
  ];

  const out = [{ x: x0, y: y0 }];
  for (const [p0, p1, p2, p3] of beziers) {
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      out.push({
        x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
        y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
      });
    }
  }
  return out;
}


function edgePoints(x0,y0,x1,y1,flip,depth,skew,style) {
  if (style === 'classic') return sampleJigsawEdge(x0,y0,x1,y1,flip,depth,skew);
  const dx=x1-x0,dy=y1-y0;
  const point=(u,v)=>({x:x0+dx*u-dy*flip*v,y:y0+dy*u+dx*flip*v});
  if(style==='straight')return [point(0,0),point(1,0)];
  if(style==='angular')return [[0,0],[.34,0],[.42,depth*.08],[.35,depth*.8],[.65,depth*.8],[.58,depth*.08],[.66,0],[1,0]].map(([u,v])=>point(u,v));
  return Array.from({length:33},(_,i)=>point(i/32,Math.sin(i/32*Math.PI*2)*depth*.55));
}

export function offsetPuzzleBoundary(loops,insetMm=0) {
  if(!Number.isFinite(insetMm)||Math.abs(insetMm)>50)throw Error('Kantavstand må være mellom −50 og 50 mm.');
  if(!insetMm)return loops;
  const clip=new Clipper.Clipper(), normalized=new Clipper.Paths();
  clip.AddPaths(loops.map(toClip),Clipper.PolyType.ptSubject,true);
  clip.Execute(Clipper.ClipType.ctUnion,normalized,Clipper.PolyFillType.pftEvenOdd,Clipper.PolyFillType.pftEvenOdd);
  const offset=new Clipper.ClipperOffset(2,.02*SCALE),result=new Clipper.Paths();
  offset.AddPaths(normalized,Clipper.JoinType.jtRound,Clipper.EndType.etClosedPolygon);
  offset.Execute(result,-insetMm*SCALE);
  if(!result.length)throw Error('Kantavstanden fjerner hele puslespillet. Bruk mindre innrykk.');
  return result.map(fromClip);
}

export function clipPuzzleLines(lines,boundary,axis) {
  const clip=new Clipper.Clipper(),tree=new Clipper.PolyTree();
  clip.AddPaths(lines.map(toClip),Clipper.PolyType.ptSubject,false);
  clip.AddPaths(boundary.map(toClip),Clipper.PolyType.ptClip,true);
  clip.Execute(Clipper.ClipType.ctIntersection,tree,Clipper.PolyFillType.pftEvenOdd,Clipper.PolyFillType.pftEvenOdd);
  return Clipper.Clipper.OpenPathsFromPolyTree(tree).map(line=>{
    const loop=fromClip(line);if(loop[0][axis]>loop.at(-1)[axis])loop.reverse();loop.closed=false;return loop;
  }).sort((a,b)=>axis==='x'?a[0].y-b[0].y||a[0].x-b[0].x:a[0].x-b[0].x||a[0].y-b[0].y);
}

function frameNodes(x,y,w,h,r,ellipse) {
  const k=0.5522847498307936;
  if(ellipse){
    const a=w/2,b=h/2,cx=x+a,cy=y+b;
    return [{x:cx+a,y:cy,in:{x:cx+a,y:cy-k*b},out:{x:cx+a,y:cy+k*b}},
      {x:cx,y:cy+b,in:{x:cx+k*a,y:cy+b},out:{x:cx-k*a,y:cy+b}},
      {x:cx-a,y:cy,in:{x:cx-a,y:cy+k*b},out:{x:cx-a,y:cy-k*b}},
      {x:cx,y:cy-b,in:{x:cx-k*a,y:cy-b},out:{x:cx+k*a,y:cy-b}}].map(n=>({...n,smooth:true}));
  }
  if(!r)return [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
  return [{x:x+r,y,in:{x:x+r-k*r,y}}, {x:x+w-r,y,out:{x:x+w-r+k*r,y}},
    {x:x+w,y:y+r,in:{x:x+w,y:y+r-k*r}}, {x:x+w,y:y+h-r,out:{x:x+w,y:y+h-r+k*r}},
    {x:x+w-r,y:y+h,in:{x:x+w-r+k*r,y:y+h}}, {x:x+r,y:y+h,out:{x:x+r-k*r,y:y+h}},
    {x,y:y+h-r,in:{x,y:y+h-r+k*r}}, {x,y:y+r,out:{x,y:y+r-k*r}}].map(n=>({...n,smooth:true}));
}

export function generateJigsawPuzzle({widthMm=160,heightMm=120,cols=4,rows=3,cornerRadiusMm=6,tabSizePct=22,seed=42,pieceStyle='classic',outlineLoops=null,outlineNodes=null,outlineType='rounded',insetMm=0,x=20,y=20}={}) {
  const W=Number(widthMm),H=Number(heightMm),C=Number(cols),R=Number(rows),radius=Number(cornerRadiusMm);
  if(!Number.isFinite(W)||!Number.isFinite(H)||W<5||H<5||W>2000||H>2000)throw Error('Puslespillet må være mellom 5 og 2000 mm på hver side.');
  if(!Number.isInteger(C)||!Number.isInteger(R)||C<2||R<2||C>16||R>16)throw Error('Velg 2–16 hele rader og kolonner.');
  if(!PUZZLE_STYLES.some(s=>s.id===pieceStyle))throw Error('Ukjent brikketype.');
  if(!Number.isFinite(radius)||radius<0||radius>Math.min(W,H)/2)throw Error('Hjørneradius må være mellom 0 og halvparten av korteste side.');
  const tab=Number(tabSizePct);if(!Number.isFinite(tab)||tab<10||tab>32)throw Error('Låsstørrelse må være mellom 10 og 32 %.');
  let outline={id:uid('outline'),type:outlineType==='ellipse'?'ellipse':'rect',name:'Puslespill 3 – Ytterkontur',laserMode:'cut',x,y,width:W,height:H,rx:radius,rotation:0};
  let boundary=outlineLoops||shapeToWorldPolygons(outline,.05);
  if(!boundary.length||boundary.some(l=>l.closed===false||l.length<3||l.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))))throw Error('Ytterkonturen må bestå av lukkede kurver.');
  boundary=offsetPuzzleBoundary(boundary,Number(insetMm));
  if(outlineLoops||insetMm){outline=createPathShapeFromPolygons(boundary,'cut','Puslespill 3 – Ytterkontur');Object.assign(outline,outline.origBBox);}
  if(boundary.length!==1)throw Error('Velg én sammenhengende ytterkontur uten innvendige hull. Mindre innrykk kan bevare forbindelsene.');
  const editable=createPathShapeFromPolygons(boundary,'cut','Puslespill 3 – Ytterkontur');
  // Sample long straight spans too: a fit must not bow between distant endpoints.
  const dense=boundary[0].flatMap((p,i)=>{const q=boundary[0][(i+1)%boundary[0].length],steps=Math.max(1,Math.ceil(Math.hypot(q.x-p.x,q.y-p.y)));return Array.from({length:steps},(_,j)=>({x:p.x+(q.x-p.x)*j/steps,y:p.y+(q.y-p.y)*j/steps}))});
  editable.nodes=outlineNodes&&!insetMm?mapNodes(outlineNodes,p=>({...p})):!outlineLoops&&!insetMm?frameNodes(x,y,W,H,radius,outlineType==='ellipse'):fitBezier(dense,.02,true);editable.closedPath=true;editable.nodeModel='bezier';
  outline=rebuildPathShapeFromNodes(editable);
  boundary=shapeToWorldPolygons(outline,.025);
  const box=computePolygonsBBox(boundary),cellW=box.width/C,cellH=box.height/R;
  if(Math.min(cellW,cellH)<2)throw Error('Brikkene blir mindre enn 2 mm. Velg færre rader eller kolonner.');
  let random=(Number(seed)||42)%2147483647;if(random<=0)random+=2147483646;
  const rand=()=>{random=random*16807%2147483647;return(random-1)/2147483646};
  const horizontal=[],vertical=[];
  for(let r=1;r<R;r++){
    const line=[];for(let c=0;c<C;c++){
      const seg=edgePoints(box.x+c*cellW,box.y+r*cellH,box.x+(c+1)*cellW,box.y+r*cellH,rand()>.5?1:-1,tab/100*Math.min(cellW,cellH)/cellW,(rand()-.5)*2,pieceStyle);
      if(c)seg.shift();line.push(...seg);
    }line.closed=false;horizontal.push(line);
  }
  for(let c=1;c<C;c++){
    const line=[];for(let r=0;r<R;r++){
      const seg=edgePoints(box.x+c*cellW,box.y+r*cellH,box.x+c*cellW,box.y+(r+1)*cellH,rand()>.5?1:-1,tab/100*Math.min(cellW,cellH)/cellH,(rand()-.5)*2,pieceStyle);
      if(r)seg.shift();line.push(...seg);
    }line.closed=false;vertical.push(line);
  }
  const clipped=[clipPuzzleLines(horizontal,boundary,'x'),clipPuzzleLines(vertical,boundary,'y')];
  if(!clipped.some(lines=>lines.length))throw Error('Ingen brikkelinjer treffer ytterkonturen. Endre kontur eller rutenett.');
  const shapes=clipped.map((lines,i)=>{const shape=createPathShapeFromPolygons(lines,'cut',`Puslespill ${i+1} – ${i?'Loddrette':'Vannrette'}`);Object.assign(shape,shape.origBBox);return shape});
  shapes.push(outline);
  return shapes.map((shape,i)=>({...shape,cutStage:PUZZLE_CUT_STAGES[i].id}));
}

export function imagePuzzlePoint(image,p,inverse=false) {
  const center={x:image.x+image.width/2,y:image.y+image.height/2};
  if(inverse){const q=rotatePoint(p,center,-(image.rotation||0));return{x:(image.flipX?image.width-(q.x-image.x):q.x-image.x),y:(image.flipY?image.height-(q.y-image.y):q.y-image.y)}}
  return rotatePoint({x:image.x+(image.flipX?image.width-p.x:p.x),y:image.y+(image.flipY?image.height-p.y:p.y)},center,image.rotation||0);
}

export function buildImagePuzzle(image,options={}) {
  const cuts=generateJigsawPuzzle({...options,widthMm:image.width,heightMm:image.height,x:0,y:0});
  const localOutline=shapeToWorldPolygons(cuts[2],.05);
  const picture=JSON.parse(JSON.stringify(image));
  picture.imageMeta={...picture.imageMeta,puzzleClip:localOutline.map(loop=>loop.map(p=>({x:p.x/image.width,y:p.y/image.height})))};
  delete picture.xcsDataUrl;delete picture.exportDataUrl;
  const worldCuts=cuts.map((s,index)=>{
    const loops=shapeToWorldPolygons(s,.05).map(loop=>{const out=loop.map(p=>imagePuzzlePoint(image,p));out.closed=loop.closed!==false;return out});
    const result=createPathShapeFromPolygons(loops,'cut',s.name);Object.assign(result,result.origBBox);result.cutStage=s.cutStage;
    if(index===2&&s.nodes){result.nodes=mapNodes(s.nodes,p=>imagePuzzlePoint(image,p));result.closedPath=true;result.nodeModel='bezier';rebuildPathShapeFromNodes(result);}
    return result;
  });
  const box=computePolygonsBBox(worldCuts.flatMap(s=>shapeToWorldPolygons(s)));
  const {outlineLoops,outlineNodes,...settings}=options;
  return {id:uid('puzzle'),type:'group',name:'Bildepuslespill',laserMode:'cut',...box,rotation:0,children:[picture,...worldCuts],puzzleMeta:{version:1,...settings}};
}
