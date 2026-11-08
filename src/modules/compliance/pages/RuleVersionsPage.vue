<script setup lang="ts">
/**
 * 规则管理（2026-10-29 更名自「条款规则」，一级菜单）：条款 × 问题的映射规则列表。
 *
 * 职责：按业务场景构建「问题-条款映射关系」——一份规则 = 38 条款的或/且映射表达式 + 参与判定的题集。
 * - 状态两态：待提交 / 已发布（2026-10-29 用户裁决）；停用语义由「是否启用」开关承载，
 *   停用规则不进新建问卷候选，历史问卷不受影响；
 * - 全部状态支持原地【编辑】（版本号不变）：已发布「保存并发布」后，引用此规则且匹配审批
 *   未通过的问卷按新规则重算自动初筛（人工确认值保留），已锁定问卷不受影响；
 * - 新建 / 编辑 / 复制 跳转子页面 RuleVersionConfigPage（三 tab：触发条件 / 需求条目 / 分区分配，
 *   2026-11 抽屉子页面化）；本页只保留发布（待提交）、删除守卫与启用开关；
 * - 操作（2026-11-02 用户裁决，对齐表单列表）：详情 / 编辑直显，发布（仅草稿）/ 复制 / 删除
 *   进「…」更多下拉（hover 触发、右下弹出，删除项危险色）；操作列宽 210 → 170；
 *   删除守卫：被进行中问卷引用的规则不可删（历史快照冻结可追溯）；
 * - 列表支持列设置、筛选条件设置与分页（五档 10/20/50/100/200）；
 *   创建时间与最近更新时间支持升降序，题目数不排序（2026-10-30 用户裁决）；
 *   默认无激活排序，列表按最近更新时间倒序（新建项置顶）；
 *   规则名称 / 标准库 / 问题库 / 安全需求列单元格全显换行（2026-10-29 用户裁决）；
 *   规则说明及其余短文本列单行省略号，由 Arco `column.ellipsis` 承载（见 WRAP_COLUMNS 注释）；
 *   来源类筛选下拉可输入关键词搜索，触发器 200px 不变、弹层自适应全显单行选项
 *   （SOURCE_TRIGGER_PROPS + global.css `.rule-source-dropdown`，2026-10-29 用户裁决）；
 *   筛选控件一律 200px（含来源类下拉与日期区间，DESIGN.md Filter geometry 无例外）。
 * - 发布前经数据层校验（缺表达式、语法、层级、叶子题等），未通过则阻断发布并给出计数。
 *
 * 版式（DESIGN.md · Section list and child-route composition）：
 * - 区块 1 = 筛选条件，区块 2 = 列表（标题 + 条数 + 新建 + 列设置 + 表格 + 分页），两块白面板 16px 间距。
 */
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { Message, type SelectOptionData, type TableColumnData, type TriggerProps } from '@arco-design/web-vue';
import {
  IconDownload, IconExclamationCircle, IconFilter, IconFolder, IconLeft, IconMore, IconPlus, IconRefresh, IconRight, IconSearch, IconSettings, IconUpload,
} from '@arco-design/web-vue/es/icon';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import ColumnSettingsPopover, { type ColumnSettingsItem } from '../../../shared/components/ColumnSettingsPopover.vue';
import { useTaskCenterStore } from '../../task-center/stores/taskCenter';
import { recalculateSurveysForRuleVersion, ruleVersionRecalcImpact, ruleVersionUsage } from '../../surveys/data/matching';
import { MOCK_CURRENT_USER } from '../../surveys/data/surveys';
import { surveyTemplates } from '../../templates/data/templates';
import { safetyRequirementOptions } from '../data/safetyRequirements';
import {
  applyRuleImport, downloadWorkbook, makeErrors, makeExport, makeTemplate, parseWorkbook,
  type ParsedRuleWorkbook,
} from '../data/ruleWorkbook';
import {
  deleteRuleVersion, isRuleVersionEnabled, listRuleVersions,
  publishRuleVersion, ruleVersionIssues, RULE_VERSION_STATUSES, setRuleVersionEnabled,
  standardSourceOptions,
  type RuleVersion, type RuleVersionStatus,
} from '../data/ruleVersions';

const { t } = useI18n();
const router = useRouter();
const OPERATOR = MOCK_CURRENT_USER.name;

/* ------------------------------------------------------------------ 筛选（草稿 → 应用） */

