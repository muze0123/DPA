/**
 * 步骤 7「完成度与收集」数据层自测：提醒状态机、收集统计、四档归档、以功能为单位去重。
 * 运行：node --test tests/collection.test.mjs
 */
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => { values.set(key, value); },
  removeItem: (key) => { values.delete(key); },
};

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
after(async () => { await server.close(); });

const collection = await server.ssrLoadModule('/src/modules/surveys/data/collection.ts');
const surveys = await server.ssrLoadModule('/src/modules/surveys/data/surveys.ts');

test('提醒状态：已提供优先于一切，逾期按日期先于已提醒', () => {
  const { reminderStateOf } = collection;
  const today = '2026-10-27';
  assert.equal(reminderStateOf({ provided: true, dueDate: '2020-01-01', reminded: true }, today), 'provided');
  assert.equal(reminderStateOf({ provided: false, dueDate: '2026-10-26' }, today), 'overdue');
  assert.equal(reminderStateOf({ provided: false, dueDate: '2026-10-26', reminded: true }, today), 'overdue');
  assert.equal(reminderStateOf({ provided: false, dueDate: '2026-10-27' }, today), 'wait');
  assert.equal(reminderStateOf({ provided: false, dueDate: '2026-10-28' }, today), 'wait');
  assert.equal(reminderStateOf({ provided: false }, today), 'none');
  assert.equal(reminderStateOf({ provided: false, reminded: true }, today), 'reminded');
  assert.equal(reminderStateOf({ provided: false, dueDate: '2026-10-28', reminded: true }, today), 'reminded');
});

test('收集统计：分母为参与条目，待提醒含 none 与 wait', () => {
  const { summarizeCollection } = collection;
  const rows = [
    { itemId: '6.1.1-2', no: '6.1.1', summary: 'a', missing: [], provided: true, state: 'provided' },
    { itemId: '6.1.1-3', no: '6.1.1', summary: 'b', missing: ['testInput'], provided: false, state: 'overdue' },
    { itemId: '6.1.1-4', no: '6.1.1', summary: 'c', missing: ['testInput'], provided: false, state: 'none' },
    { itemId: '6.1.1-5', no: '6.1.1', summary: 'd', missing: ['how', 'testInput'], provided: false, state: 'reminded' },
    { itemId: '6.1.1-7', no: '6.1.1', summary: 'e', missing: ['testInput'], provided: false, state: 'wait' },
  ];
  const summary = summarizeCollection(rows);
  assert.equal(summary.applicable, 5);
  assert.equal(summary.inputTotal, 5);
  assert.equal(summary.inputFilled, 1);
  assert.equal(summary.inputMissing, 4);
  assert.equal(summary.rate, 20);
  assert.equal(summary.pending, 2);
  assert.equal(summary.reminded, 1);
  assert.equal(summary.overdue, 1);
  assert.equal(summary.provided, 1);
  assert.equal(summary.evidenceMissing, 4);

  const empty = summarizeCollection([]);
  assert.equal(empty.rate, null, '无参与条目时收集率为 null（页面显示「—」）');
});

test('缺口行：只保留缺字段的条目，按逾期 → 待提醒 → 已提醒 排序', () => {
  const { gapRows } = collection;
  const rows = [
    { itemId: '6.1.2-9', no: '6.1.2', summary: 'x', missing: ['testInput'], provided: false, state: 'reminded' },
    { itemId: '6.1.1-2', no: '6.1.1', summary: 'y', missing: [], provided: true, state: 'provided' },
    { itemId: '6.1.1-4', no: '6.1.1', summary: 'z', missing: ['testInput'], provided: false, state: 'overdue' },
    { itemId: '6.1.1-3', no: '6.1.1', summary: 'w', missing: ['testInput'], provided: false, state: 'none' },
  ];
  assert.deepEqual(gapRows(rows).map((row) => row.itemId), ['6.1.1-4', '6.1.1-3', '6.1.2-9']);
});

