<script setup lang="ts">
import { computed } from 'vue';
import profile from '../project.json';
const props = withDefaults(defineProps<{
  text: string;
  for?: string;
  as?: 'label' | 'span';
  context?: 'editable' | 'filter' | 'detail';
}>(), { as: 'span', context: 'editable' });
const hasColon = computed(() => ({ editable: profile.editableLabelColon, filter: profile.filterLabelColon, detail: profile.detailLabelColon })[props.context]);
</script>

<template>
  <component :is="as" :for="as === 'label' ? props.for : undefined" class="mt-field-label" :class="{ 'mt-field-label--colon': hasColon }">{{ text }}</component>
</template>

<style scoped>
.mt-field-label { color: var(--mt-ds-text-secondary); font-size: var(--mt-ds-font-body); font-weight: var(--mt-ds-weight-body); line-height: var(--mt-ds-line-body); }
.mt-field-label--colon::after { content: var(--mt-ds-field-colon); }
</style>
