<script setup lang="ts">
/**
 * 问卷工作区 · 步骤 3「条款匹配确认」（05 方案 §3 + 状态机 §7.2 决策表 D1–D7，
 * 2026-10-27 视觉与交互裁决）。
 *
 * 布局：顶部工具条（左 = 7 个带计数页签：全部/适用/不适用/人工确认=是/差异/待核验/
 * 待审核；右 = 参与条目 n/64 + 数据类型分析入口 + 阶段操作按钮；下沿 = 三色图例与
 * 人工优先提示）+ 左栏 8 分组导航（锚点定位）+ 主区分组条款卡列表。
 * 分组标题条 = 左侧主色竖条 + 浅蓝底（显示 N 条），标题取标准条款库二级节原文；
 * 条款卡配色：自动初筛不适用 #E7E6E6、人工确认不适用 #D0CECE、人工与自动不一致
 * 红框（用户指定色值）。条款卡五段：头（条款号 + 主题 + 徽标）→ 原文（3 行折叠）→
 * 元信息/触发依据 → 安全要求展开表（编号/内容/依据文本，数据 = 条目目录）→
 * 分阶段页脚：待确认 = 人工确认下拉（未确认/适用/不适用）+ 判否原因必填（D5/D6）；
 * 匹配审核中 = 审批人逐条「通过/拒绝」+ 备注 + 批量按钮（拒绝走整卷退回 BR-027）；
 * 已锁定及之后 = 只读展示审核留痕。
 *
 * 决策表口径：最终适用性 = 人工确认 ?? 自动值（BR-018）；自动不命中未确认 = 不适用
 * 浅灰卡（D1）；不命中改判适用 = 差异红框（D4，原因可选）；适用改判不适用 = 差异
 * 红框（D5，原因必填）；不命中判否 = 深灰卡非差异（D6，原因必填）；含待定未判定 =
 * 待核验中性态（D7，BR-020 不得判不适用）。重算只写自动列（BR-009）。
 */
