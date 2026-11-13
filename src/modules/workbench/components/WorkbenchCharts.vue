<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import * as echarts from 'echarts/core';
import { chartThemeColors } from '../../../design/charts/theme';
import { themeMode } from '../../../design/theme';
import { useLocaleStore } from '../../../app/stores/locale';
import AppListToolbar from '../../../design/components/AppListToolbar.vue';
import { SURVEY_STATUSES, type SurveyRecord, type SurveyStatus } from '../../surveys/data/surveys';
import { useSurveyLabels } from '../../surveys/labels';
import { monthlyTaskCreation, type WorkbenchFilter } from '../data/workbench';

const props = defineProps<{ records: SurveyRecord[]; today: string; selected: WorkbenchFilter }>();
const emit = defineEmits<{ 'select-stage': [status: SurveyStatus] }>();
const { t } = useI18n();
const localeStore = useLocaleStore();
const { statusLabel } = useSurveyLabels();
const trendEl = ref<HTMLDivElement>();
const ringEl = ref<HTMLDivElement>();
const monthly = computed(() => monthlyTaskCreation(props.records, props.today));
const periodTotal = computed(() => monthly.value.reduce((sum, row) => sum + row.count, 0));
const colors = computed(() => chartThemeColors[themeMode.value]);
const stages = computed(() => SURVEY_STATUSES.map((status, index) => ({
  status, count: props.records.filter(record => record.status === status).length,
  color: colors.value.series[index % colors.value.series.length],
})));
const stageSummary = computed(() => stages.value.map(row => `${statusLabel(row.status)}: ${row.count}`).join('; '));
let trend: echarts.ECharts | undefined;
let ring: echarts.ECharts | undefined;
let observer: ResizeObserver | undefined;
let mounted = false;
let motion: MediaQueryList | undefined;
function render() {
  if (!mounted || !trendEl.value || !ringEl.value) return;
  const theme = colors.value;
  const surface = getComputedStyle(trendEl.value).getPropertyValue('--app-surface').trim();
  const tooltip = { confine: true, renderMode: 'richText' as const, backgroundColor: theme.tooltip, borderColor: theme.axis, textStyle: { color: theme.tooltipText, fontSize: 12 } };
  if (!trend) trend = echarts.init(trendEl.value, undefined, { renderer: 'canvas' });
  if (!ring) {
    ring = echarts.init(ringEl.value, undefined, { renderer: 'canvas' });
    ring.on('click', params => {
      if (params.componentType !== 'series' || params.seriesType !== 'pie') return;
      const status = (params.data as { id?: string })?.id;
      if (SURVEY_STATUSES.some(value => value === status)) emit('select-stage', status as SurveyStatus);
    });
  }
  trend.setOption({
    animation: !motion?.matches, animationDuration: 250,
    textStyle: { fontFamily: 'PingFang SC, -apple-system, sans-serif' },
    tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: theme.axis } } },
    grid: { top: 24, right: 16, bottom: 24, left: 12, containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: monthly.value.map(row => row.month), axisLine: { lineStyle: { color: theme.axis } }, axisTick: { show: false }, axisLabel: { color: theme.text, fontSize: 12, hideOverlap: true, formatter: (value: string) => value.slice(2) } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { color: theme.text, fontSize: 12 }, splitLine: { lineStyle: { color: theme.grid, type: 'dashed' } } },
    series: [{ name: t('workbench.charts.newTasks'), type: 'line', data: monthly.value.map(row => row.count), smooth: false, symbol: 'circle', symbolSize: 6, itemStyle: { color: theme.series[0] }, lineStyle: { width: 2, color: theme.series[0] }, areaStyle: { color: theme.series[0], opacity: 0.06 }, emphasis: { scale: !motion?.matches } }],
  }, true);
  ring.setOption({
    animation: !motion?.matches, animationDuration: 250,
    tooltip: { ...tooltip, trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [{ type: 'pie', radius: ['58%', '80%'], center: ['50%', '50%'], label: { show: false }, labelLine: { show: false }, stillShowZeroSum: false, emphasis: { scale: !motion?.matches }, itemStyle: { borderWidth: 2, borderColor: surface }, data: stages.value.map(row => ({ id: row.status, name: statusLabel(row.status), value: row.count, itemStyle: { color: row.color } })) }],
  }, true);
}
watch([monthly, stages, () => localeStore.locale], async () => { await nextTick(); render(); });
onMounted(() => {
  mounted = true;
  motion = matchMedia('(prefers-reduced-motion: reduce)');
  motion.addEventListener('change', render);
  render();
  observer = new ResizeObserver(() => { trend?.resize(); ring?.resize(); });
  if (trendEl.value) observer.observe(trendEl.value);
  if (ringEl.value) observer.observe(ringEl.value);
});
onBeforeUnmount(() => { mounted = false; observer?.disconnect(); motion?.removeEventListener('change', render); trend?.dispose(); ring?.dispose(); });
</script>

