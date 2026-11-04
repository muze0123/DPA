<script setup lang="ts">
/**
 * 分区表单（2026-11-01 第二轮用户裁决：一级菜单「分区表单」+ 两个二级菜单）。
 *
 * - 两个二级菜单 = 两条独立路由，共用本组件、**页面内不再有页签**：
 *   表单配置（/sections/forms，route.name = section-forms）与
 *   填写记录（/sections/records，route.name = section-records），视图由路由决定；
 * - 表单配置：草稿条件 → 查询应用；行操作顺序 = 详情、编辑、复制、填写记录、删除；
 *   详情为 800px 只读抽屉（基本信息 + 字段清单），「填写记录」跳到填写记录页并带入表单名称；
 * - 填写记录：一行 = 一个表单 × 一份任务/问卷（见 data/formRecords.ts），
 *   列表标题「填写记录」，列为 表单名称 / 任务编号 / 功能 / 填表人 / 状态 / 已填 / 最近更新时间；
 * - 7 个分区页面的「表单版本」页签随改版下线（表单版本职能由表单配置承担）。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Message, type TableColumnData } from '@arco-design/web-vue';
import {
  IconDownload, IconExclamationCircle, IconFilter, IconLeft, IconMore, IconPlus, IconRefresh, IconRight,
  IconSearch, IconSettings,
} from '@arco-design/web-vue/es/icon';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import ColumnSettingsPopover, { type ColumnSettingsItem } from '../../../shared/components/ColumnSettingsPopover.vue';
import { useTaskCenterStore } from '../../task-center/stores/taskCenter';
import { MOCK_CURRENT_USER } from '../../surveys/data/surveys';
import {
  SECTION_FORM_STATUSES, copyForm, deleteForm, findForm, isFormEnabled,
  publishForm, sectionForms, setFormEnabled,
  type SectionForm, type SectionFormField, type SectionFormStatus,
} from '../data/sectionForms';
import {
  FORM_RECORD_STATUSES, listFormRecords,
  type FormRecordStatus, type SectionFormRecord,
} from '../data/formRecords';
import { buildExportRows, buildFunctionListBlob, exportFileName } from '../data/exportRecords';

const { t, locale } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();
const OPERATOR = MOCK_CURRENT_USER.name;

const viewportWidth = ref(window.innerWidth);
function onResize() { viewportWidth.value = window.innerWidth; }

/* ------------------------------------------------------------------ 视图（表单配置 / 填写记录） */

/** 两条二级菜单路由共用本组件：路由决定当前视图，页面内不再有页签 */
type ViewMode = 'config' | 'records';
const mode = computed<ViewMode>(() => (route.name === 'section-records' ? 'records' : 'config'));

/* ------------------------------------------------------------------ 表单配置：筛选（草稿 → 应用） */

const FILTER_KEYS = ['keyword', 'status', 'creator', 'createdAt', 'updater', 'updatedAt'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

interface FormFilters {
  keyword: string;
  status: SectionFormStatus[];
  creator: string;
  createdAt: string[];
  updater: string;
  updatedAt: string[];
}

const defaultFilters = (): FormFilters => ({ keyword: '', status: [], creator: '', createdAt: [], updater: '', updatedAt: [] });

const draft = reactive<FormFilters>(defaultFilters());
const applied = reactive<FormFilters>(defaultFilters());

/** 关键词、状态、创建时间常显；更新人、最近更新时间默认收起（筛选设置可开，2026-10-30 用户裁决） */
const DEFAULT_VISIBLE_FILTERS: FilterKey[] = ['keyword', 'status', 'createdAt'];

const personFilterOptions = (names: (string | undefined)[]) => [...new Set(names.filter((name): name is string => Boolean(name)))]
  .sort((left, right) => left.localeCompare(right))
  .map((name) => ({ value: name, label: name }));

const creatorOptions = computed(() => personFilterOptions(sectionForms.map((item) => item.creator)));
const updaterOptions = computed(() => personFilterOptions(sectionForms.map((item) => item.updater)));

const statusOptions = computed(() => SECTION_FORM_STATUSES.map((status) => ({ value: status, label: t(`sectionForms.statuses.${status}`) })));

const statusModel = computed({
  get: () => draft.status,
  set: (value: SectionFormStatus[] | undefined) => { draft.status = Array.isArray(value) ? value : []; },
});

function isRangeKey(key: FilterKey): key is 'createdAt' | 'updatedAt' {
  return key === 'createdAt' || key === 'updatedAt';
}

/** Arco 区间选择器清除时会把 modelValue 置为 undefined，统一归一到 string[] */
function rangeModel(key: 'createdAt' | 'updatedAt') {
  return computed<string[]>({
    get: () => draft[key],
    set: (value: unknown) => { draft[key] = Array.isArray(value) ? value.map((item) => String(item)) : []; },
  });
}

const createdRangeModel = rangeModel('createdAt');
const updatedRangeModel = rangeModel('updatedAt');

function applyFilters() {
  const copyRange = (range: string[]) => (Array.isArray(range) ? [...range] : []);
  Object.assign(applied, { ...draft, status: [...draft.status], createdAt: copyRange(draft.createdAt), updatedAt: copyRange(draft.updatedAt) });
  page.value = 1;
}

function resetFilters() {
  Object.assign(draft, defaultFilters());
  Object.assign(applied, defaultFilters());
  page.value = 1;
}

function filterLabel(key: FilterKey) { return t(`sectionForms.filters.${key}`); }

const hasAppliedFilters = computed(() =>
  Boolean(applied.keyword.trim() || applied.status.length || applied.creator || applied.updater)
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

/* ------------------------------------------------------------------ 表单配置：列表数据 */

const rows = computed(() => sectionForms.filter((form) => {
  const keyword = applied.keyword.trim().toLowerCase();
  if (keyword && !`${form.name} ${form.id}`.toLowerCase().includes(keyword)) return false;
  if (applied.status.length && !applied.status.includes(form.status)) return false;
  if (applied.creator && form.creator !== applied.creator) return false;
  if (applied.updater && form.updater !== applied.updater) return false;
  const createdDay = form.createdAt.slice(0, 10);
  if (applied.createdAt[0] && createdDay < applied.createdAt[0]) return false;
  if (applied.createdAt[1] && createdDay > applied.createdAt[1]) return false;
  const updatedDay = form.updatedAt.slice(0, 10);
  if (applied.updatedAt[0] && updatedDay < applied.updatedAt[0]) return false;
  if (applied.updatedAt[1] && updatedDay > applied.updatedAt[1]) return false;
  return true;
}));

/* ------------------------------------------------------------------ 表单配置：分页 */

const page = ref(1);
const pageSize = ref(10);
const jumpPage = ref(1);
const totalPages = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize.value)));
const pagedRows = computed(() => rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));

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

