// ============================================================================
// Bjørnsveen LaserStudio – xTool (.xcs) Project Exporter/Importer,
// 1:1 Millimeter SVG Exporter (with Embedded Bitmaps) & Material Laser Presets
// Tailored for xTool P3 (CO2) & xTool F2 Ultra (UV)
// ============================================================================

import {
  uid,
  clamp,
  roundMm,
  shapeToWorldSvgPath,
  shapeToWorldPolygons,
  computePolygonsBBox,
  createPathShapeFromPolygons,
  parseSvgPathToPolygons
} from './geometry.js';

const STORAGE_KEY = 'bjornsveen_laserstudio_autosave_v1';

// ============================================================================
// 1. BUILT-IN LASER MATERIAL PRESETS (POWER %, SPEED mm/s, PASSES, DPI/DENSITY)
// ============================================================================

export const LASER_MATERIAL_PRESETS = {
  'plywood-3mm': {
    name: '🌲 3 mm Bjørk Kryssfiner (Standard P3 CO2)',
    machine: 'xtool-p3',
    thicknessMm: 3.0,
    cut: { power: 85, speed: 18, repeat: 1 },
    score: { power: 18, speed: 160, repeat: 1 },
    engrave: { power: 30, speed: 350, density: 100, repeat: 1 },
    bitmap: { power: 32, speed: 300, dpi: 254, bitmapMode: 'grayscale' }
  },
  'plywood-4mm': {
    name: '🌲 4 mm Kryssfiner / Poppel (P3 CO2)',
    machine: 'xtool-p3',
    thicknessMm: 4.0,
    cut: { power: 92, speed: 14, repeat: 1 },
    score: { power: 18, speed: 160, repeat: 1 },
    engrave: { power: 32, speed: 350, density: 100, repeat: 1 },
    bitmap: { power: 34, speed: 300, dpi: 254, bitmapMode: 'grayscale' }
  },
  'mdf-3mm': {
    name: '🟫 3 mm MDF-plate (P3 CO2)',
    machine: 'xtool-p3',
    thicknessMm: 3.0,
    cut: { power: 90, speed: 15, repeat: 1 },
    score: { power: 20, speed: 150, repeat: 1 },
    engrave: { power: 35, speed: 320, density: 100, repeat: 1 },
    bitmap: { power: 35, speed: 280, dpi: 254, bitmapMode: 'jarvis' }
  },
  'acrylic-3mm': {
    name: '💎 3 mm Akryl / Plexiglass (P3 CO2)',
    machine: 'xtool-p3',
    thicknessMm: 3.0,
    cut: { power: 90, speed: 12, repeat: 1 },
    score: { power: 16, speed: 140, repeat: 1 },
    engrave: { power: 28, speed: 380, density: 120, repeat: 1 },
    bitmap: { power: 28, speed: 320, dpi: 300, bitmapMode: 'jarvis' }
  },
  'cardboard': {
    name: '📦 Papp / Kartong – Rask prototype (P3 CO2)',
    machine: 'xtool-p3',
    thicknessMm: 2.0,
    cut: { power: 35, speed: 45, repeat: 1 },
    score: { power: 12, speed: 180, repeat: 1 },
    engrave: { power: 18, speed: 400, density: 80, repeat: 1 },
    bitmap: { power: 20, speed: 350, dpi: 200, bitmapMode: 'jarvis' }
  },
  'leather': {
    name: '👜 Lær / Skinn (P3 CO2 / F2 Ultra)',
    machine: 'xtool-p3',
    thicknessMm: 2.0,
    cut: { power: 55, speed: 25, repeat: 1 },
    score: { power: 15, speed: 150, repeat: 1 },
    engrave: { power: 24, speed: 350, density: 100, repeat: 1 },
    bitmap: { power: 25, speed: 300, dpi: 254, bitmapMode: 'grayscale' }
  },
  'slate-uv': {
    name: '🪨 Skifer / Steinbrikke (F2 Ultra UV / P3)',
    machine: 'xtool-f2',
    thicknessMm: 5.0,
    cut: { power: 90, speed: 10, repeat: 1 },
    score: { power: 40, speed: 120, repeat: 1 },
    engrave: { power: 65, speed: 400, density: 140, repeat: 1 },
    bitmap: { power: 65, speed: 350, dpi: 300, bitmapMode: 'jarvis' }
  },
  'alu-uv': {
    name: '🪪 Anodisert Aluminium / Metallkort (F2 Ultra UV)',
    machine: 'xtool-f2',
    thicknessMm: 0.8,
    cut: { power: 90, speed: 10, repeat: 1 },
    score: { power: 45, speed: 300, repeat: 1 },
    engrave: { power: 70, speed: 600, density: 160, repeat: 1 },
    bitmap: { power: 70, speed: 500, dpi: 400, bitmapMode: 'grayscale' }
  },
  'glass-uv': {
    name: '🥃 Glass / Krystall – Kaldt UV-merke (F2 Ultra UV)',
    machine: 'xtool-f2',
    thicknessMm: 3.0,
    cut: { power: 80, speed: 10, repeat: 1 },
    score: { power: 55, speed: 200, repeat: 1 },
    engrave: { power: 75, speed: 350, density: 150, repeat: 1 },
    bitmap: { power: 75, speed: 300, dpi: 350, bitmapMode: 'jarvis' }
  },
  'custom': {
    name: '⚙️ Egendefinerte laserinnstillinger',
    machine: 'custom',
    thicknessMm: 3.0,
    cut: { power: 85, speed: 18, repeat: 1 },
    score: { power: 18, speed: 160, repeat: 1 },
    engrave: { power: 30, speed: 350, density: 100, repeat: 1 },
    bitmap: { power: 32, speed: 300, dpi: 254, bitmapMode: 'grayscale' }
  }
};

