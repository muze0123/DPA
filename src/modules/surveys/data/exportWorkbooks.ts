/**
 * 证据与导出的工作簿生成与回读（F-EXP-01~07、BR-056/058、RD-08）。
 *
 * 三类 xlsx 都由 ExcelJS 在浏览器端真实生成（不伪造下载链接），页面层拿 Blob 挂到任务中心；
 * 文案由页面层翻译后传入或直接使用业务数据原文，保持本文件与 i18n 解耦（与 audit/export 同一约定）。
 *
 * **空值口径（F-EXP-07 / Q-28）**：值单元格一律留空，不写「未填写」「N/A」等占位文字，
 * 保证导出 → 再导入往返一致；缺值只在展示层（列头说明、页面徽标）表达。
 *
 * **回读范围（RD-08）**：`parseFilledWorkbook` 只读本模块写出的结构（问卷概要 / 12 题 / 填写分区 / 证据），
 * 官方模板的导入映射表尚未冻结（BR-056 待与需求方验样），因此往返校验是「自家格式自洽性」验证，
 * 不能宣称已满足正式导入映射。
 */
import ExcelJS from 'exceljs';
import { CLAUSES, finalApplicability, type ClauseDef } from './matching';
import { ITEM_CATALOG, itemById, type RequirementItem } from './items';
import { readSectionValues } from '../../sections/data/sectionProgress';
import { SECTION_DEFS, SECTION_FIELDS, type SectionKey } from '../../sections/data/sectionCatalog';
import { evidenceOf, evidenceState, type EvidenceEntry } from './evidence';
import { MATERIALS, materialsForClauses, materialStatus } from './materials';
import type { SurveyRecord } from './surveys';
import { questionsForVersion } from './questions';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/* ------------------------------------------------------------------ 公共 */

function sheetOf(workbook: ExcelJS.Workbook, name: string, widths: number[]): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(name);
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  return sheet;
}

function headerRow(sheet: ExcelJS.Worksheet, headers: string[]): void {
  const row = sheet.addRow(headers);
  row.font = { bold: true };
  row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F7F9' } }; });
}

function blank(value: string | undefined | null): string {
  return value ?? '';
}

function text(value: string | number | undefined | null): string {
  return value === undefined || value === null ? '' : String(value);
}

export async function toBlob(workbook: ExcelJS.Workbook): Promise<Blob> {
  return new Blob([await workbook.xlsx.writeBuffer() as BlobPart], { type: XLSX_MIME });
}

