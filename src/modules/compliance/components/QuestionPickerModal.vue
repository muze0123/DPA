<script setup lang="ts">
/**
 * 选择问题弹窗（2026-11-01 用户裁决，触发条件【+ 添加问题】入口）：
 * - 数据源 = 所选问题库（问卷问题模块）的题目列表，由页面经 `questions` 传入；
 *   未选择问题库时列表为空并提示「请先在基本信息中选择问题库」；
 * - 参与判定的题目才可选（题号不在题库内的自建题不进表达式，列表直接过滤）；
 * - 筛选：问题名称关键词（题号/题干/判断指引）+ 只看已选；
 * - 列表：题号、题干、判断指引（模板题 guide 为自由文本，含换行），多选（整行点击切换，
 *   表头复选框全选当前页）；判断指引与题干分列展示，不合并；
 * - 分页：项目统一五档 [10, 20, 50, 100, 200]，选择状态以 Set 独立维护，翻页不丢失；
 * - 已选择问题数仅在底部分页栏常显（2026-11-04 用户裁决：去掉筛选行右侧重复计数）；未选择数据时【确定】禁用；确定回传最终勾选的题号列表（按库题序）；
 * - 弹窗 800px、搜索框 300px；列表区固定最大高度、仅表格内部滚动（表头吸顶），
 *   弹窗整体高度不超出视口；列表为静态结构，按 DESIGN.md 用原生 table + 共享 app-pagination。
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconSearch, IconLeft, IconRight } from '@arco-design/web-vue/es/icon';
import { isKnownCode } from '../../surveys/data/questions';
import type { TemplateQuestion } from '../../templates/data/templates';

const props = defineProps<{
  visible: boolean;
  clauseNo: string;
  /** 数据源：所选问题库的题目（未选库时为空数组，弹窗提示先选库） */
  questions: TemplateQuestion[];
  selectedCodes: string[];
}>();

const emit = defineEmits<{
  (e: 'confirm', codes: string[]): void;
  (e: 'cancel'): void;
}>();

const { t } = useI18n();
const PAGE_SIZES: readonly number[] = [10, 20, 50, 100, 200];

const keyword = ref('');
const onlySelected = ref(false);
const selected = ref<Set<string>>(new Set());
const page = ref(1);
const pageSize = ref(10);

watch(() => props.visible, (open) => {
  if (!open) return;
  selected.value = new Set(props.selectedCodes);
  keyword.value = '';
  onlySelected.value = false;
  page.value = 1;
  pageSize.value = 10;
});

/** 只有题号在题库内的题可参与表达式判定；自建题不进候选 */
const selectable = computed(() => props.questions.filter((question) => isKnownCode(question.code)));

const filtered = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  return selectable.value.filter((question) => {
    if (onlySelected.value && !selected.value.has(question.code)) return false;
    if (!text) return true;
    return `${question.code} ${question.title} ${question.guide}`.toLowerCase().includes(text);
  });
});

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)));
const paged = computed(() => {
  const current = Math.min(page.value, totalPages.value);
  return filtered.value.slice((current - 1) * pageSize.value, current * pageSize.value);
});
const pageNumbers = computed(() => Array.from({ length: totalPages.value }, (_, index) => index + 1));
const pageAllChecked = computed(() => paged.value.length > 0 && paged.value.every((question) => selected.value.has(question.code)));

function toggle(code: string): void {
  const next = new Set(selected.value);
  if (next.has(code)) next.delete(code);
  else next.add(code);
  selected.value = next;
}
function togglePage(): void {
  const next = new Set(selected.value);
  for (const question of paged.value) {
    if (pageAllChecked.value) next.delete(question.code);
    else next.add(question.code);
  }
  selected.value = next;
}
function resetPage(): void { page.value = 1; }
function onPageSizeChange(value: unknown): void {
  pageSize.value = Number(value) || 10;
  page.value = 1;
}
function confirm(): void {
  emit('confirm', selectable.value.filter((question) => selected.value.has(question.code)).map((question) => question.code));
}
</script>

