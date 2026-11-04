<script setup lang="ts">
/**
 * 问卷工作区 · 步骤 5「审批与看板」（05 方案 §5，状态机 §3.2 T6/T7/T10/T11、§4 IT1–IT8）。
 *
 * 双视图 + 三种角色（2026-10-26 用户裁决：加角色切换）：
 * - COMP 审核视图：顶部操作条（待审核 · 已锁定 · 差异）+ 一键审核通过 + 退回；
 *   主区 64 条目审核表按 8 组折叠，行 = 条目号 · 安全需求摘要 · 所属条款 · 状态徽标 · 操作。
 * - OWNER 进度视图：同表只读 + 审核进度 + 退回原因横幅（可「开始修改」清除退回标记）。
 * - READ 只读：同表只读，无操作入口。
 * 条目文本来自工作簿原文抽取（data/items.ts），三态 + 未参与与聚合全部由 data/itemReview.ts 计算。
 * 看板与筛选 chips 对齐原型 ④「审核与看板」（GB44464_原型文档 · #rev）：审核进度饼图 + 数字卡片随操作即时更新；
 * 2026-10-27 裁决：证据录入留在步骤 6（BR-037），本步只交付饼图看板 + 筛选 chips + 数字看板。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { useI18n } from 'vue-i18n';
import { CLAUSE_GROUPS, clauseGroupTitle, ensureSurveyMatching, type ClauseGroupKey } from '../data/matching';
import {
  approveAllPending, approveItem, approveSectionReview, ensureItemReview, itemStats, pendingReviewCount,
  promoteItemsToReview, releaseItem, resumeFromReturn, returnSectionReview, returnSurvey, reviewGroups,
  type ReviewRow,
} from '../data/itemReview';
import { MOCK_CURRENT_USER, type SurveyRecord } from '../data/surveys';

const props = defineProps<{ record: SurveyRecord }>();
const emit = defineEmits<{ 'go-step': [no: number] }>();
const { t } = useI18n();

/* ------------------------------------------------------------ 角色与门禁 */

type ReviewRole = 'comp' | 'owner' | 'read';
/** 演示视角切换（mock：真实角色由天枢身份下发，验收见 F-AUTH/F-RBAC） */
const role = ref<ReviewRole>('comp');

const reviewing = computed(() => props.record.status === 'matching-reviewing');
/** 匹配快照已锁定（审批通过即进入分区填写，故以分区填写及之后判定） */
const lockedSnapshot = computed(() => props.record.status === 'section-filling'
  || props.record.status === 'section-reviewing');
const sectionReviewing = computed(() => props.record.status === 'section-reviewing');
/** 审核通过只在「匹配审核中」有效；释放是已锁定问卷的唯一回退通道（I5），锁定后仍开放 */
const canApprove = computed(() => role.value === 'comp' && reviewing.value);
const canRelease = computed(() => role.value === 'comp' && (reviewing.value || lockedSnapshot.value));
const canReturn = computed(() => role.value === 'comp' && reviewing.value);
/** 分区终审（第二阶段）：分区审核中阶段，合规专员可整卷通过（→ 已完成）或退回分区填写 */
const canFinalApprove = computed(() => role.value === 'comp' && sectionReviewing.value && stats.value.allLocked);
const canReturnSection = computed(() => role.value === 'comp' && sectionReviewing.value);
/** 审核人：当前阶段审核责任人；缺省时取当前登录的合规专员（真实值由角色接口下发） */
const actorName = computed(() => props.record.reviewer ?? MOCK_CURRENT_USER.name);

/* -------------------------------------------------------------- 数据视图 */

const refresh = ref(0);
onMounted(() => {
  // 懒补算匹配快照：无快照时条款适用性不可判，条目会全部落在待确认
  ensureSurveyMatching(props.record);
  ensureItemReview(props.record);
});

const stats = computed(() => {
  void refresh.value;
  return itemStats(props.record);
});

const groups = computed(() => {
  void refresh.value;
  return reviewGroups(props.record);
});

/* -------------------------------------------- 审核进度饼图（原型 ④ pieSvg） */

/** SVG fill 属性不吃 var()（2026-11-02 踩坑），全部经 :style 绑定 */
const PIE_RADIUS = 86;
const PIE_COLORS = {
  locked: 'rgb(var(--success-6))',
  'pending-review': 'rgb(var(--primary-6))',
  'pending-confirm': 'rgb(var(--warning-6))',
  excluded: 'var(--color-text-4)',
} as const;

function polar(deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [100 + PIE_RADIUS * Math.sin(rad), 100 - PIE_RADIUS * Math.cos(rad)];
}

/** 扇形路径：0° 指向 12 点方向、顺时针（与原型 pieSvg 同口径） */
function arcPath(start: number, end: number): string {
  const [x0, y0] = polar(start);
  const [x1, y1] = polar(end);
  const large = end - start > 180 ? 1 : 0;
  return `M 100 100 L ${x0.toFixed(3)} ${y0.toFixed(3)} A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${large} 1 ${x1.toFixed(3)} ${y1.toFixed(3)} Z`;
}

interface PieSlice {
  key: keyof typeof PIE_COLORS;
  labelKey: string;
  value: number;
  pct: number;
  start: number;
  end: number;
  color: string;
}

