<script setup lang="ts">
/**
 * 问卷工作区 · 步骤 7「完成度与收集」（原型 tab ⑤ / FR-12）。
 *
 * 三块内容与原型对应关系：
 * A. 测试输入收集看板（单功能）：统计卡 + 缺口清单（行内填「预计提供时间」、提醒状态、去补录）；
 * B. 预计提供时间与提醒：待提醒 / 已提醒 FO / 已逾期·提醒合规专员 / 已提供 四态计数 + 批量提醒；
 * C. 全功能完成度看板：以功能为单位四档统计 + 环形图，功能负责人不可见（FR-02 / FR-03）。
 *
 * 数据不与步骤 6 分叉：同一份证据记录、同一收集率口径（分母 = 参与条目）；
 * 本页只写「预计提供时间」与提醒留痕，证据正文仍在步骤 6 录入（单一录入入口）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { useI18n } from 'vue-i18n';
import * as echarts from 'echarts/core';
import { chartThemeColors } from '../../../design/charts/theme';
import { themeMode } from '../../../design/theme';
import {
  COMPLETION_STAGES, canViewCompletionBoard, collectionRows, completionBoardOf, gapRows, markReminded, notOpenCount,
  setExpectedAt, summarizeCollection, todayText,
  type CollectionRow, type CompletionStage, type ReminderState,
} from '../data/collection';
import { MOCK_CURRENT_USER, surveyRecords, type SurveyRecord } from '../data/surveys';
import { auditRecords } from '../../audit/data/audit';

const props = defineProps<{ record: SurveyRecord }>();
const emit = defineEmits<{ (event: 'go-step', step: number): void }>();

const { t } = useI18n();

const refresh = ref(0);
const bump = () => { refresh.value += 1; };

/* ------------------------------------------------------------ A. 收集统计 */

const today = todayText();

const rows = computed<CollectionRow[]>(() => {
  void refresh.value;
  return collectionRows(props.record, today);
});
const summary = computed(() => summarizeCollection(rows.value));
const gaps = computed(() => gapRows(rows.value));
const notOpen = computed(() => {
  void refresh.value;
  return notOpenCount(props.record);
});
const editable = computed(() => props.record.status !== 'archived');

function stateText(state: ReminderState): string {
  return t(`surveys.workspace.board.reminderStates.${state}`);
}

function stateColor(state: ReminderState): string {
  if (state === 'provided') return 'green';
  if (state === 'overdue') return 'red';
  if (state === 'reminded') return 'blue';
  return 'orange';
}

function missingText(row: CollectionRow): string {
  return row.missing
    .map((field) => t(`surveys.workspace.board.missing.${field}`))
    .join(t('surveys.workspace.board.listSeparator'));
}

/* ------------------------------------------------ 写入：预计提供时间与提醒 */

const remindedToast = ref('');

function onExpectedChange(row: CollectionRow, value: string | undefined) {
  setExpectedAt(props.record, row.itemId, value, MOCK_CURRENT_USER.name);
  bump();
  Message.success(t('surveys.workspace.board.expectedSaved'));
}

function writeReminderAudit(count: number, target: string) {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  auditRecords.unshift({
    id: `AUD-2026-${String(9100 + auditRecords.length).padStart(4, '0')}`,
    time: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    actor: MOCK_CURRENT_USER.name,
    role: 'officer',
    actionType: 'update',
    module: 'evidence',
    targetType: t('surveys.workspace.board.auditTarget'),
    targetName: `${props.record.id} ${props.record.functionName}`,
    summary: t('surveys.workspace.board.auditSummary', { count, target }),
    result: 'success',
  });
}

function remind(targets: CollectionRow[]) {
  if (!targets.length) {
    Message.warning(t('surveys.workspace.board.remindEmpty'));
    return;
  }
  const count = markReminded(props.record, targets.map((row) => row.itemId), MOCK_CURRENT_USER.name);
  writeReminderAudit(count, t('surveys.workspace.board.remindTargetOwner'));
  bump();
  remindedToast.value = t('surveys.workspace.board.remindDone', { count });
  Message.success(remindedToast.value);
}

/** 待提醒 = 未提供且未提醒且未逾期 */
const remindable = computed(() => gaps.value.filter((row) => row.state === 'none' || row.state === 'wait'));

function remindOne(row: CollectionRow) {
  remind([row]);
}

/** 批量只提醒「待提醒」，已逾期交给合规专员处理（原型 B 块口径） */
function remindAll() {
  remind(remindable.value);
}

