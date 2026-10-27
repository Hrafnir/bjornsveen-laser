import { encodeClipboard } from '../js/object-commands.js';
import { createWorkspaceStorage } from '../js/storage.js';
import { importXcsStringToWorkspace } from '../js/export.js';
const frame=document.querySelector('#editor');
await new Promise(r=>frame.addEventListener('load',r,{once:true}));
let w=frame.contentWindow,d=frame.contentDocument;
const $=id=>d.getElementById(id),pause=ms=>new Promise(r=>setTimeout(r,ms));
const ready=async()=>{for(let i=0;i<250&&$('save-status').textContent.includes('Åpner');i++)await pause(20);await pause(100)};
await ready();
let passed=0,failed=0;
const assert=(v,m='Assertion failed')=>{if(!v)throw Error(m)},near=(a,b)=>assert(Math.abs(a-b)<.02,`${a} != ${b}`);
async function test(name,fn){const li=document.createElement('li');document.querySelector('#results').append(li);try{await fn();li.className='pass';li.textContent='PASS: '+name;passed++}catch(e){li.className='fail';li.textContent='FAIL: '+name+' — '+e.stack;failed++}}
const edit=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));$(id).blur()};
const key=(key,extra={})=>{d.activeElement?.blur();w.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,...extra}))};
const clipboard=(action,text)=>{d.activeElement?.blur();const data=new w.DataTransfer();if(text)data.setData('text/plain',text);d.dispatchEvent(new w.ClipboardEvent(action,{clipboardData:data,bubbles:true,cancelable:true}));return data.getData('text/plain')};
const stored=async()=>{await pause(330);return (await createWorkspaceStorage().loadWorkspaceFromLocal()).workDrawing};
const view=v=>d.querySelector(`[data-drawing-view="${v}"]`).click();
const localKey=(key,extra={})=>$('dw-canvas').dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,...extra}));
const clickPoint=(x,y)=>{const svg=$('dw-canvas').querySelector('svg'),pt=svg.createSVGPoint();pt.x=x;pt.y=y;const c=pt.matrixTransform(svg.getScreenCTM());$('dw-canvas').dispatchEvent(new w.PointerEvent('pointerdown',{clientX:c.x,clientY:c.y,button:0,bubbles:true}));};
const rect=(id,name,x,y,width,height)=>({id,name,type:'rect',x,y,width,height,rotation:0,laserMode:'cut'});
const base=rect('base','Bunnplate',20,20,100,60),wall=rect('wall','Bakvegg',125,20,100,40),side=rect('side','Sidevegg',230,20,60,40);
key('Escape');d.querySelector('[data-tool="select"]').click();key('a',{metaKey:true});key('Delete');clipboard('paste',encodeClipboard([base,wall,side]));key('a',{metaKey:true});
const before=clipboard('copy');edit('laser-preset-select','mdf-3mm');
let saved,initialX;
await test('Global drawing button seeds all visible sources and selected material',async()=>{
 $('btn-work-drawing').click();$('dw-reset').click();$('dw-use-material').click();assert($('drawing-modal').classList.contains('open'));assert(d.querySelectorAll('[data-select-part]').length===3);near(Number($('dw-thickness').value),3);assert($('dw-finish').value==='mdf');initialX=Number($('dw-x').value);
 edit('dw-title','Lampe – arbeidstegning');edit('dw-project','Design og håndverk');edit('dw-author','Bjørnsveen');saved=await stored();assert(saved.title==='Lampe – arbeidstegning');
});
await test('Placements, upright planes and thickness move the preview without changing cut paths',async()=>{
 edit('dw-x','40');edit('dw-y','40');edit('dw-z','6');edit('dw-plane','xz');view('iso');assert($('dw-canvas').querySelectorAll('path').length>8);assert(!$('dw-error').textContent);view('flat');
 $('dw-close').click();key('a',{metaKey:true});assert(clipboard('copy')===before,'production geometry changed');$('btn-work-drawing').click();near(Number($('dw-z').value),6);assert($('dw-plane').value==='xz');
});
await test('Drawing undo/redo, shortcuts and focus stay inside the modal',()=>{
 const x=Number($('dw-x').value);$('dw-canvas').focus();localKey('ArrowRight',{shiftKey:true});near(Number($('dw-x').value),x+10);localKey('z',{metaKey:true});near(Number($('dw-x').value),x);localKey('z',{metaKey:true,shiftKey:true});near(Number($('dw-x').value),x+10);
 $('dw-undo').focus();$('dw-undo').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert(d.activeElement===$('dw-print'),'focus escaped backward');
 $('dw-print').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert(d.activeElement===$('dw-undo'),'focus escaped forward');
});
await test('Two snapped corners produce an editable, persistent 100 mm dimension',async()=>{
 edit('dw-plane','xy');edit('dw-rotation','0');edit('dw-x','40');edit('dw-y','40');$('dw-fit').click();$('dw-measure').click();clickPoint(40,40);clickPoint(140,40);assert($('dw-dimensions').textContent.includes('100 mm'),$('dw-error').textContent);localKey('Escape');saved=await stored();assert(saved.dimensions.length===1);edit('dw-x','50');assert($('dw-dimensions').textContent.includes('100 mm'));$('dw-undo').click();
});
await test('Duplicate, remove and history work only on documentation parts',()=>{
 $('dw-duplicate').click();assert(d.querySelectorAll('[data-select-part]').length===4);$('dw-remove').click();assert(d.querySelectorAll('[data-select-part]').length===3);$('dw-undo').click();assert(d.querySelectorAll('[data-select-part]').length===4);$('dw-redo').click();assert(d.querySelectorAll('[data-select-part]').length===3);
});
await test('Spreading parts leaves gaps for dimension text and can be undone',async()=>{
 const old=(await stored()).items.map(p=>[p.x,p.y]);$('dw-spread').click();const next=(await stored()).items.map(p=>[p.x,p.y]);assert(JSON.stringify(old)!==JSON.stringify(next));$('dw-undo').click();assert(JSON.stringify((await stored()).items.map(p=>[p.x,p.y]))===JSON.stringify(old));
});
await test('A4/A3 overview, parts list and detail pages render as standalone valid SVG',()=>{
 for(const paper of ['A4','A3']){edit('dw-paper',paper);view('sheet');assert($('dw-page').options.length===5);for(let i=0;i<5;i++){edit('dw-page',String(i));const svg=$('dw-canvas').querySelector('svg');assert(svg,'missing sheet '+i);assert(svg.getAttribute('width')===(paper==='A4'?'297mm':'420mm'));assert(!new w.DOMParser().parseFromString(svg.outerHTML,'image/svg+xml').querySelector('parsererror'));assert(svg.textContent.includes('Alle mål i mm'));}}
 edit('dw-paper','A4');edit('dw-page','0');
});
await test('Oversize fixed scale reports a useful error and recovers when fitting',()=>{
 edit('dw-scale','5');assert($('dw-error').textContent.includes('ikke plass'));assert($('dw-print').disabled);edit('dw-scale','auto');assert(!$('dw-error').textContent);assert(!$('dw-print').disabled);
});
await test('Long dimension offsets stay within printable panel bounds',async()=>{
 view('flat');edit('dw-dimension-offset','1000');$('dw-measure').click();clickPoint(40,40);clickPoint(140,40);localKey('Escape');view('sheet');assert(!$('dw-error').textContent);const svg=$('dw-canvas').querySelector('svg');for(const text of svg.querySelectorAll('.drawing-dimension text')){const b=text.getBoundingClientRect(),r=svg.getBoundingClientRect();assert(b.left>=r.left&&b.right<=r.right&&b.top>=r.top&&b.bottom<=r.bottom,'dimension outside page');}view('flat');[...d.querySelectorAll('[data-remove-dimension]')].at(-1)?.click();
});
let xcs;
await test('Save Project includes documentation; SVG download is a paper sheet',async()=>{
 const original=w.HTMLAnchorElement.prototype.click;let downloads=[];
 w.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,body:w.fetch(this.href).then(r=>r.text())})};
 try{$('dw-save').click();await pause(500);const file=downloads.find(f=>f.name.endsWith('.xcs'));assert(file,'no XCS download');xcs=await file.body;const project=importXcsStringToWorkspace(xcs);assert(project.workDrawing.title==='Lampe – arbeidstegning');assert(project.shapes.length===3);$('dw-export-svg').click();const svg=downloads.find(f=>f.name.endsWith('.svg'));assert(svg);assert((await svg.body).includes('width="297mm"'));}finally{w.HTMLAnchorElement.prototype.click=original;}
});
await test('PDF action builds all pages in an isolated print document, with no actual printing in tests',async()=>{
 let printed=false;const append=d.body.append.bind(d.body);
 d.body.append=(...els)=>{for(const el of els)if(el.classList?.contains('drawing-print-frame')){const handler=el.onload;el.onload=async()=>{el.contentWindow.print=()=>{printed=true};await handler()}}return append(...els)};
 try{$('dw-print').click();for(let i=0;i<100&&!printed;i++)await pause(20);assert(printed,'print not invoked');const print=d.querySelector('.drawing-print-frame').contentDocument;assert(print.querySelectorAll('.sheet').length===5);assert(print.querySelector('style').textContent.includes('size:297mm 210mm'));assert(print.body.scrollWidth>=1100);assert(print.querySelectorAll('svg').length===5);}finally{d.body.append=append;}
});
await test('Controls and page fit narrow viewports without horizontal overflow',async()=>{
 for(const width of [1280,820,390,320]){frame.style.width=width+'px';await pause(50);for(const el of $('drawing-modal').querySelectorAll('button,input,select,textarea,summary')){if(el.closest('[hidden]')||(!el.matches('summary')&&el.closest('details:not([open])'))||!el.getClientRects().length)continue;const b=el.getBoundingClientRect();assert(b.left>=-1&&b.right<=width+1,`${el.id} outside ${width}px: ${b.left},${b.right}`);}assert(d.documentElement.scrollWidth<=width+1,'page overflow');const b=$('dw-canvas').getBoundingClientRect();assert(b.width>200&&b.height>=100,'canvas unusable');const footer=d.querySelector('.drawing-footer').getBoundingClientRect();assert(footer.bottom<=w.innerHeight+1,`footer below viewport ${width}: ${footer.bottom}`);}
 frame.style.width='1280px';
});
await test('Opening a project restores its drawing; canvas undo/redo restores both documents',async()=>{
 const previous=await stored(),incoming=JSON.parse(xcs);incoming.bjornsveenProject.workDrawing.title='Åpnet prosjekt';$('dw-close').click();
 const files=new w.DataTransfer();files.items.add(new w.File([JSON.stringify(incoming)],'drawing-fixture.xcs',{type:'application/json'}));$('file-import-input').files=files.files;$('file-import-input').dispatchEvent(new w.Event('change',{bubbles:true}));await pause(300);
 $('btn-work-drawing').click();assert($('dw-title').value==='Åpnet prosjekt');$('dw-close').click();$('btn-undo').click();$('btn-work-drawing').click();assert($('dw-title').value===previous.title);$('dw-close').click();$('btn-redo').click();$('btn-work-drawing').click();assert($('dw-title').value==='Åpnet prosjekt');$('dw-close').click();$('btn-undo').click();$('btn-work-drawing').click();
});
await test('Deleted source parts warn instead of silently reusing stale geometry; undo restores them',()=>{
 $('dw-close').click();key('a',{metaKey:true});key('Delete');$('btn-work-drawing').click();assert($('dw-status').textContent.includes('mangler'));assert(!$('dw-canvas').querySelector('[data-drawing-item]'));$('dw-close').click();$('btn-undo').click();$('btn-work-drawing').click();assert(!$('dw-status').textContent.includes('mangler'));assert($('dw-canvas').querySelector('[data-drawing-item]'));
});
await test('Autosave restores title, dimensions and assembly placements after reload',async()=>{
 await pause(350);const old=await stored();$('dw-close').click();await new Promise(resolve=>{frame.addEventListener('load',resolve,{once:true});frame.src='../index.html?drawing-reload=1'});w=frame.contentWindow;d=frame.contentDocument;await ready();$('btn-work-drawing').click();assert($('dw-title').value===old.title);assert(JSON.stringify((await stored()).items)===JSON.stringify(old.items));assert(d.querySelectorAll('[data-remove-dimension]').length===old.dimensions.length);
});
await test('Assembly placement is independent from flat dimension layout',async()=>{
 view('flat');const x=Number($('dw-x').value);view('iso');edit('dw-x','80');edit('dw-rotation','30');view('flat');near(Number($('dw-x').value),x);near(Number($('dw-rotation').value),0);view('iso');near(Number($('dw-x').value),80);near(Number($('dw-rotation').value),30);
});
// Leave a coherent sample assembly for visual review, using the actual controls.
view('flat');$('dw-spread').click();view('iso');const buttons=()=>[...d.querySelectorAll('[data-select-part]')];
buttons()[0].click();edit('dw-rotation','0');edit('dw-x','20');edit('dw-y','20');edit('dw-z','0');edit('dw-plane','xy');
buttons()[1].click();edit('dw-x','20');edit('dw-y','0');edit('dw-z','3');edit('dw-plane','xz');
buttons()[2].click();edit('dw-x','-10');edit('dw-y','30');edit('dw-z','3');edit('dw-plane','yz');
view('sheet');edit('dw-page','0');
document.querySelector('#summary').textContent=`${passed} bestått, ${failed} feilet`;
