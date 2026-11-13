<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconArrowRight, IconRefresh, IconSearch, IconFile, IconApps, IconOrderedList, IconStorage } from '@arco-design/web-vue/es/icon';
import AppListToolbar from '../../../design/components/AppListToolbar.vue';
import AppPagination from '../../../design/components/AppPagination.vue';
import { useLocaleStore } from '../../../app/stores/locale';
import { MOCK_CURRENT_USER, SURVEY_STATUSES, surveyRecords, mergeLocalSurveyDrafts } from '../../surveys/data/surveys';
import { loadLocalSurveyDrafts } from '../../surveys/data/drafts';
import { useSurveyLabels, surveyStatusColor } from '../../surveys/labels';
import { compareWorkbenchTasks, deadlineKind, isActiveTask, isPlatformManager, localCalendarDay, matchesWorkbenchFilter, visibleWorkbenchTasks, type WorkbenchFilter } from '../data/workbench';

const WorkbenchCharts = defineAsyncComponent(() => import('../components/WorkbenchCharts.vue'));
const { t } = useI18n();
const localeStore = useLocaleStore();
const { statusLabel } = useSurveyLabels();
const loading = ref(true);
const failed = ref(false);
const today = ref(localCalendarDay());
const loadedAt = ref('');
const filter = ref<WorkbenchFilter>('todo');
const keyword = ref('');
const current = ref(1);
const pageSize = ref(5);
const taskRegion = ref<HTMLElement>();
const filterSelect = ref<{ focus?: () => void }>();
// Identity is supplied by the existing task module. No client-selectable permission escalation.
const manager = computed(() => isPlatformManager(MOCK_CURRENT_USER));
const visible = computed(() => visibleWorkbenchTasks(surveyRecords, MOCK_CURRENT_USER));
const countFor = (key: WorkbenchFilter) => visible.value.filter(record => matchesWorkbenchFilter(record, key, MOCK_CURRENT_USER, today.value)).length;
const metrics = computed(() => [
  { key: 'all' as const, count: visible.value.length },
  { key: 'active' as const, count: countFor('active') },
  { key: 'overdue' as const, count: countFor('overdue') },
  { key: 'completed' as const, count: countFor('completed') },
]);
const attention = computed(() => (['overdue', 'dueSoon', 'returned'] as const).map(key => ({ key, count: countFor(key) })));
const recent = computed(() => [...visible.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5));
const options = computed(() => [
  ...(['todo', 'all', 'active', 'overdue', 'dueSoon', 'returned', 'completed'] as const).map(value => ({ value, label: t(`workbench.filters.${value}`) })),
  ...SURVEY_STATUSES.map(value => ({ value, label: statusLabel(value) })),
]);
const filtered = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase(localeStore.locale);
  return visible.value.filter(record => matchesWorkbenchFilter(record, filter.value, MOCK_CURRENT_USER, today.value)
    && (!search || [record.taskName, record.id, record.functionName, record.fuliId, record.owner, record.respondent, record.reviewer].some(value => value?.toLocaleLowerCase(localeStore.locale).includes(search))))
    .sort(compareWorkbenchTasks);
});
const rows = computed(() => filtered.value.slice((current.value - 1) * pageSize.value, current.value * pageSize.value));
const shortcuts = [
  { key: 'tasks', path: '/surveys', icon: IconFile },
  { key: 'functions', path: '/functions', icon: IconApps },
  { key: 'records', path: '/sections/records', icon: IconOrderedList },
  { key: 'materials', path: '/data-materials/materials', icon: IconStorage },
] as const;
watch([filter, keyword, pageSize], () => { current.value = 1; });
watch(() => filtered.value.length, length => { current.value = Math.min(current.value, Math.max(1, Math.ceil(length / pageSize.value))); });
async function selectFilter(value: WorkbenchFilter) {
  filter.value = value;
  keyword.value = '';
  current.value = 1;
  await nextTick();
  taskRegion.value?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  filterSelect.value?.focus?.();
}
async function load() {
  if (loading.value && loadedAt.value) return;
  loading.value = true;
  failed.value = false;
  try {
    mergeLocalSurveyDrafts(await loadLocalSurveyDrafts());
    today.value = localCalendarDay();
    const refreshedAt = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    loadedAt.value = `${localCalendarDay(refreshedAt)} ${pad(refreshedAt.getHours())}:${pad(refreshedAt.getMinutes())}:${pad(refreshedAt.getSeconds())}`;
  } catch { failed.value = true; }
  finally { loading.value = false; }
}
function onVisible() { if (document.visibilityState === 'visible' && !loading.value) void load(); }
onMounted(() => { void load(); document.addEventListener('visibilitychange', onVisible); });
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible));
</script>

