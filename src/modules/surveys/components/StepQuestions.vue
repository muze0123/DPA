<script setup lang="ts">
/**
 * 问卷工作区 · 步骤 2「逐题作答」（05 方案 §2.1，2026-10-27 布局裁决）。
 *
 * 布局（用户裁决）：两栏 —— 左「题目导航」块（顶部并入作答进度：进度条 + 已答 n/总数 +
 * n 题待定，标题「题目导航」删除），右侧主区为当前题大卡；
 * 原右栏作答进度卡删除，【保存草稿】【完成作答】【修改】按钮 Teleport 到容器面包屑右侧
 * 动作区（与其他子页面「操作在右上」的位置一致）。
 *
 * 需求口径（2026-10-26）：逐题作答；问题彻底完成后才展示匹配结果（结果在步骤 3）；
 * 每题下方默认展示判断指引（2026-10-27：不再用「查看判断指引」折叠钮，卡片默认展开、
 * 右上「收起/展开」，正文【条款来源】+ 规则文本 +【典型场景】，不再显示「法规依据」标签）。
 *
 * 状态机口径：草稿 / 待填写可作答（三态即存 + 存草稿 + 完成作答 → 待确认，N2 门禁）；
 * 待确认默认只读，经「修改」确认后可改（T4：重算不覆盖人工值）；
 * 匹配审核中及以后整卷只读。
 */
import { computed, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { IconExclamationCircle, IconLeft, IconRight } from '@arco-design/web-vue/es/icon';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  DEFAULT_QUESTION_VERSION, questionsForVersion, type SurveyAnswer, type SurveyQuestion,
} from '../data/questions';
import {
  completeSurveyAnswers, saveSurveyAnswersDraft, setSurveyAnswer,
} from '../data/surveys';
import { ensureSurveyMatching, recalculateSurveyMatching } from '../data/matching';
import type { SurveyRecord } from '../data/surveys';

const props = defineProps<{ record: SurveyRecord }>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

/**
 * 题集 = 创建时冻结的模板题目（2026-10-26：模板内自定义录入题目）；
 * 无冻结题目的问卷（早期快照 / 无快照的历史种子）按题集版本回落 v1/v2/v3。
 * 模板题目只有一段自由文本指引，映射到「条款依据」位置，其余指引区块为空时不渲染。
 */
type StepQuestion = Pick<SurveyQuestion, 'code' | 'title' | 'guide'> & Partial<Pick<SurveyQuestion, 'semanticDomain'>>;

const questions = computed<StepQuestion[]>(() => {
  const frozen = props.record.creationSnapshot?.questions;
  if (frozen?.length) {
    return frozen.map((question) => ({
      code: question.code,
      title: question.title,
      guide: { basis: question.guide, scenarios: [], notApplicable: '' },
    }));
  }
  return questionsForVersion(props.record.creationSnapshot?.templateVersion ?? DEFAULT_QUESTION_VERSION);
});

const codes = computed(() => questions.value.map((question) => question.code));
const answers = computed(() => props.record.answers ?? {});

const isEditableStage = computed(() => props.record.status === 'draft' || props.record.status === 'pending-fill');
/** 待确认需先经「修改」确认才可写（T4） */
const editing = ref(false);
const canEdit = computed(() => isEditableStage.value || (props.record.status === 'pending-confirm' && editing.value));
const readonly = computed(() => !canEdit.value);

const activeCode = ref(codes.value[0] ?? '');
const activeQuestion = computed(() => questions.value.find((question) => question.code === activeCode.value) ?? questions.value[0]);
const activeIndex = computed(() => codes.value.indexOf(activeCode.value));
/** 默认落到第一道未答题，全部已答则停在第一题 */
watch(codes, (next) => {
  if (!next.includes(activeCode.value)) {
    activeCode.value = next.find((code) => !answers.value[code]) ?? next[0] ?? '';
  }
}, { immediate: true });

/** 步骤 3 命中题徽标/待定题提示回跳定位（?q=Qn，由容器 goToQuestion 写入） */
watch(() => route.query.q, (query) => {
  const code = String(Array.isArray(query) ? query[0] ?? '' : query ?? '');
  if (code && codes.value.includes(code)) activeCode.value = code;
}, { immediate: true });

/* ---------------------------------------------------------------- 作答进度 */

