<script setup lang="ts">
/**
 * 问卷工作区 · A4 打印视图（/surveys/:id/print，F-EXP-04，05 §6.2）。
 *
 * 契约：
 * 1. 新开页承载（路由 meta.layout=false），页眉固定含**功能名 + 填写日期**，页脚含打印时间与生成方；
 * 2. 适用条目在前、逐条列出证据四要素；不适用的条目折叠后置（默认收起，不删数据）；
 * 3. A4 版心（210×297mm，16mm 页边距），跨页时表头重复、块不拆分；
 * 4. 打印态隐藏操作条（返回 / 打印按钮），只留纸面内容。
 *
 * 本页是**文档**不是业务页：纸面一律白底黑字（不跟随深浅主题），否则打印与归档不可读。
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { CLAUSES, ensureSurveyMatching, finalApplicability } from '../data/matching';
import { ensureItemReview } from '../data/itemReview';
import { loadLocalSurveyDrafts } from '../data/drafts';
import { mergeLocalSurveyDrafts, surveyRecords, type SurveyRecord } from '../data/surveys';
import { materialStatus } from '../data/materials';
import { printMaterials, printRows, type PrintRow } from '../data/exportWorkbooks';
import type { EvidenceState } from '../data/evidence';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();

const loading = ref(true);
const record = ref<SurveyRecord | null>(null);

const printedAt = ref('');

function clockText(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

onMounted(async () => {
  try {
    mergeLocalSurveyDrafts(await loadLocalSurveyDrafts());
    const id = String(route.params.id ?? '');
    const found = surveyRecords.find((item) => item.id === id) ?? null;
    record.value = found;
    if (found) {
      ensureSurveyMatching(found);
      ensureItemReview(found);
      document.title = `${found.functionName} · ${t('surveys.workspace.print.docTitle')}`;
    }
    printedAt.value = clockText(new Date());
  } finally {
    loading.value = false;
  }
});

/** 参与条款：材料清单与证据都按此口径过滤 */
const participating = computed(() => (!record.value?.matching
  ? []
  : CLAUSES.filter((clause) => finalApplicability(record.value!.matching!, clause.no) === 'applicable').map((clause) => clause.no)));

const rows = computed<{ applicable: PrintRow[]; notApplicable: PrintRow[] }>(() => (record.value
  ? printRows(record.value)
  : { applicable: [], notApplicable: [] }));

const materials = computed(() => printMaterials(participating.value));

const applicableWithEvidence = computed(() => rows.value.applicable.filter((row) => row.evidence.satisfied || row.evidence.how || row.evidence.testInput || row.evidence.providedAt || row.evidence.expectedAt));

function evidenceStateText(state: EvidenceState): string {
  return t(`surveys.workspace.evidence.states.${state}`);
}

function dateText(value?: string): string {
  return value || '—';
}

function goBack() {
  if (!record.value) return;
  void router.push({ name: 'survey-detail-steps', params: { id: record.value.id, step: '6' } });
}

function doPrint() {
  window.print();
}
</script>