const FILTER_KEYS = ['keyword', 'status', 'standardSource', 'questionSource', 'safetyRequirement', 'creator', 'createdAt', 'updatedAt', 'enabled'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

interface RuleFilters {
  keyword: string;
  status: RuleVersionStatus[];
  /** 标准库（天枢-标准库，'标准编号-标准名称'） */
  standardSource: string;
  /** 问题库（'问题库编号-问题库名称'） */
  questionSource: string;
  /** 安全需求（天枢「安全需求」模块，'条目号-摘要'） */
  safetyRequirement: string;
  /** 创建人（默认隐藏，筛选设置可开） */
  creator: string;
  /** 日期区间 [起, 止]，YYYY-MM-DD；空串表示该端不限 */
  createdAt: string[];
  updatedAt: string[];
  /** 是否启用（'yes' | 'no' | ''，空 = 不限；默认隐藏，筛选设置可开） */
  enabled: string;
}

const defaultFilters = (): RuleFilters => ({
  keyword: '', status: [], standardSource: '', questionSource: '', safetyRequirement: '', creator: '', createdAt: [], updatedAt: [], enabled: '',
});

const draftFilters = reactive<RuleFilters>(defaultFilters());
const applied = reactive<RuleFilters>(defaultFilters());

/** 关键词、状态、标准库、问题库、安全需求、创建时间常显；更新时间（最近更新时间）、创建人、是否启用默认收起（筛选设置可开，2026-10-30 用户裁决） */
const DEFAULT_VISIBLE_FILTERS: FilterKey[] = ['keyword', 'status', 'standardSource', 'questionSource', 'safetyRequirement', 'createdAt'];

/**
 * 来源类下拉（标准库/问题库/安全需求，2026-10-29 用户裁决）：
 * - 可输入关键词搜索过滤选项（allow-search + filter-option 大小写不敏感包含匹配）；
 * - 触发器保持 200px（DESIGN.md Filter geometry 无例外），弹层不收缩到触发器宽——
 *   关闭 Arco 默认的 autoFitPopupWidth（弹层宽度=触发器宽度，长选项被省略号截断），
 *   改开 autoFitPopupMinWidth（200px 下限）+ contentClass 全局样式（自适应最长选项全显单行，
 *   见 global.css `.rule-source-dropdown`）。
 */
const SOURCE_TRIGGER_PROPS: TriggerProps = {
  autoFitPopupWidth: false,
  autoFitPopupMinWidth: true,
  contentClass: 'rule-source-dropdown',
};
const sourceFilterOption = (inputValue: string, option: SelectOptionData) =>
  String(option.label ?? '').toLowerCase().includes(String(inputValue).trim().toLowerCase());

const standardSourceFilterOptions = computed(() => standardSourceOptions().map((value) => ({ value, label: value })));

/** 问题库候选 = 问题库清单（'问题库编号-问题库名称'） */
const questionSourceFilterOptions = computed(() =>
  [...new Set(surveyTemplates.map((item) => `${item.id}-${item.name}`))].map((value) => ({ value, label: value })));

/** 安全需求候选 = 天枢「安全需求」模块（'条目号-摘要'） */
const safetyRequirementFilterOptions = computed(() => safetyRequirementOptions().map((value) => ({ value, label: value })));

const creatorOptions = computed(() => [...new Set(listRuleVersions().map((item) => item.createdBy).filter(Boolean))]
  .sort((left, right) => left.localeCompare(right))
  .map((name) => ({ value: name, label: name })));

const statusOptions = computed(() => RULE_VERSION_STATUSES.map((status) => ({ value: status, label: t(`compliance.versions.status.${status}`) })));

const enabledOptions = computed(() => [
  { value: 'yes', label: t('compliance.versions.filters.enabledYes') },
  { value: 'no', label: t('compliance.versions.filters.enabledNo') },
]);

const statusModel = computed({
  get: () => draftFilters.status,
  set: (value: RuleVersionStatus[] | undefined) => { draftFilters.status = Array.isArray(value) ? value : []; },
});

function isRangeKey(key: FilterKey): key is 'createdAt' | 'updatedAt' {
  return key === 'createdAt' || key === 'updatedAt';
}

/** Arco 区间选择器清除时会把 modelValue 置为 undefined，统一归一到 string[] */
function rangeModel(key: 'createdAt' | 'updatedAt') {
  return computed<string[]>({
    get: () => draftFilters[key],
    set: (value: unknown) => { draftFilters[key] = Array.isArray(value) ? value.map((item) => String(item)) : []; },
  });
}

const createdRangeModel = rangeModel('createdAt');
const updatedRangeModel = rangeModel('updatedAt');

function applyFilters() {
  const copyRange = (range: string[]) => (Array.isArray(range) ? [...range] : []);
  Object.assign(applied, {
    ...draftFilters, status: [...draftFilters.status],
    createdAt: copyRange(draftFilters.createdAt), updatedAt: copyRange(draftFilters.updatedAt),
  });
  page.value = 1;
}

function resetFilters() {
  Object.assign(draftFilters, defaultFilters());
  Object.assign(applied, defaultFilters());
  page.value = 1;
}

function filterLabel(key: FilterKey) { return t(`compliance.versions.filters.${key}`); }

/** 条件一律回显在筛选控件里（2026-10-27 用户裁决）；这里仅判定“是否有已应用条件”供空态使用 */
const hasAppliedFilters = computed(() =>
  Boolean(applied.keyword.trim() || applied.status.length || applied.standardSource || applied.questionSource
    || applied.safetyRequirement || applied.creator || applied.enabled)
  || (['createdAt', 'updatedAt'] as const).some((key) => Boolean(applied[key][0] || applied[key][1])));

interface FilterSetting { key: FilterKey; visible: boolean }
const defaultFilterSettings: FilterSetting[] = FILTER_KEYS.map((key) => ({ key, visible: DEFAULT_VISIBLE_FILTERS.includes(key) }));
const filterSettings = ref<FilterSetting[]>(defaultFilterSettings.map((setting) => ({ ...setting })));
const filterSettingsOpen = ref(false);
const visibleFilterKeys = computed(() => filterSettings.value.filter((setting) => setting.visible).map((setting) => setting.key));

function settingItems(list: FilterSetting[]): ColumnSettingsItem[] {
  return list.map((setting) => ({ key: setting.key, label: filterLabel(setting.key), visible: setting.visible, disabled: setting.key === 'keyword' }));
}
const filterSettingsItems = computed(() => settingItems(filterSettings.value));
const defaultFilterItems = computed(() => settingItems(defaultFilterSettings));

function onFilterSettingsChanged(next: ColumnSettingsItem[]) {
  filterSettings.value = next.map((item) => ({ key: item.key as FilterKey, visible: item.visible }));
}

/* ------------------------------------------------------------------ 行数据与筛选 */

const versionRows = computed(() => [...listRuleVersions()].map((version) => ({
  ...version,
  questionCount: version.questionSet.length,
  problemCount: Object.keys(ruleVersionIssues(version)).length,
})));

const rows = computed(() => versionRows.value.filter((row) => {
  const keyword = applied.keyword.trim().toLowerCase();
  if (keyword && !`${row.ruleNo} ${row.name}`.toLowerCase().includes(keyword)) return false;
  if (applied.status.length && !applied.status.includes(row.status)) return false;
  if (applied.standardSource && row.standardSource !== applied.standardSource) return false;
  if (applied.questionSource && row.questionSource !== applied.questionSource) return false;
  if (applied.safetyRequirement && row.safetyRequirement !== applied.safetyRequirement) return false;
  if (applied.creator && row.createdBy !== applied.creator) return false;
  if (applied.enabled === 'yes' && !isRuleVersionEnabled(row)) return false;
  if (applied.enabled === 'no' && isRuleVersionEnabled(row)) return false;
  const createdDay = row.createdAt.slice(0, 10);
  if (applied.createdAt[0] && createdDay < applied.createdAt[0]) return false;
  if (applied.createdAt[1] && createdDay > applied.createdAt[1]) return false;
  const updatedDay = row.updatedAt.slice(0, 10);
  if (applied.updatedAt[0] && updatedDay < applied.updatedAt[0]) return false;
  if (applied.updatedAt[1] && updatedDay > applied.updatedAt[1]) return false;
  return true;
}));

/* 排序（2026-10-30 用户裁决）：创建时间 / 最近更新时间支持升降序；题目数不排序（表头不带升降序图标）。
   默认无激活排序，列表按最近更新时间倒序展示（新建项置顶） */
const sortField = ref<'createdAt' | 'updatedAt' | ''>('');
const sortOrder = ref<'ascend' | 'descend' | ''>('');

function onSorterChange(field: string, direction: string) {
  sortField.value = (field === 'createdAt' || field === 'updatedAt') && direction ? field as 'createdAt' | 'updatedAt' : '';
  sortOrder.value = direction === 'ascend' ? 'ascend' : direction === 'descend' ? 'descend' : '';
}

const sortedRows = computed(() => {
  const list = [...rows.value];
  if (sortField.value && sortOrder.value) {
    const field = sortField.value;
    const direction = sortOrder.value === 'ascend' ? 1 : -1;
    list.sort((left, right) => {
      const leftValue = left[field];
      const rightValue = right[field];
      if (leftValue < rightValue) return -1 * direction;
      if (leftValue > rightValue) return 1 * direction;
      return 0;
    });
    return list;
  }
  return list.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
});

/* ------------------------------------------------------------------ 分页（五档 10/20/50/100/200） */

const page = ref(1);
const pageSize = ref(10);
const jumpPage = ref(1);
const totalPages = computed(() => Math.max(1, Math.ceil(sortedRows.value.length / pageSize.value)));
const pagedRows = computed(() => sortedRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));

