/**
 * 填写记录 → 「功能清单」工作簿导出（2026-11-01 用户裁决）。
 *
 * 格式真值源：`产品需求/GB44464_需求文档/GB44464_静态.xlsx`「功能清单」工作表（A–AY 共 51 列）。
 * 结构口径（用户裁决）：
 * - **一行 = 一份任务/问卷**（`taskNo`），通用材料为功能级、无任务号，并入该功能每一行；
 *   同一功能存在多份问卷时就会出现多行，这是预期结果，不做功能级合并；
 * - **列结构 = A 序号 + 追加 5 列身份列（任务编号 / 任务名称 / 功能编号 / 功能名称 / 功能描述）
 *   + 工作簿 D–AY 共 48 列**，合计 54 列。追加的「功能名称」「功能描述」取代工作簿原
 *   B「功能名称」、C「功能说明」，不重复出现；
 * - 工作簿 `AA 传感器型号`、`AB 传感器性能指标` 在系统内没有对应字段，**留空**；
 *   系统另有 10 个字段在工作簿中没有列位（权限调用记录保存期限、第三方接收方补充信息、
 *   用户画像独立拒绝方式、生物特征类型、是否涉及口令、生物特征仅存车内、向车外传输、
 *   匿名化对象标准确认、检出率结论、效果确认），**不导出**，以保证列结构与工作簿一致；
 * - 语义近似映射：`R 同意期限配置方式` ← 同意期限及规则、`X 支付口令隐藏方式` ←
 *   口令输入/显示时是否隐藏、`Y 生物识别替代方式` ← 是否有非生物识别替代方式、
 *   `AC 传感器最小精度参数配置` ← 是否至少一个功能符合最小精度要求。
 *
 * 取值口径（与 `surveys/data/exportWorkbooks.ts` 的 F-EXP-07 一致）：
 * - 空值单元格留空，不写「未填写」「N/A」等占位文字；
 * - 枚举按中文显示文本导出（是/否、基本功能、TLS 加密…），不导出 `yes`/`tls` 原始 code；
 * - 布尔三态取 `yes/no/pending` → 是/否/待定；传感器 `unverified`、传输 `unknown` → 待核验。
 *
 * 本文件与 i18n 解耦（同 audit/export 约定）：表头与枚举文案是工作簿的业务术语，
 * 固定输出中文，不随界面语言切换。
 */
