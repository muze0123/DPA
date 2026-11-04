/**
 * 生物特征与口令 · 表单版本。
 *
 * 版本 = 该分区 6 个业务字段的配置快照（中英文字段名、必填规则、下拉参数）。
 * 列位、组件类型与驱动条款由标准固定，版本内不可改；已启用版本随标准字段集
 * 固定在 v1.0，草稿只用于字段维护核对，不改动已填记录与判定结果。
 */
import { BIOMETRIC_TYPE_CODES, type BiometricTypeCode } from './sectionCatalog';
import type { SectionVersionStatus } from './versionStatus';

export type BiometricFieldCode = 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export const BIOMETRIC_FIELD_CODES: readonly BiometricFieldCode[] = ['C', 'D', 'E', 'F', 'G', 'H'];

export type BiometricWidget = 'select' | 'boolean';
export type BiometricRequiredness = 'unconfirmed' | 'optional' | 'required';

export interface BiometricOption {
  code: string;
  labelZh: string;
  labelEn: string;
}

export interface BiometricFieldDefinition {
  column: BiometricFieldCode;
  /** 字段在工作簿分区的原始表头（只读口径，用于核对列位） */
  header: string;
  labelZh: string;
  labelEn: string;
  widget: BiometricWidget;
  drivers: string[];
  requiredness: BiometricRequiredness;
  options: BiometricOption[];
}

export interface BiometricFormVersion {
  id: string;
  version: string;
  /** current = 现行版本（原「已启用」口径）；draft = 本机维护中的草稿 */
  status: SectionVersionStatus;
  sourceVersion: string;
  description: string;
  updatedAt: string;
  revision: number;
  fields: BiometricFieldDefinition[];
}

const TYPE_LABELS: Record<BiometricTypeCode, [string, string]> = {
  face: ['人脸', 'Face'],
  fingerprint: ['指纹', 'Fingerprint'],
  voiceprint: ['声纹', 'Voiceprint'],
  iris: ['虹膜', 'Iris'],
  palm: ['掌纹', 'Palm print'],
};

const typeOptions = (): BiometricOption[] => BIOMETRIC_TYPE_CODES.map((code) => ({
  code,
  labelZh: TYPE_LABELS[code][0],
  labelEn: TYPE_LABELS[code][1],
}));

/** 表头原文：取自工作簿「生物特征与口令」第 3 行 C–H 列 */
const HEADERS: Record<BiometricFieldCode, string> = {
  C: '生物特征类型（人脸/指纹/声纹/虹膜/掌纹）',
  D: '是否有非生物识别替代方式',
  E: '是否涉及口令/密码/PIN',
  F: '口令输入/显示时是否隐藏',
  G: '生物特征是否仅存储于车内 6.4.3（是/否）',
  H: '是否向车外传输生物特征 6.4.3（是/否；若"是"需独立于车内处理的单独同意）',
};

const definitions = (): BiometricFieldDefinition[] => [
  { column: 'C', header: HEADERS.C, labelZh: '生物特征类型', labelEn: 'Biometric type', widget: 'select', drivers: ['6.4.3'], requiredness: 'unconfirmed', options: typeOptions() },
  { column: 'D', header: HEADERS.D, labelZh: '是否有非生物识别替代方式', labelEn: 'Non-biometric alternative available', widget: 'boolean', drivers: ['6.5.1'], requiredness: 'unconfirmed', options: [] },
  { column: 'E', header: HEADERS.E, labelZh: '是否涉及口令/密码/PIN', labelEn: 'Passcode, password or PIN involved', widget: 'boolean', drivers: ['6.5.2'], requiredness: 'unconfirmed', options: [] },
  { column: 'F', header: HEADERS.F, labelZh: '口令输入/显示时是否隐藏', labelEn: 'Passcode masked on input and display', widget: 'boolean', drivers: ['6.5.2'], requiredness: 'unconfirmed', options: [] },
  { column: 'G', header: HEADERS.G, labelZh: '生物特征是否仅存储于车内', labelEn: 'Biometrics stored only in the vehicle', widget: 'boolean', drivers: ['6.4.3'], requiredness: 'unconfirmed', options: [] },
  { column: 'H', header: HEADERS.H, labelZh: '是否向车外传输生物特征', labelEn: 'Biometrics transmitted off-board', widget: 'boolean', drivers: ['6.4.3'], requiredness: 'unconfirmed', options: [] },
];

/** 当前生效版本（标准字段集 v1.0） */
export const activeBiometricVersion: BiometricFormVersion = {
  id: 'biometric-active-v1',
  version: 'v1.0',
  status: 'current',
  sourceVersion: '',
  description: '生物特征与口令分区标准字段集',
  updatedAt: '',
  revision: 0,
  fields: definitions(),
};

const STORAGE_KEY = 'csa-biometric-form-drafts:v1';