<template>
  <div class="print-shell">
    <!-- 操作条：仅屏幕可见 -->
    <div class="print-bar">
      <button type="button" class="print-btn" @click="goBack">{{ t('surveys.workspace.print.back') }}</button>
      <button type="button" class="print-btn print-btn-primary" @click="doPrint">{{ t('surveys.workspace.print.print') }}</button>
    </div>

    <div v-if="loading" class="print-paper print-loading">{{ t('surveys.create.loading') }}</div>

    <div v-else-if="!record" class="print-paper print-loading">
      <p>{{ t('surveys.create.surveyMissing') }}</p>
      <button type="button" class="print-btn" @click="goBack">{{ t('surveys.workspace.print.back') }}</button>
    </div>

    <article v-else class="print-paper" data-testid="print-paper">
      <!-- 页眉：功能名 + 填写日期（F-EXP-04 硬要求） -->
      <header class="print-head">
        <div class="print-brand">
          <span class="print-brand-name">天衡 · CSA</span>
          <span class="print-brand-sub">{{ t('surveys.workspace.print.brandSub') }}</span>
        </div>
        <div class="print-head-main">
          <h1 class="print-title" data-testid="print-function">{{ record.functionName }}</h1>
          <p class="print-meta" data-testid="print-fill-date">
            {{ t('surveys.workspace.print.fillDate') }}{{ dateText(record.updatedAt) }}
          </p>
        </div>
      </header>

      <!-- 概要：身份与版本，一屏可核 -->
      <section class="print-section">
        <h2 class="print-h2">{{ t('surveys.workspace.print.summaryTitle') }}</h2>
        <dl class="print-facts">
          <div><dt>{{ t('surveys.fields.surveyNo') }}</dt><dd>{{ record.id }}</dd></div>
          <div><dt>{{ t('surveys.fields.fuliId') }}</dt><dd>{{ record.fuliId }}</dd></div>
          <div><dt>{{ t('ledger.fields.owner') }}</dt><dd>{{ record.owner }}</dd></div>
          <div><dt>{{ t('surveys.fields.respondent') }}</dt><dd>{{ record.respondent }}</dd></div>
          <div><dt>{{ t('surveys.fields.clauses') }}</dt><dd>{{ record.matchedCount }}/{{ record.totalCount }}</dd></div>
          <div><dt>{{ t('surveys.workspace.print.scopeClauses') }}</dt><dd>{{ participating.length }}</dd></div>
        </dl>
      </section>

      <!-- 适用条目与证据：主体 -->
      <section class="print-section">
        <h2 class="print-h2">
          {{ t('surveys.workspace.print.applicableTitle', { count: rows.applicable.length }) }}
        </h2>
        <p v-if="!rows.applicable.length" class="print-note">{{ t('surveys.workspace.print.noApplicable') }}</p>
        <table v-else class="print-table">
          <thead>
            <tr>
              <th class="col-no">{{ t('surveys.workspace.evidence.columns.item') }}</th>
              <th class="col-summary">{{ t('surveys.workspace.evidence.columns.summary') }}</th>
              <th class="col-state">{{ t('surveys.workspace.evidence.columns.state') }}</th>
              <th class="col-evidence">{{ t('surveys.workspace.print.evidenceTitle') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows.applicable" :key="row.item.id" :data-item-id="row.item.id">
              <td class="col-no">{{ row.item.id }}</td>
              <td class="col-summary">{{ row.item.summary }}</td>
              <td class="col-state">{{ evidenceStateText(row.state as EvidenceState) }}</td>
              <td class="col-evidence">
                <p v-if="row.evidence.satisfied"><span class="print-label">{{ t('surveys.workspace.print.evidenceSatisfied') }}</span>{{ row.evidence.satisfied }}</p>
                <p v-if="row.evidence.how"><span class="print-label">{{ t('surveys.workspace.print.evidenceHow') }}</span>{{ row.evidence.how }}</p>
                <p v-if="row.evidence.testInput"><span class="print-label">{{ t('surveys.workspace.print.evidenceTestInput') }}</span>{{ row.evidence.testInput }}</p>
                <p>
                  <span class="print-label">{{ t('surveys.workspace.print.evidenceTime') }}</span>
                  {{ row.evidence.providedAt ? row.evidence.providedAt : t('surveys.workspace.print.expectedAt', { date: dateText(row.evidence.expectedAt) }) }}
                </p>
                <p v-if="row.evidence.links.length" class="print-links">
                  <span class="print-label">{{ t('surveys.workspace.print.evidenceLinks') }}</span>{{ row.evidence.links.join('；') }}
                </p>
                <p v-if="row.evidence.files.length" class="print-links">
                  <span class="print-label">{{ t('surveys.workspace.print.evidenceFiles') }}</span>{{ row.evidence.files.map((file) => file.name).join('；') }}
                </p>
                <p v-if="!applicableWithEvidence.some((item) => item.item.id === row.item.id)" class="print-empty">{{ t('surveys.workspace.print.noEvidence') }}</p>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- 材料清单：按阶段分组（F-MAT-02） -->
      <section class="print-section">
        <h2 class="print-h2">{{ t('surveys.workspace.print.materialsTitle') }}</h2>
        <div v-for="group in ([['preTest', materials.preTest], ['inTest', materials.inTest]] as const)" :key="group[0]" class="print-material-group">
          <h3 class="print-h3">{{ t(`surveys.workspace.evidence.materialStage.${group[0] === 'preTest' ? 'pre-test' : 'in-test'}`) }}</h3>
          <p v-if="!group[1].length" class="print-note">{{ t('surveys.workspace.print.noMaterial') }}</p>
          <ul v-else class="print-material-list">
            <li v-for="material in group[1]" :key="material.id">
              <span class="print-material-name">{{ material.name }}</span>
              <span class="print-material-meta">
                {{ t(`surveys.workspace.evidence.materialBasis.${material.basis}`) }}
                · {{ material.clauses.length ? material.clauses.join('、') : t('surveys.workspace.print.commonMaterial') }}
                · {{ materialStatus(record.id, material.id).ready ? t('surveys.workspace.evidence.railReady') : t('surveys.workspace.evidence.railUnreadyTag') }}
              </span>
            </li>
          </ul>
        </div>
      </section>

      <!-- 不适用条目：折叠后置，默认收起 -->
      <section class="print-section print-foldable">
        <details>
          <summary class="print-h2 print-summary">
            {{ t('surveys.workspace.print.notApplicableTitle', { count: rows.notApplicable.length }) }}
          </summary>
          <p class="print-note">{{ t('surveys.workspace.print.notApplicableNote') }}</p>
          <p v-if="!rows.notApplicable.length" class="print-note">{{ t('surveys.workspace.print.noNotApplicable') }}</p>
          <ul v-else class="print-not-applicable">
            <li v-for="row in rows.notApplicable" :key="row.item.id">
              <span class="print-na-no">{{ row.item.id }}</span>
              <span>{{ row.item.summary }}</span>
            </li>
          </ul>
        </details>
      </section>

      <footer class="print-foot">
        <span>{{ t('surveys.workspace.print.footerNote') }}</span>
        <span>{{ t('surveys.workspace.print.printTime') }}{{ printedAt }}</span>
      </footer>
    </article>
  </div>
</template>

<style scoped>
/* 纸面固定白底黑字：打印与归档不跟随深浅主题 */
.print-shell {
  min-height: 100dvh;
  padding: 24px 16px 40px;
  background: var(--app-print-canvas);
  color: var(--app-print-text);
  font-size: 12px;
  line-height: 1.6;
}

.print-bar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 210mm;
  max-width: 100%;
  margin: 0 auto 12px;
}

.print-btn {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--app-print-border);
  border-radius: 2px;
  background: var(--app-print-paper);
  color: var(--app-print-text);
  font-size: 14px;
  line-height: 30px;
  cursor: pointer;
}

