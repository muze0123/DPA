import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { functionStatus, responsibleDepartments, validateInput, type FunctionInput, type FunctionRecord, type SurveySnapshot } from './ledger';
import type { ImportFailure, ImportItem } from './storage';

export const SHEET_NAME = '功能台账';
const HEADERS = ['平台名称', 'FuLi ID', '功能名称', '功能描述', '子功能', '控制器', '功能负责人', '所属部门', '开发地', 'master ECU'] as const;
/** 导入时允许缺列的表头（2026-10-27）：功能描述为选填，旧版工作簿没有该列也能导入 */
const OPTIONAL_HEADERS: readonly string[] = ['功能描述'];
const REQUIRED_HEADERS = HEADERS.filter((header) => !OPTIONAL_HEADERS.includes(header)) as unknown as readonly (typeof HEADERS)[number][];
const EXPORT_EXTRA = ['功能状态', '主数据状态', '创建人', '创建时间', '最近更新时间'] as const;
const ERROR_HEADER = '错误原因';
const MAX_BYTES = 20 * 1024 * 1024;

const FIELD_NAMES: Record<string, string> = {
  platformName: '平台名称', fuliId: 'FuLi ID', functionName: '功能名称', owner: '功能负责人',
  department: '所属部门', responsibles: '负责人及部门', developmentLocation: '开发地', subfunctions: '子功能与控制器',
};

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
  sheet.columns = [22, 22, 26, 40, 32, 32, 20, 22, 16, 22].map((width) => ({ width }));
  sheet.getColumn(4).alignment = { vertical: 'top', wrapText: true };
  sheet.getColumn(5).alignment = { vertical: 'top', wrapText: true };
  sheet.getColumn(6).alignment = { vertical: 'top', wrapText: true };
  sheet.getColumn(7).alignment = { vertical: 'top', wrapText: true };
  sheet.getColumn(2).numFmt = '@';
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } };
  return { workbook, sheet };
}