<template>
  <a-modal
    :visible="visible"
    :title="t('compliance.versions.config.picker.title')"
    :width="800"
    :mask-closable="false"
    :ok-text="t('compliance.versions.config.picker.confirm')"
    :cancel-text="t('compliance.versions.config.picker.cancel')"
    :ok-button-props="{ disabled: selected.size === 0 }"
    unmount-on-close
    @ok="confirm"
    @cancel="emit('cancel')"
  >
    <div class="picker-filters">
      <a-input
        v-model="keyword"
        class="picker-keyword"
        allow-clear
        :placeholder="t('compliance.versions.config.picker.keywordPlaceholder')"
        @input="resetPage"
        @clear="resetPage"
      >
        <template #prefix><IconSearch :size="14" /></template>
      </a-input>
      <a-checkbox v-model="onlySelected" class="picker-only" @change="resetPage">
        {{ t('compliance.versions.config.picker.onlySelected') }}
      </a-checkbox>
    </div>

    <!-- 未选问题库：空态提示先去基本信息选库 -->
    <a-empty v-if="!selectable.length" :description="t('compliance.versions.config.picker.noLibrary')" />
    <template v-else>
      <!-- 列表区：仅表格内部滚动（表头吸顶），弹窗整体高度不超视口 -->
      <div class="picker-table-wrap">
        <table class="picker-table">
          <colgroup>
            <col class="picker-col-check" />
            <col class="picker-col-code" />
            <col class="picker-col-title" />
            <col class="picker-col-guide" />
          </colgroup>
          <thead>
            <tr>
              <th class="picker-check-col">
                <a-checkbox
                  :model-value="pageAllChecked"
                  :disabled="!paged.length"
                  :aria-label="t('compliance.versions.config.picker.checkPage')"
                  @change="togglePage"
                />
              </th>
              <th>{{ t('compliance.versions.config.picker.colCode') }}</th>
              <th>{{ t('compliance.versions.config.picker.colTitle') }}</th>
              <th>{{ t('compliance.versions.config.picker.colGuide') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="question in paged" :key="question.code" class="picker-row" @click="toggle(question.code)">
              <td class="picker-check-col" @click.stop>
                <a-checkbox
                  :model-value="selected.has(question.code)"
                  :aria-label="`${question.code} ${question.title}`"
                  @change="toggle(question.code)"
                />
              </td>
              <td class="picker-code-cell tabular">{{ question.code }}</td>
              <!-- 省略号截断必须放在内层元素：td 上设 display:-webkit-box 会破坏 table-cell 布局（列错位） -->
              <td class="picker-title-cell" :title="question.title"><span class="picker-clamp picker-clamp-2">{{ question.title }}</span></td>
              <td class="picker-guide-cell" :title="question.guide"><span class="picker-clamp picker-clamp-3">{{ question.guide || '—' }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <a-empty v-if="!filtered.length" :description="t('compliance.versions.config.picker.empty')" />
    </template>

    <nav class="picker-pagination app-pagination" :aria-label="t('compliance.versions.config.picker.paginationLabel')">
      <span class="picker-meta">
        {{ t('compliance.versions.config.picker.total', { count: filtered.length }) }}
        <span aria-hidden="true">｜</span>
        <b aria-live="polite">{{ t('compliance.versions.config.picker.selectedCount', { count: selected.size }) }}</b>
      </span>
      <div class="pagination-pages">
        <a-select
          class="app-page-size"
          :model-value="pageSize"
          :aria-label="t('compliance.versions.config.picker.pageSizeAria')"
          @update:model-value="onPageSizeChange($event)"
        >
          <a-option v-for="size in PAGE_SIZES" :key="size" :value="size">
            {{ t('compliance.versions.config.picker.perPage', { count: size }) }}
          </a-option>
        </a-select>
        <button class="pagination-arrow" type="button" :disabled="page === 1" :aria-label="t('compliance.versions.config.picker.previous')" @click="page -= 1">
          <IconLeft />
        </button>
        <button
          v-for="number in pageNumbers"
          :key="number"
          type="button"
          class="pagination-number"
          :class="{ active: number === page }"
          @click="page = number"
        >{{ number }}</button>
        <button class="pagination-arrow" type="button" :disabled="page === totalPages" :aria-label="t('compliance.versions.config.picker.next')" @click="page += 1">
          <IconRight />
        </button>
      </div>
    </nav>
  </a-modal>
</template>

<style scoped>
.picker-filters { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.picker-keyword { flex: none; width: 300px; }
.picker-only { flex: none; color: var(--color-text-2); font-size: 13px; }

/* 列表区：固定最大高度，仅内部滚动；表头吸顶（弹窗高度不超视口） */
.picker-table-wrap { max-height: calc(100vh - 360px); overflow: auto; border: 1px solid var(--app-divider); border-radius: 2px; }
.picker-table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; background: var(--app-surface); font-size: 13px; line-height: 20px; }
.picker-table th, .picker-table td { padding: 8px 10px; border-bottom: 1px solid var(--app-divider); text-align: left; vertical-align: top; }
.picker-table thead th { position: sticky; top: 0; z-index: 1; background: var(--app-table-header, var(--color-fill-2)); color: var(--color-text-2); font-weight: 500; white-space: nowrap; box-shadow: inset 0 -1px 0 var(--app-divider); }
.picker-table tbody tr:last-child td { border-bottom: 0; }
.picker-col-check { width: 44px; }
.picker-col-code { width: 88px; }
.picker-col-title { width: 40%; }
.picker-col-guide { width: auto; }
.picker-check-col { text-align: center; }
.picker-code-cell { color: var(--color-text-1); font-weight: 600; font-variant-numeric: tabular-nums; }
.picker-title-cell { color: var(--color-text-1); }
.picker-guide-cell { color: var(--color-text-2); }
/* 多行省略打在内层元素上：td 保持 table-cell，列宽才不会被 -webkit-box 破坏 */
.picker-clamp { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-line; }
.picker-clamp-2 { -webkit-line-clamp: 2; }
.picker-clamp-3 { -webkit-line-clamp: 3; }
.picker-row { cursor: pointer; }
.picker-row:hover td { background: var(--color-fill-1); }

.picker-pagination { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.picker-meta { color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.picker-meta b { color: var(--app-accent); font-weight: 600; font-variant-numeric: tabular-nums; }
.picker-pagination .pagination-pages { display: flex; align-items: center; gap: 4px; }
</style>
