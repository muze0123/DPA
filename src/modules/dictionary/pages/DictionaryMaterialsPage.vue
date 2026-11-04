<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Message, Modal, type TableColumnData } from '@arco-design/web-vue';
import { IconDownload, IconExclamationCircle, IconInfoCircle, IconLeft, IconMore, IconPlus, IconRefresh, IconRight, IconSearch } from '@arco-design/web-vue/es/icon';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useTaskCenterStore } from '../../task-center/stores/taskCenter';
import { ruleSet } from '../../compliance/data/rules';
import {
  BASIS_CODES, FLAG_CODES, PHASE_CODES, REVIEW_CODES, dictionary, materials, nextId, persistLibrary,
  type BasisCode, type DictionaryItem, type FlagCode, type MaterialItem, type PhaseCode, type ReviewCode,
} from '../data/library';

type Tab = 'dictionary' | 'materials';
type Editor = { kind: Tab; id: string | null };
const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();
/**
 * 视图来源（2026-11-01 第二轮）：数据材料一级菜单下「数据字典」「材料清单」是两个二级菜单，
 * 各自独立路由并把视图作为 props 传入（/data-materials/dictionary｜/materials），
 * 因此**页面内不再有顶部页签**，切页只走左侧菜单；老链接的 ?tab= 仍兼容。
 */
const props = defineProps<{ tab?: Tab }>();
const tab = ref<Tab>(props.tab ?? (route.query.tab === 'materials' || typeof route.query.clause === 'string' ? 'materials' : 'dictionary'));
const search = ref('');
const appliedSearch = ref('');
const review = ref<ReviewCode | ''>('');
const appliedReview = ref<ReviewCode | ''>('');
const phase = ref<PhaseCode | ''>('');
const appliedPhase = ref<PhaseCode | ''>('');
const basis = ref<BasisCode | ''>('');
const appliedBasis = ref<BasisCode | ''>('');
const page = ref(1);
const pageSize = ref(10);
const jumpPage = ref(1);
const editor = ref<Editor | null>(null);
const drawerOpen = ref(false);
const saving = ref(false);
const error = ref('');
const exportOpen = ref(false);
const exporting = ref(false);
const trigger = ref<HTMLElement | null>(null);
const original = ref('');
const viewportWidth = ref(window.innerWidth);
/** 抽屉内只有一个表单实例（字典/材料按 kind 互斥渲染），因此共用一个 ref */
const formRef = ref<{ validate: () => Promise<Record<string, unknown> | undefined>; clearValidate: () => void; scrollToField: (field: string) => void } | null>(null);

const emptyFlags = () => Object.fromEntries(FLAG_CODES.map((key) => [key, null])) as Record<FlagCode, boolean | null>;
const dictForm = reactive<Omit<DictionaryItem, 'id' | 'review'>>({ name: '', alias: '', level: '', category: '', flags: emptyFlags() });
const materialForm = reactive<Omit<MaterialItem, 'id'>>({ name: '', phase: 'before', basis: 'chapter9', form: '', method: '', clauses: [] });
const sourceClauses = computed(() => ruleSet.clauses);
const clauseMap = computed(() => new Map(sourceClauses.value.map((clause) => [clause.code, clause])));
const clauseCodes = computed(() => sourceClauses.value.map((clause) => clause.code));
/* 跳转带参（?clause=）直接落入「关联条款」筛选控件并触发查询，不另设条件标签（2026-10-27 裁决） */
const clause = ref('');
const appliedClause = ref('');
const matching = computed(() => {
  const query = appliedSearch.value.toLocaleLowerCase();
  if (tab.value === 'dictionary') return dictionary.filter((item) =>
    (!appliedReview.value || item.review === appliedReview.value) &&
    (!query || [item.name, item.alias, item.id].some((value) => value.toLocaleLowerCase().includes(query))));
  return materials.filter((item) =>
    (!appliedPhase.value || item.phase === appliedPhase.value) &&
    (!appliedBasis.value || item.basis === appliedBasis.value) &&
    (!appliedClause.value || item.clauses.includes(appliedClause.value)) &&
    (!query || [item.name, item.id, ...item.clauses].some((value) => value.toLocaleLowerCase().includes(query))));
});
const visibleRows = computed(() => matching.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
const dictionaryColumns = computed<TableColumnData[]>(() => [
  { title: t('library.fields.name'), dataIndex: 'name', width: 190 },
  { title: t('library.fields.alias'), dataIndex: 'alias', width: 170, ellipsis: true, tooltip: true },
  { title: t('library.fields.level'), dataIndex: 'level', width: 140 },
  { title: t('library.fields.category'), dataIndex: 'category', width: 160 },
  { title: t('library.fields.attributes'), slotName: 'attributes', width: 200 },
  { title: t('library.fields.review'), slotName: 'review', width: 135 },
  { title: t('library.fields.actions'), slotName: 'actions', width: 172, fixed: 'right' },
]);
const materialColumns = computed<TableColumnData[]>(() => [
  { title: t('library.fields.material'), dataIndex: 'name', width: 220 },
  { title: t('library.fields.phase'), slotName: 'phase', width: 160 },
  { title: t('library.fields.basis'), slotName: 'basis', width: 210 },
  { title: t('library.fields.form'), dataIndex: 'form', width: 135 },
  { title: t('library.fields.clauses'), slotName: 'clauses', width: 240 },
  { title: t('library.fields.actions'), slotName: 'actions', width: 140, fixed: 'right' },
]);
const totalPages = computed(() => Math.max(1, Math.ceil(matching.value.length / pageSize.value)));
const pageNumbers = computed(() => {
  const count = Math.min(totalPages.value, 5);
  const start = Math.min(Math.max(page.value - Math.floor(count / 2), 1), totalPages.value - count + 1);
  return Array.from({ length: count }, (_, index) => start + index);
});
function setPage(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > totalPages.value) return;
  page.value = value;
  jumpPage.value = value;
}
function goToJumpPage() {
  if (!Number.isInteger(Number(jumpPage.value)) || Number(jumpPage.value) < 1 || Number(jumpPage.value) > totalPages.value) {
    Message.warning(t('library.pagination.invalidPage'));
    jumpPage.value = page.value;
    return;
  }
  setPage(Number(jumpPage.value));
}
function changePageSize(value: unknown) {
  const size = Number(value);
  if (![10, 20, 50, 100, 200].includes(size)) return;
  pageSize.value = size;
  setPage(1);
}

