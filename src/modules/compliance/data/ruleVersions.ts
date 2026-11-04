/**
 * 规则管理（2026-10-29 更名自「条款规则」，菜单一级）：条款 × 问题的映射规则。
 *
 * 模型（与需求原文对齐）：
 * - 条款清单恒为 GB 44464 的 38 条，条款原文取标准层（天枢-标准库），规则**不**增删条款；
 * - 一份规则 = ① 题目集合 questionSet（题号 code 全局唯一，2026-11-01 起 Q01 稳定标识下线）＋
 *   ② 38 条款的映射表达式 expressions（code 书写、或/且逻辑），即 DPA 平台按业务场景构建的
 *   「问题-条款映射关系」；
 * - 状态两态：待提交 draft / 已发布 published（2026-10-29 用户裁决，去掉「已停用」）。
 *   停用语义由「是否启用」开关（enabled）承载：停用规则不进新建问卷候选，历史问卷不受影响；
 * - 全部状态支持原地【编辑】（2026-10-29 用户裁决，版本号不变）。已发布规则保存即重新发布
 *   生效，由调用方触发「绑定此规则且匹配审批未通过的问卷」按新规则重算自动初筛
 *   （matching.autoResults），人工确认值保留；匹配审批已通过（已锁定）的问卷不受影响；
 * - 删除 = 硬删除：被进行中问卷引用的规则由调用方守卫拒绝；历史问卷按创建快照冻结可追溯；
 * - 标准来源 = 天枢-标准库（'标准编号-标准名称'）；问题来源 = 问题库（'问题库编号-问题库名称'）；
 *   安全需求 = 天枢「安全需求」模块（'安全需求编号-安全需求名称'，2026-11-01 编号化口径），
 *   均为下拉引用值；
 * - 规则编号 ruleNo（2026-11-01 用户裁决）：业务编号（'RULE-YYYY-###'，新建可改、编辑只读），
 *   与内部主键 id 正交——id 仍是存储键 / 路由参数 / 问卷快照引用，列表「规则编号」列展示 ruleNo。
 *
 * 依赖方向：本模块 → matching.ts（CLAUSES 只在懒初始化时读取）+ standard.ts（标准库候选，
 * 叶子模块）+ safetyRequirements.ts（安全需求候选，叶子模块）→ 无环；matching.ts 在函数内
 * 调用本模块解析快照版本（ESM 循环安全：顶层不互读）。
 */
import { reactive } from 'vue';
import { CLAUSES, type ClauseDef } from '../../surveys/data/matching';
import { ITEM_CATALOG } from '../../surveys/data/items';
import { STANDARD_DOC } from './standard';
import { normalizeSafetyRequirementValue, safetyRequirementOptions } from './safetyRequirements';
import { LEGACY_RULE_IDS } from './rules';
import { CLAUSE_SECTIONS, type ClauseSectionRef } from './clauseSections';
import type { SectionKey } from '../../sections/data/sectionCatalog';
import { safetyRequirementEntryById } from './safetyRequirementEntries';
import { requirementFilterEntryById } from './requirementFilterEntries';

export type RuleVersionStatus = 'draft' | 'published';
export const RULE_VERSION_STATUSES: readonly RuleVersionStatus[] = ['draft', 'published'];

export interface RuleVersionExpression {
  /** 映射表达式（题号书写，如 OR(Q1,Q5)；AND/OR 嵌套，即「或/且」逻辑规则） */
  expr: string;
  /** 中文可读式（如「Q1 或 Q5」） */
  exprReadable: string;
}

/**
 * 条款分区分配（2026-11-01 用户裁决：新建规则默认两项皆空，由提交校验拦截）：
 * section 为空串表示该条款尚未选择分区表单，此时字段位不可选。
 */
export interface ClauseSectionDraft {
  section: SectionKey | '';
  field: string;
}