const answeredCount = computed(() => codes.value.filter((code) => answers.value[code]).length);
const pendingCodes = computed(() => codes.value.filter((code) => answers.value[code] === 'pending'));
const unansweredCount = computed(() => codes.value.length - answeredCount.value);
const progressPercent = computed(() => (questions.value.length
  ? Math.round((answeredCount.value / questions.value.length) * 100)
  : 0));

function answerLabel(value: SurveyAnswer): string {
  return t(`surveys.workspace.questions.answer${value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'Pending'}`);
}

/* ---------------------------------------------------------------- 判断指引 */

/**
 * 指引正文拆分：条款依据「GB 44464 第 6.1.5 条：处理……规则」按第一个冒号拆为
 * 【来源】加粗行 + 规则文本（2026-10-27：不再渲染「法规依据」标签）；
 * 模板冻结指引为单段文本，同样适配；无冒号时整段作为正文。
 */
const guideParts = computed(() => {
  const basis = activeQuestion.value?.guide.basis.trim() ?? '';
  const separator = basis.indexOf('：');
  if (separator > 0) {
    return { source: basis.slice(0, separator), text: basis.slice(separator + 1).trim() };
  }
  return { source: '', text: basis };
});

const guideOpen = ref(true);

/* ---------------------------------------------------------------- 作答操作 */

const saving = ref(false);
const completing = ref(false);

/** 三态即存（F-QUES-01）：点击立即写入数据层，导航徽标与进度即时刷新 */
async function choose(value: SurveyAnswer) {
  if (!canEdit.value || !activeQuestion.value) return;
  try {
    await setSurveyAnswer(props.record.id, activeQuestion.value.code, value);
  } catch {
    Message.error(t('surveys.messages.storageError'));
  }
}

/** 存草稿：作答已即存，这里固化更新时间并保证本地草稿落库 */
async function saveDraft() {
  if (saving.value) return;
  saving.value = true;
  try {
    await saveSurveyAnswersDraft(props.record.id);
    Message.success(t('surveys.workspace.questions.draftSaved'));
  } catch {
    Message.error(t('surveys.messages.storageError'));
  } finally {
    saving.value = false;
  }
}

/** 完成作答：缺题拒绝并列题号定位；存在待定 → 二次确认 */
function complete() {
  if (completing.value) return;
  const missing = codes.value.filter((code) => !answers.value[code]);
  if (missing.length) {
    activeCode.value = missing[0];
    Message.error(t('surveys.workspace.questions.missingAlert', { count: missing.length }));
    return;
  }
  if (pendingCodes.value.length) {
    pendingTarget.value = [...pendingCodes.value];
    return;
  }
  void doComplete();
}

const pendingTarget = ref<string[]>([]);
const pendingCodesText = computed(() => pendingTarget.value.join('、'));

async function doComplete() {
  if (completing.value) return;
  completing.value = true;
  try {
    const wasPendingConfirm = props.record.status === 'pending-confirm';
    const { missing } = await completeSurveyAnswers(props.record.id, codes.value);
    if (missing.length) {
      activeCode.value = missing[0];
      Message.error(t('surveys.workspace.questions.missingAlert', { count: missing.length }));
      return;
    }
    Message.success(wasPendingConfirm
      ? t('surveys.workspace.questions.updatedSuccess')
      : t('surveys.workspace.questions.completeSuccess'));
    // N2 触发自动初筛（mock 服务端权威）：生成/重算条款匹配快照并联动参与条目
    ensureSurveyMatching(props.record);
    recalculateSurveyMatching(props.record);
    editing.value = false;
  } catch {
    Message.error(t('surveys.messages.storageError'));
  } finally {
    completing.value = false;
    pendingTarget.value = [];
  }
}

/** 修改（T4）：二次确认重算影响后进入编辑；完成后可再次「完成作答」提交重算 */
const editModalOpen = ref(false);
function requestEdit() { editModalOpen.value = true; }
function confirmEdit() { editing.value = true; editModalOpen.value = false; }

/**
 * 取消：退出当前作答动作，不产生任何数据变更（三态作答本就即存，无需丢弃确认）。
 * 待确认阶段的编辑态 → 退出编辑回到只读；其余可作答阶段 → 返回问卷工作台列表。
 */
function cancel() {
  if (props.record.status === 'pending-confirm' && editing.value) {
    editing.value = false;
    return;
  }
  void router.push({ name: 'surveys' });
}
</script>

