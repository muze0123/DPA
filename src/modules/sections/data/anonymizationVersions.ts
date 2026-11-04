/**
 * 匿名化表单版本（分区级表单配置）。
 *
 * 版本 = 同一组 C–G 字段的命名、必填规则、驱动条款与「匿名化方式」选项集；
 * 字段位、字段来源与控件类型由工作簿口径固定，版本内不可增删字段（校验时按列位逐项核对）。
 * 状态：current 现行 / draft 草稿 / published 已发布（预留）/ retired 历史（预留）；
 * 只有草稿可编辑，现行与历史版本只能复制。
 */
import clauseSeed from '../../compliance/data/legacy-seed.json';
import type { SectionVersionStatus } from './versionStatus';
import {
  ANONYMIZATION_ANSWER_OPTIONS, ANONYMIZATION_ANSWERS, ANONYMIZATION_FIELD_CODES, ANONYMIZATION_FIELD_META,
  ANONYMIZATION_METHOD_OPTIONS, ANONYMIZATION_METHODS,
  type AnonymizationFieldCode, type AnonymizationOption, type AnonymizationWidget,
} from './anonymization';

export type AnonymizationRequiredness = 'unconfirmed' | 'optional' | 'required';

export interface AnonymizationFieldDefinition {
  key: `anonymization.${AnonymizationFieldCode}`;
  column: AnonymizationFieldCode;
  labelZh: string;
  labelEn: string;
  widget: AnonymizationWidget;
  options: AnonymizationOption[];
  drivers: string[];
  requiredness: AnonymizationRequiredness;
}

export interface AnonymizationFormVersion {
  id: string;
  version: string;
  status: SectionVersionStatus;
  sourceVersion: string;
  description: string;
  updatedAt: string;
  revision: number;
  fields: AnonymizationFieldDefinition[];
}

const option = (code: string, labelZh: string, labelEn: string): AnonymizationOption => ({ code, labelZh, labelEn });

function defaultOptions(code: AnonymizationFieldCode): AnonymizationOption[] {
  if (code === 'D') return ANONYMIZATION_METHOD_OPTIONS.map((item) => ({ ...item }));
  if (code === 'F') return [];
  return ANONYMIZATION_ANSWER_OPTIONS.map((item) => ({ ...item }));
}

export const anonymizationReferenceVersion: AnonymizationFormVersion = {
  id: 'anonymization-v1',
  version: 'v1',
  status: 'current',
  sourceVersion: '',
  description: '车外图像/视频匿名化与账号删除后匿名化的分区填报口径。',
  updatedAt: '2026-03-01T09:00:00.000Z',
  revision: 0,
  fields: ANONYMIZATION_FIELD_META.map((meta) => ({
    key: `anonymization.${meta.code}` as const,
    column: meta.code,
    labelZh: meta.labelZh,
    labelEn: meta.labelEn,
    widget: meta.widget,
    options: defaultOptions(meta.code),
    drivers: [...meta.drivers],
    requiredness: meta.drivers.length ? 'required' : 'optional',
  })),
};

export const ANONYMIZATION_CLAUSE_CODES = (clauseSeed.clauses as { code: string }[]).map((clause) => clause.code);

const STORAGE_KEY = 'anonymization-form-versions:v1';

function validOption(value: unknown): value is AnonymizationOption {
  if (!value || typeof value !== 'object') return false;
  const choice = value as Partial<AnonymizationOption>;
  return typeof choice.code === 'string' && !!choice.code.trim() && choice.code.length <= 40
    && typeof choice.labelZh === 'string' && !!choice.labelZh.trim() && choice.labelZh.length <= 80
    && typeof choice.labelEn === 'string' && !!choice.labelEn.trim() && choice.labelEn.length <= 80;
}

function validField(value: unknown, index: number): value is AnonymizationFieldDefinition {
  if (!value || typeof value !== 'object') return false;
  const field = value as Partial<AnonymizationFieldDefinition>;
  const reference = anonymizationReferenceVersion.fields[index];
  if (!reference) return false;
  return field.key === reference.key && field.column === reference.column
    && field.widget === reference.widget
    && typeof field.labelZh === 'string' && field.labelZh.length <= 80
    && typeof field.labelEn === 'string' && field.labelEn.length <= 80
    && ['unconfirmed', 'optional', 'required'].includes(field.requiredness ?? '')
    && Array.isArray(field.drivers) && field.drivers.length <= 3
    && field.drivers.every((code) => typeof code === 'string' && ANONYMIZATION_CLAUSE_CODES.includes(code))
    && Array.isArray(field.options) && field.options.length <= 12 && field.options.every(validOption)
    && new Set(field.options.map((choice) => choice.code)).size === field.options.length;
}

function validVersion(value: unknown): value is AnonymizationFormVersion {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<AnonymizationFormVersion>;
  return typeof item.id === 'string' && !!item.id && item.id !== anonymizationReferenceVersion.id
    && typeof item.version === 'string' && item.status === 'draft'
    && typeof item.sourceVersion === 'string' && typeof item.description === 'string'
    && typeof item.updatedAt === 'string'
    && Number.isSafeInteger(item.revision) && (item.revision ?? 0) >= 1
    && Array.isArray(item.fields) && item.fields.length === ANONYMIZATION_FIELD_CODES.length
    && item.fields.every(validField);
}

