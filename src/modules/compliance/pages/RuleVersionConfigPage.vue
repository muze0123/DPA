<script setup lang="ts">
/**
 * 新建/编辑规则子页面（2026-11，替代规则列表页的编辑抽屉）：
 * - 顶部吸顶操作条（2026-10-30 版式对齐分区管理 VersionPageHeader）：左侧面包屑
 *   「规则列表 / 当前页」（上一层级 hover/focus 主色高亮，点击返回列表），右侧
 *   【暂存草稿】【提交发布 / 保存并发布】；规则编号与状态不再放在面包屑，改由
 *   基本信息区块承载（2026-11-01 用户裁决）。
 * - 基本信息（2026-11-01 用户裁决：两列栅格）：字段标签在上、控件 500px；
 * - 「规则配置」区块（2026-11-01 用户裁决：去掉三页签，以触发条件页签的内容格式为基础，
 *   每个条款卡内分别配置三块内容；区块标题带红星）：
 *   左栏「条目导航」章节级 8 行（已配置/总条款数徽标、hover/点击高亮、sticky 吸顶、锚点定位）；
 *   右栏分组条款卡（条款号+主题+条文原文两行省略+查看更多），卡内三个子区块：
 *   ①触发规则（2026-11-01 用户裁决：问题树配置；高级表达式开关移入区块标题栏居右）：
 *     未配置时空态+【+添加问题】打开「选择问题」弹窗（关键词筛选/题号·题干·判断指引多选/
 *     五档分页不丢选中/已选计数/未选时确定禁用）；问题树 ≥2 问题默认「或」可切「且」，
 *     【设为子级】并入相邻项组成嵌套组，组内仅剩一个问题自动上浮（互转见 data/triggerTree.ts）；
 *     嵌套逻辑也可切换「高级表达式」手写（文法与判定内核一致：Q1 | AND(…) | OR(…)）；
 *   ②需求条目：该条款可挂接的安全需求条目（来源 = xlsx「需求数据」工作簿「安全需求」列的
 *     条目化拆分，显示 SR 编号 + 条目原文）；【+添加安全需求】打开「选择安全需求」弹窗
 *     （交互与选择问题弹窗一致），已选行 = SR 编号 + 条目原文 + 行内删除，标题栏删除 ico 清空；
 *   ③分区分配：填写分区 + 字段位（1:1，字段位取分区内字母列位），标题栏删除 ico 恢复默认；
 * - 提交门禁：基本信息 + 各条款三块配置全部完成（数据层 ruleVersionIssues：表达式 + 条目 +
 *   分区 + 名称/编号/三个来源）才可提交发布；未通过时阻断并定位到首个问题条款。
 * - 生效口径（2026-10-29 用户裁决）：新建/复制 → 待提交，不影响历史问卷；
 *   编辑已发布规则 → 保存并发布即重新发布生效，绑定此规则且匹配审批未通过的问卷按新规则
 *   重算自动初筛（人工确认值保留），已锁定问卷不受影响。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { IconDelete } from '@arco-design/web-vue/es/icon';
import { useI18n } from 'vue-i18n';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import {
  CLAUSES, CLAUSE_GROUPS, clauseByNo, clauseGroupTitle, clauseTopic, recalculateSurveysForRuleVersion,
  ruleVersionRecalcImpact,
} from '../../surveys/data/matching';
import { QUESTION_BANK } from '../../surveys/data/questions';
import { ITEM_CATALOG } from '../../surveys/data/items';
import { MOCK_CURRENT_USER } from '../../surveys/data/surveys';
import { surveyTemplates, type TemplateQuestion } from '../../templates/data/templates';
import { safetyRequirementOptions } from '../data/safetyRequirements';
import { SAFETY_REQUIREMENT_ENTRIES, safetyRequirementEntryById } from '../data/safetyRequirementEntries';
import {
  REQUIREMENT_FILTER_ENTRIES, requirementFilterEntryById,
  type RequirementFilterType as RequirementType,
} from '../data/requirementFilterEntries';
import { testMethodMappingRows } from '../data/testMethodMappings';
import { clauseSection, type ClauseSectionRef } from '../data/clauseSections';
import { CLAUSE_SECTION_KEYS, fieldsOf, type SectionKey } from '../../sections/data/sectionCatalog';
import {
  createRuleVersion, effectiveRequirementItems, effectiveSectionAssignments, itemIdOfRef,
  getRuleVersion, listRuleVersions, nextRuleNo, publishRuleVersion, readableOfExpr, ruleVersionIssues, standardSourceOptions,
  updateRuleVersion, type ClauseSectionDraft, type RuleVersion, type RuleVersionExpression, type RuleVersionInput,
} from '../data/ruleVersions';
import { isTreeEmpty, removeLeafAt, setChildAt, setOpAt, syncTreeSelection, toggleLeafNegationAt, triggerExprOf, triggerLeafCodes, triggerTreeFromExpr, unsetChildAt, type TriggerOp, type TriggerPath, type TriggerTree } from '../data/triggerTree';
import TriggerTreeEditor from '../components/TriggerTreeEditor.vue';
import QuestionPickerModal from '../components/QuestionPickerModal.vue';
import SafetyRequirementPickerModal, { type SafetyRequirementOption } from '../components/SafetyRequirementPickerModal.vue';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const OPERATOR = MOCK_CURRENT_USER.name;

const isNew = computed(() => route.name === 'rule-version-new');
const editId = computed(() => String(route.params.versionId ?? ''));
const copyFromId = computed(() => (isNew.value && typeof route.query.from === 'string' ? route.query.from : ''));
const isCopy = computed(() => Boolean(copyFromId.value));
/** 已发布规则编辑：保存即重新发布（底部按钮切换为「保存并发布」） */
const isPublishedEdit = computed(() => !isNew.value && status.value === 'published');

const missing = ref(false);
const busy = ref(false);
const status = ref<'draft' | 'published'>('draft');
/** 字段级报错只在「保存/提交过一次」之后展示：新建页首次打开不铺满红色提示（须先于 immediate watch 声明） */
const submitted = ref(false);
/** 条款级校验文案（如「缺少触发表达式」）只在点过【提交发布】后展示，默认不显示（2026-11-01 用户裁决） */
const publishChecked = ref(false);

/* ------------------------------------------------------------------ 表单状态 */

const basic = reactive({ ruleNo: '', name: '', standardSource: '', note: '', questionSource: '', safetyRequirement: '' });
/** 规则编号（2026-11-01 用户裁决）：新建/复制预填生成值且可改，编辑态只读（编号创建后不可变） */
const ruleNoEditable = isNew;
const expressions = ref<Record<string, RuleVersionExpression>>({});
const requirementItems = ref<Record<string, string[]>>({});
const sectionAssignments = ref<Record<string, ClauseSectionDraft>>({});
const testMethods = ref<Record<string, string>>({});

/**
 * 触发条件区块行状态（2026-11-01 用户裁决：问题树配置）：
 * tree = 问题树（null 表示未配置任何问题），advanced = 高级表达式手写模式。
 */
interface TriggerRow { no: string; topic: string; tree: TriggerTree | null; advanced: boolean }
const triggerRows = ref<Record<string, TriggerRow>>({});

/** 条款原文/标题查找（触发条件卡展示条文内容，两行省略 + 查看更多） */
const clauseMap = new Map(CLAUSES.map((clause) => [clause.no, clause]));
/** 题号 → 题库题（内核口径，问题库未覆盖该题时兜底） */
const questionMap = new Map(QUESTION_BANK.map((question) => [question.code, question]));
/** 所选问题库（基本信息「问题库」= `{模板编号}-{名称}`，题目数据源 = 问卷问题模块该库的题目） */
const selectedTemplate = computed(() => surveyTemplates.find((tpl) => `${tpl.id}-${tpl.name}` === basic.questionSource) ?? null);
const libraryQuestionMap = computed(() => new Map(
  (selectedTemplate.value?.questions ?? []).map((question) => [question.code, question]),
));
/** 选择问题弹窗的数据源 = 所选问题库的题目列表（未选库时为空，弹窗内提示先选库） */
const pickerQuestions = computed<TemplateQuestion[]>(() => selectedTemplate.value?.questions ?? []);

/** 题目行展示「题号 题干」：优先用所选问题库的题干，其次内核题库（2026-11-01 起题号即唯一标识） */
function questionText(code: string): string {
  const libraryQuestion = libraryQuestionMap.value.get(code);
  if (libraryQuestion) return `${code} ${libraryQuestion.title}`;
  const question = questionMap.get(code);
  return question ? `${question.code} ${question.title}` : code;
}

