import clauseSeed from '../../compliance/data/legacy-seed.json';
import { BASIC_FIELD_CODES, type BasicFieldCode } from './basicInfo';
import type { SectionVersionStatus } from './versionStatus';

export type BasicWidget = 'text' | 'textarea' | 'select';
export type BasicRequiredness = 'unconfirmed' | 'optional' | 'required';
export type BasicMatchMode = 'any' | 'all';
export type ClauseDecision = 'applicable' | 'not-applicable' | 'unverified';
export type PreviewState = 'plain' | 'unverified' | 'required-empty' | 'filled' | 'optional-empty' | 'not-applicable';

export interface BasicOption {
  code: string;
  labelZh: string;
  labelEn: string;
  workbookValue: string;
}

export interface BasicFieldDefinition {
  key: `basic.${BasicFieldCode}`;
  column: BasicFieldCode;
  workbookHeader: string;
  labelZh: string;
  labelEn: string;
  widget: BasicWidget;
  source: 'cover' | 'manual';
  options: BasicOption[];
  drivers: string[];
  matchMode: BasicMatchMode;
  requiredness: BasicRequiredness;
}

export interface BasicFormVersion {
  id: string;
  version: string;
  status: SectionVersionStatus;
  sourceVersion: string;
  description?: string;
  updatedAt: string;
  revision: number;
  fields: BasicFieldDefinition[];
}

const option = (code: string, labelZh: string, labelEn: string): BasicOption => ({
  code, labelZh, labelEn, workbookValue: labelZh,
});

const workbookHeaders: Record<BasicFieldCode, string> = {
  C: '功能说明',
  D: '功能分类\n（基本功能/非基本功能）\n基本功能=仅需VIN即可实现的核心功能\n（如基础驾驶、车辆安全）\n非基本功能=需额外收集个人信息才能\n实现的功能（如个性化服务、远程APP）',
  E: '涉及数据类型\n如：VIN、位置信息、座舱语音、\n生物特征、联系方式、账号密码\n参考附录A 表A.1',
  F: '数据收集方式\n自动采集/用户输入/系统生成',
  G: '数据收集时机\n首次启动/每次使用/后台运行',
  H: '数据收集位置\n座舱内/车外',
  I: '数据存储位置\n车端ECU/云端/第三方',
  J: '存储期限\n如：2年/至车辆报废/至注销账号',
  K: '数据处理目的\n如：车辆控制、远程服务、个性化推荐',
  L: '数据使用方式\n本地处理/云端处理/第三方处理',
};

const definitions: Omit<BasicFieldDefinition, 'key' | 'column' | 'workbookHeader' | 'requiredness' | 'matchMode'>[] = [
  { labelZh: '功能说明', labelEn: 'Function description', widget: 'text', source: 'cover', options: [], drivers: [] },
  { labelZh: '功能分类', labelEn: 'Function category', widget: 'select', source: 'manual',
    options: [option('basic', '基本功能', 'Basic function'), option('non-basic', '非基本功能', 'Non-basic function')], drivers: ['6.3.6'] },
  { labelZh: '涉及数据类型', labelEn: 'Data types involved', widget: 'text', source: 'manual', options: [], drivers: ['6.1.1', '6.3.5', '6.3.7'] },
  { labelZh: '数据收集方式', labelEn: 'Data collection method', widget: 'select', source: 'manual',
    options: [option('auto', '自动采集', 'Automatic collection'), option('input', '用户输入', 'User input'), option('generated', '系统生成', 'System-generated')], drivers: ['6.3.1'] },
  { labelZh: '数据收集时机', labelEn: 'Data collection timing', widget: 'select', source: 'manual',
    options: [option('first', '首次启动', 'First launch'), option('each', '每次使用', 'Each use'), option('background', '后台运行', 'Background operation')], drivers: [] },
  { labelZh: '数据收集位置', labelEn: 'Data collection location', widget: 'select', source: 'manual',
    options: [option('cockpit', '座舱内', 'Inside cockpit'), option('exterior', '车外', 'Outside vehicle')], drivers: ['6.1.6'] },
  { labelZh: '数据存储位置', labelEn: 'Data storage location', widget: 'select', source: 'manual',
    options: [option('ecu', '车端ECU', 'Vehicle ECU'), option('cloud', '云端', 'Cloud'), option('third-party', '第三方', 'Third party')], drivers: ['6.4.2'] },
  { labelZh: '存储期限', labelEn: 'Retention period', widget: 'text', source: 'manual', options: [], drivers: ['6.4.1'] },
  { labelZh: '数据处理目的', labelEn: 'Purpose of data processing', widget: 'textarea', source: 'manual', options: [], drivers: [] },
  { labelZh: '数据使用方式', labelEn: 'How data is used', widget: 'select', source: 'manual',
    options: [option('local', '本地处理', 'Local processing'), option('cloud', '云端处理', 'Cloud processing'), option('third-party', '第三方处理', 'Third-party processing')], drivers: [] },
];