export interface RuleVersion {
  id: string;
  /** 规则编号（2026-11-01 用户裁决）：业务编号 'RULE-YYYY-###'，列表展示与关键词筛选用；id 仍为存储键/路由参数 */
  ruleNo: string;
  name: string;
  status: RuleVersionStatus;
  /**
   * 是否启用（2026-10-29 用户裁决）：主数据开关，与「待提交/已发布」状态正交，承载「停用」语义；
   * 缺省视为启用（`!== false`），兼容无此字段的存量数据。
   * 停用的规则不出现在新建问卷候选中，历史问卷引用不受影响。
   */
  enabled?: boolean;
  /** 标准来源（天枢-标准库，下拉引用）：'标准编号-标准名称' */
  standardSource: string;
  /** 问题来源（问题库，下拉引用）：'问题库编号-问题库名称' */
  questionSource: string;
  /** 安全需求（天枢「安全需求」模块，下拉引用）：'安全需求编号-安全需求名称'（SR-###-名称） */
  safetyRequirement: string;
  /** 测试方法来源（天枢-标准库第 9 章，下拉引用）：'来源编号-来源名称'；选填，缺省空串 */
  testMethod?: string;
  /** 规则说明（自由文本，限 100 字，选填） */
  note: string;
  /** 该规则参与作答的题目（code = 表达式引用并集 ∪ checkCodes）；表达式操作数必须都在集合内 */
  questionSet: string[];
  /**
   * 合规性题（2026-11-01 用户裁决）：只作答、不参与适用范围判定。
   * 起因——「是否已展示处理规则」这类题答「否」本应是缺陷，若用于判范围会把缺陷移出检查范围；
   * 故这类题从触发表达式中剥离，留在题集里继续作答，适用范围由存在性题（是否涉及…）决定。
   */
  checkCodes?: string[];
  /** 条款号 → 映射表达式；缺省条款回退现行表达式 */
  expressions: Record<string, RuleVersionExpression>;
  /**
   * 条款号 → 安全需求条目映射（'SR-###' 引用值，2026-11-01 用户裁决：一个单元格 = 一个条目）：
   * 一份条款可挂多条安全需求（1:N）。显式空数组 = 该条款未配置（不回退默认）；
   * 字段缺省（存量数据无此字段）才回退条目目录默认值（`effectiveRequirementItems`），不回写。
   */
  requirementItems?: Record<string, string[]>;
  /**
   * 条款号 → 填写分区/字段位映射（2026-11 新建规则子页面）：一份条款一个分区一个字段位。
   * 显式空（section 为空）= 该条款未配置（不回退默认）；字段缺省才回退「需求筛选」现行映射。
   */
  sectionAssignments?: Record<string, ClauseSectionDraft>;
  /**
   * 条款号 → 测试方法引用值（2026-11-01 用户裁决：条款内「测试方法」配置区块，1:N）：
   * 数据源天枢-标准库第 9 章测试方法（'第9章段落号-测试方法名称'）；
   * 字段缺省时回退标准映射（`defaultTestMethodOf`），新建规则预填该默认值。
   */
  testMethods?: Record<string, string>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

const STORAGE_KEY = 'rule-versions:v3';

function nowText(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 标准来源候选（天枢-标准库）：'标准编号-标准名称'。标准库数据源在本演示中为 GB 44464 单一标准。 */
export function standardSourceOptions(): string[] {
  return [`${STANDARD_DOC.code}-${STANDARD_DOC.title}`];
}
/** 现行规范注册为首份规则：映射表达式取自判定内核的 38 条款（含追加判定维度后的最终式）；题集由表达式派生 */
function seedV1(): RuleVersion {
  const expressions: Record<string, RuleVersionExpression> = {};
  for (const clause of CLAUSES) {
    expressions[clause.no] = { expr: clause.expr, exprReadable: clause.exprReadable };
  }
  return {
    id: 'v1',
    ruleNo: 'RULE-2026-001',
    name: 'GB 44464 条款触发规则（草案 2026-07-03）',
    status: 'published',
    enabled: true,
    standardSource: standardSourceOptions()[0],
    // 演示种子：题目内容源 = 基线问题库（与 templates 种子 TPL-2026-001 对应）
    questionSource: 'TPL-2026-001-GB 44464 基础问卷',
    // 演示种子：安全需求引用天枢「安全需求」模块首个可引用条目（6.1.1-2）
    safetyRequirement: safetyRequirementOptions()[0] ?? '',
    note: '按 GB 44464 草案构建的基线条款映射规则，覆盖 38 条条款的自动初筛判定。',
    questionSet: questionSetOf(expressions),
    checkCodes: [...DEFAULT_CHECK_CODES],
    expressions,
    requirementItems: fullRequirementItems(),
    sectionAssignments: fullSectionAssignments(),
    testMethods: fullTestMethods(),
    createdBy: '系统',
    createdAt: '2026-07-03 00:00:00',
    updatedAt: '2026-07-03 00:00:00',
    updatedBy: '系统',
  };
}

/**
 * 存量数据迁移（2026-10-29 模型收口）：
 * - 「已停用」状态取消 → 归并为 已发布 + 是否启用=否；
 * - 单一 `source` 自由文本 → 标准来源（问题来源无法回溯，置空待补）；
 * - 新增 createdBy（缺省回填更新人）与 enabled（缺省启用）；
 * - 新增 ruleNo（缺省按内部主键序号回填 'RULE-YYYY-###'）。
 */
function fallbackRuleNo(id: string, createdAt?: string): string {
  const seq = Number(String(id).replace(/\D/g, '')) || 1;
  const year = Number(String(createdAt ?? '').slice(0, 4)) || new Date().getFullYear();
  return `RULE-${year}-${String(seq).padStart(3, '0')}`;
}

function normalizeRuleVersion(entry: unknown): RuleVersion | null {
  if (!entry || typeof entry !== 'object') return null;
  const raw = entry as Partial<RuleVersion> & { source?: string };
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || typeof raw.expressions !== 'object' || raw.expressions === null) return null;
  const rawStatus = raw.status as string | undefined;
  const retired = rawStatus === 'retired';
  const status: RuleVersionStatus = retired || rawStatus === 'published' ? 'published' : 'draft';
  return {
    id: raw.id,
    // 规则编号：存量无此字段按内部主键序号回填 'RULE-YYYY-###'（年份取创建时间，缺省取当前年）；
    // 安全需求引用值按 2026-11-01 编号化口径迁移（'条目号-摘要' → 'SR-###-摘要'）
    ruleNo: typeof raw.ruleNo === 'string' && raw.ruleNo.trim()
      ? raw.ruleNo
      : fallbackRuleNo(raw.id, raw.createdAt),
    name: raw.name,
    status,
    enabled: retired ? false : raw.enabled ?? true,
    standardSource: raw.standardSource ?? raw.source ?? '',
    questionSource: raw.questionSource ?? '',
    safetyRequirement: normalizeSafetyRequirementValue(raw.safetyRequirement ?? ''),
    testMethod: typeof raw.testMethod === 'string' ? raw.testMethod : '',
    note: typeof raw.note === 'string' ? raw.note.slice(0, 100) : '',
    questionSet: Array.isArray(raw.questionSet) ? raw.questionSet : [],
    checkCodes: Array.isArray(raw.checkCodes) ? raw.checkCodes.map(String) : [...DEFAULT_CHECK_CODES],
    expressions: raw.expressions as Record<string, RuleVersionExpression>,
    requirementItems: raw.requirementItems && typeof raw.requirementItems === 'object' ? raw.requirementItems : undefined,
    sectionAssignments: raw.sectionAssignments && typeof raw.sectionAssignments === 'object' ? raw.sectionAssignments : undefined,
    // 兼容存量数组格式（Round H 曾按 string[] 存储）：归一为单值，取首个元素
    testMethods: raw.testMethods && typeof raw.testMethods === 'object'
      ? Object.fromEntries(Object.entries(raw.testMethods as Record<string, unknown>).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? (value[0] as string) : '',
      ]))
      : undefined,
    createdBy: raw.createdBy ?? raw.updatedBy ?? '系统',
    createdAt: raw.createdAt ?? '',
    updatedAt: raw.updatedAt ?? '',
    updatedBy: raw.updatedBy ?? '系统',
  };
}

