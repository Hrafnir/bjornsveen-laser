import { PAPER_SIZES } from './drawing-model.js';
export const drawingPageKey=page=>page.kind==='detail'?'detail:'+page.itemId:page.kind==='list'?'list:'+(page.start||0):page.kind==='custom'?'custom:'+page.id:'overview';
export function defaultSheetViews(doc,page) {
 const [w,h]=PAPER_SIZES[doc.paper]||PAPER_SIZES.A4,foot=h-38;
 if(page.kind==='list'||page.kind==='notes')return {};
 const flat=page.kind==='detail'?{x:18,y:34,width:(w-36)*.67,height:foot-49}:{x:18,y:35,width:(w-40)/2,height:foot-53};
 const iso=page.kind==='detail'?{x:w*.71,y:35,width:w*.24,height:(foot-40)*.55}:{x:w/2+10,y:35,width:(w-40)/2,height:foot-53};
 return {flat,iso};
}
export function sheetViewBox(doc,page,mode) {
 const defaults=defaultSheetViews(doc,page)[mode];if(!defaults)return null;
 const [w,h]=PAPER_SIZES[doc.paper]||PAPER_SIZES.A4,raw=doc.sheetLayouts?.[drawingPageKey(page)]?.[mode];
 if(!raw)return {...defaults,visible:true};
 const width=Math.max(35,Math.min(w-20,(Number(raw.width)||defaults.width/w)*w));
 const height=Math.max(35,Math.min(h-62,(Number(raw.height)||defaults.height/h)*h));
 return {x:Math.max(10,Math.min(w-10-width,(Number(raw.x)||0)*w)),y:Math.max(22,Math.min(h-40-height,(Number(raw.y)||0)*h)),width,height,visible:raw.visible!==false};
}
export function setSheetViewBox(doc,page,mode,box) {
 const [w,h]=PAPER_SIZES[doc.paper]||PAPER_SIZES.A4,key=drawingPageKey(page);
 const current=sheetViewBox(doc,page,mode),next={...current,...box};
 doc.sheetLayouts||={};doc.sheetLayouts[key]||={};
 doc.sheetLayouts[key][mode]={x:next.x/w,y:next.y/h,width:next.width/w,height:next.height/h,visible:next.visible!==false};
 const clamped=sheetViewBox(doc,page,mode);
 doc.sheetLayouts[key][mode]={x:clamped.x/w,y:clamped.y/h,width:clamped.width/w,height:clamped.height/h,visible:clamped.visible};
}
export function clampAnnotation(doc,note) {
 const [w,h]=PAPER_SIZES[doc.paper]||PAPER_SIZES.A4;
 note.width=Math.max(25,Math.min(w-24,Number(note.width)||65));
 note.fontSize=Math.max(2,Math.min(8,Number(note.fontSize)||3));
 note.x=Math.max(12,Math.min(w-12-note.width,Number(note.x)||12));
 note.y=Math.max(24,Math.min(h-46-note.fontSize*1.35,Number(note.y)||24));
 note.targetX=Math.max(10,Math.min(w-10,Number(note.targetX)||w/2));
 note.targetY=Math.max(22,Math.min(h-40,Number(note.targetY)||h/2));
 return note;
}