/* 跳转带参（?clause=）：参数写入「关联条款」控件（草稿 + 已应用）并即时查询，随后从地址收编，
   之后由控件自身承载该条件（清空控件 / 重置即清除），不再有独立的条件标签区域。
   收编动作同时把路径切到「材料清单」二级页（2026-11-01：路径即页签） */
watch(() => route.query.clause, (value) => {
  if (typeof value !== 'string' || !clauseMap.value.has(value)) return;
  clause.value = value;
  appliedClause.value = value;
  tab.value = 'materials';
  setPage(1);
  const target = props.tab ? '/data-materials/materials' : route.path;
  void router.replace({ path: target, query: { ...route.query, clause: undefined, tab: undefined } });
}, { immediate: true });

watch(() => route.query, () => {
  if (route.query.tab === 'dictionary' || route.query.tab === 'materials') tab.value = route.query.tab;
  setPage(1);
});
/** 菜单点击同一页面的另一个二级项 → 路由不变实现、只换 props.tab，这里回灌页签 */
watch(() => props.tab, (value) => {
  if (value && value !== tab.value) tab.value = value;
});
watch(tab, (value) => {
  setPage(1);
  search.value = ''; appliedSearch.value = '';
  // 条款深链的收编由上面的 watch 统一完成（含路径切换），此处不重复导航
  if (typeof route.query.clause === 'string') return;
  // 路径即页签：二级菜单驱动的页面用路径切换，老链接（?tab=）保留 query 方式
  if (props.tab) {
    const path = `/data-materials/${value}`;
    if (route.path !== path) {
      const query = { ...route.query };
      delete query.tab;
      void router.replace({ path, query });
    }
    return;
  }
  if (route.query.tab !== value) void router.replace({ query: { tab: value } });
});
watch(matching, () => { if (page.value > totalPages.value) setPage(totalPages.value); });

/** 抽屉宽度随视口收敛，保留 16px 画布余量（DESIGN.md · Drawer 尺寸） */
function onResize() { viewportWidth.value = window.innerWidth; }
onMounted(() => window.addEventListener('resize', onResize));
onBeforeUnmount(() => window.removeEventListener('resize', onResize));

function applyFilters() {
  appliedSearch.value = search.value.trim();
  appliedReview.value = review.value;
  appliedPhase.value = phase.value;
  appliedBasis.value = basis.value;
  appliedClause.value = clause.value;
  setPage(1);
}
function resetFilters() {
  search.value = ''; review.value = ''; phase.value = ''; basis.value = ''; clause.value = '';
  applyFilters();
}
const drawerTitle = computed(() => {
  if (!editor.value) return '';
  const key = editor.value.kind === 'materials'
    ? (editor.value.id ? 'library.editMaterial' : 'library.addMaterial')
    : (editor.value.id ? 'library.editName' : 'library.addName');
  return t(key);
});
/** 已审核记录被再次编辑时会回到待核验，需在抽屉内明示，避免误以为审核结论仍有效 */
const editingApproved = computed(() => editor.value?.kind === 'dictionary' &&
  dictionary.some((item) => item.id === editor.value?.id && item.review === 'approved'));

