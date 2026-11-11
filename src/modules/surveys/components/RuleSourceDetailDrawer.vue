<script setup lang="ts">
/**
 * 规则来源详情抽屉（2026-10-30 用户裁决）：任务详情 · 基本信息选择规则后，
 * 规则信息区 标准库 / 问题库 / 安全需求 字段右侧【查看详情】打开的只读抽屉。
 *
 * - standard：调用天枢系统平台「标准库」条款数据明细（compliance/data/standardLibrary.ts
 *   适配层，useMock=true 回退本地演示数据），支持关键词 + 章节筛选；
 * - question：调用「问题库-问题库详情」——与问题库模块详情抽屉同数据源（templates/data/templates.ts）
 *   同版式（基本信息 + 题目清单，含判断指引与作答单选）；
 * - safety：调用天枢系统平台「安全需求」数据明细（compliance/data/safetyRequirements.ts 适配层，
 *   ITEM_CATALOG 条目目录），支持关键词筛选。
 *
 * 只读抽屉口径（DESIGN.md · Drawer）：mask 可关、底部单个「关闭」、class ledger-drawer（灰画布白头尾）。
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  sectionPathOf, standardChapters, standardDoc, standardNodes,
} from '../../compliance/data/standardLibrary';
import { ITEM_CATALOG } from '../data/items';
import { isKnownCode } from '../data/questions';
import { surveyTemplates, templateUsage, type SurveyTemplate, type TemplateStatus } from '../../templates/data/templates';

export type RuleSourceKind = 'standard' | 'question' | 'safety';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ kind: RuleSourceKind; source: string }>();
const { t } = useI18n({ useScope: 'global' });

const keyword = ref('');
const chapter = ref('');

watch([visible, () => props.kind, () => props.source], () => {
  keyword.value = '';
  chapter.value = '';
});

const title = computed(() => t(`surveys.create.sourceDetail.${props.kind}Title`));

/* ------------------------------------------------ 标准库：条款数据明细 */
const standardDocInfo = computed(() => standardDoc());
const chapterOptions = computed(() => standardChapters().map((entry) => ({ value: entry.no, label: `${entry.no} ${entry.title}` })));
const standardClauses = computed(() => {
  const kw = keyword.value.trim();
  return standardNodes().filter((node) => {
    if (chapter.value && node.chapter !== chapter.value) return false;
    if (!kw) return true;
    return node.no.includes(kw) || node.title.includes(kw) || node.text.includes(kw);
  });
});

/* ------------------------------------------------ 问题库：问题库详情（同问题库模块版式） */
/** source = '问题库编号-问题库名称'，按编号前缀回查问题库记录 */
const template = computed<SurveyTemplate | null>(() => (
  surveyTemplates.find((item) => props.source.startsWith(`${item.id}-`)) ?? null
));
const usageMap = computed(() => templateUsage());
function statusColor(status: TemplateStatus): string {
  return status === 'published' ? 'green' : 'gray';
}
/** 预览题目答案：统一单选「是 / 否 / 待定」，仅展示不可选择（与问题库详情一致） */
const answerOptions = computed(() => [
  { label: t('templates.preview.yes'), value: 'yes' },
  { label: t('templates.preview.no'), value: 'no' },
  { label: t('templates.preview.unsure'), value: 'unsure' },
]);
/** 判断指引解析：与问题库模块同口径——【…】来源/段头行独占一行，其余按录入原文逐行换行 */
const GUIDE_BULLET_RE = /^[-•·●*]\s*/;
const GUIDE_HEADER_RE = /^【[^】]*】/;
type GuideItem = { kind: 'header' | 'bullet' | 'line'; marker: string; text: string };
function guideItems(guide: string): GuideItem[] {
  const items: GuideItem[] = [];
  const pushLine = (line: string): void => {
    const bullet = GUIDE_BULLET_RE.exec(line);
    if (bullet) items.push({ kind: 'bullet', marker: '·', text: line.slice(bullet[0].length).trim() });
    else items.push({ kind: 'line', marker: '', text: line });
  };
  guide.split('\n').map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const header = GUIDE_HEADER_RE.exec(line);
    if (!header) {
      pushLine(line);
      return;
    }
    items.push({ kind: 'header', marker: '', text: header[0] });
    const rest = line.slice(header[0].length).trim();
    if (rest) pushLine(rest);
  });
  return items;
}

