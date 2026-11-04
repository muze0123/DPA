/**
 * 条款 ↔ 测试方法映射（2026-11-02 用户裁决：独立功能模块，本平台维护）。
 *
 * 背景：安全技术要求条款来自天枢「标准库」、安全需求来自天枢「安全需求」，但条款与
 * 第 9 章测试方法的关联关系基于 GB 44464 标准文档（第 6 章 → 第 9 章映射），天枢侧不维护，
 * 改为在本平台先行维护；创建规则选择「标准库」来源后，各条款测试方法自动回显、无需再配置。
 *
 * 默认映射 = `产品需求/GB44464_需求文档/GB44464_静态.xlsx`「需求数据」工作簿
 * 「第9章段落」列 + 「测试方法」列（与「需求筛选」工作簿 C/D 列一致，源自标准文档）：
 * 38 条条款 → 38 个测试方法（9.4.1 / 9.5.3 / 9.8.4 三条段落被多条条款共用，描述逐条不同）。
 *
 * 存储：`test-method-mappings:v1`，值 = `Record<条款号, 测试方法引用值>`（全量 38 键）。
 * 修改即时生效于**后续新建的规则**；已保存规则持有保存时的快照（RuleVersion.testMethods），不受影响。
 */
import { CLAUSES } from '../../surveys/data/matching';
import { defaultTestMethodOf, testMethodOptions } from './testMethods';

const STORAGE_KEY = 'test-method-mappings:v1';

/** 全部测试方法引用值集合（保存/导入校验用） */
const METHOD_VALUES = new Set(testMethodOptions().map((item) => item.value));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 归一存储数据：仅保留合法条款键、值必须在天枢-标准库测试方法候选内，缺失键回落默认映射 */
function normalize(raw: unknown): Record<string, string> {
  const stored = isRecord(raw) ? raw : {};
  return Object.fromEntries(CLAUSES.map((clause) => {
    const value = stored[clause.no];
    const valid = typeof value === 'string' && METHOD_VALUES.has(value);
    return [clause.no, valid ? value : (defaultTestMethodOf(clause.no) ?? '')];
  }));
}

/** 当前映射（全量 38 键；无存储/存储损坏时回落标准默认映射） */
export function readTestMethodMappings(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '');
    return normalize(raw);
  } catch {
    return normalize(null);
  }
}

function persist(mappings: Record<string, string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
}

export interface TestMethodMappingRow {
  /** 条款号 */
  readonly no: string;
  /** 当前映射的测试方法引用值 */
  readonly testMethod: string;
  /** 是否仍为标准默认映射（未被人工调整） */
  readonly isDefault: boolean;
}

/** 维护页行模型：38 行，条款目录顺序 */
export function testMethodMappingRows(): TestMethodMappingRow[] {
  const mappings = readTestMethodMappings();
  return CLAUSES.map((clause) => ({
    no: clause.no,
    testMethod: mappings[clause.no] ?? '',
    isDefault: (mappings[clause.no] ?? '') === (defaultTestMethodOf(clause.no) ?? ''),
  }));
}

/** 单条款当前映射值（规则配置页回显用） */
export function testMethodMappingOf(no: string): string {
  return readTestMethodMappings()[no] ?? '';
}

/** 单条款人工调整；值非法（不在标准库候选内）时抛错，调用方 toast */
export function saveTestMethodMapping(no: string, value: string): void {
  if (!METHOD_VALUES.has(value)) throw new Error(`测试方法未登记: ${value}`);
  const mappings = readTestMethodMappings();
  mappings[no] = value;
  persist(mappings);
}

/** 单行恢复标准默认映射 */
export function resetTestMethodMapping(no: string): void {
  const mappings = readTestMethodMappings();
  const fallback = defaultTestMethodOf(no);
  if (fallback) mappings[no] = fallback;
  persist(mappings);
}

/** 全部恢复标准默认映射 */
export function resetAllTestMethodMappings(): void {
  persist(normalize(null));
}