/* -------------------------------------------------- C. 全功能完成度看板 */

const canViewBoard = computed(() => canViewCompletionBoard(MOCK_CURRENT_USER.role));

const rateCache = computed<Map<string, number | null>>(() => {
  void refresh.value;
  const cache = new Map<string, number | null>();
  for (const record of surveyRecords) cache.set(record.id, summarizeCollection(collectionRows(record, today)).rate);
  return cache;
});

const board = computed(() => completionBoardOf(
  surveyRecords,
  (record) => (record.id === props.record.id ? summary.value.rate : rateCache.value.get(record.id) ?? null),
  props.record.id,
));

const boardRefreshedAt = ref('');

const stageLabel = (stage: CompletionStage) => t(`surveys.workspace.board.stages.${stage}`);

const stageRows = computed(() => COMPLETION_STAGES.map((stage) => {
  const count = board.value.counts[stage];
  const total = board.value.total;
  return { stage, count, percent: total ? Math.round((count / total) * 100) : 0 };
}));

/* 环形图：ECharts 按需注册（主题在 design/charts/theme.ts 统一注册） */
const chartEl = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;
let chartTheme: 'light' | 'dark' | null = null;
let observer: ResizeObserver | null = null;

function chartOption() {
  const mode = themeMode.value === 'dark' ? 'dark' : 'light';
  const theme = chartThemeColors[mode];
  const data = COMPLETION_STAGES.map((stage) => ({
    name: stageLabel(stage),
    value: board.value.counts[stage],
  }));
  return {
    color: [...theme.series],
    tooltip: {
      trigger: 'item',
      formatter: t('surveys.workspace.board.chartTooltip'),
      backgroundColor: theme.tooltip,
      borderWidth: 0,
      textStyle: { color: theme.tooltipText, fontSize: 12 },
    },
    legend: {
      orient: 'vertical' as const,
      right: 0,
      top: 'middle',
      itemWidth: 8,
      itemHeight: 8,
      icon: 'circle',
      textStyle: { color: theme.text, fontSize: 12 },
    },
    series: [{
      type: 'pie' as const,
      radius: ['58%', '80%'],
      center: ['30%', '50%'],
      avoidLabelOverlap: true,
      padAngle: 2,
      label: { show: false },
      labelLine: { show: false },
      data,
    }],
  };
}

function renderChart() {
  if (!chartEl.value || !canViewBoard.value) return;
  const mode = themeMode.value === 'dark' ? 'dark' : 'light';
  if (chart && chartTheme !== mode) {
    chart.dispose();
    chart = null;
  }
  if (!chart) {
    chart = echarts.init(chartEl.value, mode === 'dark' ? 'metritag-dark' : 'metritag');
    chartTheme = mode;
  }
  chart.setOption(chartOption(), true);
}

onMounted(async () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  boardRefreshedAt.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  await nextTick();
  renderChart();
  if (chartEl.value && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => chart?.resize());
    observer.observe(chartEl.value);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  chart?.dispose();
  chart = null;
});

watch(() => [board.value.counts[1], board.value.counts[2], board.value.counts[3], board.value.counts[4], themeMode.value], () => {
  renderChart();
});
</script>

