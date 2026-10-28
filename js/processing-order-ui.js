import { processingPlan, processingOrder, DEFAULT_PROCESSING_ORDER } from './processing-order.js';
export function mountProcessingOrder(root,{getShapes,getSettings,onChange}){
 let signature='';
 function refresh(){
  const plan=processingPlan(getShapes(),getSettings()),key=JSON.stringify(plan);if(signature===key)return;signature=key;
  root.innerHTML=`<p class="order-help">Kjøres ovenfra og ned. Flytt behandlingene med pilene. Antallet viser objekter som eksporteres.</p><ol class="processing-order-list">${plan.map((p,i)=>`<li><span class="order-swatch" style="background:${p.color}"></span><span>${i+1}. ${p.name}<small>${p.count} objekter</small></span><button class="btn" data-order-id="${p.id}" data-step="-1" aria-label="Flytt ${p.name} tidligere" ${i===0?'disabled':''}>↑</button><button class="btn" data-order-id="${p.id}" data-step="1" aria-label="Flytt ${p.name} senere" ${i===plan.length-1?'disabled':''}>↓</button></li>`).join('')}</ol><button class="btn" data-reset-order>Tilbakestill anbefalt rekkefølge</button><p class="order-help">XS og XCS lagrer rekkefølgen som «By layer» i xTool. SVG har ikke innstillinger for kjørerekkefølge.</p>${plan.some((p,i)=>!['engrave','score'].includes(p.id)&&i<plan.findIndex(p=>p.id==='engrave'))?'<p class="order-warning">Egendefinert rekkefølge: gjennomkutt kommer før gravering.</p>':''}`;
 }
 root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-reset-order'))onChange([...DEFAULT_PROCESSING_ORDER]);else if(b.dataset.orderId){const order=processingOrder(getSettings()),i=order.indexOf(b.dataset.orderId),j=i+Number(b.dataset.step);if(j<0||j>=order.length)return;[order[i],order[j]]=[order[j],order[i]];onChange(order);}signature='';refresh();});
 refresh();return refresh;
}
