import ExcelJS from 'exceljs';
import type { AuditRecord } from './audit';

/**
 * 审计报告导出（对齐 01 文档 F-AUDIT-06 / P7「导出审计报告」）。
 *
 * 只负责把已翻译好的行写成 xlsx；文案与翻译由页面层传入，
 * 保持本文件与 i18n 解耦（与 function-ledger/data/workbook.ts 同一约定）。
 */

const SHEET_NAME = '审计报告';
const HEADERS = [
  '审计编号', '操作时间', '操作人', '角色', '操作模块',
  '操作类型', '操作对象类型', '操作对象', '操作摘要', '结果',
];

export interface AuditExportInput {
  /** 已应用筛选后的记录（时间倒序） */
  records: AuditRecord[];
  /** 各枚举的展示文案（页面层用 t() 翻译好再传入） */
  text: (record: AuditRecord) => {
    role: string;
    actionType: string;
    module: string;
    result: string;
  };
  /** 报告表头的元信息（生成时间、筛选条件说明），留空则不写说明行 */
  meta?: string[];
}

export async function makeAuditExport(input: AuditExportInput): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '功能数据安全合规自评';
  const sheet = workbook.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.addRow([...HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).height = 26;
  sheet.columns = [18, 21, 10, 12, 12, 10, 12, 30, 52, 8].map((width) => ({ width }));
  sheet.getColumn(2).numFmt = '@';

  input.records.forEach((record) => {
    const text = input.text(record);
    sheet.addRow([
      record.id, record.time, record.actor, text.role, text.module,
      text.actionType, record.targetType, record.targetName, record.summary, text.result,
    ]);
  });

  if (input.meta?.length) {
    const help = workbook.addWorksheet('导出说明');
    input.meta.forEach((line) => help.addRow([line]));
    help.getColumn(1).width = 105;
  }

  return new Blob([await workbook.xlsx.writeBuffer() as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
