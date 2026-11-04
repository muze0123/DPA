<script setup lang="ts">
/**
 * 添加需求条目弹窗（2026-11-02 用户裁决：需求条目区分 Device / Document 两种安全需求类型）：
 * - 交互与「选择问题」弹窗（QuestionPickerModal）一致：关键词筛选 + 只看已选 +
 *   底部已选计数 + 表格多选（整行点击切换、表头复选框全选当前页）+ 五档分页翻页不丢选中 +
 *   未选择时【确定】禁用；弹窗 800px、搜索框 300px、列表区仅内部滚动（表头吸顶）；
 * - 数据源（2026-11-02 二次裁决）= xlsx「需求筛选」工作簿 E 列解析的全部 139 条需求条目
 *   （requirementFilterEntries.ts，38 个条款全覆盖），编号列展示完整 RF 编号，由用户自行
 *   选择挂接到触发按钮所属条款；弹窗内仍按 Device/Document 分组浏览；
 * - 弹窗内顶部「Device / Document」类型切换（默认定位到触发按钮所属组），切换只过滤列表、
 *   已选跨类型累计；确认时把两组已选一并回写（页面按类型分组展示）。
 *
 * 【旧口径（2026-11-01，用户要求注释保留，可能切回）】
 *   数据源为「需求数据」工作簿 E 列整单元格条目（SR-001…SR-038），弹窗单一列表、无类型
 *   维度：items 全量直列、无 activeType 切换、确认回写单列表。切回时去掉 type 过滤与本组件
 *   的类型切换 UI、恢复全量 items 即可（页面侧同步恢复 srOptions 注释块）。
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconSearch, IconLeft, IconRight } from '@arco-design/web-vue/es/icon';

/** 候选项：value = 存储引用值（RF-…/SR-###），code = 展示编号，content = 条目原文，type = 需求类型 */
export interface SafetyRequirementOption {
  value: string;
  code: string;
  content: string;
  type?: 'device' | 'document';
}

export type RequirementType = 'device' | 'document';

const props = defineProps<{
  visible: boolean;
  clauseNo: string;
  /** 数据源：该条款可挂接的需求条目（页面按「安全需求」来源解析，含 Device/Document 两组） */
  items: SafetyRequirementOption[];
  selectedValues: string[];
  /** 打开时定位的类型（由触发按钮所属组决定），默认 Device */
  initialType?: RequirementType;
}>();

const emit = defineEmits<{
  (e: 'confirm', values: string[]): void;
  (e: 'cancel'): void;
}>();

const { t } = useI18n();
const PAGE_SIZES: readonly number[] = [10, 20, 50, 100, 200];

const keyword = ref('');
const onlySelected = ref(false);
const selected = ref<Set<string>>(new Set());
const page = ref(1);
const pageSize = ref(10);
/** 当前查看的类型（Device/Document），切换只影响列表过滤，不影响已选 */
const activeType = ref<RequirementType>('device');

watch(() => props.visible, (open) => {
  if (!open) return;
  selected.value = new Set(props.selectedValues);
  keyword.value = '';
  onlySelected.value = false;
  page.value = 1;
  pageSize.value = 10;
  activeType.value = props.initialType ?? 'device';
});

/** 候选含类型维度时按当前类型过滤（旧口径数据无 type 字段 → 全量直列） */
const typeFiltered = computed(() => {
  if (!props.items.some((item) => item.type)) return props.items;
  return props.items.filter((item) => (item.type ?? 'device') === activeType.value);
});

const filtered = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  return typeFiltered.value.filter((item) => {
    if (onlySelected.value && !selected.value.has(item.value)) return false;
    if (!text) return true;
    return `${item.code} ${item.content}`.toLowerCase().includes(text);
  });
});

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)));
const paged = computed(() => {
  const current = Math.min(page.value, totalPages.value);
  return filtered.value.slice((current - 1) * pageSize.value, current * pageSize.value);
});
const pageNumbers = computed(() => Array.from({ length: totalPages.value }, (_, index) => index + 1));
const pageAllChecked = computed(() => paged.value.length > 0 && paged.value.every((item) => selected.value.has(item.value)));

