<script setup lang="ts">
/**
 * 分区管理 · 表单版本子页面的统一操作条（新建 / 编辑 / 预览 共用）。
 *
 * 口径（2026-10-27 用户裁决）：
 * - 面包屑：上一层级名称默认 Text-2 灰，hover/focus 变主色蓝，点击返回上一层级；
 *   当前页名称由各页传入，六页统一为「新建/编辑/预览表单版本」。
 * - 底部不画 1px 描边；吸顶（滚动置顶）时用 Level-4 阴影表达层级。
 * - 编辑态按钮固定为【预览】【保存草稿】【发布版本】，按钮内不再放图标；
 *   预览态只保留一个主操作（编辑表单版本 / 复制为新版本）。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { RouteLocationRaw } from 'vue-router';
import { useI18n } from 'vue-i18n';

withDefaults(defineProps<{
  parentLabel: string;
  parentTo: RouteLocationRaw;
  currentLabel: string;
  mode?: 'edit' | 'read';
  previewDisabled?: boolean;
  saveDisabled?: boolean;
  saveLoading?: boolean;
  publishDisabled?: boolean;
  publishLoading?: boolean;
  publishTip?: string;
  readLabel?: string;
  readDisabled?: boolean;
}>(), {
  mode: 'edit',
  previewDisabled: false,
  saveDisabled: false,
  saveLoading: false,
  publishDisabled: true,
  publishLoading: false,
  publishTip: '',
  readLabel: '',
  readDisabled: false,
});

const emit = defineEmits<{ preview: []; save: []; publish: []; read: [] }>();
const { t } = useI18n({ useScope: 'global' });

/** 吸顶判定：与 ProductLayout 的 56px 固定顶栏对齐 */
const STICKY_TOP = 56;
const root = ref<HTMLElement | null>(null);
const stuck = ref(false);
let frame = 0;

function measure() {
  frame = 0;
  const el = root.value;
  if (!el) return;
  stuck.value = el.getBoundingClientRect().top <= STICKY_TOP + 0.5;
}
function schedule() {
  if (!frame) frame = requestAnimationFrame(measure);
}
onMounted(() => {
  measure();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
});
onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame);
  window.removeEventListener('scroll', schedule);
  window.removeEventListener('resize', schedule);
});
</script>

<template>
  <header ref="root" class="version-header" :class="{ 'is-stuck': stuck }">
    <nav class="version-crumbs" :aria-label="t('versionPage.breadcrumb')">
      <router-link class="version-crumb-link" :to="parentTo">{{ parentLabel }}</router-link>
      <span class="version-crumb-sep" aria-hidden="true">/</span>
      <span class="version-crumb-current" aria-current="page">{{ currentLabel }}</span>
    </nav>
    <div class="version-actions">
      <template v-if="mode === 'edit'">
        <a-button class="app-btn-neutral" :disabled="previewDisabled" @click="emit('preview')">{{ t('versionPage.preview') }}</a-button>
        <a-button type="primary" :loading="saveLoading" :disabled="saveDisabled" @click="emit('save')">{{ t('versionPage.saveDraft') }}</a-button>
        <a-tooltip :content="publishTip">
          <span class="version-publish-wrap">
            <a-button class="app-btn-neutral" :loading="publishLoading" :disabled="publishDisabled" @click="emit('publish')">{{ t('versionPage.publish') }}</a-button>
          </span>
        </a-tooltip>
      </template>
      <a-button v-else type="primary" :disabled="readDisabled" @click="emit('read')">{{ readLabel || t('versionPage.edit') }}</a-button>
    </div>
  </header>
</template>

<style scoped>
.version-header {
  position: sticky;
  top: 56px;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 16px;
  min-width: 0;
  padding: 12px 16px;
  border-radius: 2px;
  background: var(--app-surface);
  transition: box-shadow 160ms ease;
}
/* 滚动置顶时用 Level-4 阴影分层；常态不画描边、不带阴影 */
.version-header.is-stuck { box-shadow: var(--app-shadow-4); }
.version-crumbs { display: flex; align-items: center; min-width: 0; gap: 8px; font-size: 14px; line-height: 22px; }
.version-crumb-link { color: var(--color-text-2); text-decoration: none; }
.version-crumb-link:hover, .version-crumb-link:focus-visible { color: var(--app-accent); }
.version-crumb-link:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.version-crumb-sep { color: var(--color-text-3); }
.version-crumb-current { color: var(--color-text-1); font-weight: 600; }
.version-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-left: auto; }
.version-publish-wrap { display: inline-flex; }
@media (max-width: 620px) {
  .version-actions { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .version-header { transition: none; }
}
</style>
