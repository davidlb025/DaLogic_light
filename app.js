/* DaLogic Light — local Canvas editor. No backend and no runtime dependencies. */
(() => {
  'use strict';
  const C = window.DaLogicCore, $ = id => document.getElementById(id);
  const canvas = $('board'), ctx = canvas.getContext('2d', {alpha: false});
  const storageKey = 'dalogic-light-plus-v1';
  const icons = {
    new: 'M12 5v14m-7-7h14', open: 'M3 19V6h6l2 3h10l-3 10H3Zm0-7h17',
    save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8',
    undo: 'M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12', redo: 'm16 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12',
    delete: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
    fit: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8Z',
    plus: 'M12 5v14m-7-7h14', minus: 'M5 12h14', table: 'M3 4h18v16H3ZM3 10h18M9 4v16m6-16v16',
    moon: 'M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z',
    sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    close: 'm6 6 12 12M6 18 18 6'
  };
  function icon(element, name) {
    element.querySelector('svg')?.remove();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', icons[name]); svg.append(path); element.prepend(svg);
  }
  document.querySelectorAll('[data-icon]').forEach(element => icon(element, element.dataset.icon));
  let doc = C.example(), camera = {x: 0, y: 0, z: 1}, restoredCamera = false;
  let theme = 'light', initialStatus = 'Listo';
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.project) {
      doc = C.normalise(saved.project); initialStatus = 'Circuito recuperado de este navegador';
      if (saved.camera && ['x', 'y', 'z'].every(k => Number.isFinite(saved.camera[k])) && saved.camera.z >= .2 && saved.camera.z <= 3) { camera = saved.camera; restoredCamera = true; }
    }
    if (saved?.theme === 'dark') theme = 'dark';
  } catch (_) { initialStatus = 'Listo. No hay una copia local disponible.'; }
  let network = C.compile(doc), values = C.evaluate(doc, network), selected = new Set(), selectedWire = null;
  let placingModule = null, gridVisible = true, snapEnabled = true, heldButton = null;
  let placing = null, drawing = null, interaction = null, hover = null, spaceDown = false;
  let history = [], future = [], savedKey = JSON.stringify(doc), clipboard = null;
  let width = 0, height = 0, paintPending = false, firstResize = true, colours = {}, spatial = new Map();
  let selectionSignature = '', saveTimer, toastTimer, pendingConfirm = null, tableData = null;
  const wireCache = new Map(), pointers = new Map(); let pinch = null;
  let pointerPosition = {x: 0, y: 0};
  const snap = v => snapEnabled ? Math.round(v / 20) * 20 : Math.round(v);
  const displayValue = value => value === null || value === undefined ? 'X' : String(value);
  const world = p => ({x: (p.x - camera.x) / camera.z, y: (p.y - camera.y) / camera.z});
  const local = event => { const r = canvas.getBoundingClientRect(); return {x: event.clientX - r.left, y: event.clientY - r.top}; };
  function notice(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => {$('toast').hidden = true;}, 6000); }
  function status(message) { $('status').textContent = message; }
  function repaint() { if (!paintPending) { paintPending = true; requestAnimationFrame(paint); } }
  function persist() {
    clearTimeout(saveTimer); saveTimer = setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify({project: C.serialise(doc), camera, theme})); $('storage-status').textContent = 'Copia local actualizada'; }
      catch (_) { $('storage-status').textContent = 'Guarda un archivo para conservarlo'; }
    }, 600);
  }
  function readColours() {
    const style = getComputedStyle(document.documentElement);
    for (const name of ['bg', 'surface', 'text', 'muted', 'border', 'grid', 'gate', 'gate-fill', 'wire', 'active', 'off', 'unknown', 'input', 'output', 'bulb', 'focus']) colours[name] = style.getPropertyValue('--' + name).trim();
  }
  function setTheme(value) {
    theme = value; document.documentElement.dataset.theme = theme;
    const label = theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
    $('theme').setAttribute('aria-label', label); $('theme').title = label; icon($('theme'), theme === 'dark' ? 'sun' : 'moon');
    document.querySelector('meta[name=theme-color]').content = theme === 'dark' ? '#171e28' : '#f5f7fb';
    readColours(); repaint(); persist();
  }
  function indexNodes() {
    spatial = new Map();
    doc.nodes.forEach((n, z) => {
      const {w, h} = C.size(n);
      for (let x = Math.floor((n.x - 15) / 160); x <= Math.floor((n.x + w + 15) / 160); x++) for (let y = Math.floor((n.y - 25) / 160); y <= Math.floor((n.y + h + 15) / 160); y++) {
        const key = `${x}:${y}`; if (!spatial.has(key)) spatial.set(key, []); spatial.get(key).push({n, z});
      }
    });
  }
  function nearby(p) {
    const found = new Map(), x = Math.floor(p.x / 160), y = Math.floor(p.y / 160);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const item of spatial.get(`${x + i}:${y + j}`) || []) found.set(item.n.id, item);
    return [...found.values()].sort((a, b) => b.z - a.z).map(item => item.n);
  }
  function hitPort(p) {
    const radius = Math.max(8, 9 / camera.z);
    for (const n of nearby(p)) {
      for (const side of ['in', 'out']) {
        const count = side === 'in' ? n.inputs : C.outputCount(n);
        for (let i = 0; i < count; i++) { const q = C.port(n, side, i); if (Math.hypot(q.x - p.x, q.y - p.y) <= radius) return {id: n.id, side, index: i, ...q}; }
      }
    }
    return null;
  }
  function hitNode(p) {
    return nearby(p).find(n => {const {w, h} = C.size(n); return p.x >= n.x + 10 && p.x <= n.x + w - 6 && p.y >= n.y - 19 && p.y <= n.y + h + 5;});
  }
  function route(wire) {
    const a = C.port(network.byId.get(wire.from), 'out', wire.output ?? 0), b = C.port(network.byId.get(wire.to), 'in', wire.input);
    const cached = wireCache.get(wire.id);
    if (cached && cached.ax === a.x && cached.ay === a.y && cached.bx === b.x && cached.by === b.y && cached.source === wire.points) return cached;
    let points;
    if (wire.points.length) points = [a, ...wire.points, b];
    else if (b.x - a.x >= 40) { const x = (a.x + b.x) / 2; points = [a, {x, y: a.y}, {x, y: b.y}, b]; }
    else { const y = Math.max(a.y, b.y) + 60; points = [a, {x: a.x + 25, y: a.y}, {x: a.x + 25, y}, {x: b.x - 25, y}, {x: b.x - 25, y: b.y}, b]; }
    const path = new Path2D(); path.moveTo(points[0].x, points[0].y); for (const p of points.slice(1)) path.lineTo(p.x, p.y);
    const entry = {path, points, ax: a.x, ay: a.y, bx: b.x, by: b.y, source: wire.points,
      left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y))};
    wireCache.set(wire.id, entry); return entry;
  }
  function segmentDistance(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }
  function hitWire(p) {
    const r = 7 / camera.z;
    for (let i = doc.wires.length - 1; i >= 0; i--) {
      const w = doc.wires[i], line = route(w);
      if (p.x < line.left - r || p.x > line.right + r || p.y < line.top - r || p.y > line.bottom + r) continue;
      if (line.points.slice(1).some((q, j) => segmentDistance(p, line.points[j], q) < r)) return w;
    }
    return null;
  }
  function updateInterface() {
    $('undo').disabled = !history.length; $('redo').disabled = !future.length; $('delete').disabled = !selected.size && selectedWire === null;
    $('copy-selection').disabled = $('duplicate-selection').disabled = !selected.size;
    $('paste-selection').disabled = !clipboard;
    document.querySelectorAll('[data-arrange]').forEach(button => {button.disabled = selected.size < (['left','top'].includes(button.dataset.arrange) ? 2 : 3);});
    $('project-name').value = doc.name; document.title = `${JSON.stringify(doc) === savedKey ? '' : '● '}${doc.name} · DaLogic Light +`;
    $('counts').textContent = `${doc.nodes.length} componente${doc.nodes.length === 1 ? '' : 's'} · ${doc.wires.length} cable${doc.wires.length === 1 ? '' : 's'}`;
    $('empty-state').hidden = Boolean(doc.nodes.length || placing);
    $('cancel-drawing').hidden = !drawing;
    const n = selected.size === 1 ? network.byId.get([...selected][0]) : null;
    $('selection-panel').hidden = !n;
    if (n) {
      $('selection-title').textContent = C.TYPES[n.type];
      const signature = doc.nodes.map(item => `${item.id}:${item.label}:${item.type}:${item.module?.name || ''}`).join('|');
      if (signature !== selectionSignature) {
        $('selected-node').replaceChildren(...doc.nodes.map(item => {
          const option = document.createElement('option'); option.value = item.id; option.textContent = item.label || item.module?.name || `${C.TYPES[item.type]} ${item.id + 1}`; return option;
        })); selectionSignature = signature;
      }
      $('selected-node').value = String(n.id);
      $('node-label').value = n.label;
      $('inputs-field').hidden = !C.variableGates.includes(n.type);
      $('node-inputs').value = n.inputs;
      $('toggle-switch').hidden = !C.sources.includes(n.type);
      $('node-signal').textContent = n.type === 'MODULO' ? n.module.output_labels.map((label,i) => label+': '+displayValue(C.valueAt(values,n.id,i))).join(' · ') : displayValue(values.get(n.id));
      $('toggle-switch').textContent = n.type === 'BOTON' ? 'Mantener pulsado · 1' : `Cambiar a ${n.state ? '0 · Apagado' : '1 · Encendido'}`;
    }
  }
  function record(before) {
    if (before !== JSON.stringify(doc)) {history.push(before); if (history.length > 60) history.shift(); future = [];}
  }
  function finish(topology = true) {
    if (topology) {network = C.compile(doc); values = C.evaluate(doc, network); wireCache.clear();}
    selected = new Set([...selected].filter(id => network.byId.has(id)));
    indexNodes(); updateInterface(); persist(); repaint();
  }
  function change(callback, topology = true) {
    const before = JSON.stringify(doc);
    try {callback(); if (topology) C.compile(doc); record(before); finish(topology);}
    catch (error) {doc = JSON.parse(before); finish(); notice(error.message);}
  }
  function select(id, additive = false) { if (!additive) selected.clear(); if (id !== null) selected.add(id); selectedWire = null; updateInterface(); repaint(); }
  function cancel() {
    releaseButton();
    placing = drawing = placingModule = null;
    document.querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-pressed', 'false'));
    canvas.style.cursor = 'default'; updateInterface(); repaint(); status('Listo');
  }
  function fit() {
    if (!width || !height) return;
    if (!doc.nodes.length) camera = {x: width / 2 - 120, y: height / 2 - 50, z: 1};
    else {
      let left = Math.min(...doc.nodes.map(n => n.x)) - 65, top = Math.min(...doc.nodes.map(n => n.y)) - 70;
      let right = Math.max(...doc.nodes.map(n => n.x + C.size(n).w)) + 65, bottom = Math.max(...doc.nodes.map(n => n.y + C.size(n).h)) + 50;
      for (const wire of doc.wires) for (const point of wire.points) {left = Math.min(left, point.x - 40); right = Math.max(right, point.x + 40); top = Math.min(top, point.y - 40); bottom = Math.max(bottom, point.y + 40);}
      const z = Math.max(.2, Math.min(1.25, (width - 50) / (right - left), (height - 90) / (bottom - top)));
      camera = {z, x: width / 2 - (left + right) * z / 2, y: height / 2 - (top + bottom) * z / 2 + 10};
    }
    repaint(); persist();
  }
  function zoom(factor, at = {x: width / 2, y: height / 2}) {
    const before = world(at); camera.z = Math.max(.2, Math.min(3, camera.z * factor));
    camera.x = at.x - before.x * camera.z; camera.y = at.y - before.y * camera.z; repaint(); persist();
  }
  function add(type, p) {
    if (doc.nodes.length >= C.MAX_NODES) {notice('Light admite hasta 2.000 componentes por circuito.'); return;}
    change(() => { const id = Math.max(-1, ...doc.nodes.map(n => n.id)) + 1; doc.nodes.push(C.node(id, type, snap(p.x - 60), snap(p.y - 32), '', placingModule)); selected = new Set([id]); selectedWire = null; });
    cancel(); canvas.focus(); status(`${C.TYPES[type]} añadido`);
  }
  function removeSelection() {
    if (!selected.size && selectedWire === null) return;
    change(() => {doc.nodes = doc.nodes.filter(n => !selected.has(n.id)); doc.wires = doc.wires.filter(w => !selected.has(w.from) && !selected.has(w.to) && w.id !== selectedWire); selected.clear(); selectedWire = null;});
    status('Selección eliminada · Ctrl+Z para deshacer');
  }
  function undo(redo = false) {
    const source = redo ? future : history, target = redo ? history : future; if (!source.length) return;
    target.push(JSON.stringify(doc)); doc = JSON.parse(source.pop()); cancel(); selected.clear(); selectedWire = null; finish(); status(redo ? 'Cambio rehecho' : 'Cambio deshecho');
  }
  function copy() {
    if (!selected.size) return;
    clipboard = C.clone({nodes: doc.nodes.filter(n => selected.has(n.id)), wires: doc.wires.filter(w => selected.has(w.from) && selected.has(w.to))});
    updateInterface();
    status('Selección copiada');
  }
  function paste() {
    if (!clipboard) return;
    if (doc.nodes.length + clipboard.nodes.length > C.MAX_NODES || doc.wires.length + clipboard.wires.length > C.MAX_WIRES) {notice('La copia supera el límite de componentes o cables de Light.'); return;}
    change(() => {
      let id = Math.max(-1, ...doc.nodes.map(n => n.id)) + 1, wireId = Math.max(-1, ...doc.wires.map(w => w.id)) + 1;
      const map = new Map(); selected.clear(); selectedWire = null;
      for (const n of clipboard.nodes) {const next = id++; map.set(n.id, next); doc.nodes.push({...n, id: next, state: n.type === 'BOTON' ? false : n.state, x: n.x + 40, y: n.y + 40}); selected.add(next);}
      for (const w of clipboard.wires) doc.wires.push({...w, id: wireId++, from: map.get(w.from), to: map.get(w.to), points: w.points.map(p => ({x: p.x + 40, y: p.y + 40}))});
    });
  }
  function download(content, name, type) {
    const url = URL.createObjectURL(new Blob([content], {type})); const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function save() {
    const name = doc.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'circuito';
    const content = JSON.stringify(C.serialise(doc));
    if (new Blob([content]).size > 2 * 1024 * 1024) {notice('El proyecto supera 2 MB. Reduce los cables o CI antes de guardarlo.'); return false;}
    download(content, name + '.dalogic', 'application/json');
    savedKey = JSON.stringify(doc); updateInterface(); status('Circuito descargado');
    return true;
  }
  async function allowDiscard() {
    if (JSON.stringify(doc) === savedKey) return true;
    return new Promise(resolve => {pendingConfirm = resolve; $('confirm-dialog').showModal();});
  }
  function confirm(value, saving = false) {if (saving && !save()) return; $('confirm-dialog').close(); pendingConfirm?.(value); pendingConfirm = null;}
  function replace(next) {doc = next; selected.clear(); selectedWire = null; history = []; future = []; savedKey = JSON.stringify(doc); cancel(); finish(); fit(); canvas.focus();}
  function wireTo(pin) {
    if (!drawing) {drawing = {start: pin, points: []}; updateInterface(); repaint(); status('Conecta este puerto con un puerto del otro lado'); return;}
    if (pin.id === drawing.start.id && pin.side === drawing.start.side && pin.index === drawing.start.index) {cancel(); return;}
    if (pin.side === drawing.start.side) {notice('Conecta una salida con una entrada.'); return;}
    const from = pin.side === 'out' ? pin : drawing.start, to = pin.side === 'in' ? pin : drawing.start;
    try {
      const points = drawing.start.side === 'out' ? drawing.points : [...drawing.points].reverse();
      const next = C.connection(doc, from.id, to.id, to.index, points, from.index);
      const before = JSON.stringify(doc); doc = next; record(before); finish(); cancel(); status('Cable conectado');
    } catch (error) {notice(error.message);}
  }
  canvas.addEventListener('pointerdown', event => {
    if (![0, 1, 2].includes(event.button)) return;
    event.preventDefault(); canvas.focus(); canvas.setPointerCapture(event.pointerId);
    const at = local(event); pointers.set(event.pointerId, at); pointerPosition = at;
    if (pointers.size === 2) {
      if (interaction?.kind === 'drag') {doc = JSON.parse(interaction.before); finish();}
      const [a, b] = [...pointers.values()], mid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
      pinch = {distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), z: camera.z, anchor: world(mid)}; interaction = null; return;
    }
    if (pointers.size > 1) return;
    if (event.button === 1 || event.button === 2 || spaceDown) {interaction = {kind: 'pan', at, x: camera.x, y: camera.y}; canvas.style.cursor = 'grabbing'; return;}
    const p = world(at), pin = hitPort(p);
    if (placing) {add(placing, p); return;}
    if (pin) {wireTo(pin); return;}
    if (drawing) {if (drawing.points.length >= 128) {notice('Un cable admite hasta 128 codos.'); return;} drawing.points.push({x: snap(p.x), y: snap(p.y)}); repaint(); return;}
    const n = hitNode(p);
    if (n?.type === 'BOTON' && !event.shiftKey) {select(n.id); pressButton(n.id); return;}
    if (n) {
      if (event.shiftKey && selected.has(n.id)) {selected.delete(n.id); updateInterface(); repaint(); return;}
      if (!selected.has(n.id)) select(n.id, event.shiftKey); else {selectedWire = null; updateInterface();}
      interaction = {kind: 'drag', at, before: JSON.stringify(doc), clicked: n.id, moved: false,
        origins: doc.nodes.filter(item => selected.has(item.id)).map(item => ({id: item.id, x: item.x, y: item.y}))};
    } else {
      const wire = hitWire(p);
      if (wire) {selected.clear(); selectedWire = wire.id; updateInterface(); repaint(); status('Cable seleccionado · Supr para eliminar'); return;}
      if (event.pointerType === 'touch') interaction = {kind: 'pan', at, x: camera.x, y: camera.y};
      else {if (!event.shiftKey) selected.clear(); selectedWire = null; interaction = {kind: 'box', start: p, end: p, additive: new Set(selected)}; updateInterface(); repaint();}
    }
  });
  canvas.addEventListener('pointermove', event => {
    const at = local(event); pointerPosition = at;
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, at);
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()], mid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
      camera.z = Math.max(.2, Math.min(3, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance));
      camera.x = mid.x - pinch.anchor.x * camera.z; camera.y = mid.y - pinch.anchor.y * camera.z; repaint(); return;
    }
    if (interaction?.kind === 'pan') {camera.x = interaction.x + at.x - interaction.at.x; camera.y = interaction.y + at.y - interaction.at.y; repaint(); return;}
    if (interaction?.kind === 'drag') {
      const dx = at.x - interaction.at.x, dy = at.y - interaction.at.y;
      if (Math.hypot(dx, dy) > 4) interaction.moved = true;
      if (interaction.moved) for (const origin of interaction.origins) {const n = network.byId.get(origin.id); n.x = snap(origin.x + dx / camera.z); n.y = snap(origin.y + dy / camera.z);}
      repaint(); return;
    }
    const p = world(at);
    if (interaction?.kind === 'box') {interaction.end = p; repaint(); return;}
    const previousHover = hover; hover = hitPort(p); const body = hover ? null : hitNode(p);
    canvas.style.cursor = placing || drawing ? 'crosshair' : hover ? 'crosshair' : ['INTERRUPTOR', 'BOTON', 'CONSTANTE'].includes(body?.type) ? 'pointer' : body ? 'grab' : spaceDown ? 'grab' : 'default';
    if (hover) {const n=network.byId.get(hover.id), label=n.module?.[hover.side==='out'?'output_labels':'input_labels']?.[hover.index] || (hover.side==='out'?'Salida':'Entrada')+' '+(hover.index+1); status(`${n.label || n.module?.name || C.TYPES[n.type]} · ${label}`);}
    if (drawing || placing || hover || previousHover) repaint();
  });
  function pointerEnd(event, cancelled = false) {
    pointers.delete(event.pointerId);
    releaseButton();
    if (pinch) {if (pointers.size < 2) pinch = null; interaction = null; persist(); return;}
    const current = interaction; interaction = null;
    if (current?.kind === 'drag') {
      if (cancelled) {doc = JSON.parse(current.before); finish();}
      else if (current.moved) {record(current.before); finish(false);}
      else {const n = network.byId.get(current.clicked); if (['INTERRUPTOR', 'CONSTANTE'].includes(n?.type) && !event.shiftKey) change(() => {n.state = !n.state;});}
    } else if (current?.kind === 'box' && !cancelled) {
      const a = current.start, b = current.end;
      selected = new Set(current.additive);
      for (const n of doc.nodes) {const {w, h} = C.size(n); if (n.x < Math.max(a.x, b.x) && n.x + w > Math.min(a.x, b.x) && n.y < Math.max(a.y, b.y) && n.y + h > Math.min(a.y, b.y)) selected.add(n.id);}
      updateInterface();
    }
    canvas.style.cursor = placing || drawing ? 'crosshair' : 'default'; repaint(); persist();
  }
  canvas.addEventListener('pointerup', event => pointerEnd(event));
  canvas.addEventListener('pointercancel', event => pointerEnd(event, true));
  canvas.addEventListener('lostpointercapture', event => {if (pointers.has(event.pointerId)) pointerEnd(event, true);});
  canvas.addEventListener('pointerleave', () => {hover = null; if (!interaction) repaint();});
  canvas.addEventListener('contextmenu', event => {event.preventDefault(); if (drawing || placing) cancel();});
  canvas.addEventListener('wheel', event => {event.preventDefault(); zoom(Math.exp(-Math.max(-400, Math.min(400, event.deltaY * (event.deltaMode === 1 ? 16 : 1))) * .0017), local(event));}, {passive: false});
  document.querySelectorAll('[data-type]').forEach(button => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {const type = button.dataset.type; if (placing === type) {cancel(); return;} activateTool(type);});
    button.addEventListener('dragstart', event => {event.dataTransfer.setData('application/x-dalogic-component', button.dataset.type); event.dataTransfer.effectAllowed = 'copy';});
  });
  canvas.addEventListener('dragover', event => {if (event.dataTransfer.types.includes('application/x-dalogic-component') || event.dataTransfer.types.includes('Files')) {event.preventDefault(); event.dataTransfer.dropEffect = 'copy';}});
  canvas.addEventListener('drop', event => {event.preventDefault(); const type = event.dataTransfer.getData('application/x-dalogic-component'); if (Object.hasOwn(C.TYPES, type)) add(type, world(local(event))); else if (event.dataTransfer.files[0]) void openFile(event.dataTransfer.files[0]);});
  async function openFile(file) {
    if (file.size > 2 * 1024 * 1024) {notice('El archivo supera el límite light de 2 MB.'); return;}
    try {const next = C.normalise(JSON.parse(await file.text())); if (await allowDiscard()) {replace(next); status('Circuito abierto');}}
    catch (error) {notice(error instanceof SyntaxError ? 'El archivo no contiene JSON válido.' : error.message);}
  }
  $('new').addEventListener('click', async () => {if (await allowDiscard()) {replace(C.empty()); status('Nuevo circuito');}});
  $('open').addEventListener('click', () => {$('file-input').value = ''; $('file-input').click();});
  $('file-input').addEventListener('change', event => {if (event.target.files[0]) void openFile(event.target.files[0]);});
  $('save').addEventListener('click', save); $('undo').addEventListener('click', () => undo()); $('redo').addEventListener('click', () => undo(true));
  $('delete').addEventListener('click', removeSelection); $('fit').addEventListener('click', fit);
  $('zoom-in').addEventListener('click', () => zoom(1.2)); $('zoom-out').addEventListener('click', () => zoom(1 / 1.2));
  $('theme').addEventListener('click', () => setTheme(theme === 'light' ? 'dark' : 'light'));
  $('help').addEventListener('click', () => $('help-dialog').showModal());
  $('cancel-drawing').addEventListener('click', cancel);
  $('load-example').addEventListener('click', async () => {if (await allowDiscard()) replace(C.example());});
  $('project-name').addEventListener('change', event => change(() => {doc.name = event.target.value.trim() || 'Sin título';}, false));
  $('selected-node').addEventListener('change', event => {select(Number(event.target.value)); canvas.focus();});
  $('node-label').addEventListener('change', event => {const n = network.byId.get([...selected][0]); if (n) change(() => {n.label = event.target.value.trim().slice(0, 80);}, false);});
  $('node-inputs').addEventListener('change', event => {
    const n = network.byId.get([...selected][0]), count = Number(event.target.value);
    if (n && Number.isInteger(count) && count >= 2 && count <= 8) change(() => {n.inputs = count; doc.wires = doc.wires.filter(w => w.to !== n.id || w.input < count);}); else updateInterface();
  });
  $('toggle-switch').addEventListener('click', () => {const n = network.byId.get([...selected][0]); if (['INTERRUPTOR','CONSTANTE'].includes(n?.type)) change(() => {n.state = !n.state;});});
  $('confirm-cancel').addEventListener('click', () => confirm(false)); $('confirm-save').addEventListener('click', () => confirm(true, true)); $('confirm-discard').addEventListener('click', () => confirm(true));
  $('confirm-dialog').addEventListener('cancel', event => {event.preventDefault(); confirm(false);});
  document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $('truth').addEventListener('click', () => {
    try {
      tableData = C.truthTable(doc); const table = $('truth-table'); table.replaceChildren();
      const head = document.createElement('thead'), heading = document.createElement('tr');
      [...tableData.inputs, ...tableData.outputs].forEach(label => {const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; heading.append(cell);}); head.append(heading); table.append(head);
      const body = document.createElement('tbody');
      for (const row of tableData.rows) {const tr = document.createElement('tr'); row.forEach((value, i) => {const td = document.createElement('td'); td.textContent = displayValue(value); if (i >= tableData.inputs.length) td.className = 'output'; tr.append(td);}); body.append(tr);}
      table.append(body); $('truth-summary').textContent = `${tableData.inputs.length} entrada${tableData.inputs.length === 1 ? '' : 's'} · ${tableData.outputs.length} salida${tableData.outputs.length === 1 ? '' : 's'} · ${tableData.rows.length} combinaciones. X: señal indeterminada.`; $('truth-dialog').showModal();
    } catch (error) {notice(error.message);}
  });
  $('export-csv').addEventListener('click', () => {
    if (!tableData) return;
    const escape = v => '"' + String(v).replace(/"/g, '""') + '"';
    const headers = [...tableData.inputs, ...tableData.outputs].map(label => /^[=+\-@\t\r\n]/.test(label) ? "'" + label : label);
    const csv = [headers.map(escape).join(';'), ...tableData.rows.map(row => row.map(displayValue).map(escape).join(';'))].join('\r\n');
    download('\ufeff' + csv, 'tabla-verdad.csv', 'text/csv;charset=utf-8');
  });
  document.addEventListener('keydown', event => {
    const target = event.target;
    const key = event.key.toLowerCase(), ctrl = event.ctrlKey || event.metaKey;
    if (document.querySelector('dialog[open]')) return;
    if (target.matches('input,textarea,select') || target.isContentEditable) {
      if (!ctrl || !['s', 'o', 'n'].includes(key)) return;
      target.blur();
    }
    if (ctrl && ['s', 'o', 'n', 'z', 'y', 'd', 'a', '0', '+', '-', '=', 'c', 'v', 'x'].includes(key)) {
      event.preventDefault();
      if (key === 's') save(); else if (key === 'o') $('open').click(); else if (key === 'n') $('new').click();
      else if (key === 'z') undo(event.shiftKey); else if (key === 'y') undo(true);
      else if (key === 'a') {selected = new Set(doc.nodes.map(n => n.id)); selectedWire = null; updateInterface(); repaint();}
      else if (key === 'd') {if (selected.size) {copy(); paste();}} else if (key === 'c') copy(); else if (key === 'v') paste(); else if (key === 'x') {copy(); removeSelection();}
      else if (key === '0') fit(); else zoom(key === '-' ? 1 / 1.2 : 1.2);
      return;
    }
    if (key === 'f1') {event.preventDefault(); $('help-dialog').showModal();}
    else if (key === 'escape') {cancel();}
    else if (key === 'delete' || key === 'backspace') {event.preventDefault(); removeSelection();}
    else if (key === ' ' && target === canvas) {event.preventDefault(); const n=selected.size===1 ? network.byId.get([...selected][0]) : null; if(n?.type==='BOTON') {if(!event.repeat) pressButton(n.id);} else {spaceDown = true; canvas.style.cursor = 'grab';}}
    else if (key === 'enter' && target === canvas && placing) add(placing, world({x: width / 2, y: height / 2}));
    else if (key.startsWith('arrow') && target === canvas) {
      event.preventDefault();
      if (!selected.size && doc.nodes.length) {select(doc.nodes[0].id); return;}
      const delta = event.shiftKey ? 80 : 20;
      change(() => {for (const n of doc.nodes) if (selected.has(n.id)) {n.x += key === 'arrowleft' ? -delta : key === 'arrowright' ? delta : 0; n.y += key === 'arrowup' ? -delta : key === 'arrowdown' ? delta : 0;}}, false);
    }
  });
  document.addEventListener('keyup', event => {if (event.key === ' ') {releaseButton(); spaceDown = false; canvas.style.cursor = 'default';}});
  window.addEventListener('blur', () => {releaseButton(); spaceDown = false; pointers.clear(); pinch = null; if (interaction?.kind === 'drag') {record(interaction.before); finish(false);} interaction = null; repaint();});
  function circle(x, y, radius, fill, stroke = null) {ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); if (stroke) {ctx.strokeStyle = stroke; ctx.stroke();}}
  function drawNode(n, ghost = false) {
    const {w, h} = C.size(n), value = values.get(n.id);
    ctx.save(); ctx.translate(n.x, n.y); if (ghost) ctx.globalAlpha = .45;
    if (selected.has(n.id) && !ghost) {ctx.strokeStyle = colours.focus; ctx.lineWidth = 1 / camera.z; ctx.setLineDash([5 / camera.z, 3 / camera.z]); ctx.beginPath(); ctx.roundRect(7, -8, w - 1, h + 15, 9); ctx.stroke(); ctx.setLineDash([]);}
    ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = colours.gate; ctx.fillStyle = colours['gate-fill'];
    if (['INTERRUPTOR','BOTON','CONSTANTE'].includes(n.type)) {
      ctx.fillStyle = n.state ? colours['gate-fill'] : colours.surface; ctx.strokeStyle = n.state ? colours.active : colours.wire;
      ctx.beginPath(); ctx.roundRect(16, 12, 92, h - 24, 11); ctx.fill(); ctx.stroke();
      circle(36, h / 2, 4.5, n.state ? colours.active : colours.off);
      ctx.fillStyle = colours.text; ctx.font = '600 12px "Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n.type==='CONSTANTE' ? 'Fijo · '+Number(n.state) : n.type==='BOTON' ? 'Pulsar · '+Number(n.state) : n.state ? 'ON · 1' : 'OFF · 0', 72, h / 2);
    } else if (n.type === 'MODULO' || n.type === 'BUS_VISOR') {
      ctx.beginPath(); ctx.roundRect(16, 5, w-32, h-10, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle=colours.text; ctx.textBaseline='middle'; ctx.font='600 11px "Segoe UI",system-ui,sans-serif'; ctx.textAlign='center';
      if(n.type==='BUS_VISOR') {ctx.font='600 24px "Segoe UI",system-ui,sans-serif'; ctx.fillStyle=value===null?colours.unknown:colours.text; ctx.fillText(displayValue(value),w/2,h/2);}
      else {
        const title=n.module.name.length>20?n.module.name.slice(0,19)+'…':n.module.name;
        ctx.fillText(title,w/2,-10); ctx.font='10px "Segoe UI",system-ui,sans-serif';
        for(const side of ['in','out']) for(let i=0;i<(side==='in'?n.inputs:C.outputCount(n));i++) {
          const p=C.port(n,side,i); ctx.textAlign=side==='in'?'left':'right';
          ctx.fillText(n.module[side==='in'?'input_labels':'output_labels'][i].slice(0,10),side==='in'?26:w-26,p.y-n.y);
        }
      }
    } else if (n.type === 'BOMBILLA') {
      ctx.lineWidth = 1.5; circle(64, 26, 19, value === 1 ? colours.bulb : colours['gate-fill'], value === 1 ? '#bc9530' : colours.wire);
      ctx.strokeStyle = value === 1 ? '#8b701d' : colours.wire; ctx.beginPath(); ctx.moveTo(57, 43); ctx.lineTo(57, 51); ctx.lineTo(71, 51); ctx.lineTo(71, 43); ctx.moveTo(59, 55); ctx.lineTo(69, 55); ctx.moveTo(61, 59); ctx.lineTo(67, 59); ctx.moveTo(60, 44); ctx.lineTo(60, 28); ctx.lineTo(68, 28); ctx.lineTo(68, 44); ctx.stroke();
      ctx.fillStyle = value === null ? colours.unknown : colours.muted; ctx.font = '600 11px "Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(displayValue(value), 94, 28);
    } else {
      const path = new Path2D(), inverted = ['NAND', 'NOR', 'NOT'].includes(n.type), end = inverted ? 101 : 110;
      if (n.type === 'AND' || n.type === 'NAND') {path.moveTo(18, 10); path.lineTo(66, 10); path.quadraticCurveTo(end, 10, end, h / 2); path.quadraticCurveTo(end, h - 10, 66, h - 10); path.lineTo(18, h - 10); path.closePath();}
      else if (n.type === 'NOT') {path.moveTo(22, 10); path.lineTo(101, h / 2); path.lineTo(22, h - 10); path.closePath();}
      else {path.moveTo(18, 10); path.quadraticCurveTo(68, 8, end, h / 2); path.quadraticCurveTo(68, h - 8, 18, h - 10); path.quadraticCurveTo(42, h / 2, 18, 10); path.closePath();}
      ctx.fill(path); ctx.stroke(path);
      if (n.type === 'XOR') {ctx.beginPath(); ctx.moveTo(11, 10); ctx.quadraticCurveTo(35, h / 2, 11, h - 10); ctx.stroke();}
      if (inverted) circle(106, h / 2, 5, colours.surface, colours.gate);
      ctx.fillStyle = colours.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 12px "Segoe UI",system-ui,sans-serif'; ctx.fillText(n.type, n.type === 'NOT' ? 54 : 59, h / 2);
    }
    if (n.label && n.type !== 'MODULO') {ctx.font = '500 11px "Segoe UI",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = colours.muted; const label = n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label; ctx.fillText(label, 62, -10);}
    for (const side of ['in', 'out']) {
      const count = side === 'in' ? n.inputs : C.outputCount(n);
      for (let i = 0; i < count; i++) {
        const p = C.port(n, side, i), x = p.x - n.x, y = p.y - n.y;
        const inputId = side === 'in' ? network.incoming.get(n.id)?.[i] : null;
        const state = side === 'out' ? C.valueAt(values,n.id,i) : inputId == null ? null : C.valueAt(values,inputId,network.incomingPorts.get(n.id)[i]);
        ctx.strokeStyle = colours.gate; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(side === 'in' ? (n.type === 'BOMBILLA' ? 45 : n.type === 'MODULO' ? 16 : 22) : w-10, y); ctx.stroke();
        const lit = hover?.id === n.id && hover.side === side && hover.index === i;
        circle(x, y, lit ? 5.8 : 4.5, state === 1 ? colours.active : colours[side === 'in' ? 'input' : 'output'], lit ? colours.focus : colours.gate);
      }
    }
    ctx.restore();
  }
  function paint() {
    paintPending = false; if (!width || !height) return;
    const ratio = canvas.width / width; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = colours.bg; ctx.fillRect(0, 0, width, height);
    for (const major of gridVisible ? [false, true] : []) {
      const spacing = (major ? 100 : 20) * camera.z; if (spacing < 8) continue;
      ctx.strokeStyle = colours.grid; ctx.globalAlpha = major ? .85 : .45; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = ((camera.x % spacing) + spacing) % spacing; x < width; x += spacing) {ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, height);}
      for (let y = ((camera.y % spacing) + spacing) % spacing; y < height; y += spacing) {ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(width, Math.round(y) + .5);}
      ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.translate(camera.x, camera.y); ctx.scale(camera.z, camera.z);
    const a = world({x: 0, y: 0}), b = world({x: width, y: height});
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const wire of doc.wires) {
      const line = route(wire); if (line.right < a.x - 10 || line.left > b.x + 10 || line.bottom < a.y - 10 || line.top > b.y + 10) continue;
      ctx.strokeStyle = selectedWire === wire.id ? colours.focus : C.valueAt(values,wire.from,wire.output ?? 0) === 1 ? colours.active : colours.wire;
      ctx.lineWidth = selectedWire === wire.id ? 3 : 1.8; ctx.stroke(line.path);
    }
    for (const n of doc.nodes) {const {w, h} = C.size(n); if (n.x + w > a.x - 20 && n.x < b.x + 20 && n.y + h > a.y - 20 && n.y < b.y + 30) drawNode(n);}
    if (drawing) {
      const startNode = network.byId.get(drawing.start.id), start = C.port(startNode, drawing.start.side, drawing.start.index), end = hover || world(pointerPosition);
      ctx.lineWidth = 1.6; ctx.strokeStyle = colours.focus; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(start.x, start.y);
      for (const p of drawing.points) ctx.lineTo(p.x, p.y); ctx.lineTo(end.x, end.y); ctx.stroke(); ctx.setLineDash([]);
    }
    if (placing && !interaction) {const p = world(pointerPosition); drawNode(C.node(-1, placing, snap(p.x - 60), snap(p.y - 32), '', placingModule), true);}
    if (interaction?.kind === 'box') {
      const p = interaction.start, q = interaction.end; ctx.fillStyle = theme === 'dark' ? '#78aef521' : '#2d7ff915'; ctx.strokeStyle = colours.focus; ctx.lineWidth = 1 / camera.z;
      ctx.fillRect(p.x, p.y, q.x - p.x, q.y - p.y); ctx.strokeRect(p.x, p.y, q.x - p.x, q.y - p.y);
    }
    const label = `${Math.round(camera.z * 100)} %`; if ($('zoom-level').textContent !== label) $('zoom-level').textContent = label;
  }
  new ResizeObserver(entries => {
    const rect = entries[0].contentRect, oldWidth = width, oldHeight = height;
    width = rect.width; height = rect.height; const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
    if (firstResize) {firstResize = false; if (!restoredCamera) fit();}
    else {camera.x += (width - oldWidth) / 2; camera.y += (height - oldHeight) / 2;}
    repaint();
  }).observe(canvas.parentElement);
  function activateTool(type, definition = null) {
    cancel(); placingModule = definition; placing = type;
    document.querySelectorAll('[data-type]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.type===type)));
    canvas.style.cursor='crosshair'; updateInterface();
    status(`${definition?.name || C.TYPES[type]} · Pulsa el tablero o Enter para colocarlo`); canvas.focus();
  }
  function pressButton(id) {
    if (heldButton !== null) return;
    const n=network.byId.get(id); if(n?.type!=='BOTON') return;
    heldButton=id; n.state=true; values=C.evaluate(doc,network); updateInterface(); repaint();
  }
  function releaseButton() {
    if(heldButton===null) return;
    const n=network.byId.get(heldButton); heldButton=null;
    if(n) {n.state=false; values=C.evaluate(doc,network); updateInterface(); repaint();}
  }
  const toggleButton=$('toggle-switch');
  toggleButton.addEventListener('pointerdown',event=>{
    const n=network.byId.get([...selected][0]); if(n?.type!=='BOTON') return;
    event.preventDefault(); toggleButton.setPointerCapture(event.pointerId); pressButton(n.id);
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture']) toggleButton.addEventListener(name,releaseButton);
  toggleButton.addEventListener('keydown',event=>{if([' ','Enter'].includes(event.key)&&network.byId.get([...selected][0])?.type==='BOTON') {event.preventDefault(); if(!event.repeat)pressButton([...selected][0]);}});
  toggleButton.addEventListener('keyup',releaseButton); toggleButton.addEventListener('blur',releaseButton);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseButton();});

  const library=window.DaLogicLibrary.map(C.moduleDefinition), libraryKey='dalogic-light-plus-library-v1';
  const builtinCount=library.length;
  try {
    const raw=localStorage.getItem(libraryKey);
    if(raw && raw.length<=256*1024) {const items=JSON.parse(raw); if(Array.isArray(items)&&items.length<=30) for(const item of items)library.push(C.moduleDefinition(item));}
  } catch(_) {notice('No se pudieron recuperar los CI personales. Puedes importar sus archivos .dmodule.');}
  function storeLibrary() {
    try {localStorage.setItem(libraryKey,JSON.stringify(library.slice(builtinCount)));}
    catch(_) {notice('CI añadido a esta sesión. Descarga el .dmodule para conservarlo.');}
  }
  function renderLibrary() {
    $('library-list').replaceChildren();
    library.forEach((definition,i)=>{
      const b=document.createElement('button'); b.className='component-button module-button';
      b.dataset.module=String(i); b.dataset.search=definition.name.toLowerCase(); b.draggable=true;
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
      const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M6 5h12v14H6ZM2 8h4m-4 8h4m12-8h4m-4 8h4M9 2v3m6-3v3M9 19v3m6-3v3');svg.append(path);
      const label=document.createElement('span');label.textContent=definition.name;
      b.title=`${definition.inputs} entrada${definition.inputs===1?'':'s'} · ${definition.outputs} salida${definition.outputs===1?'':'s'}`;b.append(svg,label);
      b.addEventListener('click',()=>activateTool('MODULO',definition));
      b.addEventListener('dragstart',e=>{e.dataTransfer.setData('application/x-dalogic-module',String(i));e.dataTransfer.effectAllowed='copy';});
      $('library-list').append(b);
    });
    $('library-count').textContent=String(library.length); filterComponents();
  }
  function filterComponents() {
    const q=$('component-search').value.trim().toLocaleLowerCase('es'); let visible=0,modules=0;
    document.querySelectorAll('.component-button').forEach(b=>{
      const match=(b.dataset.search || C.TYPES[b.dataset.type] || b.textContent).toLocaleLowerCase('es').includes(q);
      b.hidden=!match; if(match) {visible++;if(b.dataset.module!==undefined)modules++;}
    });
    $('search-empty').hidden=Boolean(visible);$('library-empty').hidden=Boolean(modules);
    if(q)document.querySelectorAll('.palette-section').forEach(d=>{d.open=true;});
  }
  function appendLibrary(definition) {
    if(library.length-builtinCount>=30) throw new Error('La biblioteca admite 30 CI personales por navegador. Conserva los demás como .dmodule.');
    library.push(C.moduleDefinition(definition));storeLibrary();renderLibrary();$('library-section').open=true;
  }
  $('component-search').addEventListener('input',filterComponents);
  $('library-open').addEventListener('click',()=>{$('library-section').open=true;$('library-section').scrollIntoView({block:'nearest'});$('component-search').focus();});
  $('module-import').addEventListener('click',()=>{$('module-file-input').value='';$('module-file-input').click();});
  $('module-file-input').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    if(file.size>128*1024){notice('El CI supera 128 KB. Usa un CI combinacional más pequeño.');return;}
    try {const data=JSON.parse(await file.text());if(data.format!=='DaLogic module')throw new Error('Selecciona un archivo .dmodule de DaLogic.');appendLibrary(data);notice('CI importado. Está disponible en la biblioteca.');}
    catch(error){notice(error instanceof SyntaxError?'El archivo no contiene JSON válido.':error.message);}
  });
  canvas.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('application/x-dalogic-module')){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
  canvas.addEventListener('drop',e=>{
    const index=e.dataTransfer.getData('application/x-dalogic-module');
    if(index!==''&&library[Number(index)]){e.preventDefault();placingModule=library[Number(index)];add('MODULO',world(local(e)));}
  });
  $('module-create').addEventListener('click',()=>{
    try{C.createModule(doc);$('module-name').value=doc.name;$('module-error').textContent='';$('module-dialog').showModal();}
    catch(error){notice(error.message);}
  });
  function currentModule(){return C.createModule(doc,$('module-name').value.trim()||doc.name);}
  $('module-download').addEventListener('click',()=>{try{const d=currentModule();download(JSON.stringify(d,null,2),safeFilename(d.name)+'.dmodule','application/json');}catch(e){$('module-error').textContent=e.message;}});
  $('module-add-library').addEventListener('click',()=>{try{appendLibrary(currentModule());$('module-dialog').close();notice('CI añadido a la biblioteca de este navegador.');}catch(e){$('module-error').textContent=e.message;}});
  $('diagnose').addEventListener('click',()=>{
    const findings=C.diagnostics(doc), list=$('diagnostics-list');list.replaceChildren();
    $('diagnostics-summary').textContent=findings.length?`${findings.length} avisos. Pulsa uno para localizar el componente. Una salida sin utilizar puede ser intencional.`:doc.nodes.length?'Todas las entradas están conectadas y las señales son conocidas.':'El circuito está vacío. Añade componentes para revisarlo.';
    for(const finding of findings.slice(0,200)) {
      const b=document.createElement('button');b.textContent=finding.message;
      b.addEventListener('click',()=>{const n=network.byId.get(finding.id);select(finding.id);camera.x=width/2-(n.x+C.size(n).w/2)*camera.z;camera.y=height/2-(n.y+C.size(n).h/2)*camera.z;$('diagnostics-dialog').close();repaint();persist();canvas.focus();});list.append(b);
    }
    if(findings.length>200){const p=document.createElement('p');p.textContent='Se muestran los primeros 200 avisos. Revisa el circuito de nuevo tras corregirlos.';list.append(p);}
    $('diagnostics-dialog').showModal();
  });
  function arrange(mode) {
    const nodes=doc.nodes.filter(n=>selected.has(n.id)), minimum=['left','top'].includes(mode)?2:3;
    if(nodes.length<minimum){notice(`Selecciona al menos ${minimum} componentes para esta acción.`);return;}
    change(()=>{
      if(mode==='left'||mode==='top'){const axis=mode==='left'?'x':'y',value=Math.min(...nodes.map(n=>n[axis]));nodes.forEach(n=>{n[axis]=value;});}
      else{
        const axis=mode==='horizontal'?'x':'y',dimension=axis==='x'?'w':'h';nodes.sort((a,b)=>a[axis]-b[axis]);
        const first=nodes[0][axis],last=nodes.at(-1),extent=last[axis]+C.size(last)[dimension]-first;
        const gap=(extent-nodes.reduce((sum,n)=>sum+C.size(n)[dimension],0))/(nodes.length-1);
        if(gap<0)throw new Error('Separa los extremos para distribuir sin superponer los componentes.');
        let at=first;nodes.forEach(n=>{n[axis]=at;at+=C.size(n)[dimension]+gap;});
      }
    },false);
  }
  document.querySelectorAll('[data-arrange]').forEach(b=>b.addEventListener('click',()=>arrange(b.dataset.arrange)));
  $('copy-selection').addEventListener('click',copy);$('paste-selection').addEventListener('click',paste);
  $('duplicate-selection').addEventListener('click',()=>{copy();paste();});
  $('grid-visible').addEventListener('change',e=>{gridVisible=e.target.checked;repaint();});
  $('grid-snap').addEventListener('change',e=>{snapEnabled=e.target.checked;});
  document.querySelector('.tools-popover').addEventListener('click',e=>{if(e.target.closest('button'))e.currentTarget.closest('details').open=false;});
  document.addEventListener('click',e=>{if(!e.target.closest('.tools-menu'))document.querySelector('.tools-menu').open=false;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelector('.tools-menu').open=false;});

  function safeFilename(name=doc.name){return name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').trim()||'circuito';}
  function makeSVG() {
    if(!doc.nodes.length)throw new Error('Añade componentes antes de exportar una imagen.');
    const xml=v=>String(v).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
    let left=Math.min(...doc.nodes.map(n=>n.x))-40,top=Math.min(...doc.nodes.map(n=>n.y))-45;
    let right=Math.max(...doc.nodes.map(n=>n.x+C.size(n).w))+40,bottom=Math.max(...doc.nodes.map(n=>n.y+C.size(n).h))+40;
    const lines=doc.wires.map(w=>{const r=route(w);left=Math.min(left,r.left-20);right=Math.max(right,r.right+20);top=Math.min(top,r.top-20);bottom=Math.max(bottom,r.bottom+20);return {w,r};});
    const w=right-left,h=bottom-top,svgScale=Math.min(1,4096/w,4096/h,Math.sqrt(8e6/(w*h)));
    const parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1,Math.round(w*svgScale))}" height="${Math.max(1,Math.round(h*svgScale))}" viewBox="${left} ${top} ${w} ${h}"><title>${xml(doc.name)}</title><rect x="${left}" y="${top}" width="${w}" height="${h}" fill="${xml(colours.bg)}"/><g font-family="Segoe UI,system-ui,sans-serif" font-size="12" stroke-linejoin="round" stroke-linecap="round">`];
    const text=(x,y,label,anchor='middle',size=12)=>`<text x="${x}" y="${y}" fill="${xml(colours.text)}" text-anchor="${anchor}" font-size="${size}">${xml(label)}</text>`;
    for(const {w:wire,r} of lines)parts.push(`<polyline points="${r.points.map(p=>p.x+','+p.y).join(' ')}" fill="none" stroke="${xml(C.valueAt(values,wire.from,wire.output??0)===1?colours.active:colours.wire)}" stroke-width="1.8"/>`);
    for(const n of doc.nodes){
      const {w,h}=C.size(n),value=values.get(n.id);parts.push(`<g transform="translate(${n.x} ${n.y})">`);
      if(n.type==='BOMBILLA')parts.push(`<circle cx="60" cy="32" r="23" stroke="${xml(colours.gate)}" fill="${xml(value===1?colours.bulb:colours['gate-fill'])}"/>`,text(60,37,displayValue(value)));
      else{parts.push(`<rect x="16" y="5" width="${w-32}" height="${h-10}" rx="6" fill="${xml(colours['gate-fill'])}" stroke="${xml(colours.gate)}"/>`);
        if(n.type==='MODULO'){for(const side of ['in','out'])for(let i=0;i<(side==='in'?n.inputs:C.outputCount(n));i++){const p=C.port(n,side,i);parts.push(text(side==='in'?24:w-24,p.y-n.y+4,n.module[side==='in'?'input_labels':'output_labels'][i],side==='in'?'start':'end',10));}}
        else parts.push(text(w/2,h/2+4,C.sources.includes(n.type)?C.TYPES[n.type]+' '+Number(n.state):n.type==='BUS_VISOR'?displayValue(value):n.type));
      }
      parts.push(text(w/2,-10,n.label||n.module?.name||''));
      for(const side of ['in','out'])for(let i=0;i<(side==='in'?n.inputs:C.outputCount(n));i++){const p=C.port(n,side,i),x=p.x-n.x,y=p.y-n.y;parts.push(`<path d="M${x} ${y}H${side==='in'?(n.type==='BOMBILLA'?37:16):w-16}" stroke="${xml(colours.gate)}"/><circle cx="${x}" cy="${y}" r="4" fill="${xml(colours.surface)}" stroke="${xml(colours.gate)}"/>`);}
      parts.push('</g>');
    }
    parts.push('</g></svg>');return {svg:parts.join(''),w,h};
  }
  $('export-svg').addEventListener('click',()=>{try{download(makeSVG().svg,safeFilename()+'.svg','image/svg+xml');status('Imagen SVG descargada');}catch(e){notice(e.message);}});
  $('export-png').addEventListener('click',async()=>{
    const button=$('export-png');button.disabled=true;
    try{
      const {svg,w,h}=makeSVG(),scale=Math.min(2,4096/w,4096/h,Math.sqrt(8e6/(w*h)));
      const target=document.createElement('canvas');target.width=Math.max(1,Math.round(w*scale));target.height=Math.max(1,Math.round(h*scale));
      const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
      try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('No se pudo crear la imagen PNG. Prueba con SVG.'));image.src=url;});target.getContext('2d').drawImage(image,0,0,target.width,target.height);}finally{URL.revokeObjectURL(url);}
      const blob=await new Promise(resolve=>target.toBlob(resolve,'image/png'));if(!blob)throw new Error('No se pudo exportar PNG. Usa SVG.');download(blob,safeFilename()+'.png','image/png');status('Imagen PNG descargada');
    }catch(e){notice(e.message);}finally{button.disabled=false;}
  });
  renderLibrary();

  indexNodes(); setTheme(theme); updateInterface(); status(initialStatus);
})();
