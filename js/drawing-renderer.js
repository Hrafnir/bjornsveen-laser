import { drawingPageKey, sheetViewBox, clampAnnotation } from './drawing-page-layout.js';
import { projectSurface, visibleSurfaceRegions, polygonBoolean } from './drawing-surfaces.js';
import { drawingMaterial, materialPattern } from './drawing-materials.js';
import { computePolygonsBBox, polygonsToSvgPath, rotatePoint } from './geometry.js';
import { PAPER_SIZES, drawingParts, drawingShapeLoops, flatPoint, point3d, isoPoint, resolveAnchor } from './drawing-model.js';

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
let renderSerial=0;
export function renderDrawingGeometry(parts,{view='flat',finish='wood',materialId=null,strokeWidth=.35,selectedId=null,labels=true,textSize=4}={}) {
  const prefix='drawing-'+(++renderSerial);
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
    const faces=[],decorations=[];let defs='';
    for(const [partIndex,part] of parts.entries()){
      const solids=polygonBoolean(solidLoops(part),[],'union'),thickness=part.item.solid?part.thickness:0;
      const material=drawingMaterial(part,{finish,materialId}),faceId=prefix+'-face-'+partIndex,edgeId=prefix+'-edge-'+partIndex;
      defs+=materialPattern(material,faceId)+materialPattern(material,edgeId,true);
      const make=(world,edges,side=false,capDepth=null)=>projectSurface(world,{part,edges,side,capDepth,fill:`url(#${side?edgeId:faceId})`});
      if(part.item.solid&&solids.length){
        const origin=point3d(part,{x:0,y:0}),normal=point3d(part,{x:0,y:0},1);
        const facing=normal.x+normal.y+normal.z-origin.x-origin.y-origin.z;
        for(const t of [thickness>0&&facing>0?thickness:0]){
          const world=solids.map(l=>l.map(p=>point3d(part,p,t)));
          faces.push(make(world,world.map(l=>[...l,l[0]]),false,t));
        }
        if(thickness>0)for(const loop of solids)for(let i=0;i<loop.length;i++){
          const a=loop[i],b=loop[(i+1)%loop.length],prev=loop[(i+loop.length-1)%loop.length];
          const world=[point3d(part,a),point3d(part,b),point3d(part,b,thickness),point3d(part,a,thickness)];
          // Clipper orients outer contours and holes oppositely; the right
          // normal therefore points out of the material for both kinds.
          const outward=point3d(part,{x:a.x+b.y-a.y,y:a.y-(b.x-a.x)});
          if(outward.x+outward.y+outward.z-world[0].x-world[0].y-world[0].z<=1e-8)continue;
          const edges=[[world[0],world[1]],[world[3],world[2]]];
          const ux=a.x-prev.x,uy=a.y-prev.y,vx=b.x-a.x,vy=b.y-a.y;
          // Smooth tessellated curves have no physical vertical seams.
          const cosine=(ux*vx+uy*vy)/Math.max(1e-12,Math.hypot(ux,uy)*Math.hypot(vx,vy));
          if(cosine<Math.cos(Math.PI/9))edges.push([world[0],world[3]]);
          faces.push(make([world],edges,true));
        }
      }else{
        const map=p=>isoPoint(point3d(part,p));
        const markup=part.leaves.map(leaf=>leaf.type==='image'?imageMarkup(part,leaf,map):`<path d="${path(localLoops(part,leaf).map(l=>{const a=l.map(map);a.closed=l.closed;return a}))}" fill="${leaf.laserMode==='engrave'?safeColor(leaf.displayColor):'none'}" fill-rule="evenodd" stroke="#42566c" stroke-width="${strokeWidth}"/>`).join('');
        // Non-solid artwork still belongs to a plane and must not show through solids.
        const b=part.bounds,quad=[{x:-.1,y:-.1},{x:b.width+.1,y:-.1},{x:b.width+.1,y:b.height+.1},{x:-.1,y:b.height+.1}];
        const surface=projectSurface([quad.map(p=>point3d(part,p))],{part,markup,decoration:true});
        if(surface)decorations.push(surface);
      }
    }
    const all=faces.filter(Boolean);
    const visible=visibleSurfaceRegions([...all,...decorations.map(d=>({...d,nonOccluding:true}))]);
    for(const [index,face] of visible.entries()){
      const clipId=prefix+'-visible-'+index,region=path(face.visible);
      defs+=`<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><path d="${region}" clip-rule="evenodd"/></clipPath>`;
      let content=face.decoration?face.markup:`<path d="${region}" fill="${face.fill}" fill-rule="evenodd" data-material-face="${face.side?'edge':'cap'}"/>`;
      if(!face.decoration){
        const edges=face.edges.map(l=>{const a=l.map(isoPoint);a.closed=false;return a});
        content+=`<path d="${path(edges)}" fill="none" stroke="#3f382f" stroke-opacity=".55" stroke-width="${strokeWidth*.65}"/>`;
        if(face.capDepth===face.part.thickness||face.part.thickness===0){
          const map=p=>isoPoint(point3d(face.part,p,face.capDepth));
          content+=face.part.leaves.map(leaf=>{
            if(leaf.type==='image')return imageMarkup(face.part,leaf,map);
            const loops=localLoops(face.part,leaf);if(leaf.laserMode==='cut'&&loops.every(l=>l.closed!==false))return '';
            return `<path d="${path(loops.map(l=>{const a=l.map(map);a.closed=l.closed;return a}))}" fill="${leaf.laserMode==='engrave'?safeColor(leaf.displayColor):'none'}" fill-rule="evenodd" stroke="${leaf.laserMode==='engrave'?'none':'#4b4033'}" stroke-width="${strokeWidth*.7}"/>`;
          }).join('');
        }
      }
      svg+=tag(face.part,`<g clip-path="url(#${clipId})">${content}</g>`);
    }
    svg=`<defs>${defs}</defs>`+svg;
  }
  if(selectedId){const part=parts.find(p=>p.item.id===selectedId);if(part){const b=drawingBounds([part],view);svg+=`<rect x="${b.x}" y="${b.y}" width="${Math.max(.1,b.width)}" height="${Math.max(.1,b.height)}" fill="none" stroke="#0284c7" stroke-width="${strokeWidth*2}" stroke-dasharray="${strokeWidth*8} ${strokeWidth*4}" pointer-events="none"/>`;}}
  return svg;
}
export function dimensionGeometry(a,b,{kind='aligned',offset=10}={}) {
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
export function renderDimension(a,b,{kind='aligned',offset=10,textSize=4,strokeWidth=.3,text=null,id=null,labelText=''}={}) {
  const geometry=dimensionGeometry(a,b,{kind,offset});if(!geometry)return '';
  const {p,q,u,normal,length}=geometry;
  const tick=textSize*.7;
  const extension=v=>{const source=v===p?a:b,dx=v.x-source.x,dy=v.y-source.y,len=Math.hypot(dx,dy);if(len<.001)return '';const gap=Math.min(textSize*.4,len*.2),over=textSize*.45;return line({x:source.x+dx/len*gap,y:source.y+dy/len*gap},{x:v.x+dx/len*over,y:v.y+dy/len*over});};
  const middle={x:(p.x+q.x)/2,y:(p.y+q.y)/2},angle=Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI,readable=angle>90||angle<-90?angle+180:angle;
  const caption=(labelText?labelText+' · ':'')+(text??drawingNumber(length));
  return `<g class="drawing-dimension" ${id?`data-dimension-id="${E(id)}"`:''} stroke="#3e596e" stroke-width="${strokeWidth}" fill="none">${extension(p)}${extension(q)}${line(p,q)}${[p,q].map(v=>line({x:v.x-(u.x+normal.x)*tick/2,y:v.y-(u.y+normal.y)*tick/2},{x:v.x+(u.x+normal.x)*tick/2,y:v.y+(u.y+normal.y)*tick/2})).join('')}${label(middle.x,middle.y-textSize*.6,caption,textSize,`transform="rotate(${n(readable)} ${n(middle.x)} ${n(middle.y)})" text-anchor="middle" fill="#243d52" stroke="white" stroke-width="${textSize*.3}" paint-order="stroke"`)}${id?line(p,q,`stroke="transparent" stroke-width="${textSize*2}" pointer-events="stroke"`):''}</g>`;
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
  const pages=[...(doc.onePager?[{kind:'onepager',title:'Prosjektark'}]:[]),{kind:'overview',title:'Oversikt'}];
  for(let i=0;i<parts.length;i+=20)pages.push({kind:'list',start:i,title:`Deleliste ${Math.floor(i/20)+1}`});
  const noteLines=documentNoteLines(doc);const perPage=Math.floor(((PAPER_SIZES[doc.paper]||PAPER_SIZES.A4)[1]-78)/4.5);
  if(doc.notes?.length>180||doc.notes?.includes('\n'))for(let start=0;start<noteLines.length;start+=perPage)pages.push({kind:'notes',start,count:perPage,title:'Prosjektnotater '+(Math.floor(start/perPage)+1)});
  if(details)for(const part of parts)pages.push({kind:'detail',itemId:part.item.id,title:`Detalj – ${part.item.name}`});
  for(const p of doc.customPages||[])pages.push({kind:'custom',id:p.id,title:p.title});
  return pages;
}
function fitView(parts,box,view,scaleSetting='auto',doc) {
  const b=view==='flat'?drawingAnnotatedBounds(doc,parts):drawingBounds(parts,view);
  // Reserve physical paper space for readable labels and dimension witnesses.
  const margin=view==='flat'?14:8;
  const raw=Math.min((box.width-margin*2)/Math.max(1,b.width),(box.height-margin*2)/Math.max(1,b.height));
  const standard=[10,5,2,1,.5,.2,.1,.05,.02,.01,.005,.001];
  const scale=scaleSetting==='auto'?(standard.find(s=>s<=raw)||raw):Number(scaleSetting);
  if(scaleSetting!=='auto'&&scale>raw+1e-8)throw Error('Valgt målestokk får ikke plass på arket. Velg Tilpass eller et større ark.');
  return {b,scale,tx:box.x+box.width/2-(b.x+b.width/2)*scale,ty:box.y+box.height/2-(b.y+b.height/2)*scale};
}
const scaleText=s=>s>=1?`${drawingNumber(s)}:1`:`1:${drawingNumber(1/s)}`;
export function renderDrawingSheet(doc,shapes,page={kind:'overview',title:'Oversikt'},{pageNumber=1,totalPages=1,editing=false,selectedAnnotation=null,selectedView=null,frozenViews=null}={}) {
  const [W,H]=PAPER_SIZES[doc.paper]||PAPER_SIZES.A4,parts=drawingParts(doc,shapes),footY=H-38;
  let body='',scales=[];
  const title=page.title||'Oversikt';
  const view=(list,defaultBox,mode,requested='auto')=>{
    const box=sheetViewBox(doc,page,mode)||defaultBox;if(!box.visible)return;
    const f=frozenViews?.[mode]||fitView(list,box,mode,requested,doc),textSize=2.8/f.scale,strokeWidth=.22/f.scale;
    let content=renderDrawingGeometry(list,{view:mode,finish:doc.finish,materialId:doc.materialId,strokeWidth,labels:mode==='flat',textSize});
    if(mode==='flat'){
      if(doc.autoDimensions)content+=renderAutoDimensions(list,{textSize,strokeWidth,overall:!['detail','onepager'].includes(page.kind)});
      content+=renderManualDimensions(doc,list,{textSize,strokeWidth});
    }
    body+=`<g data-sheet-view="${mode}">${label(box.x+box.width/2,box.y+3,mode==='flat'?'Måltegning':'Materialvisning',3,'text-anchor="middle" font-weight="700"')}<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="transparent" ${editing?`stroke="${selectedView===mode?'#0284c7':'#c3ced8'}" stroke-width=".3" stroke-dasharray="2 1"`:'stroke="none"'}/><g data-view-transform="${mode}" transform="translate(${n(f.tx)} ${n(f.ty)}) scale(${n(f.scale)})">${content}</g></g>`;
    if(mode==='flat')scales.push(scaleText(f.scale));
  };
  if(page.kind==='notes'){
    body+=documentNoteLines(doc).slice(page.start,page.start+page.count).map((text,i)=>label(15,30+i*4.5,text,3)).join('');
  }else if(page.kind==='list'){
    const rows=parts.slice(page.start||0,(page.start||0)+20),col=[12,23,W*.34,W*.60,W*.76,W*.87];
    body+=label(12,25,'Deloversikt · mål i mm',4,'font-weight="700"');
    ['Nr.','Del','Materiale','B × H','Tykkelse','Z'].forEach((v,i)=>body+=label(col[i],34,v,3,'font-weight="700"'));
    rows.forEach((part,i)=>{
      const y=42+i*5.2,b=part.bounds;
      body+=line({x:12,y:y+1.5},{x:W-12,y:y+1.5},'stroke="#d3dde5" stroke-width=".15"');
      [String((page.start||0)+i+1),short(part.item.name,doc.paper==='A3'?42:26),short(materialName(part,doc),doc.paper==='A3'?40:28),`${drawingNumber(b.width)} × ${drawingNumber(b.height)}`,part.item.solid?drawingNumber(part.thickness):'—',drawingNumber(part.item.z)].forEach((v,k)=>body+=label(col[k],y,v,2.8));
    });
  }else if(page.kind==='detail'){
    const part=parts.find(p=>p.item.id===page.itemId);if(!part)throw Error('Delen finnes ikke lenger i prosjektet.');
    // A detail sheet shows the same part, flattened and with its original size.
    const local={...part,item:{...part.item,x:0,y:0,rotation:0,plane:'xy',z:0}};
    view([local],{x:18,y:34,width:(W-36)*.67,height:footY-49},'flat',doc.scale);
    view([part],{x:W*.71,y:35,width:W*.24,height:(footY-40)*.55},'iso');
    const x=W*.71,y=footY*.64;
    body+=label(x,y-5,short(materialName(part,doc),25),3);
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

  }
  body+=renderSheetAnnotations(doc,page,{editing,selectedAnnotation});
  const scale=scales[0]||'—';
  const note=page.kind==='onepager'?'Mål i mm. Materialvisningen viser platetykkelse og sammenstilling.':(doc.notes?.length>180||doc.notes?.includes('\n')?'Se egne sider med prosjektnotater.':doc.notes)||'Mål følger tegnet geometri, inkludert eventuell kerfkompensasjon. Materialvisning er en illustrasjon.';
  body+=wrapped(note,Math.floor(W/2),2).map((v,i)=>label(12,footY-6+i*3.5,v,2.5,'fill="#46586a"')).join('');
  const missing=doc.items.filter(p=>p.visible!==false).length-parts.length;
  if(missing)body+=label(12,18,`${missing} del(er) mangler eller er skjult på arbeidsflaten.`,3,'fill="#b45309"');
  const titleWidth=W*.48;
  const detailPart=page.kind==='detail'?parts.find(p=>p.item.id===page.itemId):null;
  const mixed=new Set(parts.filter(p=>p.item.solid).map(p=>materialName(p,doc)+'/'+p.thickness)).size>1;
  const materialCaption=detailPart?short(materialName(detailPart,doc),42)+' · '+drawingNumber(detailPart.thickness)+' mm':mixed?'Flere materialer / tykkelser · se deleliste':short(doc.material,42)+' · '+drawingNumber(doc.thickness)+' mm';
  const footer=`<rect x="10" y="${footY}" width="${W-20}" height="28" fill="none" stroke="#273c4e" stroke-width=".3"/>
    ${line({x:titleWidth,y:footY},{x:titleWidth,y:H-10},'stroke="#273c4e" stroke-width=".2"')}
    ${wrapped(doc.title,doc.paper==='A3'?62:40,2).map((v,i)=>label(13,footY+6+i*5,v,4.2,'font-weight="700"')).join('')}
    ${label(13,footY+18,short(doc.project,55),3)}${label(13,footY+24,materialCaption,3)}
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

export function renderSheetAnnotations(doc,page,{editing=false,selectedAnnotation=null}={}) {
 const key=drawingPageKey(page),[w,h]=PAPER_SIZES[doc.paper]||PAPER_SIZES.A4;
 return (doc.annotations||[]).filter(a=>a.page===key).map(raw=>{
  const a=clampAnnotation(doc,{...raw}),size=a.fontSize,pad=2;
  const maxChars=Math.max(8,Math.floor((a.width-pad*2)/(size*.58))),rows=[];
  for(const paragraph of (a.text|| (editing?'Dobbeltklikk for å skrive …':'')).split('\n')){
    let row='';for(const word of paragraph.split(/\s+/)){for(let start=0;start<word.length;start+=maxChars){const token=word.slice(start,start+maxChars);if((row+' '+token).trim().length>maxChars&&row){rows.push(row);row=''}row+=(row?' ':'')+token;}}rows.push(row);
  }
  const maxRows=Math.max(1,Math.floor((h-42-a.y-pad*2)/(size*1.35))),shown=rows.slice(0,maxRows),overflow=rows.length>maxRows;
  if(overflow&&!editing)throw Error('Notatet «'+a.text.slice(0,35)+'» får ikke plass på arket. Flytt det opp, øk bredden eller del teksten.');
  if(overflow)shown[shown.length-1]='…';
  const height=shown.length*size*1.35+pad*2,id=E(a.id);
  return `<g data-annotation-id="${id}" ${overflow?'data-text-overflow="true"':''}>${a.kind==='callout'?line({x:a.x+a.width/2,y:a.y+height/2},{x:a.targetX,y:a.targetY},'stroke="#42566c" stroke-width=".3"')+`<circle cx="${a.targetX}" cy="${a.targetY}" r=".8" fill="#42566c"/>`:''}<rect x="${a.x}" y="${a.y}" width="${a.width}" height="${height}" rx="1" fill="white" fill-opacity=".96" stroke="${editing&&selectedAnnotation===a.id?'#0284c7':'#c0cad3'}" stroke-width=".3"/>${shown.map((v,i)=>label(a.x+pad,a.y+pad+size+i*size*1.35,v,size,'fill="#243d52"')).join('')}</g>`;
 }).join('');
}

function documentNoteLines(doc){
 const [w]=PAPER_SIZES[doc.paper]||PAPER_SIZES.A4,limit=Math.floor((w-30)/1.8),lines=[];
 for(const paragraph of (doc.notes||'').split('\n')){let row='';for(const word of paragraph.split(/\s+/)){for(let start=0;start<word.length;start+=limit){const token=word.slice(start,start+limit);if((row+' '+token).trim().length>limit&&row){lines.push(row);row='';}row+=(row?' ':'')+token;}}lines.push(row);}
 return lines;
}

function materialName(part,doc){return part.item.materialId?drawingMaterial(part,doc).name:doc.material||drawingMaterial(part,doc).name;}
