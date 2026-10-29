import { encodeClipboard } from '../js/object-commands.js';
import { createWorkspaceStorage } from '../js/storage.js';
import { parseProjectDocument } from '../js/project-document.js';
import { importXcsStringToWorkspace, buildXcsProjectString } from '../js/export.js';
const frame=document.querySelector('#editor');
await new Promise(r=>frame.addEventListener('load',r,{once:true}));
let w=frame.contentWindow,d=frame.contentDocument;
const $=id=>d.getElementById(id),pause=ms=>new Promise(r=>setTimeout(r,ms));
const ready=async()=>{for(let i=0;i<250&&$('save-status').textContent.includes('Åpner');i++)await pause(20);await pause(100)};
await ready();
if(w.showSaveFilePicker)w.showSaveFilePicker=async()=>null;
let passed=0,failed=0;
const assert=(v,m='Assertion failed')=>{if(!v)throw Error(m)},near=(a,b)=>assert(Math.abs(a-b)<.02,`${a} != ${b}`);
async function test(name,fn){const li=document.createElement('li');document.querySelector('#results').append(li);try{await fn();li.className='pass';li.textContent='PASS: '+name;passed++}catch(e){li.className='fail';li.textContent='FAIL: '+name+' — '+e.stack;failed++}}
const edit=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));$(id).blur()};
const key=(key,extra={})=>{d.activeElement?.blur();w.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,...extra}))};
const clipboard=(action,text)=>{d.activeElement?.blur();const data=new w.DataTransfer();if(text)data.setData('text/plain',text);d.dispatchEvent(new w.ClipboardEvent(action,{clipboardData:data,bubbles:true,cancelable:true}));return data.getData('text/plain')};
const stored=async()=>{await pause(330);return (await createWorkspaceStorage().loadWorkspaceFromLocal()).workDrawing};
const output=(kind,scope='all')=>{d.querySelector('#dw-project-menu [data-project-action="document"]').click();edit('project-output-kind',kind);edit('project-output-scope',scope);d.querySelector('.project-dialog [data-output]').click()};
const view=v=>d.querySelector(`[data-drawing-view="${v}"]`).click();
const localKey=(key,extra={})=>$('dw-canvas').dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,...extra}));
const clickPoint=(x,y)=>{const svg=$('dw-canvas').querySelector('svg'),pt=svg.createSVGPoint();pt.x=x;pt.y=y;const c=pt.matrixTransform(svg.getScreenCTM());$('dw-canvas').dispatchEvent(new w.PointerEvent('pointerdown',{clientX:c.x,clientY:c.y,button:0,bubbles:true}));};
const rect=(id,name,x,y,width,height)=>({id,name,type:'rect',x,y,width,height,rotation:0,laserMode:'cut'});
const base=rect('base','Bunnplate',20,20,100,60),wall=rect('wall','Bakvegg',125,20,100,40),side=rect('side','Sidevegg',230,20,60,40);
key('Escape');d.querySelector('[data-tool="select"]').click();key('a',{metaKey:true});key('Delete');clipboard('paste',encodeClipboard([base,wall,side]));key('a',{metaKey:true});
const fixtureFile=new w.DataTransfer();fixtureFile.items.add(new w.File([JSON.stringify({shapes:JSON.parse(clipboard('copy')).shapes,workDrawing:null})],'fresh-drawing.json',{type:'application/json'}));$('project-document-input').files=fixtureFile.files;$('project-document-input').dispatchEvent(new w.Event('change',{bubbles:true}));await pause(100);d.querySelector('.project-dialog [data-keep]')?.click();await pause(300);key('a',{metaKey:true});
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
 $('dw-undo').focus();$('dw-undo').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert(d.activeElement===$('dw-canvas'),'focus escaped backward');
 $('dw-canvas').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert(d.activeElement===$('dw-undo'),'focus escaped forward');
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
 try{$('dw-save').click();await pause(500);const file=downloads.find(f=>f.name.endsWith('.laserprosjekt'));assert(file,'no project download');const project=parseProjectDocument(await file.body);xcs=buildXcsProjectString(project.shapes,project);assert(project.workDrawing.title==='Lampe – arbeidstegning');assert(project.shapes.length===3);output('svg','current');const svg=downloads.find(f=>f.name.endsWith('.svg'));assert(svg);assert((await svg.body).includes('width="297mm"'));}finally{w.HTMLAnchorElement.prototype.click=original;}
});
await test('PDF action builds all pages in an isolated print document, with no actual printing in tests',async()=>{
 let printed=false;const append=d.body.append.bind(d.body);
 d.body.append=(...els)=>{for(const el of els)if(el.classList?.contains('drawing-print-frame')){const handler=el.onload;el.onload=async()=>{el.contentWindow.print=()=>{printed=true};await handler()}}return append(...els)};
 try{output('pdf');for(let i=0;i<100&&!printed;i++)await pause(20);assert(printed,'print not invoked');const print=d.querySelector('.drawing-print-frame').contentDocument;assert(print.querySelectorAll('.sheet').length===5);assert(print.querySelector('style').textContent.includes('size:297mm 210mm'));assert(print.body.scrollWidth>=1100);assert(print.querySelectorAll('svg').length===5);}finally{d.body.append=append;}
});
await test('Controls and page fit narrow viewports without horizontal overflow',async()=>{
 for(const width of [1280,820,390,320]){frame.style.width=width+'px';await pause(50);for(const el of $('drawing-modal').querySelectorAll('button,input,select,textarea,summary')){if(el.closest('[hidden]')||[...function*(node){for(let p=node.parentElement;p;p=p.parentElement)yield p}(el)].some(p=>p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope > summary')?.contains(el))||!el.getClientRects().length)continue;const b=el.getBoundingClientRect();assert(b.left>=-1&&b.right<=width+1,`${el.id} outside ${width}px: ${b.left},${b.right}`);}assert(d.documentElement.scrollWidth<=width+1,'page overflow');const b=$('dw-canvas').getBoundingClientRect();assert(b.width>200&&b.height>=100,'canvas unusable');const footer=d.querySelector('.drawing-footer').getBoundingClientRect();assert(footer.bottom<=w.innerHeight+1,`footer below viewport ${width}: ${footer.bottom}`);}
 frame.style.width='1280px';
});
await test('Opening a project restores its drawing and starts independent undo history',async()=>{
 const incoming=JSON.parse(xcs);incoming.bjornsveenProject.workDrawing.title='Åpnet prosjekt';$('dw-close').click();
 const files=new w.DataTransfer();files.items.add(new w.File([JSON.stringify(incoming)],'drawing-fixture.xcs',{type:'application/json'}));$('project-document-input').files=files.files;$('project-document-input').dispatchEvent(new w.Event('change',{bubbles:true}));await pause(100);d.querySelector('.project-dialog [data-keep]')?.click();await pause(300);
 assert($('btn-undo').disabled&&$('btn-redo').disabled,'project switch retained another project’s history');$('btn-work-drawing').click();assert($('dw-title').value==='Åpnet prosjekt');$('dw-close').click();$('btn-undo').click();$('btn-work-drawing').click();assert($('dw-title').value==='Åpnet prosjekt');
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
await test('Material bank applies distinct appearances and thickness, with an override per part',async()=>{
 view('flat');edit('dw-material-preset','plywood-birch');$('dw-apply-material').click();assert($('dw-material').value==='Bjørkekryssfiner');near(Number($('dw-thickness').value),3);
 edit('dw-item-material','walnut');near(Number($('dw-item-thickness').value),6);view('iso');assert($('dw-canvas').innerHTML.includes('#79563e'));const doc=await stored();assert(doc.materialId==='plywood-birch');assert(doc.items.some(p=>p.materialId==='walnut'));edit('dw-item-material','');
});
await test('Custom documentation pages support notes, callouts and independent view layout',async()=>{
 view('sheet');$('dw-add-page').click();edit('dw-page-title','Montering og overflate');$('dw-add-callout').click();edit('dw-note-text','Lim sideveggene mot bunnen.\nPuss kantene før montering.');edit('dw-note-x','160');edit('dw-note-y','120');edit('dw-note-width','100');edit('dw-note-target-x','220');edit('dw-note-target-y','90');assert($('dw-canvas').textContent.includes('Lim sideveggene'));
 edit('dw-edit-view','flat');edit('dw-view-width','110');edit('dw-view-height','90');edit('dw-view-x','15');edit('dw-view-y','35');const doc=await stored();assert(doc.customPages.at(-1).title==='Montering og overflate');assert(doc.annotations.at(-1).kind==='callout');assert(doc.sheetLayouts['custom:'+doc.customPages.at(-1).id].flat.width>0);
});
await test('Notes and view frames drag on paper, undo restores their positions',async()=>{
 const host=$('dw-canvas'),capture=host.setPointerCapture;host.setPointerCapture=()=>{};
 const send=(type,p,target=host)=>{const svg=host.querySelector('svg'),q=svg.createSVGPoint();q.x=p.x;q.y=p.y;const c=q.matrixTransform(svg.getScreenCTM());target.dispatchEvent(new w.PointerEvent(type,{clientX:c.x,clientY:c.y,button:0,bubbles:true}));};
 try{let a=(await stored()).annotations.at(-1);const x=a.x,y=a.y;send('pointerdown',{x:x+5,y:y+5},host.querySelector('[data-annotation-id] rect'));send('pointermove',{x:x-5,y:y-5});send('pointerup',{x:x-5,y:y-5});a=(await stored()).annotations.at(-1);near(a.x,x-10);near(a.y,y-10);$('dw-undo').click();near((await stored()).annotations.at(-1).x,x);
 const vx=Number($('dw-view-x').value);send('pointerdown',{x:20,y:40},host.querySelector('[data-sheet-view="flat"] rect'));send('pointermove',{x:30,y:50});send('pointerup',{x:30,y:50});near(Number($('dw-view-x').value),vx+10);$('dw-undo').click();near(Number($('dw-view-x').value),vx);
 }finally{host.setPointerCapture=capture;}
});
await test('A dimension can be created directly on a sheet and edited without changing its actual length',async()=>{
 $('dw-measure').click();const svg=$('dw-canvas').querySelector('svg'),g=svg.querySelector('[data-view-transform="flat"]'),part=g.querySelector('[data-drawing-item]');const box=part.getBBox();
 const hit=(x,y)=>{const q=svg.createSVGPoint();q.x=x;q.y=y;const p=q.matrixTransform(g.getScreenCTM());part.dispatchEvent(new w.PointerEvent('pointerdown',{clientX:p.x,clientY:p.y,button:0,bubbles:true}));};
 // Use geometry bounds (excluding labels) to select two real rectangle corners.
 const geometry=part.querySelector('path').getBBox();hit(geometry.x,geometry.y);
 const current=$('dw-canvas').querySelector('[data-view-transform="flat"] [data-drawing-item]');const matrix=$('dw-canvas').querySelector('[data-view-transform="flat"]').getScreenCTM(),q=svg.createSVGPoint();q.x=geometry.x+geometry.width;q.y=geometry.y;const p=q.matrixTransform(matrix);current.dispatchEvent(new w.PointerEvent('pointerdown',{clientX:p.x,clientY:p.y,button:0,bubbles:true}));
 localKey('Escape');const old=(await stored()).dimensions.at(-1);assert(old);edit('dw-edit-dimension-label','Bredde');edit('dw-edit-dimension-offset','-15');edit('dw-edit-dimension-kind','horizontal');assert($('dw-canvas').textContent.includes('Bredde ·'));const next=(await stored()).dimensions.at(-1);assert(next.labelText==='Bredde'&&next.offset===-15);assert(JSON.stringify(old.a)===JSON.stringify(next.a));
});
await test('Existing dimension lines drag on paper; zoom only changes the screen view',async()=>{
 const host=$('dw-canvas'),capture=host.setPointerCapture;host.setPointerCapture=()=>{};const previous=(await stored()).dimensions.at(-1);
 try{const target=[...host.querySelectorAll('[data-dimension-id]')].at(-1).querySelector('path:last-child'),mid=target.getPointAtLength(target.getTotalLength()/2),screen=mid.matrixTransform(target.getScreenCTM());
 target.dispatchEvent(new w.PointerEvent('pointerdown',{clientX:screen.x,clientY:screen.y,button:0,bubbles:true}));host.dispatchEvent(new w.PointerEvent('pointermove',{clientX:screen.x,clientY:screen.y+10,button:0,bubbles:true}));host.dispatchEvent(new w.PointerEvent('pointerup',{clientX:screen.x,clientY:screen.y+10,button:0,bubbles:true}));
 const after=(await stored()).dimensions.at(-1);assert(Number.isFinite(after.offset));assert(Math.abs(after.offset-previous.offset)>1);assert(JSON.stringify(after.a)===JSON.stringify(previous.a));$('dw-undo').click();near((await stored()).dimensions.at(-1).offset,previous.offset);
 }finally{host.setPointerCapture=capture;}
 const saved=JSON.stringify(await stored()),before=host.querySelector('svg').getBoundingClientRect().width;edit('dw-paper-zoom','2');await pause(30);assert(host.querySelector('svg').getBoundingClientRect().width>before*1.9);assert(host.scrollWidth>host.clientWidth);assert(JSON.stringify(await stored())===saved);edit('dw-paper-zoom','1');
});
await test('Overflowing notes are flagged; long project notes get complete extra pages',async()=>{
 $('dw-add-note').click();edit('dw-note-text','Lang informasjon '.repeat(180));edit('dw-note-y','160');assert(!$('dw-error').hidden);assert($('dw-export-svg').disabled);$('dw-remove-note').click();assert($('dw-error').hidden);edit('dw-notes','Prosjektnotat: '.repeat(90)+'SISTE LINJE BEVART');view('sheet');assert([...$('dw-page').options].some(o=>o.textContent.includes('Prosjektnotater')));const value=[...$('dw-page').options].find(o=>o.textContent.includes('Prosjektnotater')).value;edit('dw-page',value);assert($('dw-canvas').textContent.includes('SISTE LINJE BEVART'));edit('dw-notes','');
});
await test('Custom annotations and layout survive reopening; export excludes editing frames',async()=>{
 const saved=await stored();$('dw-close').click();$('btn-work-drawing').click();assert(JSON.stringify((await stored()).annotations)===JSON.stringify(saved.annotations));view('sheet');const option=[...$('dw-page').options].find(o=>o.textContent==='Montering og overflate');edit('dw-page',option.value);assert($('dw-canvas').textContent.includes('Puss kantene'));
 const original=w.HTMLAnchorElement.prototype.click;let content;w.HTMLAnchorElement.prototype.click=function(){content=w.fetch(this.href).then(r=>r.text())};try{$('dw-export-svg').click();const svg=await content;assert(svg.includes('Puss kantene'));assert(!svg.includes('stroke-dasharray="2 1"'));assert(svg.includes('data-annotation-id'));}finally{w.HTMLAnchorElement.prototype.click=original;}
});
await test('Page-editing controls remain inside narrow viewports',async()=>{
 for(const width of [390,320]){frame.style.width=width+'px';await pause(60);for(const el of $('dw-page-editor').querySelectorAll('button,input,select,textarea')){if(el.closest('[hidden]')||!el.getClientRects().length)continue;const b=el.getBoundingClientRect();assert(b.left>=-1&&b.right<=width+1,el.id+' overflow');}}
 frame.style.width='1280px';
});

await test('One pager keeps other pages and prints only the selected project sheet',async()=>{
 $('dw-onepager').click();assert($('dw-print-scope').value==='current');assert($('dw-canvas').textContent.includes('Ark 1/1'));assert($('dw-canvas').textContent.includes('Materialvisning'));assert($('dw-canvas').textContent.includes('Måltegning'));edit('dw-note-text','Monter og lim delene. Puss kantene før maling.');
 const count=(await stored()).annotations.length;$('dw-onepager').click();assert((await stored()).annotations.length===count);assert($('dw-canvas').textContent.includes('Monter og lim'));
 let printed=0;const append=d.body.append.bind(d.body);d.body.append=(...els)=>{for(const el of els)if(el.classList?.contains('drawing-print-frame')){const handler=el.onload;el.onload=async()=>{el.contentWindow.print=()=>{printed++};await handler()}}return append(...els)};
 try{for(const button of ['dw-print','dw-pdf']){const before=printed;$(button).click();for(let i=0;i<100&&printed===before;i++)await pause(20);assert(printed>before);const doc=d.querySelector('.drawing-print-frame').contentDocument;assert(doc.querySelectorAll('.sheet').length===1);assert(doc.body.textContent.includes('Monter og lim'));assert(doc.body.textContent.includes('Ark 1/1'));}assert([...$('dw-page').options].some(o=>o.textContent.includes('Detalj')));}finally{d.body.append=append;}
});
await test('Text box can be placed, edited on the sheet, moved and reopened',async()=>{
 $('dw-place-note').click();clickPoint(170,100);const editor=$('dw-canvas').querySelector('textarea');assert(editor,'inline editor missing');editor.value='Limfuge: bruk trelim';editor.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}));assert($('dw-canvas').textContent.includes('Limfuge'));const doc=await stored(),a=doc.annotations.at(-1);near(a.x,170);near(a.y,100);
 const target=$('dw-canvas').querySelector(`[data-annotation-id="${a.id}"]`);target.dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true}));const second=$('dw-canvas').querySelector('textarea');assert(second);second.value='Limfuge: press sammen i 30 minutter';second.blur();assert($('dw-canvas').textContent.includes('30 minutter'));
 $('dw-close').click();$('btn-work-drawing').click();assert($('dw-canvas').textContent.includes('30 minutter'));assert($('dw-print-scope').value==='current');
});

// Leave a coherent sample assembly for visual review, using the actual controls.
view('flat');$('dw-spread').click();view('iso');const buttons=()=>[...d.querySelectorAll('[data-select-part]')];
buttons()[0].click();edit('dw-rotation','0');edit('dw-x','20');edit('dw-y','20');edit('dw-z','0');edit('dw-plane','xy');
buttons()[1].click();edit('dw-x','20');edit('dw-y','0');edit('dw-z','3');edit('dw-plane','xz');
buttons()[2].click();edit('dw-x','-10');edit('dw-y','30');edit('dw-z','3');edit('dw-plane','yz');
view('sheet');edit('dw-page','0');
document.querySelector('#summary').textContent=`${passed} bestått, ${failed} feilet`;
