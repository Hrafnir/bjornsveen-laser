import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeProjectDocument, parseProjectDocument, createLocalProject, projectSnapshot } from '../js/project-document.js';
import { createDrawingDocument } from '../js/drawing-model.js';
import { ensureOnePager, drawingPageKey } from '../js/drawing-page-layout.js';
import { drawingPages, renderDrawingSheet, drawingPrintHtml } from '../js/drawing-renderer.js';
const initial=()=>{const shapes=[{id:'plate',type:'rect',x:0,y:0,width:100,height:60,laserMode:'cut'}];return {shapes,workDrawing:createDrawingDocument(shapes,{thicknessMm:3},'MDF'),machineKey:'custom',bedWidth:500,bedHeight:300,snapMm:.5,objectSnap:true,laserSettings:{power:75,speed:30}}};
function fileHandle(name='design.laserprosjekt',text=''){
 const h={name,text,writes:0,aborts:0,fail:false,async getFile(){return {name,text:async()=>h.text}},async isSameEntry(other){return other===h},async createWritable(){let pending;return {async write(text){pending=text;h.writes++;if(h.onWrite)await h.onWrite()},async close(){if(h.fail)throw Error('Disk full');h.text=pending},async abort(){h.aborts++}}}};return h;
}
function fixture(options={}){let state=initial(),downloads=[];const manager=createLocalProject({getWorkspace:()=>state,applyWorkspace:w=>state=w,download:(text,name)=>downloads.push({text,name}),...options});return {manager,get state(){return state},downloads};}
test('portable project retains full images, vectors, document and settings without render caches',()=>{
 const state=initial();state.shapes.push({id:'group',type:'group',children:[{id:'image',type:'image',srcDataUrl:'data:image/png;base64,FULL',dataUrl:'data:image/png;base64,CROP',_cachedImage:{},xcsDataUrl:'lossy'}]});ensureOnePager(state.workDrawing);
 const raw=serializeProjectDocument(state),loaded=parseProjectDocument(raw);
 assert.equal(loaded.shapes[1].children[0].srcDataUrl,'data:image/png;base64,FULL');assert.ok(!raw.includes('_cached'));assert.ok(!raw.includes('lossy'));assert.ok(loaded.workDrawing.onePager);assert.equal(loaded.workDrawing.annotations.length,1);assert.equal(loaded.bedWidth,500);assert.equal(loaded.laserSettings.power,75);assert.ok(!raw.includes('handle'));
});
test('one pager retains editable notes and dimensions without removing detail sheets',()=>{
 const state=initial(),doc=state.workDrawing,summary=ensureOnePager(doc);summary.text='Lim og monter delene.';const again=ensureOnePager(doc);assert.equal(again.id,summary.id);assert.equal(doc.annotations.length,1);assert.equal(again.text,summary.text);
 const pages=drawingPages(doc,state.shapes);assert.equal(pages[0].kind,'onepager');assert.equal(drawingPageKey(pages[0]),'onepager');assert.ok(pages.some(p=>p.kind==='detail'));
 const svg=renderDrawingSheet(doc,state.shapes,pages[0]);for(const text of ['Måltegning','Materialvisning','Lim og monter','100','60','Ark 1/1','MDF'])assert.ok(svg.includes(text),text);
 const html=drawingPrintHtml(doc,[svg]);assert.equal((html.match(/class="sheet"/g)||[]).length,1);
 summary.text='Lang tekst '.repeat(290);assert.throws(()=>renderDrawingSheet(doc,state.shapes,pages[0]),/ikke plass/);
});
test('invalid input cannot replace the active workspace or file',async()=>{
 const h=fileHandle(),f=fixture({pickSave:async()=>h});await f.manager.save();const before=projectSnapshot(f.state);
 for(const text of ['{',JSON.stringify({format:'wrong'}),serializeProjectDocument({...f.state,shapes:[f.state.shapes[0],f.state.shapes[0]]}),serializeProjectDocument({...f.state,projectName:{bad:true}})])await assert.rejects(f.manager.openFile({name:'bad',text:async()=>text}));
 assert.equal(projectSnapshot(f.state),before);assert.equal(f.manager.status().name,h.name);assert.equal(f.manager.status().busy,false);
});
test('save writes repeatedly to same file and marks only committed snapshots as saved',async()=>{
 const h=fileHandle();let picks=0;const f=fixture({pickSave:async()=>{picks++;return h}});await f.manager.save();assert.equal(picks,1);assert.equal(f.manager.status().dirty,false);
 f.state.workDrawing.title='Endret';assert.equal(f.manager.status().dirty,true);await f.manager.save();assert.equal(picks,1);assert.equal(h.writes,2);assert.equal(parseProjectDocument(h.text).workDrawing.title,'Endret');assert.equal(f.manager.status().dirty,false);
 h.onWrite=()=>{f.state.workDrawing.notes='Changed during write'};await f.manager.save();assert.equal(f.manager.status().dirty,true);
});
test('cancelled Save As and failed writes preserve the original binding and dirty state',async()=>{
 const a=fileHandle('a.laserprosjekt'),b=fileHandle('b.laserprosjekt');let picked=a;const f=fixture({pickSave:async()=>{if(!picked)throw new DOMException('Cancelled','AbortError');return picked}});await f.manager.save();f.state.workDrawing.title='New';picked=null;assert.equal(await f.manager.save({as:true}),false);assert.equal(f.manager.status().name,a.name);assert.equal(f.manager.status().dirty,true);
 b.fail=true;picked=b;await assert.rejects(f.manager.save({as:true}),/Disk full/);assert.equal(f.manager.status().name,a.name);assert.equal(f.manager.status().dirty,true);assert.equal(b.aborts,1);b.fail=false;await f.manager.save({as:true});assert.equal(f.manager.status().name,b.name);
});
test('external edits are not overwritten; Save As can preserve both versions',async()=>{
 const a=fileHandle('a.laserprosjekt'),b=fileHandle('b.laserprosjekt');let picked=a;const f=fixture({pickSave:async()=>picked});await f.manager.save();a.text='external changes';f.state.workDrawing.title='My edits';await assert.rejects(f.manager.save(),/endret utenfor/);assert.equal(a.text,'external changes');picked=b;await f.manager.save({as:true});assert.equal(f.manager.status().dirty,false);assert.equal(parseProjectDocument(b.text).workDrawing.title,'My edits');assert.equal(a.text,'external changes');
});
test('opening local file and restoring the binding support subsequent saves',async()=>{
 const a=fileHandle('existing.laserprosjekt',serializeProjectDocument(initial()));let record;const store={read:async()=>record,write:async value=>{record=value},clear:async()=>{record=null}};
 const f=fixture({pickOpen:async()=>[a],handleStore:store});await f.manager.open();assert.ok(f.manager.status().connected);f.state.workDrawing.title='Opened';await f.manager.save();assert.equal(parseProjectDocument(a.text).workDrawing.title,'Opened');
 const g=fixture({handleStore:store});await g.manager.restore();assert.equal(g.manager.status().name,a.name);assert.equal(g.manager.status().dirty,true);await g.manager.save();assert.equal(a.writes,2);assert.equal(g.manager.status().dirty,false);g.manager.detach();assert.equal(g.manager.status().connected,false);
});
test('fallback provides a complete editable copy and reports no direct connection',async()=>{
 const f=fixture();await f.manager.save();assert.equal(f.downloads.length,1);assert.ok(f.downloads[0].name.endsWith('.laserprosjekt'));assert.equal(parseProjectDocument(f.downloads[0].text).shapes.length,1);assert.equal(f.manager.status().connected,false);assert.match(f.manager.status().message,/kopi/);f.state.workDrawing.title='Changed';assert.equal(f.manager.status().dirty,true);
});
test('declining to replace a dirty document preserves both workspace and binding',async()=>{
 const f=fixture({canReplace:()=>false}),before=projectSnapshot(f.state);assert.equal(await f.manager.openFile({name:'new.laserprosjekt',text:async()=>serializeProjectDocument(initial())}),false);assert.equal(projectSnapshot(f.state),before);assert.equal(f.manager.status().name,'');
});
test('denied write access preserves the file and failed save stays dirty',async()=>{
 const h=fileHandle(),f=fixture({pickSave:async()=>h});await f.manager.save();const before=h.text;f.state.workDrawing.title='Unsaved';h.requestPermission=async()=>'denied';await assert.rejects(f.manager.save(),/Skrivetilgang/);assert.equal(h.text,before);assert.equal(f.manager.status().dirty,true);assert.equal(f.manager.status().busy,false);
});
test('a pending open serializes other file operations',async()=>{
 const h=fileHandle('open.laserprosjekt',serializeProjectDocument(initial()));let resolve;const f=fixture({pickOpen:()=>new Promise(r=>resolve=r)}),opening=f.manager.open();assert.equal(f.manager.status().busy,true);assert.equal(await f.manager.save(),false);resolve([h]);await opening;assert.equal(f.manager.status().busy,false);assert.equal(f.manager.status().name,h.name);
});
test('Save As falls back to a new downloaded copy when a restored handle has no picker',async()=>{
 const h=fileHandle('original.laserprosjekt',serializeProjectDocument(initial()));let record={handle:h,name:h.name,diskText:h.text,savedSnapshot:projectSnapshot(initial())};const f=fixture({handleStore:{read:async()=>record,clear:async()=>record=null}});await f.manager.restore();f.state.workDrawing.title='New copy';await f.manager.save({as:true});assert.equal(f.downloads.length,1);assert.equal(h.writes,0);assert.equal(f.manager.status().connected,false);assert.equal(record,null);
});
test('save during the guarded open writes the outgoing file before installing the new workspace',async()=>{
 const a=fileHandle('a.laserprosjekt'),b=fileHandle('b.laserprosjekt',serializeProjectDocument(initial()));let picked=a,guard=false;
 const f=fixture({pickSave:async()=>a,pickOpen:async()=>[picked],canReplace:async({save}={})=>guard?await save():true});await f.manager.save();f.state.workDrawing.title='Before switching';picked=b;guard=true;
 assert.equal(await f.manager.open(),true);assert.equal(parseProjectDocument(a.text).workDrawing.title,'Before switching');assert.equal(f.manager.status().name,'b.laserprosjekt');
});
test('restored file bindings cannot leak from one named project into another',async()=>{
 const h=fileHandle('other.laserprosjekt'),f=fixture({handleStore:{read:async()=>({handle:h,name:h.name,diskText:'',savedSnapshot:'',projectId:'other'})}});
 f.state.projectId='current';await f.manager.restore();assert.equal(f.manager.status().connected,false);assert.equal(f.manager.status().name,'');
});
