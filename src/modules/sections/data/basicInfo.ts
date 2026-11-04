/** v1 工作簿「基础信息」C–L 十个业务字段；A/B 是问卷主数据，不在此重复保存。 */
export const BASIC_FIELD_CODES = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;
export type BasicFieldCode = typeof BASIC_FIELD_CODES[number];
export type BasicCategory = 'basic' | 'non-basic';

/**
 * 主数据字段（2026-10-27 用户裁决 · 方案 A）：C「功能说明」不再在分区内填写，
 * 只读引用功能台账「功能描述」并随问卷创建快照带入（同工作簿「封面 → 基础信息!C」引用链）。
 * `values.C` 仅作历史数据兜底展示，不参与已填计数与完成度。
 */
export const BASIC_MASTER_CODES = ['C'] as const;
export type BasicMasterCode = (typeof BASIC_MASTER_CODES)[number];
/** 分区可填字段位 = 全部字段位 − 主数据字段（D–L 共 9 个） */
export const BASIC_FILL_CODES = BASIC_FIELD_CODES.filter((code) => !(BASIC_MASTER_CODES as readonly string[]).includes(code)) as unknown as readonly Exclude<BasicFieldCode, BasicMasterCode>[];
export type BasicFillCode = (typeof BASIC_FILL_CODES)[number];

export type BasicTaskStatus = 'filling' | 'submitted' | 'returned' | 'reviewed';
export const BASIC_TASK_STATUSES = ['filling', 'submitted', 'returned', 'reviewed'] as const satisfies readonly BasicTaskStatus[];

export interface BasicInfoTask {
  id: string;
  surveyId: string;
  assignee: string;
  status: BasicTaskStatus;
  updatedAt: string;
  /** 字段值是业务原始记录。空字符串为尚未填写，不表示不适用或已完成。 */
  values: Partial<Record<Exclude<BasicFieldCode, 'D'>, string>> & { D?: BasicCategory };
}

/** 本地只读样例；不是服务端分区任务，也不用于推断逐字段适用性和必填性。 */
export const basicInfoTasks: readonly BasicInfoTask[] = [
  {
    id: 'BI-0305', surveyId: 'S-2026-0305', assignee: '李晓彤', status: 'returned', updatedAt: '2026-03-29 17:40',
    values: {
      C: '通过车内麦克风采集语音指令，识别后执行车控与导航操作。', D: 'non-basic',
      E: '语音指令、设备标识', F: '用户主动唤醒后采集', G: '唤醒并发出指令时',
      H: '车内麦克风', I: '车端及境内服务端', J: '指令日志保留 30 天',
      K: '识别用户指令并完成交互', L: '车控响应与导航检索',
    },
  },
  {
    id: 'BI-0306', surveyId: 'S-2026-0306', assignee: '王建国', status: 'submitted', updatedAt: '2026-03-29 10:26',
    values: {
      C: '车辆碰撞后触发紧急呼叫，提供救援定位。', D: 'basic', E: '位置、碰撞事件、设备标识',
      F: '车载传感器自动采集', G: '碰撞事件触发时', H: '车内传感器', I: '车端及救援平台',
      J: '按救援事件记录管理', K: '向救援中心提供定位信息', L: '紧急联络与事故定位',
    },
  },
  {
    id: 'BI-0307', surveyId: 'S-2026-0307', assignee: '赵敏', status: 'reviewed', updatedAt: '2026-03-28 16:30',
    values: {
      C: '记录行驶过程中的关键运行状态供事件追溯。', D: 'basic', E: '车速、制动状态、事件时间',
      F: '车载控制器自动采集', G: '车辆行驶时', H: '车载控制器', I: '车内存储单元',
      J: '按事件记录周期管理', K: '事故分析和运行追溯', L: '授权人员按事件调取',
    },
  },
  {
    id: 'BI-0313', surveyId: 'S-2026-0313', assignee: '陈志远', status: 'filling', updatedAt: '2026-03-26 14:44',
    values: { C: '通过车端与服务端协作完成软件更新。', D: 'non-basic', E: '设备标识、升级状态', F: '车端自动采集', G: '检查更新时', H: '车载网关', I: '车端' },
  },
  {
    id: 'BI-0314', surveyId: 'S-2026-0314', assignee: '周明', status: 'submitted', updatedAt: '2026-03-25 17:20',
    values: { C: '感知车辆周边障碍物并提供驾驶提示。', D: 'basic', E: '雷达点云、车辆状态', F: '雷达传感器自动采集', G: '辅助驾驶启用时', H: '车外雷达', I: '车端控制器', K: '环境感知', L: '驾驶辅助提示' },
  },
  {
    id: 'BI-0315', surveyId: 'S-2026-0315', assignee: '李晓彤', status: 'reviewed', updatedAt: '2026-03-24 09:12',
    values: { C: '用户控制车内摄像头遮蔽状态。', D: 'non-basic', E: '摄像头状态', F: '车端状态读取', G: '切换遮蔽状态时', H: '车内摄像头', I: '车端控制器', J: '随状态更新', K: '保护车内隐私', L: '本地状态展示' },
  },
];
