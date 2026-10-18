import {readFile, readdir, lstat, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, relative, isAbsolute, join} from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
export const version = manifest.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('package.json debe contener una versión X.Y.Z.');

// These allowlists keep local files and credentials out of published packages.
export const webEntries = [
  'index.html', 'styles.css', 'core.js', 'library.js', 'app.js', 'favicon.ico',
  'LICENSE', 'NOTICE', '.nojekyll', 'README.md', 'CHANGELOG.md',
  'CONTRIBUTING.md', 'examples', 'docs'
];
export const sourceEntries = [
  ...webEntries, 'package.json', '.gitignore', '.gitattributes', '.editorconfig',
  'scripts', '.github'
];

export async function filesUnder(entries, base = root) {
  const found = [];
  async function visit(entry) {
    const path = resolve(base, entry);
    const rel = relative(base, path);
    if (rel === '..' || rel.startsWith('..' + '/') || rel.startsWith('..' + '\\') || isAbsolute(rel)) {
      throw new Error('Ruta fuera de la carpeta del paquete: ' + entry);
    }
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error('No se distribuyen enlaces simbólicos: ' + entry);
    if (stat.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await visit(join(entry, name));
    } else if (stat.isFile()) found.push(entry.replaceAll('\\', '/'));
    else throw new Error('Archivo no distribuible: ' + entry);
  }
  for (const entry of entries) await visit(entry);
  return [...new Set(found)].sort();
}

export async function resetSite() {
  const dist = resolve(root, 'dist');
  const site = resolve(dist, 'site');
  // Only this fixed, generated directory may be removed; never accept a CLI path.
  if (relative(dist, site) !== 'site' || relative(root, dist) !== 'dist') {
    throw new Error('Destino de compilación no válido.');
  }
  await rm(site, {recursive: true, force: true});
  return site;
}
