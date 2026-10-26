// Separate colors are required: xTool schedules layers, not SVG subpaths or z-order.
// These stages describe the puzzle as generated; rotating it keeps the same sequence.
export const PUZZLE_CUT_STAGES = [
  { id: 'puzzle-horizontal', name: 'Puslespill 1 – Vannrette', color: '#ff9900', order: 4 },
  { id: 'puzzle-vertical', name: 'Puslespill 2 – Loddrette', color: '#00cc00', order: 5 },
  { id: 'puzzle-outline', name: 'Puslespill 3 – Ytterkontur', color: '#9900ff', order: 6 }
];

export const CUT_STAGES = [
  ...PUZZLE_CUT_STAGES,
  { id: 'flex-slits', name: 'Flex – Snitt før kontur', color: '#cc0066', order: 7 },
  { id: 'box-holes', name: 'Boks 1 – Hull', color: '#00aaaa', order: 8 },
  { id: 'box-outline', name: 'Boks 2 – Ytterkonturer', color: '#aa5500', order: 9 }
];

export function getCutStage(shape) {
  if ((shape.laserMode || 'cut') !== 'cut') return undefined;
  return CUT_STAGES.find(stage => stage.id === shape.cutStage);
}
