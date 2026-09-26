const $ = (s) => document.querySelector(s);
let zoom = 100, x = 0, y = 0, active = null, drag = null, editingGroups = [], expandedGroup = 0;

function isOutputLayer(node) { return node?.dataset.role === 'output'; }
function customNeuronLayers() { return [...document.querySelectorAll('.neuron')].filter((node) => !isOutputLayer(node)); }

const sectionList = document.createElement('div'), addSection = document.createElement('button');
sectionList.style.cssText = 'max-height:calc(100vh - 190px);overflow:auto;margin:14px 0';
addSection.textContent = '+ Add new neuron section';
addSection.style.cssText = 'position:absolute;bottom:20px;left:20px;right:20px;padding:10px;border:1px solid #436f98;border-radius:7px;background:#fffdf9;color:#436f98;font-weight:700';
$('#nav').append(sectionList, addSection);

function refreshSections() {
  sectionList.innerHTML = '<small>NEURON SECTIONS</small>';
  document.querySelectorAll('.neuron').forEach((node) => {
    const button = document.createElement('button');
    button.textContent = `${node.dataset.name} · ${node.dataset.count} neurons`;
    button.style.cssText = 'display:block;width:100%;text-align:left;padding:9px 0;border:0;border-bottom:1px solid #eee4d7;background:transparent;font-size:.75rem';
    button.onclick = () => openEditor(node);
    sectionList.append(button);
  });
}

const equationRoles = {
  calculation: { label: 'Calculation', allowed: ['X', 'W', 'B'], help: 'selected inputs, weights, and one bias → raw neuron value' },
  formatting: { label: 'Formatting', allowed: ['X'], help: 'raw neuron value → standard stored output' },
  evaluation: { label: 'Evaluation', allowed: ['Y', 'T'], help: 'model output and a grader target → one training score' }
};
function inferredEquationRole(equation) {
  if (equation?.role && equationRoles[equation.role]) return equation.role;
  return /identity|relu|format/i.test(equation?.name || '') ? 'formatting' : /loss|evaluation|grade/i.test(equation?.name || '') ? 'evaluation' : 'calculation';
}
function defaultEquationName(role = 'calculation') {
  const equations = getEquations();
  return equations.find((equation) => equation.name === 'Neuron calculation' && inferredEquationRole(equation) === role)?.name
    || equations.find((equation) => inferredEquationRole(equation) === role)?.name
    || equations[0]?.name || '';
}
function defaultGroups(node) {
  try { const saved = JSON.parse(node.dataset.groups || ''); if (Array.isArray(saved) && saved.length) return saved.map((group) => ({ ...group, equation: group.equation || defaultEquationName() })); } catch (_) {}
  return [{ start: 0, end: Number(node.dataset.count) || 128, mode: 'fixed', size: 10, shift: 1, skip: 0, total: 128, equation: defaultEquationName() }];
}
function numberInput(value, field, index, min = 0) { return `<input data-group="${index}" data-field="${field}" type="number" min="${min}" value="${value}">`; }
function createDefaultEquations() {
  const make = (name, expression, role) => ({ id: `eq-${Math.random().toString(16).slice(2)}`, name, expression, lines: [expression], role });
  return [
    make('Neuron calculation', '⟦Wₓ×Xₓ⟧ₓ+B', 'calculation'),
    make('Identity', 'X', 'formatting')
  ];
}
function getEquations() {
  let equations;
  try { equations = JSON.parse(localStorage.getItem('nf-working-equations') || localStorage.getItem('nf-equations') || '[]'); if (!Array.isArray(equations)) equations = []; } catch (_) { equations = []; }
  if (!equations.length) equations = createDefaultEquations();
  const seedKey = 'nf-equation-defaults-v8';
  let seeded = false;
  if (!localStorage.getItem(seedKey)) {
    const legacyDefaults = new Map([
      ['Cosine similarity', new Set(['Σ(Aᵢ×Bᵢ) ÷ (√Σ(Aᵢ²)×√Σ(Bᵢ²))', '⟦Aₓ×Bₓ⟧ₓ ÷ (√⟦Aₓ²⟧ₓ×√⟦Bₓ²⟧ₓ)'])],
      ['Dot product', new Set(['Σ(Aᵢ×Bᵢ)', '⟦Aₓ×Bₓ⟧ₓ'])], ['Sine', new Set(['sin(X)'])],
      ['Squared error loss', new Set(['(Y−T)^2', '(Y-T)^2'])]
    ]);
    equations = equations.filter((equation) => !legacyDefaults.get(equation.name)?.has(equation.expression || equation.lines?.join(' ') || ''));
    const names = new Set(equations.map((equation) => equation.name));
    equations.push(...createDefaultEquations().filter((equation) => !names.has(equation.name)));
    seeded = true; localStorage.setItem(seedKey, 'true');
  }
  let migrated = false;
  equations.forEach((equation) => {
    if (!equation.id) { equation.id = `eq-${Math.random().toString(16).slice(2)}`; migrated = true; }
    if (equation.expression === undefined) { equation.expression = equation.lines?.join(' ') || ''; migrated = true; }
    const role = inferredEquationRole(equation);
    if (equation.role !== role) { equation.role = role; migrated = true; }
  });
  if (migrated || seeded || !localStorage.getItem('nf-working-equations')) { localStorage.setItem('nf-working-equations', JSON.stringify(equations)); localStorage.setItem('nf-equations', JSON.stringify(equations)); }
  return equations;
}
function storeEquations(equations) { localStorage.setItem('nf-working-equations', JSON.stringify(equations)); localStorage.setItem('nf-equations', JSON.stringify(equations)); }
function migrateDefaultVideoThreshold() {
  const previousDefault = 'K×(μ+√mean((X−μ)^2))';
  const currentDefault = '1×(μ+√mean((X−μ)^2))';
  const equations = getEquations();
  const equation = equations.find((item) => item.name === 'Adaptive frame threshold' && item.expression === previousDefault);
  if (!equation) return;
  equation.expression = currentDefault;
  equation.lines = [currentDefault];
  storeEquations(equations);
}
migrateDefaultVideoThreshold();
function equationOptions(selected = '', role = 'calculation') { const equations = getEquations().filter((item) => !role || inferredEquationRole(item) === role), selectedName = equations.some((item) => item.name === selected) ? selected : equations[0]?.name || ''; return equations.map((item) => `<option value="${item.name}" ${item.name === selectedName ? 'selected' : ''}>${item.name}</option>`).join(''); }
function formattingEquationOptions(selected = '', optional = false) { return `${optional ? '<option value="">No formatting equation</option>' : ''}${equationOptions(selected, 'formatting')}`; }
function renderGroups() {
  const list = $('#group-sections'); list.innerHTML = '';
  editingGroups.forEach((group, index) => {
    const details = document.createElement('details'); details.open = index === expandedGroup;
    details.style.cssText = 'border:1px solid #ded4c6;border-radius:8px;padding:10px 12px;margin:9px 0;background:#fffefa';
    const copy = group.mode === 'fixed'
      ? `Create an input group of ${numberInput(group.size, 'size', index, 1)} neurons, shifting the starting point of the next group by ${numberInput(group.shift, 'shift', index)} every neuron, while skipping every ${numberInput(group.skip, 'skip', index)} inside the group.`
      : `Create ${numberInput(group.total, 'total', index, 1)} total neurons, each automatically building its own input group dynamically.`;
    details.innerHTML = `<summary style="cursor:pointer;font-weight:800">Neurons ${group.start}–${group.end} · ${group.mode === 'fixed' ? 'Fixed' : 'Dynamic'}${group.equation ? ` · ${group.equation}` : ''}</summary><div style="padding-top:9px"><label style="display:inline-block;margin:0 8px 0 0">From ${numberInput(group.start, 'start', index)} to ${numberInput(group.end, 'end', index)}</label><label style="margin:10px 0 6px">Input group mode</label><select data-group="${index}" data-field="mode"><option value="fixed">Fixed</option><option value="dynamic">Dynamic</option></select><p class="group-copy">${copy}</p><label style="margin:10px 0 6px">Equation for this neuron range</label><select data-group="${index}" data-field="equation">${equationOptions(group.equation)}</select><button type="button" class="remove-group" data-remove="${index}" ${editingGroups.length === 1 ? 'disabled' : ''}>Remove input group</button></div>`;
    details.querySelector('select[data-field="mode"]').value = group.mode;
    details.ontoggle = () => { if (!details.open) return; expandedGroup = index; list.querySelectorAll('details').forEach((other) => { if (other !== details) other.open = false; }); };
    list.append(details);
  });
  list.querySelectorAll('input, select').forEach((control) => {
    control.style.cssText = control.tagName === 'SELECT' ? 'width:100%;padding:8px;border:1px solid #ded4c6;border-radius:6px;background:#fffefa' : 'width:48px;padding:4px;border:1px solid #ded4c6;border-radius:4px';
    control.onchange = () => { const group = editingGroups[Number(control.dataset.group)]; group[control.dataset.field] = control.tagName === 'SELECT' ? control.value : Math.max(Number(control.min) || 0, Number(control.value) || 0); if (control.dataset.field === 'mode' || control.dataset.field === 'equation') renderGroups(); };
  });
  list.querySelectorAll('.remove-group').forEach((button) => button.onclick = () => { editingGroups.splice(Number(button.dataset.remove), 1); expandedGroup = Math.max(0, expandedGroup - 1); renderGroups(); });
  if (active) renderLayerGroups(active, editingGroups);
}

const groupsPanel = document.createElement('section');
groupsPanel.innerHTML = '<hr><div class="labelrow"><label style="margin:0">Input groups</label><small>BY NEURON RANGE</small></div><p>Choose the neuron range, then set how that group builds its inputs.</p><div id="group-sections"></div><button type="button" id="add-group">+ Add input group</button>';
groupsPanel.style.cssText = 'display:none;font-size:.75rem;line-height:1.8'; $('#apply').before(groupsPanel);
$('#add-group').style.cssText = 'width:100%;padding:9px;border:1px dashed #436f98;border-radius:7px;background:#fffdf9;color:#436f98;font-weight:700';
$('#add-group').onclick = () => { const previous = editingGroups.at(-1); editingGroups.push({ start: previous.end, end: Number(active.dataset.count) || previous.end, mode: 'fixed', size: 10, shift: 1, skip: 0, total: 128, equation: defaultEquationName() }); expandedGroup = editingGroups.length - 1; renderGroups(); };
const groupEditor = document.createElement('aside'); groupEditor.className = 'editor group-editor'; groupEditor.setAttribute('aria-hidden', 'true'); document.body.append(groupEditor);

$('#equation').value = '# x is this neuron\'s weighted input\noutput = x'; $('#rules').value = '# Optional conditions'; $('#equation').style.display = 'none';
const equationRef = document.createElement('select'); equationRef.id = 'equation-ref'; equationRef.innerHTML = '';
getEquations().forEach((item, index) => equationRef.innerHTML += `<option value="${index}">${item.name}</option>`);
equationRef.style.display = 'none'; $('#equation').before(equationRef); document.querySelector('.labelrow').style.display = 'none'; $('#equation').nextElementSibling.style.display = 'none';
equationRef.onchange = () => { const item = getEquations()[equationRef.value]; if (item) $('#equation').value = item.expression || item.lines?.join('\n') || ''; };
const postCalculation = document.createElement('section');
postCalculation.innerHTML = '<div class="labelrow"><label for="post-equation-ref">Post-calculation calculation</label><small>OPTIONAL</small></div><select id="post-equation-ref"><option value="">No post-calculation equation</option></select><p>Choose a saved equation to run after this layer’s main calculation.</p>';
$('#rules').before(postCalculation);
const postEquationRef = $('#post-equation-ref');
function refreshPostEquationOptions(selected = '') { postEquationRef.innerHTML = `<option value="">No post-calculation equation</option>${getEquations().filter((item) => inferredEquationRole(item) === 'formatting').map((item) => `<option value="${item.name}" ${item.name === selected ? 'selected' : ''}>${item.name}</option>`).join('')}`; }
postCalculation.style.cssText = 'margin-top:18px'; postEquationRef.style.cssText = 'width:100%;padding:9px;border:1px solid #ded4c6;border-radius:7px;background:#fffefa';
document.querySelectorAll('.labelrow')[1].style.display = 'none'; $('#rules').style.display = 'none'; $('#rules').nextElementSibling.style.display = 'none';
const deleteButton = document.createElement('button'); deleteButton.id = 'delete-layer'; deleteButton.className = 'delete'; deleteButton.textContent = 'Delete this layer'; $('#apply').after(deleteButton);
const outputLayerInfo = document.createElement('section'); outputLayerInfo.className = 'output-layer-info'; outputLayerInfo.hidden = true; $('#apply').before(outputLayerInfo);
$('#apply').hidden = true;
['#minus', '#plus', '#fit'].forEach((s) => { const b = $(s); b.style.cssText = `min-width:${s === '#fit' ? '42px' : '32px'};height:30px;border-radius:5px;border:1px solid #ded4c6;display:inline-flex;align-items:center;justify-content:center;line-height:1`; });
$('#zoom').style.cssText = 'height:30px;min-width:48px;display:inline-flex;align-items:center;justify-content:center;line-height:1'; $('#graph').style.userSelect = 'none'; $('#viewport').style.userSelect = 'none';

function draw() { $('#graph').style.transform = `translate(calc(-50% + ${x}px),calc(-50% + ${y}px)) scale(${zoom / 100})`; $('#zoom').textContent = `${zoom}%`; }
function toast(message) { const t = $('#toast'); t.textContent = message; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1800); }
function ensureLayerStack(node) { if (node.parentElement.classList.contains('layer-stack')) return node.parentElement; const stack = document.createElement('div'); stack.className = 'layer-stack'; node.before(stack); stack.append(node); const bubbles = document.createElement('div'); bubbles.className = 'input-group-bubbles'; const addGroup = document.createElement('button'); addGroup.type = 'button'; addGroup.className = 'graph-add-group'; addGroup.textContent = '+ Add input group'; addGroup.onclick = (event) => { event.stopPropagation(); const groups = defaultGroups(node), previous = groups.at(-1); groups.push({ start: previous.end, end: Number(node.dataset.count) || previous.end, mode: 'fixed', size: 10, shift: 1, skip: 0, total: 128, equation: defaultEquationName() }); node.dataset.groups = JSON.stringify(groups); if (active === node) editingGroups = groups.map((group) => ({ ...group })); storeWorkingNetwork(); stack.classList.add('show-groups'); renderLayerGroups(node, groups); openGroupEditor(node, groups.length - 1); }; stack.append(bubbles, addGroup); return stack; }
function renderLayerGroups(node, groups = defaultGroups(node)) { const stack = ensureLayerStack(node), bubbles = stack.querySelector('.input-group-bubbles'), inputLayer = customNeuronLayers().indexOf(node) === 0; bubbles.innerHTML = groups.map((group, index) => { const source = inputLayer ? (group.imageEnabled ? (group.textEnabled !== false ? 'Text + image' : 'Image') : 'Text') : 'Previous layer'; return `<button type="button" title="Edit input group ${index + 1}"><small>GROUP ${String(index + 1).padStart(2, '0')}</small><b>Input<br>group</b><em>${source}</em></button>`; }).join(''); bubbles.querySelectorAll('button').forEach((circle, index) => circle.onclick = (event) => { event.stopPropagation(); openGroupEditor(node, index); }); stack.querySelector('.graph-add-group').style.top = `${252 + Math.max(groups.length, 1) * 204}px`; }
function openGroupEditor(node, index) {
  const groups = defaultGroups(node), group = groups[index]; if (!group) return;
  const layers = customNeuronLayers(), layerIndex = layers.indexOf(node), inputLayer = layerIndex === 0, previousLayer = layers[layerIndex - 1];
  // Hidden neurons always use a saved fixed index grid. Dynamic matching is
  // reserved for input tokens, where a context graph actually exists.
  if (!inputLayer && group.mode !== 'fixed') {
    group.mode = 'fixed';
    node.dataset.groups = JSON.stringify(groups);
    storeWorkingNetwork();
  }
  $('#editor').classList.remove('open'); const fixed = group.mode === 'fixed', textEnabled = group.textEnabled !== false, imageEnabled = Boolean(group.imageEnabled);
  const fixedSettings = `<p class="fixed-sentence">For every neuron, take <input id="group-size" type="number" min="1" value="${group.size}"> ${inputLayer ? 'input item(s)' : 'value(s) from the previous layer'}, shift the starting point by <input id="group-shift" type="number" min="0" value="${group.shift}"> for the next neuron, while skipping every <input id="group-skip" type="number" min="0" value="${group.skip}"> item(s) inside the group.</p>`;
  const fixedImage = `<p class="fixed-sentence">For each matching image square, read a <input id="group-image-width" type="number" min="1" value="${group.imageWidth || 1}"> by <input id="group-image-height" type="number" min="1" value="${group.imageHeight || 1}"> square group. Move <input id="group-image-shift-x" type="number" min="0" value="${group.imageShiftX || 1}"> square(s) across for each next neuron; at the end of a row, return to the first square and move <input id="group-image-shift-y" type="number" min="0" value="${group.imageShiftY || 1}"> square(s) down.</p>`;
  const dynamicText = `<p class="dynamic-sentence">For every neuron, use text item <input id="group-dynamic-text-start" type="number" min="0" value="${group.dynamicTextStart || 0}"> then move <input id="group-dynamic-text-step" type="number" min="1" value="${group.dynamicTextStep || 1}"> item(s). Connect to the <input id="group-dynamic-text-k" type="number" min="1" value="${group.dynamicTextK || 8}"> closest text vectors from the next <input id="group-dynamic-text-range" type="number" min="1" value="${group.dynamicTextRange || 256}"> items using <select id="group-dynamic-text-similarity">${equationOptions(group.dynamicTextSimilarity || defaultEquationName())}</select>.</p>`;
  const dynamicImage = `<p class="dynamic-sentence">For each matching image square, connect to the <input id="group-dynamic-image-k" type="number" min="1" value="${group.dynamicImageK || 8}"> closest visual vectors within <input id="group-dynamic-image-radius" type="number" min="1" value="${group.dynamicImageRadius || 4}"> square positions, using <select id="group-dynamic-image-similarity">${equationOptions(group.dynamicImageSimilarity || defaultEquationName())}</select> and <input id="group-dynamic-image-position" type="number" min="0" step="0.1" value="${group.dynamicImagePosition ?? 1}"> position influence.</p><p class="dynamic-requirement">Image similarity needs visual vectors from an image-adapter layer; raw RGB squares cannot be compared this way yet.</p>`;
  const sourceControls = inputLayer
    ? `<label for="group-mode">Connection group mode</label><select id="group-mode"><option value="fixed">Fixed</option><option value="dynamic">Dynamic</option></select><details class="source-section" open><summary>Text</summary><div class="source-section-body"><label class="source-enabled"><input id="group-text-enabled" type="checkbox" ${textEnabled ? 'checked' : ''}> Read from text input</label>${fixed ? fixedSettings : dynamicText}</div></details><details class="source-section"><summary>Image</summary><div class="source-section-body"><label class="source-enabled"><input id="group-image-enabled" type="checkbox" ${imageEnabled ? 'checked' : ''}> Read from image input</label>${fixed ? fixedImage : dynamicImage}</div></details>`
    : `<section class="previous-layer-source"><small>INPUT SOURCE</small><b>${previousLayer?.dataset.name || 'Previous neuron layer'}</b><p>This group reads numerical outputs from the layer directly before this one.</p><p class="fixed-sentence"><b>Fixed connection group</b> · hidden layers always save one permanent connection grid before training.</p>${fixedSettings}</section>`;
  groupEditor.innerHTML = `<div class="editor-head"><div><p>INPUT GROUP ${String(index + 1).padStart(2, '0')}</p><h1>Input group</h1></div><button type="button" class="close-group">×</button></div><label>Neuron range</label><div class="group-range"><input id="group-start" type="number" min="0" value="${group.start}"><span>to</span><input id="group-end" type="number" min="0" value="${group.end}"></div>${sourceControls}<label for="group-equation">Equation for this group</label><select id="group-equation">${equationOptions(group.equation)}</select><p class="autosave-note">Changes save automatically.</p><button type="button" class="delete" id="delete-group" ${groups.length === 1 ? 'disabled' : ''}>Delete input group</button>`;
  const modeControl = groupEditor.querySelector('#group-mode'); if (modeControl) modeControl.value = group.mode; if (inputLayer && !fixed) { groupEditor.querySelector('#group-dynamic-text-similarity').value = group.dynamicTextSimilarity || defaultEquationName(); groupEditor.querySelector('#group-dynamic-image-similarity').value = group.dynamicImageSimilarity || defaultEquationName(); } groupEditor.classList.add('open');
  groupEditor.querySelector('.close-group').onclick = () => groupEditor.classList.remove('open');
  if (modeControl) modeControl.onchange = () => { group.mode = modeControl.value; node.dataset.groups = JSON.stringify(groups); if (active === node) editingGroups = groups.map((item) => ({ ...item })); storeWorkingNetwork(); renderLayerGroups(node, groups); openGroupEditor(node, index); };
  const saveGroupChanges = () => {
    if (inputLayer) { const text = groupEditor.querySelector('#group-text-enabled').checked, image = groupEditor.querySelector('#group-image-enabled').checked; if (!text && !image) { groupEditor.querySelector('#group-text-enabled').checked = true; group.textEnabled = true; group.imageEnabled = false; toast('Keep Text, Image, or both enabled'); return; } group.textEnabled = text; group.imageEnabled = image; if (fixed) { group.imageWidth = Math.max(1, Number(groupEditor.querySelector('#group-image-width').value) || 1); group.imageHeight = Math.max(1, Number(groupEditor.querySelector('#group-image-height').value) || 1); group.imageShiftX = Math.max(0, Number(groupEditor.querySelector('#group-image-shift-x').value) || 0); group.imageShiftY = Math.max(0, Number(groupEditor.querySelector('#group-image-shift-y').value) || 0); } else { group.dynamicTextStart = Math.max(0, Number(groupEditor.querySelector('#group-dynamic-text-start').value) || 0); group.dynamicTextStep = Math.max(1, Number(groupEditor.querySelector('#group-dynamic-text-step').value) || 1); group.dynamicTextK = Math.max(1, Number(groupEditor.querySelector('#group-dynamic-text-k').value) || 1); group.dynamicTextRange = Math.max(1, Number(groupEditor.querySelector('#group-dynamic-text-range').value) || 1); group.dynamicTextSimilarity = groupEditor.querySelector('#group-dynamic-text-similarity').value; group.dynamicImageK = Math.max(1, Number(groupEditor.querySelector('#group-dynamic-image-k').value) || 1); group.dynamicImageRadius = Math.max(1, Number(groupEditor.querySelector('#group-dynamic-image-radius').value) || 1); group.dynamicImageSimilarity = groupEditor.querySelector('#group-dynamic-image-similarity').value; group.dynamicImagePosition = Math.max(0, Number(groupEditor.querySelector('#group-dynamic-image-position').value) || 0); } }
    group.start = Math.max(0, Number(groupEditor.querySelector('#group-start').value) || 0); group.end = Math.max(group.start, Number(groupEditor.querySelector('#group-end').value) || group.start); group.equation = groupEditor.querySelector('#group-equation').value;
    if (group.mode === 'fixed') { group.size = Math.max(1, Number(groupEditor.querySelector('#group-size').value) || 1); group.shift = Math.max(0, Number(groupEditor.querySelector('#group-shift').value) || 0); group.skip = Math.max(0, Number(groupEditor.querySelector('#group-skip').value) || 0); }
    node.dataset.groups = JSON.stringify(groups); if (active === node) editingGroups = groups.map((item) => ({ ...item })); storeWorkingNetwork(); renderLayerGroups(node, groups);
  };
  groupEditor.querySelectorAll('input, select').forEach((field) => { if (field.id === 'group-mode') return; field.addEventListener(field.type === 'checkbox' || field.tagName === 'SELECT' ? 'change' : 'input', saveGroupChanges); });
  groupEditor.querySelector('#delete-group').onclick = () => { groups.splice(index, 1); node.dataset.groups = JSON.stringify(groups); if (active === node) editingGroups = groups.map((item) => ({ ...item })); storeWorkingNetwork(); renderLayerGroups(node, groups); groupEditor.classList.remove('open'); toast('Input group deleted'); };
}
function updateOutputLayerInfo() {
  const config = getOutputConfig(), names = config.functions.map((item, index) => item.name?.trim() || `Function ${index + 1}`);
  outputLayerInfo.innerHTML = `<small>FIXED DENSE CONNECTION</small><b>${names.length + 1} output selector${names.length ? 's' : ''}</b><p>Every selector reads the complete numerical output of the previous layer. The highest score chooses one function; STOP ends generation without writing any code.</p><label for="output-equation">Output score equation</label><select id="output-equation">${equationOptions(config.equation, 'formatting')}</select><p class="output-equation-note">Runs once per output selector. Edit these equations in the Equations tab.</p><ul>${names.map((name) => `<li>${name}</li>`).join('')}<li>STOP</li></ul><button type="button" id="open-output-functions">Open output functions</button>`;
  $('#output-equation').onchange = () => { const next = getOutputConfig(); next.equation = $('#output-equation').value; storeOutputConfig(next); updateOutputLayerInfo(); };
  $('#open-output-functions').onclick = () => { close(); history.replaceState(null, '', '#output'); switchWorkspace('output'); };
}
function renderOutputLayer() {
  const node = $('#output-layer'); if (!node) return;
  const functionCount = getOutputConfig().functions.length;
  node.dataset.count = String(functionCount + 1);
  node.querySelector('span').textContent = functionCount ? `${functionCount} function score${functionCount === 1 ? '' : 's'} + STOP` : 'STOP selector';
  if (active === node) updateOutputLayerInfo();
  refreshSections();
}
function setEditorToCustomLayer() { $('#count').disabled = false; $('#down').disabled = false; $('#up').disabled = false; $('#apply').hidden = true; deleteButton.style.display = ''; outputLayerInfo.hidden = true; postCalculation.style.display = ''; }
function openOutputLayerEditor(node) { active = node; renderOutputLayer(); $('#layer-index').textContent = 'FINAL LAYER'; $('#layer-title').textContent = 'Output layer'; $('#count').value = node.dataset.count; $('#count').disabled = true; $('#down').disabled = true; $('#up').disabled = true; $('#apply').hidden = true; deleteButton.style.display = 'none'; postCalculation.style.display = 'none'; outputLayerInfo.hidden = false; updateOutputLayerInfo(); $('#editor').classList.add('open'); }
function openEditor(node) { if (isOutputLayer(node)) return openOutputLayerEditor(node); setEditorToCustomLayer(); active = node; $('#layer-index').textContent = `LAYER ${String(node.dataset.layer).padStart(2, '0')}`; $('#layer-title').textContent = node.dataset.name; $('#count').value = node.dataset.count; editingGroups = defaultGroups(node); refreshPostEquationOptions(node.dataset.postEquation || ''); ensureLayerStack(node).classList.add('show-groups'); renderLayerGroups(node, editingGroups); $('#editor').classList.add('open'); }
function close() { active = null; $('#editor').classList.remove('open'); }
function bind(node) { node.style.outline = 'none'; node.onfocus = () => node.blur(); node.onclick = () => { if (!drag) openEditor(node); }; if (!isOutputLayer(node)) { if (!node.dataset.groups) node.dataset.groups = JSON.stringify(defaultGroups(node)); ensureLayerStack(node); renderLayerGroups(node); } }
function captureWorkingNetwork() { return { name: $('#project-name').value.trim() || 'Untitled network', layers: customNeuronLayers().map((node) => ({ name: node.dataset.name, count: Number(node.dataset.count) || 128, groups: node.dataset.groups || '', postEquation: node.dataset.postEquation || '' })) }; }
function storeWorkingNetwork() { localStorage.setItem('nf-working-network', JSON.stringify(captureWorkingNetwork())); }
function restoreWorkingNetwork() { let saved; try { saved = JSON.parse(localStorage.getItem('nf-working-network') || ''); } catch (_) {} if (!saved || !Array.isArray(saved.layers) || !saved.layers.length) return; if (saved.name) $('#project-name').value = saved.name; const graph = $('#graph'), add = $('#add-layer'); graph.querySelectorAll('.neuron:not(#output-layer), .connector').forEach((element) => element.remove()); const firstConnector = document.createElement('div'); firstConnector.className = 'connector'; add.before(firstConnector); saved.layers.forEach((layer, index) => { const node = document.createElement('button'); node.className = 'neuron'; node.dataset.layer = String(index + 1); node.dataset.name = layer.name || `Custom neuron layer ${String(index + 1).padStart(2, '0')}`; node.dataset.count = String(Math.max(1, Math.min(512, Number(layer.count) || 128))); if (layer.groups) node.dataset.groups = layer.groups; if (layer.postEquation) node.dataset.postEquation = layer.postEquation; node.innerHTML = `<i>${String(index + 1).padStart(2, '0')}</i><b>Custom<br>neuron layer</b><span>${node.dataset.count} neurons</span>`; add.before(node); if (index < saved.layers.length - 1) { const connector = document.createElement('div'); connector.className = 'connector'; add.before(connector); } }); }
function saveProjects() { let projects = JSON.parse(localStorage.getItem('nf-projects') || '[]'); const name = $('#project-name').value.trim() || 'Untitled network'; const project = { name, layers: document.querySelectorAll('.neuron').length, equations: getEquations(), training: getTrainingConfig(), output: getOutputConfig(), context: getContextConfig(), tensors: getTensorConfig(), saved: new Date().toLocaleString() }; projects = projects.filter((item) => item.name !== name); projects.unshift(project); localStorage.setItem('nf-projects', JSON.stringify(projects)); renderProjects(); toast('Project saved locally'); }
function renderProjects() { const list = $('#project-list'), projects = JSON.parse(localStorage.getItem('nf-projects') || '[]'); list.innerHTML = projects.length ? projects.map((item) => `<button class="project-item">${item.name}<br><small>${item.layers} layers · ${item.saved}</small></button>`).join('') : '<p>No saved projects yet.</p>'; }

