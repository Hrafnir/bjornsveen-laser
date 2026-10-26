// ============================================================================
// Bjørnsveen LaserStudio – 2D Geometry, SVG Path, Boolean & Offset Engine
// All coordinates are in exact millimeters (1 unit = 1.0 mm)
// ============================================================================

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function uid(prefix = 'obj') {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function roundMm(val, decimals = 2) {
  const f = Math.pow(10, decimals);
  return Math.round((Number(val) || 0) * f) / f;
}

/**
 * Evaluates mathematical expressions in input fields, e.g.:
 * "120 + 12mm", "360/6", "2.5 * 4", "(150 - 6) / 2", "12,5 + 3,5", or relative "+15", "*2".
 */
export function evalMathExpr(rawStr, fallbackVal = 0) {
  if (typeof rawStr === 'number') return isFinite(rawStr) ? rawStr : fallbackVal;
  let s = String(rawStr ?? '').trim();
  if (!s) return fallbackVal;

  // Convert Norwegian decimal comma to dot
  s = s.replace(/,/g, '.');
  // Convert "cm" to "*10" and strip "mm", "deg", "°", "%", "stk" (with or without space after number, e.g. "12mm")
  s = s.replace(/(\d+(?:\.\d+)?)\s*cm\b/gi, '($1*10)');
  s = s.replace(/(?:mm|deg|stk)\b/gi, '');
  s = s.replace(/[°%]/g, '').trim();

  // Relative expression starting with +, -, *, / (e.g. "+12" or "/2" relative to current value)
  if (/^[*/]/.test(s) && isFinite(fallbackVal)) {
    s = `${fallbackVal}${s}`;
  } else if (/^[+-]/.test(s) && /[+-/*]/.test(s.slice(1)) === false && isFinite(fallbackVal)) {
    // Plain number like "-5" or "+12": if user explicitly wrote "+12", treat as relative if fallback > 0?
    // Wait: if someone types "-15" for rotation or offset, negative numbers are normal.
    // So only treat "++12" or full expressions as math; "120 + 12" is handled below!
  }

  // Replace constants/functions
  s = s.replace(/\bpi\b/gi, String(Math.PI));

  // Safe recursive-descent math parser (+, -, *, /, ^, parentheses, unary +/-, sqrt/sin/cos/tan)
  let pos = 0;
  const skipWs = () => { while (pos < s.length && /\s/.test(s[pos])) pos++; };

  const parseExpr = () => {
    let val = parseTerm();
    while (true) {
      skipWs();
      if (s[pos] === '+') { pos++; val += parseTerm(); }
      else if (s[pos] === '-') { pos++; val -= parseTerm(); }
      else break;
    }
    return val;
  };

  const parseTerm = () => {
    let val = parsePower();
    while (true) {
      skipWs();
      if (s[pos] === '*') { pos++; val *= parsePower(); }
      else if (s[pos] === '/') {
        pos++;
        const d = parsePower();
        val = d === 0 ? 0 : val / d;
      } else break;
    }
    return val;
  };

  const parsePower = () => {
    let base = parseFactor();
    skipWs();
    if (s[pos] === '^') {
      pos++;
      base = Math.pow(base, parsePower());
    }
    return base;
  };

  const parseFactor = () => {
    skipWs();
    if (s[pos] === '+') { pos++; return parseFactor(); }
    if (s[pos] === '-') { pos++; return -parseFactor(); }
    if (s[pos] === '(') {
      pos++;
      const val = parseExpr();
      skipWs();
      if (s[pos] === ')') pos++;
      return val;
    }
    // Check named function (sqrt, sin, cos, tan)
    const fnMatch = s.slice(pos).match(/^(sqrt|sin|cos|tan)\s*\(/i);
    if (fnMatch) {
      const fn = fnMatch[1].toLowerCase();
      pos += fnMatch[0].length;
      const arg = parseExpr();
      skipWs();
      if (s[pos] === ')') pos++;
      if (fn === 'sqrt') return Math.sqrt(Math.max(0, arg));
      if (fn === 'sin') return Math.sin(arg * DEG2RAD);
      if (fn === 'cos') return Math.cos(arg * DEG2RAD);
      if (fn === 'tan') return Math.tan(arg * DEG2RAD);
    }
    const numMatch = s.slice(pos).match(/^(?:\d+(?:\.\d+)?|\.\d+)/);
    if (numMatch) {
      pos += numMatch[0].length;
      return parseFloat(numMatch[0]);
    }
    return NaN;
  };

  const result = parseExpr();
  skipWs();
  if (!isFinite(result) || pos < s.length) {
    const simple = parseFloat(s);
    return isFinite(simple) ? simple : fallbackVal;
  }
  return result;
}

export function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function rotatePoint(pt, center, angleDeg) {
  if (!angleDeg) return { x: pt.x, y: pt.y };
  const rad = angleDeg * DEG2RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = pt.x - center.x;
  const dy = pt.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  };
}

// ============================================================================
// 1. SHAPE -> LOCAL / WORLD POLYGONS & SVG PATH ("d")
// ============================================================================

/**
 * Generates local-space closed/open polygon loops for any shape before rotation,
 * within bounding box [shape.x, shape.y, shape.width, shape.height].
 */
export function shapeToLocalPolygons(shape, curveToleranceMm = 0.2) {
  const x = Number(shape.x) || 0;
  const y = Number(shape.y) || 0;
  const w = Math.max(0.1, Number(shape.width) || 10);
  const h = Math.max(0.1, Number(shape.height) || 10);
  const cx = x + w / 2;
  const cy = y + h / 2;

  switch (shape.type) {
    case 'rect': {
      const rx = clamp(Number(shape.rx) || 0, 0, Math.min(w, h) / 2);
      if (rx <= 0.05) {
        return [[
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h }
        ]];
      }
      // Rounded rectangle sampled smoothly at corners
      const pts = [];
      const steps = clamp(Math.ceil((Math.PI * rx * 0.5) / curveToleranceMm), 8, 36);
      const corners = [
        { cx: x + w - rx, cy: y + rx, startAngle: -Math.PI / 2, endAngle: 0 },
        { cx: x + w - rx, cy: y + h - rx, startAngle: 0, endAngle: Math.PI / 2 },
        { cx: x + rx, cy: y + h - rx, startAngle: Math.PI / 2, endAngle: Math.PI },
        { cx: x + rx, cy: y + rx, startAngle: Math.PI, endAngle: Math.PI * 1.5 }
      ];
      for (const c of corners) {
        for (let i = 0; i <= steps; i++) {
          const a = c.startAngle + (c.endAngle - c.startAngle) * (i / steps);
          pts.push({ x: c.cx + Math.cos(a) * rx, y: c.cy + Math.sin(a) * rx });
        }
      }
      return [pts];
    }

    case 'ellipse': {
      const rx = w / 2;
      const ry = h / 2;
      const circumference = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
      const steps = clamp(Math.ceil(circumference / curveToleranceMm), 24, 180);
      const pts = [];
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
      }
      return [pts];
    }

    case 'polygon': {
      const sides = clamp(Math.round(Number(shape.sides) || 6), 3, 60);
      const rx = w / 2;
      const ry = h / 2;
      const pts = [];
      for (let i = 0; i < sides; i++) {
        const a = -Math.PI / 2 + (i / sides) * Math.PI * 2;
        pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
      }
      return [pts];
    }

    case 'star': {
      const points = clamp(Math.round(Number(shape.sides) || 5), 3, 40);
      const innerRatio = clamp((Number(shape.innerRatio) || 42) / 100, 0.1, 0.9);
      const rx = w / 2;
      const ry = h / 2;
      const pts = [];
      for (let i = 0; i < points * 2; i++) {
        const rFactor = i % 2 === 0 ? 1 : innerRatio;
        const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
        pts.push({
          x: cx + Math.cos(a) * rx * rFactor,
          y: cy + Math.sin(a) * ry * rFactor
        });
      }
      return [pts];
    }

    case 'heart': {
      const pts = [];
      const steps = 64;
      for (let i = 0; i < steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        // Parametric heart normalized to [-1, 1]
        const hx = Math.pow(Math.sin(t), 3);
        const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
        // Normalize bounds: hx in [-1, 1], hy in [-0.75, 1.06]
        const nx = (hx + 1) / 2;
        const ny = (hy + 0.75) / 1.81;
        pts.push({ x: x + nx * w, y: y + ny * h });
      }
      return [pts];
    }

    case 'line': {
      const x1 = shape.x1 !== undefined ? Number(shape.x1) : x;
      const y1 = shape.y1 !== undefined ? Number(shape.y1) : y;
      const x2 = shape.x2 !== undefined ? Number(shape.x2) : x + w;
      const y2 = shape.y2 !== undefined ? Number(shape.y2) : y + h;

      if (shape.curved && shape.cx !== undefined && shape.cy !== undefined) {
        // Quadratic Bezier passing directly through (shape.cx, shape.cy) at t = 0.5
        const mx = Number(shape.cx);
        const my = Number(shape.cy);
        const ctrlX = 2 * mx - 0.5 * (x1 + x2);
        const ctrlY = 2 * my - 0.5 * (y1 + y2);
        const approxLen = Math.hypot(mx - x1, my - y1) + Math.hypot(x2 - mx, y2 - my);
        const steps = clamp(Math.ceil(approxLen / curveToleranceMm), 12, 96);
        const loop = [];
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const mt = 1 - t;
          loop.push({
            x: mt * mt * x1 + 2 * mt * t * ctrlX + t * t * x2,
            y: mt * mt * y1 + 2 * mt * t * ctrlY + t * t * y2
          });
        }
        loop.closed = false;
        return [loop];
      }

      const loop = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
      loop.closed = false;
      return [loop];
    }

    case 'path':
    case 'text': {
      if (shape.d) {
        if (shape._cachedD !== shape.d || !shape._cachedRawLoops) {
          Object.defineProperty(shape, '_cachedD', { value: shape.d, enumerable: false, writable: true });
          Object.defineProperty(shape, '_cachedRawLoops', {
            value: parseSvgPathToPolygons(shape.d, curveToleranceMm),
            enumerable: false,
            writable: true
          });
        }
        return transformRawLoopsToShapeBox(shape._cachedRawLoops, shape);
      }
      return [];
    }

    case 'image': {
      const mask = shape.imageMeta?.maskShape || 'rect';
      if (mask === 'circle') {
        return shapeToLocalPolygons({ ...shape, type: 'ellipse' }, curveToleranceMm);
      }
      if (mask === 'rounded') {
        return shapeToLocalPolygons({ ...shape, type: 'rect', rx: Math.min(w, h) * 0.16 }, curveToleranceMm);
      }
      if (mask === 'heart') {
        return shapeToLocalPolygons({ ...shape, type: 'heart' }, curveToleranceMm);
      }
      if (mask === 'star') {
        return shapeToLocalPolygons({ ...shape, type: 'star', sides: 5, innerRatio: 45 }, curveToleranceMm);
      }
      return [[
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h }
      ]];
    }

    case 'group': {
      if (!Array.isArray(shape.children)) return [];
      const all = [];
      for (const child of shape.children) {
        const childLoops = shapeToWorldPolygons(child, curveToleranceMm);
        all.push(...childLoops);
      }
      return all;
    }

    default:
      return [];
  }
}