test('四档归档：状态 + 收集率联合判定', () => {
  const { completionStageOf, canViewCompletionBoard } = collection;
  assert.equal(completionStageOf('archived', 100), 4);
  assert.equal(completionStageOf('archived', 99), 3);
  assert.equal(completionStageOf('archived', null), 3, '归档且无参与条目时按未收齐处理');
  assert.equal(completionStageOf('section-reviewing', 0), 2);
  assert.equal(completionStageOf('section-filling', 0), 1);
  assert.equal(completionStageOf('draft', null), 1);
  assert.equal(canViewCompletionBoard('compliance'), true, '合规专员可见全功能看板');
  assert.equal(canViewCompletionBoard('readonly'), true);
  assert.equal(canViewCompletionBoard('owner'), false, '功能负责人不可见（FR-02 / FR-03）');
});

test('全功能汇总：同一 FuLi ID 取阶段最靠后的一份，并定位当前功能', () => {
  const { completionBoardOf } = collection;
  const records = [
    { id: 'A1', fuliId: 'F1', functionName: '旧问卷', owner: '张三', status: 'section-filling', updatedAt: '2026-10-01' },
    { id: 'A2', fuliId: 'F1', functionName: '新问卷', owner: '张三', status: 'archived', updatedAt: '2026-10-02' },
    { id: 'B1', fuliId: 'F2', functionName: '另一功能', owner: '李四', status: 'section-reviewing', updatedAt: '2026-10-03' },
    { id: 'C1', fuliId: 'F3', functionName: '草稿功能', owner: '王五', status: 'draft', updatedAt: '2026-10-04' },
  ];
  const board = completionBoardOf(records, (record) => (record.id === 'A2' ? 100 : null), 'A1');
  assert.equal(board.total, 3, '同一 FuLi ID 只计一次');
  assert.deepEqual(board.counts, { 1: 1, 2: 1, 3: 0, 4: 1 });
  assert.equal(board.current?.surveyId, 'A2', '当前功能按 FuLi ID 命中最新一份问卷');
  assert.equal(board.current?.stage, 4);
});

test('真实种子：归档问卷的收集率 < 100，缺口行按严重度单调排序', () => {
  const { collectionRows, summarizeCollection, gapRows } = collection;
  const record = surveys.surveyRecords.find((item) => item.id === 'S-2026-0307');
  assert.ok(record, '演示问卷 S-2026-0307 存在');
  const rows = collectionRows(record, '2026-10-27');
  const summary = summarizeCollection(rows);
  assert.ok(summary.inputTotal > 0, '归档问卷应有参与条目');
  assert.ok(summary.rate !== null && summary.rate < 100, '演示数据应含未收集项');
  const gaps = gapRows(rows);
  assert.ok(gaps.length > 0);
  const weight = { overdue: 0, none: 1, wait: 2, reminded: 3, provided: 4 };
  const order = gaps.map((row) => weight[row.state]);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), '缺口行按逾期→待提醒→已提醒排序');
  assert.ok(gaps.every((row) => row.missing.length > 0), '缺口行一定带缺失字段');
});

test('提醒留痕：写入后状态转为已提醒，审计由页面层负责', () => {
  const { markReminded, ensureReminders, reminderStateOf } = collection;
  const record = surveys.surveyRecords.find((item) => item.id === 'S-2026-0307');
  const count = markReminded(record, ['6.1.1-2', '6.1.1-3'], 'tester');
  assert.equal(count, 2);
  const store = ensureReminders(record.id);
  assert.equal(store['6.1.1-2'].by, 'tester');
  assert.match(store['6.1.1-2'].at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.equal(reminderStateOf({ provided: false, dueDate: '2099-01-01', reminded: true }, '2026-10-27'), 'reminded');
  assert.equal(markReminded(record, [], 'tester'), 0, '空集合不写留痕');
});
