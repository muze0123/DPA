<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { Message, type TableColumnData } from '@arco-design/web-vue';
import { IconFilter, IconLeft, IconMore, IconPlus, IconRefresh, IconRight, IconSearch, IconSettings } from '@arco-design/web-vue/es/icon';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import ColumnSettingsPopover, { type ColumnSettingsItem } from '../../../shared/components/ColumnSettingsPopover.vue';
import { useLocaleStore } from '../../../app/stores/locale';
import {
  MOCK_CURRENT_USER, SURVEY_SOURCES, SURVEY_STATUSES, TASK_PRIORITIES, mergeLocalSurveyDrafts, surveyRecords,
  visibleSurveysFor, type SurveyRecord, type SurveySource, type SurveyStatus, type TaskPriority,
} from '../data/surveys';
import { belongsToSurveyView, SURVEY_VIEW_KEYS, type SurveyViewKey } from '../data/surveyRelations';
import { loadLocalSurveyDrafts } from '../data/drafts';
import { surveyStatusColor, useSurveyLabels } from '../labels';
import CreateTaskDrawer from '../components/CreateTaskDrawer.vue';

const { t } = useI18n({ useScope: 'global' });
const { statusLabel, sourceLabel } = useSurveyLabels();
const localeStore = useLocaleStore();
const router = useRouter();
const route = useRoute();

/* ------------------------------------------------------------ 与当前账号的关系 */

const activeTab = ref<SurveyViewKey>('all');

/** F-SURV-02：角色可见范围。mock 口径，待服务端角色接口替换（见 data/surveys.ts） */
const visibleBase = computed(() => visibleSurveysFor(surveyRecords, MOCK_CURRENT_USER));

function selectTab(key: SurveyViewKey) {
  activeTab.value = key;
  setPage(1);
}

function onTabKeydown(event: KeyboardEvent, key: SurveyViewKey) {
  const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!direction) return;
  event.preventDefault();
  const next = SURVEY_VIEW_KEYS[(SURVEY_VIEW_KEYS.indexOf(key) + direction + SURVEY_VIEW_KEYS.length) % SURVEY_VIEW_KEYS.length];
  selectTab(next);
  const buttons = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  buttons?.[SURVEY_VIEW_KEYS.indexOf(next)]?.focus();
}

/* ------------------------------------------------------------------ 筛选（草稿 → 应用） */

