/**
 * 匿名化分区数据层断言（工作簿口径 + 问卷派生记录）。
 *
 * 断言依据：`GB44464_静态.xlsx`「匿名化」第 3 行表头（C–G 五个业务字段）与
 * `需求筛选`!A110:C114 条款→字段位映射；记录由问卷阶段派生、值读分区存储。
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
after(async () => server.close());
const catalog = await server.ssrLoadModule('/src/modules/sections/data/sectionCatalog.ts');
const progress = await server.ssrLoadModule('/src/modules/sections/data/sectionProgress.ts');
const anonymization = await server.ssrLoadModule('/src/modules/sections/data/anonymization.ts');
const versions = await server.ssrLoadModule('/src/modules/sections/data/anonymizationVersions.ts');
const gateway = await server.ssrLoadModule('/src/modules/sections/data/anonymizationGateway.ts');

test('匿名化五个字段与驱动条款按工作簿与映射表固定', () => {
  const fields = catalog.fieldsOf('anonymization');
  assert.deepEqual(fields.map((field) => field.code), ['C', 'D', 'E', 'F', 'G']);
  assert.deepEqual(fields.map((field) => field.labelZh), [
    '是否需匿名化处理', '匿名化方式', '匿名化对象标准确认', '匿名化检出率结论', '匿名化效果确认',
  ]);
  // D「匿名化方式」在映射表中无对应条款 → 补充字段（不进完成度分母）
  assert.deepEqual(fields.map((field) => field.drivers), [
    ['6.6.1.3'], [], ['6.6.2.1.1', '6.6.2.1.2'], ['6.6.2.2.1'], ['6.6.2.2.2'],
  ]);
  assert.equal(fields.every((field) => field.carried), true);
  assert.equal(fields.filter((field) => field.hintZh).length, 5);
});

test('表单版本与区间枚举对齐，且五个字段位不变', () => {
  const reference = versions.anonymizationReferenceVersion;
  assert.deepEqual(reference.fields.map((field) => field.column), ['C', 'D', 'E', 'F', 'G']);
  assert.equal(versions.anonymizationVersionOptionsMatchEnums(), true);
  assert.deepEqual(reference.fields.map((field) => field.widget), ['select', 'select', 'select', 'textarea', 'select']);
  // 有驱动条款的字段默认必填，补充字段默认可选
  assert.deepEqual(reference.fields.map((field) => field.requiredness),
    ['required', 'optional', 'required', 'required', 'required']);
});

test('分区目录与表单版本字段名一致，避免两处口径漂移', () => {
  const catalogLabels = catalog.fieldsOf('anonymization').map((field) => field.labelZh);
  assert.deepEqual(catalogLabels, versions.anonymizationReferenceVersion.fields.map((field) => field.labelZh));
});

test('填写记录由问卷阶段派生：只含进入分区填写及之后的问卷，且适用匿名化', async () => {
  const records = await gateway.anonymizationGateway.listRecords();
  assert.ok(records.length >= 1);
  // 2026-10-30 种子按状态重排后，0304 进入分区填写中且适用匿名化；0306/0313 的适用条款不含匿名化字段位，不派生
  assert.deepEqual(records.map((record) => record.surveyId).sort(), [
    'S-2026-0304', 'S-2026-0307', 'S-2026-0308', 'S-2026-0312', 'S-2026-0314', 'S-2026-0315',
  ]);
  // 匹配审批通过即进入分区填写中 → 填写中；审核 → 审核中；归档 → 已归档
  assert.equal(records.find((record) => record.surveyId === 'S-2026-0304')?.status, 'filling');
  assert.equal(records.find((record) => record.surveyId === 'S-2026-0312')?.status, 'filling');
  assert.equal(records.find((record) => record.surveyId === 'S-2026-0314')?.status, 'reviewing');
  assert.equal(records.find((record) => record.surveyId === 'S-2026-0315')?.status, 'archived');
  // 参与字段 = 4（C/E/F/G），补充字段 D 不计入分母
  assert.equal(records.every((record) => record.participating === 4), true);
  assert.equal(records.every((record) => record.participating >= record.filled), true);
  assert.equal(records.every((record) => /^AN-\d{4}$/.test(record.id)), true);
});

test('记录字段值与分区存储同源（步骤4 内联填写不另存一份）', async () => {
  const before = await gateway.anonymizationGateway.listRecords();
  const target = before.find((record) => record.surveyId === 'S-2026-0315');
  assert.equal(target?.filled, 4);
  assert.match(target?.values.F ?? '', /人脸 98\.2%/);
  // 覆盖存储后记录随之变化，说明没有第二套任务表
  const valuesModule = await server.ssrLoadModule('/src/modules/sections/data/sectionValues.ts');
  valuesModule.saveSectionValues('anonymization', 'S-2026-0315', { C: 'no', D: 'downscale', E: '', F: '', G: '' });
  const after = await gateway.anonymizationGateway.listRecords();
  const updated = after.find((record) => record.surveyId === 'S-2026-0315');
  assert.equal(updated?.values.C, 'no');
  assert.equal(updated?.filled, 1);
  assert.equal(progress.readSectionValues('S-2026-0315').anonymization.D, 'downscale');
});

test('四态口径：D 为补充字段（无色），其余字段按驱动条款参与', async () => {
  const surveys = await server.ssrLoadModule('/src/modules/surveys/data/surveys.ts');
  const matching = await server.ssrLoadModule('/src/modules/surveys/data/matching.ts');
  const record = surveys.surveyRecords.find((item) => item.id === 'S-2026-0307');
  assert.ok(record);
  matching.ensureSurveyMatching(record);
  const section = progress.sectionOverview(record.id, record.matching).sections
    .find((item) => item.key === 'anonymization');
  assert.equal(section?.plain, 1);
  assert.equal(section?.participating, 4);
  assert.equal(section?.gray, 0);
});

test('草稿校验：字段位被改动即报 source，版本号格式非法即报 version', () => {
  const draft = versions.makeAnonymizationDraft(versions.anonymizationReferenceVersion);
  assert.equal(versions.checkAnonymizationDraft(draft).length, 0);
  draft.version = '1.1';
  assert.equal(versions.checkAnonymizationDraft(draft).some((issue) => issue.code === 'version'), true);
  draft.version = 'v1.9';
  draft.fields[0].column = 'B';
  assert.equal(versions.checkAnonymizationDraft(draft).some((issue) => issue.code === 'source'), true);
});

test('「是/否」选项为固定取值，匿名化方式选项可增删', () => {
  const [answer, method] = [versions.anonymizationReferenceVersion.fields[0], versions.anonymizationReferenceVersion.fields[1]];
  assert.deepEqual(answer.options.map((choice) => choice.code), [...anonymization.ANONYMIZATION_ANSWERS]);
  assert.deepEqual(method.options.map((choice) => choice.code), [...anonymization.ANONYMIZATION_METHODS]);
});