export const BASIC_CLAUSE_CODES = (clauseSeed.clauses as { code: string }[]).map((clause) => clause.code);

export const referenceVersion: BasicFormVersion = {
  id: 'basic-reference-v1', version: 'v1', status: 'current', sourceVersion: '', description: '',
  updatedAt: '', revision: 0,
  fields: definitions.map((definition, index) => ({
    ...definition,
    key: `basic.${BASIC_FIELD_CODES[index]}`,
    column: BASIC_FIELD_CODES[index],
    workbookHeader: workbookHeaders[BASIC_FIELD_CODES[index]],
    options: definition.options.map((item) => ({ ...item })),
    drivers: [...definition.drivers],
    matchMode: 'any',
    requiredness: 'unconfirmed',
  })),
};

const STORAGE_KEY = 'basic-info-form-drafts:v1';

function isStoredVersion(value: unknown): value is BasicFormVersion {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<BasicFormVersion>;
  return typeof item.id === 'string' && typeof item.version === 'string' && item.status === 'draft'
    && typeof item.sourceVersion === 'string' && typeof item.updatedAt === 'string'
    && (item.description === undefined || typeof item.description === 'string')
    && Number.isInteger(item.revision) && Array.isArray(item.fields)
    && item.fields.length === BASIC_FIELD_CODES.length
    && item.fields.every((field, index) => field && field.key === `basic.${BASIC_FIELD_CODES[index]}`
      && field.column === BASIC_FIELD_CODES[index] && field.workbookHeader === referenceVersion.fields[index].workbookHeader
      && field.source === referenceVersion.fields[index].source
      && typeof field.labelZh === 'string' && typeof field.labelEn === 'string'
      && ['text', 'textarea', 'select'].includes(field.widget)
      && Array.isArray(field.options) && field.options.every((choice) => choice && typeof choice.code === 'string'
        && typeof choice.labelZh === 'string' && typeof choice.labelEn === 'string' && typeof choice.workbookValue === 'string')
      && Array.isArray(field.drivers) && field.drivers.every((driver) => typeof driver === 'string')
      && ['any', 'all'].includes(field.matchMode) && ['unconfirmed', 'optional', 'required'].includes(field.requiredness));
}

export function readBasicVersions(): BasicFormVersion[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [referenceVersion];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isStoredVersion)) throw new Error('invalid-drafts');
  return [referenceVersion, ...parsed];
}

export function findBasicVersion(id: string): BasicFormVersion | undefined {
  return readBasicVersions().find((version) => version.id === id);
}

export function makeBasicDraft(source: BasicFormVersion, versions: readonly BasicFormVersion[]): BasicFormVersion {
  let number = 1;
  while (versions.some((item) => item.version === `v1.${number}`)) number += 1;
  return {
    ...structuredClone(source), id: crypto.randomUUID(), version: `v1.${number}`,
    status: 'draft', sourceVersion: source.version, description: source.description ?? '', updatedAt: '', revision: 0,
  };
}