/**
 * Scales/translates normalized or original-bbox path loops into current shape's [x, y, width, height]
 */
function transformRawLoopsToShapeBox(rawLoops, shape) {
  if (!rawLoops || rawLoops.length === 0) return [];
  const origBox = shape.origBBox || computePolygonsBBox(rawLoops);
  const ow = Math.max(0.001, origBox.width);
  const oh = Math.max(0.001, origBox.height);
  const sx = (Number(shape.width) || ow) / ow;
  const sy = (Number(shape.height) || oh) / oh;
  const tx = Number(shape.x) || 0;
  const ty = Number(shape.y) || 0;
  const flipX = Boolean(shape.flipX);
  const flipY = Boolean(shape.flipY);

  return rawLoops.map(loop => {
    const out = loop.map(pt => {
      let nx = (pt.x - origBox.x) / ow;
      let ny = (pt.y - origBox.y) / oh;
      if (flipX) nx = 1 - nx;
      if (flipY) ny = 1 - ny;
      return {
        x: tx + nx * ow * sx,
        y: ty + ny * oh * sy
      };
    });
    out.closed = loop.closed !== false;
    return out;
  });
}

/**
 * Returns polygons in world space (including shape rotation around its center).
 */
export function shapeToWorldPolygons(shape, curveToleranceMm = 0.2) {
  const localLoops = shapeToLocalPolygons(shape, curveToleranceMm);
  const rot = Number(shape.rotation) || 0;
  if (!rot || shape.type === 'group') return localLoops;

  const cx = (Number(shape.x) || 0) + (Number(shape.width) || 0) / 2;
  const cy = (Number(shape.y) || 0) + (Number(shape.height) || 0) / 2;
  const center = { x: cx, y: cy };

  return localLoops.map(loop => {
    const rotated = loop.map(pt => rotatePoint(pt, center, rot));
    rotated.closed = loop.closed !== false;
    return rotated;
  });
}

