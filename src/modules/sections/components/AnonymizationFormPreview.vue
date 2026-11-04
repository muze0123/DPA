<script setup lang="ts">
/**
 * 匿名化表单版本预览（只读）。
 *
 * 展示字段名称、必填规则、驱动条款与可选值，用于配置核对；不渲染可填写控件，
 * 也不保存任何填写结果（填写一律在问卷工作区第 4 步完成）。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { anonymizationMeta } from '../data/anonymization';
import type { AnonymizationFormVersion } from '../data/anonymizationVersions';
import { sectionVersionStatusColor } from '../data/versionStatus';

const props = defineProps<{ version: AnonymizationFormVersion }>();
const { t, locale } = useI18n({ useScope: 'global' });

function label(field: AnonymizationFormVersion['fields'][number]): string {
  return locale.value === 'en-US' ? field.labelEn : field.labelZh;
}
function optionLabel(choice: { labelZh: string; labelEn: string }): string {
  return locale.value === 'en-US' ? choice.labelEn : choice.labelZh;
}
const hints = computed(() => props.version.fields.map((field) => anonymizationMeta(field.column)));
</script>

<template>
  <section class="an-preview" :aria-label="t('anonymization.version.previewTitle')">
    <div class="an-preview-head">
      <strong>{{ version.version }}</strong>
      <a-tag size="small" :color="sectionVersionStatusColor(version.status)">
        {{ t(`sectionVersion.status.${version.status}`) }}
      </a-tag>
      <span>{{ t('anonymization.version.fieldsCount', { count: version.fields.length }) }}</span>
    </div>
    <p v-if="version.description" class="an-preview-description">{{ version.description }}</p>
    <p class="an-preview-note">{{ t('anonymization.version.previewNote') }}</p>

    <ol class="an-preview-fields">
      <li v-for="(field, index) in version.fields" :key="field.key" class="an-preview-field">
        <div class="an-preview-field-head">
          <span class="an-preview-code">{{ field.column }}</span>
          <span class="an-preview-label">{{ label(field) }}</span>
          <a-tag size="small" :color="field.requiredness === 'required' ? 'arcoblue' : 'gray'">
            {{ t(`anonymization.version.requiredness.${field.requiredness}`) }}
          </a-tag>
          <span class="an-preview-drivers">
            {{ field.drivers.length ? field.drivers.join(locale === 'zh-CN' ? '、' : ', ') : t('anonymization.version.noDrivers') }}
          </span>
        </div>
        <p v-if="hints[index]" class="an-preview-hint">
          {{ locale === 'zh-CN' ? hints[index]?.hintZh : hints[index]?.hintEn }}
        </p>
        <p v-if="field.options.length" class="an-preview-options">
          <span class="an-preview-options-label">{{ t('anonymization.version.optionSet') }}</span>
          <span v-for="choice in field.options" :key="choice.code" class="an-preview-option">{{ optionLabel(choice) }}</span>
        </p>
        <p v-else class="an-preview-options">
          <span class="an-preview-options-label">{{ t('anonymization.version.optionSet') }}</span>
          <span class="an-preview-text">{{ t('anonymization.version.freeText') }}</span>
        </p>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.an-preview { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.an-preview-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.an-preview-head strong { font-size: 16px; font-weight: 600; line-height: 24px; }
.an-preview-head > span { color: var(--color-text-2); font-size: 12px; line-height: 20px; }
/* 面板标题块：24px 行盒 + 上下 8px；标题块与内容间距 12px（DESIGN.md · Typography） */
.an-preview-description { margin: 12px 0 0; color: var(--color-text-2); font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.an-preview-note { margin: 8px 0 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.an-preview-fields { display: flex; flex-direction: column; gap: 0; margin: 12px 0 0; padding: 0; list-style: none; }
.an-preview-field { padding: 12px 12px 14px; border-bottom: 1px solid var(--app-divider); }
.an-preview-field:first-child { border-top: 1px solid var(--app-divider); }
.an-preview-field-head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.an-preview-code { flex: none; padding: 0 5px; border-radius: 2px; color: var(--app-surface); background: var(--color-text-2); font-size: 12px; font-weight: 600; line-height: 20px; }
.an-preview-label { font-size: 14px; font-weight: 600; line-height: 22px; }
.an-preview-drivers { margin-left: auto; color: var(--color-text-2); font-size: 12px; line-height: 20px; font-variant-numeric: tabular-nums; }
.an-preview-hint { margin: 6px 0 0; color: var(--color-text-3); font-size: 12px; line-height: 18px; }
.an-preview-options { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0 0; }
.an-preview-options-label { color: var(--color-text-2); font-size: 12px; line-height: 20px; }
.an-preview-option { padding: 0 8px; border: 1px solid var(--app-control-border); border-radius: 2px; color: var(--color-text-1); font-size: 12px; line-height: 20px; }
.an-preview-text { color: var(--color-text-3); font-size: 12px; line-height: 20px; }
</style>