function toggle(value: string): void {
  const next = new Set(selected.value);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  selected.value = next;
}
function togglePage(): void {
  const next = new Set(selected.value);
  for (const item of paged.value) {
    if (pageAllChecked.value) next.delete(item.value);
    else next.add(item.value);
  }
  selected.value = next;
}
function resetPage(): void { page.value = 1; }
function onPageSizeChange(value: unknown): void {
  pageSize.value = Number(value) || 10;
  page.value = 1;
}
function onTypeChange(value: unknown): void {
  activeType.value = (value === 'document' ? 'document' : 'device');
  page.value = 1;
}
function confirm(): void {
  // 按候选顺序（Device → Document）回写全部已选，页面按类型分组展示
  emit('confirm', props.items.filter((item) => selected.value.has(item.value)).map((item) => item.value));
}
</script>

<template>
  <a-modal
    :visible="visible"
    :title="t('compliance.versions.config.safetyPicker.title')"
    :width="800"
    :mask-closable="false"
    :ok-text="t('compliance.versions.config.safetyPicker.confirm')"
    :cancel-text="t('compliance.versions.config.safetyPicker.cancel')"
    :ok-button-props="{ disabled: selected.size === 0 }"
    unmount-on-close
    @ok="confirm"
    @cancel="emit('cancel')"
  >
    <!-- 类型切换（Device/Document 为标准业务名词，不进 i18n）：默认定位触发按钮所属组 -->
    <a-radio-group
      type="button"
      size="small"
      :model-value="activeType"
      class="srpicker-types"
      :aria-label="t('compliance.versions.config.safetyPicker.typeAria')"
      @update:model-value="onTypeChange($event)"
    >
      <a-radio value="device">Device</a-radio>
      <a-radio value="document">Document</a-radio>
    </a-radio-group>

    <div class="srpicker-filters">
      <a-input
        v-model="keyword"
        class="srpicker-keyword"
        allow-clear
        :placeholder="t('compliance.versions.config.safetyPicker.keywordPlaceholder')"
        @input="resetPage"
        @clear="resetPage"
      >
        <template #prefix><IconSearch :size="14" /></template>
      </a-input>
      <a-checkbox v-model="onlySelected" class="srpicker-only" @change="resetPage">
        {{ t('compliance.versions.config.safetyPicker.onlySelected') }}
      </a-checkbox>
    </div>

    <a-empty v-if="!items.length" :description="t('compliance.versions.config.safetyPicker.noSource')" />
    <template v-else>
      <!-- 列表区：仅表格内部滚动（表头吸顶），弹窗整体高度不超视口 -->
      <div class="srpicker-table-wrap">
        <table class="srpicker-table">
          <colgroup>
            <col class="srpicker-col-check" />
            <col class="srpicker-col-code" />
            <col class="srpicker-col-content" />
          </colgroup>
          <thead>
            <tr>
              <th class="srpicker-check-col">
                <a-checkbox
                  :model-value="pageAllChecked"
                  :disabled="!paged.length"
                  :aria-label="t('compliance.versions.config.safetyPicker.checkPage')"
                  @change="togglePage"
                />
              </th>
              <th>{{ t('compliance.versions.config.safetyPicker.colCode') }}</th>
              <th>{{ t('compliance.versions.config.safetyPicker.colContent') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in paged" :key="item.value" class="srpicker-row" @click="toggle(item.value)">
              <td class="srpicker-check-col" @click.stop>
                <a-checkbox
                  :model-value="selected.has(item.value)"
                  :aria-label="`${item.code} ${item.content}`"
                  @change="toggle(item.value)"
                />
              </td>
              <td class="srpicker-code-cell tabular">{{ item.code }}</td>
              <!-- 省略号截断放在内层元素：td 保持 table-cell（列错位见 DESIGN.md 表格节） -->
              <td class="srpicker-content-cell" :title="item.content">
                <span class="srpicker-clamp">{{ item.content }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <a-empty v-if="!filtered.length" :description="t('compliance.versions.config.safetyPicker.empty')" />
    </template>

    <nav class="srpicker-pagination app-pagination" :aria-label="t('compliance.versions.config.safetyPicker.paginationLabel')">
      <span class="srpicker-meta">
        {{ t('compliance.versions.config.safetyPicker.total', { count: filtered.length }) }}
        <span aria-hidden="true">｜</span>
        <b aria-live="polite">{{ t('compliance.versions.config.safetyPicker.selectedCount', { count: selected.size }) }}</b>
      </span>
      <div class="pagination-pages">
        <a-select
          class="app-page-size"
          :model-value="pageSize"
          :aria-label="t('compliance.versions.config.safetyPicker.pageSizeAria')"
          @update:model-value="onPageSizeChange($event)"
        >
          <a-option v-for="size in PAGE_SIZES" :key="size" :value="size">
            {{ t('compliance.versions.config.safetyPicker.perPage', { count: size }) }}
          </a-option>
        </a-select>
        <button class="pagination-arrow" type="button" :disabled="page === 1" :aria-label="t('compliance.versions.config.safetyPicker.previous')" @click="page -= 1">
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
        <button class="pagination-arrow" type="button" :disabled="page === totalPages" :aria-label="t('compliance.versions.config.safetyPicker.next')" @click="page += 1">
          <IconRight />
        </button>
      </div>
    </nav>
  </a-modal>
</template>

<style scoped>
/* 类型切换（Device/Document 分段按钮，左对齐、与筛选行 12px 间距） */
.srpicker-types { margin-bottom: 12px; }
.srpicker-filters { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.srpicker-keyword { flex: none; width: 300px; }
.srpicker-only { flex: none; color: var(--color-text-2); font-size: 13px; }

/* 列表区：固定最大高度，仅内部滚动；表头吸顶（弹窗高度不超视口） */
.srpicker-table-wrap { max-height: calc(100vh - 360px); overflow: auto; border: 1px solid var(--app-divider); border-radius: 2px; }
.srpicker-table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; background: var(--app-surface); font-size: 13px; line-height: 20px; }
.srpicker-table th, .srpicker-table td { padding: 8px 10px; border-bottom: 1px solid var(--app-divider); text-align: left; vertical-align: top; }
.srpicker-table thead th { position: sticky; top: 0; z-index: 1; background: var(--app-table-header, var(--color-fill-2)); color: var(--color-text-2); font-weight: 500; white-space: nowrap; box-shadow: inset 0 -1px 0 var(--app-divider); }
.srpicker-table tbody tr:last-child td { border-bottom: 0; }
.srpicker-col-check { width: 44px; }
.srpicker-col-code { width: 128px; }
.srpicker-col-content { width: auto; }
.srpicker-check-col { text-align: center; }
.srpicker-code-cell { color: var(--color-text-1); font-weight: 600; font-variant-numeric: tabular-nums; }
.srpicker-content-cell { color: var(--color-text-1); }
/* 多行省略打在内层元素上：td 保持 table-cell，列宽才不会被 -webkit-box 破坏 */
.srpicker-clamp { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; -webkit-line-clamp: 3; white-space: pre-line; }
.srpicker-row { cursor: pointer; }
.srpicker-row:hover td { background: var(--color-fill-1); }

.srpicker-pagination { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.srpicker-meta { color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.srpicker-meta b { color: var(--app-accent); font-weight: 600; font-variant-numeric: tabular-nums; }
.srpicker-pagination .pagination-pages { display: flex; align-items: center; gap: 4px; }
</style>
