<script setup lang="ts">
/**
 * 任务基本信息绑定表单（2026-10-30 任务下发口径）。
 *
 * 评估问卷由天枢-任务中心下发后，本表单内嵌在任务详情第 1 步「基础信息」：
 * - task 模式：待处理任务 → 选择功能与规则 → 保存草稿（→ 待提交）/ 提交任务（→ 待填写）；
 * - edit 模式：待提交草稿 → 修改已绑定的功能 / 规则 / 填表人。
 * 新建 / 复制入口已随任务下发口径移除，本组件不再独立成页、不再进抽屉。
 */
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { IconExclamationCircle, IconFile, IconInfoCircle, IconRefresh } from '@arco-design/web-vue/es/icon';
import { useI18n } from 'vue-i18n';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { loadLedger } from '../../function-ledger/data/storage';
import { isFunctionEnabled, responsibleDepartments, subfunctionSummary, type FunctionRecord } from '../../function-ledger/data/ledger';
import { loadLocalSurveyDrafts } from '../data/drafts';
import { QUESTION_BANK } from '../data/questions';
import {
  effectiveRequirementItems, effectiveSectionAssignments, publishedRuleVersions, getRuleVersion, type RuleVersion,
} from '../../compliance/data/ruleVersions';
import RuleSourceDetailDrawer from '../components/RuleSourceDetailDrawer.vue';
import { STANDARD_BASELINE, surveyTemplates } from '../../templates/data/templates';
import {
  MOCK_CURRENT_USER, SURVEY_TOTAL_CLAUSES, mergeLocalSurveyDrafts, surveyRecords, updateSurveyDraft, type SurveyRecord,
} from '../data/surveys';

const { t, locale } = useI18n();

/* 规则映射随创建冻结（2026-11-01）：条目裁剪与字段位分配写入快照，规则后续编辑不影响本问卷 */
function requirementItemsOf(rule: RuleVersion): Record<string, string[]> {
  return JSON.parse(JSON.stringify(effectiveRequirementItems(rule))) as Record<string, string[]>;
}
function sectionAssignmentsOf(rule: RuleVersion): Record<string, { section: string; field: string }> {
  const assignments = effectiveSectionAssignments(rule);
  const result: Record<string, { section: string; field: string }> = {};
  for (const [no, ref] of Object.entries(assignments)) result[no] = { section: ref.section, field: ref.field };
  return result;
}

/**
 * 创建时冻结的分母（2026-11-03）：该规则全部条款有效条目数求和（含不可配置的结构项骨架），
 * 与 matching.itemIdsOfRecord 同一口径；规则未配置任何条目时回退 64。
 */
function snapshotItemTotal(rule: RuleVersion): number {
  const mapped = effectiveRequirementItems(rule);
  const total = Object.values(mapped).reduce((sum, ids) => sum + ids.length, 0);
  return total > 0 ? total : SURVEY_TOTAL_CLAUSES;
}
const router = useRouter();
const functions = ref<FunctionRecord[]>([]);
/** 可选条款规则 = 「已发布且启用」的规则（2026-10-29 用户裁决：问卷创建改选条款规则/映射关系） */
const ruleOptions = ref<RuleVersion[]>([]);
const loading = ref(true);
const loadError = ref(false);
const saving = ref(false);
const saved = ref(false);
const refreshingMaster = ref(false);
const refreshingRule = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const formRef = ref<{ validate: () => Promise<unknown>; scrollToField: (field: string) => void } | null>(null);
const form = reactive({
  functionId: '', ruleId: '',
});
const initial = ref(JSON.stringify({ ...form }));
const dirty = computed(() => JSON.stringify({ ...form }) !== initial.value);
/** 两种模式：task = 待处理任务首次绑定（2026-10-30）；edit = 待提交草稿的修改 */
type PageMode = 'edit' | 'task';
const props = withDefaults(defineProps<{ mode?: PageMode; surveyId?: string }>(), {
  mode: 'edit', surveyId: '',
});
const sourceId = computed(() => props.surveyId);
const selectedFunction = computed(() => functions.value.find((item) => item.id === form.functionId));
/** task 模式只允许启用中的功能；edit 模式放行当前已绑定的功能（历史草稿的主数据可能已停用） */
const selectableFunctions = computed(() => functions.value.filter((item) => isFunctionEnabled(item) || (props.mode === 'edit' && item.id === form.functionId)));
const selectedRule = computed(() => ruleOptions.value.find((item) => item.id === form.ruleId));
function displayTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale.value, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}
const rules = computed(() => ({
  functionId: [{ required: true, message: t('surveys.create.requiredFunction') }],
  ruleId: [{ required: true, message: t('surveys.create.requiredRule') }],
}));

