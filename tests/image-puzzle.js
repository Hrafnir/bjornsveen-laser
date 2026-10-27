import { encodeClipboard } from '../js/object-commands.js';
import { prepareBitmapExports } from '../js/icons.js';
import { getDefaultLaserSettings, buildXcsProjectString, importXcsStringToWorkspace } from '../js/export.js';
import { shapeToWorldPolygons, computePolygonsBBox, rebuildPathShapeFromNodes } from '../js/geometry.js';
const frame=document.querySelector('#editor');
await new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
const w=frame.contentWindow,d=frame.contentDocument,$=id=>d.getElementById(id),pause=ms=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<250&&$('save-status').textContent.includes('Åpner');i++)await pause(20);
await pause(100);
let passed=0,failed=0;
const assert=(v,m='Assertion failed')=>{if(!v)throw Error(m)};
const near=(a,b,t=.1)=>assert(Math.abs(a-b)<t,`${a} != ${b}`);
async function test(name,fn){const li=document.createElement('li');document.querySelector('#results').append(li);try{await fn();li.textContent='PASS: '+name;li.className='pass';passed++}catch(e){li.textContent='FAIL: '+name+' — '+e.stack;li.className='fail';failed++}}
const key=(key,extra={})=>{d.activeElement?.blur();w.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,...extra}))};
const clipboard=(action,text)=>{d.activeElement?.blur();const data=new w.DataTransfer();if(text)data.setData('text/plain',text);d.dispatchEvent(new w.ClipboardEvent(action,{clipboardData:data,bubbles:true,cancelable:true}));return data.getData('text/plain')};
const selected=()=>JSON.parse(clipboard('copy')).shapes;
const reset=()=>{$('btn-modal-cancel').click();key('Escape');d.querySelector('[data-tool="select"]').click();key('a',{metaKey:true});key('Delete')};
const edit=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event($(id).tagName==='SELECT'?'change':'input',{bubbles:true}))};
const ready=async()=>{await pause(230);for(let i=0;i<150&&$('btn-modal-insert').disabled&&$('gen-puz-error').hidden;i++)await pause(30);assert($('gen-puz-error').hidden,$('gen-puz-error').textContent);assert(!$('btn-modal-insert').disabled,'preview never ready')};
const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const ctx=canvas.getContext('2d');
const gradient=ctx.createLinearGradient(0,0,320,240);gradient.addColorStop(0,'#32b8dd');gradient.addColorStop(1,'#ffb83e');ctx.fillStyle=gradient;ctx.fillRect(0,0,320,240);ctx.fillStyle='#245c49';ctx.beginPath();ctx.moveTo(0,240);ctx.lineTo(95,90);ctx.lineTo(180,180);ctx.lineTo(245,70);ctx.lineTo(320,240);ctx.fill();ctx.fillStyle='#fff2b1';ctx.beginPath();ctx.arc(90,60,25,0,Math.PI*2);ctx.fill();
const src=canvas.toDataURL();
const photo={id:'fixture',type:'image',name:'Fjell – testbilde',x:20,y:20,width:160,height:120,rotation:0,laserMode:'engrave',srcDataUrl:src,dataUrl:src,imageMeta:{filter:'grayscale',sharpness:50}};
const paste=shapes=>clipboard('paste',encodeClipboard(shapes));
let group;
await test('Selected photo opens workshop, preserves proportions and replaces image with grouped cuts',async()=>{
 reset();paste([photo]);const original=selected()[0];$('btn-bmp-puzzle').click();await ready();
 assert($('gen-puz-image').value===original.id);near(Number($('gen-puz-w').value),160);
 edit('gen-puz-w','120');await ready();near(Number($('gen-puz-h').value),90);
 assert($('gen-preview-svg').querySelector('image'),'color image missing in preview');
 $('btn-modal-insert').click();group=selected()[0];assert(group.type==='group');assert(group.children.length===4);assert($('shapes-layer').children.length===1,'duplicated source photo');
 assert(group.children[0].id===original.id);near(group.children[0].width,120);
 assert(group.children.slice(1).map(s=>s.cutStage).join() === 'puzzle-horizontal,puzzle-vertical,puzzle-outline');
 $('btn-undo').click();key('a',{metaKey:true});assert(selected()[0].type==='image');near(selected()[0].width,160);$('btn-redo').click();key('a',{metaKey:true});assert(selected()[0].puzzleMeta);
});
await test('Editing a puzzle regenerates in place and supports oval/angular pieces',async()=>{
 assert(!$('btn-edit-puzzle').hidden);$('btn-edit-puzzle').click();await ready();assert($('gen-puz-boundary').value==='custom');
 edit('gen-puz-boundary','ellipse');edit('gen-puz-style','angular');await ready();$('btn-modal-insert').click();
 const next=selected()[0];assert(next.id===group.id);assert(next.puzzleMeta.pieceStyle==='angular');assert(next.children[3].nodes.length===4);assert($('shapes-layer').children.length===1);group=next;
});
const alpha=async(url,x,y)=>{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url});const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const cctx=c.getContext('2d');cctx.drawImage(image,0,0);return cctx.getImageData(Math.floor(x*c.width),Math.floor(y*c.height),1,1).data[3]};
await test('Oval crop persists in display, full-resolution exports and saved XCS metadata',async()=>{
 const image=group.children[0];assert(await alpha(image.dataUrl,.01,.01)===0);assert(await alpha(image.dataUrl,.5,.5)===255);
 await prepareBitmapExports([group],getDefaultLaserSettings(),true);
 for(const url of [image.xcsDataUrl,image.exportDataUrl]){assert(await alpha(url,.01,.01)===0);assert(await alpha(url,.5,.5)===255)}
 const saved=importXcsStringToWorkspace(buildXcsProjectString([group])).shapes;
 const walk=s=>s.flatMap(v=>v.type==='group'?walk(v.children):[v]);const restored=walk(saved);
 assert(restored.find(s=>s.type==='image').imageMeta.puzzleClip.length===1);assert(restored.filter(s=>s.cutStage).length===3);
});
await test('Edited outer anchors are used for the new grid without resetting the photo crop',async()=>{
 reset();const edited=structuredClone(group);edited.children[3].nodes[0].x-=15;rebuildPathShapeFromNodes(edited.children[3]);paste([edited]);
 const before=selected()[0],box=computePolygonsBBox(shapeToWorldPolygons(before.children[3]));$('btn-edit-puzzle').click();await ready();$('btn-modal-insert').click();
 const after=selected()[0],newBox=computePolygonsBBox(shapeToWorldPolygons(after.children[3]));near(box.width,newBox.width,.15);near(box.x,newBox.x,.15);assert(after.children[0].imageMeta.puzzleClip);assert(after.children[3].nodes.length===before.children[3].nodes.length,'regeneration added anchors');
});
await test('Transparent motif detection clips to the silhouette; custom selection consumes only its source objects',async()=>{
 reset();const c=document.createElement('canvas');c.width=200;c.height=200;const cctx=c.getContext('2d');cctx.fillStyle='#2ab6c9';cctx.beginPath();cctx.moveTo(100,10);cctx.lineTo(190,190);cctx.lineTo(10,190);cctx.closePath();cctx.fill();const data=c.toDataURL();
 paste([{...photo,width:100,height:100,dataUrl:data,srcDataUrl:data}]);$('btn-bmp-puzzle').click();await ready();assert($('gen-preview-caption').textContent.includes('transparens'));$('btn-modal-insert').click();assert(selected()[0].children[3].width<95);
 reset();paste([{...photo},{id:'outline',type:'ellipse',laserMode:'cut',x:30,y:30,width:100,height:80,rotation:0},{id:'unrelated',type:'rect',laserMode:'cut',x:300,y:200,width:30,height:20,rotation:0}]);
 d.querySelector('[data-tab="puzzle"]').click();await ready();assert($('gen-puz-boundary').value==='custom');$('btn-modal-insert').click();assert($('shapes-layer').children.length===2,'custom outline was not consumed or unrelated object lost');assert(selected()[0].type==='group');
 $('btn-undo').click();key('a',{metaKey:true});assert(selected().length===3,'undo lost originals');
});
await test('Cancel and switching generators cannot insert a stale photo puzzle',async()=>{
 reset();paste([photo]);const before=JSON.stringify(selected());$('btn-bmp-puzzle').click();await ready();$('btn-modal-cancel').click();assert(JSON.stringify(selected())===before);
 $('btn-bmp-puzzle').click();d.querySelector('[data-tab="box"]').click();await pause(400);assert(!$('gen-puz-image'));assert($('btn-modal-insert').disabled===false);$('btn-modal-cancel').click();assert(JSON.stringify(selected())===before);
});
await test('Puzzle controls and preview fit a 320px and 1280px viewport',async()=>{
 $('btn-bmp-puzzle').click();await ready();edit('gen-puz-boundary','ellipse');await ready();
 for(const width of [320,1280]){frame.style.width=width+'px';await pause(100);
  for(const el of $('generator-modal').querySelectorAll('input,select,button')){if(!el.getClientRects().length||el.closest('[hidden]'))continue;const r=el.getBoundingClientRect();assert(r.left>=-1&&r.right<=width+1,`${el.id} overflows ${width}px`)}
 }
});
document.querySelector('#summary').textContent=`${passed} bestått, ${failed} feilet`;