<template>
  <div class="step-questions">
    <!-- 全局动作：Teleport 到容器面包屑右侧（与其他子页面操作位置一致）；
         可作答 = 存草稿 + 完成作答；待确认未进编辑 = 修改（确认后原地切换为保存/完成） -->
    <Teleport defer to="#detail-topbar-actions">
      <template v-if="canEdit">
        <a-button class="app-btn-neutral" data-testid="sq-cancel" @click="cancel">
          {{ t('surveys.actions.cancel') }}
        </a-button>
        <a-button class="app-btn-neutral" :loading="saving" data-testid="sq-save-draft" @click="saveDraft">
          {{ t('surveys.create.saveDraft') }}
        </a-button>
        <a-button type="primary" :loading="completing" data-testid="sq-complete" @click="complete">
          {{ t('surveys.workspace.questions.complete') }}
        </a-button>
      </template>
      <a-button
        v-else-if="record.status === 'pending-confirm'"
        type="primary"
        data-testid="sq-edit"
        @click="requestEdit"
      >{{ t('surveys.workspace.questions.edit') }}</a-button>
    </Teleport>

    <!-- 左栏：作答进度（顶部）+ 题目列表；点击切换主区题目 -->
    <nav class="sq-card sq-nav" :aria-label="t('surveys.workspace.questions.navTitle')">
      <div class="sq-progress">
        <div
          class="sq-progress-track"
          role="progressbar"
          :aria-valuemin="0"
          :aria-valuemax="questions.length"
          :aria-valuenow="answeredCount"
          :aria-label="t('surveys.workspace.questions.answeredOf', { answered: answeredCount, total: questions.length })"
        >
          <div class="sq-progress-fill" :style="{ width: `${progressPercent}%` }" />
        </div>
        <div class="sq-progress-meta">
          <span class="sq-progress-count" data-testid="sq-progress-count">{{ answeredCount }}/{{ questions.length }}</span>
          <span v-if="pendingCodes.length" class="sq-progress-pending" data-testid="sq-progress-pending">
            {{ t('surveys.workspace.questions.pendingNotice', { count: pendingCodes.length }) }}
          </span>
        </div>
      </div>

      <ol class="sq-nav-list">
        <li v-for="question in questions" :key="question.code">
          <button
            type="button"
            class="sq-nav-item"
            :class="{ active: question.code === activeCode }"
            :aria-current="question.code === activeCode ? 'true' : undefined"
            @click="activeCode = question.code"
          >
            <span class="sq-nav-code">{{ question.code }}</span>
            <a-tooltip :content="question.title" position="right" mini>
              <span class="sq-nav-text">{{ question.title }}</span>
            </a-tooltip>
            <a-tag v-if="answers[question.code]" size="small" :color="answers[question.code] === 'pending' ? 'orange' : answers[question.code] === 'yes' ? 'green' : 'gray'" class="sq-nav-badge">
              {{ answerLabel(answers[question.code]) }}
            </a-tag>
            <span v-else class="sq-nav-none">{{ t('surveys.workspace.questions.answerNone') }}</span>
          </button>
        </li>
      </ol>
    </nav>

    <!-- 主区：当前题大卡（完整题干 → 三态作答 → 判断指引默认展开） -->
    <section v-if="activeQuestion" class="sq-card sq-main" :aria-label="activeQuestion.code">
      <header class="sq-question-head">
        <a-tag color="arcoblue" size="small" class="sq-question-code">{{ activeQuestion.code }}</a-tag>
        <h3 class="sq-question-title">{{ activeQuestion.title }}</h3>
      </header>

      <div class="sq-answer" role="radiogroup" :aria-label="activeQuestion.code">
        <a-radio-group
          :model-value="answers[activeQuestion.code] ?? ''"
          :disabled="readonly"
          data-testid="sq-answer-group"
          @update:model-value="(value: unknown) => choose(value as SurveyAnswer)"
        >
          <a-radio value="yes">{{ t('surveys.workspace.questions.answerYes') }}</a-radio>
          <a-radio value="no">{{ t('surveys.workspace.questions.answerNo') }}</a-radio>
          <a-radio value="pending">{{ t('surveys.workspace.questions.answerPending') }}</a-radio>
        </a-radio-group>
        <!-- 「待定」提示（05 §2.2）：琥珀说明紧贴单选组下方 -->
        <p v-if="answers[activeQuestion.code] === 'pending'" class="sq-pending-hint">
          <IconExclamationCircle :size="14" aria-hidden="true" />
          <span>{{ t('surveys.workspace.questions.pendingHint') }}</span>
        </p>
        <p v-if="readonly" class="sq-readonly-hint">
          {{ record.status === 'pending-confirm' && !editing
            ? t('surveys.workspace.questions.pendingConfirmHint')
            : t('surveys.workspace.questions.readonlyHint') }}
        </p>
      </div>

      <!-- 判断指引：默认展开；头行「判断指引」+ 右上「收起/展开」（2026-10-27 裁决） -->
      <section class="sq-guide" :class="{ collapsed: !guideOpen }" data-testid="sq-guide">
        <header class="sq-guide-head">
          <h4 class="sq-guide-title">{{ t('surveys.workspace.questions.guideTitle') }}</h4>
          <button
            type="button"
            class="sq-guide-toggle"
            data-testid="sq-guide-toggle"
            :aria-expanded="guideOpen"
            @click="guideOpen = !guideOpen"
          >{{ t(guideOpen ? 'surveys.workspace.questions.guideCollapse' : 'surveys.workspace.questions.guideExpand') }}</button>
        </header>
        <div v-show="guideOpen" class="sq-guide-body">
          <template v-if="guideParts.source || guideParts.text">
            <p v-if="guideParts.source" class="sq-guide-source">【{{ guideParts.source }}】</p>
            <p class="sq-guide-text">{{ guideParts.text }}</p>
          </template>
          <template v-if="activeQuestion.guide.scenarios.length">
            <h4 class="sq-guide-label">【{{ t('surveys.workspace.questions.guideScenarios') }}】</h4>
            <ul class="sq-guide-list">
              <li v-for="scenario in activeQuestion.guide.scenarios" :key="scenario">{{ scenario }}</li>
            </ul>
          </template>
          <template v-if="activeQuestion.guide.notApplicable">
            <h4 class="sq-guide-label">【{{ t('surveys.workspace.questions.guideNotApplicable') }}】</h4>
            <p class="sq-guide-text">{{ activeQuestion.guide.notApplicable }}</p>
          </template>
        </div>
      </section>

      <footer class="sq-main-foot">
        <a-button class="app-btn-neutral" :disabled="activeIndex <= 0" @click="activeCode = codes[activeIndex - 1]">
          <template #icon><IconLeft /></template>{{ t('surveys.workspace.questions.prev') }}
        </a-button>
        <a-button class="app-btn-neutral" :disabled="activeIndex >= codes.length - 1" @click="activeCode = codes[activeIndex + 1]">
          {{ t('surveys.workspace.questions.next') }}<template #icon><IconRight /></template>
        </a-button>
      </footer>
    </section>

    <!-- 待定二次确认（05 §2.3）：允许提交，提醒相关条款可能需要核验 -->
    <a-modal
      :visible="pendingTarget.length > 0"
      :width="456"
      :title="t('surveys.workspace.questions.pendingTitle')"
      @cancel="pendingTarget = []"
    >
      <p>{{ t('surveys.workspace.questions.pendingBody', { codes: pendingCodesText }) }}</p>
      <template #footer>
        <a-button class="app-btn-neutral" @click="pendingTarget = []">{{ t('surveys.actions.cancel') }}</a-button>
        <a-button type="primary" :loading="completing" @click="doComplete">{{ t('surveys.workspace.questions.pendingOk') }}</a-button>
      </template>
    </a-modal>

    <!-- 修改作答确认（T-EXTRA-8：重算不覆盖人工值） -->
    <a-modal
      :visible="editModalOpen"
      :width="456"
      :title="t('surveys.workspace.questions.editTitle')"
      @cancel="editModalOpen = false"
    >
      <p>{{ t('surveys.workspace.questions.editBody') }}</p>
      <template #footer>
        <a-button class="app-btn-neutral" @click="editModalOpen = false">{{ t('surveys.actions.cancel') }}</a-button>
        <a-button type="primary" @click="confirmEdit">{{ t('surveys.workspace.questions.editOk') }}</a-button>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
