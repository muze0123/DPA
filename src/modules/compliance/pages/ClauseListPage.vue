<script setup lang="ts">
/**
 * 规则管理 · 标准条款（一级菜单「规则管理」二级页，原「标准条款」一级菜单 + 三段页签的第一段）。
 *
 * 分层口径（方案 §3.2）：
 * - 标准层 = 本章节：章节 + 条文原文 + 页码锚点，**只读**，随草案版本整体替换；
 * - 项目层 = 条款判定（规则管理 · 条款判定）：初筛表达式、条目模板、分区映射；
 * - 补充说明 = 本页抽屉里对原文的解释（不改原文；不再区分勘误/待确认）。
 *
 * 列表口径（2026-10-26 重做，对齐 DESIGN.md）：
 * - 顶部区块 = 筛选条件；列表区独立一块白面板，16px 画布间距；
 * - 数据列 = 条款号 / 条款内容（条文原文单行省略）/ 章节层级 / 补充说明 / 条款类型（默认隐藏）；
 * - 页脚使用统一 app-pagination 契约（总条数 + 每页条数 + 箭头 + 页码 + 跳页）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Message, type TableColumnData } from '@arco-design/web-vue';
import {
  IconDelete, IconDownload, IconFilter, IconLeft, IconRefresh, IconRight, IconSearch, IconSettings,
} from '@arco-design/web-vue/es/icon';
import { useI18n } from 'vue-i18n';
import ColumnSettingsPopover, { type ColumnSettingsItem } from '../../../shared/components/ColumnSettingsPopover.vue';
import {
  ensureStandardLibrary, sectionPathOf, standardChapters, standardDoc, standardNodes,
  type StandardFormulaTerm, type StandardNode,
} from '../data/standardLibrary';

/**
 * 标准条文来源 = 天枢标准库（`standardLibrary.ts` 接入层）。
 * 演示期同步 selector 直接给出本地 mock 数据；首屏 onMounted 异步预热，
 * 接入真实接口后此处改为 await 后再赋值即可，其余逻辑不变。
 */
const STANDARD_DOC = standardDoc();
const STANDARD_CHAPTERS = standardChapters();
const STANDARD_NODES = standardNodes();
import {
  addClarification, removeClarification, standardClarifications, type StandardClarification,
} from '../data/clarifications';
import { clauseByNo, clausesByTestChapter } from '../../surveys/data/matching';
import { runExport } from '../../../shared/services/exportGateway';

type FilterKey = 'chapter' | 'keyword' | 'kind' | 'notes';
type KindCode = '' | 'clause' | 'annex';
type NotesCode = '' | 'with' | 'without';
interface Filters {
  /** 多选：空数组 = 全部章节 */
  chapter: string[];
  keyword: string;
  kind: KindCode;
  notes: NotesCode;
}
type ColumnKey = 'no' | 'title' | 'sectionPath' | 'kind' | 'notes';

const { t } = useI18n();
const operator = '王建国';

const route = useRoute();
const router = useRouter();

const FILTER_KEYS: FilterKey[] = ['chapter', 'keyword', 'kind', 'notes'];
const DEFAULT_VISIBLE_FILTERS: FilterKey[] = ['chapter', 'keyword'];
/** 列序：条款号 | 条款内容 | 章节层级 | 补充说明 | 条款类型(默认隐藏) */
const COLUMN_KEYS: ColumnKey[] = ['no', 'title', 'sectionPath', 'notes', 'kind'];
const HIDDEN_COLUMNS_BY_DEFAULT: ColumnKey[] = ['kind'];
const VIEW_STORAGE_KEY = 'csa-standard-view:v1';

interface FilterSetting { key: FilterKey; visible: boolean }
const defaultFilterSettings: FilterSetting[] = FILTER_KEYS.map((key) => ({ key, visible: DEFAULT_VISIBLE_FILTERS.includes(key) }));
const defaultColumns: ColumnSettingsItem[] = COLUMN_KEYS.map((key) => ({
  key, label: key, visible: !HIDDEN_COLUMNS_BY_DEFAULT.includes(key), disabled: false,
}));

const filterSettings = ref<FilterSetting[]>(defaultFilterSettings.map((item) => ({ ...item })));
const columns = ref<ColumnSettingsItem[]>(defaultColumns.map((item) => ({ ...item })));
const filterSettingsOpen = ref(false);
const columnSettingsOpen = ref(false);
const visibleFilterKeys = computed(() => filterSettings.value.filter((item) => item.visible).map((item) => item.key));
const localizedFilterItems = computed<ColumnSettingsItem[]>(() => filterSettings.value.map((item) => ({ ...item, label: t(`standard.filters.${item.key}`) })));
const localizedDefaultFilters = computed<ColumnSettingsItem[]>(() => defaultFilterSettings.map((item) => ({ ...item, label: t(`standard.filters.${item.key}`) })));
const localizedColumns = computed<ColumnSettingsItem[]>(() => columns.value.map((item) => ({ ...item, label: t(`standard.columns.${item.key}`) })));
const localizedDefaultColumns = computed<ColumnSettingsItem[]>(() => defaultColumns.map((item) => ({ ...item, label: t(`standard.columns.${item.key}`) })));

function emptyFilters(): Filters {
  return { chapter: [], keyword: '', kind: '', notes: '' };
}
const draft = reactive<Filters>(emptyFilters());
const applied = reactive<Filters>(emptyFilters());
/** Arco 多选清除时会把 modelValue 置为 undefined，这里归一成空数组（踩坑：undefined.length 直接抛错） */
const chapterDraft = computed<string[]>({
  get: () => draft.chapter ?? [],
  set: (value) => { draft.chapter = value ?? []; },
});

const page = ref(1);
const pageSize = ref(20);
const jumpPage = ref(1);
const viewportWidth = ref(window.innerWidth);
const activeNo = ref('');
const drawerOpen = ref(false);
const clarificationText = ref('');
/** 抽屉关闭后把焦点还给触发元素（键盘用户不丢位置） */
const drawerTrigger = ref<HTMLElement | null>(null);

