<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { FormInstance, FieldRule } from '@arco-design/web-vue';
import { useLocaleStore } from '../../app/stores/locale';
import { setThemeMode, themeMode } from '../theme';
import AppPagination from '../components/AppPagination.vue';
import AppListToolbar from '../components/AppListToolbar.vue';
import AppFieldLabel from '../components/AppFieldLabel.vue';
import AppFormLayout from '../components/AppFormLayout.vue';
import AppDetailList from '../components/AppDetailList.vue';
import ConfirmDialog from '../../shared/components/ConfirmDialog.vue';

const { t } = useI18n();
const localeStore = useLocaleStore();
const keyword = ref('');
const page = ref(1);
const pageSize = ref(5);
const state = ref('ready');
const records = Array.from({ length: 18 }, (_, index) => ({ id: `DS-${String(index + 1).padStart(3, '0')}`, name: `Metritag ${index + 1}` }));
const filtered = computed(() => state.value === 'empty' ? [] : records.filter(row => row.name.toLowerCase().includes(keyword.value.toLowerCase())));
const rows = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
const editOpen = ref(false);
const confirmOpen = ref(false);
let resolveNavigation: ((allowed: boolean) => void) | undefined;
function settleNavigation(allowed: boolean) {
  resolveNavigation?.(allowed);
  resolveNavigation = undefined;
}
function setConfirmationVisible(visible: boolean) {
  confirmOpen.value = visible;
  if (!visible) settleNavigation(false);
}
onBeforeRouteLeave(() => {
  if (!editOpen.value || model.name === initial.value) return true;
  settleNavigation(false);
  confirmOpen.value = true;
  return new Promise<boolean>(resolve => { resolveNavigation = resolve; });
});
onBeforeUnmount(() => settleNavigation(false));
const form = ref<FormInstance>();
const model = reactive({ name: '' });
const nameRules = computed<FieldRule[]>(() => [{ required: true, message: t('designSystem.required') }, { validator: (value, callback) => callback(String(value ?? '').trim() ? undefined : t('designSystem.required')) }] );
const initial = ref('');
const saved = ref('Metritag');
const feedback = ref(false);
const saving = ref(false);
function edit() { initial.value = saved.value; model.name = saved.value; feedback.value = false; editOpen.value = true; }
function closeEdit() {
  if (saving.value) return;
  if (model.name !== initial.value) confirmOpen.value = true;
  else editOpen.value = false;
}
function discard() { confirmOpen.value = false; editOpen.value = false; settleNavigation(true); }
async function save() {
  if (saving.value) return;
  const errors = await form.value?.validate();
  if (errors) return;
  saving.value = true;
  try {
    await new Promise(resolve => window.setTimeout(resolve, 250));
    saved.value = model.name.trim();
    feedback.value = true;
    editOpen.value = false;
  } finally { saving.value = false; }
}
</script>

<template>
  <main class="mt-patterns">
    <div class="mt-patterns__controls">
      <a-button @click="localeStore.toggleLocale()">{{ t('designSystem.language') }}</a-button>
      <a-button @click="setThemeMode(themeMode === 'light' ? 'dark' : 'light')">{{ t('designSystem.theme') }}</a-button>
      <a-radio-group v-model="state" :aria-label="t('designSystem.state')" @change="page = 1">
        <a-radio v-for="code in ['ready', 'empty', 'loading', 'error']" :key="code" :value="code">{{ t(`designSystem.states.${code}`) }}</a-radio>
      </a-radio-group>
    </div>
    <form class="mt-patterns__surface mt-patterns__filter" @submit.prevent="page = 1">
      <AppFieldLabel as="label" for="ds-keyword" :text="t('designSystem.keyword')" context="filter" />
      <a-input :input-attrs="{ id: 'ds-keyword', 'aria-label': t('designSystem.keyword') }" v-model="keyword" allow-clear @input="page = 1" />
      <a-button html-type="submit" type="primary">{{ t('designSystem.search') }}</a-button>
      <a-button @click="keyword = ''; page = 1">{{ t('designSystem.reset') }}</a-button>
    </form>
    <section class="mt-patterns__surface" :aria-label="t('designSystem.list')">
      <AppListToolbar :title="t('designSystem.list')" :summary="t('designSystem.total', { count: filtered.length })">
        <template #actions><a-button type="primary" @click="edit">{{ t('designSystem.edit') }}</a-button></template>
      </AppListToolbar>
      <a-alert v-if="state === 'error'" type="error" :title="t('designSystem.error')">
        <template #action><a-button @click="state = 'ready'">{{ t('designSystem.retry') }}</a-button></template>
      </a-alert>
      <a-table v-else :data="rows" row-key="id" :loading="state === 'loading'" :pagination="false" :bordered="false" :scroll="{ x: 480 }">
        <template #columns>
          <a-table-column data-index="id" :title="t('designSystem.id')" />
          <a-table-column data-index="name" :title="t('designSystem.name')" />
        </template>
        <template #empty><a-empty :description="keyword ? t('designSystem.noMatch') : t('designSystem.empty')" /></template>
      </a-table>
      <AppPagination v-model:current="page" v-model:page-size="pageSize" :total="filtered.length" :page-sizes="[5, 10, 20]" />
    </section>
    <section class="mt-patterns__surface" :aria-label="t('designSystem.detail')">
      <AppDetailList :fields="[{ key: 'name', label: t('designSystem.name'), value: saved }]" />
      <p v-if="feedback" role="status">{{ t('designSystem.saved') }}</p>
    </section>
    <a-drawer class="mt-pattern-editor" :visible="editOpen" :title="t('designSystem.edit')" :width="'min(800px, 100vw)'" :mask-closable="!saving" :esc-to-close="!saving" @cancel="closeEdit">
      <AppFormLayout>
        <a-form ref="form" :model="model" layout="vertical" scroll-to-first-error @submit-success="save">
          <a-form-item field="name" :rules="nameRules" required>
            <template #label><AppFieldLabel :text="t('designSystem.name')" /></template>
            <a-input v-model="model.name" :input-attrs="{ 'aria-label': t('designSystem.name') }" :max-length="60" />
          </a-form-item>
        </a-form>
      </AppFormLayout>
      <template #footer>
        <a-button :disabled="saving" @click="closeEdit">{{ t('designSystem.cancel') }}</a-button>
        <a-button type="primary" :loading="saving" @click="save">{{ t('designSystem.save') }}</a-button>
      </template>
    </a-drawer>
    <ConfirmDialog :visible="confirmOpen" @update:visible="setConfirmationVisible" :title="t('designSystem.discard')" @confirm="discard" />
  </main>
</template>

<style scoped>
.mt-patterns { display: flex; flex-direction: column; gap: var(--mt-ds-space-4); min-width: 0; }
.mt-patterns__surface { padding: var(--mt-ds-space-4); background: var(--mt-ds-surface); border-radius: var(--mt-ds-control-radius); min-width: 0; }
.mt-patterns__controls, .mt-patterns__filter { display: flex; flex-wrap: wrap; align-items: center; gap: var(--mt-ds-space-2); }
.mt-patterns__filter :deep(.arco-input-wrapper) { width: var(--mt-ds-filter-width); max-width: 100%; }
.mt-patterns :deep(.arco-table-th), .mt-patterns :deep(.arco-table-td) { font-weight: var(--mt-ds-weight-body); }
</style>