/* 两栏（2026-10-27 裁决）：320px 导航（含进度，hover 气泡显完整题干）+ 弹性主区，白卡间距 16px */
.step-questions { display: flex; align-items: stretch; gap: 16px; min-width: 0; font-size: 14px; color: var(--color-text-1); }
.sq-card { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.sq-nav { flex: none; width: 320px; display: flex; flex-direction: column; }
.sq-main { flex: 1; display: flex; flex-direction: column; }

/* 导航块顶部：作答进度（进度条 + 已答计数 + 待定提示 + 模板信息） */
.sq-progress { flex: none; display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.sq-progress-track { height: 8px; border-radius: 4px; background: var(--color-fill-3); overflow: hidden; }
.sq-progress-fill { height: 100%; border-radius: 4px; background: var(--app-accent); transition: width 160ms ease-out; }
.sq-progress-meta { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.sq-progress-count { color: var(--color-text-1); font-variant-numeric: tabular-nums; }
.sq-progress-pending { color: rgb(var(--orange-6)); font-size: 12px; line-height: 20px; }

/* 题目列表：题号 + 简题干（单行截断）+ 答案徽标；选中浅主色底 */
.sq-nav-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
.sq-nav-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border: 0; border-radius: 2px; background: transparent; color: var(--color-text-2); font: inherit; text-align: left; cursor: pointer; }
.sq-nav-item:hover { color: var(--app-accent); background: var(--color-fill-1); }
.sq-nav-item.active { color: var(--app-accent); background: var(--color-primary-light-1); }
.sq-nav-item:focus-visible { outline: 2px solid var(--app-accent); outline-offset: -2px; }
.sq-nav-code { flex: none; font-variant-numeric: tabular-nums; font-weight: 600; }
.sq-nav-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sq-nav-badge { flex: none; }
.sq-nav-none { flex: none; color: var(--color-text-3); font-size: 12px; line-height: 20px; }

/* 主区题卡 */
.sq-question-head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 16px; }
.sq-question-code { flex: none; margin-top: 2px; font-variant-numeric: tabular-nums; }
.sq-question-title { margin: 0; color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; }

/* 三态作答：标准圆形单选（是 / 否 / 待定），选中即存 */
.sq-answer :deep(.arco-radio-group) { display: flex; flex-wrap: wrap; gap: 4px 24px; }
.sq-pending-hint { display: flex; align-items: flex-start; gap: 6px; margin: 8px 0 0; color: rgb(var(--orange-6)); font-size: 12px; line-height: 20px; }
.sq-pending-hint svg { flex: none; margin-top: 3px; }
.sq-readonly-hint { margin: 8px 0 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }

/* 判断指引（2026-10-27 裁决）：标题+正文共一个区块，整卡 1px 描边（--app-control-border）；
   头行（判断指引 + 收起）灰底、正文区白底，整卡默认展开 */
.sq-guide { margin-top: 16px; border: 1px solid var(--app-control-border); border-radius: 2px; background: var(--app-surface); overflow: hidden; }
.sq-guide-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; background: var(--app-surface-soft); }
.sq-guide-title { margin: 0; color: var(--color-text-1); font-size: 14px; font-weight: 600; line-height: 22px; }
.sq-guide-toggle { flex: none; padding: 0; border: 0; background: none; color: var(--app-accent); font: inherit; font-size: 13px; line-height: 22px; cursor: pointer; }
.sq-guide-toggle:hover, .sq-guide-toggle:focus-visible { text-decoration: underline; }
.sq-guide-toggle:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.sq-guide-body { padding: 12px; background: var(--app-surface); }
.sq-guide-source { margin: 0 0 4px; color: var(--color-text-1); font-weight: 600; line-height: 22px; }
.sq-guide-text { margin: 0; color: var(--color-text-1); line-height: 22px; }
.sq-guide-label { margin: 12px 0 4px; color: var(--color-text-1); font-weight: 600; line-height: 22px; }
.sq-guide-list { margin: 0; padding-left: 20px; color: var(--color-text-1); line-height: 22px; }
.sq-guide-list li + li { margin-top: 4px; }

/* 上一题 / 下一题：不加分隔线，直接跟随判断指引 */
.sq-main-foot { display: flex; justify-content: space-between; gap: 8px; margin-top: 16px; }

@media (max-width: 1100px) {
  .step-questions { flex-direction: column; }
  .sq-nav { width: auto; }
  .sq-nav-list { max-height: 320px; }
}
</style>
