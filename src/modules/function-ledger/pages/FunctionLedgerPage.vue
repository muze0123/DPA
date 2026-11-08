<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Message, type TableColumnData } from '@arco-design/web-vue';
import {
  IconDelete, IconDownload, IconExclamationCircle, IconFilter, IconFolder, IconLeft, IconMinusCircle, IconPlus, IconPlusCircle,
  IconRefresh, IconRight, IconSearch, IconSettings, IconUpload, IconUser,
} from '@arco-design/web-vue/es/icon';
import ColumnSettingsPopover, { type ColumnSettingsItem } from '../../../shared/components/ColumnSettingsPopover.vue';
import { MOCK_FUNCTION_RECORDS } from '../data/mockLedger';
import { useTaskCenterStore } from '../../task-center/stores/taskCenter';
import { functionStatus, isFunctionEnabled, normalizeInput, responsibleDepartments, subfunctionSummary, surveyPhaseFromStatus, validateInput, type FunctionInput, type FunctionRecord, type FunctionStatus, type ResponsibleDepartment, type SurveySnapshot, type Subfunction } from '../data/ledger';
import { deleteFunction, importFunctions, loadLedger, readPreferences, saveFunction, savePreferences, setFunctionEnabled } from '../data/storage';
import type { ParsedWorkbook } from '../data/workbook';
import { TIANSHU_PARTS, TIANSHU_PLATFORMS, findPartByLabel, partLabel, platformLabel } from '../data/tianshu';
import { mergeLocalSurveyDrafts, surveyRecords, type SurveyRecord } from '../../surveys/data/surveys';
import { loadLocalSurveyDrafts } from '../../surveys/data/drafts';
import { fieldLabel } from '../../../shared/fieldLabel';

type FilterKey = 'keyword' | 'platformName' | 'owner' | 'department' | 'developmentLocation' | 'status' | 'masterStatus' | 'masterEcu' | 'createdAt';
type ColumnKey = 'index' | 'platformName' | 'fuliId' | 'functionName' | 'functionDescription' | 'subfunctions' | 'controller' | 'owner' | 'developmentLocation' | 'masterEcu' | 'status' | 'masterStatus' | 'relatedSurveys' | 'creator' | 'createdAt' | 'updatedAt';
interface Filters {
  keyword: string;
  platformName: string;
  owner: string;
  department: string;
  developmentLocation: string;
  status: string;
  masterStatus: string;
  masterEcu: string;
  createdAt: string[];
}

const { t, locale } = useI18n();
const router = useRouter();
const records = ref<FunctionRecord[]>([]);
const loading = ref(true);
const loadError = ref(false);
const saving = ref(false);
const importing = ref(false);
const importingFile = ref(false);
const exporting = ref(false);
const viewportWidth = ref(window.innerWidth);
const page = ref(1);
const pageSize = ref(10);
const jumpPage = ref(1);
const filterSettingsOpen = ref(false);
const columnSettingsOpen = ref(false);
const importOpen = ref(false);
const exportOpen = ref(false);
const drawerOpen = ref(false);
const activeResponsiblePopover = ref<string | null>(null);
function closeResponsiblePopover(event: KeyboardEvent) {
  activeResponsiblePopover.value = null;
  (event.currentTarget as HTMLElement).blur();
}
const drawerMode = ref<'add' | 'edit' | 'detail'>('add');
const editingId = ref<string | undefined>();
const detail = ref<FunctionRecord | null>(null);
const deleteTarget = ref<FunctionRecord | null>(null);
const deleteBusy = ref(false);
const togglingIds = ref<Set<string>>(new Set());
const selectedFile = ref<File | null>(null);
const parsed = ref<ParsedWorkbook | null>(null);
const templateBlob = ref<Blob | null>(null);
const preparingTemplate = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
let templateDownload: ((blob: Blob, fileName: string) => void) | null = null;
const formRef = ref<{ validate: () => Promise<unknown>; scrollToField: (field: string) => void } | null>(null);
const formSnapshot = ref('');
let drawerReturnFocus: HTMLElement | null = null;
let syncChannel: BroadcastChannel | null = null;

function emptyFilters(): Filters {
  return { keyword: '', platformName: '', owner: '', department: '', developmentLocation: '', status: '', masterStatus: '', masterEcu: '', createdAt: [] };
}
const draft = reactive<Filters>(emptyFilters());
const applied = reactive<Filters>(emptyFilters());
const filters: FilterKey[] = ['keyword', 'platformName', 'owner', 'department', 'developmentLocation', 'status', 'masterStatus', 'masterEcu', 'createdAt'];
/** master ECU 筛选默认不显示（2026-10-29 用户裁决），可在筛选设置中打开 */
const defaultVisibleFilters: FilterKey[] = ['keyword', 'platformName', 'owner'];
interface FilterSetting { key: FilterKey; visible: boolean }
const defaultFilterSettings: FilterSetting[] = filters.map((key) => ({ key, visible: defaultVisibleFilters.includes(key) }));
const filterSettings = ref<FilterSetting[]>(defaultFilterSettings.map((item) => ({ ...item })));
const visibleFilterKeys = computed(() => filterSettings.value.filter((item) => item.visible).map((item) => item.key));
const localizedFilterItems = computed<ColumnSettingsItem[]>(() => filterSettings.value.map((item) => ({ ...item, label: t(`ledger.filters.${item.key}`) })));
const localizedDefaultFilters = computed<ColumnSettingsItem[]>(() => defaultFilterSettings.map((item) => ({ ...item, label: t(`ledger.filters.${item.key}`) })));

/** 默认列序 v3（2026-11-02 用户裁决）：「是否启用」移至「操作」左侧，作最后一个数据列 */
const defaultColumns: ColumnSettingsItem[] = (
  ['index', 'platformName', 'fuliId', 'functionName', 'functionDescription', 'subfunctions', 'controller', 'owner', 'developmentLocation', 'masterEcu', 'status', 'relatedSurveys', 'creator', 'createdAt', 'updatedAt', 'masterStatus'] as ColumnKey[]
).map((key) => ({ key, label: key, visible: key !== 'updatedAt' && key !== 'functionDescription', disabled: key === 'index' }));
const columns = ref<ColumnSettingsItem[]>(defaultColumns.map((item) => ({ ...item })));
const columnLabel = (key: string) => t(key === 'owner' ? 'ledger.fields.responsibles' : `ledger.fields.${key}`);
const localizedColumns = computed(() => columns.value.map((item) => ({ ...item, label: columnLabel(item.key) })));
const localizedDefaultColumns = computed(() => defaultColumns.map((item) => ({ ...item, label: columnLabel(item.key) })));

function emptyInput(): FunctionInput {
  return { platformName: '', fuliId: '', functionName: '', functionDescription: '', subfunctions: [], owner: '', department: '', responsibles: [], developmentLocation: '', masterEcu: '' };
}
const form = reactive<FunctionInput>(emptyInput());

/** 列表筛选的平台选项：取台账已有数据的去重值（含历史数据） */
const platformOptions = computed(() => [...new Set(records.value.map((record) => record.platformName))].sort());
/** 列表筛选的 master ECU 选项：取台账已有数据的去重值 */
const masterEcuOptions = computed(() => [...new Set(records.value.map((record) => record.masterEcu).filter(Boolean))].sort());
/** 表单「平台名称」选项：天枢「整车架构平台」数据（编号-名称），编辑旧数据时补入其现值 */
const formPlatformOptions = computed(() => {
  const options = TIANSHU_PLATFORMS.map(platformLabel);
  return form.platformName && !options.includes(form.platformName) ? [...options, form.platformName] : options;
});
/** 表单「master ECU」选项：天枢「零部件」数据（编号-名称），编辑旧数据时补入其现值 */
const formMasterEcuOptions = computed(() => {
  const options = TIANSHU_PARTS.map(partLabel);
  return form.masterEcu && !options.includes(form.masterEcu) ? [...options, form.masterEcu] : options;
});
/**
 * 选择 master ECU 后，按天枢「零部件」数据带入子功能与控制器回显
 * （2026-10-29 用户裁决）；带入后仍可手动增删改，无数据则不显示。
 */
function onMasterEcuChange(value: unknown) {
  const part = findPartByLabel(String(value ?? ''));
  if (!part) return;
  form.subfunctions = part.subfunctions.map((item) => ({ name: item.name, controllers: [...item.controllers] }));
}
/**
 * 子功能行增删（2026-10-29 用户裁决）：操作列「−」删除本行、「+」在其后追加一行，
 * 底部「添加子功能」按钮取消；空态下保留一个添加入口，否则无法从 0 行起步。
 */
