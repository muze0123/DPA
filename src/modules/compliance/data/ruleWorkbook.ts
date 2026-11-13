import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { CLAUSES, clauseByNo, clauseTopic } from '../../surveys/data/matching';
import { surveyTemplates } from '../../templates/data/templates';
import { CLAUSE_SECTION_KEYS, fieldsOf, type SectionKey } from '../../sections/data/sectionCatalog';
import {
  createRuleVersion, listRuleVersions, readableOfExpr, standardSourceOptions,
  updateRuleVersion, type ClauseSectionDraft, type RuleVersion,
} from './ruleVersions';
import { SAFETY_REQUIREMENT_ENTRIES } from './safetyRequirementEntries';
import { REQUIREMENT_FILTER_ENTRIES } from './requirementFilterEntries';
import { SAFETY_REQUIREMENT_SOURCE } from './safetyRequirements';
import { TEST_METHOD_SOURCE, testMethodOptions } from './testMethods';
import { triggerTreeFromExpr } from './triggerTree';

/**
 * 规则管理批量导入/导出工作簿（2026-11-02 用户裁决）：
 * - 一行 = 一个条款配置；「规则编号」相同的行聚合为一条规则（38 行 = 一条规则），一份工作簿可多条；
 * - 「编号/主题/触发规则/涉及问题/第9章/测试方法/安全需求/填写分区」与规则详情条款表逐列对应；
 * - 导入与已有规则编号相同 → 按工作簿内容更新该规则（部分成功语义），失败行不影响成功行；
 * - 工作簿不含来源类字段（标准库/问题库/安全需求/测试方法来源），新建规则使用默认来源。
 */
export const SHEET_NAME = '规则列表';
export const HEADERS = ['规则编号', '编号', '主题', '触发规则', '涉及问题', '第9章', '测试方法', '安全需求', '填写分区'] as const;
const REQUIRED_HEADERS = ['规则编号', '编号', '触发规则'] as const;
const EXPORT_EXTRA = ['规则状态', '规则说明', '题目数', '创建人', '创建时间', '最近更新时间', '是否启用'] as const;
const ERROR_HEADER = '错误原因';
const MAX_BYTES = 20 * 1024 * 1024;

/** 工作簿为中文表头，分区名称 ↔ 分区键（与任务管理填写分区命名一致） */
const SECTION_LABELS: Record<SectionKey, string> = {
  basicInfo: '基础信息', consent: '告知与同意', transmission: '数据传输',
  sensors: '传感器', biometric: '生物特征与口令', anonymization: '匿名化', materials: '通用材料',
};
const SECTION_BY_LABEL = new Map(Object.entries(SECTION_LABELS).map(([key, label]) => [label, key as SectionKey]));
const METHOD_VALUES = new Set(testMethodOptions().map((item) => item.value));
/** 合法条目编号：旧口径 SR-###（单元格条目）+ 现行 RF-<条款>-DEV/DOC<n>（需求筛选条目，2026-11-02） */
const SR_IDS = new Set([
  ...SAFETY_REQUIREMENT_ENTRIES.map((entry) => entry.id),
  ...REQUIREMENT_FILTER_ENTRIES.map((entry) => entry.id),
]);
const CLAUSE_BY_NO = new Map(CLAUSES.map((clause) => [clause.no, clause]));

/** 存量引用 → 条目编号（RF-… 原样透传；兼容旧 '条目号-摘要' 格式，取条款号映射回单元格条目） */
function srCodeOf(ref: string): string {
  const value = ref.trim();
  if (/^RF-[0-9.]+-DEV\d+$/i.test(value)) return value.toUpperCase();
  if (/^SR-\d+$/i.test(value)) return value.toUpperCase();
  const match = /^(\d+(?:\.\d+)*)/.exec(value);
  if (match) {
    const entry = SAFETY_REQUIREMENT_ENTRIES.find((item) => item.no === match[1]);
    if (entry) return entry.id;
  }
  return value;
}

export interface RuleRowInput {
  /** 规则编号（聚合键，同一编号聚合为一条规则） */
  ruleNo: string;
  /** 条款编号（如 6.1.1） */
  clauseNo: string;
  /** 触发规则表达式（Qn 文法） */
  expr: string;
  /** 测试方法（天枢-标准库登记值，可空） */
  testMethod: string;
  /** 安全需求条目编号（SR-###，可空） */
  requirementRefs: string[];
  /** 填写分区（可空） */
  section: SectionKey | '';
  /** 字段位（可空） */
  field: string;
}