/** 导出文件名：问卷号_FuLiID_功能名_类型.xlsx（文件名里的业务名词取记录原文） */
export function exportFileName(
  record: SurveyRecord,
  kind: 'filled' | 'requirements' | 'testInput' | 'sections',
): string {
  const suffix = kind === 'filled' ? '填写版'
    : kind === 'requirements' ? '安全需求清单'
      : kind === 'sections' ? '填写分区' : '测试输入要求';
  const safe = `${record.id}_${record.fuliId}_${record.functionName}`.replace(/[\\/:*?"<>|]/g, '-');
  return `${safe}_${suffix}.xlsx`;
}

/* ------------------------------------------------------ 填写分区（单表导出） */

/**
 * 「填写分区」单表导出：54 + 3 个字段位一行（分区键/分区/字段位/字段名/值），
 * 结构与填写版工作簿的「填写分区」sheet 一致；空值留空（F-EXP-07），不参与回读契约（RD-08）。
 */
export async function buildSectionFillWorkbook(record: SurveyRecord): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '天衡 CSA';
  const sheet = sheetOf(workbook, FILLED_SHEETS.sections, [14, 18, 10, 34, 46]);
  headerRow(sheet, ['分区键', '分区', '字段位', '字段名', '值']);
  const values = readSectionValues(record.id);
  for (const def of SECTION_DEFS) {
    for (const field of SECTION_FIELDS.filter((item) => item.section === def.key)) {
      sheet.addRow([def.key, def.order, field.code, field.labelZh, blank(values[def.key as SectionKey]?.[field.code])]);
    }
  }
  return workbook;
}

/* -------------------------------------------------------- 填写版问卷（可再导入） */

export interface FilledWorkbookContext {
  /** 题目答案的展示文案（是/否/待定），由页面层翻译后传入 */
  answerText: (value: string) => string;
  /** 条款适用性与条目状态文案 */
  applicabilityText: (value: 'applicable' | 'not-applicable' | 'pending-review') => string;
  itemStateText: (state: string) => string;
}

/**
 * 题目行（快照优先，回落到当前模板）：快照里的 guide 是冻结文本，
 * 当前模板的 guide 是结构化对象（依据 + 典型场景），导出时拼成一行可读文本。
 */
function questionRows(record: SurveyRecord): { code: string; title: string; guide: string }[] {
  const snapshot = record.creationSnapshot?.questions;
  if (snapshot?.length) return snapshot.map((question) => ({ code: question.code, title: question.title, guide: question.guide }));
  return questionsForVersion(record.creationSnapshot?.templateVersion).map((question) => ({
    code: question.code,
    title: question.title,
    guide: [question.guide.basis, ...question.guide.scenarios].filter(Boolean).join('；'),
  }));
}

const FILLED_SHEETS = {
  summary: '问卷概要',
  answers: '12题作答',
  clauses: '条款匹配',
  sections: '填写分区',
  evidence: '证据与测试输入',
} as const;

export async function buildFilledWorkbook(record: SurveyRecord, context: FilledWorkbookContext): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '天衡 CSA';

  /* ① 概要：7 个主数据字段（空值留空） */
  const summary = sheetOf(workbook, FILLED_SHEETS.summary, [22, 46]);
  headerRow(summary, ['字段', '值']);
  const basics: [string, string][] = [
    ['问卷编号', record.id],
    ['FuLi ID', record.fuliId],
    ['功能名称', record.functionName],
    ['功能负责人', record.owner],
    ['填表人', record.respondent],
    ['创建时间', record.createdAt],
    ['更新时间', record.updatedAt],
  ];
  for (const [key, value] of basics) summary.addRow([key, blank(value)]);

  /* ② 12 题作答（按快照题目集，未答留空） */
  const answers = sheetOf(workbook, FILLED_SHEETS.answers, [12, 52, 14, 46]);
  headerRow(answers, ['题号', '题目', '答案', '判断指引']);
  for (const row of questionRows(record)) {
    const value = record.answers?.[row.code];
    answers.addRow([row.code, row.title, value ? context.answerText(value) : '', row.guide]);
  }

  /* ③ 填写分区：54 个字段位一行（脏值留空，不写占位） */
  const sections = sheetOf(workbook, FILLED_SHEETS.sections, [14, 18, 10, 34, 46]);
  headerRow(sections, ['分区键', '分区', '字段位', '字段名', '值']);
  const values = readSectionValues(record.id);
  for (const def of SECTION_DEFS) {
    for (const field of SECTION_FIELDS.filter((item) => item.section === def.key)) {
      sections.addRow([def.key, def.order, field.code, field.labelZh, blank(values[def.key as SectionKey]?.[field.code])]);
    }
  }

  /* ④ 证据与测试输入（一行一参与条目） */
  const evidenceSheet = sheetOf(workbook, FILLED_SHEETS.evidence, [12, 46, 40, 40, 16, 16, 34]);
  headerRow(evidenceSheet, ['条目号', '安全需求摘要', '已满足证据', '如何满足的证据（CR）', '提供证据时间', '预计提供时间', '必要测试输入']);
  for (const item of ITEM_CATALOG) {
    if (item.kind !== 'requirement') continue;
    const entry = evidenceOf(record.id, item.id);
    if (!entry.satisfied && !entry.how && !entry.testInput && !entry.providedAt && !entry.expectedAt) continue;
    evidenceSheet.addRow([item.id, item.summary, blank(entry.satisfied), blank(entry.how), blank(entry.providedAt), blank(entry.expectedAt), blank(entry.testInput)]);
  }

  /* ⑤ 条款匹配（自动/人工/最终 + 条目审核状态） */
  const clauses = sheetOf(workbook, FILLED_SHEETS.clauses, [12, 20, 20, 20, 46]);
  headerRow(clauses, ['条款号', '自动初筛', '人工确认', '最终适用性', '条款原文（第 6 章摘要）']);
  for (const clause of CLAUSES) {
    const automatic = record.matching?.autoResults[clause.no];
    const manual = record.matching?.manual[clause.no];
    clauses.addRow([
      clause.no,
      automatic ? context.applicabilityText(automatic === 'applicable' ? 'applicable' : automatic === 'not-hit' ? 'not-applicable' : 'pending-review') : '',
      manual ? context.applicabilityText(manual.value) : '',
      record.matching ? context.applicabilityText(finalApplicability(record.matching, clause.no)) : '',
      clause.original,
    ]);
  }

  return workbook;
}

