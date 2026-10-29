import {initializeFonts,createTextShape} from '../js/fonts.js';
import {encodeClipboard} from '../js/object-commands.js';
import {serializeProjectDocument} from '../js/project-document.js';
import {getShapesBBox} from '../js/geometry.js';
const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,m='Assertion failed')=>{if(!v)throw Error(m)};
let passed=0,failed=0;async function test(name,fn){const li=document.createElement('li');document.querySelector('#results').append(li);try{await fn();li.className='pass';li.textContent='PASS: '+name;passed++}catch(e){li.className='fail';li.textContent='FAIL: '+name+' — '+e.stack;failed++}}
await initializeFonts();const frame=document.querySelector('#editor');await new Promise(r=>{frame.onload=r;frame.src='../index.html'});let w=frame.contentWindow,d=frame.contentDocument,$=id=>d.getElementById(id);
async function wait(fn){for(let i=0;i<250;i++){if(fn())return;await pause(20)}throw Error('Timed out')}
await wait(()=>$('text-font-select').options.length>40);await pause(200);
const clipboard=(action,shapes)=>{d.activeElement?.blur();const data=new w.DataTransfer();if(shapes)data.setData('text/plain',encodeClipboard(shapes));d.dispatchEvent(new w.ClipboardEvent(action,{clipboardData:data,bubbles:true,cancelable:true}));return action==='copy'?JSON.parse(data.getData('text/plain')).shapes:null};
const selected=()=>clipboard('copy');
const key=(key,extra={})=>{d.activeElement?.blur();w.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,...extra}))};
const text=createTextShape({text:'TEKST PÅ ARBEIDSFLATEN',fontSizeMm:12,x:70,y:65});
const border={id:'border',type:'rect',name:'Kuttelinje over teksten',laserMode:'cut',x:50,y:45,width:270,height:90,rx:0};
let projectNumber=0;
async function project(shapes){const name=`Arbeidsflyt-${++projectNumber}.laserprosjekt`,dt=new w.DataTransfer();dt.items.add(new w.File([serializeProjectDocument({shapes})],name));$('project-document-input').files=dt.files;$('project-document-input').dispatchEvent(new w.Event('change'));await wait(()=>{d.querySelector('.project-choices [data-keep]')?.click();return $('project-file-status').textContent.includes(name)});await pause(100);key('Escape');d.activeElement?.blur()}

