import clauseSeed from '../../compliance/data/legacy-seed.json';
import { fieldsOf } from './sectionCatalog';
import { CONSENT_FIELDS, CONSENT_BOOLEAN_CODES } from './consent';
import type { SectionVersionStatus } from './versionStatus';

/** 历史别名，与新共享口径等价；新代码请直接使用 SectionVersionStatus */
export type ConsentVersionStatus = SectionVersionStatus;
export type ConsentWidget = 'text' | 'textarea' | 'select';
export type ConsentRequiredness = 'unconfirmed' | 'optional' | 'required';
export type ConsentMatchMode = 'any' | 'all';
export interface ConsentOption { code: string; labelZh: string; labelEn: string; workbookValue: string }
export interface ConsentFieldVersion {
  code: string;
  labelZh: string;
  labelEn: string;
  widget: ConsentWidget;
  group: string;
  requiredness: ConsentRequiredness;
  drivers: string[];
  matchMode: ConsentMatchMode;
  options: ConsentOption[];
}
export interface ConsentFormVersion {
  id: string;
  version: string;
  status: ConsentVersionStatus;
  sourceVersion: string;
  description: string;
  updatedAt: string;
  revision: number;
  fields: ConsentFieldVersion[];
}
export type ConsentIssue = { code: 'version' | 'description' | 'structure' | 'label' | 'drivers' | 'options'; field?: string };

export const CONSENT_CLAUSE_CODES = (clauseSeed.clauses as { code: string }[]).map((item) => item.code);
const catalog = fieldsOf('consent');
const yesNoOptions: ConsentOption[] = CONSENT_BOOLEAN_CODES.map((code) => ({
  code, labelZh: { yes: '是', no: '否', pending: '待定' }[code],
  labelEn: { yes: 'Yes', no: 'No', pending: 'Undetermined' }[code],
  workbookValue: { yes: '是', no: '否', pending: '不确定' }[code],
}));

export const consentReferenceVersion: ConsentFormVersion = {
  id: 'consent-reference-v1', version: 'v1', status: 'current', sourceVersion: '',
  description: '', updatedAt: '', revision: 0,
  fields: CONSENT_FIELDS.map((field) => {
    const source = catalog.find((item) => item.code === field.code);
    return {
      code: field.code, group: field.group,
      labelZh: source?.labelZh ?? field.code, labelEn: source?.labelEn ?? field.code,
      widget: field.kind === 'boolean' ? 'select' : field.kind === 'long' ? 'textarea' : 'text',
      requiredness: 'unconfirmed', drivers: [...(source?.drivers ?? [])], matchMode: 'any',
      options: field.kind === 'boolean' ? structuredClone(yesNoOptions) : [],
    };
  }),
};

const STORAGE_KEY = 'consent-form-drafts:v1';

function isStoredDraft(value: unknown): value is ConsentFormVersion {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ConsentFormVersion>;
  return typeof item.id === 'string' && typeof item.version === 'string' && item.status === 'draft'
    && typeof item.description === 'string' && item.description.length <= 1000
    && typeof item.sourceVersion === 'string' && typeof item.updatedAt === 'string'
    && Number.isInteger(item.revision) && (item.revision ?? -1) >= 0 && Array.isArray(item.fields)
    && item.fields.length === CONSENT_FIELDS.length && item.fields.every((field, index) =>
      field && field.code === CONSENT_FIELDS[index].code && field.group === CONSENT_FIELDS[index].group
      && typeof field.labelZh === 'string' && typeof field.labelEn === 'string'
      && ['text', 'textarea', 'select'].includes(field.widget)
      && ['unconfirmed', 'optional', 'required'].includes(field.requiredness)
      && ['any', 'all'].includes(field.matchMode)
      && Array.isArray(field.drivers) && field.drivers.every((driver) => typeof driver === 'string')
      && Array.isArray(field.options) && field.options.every((option) => option &&
        typeof option.code === 'string' && typeof option.labelZh === 'string'
        && typeof option.labelEn === 'string' && typeof option.workbookValue === 'string'));
}

export function readConsentVersions(): ConsentFormVersion[] {
  if (!import.meta.env.DEV) throw new Error('service-unavailable');
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [consentReferenceVersion];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isStoredDraft)) throw new Error('invalid-drafts');
  return [consentReferenceVersion, ...parsed];
}

export function findConsentVersion(id: string): ConsentFormVersion | undefined {
  return readConsentVersions().find((item) => item.id === id);
}

export function makeConsentDraft(source: ConsentFormVersion, versions: readonly ConsentFormVersion[]): ConsentFormVersion {
  let suffix = 1;
  while (versions.some((item) => item.version === `v1.${suffix}`)) suffix += 1;
  return { ...structuredClone(source), id: crypto.randomUUID(), version: `v1.${suffix}`,
    sourceVersion: source.version, description: source.description, status: 'draft', revision: 0, updatedAt: '' };
}

export function checkConsentDraft(version: ConsentFormVersion): ConsentIssue[] {
  const issues: ConsentIssue[] = [];
  if (!/^v\d+(?:\.\d+){1,2}$/.test(version.version) || version.version.trim().length > 20) issues.push({ code: 'version' });
  if (version.description.length > 100) issues.push({ code: 'description' });
  if (version.fields.length !== CONSENT_FIELDS.length) issues.push({ code: 'structure' });
  for (const [index, field] of version.fields.entries()) {
    const expected = CONSENT_FIELDS[index];
    if (!expected || field.code !== expected.code || field.group !== expected.group) {
      issues.push({ code: 'structure', field: field.code });
      continue;
    }
    if (!field.labelZh.trim() || !field.labelEn.trim()) issues.push({ code: 'label', field: field.code });
    if (field.drivers.length > 3 || new Set(field.drivers).size !== field.drivers.length
      || field.drivers.some((driver) => !CONSENT_CLAUSE_CODES.includes(driver))) issues.push({ code: 'drivers', field: field.code });
    if (field.widget === 'select' && (!field.options.length || field.options.some((option) =>
      !option.code.trim() || !option.labelZh.trim() || !option.labelEn.trim() || !option.workbookValue.trim())
      || new Set(field.options.map((option) => option.code)).size !== field.options.length
      || new Set(field.options.map((option) => option.workbookValue)).size !== field.options.length)) {
      issues.push({ code: 'options', field: field.code });
    }
  }
  return issues;
}

export function saveConsentVersion(version: ConsentFormVersion, expectedRevision: number): ConsentFormVersion {
  if (version.status !== 'draft' || checkConsentDraft(version).length) throw new Error('invalid-draft');
  const drafts = readConsentVersions().filter((item) => item.status === 'draft');
  if (drafts.some((item) => item.id !== version.id && item.version === version.version)) throw new Error('duplicate-version');
  const index = drafts.findIndex((item) => item.id === version.id);
  if ((index < 0 && expectedRevision !== 0) || (index >= 0 && drafts[index].revision !== expectedRevision)) throw new Error('conflict');
  const saved = JSON.parse(JSON.stringify(version)) as ConsentFormVersion;
  saved.updatedAt = new Date().toISOString();
  saved.revision = expectedRevision + 1;
  if (index < 0) drafts.push(saved);
  else drafts[index] = saved;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  return saved;
}
