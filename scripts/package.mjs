import {site, webFiles} from './build.mjs';
import {readFile, writeFile, readdir, unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {deflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {root, version, sourceEntries, filesUnder} from './project.mjs';

// Standard ZIP32, UTF-8 paths, DEFLATE, fixed timestamp for reproducible packages.
const crcTable = Array.from({length: 256}, (_, n) => {
  let crc = n;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const value of data) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
async function makeZip(base, files) {
  const records = [], central = [];
  let offset = 0, directorySize = 0;
  if (files.length > 65535) throw new Error('Demasiados archivos para ZIP32.');
  for (const file of files) {
    const name = Buffer.from(file, 'utf8');
    const data = await readFile(join(base, file));
    const compressed = deflateRawSync(data, {level: 9});
    if (Math.max(data.length, compressed.length, offset) > 0xffffffff) throw new Error('Paquete demasiado grande para ZIP32.');
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0x5c21, 12); // 2026-01-01
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    records.push(local, name, compressed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0x5c21, 14);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    directorySize += entry.length + name.length;
    offset += local.length + name.length + compressed.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...records, ...central, end]);
}

const dist = join(root, 'dist');
// Remove only previously generated ZIP names from this fixed output directory.
for (const name of await readdir(dist)) {
  if (/^DaLogic-Light-\d+\.\d+\.\d+-(?:web|source)\.zip$/.test(name)) await unlink(join(dist, name));
}
const sums = [];
for (const [edition, base, files] of [
  ['web', site, webFiles],
  ['source', root, await filesUnder(sourceEntries)]
]) {
  const name = `DaLogic-Light-${version}-${edition}.zip`;
  const data = await makeZip(base, files);
  await writeFile(join(dist, name), data);
  sums.push(createHash('sha256').update(data).digest('hex') + '  ' + name);
  console.log(name + ' (' + data.length.toLocaleString('en-US') + ' bytes, ' + files.length + ' archivos)');
}
await writeFile(join(dist, 'SHA256SUMS.txt'), sums.join('\n') + '\n', 'utf8');
console.log('Huellas listas en dist/SHA256SUMS.txt.');
