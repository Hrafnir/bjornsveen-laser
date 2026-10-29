import { strokeFontPaths,cleanFontContours } from './font-contours.js';
// Standard 9 + 9 + 4 + 4 key: ABC/DEF/GHI, dotted JKL/MNO/PQR,
// then S(top), T(left), U(right), V(bottom), and dotted WXYZ.
// Original vector construction; no third-party font binary is needed.
export function pigpenText(text){return text.toUpperCase().replaceAll('Æ','AE').replaceAll('Ø','O').replaceAll('Å','A').normalize('NFD').replace(/\p{M}/gu,'');}
export function pigpenGlyph(char) {
  const n=char.charCodeAt(0)-65;if(n<0||n>25)return null;
  const strokes=[],dotted=n>=9&&n<18||n>=22;
  let dot={x:.5,y:.5};
  if(n<18){
    const cell=n%9,row=Math.floor(cell/3),col=cell%3;
    if(row>0)strokes.push([{x:0,y:0},{x:1,y:0}]);
    if(row<2)strokes.push([{x:0,y:1},{x:1,y:1}]);
    if(col>0)strokes.push([{x:0,y:0},{x:0,y:1}]);
    if(col<2)strokes.push([{x:1,y:0},{x:1,y:1}]);
  }else{
    const v=(n-18)%4;
    const paths=[[[0,0],[.5,.5],[1,0]],[[0,0],[.5,.5],[0,1]],[[1,0],[.5,.5],[1,1]],[[0,1],[.5,.5],[1,1]]];
    strokes.push(paths[v].map(([x,y])=>({x,y})));dot=[{x:.5,y:.16},{x:.16,y:.5},{x:.84,y:.5},{x:.5,y:.84}][v];
  }
  const loops=strokeFontPaths(strokes,.095);
  if(dotted){const circle=Array.from({length:24},(_,i)=>({x:dot.x+.075*Math.cos(i*Math.PI/12),y:dot.y+.075*Math.sin(i*Math.PI/12)}));loops.push(circle)}
  return cleanFontContours(loops);
}