/** 四片语义：已锁定=通过（绿）· 待审核（蓝）· 待确认（橙）· 未参与（灰）；零值片不画 */
const pieSlices = computed<PieSlice[]>(() => {
  void refresh.value;
  const s = stats.value;
  if (!s.total) return [];
  const allParts: Array<{ key: keyof typeof PIE_COLORS; labelKey: string; value: number }> = [
    { key: 'locked', labelKey: 'board.locked', value: s.locked },
    { key: 'pending-review', labelKey: 'board.pendingReview', value: s.pendingReview },
    { key: 'pending-confirm', labelKey: 'board.pendingConfirm', value: s.pendingConfirm },
    { key: 'excluded', labelKey: 'board.excluded', value: s.excluded },
  ];
  const parts = allParts.filter((part) => part.value > 0);
  let angle = 0;
  return parts.map((part) => {
    const sweep = (part.value / s.total) * 360;
    const start = angle;
    angle += sweep;
    return {
      ...part,
      pct: Math.round((part.value / s.total) * 100),
      start,
      end: angle,
      color: PIE_COLORS[part.key],
    };
  });
});

/* ------------------------------------------------ 条目筛选 chips（原型 ④ revBar） */

type ReviewFilter = 'all' | ReviewRow['state'];
const FILTER_KEYS: ReviewFilter[] = ['all', 'pending-review', 'locked', 'pending-confirm', 'excluded'];
const filter = ref<ReviewFilter>('all');

/** 按状态筛选条目：无可见条目的条款与分组整体隐藏（原型 filterReqRows 行为） */
const visibleGroups = computed(() => {
  void refresh.value;
  if (filter.value === 'all') return groups.value;
  return groups.value
    .map((group) => ({
      ...group,
      clauses: group.clauses
        .map((clause) => ({ ...clause, rows: clause.rows.filter((row) => row.state === filter.value) }))
        .filter((clause) => clause.rows.length > 0),
    }))
    .filter((group) => group.clauses.length > 0);
});

const visibleCount = computed(() =>
  visibleGroups.value.reduce(
    (sum, group) => sum + group.clauses.reduce((total, clause) => total + clause.rows.length, 0),
    0,
  ),
);

/** 分组折叠：默认全部展开（8 组 / 64 行一屏可扫） */
const collapsed = reactive<Record<string, boolean>>({});
function toggleGroup(key: ClauseGroupKey) {
  collapsed[key] = !collapsed[key];
}
const allCollapsed = computed(() => CLAUSE_GROUPS.every((key) => collapsed[key]));
function toggleAll() {
  const next = !allCollapsed.value;
  for (const key of CLAUSE_GROUPS) collapsed[key] = next;
}

function groupLabel(key: ClauseGroupKey): string {
  return clauseGroupTitle(key);
}

function stateLabel(state: ReviewRow['state']): string {
  return t(`surveys.workspace.review.states.${state}`);
}

function stateColor(state: ReviewRow['state']): string {
  if (state === 'locked') return 'green';
  if (state === 'pending-review') return 'blue';
  if (state === 'pending-confirm') return 'orange';
  return 'gray';
}

function bump() {
  refresh.value += 1;
}

/* ------------------------------------------------------------ 条目原文弹层 */

const detailRow = ref<ReviewRow | null>(null);

function openDetail(row: ReviewRow) {
  detailRow.value = row;
}

/* ------------------------------------------------------------ 逐条审核 */

function approveOne(row: ReviewRow) {
  try {
    approveItem(props.record, row.id, actorName.value);
    bump();
    Message.success(t('surveys.workspace.review.approveOneSuccess', { id: row.id }));
  } catch {
    Message.error(t('surveys.workspace.review.illegalTransition'));
  }
}

/* 释放（IT6）：原因必填 + 二次确认 + 已关联证据提示 */
const releaseOpen = ref(false);
const releaseTarget = ref<ReviewRow | null>(null);
const releaseReason = ref('');
const releaseError = ref('');

function openRelease(row: ReviewRow) {
  releaseTarget.value = row;
  releaseReason.value = '';
  releaseError.value = '';
  releaseOpen.value = true;
}

function confirmRelease() {
  const row = releaseTarget.value;
  if (!row) return;
  if (!releaseReason.value.trim()) {
    releaseError.value = t('surveys.workspace.review.releaseRequired');
    return;
  }
  try {
    releaseItem(props.record, row.id, releaseReason.value, actorName.value);
    releaseOpen.value = false;
    bump();
    Message.success(t('surveys.workspace.review.releaseSuccess', { id: row.id }));
  } catch {
    Message.error(t('surveys.workspace.review.illegalTransition'));
  }
}

/* -------------------------------------------------------- 一键审核通过 */

const approveAllOpen = ref(false);
const approveAllCount = ref(0);

function openApproveAll() {
  approveAllCount.value = pendingReviewCount(props.record);
  if (!approveAllCount.value) {
    Message.warning(t('surveys.workspace.review.approveAllEmpty'));
    return;
  }
  approveAllOpen.value = true;
}

function confirmApproveAll() {
  const count = approveAllPending(props.record, actorName.value);
  approveAllOpen.value = false;
  bump();
  if (count > 0) Message.success(t('surveys.workspace.review.approveAllSuccess', { count }));
}

/* ------------------------------------------------------------ 整卷退回 */

const returnOpen = ref(false);
const returnReason = ref('');
const returnError = ref('');

function openReturn() {
  returnReason.value = '';
  returnError.value = '';
  returnOpen.value = true;
}

