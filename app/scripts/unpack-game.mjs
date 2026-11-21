// Puts the game into app/www for Capacitor. A game sold in the stores arrives as ../game.bin, packed and encrypted
// by the private repository; it is unlocked here with the GAME_KEY secret, which only this repository's workflows can
// read. A game also published on the web arrives as plain files in ../www.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { scryptSync, createDecipheriv } from 'node:crypto';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(app, 'www');
rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
const bin = join(app, '..', 'game.bin');
if (existsSync(bin)) {
  const key = process.env.GAME_KEY;
  if (!key) { console.error('::error::The GAME_KEY secret is missing, so the game cannot be unpacked'); process.exit(1); }
  const b = readFileSync(bin);
  if (b.subarray(0, 5).toString() !== 'GAME1') { console.error('::error::game.bin is not a packed game'); process.exit(1); }
  const salt = b.subarray(5, 21), iv = b.subarray(21, 33), tag = b.subarray(33, 49);
  const d = createDecipheriv('aes-256-gcm', scryptSync(key, salt, 32), iv);
  d.setAuthTag(tag);
  let raw;
  try { raw = gunzipSync(Buffer.concat([d.update(b.subarray(49)), d.final()])); }
  catch (e) { console.error('::error::GAME_KEY does not match the key the game was packed with'); process.exit(1); }
  let i = 0, n = 0;
  while (i < raw.length) {
    const nl = raw.readUInt32BE(i), dl = raw.readUInt32BE(i + 4);
    const name = raw.subarray(i + 8, i + 8 + nl).toString('utf8'), data = raw.subarray(i + 8 + nl, i + 8 + nl + dl);
    if (name.includes('..') || name.startsWith('/')) { console.error('::error::Bad file name in game.bin'); process.exit(1); }
    const f = join(www, name); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, data);
    i += 8 + nl + dl; n++;
  }
  console.log(`Unpacked ${n} game files`);
} else if (existsSync(join(app, '..', 'www'))) {
  cpSync(join(app, '..', 'www'), www, { recursive: true });
  console.log('Copied the web game');
} else { console.error('::error::No game here: neither game.bin nor www/'); process.exit(1); }
// the store apps don't use the web's offline cache
rmSync(join(www, 'sw.js'), { force: true });