import ExcelJS from 'exceljs';
import type { SectionFormRecord } from './formRecords';
import type { SectionKey } from './sectionCatalog';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 工作簿视觉样式（取自「功能清单」工作表实测值） */
const STYLE = {
  titleFont: { name: 'Microsoft YaHei', size: 14, bold: true, color: { argb: 'FF1F3864' } },
  headerFont: { name: 'Microsoft YaHei', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
  headerFill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1F3864' } },
  borderColor: 'FFB4C6E7',
  seqFont: { name: 'Consolas', size: 9, color: { argb: 'FF999999' } },
  bodyFont: { name: 'Calibri', size: 11 },
  titleHeight: 28,
  headerHeight: 48,
  bodyHeight: 36,
} as const;

/* --------------------------------------------------------------- 列定义 */

type ColumnSource =
  | { kind: 'identity'; key: 'seq' | 'taskNo' | 'taskName' | 'fuliId' | 'functionName' }
  | { kind: 'field'; section: SectionKey; code: string }
  | { kind: 'empty' };

interface ExportColumn {
  /** 表头文案（换行保留工作簿原有的取值说明） */
  header: string;
  width: number;
  source: ColumnSource;
}

const identity = (key: 'seq' | 'taskNo' | 'taskName' | 'fuliId' | 'functionName', header: string, width: number): ExportColumn => ({
  header, width, source: { kind: 'identity', key },
});
const field = (header: string, width: number, section: SectionKey, code: string): ExportColumn => ({
  header, width, source: { kind: 'field', section, code },
});
/** 工作簿有列位、系统无对应字段：保留列头、单元格留空 */
const empty = (header: string, width: number): ExportColumn => ({
  header, width, source: { kind: 'empty' },
});

export const EXPORT_COLUMNS: readonly ExportColumn[] = [
  identity('seq', '序号', 5),
  identity('taskNo', '任务编号', 16),
  identity('taskName', '任务名称', 24),
  identity('fuliId', '功能编号', 16),
  identity('functionName', '功能名称', 18),
  field('功能描述', 28, 'basicInfo', 'C'),
  field('功能分类（基本功能/非基本功能）', 18, 'basicInfo', 'D'),
  field('涉及数据类型\n（按附录B分类列出）', 24, 'basicInfo', 'E'),
  field('数据收集方式\n（自动采集/用户输入/系统生成）', 20, 'basicInfo', 'F'),
  field('数据收集时机\n（首次启动/每次使用/后台运行）', 25.5, 'basicInfo', 'G'),
  field('数据收集位置\n（座舱内/车外）', 14, 'basicInfo', 'H'),
  field('数据存储位置\n（车端ECU/云端/第三方）', 20, 'basicInfo', 'I'),
  field('存储期限', 14, 'basicInfo', 'J'),
  field('数据处理目的', 22, 'basicInfo', 'K'),
  field('数据使用方式\n（本地处理/云端处理/第三方处理）', 27, 'basicInfo', 'L'),
  field('是否向第三方提供', 12, 'transmission', 'F'),
  field('第三方名称及接收目的', 22, 'transmission', 'G'),
  field('告知方式\n（用户手册/车载面板/语音/短信/应用）', 32, 'consent', 'C'),
  field('同意获取方式\n（弹窗/勾选/语音确认）', 20, 'consent', 'D'),
  field('是否需单独同意', 12, 'consent', 'E'),
  field('同意期限配置方式', 18, 'consent', 'F'),
  field('是否提供撤回同意途径', 16, 'consent', 'G'),
  field('撤回同意方式', 18, 'consent', 'H'),
  field('拒绝方式\n（拒绝后是否影响其他功能）', 20, 'consent', 'I'),
  field('权限调用记录展示方式', 16, 'consent', 'J'),
  field('数据收集提示方式\n（声音/图标/灯光）', 18, 'consent', 'K'),
  field('支付口令隐藏方式', 12.8, 'biometric', 'F'),
  field('生物识别替代方式', 13, 'biometric', 'D'),
  field('传感器类型', 16, 'sensors', 'D'),
  empty('传感器型号', 14),
  empty('传感器性能指标\n（分辨率/精度/帧率）', 22),
  field('传感器最小精度参数配置', 18, 'sensors', 'E'),
  field('传感器安装位置', 14, 'sensors', 'F'),
  field('传感器对应功能', 16, 'sensors', 'G'),
  field('数据加密方式\n（TLS/DTLS/HTTPS等）', 22, 'transmission', 'C'),
  field('是否涉及境外传输', 14, 'transmission', 'D'),
  field('境外传输目的地', 22, 'transmission', 'E'),
  field('数据删除途径', 18, 'consent', 'L'),
  field('删除触发条件', 9.5, 'consent', 'M'),
  field('删除后是否可检索/访问', 14, 'consent', 'N'),
  field('是否适用个人同意例外', 16, 'consent', 'O'),
  field('例外情形类型', 18, 'consent', 'P'),
  field('例外涉及数据类型', 12.8, 'consent', 'Q'),
  field('例外理由说明', 24, 'consent', 'R'),
  field('例外告知/说明路径', 22, 'consent', 'S'),
  field('是否需匿名化处理', 14, 'anonymization', 'C'),
  field('匿名化方式', 20, 'anonymization', 'D'),
  field('是否涉及未成年人个人信息', 16, 'consent', 'T'),
  field('是否有未成年人专门规则', 17.5, 'consent', 'U'),
  field('是否涉及应用分发平台', 16, 'consent', 'V'),
  field('平台运营者信息展示方式', 20, 'consent', 'W'),
  field('需提供的测试材料清单', 28, 'materials', 'C'),
  field('状态恢复/变更方法说明', 24, 'materials', 'D'),
  field('备注', 18, 'materials', 'E'),
];

/** 列数断言：见文件头结构口径（1 + 5 + 48 = 54） */
export const EXPORT_COLUMN_COUNT = EXPORT_COLUMNS.length;

/* --------------------------------------------------------------- 值转换 */

/** 枚举字段的中文显示文本（键 = `${分区}:${字段位}`） */
const ENUM_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'basicInfo:D': { basic: '基本功能', 'non-basic': '非基本功能' },
  'transmission:C': { tls: 'TLS 加密', 'mutual-tls': '双向 TLS', other: '其他方式' },
  'transmission:D': { yes: '是', no: '否', unknown: '待核验' },
  'sensors:D': { camera: '摄像头', lidar: '激光雷达', radar: '毫米波雷达', radar4d: '4D 毫米波雷达', ultrasonic: '超声波雷达', other: '其他' },
  'sensors:E': { yes: '是', no: '否', unverified: '待核验' },
  'anonymization:D': {
    'frame-removal': '删除画面', downscale: '降低分辨率',
    outline: '局部轮廓化（高斯模糊/马赛克/色块）', other: '其他',
  },
};

