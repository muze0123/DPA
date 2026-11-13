import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const asUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const relations = asUrl(compile('../src/modules/surveys/data/surveyRelations.ts'));
const source = compile('../src/modules/workbench/data/workbench.ts').replace('../../surveys/data/surveyRelations', relations);
const { visibleWorkbenchTasks, isWorkbenchTodo, deadlineKind, matchesWorkbenchFilter, compareWorkbenchTasks } = await import(asUrl(source));
const manager = { accountId: 'admin', name: '管理员', role: 'compliance' };
const owner = { accountId: 'owner', name: '本人', role: 'owner' };
const make = changes => ({ id: 'task-1', taskName: '评估任务', owner: '他人', respondent: '填表人', reviewer: '审核人', sourceOperator: '发起人', status: 'pending-fill', deadline: '2026-11-13', priority: 'medium', updatedAt: '2026-11-12 10:00:00', ...changes });
test('manager sees all; ordinary identities cannot receive unrelated records or totals', () => {
  const records = [make({ id: 'a', owner: '本人' }), make({ id: 'b' }), make({ id: 'c', reviewer: '本人' })];
  assert.equal(visibleWorkbenchTasks(records, manager).length, 3);
  assert.deepEqual(visibleWorkbenchTasks(records, owner).map(r => r.id), ['a', 'c']);
  assert.equal(visibleWorkbenchTasks(records, { ...owner, name: '' }).length, 0);
  assert.equal(visibleWorkbenchTasks(records, { ...owner, role: 'readonly' }).length, 2);
});
test('to-dos reflect current responsibility and exclude terminal records', () => {
  assert.equal(isWorkbenchTodo(make({ owner: '本人' }), owner), false);
  assert.equal(isWorkbenchTodo(make({ respondent: '本人' }), owner), true);
  assert.equal(isWorkbenchTodo(make({ status: 'matching-reviewing', reviewer: '本人' }), owner), true);
  assert.equal(isWorkbenchTodo(make({ status: 'section-filling', owner: '本人' }), owner), false);
  for (const status of ['archived', 'withdrawn', 'voided']) assert.equal(isWorkbenchTodo(make({ status }), manager), false);
  assert.equal(isWorkbenchTodo(make({ respondent: '本人' }), { ...owner, role: 'readonly' }), false);
});
test('deadline boundaries include today and day seven, excluding terminal tasks', () => {
  assert.equal(deadlineKind(make({ deadline: '2026-11-12' }), '2026-11-13'), 'overdue');
  for (const deadline of ['2026-11-13', '2026-11-20']) assert.equal(deadlineKind(make({ deadline }), '2026-11-13'), 'dueSoon');
  assert.equal(deadlineKind(make({ deadline: '2026-11-21' }), '2026-11-13'), 'normal');
  assert.equal(deadlineKind(make({ deadline: undefined }), '2026-11-13'), 'normal');
  for (const status of ['archived', 'withdrawn', 'voided']) assert.equal(deadlineKind(make({ status, deadline: '2026-11-01' }), '2026-11-13'), 'normal');
});
test('returned is a flag on active tasks; sort deadlines before priority', () => {
  assert.equal(matchesWorkbenchFilter(make({ returnInfo: {} }), 'returned', manager, '2026-11-13'), true);
  assert.equal(matchesWorkbenchFilter(make({ status: 'archived', returnInfo: {} }), 'returned', manager, '2026-11-13'), false);
  const rows = [make({ id: 'none', deadline: undefined, priority: 'urgent' }), make({ id: 'later', deadline: '2026-11-14' }), make({ id: 'urgent', priority: 'urgent' }), make({ id: 'normal' })].sort(compareWorkbenchTasks);
  assert.deepEqual(rows.map(r => r.id), ['urgent', 'normal', 'later', 'none']);
});

test('monthly creation counts fill missing months, cross years, and exclude future dates', async () => {
  const { monthlyTaskCreation } = await import(asUrl(source));
  const records = [make({ createdAt: '2025-11-30 12:00:00' }), make({ createdAt: '2025-12-01 12:00:00' }), make({ createdAt: '2026-03-10 12:00:00' }), make({ createdAt: '2026-03-15 12:00:00' }), make({ createdAt: '2026-11-13 12:00:00' }), make({ createdAt: '2026-11-14 12:00:00' }), make({ createdAt: '' })];
  const rows = monthlyTaskCreation(records, '2026-11-13');
  assert.equal(rows.length, 12);
  assert.equal(rows[0].month, '2025-12');
  assert.equal(rows.at(-1).month, '2026-11');
  assert.equal(rows.find(row => row.month === '2026-03').count, 2);
  assert.equal(rows.find(row => row.month === '2026-02').count, 0);
  assert.equal(rows.reduce((sum, row) => sum + row.count, 0), 4);
  assert.equal(monthlyTaskCreation([], '2026-11-13').every(row => row.count === 0), true);
});
