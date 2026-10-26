// ============================================================================
// Bjørnsveen LaserStudio – Main Application Controller
// ============================================================================

import {
  uid,
  clamp,
  roundMm,
  evalMathExpr,
  dist,
  rotatePoint,
  shapeToWorldSvgPath,
  shapeToWorldPolygons,
  computePolygonsBBox,
  getShapesBBox,
  createPathShapeFromPolygons,
  syncLineBBox,
  buildSmoothSplineLoop,
  rebuildPathShapeFromNodes,
  performBooleanOnShapes,
  createOffsetContour,
  weldKeyringTabToShape,
  analyzeShapesForLaser
} from './geometry.js';

import {
  createTextShape,
  updateTextShape
} from './fonts.js';

import {
  LASER_ICONS,
  createIconShape,
  traceImageToPolygons
} from './icons.js';

import {
  generateFingerJointBox,
  generateSignOrKeyring,
  generateJigsawPuzzle,
  generateInvoluteGears,
  generateMandalaOrnament,
  renderShapesPreviewSvg
} from './generators.js';

import {
  buildLaserSvgString,
  downloadTextFile,
  importSvgStringToShapes,
  saveWorkspaceToLocal,
  loadWorkspaceFromLocal
} from './export.js';

// ============================================================================
// MACHINE PROFILES (xTool P3 CO2, xTool F2 Ultra UV & Standard Sheets)
// ============================================================================

const MACHINE_PROFILES = {
  'xtool-p3': { name: 'xTool P3 CO2-laser', width: 914, height: 457, isGalvo: false },
  'xtool-f2': { name: 'xTool F2 Ultra UV-laser', width: 220, height: 220, isGalvo: true },
  'sheet-600x400': { name: 'Kryssfiner / Plate (600 × 400 mm)', width: 600, height: 400, isGalvo: false },
  'sheet-450x300': { name: 'Kryssfiner / Plate (450 × 300 mm)', width: 450, height: 300, isGalvo: false },
  'sheet-300x200': { name: 'Kryssfiner / Plate (300 × 200 mm)', width: 300, height: 200, isGalvo: false },
  'sheet-a3': { name: 'A3-plate (420 × 297 mm)', width: 420, height: 297, isGalvo: false },
  'sheet-a4': { name: 'A4-plate (297 × 210 mm)', width: 297, height: 210, isGalvo: false },
  'custom': { name: 'Egendefinert arbeidsflate', width: 600, height: 400, isGalvo: false }
};

// ============================================================================
// APPLICATION STATE
// ============================================================================

const state = {
  machineKey: 'sheet-600x400',
  bedWidth: 600,
  bedHeight: 400,
  snapMm: 1,
  activeTool: 'select',
  activeLaserMode: 'cut', // 'cut' | 'score' | 'engrave' | 'guide'
  shapes: [],
  selectedIds: new Set(),

  // Viewport transform (viewBox in mm)
  viewX: -25,
  viewY: -25,
  viewW: 660,
  viewH: 450,

  // Undo / Redo stacks
  undoStack: [],
  redoStack: [],

  // Interaction state
  interaction: null, // { type: 'pan'|'draw'|'move'|'resize'|'rotate'|'marquee'|'measure', ... }
  penPoints: [],
  penCursor: null,
  measureLine: null, // { x1, y1, x2, y2 }
  spacePressed: false,
  curveModeDefault: false,
  editingGroupId: null,

  // Modal state
  activeGeneratorTab: 'box',
  modalPreviewShapes: [],
  traceImageElement: null
};

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const svgEl = document.getElementById('main-svg');
const viewportEl = document.getElementById('canvas-viewport');
const shapesLayerEl = document.getElementById('shapes-layer');
const overlayLayerEl = document.getElementById('overlay-layer');
const rulerTopCanvas = document.getElementById('ruler-top');
const rulerLeftCanvas = document.getElementById('ruler-left');
const hintBannerEl = document.getElementById('workspace-hint');

// ============================================================================
// INITIALIZATION
// ============================================================================

function initApp() {
  // Restore autosave if present
  const saved = loadWorkspaceFromLocal();
  if (saved && Array.isArray(saved.shapes) && saved.shapes.length > 0) {
    state.machineKey = saved.machineKey || 'sheet-600x400';
    state.bedWidth = saved.bedWidth || 600;
    state.bedHeight = saved.bedHeight || 400;
    state.snapMm = saved.snapMm !== undefined ? saved.snapMm : 1;
    state.shapes = saved.shapes;
    document.getElementById('machine-select').value = state.machineKey;
    document.getElementById('snap-select').value = String(state.snapMm);
  } else {
    // Create a welcoming starter sign so new students immediately see how Cut, Score & Engrave work!
    const starterShapes = generateSignOrKeyring({
      signStyle: 'rounded',
      widthMm: 110,
      heightMm: 42,
      cornerRadiusMm: 8,
      holeMode: 'keyring-ear',
      holeDiamMm: 4.5,
      innerBorder: true,
      headline: 'BJØRNSVEEN',
      subtitle: 'SKAPERVERKSTED',
      fontKey: 'sans-bold',
      iconId: 'lightning'
    });
    state.shapes = starterShapes;
  }

  updateBedDimensionsUI();
  bindHeaderEvents();
  bindToolbarEvents();
  bindCanvasEvents();
  bindInspectorEvents();
  bindModalEvents();
  bindKeyboardShortcuts();

  window.addEventListener('resize', () => {
    fitBedToViewport();
    renderAll();
  });

  setTimeout(() => {
    fitBedToViewport();
    renderAll();
  }, 30);
}

// ============================================================================
// UNDO / REDO & STATE SNAPSHOTS
// ============================================================================

function pushUndoSnapshot() {
  const snapshot = JSON.stringify(state.shapes);
  if (state.undoStack.length > 0 && state.undoStack[state.undoStack.length - 1] === snapshot) {
    return;
  }
  state.undoStack.push(snapshot);
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.redoStack = [];
  updateUndoRedoButtons();
  saveWorkspaceToLocal(state);
}

function undo() {
  if (state.undoStack.length === 0) return;
  state.redoStack.push(JSON.stringify(state.shapes));
  const prev = state.undoStack.pop();
  state.shapes = JSON.parse(prev);
  state.selectedIds.clear();
  updateUndoRedoButtons();
  saveWorkspaceToLocal(state);
  renderAll();
  showToast('↩ Angret siste handling');
}

function redo() {
  if (state.redoStack.length === 0) return;
  state.undoStack.push(JSON.stringify(state.shapes));
  const next = state.redoStack.pop();
  state.shapes = JSON.parse(next);
  state.selectedIds.clear();
  updateUndoRedoButtons();
  saveWorkspaceToLocal(state);
  renderAll();
  showToast('↪ Gjorde om handling');
}

function updateUndoRedoButtons() {
  document.getElementById('btn-undo').disabled = state.undoStack.length === 0;
  document.getElementById('btn-redo').disabled = state.redoStack.length === 0;
}

// ============================================================================
// VIEWPORT, BED & RULERS (1 SVG unit = 1 mm)
// ============================================================================

function updateBedDimensionsUI() {
  const profile = MACHINE_PROFILES[state.machineKey] || MACHINE_PROFILES['sheet-600x400'];
  const customWrap = document.getElementById('custom-bed-wrap');
  if (state.machineKey === 'custom') {
    customWrap.style.display = 'flex';
    const bwInput = document.getElementById('bed-width-input');
    const bhInput = document.getElementById('bed-height-input');
    state.bedWidth = roundMm(clamp(evalMathExpr(bwInput.value, state.bedWidth || 600), 20, 2000), 1);
    state.bedHeight = roundMm(clamp(evalMathExpr(bhInput.value, state.bedHeight || 400), 20, 2000), 1);
    bwInput.value = state.bedWidth;
    bhInput.value = state.bedHeight;
  } else {
    customWrap.style.display = 'none';
    state.bedWidth = profile.width;
    state.bedHeight = profile.height;
    document.getElementById('bed-width-input').value = state.bedWidth;
    document.getElementById('bed-height-input').value = state.bedHeight;
  }

  for (const id of ['bed-shadow', 'bed-surface', 'bed-grid', 'bed-border']) {
    const el = document.getElementById(id);
    if (el) {
      el.setAttribute('width', state.bedWidth);
      el.setAttribute('height', state.bedHeight);
    }
  }

  const f2Guides = document.getElementById('f2-galvo-guides');
  if (f2Guides) {
    f2Guides.style.display = profile.isGalvo ? 'block' : 'none';
  }

  const labelEl = document.getElementById('bed-label');
  if (labelEl) {
    const title = state.machineKey === 'custom'
      ? `Egendefinert plate (${state.bedWidth} × ${state.bedHeight} mm)`
      : `${profile.name} (${state.bedWidth} × ${state.bedHeight} mm)`;
    labelEl.textContent = `${title} — Nullpunkt (0,0 mm)`;
  }

  saveWorkspaceToLocal(state);
}

function fitBedToViewport() {
  const rect = viewportEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const padX = state.bedWidth * 0.12 + 20;
  const padY = state.bedHeight * 0.14 + 24;
  const targetW = state.bedWidth + padX * 2;
  const targetH = state.bedHeight + padY * 2;
  const viewAspect = rect.width / rect.height;
  const bedAspect = targetW / targetH;

  if (viewAspect > bedAspect) {
    state.viewH = targetH;
    state.viewW = targetH * viewAspect;
  } else {
    state.viewW = targetW;
    state.viewH = targetW / viewAspect;
  }
  state.viewX = (state.bedWidth - state.viewW) / 2;
  state.viewY = (state.bedHeight - state.viewH) / 2;
  applyViewBox();
}

function zoomByFactor(factor, centerClientX = null, centerClientY = null) {
  const rect = viewportEl.getBoundingClientRect();
  const cx = centerClientX !== null ? centerClientX - rect.left : rect.width / 2;
  const cy = centerClientY !== null ? centerClientY - rect.top : rect.height / 2;

  const worldX = state.viewX + (cx / rect.width) * state.viewW;
  const worldY = state.viewY + (cy / rect.height) * state.viewH;

  const newW = clamp(state.viewW / factor, 15, 4500);
  const actualFactor = state.viewW / newW;
  const newH = state.viewH / actualFactor;

  state.viewW = newW;
  state.viewH = newH;
  state.viewX = worldX - (cx / rect.width) * state.viewW;
  state.viewY = worldY - (cy / rect.height) * state.viewH;

  applyViewBox();
  renderOverlay();
}

function applyViewBox() {
  svgEl.setAttribute('viewBox', `${state.viewX} ${state.viewY} ${state.viewW} ${state.viewH}`);
  const zoomPct = Math.round((state.bedWidth / state.viewW) * 100);
  document.getElementById('zoom-label').textContent = `${clamp(zoomPct, 5, 2500)}%`;
  renderRulers();
}

function clientToWorldMm(clientX, clientY, applySnap = false) {
  const rect = viewportEl.getBoundingClientRect();
  let x = state.viewX + ((clientX - rect.left) / rect.width) * state.viewW;
  let y = state.viewY + ((clientY - rect.top) / rect.height) * state.viewH;
  if (applySnap && state.snapMm > 0) {
    x = Math.round(x / state.snapMm) * state.snapMm;
    y = Math.round(y / state.snapMm) * state.snapMm;
  }
  return { x: roundMm(x, 2), y: roundMm(y, 2) };
}

function renderRulers() {
  const rect = viewportEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const dpr = window.devicePixelRatio || 1;
  rulerTopCanvas.width = rect.width * dpr;
  rulerTopCanvas.height = 26 * dpr;
  rulerLeftCanvas.width = 26 * dpr;
  rulerLeftCanvas.height = rect.height * dpr;

  const ctxT = rulerTopCanvas.getContext('2d');
  const ctxL = rulerLeftCanvas.getContext('2d');
  ctxT.scale(dpr, dpr);
  ctxL.scale(dpr, dpr);

  ctxT.clearRect(0, 0, rect.width, 26);
  ctxL.clearRect(0, 0, 26, rect.height);

  const pxPerMm = rect.width / state.viewW;
  let majorStep = 10;
  if (pxPerMm < 0.8) majorStep = 100;
  else if (pxPerMm < 2.2) majorStep = 50;
  else if (pxPerMm < 5.5) majorStep = 20;
  else if (pxPerMm > 20) majorStep = 5;
  const minorStep = majorStep / 5;

  ctxT.fillStyle = '#94a3b8';
  ctxT.strokeStyle = '#475569';
  ctxT.font = '10px -apple-system, sans-serif';
  ctxT.lineWidth = 1;

  const startMmX = Math.floor(state.viewX / minorStep) * minorStep;
  const endMmX = Math.ceil((state.viewX + state.viewW) / minorStep) * minorStep;

  ctxT.beginPath();
  for (let mm = startMmX; mm <= endMmX; mm += minorStep) {
    const px = ((mm - state.viewX) / state.viewW) * rect.width;
    const isMajor = Math.abs(mm % majorStep) < 0.001;
    ctxT.moveTo(px, isMajor ? 4 : 17);
    ctxT.lineTo(px, 26);
    if (isMajor) {
      ctxT.fillText(`${Math.round(mm)}`, px + 3, 13);
    }
  }
  ctxT.stroke();

  // Left vertical ruler
  ctxL.fillStyle = '#94a3b8';
  ctxL.strokeStyle = '#475569';
  ctxL.font = '10px -apple-system, sans-serif';
  ctxL.lineWidth = 1;

  const startMmY = Math.floor(state.viewY / minorStep) * minorStep;
  const endMmY = Math.ceil((state.viewY + state.viewH) / minorStep) * minorStep;

  ctxL.beginPath();
  for (let mm = startMmY; mm <= endMmY; mm += minorStep) {
    const py = ((mm - state.viewY) / state.viewH) * rect.height;
    const isMajor = Math.abs(mm % majorStep) < 0.001;
    ctxL.moveTo(isMajor ? 4 : 17, py);
    ctxL.lineTo(26, py);
    if (isMajor) {
      ctxL.save();
      ctxL.translate(12, py + 3);
      ctxL.rotate(-Math.PI / 2);
      ctxL.fillText(`${Math.round(mm)}`, 0, 0);
      ctxL.restore();
    }
  }
  ctxL.stroke();
}

// ============================================================================
// RENDERING: SHAPES, OVERLAY HANDLES & LAYER LIST
// ============================================================================

function getEditingGroup() {
  if (!state.editingGroupId) return null;
  const g = state.shapes.find(s => s.id === state.editingGroupId && s.type === 'group');
  if (!g || !Array.isArray(g.children)) {
    state.editingGroupId = null;
    return null;
  }
  return g;
}

function getActiveContainerList() {
  const g = getEditingGroup();
  return g ? g.children : state.shapes;
}

function syncGroupBBox(group) {
  if (!group || group.type !== 'group' || !Array.isArray(group.children)) return;
  if (group.children.length === 0) return;
  const bbox = getShapesBBox(group.children);
  group.x = roundMm(bbox.x, 2);
  group.y = roundMm(bbox.y, 2);
  group.width = roundMm(bbox.width, 2);
  group.height = roundMm(bbox.height, 2);
}

function enterGroupEditMode(groupId, initialChildId = null) {
  const g = state.shapes.find(s => s.id === groupId && s.type === 'group');
  if (!g || !Array.isArray(g.children)) return;
  state.editingGroupId = g.id;
  if (initialChildId && g.children.some(c => c.id === initialChildId)) {
    state.selectedIds = new Set([initialChildId]);
  } else {
    state.selectedIds = new Set();
  }
  setActiveTool('select');
  renderAll();
  showToast(`📦 Redigerer inni "${g.name || 'Gruppe'}" – klikk på enkeltdeler for å endre dem!`);
}

function exitGroupEditMode() {
  const g = getEditingGroup();
  if (!g) return;
  syncGroupBBox(g);
  state.editingGroupId = null;
  if (g.children.length === 0) {
    state.shapes = state.shapes.filter(s => s.id !== g.id);
    state.selectedIds.clear();
  } else {
    state.selectedIds = new Set([g.id]);
  }
  renderAll();
  showToast('✓ Ferdig med grupperedigering');
}

function removeChildFromGroup(groupId, childId) {
  const g = state.shapes.find(s => s.id === groupId && s.type === 'group');
  if (!g || !Array.isArray(g.children)) return;
  const child = g.children.find(c => c.id === childId);
  if (!child) return;
  pushUndoSnapshot();
  g.children = g.children.filter(c => c.id !== childId);
  state.shapes.push(child);
  if (g.children.length === 0) {
    state.shapes = state.shapes.filter(s => s.id !== g.id);
    if (state.editingGroupId === g.id) state.editingGroupId = null;
  } else {
    syncGroupBBox(g);
  }
  state.selectedIds = new Set([child.id]);
  renderAll();
  showToast(`📤 Tok "${child.name || child.type}" ut av gruppen`);
}

function renderAll() {
  const editingGroup = getEditingGroup();
  if (editingGroup) {
    syncGroupBBox(editingGroup);
  }
  const banner = document.getElementById('group-edit-banner');
  if (banner) {
    if (editingGroup) {
      banner.style.display = 'flex';
      document.getElementById('group-edit-title').textContent = `${editingGroup.name || 'Gruppe'} (${editingGroup.children.length} deler)`;
      const takeOutBtn = document.getElementById('btn-take-out-of-group');
      if (takeOutBtn) {
        takeOutBtn.style.display = state.selectedIds.size > 0 ? 'inline-flex' : 'none';
      }
    } else {
      banner.style.display = 'none';
    }
  }
  renderShapesLayer();
  renderOverlay();
  renderInspector();
  renderLayerList();
}

function getStrokeWidthMm() {
  // Visual stroke thickness scales gently with zoom so lines are always easy to see on screen
  return clamp(state.viewW / 450, 0.25, 1.4);
}

