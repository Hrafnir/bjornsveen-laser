import { parseSvgPathToPolygons } from '../js/geometry.js';
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
document.querySelector('#summary').textContent=`${passed} bestått, ${failed} feilet`;