/* ------------------------------------------------ 安全需求：数据明细 */
const safetyItems = computed(() => {
  const kw = keyword.value.trim();
  return ITEM_CATALOG.filter((item) => item.kind === 'requirement').filter((item) => {
    if (!kw) return true;
    return item.id.includes(kw) || item.summary.includes(kw) || item.content.includes(kw);
  });
});

const shownCount = computed(() => {
  if (props.kind === 'standard') return standardClauses.value.length;
  if (props.kind === 'safety') return safetyItems.value.length;
  return template.value?.questions.length ?? 0;
});
const totalCount = computed(() => {
  if (props.kind === 'standard') return standardNodes().length;
  if (props.kind === 'safety') return ITEM_CATALOG.filter((item) => item.kind === 'requirement').length;
  return template.value?.questions.length ?? 0;
});
</script>

<template>
  <a-drawer
    v-model:visible="visible"
    class="ledger-drawer rule-source-drawer"
    width="min(800px, 100vw)"
    unmount-on-close
    mask-closable
    :title="title"
    :footer="true"
  >
    <div v-if="kind !== 'question'" class="ledger-drawer-group source-filter">
      <a-input
        v-model="keyword"
        allow-clear
        class="source-keyword"
        :placeholder="t('surveys.create.sourceDetail.searchPlaceholder')"
      />
      <a-select
        v-if="kind === 'standard'"
        v-model="chapter"
        class="source-chapter"
        :options="chapterOptions"
        allow-clear
        :placeholder="t('surveys.create.sourceDetail.chapterAll')"
      />
    </div>

    <!-- 标准库：条款数据明细（天枢标准库，编号/标题/条文原文/章节层级/页码） -->
    <template v-if="kind === 'standard'">
      <div class="ledger-drawer-group">
        <p class="source-count">{{ t('surveys.create.sourceDetail.clauseCount', { shown: shownCount, total: totalCount }) }}</p>
        <ol v-if="standardClauses.length" class="source-clause-list">
          <li v-for="node in standardClauses" :key="node.no" class="source-clause-item">
            <span class="source-clause-no tabular">{{ node.no }}</span>
            <div class="source-clause-body">
              <p class="source-clause-title">{{ node.title }}</p>
              <p class="source-clause-text">{{ node.text }}</p>
              <p class="source-clause-meta">{{ t('surveys.create.sourceDetail.clauseMeta', { path: sectionPathOf(node), page: node.page }) }}</p>
            </div>
          </li>
        </ol>
        <a-empty v-else :description="t('surveys.create.sourceDetail.searchEmpty')" />
      </div>
      <p class="source-mock-note">{{ t('standard.meta.library') }} · {{ standardDocInfo.code }} {{ standardDocInfo.title }}</p>
    </template>

    <!-- 问题库：问题库-问题库详情（基本信息 + 题目清单） -->
    <template v-else-if="kind === 'question'">
      <template v-if="template">
        <div class="ledger-drawer-group">
          <h2 class="source-section-heading">{{ t('templates.drawer.basics') }}</h2>
          <dl class="template-facts">
            <dt>{{ t('templates.fields.templateNo') }}</dt><dd class="tabular">{{ template.id }}</dd>
            <dt>{{ t('templates.fields.name') }}</dt><dd>{{ template.name }}</dd>
            <dt>{{ t('templates.fields.status') }}</dt><dd><a-tag :color="statusColor(template.status)" size="small">{{ t(`templates.statuses.${template.status}`) }}</a-tag></dd>
            <dt>{{ t('templates.fields.questionCount') }}</dt><dd class="tabular">{{ template.questions.length }}</dd>
            <dt>{{ t('templates.fields.useCount') }}</dt><dd class="tabular">
              {{ usageMap[template.id]?.total ?? 0 }}
              <span class="fact-meta">{{ t('templates.labels.usageDetail', { inProgress: usageMap[template.id]?.inProgress ?? 0 }) }}</span>
            </dd>
            <dt>{{ t('templates.fields.creator') }}</dt><dd>{{ template.creator }}</dd>
            <dt>{{ t('templates.fields.createdAt') }}</dt><dd class="tabular">{{ template.createdAt }}</dd>
            <dt>{{ t('templates.fields.updatedAt') }}</dt><dd class="tabular">{{ template.updatedAt }}</dd>
            <dt>{{ t('templates.fields.note') }}</dt><dd>{{ template.note || '—' }}</dd>
          </dl>
        </div>
        <div class="ledger-drawer-group">
          <h2 class="source-section-heading">{{ t('templates.drawer.questions') }}</h2>
          <ol class="question-preview">
            <li v-for="question in template.questions" :key="question.code" class="question-preview-item">
              <span class="question-code tabular">{{ question.code }}</span>
              <div class="question-preview-body">
                <p class="question-title">{{ question.title }}</p>
                <div v-if="!isKnownCode(question.code)" class="question-meta">
                  <a-tag size="small">{{ t('templates.preview.customQuestion') }}</a-tag>
                </div>
                <a-radio-group
                  class="question-answer-options"
                  :options="answerOptions"
                  :model-value="undefined"
                  disabled
                  :aria-label="`${question.code} ${t('templates.preview.answer')}`"
                />
                <div class="question-guide">
                  <span class="question-guide-label">{{ t('templates.preview.guide') }}</span>
                  <div v-if="question.guide" class="question-guide-text">
                    <p v-for="(item, index) in guideItems(question.guide)" :key="index" class="guide-line" :class="`guide-line--${item.kind}`">
                      <span v-if="item.marker" class="guide-marker">{{ item.marker }}</span>
                      <span class="guide-line-text" :class="{ 'guide-header-text': item.kind === 'header' }">{{ item.text }}</span>
                    </p>
                  </div>
                  <span v-else class="question-guide-text question-guide-text--empty">{{ t('templates.form.guideEmpty') }}</span>
                </div>
              </div>
            </li>
          </ol>
        </div>
      </template>
      <div v-else class="ledger-drawer-group">
        <a-empty :description="t('surveys.create.sourceDetail.noSource')" />
      </div>
    </template>

    <!-- 安全需求：数据明细（天枢安全需求条目目录，条目号/摘要/条文原文/所属条款） -->
    <template v-else>
      <div class="ledger-drawer-group">
        <p class="source-count">{{ t('surveys.create.sourceDetail.itemCount', { shown: shownCount, total: totalCount }) }}</p>
        <ol v-if="safetyItems.length" class="source-clause-list">
          <li v-for="item in safetyItems" :key="item.id" class="source-clause-item">
            <span class="source-clause-no tabular">{{ item.id }}</span>
            <div class="source-clause-body">
              <p class="source-clause-title">{{ item.summary }}</p>
              <p class="source-clause-text">{{ item.content }}</p>
              <p class="source-clause-meta">{{ t('surveys.create.sourceDetail.itemClause', { no: item.no }) }}</p>
            </div>
          </li>
        </ol>
        <a-empty v-else :description="t('surveys.create.sourceDetail.searchEmpty')" />
      </div>
    </template>

    <template #footer>
      <div class="source-drawer-footer">
        <a-button class="app-btn-neutral" @click="visible = false">{{ t('surveys.create.sourceDetail.close') }}</a-button>
      </div>
    </template>
  </a-drawer>