<template>
  <div class="step-collection" data-testid="sc-step">
    <!-- A. 测试输入收集看板（单功能） -->
    <section class="sc-card" :aria-label="t('surveys.workspace.board.summaryTitle')">
      <div class="sc-head">
        <h3 class="sc-title">{{ t('surveys.workspace.board.summaryTitle') }}</h3>
        <a-tag v-if="summary.overdue > 0" size="small" color="red" data-testid="sc-overdue-tag">
          {{ t('surveys.workspace.board.overdueTag', { count: summary.overdue }) }}
        </a-tag>
        <a-tag v-if="notOpen > 0" size="small" color="gray" data-testid="sc-notopen-tag">
          {{ t('surveys.workspace.board.notOpen', { count: notOpen }) }}
        </a-tag>
      </div>

      <dl class="sc-metrics">
        <div class="sc-metric">
          <dt>{{ t('surveys.workspace.board.applicable') }}</dt>
          <dd><span class="sc-value" data-testid="sc-applicable">{{ summary.applicable }}</span></dd>
        </div>
        <div class="sc-metric">
          <dt>{{ t('surveys.workspace.board.inputTotal') }}</dt>
          <dd><span class="sc-value" data-testid="sc-input-total">{{ summary.inputTotal }}</span></dd>
        </div>
        <div class="sc-metric">
          <dt>{{ t('surveys.workspace.board.inputFilled') }}</dt>
          <dd><span class="sc-value" data-testid="sc-input-filled">{{ summary.inputFilled }}</span></dd>
        </div>
        <div class="sc-metric">
          <dt>{{ t('surveys.workspace.board.inputMissing') }}</dt>
          <dd><span class="sc-value" data-testid="sc-input-missing">{{ summary.inputMissing }}</span></dd>
        </div>
        <div class="sc-metric">
          <dt>{{ t('surveys.workspace.board.rate') }}</dt>
          <dd>
            <span class="sc-value" data-testid="sc-rate">
              {{ summary.rate === null ? '—' : t('surveys.workspace.board.rateValue', { rate: summary.rate }) }}
            </span>
            <span class="sc-unit">{{ t('surveys.workspace.board.rateUnit') }}</span>
          </dd>
        </div>
        <div class="sc-metric">
          <dt>{{ t('surveys.workspace.board.overdue') }}</dt>
          <dd><span class="sc-value" :class="{ 'is-danger': summary.overdue > 0 }" data-testid="sc-overdue">{{ summary.overdue }}</span></dd>
        </div>
      </dl>

      <p class="sc-note">{{ t('surveys.workspace.board.rateNote') }}</p>
      <p v-if="summary.evidenceMissing > summary.inputMissing" class="sc-note">
        {{ t('surveys.workspace.board.evidenceGapNote', { count: summary.evidenceMissing - summary.inputMissing }) }}
        <button type="button" class="sc-link" @click="emit('go-step', 6)">{{ t('surveys.workspace.board.goEvidence') }}</button>
      </p>
    </section>

    <!-- A. 缺口清单 -->
    <section class="sc-card" :aria-label="t('surveys.workspace.board.tableTitle', { count: gaps.length })">
      <div class="sc-head">
        <h4 class="sc-subtitle" data-testid="sc-gap-count">{{ t('surveys.workspace.board.tableTitle', { count: gaps.length }) }}</h4>
        <span class="sc-meta">{{ t('surveys.workspace.board.tableMeta') }}</span>
      </div>

      <div class="sc-grid sc-grid-head" role="row">
        <span role="columnheader">{{ t('surveys.workspace.board.columns.item') }}</span>
        <span role="columnheader">{{ t('surveys.workspace.board.columns.summary') }}</span>
        <span role="columnheader">{{ t('surveys.workspace.board.columns.missing') }}</span>
        <span role="columnheader">{{ t('surveys.workspace.board.columns.expected') }}</span>
        <span role="columnheader">{{ t('surveys.workspace.board.columns.reminder') }}</span>
        <span role="columnheader">{{ t('surveys.workspace.board.columns.actions') }}</span>
      </div>

      <div v-if="!gaps.length" class="sc-empty">
        <a-empty :description="t('surveys.workspace.board.emptyGaps')" />
      </div>

      <div
        v-for="row in gaps"
        :key="row.itemId"
        class="sc-grid sc-row"
        :class="`sc-row-${row.state}`"
        role="row"
        :data-item-id="row.itemId"
        :data-state="row.state"
      >
        <span class="sc-cell-no" role="cell">{{ row.itemId }}</span>
        <span class="sc-cell-summary" role="cell">{{ row.summary }}</span>
        <span class="sc-cell-missing" role="cell">{{ missingText(row) }}</span>
        <span class="sc-cell-expected" role="cell">
          <a-date-picker
            v-if="editable"
            size="small"
            :model-value="row.expectedAt"
            value-format="YYYY-MM-DD"
            :placeholder="t('surveys.workspace.board.expectedPlaceholder')"
            :data-testid="`sc-expected-${row.itemId}`"
            @change="(value: string | undefined) => onExpectedChange(row, value)"
          />
          <span v-else>{{ row.expectedAt || '—' }}</span>
        </span>
        <span class="sc-cell-state" role="cell">
          <a-tag size="small" :color="stateColor(row.state)">{{ stateText(row.state) }}</a-tag>
          <span v-if="row.reminded" class="sc-reminded-at">{{ row.reminded.at }}</span>
        </span>
        <span class="sc-cell-actions" role="cell">
          <button
            v-if="row.state !== 'provided' && row.state !== 'overdue' && row.state !== 'reminded' && editable"
            type="button"
            class="sc-action"
            :data-testid="`sc-remind-${row.itemId}`"
            @click="remindOne(row)"
          >{{ t('surveys.workspace.board.remindOwner') }}</button>
          <button type="button" class="sc-action" @click="emit('go-step', 6)">
            {{ t('surveys.workspace.board.goEvidence') }}
          </button>
        </span>
      </div>
    </section>

    <!-- B. 预计提供时间与提醒 -->
    <section class="sc-card" :aria-label="t('surveys.workspace.board.reminderTitle')">
      <div class="sc-head">
        <h4 class="sc-subtitle">{{ t('surveys.workspace.board.reminderTitle') }}</h4>
        <a-button
          size="small"
          class="app-btn-neutral"
          :disabled="!remindable.length || !editable"
          data-testid="sc-remind-all"
          @click="remindAll"
        >
          {{ t('surveys.workspace.board.remindAll', { count: remindable.length }) }}
        </a-button>
      </div>
      <dl class="sc-metrics sc-metrics-reminder">
        <div class="sc-metric">
          <dt>{{ t('surveys.workspace.board.reminderStates.none') }}</dt>
          <dd><span class="sc-value" data-testid="sc-pending">{{ summary.pending }}</span></dd>
        </div>
        <div class="sc-metric">
          <dt>{{ t('surveys.workspace.board.reminderStates.reminded') }}</dt>
          <dd><span class="sc-value" data-testid="sc-reminded">{{ summary.reminded }}</span></dd>
        </div>
        <div class="sc-metric">
          <dt>{{ t('surveys.workspace.board.overdueCompliance') }}</dt>
          <dd><span class="sc-value" :class="{ 'is-danger': summary.overdue > 0 }" data-testid="sc-overdue-b">{{ summary.overdue }}</span></dd>
        </div>
        <div class="sc-metric">
          <dt>{{ t('surveys.workspace.board.reminderStates.provided') }}</dt>
          <dd><span class="sc-value" data-testid="sc-provided">{{ summary.provided }}</span></dd>
        </div>
      </dl>
      <p class="sc-note">{{ t('surveys.workspace.board.reminderNote') }}</p>
      <p v-if="remindedToast" class="sc-note" data-testid="sc-reminded-toast">{{ remindedToast }}</p>
    </section>

    <!-- C. 全功能完成度看板 -->
    <section class="sc-card" :aria-label="t('surveys.workspace.board.completionTitle')">
      <div class="sc-head">
        <h4 class="sc-subtitle">{{ t('surveys.workspace.board.completionTitle') }}</h4>
        <span class="sc-meta" data-testid="sc-board-total">{{ t('surveys.workspace.board.totalFunctions', { count: board.total }) }}</span>
      </div>

      <div v-if="!canViewBoard" class="sc-denied" data-testid="sc-board-denied">
        <p class="sc-denied-title">{{ t('surveys.workspace.board.noPrivilege') }}</p>
        <p class="sc-note">{{ t('surveys.workspace.board.noPrivilegeHint') }}</p>
      </div>

      <div v-else class="sc-board">
        <div
          ref="chartEl"
          class="sc-chart"
          role="img"
          :aria-label="t('surveys.workspace.board.chartAria', { total: board.total })"
          data-testid="sc-board-chart"
        ></div>
        <ul class="sc-stages">
          <li v-for="item in stageRows" :key="item.stage" class="sc-stage" :data-testid="`sc-stage-${item.stage}`">
            <span class="sc-stage-dot" :class="`sc-dot-${item.stage}`" aria-hidden="true"></span>
            <span class="sc-stage-label">{{ stageLabel(item.stage) }}</span>
            <span class="sc-stage-count">{{ item.count }}</span>
            <span class="sc-stage-percent">{{ item.percent }}%</span>
          </li>
        </ul>
      </div>

      <p v-if="board.current" class="sc-note" data-testid="sc-board-current">
        {{ t('surveys.workspace.board.currentFunction', { name: board.current.fuliId + ' ' + board.current.functionName, stage: stageLabel(board.current.stage) }) }}
      </p>
      <p class="sc-note">{{ t('surveys.workspace.board.stageNote') }}</p>
      <p class="sc-note">{{ t('surveys.workspace.board.metaNote', { time: boardRefreshedAt }) }}</p>
    </section>
  </div>