const chapterOptions = computed(() => STANDARD_CHAPTERS.filter((entry) => entry.count > 0));
const chapterTitle = (no: string): string => STANDARD_CHAPTERS.find((entry) => entry.no === no)?.title ?? '';
/** 章节层级路径（「6 安全技术要求 / 6.2 个人同意要求 / 6.2.1 个人同意一般要求」，标准层单一真值源） */
const sectionPath = (node: StandardNode): string => sectionPathOf(node);
/** 章节文案（下拉项与已选标签共用一套口径，避免两处拼接漂移） */
const chapterOptionLabel = (no: string): string => {
  const entry = STANDARD_CHAPTERS.find((item) => item.no === no);
  return entry ? t('standard.chapterOption', { no: entry.no, title: entry.title, count: entry.count }) : no;
};

/** 按条款号归组：列表单元格与气泡都要用，避免每行多次 filter */
const clarificationsByNo = computed(() => {
  const map = new Map<string, StandardClarification[]>();
  for (const item of standardClarifications) {
    const list = map.get(item.no);
    if (list) list.push(item);
    else map.set(item.no, [item]);
  }
  return map;
});
const notesOf = (no: string): StandardClarification[] => clarificationsByNo.value.get(no) ?? [];
function clarificationCount(no: string): number {
  return notesOf(no).length;
}

const matched = computed(() => {
  const chapters = applied.chapter ?? [];
  return STANDARD_NODES.filter((node) => {
    if (chapters.length && !chapters.includes(node.chapter)) return false;
    if (applied.kind && node.kind !== applied.kind) return false;
    if (applied.notes && (applied.notes === 'with') !== (clarificationCount(node.no) > 0)) return false;
    const query = (applied.keyword || '').trim().toLocaleLowerCase();
    if (query && !`${node.no} ${node.title} ${node.text}`.toLocaleLowerCase().includes(query)) return false;
    return true;
  });
});

const hasApplied = computed(() => FILTER_KEYS.some((key) => {
  const value = applied[key];
  return Array.isArray(value) ? value.length > 0 : value !== '';
}));

/* ---------------------------------------------------------------- 表格列 */

const columnWidths: Record<ColumnKey | 'actions', number> = {
  no: 130, title: 380, sectionPath: 340, kind: 120, notes: 240, actions: 100,
};

const tableColumns = computed<TableColumnData[]>(() => {
  const visible = localizedColumns.value.filter((item) => item.visible).map((item) => {
    const key = item.key as ColumnKey;
    return {
      title: item.label, dataIndex: key, slotName: key, width: columnWidths[key],
      ellipsis: key === 'title' || key === 'sectionPath',
      tooltip: key === 'title' || key === 'sectionPath',
    };
  });
  return [
    ...visible,
    {
      title: t('standard.columns.actions'), dataIndex: 'actions', slotName: 'actions',
      width: columnWidths.actions, fixed: viewportWidth.value > 900 ? 'right' as const : undefined,
    },
  ];
});
const horizontalWidth = computed(() => tableColumns.value.reduce((total, column) => total + Number(column.width ?? 140), 0));

/* ---------------------------------------------------------------- 分页 */

const totalPages = computed(() => Math.max(1, Math.ceil(matched.value.length / pageSize.value)));
const pageNumbers = computed(() => {
  const size = Math.min(totalPages.value, 5);
  const start = Math.min(Math.max(page.value - Math.floor(size / 2), 1), totalPages.value - size + 1);
  return Array.from({ length: size }, (_, index) => start + index);
});
const pagedRows = computed(() => matched.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
function setPage(value: number) {
  page.value = Math.min(Math.max(value, 1), totalPages.value);
  jumpPage.value = page.value;
}
function goToJumpPage() { setPage(Number(jumpPage.value)); }
function handlePageSizeChange(value: unknown) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return;
  pageSize.value = size;
  setPage(1);
}

/* ---------------------------------------------------------------- 视图设置（筛选条件 / 列） */

type SavedView = { filters?: { key?: string; visible?: boolean }[]; columns?: { key?: string; visible?: boolean }[] };
function readView() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || 'null') as SavedView | null;
    if (!saved) return;
    if (Array.isArray(saved.filters)) {
      const visibility = new Map(saved.filters
        .filter((item) => typeof item?.key === 'string' && typeof item?.visible === 'boolean')
        .map((item) => [item.key as FilterKey, item.visible as boolean]));
      const order = [...new Set([...saved.filters.map((item) => item.key), ...FILTER_KEYS])]
        .filter((key): key is FilterKey => FILTER_KEYS.includes(key as FilterKey));
      filterSettings.value = order.map((key) => ({ key, visible: visibility.get(key) ?? DEFAULT_VISIBLE_FILTERS.includes(key) }));
    }
    if (Array.isArray(saved.columns)) {
      const visibility = new Map(saved.columns
        .filter((item) => typeof item?.key === 'string' && typeof item?.visible === 'boolean')
        .map((item) => [item.key as string, item.visible as boolean]));
      const reordered = saved.columns
        .map((item) => defaultColumns.find((column) => column.key === item.key))
        .filter((item): item is ColumnSettingsItem => Boolean(item));
      columns.value = [...new Set([...reordered, ...defaultColumns])].map((item) => ({
        ...item, visible: item.disabled || (visibility.get(item.key) ?? item.visible),
      }));
    }
  } catch { /* 视图设置非必需，读取失败即用默认值 */ }
}
function saveView() {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({
      filters: filterSettings.value,
      columns: columns.value.map(({ key, visible }) => ({ key, visible })),
    }));
  } catch { /* 存储不可用时保持本次会话内的选择 */ }
}

function onFilterSettingsChanged(next: ColumnSettingsItem[]) {
  filterSettings.value = next.map((item) => ({ key: item.key as FilterKey, visible: item.visible }));
  for (const key of FILTER_KEYS) {
    if (visibleFilterKeys.value.includes(key)) continue;
    if (key === 'chapter') {
      draft.chapter = [];
      applied.chapter = [];
    } else {
      draft[key] = '';
      applied[key] = '';
    }
  }
  setPage(1);
  saveView();
}
function onColumnsChanged(next: ColumnSettingsItem[]) {
  columns.value = next.map((item) => ({ ...item, label: item.key, disabled: false }));
  saveView();
}

