import './check.mjs';
import {mkdir, copyFile} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {root, webEntries, filesUnder, resetSite} from './project.mjs';

export const site = await resetSite();
export const webFiles = await filesUnder(webEntries);
for (const file of webFiles) {
  const destination = join(site, file);
  await mkdir(dirname(destination), {recursive: true});
  await copyFile(join(root, file), destination);
}
console.log('Sitio listo en dist/site/ (' + webFiles.length + ' archivos).');
