import { xToolLayerData, processingOrder } from './processing-order.js';
import { mapNodes, nodesBounds, nodesToPath } from './bezier.js';
const escapeXml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
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
  pathNodesInWorld,
  shapeToWorldPolygons,
  polygonsToSvgPath,
  computePolygonsBBox,
  createPathShapeFromPolygons,
  parseSvgPathToPolygons
} from './geometry.js';
import { resolveXcsBitmapMode } from './icons.js';
import { CUT_STAGES, getCutStage } from './cut-order.js';



// ============================================================================
// 1. BUILT-IN LASER MATERIAL PRESETS (POWER %, SPEED mm/s, PASSES, DPI/DENSITY)
// ============================================================================

export { LASER_MATERIAL_PRESETS, getDefaultLaserSettings } from './laser-settings.js';
import { LASER_MATERIAL_PRESETS, getDefaultLaserSettings } from './laser-settings.js';
export { saveWorkspaceToLocal, loadWorkspaceFromLocal } from './storage.js';

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
  const stagedCutPaths = new Map(CUT_STAGES.map(stage => [stage.id, []]));

  for (const s of exportable) {
    const safeName = escapeXml(s.name || s.type);

    if (s.type === 'image' && (s.dataUrl || s.srcDataUrl)) {
      const href = s.exportDataUrl || s.dataUrl || s.srcDataUrl;
      const rot = Number(s.rotation) || 0;
      const cx = roundMm((Number(s.x) || 0) + (Number(s.width) || 0) / 2, 3);
      const cy = roundMm((Number(s.y) || 0) + (Number(s.height) || 0) / 2, 3);
      const transforms = [];
      if (rot) transforms.push(`rotate(${roundMm(rot, 2)} ${cx} ${cy})`);
      if (s.flipX || s.flipY) transforms.push(`translate(${cx} ${cy}) scale(${s.flipX ? -1 : 1} ${s.flipY ? -1 : 1}) translate(${-cx} ${-cy})`);
      const tf = transforms.length ? ` transform="${transforms.join(' ')}"` : '';
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
      const stage = getCutStage(s);
      const paths = stage ? stagedCutPaths.get(stage.id) : cutPaths;
      const stageAttribute = stage ? ` data-cut-stage="${stage.id}"` : '';
      paths.push(
        `    <path id="${s.id}" data-name="${safeName}"${stageAttribute} d="${d}" fill="none" stroke="${stage?.color || '#FF0000'}" stroke-width="0.1" stroke-linecap="round" stroke-linejoin="round" />`
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

  for(const id of processingOrder(cfg)) {
    if(id==='engrave'){
      if(bitmapElements.length)lines.push('  <g id="Lag_0_Bitmap_Foto_Gravering">',...bitmapElements,'  </g>');
      if(engravePaths.length)lines.push('  <g id="Lag_1_Gravering_Engrave">',...engravePaths,'  </g>');
    }else if(id==='score'&&scorePaths.length)lines.push('  <g id="Lag_2_Linje_Score">',...scorePaths,'  </g>');
    else if(id==='cut'&&cutPaths.length)lines.push('  <g id="Lag_3_Kutt_Cut">',...cutPaths,'  </g>');
    else {const stage=CUT_STAGES.find(s=>s.id===id),paths=stagedCutPaths.get(id);if(paths?.length)lines.push(`  <g id="${id}" data-name="${escapeXml(stage.name)}">`,...paths,'  </g>');}
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
  targetMachine = null,
  bedWidth = 600,
  bedHeight = 400,
  onlySelected = false,
  selectedIds = new Set(),
  laserSettings = null,
  workDrawing = null
} = {}) {
  const cfg = laserSettings || getDefaultLaserSettings();
  const canvasId = makeUuidV4();
  const isF2 = (targetMachine || (machineKey === 'xtool-f2' ? 'xtool-f2' : 'xtool-p3')) === 'xtool-f2';

  // Official xTool Studio extId / deviceCode / mode identifiers (from xTool Studio ext.json & app.asar)
  const extId = isF2 ? 'GS009-CLASS-4' : 'P3';
  const extName = isF2 ? 'F2 Ultra UV' : 'P3';
  const deviceCode = isF2 ? 'GS009-CLASS-4' : 'ZY015';
  const deviceId = isF2 ? 'GS009-CLASS-4' : 'P3';
  const devicePower = isF2 ? [5] : [80, 5, 0];
  const activeMode = isF2 ? 'LASER_PLANE' : 'LIFTING_PLATFORM_PROCESS';

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

  const buildCutCustomize = (power, speed, repeat, airPump = 100) => isF2
    ? {
        power,
        speed,
        repeat,
        frequency: 40,
        wobbleEnable: false,
        wobbleDiameter: 0.05,
        wobbleSpacing: 0.015,
        enableKerf: false,
        kerfDistance: 0
      }
    : {
        power,
        speed,
        repeat,
        cuttingDrop: false,
        sinkingMethod: 'one',
        firstCuttingDropValue: 1,
        cuttingDropValue: 1,
        descentIntervalDescent: 1,
        descentPerStep: 1,
        enableBreakPoint: false,
        breakPointGenMode: 'auto',
        breakPointSize: 0.5,
        breakPointMode: 'count',
        breakPointCount: 2,
        breakPointDistance: 100,
        breakPointPower: 0,
        enableKerf: false,
        kerfDistance: 0,
        laser: 'LASER',
        processHead: 'LASER',
        enableOverCut: false,
        overCutDistance: 0.5,
        airPump,
        powerCutoff: 'FOLLOW_ACTUALLY_POWER',
        powerCutoffValue: 20
      };

  const buildScoreCustomize = (power, speed, repeat, airPump = 25) => isF2
    ? {
        power,
        speed,
        repeat,
        defocus: false,
        defocus_distance: 1,
        frequency: 40,
        enableKerf: false,
        kerfDistance: 0
      }
    : {
        power,
        speed,
        repeat,
        defocus: false,
        defocus_distance: 8,
        enableKerf: false,
        kerfDistance: 0,
        laser: 'LASER',
        processHead: 'LASER',
        airPump
      };

  const buildEngraveCustomize = (power, speed, repeat, density, bitmapScanMode = 'zMode', airPump = 25) => isF2
    ? {
        bitmapEngraveMode: 'normal',
        power,
        speed,
        repeat,
        density,
        dpi: 500,
        dotDuration: 100,
        defocus: false,
        defocus_distance: 1,
        bitmapScanMode,
        frequency: 40,
        scanAngle: 0,
        crossAngle: false,
        enableDelayPerLine: false,
        delayPerLine: 0.3,
        outlineTrace: false,
        needGapNumDensity: true
      }
    : {
        power,
        speed,
        repeat,
        density,
        defocus: false,
        defocus_distance: 8,
        laser: 'LASER',
        bitmapScanMode,
        processHead: 'LASER',
        airPump,
        enableKerf: false,
        kerfDistance: 0
      };

  const buildBitmapCustomize = ({
    power,
    speed,
    dpi,
    repeat = 1,
    bitmapMode = 'Jarvis',
    bitmapScanMode = 'zMode',
    airPump = 25,
    dotDuration = 200,
    frequency = 40,
    bitmapEngraveMode = 'dot'
  }) => {
    const exactMode = resolveXcsBitmapMode(bitmapMode, 'Jarvis');
    // In xTool P3, `density` is Lines Per Centimeter (LPC, 1..300), where 100 LPC = 254 DPI (1 inch = 2.54 cm)
    const densityLpc = clamp(Math.round(dpi / 2.54), 1, 300);

    return isF2
      ? {
          power,
          powerMinMaxRange: [1, power],
          speed,
          repeat,
          bitmapMode: exactMode,
          dpi,
          density: densityLpc,
          bitmapScanMode,
          bitmapEngraveMode,
          dotDuration,
          frequency
        }
      : {
          power,
          speed,
          repeat,
          bitmapMode: exactMode,
          density: densityLpc,
          dpi,
          laser: 'LASER',
          bitmapScanMode,
          processHead: 'LASER',
          airPump
        };
  };

  const convertShapeToDisplay = (s, groupTag = null) => {
    if (!s || s.hidden || s.laserMode === 'guide') return null;

    if (s.type === 'group' && Array.isArray(s.children)) {
      const grpUuid = `g-${makeUuidV4()}`;
      const childIds = [];
      for (const child of s.children) {
        const cid = convertShapeToDisplay(child, grpUuid);
        if (cid) childIds.push(cid);
      }
      if (childIds.length > 0) {
        groupData[grpUuid] = {
          groupName: s.name || 'Gruppe',
          groupTag: grpUuid,
          visible: true,
          enableTransform: true,
          zOrder: zOrder++,
          rotation: 0,
          containEls: childIds
        };
      }
      return null;
    }

    const dispId = makeUuidV4();

    // 1. BITMAP IMAGE ELEMENT
    if (s.type === 'image' && (s.dataUrl || s.srcDataUrl)) {
      const meta = s.imageMeta || {};
      // Use xcsDataUrl (masked/contrasted grayscale without double-dithering) when a hardware dither mode is active
      const base64 = s.xcsDataUrl || s.dataUrl || s.srcDataUrl;
      const x = roundMm(Number(s.x) || 0, 3);
      const y = roundMm(Number(s.y) || 0, 3);
      const w = roundMm(Math.max(1, Number(s.width) || 50), 3);
      const h = roundMm(Math.max(1, Number(s.height) || 50), 3);
      const angle = roundMm(Number(s.rotation) || 0, 2);

      const bmpPower = clamp(Number(cfg.bitmap?.power) || 32, 1, 100);
      const bmpSpeed = clamp(Number(cfg.bitmap?.speed) || 300, 1, 2000);
      const bmpDpi = clamp(Number(cfg.bitmap?.dpi) || 254, 50, 2000);
      const bmpRepeat = clamp(Number(cfg.bitmap?.repeat) || 1, 1, 10);
      const bmpScanMode = cfg.bitmap?.bitmapScanMode === 'oneWay' ? 'oneWay' : 'zMode';
      const bmpAirPump = clamp(Number(cfg.bitmap?.airPump) || 25, 10, 100);
      const bmpDotDuration = clamp(Number(cfg.bitmap?.dotDuration) || 200, 50, 3000);
      const bmpFrequency = clamp(Number(cfg.bitmap?.frequency) || 40, 40, 150);

      // Per-image filter overrides global bitmapMode if user picked a specific dithering/grayscale mode on the photo
      const rawImgMode = (meta.filter && meta.filter !== 'original' && meta.filter !== 'inherit')
        ? meta.filter
        : (cfg.bitmap?.bitmapMode || meta.bitmapMode || 'Jarvis');
      const bmpMode = resolveXcsBitmapMode(rawImgMode, resolveXcsBitmapMode(cfg.bitmap?.bitmapMode, 'Jarvis'));

      const bitmapDataBlock = {
        BITMAP_ENGRAVING: {
          materialType: 'customize',
          planType: 'official',
          parameter: {
            customize: buildBitmapCustomize({
              power: bmpPower,
              speed: bmpSpeed,
              dpi: bmpDpi,
              repeat: bmpRepeat,
              bitmapMode: bmpMode,
              bitmapScanMode: bmpScanMode,
              airPump: bmpAirPump,
              dotDuration: bmpDotDuration,
              frequency: bmpFrequency
            })
          }
        }
      };

      const originW = Math.max(16, Number(meta.originWidthPx) || Math.round(w * 10));
      const originH = Math.max(16, Number(meta.originHeightPx) || Math.round(h * 10));
      const sx = Number((w / originW).toFixed(6));
      const sy = Number((h / originH).toFixed(6));

      const dispObj = {
        id: dispId,
        name: s.name || 'Bitmap-bilde',
        type: 'BITMAP',
        x,
        y,
        width: w,
        height: h,
        angle,
        scale: { x: sx, y: sy },
        skew: { x: 0, y: 0 },
        localSkew: { x: 0, y: 0 },
        pivot: { x: 0, y: 0 },
        scaleX: sx,
        scaleY: sy,
        skewX: 0,
        skewY: 0,
        pivotX: 0,
        pivotY: 0,
        offsetX: x,
        offsetY: y,
        lockRatio: true,
        isClose: true,
        isClosePath: true,
        isFill: true,
        layerTag: layerColors.engrave,
        layerColor: layerColors.engrave,
        visible: true,
        visibleState: true,
        enableTransform: true,
        lockState: false,
        zOrder: zOrder++,
        groupTag: groupTag || '',
        groupTags: groupTag ? [groupTag] : [],
        base64,
        originWidth: originW,
        originHeight: originH,
        originSize: { width: originW, height: originH },
        filterList: [],
        grayValue: [0, 255],
        sharpness: 50,
        brightness: 0,
        contrast: 0,
        saturation: 0,
        temperature: 0,
        tone: 0,
        colorInverted: false,
        colorInvertedFillTransparent: false,
        colorInvertedTransparentColor: 'black',
        isGray: true,
        opacity: 1,
        processingType: 'BITMAP_ENGRAVING',
        processIgnore: false,
        data: bitmapDataBlock,
        bjornsveenShape: s
      };
      displays.push(dispObj);

      deviceDisplaysMap[dispId] = {
        type: 'BITMAP',
        isFill: true,
        isWhiteModel: true,
        processingType: 'BITMAP_ENGRAVING',
        processIgnore: false,
        data: bitmapDataBlock
      };
      return dispId;
    }

    // 2. VECTOR PATH ELEMENT (Cut, Score, Engrave)
    const loops = shapeToWorldPolygons(s, 0.15);
    if (!loops || loops.length === 0) return null;
    const bezierNodes = s.type === 'path' && s.nodeModel === 'bezier' && s.nodes?.length ? pathNodesInWorld(s) : null;
    const bbox = bezierNodes ? nodesBounds(bezierNodes, s.closedPath) : computePolygonsBBox(loops);

    // Localize dPath relative to (bbox.x, bbox.y) because xTool Studio translates PATH displays by (dispObj.x, dispObj.y)!
    const localLoops = loops.map(loop => {
      const shifted = loop.map(pt => ({
        x: pt.x - bbox.x,
        y: pt.y - bbox.y
      }));
      shifted.closed = loop.closed !== false;
      return shifted;
    });
    const dPath = bezierNodes ? nodesToPath(mapNodes(bezierNodes, p => ({x:p.x-bbox.x,y:p.y-bbox.y})), s.closedPath) : polygonsToSvgPath(localLoops, 3);
    if (!dPath) return null;

    const mode = s.laserMode || 'cut';
    const isFill = mode === 'engrave';
    const layerColor = getCutStage(s)?.color || layerColors[mode] || layerColors.cut;
    const procType = mode === 'engrave'
      ? 'FILL_VECTOR_ENGRAVING'
      : (mode === 'score' ? 'VECTOR_ENGRAVING' : 'VECTOR_CUTTING');

    const cutPower = clamp(Number(cfg.cut?.power) || 85, 1, 100);
    const cutSpeed = clamp(Number(cfg.cut?.speed) || 18, 1, 2000);
    const cutRepeat = clamp(Number(cfg.cut?.repeat) || 1, 1, 10);
    const cutAirPump = clamp(Number(cfg.cut?.airPump) || 100, 10, 100);

    const scorePower = clamp(Number(cfg.score?.power) || 18, 1, 100);
    const scoreSpeed = clamp(Number(cfg.score?.speed) || 160, 1, 2000);
    const scoreRepeat = clamp(Number(cfg.score?.repeat) || 1, 1, 10);
    const scoreAirPump = clamp(Number(cfg.score?.airPump) || 25, 10, 100);

    const engPower = clamp(Number(cfg.engrave?.power) || 30, 1, 100);
    const engSpeed = clamp(Number(cfg.engrave?.speed) || 350, 1, 2000);
    const engRepeat = clamp(Number(cfg.engrave?.repeat) || 1, 1, 10);
    const engDensity = clamp(Number(cfg.engrave?.density) || 100, 20, 400);
    const engScanMode = cfg.engrave?.bitmapScanMode === 'oneWay' ? 'oneWay' : 'zMode';
    const engAirPump = clamp(Number(cfg.engrave?.airPump) || 25, 10, 100);

    const vectorDataBlock = {
      VECTOR_CUTTING: {
        materialType: 'customize',
        planType: 'official',
        parameter: {
          customize: buildCutCustomize(cutPower, cutSpeed, cutRepeat, cutAirPump)
        }
      },
      VECTOR_ENGRAVING: {
        materialType: 'customize',
        planType: 'official',
        parameter: {
          customize: buildScoreCustomize(scorePower, scoreSpeed, scoreRepeat, scoreAirPump)
        }
      },
      FILL_VECTOR_ENGRAVING: {
        materialType: 'customize',
        planType: 'official',
        parameter: {
          customize: buildEngraveCustomize(engPower, engSpeed, engRepeat, engDensity, engScanMode, engAirPump)
        }
      }
    };

    const dispObj = {
      id: dispId,
      name: s.name || s.type,
      type: 'PATH',
      x: roundMm(bbox.x, 3),
      y: roundMm(bbox.y, 3),
      width: roundMm(Math.max(0.1, bbox.width), 3),
      height: roundMm(Math.max(0.1, bbox.height), 3),
      angle: 0,
      scale: { x: 1, y: 1 },
      skew: { x: 0, y: 0 },
      localSkew: { x: 0, y: 0 },
      pivot: { x: 0, y: 0 },
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      pivotX: 0,
      pivotY: 0,
      offsetX: roundMm(bbox.x, 3),
      offsetY: roundMm(bbox.y, 3),
      graphicX: roundMm(bbox.x, 3),
      graphicY: roundMm(bbox.y, 3),
      lockRatio: true,
      isClose: loops[0]?.closed !== false,
      isClosePath: loops[0]?.closed !== false,
      isFill,
      fillRule: 'evenodd',
      lineColor: layerColor,
      strokeColor: layerColor,
      fillColor: isFill ? layerColor : '#000000',
      layerTag: layerColor,
      layerColor,
      visible: true,
      visibleState: true,
      enableTransform: true,
      lockState: false,
      zOrder: zOrder++,
      groupTag: groupTag || '',
      groupTags: groupTag ? [groupTag] : [],
      dPath,
      points: [],
      processingType: procType,
      processIgnore: false,
      data: vectorDataBlock,
      bjornsveenShape: s
    };
    displays.push(dispObj);

    deviceDisplaysMap[dispId] = {
      type: 'PATH',
      isFill,
      isWhiteModel: true,
      processingType: procType,
      processIgnore: false,
      data: vectorDataBlock
    };

    return dispId;
  };

  const sourceList = onlySelected
    ? shapes.filter(s => selectedIds.has(s.id))
    : shapes;

  for (const s of sourceList) {
    convertShapeToDisplay(s, null);
  }

  const layerData=xToolLayerData(displays,cfg);

  const liftingPlatformModeData = {
    material: 0,
    thickness: Number(cfg.thicknessMm) || null,
    focalLength: null,
    perimeter: null,
    diameter: null,
    distence: null,
    isProcessByLayer: true,
    processPath: 'layer',
    pathPlanning: 'custom',
    fillPlanning: 'separate',
    scanDirection: 'topToBottom',
    enableOddEvenKerf: true
  };

  const laserPlaneModeData = {
    material: 0,
    lightSourceMode: isF2 ? 'uv' : 'blue',
    thickness: Number(cfg.thicknessMm) || null,
    isProcessByLayer: true,
    processPath: 'layer',
    pathPlanning: 'custom',
    fillPlanning: 'separate',
    dreedyTsp: false,
    avoidSmokeModal: false,
    scanDirection: 'topToBottom',
    enableOddEvenKerf: true
  };

  const xcsProject = {
    canvasId,
    extId,
    extName,
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
      id: deviceId,
      deviceCode,
      power: devicePower,
      data: {
        dataType: 'Map',
        value: [
          [
            canvasId,
            {
              mode: activeMode,
              data: {
                LIFTING_PLATFORM_PROCESS: liftingPlatformModeData,
                LASER_PLANE: laserPlaneModeData
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
      targetMachine: isF2 ? 'xtool-f2' : 'xtool-p3',
      bedWidth,
      bedHeight,
      laserSettings: cfg,
      shapes: sourceList,
      workDrawing
    }
  };

  return JSON.stringify(xcsProject, (key, value) => key.startsWith('_cached') || key === 'exportDataUrl' || key === 'xcsDataUrl' ? undefined : value, 2);
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
        targetMachine: data.bjornsveenProject.targetMachine || (data.bjornsveenProject.machineKey === 'xtool-f2' ? 'xtool-f2' : 'xtool-p3'),
        bedWidth: data.bjornsveenProject.bedWidth,
        bedHeight: data.bjornsveenProject.bedHeight,
        workDrawing: data.bjornsveenProject.workDrawing || null,
        laserSettings: data.bjornsveenProject.laserSettings || null
      };
    }

    // 2. Otherwise parse standard xTool Creative Space `canvas[0].displays`
    const firstCanvas = Array.isArray(data.canvas) ? data.canvas[0] : null;
    if (!firstCanvas || !Array.isArray(firstCanvas.displays)) {
      return null;
    }

    // Build device display processingType & parameter lookup if present
    const procTypeById = new Map();
    const procDataById = new Map();
    const devValue = data.device?.data?.value;
    if (Array.isArray(devValue) && devValue[0]?.[1]?.displays?.value) {
      for (const [did, dinfo] of devValue[0][1].displays.value) {
        if (dinfo) {
          if (dinfo.processingType) procTypeById.set(did, dinfo.processingType);
          if (dinfo.data) procDataById.set(did, dinfo.data);
        }
      }
    }

    const importedSettings = getDefaultLaserSettings();
    let foundAnyParam = false;

    const shapes = [];
    for (const disp of firstCanvas.displays) {
      if (!disp) continue;
      if (disp.bjornsveenShape) {
        shapes.push(disp.bjornsveenShape);
        continue;
      }

      const pType = disp.processingType || procTypeById.get(disp.id) || '';
      const pData = disp.data || procDataById.get(disp.id) || {};
      const lColor = String(disp.layerColor || disp.strokeColor || '').toLowerCase();

      // Extract parameters if present in xTool Studio display data
      const cust = pData?.[pType]?.parameter?.customize;
      if (cust) {
        foundAnyParam = true;
        if (pType === 'VECTOR_CUTTING') {
          importedSettings.cut.power = Number(cust.power) || importedSettings.cut.power;
          importedSettings.cut.speed = Number(cust.speed) || importedSettings.cut.speed;
          importedSettings.cut.repeat = Number(cust.repeat) || importedSettings.cut.repeat;
        } else if (pType === 'VECTOR_ENGRAVING') {
          importedSettings.score.power = Number(cust.power) || importedSettings.score.power;
          importedSettings.score.speed = Number(cust.speed) || importedSettings.score.speed;
          importedSettings.score.repeat = Number(cust.repeat) || importedSettings.score.repeat;
        } else if (pType === 'FILL_VECTOR_ENGRAVING') {
          importedSettings.engrave.power = Number(cust.power) || importedSettings.engrave.power;
          importedSettings.engrave.speed = Number(cust.speed) || importedSettings.engrave.speed;
          importedSettings.engrave.density = Number(cust.density) || importedSettings.engrave.density;
          importedSettings.engrave.repeat = Number(cust.repeat) || importedSettings.engrave.repeat;
        } else if (pType === 'BITMAP_ENGRAVING') {
          importedSettings.bitmap.power = Number(cust.power) || importedSettings.bitmap.power;
          importedSettings.bitmap.speed = Number(cust.speed) || importedSettings.bitmap.speed;
          importedSettings.bitmap.dpi = Number(cust.dpi) || (cust.density ? Math.round(Number(cust.density) * 2.54) : importedSettings.bitmap.dpi);
          if (cust.bitmapMode) importedSettings.bitmap.bitmapMode = resolveXcsBitmapMode(cust.bitmapMode, 'Jarvis');
        }
      }

      if (disp.type === 'BITMAP' && disp.base64) {
        const bmpCust = pData?.BITMAP_ENGRAVING?.parameter?.customize || {};
        const bmpMode = resolveXcsBitmapMode(bmpCust.bitmapMode || disp.filter || 'Jarvis', 'Jarvis');
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
          xcsDataUrl: disp.base64,
          imageMeta: {
            brightness: Number(disp.brightness) || 0,
            contrast: Number(disp.contrast) || 0,
            sharpness: Number(disp.sharpness ?? 50),
            filter: bmpMode,
            bitmapMode: bmpMode,
            threshold: 135,
            invert: Boolean(disp.colorInverted || disp.invert),
            removeWhiteBg: false,
            maskShape: 'rect',
            originWidthPx: Number(disp.originWidth) || 300,
            originHeightPx: Number(disp.originHeight) || 300
          }
        });
      } else if (disp.dPath) {
        const loops = parseSvgPathToPolygons(disp.dPath, 0.2);
        if (loops.length > 0) {
          let laserMode = 'cut';
          if (pType === 'FILL_VECTOR_ENGRAVING' || disp.isFill) {
            laserMode = 'engrave';
          } else if (pType === 'VECTOR_ENGRAVING' || lColor.includes('0000ff') || lColor.includes('00befe') || lColor.includes('2366ff')) {
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

    if (foundAnyParam) importedSettings.presetKey = 'custom';

    return {
      shapes,
      targetMachine: (String(data.extName || '').includes('F2') || String(data.extId || '').includes('GS009')) ? 'xtool-f2' : 'xtool-p3',
      laserSettings: foundAnyParam ? importedSettings : null
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

export { importSvgStringToShapes } from './svg-import.js';
