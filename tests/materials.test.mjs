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

const catalog = await server.ssrLoadModule('/src/modules/sections/data/sectionCatalog.ts');
const progress = await server.ssrLoadModule('/src/modules/sections/data/sectionProgress.ts');
const materials = await server.ssrLoadModule('/src/modules/sections/data/materials.ts');
const materialsVersions = await server.ssrLoadModule('/src/modules/sections/data/materialsVersions.ts');
const surveys = await server.ssrLoadModule('/src/modules/surveys/data/surveys.ts');

test('通用材料 = 工作簿三列，无驱动条款，备注选填', () => {
  const fields = catalog.fieldsOf('materials');
  assert.deepEqual(fields.map((field) => field.code), ['C', 'D', 'E']);
  assert.deepEqual(fields.map((field) => field.labelZh), ['需提供的测试材料清单', '状态恢复/变更方法说明', '备注']);
  assert.deepEqual(fields.map((field) => field.drivers), [[], [], []]);
  assert.deepEqual(fields.map((field) => field.carried), [true, true, true]);
  assert.deepEqual(fields.map((field) => Boolean(field.alwaysCounted)), [true, true, false]);
  assert.deepEqual(fields.map((field) => Boolean(field.optional)), [false, false, true]);
  assert.equal(catalog.SECTION_DEFS.find((def) => def.key === 'materials')?.driverless, true);
});

test('54 字段口径不受影响：六分区与通用材料并列', () => {
  assert.equal(catalog.CLAUSE_SECTION_KEYS.length, 6);
  assert.ok(!catalog.CLAUSE_SECTION_KEYS.includes('materials'));
  assert.equal(catalog.CLAUSE_SECTION_KEYS.reduce((sum, key) => sum + catalog.fieldsOf(key).length, 0), 54);
  assert.equal(catalog.SECTION_FIELD_TOTAL, 57);
});

test('着色：无匹配快照时通用材料不判灰，备注恒无色', () => {
  const fields = catalog.fieldsOf('materials');
  const [checklist, restore, remark] = fields;
  assert.equal(progress.fieldShade(checklist, ''), 'yellow');
  assert.equal(progress.fieldShade(checklist, '策略文档'), 'white');
  assert.equal(progress.fieldShade(restore, '  '), 'yellow');
  assert.equal(progress.fieldShade(remark, ''), 'plain');
  assert.equal(progress.fieldShade(remark, '补充说明'), 'plain');
});

