<script setup lang="ts">
/**
 * 问卷模板（列表 + 新建/编辑抽屉 + 只读详情抽屉）。
 *
 * 业务口径（2026-10-26 用户裁决；2026-10-29 状态收窄）：
 * - 模板两态：草稿（待提交）/ 已发布；状态域不再有「已停用」，停用语义由「是否启用」开关承载；
 *   仅「已发布且启用」可被新建问卷选用。
 * - 编辑已发布模板保存后内部自动升小版本，历史问卷绑定创建时冻结的题目快照；
 *   版本号不在本模块界面展示（2026-11-04 用户裁决：去掉版本号字段，仅保留内部字段供问卷快照冻结）。
 * - 删除为硬删除：存在进行中（未归档）问卷引用时禁止删除，历史快照保留。
 * - 使用次数点击 → 任务管理按该模板筛选。
 * - 新建/复制抽屉（2026-10-29 用户裁决）：底栏为 取消 / 保存草稿 / 提交问题库；
 *   提交即创建并立即发布（状态置「已发布」，保存前仅做名称/题干基础校验）；编辑抽屉维持 取消 / 保存。
 * - 表单不再展示判定规则字段与实时覆盖度统计（2026-10-29 用户裁决）：
 *   问题库解绑判定规则，仅问题信息的增删改查；题号即题目唯一标识（2026-11-01 起 Q01 口径下线）。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { Message, type TableColumnData } from '@arco-design/web-vue';
import {
  IconArrowDown, IconArrowUp, IconDelete, IconDownload, IconExclamationCircle, IconFilter, IconFolder, IconLeft, IconMore, IconPlus, IconRefresh, IconRight, IconSearch, IconSettings, IconUpload,
} from '@arco-design/web-vue/es/icon';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useTaskCenterStore } from '../../task-center/stores/taskCenter';
import ColumnSettingsPopover, { type ColumnSettingsItem } from '../../../shared/components/ColumnSettingsPopover.vue';
import { QUESTION_BANK } from '../../surveys/data/questions';
import { MOCK_CURRENT_USER, mergeLocalSurveyDrafts } from '../../surveys/data/surveys';
import { loadLocalSurveyDrafts } from '../../surveys/data/drafts';
import {
  TEMPLATE_STATUSES, createTemplate, deleteTemplate, importTemplateDrafts,
  isTemplateEnabled, publishTemplate, renumberQuestions, setTemplateEnabled, surveyTemplates,
  templateUsage, updateTemplate,
  type SurveyTemplate, type TemplateInput, type TemplateQuestion, type TemplateStatus,
} from '../data/templates';
import type { WorkbookLabels } from '../data/workbook';
import { fieldLabel } from '../../../shared/fieldLabel';

const { t } = useI18n({ useScope: 'global' });
const router = useRouter();
const OPERATOR = MOCK_CURRENT_USER.name;

/* ------------------------------------------------------------------ 筛选（草稿 → 应用） */

