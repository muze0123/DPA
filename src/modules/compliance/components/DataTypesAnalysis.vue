<script setup lang="ts">
/**
 * 数据类型分析（标准层只读视图）：「数据类型分析」主表的 15 个类型一屏。
 *
 * - 每行 = 一类数据：定义、涉及条款、关联问题（随所选判定规则版本推导）、问题描述；
 * - 「操作 · 查看明细」下钻到「数据类型分析(详细)」表中的条款明细行（条款 / 涉及对象·数据 /
 *   数据类型归类 / 条款关注点 / 关联问题），即工作簿主表与详表的层级关系；
 * - 类型名仍可点开类型抽屉（定义、问卷落点、关联问题、涉及条款）。
 *
 * 筛选条件渲染在父页面顶部面板里，状态经 props 传入。
 * 传入 `surveyId` 时按该问卷作答标注「涉及 / 不涉及 / 待定 / 无题覆盖」，只读，不回写问卷。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TableColumnData } from '@arco-design/web-vue';
import {
  DATA_TYPE_BY_CODE, DATA_TYPE_CLAUSES, FORMAL_DATA_TYPES, UNTYPED_CLAUSE_NOS,
  DATA_TYPES, clauseDetailRowsOf, clauseQuestions,
  type DataTypeCode, type DataTypeDef, type DataTypeQuestionRef,
} from '../data/dataTypes';
import { standardNode } from '../data/standardLibrary';
import { answerIndexOf } from '../../surveys/data/matching';
import { clausesForVersion, getRuleVersion } from '../../compliance/data/ruleVersions';
import { surveyRecords } from '../../surveys/data/surveys';

const props = defineProps<{
  surveyId?: string;
  /** 判定规则：关联问题随所选版本的触发表达式推导；空 = 未选择，不显示关联问题 */
  ruleVersion?: string;
  /** 已应用关键字（父页面顶部筛选面板维护） */
  typeKeyword?: string;
}>();
const emit = defineEmits<{ (e: 'open-clause', no: string): void }>();

const { t } = useI18n();

type TypeStatus = 'involved' | 'not-involved' | 'undetermined' | 'uncovered';

/* ---------------------------------------------------------------- 判定规则（关联问题的推导依据） */

/** 所选判定规则（父层传入 id，默认最近已发布版本；空 = 未选择） */
const activeRule = computed(() => (props.ruleVersion ? getRuleVersion(props.ruleVersion) : null));

/** 条款号 → 该版本触发表达式命中的题目（题号）；未选择规则 = null */
const versionClauseMap = computed(() => {
  const version = activeRule.value;
  if (!version) return null;
  return new Map(clausesForVersion(version.id).map((clause) => [clause.no, clause.hits]));
});

/** 明细弹窗某条款在该版本下的关联问题（与条款判定页同一推导口径） */
function versionClauseQuestions(no: string): string[] {
  return versionClauseMap.value?.get(no) ?? [];
}

/**
 * 类型视角某类型在该版本下的关联问题（业务表原文，可见性由版本题集裁定）：
 * 实现题（ref）在版本题集内才显示；无实现题（平台暂未落地）的业务题不裁剪、恒显示。
 */
function typeQuestionsOf(def: DataTypeDef): readonly DataTypeQuestionRef[] {
  const version = activeRule.value;
  if (!version) return [];
  return def.questions.filter((question) => !question.ref || version.questionSet.includes(question.ref));
}

/* ---------------------------------------------------------------- 问卷联动 */

const linkedRecord = computed(() => (props.surveyId ? surveyRecords.find((item) => item.id === props.surveyId) : undefined));

/** 答案索引：qid → 三态答案（与条款初筛同一份索引，避免口径分叉） */
const answerIndex = computed(() => (linkedRecord.value ? answerIndexOf(linkedRecord.value) : undefined));