/* ------------------------------------------------------ 安全需求清单状态 */

export async function buildRequirementWorkbook(
  record: SurveyRecord,
  scope: 'all' | 'engaged',
  context: FilledWorkbookContext,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const sheet = sheetOf(workbook, '安全需求清单状态', [12, 14, 46, 60, 10, 30, 14, 14, 14, 14, 12, 12]);
  headerRow(sheet, ['条款号', '条目号', '安全需求摘要', '安全需求原文', '第 9 章', '测试方法', '自动初筛', '人工确认', '最终适用性', '条目审核状态', '证据状态', '是否参与']);

  for (const item of ITEM_CATALOG) {
    const clause = CLAUSES.find((entry) => entry.no === item.no) as ClauseDef;
    const applicability = record.matching ? finalApplicability(record.matching, item.no) : 'pending-review';
    const engaged = applicability === 'applicable';
    if (scope === 'engaged' && !engaged) continue;
    const automatic = record.matching?.autoResults[item.no];
    const manual = record.matching?.manual[item.no];
    const auditState = item.kind === 'segment' ? 'locked' : engaged ? 'engaged' : 'excluded';
    const entry = evidenceOf(record.id, item.id);
    const evidenceLabel = item.kind === 'segment'
      ? ''
      : context.itemStateText(evidenceState(entry, auditState === 'engaged'));
    sheet.addRow([
      item.no, item.id, item.summary, item.content, clause?.testChapter ?? '', clause?.testMethod ?? '',
      automatic ? context.applicabilityText(automatic === 'applicable' ? 'applicable' : automatic === 'not-hit' ? 'not-applicable' : 'pending-review') : '',
      manual ? context.applicabilityText(manual.value) : '',
      context.applicabilityText(applicability),
      item.kind === 'segment' ? context.itemStateText('locked') : '',
      evidenceLabel,
      engaged ? '是' : '否',
    ]);
  }
  return workbook;
}

/* ------------------------------------------------------ 测试输入要求清单 */

