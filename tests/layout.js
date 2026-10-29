const frame = document.querySelector('#editor');
await new Promise(resolve => frame.addEventListener('load', resolve, {once:true}));
const w=frame.contentWindow, d=frame.contentDocument, $=id=>d.getElementById(id);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
for(let i=0;i<250 && $('save-status').textContent.includes('Åpner');i++) await pause(20);
await pause(100);
let passed=0,failed=0;
const assert=(value,message)=>{if(!value)throw Error(message)};
async function test(name,fn){const li=document.createElement('li');document.querySelector('#results').append(li);try{await fn();li.textContent='PASS: '+name;li.className='pass';passed++}catch(e){li.textContent='FAIL: '+name+' — '+e.message;li.className='fail';failed++}}
const size=async(width,height=760)=>{frame.style.width=width+'px';frame.style.height=height+'px';await pause(100)};
const within=(el,width=w.innerWidth)=>{const r=el.getBoundingClientRect();assert(r.width>0,`${el.id||el.className} is not visible`);assert(r.left>=-1 && r.right<=width+1,`${el.id||el.className} outside viewport (${r.left},${r.right}; width ${width})`)};
const visible=el=>{if(!el.getClientRects().length||el.closest('[hidden]'))return false;for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope > summary')?.contains(el))return false;return true;};
const horizontalControls=root=>{for(const el of root.querySelectorAll('button,input,select,summary'))if(visible(el))within(el)};
for(const width of [1440,1280,1024,820,640,390,320]) await test(`All controls stay inside a ${width}px viewport, including menus and custom bed`,async()=>{
 await size(width);horizontalControls(d.querySelector('.app-header'));
 assert(d.documentElement.scrollWidth<=width+1,'document horizontally overflows');
 within($('canvas-viewport'));assert($('canvas-viewport').clientWidth>180,'canvas collapsed');
 for(const id of ['setup-menu','file-menu']){
  $(id).querySelector('summary').click();await pause(10);within($(id).querySelector('.header-menu-content'));horizontalControls($(id));
  if(id==='setup-menu'){$('machine-select').value='custom';$('machine-select').dispatchEvent(new w.Event('change'));await pause(30);horizontalControls($(id));}
  $(id).open=false;
 }
 if($('inspector-panel').hidden)$('btn-toggle-panel').click();
 for(const id of ['tab-object','tab-layers','tab-laser']){
  $(id).click();await pause(10);within($('inspector-panel'));horizontalControls($($(id).getAttribute('aria-controls')));
 }
 $('advanced-laser').open=true;horizontalControls($('panel-laser'));$('advanced-laser').open=false;
 $('tab-object').click();$('advanced-shapes').open=true;$('arrange-objects').open=true;horizontalControls($('panel-object'));
 $('advanced-shapes').open=false;$('arrange-objects').open=false;
});
await test('Panel toggle preserves canvas center, scale and square pixels',async()=>{
 await size(1280);if($('inspector-panel').hidden)$('btn-toggle-panel').click();await pause(60);
 const before=$('main-svg').viewBox.baseVal, values={x:before.x+before.width/2,y:before.y+before.height/2,scale:before.height/$('canvas-viewport').clientHeight,width:$('canvas-viewport').clientWidth};
 $('btn-toggle-panel').click();await pause(60);const after=$('main-svg').viewBox.baseVal,r=$('canvas-viewport').getBoundingClientRect();
 assert(r.width>values.width,'panel did not release space');
 assert(Math.abs(after.width/r.width-after.height/r.height)<.001,'canvas aspect distorted');
 assert(Math.abs(after.x+after.width/2-values.x)<.01 && Math.abs(after.y+after.height/2-values.y)<.01,'canvas center moved');
 assert(Math.abs(after.height/r.height-values.scale)<.001,'zoom changed');
});
await test('Offset opens the hidden inspector, correct tab and collapsed controls',async()=>{
 $('tab-laser').click();$('advanced-shapes').open=false;if(!$('inspector-panel').hidden)$('btn-toggle-panel').click();
 $('btn-offset-tool').click();await pause(100);
 assert(!$('inspector-panel').hidden && !$('panel-object').hidden,'offset panel hidden');assert($('advanced-shapes').open,'offset controls collapsed');assert(d.activeElement===$('offset-dist-input'),'offset did not receive focus');
});
await test('Tabs support arrow navigation; Escape closes menus without triggering canvas commands',async()=>{
 $('tab-object').focus();$('tab-object').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
 assert(d.activeElement===$('tab-layers') && !$('panel-layers').hidden,'arrow navigation failed');
 $('setup-menu').querySelector('summary').click();await pause(10);$('setup-menu').querySelector('summary').focus();
 d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(!$('setup-menu').open,'Escape did not close menu');
 $('setup-menu').querySelector('summary').click();await pause(10);$('file-menu').querySelector('summary').click();await pause(10);
 assert(!$('setup-menu').open && $('file-menu').open,'both menus open');$('btn-toggle-panel').focus();assert(!$('file-menu').open,'menu remained open after focus left');
});
await test('Text editing reveals its panel from the Laser tab and fits narrow windows',async()=>{
 await size(390);if($('inspector-panel').hidden)$('btn-toggle-panel').click();$('tab-laser').click();$('btn-toggle-panel').click();
 d.querySelector('[data-tool="text"]').click();const r=$('canvas-viewport').getBoundingClientRect();
 $('main-svg').dispatchEvent(new w.PointerEvent('pointerdown',{clientX:r.left+r.width/2,clientY:r.top+r.height/2,button:0,buttons:1,bubbles:true}));
 $('main-svg').dispatchEvent(new w.PointerEvent('pointerup',{clientX:r.left+r.width/2,clientY:r.top+r.height/2,button:0,bubbles:true}));
 assert(!$('panel-object').hidden && !$('inspector-panel').hidden,'text inspector remained hidden');assert(d.activeElement===$('text-content-input'),'text field did not receive focus');
 for(const width of [390,320]){await size(width);horizontalControls($('panel-object'));}
});
await test('Export dialog and generator fit small windows and remain scrollable',async()=>{
 await size(390,640);$('btn-preflight').click();await pause(50);const modal=d.querySelector('.modal-backdrop.open');assert(modal,'export did not open');within(modal.querySelector('.modal-window'));horizontalControls(modal);
 modal.classList.remove('open');d.querySelector('[data-generator="box"]').click();await pause(100);const generator=$('generator-modal');assert(generator.classList.contains('open'),'generator not open');within(generator.querySelector('.modal-window'));horizontalControls(generator);$('btn-close-modal').click();
});
await test('Flex finger controls and the three new box designs fit 320px and 1024px windows',async()=>{
 for(const width of [320,1024]){
  await size(width);d.querySelector('[data-generator="flex"]').click();$('gen-flex-preset').value='closed';$('gen-flex-preset').dispatchEvent(new w.Event('change'));
  assert($('gen-flex-error').hidden,$('gen-flex-error').textContent);horizontalControls($('generator-modal'));$('btn-close-modal').click();
  d.querySelector('[data-generator="box"]').click();
  for(const type of ['coin-bank','tissue','cable']){$('gen-box-type').value=type;$('gen-box-type').dispatchEvent(new w.Event('change'));assert($('gen-box-error').hidden,$('gen-box-error').textContent);horizontalControls($('generator-modal'));}
  $('btn-close-modal').click();
 }
});
await size(1280);$('tab-object').click();if($('inspector-panel').hidden)$('btn-toggle-panel').click();
document.querySelector('#summary').textContent=`${passed} bestått, ${failed} feilet`;