const pageNumbers = computed(() => {
  const windowSize = Math.min(totalPages.value, 5);
  const start = Math.min(Math.max(page.value - Math.floor(windowSize / 2), 1), totalPages.value - windowSize + 1);
  return Array.from({ length: windowSize }, (_, index) => start + index);
});

function setPage(value: number) {
  page.value = Math.min(Math.max(value, 1), totalPages.value);
  jumpPage.value = page.value;
}
function handlePageSizeChange(value: unknown) {
  const nextSize = Number(value);
  if (!Number.isFinite(nextSize) || nextSize <= 0) return;
  pageSize.value = nextSize;
  setPage(1);
}

/* ------------------------------------------------------------------ 列设置 */

type ColumnKey = 'ruleNo' | 'name' | 'status' | 'standardSource' | 'questionSource' | 'safetyRequirement' | 'note' | 'questionCount' | 'creator' | 'createdAt' | 'updater' | 'updatedAt' | 'enabled';
/** 列顺序（2026-10-29 用户需求；2026-11-02 增补：安全需求右侧新增测试方法）：规则编号、规则名称、规则状态、标准库、问题库、安全需求、测试方法、规则说明、题目数、创建人、创建时间、更新人、最近更新时间、是否启用 */
const COLUMN_KEYS: ColumnKey[] = ['ruleNo', 'name', 'status', 'standardSource', 'questionSource', 'safetyRequirement', 'note', 'questionCount', 'creator', 'createdAt', 'updater', 'updatedAt', 'enabled'];
/** 默认可见列：规则说明 / 创建人 / 创建时间 / 更新人 / 最近更新时间默认隐藏（列设置可开，2026-10-30 用户裁决） */
const DEFAULT_VISIBLE: ColumnKey[] = ['ruleNo', 'name', 'status', 'standardSource', 'questionSource', 'safetyRequirement', 'questionCount', 'enabled'];
const SORTABLE_COLUMNS: ColumnKey[] = ['createdAt', 'updatedAt'];

const defaultColumns: ColumnSettingsItem[] = COLUMN_KEYS.map((key) => ({
  key, label: key, visible: DEFAULT_VISIBLE.includes(key), disabled: key === 'ruleNo',
}));
const columns = ref<ColumnSettingsItem[]>(defaultColumns.map((item) => ({ ...item })));
const columnSettingsOpen = ref(false);
const localizedColumns = computed(() => columns.value.map((item) => ({ ...item, label: t(`compliance.versions.fields.${item.key}`) })));
const localizedDefaultColumns = computed(() => defaultColumns.map((item) => ({ ...item, label: t(`compliance.versions.fields.${item.key}`) })));

const columnWidths: Record<ColumnKey, number> = {
  ruleNo: 110, name: 240, status: 100, standardSource: 230, questionSource: 230, safetyRequirement: 260, note: 260, questionCount: 100,
  creator: 100, createdAt: 170, updater: 100, updatedAt: 170, enabled: 90,
};

/**
 * 全显换行列（2026-10-29 用户裁决）：规则名称 / 标准库 / 问题库 / 安全需求 多行全显，不用省略号。
 * 其余文本列单行省略号由 Arco `column.ellipsis` 承载（动态渲染 `arco-table-text-ellipsis` class）。
 * 不用自定义静态 class span 的原因（2026-10-29 定位）：Arco table body 的 td 以 `td-${index}`
 * 为 key，列设置增删列后同位 td 组件被复用，Vue 对编译产物 patchFlag=1（仅 TEXT）的 slot
 * vnode 只更新文本、不补丁静态 class，导致后开列残留前列的 class（如规则说明残留 tabular
 * 换行成 3 行）；纯文本 slot 与 Arco 动态 class 均可被正确补丁。
 */
const WRAP_COLUMNS: ColumnKey[] = ['name', 'standardSource', 'questionSource', 'safetyRequirement'];
const ELLIPSIS_COLUMNS: ColumnKey[] = ['ruleNo', 'note', 'questionCount', 'creator', 'createdAt', 'updater', 'updatedAt'];

const tableColumns = computed<TableColumnData[]>(() => {
  const dataColumns = columns.value.filter((item) => item.visible).map((item): TableColumnData => ({
    title: t(`compliance.versions.fields.${item.key}`),
    dataIndex: item.key,
    slotName: item.key,
    width: columnWidths[item.key as ColumnKey],
    align: 'left',
    ...(ELLIPSIS_COLUMNS.includes(item.key as ColumnKey) ? { ellipsis: true } : {}),
    /* 受控排序方向必须走 sortable.sortOrder（列顶层 sortOrder prop 会被 Arco 忽略）：
       '' = 无激活方向，ascend/descend = 表头图标高亮；点击循环 由 @sorter-change 回写本状态 */
    ...(SORTABLE_COLUMNS.includes(item.key as ColumnKey)
      ? { sortable: { sortDirections: ['ascend', 'descend'] as const, sortOrder: sortField.value === item.key ? sortOrder.value : '' } }
      : {}),
  }));
  return [...dataColumns, { title: t('compliance.versions.fields.actions'), dataIndex: 'actions', slotName: 'actions', width: 170, align: 'left', fixed: 'right' }];
});