/* ---------------------------------------------------------------- 查询 */

function applyFilters() {
  Object.assign(applied, { ...draft });
  setPage(1);
}
function resetFilters() {
  Object.assign(draft, emptyFilters());
  applyFilters();
}

watch(matched, () => { if (page.value > totalPages.value) setPage(totalPages.value); });

/* ---------------------------------------------------------------- 条文详情抽屉 */

const active = computed<StandardNode | undefined>(() => STANDARD_NODES.find((node) => node.no === activeNo.value));
const activeClarifications = computed(() => (active.value ? notesOf(active.value.no) : []));
/** 抽屉标题 = 条款号 + 条款标题（超长时在头部省略，完整值走原生 title） */
const drawerTitle = computed(() => (active.value ? `${active.value.no} ${active.value.title}` : ''));
/** 项目层初筛映射只建在第 6 章 38 条上（第 9 章测试方法经 testChapter 反查，见下方 relatedClauses） */
const projectClause = computed(() => {
  if (!active.value) return null;
  try {
    return clauseByNo(active.value.no);
  } catch {
    return null;
  }
});
/** 第 9 章测试方法节点的反向关联：使用它的第 6 章条款（如 9.8.4.3.3.2 → 6.6.2.1.1/6.6.2.1.2/6.6.2.2.1/6.6.2.2.2） */
const relatedClauses = computed(() => (active.value ? clausesByTestChapter(active.value.no) : []));

function openNode(node: StandardNode) {
  drawerTrigger.value = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  activeNo.value = node.no;
  clarificationText.value = '';
  drawerOpen.value = true;
}
/** 关联条款跳转：保持抽屉打开，仅把内容切到被引用的第 6 章条款 */
function openRelatedClause(no: string) {
  const node = STANDARD_NODES.find((item) => item.no === no);
  if (node) openNode(node);
}
/** DESIGN.md · Drawer：抽屉打开后焦点进入内容区，关闭后归还触发元素 */
function focusDrawer() {
  void nextTick(() => {
    document.querySelector<HTMLElement>('.standard-clarify-form textarea')?.focus();
  });
}
function restoreDrawerFocus() {
  drawerTrigger.value?.focus();
  drawerTrigger.value = null;
}
function requestClose() {
  if (clarificationText.value.trim() && !window.confirm(t('standard.clarification.unsaved'))) return;
  clarificationText.value = '';
  drawerOpen.value = false;
  // 深链进入（?clause=）时同步清理参数，避免刷新或再次进入时重复开抽屉
  if (typeof route.query.clause === 'string') {
    const { clause, ...rest } = route.query;
    void router.replace({ query: rest });
  }
}
function submitClarification() {
  if (!active.value) return;
  const created = addClarification({ no: active.value.no, text: clarificationText.value }, operator);
  if (!created) {
    Message.error(t('standard.clarification.required'));
    return;
  }
  clarificationText.value = '';
  Message.success(t('standard.clarification.created'));
}
function dropClarification(id: string) {
  removeClarification(id);
  Message.info(t('standard.clarification.removed'));
}

/** 深链：?clause=<条款号>（来自条款判定、数据材料等跨页跳转）直接打开该条款抽屉 */
watch(() => route.query.clause, (code) => {
  if (typeof code !== 'string') return;
  const node = STANDARD_NODES.find((item) => item.no === code);
  if (node) openNode(node);
}, { immediate: true });

/* ---------------------------------------------------------------- 导出 */

async function exportMarkdown() {
  const scope = (applied.chapter ?? []).length
    ? applied.chapter.map((no) => `${no} ${chapterTitle(no)}`).join('、')
    : t('standard.filters.allChapters');
  const lines = [
    `# ${STANDARD_DOC.code} ${STANDARD_DOC.title}`,
    '',
    `- 草案版次：${STANDARD_DOC.revision}`,
    `- 来源文件：${STANDARD_DOC.sourceFile}（SHA-256 ${STANDARD_DOC.sha256.slice(0, 16)}…）`,
    `- 导出范围：${scope}，共 ${matched.value.length} 条`,
    `- 导出说明：标准层原文只读；权限与水印由天衡统一策略控制（当前为本机预览实现，待接入统一策略）`,
    '',
  ];
  for (const node of matched.value) {
    const termText = (term: StandardFormulaTerm) => `${term.symbol}${term.sub ?? ''}`;
    lines.push(`## ${node.no} ${node.title}`, '', `页码：${node.page}`, '', node.text, '');
    for (const formula of node.formulas ?? []) {
      lines.push(`${termText(formula.left)} = ${formula.numerator.map(termText).join(' + ')} / (${formula.denominator.map(termText).join(' + ')})　(${formula.no})`, '');
    }
    if (node.textAfterFormulas) lines.push(node.textAfterFormulas, '');
    for (const figure of node.figures ?? []) lines.push(`附图：${figure.caption}`, '');
    // 附表（附录 A–E）：markdown 表无法表达跨行/跨列，跨行单元格的延续行留空（同 PDF 抽取口径）
    for (const table of node.tables ?? []) {
      const leafHeader = table.headers[table.headers.length - 1] ?? [];
      lines.push(`**${table.caption}**`, '');
      lines.push(`| ${leafHeader.map((cell) => cell.text).join(' | ')} |`);
      lines.push(`| ${leafHeader.map(() => '---').join(' | ')} |`);
      for (const row of table.rows) lines.push(`| ${row.map((cell) => cell.text).join(' | ')} |`);
      for (const note of table.notes ?? []) lines.push(note);
      lines.push('');
    }
    for (const clarification of notesOf(node.no)) {
      lines.push(`> 补充说明（${clarification.author} · ${clarification.createdAt}）：${clarification.text}`, '');
    }
  }
  const fileName = `GB44464_标准条款_${scope.replace(/\s+/g, '')}.md`;
  const result = await runExport(
    { module: 'standard', scope, format: 'md', recordIds: matched.value.map((node) => node.no) },
    { fileName, blob: new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }), contentType: 'text/markdown;charset=utf-8' },
  );
  if (!result.ok) {
    Message.error(result.reason || t('standard.exportDenied'));
    return;
  }
  Message.success(t('standard.exported', { count: matched.value.length }));
}