.print-btn:hover { border-color: var(--app-print-primary); color: var(--app-print-primary); }
.print-btn:focus-visible { outline: 2px solid var(--app-print-primary); outline-offset: 2px; }
.print-btn-primary { border-color: var(--app-print-primary); background: var(--app-print-primary); color: var(--app-print-paper); }
.print-btn-primary:hover { background: var(--app-print-primary-hover); color: var(--app-print-paper); }

.print-paper {
  box-sizing: border-box;
  width: 210mm;
  min-height: 297mm;
  max-width: 100%;
  margin: 0 auto;
  padding: 16mm 16mm 14mm;
  background: var(--app-print-paper);
  box-shadow: var(--app-print-shadow);
}

.print-loading { display: grid; place-items: center; color: var(--app-print-secondary); }

/* 页眉 */
.print-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12mm; padding-bottom: 4mm; border-bottom: 2px solid var(--app-print-text); }
.print-brand { display: flex; flex-direction: column; gap: 1mm; }
.print-brand-name { font-size: 13px; font-weight: 600; letter-spacing: 0.5px; }
.print-brand-sub { font-size: 10px; color: var(--app-print-muted); }
.print-head-main { text-align: right; }
.print-title { margin: 0; font-size: 19px; font-weight: 600; line-height: 1.35; }
.print-meta { margin: 1mm 0 0; color: var(--app-print-secondary); font-size: 11px; }

/* 小节 */
.print-section { margin-top: 6mm; break-inside: auto; }
.print-h2 { margin: 0 0 2.5mm; font-size: 13px; font-weight: 600; line-height: 1.5; padding-left: 2.5mm; border-left: 3px solid var(--app-print-text); }
.print-h3 { margin: 3mm 0 1.5mm; font-size: 11.5px; font-weight: 600; }
.print-note { margin: 0 0 2mm; color: var(--app-print-secondary); }
.print-summary { cursor: pointer; }

/* 概要 */
.print-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5mm 6mm; margin: 0; }
.print-facts div { display: flex; gap: 2mm; min-width: 0; }
.print-facts dt { flex: none; color: var(--app-print-secondary); }
.print-facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }

/* 表格 */
.print-table { width: 100%; border-collapse: collapse; }
.print-table th, .print-table td { border: 1px solid var(--app-print-divider); padding: 1.6mm 2mm; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
.print-table th { background: var(--app-print-canvas); font-weight: 600; }
.print-table tr { break-inside: avoid; }
.print-table thead { display: table-header-group; }
.col-no { width: 15%; }
.col-summary { width: 26%; }
.col-state { width: 10%; }
.col-evidence { width: 49%; }
.print-label { color: var(--app-print-muted); }
.print-label::after { content: '：'; }
.print-table p { margin: 0 0 1mm; }
.print-links { color: var(--app-print-secondary); word-break: break-all; }
.print-empty { color: var(--app-print-muted); }

/* 材料 */
.print-material-group { break-inside: avoid; }
.print-material-list { margin: 0; padding-left: 4mm; }
.print-material-list li { margin-bottom: 0.8mm; }
.print-material-name { font-weight: 500; }
.print-material-meta { color: var(--app-print-muted); margin-left: 2mm; }

/* 不适用 */
.print-not-applicable { margin: 0; padding-left: 4mm; color: var(--app-print-secondary); }
.print-not-applicable li { margin-bottom: 0.8mm; }
.print-na-no { display: inline-block; min-width: 22mm; color: var(--app-print-muted); }

/* 页脚 */
.print-foot { display: flex; justify-content: space-between; gap: 6mm; margin-top: 8mm; padding-top: 2.5mm; border-top: 1px solid var(--app-print-divider); color: var(--app-print-muted); font-size: 10px; }

@page {
  size: A4;
  margin: 16mm 16mm 14mm;
}

@media print {
  .print-shell { min-height: 0; padding: 0; background: var(--app-print-paper); }
  .print-bar { display: none; }
  .print-paper { width: auto; min-height: 0; padding: 0; margin: 0; box-shadow: none; }
  .print-foot { break-inside: avoid; }
}
</style>