/**
 * Converts polygons back into a clean SVG `d` path string.
 */
export function polygonsToSvgPath(loops, decimals = 2) {
  if (!loops || loops.length === 0) return '';
  const parts = [];
  for (const loop of loops) {
    if (!loop || loop.length < 2) continue;
    const cmds = [`M ${roundMm(loop[0].x, decimals)} ${roundMm(loop[0].y, decimals)}`];
    for (let i = 1; i < loop.length; i++) {
      cmds.push(`L ${roundMm(loop[i].x, decimals)} ${roundMm(loop[i].y, decimals)}`);
    }
    if (loop.closed !== false) {
      cmds.push('Z');
    }
    parts.push(cmds.join(' '));
  }
  return parts.join(' ');
}

/**
 * Converts any shape to its world-space SVG `d` string.
 */
export function shapeToWorldSvgPath(shape) {
  const loops = shapeToWorldPolygons(shape, 0.15);
  return polygonsToSvgPath(loops, 3);
}

/**
 * Computes axis-aligned bounding box of a list of polygon loops.
 */
export function computePolygonsBBox(loops) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const loop of loops) {
    for (const pt of loop) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  if (!isFinite(minX)) {
    return { x: 0, y: 0, width: 10, height: 10 };
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0.1, maxX - minX),
    height: Math.max(0.1, maxY - minY)
  };
}

/**
 * Computes bounding box of one or more shapes in world coordinates.
 */
