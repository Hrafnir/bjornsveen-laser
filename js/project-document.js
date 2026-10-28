import { workspacePayload } from './storage.js';
import { normalizeDrawingDocument } from './drawing-model.js';
export const PROJECT_FORMAT='bjornsveen-laserstudio/project-document';
export const PROJECT_EXTENSION='.laserprosjekt';
const TYPES=new Set(['rect','ellipse','polygon','star','heart','line','path','text','image','group']);
export function projectSnapshot(state){return JSON.stringify(workspacePayload(state));}
export function serializeProjectDocument(state){return JSON.stringify({format:PROJECT_FORMAT,version:1,workspace:workspacePayload(state)},null,2);}
export function parseProjectDocument(text){
 let data;try{data=JSON.parse(text)}catch{throw Error('Prosjektfilen inneholder ikke gyldig JSON.');}
 if(data?.format!==PROJECT_FORMAT||data.version!==1||!Array.isArray(data.workspace?.shapes))throw Error('Dette er ikke et støttet LaserStudio-prosjektdokument.');
 const workspace=workspacePayload(data.workspace),ids=new Set();let count=0;
 function validate(s,depth=0){
  if(!s||!TYPES.has(s.type)||typeof s.id!=='string'||ids.has(s.id)||depth>40||++count>50000)throw Error('Prosjektfilen har ugyldige eller dupliserte objekter.');
  ids.add(s.id);
  for(const k of ['x','y','width','height','rotation'])if(s[k]!=null&&(!Number.isFinite(s[k])||(['width','height'].includes(k)&&s[k]<0)))throw Error('Prosjektfilen har ugyldige mål.');
  if(s.type==='group'){if(!Array.isArray(s.children))throw Error('Prosjektfilen har en ugyldig gruppe.');s.children.forEach(c=>validate(c,depth+1));}
 }
 workspace.shapes.forEach(s=>validate(s));
 for(const k of ['bedWidth','bedHeight'])if(workspace[k]!=null&&(!Number.isFinite(workspace[k])||workspace[k]<=0||workspace[k]>100000))throw Error('Prosjektfilen har ugyldig platestørrelse.');
 if(workspace.workDrawing)workspace.workDrawing=normalizeDrawingDocument(workspace.workDrawing,workspace.shapes,workspace.laserSettings||{});
 return workspace;
}
export const projectFilename=state=>(state.workDrawing?.title||'Mitt prosjekt').replace(/[^\p{L}\p{N}_-]+/gu,'-').slice(0,80)+PROJECT_EXTENSION;