bind($('#neuron-1')); bind($('#output-layer')); renderOutputLayer(); draw(); addSection.onclick = () => $('#add-layer').click(); $('#close').onclick = close;
function saveActiveLayerChanges() { if (!active || isOutputLayer(active)) return; const count = Math.max(1, Math.min(512, Number($('#count').value) || 1)); active.dataset.count = count; active.dataset.groups = JSON.stringify(editingGroups); active.dataset.postEquation = postEquationRef.value; active.querySelector('span').textContent = `${count} neurons`; renderLayerGroups(active, editingGroups); refreshSections(); }
$('#count').oninput = saveActiveLayerChanges; $('#down').onclick = () => { $('#count').value = Math.max(1, Number($('#count').value || 1) - 1); saveActiveLayerChanges(); }; $('#up').onclick = () => { $('#count').value = Math.min(512, Number($('#count').value || 1) + 1); saveActiveLayerChanges(); }; postEquationRef.onchange = saveActiveLayerChanges;
$('#apply').onclick = saveActiveLayerChanges;
deleteButton.onclick = () => { if (isOutputLayer(active)) { toast('The output layer is required'); return; } if (Number(active.dataset.layer) === 1) { toast('The first layer cannot be deleted'); return; } const stack = active.closest('.layer-stack'); stack.previousElementSibling?.remove(); stack.remove(); refreshSections(); toast('Layer deleted'); close(); };
$('#add-layer').onclick = () => { const existing = customNeuronLayers(); if (existing.length >= 99) return toast('Maximum of 99 custom layers'); const id = existing.length + 1, node = document.createElement('button'), connector = document.createElement('div'), add = $('#add-layer'); node.className = 'neuron'; node.dataset.layer = id; node.dataset.name = `Custom neuron layer ${String(id).padStart(2, '0')}`; node.dataset.count = 128; node.innerHTML = `<i>${String(id).padStart(2, '0')}</i><b>Custom<br>neuron layer</b><span>128 neurons</span>`; connector.className = 'connector'; add.before(node); add.before(connector); bind(node); refreshSections(); openEditor(node); };
$('#minus').onclick = () => { zoom = Math.max(20, zoom - 10); draw(); }; $('#plus').onclick = () => { zoom = Math.min(1000, zoom + 10); draw(); }; $('#fit').onclick = () => { zoom = 100; x = 0; y = 0; draw(); };
$('#save').onclick = saveProjects; $('#menu').onclick = () => { $('#nav').classList.add('open'); $('#scrim').classList.add('open'); renderProjects(); }; $('#nav-close').onclick = $('#scrim').onclick = () => { $('#nav').classList.remove('open'); $('#scrim').classList.remove('open'); }; $('#new-project').onclick = () => { const defaults = createDefaultEquations(); localStorage.setItem('nf-working-equations', JSON.stringify(defaults)); localStorage.setItem('nf-equations', JSON.stringify(defaults)); location.reload(); }; $('#projects-tab').onclick = () => location.href = 'projects.html';
Object.assign($('.workspace-tabs').style, { position: 'absolute', zIndex: 4, top: '0', left: 'calc(3vw + 20px)', paddingLeft: '0', background: 'transparent' });
$('main').style.position = 'relative';
$('#network-workspace').style.height = 'calc(100vh - 64px)';
$('#equations-workspace').style.height = 'calc(100vh - 64px)';
const outputTab = document.createElement('button'); outputTab.className = 'workspace-tab'; outputTab.id = 'output-tab'; outputTab.setAttribute('role', 'tab'); outputTab.textContent = 'Output'; $('#equations-tab').after(outputTab);
const outputWorkspace = document.createElement('section'); outputWorkspace.className = 'output-workspace'; outputWorkspace.id = 'output-workspace'; outputWorkspace.hidden = true; outputWorkspace.innerHTML = '<div class="output-main"><div class="output-head"><div><small>OUTPUT TRANSLATION</small><h1>Output functions</h1></div><button id="add-output-function" class="add-equation">+ Add function</button></div><p>Functions convert the AI’s output numbers into the text or code you need.</p><div id="output-functions" class="output-functions"></div></div><aside class="output-padding"><small>ALWAYS FIRST</small><div class="padding-head"><div><h2>Program padding</h2><p>This code is written at the start of every generated output program.</p></div><button id="add-start-function" class="start-function-button">◉ Start</button></div><div class="code-editor padding-code-editor"><pre class="code-lines" aria-hidden="true">1</pre><div id="output-padding-code" class="padding-code" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Program padding" spellcheck="false" data-placeholder="# Imports, setup, or a fixed header"></div></div></aside>'; $('main').append(outputWorkspace);
function defaultOutputEquation() { const equations = getEquations(); return equations.find((equation) => /linear|liner/i.test(equation.name))?.name || defaultEquationName(); }
function getOutputConfig() { try { const saved = JSON.parse(localStorage.getItem('nf-output-config') || ''); if (Array.isArray(saved.functions) && typeof saved.padding === 'string') return { ...saved, equation: saved.equation || defaultOutputEquation() }; } catch (_) {} return { functions: [], padding: '', equation: defaultOutputEquation() }; }
function storeOutputConfig(config) { localStorage.setItem('nf-output-config', JSON.stringify(config)); }
function addLineNumbers(editor) { const lines = editor.parentElement.querySelector('.code-lines'); const value = () => editor instanceof HTMLTextAreaElement ? editor.value : editor.innerText; const update = () => { lines.textContent = Array.from({ length: value().split('\n').length }, (_, i) => i + 1).join('\n'); }; if (!editor.dataset.lineNumbers) { editor.addEventListener('input', update); editor.addEventListener('scroll', () => { lines.scrollTop = editor.scrollTop; }); editor.dataset.lineNumbers = 'true'; } update(); return update; }
function outputCodeEditor(value, placeholder, onChange) { const shell = document.createElement('div'); shell.className = 'code-editor output-code-editor'; const lines = document.createElement('pre'); lines.className = 'code-lines'; lines.setAttribute('aria-hidden', 'true'); lines.textContent = '1'; const code = document.createElement('textarea'); code.className = 'output-function-code'; code.value = value || ''; code.placeholder = placeholder; code.spellcheck = false; code.wrap = 'off'; code.setAttribute('aria-label', 'Output function code'); shell.append(lines, code); const updateLines = addLineNumbers(code); code.oninput = () => { updateLines(); onChange(code.value); }; return shell; }
function serializePadding(editor) { const read = (node) => { if (node.nodeType === Node.TEXT_NODE) return node.textContent; if (node.nodeType !== Node.ELEMENT_NODE) return ''; if (node.classList.contains('start-inline-token')) return '[[START]]'; if (node.tagName === 'BR') return '\n'; return Array.from(node.childNodes).map(read).join('') + (node.tagName === 'DIV' ? '\n' : ''); }; return Array.from(editor.childNodes).map(read).join('').replace(/\n+$/, ''); }
function renderPadding(editor, value) { editor.replaceChildren(); String(value || '').split(/(\[\[START\]\])/g).forEach((part) => { if (part === '[[START]]') { const token = document.createElement('span'); token.className = 'start-inline-token'; token.contentEditable = 'false'; token.textContent = 'START'; editor.append(token); } else editor.append(document.createTextNode(part)); }); }
function insertStartToken() { const editor = $('#output-padding-code'); editor.focus(); const selection = window.getSelection(); let range = selection.rangeCount ? selection.getRangeAt(0) : null; if (!range || !editor.contains(range.commonAncestorContainer)) { range = document.createRange(); range.selectNodeContents(editor); range.collapse(false); } const token = document.createElement('span'); token.className = 'start-inline-token'; token.contentEditable = 'false'; token.textContent = 'START'; range.deleteContents(); range.insertNode(token); range.setStartAfter(token); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); editor.dispatchEvent(new Event('input', { bubbles: true })); }
function renderOutputWorkspace() { const config = getOutputConfig(), list = $('#output-functions'), padding = $('#output-padding-code'); list.innerHTML = ''; if (!config.functions.length) list.innerHTML = '<p class="empty-equations">No output functions yet. Add one to define how numbers become text or code.</p>'; config.functions.forEach((item, index) => { const card = document.createElement('article'); card.className = 'output-function'; const name = document.createElement('input'); name.className = 'output-function-name'; name.value = item.name || `Function ${index + 1}`; name.setAttribute('aria-label', 'Output function name'); const remove = document.createElement('button'); remove.className = 'delete-output-function'; remove.textContent = 'Delete'; remove.onclick = () => { config.functions.splice(index, 1); storeOutputConfig(config); renderOutputLayer(); renderOutputWorkspace(); }; const save = (code) => { item.name = name.value.trim() || `Function ${index + 1}`; if (code !== undefined) item.code = code; storeOutputConfig(config); renderOutputLayer(); }; name.oninput = () => save(); card.append(name, remove, outputCodeEditor(item.code, '# Write this output function', (code) => save(code))); list.append(card); }); renderPadding(padding, config.padding); const updatePaddingLines = addLineNumbers(padding); padding.oninput = () => { updatePaddingLines(); config.padding = serializePadding(padding); storeOutputConfig(config); }; }
$('#add-output-function').onclick = () => { const config = getOutputConfig(); config.functions.push({ name: `Function ${config.functions.length + 1}`, code: '' }); storeOutputConfig(config); renderOutputLayer(); renderOutputWorkspace(); const fields = document.querySelectorAll('.output-function-name'); fields.at(-1)?.focus(); };
$('#add-start-function').onclick = insertStartToken;
const contextTab = document.createElement('button'); contextTab.className = 'workspace-tab'; contextTab.id = 'context-tab'; contextTab.setAttribute('role', 'tab'); contextTab.textContent = 'Context graph'; $('#output-tab').after(contextTab);
const contextPowerValues = Object.freeze([2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096]);
function nearestContextPower(value, fallback = 256) { const number = Number(value); return contextPowerValues.reduce((nearest, option) => Math.abs(option - number) < Math.abs(nearest - number) ? option : nearest, contextPowerValues.includes(fallback) ? fallback : 256); }
function validSubdimensionSize(value, dimensions) { const total = nearestContextPower(dimensions); const allowed = contextPowerValues.filter((option) => option <= Math.min(total, 2048) && total % option === 0); const number = Number(value); return allowed.reduce((nearest, option) => Math.abs(option - number) < Math.abs(nearest - number) ? option : nearest, Math.min(16, total)); }
function powerSelectOptions(values, selected) { return values.map((value) => `<option value="${value}"${value === selected ? ' selected' : ''}>${value}</option>`).join(''); }
const contextWorkspace = document.createElement('section'); contextWorkspace.className = 'context-workspace'; contextWorkspace.id = 'context-workspace'; contextWorkspace.hidden = true; contextWorkspace.innerHTML = `<header class="context-head"><div><small>CONTEXT REPRESENTATION</small><h1>Context graph</h1><p>Each row is a token. Each column is a context dimension. Matching checks equally sized stages in order.</p></div><label>Dimensions <select id="context-dimensions">${powerSelectOptions(contextPowerValues, 256)}</select></label><label id="context-subdimensions-label">Dimensions per stage <select id="context-subdimensions">${powerSelectOptions(contextPowerValues.filter((value) => value <= 256), 16)}</select></label></header><div class="context-summary" id="context-summary"></div><div class="context-grid-wrap" id="context-grid-wrap"><div class="context-grid-spacer" id="context-grid-spacer"><canvas id="context-canvas" aria-label="Character context grid"></canvas></div></div>`; $('main').append(contextWorkspace);
function getContextConfig() { try { const saved = JSON.parse(localStorage.getItem('nf-context-config') || ''); if (saved && typeof saved === 'object') { const dimensions = nearestContextPower(saved.dimensions); return { dimensions, bits: Number(saved.bits) || 8, subdimensionSize: validSubdimensionSize(saved.subdimensionSize, dimensions) }; } } catch (_) {} return { dimensions: 256, bits: 8, subdimensionSize: 16 }; }
function storeContextConfig(config) { localStorage.setItem('nf-context-config', JSON.stringify(config)); }
function contextCharacters() { return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'.split(''); }
function renderContextGraph() { const config = getContextConfig(), dimensions = Math.max(1, Math.min(4096, config.dimensions)), bits = Math.max(1, Math.min(128, config.bits)), dimensionInput = $('#context-dimensions'), bitInput = $('#context-bits'), wrap = $('#context-grid-wrap'), spacer = $('#context-grid-spacer'), canvas = $('#context-canvas'), characters = contextCharacters(), cellWidth = 56, labelWidth = 95, rowHeight = 30, headerHeight = 30, maxValue = Math.pow(2, bits) - 1; dimensionInput.value = dimensions; bitInput.value = bits; $('#context-summary').textContent = `${dimensions} dimensions × ${bits}-bit values · ${characters.length} character rows`; spacer.style.width = `${labelWidth + dimensions * cellWidth}px`; spacer.style.height = `${headerHeight + characters.length * rowHeight}px`; const draw = () => { const width = wrap.clientWidth, height = wrap.clientHeight, left = wrap.scrollLeft, top = wrap.scrollTop, ratio = devicePixelRatio || 1; canvas.style.left = `${left}px`; canvas.style.top = `${top}px`; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio); const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = '#fffefa'; ctx.fillRect(0, 0, width, height); ctx.font = '10px DM Mono'; ctx.textBaseline = 'middle'; const firstDimension = Math.max(0, Math.floor((left - labelWidth) / cellWidth)), lastDimension = Math.min(dimensions - 1, Math.ceil((left + width - labelWidth) / cellWidth)); const firstRow = Math.max(0, Math.floor((top - headerHeight) / rowHeight)), lastRow = Math.min(characters.length - 1, Math.ceil((top - headerHeight) / rowHeight)); for (let dimension = firstDimension; dimension <= lastDimension; dimension++) { const x = labelWidth + dimension * cellWidth - left; ctx.fillStyle = '#e7f3ff'; ctx.fillRect(x, 0, cellWidth, headerHeight); ctx.fillStyle = '#315f89'; ctx.textAlign = 'right'; ctx.fillText(dimension, x + cellWidth - 8, 15); } for (let row = firstRow; row <= lastRow; row++) { const y = headerHeight + row * rowHeight - top, character = characters[row]; ctx.fillStyle = '#f7f2e8'; ctx.fillRect(0, y, labelWidth, rowHeight); ctx.fillStyle = '#242a36'; ctx.textAlign = 'left'; ctx.fillText(character === ' ' ? 'Space' : character, 9, y + rowHeight / 2); const base = character.charCodeAt(0); for (let dimension = firstDimension; dimension <= lastDimension; dimension++) { const x = labelWidth + dimension * cellWidth - left, value = Math.floor((base * 1103515245 + (dimension + 1) * 12345) % (maxValue + 1)); ctx.fillStyle = '#355466'; ctx.textAlign = 'right'; ctx.fillText(value, x + cellWidth - 8, y + rowHeight / 2); } } ctx.fillStyle = '#d7ebfa'; ctx.fillRect(0, 0, labelWidth, headerHeight); ctx.fillStyle = '#315f89'; ctx.textAlign = 'left'; ctx.fillText('Character', 9, 15); ctx.strokeStyle = '#e2e7e8'; ctx.lineWidth = 1; for (let dimension = firstDimension; dimension <= lastDimension + 1; dimension++) { const x = labelWidth + dimension * cellWidth - left; ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, height); ctx.stroke(); } for (let row = firstRow; row <= lastRow + 1; row++) { const y = headerHeight + row * rowHeight - top; ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(y + .5, height); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(labelWidth + .5, 0); ctx.lineTo(labelWidth + .5, height); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, headerHeight + .5); ctx.lineTo(width, headerHeight + .5); ctx.stroke(); }; wrap.onscroll = draw; draw(); }
function signedContextDecimal() { return '0'; }
renderContextGraph = function () { const config = getContextConfig(), dimensions = Math.max(1, Math.min(1024, config.dimensions)), bits = Math.max(1, Math.min(128, config.bits)), wrap = $('#context-grid-wrap'), spacer = $('#context-grid-spacer'), canvas = $('#context-canvas'), characters = contextCharacters(), cellWidth = 78, labelWidth = 95, rowHeight = 30, headerHeight = 30; $('#context-dimensions').value = dimensions; $('#context-bits').value = bits; $('#context-summary').textContent = `${dimensions} dimensions · signed ${bits}-bit values · each value × 2⁻${bits}`; spacer.style.width = `${labelWidth + dimensions * cellWidth}px`; spacer.style.height = `${headerHeight + characters.length * rowHeight}px`; const draw = () => { const width = wrap.clientWidth, height = wrap.clientHeight, left = wrap.scrollLeft, top = wrap.scrollTop, ratio = devicePixelRatio || 1, firstDimension = Math.max(0, Math.floor((left - labelWidth) / cellWidth)), lastDimension = Math.min(dimensions - 1, Math.ceil((left + width - labelWidth) / cellWidth)), firstRow = Math.max(0, Math.floor((top - headerHeight) / rowHeight)), lastRow = Math.min(characters.length - 1, Math.ceil((top + height - headerHeight) / rowHeight)); canvas.style.left = `${left}px`; canvas.style.top = `${top}px`; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio); const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = '#fffefa'; ctx.fillRect(0, 0, width, height); ctx.font = '10px DM Mono'; ctx.textBaseline = 'middle'; for (let d = firstDimension; d <= lastDimension; d++) { const x = labelWidth + d * cellWidth - left; ctx.fillStyle = '#e7f3ff'; ctx.fillRect(x, 0, cellWidth, headerHeight); ctx.fillStyle = '#315f89'; ctx.textAlign = 'right'; ctx.fillText(d, x + cellWidth - 8, 15); } for (let r = firstRow; r <= lastRow; r++) { const y = headerHeight + r * rowHeight - top, char = characters[r]; ctx.fillStyle = '#f7f2e8'; ctx.fillRect(0, y, labelWidth, rowHeight); ctx.fillStyle = '#242a36'; ctx.textAlign = 'left'; ctx.fillText(char === ' ' ? 'Space' : char, 9, y + 15); for (let d = firstDimension; d <= lastDimension; d++) { const x = labelWidth + d * cellWidth - left; ctx.fillStyle = '#355466'; ctx.textAlign = 'right'; ctx.fillText(signedContextDecimal(char, d, bits), x + cellWidth - 8, y + 15); } } ctx.fillStyle = '#d7ebfa'; ctx.fillRect(0, 0, labelWidth, headerHeight); ctx.fillStyle = '#315f89'; ctx.textAlign = 'left'; ctx.fillText('Character', 9, 15); ctx.strokeStyle = '#e2e7e8'; for (let d = firstDimension; d <= lastDimension + 1; d++) { const x = labelWidth + d * cellWidth - left; ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, height); ctx.stroke(); } for (let r = firstRow; r <= lastRow + 1; r++) { const y = headerHeight + r * rowHeight - top; ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(width, y + .5); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(labelWidth + .5, 0); ctx.lineTo(labelWidth + .5, height); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, headerHeight + .5); ctx.lineTo(width, headerHeight + .5); ctx.stroke(); }; wrap.onscroll = draw; draw(); };
const drawZeroInitializedContextGraph = renderContextGraph;
renderContextGraph = function () { drawZeroInitializedContextGraph(); const config = getContextConfig(); $('#context-summary').textContent = `${config.dimensions} dimensions split into ${config.dimensions / config.subdimensionSize} stages of ${config.subdimensionSize} · signed ${config.bits}-bit values · initialized at 0 until training`; };
function updateContextConfig() {
  const dimensions = nearestContextPower($('#context-dimensions').value);
  const config = {
    dimensions,
    bits: Number($('#context-bits').value) || 1,
    subdimensionSize: validSubdimensionSize($('#context-subdimensions').value, dimensions)
  };
  storeContextConfig(config);
  renderContextGraph();
  if ($('#learning-rate-numerator')) renderLearningRate();
}
$('#context-dimensions').onchange = updateContextConfig; $('#context-subdimensions').onchange = updateContextConfig; $('#context-bits').onchange = updateContextConfig;
const tensorTab = document.createElement('button'); tensorTab.className = 'workspace-tab'; tensorTab.id = 'tensor-tab'; tensorTab.setAttribute('role', 'tab'); tensorTab.textContent = 'Tensors'; $('#equations-tab').after(tensorTab);
const tensorWorkspace = document.createElement('section'); tensorWorkspace.className = 'tensor-workspace'; tensorWorkspace.id = 'tensor-workspace'; tensorWorkspace.hidden = true; tensorWorkspace.innerHTML = '<header class="tensor-head"><div><small>INPUT TENSOR LIMITS</small><h1>Tensor shapes</h1><p>Choose the largest input each source can use. Smaller inputs are padded when the model runs.</p></div></header><div class="tensor-cards"><article class="tensor-card"><label class="tensor-toggle"><input id="tensor-text-enabled" type="checkbox"> <span>Text input</span></label><div class="tensor-fields"><label>Maximum symbols <input id="tensor-text-length" type="number" min="1" max="1000000" step="1"></label></div><code id="tensor-text-shape"></code></article><article class="tensor-card"><label class="tensor-toggle"><input id="tensor-image-enabled" type="checkbox"> <span>Image input</span></label><div class="tensor-fields tensor-grid-fields"><label>Width <input id="tensor-image-width" type="number" min="1" max="100000" step="1"></label><label>Height <input id="tensor-image-height" type="number" min="1" max="100000" step="1"></label><label>Channels <select id="tensor-image-channels"><option value="1">1 · Greyscale</option><option value="3">3 · RGB</option><option value="4">4 · RGBA</option></select></label><label>Square size <input id="tensor-image-patch" type="number" min="1" max="100000" step="1"></label></div><code id="tensor-image-shape"></code></article><article class="tensor-card"><label class="tensor-toggle"><input id="tensor-video-enabled" type="checkbox"> <span>Video input</span></label><div class="tensor-fields tensor-grid-fields"><label>Maximum frames <input id="tensor-video-frames" type="number" min="1" max="100000" step="1"></label><label>Frame width <input id="tensor-video-width" type="number" min="1" max="100000" step="1"></label><label>Frame height <input id="tensor-video-height" type="number" min="1" max="100000" step="1"></label><label>Channels <select id="tensor-video-channels"><option value="1">1 · Greyscale</option><option value="3">3 · RGB</option><option value="4">4 · RGBA</option></select></label><label>Square size <input id="tensor-video-patch" type="number" min="1" max="100000" step="1"></label></div><code id="tensor-video-shape"></code></article></div><aside class="combined-tensor"><small>MODEL INPUT</small><b id="tensor-combined-shape"></b><p id="tensor-combined-note"></p></aside>'; $('main').append(tensorWorkspace);
tensorWorkspace.querySelector('.tensor-head').insertAdjacentHTML('beforeend', '<label class="tensor-batch">Batch size <input id="tensor-batch-size" type="number" min="1" max="100000" step="1"></label>'); tensorWorkspace.querySelector('#tensor-text-length').parentElement.firstChild.textContent = 'Maximum tokens '; tensorWorkspace.querySelector('.tensor-card:nth-child(1) .tensor-fields').insertAdjacentHTML('beforeend', '<label>When too long <select id="tensor-text-overflow"><option value="truncate">Truncate</option><option value="reject">Reject</option></select></label>'); tensorWorkspace.querySelector('.tensor-card:nth-child(2) .tensor-fields').insertAdjacentHTML('beforeend', '<label>Maximum images <input id="tensor-image-count" type="number" min="1" max="100000" step="1"></label><label>Size handling <select id="tensor-image-fit"><option value="pad">Pad to size</option><option value="resize">Resize to size</option><option value="reject">Reject mismatched size</option></select></label><label>Pixel values <select id="tensor-image-normalize"><option value="signed">Signed around zero</option><option value="zero-one">0 to 1</option><option value="raw">Raw channel values</option></select></label>'); tensorWorkspace.querySelector('.tensor-card:nth-child(3) .tensor-fields').insertAdjacentHTML('beforeend', '<label>Maximum videos <input id="tensor-video-count" type="number" min="1" max="100000" step="1"></label><label>Size handling <select id="tensor-video-fit"><option value="pad">Pad frames to size</option><option value="resize">Resize frames to size</option><option value="reject">Reject mismatched size</option></select></label><label>Pixel values <select id="tensor-video-normalize"><option value="signed">Signed around zero</option><option value="zero-one">0 to 1</option><option value="raw">Raw channel values</option></select></label>');
tensorWorkspace.querySelector('.tensor-batch').style.cssText = 'display:grid;gap:5px;margin:0;color:var(--muted);font-size:.68rem;font-weight:800'; tensorWorkspace.querySelector('.tensor-batch input').style.cssText = 'width:104px;height:38px;border:1px solid #9bbad5;border-radius:7px;background:#fffefa;padding:0 10px;color:var(--ink);font:700 .85rem DM Mono';
const tensorDefaults = { batchSize: 1, textEnabled: true, textLength: 1024, textOverflow: 'truncate', imageEnabled: false, imageCount: 1, imageWidth: 224, imageHeight: 224, imageChannels: 3, imagePatch: 16, imageFit: 'pad', imageNormalize: 'signed', videoEnabled: false, videoCount: 1, videoFrames: 16, videoWidth: 224, videoHeight: 224, videoChannels: 3, videoPatch: 16, videoFit: 'pad', videoNormalize: 'signed' };
function getTensorConfig() { try { const saved = JSON.parse(localStorage.getItem('nf-tensor-config') || ''); if (saved && typeof saved === 'object') return { ...tensorDefaults, ...saved }; } catch (_) {} return { ...tensorDefaults }; }
function positiveTensorNumber(value, fallback) { return Math.max(1, Math.min(1000000, Math.floor(Number(value) || fallback))); }
function storeTensorConfig(config) { localStorage.setItem('nf-tensor-config', JSON.stringify(config)); }
function renderTensorWorkspace() { const config = getTensorConfig(), dimensions = getContextConfig().dimensions, batch = positiveTensorNumber(config.batchSize, 1), imageCount = positiveTensorNumber(config.imageCount, 1), videoCount = positiveTensorNumber(config.videoCount, 1); Object.entries(config).forEach(([key, value]) => { const field = $(`#tensor-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`); if (!field) return; if (typeof value === 'boolean') field.checked = value; else field.value = value; }); const imageRows = Math.ceil(positiveTensorNumber(config.imageHeight, 224) / positiveTensorNumber(config.imagePatch, 16)), imageColumns = Math.ceil(positiveTensorNumber(config.imageWidth, 224) / positiveTensorNumber(config.imagePatch, 16)), imageItems = imageCount * imageRows * imageColumns; const videoRows = Math.ceil(positiveTensorNumber(config.videoHeight, 224) / positiveTensorNumber(config.videoPatch, 16)), videoColumns = Math.ceil(positiveTensorNumber(config.videoWidth, 224) / positiveTensorNumber(config.videoPatch, 16)), videoItems = videoCount * positiveTensorNumber(config.videoFrames, 16) * videoRows * videoColumns; $('#tensor-text-shape').textContent = config.textEnabled ? `[${positiveTensorNumber(config.textLength, 1024)} tokens] → [${positiveTensorNumber(config.textLength, 1024)} × ${dimensions}]` : 'Not included'; $('#tensor-image-shape').textContent = config.imageEnabled ? `[${imageCount} × ${config.imageHeight} × ${config.imageWidth} × ${config.imageChannels}] → [${imageCount} × ${imageRows} × ${imageColumns} × ${dimensions}] patch vectors` : 'Not included'; $('#tensor-video-shape').textContent = config.videoEnabled ? `[${videoCount} × ${config.videoFrames} × ${config.videoHeight} × ${config.videoWidth} × ${config.videoChannels}] → [${videoCount} × ${config.videoFrames} × ${videoRows} × ${videoColumns} × ${dimensions}] patch vectors` : 'Not included'; const total = (config.textEnabled ? positiveTensorNumber(config.textLength, 1024) : 0) + (config.imageEnabled ? imageItems : 0) + (config.videoEnabled ? videoItems : 0); $('#tensor-combined-shape').textContent = total ? `[${batch} × ${total} × ${dimensions}]` : 'Enable at least one input'; $('#tensor-combined-note').textContent = total ? `${batch.toLocaleString()} batch item(s), ${total.toLocaleString()} input items each, and ${dimensions} context values per item.` : 'No input sources are selected.'; document.querySelectorAll('.tensor-card').forEach((card) => { const enabled = card.querySelector('input[type="checkbox"]').checked; card.classList.toggle('disabled', !enabled); card.querySelectorAll('.tensor-fields input, .tensor-fields select').forEach((field) => field.disabled = !enabled); }); }
function updateTensorConfig() { const config = { ...getTensorConfig() }; document.querySelectorAll('[id^="tensor-"]').forEach((field) => { if (!field.matches('input, select')) return; const key = field.id.slice(7).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()); config[key] = field.type === 'checkbox' ? field.checked : field.tagName === 'SELECT' ? field.value : positiveTensorNumber(field.value, tensorDefaults[key]); }); storeTensorConfig(config); renderTensorWorkspace(); }
tensorWorkspace.addEventListener('change', updateTensorConfig);
const trainingTab = document.createElement('button'); trainingTab.className = 'workspace-tab'; trainingTab.id = 'training-tab'; trainingTab.setAttribute('role', 'tab'); trainingTab.textContent = 'Training'; $('#output-tab').after(trainingTab);
const trainingWorkspace = document.createElement('section'); trainingWorkspace.className = 'training-workspace'; trainingWorkspace.id = 'training-workspace'; trainingWorkspace.hidden = true; trainingWorkspace.innerHTML = '<header class="training-head"><div><small>MODEL TRAINING</small><h1>Training</h1><p>Define how the model judges its own output. More training controls will be added here.</p></div></header><div class="training-content"></div>'; $('main').append(trainingWorkspace);
const lossPanel = document.createElement('section');
lossPanel.className = 'loss-panel';
lossPanel.innerHTML = '<div><small>TRAINING OBJECTIVE</small><h2>Loss function</h2><p>Choose the saved equation that compares the model output Y with the correct target T. Training will reduce this value.</p></div><div class="loss-controls"><select id="loss-equation" aria-label="Loss function"></select><button type="button" id="create-loss-equation">+ Create loss equation</button></div>';
trainingWorkspace.querySelector('.training-content').append(lossPanel);
const learningRatePanel = document.createElement('section');
learningRatePanel.className = 'learning-rate-panel';
learningRatePanel.innerHTML = '<div><small>OPTIMIZER SETTING</small><h2>Learning rate</h2><p>Choose a whole-number fraction of the current bit range. The resulting rate is calculated automatically.</p></div><label for="learning-rate-numerator"><span id="learning-rate-label">Numerator</span><input id="learning-rate-numerator" type="text" inputmode="numeric" autocomplete="off" aria-label="Learning rate numerator"><output id="learning-rate-result"></output></label>';
trainingWorkspace.querySelector('.training-content').append(learningRatePanel);
const graderPanel = document.createElement('section');
graderPanel.className = 'grader-panel';
graderPanel.innerHTML = '<div><small>STEP 6 · AI GRADER</small><h2>Grade the completed program</h2><p>When the output loop stops, the runner sends the generated program result and this input argument to the selected AI grader. The grader must return a numeric grade or target that the training loss can use.</p></div><label for="grader-input-argument"><span>User-set input argument</span><textarea id="grader-input-argument" class="short" spellcheck="false" placeholder="Describe the input or task that the generated program result should be graded against."></textarea><output id="grader-payload"></output></label>';
trainingWorkspace.querySelector('.training-content').append(graderPanel);
function learningRateDenominator() { return 1n << BigInt(getContextConfig().bits); }
function validLearningRateNumerator(value, fallback = 1n) { let numerator; try { numerator = BigInt(String(value).trim()); } catch (_) { numerator = fallback; } const denominator = learningRateDenominator(); return numerator < 1n ? 1n : numerator > denominator ? denominator : numerator; }
const localGraderDefaults = Object.freeze({ enabled: true, runtime: 'ollama', model: 'qwen3:8b', baseUrl: 'http://127.0.0.1:11434', scoreMinimum: -127, scoreMaximum: 127, maxTokens: 80, timeoutSeconds: 120 });
const localGraderRuntimeDefaults = Object.freeze({ ollama: { model: 'qwen3:8b', baseUrl: 'http://127.0.0.1:11434' }, lmstudio: { model: 'local-model', baseUrl: 'http://127.0.0.1:1234/v1' }, llamacpp: { model: 'local-model', baseUrl: 'http://127.0.0.1:8080/v1' }, vllm: { model: 'Qwen/Qwen3-8B', baseUrl: 'http://127.0.0.1:8000/v1' } });
function clampWholeNumber(value, fallback, minimum, maximum) { const number = Math.round(Number(value)); return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback; }
function normaliseLocalGrader(value) { const saved = value && typeof value === 'object' ? value : {}; const runtime = Object.hasOwn(localGraderRuntimeDefaults, saved.runtime) ? saved.runtime : localGraderDefaults.runtime; const defaults = localGraderRuntimeDefaults[runtime]; const minimum = clampWholeNumber(saved.scoreMinimum, localGraderDefaults.scoreMinimum, -32768, 32767); const maximum = Math.max(minimum + 1, clampWholeNumber(saved.scoreMaximum, localGraderDefaults.scoreMaximum, -32767, 32768)); return { enabled: saved.enabled !== false, runtime, model: typeof saved.model === 'string' && saved.model.trim() ? saved.model.trim().slice(0, 240) : defaults.model, baseUrl: typeof saved.baseUrl === 'string' && saved.baseUrl.trim() ? saved.baseUrl.trim().replace(/\/+$/, '') : defaults.baseUrl, scoreMinimum: minimum, scoreMaximum: maximum, maxTokens: clampWholeNumber(saved.maxTokens, localGraderDefaults.maxTokens, 1, 2048), timeoutSeconds: clampWholeNumber(saved.timeoutSeconds, localGraderDefaults.timeoutSeconds, 5, 600) }; }
function getTrainingConfig() { let saved = {}; try { saved = JSON.parse(localStorage.getItem('nf-training-config') || '') || {}; } catch (_) {} const denominator = learningRateDenominator(); let fallback = 1n; if (saved.learningRate !== undefined && saved.learningRateNumerator === undefined) { const legacy = Number(saved.learningRate); if (Number.isFinite(legacy) && legacy > 0) fallback = BigInt(Math.max(1, Math.round(legacy * Number(denominator)))); } const numerator = validLearningRateNumerator(saved.learningRateNumerator, fallback); return { ...saved, lossEquationId: saved.lossEquationId || '', learningRateNumerator: numerator.toString(), learningRate: Number(numerator) / Number(denominator), graderInputArgument: typeof saved.graderInputArgument === 'string' ? saved.graderInputArgument : '', localGrader: normaliseLocalGrader(saved.localGrader) }; }
function storeTrainingConfig(config) { localStorage.setItem('nf-training-config', JSON.stringify(config)); }
function renderLossControl() { const select = $('#loss-equation'), config = getTrainingConfig(), equations = getEquations().filter((equation) => inferredEquationRole(equation) === 'evaluation'), selected = equations.some((equation) => equation.id === config.lossEquationId) ? config.lossEquationId : ''; if (config.lossEquationId !== selected) { config.lossEquationId = selected; storeTrainingConfig(config); } select.innerHTML = `<option value="">Choose an evaluation equation</option>${equations.map((equation) => `<option value="${equation.id}">${equation.name}</option>`).join('')}`; select.value = selected; }
function renderLearningRate() { const config = getTrainingConfig(), denominator = learningRateDenominator(), input = $('#learning-rate-numerator'); input.value = config.learningRateNumerator; input.setAttribute('aria-valuemin', '1'); input.setAttribute('aria-valuemax', denominator.toString()); $('#learning-rate-label').textContent = `Numerator · 1 to 2^${getContextConfig().bits}`; $('#learning-rate-result').textContent = `${config.learningRateNumerator} ÷ 2^${getContextConfig().bits} = ${config.learningRate.toPrecision(8)}`; }
function renderGraderPayload() { const config = getTrainingConfig(); $('#grader-input-argument').value = config.graderInputArgument; $('#grader-payload').textContent = 'Payload at the end of a run: generated program result + user-set input argument.'; }
$('#loss-equation').onchange = () => { const config = getTrainingConfig(); config.lossEquationId = $('#loss-equation').value; storeTrainingConfig(config); };
$('#learning-rate-numerator').oninput = () => { const input = $('#learning-rate-numerator'); if (!/^\d+$/.test(input.value)) return; const config = getTrainingConfig(); config.learningRateNumerator = validLearningRateNumerator(input.value, 1n).toString(); storeTrainingConfig(config); renderLearningRate(); };
$('#learning-rate-numerator').onchange = () => { const input = $('#learning-rate-numerator'), config = getTrainingConfig(); config.learningRateNumerator = validLearningRateNumerator(input.value, 1n).toString(); storeTrainingConfig(config); renderLearningRate(); };
$('#grader-input-argument').oninput = () => { const config = getTrainingConfig(); config.graderInputArgument = $('#grader-input-argument').value; storeTrainingConfig(config); renderGraderPayload(); };
$('#create-loss-equation').onclick = () => { const equation = newEquation(), equations = getEquations(), config = getTrainingConfig(); equation.name = 'Evaluation equation'; equation.role = 'evaluation'; equations.push(equation); config.lossEquationId = equation.id; storeEquations(equations); storeTrainingConfig(config); activeEquation = equation.id; history.replaceState(null, '', '#equations'); switchWorkspace('equations'); renderEquationRows(equation.id); };
const preDerivedTab = document.createElement('button'); preDerivedTab.className = 'workspace-tab'; preDerivedTab.id = 'pre-derived-tab'; preDerivedTab.setAttribute('role', 'tab'); preDerivedTab.textContent = 'Pre-derived equations'; $('#equations-tab').after(preDerivedTab);
const preDerivedWorkspace = document.createElement('section'); preDerivedWorkspace.className = 'pre-derived-workspace'; preDerivedWorkspace.id = 'pre-derived-workspace'; preDerivedWorkspace.hidden = true; preDerivedWorkspace.innerHTML = '<header class="pre-derived-head"><div><small>BEFORE TRAINING</small><h1>Pre-derived equations</h1><p>Read-only update equations prepared from every input group before training begins.</p></div></header><p class="pre-derived-key">Z = standardised neuron blame × learning rate</p><div class="pre-derived-graph" id="pre-derived-graph"></div>'; $('main').append(preDerivedWorkspace);
function splitTopLevel(expression) { const text = String(expression || '').replace(/\s+/g, ''), wrapped = text.match(/^\((.*)\)[÷/]([^÷/]+)$/); const source = wrapped ? wrapped[1] : text, divisor = wrapped ? wrapped[2] : ''; let depth = 0, start = 0, terms = []; for (let index = 0; index < source.length; index++) { const character = source[index]; if (character === '(') depth++; if (character === ')') depth--; if (character === '+' && depth === 0) { terms.push(source.slice(start, index)); start = index + 1; } } terms.push(source.slice(start)); return terms.filter(Boolean).map((term) => divisor ? `${term}÷${divisor}` : term); }
function equationSources() { const equations = new Map(getEquations().map((equation) => [equation.name, equation.expression || equation.lines?.join(' ') || ''])), sources = []; customNeuronLayers().forEach((layer, layerIndex) => defaultGroups(layer).forEach((group, groupIndex) => { const name = group.equation || defaultEquationName(), expression = equations.get(name) || ''; sources.push({ label: `Layer ${String(layerIndex + 1).padStart(2, '0')} · group ${String(groupIndex + 1).padStart(2, '0')}`, name, expression }); })); return sources; }
function weightAndBiasVariables(term) { return [...new Set([...String(term).matchAll(/[WB](?:[₀₁₂₃₄₅₆₇₈₉]+|\d*)/g)].map((match) => match[0]))]; }
function isolateVariable(term, variable) { let value = String(term); while (/^\([^()]+\)$/.test(value)) value = value.slice(1, -1); const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (value === variable) return `${variable} = Z`; let match = value.match(new RegExp(`^${escaped}[÷/]([^÷/]+)$`)); if (match) return `${variable} = Z × ${match[1]}`; match = value.match(new RegExp(`^${escaped}[×*]([^×*]+)$`)); if (match) return `${variable} = Z ÷ ${match[1]}`; match = value.match(new RegExp(`^([^×*]+)[×*]${escaped}$`)); if (match) return `${variable} = Z ÷ ${match[1]}`; match = value.match(new RegExp(`^([^÷/]+)[÷/]${escaped}$`)); if (match) return `${variable} = ${match[1]} ÷ Z`; return `${variable} = solve(${value}, Z)`; }
function parameterUpdate(term, variable) { const isolated = isolateVariable(term, variable), equals = isolated.indexOf('='); const change = equals === -1 ? `solve(${term}, Z)` : isolated.slice(equals + 1).trim(); return `${variable} ← ${variable} − (${change})`; }
function graphCard(className, label, primary, secondary) { const card = document.createElement('article'), eyebrow = document.createElement('small'), title = document.createElement('b'), detail = document.createElement('code'); card.className = className; eyebrow.textContent = label; title.textContent = primary; detail.textContent = secondary; card.append(eyebrow, title, detail); return card; }
function renderPreDerivedEquations() { const graph = $('#pre-derived-graph'), sources = equationSources(); graph.innerHTML = ''; const sourceRow = document.createElement('section'); sourceRow.className = 'pre-derived-row source-row'; sourceRow.innerHTML = '<div class="pre-derived-row-label"><small>01</small><b>Input group equations</b><span>Read-only sources</span></div>'; const sourceCards = document.createElement('div'); sourceCards.className = 'pre-derived-cards'; sources.forEach((source) => sourceCards.append(graphCard('pre-derived-card source-equation', source.label, source.name, source.expression || 'No expression saved'))); sourceRow.append(sourceCards); graph.append(sourceRow); const derivedRow = document.createElement('section'); derivedRow.className = 'pre-derived-row derived-row'; derivedRow.innerHTML = '<div class="pre-derived-row-label"><small>02</small><b>Weight & bias updates</b><span>Split at top-level +, set each term to Z, isolate, then apply</span></div>'; const derivedCards = document.createElement('div'); derivedCards.className = 'pre-derived-cards'; sources.forEach((source) => { splitTopLevel(source.expression).forEach((term) => { weightAndBiasVariables(term).forEach((variable) => { derivedCards.append(graphCard('pre-derived-card derived-equation', `${source.label} · ${variable}`, `${term} = Z`, parameterUpdate(term, variable))); }); }); }); if (!derivedCards.children.length) { const empty = document.createElement('p'); empty.className = 'pre-derived-empty'; empty.textContent = 'No weights or biases were found yet. Add W or B variables to an input-group equation to prepare its update form.'; derivedCards.append(empty); } derivedRow.append(derivedCards); graph.append(derivedRow); }
let activeEquation = null;
function newEquation() { return { id: `eq-${Date.now()}-${Math.random().toString(16).slice(2)}`, name: 'Untitled equation', expression: '', role: 'calculation' }; }
function renderEquationRows(focusId) {
  const rows = $('#equation-rows'), equations = getEquations();
  renderLossControl();
  rows.innerHTML = equations.length ? equations.map((equation) => `<article class="equation-row" data-id="${equation.id}"><input class="equation-name" aria-label="Equation name" value="${equation.name}"><input class="equation-expression" aria-label="Equation expression" inputmode="none" autocomplete="off" spellcheck="false" placeholder="Use the maths keyboard below" value="${equation.expression || equation.lines?.join(' ') || ''}"><button class="delete-equation" aria-label="Delete ${equation.name}">Delete</button></article>`).join('') : '<p class="empty-equations">No equations yet. Add one to begin.</p>';
  rows.querySelectorAll('.equation-row').forEach((row) => {
    const id = row.dataset.id, name = row.querySelector('.equation-name'), expression = row.querySelector('.equation-expression');
    const sync = () => { const data = getEquations(); const item = data.find((equation) => equation.id === id); if (!item) return; item.name = name.value.trim() || 'Untitled equation'; item.expression = expression.value; item.lines = [item.expression]; storeEquations(data); renderLossControl(); };
    name.onchange = sync; expression.oninput = sync;
    expression.onbeforeinput = (event) => { if (event.inputType === 'insertText' && /[A-Za-z]/.test(event.data || '')) event.preventDefault(); };
    expression.onfocus = () => { activeEquation = id; $('#keyboard-target').textContent = name.value.trim() || 'Untitled equation'; };
    row.querySelector('.delete-equation').onclick = () => { const training = getTrainingConfig(); if (training.lossEquationId === id) { training.lossEquationId = ''; storeTrainingConfig(training); } storeEquations(getEquations().filter((equation) => equation.id !== id)); if (activeEquation === id) activeEquation = null; renderEquationRows(); };
  });
  if (focusId) { const expression = rows.querySelector(`[data-id="${focusId}"] .equation-expression`); expression?.focus(); }
}
function insertMath(text) { if (!activeEquation) return toast('Select an equation first'); const input = $(`[data-id="${activeEquation}"] .equation-expression`); if (!input) return; const start = input.selectionStart, end = input.selectionEnd; input.value = input.value.slice(0, start) + text + input.value.slice(end); input.selectionStart = input.selectionEnd = start + text.length; input.dispatchEvent(new Event('input')); input.focus(); }
function backspaceMath() { if (!activeEquation) return; const input = $(`[data-id="${activeEquation}"] .equation-expression`); if (!input) return; const start = input.selectionStart, end = input.selectionEnd; if (start !== end) input.value = input.value.slice(0, start) + input.value.slice(end); else if (start) input.value = input.value.slice(0, start - 1) + input.value.slice(start); input.selectionStart = input.selectionEnd = Math.max(0, start - 1); input.dispatchEvent(new Event('input')); input.focus(); }
function switchWorkspace(name) { const equations = name === 'equations', output = name === 'output', context = name === 'context', tensors = name === 'tensors', training = name === 'training', preDerived = name === 'pre-derived'; $('#network-workspace').hidden = equations || output || context || tensors || training || preDerived; $('#equations-workspace').hidden = !equations; $('#output-workspace').hidden = !output; $('#context-workspace').hidden = !context; $('#tensor-workspace').hidden = !tensors; $('#training-workspace').hidden = !training; $('#pre-derived-workspace').hidden = !preDerived; $('#network-tab').classList.toggle('active', !equations && !output && !context && !tensors && !training && !preDerived); $('#equations-tab').classList.toggle('active', equations); $('#output-tab').classList.toggle('active', output); $('#context-tab').classList.toggle('active', context); $('#tensor-tab').classList.toggle('active', tensors); $('#training-tab').classList.toggle('active', training); $('#pre-derived-tab').classList.toggle('active', preDerived); if (equations) renderEquationRows(); if (output) renderOutputWorkspace(); if (context) renderContextGraph(); if (tensors) renderTensorWorkspace(); if (training) { renderLossControl(); renderLearningRate(); renderGraderPayload(); } if (preDerived) renderPreDerivedEquations(); }
$('#network-tab').onclick = () => { history.replaceState(null, '', location.pathname); switchWorkspace('network'); }; $('#equations-tab').onclick = () => { history.replaceState(null, '', '#equations'); switchWorkspace('equations'); }; $('#pre-derived-tab').onclick = () => { history.replaceState(null, '', '#pre-derived'); switchWorkspace('pre-derived'); }; $('#tensor-tab').onclick = () => { history.replaceState(null, '', '#tensors'); switchWorkspace('tensors'); }; $('#output-tab').onclick = () => { history.replaceState(null, '', '#output'); switchWorkspace('output'); }; $('#training-tab').onclick = () => { history.replaceState(null, '', '#training'); switchWorkspace('training'); }; $('#context-tab').onclick = () => { history.replaceState(null, '', '#context'); switchWorkspace('context'); };
function switchFromHash() { const name = location.hash.slice(1); switchWorkspace(['equations', 'pre-derived', 'tensors', 'output', 'training', 'context'].includes(name) ? name : 'network'); }
let storedNetwork = null;
try { storedNetwork = JSON.parse(localStorage.getItem('nf-working-network') || ''); } catch (_) {}
if (storedNetwork && Array.isArray(storedNetwork.layers) && storedNetwork.layers.length) { restoreWorkingNetwork(); $('#graph').querySelectorAll('.layer-stack').forEach((stack) => stack.remove()); const outputConnector = document.createElement('div'), layerConnector = document.createElement('div'); outputConnector.className = 'connector'; layerConnector.className = 'connector'; $('#add-layer').before(layerConnector); $('#add-layer').after(outputConnector); customNeuronLayers().forEach(bind); refreshSections(); renderOutputLayer(); }
storeWorkingNetwork();
$('#project-name').addEventListener('input', storeWorkingNetwork);
$('#count').addEventListener('input', storeWorkingNetwork);
postEquationRef.addEventListener('change', storeWorkingNetwork);
$('#down').addEventListener('click', storeWorkingNetwork);
$('#up').addEventListener('click', storeWorkingNetwork);
groupEditor.addEventListener('input', storeWorkingNetwork);
groupEditor.addEventListener('change', storeWorkingNetwork);
groupEditor.addEventListener('click', (event) => { if (event.target.closest('#delete-group')) setTimeout(storeWorkingNetwork, 0); });
$('#graph').addEventListener('click', (event) => { if (event.target.closest('.graph-add-group')) setTimeout(storeWorkingNetwork, 0); });
const addLayerWithSave = $('#add-layer').onclick, deleteLayerWithSave = deleteButton.onclick;
$('#add-layer').onclick = (event) => { addLayerWithSave(event); storeWorkingNetwork(); };
deleteButton.onclick = (event) => { deleteLayerWithSave(event); storeWorkingNetwork(); };
window.addEventListener('hashchange', switchFromHash);
$('#add-equation').onclick = () => { const equation = newEquation(), equations = getEquations(); equations.push(equation); storeEquations(equations); activeEquation = equation.id; renderEquationRows(equation.id); };
[['Aᵢ', 'Vector A'], ['Bᵢ', 'Vector B'], ['⟦…⟧ₓ', 'Repeat across x'], ['Y', 'Model output Y'], ['T', 'Correct target T']].forEach(([math, label]) => { const button = document.createElement('button'); button.dataset.math = math; button.textContent = label; $('.math-actions').append(button); });
document.querySelectorAll('[data-math]').forEach((button) => button.onclick = () => insertMath(button.dataset.math));
document.querySelectorAll('[data-variable]').forEach((button) => button.onclick = () => { if (button.dataset.variable === 'X') return insertMath('X'); const input = activeEquation && $(`[data-id="${activeEquation}"] .equation-expression`); const variable = button.dataset.variable, digits = '₀₁₂₃₄₅₆₇₈₉'; const used = new Set([...(input?.value.matchAll(new RegExp(`${variable}([₀₁₂₃₄₅₆₇₈₉]+)`, 'g')) || [])].map((match) => Number([...match[1]].map((digit) => digits.indexOf(digit)).join('')))); let number = 1; while (used.has(number)) number++; insertMath(`${variable}${String(number).split('').map((digit) => digits[Number(digit)]).join('')}`); });
$('#math-backspace').onclick = backspaceMath;
switchFromHash();
const viewport = $('#viewport'); viewport.onpointerdown = (e) => { if (e.target.closest('button, input, select, summary')) return; drag = { px: e.clientX, py: e.clientY, ox: x, oy: y }; viewport.classList.add('dragging'); viewport.setPointerCapture(e.pointerId); }; viewport.onpointermove = (e) => { if (!drag) return; x = drag.ox + e.clientX - drag.px; y = drag.oy + e.clientY - drag.py; draw(); }; viewport.onpointerup = () => { setTimeout(() => drag = null, 0); viewport.classList.remove('dragging'); };