const FILTER_KEYS = ['keyword', 'status', 'enabled', 'creator', 'createdAt', 'updatedAt'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

interface TemplateFilters {
  keyword: string;
  status: TemplateStatus[];
  /** 是否启用（'yes' | 'no' | ''，空 = 不限；默认隐藏，筛选设置可开） */
  enabled: string;
  creator: string;
  /** 日期区间 [起, 止]，YYYY-MM-DD；空串表示该端不限 */
  createdAt: string[];
  updatedAt: string[];
}

const defaultFilters = (): TemplateFilters => ({
  keyword: '', status: [], enabled: '', creator: '', createdAt: [], updatedAt: [],
});

const draft = reactive<TemplateFilters>(defaultFilters());
const applied = reactive<TemplateFilters>(defaultFilters());

/** 关键词、状态、创建时间常显；更新时间（最近更新时间）、是否启用、创建人默认收起（筛选设置可开，2026-10-30 用户裁决） */
const DEFAULT_VISIBLE_FILTERS: FilterKey[] = ['keyword', 'status', 'createdAt'];

const creatorOptions = computed(() => [...new Set(surveyTemplates.map((item) => item.creator).filter(Boolean))]
  .sort((left, right) => left.localeCompare(right))
  .map((name) => ({ value: name, label: name })));

const statusOptions = computed(() => TEMPLATE_STATUSES.map((status) => ({ value: status, label: t(`templates.statuses.${status}`) })));

/** 是否启用筛选：是 / 否（空 = 不限） */
const enabledOptions = computed(() => [
  { value: 'yes', label: t('templates.filters.enabledYes') },
  { value: 'no', label: t('templates.filters.enabledNo') },
]);

const statusModel = computed({
  get: () => draft.status,
  set: (value: TemplateStatus[] | undefined) => { draft.status = Array.isArray(value) ? value : []; },
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

function filterLabel(key: FilterKey) { return t(`templates.filters.${key}`); }

/* 2026-10-27 用户裁决：取消「已应用条件标签 + 清空条件」区域，条件一律回显在筛选控件里；
   这里只保留“是否有已应用条件”的判定，供空态文案与空态重置按钮使用 */
const hasAppliedFilters = computed(() =>
  Boolean(applied.keyword.trim() || applied.status.length || applied.enabled || applied.creator)
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

/* ------------------------------------------------------------------ 使用次数与列表数据 */

const usage = computed(() => templateUsage());

/**
 * 判断指引行渲染（2026-10-27 用户裁决，第二轮修正）：
 * 不添加任何数字序号。「【…】」来源/段头行（如【GB 44464 附录A 表A.1…】、【典型场景】）
 * 独占一行、作小标题展示；其余内容严格按录入原文（PDF 原文）逐行换行显示，
 * 「- / · / •」起头的行按无序列表渲染「·」。若【…】与内容挤在同一行（如 Q7 的
 * 「【典型场景】人脸识别解锁/支付…」），拆成「标题行 + 内容行」两条，保证来源行独占一行。
 */
const GUIDE_BULLET_RE = /^[-•·●*]\s*/;
const GUIDE_HEADER_RE = /^【[^】]*】/;
type GuideItem = { kind: 'header' | 'bullet' | 'line'; marker: string; text: string };
function guideItems(guide: string): GuideItem[] {
  const items: GuideItem[] = [];
  const pushLine = (line: string): void => {
    const bullet = GUIDE_BULLET_RE.exec(line);
    if (bullet) items.push({ kind: 'bullet', marker: '·', text: line.slice(bullet[0].length).trim() });
    else items.push({ kind: 'line', marker: '', text: line });
  };
  guide.split('\n').map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const header = GUIDE_HEADER_RE.exec(line);
    if (!header) {
      pushLine(line);
      return;
    }
    items.push({ kind: 'header', marker: '', text: header[0] });
    const rest = line.slice(header[0].length).trim();
    if (rest) pushLine(rest);
  });
  return items;
}

const rows = computed(() => surveyTemplates.filter((template) => {
  const keyword = applied.keyword.trim().toLowerCase();
  if (keyword && !`${template.name} ${template.id}`.toLowerCase().includes(keyword)) return false;
  if (applied.status.length && !applied.status.includes(template.status)) return false;
  if (applied.enabled === 'yes' && !isTemplateEnabled(template)) return false;
  if (applied.enabled === 'no' && isTemplateEnabled(template)) return false;
  if (applied.creator && template.creator !== applied.creator) return false;
  const createdDay = template.createdAt.slice(0, 10);
  if (applied.createdAt[0] && createdDay < applied.createdAt[0]) return false;
  if (applied.createdAt[1] && createdDay > applied.createdAt[1]) return false;
  const updatedDay = template.updatedAt.slice(0, 10);
  if (applied.updatedAt[0] && updatedDay < applied.updatedAt[0]) return false;
  if (applied.updatedAt[1] && updatedDay > applied.updatedAt[1]) return false;
  return true;
}));

/* ------------------------------------------------------------------ 数量治理软提示 */

/**
 * 已发布问题库过多时，覆盖度口径会被切碎、同类问题库难以横向比较。
 * 判定规则去版本化（2026-10-27 裁决）后只有一个现行规则集，直接按已发布总数计数。
 * 这里只做**软提示**（不参与保存校验、不阻断任何操作），阈值取 5。
 */
const CROWDED_PUBLISHED_LIMIT = 5;
const crowdedCount = computed(() => surveyTemplates.filter((item) => item.status === 'published').length);
const crowdedHint = computed(() =>
  (crowdedCount.value > CROWDED_PUBLISHED_LIMIT ? t('templates.listHint.crowdedRule', { count: crowdedCount.value }) : ''));

/* ------------------------------------------------------------------ 分页 */

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

/* ------------------------------------------------------------------ Excel 导出 / 导入（确认弹窗 + 抽屉 + 任务中心） */

const exporting = ref(false);
const exportOpen = ref(false);
const importOpen = ref(false);
const importing = ref(false);
const importInput = ref<HTMLInputElement | null>(null);
const importFileName = ref('');
const importError = ref('');
const importPreview = ref<TemplateInput[]>([]);
const templateBlob = ref<Blob | null>(null);
const preparingTemplate = ref(false);
let templateDownload: ((blob: Blob, filename: string) => void) | undefined;

/** 任务中心记录使用固定 YYYY-MM-DD HH:mm:ss 文本，与功能台账同一口径 */
function clockText(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}
function stampText(date: Date, kind: 'date' | 'datetime'): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
  return kind === 'date' ? day : `${day}${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function workbookLabels(columns: Pick<typeof import('../data/workbook'), 'LIBRARY_COLUMNS' | 'QUESTION_COLUMNS'>): WorkbookLabels {
  return {
    libraries: t('templates.workbook.libraries'),
    questions: t('templates.workbook.questions'),
    libraryHeaders: columns.LIBRARY_COLUMNS.map((key) => t(`templates.workbook.columns.${key}`)),
    questionHeaders: columns.QUESTION_COLUMNS.map((key) => t(`templates.workbook.columns.${key}`)),
  };
}

/* 导出与功能台账同一链路：确认弹窗 → 任务中心「下载任务」（DESIGN.md · Batch export baseline） */
function requestExport() {
  if (exporting.value) return;
  if (!rows.value.length) { Message.info(t('templates.export.empty')); return; }
  exportOpen.value = true;
}
async function confirmExport() {
  if (exporting.value || !rows.value.length) return;
  exporting.value = true;
  try {
    const workbook = await import('../data/workbook');
    const blob = await workbook.buildWorkbook(rows.value, workbookLabels(workbook));
    const now = new Date();
    const taskCenter = useTaskCenterStore();
    taskCenter.addDownloadTask({
      id: `dl-${now.getTime()}`, module: 'templates',
      fileStamp: stampText(now, 'datetime'),
      operator: OPERATOR, time: clockText(now),
      status: 'processing', progress: 92,
      fileUrl: URL.createObjectURL(blob),
      fileName: `问题库_${now.toISOString().slice(0, 10)}.xlsx`,
    });
    exportOpen.value = false;
    Message.success(t('templates.exportNotice.created'));
    taskCenter.open('download');
  } catch { Message.error(t('templates.export.failed')); }
  finally { exporting.value = false; }
}

/* 导入抽屉（DESIGN.md · Batch import baseline）：打开即预生成模版，可点击或拖拽上传 */
function closeImport() {
  importOpen.value = false;
  importFileName.value = '';
  importPreview.value = [];
  importError.value = '';
  if (importInput.value) importInput.value.value = '';
}

function openImport() {
  closeImport();
  importOpen.value = true;
  if (!templateBlob.value) void prepareTemplate();
}
async function prepareTemplate() {
  if (preparingTemplate.value) return;
  preparingTemplate.value = true;
  try {
    const workbook = await import('../data/workbook');
    templateBlob.value = await workbook.buildWorkbook([], workbookLabels(workbook));
    templateDownload = workbook.downloadWorkbook;
  } catch { Message.error(t('templates.import.templateError')); }
  finally { preparingTemplate.value = false; }
}
function downloadTemplate() {
  if (!templateBlob.value || !templateDownload) { void prepareTemplate(); return; }
  try {
    templateDownload(templateBlob.value, '问题库导入模版.xlsx');
  } catch { Message.error(t('templates.import.templateError')); }
}

async function ingestFile(file: File | undefined) {
  importPreview.value = [];
  importError.value = '';
  importFileName.value = file?.name ?? '';
  if (!file || importing.value) return;
  importing.value = true;
  let workbook: typeof import('../data/workbook') | undefined;
  try {
    workbook = await import('../data/workbook');
    importPreview.value = await workbook.parseWorkbook(file);
  } catch (error) {
    importError.value = workbook && error instanceof workbook.WorkbookImportError
      ? t(`templates.import.errors.${error.code}`, { sheet: t(`templates.workbook.${error.sheet}`), row: error.row })
      : t('templates.import.errors.invalidFile');
  } finally { importing.value = false; }
}
function selectImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  void ingestFile(file);
}
function onDropFile(event: DragEvent) {
  if (importing.value) return;
  void ingestFile(event.dataTransfer?.files?.[0]);
}
const importNotes = computed(() => [1, 2, 3, 4, 5].map((index) => t(`templates.import.note${index}`)));

/* 提交 → 任务中心「导入任务」（DESIGN.md · Batch import handoff）：解析失败整文件拦截，成功后打开导入任务页 */
function confirmImport() {
  if (importing.value || !importPreview.value.length) return;
  importing.value = true;
  try {
    const count = importTemplateDrafts(importPreview.value, OPERATOR).length;
    const now = new Date();
    const taskCenter = useTaskCenterStore();
    taskCenter.addImportTask({
      id: `imp-${now.getTime()}`, module: 'templates',
      fileStamp: stampText(now, 'date'),
      operator: OPERATOR, time: clockText(now),
      status: 'processing', progress: 92,
      total: count, ok: count, fail: 0,
    });
    closeImport();
    setPage(1);
    Message.success(t('templates.import.submitted'));
    taskCenter.open('import');
  } catch { importError.value = t('templates.messages.storageError'); }
  finally { importing.value = false; }
}

/* ------------------------------------------------------------------ 列设置 */

type ColumnKey = 'templateNo' | 'name' | 'status' | 'enabled' | 'questionCount' | 'useCount' | 'creator' | 'createdAt' | 'updater' | 'updatedAt' | 'note';
/** 列顺序（2026-10-29 用户裁决）：「是否启用」位于「最近更新时间」右侧；版本号列已下线（2026-11-04 用户裁决） */
const COLUMN_KEYS: ColumnKey[] = ['templateNo', 'name', 'status', 'questionCount', 'useCount', 'creator', 'createdAt', 'updater', 'updatedAt', 'enabled', 'note'];
/** 默认可见列（2026-10-29 问题库解绑：判定规则/覆盖度列随绑定一并下线）；更新人 / 最近更新时间默认隐藏（2026-10-30 用户裁决） */
const DEFAULT_VISIBLE: ColumnKey[] = ['templateNo', 'name', 'status', 'questionCount', 'useCount', 'creator', 'createdAt', 'enabled'];

const defaultColumns: ColumnSettingsItem[] = COLUMN_KEYS.map((key) => ({
  key, label: key, visible: DEFAULT_VISIBLE.includes(key), disabled: key === 'templateNo',
}));
const columns = ref<ColumnSettingsItem[]>(defaultColumns.map((item) => ({ ...item })));
const columnSettingsOpen = ref(false);
const localizedColumns = computed(() => columns.value.map((item) => ({ ...item, label: t(`templates.fields.${item.key}`) })));
const localizedDefaultColumns = computed(() => defaultColumns.map((item) => ({ ...item, label: t(`templates.fields.${item.key}`) })));

const columnWidths: Record<ColumnKey, number> = {
  templateNo: 180, name: 240, status: 110, enabled: 100, questionCount: 100, useCount: 100,
  creator: 110, createdAt: 170, updater: 110, updatedAt: 170, note: 220,
};

const tableColumns = computed<TableColumnData[]>(() => {
  const dataColumns = columns.value.filter((item) => item.visible).map((item): TableColumnData => ({
    title: t(`templates.fields.${item.key}`),
    dataIndex: item.key,
    slotName: item.key,
    width: columnWidths[item.key as ColumnKey],
    align: 'left',
  }));
  return [...dataColumns, { title: t('templates.fields.actions'), dataIndex: 'actions', slotName: 'actions', width: 170, align: 'left', fixed: 'right' }];
});

const horizontalWidth = computed(() => tableColumns.value.reduce((total, column) => total + Number(column.width ?? 140), 0));

function onColumnsChanged(next: ColumnSettingsItem[]) {
  columns.value = next.map((item) => ({ key: item.key, label: item.key, visible: item.visible, disabled: item.key === 'templateNo' }));
}

/* ------------------------------------------------------------------ 抽屉（新建 / 编辑 / 预览） */

type DrawerMode = 'create' | 'copy' | 'edit' | 'preview';
const drawerMode = ref<DrawerMode | null>(null);
const activeId = ref('');
const form = reactive<{ name: string; note: string; questions: TemplateQuestion[] }>({
  name: '', note: '', questions: [],
});
const saving = ref(false);

const activeTemplate = computed(() => surveyTemplates.find((item) => item.id === activeId.value) ?? null);

/**
 * 判定规则（2026-10-29 用户裁决：问题库解绑判定规则）：抽屉不再涉及规则字段，
 * 问题库仅问题信息的增删改查；条款与问题的映射关系由「条款规则」维护。
 */

const drawerTitle = computed(() => t(`templates.drawer.${drawerMode.value ?? 'create'}`));

function resetForm(template?: SurveyTemplate) {
  form.name = template?.name ?? '';
  form.note = template?.note ?? '';
  form.questions = template
    ? template.questions.map((question) => ({ ...question }))
    : [{ code: 'Q1', title: '', guide: '' }];
}

function openCreate() {
  activeId.value = '';
  resetForm();
  drawerMode.value = 'create';
}

function openEdit(template: SurveyTemplate) {
  activeId.value = template.id;
  resetForm(template);
  drawerMode.value = 'edit';
}

/**
 * 详情 = 只读抽屉（2026-10-29 用户裁决：纯只读——不跑检查、不显示检查结果条、
 * 不显示条款关联数与检查按钮；2026-10-30 用户裁决：动作与抽屉标题由「预览」改为「详情」）；
 * 表单与详情解耦，打开时仅重置避免残留上次编辑内容。
 */
function openPreview(template: SurveyTemplate) {
  activeId.value = template.id;
  resetForm();
  drawerMode.value = 'preview';
}

function closeDrawer() {
  drawerMode.value = null;
  activeId.value = '';
}

/**
 * 添加题目（2026-10-28 收口）：题目内容完全手动维护，题号按行序自动生成；
 * 题号不在题库内的题为自建题（附加说明），可通过声明命中条款参与判定（2026-11-01 题号口径）。
 */
const BANK_CODES = new Set(QUESTION_BANK.map((question) => question.code));
function isBankQuestion(code: string): boolean {
  return BANK_CODES.has(code);
}

function addQuestion() {
  form.questions.push({ code: `Q${form.questions.length + 1}`, title: '', guide: '' });
}

function removeQuestion(index: number) {
  form.questions.splice(index, 1);
  form.questions = renumberQuestions(form.questions);
}

function moveQuestion(index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= form.questions.length) return;
  const [moved] = form.questions.splice(index, 1);
  form.questions.splice(target, 0, moved);
  form.questions = renumberQuestions(form.questions);
}

function inputOfForm(): TemplateInput {
  return { name: form.name, note: form.note, questions: form.questions };
}

/** 抽屉保存前的基础校验（保存草稿 / 提交问题库 / 编辑保存共用） */
function validateForm(): boolean {
  if (!form.name.trim()) { Message.error(t('templates.issues.nameRequired')); return false; }
  if (!form.questions.length || form.questions.some((question) => !question.title.trim())) {
    Message.error(t('templates.issues.titleRequiredAll'));
    return false;
  }
  return true;
}

/** 保存（编辑抽屉）：草稿原地更新；已发布更新后自动升小版本 */
async function save() {
  if (saving.value) return;
  if (!validateForm()) return;
  saving.value = true;
  try {
    if (drawerMode.value === 'create' || drawerMode.value === 'copy') {
      const created = createTemplate(inputOfForm(), OPERATOR);
      Message.success(drawerMode.value === 'copy'
        ? t('templates.messages.copied', { no: created.id })
        : t('templates.messages.created', { no: created.id }));
    } else if (drawerMode.value === 'edit' && activeTemplate.value) {
      // 版本号不再对外展示（2026-11-04 用户裁决）：保存即保存，不做升版提示
      updateTemplate(activeTemplate.value.id, inputOfForm(), OPERATOR);
      Message.success(t('templates.messages.updated'));
    }
    closeDrawer();
  } catch {
    Message.error(t('templates.messages.storageError'));
  } finally {
    saving.value = false;
  }
}

/**
 * 提交问题库（新建/复制抽屉，2026-10-29 用户裁决）：提交即发布——
 * 创建后立即发布，状态置为「已发布」；保存前仅做名称/题干基础校验。
 */
async function submitTemplate() {
  if (saving.value) return;
  if (!validateForm()) return;
  saving.value = true;
  try {
    const created = createTemplate(inputOfForm(), OPERATOR);
    publishTemplate(created.id, OPERATOR);
    Message.success(t('templates.messages.submitted', { no: created.id }));
    closeDrawer();
  } catch {
    Message.error(t('templates.messages.storageError'));
  } finally {
    saving.value = false;
  }
}

/* ------------------------------------------------------------------ 行内动作 */

function openUsage(template: SurveyTemplate) {
  // 2026-11-03 用户裁决：任务管理筛选设置下线「问卷模板」条件——「使用次数」跳转不再携带模板筛选，
  // 落到任务管理全量列表（任务名称含模板名的记录仍可经「任务搜索」找到）
  void router.push({ name: 'surveys' });
  void template.id;
}

/** 复制 = 抽屉预填源模板信息（2026-10-26 用户裁决），保存后生成新草稿（编号重新生成） */
function openCopy(template: SurveyTemplate) {
  activeId.value = '';
  resetForm(template);
  drawerMode.value = 'copy';
}

/** 发布：二次确认 */
const publishTarget = ref<SurveyTemplate | null>(null);
function requestPublish(template: SurveyTemplate) {
  publishTarget.value = template;
}
function confirmPublish() {
  if (!publishTarget.value) return;
  publishTemplate(publishTarget.value.id, OPERATOR);
  publishTarget.value = null;
  Message.success(t('templates.messages.published'));
}

/** 删除：弹窗内展示引用情况；存在进行中问卷时确认按钮禁用（硬删除 + 快照留档） */
const deleteTarget = ref<SurveyTemplate | null>(null);
const deleteBusy = ref(false);
const deleteUsage = computed(() => (deleteTarget.value ? usage.value[deleteTarget.value.id] ?? { total: 0, inProgress: 0 } : { total: 0, inProgress: 0 }));

async function performDelete() {
  if (!deleteTarget.value || deleteBusy.value || deleteUsage.value.inProgress > 0) return;
  deleteBusy.value = true;
  try {
    deleteTemplate(deleteTarget.value.id);
    deleteTarget.value = null;
    setPage(1);
    Message.success(t('templates.messages.deleted'));
  } catch (error) {
    Message.error(error instanceof Error && error.message === 'TEMPLATE_IN_USE'
      ? t('templates.messages.deleteBlocked') : t('templates.messages.storageError'));
  } finally {
    deleteBusy.value = false;
  }
}

type RowActionKey = 'preview' | 'edit' | 'copy' | 'publish' | 'delete';
interface RowAction { key: RowActionKey; label: string; danger?: boolean; run: (template: SurveyTemplate) => void }

/**
 * 行内动作（2026-10-29 用户裁决）：待提交 = 预览、发布、编辑、复制、删除；
 * 已发布 = 预览、编辑、复制、删除。前两个直显，其余收进「…」；
 * 停用/启用由「是否启用」开关列承载，不再作为行内动作。
 */
function rowActions(template: SurveyTemplate): RowAction[] {
  const actions: RowAction[] = [{ key: 'preview', label: t('templates.actions.preview'), run: openPreview }];
  if (template.status === 'draft') actions.push({ key: 'publish', label: t('templates.actions.publish'), run: requestPublish });
  actions.push({ key: 'edit', label: t('templates.actions.edit'), run: openEdit });
  actions.push({ key: 'copy', label: t('templates.actions.copy'), run: openCopy });
  actions.push({ key: 'delete', label: t('templates.actions.delete'), danger: true, run: (row: SurveyTemplate) => { deleteTarget.value = row; } });
  return actions;
}

const PRIMARY_ACTION_COUNT = 2;
const primaryRowActions = (template: SurveyTemplate) => rowActions(template).slice(0, PRIMARY_ACTION_COUNT);
const moreRowActions = (template: SurveyTemplate) => rowActions(template).slice(PRIMARY_ACTION_COUNT);

/**
 * 「是否启用」开关（2026-10-29 用户裁决）：直接切换留操作痕迹（updater/updatedAt），
 * 不弹原因框、不改「待提交/已发布」状态（与功能台账同口径）。
 */
function toggleEnabled(template: SurveyTemplate, value: unknown) {
  const enabled = Boolean(value);
  if (isTemplateEnabled(template) === enabled) return;
  setTemplateEnabled(template.id, enabled, OPERATOR);
  Message.success(t(enabled ? 'templates.messages.enabled' : 'templates.messages.disabled'));
}

/**
 * 详情抽屉底部操作：随模板状态显示可执行的动作（2026-10-26 用户裁决）。
 * draft → 发布；均附编辑 / 复制 / 删除；关闭恒显（停用/启用由列表开关承载）。
 */
interface PreviewAction { key: RowActionKey; label: string; type?: 'primary'; danger?: boolean; run: (template: SurveyTemplate) => void }
const previewActions = computed<PreviewAction[]>(() => {
  const template = activeTemplate.value;
  if (!template) return [];
  const actions: PreviewAction[] = [
    { key: 'delete', label: t('templates.actions.delete'), danger: true, run: (row) => { deleteTarget.value = row; } },
    { key: 'copy', label: t('templates.actions.copy'), run: openCopy },
    { key: 'edit', label: t('templates.actions.edit'), run: openEdit },
  ];
  if (template.status === 'draft') {
    actions.push({ key: 'publish', label: t('templates.actions.publish'), type: 'primary', run: requestPublish });
  }
  return actions;
});

/** 预览题目答案：统一单选「是 / 否 / 待定」，仅展示不可选择 */
const answerOptions = computed(() => [
  { label: t('templates.preview.yes'), value: 'yes' },
  { label: t('templates.preview.no'), value: 'no' },
  { label: t('templates.preview.unsure'), value: 'unsure' },
]);

/* ------------------------------------------------------------------ 其他 */

function statusColor(status: TemplateStatus): string {
  return status === 'published' ? 'green' : 'gray';
}

const loading = ref(true);
onMounted(async () => {
  // 使用次数依赖问卷记录：进入本页先把浏览器库里的问卷草稿合并进内存数据源，
  // 否则刚创建（仅存在于 IndexedDB）的问卷不会计入使用次数。
  try { mergeLocalSurveyDrafts(await loadLocalSurveyDrafts()); }
  catch { Message.error(t('templates.messages.storageError')); }
  finally { loading.value = false; }
});
</script>

<template>
  <main class="templates-page">
    <!-- 筛选卡：草稿条件 → 查询应用；重置恢复默认 -->
    <div class="templates-filterbar">
      <form class="templates-query" @submit.prevent="applyFilters">
        <label v-for="key in visibleFilterKeys" :key="key" class="filter-field" :class="{ 'filter-field--range': isRangeKey(key) }">
          <span>{{ filterLabel(key) }}</span>
          <a-input v-if="key === 'keyword'" v-model="draft.keyword" class="app-filter-control" allow-clear :placeholder="t('templates.filters.keywordPlaceholder')" />
          <a-select v-else-if="key === 'status'" v-model="statusModel" class="app-filter-control" multiple allow-clear :max-tag-count="1" :placeholder="t('templates.filters.all')" :options="statusOptions" />
          <a-select v-else-if="key === 'enabled'" v-model="draft.enabled" class="app-filter-control" allow-clear :placeholder="t('templates.filters.all')" :options="enabledOptions" />
          <a-select v-else-if="key === 'creator'" v-model="draft.creator" class="app-filter-control" allow-clear :placeholder="t('templates.filters.all')" :options="creatorOptions" />
          <a-range-picker
            v-else-if="key === 'createdAt'"
            v-model="createdRangeModel"
            class="app-filter-control"
            value-format="YYYY-MM-DD"
            allow-clear
            :placeholder="[t('templates.filters.from'), t('templates.filters.to')]"
          />
          <a-range-picker
            v-else
            v-model="updatedRangeModel"
            class="app-filter-control"
            value-format="YYYY-MM-DD"
            allow-clear
            :placeholder="[t('templates.filters.from'), t('templates.filters.to')]"
          />
        </label>
        <div class="templates-query-actions">
          <a-button type="primary" html-type="submit"><template #icon><IconSearch /></template>{{ t('templates.filters.search') }}</a-button>
          <a-button class="app-btn-neutral" html-type="button" @click="resetFilters"><template #icon><IconRefresh /></template>{{ t('templates.filters.reset') }}</a-button>
          <ColumnSettingsPopover
            v-model:visible="filterSettingsOpen"
            :items="filterSettingsItems"
            :default-items="defaultFilterItems"
            :title="t('templates.filters.settings')"
            :list-aria-label="t('templates.filters.list')"
            :show-label="t('templates.columns.show')"
            :restore-label="t('templates.columns.restore')"
            @change="onFilterSettingsChanged"
          >
            <a-tooltip :content="t('templates.filters.settings')">
              <a-button class="app-btn-neutral icon-button" html-type="button" :aria-label="t('templates.filters.settings')" @click="filterSettingsOpen = true"><IconFilter /></a-button>
            </a-tooltip>
          </ColumnSettingsPopover>
        </div>
      </form>
    </div>

    <!-- 列表卡：标题行 + 列设置 + 表格 + 分页 -->
    <section class="templates-panel" :aria-label="t('templates.listTitle')">
      <div class="templates-heading">
        <div class="templates-heading-left">
          <h2 class="templates-heading-title">{{ t('templates.listTitle') }}</h2>
          <span class="templates-heading-count">{{ t('templates.listCount', { count: rows.length }) }}</span>
          <span v-if="crowdedHint" class="templates-heading-hint">
            <IconExclamationCircle />
            {{ crowdedHint }}
          </span>
        </div>
        <div class="templates-heading-actions">
          <a-button class="app-btn-neutral" @click="requestExport"><template #icon><IconDownload /></template>{{ t('templates.actions.export') }}</a-button>
          <a-button class="app-btn-neutral" @click="openImport"><template #icon><IconUpload /></template>{{ t('templates.actions.import') }}</a-button>
          <a-button type="primary" @click="openCreate"><template #icon><IconPlus /></template>{{ t('templates.actions.create') }}</a-button>
          <ColumnSettingsPopover
            v-model:visible="columnSettingsOpen"
            :items="localizedColumns"
            :default-items="localizedDefaultColumns"
            :title="t('templates.columns.settings')"
            :list-aria-label="t('templates.columns.list')"
            :show-label="t('templates.columns.show')"
            :restore-label="t('templates.columns.restore')"
            @change="onColumnsChanged"
          >
            <a-button
              class="app-btn-neutral column-settings-trigger"
              :aria-label="t('templates.columns.settings')"
              :title="t('templates.columns.settings')"
              @click="columnSettingsOpen = true"
            ><IconSettings /></a-button>
          </ColumnSettingsPopover>
        </div>
      </div>

      <a-table
        :columns="tableColumns"
        :data="pagedRows"
        :loading="loading"
        :pagination="false"
        :bordered="false"
        :stripe="false"
        :scroll="{ x: horizontalWidth }"
        row-key="id"
      >
        <template #templateNo="{ record }">
          <a-tooltip position="top" :content="record.id">
            <button
              class="table-link template-no"
              type="button"
              :aria-label="t('templates.actions.openPreview', { no: record.id })"
              @click="openPreview(record)"
            >{{ record.id }}</button>
          </a-tooltip>
        </template>
        <template #name="{ record }">{{ record.name }}</template>
        <template #status="{ record }">
          <a-tag :color="statusColor(record.status)" size="small">{{ t(`templates.statuses.${record.status}`) }}</a-tag>
        </template>
        <template #questionCount="{ record }"><span class="tabular">{{ record.questions.length }}</span></template>
        <template #useCount="{ record }">
          <button
            class="table-link"
            type="button"
            :aria-label="t('templates.actions.openUsage', { no: record.id })"
            :title="t('templates.labels.usageHint')"
            @click="openUsage(record)"
          >{{ usage[record.id]?.total ?? 0 }}</button>
        </template>
        <template #creator="{ record }">{{ record.creator }}</template>
        <template #createdAt="{ record }"><span class="tabular">{{ record.createdAt }}</span></template>
        <template #updater="{ record }">{{ record.updater }}</template>
        <template #updatedAt="{ record }"><span class="tabular">{{ record.updatedAt }}</span></template>
        <template #note="{ record }"><span class="template-note-cell">{{ record.note || '—' }}</span></template>
        <template #enabled="{ record }">
          <a-switch
            :model-value="isTemplateEnabled(record)"
            :aria-label="t('templates.fields.enabled')"
            @change="toggleEnabled(record, $event)"
          />
        </template>
        <template #actions="{ record }">
          <div class="table-actions">
            <a-link v-for="action in primaryRowActions(record)" :key="action.key" @click="action.run(record)">{{ action.label }}</a-link>
            <a-dropdown v-if="moreRowActions(record).length" trigger="hover" position="br" popup-container="body" content-class="row-more-dropdown">
              <a-button class="row-more-trigger" size="mini" :aria-label="t('templates.actions.more')" :title="t('templates.actions.more')">
                <template #icon><IconMore /></template>
              </a-button>
              <template #content>
                <a-doption v-for="action in moreRowActions(record)" :key="action.key" :class="{ 'row-more-danger': action.danger }" @click="action.run(record)">{{ action.label }}</a-doption>
              </template>
            </a-dropdown>
          </div>
        </template>
        <template #empty>
          <div class="templates-empty">
            <a-empty :description="hasAppliedFilters ? t('templates.empty.noMatch') : t('templates.empty.noData')" />
            <a-button v-if="hasAppliedFilters" class="app-btn-neutral" @click="resetFilters">{{ t('templates.filters.reset') }}</a-button>
          </div>
        </template>
      </a-table>

      <nav class="templates-pagination app-pagination" :aria-label="t('templates.pagination.navigation')">
        <span class="pagination-total">{{ t('templates.pagination.total', { count: rows.length }) }}</span>
        <div class="pagination-pages">
          <a-select class="app-page-size" :model-value="pageSize" :aria-label="t('templates.pagination.pageSizeAria')" @update:model-value="handlePageSizeChange">
            <a-option v-for="size in [10, 20, 50, 100, 200]" :key="size" :value="size">{{ t('templates.pagination.perPage', { count: size }) }}</a-option>
          </a-select>
          <button class="pagination-arrow" type="button" :disabled="page === 1" :aria-label="t('templates.pagination.previous')" @click="setPage(page - 1)"><IconLeft /></button>
          <button
            v-for="number in pageNumbers"
            :key="number"
            class="pagination-number"
            :class="{ active: page === number }"
            type="button"
            :aria-current="page === number ? 'page' : undefined"
            @click="setPage(number)"
          >{{ number }}</button>
          <button class="pagination-arrow" type="button" :disabled="page === totalPages" :aria-label="t('templates.pagination.next')" @click="setPage(page + 1)"><IconRight /></button>
        </div>
        <span class="pagination-jump-label">{{ t('templates.pagination.jumpTo') }}</span>
        <a-input-number v-model="jumpPage" class="app-page-jump" :min="1" :max="totalPages" hide-button @press-enter="setPage(Number(jumpPage))" />
        <span class="pagination-total-pages">{{ t('templates.pagination.totalPages', { count: totalPages }) }}</span>
      </nav>

    </section>

    <!-- 新建 / 编辑 / 详情（同一抽屉承载；详情为只读） -->
    <a-drawer
      class="ledger-drawer"
      :visible="Boolean(drawerMode)"
      width="min(800px, 100vw)"
      :mask-closable="drawerMode === 'preview'"
      :title="drawerTitle"
      :footer="Boolean(drawerMode)"
      @cancel="closeDrawer"
    >
      <template #footer>
        <!-- 底部操作栏：随抽屉整宽、底部置顶（DESIGN.md Drawer：固定底部，取消+确定右对齐） -->
        <div v-if="drawerMode === 'preview' && activeTemplate" class="drawer-footer">
          <a-button class="app-btn-neutral" @click="closeDrawer">{{ t('templates.actions.close') }}</a-button>
          <a-button
            v-for="action in previewActions"
            :key="action.key"
            :type="action.type"
            :status="action.danger ? 'danger' : undefined"
            :class="!action.type && !action.danger ? 'app-btn-neutral' : undefined"
            @click="action.run(activeTemplate)"
          >{{ action.label }}</a-button>
        </div>
        <!-- 编辑抽屉：维持 取消 / 保存（已发布保存后自动升版，「提交」语义不适用） -->
        <div v-else-if="drawerMode === 'edit'" class="drawer-footer">
          <a-button class="app-btn-neutral" @click="closeDrawer">{{ t('templates.actions.cancel') }}</a-button>
          <a-button type="primary" :loading="saving" @click="save">{{ t('templates.actions.save') }}</a-button>
        </div>
        <!-- 新建 / 复制抽屉（2026-10-29 用户裁决）：取消 / 保存草稿 / 提交问题库；提交即发布 -->
        <div v-else-if="drawerMode" class="drawer-footer">
          <a-button class="app-btn-neutral" @click="closeDrawer">{{ t('templates.actions.cancel') }}</a-button>
          <a-button class="app-btn-neutral" :loading="saving" @click="save">{{ t('templates.actions.saveDraft') }}</a-button>
          <a-button type="primary" :loading="saving" @click="submitTemplate">{{ t('templates.actions.submit') }}</a-button>
        </div>
      </template>

      <!-- 详情：只读摘要 + 题目清单 -->
      <template v-if="drawerMode === 'preview' && activeTemplate">
        <div class="ledger-drawer-group">
          <h2 class="drawer-section-heading">{{ t('templates.drawer.basics') }}</h2>
          <dl class="template-facts">
            <dt>{{ t('templates.fields.templateNo') }}</dt><dd class="tabular">{{ activeTemplate.id }}</dd>
            <dt>{{ t('templates.fields.name') }}</dt><dd>{{ activeTemplate.name }}</dd>
            <dt>{{ t('templates.fields.status') }}</dt><dd><a-tag :color="statusColor(activeTemplate.status)" size="small">{{ t(`templates.statuses.${activeTemplate.status}`) }}</a-tag></dd>
            <dt>{{ t('templates.fields.useCount') }}</dt><dd class="tabular">
              {{ usage[activeTemplate.id]?.total ?? 0 }}
              <span class="fact-meta">{{ t('templates.labels.usageDetail', { inProgress: usage[activeTemplate.id]?.inProgress ?? 0 }) }}</span>
            </dd>
            <dt>{{ t('templates.fields.creator') }}</dt><dd>{{ activeTemplate.creator }}</dd>
            <dt>{{ t('templates.fields.createdAt') }}</dt><dd class="tabular">{{ activeTemplate.createdAt }}</dd>
            <dt>{{ t('templates.fields.updatedAt') }}</dt><dd class="tabular">{{ activeTemplate.updatedAt }}</dd>
            <dt>{{ t('templates.fields.note') }}</dt><dd>{{ activeTemplate.note || '—' }}</dd>
          </dl>
        </div>

        <div class="ledger-drawer-group">
          <div class="drawer-group-head">
            <div class="drawer-group-title">
              <h2 class="drawer-section-heading">{{ t('templates.drawer.questions') }}</h2>
              <span class="question-count">{{ t('templates.preview.questionCount', { count: activeTemplate.questions.length }) }}</span>
            </div>
          </div>
          <ol class="question-preview">
            <li v-for="question in activeTemplate.questions" :key="question.code" class="question-preview-item">
              <span class="question-code tabular">{{ question.code }}</span>
              <div class="question-preview-body">
                <p class="question-title">{{ question.title }}</p>
                <div v-if="!isBankQuestion(question.code)" class="question-meta">
                  <a-tag size="small">{{ t('templates.preview.customQuestion') }}</a-tag>
                </div>
                <a-radio-group
                  class="question-answer-options"
                  :options="answerOptions"
                  :model-value="undefined"
                  disabled
                  :aria-label="`${question.code} ${t('templates.preview.answer')}`"
                />
                <div class="question-guide">
                  <span class="question-guide-label">{{ t('templates.preview.guide') }}</span>
                  <div v-if="question.guide" class="question-guide-text">
                    <p v-for="(item, index) in guideItems(question.guide)" :key="index" class="guide-line" :class="`guide-line--${item.kind}`">
                      <span v-if="item.marker" class="guide-marker">{{ item.marker }}</span>
                      <span class="guide-line-text" :class="{ 'guide-header-text': item.kind === 'header' }">{{ item.text }}</span>
                    </p>
                  </div>
                  <span v-else class="question-guide-text question-guide-text--empty">{{ t('templates.form.guideEmpty') }}</span>
                </div>
              </div>
            </li>
          </ol>
        </div>
      </template>

      <!-- 新建 / 编辑：基本信息 + 题目编排 -->
      <template v-else-if="drawerMode">
        <a-form class="template-form" :model="form" layout="vertical" @submit.prevent>
          <div class="ledger-drawer-group">
            <h2 class="drawer-section-heading">{{ t('templates.drawer.basics') }}</h2>
            <a-form-item :label="fieldLabel(t('templates.fields.name'))" required>
              <a-input v-model="form.name" :placeholder="t('templates.form.namePlaceholder')" :max-length="50" show-word-limit />
            </a-form-item>
            <a-form-item :label="fieldLabel(t('templates.fields.note'))">
              <a-textarea v-model="form.note" :max-length="200" show-word-limit :auto-size="{ minRows: 2, maxRows: 4 }" :placeholder="t('templates.form.notePlaceholder')" />
            </a-form-item>
          </div>

            <div class="ledger-drawer-group">
            <div class="drawer-group-head">
              <div class="drawer-group-title">
                <h2 class="drawer-section-heading">{{ t('templates.drawer.questions') }}</h2>
                <span class="question-count">{{ t('templates.form.questionCount', { count: form.questions.length }) }}</span>
              </div>
            </div>
            <div class="question-table" role="table" :aria-label="t('templates.drawer.questions')">
              <div class="question-row question-row--head" role="row">
                <span role="columnheader">{{ t('templates.form.code') }}</span>
                <span role="columnheader">{{ t('templates.form.title') }}</span>
                <span role="columnheader">{{ t('templates.form.guide') }}</span>
                <span role="columnheader">{{ t('templates.fields.actions') }}</span>
              </div>
              <div v-for="(question, index) in form.questions" :key="question.code" class="question-row" role="row">
                <span class="question-code tabular" role="cell">{{ question.code }}</span>
                <a-textarea v-model="question.title" class="question-input" :auto-size="{ minRows: 2, maxRows: 4 }" :placeholder="t('templates.form.titlePlaceholder')" :aria-label="`${question.code} ${t('templates.form.title')}`" />
                <a-textarea v-model="question.guide" class="question-input" :auto-size="{ minRows: 2, maxRows: 4 }" :placeholder="t('templates.form.guidePlaceholder')" :aria-label="`${question.code} ${t('templates.form.guide')}`" />
                <div class="question-row-actions" role="cell">
                  <a-tooltip :content="t('templates.form.moveUp')">
                    <a-button class="icon-action" :disabled="index === 0" :aria-label="t('templates.form.moveUp')" @click="moveQuestion(index, -1)"><template #icon><IconArrowUp /></template></a-button>
                  </a-tooltip>
                  <a-tooltip :content="t('templates.form.moveDown')">
                    <a-button class="icon-action" :disabled="index === form.questions.length - 1" :aria-label="t('templates.form.moveDown')" @click="moveQuestion(index, 1)"><template #icon><IconArrowDown /></template></a-button>
                  </a-tooltip>
                  <a-tooltip :content="t('templates.form.removeQuestion')">
                    <a-button class="icon-action" status="danger" :disabled="form.questions.length <= 1" :aria-label="t('templates.form.removeQuestion')" @click="removeQuestion(index)"><template #icon><IconDelete /></template></a-button>
                  </a-tooltip>
                </div>
              </div>
            </div>
            <div class="question-table-foot">
              <a-button class="app-btn-neutral" @click="addQuestion"><template #icon><IconPlus /></template>{{ t('templates.form.addQuestion') }}</a-button>
            </div>
          </div>
        </a-form>
      </template>
    </a-drawer>

    <!-- 批量导入抽屉（DESIGN.md · Batch import baseline）：拖拽上传区 + 注意事项同卡片，模版预生成 -->
    <a-drawer
      class="ledger-drawer"
      :visible="importOpen"
      :width="560"
      :mask-closable="!importing"
      :title="t('templates.import.title')"
      @cancel="!importing && closeImport()"
    >
      <div class="ledger-drawer-group">
        <div class="template-import-dropzone" role="button" tabindex="0" :aria-label="t('templates.import.file')" @click="importInput?.click()" @keydown.enter.prevent="importInput?.click()" @keydown.space.prevent="importInput?.click()" @dragover.prevent @drop.prevent="onDropFile">
          <IconFolder class="template-import-folder" />
          <p v-if="importFileName" class="template-import-file-name" :title="importFileName">{{ importFileName }}</p>
          <p v-else class="template-import-hint">{{ t('templates.import.uploadHint') }}</p>
          <a-button type="primary" :loading="importing" @click.stop="importInput?.click()">{{ t(importFileName ? 'templates.import.reuploadButton' : 'templates.import.uploadButton') }}</a-button>
          <input ref="importInput" type="file" accept=".xlsx" class="template-import-input" :aria-label="t('templates.import.file')" @change="selectImportFile" />
        </div>
        <p v-if="importError" class="template-import-error" role="alert">{{ importError }}</p>
        <template v-if="importPreview.length">
          <p class="template-import-count">{{ t('templates.import.preview', { count: importPreview.length }) }}</p>
          <ul class="template-import-list">
            <li v-for="(item, index) in importPreview.slice(0, 5)" :key="index">{{ item.name }} · {{ t('templates.form.questionCount', { count: item.questions.length }) }}</li>
          </ul>
          <p v-if="importPreview.length > 5" class="template-import-file">{{ t('templates.import.more', { count: importPreview.length - 5 }) }}</p>
        </template>
        <div class="template-import-notes">
          <p class="template-import-notes-title">{{ t('templates.import.notesTitle') }}</p>
          <p v-for="(note, index) in importNotes" :key="index" class="template-import-note">{{ t('templates.import.notePrefix', { index: index + 1 }) }}{{ note }}</p>
        </div>
        <a-link class="template-import-template" :loading="preparingTemplate" @click="downloadTemplate">{{ t('templates.import.template') }}</a-link>
      </div>
      <template #footer>
        <a-button class="app-btn-neutral" :disabled="importing" @click="closeImport">{{ t('templates.actions.cancel') }}</a-button>
        <a-button type="primary" :loading="importing" :disabled="!importPreview.length || Boolean(importError)" @click="confirmImport">{{ t('templates.import.confirm') }}</a-button>
      </template>
    </a-drawer>

    <!-- 导出确认弹窗（DESIGN.md · Batch export baseline）：确认后进入任务中心「下载任务」 -->
    <a-modal
      :visible="exportOpen"
      :width="456"
      :mask-closable="!exporting"
      :title="t('templates.exportNotice.title')"
      @cancel="!exporting && (exportOpen = false)"
    >
      <div class="template-export-notice">
        <IconExclamationCircle class="template-export-icon" />
        <div class="template-export-text">
          <p>{{ t('templates.exportNotice.line1') }}</p>
          <p>{{ t('templates.exportNotice.line2') }}</p>
        </div>
      </div>
      <template #footer>
        <a-button class="app-btn-neutral" :disabled="exporting" @click="exportOpen = false">{{ t('templates.exportNotice.cancel') }}</a-button>
        <a-button type="primary" :loading="exporting" @click="confirmExport">{{ t('templates.exportNotice.confirm') }}</a-button>
      </template>
    </a-modal>

    <!-- 删除确认（456px · DESIGN.md Dialog）：展示引用情况，进行中引用存在时禁止删除 -->
    <a-modal
      :visible="Boolean(deleteTarget)"
      :width="456"
      :mask-closable="!deleteBusy"
      :title="t('templates.messages.deleteTitle')"
      @cancel="!deleteBusy && (deleteTarget = null)"
    >
      <p>{{ t('templates.messages.deleteConfirm', { name: deleteTarget?.name ?? '', no: deleteTarget?.id ?? '' }) }}</p>
      <a-alert v-if="deleteUsage.inProgress > 0" type="warning" :show-icon="true" class="delete-guard">
        {{ t('templates.messages.deleteGuard', { inProgress: deleteUsage.inProgress, total: deleteUsage.total }) }}
      </a-alert>
      <p v-else class="delete-note">{{ t('templates.messages.deleteSnapshot', { total: deleteUsage.total }) }}</p>
      <template #footer>
        <a-button class="app-btn-neutral" :disabled="deleteBusy" @click="deleteTarget = null">{{ t('templates.actions.cancel') }}</a-button>
        <a-button type="primary" status="danger" :loading="deleteBusy" :disabled="deleteUsage.inProgress > 0" @click="performDelete">{{ t('templates.actions.confirmDelete') }}</a-button>
      </template>
    </a-modal>

    <!-- 发布确认：二次确认 -->
    <a-modal
      :visible="Boolean(publishTarget)"
      :width="456"
      :title="t('templates.messages.publishTitle')"
      @cancel="publishTarget = null"
    >
      <p>{{ t('templates.messages.publishConfirm', { name: publishTarget?.name ?? '', no: publishTarget?.id ?? '' }) }}</p>
      <template #footer>
        <a-button class="app-btn-neutral" @click="publishTarget = null">{{ t('templates.actions.cancel') }}</a-button>
        <a-button type="primary" @click="confirmPublish">{{ t('templates.actions.publish') }}</a-button>
      </template>
    </a-modal>
  </main>
</template>

<style scoped>
.templates-page { min-width: 0; min-height: calc(100dvh - 88px); display: flex; flex-direction: column; gap: 12px; font-size: 14px; }

.templates-filterbar { width: 100%; min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.templates-query { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; min-width: 0; }
.filter-field { display: inline-grid; grid-template-columns: max-content minmax(0, 200px); max-width: 100%; align-items: center; gap: 8px; min-width: 0; color: var(--color-text-2); white-space: nowrap; }
.filter-field > span { text-align: right; }
.filter-field :deep(.app-filter-control) { width: 200px; max-width: 100%; min-width: 0; }
/* 日期区间与其他筛选控件统一 200px（2026-10-29 全局裁决，DESIGN.md Filter geometry 已同步） */
.filter-field--range { grid-template-columns: max-content minmax(0, 200px); }
.filter-field--range :deep(.app-filter-control) { width: 200px; }
.templates-query-actions { display: flex; align-items: center; gap: 8px; }
.icon-button { width: 32px; height: 32px; padding: 0; }

.templates-panel { flex: 1; min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.templates-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.templates-heading-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.templates-heading-title { margin: 0; color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; }
.templates-heading-count { color: var(--color-text-3); font-size: 12px; line-height: 20px; }
/* 数量治理软提示：浅底深字（Warn 色不作白底文字），仅提示不阻断 */
.templates-heading-hint {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px;
  border-radius: var(--border-radius-small, 2px);
  color: var(--color-text-1); background: var(--mt-warn-bg); font-size: 12px; line-height: 20px;
}
.templates-heading-hint .arco-icon { flex: none; color: var(--app-color-warning); font-size: 14px; }

.templates-heading-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.column-settings-trigger { width: 32px; height: 32px; padding: 0; }

/* 数据列表：白底、无外框、无斑马纹、行间单线分隔（与任务管理同一套表格处理） */
.templates-panel :deep(.arco-table) { border: 0; }
.templates-panel :deep(.arco-table-container) { border: 0; }
.templates-panel :deep(.arco-table-th) { height: 44px; padding: 0 12px; border-bottom: 1px solid var(--app-divider); color: var(--color-text-1); background: var(--app-table-header); font-size: 14px; font-weight: 600; line-height: 22px; white-space: nowrap; }
.templates-panel :deep(.arco-table-td) { height: 52px; padding: 8px 12px; border-bottom: 1px solid var(--app-divider); background: var(--app-surface); font-size: 14px; white-space: nowrap; }
.templates-panel :deep(.arco-table-tr:hover .arco-table-td) { background: var(--color-fill-1); }

.tabular { font-variant-numeric: tabular-nums; }
.table-link { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; overflow: hidden; padding: 0; border: 0; color: var(--color-text-1); background: transparent; cursor: pointer; font: inherit; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.table-link:hover, .table-link:focus-visible { color: var(--app-accent); }
.template-no { display: block; width: 100%; min-width: 0; color: var(--color-text-1); text-overflow: ellipsis; }
.template-note-cell { display: inline-block; max-width: 216px; overflow: hidden; color: var(--color-text-2); text-overflow: ellipsis; vertical-align: middle; }
/* 判定规则列 / 抽屉同一字段：单行省略，hover 气泡说明现行规则集与存量历史绑定 */
.rule-binding-cell { display: inline-block; max-width: 100%; overflow: hidden; color: var(--color-text-2); text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
/* 检查结果列：最多 2 行截断，hover 气泡全显 */
.coverage-cell { display: inline-flex; align-items: center; gap: 6px; }
.question-code { display: inline-flex; align-items: center; gap: 4px; }

.table-actions { display: flex; align-items: center; gap: 12px; }
.table-actions .row-more-trigger.arco-btn { width: 24px; min-width: 24px; height: 24px; padding: 0; color: var(--color-text-3); background: transparent; }
.table-actions .row-more-trigger.arco-btn .arco-btn-icon { color: inherit; }
.table-actions .row-more-trigger.arco-btn:not(.arco-btn-disabled):hover,
.table-actions .row-more-trigger.arco-btn:not(.arco-btn-disabled):active { color: var(--app-accent); background: var(--color-fill-2); }

.templates-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 40px 0; }
.templates-empty :deep(.arco-empty-description) { color: var(--color-text-3); font-size: 20px; font-weight: 400; line-height: 28px; }

.templates-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 16px; color: var(--color-text-2); }
.pagination-total { margin-right: 8px; color: var(--color-text-3); font-size: 14px; line-height: 22px; }
.pagination-pages { display: flex; align-items: center; gap: 8px; margin-right: 8px; }
.pagination-jump-label, .pagination-total-pages { color: var(--color-text-3); font-size: 14px; line-height: 22px; }

/* 抽屉内容 */
/* 分组白卡：与功能台账抽屉同一形态（表面规则在 global.css 的 .ledger-drawer，卡片底色由本组件承载） */
.ledger-drawer-group { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.drawer-section-heading { margin: 0; color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; }
.drawer-group-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
/* 预览抽屉底部操作栏：随抽屉整宽、底部置顶（Arco drawer footer 承载） */
.ledger-drawer :deep(.arco-drawer-footer) { padding: 12px 16px; background: var(--app-surface); border-top: 1px solid var(--app-divider); }
.drawer-footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
/* 导入抽屉 / 导出确认弹窗（DESIGN.md · Batch import / export baseline，与功能台账同一形态） */
.template-import-hint, .template-import-file, .template-import-count, .template-import-error { margin: 0; line-height: 22px; }
.template-import-file { overflow-wrap: anywhere; }
.template-import-error { color: var(--app-color-danger); }
.template-import-count { color: var(--color-text-1); font-weight: 600; }
.template-import-list { margin: 0; padding-left: 20px; color: var(--color-text-1); line-height: 22px; }
.template-import-dropzone { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; min-height: 180px; padding: 24px 16px; border: 1px dashed var(--app-control-border); border-radius: 4px; background: var(--app-page); cursor: pointer; text-align: center; }
.template-import-dropzone:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.template-import-folder { color: var(--app-color-primary); font-size: 48px; }
.template-import-hint, .template-import-file-name { max-width: 100%; margin: 0; color: var(--color-text-1); line-height: 24px; overflow-wrap: anywhere; }
.template-import-file-name { font-size: 18px; }
.template-import-input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; }
.template-import-notes { display: flex; flex-direction: column; gap: 4px; padding: 16px; border-radius: 2px; background: var(--app-import-help-surface); }
.template-import-notes-title { margin: 0; font-weight: 600; line-height: 22px; }
.template-import-note { margin: 0; color: var(--color-text-2); line-height: 22px; }
.template-import-template { align-self: flex-start; }
.template-export-notice { display: flex; align-items: flex-start; gap: 12px; }
.template-export-icon { flex: none; margin-top: 2px; color: var(--app-color-warning); font-size: 24px; }
.template-export-text p { margin: 0 0 4px; line-height: 22px; }
.template-export-text p:last-child { margin-bottom: 0; }
.drawer-group-title { display: flex; align-items: center; gap: 8px; }
/* 抽屉表单：字段与组件的纵向间距统一交给分组卡 12px gap（4px 基数），去掉 Arco 默认 20px 项间距 */
.template-form :deep(.arco-form-item) { margin-bottom: 0; }
.template-facts { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 10px 16px; margin: 0; }
.template-facts dt { color: var(--color-text-2); }
.template-facts dd { margin: 0; color: var(--color-text-1); overflow-wrap: anywhere; }
.fact-meta { margin-left: 8px; color: var(--color-text-3); font-size: 12px; }

.question-preview { display: flex; flex-direction: column; gap: 24px; margin: 0; padding: 0; list-style: none; }
.question-preview-item { display: grid; grid-template-columns: 32px minmax(0, 1fr); align-items: start; padding: 12px; border: 1px solid var(--app-control-border); border-radius: 2px; }
.question-code { flex: none; color: var(--color-text-2); font-weight: 600; line-height: 22px; }
.question-preview-body { min-width: 0; }
.question-title { margin: 0; color: var(--color-text-1); line-height: 22px; }
.question-answer-options { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 12px; }
.question-answer-options :deep(.arco-radio) { margin: 0; color: var(--color-text-1); }
.question-answer-options :deep(.arco-radio-disabled .arco-radio-label) { color: var(--color-text-1); }
.question-guide { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.question-guide-label { color: var(--color-text-1); line-height: 22px; }
.question-guide-text { min-width: 0; color: var(--color-text-2); font-size: 12px; line-height: 22px; display: flex; flex-direction: column; gap: 2px; }
/* 指引行（2026-10-27 用户裁决，第二轮修正）：不显示数字序号；「【…】」来源行独占一行作小标题，
   其余内容按原文逐行换行（行高与原文一致），无序列表行以「·」引导。 */
.guide-line { display: flex; gap: 4px; margin: 0; }
.guide-line--header { margin-top: 6px; }
.guide-line--header:first-child { margin-top: 0; }
.guide-line--bullet { padding-left: 2px; }
.guide-marker { flex: 0 0 auto; }
.guide-line-text { flex: 1; min-width: 0; }
.guide-header-text { color: var(--color-text-1); font-weight: 500; }
.question-guide-text--empty { color: var(--color-text-3); }

.template-form { display: flex; flex-direction: column; gap: 16px; }
.form-hint { margin: 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.question-count { color: var(--color-text-3); font-size: 12px; line-height: 20px; }

.question-table { display: flex; flex-direction: column; border: 1px solid var(--app-divider); border-radius: 2px; }
/* 题目行（2026-10-28 用户裁决）：题干 / 判断指引 / 关联题库题三列等高——
   行高由内容最多的一列决定（stretch），短内容组件拉伸填满；超 4 行在组件内滚动。 */
.question-row { display: grid; grid-template-columns: 56px minmax(0, 1fr) minmax(0, 1fr) 104px; align-items: stretch; gap: 12px; padding: 10px 12px; border-top: 1px solid var(--app-divider); }
.question-row--head { border-top: 0; background: var(--app-table-header); color: var(--color-text-1); font-weight: 600; }
.question-row--head span { line-height: 22px; }
.question-row .question-code { line-height: 32px; }
.question-input { width: 100%; height: 100%; }
.question-input :deep(.arco-textarea) { height: 100% !important; resize: none; }
/* 题目行（2026-10-28 收口）：题号由判定规则题集顺序自动对应，界面不再提供逐题选择 */
.question-row-actions { display: flex; align-items: center; gap: 4px; }
.icon-action.arco-btn { width: 28px; height: 28px; padding: 0; }
.question-table-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
/* 预览抽屉：题目关联状态（参与 / 不参与自动判定） */
.question-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }

.delete-guard, .delete-note { margin: 12px 0 0; }
.delete-note { color: var(--color-text-2); font-size: 12px; line-height: 20px; }

@media (max-width: 720px) {
  .templates-heading { align-items: flex-start; flex-direction: column; }
  .templates-heading-actions { justify-content: flex-start; max-width: 100%; }
  .templates-pagination { justify-content: flex-start; }
  .pagination-total { width: 100%; margin-right: 0; }
  .question-row { grid-template-columns: 48px minmax(0, 1fr); }
  .question-row-actions { grid-column: 1 / -1; }
}
</style>
