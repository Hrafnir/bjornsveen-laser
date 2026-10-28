import { DRAWING_MATERIALS, materialById, drawingMaterial } from './drawing-materials.js';
import { drawingPageKey, sheetViewBox, setSheetViewBox, clampAnnotation, ensureOnePager } from './drawing-page-layout.js';
import { packPartBounds } from './part-layout.js';
import { uid, evalMathExpr } from './geometry.js';
import { normalizeDrawingDocument, drawingParts, drawingSourceMap, newDrawingItem, syncDrawingSources, splitDrawingGroup, partSnapPoints, dimensionAnchor, dimensionValue, createDrawingDocument, flatPoint } from './drawing-model.js';
import { drawingBounds, drawingAnnotatedBounds, renderDrawingGeometry, renderAutoDimensions, renderManualDimensions, renderDrawingSheet, drawingPages, drawingPrintHtml, escapeDrawingText as E, drawingNumber } from './drawing-renderer.js';

const copy=value=>structuredClone(value);
export function openDrawingWorkshop({shapes,document:stored,settings,materialName,onChange=()=>{},onSaveProject,onSaveAsProject,onOpenProject}={}) {
  let root=document.getElementById('drawing-modal');
  if(root)root.remove();
  root=document.createElement('div');root.id='drawing-modal';root.className='modal-backdrop open drawing-modal';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Arbeidstegning');
  document.body.append(root);
  let doc=normalizeDrawingDocument(stored,shapes,settings,materialName),selectedId=doc.items[0]?.id||null,view='flat',measure=false,pendingPoint=null,drag=null,viewBox=null,pageIndex=0,selectedAnnotation=null,selectedView='flat',selectedDimension=null,placingNote=false,inlineEditor=null,lastNoteClick=null;
  const undo=[],redo=[];
  const field=(id,label,type='text')=>`<label class="drawing-field">${label}<input id="dw-${id}" class="input-control" type="${type}"/></label>`;
  const materials=blank=>`<option value="">${blank}</option>`+DRAWING_MATERIALS.map(m=>`<option value="${m.id}">${m.name} · ${m.thickness} mm</option>`).join('');
  root.innerHTML=`<section class="modal-window drawing-window">
    <header class="drawing-header"><div><h2>Arbeidstegning</h2><span>Dokumentasjon og sammenstilling i millimeter</span></div><div class="drawing-actions"><button id="dw-undo" class="btn" title="Angre i arbeidstegningen (⌘Z)">↶</button><button id="dw-redo" class="btn" title="Gjør om i arbeidstegningen (⇧⌘Z)">↷</button><button id="dw-open" class="btn">Åpne</button><button id="dw-save-as" class="btn">Lagre som …</button><button id="dw-save" class="btn">Lagre prosjekt</button><button id="dw-close" class="btn" aria-label="Lukk arbeidstegning">Lukk</button></div><p id="dw-file-status" class="project-file-status" role="status"></p></header>
    <div class="drawing-body"><aside class="drawing-settings">
      <details open><summary>Tegning og materiale</summary>
        ${field('title','Tittel')}${field('project','Prosjekt / oppgave')}
        <div class="drawing-grid">${field('author','Tegnet av')}${field('revision','Revisjon')}${field('date','Dato','date')}
          <label class="drawing-field">Ark<select id="dw-paper" class="select-control"><option>A4</option><option>A3</option></select></label></div>
        <label class="drawing-field">Materialbank<select id="dw-material-preset" class="select-control">${materials('Velg materiale …')}</select></label><div id="dw-material-swatch" class="drawing-material-swatch"></div><button id="dw-apply-material" class="btn">Bruk materialet og tykkelsen</button><p class="drawing-help">Materialbanken gjelder dokumentasjonen. Kuttinnstillinger velges i Laser-panelet.</p>${field('material','Materiale')}<div class="drawing-grid">${field('thickness','Tykkelse (mm)','number')}
          <label class="drawing-field">Enkel materialfarge<select id="dw-finish" class="select-control"><option value="wood">Tre</option><option value="mdf">MDF</option><option value="acrylic">Akryl</option><option value="metal">Metall</option><option value="white">Hvit</option></select></label></div>
        <button id="dw-use-material" class="btn">Bruk valgt laser-materiale</button>
        <label class="drawing-field">Merknader<textarea id="dw-notes" class="input-control" rows="3"></textarea></label>
      </details>
      <details open><summary>Deler i tegningen</summary><div class="drawing-grid"><button id="dw-sync" class="btn">Hent nye deler</button><button id="dw-reset" class="btn">Fra kutteoppsettet</button></div><button id="dw-spread" class="btn">Spre delene for målsetting</button><div id="dw-parts" class="drawing-part-list" aria-label="Deler i arbeidstegningen"></div></details>
      <details open><summary>Valgt del</summary><p id="dw-placement-label" class="drawing-help"></p>${field('name','Delnavn')}
        <div class="drawing-grid">${field('x','X (mm)','number')}${field('y','Y (mm)','number')}${field('z','Høyde Z (mm)','number')}${field('rotation','Rotasjon (°)','number')}</div>
        <label class="drawing-field">Orientering i materialvisning<select id="dw-plane" class="select-control"><option value="xy">Liggende (XY)</option><option value="xz">Stående (XZ)</option><option value="yz">Stående (YZ)</option></select></label>
        <div class="drawing-grid"><button id="dw-rotate" class="btn">Roter 90°</button><button id="dw-stack" class="btn">Opp én tykkelse</button></div>
        <label class="drawing-check"><input type="checkbox" id="dw-solid"/> Vis som materialdel med tykkelse</label>
        <label class="drawing-field">Materiale for denne delen<select id="dw-item-material" class="select-control">${materials("Følg felles materiale")}</select></label><label class="drawing-field">Egen tykkelse (tom = felles)<input id="dw-item-thickness" class="input-control" type="number" min="0" max="100" step="0.1"/></label>
        <div class="drawing-grid"><button id="dw-duplicate" class="btn">Dupliser i tegningen</button><button id="dw-split" class="btn">Del opp gruppe</button></div>
        <button id="dw-remove" class="btn">Fjern fra tegningen</button>
      </details>
      <details id="dw-measure-panel"><summary>Mål og eksport</summary>
        <label class="drawing-check"><input id="dw-auto-dimensions" type="checkbox"/> Vis automatiske hovedmål</label>
        <label class="drawing-field">Nytt mål<select id="dw-dimension-kind" class="select-control"><option value="aligned">Avstand mellom punkter</option><option value="horizontal">Vannrett</option><option value="vertical">Loddrett</option></select></label>
        ${field('dimension-offset','Avstand fra delen (mm)','number')}
        <div id="dw-dimensions" class="drawing-dimension-list"></div><div id="dw-edit-dimension" hidden><p class="drawing-help">Valgt mål – dra mållinjen eller endre feltene.</p>${field("edit-dimension-label","Beskrivelse")}${field("edit-dimension-offset","Mållinjens avstand (mm)","number")}<label class="drawing-field">Retning<select id="dw-edit-dimension-kind" class="select-control"><option value="aligned">Mellom punktene</option><option value="horizontal">Vannrett</option><option value="vertical">Loddrett</option></select></label></div>
        <label class="drawing-field">Målestokk på måltegninger<select id="dw-scale" class="select-control"><option value="auto">Tilpass til arket</option><option value="0.1">1:10</option><option value="0.2">1:5</option><option value="0.5">1:2</option><option value="1">1:1</option><option value="2">2:1</option><option value="5">5:1</option></select></label>
        <label class="drawing-check"><input id="dw-details" type="checkbox" checked/> Ta med detaljark for hver del</label>
      </details>
      <details id="dw-page-editor" open hidden><summary>Rediger dokumentasjonssiden</summary>
        <div class="drawing-grid"><button id="dw-add-page" class="btn">Ny dokumentside</button><button id="dw-remove-page" class="btn">Fjern egen side</button></div>
        ${field('page-title','Sidetittel (egne sider)')}
        <label class="drawing-field">Visning på arket<select id="dw-edit-view" class="select-control"><option value="flat">Måltegning</option><option value="iso">Materialvisning</option></select></label>
        <label class="drawing-check"><input id="dw-view-visible" type="checkbox"/> Vis på dette arket</label>
        <div class="drawing-grid">${field('view-x','Venstre (mm)','number')}${field('view-y','Topp (mm)','number')}${field('view-width','Bredde (mm)','number')}${field('view-height','Høyde (mm)','number')}</div>
        <button id="dw-reset-page" class="btn">Tilbakestill visningsoppsett</button>
        <div class="drawing-grid"><button id="dw-add-note" class="btn">＋ Tekst / notat</button><button id="dw-add-callout" class="btn">＋ Notat med peker</button></div>
        <div id="dw-note-list" class="drawing-part-list"></div>
        <div id="dw-note-editor" hidden><label class="drawing-field">Tekst<textarea id="dw-note-text" class="input-control" rows="4"></textarea></label>
        <div class="drawing-grid">${field('note-x','X på arket (mm)','number')}${field('note-y','Y på arket (mm)','number')}${field('note-width','Tekstbredde (mm)','number')}${field('note-font','Skriftstørrelse (mm)','number')}</div>
        <div id="dw-note-target" class="drawing-grid">${field('note-target-x','Peker X (mm)','number')}${field('note-target-y','Peker Y (mm)','number')}</div>
        <button id="dw-remove-note" class="btn">Fjern notatet</button></div>
        <p class="drawing-help">Dra visninger og notater på arket. Velg Målsett for å legge til mål direkte i måltegningen. Mål og pekere kan justeres etterpå.</p>
      </details>
      <p class="drawing-help">Flytting her endrer dokumentasjonen. Delplassering og materialvisning har egne X/Y-posisjoner og rotasjon. Z og orientering brukes i sammenstillingen. Materialvisningen illustrerer platetykkelse, men bøyer ikke flex automatisk.</p>
    </aside><main class="drawing-main">
      <nav class="drawing-toolbar" aria-label="Tegningsvisning"><div class="drawing-actions"><button data-drawing-view="flat" class="btn active">Delplassering</button><button data-drawing-view="iso" class="btn">Materialvisning</button><button data-drawing-view="sheet" class="btn">Ark / dokumentasjon</button></div><div class="drawing-actions"><button id="dw-measure" class="btn">＋ Målsett</button><button id="dw-fit" class="btn">Tilpass</button><label class="drawing-check"><input id="dw-snap" type="checkbox" checked/> Fest 1 mm</label></div></nav>
      <div class="drawing-document-tools"><button id="dw-onepager" class="btn" title="Samle mål, materialvisning og forklaringer på ett ark">Prosjektark · én side</button><button id="dw-place-note" class="btn" title="Klikk på arket for å plassere en tekstboks">＋ Tekstboks på arket</button></div><div id="dw-page-bar" class="drawing-page-bar" hidden><label>Ark <select id="dw-page" class="select-control"></select></label><label>Zoom <select id="dw-paper-zoom" class="select-control" aria-label="Visningszoom for arket"><option value="1">Tilpass</option><option value="1.5">150 %</option><option value="2">200 %</option><option value="3">300 %</option></select></label></div>
      <div id="dw-status" class="drawing-status" role="status"></div>
      <div id="dw-canvas" class="drawing-canvas" tabindex="0" aria-label="Arbeidstegning, dra deler eller klikk to punkter for å målsette"></div>
      <div id="dw-error" class="box-error" role="alert" hidden></div>
      <footer class="drawing-footer"><span id="dw-info"></span><div class="drawing-actions"><button id="dw-export-svg" class="btn">Last ned ark som SVG</button><label class="drawing-print-scope">Eksporter<select id="dw-print-scope" class="select-control"><option value="current">Dette arket</option><option value="all">Hele dokumentet</option></select></label><button id="dw-pdf" class="btn">PDF</button><button id="dw-print" class="btn btn-primary">Skriv ut</button></div></footer>
    </main></div></section>`;
  const $=id=>root.querySelector('#dw-'+id),host=$('canvas');
  for(const key of ['title','project','author','revision','date','notes','material','paper','thickness','finish','scale'])$(key).value=doc[key];
  $('details').checked=doc.includeDetails!==false;$('auto-dimensions').checked=doc.autoDimensions;$('dimension-offset').value=-10;
  const parts=()=>drawingParts(doc,shapes),selected=()=>doc.items.find(p=>p.id===selectedId);
  const currentPage=()=>pages()[Math.min(pageIndex,pages().length-1)];
  const note=()=>doc.annotations.find(a=>a.id===selectedAnnotation&&a.page===drawingPageKey(currentPage()));
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
  function sheet(index=pageIndex,editing=false){const list=pages();return renderDrawingSheet(doc,shapes,list[Math.min(index,list.length-1)],{pageNumber:doc.printScope==='current'?1:Math.min(index,list.length-1)+1,totalPages:doc.printScope==='current'?1:list.length,editing,selectedAnnotation,selectedView,frozenViews:drag?.type==='dimension'?drag.frozenViews:null});}
  function render(){
    const all=parts(),item=selected(),source=drawingSourceMap(shapes).get(item?.sourceId);
    $('print-scope').value=doc.printScope;$('place-note').classList.toggle('active',placingNote);host.classList.toggle('placing-note',placingNote);
    $('undo').disabled=!undo.length;$('redo').disabled=!redo.length;
    $('page-editor').hidden=view!=='sheet';if(view==='sheet'&&$('page-editor').parentElement.firstElementChild!==$('page-editor'))$('page-editor').parentElement.prepend($('page-editor'));
    $('material-preset').value=doc.materialId||'';$('finish').closest('label').hidden=Boolean(doc.materialId);
    const material=drawingMaterial(null,doc);$('material-swatch').style.background=material.face;$('material-swatch').style.borderColor=material.edge;$('material-swatch').textContent=material.name;
    $('item-material').disabled=!item;$('item-material').value=item?.materialId||'';
    renderPageEditor();
    $('parts').innerHTML=doc.items.map((p,i)=>`<div class="drawing-part-row"><input type="checkbox" data-visible="${E(p.id)}" aria-label="Vis ${E(p.name)}" ${p.visible!==false?'checked':''}/><button class="btn ${p.id===selectedId?'active':''}" data-select-part="${E(p.id)}" aria-pressed="${p.id===selectedId}">${i+1}. ${E(p.name)}${drawingSourceMap(shapes).has(p.sourceId)?'':' (mangler)'}</button></div>`).join('');
    for(const key of ['name','x','y','z','rotation','plane']){$(key).disabled=!item;if(document.activeElement!==$(key))$(key).value=item?.[placementKey(key)]??'';}
    $('placement-label').textContent=view==='iso'?'X/Y og rotasjon endrer sammenstillingen.':'X/Y og rotasjon endrer den flate måltegningen.';
    $('solid').disabled=!item;$('solid').checked=Boolean(item?.solid);$('item-thickness').disabled=!item;if(document.activeElement!==$('item-thickness'))$('item-thickness').value=item?.thickness??'';
    for(const id of ['rotate','stack','duplicate','remove'])$(id).disabled=!item;
    $('split').disabled=source?.type!=='group'||Boolean(source.puzzleMeta)||Boolean(source.children?.length&&source.children.every(c=>c.boxPart&&c.boxPart.id===source.children[0].boxPart?.id));
    $('dimensions').innerHTML=doc.dimensions.map(d=>{const value=dimensionValue(d,all);return `<div class="drawing-part-row"><button class="btn" data-select-dimension="${E(d.id)}">${d.labelText?E(d.labelText)+': ':''}${value==null?'Mangler del':drawingNumber(value)+' mm'}</button><button class="btn" data-remove-dimension="${E(d.id)}" aria-label="Fjern mål">×</button></div>`}).join('');
    const dim=doc.dimensions.find(d=>d.id===selectedDimension);$('edit-dimension').hidden=!dim;
    if(dim)for(const [id,key] of [['edit-dimension-label','labelText'],['edit-dimension-offset','offset'],['edit-dimension-kind','kind']])if(document.activeElement!==$(id))$(id).value=dim[key]??'';
    $('page-bar').hidden=view!=='sheet';$('measure').disabled=view==='iso'||(view==='sheet'&&!sheetViewBox(doc,currentPage(),'flat')?.visible);$('measure').classList.toggle('active',measure);$('fit').disabled=view==='sheet';
    root.querySelectorAll('[data-drawing-view]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.drawingView===view);btn.setAttribute('aria-pressed',String(btn.dataset.drawingView===view));});
    const missing=doc.items.filter(p=>p.visible!==false).length-all.length;
    $('status').textContent=placingNote?'Klikk på arket for å plassere en tekstboks. Esc avbryter.':measure?(pendingPoint?'Klikk målpunkt nummer to. Esc avbryter.':'Klikk to punkter på delene. Punkter og hjørner fester seg automatisk.'):missing?`${missing} del(er) mangler eller er skjult på arbeidsflaten.`:view==='iso'?'Dra for å flytte i X/Y. Endre Z og orientering for å sette delene sammen.':view==='flat'?'Dra deler i måltegningen. Piltaster flytter 1 mm, Shift + pil flytter 10 mm.':'Dra visninger og notater på arket. Rediger siden i panelet. SVG og PDF tar med oppsettet.';
    error('');
    try{
      if(view==='sheet'){
        const list=pages();pageIndex=Math.min(pageIndex,list.length-1);$('page').innerHTML=list.map((p,i)=>`<option value="${i}">${E(p.title)}</option>`).join('');$('page').value=pageIndex;
        host.innerHTML=sheet(pageIndex,true);host.classList.add('paper-view');
      }else{
        host.classList.remove('paper-view');
        if(!viewBox){const b=view==='flat'?drawingAnnotatedBounds(doc,all):drawingBounds(all,view),pad=Math.max(20,Math.max(b.width,b.height)*.18);viewBox={x:b.x-pad,y:b.y-pad,width:Math.max(80,b.width+pad*2),height:Math.max(60,b.height+pad*2)};}
        const size=Math.max(viewBox.width,viewBox.height)/120,stroke=size*.07;
        let content=renderDrawingGeometry(all,{view,finish:doc.finish,materialId:doc.materialId,selectedId,strokeWidth:stroke,textSize:size,labels:view==='flat'});
        if(view==='flat'){
          if(doc.autoDimensions)content+=renderAutoDimensions(all,{textSize:size,strokeWidth:stroke,overall:true});
          content+=renderManualDimensions(doc,all,{textSize:size,strokeWidth:stroke});
          if(pendingPoint)content+=`<circle cx="${pendingPoint.point.x}" cy="${pendingPoint.point.y}" r="${size*.6}" fill="#0284c7" pointer-events="none"/>`;
        }
        host.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" aria-label="${view==='iso'?'Materialvisning':'Delplassering'}"><g font-family="Arial, sans-serif">${content}</g></svg>`;
      }
      const overflow=host.querySelector('[data-text-overflow]');$('export-svg').disabled=Boolean(overflow);$('print').disabled=Boolean(overflow);$('pdf').disabled=Boolean(overflow);if(overflow)error('Et notat får ikke plass. Flytt det opp, øk tekstbredden eller del teksten over flere notater.');
    }catch(e){error(e.message);host.replaceChildren();$('export-svg').disabled=true;$('print').disabled=true;$('pdf').disabled=true;}
    const b=drawingBounds(all);$('info').textContent=`${all.length} deler · ${drawingNumber(b.width)} × ${drawingNumber(b.height)} mm · ${doc.printScope==='current'?'1 ark til utskrift':pages().length+' ark til utskrift'}`;
  }
  for(const key of ['title','project','author','revision','date','notes','material','paper','thickness','finish','scale']){
    $(key).addEventListener('change',()=>{
      let value=$(key).value;
      if(key==='thickness'){value=Number(value);if(!Number.isFinite(value)||value<0||value>100){error('Materialtykkelsen må være mellom 0 og 100 mm.');return;}}
      change(()=>{doc[key]=typeof value==='string'?value.slice(0,key==='notes'?3000:180):value;if(key==='finish')doc.materialId=null;if(key==='paper')doc.annotations.forEach(a=>clampAnnotation(doc,a));});
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
  $('details').addEventListener('change',()=>change(()=>doc.includeDetails=$('details').checked));$('page').addEventListener('change',()=>{pageIndex=Number($('page').value);selectedAnnotation=null;pendingPoint=null;render()});
  $('use-material').addEventListener('click',()=>change(()=>{doc.material=materialName||'Materiale';doc.thickness=Number(settings.thicknessMm)||0;doc.materialId=null;doc.finish=createDrawingDocument([],settings,materialName).finish;$('finish').value=doc.finish;$('material').value=doc.material;$('thickness').value=doc.thickness;}));
  $('parts').addEventListener('click',e=>{const btn=e.target.closest('[data-select-part]');if(btn){selectedId=btn.dataset.selectPart;render()}});
  $('parts').addEventListener('change',e=>{const id=e.target.dataset.visible;if(id)change(()=>doc.items.find(p=>p.id===id).visible=e.target.checked,{fit:true})});
  $('dimensions').addEventListener('click',e=>{const pick=e.target.closest('[data-select-dimension]');if(pick){selectedDimension=pick.dataset.selectDimension;render();return;}const btn=e.target.closest('[data-remove-dimension]');if(btn)change(()=>doc.dimensions=doc.dimensions.filter(d=>d.id!==btn.dataset.removeDimension))});
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
  $('open').addEventListener('click',()=>{document.activeElement?.blur();onOpenProject?.()});
  $('save-as').addEventListener('click',()=>{document.activeElement?.blur();notify();onSaveAsProject?.()});
  $('close').addEventListener('click',close);$('save').addEventListener('click',()=>{document.activeElement?.blur();notify();onSaveProject?.()});
  root.querySelectorAll('[data-drawing-view]').forEach(btn=>btn.addEventListener('click',()=>{view=btn.dataset.drawingView;placingNote=false;viewBox=null;measure=false;pendingPoint=null;render()}));
  $('onepager').addEventListener('click',()=>{change(()=>{const summary=ensureOnePager(doc);view='sheet';pageIndex=0;selectedAnnotation=summary.id;measure=false;placingNote=false;});});
  $('place-note').addEventListener('click',()=>{view='sheet';measure=false;pendingPoint=null;placingNote=!placingNote;render();host.focus();});
  $('print-scope').addEventListener('change',()=>change(()=>doc.printScope=$('print-scope').value));
  function editNoteInline(a){
    if(!a)return;
    const rect=[...host.querySelectorAll('[data-annotation-id]')].find(el=>el.dataset.annotationId===a.id)?.querySelector('rect');
    if(!rect)return;
    const bounds=rect.getBoundingClientRect(),canvas=host.getBoundingClientRect();
    const editor=document.createElement('textarea');editor.className='drawing-inline-note';editor.setAttribute('aria-label','Tekstboks på arket');editor.maxLength=3000;editor.value=a.text;
    editor.style.left=Math.max(host.scrollLeft,Math.min(host.scrollLeft+host.clientWidth-160,bounds.left-canvas.left+host.scrollLeft))+'px';
    editor.style.top=Math.max(host.scrollTop,Math.min(host.scrollTop+host.clientHeight-90,bounds.top-canvas.top+host.scrollTop))+'px';
    editor.style.width=Math.min(host.clientWidth-12,Math.max(160,bounds.width))+'px';editor.style.height=Math.max(80,Math.min(host.clientHeight-12,bounds.height+40))+'px';
    inlineEditor=editor;host.append(editor);
    const finish=commit=>{if(inlineEditor!==editor)return;inlineEditor=null;const value=editor.value;editor.remove();if(commit&&value!==a.text)change(()=>a.text=value);else render();};
    editor.addEventListener('blur',()=>finish(true));editor.addEventListener('pointerdown',e=>e.stopPropagation());
    editor.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false);}else if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();e.stopPropagation();finish(true);}});
    editor.focus();editor.select();
  }
  host.addEventListener('dblclick',e=>{const el=e.target.closest('[data-annotation-id]');if(el){selectedAnnotation=el.dataset.annotationId;drag=null;render();editNoteInline(note());e.preventDefault();}});
  $('paper-zoom').addEventListener('change',()=>host.style.setProperty('--drawing-sheet-zoom',$('paper-zoom').value));
  $('fit').addEventListener('click',()=>{viewBox=null;render()});
  $('measure').addEventListener('click',()=>{measure=!measure;pendingPoint=null;$('measure-panel').open=true;render()});
  function measurementParts(){
    const all=parts(),page=currentPage();
    return view==='sheet'&&page.kind==='detail'?all.filter(p=>p.item.id===page.itemId).map(p=>({...p,item:{...p.item,x:0,y:0,rotation:0}})):all;
  }
  function dimensionPoint(ref){const p=measurementParts().find(p=>p.item.id===ref.itemId);return p?flatPoint(p,{x:ref.u*p.bounds.width,y:ref.v*p.bounds.height}):null;}
  function renderPageEditor(){
    const page=currentPage(),custom=doc.customPages.find(p=>p.id===page.id),box=sheetViewBox(doc,page,selectedView),a=note();
    $('page-title').disabled=!custom;$('remove-page').disabled=!custom;if(document.activeElement!==$('page-title'))$('page-title').value=custom?.title||page.title;
    $('edit-view').value=selectedView;$('view-visible').disabled=!box;$('view-visible').checked=box?.visible!==false;
    for(const key of ['x','y','width','height']){$('view-'+key).disabled=!box;if(document.activeElement!==$('view-'+key))$('view-'+key).value=box?Number(box[key].toFixed(2)):'';}
    const key=drawingPageKey(page);$('note-list').innerHTML=doc.annotations.filter(a=>a.page===key).map(a=>`<button class="btn" data-select-note="${E(a.id)}">${E(a.text.slice(0,45)||'Tomt notat')}</button>`).join('');
    $('note-editor').hidden=!a;
    if(a){for(const [id,key] of [['text','text'],['x','x'],['y','y'],['width','width'],['font','fontSize'],['target-x','targetX'],['target-y','targetY']])if(document.activeElement!==$('note-'+id))$('note-'+id).value=a[key];$('note-target').hidden=a.kind!=='callout';}
  }
  $('apply-material').addEventListener('click',()=>{const m=materialById($('material-preset').value);if(m)change(()=>{doc.materialId=m.id;doc.material=m.name;doc.thickness=m.thickness;$('material').value=m.name;$('thickness').value=m.thickness;});});
  $('item-material').addEventListener('change',()=>{const m=materialById($('item-material').value);if(selected())change(()=>{selected().materialId=m?.id||null;selected().thickness=m?.thickness??null;});});
  $('edit-view').addEventListener('change',()=>{selectedView=$('edit-view').value;selectedAnnotation=null;render()});
  for(const key of ['x','y','width','height'])$('view-'+key).addEventListener('change',()=>{const v=Number($('view-'+key).value);if(Number.isFinite(v))change(()=>setSheetViewBox(doc,currentPage(),selectedView,{[key]:v}));});
  $('view-visible').addEventListener('change',()=>change(()=>setSheetViewBox(doc,currentPage(),selectedView,{visible:$('view-visible').checked})));
  $('reset-page').addEventListener('click',()=>change(()=>delete doc.sheetLayouts[drawingPageKey(currentPage())]));
  $('add-page').addEventListener('click',()=>change(()=>{doc.customPages.push({id:uid('sheet'),title:'Dokumentasjon '+(doc.customPages.length+1)});pageIndex=pages().length-1;selectedAnnotation=null;}));
  $('page-title').addEventListener('change',()=>{const p=doc.customPages.find(p=>p.id===currentPage().id);if(p)change(()=>p.title=$('page-title').value.slice(0,100));});
  $('remove-page').addEventListener('click',()=>{const page=currentPage();if(page.kind==='custom')change(()=>{doc.customPages=doc.customPages.filter(p=>p.id!==page.id);doc.annotations=doc.annotations.filter(a=>a.page!==drawingPageKey(page));delete doc.sheetLayouts[drawingPageKey(page)];pageIndex=0;selectedAnnotation=null;});});
  for(const kind of ['note','callout'])$('add-'+kind).addEventListener('click',()=>{change(()=>{const a=clampAnnotation(doc,{id:uid('note'),page:drawingPageKey(currentPage()),kind,text:'Skriv informasjon her',x:18,y:125,width:70,fontSize:3,targetX:100,targetY:80});doc.annotations.push(a);selectedAnnotation=a.id;});$('note-text').focus();$('note-text').select();});
  $('note-list').addEventListener('click',e=>{const b=e.target.closest('[data-select-note]');if(b){selectedAnnotation=b.dataset.selectNote;render();}});
  for(const [id,key] of [['text','text'],['x','x'],['y','y'],['width','width'],['font','fontSize'],['target-x','targetX'],['target-y','targetY']])$('note-'+id).addEventListener('change',()=>{if(!note())return;const value=id==='text'?$('note-'+id).value.slice(0,3000):Number($('note-'+id).value);if(id!=='text'&&!Number.isFinite(value))return;change(()=>{note()[key]=value;clampAnnotation(doc,note());});});
  $('remove-note').addEventListener('click',()=>{if(note())change(()=>{doc.annotations=doc.annotations.filter(a=>a.id!==selectedAnnotation);selectedAnnotation=null;});});
  for(const [id,key] of [['label','labelText'],['offset','offset'],['kind','kind']])$('edit-dimension-'+id).addEventListener('change',()=>{const d=doc.dimensions.find(d=>d.id===selectedDimension);if(!d)return;const value=id==='offset'?Number($('edit-dimension-'+id).value):$('edit-dimension-'+id).value;if(id==='offset'&&(!Number.isFinite(value)||Math.abs(value)>1000)){error('Avstand må være mellom −1000 og 1000 mm.');return;}change(()=>d[key]=typeof value==='string'?value.slice(0,80):value);});
  const point=e=>{const svg=host.querySelector('svg'),matrix=svg?.getScreenCTM();if(!matrix)return null;const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(matrix.inverse())};
  const anchorAt=(p,target)=>{
    const matrix=(view==='sheet'?host.querySelector('[data-view-transform="flat"]'):host.querySelector('svg'))?.getScreenCTM();
    const all=measurementParts(),radius=matrix?12/Math.hypot(matrix.a,matrix.b):1;
    let best;
    for(const part of all)for(const candidate of partSnapPoints(part)){const distance=Math.hypot(candidate.x-p.x,candidate.y-p.y);if(distance<=radius&&(!best||distance<best.distance))best={part,point:candidate,distance};}
    if(best)return best;
    const id=target.closest('[data-drawing-item]')?.dataset.drawingItem,part=all.find(v=>v.item.id===id);
    return part?{part,point:p}:null;
  };
  host.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;let p=point(e);if(!p)return;host.focus();
    if(placingNote&&view==='sheet'){change(()=>{const a=clampAnnotation(doc,{id:uid('note'),page:drawingPageKey(currentPage()),kind:'note',text:'',x:p.x,y:p.y,width:65,fontSize:3});doc.annotations.push(a);selectedAnnotation=a.id;placingNote=false;});editNoteInline(note());e.preventDefault();return;}
    const measured=e.target.closest('[data-dimension-id]');
    if(!measure&&measured){
      selectedDimension=measured.dataset.dimensionId;$('measure-panel').open=true;
      const dimension=doc.dimensions.find(d=>d.id===selectedDimension);
      drag={type:'dimension',before:JSON.stringify(doc),id:selectedDimension,start:p,startScreenX:e.clientX,startScreenY:e.clientY,offset:dimension.offset,matrix:view==='sheet'?e.target.closest('[data-view-transform]')?.getScreenCTM():null};
      if(view==='sheet'){const m=e.target.closest('[data-view-transform]')?.transform.baseVal.consolidate()?.matrix;if(m)drag.frozenViews={flat:{tx:m.e,ty:m.f,scale:m.a}};}
      host.setPointerCapture?.(e.pointerId);render();e.preventDefault();return;
    }
    if(view==='sheet'){
      const annotation=e.target.closest('[data-annotation-id]'),region=e.target.closest('[data-sheet-view]');
      if(!measure){
        if(annotation){selectedAnnotation=annotation.dataset.annotationId;const a=note();const now=performance.now();if(lastNoteClick?.id===a.id&&now-lastNoteClick.time<450){lastNoteClick=null;drag=null;render();editNoteInline(a);e.preventDefault();return;}lastNoteClick={id:a.id,time:now};drag={type:'note',id:a.id,x:a.x,y:a.y,start:p,before:JSON.stringify(doc)};}
        else if(region){selectedAnnotation=null;selectedView=region.dataset.sheetView;const b=sheetViewBox(doc,currentPage(),selectedView);drag={type:'view',mode:selectedView,start:p,box:b,before:JSON.stringify(doc)};}
        else return;
        host.setPointerCapture?.(e.pointerId);render();e.preventDefault();return;
      }
      if(region?.dataset.sheetView!=='flat'){error('Velg to punkter i måltegningen på arket.');return;}
      const matrix=region.querySelector('[data-view-transform]').getScreenCTM();const screen=new DOMPoint(e.clientX,e.clientY);p=screen.matrixTransform(matrix.inverse());
    }
    if(measure){
      const picked=anchorAt(p,e.target);if(!picked){error('Klikk på en del eller nær et hjørne.');return;}
      if(!pendingPoint){pendingPoint={point:picked.point,ref:dimensionAnchor(picked.part,picked.point)};render();return;}
      const d={id:uid('dimension'),a:pendingPoint.ref,b:dimensionAnchor(picked.part,picked.point),kind:$('dimension-kind').value,offset:Number($('dimension-offset').value)};
      if(!Number.isFinite(d.offset)||Math.abs(d.offset)>1000){error('Målavstanden må være mellom −1000 og 1000 mm.');return;}
      if((dimensionValue(d,measurementParts())||0)<.001){error('Velg to forskjellige punkter.');return;}
      change(()=>{doc.dimensions.push(d);selectedDimension=d.id});pendingPoint=null;render();return;
    }
    const id=e.target.closest('[data-drawing-item]')?.dataset.drawingItem;if(!id)return;
    selectedId=id;const item=selected();drag={start:p,x:item[placementKey('x')],y:item[placementKey('y')],before:JSON.stringify(doc),moved:false,id};
    host.setPointerCapture?.(e.pointerId);render();e.preventDefault();
  });
  host.addEventListener('pointermove',e=>{
    if(!drag)return;lastNoteClick=null;const p=point(e);if(!p)return;
    if(drag.type){
      if(drag.type==='note'){const a=note();a.x=drag.x+p.x-drag.start.x;a.y=drag.y+p.y-drag.start.y;clampAnnotation(doc,a);}
      else if(drag.type==='view')setSheetViewBox(doc,currentPage(),drag.mode,{...drag.box,x:drag.box.x+p.x-drag.start.x,y:drag.box.y+p.y-drag.start.y});
      else if(drag.type==='dimension'){
        const d=doc.dimensions.find(d=>d.id===drag.id),delta=drag.matrix?new DOMPoint(e.clientX,e.clientY).matrixTransform(drag.matrix.inverse()):p;
        const start=drag.matrix?new DOMPoint(drag.startScreenX,drag.startScreenY).matrixTransform(drag.matrix.inverse()):drag.start;
        const a=measurementParts().find(p=>p.item.id===d.a.itemId),b=measurementParts().find(p=>p.item.id===d.b.itemId);
        if(a&&b){
          // Derive actual aligned normal from anchors, preserving the initial grab offset.
          const refs=doc.dimensions.find(x=>x.id===d.id),pa=dimensionPoint(refs.a),pb=dimensionPoint(refs.b),length=Math.hypot(pb.x-pa.x,pb.y-pa.y);
          const dx=delta.x-start.x,dy=delta.y-start.y;
          d.offset=Math.max(-1000,Math.min(1000,drag.offset+(d.kind==='horizontal'?dy:d.kind==='vertical'?-dx:dx*-(pb.y-pa.y)/length+dy*(pb.x-pa.x)/length)));
        }
      }
      drag.moved=true;render();return;
    }
    let dx=p.x-drag.start.x,dy=p.y-drag.start.y;
    if(view==='iso'){const sx=dx,sy=dy;dx=sy+sx/Math.sqrt(3);dy=sy-sx/Math.sqrt(3);}
    const step=$('snap').checked&&!e.altKey?1:.01;const item=doc.items.find(p=>p.id===drag.id);
    item[placementKey('x')]=Math.round((drag.x+dx)/step)*step;item[placementKey('y')]=Math.round((drag.y+dy)/step)*step;drag.moved=item[placementKey('x')]!==drag.x||item[placementKey('y')]!==drag.y;render();
  });
  host.addEventListener('pointerup',()=>{if(!drag)return;if(drag?.moved){undo.push(drag.before);redo.length=0;notify();}drag=null;render()});
  host.addEventListener('pointercancel',()=>{if(drag)doc=JSON.parse(drag.before);drag=null;render()});
  root.addEventListener('keydown',e=>{
    const input=e.target.closest('input,textarea,select');
    if(e.key==='Tab'){
      const controls=[...root.querySelectorAll('button,input,select,textarea,summary,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length&&(!el.closest('details:not([open])')||el.matches('summary')));
      const first=controls[0],last=controls.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
    else if(e.key==='Escape'){e.preventDefault();if(placingNote){placingNote=false;render()}else if(measure){measure=false;pendingPoint=null;render()}else close();}
    else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();document.activeElement?.blur();notify();(e.shiftKey?onSaveAsProject:onSaveProject)?.();}
    else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='o'){e.preventDefault();document.activeElement?.blur();onOpenProject?.();}
    else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='p'){e.preventDefault();printDocument('print');}
    else if(!input&&(e.metaKey||e.ctrlKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();editHistory(e.shiftKey||e.key.toLowerCase()==='y'?'redo':'undo');}
    else if(!input&&view!=='sheet'&&selected()&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const step=e.shiftKey ? 10 : e.altKey ? .1 : 1;change(()=>{selected()[placementKey('x')]+=(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0);selected()[placementKey('y')]+=(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0);});}
    e.stopPropagation();
  });
  function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const filename=()=>doc.title.replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,80)||'arbeidstegning';
  $('export-svg').addEventListener('click',()=>{try{download(sheet(),`${filename()}-ark-${pageIndex+1}.svg`,'image/svg+xml;charset=utf-8')}catch(e){error(e.message)}});
  function printDocument(intent='print'){
    document.activeElement?.blur();
    try{
      const list=doc.printScope==='current'?[currentPage()]:pages(),html=drawingPrintHtml(doc,list.map((p,i)=>renderDrawingSheet(doc,shapes,p,{pageNumber:i+1,totalPages:list.length})));
      const frame=document.createElement('iframe');frame.className='drawing-print-frame';frame.title='Arbeidstegning for PDF / utskrift';
      frame.onload=async()=>{await frame.contentDocument.fonts?.ready;const sources=[...frame.contentDocument.querySelectorAll('svg image')].map(i=>i.getAttribute('href'));await Promise.all(sources.map(src=>new Promise(resolve=>{const image=new Image();image.onload=image.onerror=resolve;image.src=src;})));frame.contentWindow.focus();frame.contentWindow.print();};
      frame.srcdoc=html;document.querySelectorAll('.drawing-print-frame').forEach(el=>el.remove());document.body.append(frame);
      $('status').textContent=(intent==='pdf'?'Velg «Lagre som PDF» i utskriftsvinduet. ':'Velg skriver i utskriftsvinduet. ')+list.length+' ark. Bruk 100 % / faktisk størrelse, uten nettleserens topp- og bunntekst.';
    }catch(e){error(e.message)}
  }
  $('print').addEventListener('click',()=>printDocument());$('pdf').addEventListener('click',()=>printDocument('pdf'));
  if(doc.onePager)view='sheet';
  notify();render();$('close').focus();return {getDocument:()=>copy(doc),close};
}
