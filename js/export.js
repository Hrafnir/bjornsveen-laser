// ============================================================================
// Bjørnsveen LaserStudio – 1:1 Millimeter SVG Exporter, SVG Importer & Storage
// Tailored for xTool Creative Space (XCS) / xTool Studio (P3 & F2 Ultra)
// ============================================================================

import {
  uid,
  roundMm,
  shapeToWorldSvgPath,
  shapeToWorldPolygons,
  computePolygonsBBox,
  createPathShapeFromPolygons,
  parseSvgPathToPolygons
} from './geometry.js';

const STORAGE_KEY = 'bjornsveen_laserstudio_autosave_v1';

/**
 * Generates a 1:1 millimeter-accurate SVG string ready for xTool Creative Space / Studio.
 * @param {Array} shapes - Active shapes array
 * @param {Object} options - { bedWidth, bedHeight, cropToContent, onlySelected, selectedIds, projectName }
 */
export function buildLaserSvgString(shapes, {
  bedWidth = 600,
  bedHeight = 400,
  cropToContent = true,
  onlySelected = false,
  selectedIds = new Set()
} = {}) {
  // Flatten groups and filter out invisible or 'guide' shapes
  const exportable = [];
  const collect = (list) => {
    for (const s of list) {
      if (!s || s.hidden || s.laserMode === 'guide') continue;
      if (s.type === 'group' && Array.isArray(s.children)) {
        collect(s.children);
      } else {
        exportable.push(s);
      }
    }
  };

  const sourceList = onlySelected
    ? shapes.filter(s => selectedIds.has(s.id))
    : shapes;
  collect(sourceList);

  // Compute tight bounding box if cropToContent is enabled
  let minX = 0;
  let minY = 0;
  let widthMm = bedWidth;
  let heightMm = bedHeight;

  if (cropToContent && exportable.length > 0) {
    const allLoops = [];
    for (const s of exportable) {
      allLoops.push(...shapeToWorldPolygons(s, 0.15));
    }
    const bbox = computePolygonsBBox(allLoops);
    minX = roundMm(bbox.x, 3);
    minY = roundMm(bbox.y, 3);
    widthMm = roundMm(Math.max(1, bbox.width), 3);
    heightMm = roundMm(Math.max(1, bbox.height), 3);
  }

  const engravePaths = [];
  const scorePaths = [];
  const cutPaths = [];

  for (const s of exportable) {
    const d = shapeToWorldSvgPath(s);
    if (!d) continue;
    const safeName = String(s.name || s.type).replace(/["<>]/g, '');

    if (s.laserMode === 'engrave') {
      engravePaths.push(
        `    <path id="${s.id}" data-name="${safeName}" d="${d}" fill="#000000" fill-rule="evenodd" stroke="none" />`
      );
    } else if (s.laserMode === 'score') {
      scorePaths.push(
        `    <path id="${s.id}" data-name="${safeName}" d="${d}" fill="none" stroke="#0000FF" stroke-width="0.1" stroke-linecap="round" stroke-linejoin="round" />`
      );
    } else {
      // Default: 'cut' (#FF0000)
      cutPaths.push(
        `    <path id="${s.id}" data-name="${safeName}" d="${d}" fill="none" stroke="#FF0000" stroke-width="0.1" stroke-linecap="round" stroke-linejoin="round" />`
      );
    }
  }

  const lines = [
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>`,
    `<!-- Generert med Bjørnsveen LaserStudio (1:1 millimeter for xTool P3 / F2 Ultra) -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="${minX} ${minY} ${widthMm} ${heightMm}">`
  ];

  if (engravePaths.length > 0) {
    lines.push(`  <g id="Lag_1_Gravering_Engrave">`);
    lines.push(...engravePaths);
    lines.push(`  </g>`);
  }
  if (scorePaths.length > 0) {
    lines.push(`  <g id="Lag_2_Linje_Score">`);
    lines.push(...scorePaths);
    lines.push(`  </g>`);
  }
  if (cutPaths.length > 0) {
    lines.push(`  <g id="Lag_3_Kutt_Cut">`);
    lines.push(...cutPaths);
    lines.push(`  </g>`);
  }

  lines.push(`</svg>`);
  return lines.join('\n');
}

/**
 * Triggers a browser file download.
 */
export function downloadTextFile(content, filename, mimeType = 'image/svg+xml;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ============================================================================
// EXTERNAL SVG IMPORTER
// ============================================================================

export function importSvgStringToShapes(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) return [];

  // Determine millimeter scale factor if SVG is in px instead of mm
  let scale = 1.0;
  const widthAttr = svgEl.getAttribute('width') || '';
  const viewBoxAttr = svgEl.getAttribute('viewBox') || '';
  if (widthAttr.endsWith('mm') && viewBoxAttr) {
    const wMm = parseFloat(widthAttr);
    const vbParts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
    if (wMm > 0 && vbParts.length === 4 && vbParts[2] > 0) {
      scale = wMm / vbParts[2];
    }
  } else if (widthAttr.endsWith('px') || (!widthAttr.endsWith('mm') && !widthAttr.endsWith('cm'))) {
    // Standard 96 DPI px -> mm conversion if dimensions look huge (> 500 units)
    const vbParts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
    if (vbParts.length === 4 && vbParts[2] > 700) {
      scale = 25.4 / 96;
    }
  }

  const importedShapes = [];
  const elements = svgEl.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line');

  elements.forEach((el, idx) => {
    // Ignore background rects inside defs or patterns
    if (el.closest('defs') || el.closest('pattern') || el.closest('clipPath')) return;

    const stroke = (el.getAttribute('stroke') || el.style?.stroke || '').toLowerCase();
    const fill = (el.getAttribute('fill') || el.style?.fill || '').toLowerCase();

    let laserMode = 'cut';
    if (stroke.includes('0000ff') || stroke === 'blue' || stroke.includes('3b82f6')) {
      laserMode = 'score';
    } else if (fill && fill !== 'none' && fill !== 'transparent' && (!stroke || stroke === 'none')) {
      laserMode = 'engrave';
    }

    const tag = el.tagName.toLowerCase();
    let loops = [];

    if (tag === 'path') {
      const d = el.getAttribute('d');
      if (d) loops = parseSvgPathToPolygons(d, 0.25);
    } else if (tag === 'rect') {
      const x = parseFloat(el.getAttribute('x')) || 0;
      const y = parseFloat(el.getAttribute('y')) || 0;
      const w = parseFloat(el.getAttribute('width')) || 0;
      const h = parseFloat(el.getAttribute('height')) || 0;
      if (w > 0 && h > 0) {
        const l = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
        l.closed = true;
        loops = [l];
      }
    } else if (tag === 'circle' || tag === 'ellipse') {
      const cx = parseFloat(el.getAttribute('cx')) || 0;
      const cy = parseFloat(el.getAttribute('cy')) || 0;
      const rx = tag === 'circle' ? (parseFloat(el.getAttribute('r')) || 0) : (parseFloat(el.getAttribute('rx')) || 0);
      const ry = tag === 'circle' ? rx : (parseFloat(el.getAttribute('ry')) || 0);
      if (rx > 0 && ry > 0) {
        const l = [];
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          l.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
        }
        l.closed = true;
        loops = [l];
      }
    } else if (tag === 'polygon' || tag === 'polyline') {
      const ptsAttr = (el.getAttribute('points') || '').trim();
      const nums = ptsAttr.split(/[\s,]+/).map(Number);
      const l = [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        if (!isNaN(nums[i]) && !isNaN(nums[i + 1])) {
          l.push({ x: nums[i], y: nums[i + 1] });
        }
      }
      if (l.length >= 2) {
        l.closed = tag === 'polygon';
        loops = [l];
      }
    } else if (tag === 'line') {
      const x1 = parseFloat(el.getAttribute('x1')) || 0;
      const y1 = parseFloat(el.getAttribute('y1')) || 0;
      const x2 = parseFloat(el.getAttribute('x2')) || 0;
      const y2 = parseFloat(el.getAttribute('y2')) || 0;
      const l = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
      l.closed = false;
      loops = [l];
    }

    if (loops.length > 0) {
      const scaled = loops.map(l => {
        const out = l.map(pt => ({ x: pt.x * scale, y: pt.y * scale }));
        out.closed = l.closed !== false;
        return out;
      });
      const name = el.getAttribute('data-name') || el.getAttribute('id') || `Importert ${tag} #${idx + 1}`;
      importedShapes.push(createPathShapeFromPolygons(scaled, laserMode, name));
    }
  });

  // Shift imported shapes so top-left starts at (15, 15 mm) if negative or far off
  if (importedShapes.length > 0) {
    const allLoops = [];
    for (const s of importedShapes) allLoops.push(...shapeToWorldPolygons(s, 0.3));
    const bbox = computePolygonsBBox(allLoops);
    if (bbox.x < 0 || bbox.y < 0 || bbox.x > 400 || bbox.y > 300) {
      const dx = 20 - bbox.x;
      const dy = 20 - bbox.y;
      for (const s of importedShapes) {
        s.x = roundMm(s.x + dx, 2);
        s.y = roundMm(s.y + dy, 2);
      }
    }
  }

  return importedShapes;
}

// ============================================================================
// LOCAL STORAGE AUTO-SAVE & PROJECT JSON
// ============================================================================

export function saveWorkspaceToLocal(state) {
  try {
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      machineKey: state.machineKey,
      bedWidth: state.bedWidth,
      bedHeight: state.bedHeight,
      snapMm: state.snapMm,
      shapes: state.shapes
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    // Ignore quota errors
  }
}

export function loadWorkspaceFromLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.shapes)) {
      return data;
    }
  } catch (e) {
    return null;
  }
  return null;
}