/* ------------------------------------------------------------------ 表单配置：列设置 */

type ColumnKey = 'formNo' | 'name' | 'status' | 'note' | 'creator' | 'createdAt' | 'updater' | 'updatedAt' | 'enabled';
const COLUMN_KEYS: ColumnKey[] = ['formNo', 'name', 'status', 'note', 'creator', 'createdAt', 'updater', 'updatedAt', 'enabled'];
/** 更新人 / 最近更新时间默认隐藏（2026-10-30 用户裁决） */
const DEFAULT_VISIBLE: ColumnKey[] = ['formNo', 'name', 'status', 'note', 'creator', 'createdAt', 'enabled'];

const defaultColumns: ColumnSettingsItem[] = COLUMN_KEYS.map((key) => ({
  key, label: key, visible: DEFAULT_VISIBLE.includes(key), disabled: key === 'formNo',
}));
const columns = ref<ColumnSettingsItem[]>(defaultColumns.map((item) => ({ ...item })));
const columnSettingsOpen = ref(false);
const localizedColumns = computed(() => columns.value.map((item) => ({ ...item, label: t(`sectionForms.fields.${item.key}`) })));
const localizedDefaultColumns = computed(() => defaultColumns.map((item) => ({ ...item, label: t(`sectionForms.fields.${item.key}`) })));

const columnWidths: Record<ColumnKey, number> = {
  formNo: 160, name: 200, status: 110, note: 240, creator: 110, createdAt: 170, updater: 110, updatedAt: 170, enabled: 100,
};

const tableColumns = computed<TableColumnData[]>(() => {
  const dataColumns = columns.value.filter((item) => item.visible).map((item): TableColumnData => ({
    title: t(`sectionForms.fields.${item.key}`),
    dataIndex: item.key,
    slotName: item.key,
    width: columnWidths[item.key as ColumnKey],
    align: 'left',
  }));
  return [...dataColumns, { title: t('sectionForms.fields.actions'), dataIndex: 'actions', slotName: 'actions', width: 170, align: 'left', fixed: 'right' }];
});

const horizontalWidth = computed(() => tableColumns.value.reduce((total, column) => total + Number(column.width ?? 140), 0));

function onColumnsChanged(next: ColumnSettingsItem[]) {
  columns.value = next.map((item) => ({ key: item.key, label: item.key, visible: item.visible, disabled: item.key === 'formNo' }));
}

/* ------------------------------------------------------------------ 表单配置：行操作 */

const deleteTarget = ref<SectionForm | null>(null);
const deleteBusy = ref(false);
const publishTarget = ref<SectionForm | null>(null);
const publishBusy = ref(false);

function openCreate() {
  void router.push({ name: 'section-forms-new' });
}

function openEdit(form: SectionForm) {
  void router.push({ name: 'section-forms-edit', params: { formId: form.id } });
}

function requestCopy(form: SectionForm) {
  const created = copyForm(form.id, OPERATOR);
  if (!created) { Message.error(t('sectionForms.messages.storageError')); return; }
  setPage(1);
  Message.success(t('sectionForms.messages.copied', { no: created.id }));
}

/** 填写记录：跳到「填写记录」二级菜单并带入表单名称，列出该表单的全部填写明细 */
function openRecords(form: SectionForm) {
  if (!form.sectionKey) { Message.info(t('sectionForms.messages.noRecords')); return; }
  Object.assign(recordDraft, { formSearch: form.name, keyword: '', status: '' });
  Object.assign(recordApplied, { formSearch: form.name, keyword: '', status: '' });
  setRecordPage(1);
  void router.push({ name: 'section-records' });
}

type RowActionKey = 'detail' | 'edit' | 'publish' | 'copy' | 'records' | 'delete';
interface RowAction { key: RowActionKey; label: string; danger?: boolean; run: (form: SectionForm) => void }

/**
 * 行操作顺序（2026-11-01 用户裁决）：详情、编辑、复制、填写记录、删除；
 * 前两个直显，其余进「…」；草稿的「发布」紧随编辑之后进入「…」首位。
 */
function rowActions(form: SectionForm): RowAction[] {
  const primary: RowAction[] = [
    { key: 'detail', label: t('sectionForms.actions.detail'), run: openFormDetail },
    { key: 'edit', label: t('sectionForms.actions.edit'), run: openEdit },
  ];
  const more: RowAction[] = [];
  if (form.status === 'draft') {
    more.push({ key: 'publish', label: t('sectionForms.actions.publish'), run: (row) => { publishTarget.value = row; } });
  }
  more.push({ key: 'copy', label: t('sectionForms.actions.copy'), run: requestCopy });
  if (form.sectionKey) more.push({ key: 'records', label: t('sectionForms.actions.records'), run: openRecords });
  more.push({ key: 'delete', label: t('sectionForms.actions.delete'), danger: true, run: (row) => { deleteTarget.value = row; } });
  return [...primary, ...more];
}

const PRIMARY_ACTION_COUNT = 2;
const primaryRowActions = (form: SectionForm) => rowActions(form).slice(0, PRIMARY_ACTION_COUNT);
const moreRowActions = (form: SectionForm) => rowActions(form).slice(PRIMARY_ACTION_COUNT);

function statusColor(status: SectionFormStatus): string {
  return status === 'published' ? 'green' : 'gray';
}

/** 「是否启用」开关：直接切换留操作痕迹（updater/updatedAt），不改「草稿/已发布」状态 */
function toggleEnabled(form: SectionForm, value: unknown) {
  const enabled = Boolean(value);
  if (isFormEnabled(form) === enabled) return;
  setFormEnabled(form.id, enabled, OPERATOR);
  Message.success(t(enabled ? 'sectionForms.messages.enabled' : 'sectionForms.messages.disabled'));
}

function performDelete() {
  if (!deleteTarget.value) return;
  deleteBusy.value = true;
  try {
    deleteForm(deleteTarget.value.id);
    deleteTarget.value = null;
    setPage(1);
    void loadRecords();
    Message.success(t('sectionForms.messages.deleted'));
  } catch {
    Message.error(t('sectionForms.messages.storageError'));
  } finally {
    deleteBusy.value = false;
  }
}

function confirmPublish() {
  if (!publishTarget.value) return;
  publishBusy.value = true;
  try {
    publishForm(publishTarget.value.id, OPERATOR);
    Message.success(t('sectionForms.messages.published'));
    publishTarget.value = null;
  } catch {
    Message.error(t('sectionForms.messages.storageError'));
  } finally {
    publishBusy.value = false;
  }
}

/* ------------------------------------------------------------------ 表单详情抽屉（只读） */

