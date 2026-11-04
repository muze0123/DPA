/**
 * 「天枢」系统平台演示数据（2026-10-29 用户裁决）：
 * 项目暂无天枢系统接口，此处按其字段结构内置演示数据，
 * 封装为独立数据源，后续可无缝替换为真实接口调用。
 *
 * - 「整车架构平台」功能模块 → TIANSHU_PLATFORMS（平台编号 + 平台名称）
 * - 「零部件」功能模块 → TIANSHU_PARTS（零部件编号 + 零部件名称 + 该零部件承载的子功能与控制器）
 *
 * 下拉框参数格式：`${编号}-${名称}`，如 'PL-001-EEA 3.0 平台'、'PN-GW-1001-网关 GW'。
 */

export interface TianshuPlatform {
  code: string;
  name: string;
}

export interface TianshuSubfunction {
  name: string;
  /** 子功能与控制器为 1:N：一个子功能可由多个控制器承载 */
  controllers: string[];
}

export interface TianshuPart {
  code: string;
  name: string;
  /** 该零部件承载的子功能及控制器；选择 master ECU 后据此带入回显 */
  subfunctions: TianshuSubfunction[];
}

export const TIANSHU_PLATFORMS: TianshuPlatform[] = [
  { code: 'PL-001', name: 'EEA 3.0 平台' },
  { code: 'PL-002', name: 'EEA 2.0 平台' },
  { code: 'PL-003', name: '区域架构平台' },
];

export const TIANSHU_PARTS: TianshuPart[] = [
  {
    code: 'PN-GW-1001', name: '网关 GW',
    subfunctions: [
      { name: '状态上报', controllers: ['GW', '中央计算单元 CCU'] },
      { name: '版本通知', controllers: ['GW'] },
      { name: '数据打包', controllers: ['GW'] },
    ],
  },
  {
    code: 'PN-BCM-1002', name: '车身控制 BCM',
    subfunctions: [
      { name: '解锁指令', controllers: ['BCM'] },
      { name: '解锁结果反馈', controllers: ['GW', 'BCM'] },
      { name: '钥匙配对', controllers: ['BCM', '蓝牙模块 BLE'] },
      { name: '共享邀请', controllers: ['BCM'] },
    ],
  },
  {
    code: 'PN-TCU-1003', name: '远程通讯 TCU',
    subfunctions: [
      { name: '定位查询', controllers: ['TCU'] },
      { name: '行程汇总', controllers: ['TCU'] },
      { name: '呼叫发起', controllers: ['TCU'] },
    ],
  },
  {
    code: 'PN-IVI-1004', name: '车机主机 IVI',
    subfunctions: [
      { name: '账号验证', controllers: ['IVI'] },
      { name: '身份核验', controllers: ['IVI'] },
      { name: '身份结果同步', controllers: ['TCU', 'IVI'] },
      { name: '目的地接收', controllers: ['IVI'] },
      { name: '语音唤醒', controllers: ['IVI'] },
      { name: '画面预览', controllers: ['IVI'] },
    ],
  },
  {
    code: 'PN-HVAC-1005', name: '空调控制器 HVAC',
    subfunctions: [
      { name: '温度设置', controllers: ['HVAC'] },
    ],
  },
  {
    code: 'PN-BMS-1006', name: '电池管理 BMS',
    subfunctions: [
      { name: '预约充电', controllers: ['BMS'] },
    ],
  },
];

export function platformLabel(platform: TianshuPlatform): string {
  return `${platform.code}-${platform.name}`;
}

export function partLabel(part: TianshuPart): string {
  return `${part.code}-${part.name}`;
}

/** 按下拉框参数（编号-名称）反查零部件，未命中返回 undefined */
export function findPartByLabel(label: string): TianshuPart | undefined {
  return TIANSHU_PARTS.find((part) => partLabel(part) === label);
}
