<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Message } from '@arco-design/web-vue';
import { IconLeft, IconRefresh, IconRight, IconSearch } from '@arco-design/web-vue/es/icon';
import { TASK_MODULE_KEYS, type DownloadTaskRecord, type ImportTaskRecord, type TaskModuleKey } from '../data/taskCenter';
import { useTaskCenterStore } from '../stores/taskCenter';

const { t } = useI18n({ useScope: 'global' });
const store = useTaskCenterStore();

type AnyTask = ImportTaskRecord | DownloadTaskRecord;

interface TaskFilters {
  module: TaskModuleKey | undefined;
  operator: string;
  range: string[];
}

const createDefaultFilters = (): TaskFilters => ({ module: undefined, operator: '', range: [] });

/** 草稿筛选与已应用筛选分离：点击【搜索】才生效 */
const draftFilters = ref<TaskFilters>(createDefaultFilters());
const appliedFilters = ref<TaskFilters>(createDefaultFilters());
const page = ref(1);
const pageSize = ref(10);
const jumpPage = ref(1);

const moduleOptions = computed(() =>
  TASK_MODULE_KEYS.map((value) => ({ value, label: t(`taskCenter.modules.${value}`) })),
);
const operatorOptions = computed(() =>
  Array.from(new Set([...store.importTasks, ...store.downloadTasks].map((task) => task.operator))).map((value) => ({
    value,
    label: value,
  })),
);

const hasAppliedFilters = computed(() =>
  Boolean(appliedFilters.value.module || appliedFilters.value.operator || appliedFilters.value.range.length),
);

const filteredTasks = computed<AnyTask[]>(() => {
  const { module, operator, range } = appliedFilters.value;
  const [from, to] = range;
  const source: AnyTask[] = store.activeTab === 'import' ? store.importTasks : store.downloadTasks;
  return source
    .filter((task) => {
      if (module && task.module !== module) return false;
      if (operator && task.operator !== operator) return false;
      const day = task.time.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    })
    .sort((left, right) => (left.time < right.time ? 1 : -1));
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredTasks.value.length / pageSize.value)));
const pagedTasks = computed(() => filteredTasks.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));

/** 页码 >7 页时首末页恒显 + 当前页 ±1 + 省略号折叠 */
const pageNumbers = computed<(number | 'ellipsis')[]>(() => {
  const total = totalPages.value;
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages: (number | 'ellipsis')[] = [1];
  if (page.value > 3) pages.push('ellipsis');
  for (let number = Math.max(2, page.value - 1); number <= Math.min(total - 1, page.value + 1); number += 1) pages.push(number);
  if (page.value < total - 2) pages.push('ellipsis');
  pages.push(total);
  return pages;
});

const tableColumns = computed(() => [
  { title: t('taskCenter.columns.module'), slotName: 'module', width: 120 },
  { title: t('taskCenter.columns.file'), slotName: 'file', ellipsis: true },
  { title: t('taskCenter.columns.operator'), dataIndex: 'operator', width: 90 },
  { title: t('taskCenter.columns.time'), slotName: 'time', width: 160 },
  { title: t('taskCenter.columns.stage'), slotName: 'stage', width: 280 },
  { title: t('taskCenter.columns.actions'), slotName: 'actions', width: 120 },
]);

// 切换 Tab：筛选条件重置为默认值，列表回到第 1 页
watch(
  () => store.activeTab,
  () => {
    draftFilters.value = createDefaultFilters();
    appliedFilters.value = createDefaultFilters();
    setPage(1);
  },
);

watch(pageSize, () => {
  setPage(1);
});

/** 处理中任务每 10 秒轮询一次，仅抽屉打开期间运行；打开时先推进一次，新任务不必空等首个周期 */
let pollTimer: ReturnType<typeof setInterval> | undefined;
watch(
  () => store.visible,
  (visible) => {
    if (visible && !pollTimer) {
      store.tick();
      pollTimer = setInterval(() => store.tick(), 10_000);
    } else if (!visible && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  },
);
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
});

function applyFilters() {
  appliedFilters.value = {
    module: draftFilters.value.module,
    operator: draftFilters.value.operator.trim(),
    range: [...draftFilters.value.range],
  };
  setPage(1);
}

function resetFilters() {
  draftFilters.value = createDefaultFilters();
  appliedFilters.value = createDefaultFilters();
  setPage(1);
}

function setPage(target: number) {
  if (target < 1 || target > totalPages.value) return;
  page.value = target;
  jumpPage.value = target;
}

function goToJumpPage() {
  const target = Number(jumpPage.value);
  if (!Number.isInteger(target) || target < 1 || target > totalPages.value) {
    Message.warning(t('taskCenter.pagination.invalidPage'));
    return;
  }
  setPage(target);
}