// Input workspace: text, images, and video all become model input. Video is first
// reduced to a selected set of frames, using two user-selectable saved equations.
Object.assign(tensorDefaults, {
  videoChangeEquation: 'Frame change energy',
  videoThresholdEquation: 'Adaptive frame threshold',
  currentSceneEnabled: true
});

tensorTab.textContent = 'Input';
tensorWorkspace.querySelector('.tensor-head small').textContent = 'FOUR INPUT SOURCES';
tensorWorkspace.querySelector('.tensor-head h1').textContent = 'Input setup';
tensorWorkspace.querySelector('.tensor-head p').textContent = 'Enable text, image, and video inputs together. Current Scene is always included and keeps outputs from earlier runs in the same call.';
$('#tensor-image-width').parentElement.firstChild.textContent = 'Width ';
$('#tensor-image-height').parentElement.firstChild.textContent = 'Height ';
$('#tensor-video-width').parentElement.firstChild.textContent = 'Width ';
$('#tensor-video-height').parentElement.firstChild.textContent = 'Height ';
$('#tensor-image-width').parentElement.before($('#tensor-image-height').parentElement);
$('#tensor-video-width').parentElement.before($('#tensor-video-height').parentElement);
$('#tensor-image-patch').closest('label').remove();
$('#tensor-video-patch').closest('label').remove();
$('#tensor-image-count').closest('label').remove();
$('#tensor-video-count').closest('label').remove();
$('#tensor-video-frames').parentElement.firstChild.textContent = 'Maximum kept frames ';

const videoFields = tensorWorkspace.querySelector('.tensor-card:nth-child(3) .tensor-fields');
videoFields.insertAdjacentHTML('beforeend', `<section class="video-frame-selection" aria-label="Video frame selection"><small>FRAME SELECTION</small><p>Each batch record has one video, split into frames. One equation measures the change from the frame before it, and another decides whether to keep it.</p><label>Frame change equation <select id="tensor-video-change-equation">${equationOptions('Frame change energy')}</select></label><label>Keep frame threshold equation <select id="tensor-video-threshold-equation">${equationOptions('Adaptive frame threshold')}</select></label><p class="video-frame-formula" id="video-frame-formula"></p></section>`);
tensorWorkspace.querySelector('.tensor-cards').insertAdjacentHTML('beforeend', `<article class="tensor-card current-scene-card"><label class="tensor-toggle"><input id="tensor-current-scene-enabled" type="checkbox" checked disabled> <span>Current Scene</span><small>Always included</small></label><div class="current-scene-detail"><p>Each record keeps the output values from earlier runs of this neural link during the current call. The values are converted into scene token IDs, so input groups read them through a scene context graph instead of directly as raw values.</p><p>The scene starts empty on the first run. Each completed non-STOP run appends its output values for the next run.</p></div><code id="tensor-current-scene-shape"></code></article>`);

const legacyRenderTensorWorkspace = renderTensorWorkspace;
renderTensorWorkspace = function renderInputWorkspace() {
  legacyRenderTensorWorkspace();
  const config = getTensorConfig();
  const batch = positiveTensorNumber(config.batchSize, 1);
  const dimensions = getContextConfig().dimensions;
  const changeEquation = config.videoChangeEquation || 'Frame change energy';
  const thresholdEquation = config.videoThresholdEquation || 'Adaptive frame threshold';
  const changeSelect = $('#tensor-video-change-equation');
  const thresholdSelect = $('#tensor-video-threshold-equation');
  const sceneToggle = $('#tensor-current-scene-enabled');
  if (changeSelect && [...changeSelect.options].some((option) => option.value === changeEquation)) changeSelect.value = changeEquation;
  if (thresholdSelect && [...thresholdSelect.options].some((option) => option.value === thresholdEquation)) thresholdSelect.value = thresholdEquation;
  if (sceneToggle) { sceneToggle.checked = true; sceneToggle.disabled = true; }
  $('#video-frame-formula').textContent = 'The selected threshold equation decides whether to keep each frame.';
  $('#tensor-text-shape').textContent = config.textEnabled
    ? `Token IDs: [${batch} × ${positiveTensorNumber(config.textLength, 1024)}]\nShared token context graph: [token rows × ${dimensions}]`
    : 'Not included';
  $('#tensor-image-shape').textContent = config.imageEnabled
    ? `Visual token IDs: [${batch} × ${positiveTensorNumber(config.imageHeight, 224)} × ${positiveTensorNumber(config.imageWidth, 224)}]\nShared visual context graph: [visual token rows × ${dimensions}]`
    : 'Not included';
  if (config.videoEnabled) {
    $('#tensor-video-shape').textContent = `Visual token IDs: [${batch} × ${positiveTensorNumber(config.videoFrames, 16)} × ${positiveTensorNumber(config.videoHeight, 224)} × ${positiveTensorNumber(config.videoWidth, 224)}]\nShared visual context graph: [visual token rows × ${dimensions}]`;
  }
  $('#tensor-current-scene-shape').textContent = `Scene token IDs: [R, T]\nScene context lookup: [T × 256, D]\nEvery function/value pair has its own 8-bit token ID`;
  const enabledSources = [config.textEnabled && 'Text', config.imageEnabled && 'Image', config.videoEnabled && 'Video', 'Current Scene'].filter(Boolean);
  $('#tensor-combined-shape').textContent = 'Separate input tensors';
  $('#tensor-combined-note').textContent = `${enabledSources.join(', ')} remain separate. Input groups read token IDs through their context graphs; they do not store copied patches.`;
};

tensorWorkspace.removeEventListener('change', updateTensorConfig);
function updateInputConfig() {
  const config = { ...getTensorConfig() };
  delete config.videoThresholdMultiplier;
  delete config.imagePatch;
  delete config.videoPatch;
  delete config.imageCount;
  delete config.videoCount;
  document.querySelectorAll('[id^="tensor-"]').forEach((field) => {
    if (!field.matches('input, select')) return;
    const key = field.id.slice(7).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (field.type === 'checkbox') config[key] = field.checked;
    else if (field.tagName === 'SELECT') config[key] = field.value;
    else config[key] = positiveTensorNumber(field.value, tensorDefaults[key]);
  });
  storeTensorConfig(config);
  renderTensorWorkspace();
}
tensorWorkspace.addEventListener('change', updateInputConfig);

const originalSwitchWorkspace = switchWorkspace;
switchWorkspace = (name) => originalSwitchWorkspace(name === 'input' ? 'tensors' : name);
$('#tensor-tab').onclick = () => { history.replaceState(null, '', '#input'); switchWorkspace('input'); };
window.addEventListener('hashchange', () => { if (location.hash === '#input') switchWorkspace('input'); });
if (location.hash === '#input') switchWorkspace('input');

const inputWorkspaceStyles = document.createElement('style');
inputWorkspaceStyles.textContent = '.video-frame-selection{grid-column:1/-1;display:grid;gap:9px;margin-top:4px;padding:12px;border:1px solid #a9c9df;border-radius:7px;background:#eef8ff}.video-frame-selection small{color:#315f89;font:800 .62rem DM Mono;letter-spacing:.08em}.video-frame-selection p{margin:0;color:#486b85;font-size:.69rem;line-height:1.5}.video-frame-selection label{display:grid;gap:5px;margin:0;color:#315f89;font-size:.66rem;font-weight:800}.video-frame-selection input,.video-frame-selection select{width:100%;height:37px;border:1px solid #9bbad5;border-radius:6px;background:#fffefa;padding:0 8px;color:var(--ink);font:700 .76rem DM Mono}.video-frame-formula{padding-top:2px;color:#315f89!important;font:.65rem/1.55 DM Mono!important}.tensor-card code{white-space:pre-line}.current-scene-card{border-color:#8bb2d1;background:#f2f8fc}.current-scene-card .tensor-toggle{cursor:default}.current-scene-card .tensor-toggle small{margin-left:auto;color:#315f89;font:.63rem DM Mono}.current-scene-detail{display:grid;gap:8px;margin:8px 0 12px;padding:11px 12px;border-radius:7px;background:#eaf4fc;color:#315f89}.current-scene-detail p{margin:0;font-size:.73rem;line-height:1.55}';
document.head.append(inputWorkspaceStyles);

// Architecture v2: the working surfaces below mirror the model specification.
// They save configuration locally; they do not execute or train a model yet.
Object.assign(tensorDefaults, {
  historyMessages: 16,
  historyDynamicNeurons: 8,
  historyCycles: 16,
  historyRuns: 8,
  inputEquation: 'Neuron calculation',
  inputFormatEquation: 'Identity'
});

function v2SetSelectOptions(select, selected) {
  if (!select) return;
  select.innerHTML = equationOptions(selected);
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
}

function v2EnsureInputArchitecture() {
  tensorWorkspace.querySelector('.tensor-head small').textContent = 'STEP 1 · INPUT GRIDS';
  tensorWorkspace.querySelector('.tensor-head h1').textContent = 'Conversation input';
  tensorWorkspace.querySelector('.tensor-head p').textContent = 'Every run receives the current input together with saved user-message and network history. Sources stay separate until the input layer chooses token-centred groups.';
  tensorWorkspace.querySelector('.tensor-card:nth-child(1) .tensor-toggle span').textContent = 'Text tokens';
  tensorWorkspace.querySelector('.tensor-card:nth-child(2) .tensor-toggle span').textContent = 'Image tokens';
  tensorWorkspace.querySelector('.tensor-card:nth-child(3) .tensor-toggle span').textContent = 'Video tokens';
  const sceneCard = $('.current-scene-card');
  if (sceneCard) {
    sceneCard.querySelector('.tensor-toggle span').textContent = 'Network history';
    sceneCard.querySelector('.tensor-toggle small').textContent = 'Always included';
    sceneCard.querySelector('.current-scene-detail').innerHTML = '<p>Each user input-output cycle saves the output-neuron values produced during its runs. Earlier cycles remain separate from the current cycle.</p><p>Network-history values use a context grid so the input layer can compare them like other tokens.</p>';
  }
  if (!$('#history-grid-panel')) {
    const panel = document.createElement('section');
    panel.className = 'history-grid-panel';
    panel.id = 'history-grid-panel';
    panel.innerHTML = `<div><small>CONVERSATION MEMORY</small><h2>Saved history grids</h2><p>After every user message, token-centred dynamic neurons make a fixed number of message summaries. The averages are saved for the next user input.</p></div><div class="history-controls"><label>Saved messages <input id="tensor-history-messages" type="number" min="1" max="100000" step="1"></label><label>Dynamic neurons per message <input id="tensor-history-dynamic-neurons" type="number" min="1" max="100000" step="1"></label><label>Cycles per message <input id="tensor-history-cycles" type="number" min="1" max="100000" step="1"></label><label>Runs per cycle <input id="tensor-history-runs" type="number" min="1" max="100000" step="1"></label></div><code id="history-grid-shapes"></code>`;
    $('.combined-tensor').before(panel);
  }
  if (!$('#input-layer-panel')) {
    const panel = document.createElement('section');
    panel.className = 'input-layer-panel';
    panel.id = 'input-layer-panel';
    panel.innerHTML = `<div><small>STEP 2 · INPUT LAYER</small><h2>Token-centred dynamic neurons</h2><p>Every token becomes a chosen point. Its dynamic neuron searches nearby input tokens, uses context plus positions where available, then runs the chosen calculation and formatting equations.</p></div><div class="input-layer-controls"><label>Calculation equation <select id="tensor-input-equation"></select></label><label>Formatting equation <select id="tensor-input-format-equation"></select></label></div><code id="input-layer-route"></code>`;
    $('.combined-tensor').after(panel);
  }
}

const v2RenderInputWorkspace = renderTensorWorkspace;
renderTensorWorkspace = function renderArchitectureInput() {
  v2RenderInputWorkspace();
  v2EnsureInputArchitecture();
  const config = getTensorConfig();
  const dimensions = getContextConfig().dimensions;
  const value = (id, fallback) => { const field = $(id); if (field) field.value = config[id.slice(8).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] ?? fallback; };
  value('#tensor-history-messages', 16);
  value('#tensor-history-dynamic-neurons', 8);
  value('#tensor-history-cycles', 16);
  value('#tensor-history-runs', 8);
  v2SetSelectOptions($('#tensor-input-equation'), config.inputEquation || 'Neuron calculation');
  v2SetSelectOptions($('#tensor-input-format-equation'), config.inputFormatEquation || 'Identity');
  const textShape = config.textEnabled
    ? `Text token IDs: [B, T]\nAverage text positions: [B, T]\nSaved pieces match first; all other characters use UTF-8 byte tokens.`
    : 'Text is not included';
  const imageShape = config.imageEnabled
    ? `Image tokens: [B, T, P]\nP = token ID + x/y position\nPixel colour is simplified to 3-bit values before visual tokens are used`
    : 'Images are not included';
  const videoShape = config.videoEnabled
    ? `Video tokens: [B, T, P]\nP = token ID + x/y/frame position\nThe selected equations keep frames with the most meaningful visual change`
    : 'Videos are not included';
  $('#tensor-text-shape').textContent = textShape;
  $('#tensor-image-shape').textContent = imageShape;
  $('#tensor-video-shape').textContent = videoShape;
  $('#tensor-current-scene-shape').textContent = `Scene token IDs: [R, T]\nAverage R positions: [R, T]\nScene context lookup: [T × 256, D]\nEvery function/value pair has its own 8-bit token ID`;
  $('#history-grid-shapes').textContent = `User-message history: [H, N, D]\nH = saved messages · N = ${positiveTensorNumber(config.historyDynamicNeurons, 8)} dynamic neuron summaries · D = ${dimensions} context dimensions\nNetwork history: [H, C, O] · runs inside each cycle: [R, O]`;
  $('#input-layer-route').textContent = 'Text searches context-near tokens. Image and video searches use context plus token positions. Network history uses [R, T] token positions. Each selected group then becomes one formatted neuron value.';
  $('#tensor-combined-shape').textContent = 'Four separate token grids';
  $('#tensor-combined-note').textContent = 'Text, image, video, and network-history data remain in their own grids. The input layer decides what each token-centred dynamic neuron reads.';
}

function v2PresentInputLayer() {
  const first = customNeuronLayers()[0];
  if (!first) return;
  first.dataset.name = 'Dynamic input layer';
  const title = first.querySelector('b');
  if (title) title.innerHTML = 'Dynamic<br>input layer';
  const endpoint = $('.endpoint');
  if (endpoint) { endpoint.querySelector('small').textContent = 'INPUT'; endpoint.querySelector('b').textContent = 'Conversation grids'; endpoint.querySelector('span').textContent = 'tokens + history'; }
  refreshSections();
}

const v2OpenGroupEditor = openGroupEditor;
openGroupEditor = function openArchitectureGroupEditor(node, index) {
  const layers = customNeuronLayers();
  const inputLayer = layers.indexOf(node) === 0;
  const groups = defaultGroups(node);
  const group = groups[index];
  if (inputLayer && group && group.mode !== 'dynamic') {
    group.mode = 'dynamic';
    node.dataset.groups = JSON.stringify(groups);
    storeWorkingNetwork();
  }
  v2OpenGroupEditor(node, index);
  if (inputLayer) {
    const mode = $('#group-mode');
    if (mode) { mode.value = 'dynamic'; mode.disabled = true; }
    const overview = document.createElement('section');
    overview.className = 'architecture-group-note';
    overview.innerHTML = '<small>INPUT-LAYER RULE</small><b>One dynamic neuron per token</b><p>Each token is a search centre. Text compares context rows; images and videos compare context plus their positions; network history treats its token positions as a grid. The saved group equation runs on the selected inputs, then the layer formatting equation runs.</p>';
    groupEditor.querySelector('.group-range')?.before(overview);
    const sourceSections = groupEditor.querySelector('.source-section:last-of-type');
    if (sourceSections) sourceSections.insertAdjacentHTML('afterend', '<section class="source-section architecture-source"><summary>Video and network history</summary><div class="source-section-body"><p>Video tokens search in x/y/frame space. Network-history tokens search their [B, T] positions and context rows. Both are automatically available whenever their input grids exist.</p></div></section>');
  } else {
    const requirement = groupEditor.querySelector('.dynamic-requirement');
    if (requirement) requirement.textContent = 'Dynamic wire groups compare the scalar output values from the previous layer and connect to the values closest to the target below.';
    if (group && !$('#group-dynamic-target')) {
      const target = document.createElement('label');
      target.className = 'architecture-target';
      target.innerHTML = 'Dynamic target output <input id="group-dynamic-target" type="number" step="any" value="' + (group.dynamicTarget ?? 0) + '">';
      groupEditor.querySelector('#group-equation')?.closest('label')?.before(target);
      const field = target.querySelector('input');
      field.oninput = () => { group.dynamicTarget = Number(field.value) || 0; node.dataset.groups = JSON.stringify(groups); storeWorkingNetwork(); };
    }
  }
};

function v2EnsureTrainingArchitecture() {
  trainingWorkspace.querySelector('.training-head small').textContent = 'STEPS 5–7 · TRAINING LOOP';
  trainingWorkspace.querySelector('.training-head h1').textContent = 'AI grading and blame';
  trainingWorkspace.querySelector('.training-head p').textContent = 'The completed padded result receives one bounded local grader score, which becomes the reward signal used by the saved update equations.';
  lossPanel.querySelector('small').textContent = 'OPTIONAL LOSS EQUATION';
  lossPanel.querySelector('h2').textContent = 'Additional loss calculation';
  lossPanel.querySelector('p').textContent = 'Use this only when you need an extra comparison after the grader score. The base training signal comes from the single grader number below.';
  graderPanel.querySelector('small').textContent = 'STEP 5 · AI GRADER';
  graderPanel.querySelector('h2').textContent = 'One bounded grader score';
  graderPanel.querySelector('p').textContent = 'The selected local grader receives the finished padding-program result and this prompt. It must return one whole score in the configured range, where a higher number means a better result.';
  const argumentLabel = graderPanel.querySelector('label span');
  if (argumentLabel) argumentLabel.textContent = 'Grader prompt';
  $('#grader-input-argument').placeholder = 'Explain what a correct completed result should do.';
  if (!$('#grader-environment')) {
    const environment = document.createElement('label');
    environment.className = 'grader-environment-label';
    environment.innerHTML = '<span>Optional code environment</span><textarea id="grader-environment" class="short" spellcheck="false" placeholder="Describe the permitted environment, commands, files, or test harness available to the grader."></textarea>';
    graderPanel.querySelector('label').after(environment);
  }
  if (!$('#local-grader-runtime')) {
    const local = document.createElement('section');
    local.className = 'local-grader-panel';
    local.innerHTML = '<div><small>LOCAL GRADER RUNTIME</small><h2>Selected at export</h2><p>The generated Python file contains only this adapter. Start the matching local server on the Vast instance before training; its model is not bundled into the export.</p></div><div class="local-grader-fields"><label class="local-grader-enabled"><input id="local-grader-enabled" type="checkbox"> Use a local grader</label><label>Runtime<select id="local-grader-runtime"><option value="ollama">Ollama</option><option value="lmstudio">LM Studio server</option><option value="llamacpp">llama.cpp server</option><option value="vllm">vLLM server</option></select></label><label>Model name or loaded model<input id="local-grader-model" type="text" spellcheck="false" autocomplete="off"></label><label>Server address<input id="local-grader-url" type="url" spellcheck="false" autocomplete="off"></label><label>Lowest score<input id="local-grader-min" type="number" step="1"></label><label>Highest score<input id="local-grader-max" type="number" step="1"></label><label>Reply tokens<input id="local-grader-tokens" type="number" min="1" max="2048" step="1"></label><label>Timeout seconds<input id="local-grader-timeout" type="number" min="5" max="600" step="1"></label><output id="local-grader-note"></output></div>';
    graderPanel.after(local);
  }
  if (!$('#blame-panel')) {
    const panel = document.createElement('section');
    panel.className = 'blame-panel';
    panel.id = 'blame-panel';
    panel.innerHTML = '<div><small>STEP 6 · BACKWARD BLAME</small><h2>Keep the blame total stable</h2><p>The final grader score is turned into a reward signal. It travels backward through the actual connections used in the run. Within each layer, individual shares may change, but their total stays tied to that final reward.</p></div><code id="blame-route"></code><button type="button" id="open-pre-derived">Open pre-derived equations</button>';
    trainingWorkspace.querySelector('.training-content').append(panel);
    $('#open-pre-derived').onclick = () => { history.replaceState(null, '', '#pre-derived'); switchWorkspace('pre-derived'); };
  }
}

