<script setup lang="ts">
/**
 * 问卷工作区 · 步骤 4「填写分区」（05 方案 §4 + 状态机 §8.2 决策表 C1–C7）。
 *
 * 分区字段直接在工作区填写（六个条款驱动分区 + 通用材料）。旧任务数据作为只读初值，
 * 详情页按问卷保存本地草稿；通用材料为功能级资料库，按 FuLi ID 落库。
 * 完成度、提交门禁与导出均从同一份 sectionProgress 投影读取。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { useI18n } from 'vue-i18n';
import { referenceVersion } from '../../sections/data/basicInfoVersions';
import { ENCRYPTION_CODES, OVERSEAS_CODES } from '../../sections/data/transmission';
import { PRECISION_ANSWERS, SENSOR_TYPES } from '../../sections/data/sensors';
import { saveInlineSectionDraft } from '../../sections/data/inlineSectionDraft';
import { saveSectionValues } from '../../sections/data/sectionValues';
import { saveMaterialValues } from '../../sections/data/materials';
import { ANONYMIZATION_ANSWER_OPTIONS, ANONYMIZATION_METHOD_OPTIONS } from '../../sections/data/anonymization';
import { SECTION_DEFS, BIOMETRIC_TYPE_CODES, type CatalogField, type SectionKey } from '../../sections/data/sectionCatalog';
import { runtimeFieldsOf } from '../../sections/data/sectionRuntime';
import { readSectionNote, saveSectionNote } from '../../sections/data/sectionNote';
import {
  checkSectionGate, completionRate, diffShadeSnapshot, driversOfField, fieldDriverMap, fieldShade,
  readSectionValues, sectionOverview, submitSectionFilling, type SectionGap,
} from '../../sections/data/sectionProgress';
import { buildSectionFillWorkbook, exportFileName, toBlob } from '../data/exportWorkbooks';
import { ensureSurveyMatching } from '../data/matching';
import { finalApplicability } from '../data/matching';
import { MOCK_CURRENT_USER, type SurveyRecord } from '../data/surveys';
import { useTaskCenterStore } from '../../task-center/stores/taskCenter';
import { auditRecords } from '../../audit/data/audit';

const props = defineProps<{ record: SurveyRecord; functionDescription?: string }>();
const { t, locale } = useI18n();
const taskCenter = useTaskCenterStore();

/** 填写可写阶段：匹配审批通过即进入分区填写中，无额外「开始填写」动作 */
const editable = computed(() => props.record.status === 'section-filling');

const values = reactive(readSectionValues(props.record.id));
const dirtySections = new Set<SectionKey>();
const saveState = ref<'idle' | 'saved' | 'error'>('idle');
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const refreshKey = ref(0);
/** 驱动条款映射（规则配置 → 分区字段位，2026-11-01 接线）：创建快照冻结优先，缺失回退现行规则 */
const driverMap = computed(() => fieldDriverMap(props.record));
const overview = computed(() => {
  void refreshKey.value;
  return sectionOverview(props.record.id, props.record.matching, values, driverMap.value);
});
const rate = computed(() => completionRate(overview.value));

/** 分区字段 = 该分区已发布表单的字段（2026-11-01 接线，无表单时回退字段目录） */
function fields(key: SectionKey): CatalogField[] {
  return runtimeFieldsOf(key);
}

/** 字段的驱动条款（规则映射优先，术语同「填写分区」页签展示） */
function driversOf(field: CatalogField): string[] {
  return driversOfField(field, driverMap.value);
}

function shade(field: CatalogField) {
  return fieldShade(field, values[field.section][field.code], props.record.matching, driverMap.value);
}

function fieldDisabled(field: CatalogField): boolean {
  return !editable.value || !field.carried || (field.section === 'basicInfo' && field.code === 'C') || shade(field) === 'gray';
}

function fieldValue(field: CatalogField): string {
  if (field.section === 'basicInfo' && field.code === 'C') {
    return props.record.creationSnapshot?.function?.functionDescription
      || props.functionDescription || values.basicInfo.C || '';
  }
  return values[field.section][field.code] ?? '';
}