function renderShapesLayer() {
  shapesLayerEl.innerHTML = '';
  const sw = getStrokeWidthMm();
  const editingGroup = getEditingGroup();

  for (const s of state.shapes) {
    if (s.hidden) continue;
    if (editingGroup && s.id === editingGroup.id) {
      // Render children individually so they can be selected and edited directly!
      for (const c of editingGroup.children) {
        if (c.hidden) continue;
        const childEl = createSvgElementForShape(c, sw);
        if (childEl) {
          shapesLayerEl.appendChild(childEl);
        }
      }
    } else {
      const el = createSvgElementForShape(s, sw);
      if (el) {
        if (editingGroup) {
          el.setAttribute('opacity', '0.32');
          el.style.pointerEvents = 'none';
        }
        shapesLayerEl.appendChild(el);
      }
    }
  }
}

function createSvgElementForShape(s, sw) {
  if (s.type === 'group' && Array.isArray(s.children)) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.id = s.id;
    for (const c of s.children) {
      if (c.hidden) continue;
      const childEl = createSvgElementForShape(c, sw);
      if (childEl) {
        childEl.dataset.id = s.id; // Clicking child selects group when not in group-edit mode
        g.appendChild(childEl);
      }
    }
    return g;
  }

  const d = shapeToWorldSvgPath(s);
  if (!d) return null;

  const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathEl.setAttribute('d', d);
  pathEl.dataset.id = s.id;
  pathEl.style.cursor = state.activeTool === 'select' ? 'move' : 'crosshair';

  if (s.laserMode === 'engrave') {
    pathEl.setAttribute('fill', '#111827');
    pathEl.setAttribute('fill-rule', 'evenodd');
    pathEl.setAttribute('stroke', 'none');
  } else if (s.laserMode === 'score') {
    pathEl.setAttribute('fill', 'rgba(59, 130, 246, 0.03)');
    pathEl.setAttribute('fill-rule', 'evenodd');
    pathEl.setAttribute('stroke', '#2563eb');
    pathEl.setAttribute('stroke-width', String(sw));
    pathEl.setAttribute('stroke-linecap', 'round');
    pathEl.setAttribute('stroke-linejoin', 'round');
  } else if (s.laserMode === 'guide') {
    pathEl.setAttribute('fill', 'none');
    pathEl.setAttribute('stroke', '#10b981');
    pathEl.setAttribute('stroke-width', String(sw * 0.85));
    pathEl.setAttribute('stroke-dasharray', `${sw * 3},${sw * 2}`);
  } else {
    // 'cut' (#ff1e1e)
    pathEl.setAttribute('fill', 'rgba(255, 30, 30, 0.02)');
    pathEl.setAttribute('fill-rule', 'evenodd');
    pathEl.setAttribute('stroke', '#ff1e1e');
    pathEl.setAttribute('stroke-width', String(sw));
    pathEl.setAttribute('stroke-linecap', 'round');
    pathEl.setAttribute('stroke-linejoin', 'round');
  }

  return pathEl;
}

function getSelectedShapes() {
  const list = getActiveContainerList();
  return list.filter(s => state.selectedIds.has(s.id));
}

function renderOverlay() {
  overlayLayerEl.innerHTML = '';
  const unit = state.viewW / 900; // Screen-independent size unit in mm

  // 0. If currently editing inside a group, draw a dashed amber boundary around the group
  const editingGroup = getEditingGroup();
  if (editingGroup && editingGroup.children.length > 0) {
    const gBox = getShapesBBox(editingGroup.children);
    const pad = unit * 6;
    const gRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    gRect.setAttribute('x', gBox.x - pad);
    gRect.setAttribute('y', gBox.y - pad);
    gRect.setAttribute('width', gBox.width + pad * 2);
    gRect.setAttribute('height', gBox.height + pad * 2);
    gRect.setAttribute('rx', String(unit * 4));
    gRect.setAttribute('fill', 'rgba(245, 158, 11, 0.03)');
    gRect.setAttribute('stroke', '#f59e0b');
    gRect.setAttribute('stroke-width', String(unit * 1.4));
    gRect.setAttribute('stroke-dasharray', `${unit * 5},${unit * 3}`);
    gRect.setAttribute('pointer-events', 'none');
    overlayLayerEl.appendChild(gRect);
  }

  // 1. Selected Shapes Bounding Box, Resize Handles, Line Endpoint/Curve Handles & Node Handles
  const selected = getSelectedShapes();
  if (selected.length > 0) {
    const single = selected.length === 1 ? selected[0] : null;

    if (single && single.type === 'line') {
      // Dedicated crisp Line Endpoint & Curve Handles!
      const x1 = Number(single.x1) || 0;
      const y1 = Number(single.y1) || 0;
      const x2 = Number(single.x2) || 0;
      const y2 = Number(single.y2) || 0;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const angle = roundMm(Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI), 1);

      // Chord guide line
      const chord = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      chord.setAttribute('x1', x1);
      chord.setAttribute('y1', y1);
      chord.setAttribute('x2', x2);
      chord.setAttribute('y2', y2);
      chord.setAttribute('stroke', '#0ea5e9');
      chord.setAttribute('stroke-width', String(unit * 1.1));
      chord.setAttribute('stroke-dasharray', `${unit * 3.5},${unit * 2.5}`);
      chord.setAttribute('pointer-events', 'none');
      overlayLayerEl.appendChild(chord);

      // Curve midpoint handle (always available when curved is checked, or subtle on straight line)
      const midX = single.curved && single.cx !== undefined ? single.cx : (x1 + x2) / 2;
      const midY = single.curved && single.cy !== undefined ? single.cy : (y1 + y2) / 2;

      if (single.curved) {
        for (const [px, py] of [[x1, y1], [x2, y2]]) {
          const gl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          gl.setAttribute('x1', px);
          gl.setAttribute('y1', py);
          gl.setAttribute('x2', midX);
          gl.setAttribute('y2', midY);
          gl.setAttribute('stroke', 'rgba(245, 158, 11, 0.55)');
          gl.setAttribute('stroke-width', String(unit));
          gl.setAttribute('stroke-dasharray', `${unit * 2.5},${unit * 2}`);
          gl.setAttribute('pointer-events', 'none');
          overlayLayerEl.appendChild(gl);
        }
      }

      // Curve control point handle at (midX, midY)
      const cHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      cHandle.setAttribute('cx', midX);
      cHandle.setAttribute('cy', midY);
      cHandle.setAttribute('r', String(single.curved ? unit * 5.0 : unit * 3.6));
      cHandle.setAttribute('fill', single.curved ? '#f59e0b' : 'rgba(245, 158, 11, 0.45)');
      cHandle.setAttribute('stroke', '#0f172a');
      cHandle.setAttribute('stroke-width', String(unit * 1.3));
      cHandle.style.cursor = 'pointer';
      cHandle.dataset.handle = 'line-curve';
      overlayLayerEl.appendChild(cHandle);

      // Start (p1) & End (p2) handles
      for (const [hid, px, py] of [['line-p1', x1, y1], ['line-p2', x2, y2]]) {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', px);
        c.setAttribute('cy', py);
        c.setAttribute('r', String(unit * 4.8));
        c.setAttribute('fill', '#ffffff');
        c.setAttribute('stroke', '#0284c7');
        c.setAttribute('stroke-width', String(unit * 1.6));
        c.style.cursor = 'move';
        c.dataset.handle = hid;
        overlayLayerEl.appendChild(c);
      }

      appendCanvasBadge(
        (x1 + x2) / 2,
        Math.max(y1, y2, midY) + unit * 15,
        `${roundMm(len, 1)} mm (${angle}°)${single.curved ? ' 〰️ Kurve' : ''}`,
        unit
      );
    } else {
      const bbox = single && !single.rotation && single.type !== 'group'
        ? { x: single.x, y: single.y, width: single.width, height: single.height }
        : getShapesBBox(selected);

      // Selection bounding rect
      const selRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      selRect.setAttribute('x', bbox.x);
      selRect.setAttribute('y', bbox.y);
      selRect.setAttribute('width', Math.max(0.1, bbox.width));
      selRect.setAttribute('height', Math.max(0.1, bbox.height));
      selRect.setAttribute('fill', 'none');
      selRect.setAttribute('stroke', '#0ea5e9');
      selRect.setAttribute('stroke-width', String(unit * 1.3));
      selRect.setAttribute('stroke-dasharray', `${unit * 4},${unit * 2.5}`);
      selRect.setAttribute('pointer-events', 'none');
      overlayLayerEl.appendChild(selRect);

      // Dimension readout pill below selection
      const dimText = `${roundMm(bbox.width, 1)} × ${roundMm(bbox.height, 1)} mm`;
      appendCanvasBadge(bbox.x + bbox.width / 2, bbox.y + bbox.height + unit * 14, dimText, unit);

      // 8 Resize Handles
      if (single && !single.locked) {
        const hSize = unit * 7.5;
        const handles = [
          { id: 'nw', x: bbox.x, y: bbox.y, cursor: 'nwse-resize' },
          { id: 'n', x: bbox.x + bbox.width / 2, y: bbox.y, cursor: 'ns-resize' },
          { id: 'ne', x: bbox.x + bbox.width, y: bbox.y, cursor: 'nesw-resize' },
          { id: 'e', x: bbox.x + bbox.width, y: bbox.y + bbox.height / 2, cursor: 'ew-resize' },
          { id: 'se', x: bbox.x + bbox.width, y: bbox.y + bbox.height, cursor: 'nwse-resize' },
          { id: 's', x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height, cursor: 'ns-resize' },
          { id: 'sw', x: bbox.x, y: bbox.y + bbox.height, cursor: 'nesw-resize' },
          { id: 'w', x: bbox.x, y: bbox.y + bbox.height / 2, cursor: 'ew-resize' }
        ];

        for (const h of handles) {
          const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          r.setAttribute('x', h.x - hSize / 2);
          r.setAttribute('y', h.y - hSize / 2);
          r.setAttribute('width', hSize);
          r.setAttribute('height', hSize);
          r.setAttribute('rx', hSize * 0.2);
          r.setAttribute('fill', '#ffffff');
          r.setAttribute('stroke', '#0284c7');
          r.setAttribute('stroke-width', String(unit * 1.4));
          r.style.cursor = h.cursor;
          r.dataset.handle = h.id;
          overlayLayerEl.appendChild(r);
        }

        // Rotation handle above top-center
        const rotY = bbox.y - unit * 18;
        const rotCx = bbox.x + bbox.width / 2;
        const stem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        stem.setAttribute('x1', rotCx);
        stem.setAttribute('y1', bbox.y);
        stem.setAttribute('x2', rotCx);
        stem.setAttribute('y2', rotY);
        stem.setAttribute('stroke', '#0ea5e9');
        stem.setAttribute('stroke-width', String(unit * 1.3));
        overlayLayerEl.appendChild(stem);

        const rotCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        rotCircle.setAttribute('cx', rotCx);
        rotCircle.setAttribute('cy', rotY);
        rotCircle.setAttribute('r', String(unit * 4.5));
        rotCircle.setAttribute('fill', '#38bdf8');
        rotCircle.setAttribute('stroke', '#0f172a');
        rotCircle.setAttribute('stroke-width', String(unit * 1.4));
        rotCircle.style.cursor = 'grab';
        rotCircle.dataset.handle = 'rotate';
        overlayLayerEl.appendChild(rotCircle);

        // If this is a drawn path with editable nodes and curve/node handles are enabled:
        if (single.type === 'path' && Array.isArray(single.nodes) && single.nodes.length >= 2) {
          for (let idx = 0; idx < single.nodes.length; idx++) {
            const np = single.nodes[idx];
            const nc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            nc.setAttribute('cx', np.x);
            nc.setAttribute('cy', np.y);
            nc.setAttribute('r', String(unit * 4.2));
            nc.setAttribute('fill', '#f59e0b');
            nc.setAttribute('stroke', '#0f172a');
            nc.setAttribute('stroke-width', String(unit * 1.2));
            nc.style.cursor = 'pointer';
            nc.dataset.handle = `node-${idx}`;
            overlayLayerEl.appendChild(nc);
          }
        }
      }
    }
  }

  // 2. Rubber-band Marquee Selection Box
  if (state.interaction && state.interaction.type === 'marquee') {
    const { startX, startY, curX, curY } = state.interaction;
    const mx = Math.min(startX, curX);
    const my = Math.min(startY, curY);
    const mw = Math.abs(curX - startX);
    const mh = Math.abs(curY - startY);
    const mRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    mRect.setAttribute('x', mx);
    mRect.setAttribute('y', my);
    mRect.setAttribute('width', mw);
    mRect.setAttribute('height', mh);
    mRect.setAttribute('fill', 'rgba(14, 165, 233, 0.12)');
    mRect.setAttribute('stroke', '#38bdf8');
    mRect.setAttribute('stroke-width', String(unit * 1.2));
    overlayLayerEl.appendChild(mRect);
  }

  // 3. Pen Tool Preview (Supports both straight segments and smooth curve preview!)
  if (state.activeTool === 'pen' && state.penPoints.length > 0) {
    const rawPts = [...state.penPoints];
    if (state.penCursor) rawPts.push(state.penCursor);
    const previewPts = state.curveModeDefault && rawPts.length >= 3
      ? buildSmoothSplineLoop(rawPts, false, 0.3)
      : rawPts;
    const d = previewPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const pEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pEl.setAttribute('d', d);
    pEl.setAttribute('fill', 'none');
    pEl.setAttribute('stroke', '#f59e0b');
    pEl.setAttribute('stroke-width', String(unit * 1.6));
    overlayLayerEl.appendChild(pEl);

    for (let i = 0; i < state.penPoints.length; i++) {
      const pt = state.penPoints[i];
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', pt.x);
      c.setAttribute('cy', pt.y);
      c.setAttribute('r', String(i === 0 ? unit * 4.5 : unit * 3));
      c.setAttribute('fill', i === 0 ? '#10b981' : '#ffffff');
      c.setAttribute('stroke', '#0f172a');
      c.setAttribute('stroke-width', String(unit));
      overlayLayerEl.appendChild(c);
    }
  }

  // 4. Measure Tape Overlay
  if (state.measureLine) {
    const { x1, y1, x2, y2 } = state.measureLine;
    const len = dist({ x: x1, y: y1 }, { x: x2, y: y2 });
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const angle = roundMm(Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI), 1);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#f59e0b');
    line.setAttribute('stroke-width', String(unit * 1.8));
    line.setAttribute('stroke-dasharray', `${unit * 4},${unit * 2}`);
    overlayLayerEl.appendChild(line);

    for (const [px, py] of [[x1, y1], [x2, y2]]) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', px);
      c.setAttribute('cy', py);
      c.setAttribute('r', String(unit * 3.8));
      c.setAttribute('fill', '#f59e0b');
      overlayLayerEl.appendChild(c);
    }

    appendCanvasBadge(
      (x1 + x2) / 2,
      (y1 + y2) / 2 - unit * 10,
      `📏 ${roundMm(len, 2)} mm (ΔX: ${roundMm(dx, 1)}, ΔY: ${roundMm(dy, 1)}, ${angle}°)`,
      unit,
      '#b45309'
    );
  }
}

function appendCanvasBadge(cx, cy, text, unit, bgColor = '#0f172a') {
  const fontSize = unit * 10.5;
  const approxW = text.length * fontSize * 0.58 + unit * 10;
  const h = fontSize * 1.55;

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', cx - approxW / 2);
  rect.setAttribute('y', cy - h * 0.72);
  rect.setAttribute('width', approxW);
  rect.setAttribute('height', h);
  rect.setAttribute('rx', unit * 3);
  rect.setAttribute('fill', bgColor);
  rect.setAttribute('stroke', '#38bdf8');
  rect.setAttribute('stroke-width', String(unit * 0.8));
  rect.setAttribute('pointer-events', 'none');
  overlayLayerEl.appendChild(rect);

  const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  txt.setAttribute('x', cx);
  txt.setAttribute('y', cy + fontSize * 0.32);
  txt.setAttribute('text-anchor', 'middle');
  txt.setAttribute('fill', '#f8fafc');
  txt.setAttribute('font-size', String(fontSize));
  txt.setAttribute('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace');
  txt.setAttribute('font-weight', '700');
  txt.setAttribute('pointer-events', 'none');
  txt.textContent = text;
  overlayLayerEl.appendChild(txt);
}

// ============================================================================
// RIGHT PANEL INSPECTOR & LAYER LIST
// ============================================================================

