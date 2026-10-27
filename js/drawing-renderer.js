import { computePolygonsBBox, polygonsToSvgPath, rotatePoint } from './geometry.js';
import { PAPER_SIZES, MATERIAL_COLORS, drawingParts, drawingShapeLoops, flatPoint, point3d, isoPoint, resolveAnchor } from './drawing-model.js';

export const escapeDrawingText = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const E=escapeDrawingText;
export const drawingNumber=n=>Number(n.toFixed(2)).toLocaleString('nb-NO',{maximumFractionDigits:2});
const n=v=>Number(v.toFixed(5));
const path=loops=>polygonsToSvgPath(loops,4);
const line=(a,b,attrs='')=>`<path d="M ${n(a.x)} ${n(a.y)} L ${n(b.x)} ${n(b.y)}" fill="none" ${attrs}/>`;
const label=(x,y,text,size,attrs='')=>`<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" ${attrs}>${E(text)}</text>`;
const safeColor=c=>/^#[0-9a-f]{6}$/i.test(c||'')?c:'#384456';
function localLoops(part,shape) {
  return drawingShapeLoops(shape).map(loop=>{const a=loop.map(p=>({x:p.x-part.bounds.x,y:p.y-part.bounds.y}));a.closed=loop.closed!==false;return a});
}
function solidLoops(part) {
  let loops=part.leaves.filter(s=>s.laserMode==='cut').flatMap(s=>localLoops(part,s)).filter(l=>l.closed!==false&&l.length>2);
  if(!loops.length&&part.item.solid)loops=part.leaves.flatMap(s=>localLoops(part,s)).filter(l=>l.closed!==false&&l.length>2);
  return loops;
}
function imageMarkup(part,shape,project) {
  const href=shape.dataUrl||shape.srcDataUrl||'';
  if(!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(href))return '';
  const center={x:shape.x+shape.width/2,y:shape.y+shape.height/2};
  const point=(u,v)=>{
    const p=rotatePoint({x:shape.x+(shape.flipX?1-u:u)*shape.width,y:shape.y+(shape.flipY?1-v:v)*shape.height},center,shape.rotation||0);
    return project({x:p.x-part.bounds.x,y:p.y-part.bounds.y});
  };
  const a=point(0,0),b=point(1,0),c=point(0,1);
  return `<image width="1" height="1" preserveAspectRatio="none" href="${E(href)}" transform="matrix(${n(b.x-a.x)} ${n(b.y-a.y)} ${n(c.x-a.x)} ${n(c.y-a.y)} ${n(a.x)} ${n(a.y)})"/>`;
}
export function drawingBounds(parts,view='flat') {
  const loops=parts.flatMap(part=>part.loops.flatMap(loop=>{
    const local=loop.map(p=>({x:p.x-part.bounds.x,y:p.y-part.bounds.y}));
    if(view==='flat')return [local.map(p=>flatPoint(part,p))];
    return [0,part.item.solid?part.thickness:0].map(t=>local.map(p=>isoPoint(point3d(part,p,t))));
  }));
  return computePolygonsBBox(loops);
}
export function renderDrawingGeometry(parts,{view='flat',finish='wood',strokeWidth=.35,selectedId=null,labels=true,textSize=4}={}) {
  const fill=MATERIAL_COLORS[finish]||MATERIAL_COLORS.wood;
  const tag=(part,content)=>`<g data-drawing-item="${E(part.item.id)}">${content}</g>`;
  let svg='';
  if(view==='flat'){
    for(const [index,part] of parts.entries()){
      const map=p=>flatPoint(part,p),solids=solidLoops(part);
      let content=solids.length?`<path d="${path(solids.map(l=>l.map(map)))}" fill="${part.item.solid?'#fcfcfa':'none'}" fill-rule="evenodd" stroke="#172b3a" stroke-width="${strokeWidth}"/>`:'';
      for(const leaf of part.leaves){
        if(leaf.type==='image'){content+=imageMarkup(part,leaf,map);continue;}
        const loops=localLoops(part,leaf);const isEngrave=leaf.laserMode==='engrave';
        if(leaf.laserMode==='cut'&&loops.every(l=>l.closed!==false)&&solids.length)continue;
        content+=`<path d="${path(loops.map(l=>{const a=l.map(map);a.closed=l.closed;return a}))}" fill="${isEngrave?safeColor(leaf.displayColor):'none'}" fill-rule="evenodd" stroke="${isEngrave?'none':'#42566c'}" stroke-width="${strokeWidth}"/>`;
      }
      // Redraw cutting contours over photographs.
      if(part.leaves.some(s=>s.type==='image')&&solids.length)content+=`<path d="${path(solids.map(l=>l.map(map)))}" fill="none" stroke="#172b3a" stroke-width="${strokeWidth}"/>`;
      if(labels){const b=computePolygonsBBox(part.loops.map(l=>l.map(p=>map({x:p.x-part.bounds.x,y:p.y-part.bounds.y}))));content+=label(b.x+b.width/2,b.y-2*textSize,`${index+1}. ${short(part.item.name,28)}`,textSize,'text-anchor="middle" fill="#243d52" stroke="white" stroke-width="0.8" paint-order="stroke"');}
      svg+=tag(part,content);
    }
  }else{
    const faces=[];
    const add=(part,loops,fillColor,depthPoints,extra='')=>faces.push({depth:depthPoints.reduce((sum,p)=>sum+p.x+p.y+p.z*1.5,0)/Math.max(1,depthPoints.length),markup:tag(part,`<path d="${path(loops)}" fill="${fillColor}" fill-rule="evenodd" stroke="#69543d" stroke-width="${strokeWidth*.65}" ${extra}/>`)});
    for(const part of parts){
      const solids=solidLoops(part),thickness=part.item.solid?part.thickness:0;
      if(part.item.solid&&solids.length){
        for(const z of [0,thickness]){
          const world=solids.map(l=>l.map(p=>point3d(part,p,z)));
          add(part,world.map(l=>l.map(isoPoint)),fill,world.flat());
        }
        if(thickness>0)for(const loop of solids)for(let i=0;i<loop.length;i++){
          const a=loop[i],b=loop[(i+1)%loop.length];
          const world=[point3d(part,a),point3d(part,b),point3d(part,b,thickness),point3d(part,a,thickness)];
          add(part,[world.map(isoPoint)],fill,world,'style="filter:brightness(.78)"');
        }
      }
      const accent=part.leaves.map(leaf=>{
        const map=p=>isoPoint(point3d(part,p,thickness+.015));
        if(leaf.type==='image')return imageMarkup(part,leaf,map);
        const loops=localLoops(part,leaf);
        if(leaf.laserMode==='cut'&&loops.every(l=>l.closed!==false)&&part.item.solid)return '';
        return `<path d="${path(loops.map(l=>{const a=l.map(map);a.closed=l.closed;return a}))}" fill="${leaf.laserMode==='engrave'?safeColor(leaf.displayColor):'none'}" fill-rule="evenodd" stroke="${leaf.laserMode==='engrave'?'none':'#4b4033'}" stroke-width="${strokeWidth*.7}"/>`;
      }).join('');
      const c=point3d(part,{x:part.bounds.width/2,y:part.bounds.height/2},thickness+.02);
      faces.push({depth:c.x+c.y+c.z*1.5+.02,markup:tag(part,accent)});
    }
    faces.sort((a,b)=>a.depth-b.depth);svg=faces.map(f=>f.markup).join('');
  }
  if(selectedId){const part=parts.find(p=>p.item.id===selectedId);if(part){const b=drawingBounds([part],view);svg+=`<rect x="${b.x}" y="${b.y}" width="${Math.max(.1,b.width)}" height="${Math.max(.1,b.height)}" fill="none" stroke="#0284c7" stroke-width="${strokeWidth*2}" stroke-dasharray="${strokeWidth*8} ${strokeWidth*4}" pointer-events="none"/>`;}}
  return svg;
}
function dimensionGeometry(a,b,{kind='aligned',offset=10}={}) {
  if(!a||!b)return null;
  let u={x:b.x-a.x,y:b.y-a.y},length=Math.hypot(u.x,u.y);
  if(kind==='horizontal'){length=Math.abs(b.x-a.x);u={x:b.x>=a.x?1:-1,y:0};}
  else if(kind==='vertical'){length=Math.abs(b.y-a.y);u={x:0,y:b.y>=a.y?1:-1};}
  else if(length)u={x:u.x/length,y:u.y/length};
  if(length<.001)return null;
  const normal={x:-u.y,y:u.x};
  let p={x:a.x+normal.x*offset,y:a.y+normal.y*offset},q={x:b.x+normal.x*offset,y:b.y+normal.y*offset};
  if(kind==='horizontal')p.y=q.y=(offset<0?Math.min(a.y,b.y):Math.max(a.y,b.y))+offset;
  if(kind==='vertical')p.x=q.x=(offset<0?Math.max(a.x,b.x):Math.min(a.x,b.x))-offset;
  return {a,b,p,q,u,normal,length};
}
export function drawingAnnotatedBounds(doc,parts) {
  const b=drawingBounds(parts),points=[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y+b.height}];
  for(const d of doc.dimensions){const g=dimensionGeometry(resolveAnchor(d.a,parts),resolveAnchor(d.b,parts),d);if(g)points.push(g.p,g.q);}
  return computePolygonsBBox([points]);
}
export function renderDimension(a,b,{kind='aligned',offset=10,textSize=4,strokeWidth=.3,text=null}={}) {
  const geometry=dimensionGeometry(a,b,{kind,offset});if(!geometry)return '';
  const {p,q,u,normal,length}=geometry;
  const tick=textSize*.7;
  return `<g class="drawing-dimension" stroke="#3e596e" stroke-width="${strokeWidth}" fill="none">${line(a,p)}${line(b,q)}${line(p,q)}${[p,q].map(v=>line({x:v.x-(u.x+normal.x)*tick/2,y:v.y-(u.y+normal.y)*tick/2},{x:v.x+(u.x+normal.x)*tick/2,y:v.y+(u.y+normal.y)*tick/2})).join('')}${label((p.x+q.x)/2,(p.y+q.y)/2-textSize*.35,text??drawingNumber(length),textSize,'text-anchor="middle" fill="#243d52" stroke="white" stroke-width="'+textSize*.25+'" paint-order="stroke"')}</g>`;
}
export function renderAutoDimensions(parts,{textSize=4,strokeWidth=.3,overall=false}={}) {
  const groups=overall?[parts]:parts.map(p=>[p]);
  return groups.map(group=>{
    const b=drawingBounds(group),offset=textSize*3;
    return renderDimension({x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{kind:'horizontal',offset:-offset,textSize,strokeWidth})+renderDimension({x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.height},{kind:'vertical',offset:-offset,textSize,strokeWidth});
  }).join('');
}
export function renderManualDimensions(doc,parts,options={}) {
  return doc.dimensions.map(d=>renderDimension(resolveAnchor(d.a,parts),resolveAnchor(d.b,parts),{...d,...options})).join('');
}
const short=(s,len=64)=>String(s).length>len?String(s).slice(0,len-1)+'…':String(s);
function wrapped(text,maxChars=60,maxLines=3){
  const out=[];let line='';for(const word of String(text).split(/\s+/)){if((line+' '+word).length>maxChars&&line){out.push(line);line=''}line+=(line?' ':'')+word;}if(line)out.push(line);
  return out.slice(0,maxLines).map((v,i)=>i===maxLines-1&&out.length>maxLines?short(v,maxChars-1)+'…':short(v,maxChars));
}
export function drawingPages(doc,shapes,{details=doc.includeDetails!==false}={}) {
  const parts=drawingParts(doc,shapes);
  const pages=[{kind:'overview',title:'Oversikt'}];
  for(let i=0;i<parts.length;i+=20)pages.push({kind:'list',start:i,title:`Deleliste ${Math.floor(i/20)+1}`});
  if(details)for(const part of parts)pages.push({kind:'detail',itemId:part.item.id,title:`Detalj – ${part.item.name}`});
  return pages;
}
function fitView(parts,box,view,scaleSetting='auto',doc) {
  const b=view==='flat'?drawingAnnotatedBounds(doc,parts):drawingBounds(parts,view);
  // Reserve physical paper space for readable labels and dimension witnesses.
  const margin=view==='flat'?14:4;
  const raw=Math.min((box.width-margin*2)/Math.max(1,b.width),(box.height-margin*2)/Math.max(1,b.height));
  const standard=[10,5,2,1,.5,.2,.1,.05,.02,.01,.005,.001];
  const scale=scaleSetting==='auto'?(standard.find(s=>s<=raw)||raw):Number(scaleSetting);
  if(scaleSetting!=='auto'&&scale>raw+1e-8)throw Error('Valgt målestokk får ikke plass på arket. Velg Tilpass eller et større ark.');
  return {b,scale,tx:box.x+box.width/2-(b.x+b.width/2)*scale,ty:box.y+box.height/2-(b.y+b.height/2)*scale};
}
const scaleText=s=>s>=1?`${drawingNumber(s)}:1`:`1:${drawingNumber(1/s)}`;
export function renderDrawingSheet(doc,shapes,page={kind:'overview',title:'Oversikt'},{pageNumber=1,totalPages=1}={}) {
  const [W,H]=PAPER_SIZES[doc.paper]||PAPER_SIZES.A4,parts=drawingParts(doc,shapes),footY=H-38;
  let body='',scales=[];
  const title=page.title||'Oversikt';
  const view=(list,box,mode,requested='auto')=>{
    const f=fitView(list,box,mode,requested,doc),textSize=2.8/f.scale,strokeWidth=.22/f.scale;
    let content=renderDrawingGeometry(list,{view:mode,finish:doc.finish,strokeWidth,labels:mode==='flat',textSize});
    if(mode==='flat'){
      if(doc.autoDimensions)content+=renderAutoDimensions(list,{textSize,strokeWidth,overall:page.kind==='overview'});
      content+=renderManualDimensions(doc,list,{textSize,strokeWidth});
    }
    body+=`<g transform="translate(${n(f.tx)} ${n(f.ty)}) scale(${n(f.scale)})">${content}</g>`;
    if(mode==='flat')scales.push(scaleText(f.scale));
  };
  if(page.kind==='list'){
    const rows=parts.slice(page.start||0,(page.start||0)+20),col=[12,23,W-112,W-77,W-47];
    body+=label(12,25,'Deloversikt · mål i mm',4,'font-weight="700"');
    ['Nr.','Del','B × H','Tykkelse','Plassering Z'].forEach((v,i)=>body+=label(col[i],34,v,3,'font-weight="700"'));
    rows.forEach((part,i)=>{
      const y=42+i*5.2,b=part.bounds;
      body+=line({x:12,y:y+1.5},{x:W-12,y:y+1.5},'stroke="#d3dde5" stroke-width=".15"');
      [String((page.start||0)+i+1),short(part.item.name,doc.paper==='A3'?48:30),`${drawingNumber(b.width)} × ${drawingNumber(b.height)}`,part.item.solid?drawingNumber(part.thickness):'—',drawingNumber(part.item.z)].forEach((v,k)=>body+=label(col[k],y,v,2.8));
    });
  }else if(page.kind==='detail'){
    const part=parts.find(p=>p.item.id===page.itemId);if(!part)throw Error('Delen finnes ikke lenger i prosjektet.');
    // A detail sheet shows the same part, flattened and with its original size.
    const local={...part,item:{...part.item,x:0,y:0,rotation:0,plane:'xy',z:0}};
    view([local],{x:18,y:34,width:(W-36)*.67,height:footY-49},'flat',doc.scale);
    view([part],{x:W*.71,y:35,width:W*.24,height:(footY-40)*.55},'iso');
    const x=W*.71,y=footY*.64;
    body+=label(x,y,`Tykkelse: ${part.item.solid?drawingNumber(part.thickness):'0'} mm`,3);
    // Primitive diameters/radii remain useful beside overall dimensions.
    let row=1;for(const leaf of part.leaves){
      let text='';if(leaf.type==='ellipse'&&Math.abs(leaf.width-leaf.height)<.001)text=`Ø ${drawingNumber(leaf.width)} mm`;
      if(leaf.type==='rect'&&leaf.rx)text=`Hjørneradius R ${drawingNumber(Math.min(leaf.rx,leaf.width/2,leaf.height/2))} mm`;
      if(text&&row<=4)body+=label(x,y+row++*5,text,3);
    }
    body+=label(x,y+row*5,`${part.item.solid?'Materialdel':'Linje / gravering'}`,3);
  }else{
    if(parts.length){
      view(parts,{x:18,y:35,width:(W-40)/2,height:footY-53},'flat',doc.scale);
      view(parts,{x:W/2+10,y:35,width:(W-40)/2,height:footY-53},'iso');
    }else body+=label(W/2,H/2,'Legg til deler fra arbeidsflaten.',4,'text-anchor="middle"');
    body+=label(W*.25,27,'Delplassering (flate deler)',3.3,'text-anchor="middle" font-weight="700"');
    body+=label(W*.75,27,'Sammenstilling · materialvisning',3.3,'text-anchor="middle" font-weight="700"');
  }
  const scale=scales[0]||'—';
  const note=doc.notes||'Mål følger tegnet geometri, inkludert eventuell kerfkompensasjon. Materialvisning er en illustrasjon.';
  body+=wrapped(note,Math.floor(W/2),2).map((v,i)=>label(12,footY-6+i*3.5,v,2.5,'fill="#46586a"')).join('');
  const missing=doc.items.filter(p=>p.visible!==false).length-parts.length;
  if(missing)body+=label(12,18,`${missing} del(er) mangler eller er skjult på arbeidsflaten.`,3,'fill="#b45309"');
  const titleWidth=W*.48;
  const footer=`<rect x="10" y="${footY}" width="${W-20}" height="28" fill="none" stroke="#273c4e" stroke-width=".3"/>
    ${line({x:titleWidth,y:footY},{x:titleWidth,y:H-10},'stroke="#273c4e" stroke-width=".2"')}
    ${wrapped(doc.title,doc.paper==='A3'?62:40,2).map((v,i)=>label(13,footY+6+i*5,v,4.2,'font-weight="700"')).join('')}
    ${label(13,footY+18,short(doc.project,55),3)}${label(13,footY+24,short(doc.material,42)+' · '+drawingNumber(doc.thickness)+' mm',3)}
    ${label(titleWidth+4,footY+6,'Tegnet av: '+short(doc.author,35),3)}
    ${label(titleWidth+4,footY+12,'Dato: '+short(doc.date,16)+'   Rev.: '+short(doc.revision,12),3)}
    ${label(titleWidth+4,footY+18,'Målestokk: '+scale+' · Alle mål i mm',3)}
    ${label(titleWidth+4,footY+24,`${doc.paper} · ${short(title,36)} · Ark ${pageNumber}/${totalPages}`,3)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" role="img" aria-label="${E(doc.title+' – '+title)}"><title>${E(doc.title+' – '+title)}</title><desc>${E(doc.notes)}</desc><rect width="${W}" height="${H}" fill="white"/><g font-family="Arial, Helvetica, sans-serif" fill="#172b3a"><rect x="10" y="10" width="${W-20}" height="${H-20}" fill="none" stroke="#a4b4c2" stroke-width=".2"/>${label(12,17,short(title,80),4,'font-weight="700"')}${body}${footer}</g></svg>`;
}
export function drawingPrintHtml(doc,sheets) {
  const [w,h]=PAPER_SIZES[doc.paper]||PAPER_SIZES.A4;
  return `<!doctype html><html lang="nb"><meta charset="utf-8"><title>${E(doc.title)}</title><style>@page{size:${w}mm ${h}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:white}.sheet{width:${w}mm;height:${h}mm;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}.sheet svg{display:block;width:100%;height:100%}@media screen{body{background:#dce4ec}.sheet{margin:12px auto;box-shadow:0 2px 12px #6678}}</style>${sheets.map(svg=>`<div class="sheet">${svg}</div>`).join('')}</html>`;
}
