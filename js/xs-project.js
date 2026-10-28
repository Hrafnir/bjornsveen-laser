import { buildXcsProjectString, importXcsStringToWorkspace } from './export.js';
import { writeZip, readZip, zipText } from './zip.js';
import { PROCESSING_LAYERS, DEFAULT_PROCESSING_ORDER } from './processing-order.js';
import { serializeProjectDocument, parseProjectDocument } from './project-document.js';
// Native xTool Studio workspace v2: project + canvas chunks + profiles + device bindings.
// Verified against a synthetic project saved by Studio 1.7.30. See tests/XS_FORMAT.md.
export function buildXsProject(shapes,options={}){
 const legacy=JSON.parse(buildXcsProjectString(shapes,options)),canvas=legacy.canvas[0],cid=canvas.id;
 const deviceId=legacy.device.deviceCode+'-1',modeInfo=legacy.device.data.value[0][1],mode=modeInfo.mode;
 const profiles={},bindings=[],patches={},profileKeys=new Map();
 for(const [displayId,info]of modeInfo.displays.value){
  const type=info.processingType,values=info.data[type].parameter.customize,key=JSON.stringify([type,values]);
  let pid=profileKeys.get(key);if(!pid){pid='profile-'+profileKeys.size;profileKeys.set(key,pid);profiles[pid]={id:pid,processingType:type,values:{...values,processingType:type}};patches['patch-'+pid]={id:'patch-'+pid,profileId:pid,source:'material',material:{materialType:'customize',materialId:0,paramSource:'customParams',planType:'official'},overrides:{...values,processingType:type}};}
  bindings.push({bindingId:'binding-'+displayId,baseProfileId:pid,patchIds:['patch-'+pid],displayIds:[displayId],canvasId:cid,mode});
 }
 const displays=canvas.displays.map(d=>{
  const {data,bjornsveenShape,...display}=d;
  return {...display,alpha:1,originColor:'#000000',effects:[],fill:{paintType:'color',visible:d.isFill,color:0,alpha:1},stroke:{paintType:'color',visible:!d.isFill,color:0,alpha:1,width:1,cap:'butt',join:'miter',miterLimit:4,alignment:.5}};
 });
 const entries=[],json=(name,value)=>entries.push([name,JSON.stringify(value)]);
 entries.push(['.format','v2']);json('meta/persistence-meta.json',{schemaVersion:'2.0.0',protocol:'xcs-workspace-v2'});
 json('project.json',{__v2__:true,version:'2.0.0',schemaMeta:{schemaVersion:'2',format:'directory'},projectId:cid,projectName:options.title||options.workDrawing?.title||'Bjørnsveen LaserStudio',activeCanvasId:cid,activeDeviceId:deviceId,created:legacy.created,modify:legacy.modify,modules:{canvases:[cid],devices:[deviceId]}});
 json('profiles.json',{profiles});
 json(`canvases/${cid}.json`,{id:cid,title:canvas.title,hidden:false,layerData:canvas.layerData,groupData:canvas.groupData,extendInfo:{version:'2.16.2',minCanvasVersion:'0.0.0',type:'2d'},chunkLayout:{displayCount:displays.length,chunkCount:1,chunkIndexes:[0]}});
 json(`canvases/${cid}/displays-0.json`,{canvasId:cid,chunkIndex:0,displays});
 json(`devices/device-${encodeURIComponent(deviceId)}.json`,{id:deviceId,deviceCode:legacy.device.deviceCode,extId:legacy.extId,extName:legacy.extName,power:legacy.device.power,processing:{[cid]:{id:cid,activeMode:mode,modes:{[mode]:{ignoredDisplayIds:[],data:modeInfo.data[mode],profileRefs:Object.keys(profiles),patches,bindings}}}}});
 entries.push(['laserstudio/project.json',serializeProjectDocument({...legacy.bjornsveenProject})]);
 return writeZip(entries);
}
export async function importXsProject(bytes){
 const files=await readZip(bytes),native=zipText(files,'laserstudio/project.json');
 if(native)return parseProjectDocument(native);
 const project=JSON.parse(zipText(files,'project.json')||'null');if(!project?.modules?.canvases?.length)throw Error('XS-filen mangler en støttet arbeidstegning.');
 if(project.modules.canvases.length!==1)throw Error('Denne XS-filen har flere arbeidsflater. Eksporter én arbeidsflate om gangen.');
 const cid=project.activeCanvasId||project.modules.canvases[0],canvas=JSON.parse(zipText(files,`canvases/${cid}.json`)||'null');if(!canvas)throw Error('XS-filen mangler arbeidsflaten.');
 canvas.displays=canvas.displays||[];for(const index of canvas.chunkLayout?.chunkIndexes||[])canvas.displays.push(...JSON.parse(zipText(files,`canvases/${cid}/displays-${index}.json`)).displays);
 for(const display of canvas.displays){
  if(display.type==='BITMAP'&&!display.base64){
   const resource=files.get(display.resourcePath),extension=display.resourcePath?.split('.').pop()?.toLowerCase();
   const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'}[extension];
   if(!resource||!mime)throw Error('XS-filen inneholder et bilde som ikke kan leses.');
   let binary='';for(let i=0;i<resource.length;i+=8192)binary+=String.fromCharCode(...resource.subarray(i,i+8192));
   display.base64=`data:${mime};base64,${btoa(binary)}`;
  }
  if(!['BITMAP','PATH'].includes(display.type)||(display.type==='PATH'&&!display.dPath))throw Error('XS-filen inneholder objekter som må konverteres til baner i xTool før import.');
 }
 const deviceId=project.activeDeviceId||project.modules.devices?.[0],device=JSON.parse(zipText(files,`devices/device-${encodeURIComponent(deviceId)}.json`)||'null');
 const profiles=JSON.parse(zipText(files,'profiles.json')||'{"profiles":{}}').profiles,processing=device?.processing?.[cid],mode=processing?.modes?.[processing.activeMode],displayValues=[];
 for(const binding of mode?.bindings||[]){const p=profiles[binding.baseProfileId];if(!p)continue;let values={...p.values};for(const id of binding.patchIds||[])Object.assign(values,mode.patches?.[id]?.overrides);for(const id of binding.displayIds||[])displayValues.push([id,{processingType:p.processingType,data:{[p.processingType]:{parameter:{customize:values}}}}]);}
 const result=importXcsStringToWorkspace(JSON.stringify({canvas:[canvas],extId:device?.extId,extName:device?.extName,device:{data:{value:[[cid,{displays:{value:displayValues}}]]}}}));if(!result||result.shapes.length!==canvas.displays.length)throw Error('Kan ikke lese all geometrien i XS-filen.');
 const ordered=Object.entries(canvas.layerData||{}).sort((a,b)=>b[1].order-a[1].order).map(([color])=>PROCESSING_LAYERS.find(l=>l.color===color)?.id).filter(Boolean);
 if(result.laserSettings)result.laserSettings.processingOrder=[...ordered,...DEFAULT_PROCESSING_ORDER.filter(id=>!ordered.includes(id))];
 result.shapes.forEach((shape,i)=>{const display=canvas.displays[i],layer=PROCESSING_LAYERS.find(l=>l.color===display.layerTag);if(shape.laserMode==='cut'&&layer&&!['cut','engrave','score'].includes(layer.id))shape.cutStage=layer.id;shape.hidden=display.visible===false;
  if(shape.type==='image')for(const key of ['x','y','width','height'])if(Number.isFinite(display[key]))shape[key]=display[key];});
 return result;
}
