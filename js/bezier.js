// Editable cubic Bézier paths. Handles are absolute points in the same source
// coordinate system as their anchor; rendering samples are never edit nodes.
const P = p => ({ x: p.x, y: p.y });
const add = (a,b) => ({x:a.x+b.x,y:a.y+b.y});
const sub = (a,b) => ({x:a.x-b.x,y:a.y-b.y});
const mul = (p,k) => ({x:p.x*k,y:p.y*k});
const dot = (a,b) => a.x*b.x+a.y*b.y;
const len = p => Math.hypot(p.x,p.y);
const unit = p => mul(p,1/(len(p)||1));
export function mapNodes(nodes, transform) {
  return nodes.map(n => ({...n,...transform(n), ...(n.in ? {in:transform(n.in)} : {}), ...(n.out ? {out:transform(n.out)} : {})}));
}
export function moveAnchor(node, point) {
  const delta=sub(point,node);
  if(node.in) node.in=add(node.in,delta);
  if(node.out) node.out=add(node.out,delta);
  Object.assign(node,P(point));
}
export function moveControl(node, side, point, independent=false) {
  const other=side==='in'?'out':'in', length=node[other]?len(sub(node[other],node)):0;
  node[side]=P(point);
  if(independent) node.smooth=false;
  if(node.smooth && length) node[other]=add(node,mul(unit(sub(node,point)),length));
}
export function smoothNodes(nodes,closed=false) {
  return nodes.map((p,i) => {
    const prev=nodes[i?i-1:closed?nodes.length-1:0], next=nodes[i+1<nodes.length?i+1:closed?0:i];
    const tangent=mul(sub(next,prev),1/6);
    return {...P(p),smooth:true,...(i||closed?{in:sub(p,tangent)}:{}),...(i<nodes.length-1||closed?{out:add(p,tangent)}:{})};
  });
}
export function nodesToPath(nodes,closed=false) {
  if(!nodes.length)return '';
  const fmt=p=>`${Number(p.x.toFixed(6))} ${Number(p.y.toFixed(6))}`;
  const parts=[`M ${fmt(nodes[0])}`];
  for(let i=1;i<nodes.length+(closed?1:0);i++) {
    const a=nodes[i-1],b=nodes[i%nodes.length];
    parts.push(a.out||b.in?`C ${fmt(a.out||a)} ${fmt(b.in||b)} ${fmt(b)}`:`L ${fmt(b)}`);
  }
  if(closed)parts.push('Z');
  return parts.join(' ');
}
export function cubicAt(a,b,c,d,t) {
  const s=1-t;
  return {x:s*s*s*a.x+3*s*s*t*b.x+3*s*t*t*c.x+t*t*t*d.x,y:s*s*s*a.y+3*s*s*t*b.y+3*s*t*t*c.y+t*t*t*d.y};
}
export function nodesBounds(nodes,closed=false) {
  const points=nodes.map(P);
  for(let i=1;i<nodes.length+(closed?1:0);i++) {
    const a=nodes[i-1],d=nodes[i%nodes.length],b=a.out||a,c=d.in||d;
    if(!a.out&&!d.in)continue;
    for(const axis of ['x','y']) {
      const A=-a[axis]+3*b[axis]-3*c[axis]+d[axis],B=2*(a[axis]-2*b[axis]+c[axis]),C=b[axis]-a[axis];
      const disc=B*B-4*A*C;
      const roots=Math.abs(A)<1e-12?(Math.abs(B)<1e-12?[]:[-C/B]):disc<0?[]:[(-B+Math.sqrt(disc))/(2*A),(-B-Math.sqrt(disc))/(2*A)];
      for(const t of roots)if(t>0&&t<1)points.push(cubicAt(a,b,c,d,t));
    }
  }
  const x=Math.min(...points.map(p=>p.x)), y=Math.min(...points.map(p=>p.y));
  return {x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};
}