function v2RenderTrainingArchitecture() {
  v2EnsureTrainingArchitecture();
  const config = getTrainingConfig();
  const environment = $('#grader-environment');
  environment.value = config.graderEnvironment || '';
  const grader = config.localGrader;
  $('#local-grader-enabled').checked = grader.enabled;
  $('#local-grader-runtime').value = grader.runtime;
  $('#local-grader-model').value = grader.model;
  $('#local-grader-url').value = grader.baseUrl;
  $('#local-grader-min').value = grader.scoreMinimum;
  $('#local-grader-max').value = grader.scoreMaximum;
  $('#local-grader-tokens').value = grader.maxTokens;
  $('#local-grader-timeout').value = grader.timeoutSeconds;
  $('#local-grader-note').textContent = grader.enabled ? `Export includes the ${$('#local-grader-runtime').selectedOptions[0].textContent} adapter only. It accepts one whole score from ${grader.scoreMinimum} to ${grader.scoreMaximum}; higher is better.` : 'Local grading is disabled. Export keeps the manual reward_train_step() entry point.';
  $('#grader-payload').textContent = `Required reply: one whole number from ${grader.scoreMinimum} to ${grader.scoreMaximum}; higher means a better result.`;
  $('#blame-route').textContent = `grader score → reward scale\nEach neuron returns its blame share through the connections used in the forward run.\nInput context-row positions are trainable; token IDs never change.\nPre-derived update side: Z = neuron blame × learning rate.`;
}

$('#grader-environment')?.addEventListener('input', () => {});

const v2RenderGraderPayload = renderGraderPayload;
renderGraderPayload = function renderArchitectureGrader() {
  v2RenderGraderPayload();
  v2RenderTrainingArchitecture();
};

const v2RenderPreDerived = renderPreDerivedEquations;
renderPreDerivedEquations = function renderArchitecturePreDerived() {
  v2RenderPreDerived();
  $('.pre-derived-head p').textContent = 'Read-only weight and bias changes prepared from the equations assigned to each neuron group.';
  $('.pre-derived-key').textContent = 'Z = neuron blame rate × learning rate';
  const label = $('.derived-row .pre-derived-row-label span');
  if (label) label.textContent = 'Split at top-level +, isolate the W/B term, then use Z as its change amount';
};

$('#grader-environment')?.addEventListener('input', () => {
  const config = getTrainingConfig();
  config.graderEnvironment = $('#grader-environment').value;
  storeTrainingConfig(config);
});

function saveLocalGraderFields(resetRuntimeValues = false) {
  const config = getTrainingConfig();
  const runtime = $('#local-grader-runtime').value;
  const defaults = localGraderRuntimeDefaults[runtime];
  config.localGrader = normaliseLocalGrader({
    ...config.localGrader,
    enabled: $('#local-grader-enabled').checked,
    runtime,
    model: resetRuntimeValues ? defaults.model : $('#local-grader-model').value,
    baseUrl: resetRuntimeValues ? defaults.baseUrl : $('#local-grader-url').value,
    scoreMinimum: $('#local-grader-min').value,
    scoreMaximum: $('#local-grader-max').value,
    maxTokens: $('#local-grader-tokens').value,
    timeoutSeconds: $('#local-grader-timeout').value
  });
  storeTrainingConfig(config);
  v2RenderTrainingArchitecture();
}

['local-grader-enabled', 'local-grader-model', 'local-grader-url', 'local-grader-min', 'local-grader-max', 'local-grader-tokens', 'local-grader-timeout'].forEach((id) => {
  $(`#${id}`)?.addEventListener('change', () => saveLocalGraderFields());
});
$('#local-grader-runtime')?.addEventListener('change', () => saveLocalGraderFields(true));

const v2SwitchWorkspace = switchWorkspace;
switchWorkspace = (name) => {
  v2SwitchWorkspace(name);
  if (name === 'input' || name === 'tensors') renderTensorWorkspace();
  if (name === 'training') v2RenderTrainingArchitecture();
  if (name === 'pre-derived') renderPreDerivedEquations();
};

v2PresentInputLayer();
renderTensorWorkspace();
v2EnsureTrainingArchitecture();

// The first layer is fully defined by the saved input grids.  Showing the
// previous manual input-group controls here allowed configurations that this
// runtime cannot honour, so it is presented as one automatic token layer.
function v3IsInputLayer(node) { return customNeuronLayers()[0] === node; }
function v3PresentAutomaticInputLayer() {
  const first = customNeuronLayers()[0];
  if (!first) return;
  first.dataset.name = 'Dynamic input layer';
  first.querySelector('b').innerHTML = 'Dynamic<br>input layer';
  first.querySelector('span').textContent = 'one neuron per token';
  const stack = first.parentElement.classList.contains('layer-stack') ? first.parentElement : ensureLayerStack(first);
  const bubbles = stack.querySelector('.input-group-bubbles');
  const addGroup = stack.querySelector('.graph-add-group');
  if (bubbles) bubbles.innerHTML = '<div class="input-layer-system-card"><small>AUTOMATIC</small><b>Token-centred<br>connections</b><span>Configure in Input</span></div>';
  if (addGroup) addGroup.hidden = true;
  const firstSection = sectionList.querySelector('button');
  if (firstSection) firstSection.textContent = 'Dynamic input layer · per token';
}

const v3RefreshSections = refreshSections;
refreshSections = function refreshArchitectureSections() {
  v3RefreshSections();
  const firstSection = sectionList.querySelector('button');
  if (firstSection) firstSection.textContent = 'Dynamic input layer · per token';
};

const v3RenderLayerGroups = renderLayerGroups;
renderLayerGroups = function renderArchitectureGroups(node, groups) {
  v3RenderLayerGroups(node, groups);
  if (v3IsInputLayer(node)) v3PresentAutomaticInputLayer();
};

const v3OpenEditor = openEditor;
openEditor = function openArchitectureEditor(node) {
  if (v3IsInputLayer(node)) {
    close();
    history.replaceState(null, '', '#input');
    switchWorkspace('input');
    toast('Configure the automatic input layer in the Input tab');
    return;
  }
  v3OpenEditor(node);
};

v3PresentAutomaticInputLayer();

// Rebuilt equation library: a focused expression list plus a Desmos-inspired
// keypad. Expressions remain saved in the existing project record.
const equationWorkspace = $('#equations-workspace');
equationWorkspace.innerHTML = `
  <div class="equation-studio">
    <header class="equation-studio-head">
      <div><small>MODEL EQUATIONS · SAVED WITH THIS PROJECT</small><h1>Equation library</h1><p>Give each equation a name, select it, then build its maths with the keypad.</p></div>
      <button id="add-equation" class="equation-add" type="button">+ New equation</button>
    </header>
    <div class="equation-studio-layout">
      <section class="equation-list-panel" aria-label="Saved equations">
        <div class="equation-list-bar"><span>EXPRESSIONS</span><span id="keyboard-target">Select an equation</span></div>
        <div class="equation-rows" id="equation-rows"></div>
      </section>
      <aside class="calculator-keypad" aria-label="Maths keyboard">
        <div class="keypad-head"><b>Maths keyboard</b><span>Use buttons to add symbols</span></div>
        <div class="keypad-tabs" role="tablist">
          <button type="button" class="keypad-tab active" data-keypad-mode="main">Main</button>
          <button type="button" class="keypad-tab" data-keypad-mode="symbols">Symbols</button>
          <button type="button" class="keypad-tab" data-keypad-mode="functions">Functions</button>
          <button type="button" class="keypad-tab" data-keypad-mode="subscripts">Subscripts</button>
        </div>
        <div class="keypad-page active" data-keypad-page="main">
          <div class="calculator-grid calculator-grid-main">
            <button data-math="²">a²</button><button data-math="^">aᵇ</button><button data-math="abs(">|a|</button><button data-math="÷">÷</button>
            <button data-math="7">7</button><button data-math="8">8</button><button data-math="9">9</button><button data-math="×">×</button>
            <button data-math="4">4</button><button data-math="5">5</button><button data-math="6">6</button><button data-math="−">−</button>
            <button data-math="1">1</button><button data-math="2">2</button><button data-math="3">3</button><button data-math="+">+</button>
            <button data-math="(">(</button><button data-math="0">0</button><button data-math=".">.</button><button id="math-backspace" aria-label="Backspace">⌫</button>
          </div>
        </div>
        <div class="keypad-page" data-keypad-page="symbols" hidden>
          <div class="symbol-intro">Weights and biases receive their next available small number automatically.</div>
          <div class="calculator-grid calculator-grid-symbols">
            <button data-variable="W">Weight W</button><button data-variable="B">Bias B</button><button data-variable="X">Input X</button>
            <button data-math="Y">Output Y</button><button data-math="T">Target T</button><button data-math="Aᵢ">Vector Aᵢ</button>
            <button data-math="Bᵢ">Vector Bᵢ</button><button data-repeat-template="true">⟦ … ⟧ₓ repeat</button><button data-math=","><span>,</span></button>
          </div>
        </div>
        <div class="keypad-page" data-keypad-page="functions" hidden>
          <div class="calculator-grid calculator-grid-functions">
            <button data-math="sin(">sin</button><button data-math="cos(">cos</button><button data-math="tan(">tan</button>
            <button data-math="log(">log</button><button data-math="exp(">exp</button><button data-math="√(">√</button>
            <button data-math="π">π</button><button data-math="e">e</button><button data-math=")">)</button>
          </div>
        </div>
        <div class="keypad-page subscript-page" data-keypad-page="subscripts" hidden>
          <p><b>Subscripts</b> tell the equation which version of a value it is using.</p>
          <div id="subscript-definition-list" class="subscript-definition-list"></div>
          <form id="add-subscript-definition" class="add-subscript-definition">
            <select id="new-subscript-symbol" aria-label="New subscript symbol"><option value="i">i</option><option value="t">t</option><option value="p">p</option><option value="h">h</option><option value="k">k</option><option value="m">m</option></select>
            <input id="new-subscript-meaning" maxlength="56" aria-label="What this subscript represents" placeholder="What it represents">
            <button type="submit">Add</button>
          </form>
        </div>
        <p class="keypad-tip">⟦ … ⟧ₓ repeats the inside once for each value of x. It makes repeated values; it does not add them together.</p>
        <div class="math-actions" hidden></div>
      </aside>
    </div>
  </div>`;

function selectStudioEquation(id) {
  activeEquation = id;
  const equation = getEquations().find((item) => item.id === id);
  equationWorkspace.querySelectorAll('.equation-row').forEach((row) => row.classList.toggle('active', row.dataset.id === id));
  const target = equationWorkspace.querySelector('#keyboard-target');
  if (target) target.textContent = equation?.name?.trim() || 'Untitled equation';
}

renderEquationRows = function renderStudioEquationRows(focusId) {
  const rows = equationWorkspace.querySelector('#equation-rows'), equations = getEquations();
  const validFocus = focusId && equations.some((equation) => equation.id === focusId);
  if (validFocus) activeEquation = focusId;
  if (!activeEquation || !equations.some((equation) => equation.id === activeEquation)) activeEquation = equations[0]?.id || null;
  rows.innerHTML = equations.length ? equations.map((equation, index) => `<article class="equation-row${equation.id === activeEquation ? ' active' : ''}" data-id="${equation.id}"><div class="equation-index" aria-hidden="true">${index + 1}</div><button class="equation-select" type="button" aria-label="Select ${equation.name || 'equation'}"><i></i></button><div class="equation-fields"><input class="equation-name" aria-label="Equation name" value="${equation.name}"><input class="equation-expression" inputmode="none" aria-label="Equation expression" autocomplete="off" spellcheck="false" placeholder="Select this equation, then use the maths keyboard" value="${equation.expression || equation.lines?.join(' ') || ''}"></div><button class="delete-equation" type="button" aria-label="Delete ${equation.name}">×</button></article>`).join('') : '<p class="empty-equations">No equations yet. Create one to begin.</p>';
  rows.querySelectorAll('.equation-row').forEach((row) => {
    const id = row.dataset.id, name = row.querySelector('.equation-name'), expression = row.querySelector('.equation-expression');
    const select = () => selectStudioEquation(id);
    row.querySelector('.equation-select').onclick = select;
    row.onclick = (event) => { if (!event.target.closest('.delete-equation, .equation-name')) select(); };
    name.onfocus = select;
    expression.onfocus = select;
    expression.onkeydown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab'].includes(event.key)) return;
      if (/^[0-9+\-*/^().,]$/.test(event.key)) return;
      event.preventDefault();
    };
    const saveName = () => { const equationsToSave = getEquations(), item = equationsToSave.find((equation) => equation.id === id); if (item) { item.name = name.value; storeEquations(equationsToSave); } selectStudioEquation(id); };
    const saveExpression = () => { const equationsToSave = getEquations(), item = equationsToSave.find((equation) => equation.id === id); if (item) { item.expression = expression.value; item.lines = [expression.value]; storeEquations(equationsToSave); } };
    name.onblur = saveName;
    expression.onblur = saveExpression;
    row.querySelector('.delete-equation').onclick = () => { const training = getTrainingConfig(); if (training.lossEquationId === id) { training.lossEquationId = ''; storeTrainingConfig(training); } storeEquations(getEquations().filter((equation) => equation.id !== id)); if (activeEquation === id) activeEquation = null; renderEquationRows(); };
  });
  if (supportedEquationFunctions) rows.querySelectorAll('.equation-row').forEach((row) => {
    const status = describeEquationCompile(row.querySelector('.equation-expression').value);
    const badge = document.createElement('small');
    badge.className = `equation-compile-status ${status.state}`;
    badge.textContent = status.label;
    row.querySelector('.equation-fields').append(badge);
  });
  if (activeEquation) selectStudioEquation(activeEquation);
  if (validFocus) rows.querySelector(`[data-id="${focusId}"] .equation-expression`)?.focus();
};

equationWorkspace.querySelector('#add-equation').onclick = () => { const equation = newEquation(), equations = getEquations(); equations.push(equation); storeEquations(equations); renderEquationRows(equation.id); };
equationWorkspace.querySelectorAll('[data-math]').forEach((button) => button.onclick = () => insertMath(button.dataset.math));
equationWorkspace.querySelector('[data-repeat-template]').onclick = () => {
  if (!activeEquation) return toast('Select an equation first');
  const input = $(`[data-id="${activeEquation}"] .equation-expression`);
  if (!input) return;
  const start = input.selectionStart, end = input.selectionEnd, template = '⟦  ⟧ₓ';
  input.value = input.value.slice(0, start) + template + input.value.slice(end);
  input.selectionStart = input.selectionEnd = start + 2;
  input.focus();
};

const subscriptGlyphs = { x: 'ₓ', i: 'ᵢ', t: 'ₜ', p: 'ₚ', h: 'ₕ', k: 'ₖ', m: 'ₘ' };
const requiredSubscripts = [
  { symbol: 'x', meaning: 'Cycles through every selected input value.', required: true }
];
function getSubscriptDefinitions() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem('nf-subscript-definitions') || '[]'); } catch (_) { saved = []; }
  if (!Array.isArray(saved)) saved = [];
  const custom = saved.filter((item) => item && item.symbol && item.symbol !== 'x' && item.symbol !== 'n');
  return [...requiredSubscripts, ...custom];
}
function storeSubscriptDefinitions(definitions) { localStorage.setItem('nf-subscript-definitions', JSON.stringify(definitions.filter((item) => !item.required))); }
function insertSubscript(symbol) {
  const glyph = subscriptGlyphs[symbol] || symbol;
  insertMath(glyph);
}
function renderSubscriptDefinitions() {
  const list = equationWorkspace.querySelector('#subscript-definition-list');
  if (!list) return;
  const definitions = getSubscriptDefinitions();
  list.innerHTML = '';
  definitions.forEach((definition) => {
    const card = document.createElement('div'); card.className = 'subscript-definition';
    const insert = document.createElement('button'); insert.type = 'button'; insert.className = 'subscript-insert'; insert.textContent = subscriptGlyphs[definition.symbol] || definition.symbol; insert.title = `Insert subscript ${definition.symbol}`; insert.onclick = () => insertSubscript(definition.symbol);
    const copy = document.createElement('span'); copy.innerHTML = `<b>${definition.symbol}</b><small>${definition.meaning}</small>`;
    card.append(insert, copy);
    if (!definition.required) { const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-subscript'; remove.textContent = '×'; remove.title = 'Remove subscript'; remove.onclick = () => { storeSubscriptDefinitions(definitions.filter((item) => item.symbol !== definition.symbol)); renderSubscriptDefinitions(); }; card.append(remove); }
    list.append(card);
  });
}
equationWorkspace.querySelector('#add-subscript-definition').onsubmit = (event) => {
  event.preventDefault();
  const symbol = equationWorkspace.querySelector('#new-subscript-symbol').value, meaning = equationWorkspace.querySelector('#new-subscript-meaning').value.trim();
  if (!meaning) return toast('Say what this subscript represents');
  const definitions = getSubscriptDefinitions();
  if (definitions.some((item) => item.symbol === symbol)) return toast(`Subscript ${symbol} already exists`);
  storeSubscriptDefinitions([...definitions, { symbol, meaning }]);
  equationWorkspace.querySelector('#new-subscript-meaning').value = '';
  renderSubscriptDefinitions();
};
equationWorkspace.querySelectorAll('[data-variable]').forEach((button) => button.onclick = () => { if (button.dataset.variable === 'X') return insertMath('X'); const input = activeEquation && $(`[data-id="${activeEquation}"] .equation-expression`); const variable = button.dataset.variable, digits = '₀₁₂₃₄₅₆₇₈₉'; const used = new Set([...(input?.value.matchAll(new RegExp(`${variable}([₀₁₂₃₄₅₆₇₈₉]+)`, 'g')) || [])].map((match) => Number([...match[1]].map((digit) => digits.indexOf(digit)).join('')))); let number = 1; while (used.has(number)) number++; insertMath(`${variable}${String(number).split('').map((digit) => digits[Number(digit)]).join('')}`); });
equationWorkspace.querySelector('#math-backspace').onclick = backspaceMath;
equationWorkspace.querySelectorAll('[data-keypad-mode]').forEach((tab) => tab.onclick = () => { equationWorkspace.querySelectorAll('[data-keypad-mode]').forEach((item) => item.classList.toggle('active', item === tab)); equationWorkspace.querySelectorAll('[data-keypad-page]').forEach((page) => { const show = page.dataset.keypadPage === tab.dataset.keypadMode; page.hidden = !show; page.classList.toggle('active', show); }); });
renderSubscriptDefinitions();
renderEquationRows();

// Video is deliberately paused for this build. Keeping its saved settings in
// old project files is harmless, but it can no longer be enabled or exported.
function removeVideoEquationDefaults() {
  const equations = getEquations();
  const filtered = equations.filter((item) => !['Frame change energy', 'Adaptive frame threshold'].includes(item.name));
  if (filtered.length !== equations.length) storeEquations(filtered);
}

function hideVideoInputCard() {
  const videoCard = [...tensorWorkspace.querySelectorAll('.tensor-card')].find((card) => card.querySelector('.tensor-toggle span')?.textContent.includes('Video'));
  if (videoCard) videoCard.hidden = true;
  tensorWorkspace.querySelector('.tensor-head small').textContent = 'TWO INPUT SOURCES';
  tensorWorkspace.querySelector('.tensor-head p').textContent = 'Use text and Current Scene together. Image and video input are paused while their token vocabularies are designed.';
  $('#input-layer-route').textContent = 'Text searches context-near tokens. Images search context plus token positions. Network history uses [R, T] token positions. Each selected group then becomes one formatted neuron value.';
  $('#tensor-combined-shape').textContent = 'Two separate token grids';
  $('#tensor-combined-note').textContent = 'Text and network-history data remain in their own grids. Image and video input are paused for now.';
}

const renderBeforeVideoPause = renderTensorWorkspace;
renderTensorWorkspace = function renderWithoutVideo() {
  const config = getTensorConfig();
  if (config.videoEnabled) { config.videoEnabled = false; storeTensorConfig(config); }
  renderBeforeVideoPause();
  hideVideoInputCard();
};

removeVideoEquationDefaults();
renderTensorWorkspace();

// Python file workspace — a live, readable view of the same source that the
// export button downloads. It stays separate from the editor so users can
// inspect how their current model becomes a CUDA/PyTorch starting file.
const pythonTab = document.createElement('button');
pythonTab.className = 'workspace-tab';
pythonTab.id = 'python-tab';
pythonTab.type = 'button';
pythonTab.setAttribute('role', 'tab');
pythonTab.textContent = 'Python file';
$('#context-tab').after(pythonTab);

const pythonWorkspace = document.createElement('section');
pythonWorkspace.id = 'python-workspace';
pythonWorkspace.className = 'python-workspace';
pythonWorkspace.hidden = true;
pythonWorkspace.innerHTML = `
  <div class="python-head">
    <div>
      <small>LIVE EXPORT PREVIEW</small>
      <h1>Python file</h1>
      <p>This is the exact CUDA/PyTorch starting file made from the current project. Change your network, then refresh this view or export it.</p>
    </div>
    <div class="python-actions">
      <a href="dimension-guide.txt" target="_blank" rel="noopener">Dimension guide</a>
      <a href="token-test-grid.json" target="_blank" rel="noopener">Token test grid</a>
      <button type="button" id="refresh-python-preview">Refresh preview</button>
      <button type="button" id="download-python-preview">Export .py file</button>
    </div>
  </div>
  <div class="python-summary" id="python-summary"></div>
  <div class="python-layout">
    <aside class="python-formation">
      <small>HOW THE FILE IS FORMED</small>
      <ol>
        <li><b>Read the project</b><span>Your layers, equations, input links, training settings and output functions are collected.</span></li>
        <li><b>Pack the settings</b><span>They are written into the Python file as a compact PROJECT record, so the export carries your current design.</span></li>
        <li><b>Pick the device</b><span>The file uses CUDA when a compatible GPU is available, otherwise it reports that it is using the CPU.</span></li>
        <li><b>Match contexts</b><span>Each ternary context is checked in small sections. Target × candidate values are totalled; only candidates that pass the threshold continue.</span></li>
        <li><b>Build the network shell</b><span>The generated model starts with the context matcher. Saved equations are kept in PROJECT ready for the equation compiler and data loader.</span></li>
      </ol>
      <p class="python-note">This preview is generated locally. It does not train or send your project anywhere.</p>
      <section class="reference-demo" aria-labelledby="reference-demo-title">
        <small id="reference-demo-title">GPU REFERENCE ASSIGNMENT</small>
        <p>Each reference-grid cell tells one neuron which source value to read. The GPU performs the same lookup for every cell in parallel.</p>
        <button type="button" id="run-reference-demo">Run example</button>
        <pre id="reference-demo-result" aria-live="polite"></pre>
      </section>
    </aside>
    <section class="python-code-panel" aria-label="Generated Python code">
      <div class="python-code-head"><b>Generated <code>.py</code></b><span id="python-line-count"></span></div>
      <pre id="python-preview-code" class="python-preview-code"></pre>
    </section>
  </div>`;
$('main').append(pythonWorkspace);

let pythonPreviewSource = '';

function renderPythonWorkspacePlaceholder() {
  const layers = customNeuronLayers().length;
  const equations = getEquations().length;
  const bits = Number($('#context-bits').value) || 8;
  const dimensions = getContextConfig().dimensions;
  $('#python-preview-code').textContent = '# Python preview is not built yet.\n# Press “Refresh preview” when you want to generate it.';
  $('#python-line-count').textContent = 'waiting to generate';
  $('#python-summary').innerHTML = `<span><b>${layers}</b> editable layer${layers === 1 ? '' : 's'}</span><span><b>${equations}</b> saved equation${equations === 1 ? '' : 's'}</span><span><b>${bits}-bit</b> model values</span><span><b>${dimensions}</b> context dimensions</span>`;
}

function renderPythonWorkspace() {
  try {
    const config = cudaExportProject();
    const source = buildCudaPython(config);
    // Do not let an unexpectedly enormous saved project lock up the page by
    // inserting a massive text node into the browser renderer.
    if (source.length > 250000) throw new Error('The generated preview is too large to display. Export it instead.');
    pythonPreviewSource = source;
    $('#python-preview-code').textContent = source;
    $('#python-line-count').textContent = `${source.split('\n').length} lines`;
    $('#python-summary').innerHTML = `<span><b>${config.layers.length}</b> editable layer${config.layers.length === 1 ? '' : 's'}</span><span><b>${config.equations.length}</b> saved equation${config.equations.length === 1 ? '' : 's'}</span><span><b>${config.modelBits}-bit</b> model values</span><span><b>${config.context.dimensions}</b> context dimensions</span>`;
  } catch (error) {
    pythonPreviewSource = '';
    $('#python-preview-code').textContent = `# The preview could not be generated safely.\n# ${error instanceof Error ? error.message : 'Unknown error'}`;
    $('#python-line-count').textContent = 'not generated';
  }
}

const switchBeforePythonWorkspace = switchWorkspace;
switchWorkspace = function switchWorkspaceWithPython(name) {
  if (name === 'python') {
    switchBeforePythonWorkspace('network');
    $('#network-workspace').hidden = true;
    pythonWorkspace.hidden = false;
    document.querySelectorAll('.workspace-tab').forEach((tab) => tab.classList.remove('active'));
    pythonTab.classList.add('active');
    if (pythonPreviewSource) {
      $('#python-preview-code').textContent = pythonPreviewSource;
    } else {
      renderPythonWorkspacePlaceholder();
    }
    return;
  }
  pythonWorkspace.hidden = true;
  switchBeforePythonWorkspace(name);
};

pythonTab.onclick = () => { history.replaceState(null, '', '#python'); switchWorkspace('python'); };
$('#refresh-python-preview').onclick = () => { renderPythonWorkspace(); toast('Python preview refreshed'); };
$('#download-python-preview').onclick = exportCudaPython;

function runReferenceAssignmentDemo() {
  // This is the same assignment rule used by the exported GPU gather.
  // Each row is a neuron; every number in its row is a source-grid position.
  const source = [10, 11, 12, 13, 14, 15, 16, 17, 18];
  const references = [[0, 1, 2, 3], [2, 3, 4, 5], [5, 6, 7, 8]];
  const gathered = references.map((row) => row.map((position) => source[position]));
  $('#reference-demo-result').textContent = [
    'source values [B,S] = [10, 11, 12, 13, 14, 15, 16, 17, 18]',
    'references [N,K]    = [[0,1,2,3], [2,3,4,5], [5,6,7,8]]',
    `assigned [B,N,K]    = [${gathered.map((row) => `[${row.join(', ')}]`).join(', ')}]`,
    '',
    'neuron 0 gets 10, 11, 12, 13',
    'neuron 1 gets 12, 13, 14, 15',
    'neuron 2 gets 15, 16, 17, 18'
  ].join('\n');
}

$('#run-reference-demo').onclick = runReferenceAssignmentDemo;
runReferenceAssignmentDemo();

if (location.hash === '#python') setTimeout(() => switchWorkspace('python'), 0);

const exportPythonButton = document.createElement('button');
exportPythonButton.id = 'export-python';
exportPythonButton.type = 'button';
exportPythonButton.textContent = 'Export CUDA Python';
exportPythonButton.title = 'Download a PyTorch CUDA starting file for this network';
$('#save').before(exportPythonButton);

// Equation compiler: editor maths becomes a small, safe equation tree. The
// exported Python evaluates this tree with torch operations; it never runs
// user text with Python eval().
var supportedEquationFunctions = new Set(['sin', 'cos', 'tan', 'log', 'exp', 'sqrt', 'abs', 'mean']);
var equationSubscripts = '₀₁₂₃₄₅₆₇₈₉ₓᵢ₋';

function tokenizeEquation(expression) {
  const tokens = [], source = String(expression || '').replace(/\s+/g, '');
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if ('()+-−×*/÷^,⟦⟧'.includes(character)) {
      tokens.push({ type: character === '⟦' ? 'repeat-open' : character === '⟧' ? 'repeat-close' : 'operator', value: ({ '−': '-', '×': '*', '÷': '/' })[character] || character });
      index++;
      continue;
    }
    if (character === '²') { tokens.push({ type: 'operator', value: '^' }, { type: 'number', value: 2 }); index++; continue; }
    if (character === '√') { tokens.push({ type: 'identifier', value: 'sqrt' }); index++; continue; }
    if (character === 'π') { tokens.push({ type: 'identifier', value: 'pi' }); index++; continue; }
    if (/[0-9.]/.test(character)) {
      const start = index;
      while (/[0-9.]/.test(source[index] || '')) index++;
      const value = Number(source.slice(start, index));
      if (!Number.isFinite(value)) throw new Error('Invalid number');
      tokens.push({ type: 'number', value });
      continue;
    }
    if (/[A-Za-zμ]/.test(character)) {
      const start = index;
      while (/[A-Za-zμ]/.test(source[index] || '')) index++;
      // `''.includes('')` is true in JavaScript. Guard the end of the
      // expression so an identifier at the end cannot keep the compiler in
      // an endless loop while the editor checks it.
      while (source[index] && equationSubscripts.includes(source[index])) index++;
      tokens.push({ type: 'identifier', value: source.slice(start, index) });
      continue;
    }
    if (equationSubscripts.includes(character)) { tokens.push({ type: 'subscript', value: character }); index++; continue; }
    throw new Error(`Unsupported symbol: ${character}`);
  }
  return tokens;
}

function compileEquation(expression) {
  try {
    const tokens = tokenizeEquation(expression);
    if (!tokens.length) throw new Error('Equation is empty');
    let position = 0;
    const current = () => tokens[position];
    const accept = (value) => current()?.value === value ? (position++, true) : false;
    const need = (value) => { if (!accept(value)) throw new Error(`Expected ${value}`); };
    const primary = () => {
      const token = current();
      if (!token) throw new Error('Equation ends too early');
      if (token.type === 'number') { position++; return { type: 'number', value: token.value }; }
      if (token.type === 'identifier') {
        position++;
        const name = token.value;
        if (accept('(')) {
          if (!supportedEquationFunctions.has(name)) throw new Error(`Unsupported function: ${name}`);
          const argument = sum(); need(')');
          return { type: 'call', name, argument };
        }
        if (name === 'pi') return { type: 'number', value: Math.PI };
        if (name === 'e') return { type: 'number', value: Math.E };
        if (!/^[WBYTXA](?:[₀₁₂₃₄₅₆₇₈₉ₓᵢ₋]+)?$/.test(name) && name !== 'μ') throw new Error(`Unknown value: ${name}`);
        return { type: 'variable', name };
      }
      if (accept('(')) { const inner = sum(); need(')'); return inner; }
      if (token.type === 'repeat-open') {
        position++;
        const inner = sum();
        if (current()?.type !== 'repeat-close') throw new Error('Repeat section needs a closing bracket');
        position++;
        if (current()?.type === 'subscript') position++;
        return { type: 'repeat', axis: 'x', argument: inner };
      }
      throw new Error(`Expected a value, found ${token.value}`);
    };
    const unary = () => accept('+') ? unary() : accept('-') ? { type: 'unary', operation: '-', argument: unary() } : primary();
    const power = () => { let left = unary(); if (accept('^')) left = { type: 'binary', operation: '^', left, right: power() }; return left; };
    const product = () => { let left = power(); while (current()?.value === '*' || current()?.value === '/') { const operation = current().value; position++; left = { type: 'binary', operation, left, right: power() }; } return left; };
    const sum = () => { let left = product(); while (current()?.value === '+' || current()?.value === '-') { const operation = current().value; position++; left = { type: 'binary', operation, left, right: product() }; } return left; };
    const ast = sum();
    if (position !== tokens.length) throw new Error(`Unexpected ${current().value}`);
    return { ast, error: '' };
  } catch (error) {
    return { ast: null, error: error instanceof Error ? error.message : 'Could not read equation' };
  }
}

function describeEquationCompile(expression) {
  const compiled = compileEquation(expression);
  return compiled.error ? { ...compiled, label: `Needs fixing: ${compiled.error}`, state: 'error' } : { ...compiled, label: 'Ready for GPU export', state: 'ready' };
}

function equationVariables(node, found = new Set()) {
  if (!node) return found;
  if (node.type === 'variable') found.add(String(node.name || '').charAt(0));
  if (node.argument) equationVariables(node.argument, found);
  if (node.left) equationVariables(node.left, found);
  if (node.right) equationVariables(node.right, found);
  return found;
}

function describeEquationForRole(expression, role = 'calculation') {
  const result = describeEquationCompile(expression);
  if (result.error) return result;
  const allowed = equationRoles[role]?.allowed || equationRoles.calculation.allowed;
  const notAllowed = [...equationVariables(result.ast)].find((value) => !allowed.includes(value));
  if (!notAllowed) return result;
  const label = `${equationRoles[role]?.label || 'This'} equation cannot use ${notAllowed}`;
  return { ...result, error: label, label: `Needs fixing: ${label}`, state: 'error' };
}

