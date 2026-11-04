<script setup lang="ts">
/**
 * 问卷工作区 · 步骤 6「证据与导出」（05 §6，F-EVID-01~07 / F-MAT-01~06 / F-EXP-01~07）。
 *
 * 三块内容：
 * 1. 左主区 证据缺口表：一行一参与条目（= 适用且已锁定，BR-037），黄=缺 / 白=已提供 / 红=逾期；
 *    行内「提供证据」录入 4 项 + 预计提供时间 + 外链 + 附件登记（元数据）。
 * 2. 右侧栏 材料清单：按阶段（开测前/测试中）与依据（第 6 章 Document 段 / 第 9 章点名）筛选，
 *    材料 ↔ 条款双向可见，未备计数徽标，被多条条款引用时提示复用。
 * 3. 底部 导出区：填写版 Excel（可再导入）· 安全需求清单 · 测试输入要求清单 · A4 打印视图，
 *    全部走导出任务留痕，并提供导出后「再导入校验」（RD-08）。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { CLAUSES, ensureSurveyMatching, finalApplicability, clauseByNo } from '../data/matching';
import { ITEM_CATALOG } from '../data/items';
import { ensureItemReview, type ItemState } from '../data/itemReview';
import {
  addAttachment, evidenceOf, evidenceState, evidenceStats, removeAttachment, saveEvidence,
  type EvidenceEntry, type EvidenceFile, type EvidenceState,
} from '../data/evidence';
import {
  materialsForClauses, materialsOfClause, materialStatus, setMaterialReady, unreadyCount,
  type MaterialBasis, type MaterialDef, type MaterialStage,
} from '../data/materials';
import {
  buildFilledWorkbook, buildRequirementWorkbook, buildTestInputWorkbook, compareRoundTrip,
  exportFileName, parseFilledWorkbook, toBlob, type RoundTripDiff, type RoundTripResult,
} from '../data/exportWorkbooks';
import { useTaskCenterStore } from '../../task-center/stores/taskCenter';
import { auditRecords } from '../../audit/data/audit';
import { MOCK_CURRENT_USER, type SurveyRecord } from '../data/surveys';

const props = defineProps<{ record: SurveyRecord }>();
const { t, locale } = useI18n();
const router = useRouter();
const taskCenter = useTaskCenterStore();

onMounted(() => {
  ensureSurveyMatching(props.record);
  ensureItemReview(props.record);
});

const refresh = ref(0);
const bump = () => { refresh.value += 1; };

/* ------------------------------------------------------------ 参与与证据行 */

interface EvidenceRow {
  id: string;
  no: string;
  summary: string;
  testMethod: string;
  materialNames: string[];
  itemState: ItemState;
  locked: boolean;
  entry: EvidenceEntry;
  state: EvidenceState;
  expectedAt?: string;
}

const allRows = computed<EvidenceRow[]>(() => {
  void refresh.value;
  const store = ensureItemReview(props.record);
  return ITEM_CATALOG.filter((item) => item.kind === 'requirement').map((item) => {
    const itemState = store[item.id]?.state ?? 'pending-confirm';
    const locked = itemState === 'locked';
    const entry = evidenceOf(props.record.id, item.id);
    const clause = clauseByNo(item.no);
    return {
      id: item.id,
      no: item.no,
      summary: item.summary,
      testMethod: clause.testMethod,
      materialNames: materialsOfClause(item.no).map((material) => material.name),
      itemState,
      locked,
      entry,
      state: evidenceState(entry, locked),
      expectedAt: entry.expectedAt,
    };
  });
});

/** 表格行：仅参与条目（已锁定）+ 有证据的已释放条目（X6 保留可查） */
const tableRows = computed(() => {
  const rows = allRows.value.filter((row) => row.locked || row.state === 'released');
  const weight: Record<EvidenceState, number> = { overdue: 0, missing: 1, pending: 2, collected: 3, released: 4 };
  return [...rows].sort((left, right) => weight[left.state] - weight[right.state]);
});

/**
 * 未开放 = 还没轮到收集范围的条目：待确认 / 待审核（BR-037）。
 * 「未参与（不适用）」既不在表内也不计入未开放 —— 它们永远不进入证据收集。
 */
const notOpen = computed(() => allRows.value
  .filter((row) => row.itemState !== 'locked' && row.itemState !== 'excluded' && row.state !== 'released').length);

const stats = computed(() => evidenceStats(tableRows.value, notOpen.value));

const stateFilter = ref<'all' | 'gap' | 'overdue' | 'collected' | 'released'>('all');
const filteredRows = computed(() => {
  const filter = stateFilter.value;
  if (filter === 'all') return tableRows.value;
  if (filter === 'gap') return tableRows.value.filter((row) => row.state === 'missing' || row.state === 'pending');
  return tableRows.value.filter((row) => row.state === filter);
});

/** 参与条款（材料清单按此过滤） */
const participatingClauses = computed(() => (!props.record.matching
  ? []
  : CLAUSES.filter((clause) => finalApplicability(props.record.matching!, clause.no) === 'applicable').map((clause) => clause.no)));