let prefilled = false;
/** 预填完整性提示（仅 edit 模式）：快照引用的规则已不可用 → 已用当前最新可用条款规则回填 */
const prefillNote = ref<'' | 'noSnapshot' | 'ruleReplaced'>('');

/** 最新可用条款规则（下拉已按更新时间倒序）；无可选时返回空串 */
function latestPublishedRuleId(): string {
  return ruleOptions.value[0]?.id ?? '';
}

/**
 * 预填：仅 edit 模式（待提交草稿）——功能按记录的 FuLi ID 回选台账，规则按创建快照回选；
 * task 模式（待处理任务）只有任务信息，功能与规则默认不选，由执行人在本页绑定。
 */
function applyPrefill() {
  if (prefilled) return;
  prefilled = true;
  if (props.mode === 'task') {
    initial.value = JSON.stringify({ ...form });
    return;
  }
  const source = surveyRecords.find((item) => item.id === sourceId.value);
  if (!source) {
    Message.warning(t('surveys.create.surveyMissing'));
    return;
  }
  const master = functions.value.find((item) => item.fuliId === source.fuliId);
  if (master && (isFunctionEnabled(master) || props.mode === 'edit')) form.functionId = master.id;
  else Message.warning(t(master ? 'surveys.create.masterDisabled' : 'surveys.create.masterMissing'));
  const snapshot = source.creationSnapshot;
  if (snapshot) {
    // 草稿按创建快照回选规则（历史别名归并后放行）
    const resolvedId = getRuleVersion(snapshot.ruleSetVersion)?.id;
    const matched = resolvedId ? ruleOptions.value.find((item) => item.id === resolvedId) : undefined;
    if (matched) {
      form.ruleId = matched.id;
    } else {
      // 快照引用的规则已删除或停用：回填最新可用规则并在页内标注，不能留空导致无法保存
      form.ruleId = latestPublishedRuleId();
      prefillNote.value = 'ruleReplaced';
    }
  } else {
    // 无创建快照（早期数据 / Excel 导入）：规则按最新可用版本回填并在页内标注
    form.ruleId = latestPublishedRuleId();
    prefillNote.value = 'noSnapshot';
  }
  initial.value = JSON.stringify({ ...form });
}

async function reload() {
  loading.value = true;
  loadError.value = false;
  try {
    const result = await loadLedger();
    mergeLocalSurveyDrafts(await loadLocalSurveyDrafts());
    ruleOptions.value = publishedRuleVersions();
    functions.value = result.records;
    if (form.functionId && !selectableFunctions.value.some((item) => item.id === form.functionId)) form.functionId = '';
    applyPrefill();
  } catch { loadError.value = true; }
  finally {
    loading.value = false;
    await focusFirst();
  }
}

async function focusFirst() {
  await nextTick();
  rootRef.value?.querySelector<HTMLInputElement>('.arco-select-view input')?.focus();
}

onMounted(() => { void reload(); });

onBeforeRouteLeave(() => saved.value || !dirty.value || window.confirm(t('surveys.create.unsaved')));

/** 两种落库结果：保存草稿停留在「待提交」，提交任务 = 分派给填表人，进入「待填写」等待 12 问作答 */
type SaveKind = 'draft' | 'submit';
const SAVE_STATUS: Record<SaveKind, SurveyRecord['status']> = { draft: 'draft', submit: 'pending-fill' };