<template>
  <div class="workbench-charts">
    <section class="chart-panel" :aria-label="t('workbench.charts.trend')">
      <AppListToolbar :title="t('workbench.charts.trend')" :summary="t('workbench.charts.periodTotal', { count: periodTotal })" />
      <p class="chart-description">{{ t('workbench.charts.period', { start: monthly[0]?.month, end: monthly[monthly.length - 1]?.month }) }}</p>
      <div ref="trendEl" class="trend-chart" role="img" :aria-label="t('workbench.charts.trendSummary', { count: periodTotal })" />
      <a-empty v-if="!periodTotal" class="trend-empty" :description="t('workbench.charts.noCreation')" />
      <details class="chart-data"><summary>{{ t('workbench.charts.viewData') }}</summary><table><caption>{{ t('workbench.charts.trend') }}</caption><thead><tr><th>{{ t('workbench.charts.month') }}</th><th>{{ t('workbench.charts.newTasks') }}</th></tr></thead><tbody><tr v-for="row in monthly" :key="row.month"><td>{{ row.month }}</td><td>{{ row.count }}</td></tr></tbody></table></details>
    </section>
    <section class="chart-panel" :aria-label="t('workbench.stages')">
      <AppListToolbar :title="t('workbench.stages')" :summary="t('workbench.count', { count: records.length })" />
      <div class="stage-chart-layout">
        <div class="ring-wrapper"><div ref="ringEl" class="ring-chart" role="img" :aria-label="stageSummary" /><span class="ring-total" aria-hidden="true"><span>{{ records.length }}</span>{{ t('workbench.metrics.all') }}</span></div>
        <div class="stage-list"><button v-for="item in stages" :key="item.status" class="stage-row" :aria-pressed="selected === item.status" @click="emit('select-stage', item.status)"><span class="stage-dot" :style="{ backgroundColor: item.color }" aria-hidden="true" /><span>{{ statusLabel(item.status) }}</span><span class="stage-count">{{ item.count }}</span></button></div>
      </div>
      <p v-if="!records.length" class="chart-description">{{ t('workbench.noTasks') }}</p>
    </section>
  </div>
</template>

<style scoped>
.workbench-charts { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--mt-ds-space-3); min-width: 0; }
.chart-panel { min-width: 0; padding: var(--mt-ds-space-4); background: var(--app-surface); border-radius: var(--mt-ds-control-radius); }
.chart-description { margin: 0; color: var(--mt-ds-text-secondary); font-size: var(--mt-ds-font-caption); line-height: var(--mt-ds-line-caption); }
.trend-chart { width: 100%; height: 272px; overflow: hidden; }
.chart-data { margin-top: var(--mt-ds-space-2); font-size: var(--mt-ds-font-caption); color: var(--mt-ds-text-secondary); }
.chart-data summary { width: fit-content; cursor: pointer; padding-block: var(--mt-ds-space-1); }
.chart-data table { border-collapse: collapse; width: 100%; margin-top: var(--mt-ds-space-2); }
.chart-data th, .chart-data td { font-weight: 400; padding: var(--mt-ds-space-1) var(--mt-ds-space-2); border-bottom: 1px solid var(--app-divider); text-align: start; }
.trend-empty { padding-block: var(--mt-ds-space-3); }
.stage-chart-layout { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(160px, 1fr); gap: var(--mt-ds-space-3); align-items: center; }
.ring-wrapper { display: grid; min-width: 0; }
.ring-chart, .ring-total { grid-area: 1 / 1; }
.ring-chart { width: 100%; height: 280px; overflow: hidden; }
.ring-total { place-self: center; display: grid; justify-items: center; gap: var(--mt-ds-space-1); pointer-events: none; font-size: var(--mt-ds-font-caption); color: var(--mt-ds-text-secondary); }
.ring-total > span { font-size: 24px; line-height: 32px; color: var(--mt-ds-text); font-variant-numeric: tabular-nums; }
.stage-list { display: grid; }
.stage-row { display: grid; grid-template-columns: 8px minmax(0, 1fr) 24px; align-items: center; gap: var(--mt-ds-space-2); min-height: 28px; padding: var(--mt-ds-space-1); border: 0; background: transparent; color: var(--mt-ds-text); text-align: start; font: inherit; font-size: var(--mt-ds-font-caption); font-weight: 400; cursor: pointer; }
.stage-row:hover, .stage-row[aria-pressed='true'] { background: var(--color-fill-1); }
.stage-dot { width: 8px; height: 8px; border-radius: 50%; }
.stage-count { text-align: end; font-variant-numeric: tabular-nums; }
.stage-row:focus-visible, summary:focus-visible { outline: 2px solid var(--mt-ds-primary); outline-offset: 2px; }
@media (max-width: 767px) { .workbench-charts { grid-template-columns: minmax(0, 1fr); } .stage-chart-layout { grid-template-columns: minmax(0, 1fr); } .ring-chart { height: 220px; } .stage-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mt-ds-space-1); } .stage-row { min-height: 44px; } }
</style>