function stateText(state: EvidenceState): string {
  return t(`surveys.workspace.evidence.states.${state}`);
}

function stateColor(state: EvidenceState): string {
  if (state === 'collected') return 'green';
  if (state === 'overdue') return 'red';
  if (state === 'released') return 'gray';
  return 'orange';
}

/* -------------------------------------------------------------- 证据录入 */

const editorOpen = ref(false);
const editorRow = ref<EvidenceRow | null>(null);
const draft = reactive<{
  satisfied: string; how: string; testInput: string;
  providedAt?: string; expectedAt?: string; linksText: string;
}>({ satisfied: '', how: '', testInput: '', linksText: '' });
const editorFiles = ref<EvidenceFile[]>([]);
const editorError = ref('');

const fileInput = ref<HTMLInputElement | null>(null);

const editingArchived = computed(() => props.record.status === 'archived');
const editingLocked = computed(() => props.record.status === 'section-filling'
  || props.record.status === 'section-reviewing');

function openEditor(row: EvidenceRow) {
  if (!row.locked) {
    Message.warning(t('surveys.workspace.evidence.notLockedHint'));
    return;
  }
  if (editingArchived.value) {
    Message.warning(t('surveys.workspace.evidence.archivedHint'));
    return;
  }
  editorRow.value = row;
  draft.satisfied = row.entry.satisfied;
  draft.how = row.entry.how;
  draft.testInput = row.entry.testInput;
  draft.providedAt = row.entry.providedAt;
  draft.expectedAt = row.entry.expectedAt;
  draft.linksText = row.entry.links.join('\n');
  editorFiles.value = [...row.entry.files];
  editorError.value = '';
  editorOpen.value = true;
}

function pickFiles() {
  fileInput.value?.click();
}

function onFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  const row = editorRow.value;
  if (!row) return;
  for (const file of files) {
    const meta: EvidenceFile = {
      name: file.name,
      size: file.size,
      type: file.type || file.name.split('.').pop() || '',
      addedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    editorFiles.value = [...editorFiles.value.filter((item) => item.name !== meta.name), meta];
  }
  input.value = '';
}

function dropFile(name: string) {
  editorFiles.value = editorFiles.value.filter((item) => item.name !== name);
}

function saveEditor() {
  const row = editorRow.value;
  if (!row) return;
  if (!draft.satisfied.trim() || !draft.how.trim()) {
    editorError.value = t('surveys.workspace.evidence.requiredMissing');
    return;
  }
  if (!draft.providedAt && !draft.expectedAt) {
    editorError.value = t('surveys.workspace.evidence.timeRequired');
    return;
  }
  const links = draft.linksText.split('\n').map((line) => line.trim()).filter(Boolean);
  saveEvidence(props.record.id, row.id, {
    satisfied: draft.satisfied.trim(),
    how: draft.how.trim(),
    testInput: draft.testInput.trim(),
    providedAt: draft.providedAt,
    expectedAt: draft.expectedAt,
    links,
    files: editorFiles.value,
  }, MOCK_CURRENT_USER.name);
  editorOpen.value = false;
  bump();
  Message.success(t('surveys.workspace.evidence.saved'));
}

function attachNow(file: EvidenceFile) {
  const row = editorRow.value;
  if (!row) return;
  addAttachment(props.record.id, row.id, file, MOCK_CURRENT_USER.name);
}

function detachNow(name: string) {
  const row = editorRow.value;
  if (!row) return;
  removeAttachment(props.record.id, row.id, name, MOCK_CURRENT_USER.name);
}

function fileSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

/* -------------------------------------------------------------- 材料清单 */

const materialStage = ref<MaterialStage | 'all'>('all');
const materialBasis = ref<MaterialBasis | 'all'>('all');
const expandedMaterial = ref<string | null>(null);

const materials = computed(() => materialsForClauses(participatingClauses.value, {
  stage: materialStage.value, basis: materialBasis.value,
}));

const unready = computed(() => {
  void refresh.value;
  return unreadyCount(props.record.id, materials.value);
});

function stageLabel(stage: MaterialStage): string {
  return t(`surveys.workspace.evidence.materialStage.${stage}`);
}

function basisLabel(basis: MaterialBasis): string {
  return t(`surveys.workspace.evidence.materialBasis.${basis}`);
}

function formLabel(form: MaterialDef['form']): string {
  return t(`surveys.workspace.evidence.materialForm.${form}`);
}

function toggleMaterial(id: string) {
  expandedMaterial.value = expandedMaterial.value === id ? null : id;
}

function toggleReady(material: MaterialDef) {
  const current = materialStatus(props.record.id, material.id);
  setMaterialReady(props.record.id, material.id, { ready: !current.ready });
  bump();
}

function setOwner(material: MaterialDef, value: string) {
  setMaterialReady(props.record.id, material.id, { owner: value });
  bump();
}

function setLocation(material: MaterialDef, value: string) {
  setMaterialReady(props.record.id, material.id, { location: value });
  bump();
}

/* ---------------------------------------------------------------- 导出 */

