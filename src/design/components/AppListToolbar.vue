<script setup lang="ts">
defineProps<{ title: string; summary?: string }>();
</script>

<template>
  <div class="mt-list-toolbar">
    <h2 class="mt-list-toolbar__title">{{ title }}</h2>
    <span v-if="summary" class="mt-list-toolbar__summary" role="status">{{ summary }}</span>
    <div v-if="$slots.actions" class="mt-list-toolbar__actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
.mt-list-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--mt-ds-space-3); margin-bottom: var(--mt-ds-space-4); min-width: 0; }
.mt-list-toolbar__title { margin: 0; font-size: var(--mt-ds-font-title); line-height: var(--mt-ds-line-title); font-weight: var(--mt-ds-weight-title); overflow-wrap: anywhere; }
.mt-list-toolbar__summary { color: var(--mt-ds-text-muted); font-size: var(--mt-ds-font-caption); line-height: var(--mt-ds-line-caption); font-variant-numeric: tabular-nums; }
.mt-list-toolbar__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--mt-ds-space-2); margin-left: auto; min-width: 0; }
</style>
