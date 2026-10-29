import {serializeProjectDocument} from '../js/project-document.js';
import {createBitmapImageShape,refreshBitmapShapeDataUrl,prepareBitmapExports,processBitmapElementToDataUrl} from '../js/icons.js';
import {geometricImageBoundary,loadPuzzleImagePixels,detectPuzzleSilhouette} from '../js/puzzle-image.js';
import {buildImagePuzzle} from '../js/puzzle-generator.js';
import {getDefaultLaserSettings,buildLaserSvgString} from '../js/export.js';
import {buildXsProject} from '../js/xs-project.js';
import {readZip} from '../js/zip.js';
import {encodeClipboard} from '../js/object-commands.js';
const load=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src});
const assert=(v,m='Assertion failed')=>{if(!v)throw Error(m)},pause=ms=>new Promise(r=>setTimeout(r,ms));
let passed=0,failed=0;
async function test(name,fn){const li=document.createElement('li');document.querySelector('#results').append(li);try{await fn();li.className='pass';li.textContent='PASS: '+name;passed++}catch(e){li.className='fail';li.textContent='FAIL: '+name+' — '+e.stack;failed++}}
const c=document.createElement('canvas');c.width=1672;c.height=941;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle='black';for(let i=0;i<1600;i+=7){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+120,941);ctx.stroke()}
const img=await load(new URLSearchParams(location.search).get('image')||c.toDataURL());
// Convert the optional local fixture to a data URL, as the real file import does.
const sourceCanvas=document.createElement('canvas');sourceCanvas.width=img.naturalWidth;sourceCanvas.height=img.naturalHeight;sourceCanvas.getContext('2d').drawImage(img,0,0);const source=await load(sourceCanvas.toDataURL());
const shape=createBitmapImageShape(source,{widthMm:178,x:0,y:0,filter:'inherit',maskShape:'rounded',contrast:15});
await test('Detailed preview retains all 1672 pixels, fast preview is explicitly reduced, original remains intact',async()=>{
 assert((await load(shape.dataUrl)).naturalWidth===1672);const original=shape.srcDataUrl;
 shape.imageMeta.previewMode='fast';await refreshBitmapShapeDataUrl(shape);assert((await load(shape.dataUrl)).naturalWidth===750);
 shape.imageMeta.previewMode='original';await refreshBitmapShapeDataUrl(shape);assert((await load(shape.dataUrl)).naturalWidth===1672);assert(shape.srcDataUrl===original);
});
await test('Display mode never changes exported filter or resolution in SVG and native XS',async()=>{
 const settings=getDefaultLaserSettings();await prepareBitmapExports([shape],settings,true);const svgData=shape.exportDataUrl,xsData=shape.xcsDataUrl;
 assert((await load(svgData)).naturalWidth===1672);assert((await load(xsData)).naturalWidth===1672);
 shape.imageMeta.previewMode='fast';await refreshBitmapShapeDataUrl(shape);await prepareBitmapExports([shape],settings,true);assert(shape.exportDataUrl===svgData);assert(shape.xcsDataUrl===xsData);
 const doc=new DOMParser().parseFromString(buildLaserSvgString([shape]),'image/svg+xml');assert((await load(doc.querySelector('image').getAttribute('href'))).naturalWidth===1672);
 const zip=await readZip(buildXsProject([shape],{laserSettings:settings}));const entry=[...zip].find(([key])=>key.endsWith('/displays-0.json'));const bitmap=JSON.parse(new TextDecoder().decode(entry[1])).displays.find(s=>s.type==='BITMAP');assert((await load(bitmap.base64)).naturalWidth===1672);
});
const oldPixels=await loadPuzzleImagePixels(shape),oldOptions=detectPuzzleSilhouette(oldPixels,{widthMm:shape.width,heightMm:shape.height}),oldGroup=buildImagePuzzle(shape,{outlineLoops:oldOptions.loops});
const group=buildImagePuzzle(shape,geometricImageBoundary(shape,shape.width,shape.height));
await test('Known rounded mask bypasses raster tracing, retaining eight anchors and cubic export',()=>{assert(group.children[3].nodes.length===8);assert(group.children[3].d.includes('C'));assert(oldGroup.children[3].nodes.length>8)});
for(const [title,data,outline] of [['Før · 750 px og sporet pikselkant',processBitmapElementToDataUrl(source,{...shape.imageMeta,filter:'Jarvis',maxDimPx:750}),oldGroup.children[3]],['Etter · full detalj og jevn Bézier-kant',processBitmapElementToDataUrl(source,{...shape.imageMeta,filter:'Jarvis',maxDimPx:1672}),group.children[3]]]){
 const card=document.createElement('article');card.innerHTML=`<h2>${title}</h2><svg viewBox="125 55 55 48"><image href="${data}" x="0" y="0" width="${shape.width}" height="${shape.height}"/><path d="${outline.d}" fill="none" stroke="#ef2929" stroke-width=".3"/></svg>`;document.querySelector('#samples').append(card);
}
const frame=document.querySelector('#editor');await new Promise(r=>{frame.onload=r;frame.src='../index.html'});const w=frame.contentWindow,d=frame.contentDocument,$=id=>d.getElementById(id);
for(let i=0;i<250&&$('text-font-select').options.length<40;i++)await pause(20);
await pause(200);
const project=new w.DataTransfer();project.items.add(new w.File([serializeProjectDocument({shapes:[]})],'Bildekvalitet.laserprosjekt'));$('project-document-input').files=project.files;$('project-document-input').dispatchEvent(new w.Event('change'));
await wait(()=>$('project-file-status').textContent.includes('Bildekvalitet.laserprosjekt'));await pause(100);d.activeElement?.blur();
const transfer=new w.DataTransfer();transfer.setData('text/plain',encodeClipboard([{...shape,imageMeta:{...shape.imageMeta,previewMode:'detail'}}]));d.dispatchEvent(new w.ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));
const edit=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('change',{bubbles:true}))};
async function wait(fn){for(let i=0;i<250;i++){if(await fn())return;await pause(20)}throw Error('Timed out')}
await test('Actual inspector switches display quality and reports source pixels and physical DPI',async()=>{
 assert($('bmp-resolution-info').textContent.includes('1672'));assert($('bmp-resolution-info').textContent.includes('239 DPI'));
 edit('bmp-preview-select','fast');await wait(async()=> (await load(d.querySelector('#shapes-layer image').getAttribute('href'))).naturalWidth===750);
 edit('bmp-preview-select','original');await wait(async()=> (await load(d.querySelector('#shapes-layer image').getAttribute('href'))).naturalWidth===1672);
});
await test('Automatic puzzle workshop uses the geometric mask, with a smooth inserted outline',async()=>{
 $('btn-bmp-puzzle').click();await wait(()=>$('gen-puz-error')&&(!$('btn-modal-insert').disabled||!$('gen-puz-error').hidden));assert($('gen-puz-error').hidden,$('gen-puz-error').textContent);assert($('gen-preview-caption').textContent.includes('geometrisk'));$('btn-modal-insert').click();
 d.activeElement?.blur();const clipboardData=new w.DataTransfer();d.dispatchEvent(new w.ClipboardEvent('copy',{clipboardData,bubbles:true,cancelable:true}));const selected=JSON.parse(clipboardData.getData('text/plain')).shapes[0];assert(selected.children[3].nodes.length===8);
});
await test('Photo import suggests physical width from source pixels and selected DPI',async()=>{
 const file=new w.DataTransfer();file.items.add(new w.File([await(await fetch(source.src)).blob()],'Detaljbilde.png',{type:'image/png'}));
 $('file-import-input').files=file.files;$('file-import-input').dispatchEvent(new w.Event('change'));
 await wait(()=>$('trace-width')&&$('gen-preview-svg').querySelector('image'));
 assert(Math.abs(Number($('trace-width').value)-167.2)<.11,'import still uses fixed 75 mm');
 assert($('gen-preview-caption').textContent.includes('1672'));$('btn-modal-cancel').click();
});
document.querySelector('#summary').textContent=`${passed} bestått, ${failed} feilet`;
