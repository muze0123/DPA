<script setup lang="ts">
/**
 * 基础信息表单版本的预览面板。
 * 只读路由（basic-version-preview）整页内联复用；编辑路由通过右侧抽屉复用同一实例。
 * 面板自身持有模拟条款判定与模拟取值，不写入任何持久化数据。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  evaluateBasicPreview, type BasicFieldDefinition, type BasicFormVersion,
  type BasicOption, type ClauseDecision, type PreviewState,
} from '../data/basicInfoVersions';

const props = defineProps<{ version: BasicFormVersion }>();
const { t, locale } = useI18n({ useScope: 'global' });

/** 模拟条款最终判定：仅本面板内存态，用于检验规则，不读取真实问卷答案 */
const sampleDecisions = ref<Record<string, ClauseDecision>>({});
/** 模拟字段取值：按列位记录，切换字段/折叠不影响 */
const sampleValues = ref<Record<string, string>>({});

const previewClauses = computed(() => [...new Set(props.version.fields.flatMap((field) => field.drivers))].sort());

function localizedLabel(field: BasicFieldDefinition): string {
  return locale.value === 'en-US' ? field.labelEn : field.labelZh;
}
function optionLabel(choice: BasicOption): string {
  return locale.value === 'en-US' ? choice.labelEn : choice.labelZh;
}
function previewState(field: BasicFieldDefinition): PreviewState {
  return evaluateBasicPreview(field, sampleDecisions.value, sampleValues.value[field.column] ?? '');
}
function previewOptions(field: BasicFieldDefinition) {
  return field.options.map((choice) => ({ value: choice.code, label: optionLabel(choice) }));
}
function previewDisabled(field: BasicFieldDefinition): boolean {
  return field.source === 'cover' || ['not-applicable', 'unverified'].includes(previewState(field));
}
function stateTagColor(state: PreviewState): string {
  if (state === 'required-empty') return 'orange';
  if (state === 'not-applicable' || state === 'unverified') return 'gray';
  if (state === 'filled') return 'green';
  return 'arcoblue';
}
function fieldReason(field: BasicFieldDefinition): string {
  const drivers = field.drivers.length
    ? `${field.drivers.join(' / ')} · ${t(`basicInfo.version.match.${field.matchMode}`)}`
    : t('basicInfo.version.noDrivers');
  return `${drivers} · ${t(`basicInfo.version.required.${field.requiredness}`)}`;
}
</script>

