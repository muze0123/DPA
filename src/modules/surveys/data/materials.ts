/**
 * 测试材料清单（F-MAT-01~06 / 05 §6.1 右侧栏）。
 *
 * 数据来源：工作簿「通用材料」表只有空白模板，没有可用的材料台账，因此本目录由
 * **38 条款的 Document 段落（第 6 章点名）+ 第 9 章测试方法（第 9 章点名）归并**而成：
 * 每条材料记录 名称 / 阶段（开测前 · 测试中）/ 依据来源（ch6 · ch9 · 两者）/ 形态 / 生成方式，
 * 并建立材料 ↔ 条款的多对多映射（F-MAT-03/04 双向跳转、F-MAT-06 被多条款引用时提示复用）。
 *
 * 准备状态（F-MAT-05：是否已备、位置链接、责任人）为**演示数据**：默认按材料性质预置
 * 「开测前文档多为未备、基础清单类已备」，接入服务端后由材料库维护；页面注明 mock 口径。
 * 材料名称属业务数据，任何语言读原文，不进 i18n 词典。
 */
import { reactive } from 'vue';

export type MaterialStage = 'pre-test' | 'in-test';
export type MaterialBasis = 'ch6' | 'ch9' | 'both';

export interface MaterialDef {
  id: string;
  name: string;
  stage: MaterialStage;
  basis: MaterialBasis;
  /** 形态：文档 / 表格 / 截图 / 日志 / 代码包 / 账号凭据 */
  form: 'doc' | 'sheet' | 'screenshot' | 'log' | 'package' | 'credential';
  /** 生成方式或取得途径 */
  method: string;
  /** 支撑的条款号（多对多） */
  clauses: string[];
  /** 演示用初始准备状态 */
  ready: boolean;
}