/* ---------------------------------------------------------------- 生命周期 */

function onResize() { viewportWidth.value = window.innerWidth; }
onMounted(() => {
  readView();
  // 天枢标准库预热（演示期同步 mock 已可用；接入真实接口后由此拉取并触发刷新）
  void ensureStandardLibrary();
  window.addEventListener('resize', onResize);
});
onBeforeUnmount(() => window.removeEventListener('resize', onResize));
</script>

<template>
  <div class="standard-page">
    <!-- 区块 1：筛选条件 -->
    <section class="standard-top-panel" :aria-label="t('standard.topRegion')">
      <form class="standard-filters" @submit.prevent="applyFilters">
        <div v-for="key in visibleFilterKeys" :key="key" class="standard-filter-field">
          <label :for="`standard-filter-${key}`">{{ t(`standard.filters.${key}`) }}</label>
          <a-input
            v-if="key === 'keyword'" :id="`standard-filter-${key}`" v-model="draft.keyword"
            class="app-filter-control" allow-clear :placeholder="t('standard.filters.keywordPlaceholder')"
          />
          <!-- 章节多选：控件恒定 32px 单行，放不下的已选项由 max-tag-count=1 折叠成「+n」 -->
          <a-select
            v-else-if="key === 'chapter'" :id="`standard-filter-${key}`" v-model="chapterDraft"
            class="app-filter-control" multiple allow-clear :max-tag-count="1" :placeholder="t('standard.filters.allChapters')"
          >
            <a-option v-for="entry in chapterOptions" :key="entry.no" :value="entry.no">{{ chapterOptionLabel(entry.no) }}</a-option>
            <!-- 标签文案包一层 span：Arco 的标签是 inline-flex，text-overflow 不生效，靠子元素才能出省略号 -->
            <template #label="{ data }">
              <span class="standard-chapter-tag-label" :title="chapterOptionLabel(String(data?.value ?? ''))">{{ chapterOptionLabel(String(data?.value ?? '')) }}</span>
            </template>
          </a-select>
          <a-select v-else-if="key === 'kind'" :id="`standard-filter-${key}`" v-model="draft.kind" class="app-filter-control">
            <a-option value="">{{ t('standard.filters.all') }}</a-option>
            <a-option value="clause">{{ t('standard.kindOptions.clause') }}</a-option>
            <a-option value="annex">{{ t('standard.kindOptions.annex') }}</a-option>
          </a-select>
          <a-select v-else :id="`standard-filter-${key}`" v-model="draft.notes" class="app-filter-control">
            <a-option value="">{{ t('standard.filters.all') }}</a-option>
            <a-option value="with">{{ t('standard.notesOptions.with') }}</a-option>
            <a-option value="without">{{ t('standard.notesOptions.without') }}</a-option>
          </a-select>
        </div>
        <div class="standard-filter-actions">
          <a-button type="primary" html-type="submit"><template #icon><IconSearch /></template>{{ t('standard.filters.search') }}</a-button>
          <a-button class="app-btn-neutral" @click="resetFilters"><template #icon><IconRefresh /></template>{{ t('standard.filters.reset') }}</a-button>
          <ColumnSettingsPopover
            v-model:visible="filterSettingsOpen" :items="localizedFilterItems" :default-items="localizedDefaultFilters"
            :title="t('standard.filters.settings')" :list-aria-label="t('standard.filters.settingsList')"
            :show-label="t('standard.filters.show')" :restore-label="t('standard.filters.restore')" @change="onFilterSettingsChanged"
          >
            <a-tooltip :content="t('standard.filters.settings')">
              <a-button class="app-btn-neutral standard-icon-button" :aria-label="t('standard.filters.settings')"><IconFilter /></a-button>
            </a-tooltip>
          </ColumnSettingsPopover>
        </div>
      </form>
    </section>

    <!-- 区块 2：列表（面板标题 + 文档来源（同行右置） + 导出/列设置 + 表格 + 页脚） -->
    <section class="standard-list-panel" role="region" :aria-label="t('standard.listTitle')">
      <div class="standard-toolbar">
        <div class="standard-heading">
          <h2>{{ t('standard.listTitle') }}</h2>
          <p class="standard-doc-meta">
            {{ STANDARD_DOC.code }} {{ STANDARD_DOC.title }} · {{ t('standard.meta.line', { date: STANDARD_DOC.revision, pages: STANDARD_DOC.pageTotal, count: STANDARD_NODES.length }) }} · {{ t('standard.meta.library') }}
          </p>
        </div>
        <div class="standard-toolbar-actions">
          <a-button class="app-btn-neutral" @click="exportMarkdown"><template #icon><IconDownload /></template>{{ t('standard.export') }}</a-button>
          <ColumnSettingsPopover
            v-model:visible="columnSettingsOpen" :items="localizedColumns" :default-items="localizedDefaultColumns"
            :title="t('standard.columnsSettings.settings')" :list-aria-label="t('standard.columnsSettings.list')"
            :show-label="t('standard.columnsSettings.show')" :restore-label="t('standard.columnsSettings.restore')" @change="onColumnsChanged"
          >
            <a-tooltip :content="t('standard.columnsSettings.settings')">
              <a-button class="app-btn-neutral standard-icon-button" :aria-label="t('standard.columnsSettings.settings')"><IconSettings /></a-button>
            </a-tooltip>
          </ColumnSettingsPopover>
        </div>
      </div>

      <span class="standard-sr-only" role="status">{{ t('standard.table.count', { count: matched.length }) }}</span>
      <a-table
        class="standard-table" :columns="tableColumns" :data="pagedRows" row-key="no"
        :pagination="false" :bordered="false" :stripe="false" :scroll="{ x: horizontalWidth }"
      >
        <template #no="{ record }"><span class="tabular">{{ record.no }}</span></template>
        <!-- 条款内容：条文原文单行展示（尾部省略号），hover 气泡全文；点击打开详情抽屉 -->
        <template #title="{ record }">
          <a-tooltip position="top" :content-style="{ maxWidth: '480px' }">
            <template #content><span class="standard-tip-text">{{ record.text }}</span></template>
            <button type="button" class="standard-name-link standard-content-link" @click="openNode(record)">{{ record.text }}</button>
          </a-tooltip>
        </template>
        <!-- 章节层级：有标题的上级层级链（章 → 二级节 → 三级及更深节），条款自身编号不入路径 -->
        <template #sectionPath="{ record }">
          <a-tooltip position="top" :content-style="{ maxWidth: '480px' }">
            <template #content><span class="standard-tip-text">{{ sectionPath(record) }}</span></template>
            <span class="standard-ellipsis">{{ sectionPath(record) }}</span>
          </a-tooltip>
        </template>
        <template #kind="{ record }">{{ t(`standard.kindOptions.${record.kind}`) }}</template>
        <!-- 补充说明：单行展示首条内容（超宽尾部省略），多条折叠为「+n」；hover/focus 气泡列出全部说明 -->
        <template #notes="{ record }">
          <a-tooltip
            v-if="notesOf(record.no).length" position="top" :content-style="{ maxWidth: '420px' }"
          >
            <template #content>
              <ul class="standard-notes-tip">
                <li v-for="item in notesOf(record.no)" :key="item.id">
                  <p class="standard-notes-tip-text">{{ item.text }}</p>
                  <span class="standard-notes-tip-meta">{{ item.author }} · {{ item.createdAt }}</span>
                </li>
              </ul>
            </template>
            <button type="button" class="standard-notes-cell" :aria-label="t('standard.notesOpen', { count: notesOf(record.no).length })" @click="openNode(record)">
              <span class="standard-notes-text">{{ notesOf(record.no)[0].text }}</span>
              <span v-if="notesOf(record.no).length > 1" class="standard-notes-more">+{{ notesOf(record.no).length - 1 }}</span>
            </button>
          </a-tooltip>
          <span v-else class="standard-muted">—</span>
        </template>
        <template #actions="{ record }">
          <div class="standard-row-actions">
            <a-button type="text" size="mini" @click="openNode(record)">{{ t('standard.view') }}</a-button>
          </div>
        </template>
        <template #empty><a-empty :description="t(hasApplied ? 'standard.noMatch' : 'standard.noData')" /></template>
      </a-table>

      <!-- 页脚：总条数 + 每页条数 + 箭头 + 页码 + 跳页（DESIGN.md · List footer contract） -->
      <nav class="standard-pagination app-pagination" :aria-label="t('standard.pagination.navigation')">
        <span class="pagination-total">{{ t('standard.pagination.total', { count: matched.length }) }}</span>
        <div class="pagination-pages">
          <a-select class="app-page-size" :model-value="pageSize" :aria-label="t('standard.pagination.pageSizeAria')" @update:model-value="handlePageSizeChange">
            <a-option v-for="size in [10, 20, 50, 100, 200]" :key="size" :value="size">{{ t('standard.pagination.perPage', { count: size }) }}</a-option>
          </a-select>
          <button class="pagination-arrow" type="button" :disabled="page === 1" :aria-label="t('standard.pagination.previous')" @click="setPage(page - 1)"><IconLeft /></button>
          <button v-for="number in pageNumbers" :key="number" class="pagination-number" :class="{ active: page === number }" type="button" :aria-current="page === number ? 'page' : undefined" @click="setPage(number)">{{ number }}</button>
          <button class="pagination-arrow" type="button" :disabled="page === totalPages" :aria-label="t('standard.pagination.next')" @click="setPage(page + 1)"><IconRight /></button>
        </div>
        <span class="pagination-jump-label">{{ t('standard.pagination.jumpTo') }}</span>
        <a-input-number v-model="jumpPage" class="app-page-jump" :min="1" :max="totalPages" hide-button :input-attrs="{ 'aria-label': t('standard.pagination.jumpTo') }" @press-enter="goToJumpPage" />
        <span class="pagination-total-pages">{{ t('standard.pagination.totalPages', { count: totalPages }) }}</span>
      </nav>
    </section>

    <!-- 条文详情抽屉（DESIGN.md · Drawer）：中号 800px、56px 头部、Fill-1 画布 + 白色分组卡片、固定底部操作区 -->
    <a-drawer
      class="ledger-drawer standard-drawer" :visible="drawerOpen" :width="Math.min(800, viewportWidth - 16)"
      :mask-closable="!clarificationText.trim()" @open="focusDrawer" @close="restoreDrawerFocus" @cancel="requestClose"
    >
      <template #title>
        <span class="standard-drawer-title" :title="drawerTitle">{{ drawerTitle }}</span>
      </template>
      <template v-if="active">
        <!-- 抽屉只呈现「原文 + 项目层映射 + 补充说明」；章节/类型/页码/编号来源/完整性等清单元信息不再重复 -->
        <section class="standard-group">
          <div class="standard-group-head">
            <h2>{{ t('standard.articleText') }}</h2>
          </div>
          <!-- 有附表（附录 A–E）时 text 仅是表题摘要，由下方结构化表格呈现，不重复渲染 -->
          <pre v-if="!active.tables?.length" class="standard-text">{{ active.text }}</pre>
          <!-- 条文公式（式 9.1/9.2）：分式居中排版，右侧点线接式号，同 PDF 原文版式 -->
          <div v-for="formula in active.formulas ?? []" :key="formula.no" class="standard-formula" :aria-label="`公式 ${formula.no}`">
            <span class="standard-formula-expr">
              <span class="standard-formula-term"><i>{{ formula.left.symbol }}</i><sub v-if="formula.left.sub">{{ formula.left.sub }}</sub></span>
              <span class="standard-formula-eq">=</span>
              <span class="standard-formula-frac">
                <span class="standard-formula-part standard-formula-num">
                  <template v-for="(term, index) in formula.numerator" :key="`n${index}`">
                    <span v-if="index > 0" class="standard-formula-op">+</span>
                    <span class="standard-formula-term"><i>{{ term.symbol }}</i><sub v-if="term.sub">{{ term.sub }}</sub></span>
                  </template>
                </span>
                <span class="standard-formula-part">
                  <template v-for="(term, index) in formula.denominator" :key="`d${index}`">
                    <span v-if="index > 0" class="standard-formula-op">+</span>
                    <span class="standard-formula-term"><i>{{ term.symbol }}</i><sub v-if="term.sub">{{ term.sub }}</sub></span>
                  </template>
                </span>
              </span>
            </span>
            <span class="standard-formula-leader" aria-hidden="true"></span>
            <span class="standard-formula-no tabular">({{ formula.no }})</span>
          </div>
          <pre v-if="active.textAfterFormulas" class="standard-text">{{ active.textAfterFormulas }}</pre>
          <!-- 条文附图（PDF 原文插图）：居中插图 + 图题，同原文版式 -->
          <figure v-for="figure in active.figures ?? []" :key="figure.caption" class="standard-figure">
            <img class="standard-figure-img" :src="figure.src" :alt="figure.caption" />
            <figcaption class="standard-figure-caption">{{ figure.caption }}</figcaption>
          </figure>
          <!-- 条文附表（附录 A–E 原文表格）：表题居中 + 全边框表格；宽表（表C.1，30 列）容器横向滚动 -->
          <div v-for="table in active.tables ?? []" :key="table.caption" class="standard-table-block">
            <p class="standard-table-caption">{{ table.caption }}</p>
            <div
              class="standard-table-scroll"
              :class="{ 'standard-table-wide': (table.headers[table.headers.length - 1]?.length ?? 0) > 12 }"
            >
              <table class="standard-table">
                <thead>
                  <tr v-for="(headerRow, rowIndex) in table.headers" :key="`h${rowIndex}`">
                    <th
                      v-for="(cell, cellIndex) in headerRow" :key="`h${rowIndex}-${cellIndex}`"
                      :rowspan="cell.rowSpan" :colspan="cell.colSpan"
                    >{{ cell.text }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, rowIndex) in table.rows" :key="`r${rowIndex}`">
                    <td
                      v-for="(cell, cellIndex) in row" :key="`r${rowIndex}-${cellIndex}`"
                      :rowspan="cell.rowSpan" :colspan="cell.colSpan"
                    >{{ cell.text }}</td>
                  </tr>
                </tbody>
              </table>
              <ul v-if="table.notes?.length" class="standard-table-notes">
                <li v-for="note in table.notes" :key="note">{{ note }}</li>
              </ul>
            </div>
          </div>
        </section>

        <!-- 关联条款（第 9 章测试方法专属）：testChapter 反查的第 6 章条款，点击在抽屉内跳转 -->
        <section v-if="relatedClauses.length" class="standard-group">
          <div class="standard-group-head">
            <h2>{{ t('standard.layer.related') }}</h2>
          </div>
          <div class="app-detail-list">
            <div class="app-detail-row">
              <span class="app-detail-label">{{ t('standard.layer.relatedChapter6') }}</span>
              <span class="app-detail-value tabular">
                <template v-for="(clause, index) in relatedClauses" :key="clause.no">
                  <button type="button" class="standard-link" @click="openRelatedClause(clause.no)">{{ clause.no }}</button><span v-if="index < relatedClauses.length - 1">、</span>
                </template>
              </span>
            </div>
          </div>
        </section>

        <section v-if="projectClause" class="standard-group">
          <div class="standard-group-head">
            <h2>{{ t('standard.layer.project') }}</h2>
            <router-link class="standard-link" :to="{ path: '/rules/clauses', query: { clause: active.no } }">{{ t('standard.projectLink') }}</router-link>
          </div>
          <div class="app-detail-list">
            <div class="app-detail-row">
              <span class="app-detail-label">{{ t('standard.project.expression') }}</span>
              <span class="app-detail-value tabular">{{ projectClause.expr }}</span>
            </div>
            <div class="app-detail-row">
              <span class="app-detail-label">{{ t('standard.project.questions') }}</span>
              <span class="app-detail-value tabular">{{ projectClause.hits.join('、') || '—' }}</span>
            </div>
            <div class="app-detail-row">
              <span class="app-detail-label">{{ t('standard.project.items') }}</span>
              <span class="app-detail-value tabular">{{ projectClause.itemCount }}</span>
            </div>
            <div class="app-detail-row">
              <span class="app-detail-label">{{ t('standard.project.test') }}</span>
              <span class="app-detail-value tabular">{{ projectClause.testChapter }}</span>
            </div>
          </div>
        </section>

        <!-- 补充说明：只保留解释性说明（不再区分勘误/待确认），提交动作固定在底部操作区 -->
        <section class="standard-group">
          <div class="standard-group-head">
            <!-- 计数贴标题右侧（同列表页「共 n 条记录」口径），不被 space-between 推到行尾 -->
            <div class="standard-group-title-row">
              <h2>{{ t('standard.clarification.title') }}</h2>
              <span class="standard-group-meta">{{ t('standard.clarification.count', { count: activeClarifications.length }) }}</span>
            </div>
          </div>
          <ul v-if="activeClarifications.length" class="standard-clarify-list">
            <li v-for="item in activeClarifications" :key="item.id" class="standard-clarify-item">
              <div class="standard-clarify-head">
                <span class="standard-clarify-meta">{{ item.author }} · {{ item.createdAt }}</span>
                <!-- 图标样式删除（icon-only 需 aria-label 保留可访问语义） -->
                <button type="button" class="standard-clarify-remove" :aria-label="t('standard.clarification.remove')" :title="t('standard.clarification.remove')" @click="dropClarification(item.id)">
                  <IconDelete />
                </button>
              </div>
              <p class="standard-clarify-text">{{ item.text }}</p>
            </li>
          </ul>
          <p v-else class="standard-hint">{{ t('standard.clarification.empty') }}</p>

          <div class="standard-clarify-form">
            <label class="standard-clarify-field">
              <span class="standard-clarify-label">{{ t('standard.clarification.inputLabel') }}</span>
              <a-textarea
                v-model="clarificationText" :max-length="500" show-word-limit
                :auto-size="{ minRows: 3, maxRows: 8 }" :placeholder="t('standard.clarification.placeholder')"
              />
            </label>
            <p class="standard-hint">{{ t('standard.clarification.hint') }}</p>
          </div>
        </section>
      </template>
      <template #footer>
        <div class="standard-footer">
          <a-button class="app-btn-neutral" @click="requestClose">{{ t('standard.close') }}</a-button>
          <a-button type="primary" :disabled="!clarificationText.trim()" @click="submitClarification">
            {{ t('standard.clarification.add') }}
          </a-button>
        </div>
      </template>
    </a-drawer>
  </div>