/**
 * 某类型在该问卷下是否被涉及：
 * 任一实现题（ref）答「是」→ 涉及；全部答「否」→ 不涉及；含待定/未答 → 待定；
 * 该类型没有判定题或实现题（平台题库暂无落地）→ 无题覆盖（不参与涉及判断，也不计入任何比例）。
 */
function statusOf(def: DataTypeDef): TypeStatus {
  const index = answerIndex.value;
  if (!index || !def.questions.length) return 'uncovered';
  const refs = def.questions.map((question) => question.ref).filter((code): code is string => Boolean(code));
  if (!refs.length) return 'uncovered';
  let pending = false;
  for (const code of refs) {
    const value = index[code];
    if (value === 'yes') return 'involved';
    if (value !== 'no') pending = true;
  }
  return pending ? 'undetermined' : 'not-involved';
}

const statusCount = computed(() => {
  const counts = { involved: 0, notInvolved: 0, undetermined: 0, uncovered: 0 };
  for (const def of FORMAL_DATA_TYPES) {
    const status = statusOf(def);
    if (status === 'involved') counts.involved += 1;
    else if (status === 'not-involved') counts.notInvolved += 1;
    else if (status === 'undetermined') counts.undetermined += 1;
    else counts.uncovered += 1;
  }
  return counts;
});

/* ---------------------------------------------------------------- 类型视角 */

const typeName = (code: DataTypeCode): string => t(`standard.dataTypes.names.${code}`);

const filteredTypes = computed<DataTypeDef[]>(() => {
  const query = (props.typeKeyword ?? '').trim().toLocaleLowerCase();
  if (!query) return [...FORMAL_DATA_TYPES];
  return FORMAL_DATA_TYPES.filter((def) => `${typeName(def.code)} ${def.definition} ${def.clauses.join(' ')} ${def.code}`
    .toLocaleLowerCase()
    .includes(query));
});

/** 是否有判定题只部分覆盖该类型（模板里避免内联箭头函数，保持类型可推断） */
function hasPartialCoverage(questions: readonly DataTypeQuestionRef[]): boolean {
  return questions.some((question) => question.coverage === 'partial');
}

const typeColumns = computed<TableColumnData[]>(() => {
  const columns: TableColumnData[] = [
    { title: t('standard.dataTypes.columns.name'), dataIndex: 'name', slotName: 'name', width: 170 },
    { title: t('standard.dataTypes.columns.definition'), dataIndex: 'definition', slotName: 'definition', width: 280 },
    // 涉及条款全量平铺（与数据类型分析工作簿同口径），条款号可点击跳条款详情
    { title: t('standard.dataTypes.columns.clauses'), dataIndex: 'clauses', slotName: 'clauses', width: 300 },
    { title: t('standard.dataTypes.columns.questions'), dataIndex: 'questions', slotName: 'questions', width: 150 },
    { title: t('standard.dataTypes.columns.questionStems'), dataIndex: 'questionStems', slotName: 'questionStems' },
  ];
  if (linkedRecord.value) {
    columns.push({ title: t('standard.dataTypes.columns.status'), dataIndex: 'status', slotName: 'status', width: 120 });
  }
  // 操作列固定在右侧：查看明细（下钻「数据类型分析(详细)」的条款明细行）
  columns.push({ title: t('standard.dataTypes.columns.actions'), dataIndex: 'actions', slotName: 'actions', width: 104, fixed: 'right' });
  return columns;
});

/* ---------------------------------------------------------------- 条款数据明细抽屉（主表 → 详表） */

/** 当前查看明细的类型（空 = 抽屉关闭） */
const detailCode = ref<DataTypeCode | ''>('');
const detailType = computed(() => (detailCode.value ? DATA_TYPE_BY_CODE.get(detailCode.value as DataTypeCode) : undefined));
const detailTitle = computed(() => t('standard.dataTypes.detail.title', { name: detailType.value ? typeName(detailType.value.code) : '' }));
/** 明细行 = 详表中条款号命中该类型「涉及条款」的记录（行序随详表） */
const detailRows = computed(() => (detailCode.value ? clauseDetailRowsOf(detailCode.value as DataTypeCode) : []));

