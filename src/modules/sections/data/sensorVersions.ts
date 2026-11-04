import { PRECISION_ANSWERS, SENSOR_TYPES } from './sensors';
import type { SectionVersionStatus } from './versionStatus';

export const SENSOR_FIELD_CODES = ['D', 'E', 'F', 'G'] as const;
export type SensorFieldCode = (typeof SENSOR_FIELD_CODES)[number];
export type SensorRequiredness = 'unconfirmed' | 'optional' | 'required';

export interface SensorVersionOption {
  code: string;
  labelZh: string;
  labelEn: string;
  workbookValue: string;
}

export interface SensorFieldDefinition {
  key: `sensor.${SensorFieldCode}`;
  column: SensorFieldCode;
  workbookHeader: string;
  labelZh: string;
  labelEn: string;
  widget: 'select' | 'text';
  options: SensorVersionOption[];
  drivers: string[];
  requiredness: SensorRequiredness;
}

export interface SensorFormVersion {
  id: string;
  version: string;
  status: SectionVersionStatus;
  sourceVersion: string;
  updatedAt: string;
  revision: number;
  description: string;
  fields: SensorFieldDefinition[];
}

const STORAGE_KEY = 'sensor-form-versions:v1';
const option = (code: string, labelZh: string, labelEn: string): SensorVersionOption => ({
  code, labelZh, labelEn, workbookValue: labelZh,
});

export const sensorReferenceVersion: SensorFormVersion = {
  id: 'sensor-reference-v1', version: 'v1', status: 'current',
  sourceVersion: 'GB44464_静态.xlsx', updatedAt: '', revision: 0, description: '',
  fields: [
    {
      key: 'sensor.D', column: 'D',
      workbookHeader: '传感器类型\n如：摄像头、激光雷达、4D毫米波雷达等（6.3.3 数据收集设备）',
      labelZh: '传感器类型', labelEn: 'Sensor type', widget: 'select', drivers: ['6.3.3', '6.3.4'], requiredness: 'unconfirmed',
      options: [
        option('camera', '摄像头', 'Camera'), option('lidar', '激光雷达', 'LiDAR'),
        option('radar', '毫米波雷达', 'Millimeter-wave radar'),
        option('radar4d', '4D 毫米波雷达', '4D millimeter-wave radar'),
        option('ultrasonic', '超声波雷达', 'Ultrasonic radar'), option('other', '其他', 'Other'),
      ],
    },
    {
      key: 'sensor.E', column: 'E',
      workbookHeader: '是否至少一个功能符合最小精度要求（6.3.4，是/否）',
      labelZh: '是否至少一个功能符合最小精度要求', labelEn: 'At least one function meets minimum accuracy',
      widget: 'select', drivers: [], requiredness: 'unconfirmed',
      options: [option('yes', '是', 'Yes'), option('no', '否', 'No'), option('unverified', '待核验', 'Needs verification')],
    },
    {
      key: 'sensor.F', column: 'F', workbookHeader: '传感器安装位置',
      labelZh: '传感器安装位置', labelEn: 'Installation position', widget: 'text', options: [], drivers: [], requiredness: 'unconfirmed',
    },
    {
      key: 'sensor.G', column: 'G', workbookHeader: '传感器对应功能',
      labelZh: '传感器对应功能', labelEn: 'Associated function', widget: 'text', options: [], drivers: [], requiredness: 'unconfirmed',
    },
  ],
};

function validField(value: unknown, index: number): value is SensorFieldDefinition {
  if (!value || typeof value !== 'object') return false;
  const field = value as Partial<SensorFieldDefinition>;
  const reference = sensorReferenceVersion.fields[index];
  return !!reference && field.key === reference.key && field.column === reference.column
    && field.workbookHeader === reference.workbookHeader && field.widget === reference.widget
    && typeof field.labelZh === 'string' && typeof field.labelEn === 'string'
    && ['unconfirmed', 'optional', 'required'].includes(field.requiredness ?? '')
    && Array.isArray(field.drivers) && field.drivers.length === reference.drivers.length
    && field.drivers.every((code, position) => code === reference.drivers[position])
    && Array.isArray(field.options) && field.options.length === reference.options.length
    && field.options.every((choice, position) => {
      const expected = reference.options[position];
      return !!choice && choice.code === expected.code && choice.workbookValue === expected.workbookValue
        && typeof choice.labelZh === 'string' && typeof choice.labelEn === 'string';
    });
}