function renderInspector() {
  const selected = getSelectedShapes();
  const badge = document.getElementById('selection-badge');
  const propX = document.getElementById('prop-x');
  const propY = document.getElementById('prop-y');
  const propW = document.getElementById('prop-w');
  const propH = document.getElementById('prop-h');
  const propRot = document.getElementById('prop-rot');

  const shapeSpecificWrap = document.getElementById('shape-specific-props');
  const rxWrap = document.getElementById('prop-rx-wrap');
  const sidesWrap = document.getElementById('prop-sides-wrap');
  const innerWrap = document.getElementById('prop-inner-wrap');
  const lineWrap = document.getElementById('prop-line-wrap');
  const curveWrap = document.getElementById('prop-curve-wrap');
  const curveToggle = document.getElementById('prop-curve-toggle');
  const resetCurveBtn = document.getElementById('btn-reset-curve');
  const textSection = document.getElementById('text-inspector-section');
  const groupSection = document.getElementById('group-inspector-section');
  const editingGroup = getEditingGroup();

  // Helper to populate the Group Inspector section when a group is selected or being edited
  const renderGroupInspectorFor = (grp) => {
    if (!grp || grp.type !== 'group' || !Array.isArray(grp.children)) {
      groupSection.style.display = 'none';
      return;
    }
    groupSection.style.display = 'block';
    document.getElementById('group-count-badge').textContent = `${grp.children.length} deler`;
    const gNameInput = document.getElementById('group-name-input');
    if (document.activeElement !== gNameInput) {
      gNameInput.value = grp.name || 'Gruppe';
    }
    const editBtn = document.getElementById('btn-edit-group-inside');
    if (editingGroup && editingGroup.id === grp.id) {
      editBtn.textContent = '✓ Ferdig med gruppe';
      editBtn.classList.add('btn-success');
    } else {
      editBtn.textContent = '✏️ Rediger inni gruppe';
      editBtn.classList.remove('btn-success');
    }

    const childListEl = document.getElementById('group-children-list');
    childListEl.innerHTML = '';
    const modeLabels = { cut: 'Kutt', score: 'Score', engrave: 'Graver', guide: 'Hjelp' };
    for (const c of grp.children) {
      const row = document.createElement('div');
      const isChildSel = editingGroup && editingGroup.id === grp.id && state.selectedIds.has(c.id);
      row.className = `layer-item ${isChildSel ? 'selected' : ''}`;
      row.style.padding = '4px 7px';
      row.style.fontSize = '11px';
      row.innerHTML = `
        <div class="layer-item-left">
          <span class="layer-dot ${c.laserMode || 'cut'}" title="${modeLabels[c.laserMode] || 'Kutt'}"></span>
          <span class="layer-name">${c.name || c.type}</span>
        </div>
        <div class="layer-item-actions">
          <span class="layer-dims">${roundMm(c.width, 0)}×${roundMm(c.height, 0)}</span>
          <button class="mini-icon-btn" data-child-action="edit" title="Velg og rediger denne delen">✏️</button>
          <button class="mini-icon-btn" data-child-action="extract" title="Ta denne delen ut av gruppen">📤</button>
        </div>
      `;
      row.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-child-action]');
        if (btn && btn.dataset.childAction === 'extract') {
          e.stopPropagation();
          removeChildFromGroup(grp.id, c.id);
          return;
        }
        enterGroupEditMode(grp.id, c.id);
      });
      childListEl.appendChild(row);
    }
  };

  if (selected.length === 0) {
    badge.textContent = editingGroup ? `Inni: ${editingGroup.name}` : 'Ingen valgt';
    propX.value = '';
    propY.value = '';
    propW.value = '';
    propH.value = '';
    propRot.value = '';
    propX.disabled = propY.disabled = propW.disabled = propH.disabled = propRot.disabled = true;

    const showCurveForTool = state.activeTool === 'line' || state.activeTool === 'pen';
    shapeSpecificWrap.style.display = showCurveForTool ? 'block' : 'none';
    rxWrap.style.display = 'none';
    sidesWrap.style.display = 'none';
    innerWrap.style.display = 'none';
    lineWrap.style.display = 'none';
    curveWrap.style.display = showCurveForTool ? 'block' : 'none';
    curveToggle.checked = Boolean(state.curveModeDefault);
    resetCurveBtn.style.display = 'none';

    textSection.style.display = state.activeTool === 'text' ? 'block' : 'none';
    renderGroupInspectorFor(editingGroup);
    return;
  }

  propX.disabled = propY.disabled = propW.disabled = propH.disabled = propRot.disabled = false;

  if (selected.length === 1) {
    const s = selected[0];
    badge.textContent = s.name || s.type;
    propX.value = roundMm(s.x, 2);
    propY.value = roundMm(s.y, 2);
    propW.value = roundMm(s.width, 2);
    propH.value = roundMm(s.height, 2);
    propRot.value = roundMm(s.rotation || 0, 1);

    // Highlight active laser mode button in bottom dock
    syncLaserModeDockUI(s.laserMode);

    // Shape-specific fields
    const isRect = s.type === 'rect';
    const isPolyOrStar = s.type === 'polygon' || s.type === 'star';
    const isStar = s.type === 'star';
    const isLine = s.type === 'line';
    const isEditablePath = s.type === 'path' && Array.isArray(s.nodes);
    const hasCurveToggle = isLine || isEditablePath || state.activeTool === 'line' || state.activeTool === 'pen';

    shapeSpecificWrap.style.display = (isRect || isPolyOrStar || isLine || hasCurveToggle) ? 'block' : 'none';
    rxWrap.style.display = isRect ? 'flex' : 'none';
    sidesWrap.style.display = isPolyOrStar ? 'flex' : 'none';
    innerWrap.style.display = isStar ? 'flex' : 'none';
    lineWrap.style.display = isLine ? 'grid' : 'none';
    curveWrap.style.display = hasCurveToggle ? 'block' : 'none';

    if (isRect) document.getElementById('prop-rx').value = roundMm(s.rx || 0, 1);
    if (isPolyOrStar) document.getElementById('prop-sides').value = s.sides || 5;
    if (isStar) document.getElementById('prop-inner-ratio').value = s.innerRatio || 42;
    if (isLine) {
      const len = Math.hypot((s.x2 || 0) - (s.x1 || 0), (s.y2 || 0) - (s.y1 || 0));
      const ang = Math.atan2((s.y2 || 0) - (s.y1 || 0), (s.x2 || 0) - (s.x1 || 0)) * (180 / Math.PI);
      document.getElementById('prop-line-len').value = roundMm(len, 2);
      document.getElementById('prop-line-angle').value = roundMm(ang, 1);
    }
    if (hasCurveToggle) {
      curveToggle.checked = Boolean(s.curved ?? state.curveModeDefault);
      resetCurveBtn.style.display = (isLine && s.curved) ? 'inline-block' : 'none';
    }

    // Text inspector
    if (s.type === 'text' && s.textMeta) {
      textSection.style.display = 'block';
      const textInput = document.getElementById('text-content-input');
      if (document.activeElement !== textInput) {
        textInput.value = s.textMeta.text ?? '';
      }
      document.getElementById('text-font-select').value = s.textMeta.fontKey || 'sans-bold';
      const sizeInput = document.getElementById('text-size-input');
      if (document.activeElement !== sizeInput) {
        sizeInput.value = s.textMeta.fontSizeMm || 18;
      }
      const spacingInput = document.getElementById('text-spacing-input');
      if (document.activeElement !== spacingInput) {
        spacingInput.value = s.textMeta.spacingMm ?? 1.2;
      }
      document.getElementById('text-curve-input').value = s.textMeta.curve || 0;
    } else {
      textSection.style.display = state.activeTool === 'text' ? 'block' : 'none';
    }

    renderGroupInspectorFor(s.type === 'group' ? s : editingGroup);
  } else {
    badge.textContent = `${selected.length} objekter valgt`;
    const bbox = getShapesBBox(selected);
    propX.value = roundMm(bbox.x, 2);
    propY.value = roundMm(bbox.y, 2);
    propW.value = roundMm(bbox.width, 2);
    propH.value = roundMm(bbox.height, 2);
    propRot.value = 0;
    shapeSpecificWrap.style.display = 'none';
    textSection.style.display = 'none';
    const selectedGroup = selected.find(item => item.type === 'group');
    renderGroupInspectorFor(editingGroup || selectedGroup || null);
  }
}

function renderLayerList() {
  const listEl = document.getElementById('layer-list');
  document.getElementById('layer-count').textContent = String(state.shapes.length);
  listEl.innerHTML = '';

  if (state.shapes.length === 0) {
    listEl.innerHTML = `<div style="color: var(--text-subtle); font-size: 11.5px; text-align: center; padding: 16px 6px;">
      Arbeidsflaten er tom.<br/>Velg et verktøy til venstre eller åpne en generator!
    </div>`;
    return;
  }

  const editingGroup = getEditingGroup();
  const modeLabels = { cut: 'Kutt', score: 'Score', engrave: 'Graver', guide: 'Hjelp' };

  // Render from top-most to bottom-most
  for (let i = state.shapes.length - 1; i >= 0; i--) {
    const s = state.shapes[i];
    const isEditingThisGroup = editingGroup && editingGroup.id === s.id;
    const isSelected = !editingGroup && state.selectedIds.has(s.id);
    const item = document.createElement('div');
    item.className = `layer-item ${isSelected ? 'selected' : ''} ${isEditingThisGroup ? 'editing-group' : ''}`;

    const isGroup = s.type === 'group' && Array.isArray(s.children);
    item.innerHTML = `
      <div class="layer-item-left">
        <span class="layer-dot ${s.laserMode || 'cut'}" title="${modeLabels[s.laserMode] || 'Kutt'}"></span>
        <span class="layer-name">${isGroup ? '📦 ' : ''}${s.name || s.type}</span>
      </div>
      <div class="layer-item-actions">
        <span class="layer-dims">${roundMm(s.width, 0)}×${roundMm(s.height, 0)}</span>
        ${isGroup ? `<button class="mini-icon-btn" data-action="edit-group" title="${isEditingThisGroup ? 'Avslutt grupperedigering' : 'Rediger enkelt-deler inni gruppen'}">${isEditingThisGroup ? '✓' : '✏️'}</button>` : ''}
        ${isGroup ? `<button class="mini-icon-btn" data-action="ungroup" title="Løs opp gruppe">📤</button>` : ''}
        <button class="mini-icon-btn" data-action="toggle-vis" title="Skjul/vis objekt">${s.hidden ? '🙈' : '👁'}</button>
        <button class="mini-icon-btn" data-action="delete" title="Slett objekt">✕</button>
      </div>
    `;

    item.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        e.stopPropagation();
        const act = actionBtn.dataset.action;
        if (act === 'edit-group') {
          if (isEditingThisGroup) exitGroupEditMode();
          else enterGroupEditMode(s.id);
        } else if (act === 'ungroup') {
          state.editingGroupId = null;
          state.selectedIds = new Set([s.id]);
          ungroupSelectedShapes();
        } else if (act === 'toggle-vis') {
          s.hidden = !s.hidden;
          renderAll();
        } else if (act === 'delete') {
          pushUndoSnapshot();
          if (state.editingGroupId === s.id) state.editingGroupId = null;
          state.shapes = state.shapes.filter(obj => obj.id !== s.id);
          state.selectedIds.delete(s.id);
          renderAll();
        }
        return;
      }
      if (editingGroup && editingGroup.id !== s.id) {
        state.editingGroupId = null;
      }
      if (e.shiftKey && !state.editingGroupId) {
        if (state.selectedIds.has(s.id)) state.selectedIds.delete(s.id);
        else state.selectedIds.add(s.id);
      } else {
        state.editingGroupId = null;
        state.selectedIds.clear();
        state.selectedIds.add(s.id);
      }
      renderAll();
    });

    item.addEventListener('dblclick', () => {
      if (isGroup) {
        enterGroupEditMode(s.id);
      }
    });

    listEl.appendChild(item);

    // If this is a group, also render its children indented below so user can inspect or click any child directly!
    if (isGroup) {
      for (let ci = s.children.length - 1; ci >= 0; ci--) {
        const c = s.children[ci];
        const childRow = document.createElement('div');
        const isChildSelected = isEditingThisGroup && state.selectedIds.has(c.id);
        childRow.className = `layer-item group-child ${isChildSelected ? 'selected' : ''}`;
        childRow.innerHTML = `
          <div class="layer-item-left">
            <span class="layer-dot ${c.laserMode || 'cut'}" title="${modeLabels[c.laserMode] || 'Kutt'}"></span>
            <span class="layer-name">↳ ${c.name || c.type}</span>
          </div>
          <div class="layer-item-actions">
            <span class="layer-dims">${roundMm(c.width, 0)}×${roundMm(c.height, 0)}</span>
            <button class="mini-icon-btn" data-caction="extract" title="Ta denne delen ut av gruppen">📤</button>
            <button class="mini-icon-btn" data-caction="delete" title="Slett denne delen fra gruppen">✕</button>
          </div>
        `;
        childRow.addEventListener('click', (e) => {
          const cBtn = e.target.closest('[data-caction]');
          if (cBtn) {
            e.stopPropagation();
            if (cBtn.dataset.caction === 'extract') {
              removeChildFromGroup(s.id, c.id);
            } else if (cBtn.dataset.caction === 'delete') {
              pushUndoSnapshot();
              s.children = s.children.filter(ch => ch.id !== c.id);
              state.selectedIds.delete(c.id);
              if (s.children.length === 0) {
                state.shapes = state.shapes.filter(obj => obj.id !== s.id);
                if (state.editingGroupId === s.id) state.editingGroupId = null;
              } else {
                syncGroupBBox(s);
              }
              renderAll();
            }
            return;
          }
          if (state.editingGroupId !== s.id) {
            enterGroupEditMode(s.id, c.id);
          } else {
            if (e.shiftKey) {
              if (state.selectedIds.has(c.id)) state.selectedIds.delete(c.id);
              else state.selectedIds.add(c.id);
            } else {
              state.selectedIds = new Set([c.id]);
            }
            renderAll();
          }
        });
        listEl.appendChild(childRow);
      }
    }
  }
}

function syncLaserModeDockUI(mode) {
  state.activeLaserMode = mode || 'cut';
  document.querySelectorAll('.laser-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === state.activeLaserMode);
  });
}

// ============================================================================
// CANVAS POINTER & TRACKPAD INTERACTION
// ============================================================================

function bindCanvasEvents() {
  // Wheel: MacBook two-finger pan vs pinch-to-zoom (ctrlKey/metaKey)
  viewportEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = Math.exp(-e.deltaY * 0.01);
      zoomByFactor(zoomFactor, e.clientX, e.clientY);
    } else {
      // Two-finger trackpad scroll pans the workspace smoothly
      const rect = viewportEl.getBoundingClientRect();
      state.viewX += (e.deltaX / rect.width) * state.viewW;
      state.viewY += (e.deltaY / rect.height) * state.viewH;
      applyViewBox();
      renderOverlay();
    }
  }, { passive: false });

  viewportEl.addEventListener('pointerdown', onCanvasPointerDown);
  window.addEventListener('pointermove', onCanvasPointerMove);
  window.addEventListener('pointerup', onCanvasPointerUp);

  viewportEl.addEventListener('dblclick', (e) => {
    if (state.activeTool === 'pen' && state.penPoints.length >= 2) {
      finishPenPath(false);
      return;
    }
    const targetShapeEl = e.target.closest('[data-id]');
    if (targetShapeEl) {
      const activeList = getActiveContainerList();
      const s = activeList.find(sh => sh.id === targetShapeEl.dataset.id);
      if (s && s.type === 'group') {
        enterGroupEditMode(s.id);
        return;
      }
      if (s && s.type === 'text') {
        const input = document.getElementById('text-content-input');
        input.focus();
        input.select();
        return;
      }
    } else if (state.editingGroupId) {
      exitGroupEditMode();
    }
  });
}

function scaleShapeFromOrig(target, orig, origBox, newBox) {
  const sx = newBox.width / Math.max(0.01, origBox.width);
  const sy = newBox.height / Math.max(0.01, origBox.height);

  target.x = roundMm(newBox.x + (orig.x - origBox.x) * sx, 2);
  target.y = roundMm(newBox.y + (orig.y - origBox.y) * sy, 2);
  target.width = roundMm(Math.max(0.2, orig.width * sx), 2);
  target.height = roundMm(Math.max(0.2, orig.height * sy), 2);

  if (target.type === 'line') {
    target.x1 = roundMm(newBox.x + (orig.x1 - origBox.x) * sx, 2);
    target.y1 = roundMm(newBox.y + (orig.y1 - origBox.y) * sy, 2);
    target.x2 = roundMm(newBox.x + (orig.x2 - origBox.x) * sx, 2);
    target.y2 = roundMm(newBox.y + (orig.y2 - origBox.y) * sy, 2);
    if (orig.cx !== undefined && orig.cy !== undefined) {
      target.cx = roundMm(newBox.x + (orig.cx - origBox.x) * sx, 2);
      target.cy = roundMm(newBox.y + (orig.cy - origBox.y) * sy, 2);
    }
    syncLineBBox(target);
  }
  if (Array.isArray(orig.nodes) && Array.isArray(target.nodes)) {
    for (let i = 0; i < orig.nodes.length; i++) {
      target.nodes[i].x = roundMm(newBox.x + (orig.nodes[i].x - origBox.x) * sx, 2);
      target.nodes[i].y = roundMm(newBox.y + (orig.nodes[i].y - origBox.y) * sy, 2);
    }
    rebuildPathShapeFromNodes(target);
  }
  if (target.type === 'group' && Array.isArray(orig.children) && Array.isArray(target.children)) {
    for (let i = 0; i < orig.children.length; i++) {
      scaleShapeFromOrig(target.children[i], orig.children[i], origBox, newBox);
    }
    syncGroupBBox(target);
  }
}

function rotateShapeFromOrig(target, orig, deltaDeg, center) {
  if (target.type === 'group' && Array.isArray(orig.children) && Array.isArray(target.children)) {
    for (let i = 0; i < orig.children.length; i++) {
      rotateShapeFromOrig(target.children[i], orig.children[i], deltaDeg, center);
    }
    target.rotation = roundMm((((orig.rotation || 0) + deltaDeg) % 360 + 360) % 360, 1);
    syncGroupBBox(target);
    return;
  }
  if (target.type === 'line') {
    const p1 = rotatePoint({ x: orig.x1, y: orig.y1 }, center, deltaDeg);
    const p2 = rotatePoint({ x: orig.x2, y: orig.y2 }, center, deltaDeg);
    target.x1 = roundMm(p1.x, 2);
    target.y1 = roundMm(p1.y, 2);
    target.x2 = roundMm(p2.x, 2);
    target.y2 = roundMm(p2.y, 2);
    if (orig.cx !== undefined && orig.cy !== undefined) {
      const pc = rotatePoint({ x: orig.cx, y: orig.cy }, center, deltaDeg);
      target.cx = roundMm(pc.x, 2);
      target.cy = roundMm(pc.y, 2);
    }
    syncLineBBox(target);
    return;
  }
  const origCenter = { x: orig.x + orig.width / 2, y: orig.y + orig.height / 2 };
  const newCenter = rotatePoint(origCenter, center, deltaDeg);
  target.x = roundMm(newCenter.x - orig.width / 2, 2);
  target.y = roundMm(newCenter.y - orig.height / 2, 2);
  target.rotation = roundMm((((orig.rotation || 0) + deltaDeg) % 360 + 360) % 360, 1);
  if (Array.isArray(orig.nodes) && Array.isArray(target.nodes)) {
    for (let i = 0; i < orig.nodes.length; i++) {
      const rp = rotatePoint(orig.nodes[i], center, deltaDeg);
      target.nodes[i].x = roundMm(rp.x, 2);
      target.nodes[i].y = roundMm(rp.y, 2);
    }
    rebuildPathShapeFromNodes(target);
  }
}