// Least-squares cubic fitting with chord-length parameters and recursive splits.
// Sharp corners split first. Existing artwork is only fitted on explicit request.
export function fitBezier(points,tolerance=.1,closed=false) {
  if(!Number.isFinite(tolerance)||tolerance<=0)throw new Error('Velg en positiv toleranse.');
  const pts=points.filter((p,i)=>!i||len(sub(p,points[i-1]))>1e-9).map(P);
  if(closed && pts.length>1 && len(sub(pts[0],pts.at(-1)))<1e-9)pts.pop();
  if(pts.length<2)return pts;
  if(closed)pts.push(P(pts[0]));
  const segments=[];
  function fit(first,last,t1,t2) {
    const a=pts[first],d=pts[last],distance=len(sub(d,a));
    if(last-first===1){
      // With no interior evidence, a straight segment is the faithful fit.
      segments.push([a,add(a,mul(sub(d,a),1/3)),add(a,mul(sub(d,a),2/3)),d]);return;
    }
    const u=[0];for(let i=first+1;i<=last;i++)u.push(u.at(-1)+len(sub(pts[i],pts[i-1])));
    const total=u.at(-1);for(let i=1;i<u.length;i++)u[i]/=total;
    let split=Math.floor((first+last)/2);
    for(let attempt=0;attempt<12;attempt++) {
    let c00=0,c01=0,c11=0,x0=0,x1=0;
    for(let i=0;i<u.length;i++) {
      const t=u[i],s=1-t,b0=s*s*s,b1=3*s*s*t,b2=3*s*t*t,b3=t*t*t;
      const v1=mul(t1,b1),v2=mul(t2,b2),v=sub(pts[first+i],add(mul(a,b0+b1),mul(d,b2+b3)));
      c00+=dot(v1,v1);c01+=dot(v1,v2);c11+=dot(v2,v2);x0+=dot(v1,v);x1+=dot(v2,v);
    }
    const det=c00*c11-c01*c01;
    let alpha=det?(x0*c11-x1*c01)/det:0,beta=det?(c00*x1-c01*x0)/det:0;
    if(alpha<distance*1e-6||beta<distance*1e-6||alpha>total*2||beta>total*2)alpha=beta=distance/3;
    const b=add(a,mul(t1,alpha)),c=add(d,mul(t2,beta));
    let error=0;
    for(let i=1;i<u.length-1;i++) {
      const e=len(sub(cubicAt(a,b,c,d,u[i]),pts[first+i]));
      if(e>error){error=e;split=first+i;}
    }
    if(error<=tolerance){segments.push([a,b,c,d]);return;}
    // Newton projection improves the parameterization before adding anchors.
    const next=[0];
    for(let i=1;i<u.length-1;i++) {
      const t=u[i],v=sub(cubicAt(a,b,c,d,t),pts[first+i]);
      const firstD=add(add(mul(sub(b,a),3*(1-t)*(1-t)),mul(sub(c,b),6*(1-t)*t)),mul(sub(d,c),3*t*t));
      const secondD=add(mul(add(sub(c,mul(b,2)),a),6*(1-t)),mul(add(sub(d,mul(c,2)),b),6*t));
      const denom=dot(firstD,firstD)+dot(v,secondD);
      next.push(denom?Math.max(0,Math.min(1,t-dot(v,firstD)/denom)):t);
    }
    next.push(1);
    if(next.some((t,i)=>i>0&&t<=next[i-1]))break;
    u.splice(0,u.length,...next);
    }
    const tangent=unit(sub(pts[split-1],pts[split+1]));
    fit(first,split,t1,tangent);fit(split,last,mul(tangent,-1),t2);
  }
  const seamSmooth=closed && dot(unit(sub(pts[1],pts[0])),unit(sub(pts[0],pts.at(-2))))>=.5;
  const cuts=[0];
  for(let i=1;i<pts.length-1;i++)if(dot(unit(sub(pts[i],pts[i-1])),unit(sub(pts[i+1],pts[i])))<.5)cuts.push(i);
  cuts.push(pts.length-1);
  for(let i=1;i<cuts.length;i++) {
    const a=cuts[i-1],b=cuts[i];
    const start=seamSmooth&&a===0?unit(sub(pts[1],pts.at(-2))):unit(sub(pts[a+1],pts[a]));
    const end=seamSmooth&&b===pts.length-1?unit(sub(pts.at(-2),pts[1])):unit(sub(pts[b-1],pts[b]));
    fit(a,b,start,end);
  }
  const nodes=[{...P(segments[0][0]),out:P(segments[0][1]),smooth:true}];
  segments.forEach((s,i)=>{
    if(i)nodes.at(-1).out=P(s[1]);
    nodes.push({...P(s[3]),in:P(s[2]),smooth:!cuts.slice(1,-1).some(j=>pts[j]===s[3])});
  });
  if(closed){nodes[0].in=nodes.pop().in;nodes[0].smooth=seamSmooth;}
  return nodes;
}
