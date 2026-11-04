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
const catalog = await server.ssrLoadModule('/src/modules/sections/data/sectionCatalog.ts');
const versions = await server.ssrLoadModule('/src/modules/sections/data/biometricVersions.ts');
const biometric = await server.ssrLoadModule('/src/modules/sections/data/biometric.ts');
const sectionValues = await server.ssrLoadModule('/src/modules/sections/data/sectionValues.ts');
const matching = await server.ssrLoadModule('/src/modules/surveys/data/matching.ts');
const surveys = await server.ssrLoadModule('/src/modules/surveys/data/surveys.ts');

test('分区目录的生物特征六字段取自工作簿实际表单', () => {
  const fields = catalog.fieldsOf('biometric');
  assert.deepEqual(fields.map((field) => field.code), ['C', 'D', 'E', 'F', 'G', 'H']);
  assert.deepEqual(fields.map((field) => field.labelZh), [
    '生物特征类型', '是否有非生物识别替代方式', '是否涉及口令/密码/PIN',
    '口令输入/显示时是否隐藏', '生物特征是否仅存储于车内', '是否向车外传输生物特征',
  ]);
  assert.deepEqual(fields.map((field) => field.drivers), [
    ['6.4.3'], ['6.5.1'], ['6.5.2'], ['6.5.2'], ['6.4.3'], ['6.4.3'],
  ]);
  assert.equal(fields.filter((field) => field.carried).length, 6);
  assert.equal(catalog.SECTION_DEFS.find((section) => section.key === 'biometric').fieldCount, 6);
  assert.deepEqual([...catalog.BIOMETRIC_TYPE_CODES], ['face', 'fingerprint', 'voiceprint', 'iris', 'palm']);
});

test('生效版本与分区目录同源，草稿校验与保存可用', () => {
  const active = versions.activeBiometricVersion;
  assert.equal(active.status, 'current');
  assert.equal(active.fields.length, 6);
  assert.deepEqual(active.fields.map((field) => field.column), ['C', 'D', 'E', 'F', 'G', 'H']);
  assert.deepEqual(active.fields.map((field) => field.labelZh), catalog.fieldsOf('biometric').map((field) => field.labelZh));
  assert.deepEqual(active.fields.map((field) => field.labelEn), catalog.fieldsOf('biometric').map((field) => field.labelEn));
  assert.deepEqual(active.fields[0].options.map((choice) => choice.code), [...catalog.BIOMETRIC_TYPE_CODES]);

  const draft = versions.makeBiometricDraft(active, [active]);
  assert.equal(draft.version, 'v1.1');
  assert.equal(draft.status, 'draft');
  assert.deepEqual(versions.checkBiometricDraft(draft), []);

  draft.fields[0].labelZh = '';
  assert.deepEqual(versions.checkBiometricDraft(draft).map((issue) => issue.code), ['label']);
  draft.fields[0].labelZh = '生物特征类型';
  draft.version = '1.1';
  assert.deepEqual(versions.checkBiometricDraft(draft).map((issue) => issue.code), ['version']);
  draft.version = 'v1.1';

  const saved = versions.saveBiometricDraft(draft, 0);
  assert.equal(saved.revision, 1);
  assert.deepEqual(versions.readBiometricVersions().map((item) => item.version), ['v1.0', 'v1.1']);
  assert.throws(() => versions.saveBiometricDraft(draft, 0), /conflict/);
});

test('记录投影的完成度恒等式与着色口径一致', () => {
  biometric.prepareBiometricRecords();
  const records = biometric.listBiometricRecords();
  assert.ok(records.length >= 4, '应有匹配锁定及之后的问卷记录');
  for (const record of records) {
    const { progress } = record;
    assert.equal(progress.filled + progress.pending, progress.participating);
    assert.equal(progress.participating + progress.gray + progress.plain, progress.carried);
    assert.equal(progress.carried, 6);
    assert.equal(record.fields.length, 6);
    assert.equal(record.completion, progress.participating === 0
      ? 'not-applicable' : progress.pending > 0 ? 'pending' : 'complete');
    assert.ok(record.updatedAt);
    assert.ok(record.functionName && record.fuliId);
  }
  assert.deepEqual(
    records.map((record) => record.updatedAt),
    [...records.map((record) => record.updatedAt)].sort((a, b) => b.localeCompare(a)),
  );
});

test('分区值写入后记录与完成度同步变化', () => {
  biometric.prepareBiometricRecords();
  const target = biometric.listBiometricRecords().find((record) => record.progress.participating > 0);
  assert.ok(target, '应至少有一条参与条款的记录');
  const before = target.progress.filled;
  sectionValues.saveSectionValues('biometric', target.id, {
    C: 'face', D: 'yes', E: 'yes', F: 'yes', G: 'yes', H: 'no',
  });
  const after = biometric.getBiometricRecord(target.id);
  assert.ok(after.progress.filled >= before);
  assert.equal(after.completion, after.progress.pending > 0 ? 'pending' : 'complete');
  const filledField = after.fields.find((view) => view.field.code === 'C');
  if (filledField.shade !== 'gray') {
    assert.equal(filledField.value, 'face');
    assert.equal(filledField.shade, 'white');
  }
});

test('条款均不适用的问卷判为无适用条款且字段全灰', () => {
  const survey = surveys.surveyRecords.find((record) => {
    if (!biometric.BIOMETRIC_OPEN_STATUSES.includes(record.status)) return false;
    const snapshot = matching.ensureSurveyMatching(record);
    return ['6.4.3', '6.5.1', '6.5.2']
      .every((clause) => matching.finalApplicability(snapshot, clause) === 'not-applicable');
  });
  if (!survey) return;
  const record = biometric.getBiometricRecord(survey.id);
  assert.equal(record.completion, 'not-applicable');
  assert.equal(record.progress.participating, 0);
  // 2026-11-04 口径：种子任务统一冻结 v1 规则后，字段驱动按分区映射（biometric 仅 C/D/F 被驱动）；
  // 驱动字段对应条款全不适用 → 灰；未被分区映射驱动的字段（E/G/H）→ plain（不参与、非灰）
  for (const view of record.fields) {
    if (['C', 'D', 'F'].includes(view.field.code)) assert.equal(view.shade, 'gray');
    else assert.equal(view.shade, 'plain');
  }
});
