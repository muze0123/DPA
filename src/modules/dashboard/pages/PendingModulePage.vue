<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n({ useScope: 'global' });

defineProps<{
  /** 菜单项文案 key，由路由 props 传入 */
  labelKey: string;
}>();
</script>

<template>
  <main class="pending-module" :aria-label="t(labelKey)">
    <a-empty :description="t('pending.description')" />
  </main>
</template>

<style scoped>
.pending-module { padding: 16px; }
.pending-module :deep(.arco-empty) { padding: 96px 0; }
</style>
