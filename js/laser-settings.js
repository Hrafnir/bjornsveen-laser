export const LASER_MATERIAL_PRESETS = {
  'plywood-3mm': {
    name: '🌲 3 mm Bjørk Kryssfiner (Standard P3 CO2)',
    machine: 'xtool-p3',
    thicknessMm: 3.0,
    cut: { power: 85, speed: 18, repeat: 1, airPump: 100 },
    score: { power: 18, speed: 160, repeat: 1, airPump: 25 },
    engrave: { power: 30, speed: 350, density: 100, repeat: 1, bitmapScanMode: 'zMode', airPump: 25 },
    bitmap: { power: 32, speed: 300, dpi: 254, repeat: 1, bitmapMode: 'Jarvis', bitmapScanMode: 'zMode', airPump: 25, dotDuration: 200, frequency: 40 }
  },
  'plywood-4mm': {
    name: '🌲 4 mm Kryssfiner / Poppel (P3 CO2)',
    machine: 'xtool-p3',
    thicknessMm: 4.0,
    cut: { power: 92, speed: 14, repeat: 1, airPump: 100 },
    score: { power: 18, speed: 160, repeat: 1, airPump: 25 },
    engrave: { power: 32, speed: 350, density: 100, repeat: 1, bitmapScanMode: 'zMode', airPump: 25 },
    bitmap: { power: 34, speed: 300, dpi: 254, repeat: 1, bitmapMode: 'Jarvis', bitmapScanMode: 'zMode', airPump: 25, dotDuration: 200, frequency: 40 }
  },
  'mdf-3mm': {
    name: '🟫 3 mm MDF-plate (P3 CO2)',
    machine: 'xtool-p3',
    thicknessMm: 3.0,
    cut: { power: 75, speed: 30, repeat: 1, airPump: 100 },
    score: { power: 20, speed: 150, repeat: 1, airPump: 25 },
    engrave: { power: 35, speed: 320, density: 100, repeat: 1, bitmapScanMode: 'zMode', airPump: 25 },
    bitmap: { power: 35, speed: 280, dpi: 254, repeat: 1, bitmapMode: 'Jarvis', bitmapScanMode: 'zMode', airPump: 25, dotDuration: 200, frequency: 40 }
  },
  'basswood-photo': {
    name: '🖼️ 3 mm Lindetre – Høyoppløst Foto-gravering (P3 CO2)',
    machine: 'xtool-p3',
    thicknessMm: 3.0,
    cut: { power: 82, speed: 20, repeat: 1, airPump: 100 },
    score: { power: 16, speed: 170, repeat: 1, airPump: 25 },
    engrave: { power: 28, speed: 360, density: 120, repeat: 1, bitmapScanMode: 'zMode', airPump: 25 },
    bitmap: { power: 28, speed: 320, dpi: 305, repeat: 1, bitmapMode: 'Jarvis', bitmapScanMode: 'zMode', airPump: 25, dotDuration: 200, frequency: 40 }
  },
  'acrylic-3mm': {
    name: '💎 3 mm Akryl / Plexiglass (P3 CO2)',
    machine: 'xtool-p3',
    thicknessMm: 3.0,
    cut: { power: 90, speed: 12, repeat: 1, airPump: 80 },
    score: { power: 16, speed: 140, repeat: 1, airPump: 25 },
    engrave: { power: 28, speed: 380, density: 120, repeat: 1, bitmapScanMode: 'zMode', airPump: 25 },
    bitmap: { power: 28, speed: 320, dpi: 300, repeat: 1, bitmapMode: 'Jarvis', bitmapScanMode: 'zMode', airPump: 25, dotDuration: 200, frequency: 40 }
  },
  'cardboard': {
    name: '📦 Papp / Kartong – Rask prototype (P3 CO2)',
    machine: 'xtool-p3',
    thicknessMm: 2.0,
    cut: { power: 35, speed: 45, repeat: 1, airPump: 100 },
    score: { power: 12, speed: 180, repeat: 1, airPump: 25 },
    engrave: { power: 18, speed: 400, density: 80, repeat: 1, bitmapScanMode: 'zMode', airPump: 25 },
    bitmap: { power: 20, speed: 350, dpi: 200, repeat: 1, bitmapMode: 'Jarvis', bitmapScanMode: 'zMode', airPump: 25, dotDuration: 200, frequency: 40 }
  },
  'leather': {
    name: '👜 Lær / Skinn (P3 CO2 / F2 Ultra)',
    machine: 'xtool-p3',
    thicknessMm: 2.0,
    cut: { power: 55, speed: 25, repeat: 1, airPump: 100 },
    score: { power: 15, speed: 150, repeat: 1, airPump: 25 },
    engrave: { power: 24, speed: 350, density: 100, repeat: 1, bitmapScanMode: 'zMode', airPump: 25 },
    bitmap: { power: 25, speed: 300, dpi: 254, repeat: 1, bitmapMode: 'Atkinson', bitmapScanMode: 'zMode', airPump: 25, dotDuration: 200, frequency: 40 }
  },
  'slate-uv': {
    name: '🪨 Skifer / Steinbrikke (F2 Ultra UV / P3)',
    machine: 'xtool-f2',
    thicknessMm: 5.0,
    cut: { power: 90, speed: 10, repeat: 1, airPump: 100 },
    score: { power: 40, speed: 120, repeat: 1, airPump: 25 },
    engrave: { power: 65, speed: 400, density: 140, repeat: 1, bitmapScanMode: 'zMode', airPump: 25 },
    bitmap: { power: 65, speed: 350, dpi: 400, repeat: 1, bitmapMode: 'Jarvis', bitmapScanMode: 'zMode', airPump: 25, dotDuration: 200, frequency: 40 }
  },
  'alu-uv': {
    name: '🪪 Anodisert Aluminium / Metallkort (F2 Ultra UV)',
    machine: 'xtool-f2',
    thicknessMm: 0.8,
    cut: { power: 90, speed: 10, repeat: 1, airPump: 100 },
    score: { power: 45, speed: 300, repeat: 1, airPump: 25 },
    engrave: { power: 70, speed: 600, density: 200, repeat: 1, bitmapScanMode: 'zMode', airPump: 25 },
    bitmap: { power: 70, speed: 500, dpi: 500, repeat: 1, bitmapMode: 'grayscale', bitmapScanMode: 'zMode', airPump: 25, dotDuration: 200, frequency: 40 }
  },
  'glass-uv': {
    name: '🥃 Glass / Krystall – Kaldt UV-merke (F2 Ultra UV)',
    machine: 'xtool-f2',
    thicknessMm: 3.0,
    cut: { power: 80, speed: 10, repeat: 1, airPump: 100 },
    score: { power: 55, speed: 200, repeat: 1, airPump: 25 },
    engrave: { power: 75, speed: 350, density: 200, repeat: 1, bitmapScanMode: 'zMode', airPump: 25 },
    bitmap: { power: 75, speed: 300, dpi: 500, repeat: 1, bitmapMode: 'Jarvis', bitmapScanMode: 'zMode', airPump: 25, dotDuration: 220, frequency: 40 }
  },
  'custom': {
    name: '⚙️ Egendefinerte laserinnstillinger',
    machine: 'custom',
    thicknessMm: 3.0,
    cut: { power: 85, speed: 18, repeat: 1, airPump: 100 },
    score: { power: 18, speed: 160, repeat: 1, airPump: 25 },
    engrave: { power: 30, speed: 350, density: 100, repeat: 1, bitmapScanMode: 'zMode', airPump: 25 },
    bitmap: { power: 32, speed: 300, dpi: 254, repeat: 1, bitmapMode: 'Jarvis', bitmapScanMode: 'zMode', airPump: 25, dotDuration: 200, frequency: 40 }
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

