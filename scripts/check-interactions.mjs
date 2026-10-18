import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Run the complete editor with its real circuit engine and registered event handlers.
// Rendering is omitted: these checks exercise gestures, simulation and undo/redo.
export async function checkInteractions(root) {
  const require = createRequire(import.meta.url);
  const C = require(join(root, 'core.js'));
  const source = await readFile(join(root, 'app.js'), 'utf8');
  function editor(z = 1) {
    let doc, values;
    const engine = {...C,
      compile(next) {doc = next; return C.compile(next);},
      evaluate(next, net) {doc = next; values = C.evaluate(next, net); return values;}
    };
    class Element {
      constructor() {this.listeners = new Map(); this.style = {}; this.dataset = {}; this.value = ''; this.children = [];}
      addEventListener(type, fn) {if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn);}
      emit(type, options = {}) {
        const event = {target: this, preventDefault() {}, key: '', ctrlKey: false, metaKey: false, shiftKey: false, ...options};
        for (const fn of this.listeners.get(type) || []) fn(event);
      }
      append(...items) {this.children.push(...items);}
      prepend(...items) {this.children.unshift(...items);}
      replaceChildren(...items) {this.children = items;}
      setAttribute() {}
      querySelector() {return null;}
      getBoundingClientRect() {return {left: 0, top: 0};}
      getContext() {return {};}
      focus() {}
      setPointerCapture() {}
      matches() {return false;}
    }
    const elements = new Map(), get = id => {if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id);};
    const document = new Element();
    document.getElementById = get;
    document.documentElement = new Element();
    document.querySelectorAll = () => [];
    document.querySelector = selector => selector === 'dialog[open]' ? null : get(selector);
    document.createElement = document.createElementNS = () => new Element();
    const canvas = get('board'); canvas.parentElement = new Element();
    const window = new Element(); window.DaLogicCore = engine; window.DaLogicLibrary = [];
    const fixture = {name: 'Pulsador', nodes: [C.node(0, 'BOTON', 100, 100, 'P'), C.node(1, 'BOMBILLA', 400, 100), C.node(2, 'INTERRUPTOR', 100, 300)], wires: [{id: 0, from: 0, to: 1, input: 0, points: []}]};
    const saved = JSON.stringify({project: C.serialise(fixture), camera: {x: 0, y: 0, z}, theme: 'light'});
    runInNewContext(source, {
      window, document,
      localStorage: {getItem: key => key === 'dalogic-light-plus-v1' ? saved : null},
      requestAnimationFrame() {}, setTimeout() {return 1;}, clearTimeout() {},
      getComputedStyle: () => ({getPropertyValue: () => '#000000'}),
      ResizeObserver: class {observe() {}}
    });
    return {
      get doc() {return doc;}, get values() {return values;}, get,
      node: id => doc.nodes.find(n => n.id === id),
      pointer(type, x = 160, y = 132, options = {}) {canvas.emit(type, {button: 0, pointerId: 1, pointerType: 'mouse', clientX: x * z, clientY: y * z, ...options});},
      key(type, key, options = {}) {document.emit(type, {target: canvas, key, ...options});},
      window, document
    };
  }
  const atRest = e => {
    assert.equal(e.node(0).state, false, 'Pulsador atascado en 1.');
    assert.equal(e.values.get(1), 0, 'La bombilla debe apagarse al liberar.');
  };

  // A hold and small pointer jitter activate the output without moving or adding history.
  {
    const e = editor(); e.pointer('pointerdown');
    assert.equal(e.node(0).state, true); assert.equal(e.values.get(1), 1);
    e.pointer('pointermove', 162, 133);
    assert.equal(e.node(0).x, 100); assert.equal(e.node(0).state, true);
    e.pointer('pointerup', 162, 133); atRest(e); assert.equal(e.get('undo').disabled, true);
  }
  // Dragging works at different zooms, releases the signal, follows the wire and has one undo step.
  for (const z of [.2, 1, 3]) {
    const e = editor(z); e.pointer('pointerdown'); e.pointer('pointermove', 240, 192);
    assert.equal(e.node(0).x, 180, 'El arrastre debe mover el pulsador.');
    assert.equal(e.node(0).y, 160); atRest(e);
    assert.equal(C.port(e.node(0), 'out').x, 300); assert.equal(e.doc.wires.length, 1);
    e.pointer('pointerup', 240, 192); atRest(e);
    e.get('undo').emit('click'); assert.equal(e.node(0).x, 100); atRest(e); assert.equal(e.get('undo').disabled, true);
    e.get('redo').emit('click'); assert.equal(e.node(0).x, 180); atRest(e);
  }
  // Starting a drag on a pulsador preserves the whole selection and does not pulse it.
  {
    const e = editor(); e.key('keydown', 'a', {ctrlKey: true}); e.pointer('pointerdown');
    atRest(e); e.pointer('pointermove', 240, 192); e.pointer('pointerup', 240, 192);
    assert.equal(e.node(0).x, 180); assert.equal(e.node(1).x, 480); assert.equal(e.node(2).y, 360); atRest(e);
  }
  for (const end of ['pointercancel', 'lostpointercapture']) {
    const e = editor(); e.pointer('pointerdown'); e.pointer('pointermove', 240, 192); e.pointer(end, 240, 192);
    assert.equal(e.node(0).x, 100); atRest(e); assert.equal(e.get('undo').disabled, true);
    e.pointer('pointerdown'); assert.equal(e.node(0).state, true); e.pointer('pointerup'); atRest(e);
  }
  // A second touch cancels the drag/hold and hands control to pinch zoom.
  for (const move of [false, true]) {
    const e = editor(); e.pointer('pointerdown', 160, 132, {pointerType: 'touch'});
    if (move) e.pointer('pointermove', 240, 192, {pointerType: 'touch'});
    e.pointer('pointerdown', 500, 400, {pointerId: 2, pointerType: 'touch'});
    assert.equal(e.node(0).x, 100); atRest(e);
    e.pointer('pointerup', 500, 400, {pointerId: 2}); e.pointer('pointerup');
    e.pointer('pointerdown'); assert.equal(e.node(0).state, true); e.pointer('pointerup'); atRest(e);
  }
  // Blur commits an in-flight move without persisting a held output in history.
  {
    const e = editor(); e.pointer('pointerdown'); e.pointer('pointermove', 240, 192); e.window.emit('blur');
    assert.equal(e.node(0).x, 180); atRest(e); e.get('undo').emit('click'); assert.equal(e.node(0).x, 100); atRest(e);
  }
  // Keyboard and inspector holds remain available, and ordinary switches still toggle/drag.
  {
    const e = editor(); e.pointer('pointerdown'); e.pointer('pointerup');
    e.key('keydown', ' '); assert.equal(e.values.get(1), 1); e.key('keyup', ' '); atRest(e);
    e.get('toggle-switch').emit('pointerdown', {pointerId: 3}); assert.equal(e.values.get(1), 1);
    e.get('toggle-switch').emit('pointerup'); atRest(e);
    e.pointer('pointerdown', 160, 332); e.pointer('pointerup', 160, 332); assert.equal(e.node(2).state, true);
    e.pointer('pointerdown', 160, 332); e.pointer('pointermove', 240, 392); e.pointer('pointerup', 240, 392);
    assert.equal(e.node(2).x, 180); assert.equal(e.node(2).state, true);
  }
  console.log('OK: pulsadores: mantener, arrastrar, zoom, selección, historial, cancelación, multitáctil, teclado e inspector.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkInteractions(process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../', import.meta.url)));
}