function onCanvasPointerDown(e) {
  if (e.button === 1 || state.spacePressed) {
    state.interaction = {
      type: 'pan',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startViewX: state.viewX,
      startViewY: state.viewY
    };
    viewportEl.classList.add('panning-active');
    return;
  }
  if (e.button !== 0) return;

  const worldPt = clientToWorldMm(e.clientX, e.clientY, true);
  const rawWorldPt = clientToWorldMm(e.clientX, e.clientY, false);

  // If currently in 2-click line drawing mode, this click completes the line!
  if (state.interaction && state.interaction.type === 'draw' && state.interaction.isTwoClick) {
    state.interaction = null;
    saveWorkspaceToLocal(state);
    renderAll();
    return;
  }

  // 1. Check if clicking a resize, rotation, line endpoint, line curve, or path node handle
  const handleEl = e.target.closest('[data-handle]');
  if (handleEl && state.selectedIds.size === 1) {
    const s = getSelectedShapes()[0];
    pushUndoSnapshot();
    const handleId = handleEl.dataset.handle;
    if (handleId === 'rotate') {
      state.interaction = {
        type: 'rotate',
        shape: s,
        origSnapshot: JSON.parse(JSON.stringify(s)),
        cx: s.x + s.width / 2,
        cy: s.y + s.height / 2
      };
    } else if (handleId === 'line-p1' || handleId === 'line-p2' || handleId === 'line-curve') {
      state.interaction = {
        type: 'line-handle',
        handle: handleId,
        shape: s
      };
    } else if (handleId.startsWith('node-')) {
      const nodeIdx = parseInt(handleId.split('-')[1], 10);
      state.interaction = {
        type: 'path-node',
        nodeIdx,
        shape: s
      };
    } else {
      state.interaction = {
        type: 'resize',
        handle: handleId,
        shape: s,
        origSnapshot: JSON.parse(JSON.stringify(s)),
        origX: s.x,
        origY: s.y,
        origW: s.width,
        origH: s.height
      };
    }
    return;
  }

  // 2. Active Tool Handling
  if (state.activeTool === 'select') {
    const shapeEl = e.target.closest('[data-id]');
    if (shapeEl) {
      const id = shapeEl.dataset.id;
      if (e.shiftKey) {
        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
      } else if (!state.selectedIds.has(id)) {
        state.selectedIds.clear();
        state.selectedIds.add(id);
      }
      pushUndoSnapshot();
      state.interaction = {
        type: 'move',
        startX: worldPt.x,
        startY: worldPt.y,
        lastDx: 0,
        lastDy: 0,
        shapes: getSelectedShapes()
      };
      renderAll();
    } else {
      if (!e.shiftKey) state.selectedIds.clear();
      state.interaction = {
        type: 'marquee',
        startX: rawWorldPt.x,
        startY: rawWorldPt.y,
        curX: rawWorldPt.x,
        curY: rawWorldPt.y
      };
      renderAll();
    }
    return;
  }

  // 3. Measure Tool
  if (state.activeTool === 'measure') {
    state.measureLine = { x1: worldPt.x, y1: worldPt.y, x2: worldPt.x, y2: worldPt.y };
    state.interaction = { type: 'measure' };
    renderOverlay();
    return;
  }

  // 4. Text Tool: Edit existing text if clicked, or insert new text at clicked location
  if (state.activeTool === 'text') {
    const activeList = getActiveContainerList();
    const hitShapeEl = e.target.closest('[data-id]');
    if (hitShapeEl) {
      const existing = activeList.find(sh => sh.id === hitShapeEl.dataset.id);
      if (existing && existing.type === 'text') {
        state.selectedIds.clear();
        state.selectedIds.add(existing.id);
        setActiveTool('select');
        renderAll();
        const input = document.getElementById('text-content-input');
        input.focus();
        input.select();
        return;
      }
    }

    pushUndoSnapshot();
    const textInputEl = document.getElementById('text-content-input');
    const textVal = textInputEl.value.trim() ? textInputEl.value : 'BJØRNSVEEN';
    textInputEl.value = textVal;
    const fontKey = document.getElementById('text-font-select').value || 'sans-bold';
    const fontSizeMm = evalMathExpr(document.getElementById('text-size-input').value, 18);
    const spacingMm = evalMathExpr(document.getElementById('text-spacing-input').value, 1.2);
    const curve = Number(document.getElementById('text-curve-input').value) || 0;

    const newText = createTextShape({
      x: worldPt.x,
      y: worldPt.y,
      text: textVal,
      fontKey,
      fontSizeMm,
      spacingMm,
      curve,
      laserMode: state.activeLaserMode
    });
    activeList.push(newText);
    state.selectedIds.clear();
    state.selectedIds.add(newText.id);
    setActiveTool('select');
    renderAll();
    const input = document.getElementById('text-content-input');
    input.focus();
    input.select();
    return;
  }

  // 5. Pen / Polygon Path Tool
  if (state.activeTool === 'pen') {
    if (state.penPoints.length >= 3 && dist(worldPt, state.penPoints[0]) < (state.viewW / 90)) {
      finishPenPath(true);
      return;
    }
    state.penPoints.push(worldPt);
    state.penCursor = worldPt;
    renderOverlay();
    return;
  }

  // 6. Shape Drawing Tools (rect, ellipse, polygon, star, heart, line)
  pushUndoSnapshot();
  const typeNames = {
    rect: 'Rektangel',
    ellipse: 'Sirkel / Ellipse',
    polygon: 'Mangekant',
    star: 'Stjerne',
    heart: 'Hjerte',
    line: 'Linje'
  };
  const newShape = {
    id: uid(state.activeTool),
    type: state.activeTool,
    name: typeNames[state.activeTool] || 'Figur',
    laserMode: state.activeLaserMode,
    x: worldPt.x,
    y: worldPt.y,
    width: 1,
    height: 1,
    rx: 0,
    sides: state.activeTool === 'polygon' ? 6 : 5,
    innerRatio: 42,
    rotation: 0
  };
  if (state.activeTool === 'line') {
    newShape.x1 = worldPt.x;
    newShape.y1 = worldPt.y;
    newShape.x2 = worldPt.x;
    newShape.y2 = worldPt.y;
    newShape.curved = Boolean(state.curveModeDefault);
  }
  getActiveContainerList().push(newShape);
  state.selectedIds.clear();
  state.selectedIds.add(newShape.id);
  state.interaction = {
    type: 'draw',
    shape: newShape,
    startX: worldPt.x,
    startY: worldPt.y,
    isTwoClick: false
  };
  renderAll();
}

function onCanvasPointerMove(e) {
  const worldPt = clientToWorldMm(e.clientX, e.clientY, true);
  const rawWorldPt = clientToWorldMm(e.clientX, e.clientY, false);

  document.getElementById('coords-display').textContent =
    `X: ${rawWorldPt.x.toFixed(1)}  Y: ${rawWorldPt.y.toFixed(1)} mm`;

  if (state.activeTool === 'pen' && state.penPoints.length > 0) {
    state.penCursor = worldPt;
    renderOverlay();
  }

  if (!state.interaction) return;
  const act = state.interaction;

  if (act.type === 'pan') {
    const rect = viewportEl.getBoundingClientRect();
    const dx = ((e.clientX - act.startClientX) / rect.width) * state.viewW;
    const dy = ((e.clientY - act.startClientY) / rect.height) * state.viewH;
    state.viewX = act.startViewX - dx;
    state.viewY = act.startViewY - dy;
    applyViewBox();
    renderOverlay();
    return;
  }

  if (act.type === 'move') {
    const dx = worldPt.x - act.startX;
    const dy = worldPt.y - act.startY;
    const stepDx = dx - act.lastDx;
    const stepDy = dy - act.lastDy;
    if (Math.abs(stepDx) > 1e-4 || Math.abs(stepDy) > 1e-4) {
      moveShapesBy(act.shapes, stepDx, stepDy);
      act.lastDx = dx;
      act.lastDy = dy;
      renderAll();
    }
    return;
  }

  if (act.type === 'line-handle') {
    const s = act.shape;
    if (act.handle === 'line-curve') {
      s.curved = true;
      s.cx = worldPt.x;
      s.cy = worldPt.y;
    } else if (act.handle === 'line-p1') {
      let nx = worldPt.x;
      let ny = worldPt.y;
      if (e.shiftKey) {
        const dx = nx - s.x2;
        const dy = ny - s.y2;
        const len = Math.hypot(dx, dy);
        const snapA = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
        nx = roundMm(s.x2 + Math.cos(snapA) * len, 2);
        ny = roundMm(s.y2 + Math.sin(snapA) * len, 2);
      }
      s.x1 = nx;
      s.y1 = ny;
    } else if (act.handle === 'line-p2') {
      let nx = worldPt.x;
      let ny = worldPt.y;
      if (e.shiftKey) {
        const dx = nx - s.x1;
        const dy = ny - s.y1;
        const len = Math.hypot(dx, dy);
        const snapA = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
        nx = roundMm(s.x1 + Math.cos(snapA) * len, 2);
        ny = roundMm(s.y1 + Math.sin(snapA) * len, 2);
      }
      s.x2 = nx;
      s.y2 = ny;
    }
    syncLineBBox(s);
    renderAll();
    return;
  }

  if (act.type === 'path-node') {
    const s = act.shape;
    if (Array.isArray(s.nodes) && s.nodes[act.nodeIdx]) {
      s.nodes[act.nodeIdx].x = worldPt.x;
      s.nodes[act.nodeIdx].y = worldPt.y;
      rebuildPathShapeFromNodes(s);
      renderAll();
    }
    return;
  }

  if (act.type === 'resize') {
    const s = act.shape;
    let x = act.origX;
    let y = act.origY;
    let w = act.origW;
    let h = act.origH;
    const hId = act.handle;

    if (hId.includes('e')) w = Math.max(0.5, worldPt.x - x);
    if (hId.includes('s')) h = Math.max(0.5, worldPt.y - y);
    if (hId.includes('w')) {
      const newRight = act.origX + act.origW;
      x = Math.min(newRight - 0.5, worldPt.x);
      w = newRight - x;
    }
    if (hId.includes('n')) {
      const newBottom = act.origY + act.origH;
      y = Math.min(newBottom - 0.5, worldPt.y);
      h = newBottom - y;
    }

    if (e.shiftKey || document.getElementById('prop-lock-aspect').checked) {
      const aspect = act.origW / Math.max(0.1, act.origH);
      if (hId === 'n' || hId === 's') w = h * aspect;
      else h = w / aspect;
    }

    if (act.origSnapshot) {
      scaleShapeFromOrig(
        s,
        act.origSnapshot,
        { x: act.origX, y: act.origY, width: act.origW, height: act.origH },
        { x, y, width: w, height: h }
      );
    } else {
      s.x = roundMm(x, 2);
      s.y = roundMm(y, 2);
      s.width = roundMm(w, 2);
      s.height = roundMm(h, 2);
    }
    renderAll();
    return;
  }

  if (act.type === 'rotate') {
    const angleRad = Math.atan2(rawWorldPt.y - act.cy, rawWorldPt.x - act.cx);
    let deg = angleRad * (180 / Math.PI) + 90;
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    const targetDeg = ((deg % 360) + 360) % 360;
    if (act.shape.type === 'group' && act.origSnapshot) {
      const deltaDeg = targetDeg - (act.origSnapshot.rotation || 0);
      rotateShapeFromOrig(act.shape, act.origSnapshot, deltaDeg, { x: act.cx, y: act.cy });
    } else {
      act.shape.rotation = roundMm(targetDeg, 1);
    }
    renderAll();
    return;
  }

  if (act.type === 'draw') {
    const s = act.shape;
    if (s.type === 'line') {
      let x2 = worldPt.x;
      let y2 = worldPt.y;
      if (e.shiftKey) {
        const dx = x2 - act.startX;
        const dy = y2 - act.startY;
        const len = Math.hypot(dx, dy);
        const snapAngle = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
        x2 = roundMm(act.startX + Math.cos(snapAngle) * len, 2);
        y2 = roundMm(act.startY + Math.sin(snapAngle) * len, 2);
      }
      s.x1 = act.startX;
      s.y1 = act.startY;
      s.x2 = x2;
      s.y2 = y2;
      if (s.curved) {
        const dx = x2 - act.startX;
        const dy = y2 - act.startY;
        s.cx = roundMm((act.startX + x2) / 2 - dy * 0.18, 2);
        s.cy = roundMm((act.startY + y2) / 2 + dx * 0.18, 2);
      }
      syncLineBBox(s);
    } else {
      let w = Math.abs(worldPt.x - act.startX);
      let h = Math.abs(worldPt.y - act.startY);
      if (e.shiftKey) {
        const m = Math.max(w, h);
        w = m;
        h = m;
      }
      s.x = roundMm(worldPt.x >= act.startX ? act.startX : act.startX - w, 2);
      s.y = roundMm(worldPt.y >= act.startY ? act.startY : act.startY - h, 2);
      s.width = roundMm(Math.max(1, w), 2);
      s.height = roundMm(Math.max(1, h), 2);
    }
    renderAll();
    return;
  }

  if (act.type === 'marquee') {
    act.curX = rawWorldPt.x;
    act.curY = rawWorldPt.y;
    renderOverlay();
    return;
  }

  if (act.type === 'measure' && state.measureLine) {
    state.measureLine.x2 = worldPt.x;
    state.measureLine.y2 = worldPt.y;
    renderOverlay();
  }
}

function onCanvasPointerUp() {
  if (!state.interaction) return;
  const act = state.interaction;

  // Support 2-click line drawing: if user clicked once without dragging, keep line attached to cursor until 2nd click!
  if (act.type === 'draw' && act.shape.type === 'line') {
    const lineLen = Math.hypot((act.shape.x2 || 0) - (act.shape.x1 || 0), (act.shape.y2 || 0) - (act.shape.y1 || 0));
    if (lineLen < 1.5 && !act.isTwoClick) {
      act.isTwoClick = true;
      return;
    }
    // Line finished! Stay in 'line' tool so user can draw more lines easily, or tweak handles right away
    state.interaction = null;
    saveWorkspaceToLocal(state);
    renderAll();
    return;
  }

  state.interaction = null;
  viewportEl.classList.remove('panning-active');

  if (act.type === 'draw') {
    // If the user just clicked without dragging on a standard shape, give a sensible default size (40×25 mm)
    if (act.shape.width <= 1.5 && act.shape.height <= 1.5) {
      act.shape.width = 40;
      act.shape.height = act.shape.type === 'rect' ? 25 : 40;
    }
    setActiveTool('select');
    saveWorkspaceToLocal(state);
    renderAll();
    return;
  }

  if (act.type === 'marquee') {
    const mx = Math.min(act.startX, act.curX);
    const my = Math.min(act.startY, act.curY);
    const mw = Math.abs(act.curX - act.startX);
    const mh = Math.abs(act.curY - act.startY);
    if (mw > 1 || mh > 1) {
      for (const s of getActiveContainerList()) {
        if (s.hidden) continue;
        const b = getShapesBBox([s]);
        if (b.x >= mx && b.y >= my && b.x + b.width <= mx + mw && b.y + b.height <= my + mh) {
          state.selectedIds.add(s.id);
        }
      }
    }
    renderAll();
    return;
  }

  saveWorkspaceToLocal(state);
  renderAll();
}

function finishPenPath(closed = true) {
  if (state.penPoints.length < 2) {
    state.penPoints = [];
    state.penCursor = null;
    renderOverlay();
    return;
  }
  pushUndoSnapshot();
  const isClosed = closed && state.penPoints.length >= 3;
  const nodes = state.penPoints.map(p => ({ x: roundMm(p.x, 2), y: roundMm(p.y, 2) }));
  const loop = state.curveModeDefault
    ? buildSmoothSplineLoop(nodes, isClosed, 0.2)
    : [...nodes];
  loop.closed = isClosed;

  const newShape = createPathShapeFromPolygons(
    [loop],
    state.activeLaserMode,
    isClosed ? 'Tegnet form' : (state.curveModeDefault ? 'Tegnet kurve' : 'Tegnet linje')
  );
  newShape.nodes = nodes;
  newShape.closedPath = isClosed;
  newShape.curved = Boolean(state.curveModeDefault);

  getActiveContainerList().push(newShape);
  state.selectedIds.clear();
  state.selectedIds.add(newShape.id);
  state.penPoints = [];
  state.penCursor = null;
  setActiveTool('select');
  saveWorkspaceToLocal(state);
  renderAll();
}

// ============================================================================
// TOOLBAR, HEADER & INSPECTOR EVENT BINDINGS
// ============================================================================

function setActiveTool(toolName) {
  // If an incomplete 2-click line was in progress, remove it cleanly
  if (state.interaction && state.interaction.type === 'draw' && state.interaction.isTwoClick) {
    const unfinishedId = state.interaction.shape?.id;
    state.shapes = state.shapes.filter(s => s.id !== unfinishedId);
    state.selectedIds.delete(unfinishedId);
    state.interaction = null;
  }

  state.activeTool = toolName;
  state.penPoints = [];
  state.penCursor = null;
  if (toolName !== 'measure') state.measureLine = null;

  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === toolName);
  });

  viewportEl.classList.toggle('crosshair', toolName !== 'select');

  const hints = {
    select: '',
    rect: 'Klikk og dra for å tegne rektangel (Hold Shift for kvadrat)',
    ellipse: 'Klikk og dra for å tegne sirkel/ellipse (Hold Shift for perfekt sirkel)',
    polygon: 'Klikk og dra for å tegne mangekant (Endre antall kanter til høyre, f.eks. 360/60)',
    star: 'Klikk og dra for å tegne stjerne (Endre antall tagger til høyre)',
    heart: 'Klikk og dra for å tegne hjerte',
    line: 'Klikk-og-dra ELLER klikk startpunkt og sluttpunkt for å tegne linje (Hold Shift for 15°/45°/90°, Esc for å avslutte)',
    pen: 'Klikk punkt for punkt på arbeidsflaten. Huk av «Lag vektorkurve» til høyre for myke kurver! (Enter/Dobbeltklikk fullfører)',
    text: 'Klikk hvor som helst på platen for å sette inn tekst',
    measure: 'Klikk og dra mellom to punkter for å måle nøyaktig avstand i millimeter'
  };

  if (hints[toolName]) {
    hintBannerEl.textContent = hints[toolName];
    hintBannerEl.classList.add('visible');
  } else {
    hintBannerEl.classList.remove('visible');
  }

  renderAll();
}

