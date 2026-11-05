<script setup lang="ts">
/**
 * 规则详情子页面（2026-10-30 用户裁决，替代原一级菜单「条款判定」页）：
 * - 顶部吸顶操作条：面包屑「规则列表 / 规则详情」（编号与状态在基本信息区块呈现）；
 * - 基本信息：概要条式面板（版式同问卷概要）——标题行挂状态标签，分隔线下「标签：值」
 *   流式排布（规则编号 / 名称 / 标准库 / 问题库 / 安全需求 / 规则说明 / 题目数 / 创建人 /
 *   创建时间 / 更新人 / 最近更新时间 / 是否启用）；
 * - 条款触发规则表：自「条款判定」页整体迁入 —— 以「条款」为单位呈现判定口径（触发表达式、
 *   表达式涉及的问题、安全需求条目数、填写分区与字段位），下钻可看条款原文、问题档案与条目全文；
 *   筛选保留 关键词（命中条款号/主题/条文/触发式题号/需求全文）/ 章节（条款）/ 填写分区；
 *   「判定规则」选择器不再需要 —— 数据源由路由参数 :versionId 固化（无效时回退最近已发布）。
 *
 * 数据源：条款清单恒为 GB 44464 的 38 条，版本只覆盖触发表达式与参与题目，不增删条款。
 *
 * 版式（DESIGN.md · Section list and child-route composition）：
 * - 区块 1 = 基本信息，区块 2 = 条款触发规则表（筛选条件 + 8 章分组带列表）；
 *   条款行点击开只读详情抽屉（与原条款判定页一致）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { TableColumnData } from '@arco-design/web-vue';
import { IconClose, IconLeft, IconRefresh, IconSearch } from '@arco-design/web-vue/es/icon';
import { useI18n } from 'vue-i18n';
import { materials } from '../../dictionary/data/library';
import {
  ruleSet, triggerExplanation, triggerLeaves,
  type Clause, type ExplanationLocale, type Question,
} from '../data/rules';
import { standardNode } from '../data/standardLibrary';
import { CLAUSE_SECTION_ORDER, clauseSection } from '../data/clauseSections';
import { clauseGroupTitle, type ClauseGroupKey } from '../../surveys/data/matching';
import { QUESTION_BANK } from '../../surveys/data/questions';
import { getRuleVersion, listRuleVersions, type RuleVersion } from '../data/ruleVersions';
import type { SectionKey } from '../../sections/data/sectionCatalog';

type Selection = { kind: 'question'; no: string } | { kind: 'clause'; code: string } | { kind: 'item'; code: string; index: number };
type ClauseRow = { kind: 'group'; key: string; code: string; name: string; count: number; itemCount: number }
  | ({ kind: 'clause'; key: string } & Clause);

const { t, locale } = useI18n();
const route = useRoute();

const detailId = computed(() => String(route.params.versionId ?? ''));
/** 最近已发布的版本（updatedAt 倒序取第一份；路由 id 无效时兜底） */
function latestPublishedRuleId(): string {
  const published = listRuleVersions().filter((version) => version.status === 'published');
  const latest = [...published].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return latest?.id ?? '';
}
const activeRuleVersion = computed<RuleVersion | null>(() => getRuleVersion(detailId.value) ?? getRuleVersion(latestPublishedRuleId()));
const missing = computed(() => !activeRuleVersion.value);

/* ------------------------------------------------------------------ 基本信息（只读） */

const basicRows = computed(() => {
  const version = activeRuleVersion.value;
  if (!version) return [];
  return [
    { label: t('compliance.versions.fields.ruleNo'), value: version.ruleNo || version.id, tabular: true },
    { label: t('compliance.versions.fields.name'), value: version.name },
    { label: t('compliance.versions.fields.standardSource'), value: version.standardSource || '—' },
    { label: t('compliance.versions.fields.questionSource'), value: version.questionSource || '—' },
    { label: t('compliance.versions.fields.safetyRequirement'), value: version.safetyRequirement || '—' },
    { label: t('compliance.versions.fields.note'), value: version.note || '—' },
    { label: t('compliance.versions.fields.questionCount'), value: String(version.questionSet.length), tabular: true },
    { label: t('compliance.versions.fields.creator'), value: version.createdBy || '—' },
    { label: t('compliance.versions.fields.createdAt'), value: version.createdAt, tabular: true },
    { label: t('compliance.versions.fields.updater'), value: version.updatedBy || '—' },
    { label: t('compliance.versions.fields.updatedAt'), value: version.updatedAt, tabular: true },
    { label: t('compliance.versions.fields.enabled'), value: version.enabled ? t('compliance.versions.filters.enabledYes') : t('compliance.versions.filters.enabledNo') },
  ];
});

/* ------------------------------------------------------------------ 抽屉内层级栈：条款 → 条目/题目；栈顶为当前展示对象 */

const drawerStack = ref<Selection[]>([]);
const drawerOpen = ref(false);
const triggerElement = ref<HTMLElement | null>(null);

const explainLocale = computed<ExplanationLocale>(() => (locale.value === 'en-US' ? 'en' : 'zh'));

