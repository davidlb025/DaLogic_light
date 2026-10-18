/* DaLogic Light — circuit model and combinational simulator, without DOM. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DaLogicCore = api;
})(globalThis, function () {
  'use strict';
  const TYPES = Object.freeze({
    AND: 'AND', OR: 'OR', XOR: 'XOR', NOT: 'NOT', NAND: 'NAND', NOR: 'NOR',
    INTERRUPTOR: 'Interruptor', BOMBILLA: 'Bombilla', BOTON: 'Pulsador',
    CONSTANTE: 'Constante', BUS_VISOR: 'Visor de señal', MODULO: 'Circuito integrado'
  });
  const MAX_NODES = 2000, MAX_WIRES = 8000;
  const clone = value => JSON.parse(JSON.stringify(value));
  const sources = ['INTERRUPTOR', 'BOTON', 'CONSTANTE'];
  const variableGates = ['AND', 'OR', 'XOR', 'NAND', 'NOR'];
  function inputCount(type) { return sources.includes(type) ? 0 : ['NOT', 'BOMBILLA', 'BUS_VISOR'].includes(type) ? 1 : 2; }
  function outputCount(n) { return n.type === 'BOMBILLA' ? 0 : n.type === 'MODULO' ? n.module.outputs : 1; }
  function valueAt(values, id, output = 0) { return output === 0 ? values.get(id) ?? null : values.pins?.get(id)?.[output] ?? null; }
  function size(node) { return {w: node.type === 'MODULO' ? 180 : 120, h: Math.max(64, Math.max(node.inputs, outputCount(node)) * (node.type === 'MODULO' ? 24 : 18) + 14)}; }
  function port(node, side, index = 0) {
    const {w, h} = size(node);
    return {x: node.x + (side === 'out' ? w : 0), y: node.y + h * (index + 1) / ((side === 'out' ? outputCount(node) : node.inputs) + 1)};
  }
  function node(id, type, x, y, label = '', definition = null) {
    if (!Object.hasOwn(TYPES, type)) throw new Error('Componente no compatible con DaLogic Light.');
    const n = {id, type, x, y, label, inputs: inputCount(type), state: false};
    if (type === 'MODULO') {n.module = moduleDefinition(definition); n.inputs = n.module.inputs;}
    return n;
  }
  function empty(name = 'Sin título') { return {name, nodes: [], wires: []}; }
  function example() {
    const doc = {name: 'Puerta AND', nodes: [node(0, 'INTERRUPTOR', 40, 40, 'A'),
      node(1, 'INTERRUPTOR', 40, 220, 'B'), node(2, 'AND', 340, 130),
      node(3, 'BOMBILLA', 640, 130, 'Salida')], wires: []};
    doc.wires = [
      {id: 0, from: 0, to: 2, input: 0, points: []},
      {id: 1, from: 1, to: 2, input: 1, points: []},
      {id: 2, from: 2, to: 3, input: 0, points: []}
    ];
    return doc;
  }
  function gate(type, inputs) {
    if (type === 'NOT') return inputs[0] === null ? null : 1 - inputs[0];
    let result;
    if (type === 'AND' || type === 'NAND') result = inputs.includes(0) ? 0 : inputs.includes(null) ? null : 1;
    else if (type === 'OR' || type === 'NOR') result = inputs.includes(1) ? 1 : inputs.includes(null) ? null : 0;
    else if (type === 'XOR') return inputs.includes(null) ? null : inputs.reduce((a, b) => a ^ b, 0);
    else return inputs[0] ?? null;
    return ['NAND', 'NOR'].includes(type) && result !== null ? 1 - result : result;
  }
  function compile(doc) {
    const byId = new Map(doc.nodes.map(n => [n.id, n]));
    const incoming = new Map(), incomingPorts = new Map(), outgoing = new Map(), degree = new Map(), modules = new Map();
    if (doc.nodes.reduce((sum,n) => sum + (n.module ? n.module.table.length * n.module.outputs : 0), 0) > 65536) throw new Error('El circuito supera las 65.536 celdas de CI. Reduce el número de módulos.');
    for (const n of doc.nodes) if (n.type === 'MODULO') modules.set(n.id, n.module.table);
    for (const n of doc.nodes) { incoming.set(n.id, Array(n.inputs).fill(null)); incomingPorts.set(n.id, Array(n.inputs).fill(0)); outgoing.set(n.id, []); degree.set(n.id, 0); }
    for (const wire of doc.wires) {
      const from = byId.get(wire.from), to = byId.get(wire.to);
      if (!from || !to || (!Number.isInteger(wire.output ?? 0) || (wire.output ?? 0) < 0 || (wire.output ?? 0) >= outputCount(from)) || !Number.isInteger(wire.input) || wire.input < 0 || wire.input >= to.inputs) throw new Error('Un cable referencia un puerto inexistente.');
      const inputs = incoming.get(to.id);
      if (inputs[wire.input] !== null) throw new Error('Una entrada solo puede tener un cable.');
      inputs[wire.input] = from.id; incomingPorts.get(to.id)[wire.input] = wire.output ?? 0;
      outgoing.get(from.id).push(to.id); degree.set(to.id, degree.get(to.id) + 1);
    }
    const order = doc.nodes.filter(n => degree.get(n.id) === 0).map(n => n.id);
    for (let i = 0; i < order.length; i++) for (const id of outgoing.get(order[i])) {
      degree.set(id, degree.get(id) - 1); if (!degree.get(id)) order.push(id);
    }
    if (order.length !== doc.nodes.length) throw new Error('Este circuito tiene realimentación. Light admite circuitos combinacionales; usa DaLogic completo para circuitos con memoria.');
    return {byId, incoming, incomingPorts, outgoing, degree, modules, order};
  }
  function evaluate(doc, network = compile(doc), overrides = null) {
    const values = new Map(); values.pins = new Map();
    for (const id of network.order) {
      const n = network.byId.get(id);
      const inputs = network.incoming.get(id).map((source,i) => source === null ? null : valueAt(values, source, network.incomingPorts.get(id)[i]));
      let outputs;
      if (n.type === 'MODULO') {
        const key = inputs.reduce((a,b) => a * 2 + (b ?? 0), 0);
        outputs = inputs.includes(null) ? Array(n.module.outputs).fill(null) : network.modules.get(id)[key];
      } else outputs = [sources.includes(n.type) ? (overrides?.has(id) && n.type !== 'CONSTANTE' ? Number(Boolean(overrides.get(id))) : Number(n.state)) : gate(n.type, inputs)];
      values.set(id, outputs[0]); values.pins.set(id, outputs);
    }
    return values;
  }
  function connection(doc, from, to, input, points = [], output = 0) {
    if (doc.wires.length >= MAX_WIRES) throw new Error('Light admite hasta 8.000 cables por circuito.');
    const candidate = {...doc, wires: [...doc.wires, {id: Math.max(-1, ...doc.wires.map(w => w.id)) + 1, from, to, input, points, ...(output ? {output} : {})}]};
    compile(candidate); return candidate;
  }
  function truthTable(doc) {
    const inputs = doc.nodes.filter(n => ['INTERRUPTOR', 'BOTON'].includes(n.type)), outputs = doc.nodes.filter(n => ['BOMBILLA', 'BUS_VISOR'].includes(n.type));
    if (inputs.length > 8) throw new Error('La tabla light admite hasta 8 interruptores o pulsadores (256 combinaciones).');
    if (!outputs.length) throw new Error('Añade al menos una bombilla para obtener una tabla de verdad.');
    if (2 ** inputs.length * (inputs.length + outputs.length) > 8192) throw new Error('La tabla supera el límite light de 8.192 celdas. Reduce las entradas o las salidas.');
    const network = compile(doc), rows = [];
    for (let i = 0; i < 2 ** inputs.length; i++) {
      const bits = inputs.map((_, j) => (i >> (inputs.length - j - 1)) & 1);
      const values = evaluate(doc, network, new Map(inputs.map((n, j) => [n.id, bits[j]])));
      rows.push([...bits, ...outputs.map(n => values.get(n.id))]);
    }
    return {inputs: inputs.map(n => n.label || `Entrada ${n.id + 1}`), outputs: outputs.map(n => n.label || `Salida ${n.id + 1}`), rows};
  }
  function point(value) {
    if (!Array.isArray(value) || value.length !== 2 || value.some(v => typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e6)) throw new Error('El archivo contiene una posición no válida.');
    return {x: value[0], y: value[1]};
  }
  function normalise(data) {
    if (!data || data.format !== 'DaLogic' || ![1, '1'].includes(data.version) || !Array.isArray(data.components) || !Array.isArray(data.wires)) throw new Error('Selecciona un proyecto .dalogic válido.');
    if (data.components.length > MAX_NODES || data.wires.length > MAX_WIRES) throw new Error('El circuito supera el límite light de 2.000 componentes u 8.000 cables.');
    for (const key of ['junctions', 'endpoints', 'visuals', 'sections']) {
      if (data[key] !== undefined && (!Array.isArray(data[key]) || data[key].length)) throw new Error('El archivo utiliza nexos o anotaciones de la versión completa. Ábrelo en DaLogic completo.');
    }
    const doc = empty(typeof data.name === 'string' ? data.name.slice(0, 100) : 'Sin título');
    const ids = new Set();
    for (const item of data.components) {
      if (!item || !Number.isSafeInteger(item.id) || item.id < 0 || item.id > 1e9 || ids.has(item.id)) throw new Error('El archivo tiene identificadores no válidos o duplicados.');
      if (!Object.hasOwn(TYPES, item.type)) throw new Error(`El componente ${String(item.type).slice(0, 32)} requiere DaLogic completo. Light incluye puertas, interruptores y bombillas.`);
      if ((item.rotation || 0) % 360 || item.mirrored || Number(item.bus_width || 1) > 1 || Number(item.delay_ms || 0) !== 0 || Number(item.delay_gates || 0) !== 0) throw new Error('El archivo utiliza rotación, buses o retardos de la versión completa.');
      ids.add(item.id); const pos = point(item.position || [0, 0]);
      const definition = item.type === 'MODULO' ? moduleDefinition(item) : null;
      const n = node(item.id, item.type, pos.x, pos.y, typeof item.label === 'string' ? item.label.slice(0, 80) : '', definition);
      if (variableGates.includes(n.type)) {
        n.inputs = item.inputs ?? 2;
        if (!Number.isInteger(n.inputs) || n.inputs < 2 || n.inputs > 8) throw new Error('Las puertas admiten entre 2 y 8 entradas.');
      }
      if (item.state !== undefined && typeof item.state !== 'boolean' && ![0, 1].includes(item.state)) throw new Error('Estado de interruptor no válido.');
      if (item.type === 'CONSTANTE' && item.native_value !== undefined && ![0,1,false,true].includes(item.native_value)) throw new Error('Light admite constantes de un bit.');
      if (item.outputs !== undefined && item.outputs !== outputCount(n)) throw new Error('Número de salidas no compatible.');
      if (item.inputs !== undefined && item.inputs !== n.inputs) throw new Error('Número de entradas no compatible.');
      if ([...(item.input_widths || []), ...(item.output_widths || [])].some(v => v !== 1)) throw new Error('Este archivo contiene buses; usa DaLogic completo.');
      n.state = item.type === 'BOTON' ? false : Boolean(item.type === 'CONSTANTE' ? item.native_value ?? item.state : item.state); doc.nodes.push(n);
    }
    doc.wires = data.wires.map((wire, id) => {
      if (!wire || !wire.src || !wire.dst) throw new Error('Cable no válido.');
      let source = wire.src, destination = wire.dst, reverse = false;
      if (source.side === 'in' && destination.side === 'out') { [source, destination] = [destination, source]; reverse = true; }
      if (source.kind !== 'port' || destination.kind !== 'port' || source.side !== 'out' || !Number.isInteger(source.index) || source.index < 0 || destination.side !== 'in' || !Number.isSafeInteger(source.widget) || !Number.isSafeInteger(destination.widget)) throw new Error('Light conecta salidas directamente con entradas; este cable requiere la versión completa.');
      const points = wire.midpoints ?? [];
      if (!Array.isArray(points) || points.length > 128) throw new Error('Ruta de cable no válida.');
      const route = points.map(p => point(p)); if (reverse) route.reverse();
      return {id, from: source.widget, to: destination.widget, input: destination.index, points: route, ...(source.index ? {output: source.index} : {})};
    });
    compile(doc); return doc;
  }
  function serialise(doc) {
    if (doc.nodes.some(n => n.type === 'BOTON' && n.state)) doc = {...doc, nodes: doc.nodes.map(n => n.type === 'BOTON' ? {...n, state: false} : n)};
    const network = compile(doc), values = evaluate(doc, network), signal = value => value === null ? 'X' : Boolean(value);
    return {format: 'DaLogic', version: 1, edition: 'Light', name: doc.name,
      components: doc.nodes.map(n => ({id: n.id, type: n.type, position: [n.x, n.y], label: n.label,
        inputs: n.inputs, outputs: outputCount(n), rotation: 0, mirrored: false,
        state: n.type === 'BOTON' ? false : n.state, delay_ms: 0, delay_gates: 0,
        ...(n.type === 'CONSTANTE' ? {bus_width: 1, native_value: Number(n.state)} : {}),
        ...(n.type === 'BUS_VISOR' ? {bus_width: 1} : {}),
        ...(n.type === 'MODULO' ? (({format, version, ...rest}) => rest)(moduleFile(n.module)) : {}),
        logic_inputs: network.incoming.get(n.id).map((id,i) => signal(id === null ? null : valueAt(values, id, network.incomingPorts.get(n.id)[i]))),
        logic_outputs: Array.from({length: outputCount(n)}, (_,i) => signal(valueAt(values, n.id, i)))})),
      wires: doc.wires.map(w => ({src: {kind: 'port', widget: w.from, side: 'out', index: w.output ?? 0},
        dst: {kind: 'port', widget: w.to, side: 'in', index: w.input}, midpoints: w.points.map(p => [p.x, p.y])})),
      junctions: [], endpoints: [], visuals: [], sections: []};
  }
  function moduleDefinition(data) {
    if (!data || data.stateful_circuit || !Number.isInteger(data.inputs) || data.inputs < 0 || data.inputs > 8 || !Number.isInteger(data.outputs) || data.outputs < 1 || data.outputs > 8) throw new Error('El CI debe ser combinacional: hasta 8 entradas y 8 salidas de un bit.');
    if (data.format && data.format !== 'DaLogic module' || data.version !== undefined && ![1, 1.2].includes(data.version) || Number(data.delay_ms || 0) || Number(data.delay_gates || 0)) throw new Error('El CI contiene memoria o retardos no compatibles.');
    if ([...(data.input_widths || []), ...(data.output_widths || [])].some(v => v !== 1)) throw new Error('Este CI utiliza buses. Usa un CI de un bit por puerto.');
    const labels = (list,count,prefix) => Array.from({length:count},(_,i) => typeof list?.[i] === 'string' ? list[i].slice(0,24) : prefix+(i+1));
    let table;
    if (data.table) table = data.table;
    else {
      if (!Array.isArray(data.truth_table) || data.truth_table.length !== 2 ** data.inputs) throw new Error('La tabla del CI debe contener todas las combinaciones.');
      table = Array(2 ** data.inputs);
      for (const row of data.truth_table) {
        if (!Array.isArray(row.inputs) || row.inputs.length !== data.inputs || row.inputs.some(v => ![0,1,false,true].includes(v)) || row.time_ms !== undefined && row.time_ms !== 0) throw new Error('Entrada o retardo no válido en la tabla del CI.');
        const key = row.inputs.reduce((a,b) => a*2+Number(b),0);
        if (table[key]) throw new Error('La tabla del CI repite combinaciones.');
        table[key] = row.outputs;
      }
    }
    if (!Array.isArray(table) || table.length !== 2 ** data.inputs || Array.from(table).some(row => !Array.isArray(row) || row.length !== data.outputs || row.some(v => ![0,1,false,true,'X',null].includes(v)))) throw new Error('Salida no válida en la tabla del CI.');
    return {name: String(data.name || 'CI').slice(0,60), inputs: data.inputs, outputs: data.outputs,
      input_labels: labels(data.input_labels,data.inputs,'I'), output_labels: labels(data.output_labels,data.outputs,'O'),
      table: table.map(row => row.map(v => v === 'X' || v === null ? null : Number(v)))};
  }
  function moduleFile(definition) {
    const d = moduleDefinition(definition);
    return {format: 'DaLogic module', version: 1, name: d.name, inputs: d.inputs, outputs: d.outputs,
      input_labels: d.input_labels, output_labels: d.output_labels,
      input_numbers: Array.from({length:d.inputs},(_,i)=>i), output_numbers: Array.from({length:d.outputs},(_,i)=>i),
      truth_table: d.table.map((row,k) => ({inputs: Array.from({length:d.inputs},(_,i)=>Boolean((k >> (d.inputs-i-1)) & 1)), outputs: row.map(v=>v===null?'X':Boolean(v)), time_ms:0}))};
  }
  function diagnostics(doc) {
    const net = compile(doc), values = evaluate(doc,net), findings = [];
    for (const n of doc.nodes) {
      const label = n.label || n.module?.name || TYPES[n.type]+' '+(n.id+1);
      net.incoming.get(n.id).forEach((source,i) => {if(source===null) findings.push({id:n.id,kind:'free',message:label+': entrada '+(n.module?.input_labels[i] || i+1)+' sin conectar.'});});
      if (values.pins.get(n.id).includes(null)) findings.push({id:n.id,kind:'unknown',message:label+': señal X (indeterminada).'});
      if (outputCount(n) && !net.outgoing.get(n.id).length) findings.push({id:n.id,kind:'unused',message:label+': salida sin utilizar.'});
    }
    return findings;
  }
  function createModule(doc, name) {
    const table = truthTable(doc), ins = doc.nodes.filter(n=>['INTERRUPTOR','BOTON'].includes(n.type)), outs = doc.nodes.filter(n=>['BOMBILLA','BUS_VISOR'].includes(n.type));
    if (!ins.length || outs.length > 8) throw new Error('Crea el CI con 1–8 entradas y 1–8 bombillas o visores.');
    if (table.rows.some(row=>row.includes(null))) throw new Error('Conecta todas las entradas antes de crear el CI: hay señales X.');
    return moduleFile({name:name || doc.name, inputs:ins.length, outputs:outs.length, input_labels:table.inputs, output_labels:table.outputs, table:table.rows.map(row=>row.slice(ins.length))});
  }
  return Object.freeze({TYPES, MAX_NODES, MAX_WIRES, sources, variableGates, outputCount, valueAt, moduleDefinition, moduleFile, diagnostics, createModule, clone, node, empty, example, size, port, gate, compile, evaluate, connection, truthTable, normalise, serialise});
});