function addSubfunction(afterIndex?: number) {
  const row: Subfunction = { name: '', controllers: [''] };
  if (typeof afterIndex === 'number') form.subfunctions.splice(afterIndex + 1, 0, row);
  else form.subfunctions.push(row);
}
function removeSubfunction(index: number) {
  form.subfunctions.splice(index, 1);
}
const responsibleKey = ({ name, department }: ResponsibleDepartment) => JSON.stringify([name, department]);
const responsibleOptions = computed(() => {
  const unique = new Map<string, ResponsibleDepartment>();
  for (const record of [...MOCK_FUNCTION_RECORDS, ...records.value]) {
    for (const person of responsibleDepartments(record)) {
      if (person.name && person.department) unique.set(responsibleKey(person), person);
    }
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name) || a.department.localeCompare(b.department));
});
const selectedResponsibleKeys = computed<string[]>({
  get: () => responsibleDepartments(form).map(responsibleKey),
  set: (keys) => {
    const options = new Map(responsibleOptions.value.map((person) => [responsibleKey(person), person]));
    form.responsibles = keys.flatMap((key) => options.has(key) ? [{ ...options.get(key)! }] : []);
    form.owner = form.responsibles[0]?.name ?? '';
    form.department = form.responsibles[0]?.department ?? '';
  },
});
const ownerOptions = computed(() => [...new Set(records.value.flatMap((record) => responsibleDepartments(record).map(({ name }) => name)))].sort());
const departmentOptions = computed(() => [...new Set(records.value.flatMap((record) => responsibleDepartments(record).map(({ department }) => department)))].sort());
/**
 * 台账侧问卷口径统一（2026-10-27）：状态派生、关联问卷计数、状态气泡说明共用
 * 「问卷工作台可见的真实问卷」（工作台种子 + 本地草稿，按 functionId / fuliId 绑定功能）。
 * 台账库 surveys 店里另有仅用于演示状态派生的快照（无 status/functionName，工作台
 * 不展示），不再计入——否则计数与点击「关联问卷」跳转后的检索结果对不上。
 */
const functionIdByFuliId = computed(() => new Map(records.value.map((record) => [record.fuliId, record.id] as const)));
const workbenchSnapshots = computed<SurveySnapshot[]>(() => {
  const snapshots: SurveySnapshot[] = [];
  for (const record of surveyRecords) {
    const functionId = (record as SurveyRecord & { functionId?: string }).functionId ?? functionIdByFuliId.value.get(record.fuliId);
    if (!functionId) continue;
    snapshots.push({ id: record.id, functionId, status: record.status, phase: surveyPhaseFromStatus(record.status), updatedAt: record.updatedAt });
  }
  return snapshots;
});
const statusById = computed(() => new Map(records.value.map((record) => [record.id, functionStatus(record, workbenchSnapshots.value)])));
const activeStatus = ref<FunctionStatus | ''>('');
function matches(record: FunctionRecord): boolean {
  const query = applied.keyword.trim().toLocaleLowerCase();
  if (query && !`${record.functionName} ${record.fuliId}`.toLocaleLowerCase().includes(query)) return false;
  if (applied.platformName && record.platformName !== applied.platformName) return false;
  if (applied.owner && !responsibleDepartments(record).some(({ name }) => name === applied.owner)) return false;
  if (applied.department && !responsibleDepartments(record).some(({ department }) => department === applied.department)) return false;
  if (applied.developmentLocation && record.developmentLocation !== applied.developmentLocation) return false;
  if (applied.status && statusById.value.get(record.id) !== applied.status) return false;
  if (applied.masterStatus && (isFunctionEnabled(record) ? 'active' : 'disabled') !== applied.masterStatus) return false;
  if (applied.masterEcu && record.masterEcu !== applied.masterEcu) return false;
  const day = record.createdAt.slice(0, 10);
  if (applied.createdAt[0] && day < applied.createdAt[0]) return false;
  if (applied.createdAt[1] && day > applied.createdAt[1]) return false;
  return true;
}

const queryResults = computed(() => records.value.filter(matches));
const statusTabs = computed(() => [
  { key: '' as FunctionStatus | '', label: t('ledger.filters.all'), count: queryResults.value.length },
  ...(['not-started', 'in-progress', 'completed'] as const).map((key) => ({
    key, label: t(`ledger.statuses.${key}`),
    count: queryResults.value.filter((record) => statusById.value.get(record.id) === key).length,
  })),
]);

/** 创建时间排序（表头升/降序图标），默认最新在前；同时间按 FuLi ID 稳定排序 */
const sortDirection = ref<'ascend' | 'descend'>('descend');
function handleSort(dataIndex: string, direction: string) {
  if (dataIndex !== 'createdAt') return;
  if (direction !== 'ascend' && direction !== 'descend') return;
  sortDirection.value = direction;
}
const filtered = computed(() => queryResults.value
  .filter((record) => !activeStatus.value || statusById.value.get(record.id) === activeStatus.value)
  .sort((a, b) => {
    const result = a.createdAt.localeCompare(b.createdAt) || a.fuliId.localeCompare(b.fuliId);
    return sortDirection.value === 'ascend' ? result : -result;
  }));
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));

const tableColumns = computed<TableColumnData[]>(() => {
  const widths: Record<ColumnKey, number> = { index: 70, platformName: 180, fuliId: 180, functionName: 200, functionDescription: 240, subfunctions: 230, controller: 230, owner: 220, developmentLocation: 120, masterEcu: 160, status: 130, masterStatus: 120, relatedSurveys: 110, creator: 150, createdAt: 190, updatedAt: 180 };
  return [...localizedColumns.value.filter((item) => item.visible).map((item) => ({
    title: item.label, dataIndex: item.key, slotName: item.key, width: widths[item.key as ColumnKey], ellipsis: item.key !== 'owner', tooltip: item.key !== 'owner',
    ...(item.key === 'createdAt' ? { sortable: { sortDirections: ['ascend', 'descend'] as ('ascend' | 'descend')[], sorter: true } } : {}),
  })),
    { title: t('ledger.fields.actions'), dataIndex: 'actions', slotName: 'actions', width: 180, fixed: viewportWidth.value > 700 ? 'right' as const : undefined }];
});
const horizontalWidth = computed(() => tableColumns.value.reduce((total, column) => total + Number(column.width ?? 140), 0));
const hasApplied = computed(() => activeStatus.value !== '' || Object.entries(applied).some(([key, value]) => key === 'createdAt' ? (value as string[]).length > 0 : Boolean(value)));

function dateTime(value: string) {
  return new Intl.DateTimeFormat(locale.value, { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value));
}

