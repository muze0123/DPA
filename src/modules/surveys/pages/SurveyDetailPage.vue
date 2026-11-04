<script setup lang="ts">
/**
 * 问卷工作区 · 问卷详情容器（/surveys/:id[/steps/:n]）。
 *
 * 一个工作区容器 + 状态驱动步进条（七步），步进条是 v1.3 七阶段的投影：
 * 每步能否进入由阶段决定（data/workspace.ts），前端只置灰与引导。
 * 本轮交付步骤 1「基础信息」（主数据快照、版本引用，只读）、
 * 步骤 2「逐题作答」（三栏作答界面）、步骤 3「条款匹配确认」（05 §3）、
 * 步骤 4「填写分区」（05 §4）、步骤 5「审批与看板」（05 §5）、步骤 6「证据与导出」（05 §6）
 * 与步骤 7「完成度与收集」（原型 tab ⑤ / FR-12：收集统计 + 排期提醒 + 全功能完成度）。
 */
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { loadLedger } from '../../function-ledger/data/storage';
import { subfunctionSummary, type FunctionRecord } from '../../function-ledger/data/ledger';
import { loadLocalSurveyDrafts } from '../data/drafts';
import {
  SURVEY_STEPS, SURVEY_STEP_COUNT, currentSurveyStep, isStepAccessible, resolveStepParam,
} from '../data/workspace';
import { mergeLocalSurveyDrafts, surveyRecords, type SurveyRecord } from '../data/surveys';
import { surveyStatusColor, useSurveyLabels } from '../labels';
import { getRuleVersion } from '../../compliance/data/ruleVersions';
import StepQuestions from '../components/StepQuestions.vue';
import StepMatching from '../components/StepMatching.vue';
import StepSections from '../components/StepSections.vue';
import StepReview from '../components/StepReview.vue';
import StepEvidence from '../components/StepEvidence.vue';
import StepLoadFallback from '../components/StepLoadFallback.vue';
import RuleSourceDetailDrawer from '../components/RuleSourceDetailDrawer.vue';
import CreateSurveyPage from './CreateSurveyPage.vue';

/**
 * 第 7 步按需加载：图表库只在该步骤被打开时下载（DESIGN · Charts 实现约束）。
 * delay 160ms 避免快速加载时闪一下占位；加载中与加载失败都交给 StepLoadFallback，
 * 否则内容区会静默空白，与「数据为空」无法区分。
 */
const StepCollection = defineAsyncComponent({
  loader: () => import('../components/StepCollection.vue'),
  loadingComponent: StepLoadFallback,
  errorComponent: StepLoadFallback,
  delay: 160,
  timeout: 20000,
});

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const { statusLabel } = useSurveyLabels();

const loading = ref(true);
const record = ref<SurveyRecord | null>(null);
const functions = ref<FunctionRecord[]>([]);

async function load() {
  loading.value = true;
  try {
    // 本地草稿先合并（与列表页同一口径），否则刚保存的草稿在详情页不可见
    mergeLocalSurveyDrafts(await loadLocalSurveyDrafts());
    functions.value = (await loadLedger()).records;
    const id = String(route.params.id ?? '');
    record.value = surveyRecords.find((item) => item.id === id) ?? null;
    if (!record.value) {
      Message.warning(t('surveys.create.surveyMissing'));
      void router.replace({ name: 'surveys' });
      return;
    }
    normalizeStep();
  } catch {
    Message.error(t('surveys.messages.storageError'));
  } finally {
    loading.value = false;
  }
}

/* ------------------------------------------------------------ 步骤路由归一 */

const rawStep = computed(() => {
  const value = route.params.step;
  if (value === undefined) return null;
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) ? parsed : null;
});

const activeStep = computed(() => {
  const status = record.value?.status;
  if (!status) return 1;
  const candidate = rawStep.value;
  if (candidate !== null && candidate >= 1 && candidate <= SURVEY_STEP_COUNT
    && route.name === 'survey-detail-steps') return candidate;
  return currentSurveyStep(status);
});

/** 当前步骤的 i18n key（内容区 aria-label 用） */
const activeStepKey = computed(() => SURVEY_STEPS.find((step) => step.no === activeStep.value)?.key ?? 'basicInfo');