function options(field: CatalogField): { value: string; label: string }[] {
  const choices = field.section === 'basicInfo'
    ? (referenceVersion.fields.find((item) => item.column === field.code)?.options ?? []).map((item) => ({
      value: field.code === 'D' ? item.code : item.workbookValue,
      label: locale.value === 'zh-CN' ? item.labelZh : item.labelEn,
    }))
    : field.section === 'transmission' && field.code === 'C'
      ? ENCRYPTION_CODES.map((code) => ({ value: code, label: t(`transmission.encryption.${code}`) }))
      : field.section === 'transmission' && field.code === 'D'
        ? OVERSEAS_CODES.map((code) => ({ value: code, label: t(`transmission.overseas.${code}`) }))
        : field.section === 'sensors' && field.code === 'D'
          ? SENSOR_TYPES.map((code) => ({ value: code, label: t(`sensors.types.${code}`) }))
          : field.section === 'sensors' && field.code === 'E'
            ? PRECISION_ANSWERS.map((code) => ({ value: code, label: t(`sensors.precision.${code}`) }))
            : field.section === 'biometric' && field.code === 'C'
              ? BIOMETRIC_TYPE_CODES.map((code) => ({ value: code, label: t(`biometric.types.${code}`) }))
              // 匿名化：D 为匿名化方式（删除画面/降低分辨率/局部轮廓化/其他），C/E/G 为「是/否」
              : field.section === 'anonymization' && field.code === 'D'
                ? ANONYMIZATION_METHOD_OPTIONS.map((item) => ({
                  value: item.code, label: locale.value === 'zh-CN' ? item.labelZh : item.labelEn,
                }))
                : field.section === 'anonymization'
                  ? ANONYMIZATION_ANSWER_OPTIONS.map((item) => ({
                    value: item.code, label: locale.value === 'zh-CN' ? item.labelZh : item.labelEn,
                  }))
                  : [];
  const current = fieldValue(field);
  // 表单设计里新增的字段没有硬编码选项域：回退到表单配置的选项文案（2026-11-01 接线）
  const resolved = choices.length
    ? choices
    : (field.formOptions ?? []).map((label) => ({ value: label, label }));
  return current && !resolved.some((choice) => choice.value === current)
    ? [{ value: current, label: current }, ...resolved] : resolved;
}

function persist(): boolean {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  if (!dirtySections.size && !noteDirty.value) return saveState.value !== 'error';
  try {
    if (noteDirty.value) {
      saveSectionNote(props.record.id, note.value);
      noteDirty.value = false;
    }
    for (const section of dirtySections) {
      if (section === 'materials') {
        // 通用材料是功能级资料库（跨问卷共用），按 FuLi ID 落库，不写问卷级草稿
        saveMaterialValues(props.record.fuliId, values.materials);
      } else if (section === 'biometric' || section === 'anonymization') {
        saveSectionValues(section, props.record.id, values[section]);
      } else {
        saveInlineSectionDraft(section, props.record.id, values[section]);
      }
      dirtySections.delete(section);
    }
    saveState.value = 'saved';
    refreshKey.value += 1;
    return true;
  } catch {
    saveState.value = 'error';
    return false;
  }
}

function scheduleSave(section: SectionKey) {
  if (!editable.value) return;
  dirtySections.add(section);
  saveState.value = 'idle';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 500);
}

/* ------------------------------------------------------------ 整体备注（不参与着色与统计） */

const note = ref(readSectionNote(props.record.id));
const noteDirty = ref(false);

function scheduleNote() {
  if (!editable.value) return;
  noteDirty.value = true;
  saveState.value = 'idle';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 500);
}

onBeforeUnmount(() => { if (saveTimer) persist(); });

