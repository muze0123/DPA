/**
 * 任务中心（异步任务列表）数据层
 *
 * 任务状态口径：
 * - 导入任务：processing / success / partial_fail / fail
 * - 下载任务：processing / success / fail（+ expired 演示 30 天保留期）
 * - 任务模块枚举覆盖本项目全部业务模块
 *
 * 文件名称是记录的展示专有名词：模块名走 i18n（taskCenter.fileNames.*），
 * 时间戳是数据层原文，组合规则见《任务列表 PRD》（PRD/任务列表PRD.md）文件命名章节。
 */

export type TaskKind = 'import' | 'download';

export type TaskModuleKey = 'surveys' | 'ledger' | 'dict' | 'templates' | 'audit' | 'sections' | 'rules';

export type ImportTaskStatus = 'processing' | 'success' | 'partial_fail' | 'fail';

export type DownloadTaskStatus = 'processing' | 'success' | 'fail';

export interface ImportTaskRecord {
  id: string;
  module: TaskModuleKey;
  /** 文件名时间戳（导入源文件为 YYYYMMDD） */
  fileStamp: string;
  operator: string;
  /** 操作时间，YYYY-MM-DD HH:mm:ss，精确到秒 */
  time: string;
  status: ImportTaskStatus;
  progress?: number;
  total?: number;
  ok?: number;
  fail?: number;
  /** 演示扩展（2026-10-25）：错误数据文件 Blob URL 与实际文件名，供任务列表直接下载 */
  errorUrl?: string;
  errorName?: string;
}

export interface DownloadTaskRecord {
  id: string;
  module: TaskModuleKey;
  /** 文件名时间戳（导出文件为 YYYYMMDDHHMMSS） */
  fileStamp: string;
  operator: string;
  time: string;
  status: DownloadTaskStatus;
  progress?: number;
  /** 导出成功但超过 30 天保留期：下载链接置灰 */
  expired?: boolean;
  /** 演示扩展（2026-10-25）：导出文件 Blob URL 与实际文件名，供任务列表直接下载 */
  fileUrl?: string;
  fileName?: string;
}

export const TASK_MODULE_KEYS: TaskModuleKey[] = ['surveys', 'ledger', 'templates', 'sections', 'dict', 'audit', 'rules'];

export function createImportTaskRecords(): ImportTaskRecord[] {
  return [
    { id: 'imp-01', module: 'ledger', fileStamp: '20260705', operator: '张三', time: '2026-07-05 09:15:30', status: 'processing', progress: 66 },
    { id: 'imp-02', module: 'surveys', fileStamp: '20260704', operator: '李四', time: '2026-07-04 15:42:18', status: 'processing', progress: 32 },
    { id: 'imp-03', module: 'ledger', fileStamp: '20260701', operator: '张三', time: '2026-07-01 10:23:45', status: 'partial_fail', total: 100, ok: 98, fail: 2 },
    { id: 'imp-04', module: 'ledger', fileStamp: '20260630', operator: '李四', time: '2026-06-30 16:08:12', status: 'success', total: 50, ok: 50, fail: 0 },
    { id: 'imp-05', module: 'surveys', fileStamp: '20260629', operator: '王五', time: '2026-06-29 11:05:27', status: 'partial_fail', total: 36, ok: 30, fail: 6 },
    { id: 'imp-06', module: 'surveys', fileStamp: '20260628', operator: '赵六', time: '2026-06-28 14:37:56', status: 'success', total: 220, ok: 220, fail: 0 },
    { id: 'imp-07', module: 'ledger', fileStamp: '20260626', operator: '张三', time: '2026-06-26 09:48:03', status: 'fail' },
    { id: 'imp-08', module: 'surveys', fileStamp: '20260624', operator: '王五', time: '2026-06-24 17:22:41', status: 'success', total: 78, ok: 78, fail: 0 },
    { id: 'imp-09', module: 'ledger', fileStamp: '20260620', operator: '李四', time: '2026-06-20 10:11:09', status: 'partial_fail', total: 150, ok: 141, fail: 9 },
    { id: 'imp-10', module: 'surveys', fileStamp: '20260618', operator: '钱七', time: '2026-06-18 13:59:34', status: 'success', total: 12, ok: 12, fail: 0 },
    { id: 'imp-11', module: 'ledger', fileStamp: '20260615', operator: '张三', time: '2026-06-15 08:30:22', status: 'fail' },
    { id: 'imp-12', module: 'surveys', fileStamp: '20260612', operator: '李四', time: '2026-06-12 15:20:05', status: 'success', total: 64, ok: 64, fail: 0 },
  ];
}

export function createDownloadTaskRecords(): DownloadTaskRecord[] {
  return [
    { id: 'dl-01', module: 'surveys', fileStamp: '20260705100812', operator: '王五', time: '2026-07-05 10:08:12', status: 'processing', progress: 40 },
    { id: 'dl-02', module: 'ledger', fileStamp: '20260704161530', operator: '张三', time: '2026-07-04 16:15:30', status: 'success' },
    { id: 'dl-03', module: 'surveys', fileStamp: '20260701131516', operator: '张三', time: '2026-07-01 13:15:16', status: 'success' },
    { id: 'dl-04', module: 'ledger', fileStamp: '20260630095820', operator: '李四', time: '2026-06-30 09:58:20', status: 'success', expired: true },
    { id: 'dl-05', module: 'surveys', fileStamp: '20260628143022', operator: '王五', time: '2026-06-28 14:30:22', status: 'fail' },
    { id: 'dl-06', module: 'surveys', fileStamp: '20260625174455', operator: '赵六', time: '2026-06-25 17:44:55', status: 'success' },
    { id: 'dl-07', module: 'ledger', fileStamp: '20260622112748', operator: '张三', time: '2026-06-22 11:27:48', status: 'success' },
    { id: 'dl-08', module: 'surveys', fileStamp: '20260618150233', operator: '李四', time: '2026-06-18 15:02:33', status: 'success' },
    { id: 'dl-09', module: 'surveys', fileStamp: '20260610093015', operator: '钱七', time: '2026-06-10 09:30:15', status: 'success', expired: true },
    { id: 'dl-10', module: 'ledger', fileStamp: '20260605082247', operator: '王五', time: '2026-06-05 08:22:47', status: 'success' },
    { id: 'dl-11', module: 'surveys', fileStamp: '20260530164109', operator: '张三', time: '2026-05-30 16:41:09', status: 'success' },
    { id: 'dl-12', module: 'ledger', fileStamp: '20260528101240', operator: '李四', time: '2026-05-28 10:12:40', status: 'success', expired: true },
  ];
}