/** 深链/刷新归一：无 step、非法 step 或该阶段不可进入 → replace 到当前行动步 */
function normalizeStep() {
  const current = record.value;
  if (!current) return;
  const target = resolveStepParam(current.status, route.params.step);
  const onStepsRoute = route.name === 'survey-detail-steps';
  if (!onStepsRoute || rawStep.value !== target || !Number.isInteger(Number(route.params.step))) {
    void router.replace({ name: 'survey-detail-steps', params: { id: current.id, step: String(target) } });
  }
}

watch(() => route.fullPath, () => normalizeStep());

function goStep(no: number) {
  const current = record.value;
  if (!current || !isStepAccessible(current.status, no) || no === activeStep.value) return;
  void router.push({ name: 'survey-detail-steps', params: { id: current.id, step: String(no) } });
}

/** 步骤 3 → 步骤 2 的题目定位（命中题徽标/待定题提示，?q= 由 StepQuestions 消费） */
function goToQuestion(code: string) {
  const current = record.value;
  if (!current) return;
  void router.push({ name: 'survey-detail-steps', params: { id: current.id, step: '2' }, query: { q: code } });
}

/* ------------------------------------------------------------ 详情数据组装 */

const master = computed(() => {
  const current = record.value;
  if (!current) return null;
  if (current.creationSnapshot?.function) return current.creationSnapshot.function;
  return functions.value.find((item) => item.fuliId === current.fuliId) ?? null;
});

const masterUpdatedAt = computed(() => {
  const current = record.value;
  if (!current) return '';
  if (current.creationSnapshot) return current.creationSnapshot.masterUpdatedAt;
  return functions.value.find((item) => item.fuliId === current.fuliId)?.updatedAt ?? '';
});

/* -------------------------------------------- 所属人（姓名 | 部门，2026-11-03 用户裁决） */

/** 部门兜底：创建快照未冻结部门时按 FuLi 从台账当前主数据取（无则空串） */
function ownerDepartmentOf(current: SurveyRecord): string {
  return current.creationSnapshot?.function?.department
    ?? functions.value.find((item) => item.fuliId === current.fuliId)?.department
    ?? '';
}

/** 所属人展示：'姓名 | 部门'；部门缺失时只显姓名 */
function ownerWithDept(name: string, department: string): string {
  const trimmedDept = department.trim();
  return trimmedDept ? `${name} | ${trimmedDept}` : (name || '—');
}

/** 子功能汇总文本：栅栏单元格内单行截断展示，hover 气泡全显（2026-11-04 裁决） */
const subfunctionsText = computed(() => {
  const items = master.value?.subfunctions ?? [];
  const text = items.map((item) => subfunctionSummary(item)).join(locale.value === 'zh-CN' ? '、' : ', ');
  return text;
});

const templateInfo = computed(() => record.value?.creationSnapshot ?? null);

/** 条款触发规则：按创建快照冻结的规则版本号解析；规则已删除时回落到快照内的引用信息 */
const boundRule = computed(() => {
  const version = record.value?.creationSnapshot?.ruleSetVersion;
  return version ? getRuleVersion(version) ?? null : null;
});

/* ------------------------------------- 来源详情抽屉（与新建问卷页同构，2026-11-04 用户裁决）：
   基本信息条款触发规则区 标准库 / 问题库 / 安全需求 字段右侧【查看详情】打开对应只读抽屉 */
type SourceKind = 'standard' | 'question' | 'safety';
const sourceDrawerOpen = ref(false);
const sourceKind = ref<SourceKind>('standard');
const sourceValue = computed(() => {
  if (!boundRule.value) return '';
  if (sourceKind.value === 'standard') return boundRule.value.standardSource;
  if (sourceKind.value === 'question') return boundRule.value.questionSource;
  return boundRule.value.safetyRequirement;
});
function openSourceDetail(kind: SourceKind) {
  sourceKind.value = kind;
  sourceDrawerOpen.value = true;
}

/**
 * 第 1 步的两种形态（2026-10-30 任务下发口径）：
 * 待处理 / 待提交 → 基本信息绑定表单（选功能与规则，保存草稿 / 提交任务）；
 * 其余阶段 → 只读参考（功能主数据 + 版本引用）。
 */
