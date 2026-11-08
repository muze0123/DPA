import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from './design-tokens.mjs';
import { scanSource, classify } from './design-lib.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
const errors = [];
const findings = [];
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? walk(path) : /\.(vue|css|ts)$/.test(path) ? [path] : [];
  });
}
try { generate(root, true); } catch (error) { errors.push(error.message); }
if (read('AGENTS.md') !== read('CLAUDE.md')) errors.push('AGENTS.md and CLAUDE.md differ');
const manifest = JSON.parse(read('src/design/registry.json'));
for (const entry of [...manifest.components, ...manifest.patterns]) {
  if (!existsSync(resolve(root, entry.file))) errors.push(`Missing registry file ${entry.file}`);
}
for (const file of walk(resolve(root, 'src'))) {
  const path = relative(root, file).split('\\').join('/');
  if (/^src\/design\/tokens(?:\.core)?\.css$/.test(path)) continue;
  findings.push(...scanSource(path, readFileSync(file, 'utf8')));
}
const baseline = JSON.parse(read('src/design/legacy-baseline.json'));
const result = classify(findings, baseline.fingerprints);
const report = { status: errors.length || result.introduced.length ? 'failed' : result.historical.length ? 'passed-with-historical-debt' : 'passed', errors, ...result };
mkdirSync(resolve(root, 'design-report'), { recursive: true });
writeFileSync(resolve(root, 'design-report/check.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Design check: ${result.introduced.length} new violations, ${result.historical.length} historical occurrences, ${errors.length} infrastructure errors`);
for (const item of result.introduced) console.error(`${item.file}:${item.line} [${item.rule}] ${item.snippet}`);
for (const error of errors) console.error(error);
console.log('Details saved in design-report/check.json. Historical debt still needs route-specific review.');
if (errors.length || result.introduced.length || (process.argv.includes('--strict') && result.historical.length)) process.exitCode = 1;
