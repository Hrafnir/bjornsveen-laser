import { serializeProjectDocument, parseProjectDocument, createProjectHandleStore } from '../js/project-document.js';
import { createDrawingDocument } from '../js/drawing-model.js';
import { ensureOnePager } from '../js/drawing-page-layout.js';
const frame=document.getElementById('editor'),pause=ms=>new Promise(r=>setTimeout(r,ms));let w,d,passed=0,failed=0;
const assert=(v,m='Assertion failed')=>{if(!v)throw Error(m)};
async function test(name,fn){const li=document.createElement('li');document.querySelector('#results').append(li);try{await fn();li.className='pass';li.textContent='PASS: '+name;passed++}catch(e){li.className='fail';li.textContent='FAIL: '+name+' — '+e.stack;failed++}}
const $=id=>d.getElementById(id),edit=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));$(id).blur()};
const wait=async predicate=>{for(let i=0;i<200&&!await predicate();i++)await pause(20);assert(await predicate(),'timed out')};
const root=await navigator.storage.getDirectory(),a=await root.getFileHandle('test-a.laserprosjekt',{create:true}),b=await root.getFileHandle('test-b.laserprosjekt',{create:true});
const write=async(handle,text)=>{const out=await handle.createWritable();await out.write(text);await out.close()},read=async handle=>(await handle.getFile()).text();
const shape={id:'fileplate',type:'rect',name:'Plate',x:10,y:20,width:100,height:60,rotation:0,laserMode:'cut'},state={shapes:[shape],machineKey:'custom',bedWidth:500,bedHeight:300,snapMm:.5,objectSnap:true,laserSettings:{presetKey:'mdf-3mm',thicknessMm:3},workDrawing:createDrawingDocument([shape],{thicknessMm:3},'MDF')};
ensureOnePager(state.workDrawing);state.workDrawing.title='Prosjekt fra lokal fil';state.workDrawing.annotations[0].text='Lim sammen delene og puss kantene.';
await write(a,serializeProjectDocument(state));await write(b,'');await createProjectHandleStore().clear();
let picked=a,savePicks=0,openPicks=0;
window.testSave=async()=>{savePicks++;if(!picked)throw new DOMException('Cancelled','AbortError');return picked};window.testOpen=async()=>{openPicks++;return [picked]};
const html=(await(await fetch('../index.html')).text()).replace('<head>','<head><base href="'+new URL('../',location.href).href+'">').replace('<script type="module" src="js/app.js"></script>','<script>window.showOpenFilePicker=()=>parent.testOpen();window.showSaveFilePicker=()=>parent.testSave();</script><script type="module" src="js/app.js"></script>');
async function boot(){await new Promise(resolve=>{frame.onload=resolve;frame.srcdoc=html});w=frame.contentWindow;d=frame.contentDocument;await wait(()=>$('save-status')&&!$('save-status').textContent.includes('Åpner'));await pause(150)}
await boot();
await test('Open uses native handle and restores the complete editable document',async()=>{
 $('btn-open-project-file').click();await wait(()=>$('project-file-status').textContent.includes('test-a.laserprosjekt'));assert(openPicks===1);assert($('bed-width-input').value==='500');$('btn-work-drawing').click();assert($('dw-title').value===state.workDrawing.title);assert($('dw-canvas').textContent.includes('Lim sammen'));assert($('dw-canvas').textContent.includes('Ark 1/1'));
});
await test('Cmd+S writes changed annotations into the same file without a save picker',async()=>{
 edit('dw-title','Endret prosjekt');assert($('dw-file-status').textContent.includes('Ulagrede'));$('dw-canvas').dispatchEvent(new w.KeyboardEvent('keydown',{key:'s',metaKey:true,bubbles:true,cancelable:true}));await wait(async()=>parseProjectDocument(await read(a)).workDrawing.title==='Endret prosjekt');assert(savePicks===0);await wait(()=>!$('dw-file-status').textContent.includes('Behandler'));assert(!$('dw-file-status').textContent.includes('Ulagrede'));
});
await test('Reload reconnects the local file and saves a second edit to it',async()=>{
 await pause(350);await boot();$('btn-work-drawing').click();assert($('dw-file-status').textContent.includes('test-a.laserprosjekt'));assert($('dw-title').value==='Endret prosjekt');edit('dw-title','Etter gjenåpning');$('dw-save').click();await wait(async()=>parseProjectDocument(await read(a)).workDrawing.title==='Etter gjenåpning');assert(savePicks===0);
});
await test('Save As changes the active file and leaves the original intact',async()=>{
 picked=b;$('dw-save-as').click();await wait(()=>$('dw-file-status').textContent.includes('test-b.laserprosjekt'));assert(savePicks===1);edit('dw-title','Ny kopi');$('dw-save').click();await wait(async()=>parseProjectDocument(await read(b)).workDrawing.title==='Ny kopi');assert(parseProjectDocument(await read(a)).workDrawing.title==='Etter gjenåpning');
});
await test('Save shortcut works from an inspector text field',async()=>{
 $('dw-close').click();const field=$('bed-width-input');field.focus();field.dispatchEvent(new w.KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}));await wait(()=>!$('btn-save-project').disabled);assert(savePicks===1);$('btn-work-drawing').click();assert($('dw-file-status').textContent.includes('test-b.laserprosjekt'));
});
await test('Conflicting disk edits remain intact and are reported instead of overwritten',async()=>{
 await wait(()=>!$('dw-save').disabled);await write(b,'External edit');edit('dw-title','Mine endringer');$('dw-save').click();await wait(()=>$('dw-file-status').textContent.includes('Ikke lagret'));assert(await read(b)==='External edit');assert($('dw-file-status').textContent.includes('Ulagrede'));
});
await test('Cancelling Save As keeps the current unsaved document',async()=>{
 picked=null;$('dw-save-as').click();await wait(()=>!$('dw-save-as').disabled);assert($('dw-title').value==='Mine endringer');assert($('dw-file-status').textContent.includes('test-b.laserprosjekt'));assert($('dw-file-status').textContent.includes('Ulagrede'));
});
await createProjectHandleStore().clear();
document.getElementById('summary').textContent=`${passed} bestått, ${failed} feilet`;
