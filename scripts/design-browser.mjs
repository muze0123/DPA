import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, 'design-report');
const profile = JSON.parse(readFileSync(resolve(root, 'src/design/project.json'), 'utf8'));
const registry = JSON.parse(readFileSync(resolve(root, 'src/design/registry.json'), 'utf8'));
const report = { project: profile.project, status: 'running', assertions: [], screenshots: [], consoleErrors: [], baselineComparisons: [] };
mkdirSync(resolve(output, 'screenshots'), { recursive: true });
let server;
let browser;
let page;
let serverOutput = '';
const check = (condition, message) => { assert.ok(condition, message); report.assertions.push(message); };
async function startServer() {
  if (process.env.DESIGN_BASE_URL) return process.env.DESIGN_BASE_URL;
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  server = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { serverOutput += chunk; });
  server.stderr.on('data', chunk => { serverOutput += chunk; });
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    try { if ((await fetch(url)).ok) return url; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Development server did not start\n${serverOutput}`);
}
async function snapshot(page, name) {
  const path = resolve(output, 'screenshots', `${name}.png`);
  const bytes = await page.locator('.mt-patterns').screenshot({ path, animations: 'disabled' });
  report.screenshots.push(path);
  const baseline = resolve(root, 'design-baselines', `${name}.png`);
  if (process.argv.includes('--update-baselines')) {
    mkdirSync(resolve(root, 'design-baselines'), { recursive: true });
    writeFileSync(baseline, bytes);
    report.baselineComparisons.push({ name, status: 'updated-needs-review' });
  } else if (existsSync(baseline)) {
    const matches = bytes.equals(readFileSync(baseline));
    report.baselineComparisons.push({ name, status: matches ? 'matched' : 'different' });
    check(matches, `Visual baseline ${name}`);
  } else {
    report.baselineComparisons.push({ name, status: 'missing' });
    check(false, `Missing visual baseline ${name}. Capture and review with --update-baselines`);
  }
}
try {
  const base = await startServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    // Seed only local mock session and display preferences in the isolated test context.
    localStorage.setItem('opendata-token', 'mock-design-verification');
    if (!localStorage.getItem('app-locale')) localStorage.setItem('app-locale', 'zh-CN');
    if (!localStorage.getItem('app-theme')) localStorage.setItem('app-theme', 'light');
  });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.consoleErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || /Not found.*key|missing.*translation/i.test(message.text())) report.consoleErrors.push(message.text()); });
  await page.goto(`${base}/__design-system`);
  await page.locator('.mt-patterns .arco-table').waitFor();
  for (const width of [1440, 900, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const english of [false, true]) {
      const lang = english ? 'en-US' : 'zh-CN';
      const current = await page.locator('html').getAttribute('lang');
      if (current !== lang) await page.locator('.mt-patterns__controls button').nth(0).click();
      check(await page.locator('html').getAttribute('lang') === lang, `${width} locale ${lang}`);
      for (const dark of [false, true]) {
        const isDark = await page.locator('body').getAttribute('arco-theme') === 'dark';
        if (isDark !== dark) await page.locator('.mt-patterns__controls button').nth(1).click();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(100);
        const geometry = await page.locator('.mt-list-toolbar__title').evaluate(element => {
          const style = getComputedStyle(element);
          return { size: style.fontSize, weight: style.fontWeight, primary: getComputedStyle(document.body).getPropertyValue('--primary-6').trim(), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
        });
        check(geometry.size === '16px' && geometry.weight === '600', `${width} ${lang} title geometry ${dark}`);
        check(!geometry.overflow, `${width} ${lang} viewport overflow ${dark}`);
        const brand = dark ? profile.brand === 'teal' ? '43, 208, 220' : '77, 141, 248' : profile.brand === 'teal' ? '13, 185, 198' : '0, 91, 245';
        check(geometry.primary === brand, `${width} ${lang} theme mapping ${dark}`);
        await snapshot(page, `${width}-${lang}-${dark ? 'dark' : 'light'}`);
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (await page.locator('html').getAttribute('lang') !== 'en-US') await page.locator('.mt-patterns__controls button').nth(0).click();
  await page.reload();
  await page.locator('.mt-patterns').waitFor();
  check(await page.locator('html').getAttribute('lang') === 'en-US', 'English saved locale on refresh');
  await page.getByRole('textbox', { name: 'Keyword', exact: true }).fill('not-present');
  check(await page.getByText('No matching records', { exact: true }).isVisible(), 'Search no-match state');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  check(await page.getByText('Metritag 1', { exact: true }).isVisible(), 'Filter reset');
  await page.locator('.mt-pagination .pagination-number').filter({ hasText: /^2$/ }).click();
  check(await page.getByText('Metritag 6', { exact: true }).isVisible(), 'Second page records');
  await page.locator('.mt-patterns__controls .arco-radio').filter({ hasText: /^Empty$/ }).click();
  check(await page.getByText('No records', { exact: true }).isVisible(), 'Explicit empty state');
  await page.locator('.mt-patterns__controls .arco-radio').filter({ hasText: /^Loading$/ }).click();
  check(await page.locator('.mt-patterns .arco-spin-loading').count() > 0, 'Loading state indicator');
  await page.locator('.mt-patterns__controls .arco-radio').filter({ hasText: /^Error$/ }).click();
  check(await page.getByText('Simulated local loading failure', { exact: true }).isVisible(), 'Error state');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  check(await page.getByText('Metritag 1', { exact: true }).isVisible(), 'Error recovery');
  await page.getByRole('button', { name: 'Edit example', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'Name', exact: true });
  const formWidth = await page.locator('.mt-pattern-editor .mt-form-layout').evaluate(element => element.getBoundingClientRect().width);
  check(Math.abs(formWidth - 500) < 1, 'Form control column is 500px');
  await name.fill('');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  check(await page.getByText('Enter a name', { exact: true }).isVisible(), 'Required validation preserves drawer');
  await name.fill('Edited local example');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('.app-confirm-dialog .arco-modal').waitFor();
  await page.locator('.app-confirm-dialog').evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
  await page.waitForFunction(() => { const element = document.querySelector('.app-confirm-dialog .arco-modal'); return element && Math.abs(element.getBoundingClientRect().width - 560) < 0.1 && element.getBoundingClientRect().height >= 319.9; });
  const modal = await page.locator('.app-confirm-dialog .arco-modal').evaluate(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
  check(Math.abs(modal.width - 560) < 1 && modal.height >= 319.9, `Confirmation 560px and minimum 320px (${modal.width} x ${modal.height})`);
  await page.locator('.app-confirm-dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  check(await name.inputValue() === 'Edited local example', 'Cancel discard retains dirty input');
  const colon = await page.locator('.mt-pattern-editor .mt-field-label').evaluate(element => getComputedStyle(element, '::after').content);
  check(profile.editableLabelColon ? colon === '":"' : colon === 'none' || colon === 'normal', 'English editable label punctuation');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.locator('.mt-pattern-editor .arco-drawer').waitFor({ state: 'hidden' });
  check(await page.getByText('Local example updated', { exact: true }).isVisible(), 'Local save feedback');
  await page.getByRole('button', { name: 'Edit example', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.locator('.mt-pattern-editor .arco-drawer').waitFor({ state: 'hidden' });
  check(await page.locator('.app-confirm-dialog:visible').count() === 0, 'Untouched drawer closes without discard prompt');
  await page.getByRole('button', { name: 'Edit example', exact: true }).click();
  await name.fill('Discarded value');
  await page.keyboard.press('Escape');
  await page.locator('.app-confirm-dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.locator('.mt-pattern-editor .arco-drawer').waitFor({ state: 'hidden' });
  check(await page.getByText('Edited local example', { exact: true }).isVisible(), 'Confirmed discard retains saved value');
  await page.locator('.mt-patterns__controls button').nth(0).click();
  await page.getByRole('button', { name: '编辑示例', exact: true }).click();
  await page.locator('.mt-pattern-editor .arco-drawer').waitFor();
  const chineseColon = await page.locator('.mt-pattern-editor .mt-field-label').evaluate(element => getComputedStyle(element, '::after').content);
  check(profile.editableLabelColon ? chineseColon === '"："' : chineseColon === 'none' || chineseColon === 'normal', 'Chinese editable label punctuation');
  await page.keyboard.press('Escape');
  // Refresh uses persisted locale through the normal app entry.
  await page.reload();
  await page.locator('.mt-patterns').waitFor();
  check(await page.locator('html').getAttribute('lang') === 'zh-CN', 'Saved locale on refresh');
  const audit = registry.patterns.find(item => item.name === 'audit-list').route;
  await page.goto(`${base}${audit}`);
  await page.locator('.audit-list .mt-list-toolbar').waitFor();
  check(await page.locator('.audit-list .arco-table').isVisible(), 'Real audit route shared toolbar and table');
  await page.locator('.audit-filter-actions .arco-btn-loading').waitFor({ state: 'hidden' });
  await page.locator('#audit-filter-keyword input').fill('design-no-match-record');
  await page.locator('.audit-filter-actions').getByRole('button', { name: '查询', exact: true }).click();
  await page.locator('.audit-list .arco-empty').waitFor();
  check(true, 'Real audit filter no-match state');
  await page.locator('.audit-filter-actions').getByRole('button', { name: '重置', exact: true }).click();
  await page.locator('.audit-list').getByRole('button', { name: '详情', exact: true }).first().waitFor();
  await page.locator('.audit-filter-actions .arco-btn-loading').waitFor({ state: 'hidden' });
  await page.locator('.audit-list').getByRole('button', { name: '导出', exact: true }).click();
  await page.locator('.app-confirm-dialog').getByRole('button', { name: '取消', exact: true }).click();
  await page.locator('.app-confirm-dialog .arco-modal').waitFor({ state: 'hidden' });
  check(true, 'Real audit export cancellation');
  await page.goBack();
  await page.locator('.mt-patterns').waitFor();
  check(true, 'Browser back to pattern route');
  await page.goForward();
  await page.locator('.audit-list .mt-list-toolbar').waitFor();
  check(true, 'Browser forward to audit route');
  if (profile.project === '功能数据安全合规自评') {
    await page.goto(`${base}/data-materials/materials`);
    const firstMaterial = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: '编辑', exact: true }) }).first();
    await firstMaterial.getByRole('button', { name: '编辑', exact: true }).click();
    const materialName = page.locator('.library-drawer input').first();
    await materialName.fill('Unsaved material verification');
    await page.locator('.library-drawer').getByRole('button', { name: '取消', exact: true }).click();
    await page.locator('.app-confirm-dialog .arco-modal-footer button').first().click();
    check(await materialName.inputValue() === 'Unsaved material verification', 'Material discard cancellation retains changes');
    await page.locator('.library-drawer').getByRole('button', { name: '取消', exact: true }).click();
    await page.locator('.app-confirm-dialog .arco-modal-footer button').last().click();
    await page.locator('.library-drawer .arco-drawer').waitFor({ state: 'hidden' });
    check(true, 'Material discard confirmation closes editor');
    const originalMaterial = await firstMaterial.innerText();
    await firstMaterial.getByRole('button', { name: '删除', exact: true }).click();
    await page.locator('.app-confirm-dialog .arco-modal-footer button').first().click();
    check(await firstMaterial.innerText() === originalMaterial, 'Material delete cancellation preserves record');
    await firstMaterial.getByRole('button', { name: '删除', exact: true }).click();
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'metritag-dictionary-materials:preview-v1') throw new Error('Simulated storage quota failure');
        return original.call(this, key, value);
      };
    });
    await page.locator('.app-confirm-dialog .arco-modal-footer button').last().click();
    check(await page.locator('.app-confirm-dialog .arco-modal').isVisible(), 'Material delete storage failure keeps confirmation open');
    check(await firstMaterial.innerText() === originalMaterial, 'Material delete storage failure preserves record');
    await page.locator('.app-confirm-dialog .arco-modal-footer button').first().click();
  }
  check(report.consoleErrors.length === 0, `Console and runtime errors (${report.consoleErrors.length})`);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  if (page) {
    await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {});
    report.accessibility = await page.locator('body').ariaSnapshot().catch(() => 'unavailable');
  }
  report.error = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
  writeFileSync(resolve(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.project}: ${report.status}, ${report.assertions.length} assertions. Report in design-report/browser.json`);
}