const FILTER_KEYS = ['taskName', 'keyword', 'status', 'priority', 'deadline', 'owner', 'respondent', 'source', 'creator', 'createdAt', 'updatedBy', 'updatedAt'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

interface SurveyFilters {
  keyword: string;
  /** 天枢下发的任务名称/编号（列表主标识） */
  taskName: string;
  status: SurveyStatus[];
  /** 优先级（单选，''=全部，2026-11-03 新增，默认不显示） */
  priority: TaskPriority | '';
  /** 截止日期区间 [起, 止]，YYYY-MM-DD（2026-11-03 新增，默认不显示） */
  deadline: string[];
  owner: string;
  respondent: string;
  source: SurveySource | '';
  creator: string;
  updatedBy: string;
  /** 日期区间 [起, 止]，YYYY-MM-DD；空串表示该端不限 */
  createdAt: string[];
  updatedAt: string[];
}

const defaultFilters = (): SurveyFilters => ({
  keyword: '', taskName: '', status: [], priority: '', deadline: [], owner: '', respondent: '', source: '', creator: '', updatedBy: '', createdAt: [], updatedAt: [],
});
/** 与功能台账同构：表单绑定 draft，点「查询」才应用到 applied */
const draft = reactive<SurveyFilters>(defaultFilters());
const applied = reactive<SurveyFilters>(defaultFilters());

/** 状态与任务名称常显；关键词与更新时间次之，其余由筛选设置按需开启 */
const DEFAULT_VISIBLE_FILTERS: FilterKey[] = ['keyword', 'taskName', 'status', 'owner', 'updatedAt'];

/** 人员类筛选项的候选值取自角色可见范围，与列表口径一致（姓名是专有名词，不翻译） */
function peopleOptions(pick: (record: SurveyRecord) => string) {
  return computed(() => [...new Set(visibleBase.value.map(pick).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, localeStore.locale))
    .map((name) => ({ value: name, label: name })));
}

const ownerOptions = peopleOptions((record) => record.owner);
const respondentOptions = peopleOptions((record) => record.respondent);
const creatorOptions = peopleOptions((record) => record.sourceOperator);
const updatedByOptions = peopleOptions((record) => record.updatedBy ?? '');
const sourceOptions = computed(() => SURVEY_SOURCES.map((value) => ({ value, label: sourceLabel(value) })));
const statusOptions = computed(() => SURVEY_STATUSES.map((value) => ({ value, label: statusLabel(value) })));
/** 优先级候选（2026-11-03 新增筛选）：与列表标签同源（surveys.priorities.*） */
const priorityOptions = computed(() => TASK_PRIORITIES.map((value) => ({ value, label: t(`surveys.priorities.${value}`) })));

const statusModel = computed({
  get: () => draft.status,
  set: (value: SurveyStatus[] | undefined) => { draft.status = Array.isArray(value) ? value : []; },
});

function isRangeKey(key: FilterKey): key is 'createdAt' | 'updatedAt' | 'deadline' {
  return key === 'createdAt' || key === 'updatedAt' || key === 'deadline';
}

/**
 * 日期区间的受控模型。
 * Arco 的区间选择器在清除时会把 modelValue 置为 undefined（而不是空数组），
 * 若直接 v-model 到 draft，后续 [...range] 之类的数组操作会抛 TypeError；
 * 这里统一归一到 string[]，保证 draft 的区间字段恒为数组。
 */
function rangeModel(key: 'createdAt' | 'updatedAt' | 'deadline') {
  return computed<string[]>({
    get: () => draft[key],
    set: (value: unknown) => {
      draft[key] = Array.isArray(value) ? value.map((item) => String(item)) : [];
    },
  });
}

const createdRangeModel = rangeModel('createdAt');
const updatedRangeModel = rangeModel('updatedAt');
const deadlineRangeModel = rangeModel('deadline');

/** 应用时深拷贝日期区间，否则草稿里的区间数组会被后续编辑原地改动 */
function applyFilters() {
  const copyRange = (range: string[]) => (Array.isArray(range) ? [...range] : []);
  Object.assign(applied, { ...draft, status: [...draft.status], deadline: copyRange(draft.deadline), createdAt: copyRange(draft.createdAt), updatedAt: copyRange(draft.updatedAt) });
  setPage(1);
}

function resetFilters() {
  Object.assign(draft, defaultFilters());
  Object.assign(applied, defaultFilters());
  setPage(1);
}

/* ------------------------------------------------------------ 筛选条件状态 */

function filterLabel(key: FilterKey) { return t(`surveys.filters.${key}`); }

/**
 * 是否有已生效条件。
 * 2026-10-27 用户裁决：取消「已应用条件标签 + 清空条件」区域，条件一律回显在
 * 各自的筛选控件里（输入框/下拉/日期区间），此处只保留判定用于空态文案与重置按钮。
 */
const hasAppliedFilters = computed(() => {
  if (applied.keyword.trim() || applied.taskName.trim() || applied.owner || applied.respondent || applied.source || applied.creator || applied.updatedBy || applied.priority) return true;
  if (applied.status.length) return true;
  return Boolean(applied.deadline[0] || applied.deadline[1] || applied.createdAt[0] || applied.createdAt[1] || applied.updatedAt[0] || applied.updatedAt[1]);
});

interface FilterSetting { key: FilterKey; visible: boolean }

/** 任务搜索是任务的主识别条件（名称/编号）：筛选设置里禁用，避免误关后列表失去主检索入口 */
const defaultFilterSettings: FilterSetting[] = FILTER_KEYS.map((key) => ({
  key, visible: DEFAULT_VISIBLE_FILTERS.includes(key),
}));
const filterSettings = ref<FilterSetting[]>(defaultFilterSettings.map((setting) => ({ ...setting })));
const filterSettingsOpen = ref(false);

const visibleFilterKeys = computed(() => filterSettings.value.filter((setting) => setting.visible).map((setting) => setting.key));

const filterSettingsItems = computed<ColumnSettingsItem[]>(() => filterSettings.value.map((setting) => ({
  key: setting.key,
  label: filterLabel(setting.key),
  visible: setting.visible,
  disabled: setting.key === 'taskName',
})));

const defaultFilterItems = computed<ColumnSettingsItem[]>(() => defaultFilterSettings.map((setting) => ({
  key: setting.key,
  label: filterLabel(setting.key),
  visible: setting.visible,
  disabled: setting.key === 'taskName',
})));

function onFilterSettingsChanged(next: ColumnSettingsItem[]) {
  filterSettings.value = next.map((item) => ({ key: item.key as FilterKey, visible: item.visible }));
}

/* ------------------------------------------------------------------ 排序 */

const sortKey = ref<'updatedAt' | 'taskName' | 'fuliId' | 'deadline'>('updatedAt');
const sortDirection = ref<'ascend' | 'descend'>('descend');

/** 默认按更新时间倒序；排序值取显示值，与界面一致 */
function sortValue(record: SurveyRecord): string {
  if (sortKey.value === 'taskName') return record.taskName;
  if (sortKey.value === 'fuliId') return record.fuliId;
  if (sortKey.value === 'deadline') return record.deadline ?? '';
  return record.updatedAt;
}

/** Earlier browser drafts only stored minutes; keep their value and show the unknown seconds as 00. */
function displayUpdatedAt(value: string): string {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
}

const conditionRows = computed(() => {
  const keyword = applied.keyword.trim().toLowerCase();
  const taskName = applied.taskName.trim().toLowerCase();
  return visibleBase.value.filter((record) => {
    if (keyword && !`${record.functionName} ${record.fuliId}`.toLowerCase().includes(keyword)) return false;
    // 任务搜索：匹配任务名称或任务编号
    if (taskName && !`${record.taskName} ${record.id}`.toLowerCase().includes(taskName)) return false;
    if (applied.status.length && !applied.status.includes(record.status)) return false;
    // 优先级：单选精确匹配（''=不限）
    if (applied.priority && record.priority !== applied.priority) return false;
    // 截止日期按天比较：空串视为该端不限；未填截止时间（''）的记录仅在无起端时可见
    if (applied.deadline[0] || applied.deadline[1]) {
      if (!record.deadline) return false;
      const deadlineDay = record.deadline.slice(0, 10);
      if (applied.deadline[0] && deadlineDay < applied.deadline[0]) return false;
      if (applied.deadline[1] && deadlineDay > applied.deadline[1]) return false;
    }
    if (applied.owner && record.owner !== applied.owner) return false;
    if (applied.respondent && record.respondent !== applied.respondent) return false;
    if (applied.source && record.source !== applied.source) return false;
    if (applied.creator && record.sourceOperator !== applied.creator) return false;
    if (applied.updatedBy && record.updatedBy !== applied.updatedBy) return false;
    // 日期按天比较：区间端为空视为该端不限
    const createdDay = record.createdAt.slice(0, 10);
    if (applied.createdAt[0] && createdDay < applied.createdAt[0]) return false;
    if (applied.createdAt[1] && createdDay > applied.createdAt[1]) return false;
    const updatedDay = record.updatedAt.slice(0, 10);
    if (applied.updatedAt[0] && updatedDay < applied.updatedAt[0]) return false;
    if (applied.updatedAt[1] && updatedDay > applied.updatedAt[1]) return false;
    return true;
  });
});

/** 每个计数均是同一组已应用条件下的可见任务数，不按任务数重复计行。 */
const tabs = computed(() => SURVEY_VIEW_KEYS.map((key) => ({
  key,
  label: t(`surveys.views.${key}`),
  count: conditionRows.value.filter((record) => belongsToSurveyView(record, key, MOCK_CURRENT_USER)).length,
})));

const filteredSurveys = computed(() => {
  const rows = conditionRows.value.filter((record) => belongsToSurveyView(record, activeTab.value, MOCK_CURRENT_USER));
  return [...rows].sort((left, right) => {
    const result = sortValue(left).localeCompare(sortValue(right), localeStore.locale);
    return sortDirection.value === 'ascend' ? result : -result;
  });
});

const emptyLabel = computed(() => {
  if (hasAppliedFilters.value) return t('surveys.labels.noMatch');
  switch (activeTab.value) {
    case 'pending': return t('surveys.labels.emptyPending');
    case 'handled': return t('surveys.labels.emptyHandled');
    case 'initiated': return t('surveys.labels.emptyInitiated');
    case 'copied': return t('surveys.labels.emptyCopied');
    default: return t('surveys.labels.empty');
  }
});

/* ------------------------------------------------------------------ 分页 */

const page = ref(1);
const pageSize = ref(10);
const jumpPage = ref(1);

const totalPages = computed(() => Math.max(1, Math.ceil(filteredSurveys.value.length / pageSize.value)));
const pagedSurveys = computed(() => filteredSurveys.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
const pageNumbers = computed(() => {
  const windowSize = Math.min(totalPages.value, 5);
  const start = Math.min(Math.max(page.value - Math.floor(windowSize / 2), 1), totalPages.value - windowSize + 1);
  return Array.from({ length: windowSize }, (_, index) => start + index);
});

function setPage(value: number) {
  page.value = Math.min(Math.max(value, 1), totalPages.value);
  jumpPage.value = page.value;
}
function goToJumpPage() { setPage(Number(jumpPage.value)); }
function handlePageSizeChange(value: unknown) {
  const nextSize = Number(value);
  if (!Number.isFinite(nextSize) || nextSize <= 0) return;
  pageSize.value = nextSize;
  setPage(1);
}
function handleSort(dataIndex: string, direction: string) {
  if (dataIndex !== 'updatedAt' && dataIndex !== 'taskName' && dataIndex !== 'fuliId' && dataIndex !== 'deadline') return;
  if (direction !== 'ascend' && direction !== 'descend') return;
  sortKey.value = dataIndex;
  sortDirection.value = direction;
}

/* ------------------------------------------------------------ 列设置与表格列定义 */

type ColumnKey = 'taskNo' | 'taskName' | 'fuliId' | 'status' | 'clauses' | 'reviewer' | 'respondent' | 'source' | 'updatedBy' | 'updatedAt' | 'priority' | 'taskDescription' | 'deadline' | 'createdAt';
/**
 * 任务列表列序（2026-10-30 用户裁决；2026-11-03 调整：更新人置于最近更新时间上方）：
 * 任务编号在任务名称左侧；任务名称为唯一行入口；
 * 功能名称列已移除（功能信息在任务详情基础信息中）；更新人默认隐藏（2026-10-30 二轮）；
 * 优先级 / 任务描述 / 截止时间紧邻创建时间左侧；任务描述与创建时间默认隐藏。
 */
const DEFAULT_VISIBLE: ColumnKey[] = ['taskNo', 'taskName', 'fuliId', 'status', 'clauses', 'reviewer', 'respondent', 'updatedAt', 'priority', 'deadline'];
const defaultColumns: ColumnSettingsItem[] = (
  ['taskNo', 'taskName', 'fuliId', 'status', 'clauses', 'reviewer', 'respondent', 'source', 'updatedBy', 'updatedAt', 'priority', 'taskDescription', 'deadline', 'createdAt'] as ColumnKey[]
).map((key) => ({ key, label: key, visible: DEFAULT_VISIBLE.includes(key), disabled: key === 'taskNo' || key === 'taskName' }));
const columns = ref<ColumnSettingsItem[]>(defaultColumns.map((item) => ({ ...item })));
const columnSettingsOpen = ref(false);

const localizedColumns = computed(() => columns.value.map((item) => ({ ...item, label: t(`surveys.fields.${item.key}`) })));
const localizedDefaultColumns = computed(() => defaultColumns.map((item) => ({ ...item, label: t(`surveys.fields.${item.key}`) })));

const columnWidths: Record<ColumnKey, number> = { taskNo: 130, taskName: 250, fuliId: 140, status: 170, clauses: 100, reviewer: 100, respondent: 100, source: 190, updatedAt: 160, updatedBy: 100, priority: 90, taskDescription: 260, deadline: 120, createdAt: 160 };

const tableColumns = computed<TableColumnData[]>(() => {
  const dataColumns = columns.value.filter((item) => item.visible).map((item): TableColumnData => ({
    title: t(`surveys.fields.${item.key}`),
    dataIndex: item.key,
    slotName: item.key,
    width: columnWidths[item.key as ColumnKey],
    align: 'left',
    ...(item.key === 'taskName' || item.key === 'updatedAt' || item.key === 'fuliId' || item.key === 'deadline'
      // 受控方向（DESIGN.md 契约）：激活方向显式写入 sortable.sortOrder，未排序传 ''（防 td 复用残留）
      ? { sortable: { sortDirections: ['ascend', 'descend'], sorter: true, sortOrder: sortKey.value === item.key ? sortDirection.value : '' } }
      : {}),
  }));
  return [...dataColumns, { title: t('surveys.fields.actions'), dataIndex: 'actions', slotName: 'actions', width: 170, align: 'left', fixed: 'right' }];
});

const horizontalWidth = computed(() => tableColumns.value.reduce((total, column) => total + Number(column.width ?? 140), 0));

function onColumnsChanged(next: ColumnSettingsItem[]) {
  columns.value = next.map((item) => ({ key: item.key, label: item.key, visible: item.visible, disabled: item.key === 'taskNo' || item.key === 'taskName' }));
}

/* --------------------------------------------------------------- 打开任务 */

/** 打开任务：进入工作区容器（步进条投影），由详情页归一到当前行动步 */
function openSurvey(record: SurveyRecord) {
  void router.push({ name: 'survey-detail', params: { id: record.id } });
}

/** 带行动步打开：执行/编辑/修改=第 1 步、去作答=第 2 步、去确认=第 3 步、去填写=第 4 步、去审批=第 5 步 */
function openTaskStep(record: SurveyRecord, step: number) {
  void router.push({ name: 'survey-detail-steps', params: { id: record.id, step: String(step) } });
}

/* --------------------------------------------------------------- 逾期与优先级 */

/** 天枢侧终态（已完成/已撤回/已作废）不再显示延期标记 */
const OVERDUE_EXEMPT: SurveyStatus[] = ['archived', 'withdrawn', 'voided'];

/** 截止时间已过且任务未到终态 → 返回已延期天数（至少 1），否则 null */
function overdueDays(record: SurveyRecord): number | null {
  if (!record.deadline || OVERDUE_EXEMPT.includes(record.status)) return null;
  const deadlineDay = record.deadline.slice(0, 10);
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const todayText = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (deadlineDay >= todayText) return null;
  const diffDays = (Date.parse(`${todayText}T00:00:00`) - Date.parse(`${deadlineDay}T00:00:00`)) / 86400000;
  return Math.max(1, Math.ceil(diffDays));
}

/** 优先级标签色（中文语义：紧急=红、高=橙、中=蓝、低=灰） */
const PRIORITY_COLORS: Record<TaskPriority, string> = { urgent: 'red', high: 'orange', medium: 'arcoblue', low: 'gray' };

/* ------------------------------------------------- 行内动作（2026-10-30 任务口径） */

type RowActionKey = 'detail' | 'execute' | 'edit' | 'answer' | 'confirm' | 'approve' | 'fill' | 'modify' | 'copy';
interface RowAction { key: RowActionKey; label: string; danger?: boolean; run: (record: SurveyRecord) => void }

/**
 * 行内动作全集（当前用户 = 执行人视角，2026-10-30 用户裁决；2026-11-02 用户裁决：
 * 去作答/去确认/去审批/去填写 更名为 作答/确认/审批/填写，全状态恢复「复制」——按任务字段预填新建任务抽屉）：
 * 待处理=详情/执行；待提交=详情/编辑；待填写=详情/作答；待确认=详情/确认；
 * 匹配审核中与分区审核中=详情/审批；分区填写中=详情/去填写；
 * 已退回（returnInfo 标记）=详情/修改；已完成、已撤回、已作废=详情。
 * 全部状态第三动作 = 复制（超过主位 2 个，收进「…」更多菜单）。
 */
function rowActions(record: SurveyRecord): RowAction[] {
  const detail: RowAction = { key: 'detail', label: t('surveys.actions.open'), run: openSurvey };
  const copy: RowAction = { key: 'copy', label: t('surveys.actions.copy'), run: openCopyTask };
  // 已退回：阶段内退回标记优先，修改入口回到工作区（行动步随状态归一，退回横幅可见）
  if (record.returnInfo) {
    return [detail, { key: 'modify', label: t('surveys.actions.modify'), run: openSurvey }, copy];
  }
  switch (record.status) {
    case 'pending': return [detail, { key: 'execute', label: t('surveys.actions.execute'), run: (item) => openTaskStep(item, 1) }, copy];
    case 'draft': return [detail, { key: 'edit', label: t('surveys.actions.edit'), run: (item) => openTaskStep(item, 1) }, copy];
    case 'pending-fill': return [detail, { key: 'answer', label: t('surveys.actions.answer'), run: (item) => openTaskStep(item, 2) }, copy];
    case 'pending-confirm': return [detail, { key: 'confirm', label: t('surveys.actions.toConfirm'), run: (item) => openTaskStep(item, 3) }, copy];
    // 匹配审核中：审核对象是匹配结果（第 3 步，2026-11-02 裁决）；分区审核中：审核与看板（第 5 步）
    case 'matching-reviewing': return [detail, { key: 'approve', label: t('surveys.actions.toApprove'), run: (item) => openTaskStep(item, 3) }, copy];
    case 'section-reviewing': return [detail, { key: 'approve', label: t('surveys.actions.toApprove'), run: (item) => openTaskStep(item, 5) }, copy];
    case 'section-filling': return [detail, { key: 'fill', label: t('surveys.actions.toFill'), run: (item) => openTaskStep(item, 4) }, copy];
    default: return [detail, copy]; // 已完成 / 已撤回 / 已作废：只读详情 + 复制
  }
}

const PRIMARY_ACTION_COUNT = 2;

function primaryRowActions(record: SurveyRecord): RowAction[] {
  return rowActions(record).slice(0, PRIMARY_ACTION_COUNT);
}

function moreRowActions(record: SurveyRecord): RowAction[] {
  return rowActions(record).slice(PRIMARY_ACTION_COUNT);
}

/* --------------------------------------------------------------- 新建任务抽屉 */

const taskDrawerOpen = ref(false);
/** 复制源：行内「复制」按任务字段预填新建任务抽屉（2026-11-02 用户裁决恢复复制） */
const copySource = ref<SurveyRecord | null>(null);

/** 新建任务：无复制源，空表单 */
function openTaskDrawer() {
  copySource.value = null;
  taskDrawerOpen.value = true;
}

/** 复制任务：以所选记录为模板预填（名称加「（副本）」后缀，唯一性由抽屉校验兜底） */
function openCopyTask(record: SurveyRecord) {
  copySource.value = record;
  taskDrawerOpen.value = true;
}

/** 任务创建成功：回到第一页（新建任务置顶） */
function onTaskCreated() {
  setPage(1);
}

/** 编辑编排（预留）：待天枢平台提供「任务编排」编辑页入口后，在此按 orchestrationId 跳转 */
function onEditOrchestration(orchestrationId: string) {
  void orchestrationId;
}

/* --------------------------------------------------------------- 模拟加载 */

const loading = ref(true);
onMounted(async () => {
  // 功能台账「关联问卷」跳转携带 ?keyword=<功能名称>：
  // 2026-10-27 用户裁决——直接填进「功能搜索」筛选控件并即时生效，
  // 页面不再另设「已应用条件 / 清空条件」区域，条件一律回显在控件自身。
  const keyword = route.query.keyword;
  if (typeof keyword === 'string' && keyword.trim()) {
    draft.keyword = keyword.trim();
    applied.keyword = keyword.trim();
  }
  try { mergeLocalSurveyDrafts(await loadLocalSurveyDrafts()); }
  catch { Message.error(t('surveys.messages.storageError')); }
  finally { loading.value = false; }
});
</script>

<template>
  <main class="surveys-page">
    <!-- 顶部筛选卡（2026-11-05 裁决）：页签（与当前账号的关系）在上，
         分割线隔开，筛选条件在下；点「查询」应用，「重置」恢复默认 -->
    <div class="surveys-filterbar">
      <div class="surveys-tabs" role="tablist" :aria-label="t('surveys.views.navigation')">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          role="tab"
          class="surveys-tab"
          :class="{ active: activeTab === tab.key }"
          :aria-selected="activeTab === tab.key"
          :tabindex="activeTab === tab.key ? 0 : -1"
          @click="selectTab(tab.key)"
          @keydown="onTabKeydown($event, tab.key)"
        >
          {{ tab.label }}<span class="surveys-tab-count">({{ tab.count }})</span>
        </button>
      </div>

      <hr class="surveys-filter-divider" />

      <form class="surveys-query" @submit.prevent="applyFilters">
        <label
          v-for="key in visibleFilterKeys"
          :key="key"
          class="filter-field"
          :class="{ 'filter-field--range': isRangeKey(key) }"
        >
            <span>{{ filterLabel(key) }}</span>
            <a-input
              v-if="key === 'keyword'"
              v-model="draft.keyword"
              class="app-filter-control"
              allow-clear
              :placeholder="t('surveys.filters.keywordPlaceholder')"
            />
            <a-input
              v-else-if="key === 'taskName'"
              v-model="draft.taskName"
              class="app-filter-control"
              allow-clear
              :placeholder="t('surveys.filters.taskNamePlaceholder')"
            />
            <a-select
              v-else-if="key === 'status'"
              v-model="statusModel"
              class="app-filter-control"
              multiple
              allow-clear
              :max-tag-count="1"
              :placeholder="t('surveys.filters.all')"
              :options="statusOptions"
            />
            <!-- 优先级（2026-11-03 新增，默认不显示）：单选精确匹配 -->
            <a-select
              v-else-if="key === 'priority'"
              v-model="draft.priority"
              class="app-filter-control"
              allow-clear
              :placeholder="t('surveys.filters.all')"
              :options="priorityOptions"
            />
            <!-- 截止日期区间（2026-11-03 新增，默认不显示） -->
            <a-range-picker
              v-else-if="key === 'deadline'"
              v-model="deadlineRangeModel"
              class="app-filter-control"
              value-format="YYYY-MM-DD"
              allow-clear
              :placeholder="[t('surveys.filters.from'), t('surveys.filters.to')]"
            />
            <a-select
              v-else-if="key === 'owner'"
              v-model="draft.owner"
              class="app-filter-control"
              allow-clear
              :placeholder="t('surveys.filters.all')"
              :options="ownerOptions"
            />
            <a-select
              v-else-if="key === 'respondent'"
              v-model="draft.respondent"
              class="app-filter-control"
              allow-clear
              :placeholder="t('surveys.filters.all')"
              :options="respondentOptions"
            />
            <a-select
              v-else-if="key === 'creator'"
              v-model="draft.creator"
              class="app-filter-control"
              allow-clear
              :placeholder="t('surveys.filters.all')"
              :options="creatorOptions"
            />
            <a-select
              v-else-if="key === 'updatedBy'"
              v-model="draft.updatedBy"
              class="app-filter-control"
              allow-clear
              :placeholder="t('surveys.filters.all')"
              :options="updatedByOptions"
            />
            <a-select
              v-else-if="key === 'source'"
              v-model="draft.source"
              class="app-filter-control"
              allow-clear
              :placeholder="t('surveys.filters.all')"
              :options="sourceOptions"
            />
            <!-- 日期区间：与其它筛选控件同为 200px（2026-10-29 全局裁决，DESIGN.md 已同步） -->
            <a-range-picker
              v-else-if="key === 'createdAt'"
              v-model="createdRangeModel"
              class="app-filter-control"
              value-format="YYYY-MM-DD"
              allow-clear
              :placeholder="[t('surveys.filters.from'), t('surveys.filters.to')]"
            />
            <a-range-picker
              v-else
              v-model="updatedRangeModel"
              class="app-filter-control"
              value-format="YYYY-MM-DD"
              allow-clear
              :placeholder="[t('surveys.filters.from'), t('surveys.filters.to')]"
            />
        </label>
        <div class="surveys-query-actions">
          <a-button type="primary" html-type="submit"><template #icon><IconSearch /></template>{{ t('surveys.filters.search') }}</a-button>
          <a-button class="app-btn-neutral" html-type="button" @click="resetFilters"><template #icon><IconRefresh /></template>{{ t('surveys.filters.reset') }}</a-button>
          <ColumnSettingsPopover
            v-model:visible="filterSettingsOpen"
            :items="filterSettingsItems"
            :default-items="defaultFilterItems"
            :title="t('surveys.filters.settings')"
            :list-aria-label="t('surveys.filters.list')"
            :show-label="t('surveys.columns.show')"
            :restore-label="t('surveys.columns.restore')"
            @change="onFilterSettingsChanged"
          >
            <a-tooltip :content="t('surveys.filters.settings')">
              <a-button class="app-btn-neutral icon-button" html-type="button" :aria-label="t('surveys.filters.settings')" @click="filterSettingsOpen = true"><IconFilter /></a-button>
            </a-tooltip>
          </ColumnSettingsPopover>
        </div>
      </form>
    </div>

    <!-- 列表卡：标题行（任务列表 + 新建任务 + 列设置）+ 表格 + 分页 -->
    <section class="surveys-panel" :aria-label="t('surveys.listTitle')">
      <div class="surveys-heading">
        <h2 class="surveys-heading-title">{{ t('surveys.listTitle') }}</h2>
        <div class="surveys-heading-actions">
          <a-button type="primary" @click="openTaskDrawer">
            <template #icon><IconPlus /></template>
            {{ t('surveys.actions.createTask') }}
          </a-button>
          <!-- 列设置（2026-11-05 裁决）：随新建任务右侧，与标题行同排 -->
          <ColumnSettingsPopover
            v-model:visible="columnSettingsOpen"
            :items="localizedColumns"
            :default-items="localizedDefaultColumns"
            :title="t('surveys.columns.settings')"
            :list-aria-label="t('surveys.columns.list')"
            :show-label="t('surveys.columns.show')"
            :restore-label="t('surveys.columns.restore')"
            @change="onColumnsChanged"
          >
            <a-button
              class="app-btn-neutral column-settings-trigger"
              :aria-label="t('surveys.columns.settings')"
              :title="t('surveys.columns.settings')"
              @click="columnSettingsOpen = true"
            ><IconSettings /></a-button>
          </ColumnSettingsPopover>
        </div>
      </div>

      <!-- 列表：loading / 空态 / 排序 / 分页齐全；筛选与排序条件在翻页间保持 -->
      <a-table
        :columns="tableColumns"
        :data="pagedSurveys"
        :loading="loading"
        :pagination="false"
        :bordered="false"
        :stripe="false"
        :scroll="{ x: horizontalWidth }"
        row-key="id"
        @sorter-change="handleSort"
      >
        <!-- 任务名称 = 天枢下发的任务主标识：行内唯一入口，点击打开任务详情（归一到当前行动步）；
             截止时间已过且未到终态时追加红底「已延期 n 天」标签；清单外角标并入本格 -->
        <template #taskName="{ record }">
          <button
            class="table-link task-name"
            type="button"
            :aria-label="t('surveys.actions.openNo', { no: record.taskName })"
            @click="openSurvey(record)"
          >
            <span class="task-name-text">{{ record.taskName }}</span>
            <a-tag v-if="record.offLedger" size="small" color="orange" class="off-ledger-tag">{{ t('surveys.labels.offLedger') }}</a-tag>
            <a-tag v-if="overdueDays(record)" size="small" color="red" class="overdue-tag">
              {{ t('surveys.labels.overdue', { days: overdueDays(record) }) }}
            </a-tag>
          </button>
        </template>
        <!-- 任务编号：系统内部唯一编号（S-YYYY-####），只读文本 -->
        <template #taskNo="{ record }">
          <span class="task-no-cell">{{ record.id }}</span>
        </template>
        <!-- 待处理任务功能未绑定：FuLi ID 显示 — -->
        <template #fuliId="{ record }">{{ record.fuliId || '—' }}</template>
        <template #status="{ record }">
          <span class="survey-status-cell">
            <!-- 已退回 = 阶段上的标记而非独立阶段（02 §0.5）：列表只显示「已退回」一个标签，
                 阶段信息在点击弹层内给出，避免同一格出现两个状态标签造成误读 -->
            <a-popover v-if="record.returnInfo" trigger="click" position="top" content-class="survey-return-popover">
              <a-tag size="small" color="red" class="survey-return-tag" :aria-label="t('surveys.labels.returned')">{{ t('surveys.labels.returnedShort') }}</a-tag>
              <template #content>
                <div class="survey-return-info">
                  <p><strong>{{ t('surveys.labels.returnStage') }}</strong>{{ statusLabel(record.status) }}</p>
                  <p><strong>{{ t('surveys.labels.returnReason') }}</strong>{{ record.returnInfo.reason }}</p>
                  <p><strong>{{ t('surveys.labels.returnBy') }}</strong>{{ record.returnInfo.operator }}</p>
                  <p><strong>{{ t('surveys.labels.returnTime') }}</strong>{{ record.returnInfo.time }}</p>
                </div>
              </template>
            </a-popover>
            <a-tag v-else :color="surveyStatusColor(record.status)" size="small">{{ statusLabel(record.status) }}</a-tag>
          </span>
        </template>
        <template #clauses="{ record }">
          <!-- DEV-03：参与条目为 0 时不显示 0/64，以「—」+ 提示表达 -->
          <a-tooltip v-if="record.matchedCount === 0" :content="t(record.status === 'draft' || record.status === 'pending-fill' ? 'surveys.labels.notEvaluated' : 'surveys.labels.noClauses')">
            <span class="survey-clauses-none">—</span>
          </a-tooltip>
          <span v-else class="survey-clauses">{{ record.matchedCount }}/{{ record.totalCount }}</span>
        </template>
        <!-- 审核人（F-SURV-02）：未进入审核阶段无审核责任人，以「—」+ 提示表达，不显示空白 -->
        <template #reviewer="{ record }">
          <span v-if="record.reviewer">{{ record.reviewer }}</span>
          <a-tooltip v-else :content="t('surveys.labels.noReviewer')">
            <span class="survey-empty-value">—</span>
          </a-tooltip>
        </template>
        <template #source="{ record }">
          <span class="survey-source-cell">
            <span>{{ sourceLabel(record.source) }}</span>
            <span v-if="record.source === 'excel' && record.importedAt" class="survey-source-meta">
              {{ t('surveys.labels.importMeta', { operator: record.sourceOperator, time: record.importedAt }) }}
            </span>
          </span>
        </template>
        <template #updatedAt="{ record }">{{ displayUpdatedAt(record.updatedAt) }}</template>
        <!-- 更新人：缺省显示 —（列默认隐藏，2026-10-30 二轮） -->
        <template #updatedBy="{ record }">
          <span class="task-no-cell">{{ record.updatedBy || '—' }}</span>
        </template>
        <!-- 优先级 / 任务描述 / 截止时间均为天枢下发的任务属性；描述缺省显示 — -->
        <template #priority="{ record }">
          <a-tag :color="PRIORITY_COLORS[record.priority as TaskPriority]" size="small">{{ t(`surveys.priorities.${record.priority}`) }}</a-tag>
        </template>
        <template #taskDescription="{ record }">
          <span class="task-description-cell" :title="record.taskDescription">{{ record.taskDescription || '—' }}</span>
        </template>
        <template #deadline="{ record }">
          <span class="task-deadline">{{ record.deadline || '—' }}</span>
        </template>
        <template #createdAt="{ record }">{{ record.createdAt }}</template>
        <template #actions="{ record }">
          <div class="table-actions">
            <a-link
              v-for="action in primaryRowActions(record)"
              :key="action.key"
              @click="action.run(record)"
            >{{ action.label }}</a-link>
            <!-- 超过 2 个动作收进「…」：hover 弹出下拉，弹层挂 body 避免被表格滚动容器裁剪 -->
            <a-dropdown
              v-if="moreRowActions(record).length"
              trigger="hover"
              position="br"
              popup-container="body"
              content-class="row-more-dropdown"
            >
              <a-button
                class="row-more-trigger"
                size="mini"
                :aria-label="t('surveys.actions.more')"
                :title="t('surveys.actions.more')"
              >
                <template #icon><IconMore /></template>
              </a-button>
              <template #content>
                <a-doption
                  v-for="action in moreRowActions(record)"
                  :key="action.key"
                  :class="{ 'row-more-danger': action.danger }"
                  @click="action.run(record)"
                >{{ action.label }}</a-doption>
              </template>
            </a-dropdown>
          </div>
        </template>
        <template #empty>
          <div class="surveys-empty">
            <a-empty :description="emptyLabel" />
            <a-button v-if="hasAppliedFilters" class="app-btn-neutral" @click="resetFilters">{{ t('surveys.filters.reset') }}</a-button>
          </div>
        </template>
      </a-table>

      <nav class="surveys-pagination app-pagination" :aria-label="t('surveys.pagination.navigation')">
        <span class="pagination-total">{{ t('surveys.pagination.total', { count: filteredSurveys.length }) }}</span>
        <div class="pagination-pages">
          <a-select class="app-page-size" :model-value="pageSize" :aria-label="t('surveys.pagination.pageSizeAria')" @update:model-value="handlePageSizeChange">
            <a-option v-for="size in [10, 20, 50, 100, 200]" :key="size" :value="size">{{ t('surveys.pagination.perPage', { count: size }) }}</a-option>
          </a-select>
          <button class="pagination-arrow" type="button" :disabled="page === 1" :aria-label="t('surveys.pagination.previous')" @click="setPage(page - 1)"><IconLeft /></button>
          <button
            v-for="number in pageNumbers"
            :key="number"
            class="pagination-number"
            :class="{ active: page === number }"
            type="button"
            :aria-current="page === number ? 'page' : undefined"
            @click="setPage(number)"
          >{{ number }}</button>
          <button class="pagination-arrow" type="button" :disabled="page === totalPages" :aria-label="t('surveys.pagination.next')" @click="setPage(page + 1)"><IconRight /></button>
        </div>
        <span class="pagination-jump-label">{{ t('surveys.pagination.jumpTo') }}</span>
        <a-input-number v-model="jumpPage" class="app-page-jump" :min="1" :max="totalPages" hide-button @press-enter="goToJumpPage" />
        <span class="pagination-total-pages">{{ t('surveys.pagination.totalPages', { count: totalPages }) }}</span>
      </nav>
    </section>

    <!-- 新建任务抽屉（原型交互）：确定创建待处理任务并置顶，取消不保存；
         copy-source = 行内「复制」的任务字段模板（2026-11-02 裁决）；
         edit-orchestration = 天枢平台「任务编排」编辑入口预留（对接见 CreateTaskDrawer.editOrchestration） -->
    <CreateTaskDrawer v-model:visible="taskDrawerOpen" :copy-source="copySource" @created="onTaskCreated" @edit-orchestration="onEditOrchestration" />
  </main>
</template>

<style scoped>
/* 顶部筛选区与列表区同宽，随内容区自适应 */
.surveys-page { min-width: 0; min-height: calc(100dvh - 88px); display: flex; flex-direction: column; gap: 12px; font-size: 14px; }

.surveys-filterbar { width: 100%; min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
/* 页签行（2026-11-05 裁决：移入筛选卡顶部）+ 分割线与筛选条件隔开 */
.surveys-filter-divider { height: 0; margin: 12px 0 16px; border: 0; border-top: 1px solid var(--app-divider); }
.surveys-query { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; min-width: 0; }
.filter-field { display: inline-grid; grid-template-columns: max-content minmax(0, 200px); max-width: 100%; align-items: center; gap: 8px; min-width: 0; color: var(--color-text-2); white-space: nowrap; }
.filter-field > span { text-align: right; }
.filter-field :deep(.app-filter-control) { width: 200px; max-width: 100%; min-width: 0; }
/* 日期区间与其他筛选控件统一 200px（2026-10-29 全局裁决，DESIGN.md Filter geometry 已同步） */
.filter-field--range { grid-template-columns: max-content minmax(0, 200px); }
.filter-field--range :deep(.app-filter-control) { width: 200px; }
.surveys-query-actions { display: flex; align-items: center; gap: 8px; }
.icon-button { width: 32px; height: 32px; padding: 0; }

/* 列表卡：标题行 + 页签 + 表格 + 分页 */
.surveys-panel { flex: 1; min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }

/* 标题行：任务列表（16px/600）靠左，新建任务 + 列设置靠右（2026-11-05 裁决）；
   标题下无分割线，与表格间留 16px 间距（2026-11-05 二轮，对齐台账 ledger-toolbar 口径） */
.surveys-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.surveys-heading-title { margin: 0; color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; }
.surveys-heading-actions { display: flex; align-items: center; gap: 8px; }

/* 页签（在筛选卡内，2026-11-05 二轮裁决：下划线式）——文字页签无边框无底色，
   选中项主色文字 + 底部 2px 主色下划线，未选中次级灰；计数随文字同色 */
.surveys-tabs { display: flex; flex-wrap: wrap; gap: 24px; }
.surveys-tab { position: relative; height: 32px; padding: 0; border: 0; border-radius: 0; background: transparent; color: var(--color-text-2); font: inherit; font-size: 14px; line-height: 30px; white-space: nowrap; cursor: pointer; }
.surveys-tab:hover { color: var(--app-accent); }
.surveys-tab.active { color: var(--app-accent); font-weight: 600; }
.surveys-tab.active::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; border-radius: 1px; background: var(--app-accent); }
.surveys-tab:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.surveys-tab-count { margin-left: 2px; font-weight: 400; font-variant-numeric: tabular-nums; }
.column-settings-trigger { width: 32px; height: 32px; padding: 0; }

/* 数据列表：白底、无外框、无斑马纹、行间单线分隔（与功能台账同一套表格处理） */
.surveys-panel :deep(.arco-table) { border: 0; }
.surveys-panel :deep(.arco-table-container) { border: 0; }
.surveys-panel :deep(.arco-table-th) { height: 44px; padding: 0 12px; border-bottom: 1px solid var(--app-divider); color: var(--color-text-1); background: var(--app-table-header); font-size: 14px; font-weight: 600; line-height: 22px; white-space: nowrap; }
.surveys-panel :deep(.arco-table-td) { height: 52px; padding: 8px 12px; border-bottom: 1px solid var(--app-divider); background: var(--app-surface); font-size: 14px; white-space: nowrap; }
.surveys-panel :deep(.arco-table-th), .surveys-panel :deep(.arco-table-td) { text-align: left; }
.surveys-panel :deep(.arco-table-tr:hover .arco-table-td) { background: var(--color-fill-1); }

.table-link { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; overflow: hidden; padding: 0; border: 0; color: var(--color-text-1); background: transparent; cursor: pointer; font: inherit; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.table-link:hover, .table-link:focus-visible { color: var(--app-accent); }
/* 任务名称是行内唯一可点入口：默认次级正文色，hover/focus 变主题色提示可点 */
.task-name { color: var(--color-text-2); }
.task-name-text { overflow: hidden; text-overflow: ellipsis; }
/* 逾期标记（红底小标签）跟随任务名称展示，与天枢任务中心同构 */
.overdue-tag { flex: none; cursor: default; }
/* 任务编号：等宽数字、次级文本色（行内入口仍是任务名称） */
.task-no-cell { color: var(--color-text-2); font-variant-numeric: tabular-nums; }

.off-ledger-tag { flex: none; cursor: default; }

.survey-status-cell { display: inline-flex; align-items: center; gap: 8px; }
.survey-return-tag { cursor: pointer; }

.survey-clauses { font-variant-numeric: tabular-nums; }
.survey-clauses-none { color: var(--color-text-3); cursor: help; }
/* 空值占位（审核人未定）：与「—」同色，不加粗不发灰块 */
.survey-empty-value { color: var(--color-text-3); cursor: help; }

.survey-source-cell { display: flex; flex-direction: column; gap: 2px; }
.survey-source-meta { color: var(--color-text-3); font-size: 12px; line-height: 20px; }

/* 任务描述：允许两行换行展示（列默认隐藏，勾选后可读完整描述） */
.task-description-cell { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; white-space: normal; overflow-wrap: anywhere; color: var(--color-text-1); }
.task-deadline { font-variant-numeric: tabular-nums; }

.table-actions { display: flex; align-items: center; gap: 12px; }
/* 行内「…」触发器：24px 幽灵图标钮，hover 变主题色（三级选择器压过 Arco icon-only 的 width:auto） */
.table-actions .row-more-trigger.arco-btn { width: 24px; min-width: 24px; height: 24px; padding: 0; color: var(--color-text-3); background: transparent; }
.table-actions .row-more-trigger.arco-btn .arco-btn-icon { color: inherit; }
.table-actions .row-more-trigger.arco-btn:not(.arco-btn-disabled):hover,
.table-actions .row-more-trigger.arco-btn:not(.arco-btn-disabled):active { color: var(--app-accent); background: var(--color-fill-2); }

.surveys-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 0; }
.surveys-empty :deep(.arco-empty-description) { color: var(--color-text-3); font-size: 20px; font-weight: 400; line-height: 28px; }

/* 列表页脚：控件表面统一在 global.css 的 .app-pagination 里 */
.surveys-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 16px; color: var(--color-text-2); }
.pagination-total { margin-right: 8px; color: var(--color-text-3); font-size: 14px; line-height: 22px; }
.pagination-pages { display: flex; align-items: center; gap: 8px; margin-right: 8px; }
.pagination-jump-label, .pagination-total-pages { color: var(--color-text-3); font-size: 14px; line-height: 22px; }

@media (max-width: 720px) {
  .surveys-pagination { justify-content: flex-start; }
  .pagination-total { width: 100%; margin-right: 0; }
}
</style>

<style>
/* 操作列「…」下拉弹层挂在 body（popup-container），scoped 样式够不到，走全局 */
.row-more-dropdown { min-width: 96px; }
.row-more-dropdown .arco-dropdown-option { color: var(--color-text-1); }
.row-more-dropdown .arco-dropdown-option:hover { color: var(--app-accent); background: var(--color-fill-2); }
.row-more-dropdown .arco-dropdown-option.row-more-danger { color: rgb(var(--danger-6)); }
.row-more-dropdown .arco-dropdown-option.row-more-danger:hover { color: rgb(var(--danger-6)); }
</style>