const detailFormId = ref('');
const detailForm = computed(() => (detailFormId.value ? findForm(detailFormId.value) ?? null : null));

function openFormDetail(form: SectionForm) { detailFormId.value = form.id; }
function closeFormDetail() { detailFormId.value = ''; }

/** 字段列位（Excel 列字母），与表单设计页同一算法 */
function columnLetter(index: number): string {
  let label = '';
  let rest = index;
  while (rest >= 0) {
    label = String.fromCharCode(65 + (rest % 26)) + label;
    rest = Math.floor(rest / 26) - 1;
  }
  return label;
}

/**
 * 详情抽屉「参数」列：单选框 / 复选框展示选项集（只读查看，不可编辑）。
 * 其他字段类型没有参数，返回空串由模板渲染占位符。
 */
function optionsText(field: SectionFormField): string {
  if (field.type !== 'radio' && field.type !== 'checkbox') return '';
  return field.options.filter((option) => option.trim()).join('、');
}

/* ------------------------------------------------------------------ 填写记录 */

interface RecordFilters { formSearch: string; keyword: string; status: FormRecordStatus | '' }
const defaultRecordFilters = (): RecordFilters => ({ formSearch: '', keyword: '', status: '' });

const recordDraft = reactive<RecordFilters>(defaultRecordFilters());
const recordApplied = reactive<RecordFilters>(defaultRecordFilters());

const recordStatusOptions = computed(() => FORM_RECORD_STATUSES.map((status) => ({
  value: status, label: t(`sectionForms.records.statuses.${status}`),
})));

const RECORD_STATUS_COLOR: Record<FormRecordStatus, string> = {
  pending: 'gray', filling: 'blue', reviewing: 'orange', complete: 'green', returned: 'red',
};
function recordStatusColor(status: FormRecordStatus): string { return RECORD_STATUS_COLOR[status]; }

const allRecords = ref<SectionFormRecord[]>([]);
const recordsLoading = ref(true);
const recordsError = ref(false);

async function loadRecords() {
  recordsLoading.value = true;
  try { allRecords.value = await listFormRecords(); recordsError.value = false; }
  catch { allRecords.value = []; recordsError.value = true; }
  finally { recordsLoading.value = false; }
}

const filteredRecords = computed(() => {
  const formQuery = recordApplied.formSearch.trim().toLowerCase();
  const keyword = recordApplied.keyword.trim().toLowerCase();
  return allRecords.value.filter((row) => {
    if (recordApplied.status && row.status !== recordApplied.status) return false;
    if (formQuery && !`${row.formName} ${row.formId}`.toLowerCase().includes(formQuery)) return false;
    if (keyword && ![row.taskNo, row.functionName, row.fuliId, row.respondent]
      .some((value) => (value ?? '').toLowerCase().includes(keyword))) return false;
    return true;
  });
});

const hasAppliedRecordFilters = computed(() =>
  Boolean(recordApplied.formSearch.trim() || recordApplied.keyword.trim() || recordApplied.status));

const recordPage = ref(1);
const recordPageSize = ref(10);
const recordJumpPage = ref(1);
const recordTotalPages = computed(() => Math.max(1, Math.ceil(filteredRecords.value.length / recordPageSize.value)));
const pagedRecords = computed(() => filteredRecords.value.slice((recordPage.value - 1) * recordPageSize.value, recordPage.value * recordPageSize.value));

const recordPageNumbers = computed(() => {
  const windowSize = Math.min(recordTotalPages.value, 5);
  const start = Math.min(Math.max(recordPage.value - Math.floor(windowSize / 2), 1), recordTotalPages.value - windowSize + 1);
  return Array.from({ length: windowSize }, (_, index) => start + index);
});

function setRecordPage(value: number) {
  recordPage.value = Math.min(Math.max(Number.isFinite(value) ? value : 1, 1), recordTotalPages.value);
  recordJumpPage.value = recordPage.value;
}
function handleRecordPageSizeChange(value: unknown) {
  const nextSize = Number(value);
  if (!Number.isFinite(nextSize) || nextSize <= 0) return;
  recordPageSize.value = nextSize;
  setRecordPage(1);
}
function applyRecordFilters() {
  Object.assign(recordApplied, { ...recordDraft });
  setRecordPage(1);
}
function resetRecordFilters() {
  Object.assign(recordDraft, defaultRecordFilters());
  Object.assign(recordApplied, defaultRecordFilters());
  setRecordPage(1);
}

const recordColumns = computed<TableColumnData[]>(() => [
  { title: t('sectionForms.records.columns.formName'), dataIndex: 'formName', slotName: 'recordForm', width: 190 },
  { title: t('sectionForms.records.columns.taskNo'), dataIndex: 'taskNo', slotName: 'recordTaskNo', width: 150 },
  { title: t('sectionForms.records.columns.function'), dataIndex: 'functionName', slotName: 'recordFunction', width: 210 },
  { title: t('sectionForms.records.columns.respondent'), dataIndex: 'respondent', width: 110 },
  { title: t('sectionForms.records.columns.status'), dataIndex: 'status', slotName: 'recordStatus', width: 110 },
  { title: t('sectionForms.records.columns.filled'), dataIndex: 'filled', slotName: 'recordFilled', width: 110 },
  { title: t('sectionForms.records.columns.updated'), dataIndex: 'updatedAt', width: 170 },
  { title: t('sectionForms.records.columns.actions'), dataIndex: 'actions', slotName: 'recordActions', width: 110, fixed: 'right' },
]);

const recordTableWidth = 190 + 150 + 210 + 110 + 110 + 110 + 170 + 110;

function filledText(row: SectionFormRecord): string {
  return row.total ? `${row.filled}/${row.total}` : '—';
}

/* ---------------------------------------------------------------- 导出（当前筛选结果 → 功能清单工作簿） */

const exportOpen = ref(false);
const exporting = ref(false);

/**
 * 行集合受筛选约束（DESIGN.md：导出始终对当前筛选结果生效），
 * 字段值取该任务的全部记录，保证每行 51 列内容不被表单筛选截断。
 */
const exportRows = computed(() => buildExportRows(filteredRecords.value, allRecords.value));