const horizontalWidth = computed(() => tableColumns.value.reduce((total, column) => total + Number(column.width ?? 140), 0));

function onColumnsChanged(next: ColumnSettingsItem[]) {
  columns.value = next.map((item) => ({ key: item.key, label: item.key, visible: item.visible, disabled: item.key === 'ruleNo' }));
}

/* ------------------------------------------------------------------ 新建 / 编辑 / 复制 → 子页面（2026-11 抽屉子页面化） */

/**
 * 新建（可选复制来源 ?from=vX：带入来源规则的映射起步）与编辑（全部状态原地编辑）
 * 均跳转子页面 RuleVersionConfigPage；本页只保留发布（待提交）、删除守卫与启用开关。
 */
function goCreate(copyFromId?: string) {
  void router.push(copyFromId
    ? { name: 'rule-version-new', query: { from: copyFromId } }
    : { name: 'rule-version-new' });
}
function goEdit(id: string) {
  void router.push({ name: 'rule-version-edit', params: { versionId: id } });
}
/** 规则详情（2026-10-30 用户裁决）：基本信息 + 条款触发规则表（原条款判定页迁入） */
function goDetail(id: string) {
  void router.push({ name: 'rule-version-detail', params: { versionId: id } });
}

const statusColor = (status: RuleVersionStatus) => (status === 'published' ? 'green' : 'gray');

/* ------------------------------------------------------------------ 行操作（前两个直显 + 「…」更多，2026-11-02 用户裁决） */

type RowActionKey = 'detail' | 'edit' | 'publish' | 'copy' | 'delete';
interface RowAction { key: RowActionKey; label: string; danger?: boolean; run: (version: RuleVersion) => void }

/**
 * 行操作顺序（对齐表单列表交互）：详情、编辑、发布（仅草稿）、复制、删除；
 * 前两个直显，其余进「…」更多下拉（DESIGN.md 表格章节：操作单元格承载 1–3 个文字按钮）。
 */
function rowActions(version: RuleVersion): RowAction[] {
  const primary: RowAction[] = [
    { key: 'detail', label: t('compliance.detail'), run: (row) => goDetail(row.id) },
    { key: 'edit', label: t('compliance.versions.edit'), run: (row) => goEdit(row.id) },
  ];
  const more: RowAction[] = [];
  if (version.status === 'draft') {
    more.push({ key: 'publish', label: t('compliance.versions.publish'), run: (row) => { publishTarget.value = row; } });
  }
  more.push({ key: 'copy', label: t('compliance.versions.copy'), run: (row) => goCreate(row.id) });
  more.push({ key: 'delete', label: t('compliance.versions.delete'), danger: true, run: (row) => { deleteTarget.value = row; } });
  return [...primary, ...more];
}

const PRIMARY_ACTION_COUNT = 2;
const primaryRowActions = (version: RuleVersion) => rowActions(version).slice(0, PRIMARY_ACTION_COUNT);
const moreRowActions = (version: RuleVersion) => rowActions(version).slice(PRIMARY_ACTION_COUNT);

/* ------------------------------------------------------------------ 发布 / 删除 / 启用开关 */

const publishTarget = ref<RuleVersion | null>(null);
/** 发布影响预览（弹窗文案计数）：可重算问卷数 + 已锁定（匹配审批已通过）问卷数 */
const publishImpact = computed(() => (publishTarget.value
  ? ruleVersionRecalcImpact(publishTarget.value.id)
  : { recalculated: 0, locked: 0 }));
function confirmPublish() {
  if (!publishTarget.value) return;
  const result = publishRuleVersion(publishTarget.value.id);
  if (!result.ok) {
    Message.warning(t('compliance.versions.publishBlocked', { count: Object.keys(result.issues).length }));
    publishTarget.value = null;
    return;
  }
  // 发布生效后联动：引用此规则且匹配审批未通过的问卷按新规则重算自动初筛
  const outcome = recalculateSurveysForRuleVersion(publishTarget.value.id);
  Message.success(t('compliance.versions.publishedRecalc', { recalc: outcome.recalculated, locked: outcome.locked }));
  publishTarget.value = null;
}

const deleteTarget = ref<RuleVersion | null>(null);
/** 删除守卫（2026-10-29 用户裁决）：被进行中问卷引用的规则不可删，历史快照冻结可追溯 */
function confirmDelete() {
  if (!deleteTarget.value) return;
  const target = deleteTarget.value;
  const usage = ruleVersionUsage()[target.id];
  if (usage && usage.inProgress > 0) {
    Message.warning(t('compliance.versions.deleteGuard', { inProgress: usage.inProgress, total: usage.total }));
    deleteTarget.value = null;
    return;
  }
  deleteRuleVersion(target.id);
  Message.success(t('compliance.versions.deleted'));
  deleteTarget.value = null;
}

/** 「是否启用」开关：直接切换留审计痕迹；待提交规则不参与（开关置灰） */
function toggleEnabled(record: RuleVersion, value: unknown) {
  setRuleVersionEnabled(record.id, Boolean(value), OPERATOR);
  Message.success(t(Boolean(value) ? 'compliance.versions.enabledOn' : 'compliance.versions.enabledOff'));
}

/* ---------------------------------------------------------------- 批量导出（确认弹窗 → 任务中心下载任务，DESIGN.md baseline） */

const exportOpen = ref(false);
const exporting = ref(false);

