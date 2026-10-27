import test from 'node:test';
import assert from 'node:assert/strict';
import { LASER_MATERIAL_PRESETS, getDefaultLaserSettings } from '../js/laser-settings.js';
import { buildXcsProjectString } from '../js/export.js';
import { generateFingerJointBox } from '../js/box-generator.js';
test('3 mm MDF uses the requested 75 percent and 30 mm/s in every box cut layer',()=>{
 const preset=LASER_MATERIAL_PRESETS['mdf-3mm'];
 assert.equal(preset.cut.power,75);assert.equal(preset.cut.speed,30);
 const settings={...getDefaultLaserSettings(),...structuredClone(preset),presetKey:'mdf-3mm'};
 const data=JSON.parse(buildXcsProjectString(generateFingerJointBox({boxType:'cable'}),{machineKey:'xtool-p3',laserSettings:settings}));
 for(const display of data.canvas[0].displays){const p=display.data.VECTOR_CUTTING.parameter.customize;assert.equal(p.power,75);assert.equal(p.speed,30)}
 assert.equal(LASER_MATERIAL_PRESETS['plywood-3mm'].cut.power,85);
});
