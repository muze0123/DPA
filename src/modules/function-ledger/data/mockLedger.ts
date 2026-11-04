import type { DevelopmentLocation, FunctionRecord, ResponsibleDepartment } from './ledger';
import { TIANSHU_PARTS, partLabel } from './tianshu';

interface MockFunctionSeed {
  platformName: string;
  functionName: string;
  functionDescription: string;
  owner: string;
  department: string;
  developmentLocation: DevelopmentLocation;
  /** master ECU 采用天枢「零部件」下拉参数格式：零部件编号-零部件名称 */
  masterEcu: string;
  subfunctionName: string;
  controllers: string[];
}

/** master ECU 复合标识直接取自天枢零部件数据，保证演示数据与下拉参数一致 */
const PART = {
  bcm: partLabel(TIANSHU_PARTS[1]!),
  tcu: partLabel(TIANSHU_PARTS[2]!),
  gw: partLabel(TIANSHU_PARTS[0]!),
  hvac: partLabel(TIANSHU_PARTS[4]!),
  bms: partLabel(TIANSHU_PARTS[5]!),
  ivi: partLabel(TIANSHU_PARTS[3]!),
} as const;

const mockFunctions: MockFunctionSeed[] = [
  { platformName: '车载平台 A', functionName: '远程车门解锁', functionDescription: '用户通过手机 App 远程解锁车门，指令经 TSP 平台下发至车端执行。', owner: '张晨', department: '车控研发', developmentLocation: 'china', masterEcu: PART.bcm, subfunctionName: '解锁指令', controllers: ['BCM'] },
  { platformName: '车载平台 A', functionName: '车辆位置查询', functionDescription: '用户在 App 内查看车辆当前位置，位置数据由 TCU 上报云端缓存。', owner: '李岩', department: '云平台', developmentLocation: 'china', masterEcu: PART.tcu, subfunctionName: '定位查询', controllers: ['TCU'] },
  { platformName: '车载平台 A', functionName: '车辆状态查看', functionDescription: '展示车门、车窗、胎压等整车状态，状态经网关汇总后上报。', owner: '王宁', department: '车控研发', developmentLocation: 'china', masterEcu: PART.gw, subfunctionName: '状态上报', controllers: ['GW'] },
  { platformName: '车载平台 A', functionName: '远程空调控制', functionDescription: '用户远程设定空调温度与开关，指令下发至空调控制器执行。', owner: '张晨', department: '车控研发', developmentLocation: 'germany', masterEcu: PART.hvac, subfunctionName: '温度设置', controllers: ['HVAC'] },
  { platformName: '车载平台 A', functionName: '充电预约', functionDescription: '用户预约充电时段，BMS 按计划在插枪后自动启动充电。', owner: '陈悦', department: '云平台', developmentLocation: 'china', masterEcu: PART.bms, subfunctionName: '预约充电', controllers: ['BMS'] },
  { platformName: '车载平台 A', functionName: '行程记录', functionDescription: '记录行驶里程与轨迹摘要，用于行程回顾与能耗分析。', owner: '李岩', department: '云平台', developmentLocation: 'china', masterEcu: PART.tcu, subfunctionName: '行程汇总', controllers: ['TCU'] },
  { platformName: '车机平台 B', functionName: '用户账号登录', functionDescription: '用户在车机端登录账号以同步个性化设置与服务订阅。', owner: '王宁', department: '座舱研发', developmentLocation: 'china', masterEcu: PART.ivi, subfunctionName: '账号验证', controllers: ['IVI'] },
  { platformName: '车机平台 B', functionName: '车主身份验证', functionDescription: '通过账号与设备绑定核验车主身份，作为车控指令的鉴权前提。', owner: '陈悦', department: '座舱研发', developmentLocation: 'germany', masterEcu: PART.ivi, subfunctionName: '身份核验', controllers: ['IVI'] },
  { platformName: '车机平台 B', functionName: '蓝牙钥匙', functionDescription: '手机与车辆蓝牙配对后作为数字钥匙，实现近场解闭锁与启动。', owner: '张晨', department: '车控研发', developmentLocation: 'china', masterEcu: PART.bcm, subfunctionName: '钥匙配对', controllers: ['BCM'] },
  { platformName: '车机平台 B', functionName: '导航目的地同步', functionDescription: '手机端设定的导航目的地同步至车机继续导航。', owner: '李岩', department: '座舱研发', developmentLocation: 'germany', masterEcu: PART.ivi, subfunctionName: '目的地接收', controllers: ['IVI'] },
  { platformName: '车机平台 B', functionName: '软件更新提醒', functionDescription: '检测到新版本时在车机端提醒用户升级，不自动安装。', owner: '王宁', department: '云平台', developmentLocation: 'china', masterEcu: PART.gw, subfunctionName: '版本通知', controllers: ['GW'] },
  { platformName: '车机平台 B', functionName: '语音助手', functionDescription: '通过车内麦克风采集语音指令，完成车控、导航等交互。', owner: '陈悦', department: '座舱研发', developmentLocation: 'germany', masterEcu: PART.ivi, subfunctionName: '语音唤醒', controllers: ['IVI'] },
  { platformName: '移动服务 C', functionName: '车内摄像头查看', functionDescription: '用户在 App 内实时查看车内摄像头画面，用于驻车监看。', owner: '张晨', department: '移动端', developmentLocation: 'china', masterEcu: PART.ivi, subfunctionName: '画面预览', controllers: ['IVI'] },
  { platformName: '移动服务 C', functionName: '紧急呼叫', functionDescription: '碰撞后自动或手动发起紧急呼叫，向救援平台上报车辆位置。', owner: '李岩', department: '移动端', developmentLocation: 'germany', masterEcu: PART.tcu, subfunctionName: '呼叫发起', controllers: ['TCU'] },
  { platformName: '移动服务 C', functionName: '车辆共享授权', functionDescription: '车主向其他用户授予临时用车权限，到期自动回收。', owner: '王宁', department: '移动端', developmentLocation: 'china', masterEcu: PART.bcm, subfunctionName: '共享邀请', controllers: ['BCM'] },
  { platformName: '移动服务 C', functionName: '车辆数据导出', functionDescription: '按用户申请导出指定时间范围内的车辆数据打包文件。', owner: '陈悦', department: '移动端', developmentLocation: 'germany', masterEcu: PART.gw, subfunctionName: '数据打包', controllers: ['GW'] },
];

const additionalSubfunctions: Partial<Record<number, { name: string; controllers: string[] }>> = {
  0: { name: '解锁结果反馈', controllers: ['GW'] },
  7: { name: '身份结果同步', controllers: ['TCU'] },
};

const additionalResponsibles: Partial<Record<number, ResponsibleDepartment[]>> = {
  0: [{ name: '李岩', department: '云平台' }],
  7: [{ name: '张晨', department: '车控研发' }, { name: '王宁', department: '座舱研发' }],
};

export const MOCK_FUNCTION_RECORDS: FunctionRecord[] = mockFunctions.map(({ subfunctionName, controllers, ...seed }, index) => ({
  ...seed,
  id: `function-${index + 1}`,
  fuliId: `FL-2025-${String(index + 1).padStart(4, '0')}`,
  subfunctions: [{ name: subfunctionName, controllers }, ...(additionalSubfunctions[index] ? [additionalSubfunctions[index]] : [])],
  responsibles: [{ name: seed.owner, department: seed.department }, ...(additionalResponsibles[index] ?? [])],
  creator: '张晨',
  createdAt: `2026-09-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
  updatedAt: `2026-10-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`,
  deletedAt: null,
  disabledAt: null,
}));