function openEditor(kind: Tab, record?: DictionaryItem | MaterialItem) {
  trigger.value = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  editor.value = { kind, id: record?.id ?? null };
  error.value = '';
  if (kind === 'dictionary') {
    const item = record as DictionaryItem | undefined;
    Object.assign(dictForm, { name: item?.name ?? '', alias: item?.alias ?? '', level: item?.level ?? '', category: item?.category ?? '', flags: item ? { ...item.flags } : emptyFlags() });
  } else {
    const item = record as MaterialItem | undefined;
    Object.assign(materialForm, { name: item?.name ?? '', phase: item?.phase ?? 'before', basis: item?.basis ?? 'chapter9', form: item?.form ?? '', method: item?.method ?? '', clauses: item ? [...item.clauses] : [] });
  }
  original.value = JSON.stringify(kind === 'dictionary' ? dictForm : materialForm);
  drawerOpen.value = true;
  void nextTick(() => formRef.value?.clearValidate());
}
const dirty = computed(() => editor.value && original.value !== JSON.stringify(editor.value.kind === 'dictionary' ? dictForm : materialForm));
/** 抽屉打开后聚焦第一个字段；无输入项时落到「取消」，保证键盘用户进入抽屉即可退出 */
function focusDrawer() {
  void nextTick(() => {
    const drawer = document.querySelector('.library-drawer');
    (drawer?.querySelector<HTMLInputElement>('.library-form input')
      ?? drawer?.querySelector<HTMLButtonElement>('.arco-drawer-footer button'))?.focus();
  });
}
function closeEditor() {
  drawerOpen.value = false;
  editor.value = null;
  error.value = '';
  void nextTick(() => trigger.value?.focus());
}
function requestClose() {
  if (!dirty.value) { closeEditor(); return; }
  Modal.confirm({ title: t('library.discardTitle'), content: t('library.discardBody'),
    okText: t('library.discard'), cancelText: t('library.cancel'), onOk: closeEditor });
}
function commit(nextDictionary: DictionaryItem[], nextMaterials: MaterialItem[], notice: string) {
  if (!persistLibrary({ dictionary: nextDictionary, materials: nextMaterials })) {
    error.value = t('library.storageError');
    Message.error(error.value);
    return false;
  }
  Message.success(t(notice));
  return true;
}
function flagChoice(key: FlagCode) {
  const value = dictForm.flags[key];
  return value === null ? 'unknown' : value ? 'yes' : 'no';
}
function setFlag(key: FlagCode, value: unknown) {
  dictForm.flags[key] = value === 'unknown' ? null : value === 'yes';
}
/** 必填与业务校验：空白串按未填处理；重复名与类别词错误定位到名称字段本身 */
type LibraryRule = {
  required?: boolean;
  message?: string;
  validator?: (value: unknown, callback: (error?: string) => void) => void;
};
function requiredRule(field: string): LibraryRule[] {
  return [{ required: true, message: t('library.requiredField', { field }) }];
}
const formRules = computed<Record<string, LibraryRule[]>>(() => {
  const dictionaryName: LibraryRule[] = [
    { required: true, message: t('library.requiredField', { field: t('library.fields.name') }) },
    { validator: (value, callback) => {
      const name = typeof value === 'string' ? value.trim() : '';
      if (!name) { callback(t('library.requiredField', { field: t('library.fields.name') })); return; }
      if (['个人信息', '敏感个人信息', '座舱数据', '重要数据', '汽车数据'].includes(name)) { callback(t('library.categoryRejected')); return; }
      if (dictionary.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase() && item.id !== editor.value?.id)) {
        callback(t('library.duplicateName')); return;
      }
      callback();
    } },
  ];
  const materialName: LibraryRule[] = [
    { required: true, message: t('library.requiredField', { field: t('library.fields.material') }) },
    { validator: (value, callback) => {
      const name = typeof value === 'string' ? value.trim() : '';
      if (!name) { callback(t('library.requiredField', { field: t('library.fields.material') })); return; }
      if (materials.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase() && item.id !== editor.value?.id)) {
        callback(t('library.duplicateMaterial')); return;
      }
      callback();
    } },
  ];
  if (editor.value?.kind === 'materials') {
    return { name: materialName, phase: requiredRule(t('library.fields.phase')), basis: requiredRule(t('library.fields.basis')) } as Record<string, LibraryRule[]>;
  }
  return { name: dictionaryName, level: requiredRule(t('library.fields.level')), category: requiredRule(t('library.fields.category')) };
});
async function save() {
  if (!editor.value || saving.value) return;
  error.value = '';
  const errors = await formRef.value?.validate();
  if (errors) { formRef.value?.scrollToField(Object.keys(errors)[0]); return; }
  if (editor.value.kind === 'dictionary') {
    const item: DictionaryItem = {
      id: editor.value.id ?? nextId('D', dictionary), name: dictForm.name.trim(),
      level: dictForm.level.trim(), alias: dictForm.alias.trim(), category: dictForm.category.trim(),
      flags: { ...dictForm.flags }, review: 'pending',
    };
    const next = editor.value.id ? dictionary.map((row) => row.id === item.id ? item : row) : [item, ...dictionary];
    saving.value = true;
    if (commit(next, [...materials], 'library.savedPending')) closeEditor();
  } else {
    if (materialForm.clauses.some((code) => !clauseMap.value.has(code))) { Message.error(t('library.invalidClause')); return; }
    const item: MaterialItem = {
      id: editor.value.id ?? nextId('M', materials), name: materialForm.name.trim(), phase: materialForm.phase, basis: materialForm.basis,
      form: materialForm.form.trim(), method: materialForm.method.trim(), clauses: [...new Set(materialForm.clauses)],
    };
    // 新建项默认置顶（2026-10-27），与「数据字典」页签的写入顺序保持一致
    const next = editor.value.id ? materials.map((row) => row.id === item.id ? item : row) : [item, ...materials];
    saving.value = true;
    if (commit([...dictionary], next, 'library.savedLocal')) closeEditor();
  }
  saving.value = false;
}
/* 审核通过 / 拒绝：DESIGN 弹窗（456px，点名校验目标）；通过有门禁——级别、类别与八项属性须全部核定 */
const approveTarget = ref<DictionaryItem | null>(null);
const rejectTarget = ref<DictionaryItem | null>(null);
const rejectReason = ref('');
const rejectError = ref('');
function approve(item: DictionaryItem) {
  if (!item.level || !item.category || FLAG_CODES.some((code) => item.flags[code] === null)) {
    Message.warning(t('library.reviewIncomplete')); return;
  }
  rejectError.value = '';
  approveTarget.value = item;
}
function confirmApprove() {
  const target = approveTarget.value;
  if (!target) return;
  commit(dictionary.map((row) => row.id === target.id ? { ...row, review: 'approved' as const } : row), [...materials], 'library.reviewedLocal');
  approveTarget.value = null;
}
function reject(item: DictionaryItem) {
  rejectTarget.value = item;
  rejectReason.value = '';
  rejectError.value = '';
}
function confirmReject() {
  const target = rejectTarget.value;
  if (!target) return;
  const reason = rejectReason.value.trim();
  if (!reason) { rejectError.value = t('library.rejectReasonRequired'); return; }
  commit(dictionary.map((row) => row.id === target.id ? { ...row, review: 'rejected' as const, rejectReason: reason } : row), [...materials], 'library.rejectedLocal');
  rejectTarget.value = null;
}
function remove(kind: Tab, item: DictionaryItem | MaterialItem) {
  Modal.confirm({ title: t('library.delete'), content: t('library.deleteConfirm', { name: item.name }),
    okText: t('library.delete'), cancelText: t('library.cancel'), onOk: () => {
      commit(kind === 'dictionary' ? dictionary.filter((row) => row.id !== item.id) : [...dictionary],
        kind === 'materials' ? materials.filter((row) => row.id !== item.id) : [...materials], 'library.deletedLocal');
    } });
}
function csvValue(value: string) {
  const safe = /^[\s]*[=+@\-]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
function buildMaterialsCsv(rows: MaterialItem[]): Blob {
  const headers = ['material', 'phase', 'basis', 'form', 'method', 'clauses', 'testMethods'].map((key) => t(`library.fields.${key}`)).map(csvValue).join(',');
  const lines = rows.map((item) => [item.name, t(`library.phase.${item.phase}`), t(`library.basis.${item.basis}`), item.form, item.method,
    item.clauses.join('; '), item.clauses.map((code) => clauseMap.value.get(code)?.chapter9 ?? '').filter(Boolean).join('; ')].map(csvValue).join(','));
  return new Blob(['\uFEFF', headers, '\r\n', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}
function clockText(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function stampText(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/* 材料导出与功能台账同一链路：确认弹窗 → 任务中心「下载任务」（DESIGN.md · Composition） */
function requestExport() {
  if (exporting.value) return;
  if (tab.value !== 'materials' || !matching.value.length) { Message.info(t('library.noExport')); return; }
  exportOpen.value = true;
}
async function confirmExport() {
  if (exporting.value || tab.value !== 'materials' || !matching.value.length) return;
  exporting.value = true;
  try {
    const blob = buildMaterialsCsv(matching.value as MaterialItem[]);
    const now = new Date();
    const taskCenter = useTaskCenterStore();
    taskCenter.addDownloadTask({
      id: `dl-${now.getTime()}`, module: 'dict',
      fileStamp: stampText(now),
      operator: t('library.currentUser'), time: clockText(now),
      status: 'processing', progress: 92,
      fileUrl: URL.createObjectURL(blob),
      fileName: `数据材料_${now.toISOString().slice(0, 10)}.csv`,
    });
    exportOpen.value = false;
    Message.success(t('library.exportNotice.created'));
    taskCenter.open('download');
  } catch { Message.error(t('library.exportFailed')); }
  finally { exporting.value = false; }
}
</script>

<template>
  <main class="library-page">
    <section class="library-filter-panel" :aria-label="t('library.title')">
      <form class="library-filters" @submit.prevent="applyFilters">
        <div class="library-filter"><label for="library-keyword">{{ t('library.keyword') }}</label>
          <a-input id="library-keyword" v-model="search" allow-clear class="app-filter-control" :placeholder="t('library.searchPlaceholder')" />
        </div>
        <div v-if="tab === 'dictionary'" class="library-filter"><label for="library-review">{{ t('library.fields.review') }}</label>
          <a-select id="library-review" v-model="review" class="app-filter-control" :aria-label="t('library.fields.review')">
            <a-option value="">{{ t('library.all') }}</a-option>
            <a-option v-for="code in REVIEW_CODES" :key="code" :value="code">{{ t(`library.review.${code}`) }}</a-option>
          </a-select>
        </div>
        <template v-else>
          <div class="library-filter"><label for="library-phase">{{ t('library.fields.phase') }}</label>
            <a-select id="library-phase" v-model="phase" class="app-filter-control" :aria-label="t('library.fields.phase')">
              <a-option value="">{{ t('library.all') }}</a-option>
              <a-option v-for="code in PHASE_CODES" :key="code" :value="code">{{ t(`library.phase.${code}`) }}</a-option>
            </a-select>
          </div>
          <div class="library-filter"><label for="library-basis">{{ t('library.fields.basis') }}</label>
            <a-select id="library-basis" v-model="basis" class="app-filter-control" :aria-label="t('library.fields.basis')">
              <a-option value="">{{ t('library.all') }}</a-option>
              <a-option v-for="code in BASIS_CODES" :key="code" :value="code">{{ t(`library.basis.${code}`) }}</a-option>
            </a-select>
          </div>
          <div class="library-filter"><label for="library-clause">{{ t('library.fields.clauses') }}</label>
            <a-select id="library-clause" v-model="clause" class="app-filter-control" allow-search :aria-label="t('library.fields.clauses')">
              <a-option value="">{{ t('library.all') }}</a-option>
              <a-option v-for="code in clauseCodes" :key="code" :value="code">{{ code }} · {{ clauseMap.get(code)?.topic }}</a-option>
            </a-select>
          </div>
        </template>
        <div class="library-filter-actions">
          <a-button html-type="submit" type="primary"><template #icon><IconSearch /></template>{{ t('library.search') }}</a-button>
          <a-button class="app-btn-neutral" @click="resetFilters"><template #icon><IconRefresh /></template>{{ t('library.reset') }}</a-button>
        </div>
      </form>
    </section>

    <section class="library-list-panel" role="region" :aria-label="t(tab === 'dictionary' ? 'library.dictionaryList' : 'library.materialList')">
      <div class="library-toolbar">
        <!-- 标题右侧计数 = 当前筛选结果条数（与分页「共 n 条」同源 matching） -->
        <div class="library-toolbar-title">
          <h2>{{ t(tab === 'dictionary' ? 'library.dictionaryList' : 'library.materialList') }}</h2>
          <span class="library-count">{{ tab === 'dictionary' ? t('library.countData', { count: matching.length }) : t('library.countMaterials', { count: matching.length }) }}</span>
        </div>
        <div class="library-actions">
          <a-button v-if="tab === 'materials'" class="app-btn-neutral" @click="requestExport"><template #icon><IconDownload /></template>{{ t('library.export') }}</a-button>
          <a-button type="primary" @click="openEditor(tab)"><template #icon><IconPlus /></template>{{ t(tab === 'dictionary' ? 'library.addName' : 'library.addMaterial') }}</a-button>
        </div>
      </div>
      <a-table v-if="tab === 'dictionary'" class="library-table" :columns="dictionaryColumns" :data="visibleRows" row-key="id" :pagination="false" :bordered="false" :stripe="false" :scroll="{ x: 1167 }">
      <template #empty><a-empty :description="t(appliedSearch || appliedReview ? 'library.noMatch' : 'library.noData')" /></template>
      <template #attributes="{ record }"><span class="library-muted">{{ FLAG_CODES.filter((key) => record.flags[key] !== null).length }}/8 {{ t('library.attributesSet') }}</span></template>
      <template #review="{ record }">
        <!-- 已拒绝：状态标签右侧挂信息图标，hover/聚焦气泡显示拒绝原因（标签本身不再承载提示） -->
        <span class="review-cell">
          <a-tag :color="record.review === 'approved' ? 'green' : record.review === 'rejected' ? 'red' : 'orangered'">{{ t(`library.review.${record.review}`) }}</a-tag>
          <a-tooltip v-if="record.review === 'rejected' && record.rejectReason" :content="t('library.rejectReasonTip', { reason: record.rejectReason })" :trigger="['hover', 'focus']" position="top">
            <button class="review-reason" type="button" :aria-label="t('library.rejectReason')"><IconInfoCircle /></button>
          </a-tooltip>
        </span>
      </template>
      <template #actions="{ record }"><div class="row-actions">
        <a-button type="text" size="mini" @click="openEditor('dictionary', record)">{{ t('library.edit') }}</a-button>
        <template v-if="record.review === 'approved'">
          <a-button type="text" size="mini" status="danger" @click="remove('dictionary', record)">{{ t('library.delete') }}</a-button>
        </template>
        <template v-else>
          <a-button type="text" size="mini" @click="approve(record)">{{ t('library.approve') }}</a-button>
          <!-- 「…」悬停即出操作菜单（与问卷/问题库列表同口径）；不再套 tooltip，避免与菜单抢同一 hover。
               刻意不用 click 触发：hover 已展开时再点「…」会被 toggle 关掉，反而误伤鼠标用户 -->
          <a-dropdown trigger="hover" position="bl" popup-container="body" content-class="library-row-menu">
            <a-button type="text" size="mini" class="library-more" :aria-label="t('library.more')" aria-haspopup="menu"><IconMore /></a-button>
            <template #content>
              <a-doption v-if="record.review === 'pending'" @click="reject(record)">{{ t('library.reject') }}</a-doption>
              <a-doption class="library-row-danger" @click="remove('dictionary', record)">{{ t('library.delete') }}</a-doption>
            </template>
          </a-dropdown>
        </template>
      </div></template>
      </a-table>
      <a-table v-else class="library-table" :columns="materialColumns" :data="visibleRows" row-key="id" :pagination="false" :bordered="false" :stripe="false" :scroll="{ x: 1105 }">
      <template #empty><a-empty :description="t(appliedSearch || appliedPhase || appliedBasis || appliedClause ? 'library.noMatch' : 'library.noData')" /></template>
      <template #phase="{ record }">{{ t(`library.phase.${record.phase}`) }}</template>
      <template #basis="{ record }">{{ t(`library.basis.${record.basis}`) }}</template>
      <template #clauses="{ record }"><div v-if="record.clauses.length" class="clause-links"><router-link v-for="code in record.clauses" :key="code" :to="{ path: '/rules/clauses', query: { clause: code } }" :title="`${code} · ${clauseMap.get(code)?.chapter9 ?? ''}`">{{ code }}</router-link></div><span v-else class="library-muted">{{ t('library.unlinked') }}</span></template>
      <template #actions="{ record }"><div class="row-actions"><a-button type="text" size="mini" @click="openEditor('materials', record)">{{ t('library.edit') }}</a-button><a-button type="text" status="danger" size="mini" @click="remove('materials', record)">{{ t('library.delete') }}</a-button></div></template>
      </a-table>
      <nav class="library-pagination app-pagination" :aria-label="t('library.pagination.navigation')">
        <span class="pagination-total">{{ t('library.pagination.total', { count: matching.length }) }}</span>
        <div class="pagination-pages">
          <a-select class="app-page-size" :model-value="pageSize" :aria-label="t('library.pagination.pageSizeAria')" @update:model-value="changePageSize">
            <a-option v-for="size in [10, 20, 50, 100, 200]" :key="size" :value="size">{{ t('library.pagination.perPage', { count: size }) }}</a-option>
          </a-select>
          <button class="pagination-arrow" type="button" :disabled="page === 1" :aria-label="t('library.pagination.previous')" @click="setPage(page - 1)"><IconLeft /></button>
          <button v-for="number in pageNumbers" :key="number" class="pagination-number" :class="{ active: page === number }" type="button" :aria-current="page === number ? 'page' : undefined" @click="setPage(number)">{{ number }}</button>
          <button class="pagination-arrow" type="button" :disabled="page === totalPages" :aria-label="t('library.pagination.next')" @click="setPage(page + 1)"><IconRight /></button>
        </div>
        <span class="pagination-jump-label">{{ t('library.pagination.jumpTo') }}</span>
        <a-input-number v-model="jumpPage" class="app-page-jump" :min="1" :max="totalPages" hide-button :input-attrs="{ 'aria-label': t('library.pagination.jumpTo') }" @press-enter="goToJumpPage" />
        <span class="pagination-total-pages">{{ t('library.pagination.totalPages', { count: totalPages }) }}</span>
      </nav>
    </section>

    <!-- 新增/编辑抽屉：Fill-1 灰画布 + 白色分组卡片，头部与底部操作栏为白色表面（DESIGN.md · Drawer） -->
    <a-drawer class="ledger-drawer library-drawer" :visible="drawerOpen" :width="Math.min(800, viewportWidth - 16)"
      :mask-closable="false" :title="drawerTitle" :footer="true" @open="focusDrawer" @cancel="requestClose">
      <a-form v-if="editor && editor.kind === 'dictionary'" ref="formRef" class="library-form" :model="dictForm"
        :rules="formRules" layout="vertical" scroll-to-first-error @submit.prevent="save">
        <div class="ledger-drawer-group">
          <h2 class="library-section-heading">{{ t('library.sectionBasics') }}</h2>
          <a-alert v-if="error" type="error" :show-icon="true" role="alert">{{ error }}</a-alert>
          <a-alert v-if="editingApproved" type="info" :show-icon="true">{{ t('library.editApprovedHint') }}</a-alert>
          <div class="library-form-grid">
            <a-form-item field="name" :label="t('library.fields.name')">
              <a-input v-model="dictForm.name" :max-length="64" show-word-limit :placeholder="t('library.inputPlaceholder', { field: t('library.fields.name') })" />
            </a-form-item>
            <a-form-item field="alias" :label="t('library.fields.alias')">
              <a-input v-model="dictForm.alias" :max-length="200" show-word-limit :placeholder="t('library.inputPlaceholder', { field: t('library.fields.alias') })" />
            </a-form-item>
            <a-form-item field="level" :label="t('library.fields.level')">
              <a-input v-model="dictForm.level" :max-length="32" :placeholder="t('library.inputPlaceholder', { field: t('library.fields.level') })" />
            </a-form-item>
            <a-form-item field="category" :label="t('library.fields.category')">
              <a-input v-model="dictForm.category" :max-length="32" :placeholder="t('library.inputPlaceholder', { field: t('library.fields.category') })" />
            </a-form-item>
          </div>
        </div>
        <div class="ledger-drawer-group">
          <h2 class="library-section-heading">{{ t('library.sectionAttributes') }}</h2>
          <p class="library-hint">{{ t('library.attributeHint') }}</p>
          <div class="library-form-grid">
            <a-form-item v-for="key in FLAG_CODES" :key="key" :field="`flags.${key}`" :label="t(`library.flags.${key}`)">
              <a-select :model-value="flagChoice(key)" @change="setFlag(key, $event)">
                <a-option value="unknown">{{ t('library.unknown') }}</a-option>
                <a-option value="yes">{{ t('library.yes') }}</a-option>
                <a-option value="no">{{ t('library.no') }}</a-option>
              </a-select>
            </a-form-item>
          </div>
        </div>
      </a-form>

      <a-form v-else-if="editor" ref="formRef" class="library-form" :model="materialForm"
        :rules="formRules" layout="vertical" scroll-to-first-error @submit.prevent="save">
        <div class="ledger-drawer-group">
          <h2 class="library-section-heading">{{ t('library.sectionBasics') }}</h2>
          <a-alert v-if="error" type="error" :show-icon="true" role="alert">{{ error }}</a-alert>
          <a-form-item field="name" :label="t('library.fields.material')">
            <a-input v-model="materialForm.name" :max-length="200" show-word-limit :placeholder="t('library.inputPlaceholder', { field: t('library.fields.material') })" />
          </a-form-item>
          <div class="library-form-grid">
            <a-form-item field="phase" :label="t('library.fields.phase')">
              <a-select v-model="materialForm.phase" :placeholder="t('library.selectPlaceholder', { field: t('library.fields.phase') })">
                <a-option v-for="code in PHASE_CODES" :key="code" :value="code">{{ t(`library.phase.${code}`) }}</a-option>
              </a-select>
            </a-form-item>
            <a-form-item field="basis" :label="t('library.fields.basis')">
              <a-select v-model="materialForm.basis" :placeholder="t('library.selectPlaceholder', { field: t('library.fields.basis') })">
                <a-option v-for="code in BASIS_CODES" :key="code" :value="code">{{ t(`library.basis.${code}`) }}</a-option>
              </a-select>
            </a-form-item>
            <a-form-item field="form" :label="t('library.fields.form')">
              <a-input v-model="materialForm.form" :max-length="200" show-word-limit :placeholder="t('library.inputPlaceholder', { field: t('library.fields.form') })" />
            </a-form-item>
            <a-form-item field="method" :label="t('library.fields.method')">
              <a-input v-model="materialForm.method" :max-length="200" show-word-limit :placeholder="t('library.inputPlaceholder', { field: t('library.fields.method') })" />
            </a-form-item>
          </div>
        </div>
        <div class="ledger-drawer-group">
          <h2 class="library-section-heading">{{ t('library.sectionClauses') }}</h2>
          <a-form-item field="clauses" :label="t('library.fields.clauses')">
            <a-select v-model="materialForm.clauses" multiple allow-search :max-tag-count="3"
              :placeholder="t('library.selectClauses')"><a-option v-for="clause in sourceClauses" :key="clause.code" :value="clause.code">{{ clause.code }} · {{ clause.topic }}</a-option></a-select>
          </a-form-item>
          <div v-if="materialForm.clauses.length" class="library-references">
            <strong>{{ t('library.fields.testMethods') }}</strong>
            <div v-for="code in materialForm.clauses" :key="code">{{ code }} → {{ clauseMap.get(code)?.chapter9 || t('library.unknown') }}</div>
          </div>
          <p class="library-hint">{{ t('library.materialHint') }}</p>
        </div>
      </a-form>

      <template #footer>
        <div class="library-footer">
          <a-button class="app-btn-neutral" :disabled="saving" @click="requestClose">{{ t('library.cancel') }}</a-button>
          <a-button type="primary" :loading="saving" @click="save">{{ t('library.save') }}</a-button>
        </div>
      </template>
    </a-drawer>

    <!-- 导出确认弹窗：确认后进入任务中心「下载任务」，与功能台账同一形态（DESIGN.md · Dialog 456px） -->
    <a-modal :visible="exportOpen" :width="456" :mask-closable="!exporting" :title="t('library.exportNotice.title')" @cancel="!exporting && (exportOpen = false)">
      <div class="library-export-notice">
        <IconExclamationCircle class="library-export-icon" />
        <div class="library-export-text">
          <p>{{ t('library.exportNotice.line1') }}</p>
          <p>{{ t('library.exportNotice.line2') }}</p>
        </div>
      </div>
      <template #footer>
        <a-button class="app-btn-neutral" :disabled="exporting" @click="exportOpen = false">{{ t('library.exportNotice.cancel') }}</a-button>
        <a-button type="primary" :loading="exporting" @click="confirmExport">{{ t('library.exportNotice.confirm') }}</a-button>
      </template>
    </a-modal>

    <!-- 审核通过确认：DESIGN 弹窗 456px，点名校验目标 -->
    <a-modal :visible="!!approveTarget" :width="456" :title="t('library.approve')" @cancel="approveTarget = null">
      <p class="library-modal-text">{{ t('library.reviewConfirm', { name: approveTarget?.name ?? '' }) }}</p>
      <template #footer>
        <a-button class="app-btn-neutral" @click="approveTarget = null">{{ t('library.cancel') }}</a-button>
        <a-button type="primary" @click="confirmApprove">{{ t('library.approve') }}</a-button>
      </template>
    </a-modal>

    <!-- 驳回：DESIGN 弹窗 + 必填驳回原因（限 100 字），原因随记录保存、列表悬浮可查 -->
    <a-modal :visible="!!rejectTarget" :width="456" :mask-closable="false" :title="t('library.reject')" @cancel="rejectTarget = null">
      <p class="library-modal-text">{{ t('library.rejectConfirm', { name: rejectTarget?.name ?? '' }) }}</p>
      <label class="library-modal-field">
        <span class="library-modal-label"><span class="library-modal-required" aria-hidden="true">*</span>{{ t('library.rejectReason') }}</span>
        <a-textarea v-model="rejectReason" :max-length="100" show-word-limit :placeholder="t('library.rejectPlaceholder')" :auto-size="{ minRows: 3, maxRows: 5 }" />
        <p v-if="rejectError" class="library-modal-error" role="alert">{{ rejectError }}</p>
      </label>
      <template #footer>
        <a-button class="app-btn-neutral" @click="rejectTarget = null">{{ t('library.cancel') }}</a-button>
        <a-button type="primary" @click="confirmReject">{{ t('library.confirm') }}</a-button>
      </template>
    </a-modal>
  </main>
</template>

<style scoped>
.library-page { display: flex; flex-direction: column; gap: 16px; min-width: 0; min-height: calc(100dvh - 88px); color: var(--color-text-1); font-size: 14px; }
.library-filter-panel, .library-list-panel { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.library-list-panel { flex: 1; }
/* 内容区不放页面标题；二级菜单即视图开关（2026-11-01 第二轮：去掉顶部页签），
   筛选条件直接作为筛选区第一行 */
.library-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; min-width: 0; }
.library-filter { display: inline-grid; grid-template-columns: max-content minmax(0, 200px); align-items: center; gap: 8px; min-width: 0; }
.library-filter label { color: var(--color-text-2); line-height: 22px; text-align: right; white-space: nowrap; }
.library-filter :deep(.app-filter-control) { width: 200px; max-width: 100%; min-width: 0; }
.library-filter-actions, .library-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.library-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.library-toolbar-title { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; min-width: 0; }
.library-toolbar-title h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }
.library-count { color: var(--color-text-3); font-size: 13px; line-height: 22px; white-space: nowrap; }
.library-muted { color: var(--color-text-2); font-size: 13px; }
/* 审核状态单元格：标签 + 驳回原因图标（16px，hover/focus 气泡提示原因，标签本身不承载提示） */
.review-cell { display: inline-flex; align-items: center; gap: 4px; }
.review-reason { display: inline-grid; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 2px; background: transparent; color: var(--color-text-3); cursor: help; font-size: 16px; place-items: center; }
.review-reason:hover { color: var(--color-text-2); }
.review-reason:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; color: var(--color-text-2); }
.library-table { min-width: 0; }
/* 数据列表：白底、无外框、无斑马纹、行间单线分隔（与功能台账/问卷列表同一套表格处理） */
.library-table :deep(.arco-table), .library-table :deep(.arco-table-container) { border: 0; }
.library-table :deep(.arco-table-th) { height: 44px; padding: 0 12px; border-bottom: 1px solid var(--app-divider); color: var(--color-text-1); background: var(--app-table-header); font-size: 14px; font-weight: 600; line-height: 22px; white-space: nowrap; text-align: left; }
.library-table :deep(.arco-table-td) { height: 52px; padding: 8px 12px; border-bottom: 1px solid var(--app-divider); background: var(--app-surface); font-size: 14px; line-height: 22px; text-align: left; word-break: normal; overflow-wrap: normal; }
.library-table :deep(.arco-table-th.arco-table-col-fixed-right) { background: var(--app-table-header); }
.library-table :deep(.arco-table-td.arco-table-col-fixed-right) { background: var(--app-surface); }
.library-table :deep(.arco-table-tr:hover .arco-table-td) { background: var(--color-fill-1); }
.clause-links { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.clause-links a { color: var(--app-accent); text-decoration: none; }
.clause-links a:hover, .clause-links a:focus-visible { text-decoration: underline; }
.row-actions { display: flex; align-items: center; justify-content: flex-start; gap: 12px; white-space: nowrap; }
.row-actions :deep(.arco-btn) { padding: 0; }
.row-actions :deep(.library-more) { display: inline-grid; width: 24px; height: 24px; place-items: center; }
.library-pagination { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 16px; color: var(--color-text-2); }
.library-pagination .pagination-total { margin-right: 8px; color: var(--color-text-3); line-height: 22px; }
.library-pagination .pagination-pages { display: flex; align-items: center; gap: 8px; margin-right: 8px; }
.library-pagination .pagination-jump-label, .library-pagination .pagination-total-pages { color: var(--color-text-3); line-height: 22px; }
/* 抽屉内容：分组白卡（表面规则见 global.css 的 .ledger-drawer），卡片内 12px 纵向节奏 */
.ledger-drawer-group { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.library-form { display: flex; flex-direction: column; gap: 16px; }
.library-form :deep(.arco-form-item) { margin-bottom: 0; }
.library-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; }
.library-section-heading { margin: 0; color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; }
.library-hint { margin: 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.library-references { padding: 12px; border: 1px solid var(--app-divider); border-radius: 2px; line-height: 22px; overflow-wrap: anywhere; }
.library-references strong { display: block; margin-bottom: 4px; font-weight: 600; }
/* 底部操作栏：白色表面（表面规则见 global.css 的 .ledger-drawer），按钮右对齐 */
.library-footer { display: flex; justify-content: flex-end; gap: 8px; }
/* 导出确认弹窗：图标 + 两行说明，与功能台账导出提示同一形态 */
.library-export-notice { display: flex; align-items: flex-start; gap: 12px; }
.library-export-icon { flex: none; margin-top: 2px; color: var(--app-color-warning); font-size: 24px; }
.library-export-text p { margin: 0 0 4px; line-height: 22px; }
.library-export-text p:last-child { margin-bottom: 0; }
/* 审核/驳回弹窗：正文点名 + 驳回原因必填（限 100 字，右缘计数） */
.library-modal-text { margin: 0; color: var(--color-text-1); line-height: 22px; }
.library-modal-field { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
.library-modal-label { display: flex; align-items: center; gap: 4px; color: var(--color-text-1); font-size: 14px; font-weight: 500; line-height: 22px; }
.library-modal-required { color: var(--app-color-danger); font-style: normal; }
.library-modal-error { margin: 0; color: var(--app-color-danger); font-size: 12px; line-height: 20px; }
@media (max-width: 700px) {
  .library-filter { width: 100%; grid-template-columns: max-content minmax(0, 1fr); }
  .library-filter :deep(.app-filter-control) { width: 100%; }
  .library-actions { width: 100%; }
  .library-form-grid { grid-template-columns: 1fr; }
  .library-pagination { justify-content: flex-start; }
}
</style>

<style>
/* 操作列「…」下拉弹层挂在 body（popup-container），scoped 样式够不到，走全局；
   与问卷/模板列表的行内菜单同一形态：白底 4px 圆角、选项 32px、hover Fill-2、危险项红字 */
.library-row-menu { min-width: 96px; }
/* 白底/4px 圆角/投影由内层 .arco-dropdown 承载（Arco 默认），这里只收紧内边距与选项几何 */
.library-row-menu .arco-dropdown { padding: 4px; border-radius: 4px; }
.library-row-menu .arco-dropdown-option { display: flex; align-items: center; height: 32px; padding: 0 12px; border-radius: 2px; color: var(--color-text-1); line-height: 20px; }
.library-row-menu .arco-dropdown-option:hover { background: var(--color-fill-2); }
.library-row-menu .arco-dropdown-option.library-row-danger { color: rgb(var(--danger-6)); }
.library-row-menu .arco-dropdown-option.library-row-danger:hover { color: rgb(var(--danger-6)); }
</style>