export function readAnonymizationVersions(): AnonymizationFormVersion[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [anonymizationReferenceVersion];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(validVersion)) throw new Error('invalid-drafts');
  return [anonymizationReferenceVersion, ...parsed];
}

export function findAnonymizationVersion(id: string): AnonymizationFormVersion | undefined {
  return readAnonymizationVersions().find((version) => version.id === id);
}

/** 现行版本：新建/复制时的默认来源（当前只有内置 v1） */
export function currentAnonymizationVersion(): AnonymizationFormVersion {
  return readAnonymizationVersions().find((version) => version.status === 'current') ?? anonymizationReferenceVersion;
}

export function makeAnonymizationDraft(
  source: AnonymizationFormVersion,
  versions: readonly AnonymizationFormVersion[] = readAnonymizationVersions(),
): AnonymizationFormVersion {
  let number = 1;
  while (versions.some((item) => item.version === `v1.${number}`)) number += 1;
  return {
    ...structuredClone(source),
    id: crypto.randomUUID(),
    version: `v1.${number}`,
    status: 'draft',
    sourceVersion: source.version,
    description: source.description ?? '',
    updatedAt: '',
    revision: 0,
  };
}

export type AnonymizationIssueCode = 'version' | 'description' | 'label' | 'options' | 'drivers' | 'source';
export interface AnonymizationIssue {
  code: AnonymizationIssueCode;
  field?: AnonymizationFieldCode;
}

export function checkAnonymizationDraft(version: AnonymizationFormVersion): AnonymizationIssue[] {
  const issues: AnonymizationIssue[] = [];
  if (!/^v\d+(?:\.\d+){1,2}$/.test(version.version) || version.version.trim().length > 20) issues.push({ code: 'version' });
  if (version.description.length > 100) issues.push({ code: 'description' });
  if (version.fields.length !== ANONYMIZATION_FIELD_CODES.length) issues.push({ code: 'source' });
  for (const [index, field] of version.fields.entries()) {
    const reference = anonymizationReferenceVersion.fields[index];
    if (!reference || field.key !== reference.key || field.column !== reference.column
      || field.widget !== reference.widget) {
      issues.push({ code: 'source', field: field.column });
    }
    if (!field.labelZh.trim() || !field.labelEn.trim()
      || field.labelZh.length > 80 || field.labelEn.length > 80) {
      issues.push({ code: 'label', field: field.column });
    }
    if (field.widget === 'select' && field.options.length < 2) issues.push({ code: 'options', field: field.column });
    if (field.options.some((choice) => !choice.labelZh.trim() || !choice.labelEn.trim())
      || new Set(field.options.map((choice) => choice.code)).size !== field.options.length) {
      issues.push({ code: 'options', field: field.column });
    }
    if (field.drivers.length > 3 || new Set(field.drivers).size !== field.drivers.length
      || field.drivers.some((code) => !ANONYMIZATION_CLAUSE_CODES.includes(code))) {
      issues.push({ code: 'drivers', field: field.column });
    }
  }
  return issues;
}

export function saveAnonymizationDraft(
  version: AnonymizationFormVersion,
  expectedRevision: number,
): AnonymizationFormVersion {
  if (version.status !== 'draft' || checkAnonymizationDraft(version).length) throw new Error('invalid-draft');
  const drafts = readAnonymizationVersions().filter((item) => item.status === 'draft');
  if (drafts.some((item) => item.version === version.version && item.id !== version.id)) {
    throw new Error('duplicate-version');
  }
  const index = drafts.findIndex((item) => item.id === version.id);
  if ((index < 0 && expectedRevision !== 0) || (index >= 0 && drafts[index].revision !== expectedRevision)) {
    throw new Error('conflict');
  }
  const saved = JSON.parse(JSON.stringify(version)) as AnonymizationFormVersion;
  saved.revision = expectedRevision + 1;
  saved.updatedAt = new Date().toISOString();
  if (index < 0) drafts.push(saved);
  else drafts[index] = saved;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  return saved;
}

/** 口径自检：版本选项必须覆盖枚举取值（供 node:test 断言，避免页面与枚举漂移） */
export function anonymizationVersionOptionsMatchEnums(): boolean {
  const byColumn = new Map(anonymizationReferenceVersion.fields.map((field) => [field.column, field]));
  const method = byColumn.get('D');
  const answer = byColumn.get('C');
  return !!method && !!answer
    && ANONYMIZATION_METHODS.every((code) => method.options.some((choice) => choice.code === code))
    && ANONYMIZATION_ANSWERS.every((code) => answer.options.some((choice) => choice.code === code))
    && ['E', 'G'].every((column) => {
      const field = byColumn.get(column as AnonymizationFieldCode);
      return !!field && ANONYMIZATION_ANSWERS.every((code) => field.options.some((choice) => choice.code === code));
    });
}
