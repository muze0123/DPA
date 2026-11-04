import ExcelJS from 'exceljs';
import type { SurveyTemplate, TemplateInput } from './templates';

/** 版本号已从导出工作簿下线（2026-11-04 用户裁决：问题库不再展示版本号字段） */
export const LIBRARY_COLUMNS = ['sourceId', 'name', 'status', 'note', 'creator', 'createdAt', 'updater', 'updatedAt'] as const;
export const QUESTION_COLUMNS = ['sourceId', 'code', 'title', 'guide'] as const;

export interface WorkbookLabels {
  libraries: string;
  questions: string;
  libraryHeaders: string[];
  questionHeaders: string[];
}

export type ImportErrorCode =
  | 'fileType' | 'fileSize' | 'invalidFile' | 'structure' | 'empty' | 'tooMany'
  | 'invalidCell' | 'duplicateSource' | 'invalidLibrary'
  | 'unknownSource' | 'invalidQuestion'
  | 'sequence' | 'missingQuestions';

export class WorkbookImportError extends Error {
  constructor(public code: ImportErrorCode, public sheet: 'libraries' | 'questions' = 'libraries', public row = 0) {
    super(code);
  }
}

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_LIBRARIES = 500;
const MAX_QUESTIONS = 10000;
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function addHeader(sheet: ExcelJS.Worksheet, columns: readonly string[], labels: string[], widths: number[]) {
  sheet.addRow([...columns]).hidden = true;
  const header = sheet.addRow(labels);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', wrapText: true };
  sheet.views = [{ state: 'frozen', ySplit: 2 }];
  columns.forEach((_, index) => { sheet.getColumn(index + 1).width = widths[index]; });
  sheet.getColumn(1).numFmt = '@';
}

/** 两张表以源编号关联；隐藏首行的稳定字段键使中英文导出均可再导入。 */
export async function buildWorkbook(templates: readonly SurveyTemplate[], labels: WorkbookLabels): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const libraries = workbook.addWorksheet(labels.libraries);
  const questions = workbook.addWorksheet(labels.questions);
  addHeader(libraries, LIBRARY_COLUMNS, labels.libraryHeaders, [21, 32, 14, 48, 16, 22, 16, 22]);
  addHeader(questions, QUESTION_COLUMNS, labels.questionHeaders, [21, 12, 72, 88]);
  questions.getColumn(2).numFmt = '@';
  questions.getColumn(4).alignment = { vertical: 'top', wrapText: true };
  questions.getColumn(5).alignment = { vertical: 'top', wrapText: true };

  for (const template of templates) {
    libraries.addRow([
      template.id, template.name, template.status, template.note,
      template.creator, template.createdAt, template.updater, template.updatedAt,
    ]);
    for (const question of template.questions) {
      questions.addRow([template.id, question.code, question.title, question.guide]);
    }
  }
  return new Blob([await workbook.xlsx.writeBuffer() as BlobPart], { type: MIME });
}

function readText(row: ExcelJS.Row, column: number, sheet: 'libraries' | 'questions'): string {
  const value = row.getCell(column).value;
  if (value == null) return '';
  if (typeof value !== 'string') throw new WorkbookImportError('invalidCell', sheet, row.number);
  return value.trim();
}

function populated(row: ExcelJS.Row, length: number): boolean {
  return Array.from({ length }, (_, index) => row.getCell(index + 1).value).some((value) => value != null && value !== '');
}

export async function parseWorkbook(file: File): Promise<TemplateInput[]> {
  if (!/\.xlsx$/i.test(file.name)) throw new WorkbookImportError('fileType');
  if (file.size > MAX_BYTES) throw new WorkbookImportError('fileSize');
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer() as Parameters<typeof workbook.xlsx.load>[0]);
  } catch { throw new WorkbookImportError('invalidFile'); }

  const [libraries, questions] = workbook.worksheets;
  const hasColumns = (sheet: ExcelJS.Worksheet | undefined, columns: readonly string[]) => sheet
    && columns.every((key, index) => sheet.getRow(1).getCell(index + 1).value === key);
  if (!hasColumns(libraries, LIBRARY_COLUMNS) || !hasColumns(questions, QUESTION_COLUMNS)) {
    throw new WorkbookImportError('structure');
  }

  const inputs = new Map<string, TemplateInput>();
  libraries.eachRow((row) => {
    if (row.number <= 2 || !populated(row, LIBRARY_COLUMNS.length)) return;
    if (inputs.size >= MAX_LIBRARIES) throw new WorkbookImportError('tooMany', 'libraries', row.number);
    const sourceId = readText(row, 1, 'libraries');
    const name = readText(row, 2, 'libraries');
    const note = readText(row, 4, 'libraries');
    if (!sourceId || !name) throw new WorkbookImportError('invalidLibrary', 'libraries', row.number);
    if (inputs.has(sourceId)) throw new WorkbookImportError('duplicateSource', 'libraries', row.number);
    inputs.set(sourceId, { name, note, questions: [] });
  });
  if (!inputs.size) throw new WorkbookImportError('empty');

  let count = 0;
  questions.eachRow((row) => {
    if (row.number <= 2 || !populated(row, QUESTION_COLUMNS.length)) return;
    if (++count > MAX_QUESTIONS) throw new WorkbookImportError('tooMany', 'questions', row.number);
    const sourceId = readText(row, 1, 'questions');
    const input = inputs.get(sourceId);
    if (!input) throw new WorkbookImportError('unknownSource', 'questions', row.number);
    const code = readText(row, 2, 'questions');
    const title = readText(row, 3, 'questions');
    const guide = readText(row, 4, 'questions');
    if (!/^Q[1-9]\d*$/.test(code) || !title) throw new WorkbookImportError('invalidQuestion', 'questions', row.number);
    if (code !== `Q${input.questions.length + 1}`) throw new WorkbookImportError('sequence', 'questions', row.number);
    input.questions.push({ code, title, guide });
  });
  for (const input of inputs.values()) {
    if (!input.questions.length) throw new WorkbookImportError('missingQuestions');
  }
  return [...inputs.values()];
}

export function downloadWorkbook(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