/** 版本表达式（题号书写）→ 展示触发式（Qn="是"） */
function displayTrigger(exprCode: string): string {
  return exprCode.replace(/Q\d+/g, (code) => `${code}="是"`);
}
/** 所选版本参与判定的题目（题号），触发解释与涉及问题徽标以此为界 */
const questionSet = computed(() => new Set(activeRuleVersion.value?.questionSet ?? []));
/** 当前版本的 38 条款：静态字段取现行规则集（版本不增删条款），触发式按版本覆盖；
 *  测试方法（2026-11-02）优先读规则保存时的映射快照（testMethodMappings），无快照回落静态默认 */
const versionClauses = computed<Clause[]>(() => {
  const version = activeRuleVersion.value;
  if (!version) return ruleSet.clauses;
  return ruleSet.clauses.map((clause) => {
    const override = version.expressions[clause.code];
    const methodSnapshot = version.testMethods?.[clause.code];
    const next = { ...clause, testMethod: methodSnapshot || clause.testMethod };
    if (!override?.expr) return next;
    return { ...next, trigger: displayTrigger(override.expr) };
  });
});
/** 题目档案：现行规则集 12 题 + 追加判定维度 Q13–Q18（题库题干，法规依据取 guide.basis） */
const questionByNo = computed(() => {
  const map = new Map(ruleSet.questions.map((entry) => [entry.no, entry]));
  for (const question of QUESTION_BANK) {
    if (!map.has(question.code)) map.set(question.code, { no: question.code, text: question.title, guide: question.guide.basis });
  }
  return map;
});

/* ------------------------------------------------------------------ 筛选（draft → applied 两层） */
const keywordDraft = ref('');
const chapterDraft = ref<string[]>([]);
const sectionDraft = ref<SectionKey[]>([]);
const keywordApplied = ref('');
const chapterApplied = ref<string[]>([]);
const sectionApplied = ref<SectionKey[]>([]);

function applyFilters() {
  keywordApplied.value = keywordDraft.value.trim();
  chapterApplied.value = [...chapterDraft.value];
  sectionApplied.value = [...sectionDraft.value];
}
function resetFilters() {
  keywordDraft.value = '';
  chapterDraft.value = [];
  sectionDraft.value = [];
  applyFilters();
}
/** 分区多选折叠：Arco 清除时 modelValue 为 undefined，统一归一到数组 */
const sectionModel = computed<SectionKey[]>({
  get: () => sectionDraft.value,
  set: (value: SectionKey[] | undefined) => { sectionDraft.value = Array.isArray(value) ? value : []; },
});
const chapterModel = computed<string[]>({
  get: () => chapterDraft.value,
  set: (value: string[] | undefined) => { chapterDraft.value = Array.isArray(value) ? value : []; },
});

const query = computed(() => keywordApplied.value.toLocaleLowerCase());
function chapterOf(code: string) { return code.split('.').slice(0, 2).join('.'); }
function matchesSection(code: string): boolean {
  if (!sectionApplied.value.length) return true;
  const ref = clauseSection(code);
  return Boolean(ref && sectionApplied.value.includes(ref.section));
}
const filteredClauses = computed(() => versionClauses.value.filter((row) => {
  if (chapterApplied.value.length && !chapterApplied.value.includes(chapterOf(row.code))) return false;
  if (!matchesSection(row.code)) return false;
  // 关键词同时命中安全需求条目全文（条目明细经「安全需求条数」弹窗查看）
  return `${row.code} ${row.topic} ${row.chapter6} ${row.trigger} ${row.requirements.join(' ')}`.toLocaleLowerCase().includes(query.value);
}));

/* ------------------------------------------------------------------ 填写分区标签 */
const sectionOptions = computed(() => CLAUSE_SECTION_ORDER.map((key) => ({ value: key, label: t(`surveys.workspace.stepSections.sections.${key}`) })));
function sectionLabel(code: string): string {
  const ref = clauseSection(code);
  return ref ? t(`surveys.workspace.stepSections.sections.${ref.section}`) : '—';
}
function sectionField(code: string): string {
  return clauseSection(code)?.field ?? '—';
}

/* ------------------------------------------------------------------ 条款表：8 章分组行 */
const CHAPTER_GROUPS = ['6.1', '6.2', '6.3', '6.4', '6.5', '6.6', '6.7', '6.8'];
function groupLabel(code: string) { return clauseGroupTitle(code as ClauseGroupKey); }
const clauseRows = computed<ClauseRow[]>(() => CHAPTER_GROUPS.flatMap((code) => {
  const group = filteredClauses.value.filter((row) => chapterOf(row.code) === code);
  if (!group.length) return [];
  return [
    { kind: 'group', key: `group-${code}`, code, name: groupLabel(code), count: group.length, itemCount: group.reduce((sum, row) => sum + row.requirements.length, 0) },
    ...group.map((clause): ClauseRow => ({ kind: 'clause', key: clause.code, ...clause })),
  ];
}));
/** 分组行（章节带）不可点，视觉上也不给可点的悬停反馈 */
function rowClass(record: unknown): string {
  return (record as ClauseRow)?.kind === 'group' ? 'rule-group-row' : '';
}

const hasApplied = computed(() => Boolean(query.value || chapterApplied.value.length || sectionApplied.value.length));