function isRuleVersionArray(value: unknown): value is RuleVersion[] {
  return Array.isArray(value) && value.every((entry) =>
    entry && typeof entry.id === 'string' && typeof entry.name === 'string'
    && RULE_VERSION_STATUSES.includes(entry.status)
    && Array.isArray(entry.questionSet) && typeof entry.expressions === 'object' && entry.expressions !== null);
}

function loadLocal(): RuleVersion[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Array.isArray(raw)) {
      const normalized = raw.map(normalizeRuleVersion).filter((entry): entry is RuleVersion => entry !== null);
      if (isRuleVersionArray(normalized)) return normalized;
    }
  } catch { /* Storage is optional for this local preview. */ }
  return [];
}

function persist(): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ruleVersions)); } catch { /* optional */ }
}

let seeded = false;
function ensureSeeded(): void {
  if (seeded) return;
  seeded = true;
  const local = loadLocal();
  if (local.length) {
    ruleVersions.push(...local);
    return;
  }
  const v1 = seedV1();
  ruleVersions.push(v1);
  persist();
}

export const ruleVersions = reactive<RuleVersion[]>([]);

/* ------------------------------------------------------------------ 查询 */

/** 历史绑定别名归并：v1.0.0 / v1.1.0 / v1.2.0 → v1 */
export function legacyRuleVersionId(id?: string | null): string | undefined {
  if (!id) return undefined;
  if ((LEGACY_RULE_IDS as readonly string[]).includes(id)) return 'v1';
  return id;
}

export function getRuleVersion(id?: string | null): RuleVersion | null {
  ensureSeeded();
  const resolved = legacyRuleVersionId(id);
  if (!resolved) return null;
  return ruleVersions.find((version) => version.id === resolved) ?? null;
}

/** 规则清单（懒初始化种子；列表页/页面消费方统一走这里，避免直接读数组漏触发种子） */
export function listRuleVersions(): readonly RuleVersion[] {
  ensureSeeded();
  return ruleVersions;
}

