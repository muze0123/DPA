<script setup lang="ts">
/**
 * 分区管理 · 表单版本「版本信息」区块（六个分区同构）。
 *
 * 口径（2026-10-27 用户裁决）：
 * - 组件宽度统一 500px（`--version-meta-width`），字段纵向排列、标签在上、控件在下；
 * - 版本号必填、限 20 字，保留 vX.Y 形态校验；分区说明限 100 字；
 * - 两个输入都显示字数统计；标签不再出现「（选填）」后缀；
 * - 「版本状态」字段已移除（状态只体现在列表页与发布流程）；
 * - 「来源版本」默认仍为不可编辑的禁用输入：有来源显示来源版本号，无来源显示
 *   t('versionPage.noSource')；工作簿文件名（.xlsx/.xls，大小写不敏感）视为无来源；
 * - 2026-10-28：新建表单版本页传入 sourceEditable 后改为可编辑、选填的下拉
 *   （默认无来源，placeholder「请选择」），选择/清空经 update:source 交由页面
 *   联动下方字段配置；编辑页/预览页维持只读禁用展示；
 * - 查看态用同一栅格渲染，不再切换成 Descriptions 表格；
 * - 2026-10-28：只读（预览/查看）态改为概要行式「字段名：值」，口径同问卷工作区
 *   概要条（SurveyDetailPage .detail-facts）——字段名 Text-3 灰、右侧全角冒号
 *   （en 为半角冒号）、值 Text-1，同一行排布；必填标记仅在可编辑态出现。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  version: string;
  description: string;
  sourceLabel: string;
  readOnly?: boolean;
  versionIssue?: boolean;
  descriptionIssue?: boolean;
  idPrefix: string;
  /** 新建态专用：来源版本渲染为可选下拉（编辑/预览不传，保持禁用输入） */
  sourceEditable?: boolean;
  /** 当前选中的来源版本 id（受控值，清空为 ''） */
  sourceId?: string;
  sourceOptions?: { value: string; label: string }[];
}>();

const emit = defineEmits<{
  'update:version': [string];
  'update:description': [string];
  'update:source': [string];
}>();
const { t } = useI18n({ useScope: 'global' });

const VERSION_MAX = 20;
const DESCRIPTION_MAX = 100;

/**
 * 来源版本的只读展示值：空串或工作簿文件名（.xlsx/.xls，大小写不敏感）
 * 视为「无来源」（2026-10-27 口径），其余原样展示来源版本号。
 */
const sourceDisplay = computed(() => {
  const source = props.sourceLabel.trim();
  if (!source || /\.xlsx?$/i.test(source)) return t('versionPage.noSource');
  return source;
});
</script>