const columns = computed<TableColumnData[]>(() => [
  { title: t('compliance.number'), dataIndex: 'code', slotName: 'code', width: 108, align: 'left' },
  { title: t('compliance.topic'), dataIndex: 'topic', width: 128, align: 'left', ellipsis: true, tooltip: true },
  { title: t('compliance.expression'), slotName: 'trigger', width: 220, align: 'left' },
  { title: t('compliance.questionsInvolved'), slotName: 'involved', width: 128, align: 'left' },
  { title: t('compliance.testRef'), dataIndex: 'chapter9', width: 96, align: 'left' },
  { title: t('compliance.testMethod'), dataIndex: 'testMethod', width: 200, align: 'left', ellipsis: true, tooltip: true },
  { title: t('compliance.reqCount'), slotName: 'reqCount', width: 108, align: 'left' },
  { title: t('compliance.section'), dataIndex: 'section', slotName: 'section', width: 116, align: 'left' },
  { title: t('compliance.action'), slotName: 'action', width: 80, align: 'left', fixed: 'right' },
]);

function clauseSpan({ record, columnIndex }: { record: unknown; columnIndex: number }) {
  const row = record as ClauseRow;
  if (row?.kind !== 'group') return { rowspan: 1, colspan: 1 };
  return columnIndex === 0 ? { rowspan: 1, colspan: 9 } : { rowspan: 1, colspan: 0 };
}

/* ------------------------------------------------------------------ 条目清单弹窗 */
const itemsModalClause = ref<Clause | null>(null);
function openItemsModal(clause: Clause) { itemsModalClause.value = clause; }
function closeItemsModal() { itemsModalClause.value = null; }
/** 弹窗内点条目 → 关弹窗，打开条目详情抽屉（复用既有下钻） */
function openItemFromModal(index: number) {
  const clause = itemsModalClause.value;
  if (!clause) return;
  closeItemsModal();
  openDetail({ kind: 'item', code: clause.code, index });
}

function titleFor(selection: Selection): string {
  return selection.kind === 'question' ? selection.no : selection.kind === 'item' ? `${selection.code}-${selection.index + 1}` : selection.code;
}

/* ------------------------------------------------------------------ 只读详情抽屉（下钻） */
const current = computed<Selection | null>(() => drawerStack.value[drawerStack.value.length - 1] ?? null);
const currentClause = computed<Clause | null>(() => {
  const selection = current.value;
  if (!selection || selection.kind === 'question') return null;
  return versionClauses.value.find((entry) => entry.code === selection.code) ?? null;
});
const currentQuestion = computed<Question | null>(() => {
  const selection = current.value;
  return selection?.kind === 'question' ? questionByNo.value.get(selection.no) ?? null : null;
});
const currentLeaves = computed(() => (currentClause.value ? triggerLeaves(currentClause.value.trigger, questionSet.value) : []));
const currentExplanation = computed(() => (currentClause.value ? triggerExplanation(currentClause.value.trigger, questionSet.value, explainLocale.value) : ''));
const currentChapter9Text = computed(() => (currentClause.value ? standardNode(currentClause.value.chapter9)?.text ?? '' : ''));
const referencingClauses = computed<Clause[]>(() => {
  const selection = current.value;
  if (!selection || selection.kind !== 'question') return [];
  return versionClauses.value.filter((clause) => triggerLeaves(clause.trigger, questionSet.value).includes(selection.no));
});
const relatedMaterials = computed(() => {
  const selection = current.value;
  return selection && selection.kind === 'clause'
    ? materials.filter((item) => item.clauses.includes(selection.code))
    : [];
});
const drawerTitle = computed(() => {
  const selection = current.value;
  if (!selection) return '';
  const kindLabel = t(selection.kind === 'question' ? 'compliance.question' : selection.kind === 'item' ? 'compliance.item' : 'compliance.clause');
  return `${titleFor(selection)} · ${kindLabel}`;
});

function beginDetail(selection: Selection) {
  triggerElement.value = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  drawerStack.value = [selection];
  drawerOpen.value = true;
}
/** 列表点行 → 只读详情抽屉（点遮罩即可关闭） */
function openDetail(selection: Selection) {
  beginDetail(selection);
}
function onRowClick(record: unknown) {
  const row = record as ClauseRow;
  if (!row || row.kind === 'group') return;
  openDetail({ kind: 'clause', code: row.code });
}
/** 详情抽屉内下钻：条款 → 条目 / 题目，题目 → 条款 */
function drillTo(selection: Selection) {
  drawerStack.value = [...drawerStack.value, selection];
}
function popDetail() {
  if (drawerStack.value.length > 1) drawerStack.value = drawerStack.value.slice(0, -1);
}
function restoreFocus() {
  nextTick(() => triggerElement.value?.focus());
}
/** 只读抽屉：点遮罩或按 Esc 关闭（DESIGN.md · Drawer 关闭与动效） */
function closeDrawer() {
  drawerOpen.value = false;
  restoreFocus();
}
function focusDrawer() {
  void nextTick(() => {
    const drawer = document.querySelector('.rule-drawer');
    (drawer?.querySelector<HTMLButtonElement>('.arco-drawer-body button')
      ?? drawer?.querySelector<HTMLButtonElement>('.arco-drawer-footer button'))?.focus();
  });
}

/* ------------------------------------------------------------------ 吸顶操作条（与 RuleVersionConfigPage 同构） */
const barRoot = ref<HTMLElement | null>(null);
const stuck = ref(false);
const STICKY_TOP = 56;
let raf = 0;
function scheduleStuck() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const el = barRoot.value;
    if (!el) return;
    stuck.value = el.getBoundingClientRect().top <= STICKY_TOP + 0.5;
  });
}
onMounted(() => {
  scheduleStuck();
  window.addEventListener('scroll', scheduleStuck, { passive: true });
  window.addEventListener('resize', scheduleStuck);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  window.removeEventListener('scroll', scheduleStuck);
  window.removeEventListener('resize', scheduleStuck);
});

