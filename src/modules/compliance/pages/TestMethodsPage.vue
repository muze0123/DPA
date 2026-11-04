<script setup lang="ts">
/**
 * 测试方法映射维护页（2026-11-02 用户裁决：独立一级菜单「测试方法」）：
 * - 维护第 6 章条款 ↔ 第 9 章测试方法的关联关系（依据 GB 44464 标准文档，
 *   天枢平台不维护此关联）；默认映射 = 标准文档口径（testMethods.ts DEFAULT_TEST_METHOD_BY_CLAUSE）；
 * - 交互：表格行内下拉直接调整（change 即保存 + 成功提示）、单行「恢复默认」、
 *   工具栏「全部恢复默认」（420px 确认弹窗，对齐删除弹窗口径）；
 * - 生效口径：修改即时保存，对**后续新建的规则**生效（规则配置页选择标准库来源后自动回显）；
 *   已保存规则持有保存时的映射快照，不受影响。
 *
 * 版式（DESIGN.md · Table / Pagination / Rule version config composition）：
 * - 单一白面板、16px 内边距；标题 16px/600/24 + 条数（14px/22 · Text-3 · tabular）+ 说明 12px/20；
 * - 数据列表：白底、无外框、无斑马纹、行间单线分隔（--app-divider），表头 44px / --app-table-header /
 *   14px/600/22，表体 14px/400/22，悬停行 Fill-1；横向溢出留在表格区域内；
 * - 页脚：右对齐「共 N 条条款 → 每页条数（132px）→ 箭头 → 页码 → 跳至（72px）+ 总页数」，
 *   控件表面走 global.css 共享 `.app-pagination`，五档 pageSize [10,20,50,100,200]；
 * - 条款主题列（2026-11-02 用户裁决）：主题下附条款内容，默认单行尾部省略；
 *   内容超出一行时显示「查看更多」，点击展开全部，「收起」还原。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Message } from '@arco-design/web-vue';
import { IconLeft, IconRefresh, IconRight } from '@arco-design/web-vue/es/icon';
import { CLAUSES, clauseTopic } from '../../surveys/data/matching';
import { testMethodOptions } from '../data/testMethods';
import {
  resetAllTestMethodMappings, resetTestMethodMapping, saveTestMethodMapping,
  testMethodMappingRows, type TestMethodMappingRow,
} from '../data/testMethodMappings';

const { t } = useI18n();

const rows = ref<TestMethodMappingRow[]>(testMethodMappingRows());

function reload(): void {
  rows.value = testMethodMappingRows();
}

/** 测试方法候选（下拉按第 9 章段落号排序展示，引用值作 value） */
const methodOptions = testMethodOptions();

const adjustedCount = computed(() => rows.value.filter((row) => !row.isDefault).length);

/** 条款原文映射（条款主题列第二行；以标准库原文为准，缺失时回落空串） */
const CLAUSE_TEXT = new Map<string, string>(CLAUSES.map((clause) => [clause.no, clause.original]));

function clauseTextOf(no: string): string {
  return CLAUSE_TEXT.get(no) ?? '';
}

function onMethodChange(no: string, value: unknown): void {
  const next = String(value ?? '');
  try {
    saveTestMethodMapping(no, next);
  } catch {
    Message.warning(t('compliance.testMethodPage.invalid'));
    reload();
    return;
  }
  reload();
  Message.success(t('compliance.testMethodPage.saved'));
}

function resetRow(no: string): void {
  resetTestMethodMapping(no);
  reload();
  Message.success(t('compliance.testMethodPage.resetSaved'));
}

/* 全部恢复默认（420px 确认弹窗，对齐删除弹窗口径） */
const resetAllOpen = ref(false);
function requestResetAll(): void { resetAllOpen.value = true; }
function confirmResetAll(): void {
  resetAllTestMethodMappings();
  reload();
  resetAllOpen.value = false;
  Message.success(t('compliance.testMethodPage.resetSaved'));
}

/* ------------------------------------------------------------ 条款内容折叠 */
/* 默认单行尾部省略；仅当内容实际超宽（scrollWidth > clientWidth）时出现「查看更多」。
   用 nowrap + text-overflow 承载单行省略，测量口径稳定（clamp 的 scrollHeight 不可靠）。 */
const expandedClauses = reactive<Record<string, boolean>>({});
const overflowClauses = reactive<Record<string, boolean>>({});
const tableHost = ref<HTMLElement | null>(null);