import { computed, nextTick, onMounted, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { IconExclamationCircle } from '@arco-design/web-vue/es/icon';
import { useI18n } from 'vue-i18n';
import {
  CLAUSE_GROUPS,
  adoptAutoResults, clauseGroupTitle, clauseTopic, clausesForRecord, clearClauseConfirm,
  engagedItemIndex, ensureSurveyMatching, finalApplicability, isClauseDiff,
  recalculateSurveyMatching, setClauseConfirm,
  submitMatchingForReview,
  type ClauseDef, type ClauseGroupKey, type FinalApplicability,
} from '../data/matching';
import { DEFAULT_QUESTION_VERSION, questionsForVersion } from '../data/questions';
import { promoteItemsToReview } from '../data/itemReview';
import {
  approveAllClauseReviews, pendingReviewClauses, rejectAllClauseReviews, reviewClauseMatch, unreviewClauseMatch,
} from '../data/clauseReview';
import { itemsOfClause } from '../data/items';
import type { ClauseConfirm, ClauseMatchReview, SurveyRecord } from '../data/surveys';

const props = defineProps<{ record: SurveyRecord }>();
const emit = defineEmits<{ (e: 'go-question', code: string): void }>();

const { t } = useI18n();

/** 待确认阶段可写人工确认；匹配审核中开放审批人通过/拒绝；之后只读 */
const confirming = computed(() => props.record.status === 'pending-confirm');
const reviewingStage = computed(() => props.record.status === 'matching-reviewing');
const readonlyStage = computed(() => !confirming.value && !reviewingStage.value);

/* ---------------------------------------------------------------- 初筛快照 */

/** 本卷生效的条款表：按创建快照冻结的规则版本解析（2026-10-28 版本化） */
const clauses = computed<readonly ClauseDef[]>(() => clausesForRecord(props.record));

onMounted(() => {
  // 懒补算（历史数据）→ 指纹变化则重算（只写自动列 BR-009）→ 联动参与条目（BR-031）
  const matching = ensureSurveyMatching(props.record);
  const before = { ...matching.autoResults };
  recalculateSurveyMatching(props.record);
  const changedNos = clauses.value
    .filter((clause) => before[clause.no] !== props.record.matching?.autoResults[clause.no])
    .map((clause) => clause.no);
  if (changedNos.length) {
    recalcNos.value = new Set(changedNos);
    recalcCount.value = changedNos.length;
  }
});

/** 题库（待定题计数、命中题徽标的题干提示）：优先创建快照冻结的题目，历史快照无题目时回落题集版本 */
const questionMap = computed(() => {
  const snapshot = props.record.creationSnapshot?.questions;
  const questions = snapshot?.length
    ? snapshot
    : questionsForVersion(props.record.creationSnapshot?.templateVersion ?? DEFAULT_QUESTION_VERSION);
  return Object.fromEntries(questions.map((question) => [question.code, question]));
});
const pendingQuestionCodes = computed(() => Object.entries(props.record.answers ?? {})
  .filter(([, value]) => value === 'pending')
  .map(([code]) => code));

/* ---------------------------------------------------------------- 行投影与计数 */

type ClauseRow = {
  clause: ClauseDef;
  auto: FinalApplicability | 'undetermined';
  final: FinalApplicability;
  manual?: ClauseConfirm;
  review?: ClauseMatchReview;
  diff: boolean;
};

const rows = computed<ClauseRow[]>(() => clauses.value.map((clause) => {
  const matching = props.record.matching;
  const autoRaw = matching?.autoResults[clause.no];
  return {
    clause,
    auto: autoRaw === 'applicable' ? 'applicable' : autoRaw === 'not-hit' ? 'not-applicable' : 'undetermined',
    final: matching ? finalApplicability(matching, clause.no) : 'pending-review',
    manual: matching?.manual[clause.no],
    review: matching?.reviews?.[clause.no],
    diff: matching ? isClauseDiff(matching, clause.no) : false,
  };
}));

const applicableCount = computed(() => rows.value.filter((row) => row.final === 'applicable').length);
const notApplicableCount = computed(() => rows.value.filter((row) => row.final === 'not-applicable').length);
const manualYesCount = computed(() => rows.value.filter((row) => row.manual?.value === 'applicable').length);
const diffCount = computed(() => rows.value.filter((row) => row.diff).length);
const verifyCount = computed(() => rows.value.filter((row) => row.final === 'pending-review').length);
/** 待审核 = 尚无条款匹配审核记录（匹配审核中阶段由审批人处理） */
const reviewPendingCount = computed(() => pendingReviewClauses(props.record).length);
/** 参与条目（BR-030/031）：数据层已按最终适用性联动，这里只读展示 n/64 */
const engagedItems = computed(() => props.record.matchedCount);
/** 分母 = 该问卷绑定规则的有效条目总数（2026-11-03：不再恒 CLAUSE_ITEM_TOTAL） */
const engagedTotal = computed(() => props.record.totalCount);
const unconfirmedCount = computed(() => rows.value.filter((row) => !row.manual).length);

/* ---------------------------------------------------------------- 页签过滤与分组 */

type TabKey = 'all' | 'applicable' | 'not-applicable' | 'manual-yes' | 'diff' | 'verify' | 'review';
const TAB_DEFS: readonly TabKey[] = ['all', 'applicable', 'not-applicable', 'manual-yes', 'diff', 'verify', 'review'];

const filter = ref<TabKey>('all');
const visibleRows = computed(() => rows.value.filter((row) => {
  switch (filter.value) {
    case 'applicable': return row.final === 'applicable';
    case 'not-applicable': return row.final === 'not-applicable';
    case 'manual-yes': return row.manual?.value === 'applicable';
    case 'diff': return row.diff;
    case 'verify': return row.final === 'pending-review';
    case 'review': return !row.review;
    default: return true;
  }
}));

function tabCount(key: TabKey): number {
  switch (key) {
    case 'all': return clauses.value.length;
    case 'applicable': return applicableCount.value;
    case 'not-applicable': return notApplicableCount.value;
    case 'manual-yes': return manualYesCount.value;
    case 'diff': return diffCount.value;
    case 'verify': return verifyCount.value;
    case 'review': return reviewPendingCount.value;
  }
}

/** 分组标题 = 标准条款库二级节原文（clauseGroupTitle，编号 + 原文标题） */
const groups = computed(() => CLAUSE_GROUPS.map((key) => {
  const groupRows = visibleRows.value.filter((row) => row.clause.group === key);
  return {
    key,
    label: clauseGroupTitle(key),
    rows: groupRows,
    applicable: groupRows.filter((row) => row.final === 'applicable').length,
    total: rows.value.filter((row) => row.clause.group === key).length,
  };
}));
/** 空分组在过滤后隐藏，但导航徽标始终按全量 38 条展示 */
const visibleGroups = computed(() => groups.value.filter((group) => group.rows.length > 0));

function locateGroup(key: ClauseGroupKey) {
  document.getElementById(`sm-group-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------------------------------------------------------- 条款卡呈现 */

const expanded = ref<Set<string>>(new Set());
function toggleOriginal(no: string) {
  const next = new Set(expanded.value);
  if (next.has(no)) next.delete(no);
  else next.add(no);
  expanded.value = next;
}

/** 原文溢出检测（2026-11-02 用户裁决）：折叠限 2 行，内容超过 2 行才显示「查看更多」 */
const overflowNos = ref<Set<string>>(new Set());
function setOriginalEl(no: string, el: unknown) {
  const p = el as HTMLParagraphElement | null;
  if (!p) return;
  // 函数 ref 在挂载（折叠态）时测量：scrollHeight 高于 2 行（22px × 2）才算溢出
  if (p.scrollHeight > p.clientHeight + 1 && !overflowNos.value.has(no)) {
    overflowNos.value = new Set(overflowNos.value).add(no);
  }
}

/** 安全要求展开表：默认收起（summary 行常显），展开后为 编号/内容/依据文本 三列 */
const reqsExpanded = ref<Set<string>>(new Set());
function toggleReqs(no: string) {
  const next = new Set(reqsExpanded.value);
  if (next.has(no)) next.delete(no);
  else next.add(no);
  reqsExpanded.value = next;
}
function reqsOf(no: string) {
  // 只列该问卷规则映射内的条目（2026-11-01 接线）：规则少配条目时「安全要求」也应随之变少
  const engaged = engagedItemIndex(props.record);
  return itemsOfClause(no).filter((item) => !engaged || engaged.has(item.id));
}

function autoBadgeColor(row: ClauseRow): string {
  return row.auto === 'applicable' ? 'green' : row.auto === 'undetermined' ? 'orange' : 'gray';
}
function finalBadgeColor(row: ClauseRow): string {
  return row.final === 'applicable' ? 'green' : row.final === 'not-applicable' ? 'gray' : 'orange';
}

/**
 * 卡片配色（2026-10-27 裁决，优先级从高到低）：
 * 差异 = 红框 > 人工确认不适用 = #D0CECE > 自动初筛不适用 = #E7E6E6 >
 * 适用 = 绿色左条 > 待核验 = 橙色左条 > 白卡。
 */
function cardClass(row: ClauseRow): string[] {
  const classes = ['sm-card-item'];
  if (row.diff) classes.push('sm-card-item--diff');
  else if (row.manual?.value === 'not-applicable') classes.push('sm-card-item--manual-na');
  else if (row.final === 'not-applicable') classes.push('sm-card-item--auto-na');
  else if (row.final === 'applicable') classes.push('sm-card-item--applicable');
  else if (row.final === 'pending-review') classes.push('sm-card-item--verify');
  if (recalcNos.value.has(row.clause.no)) classes.push('sm-card-item--recalc');
  if (focusNos.value.has(row.clause.no)) classes.push('sm-card-item--focus');
  return classes;
}

/** 命中题徽标回跳步骤 2（?q= 定位），由容器统一处理路由 */
function jumpQuestion(code: string) {
  emit('go-question', code);
}

function answerLabel(code: string): string {
  const value = props.record.answers?.[code];
  if (value === 'yes') return t('surveys.workspace.questions.answerYes');
  if (value === 'no') return t('surveys.workspace.questions.answerNo');
  if (value === 'pending') return t('surveys.workspace.questions.answerPending');
  return t('surveys.workspace.questions.answerNone');
}

/* ---------------------------------------------------------------- 条款详情浮层 */

const detailRow = ref<ClauseRow | null>(null);

/* ---------------------------------------------------------------- 人工确认（待确认阶段） */

const reasonDrafts = ref<Record<string, string>>({});
function reasonOf(row: ClauseRow): string {
  return reasonDrafts.value[row.clause.no] ?? row.manual?.reason ?? '';
}
function showReasonOf(row: ClauseRow): boolean {
  return radioValue(row) === 'not-applicable' || row.manual?.value === 'not-applicable' || reasonOf(row) !== '';
}

/**
 * 人工确认下拉的本地草稿值：判否缺原因被拦截时仍保留选中态并展示原因框，
 * 避免下拉回弹导致用户无法补填原因（D5/D6 原因必填的输入路径）。
 */
const localValues = ref<Record<string, '' | ClauseConfirm['value']>>({});
function radioValue(row: ClauseRow): string {
  return localValues.value[row.clause.no] ?? row.manual?.value ?? '';
}

/** 逐条款确认（BR-022/024）：判否原因必填（D5/D6）在入口层拦截；选「未确认」撤销确认 */
async function onConfirmChange(row: ClauseRow, raw: unknown) {
  if (!confirming.value) return;
  const value = String(raw ?? '') as '' | ClauseConfirm['value'];
  localValues.value[row.clause.no] = value;
  if (value === '') {
    try {
      await clearClauseConfirm(props.record.id, row.clause.no);
    } catch {
      Message.error(t('surveys.messages.storageError'));
    }
    return;
  }
  const reason = reasonOf(row).trim();
  if (value === 'not-applicable' && !reason) {
    Message.error(t('surveys.workspace.matching.reasonRequired'));
    return;
  }
  try {
    await setClauseConfirm(props.record.id, row.clause.no, value, reason);
    localValues.value[row.clause.no] = '';
  } catch {
    Message.error(t('surveys.messages.storageError'));
  }
}

/* ---------------------------------------------------------------- 匹配审核（匹配审核中阶段） */

/** 备注草稿：输入即记，随「通过/拒绝」写入审核记录 */
const reviewNotes = ref<Record<string, string>>({});
function noteOf(row: ClauseRow): string {
  return reviewNotes.value[row.clause.no] ?? row.review?.note ?? '';
}
function noteEditable(row: ClauseRow): boolean {
  return reviewingStage.value && !row.review;
}

async function approveClause(row: ClauseRow) {
  if (!reviewingStage.value || row.review) return;
  try {
    const before = props.record.status;
    await reviewClauseMatch(props.record.id, row.clause.no, 'approved', noteOf(row));
    if (before !== 'section-filling' && props.record.status === 'section-filling') Message.success(t('surveys.workspace.matching.review.allLocked'));
    else Message.success(t('surveys.workspace.matching.review.approved', { no: row.clause.no }));
  } catch {
    Message.error(t('surveys.messages.storageError'));
  }
}

async function unreviewClause(row: ClauseRow) {
  if (!reviewingStage.value) return;
  try {
    await unreviewClauseMatch(props.record.id, row.clause.no);
    Message.info(t('surveys.workspace.matching.review.unreviewed', { no: row.clause.no }));
  } catch {
    Message.error(t('surveys.messages.storageError'));
  }
}

/** 单条拒绝：退回意见必填（整卷退回待确认） */
const rejectTarget = ref<ClauseRow | null>(null);
const rejectReason = ref('');
const rejecting = ref(false);

function openReject(row: ClauseRow) {
  rejectTarget.value = row;
  rejectReason.value = '';
}

async function confirmReject() {
  if (rejecting.value || !rejectTarget.value) return;
  if (!rejectReason.value.trim()) {
    Message.error(t('surveys.workspace.matching.review.reasonRequired'));
    return;
  }
  rejecting.value = true;
  try {
    const no = rejectTarget.value.clause.no;
    await reviewClauseMatch(props.record.id, no, 'rejected', rejectReason.value);
    Message.warning(t('surveys.workspace.matching.review.rejected', { no }));
    rejectTarget.value = null;
  } catch {
    Message.error(t('surveys.messages.storageError'));
  } finally {
    rejecting.value = false;
  }
}

/** 批量审核通过：全部待审核条款通过；全部通过后问卷直接进入分区填写中 */
const batchPassOpen = ref(false);
const batchPassing = ref(false);

async function confirmBatchPass() {
  if (batchPassing.value) return;
  batchPassing.value = true;
  try {
    const before = props.record.status;
    const count = await approveAllClauseReviews(props.record.id);
    if (before !== 'section-filling' && props.record.status === 'section-filling') Message.success(t('surveys.workspace.matching.review.allLocked'));
    else Message.success(t('surveys.workspace.matching.review.batchPassDone', { count }));
    batchPassOpen.value = false;
  } catch {
    Message.error(t('surveys.messages.storageError'));
  } finally {
    batchPassing.value = false;
  }
}

/** 批量审核拒绝：全部待审核条款退回重新确认（意见必填） */
const batchRejectOpen = ref(false);
const batchRejectReason = ref('');
const batchRejecting = ref(false);

async function confirmBatchReject() {
  if (batchRejecting.value) return;
  if (!batchRejectReason.value.trim()) {
    Message.error(t('surveys.workspace.matching.review.reasonRequired'));
    return;
  }
  batchRejecting.value = true;
  try {
    const count = await rejectAllClauseReviews(props.record.id, batchRejectReason.value);
    Message.warning(t('surveys.workspace.matching.review.batchRejectDone', { count }));
    batchRejectOpen.value = false;
  } catch {
    Message.error(t('surveys.messages.storageError'));
  } finally {
    batchRejecting.value = false;
  }
}

/* ---------------------------------------------------------------- 批量采用与提交 */

/** 自动判否条款的说明性原因（批量采用时由数据层回调生成） */
function autoReasonBuilder(clause: ClauseDef): string {
  return t('surveys.workspace.matching.autoReason', { expr: clause.exprReadable });
}

const adopting = ref(false);
async function adoptAll() {
  if (adopting.value || !confirming.value) return;
  adopting.value = true;
  try {
    const adopted = await adoptAutoResults(props.record.id, autoReasonBuilder);
    if (adopted > 0) Message.success(t('surveys.workspace.matching.adoptDone', { count: adopted }));
    else Message.info(t('surveys.workspace.matching.adoptNone'));
  } catch {
    Message.error(t('surveys.messages.storageError'));
  } finally {
    adopting.value = false;
  }
}

const submitModalOpen = ref(false);
const submitting = ref(false);

async function confirmSubmit() {
  if (submitting.value || !props.record) return;
  submitting.value = true;
  try {
    const result = await submitMatchingForReview(props.record.id);
    if (result.ok) {
      submitModalOpen.value = false;
      // IT3：条款已由功能负责人确认 → 条目进入待审核（含释放/退回后重新提交的条目）
      promoteItemsToReview(props.record);
      Message.success(t('surveys.workspace.matching.submitSuccess'));
      return;
    }
    submitModalOpen.value = false;
    Message.error(t('surveys.workspace.matching.submitFail', { count: result.unconfirmed.length + result.missingReason.length }));
    await locateProblem([...result.missingReason, ...result.unconfirmed]);
  } catch {
    Message.error(t('surveys.messages.storageError'));
  } finally {
    submitting.value = false;
  }
}

/** 提交门禁失败：切回全部页签并定位第一张问题卡（05 §3.4） */
async function locateProblem(nos: string[]) {
  filter.value = 'all';
  const first = nos[0];
  if (!first) return;
  await nextTick();
  const target = document.getElementById(`sm-clause-${first}`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  focusNos.value = new Set([first]);
  window.setTimeout(() => { focusNos.value = new Set(); }, 2400);
}

const focusNos = ref<Set<string>>(new Set());
const recalcNos = ref<Set<string>>(new Set());
const recalcCount = ref(0);
</script>

<template>
  <div class="step-matching">
    <!-- 顶部工具条：左页签（带计数）+ 右参与条目/分析入口/阶段操作；下沿三色图例 -->
    <section class="sm-card sm-toolbar" :aria-label="t('surveys.workspace.matching.tabsLabel')">
      <div class="sm-toolbar-row">
        <div class="sm-tabs" role="tablist" :aria-label="t('surveys.workspace.matching.tabsLabel')">
          <button
            v-for="key in TAB_DEFS"
            :key="key"
            type="button"
            class="sm-tab"
            role="tab"
            :class="{ active: filter === key }"
            :aria-selected="filter === key ? 'true' : 'false'"
            @click="filter = key"
          >
            {{ t(`surveys.workspace.matching.tabs.${key}`) }}({{ tabCount(key) }})
          </button>
        </div>
        <div class="sm-toolbar-side">
          <span class="sm-engaged">{{ t('surveys.workspace.matching.engagedItems', { engaged: engagedItems, total: engagedTotal }) }}</span>
          <router-link
            class="sm-analysis"
            :to="{ path: '/data-materials/types', query: { survey: record.id } }"
          >
            {{ t('surveys.workspace.matching.dataTypeAnalysis') }}
          </router-link>
          <div v-if="confirming || reviewingStage" class="sm-toolbar-actions">
            <template v-if="confirming">
              <a-button class="app-btn-neutral" :loading="adopting" @click="adoptAll">
                {{ t('surveys.workspace.matching.adoptAll') }}
              </a-button>
              <a-button type="primary" @click="submitModalOpen = true">
                {{ t('surveys.workspace.matching.submit') }}
              </a-button>
            </template>
            <template v-else>
              <a-button
                type="primary"
                :disabled="reviewPendingCount === 0"
                @click="batchPassOpen = true"
              >
                {{ t('surveys.workspace.matching.review.batchPass') }}
              </a-button>
              <a-button
                type="outline"
                status="danger"
                :disabled="reviewPendingCount === 0"
                @click="batchRejectOpen = true"
              >
                {{ t('surveys.workspace.matching.review.batchReject') }}
              </a-button>
            </template>
          </div>
        </div>
      </div>
      <div class="sm-legend">
        <span class="sm-legend-item"><i class="sm-sw sm-sw--auto-na" aria-hidden="true"></i>{{ t('surveys.workspace.matching.legend.autoNa') }}</span>
        <span class="sm-legend-item"><i class="sm-sw sm-sw--manual-na" aria-hidden="true"></i>{{ t('surveys.workspace.matching.legend.manualNa') }}</span>
        <span class="sm-legend-item"><i class="sm-sw sm-sw--diff" aria-hidden="true"></i>{{ t('surveys.workspace.matching.legend.diff') }}</span>
        <span class="sm-legend-hint">{{ t('surveys.workspace.matching.legendHint') }}</span>
      </div>
    </section>

    <!-- 含不确定题提示（步骤 2 补答前相关条款停留在待核验，BR-020） -->
    <p v-if="pendingQuestionCodes.length" class="sm-pending-tip">
      <IconExclamationCircle :size="14" aria-hidden="true" />
      <span>{{ t('surveys.workspace.matching.pendingTip', { codes: pendingQuestionCodes.join('、'), count: pendingQuestionCodes.length }) }}</span>
      <button type="button" class="sm-link" @click="jumpQuestion(pendingQuestionCodes[0])">
        {{ t('surveys.workspace.matching.gotoQuestions') }}
      </button>
    </p>

    <!-- 重算联动横幅（05 §3.3.3 / BR-009：重算不覆盖人工值） -->
    <a-alert v-if="recalcCount > 0" type="warning" class="sm-recalc-banner">
      {{ t('surveys.workspace.matching.recalcBanner', { count: recalcCount }) }}
    </a-alert>

    <!-- 已锁定及之后阶段只读说明 -->
    <a-alert v-if="readonlyStage" type="info" class="sm-recalc-banner">
      {{ t('surveys.workspace.matching.readonlyHint') }}
    </a-alert>

    <div class="sm-columns">
      <!-- 左栏：8 分组导航，徽标 = 适用数/条款数（全量 38 口径） -->
      <nav class="sm-card sm-nav" :aria-label="t('surveys.workspace.matching.groupNav')">
        <h3 class="sm-nav-title">{{ t('surveys.workspace.matching.groupNav') }}</h3>
        <ul class="sm-nav-list">
          <li v-for="group in groups" :key="group.key">
            <button type="button" class="sm-nav-item" @click="locateGroup(group.key)">
              <span class="sm-nav-label">{{ group.key }} {{ group.label }}</span>
              <span class="sm-nav-badge">{{ group.applicable }}/{{ group.total }}</span>
            </button>
          </li>
        </ul>
      </nav>

      <!-- 主区：页签过滤 + 分组条款卡列表 -->
      <div class="sm-list">
        <section
          v-for="group in visibleGroups"
          :id="`sm-group-${group.key}`"
          :key="group.key"
          class="sm-group"
        >
          <h3 class="sm-group-title">
            <span>{{ group.key }} {{ group.label }}</span>
            <span class="sm-group-count">{{ t('surveys.workspace.matching.groupShown', { count: group.rows.length }) }}</span>
          </h3>
          <article
            v-for="row in group.rows"
            :id="`sm-clause-${row.clause.no}`"
            :key="row.clause.no"
            class="sm-card-item"
            :class="cardClass(row)"
          >
            <!-- 头：条款号（详情浮层）+ 主题 + 徽标（自动初筛/最终/差异/审核态） -->
            <header class="sm-item-head">
              <button type="button" class="sm-clause-no" @click="detailRow = row">{{ row.clause.no }}</button>
              <span class="sm-topic">{{ clauseTopic(row.clause.no) }}</span>
              <span class="sm-badges">
                <a-tag size="small" :color="autoBadgeColor(row)">
                  {{ t('surveys.workspace.matching.autoLabel') }}：{{ t(`surveys.workspace.matching.auto.${row.auto}`) }}
                </a-tag>
                <a-tag size="small" :color="finalBadgeColor(row)">
                  {{ t('surveys.workspace.matching.finalLabel') }}：{{ t(`surveys.workspace.matching.final.${row.final}`) }}
                </a-tag>
                <a-tag v-if="row.diff" size="small" color="red">{{ t('surveys.workspace.matching.diffBadge') }}</a-tag>
                <a-tag v-if="row.manual?.value === 'not-applicable'" size="small" color="gray">
                  {{ t('surveys.workspace.matching.legend.manualNa') }}
                </a-tag>
                <template v-if="row.review">
                  <a-tag v-if="row.review.result === 'approved'" size="small" color="green">
                    {{ t('surveys.workspace.matching.review.reviewedBadge') }}
                  </a-tag>
                  <a-tag v-else size="small" color="red">
                    {{ t('surveys.workspace.matching.review.rejectedBadge') }}
                  </a-tag>
                </template>
                <a-tag v-else-if="reviewingStage" size="small" color="orange">
                  {{ t('surveys.workspace.matching.review.pendingBadge') }}
                </a-tag>
                <!-- 2026-11-02 裁决：审核通过 = 条款「已锁定」不可编辑，取消审核才解锁 -->
                <span v-if="readonlyStage || row.review?.result === 'approved'" class="sm-locked-badge">
                  {{ t('surveys.workspace.matching.review.lockedBadge') }}
                </span>
              </span>
            </header>

            <!-- 原文：折叠限 2 行（2026-11-02 裁决），超过 2 行才显示「查看更多」 -->
            <p class="sm-original" :class="{ clamp: !expanded.has(row.clause.no) }" :ref="(el) => setOriginalEl(row.clause.no, el)">{{ row.clause.original }}</p>
            <button v-if="overflowNos.has(row.clause.no)" type="button" class="sm-link sm-expand" @click="toggleOriginal(row.clause.no)">
              {{ t(expanded.has(row.clause.no) ? 'surveys.workspace.matching.collapse' : 'surveys.workspace.matching.expand') }}
            </button>

            <!-- 元信息：第 9 章测试方法 -->
            <div class="sm-meta">
              <span>{{ t('surveys.workspace.matching.meta9') }}{{ row.clause.testChapter }}</span>
              <span>{{ t('surveys.workspace.matching.testLabel') }}{{ row.clause.testMethod }}</span>
            </div>

            <!-- 触发依据：中文可读式 + 涉及题（含作答值）+ 命中题徽标回跳步骤 2 -->
            <div class="sm-trace">
              <span class="sm-trace-rule">
                {{ t('surveys.workspace.matching.traceRule') }}<b>{{ row.clause.exprReadable }}</b>
              </span>
              <span class="sm-trace-sep" aria-hidden="true">｜</span>
              <span>
                {{ t('surveys.workspace.matching.traceQuestions') }}{{ row.clause.hits.map((code) => `${code}=${answerLabel(code)}`).join('、') }}
                <span class="sm-trace-note">{{ t('surveys.workspace.matching.traceNote') }}</span>
              </span>
              <button
                v-for="code in row.clause.hits"
                :key="code"
                type="button"
                class="sm-hit"
                :title="questionMap[code]?.title ?? code"
                @click="jumpQuestion(code)"
              >{{ code }}</button>
            </div>

            <!-- 安全要求展开表：编号规则 条款号-N，依据文本 = 条款原文 -->
            <div class="sm-reqs">
              <button type="button" class="sm-reqs-toggle" :aria-expanded="reqsExpanded.has(row.clause.no) ? 'true' : 'false'" @click="toggleReqs(row.clause.no)">
                <span class="sm-reqs-arrow" aria-hidden="true">{{ reqsExpanded.has(row.clause.no) ? '▼' : '▶' }}</span>
                {{ t('surveys.workspace.matching.reqsSummary', { count: reqsOf(row.clause.no).length, clauseNo: row.clause.no }) }}
              </button>
              <table v-if="reqsExpanded.has(row.clause.no)" class="sm-req-table">
                <thead>
                  <tr>
                    <th scope="col">{{ t('surveys.workspace.matching.reqTable.no') }}</th>
                    <th scope="col">{{ t('surveys.workspace.matching.reqTable.content') }}</th>
                    <th scope="col">{{ t('surveys.workspace.matching.reqTable.basis') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in reqsOf(row.clause.no)" :key="item.id">
                    <td class="sm-req-no">{{ item.id }}</td>
                    <td>{{ item.content }}</td>
                    <td class="sm-req-basis">{{ row.clause.original }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- 页脚 · 待确认阶段：人工确认下拉 + 判否原因必填（D5/D6） -->
            <div v-if="confirming" class="sm-confirm">
              <label class="sm-field">
                <span class="sm-field-label">{{ t('surveys.workspace.matching.confirmTitle') }}</span>
                <a-select
                  class="sm-confirm-select"
                  :model-value="radioValue(row)"
                  :placeholder="t('surveys.workspace.matching.confirmUnconfirmed')"
                  allow-clear
                  @change="(value: unknown) => onConfirmChange(row, value)"
                >
                  <a-option value="applicable">{{ t('surveys.workspace.matching.confirmApplicable') }}</a-option>
                  <a-option value="not-applicable">{{ t('surveys.workspace.matching.confirmNotApplicable') }}</a-option>
                </a-select>
              </label>
              <a-input
                v-if="showReasonOf(row)"
                class="sm-reason"
                :model-value="reasonOf(row)"
                :placeholder="t('surveys.workspace.matching.confirmPlaceholder')"
                :max-length="200"
                @update:model-value="(value: string) => { reasonDrafts[row.clause.no] = value; }"
                @press-enter="() => { if (radioValue(row) === 'not-applicable') onConfirmChange(row, 'not-applicable'); }"
                @change="() => { if (radioValue(row) === 'not-applicable') onConfirmChange(row, 'not-applicable'); }"
              />
              <span v-if="!row.manual" class="sm-confirm-hint">{{ t('surveys.workspace.matching.confirmEmptyHint') }}</span>
            </div>

            <!-- 页脚 · 匹配审核中：审批人通过/拒绝 + 备注 + 留痕 -->
            <div v-else-if="reviewingStage" class="sm-confirm">
              <label class="sm-field">
                <span class="sm-field-label">{{ t('surveys.workspace.matching.confirmTitle') }}</span>
                <a-select class="sm-confirm-select" disabled :model-value="row.manual?.value ?? ''">
                  <a-option v-if="row.manual" :value="row.manual.value">
                    {{ t(`surveys.workspace.matching.confirm${row.manual.value === 'applicable' ? 'Applicable' : 'NotApplicable'}`) }}
                  </a-option>
                </a-select>
              </label>
              <a-input
                v-if="row.manual?.value === 'not-applicable' || row.manual?.reason"
                class="sm-reason"
                :model-value="reasonOf(row)"
                disabled
              />
              <label class="sm-field">
                <span class="sm-field-label">{{ t('surveys.workspace.matching.review.reviewerLabel') }}</span>
                <span class="sm-field-static">{{ record.reviewer || '—' }}</span>
              </label>
              <label class="sm-field sm-field-note">
                <span class="sm-field-label">{{ t('surveys.workspace.matching.review.noteLabel') }}</span>
                <a-input
                  class="sm-note-input"
                  :model-value="noteOf(row)"
                  :disabled="!noteEditable(row)"
                  :placeholder="t('surveys.workspace.matching.review.notePlaceholder')"
                  :max-length="200"
                  @update:model-value="(value: string) => { reviewNotes[row.clause.no] = value; }"
                />
              </label>
              <span class="sm-spacer" aria-hidden="true"></span>
              <template v-if="!row.review">
                <a-button type="primary" size="small" @click="approveClause(row)">
                  {{ t('surveys.workspace.matching.review.pass') }}
                </a-button>
                <a-button type="outline" status="danger" size="small" @click="openReject(row)">
                  {{ t('surveys.workspace.matching.review.reject') }}
                </a-button>
              </template>
              <template v-else-if="row.review.result === 'approved'">
                <a-button type="text" size="small" @click="unreviewClause(row)">
                  {{ t('surveys.workspace.matching.review.unreview') }}
                </a-button>
                <span class="sm-reviewed-at">{{ t('surveys.workspace.matching.review.reviewedAt', { time: row.review.at }) }}</span>
              </template>
            </div>

            <!-- 页脚 · 只读阶段：审核留痕展示 -->
            <div v-else class="sm-confirm sm-confirm-readonly">
              <label class="sm-field">
                <span class="sm-field-label">{{ t('surveys.workspace.matching.confirmTitle') }}</span>
                <span class="sm-field-static">
                  {{ row.manual
                    ? t(`surveys.workspace.matching.confirm${row.manual.value === 'applicable' ? 'Applicable' : 'NotApplicable'}`)
                    : t('surveys.workspace.matching.confirmUnconfirmed') }}
                </span>
              </label>
              <span v-if="row.manual?.reason" class="sm-field-static sm-field-reason">{{ row.manual.reason }}</span>
              <template v-if="row.review">
                <label class="sm-field">
                  <span class="sm-field-label">{{ t('surveys.workspace.matching.review.reviewerLabel') }}</span>
                  <span class="sm-field-static">{{ row.review.by || '—' }}</span>
                </label>
                <span v-if="row.review.note" class="sm-field-static sm-field-reason">{{ row.review.note }}</span>
                <span class="sm-reviewed-at">{{ t('surveys.workspace.matching.review.reviewedAt', { time: row.review.at }) }}</span>
              </template>
            </div>
          </article>
        </section>

        <div v-if="visibleGroups.length === 0" class="sm-empty">
          <a-empty :description="t('surveys.workspace.matching.filterEmpty')" />
        </div>
      </div>
    </div>

    <!-- 条款详情浮层：原文全文 + 测试方法 + 表达式（05 §3.1 右栏浮层的模态实现） -->
    <a-modal
      :visible="detailRow !== null"
      :width="456"
      :title="`${t('surveys.workspace.matching.detailTitle')} · ${detailRow?.clause.no ?? ''}`"
      :footer="false"
      @cancel="detailRow = null"
    >
      <template v-if="detailRow">
        <h4 class="sm-detail-label">{{ t('surveys.workspace.matching.detailOriginal') }}</h4>
        <p class="sm-detail-text">{{ detailRow.clause.original }}</p>
        <h4 class="sm-detail-label">{{ t('surveys.workspace.matching.detailTest', { chapter: detailRow.clause.testChapter }) }}</h4>
        <p class="sm-detail-text">{{ detailRow.clause.testMethod }}</p>
        <h4 class="sm-detail-label">{{ t('surveys.workspace.matching.detailExpr') }}</h4>
        <p class="sm-detail-text sm-detail-code">{{ detailRow.clause.expr }}</p>
        <h4 class="sm-detail-label">{{ t('surveys.workspace.matching.detailReadable') }}</h4>
        <p class="sm-detail-text">{{ detailRow.clause.exprReadable }}</p>
        <h4 class="sm-detail-label">{{ t('surveys.workspace.matching.detailHits') }}</h4>
        <p class="sm-detail-hits">
          <button
            v-for="code in detailRow.clause.hits"
            :key="code"
            type="button"
            class="sm-hit"
            :title="questionMap[code]?.title ?? code"
            @click="detailRow = null; jumpQuestion(code)"
          >{{ code }}</button>
        </p>
      </template>
    </a-modal>

    <!-- 单条拒绝：退回意见必填，整卷退回待确认 -->
    <a-modal
      :visible="rejectTarget !== null"
      :width="456"
      :title="t('surveys.workspace.matching.review.rejectTitle')"
      @cancel="rejectTarget = null"
    >
      <p>{{ t('surveys.workspace.matching.review.rejectBody', { no: rejectTarget?.clause.no ?? '' }) }}</p>
      <a-textarea
        v-model="rejectReason"
        :placeholder="t('surveys.workspace.matching.review.reasonPlaceholder')"
        :max-length="100"
        show-word-limit
        :auto-size="{ minRows: 3, maxRows: 5 }"
      />
      <template #footer>
        <a-button class="app-btn-neutral" @click="rejectTarget = null">{{ t('surveys.actions.cancel') }}</a-button>
        <a-button type="primary" status="danger" :loading="rejecting" @click="confirmReject">
          {{ t('surveys.workspace.matching.review.reject') }}
        </a-button>
      </template>
    </a-modal>

    <!-- 批量审核通过 -->
    <a-modal
      :visible="batchPassOpen"
      :width="456"
      :title="t('surveys.workspace.matching.review.batchPassTitle')"
      @cancel="batchPassOpen = false"
    >
      <p>{{ t('surveys.workspace.matching.review.batchPassBody', { count: reviewPendingCount }) }}</p>
      <template #footer>
        <a-button class="app-btn-neutral" @click="batchPassOpen = false">{{ t('surveys.actions.cancel') }}</a-button>
        <a-button type="primary" :loading="batchPassing" @click="confirmBatchPass">
          {{ t('surveys.workspace.matching.review.batchPassOk') }}
        </a-button>
      </template>
    </a-modal>

    <!-- 批量审核拒绝：退回意见必填 -->
    <a-modal
      :visible="batchRejectOpen"
      :width="456"
      :title="t('surveys.workspace.matching.review.batchRejectTitle')"
      @cancel="batchRejectOpen = false"
    >
      <p>{{ t('surveys.workspace.matching.review.batchRejectBody', { count: reviewPendingCount }) }}</p>
      <a-textarea
        v-model="batchRejectReason"
        :placeholder="t('surveys.workspace.matching.review.reasonPlaceholder')"
        :max-length="100"
        show-word-limit
        :auto-size="{ minRows: 3, maxRows: 5 }"
      />
      <template #footer>
        <a-button class="app-btn-neutral" @click="batchRejectOpen = false">{{ t('surveys.actions.cancel') }}</a-button>
        <a-button type="primary" status="danger" :loading="batchRejecting" @click="confirmBatchReject">
          {{ t('surveys.workspace.matching.review.batchRejectOk') }}
        </a-button>
      </template>
    </a-modal>

    <!-- 提交确认（BR-021 门禁前置说明；失败时服务端校验结果定位问题卡） -->
    <a-modal
      :visible="submitModalOpen"
      :width="456"
      :title="t('surveys.workspace.matching.submitTitle')"
      @cancel="submitModalOpen = false"
    >
      <p>{{ t('surveys.workspace.matching.submitBody', {
        applicable: applicableCount, notApplicable: notApplicableCount, pendingReview: verifyCount,
      }) }}</p>
      <p v-if="unconfirmedCount > 0" class="sm-submit-warn">
        {{ t('surveys.workspace.matching.submitUnconfirmed', { count: unconfirmedCount }) }}
      </p>
      <template #footer>
        <a-button class="app-btn-neutral" @click="submitModalOpen = false">{{ t('surveys.actions.cancel') }}</a-button>
        <a-button type="primary" :loading="submitting" @click="confirmSubmit">{{ t('surveys.workspace.matching.submitOk') }}</a-button>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
.step-matching {
  /* 2026-10-27 用户裁决指定色值：自动初筛不适用 / 人工确认不适用 */
  --sm-auto-na-bg: #E7E6E6;
  --sm-manual-na-bg: #D0CECE;
  display: flex; flex-direction: column; gap: 16px; min-width: 0; font-size: 14px; color: var(--color-text-1);
}
.sm-card { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }

/* 工具条：页签行 + 图例行 */
.sm-toolbar { display: flex; flex-direction: column; gap: 10px; }
.sm-toolbar-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.sm-tabs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.sm-tab {
  height: 32px; padding: 0 12px; border: 1px solid var(--app-control-border); border-radius: 2px;
  background: var(--app-surface); color: var(--color-text-2); font: inherit; font-size: 13px;
  font-variant-numeric: tabular-nums; cursor: pointer; white-space: nowrap;
}
.sm-tab:hover { border-color: var(--app-accent); color: var(--app-accent); }
.sm-tab.active { border-color: var(--app-accent); background: rgb(var(--arcoblue-1)); color: var(--app-accent); font-weight: 600; }
.sm-tab:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.sm-toolbar-side { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; min-width: 0; }
.sm-engaged { color: var(--color-text-1); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sm-analysis { color: var(--app-accent); text-decoration: none; white-space: nowrap; }
.sm-analysis:hover, .sm-analysis:focus-visible { text-decoration: underline; }
.sm-toolbar-actions { display: flex; align-items: center; gap: 8px; }

/* 三色图例（2026-10-27 裁决）：色块不得作为唯一状态表达，徽标/文案同步承载 */
.sm-legend { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.sm-legend-item { display: inline-flex; align-items: center; gap: 6px; color: var(--color-text-2); font-size: 12px; }
.sm-sw { width: 14px; height: 14px; border-radius: 2px; border: 1px solid var(--app-control-border); display: inline-block; }
.sm-sw--auto-na { background: var(--sm-auto-na-bg); }
.sm-sw--manual-na { background: var(--sm-manual-na-bg); }
.sm-sw--diff { background: var(--app-surface); border: 2px solid rgb(var(--red-6)); }
.sm-legend-hint { color: var(--color-text-3); font-size: 12px; }

.sm-pending-tip { display: flex; align-items: flex-start; gap: 6px; margin: 0; color: rgb(var(--orange-6)); font-size: 12px; line-height: 20px; }
.sm-pending-tip svg { flex: none; margin-top: 3px; }
.sm-recalc-banner { border-radius: 2px; }

/* 两栏：240px 分组导航 + 弹性条款列表 */
.sm-columns { display: flex; align-items: stretch; gap: 16px; min-width: 0; }
.sm-nav { flex: none; width: 240px; align-self: flex-start; position: sticky; top: 116px; }
.sm-nav-title { margin: 0 0 12px; color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; }
.sm-nav-list { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
.sm-nav-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border: 0; border-radius: 2px; background: transparent; color: var(--color-text-2); font: inherit; text-align: left; cursor: pointer; }
.sm-nav-item:hover { color: var(--app-accent); background: var(--color-fill-1); }
.sm-nav-item:focus-visible { outline: 2px solid var(--app-accent); outline-offset: -2px; }
.sm-nav-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sm-nav-badge { flex: none; color: var(--color-text-3); font-size: 12px; font-variant-numeric: tabular-nums; }

.sm-list { flex: 1; display: flex; flex-direction: column; gap: 16px; min-width: 0; }

/* 分组标题条：左侧主色竖条 + 浅蓝底（2026-10-27 裁决） */
.sm-group { scroll-margin-top: 116px; }
.sm-group-title {
  display: flex; align-items: baseline; gap: 4px; margin: 0 0 8px; padding: 6px 12px;
  border-left: 4px solid var(--app-accent); border-radius: 2px;
  background: rgb(var(--arcoblue-1)); color: var(--color-text-1); font-size: 14px; font-weight: 600; line-height: 22px;
}
.sm-group-count { font-weight: 400; }

/* 条款卡：白底细框；状态配色见 cardClass（用户指定 #E7E6E6 / #D0CECE / 红框） */
.sm-card-item {
  display: flex; flex-direction: column; gap: 8px; padding: 12px 16px;
  border: 1px solid var(--app-control-border); border-radius: 2px; background: var(--app-surface);
}
.sm-card-item + .sm-card-item { margin-top: 8px; }
.sm-card-item--diff { border: 2px solid rgb(var(--red-6)); }
.sm-card-item--manual-na { background: var(--sm-manual-na-bg); }
.sm-card-item--auto-na { background: var(--sm-auto-na-bg); }
.sm-card-item--applicable { border-left: 3px solid rgb(var(--green-6)); }
.sm-card-item--verify { border-left: 3px solid rgb(var(--orange-6)); }
/* 重算变化短暂高亮 / 提交门禁定位高亮 */
.sm-card-item--recalc { animation: sm-recalc-pulse 2.4s ease-out 1; }
.sm-card-item--focus { outline: 2px solid var(--app-accent); outline-offset: 2px; }
@keyframes sm-recalc-pulse { 0% { background: rgb(var(--arcoblue-1)); } 100% { background: var(--app-surface); } }

.sm-item-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sm-clause-no { padding: 0; border: 0; background: transparent; color: var(--app-accent); font: inherit; font-weight: 600; font-variant-numeric: tabular-nums; cursor: pointer; }
.sm-clause-no:hover, .sm-clause-no:focus-visible { text-decoration: underline; }
.sm-clause-no:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.sm-topic { color: var(--color-text-1); font-weight: 600; }
.sm-badges { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-left: auto; }
.sm-locked-badge {
  display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 2px;
  background: var(--color-text-2); color: var(--app-surface); font-size: 12px; line-height: 20px; white-space: nowrap;
}

.sm-original { margin: 0; color: var(--color-text-1); line-height: 22px; }
.sm-original.clamp { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.sm-expand { align-self: flex-start; }

.sm-meta { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; color: var(--color-text-3); font-size: 12px; }

.sm-trace {
  display: flex; align-items: center; gap: 4px 8px; flex-wrap: wrap; padding: 6px 10px; border-radius: 2px;
  background: var(--color-fill-1); color: var(--color-text-2); font-size: 12px; line-height: 20px;
}
.sm-trace-rule b { color: var(--color-text-1); font-weight: 600; }
.sm-trace-note { color: var(--color-text-3); }
.sm-hit { height: 22px; padding: 0 8px; border: 0; border-radius: 2px; background: rgb(var(--green-1)); color: rgb(var(--green-6)); font: inherit; font-size: 12px; font-variant-numeric: tabular-nums; cursor: pointer; }
.sm-hit:hover { background: rgb(var(--green-2)); }
.sm-hit:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }

/* 安全要求展开表 */
.sm-reqs { min-width: 0; }
.sm-reqs-toggle { display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: transparent; color: var(--app-accent); font: inherit; font-size: 13px; cursor: pointer; }
.sm-reqs-toggle:hover, .sm-reqs-toggle:focus-visible { text-decoration: underline; }
.sm-reqs-toggle:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.sm-reqs-arrow { font-size: 10px; }
.sm-req-table { width: 100%; border-collapse: collapse; margin-top: 8px; background: var(--app-surface); font-size: 12px; line-height: 20px; }
.sm-req-table th, .sm-req-table td { padding: 6px 10px; border: 1px solid var(--app-divider); text-align: left; vertical-align: top; }
.sm-req-table th { background: var(--color-fill-2); color: var(--color-text-2); font-weight: 500; white-space: nowrap; }
.sm-req-table td.sm-req-no { color: var(--color-text-1); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sm-req-table td.sm-req-basis { max-width: 320px; color: var(--color-text-2); }

/* 页脚确认/审核区 */
.sm-confirm { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid var(--app-divider); }
.sm-field { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.sm-field-label { flex: none; color: var(--color-text-2); font-size: 12px; white-space: nowrap; }
.sm-field-static { color: var(--color-text-1); font-size: 13px; }
.sm-field-reason { color: var(--color-text-2); overflow: hidden; text-overflow: ellipsis; max-width: 320px; }
.sm-confirm-select { width: 120px; }
.sm-reason { flex: 1; min-width: 200px; max-width: 320px; }
.sm-field-note { flex: 1; min-width: 200px; }
.sm-note-input { width: 100%; max-width: 240px; }
.sm-spacer { flex: 1; }
.sm-confirm-hint { color: var(--color-text-3); font-size: 12px; }
.sm-reviewed-at { color: var(--color-text-3); font-size: 12px; white-space: nowrap; }

.sm-link { padding: 0; border: 0; background: transparent; color: var(--app-accent); font: inherit; font-size: 12px; cursor: pointer; }
.sm-link:hover, .sm-link:focus-visible { text-decoration: underline; }
.sm-link:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }

.sm-empty { padding: 16px; border-radius: 2px; background: var(--app-surface); }

/* 详情浮层 */
.sm-detail-label { margin: 12px 0 4px; color: var(--color-text-1); font-size: 14px; font-weight: 600; line-height: 22px; }
.sm-detail-label:first-child { margin-top: 0; }
.sm-detail-text { margin: 0; color: var(--color-text-1); line-height: 22px; }
.sm-detail-code { font-family: ui-monospace, monospace; font-size: 12px; }
.sm-detail-hits { display: flex; gap: 8px; margin: 0; }
.sm-submit-warn { margin: 8px 0 0; color: rgb(var(--orange-6)); }

@media (max-width: 1100px) {
  .sm-columns { flex-direction: column; }
  .sm-nav { position: static; width: auto; }
}
</style>