function cudaExportProject() {
  const first = customNeuronLayers()[0];
  return {
    name: $('#project-name').value.trim() || 'Untitled network',
    modelBits: Number($('#context-bits').value) || 8,
    context: {
      dimensions: getContextConfig().dimensions,
      subdimensionSize: getContextConfig().subdimensionSize,
      stageCount: getContextConfig().dimensions / getContextConfig().subdimensionSize,
      values: [-1, 0, 1],
      bitsPerDimension: Math.log2(3)
    },
    inputNeuron: inputNeuronSettings(first),
    layers: customNeuronLayers().map((node) => ({ name: node.dataset.name, neurons: Number(node.dataset.count) || 0, inputGroups: JSON.parse(node.dataset.groups || '[]'), postCalculation: node.dataset.postEquation || '' })),
    equations: getEquations().map((item) => ({ name: item.name, role: inferredEquationRole(item), expression: item.expression || item.lines?.join(' ') || '' })),
    // Keep saved equations as data during export. Compiling every editor
    // equation in the browser was the crash path; the generated Python file
    // now owns that compilation step instead of blocking the editor.
    compiledEquations: [],
    output: getOutputConfig(),
    tensors: {
      textEnabled: getTensorConfig().textEnabled,
      textLength: getTensorConfig().textLength,
      textOverflow: getTensorConfig().textOverflow,
      // A future project can supply longer text pieces here (for example
      // "th" or "ing"). The exported tokenizer remains safe without them:
      // it uses UTF-8 byte IDs for anything not in this list.
      textVocabulary: Array.isArray(getTensorConfig().textVocabulary) ? getTensorConfig().textVocabulary : [],
      currentSceneEnabled: getTensorConfig().currentSceneEnabled,
      historyMessages: getTensorConfig().historyMessages,
      historyDynamicNeurons: getTensorConfig().historyDynamicNeurons,
      historyCycles: getTensorConfig().historyCycles,
      historyRuns: getTensorConfig().historyRuns
    },
    scenePatterns: getScenePatternExportSettings(),
    training: getTrainingConfig(),
    subscripts: getSubscriptDefinitions()
  };
}

function buildCudaPythonBase(config) {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(config))));
  return `# Generated by Neuron Foundry — Banquet Labs\n# First export stage: CUDA setup, project configuration, and the staged ternary matcher.\n# User-written equations are preserved in PROJECT for the next compiler stage.\n\nimport base64\nimport json\nimport torch\n\nPROJECT = json.loads(base64.b64decode("${encoded}").decode("utf-8"))\nDEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")\n\nprint(f"Using device: {DEVICE}")\nprint(f"Exported project: {PROJECT['name']}")\n\ndef staged_ternary_match(target, candidates, section_size, threshold):\n    \"\"\"target [D], candidates [C, D], all containing -1, 0, +1.\n    A candidate must pass every dimension section before it becomes a link.\n    \"\"\"\n    if target.ndim != 1 or candidates.ndim != 2 or candidates.shape[1] != target.shape[0]:\n        raise ValueError("Expected target [D] and candidates [C, D]")\n\n    active = torch.arange(candidates.shape[0], device=candidates.device)\n    target = target.to(torch.int16)\n    candidates = candidates.to(torch.int16)\n    for start in range(0, target.shape[0], section_size):\n        end = min(start + section_size, target.shape[0])\n        subtotal = (candidates.index_select(0, active)[:, start:end] * target[start:end]).sum(dim=1)\n        active = active[subtotal > threshold]\n        if active.numel() == 0:\n            break\n    return active\n\nclass GeneratedNetwork(torch.nn.Module):\n    def __init__(self, project):\n        super().__init__()\n        self.project = project\n        self.input_settings = project["inputNeuron"]\n\n    def matching_links(self, target_context, candidate_contexts):\n        return staged_ternary_match(\n            target_context.to(DEVICE), candidate_contexts.to(DEVICE),\n            self.input_settings["sectionSize"], self.input_settings["sectionThreshold"],\n        )\n\n    def forward(self, target_context, candidate_contexts):\n        links = self.matching_links(target_context, candidate_contexts)\n        # TODO: Compile PROJECT["equations"] into GPU operations.\n        return links\n\nmodel = GeneratedNetwork(PROJECT).to(DEVICE)\n\nif __name__ == "__main__":\n    print("CUDA export ready. Add the generated equation compiler and dataset loader next.")\n`;
}

function buildCudaPython(config) {
  const base = buildCudaPythonBase(config);
  const referenceAssignment = String.raw`
def gather_neuron_inputs(source_values, reference_grid):
    """Assign selected source values to every neuron in parallel.

    source_values: [B, S]
    reference_grid: [N, K] or [B, N, K]
    returns: [B, N, K]
    """
    if source_values.ndim != 2:
        raise ValueError("Expected source values [B, S]")
    batches, source_count = source_values.shape
    if reference_grid.ndim == 2:
        reference_grid = reference_grid.unsqueeze(0).expand(batches, -1, -1)
    if reference_grid.ndim != 3 or reference_grid.shape[0] != batches:
        raise ValueError("Expected references [N, K] or [B, N, K]")
    reference_grid = reference_grid.to(source_values.device, dtype=torch.long)
    if reference_grid.min() < 0 or reference_grid.max() >= source_count:
        raise ValueError("A reference points outside the source grid")

    neuron_count = reference_grid.shape[1]
    source_for_each_neuron = source_values.unsqueeze(1).expand(-1, neuron_count, -1)
    return torch.gather(source_for_each_neuron, dim=2, index=reference_grid)

def repeated_weighted_sum(selected_inputs, weights, biases):
    """⟦Wₓ × Xₓ⟧ₓ + B. Returns one value per neuron: [B, N]."""
    return (selected_inputs * weights.unsqueeze(0)).sum(dim=-1) + biases.unsqueeze(0)
`;
  const equationRuntime = String.raw`
COMPILED_EQUATIONS = {
    item["name"]: item for item in PROJECT["compiledEquations"] if not item["error"]
}

def evaluate_equation(node, values):
    """Safely evaluate a Neuron Foundry equation tree using torch operations."""
    kind = node["type"]
    if kind == "number":
        return torch.as_tensor(node["value"], device=DEVICE, dtype=torch.float32)
    if kind == "variable":
        name = node["name"]
        # Wₓ and W₁ use the same GPU grid as W; the subscript selects a
        # position when the surrounding operation is repeated.
        if name not in values and name[:1] in values:
            name = name[:1]
        if name not in values:
            raise KeyError(f"Equation needs value {node['name']}")
        return values[name]
    if kind == "repeat":
        repeated = evaluate_equation(node["argument"], values)
        # ⟦ expression ⟧ₓ combines every selected scalar after [B,N].
        # For context inputs that includes both kept links K and context
        # dimensions D; for hidden layers it is simply the selected inputs.
        return repeated.sum(dim=tuple(range(2, repeated.ndim))) if repeated.ndim >= 3 else repeated
    if kind == "unary":
        return -evaluate_equation(node["argument"], values)
    if kind == "binary":
        left = evaluate_equation(node["left"], values)
        right = evaluate_equation(node["right"], values)
        return {
            "+": lambda: left + right,
            "-": lambda: left - right,
            "*": lambda: left * right,
            "/": lambda: left / right,
            "^": lambda: torch.pow(left, right),
        }[node["operation"]]()
    if kind == "call":
        argument = evaluate_equation(node["argument"], values)
        return {
            "sin": lambda: torch.sin(argument),
            "cos": lambda: torch.cos(argument),
            "tan": lambda: torch.tan(argument),
            "log": lambda: torch.log(argument),
            "exp": lambda: torch.exp(argument),
            "sqrt": lambda: torch.sqrt(argument),
            "abs": lambda: torch.abs(argument),
            "mean": lambda: torch.mean(argument, dim=-1),
        }[node["name"]]()
    raise ValueError(f"Unknown equation node: {kind}")

def run_saved_equation(name, values):
    """Run one saved editor equation without evaluating arbitrary text."""
    if name not in COMPILED_EQUATIONS:
        raise KeyError(f"No export-ready equation named {name}")
    return evaluate_equation(COMPILED_EQUATIONS[name]["ast"], values)
`;
  return base.replace('\nclass GeneratedNetwork', `\n${referenceAssignment}\n${equationRuntime}\nclass GeneratedNetwork`);
}

