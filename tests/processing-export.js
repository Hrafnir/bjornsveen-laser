import { buildXsProject, importXsProject } from '../js/xs-project.js';
import { DEFAULT_PROCESSING_ORDER } from '../js/processing-order.js';
import { readZip, zipText } from '../js/zip.js';
import { createProjectHandleStore } from '../js/project-document.js';
const frame=document.getElementById('editor'),pause=ms=>new Promise(r=>setTimeout(r,ms));let w,d,passed=0,failed=0;
const assert=(v,m='Assertion failed')=>{if(!v)throw Error(m)},$=id=>d.getElementById(id);
async function test(name,fn){const li=document.createElement('li');document.querySelector('#results').append(li);try{await fn();li.className='pass';li.textContent='PASS: '+name;passed++}catch(e){li.className='fail';li.textContent='FAIL: '+name+' — '+e.stack;failed++}}
const wait=async fn=>{for(let i=0;i<250&&!await fn();i++)await pause(20);assert(await fn(),'timed out')};
await createProjectHandleStore().clear();
async function boot(){await new Promise(r=>{frame.onload=r;frame.src='../index.html?processing-test='+Date.now()});w=frame.contentWindow;d=frame.contentDocument;await wait(()=>$('save-status')&&!$('save-status').textContent.includes('Åpner'));await pause(180);}
await boot();
const shapes=['cut','score','engrave'].map((laserMode,i)=>({id:laserMode,name:laserMode,type:'rect',laserMode,x:10+i*40,y:10,width:30,height:30}));
await test('Native XS import restores editable artwork through the actual file input',async()=>{
 const transfer=new w.DataTransfer();transfer.items.add(new w.File([buildXsProject(shapes)],'test.xs'));$('file-import-input').files=transfer.files;$('file-import-input').dispatchEvent(new w.Event('change'));
 await wait(()=>$('project-file-status').textContent.includes('test.laserprosjekt'));assert(d.querySelectorAll('#shapes-layer > [data-id]').length===3,'three imported shapes');
});
const order=()=>[...d.querySelectorAll('[data-order-id][data-step="-1"]')].map(el=>el.dataset.orderId);
await test('Advanced order moves, warns and survives material change and reload',async()=>{
 $('tab-laser').click();$('advanced-laser').open=true;assert(order().join()===DEFAULT_PROCESSING_ORDER.join());d.querySelector('[data-order-id="cut"][data-step="-1"]').click();const custom=order().join();assert(custom!==DEFAULT_PROCESSING_ORDER.join());
 $('laser-preset-select').value='mdf-3mm';$('laser-preset-select').dispatchEvent(new w.Event('change'));assert(order().join()===custom);await pause(600);await boot();$('tab-laser').click();$('advanced-laser').open=true;assert(order().join()===custom,'reload lost order');
 for(let i=0;i<6&&order()[0]!=='cut';i++)d.querySelector('[data-order-id="cut"][data-step="-1"]').click();assert(d.querySelector('.order-warning'),'missing warning');
 d.querySelector('[data-reset-order]').click();assert(order().join()===DEFAULT_PROCESSING_ORDER.join());assert(!d.querySelector('.order-warning'));
});
let downloads=[];
const originalClick=w.HTMLAnchorElement.prototype.click;
w.HTMLAnchorElement.prototype.click=function(){if(this.download)downloads.push({name:this.download,blob:fetch(this.href).then(r=>r.blob())});else originalClick.call(this)};
await test('Default download is real XS with engraving-first layers and P3 MDF settings',async()=>{
 $('btn-export-xcs').click();assert($('export-format-select').value==='xs');const summary=$('export-processing-summary').textContent;assert(summary.indexOf('Gravering')<summary.indexOf('Gjennomkutt'));
 $('btn-confirm-download-xcs').click();await wait(()=>downloads.length===1);assert(downloads[0].name.endsWith('.xs'));
 const files=await readZip(await(await downloads[0].blob).arrayBuffer()),p=JSON.parse(zipText(files,'project.json')),c=JSON.parse(zipText(files,`canvases/${p.activeCanvasId}.json`));assert(c.layerData['#000000'].order>c.layerData['#ff0000'].order);
 const restored=await importXsProject(await(await downloads[0].blob).arrayBuffer());assert(restored.laserSettings.cut.power===75 && restored.laserSettings.cut.speed===30);
});
await test('Legacy XCS remains selectable and keeps the same corrected order',async()=>{
 $('btn-export-xcs').click();$('export-format-select').value='xcs';$('export-format-select').dispatchEvent(new w.Event('change'));assert($('btn-confirm-download-xcs').textContent.includes('.XCS'));
 $('btn-confirm-download-xcs').click();await wait(()=>downloads.length===2);const old=JSON.parse(await(await downloads[1].blob).text());assert(downloads[1].name.endsWith('.xcs'));assert(old.canvas[0].layerData['#000000'].order>old.canvas[0].layerData['#ff0000'].order);
});
w.HTMLAnchorElement.prototype.click=originalClick;
await test('Advanced order and export controls fit a 320px window',async()=>{
 frame.style.width='320px';await pause(100);$('tab-laser').click();$('advanced-laser').open=true;
 const within=el=>{const r=el.getBoundingClientRect();assert(r.left>=-1&&r.right<=w.innerWidth+1,el.textContent+' outside viewport')};for(const b of $('laser-processing-order').querySelectorAll('button'))within(b);
 $('btn-export-xcs').click();within($('export-format-select'));$('export-modal').classList.remove('open');
});
frame.style.width='1280px';document.getElementById('summary').textContent=`${passed} bestått, ${failed} feilet`;
