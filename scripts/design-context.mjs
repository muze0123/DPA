import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const registry = JSON.parse(read('src/design/registry.json'));
const mode = process.argv[2] ?? 'list';
if (!['list', 'form', 'detail', 'confirmation', 'all'].includes(mode)) throw new Error('Use list, form, detail, confirmation, or all');
console.log(read('AI-DESIGN.md'));
console.log('\nProject profile\n' + read('src/design/project.json'));
console.log('\nRelevant implementations\n' + JSON.stringify(registry.components.filter(item => mode === 'all' || item.modes.includes(mode)), null, 2));
console.log('\nPattern\n' + JSON.stringify(registry.patterns.filter(item => mode === 'all' || item.modes.includes(mode)), null, 2));
console.log('\nRead the linked component source and the applicable DESIGN.md sections before editing.');

const needles = {
  list: ['### Filter control surface', '### Table ', '### Pagination ', '### Icon-only toolbar'],
  form: ['### Form field layout', '### Drawer ', '### Input '],
  detail: ['### Descriptions ', '### Drawer '],
  confirmation: ['### Dialog '],
};
const selected = mode === 'all' ? Object.values(needles).flat() : needles[mode];
console.log('\nApplicable DESIGN.md section locations');
read('DESIGN.md').split('\n').forEach((line, index) => {
  if (selected.some(needle => line.startsWith(needle))) console.log(`DESIGN.md:${index + 1} ${line}`);
});