export async function buildTestInputWorkbook(record: SurveyRecord, participating: readonly string[]): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();

  /* ① 开测前材料与条件 */
  const materials = sheetOf(workbook, '开测前材料与条件', [12, 46, 12, 12, 12, 52, 26]);
  headerRow(materials, ['材料编号', '材料名称', '阶段', '依据来源', '形态', '生成方式', '关联条款']);
  for (const material of materialsForClauses(participating)) {
    materials.addRow([
      material.id, material.name, material.stage === 'pre-test' ? '开测前' : '测试中',
      material.basis === 'ch6' ? '第 6 章 Document 段' : material.basis === 'ch9' ? '第 9 章点名' : '第 6 章 + 第 9 章',
      material.form, material.method, material.clauses.join('、'),
    ]);
  }

  /* ② 各条款测试输入与配套材料 */
  const inputs = sheetOf(workbook, '各条款测试输入', [12, 30, 46, 40, 40]);
  headerRow(inputs, ['条款号', '测试方法（第 9 章）', '必要测试输入', '需同时提交的材料', '证据提供情况']);
  for (const clause of CLAUSES) {
    if (!participating.includes(clause.no)) continue;
    const items = ITEM_CATALOG.filter((item) => item.no === clause.no && item.kind === 'requirement');
    const testInput = items.map((item) => evidenceOf(record.id, item.id).testInput).filter(Boolean).join('；');
    const related = materialsForClauses([clause.no]).map((material) => material.name).join('；');
    const provided = items.map((item) => evidenceOf(record.id, item.id).providedAt).filter(Boolean);
    inputs.addRow([clause.no, clause.testMethod, testInput, related, provided.length ? provided.join('、') : '']);
  }
  return workbook;
}

/* ------------------------------------------------------------- 回读与比对 */

export interface ParsedFilledWorkbook {
  summary: Record<string, string>;
  answers: Record<string, string>;
  sections: Record<string, string>;
  evidence: Record<string, Pick<EvidenceEntry, 'satisfied' | 'how' | 'providedAt' | 'expectedAt' | 'testInput'>>;
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in value) return String((value as { text: string }).text ?? '');
  if (typeof value === 'object' && 'richText' in value) return (value as { richText: { text: string }[] }).richText.map((run) => run.text).join('');
  return String(value);
}

function rowCells(row: ExcelJS.Row): string[] {
  const out: string[] = [];
  for (let index = 1; index <= row.cellCount; index += 1) out.push(cellText(row.getCell(index)).trim());
  return out;
}

/** 解析填写版工作簿（只认本模块写出的四张表；表头首行固定） */
export async function parseFilledWorkbook(buffer: ArrayBuffer): Promise<ParsedFilledWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const parsed: ParsedFilledWorkbook = { summary: {}, answers: {}, sections: {}, evidence: {} };

  const summary = workbook.getWorksheet(FILLED_SHEETS.summary);
  summary?.eachRow((row, index) => {
    if (index === 1) return;
    const [key, value] = rowCells(row);
    if (key) parsed.summary[key] = value ?? '';
  });

  const answers = workbook.getWorksheet(FILLED_SHEETS.answers);
  answers?.eachRow((row, index) => {
    if (index === 1) return;
    const [code, , value] = rowCells(row);
    if (code) parsed.answers[code] = value ?? '';
  });

  const sections = workbook.getWorksheet(FILLED_SHEETS.sections);
  sections?.eachRow((row, index) => {
    if (index === 1) return;
    const [section, , code, , value] = rowCells(row);
    if (section && code) parsed.sections[`${section}.${code}`] = value ?? '';
  });

  const evidence = workbook.getWorksheet(FILLED_SHEETS.evidence);
  evidence?.eachRow((row, index) => {
    if (index === 1) return;
    const [itemId, , satisfied, how, providedAt, expectedAt, testInput] = rowCells(row);
    if (itemId) parsed.evidence[itemId] = { satisfied, how, providedAt, expectedAt, testInput };
  });

  return parsed;
}

export type RoundTripScope = 'summary' | 'answers' | 'sections' | 'evidence';

export interface RoundTripDiff {
  scope: RoundTripScope;
  key: string;
  expected: string;
  actual: string;
}

export interface RoundTripResult {
  diffs: RoundTripDiff[];
  checked: Record<RoundTripScope, number>;
}

/**
 * 导出 → 再导入一致性比对（RD-08）：比对 7 个概要字段、12 题、54 字段位与逐条证据。
 * 空值口径同时被验证：导出留空 → 回读仍为空，不应出现「未填写」等占位文字。
 */
