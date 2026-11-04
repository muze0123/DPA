/**
 * 审计管理（M6 审计查询 + P7 审计记录合并口径）— 领域类型与模块级静态 mock 数据。
 *
 * 当前无后端：全部记录为前端 mock，口径对齐 01 文档 F-AUDIT（全链路留痕、
 * 按问卷/操作人/时间段查询、导出审计报告）。接入服务端后，本文件替换为
 * API 适配层，页面与导出不需改动。
 */

export type AuditActionType =
  | 'login'
  | 'view'
  | 'create'
  | 'update'
  | 'delete'
  | 'import'
  | 'export'
  | 'review'
  | 'grant'
  | 'config';

export type AuditModuleKey =
  | 'ledger'
  | 'surveys'
  | 'questionnaire'
  | 'matching'
  | 'section'
  | 'review'
  | 'evidence'
  | 'account'
  | 'grant'
  | 'dict'
  | 'system';

export type AuditRole = 'admin' | 'officer' | 'owner';

export type AuditResult = 'success' | 'failure';

export interface AuditRecord {
  /** 审计编号，形如 AUD-2026-0001 */
  id: string;
  /** 操作时间，固定 `YYYY-MM-DD HH:mm:ss`，字符串比较即时间比较 */
  time: string;
  actor: string;
  role: AuditRole;
  actionType: AuditActionType;
  module: AuditModuleKey;
  /** 关联对象类型，mock 业务数据原文（问卷 / 功能 / 条款 / 账号…） */
  targetType: string;
  targetName: string;
  /** 变更摘要：做了什么、影响什么 */
  summary: string;
  result: AuditResult;
}

/** [time, actor, role, actionType, module, targetType, targetName, summary, result] */
type AuditRow = readonly [
  string, string, AuditRole, AuditActionType, AuditModuleKey, string, string, string, AuditResult,
];