/** a-tabs 的 change 事件 key 是 string | number，收窄为任务 Tab 枚举 */
function onTabChange(key: string | number) {
  store.switchTab(key === 'download' ? 'download' : 'import');
}

function moduleLabel(module: TaskModuleKey) {
  return t(`taskCenter.modules.${module}`);
}

/** 文件命名规则：导入 {模块名}导入数据_{YYYYMMDD}.xlsx；导出 {模块名}导出_{YYYYMMDDHHMMSS}.xlsx。
 *  业务页创建的任务携带实际文件名（如 功能台账_YYYY-MM-DD.xlsx），优先展示。 */
function taskFileName(task: AnyTask) {
  if (store.activeTab === 'download' && (task as DownloadTaskRecord).fileName) return (task as DownloadTaskRecord).fileName as string;
  const label = moduleLabel(task.module);
  if (store.activeTab === 'import') return `${label}${t('taskCenter.fileNames.import')}_${task.fileStamp}.xlsx`;
  return `${label}${t('taskCenter.fileNames.export')}_${task.fileStamp}.xlsx`;
}

/** 错误数据文件：{模块名}导入错误数据_{YYYYMMDDHHMMSS}.xlsx；业务页任务优先用实际文件名 */
function errorFileName(task: ImportTaskRecord) {
  if (task.errorName) return task.errorName;
  return `${moduleLabel(task.module)}${t('taskCenter.fileNames.importError')}_${task.fileStamp}000000.xlsx`;
}