export interface RuleImportItem { row: number; input: RuleRowInput }
export interface RuleImportFailure { row: number; input: RuleRowInput; reason: string }
export interface ParsedRuleWorkbook { items: RuleImportItem[]; failures: RuleImportFailure[] }

function readCell(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ('richText' in value) return value.richText.map((part) => part.text).join('').trim();
  if ('text' in value) return String(value.text).trim();
  if ('result' in value) return readCell(value.result ?? null);
  return '';
}

function baseWorkbook(): { workbook: ExcelJS.Workbook; sheet: ExcelJS.Worksheet } {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '功能数据安全合规自评';
  const sheet = workbook.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.addRow([...HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).height = 26;
  sheet.columns = [18, 10, 26, 30, 18, 12, 34, 22, 20].map((width) => ({ width }));
  [3, 4, 7, 8].forEach((column) => { sheet.getColumn(column).alignment = { vertical: 'top', wrapText: true }; });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } };
  return { workbook, sheet };
}

const TEMPLATE_NOTES = [
  '一行对应一个条款配置；「规则编号」相同的行聚合为一条规则（38 行 = 一条规则），一份工作簿可同时导入多条规则。',
  '「编号」为第 6 章条款编号（如 6.1.1）；「主题」「涉及问题」「第9章」列仅作参照，导入时以标准库与「触发规则」列为准。',
  '「触发规则」列为该条款的判定表达式（如 OR(Q1,Q5)），Qn 为题号；语法或层级不通过的行将作为错误行返回。',
  '「测试方法」列填写天枢-标准库登记的测试方法（如 9.3.1-按附录B确认基本功能数据类型声明），留空表示未配置；「安全需求」列填写需求条目编号（如 SR-001 或 RF-6.1.1-DEV1），多个用「、」分隔。',
  '「填写分区」列格式为「分区名称·字段位」（如 基础信息·E2），留空表示未分配。',
  '支持不超过 20 MB 的 .xlsx 或 UTF-8 .csv 文件，不限制行数；CSV 请使用与模板一致的表头。',
  '导入时与已有规则编号相同的规则会按工作簿内容更新（失败行不影响成功行保存）。',
  '工作簿不含来源类字段（标准库/问题库/安全需求/测试方法来源），新建规则使用默认来源，可在编辑页调整。',
] as const;