// Replace the earlier preview-only model with a runnable CUDA network. Keeping
// this as a separate exporter stage means older saved projects still export.
const buildCudaPythonWithEquationRuntime = buildCudaPython;
function buildSelectedLocalGraderRuntime(training) {
  const grader = normaliseLocalGrader(training?.localGrader);
  if (!grader.enabled) return String.raw`
LOCAL_GRADER_CONFIG = PROJECT.get("training", {}).get("localGrader", {})

def grade_completed_output(original_input, generated_output):
    raise RuntimeError("Local grading is disabled in this export. Call reward_train_step() with your own numeric grader value.")
`;
  if (grader.runtime === 'ollama') return String.raw`
import urllib.error
import urllib.request

LOCAL_GRADER_CONFIG = PROJECT.get("training", {}).get("localGrader", {})

def _grader_payload(original_input, generated_output):
    low = int(LOCAL_GRADER_CONFIG["scoreMinimum"])
    high = int(LOCAL_GRADER_CONFIG["scoreMaximum"])
    instruction = PROJECT.get("training", {}).get("graderInputArgument", "")
    system = f"You are a strict local training grader. Return JSON only: {{\"score\": whole_number}}. The score must be from {low} to {high}; higher is better."
    user = "Grading instruction:\\n" + instruction + "\\n\\nOriginal input:\\n" + str(original_input) + "\\n\\nGenerated output:\\n" + str(generated_output)
    return system, user

def _parse_local_grader_score(reply):
    start, end = reply.find("{"), reply.rfind("}")
    if start < 0 or end < start:
        raise ValueError("Local grader did not return a JSON score")
    value = json.loads(reply[start:end + 1]).get("score")
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)) or int(value) != value:
        raise ValueError("Local grader score must be one whole number")
    value = int(value)
    low, high = int(LOCAL_GRADER_CONFIG["scoreMinimum"]), int(LOCAL_GRADER_CONFIG["scoreMaximum"])
    if value < low or value > high:
        raise ValueError(f"Local grader score must be from {low} to {high}")
    return value

def grade_completed_output(original_input, generated_output):
    """Ask only the selected Ollama server to grade one completed call."""
    system, user = _grader_payload(original_input, generated_output)
    payload = {"model": LOCAL_GRADER_CONFIG["model"], "stream": False, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}], "options": {"temperature": 0, "num_predict": int(LOCAL_GRADER_CONFIG["maxTokens"])}}
    request = urllib.request.Request(LOCAL_GRADER_CONFIG["baseUrl"].rstrip("/") + "/api/chat", data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=int(LOCAL_GRADER_CONFIG["timeoutSeconds"])) as response:
            reply = json.loads(response.read().decode("utf-8"))["message"]["content"]
    except (urllib.error.URLError, KeyError, json.JSONDecodeError) as error:
        raise RuntimeError("Selected Ollama grader is not available. Start it on this Vast instance, then retry.") from error
    return _parse_local_grader_score(reply)
`;
  const runtimeName = grader.runtime === 'lmstudio' ? 'LM Studio' : grader.runtime === 'llamacpp' ? 'llama.cpp' : 'vLLM';
  return String.raw`
import urllib.error
import urllib.request

LOCAL_GRADER_CONFIG = PROJECT.get("training", {}).get("localGrader", {})

def _grader_payload(original_input, generated_output):
    low = int(LOCAL_GRADER_CONFIG["scoreMinimum"])
    high = int(LOCAL_GRADER_CONFIG["scoreMaximum"])
    instruction = PROJECT.get("training", {}).get("graderInputArgument", "")
    system = f"You are a strict local training grader. Return JSON only: {{\"score\": whole_number}}. The score must be from {low} to {high}; higher is better."
    user = "Grading instruction:\\n" + instruction + "\\n\\nOriginal input:\\n" + str(original_input) + "\\n\\nGenerated output:\\n" + str(generated_output)
    return system, user

def _parse_local_grader_score(reply):
    start, end = reply.find("{"), reply.rfind("}")
    if start < 0 or end < start:
        raise ValueError("Local grader did not return a JSON score")
    value = json.loads(reply[start:end + 1]).get("score")
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)) or int(value) != value:
        raise ValueError("Local grader score must be one whole number")
    value = int(value)
    low, high = int(LOCAL_GRADER_CONFIG["scoreMinimum"]), int(LOCAL_GRADER_CONFIG["scoreMaximum"])
    if value < low or value > high:
        raise ValueError(f"Local grader score must be from {low} to {high}")
    return value

def grade_completed_output(original_input, generated_output):
    """Ask only the selected ${runtimeName} OpenAI-compatible server to grade one completed call."""
    system, user = _grader_payload(original_input, generated_output)
    payload = {"model": LOCAL_GRADER_CONFIG["model"], "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}], "temperature": 0, "max_tokens": int(LOCAL_GRADER_CONFIG["maxTokens"])}
    request = urllib.request.Request(LOCAL_GRADER_CONFIG["baseUrl"].rstrip("/") + "/chat/completions", data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=int(LOCAL_GRADER_CONFIG["timeoutSeconds"])) as response:
            reply = json.loads(response.read().decode("utf-8"))["choices"][0]["message"]["content"]
    except (urllib.error.URLError, KeyError, IndexError, json.JSONDecodeError) as error:
        raise RuntimeError("Selected ${runtimeName} grader is not available. Start it on this Vast instance, then retry.") from error
    return _parse_local_grader_score(reply)
`;
}
buildCudaPython = function buildCudaPythonNetwork(config) {
  const source = buildCudaPythonWithEquationRuntime(config);
const localGraderRuntime = buildSelectedLocalGraderRuntime(config.training);
const networkRuntime = String.raw`
import hashlib
import math
from collections import deque

${localGraderRuntime}

def scene_value_codes(output_values):
    """Reduce output values to the signed 8-bit codes used by current scene."""
    return torch.round(output_values).clamp(-128, 127).to(torch.long) + 128

def scene_token_ids_from_outputs(output_values):
    """Make a stable token ID for every [B,T] output value.

    Each function/output position owns 256 eight-bit value tokens. This keeps
    a value from function 0 distinct from the identical value from function 1
    and makes the live scene grid immediately usable by the context lookup.
    """
    if output_values.ndim != 2:
        raise ValueError("Expected output values [B,T]")
    value_codes = scene_value_codes(output_values)
    function_offsets = torch.arange(output_values.shape[1], device=output_values.device, dtype=torch.long) * 256
    return value_codes + function_offsets.unsqueeze(0)

def scene_base_token_ids(output_values):
    """Use the winning T action ID as the base token for each R step.

    The full [B,R,T] action grid remains available for the 3x3 creator;
    [B,R] is only the small base-token grid used before a learned shape
    replaces a centre cell.
    """
    if output_values.ndim != 2:
        raise ValueError("Expected output values [B, T]")
    return output_values.argmax(dim=1).to(torch.long)

def scene_target_positions(scene_lengths, output_count, neuron_count, device):
    """Map available [R,T] cells onto the reserved input neurons.

    One input neuron receives one target token position. Positions after the
    actual R length are marked [-1,-1], so small calls simply leave their
    unused input neurons inactive.
    """
    lengths = torch.as_tensor(scene_lengths, device=device, dtype=torch.long).flatten()
    if lengths.ndim != 1:
        raise ValueError("scene_lengths must be [B]")
    output_count, neuron_count = max(1, int(output_count)), max(1, int(neuron_count))
    linear = torch.arange(neuron_count, device=device, dtype=torch.long)
    r_positions = linear.div(output_count, rounding_mode="floor")
    t_positions = linear.remainder(output_count)
    positions = torch.stack((r_positions, t_positions), dim=-1).unsqueeze(0).expand(lengths.numel(), -1, -1).clone()
    active = r_positions.unsqueeze(0).lt(lengths.unsqueeze(1))
    return torch.where(active.unsqueeze(-1), positions, torch.full_like(positions, -1))

def scene_candidate_lists(scene_token_ids, scene_context, target_positions, settings, scene_lengths=None):
    """Build CUDA candidate references for current-scene target tokens.

    scene_token_ids: [B,R,T] token IDs for a padded live scene grid.
    target_positions: [B,N,2], each pair is [R,T] for one input neuron.
    returns references [B,N,K,2], valid [B,N,K], scores [B,N,K].

    Candidate search moves backward through R only. Every T value in each
    earlier R row is checked with staged context multiplication and addition;
    T indexes are labels and are never treated as a spatial distance.
    """
    if scene_token_ids.ndim != 3:
        raise ValueError("scene_token_ids must be [B,R,T]")
    if target_positions.ndim != 3 or target_positions.shape[0] != scene_token_ids.shape[0] or target_positions.shape[2] != 2:
        raise ValueError("target_positions must be [B,N,2]")
    batches, rows, output_count = scene_token_ids.shape
    neuron_count = target_positions.shape[1]
    device = scene_token_ids.device
    keep_count = max(1, int(settings.get("links", 1)))
    # No history exists before R=0, so scanning farther than the supplied
    # grid cannot produce a candidate and would only allocate empty work.
    search_distance = min(max(0, int(settings.get("distance", 0))), max(0, rows - 1))
    section_size = max(1, int(settings.get("sectionSize", 1)))
    threshold = int(settings.get("sectionThreshold", 0))
    references = torch.full((batches, neuron_count, keep_count, 2), -1, device=device, dtype=torch.long)
    valid = torch.zeros((batches, neuron_count, keep_count), device=device, dtype=torch.bool)
    scores = torch.full((batches, neuron_count, keep_count), float("-inf"), device=device)
    if rows == 0 or output_count == 0 or search_distance == 0:
        return references, valid, scores
    if scene_lengths is None:
        scene_lengths = torch.full((batches,), rows, device=device, dtype=torch.long)
    else:
        scene_lengths = torch.as_tensor(scene_lengths, device=device, dtype=torch.long).flatten().clamp(0, rows)
        if scene_lengths.shape != (batches,):
            raise ValueError("scene_lengths must be [B]")

    # Work in small N chunks so the temporary [B,N,distance,T,D] comparison
    # grid cannot grow without bound when a project reserves many neurons.
    chunk_size = max(1, int(settings.get("sceneCandidateChunk", 128)))
    offsets = torch.arange(1, search_distance + 1, device=device, dtype=torch.long)
    t_values = torch.arange(output_count, device=device, dtype=torch.long).view(1, 1, 1, output_count)
    batch_indexes = torch.arange(batches, device=device, dtype=torch.long)
    for first in range(0, neuron_count, chunk_size):
        last = min(neuron_count, first + chunk_size)
        positions = target_positions[:, first:last].to(torch.long)
        target_r, target_t = positions[..., 0], positions[..., 1]
        target_ok = target_r.ge(0) & target_r.lt(scene_lengths.unsqueeze(1)) & target_t.ge(0) & target_t.lt(output_count)
        safe_target_r = target_r.clamp(0, max(0, rows - 1))
        safe_target_t = target_t.clamp(0, max(0, output_count - 1))
        target_ids = scene_token_ids[batch_indexes[:, None], safe_target_r, safe_target_t]
        target_context = scene_context(target_ids.to(torch.long))

        candidate_r = target_r[:, :, None, None] - offsets.view(1, 1, -1, 1)
        candidate_r = candidate_r.expand(-1, -1, -1, output_count)
        candidate_t = t_values.expand(batches, last - first, search_distance, -1)
        candidate_ok = target_ok[:, :, None, None] & candidate_r.ge(0) & candidate_r.lt(scene_lengths[:, None, None, None])
        safe_candidate_r = candidate_r.clamp(0, max(0, rows - 1))
        candidate_ids = scene_token_ids[
            batch_indexes[:, None, None, None], safe_candidate_r, candidate_t
        ]
        candidate_context = scene_context(candidate_ids.to(torch.long))
        candidate_count = search_distance * output_count
        candidate_ok = candidate_ok.reshape(batches, last - first, candidate_count)
        candidate_r = candidate_r.reshape(batches, last - first, candidate_count)
        candidate_t = candidate_t.reshape(batches, last - first, candidate_count)
        candidate_context = candidate_context.reshape(batches, last - first, candidate_count, -1)

        active = candidate_ok.clone()
        total = torch.zeros_like(active, dtype=torch.float32)
        for dimension_start in range(0, target_context.shape[-1], section_size):
            dimension_end = min(dimension_start + section_size, target_context.shape[-1])
            subtotal = (candidate_context[..., dimension_start:dimension_end] * target_context[:, :, None, dimension_start:dimension_end]).sum(dim=-1)
            total = total + subtotal
            active = active & subtotal.ge(threshold)
        ranked = total.masked_fill(~active, float("-inf"))
        count = min(keep_count, candidate_count)
        chosen_scores, chosen_indexes = torch.topk(ranked, count, dim=-1)
        chosen_valid = torch.isfinite(chosen_scores)
        chosen_r = candidate_r.gather(2, chosen_indexes)
        chosen_t = candidate_t.gather(2, chosen_indexes)
        coordinates = torch.stack((chosen_r, chosen_t), dim=-1)
        references[:, first:last, :count] = torch.where(chosen_valid.unsqueeze(-1), coordinates, torch.full_like(coordinates, -1))
        valid[:, first:last, :count] = chosen_valid
        scores[:, first:last, :count] = chosen_scores
    return references, valid, scores

def gather_scene_contexts(scene_token_ids, references, valid, scene_context):
    """Turn [R,T] candidate references into context inputs [B,N,K,D]."""
    if scene_token_ids.ndim != 3:
        raise ValueError("scene_token_ids must be [B,R,T]")
    if references.ndim != 4 or references.shape[0] != scene_token_ids.shape[0] or references.shape[-1] != 2:
        raise ValueError("references must be [B,N,K,2]")
    if valid.shape != references.shape[:-1]:
        raise ValueError("valid must be [B,N,K]")
    batches, rows, output_count = scene_token_ids.shape
    r_positions, t_positions = references[..., 0], references[..., 1]
    safe_r = r_positions.clamp(0, max(0, rows - 1))
    safe_t = t_positions.clamp(0, max(0, output_count - 1))
    token_ids = scene_token_ids[torch.arange(batches, device=scene_token_ids.device)[:, None, None], safe_r, safe_t]
    contexts = scene_context(token_ids.to(torch.long))
    return contexts * valid.unsqueeze(-1).to(contexts.dtype)

def text_target_positions(text_lengths, neuron_count, device):
    """Assign input neurons to real token positions; unused rows are -1."""
    lengths = torch.as_tensor(text_lengths, device=device, dtype=torch.long).flatten()
    positions = torch.arange(max(1, int(neuron_count)), device=device, dtype=torch.long)
    grid = positions.unsqueeze(0).expand(lengths.numel(), -1).clone()
    return torch.where(grid.lt(lengths.unsqueeze(1)), grid, torch.full_like(grid, -1))

def text_candidate_lists(text_token_ids, text_context, target_positions, settings, text_lengths=None):
    """Build compact [B,N,K] text references with staged context matching.

    Candidate distance is measured only along the text token list. Each target
    sees nearby positions on both sides, then every candidate must pass every
    configured context-dimension section before it can be kept.
    """
    if text_token_ids.ndim != 2:
        raise ValueError("text token IDs must be [B,T]")
    if target_positions.ndim != 2 or target_positions.shape[0] != text_token_ids.shape[0]:
        raise ValueError("text target positions must be [B,N]")
    batches, token_count = text_token_ids.shape
    neuron_count = target_positions.shape[1]
    device = text_token_ids.device
    keep_count = max(1, int(settings.get("links", 1)))
    distance = min(max(0, int(settings.get("distance", 0))), max(0, token_count - 1))
    references = torch.full((batches, neuron_count, keep_count), -1, device=device, dtype=torch.long)
    valid = torch.zeros((batches, neuron_count, keep_count), device=device, dtype=torch.bool)
    scores = torch.full((batches, neuron_count, keep_count), float("-inf"), device=device)
    if token_count == 0 or distance == 0:
        return references, valid, scores
    if text_lengths is None:
        text_lengths = torch.full((batches,), token_count, device=device, dtype=torch.long)
    else:
        text_lengths = torch.as_tensor(text_lengths, device=device, dtype=torch.long).flatten().clamp(0, token_count)
        if text_lengths.shape != (batches,):
            raise ValueError("text lengths must be [B]")
    section_size = max(1, int(settings.get("sectionSize", 1)))
    threshold = int(settings.get("sectionThreshold", 0))
    chunk_size = max(1, int(settings.get("textCandidateChunk", 256)))
    offsets = torch.cat((-torch.arange(distance, 0, -1, device=device), torch.arange(1, distance + 1, device=device)))
    batch_indexes = torch.arange(batches, device=device)
    for first in range(0, neuron_count, chunk_size):
        last = min(neuron_count, first + chunk_size)
        positions = target_positions[:, first:last].to(torch.long)
        target_ok = positions.ge(0) & positions.lt(text_lengths.unsqueeze(1))
        safe_targets = positions.clamp(0, token_count - 1)
        target_context = text_context(text_token_ids[batch_indexes[:, None], safe_targets])
        candidate_positions = positions[:, :, None] + offsets.view(1, 1, -1)
        candidate_ok = target_ok[:, :, None] & candidate_positions.ge(0) & candidate_positions.lt(text_lengths[:, None, None])
        safe_candidates = candidate_positions.clamp(0, token_count - 1)
        candidate_context = text_context(text_token_ids[batch_indexes[:, None, None], safe_candidates])
        active = candidate_ok.clone()
        total = torch.zeros_like(active, dtype=torch.float32)
        for dimension_start in range(0, target_context.shape[-1], section_size):
            dimension_end = min(dimension_start + section_size, target_context.shape[-1])
            subtotal = (candidate_context[..., dimension_start:dimension_end] * target_context[:, :, None, dimension_start:dimension_end]).sum(dim=-1)
            total = total + subtotal
            active = active & subtotal.ge(threshold)
        ranked = total.masked_fill(~active, float("-inf"))
        count = min(keep_count, offsets.numel())
        chosen_scores, chosen_indexes = torch.topk(ranked, count, dim=-1)
        chosen_valid = torch.isfinite(chosen_scores)
        chosen_positions = candidate_positions.gather(2, chosen_indexes)
        references[:, first:last, :count] = torch.where(chosen_valid, chosen_positions, torch.full_like(chosen_positions, -1))
        valid[:, first:last, :count] = chosen_valid
        scores[:, first:last, :count] = chosen_scores
    return references, valid, scores

def gather_text_contexts(text_token_ids, references, valid, text_context):
    """Turn [B,N,K] text references into context inputs [B,N,K,D]."""
    if text_token_ids.ndim != 2:
        raise ValueError("text token IDs must be [B,T]")
    if references.ndim != 3 or valid.shape != references.shape:
        raise ValueError("text references and valid links must be [B,N,K]")
    batches, token_count = text_token_ids.shape
    safe_references = references.clamp(0, max(0, token_count - 1))
    token_ids = text_token_ids[torch.arange(batches, device=text_token_ids.device)[:, None, None], safe_references]
    contexts = text_context(token_ids.to(torch.long))
    return contexts * valid.unsqueeze(-1).to(contexts.dtype)

class GreedyTextTokenizer:
    """Fast deterministic text tokenizer with a no-failure byte fallback.

    Saved multi-character pieces are greedily matched from longest to shortest.
    Everything else becomes its UTF-8 byte IDs (0..255), so any text can be
    handled even before a project has supplied a finished token vocabulary.
    """
    def __init__(self, vocabulary=()):
        entries = []
        seen = set()
        for item in vocabulary or ():
            text = item.get("text", item.get("token", "")) if isinstance(item, dict) else item
            text = str(text)
            if text and text not in seen:
                seen.add(text)
                entries.append(text)
        # Longest-first makes IDs stable if the user changes the order in the
        # visual editor, while the trie still performs one left-to-right scan.
        self.entries = sorted(entries, key=lambda value: (-len(value), value))
        self.token_ids = {text: 256 + index for index, text in enumerate(self.entries)}
        self.trie = {}
        for text in self.entries:
            branch = self.trie
            for character in text:
                branch = branch.setdefault(character, {})
            branch["$"] = self.token_ids[text]
        self.version = hashlib.sha256(json.dumps(self.entries, ensure_ascii=False).encode("utf-8")).hexdigest()

    @property
    def token_count(self):
        return 256 + len(self.entries)

    def tokenize_one(self, text, maximum_tokens=None):
        text = str(text)
        token_ids, spans = [], []
        index = 0
        limit = None if maximum_tokens is None else max(0, int(maximum_tokens))
        while index < len(text) and (limit is None or len(token_ids) < limit):
            branch, cursor, found = self.trie, index, None
            while cursor < len(text) and text[cursor] in branch:
                branch = branch[text[cursor]]
                cursor += 1
                if "$" in branch:
                    found = (cursor, branch["$"]) 
            if found is not None:
                end, token_id = found
                token_ids.append(token_id)
                spans.append((index, end))
                index = end
                continue
            end = index + 1
            for byte in text[index:end].encode("utf-8"):
                if limit is not None and len(token_ids) >= limit:
                    break
                token_ids.append(byte)
                spans.append((index, end))
            index = end
        return token_ids, spans, len(text)

class TextTokenCache:
    """CPU cache of IDs/spans; CUDA receives compact padded grids only once."""
    def __init__(self, tokenizer):
        self.tokenizer = tokenizer
        self.entries = {}

    def _entry(self, text, maximum_tokens):
        text = str(text)
        digest = hashlib.sha256((self.tokenizer.version + "\0" + text + "\0" + str(maximum_tokens)).encode("utf-8")).hexdigest()
        if digest not in self.entries:
            self.entries[digest] = self.tokenizer.tokenize_one(text, maximum_tokens)
        return self.entries[digest]

    def tokenize_batch(self, texts, device=DEVICE, maximum_tokens=None):
        if isinstance(texts, str):
            texts = [texts]
        if not isinstance(texts, (list, tuple)):
            raise TypeError("texts must be one string or a list of strings")
        records = [self._entry(text, maximum_tokens) for text in texts]
        batch_size = len(records)
        width = max((len(ids) for ids, _, _ in records), default=0)
        ids = torch.zeros((batch_size, width), dtype=torch.long, device=device)
        spans = torch.full((batch_size, width, 2), -1, dtype=torch.long, device=device)
        lengths = torch.zeros((batch_size,), dtype=torch.long, device=device)
        text_lengths = torch.zeros((batch_size,), dtype=torch.long, device=device)
        for row, (token_ids, token_spans, text_length) in enumerate(records):
            count = len(token_ids)
            lengths[row] = count
            text_lengths[row] = text_length
            if count:
                ids[row, :count] = torch.tensor(token_ids, dtype=torch.long, device=device)
                spans[row, :count] = torch.tensor(token_spans, dtype=torch.long, device=device)
        return {
            "ids": ids,
            "lengths": lengths,
            "spans": spans,
            "text_lengths": text_lengths,
            "average_position": text_token_average_positions(ids, spans, text_lengths, lengths),
        }

def text_token_average_positions(token_ids, token_spans=None, text_lengths=None, token_lengths=None):
    """Create one saved average-position value for every text token.

    With tokenizer character spans [B,T,2], this is the centre of each token
    in its original text. Until spans are supplied, the token's centre in the
    final token list is used. Values are normalised from 0 to 1.
    """
    if token_ids.ndim != 2:
        raise ValueError("text token IDs must be [B,T]")
    batches, token_count = token_ids.shape
    device = token_ids.device
    if token_count == 0:
        return torch.empty((batches, 0), device=device, dtype=torch.float32)
    if token_spans is None:
        centres = (torch.arange(token_count, device=device, dtype=torch.float32) + 0.5) / float(token_count)
        return centres.unsqueeze(0).expand(batches, -1).clone()
    spans = torch.as_tensor(token_spans, device=device, dtype=torch.float32)
    if spans.shape != (batches, token_count, 2):
        raise ValueError("text token spans must be [B,T,2]")
    if text_lengths is None:
        text_lengths = spans[..., 1].amax(dim=1)
    lengths = torch.as_tensor(text_lengths, device=device, dtype=torch.float32).flatten()
    if lengths.shape != (batches,):
        raise ValueError("text lengths must be [B]")
    positions = ((spans[..., 0] + spans[..., 1]) * 0.5 / lengths.clamp_min(1.0).unsqueeze(1)).clamp(0.0, 1.0)
    if token_lengths is None:
        return positions
    token_lengths = torch.as_tensor(token_lengths, device=device, dtype=torch.long).flatten()
    if token_lengths.shape != (batches,):
        raise ValueError("token lengths must be [B]")
    valid = torch.arange(token_count, device=device).unsqueeze(0).lt(token_lengths.unsqueeze(1))
    return positions * valid.to(positions.dtype)

def scene_token_average_r_positions(scene_token_ids, token_mean_r_offsets=None):
    """Create one saved average-R value for every [R,T] token occurrence.

    Base tokens have offset 0. Learned multi-cell tokens can pass a lookup
    row of their mean relative-R offsets, preserving their average location
    while exact [R,T] references remain available for candidate matching.
    """
    if scene_token_ids.ndim != 3:
        raise ValueError("scene token IDs must be [B,R,T]")
    batches, rows, output_count = scene_token_ids.shape
    positions = torch.arange(rows, device=scene_token_ids.device, dtype=torch.float32).view(1, rows, 1).expand(batches, -1, output_count)
    if token_mean_r_offsets is None:
        return positions.clone()
    offsets = torch.as_tensor(token_mean_r_offsets, device=scene_token_ids.device, dtype=torch.float32).flatten()
    if offsets.numel() == 0:
        return positions.clone()
    safe_ids = scene_token_ids.to(torch.long).clamp(0, offsets.numel() - 1)
    return positions + offsets[safe_ids]

def saved_text_token_grid(token_ids, token_spans=None, text_lengths=None):
    """Save IDs and average text positions together; never retokenize a cache hit."""
    return {"ids": token_ids, "average_position": text_token_average_positions(token_ids, token_spans, text_lengths)}

def saved_scene_token_grid(token_ids, token_mean_r_offsets=None):
    """Save IDs and average R positions together; exact [R,T] stays implicit in the grid."""
    return {"ids": token_ids, "average_r_position": scene_token_average_r_positions(token_ids, token_mean_r_offsets)}

def ternary_context_values(values):
    """Keep context dimensions as -1, 0, or +1 during the forward pass."""
    stored = torch.where(values > 1 / 3, 1.0, torch.where(values < -1 / 3, -1.0, 0.0))
    return values + (stored - values).detach()

class SceneContextTable(torch.nn.Module):
    """The [T, D] lookup grid for base scene values and later motif tokens."""
    def __init__(self, token_count, dimensions):
        super().__init__()
        self.values = torch.nn.Parameter(torch.empty(int(token_count), int(dimensions)))
        self.reset_parameters()

    def reset_parameters(self):
        with torch.no_grad():
            initial = torch.randint(-1, 2, self.values.shape, device=self.values.device, dtype=torch.int8)
            self.values.copy_(initial.to(torch.float32))

    def forward(self, token_ids):
        return torch.nn.functional.embedding(token_ids, ternary_context_values(self.values))

    def expand_to(self, token_count):
        """Add random ternary rows when a checkpoint promotes scene motifs.

        Call this between training cycles, then rebuild the optimizer so it
        owns the replacement parameter.
        """
        token_count = int(token_count)
        if token_count <= self.values.shape[0]:
            return False
        with torch.no_grad():
            extra = torch.randint(
                -1, 2, (token_count - self.values.shape[0], self.values.shape[1]),
                device=self.values.device, dtype=torch.int8,
            ).to(torch.float32)
            self.values = torch.nn.Parameter(torch.cat((self.values.detach(), extra), dim=0))
        return True

    def append_token_rows(self, rows):
        """Add context rows whose dimensions were calculated from a token."""
        if rows is None or rows.numel() == 0:
            return False
        rows = rows.detach().to(device=self.values.device, dtype=self.values.dtype)
        if rows.ndim != 2 or rows.shape[1] != self.values.shape[1]:
            raise ValueError("New context rows must have shape [token count,D]")
        with torch.no_grad():
            self.values = torch.nn.Parameter(torch.cat((self.values.detach(), rows), dim=0))
        return True

def scene_token_context_seed_rows(context_table, token_action_lists):
    """Seed each learned shape from the base context rows of its T actions."""
    seeds = []
    source_rows = ternary_context_values(context_table.values)
    for action_ids in token_action_lists:
        action_context = source_rows.index_select(0, action_ids.to(torch.long))
        average = action_context.mean(dim=0)
        seeds.append(torch.where(average > 0, 1.0, torch.where(average < 0, -1.0, 0.0)))
    if not seeds:
        return None
    return torch.stack(seeds, dim=0)

class CurrentScene:
    """Build one live cycle: values, token IDs and winner indexes.

    Raw eight-bit values are kept for the separate token-creation checkpoint.
    The [B,R,T] IDs are created immediately and cached for the forward pass,
    so repeated calls never have to tokenize an earlier output again.
    """
    def __init__(self):
        self.rows = []
        self.token_rows = []
        self.winner_rows = []

    def append(self, output_values):
        raw_values = output_values.detach()
        if raw_values.ndim == 1:
            raw_values = raw_values.unsqueeze(0)
        if raw_values.ndim != 2:
            raise ValueError("Expected one output row with shape [B,T]")
        self.rows.append(scene_value_codes(raw_values).to(torch.uint8))
        self.token_rows.append(scene_token_ids_from_outputs(raw_values))
        self.winner_rows.append(raw_values.argmax(dim=1).to(torch.int32))

    def value_grid(self):
        if not self.rows:
            return None
        return torch.stack(self.rows, dim=1)

    def winner_grid(self):
        if not self.winner_rows:
            return None
        return torch.stack(self.winner_rows, dim=1)

    def token_grid(self):
        if not self.token_rows:
            return None
        return torch.stack(self.token_rows, dim=1)

class RaggedSceneHistory:
    """CUDA ring buffer for complete, variable-length [R,T] B cycles.

    Python lists only hold small start/length metadata. All 8-bit values stay
    in one contiguous CUDA buffer, so the GPU never has to manage nested or
    separately allocated variable-length tensors.
    """
    def __init__(self, output_count, storage_mib):
        self.output_count = max(1, int(output_count))
        requested_bytes = max(1, int(float(storage_mib) * 1024 * 1024))
        # Raw values are 1 byte each and one winner T index is int32. Keep
        # both side-by-side so the history cap covers the complete record.
        self.bytes_per_row = self.output_count + 4
        self.capacity_rows = max(1, requested_bytes // self.bytes_per_row)
        self.values = torch.empty((self.capacity_rows, self.output_count), dtype=torch.uint8, device=DEVICE)
        self.winner_indexes = torch.empty((self.capacity_rows,), dtype=torch.int32, device=DEVICE)
        self.starts = deque()
        self.lengths = deque()
        self.write_row = 0
        self.used_rows = 0
        self.rejected_cycles = 0

    @property
    def record_count(self):
        return len(self.lengths)

    @property
    def stored_bytes(self):
        return self.used_rows * self.bytes_per_row

    def _discard_oldest_cycle(self):
        self.starts.popleft()
        self.used_rows -= self.lengths.popleft()

    def append_cycle(self, cycle_values, cycle_winners):
        """Save one complete [R,T] cycle with its separate [R] winner grid."""
        if cycle_values.ndim != 2 or cycle_values.shape[1] != self.output_count:
            raise ValueError("Expected one complete cycle with shape [R,T]")
        length = int(cycle_values.shape[0])
        if cycle_winners.ndim != 1 or int(cycle_winners.shape[0]) != length:
            raise ValueError("Expected winner indexes with shape [R]")
        if length == 0:
            return False
        if length > self.capacity_rows:
            self.rejected_cycles += 1
            return False
        while self.used_rows + length > self.capacity_rows and self.lengths:
            self._discard_oldest_cycle()
        start = self.write_row
        source = cycle_values.detach().to(device=self.values.device, dtype=torch.uint8)
        winners = cycle_winners.detach().to(device=self.winner_indexes.device, dtype=torch.int32)
        first_part = min(length, self.capacity_rows - start)
        self.values[start:start + first_part].copy_(source[:first_part])
        self.winner_indexes[start:start + first_part].copy_(winners[:first_part])
        if first_part < length:
            self.values[:length - first_part].copy_(source[first_part:])
            self.winner_indexes[:length - first_part].copy_(winners[first_part:])
        self.starts.append(start)
        self.lengths.append(length)
        self.write_row = (start + length) % self.capacity_rows
        self.used_rows += length
        return True

    def append_completed_cycles(self, cycle_grid, winner_grid):
        """Save every B item in [B,R,T] and its separate [B,R] winner grid."""
        if cycle_grid is None:
            return []
        if cycle_grid.ndim != 3 or cycle_grid.shape[2] != self.output_count:
            raise ValueError("Expected completed cycles with shape [B,R,T]")
        if winner_grid is None or winner_grid.ndim != 2 or winner_grid.shape[:2] != cycle_grid.shape[:2]:
            raise ValueError("Expected completed winner indexes with shape [B,R]")
        return [self.append_cycle(cycle, winners) for cycle, winners in zip(cycle_grid.unbind(0), winner_grid.unbind(0))]

    def cycle(self, record_index):
        """Return one logical [R,T] cycle, handling a physical buffer wrap."""
        start = list(self.starts)[int(record_index)]
        length = list(self.lengths)[int(record_index)]
        end = start + length
        if end <= self.capacity_rows:
            return self.values[start:end]
        return torch.cat((self.values[start:], self.values[:end - self.capacity_rows]), dim=0)

    def cycle_winners(self, record_index):
        """Return the separate [R] list of winning T indexes for one B cycle."""
        start = list(self.starts)[int(record_index)]
        length = list(self.lengths)[int(record_index)]
        end = start + length
        if end <= self.capacity_rows:
            return self.winner_indexes[start:end]
        return torch.cat((self.winner_indexes[start:], self.winner_indexes[:end - self.capacity_rows]), dim=0)

    def matching_winner_windows(self, record_index, target_winners, minimum_match_percent):
        """Compare winner-index lists by R position, never by neighbouring T.

        Each output position in T is unrelated to the next one. A candidate
        only matches when the chosen winner indexes are equal in enough R
        positions to reach the project percentage.
        """
        target = target_winners.detach().to(device=self.winner_indexes.device, dtype=torch.int32).flatten()
        winners = self.cycle_winners(record_index)
        if target.numel() == 0 or winners.numel() < target.numel():
            return torch.empty((0,), dtype=torch.bool, device=self.winner_indexes.device)
        windows = winners.unfold(0, target.numel(), 1)
        matching_percent = windows.eq(target).to(torch.float32).mean(dim=1) * 100
        return matching_percent >= float(minimum_match_percent)

    def pattern_windows(self, pattern_rows):
        """Collect valid full-T [P,T] windows and their [P] winner lists.

        Each window stays inside one B record. record_ids identifies which
        complete B record supplied it, so repeated windows in one record only
        count once when deciding whether a token may form.
        """
        rows = int(pattern_rows)
        values, winners, record_ids = [], [], []
        for record_index in range(self.record_count):
            cycle_values = self.cycle(record_index)
            cycle_winners = self.cycle_winners(record_index)
            if cycle_values.shape[0] < rows:
                continue
            window_values = cycle_values.unfold(0, rows, 1).permute(0, 2, 1).contiguous()
            window_winners = cycle_winners.unfold(0, rows, 1)
            count = window_winners.shape[0]
            values.append(window_values)
            winners.append(window_winners)
            record_ids.append(torch.full((count,), record_index, dtype=torch.long, device=DEVICE))
        if not values:
            return None, None, None
        return torch.cat(values, dim=0), torch.cat(winners, dim=0), torch.cat(record_ids, dim=0)

    def winner_random_match_rate(self):
        """Chance that two random stored R rows have the same winner T index."""
        if self.used_rows == 0:
            return torch.tensor(1.0, dtype=torch.float32, device=DEVICE)
        chunks = [self.cycle_winners(index) for index in range(self.record_count)]
        all_winners = torch.cat(chunks, dim=0)
        counts = torch.bincount(all_winners.to(torch.long), minlength=self.output_count).to(torch.float32)
        probabilities = counts / counts.sum().clamp_min(1)
        return probabilities.square().sum().clamp_min(1e-8)

    def metadata(self):
        """Small CUDA metadata grids: start[B] and length[B]."""
        return (
            torch.tensor(list(self.starts), dtype=torch.int32, device=self.values.device),
            torch.tensor(list(self.lengths), dtype=torch.int32, device=self.values.device),
        )

    def area_windows(self, record_index, area_height, area_width):
        """Return valid overlapping [area height,area width] windows on CUDA.

        Windows are made inside one B cycle, so no area can cross a cycle
        boundary even though R has a different length in every record.
        """
        cycle = self.cycle(record_index)
        height, width = int(area_height), int(area_width)
        if height < 1 or width < 1 or cycle.shape[0] < height or self.output_count < width:
            return cycle.new_empty((0, 0, height, width))
        return cycle.unfold(0, height, 1).unfold(1, width, 1)

    def matching_windows(self, record_index, target_area, allowed_difference):
        """Vectorized per-number 8-bit matching for one stored B cycle."""
        windows = self.area_windows(record_index, target_area.shape[0], target_area.shape[1])
        if windows.numel() == 0:
            return windows.new_empty(windows.shape[:2], dtype=torch.bool)
        difference = (windows.to(torch.int16) - target_area.to(windows.device, torch.int16)).abs()
        return difference.amax(dim=(-1, -2)) <= int(allowed_difference)

class SceneMotifBuilder:
    """Discover repeated winner-index sequences at checkpoints, not every run."""
    def __init__(self, output_count, minimum_occurrences=50, sequence_lengths=(2, 3, 4)):
        self.base_token_count = int(output_count)
        self.minimum_occurrences = int(minimum_occurrences)
        self.sequence_lengths = tuple(int(length) for length in sequence_lengths)
        self.counts = {}
        self.motif_ids = {}

    def record_completed_call(self, winner_indexes):
        winners = torch.as_tensor(winner_indexes).detach().flatten().to("cpu").tolist()
        for length in self.sequence_lengths:
            for end in range(length, len(winners) + 1):
                key = tuple(winners[end - length:end])
                self.counts[key] = self.counts.get(key, 0) + 1

    def record_completed_grid(self, winner_grid):
        """Read the stored [B,R] winner-index grid one complete B cycle at a time."""
        if winner_grid is None:
            return
        if winner_grid.ndim != 2:
            raise ValueError("Expected completed winner indexes with shape [B,R]")
        for winner_cycle in winner_grid.unbind(0):
            self.record_completed_call(winner_cycle)

    def promote_common_sequences(self):
        for key, count in self.counts.items():
            if count >= self.minimum_occurrences and key not in self.motif_ids:
                self.motif_ids[key] = self.base_token_count + len(self.motif_ids)
        return self.motif_ids.copy()

    @property
    def token_count(self):
        return self.base_token_count + len(self.motif_ids)

    def motif_grid(self, winner_indexes, output_count):
        winners = torch.as_tensor(winner_indexes, dtype=torch.long)
        grid = torch.full((winners.numel(), int(output_count)), -1, dtype=torch.long)
        winner_list = winners.tolist()
        for length in self.sequence_lengths:
            for end in range(length, len(winner_list) + 1):
                motif = self.motif_ids.get(tuple(winner_list[end - length:end]))
                if motif is not None:
                    grid[end - 1, winner_list[end - 1]] = motif
        return grid

class SceneTokenLibrary:
    """GPU-resident sparse 3x3 Current Scene shapes created from B history.

    A token is not a full rectangle. It stores only the cells which repeat:
    offsets[K,2] are [relative R, relative T], values[K] are the prototype
    8-bit values, and tolerances[K] are calculated from the grouped examples.
    The centre [0,0] is always included.
    """
    def __init__(self, output_count):
        self.output_count = int(output_count)
        # Function position × signed eight-bit value. Learned shape IDs start
        # after this fixed range, so they cannot collide with live scene IDs.
        self.base_token_count = self.output_count * 256
        self.offsets = []
        self.prototype_values = []
        self.tolerances = []
        self.center_t = []

    @property
    def token_count(self):
        return self.base_token_count + len(self.offsets)

    @property
    def profile_count(self):
        return len(self.offsets)

    def mean_r_offset_table(self, device=DEVICE):
        """One average relative-R position for every base or learned token ID."""
        table = torch.zeros(self.token_count, device=device, dtype=torch.float32)
        for index, offsets in enumerate(self.offsets):
            table[self.base_token_count + index] = offsets[:, 0].to(torch.float32).mean()
        return table

    def token_action_ids(self, start_index=0):
        """Return neutral base IDs for every T action in a learned shape."""
        action_lists = []
        for offsets, centre_t in zip(self.offsets[start_index:], self.center_t[start_index:]):
            actions = (offsets[:, 1] + int(centre_t)).clamp(0, self.output_count - 1).to(torch.long)
            action_lists.append(actions * 256 + 128)
        return action_lists

    def _already_known(self, offsets, values, tolerance, centre_t):
        """Avoid adding the same sparse centre-anchored shape twice."""
        for old_offsets, old_values, old_tolerance, old_centre_t in zip(
            self.offsets, self.prototype_values, self.tolerances, self.center_t
        ):
            if int(old_centre_t) != int(centre_t) or old_offsets.shape != offsets.shape:
                continue
            if not bool(old_offsets.eq(offsets).all()):
                continue
            difference = (old_values.to(torch.int16) - values.to(torch.int16)).abs()
            allowed = torch.maximum(old_tolerance.to(torch.int16), tolerance.to(torch.int16))
            if bool(difference.le(allowed).all()):
                return True
        return False

    def discover(self, history, settings, max_new_tokens=64):
        """Create sparse centre-anchored 3x3 tokens from separate B records.

        Windows may start at any R position but keep the same T action columns.
        A centre-value bucket only narrows the GPU candidate list; every one of
        the nine cells is then checked. A kept cell must have support from
        enough distinct B records, the centre is forced to remain, and an
        existing near-identical sparse shape is never promoted again.
        """
        grid_size = 3
        creation_difference = max(0, int(settings.get("creationDifference", settings.get("creationVariation", 0))))
        B = history.record_count
        if B == 0 or history.output_count < grid_size:
            return []
        new_token_ids = []
        # T action IDs are stable. Scan all possible centre action columns,
        # while R shifts freely inside every B record.
        for centre_t in range(1, history.output_count - 1):
            patches, record_ids = [], []
            for record_index in range(B):
                cycle = history.cycle(record_index)
                if cycle.shape[0] < grid_size:
                    continue
                # [window R, T, R-offset] -> [window R, R-offset, T-offset]
                windows = cycle.unfold(0, grid_size, 1)[:, centre_t - 1:centre_t + 2, :].permute(0, 2, 1).contiguous()
                patches.append(windows)
                record_ids.append(torch.full((windows.shape[0],), record_index, dtype=torch.long, device=DEVICE))
            if not patches:
                continue
            samples = torch.cat(patches, dim=0)
            sample_records = torch.cat(record_ids, dim=0)
            # The centre code creates a bounded candidate list. It cannot by
            # itself create a token; all cells are evaluated below.
            bucket_width = max(1, creation_difference + 1)
            buckets = samples[:, 1, 1].to(torch.long) // bucket_width
            for bucket in torch.unique(buckets).detach().to("cpu").tolist():
                member_indexes = torch.nonzero(buckets.eq(bucket), as_tuple=False).flatten()
                if member_indexes.numel() == 0:
                    continue
                # Bound references per checkpoint. The full member group is
                # still compared for each chosen reference on the GPU.
                stride = max(1, math.ceil(member_indexes.numel() / 128))
                for reference_index in member_indexes[::stride].detach().to("cpu").tolist():
                    reference = samples[reference_index]
                    difference = (samples.to(torch.int16) - reference.to(torch.int16)).abs()
                    centre_match = difference[:, 1, 1].le(creation_difference)
                    support_records = torch.unique(sample_records[centre_match])
                    b = float(support_records.numel())
                    # b²/B must exceed 1: repetition inside one B record does
                    # not prove a reusable token.
                    if (b * b) / float(B) <= 1.0:
                        continue
                    cell_support = torch.zeros((grid_size, grid_size), dtype=torch.float32, device=DEVICE)
                    for row in range(grid_size):
                        for column in range(grid_size):
                            close = centre_match & difference[:, row, column].le(creation_difference)
                            cell_support[row, column] = float(torch.unique(sample_records[close]).numel())
                    keep = (cell_support.square() / float(B)) > 1.0
                    keep[1, 1] = True
                    # A learned shape must have the centre and at least one
                    # surrounding repeated cell; its later match percentage
                    # is calculated from its own irregular K-cell size.
                    if int(keep.sum().item()) < 2:
                        continue
                    grouped = samples[centre_match]
                    prototype_grid = grouped.to(torch.float32).mean(dim=0).round().clamp(0, 255).to(torch.uint8)
                    cell_differences = (grouped.to(torch.int16) - prototype_grid.to(torch.int16)).abs()
                    tolerance_grid = cell_differences.amax(dim=0).clamp(0, creation_difference).to(torch.uint8)
                    coordinates = torch.nonzero(keep, as_tuple=False).to(torch.int16) - 1
                    values = prototype_grid[keep]
                    tolerance = tolerance_grid[keep]
                    if self._already_known(coordinates, values, tolerance, centre_t):
                        continue
                    self.offsets.append(coordinates.detach())
                    self.prototype_values.append(values.detach())
                    self.tolerances.append(tolerance.detach())
                    self.center_t.append(int(centre_t))
                    new_token_ids.append(self.base_token_count + len(self.offsets) - 1)
                    if len(new_token_ids) >= max_new_tokens:
                        return new_token_ids
        return new_token_ids

    def encode_cycle(self, cycle_values, cycle_winners, minimum_cells_percent):
        """Put a learned ID at each matched 3x3 shape's centre R position."""
        if cycle_values is None or cycle_winners is None:
            return None
        token_ids = cycle_winners.to(torch.long).clone()
        if cycle_values.shape[1] < 3 or cycle_values.shape[2] < 3:
            return token_ids
        # One R centre receives one learned ID. Prefer the most detailed
        # matching shape; break equal-detail ties with the lowest raw error.
        best_cells = torch.zeros(token_ids[:, 1:-1].shape, dtype=torch.int16, device=cycle_values.device)
        best_error = torch.full(token_ids[:, 1:-1].shape, float("inf"), dtype=torch.float32, device=cycle_values.device)
        for index, (offsets, values, tolerance, centre_t) in enumerate(zip(
            self.offsets, self.prototype_values, self.tolerances, self.center_t
        )):
            if centre_t < 1 or centre_t >= cycle_values.shape[2] - 1:
                continue
            minimum_cells = max(1, math.ceil(int(offsets.shape[0]) * float(minimum_cells_percent) / 100.0))
            centres = torch.arange(1, cycle_values.shape[1] - 1, device=cycle_values.device)
            r_indexes = centres[:, None] + offsets[:, 0].to(torch.long)
            t_indexes = int(centre_t) + offsets[:, 1].to(torch.long)
            observed = cycle_values[:, r_indexes, t_indexes]
            difference = (observed.to(torch.int16) - values.to(torch.int16)).abs()
            close = difference.le(tolerance.to(torch.int16))
            centre_cell = torch.nonzero(offsets.eq(0).all(dim=1), as_tuple=False)[0, 0]
            matched = close.sum(dim=2).ge(minimum_cells) & close[:, :, centre_cell]
            detail = int(offsets.shape[0])
            raw_error = difference.to(torch.float32).mean(dim=2)
            better = matched & ((detail > best_cells) | ((detail == best_cells) & raw_error.lt(best_error)))
            target = token_ids[:, 1:-1]
            token_ids[:, 1:-1] = torch.where(better, torch.full_like(target, self.base_token_count + index), target)
            best_cells = torch.where(better, torch.full_like(best_cells, detail), best_cells)
            best_error = torch.where(better, raw_error, best_error)
        return token_ids

def begin_scene_call(model):
    """Clear the [R, T] scene grid before one multi-run model call."""
    model.current_scene = CurrentScene()

def begin_scene_conversation(model):
    """Start a new conversation without deleting the long-term scene archive."""
    conversation_mib = max(1, int(model.scene_pattern_settings.get("conversationMiB", 64)))
    model.conversation_scene_history = RaggedSceneHistory(model.output_count, conversation_mib)
    model.current_scene = CurrentScene()

def record_scene_run(model, output_values):
    """Keep this run's output-position/value IDs in the live [B, R, T] grid."""
    model.current_scene.append(output_values)
    return model.current_scene.token_grid()

def finish_scene_call(model, winner_indexes=None):
    """Save a completed cycle to temporary conversation and long-term archive."""
    values = model.current_scene.value_grid()
    winners = model.current_scene.winner_grid()
    model.conversation_scene_history.append_completed_cycles(values, winners)
    model.scene_archive.append_completed_cycles(values, winners)
    model.completed_scene_calls += 1
    settings = model.scene_pattern_settings
    check_every = max(1, int(settings.get("checkEvery", 100)))
    if model.completed_scene_calls % check_every == 0:
        existing_profile_count = model.scene_tokens.profile_count
        new_token_ids = model.scene_tokens.discover(model.scene_archive, settings)
        if new_token_ids:
            seeds = scene_token_context_seed_rows(
                model.scene_context, model.scene_tokens.token_action_ids(existing_profile_count)
            )
            # The caller must recreate its optimizer after this grows the
            # context parameter, just as with any newly promoted token table.
            model.scene_context.append_token_rows(seeds)
    # Shape profiles are discovered for later checkpoints, but the live
    # forward pass always receives the complete [B,R,T] IDs. Replacing that
    # grid with a smaller winner list here would discard function/value data.
    model.scene_tokens.encode_cycle(
        values, winners, float(settings.get("matchingCellsPercent", settings.get("matchingRowsPercent", 70)))
    )
    return model.save_scene_token_grid(model.current_scene.token_grid())

def promote_scene_motifs(scene_context, motif_builder):
    """Checkpoint helper: promote common sequences and grow [T, D] if needed.

    Recreate the optimizer after this returns True because the lookup-table
    parameter may have been replaced with a larger one.
    """
    motif_builder.promote_common_sequences()
    return scene_context.expand_to(motif_builder.token_count)

def compile_project_equation(item):
    """Turn one saved maths expression into a safe small equation tree.

    This happens in the exported Python process, never while the website is
    rendering. No user equation is passed to Python eval().
    """
    source = str(item.get("expression", "")).replace(" ", "").replace("×", "*").replace("÷", "/").replace("−", "-")
    tokens, index = [], 0
    while index < len(source):
        char = source[index]
        if char == "⟦": tokens.append(("repeat-open", char)); index += 1; continue
        if char == "⟧": tokens.append(("repeat-close", char)); index += 1; continue
        if char in "₀₁₂₃₄₅₆₇₈₉ₓᵢ₋": tokens.append(("subscript", char)); index += 1; continue
        if char == "²": tokens.extend((("operator", "^"), ("number", 2))); index += 1; continue
        if char == "√": tokens.append(("identifier", "sqrt")); index += 1; continue
        if char in "()+-*/^,": tokens.append(("operator", char)); index += 1; continue
        if char.isdigit() or char == ".":
            start = index
            while index < len(source) and (source[index].isdigit() or source[index] == "."): index += 1
            tokens.append(("number", float(source[start:index]))); continue
        if char.isalpha() or char == "μ":
            start = index
            while index < len(source) and (source[index].isalpha() or source[index] == "μ" or source[index] in "₀₁₂₃₄₅₆₇₈₉ₓᵢ₋") : index += 1
            tokens.append(("identifier", source[start:index])); continue
        raise ValueError("Unsupported symbol: " + char)
    position = 0
    def accept(value):
        nonlocal position
        if position < len(tokens) and tokens[position][1] == value:
            position += 1
            return True
        return False
    def primary():
        nonlocal position
        if position >= len(tokens): raise ValueError("Equation ends too early")
        kind, value = tokens[position]
        if kind == "number": position += 1; return {"type": "number", "value": value}
        if kind == "identifier":
            position += 1
            if accept("("):
                argument = expression()
                if not accept(")"): raise ValueError("Function needs a closing bracket")
                if value not in {"sin", "cos", "tan", "log", "exp", "sqrt", "abs", "mean"}: raise ValueError("Unsupported function: " + value)
                return {"type": "call", "name": value, "argument": argument}
            if value == "pi": return {"type": "number", "value": 3.141592653589793}
            if value == "e": return {"type": "number", "value": 2.718281828459045}
            return {"type": "variable", "name": value}
        if accept("("):
            inner = expression()
            if not accept(")"): raise ValueError("Bracket needs a closing bracket")
            return inner
        if kind == "repeat-open":
            position += 1
            inner = expression()
            if position >= len(tokens) or tokens[position][0] != "repeat-close": raise ValueError("Repeat section needs a closing bracket")
            position += 1
            while position < len(tokens) and tokens[position][0] == "subscript": position += 1
            return {"type": "repeat", "axis": "x", "argument": inner}
        raise ValueError("Expected a value")
    def unary():
        if accept("+"): return unary()
        if accept("-"): return {"type": "unary", "operation": "-", "argument": unary()}
        return primary()
    def power():
        left = unary()
        if accept("^"): left = {"type": "binary", "operation": "^", "left": left, "right": power()}
        return left
    def product():
        left = power()
        while position < len(tokens) and tokens[position][1] in {"*", "/"}:
            operation = tokens[position][1]; position += 1
            left = {"type": "binary", "operation": operation, "left": left, "right": power()}
        return left
    def expression():
        left = product()
        while position < len(tokens) and tokens[position][1] in {"+", "-"}:
            operation = tokens[position][1]; position += 1
            left = {"type": "binary", "operation": operation, "left": left, "right": product()}
        return left
    ast = expression()
    if position != len(tokens): raise ValueError("Unexpected equation text")
    return {"name": item.get("name", ""), "ast": ast, "error": ""}

COMPILED_EQUATIONS = {}
for saved_equation in PROJECT.get("equations", []):
    try:
        compiled = compile_project_equation(saved_equation)
        COMPILED_EQUATIONS[compiled["name"]] = compiled
    except Exception as error:
        print("Skipping equation", saved_equation.get("name", ""), ":", error)

def regular_number(value):
    """Quantise the forward value to the project's regular-number range.

    Values use 1/8 steps and stay between -256 and 255.875. The
    straight-through form lets PyTorch calculate gradients during training.
    """
    stored = torch.round(value * 8).clamp(-2048, 2047) / 8
    return value + (stored - value).detach()

def layer_value(value):
    """Every neuron finishes with a single [B, N] output grid."""
    if not torch.is_tensor(value):
        value = torch.as_tensor(value, device=DEVICE, dtype=torch.float32)
    if value.ndim > 2:
        value = value.sum(dim=tuple(range(2, value.ndim)))
    if value.ndim == 1:
        value = value.unsqueeze(0)
    return regular_number(value)

def run_layer_equation(name, selected_inputs, weights, biases, formatting=""):
    """Run an equation over [B,N,...] selected scalar context values."""
    if selected_inputs.ndim < 3:
        raise ValueError("selected inputs must start with [B,N] and have one or more input axes")
    if tuple(weights.shape) != tuple(selected_inputs.shape[1:]):
        raise ValueError("weights must have the same [N,...] shape as selected inputs")
    values = {
        "X": selected_inputs,
        "W": weights.unsqueeze(0),
        "B": biases.unsqueeze(0),
        "Y": selected_inputs,
        "T": torch.zeros((), device=selected_inputs.device),
        "A": torch.zeros((), device=selected_inputs.device),
    }
    if name and name in COMPILED_EQUATIONS:
        result = run_saved_equation(name, values)
    else:
        result = (selected_inputs * weights.unsqueeze(0)).sum(dim=tuple(range(2, selected_inputs.ndim))) + biases.unsqueeze(0)
    result = layer_value(result)
    if formatting and formatting in COMPILED_EQUATIONS:
        result = layer_value(run_saved_equation(formatting, {**values, "X": result, "Y": result}))
    return result

def fixed_references(neuron_count, input_count, source_count, device):
    """Create a compact [N, I] fallback connection pattern on the GPU."""
    if source_count < 1:
        raise ValueError("A layer needs at least one source value")
    return torch.arange(neuron_count * input_count, device=device).reshape(neuron_count, input_count) % source_count

def fixed_group_references(neuron_count, input_count, source_count, groups, device):
    """Turn the saved hidden-layer group sentences into one [N, I] grid."""
    references = fixed_references(neuron_count, input_count, source_count, device)
    for group in groups or []:
        start = max(0, min(neuron_count, int(group.get("start", 0))))
        end = max(start, min(neuron_count, int(group.get("end", neuron_count))))
        if start == end:
            continue
        shift = max(0, int(group.get("shift", 1)))
        skip = max(0, int(group.get("skip", 0))) + 1
        rows = torch.arange(end - start, device=device).unsqueeze(1)
        positions = torch.arange(input_count, device=device).unsqueeze(0)
        references[start:end] = (rows * shift + positions * skip) % source_count
    return references

def active_input_neuron_mask(neuron_count, source_count, groups, device):
    """Mark only the input neurons whose entire fixed window fits the input.

    A group with size values, a skip amount, and a shift between neurons has
    a window span of 1 + (size - 1) * (skip + 1). Its next starting point
    moves by shift. Rows past the final complete window
    remain inactive instead of wrapping around to the start of the input.
    """
    active = torch.zeros(neuron_count, device=device, dtype=torch.bool)
    for group in groups or []:
        start = max(0, min(neuron_count, int(group.get("start", 0))))
        end = max(start, min(neuron_count, int(group.get("end", neuron_count))))
        group_neurons = end - start
        if group_neurons == 0:
            continue
        if group.get("mode") == "dynamic":
            # Input-layer dynamic mode creates one search centre per available
            # token. The cap is the number of neurons reserved for its group.
            active[start:start + min(group_neurons, source_count)] = True
            continue
        size = max(1, int(group.get("size", 1)))
        step_inside = max(0, int(group.get("skip", 0))) + 1
        start_shift = max(1, int(group.get("shift", 1)))
        window_span = 1 + (size - 1) * step_inside
        complete_windows = 0 if source_count < window_span else 1 + (source_count - window_span) // start_shift
        active[start:start + min(group_neurons, complete_windows)] = True
    return active

class IndexedEquationLayer(torch.nn.Module):
    def __init__(self, neuron_count, input_count, equation, formatting="", groups=None):
        super().__init__()
        self.neuron_count = int(neuron_count)
        self.input_count = int(input_count)
        self.equation = equation or ""
        self.formatting = formatting or ""
        self.groups = groups or []
        self.weights = torch.nn.Parameter(torch.empty(self.neuron_count, self.input_count))
        self.biases = torch.nn.Parameter(torch.zeros(self.neuron_count))
        torch.nn.init.xavier_uniform_(self.weights)

    def forward(self, source_values, reference_grid=None, active_mask=None):
        if source_values.ndim != 2:
            raise ValueError("Layer source values must be [B, N]")
        if reference_grid is None:
            reference_grid = fixed_group_references(self.neuron_count, self.input_count, source_values.shape[1], self.groups, source_values.device)
        selected = gather_neuron_inputs(source_values, reference_grid)
        values = run_layer_equation(self.equation, selected, self.weights, self.biases, self.formatting)
        if active_mask is not None:
            if active_mask.shape != (self.neuron_count,):
                raise ValueError("Active neuron mask must be [N]")
            values = values * active_mask.to(values.device, dtype=values.dtype).unsqueeze(0)
        return values

class ContextEquationLayer(torch.nn.Module):
    """First-layer equation over selected token contexts [B,N,K,D].

    There is one trainable weight for every selected context dimension. The
    equation's repeat block reduces all K × D values into one output for each
    input neuron, so it returns the standard [B,N] layer grid.
    """
    def __init__(self, neuron_count, links_per_neuron, dimensions, equation, formatting=""):
        super().__init__()
        self.neuron_count = int(neuron_count)
        self.links_per_neuron = int(links_per_neuron)
        self.dimensions = int(dimensions)
        self.equation = equation or ""
        self.formatting = formatting or ""
        self.weights = torch.nn.Parameter(torch.empty(self.neuron_count, self.links_per_neuron, self.dimensions))
        self.biases = torch.nn.Parameter(torch.zeros(self.neuron_count))
        torch.nn.init.xavier_uniform_(self.weights)

    def forward(self, selected_contexts, valid_links):
        expected = (self.neuron_count, self.links_per_neuron, self.dimensions)
        if selected_contexts.ndim != 4 or tuple(selected_contexts.shape[1:]) != expected:
            raise ValueError("selected contexts must be [B,N,K,D] matching the input layer")
        if valid_links.shape != selected_contexts.shape[:3]:
            raise ValueError("valid links must be [B,N,K]")
        selected_contexts = selected_contexts * valid_links.unsqueeze(-1).to(selected_contexts.dtype)
        values = run_layer_equation(self.equation, selected_contexts, self.weights, self.biases, self.formatting)
        return values * valid_links.any(dim=-1).to(values.dtype)

class GeneratedNetwork(torch.nn.Module):
    """CUDA model assembled from the exported project."""
    def __init__(self, project):
        super().__init__()
        self.project = project
        self.input_settings = project["inputNeuron"]
        layers = project.get("layers", [])
        if not layers:
            raise ValueError("The project needs an input neuron layer")
        link_count = max(1, int(self.input_settings.get("links", 8)))
        self.input_layer = IndexedEquationLayer(
            max(1, int(layers[0].get("neurons", 1))),
            link_count,
            self.input_settings.get("equation", ""),
            self.input_settings.get("formattingEquation", ""),
            layers[0].get("inputGroups", []),
        )
        self.hidden_layers = torch.nn.ModuleList()
        previous_count = self.input_layer.neuron_count
        for layer in layers[1:]:
            group = (layer.get("inputGroups") or [{}])[0]
            input_count = min(previous_count, max(1, int(group.get("size", link_count))))
            hidden = IndexedEquationLayer(
                max(1, int(layer.get("neurons", 1))),
                input_count,
                group.get("equation", ""),
                layer.get("postCalculation", ""),
                layer.get("inputGroups", []),
            )
            self.hidden_layers.append(hidden)
            previous_count = hidden.neuron_count
        output_count = max(1, len(project.get("output", {}).get("functions", [])) + 1)
        self.output_layer = torch.nn.Linear(previous_count, output_count)
        torch.nn.init.xavier_uniform_(self.output_layer.weight)
        scene_dimensions = max(1, int(project.get("context", {}).get("dimensions", 256)))
        tensors = project.get("tensors", {})
        self.text_tokenizer = GreedyTextTokenizer(tensors.get("textVocabulary", ()))
        self.text_token_cache = TextTokenCache(self.text_tokenizer)
        # Text and current-scene contexts are separate lookup tables. Their
        # token ID ranges can safely overlap because calls never mix tables.
        self.text_context = SceneContextTable(self.text_tokenizer.token_count, scene_dimensions)
        self.scene_context = SceneContextTable(output_count * 256, scene_dimensions)
        self.scene_input_layer = ContextEquationLayer(
            self.input_layer.neuron_count,
            link_count,
            scene_dimensions,
            self.input_settings.get("equation", ""),
            self.input_settings.get("formattingEquation", ""),
        )
        self.output_count = output_count
        self.current_scene = CurrentScene()
        self.scene_pattern_settings = project.get("scenePatterns", {})
        conversation_mib = max(1, int(self.scene_pattern_settings.get("conversationMiB", 64)))
        archive_mib = max(1, int(self.scene_pattern_settings.get("historyMiB", 64)))
        self.conversation_scene_history = RaggedSceneHistory(output_count, conversation_mib)
        self.scene_archive = RaggedSceneHistory(output_count, archive_mib)
        self.scene_tokens = SceneTokenLibrary(output_count)
        self.completed_scene_calls = 0

    def matching_links(self, target_context, candidate_contexts):
        return staged_ternary_match(
            target_context.to(DEVICE), candidate_contexts.to(DEVICE),
            self.input_settings["sectionSize"], self.input_settings["sectionThreshold"],
        )

    def current_scene_candidate_lists(self, scene_token_ids, scene_lengths=None, target_positions=None):
        """Return [R,T] candidate references for the input layer's scene tokens.

        When no target grid is supplied, active input neurons are assigned to
        available scene cells in R-major order. A caller can instead supply
        its own [B,N,2] target grid from an input-group rule.
        """
        if scene_token_ids.ndim != 3:
            raise ValueError("scene_token_ids must be [B,R,T]")
        if scene_lengths is None:
            scene_lengths = torch.full((scene_token_ids.shape[0],), scene_token_ids.shape[1], device=scene_token_ids.device, dtype=torch.long)
        if target_positions is None:
            target_positions = scene_target_positions(
                scene_lengths, scene_token_ids.shape[2], self.input_layer.neuron_count, scene_token_ids.device
            )
        return scene_candidate_lists(
            scene_token_ids, self.scene_context, target_positions,
            self.input_settings, scene_lengths,
        )

    def save_scene_token_grid(self, scene_token_ids):
        """Package scene IDs with their average-R metadata for cache storage."""
        return saved_scene_token_grid(
            scene_token_ids, self.scene_tokens.mean_r_offset_table(scene_token_ids.device)
        )

    def tokenize_text(self, texts):
        """Tokenize one text or a batch once, then reuse IDs/spans from cache."""
        maximum_tokens = self.project.get("tensors", {}).get("textLength")
        return self.text_token_cache.tokenize_batch(texts, DEVICE, maximum_tokens)

    def save_text_token_grid(self, texts):
        """Return the cached text IDs with average source positions."""
        return self.tokenize_text(texts)

    def current_text_candidate_lists(self, text_token_ids, text_lengths=None, target_positions=None):
        """Return matched nearby text-token references for the input layer."""
        if text_token_ids.ndim != 2:
            raise ValueError("text token IDs must be [B,T]")
        if text_lengths is None:
            text_lengths = torch.full((text_token_ids.shape[0],), text_token_ids.shape[1], device=text_token_ids.device, dtype=torch.long)
        if target_positions is None:
            target_positions = text_target_positions(text_lengths, self.input_layer.neuron_count, text_token_ids.device)
        return text_candidate_lists(
            text_token_ids, self.text_context, target_positions, self.input_settings, text_lengths
        )

    def forward_text(self, texts, hidden_references=()):
        """Tokenize text, build its candidate links and run it through layer one."""
        saved = self.tokenize_text(texts)
        references, valid, _ = self.current_text_candidate_lists(saved["ids"], saved["lengths"])
        selected_contexts = gather_text_contexts(saved["ids"], references, valid, self.text_context)
        return self._finish_forward(self.scene_input_layer(selected_contexts, valid), hidden_references)

    def _finish_forward(self, values, hidden_references=()):
        for index, layer in enumerate(self.hidden_layers):
            references = hidden_references[index] if index < len(hidden_references) else None
            values = layer(values, references)
        scores = regular_number(self.output_layer(values))
        output_equation = self.project.get("output", {}).get("equation", "")
        if output_equation in COMPILED_EQUATIONS:
            scores = layer_value(run_saved_equation(output_equation, {"X": scores, "Y": scores}))
        return scores

    def forward_scene(self, scene_token_ids, scene_lengths=None, target_positions=None, hidden_references=()):
        """Run [B,R,T] scene tokens through candidate building and layer one."""
        references, valid, _ = self.current_scene_candidate_lists(
            scene_token_ids, scene_lengths, target_positions
        )
        selected_contexts = gather_scene_contexts(scene_token_ids, references, valid, self.scene_context)
        return self._finish_forward(self.scene_input_layer(selected_contexts, valid), hidden_references)

    def forward(self, source_values, input_references=None, hidden_references=()):
        input_active = active_input_neuron_mask(
            self.input_layer.neuron_count,
            source_values.shape[1],
            self.input_layer.groups,
            source_values.device,
        )
        values = self.input_layer(source_values, input_references, input_active)
        return self._finish_forward(values, hidden_references)

def choose_function(choice_values, exploration=0.05, training=False):
    """Return the highest raw function value, with rare training exploration.

    choice_values is [B, F]. It is not converted into a percentage. During
    normal use it always selects the largest value. During training, a small
    number of choices are replaced with a random function so the grader can
    discover whether an untried function works better.
    """
    chosen = choice_values.argmax(dim=1)
    if training and exploration > 0:
        explore = torch.rand(choice_values.shape[0], device=choice_values.device) < exploration
        random_choices = torch.randint(choice_values.shape[1], chosen.shape, device=choice_values.device)
        chosen = torch.where(explore, random_choices, chosen)
    return chosen

def reward_from_grader(grader_value, higher_is_better=False):
    """Turn the one final grader value into a value the chooser should seek."""
    grader_value = torch.as_tensor(grader_value, device=DEVICE, dtype=torch.float32)
    return grader_value if higher_is_better else -grader_value

def chosen_function_value(choice_values, function_indexes):
    """Read the raw value belonging to each function actually selected."""
    return choice_values.gather(1, function_indexes.to(torch.long).unsqueeze(1)).squeeze(1)

def update_choices_from_grader(optimizer, chosen_values, grader_value, higher_is_better=False):
    """Update every choice made in one completed run from its final grade.

    Keep the chosen values returned by each run in a list. When STOP ends
    the call and the grader returns one value, call this once. It moves every
    selected function value toward that final reward without requiring a
    labelled correct function or a probability distribution.
    """
    if not chosen_values:
        raise ValueError("A completed call needs at least one chosen function value")
    reward = reward_from_grader(grader_value, higher_is_better)
    losses = [torch.nn.functional.mse_loss(value, reward.expand_as(value)) for value in chosen_values]
    loss = torch.stack(losses).mean()
    optimizer.zero_grad(set_to_none=True)
    loss.backward()
    optimizer.step()
    return loss.detach(), reward.detach()

def reward_train_step(model, optimizer, source_values, grader_value, input_references=None, hidden_references=(), exploration=0.05, higher_is_better=False):
    """One-run convenience helper when a grader value is available immediately."""
    model.train()
    choice_values = model(source_values, input_references, hidden_references)
    record_scene_run(model, choice_values)
    function_indexes = choose_function(choice_values, exploration, training=True)
    chosen_value = chosen_function_value(choice_values, function_indexes)
    loss, reward = update_choices_from_grader(optimizer, [chosen_value], grader_value, higher_is_better)
    return loss, function_indexes.detach(), choice_values.detach(), reward

def local_grader_train_step(model, optimizer, source_values, original_input, generated_output, input_references=None, hidden_references=(), exploration=0.05):
    """Grade one completed call with this export's selected local grader, then train."""
    grader_value = grade_completed_output(original_input, generated_output)
    return reward_train_step(model, optimizer, source_values, grader_value, input_references, hidden_references, exploration, higher_is_better=True)

def make_fast_model(model):
    """Optional GPU compiler; use stable grid sizes for maximum speed."""
    if hasattr(torch, "compile"):
        return torch.compile(model, mode="reduce-overhead", dynamic=False)
    return model

model = GeneratedNetwork(PROJECT).to(DEVICE)

if __name__ == "__main__":
    if LOCAL_GRADER_CONFIG.get("enabled", False):
        print("CUDA network exported. Start the selected local grader on this Vast instance, then call local_grader_train_step().")
    else:
        print("CUDA network exported. Supply token grids, references, and final grader values to reward_train_step().")
`;
  return source.replace(/class GeneratedNetwork[\s\S]*?print\("CUDA export ready\. Add the generated equation compiler and dataset loader next\."\)\n/, networkRuntime);
};

