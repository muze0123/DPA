import clauseSeed from '../../compliance/data/legacy-seed.json';
import { fieldsOf } from './sectionCatalog';
import type { SectionVersionStatus } from './versionStatus';

export const TRANSMISSION_FIELD_CODES = ['C', 'D', 'E', 'F', 'G'] as const;
export type TransmissionFieldCode = typeof TRANSMISSION_FIELD_CODES[number];
export type TransmissionRequiredness = 'unconfirmed' | 'optional' | 'required';
export type TransmissionWidget = 'select' | 'text' | 'summary';

export interface TransmissionFieldVersion {
  code: TransmissionFieldCode;
  labelZh: string;
  labelEn: string;
  widget: TransmissionWidget;
  requiredness: TransmissionRequiredness;
  drivers: string[];
  /** F/G cannot be configured as manual inputs until item-level mapping is approved. */
  source: 'manual' | 'aggregation-pending';
}

export interface TransmissionFormVersion {
  id: string;
  version: string;
  status: SectionVersionStatus;
  sourceVersion: string;
  description?: string;
  updatedAt: string;
  revision: number;
  fields: TransmissionFieldVersion[];
}

export type TransmissionVersionIssue = { code: 'version' | 'label' | 'drivers' | 'structure' | 'description'; field?: TransmissionFieldCode };

const STORAGE_KEY = 'transmission-form-drafts:v1';
export const TRANSMISSION_CLAUSE_CODES = (clauseSeed.clauses as { code: string }[]).map((clause) => clause.code);
const catalog = fieldsOf('transmission');

export const transmissionReferenceVersion: TransmissionFormVersion = {
  id: 'transmission-reference-v1', version: 'v1', status: 'current',
  sourceVersion: 'GB44464_静态.xlsx', description: '', updatedAt: '', revision: 0,
  fields: TRANSMISSION_FIELD_CODES.map((code) => {
    const field = catalog.find((item) => item.code === code)!;
    return {
      code, labelZh: field.labelZh, labelEn: field.labelEn,
      widget: code === 'F' || code === 'G' ? 'summary' : code === 'E' ? 'text' : 'select',
      requiredness: 'unconfirmed', drivers: [...field.drivers],
      source: code === 'F' || code === 'G' ? 'aggregation-pending' : 'manual',
    };
  }),
};

function isStoredDraft(value: unknown): value is TransmissionFormVersion {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<TransmissionFormVersion>;
  return typeof item.id === 'string' && typeof item.version === 'string' && item.status === 'draft'
    && typeof item.sourceVersion === 'string' && typeof item.updatedAt === 'string'
    && (item.description === undefined || typeof item.description === 'string')
    && Number.isInteger(item.revision) && Array.isArray(item.fields)
    && item.fields.length === TRANSMISSION_FIELD_CODES.length
    && item.fields.every((field, index) => field && field.code === TRANSMISSION_FIELD_CODES[index]
      && typeof field.labelZh === 'string' && typeof field.labelEn === 'string'
      && ['select', 'text', 'summary'].includes(field.widget)
      && ['unconfirmed', 'optional', 'required'].includes(field.requiredness)
      && ['manual', 'aggregation-pending'].includes(field.source)
      && Array.isArray(field.drivers) && field.drivers.every((driver) => typeof driver === 'string'));
}

export function readTransmissionVersions(): TransmissionFormVersion[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [transmissionReferenceVersion];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isStoredDraft)) throw new Error('invalid-drafts');
  return [transmissionReferenceVersion, ...parsed];
}

export function findTransmissionVersion(id: string): TransmissionFormVersion | undefined {
  return readTransmissionVersions().find((version) => version.id === id);
}

export function makeTransmissionDraft(source: TransmissionFormVersion): TransmissionFormVersion {
  const versions = readTransmissionVersions();
  let suffix = 1;
  while (versions.some((item) => item.version === `v1.${suffix}`)) suffix += 1;
  return {
    ...structuredClone(source), id: crypto.randomUUID(), version: `v1.${suffix}`,
    status: 'draft', sourceVersion: source.version, updatedAt: '', revision: 0,
  };
}

export function checkTransmissionDraft(version: TransmissionFormVersion): TransmissionVersionIssue[] {
  const issues: TransmissionVersionIssue[] = [];
  if (!/^v\d+(?:\.\d+){1,2}$/.test(version.version) || version.version.trim().length > 20) issues.push({ code: 'version' });
  if ((version.description ?? '').length > 100) issues.push({ code: 'description' });
  if (version.fields.length !== TRANSMISSION_FIELD_CODES.length) issues.push({ code: 'structure' });
  for (const [index, field] of version.fields.entries()) {
    const expected = transmissionReferenceVersion.fields[index];
    if (!expected || field.code !== expected.code || field.source !== expected.source || field.widget !== expected.widget
      || (field.source === 'aggregation-pending' && JSON.stringify(field) !== JSON.stringify(expected))) {
      issues.push({ code: 'structure', field: field.code });
      continue;
    }
    if (!field.labelZh.trim() || !field.labelEn.trim()) issues.push({ code: 'label', field: field.code });
    if (field.drivers.length > 3 || new Set(field.drivers).size !== field.drivers.length
      || field.drivers.some((driver) => !TRANSMISSION_CLAUSE_CODES.includes(driver))) {
      issues.push({ code: 'drivers', field: field.code });
    }
  }
  return issues;
}

export function saveTransmissionVersion(version: TransmissionFormVersion, expectedRevision: number): TransmissionFormVersion {
  if (version.status !== 'draft' || checkTransmissionDraft(version).length) throw new Error('invalid-draft');
  const drafts = readTransmissionVersions().filter((item) => item.status === 'draft');
  if (drafts.some((item) => item.id !== version.id && item.version === version.version)) throw new Error('duplicate-version');
  const index = drafts.findIndex((item) => item.id === version.id);
  if ((index < 0 && expectedRevision !== 0) || (index >= 0 && drafts[index].revision !== expectedRevision)) throw new Error('conflict');
  const saved = JSON.parse(JSON.stringify(version)) as TransmissionFormVersion;
  saved.revision = expectedRevision + 1;
  saved.updatedAt = new Date().toISOString();
  if (index < 0) drafts.push(saved);
  else drafts[index] = saved;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  return saved;
}
