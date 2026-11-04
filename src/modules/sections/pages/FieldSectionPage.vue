<script setup lang="ts">
/**
 * 分区填写页（生物特征与口令 / 匿名化）。与既有 Consents/Sensors/Transmission 页
 * 同一形态：按问卷选择 → 字段表单 → 失焦/防抖即存，只读阶段禁用。
 *
 * 与既有页的差别：字段四态着色走真实 C1–C7 引擎（sectionProgress.fieldShade），
 * 灰格禁用并说明原因，黄格计入完成度。
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { Message } from '@arco-design/web-vue';
import { IconCheck, IconInfoCircle, IconSave } from '@arco-design/web-vue/es/icon';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { surveyRecords } from '../../surveys/data/surveys';
import { ensureSurveyMatching } from '../../surveys/data/matching';
import { useSurveyLabels } from '../../surveys/labels';
import { fieldsOf, type CatalogField, type SectionKey } from '../data/sectionCatalog';
import { runtimeFieldsOf } from '../data/sectionRuntime';
import {
  driversOfField, fieldDriverMap, fieldShade, readSectionValues, type FieldShade,
} from '../data/sectionProgress';
import { loadSectionValues, saveSectionValues } from '../data/sectionValues';

const props = defineProps<{ section: SectionKey }>();

const { t } = useI18n({ useScope: 'global' });
const { statusLabel } = useSurveyLabels();
const route = useRoute();
const router = useRouter();

/** 分区字段 = 该分区已发布表单的字段（2026-11-01 接线，无表单时回退字段目录） */
const fields = computed(() => runtimeFieldsOf(props.section));

/** 字段标签：目录字段位走 i18n，表单新增字段直接用表单里的名称 */
function labelOf(field: CatalogField): string {
  return fieldsOf(props.section).some((item) => item.code === field.code)
    ? t(`sections.field.fields.${props.section}.${field.code}`)
    : field.labelZh;
}

/** 可进入分区填写的问卷（只读阶段也允许查看）：匹配审批通过即进入分区填写中 */
const availableSurveys = computed(() => surveyRecords.filter((record) => (
  ['section-filling', 'section-reviewing', 'archived'].includes(record.status)
)));

const selectedId = computed(() => {
  const requested = typeof route.query.survey === 'string' ? route.query.survey : '';
  if (requested) return availableSurveys.value.find((record) => record.id === requested)?.id ?? '';
  return availableSurveys.value.find((record) => record.status === 'section-filling')?.id
    ?? availableSurveys.value[0]?.id ?? '';
});
const current = computed(() => availableSurveys.value.find((record) => record.id === selectedId.value));
const editable = computed(() => current.value?.status === 'section-filling');

const values = reactive<Record<string, string>>({});
const saveState = ref<'idle' | 'saved' | 'error'>('idle');
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persist(id = selectedId.value, canEdit = editable.value) {
  if (!id || !canEdit) return;
  try {
    saveSectionValues(props.section, id, values);
    saveState.value = 'saved';
  } catch {
    saveState.value = 'error';
  }
}

function scheduleSave() {
  saveState.value = 'idle';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = undefined; persist(); }, 500);
}

watch(selectedId, (id, previousId) => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    if (previousId) persist(previousId, true);
  }
  for (const key of Object.keys(values)) delete values[key];
  // 字段值以本分区存储为准；着色前先懒补算条款匹配快照（无快照会按 C6 全判灰）
  if (id) {
    const record = surveyRecords.find((item) => item.id === id);
    if (record) ensureSurveyMatching(record);
    Object.assign(values, { ...readSectionValues(id)[props.section], ...loadSectionValues(props.section, id) });
  }
  saveState.value = 'idle';
}, { immediate: true });

onBeforeUnmount(() => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    persist();
  }
});

function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  persist();
  if (saveState.value === 'saved') Message.info(t('consent.feedback.localSaved'));
  else Message.error(t('consent.feedback.saveFailed'));
}

function changeSurvey(id: string | number | boolean | Record<string, unknown> | unknown[]) {
  if (typeof id === 'string') void router.push({ query: { ...route.query, survey: id } });
}

/** 驱动条款映射（规则配置 → 页面字段位，2026-11-01 接线） */
const driverMap = computed(() => (current.value ? fieldDriverMap(current.value) : null));

function driversOf(field: CatalogField | undefined): string[] {
  return field ? driversOfField(field, driverMap.value) : [];
}

function shadeOf(code: string): FieldShade {
  const field = fields.value.find((item) => item.code === code);
  if (!field) return 'plain';
  return fieldShade(field, values[code], current.value?.matching, driverMap.value);
}