function bindToolbarEvents() {
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => setActiveTool(btn.dataset.tool));
  });

  document.querySelectorAll('.tool-btn[data-generator]').forEach(btn => {
    btn.addEventListener('click', () => openGeneratorModal(btn.dataset.generator));
  });

  // Bottom Laser Mode Dock
  document.querySelectorAll('.laser-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      syncLaserModeDockUI(mode);
      const selected = getSelectedShapes();
      if (selected.length > 0) {
        pushUndoSnapshot();
        const setModeRecursive = (list) => {
          for (const s of list) {
            s.laserMode = mode;
            if (s.type === 'group' && s.children) setModeRecursive(s.children);
          }
        };
        setModeRecursive(selected);
        renderAll();
      }
    });
  });

  // Zoom controls
  document.getElementById('btn-zoom-in').addEventListener('click', () => zoomByFactor(1.25));
  document.getElementById('btn-zoom-out').addEventListener('click', () => zoomByFactor(0.8));
  document.getElementById('btn-zoom-fit').addEventListener('click', () => {
    fitBedToViewport();
    renderOverlay();
  });
  document.getElementById('btn-zoom-selection').addEventListener('click', () => {
    const sel = getSelectedShapes();
    if (sel.length === 0) {
      fitBedToViewport();
      return;
    }
    const b = getShapesBBox(sel);
    const rect = viewportEl.getBoundingClientRect();
    const aspect = rect.width / rect.height;
    const pad = Math.max(b.width, b.height) * 0.35 + 15;
    state.viewW = Math.max(30, b.width + pad * 2);
    state.viewH = state.viewW / aspect;
    state.viewX = b.x + b.width / 2 - state.viewW / 2;
    state.viewY = b.y + b.height / 2 - state.viewH / 2;
    applyViewBox();
    renderOverlay();
  });
}

function bindHeaderEvents() {
  document.getElementById('machine-select').addEventListener('change', (e) => {
    state.machineKey = e.target.value;
    updateBedDimensionsUI();
    fitBedToViewport();
    renderAll();
  });

  for (const id of ['bed-width-input', 'bed-height-input']) {
    document.getElementById(id).addEventListener('change', () => {
      updateBedDimensionsUI();
      fitBedToViewport();
      renderAll();
    });
  }

  document.getElementById('snap-select').addEventListener('change', (e) => {
    state.snapMm = parseFloat(e.target.value) || 0;
    saveWorkspaceToLocal(state);
  });

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('btn-header-group').addEventListener('click', groupSelectedShapes);
  document.getElementById('btn-header-ungroup').addEventListener('click', ungroupSelectedShapes);
  document.getElementById('btn-exit-group-edit').addEventListener('click', exitGroupEditMode);
  document.getElementById('btn-take-out-of-group').addEventListener('click', () => {
    const g = getEditingGroup();
    const sel = getSelectedShapes();
    if (!g || sel.length === 0) return;
    for (const c of sel) {
      removeChildFromGroup(g.id, c.id);
    }
  });

  // Import SVG / JSON / Image
  const fileInput = document.getElementById('file-import-input');
  document.getElementById('btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();

    if (name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result));
          if (Array.isArray(data.shapes)) {
            pushUndoSnapshot();
            state.shapes = data.shapes;
            if (data.bedWidth) state.bedWidth = data.bedWidth;
            if (data.bedHeight) state.bedHeight = data.bedHeight;
            updateBedDimensionsUI();
            fitBedToViewport();
            renderAll();
            showToast(`📂 Åpnet prosjekt: ${file.name}`);
          }
        } catch (err) {
          showToast('⚠️ Kunne ikke lese prosjektfilen');
        }
      };
      reader.readAsText(file);
    } else if (name.endsWith('.svg')) {
      const reader = new FileReader();
      reader.onload = () => {
        const imported = importSvgStringToShapes(String(reader.result));
        if (imported.length > 0) {
          pushUndoSnapshot();
          state.shapes.push(...imported);
          state.selectedIds = new Set(imported.map(s => s.id));
          renderAll();
          showToast(`✅ Importerte ${imported.length} vektorformer fra ${file.name}`);
        } else {
          showToast('⚠️ Fant ingen vektorstier i SVG-filen');
        }
      };
      reader.readAsText(file);
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          state.traceImageElement = img;
          openGeneratorModal('trace');
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    }
    fileInput.value = '';
  });

  // Save Project JSON
  document.getElementById('btn-save-project').addEventListener('click', () => {
    const json = JSON.stringify({
      version: 1,
      app: 'Bjørnsveen LaserStudio',
      savedAt: new Date().toISOString(),
      machineKey: state.machineKey,
      bedWidth: state.bedWidth,
      bedHeight: state.bedHeight,
      shapes: state.shapes
    }, null, 2);
    downloadTextFile(json, 'bjornsveen-laserprosjekt.json', 'application/json');
    showToast('💾 Prosjektfil lagret på Macen');
  });

  // Laser Pre-flight & Export Modal
  document.getElementById('btn-preflight').addEventListener('click', () => openExportModal());
  document.getElementById('btn-export-svg').addEventListener('click', () => openExportModal());
}

function bindInspectorEvents() {
  // Global Enter & ArrowUp/ArrowDown handler for all .math-input fields (Inspector + Modals)
  document.addEventListener('keydown', (e) => {
    const el = e.target;
    if (!el || !el.classList || !el.classList.contains('math-input')) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? 10 : (e.altKey ? 0.1 : 1);
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const cur = evalMathExpr(el.value, 0);
      el.value = String(roundMm(cur + dir * step, 2));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // Format evaluated math formulas cleanly on blur/Enter in modal math inputs
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || !el.classList || !el.classList.contains('math-input')) return;
    if (el.closest('.modal-window')) {
      const val = evalMathExpr(el.value, NaN);
      if (Number.isFinite(val)) {
        el.value = String(roundMm(val, 2));
      }
    }
  });

  // Dimension & Position Inputs (Supports full math expressions like "120 + 12mm" or "360/6")
  const applyDimChange = (field) => {
    const sel = getSelectedShapes();
    if (sel.length === 0) return;
    pushUndoSnapshot();
    const lockAspect = document.getElementById('prop-lock-aspect').checked;

    if (sel.length === 1) {
      const s = sel[0];
      const oldW = Math.max(0.1, s.width);
      const oldH = Math.max(0.1, s.height);
      if (field === 'x') {
        const nx = roundMm(evalMathExpr(document.getElementById('prop-x').value, s.x), 2);
        moveShapesBy([s], nx - s.x, 0);
      }
      if (field === 'y') {
        const ny = roundMm(evalMathExpr(document.getElementById('prop-y').value, s.y), 2);
        moveShapesBy([s], 0, ny - s.y);
      }
      if (field === 'w') {
        const nw = Math.max(0.5, evalMathExpr(document.getElementById('prop-w').value, s.width));
        const nh = lockAspect ? roundMm(oldH * (nw / oldW), 2) : s.height;
        if (s.type === 'group') {
          const orig = JSON.parse(JSON.stringify(s));
          scaleShapeFromOrig(s, orig, { x: orig.x, y: orig.y, width: oldW, height: oldH }, { x: s.x, y: s.y, width: nw, height: nh });
        } else {
          s.width = roundMm(nw, 2);
          s.height = roundMm(nh, 2);
          if (s.type === 'line') {
            s.x2 = roundMm(s.x1 + (s.x2 >= s.x1 ? nw : -nw), 2);
            syncLineBBox(s);
          }
        }
      }
      if (field === 'h') {
        const nh = Math.max(0.5, evalMathExpr(document.getElementById('prop-h').value, s.height));
        const nw = lockAspect ? roundMm(oldW * (nh / oldH), 2) : s.width;
        if (s.type === 'group') {
          const orig = JSON.parse(JSON.stringify(s));
          scaleShapeFromOrig(s, orig, { x: orig.x, y: orig.y, width: oldW, height: oldH }, { x: s.x, y: s.y, width: nw, height: nh });
        } else {
          s.width = roundMm(nw, 2);
          s.height = roundMm(nh, 2);
          if (s.type === 'line') {
            s.y2 = roundMm(s.y1 + (s.y2 >= s.y1 ? nh : -nh), 2);
            syncLineBBox(s);
          }
        }
      }
      if (field === 'rot') {
        const deg = evalMathExpr(document.getElementById('prop-rot').value, s.rotation || 0);
        const targetDeg = roundMm(((deg % 360) + 360) % 360, 1);
        if (s.type === 'group') {
          const orig = JSON.parse(JSON.stringify(s));
          const deltaDeg = targetDeg - (orig.rotation || 0);
          rotateShapeFromOrig(s, orig, deltaDeg, { x: orig.x + orig.width / 2, y: orig.y + orig.height / 2 });
        } else {
          s.rotation = targetDeg;
        }
      }
    } else {
      const bbox = getShapesBBox(sel);
      if (field === 'x') {
        const nx = evalMathExpr(document.getElementById('prop-x').value, bbox.x);
        moveShapesBy(sel, nx - bbox.x, 0);
      }
      if (field === 'y') {
        const ny = evalMathExpr(document.getElementById('prop-y').value, bbox.y);
        moveShapesBy(sel, 0, ny - bbox.y);
      }
      if (field === 'w') {
        const nw = Math.max(1, evalMathExpr(document.getElementById('prop-w').value, bbox.width));
        const scale = nw / Math.max(0.1, bbox.width);
        for (const s of sel) {
          s.x = roundMm(bbox.x + (s.x - bbox.x) * scale, 2);
          s.width = roundMm(s.width * scale, 2);
          if (lockAspect) {
            s.y = roundMm(bbox.y + (s.y - bbox.y) * scale, 2);
            s.height = roundMm(s.height * scale, 2);
          }
        }
      }
      if (field === 'h') {
        const nh = Math.max(1, evalMathExpr(document.getElementById('prop-h').value, bbox.height));
        const scale = nh / Math.max(0.1, bbox.height);
        for (const s of sel) {
          s.y = roundMm(bbox.y + (s.y - bbox.y) * scale, 2);
          s.height = roundMm(s.height * scale, 2);
          if (lockAspect) {
            s.x = roundMm(bbox.x + (s.x - bbox.x) * scale, 2);
            s.width = roundMm(s.width * scale, 2);
          }
        }
      }
    }
    renderAll();
  };

  document.getElementById('prop-x').addEventListener('change', () => applyDimChange('x'));
  document.getElementById('prop-y').addEventListener('change', () => applyDimChange('y'));
  document.getElementById('prop-w').addEventListener('change', () => applyDimChange('w'));
  document.getElementById('prop-h').addEventListener('change', () => applyDimChange('h'));
  document.getElementById('prop-rot').addEventListener('change', () => applyDimChange('rot'));

  // Shape-specific properties (with math evaluation!)
  document.getElementById('prop-rx').addEventListener('change', (e) => {
    const sel = getSelectedShapes();
    if (sel.length === 1 && sel[0].type === 'rect') {
      pushUndoSnapshot();
      sel[0].rx = roundMm(Math.max(0, evalMathExpr(e.target.value, sel[0].rx || 0)), 2);
      renderAll();
    }
  });
  document.getElementById('prop-sides').addEventListener('change', (e) => {
    const sel = getSelectedShapes();
    if (sel.length === 1 && (sel[0].type === 'polygon' || sel[0].type === 'star')) {
      pushUndoSnapshot();
      sel[0].sides = clamp(Math.round(evalMathExpr(e.target.value, sel[0].sides || 5)), 3, 60);
      renderAll();
    }
  });
  document.getElementById('prop-inner-ratio').addEventListener('input', (e) => {
    const sel = getSelectedShapes();
    if (sel.length === 1 && sel[0].type === 'star') {
      sel[0].innerRatio = clamp(parseInt(e.target.value, 10) || 42, 10, 90);
      renderAll();
    }
  });

  // Line Length & Line Angle (with math expressions!)
  const applyLinePolarChange = () => {
    const sel = getSelectedShapes();
    if (sel.length !== 1 || sel[0].type !== 'line') return;
    pushUndoSnapshot();
    const s = sel[0];
    const curLen = Math.hypot((s.x2 || 0) - (s.x1 || 0), (s.y2 || 0) - (s.y1 || 0));
    const curAng = Math.atan2((s.y2 || 0) - (s.y1 || 0), (s.x2 || 0) - (s.x1 || 0)) * (180 / Math.PI);
    const newLen = Math.max(0.5, evalMathExpr(document.getElementById('prop-line-len').value, curLen));
    const newAngRad = evalMathExpr(document.getElementById('prop-line-angle').value, curAng) * (Math.PI / 180);
    s.x2 = roundMm(s.x1 + Math.cos(newAngRad) * newLen, 2);
    s.y2 = roundMm(s.y1 + Math.sin(newAngRad) * newLen, 2);
    syncLineBBox(s);
    renderAll();
  };
  document.getElementById('prop-line-len').addEventListener('change', applyLinePolarChange);
  document.getElementById('prop-line-angle').addEventListener('change', applyLinePolarChange);

  // Vector Curve Checkbox Toggle ("〰️ Lag vektorkurve / Vis kurvehåndtak")
  document.getElementById('prop-curve-toggle').addEventListener('change', (e) => {
    const checked = e.target.checked;
    state.curveModeDefault = checked;
    const sel = getSelectedShapes();
    if (sel.length === 1) {
      const s = sel[0];
      pushUndoSnapshot();
      if (s.type === 'line') {
        s.curved = checked;
        if (checked) {
          const mx = (s.x1 + s.x2) / 2;
          const my = (s.y1 + s.y2) / 2;
          const dx = s.x2 - s.x1;
          const dy = s.y2 - s.y1;
          // Give an initial visible curve arch if it was flat
          if (s.cx === undefined || Math.hypot(s.cx - mx, s.cy - my) < 0.5) {
            s.cx = roundMm(mx - dy * 0.2, 2);
            s.cy = roundMm(my + dx * 0.2, 2);
          }
        }
        syncLineBBox(s);
      } else if (s.type === 'path' && Array.isArray(s.nodes)) {
        s.curved = checked;
        rebuildPathShapeFromNodes(s);
      }
    }
    renderAll();
  });

  document.getElementById('btn-reset-curve').addEventListener('click', () => {
    const sel = getSelectedShapes();
    if (sel.length === 1 && sel[0].type === 'line') {
      pushUndoSnapshot();
      sel[0].curved = false;
      sel[0].cx = undefined;
      sel[0].cy = undefined;
      syncLineBBox(sel[0]);
      renderAll();
    }
  });

  // Live Text Inspector updates
  const onTextMetaUpdate = () => {
    const sel = getSelectedShapes();
    if (sel.length === 1 && sel[0].type === 'text') {
      const curMeta = sel[0].textMeta || {};
      updateTextShape(sel[0], {
        text: document.getElementById('text-content-input').value,
        fontKey: document.getElementById('text-font-select').value,
        fontSizeMm: clamp(evalMathExpr(document.getElementById('text-size-input').value, curMeta.fontSizeMm || 18), 2, 400),
        spacingMm: clamp(evalMathExpr(document.getElementById('text-spacing-input').value, curMeta.spacingMm ?? 1.2), -5, 50),
        curve: parseFloat(document.getElementById('text-curve-input').value) || 0
      });
      saveWorkspaceToLocal(state);
      renderAll();
    }
  };
  document.getElementById('text-content-input').addEventListener('input', onTextMetaUpdate);
  document.getElementById('text-font-select').addEventListener('input', onTextMetaUpdate);
  document.getElementById('text-curve-input').addEventListener('input', onTextMetaUpdate);
  document.getElementById('text-size-input').addEventListener('change', onTextMetaUpdate);
  document.getElementById('text-spacing-input').addEventListener('change', onTextMetaUpdate);

  // Group Inspector Controls (Rename group, Open/Edit inside group, Ungroup)
  document.getElementById('group-name-input').addEventListener('input', (e) => {
    const editingGroup = getEditingGroup();
    const sel = getSelectedShapes();
    const targetGroup = editingGroup || (sel.length === 1 && sel[0].type === 'group' ? sel[0] : null);
    if (targetGroup) {
      targetGroup.name = e.target.value || 'Gruppe';
      saveWorkspaceToLocal(state);
      renderLayerList();
    }
  });
  document.getElementById('btn-edit-group-inside').addEventListener('click', () => {
    const editingGroup = getEditingGroup();
    if (editingGroup) {
      exitGroupEditMode();
      return;
    }
    const sel = getSelectedShapes();
    const grp = sel.find(s => s.type === 'group');
    if (grp) {
      enterGroupEditMode(grp.id);
    }
  });
  document.getElementById('btn-ungroup-inspector').addEventListener('click', () => {
    const editingGroup = getEditingGroup();
    if (editingGroup) {
      state.editingGroupId = null;
      state.selectedIds = new Set([editingGroup.id]);
    }
    ungroupSelectedShapes();
  });

  // Magic Boolean Tools
  const runBoolean = (op) => {
    const sel = getSelectedShapes();
    if (sel.length < 2) {
      showToast('⚠️ Velg minst 2 overlappende objekter først (Hold Shift eller dra en boks rundt dem)');
      return;
    }
    pushUndoSnapshot();
    const res = performBooleanOnShapes(sel, op);
    if (!res) {
      showToast('⚠️ Kunne ikke kombinere formene – sjekk at de overlapper');
      return;
    }
    const selIds = new Set(sel.map(s => s.id));
    state.shapes = state.shapes.filter(s => !selIds.has(s.id));
    state.shapes.push(res);
    state.selectedIds = new Set([res.id]);
    renderAll();
    showToast('✨ Former kombinert!');
  };

  document.getElementById('btn-bool-union').addEventListener('click', () => runBoolean('union'));
  document.getElementById('btn-bool-subtract').addEventListener('click', () => runBoolean('subtract'));
  document.getElementById('btn-bool-intersect').addEventListener('click', () => runBoolean('intersect'));

  // Offset Outline Generator (Supports math expressions in offset distance!)
  document.getElementById('btn-create-offset').addEventListener('click', () => {
    const sel = getSelectedShapes();
    if (sel.length === 0) {
      showToast('⚠️ Velg minst ett objekt eller en tekst først!');
      return;
    }
    const distInput = document.getElementById('offset-dist-input');
    const distMm = roundMm(evalMathExpr(distInput.value, 3.0), 2);
    distInput.value = distMm;
    pushUndoSnapshot();
    const contour = createOffsetContour(sel, distMm, 'cut');
    if (contour) {
      // Insert contour right behind selected shapes so inner engraving remains visible on top
      state.shapes.unshift(contour);
      state.selectedIds = new Set([contour.id]);
      renderAll();
      showToast(`⭕ Laget rød kuttelinje (${distMm > 0 ? '+' : ''}${distMm} mm) rundt utvalget!`);
    }
  });

  // One-click Keyring Ear Welder
  document.getElementById('btn-add-keyring').addEventListener('click', () => {
    const sel = getSelectedShapes();
    if (sel.length !== 1) {
      showToast('⚠️ Velg én ytterform (f.eks. et skilt eller en brikke) for å sveise på nøkkelring-øye');
      return;
    }
    pushUndoSnapshot();
    const target = sel[0];
    const welded = weldKeyringTabToShape(target, 4.5, 3.0);
    if (welded) {
      const idx = state.shapes.findIndex(s => s.id === target.id);
      if (idx !== -1) state.shapes[idx] = welded;
      else state.shapes.push(welded);
      state.selectedIds = new Set([welded.id]);
      renderAll();
      showToast('🔑 Sveiset på nøkkelring-øye (Ø 4,5 mm hull)!');
    }
  });

  // Alignment buttons
  document.querySelectorAll('[data-align]').forEach(btn => {
    btn.addEventListener('click', () => alignSelectedShapes(btn.dataset.align));
  });

  document.getElementById('btn-center-bed').addEventListener('click', () => {
    const sel = getSelectedShapes();
    if (sel.length === 0) return;
    pushUndoSnapshot();
    const b = getShapesBBox(sel);
    const dx = state.bedWidth / 2 - (b.x + b.width / 2);
    const dy = state.bedHeight / 2 - (b.y + b.height / 2);
    moveShapesBy(sel, dx, dy);
    renderAll();
    showToast('🎯 Midtstilt på arbeidsflaten');
  });

  document.getElementById('btn-pack-origin').addEventListener('click', () => {
    const sel = getSelectedShapes().length > 0 ? getSelectedShapes() : state.shapes;
    if (sel.length === 0) return;
    pushUndoSnapshot();
    const b = getShapesBBox(sel);
    moveShapesBy(sel, 5 - b.x, 5 - b.y);
    renderAll();
    showToast('↖ Plassert 5 mm fra øvre venstre hjørne');
  });

  const flipShapeInBox = (s, refBox, axis) => {
    if (s.type === 'group' && Array.isArray(s.children)) {
      for (const c of s.children) {
        flipShapeInBox(c, refBox, axis);
      }
      syncGroupBBox(s);
      return;
    }
    if (s.type === 'line') {
      if (axis === 'h') {
        s.x1 = roundMm(refBox.x + refBox.width - (s.x1 - refBox.x), 2);
        s.x2 = roundMm(refBox.x + refBox.width - (s.x2 - refBox.x), 2);
        if (s.cx !== undefined) s.cx = roundMm(refBox.x + refBox.width - (s.cx - refBox.x), 2);
      } else {
        s.y1 = roundMm(refBox.y + refBox.height - (s.y1 - refBox.y), 2);
        s.y2 = roundMm(refBox.y + refBox.height - (s.y2 - refBox.y), 2);
        if (s.cy !== undefined) s.cy = roundMm(refBox.y + refBox.height - (s.cy - refBox.y), 2);
      }
      syncLineBBox(s);
      return;
    }
    if (axis === 'h') {
      s.x = roundMm(refBox.x + refBox.width - (s.x - refBox.x) - s.width, 2);
      s.flipX = !s.flipX;
      if (s.rotation) s.rotation = roundMm((360 - s.rotation) % 360, 1);
      if (Array.isArray(s.nodes)) {
        for (const n of s.nodes) n.x = roundMm(refBox.x + refBox.width - (n.x - refBox.x), 2);
        rebuildPathShapeFromNodes(s);
      }
    } else {
      s.y = roundMm(refBox.y + refBox.height - (s.y - refBox.y) - s.height, 2);
      s.flipY = !s.flipY;
      if (s.rotation) s.rotation = roundMm((360 - s.rotation) % 360, 1);
      if (Array.isArray(s.nodes)) {
        for (const n of s.nodes) n.y = roundMm(refBox.y + refBox.height - (n.y - refBox.y), 2);
        rebuildPathShapeFromNodes(s);
      }
    }
  };

  document.getElementById('btn-flip-h').addEventListener('click', () => {
    const sel = getSelectedShapes();
    if (sel.length === 0) return;
    pushUndoSnapshot();
    const refBox = getShapesBBox(sel);
    for (const s of sel) flipShapeInBox(s, refBox, 'h');
    renderAll();
    showToast('⇄ Speilvendt horisontalt');
  });

  document.getElementById('btn-flip-v').addEventListener('click', () => {
    const sel = getSelectedShapes();
    if (sel.length === 0) return;
    pushUndoSnapshot();
    const refBox = getShapesBBox(sel);
    for (const s of sel) flipShapeInBox(s, refBox, 'v');
    renderAll();
    showToast('⇅ Speilvendt vertikalt');
  });

  document.getElementById('btn-duplicate').addEventListener('click', duplicateSelectedShapes);
  document.getElementById('btn-group').addEventListener('click', groupSelectedShapes);
  document.getElementById('btn-ungroup').addEventListener('click', ungroupSelectedShapes);

  document.getElementById('btn-delete-selected').addEventListener('click', deleteSelectedShapes);
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    if (state.shapes.length === 0) return;
    pushUndoSnapshot();
    state.shapes = [];
    state.selectedIds.clear();
    renderAll();
    showToast('🗑 Arbeidsflaten er tømt');
  });

  // Clone Pattern Modal
  document.getElementById('btn-clone-grid').addEventListener('click', () => {
    if (getSelectedShapes().length === 0) {
      showToast('⚠️ Velg minst ett objekt som du vil duplisere i mønster');
      return;
    }
    document.getElementById('clone-modal').classList.add('open');
  });
}

