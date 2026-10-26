import { buildSmoothSplineLoop, createPathShapeFromPolygons, pathNodesInWorld, parseSvgPathToPolygons } from '../js/geometry.js';
const frame=document.querySelector('#editor');
await new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
const w=frame.contentWindow,d=frame.contentDocument,$=id=>d.getElementById(id);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
for(let i=0;i<250 && $('save-status').textContent.includes('Åpner');i++) await pause(20);
await pause(100);
let passed=0,failed=0;
const assert=(v,m='Assertion failed')=>{if(!v)throw new Error(m)};
const near=(a,b,t=.03)=>assert(Math.abs(a-b)<t,`${a} != ${b}`);
async function test(name,fn){const li=document.createElement('li');document.querySelector('#results').append(li);try{await fn();li.textContent='PASS: '+name;li.className='pass';passed++}catch(e){li.textContent='FAIL: '+name+' — '+e.message;li.className='fail';failed++}}
const key=(key,extra={})=>{d.activeElement?.blur();w.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,...extra}))};
const tool=t=>d.querySelector(`[data-tool="${t}"]`).click();
const shapes=()=>[...$('shapes-layer').children].filter(el=>el.dataset.id);
const points=el=>parseSvgPathToPolygons(el.getAttribute('d'),.05)[0];
const point=(x,y)=>{const r=$('canvas-viewport').getBoundingClientRect(),b=$('main-svg').viewBox.baseVal;return{clientX:r.left+(x-b.x)/b.width*r.width,clientY:r.top+(y-b.y)/b.height*r.height}};
const pointer=(type,x,y,target=$('main-svg'),extra={})=>target.dispatchEvent(new w.PointerEvent(type,{...point(x,y),button:0,buttons:type==='pointerup'?0:1,bubbles:true,...extra}));
const click=(x,y,target,extra={})=>{pointer('pointerdown',x,y,target,extra);pointer('pointerup',x,y,undefined,extra)};
const drag=(a,b,target,extra={})=>{pointer('pointerdown',...a,target,extra);pointer('pointermove',...b,undefined,extra);pointer('pointerup',...b,undefined,extra)};
const edit=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));$(id).blur()};
const reset=()=>{key('Escape');tool('select');key('a',{metaKey:true});key('Delete');$('object-snap-toggle').checked=true;$('object-snap-toggle').dispatchEvent(new w.Event('change'));edit('snap-select','0')};
const chain=(pts,finish=true)=>{tool('line');pts.forEach(p=>click(...p));if(finish)key('Enter')};
await test('L adds several segments, finishes with Enter, and undo/redo restores one editable path',()=>{
 reset();chain([[20,20],[80,20],[80,60]]);assert(shapes().length===1);assert(points(shapes()[0]).length===3);
 $('btn-undo').click();assert(shapes().length===0);$('btn-redo').click();assert(shapes().length===1);
});
await test('L extends selected endpoints instead of dragging their editing handles',()=>{
 tool('line');click(80,60);click(120,60);key('Enter');assert(shapes().length===1);assert(points(shapes()[0]).length===4);near(points(shapes()[0]).at(-1).x,120);
});
await test('L closes a shape; fill and outline change the rendered operation',()=>{
 reset();chain([[30,30],[90,30],[90,80]],false);click(30,30);assert(shapes().length===1,'closed shape count '+shapes().length);assert(points(shapes()[0]).closed!==false,'path did not close: '+shapes()[0].getAttribute('d'));
 $('btn-shape-fill').click();assert(shapes()[0].getAttribute('fill')!=='none','fill failed; disabled='+$('btn-shape-fill').disabled);$('btn-shape-outline').click();assert(shapes()[0].getAttribute('fill')==='none','outline failed');
});
await test('Backspace removes only the last draft point, Escape keeps confirmed segments, tool switch commits',()=>{
 reset();chain([[20,20],[80,20],[80,80]],false);key('Backspace');key('Escape');assert(points(shapes()[0]).length===2);
 chain([[160,20],[200,20]],false);tool('select');assert(shapes().length===2);
});
await test('drag draws a segment; double-click finish never creates duplicate nodes',()=>{
 reset();tool('line');drag([30,30],[90,30]);key('Enter');assert(shapes().length===1);assert(points(shapes()[0]).length===2);
 tool('line');click(160,30);click(200,30);pointer('pointerdown',200,30,undefined,{detail:2});pointer('pointerup',200,30);$('main-svg').dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true}));assert(shapes().length===2);assert(points(shapes()[1]).length===2);
});
await test('connecting two existing paths merges them; crossing selection selects partially touched lines',()=>{
 reset();chain([[20,20],[80,20]]);chain([[140,20],[200,20]]);chain([[80,20],[140,20]]);assert(shapes().length===1);assert(points(shapes()[0]).length===4);
 tool('select');click(250,150);drag([60,10],[65,30]);assert(!$('prop-x').disabled,'crossing selection missed long line');
});
await test('moving near another endpoint snaps exactly; Alt bypasses snapping',()=>{
 reset();chain([[20,40],[60,40]]);chain([[100,80],[140,80]]);tool('select');click(250,150);
 drag([40,40],[79,80],shapes()[0]);const p=points(shapes()[0]);near(p.at(-1).x,100);near(p.at(-1).y,80);
 $('btn-undo').click();tool('select');click(250,150);drag([40,40],[79,80],shapes()[0],{altKey:true});near(points(shapes()[0]).at(-1).x,99);
});
await test('join selected lines produces one path and offset keeps the original',()=>{
 reset();$('object-snap-toggle').checked=false;$('object-snap-toggle').dispatchEvent(new w.Event('change'));
 chain([[20,20],[80,20]]);chain([[80,20],[120,60]]);tool('select');key('a',{metaKey:true});$('btn-join-lines').click();assert(shapes().length===1);
 edit('offset-kind','parallel');edit('offset-dist-input','3');$('btn-create-offset').click();assert(shapes().length===2);assert(points(shapes()[0]).closed===false);
});
await test('filled rectangle gets an exact outer offset and changes can be undone',()=>{
 reset();tool('rect');drag([30,30],[90,70]);$('btn-shape-fill').click();assert(shapes()[0].getAttribute('fill')!=='none');
 edit('offset-kind','contour');edit('offset-dist-input','2');$('btn-create-offset').click();assert(shapes().length===2);
 const pts=points(shapes()[0]);near(Math.min(...pts.map(p=>p.x)),28);near(Math.max(...pts.map(p=>p.x)),92);
 $('btn-undo').click();assert(shapes().length===1);$('btn-redo').click();assert(shapes().length===2);
});
await test('snapping remains available for drawn curves and can be turned off',()=>{
 reset();tool('line');$('prop-curve-toggle').checked=true;$('prop-curve-toggle').dispatchEvent(new w.Event('change',{bubbles:true}));
 click(20,30);click(60,60);click(100,30);key('Enter');assert(shapes().length===1);assert(points(shapes()[0]).length>3);
 $('object-snap-toggle').checked=false;$('object-snap-toggle').dispatchEvent(new w.Event('change'));tool('line');pointer('pointermove',100,30);assert(!$('line-snap-marker'));
});
const clipboard=(action, text=null, target=d)=>{
 const data=new w.DataTransfer();if(text!==null)data.setData('text/plain',text);
 const event=new w.ClipboardEvent(action,{clipboardData:data,bubbles:true,cancelable:true});target.dispatchEvent(event);
 return {text:data.getData('text/plain'),handled:event.defaultPrevented};
};
const ids=()=>shapes().map(el=>el.dataset.id);
const selectRow=(id,shift=false)=>d.querySelector(`#layer-list [data-id="${id}"]`).dispatchEvent(new w.MouseEvent('click',{bubbles:true,shiftKey:shift}));
const order=direction=>d.querySelector(`[data-order="${direction}"]`).click();
await test('copy/paste preserves a multi-selection, uses fresh IDs and offsets repeated pastes',()=>{
 reset();tool('rect');drag([20,20],[60,50]);tool('ellipse');drag([100,30],[130,60]);tool('select');key('a',{metaKey:true});
 const original=ids(), copy=clipboard('copy');assert(copy.handled);assert(JSON.parse(copy.text).shapes.length===2);
 clipboard('paste',copy.text);assert(shapes().length===4);assert(ids().slice(2).every(id=>!original.includes(id)));
 near(Number($('prop-x').value),28);clipboard('paste',copy.text);assert(shapes().length===6);near(Number($('prop-x').value),36);
 key('z',{metaKey:true});assert(shapes().length===4);key('y',{ctrlKey:true});assert(shapes().length===6);
});
await test('cut removes only selected objects and undo restores them; clipboard survives deletion',()=>{
 reset();tool('rect');drag([20,20],[60,50]);tool('ellipse');drag([100,30],[130,60]);tool('select');
 const cut=clipboard('cut');assert(cut.handled);assert(shapes().length===1);key('z',{metaKey:true});assert(shapes().length===2);
 clipboard('paste',cut.text);assert(shapes().length===3);
});
await test('groups roundtrip intact; Cmd+A, paste and order operate inside the edited group',()=>{
 reset();tool('rect');drag([20,20],[60,50]);tool('ellipse');drag([100,30],[130,60]);tool('select');key('a',{metaKey:true});key('g',{metaKey:true});
 const copied=clipboard('copy').text;clipboard('paste',copied);assert(shapes().length===2);assert(shapes()[1].children.length===2);
 const groupId=ids()[1];d.querySelector(`#layer-list [data-id="${groupId}"] [data-action="edit-group"]`).click();key('a',{metaKey:true});
 assert(JSON.parse(clipboard('copy').text).shapes.length===2);const children=JSON.parse(clipboard('copy').text).shapes;
 selectRow(children[0].id);order('front');assert(JSON.parse(clipboard('copy').text).shapes[0].id===children[0].id);
 key('a',{metaKey:true});const reordered=JSON.parse(clipboard('copy').text).shapes;assert(reordered[1].id===children[0].id);
 clipboard('paste',clipboard('copy').text);key('a',{metaKey:true});assert(JSON.parse(clipboard('copy').text).shapes.length===4);
 key('Escape');assert(shapes().length===2);assert(shapes()[1].children.length===4);
});
await test('front/back and step buttons change SVG paint order and list order, with undo and keyboard support',()=>{
 reset();tool('rect');drag([20,20],[90,90]);tool('ellipse');drag([30,30],[80,80]);tool('rect');drag([40,40],[100,100]);tool('select');
 const original=ids();selectRow(original[0]);order('forward');assert(ids().join() === [original[1],original[0],original[2]].join());
 key('ArrowUp',{metaKey:true,shiftKey:true});assert(ids().at(-1)===original[0]);
 assert(d.querySelector('#layer-list .layer-item').dataset.id===original[0]);
 order('back');assert(ids().join()===original.join());key('z',{metaKey:true});assert(ids().at(-1)===original[0]);
 selectRow(original[0]);key('ArrowDown',{ctrlKey:true});assert(ids()[1]===original[0]);
});
await test('visibility of objects and group children can be undone without changing their order',()=>{
 const original=ids();d.querySelector(`#layer-list [data-id="${original[0]}"] [data-action="toggle-vis"]`).click();assert(shapes().length===2);
 key('z',{metaKey:true});assert(ids().join()===original.join());key('a',{metaKey:true});key('g',{metaKey:true});
 const row=d.querySelector('#layer-list .group-child'), id=row.dataset.id;row.querySelector('[data-caction="toggle-vis"]').click();assert(shapes()[0].children.length===2);
 key('z',{metaKey:true});assert(shapes()[0].children.length===3);assert(d.querySelector(`#layer-list [data-id="${id}"]`));
});
await test('native text fields, contenteditable and modal dialogs keep their shortcuts',()=>{
 const before=shapes().length,input=$('text-content-input');input.focus();assert(!clipboard('copy',null,input).handled);assert(!clipboard('paste','Hei',input).handled);
 const event=new w.KeyboardEvent('keydown',{key:'a',metaKey:true,bubbles:true,cancelable:true});input.dispatchEvent(event);assert(!event.defaultPrevented);input.blur();
 const editable=d.createElement('div');editable.contentEditable='true';d.body.appendChild(editable);editable.focus();assert(!clipboard('cut',null,editable).handled);editable.remove();
 $('generator-modal').classList.add('open');assert(!clipboard('paste','Hei').handled);key('Delete');assert(shapes().length===before);key('Escape');assert(!$('generator-modal').classList.contains('open'));
});
await test('external SVG and plain text paste as editable objects',()=>{
 reset();clipboard('paste','<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><rect width="20" height="10"/></svg>');assert(shapes().length===1);near(Number($('prop-w').value),20);
 clipboard('paste','Hei æøå');assert(shapes().length===2);assert(JSON.parse(clipboard('copy').text).shapes[0].textMeta.text==='Hei æøå');
});
await test('L snaps to rectangle corners without joining or modifying the rectangle',()=>{
 reset();tool('rect');drag([100,80],[180,140]);const rectangle=shapes()[0].getAttribute('d');
 tool('line');click(40,150);pointer('pointermove',99,81);assert($('line-snap-marker'),'corner preview missing');click(99,81);key('Enter');
 assert(shapes().length===2);assert(shapes()[0].getAttribute('d')===rectangle);const p=points(shapes()[1]).at(-1);near(p.x,100,.001);near(p.y,80,.001);
 tool('line');click(179,139);click(220,170);key('Enter');assert(shapes().length===3);near(points(shapes()[2])[0].x,180,.001);near(points(shapes()[2])[0].y,140,.001);
});
await test('dragging a line node snaps to a corner, supports undo, Alt and the on/off switch',()=>{
 reset();tool('rect');drag([100,80],[180,140]);chain([[20,180],[80,100]]);tool('select');
 const handle=()=>d.querySelector('[data-handle="node-1"]');pointer('pointerdown',80,100,handle());pointer('pointermove',99,81);assert($('object-snap-marker'));pointer('pointerup',99,81);
 near(points(shapes()[1]).at(-1).x,100,.001);near(points(shapes()[1]).at(-1).y,80,.001);key('z',{metaKey:true});near(points(shapes()[1]).at(-1).x,80);
 selectRow(ids()[1]);pointer('pointerdown',80,100,handle());pointer('pointermove',99,81,undefined,{altKey:true});assert(!$('object-snap-marker'));pointer('pointerup',99,81,undefined,{altKey:true});near(points(shapes()[1]).at(-1).x,99);
 $('object-snap-toggle').checked=false;$('object-snap-toggle').dispatchEvent(new w.Event('change'));drag([99,81],[101,79],handle());near(points(shapes()[1]).at(-1).x,101);near(points(shapes()[1]).at(-1).y,79);
});
await test('rotated path node editing preserves other nodes while snapping exactly to a corner',()=>{
 reset();tool('rect');drag([140,80],[180,120]);chain([[20,180],[80,140]]);tool('select');edit('prop-rot','30');
 const before=points(shapes()[1]), last=before.at(-1);drag([last.x,last.y],[139,81],d.querySelector('[data-handle="node-1"]'));
 const after=points(shapes()[1]);near(after[0].x,before[0].x,.002);near(after[0].y,before[0].y,.002);near(after.at(-1).x,140,.002);near(after.at(-1).y,80,.002);
});
await test('legacy line handles and moving a complete line snap to rectangle corners',()=>{
 reset();tool('rect');drag([100,80],[180,140]);clipboard('paste',JSON.stringify({format:'bjornsveen-laserstudio/clipboard',version:1,shapes:[{id:'legacy',type:'line',x:20,y:120,width:40,height:40,x1:20,y1:160,x2:60,y2:120,laserMode:'cut'}]}));
 drag([68,128],[99,81],d.querySelector('[data-handle="line-p2"]'));const shape=JSON.parse(clipboard('copy').text).shapes[0];near(shape.x2,100,.001);near(shape.y2,80,.001);
 reset();tool('rect');drag([100,80],[180,140]);chain([[20,180],[60,120]]);tool('select');drag([40,150],[79,111],shapes()[1]);near(points(shapes()[1]).at(-1).x,100,.001);near(points(shapes()[1]).at(-1).y,80,.001);
});
const setText=value=>{const el=$('text-content-input');el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.blur()};
const textMeta=()=>JSON.parse(clipboard('copy').text).shapes[0].textMeta;
const addText=(value='ABC')=>{tool('text');edit('text-direction-select','horizontal');$('text-curve-input').value='0';$('text-curve-input').dispatchEvent(new w.Event('input'));edit('text-font-select','playfair');edit('text-spacing-input','1');setText(value);click(70,160);$('text-content-input').blur()};
await test('text reads up/down, retains metadata on paste and direction edits are undoable',()=>{
 reset();addText('ÆØÅ ABC');const width=Number($('prop-w').value),height=Number($('prop-h').value);
 edit('text-direction-select','down');near(Number($('prop-w').value),height);near(Number($('prop-h').value),width);assert(textMeta().writingDirection==='down');
 key('z',{metaKey:true});selectRow(ids()[0]);assert(textMeta().writingDirection==='horizontal');edit('text-direction-select','up');const copied=clipboard('copy').text;clipboard('paste',copied);assert(shapes().length===2);assert(textMeta().writingDirection==='up');
});
await test('stacked text, numeric tracking and the spacing slider update immediately',()=>{
 reset();addText('ABC');edit('text-direction-select','stacked-down');assert(Number($('prop-h').value)>Number($('prop-w').value));const height=Number($('prop-h').value);
 $('text-spacing-slider').value='3';$('text-spacing-slider').dispatchEvent(new w.Event('input'));$('text-spacing-slider').dispatchEvent(new w.Event('change'));near(Number($('prop-h').value),height+4);assert(textMeta().spacingMm===3);
 edit('text-spacing-input','-2');near(Number($('prop-h').value),height-6);edit('text-direction-select','stacked-up');assert(textMeta().writingDirection==='stacked-up');
});
await test('new font families are searchable and show a vector preview',()=>{
 const search=$('text-font-search');search.value='Lato';search.dispatchEvent(new w.Event('input'));assert($('text-font-select').options.length<=2);
 edit('text-font-select','lato');assert(textMeta().fontKey==='lato');assert($('text-font-preview').dataset.font==='lato');assert($('text-font-preview').querySelector('path').getAttribute('d').length>50);
 search.value='';search.dispatchEvent(new w.Event('input'));assert($('text-font-select').options.length===49);
});
await test('older text can adopt the new rigid layout explicitly and undo restores its saved outlines',()=>{
 reset();addText('Dette er tekst');const data=JSON.parse(clipboard('copy').text);data.shapes[0].textMeta.layoutVersion=1;data.shapes[0].textMeta.curve=55;clipboard('paste',JSON.stringify(data));
 const old=shapes()[1].getAttribute('d');assert($('text-refresh-wrap').style.display!=='none');$('btn-refresh-text').click();assert(shapes()[1].getAttribute('d')!==old);assert(textMeta().layoutVersion===2);
 key('z',{metaKey:true});selectRow(ids()[1]);assert(textMeta().layoutVersion===1);assert(shapes()[1].getAttribute('d')===old);
});
await test('text follows a rounded outline with rigid glyphs; direction and path modes switch predictably',()=>{
 reset();tool('rect');drag([80,80],[280,220]);edit('prop-rx','25');const rectangleId=ids()[0];
 addText('Dette er en spennende historie');edit('text-size-input','12');const textId=ids()[1];edit('text-direction-select','up');
 selectRow(rectangleId,true);$('btn-bind-text-to-shape').click();assert(textMeta().customPath.length>4);assert(textMeta().writingDirection==='horizontal');
 edit('text-direction-select','down');assert(textMeta().customPath===null);assert(textMeta().writingDirection==='down');
 key('z',{metaKey:true});selectRow(textId);assert(textMeta().customPath.length>4);assert(textMeta().writingDirection==='horizontal');
});
const copiedShape=()=>JSON.parse(clipboard('copy').text).shapes[0];
const handle=name=>d.querySelector(`[data-handle="${name}"]`);
const handlePoint=el=>[Number(el.getAttribute('cx')),Number(el.getAttribute('cy'))];
await test('curved L keeps four anchors, exports cubic commands to the canvas and edits tangent handles',()=>{
 reset();tool('line');$('prop-curve-toggle').checked=true;$('prop-curve-toggle').dispatchEvent(new w.Event('change'));
 [[20,30],[120,35],[45,90],[130,100]].forEach(p=>click(...p));key('Enter');tool('select');
 assert(copiedShape().nodes.length===4);assert(d.querySelectorAll('[data-handle^="node-"]').length===4);
 assert((shapes()[0].getAttribute('d').match(/C /g)||[]).length===3);
 const h=handle('control-1-out'),before=copiedShape(),start=handlePoint(h);
 drag(start,[start[0]+10,start[1]+15],h);
 const after=copiedShape();assert(after.nodes.length===4);near(after.nodes[1].out.x,start[0]+10);near(after.nodes[1].out.y,start[1]+15);
 const n=after.nodes[1];near((n.in.x-n.x)*(n.out.y-n.y)-(n.in.y-n.y)*(n.out.x-n.x),0,.001);
 key('z',{metaKey:true});selectRow(ids()[0]);assert(JSON.stringify(copiedShape().nodes)===JSON.stringify(before.nodes));
});
await test('Alt handle drag is independent and Alt anchor click toggles corner/smooth',()=>{
 const h=handle('control-1-out'),start=handlePoint(h),before=copiedShape().nodes[1];
 drag(start,[start[0]+8,start[1]+5],h,{altKey:true});let n=copiedShape().nodes[1];
 near(n.in.x,before.in.x);near(n.in.y,before.in.y);assert(n.smooth===false);
 click(n.x,n.y,handle('node-1'),{altKey:true});n=copiedShape().nodes[1];assert(!n.in&&!n.out);
 click(n.x,n.y,handle('node-1'),{altKey:true});assert(copiedShape().nodes[1].smooth);
});
await test('B click-drag creates explicit handles with two anchors and Enter completes one curve',()=>{
 reset();tool('pen');$('prop-curve-toggle').checked=false;$('prop-curve-toggle').dispatchEvent(new w.Event('change'));
 drag([40,60],[65,20]);drag([140,60],[165,100]);key('Enter');
 assert(shapes().length===1);const s=copiedShape();assert(s.nodes.length===2);assert(s.curved);assert(s.nodes[0].out&&s.nodes[1].in);
 assert(shapes()[0].getAttribute('d').includes('C '));assert(handle('control-0-out'));assert(handle('control-1-in'));
});
await test('resize, rotate, mirror and paste preserve handles; anchor drag translates its handles only',()=>{
 edit('prop-w','150');edit('prop-rot','35');$('btn-flip-h').click();
 const original=copiedShape(),world=pathNodesInWorld(original),data=clipboard('copy').text;
 clipboard('paste',data);let copy=copiedShape(),copyWorld=pathNodesInWorld(copy);
 world.forEach((n,i)=>{near(copyWorld[i].x,n.x+8);near(copyWorld[i].out.x,n.out.x+8);near(copyWorld[i].out.y,n.out.y+8)});
 const h=handle('node-0'),start=handlePoint(h),other=copyWorld[1];
 drag(start,[start[0]+5,start[1]+7],h,{altKey:true});
 copy=copiedShape();assert(copy.rotation===0);near(copy.nodes[0].out.x,copyWorld[0].out.x+5);near(copy.nodes[0].out.y,copyWorld[0].out.y+7);
 near(copy.nodes[1].x,other.x);near(copy.nodes[1].y,other.y);
});
await test('old sampled curves simplify explicitly with undo; ordinary selection does not change stored geometry',()=>{
 reset();chain([[10,10],[20,20]]);tool('select');const payload=JSON.parse(clipboard('copy').text);
 const loop=buildSmoothSplineLoop([{x:20,y:30},{x:120,y:35},{x:45,y:90},{x:130,y:100}],false,.05);
 const old=createPathShapeFromPolygons([loop]);old.nodes=loop.map(p=>({...p}));old.curved=false;old.closedPath=false;
 payload.shapes=[old];clipboard('paste',JSON.stringify(payload));assert(copiedShape().nodes.length>100);
 const before=copiedShape();edit('simplify-tolerance','0.1');$('btn-simplify-path').click();assert(copiedShape().nodes.length<20);assert(copiedShape().nodeModel==='bezier');
 key('z',{metaKey:true});selectRow(ids()[1]);assert(copiedShape().nodes.length===before.nodes.length);assert(copiedShape().d===before.d);
});
await test('extending a Bézier curve with L keeps the original handles and compact node count',()=>{
 reset();tool('line');$('prop-curve-toggle').checked=true;$('prop-curve-toggle').dispatchEvent(new w.Event('change'));
 [[20,40],[60,65],[100,40]].forEach(p=>click(...p));key('Enter');tool('select');const before=copiedShape();
 // Start extension at the old endpoint, then finish away from it.
 tool('line');click(100,40);click(150,50);key('Enter');tool('select');
 assert(shapes().length===1);assert(copiedShape().nodes.length===4);assert((shapes()[0].getAttribute('d').match(/C /g)||[]).length>=2);
 const n=copiedShape().nodes.find(n=>Math.abs(n.x-60)<.01);near(n.in.x,before.nodes[1].in.x);near(n.out.y,before.nodes[1].out.y);
});
document.querySelector('#summary').textContent=`${passed} bestått, ${failed} feilet`;
