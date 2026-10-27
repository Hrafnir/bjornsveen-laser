import { createDrawingDocument, drawingParts } from '../js/drawing-model.js';
import { drawingBounds, renderDrawingGeometry } from '../js/drawing-renderer.js';
import { createPathShapeFromPolygons, shapeToWorldPolygons } from '../js/geometry.js';
const renderer=renderDrawingGeometry;
const rect=(id,x,y,w,h)=>({id,type:'rect',name:id,x,y,width:w,height:h,laserMode:'cut'});
const outer=shapeToWorldPolygons({...rect('round',0,0,100,70),rx:15})[0],hole=shapeToWorldPolygons({id:'hole',type:'ellipse',x:25,y:15,width:50,height:40})[0];
const ring=createPathShapeFromPolygons([outer,hole]);Object.assign(ring,ring.origBBox);ring.name='Avrundet plate med hull';
const star=createPathShapeFromPolygons([shapeToWorldPolygons({id:'star',type:'star',x:0,y:0,width:100,height:100,sides:7,innerRatio:50})[0]]);Object.assign(star,star.origBBox);
const cases=[['Avrundet plate med gjennomgående hull',[ring],{finish:'wood',materialId:'plywood-birch'}],['Buet vegg med hull',[ring],{plane:'xz',assemblyRotation:37,materialId:'oak'}],['Konkav kontur – 7 tagger',[star],{materialId:'walnut'}],['Sammenstilte plater',[rect('Bunn',0,0,100,70),rect('Bakvegg',0,0,100,50),rect('Sidevegg',0,0,70,50)],{assembly:true,materialId:'mdf'}]];
for(const [title,shapes,opt] of cases){const doc=createDrawingDocument(shapes,{thicknessMm:6});Object.assign(doc,opt);for(const p of doc.items)Object.assign(p,{plane:opt.plane||'xy',assemblyRotation:opt.assemblyRotation||0});if(opt.assembly){Object.assign(doc.items[1],{plane:'xz',assemblyY:-25,z:6});Object.assign(doc.items[2],{plane:'yz',assemblyX:-35,assemblyY:10,z:6});}const parts=drawingParts(doc,shapes),b=drawingBounds(parts,'iso');const section=document.createElement('section');section.innerHTML=`<h2>${title}</h2><svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x-10} ${b.y-10} ${b.width+20} ${b.height+20}">${renderer(parts,{view:'iso',materialId:doc.materialId,finish:doc.finish,strokeWidth:.3})}</svg>`;document.querySelector('#cases').append(section);}
