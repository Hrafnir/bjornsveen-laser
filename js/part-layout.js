// Deterministic rectangle packing using the compensated cut bounds. Parts keep
// their orientation, so the selected grain direction and flex axes stay intact.
export function packPartBounds(bounds, gap = 1, {width: bedWidth = 600, height: bedHeight = 400} = {}) {
  if (!bounds.length) return [];
  const items = bounds.map((b, index) => ({ index, w: b.width + gap, h: b.height + gap }));
  const area = items.reduce((sum, b) => sum + b.w * b.h, 0);
  const minWidth = Math.max(...items.map(b => b.w));
  const widths = new Set([Math.max(minWidth,bedWidth-20+gap), minWidth, ...items.map(b => Math.max(minWidth, b.w * 2))]);
  for (let ratio = .7; ratio <= 2.1; ratio += .1) widths.add(Math.max(minWidth, Math.sqrt(area) * ratio));
  const orders = [
    [...items].sort((a,b) => b.w*b.h-a.w*a.h || b.h-a.h || a.index-b.index),
    [...items].sort((a,b) => b.h-a.h || b.w-a.w || a.index-b.index)
  ];
  let best;
  const contains = (a,b) => b.x >= a.x-1e-8 && b.y >= a.y-1e-8 && b.x+b.w <= a.x+a.w+1e-8 && b.y+b.h <= a.y+a.h+1e-8;
  for (const width of widths) for (const order of orders) {
    let free = [{ x: 0, y: 0, w: width, h: items.reduce((sum,b) => sum+b.h, 0) }];
    const placed = [];
    for (const item of order) {
      const slots = free.filter(r => r.w+1e-8 >= item.w && r.h+1e-8 >= item.h);
      slots.sort((a,b) => a.y-b.y || a.x-b.x || Math.min(a.w-item.w,a.h-item.h)-Math.min(b.w-item.w,b.h-item.h));
      if (!slots.length) throw Error('Kunne ikke plassere boksdelene.');
      const p = { ...item, x: slots[0].x, y: slots[0].y };
      placed.push(p);
      const next = [];
      for (const r of free) {
        if (p.x >= r.x+r.w-1e-8 || p.x+p.w <= r.x+1e-8 || p.y >= r.y+r.h-1e-8 || p.y+p.h <= r.y+1e-8) { next.push(r); continue; }
        if (p.x > r.x+1e-8) next.push({ ...r, w:p.x-r.x });
        if (p.x+p.w < r.x+r.w-1e-8) next.push({ ...r, x:p.x+p.w, w:r.x+r.w-p.x-p.w });
        if (p.y > r.y+1e-8) next.push({ ...r, h:p.y-r.y });
        if (p.y+p.h < r.y+r.h-1e-8) next.push({ ...r, y:p.y+p.h, h:r.y+r.h-p.y-p.h });
      }
      free = next.filter((r,i) => !next.some((q,j) => j!==i && contains(q,r) && (!contains(r,q) || j<i)));
    }
    const w = Math.max(...placed.map(p => p.x+p.w))-gap;
    const h = Math.max(...placed.map(p => p.y+p.h))-gap;
    const score = w*h, fits=w<=bedWidth-20+1e-6&&h<=bedHeight-20+1e-6;
    if (!best || (fits&&!best.fits) || (fits===best.fits&&(score < best.score-1e-6 || (Math.abs(score-best.score)<1e-6 && Math.max(w,h)<best.longSide)))) best={score,fits,longSide:Math.max(w,h),placed};
  }
  return best.placed.sort((a,b) => a.index-b.index).map(p => ({x:p.x+10,y:p.y+10}));
}