export function compareRoundTrip(record: SurveyRecord, parsed: ParsedFilledWorkbook, answerText: (value: string) => string): RoundTripResult {
  const diffs: RoundTripDiff[] = [];
  const checked: Record<RoundTripScope, number> = { summary: 0, answers: 0, sections: 0, evidence: 0 };
  const push = (scope: RoundTripScope, key: string, expected: string, actual: string) => {
    checked[scope] += 1;
    if ((expected ?? '') !== (actual ?? '')) diffs.push({ scope, key, expected: expected ?? '', actual: actual ?? '' });
  };

  push('summary', '问卷编号', record.id, parsed.summary['问卷编号'] ?? '');
  push('summary', 'FuLi ID', record.fuliId, parsed.summary['FuLi ID'] ?? '');
  push('summary', '功能名称', record.functionName, parsed.summary['功能名称'] ?? '');
  push('summary', '功能负责人', record.owner, parsed.summary['功能负责人'] ?? '');
  push('summary', '填表人', record.respondent, parsed.summary['填表人'] ?? '');

  for (const { code } of questionRows(record)) {
    const value = record.answers?.[code];
    push('answers', code, value ? answerText(value) : '', parsed.answers[code] ?? '');
  }

  const values = readSectionValues(record.id);
  for (const field of SECTION_FIELDS) {
    const key = `${field.section}.${field.code}`;
    push('sections', key, values[field.section as SectionKey]?.[field.code] ?? '', parsed.sections[key] ?? '');
  }

  for (const item of ITEM_CATALOG) {
    if (item.kind !== 'requirement') continue;
    const entry = evidenceOf(record.id, item.id);
    if (!entry.satisfied && !entry.how && !entry.testInput && !entry.providedAt && !entry.expectedAt) continue;
    const row = parsed.evidence[item.id];
    push('evidence', `${item.id}.satisfied`, entry.satisfied, row?.satisfied ?? '');
    push('evidence', `${item.id}.how`, entry.how, row?.how ?? '');
    push('evidence', `${item.id}.providedAt`, entry.providedAt ?? '', row?.providedAt ?? '');
    push('evidence', `${item.id}.expectedAt`, entry.expectedAt ?? '', row?.expectedAt ?? '');
    push('evidence', `${item.id}.testInput`, entry.testInput, row?.testInput ?? '');
  }

  return { diffs, checked };
}

/* ------------------------------------------------------------- 打印数据 */

export interface PrintRow {
  item: RequirementItem;
  evidence: EvidenceEntry;
  state: string;
}

/** 打印视图数据：适用优先、未参与折叠后置（F-EXP-04） */
export function printRows(record: SurveyRecord): { applicable: PrintRow[]; notApplicable: PrintRow[] } {
  const applicable: PrintRow[] = [];
  const notApplicable: PrintRow[] = [];
  for (const item of ITEM_CATALOG) {
    if (item.kind !== 'requirement') continue;
    const applicability = record.matching ? finalApplicability(record.matching, item.no) : 'pending-review';
    const evidence = evidenceOf(record.id, item.id);
    const row: PrintRow = { item, evidence, state: evidenceState(evidence, applicability === 'applicable') };
    if (applicability === 'applicable') applicable.push(row);
    else notApplicable.push(row);
  }
  return { applicable, notApplicable };
}

/** 打印页材料小节（按阶段分组） */
export function printMaterials(participating: readonly string[]) {
  return {
    preTest: materialsForClauses(participating, { stage: 'pre-test' }),
    inTest: materialsForClauses(participating, { stage: 'in-test' }),
  };
}

export function materialReady(surveyId: string, materialId: string): boolean {
  return materialStatus(surveyId, materialId).ready;
}

export function allMaterialNames(): string[] {
  return MATERIALS.map((material) => material.name);
}

export { itemById };