export function getShapesBBox(shapes) {
  if (!shapes || shapes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    const loops = shapeToWorldPolygons(s, 0.35);
    const b = computePolygonsBBox(loops);
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  }
  if (!isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Creates a normalized `path` shape from world-space polygon loops.
 */
export function createPathShapeFromPolygons(loops, laserMode = 'cut', name = 'Vektorform') {
  const cleanLoops = loops.filter(l => l && l.length >= 2);
  const bbox = computePolygonsBBox(cleanLoops);
  const d = polygonsToSvgPath(cleanLoops, 3);
  return {
    id: uid('path'),
    type: 'path',
    name,
    laserMode,
    x: roundMm(bbox.x, 2),
    y: roundMm(bbox.y, 2),
    width: roundMm(bbox.width, 2),
    height: roundMm(bbox.height, 2),
    rotation: 0,
    flipX: false,
    flipY: false,
    d,
    origBBox: { ...bbox }
  };
}

/**
 * Updates a line shape's x, y, width, height from its x1, y1, x2, y2 (and optional curve midpoint cx, cy).
 */
export function syncLineBBox(s) {
  if (!s || s.type !== 'line') return s;
  if (!s.curved || s.cx === undefined || s.cy === undefined) {
    s.x = roundMm(Math.min(s.x1, s.x2), 2);
    s.y = roundMm(Math.min(s.y1, s.y2), 2);
    s.width = roundMm(Math.max(0.2, Math.abs(s.x2 - s.x1)), 2);
    s.height = roundMm(Math.max(0.2, Math.abs(s.y2 - s.y1)), 2);
  } else {
    const loops = shapeToLocalPolygons(s, 0.25);
    const b = computePolygonsBBox(loops);
    s.x = roundMm(b.x, 2);
    s.y = roundMm(b.y, 2);
    s.width = roundMm(Math.max(0.2, b.width), 2);
    s.height = roundMm(Math.max(0.2, b.height), 2);
  }
  return s;
}

/**
 * Builds a smooth Catmull-Rom / Cubic Bezier spline passing through `nodes`.
 */
export function buildSmoothSplineLoop(nodes, closed = false, stepMm = 0.25) {
  if (!nodes || nodes.length < 2) return [];
  if (nodes.length === 2) {
    const l = [{ x: nodes[0].x, y: nodes[0].y }, { x: nodes[1].x, y: nodes[1].y }];
    l.closed = closed;
    return l;
  }

  const pts = [];
  const n = nodes.length;
  const segCount = closed ? n : n - 1;
  const tension = 0.5;

  for (let i = 0; i < segCount; i++) {
    const p0 = closed ? nodes[(i - 1 + n) % n] : nodes[Math.max(0, i - 1)];
    const p1 = nodes[i];
    const p2 = nodes[(i + 1) % n];
    const p3 = closed ? nodes[(i + 2) % n] : nodes[Math.min(n - 1, i + 2)];

    const c1x = p1.x + ((p2.x - p0.x) * tension) / 3;
    const c1y = p1.y + ((p2.y - p0.y) * tension) / 3;
    const c2x = p2.x - ((p3.x - p1.x) * tension) / 3;
    const c2y = p2.y - ((p3.y - p1.y) * tension) / 3;

    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = clamp(Math.ceil(segLen / stepMm), 8, 48);
    if (i === 0) pts.push({ x: p1.x, y: p1.y });
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const mt = 1 - t;
      pts.push({
        x: mt * mt * mt * p1.x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * p2.x,
        y: mt * mt * mt * p1.y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * p2.y
      });
    }
  }
  pts.closed = closed;
  return pts;
}

/**
 * Rebuilds a `path` shape from its `shape.nodes` array, honoring `shape.curved` (smooth spline vs sharp polyline).
 */
export function rebuildPathShapeFromNodes(shape) {
  if (!shape || !Array.isArray(shape.nodes) || shape.nodes.length < 2) return shape;
  const closed = Boolean(shape.closedPath);
  const loop = shape.curved
    ? buildSmoothSplineLoop(shape.nodes, closed, 0.2)
    : shape.nodes.map(p => ({ x: p.x, y: p.y }));
  loop.closed = closed;

  const bbox = computePolygonsBBox([loop]);
  shape.d = polygonsToSvgPath([loop], 3);
  shape._cachedD = null;
  shape._cachedRawLoops = null;
  shape.x = roundMm(bbox.x, 2);
  shape.y = roundMm(bbox.y, 2);
  shape.width = roundMm(bbox.width, 2);
  shape.height = roundMm(bbox.height, 2);
  shape.origBBox = { ...bbox };
  return shape;
}

// ============================================================================
// 2. COMPLETE SVG PATH ("d") PARSER (M, L, H, V, C, S, Q, T, A, Z)
// ============================================================================

export function parseSvgPathToPolygons(dStr, stepMm = 0.25) {
  if (!dStr || typeof dStr !== 'string') return [];
  const tokens = dStr.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g);
  if (!tokens) return [];

  const loops = [];
  let current = [];
  let curX = 0, curY = 0;
  let startX = 0, startY = 0;
  let prevCtrlX = 0, prevCtrlY = 0;
  let i = 0;
  let cmd = '';

  const nextNum = () => parseFloat(tokens[i++]);
  const hasMoreNums = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]);

  const pushPt = (x, y) => {
    if (current.length === 0 || Math.hypot(x - current[current.length - 1].x, y - current[current.length - 1].y) > 1e-4) {
      current.push({ x, y });
    }
  };

  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) {
      cmd = tokens[i++];
    }
    const isRel = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();

    if (upper === 'M') {
      if (current.length >= 2) loops.push(current);
      current = [];
      current.closed = false;
      const nx = nextNum() + (isRel ? curX : 0);
      const ny = nextNum() + (isRel ? curY : 0);
      curX = startX = nx;
      curY = startY = ny;
      pushPt(curX, curY);
      while (hasMoreNums()) {
        const lx = nextNum() + (isRel ? curX : 0);
        const ly = nextNum() + (isRel ? curY : 0);
        curX = lx;
        curY = ly;
        pushPt(curX, curY);
      }
      prevCtrlX = curX;
      prevCtrlY = curY;
    } else if (upper === 'L') {
      while (hasMoreNums()) {
        const lx = nextNum() + (isRel ? curX : 0);
        const ly = nextNum() + (isRel ? curY : 0);
        curX = lx;
        curY = ly;
        pushPt(curX, curY);
      }
      prevCtrlX = curX;
      prevCtrlY = curY;
    } else if (upper === 'H') {
      while (hasMoreNums()) {
        curX = nextNum() + (isRel ? curX : 0);
        pushPt(curX, curY);
      }
      prevCtrlX = curX;
      prevCtrlY = curY;
    } else if (upper === 'V') {
      while (hasMoreNums()) {
        curY = nextNum() + (isRel ? curY : 0);
        pushPt(curX, curY);
      }
      prevCtrlX = curX;
      prevCtrlY = curY;
    } else if (upper === 'C') {
      while (hasMoreNums()) {
        const x1 = nextNum() + (isRel ? curX : 0);
        const y1 = nextNum() + (isRel ? curY : 0);
        const x2 = nextNum() + (isRel ? curX : 0);
        const y2 = nextNum() + (isRel ? curY : 0);
        const x = nextNum() + (isRel ? curX : 0);
        const y = nextNum() + (isRel ? curY : 0);
        const approxLen = Math.hypot(x1 - curX, y1 - curY) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x - x2, y - y2);
        const steps = clamp(Math.ceil(approxLen / stepMm), 4, 64);
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const mt = 1 - t;
          const px = mt * mt * mt * curX + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x;
          const py = mt * mt * mt * curY + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y;
          pushPt(px, py);
        }
        prevCtrlX = x2;
        prevCtrlY = y2;
        curX = x;
        curY = y;
      }
    } else if (upper === 'S') {
      while (hasMoreNums()) {
        const x1 = 2 * curX - prevCtrlX;
        const y1 = 2 * curY - prevCtrlY;
        const x2 = nextNum() + (isRel ? curX : 0);
        const y2 = nextNum() + (isRel ? curY : 0);
        const x = nextNum() + (isRel ? curX : 0);
        const y = nextNum() + (isRel ? curY : 0);
        const approxLen = Math.hypot(x1 - curX, y1 - curY) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x - x2, y - y2);
        const steps = clamp(Math.ceil(approxLen / stepMm), 4, 64);
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const mt = 1 - t;
          const px = mt * mt * mt * curX + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x;
          const py = mt * mt * mt * curY + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y;
          pushPt(px, py);
        }
        prevCtrlX = x2;
        prevCtrlY = y2;
        curX = x;
        curY = y;
      }
    } else if (upper === 'Q') {
      while (hasMoreNums()) {
        const x1 = nextNum() + (isRel ? curX : 0);
        const y1 = nextNum() + (isRel ? curY : 0);
        const x = nextNum() + (isRel ? curX : 0);
        const y = nextNum() + (isRel ? curY : 0);
        const approxLen = Math.hypot(x1 - curX, y1 - curY) + Math.hypot(x - x1, y - y1);
        const steps = clamp(Math.ceil(approxLen / stepMm), 4, 48);
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const mt = 1 - t;
          const px = mt * mt * curX + 2 * mt * t * x1 + t * t * x;
          const py = mt * mt * curY + 2 * mt * t * y1 + t * t * y;
          pushPt(px, py);
        }
        prevCtrlX = x1;
        prevCtrlY = y1;
        curX = x;
        curY = y;
      }
    } else if (upper === 'A') {
      while (hasMoreNums()) {
        const rx = Math.abs(nextNum());
        const ry = Math.abs(nextNum());
        const xAxisRotation = nextNum();
        const largeArcFlag = nextNum();
        const sweepFlag = nextNum();
        const x = nextNum() + (isRel ? curX : 0);
        const y = nextNum() + (isRel ? curY : 0);
        const arcPts = sampleSvgArc(curX, curY, rx, ry, xAxisRotation, largeArcFlag, sweepFlag, x, y, stepMm);
        for (const p of arcPts) pushPt(p.x, p.y);
        curX = x;
        curY = y;
      }
    } else if (upper === 'Z') {
      current.closed = true;
      if (current.length > 2 && Math.hypot(current[0].x - current[current.length - 1].x, current[0].y - current[current.length - 1].y) < 1e-3) {
        current.pop();
      }
      if (current.length >= 2) {
        loops.push(current);
      }
      current = [];
      curX = startX;
      curY = startY;
    } else {
      i++;
    }
  }

  if (current.length >= 2) {
    loops.push(current);
  }
  return loops;
}