function isExpanded(no: string): boolean {
  return Boolean(expandedClauses[no]);
}

/** 逐行测量是否溢出：展开中的行跳过（此时内容已换行，无横向溢出） */
function measureTopicOverflow(): void {
  const host = tableHost.value;
  if (!host) return;
  host.querySelectorAll<HTMLElement>('[data-clause-text]').forEach((node) => {
    const no = node.dataset.clauseText;
    if (!no || expandedClauses[no]) return;
    if (node.scrollWidth - node.clientWidth > 1) overflowClauses[no] = true;
  });
}

/** 渲染后测量：Arco 表格在数据变化后的下一帧才完成布局，故补一帧复测 */
function scheduleMeasure(): void {
  void nextTick(() => {
    measureTopicOverflow();
    requestAnimationFrame(() => measureTopicOverflow());
  });
}

function toggleTopic(no: string): void {
  expandedClauses[no] = !expandedClauses[no];
  scheduleMeasure();
}

/* 分页（五档契约） */
const page = ref(1);
const pageSize = ref(10);
const jumpPage = ref<number | undefined>(1);
const totalPages = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize.value)));
const pagedRows = computed(() => rows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
const pageNumbers = computed(() => Array.from({ length: totalPages.value }, (_, index) => index + 1));

function setPage(next: number): void {
  page.value = Math.min(Math.max(1, next), totalPages.value);
  jumpPage.value = page.value;
}

function handlePageSizeChange(value: unknown): void {
  pageSize.value = Number(value) || 10;
  setPage(1);
}

function goToJumpPage(): void {
  setPage(Number(jumpPage.value ?? 1));
}

/* 页面/页容量变化后重测条款内容溢出 */
watch([page, pageSize, rows], scheduleMeasure);

onMounted(() => {
  scheduleMeasure();
  window.addEventListener('resize', scheduleMeasure);
});
onBeforeUnmount(() => window.removeEventListener('resize', scheduleMeasure));
</script>

<template>
  <div class="tm-page">
    <section class="tm-panel" role="region" :aria-label="t('compliance.testMethodPage.title')">
      <div class="tm-head">
        <div class="tm-head-left">
          <h2 class="tm-title">{{ t('compliance.testMethodPage.title') }}</h2>
          <span class="tm-count">{{ t('compliance.testMethodPage.count', { count: rows.length }) }}</span>
          <span v-if="adjustedCount" class="tm-adjusted">{{ t('compliance.testMethodPage.adjustedCount', { count: adjustedCount }) }}</span>
        </div>
        <div class="tm-head-actions">
          <a-button class="app-btn-neutral" @click="requestResetAll">
            <template #icon><IconRefresh /></template>
            {{ t('compliance.testMethodPage.resetAll') }}
          </a-button>
        </div>
      </div>
      <p class="tm-note">{{ t('compliance.testMethodPage.note') }}</p>

      <div ref="tableHost" class="tm-table-host">
        <a-table class="tm-table" :data="pagedRows" row-key="no" :pagination="false" :bordered="false" :stripe="false" :scroll="{ x: 1066 }">
          <template #empty><a-empty :description="t('compliance.noData')" /></template>
          <template #columns>
            <a-table-column :title="t('compliance.testMethodPage.colClause')" data-index="no" :width="110" align="left">
              <template #cell="{ record }"><span class="tabular">{{ record.no }}</span></template>
            </a-table-column>
            <!-- 条款主题：主题 + 条款内容（单行尾部省略，溢出时「查看更多」展开 / 「收起」还原） -->
            <a-table-column :title="t('compliance.testMethodPage.colTopic')" data-index="topic" :width="300" align="left">
              <template #cell="{ record }">
                <div class="tm-topic">
                  <span class="tm-topic-name">{{ clauseTopic(record.no) }}</span>
                  <div class="tm-topic-line">
                    <p class="tm-topic-text" :class="{ 'is-open': isExpanded(record.no) }" :data-clause-text="record.no">{{ clauseTextOf(record.no) }}</p>
                    <button
                      v-if="overflowClauses[record.no] || isExpanded(record.no)"
                      type="button"
                      class="tm-topic-toggle"
                      :aria-expanded="isExpanded(record.no)"
                      :aria-label="`${record.no} ${isExpanded(record.no) ? t('compliance.testMethodPage.collapse') : t('compliance.testMethodPage.expand')}`"
                      @click="toggleTopic(record.no)"
                    >{{ isExpanded(record.no) ? t('compliance.testMethodPage.collapse') : t('compliance.testMethodPage.expand') }}</button>
                  </div>
                </div>
              </template>
            </a-table-column>
            <a-table-column :title="t('compliance.testMethodPage.colChapter')" data-index="chapter" :width="96" align="left">
              <template #cell="{ record }"><span class="tabular">{{ methodOptions.find((option) => option.value === record.testMethod)?.chapter ?? '—' }}</span></template>
            </a-table-column>
            <a-table-column :title="t('compliance.testMethodPage.colMethod')" data-index="testMethod" :width="440" align="left">
              <template #cell="{ record }">
                <a-select
                  class="tm-method-select"
                  :model-value="record.testMethod"
                  allow-search
                  :aria-label="`${record.no} ${t('compliance.testMethodPage.colMethod')}`"
                  @change="(value: unknown) => onMethodChange(record.no, value)"
                >
                  <a-option v-for="option in methodOptions" :key="option.value" :value="option.value">
                    {{ option.value }}
                  </a-option>
                </a-select>
              </template>
            </a-table-column>
            <a-table-column :title="t('compliance.testMethodPage.colAction')" :width="120" align="left">
              <template #cell="{ record }">
                <a-link :disabled="record.isDefault" @click="!record.isDefault && resetRow(record.no)">{{ t('compliance.testMethodPage.resetRow') }}</a-link>
              </template>
            </a-table-column>
          </template>
        </a-table>
      </div>

      <!-- 页脚：共 N 条 → 每页条数 → 箭头 / 页码 → 跳至（DESIGN.md · List footer contract） -->
      <nav class="tm-pagination app-pagination" :aria-label="t('compliance.testMethodPage.pagination.navigation')">
        <span class="pagination-total">{{ t('compliance.testMethodPage.pagination.total', { count: rows.length }) }}</span>
        <div class="pagination-pages">
          <a-select class="app-page-size" :model-value="pageSize" :aria-label="t('compliance.testMethodPage.pagination.pageSizeAria')" @update:model-value="handlePageSizeChange">
            <a-option v-for="size in [10, 20, 50, 100, 200]" :key="size" :value="size">{{ t('compliance.testMethodPage.pagination.perPage', { count: size }) }}</a-option>
          </a-select>
          <button class="pagination-arrow" type="button" :disabled="page === 1" :aria-label="t('compliance.testMethodPage.pagination.previous')" @click="setPage(page - 1)"><IconLeft /></button>
          <button
            v-for="number in pageNumbers"
            :key="number"
            class="pagination-number"
            :class="{ active: page === number }"
            type="button"
            :aria-current="page === number ? 'page' : undefined"
            @click="setPage(number)"
          >{{ number }}</button>
          <button class="pagination-arrow" type="button" :disabled="page === totalPages" :aria-label="t('compliance.testMethodPage.pagination.next')" @click="setPage(page + 1)"><IconRight /></button>
        </div>
        <span class="pagination-jump-label">{{ t('compliance.testMethodPage.pagination.jumpTo') }}</span>
        <a-input-number
          v-model="jumpPage" class="app-page-jump" :min="1" :max="totalPages" hide-button
          :input-attrs="{ 'aria-label': t('compliance.testMethodPage.pagination.jumpTo') }" @press-enter="goToJumpPage"
        />
        <span class="pagination-total-pages">{{ t('compliance.testMethodPage.pagination.totalPages', { count: totalPages }) }}</span>
      </nav>
    </section>

    <!-- 全部恢复默认（420px 确认弹窗） -->
    <a-modal
      v-model:visible="resetAllOpen"
      :title="t('compliance.testMethodPage.resetAllTitle')"
      :width="420"
      :mask-closable="true"
      :ok-text="t('compliance.versions.config.safetyPicker.confirm')"
      :cancel-text="t('compliance.versions.config.safetyPicker.cancel')"
      @ok="confirmResetAll"
    >
      <p class="tm-reset-body">{{ t('compliance.testMethodPage.resetAllBody', { count: rows.length }) }}</p>
    </a-modal>
  </div>
</template>

<style scoped>
/* 页面根：Fill-1 画布上的单块白面板（DESIGN.md · Application shell 列表页构图） */
.tm-page { display: flex; flex-direction: column; gap: 16px; min-width: 0; min-height: calc(100dvh - 88px); color: var(--color-text-1); font-size: 14px; }
.tm-panel { flex: 1; display: flex; flex-direction: column; min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }

/* 列表头：标题 16/600/24 + 条数贴右侧（baseline 对齐）+ 右侧操作 */
.tm-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 16px; }
.tm-head-left { display: flex; align-items: baseline; flex-wrap: wrap; gap: 12px; min-width: 0; }
.tm-head-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.tm-title { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.tm-count { color: var(--color-text-3); font-size: 14px; line-height: 22px; font-variant-numeric: tabular-nums; }
.tm-adjusted { color: var(--color-text-2); font-size: 14px; line-height: 22px; font-variant-numeric: tabular-nums; }
.tm-note { margin: 8px 0 16px; color: var(--color-text-3); font-size: 12px; line-height: 20px; }

/* 数据列表：白底、无外框、无斑马纹、行间单线分隔（与标准条款库同一套表格处理） */
.tm-table-host { min-width: 0; }
.tm-table { min-width: 0; }
.tm-table :deep(.arco-table), .tm-table :deep(.arco-table-container) { border: 0; }
.tm-table :deep(.arco-table-th) { height: 44px; padding: 0 12px; border-bottom: 1px solid var(--app-divider); color: var(--color-text-1); background: var(--app-table-header); font-size: 14px; font-weight: 600; line-height: 22px; white-space: nowrap; text-align: left; }
.tm-table :deep(.arco-table-td) { padding: 8px 12px; border-bottom: 1px solid var(--app-divider); background: var(--app-surface); font-size: 14px; line-height: 22px; text-align: left; }
.tm-table :deep(.arco-table-tr:hover .arco-table-td) { background: var(--color-fill-1); }
/* 单元格内边距只由 td 承担，避免 Arco 单元格再叠一层内边距把行高撑高 */
.tm-table :deep(.arco-table-cell) { padding: 0; line-height: 22px; }
/* 行内编辑下拉：a-select 根节点不带 scoped data-v，尺寸必须 :deep()（DESIGN.md 表格/Arco 节） */
.tm-table :deep(.tm-method-select) { width: 400px; max-width: 100%; }
.tabular { font-variant-numeric: tabular-nums; }

/* 条款主题单元：主题 + （条款内容 + 展开开关）同一行，避免每行固定三行把行高撑高 */
.tm-topic { display: flex; flex-direction: column; gap: 2px; width: 100%; min-width: 0; }
.tm-topic-name { color: var(--color-text-1); line-height: 22px; }
.tm-topic-line { display: flex; align-items: baseline; gap: 8px; width: 100%; min-width: 0; }
/* 单行尾部省略：nowrap + text-overflow（测量口径为 scrollWidth > clientWidth） */
.tm-topic-text {
  flex: 1 1 auto; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--color-text-3); font-size: 12px; line-height: 20px;
}
.tm-topic-text.is-open { overflow: visible; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; }
/* 文字按钮：24×24 命中区（DESIGN.md · Pointer targets），基线随内容首行 */
.tm-topic-toggle {
  flex: 0 0 auto; min-height: 24px; padding: 0 2px; border: 0; background: none;
  color: var(--app-accent); font-size: 12px; line-height: 20px; white-space: nowrap; cursor: pointer;
}
.tm-topic-toggle:hover { text-decoration: underline; }
.tm-topic-toggle:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }

/* 页脚：右对齐「共 N 条 → 每页条数 → 页码 → 跳至」，控件表面走 global.css 共享 app-pagination */
.tm-pagination { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 16px; color: var(--color-text-2); }
.tm-pagination .pagination-total { margin-right: 8px; color: var(--color-text-3); line-height: 22px; }
.tm-pagination .pagination-pages { display: flex; align-items: center; gap: 8px; margin-right: 8px; }
.tm-pagination .pagination-jump-label,
.tm-pagination .pagination-total-pages { color: var(--color-text-3); line-height: 22px; }
.tm-reset-body { margin: 0; color: var(--color-text-1); font-size: 14px; line-height: 22px; }

@media (max-width: 760px) {
  .tm-pagination { justify-content: flex-start; }
  .tm-pagination .pagination-total { width: 100%; margin-right: 0; }
}
</style>
