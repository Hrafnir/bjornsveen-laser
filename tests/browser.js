import { FLEX_PRESETS, buildFlexModel, flexModelToShapes, renderFlexAssemblySvg } from '../js/flex-generator.js';
import { renderFlexGeneratorUI } from '../js/flex-ui.js';
import { BOX_TYPES, buildBoxModel, boxModelToShapes, renderBoxAssemblySvg } from '../js/box-generator.js';
import { renderShapesPreviewSvg } from '../js/generators.js';
import { generateJigsawPuzzle } from '../js/generators.js';
import { importSvgStringToShapes } from '../js/svg-import.js';
import { computePolygonsBBox,shapeToWorldPolygons } from '../js/geometry.js';
import { buildLaserSvgString,buildXcsProjectString,getDefaultLaserSettings } from '../js/export.js';
import { createBitmapImageShape,prepareBitmapExports,refreshBitmapShapeDataUrl } from '../js/icons.js';
let passed=0,failed=0;
const assert=(value,message='Assertion failed')=>{if(!value)throw new Error(message)};
const near=(a,b)=>assert(Math.abs(a-b)<0.03,`${a} != ${b}`);
async function test(name,fn){const li=document.createElement('li');document.getElementById('results').append(li);try{await fn();li.textContent='PASS: '+name;li.className='pass';passed++}catch(e){li.textContent='FAIL: '+name+' — '+e.message;li.className='fail';failed++;console.error(e)}}
const bounds=s=>computePolygonsBBox(shapeToWorldPolygons(s));
await test('Nested SVG transforms, viewBox origin and inherited laser layer',()=>{
 const [s]=importSvgStringToShapes('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="10 20 100 100"><g transform="translate(10 20)" fill="none" stroke="blue"><g transform="translate(5 7) scale(2)"><rect width="10" height="20"/></g></g></svg>');
 const b=bounds(s);near(b.x,5);near(b.y,7);near(b.width,20);near(b.height,40);assert(s.laserMode==='score');
});
await test('SVG physical units below and above the old 700-pixel heuristic',()=>{
 for(const size of [96,960]){const [s]=importSvgStringToShapes(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}px" height="96px" viewBox="0 0 ${size} 96"><rect width="${size}" height="96"/></svg>`);near(bounds(s).width,size*25.4/96)}
 const [s]=importSvgStringToShapes('<svg xmlns="http://www.w3.org/2000/svg" width="2.54cm" height="1in" viewBox="0 0 96 96"><rect width="96" height="96"/></svg>');near(bounds(s).width,25.4);
});
await test('SVG preserveAspectRatio and rotate around pivot',()=>{
 const [s]=importSvgStringToShapes('<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="100mm" viewBox="0 0 100 100"><rect x="10" y="20" width="20" height="10" transform="rotate(90 20 25)"/></svg>');const b=bounds(s);near(b.x,65);near(b.y,15);near(b.width,10);near(b.height,20);
});
await test('SVG export/import preserves physical dimensions and XML names',()=>{
 const [s]=importSvgStringToShapes('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><rect x="10" y="20" width="30" height="40"/></svg>');s.name='A & B "ÆØÅ"';
 const svg=buildLaserSvgString([s]);assert(!new DOMParser().parseFromString(svg,'image/svg+xml').querySelector('parsererror'));
 const [b]=importSvgStringToShapes(svg);near(bounds(b).width,30);near(bounds(b).height,40);assert(b.name===s.name);
});
await test('Unsupported SVG content is reported, invalid XML rejected',()=>{
 const shapes=importSvgStringToShapes('<svg xmlns="http://www.w3.org/2000/svg"><text>Hello</text><g clip-path="url(#x)"><rect width="10" height="10"/></g></svg>');assert(shapes.length===0);assert(shapes.warnings.length===2);
 let rejected=false;try{importSvgStringToShapes('<svg><broken></svg>')}catch{rejected=true}assert(rejected);
});
await test('A photo retains original pixels and exports at requested resolution',async()=>{
 const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1200;const ctx=canvas.getContext('2d');const g=ctx.createLinearGradient(0,0,2400,0);g.addColorStop(0,'black');g.addColorStop(1,'white');ctx.fillStyle=g;ctx.fillRect(0,0,2400,1200);
 const src=canvas.toDataURL();const img=new Image();img.src=src;await img.decode();
 const shape=createBitmapImageShape(img,{widthMm:200,filter:'inherit'});assert(shape.srcDataUrl===src);
 const preview=new Image();preview.src=shape.dataUrl;await preview.decode();assert(preview.width===750);
 const settings=getDefaultLaserSettings();settings.bitmap.dpi=254;settings.bitmap.bitmapMode='Stucki';
 await prepareBitmapExports([shape],settings);const out=new Image();out.src=shape.xcsDataUrl;await out.decode();assert(out.width===2000);assert(shape.imageMeta.originWidthPx===2000);
 const exported=JSON.parse(buildXcsProjectString([shape],{laserSettings:settings}));assert(exported.canvas[0].displays[0].data.BITMAP_ENGRAVING.parameter.customize.bitmapMode==='Stucki');
 shape.imageMeta.sharpness=0;await refreshBitmapShapeDataUrl(shape,null,settings.bitmap);assert(shape.imageMeta.sharpness===0);assert(shape.srcDataUrl===src);
});
await test('Puzzle SVG roundtrip preserves the three cut stages and colors',()=>{
 const puzzle=generateJigsawPuzzle();
 const svg=buildLaserSvgString([...puzzle].reverse());
 assert(!new DOMParser().parseFromString(svg,'image/svg+xml').querySelector('parsererror'));
 const imported=importSvgStringToShapes(svg);
 assert(imported.length===3);
 assert(imported.every((s,i)=>s.cutStage===puzzle[i].cutStage && s.laserMode==='cut'));
 const xcs=JSON.parse(buildXcsProjectString(imported));
 const displays=xcs.canvas[0].displays;
 assert(new Set(displays.map(d=>d.layerTag)).size===3);
 const orders=displays.map(d=>xcs.canvas[0].layerData[d.layerTag].order);
 assert(orders[0]<orders[1] && orders[1]<orders[2]);
});
await test('All box variants render, show readable guide labels and export cut stages',()=>{
 for(const type of BOX_TYPES) {
  const model=buildBoxModel({boxType:type.id});
  const shapes=boxModelToShapes(model);
  for(const svg of [renderShapesPreviewSvg(shapes).svgHtml,renderBoxAssemblySvg(model),buildLaserSvgString(shapes)]) {
   const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
   assert(!doc.querySelector('parsererror'),type.id);assert(doc.querySelectorAll('path').length>0,type.id);
  }
  const exported=importSvgStringToShapes(buildLaserSvgString(shapes));
  assert(exported.every(s=>s.laserMode==='cut' && s.cutStage.startsWith('box-')),type.id);
  assert(exported.filter(s=>s.cutStage==='box-outline').length===model.parts.length,type.id);
  const preview=new DOMParser().parseFromString(renderShapesPreviewSvg(shapes).svgHtml,'image/svg+xml');
  const labels=[...preview.querySelectorAll('text')];
  assert(labels.length===model.parts.length,type.id);
  assert(labels.every(label=>!label.hasAttribute('stroke-dasharray') && label.getAttribute('font-family').includes('system-ui')),type.id);
 }
});
await test('Flex examples render and preserve open slit counts through SVG import',()=>{
 for(const preset of FLEX_PRESETS) {
  const model=buildFlexModel(preset.options), shapes=flexModelToShapes(model);
  const previews=[renderShapesPreviewSvg(shapes).svgHtml,buildLaserSvgString(shapes)];
  if(model.type!=='panel') previews.push(renderFlexAssemblySvg(model));
  for(const svg of previews) assert(!new DOMParser().parseFromString(svg,'image/svg+xml').querySelector('parsererror'),preset.id);
  const imported=importSvgStringToShapes(buildLaserSvgString(shapes));
  const slits=imported.filter(s=>s.cutStage==='flex-slits').flatMap(s=>shapeToWorldPolygons(s));
  assert(slits.length===model.parts.reduce((n,p)=>n+p.slits.length,0),preset.id);
  assert(slits.every(l=>l.closed===false && l.length===2),preset.id);
  const preview=new DOMParser().parseFromString(previews[0],'image/svg+xml');
  assert(preview.querySelector('path[stroke="#cc0066"]'), 'Flex preview color');
 }
});
await test('Flex controls handle examples, errors, custom trial pieces and assembly switching',()=>{
 const container=document.createElement('div');document.body.append(container);
 let generated=[];
 try {
  renderFlexGeneratorUI(container,{onChange:s=>generated=s,parseNumber:(s,fallback)=>s.trim() && Number.isFinite(Number(s))?Number(s):fallback});
  const el=id=>container.querySelector('#gen-flex-'+id);
  const edit=(id,value,event='input')=>{el(id).value=value;el(id).dispatchEvent(new Event(event,{bubbles:true}))};
  assert(generated.length===1);
  for(const preset of FLEX_PRESETS){edit('preset',preset.id,'change');assert(el('error').hidden,preset.id);assert(generated.length>0,preset.id)}
  el('view-assembly').click();assert(container.querySelector('svg[aria-label*="flexboks"]'));
  edit('pitch','abc');assert(!el('error').hidden && generated.length===0);assert(!container.querySelector('svg'));
  edit('pitch','2.5');assert(el('error').hidden && generated.length>0);
  edit('cut-length','30');el('sample').click();
  assert(el('type').value==='panel' && el('pitch').value==='2.5' && el('cut-length').value==='30');
  assert(generated.length===1 && el('view-assembly').hidden);
  edit('axis','horizontal');assert(el('error').hidden && generated.length===1);
  edit('preset','lid','change');edit('pieces','1');assert(generated.length===6);
 } finally { container.remove(); }
});
// Dependency injection gives storage tests their own database and legacy key.
const { createWorkspaceStorage } = await import('../js/storage.js');
const name='laserstudio-regression-tests';
const removeDB=()=>new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(name);r.onsuccess=resolve;r.onerror=reject});
await removeDB();
const messages=[];
const makeStore=()=>createWorkspaceStorage({databaseName:name,legacyKey:name,onStatus:(message,failed)=>messages.push({message,failed})});
await test('Legacy storage migrates only after IndexedDB write commits',async()=>{
 localStorage.setItem(name,JSON.stringify({shapes:[{id:'old'}],bedWidth:123}));
 const store=makeStore();const saved=await store.loadWorkspaceFromLocal();assert(saved.shapes[0].id==='old');assert(localStorage.getItem(name)===null);assert((await makeStore().loadWorkspaceFromLocal()).bedWidth===123);
});
await test('Autosave stores post-mutation state, large photos, and an empty workspace',async()=>{
 const store=makeStore();const state={shapes:[{id:'before'}],targetMachine:'xtool-f2'};
 store.saveWorkspaceToLocal(state);state.shapes.push({id:'after',srcDataUrl:'x'.repeat(6000000)});await store.flushWorkspaceSave();
 const restored=await makeStore().loadWorkspaceFromLocal();assert(restored.shapes.length===2);assert(restored.shapes[1].srcDataUrl.length===6000000);assert(restored.targetMachine==='xtool-f2');
 state.shapes=[];store.saveWorkspaceToLocal(state);await store.flushWorkspaceSave();assert((await makeStore().loadWorkspaceFromLocal()).shapes.length===0);
});
await test('Storage errors are visible and never erase unread existing data',async()=>{
 const errorStore=createWorkspaceStorage({databaseName:name,legacyKey:name,onStatus:(message,failed)=>messages.push({message,failed}),openDatabase:()=>Promise.reject(new Error('Quota or unavailable'))});
 errorStore.saveWorkspaceToLocal({shapes:[{id:'not-stored'}]});await errorStore.flushWorkspaceSave();assert(messages.at(-1).failed);
 await errorStore.loadWorkspaceFromLocal();errorStore.saveWorkspaceToLocal({shapes:[]});await errorStore.flushWorkspaceSave();assert(messages.at(-1).failed);
});
await test('Pending edits have a synchronous recovery journal with image references',async()=>{
 const store=makeStore();const state={shapes:[{id:'photo',type:'image',srcDataUrl:'original'.repeat(750000),dataUrl:'preview'}]};
 store.saveWorkspaceToLocal(state);await store.flushWorkspaceSave();
 state.shapes[0].x=72;store.saveWorkspaceToLocal(state);
 const journal=localStorage.getItem(name+'_pending_v3');assert(journal.length<1000);assert(journal.includes('_assetRefs'));
 const recovered=await makeStore().loadWorkspaceFromLocal();assert(recovered.shapes[0].x===72);assert(recovered.shapes[0].srcDataUrl.length===6000000);
 await store.flushWorkspaceSave();
});
await removeDB();localStorage.removeItem(name);localStorage.removeItem(name+'_pending_v3');
document.getElementById('summary').textContent=`${passed} bestått, ${failed} feilet`;
document.title=`${failed?'FAIL':'PASS'} – LaserStudio nettlesertester`;