</template>

<style scoped>
.standard-page { display: flex; flex-direction: column; gap: 16px; min-width: 0; min-height: calc(100dvh - 88px); color: var(--color-text-1); font-size: 14px; }
/* 顶部筛选区块：与「基础信息」页同一张白面板口径 */
.standard-top-panel { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.standard-list-panel { flex: 1; min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }

/* 筛选条：标签左缘与控件右缘均贴内容，单元内 8px、单元间 16px，控件统一 200px 且标签/控件同排 */
.standard-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; min-width: 0; }
.standard-filter-field { display: inline-grid; grid-template-columns: max-content minmax(0, 200px); align-items: center; gap: 8px; min-width: 0; }
.standard-filter-field label { color: var(--color-text-2); line-height: 22px; text-align: right; white-space: nowrap; }
.standard-filter-field :deep(.app-filter-control) { width: 200px; max-width: 100%; min-width: 0; }
/* 章节多选：控件高度恒定 32px 单行，放不下的已选项由 max-tag-count=1 折叠成「+n」。
   Arco 多选触发器内部是 .arco-select-view-inner（默认 block、标签可换行、标签文案 pre-wrap），
   多选后会把这个 200px 控件撑成两三行；这里固定成单行 flex：标签可收缩并内部省略，
   「+n」标签没有关闭按钮，保持原宽不被压缩。 */