async function persist(kind: SaveKind) {
  const master = selectedFunction.value;
  const rule = selectedRule.value;
  if (!master || !rule) { saving.value = false; return; }
  // task 模式回写「待处理」任务，edit 模式回写「待提交」草稿；填表人等任务带入字段原样保留
  const editing = surveyRecords.find((item) => item.id === sourceId.value
    && item.status === (props.mode === 'task' ? 'pending' : 'draft'));
  if (!editing) { saving.value = false; Message.warning(t('surveys.create.surveyMissing')); return; }
  if (!isFunctionEnabled(master) && master.fuliId !== editing.fuliId) {
    saving.value = false; Message.error(t('surveys.create.masterDisabled')); return;
  }
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  // 题目内容按规则题集（题号）从题库登记题全集解析，题号按数值排序展示（Q2 < Q10）
  const bankByCode = new Map(QUESTION_BANK.map((question) => [question.code, question]));
  const questions = [...rule.questionSet].sort((a, b) => {
    const na = Number(a.replace(/^Q/, '')); const nb = Number(b.replace(/^Q/, ''));
    return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.localeCompare(b);
  }).map((code) => {
    const bank = bankByCode.get(code);
    return {
      code,
      title: bank?.title ?? '',
      guide: bank ? [bank.guide.basis, ...bank.guide.scenarios, bank.guide.notApplicable].filter(Boolean).join('\n') : '',
    };
  });
  // 问题来源库引用（'问题库编号-问题库名称' 前缀解析）：使用次数与版本引用继续可追溯
  const sourceLibId = rule.questionSource.split('-')[0] ?? '';
  const sourceLib = surveyTemplates.find((item) => item.id === sourceLibId);
  const record: SurveyRecord = {
    ...editing,
    fuliId: master.fuliId, functionName: master.functionName,
    status: SAVE_STATUS[kind], owner: master.owner,
    updatedAt: timestamp, updatedBy: MOCK_CURRENT_USER.name,
    // 分母按所选规则冻结（2026-11-03）：有效条目总数，不同标准库/少配规则如实反映
    totalCount: snapshotItemTotal(rule),
    creationSnapshot: {
      function: {
        platformName: master.platformName, fuliId: master.fuliId, functionName: master.functionName,
        functionDescription: master.functionDescription ?? '',
        subfunctions: master.subfunctions.map((item) => ({ ...item })), owner: master.owner,
        department: master.department, developmentLocation: master.developmentLocation,
        responsibles: responsibleDepartments(master).map((person) => ({ ...person })),
        masterEcu: master.masterEcu,
      },
      masterUpdatedAt: master.updatedAt,
      // 快照冻结：规则（编号/名称/映射表达式）+ 题目集 + 问题来源库引用，规则后续编辑/删除都不影响本问卷
      templateId: sourceLib?.id, templateName: sourceLib?.name ?? rule.questionSource,
      templateVersion: sourceLib?.version ?? '',
      templateUpdatedAt: sourceLib?.updatedAt, templateNote: sourceLib?.note,
      questions,
      questionCount: questions.length, ruleSetVersion: rule.id,
      // 规则映射随创建冻结：条目裁剪与字段位分配在问卷生命周期内不随规则编辑漂移（2026-11-01）
      ruleItems: requirementItemsOf(rule), ruleSections: sectionAssignmentsOf(rule),
      mappingVersion: rule.id, standardPdfSha256: STANDARD_BASELINE.standardPdfSha256,
      standardDraftDate: STANDARD_BASELINE.standardDraftDate,
    },
  };
  try {
    await updateSurveyDraft(record);
    saved.value = true;
    Message.success(kind === 'submit' ? t('surveys.create.submitSuccess') : t('surveys.create.success'));
  } catch (error) {
    Message.error(t(error instanceof Error && error.message === 'Function is disabled' ? 'surveys.create.masterDisabled' : 'surveys.create.saveError'));
  } finally { saving.value = false; }
}