</template>

<style scoped>
.step-collection { display: flex; flex-direction: column; gap: 16px; min-width: 0; color: var(--color-text-1); font-size: 14px; }
.sc-card { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.sc-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.sc-title { margin: 0; color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; }
.sc-subtitle { margin: 0; color: var(--color-text-1); font-size: 14px; font-weight: 600; line-height: 22px; }
.sc-meta { color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.sc-note { margin: 8px 0 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }

/* 指标：标签 14/600 次要色，数值 24/600 主色（DESIGN 指标卡口径），单位 12px 备注色 */
.sc-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px 16px; margin: 12px 0 0; }
.sc-metrics-reminder { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
.sc-metric { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sc-metric dt { color: var(--color-text-2); font-size: 14px; font-weight: 600; line-height: 22px; }
.sc-metric dd { display: flex; align-items: baseline; gap: 4px; margin: 0; }
.sc-value { color: var(--color-text-1); font-size: 24px; font-weight: 600; line-height: 32px; font-variant-numeric: tabular-nums; }
.sc-value.is-danger { color: rgb(var(--danger-6)); }
.sc-unit { color: var(--color-text-3); font-size: 12px; line-height: 20px; }

/* 缺口表：一行一条参与条目，逾期行浅红底 */
.sc-grid { display: grid; grid-template-columns: 96px minmax(0, 1fr) 168px 148px 128px 132px; gap: 12px; align-items: center; padding: 8px 12px; }
.sc-grid-head { margin-top: 12px; border-radius: 2px; background: var(--app-surface-soft); color: var(--color-text-2); font-weight: 600; line-height: 22px; }
.sc-row { border-top: 1px solid var(--app-divider); }
.sc-row-overdue { background: rgb(var(--red-1)); }
.sc-row-reminded { background: rgb(var(--blue-1)); }
.sc-row-provided { background: rgb(var(--green-1)); }
.sc-cell-no { color: var(--color-text-2); font-variant-numeric: tabular-nums; }
.sc-cell-summary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-cell-missing { color: var(--color-text-2); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.sc-cell-state { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
.sc-reminded-at { color: var(--color-text-3); font-size: 12px; line-height: 18px; font-variant-numeric: tabular-nums; }
.sc-cell-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.sc-action { padding: 0; border: none; background: none; color: var(--app-accent); font-size: 13px; line-height: 20px; cursor: pointer; }
.sc-action:hover, .sc-action:focus-visible { text-decoration: underline; }
.sc-link { padding: 0; border: none; background: none; color: var(--app-accent); font-size: 12px; line-height: 20px; cursor: pointer; }
.sc-link:hover, .sc-link:focus-visible { text-decoration: underline; }
.sc-empty { display: grid; place-items: center; min-height: 160px; }

/* 完成度看板：左侧环形图，右侧四档明细（明细同时承担图表的可读数值表） */
.sc-board { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 16px; align-items: center; margin-top: 12px; }
.sc-chart { width: 100%; height: 240px; min-width: 0; }
.sc-stages { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.sc-stage { display: grid; grid-template-columns: 8px minmax(0, 1fr) 40px 44px; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid var(--app-divider); font-size: 13px; line-height: 20px; }
.sc-stage:first-child { border-top: none; }
.sc-stage-dot { width: 8px; height: 8px; border-radius: 50%; }
.sc-dot-1 { background: var(--chart-series-1); }
.sc-dot-2 { background: var(--chart-series-2); }
.sc-dot-3 { background: var(--chart-series-3); }
.sc-dot-4 { background: var(--chart-series-4); }
.sc-stage-label { min-width: 0; color: var(--color-text-2); }
.sc-stage-count { color: var(--color-text-1); font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
.sc-stage-percent { color: var(--color-text-3); font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
.sc-denied { margin-top: 12px; padding: 24px 16px; border-radius: 2px; background: var(--app-surface-soft); text-align: center; }
.sc-denied-title { margin: 0; color: var(--color-text-1); font-size: 14px; font-weight: 600; line-height: 22px; }

@media (max-width: 1100px) {
  .sc-board { grid-template-columns: minmax(0, 1fr); }
  .sc-chart { height: 220px; }
}
@media (max-width: 900px) {
  .sc-grid { grid-template-columns: 88px minmax(0, 1fr); }
  .sc-grid-head span:nth-child(n + 3) { display: none; }
  .sc-cell-missing, .sc-cell-expected, .sc-cell-state, .sc-cell-actions { grid-column: 2; }
}
</style>