function openDetail(code: DataTypeCode) {
  detailCode.value = code;
}
function closeDetail() {
  detailCode.value = '';
}
/** 明细行内点条款：关抽屉并跳「标准条款」查看原文（与列表涉及条款链接同一动作） */
function openClauseFromDetail(no: string) {
  closeDetail();
  emit('open-clause', no);
}

const detailColumns = computed<TableColumnData[]>(() => [
  { title: t('standard.dataTypes.columns.no'), dataIndex: 'no', slotName: 'no', width: 110 },
  { title: t('standard.dataTypes.columns.subject'), dataIndex: 'subject', slotName: 'subject', width: 240 },
  { title: t('standard.dataTypes.columns.kinds'), dataIndex: 'kinds', slotName: 'kinds', width: 200 },
  { title: t('standard.dataTypes.columns.focus'), dataIndex: 'focus', slotName: 'focus' },
  { title: t('standard.dataTypes.columns.clauseQuestions'), dataIndex: 'questions', slotName: 'questions', width: 130 },
]);

/** 类型抽屉 */
const activeCode = ref<DataTypeCode | ''>('');
const drawerOpen = ref(false);
const activeType = computed(() => (activeCode.value ? DATA_TYPE_BY_CODE.get(activeCode.value as DataTypeCode) : undefined));
const activeTypeClauses = computed(() => (activeType.value
  ? activeType.value.clauses.map((no) => ({
    no,
    title: standardNode(no)?.title ?? '',
    focus: DATA_TYPE_CLAUSES.find((row) => row.no === no)?.focus ?? '',
  }))
  : []));

function openType(code: DataTypeCode) {
  activeCode.value = code;
  drawerOpen.value = true;
}

function jumpToClause(no: string) {
  drawerOpen.value = false;
  emit('open-clause', no);
}

/**
 * 「未归入具体数据类型的条款」显示条文原文，而不是目录短标题：
 * 标准目录里 6.3.3 / 6.3.4 的 title 在源数据中被截断、6.8 的 title 是章节名「汽车数据出境要求」，
 * 直接渲染标题会与条文不符。PDF 抽取产生的行内换行会把句子切断，这里合并回一行；
 * 以「注：」起首的补充说明保留独立一行（渲染侧 white-space: pre-line）。
 */
function untypedClauseText(no: string): string {
  const node = standardNode(no);
  const raw = (node?.text ?? '').trim();
  if (!raw) return node?.title ?? '';
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((acc, line, index) => {
      if (index === 0) return line;
      if (/^注[:：]/.test(line)) return `${acc}\n${line}`;
      // 相邻两段都是拉丁字符时补一个空格，避免英文单词被粘连
      const joiner = /[A-Za-z0-9]$/.test(acc) && /^[A-Za-z0-9]/.test(line) ? ' ' : '';
      return `${acc}${joiner}${line}`;
    }, '');
}

/* ---------------------------------------------------------------- 条款视角已内联为「查看明细」弹窗（2026-10-28） */
</script>