/** 是/否三态（告知与同意、生物特征、匿名化的布尔字段共用） */
const BOOLEAN_LABELS: Readonly<Record<string, string>> = { yes: '是', no: '否', pending: '待定' };

function displayValue(section: SectionKey, code: string, raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  const labels = ENUM_LABELS[`${section}:${code}`];
  return labels?.[value] ?? BOOLEAN_LABELS[value] ?? value;
}

/* --------------------------------------------------------------- 行聚合 */

export interface ExportRow {
  taskNo: string;
  taskName: string;
  fuliId: string;
  functionName: string;
  /** `${分区}:${字段位}` → 已转换的显示值 */
  values: Map<string, string>;
}

function mergeFields(target: Map<string, string>, rows: readonly SectionFormRecord[]): void {
  for (const row of rows) {
    for (const item of row.fields) {
      const key = `${row.sectionKey}:${item.code}`;
      if (!target.get(key)) target.set(key, displayValue(row.sectionKey, item.code, item.value));
    }
  }
}

/**
 * 按「任务」聚合导出行。
 *
 * @param selected 当前筛选结果：只决定**哪些任务进入导出**（行集合口径，DESIGN.md 导出基线）
 * @param all      全量记录：字段取值不受筛选影响，保证每行 51 列内容完整
 */
export function buildExportRows(selected: readonly SectionFormRecord[], all: readonly SectionFormRecord[]): ExportRow[] {
  const byTask = new Map<string, SectionFormRecord[]>();
  const byFuli = new Map<string, SectionFormRecord[]>();
  for (const row of all) {
    if (row.taskNo) {
      const list = byTask.get(row.taskNo);
      if (list) list.push(row); else byTask.set(row.taskNo, [row]);
    }
    const list = byFuli.get(row.fuliId);
    if (list) list.push(row); else byFuli.set(row.fuliId, [row]);
  }

  const materialsOf = (fuliId: string): SectionFormRecord[] =>
    (byFuli.get(fuliId) ?? []).filter((row) => row.sectionKey === 'materials');

  const rows: ExportRow[] = [];
  const seenTask = new Set<string>();
  const materialsOnly: string[] = [];

  for (const hit of selected) {
    if (!hit.taskNo) {
      // 通用材料命中筛选：只有该功能没有任何任务进表时，才单独输出功能级行
      if (materialsOnly.includes(hit.fuliId)) continue;
      materialsOnly.push(hit.fuliId);
      continue;
    }
    if (seenTask.has(hit.taskNo)) continue;
    seenTask.add(hit.taskNo);

    const taskRows = byTask.get(hit.taskNo) ?? [];
    const values = new Map<string, string>();
    mergeFields(values, taskRows);
    mergeFields(values, materialsOf(hit.fuliId));
    rows.push({
      taskNo: hit.taskNo,
      taskName: taskRows.find((row) => row.taskName)?.taskName ?? hit.taskName,
      fuliId: hit.fuliId,
      functionName: taskRows.find((row) => row.functionName)?.functionName ?? hit.functionName,
      values,
    });
  }

  for (const fuliId of materialsOnly) {
    if (rows.some((row) => row.fuliId === fuliId)) continue;
    const materialRows = materialsOf(fuliId);
    const values = new Map<string, string>();
    mergeFields(values, materialRows);
    rows.push({
      taskNo: '',
      taskName: '',
      fuliId,
      functionName: materialRows[0]?.functionName ?? '',
      values,
    });
  }

  return rows;
}