function isStoredVersion(value: unknown): value is BiometricFormVersion {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<BiometricFormVersion>;
  return typeof item.id === 'string' && typeof item.version === 'string' && item.status === 'draft'
    && typeof item.sourceVersion === 'string' && typeof item.description === 'string'
    && typeof item.updatedAt === 'string' && Number.isInteger(item.revision)
    && Array.isArray(item.fields) && item.fields.length === BIOMETRIC_FIELD_CODES.length
    && item.fields.every((field, index) => field
      && field.column === BIOMETRIC_FIELD_CODES[index]
      && field.header === activeBiometricVersion.fields[index].header
      && field.widget === activeBiometricVersion.fields[index].widget
      && typeof field.labelZh === 'string' && typeof field.labelEn === 'string'
      && Array.isArray(field.drivers) && field.drivers.every((driver) => typeof driver === 'string')
      && ['unconfirmed', 'optional', 'required'].includes(field.requiredness)
      && Array.isArray(field.options) && field.options.every((choice) => choice
        && typeof choice.code === 'string' && typeof choice.labelZh === 'string' && typeof choice.labelEn === 'string'));
}

export function readBiometricVersions(): BiometricFormVersion[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [activeBiometricVersion];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isStoredVersion)) throw new Error('invalid-drafts');
  return [activeBiometricVersion, ...parsed];
}

export function findBiometricVersion(id: string): BiometricFormVersion | undefined {
  return readBiometricVersions().find((version) => version.id === id);
}

export function makeBiometricDraft(source: BiometricFormVersion, versions: readonly BiometricFormVersion[]): BiometricFormVersion {
  let number = 1;
  while (versions.some((item) => item.version === `v1.${number}`)) number += 1;
  const draft = structuredClone(source) as BiometricFormVersion;
  return {
    ...draft,
    id: crypto.randomUUID(),
    version: `v1.${number}`,
    status: 'draft',
    sourceVersion: source.version === 'v1.0' ? 'v1.0' : source.version,
    description: '',
    updatedAt: '',
    revision: 0,
  };
}

export type BiometricIssueCode = 'version' | 'description' | 'label' | 'options' | 'source';

export interface BiometricIssue {
  code: BiometricIssueCode;
  column?: BiometricFieldCode;
}

export function checkBiometricDraft(version: BiometricFormVersion): BiometricIssue[] {
  const issues: BiometricIssue[] = [];
  if (!/^v\d+(?:\.\d+){1,2}$/.test(version.version.trim()) || version.version.trim().length > 20) issues.push({ code: 'version' });
  if (version.description.length > 100) issues.push({ code: 'description' });
  if (version.fields.length !== BIOMETRIC_FIELD_CODES.length) issues.push({ code: 'source' });
  for (const [index, field] of version.fields.entries()) {
    const base = activeBiometricVersion.fields[index];
    if (field.column !== BIOMETRIC_FIELD_CODES[index] || !base
      || field.header !== base.header || field.widget !== base.widget
      || field.drivers.join('|') !== base.drivers.join('|')) {
      issues.push({ code: 'source', column: field.column });
    }
    if (!field.labelZh.trim() || !field.labelEn.trim()) issues.push({ code: 'label', column: field.column });
    if (field.widget === 'select' && (
      field.options.length === 0
      || field.options.some((choice) => !choice.code.trim() || !choice.labelZh.trim() || !choice.labelEn.trim())
      || new Set(field.options.map((choice) => choice.code)).size !== field.options.length
    )) issues.push({ code: 'options', column: field.column });
  }
  return issues;
}

export function saveBiometricDraft(version: BiometricFormVersion, expectedRevision: number): BiometricFormVersion {
  if (version.status !== 'draft' || checkBiometricDraft(version).length) throw new Error('invalid-draft');
  const drafts = readBiometricVersions().filter((item) => item.status === 'draft');
  if (drafts.some((item) => item.version === version.version && item.id !== version.id)) throw new Error('duplicate-version');
  const index = drafts.findIndex((item) => item.id === version.id);
  if ((index < 0 && expectedRevision !== 0) || (index >= 0 && drafts[index].revision !== expectedRevision)) {
    throw new Error('conflict');
  }
  // 编辑器传入的是 Vue 代理对象，只把纯 JSON 元数据写入存储
  const saved = JSON.parse(JSON.stringify(version)) as BiometricFormVersion;
  saved.revision = expectedRevision + 1;
  saved.updatedAt = new Date().toISOString();
  if (index < 0) drafts.push(saved);
  else drafts[index] = saved;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  return saved;
}

/** 版本草稿与标准字段集的差异（版本详情的核对提示） */
export function biometricVersionDiff(version: BiometricFormVersion): number {
  return version.fields.reduce((total, field, index) => {
    const base = activeBiometricVersion.fields[index];
    if (!base) return total + 1;
    const changed = field.labelZh !== base.labelZh || field.labelEn !== base.labelEn
      || field.requiredness !== base.requiredness
      || field.options.length !== base.options.length
      || field.options.some((choice, position) => choice.labelZh !== base.options[position]?.labelZh
        || choice.labelEn !== base.options[position]?.labelEn);
    return total + (changed ? 1 : 0);
  }, 0);
}