/** 深链：?clause=<条款号>（来自数据材料、标准条款等跨页跳转）直接命中该条款并开抽屉 */
watch(() => route.query.clause, (code) => {
  if (typeof code !== 'string' || !versionClauses.value.some((entry) => entry.code === code)) return;
  keywordDraft.value = code;
  keywordApplied.value = code;
  openDetail({ kind: 'clause', code });
}, { immediate: true });
</script>

<template>
  <div class="rule-page">
    <!-- 顶部吸顶操作条：左面包屑（点击返回规则列表）；编号与状态在基本信息区块呈现 -->
    <header ref="barRoot" class="rule-panel cfg-bar" :class="{ 'is-stuck': stuck }">
      <nav class="cfg-crumbs" :aria-label="t('compliance.versions.config.breadcrumb')">
        <router-link class="cfg-crumb-link" :to="{ name: 'rule-versions' }">{{ t('compliance.versions.config.parentCrumb') }}</router-link>
        <span class="cfg-crumb-sep" aria-hidden="true">/</span>
        <span class="cfg-crumb-current" aria-current="page">{{ t('compliance.versions.detail.title') }}</span>
      </nav>
    </header>

    <div v-if="missing" class="rule-panel cfg-missing">
      <a-empty :description="t('compliance.versions.config.missing')" />
    </div>

    <template v-else>
      <!-- 区块 1：基本信息（概要条：标题 + 状态标签，分隔线下「标签：值」流式排布，版式同问卷概要） -->
      <section class="rule-panel detail-basic" :aria-label="t('compliance.versions.basicInfo')">
        <div class="detail-card-head">
          <h2 class="rule-list-title">{{ t('compliance.versions.basicInfo') }}</h2>
          <a-tag v-if="activeRuleVersion" :color="activeRuleVersion.status === 'published' ? 'green' : 'gray'" size="small">
            {{ t(`compliance.versions.status.${activeRuleVersion.status}`) }}
          </a-tag>
        </div>
        <dl class="detail-facts">
          <div v-for="row in basicRows" :key="row.label" class="detail-fact">
            <dt>{{ row.label }}{{ t('versionPage.fieldSeparator') }}</dt>
            <dd :class="{ tabular: row.tabular }">{{ row.value }}</dd>
          </div>
        </dl>
      </section>

      <!-- 区块 2：条款触发规则表（自「条款判定」页迁入） -->
      <section class="rule-panel rule-list" role="region" :aria-label="t('compliance.versions.detail.clauseTableTitle')">
        <div class="rule-list-head">
          <h2 class="rule-list-title">{{ t('compliance.versions.detail.clauseTableTitle') }}</h2>
          <span class="rule-list-count">{{ t('compliance.listCountClauses', { count: filteredClauses.length }) }}</span>
        </div>

        <!-- 筛选条件：关键词（条款/问题/需求全文）+ 章节（条款）+ 填写分区 -->
        <form class="rule-filters" @submit.prevent="applyFilters">
          <div class="rule-filter-field">
            <label for="rule-filter-keyword">{{ t('compliance.filters.keyword') }}</label>
            <a-input id="rule-filter-keyword" v-model="keywordDraft" class="app-filter-control" allow-clear :placeholder="t('compliance.filters.keywordPlaceholder')" />
          </div>
          <div class="rule-filter-field">
            <label for="rule-filter-chapter">{{ t('compliance.filters.chapter') }}</label>
            <a-select id="rule-filter-chapter" v-model="chapterModel" class="app-filter-control chapter-select" multiple allow-clear :max-tag-count="1"
              :placeholder="t('compliance.filters.chapterAll')" :aria-label="t('compliance.filters.chapter')">
              <a-option v-for="code in CHAPTER_GROUPS" :key="code" :value="code">{{ code }} {{ groupLabel(code) }}</a-option>
            </a-select>
          </div>
          <div class="rule-filter-field">
            <label for="rule-filter-section">{{ t('compliance.filters.section') }}</label>
            <a-select id="rule-filter-section" v-model="sectionModel" class="app-filter-control section-select" multiple allow-clear :max-tag-count="1"
              :placeholder="t('compliance.filters.sectionAll')" :aria-label="t('compliance.filters.section')" :options="sectionOptions" />
          </div>
          <div class="rule-filter-actions">
            <a-button type="primary" html-type="submit"><template #icon><IconSearch /></template>{{ t('compliance.filters.search') }}</a-button>
            <a-button class="app-btn-neutral" @click="resetFilters"><template #icon><IconRefresh /></template>{{ t('compliance.filters.reset') }}</a-button>
          </div>
        </form>

        <a-table class="rule-table" :columns="columns" :data="clauseRows" row-key="key" :pagination="false"
          :bordered="false" :stripe="false" :span-method="clauseSpan" :row-class="rowClass" :scroll="{ x: 1184 }" @row-click="onRowClick">
          <template #empty><a-empty :description="t(hasApplied ? 'compliance.noMatch' : 'compliance.noData')" /></template>
          <template #code="{ record }">
            <div v-if="record.kind === 'group'" class="group-cell">
              <span class="group-rule" aria-hidden="true"></span>
              <span class="group-code">{{ record.code }}</span>
              <span class="group-name">{{ record.name }}</span>
              <span class="group-meta">{{ t('compliance.groupCount', { count: record.count }) }} · {{ t('compliance.itemCountUnit', { count: record.itemCount }) }}</span>
            </div>
            <button v-else type="button" class="rule-name-link" @click.stop="openDetail({ kind: 'clause', code: record.code })">{{ record.code }}</button>
          </template>
          <template #section="{ record }">
            <span v-if="record.kind === 'clause'" class="section-cell">{{ sectionLabel(record.code) }}</span>
          </template>
          <template #trigger="{ record }">
            <div v-if="record.kind === 'clause'" class="trigger-cell">
              <span class="trigger-expr">{{ record.trigger }}</span>
              <span class="trigger-explain">{{ triggerExplanation(record.trigger, questionSet, explainLocale) }}</span>
            </div>
          </template>
          <template #involved="{ record }">
            <div v-if="record.kind === 'clause'" class="involved-cell">
              <button v-for="no in triggerLeaves(record.trigger, questionSet)" :key="no" type="button" class="involved-badge"
                @click.stop="openDetail({ kind: 'question', no })">{{ no }}</button>
            </div>
          </template>
          <template #reqCount="{ record }">
            <button v-if="record.kind === 'clause'" type="button" class="req-count-link"
              :aria-label="t('compliance.reqCountHint', { count: record.requirements.length })"
              @click.stop="openItemsModal(record)">{{ record.requirements.length }}</button>
          </template>
          <template #action="{ record }">
            <div v-if="record.kind === 'clause'" class="rule-row-actions">
              <a-button type="text" size="mini" @click.stop="openDetail({ kind: 'clause', code: record.code })">{{ t('compliance.detail') }}</a-button>
            </div>
          </template>
        </a-table>
      </section>
    </template>

    <!-- 只读详情抽屉：灰画布 + 白色分组卡片 -->
    <a-drawer class="ledger-drawer rule-drawer" :visible="drawerOpen" width="min(800px, 100vw)"
      :mask-closable="true" :closable="false" esc-to-close @open="focusDrawer" @close="restoreFocus" @cancel="closeDrawer">
      <template #header>
        <div class="drawer-title">
          <a-button v-if="drawerStack.length > 1" type="text" size="mini" class="drawer-back" :aria-label="t('compliance.back')" :title="t('compliance.back')" @click="popDetail">
            <template #icon><IconLeft /></template>
          </a-button>
          <span class="drawer-heading">{{ drawerTitle }}</span>
          <a-button type="text" size="mini" class="drawer-close" :aria-label="t('compliance.close')" :title="t('compliance.close')" @click="closeDrawer">
            <template #icon><IconClose /></template>
          </a-button>
        </div>
      </template>
      <template #footer>
        <div class="drawer-actions">
          <a-button class="app-btn-neutral" @click="closeDrawer">{{ t('compliance.close') }}</a-button>
        </div>
      </template>

      <template v-if="current">
        <!-- 条款详情：基本信息 / 涉及问题 / 第 6 章原文 / 测试方法与第 9 章原文 / 安全需求条目 / 关联材料 -->
        <template v-if="current.kind === 'clause' && currentClause">
          <div class="rule-drawer-group">
            <h2 class="rule-section-heading">{{ t('compliance.clauseInfo') }}</h2>
            <div class="app-detail-list">
              <div class="app-detail-row"><span class="app-detail-label">{{ t('compliance.number') }}</span><span class="app-detail-value">{{ currentClause.code }}</span></div>
              <div class="app-detail-row"><span class="app-detail-label">{{ t('compliance.topic') }}</span><span class="app-detail-value">{{ currentClause.topic }}</span></div>
              <div class="app-detail-row">
                <span class="app-detail-label">{{ t('compliance.section') }}</span>
                <span class="app-detail-value">{{ sectionLabel(currentClause.code) }}<span class="value-meta">{{ t('compliance.sectionField', { field: sectionField(currentClause.code) }) }}</span></span>
              </div>
              <div class="app-detail-row"><span class="app-detail-label">{{ t('compliance.expression') }}</span><span class="app-detail-value">{{ currentClause.trigger }}</span></div>
              <div class="app-detail-row"><span class="app-detail-label">{{ t('compliance.triggerExplanation') }}</span><span class="app-detail-value">{{ currentExplanation }}</span></div>
              <div class="app-detail-row"><span class="app-detail-label">{{ t('compliance.reqCount') }}</span><span class="app-detail-value">{{ currentClause.requirements.length }}</span></div>
            </div>
          </div>
          <div class="rule-drawer-group">
            <h2 class="rule-section-heading">{{ t('compliance.questionsInvolved') }}<span class="heading-count">{{ currentLeaves.length }}</span></h2>
            <div class="pill-group">
              <button v-for="no in currentLeaves" :key="no" type="button" class="pill-button" @click="drillTo({ kind: 'question', no })">{{ no }}</button>
            </div>
          </div>
          <div class="rule-drawer-group">
            <h2 class="rule-section-heading">{{ t('compliance.sourceClause') }}</h2>
            <div class="quote-block">{{ currentClause.chapter6 }}</div>
          </div>
          <div class="rule-drawer-group">
            <h2 class="rule-section-heading">{{ t('compliance.testMethod') }}<span class="heading-count">{{ currentClause.chapter9 }}</span></h2>
            <div class="app-detail-list">
              <div class="app-detail-row"><span class="app-detail-label">{{ t('compliance.testMethod') }}</span><span class="app-detail-value">{{ currentClause.testMethod }}</span></div>
            </div>
            <template v-if="currentChapter9Text">
              <p class="group-note">{{ t('compliance.standardChapter9') }}</p>
              <div class="quote-block">{{ currentChapter9Text }}</div>
            </template>
          </div>
          <div class="rule-drawer-group">
            <h2 class="rule-section-heading">{{ t('compliance.requirementsList') }}<span class="heading-count">{{ currentClause.requirements.length }}</span></h2>
            <p class="group-note">{{ t('compliance.singleJudgement') }}</p>
            <div class="requirement-list">
              <button v-for="(text, index) in currentClause.requirements" :key="index" type="button" class="requirement-row"
                @click="drillTo({ kind: 'item', code: currentClause.code, index })">
                <span class="requirement-no">{{ currentClause.code }}-{{ index + 1 }}</span>
                <span class="requirement-text">{{ text }}</span>
              </button>
            </div>
          </div>
          <div class="rule-drawer-group">
            <h2 class="rule-section-heading">{{ t('library.relatedMaterials') }}</h2>
            <div class="material-links">
              <router-link v-for="item in relatedMaterials" :key="item.id" :to="{ path: '/data-materials/materials', query: { clause: currentClause.code } }">{{ item.name }}</router-link>
              <span v-if="!relatedMaterials.length">{{ t('library.noRelatedMaterials') }}</span>
              <router-link :to="{ path: '/data-materials/materials', query: { clause: currentClause.code } }">{{ t('library.viewMaterials') }}</router-link>
            </div>
          </div>
        </template>

        <!-- 条目详情：所属条款 / 编号 / 填写分区 / 条目全文 -->
        <template v-else-if="current.kind === 'item' && currentClause">
          <div class="rule-drawer-group">
            <h2 class="rule-section-heading">{{ t('compliance.item') }}</h2>
            <div class="app-detail-list">
              <div class="app-detail-row">
                <span class="app-detail-label">{{ t('compliance.belongingClause') }}</span>
                <span class="app-detail-value"><button type="button" class="rule-name-link" @click="drillTo({ kind: 'clause', code: currentClause.code })">{{ currentClause.code }} {{ currentClause.topic }}</button></span>
              </div>
              <div class="app-detail-row"><span class="app-detail-label">{{ t('compliance.number') }}</span><span class="app-detail-value">{{ current.code }}-{{ current.index + 1 }}</span></div>
              <div class="app-detail-row">
                <span class="app-detail-label">{{ t('compliance.section') }}</span>
                <span class="app-detail-value">{{ sectionLabel(current.code) }}<span class="value-meta">{{ t('compliance.sectionField', { field: sectionField(current.code) }) }}</span></span>
              </div>
            </div>
            <div class="quote-block">{{ currentClause.requirements[current.index] }}</div>
            <a-button class="app-btn-neutral" @click="drillTo({ kind: 'clause', code: currentClause.code })">{{ t('compliance.viewInClause') }}</a-button>
          </div>
        </template>

        <!-- 题目详情：题号 + 题干 + 判断指引 + 引用该题的条款 -->
        <template v-else-if="current.kind === 'question' && currentQuestion">
          <div class="rule-drawer-group">
            <h2 class="rule-section-heading">{{ t('compliance.question') }}</h2>
            <div class="app-detail-list">
              <div class="app-detail-row"><span class="app-detail-label">{{ t('compliance.number') }}</span><span class="app-detail-value">{{ currentQuestion.no }}</span></div>
              <div class="app-detail-row"><span class="app-detail-label">{{ t('compliance.question') }}</span><span class="app-detail-value">{{ currentQuestion.text }}</span></div>
              <div class="app-detail-row"><span class="app-detail-label">{{ t('compliance.guide') }}</span><span class="app-detail-value">{{ currentQuestion.guide }}</span></div>
            </div>
          </div>
          <div class="rule-drawer-group">
            <h2 class="rule-section-heading">{{ t('compliance.referencingClauses') }}<span class="heading-count">{{ referencingClauses.length }}</span></h2>
            <div class="pill-group">
              <button v-for="clause in referencingClauses" :key="clause.code" type="button" class="pill-button"
                @click="drillTo({ kind: 'clause', code: clause.code })">{{ clause.code }} {{ clause.topic }}</button>
              <span v-if="!referencingClauses.length" class="group-note">—</span>
            </div>
          </div>
        </template>
      </template>
    </a-drawer>

    <!-- 条目清单弹窗：条款行「安全需求条数」点击展开，行点击下钻条目详情抽屉 -->
    <a-modal class="items-modal" :visible="Boolean(itemsModalClause)" :width="640" unmount-on-close esc-to-close
      :title="t('compliance.itemsModalTitle', { code: itemsModalClause?.code ?? '' })" @cancel="closeItemsModal">
      <p class="items-modal-hint">{{ t('compliance.itemsModalHint') }}</p>
      <div class="items-modal-list" role="list">
        <button v-for="(text, index) in itemsModalClause?.requirements ?? []" :key="index" type="button" class="items-modal-row" role="listitem"
          @click="openItemFromModal(index)">
          <span class="items-modal-no">{{ itemsModalClause?.code }}-{{ index + 1 }}</span>
          <span class="items-modal-text">{{ text }}</span>
        </button>
      </div>
      <template #footer>
        <div class="items-modal-footer">
          <a-button class="app-btn-neutral" @click="closeItemsModal">{{ t('compliance.versions.close') }}</a-button>
        </div>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