/** 任务中心记录使用固定 YYYY-MM-DD HH:mm:ss 文本，与表格本地化时间分开 */
function clockText(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}
function stampText(date: Date, kind: 'date' | 'datetime'): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
  return kind === 'date' ? day : `${day}${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function localCreator(value: string) {
  return value === 'local-user' ? t('ledger.currentUser') : value;
}

/** 关联问卷数：与状态派生同源（workbenchSnapshots，见上方口径说明） */
function relatedSurveyCount(record: FunctionRecord): number {
  return workbenchSnapshots.value.filter((survey) => survey.functionId === record.id).length;
}
/** hover 高亮 + 点击携带功能名称跳转问卷工作台检索 */
function openRelatedSurveys(record: FunctionRecord) {
  void router.push({ path: '/surveys', query: { keyword: record.fuliId } });
}

/** 模板表达式里不写内联类型注解（vue-tsc 模板解析器不支持），类型在此收口 */
function subfunctionNames(record: FunctionRecord): string {
  return record.subfunctions.map((item) => item.name).join('、') || '—';
}

function subfunctionControllers(record: FunctionRecord): string {
  // 1:N（2026-10-29）：子功能内多个控制器用「、」，子功能之间用「；」分隔
  return record.subfunctions.map((item) => item.controllers.join('、')).join('；') || '—';
}

function visibleStatus(record: FunctionRecord): FunctionStatus {
  return statusById.value.get(record.id) ?? 'not-started';
}

function saveSettings() {
  try {
    savePreferences({ filterSettings: filterSettings.value, columnDefaultsVersion: 3, columns: columns.value.map(({ key, visible }) => ({ key, visible })) });
  } catch { Message.error(t('ledger.feedback.preference')); }
}

function restoreSettings() {
  const settings = readPreferences();
  const savedFilters = settings.filters;
  if (Array.isArray(settings.filterSettings)) {
    const saved = settings.filterSettings.filter((item): item is FilterSetting =>
      typeof item === 'object' && item !== null && filters.includes(item.key) && typeof item.visible === 'boolean');
    const byKey = new Map(saved.map((item) => [item.key, item.visible]));
    const order = [...new Set([...saved.map((item) => item.key), ...filters])];
    filterSettings.value = order.map((key) => ({ key, visible: byKey.get(key) ?? defaultVisibleFilters.includes(key) }));
  } else if (Array.isArray(savedFilters)) {
    // Migrate the former visible-key list without discarding a user's choices.
    filterSettings.value = filters.map((key) => ({ key, visible: savedFilters.includes(key) }));
  }
  if (Array.isArray(settings.columns)) {
    const saved = new Map(settings.columns.filter((item): item is { key: string; visible: boolean } => typeof item === 'object' && item !== null && typeof item.key === 'string' && typeof item.visible === 'boolean').map((item) => [item.key, item.visible]));
    // v3（2026-11-02）：「是否启用」列移到末位。旧版存档（columnDefaultsVersion < 3）的
    // 列序按新默认序重排（不按存档顺序还原），仅保留用户勾选的显隐偏好。
    const orderedKeys = settings.columnDefaultsVersion === 3
      ? settings.columns.map((item: { key?: string }) => item.key).filter((key): key is string => typeof key === 'string')
      : null;
    const reordered = (orderedKeys ?? defaultColumns.map((column) => column.key))
      .map((key) => defaultColumns.find((column) => column.key === key))
      .filter((item): item is ColumnSettingsItem => Boolean(item));
    columns.value = [...new Set([...reordered, ...defaultColumns])].map((item) => ({
      ...item,
      visible: item.disabled || (settings.columnDefaultsVersion !== 2 && settings.columnDefaultsVersion !== 3 && ['subfunctions', 'controller'].includes(item.key))
        ? true : saved.get(item.key) ?? item.visible,
    }));
  }
}

async function reload() {
  loading.value = true;
  loadError.value = false;
  try {
    const result = await loadLedger();
    records.value = result.records;
    // 关联问卷计数与状态派生统一走 workbenchSnapshots（问卷工作台种子 + 本地草稿，
    // 2026-10-27 口径）；台账库 surveys 店里的演示快照已在 ensureMockLedger 一次性清理。
    try { mergeLocalSurveyDrafts(await loadLocalSurveyDrafts()); } catch { /* 库不可用时退化为种子口径 */ }
    if (page.value > Math.ceil(filtered.value.length / pageSize.value)) page.value = Math.max(1, Math.ceil(filtered.value.length / pageSize.value));
  } catch { loadError.value = true; }
  finally { loading.value = false; }
}

function onVisibility() {
  if (document.visibilityState === 'visible') void reload();
}
function onResize() { viewportWidth.value = window.innerWidth; }

onMounted(() => {
  restoreSettings();
  void reload();
  if ('BroadcastChannel' in window) {
    syncChannel = new BroadcastChannel('csa-function-ledger-events');
    syncChannel.onmessage = () => { void reload(); };
  }
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize);
});
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('resize', onResize);
  syncChannel?.close();
});

function notifyOtherTabs() { syncChannel?.postMessage('changed'); }

function applyFilters() {
  Object.assign(applied, { ...draft, createdAt: [...draft.createdAt] });
  setPage(1);
}
function resetFilters() {
  Object.assign(draft, emptyFilters());
  activeStatus.value = '';
  applyFilters();
}
function selectStatusTab(status: FunctionStatus | '') {
  activeStatus.value = status;
  setPage(1);
}
function onFilterSettingsChanged(next: ColumnSettingsItem[]) {
  filterSettings.value = next.map((item) => ({ key: item.key as FilterKey, visible: item.visible }));
  for (const key of filters) {
    if (visibleFilterKeys.value.includes(key)) continue;
    if (key === 'createdAt') { draft.createdAt = []; applied.createdAt = []; }
    else { draft[key] = ''; applied[key] = ''; }
  }
  setPage(1);
  saveSettings();
}
function onColumnsChanged(next: ColumnSettingsItem[]) {
  columns.value = next.map((item) => ({ key: item.key, label: item.key, visible: item.visible, disabled: item.key === 'index' }));
  saveSettings();
}

/* ---------------------------------------------------------------- 分页 */

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)));
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

/* ---------------------------------------------------------------- 抽屉 */

function useRecord(record: FunctionRecord | null) {
  const input = record ? normalizeInput(record) : emptyInput();
  Object.assign(form, input);
  form.subfunctions = input.subfunctions.map((item) => ({ name: item.name, controllers: [...item.controllers] }));
  form.responsibles = responsibleDepartments(input).map((person) => ({ ...person }));
  formSnapshot.value = JSON.stringify(normalizeInput(form));
}
function openDrawer(mode: 'add' | 'edit' | 'detail', record: FunctionRecord | null = null) {
  drawerReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  drawerMode.value = mode;
  editingId.value = record?.id;
  detail.value = record;
  useRecord(record);
  drawerOpen.value = true;
}
function focusDrawer() {
  void nextTick(() => {
    const drawer = document.querySelector('.ledger-drawer');
    (drawer?.querySelector<HTMLInputElement>('.ledger-editor input')
      ?? drawer?.querySelector<HTMLButtonElement>('.arco-drawer-footer button'))?.focus();
  });
}
function restoreDrawerFocus() {
  if (drawerReturnFocus?.isConnected) drawerReturnFocus.focus();
  drawerReturnFocus = null;
}
function requestClose() {
  if (saving.value) return;
  if (drawerMode.value !== 'detail' && formSnapshot.value !== JSON.stringify(normalizeInput(form)) && !window.confirm(t('ledger.form.unsaved'))) return;
  drawerOpen.value = false;
}

const rules = computed(() => ({
  ...Object.fromEntries((['platformName', 'fuliId', 'functionName', 'responsibles'] as const).map((field) => [field, [{ required: true, message: t('ledger.form.required', { field: t(`ledger.fields.${field}`) }) }]])),
  developmentLocation: [{ required: true, message: t('ledger.form.location') }],
}));

async function submitForm() {
  if (saving.value || drawerMode.value === 'detail') return;
  const errors = await formRef.value?.validate();
  if (errors) { formRef.value?.scrollToField(Object.keys(errors as object)[0]); return; }
  const invalid = validateInput(form);
  if (invalid.includes('subfunctions')) { Message.error(t('ledger.form.subfunctionPair')); return; }
  if (invalid.length) { Message.error(t('ledger.form.required', { field: t(`ledger.fields.${invalid[0]}`) })); return; }
  saving.value = true;
  try {
    await saveFunction(form, 'local-user', editingId.value, editingId.value ? detail.value?.updatedAt : undefined);
    drawerOpen.value = false;
    Message.success(t(editingId.value ? 'ledger.feedback.saved' : 'ledger.feedback.created'));
    await reload(); notifyOtherTabs();
  } catch (error) {
    Message.error(t(error instanceof Error && error.message === 'Duplicate FuLi ID' ? 'ledger.form.duplicate' : error instanceof Error && error.message === 'Linked FuLi ID' ? 'ledger.form.linkedId' : error instanceof Error && error.message === 'Record changed' ? 'ledger.feedback.conflict' : 'ledger.feedback.storage'));
  } finally { saving.value = false; }
}

/**
 * 删除守卫（2026-10-29 修复）：只按 workbenchSnapshots（问卷工作台可见的真实问卷）
 * 判断是否已关联问卷；此前把台账库 surveys 店的演示快照也算进来，导致未关联问卷
 * 的功能无法删除。
 */
function requestDelete(record: FunctionRecord) {
  if (workbenchSnapshots.value.some((item) => item.functionId === record.id)) { Message.warning(t('ledger.form.linked')); return; }
  deleteTarget.value = record;
}
async function confirmDelete() {
  if (!deleteTarget.value || deleteBusy.value) return;
  deleteBusy.value = true;
  try {
    await deleteFunction(deleteTarget.value, workbenchSnapshots.value, 'local-user');
    deleteTarget.value = null;
    Message.success(t('ledger.feedback.deleted'));
    await reload(); notifyOtherTabs();
  } catch (error) {
    Message.error(t(error instanceof Error && error.message === 'Linked questionnaire' ? 'ledger.form.linked' : 'ledger.feedback.storage'));
  } finally { deleteBusy.value = false; }
}

/**
 * 「是否启用」开关直接切换（2026-10-29 用户裁决）：不再弹原因填写框；
 * 审计日志仍记录 enable/disable 动作，乐观更新失败（并发冲突）时提示并回读。
 */
async function toggleEnabled(record: FunctionRecord, value: string | number | boolean) {
  const enabled = Boolean(value);
  if (togglingIds.value.has(record.id) || isFunctionEnabled(record) === enabled) return;
  const next = new Set(togglingIds.value);
  next.add(record.id);
  togglingIds.value = next;
  try {
    await setFunctionEnabled(record, enabled, 'local-user');
    Message.success(t(enabled ? 'ledger.feedback.enabled' : 'ledger.feedback.disabled'));
    await reload(); notifyOtherTabs();
  } catch (error) {
    Message.error(t(error instanceof Error && error.message === 'Record changed' ? 'ledger.feedback.conflict' : 'ledger.feedback.storage'));
    await reload();
  } finally {
    const done = new Set(togglingIds.value);
    done.delete(record.id);
    togglingIds.value = done;
  }
}

/* ---------------------------------------------------------------- 批量导入（抽屉 + 任务中心） */

function openImport() {
  selectedFile.value = null;
  parsed.value = null;
  importOpen.value = true;
  if (!templateBlob.value) void prepareTemplate();
}
async function prepareTemplate() {
  if (preparingTemplate.value) return;
  preparingTemplate.value = true;
  try {
    const { downloadWorkbook, makeTemplate } = await import('../data/workbook');
    templateBlob.value = await makeTemplate();
    templateDownload = downloadWorkbook;
  } catch {
    Message.error(t('ledger.import.templateError'));
  } finally { preparingTemplate.value = false; }
}
async function ingestFile(file: File) {
  if (importingFile.value || importing.value) return;
  selectedFile.value = file;
  parsed.value = null;
  importingFile.value = true;
  try {
    const { parseWorkbook } = await import('../data/workbook');
    parsed.value = await parseWorkbook(file);
  }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    Message.error(t(message === 'fileType' ? 'ledger.import.type' : message === 'fileSize' ? 'ledger.import.size' : message === 'sheetMissing' ? 'ledger.import.missingSheet' : message.startsWith('headersMissing:') ? 'ledger.import.missingHeaders' : 'ledger.import.invalid', { headers: message.split(':')[1] ?? '' }));
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

const importNotes = computed(() => [1, 2, 3, 4, 5, 6].map((index) => t(`ledger.import.note${index}`)));

async function downloadErrors() {
  if (!parsed.value?.failures.length) return;
  try {
    const { downloadWorkbook, makeErrors } = await import('../data/workbook');
    downloadWorkbook(await makeErrors(parsed.value.failures), `功能台账_导入错误数据_${stampText(new Date(), 'datetime')}.xlsx`);
  }
  catch { Message.error(t('ledger.feedback.generic')); }
}
function downloadTemplate() {
  if (!templateBlob.value || !templateDownload) { void prepareTemplate(); return; }
  try {
    templateDownload(templateBlob.value, '功能台账导入模版.xlsx');
  } catch { Message.error(t('ledger.import.templateError')); }
}
async function confirmImport() {
  if (!parsed.value || importing.value || !parsed.value.items.length) return;
  importing.value = true;
  try {
    const result = await importFunctions(parsed.value.items, 'local-user');
    const failed = parsed.value.failures.length;
    const now = new Date();
    let errorUrl: string | undefined;
    let errorName: string | undefined;
    if (failed) {
      const { makeErrors } = await import('../data/workbook');
      errorUrl = URL.createObjectURL(await makeErrors(parsed.value.failures));
      errorName = `功能台账_导入错误数据_${stampText(now, 'datetime')}.xlsx`;
    }
    const taskCenter = useTaskCenterStore();
    taskCenter.addImportTask({
      id: `imp-${now.getTime()}`, module: 'ledger',
      fileStamp: stampText(now, 'date'),
      operator: t('ledger.currentUser'), time: clockText(now),
      status: 'processing', progress: 92,
      total: result.created + result.updated + failed, ok: result.created + result.updated, fail: failed,
      errorUrl, errorName,
    });
    importOpen.value = false;
    Message.success(t('ledger.import.submitted'));
    taskCenter.open('import');
    await reload(); notifyOtherTabs();
  } catch { Message.error(t('ledger.import.fail')); }
  finally { importing.value = false; }
}

/* ---------------------------------------------------------------- 批量导出（确认弹窗 + 任务中心） */

function requestExport() {
  if (exporting.value) return;
  if (!filtered.value.length) { Message.info(t('ledger.feedback.noExport')); return; }
  exportOpen.value = true;
}
async function confirmExport() {
  if (exporting.value || !filtered.value.length) return;
  exporting.value = true;
  try {
    const { makeExport } = await import('../data/workbook');
    const blob = await makeExport(filtered.value, workbenchSnapshots.value);
    const now = new Date();
    const taskCenter = useTaskCenterStore();
    taskCenter.addDownloadTask({
      id: `dl-${now.getTime()}`, module: 'ledger',
      fileStamp: stampText(now, 'datetime'),
      operator: t('ledger.currentUser'), time: clockText(now),
      status: 'processing', progress: 92,
      fileUrl: URL.createObjectURL(blob),
      fileName: `功能台账_${now.toISOString().slice(0, 10)}.xlsx`,
    });
    exportOpen.value = false;
    Message.success(t('ledger.exportNotice.created'));
    taskCenter.open('download');
  } catch { Message.error(t('ledger.feedback.generic')); }
  finally { exporting.value = false; }
}
</script>

<template>
  <div class="ledger-page">
    <!-- 筛选卡（2026-11-05 裁决，与工作台一致）：状态页签在上，分割线隔开，筛选条件在下 -->
    <div class="ledger-filter-panel">
      <div class="ledger-status-tabs" role="tablist" :aria-label="t('ledger.filters.status')">
        <button v-for="tab in statusTabs" :key="tab.key || 'all'" type="button" role="tab" class="ledger-status-tab" :class="{ active: activeStatus === tab.key }" :aria-selected="activeStatus === tab.key" :tabindex="activeStatus === tab.key ? 0 : -1" @click="selectStatusTab(tab.key)">
          {{ tab.label }}<span class="ledger-status-count">({{ tab.count }})</span>
        </button>
      </div>

      <hr class="ledger-filter-divider" />

      <form class="ledger-filters" @submit.prevent="applyFilters">
        <div v-for="key in visibleFilterKeys" :key="key" class="ledger-filter-field">
          <label :for="`ledger-filter-${key}`">{{ t(`ledger.filters.${key}`) }}</label>
          <a-input v-if="key === 'keyword'" :id="`ledger-filter-${key}`" v-model="draft.keyword" class="app-filter-control" allow-clear :placeholder="t('ledger.filters.keywordPlaceholder')" />
          <a-select v-else-if="key === 'platformName'" :id="`ledger-filter-${key}`" v-model="draft.platformName" class="app-filter-control" allow-clear :placeholder="t('ledger.filters.all')"><a-option v-for="option in platformOptions" :key="option" :value="option">{{ option }}</a-option></a-select>
          <a-select v-else-if="key === 'owner'" :id="`ledger-filter-${key}`" v-model="draft.owner" class="app-filter-control" allow-clear :placeholder="t('ledger.filters.all')"><a-option v-for="option in ownerOptions" :key="option" :value="option">{{ option }}</a-option></a-select>
          <a-select v-else-if="key === 'department'" :id="`ledger-filter-${key}`" v-model="draft.department" class="app-filter-control" allow-clear :placeholder="t('ledger.filters.all')"><a-option v-for="option in departmentOptions" :key="option" :value="option">{{ option }}</a-option></a-select>
          <a-select v-else-if="key === 'developmentLocation'" :id="`ledger-filter-${key}`" v-model="draft.developmentLocation" class="app-filter-control" allow-clear :placeholder="t('ledger.filters.all')"><a-option value="china">{{ t('ledger.locations.china') }}</a-option><a-option value="germany">{{ t('ledger.locations.germany') }}</a-option></a-select>
          <a-select v-else-if="key === 'status'" :id="`ledger-filter-${key}`" v-model="draft.status" class="app-filter-control" allow-clear :placeholder="t('ledger.filters.all')"><a-option value="completed">{{ t('ledger.statuses.completed') }}</a-option><a-option value="in-progress">{{ t('ledger.statuses.in-progress') }}</a-option><a-option value="not-started">{{ t('ledger.statuses.not-started') }}</a-option></a-select>
          <a-select v-else-if="key === 'masterStatus'" :id="`ledger-filter-${key}`" v-model="draft.masterStatus" class="app-filter-control" allow-clear :placeholder="t('ledger.filters.all')"><a-option value="active">{{ t('ledger.masterStatuses.active') }}</a-option><a-option value="disabled">{{ t('ledger.masterStatuses.disabled') }}</a-option></a-select>
          <a-select v-else-if="key === 'masterEcu'" :id="`ledger-filter-${key}`" v-model="draft.masterEcu" class="app-filter-control" allow-clear :placeholder="t('ledger.filters.all')"><a-option v-for="option in masterEcuOptions" :key="option" :value="option">{{ option }}</a-option></a-select>
          <a-range-picker v-else :id="`ledger-filter-${key}`" v-model="draft.createdAt" class="app-filter-control" :placeholder="[t('ledger.filters.from'), t('ledger.filters.to')]" />
        </div>
        <div class="ledger-filter-actions">
          <a-button type="primary" html-type="submit"><template #icon><IconSearch /></template>{{ t('ledger.filters.search') }}</a-button>
          <a-button class="app-btn-neutral" @click="resetFilters"><template #icon><IconRefresh /></template>{{ t('ledger.filters.reset') }}</a-button>
          <ColumnSettingsPopover v-model:visible="filterSettingsOpen" :items="localizedFilterItems" :default-items="localizedDefaultFilters" :title="t('ledger.filters.settings')" :list-aria-label="t('ledger.filters.settingsList')" :show-label="t('ledger.columns.show')" :restore-label="t('ledger.filters.restore')" @change="onFilterSettingsChanged">
            <a-tooltip :content="t('ledger.filters.settings')"><a-button class="app-btn-neutral ledger-icon-button" :aria-label="t('ledger.filters.settings')"><IconFilter /></a-button></a-tooltip>
          </ColumnSettingsPopover>
        </div>
      </form>
    </div>

    <div class="ledger-list" role="region" :aria-label="t('ledger.listTitle')">
      <div class="ledger-toolbar">
        <h2 class="ledger-toolbar-title">{{ t('ledger.listTitle') }}</h2>
        <div class="ledger-toolbar-actions">
          <a-button class="app-btn-neutral" @click="requestExport"><template #icon><IconDownload /></template>{{ t('ledger.actions.export') }}</a-button>
          <a-button class="app-btn-neutral" @click="openImport"><template #icon><IconUpload /></template>{{ t('ledger.actions.import') }}</a-button>
          <a-button type="primary" @click="openDrawer('add')"><template #icon><IconPlus /></template>{{ t('ledger.actions.add') }}</a-button>
          <ColumnSettingsPopover v-model:visible="columnSettingsOpen" :items="localizedColumns" :default-items="localizedDefaultColumns" :title="t('ledger.columns.settings')" :list-aria-label="t('ledger.columns.list')" :show-label="t('ledger.columns.show')" :restore-label="t('ledger.columns.restore')" @change="onColumnsChanged">
            <a-tooltip :content="t('ledger.columns.settings')"><a-button class="app-btn-neutral ledger-icon-button" :aria-label="t('ledger.columns.settings')"><IconSettings /></a-button></a-tooltip>
          </ColumnSettingsPopover>
        </div>
      </div>

      <span class="ledger-sr-only" role="status">{{ t('ledger.table.count', { count: filtered.length }) }}</span>

      <div v-if="loadError" class="ledger-load-error" role="alert">{{ t('ledger.table.error') }} <a-button type="text" @click="reload">{{ t('ledger.table.retry') }}</a-button></div>
      <a-table v-else :columns="tableColumns" :data="paged" row-key="id" :pagination="false" :bordered="false" :stripe="false" :loading="loading" :scroll="{ x: horizontalWidth }" class="ledger-table" @sorter-change="handleSort">
        <template #index="{ rowIndex }">{{ (page - 1) * pageSize + rowIndex + 1 }}</template>
        <template #platformName="{ record }">{{ record.platformName }}</template>
        <template #fuliId="{ record }">{{ record.fuliId }}</template>
        <template #functionName="{ record }"><button type="button" class="ledger-name-link" @click="openDrawer('detail', record)">{{ record.functionName }}</button></template>
        <template #functionDescription="{ record }">{{ record.functionDescription || '—' }}</template>
        <template #subfunctions="{ record }">{{ subfunctionNames(record) }}</template>
        <template #controller="{ record }">{{ subfunctionControllers(record) }}</template>
        <template #owner="{ record }">
          <div class="ledger-responsible-cell">
            <div class="ledger-responsible-primary">
              <span>{{ responsibleDepartments(record)[0]?.name ?? '—' }}</span>
              <span v-if="responsibleDepartments(record)[0]" class="ledger-responsible-department">{{ t('ledger.form.departmentValue', { department: responsibleDepartments(record)[0].department }) }}</span>
            </div>
            <a-popover v-if="responsibleDepartments(record).length > 1" :popup-visible="activeResponsiblePopover === record.id" trigger="hover" position="br" content-class="ledger-responsible-popover" @popup-visible-change="activeResponsiblePopover = $event ? record.id : null">
              <button type="button" class="ledger-responsible-more" :aria-label="t('ledger.form.moreResponsibles', { count: responsibleDepartments(record).length - 1 })" @focus="activeResponsiblePopover = record.id" @blur="activeResponsiblePopover = null" @keydown.esc.prevent.stop="closeResponsiblePopover">+{{ responsibleDepartments(record).length - 1 }}</button>
              <template #content><ul class="ledger-responsible-list"><li v-for="(person, index) in responsibleDepartments(record)" :key="index"><span>{{ person.name }}</span><span>{{ t('ledger.form.departmentValue', { department: person.department }) }}</span></li></ul></template>
            </a-popover>
          </div>
        </template>
        <template #developmentLocation="{ record }">{{ t(`ledger.locations.${record.developmentLocation}`) }}</template>
        <template #masterEcu="{ record }">{{ record.masterEcu || '—' }}</template>
        <template #status="{ record }">
          <!-- 同一功能可有多份问卷：状态按最新一份派生，多份时用气泡说明依据 -->
          <a-tooltip :content="t('ledger.form.statusNoteCount', { count: relatedSurveyCount(record) })" :disabled="relatedSurveyCount(record) < 2">
            <a-tag :color="visibleStatus(record) === 'completed' ? 'green' : visibleStatus(record) === 'in-progress' ? 'orangered' : 'gray'">{{ t(`ledger.statuses.${visibleStatus(record)}`) }}</a-tag>
          </a-tooltip>
        </template>
        <!-- 主数据状态 →「是否启用」开关（2026-10-29 用户裁决）：直接切换，默认创建即启用 -->
        <template #masterStatus="{ record }"><a-switch :model-value="isFunctionEnabled(record)" :loading="togglingIds.has(record.id)" :disabled="togglingIds.has(record.id)" :aria-label="t(`ledger.masterStatuses.${isFunctionEnabled(record) ? 'active' : 'disabled'}`)" @change="toggleEnabled(record, $event)" /></template>
        <template #relatedSurveys="{ record }">
          <!-- 2026-10-29 用户裁决：无关联问卷显示 0，同样可点击跳转工作台检索 -->
          <button type="button" class="ledger-survey-link" @click="openRelatedSurveys(record)">{{ relatedSurveyCount(record) }}</button>
        </template>
        <template #creator="{ record }">{{ localCreator(record.creator) }}</template>
        <template #createdAt="{ record }">{{ dateTime(record.createdAt) }}</template>
        <template #updatedAt="{ record }">{{ dateTime(record.updatedAt) }}</template>
        <template #actions="{ record }">
          <!-- 2026-10-29 用户裁决：操作列去掉停用/启用（改由「是否启用」开关承担） -->
          <div class="ledger-row-actions">
            <a-button type="text" size="mini" @click="openDrawer('detail', record)">{{ t('ledger.actions.detail') }}</a-button>
            <a-button type="text" size="mini" @click="openDrawer('edit', record)">{{ t('ledger.actions.edit') }}</a-button>
            <a-button type="text" status="danger" size="mini" @click="requestDelete(record)">{{ t('ledger.actions.delete') }}</a-button>
          </div>
        </template>
        <template #empty><a-empty :description="t(hasApplied ? 'ledger.table.noMatch' : 'ledger.table.empty')" /></template>
      </a-table>

      <!-- 分页栏：总条数 + 每页条数 + 箭头 + 页码 + 跳页（DESIGN.md · List footer contract） -->
      <nav class="ledger-pagination app-pagination" :aria-label="t('ledger.pagination.navigation')">
        <span class="pagination-total">{{ t('ledger.pagination.total', { count: filtered.length }) }}</span>
        <div class="pagination-pages">
          <a-select class="app-page-size" :model-value="pageSize" :aria-label="t('ledger.pagination.pageSizeAria')" @update:model-value="handlePageSizeChange">
            <a-option v-for="size in [10, 20, 50, 100, 200]" :key="size" :value="size">{{ t('ledger.pagination.perPage', { count: size }) }}</a-option>
          </a-select>
          <button class="pagination-arrow" type="button" :disabled="page === 1" :aria-label="t('ledger.pagination.previous')" @click="setPage(page - 1)"><IconLeft /></button>
          <button v-for="number in pageNumbers" :key="number" class="pagination-number" :class="{ active: page === number }" type="button" :aria-current="page === number ? 'page' : undefined" @click="setPage(number)">{{ number }}</button>
          <button class="pagination-arrow" type="button" :disabled="page === totalPages" :aria-label="t('ledger.pagination.next')" @click="setPage(page + 1)"><IconRight /></button>
        </div>
        <span class="pagination-jump-label">{{ t('ledger.pagination.jumpTo') }}</span>
        <a-input-number v-model="jumpPage" class="app-page-jump" :min="1" :max="totalPages" hide-button :input-attrs="{ 'aria-label': t('ledger.pagination.jumpTo') }" @press-enter="goToJumpPage" />
        <span class="pagination-total-pages">{{ t('ledger.pagination.totalPages', { count: totalPages }) }}</span>
      </nav>
    </div>

    <!-- 添加/编辑/详情抽屉：灰画布 + 白色分组卡片（DESIGN.md · Drawer 2026-10-25 更新） -->
    <a-drawer class="ledger-drawer" :visible="drawerOpen" :width="Math.min(800, viewportWidth - 16)" :mask-closable="drawerMode === 'detail'" :title="t(`ledger.form.${drawerMode === 'add' ? 'addTitle' : drawerMode === 'edit' ? 'editTitle' : 'detailTitle'}`)" @open="focusDrawer" @close="restoreDrawerFocus" @cancel="requestClose">
      <template v-if="drawerMode === 'detail'">
        <div class="ledger-drawer-group">
          <h2 class="ledger-section-heading">{{ t('ledger.form.basics') }}</h2>
          <!-- 2026-10-26 裁决：详情字段按「标签列 + 值列」行式布局，弃带边框描述表格 -->
          <div class="app-detail-list">
            <div v-for="key in (['platformName', 'fuliId', 'functionName', 'functionDescription', 'owner', 'developmentLocation', 'masterEcu', 'masterStatus', 'status', 'creator', 'createdAt', 'updatedAt'] as const)" :key="key" class="app-detail-row">
              <span class="app-detail-label">{{ t(key === 'owner' ? 'ledger.fields.responsibles' : `ledger.fields.${key}`) }}</span>
              <span class="app-detail-value">
                <template v-if="key === 'owner'"><div v-for="(person, index) in (detail ? responsibleDepartments(detail) : [])" :key="index">{{ person.name }} | {{ person.department }}</div></template>
                <template v-else-if="key === 'developmentLocation'">{{ detail && t(`ledger.locations.${detail.developmentLocation}`) }}</template>
                <a-tag v-else-if="key === 'status' && detail" :color="visibleStatus(detail) === 'completed' ? 'green' : visibleStatus(detail) === 'in-progress' ? 'orangered' : 'gray'">{{ t(`ledger.statuses.${visibleStatus(detail)}`) }}</a-tag>
                <a-tag v-else-if="key === 'masterStatus' && detail" :color="isFunctionEnabled(detail) ? 'green' : 'gray'">{{ t(`ledger.masterStatuses.${isFunctionEnabled(detail) ? 'active' : 'disabled'}`) }}</a-tag>
                <template v-else-if="key === 'creator'">{{ detail && localCreator(detail.creator) }}</template>
                <template v-else-if="key === 'createdAt' || key === 'updatedAt'">{{ detail && dateTime(detail[key]) }}</template>
                <template v-else>{{ (detail as unknown as Record<string, string> | null)?.[key] || '—' }}</template>
              </span>
            </div>
          </div>
        </div>
        <div class="ledger-drawer-group">
          <h2 class="ledger-section-heading">{{ t('ledger.form.subfunctions') }}</h2>
          <table v-if="detail?.subfunctions.length" class="ledger-detail-children">
            <thead><tr><th scope="col">{{ t('ledger.fields.subfunctions') }}</th><th scope="col">{{ t('ledger.fields.controller') }}</th></tr></thead>
            <tbody><tr v-for="(item, index) in detail.subfunctions" :key="index"><td>{{ item.name }}</td><td>{{ item.controllers.join('、') }}</td></tr></tbody>
          </table>
          <a-empty v-else :description="t('ledger.form.noSubfunctions')" />
        </div>
      </template>
      <a-form v-else ref="formRef" :model="form" :rules="rules" layout="vertical" scroll-to-first-error class="ledger-editor" @submit.prevent="submitForm">
        <div class="ledger-drawer-group">
          <h2 class="ledger-section-heading">{{ t('ledger.form.basics') }}</h2>
          <div class="ledger-form-grid">
            <!-- 平台名称：天枢「整车架构平台」下拉（编号-名称，2026-10-29），旧数据现值补入选项 -->
            <a-form-item field="platformName" :label="fieldLabel(t('ledger.fields.platformName'))" required>
              <a-select v-model="form.platformName" allow-clear :placeholder="t('ledger.form.selectPlaceholder', { field: t('ledger.fields.platformName') })">
                <a-option v-for="option in formPlatformOptions" :key="option" :value="option">{{ option }}</a-option>
              </a-select>
            </a-form-item>
            <a-form-item field="fuliId" :label="fieldLabel(t('ledger.fields.fuliId'))" required><a-input v-model="form.fuliId" :placeholder="t('ledger.form.inputPlaceholder', { field: t('ledger.fields.fuliId') })" :disabled="drawerMode === 'edit' && detail !== null && relatedSurveyCount(detail) > 0" :max-length="32" show-word-limit /></a-form-item>
            <a-form-item field="functionName" :label="fieldLabel(t('ledger.fields.functionName'))" required><a-input v-model="form.functionName" :placeholder="t('ledger.form.inputPlaceholder', { field: t('ledger.fields.functionName') })" :max-length="50" show-word-limit /></a-form-item>
            <a-form-item field="responsibles" :label="fieldLabel(t('ledger.fields.responsibles'))" required class="ledger-responsibles-form-item">
              <a-select v-model="selectedResponsibleKeys" multiple allow-search :max-tag-count="1" :trigger-props="{ contentClass: 'ledger-responsibles-dropdown' }" :placeholder="t('ledger.form.selectPlaceholder', { field: t('ledger.fields.responsibles') })">
                <!-- 2026-10-29 用户裁决：选项样式改为「头像 + 姓名 + 所属部门」两行结构 -->
                <a-option v-for="person in responsibleOptions" :key="responsibleKey(person)" :value="responsibleKey(person)" :label="`${person.name} | ${person.department}`">
                  <div class="ledger-responsible-person">
                    <a-avatar :size="28" class="ledger-responsible-avatar"><IconUser /></a-avatar>
                    <div class="ledger-responsible-person-info">
                      <span class="ledger-responsible-person-name">{{ person.name }}</span>
                      <span class="ledger-responsible-person-department">{{ t('ledger.form.departmentValue', { department: person.department }) }}</span>
                    </div>
                  </div>
                </a-option>
              </a-select>
            </a-form-item>
            <a-form-item field="developmentLocation" :label="fieldLabel(t('ledger.fields.developmentLocation'))" required><a-select v-model="form.developmentLocation" :placeholder="t('ledger.filters.select')"><a-option value="china">{{ t('ledger.locations.china') }}</a-option><a-option value="germany">{{ t('ledger.locations.germany') }}</a-option></a-select></a-form-item>
            <!-- master ECU：天枢「零部件」下拉（编号-名称，2026-10-29），选中后带入子功能与控制器回显 -->
            <a-form-item field="masterEcu" :label="fieldLabel(t('ledger.fields.masterEcu'))">
              <a-select v-model="form.masterEcu" allow-clear :placeholder="t('ledger.form.selectPlaceholder', { field: t('ledger.fields.masterEcu') })" @change="onMasterEcuChange">
                <a-option v-for="option in formMasterEcuOptions" :key="option" :value="option">{{ option }}</a-option>
              </a-select>
            </a-form-item>
            <a-form-item field="functionDescription" :label="fieldLabel(t('ledger.fields.functionDescription'))" class="ledger-form-item--full"><a-textarea v-model="form.functionDescription" :placeholder="t('ledger.form.inputPlaceholder', { field: t('ledger.fields.functionDescription') })" :max-length="200" show-word-limit :auto-size="{ minRows: 2, maxRows: 4 }" /></a-form-item>
          </div>
        </div>
        <div class="ledger-drawer-group">
          <h2 class="ledger-section-heading">{{ t('ledger.form.subfunctions') }}</h2>
          <!-- 无数据项时不显示表头（2026-10-29 用户裁决）：表格整块随行数显隐 -->
          <div v-if="form.subfunctions.length" class="ledger-child-table-scroll">
            <table class="ledger-child-table">
              <colgroup><col /><col /><col class="ledger-child-action-col" /></colgroup>
              <thead><tr>
                <th scope="col"><span class="ledger-required-mark" aria-hidden="true">*</span>{{ t('ledger.form.subfunctionName') }}</th>
                <th scope="col"><span class="ledger-required-mark" aria-hidden="true">*</span>{{ t('ledger.form.controller') }}</th>
                <th scope="col">{{ t('ledger.fields.actions') }}</th>
              </tr></thead>
              <tbody>
                <tr v-for="(item, index) in form.subfunctions" :key="index">
                  <td><a-form-item :field="`subfunctions.${index}.name`" hide-label :rules="[{ required: true, message: t('ledger.form.required', { field: t('ledger.form.subfunctionName') }) }]" required><a-input v-model="item.name" :input-attrs="{ 'aria-label': t('ledger.form.rowField', { row: index + 1, field: t('ledger.form.subfunctionName') }) }" :placeholder="t('ledger.form.namePlaceholder')" :max-length="50" show-word-limit /></a-form-item></td>
                  <!-- 1:N（2026-10-29）：一个子功能可配置多个控制器，逐个输入框维护 -->
                  <td>
                    <div class="ledger-controller-list">
                      <div v-for="(controller, cIndex) in item.controllers" :key="cIndex" class="ledger-controller-row">
                        <a-form-item :field="`subfunctions.${index}.controllers.${cIndex}`" hide-label :rules="[{ required: true, message: t('ledger.form.required', { field: t('ledger.form.controller') }) }]" required>
                          <a-input v-model="item.controllers[cIndex]" :input-attrs="{ 'aria-label': t('ledger.form.controllerField', { row: index + 1, index: cIndex + 1 }) }" :placeholder="t('ledger.form.controllerPlaceholder')" :max-length="50" show-word-limit />
                        </a-form-item>
                        <a-button v-if="item.controllers.length > 1" type="text" status="danger" size="mini" class="ledger-remove-controller" :aria-label="t('ledger.form.removeController', { row: index + 1, index: cIndex + 1 })" @click="item.controllers.splice(cIndex, 1)"><template #icon><IconDelete :size="14" /></template></a-button>
                      </div>
                    </div>
                    <a-button type="text" size="mini" class="ledger-add-controller" @click="item.controllers.push('')"><template #icon><IconPlus :size="14" /></template>{{ t('ledger.form.addController') }}</a-button>
                  </td>
                  <!-- 操作列（2026-10-29 用户裁决）：「−」删除本行子功能、「+」在其后新增一行 -->
                  <td>
                    <div class="ledger-child-actions">
                      <a-button type="text" size="mini" status="danger" class="ledger-child-action ledger-child-action--remove" :aria-label="t('ledger.form.removeRow', { row: index + 1 })" @click="removeSubfunction(index)"><template #icon><IconMinusCircle :size="18" /></template></a-button>
                      <a-button type="text" size="mini" class="ledger-child-action ledger-child-action--add" :aria-label="t('ledger.actions.addSubfunction')" @click="addSubfunction(index)"><template #icon><IconPlusCircle :size="18" /></template></a-button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <!-- 空态：无子功能时不显示表头，仅保留一个添加入口（底部按钮已移除） -->
          <div v-else class="ledger-child-empty">
            <span class="ledger-child-empty-text">{{ t('ledger.form.noSubfunctions') }}</span>
            <a-button type="text" size="mini" class="ledger-child-action ledger-child-action--add" :aria-label="t('ledger.actions.addSubfunction')" @click="addSubfunction()"><template #icon><IconPlus :size="16" /></template>{{ t('ledger.actions.addSubfunction') }}</a-button>
          </div>
        </div>
      </a-form>
      <template #footer><a-button class="app-btn-neutral" @click="requestClose">{{ t(drawerMode === 'detail' ? 'ledger.actions.close' : 'ledger.actions.cancel') }}</a-button><a-button v-if="drawerMode !== 'detail'" type="primary" :loading="saving" @click="submitForm">{{ t('ledger.actions.save') }}</a-button></template>
    </a-drawer>

    <a-modal :visible="Boolean(deleteTarget)" :width="456" :mask-closable="!deleteBusy" :title="t('ledger.actions.confirmDelete')" @cancel="!deleteBusy && (deleteTarget = null)">
      <p>{{ t('ledger.form.deleteConfirm', { name: deleteTarget?.functionName ?? '' }) }}</p>
      <template #footer><a-button class="app-btn-neutral" :disabled="deleteBusy" @click="deleteTarget = null">{{ t('ledger.actions.cancel') }}</a-button><a-button type="primary" status="danger" :loading="deleteBusy" @click="confirmDelete">{{ t('ledger.actions.confirmDelete') }}</a-button></template>
    </a-modal>

    <!-- 导出确认弹窗：确认后进入任务中心「下载任务」 -->
    <a-modal :visible="exportOpen" :width="456" :mask-closable="!exporting" :title="t('ledger.exportNotice.title')" @cancel="!exporting && (exportOpen = false)">
      <div class="ledger-export-notice">
        <IconExclamationCircle class="ledger-export-icon" />
        <div class="ledger-export-text">
          <p>{{ t('ledger.exportNotice.line1') }}</p>
          <p>{{ t('ledger.exportNotice.line2') }}</p>
        </div>
      </div>
      <template #footer><a-button class="app-btn-neutral" :disabled="exporting" @click="exportOpen = false">{{ t('ledger.exportNotice.cancel') }}</a-button><a-button type="primary" :loading="exporting" @click="confirmExport">{{ t('ledger.exportNotice.confirm') }}</a-button></template>
    </a-modal>

    <!-- 批量导入抽屉：上传拖拽区 + 注意事项同组（注意事项子块 var(--app-import-help-surface)、16px 内边距，下载模版在子块外） -->
    <a-drawer class="ledger-drawer" :visible="importOpen" :width="Math.min(560, viewportWidth - 24)" :mask-closable="!importing" :title="t('ledger.import.title')" @cancel="!importing && (importOpen = false)">
      <div class="ledger-drawer-group">
        <div class="ledger-import-dropzone" role="button" tabindex="0" :aria-label="t('ledger.import.file')" @click="fileInput?.click()" @keydown.enter.prevent="fileInput?.click()" @keydown.space.prevent="fileInput?.click()" @dragover.prevent @drop.prevent="onDropFile">
          <IconFolder class="ledger-import-folder" />
          <p v-if="selectedFile" class="ledger-import-file-name" :title="selectedFile.name">{{ selectedFile.name }}</p>
          <p v-else class="ledger-import-hint">{{ t('ledger.import.uploadHint') }}</p>
          <a-button type="primary" :loading="importingFile" @click.stop="fileInput?.click()">{{ t(selectedFile ? 'ledger.import.reuploadButton' : 'ledger.import.uploadButton') }}</a-button>
          <input ref="fileInput" type="file" accept=".xlsx,.csv" class="ledger-file-input" :aria-label="t('ledger.import.file')" @change="onFileChange" />
        </div>
        <template v-if="parsed">
          <p class="ledger-import-line">{{ t('ledger.import.preview', { count: parsed.items.length }) }}</p>
          <p v-if="parsed.failures.length" class="ledger-import-error">{{ t('ledger.import.issues', { count: parsed.failures.length }) }} <a-button type="text" @click="downloadErrors">{{ t('ledger.actions.errors') }}</a-button></p>
        </template>
        <div class="ledger-import-notes">
          <p class="ledger-import-notes-title">{{ t('ledger.import.notesTitle') }}</p>
          <p v-for="(note, index) in importNotes" :key="index" class="ledger-import-note">{{ t('ledger.import.notePrefix', { index: index + 1 }) }}{{ note }}</p>
        </div>
        <a-link class="ledger-import-template" :loading="preparingTemplate" @click="downloadTemplate">{{ t('ledger.actions.template') }}</a-link>
      </div>
      <template #footer><a-button class="app-btn-neutral" :disabled="importing" @click="importOpen = false">{{ t('ledger.actions.cancel') }}</a-button><a-button type="primary" :loading="importing" :disabled="!parsed?.items.length" @click="confirmImport">{{ t('ledger.import.submit') }}</a-button></template>
    </a-drawer>
  </div>
</template>

<style scoped>
.ledger-page { display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: calc(100dvh - 88px); font-size: 14px; }
.ledger-filter-panel { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.ledger-list { flex: 1; min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.ledger-toolbar, .ledger-toolbar-actions, .ledger-row-actions { display: flex; align-items: center; gap: 12px; }
.ledger-toolbar { justify-content: space-between; flex-wrap: wrap; margin-bottom: 16px; }
.ledger-toolbar-title { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.ledger-toolbar-actions { flex-wrap: wrap; }

/* 筛选条：字段「标签+控件」作贴内容单元换行排布（2026-10-25 裁决）——
   标签左缘与控件右缘均不留空白，单元内 8px 间距，单元间统一 16px 行/列间距；
   控件统一 200px、字段与控件同排不上下换行；
   查询/重置/筛选设置按钮以同样 16px 间距紧跟最后一个筛选条件。 */
.ledger-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; min-width: 0; }
.ledger-filter-field { display: inline-grid; grid-template-columns: max-content minmax(0, 200px); gap: 8px; align-items: center; min-width: 0; }
.ledger-filter-field label { color: var(--color-text-2); text-align: right; line-height: 22px; white-space: nowrap; }
.ledger-filter-field :deep(.app-filter-control) { width: 200px; max-width: 100%; min-width: 0; }
.ledger-filter-actions { display: flex; align-items: center; gap: 8px; }
.ledger-icon-button { display: inline-grid; width: 32px; height: 32px; padding: 0; place-items: center; }

/* 状态页签（2026-11-05 由列表工具条移入筛选面板顶部，与工作台同形态）：
   下划线式文字页签（二轮裁决）——无边框无底色，选中项主色文字 + 底部 2px 主色下划线 */
.ledger-status-tabs { display: flex; flex-wrap: wrap; gap: 24px; }
.ledger-status-tab { position: relative; height: 32px; margin-left: 0; padding: 0; border: 0; border-radius: 0; background: transparent; color: var(--color-text-2); font: inherit; line-height: 30px; white-space: nowrap; cursor: pointer; }
.ledger-status-tab:hover { color: var(--app-accent); }
.ledger-status-tab.active { color: var(--app-accent); font-weight: 600; }
.ledger-status-tab.active::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; border-radius: 1px; background: var(--app-accent); }
.ledger-status-tab:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.ledger-status-count { margin-left: 2px; font-weight: 400; font-variant-numeric: tabular-nums; }
.ledger-filter-divider { height: 0; margin: 12px 0 16px; border: 0; border-top: 1px solid var(--app-divider); }
.ledger-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
.ledger-table { min-width: 0; }
.ledger-table :deep(.arco-table-th) { font-weight: 600; }
.ledger-table :deep(.arco-table-td) { border-bottom: 1px solid var(--app-divider); }
.ledger-row-actions { gap: 8px; white-space: nowrap; }
.ledger-row-actions :deep(.arco-btn) { padding: 0; }
.ledger-responsible-cell { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.ledger-responsible-primary { display: flex; flex-direction: column; min-width: 0; line-height: 20px; }
.ledger-responsible-primary > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ledger-responsible-department { color: var(--color-text-2); font-size: 12px; }
.ledger-responsible-more { flex: none; padding: 2px 4px; border: 0; border-radius: 2px; background: transparent; color: var(--app-accent); cursor: pointer; font: inherit; }
.ledger-responsible-more:hover, .ledger-responsible-more:focus-visible { background: var(--color-primary-light-1); }
:global(.ledger-responsible-popover .arco-popover-content) { padding: 8px 12px; }
.ledger-responsible-list { display: flex; flex-direction: column; gap: 8px; min-width: 180px; margin: 0; padding: 0; list-style: none; }
.ledger-responsible-list li { display: flex; flex-direction: column; line-height: 20px; }
.ledger-responsible-list li span:last-child { color: var(--color-text-2); font-size: 12px; }
.ledger-name-link { border: 0; padding: 0; background: transparent; color: var(--color-text-1); cursor: pointer; font: inherit; }
.ledger-name-link:hover, .ledger-name-link:focus-visible { color: var(--app-accent); }
/* 关联问卷数值：hover 高亮，点击跳转问卷工作台 */
.ledger-survey-link { min-width: 24px; border: 0; padding: 2px 8px; border-radius: 2px; background: transparent; color: var(--color-text-1); cursor: pointer; font: inherit; font-variant-numeric: tabular-nums; }
.ledger-survey-link:hover, .ledger-survey-link:focus-visible { color: var(--app-accent); background: var(--color-primary-light-1); }

/* 分页栏：右对齐，总条数 + 每页条数 + 箭头 + 页码 + 跳页 */
.ledger-pagination { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 16px; color: var(--color-text-2); }
.ledger-pagination .pagination-total { margin-right: 8px; color: var(--color-text-3); font-size: 14px; line-height: 22px; }
.ledger-pagination .pagination-pages { display: flex; align-items: center; gap: 8px; margin-right: 8px; }
.ledger-pagination .pagination-jump-label, .ledger-pagination .pagination-total-pages { color: var(--color-text-3); font-size: 14px; line-height: 22px; }

.ledger-load-error { padding: 40px 16px; text-align: center; color: var(--app-color-danger); }

/* 抽屉内容分组：白色卡片（表面规则见 global.css 的 .ledger-drawer） */
.ledger-drawer-group { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 2px; background: var(--app-surface); }
/* 表单包裹层：添加/编辑模式下区块A（基本信息）与区块B（子功能与控制器）
   之间 16px 间距；区块距抽屉内容区上下左右 16px 由 body 的 16px 内边距提供 */
.ledger-editor { display: flex; flex-direction: column; gap: 16px; }
.ledger-section-heading { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }
.ledger-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.ledger-form-grid :deep(.arco-form-item:nth-last-child(-n + 2)) { margin-bottom: 0; }
/* 功能描述为主数据说明，独占整行（2026-10-27 方案 A） */
.ledger-form-item--full { grid-column: 1 / -1; }
.ledger-responsibles-form-item { grid-column: 2; }
/* 负责人下拉选项（2026-10-29 用户裁决）：头像 + 姓名 + 所属部门两行；下拉弹层挂载在
   body 下，须用 :global 作用到 .ledger-responsibles-dropdown 内部 */
/* 负责人下拉选项区块：高度 46px、上下内边距 5px（2026-10-29 用户指定）；
   多选态选项带 .arco-select-option-multiple，一并覆盖；flex:none + min-height 防止列表
   在 200px 高度内被 flex 压缩（否则实测会被压到 41px） */
:global(.ledger-responsibles-dropdown .arco-select-option),
:global(.ledger-responsibles-dropdown .arco-select-option-multiple) {
  box-sizing: border-box;
  flex: none;
  height: 46px;
  min-height: 46px;
  padding-top: 5px;
  padding-bottom: 5px;
}
:global(.ledger-responsibles-dropdown .arco-select-option-checkbox) { width: 100%; }
:global(.ledger-responsibles-dropdown .arco-checkbox-label) { flex: 1; min-width: 0; }
:global(.ledger-responsibles-dropdown .ledger-responsible-person) { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; }
:global(.ledger-responsibles-dropdown .ledger-responsible-avatar) { flex: none; background: var(--color-primary-light-2); color: var(--app-accent); }
:global(.ledger-responsibles-dropdown .ledger-responsible-person-info) { display: flex; flex-direction: column; min-width: 0; line-height: 18px; }
:global(.ledger-responsibles-dropdown .ledger-responsible-person-name) { color: var(--color-text-1); font-size: 14px; }
:global(.ledger-responsibles-dropdown .ledger-responsible-person-department) { color: var(--color-text-3); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ledger-child-table-scroll { max-width: 100%; overflow-x: auto; }
.ledger-child-table { width: 100%; min-width: 560px; border-collapse: collapse; table-layout: fixed; text-align: left; }
.ledger-child-action-col { width: 88px; }
.ledger-child-table th, .ledger-child-table td { padding: 8px 12px; border-bottom: 1px solid var(--app-divider); }
.ledger-child-table th { background: var(--color-fill-2); font-weight: 600; line-height: 22px; white-space: nowrap; }
.ledger-child-table td { background: var(--app-surface); vertical-align: top; }
.ledger-child-table :deep(.arco-form-item) { margin-bottom: 0; }
.ledger-child-table :deep(.arco-input-wrapper) { width: 100%; }
.ledger-required-mark { margin-right: 2px; color: var(--app-color-danger); }
/* 子功能操作列（2026-10-29）：− 删除本行 / + 新增一行，均为图标按钮 */
.ledger-child-actions { display: flex; align-items: center; gap: 4px; margin-top: 4px; }
.ledger-child-action { flex: none; padding: 0 4px; }
.ledger-child-action--add { color: var(--app-accent); }
.ledger-child-empty { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px dashed var(--app-control-border); border-radius: 2px; }
.ledger-child-empty-text { color: var(--color-text-3); line-height: 22px; }
/* 1:N 控制器（2026-10-29）：单元格内多个控制器纵向排列，逐行输入 + 删除 + 添加 */
.ledger-controller-list { display: flex; flex-direction: column; gap: 8px; }
.ledger-controller-row { display: flex; align-items: flex-start; gap: 4px; }
.ledger-controller-row :deep(.arco-form-item) { flex: 1; min-width: 0; margin-bottom: 0; }
.ledger-remove-controller { flex: none; margin-top: 4px; }
.ledger-add-controller { margin-top: 4px; padding: 0 4px; color: var(--app-accent); }
.ledger-detail-children { width: 100%; border-collapse: collapse; table-layout: fixed; text-align: left; }
.ledger-detail-children th, .ledger-detail-children td { padding: 10px 12px; border-bottom: 1px solid var(--app-divider); overflow-wrap: anywhere; }
.ledger-detail-children th { font-weight: 600; background: var(--color-fill-2); }
.ledger-detail-children td { background: var(--app-surface); }

/* 导出确认弹窗 */
.ledger-export-notice { display: flex; align-items: flex-start; gap: 12px; }
.ledger-export-icon { flex: none; margin-top: 2px; color: var(--app-color-warning); font-size: 24px; }
.ledger-export-text p { margin: 0 0 4px; line-height: 22px; }
.ledger-export-text p:last-child { margin-bottom: 0; }

/* 批量导入抽屉 */
.ledger-import-dropzone { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; min-height: 180px; padding: 24px 16px; border: 1px dashed var(--app-control-border); border-radius: 4px; background: var(--app-page); cursor: pointer; text-align: center; }
.ledger-import-dropzone:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.ledger-import-folder { color: var(--app-color-primary); font-size: 48px; }
.ledger-import-hint, .ledger-import-file-name { max-width: 100%; margin: 0; color: var(--color-text-1); line-height: 24px; overflow-wrap: anywhere; }
.ledger-import-file-name { font-size: 18px; }
.ledger-import-line { margin: 0; line-height: 22px; }
/* 注意事项子块：var(--app-import-help-surface) 浅蓝底（2026-10-25 用户裁决），上下左右 16px 内边距；下载模版链接位于子块之外 */
.ledger-import-notes { display: flex; flex-direction: column; gap: 4px; padding: 16px; border-radius: 2px; background: var(--app-import-help-surface); }
:global(body[arco-theme='dark'] .ledger-import-notes) { background: var(--color-fill-2); }
.ledger-import-notes-title { margin: 0; font-weight: 600; line-height: 22px; }
.ledger-import-note { margin: 0; color: var(--color-text-2); line-height: 22px; }
.ledger-import-template { align-self: flex-start; }
.ledger-file-input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; }
.ledger-import-error { margin: 0; color: var(--app-color-danger); }

@media (max-width: 700px) { .ledger-form-grid { grid-template-columns: minmax(0, 1fr); } .ledger-form-grid :deep(.arco-form-item:nth-last-child(2)) { margin-bottom: 20px; } .ledger-responsibles-form-item { grid-column: 1; } .ledger-toolbar-actions { width: 100%; } }
</style>
