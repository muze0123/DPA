<script setup lang="ts">
/**
 * 规则管理 · 数据类型（一级菜单「规则管理」二级页）。
 *
 * 口径 = 业务真值源工作簿「数据类型分析」工作表：15 个正式类型 + 定义 + 涉及条款 + 关联问题。
 * 「条款数据明细」不再单独成页：原「数据类型分析(详细)」的条款行改为列表内的
 * 「操作 · 查看明细」弹窗，按该类型的「涉及条款」关联（见 dataTypes.ts · clauseDetailRowsOf）。
 *
 * 筛选条件：判定规则（可选，决定关联问题可见性）+ 关键字；表格与下钻由 DataTypesAnalysis 渲染。
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IconRefresh, IconSearch } from '@arco-design/web-vue/es/icon';
import { useI18n } from 'vue-i18n';
import DataTypesAnalysis from '../components/DataTypesAnalysis.vue';
import { defaultRuleVersionId, publishedRuleVersions } from '../data/ruleVersions';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

/** 来自问卷工作区的联动参数：按该卷作答标注涉及情况（只读，不回写问卷） */
const surveyId = computed(() => (typeof route.query.survey === 'string' ? route.query.survey : undefined));

/* ---------------------------------------------------------------- 判定规则（关联问题的推导依据） */

const ruleVersion = ref<string | undefined>(defaultRuleVersionId());
const ruleOptions = computed(() => publishedRuleVersions());

/* ---------------------------------------------------------------- 筛选 */

const keywordDraft = ref('');
const keywordApplied = ref('');
function applyFilters() { keywordApplied.value = keywordDraft.value; }
function resetFilters() {
  keywordDraft.value = '';
  keywordApplied.value = '';
}

/** 点条款 → 跳「标准条款」页并直接打开该条抽屉（保持同一阅读上下文） */
function openClause(no: string) {
  void router.push({ path: '/rules/standard-clauses', query: { clause: no } });
}
</script>

<template>
  <div class="dt-page">
    <!-- 区块 1：筛选条件（判定规则 = 关联问题的推导依据） -->
    <section class="dt-filter-panel" :aria-label="t('standard.topRegion')">
      <form class="dt-filters" @submit.prevent="applyFilters">
        <div class="dt-filter-field">
          <label for="dt-type-rule">{{ t('standard.dataTypes.filters.rule') }}</label>
          <a-select id="dt-type-rule" v-model="ruleVersion" class="app-filter-control" allow-clear
            :placeholder="t('standard.dataTypes.filters.rulePlaceholder')">
            <a-option v-for="version in ruleOptions" :key="version.id" :value="version.id">{{ version.name }}</a-option>
          </a-select>
        </div>
        <div class="dt-filter-field">
          <label for="dt-type-keyword">{{ t('standard.dataTypes.filters.keyword') }}</label>
          <a-input id="dt-type-keyword" v-model="keywordDraft" class="app-filter-control" allow-clear
            :placeholder="t('standard.dataTypes.filters.keywordPlaceholder')" />
        </div>
        <div class="dt-filter-actions">
          <a-button type="primary" html-type="submit"><template #icon><IconSearch /></template>{{ t('standard.dataTypes.filters.search') }}</a-button>
          <a-button class="app-btn-neutral" @click="resetFilters"><template #icon><IconRefresh /></template>{{ t('standard.dataTypes.filters.reset') }}</a-button>
        </div>
      </form>
    </section>

    <!-- 区块 2：类型列表（表格、类型抽屉与条款明细弹窗由组件承载，联动参数 survey 透传） -->
    <DataTypesAnalysis
      :survey-id="surveyId" :rule-version="ruleVersion" :type-keyword="keywordApplied"
      @open-clause="openClause"
    />
  </div>
</template>

<style scoped>
/* 页面根：Fill-1 画布上的白色面板列（与列表页同一口径） */
.dt-page { display: flex; flex-direction: column; gap: 16px; min-width: 0; min-height: calc(100dvh - 88px); font-size: 14px; color: var(--color-text-1); }
.dt-filter-panel { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }

/* 筛选条：标签右对齐 + 200px 控件单元，单元内 8px、单元间 16px */
.dt-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; min-width: 0; }
.dt-filter-field { display: inline-grid; grid-template-columns: max-content minmax(0, 200px); align-items: center; gap: 8px; min-width: 0; }
.dt-filter-field label { color: var(--color-text-2); line-height: 22px; text-align: right; white-space: nowrap; }
.dt-filter-field :deep(.app-filter-control) { width: 200px; max-width: 100%; min-width: 0; }
.dt-filter-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }

@media (max-width: 700px) {
  .dt-filter-field { width: 100%; grid-template-columns: max-content minmax(0, 1fr); }
  .dt-filter-field :deep(.app-filter-control) { width: 100%; }
}
</style>