const ROWS: readonly AuditRow[] = [
  ['2026-10-24 09:32:15', '张三', 'admin', 'login', 'account', '账号', '张三', '管理员登录成功，会话有效期 8 小时。', 'success'],
  ['2026-10-24 09:35:02', '张三', 'admin', 'view', 'surveys', '问卷', 'SV-2026-018 智能泊车辅助', '查看问卷匹配结果与填写进度。', 'success'],
  ['2026-10-24 09:41:47', '王五', 'officer', 'review', 'review', '问卷', 'SV-2026-012 远程车控', '审核通过 8 条安全需求条目并锁定，问卷进入分区填写。', 'success'],
  ['2026-10-24 10:02:33', '赵六', 'owner', 'update', 'questionnaire', '12 问答卷', 'SV-2026-015 · Q7 生物特征', 'Q7 判断由「否」改为「是」，自动初筛将重新计算。', 'success'],
  ['2026-10-24 10:15:20', '李四', 'admin', 'config', 'dict', '字典', '数据敏感级别', '新增枚举值「敏感-车内本地」，历史问卷不受影响。', 'success'],
  ['2026-10-23 18:26:09', '孙七', 'owner', 'export', 'evidence', '证据', 'SV-2026-009 证据清单', '导出证据与测试输入清单（Excel，22 条）。', 'success'],
  ['2026-10-23 17:48:55', '张三', 'admin', 'import', 'ledger', '功能', '整车 OTA 功能清单_v5.xlsx', '导入 120 条功能，覆盖更新 6 条重复 FuLi ID。', 'success'],
  ['2026-10-23 16:30:41', '王五', 'officer', 'view', 'matching', '条款', 'DP-09 目的限定', '查看条款原文、第 9 章依据与安全需求列表。', 'success'],
  ['2026-10-23 15:12:08', '李四', 'admin', 'grant', 'grant', '授权', '赵六 → 远程车控', '开通功能授权（单个绑定）。', 'success'],
  ['2026-10-23 14:05:37', '周八', 'owner', 'update', 'section', '填写分区', 'SV-2026-011 · 数据传输', '「数据传输」分区第 3 项保存，附测试输入。', 'success'],
  ['2026-10-23 11:20:14', '陈静', 'officer', 'review', 'review', '问卷', 'SV-2026-007 座舱生物识别', '退回匹配确认：条款 DP-14 缺少人工确认依据。', 'success'],
  ['2026-10-23 09:58:02', '赵六', 'owner', 'login', 'account', '账号', '赵六', '登录成功。', 'success'],
  ['2026-10-22 19:40:27', '李四', 'admin', 'config', 'system', '条款', '触发表达式 R-TP-03', '调整触发条件为「收集位置轨迹=是」，仅新问卷生效。', 'success'],
  ['2026-10-22 17:22:46', '孙七', 'owner', 'import', 'ledger', '功能', '部门功能清单_v2.xlsx', '导入失败：缺少「功能台账」工作表，未写入任何行。', 'failure'],
  ['2026-10-22 16:05:19', '王五', 'officer', 'export', 'system', '审计报告', '审计报告 2026-10-22', '导出失败：报告模板渲染异常，已可重试。', 'failure'],
  ['2026-10-22 15:31:52', '张三', 'admin', 'view', 'account', '账号', '账号列表', '查看全部账号与会话状态。', 'success'],
  ['2026-10-22 14:18:33', '李四', 'admin', 'create', 'account', '账号', '陈静（合规专员）', '新建账号并分配角色，首次登录需改密。', 'success'],
  ['2026-10-21 18:44:09', '周八', 'owner', 'view', 'evidence', '证据', 'SV-2026-011 证据清单', '查看证据材料与测试输入完成度。', 'success'],
  ['2026-10-21 17:03:25', '王五', 'officer', 'update', 'matching', '问卷', 'SV-2026-012 · 条款 DP-14', '人工确认改为「不适用」，填写理由「仅采集本地临时数据」。', 'success'],
  ['2026-10-21 15:47:10', '赵六', 'owner', 'create', 'surveys', '问卷', '智能泊车辅助', '从主数据新建问卷，关联功能 F-2101。', 'success'],
  ['2026-10-21 14:29:57', '张三', 'admin', 'import', 'grant', '授权', '批量授权 10 月批次.xlsx', '批量导入授权 20 条：成功 17 条，失败 3 条（功能已停用）。', 'failure'],
  ['2026-10-20 19:12:44', '陈静', 'officer', 'view', 'section', '填写分区', 'SV-2026-011 分区进度', '查看六个分区四态填写进度。', 'success'],
  ['2026-10-20 17:55:31', '孙七', 'owner', 'update', 'questionnaire', '12 问答卷', 'SV-2026-009 · Q3 收集位置轨迹', 'Q3 判断由「是」改为「否」，匹配结果将重算。', 'success'],
  ['2026-10-20 16:38:18', '李四', 'admin', 'update', 'ledger', '功能', 'F-1024 唤醒词识别', '修正 FuLi ID 录入错误（1024 → 1042），历史问卷快照不变。', 'success'],
  ['2026-10-20 15:21:06', '王五', 'officer', 'export', 'review', '问卷', 'SV-2026-012 远程车控', '导出合规自评报告（完整版）。', 'success'],
  ['2026-10-19 18:09:53', '周八', 'owner', 'update', 'section', '填写分区', 'SV-2026-011 · 匿名化', '「匿名化」分区第 2 项保存。', 'success'],
  ['2026-10-19 16:52:40', '张三', 'admin', 'delete', 'ledger', '功能', 'F-088 测试功能', '删除未关联问卷的测试功能，保留删除留痕。', 'success'],
  ['2026-10-19 15:35:27', '赵六', 'owner', 'view', 'matching', '问卷', 'SV-2026-015 匹配结果', '查看 38 条款匹配结果与差异标红项。', 'success'],
  ['2026-10-18 17:47:14', '李四', 'admin', 'config', 'dict', '字典', '部门', '维护部门枚举，合并「智能软件-平台组」。', 'success'],
  ['2026-10-18 16:00:01', '孙七', 'owner', 'import', 'ledger', '功能', '整车功能清单_10月.xlsx', '导入并覆盖更新 86 条既有功能，保留创建人。', 'success'],
  ['2026-10-18 14:12:48', '王五', 'officer', 'review', 'review', '问卷', 'SV-2026-003 车外影像', '审核通过并归档，适用条款 12 条。', 'success'],
  ['2026-10-17 18:33:35', '陈静', 'officer', 'view', 'review', '问卷', '待审清单', '查看全部待审核问卷与超时提醒。', 'success'],
  ['2026-10-17 15:19:09', '张三', 'admin', 'login', 'account', '账号', '张三', '登录成功。', 'success'],
  ['2026-10-16 19:25:52', '孙七', 'owner', 'view', 'surveys', '问卷', '问卷列表', '查看「我负责的」问卷列表。', 'success'],
  ['2026-10-16 17:08:45', '李四', 'admin', 'grant', 'grant', '授权', '赵六 → F-038 座舱语音助手', '解绑授权（人员转岗）。', 'success'],
  ['2026-10-16 15:51:38', '赵六', 'owner', 'update', 'questionnaire', '12 问答卷', 'SV-2026-015 · Q11 匿名化', 'Q11 判断与补充说明保存。', 'success'],
  ['2026-10-15 18:42:21', '王五', 'officer', 'review', 'review', '问卷', 'SV-2026-011 座舱生物识别', '退回分区填写：证据与测试输入不完整（3 条未填）。', 'success'],
  ['2026-10-15 16:24:14', '陈静', 'officer', 'import', 'dict', '材料', '测试方法材料清单_v3.xlsx', '导入材料 12 条并关联对应条款。', 'success'],
  ['2026-10-15 14:06:57', '张三', 'admin', 'config', 'system', '系统', '停用维护公告', '发布平台停用维护公告（10-19 02:00-04:00）。', 'success'],
  ['2026-10-14 17:58:40', '周八', 'owner', 'create', 'surveys', '问卷', '座舱语音助手', '从主数据新建问卷，关联功能 F-038。', 'success'],
  ['2026-10-14 16:11:33', '李四', 'admin', 'view', 'grant', '授权', 'F-2101 智能泊车辅助', '按功能查询授权人员名单。', 'success'],
  ['2026-10-13 18:37:26', '孙七', 'owner', 'login', 'account', '账号', '孙七', '登录失败：密码连续错误 5 次，账号临时锁定 15 分钟。', 'failure'],
  ['2026-10-13 15:20:12', '王五', 'officer', 'export', 'system', '审计报告', '审计报告 2026-10-13', '导出全量审计记录 216 条（合规专员只读导出）。', 'success'],
  ['2026-10-12 17:15:05', '张三', 'admin', 'update', 'system', '条款', 'DP-21 数据主体权利', '发布条款新版本 V2.1，在途问卷保留旧版本快照。', 'success'],
  ['2026-10-12 14:02:58', '李四', 'admin', 'create', 'dict', '字典', '传感器类型', '新建字典并维护 8 个枚举值。', 'success'],
];

export const auditRecords: AuditRecord[] = ROWS.map((row, index) => ({
  id: `AUD-2026-${String(index + 1).padStart(4, '0')}`,
  time: row[0],
  actor: row[1],
  role: row[2],
  actionType: row[3],
  module: row[4],
  targetType: row[5],
  targetName: row[6],
  summary: row[7],
  result: row[8],
}));

/** 筛选下拉里的操作人（按姓名去重） */
export const auditActors: string[] = [...new Set(auditRecords.map((record) => record.actor))];