/* 页面骨架：Fill-1 画布上的白色面板列（与规则列表/配置页同构，16px 纵向间距） */
.rule-page { display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: calc(100dvh - 88px); font-size: 14px; color: var(--color-text-1); }
.rule-panel { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.rule-list { flex: 1; display: flex; flex-direction: column; }

/* 顶部吸顶操作条（与 RuleVersionConfigPage 同构）：左面包屑 + 规则元信息 */
.cfg-bar { position: sticky; top: 56px; z-index: 5; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 16px; padding: 12px 16px; transition: box-shadow 160ms ease; }
.cfg-bar.is-stuck { box-shadow: var(--app-shadow-4); }
.cfg-crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; font-size: 14px; line-height: 22px; }
.cfg-crumb-link { color: var(--color-text-2); text-decoration: none; }
.cfg-crumb-link:hover, .cfg-crumb-link:focus-visible { color: var(--app-accent); }
.cfg-crumb-link:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.cfg-crumb-sep { color: var(--color-text-3); }
.cfg-crumb-current { color: var(--color-text-1); font-weight: 600; }
.cfg-crumb-meta { color: var(--color-text-3); font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums; }
.cfg-missing { padding: 32px 16px; }
.tabular { font-variant-numeric: tabular-nums; }

/* 基本信息：概要条（版式同问卷概要 SurveyDetailPage .detail-card/.detail-facts）
   —— 标题 + 状态 tag 一行（12px 分隔线），下方「标签：值」流式排布：行距 10px / 列距 24px，
   标签 Text-3 灰（全角冒号随 i18n fieldSeparator）、值 Text-1 400 不加粗 */