function validVersion(value: unknown): value is SensorFormVersion {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SensorFormVersion>;
  return typeof item.id === 'string' && !!item.id && item.id !== sensorReferenceVersion.id
    && typeof item.version === 'string' && item.status === 'draft'
    && typeof item.sourceVersion === 'string' && typeof item.updatedAt === 'string'
    && Number.isSafeInteger(item.revision) && (item.revision ?? 0) >= 1
    && typeof item.description === 'string' && Array.isArray(item.fields)
    && item.fields.length === SENSOR_FIELD_CODES.length && item.fields.every(validField);
}

function normalizeLegacyDrivers(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const item = value as Partial<SensorFormVersion>;
  if (!Array.isArray(item.fields) || item.fields.length !== SENSOR_FIELD_CODES.length) return value;
  const [type, precision] = item.fields;
  if (type?.key !== 'sensor.D' || precision?.key !== 'sensor.E'
    || !Array.isArray(type.drivers) || type.drivers.length
    || !Array.isArray(precision.drivers) || precision.drivers.join(',') !== '6.3.3,6.3.4') return value;
  return { ...item, fields: item.fields.map((field, index) => ({
    ...field, drivers: index === 0 ? ['6.3.3', '6.3.4'] : index === 1 ? [] : field.drivers,
  })) };
}

export function readSensorVersions(): SensorFormVersion[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [sensorReferenceVersion];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('invalid-drafts');
  const normalized: unknown[] = parsed.map(normalizeLegacyDrivers);
  if (!normalized.every(validVersion)) throw new Error('invalid-drafts');
  return [sensorReferenceVersion, ...normalized];
}

export function findSensorVersion(id: string): SensorFormVersion | undefined {
  return readSensorVersions().find((version) => version.id === id);
}

export function makeSensorDraft(source: SensorFormVersion): SensorFormVersion {
  const versions = readSensorVersions();
  let number = 1;
  while (versions.some((item) => item.version === `v1.${number}`)) number += 1;
  return {
    ...structuredClone(source), id: crypto.randomUUID(), version: `v1.${number}`,
    status: 'draft', sourceVersion: source.version, updatedAt: '', revision: 0, description: '',
  };
}

export type SensorVersionIssue = 'version' | 'description' | 'label' | 'options' | 'source';

export function checkSensorDraft(version: SensorFormVersion): SensorVersionIssue[] {
  const issues: SensorVersionIssue[] = [];
  if (!/^v\d+(?:\.\d+){1,2}$/.test(version.version) || version.version.trim().length > 20) issues.push('version');
  if (version.description.length > 100) issues.push('description');
  if (version.fields.length !== SENSOR_FIELD_CODES.length || !version.fields.every(validField)) issues.push('source');
  for (const field of version.fields) {
    if (!field.labelZh.trim() || !field.labelEn.trim() || field.labelZh.length > 80 || field.labelEn.length > 80) issues.push('label');
    if (field.options.some((choice) => !choice.labelZh.trim() || !choice.labelEn.trim()
      || choice.labelZh.length > 80 || choice.labelEn.length > 80)) issues.push('options');
  }
  return [...new Set(issues)];
}

export function saveSensorVersion(version: SensorFormVersion, expectedRevision: number): SensorFormVersion {
  if (version.status !== 'draft' || checkSensorDraft(version).length) throw new Error('invalid-draft');
  const versions = readSensorVersions().filter((item) => item.status === 'draft');
  if (versions.some((item) => item.version === version.version && item.id !== version.id)) throw new Error('duplicate-version');
  const index = versions.findIndex((item) => item.id === version.id);
  if ((index < 0 && expectedRevision !== 0) || (index >= 0 && versions[index].revision !== expectedRevision)) throw new Error('conflict');
  const saved = JSON.parse(JSON.stringify(version)) as SensorFormVersion;
  saved.revision = expectedRevision + 1;
  saved.updatedAt = new Date().toISOString();
  if (index < 0) versions.push(saved);
  else versions[index] = saved;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(versions));
  return saved;
}

export function sensorVersionOptionsMatchRecords(): boolean {
  const [type, precision] = sensorReferenceVersion.fields;
  return SENSOR_TYPES.every((code) => type.options.some((option) => option.code === code))
    && PRECISION_ANSWERS.every((code) => precision.options.some((option) => option.code === code));
}