<template>
  <section class="version-preview" :aria-label="t('basicInfo.version.preview')">
    <div class="version-preview-heading">
      <h2>{{ t('basicInfo.version.preview') }}</h2>
      <span>{{ t('basicInfo.version.simulation') }}</span>
    </div>
    <p v-if="version.description?.trim()" class="version-preview-note">{{ version.description }}</p>
    <div class="version-preview-identity">
      <span>{{ t('basicInfo.version.readOnlyIdentity') }}</span>
      <strong>FuLi ID · {{ t('basicInfo.version.functionName') }}</strong>
    </div>
    <div class="version-clause-controls">
      <div class="version-clause-heading">
        <strong>{{ t('basicInfo.version.previewClauses') }}</strong>
        <span>{{ t('basicInfo.version.previewClauseHint') }}</span>
      </div>
      <div v-if="previewClauses.length" class="version-clause-grid">
        <label v-for="code in previewClauses" :key="code" class="version-field">
          <span>{{ code }}</span>
          <a-select v-model="sampleDecisions[code]" :placeholder="t('basicInfo.version.decision.unverified')" allow-clear>
            <a-option value="applicable">{{ t('basicInfo.version.decision.applicable') }}</a-option>
            <a-option value="not-applicable">{{ t('basicInfo.version.decision.not-applicable') }}</a-option>
            <a-option value="unverified">{{ t('basicInfo.version.decision.unverified') }}</a-option>
          </a-select>
        </label>
      </div>
      <p v-else class="version-preview-note">{{ t('basicInfo.version.noDrivers') }}</p>
    </div>
    <div v-for="field in version.fields" :key="field.key" class="version-preview-row" :class="`state-${previewState(field)}`">
      <div class="version-preview-label">
        <strong>{{ field.column }} · {{ localizedLabel(field) }}</strong>
        <span v-if="previewState(field) === 'plain'" class="version-plain-state">{{ t('basicInfo.version.state.plain') }}</span>
        <a-tag v-else :color="stateTagColor(previewState(field))">{{ t(`basicInfo.version.state.${previewState(field)}`) }}</a-tag>
      </div>
      <span class="version-preview-reason">{{ fieldReason(field) }}</span>
      <div class="version-preview-control">
        <a-select v-if="field.widget === 'select'" v-model="sampleValues[field.column]" :disabled="previewDisabled(field)" allow-clear
          :placeholder="t('basicInfo.version.previewChoice')" :options="previewOptions(field)" :aria-label="localizedLabel(field)" />
        <a-textarea v-else-if="field.widget === 'textarea'" v-model="sampleValues[field.column]" :disabled="previewDisabled(field)"
          :placeholder="t('basicInfo.version.previewInput')" :auto-size="{ minRows: 2, maxRows: 3 }" :aria-label="localizedLabel(field)" />
        <a-input v-else v-model="sampleValues[field.column]" :disabled="previewDisabled(field)"
          :placeholder="field.source === 'cover' ? t('basicInfo.version.readOnlyField') : t('basicInfo.version.previewInput')"
          :aria-label="localizedLabel(field)" />
        <a-popover v-if="field.widget === 'select'" trigger="click" position="br">
          <a-button type="text" size="small">{{ t('basicInfo.version.viewOptions') }}</a-button>
          <template #content>
            <ul class="version-option-popup">
              <li v-for="choice in field.options" :key="choice.code">{{ optionLabel(choice) }} ({{ choice.workbookValue }})</li>
            </ul>
          </template>
        </a-popover>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 白色内容卡：整页内联（只读路由）与抽屉内（Fill-1 灰画布上的白卡）共用同一形态 */
.version-preview { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); color: var(--color-text-1); font-size: 14px; }
.version-preview-heading, .version-clause-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; margin-bottom: 12px; }
.version-preview-heading h2 { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.version-preview-heading span, .version-clause-heading span { color: var(--color-text-2); font-size: 12px; line-height: 20px; }
.version-field { display: flex; flex-direction: column; min-width: 0; gap: 8px; font-size: 14px; line-height: 22px; }
.version-field > span { color: var(--color-text-2); }
.version-field :deep(.arco-select-view) { width: 100%; background: var(--app-surface); }
.version-clause-heading strong { font-size: 14px; font-weight: 600; }
.version-clause-controls { padding: 16px 0; border-bottom: 1px solid var(--app-divider); }
.version-clause-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.version-preview-note { margin: 0; color: var(--color-text-2); font-size: 12px; line-height: 20px; }
.version-preview-identity { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--app-divider); font-size: 14px; }
.version-preview-identity span { color: var(--color-text-2); font-size: 12px; }
.version-preview-row { padding: 16px 0; border-bottom: 1px solid var(--app-divider); }
.version-preview-label { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 6px; }
.version-preview-label strong { font-size: 14px; font-weight: 600; }
.version-preview-reason { color: var(--color-text-2); font-size: 12px; line-height: 20px; }
.version-preview-control { display: flex; align-items: center; gap: 12px; margin-top: 8px; max-width: 540px; }
.version-plain-state { color: var(--color-text-2); font-size: 12px; }
.version-preview-control > :deep(.arco-input-wrapper), .version-preview-control > :deep(.arco-select-view),
.version-preview-control > :deep(.arco-textarea-wrapper) { flex: 1; min-width: 0; background: var(--app-surface); }
.version-preview-row.state-required-empty { padding-left: 12px; border-left: 3px solid var(--app-color-warning); background: var(--mt-warn-bg); }
.version-preview-row.state-not-applicable { padding-left: 12px; background: var(--color-fill-2); }
.version-preview-row.state-unverified { padding-left: 12px; border-left: 3px solid var(--app-divider); }
.version-option-popup { margin: 0; padding: 0 8px 0 24px; font-size: 13px; line-height: 24px; }
@media (max-width: 900px) { .version-clause-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 620px) {
  .version-clause-grid { grid-template-columns: minmax(0, 1fr); }
  .version-preview-control { flex-wrap: wrap; }
}
</style>
