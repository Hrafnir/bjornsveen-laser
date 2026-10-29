import { shapeToWorldSvgPath, computePolygonsBBox, shapeToWorldPolygons } from './geometry.js';
const NS='http://www.w3.org/2000/svg';
const E=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function projectMenuContent(drawing=false) {
  const ids=drawing?{open:'dw-open',save:'dw-save',saveAs:'dw-save-as'}:{open:'btn-open-project-file',save:'btn-save-project',saveAs:'btn-save-project-as'};
  const button=(action,label,id='')=>`<button class="btn" ${id?`id="${id}"`:''} data-project-action="${action}">${label}</button>`;
  return `<div class="project-menu-group"><span class="project-menu-label">Prosjekt</span>${button('new','Nytt prosjekt …')}${button('library','Mine prosjekter …')}${button('open','Åpne prosjektfil …',ids.open)}${button('rename','Gi nytt navn …')}${button('copy','Lag en kopi …')}</div>
  <div class="project-menu-group"><span class="project-menu-label">Lagre</span>${button('save','Lagre prosjekt <kbd>⌘ / Ctrl S</kbd>',ids.save)}${button('saveAs','Lagre prosjektfil som …',ids.saveAs)}</div>
  <details class="project-export-options"><summary>Eksporter og skriv ut</summary><div class="project-menu-group">${button('laser','Til xTool …',drawing?'':'btn-export-xcs')}${button('svg','SVG til laser …',drawing?'':'btn-export-svg')}${button('document','Arbeidstegning: PDF, SVG / utskrift …')}</div></details>
  <div class="project-menu-group">${button('insert','Sett inn bilde / SVG …',drawing?'':'btn-import')}</div>`;
}
function dialog(title) {
  const previous=document.activeElement,root=document.createElement('div');root.className='modal-backdrop open project-dialog';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
  root.innerHTML='<section class="modal-window project-window"><header><h2></h2><button class="btn" data-close aria-label="Lukk">✕</button></header><div class="project-dialog-body"></div><p class="project-error" role="alert"></p></section>';
  const heading=root.querySelector('h2');heading.id='project-dialog-title-'+crypto.randomUUID();heading.textContent=title;root.setAttribute('aria-labelledby',heading.id);document.body.append(root);
  let cancel=()=>close();
  const close=()=>{root.remove();if(previous?.isConnected){const closed=previous.closest('details:not([open])');(closed?.querySelector('summary')||previous).focus()}};
  root.querySelector('[data-close]').onclick=()=>cancel();
  root.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();cancel()}
    if(e.key==='Tab'){const controls=[...root.querySelectorAll('button,input,select')].filter(el=>!el.disabled&&!el.hidden);if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1)?.focus()}else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus()}}
    e.stopPropagation();
  });
  root.querySelector('[data-close]').focus();
  return {root,body:root.querySelector('.project-dialog-body'),close,setCancel:fn=>cancel=fn,error:e=>{root.querySelector('.project-error').textContent=e.message||String(e)}};
}
export function askProjectName(title,value='') {
  const ui=dialog(title);ui.body.innerHTML='<form><label>Prosjektnavn<input class="input-control" id="project-name-input" maxlength="100" required autocomplete="off"/></label><p>Tegning, bilder, laserinnstillinger og dokumentasjon lagres sammen.</p><button class="btn btn-primary" type="submit">Fortsett</button></form>';
  const input=ui.body.querySelector('input');input.value=value;input.focus();input.select();
  return new Promise(resolve=>{ui.setCancel(()=>{ui.close();resolve(null)});ui.body.querySelector('form').onsubmit=e=>{e.preventDefault();const name=input.value.trim();if(!name){input.setCustomValidity('Skriv et prosjektnavn.');input.reportValidity();return}ui.close();resolve(name)};input.oninput=()=>input.setCustomValidity('');});
}
export function confirmProjectSwitch({name,onSave,storageFailed=false}) {
  const ui=dialog('Bytte prosjekt?');ui.body.innerHTML=`<p>Endringene i <strong>${E(name||'prosjektet')}</strong> er ikke lagret i prosjektfilen. ${storageFailed?'Nettleserlagring er utilgjengelig. Lagre prosjektfilen før du fortsetter.':'De beholdes i «Mine prosjekter» i denne nettleseren.'}</p><div class="project-choices"><button class="btn btn-primary" data-save>Lagre fil og fortsett</button><button class="btn" data-keep ${storageFailed?'hidden':''}>Behold i nettleseren og fortsett</button><button class="btn" data-cancel>Avbryt</button></div>`;
  return new Promise(resolve=>{
    let busy=false;const finish=v=>{if(busy)return;ui.close();resolve(v)};ui.setCancel(()=>finish(false));ui.body.querySelector('[data-cancel]').onclick=()=>finish(false);ui.body.querySelector('[data-keep]').onclick=()=>finish(true);
    ui.body.querySelector('[data-save]').onclick=async()=>{busy=true;ui.root.querySelectorAll('button').forEach(b=>b.disabled=true);try{const saved=await onSave();busy=false;if(saved)finish(true)}catch(e){ui.error(e)}finally{busy=false;ui.root.querySelectorAll('button').forEach(b=>b.disabled=false)}};
  });
}
function thumbnail(shapes) {
  const svg=document.createElementNS(NS,'svg');svg.setAttribute('aria-hidden','true');
  const leaves=[];const collect=list=>{for(const s of list||[])if(!s.hidden){if(s.type==='group')collect(s.children);else leaves.push(s)}};collect(shapes);
  const bounds=[];
  for(const s of leaves.slice(0,200)){
    if(s.laserMode==='guide')continue;
    try{
      const isImage=s.type==='image';let node;
      if(isImage){const src=s.dataUrl||s.srcDataUrl;if(!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(src||''))continue;node=document.createElementNS(NS,'image');node.setAttribute('href',src);for(const k of ['x','y','width','height'])node.setAttribute(k,Number(s[k])||0);bounds.push([{x:s.x,y:s.y},{x:s.x+s.width,y:s.y+s.height}]);}
      else{const path=shapeToWorldSvgPath(s);if(!path)continue;node=document.createElementNS(NS,'path');node.setAttribute('d',path);node.setAttribute('fill',s.laserMode==='engrave'?'#111827':'none');node.setAttribute('fill-rule','evenodd');node.setAttribute('stroke',s.laserMode==='engrave'?'none':s.laserMode==='score'?'#2563eb':'#ef4444');node.setAttribute('stroke-width','1');node.setAttribute('vector-effect','non-scaling-stroke');bounds.push(...shapeToWorldPolygons(s));}
      svg.append(node);
    }catch{/* A malformed old object must not prevent opening its source project. */}
  }
  if(bounds.length){const b=computePolygonsBBox(bounds),pad=Math.max(b.width,b.height)*.08+1;svg.setAttribute('viewBox',`${b.x-pad} ${b.y-pad} ${b.width+pad*2} ${b.height+pad*2}`)}else svg.setAttribute('viewBox','0 0 100 60');
  return svg;
}
export async function openProjectLibrary({list,getActiveId,onOpen,onCopy,onArchive,onNew}) {
  const ui=dialog('Mine prosjekter');ui.root.classList.add('project-library');
  ui.body.innerHTML='<p>Lagret i denne nettleseren. Bruk «Lagre prosjektfil som …» for en kopi du kan flytte eller sikkerhetskopiere.</p><div class="project-library-tools"><input class="input-control" aria-label="Søk i prosjekter" placeholder="Søk etter prosjekt …"/><label><input type="checkbox"/> Vis arkiverte</label><button class="btn btn-primary" data-new>Nytt prosjekt</button></div><div class="project-cards"></div>';
  const search=ui.body.querySelector('input[type="text"],input:not([type])'),archived=ui.body.querySelector('[type="checkbox"]'),cards=ui.body.querySelector('.project-cards');let records=[];
  const run=async fn=>{try{await fn()}catch(e){ui.error(e)}};
  async function refresh(){records=await list();render()}
  function render(){
    cards.replaceChildren();const shown=records.filter(r=>Boolean(r.archived)===archived.checked&&(r.projectName||'').toLocaleLowerCase().includes(search.value.toLocaleLowerCase()));
    for(const r of shown){const card=document.createElement('article');card.className='project-card';card.dataset.projectId=r.projectId;const preview=document.createElement('div');preview.className='project-thumbnail';preview.append(thumbnail(r.shapes));card.append(preview);const name=document.createElement('h3');name.textContent=r.projectName||'Uten navn';card.append(name);const stamp=document.createElement('p');stamp.textContent=(r.projectId===getActiveId()?'Åpent · ':'')+new Date(r.savedAt).toLocaleString('nb-NO',{dateStyle:'short',timeStyle:'short'});card.append(stamp);const actions=document.createElement('div');actions.className='project-card-actions';
      const button=(label,fn)=>{const b=document.createElement('button');b.className='btn';b.textContent=label;b.onclick=()=>run(fn);actions.append(b);return b};
      if(!r.archived){button('Åpne',async()=>{if(await onOpen(r.projectId))ui.close()});button('Lag kopi',async()=>{if(await onCopy(r.projectId))ui.close()});}
      const archive=button(r.archived?'Gjenopprett':'Arkiver',async()=>{await onArchive(r.projectId,!r.archived);await refresh()});archive.disabled=r.projectId===getActiveId();if(archive.disabled)archive.title='Åpne et annet prosjekt før du arkiverer dette.';card.append(actions);cards.append(card);
    }
    if(!shown.length){const p=document.createElement('p');p.textContent=archived.checked?'Ingen arkiverte prosjekter.':'Ingen prosjekter å vise.';cards.append(p)}
  }
  search.oninput=render;archived.onchange=render;ui.body.querySelector('[data-new]').onclick=()=>run(async()=>{if(await onNew())ui.close()});await run(refresh);search.focus();
}
export function chooseDocumentOutput(onOutput) {
  const ui=dialog('Arbeidstegning – eksporter eller skriv ut');ui.body.innerHTML='<label>Handling<select id="project-output-kind" class="select-control"><option value="pdf">Lagre som PDF</option><option value="print">Skriv ut</option><option value="svg">SVG av dette arket</option></select></label><label>Omfang<select id="project-output-scope" class="select-control"><option value="all">Hele dokumentet</option><option value="current">Dette arket</option></select></label><p>PDF og utskrift åpner nettleserens utskriftsvindu. Velg PDF eller skriver der.</p><button class="btn btn-primary" data-output>Fortsett</button>';
  const kind=ui.body.querySelector('#project-output-kind'),scope=ui.body.querySelector('#project-output-scope');kind.onchange=()=>{scope.disabled=kind.value==='svg';if(scope.disabled)scope.value='current'};
  ui.body.querySelector('[data-output]').onclick=()=>{try{onOutput(kind.value,scope.value);ui.close()}catch(e){ui.error(e)}};
}

export function projectControlVisible(el){if(!el.getClientRects().length||el.closest('[hidden]'))return false;for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope > summary')?.contains(el))return false;return true;}