const showTaskForm = computed(() => record.value?.status === 'pending' || record.value?.status === 'draft');

/**
 * 任务表单保存 → 状态流转（record 与 store 同源，无需重读）：跟随当前行动步。
 * 待处理→待提交：行动步仍第 1 步（继续编辑或提交）；待提交→待填写：跳第 2 步作答。
 * 待处理直接提交任务（→待填写）同样跳第 2 步，与待提交提交后的落点保持一致。
 * 不用子组件事件回传：保存引发的响应式更新会先卸载内嵌表单，事件在卸载实例上不可靠。
 */
watch(() => record.value?.status, (status, previous) => {
  if (!record.value || !status) return;
  if (
    (previous === 'pending' && (status === 'draft' || status === 'pending-fill')) ||
    (previous === 'draft' && status === 'pending-fill')
  ) {
    const actionStep = currentSurveyStep(status);
    if (actionStep !== activeStep.value) goStep(actionStep);
  }
});

function displayTime(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale.value, {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(date);
}

onMounted(() => { void load(); });

/* ------------------------------------------------------------ 面包屑吸附阴影 */

/**
 * 面包屑条 sticky 在壳子导航下方；页面滚动（条已吸附）时按 DESIGN.md 阴影 Level 4
 * （--app-shadow-4，专用于持久顶部导航）出现底部投影，未滚动时不加阴影。
 */
const topbarStuck = ref(false);

function syncTopbarStuck() {
  topbarStuck.value = window.scrollY > 0;
}

onMounted(() => {
  window.addEventListener('scroll', syncTopbarStuck, { passive: true });
  syncTopbarStuck();
});

onUnmounted(() => {
  window.removeEventListener('scroll', syncTopbarStuck);
});
</script>

<template>
  <main class="survey-detail">
    <!-- 面包屑条：左「问卷工作台 / 问卷编号」，右为当前步骤的全局动作区（步骤 2 Teleport 注入）；
         页面滚动吸附后按 DESIGN.md Level 4 出底部投影 -->
    <div class="detail-topbar" :class="{ stuck: topbarStuck }">
      <nav class="detail-crumbs" :aria-label="t('surveys.title')">
        <router-link class="detail-crumb-link" :to="{ name: 'surveys' }">{{ t('surveys.title') }}</router-link>
        <span class="detail-crumb-sep" aria-hidden="true">/</span>
        <span class="detail-crumb-current" aria-current="page">{{ t('surveys.workspace.detailCrumb') }}</span>
      </nav>
      <div id="detail-topbar-actions" class="detail-topbar-actions"></div>
    </div>

    <div v-if="loading" class="detail-state"><a-spin :tip="t('surveys.create.loading')" /></div>

    <template v-else-if="record">
      <!-- 问卷概要：身份与关键事实一屏可见（DESIGN.md · Composition · Detail） -->
      <section class="detail-card" :aria-label="t('surveys.workspace.summaryTitle')">
        <div class="detail-card-head">
          <h2 class="detail-card-title">{{ t('surveys.workspace.summaryTitle') }}</h2>
          <a-tag :color="surveyStatusColor(record.status)" size="small">{{ statusLabel(record.status) }}</a-tag>
          <!-- 已退回：阶段内子状态（v1.3 §0.5），人工态优先于派生状态 -->
          <a-tag v-if="record.returnInfo" size="small" color="red" data-testid="detail-returned-tag">{{ t('surveys.labels.returned') }}</a-tag>
          <a-tag v-if="record.offLedger" size="small" color="orange">{{ t('surveys.labels.offLedger') }}</a-tag>
        </div>

        <!-- 退回标记：阶段上的子状态，整卷可继续，但原因必须可见 -->
        <a-alert v-if="record.returnInfo" type="error" class="detail-banner">
          {{ t('surveys.workspace.returnBanner') }}
          {{ t('surveys.labels.returnReason') }}{{ record.returnInfo.reason }}
          {{ t('surveys.labels.returnBy') }}{{ record.returnInfo.operator }}
          {{ t('surveys.labels.returnTime') }}{{ record.returnInfo.time }}
        </a-alert>
        <!-- 匹配审核中：行动步已落第 3 步（逐条审核条款匹配结果），横幅提示审核语境 -->
        <a-alert v-if="record.status === 'matching-reviewing'" type="info" class="detail-banner">
          {{ t('surveys.workspace.reviewBanner') }}
        </a-alert>

        <!-- 概要字段：全部直接展示，不折叠；字段名灰（text-3）、字段值黑 400 不加粗；
             上下间距 10px、左右 24px（2026-10-27 裁决：去掉查看更多） -->
        <dl class="detail-facts" data-testid="detail-facts">
          <div class="detail-fact">
            <dt>{{ t('surveys.fields.taskNo') }}{{ t('surveys.workspace.fieldSeparator') }}</dt>
            <dd>{{ record.id }}</dd>
          </div>
          <div class="detail-fact">
            <dt>{{ t('surveys.fields.taskName') }}{{ t('surveys.workspace.fieldSeparator') }}</dt>
            <dd>{{ record.taskName }}</dd>
          </div>
          <div class="detail-fact">
            <dt>{{ t('surveys.fields.taskDescription') }}{{ t('surveys.workspace.fieldSeparator') }}</dt>
            <!-- 概要为单行截断展示，hover 气泡显示完整描述（2026-11-04 裁决） -->
            <dd>
              <a-tooltip v-if="record.taskDescription" :content="record.taskDescription">
                <span class="detail-fact-value">{{ record.taskDescription }}</span>
              </a-tooltip>
              <span v-else class="detail-empty">—</span>
            </dd>
          </div>
          <div class="detail-fact">
            <dt>{{ t('surveys.fields.priority') }}{{ t('surveys.workspace.fieldSeparator') }}</dt>
            <dd>{{ t(`surveys.priorities.${record.priority}`) }}</dd>
          </div>
          <div class="detail-fact">
            <dt>{{ t('surveys.fields.deadline') }}{{ t('surveys.workspace.fieldSeparator') }}</dt>
            <dd>{{ record.deadline || '—' }}</dd>
          </div>
          <div class="detail-fact">
            <dt>{{ t('surveys.fields.respondent') }}{{ t('surveys.workspace.fieldSeparator') }}</dt>
            <dd>{{ record.respondent }}</dd>
          </div>
          <div class="detail-fact">
            <dt>{{ t('surveys.fields.reviewer') }}{{ t('surveys.workspace.fieldSeparator') }}</dt>
            <dd>
              <span v-if="record.reviewer">{{ record.reviewer }}</span>
              <a-tooltip v-else :content="t('surveys.labels.noReviewer')"><span class="detail-empty">—</span></a-tooltip>
            </dd>
          </div>
          <div class="detail-fact">
            <dt>{{ t('surveys.fields.creator') }}{{ t('surveys.workspace.fieldSeparator') }}</dt>
            <dd>{{ record.sourceOperator }}</dd>
          </div>
          <div class="detail-fact">
            <dt>{{ t('surveys.fields.createdAt') }}{{ t('surveys.workspace.fieldSeparator') }}</dt>
            <dd>{{ record.createdAt }}</dd>
          </div>
          <div class="detail-fact">
            <dt>{{ t('surveys.fields.updatedBy') }}{{ t('surveys.workspace.fieldSeparator') }}</dt>
            <dd>{{ record.updatedBy || '—' }}</dd>
          </div>
          <div class="detail-fact">
            <dt>{{ t('surveys.fields.updatedAt') }}{{ t('surveys.workspace.fieldSeparator') }}</dt>
            <dd>{{ record.updatedAt }}</dd>
          </div>
        </dl>
      </section>

      <!-- 步进条：七步按业务阶段开放，选中态跟随实际路由而非默认行动步 -->
      <nav class="detail-card detail-steps" :class="{ 'is-en': locale === 'en-US' }" :aria-label="t('surveys.workspace.stepNav')">
        <div class="detail-steps-scroll">
          <ol class="detail-steps-list">
            <li v-for="step in SURVEY_STEPS" :key="step.no" class="detail-steps-item">
              <button
                type="button"
                class="detail-step"
                :class="{
                  'is-selected': activeStep === step.no,
                  'is-locked': !isStepAccessible(record.status, step.no),
                  'is-done': isStepAccessible(record.status, step.no) && step.no < currentSurveyStep(record.status),
                }"
                :aria-current="activeStep === step.no ? 'page' : undefined"
                :aria-disabled="!isStepAccessible(record.status, step.no)"
                :title="!isStepAccessible(record.status, step.no) ? t('surveys.workspace.stepLocked') : undefined"
                @click="goStep(step.no)"
              >
                <span class="detail-step-label">{{ t(`surveys.workspace.steps.${step.key}`) }}</span>
                <span v-if="!isStepAccessible(record.status, step.no)" class="detail-visually-hidden">{{ t('surveys.workspace.stepLocked') }}</span>
              </button>
            </li>
          </ol>
        </div>
      </nav>

      <!-- 步骤 1 · 基础信息：待处理/待提交 = 基本信息绑定表单；其余阶段 = 单白卡只读参考 -->
      <template v-if="activeStep === 1">
        <!-- 待处理 / 待提交：绑定功能与规则 → 保存草稿（待提交）/ 提交任务（待填写） -->
        <CreateSurveyPage
          v-if="showTaskForm"
          :key="record.id"
          :mode="record.status === 'pending' ? 'task' : 'edit'"
          :survey-id="record.id"
        />
        <section v-else class="detail-card detail-body" :aria-label="t(`surveys.workspace.steps.${activeStepKey}`)">
        <!-- 只读参考：创建快照 → 当前台账 → 问卷记录（2026-11-03 用户裁决：来源说明文案下线） -->
        <h3 class="detail-group-title">{{ t('surveys.workspace.sections.master') }}</h3>
          <dl class="detail-dl">
            <template v-if="master">
              <div class="detail-cell"><dt>{{ t('ledger.fields.platformName') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd>{{ master.platformName }}</dd></div>
              <div class="detail-cell"><dt>{{ t('ledger.fields.fuliId') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd>{{ master.fuliId }}</dd></div>
              <div class="detail-cell"><dt>{{ t('ledger.fields.functionName') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd>{{ master.functionName }}</dd></div>
              <div class="detail-cell"><dt>{{ t('ledger.fields.functionDescription') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd><a-tooltip v-if="master.functionDescription" :content="master.functionDescription"><span class="cell-clip">{{ master.functionDescription }}</span></a-tooltip><span v-else class="detail-empty">—</span></dd></div>
              <div class="detail-cell"><dt>{{ t('ledger.fields.subfunctions') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd><a-tooltip v-if="subfunctionsText" :content="subfunctionsText"><span class="cell-clip">{{ subfunctionsText }}</span></a-tooltip><span v-else class="detail-empty">—</span></dd></div>
              <div class="detail-cell"><dt>{{ t('surveys.workspace.ownerWithDept') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd>{{ ownerWithDept(master.owner, master.department) }}</dd></div>
              <div class="detail-cell"><dt>{{ t('ledger.fields.developmentLocation') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd>{{ t(`ledger.locations.${master.developmentLocation}`) }}</dd></div>
              <div class="detail-cell"><dt>{{ t('ledger.fields.masterEcu') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd>{{ master.masterEcu || '—' }}</dd></div>
              <div class="detail-cell"><dt>{{ t('surveys.create.masterTime') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd>{{ displayTime(masterUpdatedAt) }}</dd></div>
            </template>
            <template v-else>
              <div class="detail-cell"><dt>{{ t('ledger.fields.functionName') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd>{{ record.functionName }}</dd></div>
              <div class="detail-cell"><dt>{{ t('ledger.fields.fuliId') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd>{{ record.fuliId }}</dd></div>
              <div class="detail-cell"><dt>{{ t('surveys.workspace.ownerWithDept') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd>{{ ownerWithDept(record.owner, ownerDepartmentOf(record)) }}</dd></div>
            </template>
          </dl>

          <h3 class="detail-group-title">{{ t('surveys.workspace.sections.rule') }}</h3>
          <!-- 条款触发规则：按创建快照冻结的规则版本解析（规则改名/编辑后仍可追溯快照内的引用）；
               字段结构与新建问卷页规则信息区一致（2026-11-04 用户裁决）：
               规则名称/标准库/问题库/安全需求/规则编号/题目数量/最近更新时间，
               来源三字段右侧【查看详情】打开对应详情抽屉；参与条目为本任务度量，追加在末尾 -->
          <dl v-if="boundRule" class="detail-dl">
            <div class="detail-cell"><dt>{{ t('surveys.create.ruleName') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd><a-tooltip v-if="boundRule.name" :content="boundRule.name"><span class="cell-clip">{{ boundRule.name }}</span></a-tooltip><span v-else class="detail-empty">—</span></dd></div>
            <div class="detail-cell"><dt>{{ t('surveys.create.standardLibrary') }}{{ t('surveys.workspace.fieldSeparator') }}</dt>
              <dd>
                <a-tooltip v-if="boundRule.standardSource" :content="boundRule.standardSource"><span class="cell-clip">{{ boundRule.standardSource }}</span></a-tooltip>
                <span v-else class="detail-empty">—</span>
                <a-link v-if="boundRule.standardSource" class="detail-source-link" @click="openSourceDetail('standard')">{{ t('surveys.create.sourceDetail.viewDetail') }}</a-link>
              </dd>
            </div>
            <div class="detail-cell"><dt>{{ t('surveys.create.questionLibrary') }}{{ t('surveys.workspace.fieldSeparator') }}</dt>
              <dd>
                <a-tooltip v-if="boundRule.questionSource" :content="boundRule.questionSource"><span class="cell-clip">{{ boundRule.questionSource }}</span></a-tooltip>
                <span v-else class="detail-empty">—</span>
                <a-link v-if="boundRule.questionSource" class="detail-source-link" @click="openSourceDetail('question')">{{ t('surveys.create.sourceDetail.viewDetail') }}</a-link>
              </dd>
            </div>
            <div class="detail-cell"><dt>{{ t('surveys.create.safetyRequirementLabel') }}{{ t('surveys.workspace.fieldSeparator') }}</dt>
              <dd>
                <a-tooltip v-if="boundRule.safetyRequirement" :content="boundRule.safetyRequirement"><span class="cell-clip">{{ boundRule.safetyRequirement }}</span></a-tooltip>
                <span v-else class="detail-empty">—</span>
                <a-link v-if="boundRule.safetyRequirement" class="detail-source-link" @click="openSourceDetail('safety')">{{ t('surveys.create.sourceDetail.viewDetail') }}</a-link>
              </dd>
            </div>
            <div class="detail-cell"><dt>{{ t('surveys.create.ruleNo') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd>{{ boundRule.id }}</dd></div>
            <div class="detail-cell"><dt>{{ t('surveys.create.questionCount') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd>{{ boundRule.questionSet.length }}</dd></div>
            <div class="detail-cell"><dt>{{ t('surveys.create.ruleUpdatedAt') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd>{{ boundRule.updatedAt }}</dd></div>
            <div class="detail-cell"><dt>{{ t('surveys.fields.clauses') }}{{ t('surveys.workspace.fieldSeparator') }}</dt>
              <dd>
                <a-tooltip v-if="record.matchedCount === 0"
                  :content="t(record.status === 'draft' ? 'surveys.labels.notEvaluated' : 'surveys.labels.noClauses')">
                  <span class="detail-empty">—</span>
                </a-tooltip>
                <span v-else class="detail-clauses">{{ record.matchedCount }}/{{ record.totalCount }}</span>
              </dd>
            </div>
          </dl>
          <dl v-else-if="templateInfo" class="detail-dl">
            <div class="detail-cell"><dt>{{ t('surveys.create.ruleNo') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd>{{ templateInfo.ruleSetVersion }}</dd></div>
            <div class="detail-cell"><dt>{{ t('surveys.create.questionCount') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd>{{ templateInfo.questionCount }}</dd></div>
            <div class="detail-cell"><dt>{{ t('surveys.fields.clauses') }}{{ t('surveys.workspace.fieldSeparator') }}</dt>
              <dd>
                <a-tooltip v-if="record.matchedCount === 0"
                  :content="t(record.status === 'draft' ? 'surveys.labels.notEvaluated' : 'surveys.labels.noClauses')">
                  <span class="detail-empty">—</span>
                </a-tooltip>
                <span v-else class="detail-clauses">{{ record.matchedCount }}/{{ record.totalCount }}</span>
              </dd>
            </div>
            <div class="detail-cell"><dt>{{ t('surveys.create.templateUpdatedAt') }}{{ t('surveys.workspace.fieldSeparator') }}</dt><dd>{{ templateInfo.templateUpdatedAt || '—' }}</dd></div>
          </dl>
        </section>
      </template>

      <!-- 步骤 2 · 逐题作答：三栏作答界面（题集按创建所选模板 12/14/18 问） -->
      <StepQuestions v-else-if="activeStep === 2" :record="record" />

      <!-- 步骤 3 · 条款匹配确认：摘要条 + 分组导航 + 条款卡（05 §3，D1–D7 决策表） -->
      <StepMatching v-else-if="activeStep === 3" :record="record" @go-question="goToQuestion" />

      <!-- 步骤 4 · 填写分区：完成度容器 + 6 分区跳转 + 提交门禁（05 §4，C1–C7） -->
      <StepSections v-else-if="activeStep === 4" :record="record" :function-description="master?.functionDescription" />

      <!-- 步骤 5 · 审批与看板：审批看板 + 筛选 chips + 64 条目审核表 + 一键审核 + 退回（05 §5，条目三态与聚合） -->
      <StepReview v-else-if="activeStep === 5" :record="record" @go-step="goStep" />

      <!-- 步骤 6 · 证据与导出：证据缺口表 + 材料清单 + 四类导出（05 §6，F-EVID/F-MAT/F-EXP） -->
      <StepEvidence v-else-if="activeStep === 6" :record="record" />

      <!-- 步骤 7 · 完成度与收集：收集统计 + 缺口排期/提醒 + 全功能完成度（原型 tab ⑤，FR-12） -->
      <StepCollection v-else :record="record" @go-step="goStep" />
    </template>

    <!-- 来源详情抽屉：标准库 / 问题库 / 安全需求（与新建问卷页同构，只读） -->
    <RuleSourceDetailDrawer v-model:visible="sourceDrawerOpen" :kind="sourceKind" :source="sourceValue" />
  </main>
</template>

<style scoped>
.survey-detail { min-width: 0; min-height: calc(100dvh - 88px); display: flex; flex-direction: column; gap: 16px; color: var(--color-text-1); font-size: 14px; }

/* 面包屑条：与新建问卷页同构（sticky 贴住 56px 壳子导航下缘）；
   吸附（页面已滚动）时按 DESIGN.md Level 4 出底部投影，未滚动不带阴影 */
.detail-topbar { position: sticky; top: 56px; z-index: 3; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; border-radius: 2px; background: var(--app-surface); transition: box-shadow 160ms ease-out; }
.detail-topbar.stuck { box-shadow: var(--app-shadow-4); }
.detail-topbar-actions { display: flex; align-items: center; gap: 8px; min-width: 0; }
.detail-crumbs { display: flex; align-items: center; min-width: 0; gap: 8px; font-size: 14px; line-height: 22px; }
.detail-crumb-link { color: var(--color-text-2); text-decoration: none; }
.detail-crumb-link:hover, .detail-crumb-link:focus-visible { color: var(--app-accent); }
.detail-crumb-sep { color: var(--color-text-3); }
.detail-crumb-current { color: var(--color-text-1); font-weight: 600; }

.detail-card { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.detail-state { min-height: 240px; padding: 16px; border-radius: 2px; background: var(--app-surface); display: grid; place-items: center; }

/* 概要：身份和状态先行；字段全量直接展示，行距 10px / 列距 24px */
.detail-card-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--app-divider); }
.detail-card-title { margin: 0; color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; }
.detail-banner { margin-top: 12px; }
/* 概要：栅栏网格（2026-11-04 裁决：标签在左·多列网格）——4 列起步，短字段齐排；
   值超长单行截断；窄屏逐级降列 */
.detail-facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px 24px; margin: 12px 0 0; }
.detail-fact { display: flex; align-items: baseline; min-width: 0; line-height: 22px; }
.detail-fact dt { flex: none; color: var(--color-text-3); font-weight: 400; }
.detail-fact dd { margin: 0; color: var(--color-text-1); font-weight: 400; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 气泡全显的内层值：接替 dd 的单行截断（span 包裹后 dd 不再直接持有文本节点） */
.detail-fact dd .detail-fact-value { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.detail-clauses { font-variant-numeric: tabular-nums; }
.detail-empty { color: var(--color-text-3); cursor: help; }

/* 连续箭头：底轨露出相邻箭头的斜边，窄屏在容器内滚动。 */
.detail-steps { padding: 16px; }
.detail-steps-scroll { overflow-x: auto; max-width: 100%; scrollbar-color: var(--app-control-border) transparent; }
.detail-steps-list { display: flex; gap: 4px; min-width: 1190px; margin: 0; padding: 0; background: var(--app-surface); list-style: none; }
.detail-steps-item { display: flex; flex: 1 1 0; min-width: 0; }
.detail-step { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 48px; padding: 8px 26px 8px 38px; border: 0; border-radius: 0; clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%, 18px 50%); background: var(--mt-fill-2); color: var(--color-text-1); font: inherit; font-weight: 400; text-align: center; cursor: pointer; }
.detail-steps-item:first-child .detail-step { padding-left: 24px; clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%); }
.detail-steps-item:last-child .detail-step { padding-right: 16px; clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 18px 50%); }
.detail-step:not(.is-locked):not(.is-selected):hover { background: var(--color-primary-light-1); color: var(--app-accent); }
.detail-step:not(.is-locked):not(.is-selected):active { background: var(--color-primary-light-2); }
/* 已完成节点（2026-10-27 裁决）：淡蓝底 + 主色文字；hover 再深一档，选中/锁定态随后覆盖 */
.detail-step.is-done { background: var(--color-primary-light-1); color: var(--app-accent); }
.detail-step.is-done:not(.is-selected):hover { background: var(--color-primary-light-2); }
.detail-step.is-selected { background: var(--app-accent); color: var(--app-on-accent); font-weight: 600; }
.detail-step.is-selected:hover { background: rgb(var(--primary-5)); }
.detail-step.is-selected:active { background: rgb(var(--primary-7)); }
.detail-step.is-locked { background: var(--color-fill-2); color: var(--color-text-3); cursor: not-allowed; }
.detail-step:focus-visible { outline: 3px solid var(--app-accent); outline-offset: -5px; }
.detail-step.is-selected:focus-visible { outline-color: var(--app-on-accent); }
.detail-step-label { white-space: nowrap; }
.detail-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.detail-steps.is-en .detail-step { min-height: 56px; padding-right: 22px; padding-left: 32px; line-height: 20px; }
.detail-steps.is-en .detail-steps-item:first-child .detail-step { padding-left: 18px; }
.detail-steps.is-en .detail-steps-item:last-child .detail-step { padding-right: 12px; }
.detail-steps.is-en .detail-step-label { white-space: normal; }

/* 步骤内容：分组标题 14/600 + 事实表（标签列 108px，与新建问卷信息区同构） */
.detail-body { flex: 1; }
.detail-group-title { margin: 24px 0 8px; padding-top: 16px; border-top: 1px solid var(--app-divider); color: var(--color-text-1); font-size: 14px; font-weight: 600; line-height: 22px; }
.detail-group-title:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
.detail-group-note { margin: 0 0 8px; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
/* 栅栏网格（2026-11-04 裁决：与概要区同构的 4 列齐排）：dt+dd 包 .detail-cell 依序流入，
   长值单行截断 + hover 气泡全显（.cell-clip），与概要区任务描述同口径 */
.detail-dl { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px 24px; margin: 8px 0 0; font-size: 14px; line-height: 22px; }
.detail-cell { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.detail-cell dt { flex: none; color: var(--color-text-2); font-weight: 400; }
.detail-cell dd { margin: 0; flex: 1; min-width: 0; color: var(--color-text-1); display: flex; align-items: baseline; gap: 8px; overflow: hidden; }
.cell-clip { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.detail-source-link { flex: none; font-size: 12px; line-height: 22px; }

@media (max-width: 1200px) {
  .detail-facts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .detail-dl { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 920px) {
  .detail-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .detail-dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .detail-facts { grid-template-columns: minmax(0, 1fr); }
  /* 单列后 cell 内部回「标签上值下」过窄，回到每 cell 一行的单列流 */
  .detail-dl { grid-template-columns: minmax(0, 1fr); }
}

@media (prefers-reduced-motion: no-preference) {
  .detail-step { transition: background-color 160ms ease-out, color 160ms ease-out; }
}
</style>
