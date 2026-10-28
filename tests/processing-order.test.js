import test from 'node:test';
import assert from 'node:assert/strict';
import { buildXcsProjectString, buildLaserSvgString, getDefaultLaserSettings } from '../js/export.js';
import { processingPlan, processingOrder, PROCESSING_LAYERS, DEFAULT_PROCESSING_ORDER } from '../js/processing-order.js';
const rect=(id,mode='cut',cutStage)=>({id,type:'rect',x:10,y:10,width:20,height:30,laserMode:mode,cutStage});
const shapes=PROCESSING_LAYERS.map(l=>rect(l.id,['engrave','score'].includes(l.id)?l.id:'cut',l.id));
const execution=canvas=>Object.entries(canvas.layerData).sort((a,b)=>b[1].order-a[1].order).filter(([color])=>canvas.displays.some(d=>d.layerTag===color)).map(([color])=>PROCESSING_LAYERS.find(l=>l.color===color).id);
for(const machineKey of ['xtool-p3','xtool-f2'])test(`${machineKey}: engraving precedes every cut, independent of group nesting and visual stacking`,()=>{
 const input=[{id:'outer',type:'group',children:[...shapes].reverse()}],before=JSON.stringify(input);
 const original=JSON.parse(buildXcsProjectString(input,{machineKey}));
 assert.deepEqual(execution(original.canvas[0]),DEFAULT_PROCESSING_ORDER);
 const settings=getDefaultLaserSettings();settings.processingOrder=[...DEFAULT_PROCESSING_ORDER].reverse();
 const custom=JSON.parse(buildXcsProjectString(input,{machineKey,laserSettings:settings}));
 assert.deepEqual(execution(custom.canvas[0]),settings.processingOrder);
 assert.deepEqual(original.canvas[0].displays.map(d=>[d.name,d.zOrder,d.dPath]),custom.canvas[0].displays.map(d=>[d.name,d.zOrder,d.dPath]));
 const info=custom.device.data.value[0][1];assert.equal(info.data[info.mode].isProcessByLayer,true);assert.equal(info.data[info.mode].processPath,'layer');
 assert.equal(JSON.stringify(input),before);
});
test('settings validation falls back to a complete safe order; plan counts only visible machining objects',()=>{
 for(const processingOrder of [null,[],['cut'],['unknown'],42])assert.deepEqual(processingOrderFn({processingOrder}),DEFAULT_PROCESSING_ORDER);
 const plan=processingPlan([{id:'g',type:'group',children:[rect('a','engrave'),{id:'photo',type:'image'},rect('score','score')]},{...rect('hidden'),hidden:true},rect('guide','guide'),{id:'hg',type:'group',hidden:true,children:[rect('h')]}]);
 assert.equal(plan.find(l=>l.id==='engrave').count,2);assert.equal(plan.find(l=>l.id==='score').count,1);assert.equal(plan.find(l=>l.id==='cut').count,0);
});
const processingOrderFn=processingOrder;
test('selection export omits other stages and SVG follows configured group order',()=>{
 const xcs=JSON.parse(buildXcsProjectString(shapes,{onlySelected:true,selectedIds:new Set(['engrave','puzzle-outline'])}));
 assert.deepEqual(execution(xcs.canvas[0]),['engrave','puzzle-outline']);
 const settings={...getDefaultLaserSettings(),processingOrder:[...DEFAULT_PROCESSING_ORDER].reverse()};
 const svg=buildLaserSvgString(shapes,{laserSettings:settings});assert.ok(svg.indexOf('id="box-outline"')<svg.indexOf('id="puzzle-horizontal"'));assert.ok(svg.indexOf('id="puzzle-horizontal"')<svg.indexOf('id="Lag_1_Gravering_Engrave"'));
});