function sampleSvgArc(x1, y1, rx, ry, angleDeg, largeArcFlag, sweepFlag, x2, y2, stepMm) {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) {
    return [{ x: x2, y: y2 }];
  }
  const phi = angleDeg * DEG2RAD;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  let rxSq = rx * rx;
  let rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  const radicand = x1pSq / rxSq + y1pSq / rySq;
  if (radicand > 1) {
    const scale = Math.sqrt(radicand);
    rx *= scale;
    ry *= scale;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  const sign = largeArcFlag === sweepFlag ? -1 : 1;
  const num = Math.max(0, rxSq * rySq - rxSq * y1pSq - rySq * x1pSq);
  const den = rxSq * y1pSq + rySq * x1pSq;
  const coef = sign * Math.sqrt(den === 0 ? 0 : num / den);
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const vecAngle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const ang = Math.acos(clamp(dot / (len || 1), -1, 1));
    return ux * vy - uy * vx < 0 ? -ang : ang;
  };

  const theta1 = vecAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = vecAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweepFlag && dTheta > 0) dTheta -= Math.PI * 2;
  if (sweepFlag && dTheta < 0) dTheta += Math.PI * 2;

  const arcLen = Math.abs(dTheta) * Math.max(rx, ry);
  const steps = clamp(Math.ceil(arcLen / stepMm), 6, 90);
  const pts = [];
  for (let s = 1; s <= steps; s++) {
    const a = theta1 + (dTheta * s) / steps;
    const px = cosPhi * rx * Math.cos(a) - sinPhi * ry * Math.sin(a) + cx;
    const py = sinPhi * rx * Math.cos(a) + cosPhi * ry * Math.sin(a) + cy;
    pts.push({ x: px, y: py });
  }
  return pts;
}

// ============================================================================
// 3. EXACT ANALYTICAL 2D BOOLEAN ENGINE (UNION, SUBTRACT, INTERSECT)
//    Works on arbitrary multi-polygons with holes!
// ============================================================================

/**
 * Even-odd point-in-multipolygon test.
 */
export function pointInMultiPolygon(pt, loops) {
  let inside = false;
  const px = pt.x;
  const py = pt.y;
  for (const loop of loops) {
    if (!loop || loop.length < 3) continue;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const xi = loop[i].x, yi = loop[i].y;
      const xj = loop[j].x, yj = loop[j].y;
      if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/**
 * Computes intersection parameters (tA, tB) in [0, 1] between segment A(p1->p2) and B(p3->p4).
 */
function intersectSegments(p1, p2, p3, p4) {
  const rX = p2.x - p1.x;
  const rY = p2.y - p1.y;
  const sX = p4.x - p3.x;
  const sY = p4.y - p3.y;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-10) return null;
  const qpX = p3.x - p1.x;
  const qpY = p3.y - p1.y;
  const t = (qpX * sY - qpY * sX) / denom;
  const u = (qpX * rY - qpY * rX) / denom;
  const eps = 1e-7;
  if (t >= -eps && t <= 1 + eps && u >= -eps && u <= 1 + eps) {
    return {
      t: clamp(t, 0, 1),
      u: clamp(u, 0, 1)
    };
  }
  return null;
}

function loopsToEdges(loops) {
  const edges = [];
  for (const loop of loops) {
    if (!loop || loop.length < 2) continue;
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % n];
      if (Math.hypot(b.x - a.x, b.y - a.y) > 1e-5) {
        edges.push({
          a,
          b,
          minX: Math.min(a.x, b.x),
          maxX: Math.max(a.x, b.x),
          minY: Math.min(a.y, b.y),
          maxY: Math.max(a.y, b.y),
          splits: [0, 1]
        });
      }
    }
  }
  return edges;
}

/**
 * Performs boolean operation ('union' | 'subtract' | 'intersect') between two multi-polygons.
 */
