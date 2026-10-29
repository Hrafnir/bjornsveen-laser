import {createDrawingDocument} from '../js/drawing-model.js';
import {serializeProjectDocument,createProjectHandleStore} from '../js/project-document.js';
import {createWorkspaceStorage} from '../js/storage.js';
import {encodeClipboard} from '../js/object-commands.js';
const frame=document.querySelector('#editor'),pause=ms=>new Promise(r=>setTimeout(r,ms)),store=createWorkspaceStorage();let w,d,passed=0,failed=0;
const $=id=>d.getElementById(id),assert=(v,m='Assertion failed')=>{if(!v)throw Error(m)};
async function wait(fn){for(let i=0;i<250;i++){if(await fn())return;await pause(20)}throw Error('Timed out')}
async function test(name,fn){const li=document.createElement('li');document.querySelector('#results').append(li);try{await fn();li.className='pass';li.textContent='PASS: '+name;passed++}catch(e){li.className='fail';li.textContent='FAIL: '+name+' — '+e.stack;failed++}}
async function boot(){await new Promise(r=>{frame.onload=r;frame.src='../index.html?drawing-sync='+Date.now()});w=frame.contentWindow;d=frame.contentDocument;await wait(()=>$('save-status')&&!$('save-status').textContent.includes('Åpner'));await pause(300)}
const rect=(id,width=80)=>({id,name:id,type:'rect',x:20,y:20,width,height:40,rotation:0,laserMode:'cut'});
async function openFile(name,shapes,workDrawing=null){const transfer=new w.DataTransfer();transfer.items.add(new w.File([serializeProjectDocument({projectName:name,shapes,workDrawing})],name+'.laserprosjekt',{type:'application/json'}));$('project-document-input').files=transfer.files;$('project-document-input').dispatchEvent(new w.Event('change'));await wait(()=>{d.querySelector('.project-dialog [data-keep]')?.click();return $('project-current-name').textContent===name&&!$('project-file-status').textContent.includes('Behandler')});await pause(300)}
const edit=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));$(id).blur()};
const paste=shapes=>{d.activeElement?.blur();const clipboardData=new w.DataTransfer();clipboardData.setData('text/plain',encodeClipboard(shapes));d.dispatchEvent(new w.ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true}))};
const close=()=>{if($('drawing-modal')?.classList.contains('open'))$('dw-close').click()};
const open=()=>{close();$('btn-work-drawing').click()};
const parts=()=>$('dw-canvas').querySelectorAll('[data-drawing-item]').length;
const saved=async()=>{await pause(350);return store.loadWorkspaceFromLocal()};
await createProjectHandleStore().clear();await boot();
await test('Opening an empty drawing then adding artwork populates it without a manual refresh',async()=>{
 await openFile('Tom start',[]);open();assert(parts()===0);edit('dw-title','Behold tittelen');edit('dw-notes','Monter delene med lim.');close();paste([rect('Ny plate')]);open();assert(parts()===1,'drawing stayed empty after adding a source');assert($('dw-title').value==='Behold tittelen');assert($('dw-notes').value==='Monter delene med lim.');
});
await test('New parts and changed dimensions update while custom layout, notes and dimensions survive',async()=>{
 const shape=rect('Dokumentert plate'),doc=createDrawingDocument([shape],{thicknessMm:3},'MDF');doc.items[0].x=150;doc.items[0].assemblyX=210;doc.notes='Behold merknad';doc.dimensions=[{id:'width',kind:'horizontal',a:{itemId:doc.items[0].id,u:0,v:0},b:{itemId:doc.items[0].id,u:1,v:0},offset:10}];
 await openFile('Endringer',[shape],doc);close();d.querySelector('#shapes-layer [data-id="Dokumentert plate"]').dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true,button:0}));
 // Select all through the real keyboard handler and edit the selected width.
 d.activeElement?.blur();w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'a',metaKey:true,bubbles:true}));edit('prop-w','120');paste([rect('Ny del',25)]);open();assert(parts()===2,'new part missing');assert($('dw-dimensions').textContent.includes('120 mm'),'dimension did not follow edited geometry');const state=await saved();assert(state.workDrawing.items[0].x===150&&state.workDrawing.items[0].assemblyX===210);assert(state.workDrawing.notes==='Behold merknad');
});
await test('Deliberately removed parts stay removed on reopen; fetch all restores them',async()=>{
 await openFile('Utelatte',[rect('A'),rect('B',30)]);open();$('dw-remove').click();assert(parts()===1);close();open();assert(parts()===1,'removed part was resurrected');$('dw-sync').click();assert(parts()===2,'explicit fetch did not restore removed part');
});
await test('Old saved empty documents repair on open and survive reload',async()=>{
 const doc=createDrawingDocument([]);doc.title='Eldre dokument';doc.notes='Ikke slett';await openFile('Gammelt tomt',[rect('Gjenopprettet')],doc);open();assert(parts()===1,'old empty document was not repaired');close();await saved();await boot();open();assert(parts()===1);assert($('dw-title').value==='Eldre dokument'&&$('dw-notes').value==='Ikke slett');
});
await test('Switching files while the drawing is open replaces geometry and metadata',async()=>{
 const first=rect('Prosjekt A'),docA=createDrawingDocument([first]);docA.title='Dokument A';await openFile('Prosjekt A',[first],docA);open();const stateA=await saved();
 const second=rect('Prosjekt B',130),docB=createDrawingDocument([]);docB.title='Dokument B';await openFile('Prosjekt B',[second],docB);assert($('drawing-modal').classList.contains('open'));assert($('dw-title').value==='Dokument B');assert(parts()===1&&$('dw-parts').textContent.includes('Prosjekt B')&&!$('dw-parts').textContent.includes('Prosjekt A'));
 // Switch back through the menu in the drawing, not just the canvas file input.
 d.querySelector('#dw-project-menu [data-project-action="library"]').click();await wait(()=>d.querySelector(`.project-card[data-project-id="${stateA.projectId}"]`));const card=d.querySelector(`.project-card[data-project-id="${stateA.projectId}"]`);[...card.querySelectorAll('button')].find(b=>b.textContent==='Åpne').click();await wait(()=>{d.querySelector('.project-dialog [data-keep]')?.click();return !d.querySelector('.project-library')});assert($('dw-title').value==='Dokument A');assert(parts()===1&&$('dw-parts').textContent.includes('Prosjekt A')&&!$('dw-parts').textContent.includes('Prosjekt B'));
});
await test('New source geometry appears in SVG documentation from the shared project menu',async()=>{
 close();paste([rect('Ekstra plate',25)]);open();let download;const old=w.HTMLAnchorElement.prototype.click;w.HTMLAnchorElement.prototype.click=function(){if(this.download)download=w.fetch(this.href).then(r=>r.text())};
 try{d.querySelector('#dw-project-menu [data-project-action="document"]').click();edit('project-output-kind','svg');d.querySelector('.project-dialog [data-output]').click();assert(download,'no SVG generated');const svg=await download;assert(svg.includes('Ekstra plate'),'export omitted added part')}finally{w.HTMLAnchorElement.prototype.click=old}
});
document.querySelector('#summary').textContent=`${passed} bestått, ${failed} feilet`;