/** 校验 → 按动作落库；提交与保存共用同一套校验（任务下发口径无「重复新建」确认） */
async function submit(kind: SaveKind) {
  if (saving.value) return;
  const errors = await formRef.value?.validate();
  if (errors) {
    formRef.value?.scrollToField(Object.keys(errors as Record<string, unknown>)[0]);
    return;
  }
  if (!selectedFunction.value || !selectedRule.value) return;
  saving.value = true;
  await persist(kind);
}

function submitDraft() { void submit('draft'); }
function submitSurvey() { void submit('submit'); }
/** 取消：不保存返回任务列表；脏数据由 onBeforeRouteLeave 的离开确认兜底 */
function cancelEdit() {
  void router.push({ name: 'surveys' });
}

/** 来源详情抽屉（2026-10-30 用户裁决）：标准库/问题库/安全需求 字段右侧【查看详情】 */
type SourceKind = 'standard' | 'question' | 'safety';
const sourceDrawerOpen = ref(false);
const sourceKind = ref<SourceKind>('standard');
const sourceValue = computed(() => {
  if (!selectedRule.value) return '';
  if (sourceKind.value === 'standard') return selectedRule.value.standardSource;
  if (sourceKind.value === 'question') return selectedRule.value.questionSource;
  return selectedRule.value.safetyRequirement;
});
function openSourceDetail(kind: SourceKind) {
  sourceKind.value = kind;
  sourceDrawerOpen.value = true;
}
defineExpose({ submitDraft, submitSurvey, focusFirst, saving, canSubmit: computed(() => selectableFunctions.value.length > 0) });

/** 刷新功能主数据：重读台账让快照对齐最新字段；功能已不在台账时清空选择并提示重选 */
async function refreshMaster() {
  if (refreshingMaster.value || !form.functionId) return;
  const currentId = form.functionId;
  refreshingMaster.value = true;
  try {
    const before = JSON.stringify(selectedFunction.value ?? null);
    const result = await loadLedger();
    functions.value = result.records;
    const next = functions.value.find((item) => item.id === currentId);
    if (!next || (!isFunctionEnabled(next) && props.mode !== 'edit')) {
      form.functionId = '';
      Message.warning(t(next ? 'surveys.create.masterDisabled' : 'surveys.create.masterMissing'));
      return;
    }
    Message.success(before === JSON.stringify(next)
      ? t('surveys.create.masterUpToDate') : t('surveys.create.masterRefreshed'));
  } catch {
    Message.error(t('surveys.create.refreshError'));
  } finally { refreshingMaster.value = false; }
}

/** 刷新规则信息：重读「已发布且启用」的条款规则；所选规则已停用/删除时清空选择并提示重选 */
async function refreshRule() {
  if (refreshingRule.value) return;
  refreshingRule.value = true;
  try {
    const before = JSON.stringify(ruleOptions.value);
    const next = publishedRuleVersions();
    ruleOptions.value = next;
    if (form.ruleId && !next.some((item) => item.id === form.ruleId)) {
      form.ruleId = '';
      Message.warning(t('surveys.create.ruleMissing'));
      return;
    }
    Message.success(before === JSON.stringify(next)
      ? t('surveys.create.ruleUpToDate') : t('surveys.create.ruleRefreshed'));
  } catch {
    Message.error(t('surveys.create.refreshError'));
  } finally { refreshingRule.value = false; }
}
</script>

