import { getCutStage } from './cut-order.js';
import { uid, createPathShapeFromPolygons, parseSvgPathToPolygons, shapeToLocalPolygons } from './geometry.js';
const I = [1, 0, 0, 1, 0, 0];
export function multiply(a, b) {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
const point = (m, p) => ({ x: m[0]*p.x+m[2]*p.y+m[4], y: m[1]*p.x+m[3]*p.y+m[5] });
const numbers = s => (s.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) || []).map(Number);
export function parseTransform(text = '') {
  let m = I;
  let consumed = '';
  for (const match of text.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    consumed += match[0];
    const [name, v] = [match[1], numbers(match[2])];
    let t;
    if (name === 'matrix' && v.length === 6) t = v;
    else if (name === 'translate' && [1,2].includes(v.length)) t = [1,0,0,1,v[0],v[1] || 0];
    else if (name === 'scale' && [1,2].includes(v.length)) t = [v[0],0,0,v[1] ?? v[0],0,0];
    else if (name === 'rotate' && [1,3].includes(v.length)) {
      const a = v[0]*Math.PI/180, c = Math.cos(a), s = Math.sin(a);
      t = [c,s,-s,c,0,0];
      if (v.length === 3) t = multiply(multiply([1,0,0,1,v[1],v[2]],t),[1,0,0,1,-v[1],-v[2]]);
    } else if (name === 'skewX' && v.length === 1) t = [1,0,Math.tan(v[0]*Math.PI/180),1,0,0];
    else if (name === 'skewY' && v.length === 1) t = [1,Math.tan(v[0]*Math.PI/180),0,1,0,0];
    else throw new Error('Ugyldig SVG-transformasjon');
    if (!t.every(Number.isFinite)) throw new Error('Ugyldige koordinater');
    m = multiply(m,t);
  }
  if (consumed.replace(/[\s,]/g,'') !== text.replace(/[\s,]/g,'')) throw new Error('Ugyldig SVG-transformasjon');
  return m;
}
// SVG absolute lengths are CSS pixels (96 px/in) before the viewBox transform.
export function lengthPx(raw, fallback = 0) {
  if (raw == null || raw === '') return fallback;
  const match = String(raw).trim().match(/^([-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?)\s*(mm|cm|in|pt|pc|px)?$/i);
  if (!match) throw new Error(`Ustøttet SVG-lengde: ${raw}`);
  return Number(match[1]) * ({mm:96/25.4,cm:96/2.54,in:96,pt:96/72,pc:16,px:1}[match[2]?.toLowerCase()] || 1);
}
export function importSvgStringToShapes(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('SVG-filen inneholder ugyldig XML.');
  const root = doc.documentElement;
  if (root.localName !== 'svg') throw new Error('Filen er ikke en SVG.');
  const result = [], warnings = new Set();
  result.warnings = [];
  const vb = numbers(root.getAttribute('viewBox') || '');
  let initial = [25.4/96,0,0,25.4/96,0,0];
  if (vb.length) {
    if (vb.length !== 4 || vb[2] <= 0 || vb[3] <= 0) throw new Error('Ugyldig viewBox.');
    const width = lengthPx(root.getAttribute('width'),vb[2]);
    const height = lengthPx(root.getAttribute('height'),vb[3]);
    if (width <= 0 || height <= 0) throw new Error('SVG-mål må være positive.');
    let sx=width/vb[2], sy=height/vb[3], dx=0, dy=0;
    const aspect=(root.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim();
    if (aspect !== 'none') {
      if (aspect.includes('slice')) throw new Error('SVG med «slice» må lagres med utsnittet bakt inn.');
      const k=Math.min(sx,sy); sx=sy=k;
      dx=(width-vb[2]*k)*(aspect.includes('xMin')?0:aspect.includes('xMax')?1:0.5);
      dy=(height-vb[3]*k)*(aspect.includes('YMin')?0:aspect.includes('YMax')?1:0.5);
    }
    initial=multiply(initial,[sx,0,0,sy,dx-vb[0]*sx,dy-vb[1]*sy]);
  }
  const visit=(el,parent,inherit,depth=0)=>{
    if (depth > 100 || result.length > 10000) throw new Error('SVG-filen er for kompleks.');
    const tag=el.localName;
    if (['defs','metadata','title','desc'].includes(tag)) return;
    if (['script','foreignObject','use','text','style','symbol','pattern','clipPath','mask','filter'].includes(tag) || (tag==='svg' && el!==root)) {
      warnings.add(`Utelatt: ${tag}. Gjør tekst/referanser om til baner og bak inn CSS/utsnitt før import.`); return;
    }
    const style={...inherit};
    for(const k of ['fill','stroke','visibility','display','opacity','clip-path','mask','filter']) {
      const val=el.style?.getPropertyValue(k) || el.getAttribute(k);
      if(val) style[k]=val;
    }
    if(style.display==='none' || style.visibility==='hidden' || Number(style.opacity)===0) return;
    if(['clip-path','mask','filter'].some(k=>style[k] && style[k]!=='none')) {
      warnings.add('Utelatt element med maske, klipping eller filter. Bak inn effekten før import.'); return;
    }
    const m=multiply(parent,parseTransform(el.getAttribute('transform') || ''));
    if(tag==='g' || el===root) { for(const child of el.children) visit(child,m,style,depth+1);return; }
    const n=(k,d=0)=>lengthPx(el.getAttribute(k),d);
    const name=el.getAttribute('data-name') || el.id || `Importert ${tag}`;
    if(tag==='image') {
      const href=el.getAttribute('href') || el.getAttribute('xlink:href') || '';
      if(!/^data:image\/(png|jpeg|webp);base64,/i.test(href)) {warnings.add('Utelatt eksternt eller ustøttet bilde. Bruk innebygd PNG/JPEG/WebP.');return;}
      const w=n('width'),h=n('height');if(w<=0||h<=0)return;
      const sx=Math.hypot(m[0],m[1]),sy=Math.hypot(m[2],m[3]);
      if(!sx||!sy||Math.abs(m[0]*m[2]+m[1]*m[3])>1e-7*sx*sy) {warnings.add('Utelatt skjevstilt bilde. Bak inn skjevstillingen før import.');return;}
      const pos=point(m,{x:n('x')+w/2,y:n('y')+h/2});
      result.push({id:uid('img'),type:'image',name,laserMode:'engrave',x:pos.x-w*sx/2,y:pos.y-h*sy/2,width:w*sx,height:h*sy,rotation:Math.atan2(m[1],m[0])*180/Math.PI,flipY:m[0]*m[3]-m[1]*m[2]<0,srcDataUrl:href,dataUrl:href,imageMeta:{filter:'grayscale',sharpness:50,contrast:0,brightness:0}});
      return;
    }
    let loops=[];
    if(tag==='path') loops=parseSvgPathToPolygons(el.getAttribute('d') || '',0.1);
    else if(tag==='rect') {
      const w=n('width'),h=n('height'); if(w>0&&h>0) {
        const rx=Math.min(w/2,n('rx',n('ry'))), ry=Math.min(h/2,n('ry',rx));
        const x=n('x'),y=n('y');
        if(rx>0&&ry>0) loops=parseSvgPathToPolygons(`M${x+rx},${y}H${x+w-rx}A${rx},${ry} 0 0 1 ${x+w},${y+ry}V${y+h-ry}A${rx},${ry} 0 0 1 ${x+w-rx},${y+h}H${x+rx}A${rx},${ry} 0 0 1 ${x},${y+h-ry}V${y+ry}A${rx},${ry} 0 0 1 ${x+rx},${y}Z`,0.1);
        else loops=shapeToLocalPolygons({type:'rect',x,y,width:w,height:h});
      }
    } else if(tag==='circle'||tag==='ellipse') {
      const rx=tag==='circle'?n('r'):n('rx'),ry=tag==='circle'?rx:n('ry');
      if(rx>0&&ry>0) loops=shapeToLocalPolygons({type:'ellipse',x:n('cx')-rx,y:n('cy')-ry,width:rx*2,height:ry*2},0.1);
    } else if(tag==='line') {const l=[{x:n('x1'),y:n('y1')},{x:n('x2'),y:n('y2')}];l.closed=false;loops=[l];}
    else if(tag==='polygon'||tag==='polyline') {
      const coords=numbers(el.getAttribute('points')||'');if(coords.length%2)throw new Error('Ugyldige SVG-punkter.');
      const l=[];for(let i=0;i<coords.length;i+=2)l.push({x:coords[i],y:coords[i+1]});l.closed=tag==='polygon';loops=[l];
    } else {warnings.add(`Utelatt: ${tag}.`);return;}
    const stroke=(style.stroke||'none').toLowerCase();
    const mode=['blue','#00f','#0000ff','#3b82f6'].includes(stroke)?'score':stroke==='none' && style.fill!=='none'?'engrave':'cut';
    const mapped=loops.filter(l=>l.length>=2).map(l=>{const a=l.map(p=>point(m,p));a.closed=l.closed!==false;return a;});
    if(mapped.length) {
      const shape=createPathShapeFromPolygons(mapped,mode,name);
      const stage=getCutStage({laserMode:mode,cutStage:el.getAttribute('data-cut-stage')});
      if(stage) shape.cutStage=stage.id;
      result.push(shape);
    }
  };
  visit(root,initial,{fill:'black',stroke:'none'});
  result.warnings=[...warnings];
  return result;
}