function moveShapesBy(shapesList, dx, dy) {
  for (const s of shapesList) {
    s.x = roundMm(s.x + dx, 2);
    s.y = roundMm(s.y + dy, 2);
    if (s.type === 'line') {
      s.x1 = roundMm(s.x1 + dx, 2);
      s.y1 = roundMm(s.y1 + dy, 2);
      s.x2 = roundMm(s.x2 + dx, 2);
      s.y2 = roundMm(s.y2 + dy, 2);
      if (s.cx !== undefined && s.cy !== undefined) {
        s.cx = roundMm(s.cx + dx, 2);
        s.cy = roundMm(s.cy + dy, 2);
      }
    }
    if (Array.isArray(s.nodes)) {
      for (const n of s.nodes) {
        n.x = roundMm(n.x + dx, 2);
        n.y = roundMm(n.y + dy, 2);
      }
      rebuildPathShapeFromNodes(s);
    }
    if (s.type === 'group' && s.children) {
      moveShapesBy(s.children, dx, dy);
    }
  }
}

function alignSelectedShapes(mode) {
  const sel = getSelectedShapes();
  if (sel.length === 0) return;
  pushUndoSnapshot();
  const refBox = sel.length === 1
    ? { x: 0, y: 0, width: state.bedWidth, height: state.bedHeight }
    : getShapesBBox(sel);

  for (const s of sel) {
    if (mode === 'left') moveShapesBy([s], refBox.x - s.x, 0);
    if (mode === 'center-h') moveShapesBy([s], (refBox.x + refBox.width / 2) - (s.x + s.width / 2), 0);
    if (mode === 'right') moveShapesBy([s], (refBox.x + refBox.width) - (s.x + s.width), 0);
    if (mode === 'top') moveShapesBy([s], 0, refBox.y - s.y);
    if (mode === 'center-v') moveShapesBy([s], 0, (refBox.y + refBox.height / 2) - (s.y + s.height / 2));
    if (mode === 'bottom') moveShapesBy([s], 0, (refBox.y + refBox.height) - (s.y + s.height));
  }
  renderAll();
}

function duplicateSelectedShapes() {
  const sel = getSelectedShapes();
  if (sel.length === 0) return;
  pushUndoSnapshot();
  const activeList = getActiveContainerList();
  const newIds = new Set();
  const assignFreshIds = (obj) => {
    obj.id = uid(obj.type);
    if (obj.type === 'group' && Array.isArray(obj.children)) {
      obj.children.forEach(assignFreshIds);
    }
  };
  for (const s of sel) {
    const copy = JSON.parse(JSON.stringify(s));
    assignFreshIds(copy);
    copy.name = `${s.name || s.type} (kopi)`;
    moveShapesBy([copy], 8, 8);
    activeList.push(copy);
    newIds.add(copy.id);
  }
  state.selectedIds = newIds;
  renderAll();
  showToast('📋 Objekt duplisert');
}

function groupSelectedShapes() {
  if (state.editingGroupId) {
    exitGroupEditMode();
    return;
  }
  const sel = getSelectedShapes();
  if (sel.length < 2) {
    if (sel.length === 1 && sel[0].type === 'group') {
      enterGroupEditMode(sel[0].id);
      return;
    }
    showToast('⚠️ Velg minst 2 objekter for å gruppere dem (Hold Shift eller dra en ramme rundt dem)');
    return;
  }
  pushUndoSnapshot();

  // If exactly 1 existing group is selected along with other shapes, merge those shapes into that group!
  const existingGroups = sel.filter(s => s.type === 'group' && Array.isArray(s.children));
  const nonGroups = sel.filter(s => s.type !== 'group');
  if (existingGroups.length === 1 && nonGroups.length >= 1) {
    const targetGroup = existingGroups[0];
    const nonGroupIds = new Set(nonGroups.map(s => s.id));
    state.shapes = state.shapes.filter(s => !nonGroupIds.has(s.id));
    targetGroup.children.push(...nonGroups);
    if (/^Gruppe \(\d+ deler\)$/.test(targetGroup.name || '')) {
      targetGroup.name = `Gruppe (${targetGroup.children.length} deler)`;
    }
    syncGroupBBox(targetGroup);
    state.selectedIds = new Set([targetGroup.id]);
    renderAll();
    showToast(`📦 La til ${nonGroups.length} del(er) i "${targetGroup.name}"!`);
    return;
  }

  // Flatten any selected groups so we get a clean, flat group of parts
  const flatChildren = [];
  for (const s of sel) {
    if (s.type === 'group' && Array.isArray(s.children)) {
      flatChildren.push(...s.children);
    } else {
      flatChildren.push(s);
    }
  }

  const bbox = getShapesBBox(flatChildren);
  const selIds = new Set(sel.map(s => s.id));
  state.shapes = state.shapes.filter(s => !selIds.has(s.id));
  const group = {
    id: uid('group'),
    type: 'group',
    name: `Gruppe (${flatChildren.length} deler)`,
    laserMode: flatChildren[0]?.laserMode || 'cut',
    x: roundMm(bbox.x, 2),
    y: roundMm(bbox.y, 2),
    width: roundMm(bbox.width, 2),
    height: roundMm(bbox.height, 2),
    rotation: 0,
    children: flatChildren
  };
  state.shapes.push(group);
  state.selectedIds = new Set([group.id]);
  renderAll();
  showToast(`📦 Gruppert ${flatChildren.length} deler! (Dobbeltklikk på gruppen for å endre enkeltdeler)`);
}

function ungroupSelectedShapes() {
  const editingGroup = getEditingGroup();
  if (editingGroup) {
    state.editingGroupId = null;
    state.selectedIds = new Set([editingGroup.id]);
  }
  const sel = getSelectedShapes();
  const groups = sel.filter(s => s.type === 'group' && Array.isArray(s.children));
  if (groups.length === 0) {
    showToast('⚠️ Velg en gruppe først for å løse den opp');
    return;
  }
  pushUndoSnapshot();
  const newIds = new Set();
  for (const g of groups) {
    state.shapes = state.shapes.filter(s => s.id !== g.id);
    for (const c of g.children) {
      state.shapes.push(c);
      newIds.add(c.id);
    }
  }
  state.selectedIds = newIds;
  renderAll();
  showToast('📤 Gruppe løst opp i enkeltobjekter');
}

function deleteSelectedShapes() {
  if (state.selectedIds.size === 0) return;
  pushUndoSnapshot();
  const editingGroup = getEditingGroup();
  if (editingGroup) {
    editingGroup.children = editingGroup.children.filter(c => !state.selectedIds.has(c.id));
    state.selectedIds.clear();
    if (editingGroup.children.length === 0) {
      state.shapes = state.shapes.filter(s => s.id !== editingGroup.id);
      state.editingGroupId = null;
    } else {
      syncGroupBBox(editingGroup);
    }
    renderAll();
    return;
  }
  state.shapes = state.shapes.filter(s => !state.selectedIds.has(s.id));
  state.selectedIds.clear();
  renderAll();
}

// ============================================================================
// KEYBOARD SHORTCUTS (MacBook Friendly: Cmd/Ctrl + Z, D, G, A, Backspace)
// ============================================================================

function bindKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';

    if (e.code === 'Space' && !isInput) {
      state.spacePressed = true;
      viewportEl.classList.add('panning');
    }

    if (isInput) return;

    const cmd = e.metaKey || e.ctrlKey;
    if (cmd && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (cmd && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateSelectedShapes();
      return;
    }
    if (cmd && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      state.selectedIds = new Set(state.shapes.map(s => s.id));
      renderAll();
      return;
    }
    if (cmd && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      if (e.shiftKey) ungroupSelectedShapes();
      else groupSelectedShapes();
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      deleteSelectedShapes();
      return;
    }

    if (e.key === 'Enter' && state.activeTool === 'pen') {
      finishPenPath(false);
      return;
    }
    if (e.key === 'Escape') {
      if (state.activeTool === 'pen') {
        state.penPoints = [];
        state.penCursor = null;
      }
      if (state.interaction && state.interaction.type === 'draw' && state.interaction.shape) {
        const activeList = getActiveContainerList();
        const idx = activeList.findIndex(s => s.id === state.interaction.shape.id);
        if (idx !== -1) activeList.splice(idx, 1);
        state.selectedIds.clear();
        state.interaction = null;
      }
      if (state.editingGroupId && state.activeTool === 'select') {
        exitGroupEditMode();
        return;
      }
      setActiveTool('select');
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
      return;
    }

    // Arrow key nudging (1mm or snapMm; Shift = 10mm)
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && state.selectedIds.size > 0) {
      e.preventDefault();
      pushUndoSnapshot();
      const step = e.shiftKey ? 10 : (state.snapMm || 1);
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      moveShapesBy(getSelectedShapes(), dx, dy);
      renderAll();
      return;
    }

    // Tool hotkeys
    const keyMap = {
      v: 'select',
      r: 'rect',
      c: 'ellipse',
      p: 'polygon',
      s: 'star',
      h: 'heart',
      l: 'line',
      b: 'pen',
      t: 'text',
      m: 'measure'
    };
    const k = e.key.toLowerCase();
    if (!cmd && keyMap[k]) {
      setActiveTool(keyMap[k]);
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      state.spacePressed = false;
      viewportEl.classList.remove('panning');
    }
  });
}

// ============================================================================
// MAKERSPACE GENERATOR MODAL, CLONE MODAL & PRE-FLIGHT EXPORT MODAL
// ============================================================================

function bindModalEvents() {
  const genModal = document.getElementById('generator-modal');
  document.getElementById('btn-close-modal').addEventListener('click', () => genModal.classList.remove('open'));
  document.getElementById('btn-modal-cancel').addEventListener('click', () => genModal.classList.remove('open'));

  document.querySelectorAll('.modal-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => openGeneratorModal(btn.dataset.tab));
  });

  document.getElementById('btn-modal-insert').addEventListener('click', () => {
    if (!state.modalPreviewShapes || state.modalPreviewShapes.length === 0) return;
    pushUndoSnapshot();
    state.shapes.push(...state.modalPreviewShapes);
    state.selectedIds = new Set(state.modalPreviewShapes.map(s => s.id));
    genModal.classList.remove('open');
    setActiveTool('select');
    renderAll();
    showToast(`✨ Satte inn ${state.modalPreviewShapes.length} del(er) på arbeidsflaten!`);
  });

  // Clone Modal
  const cloneModal = document.getElementById('clone-modal');
  document.getElementById('btn-close-clone').addEventListener('click', () => cloneModal.classList.remove('open'));
  document.getElementById('btn-cancel-clone').addEventListener('click', () => cloneModal.classList.remove('open'));
  document.getElementById('clone-type').addEventListener('change', (e) => {
    const isGrid = e.target.value === 'grid';
    document.getElementById('clone-grid-fields').style.display = isGrid ? 'grid' : 'none';
    document.getElementById('clone-radial-fields').style.display = isGrid ? 'none' : 'grid';
  });

  document.getElementById('btn-apply-clone').addEventListener('click', () => {
    const sel = getSelectedShapes();
    if (sel.length === 0) return;
    pushUndoSnapshot();
    const type = document.getElementById('clone-type').value;
    const bbox = getShapesBBox(sel);

    if (type === 'grid') {
      const cols = clamp(Math.round(evalMathExpr(document.getElementById('clone-cols').value, 2)), 1, 25);
      const rows = clamp(Math.round(evalMathExpr(document.getElementById('clone-rows').value, 2)), 1, 25);
      const gapX = evalMathExpr(document.getElementById('clone-gap-x').value, 3);
      const gapY = evalMathExpr(document.getElementById('clone-gap-y').value, 3);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (r === 0 && c === 0) continue;
          const dx = c * (bbox.width + gapX);
          const dy = r * (bbox.height + gapY);
          for (const s of sel) {
            const copy = JSON.parse(JSON.stringify(s));
            copy.id = uid(s.type);
            moveShapesBy([copy], dx, dy);
            state.shapes.push(copy);
          }
        }
      }
      showToast(`💠 Dupliserte i ${cols}×${rows} rutenett!`);
    } else {
      const count = clamp(Math.round(evalMathExpr(document.getElementById('clone-radial-count').value, 6)), 3, 36);
      const radius = evalMathExpr(document.getElementById('clone-radial-radius').value, 25);
      const cx = bbox.x + bbox.width / 2;
      const cy = bbox.y + bbox.height / 2 + radius;

      for (let i = 1; i < count; i++) {
        const angleDeg = (i * 360) / count;
        const rad = angleDeg * (Math.PI / 180);
        for (const s of sel) {
          const copy = JSON.parse(JSON.stringify(s));
          copy.id = uid(s.type);
          const scx = s.x + s.width / 2;
          const scy = s.y + s.height / 2;
          const dx = scx - cx;
          const dy = scy - cy;
          const ncx = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
          const ncy = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
          copy.x = roundMm(ncx - s.width / 2, 2);
          copy.y = roundMm(ncy - s.height / 2, 2);
          copy.rotation = roundMm(((s.rotation || 0) + angleDeg) % 360, 1);
          state.shapes.push(copy);
        }
      }
      showToast(`💠 Dupliserte ${count} ganger i sirkel!`);
    }

    cloneModal.classList.remove('open');
    renderAll();
  });

  // Export Modal
  const expModal = document.getElementById('export-modal');
  document.getElementById('btn-close-export').addEventListener('click', () => expModal.classList.remove('open'));
  document.getElementById('btn-cancel-export').addEventListener('click', () => expModal.classList.remove('open'));
}

