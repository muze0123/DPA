/**
 * 问卷工作区（问卷详情容器）的状态投影。
 *
 * 步进条 = 问卷业务阶段（v1.3 七阶段）的前端投影：每一步能否进入由阶段决定
 * （状态即导航，05 方案 §1.1）；前端只做置灰与引导，非法操作由服务端拒绝。
 * 七步：基础信息 → 12问作答 → 条款匹配确认 → 填写分区 → 审批与看板 → 证据与导出 → 完成度与收集。
 * 阶段↔步骤映射为 2026-10-26 用户裁决口径（依据状态机迁移表 N1–N8）；
 * 第 7 步「完成度与收集」为 2026-10-27 新增（对齐原型 tab ⑤ / FR-12），只读汇总 + 排期提醒。
 */
import type { SurveyStatus } from './surveys';

export type SurveyStepKey = 'basicInfo' | 'questions' | 'matching' | 'sections' | 'review' | 'evidence' | 'collection';

export interface SurveyStep {
  no: number;
  key: SurveyStepKey;
}

/** 七步定义：i18n key 在 surveys.workspace.steps 命名空间下 */
export const SURVEY_STEPS: readonly SurveyStep[] = [
  { no: 1, key: 'basicInfo' },
  { no: 2, key: 'questions' },
  { no: 3, key: 'matching' },
  { no: 4, key: 'sections' },
  { no: 5, key: 'review' },
  { no: 6, key: 'evidence' },
  { no: 7, key: 'collection' },
];

export const SURVEY_STEP_COUNT = SURVEY_STEPS.length;

/**
 * 阶段投影：accessible = 可进入的最大步骤号（1 恒可进入）；
 * current = 该阶段的「行动步」（待处理/待提交=绑定功能与规则、待确认=条款确认、……、已完成=证据导出）。
 * 待处理 / 待提交：任务下发后需先在基本信息中绑定功能与规则（2026-10-30 用户裁决），
 * 行动步为第 1 步，其余步骤在提交任务（→ 待填写）前锁定。
 * 匹配审核中的行动步是第 5 步「审批与看板」（05 §5 是合规专员主战场，2026-10-26 第 5 步交付时对齐）；
 * 第 3 步此时仍可进入但只读，页面以横幅表达审核进行中。
 * 匹配审批通过即进入分区填写中：行动步回到第 4 步「填写分区」，第 5 步保留为可查看的审批结果。
 * 第 6 步「证据与导出」从**分区审核中**起开放：材料备料在开测前、证据补录在测试中，
 * 完成后证据只读（T12 允许锁定后补录，不允许归档后回改）；已完成时该步成为行动步。
 * 第 7 步「完成度与收集」与第 6 步同期开放（同一批证据数据），只读汇总 + 排期提醒，
 * 因此不改变任何阶段的行动步（current 保持原口径）。
 * 已撤回 / 已作废为天枢侧终态：仅第 1 步只读可看。
 */
const STAGE_PROJECTION: Record<SurveyStatus, { accessible: number; current: number }> = {
  // 待处理：任务已下发，待执行（绑定功能与规则）
  pending: { accessible: 1, current: 1 },
  // 待提交：基本信息已绑定，保存草稿后可继续编辑或提交任务
  draft: { accessible: 1, current: 1 },
  // 待填写：已分派给填表人但 12 问尚未完成作答，行动步是第 2 步（作答）
  'pending-fill': { accessible: 2, current: 2 },
  'pending-confirm': { accessible: 3, current: 3 },
  // 匹配审核中（2026-11-02 用户裁决 + 2026-11-04 修正）：审核对象是第 3 步各条款匹配结果，
  // 行动步落「匹配结果」；后续步骤（填写分区 / 审核与看板 / 证据 / 完成度）一律置灰不可进入，
  // 全部条款审核通过后才进入分区填写中（审核与看板作为分区审核中的行动步在更后阶段开放）。
  'matching-reviewing': { accessible: 3, current: 3 },
  // 分区填写中：行动步第 4 步（填写分区）
  'section-filling': { accessible: 5, current: 4 },
  // 分区审核中：分区填写提交后由审批人审核，行动步落第 5 步「审核与看板」（原型 ④）
  'section-reviewing': { accessible: 7, current: 5 },
  archived: { accessible: 7, current: 6 },
  // 天枢侧终态：任务已撤销 / 已作废，全部步骤只读
  withdrawn: { accessible: 1, current: 1 },
  voided: { accessible: 1, current: 1 },
};

/** 当前阶段的行动步（详情页默认落点） */
export function currentSurveyStep(status: SurveyStatus): number {
  return STAGE_PROJECTION[status].current;
}

/** 该阶段能否进入第 no 步（1 恒可进入） */
export function isStepAccessible(status: SurveyStatus, no: number): boolean {
  if (no < 1 || no > SURVEY_STEP_COUNT) return false;
  return no <= STAGE_PROJECTION[status].accessible;
}

/**
 * 把路由上的 step 参数归一到合法步骤：
 * 非数字、越界或该阶段不可进入 → 回落到当前行动步（避免深链失效后停在非法路由）。
 */
export function resolveStepParam(status: SurveyStatus, raw: unknown): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  if (Number.isInteger(value) && isStepAccessible(status, value)) return value;
  return currentSurveyStep(status);
}

/** 步骤在步进条中的呈现态：current 行动步 / done 已走过的可进入步 / open 可进入的后续步 / locked 置灰 */
export type SurveyStepState = 'current' | 'done' | 'open' | 'locked';

export function surveyStepState(status: SurveyStatus, no: number): SurveyStepState {
  if (!isStepAccessible(status, no)) return 'locked';
  const current = currentSurveyStep(status);
  if (no === current) return 'current';
  return no < current ? 'done' : 'open';
}