/** 缺省绑定：第一份「已发布且启用」的规则（兜底恒有值，供历史快照解析回落） */
export function defaultRuleVersionId(): string {
  ensureSeeded();
  return ruleVersions.find((version) => version.status === 'published' && isRuleVersionEnabled(version))?.id ?? 'v1';
}

/** 启用判定：缺省启用（存量数据无此字段），仅显式 false 视为停用 */
export function isRuleVersionEnabled(version: RuleVersion): boolean {
  return version.enabled !== false;
}

/** 新建问卷可选：仅「已发布且启用」的规则 */
export function publishedRuleVersions(): RuleVersion[] {
  ensureSeeded();
  return ruleVersions.filter((version) => version.status === 'published' && isRuleVersionEnabled(version));
}

/** 问卷创建选用校验：必须指向「已发布且启用」的规则（历史别名放行到 v1） */
export function ruleVersionUsable(id?: string | null): boolean {
  const version = getRuleVersion(id);
  return Boolean(version && version.status === 'published' && isRuleVersionEnabled(version));
}

export function ruleVersionLabel(id?: string | null): string {
  return getRuleVersion(id)?.name ?? legacyRuleVersionId(id) ?? id ?? '—';
}

/**
 * 按规则解析条款表：静态条款数据（原文/章节/条目数/分组）取自判定内核，
 * 仅映射表达式（expr/exprReadable/hits/qids）被规则覆盖；未知或未配置的条款回退现行表达式。
 */
export function clausesForVersion(versionId?: string | null): ClauseDef[] {
  ensureSeeded();
  const version = getRuleVersion(versionId);
  if (!version) return [...CLAUSES];
  return CLAUSES.map((clause) => {
    const override = version.expressions[clause.no];
    if (!override || !override.expr || override.expr === clause.expr) return clause;
    const hits = [...new Set(override.expr.match(/Q\d+/g) ?? [])];
    return {
      ...clause,
      expr: override.expr,
      exprReadable: override.exprReadable || clause.exprReadable,
      hits,
    };
  });
}

/* ------------------------------------------------------------------ 校验与增删改查 */

/** 表达式语法校验（与判定内核同文法：Q1 | NOT(…) | AND(…) | OR(…)；深度≤5，叶子≤12） */
export function validateExpressionSyntax(expr: string): string | null {
  const text = expr.replace(/\s+/g, '');
  let cursor = 0;
  let leaves = 0;
  function read(depth: number): string | null {
    if (depth > 5) return 'depth';
    const token = /^Q\d+/.exec(text.slice(cursor));
    if (token) {
      cursor += token[0].length;
      leaves += 1;
      if (leaves > 12) return 'leaves';
      return null;
    }
    // 否定：NOT(expr)——只允许一个操作数（判定内核按单目求值）
    if (/^NOT\(/.test(text.slice(cursor))) {
      cursor += 4;
      const error = read(depth + 1);
      if (error) return error;
      if (text[cursor] !== ')') return 'syntax';
      cursor += 1;
      return null;
    }
    const operation = /^(AND|OR)\(/.exec(text.slice(cursor));
    if (!operation) return 'syntax';
    cursor += operation[0].length;
    let children = 0;
    while (true) {
      const error = read(depth + 1);
      if (error) return error;
      children += 1;
      if (text[cursor] === ',') { cursor += 1; continue; }
      break;
    }
    if (children < 2 || text[cursor] !== ')') return 'syntax';
    cursor += 1;
    return null;
  }
  const error = read(1);
  if (error) return error;
  return cursor === text.length ? null : 'syntax';
}

/** 合规性题默认集合：Q2 展示规则 / Q10 匿名化 / Q11 账号删除（存量种子口径） */
export const DEFAULT_CHECK_CODES: readonly string[] = ['Q2', 'Q10', 'Q11'];

/** 规则题集（派生）：表达式引用到的题号 ∪ 合规性题，按题号数值序稳定排序 */
export function questionSetOf(
  expressions: Record<string, RuleVersionExpression>,
  checkCodes: readonly string[] = DEFAULT_CHECK_CODES,
): string[] {
  const codes = new Set<string>(expressionCodesOf(expressions));
  for (const code of checkCodes) codes.add(code);
  return [...codes].sort(byQuestionNo);
}

/** 题号排序：按数值（Q2 < Q10），避免字典序把 Q10 排在 Q2 前 */
export function byQuestionNo(left: string, right: string): number {
  const a = Number(left.replace(/^Q/, ''));
  const b = Number(right.replace(/^Q/, ''));
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  return left.localeCompare(right);
}

/** 表达式引用到的题号并集，按题号数值序稳定排序 */
export function expressionCodesOf(expressions: Record<string, RuleVersionExpression>): string[] {
  const codes = new Set<string>();
  for (const expression of Object.values(expressions)) {
    for (const code of expression.expr?.match(/Q\d+/g) ?? []) codes.add(code);
  }
  return [...codes].sort(byQuestionNo);
}

/* ------------------------------------------------------------------ 映射默认值与有效值（2026-11 新建规则子页面） */

/** 条款的安全需求条目默认值：条目目录中该条款的全部 requirement 条目（'条目号-摘要'） */
export function defaultRequirementItemsOf(no: string): string[] {
  return ITEM_CATALOG
    .filter((item) => item.kind === 'requirement' && item.no === no)
    .map((item) => `${item.id}-${item.summary}`);
}

/**
 * 条款 → 安全需求条目有效映射：
 * - 字段缺省（存量数据无 requirementItems）→ 回退条目目录默认值；
 * - 键存在但为空数组 → 尊重「未配置」（2026-11-01 用户裁决：新建规则默认空值，需人工配置）。
 */
export function effectiveRequirementItems(version: RuleVersion): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const clause of CLAUSES) {
    const stored = version.requirementItems?.[clause.no];
    result[clause.no] = Array.isArray(stored) ? [...stored] : defaultRequirementItemsOf(clause.no);
  }
  return result;
}

