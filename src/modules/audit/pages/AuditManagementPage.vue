<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Message, type TableColumnData } from '@arco-design/web-vue';
import { IconDownload, IconExclamationCircle, IconFilter, IconLeft, IconRefresh, IconRight, IconSearch, IconSettings } from '@arco-design/web-vue/es/icon';
import ColumnSettingsPopover, { type ColumnSettingsItem } from '../../../shared/components/ColumnSettingsPopover.vue';
import { useTaskCenterStore } from '../../task-center/stores/taskCenter';
import { auditActors, auditRecords, type AuditRecord } from '../data/audit';
import { auditActionColor, useAuditLabels } from '../labels';
import { makeAuditExport } from '../data/export';

/**
 * 审计管理（M6 审计查询 + P7 审计记录合并口径）。
 *
 * 全链路留痕只读：检索（操作人/时间段/动作类型/来源模块/结果/关键字）
 * + 单条详情 + 按当前筛选导出审计报告。写留痕由各业务模块产生，本页不写。
 */
interface Filters {
  timeRange: string[];
  actor: string;
  actionType: string;
  module: string;
  result: string;
  keyword: string;
}

const { t } = useI18n({ useScope: 'global' });
const { actionLabel, moduleLabel, roleLabel, resultLabel } = useAuditLabels();

const emptyFilters = (): Filters => ({ timeRange: [], actor: '', actionType: '', module: '', result: '', keyword: '' });
const draft = reactive<Filters>(emptyFilters());
const applied = reactive<Filters>(emptyFilters());

const loading = ref(true);
const exporting = ref(false);
const exportOpen = ref(false);
const drawerOpen = ref(false);
const detail = ref<AuditRecord | null>(null);

const actionTypeOptions = ['login', 'view', 'create', 'update', 'delete', 'import', 'export', 'review', 'grant', 'config'] as const;
const moduleOptions = ['ledger', 'surveys', 'questionnaire', 'matching', 'section', 'review', 'evidence', 'account', 'grant', 'dict', 'system'] as const;

/* ---------------------------------------------- 筛选条件设置（DESIGN.md · List settings popover） */

const FILTER_KEYS = ['time', 'actor', 'actionType', 'module', 'result', 'keyword'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
/** 筛选行不锁定任何字段（DESIGN.md：No filter row is locked） */
const defaultFilterSettings: { key: FilterKey; visible: boolean }[] = FILTER_KEYS.map((key) => ({ key, visible: true }));
const filterSettings = ref(defaultFilterSettings.map((setting) => ({ ...setting })));
const filterSettingsOpen = ref(false);
/** 弹层序即筛选行序（live apply：勾选/拖拽/恢复默认立即生效，无草稿层） */
const visibleFilterKeys = computed(() => filterSettings.value.filter((setting) => setting.visible).map((setting) => setting.key));
const filterSettingsItems = computed<ColumnSettingsItem[]>(() => filterSettings.value.map((setting) => ({ ...setting, label: t(`audit.filters.${setting.key}`) })));
const defaultFilterItems = computed<ColumnSettingsItem[]>(() => defaultFilterSettings.map((setting) => ({ ...setting, label: t(`audit.filters.${setting.key}`) })));

function onFilterSettingsChanged(next: ColumnSettingsItem[]) {
  filterSettings.value = next.map((item) => ({ key: item.key as FilterKey, visible: item.visible }));
}

/* ---------------------------------------------- 列设置（DESIGN.md · List settings popover） */

/** 列序即业务口径（2026-10-27 用户裁决）：时间 → 人 → 模块 → 类型 → 对象 → 摘要 → 结果；操作列恒最后 */
const COLUMN_KEYS = ['time', 'actor', 'module', 'actionType', 'target', 'summary', 'result'] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];
/** summary 不设固定宽：吸收剩余空间并单行省略（内容长度差异大）；其余列按内容最小可读宽收紧 */
const COLUMN_WIDTHS: Record<ColumnKey, number | undefined> = { time: 165, actor: 85, module: 105, actionType: 95, target: 175, summary: undefined, result: 75 };
/** 摘要列无固定宽，参与横向最小宽计算时按 240 计（窄屏保可读，宁可横向滚动也不压成碎字） */
const SUMMARY_MIN_WIDTH = 240;
/** 首列（操作时间，记录标识列）锁定可见；操作列不进列设置、恒为最后一列（DESIGN.md） */
const defaultColumnSettings: { key: ColumnKey; visible: boolean; disabled: boolean }[] = COLUMN_KEYS.map((key) => ({ key, visible: true, disabled: key === 'time' }));
const columnSettings = ref(defaultColumnSettings.map((setting) => ({ ...setting })));
const columnSettingsOpen = ref(false);
const columnSettingsItems = computed<ColumnSettingsItem[]>(() => columnSettings.value.map((setting) => ({ ...setting, label: t(`audit.columns.${setting.key}`) })));
const defaultColumnItems = computed<ColumnSettingsItem[]>(() => defaultColumnSettings.map((setting) => ({ ...setting, label: t(`audit.columns.${setting.key}`) })));

