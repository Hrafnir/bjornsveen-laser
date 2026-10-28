import { CUT_STAGES, getCutStage } from './cut-order.js';
export const PROCESSING_LAYERS=[
 {id:'engrave',name:'Gravering & Foto (Svart)',color:'#000000'},
 {id:'score',name:'Linje / Score (Blå)',color:'#0000ff'},
 ...['flex-slits','box-holes','puzzle-horizontal','puzzle-vertical'].map(id=>CUT_STAGES.find(s=>s.id===id)),
 {id:'cut',name:'Gjennomkutt (Rød)',color:'#ff0000'},
 ...['puzzle-outline','box-outline'].map(id=>CUT_STAGES.find(s=>s.id===id))
];
export const DEFAULT_PROCESSING_ORDER=PROCESSING_LAYERS.map(l=>l.id);
export function processingOrder(settings={}){
 const raw=settings.processingOrder;if(!Array.isArray(raw))return [...DEFAULT_PROCESSING_ORDER];
 const valid=[...new Set(raw.filter(id=>DEFAULT_PROCESSING_ORDER.includes(id)))];
 // Reject incomplete/old lists rather than silently putting new engraving stages after cuts.
 return valid.length===DEFAULT_PROCESSING_ORDER.length?valid:[...DEFAULT_PROCESSING_ORDER];
}
export function processingLayer(shape){return shape.type==='image'||shape.laserMode==='engrave'?'engrave':shape.laserMode==='score'?'score':getCutStage(shape)?.id||'cut';}
export function processingPlan(shapes,settings={}){
 const counts=new Map();function collect(list){for(const s of list||[]){if(!s||s.hidden||s.laserMode==='guide')continue;if(s.type==='group')collect(s.children);else{const id=processingLayer(s);counts.set(id,(counts.get(id)||0)+1)}}}collect(shapes);
 return processingOrder(settings).map(id=>({...PROCESSING_LAYERS.find(l=>l.id===id),count:counts.get(id)||0}));
}
export function xToolLayerData(displays,settings={}){
 const used=new Set(displays.map(d=>d.layerTag));
 const layers=processingOrder(settings).map(id=>PROCESSING_LAYERS.find(l=>l.id===id));
 // Studio's layer panel sorts descending (b.order - a.order), and processes top to bottom.
 // Keep logical execution ranks separate from this wire-format convention. Never use zOrder.
 return Object.fromEntries(layers.filter(l=>used.has(l.color)||['engrave','score','cut'].includes(l.id)).map(l=>[l.color,{name:l.name,order:layers.length-layers.indexOf(l),visible:true,panel:0}]));
}