<template>
  <div class="dt-root">
    <!-- 问卷联动提示：来自问卷工作区时按该卷作答标注，只读 -->
    <p v-if="linkedRecord" class="dt-link-banner" role="status">
      <span class="dt-link-banner-text">{{ t('standard.dataTypes.linked.banner', { id: linkedRecord.id, name: linkedRecord.functionName }) }}</span>
      <span class="dt-link-banner-stats tabular">
        {{ t('standard.dataTypes.linked.stats', statusCount) }}
      </span>
    </p>

    <!-- 列表区（筛选条件在父页面顶部面板内） -->
    <section class="dt-panel dt-list-panel" role="region" :aria-label="t('standard.dataTypes.listTitle')">
        <div class="dt-toolbar">
          <h2 class="dt-title">{{ t('standard.dataTypes.listTitle') }}</h2>
          <span class="dt-meta tabular">{{ t('standard.dataTypes.count', { count: filteredTypes.length }) }}</span>
        </div>
        <a-table class="dt-table" :columns="typeColumns" :data="filteredTypes" row-key="code" :pagination="false" :bordered="false" :stripe="false" :scroll="{ x: 1180 }">
          <template #name="{ record }">
            <button type="button" class="dt-name-link" @click="openType(record.code)">{{ typeName(record.code) }}</button>
          </template>
          <template #definition="{ record }">
            <span class="dt-ellipsis" :title="record.definition">{{ record.definition }}</span>
          </template>
          <!-- 涉及条款全量平铺（对齐数据类型分析工作簿），条款号可点击查看条款详情 -->
          <template #clauses="{ record }">
            <span class="dt-clauses">
              <template v-for="(no, index) in record.clauses" :key="no">
                <button type="button" class="dt-clause-link tabular" @click="jumpToClause(no)">{{ no }}</button><span v-if="index < record.clauses.length - 1" class="dt-clause-sep">、</span>
              </template>
            </span>
          </template>
          <template #questions="{ record }">
            <!-- 未选择判定规则 = 关联问题不可知，不显示 -->
            <span v-if="!activeRule" class="dt-muted">—</span>
            <span v-else-if="!typeQuestionsOf(record).length" class="dt-gap">
              <a-tag size="small" color="gray">{{ t('standard.dataTypes.coverage.none') }}</a-tag>
            </span>
            <span v-else class="dt-tags">
              <a-tag v-for="question in typeQuestionsOf(record)" :key="question.code" size="small">
                {{ question.code }}
                <span v-if="question.coverage === 'partial'" class="dt-partial-mark">*</span>
              </a-tag>
              <a-tooltip v-if="hasPartialCoverage(typeQuestionsOf(record))" :content="t('standard.dataTypes.coverage.partialHint')">
                <span class="dt-partial-note">*{{ t('standard.dataTypes.coverage.partialShort') }}</span>
              </a-tooltip>
            </span>
          </template>
          <template #status="{ record }">
            <a-tag size="small" :color="statusOf(record) === 'involved' ? 'green' : statusOf(record) === 'undetermined' ? 'orange' : 'gray'">
              {{ t(`standard.dataTypes.statuses.${statusOf(record)}`) }}
            </a-tag>
          </template>
          <!-- 问题描述 = 业务表「数据类型分析」工作表原文（每题一行，全量显示）；未选规则或该版本无题时显示「—」 -->
          <template #questionStems="{ record }">
            <span v-if="!activeRule || !typeQuestionsOf(record).length" class="dt-muted">—</span>
            <ul v-else class="dt-stems">
              <li v-for="question in typeQuestionsOf(record)" :key="question.code">
                {{ question.label || question.code }}
              </li>
            </ul>
          </template>
          <!-- 操作：查看明细 —— 下钻该类型在工作簿「数据类型分析(详细)」中的条款行 -->
          <template #actions="{ record }">
            <a-button type="text" size="mini" @click="openDetail(record.code)">{{ t('standard.dataTypes.detail.action') }}</a-button>
          </template>
          <template #empty>
            <a-empty :description="t((props.typeKeyword ?? '').trim() ? 'standard.dataTypes.noMatch' : 'standard.dataTypes.empty')" />
          </template>
        </a-table>

        <!-- 不指向具体数据类型的条款：流程要求、设备参数要求、行为禁令 -->
        <div class="dt-untyped">
          <h3 class="dt-untyped-title">{{ t('standard.dataTypes.untyped.title') }}</h3>
          <div class="dt-untyped-body">
            <p class="dt-untyped-hint">{{ t('standard.dataTypes.untyped.hint') }}</p>
            <ul class="dt-untyped-list">
              <li v-for="no in UNTYPED_CLAUSE_NOS" :key="no">
                <button type="button" class="dt-clause-link tabular" @click="emit('open-clause', no)">{{ no }}</button>
                <span class="dt-untyped-text">{{ untypedClauseText(no) }}</span>
              </li>
            </ul>
          </div>
        </div>
    </section>

    <!-- 条款数据明细抽屉（主表「数据类型分析」→ 详表「数据类型分析(详细)」的同类型条款行） -->
    <a-drawer
      class="ledger-drawer dt-detail-drawer" :visible="Boolean(detailCode)" width="min(1000px, 100vw)"
      :mask-closable="true" esc-to-close @cancel="closeDetail"
    >
      <template #title>
        <span class="dt-detail-title" :title="detailTitle">{{ detailTitle }}</span>
      </template>
      <section v-if="detailType" class="dt-group">
        <div class="dt-group-head">
          <h2 class="tabular">{{ t('standard.dataTypes.detail.count', { count: detailRows.length }) }}</h2>
        </div>
        <a-table
          class="dt-table dt-detail-table" :columns="detailColumns" :data="detailRows" row-key="no"
          :pagination="false" :bordered="false" :stripe="false" :scroll="{ x: 900 }"
        >
          <template #no="{ record }">
            <button type="button" class="dt-clause-link tabular" @click="openClauseFromDetail(record.no)">{{ record.no }}</button>
          </template>
          <template #subject="{ record }">
            <span class="dt-cell-text" :title="record.subject">{{ record.subject }}</span>
          </template>
          <template #kinds="{ record }">
            <span v-if="!record.kinds.length" class="dt-muted">—</span>
            <span v-else class="dt-tags">
              <a-tag v-for="kind in record.kinds" :key="kind" size="small">{{ typeName(kind) }}</a-tag>
            </span>
          </template>
          <template #focus="{ record }">
            <span class="dt-cell-text" :title="record.focus">{{ record.focus }}</span>
          </template>
          <template #questions="{ record }">
            <!-- 与条款判定页同一推导：按所选判定规则版本的触发表达式取命中题；未选规则显示「—」。
                 明细抽屉行高统一 44px：多题合为一行文本（题号与条款号同为语言中立代号，分隔符同条款列「、」），超长省略 + title 兜底 -->
            <span v-if="!activeRule || !versionClauseQuestions(record.no).length" class="dt-muted">—</span>
            <span
              v-else class="dt-cell-text"
              :title="versionClauseQuestions(record.no).join('、')"
            >{{ versionClauseQuestions(record.no).join('、') }}</span>
          </template>
          <template #empty><a-empty :description="t('standard.dataTypes.detail.empty')" /></template>
        </a-table>
      </section>
      <template #footer>
        <div class="dt-footer">
          <a-button class="app-btn-neutral" @click="closeDetail">{{ t('standard.dataTypes.detail.close') }}</a-button>
        </div>
      </template>
    </a-drawer>

    <!-- 类型详情抽屉：定义 / 问卷落点 / 判定题 / 涉及条款 -->
    <a-drawer
      class="ledger-drawer dt-drawer" :visible="drawerOpen" :width="640"
      :mask-closable="true" @cancel="drawerOpen = false"
    >
      <template #title>{{ activeType ? typeName(activeType.code) : '' }}</template>
      <template v-if="activeType">
        <section class="dt-group">
          <div class="dt-group-head"><h2>{{ t('standard.dataTypes.drawer.definition') }}</h2></div>
          <p class="dt-text">{{ activeType.definition }}</p>
        </section>

        <section class="dt-group">
          <div class="dt-group-head"><h2>{{ t('standard.dataTypes.drawer.note') }}</h2></div>
          <p class="dt-text">{{ activeType.note }}</p>
        </section>

        <section class="dt-group">
          <div class="dt-group-head">
            <h2>{{ t('standard.dataTypes.drawer.questions') }}</h2>
            <span class="dt-group-meta tabular">{{ activeRule ? typeQuestionsOf(activeType).length : '—' }}</span>
          </div>
          <p v-if="!activeRule" class="dt-hint">{{ t('standard.dataTypes.drawer.noRule') }}</p>
          <p v-else-if="!typeQuestionsOf(activeType).length" class="dt-hint">{{ t('standard.dataTypes.drawer.noQuestions') }}</p>
          <div v-else class="dt-question-list">
            <div v-for="question in typeQuestionsOf(activeType)" :key="question.code" class="dt-question-item">
              <a-tag size="small">{{ question.code }}</a-tag>
              <span class="dt-question-coverage">{{ t(`standard.dataTypes.coverage.${question.coverage}`) }}</span>
            </div>
          </div>
          <div v-if="linkedRecord" class="dt-question-status">
            <span class="dt-question-status-label">{{ t('standard.dataTypes.columns.status') }}</span>
            <a-tag size="small" :color="statusOf(activeType) === 'involved' ? 'green' : statusOf(activeType) === 'undetermined' ? 'orange' : 'gray'">
              {{ t(`standard.dataTypes.statuses.${statusOf(activeType)}`) }}
            </a-tag>
          </div>
        </section>

        <section class="dt-group">
          <div class="dt-group-head">
            <h2>{{ t('standard.dataTypes.drawer.clauses') }}</h2>
            <span class="dt-group-meta tabular">{{ activeTypeClauses.length }}</span>
          </div>
          <ul class="dt-clause-list">
            <li v-for="item in activeTypeClauses" :key="item.no" class="dt-clause-item">
              <div class="dt-clause-head">
                <button type="button" class="dt-clause-link tabular" @click="jumpToClause(item.no)">{{ item.no }}</button>
                <span class="dt-clause-title">{{ item.title }}</span>
              </div>
              <p v-if="item.focus" class="dt-clause-focus">{{ item.focus }}</p>
            </li>
          </ul>
        </section>
      </template>
      <template #footer>
        <div class="dt-footer">
          <a-button class="app-btn-neutral" @click="drawerOpen = false">{{ t('standard.dataTypes.drawer.close') }}</a-button>
        </div>
      </template>
    </a-drawer>
  </div>