<template>
  <section class="version-panel" :aria-label="t('versionPage.settings')">
    <div class="version-panel-heading"><h2>{{ t('versionPage.settings') }}</h2></div>
    <div class="version-meta">
      <div class="version-field" :class="{ 'is-invalid': props.versionIssue, 'is-readonly': readOnly }">
        <label v-if="!readOnly" class="version-field-label app-field-label" :for="`${idPrefix}-version-number`">
          <span class="version-required" aria-hidden="true">*</span>{{ t('versionPage.version') }}
        </label>
        <span v-else class="version-field-label">{{ t('versionPage.version') }}{{ t('versionPage.fieldSeparator') }}</span>
        <span v-if="readOnly" class="version-value">{{ version || '—' }}</span>
        <a-input
          v-else
          :id="`${idPrefix}-version-number`"
          :model-value="version"
          :max-length="VERSION_MAX"
          show-word-limit
          :placeholder="t('versionPage.versionPlaceholder')"
          :aria-invalid="props.versionIssue"
          aria-required="true"
          @update:model-value="emit('update:version', String($event))"
        />
        <small v-if="props.versionIssue" role="alert">{{ t('versionPage.errors.version') }}</small>
      </div>

      <div class="version-field" :class="{ 'is-readonly': readOnly }">
        <span class="version-field-label">{{ t('versionPage.source') }}{{ t('versionPage.fieldSeparator') }}</span>
        <!-- 只读态：与概要条同构的纯文本展示；新建态：可编辑、选填下拉；编辑态：禁用输入 -->
        <span v-if="readOnly" class="version-value">{{ sourceDisplay }}</span>
        <a-select
          v-else-if="sourceEditable"
          :model-value="sourceId ?? ''"
          allow-clear
          :placeholder="t('versionPage.sourcePlaceholder')"
          :aria-label="t('versionPage.source')"
          @update:model-value="emit('update:source', String($event ?? ''))"
          @clear="emit('update:source', '')"
        >
          <a-option v-for="option in sourceOptions ?? []" :key="option.value" :value="option.value">{{ option.label }}</a-option>
        </a-select>
        <a-input
          v-else
          :model-value="sourceDisplay"
          disabled
          :aria-label="t('versionPage.source')"
        />
      </div>

      <div class="version-field" :class="{ 'is-invalid': props.descriptionIssue, 'is-readonly': readOnly }">
        <label v-if="!readOnly" class="version-field-label app-field-label" :for="`${idPrefix}-version-description`">{{ t('versionPage.description') }}</label>
        <span v-else class="version-field-label">{{ t('versionPage.description') }}{{ t('versionPage.fieldSeparator') }}</span>
        <span v-if="readOnly" class="version-value version-value--multiline">{{ description || '—' }}</span>
        <a-textarea
          v-else
          :id="`${idPrefix}-version-description`"
          :model-value="description"
          :max-length="DESCRIPTION_MAX"
          show-word-limit
          :auto-size="{ minRows: 3, maxRows: 6 }"
          :placeholder="t('versionPage.descriptionPlaceholder')"
          @update:model-value="emit('update:description', String($event))"
        />
        <small v-if="props.descriptionIssue" role="alert">{{ t('versionPage.errors.description') }}</small>
      </div>
    </div>
  </section>
</template>

<style scoped>
.version-meta { display: flex; flex-direction: column; gap: 16px; width: var(--version-meta-width); max-width: 100%; }
.version-field { display: flex; flex-direction: column; gap: 8px; min-width: 0; font-size: 14px; line-height: 22px; }
.version-field-label { display: inline-flex; align-items: center; gap: 4px; color: var(--color-text-2); }
.version-required { color: var(--app-color-danger); }
.version-value { min-height: 22px; color: var(--color-text-1); overflow-wrap: anywhere; }
.version-value--multiline { white-space: pre-wrap; }
/* 只读（预览/查看）态：概要行式「字段名：值」，口径同问卷工作区概要条
   （SurveyDetailPage .detail-facts：字段名 Text-3 + 分隔符，值 Text-1，2026-10-28 裁决） */
.version-field.is-readonly { flex-direction: row; align-items: baseline; gap: 0; }
.version-field.is-readonly .version-field-label { flex: none; color: var(--color-text-3); }
.version-field small { color: var(--app-color-danger); font-size: 12px; line-height: 20px; }
.version-field :deep(.arco-input-wrapper), .version-field :deep(.arco-textarea-wrapper),
.version-field :deep(.arco-select-view) { width: 100%; background: var(--app-surface); }
/* 禁用的「来源版本」输入保持 Arco 默认禁用灰底（Fill-2）：上方白底规则的特异性
   高于 .arco-input-disabled 的默认背景，这里按 DESIGN.md Fill-2 精确恢复（2026-10-27） */
.version-field :deep(.arco-input-wrapper.arco-input-disabled) { background: var(--color-fill-2); }
.version-field.is-invalid :deep(.arco-input-wrapper), .version-field.is-invalid :deep(.arco-textarea-wrapper) { border-color: var(--app-color-danger); }
</style>