<template>
  <div ref="rootRef" class="survey-create">
    <div v-if="loading" class="create-state"><a-spin :tip="t('surveys.create.loading')" /></div>
    <div v-else-if="loadError" class="create-state">
      <a-result status="error" :title="t('surveys.create.loadError')">
        <template #extra><a-button class="app-btn-neutral" @click="reload">{{ t('surveys.create.retry') }}</a-button></template>
      </a-result>
    </div>
    <!-- 单张白卡区块：任务基本信息绑定（功能 / 规则 / 填表人） -->
    <a-form
      v-else
      ref="formRef"
      class="create-form"
      :model="form"
      :rules="rules"
      layout="vertical"
      scroll-to-first-error
      @submit-success="submitDraft"
    >
      <section class="create-panel" :aria-label="t('surveys.create.settings')">
        <a-form-item field="functionId" :label="t('surveys.create.function')" required>
          <a-select v-model="form.functionId" allow-search allow-clear :placeholder="t('surveys.create.functionPlaceholder')" :disabled="!selectableFunctions.length">
            <a-option v-for="item in selectableFunctions" :key="item.id" :value="item.id" :label="`${item.fuliId} · ${item.functionName}`" />
          </a-select>
        </a-form-item>
        <a-empty v-if="!selectableFunctions.length" :description="t('surveys.create.noFunctions')">
          <template #image><IconFile :size="32" /></template>
        </a-empty>
        <router-link v-if="!selectableFunctions.length" class="create-ledger-link" :to="{ name: 'function-ledger' }">{{ t('surveys.create.openLedger') }}</router-link>

        <!-- 选择功能后：整块描边信息区（字段 + 纠错说明 + 刷新）紧贴选择器下方 -->
        <div v-if="selectedFunction" class="create-facts">
          <dl class="create-facts-list">
            <dt>{{ t('ledger.fields.platformName') }}</dt>
            <dd>{{ selectedFunction.platformName }}</dd>
            <dt>{{ t('ledger.fields.fuliId') }}</dt>
            <dd>{{ selectedFunction.fuliId }}</dd>
            <dt>{{ t('ledger.fields.functionName') }}</dt>
            <dd>{{ selectedFunction.functionName }}</dd>
            <dt>{{ t('ledger.fields.functionDescription') }}</dt>
            <dd>{{ selectedFunction.functionDescription || '—' }}</dd>
            <dt>{{ t('ledger.fields.subfunctions') }}</dt>
            <dd>{{ selectedFunction.subfunctions.map((item) => subfunctionSummary(item)).join(locale === 'zh-CN' ? '、' : ', ') || '—' }}</dd>
            <dt>{{ t('ledger.fields.responsibles') }}</dt>
            <dd>{{ responsibleDepartments(selectedFunction).map((person) => `${person.name} · ${t('ledger.form.departmentValue', { department: person.department })}`).join(locale === 'zh-CN' ? '、' : '; ') }}</dd>
            <dt>{{ t('ledger.fields.developmentLocation') }}</dt>
            <dd>{{ t(`ledger.locations.${selectedFunction.developmentLocation}`) }}</dd>
            <dt>{{ t('ledger.fields.masterEcu') }}</dt>
            <dd>{{ selectedFunction.masterEcu || '—' }}</dd>
            <dt>{{ t('surveys.create.masterTime') }}</dt>
            <dd>{{ displayTime(selectedFunction.updatedAt) }}</dd>
          </dl>
          <!-- 底部：数据纠错指引 + 刷新最新功能信息（图标按钮须有可访问名与气泡） -->
          <div class="create-facts-foot">
            <p class="create-facts-hint">
              <IconInfoCircle :size="14" aria-hidden="true" />
              <span>{{ t('surveys.create.masterHint') }}</span>
            </p>
            <a-tooltip :content="t('surveys.create.refreshMaster')">
              <a-button
                class="create-icon-btn"
                :loading="refreshingMaster"
                :aria-label="t('surveys.create.refreshMaster')"
                @click="refreshMaster"
              >
                <template #icon><IconRefresh /></template>
              </a-button>
            </a-tooltip>
          </div>
        </div>

        <a-form-item field="ruleId" :label="t('surveys.create.ruleSelect')" required>
          <a-select v-model="form.ruleId" allow-clear :placeholder="t('surveys.create.rulePlaceholder')">
            <a-option v-for="item in ruleOptions" :key="item.id" :value="item.id" :label="t('surveys.create.ruleOption', { name: item.name, count: item.questionSet.length })" />
          </a-select>
        </a-form-item>

        <!-- 选择条款规则后：整块描边信息区（规则名称/标准库/问题库/安全需求/编号/题目数/更新时间
             + 冻结说明 + 刷新）紧贴选择器下方；来源三字段右侧【查看详情】打开对应详情抽屉 -->
        <div v-if="selectedRule" class="create-facts">
          <dl class="create-facts-list">
            <dt>{{ t('surveys.create.ruleName') }}</dt>
            <dd>{{ selectedRule.name }}</dd>
            <dt>{{ t('surveys.create.standardLibrary') }}</dt>
            <dd>
              <span>{{ selectedRule.standardSource || '—' }}</span>
              <a-link v-if="selectedRule.standardSource" class="source-detail-link" @click="openSourceDetail('standard')">{{ t('surveys.create.sourceDetail.viewDetail') }}</a-link>
            </dd>
            <dt>{{ t('surveys.create.questionLibrary') }}</dt>
            <dd>
              <span>{{ selectedRule.questionSource || '—' }}</span>
              <a-link v-if="selectedRule.questionSource" class="source-detail-link" @click="openSourceDetail('question')">{{ t('surveys.create.sourceDetail.viewDetail') }}</a-link>
            </dd>
            <dt>{{ t('surveys.create.safetyRequirementLabel') }}</dt>
            <dd>
              <span>{{ selectedRule.safetyRequirement || '—' }}</span>
              <a-link v-if="selectedRule.safetyRequirement" class="source-detail-link" @click="openSourceDetail('safety')">{{ t('surveys.create.sourceDetail.viewDetail') }}</a-link>
            </dd>
            <dt>{{ t('surveys.create.ruleNo') }}</dt>
            <dd>{{ selectedRule.id }}</dd>
            <dt>{{ t('surveys.create.questionCount') }}</dt>
            <dd>{{ selectedRule.questionSet.length }}</dd>
            <dt>{{ t('surveys.create.ruleUpdatedAt') }}</dt>
            <dd>{{ selectedRule.updatedAt }}</dd>
          </dl>
          <!-- 预填说明：源草稿无创建快照 / 引用的规则已不可用时，告知回填来源与保存后的冻结口径 -->
          <p v-if="prefillNote" class="create-facts-note create-prefill-note">
            <IconExclamationCircle :size="14" aria-hidden="true" />
            <span>{{ t(`surveys.create.prefillNote.${prefillNote}`) }}</span>
          </p>
          <!-- 底部：冻结说明 + 刷新最新规则信息 -->
          <div class="create-facts-foot">
            <div class="create-facts-messages">
              <p class="create-facts-hint">{{ t('surveys.create.snapshotNote') }}</p>
            </div>
            <a-tooltip :content="t('surveys.create.refreshRule')">
              <a-button
                class="create-icon-btn"
                :loading="refreshingRule"
                :aria-label="t('surveys.create.refreshRule')"
                @click="refreshRule"
              >
                <template #icon><IconRefresh /></template>
              </a-button>
            </a-tooltip>
          </div>
        </div>

        <!-- 填表人 / 审批人 / 创建人均由任务带入（2026-10-30 裁决），此处不提供选择 -->
      </section>
    </a-form>

    <!-- 来源详情抽屉：标准库 / 问题库 / 安全需求（只读，mask 可关 + 底部「关闭」） -->
    <RuleSourceDetailDrawer v-model:visible="sourceDrawerOpen" :kind="sourceKind" :source="sourceValue" />

    <!-- 全局动作：Teleport 到任务详情面包屑右侧（与步骤 2 作答同构，2026-10-30 裁决）：
         取消（不保存返回列表）/ 保存草稿（→待提交）/ 提交任务（→待填写）；保存中禁止重复提交 -->
    <Teleport defer to="#detail-topbar-actions">
      <template v-if="!loading && !loadError">
        <a-button class="app-btn-neutral" :disabled="saving" data-testid="cs-cancel" @click="cancelEdit">{{ t('surveys.create.cancel') }}</a-button>
        <a-button class="app-btn-neutral" :loading="saving" :disabled="!selectableFunctions.length" data-testid="cs-save-draft" @click="submitDraft">{{ t('surveys.create.saveDraft') }}</a-button>
        <a-button type="primary" :loading="saving" :disabled="!selectableFunctions.length" data-testid="cs-submit" @click="submitSurvey">{{ t('surveys.create.submit') }}</a-button>
      </template>
    </Teleport>
  </div>