const point=(x,y)=>{const p=$('main-svg').createSVGPoint();p.x=x;p.y=y;return p.matrixTransform($('main-svg').getScreenCTM())};
function pointer(type,x,y){const p=point(x,y),target=d.elementFromPoint(p.x,p.y);assert(target,'point outside canvas');target.dispatchEvent(new w.PointerEvent(type,{clientX:p.x,clientY:p.y,button:0,buttons:type==='pointerup'?0:1,bubbles:true}));}
const click=(x,y)=>{pointer('pointerdown',x,y);pointer('pointerup',x,y)};
const draw=(x,y)=>{pointer('pointerdown',x,y);pointer('pointermove',x+25,y+20);pointer('pointerup',x+25,y+20)};
const edit=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event(id==='text-content-input'?'input':'change',{bubbles:true}));$(id).blur()};
await project([text,border]);
await test('Unfilled cut frame does not intercept text clicks; text properties open at the top',async()=>{
 $('tab-laser').click();const p=point(text.x+2,text.y+text.height/2);assert(d.elementFromPoint(p.x,p.y).closest('[data-id]')?.dataset.id===text.id,'frame blocks text');click(text.x+2,text.y+text.height/2);
 assert(selected()[0].id===text.id);assert(!$('panel-object').hidden);const a=$('text-content-input').getBoundingClientRect(),b=$('panel-object').getBoundingClientRect();assert(a.top>=b.top&&a.bottom<=b.bottom,'text controls offscreen');
 edit('text-content-input','REDIGERT PÅ FLATEN');assert(selected()[0].textMeta.text==='REDIGERT PÅ FLATEN');
});
await test('Thin borders remain selectable by their stroke and engraving fills retain paint order',async()=>{
 click(50,110);assert(selected()[0].id==='border');
 await project([text,{...border,laserMode:'engrave'}]);click(text.x+2,text.y+6);assert(selected()[0].id==='border','filled foreground should still win');
});
await test('Grouped text and image descendants select their group; double-click opens the clicked text',async()=>{
 const group={id:'sign',type:'group',name:'Skilt med tekst',laserMode:'cut',...getShapesBBox([text,border]),children:[text,border]};await project([group]);click(text.x+2,text.y+6);assert(selected()[0].id==='sign');
 const p=point(text.x+2,text.y+6);d.elementFromPoint(p.x,p.y).dispatchEvent(new w.MouseEvent('mousedown',{detail:2,clientX:p.x,clientY:p.y,bubbles:true,cancelable:true}));assert(d.activeElement===$('text-content-input'));assert(selected()[0].id===text.id);assert(!$('panel-object').hidden);
 const edge=point(50,110);d.elementFromPoint(edge.x,edge.y).dispatchEvent(new w.MouseEvent('dblclick',{clientX:edge.x,clientY:edge.y,bubbles:true}));assert($('group-edit-banner').style.display!=='none','double-click on a non-text part must stay inside its group');
 key('Escape');const image={id:'photo',type:'image',name:'Foto',x:70,y:65,width:20,height:20,laserMode:'engrave',dataUrl:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="black"/></svg>')};
 await project([{...group,children:[image,border]}]);click(80,75);assert(selected()[0].id==='sign');
});
await test('Choosing text in Layers opens Object properties; T reveals its controls immediately',async()=>{
 await project([text]);$('tab-layers').click();d.querySelector('#layer-list [data-id]').click();assert(!$('panel-object').hidden);
 key('Escape');$('tab-laser').click();d.querySelector('[data-tool="text"]').click();assert(!$('panel-object').hidden&&$('text-inspector-section').style.display!=='none');key('Escape');
});
await test('Repeat toggle keeps all five shape tools active, preserves polygon sides and allows Escape',async()=>{
 await project([]);$('keep-shape-tool').checked=true;$('keep-shape-tool').dispatchEvent(new w.Event('change'));
 for(const type of ['rect','ellipse','polygon','star','heart']){
  d.querySelector(`[data-tool="${type}"]`).click();draw(50,180);assert(d.querySelector(`[data-tool="${type}"]`).classList.contains('active'));
  if(type==='polygon')edit('prop-sides','9');draw(110,180);assert(selected()[0].type===type);if(type==='polygon')assert(selected()[0].sides===9);
 }
 assert($('shapes-layer').children.length===10);key('Escape');assert(d.querySelector('[data-tool="select"]').classList.contains('active'));
});
await test('Turning repeat off returns to Select; new shapes and their undo remain independent',async()=>{
 $('keep-shape-tool').checked=false;$('keep-shape-tool').dispatchEvent(new w.Event('change'));d.querySelector('[data-tool="rect"]').click();draw(170,180);assert(d.querySelector('[data-tool="select"]').classList.contains('active'));assert($('shapes-layer').children.length===11);$('btn-undo').click();assert($('shapes-layer').children.length===10);$('btn-redo').click();assert($('shapes-layer').children.length===11);
});
await test('Repeat preference survives reload and the text inspector fits a narrow window',async()=>{
 $('keep-shape-tool').checked=true;$('keep-shape-tool').dispatchEvent(new w.Event('change'));await new Promise(r=>{frame.onload=r;frame.contentWindow.location.reload()});w=frame.contentWindow;d=frame.contentDocument;$=id=>d.getElementById(id);await wait(()=>$('text-font-select').options.length>40);await pause(200);assert($('keep-shape-tool').checked);
 await project([text,border]);frame.style.width='390px';await pause(100);d.querySelector('[data-tool="text"]').click();assert(!$('panel-object').hidden&&!$('inspector-panel').hidden);assert(d.documentElement.scrollWidth<=391);for(const id of ['text-content-input','text-font-select']){const r=$(id).getBoundingClientRect();assert(r.left>=0&&r.right<=391)}frame.style.width='1280px';await pause(100);
});
// Leave a useful canvas for a real pointer/double-click check and screenshot.
await project([text,border]);document.querySelector('#summary').textContent=`${passed} bestått, ${failed} feilet`;
