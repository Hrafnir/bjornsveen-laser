// Display colors are independent of laser operations and export layer colors.
export function normalizeDisplayColor(value) {
  if (typeof value !== 'string') return null;
  const hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) return '#' + [...hex.slice(1)].map(c => c + c).join('');
  return null;
}
export function colorLeaves(shapes) {
  return shapes.flatMap(s => s.hidden || s.guideLabel ? [] : s.type === 'group' ? colorLeaves(s.children || []) : s.type === 'image' ? [] : [s]);
}
export function displayColor(shape) {
  return normalizeDisplayColor(shape.displayColor) || ({engrave:'#111827', score:'#2563eb', guide:'#10b981'}[shape.laserMode] || '#ff1e1e');
}
export function selectionColors(shapes) {
  return [...new Set(colorLeaves(shapes).map(displayColor))];
}
export function inheritDisplayColor(result, source) {
  const color = normalizeDisplayColor(source?.displayColor);
  if (color) result.displayColor = color;
  return result;
}