// GitHub project bridge. The browser never receives a GitHub token: it only
// talks to the local preview server, which keeps the short-lived session.
function githubSafeProject(value) {
  const excluded = /^(pretrained(_?weights?)?|weights?|biases?|checkpoints?|model_?state|state_?dict|optimizer_?state|trained_?weights|weight_?tensor|bias_?tensor|parameter_?values)$/i;
  const copy = (entry, key = '') => {
    if (excluded.test(key)) return undefined;
    if (Array.isArray(entry)) return entry.map((item) => copy(item)).filter((item) => item !== undefined);
    if (entry && typeof entry === 'object') return Object.fromEntries(Object.entries(entry).flatMap(([childKey, child]) => { const safe = copy(child, childKey); return safe === undefined ? [] : [[childKey, safe]]; }));
    return entry;
  };
  return copy(value);
}

const githubProjectButton = document.createElement('button');
githubProjectButton.id = 'github-project';
githubProjectButton.type = 'button';
githubProjectButton.textContent = 'GitHub';
githubProjectButton.title = 'Import or export a network design without pretrained weights';
$('#save').after(githubProjectButton);

const githubPanel = document.createElement('section');
githubPanel.id = 'github-panel';
githubPanel.hidden = true;
githubPanel.innerHTML = '<header><div><small>GITHUB PROJECTS</small><h1>Version network designs</h1><p>Import and export the editable project design. Pretrained weights, checkpoints, optimizer state, and secrets are never imported or exported.</p></div><button type="button" id="github-close" aria-label="Close GitHub">×</button></header><section class="github-account"><div><small>ACCOUNT</small><b id="github-account-name">Checking connection…</b><p id="github-account-note"></p></div><div class="github-account-actions"><button type="button" id="github-connect">Connect GitHub</button><button type="button" id="github-disconnect" hidden>Disconnect</button></div></section><div class="github-grid"><section><small>EXPORT</small><h2>Send this network to a repository</h2><p>Use an existing empty or selected repository. The export writes <code>project.json</code>, <code>train.py</code>, a README, and a safety <code>.gitignore</code>.</p><label>Repository <input id="github-export-repository" type="text" placeholder="owner/repository" spellcheck="false" autocomplete="off"></label><button type="button" id="github-export">Export design to GitHub</button></section><section><small>IMPORT</small><h2>Open a network design</h2><p>Only <code>project.json</code> is loaded. Numerical trained weights and checkpoints are stripped even if a repository contains them.</p><label>Repository <input id="github-import-repository" type="text" placeholder="owner/repository" spellcheck="false" autocomplete="off"></label><label>Branch, tag, or commit <input id="github-import-ref" type="text" placeholder="Default branch" spellcheck="false" autocomplete="off"></label><button type="button" id="github-import">Import design</button></section></div><output id="github-status" aria-live="polite"></output>';
document.body.append(githubPanel);

const githubApiBase = location.port === '4175' ? '' : 'http://127.0.0.1:4175';
async function githubJson(url, options = {}) { const response = await fetch(`${githubApiBase}${url}`, { ...options, credentials: 'include' }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'GitHub request failed'); return payload; }
function githubStatus(message, error = false) { const output = $('#github-status'); output.textContent = message; output.classList.toggle('error', error); }
async function renderGithubStatus() {
  const status = await githubJson('/api/github/status');
  $('#github-account-name').textContent = status.connected ? `Connected as ${status.user.login}` : status.configured ? 'Not connected' : 'GitHub setup needed';
  $('#github-account-note').textContent = status.connected ? 'This local session can read and write only through the local GitHub bridge.' : status.configured ? 'Sign in to choose a GitHub account and authorize project access.' : 'Add this computer’s GitHub App credentials to the preview server before connecting.';
  $('#github-connect').hidden = status.connected;
  $('#github-disconnect').hidden = !status.connected;
  $('#github-export').disabled = !status.connected;
  $('#github-import').disabled = !status.connected;
}
function openGithubPanel() { githubPanel.hidden = false; githubPanel.classList.add('open'); githubStatus(''); renderGithubStatus().catch((error) => githubStatus(error.message, true)); }
function closeGithubPanel() { githubPanel.hidden = true; githubPanel.classList.remove('open'); if (location.hash === '#github') history.replaceState(null, '', '#network'); }
function importedEquation(item, index) { return { id: `eq-import-${Date.now()}-${index}`, name: String(item.name || `Imported equation ${index + 1}`).slice(0, 120), expression: String(item.expression || '').slice(0, 5000), role: ['calculation', 'formatting', 'evaluation'].includes(item.role) ? item.role : 'calculation', lines: [String(item.expression || '').slice(0, 5000)] }; }
function loadGithubProject(rawProject) {
  const project = githubSafeProject(rawProject);
  if (!project || !Array.isArray(project.layers) || !project.layers.length) throw new Error('This project does not contain an editable network design.');
  const layers = project.layers.filter((layer) => !/output layer/i.test(String(layer.name || ''))).map((layer, index) => ({ name: String(layer.name || `Custom neuron layer ${String(index + 1).padStart(2, '0')}`), count: Math.max(1, Math.min(999999, Number(layer.neurons ?? layer.count) || 1)), groups: JSON.stringify(Array.isArray(layer.inputGroups) ? layer.inputGroups : []), postEquation: String(layer.postCalculation || '') }));
  if (!layers.length) throw new Error('This project does not contain importable custom neuron layers.');
  const equations = Array.isArray(project.equations) ? project.equations.map(importedEquation) : [];
  localStorage.setItem('nf-working-network', JSON.stringify({ name: String(project.name || 'Imported network'), layers }));
  localStorage.setItem('nf-working-equations', JSON.stringify(equations));
  localStorage.setItem('nf-equations', JSON.stringify(equations));
  if (project.training && typeof project.training === 'object') localStorage.setItem('nf-training-config', JSON.stringify(githubSafeProject(project.training)));
  if (project.output && typeof project.output === 'object') localStorage.setItem('nf-output-config', JSON.stringify(githubSafeProject(project.output)));
  if (project.context && typeof project.context === 'object') localStorage.setItem('nf-context-config', JSON.stringify(githubSafeProject(project.context)));
  if (project.tensors && typeof project.tensors === 'object') localStorage.setItem('nf-tensor-config', JSON.stringify(githubSafeProject(project.tensors)));
  if (project.inputNeuron && typeof project.inputNeuron === 'object') localStorage.setItem('nf-input-neuron-settings', JSON.stringify(githubSafeProject(project.inputNeuron)));
  localStorage.setItem('nf-github-source', JSON.stringify({ importedAt: new Date().toISOString(), weightsLoaded: false }));
  location.href = 'index.html#network'; location.reload();
}

githubProjectButton.onclick = openGithubPanel;
$('#github-close').onclick = closeGithubPanel;
$('#github-connect').onclick = () => { location.href = `${githubApiBase}/auth/github`; };
$('#github-disconnect').onclick = async () => { try { await fetch(`${githubApiBase}/api/github/logout`, { method: 'POST', credentials: 'include' }); githubStatus('Disconnected.'); await renderGithubStatus(); } catch (error) { githubStatus(error.message, true); } };
$('#github-export').onclick = async () => {
  try {
    const repository = $('#github-export-repository').value.trim(); if (!repository) throw new Error('Enter the destination as owner/repository.');
    githubStatus('Exporting project design…');
    const project = githubSafeProject(cudaExportProject());
    const result = await githubJson('/api/github/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repository, project, python: buildCudaPython(project) }) });
    githubStatus(`Exported without weights to ${result.repository}.`); window.open(result.url, '_blank', 'noopener');
  } catch (error) { githubStatus(error.message, true); }
};
$('#github-import').onclick = async () => {
  try {
    const repository = $('#github-import-repository').value.trim(); if (!repository) throw new Error('Enter the source as owner/repository.');
    const ref = $('#github-import-ref').value.trim(); githubStatus('Reading project.json and removing all trained-weight fields…');
    const result = await githubJson(`/api/github/import?repository=${encodeURIComponent(repository)}&ref=${encodeURIComponent(ref)}`);
    githubStatus(`Imported ${result.repository}. Reloading the editable design…`); setTimeout(() => loadGithubProject(result.project), 450);
  } catch (error) { githubStatus(error.message, true); }
};
if (location.hash === '#github') openGithubPanel();

function exportCudaPython() {
  const config = cudaExportProject();
  const blob = new Blob([buildCudaPython(config)], { type: 'text/x-python;charset=utf-8' });
  const download = document.createElement('a');
  const safeName = config.name.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'neuron_foundry';
  download.href = URL.createObjectURL(blob);
  download.download = `${safeName}_cuda.py`;
  document.body.append(download);
  download.click();
  download.remove();
  setTimeout(() => URL.revokeObjectURL(download.href), 1000);
  toast('CUDA Python file exported');
}

exportPythonButton.onclick = exportCudaPython;

// Model precision remains separate from fixed ternary context dimensions.
$('#context-bits').parentElement.firstChild.textContent = 'Model bits ';

// Symbolic partial derivatives shown before training.  The Python exporter
// will use the same local rules; this browser version makes the generated
// equations visible while the project is being designed.
function derivativeVariables(expression) {
  return [...new Set(String(expression || '').match(/[A-Z](?:[₀₁₂₃₄₅₆₇₈₉ᵢ]+|\d*)/g) || [])];
}
function derivativeNormalise(expression) {
  return String(expression || '').replace(/\s+/g, '').replaceAll('*', '×').replaceAll('/', '÷').replaceAll('−', '-');
}
function derivativeWrapped(text) {
  if (!(text.startsWith('(') && text.endsWith(')'))) return false;
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '(') depth++;
    if (text[index] === ')') depth--;
    if (depth === 0 && index < text.length - 1) return false;
  }
  return depth === 0;
}
function derivativeStrip(text) {
  let value = text;
  while (derivativeWrapped(value)) value = value.slice(1, -1);
  return value;
}
function derivativeOperator(text, operators) {
  let depth = 0;
  for (let index = text.length - 1; index >= 0; index--) {
    const character = text[index];
    if (character === ')') depth++;
    if (character === '(') depth--;
    if (depth === 0 && operators.includes(character) && index > 0) return index;
  }
  return -1;
}
function derivativeHas(expression, variable) {
  return derivativeVariables(expression).includes(variable);
}
function derivativeAdd(left, right, operator = '+') {
  if (right === '0') return left;
  if (left === '0') return operator === '-' ? `-${right}` : right;
  return `(${left}${operator}${right})`;
}
function derivativeMultiply(left, right) {
  if (left === '0' || right === '0') return '0';
  if (left === '1') return right;
  if (right === '1') return left;
  if (left === '-1') return `-(${right})`;
  if (right === '-1') return `-(${left})`;
  return `(${left}×${right})`;
}
function derivativeDivide(left, right) {
  if (left === '0') return '0';
  if (right === '1') return left;
  return `(${left}÷${right})`;
}
function symbolicPartial(source, variable) {
  let expression = derivativeStrip(derivativeNormalise(source));
  if (!expression || !derivativeHas(expression, variable)) return '0';
  if (expression === variable) return '1';
  if (/^-?\d+(?:\.\d+)?$/.test(expression)) return '0';

  let index = derivativeOperator(expression, ['+', '-']);
  if (index !== -1) {
    const left = expression.slice(0, index), right = expression.slice(index + 1), operator = expression[index];
    return derivativeAdd(symbolicPartial(left, variable), symbolicPartial(right, variable), operator);
  }
  index = derivativeOperator(expression, ['×', '÷']);
  if (index !== -1) {
    const left = expression.slice(0, index), right = expression.slice(index + 1), operator = expression[index];
    const dLeft = symbolicPartial(left, variable), dRight = symbolicPartial(right, variable);
    if (operator === '×') return derivativeAdd(derivativeMultiply(dLeft, right), derivativeMultiply(left, dRight));
    return derivativeDivide(derivativeAdd(derivativeMultiply(dLeft, right), derivativeMultiply(left, dRight), '-'), `(${right})²`);
  }

  const functionMatch = expression.match(/^(sin|cos|ln|exp|Σ)\((.*)\)$/);
  if (functionMatch) {
    const [, name, inner] = functionMatch, dInner = symbolicPartial(inner, variable);
    if (name === 'sin') return derivativeMultiply(`cos(${inner})`, dInner);
    if (name === 'cos') return derivativeMultiply(`-sin(${inner})`, dInner);
    if (name === 'ln') return derivativeDivide(dInner, inner);
    if (name === 'exp') return derivativeMultiply(`exp(${inner})`, dInner);
    if (name === 'Σ') return `Σ(${dInner})`;
  }
  if (expression.startsWith('√')) {
    const inner = derivativeStrip(expression.slice(1));
    return derivativeDivide(symbolicPartial(inner, variable), `2×√(${inner})`);
  }
  if (expression.endsWith('²')) {
    const inner = derivativeStrip(expression.slice(0, -1));
    return derivativeMultiply(`2×(${inner})`, symbolicPartial(inner, variable));
  }
  const repeatMatch = expression.match(/^⟦(.+)⟧ₓ$/);
  if (repeatMatch) return `⟦${symbolicPartial(repeatMatch[1], variable)}⟧ₓ`;
  return `∂(${expression})/∂${variable}`;
}

function ensureDerivativeRulesPanel() {
  let panel = $('#derivative-rules-panel');
  if (panel) return panel;
  panel = document.createElement('section');
  panel.id = 'derivative-rules-panel';
  panel.className = 'derivative-rules-panel';
  panel.innerHTML = `<div class="derivative-rules-copy"><small>RULE LIBRARY</small><h2>Partial-derivative rules</h2><p>These rules are combined recursively with the chain rule. They are read-only and are used to prepare every saved neuron equation before training.</p></div><div class="derivative-rule-table" role="table" aria-label="Partial derivative rules"><div class="rule-heading" role="row"><b role="columnheader">Equation part</b><b role="columnheader">Derivative rule</b></div><div role="row"><code>a + b</code><span>for a: <code>1</code> · for b: <code>1</code></span></div><div role="row"><code>a − b</code><span>for a: <code>1</code> · for b: <code>−1</code></span></div><div role="row"><code>a × b</code><span>for a: <code>b</code> · for b: <code>a</code></span></div><div role="row"><code>a ÷ b</code><span>for a: <code>1/b</code> · for b: <code>−a/b²</code></span></div><div role="row"><code>sin(a)</code><span><code>cos(a)</code></span></div><div role="row"><code>cos(a)</code><span><code>−sin(a)</code></span></div><div role="row"><code>a²</code><span><code>2a</code></span></div><div role="row"><code>√a</code><span><code>1/(2√a)</code></span></div></div>`;
  $('.pre-derived-key').after(panel);
  return panel;
}

renderPreDerivedEquations = function renderSymbolicPreDerivedEquations() {
  $('.pre-derived-head p').textContent = 'Read-only weight and bias change factors generated from every equation used by the network before training begins.';
  $('.pre-derived-key').textContent = 'Final weight change uses the neuron blame, learning rate, and the matching change factor below.';
  ensureDerivativeRulesPanel();
  const graph = $('#pre-derived-graph'), sources = equationSources();
  graph.innerHTML = '';

  const sourceRow = document.createElement('section');
  sourceRow.className = 'pre-derived-row source-row';
  sourceRow.innerHTML = '<div class="pre-derived-row-label"><small>01</small><b>Neuron equations</b><span>The exact saved equations used in the forward pass</span></div>';
  const sourceCards = document.createElement('div');
  sourceCards.className = 'pre-derived-cards';
  sources.forEach((source) => sourceCards.append(graphCard('pre-derived-card source-equation', source.label, source.name, source.expression || 'No expression saved')));
  sourceRow.append(sourceCards);
  graph.append(sourceRow);

  const derivativeRow = document.createElement('section');
  derivativeRow.className = 'pre-derived-row derived-row';
  derivativeRow.innerHTML = '<div class="pre-derived-row-label"><small>02</small><b>Weight and bias change factors</b><span>Used after that neuron has already received its final blame value</span></div>';
  const derivativeCards = document.createElement('div');
  derivativeCards.className = 'pre-derived-cards';
  sources.forEach((source) => {
    derivativeVariables(source.expression).filter((variable) => variable.startsWith('W') || (variable.startsWith('B') && !variable.includes('ᵢ'))).forEach((variable) => {
      derivativeCards.append(graphCard('pre-derived-card derived-equation', `${source.label} · ${variable}`, `${variable} change factor`, symbolicPartial(source.expression, variable)));
    });
  });
  if (!derivativeCards.children.length) {
    const empty = document.createElement('p');
    empty.className = 'pre-derived-empty';
    empty.textContent = 'No weights or biases were found yet. Add W or B values to a saved equation to prepare their change factors.';
    derivativeCards.append(empty);
  }
  derivativeRow.append(derivativeCards);
  graph.append(derivativeRow);
};

if (location.hash === '#pre-derived') renderPreDerivedEquations();

// Input size fields are caps, not instructions to pad or resize data.  The
// runtime will create only the first-layer captures that fit inside an actual
// input; shared context-grid dimensions are the first layer's trainable values.
function presentInputCaps() {
  const textLength = $('#tensor-text-length');
  if (textLength) textLength.closest('label').firstChild.textContent = 'Maximum token cap ';
  ['#tensor-image-fit', '#tensor-video-fit', '#tensor-text-overflow'].forEach((selector) => $(selector)?.closest('label')?.remove());
  const rename = (selector, text) => { const field = $(selector); if (field) field.closest('label').firstChild.textContent = text + ' '; };
  rename('#tensor-image-height', 'Maximum height');
  rename('#tensor-image-width', 'Maximum width');
  rename('#tensor-video-frames', 'Maximum frames');
  rename('#tensor-video-height', 'Maximum height');
  rename('#tensor-video-width', 'Maximum width');

  const capNote = (card, id, message) => {
    if (!card || $(id)) return;
    const note = document.createElement('p');
    note.id = id.slice(1);
    note.className = 'input-cap-note';
    note.textContent = message;
    card.querySelector('.tensor-fields')?.after(note);
  };
  const cards = tensorWorkspace.querySelectorAll('.tensor-card');
  capNote(cards[0], '#text-cap-note', 'This is a cap. Shorter text activates only the token-centred neurons that have real tokens to read.');
  capNote(cards[1], '#image-cap-note', 'These are caps. Smaller images are not padded or resized; only complete input captures inside the real image activate neurons.');
  capNote(cards[2], '#video-cap-note', 'These are caps. Smaller videos are not padded or resized; only complete captures inside the real frames activate neurons.');
}

const renderInputCaps = renderTensorWorkspace;
renderTensorWorkspace = function renderCappedInputWorkspace() {
  renderInputCaps();
  presentInputCaps();
  const config = getTensorConfig();
  const textCap = positiveTensorNumber(config.textLength, 1024);
  const imageHeightCap = positiveTensorNumber(config.imageHeight, 224);
  const imageWidthCap = positiveTensorNumber(config.imageWidth, 224);
  const videoFrameCap = positiveTensorNumber(config.videoFrames, 16);
  const videoHeightCap = positiveTensorNumber(config.videoHeight, 224);
  const videoWidthCap = positiveTensorNumber(config.videoWidth, 224);
  if (config.textEnabled) $('#tensor-text-shape').textContent = `Text token IDs: [B, T]\nT is the real token count, capped at ${textCap}\nSaved token pieces are matched greedily; UTF-8 bytes safely cover everything else.`;
  if (config.imageEnabled) $('#tensor-image-shape').textContent = `Image token IDs: [B, H, W]\nH and W are the real image size, capped at ${imageHeightCap} by ${imageWidthCap}\nOnly captures that fit inside the real image activate; no padding or resizing is used.`;
  if (config.videoEnabled) $('#tensor-video-shape').textContent = `Video token IDs: [B, F, H, W]\nF, H and W are real video dimensions, capped at ${videoFrameCap} frames and ${videoHeightCap} by ${videoWidthCap}\nOnly captures that fit inside the real video activate; no padding or resizing is used.`;
  const sceneShape = $('#tensor-current-scene-shape');
  if (sceneShape) sceneShape.textContent = 'Scene token IDs: [R, T]\nAverage R positions: [R, T]\nScene context lookup: [T × 256, D]\nEach function/output value uses one stable 8-bit token ID.';
  const inputRoute = $('#input-layer-route');
  if (inputRoute) inputRoute.textContent = 'The first layer activates only the valid captures that the real input can supply. Its shared trainable values are the token context-dimension rows, used universally by every matching first-layer capture; it does not create separate W or B values for each neuron.';
}

const presentCappedInputLayer = v3PresentAutomaticInputLayer;
v3PresentAutomaticInputLayer = function presentCappedAutomaticInputLayer() {
  presentCappedInputLayer();
  const first = customNeuronLayers()[0];
  if (first) first.querySelector('span').textContent = 'valid captures only';
  const firstSection = sectionList.querySelector('button');
  if (firstSection) firstSection.textContent = 'Dynamic input layer · input-sized';
};

presentInputCaps();
v3PresentAutomaticInputLayer();
if (location.hash === '#input') renderTensorWorkspace();

// Context graphs are viewed separately for every input source. They share the
// project's configured dimension width, but never mix their row labels.
const inputContextPages = [
  { id: 'text', label: 'Text', title: 'Text context graph', description: 'Rows are addressed by text token ID. UTF-8 fallback uses IDs 0–255; saved multi-symbol pieces begin at 256.', shape: '[T, D]', rowLabel: 'Token ID', rows: () => ['Byte 032 · Space', 'Byte 097 · a', 'Byte 116 · t', 'Saved ID 256 · first custom piece', 'Saved ID 257 · next custom piece', '…'] },
  { id: 'image', label: 'Image context', title: 'Image context', description: 'Rows are addressed by visual token ID.', shape: '[T, D]', rowLabel: 'Token ID', imageToken: true, rows: () => Array.from({ length: 16 }, (_, index) => `ID ${String(index).padStart(3, '0')}`) },
  { id: 'history', label: 'Current scene', title: 'Current scene context graph', description: 'Each function position has 256 signed-eight-bit token rows.', shape: '[Function × 256, D]', rowLabel: 'Token ID', rows: () => Array.from({ length: 16 }, (_, index) => `Function 0 · value code ${String(index).padStart(3, '0')}`) }
];

function activeContextPage() {
  const stored = localStorage.getItem('nf-context-page');
  return inputContextPages.find((page) => page.id === stored) || inputContextPages[0];
}

function ensureContextPageTabs() {
  let tabs = $('#context-page-tabs');
  if (tabs) return tabs;
  tabs = document.createElement('nav');
  tabs.id = 'context-page-tabs';
  tabs.className = 'context-page-tabs';
  tabs.setAttribute('aria-label', 'Choose an input context graph');
  tabs.setAttribute('role', 'tablist');
  inputContextPages.forEach((page) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.contextPage = page.id;
    button.setAttribute('role', 'tab');
    button.textContent = page.label;
    button.onclick = () => { localStorage.setItem('nf-context-page', page.id); renderContextGraph(); };
    tabs.append(button);
  });
  contextWorkspace.querySelector('.context-head').after(tabs);
  return tabs;
}

