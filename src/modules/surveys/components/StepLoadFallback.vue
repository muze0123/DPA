<script setup lang="ts">
/**
 * 步骤 7「完成度与收集」的异步加载兜底（2026-10-27 修复空白）。
 *
 * 该步骤按需加载图表库，首次进入需下载对应 chunk。加载期间与加载失败时
 * 若没有占位，内容区会静默空白，用户只能看到进度条以下的一片白，无法判断
 * 是加载慢、数据为空还是出错。这里统一给出「加载中」与「加载失败 + 重新加载」两态。
 */
import { useI18n } from 'vue-i18n';

defineProps<{ error?: unknown }>();

const { t } = useI18n();

function reload() {
  window.location.reload();
}
</script>

<template>
  <section
    class="step-fallback"
    :aria-label="error ? t('surveys.workspace.stepLoadError') : t('surveys.workspace.stepLoading')"
    data-testid="step-fallback"
  >
    <a-spin v-if="!error" :tip="t('surveys.workspace.stepLoading')" />
    <div v-else class="step-fallback-error" role="alert">
      <p class="step-fallback-text">{{ t('surveys.workspace.stepLoadError') }}</p>
      <a-button class="app-btn-neutral" @click="reload">{{ t('surveys.workspace.stepReload') }}</a-button>
    </div>
  </section>
</template>

<style scoped>
.step-fallback { display: grid; place-items: center; min-height: 240px; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.step-fallback-error { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.step-fallback-text { margin: 0; color: var(--color-text-2); font-size: 14px; line-height: 22px; }
</style>