export function booleanMultiPolygons(loopsA, loopsB, op = 'union') {
  const edgesA = loopsToEdges(loopsA);
  const edgesB = loopsToEdges(loopsB);
  const allEdges = [...edgesA, ...edgesB];

  // Find all intersections between all pairs of edges
  for (let i = 0; i < allEdges.length; i++) {
    const e1 = allEdges[i];
    for (let j = i + 1; j < allEdges.length; j++) {
      const e2 = allEdges[j];
      if (e1.maxX < e2.minX - 1e-5 || e1.minX > e2.maxX + 1e-5 ||
          e1.maxY < e2.minY - 1e-5 || e1.minY > e2.maxY + 1e-5) {
        continue;
      }
      const hit = intersectSegments(e1.a, e1.b, e2.a, e2.b);
      if (hit) {
        e1.splits.push(hit.t);
        e2.splits.push(hit.u);
      }
    }
  }

  const evalOp = (inA, inB) => {
    if (op === 'union') return inA || inB;
    if (op === 'subtract') return inA && !inB;
    if (op === 'intersect') return inA && inB;
    return inA || inB;
  };

  // Split into elementary sub-segments and classify left/right sides
  const keptSegments = [];
  const seenMidKeys = new Set();

  for (const e of allEdges) {
    e.splits.sort((a, b) => a - b);
    const uniqueT = [0];
    for (let k = 0; k < e.splits.length; k++) {
      const tVal = clamp(e.splits[k], 0, 1);
      if (tVal - uniqueT[uniqueT.length - 1] > 1e-6) {
        uniqueT.push(tVal);
      }
    }
    if (1 - uniqueT[uniqueT.length - 1] > 1e-6) {
      uniqueT.push(1);
    } else {
      uniqueT[uniqueT.length - 1] = 1;
    }

    const dx = e.b.x - e.a.x;
    const dy = e.b.y - e.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-5) continue;
    const nx = -dy / len;
    const ny = dx / len;
    const eps = 1e-3; // 0.001 mm normal probe offset

    for (let k = 0; k < uniqueT.length - 1; k++) {
      const t0 = uniqueT[k];
      const t1 = uniqueT[k + 1];
      if ((t1 - t0) * len < 1e-5) continue;
      const p0 = { x: e.a.x + dx * t0, y: e.a.y + dy * t0 };
      const p1 = { x: e.a.x + dx * t1, y: e.a.y + dy * t1 };
      const midX = (p0.x + p1.x) * 0.5;
      const midY = (p0.y + p1.y) * 0.5;

      // Deduplicate identical overlapping segments
      const midKey = `${Math.round(midX * 2000)}_${Math.round(midY * 2000)}`;
      if (seenMidKeys.has(midKey)) continue;

      const leftPt = { x: midX + nx * eps, y: midY + ny * eps };
      const rightPt = { x: midX - nx * eps, y: midY - ny * eps };

      const leftIn = evalOp(pointInMultiPolygon(leftPt, loopsA), pointInMultiPolygon(leftPt, loopsB));
      const rightIn = evalOp(pointInMultiPolygon(rightPt, loopsA), pointInMultiPolygon(rightPt, loopsB));

      if (leftIn !== rightIn) {
        seenMidKeys.add(midKey);
        // Orient segment so interior is consistently on the left
        if (leftIn) {
          keptSegments.push({ a: p0, b: p1, used: false });
        } else {
          keptSegments.push({ a: p1, b: p0, used: false });
        }
      }
    }
  }

  return chainDirectedSegmentsToPolygons(keptSegments);
}

/**
 * Chains directed boundary segments head-to-tail into closed polygon loops,
 * using an O(N) spatial hash grid for instant lookup even on large contours.
 */
function chainDirectedSegmentsToPolygons(segments) {
  const loops = [];
  if (!segments || segments.length === 0) return loops;
  const snapTol = 0.04; // 0.04 mm vertex snap tolerance
  const cellSize = snapTol * 2;

  // Build spatial hash map of segment start points (seg.a)
  const buckets = new Map();
  const cellKey = (x, y) => `${Math.floor(x / cellSize)}_${Math.floor(y / cellSize)}`;

  for (let i = 0; i < segments.length; i++) {
    segments[i].used = false;
    const key = cellKey(segments[i].a.x, segments[i].a.y);
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(i);
  }

  for (let i = 0; i < segments.length; i++) {
    if (segments[i].used) continue;
    segments[i].used = true;
    const loop = [segments[i].a, segments[i].b];

    let closed = false;
    while (!closed) {
      const tail = loop[loop.length - 1];
      if (loop.length >= 3 && Math.hypot(tail.x - loop[0].x, tail.y - loop[0].y) <= snapTol) {
        loop.pop();
        closed = true;
        break;
      }

      const cx = Math.floor(tail.x / cellSize);
      const cy = Math.floor(tail.y / cellSize);
      let bestIdx = -1;
      let bestDist = snapTol;

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const arr = buckets.get(`${cx + dx}_${cy + dy}`);
          if (!arr) continue;
          for (let k = 0; k < arr.length; k++) {
            const j = arr[k];
            if (segments[j].used) continue;
            const d = Math.hypot(segments[j].a.x - tail.x, segments[j].a.y - tail.y);
            if (d < bestDist) {
              bestDist = d;
              bestIdx = j;
            }
          }
        }
      }

      // Fallback search with slightly wider tolerance if a vertex has micro-gap
      if (bestIdx === -1) {
        let fallbackDist = 0.2;
        for (let j = 0; j < segments.length; j++) {
          if (segments[j].used) continue;
          const d = Math.hypot(segments[j].a.x - tail.x, segments[j].a.y - tail.y);
          if (d < fallbackDist) {
            fallbackDist = d;
            bestIdx = j;
          }
        }
      }

      if (bestIdx !== -1) {
        segments[bestIdx].used = true;
        loop.push(segments[bestIdx].b);
      } else {
        break;
      }
    }

    if (loop.length >= 3) {
      const simplified = simplifyRdpPolygon(loop, 0.012);
      if (simplified.length >= 3) {
        simplified.closed = true;
        loops.push(simplified);
      }
    }
  }
  return loops;
}

/**
 * Performs boolean operation across an array of shapes.
 */
export function performBooleanOnShapes(shapes, op = 'union') {
  if (!shapes || shapes.length < 2) return null;
  let accLoops = shapeToWorldPolygons(shapes[0], 0.15);
  for (let i = 1; i < shapes.length; i++) {
    const nextLoops = shapeToWorldPolygons(shapes[i], 0.15);
    accLoops = booleanMultiPolygons(accLoops, nextLoops, op);
    if (!accLoops || accLoops.length === 0) break;
  }
  if (!accLoops || accLoops.length === 0) return null;

  const opNames = {
    union: 'Sammenslått form',
    subtract: 'Utstanset form',
    intersect: 'Snittform'
  };
  return createPathShapeFromPolygons(accLoops, shapes[0].laserMode || 'cut', opNames[op] || 'Kombinert form');
}

// ============================================================================
// 4. OFFSET / CONTOUR ENGINE (Subpixel Signed-Distance Marching Squares)
//    Creates smooth outer/inner cut contours around any shape or group!
// ============================================================================

function pointToSegmentDistSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (px - ax) * (px - ax) + (py - ay) * (py - ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return (px - projX) * (px - projX) + (py - projY) * (py - projY);
}

/**
 * Generates an offset outline shape at `offsetMm` distance around `shapes`.
 * Positive `offsetMm` = outer contour, Negative `offsetMm` = inner inset contour.
 */
export function createOffsetContour(shapes, offsetMm = 3.0, laserMode = 'cut') {
  if (!shapes || shapes.length === 0) return null;
  const allLoops = [];
  for (const s of shapes) {
    allLoops.push(...shapeToWorldPolygons(s, 0.2));
  }
  if (allLoops.length === 0) return null;

  const bbox = computePolygonsBBox(allLoops);
  const pad = Math.max(Math.abs(offsetMm) + 4, 6);
  const minX = bbox.x - pad;
  const minY = bbox.y - pad;
  const width = bbox.width + pad * 2;
  const height = bbox.height + pad * 2;

  // Choose adaptive grid resolution (between 0.25mm and 0.8mm)
  const step = clamp(Math.max(width, height) / 210, 0.25, 0.85);
  const cols = Math.ceil(width / step) + 1;
  const rows = Math.ceil(height / step) + 1;

  // Collect all segments for fast distance queries
  const segs = [];
  for (const loop of allLoops) {
    if (!loop || loop.length < 2) continue;
    const isClosed = loop.closed !== false;
    const count = isClosed ? loop.length : loop.length - 1;
    for (let i = 0; i < count; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
    }
  }

  // Evaluate signed distance field (positive outside, negative inside)
  const field = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const py = minY + r * step;
    for (let c = 0; c < cols; c++) {
      const px = minX + c * step;
      let minDistSq = Infinity;
      for (let k = 0; k < segs.length; k++) {
        const s = segs[k];
        const dSq = pointToSegmentDistSq(px, py, s.ax, s.ay, s.bx, s.by);
        if (dSq < minDistSq) minDistSq = dSq;
      }
      const d = Math.sqrt(minDistSq);
      const inside = pointInMultiPolygon({ x: px, y: py }, allLoops);
      field[r * cols + c] = (inside ? -d : d) - offsetMm;
    }
  }

  // Extract 0-isoline via subpixel Marching Squares
  const rawLoops = marchingSquaresZeroIsoline(field, cols, rows, minX, minY, step);
  if (!rawLoops || rawLoops.length === 0) return null;

  // For positive outer offsets, if the user wants a clean outer cut line, keep outer boundary loops
  const smoothedLoops = rawLoops.map(loop => {
    const simp = simplifyRdpPolygon(loop, step * 0.32);
    return ChaikinSmooth(simp, 1);
  }).filter(l => l.length >= 3);

  if (smoothedLoops.length === 0) return null;
  return createPathShapeFromPolygons(
    smoothedLoops,
    laserMode,
    `Ytterkant (${offsetMm > 0 ? '+' : ''}${offsetMm} mm)`
  );
}

/**
 * Subpixel Marching Squares contour extractor for `field <= 0` interior.
 */
export function marchingSquaresZeroIsoline(field, cols, rows, originX, originY, step) {
  const segments = [];

  const interp = (x1, y1, v1, x2, y2, v2) => {
    const dv = v2 - v1;
    const t = Math.abs(dv) < 1e-6 ? 0.5 : clamp(-v1 / dv, 0, 1);
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  };

  for (let r = 0; r < rows - 1; r++) {
    const y0 = originY + r * step;
    const y1 = y0 + step;
    for (let c = 0; c < cols - 1; c++) {
      const x0 = originX + c * step;
      const x1 = x0 + step;

      const v0 = field[r * cols + c];           // Top-Left
      const v1 = field[r * cols + (c + 1)];     // Top-Right
      const v2 = field[(r + 1) * cols + (c + 1)]; // Bottom-Right
      const v3 = field[(r + 1) * cols + c];     // Bottom-Left

      let mask = 0;
      if (v0 <= 0) mask |= 1;
      if (v1 <= 0) mask |= 2;
      if (v2 <= 0) mask |= 4;
      if (v3 <= 0) mask |= 8;
      if (mask === 0 || mask === 15) continue;

      const top = () => interp(x0, y0, v0, x1, y0, v1);
      const right = () => interp(x1, y0, v1, x1, y1, v2);
      const bottom = () => interp(x0, y1, v3, x1, y1, v2);
      const left = () => interp(x0, y0, v0, x0, y1, v3);

      switch (mask) {
        case 1:  segments.push({ a: left(), b: top(), used: false }); break;
        case 2:  segments.push({ a: top(), b: right(), used: false }); break;
        case 3:  segments.push({ a: left(), b: right(), used: false }); break;
        case 4:  segments.push({ a: right(), b: bottom(), used: false }); break;
        case 5:  segments.push({ a: left(), b: bottom(), used: false }, { a: right(), b: top(), used: false }); break;
        case 6:  segments.push({ a: top(), b: bottom(), used: false }); break;
        case 7:  segments.push({ a: left(), b: bottom(), used: false }); break;
        case 8:  segments.push({ a: bottom(), b: left(), used: false }); break;
        case 9:  segments.push({ a: bottom(), b: top(), used: false }); break;
        case 10: segments.push({ a: top(), b: left(), used: false }, { a: bottom(), b: right(), used: false }); break;
        case 11: segments.push({ a: bottom(), b: right(), used: false }); break;
        case 12: segments.push({ a: right(), b: left(), used: false }); break;
        case 13: segments.push({ a: right(), b: top(), used: false }); break;
        case 14: segments.push({ a: top(), b: left(), used: false }); break;
      }
    }
  }

  return chainDirectedSegmentsToPolygons(segments);
}

// ============================================================================
// 5. ONE-CLICK KEYRING EAR ("NØKKELRING-ØYE") WELDER
// ============================================================================

/**
 * Welds a keyring ear (outer loop Ø 10mm + inner hole Ø 4.5mm) onto the left or top edge of `shape`.
 */