/** 条目导航（2026-11-01 用户裁决）：章节级 8 行，徽标 = 组内已配置条款数/条款总数 */
const navGroups = computed(() => clauseGroups.map((group) => ({
  key: group.key,
  label: `${group.key} ${group.title}`,
  configured: group.clauses.filter((clause) => Boolean((expressions.value[clause.no]?.expr ?? '').trim())).length,
  total: group.clauses.length,
})));
function locateGroup(key: string): void {
  document.getElementById(`cfg-group-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * 当前所在章级（2026-11-01 用户裁决：随滚动高亮，表示正在编辑的章级）：
 * 取「章节区间顶部已越过吸顶条 + 8px」的最后一个章节；页面未滚到任何章节时取第一章。
 */
const activeGroup = ref('');
function updateActiveGroup(): void {
  const threshold = 120;
  let current = navGroups.value[0]?.key ?? '';
  for (const group of navGroups.value) {
    const el = document.getElementById(`cfg-group-${group.key}`);
    if (!el) continue;
    if (el.getBoundingClientRect().top - threshold <= 0) current = group.key;
    else break;
  }
  if (activeGroup.value !== current) activeGroup.value = current;
}

/** 条款原文展开态（默认两行省略，【查看更多】展开/收起） */
const expandedOriginal = ref<Set<string>>(new Set());
/** 原文超过两行（被折叠截断）的条款：未截断的条款不显示【查看更多】（2026-11-01 用户裁决） */
const clampedOriginals = ref<Set<string>>(new Set());
function measureOriginals(): void {
  const next = new Set<string>();
  document.querySelectorAll<HTMLElement>('.cfg-original').forEach((el) => {
    const no = el.dataset.no;
    if (no && el.scrollHeight > el.clientHeight + 1) next.add(no);
  });
  clampedOriginals.value = next;
}
function toggleOriginal(no: string): void {
  const next = new Set(expandedOriginal.value);
  if (next.has(no)) next.delete(no);
  else next.add(no);
  expandedOriginal.value = next;
}

/** 安全需求条目文本展开态（默认两行省略，【查看更多】展开/收起；未超限不显示按钮，2026-11-02 用户裁决） */
const srExpanded = ref<Set<string>>(new Set());
const srClamped = ref<Set<string>>(new Set());
function srKey(no: string, code: string): string { return `${no}\u0000${code}`; }
function measureSrTexts(): void {
  const next = new Set<string>();
  document.querySelectorAll<HTMLElement>('.cfg-sr-text').forEach((el) => {
    const key = el.dataset.srKey;
    if (key && el.scrollHeight > el.clientHeight + 1) next.add(key);
  });
  srClamped.value = next;
}
function toggleSr(no: string, code: string): void {
  const key = srKey(no, code);
  const next = new Set(srExpanded.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  srExpanded.value = next;
}

/** 清空确认弹窗（对齐列表页 420px 删除弹窗口径）：kind 区分 触发规则 / 需求条目 / 分区分配 */
type ClearKind = 'trigger' | 'items' | 'sections';
const clearTarget = ref<{ no: string; kind: ClearKind } | null>(null);
const clearModalText = computed(() => {
  const target = clearTarget.value;
  if (!target) return { title: '', hint: '', ok: '' };
  if (target.kind === 'items') {
    return {
      title: t('compliance.versions.config.clearItemsTitle'),
      hint: t('compliance.versions.config.clearItemsHint', { no: target.no }),
      ok: t('compliance.versions.config.clearConfirm'),
    };
  }
  if (target.kind === 'sections') {
    return {
      title: t('compliance.versions.config.clearSectionsTitle'),
      hint: t('compliance.versions.config.clearSectionsHint', { no: target.no }),
      ok: t('compliance.versions.config.clearConfirm'),
    };
  }
  return {
    title: t('compliance.versions.config.clearTitle'),
    hint: t('compliance.versions.config.clearHint', { no: target.no }),
    ok: t('compliance.versions.config.clearConfirm'),
  };
});

/** 选择问题弹窗状态 */
const pickerClause = ref('');
const pickerVisible = computed({
  get: () => Boolean(pickerClause.value),
  set: (open: boolean) => { if (!open) pickerClause.value = ''; },
});
const pickerSelectedCodes = computed(() => triggerLeafCodes(triggerRows.value[pickerClause.value]?.tree ?? null));
function openPicker(no: string): void { pickerClause.value = no; }
function onPickerConfirm(codes: string[]): void {
  const row = triggerRows.value[pickerClause.value];
  if (row) {
    row.tree = syncTreeSelection(row.tree, codes);
    writeExpr(row);
  }
  pickerClause.value = '';
}

/** 且/或 关系选项（紧凑口径） */
const opOptions = computed(() => ([
  { value: 'OR' as TriggerOp, label: t('compliance.versions.config.opOr') },
  { value: 'AND' as TriggerOp, label: t('compliance.versions.config.opAnd') },
]));

/** 问题树操作（纯函数替换 → 同步表达式） */
function writeExpr(row: TriggerRow): void {
  const expr = triggerExprOf(row.tree);
  expressions.value[row.no] = { expr, exprReadable: readableOfExpr(expr) ?? '' };
}
function onTreeRemove(row: TriggerRow, path: TriggerPath): void {
  row.tree = row.tree ? removeLeafAt(row.tree, path) : null;
  writeExpr(row);
}
function onTreeSetChild(row: TriggerRow, path: TriggerPath): void {
  if (row.tree) { row.tree = setChildAt(row.tree, path); writeExpr(row); }
}
/** 取消子级（2026-11-04）：组内问题移回上一层级，与设为子级互逆 */
function onTreeUnsetChild(row: TriggerRow, path: TriggerPath): void {
  if (row.tree) { row.tree = unsetChildAt(row.tree, path); writeExpr(row); }
}
function onTreeSetOp(row: TriggerRow, path: TriggerPath, op: TriggerOp): void {
  if (row.tree) { row.tree = setOpAt(row.tree, path, op); writeExpr(row); }
}
/** 切换叶子期望答案（是 ⇄ 否）：答否才触发的条款用 NOT(Qnn) 表达 */
function onTreeToggleNegate(row: TriggerRow, path: TriggerPath): void {
  if (row.tree) { row.tree = toggleLeafNegationAt(row.tree, path); writeExpr(row); }
}
function onClearRule(row: TriggerRow): void {
  row.tree = null;
  writeExpr(row);
  clearTarget.value = null;
}
function confirmClear(): void {
  const target = clearTarget.value;
  if (!target) return;
  if (target.kind === 'trigger') {
    const row = triggerRows.value[target.no];
    if (row) onClearRule(row);
    return;
  }
  if (target.kind === 'items') {
    requirementItems.value[target.no] = [];
    clearTarget.value = null;
    return;
  }
  // 分区分配：清空 = 置空分区与字段位（2026-11-01 口径：未配置即空，由提交校验拦截）
  sectionAssignments.value[target.no] = { section: '', field: '' };
  clearTarget.value = null;
}

/** 38 条款按 6.1–6.8 分组渲染（三个必配区块共用分组骨架） */
const clauseGroups = CLAUSE_GROUPS.map((key) => ({
  key,
  title: clauseGroupTitle(key),
  clauses: CLAUSES.filter((clause) => clause.group === key),
}));

const standardOptions = standardSourceOptions().map((value) => ({ value, label: value }));
const questionSourceOptions = [...new Set(surveyTemplates.map((item) => `${item.id}-${item.name}`))].map((value) => ({ value, label: value }));
const safetyRequirementSelectOptions = safetyRequirementOptions().map((value) => ({ value, label: value }));
// 2026-11-02：测试方法来源/候选下拉已删（映射在本平台「测试方法」菜单维护，条款卡只读回显）
const sectionOptions = CLAUSE_SECTION_KEYS.map((key) => ({ value: key, label: t(`surveys.workspace.stepSections.sections.${key}`) }));

/**
 * 需求条目候选（2026-11-02 二次裁决）：弹窗数据源 = xlsx「需求筛选」工作簿 E 列解析的
 * 全部 139 条需求条目（38 个条款全覆盖），由用户自行选择挂接到当前条款；编号列展示
 * 完整 RF 编号（含条款号，跨条款可区分），弹窗内仍按 Device/Document 类型切换浏览。
 *
 * 【旧口径 1（2026-11-02 上午）：候选范围限当前条款，注释保留可能切回】
 * function srOptionsOfClause(no: string): SafetyRequirementOption[] {
 *   return REQUIREMENT_FILTER_ENTRIES.filter((entry) => entry.no === no).map((entry) => ({
 *     value: entry.id,
 *     code: requirementFilterCode(entry),
 *     content: entry.content,
 *     type: entry.type,
 *   }));
 * }
 * 【旧口径 2（2026-11-01）：全量 SR-001…SR-038 单元格条目】见 requirementFilterEntries.ts 注释。
 */
/** 弹窗全量候选：139 条（38 个条款全覆盖），编号 = 完整 RF 编号 */
const ALL_SR_PICKER_OPTIONS: SafetyRequirementOption[] = REQUIREMENT_FILTER_ENTRIES.map((entry) => ({
  value: entry.id,
  code: entry.id,
  content: entry.content,
  type: entry.type,
}));

/**
 * 引用值 → 条目展示。2026-11-02 修复：RF 条目编号返回完整 id（RF-<条款>-DEV/DOC<n>，含条款号）。
 * 此前返回组内序号（DEV-1/DOC-1），弹窗候选改全量 139 条后跨条款条目编号撞车，
 * 已选列表按编号去重时被错误折叠（选 50 条只显示 ≤ 组内最大序号数条）。
 * 兼容两套存量引用：RF-…（现行）、SR-### 单元格条目 / '条目号-摘要'（旧口径）。
 * 旧口径条目原文含 Device/Document 混排分段，无法可靠归类，统一归入 Device 组展示。
 */
function srRefOf(value: string): { code: string; content: string; type?: RequirementType } {
  const rf = requirementFilterEntryById(value.trim());
  if (rf) return { code: rf.id, content: rf.content, type: rf.type };
  const entry = safetyRequirementEntryById(value.trim());
  if (entry) return { code: entry.id, content: entry.content, type: 'device' };
  const legacyItem = ITEM_CATALOG.find((item) => item.id === itemIdOfRef(value));
  const legacyEntry = legacyItem ? SAFETY_REQUIREMENT_ENTRIES.find((item) => item.no === legacyItem.no) : undefined;
  if (legacyEntry) return { code: legacyEntry.id, content: legacyEntry.content, type: 'device' };
  return { code: '', content: value, type: 'device' };
}

/** 字段位候选：分区字段目录（code 为字母列位），标签随语言 */
function fieldOptionsOf(section: SectionKey) {
  return fieldsOf(section).map((field) => ({
    value: field.code,
    label: `${field.code} · ${locale.value === 'en-US' ? field.labelEn : field.labelZh}`,
  }));
}

/* ------------------------------------------------------------------ 加载（new / copy / edit 共用一个入口） */

function loadVersion() {
  missing.value = false;
  submitted.value = false;
  publishChecked.value = false;
  let source: RuleVersion | null = null;
  if (isNew.value) {
    if (copyFromId.value) {
      source = getRuleVersion(copyFromId.value);
      if (!source) { missing.value = true; return; }
    }
  } else {
    source = getRuleVersion(editId.value);
    if (!source) { missing.value = true; return; }
  }
  const base = source;
  // 规则编号：新建/复制预填生成值（可改），编辑态回填现行编号（只读）
  basic.ruleNo = isNew.value ? nextRuleNo() : (base?.ruleNo ?? editId.value);
  basic.name = isCopy.value ? `${base?.name ?? ''} 副本` : (base?.name ?? '');
  basic.standardSource = base?.standardSource ?? '';
  basic.note = base?.note ?? '';
  basic.questionSource = base?.questionSource ?? '';
  basic.safetyRequirement = base?.safetyRequirement ?? '';
  status.value = isCopy.value ? 'draft' : (base?.status ?? 'draft');

  const exprs: Record<string, RuleVersionExpression> = {};
  const rows: Record<string, TriggerRow> = {};
  // 纯新建（2026-11-01 用户裁决）：触发条件默认全部「未选择问题」，由用户逐条款添加；
  // 编辑/复制沿用已保存或被复制规则的表达式
  const blankTriggers = isNew.value && !isCopy.value;
  for (const clause of CLAUSES) {
    const override = base?.expressions[clause.no];
    const expr = blankTriggers ? '' : (override?.expr ? override.expr : clause.expr);
    const exprReadable = blankTriggers ? '' : (override?.exprReadable || clause.exprReadable);
    exprs[clause.no] = { expr, exprReadable };
    // 问题树（2026-11-01）：表达式可解析为树则进图形配置，否则回退高级表达式手写
    const tree = blankTriggers ? null : triggerTreeFromExpr(expr);
    rows[clause.no] = { no: clause.no, topic: clauseTopic(clause.no), tree, advanced: !blankTriggers && tree === null };
  }
  expressions.value = exprs;
  triggerRows.value = rows;

  // 需求条目/分区分配（2026-11-01 用户裁决：新建规则默认空值，须先选「安全需求」来源/分区表单）：
  // 纯新建 → 全部空值；编辑/复制 → 读「有效值」（存量数据缺省回退默认值）
  const defaults = { requirementItems: {}, sectionAssignments: {} } as RuleVersion;
  if (blankTriggers) {
    requirementItems.value = Object.fromEntries(CLAUSES.map((clause) => [clause.no, []]));
    sectionAssignments.value = Object.fromEntries(CLAUSES.map((clause) => [clause.no, { section: '' as const, field: '' }]));
  } else {
    const items = effectiveRequirementItems(base ?? defaults);
    requirementItems.value = Object.fromEntries(CLAUSES.map((clause) => [clause.no, items[clause.no] ?? []]));
    const secs = effectiveSectionAssignments(base ?? defaults);
    sectionAssignments.value = Object.fromEntries(CLAUSES.map((clause) => {
      const ref = secs[clause.no] ?? clauseSection(clause.no);
      return [clause.no, {
        section: (ref?.section ?? '') as ClauseSectionDraft['section'],
        field: (ref?.field ?? '').replace(/\d+$/, ''),
      }];
    }));
  }
  // 测试方法（Round I 用户裁决）：默认空值，一条条款对应一个测试方法；未选「测试方法」来源时下拉禁用
  const storedMethods = base?.testMethods ?? {};
  testMethods.value = Object.fromEntries(CLAUSES.map((clause) => [clause.no, storedMethods[clause.no] ?? '']));

  resetSnapshot();
}

/* ------------------------------------------------------------------ 未保存保护 */

const original = ref('');
function serializeState(): string {
  return JSON.stringify({
    basic: { ...basic },
    expressions: JSON.parse(JSON.stringify(expressions.value)) as Record<string, RuleVersionExpression>,
    requirementItems: JSON.parse(JSON.stringify(requirementItems.value)) as Record<string, string[]>,
    sectionAssignments: JSON.parse(JSON.stringify(sectionAssignments.value)) as Record<string, ClauseSectionDraft>,
    testMethods: JSON.parse(JSON.stringify(testMethods.value)) as Record<string, string>,
  });
}
function resetSnapshot() { original.value = serializeState(); }
const dirty = computed(() => !missing.value && serializeState() !== original.value);

// 路由进入/变化时加载（immediate 同步执行 loadVersion → resetSnapshot，
// 因此必须声明在 original / resetSnapshot 之后，避免 TDZ 引用错误）
watch(() => route.fullPath, loadVersion, { immediate: true });
watch(locale, () => { void nextTick(() => { measureOriginals(); measureSrTexts(); }); });
watch(requirementItems, () => { void nextTick(measureSrTexts); }, { deep: true });
/**
 * 测试方法自动回显（2026-11-02 用户裁决）：纯新建选择「标准库」来源后，38 条款测试方法
 * 直接回显「测试方法」菜单维护的当前映射，无需再配置；编辑/复制沿用规则保存时的映射快照。
 */
watch(() => basic.standardSource, (value) => {
  if (!value.trim() || !isNew.value || isCopy.value) return;
  testMethods.value = Object.fromEntries(testMethodMappingRows().map((row) => [row.no, row.testMethod]));
});

/* ------------------------------------------------------------------ 吸顶操作条（版式对齐分区管理 VersionPageHeader：面包屑回上一层级 + 右侧操作） */

/** 吸顶判定：与 ProductLayout 的 56px 固定顶栏对齐 */
const STICKY_TOP = 56;
const barRoot = ref<HTMLElement | null>(null);
const stuck = ref(false);
let measureFrame = 0;
function measureStuck() {
  measureFrame = 0;
  const el = barRoot.value;
  if (!el) return;
  stuck.value = el.getBoundingClientRect().top <= STICKY_TOP + 0.5;
  // 同一帧内顺带更新「当前所在章级」高亮，避免多余监听
  updateActiveGroup();
}
function scheduleStuck() {
  if (!measureFrame) measureFrame = requestAnimationFrame(measureStuck);
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}
window.addEventListener('beforeunload', beforeUnload);
onMounted(() => {
  measureStuck();
  void nextTick(() => { measureOriginals(); measureSrTexts(); updateActiveGroup(); });
  window.addEventListener('scroll', scheduleStuck, { passive: true });
  window.addEventListener('resize', scheduleStuck);
  window.addEventListener('resize', measureOriginals);
  window.addEventListener('resize', measureSrTexts);
});
onBeforeUnmount(() => {
  if (measureFrame) cancelAnimationFrame(measureFrame);
  window.removeEventListener('scroll', scheduleStuck);
  window.removeEventListener('resize', scheduleStuck);
  window.removeEventListener('resize', measureOriginals);
  window.removeEventListener('resize', measureSrTexts);
  window.removeEventListener('beforeunload', beforeUnload);
});
onBeforeRouteLeave(() => !dirty.value || window.confirm(t('compliance.versions.config.discard')));

/* ------------------------------------------------------------------ 校验（数据层三重门禁 + 页签问题计数） */

/** 送数据层校验的草稿快照（questionSet 为派生字段，校验不读） */
const draftForIssues = computed<RuleVersion>(() => ({
  id: isNew.value ? 'draft' : editId.value,
  ruleNo: basic.ruleNo,
  name: basic.name,
  status: status.value,
  enabled: true,
  standardSource: basic.standardSource,
  questionSource: basic.questionSource,
  safetyRequirement: basic.safetyRequirement,
  note: basic.note,
  questionSet: [],
  expressions: expressions.value,
  requirementItems: requirementItems.value,
  sectionAssignments: sectionAssignments.value,
  testMethods: testMethods.value,
  createdBy: OPERATOR, createdAt: '', updatedAt: '', updatedBy: OPERATOR,
}));

const issues = computed(() => ruleVersionIssues(draftForIssues.value));
const issueCount = computed(() => Object.keys(issues.value).length);
const TRIGGER_ISSUE_KEYS = ['missing', 'syntax', 'depth', 'leaves'];

function issueKeyText(key: string): string {
  if (key === 'missing') return t('compliance.versions.issueMissing');
  if (key === 'syntax') return t('compliance.versions.issueSyntax');
  if (key === 'depth') return t('compliance.versions.issueDepth');
  if (key === 'leaves') return t('compliance.versions.issueLeaves');
  if (key === 'itemsMissing') return t('compliance.versions.issueItemsMissing');
  if (key === 'sectionMissing') return t('compliance.versions.issueSectionMissing');
  if (key === 'nameRequired') return t('compliance.versions.issueNameRequired');
  if (key === 'ruleNoRequired') return t('compliance.versions.issueRuleNoRequired');
  if (key === 'standardRequired') return t('compliance.versions.issueStandardRequired');
  if (key === 'questionRequired') return t('compliance.versions.issueQuestionRequired');
  if (key === 'safetyRequired') return t('compliance.versions.issueSafetyRequired');
  return key;
}

function clauseIssueText(no: string, keys: readonly string[]): string {
  return (issues.value[no] ?? []).filter((key) => keys.includes(key)).map(issueKeyText).join('；');
}

/** 基本信息字段级问题（与数据层校验同键；编号重复为页面级校验，不进数据层） */
const ruleNoDuplicate = computed(() => {
  const value = basic.ruleNo.trim();
  return Boolean(value) && listRuleVersions().some((version) => version.id !== editId.value && version.ruleNo === value);
});
const basicFieldIssues = computed(() => ({
  ruleNo: !basic.ruleNo.trim()
    ? t('compliance.versions.issueRuleNoRequired')
    : ruleNoDuplicate.value ? t('compliance.versions.issueRuleNoDuplicate') : '',
  name: !basic.name.trim() ? t('compliance.versions.issueNameRequired') : '',
  standardSource: !basic.standardSource.trim() ? t('compliance.versions.issueStandardRequired') : '',
  questionSource: !basic.questionSource.trim() ? t('compliance.versions.issueQuestionRequired') : '',
  safetyRequirement: !basic.safetyRequirement.trim() ? t('compliance.versions.issueSafetyRequired') : '',
}));
const basicIssueCount = computed(() => Object.values(basicFieldIssues.value).filter(Boolean).length);

/** 区块式布局（2026-11-01 用户裁决）：无页签，提交阻断直接定位到首个问题条款卡片 */
function scrollToBlock(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** 提交被阻断时定位：基本信息有问题 → 基本信息区块；否则滚到首个带条款级问题的条款卡 */
function scrollToFirstIssueBlock(): void {
  if (basicIssueCount.value) { scrollToBlock('cfg-block-basic'); return; }
  const firstIssueClause = CLAUSES.find((clause) => (issues.value[clause.no] ?? []).length > 0);
  scrollToBlock(firstIssueClause ? `cfg-clause-${firstIssueClause.no}` : 'cfg-rules-panel');
}

/* ------------------------------------------------------------------ 触发规则（条款卡内子区块：问题树 + 高级表达式） */

/** 触发规则框标题计数「已关联 n 个问题」：树模式取叶子题号数，高级表达式取表达式引用题号数（去重） */
function linkedCount(row: TriggerRow): number {
  if (!row.advanced) return triggerLeafCodes(row.tree).length;
  return new Set(exprText(row.no).match(/Q\d+/g) ?? []).size;
}

const groupedTriggerRows = computed(() => clauseGroups.map((group) => ({
  ...group,
  rows: group.clauses.map((clause) => triggerRows.value[clause.no]!),
})));

/** 高级表达式手写：实时同步表达式；能解析为问题树时同步树（便于切回图形模式） */
function onAdvancedExpr(row: TriggerRow, value: unknown) {
  const expr = String(value ?? '');
  const readable = readableOfExpr(expr);
  expressions.value[row.no] = { expr, exprReadable: readable ?? expressions.value[row.no]?.exprReadable ?? '' };
  row.tree = triggerTreeFromExpr(expr);
}

/**
 * 开关高级表达式（2026-11-01 用户裁决）：
 * - 未输入表达式（含仅选了问题但清空）→ 自由开关，不做任何校验；
 * - 已输入内容：能解析为问题树才允许关闭；语法/层级不通过 → 保持开启并 toast 提示。
 */
function onAdvancedChange(row: TriggerRow, value: unknown) {
  if (value) { row.advanced = true; return; }
  const expr = exprText(row.no).trim();
  if (!expr) { row.advanced = false; return; }
  const tree = triggerTreeFromExpr(expr);
  if (!tree) {
    row.advanced = true;
    Message.warning(t('compliance.versions.config.advancedKeepHint'));
    return;
  }
  row.tree = tree;
  row.advanced = false;
}

/** 高级表达式语法错误（仅当已输入内容且解析不出可读式时提示，2026-11-01 用户裁决） */
function exprSyntaxInvalid(no: string): boolean {
  return Boolean(exprText(no).trim()) && !readableText(no);
}
/** 高级表达式是否有可展示内容（未输入时整行不渲染） */
function hasExprInput(no: string): boolean { return Boolean(exprText(no).trim()); }

function exprText(no: string): string { return expressions.value[no]?.expr ?? ''; }
function readableText(no: string): string { return expressions.value[no]?.exprReadable ?? ''; }
function originalOf(no: string): string { return clauseMap.get(no)?.original ?? ''; }

/* ------------------------------------------------------------------ 需求条目与分区分配（条款卡内子区块） */

function itemsOf(no: string): string[] { return requirementItems.value[no] ?? []; }

/** 已选需求条目行（按编号去重：RF 引用编号 = 完整 id 含条款号，跨条款不折叠；
 *  去重仅服务于存量 '条目号-摘要' 旧引用归并到同一单元格条目的场景） */
interface SrRow { value: string; code: string; content: string; type?: RequirementType }
function itemRowsOf(no: string): SrRow[] {
  const seen = new Set<string>();
  const rows: SrRow[] = [];
  for (const value of itemsOf(no)) {
    const ref = srRefOf(value);
    const key = ref.code || value;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ value, code: ref.code, content: ref.content, type: ref.type });
  }
  return rows;
}

/**
 * 已选条目按 Device/Document 分组（2026-11-02 用户裁决，对齐交互稿两组布局）；
 * 旧口径存量引用统一归入 Device 组展示（见 srRefOf 兼容说明）。
 */
interface SrGroup { type: RequirementType; label: string; rows: SrRow[] }
const SR_GROUP_LABELS: Record<RequirementType, string> = { device: 'Device:', document: 'Document:' };
function srGroupsOf(no: string): SrGroup[] {
  const rows = itemRowsOf(no);
  return (['device', 'document'] as const).map((type) => ({
    type,
    label: SR_GROUP_LABELS[type],
    rows: rows.filter((row) => (row.type ?? 'device') === type),
  }));
}

/** 安全需求来源是否已选（未选时不可挂接需求条目，对齐「未选问题库不可选问题」） */
const hasSafetySource = computed(() => Boolean(basic.safetyRequirement.trim()));
/** 问题库来源是否已选（未选时【+添加问题】禁用并提示，Round I 用户裁决） */
const hasQuestionSource = computed(() => Boolean(basic.questionSource.trim()));

/** 添加需求条目弹窗状态（交互与选择问题弹窗一致；2026-11-02 起区分 Device/Document 类型） */
const srPickerClause = ref('');
const srPickerType = ref<RequirementType>('device');
const srPickerVisible = computed({
  get: () => Boolean(srPickerClause.value),
  set: (open: boolean) => { if (!open) srPickerClause.value = ''; },
});
const srPickerOptions = computed<SafetyRequirementOption[]>(() => ALL_SR_PICKER_OPTIONS);
/** 弹窗回显 = 该条款已挂接的存储引用值（RF-…，与候选项 value 同体系；存量非 RF 引用不参与勾选） */
const srPickerSelected = computed(() => itemsOf(srPickerClause.value).filter((value) => Boolean(requirementFilterEntryById(value.trim()))));
function openSrPicker(no: string, type: RequirementType): void {
  if (!hasSafetySource.value) {
    Message.warning(t('compliance.versions.config.safetySourceRequired'));
    return;
  }
  srPickerClause.value = no;
  srPickerType.value = type;
}
function onSrPickerConfirm(values: string[]): void {
  // 存量非 RF 引用（旧口径 SR-### 等）在弹窗候选中不存在，确认时原样保留不丢
  const legacy = itemsOf(srPickerClause.value).filter((value) => !requirementFilterEntryById(value.trim()) && !values.includes(value));
  requirementItems.value[srPickerClause.value] = [...values, ...legacy];
  srPickerClause.value = '';
}
/** 行内删除：按 SR 编号移除（兼容存量多值映射到同一单元格的情况） */
function onItemRemove(no: string, code: string): void {
  requirementItems.value[no] = itemsOf(no).filter((value) => srRefOf(value).code !== code);
}

/** 分区分配（2026-11-01 用户裁决：新建默认空值，未选分区表单时字段位不可选） */
function sectionOf(no: string): SectionKey | '' { return sectionAssignments.value[no]?.section ?? ''; }
function fieldOf(no: string): string { return sectionAssignments.value[no]?.field ?? ''; }
function onSectionChange(no: string, value: unknown) {
  const section = String(value ?? '') as SectionKey;
  if (!CLAUSE_SECTION_KEYS.includes(section)) {
    sectionAssignments.value[no] = { section: '', field: '' };
    return;
  }
  sectionAssignments.value[no] = { section, field: '' };
}
function onFieldChange(no: string, value: unknown) {
  const current = sectionAssignments.value[no];
  sectionAssignments.value[no] = { section: current?.section ?? '', field: String(value ?? '') };
}

/* ------------------------------------------------------------------ 测试方法（2026-11-02 用户裁决：只读回显） */

function testMethodOf(no: string): string { return testMethods.value[no] ?? ''; }
/** 「标准库」来源是否已选（测试方法映射随标准库来源自动回显，来源改自天枢 → 本平台「测试方法」菜单维护） */
const hasStandardSource = computed(() => Boolean(basic.standardSource.trim()));

/* ------------------------------------------------------------------ 来源变更确认（2026-11-02 用户裁决：重新选择需慎重） */

/**
 * 三个来源下拉共用确认口径：变更（含清空）且已有会随之失效的已配置数据时，弹窗提醒；
 * 取消 → 下拉保持原值（model-value 未动）；确认 → 应用新值并清空对应配置：
 * - 问题库变更 → 清空全部条款触发规则（触发规则题目来自所选问题库）；
 * - 安全需求变更 → 清空全部条款需求条目（条目来自所选安全需求来源）；
 * - 标准库变更 → 条款数据来源整体更换，清空全部条款配置（触发规则/需求条目/分区分配，
 *   测试方法回显随 standardSource watch 按新来源重填）。
 */
type SourceKind = 'standard' | 'question' | 'safety';
const pendingSource = ref<{ kind: SourceKind; value: string } | null>(null);

/** 是否已有会随来源变更被清空的已配置数据 */
function hasConfiguredData(kind: SourceKind): boolean {
  const hasTriggers = CLAUSES.some((clause) => Boolean((expressions.value[clause.no]?.expr ?? '').trim()));
  const hasItems = CLAUSES.some((clause) => (requirementItems.value[clause.no] ?? []).length > 0);
  if (kind === 'question') return hasTriggers;
  if (kind === 'safety') return hasItems;
  const hasSections = CLAUSES.some((clause) => {
    const draft = sectionAssignments.value[clause.no];
    return Boolean(draft?.section || draft?.field);
  });
  return hasTriggers || hasItems || hasSections;
}

/** 三个来源下拉统一 @change 入口（:model-value 绑定，取消时可原样回退） */
function onSourceChange(kind: SourceKind, value: unknown): void {
  const next = String(value ?? '').trim();
  const current = (kind === 'standard' ? basic.standardSource : kind === 'question' ? basic.questionSource : basic.safetyRequirement).trim();
  if (next === current) return;
  if (!hasConfiguredData(kind)) { applySourceChange(kind, next); return; }
  pendingSource.value = { kind, value: next };
}

function applySourceChange(kind: SourceKind, value: string): void {
  if (kind === 'standard') {
    basic.standardSource = value;
    for (const clause of CLAUSES) {
      expressions.value[clause.no] = { expr: '', exprReadable: '' };
      const row = triggerRows.value[clause.no];
      if (row) { row.tree = null; row.advanced = false; }
      requirementItems.value[clause.no] = [];
      sectionAssignments.value[clause.no] = { section: '', field: '' };
      testMethods.value[clause.no] = '';
    }
    return;
  }
  if (kind === 'question') {
    basic.questionSource = value;
    for (const clause of CLAUSES) {
      expressions.value[clause.no] = { expr: '', exprReadable: '' };
      const row = triggerRows.value[clause.no];
      if (row) { row.tree = null; row.advanced = false; }
    }
    return;
  }
  basic.safetyRequirement = value;
  for (const clause of CLAUSES) requirementItems.value[clause.no] = [];
}

function confirmSourceChange(): void {
  const pending = pendingSource.value;
  if (pending) applySourceChange(pending.kind, pending.value);
  pendingSource.value = null;
}

const sourceChangeText = computed(() => {
  const kind = pendingSource.value?.kind;
  const title = t('compliance.versions.config.sourceChangeTitle');
  if (kind === 'question') return { title, hint: t('compliance.versions.config.sourceChangeQuestionHint') };
  if (kind === 'safety') return { title, hint: t('compliance.versions.config.sourceChangeSafetyHint') };
  return { title, hint: t('compliance.versions.config.sourceChangeStandardHint') };
});

/* ------------------------------------------------------------------ 保存 / 提交发布 */

function inputOf(): RuleVersionInput & { copyFromId?: string } {
  return {
    ruleNo: basic.ruleNo,
    name: basic.name,
    standardSource: basic.standardSource,
    questionSource: basic.questionSource,
    safetyRequirement: basic.safetyRequirement,
    note: basic.note,
    expressions: JSON.parse(JSON.stringify(expressions.value)) as Record<string, RuleVersionExpression>,
    requirementItems: JSON.parse(JSON.stringify(requirementItems.value)) as Record<string, string[]>,
    sectionAssignments: JSON.parse(JSON.stringify(sectionAssignments.value)) as Record<string, ClauseSectionDraft>,
    testMethods: JSON.parse(JSON.stringify(testMethods.value)) as Record<string, string>,
    // 复制（2026-11-02 修复）：透传来源 id，createRuleVersion 兜底带入 input 未覆盖的来源字段（如自定义合规性题 checkCodes）
    ...(isCopy.value ? { copyFromId: copyFromId.value } : {}),
  };
}

function leaveToList() {
  resetSnapshot();
  void router.push({ name: 'rule-versions' });
}

/** 基本信息拦截：必填 + 编号唯一（页面级校验，不进数据层）；返回首个问题文案或空串 */
function basicBlocker(): string {
  const first = [basicFieldIssues.value.ruleNo, basicFieldIssues.value.name, basicFieldIssues.value.standardSource,
    basicFieldIssues.value.questionSource, basicFieldIssues.value.safetyRequirement].find(Boolean);
  return first ?? '';
}

/** 暂存草稿：仅新建/复制/待提交编辑可见；编号与名称必填（来源类字段允许后补） */
function saveDraft() {
  if (busy.value) return;
  submitted.value = true;
  const blocker = basicFieldIssues.value.ruleNo || basicFieldIssues.value.name;
  if (blocker) {
    scrollToFirstIssueBlock();
    Message.warning(blocker);
    return;
  }
  busy.value = true;
  try {
    if (isNew.value) {
      const created = createRuleVersion(inputOf(), OPERATOR);
      Message.success(t('compliance.versions.config.draftSaved', { id: created.ruleNo || created.id }));
      resetSnapshot();
      void router.replace({ name: 'rule-version-edit', params: { versionId: created.id } });
      return;
    }
    updateRuleVersion(editId.value, inputOf(), OPERATOR);
    Message.success(t('compliance.versions.saved'));
    resetSnapshot();
  } finally { busy.value = false; }
}

/** 已发布规则重新发布影响预览与确认 */
const republishConfirm = ref(false);
const republishImpact = ref({ recalculated: 0, locked: 0 });

/** 提交发布：基本信息 + 三个必配区块全部完成才放行；编辑已发布走「保存并发布」确认 */
function submitPublish() {
  if (busy.value) return;
  submitted.value = true;
  publishChecked.value = true;
  const blocker = basicBlocker();
  if (blocker) {
    scrollToFirstIssueBlock();
    Message.warning(blocker);
    return;
  }
  if (issueCount.value) {
    scrollToFirstIssueBlock();
    Message.warning(t('compliance.versions.config.blocked', { count: issueCount.value }));
    return;
  }
  if (isPublishedEdit.value) {
    republishImpact.value = ruleVersionRecalcImpact(editId.value);
    republishConfirm.value = true;
    return;
  }
  busy.value = true;
  try {
    const id = isNew.value ? createRuleVersion(inputOf(), OPERATOR).id : editId.value;
    if (!isNew.value) updateRuleVersion(id, inputOf(), OPERATOR);
    const result = publishRuleVersion(id);
    if (!result.ok) {
      Message.warning(t('compliance.versions.publishBlocked', { count: Object.keys(result.issues).length }));
      return;
    }
    const outcome = recalculateSurveysForRuleVersion(id);
    Message.success(t('compliance.versions.publishedRecalc', { recalc: outcome.recalculated, locked: outcome.locked }));
    leaveToList();
  } finally { busy.value = false; }
}

/** 确认保存并发布：更新 → 重新发布 → 进行中问卷按新规则重算（已锁定问卷跳过） */
function confirmRepublish() {
  if (busy.value || !editId.value) return;
  busy.value = true;
  try {
    updateRuleVersion(editId.value, inputOf(), OPERATOR);
    const result = publishRuleVersion(editId.value);
    if (!result.ok) {
      Message.warning(t('compliance.versions.publishBlocked', { count: Object.keys(result.issues).length }));
      return;
    }
    const outcome = recalculateSurveysForRuleVersion(editId.value);
    Message.success(t('compliance.versions.republished', { recalc: outcome.recalculated, locked: outcome.locked }));
    republishConfirm.value = false;
    leaveToList();
  } finally { busy.value = false; }
}

const pageTitle = computed(() => t(`compliance.versions.config.${isNew.value ? (isCopy.value ? 'copyTitle' : 'createTitle') : 'editTitle'}`));
const statusColor = (value: 'draft' | 'published') => (value === 'published' ? 'green' : 'gray');
</script>

<template>
  <div class="rule-page">
    <!-- 顶部吸顶操作条：左面包屑（hover 上一层级高亮、点击返回列表）+ 右侧操作按钮 -->
    <header ref="barRoot" class="rule-panel cfg-bar" :class="{ 'is-stuck': stuck }">
      <nav class="cfg-crumbs" :aria-label="t('compliance.versions.config.breadcrumb')">
        <router-link class="cfg-crumb-link" :to="{ name: 'rule-versions' }">{{ t('compliance.versions.config.parentCrumb') }}</router-link>
        <span class="cfg-crumb-sep" aria-hidden="true">/</span>
        <span class="cfg-crumb-current" aria-current="page">{{ pageTitle }}</span>
        <span v-if="isCopy" class="cfg-crumb-meta">{{ t('compliance.versions.config.copyFrom', { id: copyFromId }) }}</span>
      </nav>
      <div class="cfg-bar-actions">
        <span v-if="submitted && issueCount" class="cfg-bar-issue">{{ t('compliance.versions.draftIssues', { count: issueCount }) }}</span>
        <a-button class="app-btn-neutral" :disabled="busy" @click="leaveToList()">{{ t('compliance.versions.cancel') }}</a-button>
        <a-button v-if="!isPublishedEdit" class="app-btn-neutral" :loading="busy" @click="saveDraft">{{ t('compliance.versions.config.actionSaveDraft') }}</a-button>
        <a-button type="primary" :loading="busy" @click="submitPublish">
          {{ t(isPublishedEdit ? 'compliance.versions.savePublish' : 'compliance.versions.config.actionSubmit') }}
        </a-button>
      </div>
    </header>
    <p v-if="!missing && (isPublishedEdit || !isNew)" class="rule-panel cfg-status-note">{{ isPublishedEdit ? t('compliance.versions.editPublishedNote') : t('compliance.versions.editDraftNote') }}</p>

    <div v-if="missing" class="rule-panel cfg-missing">
      <a-empty :description="t('compliance.versions.config.missing')" />
    </div>

    <template v-else>
      <!-- 基本信息面板（2026-11-01 用户裁决 / 对齐分区管理编辑页）：标题行带状态标签（无分割线，Round I），
           字段标签在上、控件 500px，必填项标签前置红色星号；编号创建后只读 -->
      <section id="cfg-block-basic" class="rule-panel cfg-basic" :aria-label="t('compliance.versions.basicInfo')">
        <div class="cfg-basic-head">
          <h2 class="cfg-panel-title">{{ t('compliance.versions.basicInfo') }}</h2>
          <a-tag v-if="!isNew" :color="statusColor(status)" size="small">{{ t(`compliance.versions.status.${status}`) }}</a-tag>
        </div>
        <div class="cfg-basics-grid">
          <div class="cfg-field">
            <label for="rule-config-no"><span class="cfg-required" aria-hidden="true">*</span>{{ t('compliance.versions.ruleNo') }}</label>
            <a-input id="rule-config-no" v-model="basic.ruleNo" class="cfg-control" :disabled="!ruleNoEditable"
              :max-length="50" show-word-limit :input-attrs="{ maxlength: 50 }"
              :placeholder="t('compliance.versions.ruleNoPlaceholder')" :aria-invalid="submitted && Boolean(basicFieldIssues.ruleNo)" />
            <p v-if="!ruleNoEditable" class="cfg-field-hint">{{ t('compliance.versions.config.ruleNoLocked') }}</p>
            <p v-if="submitted && basicFieldIssues.ruleNo" class="cfg-issue-text" role="alert">{{ basicFieldIssues.ruleNo }}</p>
          </div>
          <div class="cfg-field">
            <label for="rule-config-name"><span class="cfg-required" aria-hidden="true">*</span>{{ t('compliance.versions.name') }}</label>
            <a-input id="rule-config-name" v-model="basic.name" class="cfg-control"
              :max-length="50" show-word-limit :input-attrs="{ maxlength: 50 }"
              :placeholder="t('compliance.versions.namePlaceholder')" :aria-invalid="submitted && Boolean(basicFieldIssues.name)" />
            <p v-if="submitted && basicFieldIssues.name" class="cfg-issue-text" role="alert">{{ basicFieldIssues.name }}</p>
          </div>
          <div class="cfg-field">
            <label for="rule-config-standard"><span class="cfg-required" aria-hidden="true">*</span>{{ t('compliance.versions.standardSource') }}</label>
            <a-select id="rule-config-standard" :model-value="basic.standardSource" class="cfg-control" allow-search allow-create allow-clear
              :placeholder="t('compliance.versions.standardSourcePlaceholder')" :options="standardOptions"
              :aria-invalid="submitted && Boolean(basicFieldIssues.standardSource)"
              @change="onSourceChange('standard', $event)" />
            <p v-if="submitted && basicFieldIssues.standardSource" class="cfg-issue-text" role="alert">{{ basicFieldIssues.standardSource }}</p>
          </div>
          <div class="cfg-field">
            <label for="rule-config-question-source"><span class="cfg-required" aria-hidden="true">*</span>{{ t('compliance.versions.questionSource') }}</label>
            <a-select id="rule-config-question-source" :model-value="basic.questionSource" class="cfg-control" allow-search allow-create allow-clear
              :placeholder="t('compliance.versions.questionSourcePlaceholder')" :options="questionSourceOptions"
              :aria-invalid="submitted && Boolean(basicFieldIssues.questionSource)"
              @change="onSourceChange('question', $event)" />
            <p v-if="submitted && basicFieldIssues.questionSource" class="cfg-issue-text" role="alert">{{ basicFieldIssues.questionSource }}</p>
          </div>
          <div class="cfg-field">
            <label for="rule-config-safety"><span class="cfg-required" aria-hidden="true">*</span>{{ t('compliance.versions.safetyRequirement') }}</label>
            <a-select id="rule-config-safety" :model-value="basic.safetyRequirement" class="cfg-control" allow-search allow-create allow-clear
              :placeholder="t('compliance.versions.safetyRequirementPlaceholder')" :options="safetyRequirementSelectOptions"
              :aria-invalid="submitted && Boolean(basicFieldIssues.safetyRequirement)"
              @change="onSourceChange('safety', $event)" />
            <p v-if="submitted && basicFieldIssues.safetyRequirement" class="cfg-issue-text" role="alert">{{ basicFieldIssues.safetyRequirement }}</p>
          </div>
          <div class="cfg-field">
            <label for="rule-config-note">{{ t('compliance.versions.note') }}</label>
            <a-textarea id="rule-config-note" v-model="basic.note" :max-length="100" show-word-limit
              :auto-size="{ minRows: 2, maxRows: 4 }" :placeholder="t('compliance.versions.notePlaceholder')" />
          </div>
        </div>
      </section>

      <!-- 「规则配置」区块（2026-11-01 用户裁决：去页签，每条款内分别配置 触发规则/需求条目/分区分配）；
           2026-11-02 用户裁决：条款数据来自「标准库」，未选来源时不渲染条款列表，显示占位提示 -->
      <section id="cfg-rules-panel" class="rule-panel cfg-rules-panel" :aria-label="t('compliance.versions.config.ruleConfig')">
        <div class="cfg-rules-head">
          <h2 class="cfg-panel-title">{{ t('compliance.versions.config.ruleConfig') }}</h2>
        </div>
        <div v-if="hasStandardSource" class="cfg-columns">
              <!-- 左栏：条目导航（章节级 8 行，徽标 = 组内已配置/总条款数，滚动吸顶） -->
              <nav class="cfg-nav" :aria-label="t('compliance.versions.config.triggerNav')">
                <h3 class="cfg-nav-title">{{ t('compliance.versions.config.triggerNav') }}</h3>
                <ul class="cfg-nav-list">
                  <li v-for="nav in navGroups" :key="nav.key">
                    <button
                      type="button"
                      class="cfg-nav-item"
                      :class="{ 'is-active': activeGroup === nav.key }"
                      :aria-current="activeGroup === nav.key ? 'true' : undefined"
                      @click="locateGroup(nav.key)"
                    >
                      <span class="cfg-nav-label">{{ nav.label }}</span>
                      <span class="cfg-nav-badge">{{ nav.configured }}/{{ nav.total }}</span>
                    </button>
                  </li>
                </ul>
              </nav>

              <!-- 主区：分组条款卡（分组标题条 = 主色左竖条 + 浅蓝底，对齐工作台匹配结果） -->
              <div class="cfg-list">
                <section
                  v-for="group in groupedTriggerRows"
                  :id="`cfg-group-${group.key}`"
                  :key="group.key"
                  class="cfg-group-block"
                >
                  <h3 class="cfg-group-banner">
                    <span>{{ group.key }} {{ group.title }}</span>
                    <span class="cfg-group-total">{{ t('compliance.versions.config.groupCount', { count: group.rows.length }) }}</span>
                  </h3>
                  <article v-for="row in group.rows" :id="`cfg-clause-${row.no}`" :key="row.no" class="cfg-clause-card">
                    <header class="cfg-card-head">
                      <span class="cfg-card-no tabular">{{ row.no }}</span>
                      <span class="cfg-card-topic">{{ row.topic }}</span>
                    </header>
                    <!-- 条款原文：默认两行省略，【查看更多】展开 / 收起 -->
                    <p class="cfg-original" :data-no="row.no" :class="{ 'is-clamped': !expandedOriginal.has(row.no) }">{{ originalOf(row.no) }}</p>
                    <button v-if="clampedOriginals.has(row.no) || expandedOriginal.has(row.no)" type="button" class="cfg-link cfg-original-toggle" @click="toggleOriginal(row.no)">
                      {{ t(expandedOriginal.has(row.no) ? 'compliance.versions.config.collapseOriginal' : 'compliance.versions.config.expandOriginal') }}
                    </button>

                    <!-- 触发规则框（2026-11-01 用户裁决：高级表达式开关移入区块标题栏居右） -->
                    <div class="cfg-rule-box">
                      <div class="cfg-rule-head">
                        <span class="cfg-rule-head-title">
                          {{ t('compliance.versions.config.ruleBox') }}
                          <span class="cfg-rule-count">{{ t('compliance.versions.config.linkedQuestions', { count: linkedCount(row) }) }}</span>
                        </span>
                        <span class="cfg-rule-head-tools">
                          <label class="cfg-advanced-toggle">
                            <a-switch :model-value="row.advanced" size="small" :aria-label="t('compliance.versions.config.advanced')" @change="onAdvancedChange(row, $event)" />
                            {{ t('compliance.versions.config.advanced') }}
                          </label>
                          <button
                            type="button"
                            class="cfg-icon-btn"
                            :disabled="!exprText(row.no)"
                            :aria-label="t('compliance.versions.config.clearTitle')"
                            @click="exprText(row.no) && (clearTarget = { no: row.no, kind: 'trigger' })"
                          >
                            <IconDelete :size="14" />
                          </button>
                        </span>
                      </div>
                      <div class="cfg-rule-body">
                        <template v-if="!row.advanced">
                          <!-- 未配置：添加问题按钮居左；未选「问题库」来源时禁用并提示（Round I 用户裁决） -->
                          <div v-if="isTreeEmpty(row.tree)" class="cfg-rule-empty">
                            <a-button size="small" class="app-btn-neutral" :disabled="!hasQuestionSource" @click="openPicker(row.no)">
                              + {{ t('compliance.versions.config.addQuestion') }}
                            </a-button>
                            <span>{{ hasQuestionSource ? t('compliance.versions.config.emptyRule') : t('compliance.versions.config.questionSourceRequired') }}</span>
                          </div>
                          <template v-else-if="row.tree">
                            <TriggerTreeEditor
                              :op="row.tree.op"
                              :children="row.tree.children"
                              :prefix="[]"
                              :question-text="questionText"
                              :op-options="opOptions"
                              @remove="(path) => onTreeRemove(row, path)"
                              @set-child="(path) => onTreeSetChild(row, path)"
                              @unset-child="(path) => onTreeUnsetChild(row, path)"
                              @set-op="(path, value) => onTreeSetOp(row, path, value)"
                              @toggle-negate="(path) => onTreeToggleNegate(row, path)"
                            />
                            <div class="cfg-rule-footer">
                              <a-button size="small" class="app-btn-neutral" :disabled="!hasQuestionSource" @click="openPicker(row.no)">
                                + {{ t('compliance.versions.config.addQuestion') }}
                              </a-button>
                            </div>
                          </template>
                        </template>
                        <div v-else class="cfg-advanced-body">
                          <a-input :model-value="exprText(row.no)" :placeholder="t('compliance.versions.exprPlaceholder')"
                            :aria-label="`${row.no} ${t('compliance.versions.exprExpr')}`"
                            @update:model-value="onAdvancedExpr(row, $event)" />
                          <!-- 未输入时不显示任何提示；有输入且语法错误才红字（2026-11-01 用户裁决） -->
                          <span v-if="exprSyntaxInvalid(row.no)" class="cfg-advanced-readable is-error">
                            {{ t('compliance.versions.config.exprSyntaxError') }}
                          </span>
                          <span v-else-if="hasExprInput(row.no)" class="cfg-advanced-readable">{{ readableText(row.no) }}</span>
                        </div>
                        <p v-if="publishChecked && clauseIssueText(row.no, TRIGGER_ISSUE_KEYS)" class="cfg-issue-text" role="alert">{{ clauseIssueText(row.no, TRIGGER_ISSUE_KEYS) }}</p>
                      </div>
                    </div>

                    <!-- 需求条目框（2026-11-02 用户裁决）：Device/Document 两组，各组独立「+添加需求条目」；
                         计数 = 两组合计，标题栏删除 ico 清空全部 -->
                    <div class="cfg-rule-box">
                      <div class="cfg-rule-head">
                        <span class="cfg-rule-head-title">
                          {{ t('compliance.versions.config.itemsBox') }}
                          <span class="cfg-rule-count">{{ t('compliance.versions.config.selectedRequirements', { count: itemRowsOf(row.no).length }) }}</span>
                        </span>
                        <span class="cfg-rule-head-tools">
                          <button
                            type="button"
                            class="cfg-icon-btn"
                            :disabled="!itemsOf(row.no).length"
                            :aria-label="t('compliance.versions.config.clearItemsTitle')"
                            @click="itemsOf(row.no).length && (clearTarget = { no: row.no, kind: 'items' })"
                          >
                            <IconDelete :size="14" />
                          </button>
                        </span>
                      </div>
                      <div class="cfg-rule-body">
                        <!-- 【旧口径单列结构（2026-11-01，注释保留，可能切回）：单一列表 + 底部/空态添加按钮
                        <ul v-if="false" class="cfg-sr-list">
                          <li v-for="item in itemRowsOf(row.no)" :key="item.code || item.value" class="cfg-sr-row">
                            <span class="cfg-sr-code tabular">{{ item.code }}</span>
                            <div class="cfg-sr-main">
                              <span class="cfg-sr-text" :data-sr-key="srKey(row.no, item.code)" :class="{ 'is-expanded': srExpanded.has(srKey(row.no, item.code)) }">{{ item.content }}</span>
                              <button
                                v-if="srClamped.has(srKey(row.no, item.code)) || srExpanded.has(srKey(row.no, item.code))"
                                type="button"
                                class="cfg-link cfg-original-toggle"
                                @click="toggleSr(row.no, item.code)"
                              >{{ t(srExpanded.has(srKey(row.no, item.code)) ? 'compliance.versions.config.collapseOriginal' : 'compliance.versions.config.expandOriginal') }}</button>
                            </div>
                            <button
                              type="button"
                              class="cfg-icon-btn"
                              :aria-label="t('compliance.versions.config.removeItem')"
                              @click="onItemRemove(row.no, item.code)"
                            >
                              <IconDelete :size="14" />
                            </button>
                          </li>
                        </ul> -->
                        <div v-for="group in srGroupsOf(row.no)" :key="group.type" class="cfg-sr-group">
                          <div class="cfg-sr-group-head">
                            <span class="cfg-sr-group-label">{{ group.label }}</span>
                            <a-button size="small" class="app-btn-neutral" :disabled="!hasSafetySource" @click="openSrPicker(row.no, group.type)">
                              + {{ t('compliance.versions.config.addRequirement') }}
                            </a-button>
                            <span v-if="!hasSafetySource" class="cfg-sr-group-hint">{{ t('compliance.versions.config.safetySourceRequired') }}</span>
                          </div>
                          <ul v-if="group.rows.length" class="cfg-sr-list">
                            <li v-for="item in group.rows" :key="item.code || item.value" class="cfg-sr-row">
                              <div class="cfg-sr-main">
                                <span class="cfg-sr-text" :data-sr-key="srKey(row.no, item.code)" :class="{ 'is-expanded': srExpanded.has(srKey(row.no, item.code)) }">{{ item.content }}</span>
                                <button
                                  v-if="srClamped.has(srKey(row.no, item.code)) || srExpanded.has(srKey(row.no, item.code))"
                                  type="button"
                                  class="cfg-link cfg-original-toggle"
                                  @click="toggleSr(row.no, item.code)"
                                >{{ t(srExpanded.has(srKey(row.no, item.code)) ? 'compliance.versions.config.collapseOriginal' : 'compliance.versions.config.expandOriginal') }}</button>
                              </div>
                              <button
                                type="button"
                                class="cfg-icon-btn"
                                :aria-label="t('compliance.versions.config.removeItem')"
                                @click="onItemRemove(row.no, item.code)"
                              >
                                <IconDelete :size="14" />
                              </button>
                            </li>
                          </ul>
                        </div>
                        <p v-if="publishChecked && clauseIssueText(row.no, ['itemsMissing'])" class="cfg-issue-text" role="alert">{{ clauseIssueText(row.no, ['itemsMissing']) }}</p>
                      </div>
                    </div>

                    <!-- 测试方法框（2026-11-02 用户裁决）：只读回显。映射在「测试方法」菜单维护，
                         选择「标准库」来源后自动回显（编辑/复制沿用规则保存时的映射快照），无需再配置。
                         【旧交互（Round I，注释保留）：条款内单选下拉 + 恢复标准映射按钮，未选「测试方法」来源禁用】 -->
                    <div class="cfg-rule-box">
                      <div class="cfg-rule-head">
                        <span class="cfg-rule-head-title">
                          {{ t('compliance.versions.config.testMethodBox') }}
                          <span class="cfg-rule-count">{{ t('compliance.versions.config.selectedTestMethods', { count: testMethodOf(row.no) ? 1 : 0 }) }}</span>
                        </span>
                      </div>
                      <div class="cfg-rule-body">
                        <!-- 旧交互块：
                        <div class="cfg-rule-head-tools">
                          <button type="button" class="cfg-icon-btn" :disabled="!hasTestMethodSource"
                            :aria-label="t('compliance.versions.config.resetTestMethods')" :title="t('compliance.versions.config.resetTestMethods')"
                            @click="hasTestMethodSource && resetTestMethod(row.no)">
                            <IconRefresh :size="14" />
                          </button>
                        </div>
                        <div class="cfg-tm-row">
                          <a-select :model-value="testMethodOf(row.no)" class="cfg-section-select cfg-testmethod-select" allow-clear allow-search
                            :disabled="!hasTestMethodSource" :placeholder="t('compliance.versions.config.testMethodPlaceholder')"
                            :aria-label="`${row.no} ${t('compliance.versions.config.testMethodBox')}`" :options="testMethodSelectOptions"
                            @change="onTestMethodChange(row.no, $event)" />
                          <span v-if="!hasTestMethodSource" class="cfg-tm-hint">{{ t('compliance.versions.config.testMethodSourceRequired') }}</span>
                        </div>
                        -->
                        <p v-if="!testMethodOf(row.no)" class="cfg-tm-echo is-empty">{{ t('compliance.versions.config.standardSourceRequired') }}</p>
                        <p v-else class="cfg-tm-echo" :aria-label="`${row.no} ${t('compliance.versions.config.testMethodBox')}`">{{ testMethodOf(row.no) }}</p>
                      </div>
                    </div>

                    <!-- 分区分配框：填写分区表单 + 字段位（1:1，未选分区表单时字段位不可选） -->
                    <div class="cfg-rule-box">
                      <div class="cfg-rule-head">
                        <span class="cfg-rule-head-title">{{ t('compliance.versions.config.sectionsBox') }}</span>
                        <span class="cfg-rule-head-tools">
                          <button
                            type="button"
                            class="cfg-icon-btn"
                            :disabled="!sectionOf(row.no) && !fieldOf(row.no)"
                            :aria-label="t('compliance.versions.config.clearSectionsTitle')"
                            @click="(sectionOf(row.no) || fieldOf(row.no)) && (clearTarget = { no: row.no, kind: 'sections' })"
                          >
                            <IconDelete :size="14" />
                          </button>
                        </span>
                      </div>
                      <div class="cfg-rule-body cfg-section-body">
                        <a-select :model-value="sectionOf(row.no)" class="cfg-section-select" allow-clear
                          :placeholder="t('compliance.versions.config.sectionPlaceholder')"
                          :aria-label="`${row.no} ${t('compliance.section')}`"
                          :options="sectionOptions"
                          @change="onSectionChange(row.no, $event)" />
                        <a-select :model-value="fieldOf(row.no)" class="cfg-section-select" allow-clear allow-search
                          :disabled="!sectionOf(row.no)"
                          :placeholder="t('compliance.versions.config.fieldPlaceholder')"
                          :aria-label="`${row.no} ${t('compliance.versions.config.fieldLabel')}`"
                          :options="fieldOptionsOf(sectionOf(row.no) || 'basicInfo')"
                          @change="onFieldChange(row.no, $event)" />
                        <p v-if="publishChecked && clauseIssueText(row.no, ['sectionMissing'])" class="cfg-issue-text" role="alert">{{ clauseIssueText(row.no, ['sectionMissing']) }}</p>
                      </div>
                    </div>
                  </article>
                </section>
              </div>
            </div>
        <!-- 未选「标准库」来源占位（2026-11-02 用户裁决）：条款数据随来源展示，未选时不显示任何条款 -->
        <div v-else class="cfg-rules-empty">
          <a-empty :description="t('compliance.versions.config.standardSourceRequired')" />
        </div>
      </section>

    </template>

    <!-- 编辑已发布规则：保存并发布确认（进行中问卷重算影响预览） -->
    <a-modal :visible="republishConfirm" :title="t('compliance.versions.republishTitle')" :width="456"
      :ok-text="t('compliance.versions.savePublish')" :cancel-text="t('compliance.versions.cancel')"
      :ok-button-props="{ loading: busy }"
      @ok="confirmRepublish" @cancel="republishConfirm = false">
      <p class="modal-confirm-text">{{ t('compliance.versions.republishHint', { name: basic.name, id: basic.ruleNo || editId, recalc: republishImpact.recalculated, locked: republishImpact.locked }) }}</p>
    </a-modal>

    <!-- 清空确认弹窗（触发规则 / 需求条目 / 分区分配 共用，420px 对齐列表页删除弹窗） -->
    <a-modal
      :visible="Boolean(clearTarget)"
      :title="clearModalText.title"
      :width="420"
      :ok-text="clearModalText.ok"
      :cancel-text="t('compliance.versions.cancel')"
      @ok="confirmClear"
      @cancel="clearTarget = null"
    >
      <p class="modal-confirm-text">{{ clearModalText.hint }}</p>
    </a-modal>

    <!-- 来源变更确认（2026-11-02 用户裁决：重新选择标准库/问题库/安全需求需慎重，确认后清空已配置数据） -->
    <a-modal
      :visible="Boolean(pendingSource)"
      :title="sourceChangeText.title"
      :width="420"
      :ok-text="t('compliance.versions.config.sourceChangeConfirm')"
      :cancel-text="t('compliance.versions.cancel')"
      @ok="confirmSourceChange"
      @cancel="pendingSource = null"
    >
      <p class="modal-confirm-text">{{ sourceChangeText.hint }}</p>
    </a-modal>

    <!-- 选择问题弹窗（触发规则【+ 添加问题】）：多选、分页不丢选中 -->
    <QuestionPickerModal
      v-model:visible="pickerVisible"
      :clause-no="pickerClause"
      :questions="pickerQuestions"
      :selected-codes="pickerSelectedCodes"
      @confirm="onPickerConfirm"
      @cancel="pickerVisible = false"
    />

    <!-- 添加需求条目弹窗（需求条目组【+添加需求条目】）：Device/Document 类型切换，交互与选择问题弹窗一致 -->
    <SafetyRequirementPickerModal
      v-model:visible="srPickerVisible"
      :clause-no="srPickerClause"
      :items="srPickerOptions"
      :selected-values="srPickerSelected"
      :initial-type="srPickerType"
      @confirm="onSrPickerConfirm"
      @cancel="srPickerVisible = false"
    />
  </div>
</template>

<style scoped>
/* 页面骨架：Fill-1 画布上的白色面板列（与规则列表页同构，16px 纵向间距） */
.rule-page { display: flex; flex-direction: column; gap: 16px; min-width: 0; min-height: calc(100dvh - 88px); font-size: 14px; color: var(--color-text-1); }
.rule-panel { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }

/* 顶部吸顶操作条：左面包屑、右操作；吸顶时用 Level-4 阴影分层（与 VersionPageHeader 同构） */
.cfg-bar { position: sticky; top: 56px; z-index: 5; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 16px; padding: 12px 16px; transition: box-shadow 160ms ease; }
.cfg-bar.is-stuck { box-shadow: var(--app-shadow-4); }
.cfg-crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; font-size: 14px; line-height: 22px; }
.cfg-crumb-link { color: var(--color-text-2); text-decoration: none; }
.cfg-crumb-link:hover, .cfg-crumb-link:focus-visible { color: var(--app-accent); }
.cfg-crumb-link:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.cfg-crumb-sep { color: var(--color-text-3); }
.cfg-crumb-current { color: var(--color-text-1); font-weight: 600; }
.cfg-crumb-meta { color: var(--color-text-3); font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums; }
.cfg-bar-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-left: auto; }.cfg-bar-issue { margin-right: 4px; color: var(--color-warning, #F77234); font-size: 12px; line-height: 20px; }
.cfg-status-note { margin: 0; padding: 8px 12px; border-radius: 2px; background: var(--mt-fill-1); color: var(--color-text-2); font-size: 12px; line-height: 20px; }
.cfg-missing { padding: 32px 16px; }

/* 基本信息面板（对齐分区管理编辑页 BasicField：标签在上、控件 500px） */
.cfg-basic { scroll-margin-top: 112px; }
.cfg-basic-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.cfg-panel-title { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
/* 2026-11-01 用户裁决：基本信息字段两列排布（字段版块仍为标签在上 + 500px 控件） */
.cfg-basics-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 32px; margin-top: 16px; }
.cfg-field { display: flex; flex-direction: column; gap: 8px; width: 500px; max-width: 100%; }
.cfg-field > label { color: var(--color-text-2); font-size: 14px; line-height: 22px; }
.cfg-control { width: 100%; }
.cfg-required { margin-right: 4px; color: var(--app-color-danger, #F53F3F); }
.cfg-field-hint { margin: 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.cfg-issue-text { margin: 0; color: var(--app-color-danger, #F53F3F); font-size: 12px; line-height: 20px; }

/* 「规则配置」区块（2026-11-01 用户裁决：去页签，条款卡内三子区块） */
.cfg-rules-panel { flex: 1; scroll-margin-top: 112px; }
.cfg-rules-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
/* 未选「标准库」来源占位（2026-11-02 用户裁决）：居中空态 */
.cfg-rules-empty { display: flex; align-items: center; justify-content: center; padding: 48px 16px; }

/* 区块式两栏 = 条目导航（吸顶） + 分组条款卡（对齐工作台匹配结果分组导航）
   2026-11-01 用户裁决：分割线到「条目导航」与「章级标题」的间距统一 16px */
.cfg-columns { display: flex; align-items: stretch; gap: 16px; min-width: 0; margin-top: 16px; }
.cfg-nav { flex: none; width: 240px; align-self: flex-start; position: sticky; top: 112px; padding: 16px; border: 1px solid var(--app-divider); border-radius: 2px; background: var(--app-surface); z-index: 1; }
.cfg-nav-title { margin: 0 0 12px; color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; }
.cfg-nav-list { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
.cfg-nav-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border: 0; border-radius: 2px; background: transparent; color: var(--color-text-2); font: inherit; text-align: left; cursor: pointer; }
.cfg-nav-item:hover { color: var(--app-accent); background: var(--color-fill-1); }
.cfg-nav-item:focus-visible { outline: 2px solid var(--app-accent); outline-offset: -2px; }
/* 当前所在章级（2026-11-01 用户裁决：随滚动高亮，表示正在编辑的章级） */
.cfg-nav-item.is-active { color: var(--app-accent); background: rgb(var(--arcoblue-1)); font-weight: 600; }
.cfg-nav-item.is-active .cfg-nav-badge { color: var(--app-accent); }
.cfg-nav-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cfg-nav-badge { flex: none; color: var(--color-text-3); font-size: 12px; font-variant-numeric: tabular-nums; }
.cfg-list { flex: 1; display: flex; flex-direction: column; gap: 16px; min-width: 0; }

/* 分组标题条：主色左竖条 + 浅蓝底（工作台匹配结果同款）；首个章级标题距分割线 16px 由 .cfg-columns 统一给出 */
.cfg-group-block { scroll-margin-top: 112px; }
.cfg-group-block:first-child .cfg-group-banner { margin-top: 0; }
.cfg-group-banner {
  display: flex; align-items: baseline; gap: 4px; margin: 0 0 8px; padding: 6px 12px;
  border-left: 4px solid var(--app-accent); border-radius: 2px;
  background: rgb(var(--arcoblue-1)); color: var(--color-text-1); font-size: 14px; font-weight: 600; line-height: 22px;
}
.cfg-group-total { font-weight: 400; color: var(--color-text-2); font-size: 12px; }

/* 条款卡 */
.cfg-clause-card { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px; border: 1px solid var(--app-control-border); border-radius: 2px; background: var(--app-surface); }
.cfg-clause-card + .cfg-clause-card { margin-top: 8px; }
.cfg-card-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.cfg-card-no { flex: none; color: var(--app-accent); font-weight: 600; font-variant-numeric: tabular-nums; }
.cfg-card-topic { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-1); font-weight: 600; }
/* 2026-11-01 用户裁决：原文按标准库维护格式原样展示（保留换行与序号） */
.cfg-original { margin: 0; color: var(--color-text-2); line-height: 22px; white-space: pre-line; }
.cfg-original.is-clamped { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.cfg-link { align-self: flex-start; padding: 0; border: 0; background: transparent; color: var(--app-accent); font: inherit; font-size: 12px; line-height: 20px; cursor: pointer; }
.cfg-link:hover, .cfg-link:focus-visible { text-decoration: underline; }
.cfg-link:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }

/* 触发规则框：灰头 + 白底，标题栏左「名称 + 计数」、右「高级表达式开关 + 删除 ico」 */
.cfg-rule-box { border: 1px solid var(--app-control-border); border-radius: 2px; overflow: hidden; }
.cfg-rule-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 12px; background: var(--color-fill-1); color: var(--color-text-2); font-size: 13px; font-weight: 500; line-height: 20px; }
.cfg-rule-head-title { display: inline-flex; align-items: baseline; gap: 8px; min-width: 0; }
.cfg-rule-count { color: var(--color-text-3); font-size: 12px; font-weight: 400; line-height: 20px; font-variant-numeric: tabular-nums; }
.cfg-rule-head-tools { display: inline-flex; align-items: center; gap: 8px; flex: none; }
.cfg-advanced-toggle { display: inline-flex; align-items: center; gap: 4px; color: var(--color-text-2); font-size: 12px; line-height: 20px; cursor: pointer; }
.cfg-rule-body { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.cfg-rule-footer { display: flex; }
.cfg-rule-empty { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; color: var(--color-text-3); font-size: 13px; line-height: 20px; }
.cfg-icon-btn { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 2px; background: transparent; color: rgb(var(--red-6)); cursor: pointer; }
.cfg-icon-btn:hover, .cfg-icon-btn:focus-visible { background: rgb(var(--red-1)); }
.cfg-icon-btn:disabled { color: var(--color-text-4, #C9CDD4); cursor: not-allowed; background: transparent; }
.cfg-icon-btn:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }

/* 高级表达式（问题树无法表达时手写） */
.cfg-advanced-body { display: flex; flex-direction: column; gap: 4px; }
.cfg-advanced-readable { color: var(--color-text-3); font-size: 12px; line-height: 20px; }
/* 语法错误才红字（未输入不显示，2026-11-01 用户裁决） */
.cfg-advanced-readable.is-error { color: var(--app-color-danger, #F53F3F); }

/* 需求条目分组（2026-11-02 用户裁决）：Device:/Document: 标签行 + 组内添加按钮 + 已选行全宽边框 */
.cfg-sr-group { display: flex; flex-direction: column; gap: 8px; }
.cfg-sr-group + .cfg-sr-group { margin-top: 12px; }
.cfg-sr-group-head { display: flex; align-items: center; gap: 8px; }
.cfg-sr-group-label { flex: none; color: var(--color-text-1); font-weight: 600; font-size: 13px; line-height: 24px; }
.cfg-sr-group-hint { color: var(--color-text-3); font-size: 13px; line-height: 20px; }
/* 需求条目已选行：条目原文（保留工作簿换行与序号样式，默认两行省略、超限显示查看更多）+ 行内删除 */
.cfg-sr-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.cfg-sr-row { display: flex; align-items: flex-start; gap: 8px; padding: 8px 12px; border: 1px solid var(--app-divider); border-radius: 2px; }
/* 旧口径单列结构的编号列（注释保留，切回时恢复 <span class="cfg-sr-code">） */
.cfg-sr-code { flex: none; color: var(--app-accent); font-weight: 600; font-size: 12px; line-height: 20px; }
.cfg-sr-main { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.cfg-sr-text { align-self: stretch; display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; -webkit-line-clamp: 2; color: var(--color-text-1); font-size: 13px; line-height: 20px; white-space: pre-line; word-break: break-word; }
.cfg-sr-text.is-expanded { display: block; overflow: visible; -webkit-line-clamp: unset; }
.cfg-sr-row .cfg-icon-btn { flex: none; }

/* 分区分配：分区表单 + 字段位纵排（2026-11-01 用户裁决，对齐交互稿）
   注意：a-select 根节点不带本组件 scoped data-v 属性，宽度必须走 :deep() 才能命中 */
.cfg-section-body { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
.cfg-section-body :deep(.cfg-section-select) { width: 500px; max-width: 100%; }
/* 测试方法回显（2026-11-02 用户裁决）：只读文本；未选标准库来源时显示引导提示
   【旧交互样式（注释保留）：.cfg-tm-row 下拉 500px 居左 + 提示在下拉右侧】
.cfg-tm-row { display: flex; align-items: center; gap: 8px; }
.cfg-tm-row :deep(.cfg-testmethod-select) { flex: none; width: 500px; max-width: 100%; }
.cfg-tm-hint { color: var(--color-text-3); font-size: 12px; line-height: 20px; }
*/
.cfg-tm-echo { margin: 0; color: var(--color-text-1); font-size: 13px; line-height: 20px; word-break: break-word; white-space: pre-line; }
.cfg-tm-echo.is-empty { color: var(--color-text-3); }

.tabular { font-variant-numeric: tabular-nums; }
.modal-confirm-text { margin: 0; color: var(--color-text-1); font-size: 14px; line-height: 22px; }

@media (max-width: 1100px) {
  .cfg-columns { flex-direction: column; }
  .cfg-nav { position: static; width: auto; }
}

@media (max-width: 760px) {
  .cfg-bar-actions { width: 100%; }
  .cfg-section-body :deep(.cfg-section-select) { width: 100%; }
}
</style>
