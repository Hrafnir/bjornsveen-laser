import { FLEX_TYPES, FLEX_PRESETS, buildFlexModel, flexModelToShapes, renderFlexAssemblySvg } from './flex-generator.js';
import { groupBoxParts } from './box-generator.js';
import { renderShapesPreviewSvg } from './generators.js';
import { computePolygonsBBox, shapeToWorldPolygons, roundMm } from './geometry.js';

export function renderFlexGeneratorUI(container, { onChange, parseNumber, layoutWidthMm=600, layoutHeightMm=400 }) {
  const field = (id, label, value) => `<div class="prop-field"><label for="gen-flex-${id}">${label}</label><div class="input-with-unit"><input id="gen-flex-${id}" class="input-control math-input" type="text" inputmode="decimal" value="${value}"/><span class="unit">mm</span></div></div>`;
  container.innerHTML = `
    <div class="generator-controls box-controls">
      <div class="prop-field"><label for="gen-flex-preset">Start fra et eksempel</label><select id="gen-flex-preset" class="select-control"><option value="custom">Egne mål</option>${FLEX_PRESETS.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select></div>
      <div class="box-help">Eksemplene endrer form og mål. Material- og flexinnstillingene dine beholdes.</div>
      <div class="prop-field"><label for="gen-flex-type">Del / boks</label><select id="gen-flex-type" class="select-control">${FLEX_TYPES.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select></div>
      <div class="info-box" id="gen-flex-note"></div>
      <div class="prop-grid">${field('length', 'Ytre lengde', 120)}${field('width', 'Ytre bredde', 70)}
        <div id="gen-flex-height-field">${field('height', 'Ytre høyde, inkl. lokk', 60)}</div>
        ${field('thickness', 'Målt materialtykkelse', 3)}${field('kerf', 'Kerf – hele snittbredden', 0.08)}
      </div>
      <div id="gen-flex-panel-options" class="box-options">
        <div class="prop-grid">${field('flex-width', 'Bredde på bøyeområdet', 40)}${field('margin', 'Endemarg (0 = åpen kant)', 0)}</div>
        <div class="prop-field"><label for="gen-flex-axis">Bøyeakse / snittretning på platen</label><select id="gen-flex-axis" class="select-control"><option value="vertical">Loddrett</option><option value="horizontal">Vannrett</option></select></div>
        <div class="box-help">Snittene går langs bøyeaksen. En endemarg lager en sammenhengende kant som begrenser hvor mye delen kan bøyes.</div>
      </div>
      <div id="gen-flex-box-options" class="box-options">
        <div class="prop-grid">${field('radius', 'Ytre hjørneradius', 22)}${field('finger', 'Ønsket tappbredde', 14)}${field('clearance', 'Klaring, lokk og styrering', 0.2)}${field('seam', 'Åpning i veggskjøt', 0.2)}</div>
        <div class="prop-field"><label for="gen-flex-pieces">Del opp veggen</label><select id="gen-flex-pieces" class="select-control"><option value="2">To deler – kortere kuttedeler</option><option value="1">Én sammenhengende vegg</option></select></div>
        <div class="box-help">Fingerskjøter forbinder de rette veggpartiene med bunn og eventuelt lokk. Hjørnene har åpne flexsnitt; styrering og skjøtelapper hjelper monteringen. Vegglengden beregnes midt i materialet; prøvemonter før liming.</div>
      </div>
      <details class="box-options" open><summary>Flexinnstillinger</summary>
        <div class="prop-grid">${field('pitch', 'Avstand mellom snittkolonner', 2)}${field('cut-length', 'Lengde på hvert snitt', 18)}${field('bridge', 'Bro mellom snitt i kolonnen', 2)}</div>
        <div class="box-help">Annenhver kolonne forskyves et halvt mønster. Tettere kolonner og lengre snitt gir vanligvis mer ettergivelse, men også en svakere del. Snittenes bredde er laserens kerf.</div>
        <button type="button" class="btn" id="gen-flex-sample">Lag prøvebit med mine flexmål</button>
      </details>
      <details class="box-options"><summary>Plassering og delnavn</summary>${field('gap', 'Avstand mellom delene', 1)}<label class="box-check"><input type="checkbox" id="gen-flex-labels" checked/> Vis lesbare delnavn (eksporteres ikke)</label></details>
    </div>
    <div class="box-preview-column">
      <div class="box-view-tabs" role="group" aria-label="Flexforhåndsvisning"><button type="button" class="btn active" id="gen-flex-view-cuts" aria-pressed="true">Kuttedeler</button><button type="button" class="btn" id="gen-flex-view-assembly" aria-pressed="false">Sammensatt</button></div>
      <div class="generator-preview-box box-preview flex-preview"><div id="gen-preview-svg"></div><div id="gen-preview-caption" class="preview-caption"></div></div>
      <div class="box-dimensions" id="gen-flex-dimensions"></div>
      <div class="box-error" id="gen-flex-error" role="alert" hidden></div>
      <div class="info-box">Prøvekutt først i samme materiale og fiberretning. Mønsteret bestemmer ikke en garantert bøyeradius. Avrundede bokser er limkonstruksjoner; illustrasjonen viser ønsket form.</div>
      <div class="box-help">Kutterekkefølge i XCS: flexsnitt → hull → ytterkonturer. SVG bruker egne farger; behold denne rekkefølgen i laserprogrammet. Ikke skaler delene etter generering – endre målene her.</div>
    </div>`;
  const el = id => container.querySelector('#gen-flex-' + id);
  const num = id => parseNumber(el(id).value, NaN);
  let model = null, preview = null, view = 'cuts';
  const render = () => {
    if (!model || !preview) return;
    container.querySelector('#gen-preview-svg').innerHTML = view === 'assembly' ? renderFlexAssemblySvg(model) : preview.svgHtml;
    for (const mode of ['cuts', 'assembly']) { el('view-' + mode).classList.toggle('active', view === mode); el('view-' + mode).setAttribute('aria-pressed', String(view === mode)); }
  };
  const update = () => {
    const panel = el('type').value === 'panel';
    el('panel-options').hidden = !panel; el('box-options').hidden = panel; el('height-field').hidden = panel;
    el('view-assembly').hidden = panel;
    if (panel) view = 'cuts';
    el('note').textContent = FLEX_TYPES.find(t => t.id === el('type').value).note;
    el('error').hidden = true;
    try {
      model = buildFlexModel({ flexType: el('type').value, layoutWidthMm, layoutHeightMm, lengthMm: num('length'), widthMm: num('width'), heightMm: num('height'), thicknessMm: num('thickness'), kerfMm: num('kerf'), flexWidthMm: num('flex-width'), endMarginMm: num('margin'), axis: el('axis').value, radiusMm: num('radius'), clearanceMm: num('clearance'), seamGapMm: num('seam'), wallPieces: Number(el('pieces').value), pitchMm: num('pitch'), cutLengthMm: num('cut-length'), bridgeMm: num('bridge'), partGapMm: num('gap'), fingerWidthMm: num('finger'), addLabels: el('labels').checked });
      const shapes = flexModelToShapes(model);
      onChange(groupBoxParts(shapes));
      preview = renderShapesPreviewSvg(shapes, { strokeScale: 0.0012 });
      const bounds = computePolygonsBBox(shapes.filter(s => s.laserMode === 'cut').flatMap(s => shapeToWorldPolygons(s)));
      const count = model.parts.reduce((sum, part) => sum + part.slits.length, 0);
      const lines = [`${model.parts.length} ${model.parts.length === 1 ? 'del' : 'deler'} · ${count} flexsnitt`, `Platebehov: ${roundMm(bounds.width, 1)} × ${roundMm(bounds.height, 1)} mm`];
      if(bounds.x+bounds.width>layoutWidthMm||bounds.y+bounds.height>layoutHeightMm)lines.push('Fordel delene på flere plater, eller endre boksmålene.');
      if (panel) lines.push(`Bøyeområde: ${model.flexWidth} mm · ${model.axis === 'vertical' ? 'loddrett' : 'vannrett'} akse`);
      else {
        const d = model.inner;
        lines.push(`Indre: ${roundMm(d.length, 1)} × ${roundMm(d.width, 1)} × ${roundMm(d.height, 1)} mm`, `Veggdeler: ${model.parts.filter(p => p.id.startsWith('wall-')).map(p => `${roundMm(p.width, 2)} × ${roundMm(p.stockHeight || p.height, 2)}`).join(' / ')} mm`, 'Styreringen tar litt plass langs innerkanten av bunnen.');
      }
      el('dimensions').replaceChildren(...lines.map((line, i) => { const node = document.createElement(i ? 'span' : 'strong'); node.textContent = line; return node; }));
      container.querySelector('#gen-preview-caption').textContent = panel ? 'Flat del · 1:1 · rosa = flexsnitt' : 'Ytre mål inkluderer bunn og eventuelt lokk';
      render();
    } catch (error) {
      model = null; preview = null; onChange([]);
      container.querySelector('#gen-preview-svg').innerHTML = ''; container.querySelector('#gen-preview-caption').textContent = '';
      el('dimensions').textContent = ''; el('error').textContent = error.message; el('error').hidden = false;
    }
  };
  const applyExample = preset => {
    const map = { flexType: 'type', lengthMm: 'length', widthMm: 'width', heightMm: 'height', radiusMm: 'radius', flexWidthMm: 'flex-width' };
    for (const [key, value] of Object.entries(preset.options)) el(map[key]).value = value;
    el('axis').value = 'vertical'; el('margin').value = 0; update();
  };
  container.querySelectorAll('input, select').forEach(input => {
    if (input.id === 'gen-flex-preset') return;
    input.addEventListener('input', () => { el('preset').value = 'custom'; update(); });
  });
  el('preset').addEventListener('change', () => { const preset = FLEX_PRESETS.find(p => p.id === el('preset').value); if (preset) applyExample(preset); });
  el('sample').addEventListener('click', () => {
    // Keep the user's material and pattern, but make room for at least three
    // columns and a full cut period, even for a large custom pattern.
    el('preset').value = 'sample';
    const flexWidth = Math.max(40, num('pitch') * 5);
    applyExample({ options: { flexType: 'panel', lengthMm: Math.max(80, flexWidth + 30), widthMm: Math.max(50, num('cut-length') + 2 * num('bridge') + 10), flexWidthMm: flexWidth } });
  });
  for (const mode of ['cuts', 'assembly']) el('view-' + mode).addEventListener('click', () => { view = mode; render(); });
  el('preset').value = 'hinge'; applyExample(FLEX_PRESETS[0]);
}
