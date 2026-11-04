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
after(async () => server.close());
const rules = await server.ssrLoadModule('/src/modules/compliance/data/rules.ts');
const clauseSections = await server.ssrLoadModule('/src/modules/compliance/data/clauseSections.ts');

/** §8.2「主题」列（2026-10-27 校准基准） */
const TOPICS_82 = {
  '6.1.1': '最小必要原则', '6.1.2': '告知义务', '6.1.3': '告知更新', '6.1.4': '应用分发',
  '6.1.5': '未成年人', '6.1.6': '权限记录', '6.2.1.1': '一般同意', '6.2.1.2': '第三方同意',
  '6.2.2': '例外情形', '6.2.3': '同意选项', '6.2.4.1': '期限届满', '6.2.4.2': '变更重获',
  '6.2.5.1': '撤回途径', '6.2.5.2': '撤回效力', '6.3.1': '默认不收集', '6.3.2': '敏感提示',
  '6.3.3': '最小精度', '6.3.4': '共用传感器', '6.3.5': '非必要权限', '6.3.6': '拒绝基本功能',
  '6.3.7': '合规收集', '6.4.1': '存储期限', '6.4.2': '安全存储', '6.4.3': '生物特征存储',
  '6.5.1': '生物识别替代', '6.5.2': '口令隐藏', '6.6.1.1': '座舱数据', '6.6.1.2': '传输保密',
  '6.6.1.3': '车外匿名化', '6.6.2.1.1': '人脸对象', '6.6.2.1.2': '号牌对象',
  '6.6.2.2.1': '检出率', '6.6.2.2.2': '匿名化效果', '6.7.1': '删除途径', '6.7.2': '主动删除',
  '6.7.3': '删除效果', '6.7.4': '账号删除', '6.8': '数据出境',
};

/** §8.2「涉及问题」列：条款 → 题号集合 */
const LEAVES_82 = {
  '6.1.1': ['Q1'], '6.1.2': ['Q1', 'Q5'], '6.1.3': ['Q1'], '6.1.4': ['Q2'], '6.1.5': ['Q3'], '6.1.6': ['Q4'],
  '6.2.1.1': ['Q1', 'Q5'], '6.2.1.2': ['Q6'], '6.2.2': ['Q1'], '6.2.3': ['Q1', 'Q5'],
  '6.2.4.1': ['Q1'], '6.2.4.2': ['Q1'], '6.2.5.1': ['Q1'], '6.2.5.2': ['Q1'],
  '6.3.1': ['Q1'], '6.3.2': ['Q4'], '6.3.3': ['Q4'], '6.3.4': ['Q4'], '6.3.5': ['Q1'], '6.3.6': ['Q1'], '6.3.7': ['Q1'],
  '6.4.1': ['Q1'], '6.4.2': ['Q4', 'Q5'], '6.4.3': ['Q7'],
  '6.5.1': ['Q7'], '6.5.2': ['Q8'],
  '6.6.1.1': ['Q4', 'Q9'], '6.6.1.2': ['Q4', 'Q5', 'Q9'], '6.6.1.3': ['Q10'],
  '6.6.2.1.1': ['Q10'], '6.6.2.1.2': ['Q10'], '6.6.2.2.1': ['Q10'], '6.6.2.2.2': ['Q10'],
  '6.7.1': ['Q1'], '6.7.2': ['Q1'], '6.7.3': ['Q1'], '6.7.4': ['Q11'], '6.8': ['Q12'],
};

test('baseline 38 clauses match §8.2 topics, triggers and involved questions', () => {
  const baseline = rules.ruleSet;
  assert.equal(baseline.clauses.length, 38);
  const questions = new Set(baseline.questions.map((question) => question.no));
  for (const clause of baseline.clauses) {
    assert.equal(clause.topic, TOPICS_82[clause.code], `topic of ${clause.code}`);
    const leaves = rules.triggerLeaves(clause.trigger, questions);
    assert.deepEqual([...leaves].sort(), [...LEAVES_82[clause.code]].sort(), `involved questions of ${clause.code}`);
  }
});

test('trigger explanations derive from expressions per §8.2 readability examples', () => {
  const baseline = rules.ruleSet;
  const questions = new Set(baseline.questions.map((question) => question.no));
  const clause = (code) => baseline.clauses.find((entry) => entry.code === code);
  assert.equal(rules.triggerExplanation(clause('6.1.2').trigger, questions, 'zh'), 'Q1=是 或 Q5=是');
  assert.equal(rules.triggerExplanation(clause('6.1.2').trigger, questions, 'en'), 'Q1=yes OR Q5=yes');
  assert.equal(rules.triggerExplanation(clause('6.6.1.2').trigger, questions, 'zh'), 'Q9=是 且（Q5=是 或 Q4=是）');
  assert.equal(rules.triggerExplanation(clause('6.6.1.2').trigger, questions, 'en'), 'Q9=yes AND (Q5=yes OR Q4=yes)');
});

test('explanation generator tolerates invalid expressions without throwing', () => {
  const questions = new Set(['Q1']);
  assert.equal(rules.triggerExplanation('AND(Q1="是"', questions, 'zh'), '');
  assert.deepEqual(rules.triggerLeaves('Q99="是"', questions), []);
});

test('rule set is a single non-versioned standard with legacy bindings merged', () => {
  assert.equal(rules.RULE_SET_ID, 'v1');
  assert.equal(rules.ruleSet.id, rules.RULE_SET_ID);
  assert.equal(rules.ruleSet.clauses.length, 38);
  assert.equal(rules.ruleSet.questions.length, 12);
  assert.equal(typeof rules.persistRuleVersions, 'undefined');
  assert.equal(typeof rules.selectableRuleVersions, 'undefined');
  for (const legacy of rules.LEGACY_RULE_IDS) {
    assert.equal(rules.knownRuleBinding(legacy), true, `legacy binding ${legacy}`);
  }
  assert.equal(rules.knownRuleBinding(rules.RULE_SET_ID), true);
  assert.equal(rules.knownRuleBinding('v9.9.9'), false);
});

test('clause → section mapping follows 需求筛选 A77:C114 for all 38 clauses', () => {
  const counts = {};
  for (const clause of rules.ruleSet.clauses) {
    const ref = clauseSections.clauseSection(clause.code);
    assert.ok(ref, `missing section for ${clause.code}`);
    assert.ok(clauseSections.CLAUSE_SECTION_ORDER.includes(ref.section), `unknown section ${ref.section} of ${clause.code}`);
    assert.match(ref.field, /^[A-Z]+[0-9]+$/, `field code of ${clause.code}`);
    counts[ref.section] = (counts[ref.section] ?? 0) + 1;
  }
  assert.deepEqual(counts, { basicInfo: 8, consent: 15, transmission: 4, sensors: 3, biometric: 3, anonymization: 5 });
  assert.equal(clauseSections.clauseSection('6.9.9'), null);
  assert.deepEqual(clauseSections.clausesOfSection('sensors'), ['6.3.2', '6.3.3', '6.3.4']);
});
