/**
 * 通用材料（第七分区）—— 功能级资料库。
 *
 * 口径（2026-10-27 用户裁决）：
 * - 一行 = 一个功能（对齐工作簿「通用材料」A 功能编号 / B 功能名称），
 *   材料清单与状态恢复说明按功能维护，同一功能的多份问卷共用一份；
 * - 一份值的三个字段位 C / D / E 见 sectionCatalog.MATERIAL_FIELDS；
 * - 必交字段（C、D）恒参与完成度与提交门禁，备注（E）选填、不计分母；
 * - 本模块只做本地库读写与投影，功能清单由页面从功能台账读取，
 *   以免在 Node 测试环境里引入 IndexedDB 依赖。
 */
import { surveyRecords } from '../../surveys/data/surveys';
import type { SectionKey } from './sectionCatalog';

export const MATERIAL_SECTION: SectionKey = 'materials';

export type MaterialCode = 'C' | 'D' | 'E';

export const MATERIAL_CODES: readonly MaterialCode[] = ['C', 'D', 'E'];

/** 必交字段：材料清单与状态恢复说明（备注不计入完成度） */
export const MATERIAL_REQUIRED_CODES: readonly MaterialCode[] = ['C', 'D'];

/** 单字段长度上限（与分区表单的 500 上限区分：材料清单是分行列举的整段文本） */
export const MATERIAL_MAX_LENGTH = 1000;

const KEY_PREFIX = 'csa-materials:v1';

/** 填写状态：未填写 / 部分填写 / 已填写（= 两个必交字段都有值） */
export type MaterialCompletion = 'empty' | 'partial' | 'complete';

export const MATERIAL_COMPLETIONS: readonly MaterialCompletion[] = ['empty', 'partial', 'complete'];

export type MaterialValues = Record<MaterialCode, string>;

export interface MaterialEntry {
  values: MaterialValues;
  /** 最近保存时间（本地库写入时生成；从未保存为空串） */
  updatedAt: string;
}

/** 通用材料行的功能侧身份（来自功能台账；清单外功能仅有名称与 FuLi ID） */
export interface MaterialFunction {
  fuliId: string;
  functionName: string;
  platformName: string;
  owner: string;
}

export interface MaterialRow extends MaterialFunction {
  /** 功能编号（台账顺序，从 1 起；对齐工作簿 A 列） */
  index: number;
  values: MaterialValues;
  updatedAt: string;
  completion: MaterialCompletion;
}

function storageKey(fuliId: string): string {
  return `${KEY_PREFIX}:${fuliId}`;
}

function emptyValues(): MaterialValues {
  return { C: '', D: '', E: '' };
}

function normalize(raw: unknown): MaterialEntry {
  const entry: MaterialEntry = { values: emptyValues(), updatedAt: '' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return entry;
  const record = raw as { values?: unknown; updatedAt?: unknown };
  if (record.values && typeof record.values === 'object' && !Array.isArray(record.values)) {
    const values = record.values as Record<string, unknown>;
    for (const code of MATERIAL_CODES) {
      const value = values[code];
      if (typeof value === 'string') entry.values[code] = value.slice(0, MATERIAL_MAX_LENGTH);
    }
  }
  if (typeof record.updatedAt === 'string') entry.updatedAt = record.updatedAt;
  return entry;
}

/** 读取一个功能的通用材料；本地库不可用时按未填写处理，不让页面整体失败 */
export function loadMaterialEntry(fuliId: string): MaterialEntry {
  if (!fuliId) return { values: emptyValues(), updatedAt: '' };
  try {
    const raw = localStorage.getItem(storageKey(fuliId));
    return raw ? normalize(JSON.parse(raw) as unknown) : { values: emptyValues(), updatedAt: '' };
  } catch {
    return { values: emptyValues(), updatedAt: '' };
  }
}

export function loadMaterialValues(fuliId: string): MaterialValues {
  return loadMaterialEntry(fuliId).values;
}

/** 按问卷读取：问卷记录只有 FuLi ID，通用材料挂在功能上，故先解析 FuLi ID */
export function loadMaterialValuesOfSurvey(surveyId: string): MaterialValues {
  const record = surveyRecords.find((item) => item.id === surveyId);
  return record ? loadMaterialValues(record.fuliId) : emptyValues();
}

export function saveMaterialValues(fuliId: string, values: Record<string, string>): string {
  if (!fuliId) throw new Error('fuliId-required');
  const next: MaterialEntry = {
    values: Object.fromEntries(MATERIAL_CODES.map((code) => [code, (values[code] ?? '').slice(0, MATERIAL_MAX_LENGTH)])) as MaterialValues,
    updatedAt: nowText(),
  };
  localStorage.setItem(storageKey(fuliId), JSON.stringify(next));
  return next.updatedAt;
}

function nowText(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 两个必交字段都有值才算已填写；只填了一部分（含只填备注）为部分填写 */
export function materialCompletion(values: Partial<Record<MaterialCode, string>>): MaterialCompletion {
  const filled = MATERIAL_REQUIRED_CODES.filter((code) => (values[code] ?? '').trim()).length;
  if (filled === MATERIAL_REQUIRED_CODES.length) return 'complete';
  return MATERIAL_CODES.some((code) => (values[code] ?? '').trim()) ? 'partial' : 'empty';
}

/** 材料清单条数：按非空行计数（工作簿单格内分行列举） */
export function materialChecklistCount(text: string | undefined): number {
  return (text ?? '').split(/\r?\n/).filter((line) => line.trim()).length;
}

export function materialRows(functions: MaterialFunction[]): MaterialRow[] {
  return functions.map((item, position) => {
    const entry = loadMaterialEntry(item.fuliId);
    return {
      ...item,
      index: position + 1,
      values: entry.values,
      updatedAt: entry.updatedAt,
      completion: materialCompletion(entry.values),
    };
  });
}

/**
 * 清单外功能：问卷记录里存在、功能台账中已删除或缺失的 FuLi ID。
 * 这些功能的通用材料仍可查看与维护，附在台账功能之后，功能编号续排。
 */
export function offLedgerFunctions(ledgerFuliIds: ReadonlySet<string>): MaterialFunction[] {
  const seen = new Map<string, MaterialFunction>();
  for (const record of surveyRecords) {
    if (!record.fuliId || ledgerFuliIds.has(record.fuliId) || seen.has(record.fuliId)) continue;
    seen.set(record.fuliId, {
      fuliId: record.fuliId,
      functionName: record.functionName,
      platformName: '',
      owner: record.owner,
    });
  }
  return [...seen.values()];
}