<template>
  <div class="workbench" :aria-busy="loading">
    <section class="panel overview" :aria-label="t('workbench.overview')">
      <AppListToolbar :title="t('workbench.overview')">
        <template #actions>
          <span v-if="loadedAt && !failed" class="overview-updated">{{ t('workbench.updatedAt', { time: loadedAt }) }}</span>
          <a-button :loading="loading" @click="load"><template #icon><IconRefresh /></template>{{ t('workbench.refresh') }}</a-button>
        </template>
      </AppListToolbar>
      <a-skeleton v-if="loading" :animation="true" :aria-label="t('workbench.loading')"><a-skeleton-line :rows="3" /></a-skeleton>
      <div v-else-if="failed" class="failure" role="alert">
        <p>{{ t('workbench.loadFailed') }}</p><a-button type="primary" @click="load">{{ t('workbench.retry') }}</a-button>
      </div>
      <div v-else class="metric-grid">
        <div v-for="metric in metrics" :key="metric.key" class="metric-card" :class="{ selected: filter === metric.key }">
          <button class="metric" :aria-pressed="filter === metric.key" @click="selectFilter(metric.key)">
            <span class="metric-label">{{ t(`workbench.metrics.${metric.key}`) }}<IconArrowRight /></span>
            <span class="metric-value" :class="{ danger: metric.key === 'overdue' && metric.count > 0 }">{{ metric.count }}</span>
            <span class="muted metric-description">{{ t(`workbench.metricHints.${metric.key}`) }}</span>
          </button>
        </div>
      </div>
    </section>
    <template v-if="!loading && !failed">
      <div class="main-grid">
        <section ref="taskRegion" class="panel task-panel" :aria-label="t('workbench.tasks')">
          <AppListToolbar :title="t('workbench.tasks')" :summary="t('workbench.count', { count: filtered.length })">
            <template #actions><router-link to="/surveys" class="text-link">{{ t('workbench.taskManagement') }}<IconArrowRight /></router-link></template>
          </AppListToolbar>
          <div class="task-filters">
            <a-input v-model="keyword" allow-clear :placeholder="t('workbench.search')" :aria-label="t('workbench.search')"><template #prefix><IconSearch /></template></a-input>
            <a-select ref="filterSelect" v-model="filter" :options="options" :aria-label="t('workbench.taskFilter')" />
          </div>
          <p v-if="!manager" class="list-hint">{{ t('workbench.personalTodoHint') }}</p>
          <div v-if="rows.length" class="task-scroll">
            <table class="task-table">
              <thead><tr><th>{{ t('workbench.task') }}</th><th>{{ t('workbench.stage') }}</th><th>{{ t('workbench.responsible') }}</th><th>{{ t('workbench.deadline') }}</th><th>{{ t('workbench.action') }}</th></tr></thead>
              <tbody><tr v-for="record in rows" :key="record.id">
                <td class="task-name"><router-link :to="`/surveys/${record.id}`">{{ record.taskName }}</router-link><span class="metadata">{{ record.id }} · {{ record.functionName || record.fuliId || '—' }}</span></td>
                <td><a-tag :color="surveyStatusColor(record.status)">{{ statusLabel(record.status) }}</a-tag><span v-if="record.returnInfo && isActiveTask(record)" class="return-label">{{ t('workbench.returned') }}</span></td>
                <td>{{ (record.status === 'matching-reviewing' || record.status === 'section-reviewing' ? record.reviewer : record.status === 'pending-fill' ? record.respondent : record.owner) || '—' }}</td>
                <td><span :class="{ danger: deadlineKind(record, today) === 'overdue' }">{{ record.deadline || '—' }}</span><span v-if="deadlineKind(record, today) !== 'normal'" class="metadata" :class="{ danger: deadlineKind(record, today) === 'overdue' }">{{ t(`workbench.deadlines.${deadlineKind(record, today)}`) }}</span></td>
                <td><router-link :to="`/surveys/${record.id}`" class="text-link">{{ t('workbench.viewTask') }}</router-link></td>
              </tr></tbody>
            </table>
          </div>
          <a-empty v-else><p>{{ t(keyword ? 'workbench.noMatch' : 'workbench.noTasks') }}</p><a-button v-if="keyword || filter !== 'all'" @click="selectFilter('all')">{{ t('workbench.showAll') }}</a-button></a-empty>
          <AppPagination v-model:current="current" v-model:page-size="pageSize" :total="filtered.length" :page-sizes="[5, 10, 20]" />
        </section>
        <aside class="side-stack">
          <section class="panel"><AppListToolbar :title="t('workbench.shortcuts')" />
            <nav class="shortcuts" :aria-label="t('workbench.shortcuts')"><router-link v-for="item in shortcuts" :key="item.key" :to="item.path"><component :is="item.icon" /><span>{{ t(`workbench.links.${item.key}`) }}</span><IconArrowRight /></router-link></nav>
          </section>
          <section class="panel"><AppListToolbar :title="t('workbench.attention')" />
            <button v-for="item in attention" :key="item.key" class="attention-row" @click="selectFilter(item.key)"><span>{{ t(`workbench.filters.${item.key}`) }}</span><span :class="{ danger: item.key === 'overdue' && item.count > 0 }">{{ item.count }}<IconArrowRight /></span></button>
            <p class="footnote">{{ t('workbench.deadlineHint') }}</p>
          </section>
        </aside>
      </div>
      <WorkbenchCharts :records="visible" :today="today" :selected="filter" @select-stage="selectFilter" />
      <div class="bottom-grid">
        <section class="panel"><AppListToolbar :title="t('workbench.recent')" :summary="t('workbench.recentHint')" />
          <ol v-if="recent.length" class="recent-list"><li v-for="record in recent" :key="record.id"><router-link :to="`/surveys/${record.id}`">{{ record.taskName }}</router-link><span class="recent-state">{{ statusLabel(record.status) }}</span><span class="metadata">{{ record.updatedAt }} · {{ record.updatedBy || '—' }}</span></li></ol>
          <a-empty v-else :description="t('workbench.noUpdates')" />
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.workbench { display: grid; gap: var(--mt-ds-space-3); min-width: 0; font-size: var(--mt-ds-font-body); line-height: var(--mt-ds-line-body); color: var(--mt-ds-text); }
.panel { min-width: 0; padding: var(--mt-ds-space-4); background: var(--app-surface); border-radius: var(--mt-ds-control-radius); }
.muted, .metadata, .list-hint, .footnote { color: var(--mt-ds-text-muted); }
.overview-updated { color: var(--mt-ds-text-secondary); font-size: var(--mt-ds-font-caption); font-variant-numeric: tabular-nums; }
.metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--mt-ds-space-3); }
.metric-card { min-width: 0; border: 1px solid var(--mt-ds-border); border-radius: var(--mt-ds-control-radius); }
.metric-card.selected { border-color: var(--mt-ds-primary); }
.metric { display: grid; width: 100%; height: 100%; gap: var(--mt-ds-space-2); border: 0; background: transparent; color: inherit; text-align: start; padding: var(--mt-ds-space-4); cursor: pointer; font: inherit; }
.metric-label { display: flex; justify-content: space-between; align-items: center; gap: var(--mt-ds-space-2); }
.metric-label svg { color: var(--mt-ds-text-muted); }
.metric-value { font-size: 24px; line-height: 32px; font-variant-numeric: tabular-nums; }
.metric-description, .metadata, .list-hint, .footnote { font-size: var(--mt-ds-font-caption); line-height: var(--mt-ds-line-caption); }
.metric:hover, .metric-card.selected .metric, .shortcuts a:hover, .attention-row:hover { background: var(--color-fill-1); }
.metric-card.selected .metric-label { color: var(--mt-ds-primary); }
.main-grid { display: grid; grid-template-columns: minmax(0, 1fr) 288px; gap: var(--mt-ds-space-3); align-items: stretch; }
.side-stack { display: grid; grid-template-rows: repeat(2, minmax(min-content, 1fr)); gap: var(--mt-ds-space-3); min-width: 0; }
.task-panel { display: flex; flex-direction: column; }
.task-panel :deep(.mt-pagination) { margin-top: auto; padding-top: var(--mt-ds-space-4); }
.task-filters { display: grid; grid-template-columns: minmax(0, 320px) minmax(0, 200px); gap: var(--mt-ds-space-3); }
.list-hint { margin: var(--mt-ds-space-2) 0 var(--mt-ds-space-3); }
.task-scroll { overflow-x: auto; margin-top: var(--mt-ds-space-3); }
.task-table { border-collapse: collapse; width: 100%; min-width: 720px; }
.task-table th, .task-table td { border-bottom: 1px solid var(--app-divider); padding: var(--mt-ds-space-3) var(--mt-ds-space-2); text-align: start; font-weight: var(--mt-ds-weight-body); }
.task-table th { background: var(--app-table-header); white-space: nowrap; }
.task-table td { vertical-align: middle; }
.task-table th:first-child, .task-table td:first-child { padding-inline-start: var(--mt-ds-space-3); }
.task-name { min-width: 220px; max-width: 320px; overflow-wrap: anywhere; }
.task-name a, .recent-list a, .text-link { color: var(--mt-ds-primary); text-decoration: none; font-weight: var(--mt-ds-weight-body); }
.task-name a:hover, .recent-list a:hover, .text-link:hover { text-decoration: underline; text-underline-offset: 3px; }
.metadata { display: block; margin-top: var(--mt-ds-space-1); overflow-wrap: anywhere; }
.text-link { display: inline-flex; align-items: center; gap: var(--mt-ds-space-2); }
.danger, .return-label { color: var(--app-color-danger); }
.return-label { display: block; font-size: var(--mt-ds-font-caption); }
.shortcuts { display: grid; gap: var(--mt-ds-space-1); }
.shortcuts a { display: flex; align-items: center; gap: var(--mt-ds-space-3); padding: var(--mt-ds-space-2); min-height: 44px; color: var(--mt-ds-text); text-decoration: none; }
.shortcuts a svg:first-child { color: var(--mt-ds-primary); }
.shortcuts a svg:last-child { margin-left: auto; color: var(--mt-ds-text-muted); }
.attention-row { width: 100%; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; min-height: 44px; padding: var(--mt-ds-space-2); text-align: start; }
.attention-row { display: flex; justify-content: space-between; gap: var(--mt-ds-space-3); border-bottom: 1px solid var(--app-divider); }
.attention-row > span:last-child { display: flex; align-items: center; gap: var(--mt-ds-space-2); font-variant-numeric: tabular-nums; }
.footnote { margin: var(--mt-ds-space-3) 0 0; }
.bottom-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--mt-ds-space-3); }
.recent-list { list-style: none; padding: 0; margin: 0; }
.recent-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: var(--mt-ds-space-3); padding: var(--mt-ds-space-3) 0; border-bottom: 1px solid var(--app-divider); }
.recent-list li:first-child { padding-top: 0; }
.recent-list a { overflow-wrap: anywhere; }
.recent-list .metadata { grid-column: 1 / -1; }
.recent-state { color: var(--mt-ds-text-secondary); }
.failure { text-align: center; padding: var(--mt-ds-space-6); }
.workbench :deep(.arco-tag) { font-weight: var(--mt-ds-weight-body); }
.workbench button:focus-visible, .workbench a:focus-visible { outline: 2px solid var(--mt-ds-primary); outline-offset: 2px; }
@media (max-width: 1200px) { .main-grid { grid-template-columns: minmax(0, 1fr); } .side-stack { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: auto; } }
@media (max-width: 767px) { .metric-grid, .side-stack, .bottom-grid, .task-filters { grid-template-columns: minmax(0, 1fr); } .recent-list li { grid-template-columns: minmax(0, 1fr); } .recent-state { margin-top: var(--mt-ds-space-1); } }
</style>