function openGeneratorModal(tabName) {
  state.activeGeneratorTab = tabName;
  document.querySelectorAll('.modal-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  const bodyEl = document.getElementById('modal-body-content');
  const insertBtn = document.getElementById('btn-modal-insert');
  bodyEl.className = tabName === 'icons' ? 'modal-body single-col' : 'modal-body';
  insertBtn.style.display = tabName === 'icons' ? 'none' : 'inline-flex';

  if (tabName === 'box') renderBoxGeneratorUI(bodyEl);
  else if (tabName === 'sign') renderSignGeneratorUI(bodyEl);
  else if (tabName === 'puzzle') renderPuzzleGeneratorUI(bodyEl);
  else if (tabName === 'gear') renderGearGeneratorUI(bodyEl);
  else if (tabName === 'mandala') renderMandalaGeneratorUI(bodyEl);
  else if (tabName === 'icons') renderIconsLibraryUI(bodyEl);
  else if (tabName === 'trace') renderImageTraceUI(bodyEl);

  document.getElementById('generator-modal').classList.add('open');
}

// ---- 1. Finger-joint Box Modal UI ----
function renderBoxGeneratorUI(container) {
  container.innerHTML = `
    <div class="generator-controls">
      <div class="info-box">
        📦 <strong>Finger-joint Boks-generator:</strong> Lager alle vegger og bunn/lokk med eksakte tapper som passer sammen i laserkutteren.
      </div>
      <div class="prop-grid">
        <div class="prop-field full-width">
          <label>Bokstype</label>
          <select id="gen-box-type" class="select-control">
            <option value="open">Åpen boks uten lokk (5 sider)</option>
            <option value="closed">Lukket boks med lokk (6 sider)</option>
            <option value="dividers">Åpen boks med 4 rom / skillevegger (7 deler)</option>
          </select>
        </div>
        <div class="prop-field">
          <label>Lengde (L)</label>
          <div class="input-with-unit"><input type="text" inputmode="decimal" id="gen-box-l" class="input-control math-input" value="110" /><span class="unit">mm</span></div>
        </div>
        <div class="prop-field">
          <label>Bredde (B)</label>
          <div class="input-with-unit"><input type="text" inputmode="decimal" id="gen-box-w" class="input-control math-input" value="80" /><span class="unit">mm</span></div>
        </div>
        <div class="prop-field">
          <label>Høyde (H)</label>
          <div class="input-with-unit"><input type="text" inputmode="decimal" id="gen-box-h" class="input-control math-input" value="50" /><span class="unit">mm</span></div>
        </div>
        <div class="prop-field">
          <label>Mål gjelder</label>
          <select id="gen-box-dimmode" class="select-control">
            <option value="outer">Ytre mål</option>
            <option value="inner">Indre mål</option>
          </select>
        </div>
        <div class="prop-field">
          <label>Materialtykkelse (t)</label>
          <div class="input-with-unit"><input type="text" inputmode="decimal" id="gen-box-t" class="input-control math-input" value="3.0" /><span class="unit">mm</span></div>
          <div class="preset-pills">
            <span class="preset-pill" data-t="3.0">3,0 mm</span>
            <span class="preset-pill" data-t="3.8">3,8 mm</span>
            <span class="preset-pill" data-t="4.0">4,0 mm</span>
            <span class="preset-pill" data-t="6.0">6,0 mm</span>
          </div>
        </div>
        <div class="prop-field">
          <label>Tapp-bredde</label>
          <div class="input-with-unit"><input type="text" inputmode="decimal" id="gen-box-fw" class="input-control math-input" value="14" /><span class="unit">mm</span></div>
        </div>
        <div class="prop-field">
          <label title="Kompenserer for bredden av laserstrålen så tappene sitter stramt">Kerf (Snittbredde)</label>
          <div class="input-with-unit"><input type="text" inputmode="decimal" id="gen-box-kerf" class="input-control math-input" value="0.08" /><span class="unit">mm</span></div>
        </div>
        <div class="prop-field" style="justify-content: flex-end;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 0;">
            <input type="checkbox" id="gen-box-labels" checked />
            <span>Merk deler (Hjelpelinje)</span>
          </label>
        </div>
      </div>
    </div>
    <div class="generator-preview-box">
      <div id="gen-preview-svg" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"></div>
      <div id="gen-preview-caption" class="preview-caption"></div>
    </div>
  `;

  const update = () => {
    const shapes = generateFingerJointBox({
      boxType: document.getElementById('gen-box-type').value,
      dimMode: document.getElementById('gen-box-dimmode').value,
      lengthMm: evalMathExpr(document.getElementById('gen-box-l').value, 110),
      widthMm: evalMathExpr(document.getElementById('gen-box-w').value, 80),
      heightMm: evalMathExpr(document.getElementById('gen-box-h').value, 50),
      thicknessMm: evalMathExpr(document.getElementById('gen-box-t').value, 3.0),
      fingerWidthMm: evalMathExpr(document.getElementById('gen-box-fw').value, 14),
      kerfMm: evalMathExpr(document.getElementById('gen-box-kerf').value, 0),
      addLabels: document.getElementById('gen-box-labels').checked
    });
    state.modalPreviewShapes = shapes;
    const { svgHtml, bbox } = renderShapesPreviewSvg(shapes);
    document.getElementById('gen-preview-svg').innerHTML = svgHtml;
    document.getElementById('gen-preview-caption').innerHTML =
      `<span>Totalt plassbehov på plate: <strong>${roundMm(bbox.width, 0)} × ${roundMm(bbox.height, 0)} mm</strong></span><span>1:1 mm</span>`;
  };

  container.querySelectorAll('input, select').forEach(el => el.addEventListener('input', update));
  container.querySelectorAll('.preset-pill[data-t]').forEach(pill => {
    pill.addEventListener('click', () => {
      document.getElementById('gen-box-t').value = pill.dataset.t;
      update();
    });
  });
  update();
}

// ---- 2. Door Sign & Keyring Modal UI ----
function renderSignGeneratorUI(container) {
  const iconOptions = `<option value="none">Ingen ikon</option>` +
    LASER_ICONS.map(ic => `<option value="${ic.id}">${ic.name} (${ic.category})</option>`).join('');

  container.innerHTML = `
    <div class="generator-controls">
      <div class="preset-pills" style="margin-bottom: 4px;">
        <span class="preset-pill" data-preset="doorsign">🪧 Dørskilt (150×60 mm)</span>
        <span class="preset-pill" data-preset="keyring">🔑 Nøkkelring (65×28 mm)</span>
        <span class="preset-pill" data-preset="nametag">🏷️ Navneskilt (85×35 mm)</span>
      </div>
      <div class="prop-grid">
        <div class="prop-field">
          <label>Skiltfasong</label>
          <select id="gen-sign-style" class="select-control">
            <option value="rounded">Avrundet rektangel</option>
            <option value="plaque">Klassisk plakett (buede ører)</option>
            <option value="tag">Merkelapp (Tag)</option>
            <option value="oval">Oval / Medaljong</option>
            <option value="arrow">Pil-skilt (Veiskilt)</option>
          </select>
        </div>
        <div class="prop-field">
          <label>Oppheng / Hull</label>
          <select id="gen-sign-holes" class="select-control">
            <option value="holes-2">2 skruehull (Venstre & Høyre)</option>
            <option value="keyring-ear">Nøkkelring-øye (Utstikkende)</option>
            <option value="hole-left">1 hull til venstre</option>
            <option value="holes-4">4 hjørnehull</option>
            <option value="none">Ingen hull</option>
          </select>
        </div>
        <div class="prop-field">
          <label>Bredde</label>
          <div class="input-with-unit"><input type="text" inputmode="decimal" id="gen-sign-w" class="input-control math-input" value="145" /><span class="unit">mm</span></div>
        </div>
        <div class="prop-field">
          <label>Høyde</label>
          <div class="input-with-unit"><input type="text" inputmode="decimal" id="gen-sign-h" class="input-control math-input" value="58" /><span class="unit">mm</span></div>
        </div>
        <div class="prop-field">
          <label>Hjørneradius</label>
          <div class="input-with-unit"><input type="text" inputmode="decimal" id="gen-sign-rx" class="input-control math-input" value="8" /><span class="unit">mm</span></div>
        </div>
        <div class="prop-field">
          <label>Hull-diameter (Ø)</label>
          <div class="input-with-unit"><input type="text" inputmode="decimal" id="gen-sign-holed" class="input-control math-input" value="4.5" /><span class="unit">mm</span></div>
        </div>
        <div class="prop-field full-width">
          <label>Hovedtekst</label>
          <input type="text" id="gen-sign-head" class="input-control" value="GUTTEROMMET" />
        </div>
        <div class="prop-field full-width">
          <label>Undertittel (valgfritt)</label>
          <input type="text" id="gen-sign-sub" class="input-control" value="BANK PÅ FØR DU GÅR INN" />
        </div>
        <div class="prop-field">
          <label>Skrifttype</label>
          <select id="gen-sign-font" class="select-control">
            <option value="sans-bold">Moderne Kraftig (Gravering)</option>
            <option value="stencil">✂️ Laser Sjablong (Gjennomkutt!)</option>
            <option value="singleline">⚡ Laser Enkelstreg (Rask Score!)</option>
            <option value="serif">Klassisk Serif</option>
            <option value="rounded">Avrundet</option>
          </select>
        </div>
        <div class="prop-field">
          <label>Symbol / Ikon</label>
          <select id="gen-sign-icon" class="select-control">${iconOptions}</select>
        </div>
        <div class="prop-field full-width">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="gen-sign-border" checked />
            <span>Inngravert pynteramme (Blå Score-linje)</span>
          </label>
        </div>
      </div>
    </div>
    <div class="generator-preview-box">
      <div id="gen-preview-svg" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"></div>
      <div id="gen-preview-caption" class="preview-caption"></div>
    </div>
  `;

  const update = () => {
    const shapes = generateSignOrKeyring({
      signStyle: document.getElementById('gen-sign-style').value,
      holeMode: document.getElementById('gen-sign-holes').value,
      widthMm: evalMathExpr(document.getElementById('gen-sign-w').value, 145),
      heightMm: evalMathExpr(document.getElementById('gen-sign-h').value, 58),
      cornerRadiusMm: evalMathExpr(document.getElementById('gen-sign-rx').value, 8),
      holeDiamMm: evalMathExpr(document.getElementById('gen-sign-holed').value, 4.5),
      headline: document.getElementById('gen-sign-head').value,
      subtitle: document.getElementById('gen-sign-sub').value,
      fontKey: document.getElementById('gen-sign-font').value,
      iconId: document.getElementById('gen-sign-icon').value,
      innerBorder: document.getElementById('gen-sign-border').checked
    });
    state.modalPreviewShapes = shapes;
    const { svgHtml, bbox } = renderShapesPreviewSvg(shapes);
    document.getElementById('gen-preview-svg').innerHTML = svgHtml;
    document.getElementById('gen-preview-caption').innerHTML =
      `<span>Ytre mål: <strong>${roundMm(bbox.width, 1)} × ${roundMm(bbox.height, 1)} mm</strong></span><span>Rød=Kutt, Blå=Score, Svart=Graver</span>`;
  };

  container.querySelectorAll('input, select').forEach(el => el.addEventListener('input', update));
  container.querySelectorAll('[data-preset]').forEach(pill => {
    pill.addEventListener('click', () => {
      const p = pill.dataset.preset;
      if (p === 'doorsign') {
        document.getElementById('gen-sign-style').value = 'plaque';
        document.getElementById('gen-sign-holes').value = 'holes-2';
        document.getElementById('gen-sign-w').value = 150;
        document.getElementById('gen-sign-h').value = 60;
        document.getElementById('gen-sign-head').value = 'VELKOMMEN';
        document.getElementById('gen-sign-sub').value = 'BJØRNSVEEN';
      } else if (p === 'keyring') {
        document.getElementById('gen-sign-style').value = 'rounded';
        document.getElementById('gen-sign-holes').value = 'keyring-ear';
        document.getElementById('gen-sign-w').value = 65;
        document.getElementById('gen-sign-h').value = 26;
        document.getElementById('gen-sign-head').value = 'EIRIK';
        document.getElementById('gen-sign-sub').value = '';
      } else if (p === 'nametag') {
        document.getElementById('gen-sign-style').value = 'tag';
        document.getElementById('gen-sign-holes').value = 'hole-left';
        document.getElementById('gen-sign-w').value = 85;
        document.getElementById('gen-sign-h').value = 34;
        document.getElementById('gen-sign-head').value = 'CREW';
        document.getElementById('gen-sign-sub').value = 'SKAPERVERKSTED';
      }
      update();
    });
  });
  update();
}

// ---- 3. Jigsaw Puzzle Modal UI ----
function renderPuzzleGeneratorUI(container) {
  let currentSeed = 42;
  container.innerHTML = `
    <div class="generator-controls">
      <div class="info-box">
        🧩 <strong>Puslespill-generator:</strong> Genererer ekte kurvede puslespillbrikker. Tips: Legg en gravering, tekst eller et sporet bilde midt oppå puslespillet før du kutter!
      </div>
      <div class="prop-grid">
        <div class="prop-field">
          <label>Bredde (mm)</label>
          <div class="input-with-unit"><input type="text" inputmode="decimal" id="gen-puz-w" class="input-control math-input" value="150" /><span class="unit">mm</span></div>
        </div>
        <div class="prop-field">
          <label>Høyde (mm)</label>
          <div class="input-with-unit"><input type="text" inputmode="decimal" id="gen-puz-h" class="input-control math-input" value="110" /><span class="unit">mm</span></div>
        </div>
        <div class="prop-field">
          <label>Antall kolonner (Bredde)</label>
          <input type="text" inputmode="decimal" id="gen-puz-cols" class="input-control math-input" value="4" />
        </div>
        <div class="prop-field">
          <label>Antall rader (Høyde)</label>
          <input type="text" inputmode="decimal" id="gen-puz-rows" class="input-control math-input" value="3" />
        </div>
        <div class="prop-field">
          <label>Hjørneradius ramme</label>
          <div class="input-with-unit"><input type="text" inputmode="decimal" id="gen-puz-rx" class="input-control math-input" value="6" /><span class="unit">mm</span></div>
        </div>
        <div class="prop-field">
          <label>Lås-størrelse (%)</label>
          <input type="text" inputmode="decimal" id="gen-puz-tab" class="input-control math-input" value="22" />
        </div>
        <div class="prop-field full-width">
          <button id="btn-puz-randomize" class="btn" type="button">🎲 Generer ny tilfeldig variasjon på brikkene</button>
        </div>
      </div>
    </div>
    <div class="generator-preview-box">
      <div id="gen-preview-svg" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"></div>
      <div id="gen-preview-caption" class="preview-caption"></div>
    </div>
  `;

  const update = () => {
    const cols = clamp(Math.round(evalMathExpr(document.getElementById('gen-puz-cols').value, 4)), 2, 15);
    const rows = clamp(Math.round(evalMathExpr(document.getElementById('gen-puz-rows').value, 3)), 2, 15);
    const shapes = generateJigsawPuzzle({
      widthMm: evalMathExpr(document.getElementById('gen-puz-w').value, 150),
      heightMm: evalMathExpr(document.getElementById('gen-puz-h').value, 110),
      cols,
      rows,
      cornerRadiusMm: evalMathExpr(document.getElementById('gen-puz-rx').value, 6),
      tabSizePct: evalMathExpr(document.getElementById('gen-puz-tab').value, 22),
      seed: currentSeed
    });
    state.modalPreviewShapes = shapes;
    const { svgHtml } = renderShapesPreviewSvg(shapes);
    document.getElementById('gen-preview-svg').innerHTML = svgHtml;
    document.getElementById('gen-preview-caption').innerHTML =
      `<span>Totalt <strong>${cols * rows} brikker</strong> (${cols} × ${rows})</span><span>1:1 mm kuttelinjer</span>`;
  };

  container.querySelectorAll('input').forEach(el => el.addEventListener('input', update));
  document.getElementById('btn-puz-randomize').addEventListener('click', () => {
    currentSeed = Math.floor(Math.random() * 90000) + 1;
    update();
  });
  update();
}

// ---- 4. Involute Gear Generator Modal UI ----
function renderGearGeneratorUI(container) {
  container.innerHTML = `
    <div class="generator-controls">
      <div class="info-box">
        ⚙️ <strong>Evolvent Tannhjul-generator:</strong> Alle tannhjul med samme <em>Modul (mm)</em> griper matematisk perfekt inn i hverandre!
      </div>
      <div class="prop-grid">
        <div class="prop-field full-width">
          <label>Oppsett</label>
          <select id="gen-gear-mode" class="select-control">
            <option value="pair" selected>Matchende tannhjul-par (Drivhjul + Drevet hjul)</option>
            <option value="single">Kun ett enkelt tannhjul</option>
          </select>
        </div>
        <div class="prop-field">
          <label>Modul (Tannstørrelse)</label>
          <select id="gen-gear-mod" class="select-control">
            <option value="1.5">Modul 1,5 mm (Fin)</option>
            <option value="2.0">Modul 2,0 mm (Standard)</option>
            <option value="2.5" selected>Modul 2,5 mm (Sterk)</option>
            <option value="3.0">Modul 3,0 mm (Grov/Tre)</option>
            <option value="4.0">Modul 4,0 mm (Ekstra stor)</option>
          </select>
        </div>
        <div class="prop-field">
          <label>Senterhull aksling (Ø)</label>
          <div class="input-with-unit"><input type="text" inputmode="decimal" id="gen-gear-bore" class="input-control math-input" value="5.0" /><span class="unit">mm</span></div>
        </div>
        <div class="prop-field">
          <label>Tenner Hjul 1 (Z₁)</label>
          <input type="text" inputmode="decimal" id="gen-gear-z1" class="input-control math-input" value="12" />
        </div>
        <div class="prop-field" id="gen-gear-z2-wrap">
          <label>Tenner Hjul 2 (Z₂)</label>
          <input type="text" inputmode="decimal" id="gen-gear-z2" class="input-control math-input" value="24" />
        </div>
        <div class="prop-field">
          <label>Eiker / Lettelseshull</label>
          <select id="gen-gear-spokes" class="select-control">
            <option value="0">Massivt (0 hull)</option>
            <option value="4">4 hull</option>
            <option value="5" selected>5 hull</option>
            <option value="6">6 hull</option>
          </select>
        </div>
        <div class="prop-field" style="justify-content:flex-end;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 0;">
            <input type="checkbox" id="gen-gear-guides" checked />
            <span>Vis senteravstand</span>
          </label>
        </div>
      </div>
    </div>
    <div class="generator-preview-box">
      <div id="gen-preview-svg" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"></div>
      <div id="gen-preview-caption" class="preview-caption"></div>
    </div>
  `;

  const update = () => {
    const mode = document.getElementById('gen-gear-mode').value;
    document.getElementById('gen-gear-z2-wrap').style.display = mode === 'pair' ? 'flex' : 'none';
    const m = parseFloat(document.getElementById('gen-gear-mod').value) || 2.5;
    const z1 = clamp(Math.round(evalMathExpr(document.getElementById('gen-gear-z1').value, 12)), 6, 80);
    const z2 = clamp(Math.round(evalMathExpr(document.getElementById('gen-gear-z2').value, 24)), 6, 80);
    const shapes = generateInvoluteGears({
      mode,
      moduleMm: m,
      teeth1: z1,
      teeth2: z2,
      boreDiamMm: evalMathExpr(document.getElementById('gen-gear-bore').value, 5.0),
      spokeCount: parseInt(document.getElementById('gen-gear-spokes').value, 10) || 0,
      showPitchGuides: document.getElementById('gen-gear-guides').checked
    });
    state.modalPreviewShapes = shapes;
    const { svgHtml } = renderShapesPreviewSvg(shapes);
    document.getElementById('gen-preview-svg').innerHTML = svgHtml;
    const centerDist = roundMm((m * (z1 + z2)) / 2, 2);
    const ratio = roundMm(z2 / z1, 2);
    document.getElementById('gen-preview-caption').innerHTML = mode === 'pair'
      ? `<span>Senteravstand mellom aksler: <strong>${centerDist} mm</strong></span><span>Utveksling: <strong>1 : ${ratio}</strong></span>`
      : `<span>Delediameter: <strong>${roundMm(m * z1, 1)} mm</strong> | Ytterdiameter: <strong>${roundMm(m * (z1 + 2), 1)} mm</strong></span>`;
  };

  container.querySelectorAll('input, select').forEach(el => el.addEventListener('input', update));
  update();
}

// ---- 5. Mandala & Ornament Modal UI ----
function renderMandalaGeneratorUI(container) {
  container.innerHTML = `
    <div class="generator-controls">
      <div class="info-box">
        ❄️ <strong>Dekor, Snøkrystall &amp; Mandala:</strong> Perfekt til julepynt, vindusdekor, smykker og glassbrikker (coasters).
      </div>
      <div class="prop-grid">
        <div class="prop-field full-width">
          <label>Stil</label>
          <select id="gen-man-style" class="select-control">
            <option value="snowflake">❄️ Snøkrystall (Vindu- / Julepynt)</option>
            <option value="mandala">🌸 Mandala-rosett med utstansing</option>
            <option value="coaster">☕ Glassbrikke (Coaster) med mønster</option>
            <option value="starburst">✨ Nordstjerne / Stjerne-ornament</option>
          </select>
        </div>
        <div class="prop-field">
          <label>Diameter (mm)</label>
          <div class="input-with-unit"><input type="text" inputmode="decimal" id="gen-man-d" class="input-control math-input" value="85" /><span class="unit">mm</span></div>
        </div>
        <div class="prop-field">
          <label>Symmetri (Antall armer)</label>
          <input type="text" inputmode="decimal" id="gen-man-arms" class="input-control math-input" value="6" />
        </div>
        <div class="prop-field">
          <label>Detaljnivå (1–5)</label>
          <input type="range" id="gen-man-comp" min="1" max="4" value="3" />
        </div>
        <div class="prop-field" style="justify-content:flex-end;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 0;">
            <input type="checkbox" id="gen-man-loop" checked />
            <span>Med opphengsøye i toppen</span>
          </label>
        </div>
      </div>
    </div>
    <div class="generator-preview-box">
      <div id="gen-preview-svg" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;"></div>
      <div id="gen-preview-caption" class="preview-caption"></div>
    </div>
  `;

  const update = () => {
    const shapes = generateMandalaOrnament({
      style: document.getElementById('gen-man-style').value,
      diameterMm: evalMathExpr(document.getElementById('gen-man-d').value, 85),
      arms: clamp(Math.round(evalMathExpr(document.getElementById('gen-man-arms').value, 6)), 4, 16),
      complexity: parseInt(document.getElementById('gen-man-comp').value, 10) || 3,
      hangingLoop: document.getElementById('gen-man-loop').checked
    });
    state.modalPreviewShapes = shapes;
    const { svgHtml, bbox } = renderShapesPreviewSvg(shapes);
    document.getElementById('gen-preview-svg').innerHTML = svgHtml;
    document.getElementById('gen-preview-caption').innerHTML =
      `<span>Mål: <strong>${roundMm(bbox.width, 1)} × ${roundMm(bbox.height, 1)} mm</strong></span><span>Klar til kutting</span>`;
  };

  container.querySelectorAll('input, select').forEach(el => el.addEventListener('input', update));
  update();
}

// ---- 6. Icon & Symbol Library Modal UI ----
function renderIconsLibraryUI(container) {
  const cardsHtml = LASER_ICONS.map(ic => `
    <div class="icon-card" data-icon-id="${ic.id}" title="Klikk for å sette inn ${ic.name}">
      <svg viewBox="0 0 100 105"><path d="${ic.d}" fill="#38bdf8" fill-rule="evenodd"/></svg>
      <span>${ic.name}</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div class="info-box" style="flex:1;">
          🦌 <strong>Klikk på et symbol</strong> for å sette det rett inn på arbeidsflaten i valgt størrelse og lasermodus!
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <label style="font-size:12px;color:var(--text-muted);">Størrelse (mm):</label>
          <input type="text" inputmode="decimal" id="icon-insert-size" class="input-control math-input" value="45" style="width:70px;" />
          <label style="font-size:12px;color:var(--text-muted);">Lag:</label>
          <select id="icon-insert-mode" class="select-control">
            <option value="engrave" selected>⚫ Gravering (Fylt)</option>
            <option value="cut">🔴 Kutt (Kontur)</option>
            <option value="score">🔵 Linje / Score</option>
          </select>
        </div>
      </div>
      <div class="icon-library-grid">${cardsHtml}</div>
    </div>
  `;

  container.querySelectorAll('.icon-card').forEach(card => {
    card.addEventListener('click', () => {
      const iconDef = LASER_ICONS.find(i => i.id === card.dataset.iconId);
      if (!iconDef) return;
      const size = evalMathExpr(document.getElementById('icon-insert-size').value, 45);
      const mode = document.getElementById('icon-insert-mode').value || 'engrave';
      pushUndoSnapshot();
      const shape = createIconShape(iconDef, 35, 35, size, mode);
      state.shapes.push(shape);
      state.selectedIds = new Set([shape.id]);
      document.getElementById('generator-modal').classList.remove('open');
      setActiveTool('select');
      renderAll();
      showToast(`✨ Satte inn "${iconDef.name}" (${size} mm)`);
    });
  });
}

// ---- 7. Image-to-Vector Tracer Modal UI ----
function renderImageTraceUI(container) {
  container.innerHTML = `
    <div class="generator-controls">
      <div class="info-box">
        🖼️ <strong>Bilde-til-vektor (Bildesporing):</strong> Last opp en tegning, logo eller silhuett for å gjøre den om til ekte kuttbare/graverbare vektorstier!
      </div>
      <div class="prop-grid">
        <div class="prop-field full-width">
          <input type="file" id="trace-file-input" accept="image/*" class="input-control" />
        </div>
        <div class="prop-field">
          <label>Lys-terskel (Threshold)</label>
          <input type="range" id="trace-thresh" min="20" max="235" value="135" />
        </div>
        <div class="prop-field">
          <label>Bredde på ferdig figur</label>
          <div class="input-with-unit"><input type="text" inputmode="decimal" id="trace-width" class="input-control math-input" value="80" /><span class="unit">mm</span></div>
        </div>
        <div class="prop-field">
          <label>Lasermodus</label>
          <select id="trace-mode" class="select-control">
            <option value="engrave" selected>⚫ Gravering (Fylt)</option>
            <option value="cut">🔴 Kutt (Ytter-/innerkontur)</option>
            <option value="score">🔵 Linje / Score</option>
          </select>
        </div>
        <div class="prop-field" style="justify-content:flex-end;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 0;">
            <input type="checkbox" id="trace-invert" />
            <span>Inverter (Hvitt på mørk)</span>
          </label>
        </div>
      </div>
    </div>
    <div class="generator-preview-box">
      <div id="gen-preview-svg" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:12px;text-align:center;color:var(--text-muted);">
        Velg en bildefil (.png, .jpg) til venstre for å spore vektorstier!
      </div>
      <div id="gen-preview-caption" class="preview-caption"></div>
    </div>
  `;

  const runTrace = () => {
    if (!state.traceImageElement) return;
    const threshold = parseInt(document.getElementById('trace-thresh').value, 10) || 135;
    const invert = document.getElementById('trace-invert').checked;
    const targetWidthMm = evalMathExpr(document.getElementById('trace-width').value, 80);
    const mode = document.getElementById('trace-mode').value || 'engrave';

    const loops = traceImageToPolygons(state.traceImageElement, {
      threshold,
      invert,
      targetWidthMm,
      smoothing: 0.2
    });
    if (loops.length > 0) {
      const shape = createPathShapeFromPolygons(loops, mode, 'Sporet bilde');
      shape.x = 25;
      shape.y = 25;
      state.modalPreviewShapes = [shape];
      const { svgHtml, bbox } = renderShapesPreviewSvg([shape]);
      document.getElementById('gen-preview-svg').innerHTML = svgHtml;
      document.getElementById('gen-preview-caption').innerHTML =
        `<span>Fant <strong>${loops.length}</strong> lukkede vektorstier</span><span>Mål: ${roundMm(bbox.width, 1)} × ${roundMm(bbox.height, 1)} mm</span>`;
    } else {
      state.modalPreviewShapes = [];
      document.getElementById('gen-preview-svg').innerHTML = 'Ingen konturer funnet – prøv å justere Lys-terskel.';
    }
  };

  document.getElementById('trace-file-input').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        state.traceImageElement = img;
        runTrace();
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(f);
  });

  container.querySelectorAll('#trace-thresh, #trace-width, #trace-mode, #trace-invert').forEach(el => {
    el.addEventListener('input', runTrace);
  });

  if (state.traceImageElement) runTrace();
}