function confirmReturn() {
  if (!returnReason.value.trim()) {
    returnError.value = t('surveys.workspace.review.returnRequired');
    return;
  }
  try {
    returnSurvey(props.record, returnReason.value, actorName.value);
    returnOpen.value = false;
    bump();
    Message.success(t('surveys.workspace.review.returnSuccess'));
    emit('go-step', 3);
  } catch {
    Message.error(t('surveys.workspace.review.illegalTransition'));
  }
}

/* ------------------------------ 第二阶段分区终审（section-reviewing） */

const finalApproveOpen = ref(false);

function openFinalApprove() {
  finalApproveOpen.value = true;
}

async function confirmFinalApprove() {
  try {
    await approveSectionReview(props.record, actorName.value);
    finalApproveOpen.value = false;
    bump();
    Message.success(t('surveys.workspace.review.finalApproveSuccess'));
  } catch {
    Message.error(t('surveys.workspace.review.illegalTransition'));
  }
}

const returnSectionOpen = ref(false);
const returnSectionReason = ref('');
const returnSectionError = ref('');

function openReturnSection() {
  returnSectionReason.value = '';
  returnSectionError.value = '';
  returnSectionOpen.value = true;
}

async function confirmReturnSection() {
  if (!returnSectionReason.value.trim()) {
    returnSectionError.value = t('surveys.workspace.review.returnSectionRequired');
    return;
  }
  try {
    await returnSectionReview(props.record, returnSectionReason.value, actorName.value);
    returnSectionOpen.value = false;
    bump();
    Message.success(t('surveys.workspace.review.returnSectionSuccess'));
    emit('go-step', 4);
  } catch {
    Message.error(t('surveys.workspace.review.illegalTransition'));
  }
}

/* -------------------------------------------------- OWNER 侧重新提交入口 */

function resume() {
  resumeFromReturn(props.record);
  bump();
  Message.success(t('surveys.workspace.review.resumeSuccess'));
  emit('go-step', 3);
}

function promote() {
  const count = promoteItemsToReview(props.record);
  bump();
  if (count > 0) Message.success(t('surveys.workspace.review.promoteSuccess', { count }));
}

/** 全部锁定后的下一步：分区填写中 → 填写分区；已归档 → 证据与导出 */
function nextStep(): number {
  return props.record.status === 'archived' ? 6 : 4;
}
</script>

