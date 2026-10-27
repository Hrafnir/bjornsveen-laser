import { getShapesBBox, buildSmoothSplineLoop, createPathShapeFromPolygons, pathNodesInWorld, parseSvgPathToPolygons } from '../js/geometry.js';
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
const startPen=()=>{tool('pen');$('prop-curve-toggle').checked=false;$('prop-curve-toggle').dispatchEvent(new w.Event('change'));};
const anchorFor=(id,i)=>d.querySelector(`[data-path-shape="${id}"][data-handle="node-${i}"]`);
const segmentFor=(id,i)=>d.querySelector(`[data-path-shape="${id}"][data-path-segment="${i}"]`);
const pickAnchor=(id,i,shift=false)=>{const h=anchorFor(id,i);assert(h,'anchor missing');click(...handlePoint(h),h,{shiftKey:shift});};
await test('B retains open curves when finishing with Enter, Escape, V, the finish button or double-click',()=>{
 for(const action of ['enter','escape','tool','button','double']){
  reset();startPen();drag([40,70],[65,30]);drag([140,70],[165,110]);
  assert(!$('btn-pen-finish').disabled);assert(shapes().length===0);
  if(action==='enter')key('Enter');if(action==='escape')key('Escape');if(action==='tool')tool('select');if(action==='button')$('btn-pen-finish').click();
  if(action==='double'){pointer('pointerdown',140,70,undefined,{detail:2});pointer('pointerup',140,70);$('main-svg').dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true}));}
  assert(shapes().length===1,action);const s=copiedShape();assert(s.closedPath===false);assert(s.nodes.length===2);assert(shapes()[0].getAttribute('d').includes('C '));assert(!shapes()[0].getAttribute('d').includes('Z'));
  key('z',{metaKey:true});assert(shapes().length===0);key('z',{metaKey:true,shiftKey:true});assert(shapes().length===1);
 }
});
await test('B Backspace undoes draft points; explicit Cancel discards only the draft; clipboard completes an open draft',()=>{
 reset();chain([[20,20],[50,20]]);startPen();click(100,40);click(140,70);click(180,40);key('Backspace');
 assert($('pen-draft-status').textContent.includes('2 punkter'));$('btn-pen-cancel').click();assert(shapes().length===1);
 startPen();click(100,40);click(140,70);const copy=clipboard('copy');assert(copy.handled);assert(shapes().length===2);assert(JSON.parse(copy.text).shapes[0].closedPath===false);
});
await test('B extends an existing curved path and joins another endpoint without duplicating nodes or losing handles',()=>{
 reset();startPen();drag([20,60],[40,30]);drag([90,60],[110,90]);$('btn-pen-finish').click();const first=copiedShape();
 chain([[160,60],[200,60]]);startPen();click(90,60);click(130,80);click(160,60);
 assert(shapes().length===1);const result=copiedShape();assert(result.nodes.length===5);assert(result.closedPath===false);assert(result.d.includes('C '));near(result.nodes[0].out.x,first.nodes[0].out.x);
 key('z',{metaKey:true});assert(shapes().length===2);
});
await test('A connects exactly the two Shift-selected endpoints, including a gap, and can close the resulting path',()=>{
 reset();chain([[20,40],[50,60],[80,40]]);chain([[130,40],[160,60],[190,40]]);tool('nodes');const [a,b]=ids();
 pickAnchor(a,2);pickAnchor(b,0,true);assert(!$('btn-connect-anchors').disabled);key('j',{metaKey:true});assert(shapes().length===1);assert(copiedShape().nodes.length===6);
 const id=ids()[0];pickAnchor(id,0);pickAnchor(id,5,true);$('btn-connect-anchors').click();assert(copiedShape().closedPath);assert(shapes()[0].getAttribute('d').endsWith('Z'));
 key('z',{metaKey:true});assert(!points(shapes()[0]).closed);key('z',{metaKey:true});assert(shapes().length===2);
});
await test('deleting an anchor connects its neighbours; deleting a segment leaves a gap and creates separate paths',()=>{
 reset();chain([[20,40],[60,60],[100,40],[140,60]]);tool('nodes');let id=ids()[0];pickAnchor(id,1);key('Delete');assert(shapes().length===1);assert(copiedShape().nodes.length===3);
 key('z',{metaKey:true});id=ids()[0];const edge=segmentFor(id,1);click(80,50,edge);assert(!$('btn-delete-segments').disabled);$('btn-delete-segments').click();
 assert(shapes().length===2);key('a',{metaKey:true});let all=JSON.parse(clipboard('copy').text).shapes;assert(all.every(s=>s.nodes.length===2&&!s.closedPath));
 key('z',{metaKey:true});assert(shapes().length===1);key('z',{metaKey:true,shiftKey:true});assert(shapes().length===2);
});
await test('removing a closed shape segment creates an open outline, with no implicit filled closing edge',()=>{
 reset();chain([[40,40],[120,40],[120,100],[40,100],[40,40]],false);tool('select');$('btn-shape-fill').click();tool('nodes');
 const id=ids()[0];click(80,40,segmentFor(id,0));key('Backspace');assert(shapes().length===1);const result=copiedShape();assert(!result.closedPath);assert(result.nodes.length===4);assert(result.laserMode==='cut');assert(shapes()[0].getAttribute('fill')==='none');
});
await test('double-clicking a segment adds an editable anchor without changing its curve or closing it',()=>{
 reset();startPen();drag([30,70],[50,30]);drag([130,70],[150,110]);key('Enter');tool('nodes');const id=ids()[0];
 const edge=segmentFor(id,0);click(80,40,edge);segmentFor(id,0).dispatchEvent(new w.MouseEvent('dblclick',{...point(80,40),bubbles:true}));
 const result=copiedShape();assert(result.nodes.length===3);assert(!result.closedPath);assert((result.d.match(/C /g)||[]).length===2);
 key('z',{metaKey:true});assert(d.querySelectorAll('[data-handle^="node-"]').length===2);
});
await test('point and segment selection is cleared by whole-object selection; input shortcuts do not delete artwork',()=>{
 reset();chain([[20,40],[60,60],[100,40]]);tool('nodes');pickAnchor(ids()[0],1);$('simplify-tolerance').focus();
 $('simplify-tolerance').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Delete',bubbles:true}));assert(shapes().length===1);assert(d.querySelectorAll('[data-handle^="node-"]').length===3);
 $('simplify-tolerance').blur();tool('select');selectRow(ids()[0]);key('Delete');assert(shapes().length===0);
});
await test('path segment edits stay inside the edited group and preserve unrelated objects',()=>{
 reset();chain([[20,40],[60,60],[100,40],[140,60]]);tool('rect');drag([180,40],[220,70]);key('a',{metaKey:true});key('g',{metaKey:true});
 const groupId=ids()[0];d.querySelector(`#layer-list [data-id="${groupId}"] [data-action="edit-group"]`).click();tool('nodes');
 const edge=d.querySelector('[data-path-segment="1"]');assert(edge);click(80,50,edge);key('Delete');
 key('a',{metaKey:true});const children=JSON.parse(clipboard('copy').text).shapes;assert(children.length===3);assert(children.filter(s=>s.type==='rect').length===1);assert(children.filter(s=>s.type==='path').every(s=>!s.closedPath));
});
await test('B closes only explicitly and open curves drawn with fill selected become line engraving',()=>{
 reset();startPen();[[30,30],[90,30],[70,80]].forEach(p=>click(...p));$('btn-pen-close').click();assert(copiedShape().closedPath);
 reset();d.querySelector('[data-mode="engrave"]').click();startPen();drag([40,70],[60,30]);drag([140,70],[160,110]);tool('select');
 assert(copiedShape().closedPath===false);assert(copiedShape().laserMode==='score');assert(shapes()[0].getAttribute('fill')==='none');
 d.querySelector('[data-mode="cut"]').click();
});
await test('Shift-click can select both overlapping endpoints before merging them once',()=>{
 reset();$('object-snap-toggle').checked=false;$('object-snap-toggle').dispatchEvent(new w.Event('change'));
 chain([[20,50],[70,50]]);chain([[70,50],[120,80]]);tool('nodes');const second=ids()[1];
 pickAnchor(second,0);pickAnchor(second,0,true);assert(!$('btn-connect-anchors').disabled);$('btn-connect-anchors').click();
 assert(shapes().length===1);assert(copiedShape().nodes.length===3);assert(!copiedShape().closedPath);
});
const paint = color => d.querySelector(`[data-object-color="${color}"]`).click();
await test('individual colors render fills, strokes and layer swatches; undo and reset retain laser operation',()=>{
 reset();tool('rect');drag([30,30],[130,110]);$('btn-shape-fill').click();paint('#a855f7');
 const id=ids()[0];assert(shapes()[0].getAttribute('fill')==='#a855f7');assert(copiedShape().laserMode==='engrave');
 assert(d.querySelector(`#layer-list [data-id="${id}"] .layer-dot`).style.background.includes('168'));
 tool('star');drag([65,55],[95,85]);$('btn-shape-outline').click();edit('object-color','#22c55e');
 assert(shapes()[1].getAttribute('stroke')==='#22c55e');assert(copiedShape().laserMode==='cut');
 $('btn-undo').click();selectRow(ids()[1]);assert(shapes()[1].getAttribute('stroke')==='#ff1e1e');
 paint('#22c55e');$('btn-color-reset').click();assert(shapes()[1].getAttribute('stroke')==='#ff1e1e');
});
await test('mixed group colors can be changed together and survive copy/paste',()=>{
 reset();tool('rect');drag([30,30],[130,110]);$('btn-shape-fill').click();paint('#a855f7');tool('star');drag([65,55],[95,85]);paint('#22c55e');
 tool('select');key('a',{metaKey:true});assert($('object-color-status').textContent.includes('Flere farger'));key('g',{metaKey:true});
 assert(d.querySelector('#layer-list .layer-dot').style.background.includes('conic-gradient'));paint('#3b82f6');
 assert([...shapes()[0].children].every(el=>el.getAttribute('fill')==='#3b82f6'||el.getAttribute('stroke')==='#3b82f6'));
 clipboard('paste',clipboard('copy').text);assert(copiedShape().children.every(s=>s.displayColor==='#3b82f6'));
});
const triangleAndStar=()=>{
 reset();tool('polygon');drag([30,20],[150,140]);edit('prop-sides','3');$('btn-shape-fill').click();paint('#a855f7');
 tool('star');drag([78,75],[102,99]);$('btn-shape-outline').click();paint('#22c55e');tool('select');
};
await test('Lag hull subtracts an outline star from an engraving while preserving unrelated stacking and undo',()=>{
 triangleAndStar();const originals=ids();tool('rect');drag([180,30],[220,60]);const unrelated=ids()[2];tool('select');
 selectRow(originals[0]);selectRow(originals[1],true);assert($('boolean-status').textContent.includes('øverste'));$('btn-bool-subtract').click();
 assert(shapes().length===2);assert(ids()[1]===unrelated);assert(shapes()[0].getAttribute('fill')==='#a855f7');
 assert(parseSvgPathToPolygons(shapes()[0].getAttribute('d')).length===2,'star hole missing');assert(shapes()[0].getAttribute('fill-rule')==='evenodd');
 $('btn-undo').click();assert(ids().join() === [...originals,unrelated].join());$('btn-redo').click();assert(shapes().length===2);
});
await test('Lag hull edits children inside a group, keeps the group and rejects open lines without deleting them',()=>{
 triangleAndStar();key('a',{metaKey:true});key('g',{metaKey:true});const group=ids()[0];
 d.querySelector(`#layer-list [data-id="${group}"] [data-action="edit-group"]`).click();key('a',{metaKey:true});$('btn-bool-subtract').click();
 const result=copiedShape();assert(result.displayColor==='#a855f7');assert(parseSvgPathToPolygons(result.d).length===2);
 key('Escape');assert(ids()[0]===group);assert(shapes()[0].children.length===1);
 reset();chain([[30,30],[60,60]]);tool('rect');drag([30,30],[90,90]);tool('select');key('a',{metaKey:true});$('btn-bool-subtract').click();assert(shapes().length===2);
});
await test('multi-selection reveals arrangement at the top, respects manual collapse and reopens for the next selection',()=>{
 reset();$('arrange-objects').open=false;tool('rect');drag([20,30],[60,70]);tool('ellipse');drag([100,60],[120,90]);tool('select');
 assert(!$('arrange-objects').open,'opened for a single object');$('tab-laser').click();if(!$('inspector-panel').hidden)$('btn-toggle-panel').click();
 key('a',{metaKey:true});assert($('arrange-objects').open,'did not open');assert(!$('panel-object').hidden && !$('inspector-panel').hidden,'panel not revealed');
 assert($('panel-object').firstElementChild===$('arrange-objects'),'arrangement is not first');
 $('arrange-objects').open=false;order('front');assert(!$('arrange-objects').open,'manual collapse was ignored');
 selectRow(ids()[0]);selectRow(ids()[1],true);assert($('arrange-objects').open,'new multi-selection did not reopen');
});
await test('one center X+Y action centers unequal objects, preserves size and is undone in one step',()=>{
 reset();tool('rect');drag([20,30],[60,70]);tool('ellipse');drag([100,60],[120,90]);tool('select');key('a',{metaKey:true});
 const before=JSON.parse(clipboard('copy').text).shapes, ref=getShapesBBox(before);
 d.querySelector('[data-align="center-both"]').click();const after=JSON.parse(clipboard('copy').text).shapes;
 after.forEach((s,i)=>{const box=getShapesBBox([s]);near(box.x+box.width/2,ref.x+ref.width/2);near(box.y+box.height/2,ref.y+ref.height/2);near(s.width,before[i].width);near(s.height,before[i].height)});
 $('btn-undo').click();key('a',{metaKey:true});const restored=JSON.parse(clipboard('copy').text).shapes;restored.forEach((s,i)=>{near(s.x,before[i].x);near(s.y,before[i].y)});
 $('btn-redo').click();key('a',{metaKey:true});const redone=JSON.parse(clipboard('copy').text).shapes;near(getShapesBBox([redone[0]]).x+redone[0].width/2,ref.x+ref.width/2);
});
await test('alignment uses visible bounds of rotated shapes and moves groups intact',()=>{
 reset();tool('rect');drag([20,30],[80,50]);edit('prop-rot','45');tool('ellipse');drag([130,70],[150,100]);tool('select');key('a',{metaKey:true});
 d.querySelector('[data-align="left"]').click();let selected=JSON.parse(clipboard('copy').text).shapes;near(getShapesBBox([selected[0]]).x,getShapesBBox([selected[1]]).x,.05);
 key('g',{metaKey:true});const group=copiedShape(),children=group.children.map(c=>({x:c.x,y:c.y}));
 tool('rect');drag([200,120],[240,160]);tool('select');key('a',{metaKey:true});d.querySelector('[data-align="center-both"]').click();
 selected=JSON.parse(clipboard('copy').text).shapes;const a=getShapesBBox([selected[0]]),b=getShapesBBox([selected[1]]);near(a.x+a.width/2,b.x+b.width/2,.05);near(a.y+a.height/2,b.y+b.height/2,.05);
 near(selected[0].children[1].x-selected[0].children[0].x,children[1].x-children[0].x);near(selected[0].children[1].y-selected[0].children[0].y,children[1].y-children[0].y);
});
const nestedHexagons=()=>{
 reset();tool('polygon');drag([30,30],[150,150]);edit('prop-sides','6');$('btn-shape-outline').click();
 tool('polygon');drag([45,45],[135,135]);edit('prop-sides','6');$('btn-shape-outline').click();tool('select');key('a',{metaKey:true});
};
await test('Graver mellom konturer makes one engraving with a real hole, retains stacking and supports undo',()=>{
 nestedHexagons();const original=ids();assert(!$('btn-engrave-between').disabled);tool('rect');drag([180,30],[220,60]);const unrelated=ids()[2];tool('select');
 selectRow(original[0]);selectRow(original[1],true);$('btn-engrave-between').click();assert(shapes().length===2);assert(ids()[1]===unrelated);
 assert(copiedShape().laserMode==='engrave');assert(parseSvgPathToPolygons(shapes()[0].getAttribute('d')).length===2);assert(shapes()[0].getAttribute('fill-rule')==='evenodd');
 $('btn-undo').click();assert(ids().join()===[...original,unrelated].join());$('btn-redo').click();assert(shapes().length===2);
 selectRow(ids()[0]);$('btn-shape-outline').click();assert(shapes()[0].getAttribute('fill')==='none');assert(parseSvgPathToPolygons(shapes()[0].getAttribute('d')).length===2);
});
await test('Graver mellom konturer handles selected groups and group editing without losing unrelated objects',()=>{
 nestedHexagons();key('g',{metaKey:true});const group=ids()[0];assert(!$('btn-engrave-between').disabled);$('btn-engrave-between').click();assert(copiedShape().type==='path');assert(parseSvgPathToPolygons(copiedShape().d).length===2);
 $('btn-undo').click();assert(ids()[0]===group);d.querySelector(`#layer-list [data-id="${group}"] [data-action="edit-group"]`).click();key('a',{metaKey:true});$('btn-engrave-between').click();
 assert(copiedShape().laserMode==='engrave');key('Escape');assert(ids()[0]===group);assert(shapes()[0].children.length===1);
});
await test('Box workshop uses 1 mm spacing and inserts all three new designs with contained labels',()=>{
 reset();
 const input=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('input',{bubbles:true}));$(id).dispatchEvent(new w.Event('change',{bubbles:true}))};
 for(const type of ['coin-bank','tissue','cable']){
  d.querySelector('[data-tab="box"]').click();assert($('gen-box-gap').value==='1');input('gen-box-type',type);
  assert($('gen-box-error').hidden,$('gen-box-error').textContent);assert(!$('btn-modal-insert').disabled);
  $('gen-box-view-assembly').click();assert($('gen-preview-svg').querySelector('svg[aria-label*="Sammensatt"]'));
  $('btn-modal-insert').click();d.activeElement?.blur();const parts=JSON.parse(clipboard('copy').text).shapes;
  assert(parts.length===7);for(const part of parts){const label=part.children.find(s=>s.guideLabel);assert(label.y>=part.y&&label.y+label.height<=part.y+part.height+.01)}
  reset();
 }
});
await test('Flex workshop uses matching top and bottom fingers and preserves spacing after insertion',()=>{
 d.querySelector('[data-tab="flex"]').click();assert($('gen-flex-gap').value==='1');
 $('gen-flex-preset').value='closed';$('gen-flex-preset').dispatchEvent(new w.Event('change',{bubbles:true}));
 assert($('gen-flex-error').hidden,$('gen-flex-error').textContent);assert($('gen-flex-type').value==='rounded-closed');
 $('btn-modal-insert').click();d.activeElement?.blur();const parts=JSON.parse(clipboard('copy').text).shapes;
 const wall=parts.flatMap(p=>p.children).find(p=>p.cutStage==='box-outline'&&p.boxPart.id==='wall-0');
 assert(wall.height>60,'wall tabs missing');assert(parseSvgPathToPolygons(wall.d)[0].length>4);
 reset();
});
await test('Selecting the 3 mm MDF preset updates the visible cut fields to 75 percent and 30 mm/s',()=>{
 $('tab-laser').click();edit('laser-preset-select','mdf-3mm');assert(Number($('ls-cut-power').value)===75);assert(Number($('ls-cut-speed').value)===30);$('tab-object').click();
});
document.querySelector('#summary').textContent=`${passed} bestått, ${failed} feilet`;