function clockText(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function stampText(date: Date, kind: 'date' | 'datetime'): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const ymd = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return kind === 'date' ? ymd : `${ymd}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** 导出永远作用于当前已应用筛选结果；结果为空仅提示，不开确认弹窗 */
function requestExport() {
  if (exporting.value) return;
  if (!rows.value.length) { Message.info(t('compliance.versions.exportNotice.empty')); return; }
  exportOpen.value = true;
}

async function confirmExport() {
  if (exporting.value || !rows.value.length) return;
  exporting.value = true;
  try {
    const blob = await makeExport(rows.value);
    const now = new Date();
    const taskCenter = useTaskCenterStore();
    taskCenter.addDownloadTask({
      id: `dl-${now.getTime()}`, module: 'rules',
      fileStamp: stampText(now, 'datetime'),
      operator: OPERATOR, time: clockText(now),
      status: 'processing', progress: 92,
      fileUrl: URL.createObjectURL(blob),
      fileName: `规则管理_${now.toISOString().slice(0, 10)}.xlsx`,
    });
    exportOpen.value = false;
    Message.success(t('compliance.versions.exportNotice.created'));
    taskCenter.open('download');
  } catch { Message.error(t('compliance.versions.import.fail')); }
  finally { exporting.value = false; }
}

/* ---------------------------------------------------------------- 批量导入（抽屉 + 任务中心，DESIGN.md baseline） */

const importOpen = ref(false);
const importing = ref(false);
const importingFile = ref(false);
const selectedFile = ref<File | null>(null);
const parsed = ref<ParsedRuleWorkbook | null>(null);
const preparingTemplate = ref(false);
let templateBlob: Blob | null = null;
let templateDownload: ((blob: Blob, fileName: string) => void) | null = null;
const fileInput = ref<HTMLInputElement | null>(null);

const viewportWidth = ref(window.innerWidth);
function onViewportResize() { viewportWidth.value = window.innerWidth; }
window.addEventListener('resize', onViewportResize);
onBeforeUnmount(() => window.removeEventListener('resize', onViewportResize));

function openImport() {
  selectedFile.value = null;
  parsed.value = null;
  importOpen.value = true;
  if (!templateBlob) void prepareTemplate();
}
async function prepareTemplate() {
  if (preparingTemplate.value) return;
  preparingTemplate.value = true;
  try {
    templateBlob = await makeTemplate();
    templateDownload = downloadWorkbook;
  } catch { Message.error(t('compliance.versions.import.templateError')); }
  finally { preparingTemplate.value = false; }
}
async function ingestFile(file: File) {
  if (importingFile.value || importing.value) return;
  selectedFile.value = file;
  parsed.value = null;
  importingFile.value = true;
  try {
    parsed.value = await parseWorkbook(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    Message.error(t(
      message === 'fileType' ? 'compliance.versions.import.type'
        : message === 'fileSize' ? 'compliance.versions.import.size'
          : message === 'sheetMissing' ? 'compliance.versions.import.missingSheet'
            : message.startsWith('headersMissing:') ? 'compliance.versions.import.missingHeaders'
              : 'compliance.versions.import.invalid',
      { headers: message.split(':')[1] ?? '' },
    ));
  } finally { importingFile.value = false; }
}
function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = '';
  if (file) void ingestFile(file);
}
function onDropFile(event: DragEvent) {
  if (importingFile.value || importing.value) return;
  const file = event.dataTransfer?.files?.[0];
  if (file) void ingestFile(file);
}

const importNotes = computed(() => [1, 2, 3, 4, 5, 6].map((index) => t(`compliance.versions.import.note${index}`)));

async function downloadErrors() {
  if (!parsed.value?.failures.length) return;
  try {
    downloadWorkbook(await makeErrors(parsed.value.failures), `规则管理_导入错误数据_${stampText(new Date(), 'datetime')}.xlsx`);
  } catch { Message.error(t('compliance.versions.import.fail')); }
}
function downloadTemplate() {
  if (!templateBlob || !templateDownload) { void prepareTemplate(); return; }
  try {
    templateDownload(templateBlob, '规则管理导入模版.xlsx');
  } catch { Message.error(t('compliance.versions.import.templateError')); }
}

async function confirmImport() {
  if (!parsed.value || importing.value || !parsed.value.items.length) return;
  importing.value = true;
  try {
    const result = applyRuleImport(parsed.value.items, OPERATOR);
    const failed = parsed.value.failures.length;
    const now = new Date();
    let errorUrl: string | undefined;
    let errorName: string | undefined;
    if (failed) {
      errorUrl = URL.createObjectURL(await makeErrors(parsed.value.failures));
      errorName = `规则管理_导入错误数据_${stampText(now, 'datetime')}.xlsx`;
    }
    const taskCenter = useTaskCenterStore();
    taskCenter.addImportTask({
      id: `imp-${now.getTime()}`, module: 'rules',
      fileStamp: stampText(now, 'date'),
      operator: OPERATOR, time: clockText(now),
      status: 'processing', progress: 92,
      total: result.created + result.updated + failed, ok: result.created + result.updated, fail: failed,
      errorUrl, errorName,
    });
    importOpen.value = false;
    Message.success(t('compliance.versions.import.submitted'));
    taskCenter.open('import');
  } catch { Message.error(t('compliance.versions.import.fail')); }
  finally { importing.value = false; }
}
</script>

<template>
  <div class="rule-page">
    <!-- 区块 1：筛选条件（支持筛选条件设置） -->
    <section class="rule-panel" :aria-label="t('compliance.filtersLabel')">
      <form class="rule-query" @submit.prevent="applyFilters">
        <label v-for="key in visibleFilterKeys" :key="key" class="rule-filter-field"
          :class="{ 'rule-filter-field--range': isRangeKey(key) }">
          <span>{{ filterLabel(key) }}</span>
          <a-input v-if="key === 'keyword'" v-model="draftFilters.keyword" class="app-filter-control" allow-clear :placeholder="t('compliance.versions.filters.keywordPlaceholder')" />
          <a-select v-else-if="key === 'status'" v-model="statusModel" class="app-filter-control" multiple allow-clear :max-tag-count="1" :placeholder="t('compliance.versions.filters.all')" :options="statusOptions" />
          <a-select v-else-if="key === 'standardSource'" v-model="draftFilters.standardSource" class="app-filter-control" allow-clear allow-search
            :filter-option="sourceFilterOption" :trigger-props="SOURCE_TRIGGER_PROPS"
            :placeholder="t('compliance.versions.filters.all')" :options="standardSourceFilterOptions" />
          <a-select v-else-if="key === 'questionSource'" v-model="draftFilters.questionSource" class="app-filter-control" allow-clear allow-search
            :filter-option="sourceFilterOption" :trigger-props="SOURCE_TRIGGER_PROPS"
            :placeholder="t('compliance.versions.filters.all')" :options="questionSourceFilterOptions" />
          <a-select v-else-if="key === 'safetyRequirement'" v-model="draftFilters.safetyRequirement" class="app-filter-control" allow-clear allow-search
            :filter-option="sourceFilterOption" :trigger-props="SOURCE_TRIGGER_PROPS"
            :placeholder="t('compliance.versions.filters.all')" :options="safetyRequirementFilterOptions" />
          <a-select v-else-if="key === 'creator'" v-model="draftFilters.creator" class="app-filter-control" allow-clear :placeholder="t('compliance.versions.filters.all')" :options="creatorOptions" />
          <a-select v-else-if="key === 'enabled'" v-model="draftFilters.enabled" class="app-filter-control" allow-clear :placeholder="t('compliance.versions.filters.all')" :options="enabledOptions" />
          <a-range-picker
            v-else-if="key === 'createdAt'"
            v-model="createdRangeModel"
            class="app-filter-control"
            value-format="YYYY-MM-DD"
            allow-clear
            :placeholder="[t('compliance.versions.filters.from'), t('compliance.versions.filters.to')]"
          />
          <a-range-picker
            v-else
            v-model="updatedRangeModel"
            class="app-filter-control"
            value-format="YYYY-MM-DD"
            allow-clear
            :placeholder="[t('compliance.versions.filters.from'), t('compliance.versions.filters.to')]"
          />
        </label>
        <div class="rule-query-actions">
          <a-button type="primary" html-type="submit"><template #icon><IconSearch /></template>{{ t('compliance.versions.filters.search') }}</a-button>
          <a-button class="app-btn-neutral" html-type="button" @click="resetFilters"><template #icon><IconRefresh /></template>{{ t('compliance.versions.filters.reset') }}</a-button>
          <ColumnSettingsPopover
            v-model:visible="filterSettingsOpen"
            :items="filterSettingsItems"
            :default-items="defaultFilterItems"
            :title="t('compliance.versions.filters.settings')"
            :list-aria-label="t('compliance.versions.filters.list')"
            :show-label="t('compliance.versions.columns.show')"
            :restore-label="t('compliance.versions.columns.restore')"
            @change="onFilterSettingsChanged"
          >
            <a-button class="app-btn-neutral rule-icon-button" html-type="button" :aria-label="t('compliance.versions.filters.settings')" :title="t('compliance.versions.filters.settings')" @click="filterSettingsOpen = true"><IconFilter /></a-button>
          </ColumnSettingsPopover>
        </div>
      </form>
    </section>

    <!-- 区块 2：规则列表 -->
    <section class="rule-panel rule-list" role="region" :aria-label="t('compliance.versions.listTitle')">
      <div class="rule-list-head">
        <div class="rule-list-head-left">
          <h2 class="rule-list-title">{{ t('compliance.versions.listTitle') }}</h2>
          <span class="rule-list-count">{{ t('compliance.versions.listCount', { count: rows.length }) }}</span>
        </div>
        <div class="rule-list-head-actions">
          <a-button class="app-btn-neutral" @click="requestExport"><template #icon><IconDownload /></template>{{ t('compliance.versions.export') }}</a-button>
          <a-button class="app-btn-neutral" @click="openImport"><template #icon><IconUpload /></template>{{ t('compliance.versions.importButton') }}</a-button>
          <a-button type="primary" @click="goCreate()"><template #icon><IconPlus /></template>{{ t('compliance.versions.create') }}</a-button>
          <ColumnSettingsPopover
            v-model:visible="columnSettingsOpen"
            :items="localizedColumns"
            :default-items="localizedDefaultColumns"
            :title="t('compliance.versions.columns.settings')"
            :list-aria-label="t('compliance.versions.columns.list')"
            :show-label="t('compliance.versions.columns.show')"
            :restore-label="t('compliance.versions.columns.restore')"
            @change="onColumnsChanged"
          >
            <a-button class="app-btn-neutral rule-icon-button" :aria-label="t('compliance.versions.columns.settings')" :title="t('compliance.versions.columns.settings')" @click="columnSettingsOpen = true"><IconSettings /></a-button>
          </ColumnSettingsPopover>
        </div>
      </div>

      <a-table class="rule-table" :columns="tableColumns" :data="pagedRows" row-key="id"
        :pagination="false" :bordered="false" :stripe="false" :scroll="{ x: horizontalWidth }"
        @sorter-change="onSorterChange">
        <template #empty><a-empty :description="t(hasAppliedFilters ? 'compliance.noMatch' : 'compliance.noData')" /></template>
        <template #ruleNo="{ record }"><button type="button" class="rule-no-link tabular" @click="goDetail(record.id)">{{ record.ruleNo || record.id }}</button></template>
        <template #name="{ record }">{{ record.name }}</template>
        <template #status="{ record }">
          <a-tag :color="statusColor(record.status)">{{ t(`compliance.versions.status.${record.status}`) }}</a-tag>
        </template>
        <template #standardSource="{ record }">{{ record.standardSource || '—' }}</template>
        <template #questionSource="{ record }">{{ record.questionSource || '—' }}</template>
        <template #safetyRequirement="{ record }">{{ record.safetyRequirement || '—' }}</template>
        <template #note="{ record }">{{ record.note || '—' }}</template>
        <template #questionCount="{ record }"><span class="tabular">{{ record.questionCount }}</span></template>
        <template #creator="{ record }">{{ record.createdBy }}</template>
        <template #createdAt="{ record }"><span class="tabular">{{ record.createdAt }}</span></template>
        <template #updater="{ record }">{{ record.updatedBy }}</template>
        <template #updatedAt="{ record }"><span class="tabular">{{ record.updatedAt }}</span></template>
        <template #enabled="{ record }">
          <a-switch
            :model-value="isRuleVersionEnabled(record)"
            :disabled="record.status !== 'published'"
            :aria-label="t('compliance.versions.fields.enabled')"
            @change="toggleEnabled(record, $event)"
          />
        </template>
        <template #actions="{ record }">
          <div class="rule-row-actions">
            <a-link v-for="action in primaryRowActions(record)" :key="action.key" @click="action.run(record)">{{ action.label }}</a-link>
            <a-dropdown v-if="moreRowActions(record).length" trigger="hover" position="br" popup-container="body" content-class="row-more-dropdown">
              <a-button class="row-more-trigger" size="mini" :aria-label="t('compliance.versions.more')" :title="t('compliance.versions.more')">
                <template #icon><IconMore /></template>
              </a-button>
              <template #content>
                <a-doption v-for="action in moreRowActions(record)" :key="action.key" :class="{ 'row-more-danger': action.danger }" @click="action.run(record)">{{ action.label }}</a-doption>
              </template>
            </a-dropdown>
          </div>
        </template>
      </a-table>

      <nav class="rule-pagination app-pagination" :aria-label="t('compliance.versions.pagination.navigation')">
        <span class="pagination-total">{{ t('compliance.versions.pagination.total', { count: sortedRows.length }) }}</span>
        <div class="pagination-pages">
          <a-select class="app-page-size" :model-value="pageSize" :aria-label="t('compliance.versions.pagination.pageSizeAria')" @update:model-value="handlePageSizeChange">
            <a-option v-for="size in [10, 20, 50, 100, 200]" :key="size" :value="size">{{ t('compliance.versions.pagination.perPage', { count: size }) }}</a-option>
          </a-select>
          <button class="pagination-arrow" type="button" :disabled="page === 1" :aria-label="t('compliance.versions.pagination.previous')" @click="setPage(page - 1)"><IconLeft /></button>
          <button
            v-for="number in pageNumbers"
            :key="number"
            class="pagination-number"
            :class="{ active: page === number }"
            type="button"
            :aria-current="page === number ? 'page' : undefined"
            @click="setPage(number)"
          >{{ number }}</button>
          <button class="pagination-arrow" type="button" :disabled="page === totalPages" :aria-label="t('compliance.versions.pagination.next')" @click="setPage(page + 1)"><IconRight /></button>
        </div>
        <span class="pagination-jump-label">{{ t('compliance.versions.pagination.jumpTo') }}</span>
        <a-input-number v-model="jumpPage" class="app-page-jump" :min="1" :max="totalPages" hide-button :input-attrs="{ 'aria-label': t('compliance.versions.pagination.jumpTo') }" @press-enter="setPage(Number(jumpPage))" />
        <span class="pagination-total-pages">{{ t('compliance.versions.pagination.totalPages', { count: totalPages }) }}</span>
      </nav>
    </section>

    <!-- 发布 / 删除 确认弹窗（编辑/复制/保存并发布 已由子页面 RuleVersionConfigPage 承载） -->
    <a-modal :visible="Boolean(publishTarget)" :title="t('compliance.versions.publishTitle')" :width="420"
      :ok-text="t('compliance.versions.publish')" :cancel-text="t('compliance.versions.cancel')" @ok="confirmPublish" @cancel="publishTarget = null">
      <p class="modal-confirm-text">{{ t('compliance.versions.publishHint', { name: publishTarget?.name ?? '', id: publishTarget?.id ?? '', recalc: publishImpact.recalculated, locked: publishImpact.locked }) }}</p>
    </a-modal>
    <a-modal :visible="Boolean(deleteTarget)" :title="t('compliance.versions.deleteTitle')" :width="420"
      :ok-text="t('compliance.versions.delete')" :cancel-text="t('compliance.versions.cancel')" @ok="confirmDelete" @cancel="deleteTarget = null">
      <p class="modal-confirm-text">{{ t('compliance.versions.deleteHint', { name: deleteTarget?.name ?? '', id: deleteTarget?.id ?? '' }) }}</p>
    </a-modal>

    <!-- 导出确认弹窗（DESIGN.md Batch export baseline）：确认后进入任务中心「下载任务」 -->
    <a-modal :visible="exportOpen" :width="456" :mask-closable="!exporting" :title="t('compliance.versions.exportNotice.title')" @cancel="!exporting && (exportOpen = false)">
      <div class="rule-export-notice">
        <IconExclamationCircle class="rule-export-icon" />
        <div class="rule-export-text">
          <p>{{ t('compliance.versions.exportNotice.line1') }}</p>
          <p>{{ t('compliance.versions.exportNotice.line2') }}</p>
        </div>
      </div>
      <template #footer>
        <a-button class="app-btn-neutral" :disabled="exporting" @click="exportOpen = false">{{ t('compliance.versions.exportNotice.cancel') }}</a-button>
        <a-button type="primary" :loading="exporting" @click="confirmExport">{{ t('compliance.versions.exportNotice.confirm') }}</a-button>
      </template>
    </a-modal>

    <!-- 批量导入抽屉（DESIGN.md Batch import baseline）：上传拖拽区 + 注意事项同组，模版链接在注意事项子块外 -->
    <a-drawer class="ledger-drawer" :visible="importOpen" :width="Math.min(560, viewportWidth - 24)" :mask-closable="!importing" :title="t('compliance.versions.import.title')" @cancel="!importing && (importOpen = false)">
      <div class="rule-drawer-group">
        <div class="rule-import-dropzone" role="button" tabindex="0" :aria-label="t('compliance.versions.import.file')" @click="fileInput?.click()" @keydown.enter.prevent="fileInput?.click()" @keydown.space.prevent="fileInput?.click()" @dragover.prevent @drop.prevent="onDropFile">
          <IconFolder class="rule-import-folder" />
          <p v-if="selectedFile" class="rule-import-file-name" :title="selectedFile.name">{{ selectedFile.name }}</p>
          <p v-else class="rule-import-hint">{{ t('compliance.versions.import.uploadHint') }}</p>
          <a-button type="primary" :loading="importingFile" @click.stop="fileInput?.click()">{{ t(selectedFile ? 'compliance.versions.import.reuploadButton' : 'compliance.versions.import.uploadButton') }}</a-button>
          <input ref="fileInput" type="file" accept=".xlsx,.csv" class="rule-file-input" :aria-label="t('compliance.versions.import.file')" @change="onFileChange" />
        </div>
        <template v-if="parsed">
          <p class="rule-import-line">{{ t('compliance.versions.import.preview', { count: parsed.items.length }) }}</p>
          <p v-if="parsed.failures.length" class="rule-import-error">{{ t('compliance.versions.import.issues', { count: parsed.failures.length }) }} <a-button type="text" @click="downloadErrors">{{ t('compliance.versions.import.errors') }}</a-button></p>
        </template>
        <div class="rule-import-notes">
          <p class="rule-import-notes-title">{{ t('compliance.versions.import.notesTitle') }}</p>
          <p v-for="(note, index) in importNotes" :key="index" class="rule-import-note">{{ t('compliance.versions.import.notePrefix', { index: index + 1 }) }}{{ note }}</p>
        </div>
        <a-link class="rule-import-template" :loading="preparingTemplate" @click="downloadTemplate">{{ t('compliance.versions.import.template') }}</a-link>
      </div>
      <template #footer>
        <a-button class="app-btn-neutral" :disabled="importing" @click="importOpen = false">{{ t('compliance.versions.cancel') }}</a-button>
        <a-button type="primary" :loading="importing" :disabled="!parsed?.items.length" @click="confirmImport">{{ t('compliance.versions.import.submit') }}</a-button>
      </template>
    </a-drawer>
  </div>
</template>

<style scoped>
/* 页面根：Fill-1 画布上的白色面板列（两区块 16px 纵向间距） */
.rule-page { display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: calc(100dvh - 88px); font-size: 14px; color: var(--color-text-1); }
.rule-panel { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.rule-list { flex: 1; display: flex; flex-direction: column; }

/* 筛选栅栏：标签右对齐 + 200px 控件单元（日期区间同为 200px，DESIGN.md Filter geometry 无例外）；
   筛选设置按钮在操作组尾 */
.rule-query { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; min-width: 0; }
.rule-filter-field { display: inline-grid; grid-template-columns: max-content minmax(0, 200px); max-width: 100%; align-items: center; gap: 8px; min-width: 0; color: var(--color-text-2); white-space: nowrap; }
.rule-filter-field > span { text-align: right; }
.rule-filter-field :deep(.app-filter-control) { width: 200px; max-width: 100%; min-width: 0; }
.rule-filter-field--range { grid-template-columns: max-content minmax(0, 200px); }
.rule-filter-field--range :deep(.app-filter-control) { width: 200px; }
.rule-query-actions { display: flex; align-items: center; gap: 8px; }
.rule-icon-button { width: 32px; height: 32px; padding: 0; }

/* 列表头：标题 16/600/24 + 条数贴标题右侧（baseline 对齐）；右侧新建 + 列设置 */
.rule-list-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.rule-list-head-left { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.rule-list-title { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.rule-list-count { color: var(--color-text-3); font-size: 14px; line-height: 22px; font-variant-numeric: tabular-nums; }
.rule-list-head-actions { display: flex; align-items: center; gap: 8px; }

/* 表格：白底、无外框、无斑马纹、行分隔线；表头全局 Fill-2 + 600 字重 */
.rule-table { min-width: 0; }
.rule-table :deep(.arco-table-th) { font-weight: 600; }
.rule-table :deep(.arco-table-td) { border-bottom: 1px solid var(--app-divider); }
/* 操作列（2026-11-02 用户裁决，对齐表单列表）：详情/编辑文字链接直显 + 24px「…」更多下拉（全局 .row-more-dropdown），
   删除项在浮层内呈危险色 */
.rule-row-actions { display: flex; align-items: center; gap: 12px; white-space: nowrap; }
.rule-row-actions :deep(.arco-link) { padding: 0; }
.rule-row-actions .row-more-trigger.arco-btn { width: 24px; min-width: 24px; height: 24px; padding: 0; color: var(--color-text-3); background: transparent; }
.rule-row-actions .row-more-trigger.arco-btn .arco-btn-icon { color: inherit; }
.rule-row-actions .row-more-trigger.arco-btn:not(.arco-btn-disabled):hover,
.rule-row-actions .row-more-trigger.arco-btn:not(.arco-btn-disabled):active { color: var(--app-accent); background: var(--color-fill-2); }

/* 导出确认弹窗（对齐功能台账 baseline） */
.rule-export-notice { display: flex; align-items: flex-start; gap: 12px; }
.rule-export-icon { flex: none; margin-top: 2px; color: var(--app-color-warning); font-size: 24px; }
.rule-export-text p { margin: 0 0 4px; line-height: 22px; }
.rule-export-text p:last-child { margin-bottom: 0; }

/* 批量导入抽屉内容分组（抽屉表面走 global.css 的 .ledger-drawer 共享规则） */
.rule-drawer-group { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.rule-import-dropzone { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; min-height: 180px; padding: 24px 16px; border: 1px dashed var(--app-control-border); border-radius: 4px; background: var(--app-page); cursor: pointer; text-align: center; }
.rule-import-dropzone:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.rule-import-folder { color: var(--app-color-primary); font-size: 48px; }
.rule-import-hint, .rule-import-file-name { max-width: 100%; margin: 0; color: var(--color-text-1); line-height: 24px; overflow-wrap: anywhere; }
.rule-import-file-name { font-size: 18px; }
.rule-import-line { margin: 0; line-height: 22px; }
/* 注意事项子块：var(--app-import-help-surface) 浅蓝底（business-drawer baseline），16px 内边距；下载模版链接位于子块之外 */
.rule-import-notes { display: flex; flex-direction: column; gap: 4px; padding: 16px; border-radius: 2px; background: var(--app-import-help-surface); }
:global(body[arco-theme='dark'] .rule-import-notes) { background: var(--color-fill-2); }
.rule-import-notes-title { margin: 0; font-weight: 600; line-height: 22px; }
.rule-import-note { margin: 0; color: var(--color-text-2); line-height: 22px; }
.rule-import-template { align-self: flex-start; }
.rule-file-input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; }
.rule-import-error { margin: 0; color: var(--app-color-danger); }
.tabular { font-variant-numeric: tabular-nums; }
/* 规则编号链接（2026-11-02 用户裁决）：hover 主色高亮，点击打开规则详情 */
.rule-no-link { padding: 0; border: 0; background: none; font: inherit; color: inherit; text-align: left; text-decoration: none; cursor: pointer; }
.rule-no-link:hover { color: var(--app-accent); text-decoration: underline; }
.rule-no-link:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.modal-confirm-text { margin: 0; color: var(--color-text-1); font-size: 14px; line-height: 22px; }

/* 分页：右对齐「共 N 条 → 每页条数 → 页码 → 跳至」，控件表面走 global.css 共享 app-pagination 规则 */
.rule-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 16px; color: var(--color-text-2); }
.pagination-total { margin-right: 8px; color: var(--color-text-3); font-size: 14px; line-height: 22px; }
.pagination-pages { display: flex; align-items: center; gap: 8px; margin-right: 8px; }
.pagination-jump-label, .pagination-total-pages { color: var(--color-text-3); font-size: 14px; line-height: 22px; }

@media (max-width: 760px) {
  .rule-filter-field { grid-template-columns: 1fr; }
  .rule-filter-field > span { text-align: left; }
  .rule-filter-field--range { grid-template-columns: 1fr; }
  .rule-list-head { flex-wrap: wrap; }
  .rule-pagination { justify-content: flex-start; }
  .pagination-total { width: 100%; margin-right: 0; }
}
</style>