</template>

<style scoped>
.dt-root { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dt-panel { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.dt-list-panel { flex: 1; }

/* 联动提示条：信息性，不抢表格层级 */
.dt-link-banner {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px;
  margin: 0; padding: 10px 16px; border-radius: 2px;
  color: var(--color-text-2); background: var(--app-surface); font-size: 12px; line-height: 20px;
}
.dt-link-banner-stats { color: var(--color-text-3); }

/* 筛选条件已上移到父页面顶部面板，本组件只承载列表与抽屉 */
.dt-toolbar { display: flex; align-items: baseline; gap: 8px 12px; flex-wrap: wrap; margin-bottom: 16px; }
.dt-title { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.dt-meta { color: var(--color-text-3); font-size: 12px; line-height: 20px; }

.dt-table { min-width: 0; }
.dt-table :deep(.arco-table), .dt-table :deep(.arco-table-container) { border: 0; }
.dt-table :deep(.arco-table-th) {
  height: 44px; padding: 0 12px; border-bottom: 1px solid var(--app-divider);
  color: var(--color-text-1); background: var(--app-table-header);
  font-size: 14px; font-weight: 600; line-height: 22px; white-space: nowrap; text-align: left;
}
.dt-table :deep(.arco-table-td) {
  height: 52px; padding: 8px 12px; border-bottom: 1px solid var(--app-divider);
  background: var(--app-surface); font-size: 14px; line-height: 22px; text-align: left;
}
.dt-table :deep(.arco-table-tr:hover .arco-table-td) { background: var(--color-fill-1); }
.dt-table :deep(.arco-table-cell) { padding: 0; line-height: 22px; }
.dt-table :deep(.arco-table-td .arco-btn) { padding: 0; }

.dt-name-link, .dt-clause-link {
  padding: 0; border: 0; background: transparent; color: var(--color-text-1);
  font: inherit; text-align: left; cursor: pointer;
}
.dt-name-link:hover, .dt-name-link:focus-visible,
.dt-clause-link:hover, .dt-clause-link:focus-visible { color: var(--app-accent); text-decoration: underline; }
.dt-ellipsis { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 涉及条款：全量平铺、可换行；条款号为可点链接，分隔符不参与换行断词 */
.dt-clauses { display: block; min-width: 0; font-size: 13px; line-height: 22px; }
.dt-clauses .dt-clause-link { color: var(--color-text-1); }
.dt-clauses .dt-clause-link:hover, .dt-clauses .dt-clause-link:focus-visible { color: var(--app-accent); text-decoration: none; }
.dt-clause-sep { color: var(--color-text-3); }
/* 问题描述：业务表「数据类型分析」工作表原文，每题一行、全量显示 */
.dt-stems { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; color: var(--color-text-1); }
.dt-stems li { min-width: 0; line-height: 22px; overflow-wrap: anywhere; }
.dt-tags { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.dt-partial-mark { color: var(--color-text-3); }
.dt-partial-note { color: var(--color-text-3); font-size: 12px; line-height: 20px; cursor: help; }
.dt-gap { display: inline-flex; }
.dt-muted { color: var(--color-text-2); }

/* 未归入具体数据类型的条款：独立虚线描边区块（标题 + 说明 + 条款列表），与表格留 16px 间距 */
.dt-untyped { margin-top: 16px; padding: 16px; border: 1px dashed var(--app-divider); border-radius: 2px; }
.dt-untyped-title { margin: 0; font-size: 14px; font-weight: 600; line-height: 22px; }
/* 说明与条款列表同处一个内容区块（标题在外），便于整块对齐与后续扩展 */
.dt-untyped-body { display: flex; flex-direction: column; min-width: 0; }
.dt-untyped-hint { margin: 8px 0 12px; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.dt-untyped-list { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
/* 条款编号固定列宽（64px）左对齐、条款内容左对齐；grid 双列使各行内容列纵向对齐，「注」折行留在内容列内 */
.dt-untyped-list li {
  display: grid; grid-template-columns: 64px minmax(0, 1fr);
  column-gap: 12px; row-gap: 4px; align-items: baseline; min-width: 0;
}
/* 条文原文：保留「注：」前的换行，其余行内换行已在 untypedClauseText() 中合并 */
.dt-untyped-text { min-width: 0; color: var(--color-text-2); font-size: 14px; line-height: 22px; white-space: pre-line; }

/* 明细抽屉：正文白色分组卡片（标题 = 条数 + 紧凑表格）；表格行高降到 44px，避免纵向滚动过长 */
.dt-detail-title { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dt-detail-table :deep(.arco-table-th) { height: 40px; }
.dt-detail-table :deep(.arco-table-td) { height: 44px; padding: 6px 12px; }
/* 弹窗内长文本单元格：单行省略 + 原生 title 兜底（与列表页同一处理） */
.dt-cell-text { display: block; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dt-group { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.dt-group-head { display: flex; align-items: center; justify-content: space-between; gap: 8px 12px; }
.dt-group-head h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.dt-group-meta { color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.dt-text { margin: 0; font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dt-hint { margin: 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.dt-question-list { display: flex; flex-direction: column; gap: 8px; }
.dt-question-item { display: flex; align-items: center; gap: 8px; }
.dt-question-coverage { color: var(--color-text-2); font-size: 12px; line-height: 20px; }
.dt-question-status { display: flex; align-items: center; gap: 8px; padding-top: 12px; border-top: 1px dashed var(--app-divider); }
.dt-question-status-label { color: var(--color-text-2); font-size: 14px; line-height: 22px; }
.dt-clause-list { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none; }
.dt-clause-item { display: flex; flex-direction: column; gap: 4px; padding-left: 12px; border-left: 2px solid var(--app-divider); }
.dt-clause-head { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.dt-clause-title { min-width: 0; color: var(--color-text-1); font-size: 14px; line-height: 22px; }
.dt-clause-focus { margin: 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.dt-footer { display: flex; justify-content: flex-end; gap: 8px; }
.tabular { font-variant-numeric: tabular-nums; }
</style>
