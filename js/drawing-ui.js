import { packPartBounds } from './part-layout.js';
import { uid, evalMathExpr } from './geometry.js';
import { normalizeDrawingDocument, drawingParts, drawingSourceMap, newDrawingItem, syncDrawingSources, splitDrawingGroup, partSnapPoints, dimensionAnchor, dimensionValue, createDrawingDocument } from './drawing-model.js';
import { drawingBounds, drawingAnnotatedBounds, renderDrawingGeometry, renderAutoDimensions, renderManualDimensions, renderDrawingSheet, drawingPages, drawingPrintHtml, escapeDrawingText as E, drawingNumber } from './drawing-renderer.js';

const copy=value=>structuredClone(value);
export function openDrawingWorkshop({shapes,document:stored,settings,materialName,onChange=()=>{},onSaveProject}={}) {
  let root=document.getElementById('drawing-modal');
  if(root)root.remove();
  root=document.createElement('div');root.id='drawing-modal';root.className='modal-backdrop open drawing-modal';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Arbeidstegning');
  document.body.append(root);
  let doc=normalizeDrawingDocument(stored,shapes,settings,materialName),selectedId=doc.items[0]?.id||null,view='flat',measure=false,pendingPoint=null,drag=null,viewBox=null,pageIndex=0;
  const undo=[],redo=[];
  const field=(id,label,type='text')=>`<label class="drawing-field">${label}<input id="dw-${id}" class="input-control" type="${type}"/></label>`;
  root.innerHTML=`<section class="modal-window drawing-window">
    <header class="drawing-header"><div><h2>Arbeidstegning</h2><span>Dokumentasjon og sammenstilling i millimeter</span></div><div class="drawing-actions"><button id="dw-undo" class="btn" title="Angre i arbeidstegningen (⌘Z)">↶</button><button id="dw-redo" class="btn" title="Gjør om i arbeidstegningen (⇧⌘Z)">↷</button><button id="dw-save" class="btn">Lagre prosjekt</button><button id="dw-close" class="btn" aria-label="Lukk arbeidstegning">Lukk</button></div></header>
    <div class="drawing-body"><aside class="drawing-settings">
      <details open><summary>Tegning og materiale</summary>
        ${field('title','Tittel')}${field('project','Prosjekt / oppgave')}
        <div class="drawing-grid">${field('author','Tegnet av')}${field('revision','Revisjon')}${field('date','Dato','date')}
          <label class="drawing-field">Ark<select id="dw-paper" class="select-control"><option>A4</option><option>A3</option></select></label></div>
        ${field('material','Materiale')}<div class="drawing-grid">${field('thickness','Tykkelse (mm)','number')}
          <label class="drawing-field">Utseende<select id="dw-finish" class="select-control"><option value="wood">Tre</option><option value="mdf">MDF</option><option value="acrylic">Akryl</option><option value="metal">Metall</option><option value="white">Hvit</option></select></label></div>
        <button id="dw-use-material" class="btn">Bruk valgt laser-materiale</button>
        <label class="drawing-field">Merknader<textarea id="dw-notes" class="input-control" rows="3"></textarea></label>
      </details>
      <details open><summary>Deler i tegningen</summary><div class="drawing-grid"><button id="dw-sync" class="btn">Hent nye deler</button><button id="dw-reset" class="btn">Fra kutteoppsettet</button></div><button id="dw-spread" class="btn">Spre delene for målsetting</button><div id="dw-parts" class="drawing-part-list" aria-label="Deler i arbeidstegningen"></div></details>
      <details open><summary>Valgt del</summary><p id="dw-placement-label" class="drawing-help"></p>${field('name','Delnavn')}
        <div class="drawing-grid">${field('x','X (mm)','number')}${field('y','Y (mm)','number')}${field('z','Høyde Z (mm)','number')}${field('rotation','Rotasjon (°)','number')}</div>
        <label class="drawing-field">Orientering i materialvisning<select id="dw-plane" class="select-control"><option value="xy">Liggende (XY)</option><option value="xz">Stående (XZ)</option><option value="yz">Stående (YZ)</option></select></label>
        <div class="drawing-grid"><button id="dw-rotate" class="btn">Roter 90°</button><button id="dw-stack" class="btn">Opp én tykkelse</button></div>
        <label class="drawing-check"><input type="checkbox" id="dw-solid"/> Vis som materialdel med tykkelse</label>
        <label class="drawing-field">Egen tykkelse (tom = felles)<input id="dw-item-thickness" class="input-control" type="number" min="0" max="100" step="0.1"/></label>
        <div class="drawing-grid"><button id="dw-duplicate" class="btn">Dupliser i tegningen</button><button id="dw-split" class="btn">Del opp gruppe</button></div>
        <button id="dw-remove" class="btn">Fjern fra tegningen</button>
      </details>
      <details><summary>Mål og eksport</summary>
        <label class="drawing-check"><input id="dw-auto-dimensions" type="checkbox"/> Vis automatiske hovedmål</label>
        <label class="drawing-field">Nytt mål<select id="dw-dimension-kind" class="select-control"><option value="aligned">Avstand mellom punkter</option><option value="horizontal">Vannrett</option><option value="vertical">Loddrett</option></select></label>
        ${field('dimension-offset','Avstand fra delen (mm)','number')}
        <div id="dw-dimensions" class="drawing-dimension-list"></div>
        <label class="drawing-field">Målestokk på måltegninger<select id="dw-scale" class="select-control"><option value="auto">Tilpass til arket</option><option value="0.1">1:10</option><option value="0.2">1:5</option><option value="0.5">1:2</option><option value="1">1:1</option><option value="2">2:1</option><option value="5">5:1</option></select></label>
        <label class="drawing-check"><input id="dw-details" type="checkbox" checked/> Ta med detaljark for hver del</label>
      </details>
      <p class="drawing-help">Flytting her endrer dokumentasjonen. Delplassering og materialvisning har egne X/Y-posisjoner og rotasjon. Z og orientering brukes i sammenstillingen. Materialvisningen illustrerer platetykkelse, men bøyer ikke flex automatisk.</p>
    </aside><main class="drawing-main">
      <nav class="drawing-toolbar" aria-label="Tegningsvisning"><div class="drawing-actions"><button data-drawing-view="flat" class="btn active">Delplassering</button><button data-drawing-view="iso" class="btn">Materialvisning</button><button data-drawing-view="sheet" class="btn">Ark / dokumentasjon</button></div><div class="drawing-actions"><button id="dw-measure" class="btn">＋ Målsett</button><button id="dw-fit" class="btn">Tilpass</button><label class="drawing-check"><input id="dw-snap" type="checkbox" checked/> Fest 1 mm</label></div></nav>
      <div id="dw-page-bar" class="drawing-page-bar" hidden><label>Ark <select id="dw-page" class="select-control"></select></label></div>
      <div id="dw-status" class="drawing-status" role="status"></div>
      <div id="dw-canvas" class="drawing-canvas" tabindex="0" aria-label="Arbeidstegning, dra deler eller klikk to punkter for å målsette"></div>
      <div id="dw-error" class="box-error" role="alert" hidden></div>
      <footer class="drawing-footer"><span id="dw-info"></span><div class="drawing-actions"><button id="dw-export-svg" class="btn">Last ned ark som SVG</button><button id="dw-print" class="btn btn-primary">PDF / utskrift</button></div></footer>
    </main></div></section>`;
  const $=id=>root.querySelector('#dw-'+id),host=$('canvas');
  for(const key of ['title','project','author','revision','date','notes','material','paper','thickness','finish','scale'])$(key).value=doc[key];
  $('details').checked=doc.includeDetails!==false;$('auto-dimensions').checked=doc.autoDimensions;$('dimension-offset').value=10;
  const parts=()=>drawingParts(doc,shapes),selected=()=>doc.items.find(p=>p.id===selectedId);
  const placementKey=key=>view==='iso'?({x:'assemblyX',y:'assemblyY',rotation:'assemblyRotation'}[key]||key):key;
  const notify=()=>onChange(copy(doc));
  function checkpoint(){undo.push(JSON.stringify(doc));if(undo.length>80)undo.shift();redo.length=0;}
  function change(fn,{fit=false}={}){checkpoint();fn();if(fit)viewBox=null;notify();render();}
  function error(message){$('error').textContent=message;$('error').hidden=!message;}
  function editHistory(direction){
    const from=direction==='undo'?undo:redo,to=direction==='undo'?redo:undo;if(!from.length)return;
    to.push(JSON.stringify(doc));doc=JSON.parse(from.pop());viewBox=null;pendingPoint=null;notify();
    for(const key of ['title','project','author','revision','date','notes','material','paper','thickness','finish','scale'])$(key).value=doc[key];
    $('details').checked=doc.includeDetails!==false;$('auto-dimensions').checked=doc.autoDimensions;render();
  }
  function pages(){return drawingPages(doc,shapes,{details:$('details').checked});}
  function sheet(index=pageIndex){const list=pages();return renderDrawingSheet(doc,shapes,list[Math.min(index,list.length-1)],{pageNumber:Math.min(index,list.length-1)+1,totalPages:list.length});}
  function render(){
    const all=parts(),item=selected(),source=drawingSourceMap(shapes).get(item?.sourceId);
    $('undo').disabled=!undo.length;$('redo').disabled=!redo.length;
    $('parts').innerHTML=doc.items.map((p,i)=>`<div class="drawing-part-row"><input type="checkbox" data-visible="${E(p.id)}" aria-label="Vis ${E(p.name)}" ${p.visible!==false?'checked':''}/><button class="btn ${p.id===selectedId?'active':''}" data-select-part="${E(p.id)}" aria-pressed="${p.id===selectedId}">${i+1}. ${E(p.name)}${drawingSourceMap(shapes).has(p.sourceId)?'':' (mangler)'}</button></div>`).join('');
    for(const key of ['name','x','y','z','rotation','plane']){$(key).disabled=!item;if(document.activeElement!==$(key))$(key).value=item?.[placementKey(key)]??'';}
    $('placement-label').textContent=view==='iso'?'X/Y og rotasjon endrer sammenstillingen.':'X/Y og rotasjon endrer den flate måltegningen.';
    $('solid').disabled=!item;$('solid').checked=Boolean(item?.solid);$('item-thickness').disabled=!item;if(document.activeElement!==$('item-thickness'))$('item-thickness').value=item?.thickness??'';
    for(const id of ['rotate','stack','duplicate','remove'])$(id).disabled=!item;
    $('split').disabled=source?.type!=='group'||Boolean(source.puzzleMeta)||Boolean(source.children?.length&&source.children.every(c=>c.boxPart&&c.boxPart.id===source.children[0].boxPart?.id));
    $('dimensions').innerHTML=doc.dimensions.map(d=>{const value=dimensionValue(d,all);return `<div class="drawing-part-row"><span>${value==null?'Mangler del':drawingNumber(value)+' mm'}</span><button class="btn" data-remove-dimension="${E(d.id)}" aria-label="Fjern mål">×</button></div>`}).join('');
    $('page-bar').hidden=view!=='sheet';$('measure').disabled=view!=='flat';$('measure').classList.toggle('active',measure);$('fit').disabled=view==='sheet';
    root.querySelectorAll('[data-drawing-view]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.drawingView===view);btn.setAttribute('aria-pressed',String(btn.dataset.drawingView===view));});
    const missing=doc.items.filter(p=>p.visible!==false).length-all.length;
    $('status').textContent=measure?(pendingPoint?'Klikk målpunkt nummer to. Esc avbryter.':'Klikk to punkter på delene. Punkter og hjørner fester seg automatisk.'):missing?`${missing} del(er) mangler eller er skjult på arbeidsflaten.`:view==='iso'?'Dra for å flytte i X/Y. Endre Z og orientering for å sette delene sammen.':view==='flat'?'Dra deler i måltegningen. Piltaster flytter 1 mm, Shift + pil flytter 10 mm.':'Måltegninger og deleliste følger med i PDF-utskriften. SVG laster ned arket du ser.';
    error('');
    try{
      if(view==='sheet'){
        const list=pages();pageIndex=Math.min(pageIndex,list.length-1);$('page').innerHTML=list.map((p,i)=>`<option value="${i}">${E(p.title)}</option>`).join('');$('page').value=pageIndex;
        host.innerHTML=sheet();host.classList.add('paper-view');
      }else{
        host.classList.remove('paper-view');
        if(!viewBox){const b=view==='flat'?drawingAnnotatedBounds(doc,all):drawingBounds(all,view),pad=Math.max(20,Math.max(b.width,b.height)*.18);viewBox={x:b.x-pad,y:b.y-pad,width:Math.max(80,b.width+pad*2),height:Math.max(60,b.height+pad*2)};}
        const size=Math.max(viewBox.width,viewBox.height)/120,stroke=size*.07;
        let content=renderDrawingGeometry(all,{view,finish:doc.finish,selectedId,strokeWidth:stroke,textSize:size,labels:view==='flat'});
        if(view==='flat'){
          if(doc.autoDimensions)content+=renderAutoDimensions(all,{textSize:size,strokeWidth:stroke});
          content+=renderManualDimensions(doc,all,{textSize:size,strokeWidth:stroke});
          if(pendingPoint)content+=`<circle cx="${pendingPoint.point.x}" cy="${pendingPoint.point.y}" r="${size*.6}" fill="#0284c7" pointer-events="none"/>`;
        }
        host.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" aria-label="${view==='iso'?'Materialvisning':'Delplassering'}"><g font-family="Arial, sans-serif">${content}</g></svg>`;
      }
      $('export-svg').disabled=false;$('print').disabled=false;
    }catch(e){error(e.message);host.replaceChildren();$('export-svg').disabled=true;$('print').disabled=true;}
    const b=drawingBounds(all);$('info').textContent=`${all.length} deler · ${drawingNumber(b.width)} × ${drawingNumber(b.height)} mm · ${pages().length} ark`;
  }
  for(const key of ['title','project','author','revision','date','notes','material','paper','thickness','finish','scale']){
    $(key).addEventListener('change',()=>{
      let value=$(key).value;
      if(key==='thickness'){value=Number(value);if(!Number.isFinite(value)||value<0||value>100){error('Materialtykkelsen må være mellom 0 og 100 mm.');return;}}
      change(()=>doc[key]=typeof value==='string'?value.slice(0,key==='notes'?3000:180):value);
    });
  }
  for(const key of ['name','x','y','z','rotation','plane'])$(key).addEventListener('change',()=>{
    if(!selected())return;let value=$(key).value;
    if(!['name','plane'].includes(key)){value=evalMathExpr(value,NaN);if(!Number.isFinite(value)||Math.abs(value)>100000){error('Skriv et gyldig mål mellom −100000 og 100000.');return;}}
    change(()=>selected()[placementKey(key)]=typeof value==='string'?value.slice(0,180):value);
  });
  $('solid').addEventListener('change',()=>{if(selected())change(()=>selected().solid=$('solid').checked)});
  $('item-thickness').addEventListener('change',()=>{
    const value=$('item-thickness').value.trim()===''?null:Number($('item-thickness').value);
    if(value!==null&&(!Number.isFinite(value)||value<0||value>100)){error('Tykkelsen må være mellom 0 og 100 mm.');return;}if(selected())change(()=>selected().thickness=value);
  });
  $('auto-dimensions').addEventListener('change',()=>change(()=>doc.autoDimensions=$('auto-dimensions').checked));
  $('details').addEventListener('change',()=>change(()=>doc.includeDetails=$('details').checked));$('page').addEventListener('change',()=>{pageIndex=Number($('page').value);render()});
  $('use-material').addEventListener('click',()=>change(()=>{doc.material=materialName||'Materiale';doc.thickness=Number(settings.thicknessMm)||0;doc.finish=createDrawingDocument([],settings,materialName).finish;$('finish').value=doc.finish;$('material').value=doc.material;$('thickness').value=doc.thickness;}));
  $('parts').addEventListener('click',e=>{const btn=e.target.closest('[data-select-part]');if(btn){selectedId=btn.dataset.selectPart;render()}});
  $('parts').addEventListener('change',e=>{const id=e.target.dataset.visible;if(id)change(()=>doc.items.find(p=>p.id===id).visible=e.target.checked,{fit:true})});
  $('dimensions').addEventListener('click',e=>{const btn=e.target.closest('[data-remove-dimension]');if(btn)change(()=>doc.dimensions=doc.dimensions.filter(d=>d.id!==btn.dataset.removeDimension))});
  $('sync').addEventListener('click',()=>change(()=>syncDrawingSources(doc,shapes),{fit:true}));
  $('reset').addEventListener('click',()=>change(()=>{doc.items=shapes.filter(s=>!s.hidden&&drawingParts({items:[newDrawingItem(s)],thickness:doc.thickness},[s]).length).map(newDrawingItem);doc.dimensions=[];selectedId=doc.items[0]?.id;},{fit:true}));
  $('spread').addEventListener('click',()=>change(()=>{
    const list=parts(),bounds=list.map(p=>drawingBounds([p])),gap=Math.max(30,Math.max(1,...bounds.map(b=>Math.max(b.width,b.height)))*.2);
    const positions=packPartBounds(bounds,gap);
    list.forEach((p,i)=>{p.item.x+=positions[i].x-bounds[i].x;p.item.y+=positions[i].y-bounds[i].y;});
  },{fit:true}));
  $('rotate').addEventListener('click',()=>{if(selected())change(()=>selected()[placementKey('rotation')]=(selected()[placementKey('rotation')]+90)%360)});
  $('stack').addEventListener('click',()=>{if(selected())change(()=>selected().z+=selected().thickness??doc.thickness)});
  $('duplicate').addEventListener('click',()=>{if(selected())change(()=>{const p={...copy(selected()),id:uid('drawing-part'),x:selected().x+10,y:selected().y+10,assemblyX:selected().assemblyX+10,assemblyY:selected().assemblyY+10};doc.items.push(p);selectedId=p.id})});
  $('remove').addEventListener('click',()=>{if(selected())change(()=>{doc.items=doc.items.filter(p=>p.id!==selectedId);doc.dimensions=doc.dimensions.filter(d=>d.a.itemId!==selectedId&&d.b.itemId!==selectedId);selectedId=doc.items[0]?.id})});
  $('split').addEventListener('click',()=>{try{if(selected())change(()=>{splitDrawingGroup(doc,selected(),shapes);selectedId=doc.items[0]?.id})}catch(e){error(e.message)}});
  $('undo').addEventListener('click',()=>editHistory('undo'));$('redo').addEventListener('click',()=>editHistory('redo'));
  const close=()=>{document.activeElement?.blur();root.classList.remove('open');document.getElementById('btn-work-drawing')?.focus();};
  $('close').addEventListener('click',close);$('save').addEventListener('click',()=>{document.activeElement?.blur();notify();onSaveProject?.()});
  root.querySelectorAll('[data-drawing-view]').forEach(btn=>btn.addEventListener('click',()=>{view=btn.dataset.drawingView;viewBox=null;measure=false;pendingPoint=null;render()}));
  $('fit').addEventListener('click',()=>{viewBox=null;render()});
  $('measure').addEventListener('click',()=>{measure=!measure;pendingPoint=null;render()});
  const point=e=>{const svg=host.querySelector('svg'),matrix=svg?.getScreenCTM();if(!matrix)return null;const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(matrix.inverse())};
  const anchorAt=(p,target)=>{
    const all=parts(),radius=(viewBox?.width||100)/Math.max(1,host.clientWidth)*12;
    let best;
    for(const part of all)for(const candidate of partSnapPoints(part)){const distance=Math.hypot(candidate.x-p.x,candidate.y-p.y);if(distance<=radius&&(!best||distance<best.distance))best={part,point:candidate,distance};}
    if(best)return best;
    const id=target.closest('[data-drawing-item]')?.dataset.drawingItem,part=all.find(v=>v.item.id===id);
    return part?{part,point:p}:null;
  };
  host.addEventListener('pointerdown',e=>{
    if(view==='sheet'||e.button!==0)return;const p=point(e);if(!p)return;host.focus();
    if(measure){
      const picked=anchorAt(p,e.target);if(!picked){error('Klikk på en del eller nær et hjørne.');return;}
      if(!pendingPoint){pendingPoint={point:picked.point,ref:dimensionAnchor(picked.part,picked.point)};render();return;}
      const d={id:uid('dimension'),a:pendingPoint.ref,b:dimensionAnchor(picked.part,picked.point),kind:$('dimension-kind').value,offset:Number($('dimension-offset').value)};
      if(!Number.isFinite(d.offset)||Math.abs(d.offset)>1000){error('Målavstanden må være mellom −1000 og 1000 mm.');return;}
      if((dimensionValue(d,parts())||0)<.001){error('Velg to forskjellige punkter.');return;}
      change(()=>doc.dimensions.push(d));pendingPoint=null;render();return;
    }
    const id=e.target.closest('[data-drawing-item]')?.dataset.drawingItem;if(!id)return;
    selectedId=id;const item=selected();drag={start:p,x:item[placementKey('x')],y:item[placementKey('y')],before:JSON.stringify(doc),moved:false,id};
    host.setPointerCapture?.(e.pointerId);render();e.preventDefault();
  });
  host.addEventListener('pointermove',e=>{
    if(!drag)return;const p=point(e);if(!p)return;let dx=p.x-drag.start.x,dy=p.y-drag.start.y;
    if(view==='iso'){const sx=dx,sy=dy;dx=sy+sx/Math.sqrt(3);dy=sy-sx/Math.sqrt(3);}
    const step=$('snap').checked&&!e.altKey?1:.01;const item=doc.items.find(p=>p.id===drag.id);
    item[placementKey('x')]=Math.round((drag.x+dx)/step)*step;item[placementKey('y')]=Math.round((drag.y+dy)/step)*step;drag.moved=item[placementKey('x')]!==drag.x||item[placementKey('y')]!==drag.y;render();
  });
  host.addEventListener('pointerup',()=>{if(drag?.moved){undo.push(drag.before);redo.length=0;notify();}drag=null;render()});
  host.addEventListener('pointercancel',()=>{if(drag)doc=JSON.parse(drag.before);drag=null;render()});
  root.addEventListener('keydown',e=>{
    const input=e.target.closest('input,textarea,select');
    if(e.key==='Tab'){
      const controls=[...root.querySelectorAll('button,input,select,textarea,summary,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length&&(!el.closest('details:not([open])')||el.matches('summary')));
      const first=controls[0],last=controls.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
    else if(e.key==='Escape'){e.preventDefault();if(measure){measure=false;pendingPoint=null;render()}else close();}
    else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();document.activeElement?.blur();notify();onSaveProject?.();}
    else if(!input&&(e.metaKey||e.ctrlKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();editHistory(e.shiftKey||e.key.toLowerCase()==='y'?'redo':'undo');}
    else if(!input&&selected()&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const step=e.shiftKey ? 10 : e.altKey ? .1 : 1;change(()=>{selected()[placementKey('x')]+=(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0);selected()[placementKey('y')]+=(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0);});}
    e.stopPropagation();
  });
  function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const filename=()=>doc.title.replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,80)||'arbeidstegning';
  $('export-svg').addEventListener('click',()=>{try{download(sheet(),`${filename()}-ark-${pageIndex+1}.svg`,'image/svg+xml;charset=utf-8')}catch(e){error(e.message)}});
  $('print').addEventListener('click',()=>{
    try{
      const list=pages(),html=drawingPrintHtml(doc,list.map((p,i)=>renderDrawingSheet(doc,shapes,p,{pageNumber:i+1,totalPages:list.length})));
      const frame=document.createElement('iframe');frame.className='drawing-print-frame';frame.title='Arbeidstegning for PDF / utskrift';
      frame.onload=async()=>{await frame.contentDocument.fonts?.ready;const sources=[...frame.contentDocument.querySelectorAll('svg image')].map(i=>i.getAttribute('href'));await Promise.all(sources.map(src=>new Promise(resolve=>{const image=new Image();image.onload=image.onerror=resolve;image.src=src;})));frame.contentWindow.focus();frame.contentWindow.print();};
      frame.srcdoc=html;document.querySelectorAll('.drawing-print-frame').forEach(el=>el.remove());document.body.append(frame);
      $('status').textContent='Velg «Lagre som PDF» i utskriftsvinduet. Bruk 100 % / faktisk størrelse, og slå av nettleserens topp- og bunntekst.';
    }catch(e){error(e.message)}
  });
  notify();render();$('close').focus();return {getDocument:()=>copy(doc),close};
}