/**
 * 条款 → 填写分区/字段位有效映射：
 * - 键缺省（存量数据无 sectionAssignments）→ 回退「需求筛选」现行映射；
 * - 键存在（含 section 为空的显式未配置）→ 原样尊重，空值由提交校验拦截。
 */
export function effectiveSectionAssignments(version: RuleVersion): Record<string, ClauseSectionDraft> {
  const result: Record<string, ClauseSectionDraft> = {};
  for (const clause of CLAUSES) {
    const stored = version.sectionAssignments?.[clause.no];
    result[clause.no] = stored && typeof stored === 'object'
      ? { section: stored.section ?? '', field: stored.field ?? '' }
      : { ...CLAUSE_SECTIONS[clause.no] };
  }
  return result;
}

/**
 * 条款 → 测试方法有效映射（1 条款 = 1 测试方法，工作簿「需求数据」D 列逻辑）：
 * - 键缺省 → 空值（未配置，由提交校验/来源门控拦截）；
 * - 键存在 → 原样尊重（允许人工选择/清空）。
 */
export function effectiveTestMethods(version: RuleVersion): Record<string, string> {
  const result: Record<string, string> = {};
  for (const clause of CLAUSES) {
    const stored = version.testMethods?.[clause.no];
    result[clause.no] = typeof stored === 'string' ? stored : '';
  }
  return result;
}

/* ------------------------------------------------------------------ 运行时接线（2026-11-01） */

/** 条目引用值 '条目号-摘要' → 条目号（如 '6.1.1-2-Device 段标题…' → '6.1.1-2'） */
export function itemIdOfRef(value: string): string {
  const match = /^(\d+(?:\.\d+)*-\d+)/.exec(value.trim());
  return match ? match[1] : value.trim();
}

/** 条款 → 有效安全需求条目号（只取 id，供问卷侧判断「该条目是否参与」） */
export function effectiveItemIds(version: RuleVersion): Record<string, string[]> {
  const items = effectiveRequirementItems(version);
  const result: Record<string, string[]> = {};
  for (const [no, refs] of Object.entries(items)) {
    const ids = new Set<string>();
    for (const ref of refs) {
      // 单元格级安全需求引用（'SR-###'，旧口径）与需求筛选条目引用（'RF-<条款>-DEV/DOC<n>'，2026-11-02）
      // → 展开为该引用对应条款的全部 requirement 条目，
      // 问卷侧 64 条目恒等式（待确认+待审核+已锁定+未参与=64）口径不变
      const entry = safetyRequirementEntryById(ref.trim()) ?? requirementFilterEntryById(ref.trim());
      if (entry) {
        for (const item of ITEM_CATALOG) {
          if (item.kind === 'requirement' && item.no === entry.no) ids.add(item.id);
        }
        continue;
      }
      ids.add(itemIdOfRef(ref));
    }
    result[no] = [...ids];
  }
  return result;
}

/**
 * 条款 → 分区字段位键（`${section}:${字段位字母}`）→ 驱动该字段的条款号[]。
 * 字段位在工作簿里是「列位字母 + 行号」（E2），字段目录用字母键（E），此处取前导字母归一。
 */
export function sectionDriversOf(version: RuleVersion): Record<string, string[]> {
  const assignments = effectiveSectionAssignments(version);
  const result: Record<string, string[]> = {};
  for (const clause of CLAUSES) {
    const ref = assignments[clause.no];
    if (!ref?.section || !ref.field) continue;
    const letter = (/^[A-Z]+/.exec(ref.field) ?? [ref.field])[0]!;
    const key = `${ref.section}:${letter}`;
    (result[key] ??= []).push(clause.no);
  }
  return result;
}