.standard-filter-field :deep(.arco-select-view-multiple) { height: 32px; max-height: 32px; }
.standard-filter-field :deep(.arco-select-view-multiple .arco-select-view-inner) {
  display: flex; align-items: center; flex-wrap: nowrap; height: 30px; overflow: hidden; line-height: normal;
}
.standard-filter-field :deep(.arco-select-view-multiple .arco-select-view-tag) { flex: 0 1 auto; min-width: 0; }
.standard-chapter-tag-label { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.standard-filter-field :deep(.arco-select-view-multiple .arco-select-view-tag:not(:has(.arco-tag-close-btn))) { flex: 0 0 auto; }
.standard-filter-field :deep(.arco-select-view-multiple .arco-select-view-input) { flex: 0 0 auto; }
.standard-filter-actions, .standard-toolbar-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.standard-icon-button { display: inline-grid; width: 32px; height: 32px; padding: 0; place-items: center; }

.standard-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 16px; margin-bottom: 16px; }
/* 标题行：标准条款 + 文档来源同行右置（来源为 12px 辅助信息，与标题基线对齐） */
.standard-heading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; min-width: 0; }
.standard-heading h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.standard-doc-meta { margin: 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.standard-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }

/* 数据列表：白底、无外框、无斑马纹、行间单线分隔（与功能台账/数据材料同一套表格处理） */
.standard-table { min-width: 0; }
.standard-table :deep(.arco-table), .standard-table :deep(.arco-table-container) { border: 0; }
.standard-table :deep(.arco-table-th) { height: 44px; padding: 0 12px; border-bottom: 1px solid var(--app-divider); color: var(--color-text-1); background: var(--app-table-header); font-size: 14px; font-weight: 600; line-height: 22px; white-space: nowrap; text-align: left; }
.standard-table :deep(.arco-table-td) { height: 52px; padding: 8px 12px; border-bottom: 1px solid var(--app-divider); background: var(--app-surface); font-size: 14px; line-height: 22px; text-align: left; }
.standard-table :deep(.arco-table-th.arco-table-col-fixed-right) { background: var(--app-table-header); }
.standard-table :deep(.arco-table-td.arco-table-col-fixed-right) { background: var(--app-surface); }
.standard-table :deep(.arco-table-tr:hover .arco-table-td) { background: var(--color-fill-1); }
/* 单元格内边距只由 td 承担（8px/12px，行高 22px 由内容决定），避免 Arco 单元格再叠一层内边距把行高撑到 55px */
.standard-table :deep(.arco-table-cell) { padding: 0; line-height: 22px; }
.standard-table .tabular, .tabular { font-variant-numeric: tabular-nums; }