/** 改答后着色变化横幅（05 §4.3）：与上次进入页面的快照比较 */
const shadeDiff = ref({ grayToYellow: 0, yellowToGray: 0 });
onMounted(() => {
  // 懒补算条款匹配快照：无快照时字段会按 C6 判未判定（灰），会误伤着色与完成度
  ensureSurveyMatching(props.record);
  shadeDiff.value = diffShadeSnapshot(props.record);
  refreshKey.value += 1;
});

function sectionTitle(key: SectionKey): string {
  return t(`surveys.workspace.stepSections.sections.${key}`);
}

function driverLabel(no: string): string {
  const status = props.record.matching ? finalApplicability(props.record.matching, no) : 'pending-review';
  return `${no} (${t(`surveys.workspace.matching.final.${status}`)})`;
}

function sectionState(key: SectionKey): string {
  const progress = overview.value.sections.find((item) => item.key === key);
  if (!progress) return 'none';
  if (progress.participating === 0) return 'empty';
  if (progress.pending === 0 && progress.filled > 0) return 'done';
  if (progress.filled === 0 && progress.pending === 0) return 'none';
  return 'filling';
}

/* ------------------------------------------------------------ 提交门禁 */

const gateOpen = ref(false);
const gaps = ref<SectionGap[]>([]);
const submitting = ref(false);

function requestSubmit() {
  if (!persist()) {
    Message.error(t('surveys.workspace.stepSections.saveError'));
    return;
  }
  const result = checkSectionGate(props.record);
  if (result.ok) {
    gaps.value = [];
    gateOpen.value = true;
    return;
  }
  gaps.value = result.gaps;
  gateOpen.value = true;
  Message.error(t('surveys.workspace.stepSections.submitBlocked', { count: result.pending }));
}

async function confirmSubmit() {
  if (submitting.value) return;
  if (gaps.value.length) return;
  if (!persist()) {
    Message.error(t('surveys.workspace.stepSections.saveError'));
    return;
  }
  submitting.value = true;
  try {
    const result = await submitSectionFilling(props.record.id);
    gateOpen.value = false;
    if (result.ok) {
      Message.success(t('surveys.workspace.stepSections.submitSuccess'));
      refreshKey.value += 1;
    } else {
      gaps.value = result.gaps;
      Message.error(t('surveys.workspace.stepSections.submitBlocked', { count: result.pending }));
    }
  } catch {
    Message.error(t('surveys.messages.storageError'));
  } finally {
    submitting.value = false;
  }
}

/* ------------------------------------------------------------ 导出填写分区（任务中心 + 审计） */

const exporting = ref(false);