const exportScope = ref<'all' | 'engaged'>('engaged');
const exporting = ref('');
const lastExport = ref<{ name: string; kind: 'filled' | 'requirements' | 'testInput' } | null>(null);
const filledBuffer = ref<ArrayBuffer | null>(null);
const roundTrip = ref<RoundTripResult | null>(null);

function clockText(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function stampText(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** 答案展示文案：与步骤 2 的作答选项同一套 key（是/否/待定），未知值原样返回 */
function answerText(value: string): string {
  if (value === 'yes') return t('surveys.workspace.questions.answerYes');
  if (value === 'no') return t('surveys.workspace.questions.answerNo');
  if (value === 'pending') return t('surveys.workspace.questions.answerPending');
  return value;
}

function applicabilityText(value: 'applicable' | 'not-applicable' | 'pending-review'): string {
  return t(`surveys.workspace.matching.final.${value}`);
}

function itemStateText(state: string): string {
  return t(`surveys.workspace.review.states.${state}`);
}

const workbookContext = { answerText, applicabilityText, itemStateText };

async function pushTask(blob: Blob, fileName: string) {
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
    fileName,
  });
}

function writeAudit(kind: string, fileName: string) {
  const now = new Date();
  auditRecords.unshift({
    id: `AUD-2026-${String(9000 + auditRecords.length).padStart(4, '0')}`,
    time: clockText(now),
    actor: MOCK_CURRENT_USER.name,
    role: 'officer',
    actionType: 'export',
    module: 'evidence',
    targetType: t('surveys.workspace.evidence.auditTarget'),
    targetName: `${props.record.id} ${props.record.functionName}`,
    summary: t('surveys.workspace.evidence.auditSummary', {
      kind,
      name: fileName,
      scope: t(exportScope.value === 'all' ? 'surveys.workspace.evidence.scopeAll' : 'surveys.workspace.evidence.scopeEngaged'),
    }),
    result: 'success',
  });
}

async function exportFilled() {
  if (exporting.value) return;
  exporting.value = 'filled';
  try {
    const workbook = await buildFilledWorkbook(props.record, workbookContext);
    const buffer = await workbook.xlsx.writeBuffer();
    filledBuffer.value = buffer as unknown as ArrayBuffer;
    const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const name = exportFileName(props.record, 'filled');
    await pushTask(blob, name);
    writeAudit(t('surveys.workspace.evidence.exportFilled'), name);
    lastExport.value = { name, kind: 'filled' };
    roundTrip.value = null;
    Message.success(t('surveys.workspace.evidence.exportDone', { name }));
  } catch {
    Message.error(t('surveys.messages.storageError'));
  } finally {
    exporting.value = '';
  }
}

async function exportRequirements() {
  if (exporting.value) return;
  exporting.value = 'requirements';
  try {
    const workbook = await buildRequirementWorkbook(props.record, exportScope.value, workbookContext);
    const blob = await toBlob(workbook);
    const name = exportFileName(props.record, 'requirements');
    await pushTask(blob, name);
    writeAudit(t('surveys.workspace.evidence.exportRequirements'), name);
    lastExport.value = { name, kind: 'requirements' };
    Message.success(t('surveys.workspace.evidence.exportDone', { name }));
  } catch {
    Message.error(t('surveys.messages.storageError'));
  } finally {
    exporting.value = '';
  }
}

async function exportTestInput() {
  if (exporting.value) return;
  exporting.value = 'testInput';
  try {
    const workbook = await buildTestInputWorkbook(props.record, participatingClauses.value);
    const blob = await toBlob(workbook);
    const name = exportFileName(props.record, 'testInput');
    await pushTask(blob, name);
    writeAudit(t('surveys.workspace.evidence.exportTestInput'), name);
    lastExport.value = { name, kind: 'testInput' };
    Message.success(t('surveys.workspace.evidence.exportDone', { name }));
  } catch {
    Message.error(t('surveys.messages.storageError'));
  } finally {
    exporting.value = '';
  }
}

/** A4 打印视图：新开页，页眉含功能名与填写日期（F-EXP-04） */
function openPrint() {
  const href = router.resolve({ name: 'survey-print', params: { id: props.record.id } }).href;
  const opened = window.open(href, '_blank');
  if (!opened) Message.warning(t('surveys.workspace.evidence.printBlocked'));
  writeAudit(t('surveys.workspace.evidence.exportPrint'), `${props.record.id}_A4`);
}

async function verifyRoundTrip() {
  if (!filledBuffer.value) {
    Message.warning(t('surveys.workspace.evidence.roundTripNeedExport'));
    return;
  }
  try {
    const parsed = await parseFilledWorkbook(filledBuffer.value);
    roundTrip.value = compareRoundTrip(props.record, parsed, answerText);
  } catch {
    Message.error(t('surveys.messages.storageError'));
  }
}

function scopeLabel(scope: RoundTripDiff['scope']): string {
  return t(`surveys.workspace.evidence.diffScope.${scope}`);
}

function openTaskCenter() {
  taskCenter.open('download');
}

/* 打印/材料环节用到的辅助文案 */
const activeClauseCount = computed(() => participatingClauses.value.length);
const localeTag = computed(() => (locale.value === 'en-US' ? 'en' : 'zh'));
</script>