export function weldKeyringTabToShape(shape, holeDiamMm = 4.5, borderMm = 3.0) {
  if (!shape) return null;
  const loops = shapeToWorldPolygons(shape, 0.15);
  const bbox = computePolygonsBBox(loops);

  const outerRadius = holeDiamMm / 2 + borderMm;
  const innerRadius = holeDiamMm / 2;

  // Place ear on the left side if wider than tall, else on top
  const onLeft = bbox.width >= bbox.height;
  const earCx = onLeft ? bbox.x : bbox.x + bbox.width / 2;
  const earCy = onLeft ? bbox.y + bbox.height / 2 : bbox.y;

  const makeCircleLoop = (cx, cy, r, steps = 40) => {
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    pts.closed = true;
    return pts;
  };

  const outerEar = [makeCircleLoop(earCx, earCy, outerRadius, 48)];
  const innerHole = [makeCircleLoop(earCx, earCy, innerRadius, 36)];

  const united = booleanMultiPolygons(loops, outerEar, 'union');
  const withHole = booleanMultiPolygons(united, innerHole, 'subtract');

  return createPathShapeFromPolygons(withHole, shape.laserMode || 'cut', `${shape.name || 'Skilt'} m/ nøkkelring`);
}

// ============================================================================
// 6. POLYGON SIMPLIFICATION & SMOOTHING HELPERS
// ============================================================================

export function simplifyCollinearPolygon(pts, tolerance = 0.015) {
  return simplifyRdpPolygon(pts, tolerance);
}

export function simplifyRdpPolygon(pts, epsilon = 0.1) {
  if (!pts || pts.length < 5) return pts;
  const rdpOpen = (arr, eps) => {
    if (arr.length <= 2) return arr;
    let maxDistSq = 0;
    let index = 0;
    const start = arr[0];
    const end = arr[arr.length - 1];
    for (let i = 1; i < arr.length - 1; i++) {
      const dSq = pointToSegmentDistSq(arr[i].x, arr[i].y, start.x, start.y, end.x, end.y);
      if (dSq > maxDistSq) {
        index = i;
        maxDistSq = dSq;
      }
    }
    if (maxDistSq > eps * eps) {
      const left = rdpOpen(arr.slice(0, index + 1), eps);
      const right = rdpOpen(arr.slice(index), eps);
      return left.slice(0, -1).concat(right);
    }
    return [start, end];
  };

  const half = Math.floor(pts.length / 2);
  const part1 = rdpOpen(pts.slice(0, half + 1), epsilon);
  const part2 = rdpOpen(pts.slice(half).concat([pts[0]]), epsilon);
  const combined = part1.slice(0, -1).concat(part2.slice(0, -1));
  combined.closed = pts.closed !== false;
  return combined.length >= 3 ? combined : pts;
}

function ChaikinSmooth(pts, iterations = 1) {
  let curr = pts;
  for (let it = 0; it < iterations; it++) {
    if (curr.length < 4) break;
    const next = [];
    const n = curr.length;
    for (let i = 0; i < n; i++) {
      const p0 = curr[i];
      const p1 = curr[(i + 1) % n];
      next.push(
        { x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y },
        { x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y }
      );
    }
    next.closed = pts.closed !== false;
    curr = next;
  }
  return curr;
}

// ============================================================================
// 7. LASER PRE-FLIGHT ANALYSIS (Path Length & Duplicate Line Detection)
// ============================================================================

export function analyzeShapesForLaser(shapes, bedWidth, bedHeight) {
  let cutLengthMm = 0;
  let scoreLengthMm = 0;
  let engraveCount = 0;
  let bitmapCount = 0;
  let cutCount = 0;
  let scoreCount = 0;
  const outOfBounds = [];
  const tinyShapes = [];
  const duplicateShapeIds = new Set();

  // Check duplicate shapes at identical positions
  const signatures = new Map();

  const flatShapes = [];
  const collectFlat = (list) => {
    for (const item of list || []) {
      if (!item || item.hidden || item.laserMode === 'guide') continue;
      if (item.type === 'group' && Array.isArray(item.children)) {
        collectFlat(item.children);
      } else {
        flatShapes.push(item);
      }
    }
  };
  collectFlat(shapes);

  for (const s of flatShapes) {
    const loops = shapeToWorldPolygons(s, 0.3);
    const bbox = computePolygonsBBox(loops);

    if (bbox.x < -0.5 || bbox.y < -0.5 || bbox.x + bbox.width > bedWidth + 0.5 || bbox.y + bbox.height > bedHeight + 0.5) {
      outOfBounds.push(s);
    }
    if (bbox.width < 1.0 && bbox.height < 1.0) {
      tinyShapes.push(s);
    }

    const sig = `${s.type}_${s.laserMode}_${Math.round(bbox.x * 10)}_${Math.round(bbox.y * 10)}_${Math.round(bbox.width * 10)}_${Math.round(bbox.height * 10)}`;
    if (signatures.has(sig)) {
      duplicateShapeIds.add(s.id);
    } else {
      signatures.set(sig, s.id);
    }

    // Calculate perimeter length
    let len = 0;
    for (const loop of loops) {
      for (let i = 0; i < loop.length - 1; i++) {
        len += dist(loop[i], loop[i + 1]);
      }
      if (loop.closed !== false && loop.length > 2) {
        len += dist(loop[loop.length - 1], loop[0]);
      }
    }

    if (s.type === 'image' || s.laserMode === 'bitmap') {
      bitmapCount++;
    } else if (s.laserMode === 'cut') {
      cutCount++;
      cutLengthMm += len;
    } else if (s.laserMode === 'score') {
      scoreCount++;
      scoreLengthMm += len;
    } else if (s.laserMode === 'engrave') {
      engraveCount++;
    }
  }

  return {
    cutCount,
    scoreCount,
    engraveCount,
    bitmapCount,
    cutLengthMm: roundMm(cutLengthMm, 1),
    scoreLengthMm: roundMm(scoreLengthMm, 1),
    outOfBounds,
    tinyShapes,
    duplicateShapeIds: Array.from(duplicateShapeIds)
  };
}