/** 演示扩展：业务页任务携带真实 Blob URL，直接触发浏览器下载 */
function triggerDownload(url: string, fileName: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function downloadFile(task: DownloadTaskRecord) {
  const name = taskFileName(task);
  if (task.fileUrl) { triggerDownload(task.fileUrl, name); return; }
  Message.success(`${t('taskCenter.feedback.startDownload')}：${name}`);
}

function downloadErrorData(task: ImportTaskRecord) {
  const name = errorFileName(task);
  if (task.errorUrl) { triggerDownload(task.errorUrl, name); return; }
  Message.success(`${t('taskCenter.feedback.startDownload')}：${name}`);
}
</script>

<template>
  <a-drawer
    class="tc-drawer"
    :visible="store.visible"
    :width="1200"
    :title="t('taskCenter.title')"
    :footer="false"
    @cancel="store.close()"
  >
    <div class="tc-body">
      <!-- Tab 切换栏 -->
      <a-tabs :active-key="store.activeTab" @change="onTabChange">
        <a-tab-pane key="import" :title="t('taskCenter.tabs.import')" />
        <a-tab-pane key="download" :title="t('taskCenter.tabs.download')" />
      </a-tabs>

      <!-- 筛选区（DESIGN.md Filter strip packing「栅栏」）：每个筛选 = 标签+控件单元
           （inline-grid：max-content 标签 + 200px 控件，8px 内距），单元间统一 16px；
           查询/重置按钮紧随最后一个单元、同为 16px 间距，均带前置图标 -->
      <div class="tc-filters">
        <div class="tc-filter-field">
          <label class="tc-filter-label">{{ t('taskCenter.filters.module') }}</label>
          <a-select
            v-model="draftFilters.module"
            class="app-filter-control tc-filter-control"
            :options="moduleOptions"
            allow-clear
            :placeholder="t('taskCenter.filters.all')"
          />
        </div>
        <div class="tc-filter-field">
          <label class="tc-filter-label">{{ t('taskCenter.filters.operator') }}</label>
          <a-select
            v-model="draftFilters.operator"
            class="app-filter-control tc-filter-control"
            :options="operatorOptions"
            allow-clear
            allow-search
            :placeholder="t('taskCenter.filters.all')"
          />
        </div>
        <div class="tc-filter-field">
          <label class="tc-filter-label">{{ t('taskCenter.filters.time') }}</label>
          <a-range-picker
            v-model="draftFilters.range"
            class="app-filter-control tc-date-filter"
            value-format="YYYY-MM-DD"
            :placeholder="[t('taskCenter.filters.startDate'), t('taskCenter.filters.endDate')]"
          />
        </div>
        <div class="tc-filter-actions">
          <a-button type="primary" @click="applyFilters"><template #icon><IconSearch /></template>{{ t('taskCenter.filters.search') }}</a-button>
          <a-button class="app-btn-neutral" @click="resetFilters"><template #icon><IconRefresh /></template>{{ t('taskCenter.filters.reset') }}</a-button>
        </div>
      </div>

      <!-- 下载任务顶部说明（仅下载 Tab 展示） -->
      <a-alert v-if="store.activeTab === 'download'" class="tc-note" type="info">
        {{ t('taskCenter.note') }}
      </a-alert>

      <!-- 表格：数据区独立滚动，表头吸顶 -->
      <div class="tc-table-wrap">
        <a-table
          :columns="tableColumns"
          :data="pagedTasks"
          :pagination="false"
          :bordered="{ wrapper: false, cell: false }"
          row-key="id"
        >
          <template #module="{ record }">{{ moduleLabel(record.module) }}</template>
          <template #file="{ record }">
            <span class="tc-file" :title="taskFileName(record)">{{ taskFileName(record) }}</span>
          </template>
          <template #time="{ record }"><span class="tc-time">{{ record.time }}</span></template>
          <template #stage="{ record }">
            <div v-if="record.status === 'processing'" class="tc-stage-processing">
              <span class="tc-text-primary">{{ t('taskCenter.stages.processing', { progress: record.progress ?? 0 }) }}</span>
              <div
                class="tc-progress"
                role="progressbar"
                :aria-valuenow="record.progress ?? 0"
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <div class="tc-progress-fill" :style="{ width: `${record.progress ?? 0}%` }"></div>
              </div>
            </div>
            <template v-else-if="store.activeTab === 'import'">
              <span v-if="record.status === 'success'" class="tc-stage-value tc-text-success">
                {{ t('taskCenter.stages.importSuccess', { total: record.total ?? 0, ok: record.ok ?? 0, fail: record.fail ?? 0 }) }}
              </span>
              <span v-else-if="record.status === 'partial_fail'" class="tc-stage-value">
                {{ t('taskCenter.stages.partialFailPrefix', { total: record.total ?? 0, ok: record.ok ?? 0 }) }}<span class="tc-text-danger tc-strong">{{ t('taskCenter.stages.partialFailCount', { fail: record.fail ?? 0 }) }}</span>
              </span>
              <span v-else class="tc-stage-value tc-text-danger">{{ t('taskCenter.stages.importFailed') }}</span>
            </template>
            <template v-else>
              <span v-if="record.status === 'success'" class="tc-stage-value tc-text-success">{{ t('taskCenter.stages.exportSuccess') }}</span>
              <span v-else class="tc-stage-value tc-text-danger">{{ t('taskCenter.stages.exportFailed') }}</span>
            </template>
          </template>
          <template #actions="{ record }">
            <span class="tc-nowrap">
              <template v-if="store.activeTab === 'import'">
                <a-link v-if="record.status === 'partial_fail'" @click="downloadErrorData(record)">
                  {{ t('taskCenter.actions.downloadErrorData') }}
                </a-link>
                <span v-else class="tc-noop">{{ t('taskCenter.actions.noOperation') }}</span>
              </template>
              <template v-else>
                <a-tooltip v-if="record.status === 'success' && record.expired" :content="t('taskCenter.stages.expired')">
                  <span class="tc-link-disabled" tabindex="-1">{{ t('taskCenter.actions.downloadFile') }}</span>
                </a-tooltip>
                <a-link v-else-if="record.status === 'success'" @click="downloadFile(record)">
                  {{ t('taskCenter.actions.downloadFile') }}
                </a-link>
                <span v-else class="tc-noop">{{ t('taskCenter.actions.noOperation') }}</span>
              </template>
            </span>
          </template>
          <template #empty>
            <a-empty :description="hasAppliedFilters ? t('taskCenter.empty.noMatch') : t('taskCenter.empty.noRecord')" />
          </template>
        </a-table>
      </div>
      <!-- 分页器紧随数据列表，保持在独立滚动区外。 -->
      <nav class="tc-pagination app-pagination" :aria-label="t('taskCenter.pagination.navigation')">
        <span class="pagination-total">{{ t('taskCenter.pagination.total', { count: filteredTasks.length }) }}</span>
        <div class="pagination-pages">
          <a-select
            class="app-page-size"
            :model-value="pageSize"
            :aria-label="t('taskCenter.pagination.pageSizeAria')"
            @update:model-value="pageSize = Number($event)"
          >
            <a-option v-for="size in [10, 20, 50, 100, 200]" :key="size" :value="size">{{ t('taskCenter.pagination.perPage', { count: size }) }}</a-option>
          </a-select>
          <button class="pagination-arrow" type="button" :disabled="page === 1" :aria-label="t('taskCenter.pagination.previous')" @click="setPage(page - 1)">
            <IconLeft />
          </button>
          <template v-for="(number, index) in pageNumbers" :key="`${number}-${index}`">
            <span v-if="number === 'ellipsis'" class="pagination-ellipsis" aria-hidden="true">…</span>
            <button
              v-else
              class="pagination-number"
              :class="{ active: page === number }"
              type="button"
              :aria-current="page === number ? 'page' : undefined"
              @click="setPage(number)"
            >{{ number }}</button>
          </template>
          <button class="pagination-arrow" type="button" :disabled="page === totalPages" :aria-label="t('taskCenter.pagination.next')" @click="setPage(page + 1)">
            <IconRight />
          </button>
        </div>
        <span class="pagination-jump-label">{{ t('taskCenter.pagination.jumpTo') }}</span>
        <!-- 不做 min/max 钳位：跳页超出范围时 Toast「请输入有效页码」 -->
        <a-input-number v-model="jumpPage" class="app-page-jump" :input-attrs="{ 'aria-label': t('taskCenter.pagination.jumpTo') }" hide-button @press-enter="goToJumpPage" />
        <span class="pagination-total-pages">{{ t('taskCenter.pagination.totalPages', { count: totalPages }) }}</span>
      </nav>
    </div>
  </a-drawer>
</template>

<style scoped>
/* 抽屉骨架中涉及 Arco 内部结构的覆盖统一放在 global.css（.tc-drawer 前缀）；
   此处只保留自有元素样式。 */
.tc-body { display: flex; flex: 1; flex-direction: column; min-height: 0; }

/* 筛选区（DESIGN.md Filter strip packing「栅栏」）：标签+控件单元 hug 内容排布，
   单元 inline-grid（max-content 标签 + 200px 控件，8px 内距），单元间统一 16px；
   标签右对齐、Text-2；查询/重置紧随最后一个单元（同 16px 间距） */
.tc-filters {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 16px;
  padding: 16px 0 12px;
  border-bottom: 1px solid var(--app-divider);
  overflow: hidden;
}

/* 栅栏单元：标签随内容自适应宽，标签左侧不留空档 */
.tc-filter-field {
  display: inline-grid;
  grid-template-columns: max-content minmax(0, 200px);
  gap: 8px;
  align-items: center;
  min-width: 0;
}
.tc-filter-label {
  color: var(--color-text-2);
  text-align: right;
  line-height: 22px;
  white-space: nowrap;
}
/* 控件几何（统一 200px）写在 global.css：Arco 组件根元素不携带本组件的
   scoped 属性，这里的宽度规则不会命中（同 .tc-drawer 覆盖的原因）。 */
.tc-filter-actions { display: flex; align-items: center; flex: none; gap: 8px; margin-left: 0; }

.tc-note { margin-top: 12px; }

/* 表格：白底、无外框、行分割线；表头吸顶覆盖在 global.css。
   不撑满抽屉（flex: 0 1 auto）：行数少时容器随内容收高，分页器紧随数据列表、
   间距恒为 16px；行数多时容器按可用高度收缩并内部滚动（2026-11-01 用户裁决）。 */
.tc-table-wrap {
  flex: 0 1 auto;
  min-height: 0;
  margin-top: 12px;
  overflow-y: auto;
}

.tc-file {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tc-time { font-variant-numeric: tabular-nums; }

/* 任务阶段：处理中蓝色 + 4px 线形进度条 */
.tc-stage-processing { min-width: 110px; white-space: nowrap; }
.tc-stage-value { white-space: nowrap; }
.tc-progress {
  max-width: 130px;
  height: 4px;
  margin-top: 4px;
  border-radius: 2px;
  background: var(--mt-theme-1);
  overflow: hidden;
}
.tc-progress-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--app-color-primary);
  transition: width 0.3s;
}