.detail-basic { display: flex; flex-direction: column; }
.detail-card-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--app-divider); }
.detail-facts { display: flex; flex-wrap: wrap; gap: 10px 24px; margin: 12px 0 0; }
.detail-fact { display: flex; align-items: baseline; min-width: 0; line-height: 22px; }
.detail-fact dt { flex: none; color: var(--color-text-3); font-weight: 400; }
.detail-fact dd { margin: 0; color: var(--color-text-1); font-weight: 400; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 筛选栅栏：标签右对齐 + 200px 控件单元；查询/重置组紧随最后一个条件 */
.rule-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; min-width: 0; margin-bottom: 16px; }
.rule-filter-field { display: inline-grid; grid-template-columns: max-content minmax(0, 200px); gap: 8px; align-items: center; min-width: 0; }
.rule-filter-field label { color: var(--color-text-2); text-align: right; line-height: 22px; white-space: nowrap; }
.rule-filter-field :deep(.app-filter-control) { width: 200px; max-width: 100%; min-width: 0; }
.rule-filter-actions { display: flex; align-items: center; gap: 8px; }
/* 多选折叠：单行不换行（复用标准条款页模式） */
.chapter-select :deep(.arco-select-view-inner), .section-select :deep(.arco-select-view-inner) { display: flex; flex-wrap: nowrap; height: 30px; overflow: hidden; }
.chapter-select :deep(.arco-select-view-tag), .section-select :deep(.arco-select-view-tag) { flex: 0 1 auto; min-width: 0; }
.chapter-select :deep(.arco-select-view-tag:not(:has(.arco-tag-close-btn))), .section-select :deep(.arco-select-view-tag:not(:has(.arco-tag-close-btn))) { flex: 0 0 auto; }

