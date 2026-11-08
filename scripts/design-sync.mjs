import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, 'src/design/sync.json'), 'utf8'));
let drift = 0;
for (const peer of manifest.peers) {
  const target = resolve(root, peer);
  if (!existsSync(target)) { console.error(`Unavailable peer ${target}`); drift++; continue; }
  for (const file of manifest.files) {
    const source = readFileSync(resolve(root, file), 'utf8');
    const destination = resolve(target, file);
    if (!existsSync(destination) || readFileSync(destination, 'utf8') !== source) {
      if (process.argv.includes('--write')) { writeFileSync(destination, source); console.log(`Synchronized ${peer}/${file}`); }
      else { console.error(`Drift ${peer}/${file}`); drift++; }
    }
  }
}
if (drift) process.exitCode = 1;
else console.log('Shared design system files are synchronized');