export async function makeTemplate(): Promise<Blob> {
  const { workbook } = baseWorkbook();
  const help = workbook.addWorksheet('填写说明');
  [
    '一行对应一个功能；平台名称、FuLi ID、功能名称、负责人及部门必填。',
    '功能描述为选填的功能级说明（主数据）；填写后创建问卷时会作为「功能说明」自动带入基本信息分区。',
    'FuLi ID 最长 32 字；Excel 中请按文本填写，避免前导零丢失；文件内重复 FuLi ID 将作为错误行返回。',
    '子功能列与控制器列按行一一对应，多个子功能换行输入；同一子功能有多个控制器时，在控制器单元格内用「、」分隔（如 BCM、GW）；同时留空表示没有子功能。',
    '功能负责人列与所属部门列按顺序一一对应；多个负责人和部门分别用 | 换行分隔。',
    '开发地只填写 中国 或 德国；master ECU 可以留空。',
    '支持不超过 20 MB 的 .xlsx 或 UTF-8 .csv 文件，不限制行数；CSV 请使用与模板一致的表头。',
    '导入时与台账中已有 FuLi ID 相同的功能会更新，原停用状态保持不变；失败行不影响成功行保存。',
  ].forEach((line) => help.addRow([line]));
  help.getColumn(1).width = 105;
  return new Blob([await workbook.xlsx.writeBuffer() as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function workbookRow(input: FunctionInput): string[] {
  const responsibles = responsibleDepartments(input);
  return [
    input.platformName, input.fuliId, input.functionName, input.functionDescription ?? '',
    // 子功能与控制器 1:N（2026-10-29）：同一子功能的多个控制器在单元格内用「、」连接，
    // 子功能之间仍按行（| 换行）与控制器列一一对应
    input.subfunctions.map((item) => item.name).join('|\n'),
    input.subfunctions.map((item) => item.controllers.join('、')).join('|\n'),
    responsibles.map(({ name }) => name).join('|\n'),
    responsibles.map(({ department }) => department).join('|\n'),
    input.developmentLocation === 'germany' ? '德国' : input.developmentLocation === 'china' ? '中国' : input.developmentLocation, input.masterEcu,
  ];
}

export async function makeExport(records: FunctionRecord[], surveys: SurveySnapshot[]): Promise<Blob> {
  const { workbook, sheet } = baseWorkbook();
  const header = sheet.getRow(1);
  EXPORT_EXTRA.forEach((name, index) => { header.getCell(HEADERS.length + index + 1).value = name; });
  sheet.getRow(1).font = { bold: true };
  EXPORT_EXTRA.forEach((_, index) => { sheet.getColumn(HEADERS.length + index + 1).width = 23; });
  records.forEach((record) => {
    const status = functionStatus(record, surveys);
    sheet.addRow([
      ...workbookRow(record),
      status === 'completed' ? '已评估完' : status === 'in-progress' ? '进行中' : '未开始',
      record.disabledAt ? '停用' : '启用',
      record.creator, record.createdAt, record.updatedAt,
    ]);
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(2, records.length + 1), column: HEADERS.length + EXPORT_EXTRA.length } };
  return new Blob([await workbook.xlsx.writeBuffer() as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function parseInput(value: (header: string) => string, optional: (header: string) => string): FunctionInput {
  const names = value('子功能').split(/\s*\|\s*|\r?\n/).map((part) => part.trim());
  // 控制器列按行对应子功能；同一行内多个控制器用「、」分隔（兼容旧版单控制器格式）
  const controllerRows = value('控制器').split(/\s*\|\s*|\r?\n/).map((part) => part.trim());
  const subfunctions = names.length === 1 && names[0] === '' && controllerRows.length === 1 && controllerRows[0] === ''
    ? [] : names.map((name, index) => ({
      name,
      controllers: (controllerRows[index] ?? '').split(/\s*、\s*/).map((part) => part.trim()).filter(Boolean),
    }));
  if (controllerRows.length !== names.length) subfunctions.push({ name: '', controllers: [] });
  const owners = value('功能负责人').split(/\s*\|\s*|\r?\n/).map((part) => part.trim());
  const departments = value('所属部门').split(/\s*\|\s*|\r?\n/).map((part) => part.trim());
  const responsibles = owners.length === 1 && !owners[0] && departments.length === 1 && !departments[0]
    ? [] : owners.map((name, index) => ({ name, department: departments[index] ?? '' }));
  if (owners.length !== departments.length) responsibles.push({ name: '', department: '' });
  const location = value('开发地');
  return {
    platformName: value('平台名称'), fuliId: value('FuLi ID'), functionName: value('功能名称'),
    functionDescription: optional('功能描述'),
    subfunctions, owner: responsibles[0]?.name ?? '', department: responsibles[0]?.department ?? '', responsibles,
    developmentLocation: location === '德国' ? 'germany' : location === '中国' ? 'china' : (location as FunctionInput['developmentLocation']),
    masterEcu: value('master ECU'),
  };
}

export interface ParsedWorkbook { items: ImportItem[]; failures: ImportFailure[] }

function parseRows(rows: { row: number; values: string[]; numericFuliId?: boolean }[]): ParsedWorkbook {
  const headers = rows[0]?.values ?? [];
  const positions = new Map(headers.map((header, index) => [header.trim().replace(/^\uFEFF/, ''), index]));
  const missing = REQUIRED_HEADERS.filter((header) => !positions.has(header));
  if (missing.length) throw new Error(`headersMissing:${missing.join('、')}`);
  const items: ImportItem[] = [];
  const failures: ImportFailure[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(1)) {
    const value = (header: string) => (row.values[positions.get(header)!] ?? '').trim();
    if (REQUIRED_HEADERS.every((header) => !value(header))) continue;
    const input = parseInput(value, (header) => positions.has(header) ? value(header) : '');
    const errors = validateInput(input).map((field) => FIELD_NAMES[field]);
    if (row.numericFuliId) errors.push('FuLi ID 请使用文本格式以保留前导零');
    if (input.fuliId && seen.has(input.fuliId)) errors.push('文件内 FuLi ID 重复');
    if (errors.length) failures.push({ row: row.row, input, reason: errors.join('、') });
    else { seen.add(input.fuliId); items.push({ row: row.row, input }); }
  }
  return { items, failures };
}

export async function parseWorkbook(file: File): Promise<ParsedWorkbook> {
  if (!/\.(xlsx|csv)$/i.test(file.name)) throw new Error('fileType');
  if (file.size > MAX_BYTES) throw new Error('fileSize');
  if (/\.csv$/i.test(file.name)) {
    let csv: Papa.ParseResult<string[]>;
    try {
      const text = await file.text();
      if (text.includes('\uFFFD')) throw new Error('fileInvalid');
      csv = Papa.parse<string[]>(text);
    }
    catch { throw new Error('fileInvalid'); }
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
  const fuliColumn = headers.indexOf('FuLi ID') + 1;
  const rows: { row: number; values: string[]; numericFuliId?: boolean }[] = [{ row: 1, values: headers }];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    rows.push({ row: rowNumber, values: Array.from({ length: Math.max(row.cellCount, header.cellCount) }, (_, index) => readCell(row.getCell(index + 1).value)), numericFuliId: fuliColumn > 0 && typeof row.getCell(fuliColumn).value === 'number' });
  });
  return parseRows(rows);
}

export async function makeErrors(failures: ImportFailure[]): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.addRow([ERROR_HEADER, ...HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn(1).width = 58;
  failures.forEach(({ row, input, reason }) => sheet.addRow([`第 ${row} 行：${reason}`, ...workbookRow(input)]));
  return new Blob([await workbook.xlsx.writeBuffer() as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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