const counts = computed(() => {
  const result = { participating: 0, filled: 0, pending: 0, gray: 0, plain: 0 };
  for (const field of fields.value) {
    const shade = shadeOf(field.code);
    if (shade === 'plain') result.plain += 1;
    else if (shade === 'gray') result.gray += 1;
    else {
      result.participating += 1;
      if (shade === 'white') result.filled += 1;
      else result.pending += 1;
    }
  }
  return result;
});

function shadeLabel(shade: FieldShade): string {
  return t(`sections.field.shade.${shade}`);
}
function shadeColor(shade: FieldShade): string {
  return shade === 'yellow' ? 'orange' : shade === 'white' ? 'green' : shade === 'gray' ? 'gray' : 'arcoblue';
}
</script>

<template>
  <div class="section-page">
    <div class="section-toolbar">
      <div class="survey-picker">
        <label for="section-survey">{{ t('sections.field.survey') }}</label>
        <a-select id="section-survey" :model-value="selectedId" :aria-label="t('sections.field.survey')" allow-search @change="changeSurvey">
          <a-option v-for="record in availableSurveys" :key="record.id" :value="record.id">
            {{ record.id }} · {{ record.functionName }}
          </a-option>
        </a-select>
      </div>
      <div v-if="current" class="survey-context">
        <span>{{ current.fuliId }}</span>
        <a-tag :color="editable ? 'arcoblue' : 'gray'">{{ statusLabel(current.status) }}</a-tag>
        <span>{{ t(`sections.field.title.${section}`) }}</span>
      </div>
      <a-button v-if="editable" class="app-btn-neutral" @click="saveNow">
        <template #icon><IconSave /></template>{{ t('consent.save') }}
      </a-button>
    </div>

    <template v-if="current">
      <div class="section-overview" :aria-label="t('sections.field.overview')">
        <div><strong>{{ counts.filled }} / {{ counts.participating }}</strong><span>{{ t('consent.filled') }}</span></div>
        <div><strong>{{ counts.pending }}</strong><span>{{ t('consent.pendingCount') }}</span></div>
        <div><strong>{{ counts.gray }}</strong><span>{{ t('consent.inapplicableCount') }}</span></div>
        <p>{{ t(editable ? 'consent.editableHint' : 'consent.readonlyHint') }}</p>
      </div>

      <section class="section-body" :aria-label="t(`sections.field.title.${section}`)">
        <div class="field-legend">
          <span class="legend-yellow">{{ t('sections.field.shade.yellow') }}</span>
          <span class="legend-white">{{ t('sections.field.shade.white') }}</span>
          <span class="legend-gray">{{ t('sections.field.shade.gray') }}</span>
          <span class="legend-plain">{{ t('sections.field.shade.plain') }}</span>
        </div>

        <div class="field-list">
          <div v-for="field in fields" :key="field.code" class="field-row" :class="`field-${shadeOf(field.code)}`">
            <div class="field-meta">
              <span class="field-code">{{ field.code }}</span>
              <label :for="`${section}-${field.code}`">{{ labelOf(field) }}</label>
              <a-tag :color="shadeColor(shadeOf(field.code))">{{ shadeLabel(shadeOf(field.code)) }}</a-tag>
              <span v-if="driversOf(field).length" class="field-drivers">
                <span v-for="no in driversOf(field)" :key="no" class="driver-chip">{{ no }}</span>
              </span>
            </div>
            <div class="field-entry">
              <a-textarea v-if="field.kind === 'long'" :id="`${section}-${field.code}`" v-model="values[field.code]"
                :aria-label="labelOf(field)" :placeholder="t('consent.input')"
                :max-length="500" :auto-size="{ minRows: 2, maxRows: 4 }"
                :disabled="!editable || shadeOf(field.code) === 'gray'"
                @input="scheduleSave" />
              <a-select v-else-if="field.kind === 'boolean'" :id="`${section}-${field.code}`" v-model="values[field.code]"
                :aria-label="labelOf(field)" :placeholder="t('consent.select')" allow-clear
                :disabled="!editable || shadeOf(field.code) === 'gray'"
                @change="scheduleSave">
                <a-option value="yes">{{ t('consent.answers.yes') }}</a-option>
                <a-option value="no">{{ t('consent.answers.no') }}</a-option>
                <a-option value="pending">{{ t('consent.answers.pending') }}</a-option>
              </a-select>
              <a-input v-else :id="`${section}-${field.code}`" v-model="values[field.code]"
                :aria-label="labelOf(field)" :placeholder="t('consent.input')"
                :max-length="500"
                :disabled="!editable || shadeOf(field.code) === 'gray'"
                @input="scheduleSave" />
              <p v-if="shadeOf(field.code) === 'gray'" class="field-explanation">
                <IconInfoCircle /> {{ t('sections.field.grayReason') }}
              </p>
              <p v-else-if="shadeOf(field.code) === 'plain'" class="field-explanation">
                <IconInfoCircle /> {{ t('sections.field.plainReason') }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div class="section-footer">
        <span role="status" :class="{ 'save-error': saveState === 'error' }">
          <IconCheck v-if="saveState === 'saved'" />{{ t(`consent.saveState.${saveState}`) }}
        </span>
        <router-link v-if="current" class="back-link" :to="{ name: 'survey-detail-steps', params: { id: current.id, step: '4' } }">
          {{ t('sections.field.backToWorkspace') }}
        </router-link>
      </div>
    </template>
    <a-empty v-else :description="t('consent.noSurvey')" />
  </div>
</template>

<style scoped>
.section-page { min-height: calc(100dvh - 88px); background: var(--app-surface); color: var(--color-text-1); }
.section-toolbar { display: flex; flex-wrap: wrap; align-items: end; gap: 12px 20px; padding: 20px 24px; border-bottom: 1px solid var(--app-divider); }
.survey-picker { display: flex; flex-direction: column; gap: 8px; min-width: min(100%, 320px); }
.survey-picker label { font-size: 14px; font-weight: 600; }
.survey-picker :deep(.arco-select-view) { min-height: 36px; }
.survey-context { display: flex; flex: 1; align-items: center; flex-wrap: wrap; gap: 12px; min-height: 36px; color: var(--color-text-2); font-size: 13px; }
.section-overview { display: flex; align-items: center; flex-wrap: wrap; gap: 16px 32px; padding: 20px 24px; border-bottom: 1px solid var(--app-divider); }
.section-overview > div { display: flex; align-items: baseline; gap: 8px; }
.section-overview strong { font-size: 20px; line-height: 28px; font-variant-numeric: tabular-nums; }
.section-overview span, .section-overview p { color: var(--color-text-2); font-size: 13px; }
.section-overview p { margin: 0 0 0 auto; max-width: 460px; line-height: 20px; }
.section-body { padding: 20px 24px 32px; }
.field-legend { display: flex; flex-wrap: wrap; gap: 8px 16px; padding: 0 0 12px; color: var(--color-text-3); font-size: 12px; }
.field-legend span::before { content: ''; display: inline-block; width: 8px; height: 8px; margin-right: 6px; border: 1px solid currentColor; border-radius: 2px; }
.legend-yellow { color: var(--app-color-warning); }
.legend-white { color: var(--app-color-primary); }
.legend-gray { color: var(--color-text-3); }
.legend-plain { color: var(--color-text-4); }
.field-row { display: grid; grid-template-columns: minmax(200px, 0.9fr) minmax(220px, 1fr); gap: 16px 24px; padding: 16px 12px; border-bottom: 1px solid var(--app-divider); background: var(--app-surface); }
.field-row:hover { background: var(--color-fill-1); }
.field-row.field-yellow { border-left: 3px solid var(--app-color-warning); padding-left: 12px; background: rgb(var(--gold-1)); }
.field-row.field-gray { border-left: 3px solid var(--color-text-3); padding-left: 12px; background: var(--color-fill-2); }
.field-row.field-plain { padding-left: 15px; }
.field-meta { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 8px; }
.field-meta label { flex: 1; min-width: 140px; font-weight: 600; font-size: 14px; line-height: 22px; }
.field-code { color: var(--color-text-3); font-size: 12px; line-height: 22px; font-variant-numeric: tabular-nums; }
.field-drivers { display: flex; gap: 4px; }
.driver-chip { padding: 0 6px; border-radius: 2px; background: var(--color-fill-2); color: var(--color-text-2); font-size: 12px; line-height: 20px; font-variant-numeric: tabular-nums; }
.field-entry { min-width: 0; }
.field-entry :deep(.arco-select-view), .field-entry :deep(.arco-input-wrapper), .field-entry :deep(.arco-textarea-wrapper) { width: 100%; }
.field-explanation { display: flex; gap: 6px; margin: 6px 0 0; color: var(--color-text-3); font-size: 12px; line-height: 18px; }
.section-footer { display: flex; align-items: center; justify-content: flex-end; gap: 20px; min-height: 64px; padding: 12px 24px; border-top: 1px solid var(--app-divider); }
.section-footer span { display: flex; align-items: center; gap: 6px; color: var(--color-text-3); font-size: 12px; }
.section-footer .save-error { color: var(--app-color-danger); }
.back-link { color: var(--app-color-primary); font-size: 13px; text-decoration: none; }
.back-link:hover, .back-link:focus-visible { text-decoration: underline; }
@media (max-width: 900px) { .field-row { grid-template-columns: 1fr; gap: 8px; } }
</style>
