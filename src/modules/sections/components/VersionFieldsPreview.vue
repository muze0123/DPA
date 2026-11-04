<script setup lang="ts">
/**
 * 表单版本「预览」抽屉内容（通用只读字段清单）。
 *
 * 基础信息与匿名化两页已有真实表单控件预览，其余四个分区（告知与同意 / 数据传输 /
 * 传感器 / 生物特征与口令）此前没有预览入口，这里用统一的只读清单承载，
 * 保证六页【预览】按钮的行为一致：只读、可关闭、不产生修改。
 */
import { useI18n } from 'vue-i18n';

export interface VersionPreviewField {
  key: string;
  code: string;
  labelZh: string;
  labelEn: string;
  widgetLabel: string;
  requiredLabel: string;
  drivers: string[];
  optionLabels: string[];
}

defineProps<{ fields: VersionPreviewField[] }>();
const { t, locale } = useI18n({ useScope: 'global' });
</script>

<template>
  <div class="version-preview">
    <p class="version-note">{{ t('versionPage.previewBoundary') }}</p>
    <p v-if="!fields.length" class="version-preview-empty">{{ t('versionPage.previewEmpty') }}</p>
    <ul v-else class="version-preview-list">
      <li v-for="field in fields" :key="field.key" class="version-preview-item">
        <div class="version-preview-head">
          <strong>{{ field.code }} · {{ locale === 'en-US' ? field.labelEn : field.labelZh }}</strong>
          <span class="version-preview-badges">
            <span class="version-badge">{{ field.widgetLabel }}</span>
            <span class="version-badge">{{ field.requiredLabel }}</span>
          </span>
        </div>
        <dl class="version-preview-facts">
          <div><dt>{{ t('versionPage.labelZh') }}</dt><dd>{{ field.labelZh || '—' }}</dd></div>
          <div><dt>{{ t('versionPage.labelEn') }}</dt><dd>{{ field.labelEn || '—' }}</dd></div>
          <div><dt>{{ t('versionPage.drivers') }}</dt><dd>{{ field.drivers.join('、') || '—' }}</dd></div>
        </dl>
        <div v-if="field.optionLabels.length" class="version-preview-options">
          <span v-for="(label, index) in field.optionLabels" :key="index" class="version-badge">{{ label }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>
