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
const versions = await server.ssrLoadModule('/src/modules/sections/data/sensorVersions.ts');
const progress = await server.ssrLoadModule('/src/modules/sections/data/sectionProgress.ts');
const sensors = await server.ssrLoadModule('/src/modules/sections/data/sensors.ts');

test('sensor version and section catalog preserve workbook D-G fields', () => {
  const expected = ['D', 'E', 'F', 'G'];
  assert.deepEqual(versions.sensorReferenceVersion.fields.map((field) => field.column), expected);
  assert.deepEqual(catalog.fieldsOf('sensors').map((field) => field.code), expected);
  assert.deepEqual(catalog.fieldsOf('sensors').map((field) => field.labelZh),
    versions.sensorReferenceVersion.fields.map((field) => field.labelZh));
  assert.deepEqual(catalog.fieldsOf('sensors').map((field) => field.drivers),
    [['6.3.3', '6.3.4'], [], [], []]);
  assert.equal(versions.sensorVersionOptionsMatchRecords(), true);
});

test('sensor task projects four values without replacing its multi-row inventory', () => {
  assert.deepEqual(progress.readSectionValues('S-2026-0305').sensors, {
    D: 'camera', E: 'unverified', F: '座舱内后视镜区域', G: '驾驶员状态识别',
  });
  assert.equal(sensors.sensorTasks.find((task) => task.id === 'SE-0314').rows.length, 2);
  assert.deepEqual(progress.readSectionValues('S-2026-0314').sensors, {
    D: 'radar4d', E: 'yes', F: '前保险杠', G: '前向目标检测',
  });
});

test('version draft validation, optimistic revision and legacy driver migration', () => {
  const draft = versions.makeSensorDraft(versions.sensorReferenceVersion);
  draft.version = 'invalid';
  assert.ok(versions.checkSensorDraft(draft).includes('version'));
  draft.version = 'v1.1';
  const saved = versions.saveSensorVersion(draft, 0);
  assert.equal(saved.revision, 1);
  assert.throws(() => versions.saveSensorVersion(saved, 0), /conflict/);

  const old = structuredClone(saved);
  old.fields[0].drivers = [];
  old.fields[1].drivers = ['6.3.3', '6.3.4'];
  values.set('sensor-form-versions:v1', JSON.stringify([old]));
  const migrated = versions.readSensorVersions()[1];
  assert.deepEqual(migrated.fields.map((field) => field.drivers), [['6.3.3', '6.3.4'], [], [], []]);
  assert.equal(migrated.revision, 1);
});