<template>
  <div class="step-evidence" :data-locale="localeTag">
    <!-- 收集概览（BR-037/038：分母 = 参与条目数） -->
    <section class="se-card se-summary" :aria-label="t('surveys.workspace.evidence.title')">
      <div class="se-summary-main">
        <div class="se-summary-head">
          <h3 class="se-title">{{ t('surveys.workspace.evidence.title') }}</h3>
          <a-tag v-if="stats.overdue > 0" size="small" color="red" data-testid="se-overdue-tag">
            {{ t('surveys.workspace.evidence.overdueCount', { count: stats.overdue }) }}
          </a-tag>
          <a-tag v-if="stats.notOpen > 0" size="small" color="gray" data-testid="se-notopen-tag">
            {{ t('surveys.workspace.evidence.notOpen', { count: stats.notOpen }) }}
          </a-tag>
        </div>
        <dl class="se-stats">
          <div class="se-stat">
            <dt>{{ t('surveys.workspace.evidence.collectedRate') }}</dt>
            <dd>
              <span class="se-strong" data-testid="se-rate">
                {{ stats.rate === null ? '—' : t('surveys.workspace.evidence.rateValue', { rate: stats.rate }) }}
              </span>
              <span class="se-muted" data-testid="se-collected-of">
                {{ t('surveys.workspace.evidence.collectedOf', { collected: stats.collected, engaged: stats.engaged }) }}
              </span>
              <span v-if="stats.rate === null" class="se-muted">{{ t('surveys.workspace.evidence.noEngaged') }}</span>
            </dd>
          </div>
          <div class="se-stat">
            <dt>{{ t('surveys.workspace.evidence.columns.state') }}</dt>
            <dd>
              <a-tag size="small" color="orange">{{ t('surveys.workspace.evidence.states.missing') }} {{ stats.missing }}</a-tag>
              <a-tag size="small" color="blue">{{ t('surveys.workspace.evidence.states.pending') }} {{ stats.pending }}</a-tag>
              <a-tag size="small" color="red">{{ t('surveys.workspace.evidence.states.overdue') }} {{ stats.overdue }}</a-tag>
              <a-tag size="small" color="green">{{ t('surveys.workspace.evidence.states.collected') }} {{ stats.collected }}</a-tag>
              <a-tag v-if="stats.released > 0" size="small" color="gray">{{ t('surveys.workspace.evidence.states.released') }} {{ stats.released }}</a-tag>
            </dd>
          </div>
          <div class="se-stat">
            <dt>{{ t('surveys.workspace.evidence.ruleTitle') }}</dt>
            <dd class="se-muted">{{ t('surveys.workspace.evidence.ruleNote') }}</dd>
          </div>
        </dl>
      </div>
      <div class="se-summary-side">
        <span class="se-muted">{{ t('surveys.workspace.evidence.materialClauses', { count: activeClauseCount }) }}</span>
        <p v-if="editingLocked" class="se-muted">{{ t('surveys.workspace.evidence.lockedHint') }}</p>
        <p v-if="editingArchived" class="se-muted">{{ t('surveys.workspace.evidence.archivedHint') }}</p>
      </div>
    </section>

    <div class="se-body">
      <!-- 左主区：证据缺口表 -->
      <section class="se-card se-main" :aria-label="t('surveys.workspace.evidence.tableTitle')">
        <div class="se-table-head">
          <h4 class="se-table-title">{{ t('surveys.workspace.evidence.tableTitle', { count: tableRows.length }) }}</h4>
          <div class="se-filters" role="group" :aria-label="t('surveys.workspace.evidence.filterLabel')">
            <button
              v-for="filter in (['all', 'gap', 'overdue', 'collected', 'released'] as const)"
              :key="filter"
              type="button"
              class="se-chip"
              :class="{ active: stateFilter === filter }"
              @click="stateFilter = filter"
            >{{ t(`surveys.workspace.evidence.filters.${filter}`) }}</button>
          </div>
        </div>
        <p class="se-sort-note">{{ t('surveys.workspace.evidence.sortNote') }}</p>

        <div class="se-grid se-grid-head" role="row">
          <span role="columnheader">{{ t('surveys.workspace.evidence.columns.item') }}</span>
          <span role="columnheader">{{ t('surveys.workspace.evidence.columns.summary') }}</span>
          <span role="columnheader">{{ t('surveys.workspace.evidence.columns.required') }}</span>
          <span role="columnheader">{{ t('surveys.workspace.evidence.columns.state') }}</span>
          <span role="columnheader">{{ t('surveys.workspace.evidence.columns.expected') }}</span>
          <span role="columnheader">{{ t('surveys.workspace.evidence.columns.actions') }}</span>
        </div>

        <div v-if="!filteredRows.length" class="se-empty">
          <a-empty :description="t('surveys.workspace.evidence.empty')" />
        </div>

        <div
          v-for="row in filteredRows"
          :key="row.id"
          class="se-grid se-row"
          :class="`se-row-${row.state}`"
          role="row"
          :data-item-id="row.id"
          :data-state="row.state"
        >
          <span class="se-cell-no" role="cell">{{ row.id }}</span>
          <span class="se-cell-summary" role="cell">{{ row.summary }}</span>
          <span class="se-cell-required" role="cell">
            <span class="se-method">{{ row.testMethod }}</span>
            <span v-if="row.materialNames.length" class="se-materials">
              {{ t('surveys.workspace.evidence.materialCount', { count: row.materialNames.length }) }}
            </span>
          </span>
          <span class="se-cell-state" role="cell">
            <a-tag size="small" :color="stateColor(row.state)">{{ stateText(row.state) }}</a-tag>
          </span>
          <span class="se-cell-expected" role="cell">
            <span v-if="row.expectedAt">{{ row.expectedAt }}</span>
            <span v-else class="se-muted">—</span>
          </span>
          <span class="se-cell-actions" role="cell">
            <button
              v-if="row.locked"
              type="button"
              class="se-action"
              :disabled="editingArchived"
              @click="openEditor(row)"
            >{{ row.entry.satisfied || row.entry.how ? t('surveys.workspace.evidence.actions.edit') : t('surveys.workspace.evidence.actions.provide') }}</button>
            <span v-else class="se-muted">{{ t('surveys.workspace.evidence.releasedReadonly') }}</span>
          </span>
        </div>
      </section>

      <!-- 右侧栏：材料清单 -->
      <aside class="se-card se-rail" :aria-label="t('surveys.workspace.evidence.railTitle')">
        <div class="se-rail-head">
          <h4 class="se-table-title">{{ t('surveys.workspace.evidence.railTitle') }}</h4>
          <a-tag size="small" :color="unready > 0 ? 'orange' : 'green'" data-testid="se-unready">
            {{ t('surveys.workspace.evidence.railUnready', { count: unready }) }}
          </a-tag>
        </div>
        <div class="se-rail-filters">
          <button
            v-for="stage in (['all', 'pre-test', 'in-test'] as const)"
            :key="stage"
            type="button"
            class="se-chip"
            :class="{ active: materialStage === stage }"
            @click="materialStage = stage"
          >{{ stage === 'all' ? t('surveys.workspace.evidence.railAll') : stageLabel(stage) }}</button>
          <button
            v-for="basis in (['all', 'ch6', 'ch9'] as const)"
            :key="basis"
            type="button"
            class="se-chip"
            :class="{ active: materialBasis === basis }"
            @click="materialBasis = basis"
          >{{ basis === 'all' ? t('surveys.workspace.evidence.railBasisAll') : basisLabel(basis) }}</button>
        </div>

        <ul v-if="materials.length" class="se-material-list">
          <li v-for="material in materials" :key="material.id" class="se-material" :data-material-id="material.id">
            <button type="button" class="se-material-head" :aria-expanded="expandedMaterial === material.id" @click="toggleMaterial(material.id)">
              <span class="se-material-name">{{ material.name }}</span>
              <a-tag size="small" :color="materialStatus(record.id, material.id).ready ? 'green' : 'orange'">
                {{ t(materialStatus(record.id, material.id).ready ? 'surveys.workspace.evidence.railReady' : 'surveys.workspace.evidence.railUnreadyTag') }}
              </a-tag>
            </button>
            <div class="se-material-meta">
              <span>{{ stageLabel(material.stage) }}</span>
              <span>{{ basisLabel(material.basis) }}</span>
              <span>{{ formLabel(material.form) }}</span>
              <span>{{ t('surveys.workspace.evidence.railClauses', { count: material.clauses.length }) }}</span>
            </div>
            <div v-if="expandedMaterial === material.id" class="se-material-detail">
              <p class="se-material-method">{{ material.method }}</p>
              <p v-if="material.clauses.length > 1" class="se-reuse">{{ t('surveys.workspace.evidence.railReuse') }}</p>
              <p class="se-material-clauses">
                <router-link
                  v-for="no in material.clauses"
                  :key="no"
                  class="se-clause-link"
                  :to="{ name: 'survey-detail-steps', params: { id: record.id, step: '3' } }"
                >{{ no }}</router-link>
              </p>
              <div class="se-material-inputs">
                <a-input size="small" :placeholder="t('surveys.workspace.evidence.railOwner')" :model-value="materialStatus(record.id, material.id).owner ?? ''" @change="setOwner(material, $event)" />
                <a-input size="small" :placeholder="t('surveys.workspace.evidence.railLocation')" :model-value="materialStatus(record.id, material.id).location ?? ''" @change="setLocation(material, $event)" />
              </div>
              <a-button size="mini" class="app-btn-neutral" @click="toggleReady(material)">
                {{ t(materialStatus(record.id, material.id).ready ? 'surveys.workspace.evidence.railMarkUnready' : 'surveys.workspace.evidence.railMarkReady') }}
              </a-button>
            </div>
          </li>
        </ul>
        <a-empty v-else :description="t('surveys.workspace.evidence.railEmpty')" />
      </aside>
    </div>

    <!-- 底部导出区 -->
    <section class="se-card se-export" :aria-label="t('surveys.workspace.evidence.exportTitle')">
      <div class="se-export-head">
        <h4 class="se-table-title">{{ t('surveys.workspace.evidence.exportTitle') }}</h4>
        <div class="se-scope" role="group" :aria-label="t('surveys.workspace.evidence.exportScope')">
          <label class="se-scope-item">
            <input v-model="exportScope" type="radio" value="engaged" />{{ t('surveys.workspace.evidence.scopeEngaged') }}
          </label>
          <label class="se-scope-item">
            <input v-model="exportScope" type="radio" value="all" />{{ t('surveys.workspace.evidence.scopeAll') }}
          </label>
        </div>
      </div>
      <p class="se-export-note">{{ t('surveys.workspace.evidence.exportNote') }}</p>
      <div class="se-export-actions">
        <a-button type="primary" :loading="exporting === 'filled'" data-testid="se-export-filled" @click="exportFilled">
          {{ t('surveys.workspace.evidence.exportFilled') }}
        </a-button>
        <a-button class="app-btn-neutral" :loading="exporting === 'requirements'" data-testid="se-export-requirements" @click="exportRequirements">
          {{ t('surveys.workspace.evidence.exportRequirements') }}
        </a-button>
        <a-button class="app-btn-neutral" :loading="exporting === 'testInput'" data-testid="se-export-testinput" @click="exportTestInput">
          {{ t('surveys.workspace.evidence.exportTestInput') }}
        </a-button>
        <a-button class="app-btn-neutral" data-testid="se-export-print" @click="openPrint">
          {{ t('surveys.workspace.evidence.exportPrint') }}
        </a-button>
      </div>

      <div v-if="lastExport" class="se-export-result" data-testid="se-last-export">
        <span>{{ t('surveys.workspace.evidence.lastExport', { name: lastExport.name }) }}</span>
        <button type="button" class="se-link" data-testid="se-open-task" @click="openTaskCenter">
          {{ t('surveys.workspace.evidence.openTaskCenter') }}
        </button>
        <button
          v-if="lastExport.kind === 'filled'"
          type="button"
          class="se-link"
          data-testid="se-roundtrip"
          @click="verifyRoundTrip"
        >{{ t('surveys.workspace.evidence.roundTrip') }}</button>
      </div>

      <div v-if="roundTrip" class="se-roundtrip" data-testid="se-roundtrip-result">
        <!-- Arco Alert 没有 description 插槽（只有同名 prop），两行文案都写在默认插槽里 -->
        <a-alert :type="roundTrip.diffs.length ? 'warning' : 'success'">
          <p class="se-roundtrip-title">
            {{ roundTrip.diffs.length
              ? t('surveys.workspace.evidence.roundTripDiff', { count: roundTrip.diffs.length })
              : t('surveys.workspace.evidence.roundTripOk') }}
          </p>
          <p class="se-roundtrip-desc">
            {{ t('surveys.workspace.evidence.roundTripChecked', {
              summary: roundTrip.checked.summary, answers: roundTrip.checked.answers,
              sections: roundTrip.checked.sections, evidence: roundTrip.checked.evidence,
            }) }}
          </p>
        </a-alert>
        <ul v-if="roundTrip.diffs.length" class="se-diff-list">
          <li v-for="diff in roundTrip.diffs.slice(0, 12)" :key="`${diff.scope}-${diff.key}`">
            <span class="se-diff-scope">{{ scopeLabel(diff.scope) }}</span>
            <span class="se-diff-key">{{ diff.key }}</span>
            <span class="se-diff-value">{{ t('surveys.workspace.evidence.diffExpected') }}「{{ diff.expected }}」/ {{ t('surveys.workspace.evidence.diffActual') }}「{{ diff.actual }}」</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- 证据录入弹层：4 项 + 时间 + 外链 + 附件登记 -->
    <a-modal
      :visible="editorOpen"
      :width="560"
      :title="t('surveys.workspace.evidence.modalTitle', { id: editorRow?.id ?? '' })"
      @cancel="editorOpen = false"
    >
      <div v-if="editorRow" class="se-editor">
        <p class="se-editor-summary">{{ editorRow.summary }}</p>

        <label class="se-field">
          <span class="se-label">{{ t('surveys.workspace.evidence.modalSatisfied') }}<em aria-hidden="true">*</em></span>
          <a-textarea v-model="draft.satisfied" :auto-size="{ minRows: 2, maxRows: 4 }" :placeholder="t('surveys.workspace.evidence.modalSatisfiedHint')" />
        </label>
        <label class="se-field">
          <span class="se-label">{{ t('surveys.workspace.evidence.modalHow') }}<em aria-hidden="true">*</em></span>
          <a-textarea v-model="draft.how" :auto-size="{ minRows: 2, maxRows: 4 }" :placeholder="t('surveys.workspace.evidence.modalHowHint')" />
        </label>
        <label class="se-field">
          <span class="se-label">{{ t('surveys.workspace.evidence.modalTestInput') }}</span>
          <a-textarea v-model="draft.testInput" :auto-size="{ minRows: 2, maxRows: 4 }" :placeholder="t('surveys.workspace.evidence.modalTestInputHint')" />
        </label>

        <div class="se-field-row">
          <label class="se-field">
            <span class="se-label">{{ t('surveys.workspace.evidence.modalProvided') }}</span>
            <a-date-picker v-model="draft.providedAt" value-format="YYYY-MM-DD" :placeholder="t('surveys.workspace.evidence.modalDatePlaceholder')" />
          </label>
          <label class="se-field">
            <span class="se-label">{{ t('surveys.workspace.evidence.modalExpected') }}</span>
            <a-date-picker v-model="draft.expectedAt" value-format="YYYY-MM-DD" :placeholder="t('surveys.workspace.evidence.modalDatePlaceholder')" />
          </label>
        </div>
        <p class="se-hint">{{ t('surveys.workspace.evidence.modalTimeRule') }}</p>

        <label class="se-field">
          <span class="se-label">{{ t('surveys.workspace.evidence.modalLinks') }}</span>
          <a-textarea v-model="draft.linksText" :auto-size="{ minRows: 2, maxRows: 4 }" :placeholder="t('surveys.workspace.evidence.modalLinksHint')" />
        </label>

        <div class="se-field">
          <span class="se-label">{{ t('surveys.workspace.evidence.modalFiles') }}</span>
          <div class="se-file-row">
            <a-button size="small" class="app-btn-neutral" data-testid="se-pick-file" @click="pickFiles">
              {{ t('surveys.workspace.evidence.modalChooseFile') }}
            </a-button>
            <span class="se-hint">{{ t('surveys.workspace.evidence.modalFileNote') }}</span>
          </div>
          <input ref="fileInput" class="se-file-input" type="file" multiple data-testid="se-file-input" @change="onFilesPicked" />
          <ul v-if="editorFiles.length" class="se-file-list">
            <li v-for="file in editorFiles" :key="file.name">
              <span class="se-file-name">{{ file.name }}</span>
              <span class="se-muted">{{ fileSize(file.size) }}</span>
              <button type="button" class="se-link" @click="dropFile(file.name)">{{ t('surveys.workspace.evidence.modalRemove') }}</button>
            </li>
          </ul>
          <p v-else class="se-hint">{{ t('surveys.workspace.evidence.modalNoFiles') }}</p>
        </div>

        <div class="se-field">
          <span class="se-label">{{ t('surveys.workspace.evidence.modalMaterials') }}</span>
          <ul class="se-modal-materials">
            <li v-for="name in editorRow.materialNames" :key="name">{{ name }}</li>
            <li v-if="!editorRow.materialNames.length" class="se-muted">{{ t('surveys.workspace.evidence.modalNoMaterials') }}</li>
          </ul>
        </div>

        <p v-if="editorError" class="se-error">{{ editorError }}</p>
      </div>
      <template #footer>
        <a-button class="app-btn-neutral" @click="editorOpen = false">{{ t('surveys.actions.cancel') }}</a-button>
        <a-button type="primary" data-testid="se-save-evidence" @click="saveEditor">{{ t('surveys.workspace.evidence.modalSave') }}</a-button>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
