/**
 * 通用材料 · 表单版本。
 *
 * 版本 = 该分区 3 个业务字段的配置快照（中英文字段名、必填规则）。
 * 列位、组件类型与字数上限由标准固定，版本内不可改；已启用版本随标准字段集
 * 固定在 v1.0，草稿只用于字段维护核对，不改动已填记录与完成度判定
 * （与生物特征与口令、匿名化等分区的版本模型同构）。
 */
import type { MaterialCode } from './materials';
import type { SectionVersionStatus } from './versionStatus';

export const MATERIAL_FIELD_CODES: readonly MaterialCode[] = ['C', 'D', 'E'];

export type MaterialWidget = 'long';
export type MaterialRequiredness = 'unconfirmed' | 'optional' | 'required';

export interface MaterialFieldDefinition {
  column: MaterialCode;
  /** 字段在工作簿分区的原始表头（只读口径，用于核对列位） */
  header: string;
  labelZh: string;
  labelEn: string;
  widget: MaterialWidget;
  requiredness: MaterialRequiredness;
  maxLength: number;
}

export interface MaterialFormVersion {
  id: string;
  version: string;
  /** current = 现行版本（原「已启用」口径）；draft = 本机维护中的草稿 */
  status: SectionVersionStatus;
  sourceVersion: string;
  description: string;
  updatedAt: string;
  revision: number;
  fields: MaterialFieldDefinition[];
}

/** 表头原文：取自工作簿「通用材料」C–E 列 */
const HEADERS: Record<MaterialCode, string> = {
  C: '需提供的测试材料清单',
  D: '状态恢复/变更方法说明',
  E: '备注',
};

const MATERIAL_FIELD_MAX_LENGTH = 1000;

const definitions = (): MaterialFieldDefinition[] => [
  { column: 'C', header: HEADERS.C, labelZh: '需提供的测试材料清单', labelEn: 'Required test materials', widget: 'long', requiredness: 'required', maxLength: MATERIAL_FIELD_MAX_LENGTH },
  { column: 'D', header: HEADERS.D, labelZh: '状态恢复/变更方法说明', labelEn: 'State restore / change method', widget: 'long', requiredness: 'required', maxLength: MATERIAL_FIELD_MAX_LENGTH },
  { column: 'E', header: HEADERS.E, labelZh: '备注', labelEn: 'Notes', widget: 'long', requiredness: 'optional', maxLength: MATERIAL_FIELD_MAX_LENGTH },
];

/** 当前生效版本（标准字段集 v1.0） */
export const activeMaterialsVersion: MaterialFormVersion = {
  id: 'materials-active-v1',
  version: 'v1.0',
  status: 'current',
  sourceVersion: '',
  description: '通用材料分区标准字段集',
  updatedAt: '',
  revision: 0,
  fields: definitions(),
};

const STORAGE_KEY = 'csa-materials-form-drafts:v1';

function isStoredVersion(value: unknown): value is MaterialFormVersion {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<MaterialFormVersion>;
  return typeof item.id === 'string' && typeof item.version === 'string' && item.status === 'draft'
    && typeof item.sourceVersion === 'string' && typeof item.description === 'string'
    && typeof item.updatedAt === 'string' && Number.isInteger(item.revision)
    && Array.isArray(item.fields) && item.fields.length === MATERIAL_FIELD_CODES.length
    && item.fields.every((field, index) => field
      && field.column === MATERIAL_FIELD_CODES[index]
      && field.header === activeMaterialsVersion.fields[index].header
      && field.widget === 'long'
      && field.maxLength === MATERIAL_FIELD_MAX_LENGTH
      && typeof field.labelZh === 'string' && typeof field.labelEn === 'string'
      && ['unconfirmed', 'optional', 'required'].includes(field.requiredness));
}

export function readMaterialsVersions(): MaterialFormVersion[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [activeMaterialsVersion];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isStoredVersion)) throw new Error('invalid-drafts');
  return [activeMaterialsVersion, ...parsed];
}

export function findMaterialsVersion(id: string): MaterialFormVersion | undefined {
  return readMaterialsVersions().find((version) => version.id === id);
}

export function makeMaterialsDraft(source: MaterialFormVersion, versions: readonly MaterialFormVersion[]): MaterialFormVersion {
  let number = 1;
  while (versions.some((item) => item.version === `v1.${number}`)) number += 1;
  const draft = structuredClone(source) as MaterialFormVersion;
  return {
    ...draft,
    id: crypto.randomUUID(),
    version: `v1.${number}`,
    status: 'draft',
    sourceVersion: source.version,
    description: '',
    updatedAt: '',
    revision: 0,
  };
}

export type MaterialIssueCode = 'version' | 'description' | 'label' | 'source';

export interface MaterialIssue {
  code: MaterialIssueCode;
  column?: MaterialCode;
}

export function checkMaterialsDraft(version: MaterialFormVersion): MaterialIssue[] {
  const issues: MaterialIssue[] = [];
  if (!/^v\d+(?:\.\d+){1,2}$/.test(version.version.trim()) || version.version.trim().length > 20) issues.push({ code: 'version' });
  if (version.description.length > 100) issues.push({ code: 'description' });
  if (version.fields.length !== MATERIAL_FIELD_CODES.length) issues.push({ code: 'source' });
  for (const [index, field] of version.fields.entries()) {
    const base = activeMaterialsVersion.fields[index];
    if (!base || field.column !== MATERIAL_FIELD_CODES[index]
      || field.header !== base.header || field.widget !== base.widget || field.maxLength !== base.maxLength) {
      issues.push({ code: 'source', column: field.column });
    }
    if (!field.labelZh.trim() || !field.labelEn.trim()) issues.push({ code: 'label', column: field.column });
  }
  return issues;
}

export function saveMaterialsDraft(version: MaterialFormVersion, expectedRevision: number): MaterialFormVersion {
  if (version.status !== 'draft' || checkMaterialsDraft(version).length) throw new Error('invalid-draft');
  const drafts = readMaterialsVersions().filter((item) => item.status === 'draft');
  if (drafts.some((item) => item.version === version.version && item.id !== version.id)) throw new Error('duplicate-version');
  const index = drafts.findIndex((item) => item.id === version.id);
  if ((index < 0 && expectedRevision !== 0) || (index >= 0 && drafts[index].revision !== expectedRevision)) {
    throw new Error('conflict');
  }
  // 编辑器传入的是 Vue 代理对象，只把纯 JSON 元数据写入存储
  const saved = JSON.parse(JSON.stringify(version)) as MaterialFormVersion;
  saved.revision = expectedRevision + 1;
  saved.updatedAt = new Date().toISOString();
  if (index < 0) drafts.push(saved);
  else drafts[index] = saved;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  return saved;
}

/** 版本草稿与标准字段集的差异项数（版本编辑页的核对提示） */
export function materialsVersionDiff(version: MaterialFormVersion): number {
  return version.fields.reduce((total, field, index) => {
    const base = activeMaterialsVersion.fields[index];
    if (!base) return total + 1;
    const changed = field.labelZh !== base.labelZh || field.labelEn !== base.labelEn
      || field.requiredness !== base.requiredness;
    return total + (changed ? 1 : 0);
  }, 0);
}
