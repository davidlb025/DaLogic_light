import {checkInteractions} from './check-interactions.mjs';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {execFileSync} from 'node:child_process';
import {join, dirname, resolve, relative, isAbsolute} from 'node:path';
import {root, version, sourceEntries, filesUnder} from './project.mjs';

await checkInteractions(root);

const files = await filesUnder(sourceEntries);
for (const file of files.filter(file => /\.(?:m?js)$/.test(file))) {
  execFileSync(process.execPath, ['--check', join(root, file)], {stdio: 'pipe'});
}
console.log('OK: sintaxis JavaScript y archivos de distribución.');

for (const file of files.filter(file => /\.(?:md|html|css)$/.test(file))) {
  const content = await readFile(join(root, file), 'utf8');
  const references = file.endsWith('.md')
    ? [...content.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)].map(m => m[1])
    : file.endsWith('.html')
      ? [...content.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1])
      : [...content.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)].map(m => m[1]);
  for (const reference of references) {
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(reference)) continue;
    const local = decodeURIComponent(reference.split(/[?#]/)[0]);
    if (!local) continue;
    const target = resolve(root, dirname(file), local);
    const rel = relative(root, target);
    assert(!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\'), 'Enlace fuera del proyecto: ' + reference);
    await access(target).catch(() => {throw new Error(file + ': enlace local roto: ' + reference);});
  }
}
console.log('OK: enlaces locales de documentación, HTML y CSS.');

const require = createRequire(import.meta.url);
const C = require('../core.js');
const context = {window: {}};
runInNewContext(await readFile(join(root, 'library.js'), 'utf8'), context);
const library = JSON.parse(JSON.stringify(context.window.DaLogicLibrary));
assert.equal(library.length, 8, 'Actualizar documentación si cambia la biblioteca incluida.');
for (const definition of library) C.moduleDefinition(definition);
console.log('OK: los 8 CI incluidos son compatibles con Light.');

const expected = {
  'puerta-and.dalogic': bits => [bits[0] & bits[1]],
  'semisumador.dalogic': bits => [bits[0] ^ bits[1], bits[0] & bits[1]],
  'multiplexor.dalogic': bits => [bits[2] ? bits[1] : bits[0]]
};
for (const [name, output] of Object.entries(expected)) {
  const data = JSON.parse(await readFile(join(root, 'examples', name), 'utf8'));
  const doc = C.normalise(data);
  const table = C.truthTable(doc);
  for (const row of table.rows) {
    const bits = row.slice(0, table.inputs.length);
    assert.deepEqual(row.slice(bits.length), output(bits), name + ': resultado lógico incorrecto.');
  }
  assert.deepEqual(C.truthTable(C.normalise(C.serialise(doc))), table, name + ': fallo de intercambio.');
}
const moduleData = JSON.parse(await readFile(join(root, 'examples', 'semisumador.dmodule'), 'utf8'));
assert.deepEqual(C.moduleDefinition(moduleData).table, [[0, 0], [1, 0], [1, 0], [0, 1]]);
console.log('OK: tablas de los ejemplos, módulo y guardado/reapertura.');

const changelog = await readFile(join(root, 'CHANGELOG.md'), 'utf8');
const notes = await readFile(join(root, 'docs', 'RELEASE_NOTES.md'), 'utf8');
assert(changelog.includes('## ' + version), 'Falta la versión actual en CHANGELOG.md.');
assert(notes.startsWith('# DaLogic Light ' + version + '\n'), 'Las notas de Release no coinciden con package.json.');
for (const edition of ['web', 'source']) {
  assert(notes.includes(`DaLogic-Light-${version}-${edition}.zip`), 'Actualizar los nombres de ZIP en las notas de Release.');
}
console.log('OK: versión ' + version + ' y notas de publicación.');
console.log('Comprobación completada.');