function onColumnSettingsChanged(next: ColumnSettingsItem[]) {
  columnSettings.value = next.map((item) => ({
    key: item.key as ColumnKey,
    visible: item.visible,
    disabled: item.key === 'time',
  }));
}

const tableColumns = computed<TableColumnData[]>(() => {
  const dataColumns = columnSettings.value.filter((setting) => setting.visible).map((setting): TableColumnData => ({
    title: t(`audit.columns.${setting.key}`),
    dataIndex: setting.key === 'target' ? 'targetName' : setting.key,
    slotName: ['actionType', 'module', 'target', 'summary', 'result'].includes(setting.key) ? setting.key : undefined,
    width: COLUMN_WIDTHS[setting.key],
    ...(setting.key === 'time' ? { sortable: { sortDirections: ['ascend', 'descend'], defaultSortOrder: 'descend' } } : {}),
  }));
  return [...dataColumns, { title: t('audit.columns.actions'), dataIndex: 'actions', slotName: 'actions', width: 80, fixed: 'right' }];
});

const horizontalWidth = computed(() => tableColumns.value.reduce(
  (total, column) => total + Number(column.width ?? (column.dataIndex === 'summary' ? SUMMARY_MIN_WIDTH : 140)),
  0,
));

const filteredRows = computed<AuditRecord[]>(() => {
  const keyword = applied.keyword.trim().toLowerCase();
  const [start, end] = applied.timeRange;
  return auditRecords
    .filter((record) => {
      if (applied.actor && record.actor !== applied.actor) return false;
      if (applied.actionType && record.actionType !== applied.actionType) return false;
      if (applied.module && record.module !== applied.module) return false;
      if (applied.result && record.result !== applied.result) return false;
      if (start && record.time.slice(0, 10) < start) return false;
      if (end && record.time.slice(0, 10) > end) return false;
      if (keyword) {
        const haystack = `${record.id} ${record.actor} ${record.targetType} ${record.targetName} ${record.summary}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    })
    .sort((a, b) => (sortDirection.value === 'ascend' ? a.time.localeCompare(b.time) : b.time.localeCompare(a.time)));
});

/** DESIGN.md · Empty：区分「暂无数据」与「搜索不到相关内容」两种空态 */
const hasApplied = computed(() => Boolean(
  applied.timeRange.length || applied.actor || applied.actionType || applied.module || applied.result || applied.keyword.trim(),
));

/* ---------------------------------------------- 排序（操作时间）与分页（DESIGN.md · Pagination） */

const sortDirection = ref<'ascend' | 'descend'>('descend');
const page = ref(1);
const pageSize = ref(10);
const jumpPage = ref(1);

const totalPages = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value)));
/** 当前页数据：全量过滤结果切片，翻页间保持筛选与排序 */
const pagedRows = computed(() => filteredRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
/** 5 页滑动窗口页码（DESIGN.md · Pagination） */
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

/** 操作时间列表头排序 → 数据层重排（a-table 仅对当前页切片排序，需在过滤层处理） */
function handleSort(dataIndex: unknown, direction: unknown) {
  if (dataIndex !== 'time') return;
  if (direction !== 'ascend' && direction !== 'descend') return;
  sortDirection.value = direction;
  setPage(1);
}

/** mock 初始加载：接入服务端后替换为真实请求 */
onMounted(() => {
  window.setTimeout(() => { loading.value = false; }, 320);
});

function openDetail(record: AuditRecord) {
  detail.value = record;
  drawerOpen.value = true;
}

/** 查询：模拟请求反馈，草稿筛选 → 应用筛选 */
function applyFilters() {
  loading.value = true;
  window.setTimeout(() => {
    Object.assign(applied, { ...draft, timeRange: draft.timeRange.length === 2 ? [...draft.timeRange] : [] });
    setPage(1);
    loading.value = false;
  }, 260);
}

function resetFilters() {
  Object.assign(draft, emptyFilters());
  applyFilters();
}

function stamp(): string {
  const now = new Date();
  const part = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${part(now.getMonth() + 1)}${part(now.getDate())}${part(now.getHours())}${part(now.getMinutes())}${part(now.getSeconds())}`;
}

/** 任务中心记录使用固定 YYYY-MM-DD HH:mm:ss 文本，与功能台账同一口径 */
function clockText(date: Date): string {
  const part = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`;
}

/* 导出与功能台账同一链路：确认弹窗 → 任务中心「下载任务」（DESIGN.md · Batch export baseline） */
function requestExport() {
  if (exporting.value) return;
  if (!filteredRows.value.length) { Message.info(t('audit.export.empty')); return; }
  exportOpen.value = true;
}
async function confirmExport() {
  if (exporting.value || !filteredRows.value.length) return;
  exporting.value = true;
  try {
    const blob = await makeAuditExport({
      records: filteredRows.value,
      text: (record) => ({
        role: roleLabel(record.role),
        actionType: actionLabel(record.actionType),
        module: moduleLabel(record.module),
        result: resultLabel(record.result),
      }),
      meta: [
        `导出时间：${new Date().toLocaleString()}`,
        '筛选条件：' + [
          applied.timeRange.length === 2 ? `${t('audit.filters.time')} ${applied.timeRange[0]} ~ ${applied.timeRange[1]}` : '',
          applied.actor ? `${t('audit.filters.actor')} ${applied.actor}` : '',
          applied.actionType ? `${t('audit.filters.actionType')} ${actionLabel(applied.actionType as AuditRecord['actionType'])}` : '',
          applied.module ? `${t('audit.filters.module')} ${moduleLabel(applied.module as AuditRecord['module'])}` : '',
          applied.result ? `${t('audit.filters.result')} ${resultLabel(applied.result as AuditRecord['result'])}` : '',
          applied.keyword ? `${t('audit.filters.keyword')} ${applied.keyword}` : '',
        ].filter(Boolean).join('；') || '全部',
      ],
    });
    const now = new Date();
    const taskCenter = useTaskCenterStore();
    taskCenter.addDownloadTask({
      id: `dl-${now.getTime()}`, module: 'audit',
      fileStamp: stamp(),
      operator: t('audit.currentUser'), time: clockText(now),
      status: 'processing', progress: 92,
      fileUrl: URL.createObjectURL(blob),
      fileName: `审计报告_${now.toISOString().slice(0, 10)}.xlsx`,
    });
    exportOpen.value = false;
    Message.success(t('audit.exportNotice.created'));
    taskCenter.open('download');
  } catch {
    Message.error(t('audit.export.fail'));
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <main class="audit-page">
    <!-- 筛选面板：条件 + 查询/重置/筛选设置在同一个换行容器中，操作组自然紧跟最后一个筛选条件 -->
    <form class="audit-filter-panel" @submit.prevent="applyFilters">
        <!-- 字段与控件同一行：label 右对齐、控件 200px 左对齐、组内不换行；字段顺序与显隐由筛选条件设置驱动 -->
        <div v-for="key in visibleFilterKeys" :key="key" class="audit-filter-field">
          <label :for="`audit-filter-${key}`">{{ t(`audit.filters.${key}`) }}</label>
          <a-range-picker
            v-if="key === 'time'"
            :id="`audit-filter-time`"
            v-model="draft.timeRange"
            value-format="YYYY-MM-DD"
            class="audit-filter app-filter-control"
            :aria-label="t('audit.filters.time')"
          />
          <a-select
            v-else-if="key === 'actor'"
            :id="`audit-filter-actor`"
            v-model="draft.actor"
            class="audit-filter app-filter-control"
            :placeholder="t('audit.filters.actor')"
            :aria-label="t('audit.filters.actor')"
            allow-clear
          >
            <a-option value="">{{ t('audit.filters.all') }}</a-option>
            <a-option v-for="actor in auditActors" :key="actor" :value="actor">{{ actor }}</a-option>
          </a-select>
          <a-select
            v-else-if="key === 'actionType'"
            :id="`audit-filter-actionType`"
            v-model="draft.actionType"
            class="audit-filter app-filter-control"
            :placeholder="t('audit.filters.actionType')"
            :aria-label="t('audit.filters.actionType')"
            allow-clear
          >
            <a-option value="">{{ t('audit.filters.all') }}</a-option>
            <a-option v-for="code in actionTypeOptions" :key="code" :value="code">{{ actionLabel(code) }}</a-option>
          </a-select>
          <a-select
            v-else-if="key === 'module'"
            :id="`audit-filter-module`"
            v-model="draft.module"
            class="audit-filter app-filter-control"
            :placeholder="t('audit.filters.module')"
            :aria-label="t('audit.filters.module')"
            allow-clear
          >
            <a-option value="">{{ t('audit.filters.all') }}</a-option>
            <a-option v-for="code in moduleOptions" :key="code" :value="code">{{ moduleLabel(code) }}</a-option>
          </a-select>
          <a-select
            v-else-if="key === 'result'"
            :id="`audit-filter-result`"
            v-model="draft.result"
            class="audit-filter app-filter-control"
            :placeholder="t('audit.filters.result')"
            :aria-label="t('audit.filters.result')"
            allow-clear
          >
            <a-option value="">{{ t('audit.filters.all') }}</a-option>
            <a-option value="success">{{ t('audit.results.success') }}</a-option>
            <a-option value="failure">{{ t('audit.results.failure') }}</a-option>
          </a-select>
          <a-input-search
            v-else
            :id="`audit-filter-keyword`"
            v-model="draft.keyword"
            class="audit-filter app-filter-control"
            :placeholder="t('audit.filters.keywordPlaceholder')"
            :aria-label="t('audit.filters.keyword')"
            allow-clear
            @search="applyFilters"
            @clear="applyFilters"
            @press-enter="applyFilters"
          />
        </div>
      <div class="audit-filter-actions">
        <a-button type="primary" html-type="submit" :loading="loading">
          <template #icon><IconSearch /></template>
          {{ t('audit.filters.search') }}
        </a-button>
        <a-button class="app-btn-neutral" @click="resetFilters">
          <template #icon><IconRefresh /></template>
          {{ t('audit.filters.reset') }}
        </a-button>
        <ColumnSettingsPopover
          v-model:visible="filterSettingsOpen"
          :items="filterSettingsItems"
          :default-items="defaultFilterItems"
          :title="t('audit.filters.settings')"
          :list-aria-label="t('audit.filters.settings')"
          :show-label="t('audit.filters.show')"
          :restore-label="t('audit.filters.restore')"
          @change="onFilterSettingsChanged"
        >
          <a-tooltip :content="t('audit.filters.settings')">
            <a-button class="app-btn-neutral audit-icon-button" :aria-label="t('audit.filters.settings')">
              <IconFilter />
            </a-button>
          </a-tooltip>
        </ColumnSettingsPopover>
      </div>
    </form>

    <!-- 数据列表：标题「审计记录」+ 右侧导出/列设置；分页按 DESIGN.md Pagination 契约 -->
    <section class="audit-list" role="region" :aria-label="t('audit.listTitle')">
      <div class="audit-list-toolbar">
        <h2 class="audit-list-title">{{ t('audit.listTitle') }}</h2>
        <span class="audit-list-count" role="status">{{ t('audit.pagination.total', { count: filteredRows.length }) }}</span>
        <div class="audit-list-actions">
          <a-button class="app-btn-neutral" @click="requestExport">
            <template #icon><IconDownload /></template>
            {{ t('audit.actions.export') }}
          </a-button>
          <ColumnSettingsPopover
            v-model:visible="columnSettingsOpen"
            :items="columnSettingsItems"
            :default-items="defaultColumnItems"
            :title="t('audit.columns.settings')"
            :list-aria-label="t('audit.columns.settings')"
            :show-label="t('audit.filters.show')"
            :restore-label="t('audit.filters.restore')"
            @change="onColumnSettingsChanged"
          >
            <a-tooltip :content="t('audit.columns.settings')">
              <a-button class="app-btn-neutral audit-icon-button" :aria-label="t('audit.columns.settings')">
                <IconSettings />
              </a-button>
            </a-tooltip>
          </ColumnSettingsPopover>
        </div>
      </div>

      <a-table
        class="audit-table"
        row-key="id"
        :columns="tableColumns"
        :data="pagedRows"
        :loading="loading"
        :bordered="false"
        :stripe="false"
        :pagination="false"
        :scroll="{ x: horizontalWidth }"
        @sorter-change="handleSort"
      >
      <template #actionType="{ record }">
        <a-tag :color="auditActionColor(record.actionType)">{{ actionLabel(record.actionType) }}</a-tag>
      </template>
      <template #module="{ record }">{{ moduleLabel(record.module) }}</template>
      <template #target="{ record }">
        <div class="audit-target">
          <span>{{ record.targetName }}</span>
          <small>{{ record.targetType }}</small>
        </div>
      </template>
      <template #summary="{ record }">
        <a-tooltip :content="record.summary" position="top" :disabled="!record.summary">
          <span class="audit-summary">{{ record.summary }}</span>
        </a-tooltip>
      </template>
      <template #result="{ record }">
        <span class="audit-result" :class="`is-${record.result}`">
          <span class="audit-result-dot" aria-hidden="true" />{{ resultLabel(record.result) }}
        </span>
      </template>
      <template #actions="{ record }">
        <a-button type="text" size="mini" @click="openDetail(record)">{{ t('audit.actions.detail') }}</a-button>
      </template>
      <template #empty>
        <a-empty :description="hasApplied ? t('audit.table.noMatch') : t('audit.table.empty')" />
      </template>
      </a-table>

      <!-- DESIGN.md · Pagination：右对齐「共 N 条 → 每页条数 → 页码 → 跳至」，32px 白底控件 -->
      <nav class="audit-pagination app-pagination" :aria-label="t('audit.table.navigation')">
        <span class="pagination-total">{{ t('audit.pagination.total', { count: filteredRows.length }) }}</span>
        <div class="pagination-pages">
          <a-select class="app-page-size" :model-value="pageSize" :aria-label="t('audit.table.pageSize')" @update:model-value="handlePageSizeChange">
            <a-option v-for="size in [10, 20, 50, 100, 200]" :key="size" :value="size">{{ t('audit.pagination.perPage', { count: size }) }}</a-option>
          </a-select>
          <button class="pagination-arrow" type="button" :disabled="page === 1" :aria-label="t('audit.pagination.previous')" @click="setPage(page - 1)"><IconLeft /></button>
          <button
            v-for="number in pageNumbers"
            :key="number"
            class="pagination-number"
            :class="{ active: page === number }"
            type="button"
            :aria-current="page === number ? 'page' : undefined"
            @click="setPage(number)"
          >{{ number }}</button>
          <button class="pagination-arrow" type="button" :disabled="page === totalPages" :aria-label="t('audit.pagination.next')" @click="setPage(page + 1)"><IconRight /></button>
        </div>
        <span class="pagination-jump-label">{{ t('audit.pagination.jumpTo') }}</span>
        <a-input-number v-model="jumpPage" class="app-page-jump" :min="1" :max="totalPages" hide-button @press-enter="goToJumpPage" />
        <span class="pagination-total-pages">{{ t('audit.pagination.totalPages', { count: totalPages }) }}</span>
      </nav>
    </section>

    <!-- 审计详情抽屉：只读（点遮罩关闭），灰画布 + 白色分组卡片，底部操作栏仅「关闭」（DESIGN.md · Drawer） -->
    <a-drawer
      v-model:visible="drawerOpen"
      class="audit-drawer"
      :title="t('audit.detail.title')"
      :width="460"
      unmount-on-close
    >
      <div class="audit-drawer-group">
        <!-- 2026-10-26 裁决：详情字段按「标签列 + 值列」行式布局，弃带边框描述表格 -->
        <div v-if="detail" class="app-detail-list">
          <div class="app-detail-row"><span class="app-detail-label">{{ t('audit.detail.id') }}</span><span class="app-detail-value">{{ detail.id }}</span></div>
          <div class="app-detail-row"><span class="app-detail-label">{{ t('audit.detail.time') }}</span><span class="app-detail-value">{{ detail.time }}</span></div>
          <div class="app-detail-row">
            <span class="app-detail-label">{{ t('audit.detail.actor') }}</span>
            <span class="app-detail-value">{{ detail.actor }}<a-tag class="audit-detail-role" size="small">{{ roleLabel(detail.role) }}</a-tag></span>
          </div>
          <div class="app-detail-row"><span class="app-detail-label">{{ t('audit.detail.module') }}</span><span class="app-detail-value">{{ moduleLabel(detail.module) }}</span></div>
          <div class="app-detail-row">
            <span class="app-detail-label">{{ t('audit.detail.actionType') }}</span>
            <span class="app-detail-value"><a-tag :color="auditActionColor(detail.actionType)">{{ actionLabel(detail.actionType) }}</a-tag></span>
          </div>
          <div class="app-detail-row"><span class="app-detail-label">{{ t('audit.detail.target') }}</span><span class="app-detail-value">{{ detail.targetType }} · {{ detail.targetName }}</span></div>
          <div class="app-detail-row"><span class="app-detail-label">{{ t('audit.detail.summary') }}</span><span class="app-detail-value">{{ detail.summary }}</span></div>
          <div class="app-detail-row">
            <span class="app-detail-label">{{ t('audit.detail.result') }}</span>
            <span class="app-detail-value">
              <span class="audit-result" :class="`is-${detail.result}`">
                <span class="audit-result-dot" aria-hidden="true" />{{ resultLabel(detail.result) }}
              </span>
            </span>
          </div>
        </div>
      </div>
      <template #footer>
        <a-button class="app-btn-neutral" @click="drawerOpen = false">{{ t('audit.actions.close') }}</a-button>
      </template>
    </a-drawer>

    <!-- 导出确认弹窗（DESIGN.md · Batch export baseline）：确认后进入任务中心「下载任务」 -->
    <a-modal
      :visible="exportOpen"
      :width="456"
      :mask-closable="!exporting"
      :title="t('audit.exportNotice.title')"
      @cancel="!exporting && (exportOpen = false)"
    >
      <div class="audit-export-notice">
        <IconExclamationCircle class="audit-export-icon" />
        <div class="audit-export-text">
          <p>{{ t('audit.exportNotice.line1') }}</p>
          <p>{{ t('audit.exportNotice.line2') }}</p>
        </div>
      </div>
      <template #footer>
        <a-button class="app-btn-neutral" :disabled="exporting" @click="exportOpen = false">{{ t('audit.exportNotice.cancel') }}</a-button>
        <a-button type="primary" :loading="exporting" @click="confirmExport">{{ t('audit.exportNotice.confirm') }}</a-button>
      </template>
    </a-modal>
  </main>
</template>

<style scoped>
/* 与功能台账同构（DESIGN.md · Pattern 2 模块拆分）：页根为 Fill-1 画布，
   筛选面板与数据列表为两个独立白色业务面板（--app-surface），模块间距 16px */
.audit-page { display: flex; flex-direction: column; gap: 16px; min-width: 0; min-height: calc(100dvh - 88px); font-size: 14px; }

/* 筛选面板：字段与操作组在同一换行容器，操作组紧跟最后一个筛选条件（单元间距统一 16px，同台账 2026-10-25 裁决） */
.audit-filter-panel { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
/* DESIGN.md · Filter geometry：字段（label）右对齐 + 控件 200px 左对齐同一行，字段与控件之间 8px，组内不换行 */
.audit-filter-field { display: grid; grid-template-columns: max-content 200px; align-items: center; gap: 8px; min-width: 0; white-space: nowrap; }
.audit-filter-field label { color: var(--color-text-2); text-align: right; line-height: 22px; }
/* :deep() 穿透——Arco a-select/a-range-picker 根元素不携带父组件 scoped 属性，普通 scoped 宽度规则不命中 */
.audit-filter-panel :deep(.audit-filter) { width: 200px; }
.audit-filter-actions { display: flex; align-items: center; gap: 8px; }
.audit-icon-button { display: inline-grid; width: 32px; height: 32px; padding: 0; place-items: center; }

/* 数据列表 */
.audit-list { flex: 1; min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.audit-list-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 16px; }
.audit-list-title { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
/* 标题右侧记录总数：辅助文案 12px/20（DESIGN.md 字阶），随筛选/分页实时更新；与标题间距由 toolbar gap 12px 提供 */
.audit-list-count { color: var(--color-text-3); font-size: 12px; line-height: 20px; font-variant-numeric: tabular-nums; }
.audit-list-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-left: auto; }

/* DESIGN.md · Pagination：右对齐「共 N 条 → 每页条数 → 页码 → 跳至」，控件表面走 global.css 共享 app-pagination 规则 */
.audit-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 16px; color: var(--color-text-2); }
.pagination-total { margin-right: 8px; color: var(--color-text-3); font-size: 14px; line-height: 22px; }
.pagination-pages { display: flex; align-items: center; gap: 8px; margin-right: 8px; }
.pagination-jump-label, .pagination-total-pages { color: var(--color-text-3); font-size: 14px; line-height: 22px; }

/* DESIGN.md · Table：白底、无外框、无斑马纹、行间单线分隔（与功能台账/问卷工作台同一套处理） */
.audit-page :deep(.arco-table) { border: 0; }
.audit-page :deep(.arco-table-container) { border: 0; }
.audit-page :deep(.arco-table-th) { height: 44px; padding: 0 12px; border-bottom: 1px solid var(--app-divider); color: var(--color-text-1); background: var(--app-table-header); font-size: 14px; font-weight: 600; line-height: 22px; white-space: nowrap; text-align: left; }
.audit-page :deep(.arco-table-td) { height: 52px; padding: 8px 12px; border-bottom: 1px solid var(--app-divider); background: var(--app-surface); font-size: 14px; line-height: 22px; white-space: nowrap; text-align: left; }
.audit-page :deep(.arco-table-tr:hover .arco-table-td) { background: var(--color-fill-1); }

.audit-target { display: grid; gap: 2px; min-width: 0; line-height: 18px; }
/* 对象名称/类型均单行省略：列宽收紧后长对象名不得溢出单元格 */
.audit-target > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.audit-target small { color: var(--color-text-3); }

/* 操作摘要：单行省略，完整内容走悬浮提示与详情抽屉（列宽无固定值，吸收剩余空间） */
.audit-page :deep(.arco-table-td) .audit-summary { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.audit-result { display: inline-flex; align-items: center; gap: 6px; }
.audit-result-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-text-4); }
.audit-result.is-success .audit-result-dot { background: rgb(var(--success-6)); }
.audit-result.is-failure { color: rgb(var(--danger-6)); }
.audit-result.is-failure .audit-result-dot { background: rgb(var(--danger-6)); }

.audit-detail-role { margin-left: 8px; }

/* 详情抽屉内容分组：白色卡片（灰画布由 global.css 的 .audit-drawer 规则提供） */
.audit-drawer-group { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 2px; background: var(--app-surface); }

/* 导出确认弹窗（DESIGN.md · Batch export baseline，与功能台账同一形态） */
.audit-export-notice { display: flex; align-items: flex-start; gap: 12px; }
.audit-export-icon { flex: none; margin-top: 2px; color: var(--app-color-warning); font-size: 24px; }
.audit-export-text p { margin: 0 0 4px; line-height: 22px; }
.audit-export-text p:last-child { margin-bottom: 0; }

@media (max-width: 900px) {
  .audit-filter-panel { align-items: stretch; flex-direction: column; }
  .audit-filter-field { grid-template-columns: max-content minmax(0, 1fr); }
  .audit-filter-panel :deep(.audit-filter) { width: 100%; }
  .audit-filter-actions { justify-content: flex-end; }
  .audit-pagination { justify-content: flex-start; }
  .pagination-total { width: 100%; margin-right: 0; }
}
</style>
