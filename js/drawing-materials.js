// Appearance presets for documentation, deliberately separate from laser power/speed.
export const DRAWING_MATERIALS=[
 {id:'plywood-birch',name:'Bjørkekryssfiner',thickness:3,face:'#e8d2a7',edge:'#aa8050',texture:'plywood'},
 {id:'mdf',name:'MDF',thickness:3,face:'#bb9667',edge:'#977044',texture:'fiber'},
 {id:'oak',name:'Eik',thickness:6,face:'#bd925e',edge:'#8c653c',texture:'grain'},
 {id:'walnut',name:'Valnøtt',thickness:6,face:'#79563e',edge:'#513b2b',texture:'grain'},
 {id:'pine',name:'Furu',thickness:6,face:'#edd09b',edge:'#b78d55',texture:'grain'},
 {id:'bamboo',name:'Bambus',thickness:3,face:'#d6b971',edge:'#9b7c3b',texture:'grain'},
 {id:'acrylic-clear',name:'Akryl – klar (illustrert frostet)',thickness:3,face:'#d9edf0',edge:'#80b6c2',texture:'gloss'},
 {id:'acrylic-black',name:'Akryl – svart',thickness:3,face:'#303942',edge:'#161d23',texture:'gloss'},
 {id:'acrylic-white',name:'Akryl – hvit',thickness:3,face:'#f5f5f0',edge:'#c9cec9',texture:'gloss'},
 {id:'aluminium',name:'Aluminium – børstet',thickness:1,face:'#c7ced4',edge:'#87939f',texture:'brushed'},
 {id:'cardboard',name:'Papp',thickness:2,face:'#ccad79',edge:'#967342',texture:'fiber'},
 {id:'leather',name:'Lær – natur',thickness:2,face:'#ac7950',edge:'#745037',texture:'fiber'},
 {id:'felt',name:'Filt – grå',thickness:3,face:'#92979c',edge:'#646b73',texture:'fiber'}
];
export const materialById=id=>DRAWING_MATERIALS.find(m=>m.id===id);
export const legacyMaterial=finish=>({wood:'plywood-birch',mdf:'mdf',acrylic:'acrylic-clear',metal:'aluminium',white:'acrylic-white'}[finish]||'plywood-birch');
export const drawingMaterial=(part,doc={})=>materialById(part?.item?.materialId)||materialById(doc.materialId)||materialById(legacyMaterial(doc.finish));
export function materialPattern(material,id,side=false) {
 const base=side?material.edge:material.face,ink=side?'#fff':'#51391f';
 let lines='';
 if(side&&material.texture==='plywood')lines='<path d="M0 1H12 M0 3H12 M0 5H12" stroke="#f6dfb6" stroke-width=".35" opacity=".55"/>';
 else if(['grain','plywood'].includes(material.texture))lines=`<path d="M-2 1 Q4 -1 14 1 M-2 5 Q4 3 14 5 M0 2 Q6 4 12 2" fill="none" stroke="${ink}" stroke-width=".12" opacity=".16"/>`;
 else if(material.texture==='fiber')lines='<path d="M1 1l.3 .2 M4 3l.5 -.2 M8 1l.4 .2 M10 5l.3 -.2 M2 5l.4 .1 M6 5l.2 .1" stroke="#493928" stroke-width=".18" opacity=".2"/>';
 else if(material.texture==='brushed')lines='<path d="M0 1H12 M0 3H12 M0 5H12" stroke="white" stroke-width=".12" opacity=".32"/>';
 else if(material.texture==='gloss')lines='<path d="M0 0L6 6 M6 0L12 6" stroke="white" stroke-width="1.5" opacity=".08"/>';
 return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="12" height="6"><rect width="12" height="6" fill="${base}"/>${lines}</pattern>`;
}