<template>
  <div class="step-review">
    <!-- 顶部操作条（05 §5.1）：计数 + 角色视角 + 操作 -->
    <section class="sr-card sr-bar" :aria-label="t('surveys.workspace.review.title')">
      <div class="sr-bar-main">
        <div class="sr-bar-head">
          <h3 class="sr-title">{{ t('surveys.workspace.review.title') }}</h3>
          <a-tag v-if="stats.selfReview" size="small" color="orange" :title="t('surveys.workspace.review.selfReviewHint')">
            {{ t('surveys.workspace.review.selfReview') }}
          </a-tag>
          <a-radio-group v-model="role" type="button" size="mini" class="sr-role" :aria-label="t('surveys.workspace.review.rolePreview')">
            <a-radio value="comp">{{ t('surveys.workspace.review.role.comp') }}</a-radio>
            <a-radio value="owner">{{ t('surveys.workspace.review.role.owner') }}</a-radio>
            <a-radio value="read">{{ t('surveys.workspace.review.role.read') }}</a-radio>
          </a-radio-group>
        </div>

        <ul class="sr-counts">
          <li>
            <span class="sr-count-label">{{ t('surveys.workspace.review.bar.pendingReview') }}</span>
            <strong class="sr-count" data-testid="sr-pending-review">{{ stats.pendingReview }}</strong>
          </li>
          <li>
            <span class="sr-count-label">{{ t('surveys.workspace.review.bar.locked') }}</span>
            <strong class="sr-count" data-testid="sr-locked">{{ stats.locked }}</strong>
          </li>
          <li>
            <span class="sr-count-label">{{ t('surveys.workspace.review.bar.diff') }}</span>
            <strong class="sr-count" data-testid="sr-diff">{{ stats.diff }}</strong>
          </li>
        </ul>

        <p class="sr-identity" data-testid="sr-identity">
          {{ t('surveys.workspace.review.identity', {
            pendingConfirm: stats.pendingConfirm, pendingReview: stats.pendingReview,
            locked: stats.locked, excluded: stats.excluded, total: stats.total,
          }) }}
        </p>
        <p class="sr-note">{{ t('surveys.workspace.review.structuralNote', { count: stats.structural }) }}</p>
        <p class="sr-note" data-testid="sr-role-hint">{{ t(`surveys.workspace.review.roleHint.${role}`) }}</p>
      </div>

      <div v-if="role === 'comp'" class="sr-actions">
        <!-- 第二阶段分区终审（section-reviewing）：通过 → 已完成 / 退回 → 分区填写 -->
        <template v-if="sectionReviewing">
          <a-button type="primary" :disabled="!canFinalApprove" data-testid="sr-final-approve" @click="openFinalApprove">
            {{ t('surveys.workspace.review.finalApprove') }}
          </a-button>
          <a-button class="app-btn-neutral" :disabled="!canReturnSection" data-testid="sr-return-section" @click="openReturnSection">
            {{ t('surveys.workspace.review.returnSection') }}
          </a-button>
        </template>
        <!-- 第一阶段（matching-reviewing）：一键审核 + 整卷退回 -->
        <template v-else>
          <a-button type="primary" :disabled="!canApprove" data-testid="sr-approve-all" @click="openApproveAll">
            {{ t('surveys.workspace.review.approveAll') }}
          </a-button>
          <a-button class="app-btn-neutral" :disabled="!canReturn" data-testid="sr-return" @click="openReturn">
            {{ t('surveys.workspace.review.return') }}
          </a-button>
        </template>
      </div>
      <div v-else-if="role === 'owner'" class="sr-actions">
        <a-button v-if="record.returnInfo" type="primary" data-testid="sr-resume" @click="resume">
          {{ t('surveys.workspace.review.resume') }}
        </a-button>
        <a-button v-else-if="stats.pendingConfirm > 0" type="primary" data-testid="sr-promote" @click="promote">
          {{ t('surveys.workspace.review.promote') }}
        </a-button>
        <p v-else class="sr-readonly">{{ t('surveys.workspace.review.ownerReadonly') }}</p>
      </div>
      <div v-else class="sr-actions">
        <p class="sr-readonly">{{ t('surveys.workspace.review.readonlyHint') }}</p>
      </div>
    </section>

    <!-- 审核看板（原型 ④ pieSvg + boardCards）：饼图随逐条审核 / 释放即时更新 -->
    <section class="sr-card sr-board" :aria-label="t('surveys.workspace.review.board.title')">
      <h4 class="sr-table-title">{{ t('surveys.workspace.review.board.title') }}</h4>
      <div class="sr-board-wrap">
        <div class="sr-pie-box" data-testid="sr-pie">
          <svg viewBox="0 0 200 200" width="150" height="150" role="img" :aria-label="t('surveys.workspace.review.board.title')">
            <!-- 单片满圆时 A 弧退化，直接画 circle -->
            <circle
              v-if="pieSlices.length === 1"
              cx="100" cy="100" :r="PIE_RADIUS"
              :style="{ fill: pieSlices[0].color }"
            />
            <template v-else>
              <path
                v-for="slice in pieSlices"
                :key="slice.key"
                :d="arcPath(slice.start, slice.end)"
                :style="{ fill: slice.color }"
              />
            </template>
          </svg>
          <ul class="sr-pie-legend" data-testid="sr-pie-legend">
            <li v-for="slice in pieSlices" :key="slice.key" :data-pie-key="slice.key">
              <span class="sr-swatch" :style="{ background: slice.color }" aria-hidden="true"></span>
              <span class="sr-pie-label">{{ t(`surveys.workspace.review.${slice.labelKey}`) }}</span>
              <span class="sr-pie-count">
                {{ t('surveys.workspace.review.board.pieLegend', { count: slice.value, pct: slice.pct }) }}
              </span>
            </li>
          </ul>
        </div>
        <div class="sr-board-grid">
        <div class="sr-stat" data-testid="sr-board-locked">
          <span class="sr-stat-label">
            <span class="sr-dot sr-dot--success" aria-hidden="true"></span>
            {{ t('surveys.workspace.review.board.locked') }}
          </span>
          <strong class="sr-stat-value" data-testid="sr-locked">{{ stats.locked }} / {{ stats.total }}</strong>
        </div>
        <div class="sr-stat" data-testid="sr-board-pending-review">
          <span class="sr-stat-label">
            <span class="sr-dot sr-dot--primary" aria-hidden="true"></span>
            {{ t('surveys.workspace.review.board.pendingReview') }}
          </span>
          <strong class="sr-stat-value" data-testid="sr-pending-review">{{ stats.pendingReview }}</strong>
        </div>
        <div class="sr-stat" data-testid="sr-board-pending-confirm">
          <span class="sr-stat-label">
            <span class="sr-dot sr-dot--warning" aria-hidden="true"></span>
            {{ t('surveys.workspace.review.board.pendingConfirm') }}
          </span>
          <strong class="sr-stat-value" data-testid="sr-pending-confirm">{{ stats.pendingConfirm }}</strong>
        </div>
        <div class="sr-stat" data-testid="sr-board-excluded">
          <span class="sr-stat-label">
            <span class="sr-dot sr-dot--neutral" aria-hidden="true"></span>
            {{ t('surveys.workspace.review.board.excluded') }}
          </span>
          <strong class="sr-stat-value" data-testid="sr-excluded">{{ stats.excluded }}</strong>
        </div>
        <div class="sr-stat" data-testid="sr-board-diff">
          <span class="sr-stat-label">{{ t('surveys.workspace.review.board.diff') }}</span>
          <strong class="sr-stat-value" data-testid="sr-diff">{{ stats.diff }}</strong>
        </div>
        <div class="sr-stat" data-testid="sr-board-clause-progress">
          <span class="sr-stat-label">{{ t('surveys.workspace.review.board.clauseProgress') }}</span>
          <strong class="sr-stat-value" data-testid="sr-progress">{{ stats.lockedClauses }} / {{ stats.totalClauses }}</strong>
        </div>
        <div class="sr-stat" data-testid="sr-board-total">
          <span class="sr-stat-label">{{ t('surveys.workspace.review.board.total') }}</span>
          <strong class="sr-stat-value" data-testid="sr-total">{{ stats.total }}</strong>
        </div>
        </div>
      </div>
    </section>

    <!-- 退回原因横幅（OWNER/READ）：步进条第 ⑤ 步已回落到第 ③ 步 -->
    <a-alert v-if="record.returnInfo && role !== 'comp'" type="error" class="sr-banner" data-testid="sr-return-banner">
      {{ t('surveys.workspace.review.returnBanner', { reason: record.returnInfo.reason }) }}
      <template #description>
        {{ t('surveys.workspace.review.returnHint', { operator: record.returnInfo.operator, time: record.returnInfo.time }) }}
      </template>
    </a-alert>

    <!-- 全部参与条目已锁定：问卷已锁定（05 §5.3） -->
    <a-alert v-if="stats.allLocked && !record.returnInfo" type="success" class="sr-banner" data-testid="sr-locked-banner">
      {{ t('surveys.workspace.review.lockedBanner') }}
      <template #description>
        <button type="button" class="sr-inline-link" @click="emit('go-step', nextStep())">
          {{ t(props.record.status === 'archived' ? 'surveys.workspace.review.lockedNextEvidence' : 'surveys.workspace.review.lockedNextSections') }}
        </button>
      </template>
    </a-alert>

    <!-- 待确认条目等待功能负责人重新确认（释放/条目退回后的闭环） -->
    <a-alert v-if="role !== 'read' && stats.pendingConfirm > 0 && !record.returnInfo" type="warning" class="sr-banner" data-testid="sr-pending-confirm-banner">
      {{ t('surveys.workspace.review.pendingConfirmHint', { count: stats.pendingConfirm }) }}
    </a-alert>

    <!-- 主区：64 条目审核表（按 8 组折叠） -->
    <section class="sr-card sr-table-card" :aria-label="t('surveys.workspace.review.tableTitle')">
      <div class="sr-table-head">
        <h4 class="sr-table-title">{{ t('surveys.workspace.review.tableTitle', { count: stats.total }) }}</h4>
        <button type="button" class="sr-inline-link" @click="toggleAll">
          {{ t(allCollapsed ? 'surveys.workspace.review.expandAll' : 'surveys.workspace.review.collapseAll') }}
        </button>
      </div>

      <!-- 条目筛选 chips（原型 ④ revBar：全部 / 待审核 / 已锁定 / 待确认 / 未参与） -->
      <div class="sr-filters" role="group" :aria-label="t('surveys.workspace.review.filters.all')">
        <button
          v-for="key in FILTER_KEYS"
          :key="key"
          type="button"
          class="sr-chip"
          :class="{ active: filter === key }"
          :data-testid="`sr-filter-${key}`"
          :aria-pressed="filter === key"
          @click="filter = key"
        >
          {{ t(`surveys.workspace.review.filters.${key}`) }}
        </button>
      </div>
      <p class="sr-filter-summary" data-testid="sr-filter-summary">
        {{ t('surveys.workspace.review.filterSummary', {
          shown: visibleCount, total: stats.total, clauses: stats.totalClauses,
          locked: stats.locked, pendingReview: stats.pendingReview,
          pendingConfirm: stats.pendingConfirm, excluded: stats.excluded,
        }) }}
      </p>

      <div class="sr-grid sr-grid-head" :class="{ 'sr-with-actions': role === 'comp' }" role="row">
        <span role="columnheader">{{ t('surveys.workspace.review.columns.item') }}</span>
        <span role="columnheader">{{ t('surveys.workspace.review.columns.summary') }}</span>
        <span role="columnheader">{{ t('surveys.workspace.review.columns.clause') }}</span>
        <span role="columnheader">{{ t('surveys.workspace.review.columns.state') }}</span>
        <span v-if="role === 'comp'" role="columnheader">{{ t('surveys.workspace.review.columns.actions') }}</span>
      </div>

      <p v-if="visibleCount === 0" class="sr-filter-empty" data-testid="sr-filter-empty">
        {{ t('surveys.workspace.review.filterEmpty') }}
      </p>

      <div v-for="group in visibleGroups" :key="group.key" class="sr-group">
        <button
          type="button"
          class="sr-group-head"
          :aria-expanded="!collapsed[group.key]"
          @click="toggleGroup(group.key)"
        >
          <span class="sr-group-caret" :class="{ open: !collapsed[group.key] }" aria-hidden="true"></span>
          <span class="sr-group-title">{{ groupLabel(group.key) }}</span>
          <span class="sr-group-meta">
            {{ t('surveys.workspace.review.groupMeta', {
              clauses: group.clauses.length,
              items: group.clauses.reduce((sum, clause) => sum + clause.rows.length, 0),
              locked: group.clauses.filter((clause) => clause.locked).length,
            }) }}
          </span>
        </button>

        <div v-show="!collapsed[group.key]" class="sr-group-body">
          <template v-for="clause in group.clauses" :key="clause.no">
            <div class="sr-clause-row">
              <span class="sr-clause-no">{{ clause.no }}</span>
              <span class="sr-clause-origin">{{ clause.origin }}</span>
              <a-tag size="small" :color="clause.locked ? 'green' : 'gray'">
                {{ t(clause.locked ? 'surveys.workspace.review.clauseLocked' : 'surveys.workspace.review.clauseUnlocked') }}
              </a-tag>
            </div>

            <div
              v-for="row in clause.rows"
              :key="row.id"
              class="sr-grid sr-row"
              :class="{
                'sr-with-actions': role === 'comp',
                'sr-row-locked': row.state === 'locked' && row.kind === 'requirement',
                'sr-row-excluded': row.state === 'excluded',
                'sr-row-segment': row.kind === 'segment',
              }"
              role="row"
              :data-item-id="row.id"
              :data-state="row.state"
            >
              <span class="sr-cell-no" role="cell">{{ row.id }}</span>
              <span class="sr-cell-summary" role="cell">
                <button type="button" class="sr-summary-link" @click="openDetail(row)">{{ row.summary }}</button>
                <a-tag v-if="row.kind === 'segment'" size="small" color="gray">{{ t('surveys.workspace.review.segmentBadge') }}</a-tag>
                <a-tag v-if="row.state === 'excluded'" size="small" color="gray">{{ t('surveys.workspace.review.states.excluded') }}</a-tag>
              </span>
              <span class="sr-cell-clause" role="cell">
                <router-link class="sr-clause-link" :to="{ name: 'survey-detail-steps', params: { id: record.id, step: '3' } }">
                  {{ row.no }}
                </router-link>
              </span>
              <span class="sr-cell-state" role="cell">
                <a-tag size="small" :color="stateColor(row.state)">{{ stateLabel(row.state) }}</a-tag>
                <span v-if="row.reviewer" class="sr-auditor">{{ t('surveys.workspace.review.reviewerAt', { reviewer: row.reviewer, time: row.reviewedAt ?? '' }) }}</span>
              </span>
              <span v-if="role === 'comp'" class="sr-cell-actions" role="cell">
                <template v-if="row.kind === 'requirement' && row.state === 'pending-review'">
                  <button type="button" class="sr-action-link" :disabled="!canApprove" @click="approveOne(row)">
                    {{ t('surveys.workspace.review.actions.approve') }}
                  </button>
                </template>
                <template v-else-if="row.kind === 'requirement' && row.state === 'locked'">
                  <button type="button" class="sr-action-link sr-action-danger" :disabled="!canRelease" @click="openRelease(row)">
                    {{ t('surveys.workspace.review.actions.release') }}
                  </button>
                </template>
                <span v-else class="sr-action-empty">—</span>
              </span>
            </div>
          </template>
        </div>
      </div>
    </section>

    <!-- 一键审核通过确认（05 §5.2.3：显示「将锁定 n 条」，不触碰待确认） -->
    <a-modal
      :visible="approveAllOpen"
      :width="456"
      :title="t('surveys.workspace.review.approveAllTitle')"
      @cancel="approveAllOpen = false"
    >
      <p>{{ t('surveys.workspace.review.approveAllBody', { count: approveAllCount }) }}</p>
      <template #footer>
        <a-button class="app-btn-neutral" @click="approveAllOpen = false">{{ t('surveys.actions.cancel') }}</a-button>
        <a-button type="primary" @click="confirmApproveAll">{{ t('surveys.workspace.review.approveAllOk') }}</a-button>
      </template>
    </a-modal>

    <!-- 释放（IT6）：原因必填 + 二次确认 -->
    <a-modal
      :visible="releaseOpen"
      :width="456"
      :title="t('surveys.workspace.review.releaseTitle', { id: releaseTarget?.id ?? '' })"
      @cancel="releaseOpen = false"
    >
      <p>{{ t('surveys.workspace.review.releaseBody') }}</p>
      <p class="sr-modal-target">{{ releaseTarget?.summary }}</p>
      <a-textarea
        v-model="releaseReason"
        :placeholder="t('surveys.workspace.review.releasePlaceholder')"
        :max-length="200"
        show-word-limit
        :auto-size="{ minRows: 3, maxRows: 5 }"
        :error="Boolean(releaseError)"
      />
      <p v-if="releaseError" class="sr-modal-error">{{ releaseError }}</p>
      <template #footer>
        <a-button class="app-btn-neutral" @click="releaseOpen = false">{{ t('surveys.actions.cancel') }}</a-button>
        <a-button type="primary" @click="confirmRelease">{{ t('surveys.workspace.review.releaseOk') }}</a-button>
      </template>
    </a-modal>

    <!-- 整卷退回：意见必填 -->
    <a-modal
      :visible="returnOpen"
      :width="456"
      :title="t('surveys.workspace.review.returnTitle')"
      @cancel="returnOpen = false"
    >
      <p>{{ t('surveys.workspace.review.returnBody') }}</p>
      <a-textarea
        v-model="returnReason"
        :placeholder="t('surveys.workspace.review.returnPlaceholder')"
        :max-length="300"
        show-word-limit
        :auto-size="{ minRows: 3, maxRows: 6 }"
        :error="Boolean(returnError)"
      />
      <p v-if="returnError" class="sr-modal-error">{{ returnError }}</p>
      <template #footer>
        <a-button class="app-btn-neutral" @click="returnOpen = false">{{ t('surveys.actions.cancel') }}</a-button>
        <a-button type="primary" @click="confirmReturn">{{ t('surveys.workspace.review.returnOk') }}</a-button>
      </template>
    </a-modal>

    <!-- 第二阶段分区终审 · 通过（section-reviewing → archived） -->
    <a-modal
      :visible="finalApproveOpen"
      :width="456"
      :title="t('surveys.workspace.review.finalApproveTitle')"
      @cancel="finalApproveOpen = false"
    >
      <p>{{ t('surveys.workspace.review.finalApproveBody') }}</p>
      <template #footer>
        <a-button class="app-btn-neutral" @click="finalApproveOpen = false">{{ t('surveys.actions.cancel') }}</a-button>
        <a-button type="primary" @click="confirmFinalApprove">{{ t('surveys.workspace.review.finalApproveOk') }}</a-button>
      </template>
    </a-modal>

    <!-- 第二阶段分区终审 · 退回分区填写（section-reviewing → section-filling） -->
    <a-modal
      :visible="returnSectionOpen"
      :width="456"
      :title="t('surveys.workspace.review.returnSectionTitle')"
      @cancel="returnSectionOpen = false"
    >
      <p>{{ t('surveys.workspace.review.returnSectionBody') }}</p>
      <a-textarea
        v-model="returnSectionReason"
        :placeholder="t('surveys.workspace.review.returnSectionPlaceholder')"
        :max-length="300"
        show-word-limit
        :auto-size="{ minRows: 3, maxRows: 6 }"
        :error="Boolean(returnSectionError)"
      />
      <p v-if="returnSectionError" class="sr-modal-error">{{ returnSectionError }}</p>
      <template #footer>
        <a-button class="app-btn-neutral" @click="returnSectionOpen = false">{{ t('surveys.actions.cancel') }}</a-button>
        <a-button type="primary" @click="confirmReturnSection">{{ t('surveys.workspace.review.returnSectionOk') }}</a-button>
      </template>
    </a-modal>

    <!-- 条目原文（工作簿 E 列原文 + 文档侧要求） -->
    <a-modal
      :visible="Boolean(detailRow)"
      :width="560"
      :title="t('surveys.workspace.review.detailTitle', { id: detailRow?.id ?? '' })"
      @cancel="detailRow = null"
    >
      <dl v-if="detailRow" class="sr-detail">
        <dt>{{ t('surveys.workspace.review.detailClause') }}</dt>
        <dd>{{ detailRow.no }}</dd>
        <dt>{{ t('surveys.workspace.review.detailSegment') }}</dt>
        <dd>{{ t(`surveys.workspace.review.segment.${detailRow.segment}`) }}</dd>
        <dt>{{ t('surveys.workspace.review.detailContent') }}</dt>
        <dd class="sr-detail-pre">{{ detailRow.content }}</dd>
        <template v-if="detailRow.release">
          <dt>{{ t('surveys.workspace.review.detailRelease') }}</dt>
          <dd>{{ detailRow.release.reason }}（{{ detailRow.release.operator }} {{ detailRow.release.time }}）</dd>
        </template>
      </dl>
      <template #footer>
        <a-button class="app-btn-neutral" @click="detailRow = null">{{ t('surveys.workspace.review.closeDetail') }}</a-button>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
