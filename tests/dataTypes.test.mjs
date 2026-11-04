/**
 * 数据类型分析（标准层解读视图）的数据不变式。
 *
 * 两张表口径不同、不可互推，因此这里只锁定「必须一致」的部分：
 * 1) 条款视角 38 行与条款目录逐条对齐（行序、条款号）；
 * 2) 类型视角的每个条款号都在标准库中存在（可打开详情）；
 * 3) 明细里的主归类必须被该类型的「涉及条款」覆盖（否则页面自相矛盾）；
 * 4) 判定题引用的题号都在题库中，且缺口类型是显式登记的。
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

const dataTypes = await server.ssrLoadModule('/src/modules/compliance/data/dataTypes.ts');
const matching = await server.ssrLoadModule('/src/modules/surveys/data/matching.ts');
const questions = await server.ssrLoadModule('/src/modules/surveys/data/questions.ts');
const standard = await server.ssrLoadModule('/src/modules/compliance/data/standard.ts');

test('条款视角 38 行与条款目录逐条对齐', () => {
  assert.equal(dataTypes.DATA_TYPE_CLAUSES.length, matching.CLAUSES.length);
  assert.deepEqual(
    dataTypes.DATA_TYPE_CLAUSES.map((row) => row.no),
    matching.CLAUSES.map((clause) => clause.no),
  );
  for (const row of dataTypes.DATA_TYPE_CLAUSES) {
    assert.ok(row.focus.length > 0, `${row.no} 缺少关注点`);
    assert.ok(row.subject.length > 0, `${row.no} 缺少涉及对象`);
  }
});

test('类型视角的涉及条款均可在标准库中查得', () => {
  for (const def of dataTypes.DATA_TYPES) {
    assert.ok(def.clauses.length > 0, `${def.code} 没有涉及条款`);
    for (const no of def.clauses) {
      assert.ok(standard.standardNode(no), `${def.code} 引用了不存在的条款 ${no}`);
      assert.ok(matching.CLAUSES.some((clause) => clause.no === no), `${def.code} 引用了第 6 章以外的条款 ${no}`);
    }
  }
});

test('明细主归类必须被该类型的涉及条款覆盖（两表不自相矛盾）', () => {
  for (const row of dataTypes.DATA_TYPE_CLAUSES) {
    for (const kind of row.kinds) {
      const def = dataTypes.DATA_TYPE_BY_CODE.get(kind);
      assert.ok(def, `${row.no} 的归类 ${kind} 不在类型目录中`);
      assert.ok(
        def.clauses.includes(row.no),
        `${row.no} 主归类为 ${kind}，但该类型的涉及条款未收录此条`,
      );
    }
  }
});

test('判定题双轨：业务表题号展示、实现题 ref 必须在平台题库中', () => {
  for (const def of dataTypes.DATA_TYPES) {
    for (const question of def.questions) {
      assert.ok(['direct', 'partial'].includes(question.coverage));
      assert.ok(question.label.length > 0, `${def.code} 缺少业务表问题描述`);
      if (question.ref) {
        // 2026-11-01 用户裁决删除 qid 层后，实现题引用即题库题号（Q1…），按 code 校验
        assert.ok(questions.isKnownCode(question.ref), `${def.code} 的实现题 ${question.ref} 不在平台题库中`);
      }
    }
  }
  // 业务表口径：仅「汽车数据」无直接对应问题（原 biometric/cabin/permission 缺口已按业务表挂回业务题号）
  const gaps = dataTypes.DATA_TYPES.filter((def) => def.formal && !def.questions.length).map((def) => def.code);
  assert.deepEqual(gaps, ['vehicle-data']);
});

test('独立类型 15 个，传感器只作明细归类', () => {
  assert.equal(dataTypes.FORMAL_DATA_TYPES.length, 15);
  assert.equal(dataTypes.DATA_TYPE_BY_CODE.get('sensor')?.formal, false);
  assert.equal(dataTypes.DATA_TYPES.length, 16);
});

test('条款判定题取自条款目录（与问卷侧同源）', () => {
  for (const row of dataTypes.DATA_TYPE_CLAUSES) {
    const clause = matching.CLAUSES.find((item) => item.no === row.no);
    assert.deepEqual(dataTypes.clauseQuestions(row.no), [...clause.hits]);
  }
});