.step-evidence { display: flex; flex-direction: column; gap: 16px; min-width: 0; font-size: 14px; color: var(--color-text-1); }
.se-card { min-width: 0; padding: 16px; border-radius: 2px; background: var(--app-surface); }
.se-title { margin: 0; color: var(--color-text-1); font-size: 16px; font-weight: 600; line-height: 24px; }

/* 概览 */
.se-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.se-summary-main { flex: 1; min-width: 0; }
.se-summary-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.se-summary-side { flex: none; display: flex; flex-direction: column; gap: 4px; max-width: 240px; text-align: right; }
.se-stats { display: flex; flex-direction: column; gap: 6px; margin: 12px 0 0; }
.se-stat { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.se-stat dt { flex: none; color: var(--color-text-2); }
.se-stat dd { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; margin: 0; }
.se-strong { color: var(--color-text-1); font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
.se-muted { color: var(--color-text-3); font-size: 12px; line-height: 20px; }

/* 两栏 */
.se-body { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
.se-table-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.se-table-title { margin: 0; color: var(--color-text-1); font-size: 14px; font-weight: 600; line-height: 22px; }
.se-filters { display: flex; flex-wrap: wrap; gap: 8px; }
.se-chip { padding: 2px 10px; border: 1px solid var(--app-control-border); border-radius: 2px; background: var(--app-surface); color: var(--color-text-2); font-size: 12px; line-height: 20px; cursor: pointer; }
.se-chip:hover { border-color: var(--app-accent); color: var(--app-accent); }
.se-chip.active { border-color: var(--app-accent); background: var(--color-primary-light-1); color: var(--app-accent); }
.se-chip:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.se-sort-note { margin: 4px 0 8px; color: var(--color-text-3); font-size: 12px; line-height: 20px; }

.se-grid { display: grid; grid-template-columns: 92px minmax(0, 1fr) 168px 92px 96px 88px; gap: 12px; align-items: center; padding: 8px 12px; }
.se-grid-head { background: var(--app-surface-soft); color: var(--color-text-2); font-size: 14px; font-weight: 600; line-height: 22px; border-radius: 2px; }
.se-row { border-top: 1px solid var(--app-divider); }
.se-row-overdue { background: rgb(var(--red-1)); }
.se-row-collected { background: rgb(var(--green-1)); }
.se-row-released { color: var(--color-text-3); background: var(--app-surface-soft); }
.se-cell-no { color: var(--color-text-2); font-variant-numeric: tabular-nums; }
.se-cell-summary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.se-cell-required { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.se-method { color: var(--color-text-2); font-size: 12px; line-height: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.se-materials { color: var(--color-text-3); font-size: 12px; line-height: 18px; }
.se-cell-expected { color: var(--color-text-2); font-variant-numeric: tabular-nums; }
.se-cell-actions { display: flex; align-items: center; }
.se-action { padding: 0; border: none; background: none; color: var(--app-accent); font-size: 13px; line-height: 20px; cursor: pointer; }
.se-action:hover:not(:disabled), .se-action:focus-visible:not(:disabled) { text-decoration: underline; }
.se-action:disabled { color: var(--color-text-3); cursor: not-allowed; }
.se-empty { display: grid; place-items: center; min-height: 160px; }

/* 材料清单 */
.se-rail-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.se-rail-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 12px; }
.se-material-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; max-height: 560px; overflow: auto; }
.se-material { border-top: 1px solid var(--app-divider); padding: 8px 0; }
.se-material:first-child { border-top: none; }
.se-material-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; width: 100%; padding: 0; border: none; background: none; text-align: left; cursor: pointer; }
.se-material-head:hover .se-material-name, .se-material-head:focus-visible .se-material-name { color: var(--app-accent); }
.se-material-head:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
.se-material-name { flex: 1; min-width: 0; color: var(--color-text-1); font-size: 13px; line-height: 20px; }
.se-material-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 4px; color: var(--color-text-3); font-size: 12px; line-height: 18px; }
.se-material-detail { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; padding: 8px; border-radius: 2px; background: var(--app-surface-soft); }
.se-material-method { margin: 0; color: var(--color-text-2); font-size: 12px; line-height: 18px; }
.se-reuse { margin: 0; color: rgb(var(--orange-6)); font-size: 12px; line-height: 18px; }
.se-material-clauses { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; }
.se-clause-link { color: var(--app-accent); font-size: 12px; text-decoration: none; font-variant-numeric: tabular-nums; }
.se-clause-link:hover, .se-clause-link:focus-visible { text-decoration: underline; }
.se-material-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }

/* 导出 */
.se-export-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.se-scope { display: flex; gap: 16px; }
.se-scope-item { display: flex; align-items: center; gap: 6px; color: var(--color-text-2); font-size: 13px; cursor: pointer; }
.se-export-note { margin: 6px 0 12px; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.se-export-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.se-export-result { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 12px; color: var(--color-text-2); font-size: 13px; }
.se-link { padding: 0; border: none; background: none; color: var(--app-accent); font-size: 13px; line-height: 20px; cursor: pointer; }
.se-link:hover, .se-link:focus-visible { text-decoration: underline; }
.se-roundtrip { margin-top: 12px; }
.se-roundtrip-title { margin: 0; color: var(--color-text-1); font-size: 13px; line-height: 20px; }
.se-roundtrip-desc { margin: 2px 0 0; color: var(--color-text-2); font-size: 12px; line-height: 20px; }
.se-diff-list { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.se-diff-list li { display: flex; gap: 8px; color: var(--color-text-2); font-size: 12px; line-height: 20px; }
.se-diff-scope { flex: none; color: var(--color-text-3); }
.se-diff-key { flex: none; font-variant-numeric: tabular-nums; }

/* 录入弹层 */
.se-editor { display: flex; flex-direction: column; gap: 12px; }
.se-editor-summary { margin: 0; padding: 8px 12px; border-radius: 2px; background: var(--app-surface-soft); color: var(--color-text-2); font-size: 13px; line-height: 20px; }
.se-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.se-label { color: var(--color-text-2); font-size: 13px; line-height: 20px; }
.se-label em { margin-left: 2px; color: rgb(var(--danger-6)); font-style: normal; }
.se-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.se-hint { margin: 0; color: var(--color-text-3); font-size: 12px; line-height: 20px; }
.se-file-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.se-file-input { display: none; }
.se-file-list { margin: 4px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.se-file-list li { display: flex; align-items: center; gap: 8px; font-size: 12px; line-height: 20px; }
.se-file-name { color: var(--color-text-1); overflow-wrap: anywhere; }
.se-modal-materials { margin: 0; padding-left: 16px; color: var(--color-text-2); font-size: 12px; line-height: 20px; }
.se-error { margin: 0; color: rgb(var(--danger-6)); font-size: 12px; line-height: 20px; }

@media (max-width: 1100px) {
  .se-body { grid-template-columns: minmax(0, 1fr); }
  .se-summary { flex-direction: column; }
  .se-summary-side { max-width: none; text-align: left; }
}
@media (max-width: 900px) {
  .se-grid { grid-template-columns: 84px minmax(0, 1fr); }
  .se-grid-head span:nth-child(n + 3) { display: none; }
  .se-cell-required, .se-cell-state, .se-cell-expected, .se-cell-actions { grid-column: 2; }
  .se-field-row { grid-template-columns: 1fr; }
}
</style>