</template>

<style scoped>
/* 内嵌在任务详情第 1 步：单张白卡（基本信息），随详情页 flex 列拉伸——
   区块撑满剩余高度，使区块底边与页面底部保持 16px 间距（同分区表单编辑页口径） */
.survey-create { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; color: var(--color-text-1); font-size: 14px; }

/* 区块栈：任务基本信息为单张白卡 */
.create-form { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; gap: 16px; }
.create-panel { flex: 1 1 auto; min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
/* 字段名不做加粗（2026-10-26 用户裁决）：14px/400/22 + Text-1 */
.create-form :deep(.arco-form-item-label) { color: var(--color-text-1); font-weight: 400; }
.create-form :deep(.arco-form-item-wrapper-col) { min-width: 0; }
.create-last-field { margin-bottom: 0; }

/* 表单控件与下方信息区块统一 500px 宽，左对齐 */
.create-form :deep(.arco-form-item-content-wrapper) { width: 100%; max-width: 500px; }

/* 选择器下方信息区：白底 + 1px 描边，字段、说明与刷新同处一区（2026-10-26 用户裁决：去掉灰底改描边） */
.create-facts { max-width: 500px; margin: -8px 0 20px; padding: 12px 16px; border: 1px solid var(--app-control-border); border-radius: 2px; background: var(--app-surface); }
.create-facts-list { display: grid; grid-template-columns: 108px minmax(0, 1fr); gap: 8px 12px; margin: 0; font-size: 14px; line-height: 22px; }
.create-facts-list dt { color: var(--color-text-2); font-weight: 400; }
.create-facts-list dd { margin: 0; color: var(--color-text-1); overflow-wrap: anywhere; }
/* 来源三字段（标准库/问题库/安全需求）值右侧【查看详情】（2026-10-30 裁决） */
.create-facts-list dd { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.source-detail-link { flex: none; font-size: 12px; line-height: 22px; }
.create-facts-note { display: flex; align-items: flex-start; gap: 6px; margin: 10px 0 0; color: var(--color-text-2); font-size: 12px; line-height: 20px; }
.create-facts-note :deep(svg) { flex: none; margin-top: 3px; color: var(--app-color-warning); }

/* 信息区底部：左侧 12px 辅助说明，右侧 32×32 图标按钮（图标 16px） */
.create-facts-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; }
.create-facts-messages { display: flex; flex: 1; flex-direction: column; gap: 8px; min-width: 0; }
.create-facts-hint { display: flex; flex: 1; align-items: flex-start; min-width: 0; gap: 6px; margin: 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.create-facts-hint :deep(svg) { flex: none; margin-top: 3px; }
.create-icon-btn.arco-btn { flex: none; width: 32px; height: 32px; padding: 0; border: none; border-radius: 2px; color: var(--color-text-3); background: transparent; }
.create-icon-btn.arco-btn :deep(svg) { width: 16px; height: 16px; }
.create-icon-btn.arco-btn:not(.arco-btn-disabled):hover,
.create-icon-btn.arco-btn:not(.arco-btn-disabled):active { color: var(--color-text-1); background: var(--app-surface); }
.create-icon-btn.arco-btn:focus-visible { color: var(--app-accent); box-shadow: 0 0 0 2px rgb(var(--primary-1)); }
.create-ledger-link { display: inline-block; margin: 0 0 16px; color: var(--app-accent); }
.create-state { min-height: 240px; padding: 16px; border-radius: 2px; background: var(--app-surface); display: grid; place-items: center; }

@media (max-width: 600px) {
  .create-facts-list { grid-template-columns: 96px minmax(0, 1fr); }
}
</style>