export function getDefaultLaserSettings() {
  const base = LASER_MATERIAL_PRESETS['plywood-3mm'];
  return JSON.parse(JSON.stringify({
    presetKey: 'plywood-3mm',
    thicknessMm: base.thicknessMm,
    cut: base.cut,
    score: base.score,
    engrave: base.engrave,
    bitmap: base.bitmap
  }));
}

function makeUuidV4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// 2. 1:1 MILLIMETER SVG EXPORTER (WITH EMBEDDED BITMAPS & LASER SETTINGS)
// ============================================================================

/**
 * Generates a 1:1 millimeter-accurate SVG string ready for xTool Creative Space / Studio.
 * Supports both vector paths (Cut, Score, Engrave) AND embedded Base64 Bitmap Images!
 */
export function buildLaserSvgString(shapes, {
  bedWidth = 600,
  bedHeight = 400,
  cropToContent = true,
  onlySelected = false,
  selectedIds = new Set(),
  laserSettings = null
} = {}) {
  const exportable = [];
  const collect = (list) => {
    for (const s of list || []) {
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

  const bitmapElements = [];
  const engravePaths = [];
  const scorePaths = [];
  const cutPaths = [];

  for (const s of exportable) {
    const safeName = String(s.name || s.type).replace(/["<>]/g, '');

    if (s.type === 'image' && (s.dataUrl || s.srcDataUrl)) {
      const href = s.dataUrl || s.srcDataUrl;
      const rot = Number(s.rotation) || 0;
      const cx = roundMm((Number(s.x) || 0) + (Number(s.width) || 0) / 2, 3);
      const cy = roundMm((Number(s.y) || 0) + (Number(s.height) || 0) / 2, 3);
      const tf = rot ? ` transform="rotate(${roundMm(rot, 2)} ${cx} ${cy})"` : '';
      bitmapElements.push(
        `    <image id="${s.id}" data-name="${safeName}" x="${roundMm(s.x, 3)}" y="${roundMm(s.y, 3)}" width="${roundMm(s.width, 3)}" height="${roundMm(s.height, 3)}" preserveAspectRatio="none"${tf} href="${href}" xlink:href="${href}" />`
      );
      continue;
    }

    const d = shapeToWorldSvgPath(s);
    if (!d) continue;

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

  const cfg = laserSettings || getDefaultLaserSettings();
  const settingsComment = `<!-- Laserinnstillinger: Materiale=${cfg.presetKey || 'custom'}, Kutt(${cfg.cut?.power}%/${cfg.cut?.speed}mm/s/${cfg.cut?.repeat}x), Score(${cfg.score?.power}%/${cfg.score?.speed}mm/s), Gravering(${cfg.engrave?.power}%/${cfg.engrave?.speed}mm/s/${cfg.engrave?.density}LPC), Foto(${cfg.bitmap?.power}%/${cfg.bitmap?.speed}mm/s/${cfg.bitmap?.dpi}DPI) -->`;

  const lines = [
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>`,
    `<!-- Generert med Bjørnsveen LaserStudio (1:1 millimeter for xTool P3 / F2 Ultra) -->`,
    settingsComment,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${widthMm}mm" height="${heightMm}mm" viewBox="${minX} ${minY} ${widthMm} ${heightMm}">`
  ];

  if (bitmapElements.length > 0) {
    lines.push(`  <g id="Lag_0_Bitmap_Foto_Gravering">`);
    lines.push(...bitmapElements);
    lines.push(`  </g>`);
  }
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

// ============================================================================
// 3. NATIVE xTool Creative Space (.xcs) PROJECT EXPORTER & IMPORTER
// ============================================================================

/**
 * Generates an xTool Creative Space (.xcs) JSON project string containing:
 * - Vector PATH elements (Cut #ff0000, Score #0000ff, Engrave #000000)
 * - Embedded BITMAP elements (base64 PNG with brightness/contrast/dithering)
 * - Composite groups (`groupData`)
 * - Complete `layerData` and `device` processing parameters (Power %, Speed mm/s, Passes, DPI/LPC)
 */
export function buildXcsProjectString(shapes, {
  machineKey = 'xtool-p3',
  bedWidth = 600,
  bedHeight = 400,
  onlySelected = false,
  selectedIds = new Set(),
  laserSettings = null
} = {}) {
  const cfg = laserSettings || getDefaultLaserSettings();
  const canvasId = makeUuidV4();
  const isF2 = machineKey === 'xtool-f2';

  const displays = [];
  const groupData = {};
  const deviceDisplaysMap = {};

  const layerColors = {
    engrave: '#000000',
    bitmap: '#111827',
    score: '#0000ff',
    cut: '#ff0000'
  };

  let zOrder = 1;

  const convertShapeToDisplay = (s, groupTag = null) => {
    if (!s || s.hidden || s.laserMode === 'guide') return null;

    if (s.type === 'group' && Array.isArray(s.children)) {
      const grpUuid = makeUuidV4();
      const childIds = [];
      for (const child of s.children) {
        const cid = convertShapeToDisplay(child, grpUuid);
        if (cid) childIds.push(cid);
      }
      if (childIds.length > 0) {
        groupData[grpUuid] = {
          groupName: s.name || 'Gruppe',
          groupTag: grpUuid,
          containEls: childIds
        };
      }
      return null;
    }

    const dispId = makeUuidV4();

    // 1. BITMAP IMAGE ELEMENT
    if (s.type === 'image' && (s.dataUrl || s.srcDataUrl)) {
      const base64 = s.dataUrl || s.srcDataUrl;
      const meta = s.imageMeta || {};
      const x = roundMm(Number(s.x) || 0, 3);
      const y = roundMm(Number(s.y) || 0, 3);
      const w = roundMm(Math.max(1, Number(s.width) || 50), 3);
      const h = roundMm(Math.max(1, Number(s.height) || 50), 3);
      const angle = roundMm(Number(s.rotation) || 0, 2);

      const dispObj = {
        id: dispId,
        name: s.name || 'Bitmap-bilde',
        type: 'BITMAP',
        x,
        y,
        width: w,
        height: h,
        angle,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        pivotX: 0,
        pivotY: 0,
        offsetX: x,
        offsetY: y,
        lockRatio: true,
        isClose: true,
        isFill: false,
        layerColor: layerColors.engrave,
        visible: true,
        zOrder: zOrder++,
        groupTag: groupTag || '',
        base64,
        originWidth: meta.originWidthPx || Math.round(w * 10),
        originHeight: meta.originHeightPx || Math.round(h * 10),
        filter: meta.filter === 'dither' ? 'jarvis' : (meta.filter || 'grayscale'),
        brightness: Number(meta.brightness) || 0,
        contrast: Number(meta.contrast) || 0,
        sharpness: 50,
        invert: Boolean(meta.invert),
        bjornsveenShape: s
      };
      displays.push(dispObj);

      deviceDisplaysMap[dispId] = {
        isWhiteModel: true,
        processingType: 'BITMAP_ENGRAVING',
        data: {
          BITMAP_ENGRAVING: {
            materialType: 'customize',
            planType: 'official',
            parameter: {
              customize: {
                bitmapScanMode: 'zMode',
                power: clamp(Number(cfg.bitmap?.power) || 32, 1, 100),
                speed: clamp(Number(cfg.bitmap?.speed) || 300, 1, 2000),
                repeat: 1,
                dpi: clamp(Number(cfg.bitmap?.dpi) || 254, 50, 1000),
                density: clamp(Number(cfg.bitmap?.dpi) || 254, 50, 1000),
                bitmapMode: cfg.bitmap?.bitmapMode || 'grayscale'
              }
            }
          }
        }
      };
      return dispId;
    }

    // 2. VECTOR PATH ELEMENT (Cut, Score, Engrave)
    const loops = shapeToWorldPolygons(s, 0.15);
    if (!loops || loops.length === 0) return null;
    const bbox = computePolygonsBBox(loops);
    const dPath = shapeToWorldSvgPath(s);
    if (!dPath) return null;

    const mode = s.laserMode || 'cut';
    const isFill = mode === 'engrave';
    const layerColor = layerColors[mode] || layerColors.cut;
    const procType = mode === 'engrave'
      ? 'FILL_VECTOR_ENGRAVING'
      : (mode === 'score' ? 'VECTOR_ENGRAVING' : 'VECTOR_CUTTING');

    const dispObj = {
      id: dispId,
      name: s.name || s.type,
      type: 'PATH',
      x: roundMm(bbox.x, 3),
      y: roundMm(bbox.y, 3),
      width: roundMm(Math.max(0.1, bbox.width), 3),
      height: roundMm(Math.max(0.1, bbox.height), 3),
      angle: 0,
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      pivotX: 0,
      pivotY: 0,
      offsetX: roundMm(bbox.x, 3),
      offsetY: roundMm(bbox.y, 3),
      lockRatio: true,
      isClose: loops[0]?.closed !== false,
      isFill,
      lineColor: layerColor,
      strokeColor: layerColor,
      fillColor: isFill ? layerColor : '#000000',
      layerColor,
      visible: true,
      zOrder: zOrder++,
      groupTag: groupTag || '',
      dPath,
      points: [],
      bjornsveenShape: s
    };
    displays.push(dispObj);

    const modeCfg = mode === 'engrave' ? cfg.engrave : (mode === 'score' ? cfg.score : cfg.cut);
    deviceDisplaysMap[dispId] = {
      isWhiteModel: true,
      processingType: procType,
      data: {
        VECTOR_CUTTING: {
          materialType: 'customize',
          planType: 'official',
          parameter: {
            customize: {
              power: clamp(Number(cfg.cut?.power) || 85, 1, 100),
              speed: clamp(Number(cfg.cut?.speed) || 18, 1, 2000),
              repeat: clamp(Number(cfg.cut?.repeat) || 1, 1, 10)
            }
          }
        },
        VECTOR_ENGRAVING: {
          materialType: 'customize',
          planType: 'official',
          parameter: {
            customize: {
              power: clamp(Number(cfg.score?.power) || 18, 1, 100),
              speed: clamp(Number(cfg.score?.speed) || 160, 1, 2000),
              repeat: clamp(Number(cfg.score?.repeat) || 1, 1, 10)
            }
          }
        },
        FILL_VECTOR_ENGRAVING: {
          materialType: 'customize',
          planType: 'official',
          parameter: {
            customize: {
              power: clamp(Number(cfg.engrave?.power) || 30, 1, 100),
              speed: clamp(Number(cfg.engrave?.speed) || 350, 1, 2000),
              repeat: clamp(Number(cfg.engrave?.repeat) || 1, 1, 10),
              density: clamp(Number(cfg.engrave?.density) || 100, 20, 400),
              bitmapScanMode: 'zMode'
            }
          }
        }
      }
    };
    // Ensure active mode parameter reflects modeCfg
    if (modeCfg && deviceDisplaysMap[dispId].data[procType]) {
      Object.assign(deviceDisplaysMap[dispId].data[procType].parameter.customize, {
        power: clamp(Number(modeCfg.power) || 50, 1, 100),
        speed: clamp(Number(modeCfg.speed) || 100, 1, 2000),
        repeat: clamp(Number(modeCfg.repeat) || 1, 1, 10)
      });
    }

    return dispId;
  };

  const sourceList = onlySelected
    ? shapes.filter(s => selectedIds.has(s.id))
    : shapes;

  for (const s of sourceList) {
    convertShapeToDisplay(s, null);
  }

  const layerData = {
    '#000000': {
      name: 'Gravering & Foto (Svart)',
      order: 1,
      visible: true,
      panel: 0
    },
    '#0000ff': {
      name: 'Linje / Score (Blå)',
      order: 2,
      visible: true,
      panel: 0
    },
    '#ff0000': {
      name: 'Gjennomkutt (Rød)',
      order: 3,
      visible: true,
      panel: 0
    }
  };

  const xcsProject = {
    canvasId,
    extId: isF2 ? 'xTool_F2_Ultra' : 'xTool_P3',
    extName: isF2 ? 'xTool F2 Ultra' : 'xTool P3',
    version: '1.3.6',
    created: Date.now(),
    modify: Date.now(),
    ua: 'Bjørnsveen LaserStudio 1.0 (xTool P3 & F2 Ultra)',
    meta: [],
    cover: '',
    minPkgVersion: '2.0.0',
    canvas: [
      {
        id: canvasId,
        title: 'Bjørnsveen LaserStudio',
        layerData,
        groupData,
        displays
      }
    ],
    device: {
      id: isF2 ? 'xTool_F2_Ultra' : 'xTool_P3',
      power: isF2 ? 20 : 80,
      data: {
        dataType: 'Map',
        value: [
          [
            canvasId,
            {
              mode: 'LASER_PLANE',
              data: {
                LASER_PLANE: {
                  material: 0,
                  lightSource: isF2 ? 'uv' : 'co2',
                  thickness: Number(cfg.thicknessMm) || 3.0,
                  isProcessByLayer: true,
                  pathPlanning: 'auto'
                }
              },
              displays: {
                dataType: 'Map',
                value: Object.entries(deviceDisplaysMap)
              }
            }
          ]
        ]
      },
      materialList: [],
      materialTypeList: []
    },
    // Preserve full native Bjørnsveen LaserStudio state so reopening the .xcs file in our web app is 100% lossless!
    bjornsveenProject: {
      version: 2,
      app: 'Bjørnsveen LaserStudio',
      machineKey,
      bedWidth,
      bedHeight,
      laserSettings: cfg,
      shapes: sourceList
    }
  };

  return JSON.stringify(xcsProject, null, 2);
}

/**
 * Imports an `.xcs` project file (either generated by Bjørnsveen LaserStudio or by xTool Creative Space)
 * and returns `{ shapes, machineKey, bedWidth, bedHeight, laserSettings }`.
 */
export function importXcsStringToWorkspace(rawText) {
  try {
    const data = JSON.parse(rawText);

    // 1. If it includes lossless `bjornsveenProject` metadata, restore directly!
    if (data.bjornsveenProject && Array.isArray(data.bjornsveenProject.shapes)) {
      return {
        shapes: data.bjornsveenProject.shapes,
        machineKey: data.bjornsveenProject.machineKey,
        bedWidth: data.bjornsveenProject.bedWidth,
        bedHeight: data.bjornsveenProject.bedHeight,
        laserSettings: data.bjornsveenProject.laserSettings || null
      };
    }

    // 2. Otherwise parse standard xTool Creative Space `canvas[0].displays`
    const firstCanvas = Array.isArray(data.canvas) ? data.canvas[0] : null;
    if (!firstCanvas || !Array.isArray(firstCanvas.displays)) {
      return null;
    }

    // Build device display processingType lookup if present
    const procTypeById = new Map();
    const devValue = data.device?.data?.value;
    if (Array.isArray(devValue) && devValue[0]?.[1]?.displays?.value) {
      for (const [did, dinfo] of devValue[0][1].displays.value) {
        if (dinfo && dinfo.processingType) {
          procTypeById.set(did, dinfo.processingType);
        }
      }
    }

    const shapes = [];
    for (const disp of firstCanvas.displays) {
      if (!disp) continue;
      if (disp.bjornsveenShape) {
        shapes.push(disp.bjornsveenShape);
        continue;
      }

      const pType = procTypeById.get(disp.id) || '';
      const lColor = String(disp.layerColor || disp.strokeColor || '').toLowerCase();

      if (disp.type === 'BITMAP' && disp.base64) {
        shapes.push({
          id: uid('img'),
          type: 'image',
          name: disp.name || 'XCS Bitmap',
          laserMode: 'engrave',
          x: roundMm(Number(disp.x) || 20, 2),
          y: roundMm(Number(disp.y) || 20, 2),
          width: roundMm(Math.max(5, Number(disp.width) || 60), 2),
          height: roundMm(Math.max(5, Number(disp.height) || 60), 2),
          rotation: roundMm(Number(disp.angle) || 0, 1),
          srcDataUrl: disp.base64,
          dataUrl: disp.base64,
          imageMeta: {
            brightness: Number(disp.brightness) || 0,
            contrast: Number(disp.contrast) || 0,
            filter: disp.filter === 'jarvis' ? 'dither' : 'grayscale',
            threshold: 135,
            invert: Boolean(disp.invert),
            removeWhiteBg: false,
            maskShape: 'rect'
          }
        });
      } else if (disp.dPath) {
        const loops = parseSvgPathToPolygons(disp.dPath, 0.2);
        if (loops.length > 0) {
          let laserMode = 'cut';
          if (pType === 'FILL_VECTOR_ENGRAVING' || disp.isFill) {
            laserMode = 'engrave';
          } else if (pType === 'VECTOR_ENGRAVING' || lColor.includes('0000ff') || lColor.includes('00befe')) {
            laserMode = 'score';
          }
          const sh = createPathShapeFromPolygons(loops, laserMode, disp.name || 'XCS Vektor');
          if (disp.x !== undefined && disp.y !== undefined && disp.width && disp.height) {
            sh.x = roundMm(Number(disp.x), 2);
            sh.y = roundMm(Number(disp.y), 2);
            sh.width = roundMm(Math.max(0.5, Number(disp.width)), 2);
            sh.height = roundMm(Math.max(0.5, Number(disp.height)), 2);
          }
          if (disp.angle) sh.rotation = roundMm(Number(disp.angle), 1);
          shapes.push(sh);
        }
      }
    }

    return {
      shapes,
      machineKey: String(data.extName || '').includes('F2') ? 'xtool-f2' : undefined,
      laserSettings: null
    };
  } catch (err) {
    return null;
  }
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
// 4. EXTERNAL SVG IMPORTER (SUPPORTS BOTH VECTOR PATHS & EMBEDDED <image>)
// ============================================================================

export function importSvgStringToShapes(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) return [];

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
    const vbParts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
    if (vbParts.length === 4 && vbParts[2] > 700) {
      scale = 25.4 / 96;
    }
  }

  const importedShapes = [];
  const elements = svgEl.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line, image');

  elements.forEach((el, idx) => {
    if (el.closest('defs') || el.closest('pattern') || el.closest('clipPath')) return;

    const tag = el.tagName.toLowerCase();
    if (tag === 'image') {
      const href = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
      if (href.startsWith('data:image/')) {
        const x = (parseFloat(el.getAttribute('x')) || 20) * scale;
        const y = (parseFloat(el.getAttribute('y')) || 20) * scale;
        const w = Math.max(5, (parseFloat(el.getAttribute('width')) || 60) * scale);
        const h = Math.max(5, (parseFloat(el.getAttribute('height')) || 60) * scale);
        importedShapes.push({
          id: uid('img'),
          type: 'image',
          name: el.getAttribute('data-name') || el.getAttribute('id') || `Bitmap #${idx + 1}`,
          laserMode: 'engrave',
          x: roundMm(x, 2),
          y: roundMm(y, 2),
          width: roundMm(w, 2),
          height: roundMm(h, 2),
          rotation: 0,
          srcDataUrl: href,
          dataUrl: href,
          imageMeta: {
            brightness: 0,
            contrast: 0,
            filter: 'grayscale',
            threshold: 135,
            invert: false,
            removeWhiteBg: false,
            maskShape: 'rect'
          }
        });
      }
      return;
    }

    const stroke = (el.getAttribute('stroke') || el.style?.stroke || '').toLowerCase();
    const fill = (el.getAttribute('fill') || el.style?.fill || '').toLowerCase();

    let laserMode = 'cut';
    if (stroke.includes('0000ff') || stroke === 'blue' || stroke.includes('3b82f6')) {
      laserMode = 'score';
    } else if (fill && fill !== 'none' && fill !== 'transparent' && (!stroke || stroke === 'none')) {
      laserMode = 'engrave';
    }

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
// 5. LOCAL STORAGE AUTO-SAVE & PROJECT JSON
// ============================================================================

export function saveWorkspaceToLocal(state) {
  try {
    const payload = {
      version: 2,
      savedAt: new Date().toISOString(),
      machineKey: state.machineKey,
      bedWidth: state.bedWidth,
      bedHeight: state.bedHeight,
      snapMm: state.snapMm,
      laserSettings: state.laserSettings || getDefaultLaserSettings(),
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
