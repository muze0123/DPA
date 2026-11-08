<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconLeft, IconRight } from '@arco-design/web-vue/es/icon';
const props = withDefaults(defineProps<{ current: number; pageSize: number; total: number; pageSizes?: number[] }>(), { pageSizes: () => [10, 20, 50, 100, 200] });
const emit = defineEmits<{ 'update:current': [value: number]; 'update:pageSize': [value: number] }>();
const { t } = useI18n();
const jumpId = useId();
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const jump = ref(props.current);
const numbers = computed(() => {
  const first = Math.max(1, Math.min(props.current - 2, pages.value - 4));
  return Array.from({ length: Math.min(5, pages.value) }, (_, index) => first + index);
});
watch(() => props.current, value => { jump.value = value; });
function setPage(value: number) {
  emit('update:current', Math.min(pages.value, Math.max(1, Math.trunc(value) || 1)));
}
function setSize(value: unknown) {
  if (typeof value !== 'number' || !props.pageSizes.includes(value)) return;
  emit('update:pageSize', value);
  emit('update:current', 1);
}
</script>

<template>
  <nav class="mt-pagination app-pagination" :aria-label="t('designSystem.pagination.navigation')">
    <span class="mt-pagination__total">{{ t('designSystem.total', { count: total }) }}</span>
    <label class="mt-pagination__size">
      <span class="mt-pagination__accessible">{{ t('designSystem.pagination.size') }}</span>
      <a-select :model-value="pageSize" class="app-page-size" @change="setSize">
        <a-option v-for="size in pageSizes" :key="size" :value="size">{{ t('designSystem.pagination.perPage', { count: size }) }}</a-option>
      </a-select>
    </label>
    <button class="pagination-arrow" type="button" :disabled="current <= 1" :aria-label="t('designSystem.pagination.previous')" @click="setPage(current - 1)"><IconLeft /></button>
    <button v-for="number in numbers" :key="number" class="pagination-number" :class="{ active: current === number }" type="button" :aria-current="current === number ? 'page' : undefined" @click="setPage(number)">{{ number }}</button>
    <button class="pagination-arrow" type="button" :disabled="current >= pages" :aria-label="t('designSystem.pagination.next')" @click="setPage(current + 1)"><IconRight /></button>
    <label :for="jumpId">{{ t('designSystem.pagination.jump') }}</label>
    <a-input :model-value="String(jump)" class="mt-pagination__jump app-page-jump" :input-attrs="{ id: jumpId, inputmode: 'numeric', 'aria-label': t('designSystem.pagination.jump') }" @input="jump = Number($event)" @press-enter="setPage(jump)" />
    <span>{{ t('designSystem.pagination.pages', { count: pages }) }}</span>
  </nav>
</template>

<style scoped>
.mt-pagination { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: var(--mt-ds-space-2); margin-top: var(--mt-ds-space-4); font-size: var(--mt-ds-font-body); color: var(--mt-ds-text-secondary); }
.mt-pagination__total { margin-right: var(--mt-ds-space-2); }
.mt-pagination__size { display: inline-flex; width: 132px; }
.mt-pagination :deep(.mt-pagination__jump) { width: 72px; }
.mt-pagination__accessible { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.mt-pagination button { font-weight: var(--mt-ds-weight-body); }
</style>