export type BasicIssue = { code: 'version' | 'label' | 'options' | 'drivers' | 'source' | 'description'; field?: BasicFieldCode };

export function checkBasicDraft(version: BasicFormVersion): BasicIssue[] {
  const issues: BasicIssue[] = [];
  if (!/^v\d+(?:\.\d+){1,2}$/.test(version.version) || version.version.trim().length > 20) issues.push({ code: 'version' });
  if ((version.description ?? '').length > 100) issues.push({ code: 'description' });
  if (version.fields.length !== BASIC_FIELD_CODES.length) issues.push({ code: 'source' });
  for (const [index, field] of version.fields.entries()) {
    if (field.key !== `basic.${BASIC_FIELD_CODES[index]}` || field.column !== BASIC_FIELD_CODES[index]
      || field.workbookHeader !== referenceVersion.fields[index].workbookHeader
      || field.source !== referenceVersion.fields[index].source || (field.source === 'cover' && field.widget !== 'text')) {
      issues.push({ code: 'source', field: field.column });
    }
    if (!field.labelZh.trim() || !field.labelEn.trim()) issues.push({ code: 'label', field: field.column });
    if (field.widget === 'select' && (!field.options.length || field.options.some((choice) =>
      !choice.code.trim() || !choice.labelZh.trim() || !choice.labelEn.trim() || !choice.workbookValue.trim())
      || new Set(field.options.map((choice) => choice.code)).size !== field.options.length
      || new Set(field.options.map((choice) => choice.workbookValue)).size !== field.options.length)) {
      issues.push({ code: 'options', field: field.column });
    }
    // 2026-10-29 用户裁决：驱动条款不再限制条数（仅校验存在 + 不重复）
    if (new Set(field.drivers).size !== field.drivers.length
      || field.drivers.some((clause) => !BASIC_CLAUSE_CODES.includes(clause))) issues.push({ code: 'drivers', field: field.column });
  }
  return issues;
}

export function saveBasicDraft(version: BasicFormVersion, expectedRevision: number): BasicFormVersion {
  if (version.status !== 'draft' || checkBasicDraft(version).length) throw new Error('invalid-draft');
  const versions = readBasicVersions().filter((item) => item.status === 'draft');
  if (versions.some((item) => item.version === version.version && item.id !== version.id)) throw new Error('duplicate-version');
  const index = versions.findIndex((item) => item.id === version.id);
  if ((index < 0 && expectedRevision !== 0) || (index >= 0 && versions[index].revision !== expectedRevision)) throw new Error('conflict');
  // The editor passes a Vue proxy; only plain JSON-compatible metadata belongs in storage.
  const saved = JSON.parse(JSON.stringify(version)) as BasicFormVersion;
  saved.revision = expectedRevision + 1;
  saved.updatedAt = new Date().toISOString();
  if (index < 0) versions.push(saved);
  else versions[index] = saved;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(versions));
  return saved;
}

export function evaluateBasicPreview(field: BasicFieldDefinition, decisions: Record<string, ClauseDecision>, value: string): PreviewState {
  if (!field.drivers.length) return 'plain';
  const states = field.drivers.map((code) => decisions[code] ?? 'unverified');
  if (field.matchMode === 'any' ? states.some((state) => state === 'applicable') : states.every((state) => state === 'applicable')) {
    if (value.trim()) return 'filled';
    if (field.requiredness === 'required') return 'required-empty';
    return field.requiredness === 'optional' ? 'optional-empty' : 'unverified';
  }
  if (field.matchMode === 'any' ? states.every((state) => state === 'not-applicable') : states.some((state) => state === 'not-applicable')) {
    return 'not-applicable';
  }
  return 'unverified';
}