.tc-text-primary { color: var(--app-color-primary); }
.tc-text-success { color: var(--app-color-success); }
.tc-text-danger { color: var(--app-color-danger); }
.tc-strong { font-weight: 700; }

.tc-noop { color: var(--color-text-4); }
.tc-link-disabled { color: var(--color-text-4); cursor: not-allowed; }
/* 操作列文本不换行（下载错误数据等长文案保持单行） */
.tc-nowrap { display: inline-block; white-space: nowrap; }

/* 控件状态复用 global.css 的 app-pagination；此处只负责列表下方排布。 */
.tc-pagination {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 16px;
  color: var(--color-text-2);
}
/* List footer contract：总条数与分页组之间 16px（8px margin + 父级 8px gap 合成；
   分页组内部 8px 不变） */
.pagination-total { margin-right: 8px; color: var(--color-text-3); font-size: 14px; line-height: 22px; }
.pagination-pages { display: flex; align-items: center; gap: 8px; margin-right: 8px; }
.pagination-ellipsis {
  min-width: 32px;
  color: var(--color-text-3);
  font-size: 13px;
  text-align: center;
}
.pagination-jump-label, .pagination-total-pages { color: var(--color-text-3); font-size: 14px; line-height: 22px; }

@media (max-width: 1260px) {
  /* 抽屉 1200px 固定宽；仅极窄视口下允许筛选条横向滚动，不换行 */
  .tc-filters { overflow-x: auto; }
}
</style>