.step-review { display: flex; flex-direction: column; gap: 16px; min-width: 0; font-size: 14px; color: var(--color-text-1); }
.sr-card { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.sr-title { margin: 0; color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; }

/* 顶部操作条 */
.sr-bar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.sr-bar-main { flex: 1; min-width: 0; }
.sr-bar-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sr-role { margin-left: auto; }
.sr-counts { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 12px 0 0; padding: 0; list-style: none; }
.sr-counts li { display: flex; align-items: baseline; gap: 6px; }
.sr-count-label { color: var(--color-text-2); }
.sr-count { color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; font-variant-numeric: tabular-nums; }

/* 审核看板：饼图（原型 ④ pieSvg）+ 数字卡片（boardCards，状态用色点 + 文字共同表达） */
.sr-board { display: flex; flex-direction: column; gap: 12px; }
.sr-board-wrap { display: flex; align-items: center; flex-wrap: wrap; gap: 16px 32px; }
.sr-pie-box { flex: none; display: flex; align-items: center; gap: 16px; }
.sr-pie-box svg { flex: none; }
.sr-pie-legend { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.sr-pie-legend li { display: flex; align-items: center; gap: 8px; font-size: 12px; line-height: 20px; }
.sr-swatch { flex: none; width: 8px; height: 8px; border-radius: 2px; }
.sr-pie-label { color: var(--color-text-1); }
.sr-pie-count { color: var(--color-text-2); font-variant-numeric: tabular-nums; }
.sr-board-grid { flex: 1; min-width: 260px; display: grid; grid-template-columns: repeat(auto-fit, minmax(136px, 1fr)); gap: 12px; }
.sr-stat { display: flex; flex-direction: column; gap: 4px; padding: 12px; border: 1px solid var(--app-divider); border-radius: 2px; background: var(--app-surface); }
.sr-stat-label { display: flex; align-items: center; gap: 6px; color: var(--color-text-2); font-size: 12px; line-height: 20px; }
.sr-stat-value { color: var(--color-text-1); font-size: 20px; font-weight: 600; line-height: 28px; font-variant-numeric: tabular-nums; }
.sr-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }
.sr-dot--success { background: rgb(var(--success-6)); }
.sr-dot--primary { background: rgb(var(--primary-6)); }
.sr-dot--warning { background: rgb(var(--warning-6)); }
.sr-dot--neutral { background: var(--color-text-4); }

/* 条目筛选 chips（原型 ④ revBar，与 StepEvidence .se-chip 同口径） */
.sr-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
.sr-chip { padding: 2px 10px; border: 1px solid var(--app-control-border); border-radius: 2px; background: var(--app-surface); color: var(--color-text-2); font: inherit; font-size: 12px; line-height: 20px; cursor: pointer; }
.sr-chip:hover { border-color: var(--app-accent); color: var(--app-accent); }
.sr-chip.active { border-color: var(--app-accent); background: var(--color-primary-light-1); color: var(--app-accent); }
.sr-chip:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.sr-filter-summary { margin: 0 0 8px; color: var(--color-text-3); font-size: 12px; line-height: 20px; font-variant-numeric: tabular-nums; }
.sr-filter-empty { margin: 8px 0; padding: 24px 0; color: var(--color-text-3); font-size: 13px; line-height: 20px; text-align: center; }
.sr-identity { margin: 8px 0 0; color: var(--color-text-2); font-size: 12px; line-height: 20px; font-variant-numeric: tabular-nums; }
.sr-note { margin: 4px 0 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.sr-actions { flex: none; display: flex; flex-direction: column; gap: 8px; }
.sr-actions .arco-btn { width: 160px; }
.sr-readonly { max-width: 220px; margin: 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.sr-banner { border-radius: 2px; }

/* 审核表：白底、无外框、行间 1px 分隔（DESIGN.md · Table · Enterprise list） */
.sr-table-card { padding: 16px 16px 8px; }
.sr-table-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 8px; }
.sr-table-title { margin: 0; color: var(--color-text-1); font-size: 14px; font-weight: 600; line-height: 22px; }
.sr-inline-link { padding: 0; border: none; background: none; color: var(--app-accent); font-size: 13px; line-height: 20px; cursor: pointer; }
.sr-inline-link:hover, .sr-inline-link:focus-visible { text-decoration: underline; }
.sr-inline-link:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }

.sr-grid {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) 104px 140px;
  gap: 12px;
  align-items: center;
  padding: 8px 12px;
}
.sr-grid-head { background: var(--app-surface-soft); color: var(--color-text-2); font-size: 14px; font-weight: 600; line-height: 22px; border-radius: 2px; }
.sr-grid.sr-with-actions { grid-template-columns: 96px minmax(0, 1fr) 104px 140px 120px; }
.sr-group { border-bottom: 1px solid var(--app-divider); }
.sr-group:last-child { border-bottom: none; }
.sr-group-head {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 12px;
  border: none; background: none; color: var(--color-text-1); font-size: 14px; font-weight: 600; line-height: 22px; text-align: left; cursor: pointer;
}
.sr-group-head:hover, .sr-group-head:focus-visible { background: var(--app-surface-soft); }
.sr-group-head:focus-visible { outline: 2px solid var(--app-accent); outline-offset: -2px; }
.sr-group-caret { width: 6px; height: 6px; border-right: 1.5px solid var(--color-text-3); border-bottom: 1.5px solid var(--color-text-3); transform: rotate(-45deg); transition: transform 0.15s ease; }
.sr-group-caret.open { transform: rotate(45deg); }
.sr-group-title { flex: 1; min-width: 0; }
.sr-group-meta { color: var(--color-text-3); font-size: 12px; font-weight: 400; line-height: 20px; font-variant-numeric: tabular-nums; }