const imageContextViews = [
  { id: 'context', label: 'Context dimensions', shape: '[V,D]' },
  { id: 'colour', label: 'Colour', shape: '[B,T,P,3]' },
  { id: 'pixel-positions', label: 'Pixel positions', shape: '[B,T,P,2]' },
  { id: 'focal-points', label: 'Focal points', shape: '[B,T,2]' }
];

function activeImageContextView() {
  const stored = localStorage.getItem('nf-image-context-view');
  return imageContextViews.find((view) => view.id === stored) || imageContextViews[0];
}

function ensureImageContextTabs() {
  let tabs = $('#image-context-tabs');
  if (tabs) return tabs;
  tabs = document.createElement('nav');
  tabs.id = 'image-context-tabs';
  tabs.className = 'context-page-tabs image-context-tabs';
  tabs.setAttribute('aria-label', 'Choose an image context view');
  imageContextViews.forEach((view) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = view.label;
    button.dataset.imageContextView = view.id;
    button.onclick = () => { localStorage.setItem('nf-image-context-view', view.id); renderContextGraph(); };
    tabs.append(button);
  });
  $('#context-page-tabs').after(tabs);
  return tabs;
}

function tokenRepresentationFor(page) {
  if (page.id === 'text') return { title: 'TEXT REPRESENTATION', content: '[T]  text list' };
  if (page.id === 'image') return { title: 'TOKEN REPRESENTATION', content: '[T,P,3]  colour\n[T,P,2]  pixel positions\n[T,2]    focal point' };
  if (page.id === 'history') return { title: 'CURRENT SCENE REPRESENTATION', content: '[B,R,T]  raw output values\n[B,R]    highest-value T index' };
  return null;
}

function ensureImageTokenRepresentation() {
  let panel = $('#image-token-representation');
  if (panel) return panel;
  panel = document.createElement('section');
  panel.id = 'image-token-representation';
  panel.className = 'image-token-representation';
  panel.innerHTML = '<small></small><code></code>';
  $('#context-grid-wrap').before(panel);
  return panel;
}

function renderInputContextGraph() {
  const page = activeContextPage();
  const config = getContextConfig();
  const fixedEightBit = Boolean(page.fixedEightBit);
  const imageToken = Boolean(page.imageToken);
  const dimensions = fixedEightBit ? 256 : Math.max(1, Math.min(4096, config.dimensions));
  const bits = fixedEightBit ? 8 : Math.max(1, Math.min(128, config.bits));
  const rows = page.rows();
  const wrap = $('#context-grid-wrap');
  const spacer = $('#context-grid-spacer');
  const canvas = $('#context-canvas');
  const cellWidth = 78;
  const labelWidth = 132;
  const rowHeight = 30;
  const headerHeight = 30;

  const dimensionSelect = $('#context-dimensions');
  const stageSelect = $('#context-subdimensions');
  const stageLabel = $('#context-subdimensions-label');
  dimensionSelect.value = dimensions;
  dimensionSelect.closest('label').hidden = fixedEightBit;
  if (stageSelect) {
    const allowedStages = contextPowerValues.filter((value) => value <= Math.min(dimensions, 2048) && dimensions % value === 0);
    const selectedStage = validSubdimensionSize(config.subdimensionSize, dimensions);
    stageSelect.innerHTML = powerSelectOptions(allowedStages, selectedStage);
    stageSelect.value = selectedStage;
  }
  if (stageLabel) stageLabel.hidden = fixedEightBit;
  $('#context-workspace .context-head h1').textContent = page.title;
  $('#context-workspace .context-head p').textContent = fixedEightBit ? `${page.description} It stays at 8 bits and has no editable context-dimension width.` : imageToken ? page.description : `${page.description} ${page.shape} stores ${page.rowLabel.toLowerCase()} rows across shared ternary context dimensions.`;
  const tabs = ensureContextPageTabs();
  tabs.querySelectorAll('button').forEach((button) => {
    const selected = button.dataset.contextPage === page.id;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  // Image vocabulary design is paused, so do not create its extra views.
  // This avoids leaving hidden image-only controls in the context workspace.
  $('#image-context-tabs')?.remove();
  const tokenRepresentation = ensureImageTokenRepresentation();
  const representation = tokenRepresentationFor(page);
  tokenRepresentation.hidden = !representation;
  if (representation) {
    tokenRepresentation.querySelector('small').textContent = representation.title;
    tokenRepresentation.querySelector('code').textContent = representation.content;
    $('#context-workspace .context-head p').textContent = page.description;
  }
  $('#context-summary').textContent = fixedEightBit ? `${page.shape} · ${rows.length} function list${rows.length === 1 ? '' : 's'} · 256 values per function · fixed 8-bit values · initialized at 0 until training` : imageToken ? 'Image context · priority 4' : `${page.shape} · ${dimensions} shared dimensions · ${dimensions / config.subdimensionSize} equal stages of ${config.subdimensionSize} · ternary −1, 0, +1 values · initialized at 0 until training`;
  spacer.style.width = `${labelWidth + dimensions * cellWidth}px`;
  spacer.style.height = `${headerHeight + Math.max(rows.length, fixedEightBit ? 2 : 1) * rowHeight}px`;
  canvas.setAttribute('aria-label', `${page.title} values`);

  const draw = () => {
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    const left = wrap.scrollLeft;
    const top = wrap.scrollTop;
    const ratio = devicePixelRatio || 1;
    const firstDimension = Math.max(0, Math.floor((left - labelWidth) / cellWidth));
    const lastDimension = Math.min(dimensions - 1, Math.ceil((left + width - labelWidth) / cellWidth));
    const firstRow = Math.max(0, Math.floor((top - headerHeight) / rowHeight));
    const lastRow = Math.min(rows.length - 1, Math.ceil((top + height - headerHeight) / rowHeight));
    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#fffefa';
    ctx.fillRect(0, 0, width, height);
    ctx.font = '10px DM Mono';
    ctx.textBaseline = 'middle';
    for (let dimension = firstDimension; dimension <= lastDimension; dimension++) {
      const x = labelWidth + dimension * cellWidth - left;
      ctx.fillStyle = '#e7f3ff';
      ctx.fillRect(x, 0, cellWidth, headerHeight);
      ctx.fillStyle = '#315f89';
      ctx.textAlign = 'right';
      ctx.fillText(dimension, x + cellWidth - 8, 15);
    }
    if (!rows.length) {
      ctx.fillStyle = '#fffefa';
      ctx.fillRect(0, headerHeight, width, Math.max(0, height - headerHeight));
      ctx.fillStyle = '#5f6c75';
      ctx.textAlign = 'left';
      ctx.fillText('Add an output function to create its current-scene value list.', 12, headerHeight + 21);
    }
    for (let row = firstRow; row <= lastRow; row++) {
      const y = headerHeight + row * rowHeight - top;
      ctx.fillStyle = '#f7f2e8';
      ctx.fillRect(0, y, labelWidth, rowHeight);
      ctx.fillStyle = '#242a36';
      ctx.textAlign = 'left';
      ctx.fillText(rows[row], 9, y + 15);
      for (let dimension = firstDimension; dimension <= lastDimension; dimension++) {
        const x = labelWidth + dimension * cellWidth - left;
        ctx.fillStyle = '#355466';
        ctx.textAlign = 'right';
        ctx.fillText('0', x + cellWidth - 8, y + 15);
      }
    }
    ctx.fillStyle = '#d7ebfa';
    ctx.fillRect(0, 0, labelWidth, headerHeight);
    ctx.fillStyle = '#315f89';
    ctx.textAlign = 'left';
    ctx.fillText(page.rowLabel, 9, 15);
    ctx.strokeStyle = '#e2e7e8';
    for (let dimension = firstDimension; dimension <= lastDimension + 1; dimension++) {
      const x = labelWidth + dimension * cellWidth - left;
      ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, height); ctx.stroke();
    }
    for (let row = firstRow; row <= lastRow + 1; row++) {
      const y = headerHeight + row * rowHeight - top;
      ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(width, y + .5); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(labelWidth + .5, 0); ctx.lineTo(labelWidth + .5, height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, headerHeight + .5); ctx.lineTo(width, headerHeight + .5); ctx.stroke();
  };
  wrap.onscroll = draw;
  draw();
}

renderContextGraph = renderInputContextGraph;
if (location.hash === '#context') renderContextGraph();

// Equation studio v2: formulas remain compact saved data, but the workspace
// is now a purpose-built visual editor for the safe CUDA equation compiler.
// It deliberately does not rerender while somebody is typing a formula.
const equationMarkupEscape = (value) => String(value || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function equationFormulaMarkup(expression) {
  // Keep the preview as escaped text on the first paint. Decorating the
  // formula character-by-character can generate an enormous DOM for a
  // malformed or pasted expression, which made the browser unstable.
  return equationMarkupEscape(expression || 'Choose blocks below to build this equation');
}

function equationAutoIdentifier(expression, letter) {
  const digits = '₀₁₂₃₄₅₆₇₈₉';
  const used = new Set([...(String(expression || '').matchAll(new RegExp(`${letter}([${digits}]+)`, 'g')) || [])]
    .map((match) => Number([...match[1]].map((digit) => digits.indexOf(digit)).join(''))));
  let next = 1;
  while (used.has(next)) next += 1;
  return `${letter}${String(next).split('').map((digit) => digits[Number(digit)]).join('')}`;
}

function rebuildEquationStudio(focusId) {
  const equations = getEquations();
  if (focusId && equations.some((equation) => equation.id === focusId)) activeEquation = focusId;
  if (!activeEquation || !equations.some((equation) => equation.id === activeEquation)) activeEquation = equations[0]?.id || null;
  const active = equations.find((equation) => equation.id === activeEquation);
  const selectedRole = active ? inferredEquationRole(active) : 'calculation';
  const selectedStatus = active ? describeEquationForRole(active.expression || active.lines?.join(' ') || '', selectedRole) : null;

  equationWorkspace.innerHTML = `
    <section class="equation-v7">
      <header class="equation-v7-head">
        <div><small>EQUATION SYSTEM · SAVED WITH THIS NETWORK</small><h1>Equation builder</h1><p>Build one safe maths tree at a time. The same tree is checked here, then exported as CUDA/PyTorch tensor operations.</p></div>
        <button id="equation-v7-new" class="equation-v7-primary" type="button">+ New equation</button>
      </header>
      <div class="equation-v7-layout">
        <aside class="equation-v7-library" aria-label="Saved equations">
          <div class="equation-v7-panel-head"><small>SAVED EQUATIONS</small><span>${equations.length}</span></div>
          <div id="equation-v7-list" class="equation-v7-list">
            ${equations.map((equation, index) => {
              const expression = equation.expression || equation.lines?.join(' ') || '';
              const role = inferredEquationRole(equation);
              const status = describeEquationForRole(expression, role);
              return `<article class="equation-v7-list-item${equation.id === activeEquation ? ' active' : ''}" data-equation-id="${equationMarkupEscape(equation.id)}"><button class="equation-v7-select" type="button"><span>${String(index + 1).padStart(2, '0')}</span><b>${equationMarkupEscape(equation.name || 'Untitled equation')}</b><em>${equationRoles[role].label} · ${status.error ? 'Needs fixing' : 'CUDA ready'}</em></button><button class="equation-v7-delete" type="button" aria-label="Delete ${equationMarkupEscape(equation.name || 'equation')}">×</button></article>`;
            }).join('') || '<p class="equation-v7-empty">Create an equation to begin.</p>'}
          </div>
        </aside>
        <main class="equation-v7-editor">
          ${active ? `
            <div class="equation-v7-editor-head">
              <div><small>EDITING EQUATION</small><input id="equation-v7-name" aria-label="Equation name" value="${equationMarkupEscape(active.name)}"></div>
              <label class="equation-v7-role"><small>USED FOR</small><select id="equation-v7-role" aria-label="Equation purpose"><option value="calculation" ${selectedRole === 'calculation' ? 'selected' : ''}>Calculation</option><option value="formatting" ${selectedRole === 'formatting' ? 'selected' : ''}>Formatting</option><option value="evaluation" ${selectedRole === 'evaluation' ? 'selected' : ''}>Evaluation</option></select></label>
              <span id="equation-v7-status" class="equation-v7-status ${selectedStatus.error ? 'error' : 'ready'}">${equationMarkupEscape(selectedStatus.label)}</span>
            </div>
            <section class="equation-v7-canvas" aria-label="Visual formula canvas">
              <div class="equation-v7-canvas-bar"><span>FORMULA</span><span id="equation-v7-save-state">Saved when you click away</span></div>
              <div id="equation-v7-preview" class="equation-v7-preview">${equationFormulaMarkup(active.expression || active.lines?.join(' ') || '')}</div>
              <input id="equation-v7-expression" class="equation-v7-expression" inputmode="none" autocomplete="off" spellcheck="false" aria-label="Formula" value="${equationMarkupEscape(active.expression || active.lines?.join(' ') || '')}" placeholder="Use the maths blocks below">
            </section>
            <section class="equation-v7-contract" aria-label="Equation output contract">
              <div><small>RETURNS</small><b>${selectedRole === 'calculation' ? 'One raw value per neuron' : selectedRole === 'formatting' ? 'One standard output value' : 'One training score'}</b><span>${selectedRole === 'calculation' ? 'The result becomes [B,N].' : selectedRole === 'formatting' ? 'Receives the raw value as X.' : 'Used only by the Training tab.'}</span></div>
              <div><small>ALLOWED VALUES</small><b>${equationRoles[selectedRole].allowed.join(', ')}</b><span>${equationMarkupEscape(equationRoles[selectedRole].help)}.</span></div>
              <div><small>CUDA</small><b>${selectedStatus.error ? 'Fix formula first' : 'Tensor operation tree'}</b><span>${selectedStatus.error ? equationMarkupEscape(selectedStatus.error) : 'No user Python is executed.'}</span></div>
            </section>
            <section class="equation-v7-keyboard" aria-label="Maths blocks">
              <div class="equation-v7-keyboard-head"><div><small>MATHS BLOCKS</small><b>Click to insert at the caret</b></div><button id="equation-v7-backspace" type="button" aria-label="Backspace">⌫</button></div>
              <div class="equation-v7-block-groups">
                <div><small>VALUES</small><div class="equation-v7-blocks">${selectedRole === 'calculation' ? '<button data-eq-v7-variable="X">Input X</button><button data-eq-v7-variable="W">Weight W</button><button data-eq-v7-variable="B">Bias B</button>' : selectedRole === 'formatting' ? '<button data-eq-v7-variable="X">Raw value X</button>' : '<button data-eq-v7-insert="Y">Output Y</button><button data-eq-v7-insert="T">Target T</button>'}</div></div>
                <div><small>STRUCTURE</small><div class="equation-v7-blocks">${selectedRole === 'calculation' ? '<button data-eq-v7-repeat="true">⟦ repeat over x ⟧</button>' : ''}<button data-eq-v7-insert="(">(</button><button data-eq-v7-insert=")">)</button><button data-eq-v7-insert="²">square</button><button data-eq-v7-insert="^">power</button></div></div>
                <div><small>OPERATORS</small><div class="equation-v7-blocks"><button data-eq-v7-insert="+">+</button><button data-eq-v7-insert="−">−</button><button data-eq-v7-insert="×">×</button><button data-eq-v7-insert="÷">÷</button><button data-eq-v7-insert=".">decimal</button></div></div>
                <div><small>FUNCTIONS</small><div class="equation-v7-blocks"><button data-eq-v7-insert="sin(">sin</button><button data-eq-v7-insert="cos(">cos</button><button data-eq-v7-insert="sqrt(">√</button><button data-eq-v7-insert="abs(">|x|</button><button data-eq-v7-insert="log(">log</button><button data-eq-v7-insert="exp(">exp</button></div></div>
                <div><small>NUMBERS</small><div class="equation-v7-blocks equation-v7-numbers">${[7,8,9,4,5,6,1,2,3,0].map((number) => `<button data-eq-v7-insert="${number}">${number}</button>`).join('')}</div></div>
              </div>
            </section>
          ` : '<div class="equation-v7-no-selection"><b>No equation selected</b><span>Create an equation to open the formula builder.</span></div>'}
        </main>
      </div>
    </section>`;

  const persist = (patch) => {
    const next = getEquations();
    const item = next.find((equation) => equation.id === activeEquation);
    if (!item) return;
    Object.assign(item, patch);
    if (patch.expression !== undefined) item.lines = [patch.expression];
    storeEquations(next);
    if (typeof storeWorkingNetwork === 'function') storeWorkingNetwork();
  };
  const select = (id) => rebuildEquationStudio(id);
  equationWorkspace.querySelector('#equation-v7-new')?.addEventListener('click', () => {
    const next = getEquations(); const equation = newEquation(); next.push(equation); storeEquations(next); rebuildEquationStudio(equation.id);
  });
  equationWorkspace.querySelectorAll('.equation-v7-select').forEach((button) => button.addEventListener('click', () => select(button.closest('[data-equation-id]').dataset.equationId)));
  equationWorkspace.querySelectorAll('.equation-v7-delete').forEach((button) => button.addEventListener('click', () => {
    const id = button.closest('[data-equation-id]').dataset.equationId;
    const training = getTrainingConfig();
    if (training.lossEquationId === id) { training.lossEquationId = ''; storeTrainingConfig(training); }
    storeEquations(getEquations().filter((equation) => equation.id !== id));
    if (activeEquation === id) activeEquation = null;
    rebuildEquationStudio();
  }));

  const nameInput = equationWorkspace.querySelector('#equation-v7-name');
  const expressionInput = equationWorkspace.querySelector('#equation-v7-expression');
  const preview = equationWorkspace.querySelector('#equation-v7-preview');
  const status = equationWorkspace.querySelector('#equation-v7-status');
  const roleSelect = equationWorkspace.querySelector('#equation-v7-role');
  const saveState = equationWorkspace.querySelector('#equation-v7-save-state');
  const refreshFormula = () => {
    if (!expressionInput) return;
    const compiled = describeEquationForRole(expressionInput.value, roleSelect?.value || selectedRole);
    preview.innerHTML = equationFormulaMarkup(expressionInput.value);
    status.textContent = compiled.label;
    status.className = `equation-v7-status ${compiled.error ? 'error' : 'ready'}`;
    saveState.textContent = 'Unsaved change';
  };
  nameInput?.addEventListener('blur', () => { persist({ name: nameInput.value.trim() || 'Untitled equation' }); rebuildEquationStudio(activeEquation); });
  roleSelect?.addEventListener('change', () => { persist({ role: roleSelect.value }); rebuildEquationStudio(activeEquation); });
  expressionInput?.addEventListener('input', refreshFormula);
  expressionInput?.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab'].includes(event.key)) return;
    if (/^[0-9+\-*/^().]$/.test(event.key)) return;
    event.preventDefault();
  });
  expressionInput?.addEventListener('blur', () => { persist({ expression: expressionInput.value }); if (saveState) saveState.textContent = 'Saved'; });

  const insert = (text, insideRepeat = false) => {
    if (!expressionInput) return;
    const start = expressionInput.selectionStart ?? expressionInput.value.length;
    const end = expressionInput.selectionEnd ?? start;
    expressionInput.value = expressionInput.value.slice(0, start) + text + expressionInput.value.slice(end);
    const caret = start + (insideRepeat ? 2 : text.length);
    expressionInput.selectionStart = expressionInput.selectionEnd = caret;
    expressionInput.focus();
    refreshFormula();
  };
  equationWorkspace.querySelectorAll('[data-eq-v7-insert]').forEach((button) => button.addEventListener('click', () => insert(button.dataset.eqV7Insert)));
  equationWorkspace.querySelectorAll('[data-eq-v7-variable]').forEach((button) => {
    button.addEventListener('click', () => insert(button.dataset.eqV7Variable === 'X' ? 'X' : equationAutoIdentifier(expressionInput?.value, button.dataset.eqV7Variable)));
  });
  equationWorkspace.querySelector('[data-eq-v7-repeat]')?.addEventListener('click', () => insert('⟦  ⟧ₓ', true));
  equationWorkspace.querySelector('#equation-v7-backspace')?.addEventListener('click', () => {
    if (!expressionInput) return;
    const start = expressionInput.selectionStart ?? 0, end = expressionInput.selectionEnd ?? start;
    if (start !== end) expressionInput.value = expressionInput.value.slice(0, start) + expressionInput.value.slice(end);
    else if (start) expressionInput.value = expressionInput.value.slice(0, start - 1) + expressionInput.value.slice(start);
    expressionInput.selectionStart = expressionInput.selectionEnd = Math.max(0, start - 1);
    expressionInput.focus();
    refreshFormula();
  });
}

// Kept as an explicit startup gate while the initial render is verified.
// The assignment is activated immediately after the safe first paint below.
const equationStudioV7Enabled = true;
if (equationStudioV7Enabled) {
  renderEquationRows = rebuildEquationStudio;
  rebuildEquationStudio();
}

// The input layer is automatic, but its connection rule remains a project
// choice.  Keep these controls separate from the regular hidden-layer editor.
const inputNeuronEditor = document.createElement('aside');
inputNeuronEditor.className = 'editor input-neuron-editor';
inputNeuronEditor.id = 'input-neuron-editor';
inputNeuronEditor.setAttribute('aria-hidden', 'true');
document.body.append(inputNeuronEditor);

function inputNeuronSettings(node = customNeuronLayers()[0]) {
  const subdimensionSize = getContextConfig().subdimensionSize;
  try {
    const saved = JSON.parse(node?.dataset.inputNeuronSettings || localStorage.getItem('nf-input-neuron-settings') || '');
    if (saved && typeof saved === 'object') return { equation: saved.equation || defaultEquationName(), formattingEquation: saved.formattingEquation || '', links: Math.max(1, Number(saved.links) || 8), distance: Math.max(0, Number(saved.distance) || 256), sectionSize: subdimensionSize, sectionThreshold: Number.isFinite(Number(saved.sectionThreshold)) ? Number(saved.sectionThreshold) : 0 };
  } catch (_) {}
  return { equation: defaultEquationName(), formattingEquation: '', links: 8, distance: 256, sectionSize: subdimensionSize, sectionThreshold: 0 };
}

function storeInputNeuronSettings(node, settings) {
  const clean = { equation: settings.equation || defaultEquationName(), formattingEquation: settings.formattingEquation || '', links: Math.max(1, Math.floor(Number(settings.links) || 1)), distance: Math.max(0, Math.floor(Number(settings.distance) || 0)), sectionSize: getContextConfig().subdimensionSize, sectionThreshold: Math.floor(Number(settings.sectionThreshold) || 0) };
  node.dataset.inputNeuronSettings = JSON.stringify(clean);
  localStorage.setItem('nf-input-neuron-settings', JSON.stringify(clean));
  storeWorkingNetwork();
  return clean;
}

function openInputNeuronEditor(node) {
  active = node;
  $('#editor').classList.remove('open');
  groupEditor.classList.remove('open');
  const settings = inputNeuronSettings(node);
  const formattingOptions = formattingEquationOptions(settings.formattingEquation, true);
  const context = getContextConfig();
  inputNeuronEditor.innerHTML = `<div class="editor-head"><div><p>INPUT LAYER</p><h1>Input neuron links</h1></div><button type="button" class="close-input-neuron" aria-label="Close input neuron links">×</button></div><p class="input-neuron-copy">For each target token, the GPU tests candidate tokens in stages. It multiplies matching context dimensions, adds that stage’s results, and stops checking a candidate as soon as it fails your pass value.</p><label for="input-neuron-equation">Calculation equation</label><select id="input-neuron-equation">${equationOptions(settings.equation)}</select><p class="input-neuron-copy">Each kept link supplies all of its context dimensions. Every context value receives its own weight, then ⟦ … ⟧ₓ reduces all kept values into this neuron’s one output.</p><label for="input-neuron-formatting">Formatting equation</label><select id="input-neuron-formatting">${formattingOptions}</select><p class="input-neuron-copy">Optionally converts the calculation result into the layer’s standard output value.</p><section class="input-neuron-settings"><label for="input-neuron-links">Passing links to keep <input id="input-neuron-links" type="number" min="1" max="100000" step="1" value="${settings.links}"></label><p>User-set maximum. Each input neuron stores up to this many token indexes after they pass every matching stage.</p><label for="input-neuron-distance">Candidate search distance <input id="input-neuron-distance" type="number" min="0" max="100000" step="1" value="${settings.distance}"></label><p>For text, this counts token positions. For network history, it counts earlier R rows only; every T value in those rows is tested without treating nearby T indexes as related.</p><p><b>Stage split:</b> ${context.dimensions} total dimensions ÷ ${settings.sectionSize} per stage = ${context.dimensions / settings.sectionSize} equal stages. Change this in Context graph.</p><label for="input-neuron-section-threshold">Stage pass value <input id="input-neuron-section-threshold" type="number" min="-100000" max="100000" step="1" value="${settings.sectionThreshold}"></label><p>User-set closeness rule. A candidate continues only if its stage total is at least this value; otherwise the GPU stops checking it immediately.</p></section><p class="autosave-note">Changes save automatically.</p>`;
  inputNeuronEditor.classList.add('open');
  inputNeuronEditor.setAttribute('aria-hidden', 'false');
  inputNeuronEditor.querySelector('.close-input-neuron').onclick = () => { inputNeuronEditor.classList.remove('open'); inputNeuronEditor.setAttribute('aria-hidden', 'true'); active = null; };
  const save = () => storeInputNeuronSettings(node, {
    equation: inputNeuronEditor.querySelector('#input-neuron-equation').value,
    formattingEquation: inputNeuronEditor.querySelector('#input-neuron-formatting').value,
    links: inputNeuronEditor.querySelector('#input-neuron-links').value,
    distance: inputNeuronEditor.querySelector('#input-neuron-distance').value,
    sectionThreshold: inputNeuronEditor.querySelector('#input-neuron-section-threshold').value
  });
  inputNeuronEditor.querySelector('#input-neuron-equation').onchange = save;
  inputNeuronEditor.querySelector('#input-neuron-formatting').onchange = save;
  inputNeuronEditor.querySelector('#input-neuron-links').oninput = save;
  inputNeuronEditor.querySelector('#input-neuron-distance').oninput = save;
  inputNeuronEditor.querySelector('#input-neuron-section-threshold').oninput = save;
}

const closeBeforeInputNeuronEditor = close;
close = function closeAllNeuronEditors() {
  closeBeforeInputNeuronEditor();
  inputNeuronEditor.classList.remove('open');
  inputNeuronEditor.setAttribute('aria-hidden', 'true');
};

const v6OpenEditor = openEditor;
openEditor = function openInputNeuronSettings(node) {
  if (v3IsInputLayer(node)) return openInputNeuronEditor(node);
  v6OpenEditor(node);
};

const v6PresentAutomaticInputLayer = v3PresentAutomaticInputLayer;
v3PresentAutomaticInputLayer = function presentConfigurableInputLayer() {
  v6PresentAutomaticInputLayer();
  const first = customNeuronLayers()[0];
  if (!first) return;
  const card = first.closest('.layer-stack')?.querySelector('.input-layer-system-card');
  if (card) card.innerHTML = '<small>AUTOMATIC</small><b>Token-centred<br>connections</b><span>Click layer to configure</span>';
  const firstSection = sectionList.querySelector('button');
  if (firstSection) firstSection.textContent = 'Dynamic input layer · link settings';
};

v3PresentAutomaticInputLayer();

// Image input is deliberately paused until a real visual-token vocabulary is
// supplied. Existing saved projects stay readable, but image controls and
// exports cannot accidentally create an unfinished image pipeline.
function pauseImageInput() {
  const config = getTensorConfig();
  if (config.imageEnabled) {
    config.imageEnabled = false;
    storeTensorConfig(config);
  }
  const imageCard = $('#tensor-image-enabled')?.closest('.tensor-card');
  if (imageCard) imageCard.hidden = true;
  const imagePage = inputContextPages.findIndex((page) => page.id === 'image');
  if (imagePage >= 0) inputContextPages.splice(imagePage, 1);
  if (localStorage.getItem('nf-context-page') === 'image') localStorage.setItem('nf-context-page', 'text');
  document.querySelector('[data-context-page="image"]')?.remove();
  $('#image-context-tabs')?.remove();
  customNeuronLayers().forEach((node) => {
    const groups = defaultGroups(node);
    let changed = false;
    groups.forEach((group) => {
      if (group.imageEnabled) { group.imageEnabled = false; changed = true; }
    });
    if (changed) node.dataset.groups = JSON.stringify(groups);
  });
  const inputIntro = tensorWorkspace?.querySelector('.tensor-head p');
  if (inputIntro) inputIntro.textContent = 'Use text inputs and current-scene history. Image input is paused while its token vocabulary is designed.';
}

const openGroupEditorBeforeImagePause = openGroupEditor;
openGroupEditor = function openGroupEditorWithoutImage(node, index) {
  openGroupEditorBeforeImagePause(node, index);
  const imageSection = [...groupEditor.querySelectorAll('.source-section')].find((section) => section.querySelector('summary')?.textContent.trim() === 'Image');
  if (imageSection) imageSection.hidden = true;
  const imageToggle = $('#group-image-enabled');
  if (imageToggle) { imageToggle.checked = false; imageToggle.disabled = true; }
};

pauseImageInput();
if (location.hash === '#context') renderContextGraph();
if (location.hash === '#input') renderTensorWorkspace();

// Current Scene uses the stable output/action grid [R,T]. Its creator scans
// centre-anchored 3x3 areas, retaining only cells that repeat across B records.
const scenePatternDefaults = { creationVariation: 4, matchingCellsPercent: 70, conversationMiB: 64, historyMiB: 64, checkEvery: 100 };

function scenePatternNumber(value, fallback, minimum, maximum) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function normalizeScenePatternSettings(raw = {}) {
  return {
    creationVariation: scenePatternNumber(raw.creationVariation, scenePatternDefaults.creationVariation, 0, 16),
    // matchingRowsPercent is accepted only to migrate saved projects from the
    // old R-sequence creator.
    matchingCellsPercent: scenePatternNumber(raw.matchingCellsPercent ?? raw.matchingRowsPercent, scenePatternDefaults.matchingCellsPercent, 1, 100),
    conversationMiB: scenePatternNumber(raw.conversationMiB, scenePatternDefaults.conversationMiB, 1, 16384),
    historyMiB: scenePatternNumber(raw.historyMiB, scenePatternDefaults.historyMiB, 1, 16384),
    checkEvery: scenePatternNumber(raw.checkEvery, scenePatternDefaults.checkEvery, 1, 1000000)
  };
}

function getScenePatternSettings() {
  try { return normalizeScenePatternSettings(JSON.parse(localStorage.getItem('nf-scene-pattern-settings') || '{}')); }
  catch (_) { return { ...scenePatternDefaults }; }
}

function saveScenePatternSettings(settings) {
  localStorage.setItem('nf-scene-pattern-settings', JSON.stringify(normalizeScenePatternSettings(settings)));
  storeWorkingNetwork();
}

function getScenePatternExportSettings() {
  const settings = getScenePatternSettings();
  return { ...settings, creationDifference: settings.creationVariation, fixedScale: 'x 2^-8' };
}

function renderScenePatternControls() {
  let panel = $('#scene-pattern-controls');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'scene-pattern-controls';
    panel.className = 'scene-pattern-controls';
    $('#context-grid-wrap').before(panel);
  }
  const isCurrentScene = activeContextPage().id === 'history';
  panel.hidden = !isCurrentScene;
  if (!isCurrentScene) return;

  const settings = getScenePatternSettings();
  panel.innerHTML = `
    <div class="scene-pattern-copy"><small>CURRENT SCENE TOKENS</small><h2>Centre-anchored 3×3 shapes</h2><p>Every possible centre in the raw <code>[B,R,T]</code> action grid begins a 3×3 search. A token always keeps its centre, then keeps only surrounding cells that repeat across separate <code>B</code> records.</p></div>
    <div class="scene-pattern-fields">
      <label>Token search grid <input type="text" value="3 × 3, centre required" readonly></label>
      <label>Allowed difference when creating a token <input data-scene-pattern="creationVariation" type="number" min="0" max="16" value="${settings.creationVariation}"></label>
      <label>Minimum matching token cells (%) <input data-scene-pattern="matchingCellsPercent" type="number" min="1" max="100" value="${settings.matchingCellsPercent}"></label>
      <label>Check every completed calls <input data-scene-pattern="checkEvery" type="number" min="1" max="1000000" value="${settings.checkEvery}"></label>
      <label>Conversation Current Scene cap (MiB) <input data-scene-pattern="conversationMiB" type="number" min="1" max="16384" value="${settings.conversationMiB}"></label>
      <label>Archive Current Scene cap (MiB) <input data-scene-pattern="historyMiB" type="number" min="1" max="16384" value="${settings.historyMiB}"></label>
    </div>
    <p class="scene-pattern-note">Every finished cycle is saved to both histories. Conversation history resets at a new conversation; archive history keeps complete B records until its cap is full. A learned token stores its relative <code>[R,T]</code> cells, expected values, calculated per-cell tolerances, and a new <code>[D]</code> row seeded from its kept T actions.</p>`;
  panel.querySelectorAll('[data-scene-pattern]').forEach((field) => {
    field.onchange = () => {
      const next = { ...getScenePatternSettings(), [field.dataset.scenePattern]: field.value };
      saveScenePatternSettings(next);
      renderScenePatternControls();
    };
  });
}

const renderContextGraphBeforeScenePatternControls = renderContextGraph;
renderContextGraph = function renderContextGraphWithScenePatternControls() {
  renderContextGraphBeforeScenePatternControls();
  renderScenePatternControls();
};

if (location.hash === '#context') renderContextGraph();