</template>

<style scoped>
/* 内容分组白卡（DESIGN.md · Drawer：灰画布上浮白面板；与台账/问题库抽屉的
   .ledger-drawer-group 同构——此前的定义散落在其他页面 scoped 样式里，本抽屉内不生效） */
.ledger-drawer-group { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 2px; background: var(--app-surface); }

/* 筛选行：搜索框与章节选择器同一水平行，各 300px 基准、空间不足时自适应收缩
   （a-select 根元素不带本组件 scoped 属性，须 :deep() 命中） */
.source-filter { flex-direction: row; align-items: center; gap: 12px; }
.source-keyword { flex: 0 1 300px; min-width: 0; }
.source-filter :deep(.source-chapter) { flex: 0 1 300px; min-width: 0; }

.source-count { margin: 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.source-section-heading { margin: 0; color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; }

/* 条款 / 安全需求条目清单：编号列 + 内容列 */
.source-clause-list { display: flex; flex-direction: column; gap: 12px; margin: 12px 0 0; padding: 0; list-style: none; }
.source-clause-item { display: grid; grid-template-columns: 84px minmax(0, 1fr); align-items: start; gap: 12px; padding: 12px; border: 1px solid var(--app-control-border); border-radius: 2px; background: var(--app-surface); }
.source-clause-no { color: var(--color-text-2); font-weight: 600; line-height: 22px; overflow-wrap: anywhere; }
.source-clause-body { min-width: 0; }
.source-clause-title { margin: 0; color: var(--color-text-1); line-height: 22px; }
.source-clause-text { margin: 4px 0 0; color: var(--color-text-2); font-size: 12px; line-height: 20px; overflow-wrap: anywhere; }
.source-clause-meta { margin: 6px 0 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.source-mock-note { margin: 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.source-drawer-footer { display: flex; justify-content: flex-end; gap: 8px; }

/* 问题库详情版式（与问题库模块详情抽屉同构） */
.template-facts { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 10px 16px; margin: 0; }
.template-facts dt { color: var(--color-text-2); }
.template-facts dd { margin: 0; color: var(--color-text-1); overflow-wrap: anywhere; }
.fact-meta { margin-left: 8px; color: var(--color-text-3); font-size: 12px; }
.tabular { font-variant-numeric: tabular-nums; }

.question-preview { display: flex; flex-direction: column; gap: 24px; margin: 12px 0 0; padding: 0; list-style: none; }
.question-preview-item { display: grid; grid-template-columns: 32px minmax(0, 1fr); align-items: start; padding: 12px; border: 1px solid var(--app-control-border); border-radius: 2px; }
.question-code { flex: none; color: var(--color-text-2); font-weight: 600; line-height: 22px; }
.question-preview-body { min-width: 0; }
.question-title { margin: 0; color: var(--color-text-1); line-height: 22px; }
.question-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.question-answer-options { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 12px; }
.question-answer-options :deep(.arco-radio) { margin: 0; color: var(--color-text-1); }
.question-answer-options :deep(.arco-radio-disabled .arco-radio-label) { color: var(--color-text-1); }
.question-guide { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.question-guide-label { color: var(--color-text-1); line-height: 22px; }
.question-guide-text { min-width: 0; color: var(--color-text-2); font-size: 12px; line-height: 22px; display: flex; flex-direction: column; gap: 2px; }
.guide-line { display: flex; gap: 4px; margin: 0; }
.guide-line--header { margin-top: 6px; }
.guide-line--header:first-child { margin-top: 0; }
.guide-line--bullet { padding-left: 2px; }
.guide-marker { flex: 0 0 auto; }
.guide-line-text { flex: 1; min-width: 0; }
.guide-header-text { color: var(--color-text-1); font-weight: 500; }
.question-guide-text--empty { color: var(--color-text-3); }
</style>