export const MATERIALS: readonly MaterialDef[] = [
  {
    id: 'MAT-01', name: '个人信息处理功能清单（按功能一份）', stage: 'pre-test', basis: 'both', form: 'sheet',
    method: '按工作簿「功能清单」模板逐功能填写，随问卷版本冻结',
    clauses: ['6.1.1', '6.1.2', '6.2.1.1', '6.2.1.2', '6.2.2', '6.2.3', '6.3.2', '6.3.3', '6.3.4', '6.3.5', '6.3.7', '6.4.1', '6.4.3', '6.7.3', '6.7.4'],
    ready: true,
  },
  {
    id: 'MAT-02', name: '汽车数据处理活动清单（General）', stage: 'pre-test', basis: 'ch6', form: 'sheet',
    method: '按第 6 章 Document 段要求逐活动登记，含删除方式与账号删除说明',
    clauses: ['6.1.6', '6.5.1', '6.5.2', '6.6.1.1', '6.6.1.3', '6.7.2', '6.7.4'],
    ready: true,
  },
  {
    id: 'MAT-03', name: '个人信息处理规则（隐私政策）文本与展示截图', stage: 'pre-test', basis: 'ch6', form: 'doc',
    method: '车端/手册/APP 展示位置截图 + 规则全文，标注更新日期与版本',
    clauses: ['6.1.2', '6.1.3', '6.3.7'],
    ready: false,
  },
  {
    id: 'MAT-04', name: '功能级告知与同意设计说明', stage: 'pre-test', basis: 'ch6', form: 'doc',
    method: '说明拒绝后 48 小时内不重复索要、按功能单独同意、同意期限自主设定',
    clauses: ['6.1.2', '6.2.1.1', '6.2.3', '6.3.1'],
    ready: false,
  },
  {
    id: 'MAT-05', name: '首次处理个人信息状态恢复方式说明', stage: 'pre-test', basis: 'ch6', form: 'doc',
    method: '说明 R&P / RNR 后引导恢复流程与可复现步骤',
    clauses: ['6.2.3', '6.3.6', '6.3.7'],
    ready: false,
  },
  {
    id: 'MAT-06', name: '同意期限届满处理方案与触发方式说明', stage: 'pre-test', basis: 'ch6', form: 'doc',
    method: '写明期限设定、届满停止处理、续期重新同意与触发演示步骤',
    clauses: ['6.2.4.1', '6.2.4.2', '6.2.5.1', '6.2.5.2'],
    ready: false,
  },
  {
    id: 'MAT-07', name: '撤回同意路径设计说明与截图', stage: 'pre-test', basis: 'ch6', form: 'screenshot',
    method: '车端撤回入口截图 + 撤回后停止处理的实现说明',
    clauses: ['6.2.5.1', '6.2.5.2'],
    ready: false,
  },
  {
    id: 'MAT-08', name: '豁免情形清单与必要性说明', stage: 'pre-test', basis: 'ch6', form: 'sheet',
    method: '逐项列明 6.2.2 例外情形、法律依据与功能必要性',
    clauses: ['6.2.2'],
    ready: false,
  },
  {
    id: 'MAT-09', name: '应用下载平台展示信息与规则链接', stage: 'pre-test', basis: 'ch6', form: 'screenshot',
    method: '平台内运营者信息、功能简介、权限列表与规则链接的截图',
    clauses: ['6.1.4'],
    ready: false,
  },
  {
    id: 'MAT-10', name: '未成年人个人信息处理规则（如适用）', stage: 'pre-test', basis: 'ch6', form: 'doc',
    method: '独立页面或弹窗的规则文本与入口截图；不处理未成年人信息时出具说明',
    clauses: ['6.1.5'],
    ready: false,
  },
  {
    id: 'MAT-11', name: '权限调用统计与记录规则说明', stage: 'pre-test', basis: 'ch6', form: 'screenshot',
    method: '车端权限调用统计界面截图 + 记录保存期限与规则说明',
    clauses: ['6.1.6'],
    ready: false,
  },
  {
    id: 'MAT-12', name: '采集设备参数表与必要性说明', stage: 'pre-test', basis: 'ch6', form: 'sheet',
    method: '摄像头/雷达型号、覆盖范围、分辨率与功能需求对照表',
    clauses: ['6.3.3', '6.3.4'],
    ready: false,
  },
  {
    id: 'MAT-13', name: '数据分类与加密方案（含算法说明）', stage: 'pre-test', basis: 'ch6', form: 'doc',
    method: '敏感个人信息与重要数据的存储加密/访问控制方案，算法参照 VW80180-1',
    clauses: ['6.4.2', '6.6.1.2'],
    ready: false,
  },
  {
    id: 'MAT-14', name: '存储期限与到期删除/覆写机制说明', stage: 'pre-test', basis: 'ch6', form: 'doc',
    method: '存储位置、期限、到期处理方式与触发方法',
    clauses: ['6.4.1', '6.7.2'],
    ready: false,
  },
  {
    id: 'MAT-15', name: '生物特征识别处理技术设计文档', stage: 'pre-test', basis: 'ch6', form: 'doc',
    method: '含车内存储方案、出车单独同意、加密存储的解密访问方法',
    clauses: ['6.4.3', '6.5.1'],
    ready: false,
  },
  {
    id: 'MAT-16', name: '口令显示与输入隐藏设计截图', stage: 'pre-test', basis: 'ch6', form: 'screenshot',
    method: '支付口令输入与显示界面的隐藏实现截图',
    clauses: ['6.5.2'],
    ready: false,
  },
  {
    id: 'MAT-17', name: '车外数据匿名化方案文档', stage: 'pre-test', basis: 'ch6', form: 'doc',
    method: '人脸 ≥28px / 号牌 ≥16px 的判定阈值、轮廓化与过程数据不出车说明',
    clauses: ['6.6.1.3', '6.6.2.1.1', '6.6.2.1.2'],
    ready: false,
  },
  {
    id: 'MAT-18', name: '座舱敏感数据采集提示设计文档与车内实拍', stage: 'pre-test', basis: 'ch6', form: 'doc',
    method: '浮窗/提示音/状态灯等提示方式说明与实拍，含不同类型区分方式',
    clauses: ['6.3.2'],
    ready: false,
  },
  {
    id: 'MAT-19', name: '匿名化检出率与不可识别性测试报告', stage: 'in-test', basis: 'ch9', form: 'doc',
    method: '按 9.8.4 取样测试，人脸与号牌分别统计检出率（≥90%）与人工核验结论',
    clauses: ['6.6.2.2.1', '6.6.2.2.2'],
    ready: false,
  },
  {
    id: 'MAT-20', name: '删除功能设计文档与删除效果测试记录', stage: 'in-test', basis: 'ch9', form: 'doc',
    method: '车内/账号删除路径、删除后不可检索不可访问的验证记录',
    clauses: ['6.7.1', '6.7.2', '6.7.3'],
    ready: false,
  },
  {
    id: 'MAT-21', name: '车机测试账号与登录凭据', stage: 'in-test', basis: 'ch9', form: 'credential',
    method: '可用账号口令与账号删除的复现步骤（按安全要求单独交付）',
    clauses: ['6.7.4'],
    ready: false,
  },
  {
    id: 'MAT-22', name: '出境抓包日志（全通道 ≥3600s）', stage: 'in-test', basis: 'ch9', form: 'log',
    method: '按 9.10 在中国大陆境内抓包，覆盖蜂窝/WLAN/蓝牙通道，tcpdump 原始日志',
    clauses: ['6.8'],
    ready: false,
  },
  {
    id: 'MAT-23', name: '功能安装包与测试环境说明', stage: 'in-test', basis: 'ch9', form: 'package',
    method: 'APK/升级包、车型与软件版本、测试前置条件说明',
    clauses: [],
    ready: false,
  },
];