// File handles live separately from the portable JSON and workspace undo history.
export function createProjectHandleStore(databaseName='laserstudio-project-file'){
 async function access(mode,fn){return new Promise((resolve,reject)=>{const request=indexedDB.open(databaseName,1);request.onupgradeneeded=()=>request.result.createObjectStore('session');request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Lukk andre faner og prøv igjen.'));request.onsuccess=()=>{const db=request.result,tx=db.transaction('session',mode);let value;try{const r=fn(tx.objectStore('session'));r.onsuccess=()=>value=r.result;}catch(e){db.close();reject(e);return;}tx.oncomplete=()=>{db.close();resolve(value)};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error)};};});}
 return {read:()=>access('readonly',s=>s.get('active')),write:value=>access('readwrite',s=>s.put(value,'active')),clear:()=>access('readwrite',s=>s.delete('active'))};
}
export function createLocalProject({getWorkspace,applyWorkspace,pickOpen,pickSave,download,handleStore=null,onStatus=()=>{},canReplace=()=>true}={}){
 let handle=null,name='',diskText=null,savedSnapshot=null,busy=false,message='',storeQueue=Promise.resolve();
 const queueStore=fn=>{storeQueue=storeQueue.catch(()=>{}).then(fn).catch(()=>{});return storeQueue};
 function status(){return {name,connected:Boolean(handle),dirty:savedSnapshot!=null&&projectSnapshot(getWorkspace())!==savedSnapshot,busy,message,directSupported:Boolean(pickSave)};}
 function refresh(){onStatus(status());}
 function remember(){if(handleStore&&handle){const value={handle,name,diskText,savedSnapshot};return queueStore(()=>handleStore.write(value));}}
 async function restore(){if(!handleStore)return;try{const session=await handleStore.read();if(session?.handle&&typeof session.diskText==='string'&&typeof session.savedSnapshot==='string'){({handle,name,diskText,savedSnapshot}=session);message='Lokal prosjektfil gjenopprettet. Lagre skriver tilbake til samme fil.';refresh();}}catch{/* Local recovery still works if the browser cannot retain handles. */}}
 function detach(){handle=null;name='';diskText=null;savedSnapshot=null;message='';if(handleStore)queueStore(()=>handleStore.clear());refresh();}
 async function readFile(file,fileHandle){
  const text=await file.text(),workspace=parseProjectDocument(text);
  if(!await canReplace())return false;
  // Validate everything before replacing either the workspace or active handle.
  await applyWorkspace(workspace);
  handle=fileHandle;name=file.name;diskText=text;savedSnapshot=projectSnapshot(getWorkspace());
  message=handle?'Arbeider i lokal prosjektfil. Cmd/Ctrl+S lagrer i samme fil.':pickSave?'Åpnet en filkopi. Velg Lagre for å knytte prosjektet til en lokal fil.':'Åpnet en filkopi. Lagre laster ned en oppdatert kopi i denne nettleseren.';
  if(handle)await remember();else if(handleStore)await queueStore(()=>handleStore.clear());
  return true;
 }
 async function openFile(file,fileHandle=null){
  if(busy)return false;busy=true;refresh();
  try{return await readFile(file,fileHandle)}finally{busy=false;refresh()}
 }
 async function open(){
  if(!pickOpen||busy)return false;busy=true;refresh();
  // Pickers must be invoked immediately from the user's click.
  try{
   const handles=await pickOpen({multiple:false,types:[{description:'LaserStudio-prosjektdokument',accept:{'application/json':[PROJECT_EXTENSION]}}]});
   if(!handles?.[0])return false;return await readFile(await handles[0].getFile(),handles[0]);
  }catch(e){if(e.name==='AbortError')return false;throw e;}
  finally{busy=false;refresh()}
 }
 async function save({as=false}={}){
  if(busy)return false;busy=true;refresh();let writable;
  try{
   let target=as?null:handle;
   if((as||!target)&&pickSave){
    target=await pickSave({suggestedName:name||projectFilename(getWorkspace()),types:[{description:'LaserStudio-prosjektdokument',accept:{'application/json':[PROJECT_EXTENSION]}}]});
   }
   if(!target){const snapshot=projectSnapshot(getWorkspace()),text=serializeProjectDocument(getWorkspace());download(text,name||projectFilename(getWorkspace()));if(as){handle=null;diskText=null;if(handleStore)await queueStore(()=>handleStore.clear());}savedSnapshot=snapshot;name=name||projectFilename(getWorkspace());message='Oppdatert filkopi lastet ned. Åpne kopien for å fortsette senere.';return true;}
   if(target.requestPermission&&await target.requestPermission({mode:'readwrite'})!=='granted')throw Error('Skrivetilgang ble ikke gitt. Velg Lagre som for å lagre en kopi.');
   // Never silently overwrite edits made by another application or browser tab.
   const same=handle&&(target===handle||(target.isSameEntry&&await target.isSameEntry(handle)));
   if(same&&diskText!==null){const current=await (await target.getFile()).text();if(current!==diskText)throw Error('Filen er endret utenfor denne fanen. Åpne den på nytt, eller bruk Lagre som for å beholde begge versjoner.');}
   const snapshot=projectSnapshot(getWorkspace()),text=serializeProjectDocument(getWorkspace());
   writable=await target.createWritable();await writable.write(text);await writable.close();writable=null;
   handle=target;name=target.name||projectFilename(getWorkspace());diskText=text;savedSnapshot=snapshot;message='Lagret i '+name;await remember();return true;
  }catch(e){if(writable)try{await writable.abort()}catch{}if(e.name==='AbortError')return false;message='Ikke lagret: '+e.message;throw e;}
  finally{busy=false;refresh();}
 }
 return {open,openFile,save,restore,detach,refresh,status,canOpenDirect:()=>Boolean(pickOpen)};
}