/* --------------------------------------------------------------- 工作簿 */

function cellValue(row: ExportRow, index: number, column: ExportColumn): string | number {
  const { source } = column;
  if (source.kind === 'empty') return '';
  if (source.kind === 'identity') {
    switch (source.key) {
      case 'seq': return index + 1;
      case 'taskNo': return row.taskNo;
      case 'taskName': return row.taskName;
      case 'fuliId': return row.fuliId;
      default: return row.functionName;
    }
  }
  return row.values.get(`${source.section}:${source.code}`) ?? '';
}

/** 生成「功能清单」工作簿：标题行合并 + 深蓝表头 + 数据行（空值留空） */
export function makeFunctionListWorkbook(rows: readonly ExportRow[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '天衡 CSA';
  const sheet = workbook.addWorksheet('功能清单');

  const total = EXPORT_COLUMNS.length;
  EXPORT_COLUMNS.forEach((column, index) => { sheet.getColumn(index + 1).width = column.width; });

  const title = sheet.addRow(['功能清单']);
  sheet.mergeCells(1, 1, 1, total);
  const titleCell = sheet.getCell(1, 1);
  titleCell.font = STYLE.titleFont;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  sheet.getRow(1).height = STYLE.titleHeight;

  const header = sheet.addRow(EXPORT_COLUMNS.map((column) => column.header));
  header.height = STYLE.headerHeight;
  header.eachCell((cell) => {
    cell.font = STYLE.headerFont;
    cell.fill = STYLE.headerFill;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: thin(), left: thin(), bottom: thin(), right: thin() };
  });

  rows.forEach((row, index) => {
    const dataRow = sheet.addRow(EXPORT_COLUMNS.map((column, columnIndex) => cellValue(row, index, column)));
    dataRow.height = STYLE.bodyHeight;
    dataRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const isSeq = columnNumber === 1;
      cell.font = isSeq ? STYLE.seqFont : STYLE.bodyFont;
      cell.alignment = isSeq
        ? { horizontal: 'center', vertical: 'middle', wrapText: true }
        : { horizontal: 'left', vertical: 'top', wrapText: true };
      cell.border = { top: thin(), left: thin(), bottom: thin(), right: thin() };
    });
  });

  // 冻结两行表头与前 6 列身份列（54 列宽表，不冻结无法横向定位）
  sheet.views = [{ state: 'frozen', xSplit: 6, ySplit: 2 }];
  return workbook;
}

function thin(): Partial<ExcelJS.Border> {
  return { style: 'thin', color: { argb: STYLE.borderColor } };
}

export async function buildFunctionListBlob(rows: readonly ExportRow[]): Promise<Blob> {
  const workbook = makeFunctionListWorkbook(rows);
  return new Blob([await workbook.xlsx.writeBuffer() as BlobPart], { type: XLSX_MIME });
}

/** 文件名基线（DESIGN.md）：`当前业务模块_日期.扩展名` */
export function exportFileName(date: Date): string {
  const p = (value: number) => String(value).padStart(2, '0');
  return `填写记录_${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.xlsx`;
}