/** 问卷维度的准备状态（演示态，可按材料切换「已备」并登记责任人/位置） */
export interface MaterialStatus {
  ready: boolean;
  owner?: string;
  location?: string;
}

const statuses = reactive<Record<string, Record<string, MaterialStatus>>>({});

export function ensureMaterialStatus(surveyId: string): Record<string, MaterialStatus> {
  let store = statuses[surveyId];
  if (!store) {
    store = {};
    for (const material of MATERIALS) store[material.id] = { ready: material.ready };
    statuses[surveyId] = store;
  }
  return store;
}

export function materialStatus(surveyId: string, materialId: string): MaterialStatus {
  return ensureMaterialStatus(surveyId)[materialId] ?? { ready: false };
}

export function setMaterialReady(surveyId: string, materialId: string, patch: Partial<MaterialStatus>): void {
  const store = ensureMaterialStatus(surveyId);
  store[materialId] = { ...(store[materialId] ?? { ready: false }), ...patch };
}

/** 条款 → 支撑该条款的材料（F-MAT-04） */
export function materialsOfClause(clauseNo: string): readonly MaterialDef[] {
  return MATERIALS.filter((material) => material.clauses.includes(clauseNo));
}

/** 该问卷参与条款下的材料（按阶段、依据过滤；条款为空表示通用材料，始终保留） */
export function materialsForClauses(
  clauses: readonly string[],
  options: { stage?: MaterialStage | 'all'; basis?: MaterialBasis | 'all' } = {},
): readonly MaterialDef[] {
  const participating = new Set(clauses);
  return MATERIALS.filter((material) => {
    if (options.stage && options.stage !== 'all' && material.stage !== options.stage) return false;
    if (options.basis && options.basis !== 'all' && material.basis !== options.basis && material.basis !== 'both') return false;
    if (!material.clauses.length) return true;
    return material.clauses.some((no) => participating.has(no));
  });
}

/** 未备数量（F-MAT-05 看板计数） */
export function unreadyCount(surveyId: string, materials: readonly MaterialDef[]): number {
  return materials.filter((material) => !materialStatus(surveyId, material.id).ready).length;
}