/* 条款小节行：条款号 + 原文摘要 + 派生锁定态 */
.sr-clause-row { display: flex; align-items: center; gap: 12px; padding: 8px 12px 4px; border-top: 1px solid var(--app-divider); }
.sr-clause-no { flex: none; width: 84px; color: var(--color-text-1); font-weight: 600; font-variant-numeric: tabular-nums; }
.sr-clause-origin { flex: 1; min-width: 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 条目行 */
.sr-row { border-top: 1px solid var(--app-divider); }
.sr-row-locked { background: rgb(var(--green-1)); }
.sr-row-excluded { color: var(--color-text-3); }
.sr-row-segment { background: var(--app-surface-soft); }
.sr-cell-no { color: var(--color-text-2); font-variant-numeric: tabular-nums; }
.sr-cell-summary { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sr-summary-link { padding: 0; border: none; background: none; color: inherit; font-size: 14px; line-height: 22px; text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr-summary-link:hover, .sr-summary-link:focus-visible { color: var(--app-accent); text-decoration: underline; }
.sr-summary-link:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.sr-cell-clause { min-width: 0; }
.sr-clause-link { color: var(--app-accent); font-size: 14px; line-height: 22px; text-decoration: none; font-variant-numeric: tabular-nums; }
.sr-clause-link:hover, .sr-clause-link:focus-visible { text-decoration: underline; }
.sr-cell-state { display: flex; flex-direction: column; gap: 2px; }
.sr-auditor { color: var(--color-text-3); font-size: 12px; line-height: 18px; font-variant-numeric: tabular-nums; }
.sr-cell-actions { display: flex; align-items: center; gap: 12px; }
.sr-action-link { padding: 0; border: none; background: none; color: var(--app-accent); font-size: 13px; line-height: 20px; cursor: pointer; }
.sr-action-link:hover:not(:disabled), .sr-action-link:focus-visible:not(:disabled) { text-decoration: underline; }
.sr-action-link:disabled { color: var(--color-text-3); cursor: not-allowed; }
.sr-action-danger { color: rgb(var(--danger-6)); }
.sr-action-empty { color: var(--color-text-3); }
.sr-modal-target { margin: 0 0 12px; padding: 8px 12px; border-radius: 2px; background: var(--app-surface-soft); color: var(--color-text-2); font-size: 13px; line-height: 20px; }
.sr-modal-error { margin: 8px 0 0; color: rgb(var(--danger-6)); font-size: 12px; line-height: 20px; }
.sr-detail { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 8px 12px; margin: 0; }
.sr-detail dt { color: var(--color-text-2); }
.sr-detail dd { margin: 0; color: var(--color-text-1); overflow-wrap: anywhere; }
.sr-detail-pre { white-space: pre-wrap; }

@media (max-width: 900px) {
  .sr-bar { flex-direction: column; }
  .sr-actions { width: 100%; }
  .sr-actions .arco-btn { width: 100%; }
  .sr-grid { grid-template-columns: 84px minmax(0, 1fr); }
  .sr-grid-head span:nth-child(n + 3) { display: none; }
  .sr-cell-clause, .sr-cell-state, .sr-cell-actions { grid-column: 2; }
}
</style>