/** 任务中心记录使用固定 YYYY-MM-DD HH:mm:ss 文本 */
function clockText(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}
function stampText(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function requestExport() {
  if (exporting.value) return;
  if (!exportRows.value.length) { Message.info(t('sectionForms.records.noExport')); return; }
  exportOpen.value = true;
}

async function confirmExport() {
  if (exporting.value || !exportRows.value.length) return;
  exporting.value = true;
  try {
    const blob = await buildFunctionListBlob(exportRows.value);
    const now = new Date();
    const taskCenter = useTaskCenterStore();
    taskCenter.addDownloadTask({
      id: `dl-${now.getTime()}`, module: 'sections',
      fileStamp: stampText(now),
      operator: OPERATOR, time: clockText(now),
      status: 'processing', progress: 92,
      fileUrl: URL.createObjectURL(blob),
      fileName: exportFileName(now),
    });
    exportOpen.value = false;
    Message.success(t('sectionForms.records.exportNotice.created'));
    taskCenter.open('download');
  } catch { Message.error(t('sectionForms.records.exportFailed')); }
  finally { exporting.value = false; }
}

/** 填写明细抽屉：只读，画布 Fill-1 + 白色分组卡片 */
const detailRecordKey = ref('');
const detailRecord = computed(() => allRecords.value.find((row) => row.key === detailRecordKey.value) ?? null);
function openRecordDetail(row: SectionFormRecord) { detailRecordKey.value = row.key; }
function closeRecordDetail() { detailRecordKey.value = ''; }

function fieldLabel(field: { labelZh: string; labelEn: string }): string {
  return locale.value === 'zh-CN' ? field.labelZh : field.labelEn;
}

onMounted(() => {
  window.addEventListener('resize', onResize);
  void loadRecords();
});
onBeforeUnmount(() => window.removeEventListener('resize', onResize));
</script>

<template>
  <main class="section-forms-page">
    <!-- 区块一：当前视图的筛选条件（白面板；视图由二级菜单路由决定，无页签） -->
    <section class="section-forms-toolbar" :aria-label="mode === 'config' ? t('sectionForms.listTitle') : t('sectionForms.records.title')">
      <form v-if="mode === 'config'" class="section-forms-query" @submit.prevent="applyFilters">
        <label v-for="key in visibleFilterKeys" :key="key" class="filter-field" :class="{ 'filter-field--range': isRangeKey(key) }">
          <span>{{ filterLabel(key) }}</span>
          <a-input v-if="key === 'keyword'" v-model="draft.keyword" class="app-filter-control" allow-clear :placeholder="t('sectionForms.filters.keywordPlaceholder')" />
          <a-select v-else-if="key === 'status'" v-model="statusModel" class="app-filter-control" multiple allow-clear :max-tag-count="1" :placeholder="t('sectionForms.filters.all')" :options="statusOptions" />
          <a-select v-else-if="key === 'creator'" v-model="draft.creator" class="app-filter-control" allow-clear :placeholder="t('sectionForms.filters.all')" :options="creatorOptions" />
          <a-select v-else-if="key === 'updater'" v-model="draft.updater" class="app-filter-control" allow-clear :placeholder="t('sectionForms.filters.all')" :options="updaterOptions" />
          <a-range-picker
            v-else-if="key === 'createdAt'"
            v-model="createdRangeModel"
            class="app-filter-control"
            value-format="YYYY-MM-DD"
            allow-clear
            :placeholder="[t('sectionForms.filters.from'), t('sectionForms.filters.to')]"
          />
          <a-range-picker
            v-else-if="key === 'updatedAt'"
            v-model="updatedRangeModel"
            class="app-filter-control"
            value-format="YYYY-MM-DD"
            allow-clear
            :placeholder="[t('sectionForms.filters.from'), t('sectionForms.filters.to')]"
          />
        </label>
        <div class="section-forms-query-actions">
          <a-button type="primary" html-type="submit"><template #icon><IconSearch /></template>{{ t('sectionForms.filters.search') }}</a-button>
          <a-button class="app-btn-neutral" html-type="button" @click="resetFilters"><template #icon><IconRefresh /></template>{{ t('sectionForms.filters.reset') }}</a-button>
          <ColumnSettingsPopover
            v-model:visible="filterSettingsOpen"
            :items="filterSettingsItems"
            :default-items="defaultFilterItems"
            :title="t('sectionForms.filters.settings')"
            :list-aria-label="t('sectionForms.filters.list')"
            :show-label="t('sectionForms.columns.show')"
            :restore-label="t('sectionForms.columns.restore')"
            @change="onFilterSettingsChanged"
          >
            <a-button class="app-btn-neutral icon-button" html-type="button" :aria-label="t('sectionForms.filters.settings')" :title="t('sectionForms.filters.settings')" @click="filterSettingsOpen = true"><IconFilter /></a-button>
          </ColumnSettingsPopover>
        </div>
      </form>

      <form v-else class="section-forms-query" :aria-label="t('sectionForms.records.filters')" @submit.prevent="applyRecordFilters">
        <label class="filter-field" for="section-record-form">
          <span>{{ t('sectionForms.records.formSearch') }}</span>
          <!-- id 落在真实 input 上（input-attrs），label for 才能正确关联；Arco 默认把 id 落在包裹 span 上 -->
          <a-input
            v-model="recordDraft.formSearch"
            class="app-filter-control"
            allow-clear
            :input-attrs="{ id: 'section-record-form', 'aria-label': t('sectionForms.records.formSearch') }"
            :placeholder="t('sectionForms.records.formSearchPlaceholder')"
          />
        </label>
        <label class="filter-field" for="section-record-keyword">
          <span>{{ t('sectionForms.records.keyword') }}</span>
          <a-input
            v-model="recordDraft.keyword"
            class="app-filter-control"
            allow-clear
            :input-attrs="{ id: 'section-record-keyword', 'aria-label': t('sectionForms.records.keyword') }"
            :placeholder="t('sectionForms.records.keywordPlaceholder')"
          />
        </label>
        <label class="filter-field" for="section-record-status">
          <span>{{ t('sectionForms.records.status') }}</span>
          <a-select id="section-record-status" v-model="recordDraft.status" class="app-filter-control" allow-clear :placeholder="t('sectionForms.records.all')" :options="recordStatusOptions" />
        </label>
        <div class="section-forms-query-actions">
          <a-button type="primary" html-type="submit"><template #icon><IconSearch /></template>{{ t('sectionForms.filters.search') }}</a-button>
          <a-button class="app-btn-neutral" html-type="button" @click="resetRecordFilters"><template #icon><IconRefresh /></template>{{ t('sectionForms.filters.reset') }}</a-button>
        </div>
      </form>
    </section>

    <!-- 区块二：表单配置列表（标题行 + 新建 + 列设置 + 表格 + 分页） -->
    <section v-if="mode === 'config'" class="section-forms-panel" :aria-label="t('sectionForms.listTitle')">
      <div class="section-forms-heading">
        <div class="section-forms-heading-left">
          <h2 class="section-forms-heading-title">{{ t('sectionForms.listTitle') }}</h2>
          <span class="section-forms-heading-count">{{ t('sectionForms.listCount', { count: rows.length }) }}</span>
        </div>
        <div class="section-forms-heading-actions">
          <a-button type="primary" @click="openCreate"><template #icon><IconPlus /></template>{{ t('sectionForms.actions.create') }}</a-button>
          <ColumnSettingsPopover
            v-model:visible="columnSettingsOpen"
            :items="localizedColumns"
            :default-items="localizedDefaultColumns"
            :title="t('sectionForms.columns.settings')"
            :list-aria-label="t('sectionForms.columns.list')"
            :show-label="t('sectionForms.columns.show')"
            :restore-label="t('sectionForms.columns.restore')"
            @change="onColumnsChanged"
          >
            <a-button
              class="app-btn-neutral column-settings-trigger"
              :aria-label="t('sectionForms.columns.settings')"
              :title="t('sectionForms.columns.settings')"
              @click="columnSettingsOpen = true"
            ><IconSettings /></a-button>
          </ColumnSettingsPopover>
        </div>
      </div>

      <hr class="section-forms-divider" />

      <a-table
        :columns="tableColumns"
        :data="pagedRows"
        :pagination="false"
        :bordered="false"
        :stripe="false"
        :scroll="{ x: horizontalWidth }"
        row-key="id"
      >
        <template #formNo="{ record }">
          <button class="table-link" type="button" :aria-label="t('sectionForms.actions.detail')" @click="openFormDetail(record)">{{ record.id }}</button>
        </template>
        <template #name="{ record }">{{ record.name }}</template>
        <template #status="{ record }">
          <a-tag :color="statusColor(record.status)" size="small">{{ t(`sectionForms.statuses.${record.status}`) }}</a-tag>
        </template>
        <template #note="{ record }"><span class="form-note-cell">{{ record.note || '—' }}</span></template>
        <template #creator="{ record }">{{ record.creator }}</template>
        <template #createdAt="{ record }"><span class="tabular">{{ record.createdAt }}</span></template>
        <template #updater="{ record }">{{ record.updater }}</template>
        <template #updatedAt="{ record }"><span class="tabular">{{ record.updatedAt }}</span></template>
        <template #enabled="{ record }">
          <a-switch
            :model-value="isFormEnabled(record)"
            :aria-label="t('sectionForms.fields.enabled')"
            @change="toggleEnabled(record, $event)"
          />
        </template>
        <template #actions="{ record }">
          <div class="table-actions">
            <a-link v-for="action in primaryRowActions(record)" :key="action.key" @click="action.run(record)">{{ action.label }}</a-link>
            <a-dropdown v-if="moreRowActions(record).length" trigger="hover" position="br" popup-container="body" content-class="row-more-dropdown">
              <a-button class="row-more-trigger" size="mini" :aria-label="t('sectionForms.actions.more')" :title="t('sectionForms.actions.more')">
                <template #icon><IconMore /></template>
              </a-button>
              <template #content>
                <a-doption v-for="action in moreRowActions(record)" :key="action.key" :class="{ 'row-more-danger': action.danger }" @click="action.run(record)">{{ action.label }}</a-doption>
              </template>
            </a-dropdown>
          </div>
        </template>
        <template #empty>
          <div class="section-forms-empty">
            <a-empty :description="hasAppliedFilters ? t('sectionForms.empty.noMatch') : t('sectionForms.empty.noData')" />
            <a-button v-if="hasAppliedFilters" class="app-btn-neutral" @click="resetFilters">{{ t('sectionForms.filters.reset') }}</a-button>
          </div>
        </template>
      </a-table>

      <nav class="section-forms-pagination app-pagination" :aria-label="t('sectionForms.pagination.navigation')">
        <span class="pagination-total">{{ t('sectionForms.pagination.total', { count: rows.length }) }}</span>
        <div class="pagination-pages">
          <a-select class="app-page-size" :model-value="pageSize" :aria-label="t('sectionForms.pagination.pageSizeAria')" @update:model-value="handlePageSizeChange">
            <a-option v-for="size in [10, 20, 50, 100, 200]" :key="size" :value="size">{{ t('sectionForms.pagination.perPage', { count: size }) }}</a-option>
          </a-select>
          <button class="pagination-arrow" type="button" :disabled="page === 1" :aria-label="t('sectionForms.pagination.previous')" @click="setPage(page - 1)"><IconLeft /></button>
          <button
            v-for="number in pageNumbers"
            :key="number"
            class="pagination-number"
            :class="{ active: page === number }"
            type="button"
            :aria-current="page === number ? 'page' : undefined"
            @click="setPage(number)"
          >{{ number }}</button>
          <button class="pagination-arrow" type="button" :disabled="page === totalPages" :aria-label="t('sectionForms.pagination.next')" @click="setPage(page + 1)"><IconRight /></button>
        </div>
        <span class="pagination-jump-label">{{ t('sectionForms.pagination.jumpTo') }}</span>
        <a-input-number v-model="jumpPage" class="app-page-jump" :min="1" :max="totalPages" hide-button @press-enter="setPage(Number(jumpPage))" />
        <span class="pagination-total-pages">{{ t('sectionForms.pagination.totalPages', { count: totalPages }) }}</span>
      </nav>
    </section>

    <!-- 区块二（填写记录）：一行 = 一个表单 × 一份任务/问卷 -->
    <section v-else class="section-forms-panel" :aria-label="t('sectionForms.records.title')">
      <div class="section-forms-heading">
        <div class="section-forms-heading-left">
          <h2 class="section-forms-heading-title">{{ t('sectionForms.records.title') }}</h2>
          <span class="section-forms-heading-count">{{ t('sectionForms.records.count', { count: filteredRecords.length }) }}</span>
        </div>
        <div class="section-forms-heading-actions">
          <a-button class="app-btn-neutral" @click="requestExport">
            <template #icon><IconDownload /></template>{{ t('sectionForms.records.export') }}
          </a-button>
        </div>
      </div>

      <hr class="section-forms-divider" />

      <a-table
        :columns="recordColumns"
        :data="pagedRecords"
        :loading="recordsLoading"
        :pagination="false"
        :bordered="false"
        :stripe="false"
        :scroll="{ x: recordTableWidth }"
        row-key="key"
      >
        <template #recordForm="{ record }"><span class="record-form-cell">{{ record.formName }}</span></template>
        <template #recordTaskNo="{ record }"><span class="tabular">{{ record.taskNo || '—' }}</span></template>
        <template #recordFunction="{ record }">
          <button class="table-link" type="button" :title="record.functionName" @click="openRecordDetail(record)">{{ record.functionName }}</button>
          <small class="record-fuli">{{ record.fuliId }}</small>
        </template>
        <template #recordStatus="{ record }">
          <a-tag :color="recordStatusColor(record.status)" size="small">{{ t(`sectionForms.records.statuses.${record.status}`) }}</a-tag>
        </template>
        <template #recordFilled="{ record }"><span class="tabular">{{ filledText(record) }}</span></template>
        <template #recordActions="{ record }">
          <a-link @click="openRecordDetail(record)">{{ t('sectionForms.records.view') }}</a-link>
        </template>
        <template #empty>
          <div class="section-forms-empty">
            <a-empty :description="recordsError ? t('sectionForms.records.unavailable') : hasAppliedRecordFilters ? t('sectionForms.records.noMatch') : t('sectionForms.records.empty')" />
            <a-button v-if="hasAppliedRecordFilters" class="app-btn-neutral" @click="resetRecordFilters">{{ t('sectionForms.filters.reset') }}</a-button>
          </div>
        </template>
      </a-table>

      <nav class="section-forms-pagination app-pagination" :aria-label="t('sectionForms.records.pagination.navigation')">
        <span class="pagination-total">{{ t('sectionForms.records.pagination.total', { count: filteredRecords.length }) }}</span>
        <div class="pagination-pages">
          <a-select class="app-page-size" :model-value="recordPageSize" :aria-label="t('sectionForms.records.pagination.pageSizeAria')" @update:model-value="handleRecordPageSizeChange">
            <a-option v-for="size in [10, 20, 50, 100, 200]" :key="size" :value="size">{{ t('sectionForms.records.pagination.perPage', { count: size }) }}</a-option>
          </a-select>
          <button class="pagination-arrow" type="button" :disabled="recordPage === 1" :aria-label="t('sectionForms.records.pagination.previous')" @click="setRecordPage(recordPage - 1)"><IconLeft /></button>
          <button
            v-for="number in recordPageNumbers"
            :key="number"
            class="pagination-number"
            :class="{ active: recordPage === number }"
            type="button"
            :aria-current="recordPage === number ? 'page' : undefined"
            @click="setRecordPage(number)"
          >{{ number }}</button>
          <button class="pagination-arrow" type="button" :disabled="recordPage === recordTotalPages" :aria-label="t('sectionForms.records.pagination.next')" @click="setRecordPage(recordPage + 1)"><IconRight /></button>
        </div>
        <span class="pagination-jump-label">{{ t('sectionForms.records.pagination.jumpTo') }}</span>
        <a-input-number v-model="recordJumpPage" class="app-page-jump" :min="1" :max="recordTotalPages" hide-button @press-enter="setRecordPage(Number(recordJumpPage))" />
        <span class="pagination-total-pages">{{ t('sectionForms.records.pagination.totalPages', { count: recordTotalPages }) }}</span>
      </nav>
    </section>

    <!-- 表单详情（只读抽屉 800px · Fill-1 画布 + 白色分组卡片） -->
    <a-drawer
      class="section-form-drawer"
      :visible="Boolean(detailForm)"
      :width="Math.min(800, viewportWidth - 16)"
      :mask-closable="true"
      :title="t('sectionForms.detail.title')"
      unmount-on-close
      @cancel="closeFormDetail"
    >
      <template v-if="detailForm">
        <section class="detail-card">
          <div class="detail-identity">
            <strong>{{ detailForm.name }}</strong>
            <a-tag :color="statusColor(detailForm.status)" size="small">{{ t(`sectionForms.statuses.${detailForm.status}`) }}</a-tag>
          </div>
          <div class="app-detail-list">
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.fields.formNo') }}</span><span class="app-detail-value tabular">{{ detailForm.id }}</span></div>
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.fields.name') }}</span><span class="app-detail-value">{{ detailForm.name }}</span></div>
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.fields.status') }}</span><span class="app-detail-value">{{ t(`sectionForms.statuses.${detailForm.status}`) }}</span></div>
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.fields.enabled') }}</span><span class="app-detail-value">{{ t(isFormEnabled(detailForm) ? 'sectionForms.detail.enabledYes' : 'sectionForms.detail.enabledNo') }}</span></div>
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.detail.section') }}</span><span class="app-detail-value">{{ detailForm.sectionKey ? t(`sectionForms.sectionNames.${detailForm.sectionKey}`) : t('sectionForms.detail.customForm') }}</span></div>
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.fields.note') }}</span><span class="app-detail-value">{{ detailForm.note || '—' }}</span></div>
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.fields.creator') }}</span><span class="app-detail-value">{{ detailForm.creator }}</span></div>
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.fields.createdAt') }}</span><span class="app-detail-value tabular">{{ detailForm.createdAt }}</span></div>
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.fields.updater') }}</span><span class="app-detail-value">{{ detailForm.updater }}</span></div>
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.fields.updatedAt') }}</span><span class="app-detail-value tabular">{{ detailForm.updatedAt }}</span></div>
          </div>
        </section>

        <section class="detail-card">
          <div class="detail-card-head">
            <strong>{{ t('sectionForms.detail.fields') }}</strong>
            <span>{{ t('sectionForms.editor.fieldCount', { n: detailForm.fields.length }) }}</span>
          </div>
          <div class="detail-field-table">
            <div class="detail-field-row detail-field-head">
              <span>{{ t('sectionForms.detail.column.index') }}</span>
              <span>{{ t('sectionForms.detail.column.name') }}</span>
              <span>{{ t('sectionForms.detail.column.type') }}</span>
              <span>{{ t('sectionForms.detail.column.requiredness') }}</span>
              <span>{{ t('sectionForms.detail.column.options') }}</span>
            </div>
            <div v-for="(field, index) in detailForm.fields" :key="index" class="detail-field-row">
              <span class="tabular">{{ columnLetter(index) }}</span>
              <span class="detail-field-name">
                <span class="detail-field-label">{{ field.name }}</span>
                <span v-if="field.locked" class="detail-master-badge">{{ t('sectionForms.editor.masterBadge') }}</span>
              </span>
              <span>{{ t(`sectionForms.editor.types.${field.type}`) }}</span>
              <span>{{ t(`sectionForms.editor.requirednessOptions.${field.requiredness}`) }}</span>
              <span class="detail-field-options" :class="{ 'is-empty': !optionsText(field) }">{{ optionsText(field) || '—' }}</span>
            </div>
          </div>
        </section>
      </template>
      <template #footer><a-button class="app-btn-neutral" @click="closeFormDetail">{{ t('sectionForms.detail.close') }}</a-button></template>
    </a-drawer>

    <!-- 填写明细（只读抽屉 800px） -->
    <a-drawer
      class="section-record-drawer"
      :visible="Boolean(detailRecord)"
      :width="Math.min(800, viewportWidth - 16)"
      :mask-closable="true"
      :title="t('sectionForms.records.detailTitle')"
      unmount-on-close
      @cancel="closeRecordDetail"
    >
      <template v-if="detailRecord">
        <section class="detail-card">
          <div class="detail-identity">
            <strong>{{ detailRecord.formName }}</strong>
            <a-tag :color="recordStatusColor(detailRecord.status)" size="small">{{ t(`sectionForms.records.statuses.${detailRecord.status}`) }}</a-tag>
          </div>
          <div class="app-detail-list">
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.records.details.form') }}</span><span class="app-detail-value">{{ detailRecord.formName }}</span></div>
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.records.details.taskNo') }}</span><span class="app-detail-value tabular">{{ detailRecord.taskNo || '—' }}</span></div>
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.records.details.function') }}</span><span class="app-detail-value">{{ detailRecord.functionName || '—' }}</span></div>
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.records.details.fuliId') }}</span><span class="app-detail-value">{{ detailRecord.fuliId || '—' }}</span></div>
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.records.details.respondent') }}</span><span class="app-detail-value">{{ detailRecord.respondent || '—' }}</span></div>
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.records.details.status') }}</span><span class="app-detail-value">{{ t(`sectionForms.records.statuses.${detailRecord.status}`) }}</span></div>
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.records.details.filled') }}</span><span class="app-detail-value tabular">{{ filledText(detailRecord) }}</span></div>
            <div class="app-detail-row"><span class="app-detail-label">{{ t('sectionForms.records.details.updated') }}</span><span class="app-detail-value tabular">{{ detailRecord.updatedAt || '—' }}</span></div>
          </div>
        </section>

        <section class="detail-card">
          <div class="detail-card-head">
            <strong>{{ t('sectionForms.records.fieldValues') }}</strong>
            <span>{{ t('sectionForms.records.details.filled') }} {{ filledText(detailRecord) }}</span>
          </div>
          <div class="app-detail-list record-field-list">
            <div v-for="field in detailRecord.fields" :key="field.code" class="app-detail-row">
              <span class="app-detail-label record-field-label">
                <span>{{ fieldLabel(field) }}</span>
                <span class="detail-code">{{ field.code }}</span>
                <span v-if="field.master" class="detail-master-badge">{{ t('sectionForms.editor.masterBadge') }}</span>
              </span>
              <span class="app-detail-value" :class="{ 'is-unfilled': !field.value }">{{ field.value || t('sectionForms.records.unfilled') }}</span>
            </div>
          </div>
        </section>
      </template>
      <template #footer><a-button class="app-btn-neutral" @click="closeRecordDetail">{{ t('sectionForms.detail.close') }}</a-button></template>
    </a-drawer>

    <!-- 删除确认（456px · DESIGN.md Dialog） -->
    <a-modal
      :visible="Boolean(deleteTarget)"
      :width="456"
      :mask-closable="!deleteBusy"
      :title="t('sectionForms.messages.deleteTitle')"
      @cancel="!deleteBusy && (deleteTarget = null)"
    >
      <p>{{ t('sectionForms.messages.deleteConfirm', { name: deleteTarget?.name ?? '', no: deleteTarget?.id ?? '' }) }}</p>
      <template #footer>
        <a-button class="app-btn-neutral" :disabled="deleteBusy" @click="deleteTarget = null">{{ t('sectionForms.actions.cancel') }}</a-button>
        <a-button type="primary" status="danger" :loading="deleteBusy" @click="performDelete">{{ t('sectionForms.actions.confirmDelete') }}</a-button>
      </template>
    </a-modal>

    <!-- 发布确认：二次确认 -->
    <a-modal
      :visible="Boolean(publishTarget)"
      :width="456"
      :title="t('sectionForms.messages.publishTitle')"
      @cancel="publishTarget = null"
    >
      <p>{{ t('sectionForms.messages.publishConfirm', { name: publishTarget?.name ?? '', no: publishTarget?.id ?? '' }) }}</p>
      <template #footer>
        <a-button class="app-btn-neutral" @click="publishTarget = null">{{ t('sectionForms.actions.cancel') }}</a-button>
        <a-button type="primary" :loading="publishBusy" @click="confirmPublish">{{ t('sectionForms.actions.publish') }}</a-button>
      </template>
    </a-modal>
    <!-- 导出确认弹窗：确认后生成「功能清单」工作簿并进入任务中心「下载任务」 -->
    <a-modal
      :visible="exportOpen"
      :width="456"
      :mask-closable="!exporting"
      :title="t('sectionForms.records.exportNotice.title')"
      @cancel="!exporting && (exportOpen = false)"
    >
      <div class="section-forms-export-notice">
        <IconExclamationCircle class="section-forms-export-icon" />
        <div class="section-forms-export-text">
          <p>{{ t('sectionForms.records.exportNotice.line1', { count: exportRows.length }) }}</p>
          <p>{{ t('sectionForms.records.exportNotice.line2') }}</p>
        </div>
      </div>
      <template #footer>
        <a-button class="app-btn-neutral" :disabled="exporting" @click="exportOpen = false">{{ t('sectionForms.records.exportNotice.cancel') }}</a-button>
        <a-button type="primary" :loading="exporting" @click="confirmExport">{{ t('sectionForms.records.exportNotice.confirm') }}</a-button>
      </template>
    </a-modal>
  </main>
</template>

<style scoped>
.section-forms-page { min-width: 0; min-height: calc(100dvh - 88px); display: flex; flex-direction: column; gap: 12px; font-size: 14px; }

.section-forms-toolbar, .section-forms-filterbar, .section-forms-panel { width: 100%; min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }

.section-forms-query { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; min-width: 0; }
.filter-field { display: inline-grid; grid-template-columns: max-content minmax(0, 200px); max-width: 100%; align-items: center; gap: 8px; min-width: 0; color: var(--color-text-2); white-space: nowrap; }
.filter-field > span { text-align: right; }
.filter-field :deep(.app-filter-control) { width: 200px; max-width: 100%; min-width: 0; }
/* 日期区间与其他筛选控件统一 200px（2026-10-29 全局裁决） */
.filter-field--range { grid-template-columns: max-content minmax(0, 200px); }
.filter-field--range :deep(.app-filter-control) { width: 200px; }
.section-forms-query-actions { display: flex; align-items: center; gap: 8px; }
.icon-button { width: 32px; height: 32px; padding: 0; }

.section-forms-panel { flex: 1; min-width: 0; }
.section-forms-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.section-forms-heading-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.section-forms-heading-title { margin: 0; color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; }
.section-forms-heading-count { color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.section-forms-heading-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.section-forms-export-notice { display: flex; align-items: flex-start; gap: 12px; }
.section-forms-export-icon { flex: none; margin-top: 2px; color: var(--app-color-warning); font-size: 24px; }
.section-forms-export-text p { margin: 0 0 4px; line-height: 22px; }
.section-forms-export-text p:last-child { margin-bottom: 0; }
.section-forms-divider { height: 0; margin: 0 0 12px; border: 0; border-top: 1px solid var(--app-divider); }
.column-settings-trigger { width: 32px; height: 32px; padding: 0; }

.section-forms-panel :deep(.arco-table) { border: 0; }
.section-forms-panel :deep(.arco-table-container) { border: 0; }
.section-forms-panel :deep(.arco-table-th) { height: 44px; padding: 0 12px; border-bottom: 1px solid var(--app-divider); color: var(--color-text-1); background: var(--app-table-header); font-size: 14px; font-weight: 600; line-height: 22px; white-space: nowrap; }
.section-forms-panel :deep(.arco-table-td) { height: 52px; padding: 8px 12px; border-bottom: 1px solid var(--app-divider); background: var(--app-surface); font-size: 14px; white-space: nowrap; }
.section-forms-panel :deep(.arco-table-tr:hover .arco-table-td) { background: var(--color-fill-1); }

.tabular { font-variant-numeric: tabular-nums; }
.table-link { display: inline-flex; align-items: center; max-width: 100%; overflow: hidden; padding: 0; border: 0; color: var(--color-text-1); background: transparent; cursor: pointer; font: inherit; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.table-link:hover, .table-link:focus-visible { color: var(--app-accent); }
.form-note-cell { display: inline-block; max-width: 236px; overflow: hidden; color: var(--color-text-2); text-overflow: ellipsis; vertical-align: middle; }
.record-form-cell { display: inline-block; max-width: 170px; overflow: hidden; color: var(--color-text-1); text-overflow: ellipsis; vertical-align: middle; }
.record-fuli { display: block; margin-top: 2px; color: var(--color-text-3); font-size: 12px; line-height: 18px; }

.table-actions { display: flex; align-items: center; gap: 12px; }
.table-actions .row-more-trigger.arco-btn { width: 24px; min-width: 24px; height: 24px; padding: 0; color: var(--color-text-3); background: transparent; }
.table-actions .row-more-trigger.arco-btn .arco-btn-icon { color: inherit; }
.table-actions .row-more-trigger.arco-btn:not(.arco-btn-disabled):hover,
.table-actions .row-more-trigger.arco-btn:not(.arco-btn-disabled):active { color: var(--app-accent); background: var(--color-fill-2); }

.section-forms-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 0; }
.section-forms-empty :deep(.arco-empty-description) { color: var(--color-text-3); font-size: 20px; font-weight: 400; line-height: 28px; }

.section-forms-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 16px; color: var(--color-text-2); }
.pagination-total { margin-right: 8px; color: var(--color-text-3); font-size: 14px; line-height: 22px; }
.pagination-pages { display: flex; align-items: center; gap: 8px; margin-right: 8px; }
.pagination-jump-label, .pagination-total-pages { color: var(--color-text-3); font-size: 14px; line-height: 22px; }

/* 抽屉内容：白色分组卡片（画布色由全局 .section-form-drawer 规则给到） */
.detail-card { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.detail-card + .detail-card { margin-top: 16px; }
.detail-identity { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 12px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--app-divider); }
.detail-identity strong { font-size: 16px; font-weight: 600; line-height: 24px; }
.detail-identity span { color: var(--color-text-3); font-size: 13px; }
.detail-card-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: flex-start; gap: 4px 8px; margin-bottom: 12px; }
.detail-card-head strong { font-size: 14px; font-weight: 600; line-height: 22px; }
.detail-card-head span { color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.detail-code { margin-left: 4px; color: var(--color-text-3); font-size: 12px; }
.app-detail-value.is-unfilled { color: var(--color-text-3); }

.detail-field-table { display: flex; flex-direction: column; border: 1px solid var(--app-divider); border-radius: 2px; }
.detail-field-row { display: grid; grid-template-columns: 56px minmax(0, 1fr) 96px 96px 200px; align-items: center; gap: 12px; padding: 10px 12px; color: var(--color-text-1); font-size: 14px; line-height: 22px; }
.detail-field-row + .detail-field-row { border-top: 1px solid var(--app-divider); }
.detail-field-head { color: var(--color-text-2); background: var(--app-table-header); font-size: 13px; font-weight: 600; }
.detail-field-name { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; overflow-wrap: anywhere; }
.detail-field-label { min-width: 0; overflow-wrap: anywhere; }
.detail-field-options { color: var(--color-text-2); font-size: 13px; overflow-wrap: anywhere; }
.detail-field-options.is-empty { color: var(--color-text-3); }
/* 主数据徽标：跟字段名同一行、位于名称右侧（与表单设计页 version-badge 同款底色） */
.detail-master-badge { flex: none; padding: 0 6px; border-radius: 2px; color: var(--color-text-2); background: var(--color-fill-2); font-size: 12px; line-height: 20px; white-space: nowrap; }
/* 填写明细节字段行：名称 + 字段位 + 主数据徽标同一行 baseline 对齐 */
.record-field-label { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; }
/* 主数据徽标会把单行标签撑长：整个字段列表共享第一列宽度，避免各行值列左边界参差
   （覆盖 .app-detail-row 的「每行独立 grid」为「列表级 grid」，行距/列距与全局一致） */
.record-field-list { display: grid; grid-template-columns: minmax(112px, max-content) minmax(0, 1fr); align-items: start; gap: 10px 16px; }
.record-field-list .app-detail-row { display: contents; }

@media (max-width: 720px) {
  .section-forms-heading { align-items: flex-start; flex-direction: column; }
  .section-forms-heading-actions { justify-content: flex-start; max-width: 100%; }
  .section-forms-pagination { justify-content: flex-start; }
  .pagination-total { width: 100%; margin-right: 0; }
  .detail-field-row { grid-template-columns: 48px minmax(0, 1fr); row-gap: 4px; }
  .detail-field-head { display: none; }
}
</style>

<style>
/* 抽屉：画布 Fill-1 + 白底头尾（DESIGN.md · Drawer） */
.section-form-drawer .arco-drawer,
.section-record-drawer .arco-drawer { background: var(--mt-fill-1); }
.section-form-drawer .arco-drawer-header,
.section-record-drawer .arco-drawer-header { height: 56px; background: var(--app-surface); }
.section-form-drawer .arco-drawer-title,
.section-record-drawer .arco-drawer-title { font-size: 16px; font-weight: 600; line-height: 24px; }
.section-form-drawer .arco-drawer-body,
.section-record-drawer .arco-drawer-body { display: flex; flex-direction: column; padding: 16px; overflow-y: auto; }
.section-form-drawer .arco-drawer-footer,
.section-record-drawer .arco-drawer-footer { background: var(--app-surface); }
</style>