export async function makeTemplate(): Promise<Blob> {
  const { workbook } = baseWorkbook();
  const help = workbook.addWorksheet('填写说明');
  TEMPLATE_NOTES.forEach((line) => help.addRow([line]));
  help.getColumn(1).width = 105;
  return new Blob([await workbook.xlsx.writeBuffer() as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** 单条款行（导出与错误数据共用；9 列与模板一致） */export function workbookRow(rule: RuleVersion, clauseNo: string): string[] {
  const clause = clauseByNo(clauseNo);
  const expr = rule.expressions[clauseNo]?.expr ?? '';
  const involved = [...new Set(expr.match(/Q\d+/g) ?? [])].join('、');
  const refs = rule.requirementItems?.[clauseNo] ?? [];
  const assign = rule.sectionAssignments?.[clauseNo];
  const sectionCell = assign?.section
    ? `${SECTION_LABELS[assign.section]}${assign.field ? `·${assign.field}` : ''}`
    : '';
  return [
    rule.ruleNo, clauseNo, clause ? clauseTopic(clauseNo) : '', expr, involved,
    clause?.testChapter ?? '', rule.testMethods?.[clauseNo] ?? '',
    refs.map((ref) => srCodeOf(ref)).join('、'), sectionCell,
  ];
}

export async function makeExport(records: RuleVersion[]): Promise<Blob> {
  const { workbook, sheet } = baseWorkbook();
  const header = sheet.getRow(1);
  EXPORT_EXTRA.forEach((name, index) => { header.getCell(HEADERS.length + index + 1).value = name; });
  sheet.getRow(1).font = { bold: true };
  EXPORT_EXTRA.forEach((_, index) => { sheet.getColumn(HEADERS.length + index + 1).width = 20; });
  records.forEach((rule) => {
    CLAUSES.forEach((clause) => {
      sheet.addRow([...workbookRow(rule, clause.no),
        rule.status === 'published' ? '已发布' : '待提交',
        rule.note ?? '', rule.questionSet.length, rule.createdBy, rule.createdAt, rule.updatedAt,
        rule.enabled ? '启用' : '停用']);
    });
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(2, records.length * CLAUSES.length + 1), column: HEADERS.length + EXPORT_EXTRA.length } };
  return new Blob([await workbook.xlsx.writeBuffer() as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function parseRows(rows: { row: number; values: string[] }[]): ParsedRuleWorkbook {
  const headers = rows[0]?.values ?? [];
  const positions = new Map(headers.map((header, index) => [header.trim().replace(/^\uFEFF/, ''), index]));
  const missing = REQUIRED_HEADERS.filter((header) => !positions.has(header));
  if (missing.length) throw new Error(`headersMissing:${missing.join('、')}`);
  const items: RuleImportItem[] = [];
  const failures: RuleImportFailure[] = [];
  const seenClause = new Set<string>();
  for (const row of rows.slice(1)) {
    const value = (header: string) => (row.values[positions.get(header)!] ?? '').trim();
    if (REQUIRED_HEADERS.every((header) => !value(header))) continue;
    const ruleNo = value('规则编号');
    const clauseNo = value('编号');
    const expr = value('触发规则');
    const errors: string[] = [];
    if (!ruleNo) errors.push('规则编号必填');
    else if (ruleNo.length > 50) errors.push('规则编号最长 50 字');
    if (!CLAUSE_BY_NO.has(clauseNo)) errors.push('条款编号无法识别');
    if (!expr) errors.push('触发规则必填');
    else if (!triggerTreeFromExpr(expr)) errors.push('触发规则表达式无法解析（需 ≤5 层、≤12 个叶子题目）');
    const testMethod = value('测试方法');
    if (testMethod && !METHOD_VALUES.has(testMethod)) errors.push('测试方法未在天枢-标准库中登记');
    const requirementRefs = value('安全需求').split(/\s*、\s*|\r?\n/).map((part) => part.trim()).filter(Boolean);
    for (const ref of requirementRefs) {
      if (!SR_IDS.has(ref.toUpperCase())) errors.push(`安全需求条目 ${ref} 无法识别`);
    }
    let section: SectionKey | '' = '';
    let field = '';
    const sectionCell = value('填写分区');
    if (sectionCell) {
      const separator = sectionCell.indexOf('·');
      const label = (separator >= 0 ? sectionCell.slice(0, separator) : sectionCell).trim();
      // 字段位与目录编码对齐：剥离尾随序号（与配置页加载口径一致，'E2' → 'E'）
      field = (separator >= 0 ? sectionCell.slice(separator + 1) : '').trim().replace(/\d+$/, '');
      const key = SECTION_BY_LABEL.get(label);
      if (!key || !CLAUSE_SECTION_KEYS.includes(key)) errors.push('填写分区的分区名称无法识别');
      else {
        section = key;
        if (field && !fieldsOf(key).some((item) => item.code === field)) errors.push('填写分区的字段位无法识别');
      }
    }
    const dupKey = `${ruleNo}\u0000${clauseNo}`;
    if (ruleNo && clauseNo && seenClause.has(dupKey)) errors.push('文件内同一规则的条款重复');
    const input: RuleRowInput = { ruleNo, clauseNo, expr, testMethod, requirementRefs, section, field };
    if (errors.length) failures.push({ row: row.row, input, reason: errors.join('、') });
    else { seenClause.add(dupKey); items.push({ row: row.row, input }); }
  }
  return { items, failures };
}

export async function parseWorkbook(file: File): Promise<ParsedRuleWorkbook> {
  if (!/\.(xlsx|csv)$/i.test(file.name)) throw new Error('fileType');
  if (file.size > MAX_BYTES) throw new Error('fileSize');
  if (/\.csv$/i.test(file.name)) {
    let csv: Papa.ParseResult<string[]>;
    try {
      const text = await file.text();
      if (text.includes('\uFFFD')) throw new Error('fileInvalid');
      csv = Papa.parse<string[]>(text);
    } catch { throw new Error('fileInvalid'); }
    if (csv.errors.length || !csv.data.length) throw new Error('fileInvalid');
    return parseRows(csv.data.map((values, index) => ({ row: index + 1, values })));
  }
  const workbook = new ExcelJS.Workbook();
  try {
    const buffer = await file.arrayBuffer();
    await workbook.xlsx.load(buffer as Parameters<typeof workbook.xlsx.load>[0]);
  } catch { throw new Error('fileInvalid'); }
  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) throw new Error('sheetMissing');
  const header = sheet.getRow(1);
  const headers = Array.from({ length: header.cellCount }, (_, index) => readCell(header.getCell(index + 1).value));
  const rows: { row: number; values: string[] }[] = [{ row: 1, values: headers }];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    rows.push({ row: rowNumber, values: Array.from({ length: Math.max(row.cellCount, header.cellCount) }, (_, index) => readCell(row.getCell(index + 1).value)) });
  });
  return parseRows(rows);
}

export async function makeErrors(failures: RuleImportFailure[]): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.addRow([ERROR_HEADER, ...HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn(1).width = 58;
  failures.forEach(({ row, input, reason }) => {
    const clause = clauseByNo(input.clauseNo);
    sheet.addRow([
      `第 ${row} 行：${reason}`, input.ruleNo, input.clauseNo, clause ? clauseTopic(input.clauseNo) : '',
      input.expr, [...new Set(input.expr.match(/Q\d+/g) ?? [])].join('、'), clause?.testChapter ?? '',
      input.testMethod, input.requirementRefs.join('、'),
      input.section ? `${SECTION_LABELS[input.section]}${input.field ? `·${input.field}` : ''}` : '',
    ]);
  });
  return new Blob([await workbook.xlsx.writeBuffer() as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export interface RuleImportResult { created: number; updated: number }

/** 聚合应用：同一规则编号的行合并为一条规则；编号已存在 → 更新（保留未覆盖条款的现行配置） */
export function applyRuleImport(items: RuleImportItem[], operator: string): RuleImportResult {
  const groups = new Map<string, RuleImportItem[]>();
  for (const item of items) {
    const key = item.input.ruleNo;
    const group = groups.get(key);
    if (group) group.push(item); else groups.set(key, [item]);
  }
  let created = 0;
  let updated = 0;
  for (const [ruleNo, group] of groups) {
    const expressions: Record<string, { expr: string; exprReadable: string }> = {};
    const requirementItems: Record<string, string[]> = {};
    const sectionAssignments: Record<string, ClauseSectionDraft> = {};
    const testMethods: Record<string, string> = {};
    for (const { input } of group) {
      expressions[input.clauseNo] = { expr: input.expr, exprReadable: readableOfExpr(input.expr) ?? '' };
      requirementItems[input.clauseNo] = [...input.requirementRefs];
      sectionAssignments[input.clauseNo] = { section: input.section, field: input.field };
      testMethods[input.clauseNo] = input.testMethod;
    }
    const existing = listRuleVersions().find((version) => version.ruleNo === ruleNo);
    if (existing) {
      // 更新：未覆盖条款保留现行配置（显式空也尊重）
      const mergedExpressions = { ...JSON.parse(JSON.stringify(existing.expressions)) as Record<string, { expr: string; exprReadable: string }>, ...expressions };
      const mergedItems = { ...JSON.parse(JSON.stringify(existing.requirementItems ?? {})) as Record<string, string[]>, ...requirementItems };
      const mergedSections = { ...JSON.parse(JSON.stringify(existing.sectionAssignments ?? {})) as Record<string, ClauseSectionDraft>, ...sectionAssignments };
      const mergedMethods = { ...(existing.testMethods ?? {}), ...testMethods };
      updateRuleVersion(existing.id, {
        ruleNo, name: existing.name, standardSource: existing.standardSource, questionSource: existing.questionSource,
        safetyRequirement: existing.safetyRequirement, testMethod: existing.testMethod, note: existing.note,
        expressions: mergedExpressions, requirementItems: mergedItems, sectionAssignments: mergedSections, testMethods: mergedMethods,
      }, operator);
      updated += 1;
      continue;
    }
    // 新建：来源类字段使用默认来源（工作簿不含来源列），缺失条款由数据层回退标准默认
    createRuleVersion({
      ruleNo, name: ruleNo,
      standardSource: standardSourceOptions()[0] ?? '',
      questionSource: surveyTemplates[0] ? `${surveyTemplates[0].id}-${surveyTemplates[0].name}` : '',
      safetyRequirement: SAFETY_REQUIREMENT_SOURCE,
      testMethod: TEST_METHOD_SOURCE,
      note: '', expressions, requirementItems, sectionAssignments, testMethods,
    }, operator);
    created += 1;
  }
  return { created, updated };
}

export function downloadWorkbook(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
