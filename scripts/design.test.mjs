import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanSource, classify, fingerprint } from './design-lib.mjs';
import { renderTokens } from './design-tokens.mjs';

test('semantic CSS passes and comments are ignored', () => {
  assert.deepEqual(scanSource('page.vue', '<template><div /></template><style>/* color:#fff */ div {color:var(--app-text-primary)}</style>'), []);
});
test('literal color and aliased imperative confirmation are detected', () => {
  const source = `<script setup lang="ts">import { Modal as Dialog } from '@arco-design/web-vue'; Dialog.confirm({title:'x'});</script><template><div style="color:#fff" /></template><style>div {color:rgba(1,2,3,.4)}</style>`;
  assert.deepEqual(scanSource('page.vue', source).map(item => item.rule).sort(), ['imperative-confirmation','literal-color','literal-inline-color']);
});
test('historical allowance cannot hide a duplicate or a moved violation', () => {
  const item = {file:'old.vue',rule:'literal-color',snippet:'color:#fff',line:1};
  const baseline = {[fingerprint(item)]:1};
  assert.equal(classify([item, item], baseline).introduced.length, 1);
  assert.equal(classify([{...item,file:'new.vue'}], baseline).introduced.length, 1);
  assert.equal(classify([{...item,line:80}], baseline).introduced.length, 0);
});
test('token output is deterministic and rejects injected declarations', () => {
  const source = {format:'metritag-css-tokens-v1',blocks:[{selector:'body',values:{'--mt-test':'32px'}}]};
  assert.equal(renderTokens(source), 'body {\n  --mt-test: 32px;\n}\n');
  source.blocks[0].values['--mt-test'] = '32px; color:red';
  assert.throws(() => renderTokens(source), /Invalid token/);
});

test('cyclic token references and empty token documents fail', () => {
  assert.throws(() => renderTokens({ format: 'metritag-css-tokens-v1', blocks: [] }));
  assert.throws(() => renderTokens({ format: 'metritag-css-tokens-v1', blocks: [{ selector: 'body', values: { '--a': 'var(--b)', '--b': 'var(--a)' } }] }), /Cyclic token/);
});