test('本地库读写：按 FuLi ID 保存并回读，条数与状态派生一致', () => {
  const fuliId = 'FL-2025-0099';
  const savedAt = materials.saveMaterialValues(fuliId, { C: '策略文档\n加密方案\n\nAPK 包', D: '重启车机后恢复默认状态', E: '' });
  assert.match(savedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  const stored = materials.loadMaterialValues(fuliId);
  assert.deepEqual(stored, { C: '策略文档\n加密方案\n\nAPK 包', D: '重启车机后恢复默认状态', E: '' });
  assert.equal(materials.materialChecklistCount(stored.C), 3);
  assert.equal(materials.materialCompletion(stored), 'complete');

  materials.saveMaterialValues(fuliId, { C: '策略文档', D: '', E: '' });
  assert.equal(materials.materialCompletion(materials.loadMaterialValues(fuliId)), 'partial');

  materials.saveMaterialValues(fuliId, { C: '', D: '', E: '只有备注' });
  assert.equal(materials.materialCompletion(materials.loadMaterialValues(fuliId)), 'partial');

  materials.saveMaterialValues(fuliId, { C: '', D: '', E: '' });
  assert.equal(materials.materialCompletion(materials.loadMaterialValues(fuliId)), 'empty');
});

test('行投影按功能编号续排，长文本按上限截断', () => {
  const rows = materials.materialRows([
    { fuliId: 'FL-2025-0001', functionName: '远程车门解锁', platformName: '车载平台 A', owner: '张晨' },
    { fuliId: 'FL-2024-0001', functionName: '清单外功能', platformName: '', owner: '李岩' },
  ]);
  assert.deepEqual(rows.map((row) => row.index), [1, 2]);
  assert.equal(rows[1].platformName, '');

  materials.saveMaterialValues('FL-2025-0001', { C: 'x'.repeat(materials.MATERIAL_MAX_LENGTH + 40), D: '', E: '' });
  assert.equal(materials.loadMaterialValues('FL-2025-0001').C.length, materials.MATERIAL_MAX_LENGTH);
});

test('问卷工作区：通用材料按问卷的 FuLi ID 投影并计入完成度与提交门禁', () => {
  const record = surveys.surveyRecords.find((item) => item.status === 'section-filling');
  assert.ok(record, '需要一个填写中的问卷做门禁用例');
  const fuliId = record.fuliId;

  materials.saveMaterialValues(fuliId, { C: '', D: '', E: '' });
  const emptyValues = progress.readSectionValues(record.id);
  assert.deepEqual(emptyValues.materials, { C: '', D: '', E: '' });

  const overview = progress.sectionOverview(record.id, record.matching, emptyValues);
  const section = overview.sections.find((item) => item.key === 'materials');
  assert.equal(section.carried, 3);
  assert.equal(section.participating, 2, '必交字段 C、D 进分母，备注不计');
  assert.equal(section.pending, 2);
  assert.equal(section.plain, 1);

  const gaps = progress.checkSectionGate(record);
  assert.equal(gaps.ok, false);
  assert.deepEqual(gaps.gaps.find((gap) => gap.section === 'materials')?.codes, ['C', 'D']);

  materials.saveMaterialValues(fuliId, { C: '策略文档', D: '重启车机恢复默认状态', E: '' });
  const filled = progress.sectionOverview(record.id, record.matching, progress.readSectionValues(record.id));
  const filledSection = filled.sections.find((item) => item.key === 'materials');
  assert.equal(filledSection.filled, 2);
  assert.equal(filledSection.pending, 0);
  assert.ok(!progress.checkSectionGate(record).gaps.some((gap) => gap.section === 'materials'));
});

test('表单版本：已启用版本 = 标准三字段集 v1.0', () => {
  const active = materialsVersions.activeMaterialsVersion;
  assert.equal(active.version, 'v1.0');
  assert.equal(active.status, 'current');
  assert.deepEqual(active.fields.map((field) => field.column), ['C', 'D', 'E']);
  assert.deepEqual(active.fields.map((field) => field.widget), ['long', 'long', 'long']);
  assert.deepEqual(active.fields.map((field) => field.requiredness), ['required', 'required', 'optional']);
  assert.ok(active.fields.every((field) => field.maxLength === materials.MATERIAL_MAX_LENGTH));
  assert.deepEqual(materialsVersions.readMaterialsVersions().map((item) => item.id), [active.id]);
});

test('表单版本：草稿新建 / 校验 / 保存 / 差异核对', () => {
  const active = materialsVersions.activeMaterialsVersion;
  const draft = materialsVersions.makeMaterialsDraft(active, materialsVersions.readMaterialsVersions());
  assert.equal(draft.version, 'v1.1');
  assert.equal(draft.status, 'draft');
  assert.equal(materialsVersions.checkMaterialsDraft(draft).length, 0, '新建草稿默认合法');

  // 空中文名 → label 校验问题；保存被拒
  draft.fields[0].labelZh = '';
  assert.deepEqual(
    materialsVersions.checkMaterialsDraft(draft).filter((issue) => issue.code === 'label').map((issue) => issue.column),
    ['C'],
  );
  assert.throws(() => materialsVersions.saveMaterialsDraft(draft, 0), /invalid-draft/);
  draft.fields[0].labelZh = '材料清单';
  assert.equal(materialsVersions.materialsVersionDiff(draft), 1, '仅中文名 1 项差异');

  const saved = materialsVersions.saveMaterialsDraft(draft, 0);
  assert.equal(saved.revision, 1);
  assert.match(saved.updatedAt, /^\d{4}-/);
  const list = materialsVersions.readMaterialsVersions();
  assert.equal(list.length, 2);
  assert.equal(list[1].status, 'draft');

  // 版本号冲突：另存一份同号草稿应报 duplicate-version
  const another = materialsVersions.makeMaterialsDraft(active, materialsVersions.readMaterialsVersions());
  assert.equal(another.version, 'v1.2');
  another.version = 'v1.1';
  assert.throws(() => materialsVersions.saveMaterialsDraft(another, 0), /duplicate-version/);

  // 乐观锁：以旧 revision 再保存应报 conflict
  assert.throws(() => materialsVersions.saveMaterialsDraft(saved, 0), /conflict/);
});
