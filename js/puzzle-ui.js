import { generateJigsawPuzzle, buildImagePuzzle, imagePuzzlePoint, PUZZLE_STYLES } from './puzzle-generator.js';
import { detectPuzzleSilhouette, loadPuzzleImagePixels } from './puzzle-image.js';
import { shapeToWorldPolygons, pathNodesInWorld } from './geometry.js';
import { refreshBitmapShapeDataUrl, processBitmapElementToDataUrl } from './icons.js';
import { renderShapesPreviewSvg } from './generators.js';

export function renderPuzzleWorkshop(container,{images=[],initialImage=null,customOutline=null,editingGroup=null,parseNumber,onChange,bitmapMode='Jarvis'}={}) {
  const saved=editingGroup?.puzzleMeta||{};
  let seed=saved.seed||42,revision=0,timer;
  const cache=new Map();
  const field=(id,label,value)=>`<div class="prop-field"><label for="${id}">${label}</label><input id="${id}" class="input-control math-input" inputmode="decimal" value="${value}" /></div>`;
  container.innerHTML=`
    <div class="generator-controls">
      <div class="info-box">🧩 Bilde og kutt følger hverandre. Rekkefølge: <strong>gravering → vannrette → loddrette → ytterkontur</strong>.</div>
      <div class="prop-field"><label for="gen-puz-image">Bilde på arbeidsflaten</label><select id="gen-puz-image" class="select-control"><option value="">Uten bilde</option></select></div>
      <div class="box-help">Velg et bilde her, eller bruk «Lag puslespill av bildet» i bildeverktøyet. Bildet og kuttene samles i én gruppe.</div>
      <div class="prop-grid">
        ${field('gen-puz-w','Bredde (mm)',initialImage?.width||150)}${field('gen-puz-h','Høyde (mm)',initialImage?.height||110)}
        ${field('gen-puz-cols','Kolonner',saved.cols||4)}${field('gen-puz-rows','Rader',saved.rows||3)}
      </div>
      <label class="box-check"><input type="checkbox" id="gen-puz-lock" checked/> Behold bildets proporsjoner</label>
      <div class="prop-field"><label for="gen-puz-style">Brikketype</label><select id="gen-puz-style" class="select-control">${PUZZLE_STYLES.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select></div>
      <div class="prop-field"><label for="gen-puz-boundary">Ytterkontur</label><select id="gen-puz-boundary" class="select-control">
        <option value="auto">Automatisk – bildekant / transparens</option><option value="frame">Rektangulær bildekant</option><option value="rounded">Avrundede hjørner</option><option value="ellipse">Oval / sirkel</option><option value="silhouette">Motivsilhuett – ensfarget bakgrunn</option><option value="custom">Bruk valgt / redigert ytterkontur</option>
      </select></div>
      <div class="prop-grid">
        ${field('gen-puz-rx','Hjørneradius (mm)',saved.cornerRadiusMm??(initialImage?0:6))}
        ${field('gen-puz-inset','Kantinnrykk (mm)',saved.insetMm||0)}
        ${field('gen-puz-tab','Låsstørrelse (%)',saved.tabSizePct||22)}
        ${field('gen-puz-smooth','Konturforenkling (mm)',saved.smoothing??.25)}
      </div>
      <div class="box-help">Positivt innrykk flytter kanten innover, negativt gir en kant utenfor. Egen kontur: velg bildet og en lukket form før du åpner puslespill.</div>
      <div class="prop-field" id="gen-puz-bg-controls"><label for="gen-puz-tolerance">Bakgrunnstoleranse</label><input id="gen-puz-tolerance" type="range" min="5" max="100" value="${saved.tolerance||35}"/></div>
      <button id="btn-puz-randomize" class="btn" type="button">🎲 Ny brikkevariasjon</button>
      <div class="box-help">Silhuett bruker transparens eller sammenhengende ensfarget bakgrunn. Største ytterkontur beholdes; løse små motiver og innvendige hull brukes ikke som ytterkutt.</div>
      <div id="gen-puz-error" class="box-error" role="alert" hidden></div>
    </div>
    <div class="box-preview-column">
      <div class="generator-preview-box"><div id="gen-preview-svg" style="width:100%;height:100%"></div></div>
      <div id="gen-preview-caption" class="box-help" aria-live="polite"></div>
      <div class="box-help">For en fri ytterkurve: rediger ytterkonturen med Anker (A), og bruk «Endre puslespill» på gruppen. Velg «Bruk valgt / redigert ytterkontur» for å tilpasse brikkelinjene på nytt.</div>
    </div>`;
  const $=id=>container.querySelector('#'+id);
  for(const image of images){const option=document.createElement('option');option.value=image.id;option.textContent=image.name||'Bilde';$('gen-puz-image').append(option)}
  $('gen-puz-image').value=initialImage?.id||'';
  $('gen-puz-style').value=saved.pieceStyle||'classic';
  $('gen-puz-boundary').value=editingGroup&&customOutline?'custom':customOutline&&initialImage?'custom':initialImage?'auto':'rounded';
  if(editingGroup&&customOutline)$('gen-puz-inset').value=0; // Existing outline already includes the previous inset.
  $('gen-puz-boundary').querySelector('[value="custom"]').disabled=!customOutline;
  const imageSelect=$('gen-puz-image');
  const update=async()=>{
    if (!imageSelect.isConnected || $('gen-puz-image')!==imageSelect) return;
    const version=++revision;onChange(null);$('gen-puz-error').hidden=true;
    const source=images.find(s=>s.id===$('gen-puz-image').value),mode=$('gen-puz-boundary').value;
    $('gen-puz-rx').disabled=!['auto','rounded'].includes(mode);
    $('gen-puz-smooth').disabled=!source||!['auto','silhouette'].includes(mode);
    $('gen-puz-bg-controls').hidden=mode!=='silhouette';$('gen-puz-lock').disabled=!source;
    $('gen-puz-tab').disabled=['straight'].includes($('gen-puz-style').value);
    $('gen-preview-caption').textContent='Beregner forhåndsvisning …';
    try{
      const W=parseNumber($('gen-puz-w').value,NaN),H=parseNumber($('gen-puz-h').value,NaN);
      const options={widthMm:W,heightMm:H,cols:parseNumber($('gen-puz-cols').value,NaN),rows:parseNumber($('gen-puz-rows').value,NaN),cornerRadiusMm:['auto','rounded'].includes(mode)?parseNumber($('gen-puz-rx').value,NaN):0,tabSizePct:parseNumber($('gen-puz-tab').value,NaN),seed,pieceStyle:$('gen-puz-style').value,outlineType:mode==='ellipse'?'ellipse':'rounded',insetMm:parseNumber($('gen-puz-inset').value,NaN),boundaryMode:mode,smoothing:parseNumber($('gen-puz-smooth').value,NaN),tolerance:Number($('gen-puz-tolerance').value)};
      if(!Number.isFinite(options.smoothing)||options.smoothing<0||options.smoothing>5)throw Error('Konturforenkling må være mellom 0 og 5 mm.');
      let detection='';
      if(mode==='custom'){
        if(!customOutline)throw Error('Velg en lukket ytterkontur sammen med bildet først.');
        const toLocal=p=>{
          if(!source)return {...p};
          const q=imagePuzzlePoint(source,p,true);return{x:q.x*W/source.width,y:q.y*H/source.height};
        };
        options.outlineLoops=shapeToWorldPolygons(customOutline,.05).map(loop=>{const result=loop.map(toLocal);result.closed=loop.closed!==false;return result});
        if(customOutline.nodeModel==='bezier'&&customOutline.closedPath&&customOutline.nodes?.length){
          options.outlineNodes=pathNodesInWorld(customOutline).map(n=>({...n,...toLocal(n),...(n.in?{in:toLocal(n.in)}:{}),...(n.out?{out:toLocal(n.out)}:{})}));
        }
      } else if(['auto','silhouette'].includes(mode)&&source){
        if(!cache.has(source.id))cache.set(source.id,loadPuzzleImagePixels(source));
        const pixels=await cache.get(source.id);
        const found=detectPuzzleSilhouette(pixels,{widthMm:W,heightMm:H,mode,tolerance:options.tolerance,smoothing:options.smoothing});
        if(found.loops)options.outlineLoops=found.loops;
        detection=found.kind==='frame'?'Bildekanten er brukt.':found.kind==='transparency'?'Ytterkontur funnet fra transparens.':'Ytterkontur funnet fra bakgrunnen.';
      } else if(mode==='silhouette')throw Error('Velg et bilde for å finne motivets silhuett.');
      let shapes,plan=null;
      if(source){
        const group=buildImagePuzzle({...source,width:W,height:H},options),picture=group.children[0];
        await refreshBitmapShapeDataUrl(picture,null,{bitmapMode});
        if(editingGroup&&editingGroup.children.some(s=>s.id===source.id)){
          group.id=editingGroup.id;group.name=editingGroup.name;
          group.children.push(...editingGroup.children.filter(s=>s.id!==source.id&&!s.cutStage));
          plan={replaceId:editingGroup.id,removeIds:[]};
        }else plan={replaceId:source.id,removeIds:mode==='custom'&&customOutline?[customOutline.id]:[]};
        shapes=[group];
      }else { shapes=generateJigsawPuzzle(options); if(mode==='custom'&&customOutline)plan={replaceId:customOutline.id,removeIds:[]}; }
      if(version!==revision||!imageSelect.isConnected || $('gen-puz-image')!==imageSelect)return;
      const preview=source?JSON.parse(JSON.stringify(shapes)):shapes;
      if(source){const picture=shapes[0].children[0];preview[0].children[0].dataUrl=processBitmapElementToDataUrl(picture._cachedImg,{...picture.imageMeta,brightness:0,contrast:0,sharpness:50,invert:false,filter:'original',maxDimPx:750})}
      $('gen-preview-svg').innerHTML=renderShapesPreviewSvg(preview).svgHtml;
      $('gen-preview-caption').textContent=`${options.cols} × ${options.rows} rutenett. ${['auto','silhouette','ellipse','custom'].includes(mode)?'Konturen kan gi færre eller avskårne kantbrikker. ':''}${detection} ${source?'Bildet på arbeidsflaten oppdateres ved innsetting.':''}`;
      onChange({shapes,plan});
    }catch(error){if(version!==revision||!imageSelect.isConnected || $('gen-puz-image')!==imageSelect)return;$('gen-puz-error').textContent=error.message;$('gen-puz-error').hidden=false;$('gen-preview-svg').replaceChildren();$('gen-preview-caption').textContent='Rett innstillingene for å se forhåndsvisningen.';onChange(null)}
  };
  container.querySelectorAll('input,select').forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>{
    if(el.id==='gen-puz-image'){
      const source=images.find(s=>s.id===el.value);if(source){$('gen-puz-w').value=source.width;$('gen-puz-h').value=source.height;$('gen-puz-boundary').value='auto';$('gen-puz-rx').value=0}
    }
    const source=images.find(s=>s.id===$('gen-puz-image').value);
    if(source&&$('gen-puz-lock').checked&&['gen-puz-w','gen-puz-h'].includes(el.id)){
      const value=parseNumber(el.value,NaN);if(Number.isFinite(value))$(el.id==='gen-puz-w'?'gen-puz-h':'gen-puz-w').value=(value*(el.id==='gen-puz-w'?source.height/source.width:source.width/source.height)).toFixed(3);
    }
    clearTimeout(timer);++revision;onChange(null);timer=setTimeout(update,el.tagName==='SELECT'?0:180);
  }));
  $('btn-puz-randomize').addEventListener('click',()=>{seed=Math.floor(Math.random()*90000)+1;clearTimeout(timer);update()});
  update();
}