// ---- Pre-flight Check & SVG Export Modal ----
function openExportModal() {
  const modal = document.getElementById('export-modal');
  const body = document.getElementById('export-modal-body');
  const fixDupBtn = document.getElementById('btn-fix-duplicates');

  const report = analyzeShapesForLaser(state.shapes, state.bedWidth, state.bedHeight);
  const hasDuplicates = report.duplicateShapeIds.length > 0;
  const hasOutOfBounds = report.outOfBounds.length > 0;

  fixDupBtn.style.display = hasDuplicates ? 'inline-flex' : 'none';
  fixDupBtn.onclick = () => {
    pushUndoSnapshot();
    const dupSet = new Set(report.duplicateShapeIds);
    state.shapes = state.shapes.filter(s => !dupSet.has(s.id));
    renderAll();
    openExportModal();
    showToast(`🧹 Fjernet ${dupSet.size} duplikate objekter!`);
  };

  let warningsHtml = '';
  if (hasOutOfBounds) {
    warningsHtml += `<div class="warn-box">⚠️ <strong>${report.outOfBounds.length} objekt(er) ligger utenfor valgt arbeidsflate (${state.bedWidth}×${state.bedHeight} mm).</strong> Klikk «Midt på platen» i høyre panel hvis du vil flytte dem inn.</div>`;
  }
  if (hasDuplicates) {
    warningsHtml += `<div class="warn-box">⚠️ <strong>Fant ${report.duplicateShapeIds.length} duplikate linjer/objekter oppå hverandre!</strong> Dette kan gjøre at laseren kutter samme strek to ganger. Klikk «Fjern duplikate linjer» nederst.</div>`;
  }
  if (!hasOutOfBounds && !hasDuplicates) {
    warningsHtml = `<div class="info-box" style="border-color:rgba(16,185,129,0.4);background:rgba(16,185,129,0.1);color:#a7f3d0;">
      ✅ <strong>Alt ser perfekt ut!</strong> Ingen duplikate linjer og alle objekter er innenfor arbeidsflaten.
    </div>`;
  }

  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px;">
      ${warningsHtml}

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center;">
        <div style="background:var(--bg-input);padding:10px;border-radius:8px;border:1px solid rgba(255,30,30,0.35);">
          <div style="color:#fca5a5;font-weight:700;font-size:12px;">🔴 KUTT (Cut)</div>
          <div style="font-size:18px;font-weight:800;margin:4px 0;">${report.cutCount} stk</div>
          <div style="font-size:11px;color:var(--text-muted);">Kuttelengde: ${report.cutLengthMm} mm</div>
        </div>
        <div style="background:var(--bg-input);padding:10px;border-radius:8px;border:1px solid rgba(59,130,246,0.35);">
          <div style="color:#93c5fd;font-weight:700;font-size:12px;">🔵 LINJE (Score)</div>
          <div style="font-size:18px;font-weight:800;margin:4px 0;">${report.scoreCount} stk</div>
          <div style="font-size:11px;color:var(--text-muted);">Linjelengde: ${report.scoreLengthMm} mm</div>
        </div>
        <div style="background:var(--bg-input);padding:10px;border-radius:8px;border:1px solid #475569;">
          <div style="color:#e2e8f0;font-weight:700;font-size:12px;">⚫ GRAVERING</div>
          <div style="font-size:18px;font-weight:800;margin:4px 0;">${report.engraveCount} stk</div>
          <div style="font-size:11px;color:var(--text-muted);">Fylte flater</div>
        </div>
      </div>

      <div class="prop-grid" style="margin-top:4px;">
        <div class="prop-field full-width">
          <label>Filnavn ved nedlasting</label>
          <input type="text" id="export-filename-input" class="input-control" value="bjornsveen-laser-design.svg" />
        </div>
        <div class="prop-field full-width">
          <label>Eksport-utsnitt for xTool Creative Space / Studio</label>
          <select id="export-crop-select" class="select-control">
            <option value="crop" selected>Tilpass utsnitt rundt tegningen i 1:1 mm (Anbefalt for xTool)</option>
            <option value="bed">Eksporter hele arbeidsflaten (${state.bedWidth} × ${state.bedHeight} mm)</option>
            ${state.selectedIds.size > 0 ? `<option value="selected">Kun valgte objekter (${state.selectedIds.size} stk)</option>` : ''}
          </select>
        </div>
      </div>

      <div style="font-size:11.5px;color:var(--text-muted);background:#0f172a;padding:10px;border-radius:6px;border:1px solid var(--border-color);">
        <strong>Slik bruker du filen i xTool Creative Space:</strong><br/>
        1. Klikk <em>Last ned .SVG-fil</em> og dra filen inn i xTool Creative Space.<br/>
        2. xTool legger automatisk <span style="color:#f87171">Rød (#FF0000)</span>, <span style="color:#60a5fa">Blå (#0000FF)</span> og <strong>Svart (#000000)</strong> i egne fargelag i nøyaktig riktig millimeter-størrelse!
      </div>
    </div>
  `;

  document.getElementById('btn-confirm-download-svg').onclick = () => {
    const mode = document.getElementById('export-crop-select').value;
    let filename = (document.getElementById('export-filename-input').value || 'bjornsveen-laser.svg').trim();
    if (!filename.toLowerCase().endsWith('.svg')) filename += '.svg';

    const svgContent = buildLaserSvgString(state.shapes, {
      bedWidth: state.bedWidth,
      bedHeight: state.bedHeight,
      cropToContent: mode !== 'bed',
      onlySelected: mode === 'selected',
      selectedIds: state.selectedIds
    });

    downloadTextFile(svgContent, filename, 'image/svg+xml;charset=utf-8');
    modal.classList.remove('open');
    showToast(`⬇ Lastet ned "${filename}" i 1:1 millimeter!`);
  };

  modal.classList.add('open');
}

// ============================================================================
// TOAST NOTIFICATION HELPER
// ============================================================================

function showToast(message) {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  container.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.25s';
    setTimeout(() => t.remove(), 250);
  }, 2800);
}

// Launch app
initApp();
