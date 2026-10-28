import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildXsProject, importXsProject } from '../js/xs-project.js';
import { readZip, writeZip, zipText, crc32 } from '../js/zip.js';
import { getDefaultLaserSettings } from '../js/export.js';
import { DEFAULT_PROCESSING_ORDER } from '../js/processing-order.js';
import { createDrawingDocument } from '../js/drawing-model.js';
const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXaQAAAAASUVORK5CYII=';
const shapes=[{id:'group',type:'group',name:'Gruppe',children:[{id:'cut',type:'rect',x:0,y:0,width:40,height:30,laserMode:'cut'},{id:'engrave',type:'rect',x:10,y:10,width:10,height:10,laserMode:'engrave'}]},{id:'bitmap',type:'image',x:45,y:5,width:15,height:15,dataUrl:photo,srcDataUrl:photo,imageMeta:{originWidthPx:16,originHeightPx:16}},{id:'score',type:'line',x:5,y:40,width:35,height:10,laserMode:'score'}];
const json=(files,name)=>JSON.parse(zipText(files,name));
for(const machineKey of ['xtool-p3','xtool-f2'])test(`${machineKey}: native XS binds every display to its correct processing profile and retains dimensions`,async()=>{
 const settings=getDefaultLaserSettings();settings.cut.power=75;settings.cut.speed=30;settings.processingOrder=DEFAULT_PROCESSING_ORDER;
 const bytes=buildXsProject(shapes,{machineKey,laserSettings:settings,title:'Prøve'}),files=await readZip(bytes);
 assert.equal(zipText(files,'.format'),'v2');assert.equal(json(files,'meta/persistence-meta.json').protocol,'xcs-workspace-v2');
 const project=json(files,'project.json'),cid=project.activeCanvasId,canvas=json(files,`canvases/${cid}.json`),displays=json(files,`canvases/${cid}/displays-0.json`).displays,device=json(files,`devices/device-${project.activeDeviceId}.json`),profiles=json(files,'profiles.json').profiles;
 assert.equal(project.__v2__,true);assert.equal(canvas.extendInfo.version,'2.16.2');assert.equal(displays.length,4);assert.ok(Object.keys(canvas.groupData).length);
 const processing=device.processing[cid],mode=processing.modes[processing.activeMode];
 assert.equal(processing.activeMode,machineKey==='xtool-f2'?'LASER_PLANE':'LIFTING_PLATFORM_PROCESS');assert.equal(mode.data.isProcessByLayer,true);assert.equal(mode.data.processPath,'layer');
 for(const d of displays){const binding=mode.bindings.find(b=>b.displayIds.includes(d.id));assert.ok(binding);const profile=profiles[binding.baseProfileId];assert.equal(profile.processingType,d.processingType);assert.equal(binding.canvasId,cid);if(d.processingType==='VECTOR_CUTTING'){assert.equal(profile.values.power,75);assert.equal(profile.values.speed,30);assert.equal(d.width,40);assert.equal(d.height,30);}if(d.type==='BITMAP')assert.equal(d.base64,photo);}
 assert.ok(canvas.layerData['#000000'].order>canvas.layerData['#0000ff'].order);assert.ok(canvas.layerData['#0000ff'].order>canvas.layerData['#ff0000'].order);
 assert.equal(files.has('xcs.json'),false);
});
test('own XS retains editable source images, project drawing and custom processing order',async()=>{
 const cfg=getDefaultLaserSettings();cfg.processingOrder=[...DEFAULT_PROCESSING_ORDER].reverse();
 const doc=createDrawingDocument(shapes,{thicknessMm:3},'MDF');doc.title='Dokumentasjon';
 const restored=await importXsProject(buildXsProject(shapes,{workDrawing:doc,laserSettings:cfg}));
 assert.deepEqual(restored.shapes,shapes);assert.equal(restored.workDrawing.title,'Dokumentasjon');assert.deepEqual(restored.laserSettings.processingOrder,cfg.processingOrder);
 const selected=await importXsProject(buildXsProject(shapes,{onlySelected:true,selectedIds:new Set(['score'])}));assert.deepEqual(selected.shapes.map(s=>s.id),['score']);
});
test('reads actual deflated Studio 1.7.30 project with external bitmap resource and profile bindings',async()=>{
 const bytes=fs.readFileSync(new URL('./fixtures/studio-1.7.30-native.xs',import.meta.url));
 const files=await readZip(bytes);assert.equal(files.has('laserstudio/project.json'),false);
 const restored=await importXsProject(bytes);assert.equal(restored.shapes.length,4);
 const image=restored.shapes.find(s=>s.type==='image');assert.ok(image.dataUrl.startsWith('data:image/png;base64,'));assert.equal(image.width,40);assert.equal(image.x,130);
 assert.equal(restored.shapes.filter(s=>s.laserMode==='engrave').length,2);assert.equal(restored.shapes.filter(s=>s.laserMode==='score').length,1);assert.equal(restored.shapes.filter(s=>s.laserMode==='cut').length,1);
 assert.equal(restored.laserSettings.cut.power,85);assert.equal(restored.laserSettings.bitmap.speed,300);assert.equal(restored.laserSettings.processingOrder[0],'engrave');
 const project=json(files,'project.json'),cid=project.activeCanvasId,device=json(files,`devices/device-${project.activeDeviceId}.json`);assert.equal(device.processing[cid].modes.LIFTING_PLATFORM_PROCESS.data.isProcessByLayer,true);
});
test('ZIP handles UTF-8 and binary data, rejects damaged payloads and unsafe entries',async()=>{
 const bytes=writeZip([['måling.json','ÆØÅ'],['image.bin',new Uint8Array([0,255,80])]]),files=await readZip(bytes);
 assert.equal(zipText(files,'måling.json'),'ÆØÅ');assert.deepEqual([...files.get('image.bin')],[0,255,80]);assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
 const broken=bytes.slice();broken[43]^=1;await assert.rejects(readZip(broken));await assert.rejects(readZip(bytes.subarray(0,40)));await assert.rejects(readZip(writeZip([['../bad','x']])));await assert.rejects(readZip(writeZip([['same','1'],['same','2']])));
});
test('missing bitmap and unsupported native object fail explicitly, never silently drop artwork',async()=>{
 const files=await readZip(fs.readFileSync(new URL('./fixtures/studio-1.7.30-native.xs',import.meta.url)));
 const project=json(files,'project.json'),path=`canvases/${project.activeCanvasId}/displays-0.json`,chunk=json(files,path);
 const resource=chunk.displays.find(d=>d.type==='BITMAP').resourcePath;files.delete(resource);await assert.rejects(importXsProject(writeZip([...files])),/bilde/);
 chunk.displays=[{id:'unsupported',type:'TEXT'}];files.set(path,JSON.stringify(chunk));await assert.rejects(importXsProject(writeZip([...files])),/baner/);
});
