import { marchingSquaresZeroIsoline, simplifyRdpPolygon } from './geometry.js';
import { processBitmapElementToDataUrl } from './icons.js';

export function detectPuzzleSilhouette({data,width,height},{widthMm,heightMm,mode='auto',tolerance=35,smoothing=.25}={}) {
  const count=width*height;
  if(!count||data.length!==count*4)throw Error('Bildet kunne ikke analyseres.');
  const mask=new Uint8Array(count);let transparent=0;
  for(let i=0;i<count;i++)if(data[i*4+3]<32)transparent++;
  let kind='transparency';
  if(transparent>count*.005){
    for(let i=0;i<count;i++)mask[i]=data[i*4+3]>=32?1:0;
  } else {
    if(mode==='auto')return {loops:null,kind:'frame'};
    kind='background';
    const corners=[0,width-1,(height-1)*width,count-1];
    const bg=[0,1,2].map(c=>corners.map(i=>data[i*4+c]).sort((a,b)=>a-b)[1]);
    const distance=i=>Math.max(...bg.map((v,c)=>Math.abs(data[i*4+c]-v)));
    if(corners.filter(i=>distance(i)<=tolerance).length<3)throw Error('Bakgrunnen er ikke ensfarget nok. Velg bildekant eller tegn en egen ytterkontur.');
    const seen=new Uint8Array(count),queue=new Uint32Array(count);let start=0,end=0;
    const add=i=>{if(!seen[i]&&distance(i)<=tolerance){seen[i]=1;queue[end++]=i}};
    for(let x=0;x<width;x++){add(x);add((height-1)*width+x)}
    for(let y=0;y<height;y++){add(y*width);add(y*width+width-1)}
    while(start<end){const i=queue[start++],x=i%width,y=Math.floor(i/width);if(x)add(i-1);if(x<width-1)add(i+1);if(y)add(i-width);if(y<height-1)add(i+width)}
    for(let i=0;i<count;i++)mask[i]=seen[i]?0:1;
  }
  const cols=width+2,rows=height+2,field=new Float32Array(cols*rows).fill(1);
  let foreground=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(mask[y*width+x]){field[(y+1)*cols+x+1]=-1;foreground++}
  if(foreground<count*.002)throw Error('Fant ikke et tydelig motiv. Endre bakgrunnstoleransen eller bruk bildekanten.');
  const loops=marchingSquaresZeroIsoline(field,cols,rows,-.5,-.5,1).map(loop=>loop.map(p=>({x:p.x/width*widthMm,y:p.y/height*heightMm})));
  const area=loop=>Math.abs(loop.reduce((a,p,i)=>{const q=loop[(i+1)%loop.length];return a+p.x*q.y-q.x*p.y},0));
  loops.sort((a,b)=>area(b)-area(a));
  if(!loops.length)throw Error('Fant ingen lukket ytterkontur.');
  const outline=simplifyRdpPolygon(loops[0],Math.max(0,Number(smoothing)||0));outline.closed=true;
  return {loops:[outline],kind,discarded:loops.length-1};
}

export async function loadPuzzleImagePixels(image) {
  const load=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Kunne ikke lese bildet.'));img.src=src});
  const source=await load(image.srcDataUrl||image.dataUrl);
  // Detect the original motif, never the individual dots in its laser dithering preview.
  const {puzzleClip,...meta}=image.imageMeta||{};
  const clean=processBitmapElementToDataUrl(source,{...meta,brightness:0,contrast:0,sharpness:50,invert:false,filter:'original',maxDimPx:360});
  const bitmap=await load(clean),canvas=document.createElement('canvas');
  canvas.width=bitmap.naturalWidth;canvas.height=bitmap.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);
  return ctx.getImageData(0,0,canvas.width,canvas.height);
}
