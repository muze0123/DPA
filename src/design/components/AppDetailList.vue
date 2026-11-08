<script setup lang="ts">
import AppFieldLabel from './AppFieldLabel.vue';
defineProps<{ fields: readonly { key: string; label: string; value: string }[] }>();
</script>

<template>
  <dl class="mt-detail-list">
    <div v-for="field in fields" :key="field.key" class="mt-detail-list__row">
      <dt><AppFieldLabel :text="field.label" context="detail" /></dt>
      <dd>{{ field.value }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.mt-detail-list { display: grid; gap: var(--mt-ds-detail-row-gap); margin: 0; }
.mt-detail-list__row { display: grid; grid-template-columns: minmax(var(--mt-ds-detail-label-width), max-content) minmax(0, 1fr); gap: var(--mt-ds-space-4); }
.mt-detail-list dt, .mt-detail-list dd { margin: 0; font-size: var(--mt-ds-font-body); font-weight: var(--mt-ds-weight-body); line-height: var(--mt-ds-line-body); overflow-wrap: anywhere; }
.mt-detail-list dd { color: var(--mt-ds-text); }
@media (max-width: 480px) { .mt-detail-list__row { grid-template-columns: 1fr; gap: var(--mt-ds-space-1); } }
</style>