/* 列表头：标题 16/600/24 + 条数贴标题右侧（baseline 对齐），底部一条分隔线 */
.rule-list-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--app-divider); }
.rule-list-title { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.rule-list-count { color: var(--color-text-3); font-size: 14px; line-height: 22px; font-variant-numeric: tabular-nums; }

/* 表格：白底、无外框、无斑马纹、行分隔线；表头全局 Fill-2 + 600 字重 */
.rule-table { min-width: 0; }
.rule-table :deep(.arco-table-th) { font-weight: 600; }
.rule-table :deep(.arco-table-td) { border-bottom: 1px solid var(--app-divider); }
.rule-table :deep(.arco-table-tr:not(.rule-group-row)) { cursor: pointer; }

/* 章节分组带：整行浅灰底，左侧主色竖条 + 章节号 + 章节名，数量右对齐 */
.rule-table :deep(.rule-group-row .arco-table-td) { padding: 0; background: var(--mt-fill-1); }
.rule-table :deep(.rule-group-row .arco-table-cell) { padding: 0; }
.rule-table :deep(.rule-group-row:hover .arco-table-td) { background: var(--mt-fill-1); }
.group-cell { display: flex; align-items: center; gap: 8px; padding: 9px 16px; }
.group-rule { flex: none; width: 3px; height: 14px; border-radius: 2px; background: var(--app-accent); }
.group-code { color: var(--app-accent); font-weight: 600; font-variant-numeric: tabular-nums; }
.group-name { font-weight: 600; }
.group-meta { margin-left: auto; color: var(--color-text-3); font-size: 12px; line-height: 20px; font-variant-numeric: tabular-nums; }

/* 首列即条款号：默认正文色，悬停与聚焦转主色 */
.rule-name-link { border: 0; padding: 0; background: transparent; color: var(--color-text-1); cursor: pointer; font: inherit; text-align: left; }
.rule-name-link:hover, .rule-name-link:focus-visible { color: var(--app-accent); }
.rule-name-link:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; border-radius: 2px; }
.section-cell { color: var(--color-text-2); }
/* 触发表达式 + 实时派生的触发解释（同列两行，保证信息密度） */
.trigger-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.trigger-expr { overflow-wrap: anywhere; }
.trigger-explain { color: var(--color-text-3); font-size: 12px; line-height: 18px; }
/* 涉及问题徽标 */
.involved-cell { display: flex; flex-wrap: wrap; gap: 4px; }
.involved-badge { height: 22px; padding: 0 8px; border: 1px solid var(--app-divider); border-radius: 2px; background: var(--app-surface); color: var(--color-text-2); font: inherit; font-size: 12px; line-height: 20px; cursor: pointer; }
.involved-badge:hover, .involved-badge:focus-visible { border-color: var(--app-accent); color: var(--app-accent); }
/* 安全需求条数：可点链接（点击弹条目清单弹窗） */
.req-count-link { padding: 0; border: 0; background: none; color: var(--app-accent); font: inherit; font-variant-numeric: tabular-nums; cursor: pointer; text-decoration: underline dotted transparent; text-underline-offset: 3px; }
.req-count-link:hover, .req-count-link:focus-visible { text-decoration-color: var(--app-accent); }
/* 操作列：表头与按钮同左缘，文字按钮去内边距 */
.rule-row-actions { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.rule-row-actions :deep(.arco-btn) { padding: 0; }

/* 条目清单弹窗：标题带条款号；行式清单 hover 反馈，行点击下钻条目详情抽屉 */
.items-modal-hint { margin: 0 0 12px; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.items-modal-list { display: flex; flex-direction: column; max-height: 420px; overflow-y: auto; border: 1px solid var(--app-divider); border-radius: 2px; }
.items-modal-row { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border: 0; border-bottom: 1px solid var(--app-divider); background: var(--app-surface); color: var(--color-text-1); font: inherit; text-align: left; cursor: pointer; }
.items-modal-row:last-child { border-bottom: 0; }
.items-modal-row:hover, .items-modal-row:focus-visible { background: var(--mt-fill-1); }
.items-modal-no { flex: none; color: var(--app-accent); font-variant-numeric: tabular-nums; line-height: 22px; }
.items-modal-text { min-width: 0; white-space: pre-wrap; word-break: break-word; font-size: 14px; line-height: 22px; }
.items-modal-footer { display: flex; justify-content: flex-end; }

/* 抽屉：表面与间距由 global.css 的 .ledger-drawer 承载；这里只补页头与内容块 */
.rule-drawer :deep(.arco-drawer-header) { padding: 0 16px; }
.rule-drawer :deep(.arco-drawer-footer) { padding: 12px 16px; }
.drawer-title { display: flex; align-items: center; gap: 8px; width: 100%; height: 56px; }
.drawer-heading { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; font-weight: 600; line-height: 24px; }
.drawer-back, .drawer-close { flex: none; }
.drawer-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; width: 100%; }

.rule-drawer-group { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.rule-section-heading { display: flex; align-items: baseline; gap: 8px; margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }
.heading-count { color: var(--color-text-3); font-size: 12px; font-weight: 400; line-height: 20px; font-variant-numeric: tabular-nums; }
.group-note { margin: 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.value-meta { margin-left: 8px; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
/* 条文/条目全文：浅底引文块，长文本保持 14/22 与换行语义 */
.quote-block { margin: 0; padding: 12px; border-radius: 2px; background: var(--mt-fill-1); color: var(--color-text-1); font-size: 14px; line-height: 22px; white-space: pre-line; overflow-wrap: anywhere; }
.pill-group { display: flex; flex-wrap: wrap; gap: 8px; }
.pill-button { height: 24px; padding: 0 8px; border: 1px solid var(--app-divider); border-radius: 2px; background: var(--app-surface); color: var(--color-text-2); font: inherit; font-size: 12px; line-height: 22px; cursor: pointer; }
.pill-button:hover, .pill-button:focus-visible { border-color: var(--app-accent); color: var(--app-accent); }
.requirement-list { display: flex; flex-direction: column; }
.requirement-row { display: flex; gap: 12px; width: 100%; padding: 8px 0; border: 0; border-bottom: 1px solid var(--app-divider); background: transparent; color: var(--color-text-1); font-size: 14px; line-height: 22px; text-align: left; cursor: pointer; }
.requirement-row:last-child { border-bottom: 0; }
.requirement-row:hover, .requirement-row:focus-visible { color: var(--app-accent); }
.requirement-no { flex: none; width: 64px; color: var(--color-text-3); font-variant-numeric: tabular-nums; }
.requirement-text { min-width: 0; overflow-wrap: anywhere; white-space: pre-line; }
.material-links { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.material-links a { color: var(--app-accent); text-decoration: none; }
.material-links a:hover, .material-links a:focus-visible { text-decoration: underline; }
.material-links span { color: var(--color-text-3); }

@media (max-width: 760px) {
  .rule-filter-field { grid-template-columns: 1fr; }
  .rule-filter-field label { text-align: left; }
  .rule-list-head { flex-wrap: wrap; }
}
</style>