function clockText(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function stampText(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function exportSections() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    if (!persist()) Message.error(t('surveys.workspace.stepSections.saveError'));
    const workbook = await buildSectionFillWorkbook(props.record);
    const blob = await toBlob(workbook);
    const name = exportFileName(props.record, 'sections');
    const now = new Date();
    taskCenter.addDownloadTask({
      id: `dl-${now.getTime()}`,
      module: 'surveys',
      fileStamp: stampText(now),
      operator: MOCK_CURRENT_USER.name,
      time: clockText(now),
      status: 'processing',
      progress: 100,
      fileUrl: URL.createObjectURL(blob),
      fileName: name,
    });
    auditRecords.unshift({
      id: `AUD-2026-${String(9000 + auditRecords.length).padStart(4, '0')}`,
      time: clockText(now),
      actor: MOCK_CURRENT_USER.name,
      role: 'officer',
      actionType: 'export',
      module: 'section',
      targetType: t('surveys.workspace.stepSections.exportAuditTarget'),
      targetName: `${props.record.id} ${props.record.functionName}`,
      summary: t('surveys.workspace.stepSections.exportAuditSummary', { name }),
      result: 'success',
    });
    Message.success(t('surveys.workspace.stepSections.exportDone', { name }));
  } catch {
    Message.error(t('surveys.messages.storageError'));
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div class="step-sections">
    <!-- 完成度横条：整体完成率 + 待填格数 + 两套口径说明 -->
    <section class="ss-card ss-summary" :aria-label="t('surveys.workspace.stepSections.title')">
      <div class="ss-summary-main">
        <h3 class="ss-title">{{ t('surveys.workspace.stepSections.title') }}</h3>
        <dl class="ss-stats">
          <div class="ss-stat-line">
            <dt>{{ t('surveys.workspace.stepSections.completion') }}</dt>
            <dd>
              <span class="ss-strong">{{ t('surveys.workspace.stepSections.filledOf', { filled: overview.filled, participating: overview.participating }) }}</span>
              <span v-if="rate === null" class="ss-muted">{{ t('surveys.workspace.stepSections.noParticipating') }}</span>
              <span v-else class="ss-strong">{{ t('surveys.workspace.stepSections.rate', { rate }) }}</span>
              <a-tag v-if="overview.pending > 0" size="small" color="orange">{{ t('surveys.workspace.stepSections.pendingCount', { count: overview.pending }) }}</a-tag>
            </dd>
          </div>
          <div class="ss-stat-line">
            <dt>{{ t('surveys.workspace.stepSections.denominator') }}</dt>
            <dd class="ss-muted">{{ t('surveys.workspace.stepSections.denominatorNote') }}</dd>
          </div>
        </dl>
        <p v-if="editable" class="ss-stage">{{ t('surveys.workspace.stepSections.stageFilling') }}</p>
      </div>
      <div class="ss-actions">
        <a-button class="app-btn-neutral" :loading="exporting" @click="exportSections">
          {{ t('surveys.workspace.stepSections.exportBtn') }}
        </a-button>
        <a-button v-if="editable" type="primary" @click="requestSubmit">{{ t('surveys.workspace.stepSections.submit') }}</a-button>
        <p v-else class="ss-readonly">{{ t('surveys.workspace.stepSections.readonlyHint') }}</p>
      </div>
    </section>

    <!-- 改答后着色重算横幅（05 §4.3） -->
    <a-alert v-if="shadeDiff.grayToYellow > 0 || shadeDiff.yellowToGray > 0" type="warning" class="ss-recalc">
      {{ t('surveys.workspace.stepSections.recalcBanner', { grayToYellow: shadeDiff.grayToYellow, yellowToGray: shadeDiff.yellowToGray }) }}
    </a-alert>

    <!-- 六个分区直接填写；字段值与四态口径由目录及完成度引擎统一驱动 -->
    <section class="ss-card ss-sections" :aria-label="t('surveys.workspace.stepSections.sectionsNav')">
      <div class="ss-legend-list" :aria-label="t('surveys.workspace.stepSections.legendTitle')">
        <span v-for="shadeName in (['yellow', 'white', 'gray', 'plain'] as const)" :key="shadeName" :class="`ss-legend-${shadeName}`">
          <span class="ss-swatch" aria-hidden="true"></span>{{ t(`surveys.workspace.stepSections.legend.${shadeName}`) }}
        </span>
      </div>
      <p class="ss-legend-note">{{ t('surveys.workspace.stepSections.applicabilityHint') }}</p>
      <p v-if="editable" class="ss-save-state" role="status" :class="{ 'ss-save-error': saveState === 'error' }">
        {{ t(`surveys.workspace.stepSections.saveState.${saveState}`) }}
        <a-button v-if="saveState === 'error'" type="text" size="small" @click="persist">{{ t('surveys.workspace.stepSections.retrySave') }}</a-button>
      </p>
      <div v-for="def in SECTION_DEFS" :id="`survey-section-${def.key}`" :key="def.key" class="ss-section-group">
        <div class="ss-section-head">
          <h4 class="ss-section-title">{{ sectionTitle(def.key) }}</h4>
          <span class="ss-section-progress">
            {{ t('surveys.workspace.stepSections.filledOf', {
              filled: overview.sections.find((item) => item.key === def.key)?.filled ?? 0,
              participating: overview.sections.find((item) => item.key === def.key)?.participating ?? 0,
            }) }}
          </span>
          <a-tag size="small" :color="sectionState(def.key) === 'done' ? 'green' : sectionState(def.key) === 'filling' ? 'orange' : 'gray'">
            {{ t(`surveys.workspace.stepSections.state.${sectionState(def.key)}`) }}
          </a-tag>
        </div>
        <p v-if="locale === 'zh-CN' ? def.triggerZh : def.triggerEn" class="ss-section-trigger">
          {{ locale === 'zh-CN' ? def.triggerZh : def.triggerEn }}
        </p>
        <p v-if="(overview.sections.find((item) => item.key === def.key)?.notCarried ?? 0) > 0" class="ss-section-note">
          {{ t('surveys.workspace.stepSections.notCarried', { count: overview.sections.find((item) => item.key === def.key)?.notCarried ?? 0 }) }}
        </p>
        <div class="ss-field-grid">
          <div v-for="field in fields(def.key)" :key="field.code" class="ss-field" :class="field.carried ? `ss-field-${shade(field)}` : 'ss-field-unmapped'">
            <div class="ss-field-head">
              <span class="ss-field-code">{{ field.code }}</span>
              <label class="ss-field-label" :for="`survey-${def.key}-${field.code}`">
                {{ locale === 'zh-CN' ? field.labelZh : field.labelEn }}
              </label>
            </div>
            <p class="ss-field-state">
              {{ field.carried ? t(`sections.field.shade.${shade(field)}`) : t('surveys.workspace.stepSections.notCarriedField') }}
              <span v-if="def.key === 'basicInfo' && field.code === 'C'">{{ t('surveys.workspace.stepSections.masterReadonly') }}</span>
            </p>
            <!-- 填写提示（阈值/判定口径）：随字段展示，避免同一字段在不同页面口播不一致 -->
            <p v-if="field.hintZh" class="ss-field-hint">{{ locale === 'zh-CN' ? field.hintZh : field.hintEn }}</p>
            <a-select v-if="field.kind === 'select' || field.kind === 'boolean'"
              :id="`survey-${def.key}-${field.code}`" v-model="values[def.key][field.code]"
              :aria-label="locale === 'zh-CN' ? field.labelZh : field.labelEn"
              :placeholder="t('consent.select')" allow-clear :disabled="fieldDisabled(field)"
              @change="scheduleSave(def.key)">
              <template v-if="field.kind === 'boolean'">
                <a-option value="yes">{{ t('consent.answers.yes') }}</a-option>
                <a-option value="no">{{ t('consent.answers.no') }}</a-option>
                <a-option value="pending">{{ t('consent.answers.pending') }}</a-option>
              </template>
              <a-option v-for="choice in field.kind === 'select' ? options(field) : []" :key="choice.value" :value="choice.value">{{ choice.label }}</a-option>
            </a-select>
            <a-textarea v-else-if="field.kind === 'long'"
              :id="`survey-${def.key}-${field.code}`" v-model="values[def.key][field.code]"
              :aria-label="locale === 'zh-CN' ? field.labelZh : field.labelEn"
              :placeholder="t('consent.input')" :max-length="field.maxLength ?? 500" :auto-size="{ minRows: 2, maxRows: 4 }"
              :disabled="fieldDisabled(field)" @input="scheduleSave(def.key)" />
            <a-input v-else-if="def.key === 'basicInfo' && field.code === 'C'"
              :id="`survey-${def.key}-${field.code}`" :model-value="fieldValue(field)"
              :aria-label="locale === 'zh-CN' ? field.labelZh : field.labelEn" disabled />
            <a-input v-else :id="`survey-${def.key}-${field.code}`" v-model="values[def.key][field.code]"
              :aria-label="locale === 'zh-CN' ? field.labelZh : field.labelEn"
              :placeholder="t('consent.input')" :max-length="field.maxLength ?? 500" :disabled="fieldDisabled(field)"
              @input="scheduleSave(def.key)" />
            <p class="ss-field-drivers">
              <template v-if="def.driverless">{{ t('surveys.workspace.stepSections.driverlessNote') }}</template>
              <template v-else>
                {{ t('surveys.workspace.stepSections.drivers') }}{{ t('surveys.workspace.fieldSeparator') }}
                {{ driversOf(field).length ? driversOf(field).map(driverLabel).join(locale === 'zh-CN' ? '、' : ', ') : t('surveys.workspace.stepSections.noDrivers') }}
              </template>
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- 整体备注（不参与着色与统计，随问卷本地草稿保存） -->
    <section class="ss-card ss-overall" :aria-label="t('surveys.workspace.stepSections.overallNote')">
      <label class="ss-overall-label" for="survey-overall-note">
        {{ t('surveys.workspace.stepSections.overallNote') }}
        <span class="ss-overall-hint">{{ t('surveys.workspace.stepSections.overallNoteHint') }}</span>
      </label>
      <a-textarea id="survey-overall-note" v-model="note" :placeholder="t('surveys.workspace.stepSections.overallNotePlaceholder')"
        :max-length="500" :auto-size="{ minRows: 2, maxRows: 4 }" :disabled="!editable" @input="scheduleNote" />
    </section>

    <!-- 提交确认 / 缺项清单（456px，05 §4.2.6） -->
    <a-modal
      :visible="gateOpen"
      :width="456"
      :title="gaps.length ? t('surveys.workspace.stepSections.gapTitle') : t('surveys.workspace.stepSections.submitTitle')"
      @cancel="gateOpen = false"
    >
      <template v-if="gaps.length">
        <p>{{ t('surveys.workspace.stepSections.gapBody', { count: overview.pending }) }}</p>
        <ul class="ss-gap-list">
          <li v-for="gap in gaps" :key="gap.section">
            <a :href="`#survey-section-${gap.section}`" @click="gateOpen = false">
              {{ sectionTitle(gap.section) }}
            </a>
            <span>{{ gap.codes.join('、') }}</span>
          </li>
        </ul>
      </template>
      <p v-else>{{ t('surveys.workspace.stepSections.submitBody', { filled: overview.filled, participating: overview.participating }) }}</p>
      <template #footer>
        <a-button class="app-btn-neutral" @click="gateOpen = false">{{ t('surveys.actions.cancel') }}</a-button>
        <a-button v-if="!gaps.length" type="primary" :loading="submitting" @click="confirmSubmit">
          {{ t('surveys.workspace.stepSections.submitOk') }}
        </a-button>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
.step-sections { display: flex; flex-direction: column; gap: 16px; min-width: 0; font-size: 14px; color: var(--color-text-1); }
.ss-card { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.ss-title { margin: 0 0 12px; color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; }

.ss-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.ss-summary-main { flex: 1; min-width: 0; }
.ss-stats { display: flex; flex-direction: column; gap: 6px; margin: 0; }
.ss-stat-line { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.ss-stat-line dt { flex: none; color: var(--color-text-2); }
.ss-stat-line dd { display: flex; align-items: baseline; flex-wrap: wrap; gap: 12px; margin: 0; }
.ss-strong { color: var(--color-text-1); font-variant-numeric: tabular-nums; }
.ss-muted { color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.ss-actions { flex: none; display: flex; flex-direction: column; gap: 8px; }
.ss-actions .arco-btn { width: 160px; }
.ss-readonly { max-width: 220px; margin: 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.ss-recalc { border-radius: 2px; }
/* 阶段提示：分区填写中，说明当前阶段的角色任务 */
.ss-stage { margin: 10px 0 0; color: var(--color-text-2); font-size: 12px; line-height: 20px; }

/* 图例留在表单顶部；分区仅做结构分组，不嵌套卡片。 */
.ss-legend-list { display: flex; flex-wrap: wrap; gap: 8px 20px; color: var(--color-text-2); font-size: 12px; line-height: 20px; }
.ss-legend-list > span { display: flex; align-items: center; gap: 6px; }
.ss-swatch { width: 12px; height: 12px; border: 1px solid var(--app-control-border); border-radius: 2px; }
.ss-legend-gray .ss-swatch { background: var(--color-fill-2); border-color: var(--color-text-3); }
.ss-legend-yellow .ss-swatch { background: var(--mt-warn-bg); border-color: rgb(var(--orange-6)); }
.ss-legend-white .ss-swatch { background: var(--app-surface); }
.ss-legend-plain .ss-swatch { background: var(--app-surface); border-style: dashed; }
.ss-legend-note { margin: 8px 0 0; color: var(--color-text-2); font-size: 12px; line-height: 20px; }
.ss-save-state { display: flex; align-items: center; gap: 8px; min-height: 20px; margin: 8px 0 0; color: var(--color-text-2); font-size: 12px; }
.ss-save-error { color: var(--app-color-danger); }
.ss-section-group { margin-top: 24px; scroll-margin-top: 120px; }
.ss-section-group + .ss-section-group { padding-top: 24px; border-top: 1px solid var(--app-divider); }
.ss-section-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 12px; }
.ss-section-title { margin: 0; color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; }
.ss-section-progress { color: var(--color-text-2); font-size: 12px; font-variant-numeric: tabular-nums; }
.ss-section-note { margin: -4px 0 12px; color: var(--color-text-2); font-size: 12px; line-height: 20px; }
/* 分区触发说明：分区头下一行，Text-3 小字 */
.ss-section-trigger { margin: -4px 0 12px; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
/* 整体备注：不参与着色与统计 */
.ss-overall { display: flex; flex-direction: column; gap: 8px; }
.ss-overall-label { display: flex; align-items: baseline; gap: 8px; color: var(--color-text-1); font-size: 14px; font-weight: 600; line-height: 22px; }
.ss-overall-hint { color: var(--color-text-3); font-size: 12px; font-weight: 400; line-height: 20px; }
.ss-field-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 12px; }
.ss-field { display: flex; flex-direction: column; min-width: 0; min-height: 160px; padding: 12px; border: 1px solid var(--app-divider); border-radius: 2px; background: var(--app-surface); }
.ss-field-yellow { border-color: var(--color-warning-light-3); background: var(--mt-warn-bg); }
.ss-field-gray, .ss-field-unmapped { background: var(--color-fill-2); }
.ss-field-plain { border-style: dashed; }
.ss-field-head { display: flex; align-items: start; gap: 8px; }
.ss-field-code { flex: none; padding: 0 5px; border-radius: 2px; background: var(--color-text-2); color: var(--app-surface); font-size: 12px; font-weight: 600; line-height: 20px; }
.ss-field-label { color: var(--color-text-1); font-size: 14px; font-weight: 600; line-height: 22px; overflow-wrap: anywhere; }
.ss-field-state { min-height: 20px; margin: 4px 0 8px; color: var(--color-text-2); font-size: 12px; line-height: 20px; }
.ss-field-state span { margin-left: 8px; }
/* 字段填写提示：12px/18、Text-3，位于状态行与控件之间，不参与四态着色 */
.ss-field-hint { margin: 0 0 8px; color: var(--color-text-3); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.ss-field-yellow .ss-field-state { color: var(--color-warning-7); }
.ss-field :deep(.arco-select-view), .ss-field :deep(.arco-input-wrapper), .ss-field :deep(.arco-textarea-wrapper) { width: 100%; min-width: 0; }
.ss-field-drivers { margin: auto 0 0; padding-top: 8px; color: var(--color-text-2); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }

.ss-gap-list { margin: 8px 0 0; padding-left: 0; list-style: none; }
.ss-gap-list li { display: flex; gap: 8px; padding: 4px 0; }
.ss-gap-list a { flex: none; color: var(--app-accent); text-decoration: none; }
.ss-gap-list a:hover, .ss-gap-list a:focus-visible { text-decoration: underline; }
.ss-gap-list span { color: var(--color-text-2); font-variant-numeric: tabular-nums; }

@media (max-width: 900px) {
  .ss-summary { flex-direction: column; }
  .ss-actions .arco-btn { width: 100%; }
}
@media (max-width: 600px) {
  .ss-field-grid { grid-template-columns: 1fr; }
  .ss-field { min-height: 0; }
}
</style>