.standard-name-link { padding: 0; border: 0; background: transparent; color: var(--color-text-1); font: inherit; text-align: left; cursor: pointer; }
.standard-name-link:hover, .standard-name-link:focus-visible { color: var(--app-accent); }
/* 条款内容 / 章节层级单元格：单行省略。
   Arco 单元格是 flex 容器且自定义插槽不附加 ellipsis 类，必须自带
   min-width:0 + max-width:100% 才能收缩并裁剪，否则内容把列撑开；气泡用手动 a-tooltip。 */
.standard-content-link, .standard-ellipsis {
  display: block; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.standard-tip-text { display: block; max-width: 480px; white-space: pre-wrap; overflow-wrap: anywhere; }
.standard-muted { color: var(--color-text-2); }
/* 补充说明单元格：单行 + 尾部省略，多条折叠为「+n」；整格是按钮（hover 出气泡、键盘可点开抽屉） */
.standard-notes-cell {
  display: flex; align-items: center; gap: 4px; width: 100%; min-width: 0; padding: 0;
  border: 0; background: transparent; color: var(--color-text-1); font: inherit; text-align: left; cursor: pointer;
}
.standard-notes-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.standard-notes-more { flex: 0 0 auto; color: var(--color-text-2); font-variant-numeric: tabular-nums; }
.standard-notes-cell:hover .standard-notes-text,
.standard-notes-cell:focus-visible .standard-notes-text { color: var(--app-accent); }
/* 气泡内容（Arco 气泡为深色底白字，元信息用同色降低不透明度） */
.standard-notes-tip { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
.standard-notes-tip-text { margin: 0; color: var(--color-white); font-size: 14px; line-height: 22px; white-space: pre-line; }
.standard-notes-tip-meta { display: block; margin-top: 2px; color: var(--color-white); font-size: 12px; line-height: 18px; opacity: 0.72; }
.standard-row-actions { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.standard-row-actions :deep(.arco-btn) { padding: 0; }

.standard-pagination { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 16px; color: var(--color-text-2); }
.standard-pagination .pagination-total { margin-right: 8px; color: var(--color-text-3); line-height: 22px; }
.standard-pagination .pagination-pages { display: flex; align-items: center; gap: 8px; margin-right: 8px; }
.standard-pagination .pagination-jump-label, .standard-pagination .pagination-total-pages { color: var(--color-text-3); line-height: 22px; }

/* 抽屉分组：白色卡片（表面与间距由 global.css 的 .ledger-drawer 承载） */
.standard-group { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.standard-group-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 12px; }
/* 计数/副文本贴标题右侧的行内容器（仅补充说明分组用），项目层分组的右侧动作链接仍走 space-between */
.standard-group-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.standard-group-head h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.standard-group-meta { color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.standard-text { margin: 0; white-space: pre-wrap; font-family: inherit; font-size: 14px; line-height: 22px; color: var(--color-text-1); }
/* 条文附图：居中插图 + 居中图题（同 PDF 原文版式，如 9.8.4.3.3.2 的图3） */
.standard-figure { margin: 16px 0 0; text-align: center; }
.standard-figure-img { max-width: 240px; max-height: 280px; object-fit: contain; background: var(--app-surface); }
.standard-figure-caption { margin-top: 8px; font-size: 14px; line-height: 22px; color: var(--color-text-1); }
/* 条文公式：分式（分子/横线/分母）居中，右侧点线接式号，同 PDF 原文版式（式 9.1/9.2） */
.standard-formula { display: flex; align-items: center; margin: 12px 0; font-size: 16px; line-height: 22px; }
.standard-formula-expr { display: inline-flex; align-items: center; }
.standard-formula-term { display: inline-flex; align-items: baseline; }
.standard-formula-term i { font-family: 'Times New Roman', Georgia, serif; font-size: 18px; }
.standard-formula-term sub { font-size: 12px; }
.standard-formula-eq { margin: 0 8px; }
.standard-formula-frac { display: inline-flex; flex-direction: column; align-items: center; margin: 0 4px; }
.standard-formula-part { display: inline-flex; align-items: baseline; padding: 2px 6px; }
.standard-formula-num { border-bottom: 1px solid var(--color-text-1); }
.standard-formula-op { margin: 0 4px; }
.standard-formula-leader { flex: 1; min-width: 40px; height: 1em; margin: 0 10px; border-bottom: 1px dotted var(--color-text-3); align-self: center; }
.standard-formula-no { color: var(--color-text-1); }
/* 条文附表（附录 A–E）：表题居中同原文，表格全边框；表C.1（30 列）横向滚动，窄列仿原文竖排换行 */
.standard-table-block { margin-top: 16px; }
.standard-table-caption { margin: 0 0 8px; font-size: 14px; line-height: 22px; text-align: center; color: var(--color-text-1); }
.standard-table-scroll { overflow-x: auto; }
.standard-table-wide .standard-table { min-width: 1760px; }
.standard-table { width: 100%; border-collapse: collapse; font-size: 13px; line-height: 20px; }
.standard-table th, .standard-table td { padding: 6px 8px; border: 1px solid var(--color-neutral-3); vertical-align: middle; word-break: break-word; }
.standard-table th { font-weight: 500; text-align: center; background: var(--color-fill-1); }
.standard-table td { text-align: left; color: var(--color-text-1); }
.standard-table-notes { margin: 8px 0 0; padding: 0; list-style: none; font-size: 12px; line-height: 20px; color: var(--color-text-2); }
.standard-table-notes li + li { margin-top: 4px; }
.standard-hint { margin: 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.standard-link { color: var(--app-accent); font-size: 14px; line-height: 22px; text-decoration: none; }
/* 关联条款的跳转链接是 button：重置原生外观后复用链接样式 */
button.standard-link { padding: 0; border: none; background: none; cursor: pointer; font: inherit; }
.standard-link:hover, .standard-link:focus-visible { text-decoration: underline; }

.standard-clarify-list { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none; }
.standard-clarify-item { display: flex; flex-direction: column; gap: 6px; padding-left: 12px; border-left: 2px solid var(--app-divider); }
.standard-clarify-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.standard-clarify-meta { color: var(--color-text-3); font-size: 12px; line-height: 20px; font-variant-numeric: tabular-nums; }
/* 图标样式的删除按钮：20px 图标居中，hover/focus 变危险色 */
.standard-clarify-remove {
  margin-left: auto; display: inline-grid; place-items: center;
  width: 20px; height: 20px; padding: 0; border: 0; background: transparent;
  color: var(--color-text-3); cursor: pointer;
}
.standard-clarify-remove svg { width: 14px; height: 14px; }
.standard-clarify-remove:hover, .standard-clarify-remove:focus-visible { color: var(--app-color-danger); }
.standard-clarify-text { margin: 0; font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.standard-clarify-form { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; border-top: 1px dashed var(--app-divider); }
.standard-clarify-field { display: flex; flex-direction: column; gap: 8px; }
.standard-clarify-label { color: var(--color-text-1); font-size: 14px; font-weight: 600; line-height: 22px; }
/* 固定底部操作区：右对齐，关闭（白底描边）+ 添加说明（主按钮） */
.standard-footer { display: flex; justify-content: flex-end; gap: 8px; }

@media (max-width: 700px) {
  .standard-filter-field { width: 100%; grid-template-columns: max-content minmax(0, 1fr); }
  .standard-filter-field :deep(.app-filter-control) { width: 100%; }
  .standard-pagination { justify-content: flex-start; }
  .standard-toolbar-actions { width: 100%; }
}
</style>

<style>
/* 抽屉头部标题由 Arco 渲染，scoped 样式够不到：56px 头部内单行省略，完整标题走原生 title 提示 */
.standard-drawer .arco-drawer-title { flex: 1; min-width: 0; }
.standard-drawer .arco-drawer-title .standard-drawer-title {
  display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>
