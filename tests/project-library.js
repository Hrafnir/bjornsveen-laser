import { createWorkspaceStorage } from '../js/storage.js';
import { serializeProjectDocument,parseProjectDocument,createProjectHandleStore } from '../js/project-document.js';
import { createDrawingDocument } from '../js/drawing-model.js';
const frame=document.getElementById('editor'),pause=ms=>new Promise(r=>setTimeout(r,ms));let w,d,passed=0,failed=0;
const assert=(v,m='Assertion failed')=>{if(!v)throw Error(m)},$=id=>d.getElementById(id);
async function test(name,fn){const li=document.createElement('li');document.querySelector('#results').append(li);try{await fn();li.className='pass';li.textContent='PASS: '+name;passed++}catch(e){li.className='fail';li.textContent='FAIL: '+name+' — '+e.stack;failed++}}
const wait=async fn=>{for(let i=0;i<250&&!await fn();i++)await pause(20);assert(await fn(),'timed out')};
const store=createWorkspaceStorage();const readActive=()=>store.loadWorkspaceFromLocal();
const root=await navigator.storage.getDirectory(),a=await root.getFileHandle('library-a.laserprosjekt',{create:true}),b=await root.getFileHandle('library-b.laserprosjekt',{create:true});
const write=async(h,text)=>{const out=await h.createWritable();await out.write(text);await out.close()},read=async h=>(await h.getFile()).text();let picked=a;
window.testOpen=async()=>[picked];window.testSave=async()=>picked;
const html=(await(await fetch('../index.html')).text()).replace('<head>','<head><base href="'+new URL('../',location.href).href+'">').replace('<script type="module" src="js/app.js"></script>','<script>window.showOpenFilePicker=()=>parent.testOpen();window.showSaveFilePicker=()=>parent.testSave();</script><script type="module" src="js/app.js"></script>');
async function boot(){await new Promise(r=>{frame.onload=r;frame.srcdoc=html});w=frame.contentWindow;d=frame.contentDocument;await wait(()=>$('save-status')&&!$('save-status').textContent.includes('Åpner'));await pause(400)}
await createProjectHandleStore().clear();await boot();
const action=key=>d.querySelector(`#file-menu [data-project-action="${key}"]`).click();
const dialog=()=>[...d.querySelectorAll('.project-dialog')].at(-1);
const name=async value=>{await wait(()=>$('project-name-input'));$('project-name-input').value=value;dialog().querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait(()=>!$('project-name-input'));await pause(350)};
const library=async()=>{action('library');await wait(()=>d.querySelector('.project-card'));};
const closeLibrary=()=>d.querySelector('.project-library [data-close]').click();
const card=id=>d.querySelector(`.project-card[data-project-id="${id}"]`);
const clickCard=(id,label)=>[...card(id).querySelectorAll('button')].find(b=>b.textContent===label).click();
let original,copy,blank,fileA,fileB;
await test('Migrates current work into a named library entry and exposes one project menu',async()=>{
 original=await readActive();assert(original.projectId);assert((await store.listProjects()).some(p=>p.projectId===original.projectId));assert($('btn-save-project').closest('#file-menu'));assert($('btn-export-xcs').closest('#file-menu'));assert($('btn-preflight').hidden);await library();assert(card(original.projectId).querySelector('svg path'),'thumbnail missing');closeLibrary();
});
await test('New project starts empty, retains settings and cannot undo into the previous project',async()=>{
 action('new');await name('Tomt prosjekt');blank=await readActive();assert(blank.projectId!==original.projectId);assert(blank.shapes.length===0);assert(blank.bedWidth===original.bedWidth);assert($('btn-undo').disabled);assert((await store.getProject(original.projectId)).shapes.length===original.shapes.length);
});
await test('Library opens the original; copies and names are independent and persist on reload',async()=>{
 await library();clickCard(original.projectId,'Åpne');await wait(()=>!d.querySelector('.project-library'));action('copy');await name('Kopi for test');copy=await readActive();assert(copy.projectId!==original.projectId);assert(JSON.stringify(copy.shapes)===JSON.stringify(original.shapes));action('rename');await name('Endret kopi');assert((await store.getProject(original.projectId)).projectName===original.projectName);await boot();assert($('project-current-name').textContent==='Endret kopi');
});
await test('Archive is reversible, searchable and preserves complete project data',async()=>{
 await library();clickCard(original.projectId,'Arkiver');await wait(()=>!card(original.projectId));d.querySelector('.project-library [type="checkbox"]').click();await wait(()=>card(original.projectId));clickCard(original.projectId,'Gjenopprett');await wait(()=>!card(original.projectId));d.querySelector('.project-library [type="checkbox"]').click();await wait(()=>card(original.projectId));const search=d.querySelector('.project-library-tools > input');search.value='Endret kopi';search.dispatchEvent(new w.Event('input'));assert(d.querySelectorAll('.project-card').length===1);assert(JSON.stringify((await store.getProject(original.projectId)).shapes)===JSON.stringify(original.shapes));closeLibrary();
});
await test('File opening, cancellation and save-before-switch use one guarded workflow',async()=>{
 const shape={id:'plate',type:'rect',name:'Plate',x:10,y:10,width:80,height:40,laserMode:'cut'};const data={shapes:[shape],projectName:'Fil A',machineKey:'custom',bedWidth:300,bedHeight:200,laserSettings:{presetKey:'mdf-3mm',cut:{power:75,speed:30}},workDrawing:createDrawingDocument([shape],{thicknessMm:3},'MDF')};
 await write(a,serializeProjectDocument(data));await write(b,serializeProjectDocument({...data,projectName:'Fil B'}));picked=a;action('open');await wait(()=>$('project-file-status').textContent.includes('library-a'));await pause(350);fileA=await readActive();action('rename');await name('Fil A endret');assert($('project-file-status').textContent.includes('Ulagrede'));
 action('new');await name('Avbrytes');await wait(()=>d.querySelector('[data-cancel]'));d.querySelector('[data-cancel]').click();assert($('project-current-name').textContent==='Fil A endret');
 picked=b;action('open');await wait(()=>d.querySelector('[data-save]'));d.querySelector('[data-save]').click();await wait(()=>$('project-current-name').textContent==='Fil B');await pause(350);fileB=await readActive();assert(parseProjectDocument(await read(a)).projectName==='Fil A endret','outgoing file not saved');assert(fileA.projectId!==fileB.projectId);
});
await test('Library restores the right file handle and Cmd+S never writes to the other project',async()=>{
 await library();clickCard(fileA.projectId,'Åpne');await wait(()=>!d.querySelector('.project-library'));assert($('project-file-status').textContent.includes('library-a'));action('rename');await name('Fil A via bibliotek');d.body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'s',metaKey:true,bubbles:true,cancelable:true}));await wait(async()=>parseProjectDocument(await read(a)).projectName==='Fil A via bibliotek');assert(parseProjectDocument(await read(b)).projectName==='Fil B');
});
await test('Work drawing has the same menu and output choices without extra save/export buttons',async()=>{
 $('btn-work-drawing').click();assert($('dw-save').closest('#dw-project-menu'));assert($('dw-export-svg').closest('[hidden]'));$('dw-project-menu').querySelector('[data-project-action="document"]').click();await wait(()=>$('project-output-kind'));assert($('project-output-scope').value==='all');$('project-output-kind').value='svg';$('project-output-kind').dispatchEvent(new w.Event('change'));assert($('project-output-scope').disabled&&$('project-output-scope').value==='current');dialog().querySelector('[data-close]').click();$('dw-close').click();
});
await test('Project menu, library cards and dialogs fit 320px and 390px',async()=>{
 const within=el=>{const r=el.getBoundingClientRect();assert(r.left>=-1&&r.right<=w.innerWidth+1,`${el.textContent} outside ${w.innerWidth}`)};
 for(const width of [320,390]){frame.style.width=width+'px';await pause(120);$('file-menu').open=true;within($('file-menu').querySelector('.header-menu-content'));await library();for(const el of d.querySelectorAll('.project-library button,.project-library input,.project-card'))within(el);closeLibrary();action('new');await wait(()=>$('project-name-input'));within(dialog().querySelector('.modal-window'));dialog().querySelector('[data-close]').click();}
 frame.style.width='1280px';
});
// Storage-specific regression cases use an isolated database and journal key.
await test('Project snapshots preserve images, notes and independent empty projects atomically',async()=>{
 const isolated=createWorkspaceStorage({databaseName:'project-library-storage-tests',legacyKey:'project-library-storage-tests',onStatus:()=>{}});
 const first={projectId:'a',projectName:'A',shapes:[{id:'img',type:'image',srcDataUrl:'data:image/png;base64,'+'x'.repeat(2000000)}],workDrawing:{title:'Notat',notes:'Monter her'},laserSettings:{processingOrder:['custom']}};
 isolated.saveWorkspaceToLocal(first);assert(await isolated.flushWorkspaceSave());isolated.saveWorkspaceToLocal({projectId:'b',projectName:'B',shapes:[]});assert(await isolated.flushWorkspaceSave());assert((await isolated.getProject('a')).shapes[0].srcDataUrl===first.shapes[0].srcDataUrl);assert((await isolated.getProject('a')).workDrawing.notes==='Monter her');assert((await isolated.getProject('b')).shapes.length===0);await isolated.archiveProject('a');assert((await isolated.getProject('a')).archived);await isolated.archiveProject('a',false);assert(!(await isolated.getProject('a')).archived);
});
await test('Failed writes report failure so project replacement can stop without discarding recovery',async()=>{
 const broken=createWorkspaceStorage({legacyKey:'failed-project-test',openDatabase:()=>Promise.reject(Error('Disk full')),onStatus:()=>{}});broken.saveWorkspaceToLocal({projectId:'failed',shapes:[{id:'keep'}]});assert(await broken.flushWorkspaceSave()===false);assert(localStorage.getItem('failed-project-test_pending_v3').includes('keep'));localStorage.removeItem('failed-project-test_pending_v3');
});
document.querySelector('#summary').textContent=`${passed} bestått, ${failed} feilet`;