/** 按规则 id 取条目映射；规则不存在返回 null（调用方回退静态条目目录） */
export function effectiveItemIdsFor(versionId?: string | null): Record<string, string[]> | null {
  const version = getRuleVersion(versionId);
  return version ? effectiveItemIds(version) : null;
}

/** 按规则 id 取分区字段驱动；规则不存在返回 null（调用方回退字段目录静态 drivers） */
export function sectionDriversFor(versionId?: string | null): Record<string, string[]> | null {
  const version = getRuleVersion(versionId);
  return version ? sectionDriversOf(version) : null;
}

/**
 * 题号表达式 → 中文可读式（如 AND(Q1,Q5) → 「Q1 且 Q5」、NOT(Q10) → 「非 Q10」）。
 * 括号规则与判定内核 explainExpression 一致：子节点运算符与父节点不同时加括号；
 * 解析失败返回 null（调用方保留原可读式，交由语法校验报错）。
 */
export function readableOfExpr(expr: string): string | null {
  const text = expr.replace(/\s+/g, '');
  let cursor = 0;
  function read(depth: number): { text: string; leaf: boolean } | null {
    if (depth > 5) return null;
    const leaf = /^Q\d+/.exec(text.slice(cursor));
    if (leaf) { cursor += leaf[0].length; return { text: leaf[0], leaf: true }; }
    if (/^NOT\(/.test(text.slice(cursor))) {
      cursor += 4;
      const child = read(depth + 1);
      if (child === null || text[cursor] !== ')') return null;
      cursor += 1;
      return { text: child.leaf ? `非 ${child.text}` : `非（${child.text}）`, leaf: false };
    }
    const operation = /^(AND|OR)\(/.exec(text.slice(cursor));
    if (!operation) return null;
    cursor += operation[0].length;
    const joiner = operation[1] === 'AND' ? '且' : '或';
    const parts: string[] = [];
    while (true) {
      const child = read(depth + 1);
      if (child === null) return null;
      parts.push(child.leaf ? child.text : `（${child.text}）`);
      if (text[cursor] === ',') { cursor += 1; continue; }
      break;
    }
    if (parts.length < 2 || text[cursor] !== ')') return null;
    cursor += 1;
    return { text: parts.join(joiner), leaf: false };
  }
  const result = read(1);
  return result !== null && cursor === text.length ? result.text : null;
}

/** 表达式是否为「单层 且/或 + 叶子」的扁平结构（勾选 + 且/或 配置可无损表达） */
export function flatExprModel(expr: string): { codes: string[]; op: 'AND' | 'OR' } | null {
  const text = expr.replace(/\s+/g, '');
  if (/^Q\d+$/.test(text)) return { codes: [text], op: 'AND' };
  const operation = /^(AND|OR)\(/.exec(text);
  if (!operation) return null;
  const rest = text.slice(operation[0].length, -1);
  if (!/^(Q\d+)(,Q\d+)*$/.test(rest)) return null;
  return { codes: rest.split(','), op: operation[1] as 'AND' | 'OR' };
}

/**
 * 表达式校验（语法 + 38 条款齐全 + 名称）+ 映射完整性校验（2026-11 新建规则子页面三重门禁）：
 * - 触发条件：表达式缺失/语法/层级/叶子题；
 * - 需求条目：有效映射为空的条款（itemsMissing）；
 * - 分区分配：有效分区或字段位为空的条款（sectionMissing）。
 *
 * 题集恒等于表达式引用的题号并集（`questionSet` 为派生字段），
 * 因此「操作数必须在题集内」由构造保证，不再作为校验项。
 * 存量数据无映射字段时按默认值读取（effectiveRequirementItems / effectiveSectionAssignments），
 * 因此历史规则不会被新校验误判为不完整。
 */
export function ruleVersionIssues(version: RuleVersion): Record<string, string[]> {
  const issues: Record<string, string[]> = {};
  const push = (no: string, message: string) => { (issues[no] ??= []).push(message); };
  const items = effectiveRequirementItems(version);
  const sections = effectiveSectionAssignments(version);
  for (const clause of CLAUSES) {
    const override = version.expressions[clause.no];
    if (!override?.expr) { push(clause.no, 'missing'); continue; }
    const syntax = validateExpressionSyntax(override.expr);
    if (syntax) push(clause.no, syntax);
    if (!items[clause.no]?.length) push(clause.no, 'itemsMissing');
    if (!sections[clause.no]?.section || !sections[clause.no]?.field) push(clause.no, 'sectionMissing');
  }
  if (!version.name.trim()) push('*', 'nameRequired');
  if (!version.ruleNo.trim()) push('*', 'ruleNoRequired');
  // 基本信息三个来源引用必填（2026-11-01 用户裁决）：标准库 / 问题库 / 安全需求
  // （2026-11-02：测试方法改为本平台维护的条款映射，选标准库来源后自动回显，不再有来源必填校验）
  if (!version.standardSource.trim()) push('*', 'standardRequired');
  if (!version.questionSource.trim()) push('*', 'questionRequired');
  if (!version.safetyRequirement.trim()) push('*', 'safetyRequired');
  return issues;
}

/** 规则编号生成（2026-11-01 用户裁决）：'RULE-YYYY-###'，年内序号递增；新建时预填、可改 */
export function nextRuleNo(): string {
  ensureSeeded();
  const year = new Date().getFullYear();
  const pattern = new RegExp(`^RULE-${year}-(\\d+)$`);
  const maxSeq = ruleVersions
    .map((version) => Number(pattern.exec(version.ruleNo)?.[1] ?? '0'))
    .reduce((left, right) => Math.max(left, right), 0);
  return `RULE-${year}-${String(maxSeq + 1).padStart(3, '0')}`;
}

function nextVersionId(): string {
  ensureSeeded();
  const numbers = ruleVersions.map((version) => Number(version.id.replace(/^v/, ''))).filter((value) => Number.isFinite(value));
  return `v${(numbers.length ? Math.max(...numbers) : 0) + 1}`;
}

export interface RuleVersionInput {
  /** 规则编号（'RULE-YYYY-###'，必填限 50 字；新建预填可改，编辑只读） */
  ruleNo: string;
  name: string;
  standardSource: string;
  questionSource: string;
  safetyRequirement: string;
  /** 测试方法来源（天枢-标准库第 9 章，必填；未选时各条款测试方法下拉禁用） */
  testMethod?: string;
  /** 规则说明（选填，限 100 字） */
  note: string;
  expressions?: Record<string, RuleVersionExpression>;
  /** 条款 → 安全需求条目映射；缺省按默认值补齐（复制来源优先） */
  requirementItems?: Record<string, string[]>;
  /** 条款 → 分区/字段位映射；缺省按默认值补齐（复制来源优先） */
  sectionAssignments?: Record<string, ClauseSectionDraft>;
  /** 条款 → 测试方法映射（1 条款 = 1 测试方法）；缺省置空（复制来源优先） */
  testMethods?: Record<string, string>;
  /** 合规性题（只作答不判范围）；缺省沿用复制来源，再缺省用 DEFAULT_CHECK_CODES */
  checkCodes?: string[];
}

/** 全量映射装配：显式输入 > 复制来源 > 默认值（38 条款恒补齐） */
function fullRequirementItems(input?: Record<string, string[]>, from?: RuleVersion | null): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const clause of CLAUSES) {
    const stored = input?.[clause.no] ?? from?.requirementItems?.[clause.no];
    result[clause.no] = Array.isArray(stored) ? [...stored] : defaultRequirementItemsOf(clause.no);
  }
  return result;
}

function fullSectionAssignments(input?: Record<string, ClauseSectionDraft>, from?: RuleVersion | null): Record<string, ClauseSectionDraft> {
  const result: Record<string, ClauseSectionDraft> = {};
  for (const clause of CLAUSES) {
    const stored = input?.[clause.no] ?? from?.sectionAssignments?.[clause.no];
    // 显式传入（含空值）原样保留：新建规则默认未配置，由提交校验拦截
    result[clause.no] = stored && typeof stored === 'object'
      ? { section: stored.section ?? '', field: stored.field ?? '' }
      : { ...CLAUSE_SECTIONS[clause.no] };
  }
  return result;
}

/** 全量测试方法装配：显式输入 > 复制来源 > 空值（1 条款 = 1 测试方法，默认空） */
function fullTestMethods(input?: Record<string, string>, from?: RuleVersion | null): Record<string, string> {
  const result: Record<string, string> = {};
  for (const clause of CLAUSES) {
    const stored = input?.[clause.no] ?? from?.testMethods?.[clause.no];
    result[clause.no] = typeof stored === 'string' ? stored : '';
  }
  return result;
}

/** 新建规则（可从现有规则复制映射表达式起步，也可直接给全量草稿数据）；待提交态，id 自增；题集由表达式派生 */
export function createRuleVersion(input: RuleVersionInput & { copyFromId?: string }, operator: string): RuleVersion {
  ensureSeeded();
  const from = getRuleVersion(input.copyFromId);
  const expressions: Record<string, RuleVersionExpression> = input.expressions
    ? JSON.parse(JSON.stringify(input.expressions)) as Record<string, RuleVersionExpression>
    : Object.fromEntries(CLAUSES.map((clause) => [clause.no,
      from?.expressions[clause.no]
        ? { ...from.expressions[clause.no] }
        : { expr: clause.expr, exprReadable: clause.exprReadable }]));
  const timestamp = nowText();
  const version: RuleVersion = {
    id: nextVersionId(),
    ruleNo: input.ruleNo.trim() || nextRuleNo(),
    name: input.name.trim() || `规则 ${nextVersionId()}`,
    status: 'draft',
    enabled: true,
    standardSource: input.standardSource.trim(),
    questionSource: input.questionSource.trim(),
    safetyRequirement: normalizeSafetyRequirementValue(input.safetyRequirement.trim()),
    testMethod: (input.testMethod ?? from?.testMethod ?? '').trim(),
    note: input.note.trim().slice(0, 100),
    questionSet: questionSetOf(expressions, input.checkCodes ?? from?.checkCodes ?? DEFAULT_CHECK_CODES),
    checkCodes: [...(input.checkCodes ?? from?.checkCodes ?? DEFAULT_CHECK_CODES)],
    expressions,
    requirementItems: fullRequirementItems(input.requirementItems, from),
    sectionAssignments: fullSectionAssignments(input.sectionAssignments, from),
    testMethods: fullTestMethods(input.testMethods, from),
    createdBy: operator,
    createdAt: timestamp,
    updatedAt: timestamp,
    updatedBy: operator,
  };
  ruleVersions.unshift(version);
  persist();
  return version;
}

/**
 * 编辑规则（全部状态可原地编辑，版本号不变，2026-10-29 用户裁决）；题集随表达式重算。
 * 生效口径由状态决定：待提交保存不动；已发布保存即重新发布生效（调用方随后触发问卷重算）。
 */
export function updateRuleVersion(id: string, input: RuleVersionInput, operator?: string): RuleVersion {
  const version = getRuleVersion(id);
  if (!version) throw new Error('Rule version not found');
  version.name = input.name.trim();
  if (input.ruleNo.trim()) version.ruleNo = input.ruleNo.trim();
  version.standardSource = input.standardSource.trim();
  version.questionSource = input.questionSource.trim();
  version.safetyRequirement = normalizeSafetyRequirementValue(input.safetyRequirement.trim());
  version.testMethod = (input.testMethod ?? version.testMethod ?? '').trim();
  version.note = input.note.trim().slice(0, 100);
  version.expressions = JSON.parse(JSON.stringify(input.expressions)) as Record<string, RuleVersionExpression>;
  if (input.checkCodes) version.checkCodes = [...input.checkCodes];
  version.questionSet = questionSetOf(version.expressions, version.checkCodes ?? DEFAULT_CHECK_CODES);
  if (input.requirementItems) {
    version.requirementItems = JSON.parse(JSON.stringify(input.requirementItems)) as Record<string, string[]>;
  }
  if (input.sectionAssignments) {
    version.sectionAssignments = JSON.parse(JSON.stringify(input.sectionAssignments)) as Record<string, ClauseSectionDraft>;
  }
  if (input.testMethods) {
    version.testMethods = JSON.parse(JSON.stringify(input.testMethods)) as Record<string, string>;
  }
  version.updatedAt = nowText();
  if (operator) version.updatedBy = operator;
  persist();
  return version;
}

/** 发布：全部校验通过后置为已发布；发布方负责联动问卷重算 */
export function publishRuleVersion(id: string): { ok: boolean; issues: Record<string, string[]> } {
  const version = getRuleVersion(id);
  if (!version) throw new Error('Rule version not found');
  const issues = ruleVersionIssues(version);
  if (Object.keys(issues).length) return { ok: false, issues };
  version.status = 'published';
  version.updatedAt = nowText();
  persist();
  return { ok: true, issues: {} };
}

/**
 * 「是否启用」开关（2026-10-29 用户裁决）：直接切换、留操作痕迹（updatedBy/updatedAt），
 * 不走 updateRuleVersion（那会覆盖映射内容）；不改 status。
 */
export function setRuleVersionEnabled(id: string, enabled: boolean, operator: string): void {
  const target = getRuleVersion(id);
  if (!target || isRuleVersionEnabled(target) === enabled) return;
  target.enabled = enabled;
  target.updatedBy = operator;
  target.updatedAt = nowText();
  persist();
}

/** 删除（硬删除）：进行中问卷引用的规则由调用方守卫拒绝；历史问卷按创建快照冻结，删除后仍可追溯 */
export function deleteRuleVersion(id: string): void {
  ensureSeeded();
  const index = ruleVersions.findIndex((entry) => entry.id === id);
  if (index > -1) ruleVersions.splice(index, 1);
  persist();
}
