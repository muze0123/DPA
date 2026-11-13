/**
 * 任务管理（CSA 合规自评）模块数据层。
 *
 * 评估问卷改为由天枢-任务中心创建任务并下发到本平台（2026-10-30 用户裁决）：
 * 一条记录 = 一个下发任务；「待处理」为下发后的初始状态，执行时在任务详情的
 * 基本信息中绑定功能与判定规则，保存草稿 → 待提交，提交任务 → 待填写（分派填表人
 * 完成 12 问作答），随后进入待确认 → 匹配审核中 → 分区填写中 → 分区审核中 → 已完成。
 * 「退回」不是独立状态，表现为当前阶段上的退回标记（returnInfo），列表页渲染红标 + Popover；
 * 「已撤回 / 已作废」为天枢侧终态，本平台只读。
 *
 * 当前为模块内 mock 数据，直到提供真实 API 契约；不对外宣称已接入后端。
 */
import { reactive } from 'vue';
import type { FunctionInput } from '../../function-ledger/data/ledger';
import { MOCK_FUNCTION_RECORDS } from '../../function-ledger/data/mockLedger';
import { STANDARD_NODES } from '../../compliance/data/standard';
import { deleteLocalSurveyDraft, localSurveyDraftIds as localDraftIds, updateLocalSurveyDraft } from './drafts';
import { QUESTION_BANK, questionCodes, type SurveyAnswer } from './questions';

export interface SurveyCreationSnapshot {
  function: FunctionInput;
  masterUpdatedAt: string;
  /** 创建时选用的模板编号（TPL-YYYY-###）；早期快照无此字段，按 templateVersion 回落 */
  templateId?: string;
  /** 创建时的模板名称（模板后续改名/删除后仍可追溯） */
  templateName?: string;
  templateVersion: string;
  /**
   * 创建时的模板最近更新时间与模板说明（2026-10-27 裁决）：
   * 详情页「版本引用」以这两项替代标准草案日期与 PDF 哈希，历史快照无此字段时显示 —。
   */
  templateUpdatedAt?: string;
  templateNote?: string;
  /** 冻结的题目集：模板内自定义录入后，题目内容随创建快照冻结，模板升版不影响历史问卷 */
  questions?: SurveyQuestionSnapshot[];
  questionCount: number;
  ruleSetVersion: string;
  mappingVersion: string;
  /**
   * 创建时冻结的规则映射（2026-11-01）：条款 → 安全需求条目引用 / 条款 → 分区字段位。
   * 规则后续编辑不再影响历史问卷（与题目快照同口径）；缺省视为历史快照，回落现行规则。
   */
  ruleItems?: Record<string, string[]>;
  ruleSections?: Record<string, { section: string; field: string }>;
  /** 标准文件基线（2026-10-27 起详情页不再展示；保留冻结值供导出/追溯核对） */
  standardPdfSha256: string;
  standardDraftDate: string;
}

/** 快照里的题目（结构对齐模板题目，避免数据层反向依赖模板模块） */
export interface SurveyQuestionSnapshot {
  /** 题号（题库题 = 题库 code；判定与答案存储的唯一标识，2026-11-01 起） */
  code: string;
  /** 自建题声明的命中条款（2026-10-28）：以「或」语义并入这些条款的判定 */
  clauseNos?: string[];
  title: string;
  guide: string;
}

/**
 * 问卷状态（任务口径，2026-10-30 用户裁决）：评估问卷改为由天枢-任务中心创建任务并下发，
 * 本平台只承接执行。`pending` 待处理 = 任务下发后的初始状态（尚未绑定功能与规则）；
 * `withdrawn` 已撤回 = 天枢任务撤销；`voided` 已作废 = 天枢任务作废——两者均为只读终态。
 * 「已退回」不在此列，仍用 returnInfo 表达（阶段内退回标记 + 原因气泡）。
 */
export type SurveyStatus =
  | 'pending'
  | 'draft'
  | 'pending-fill'
  | 'pending-confirm'
  | 'matching-reviewing'
  | 'section-filling'
  | 'section-reviewing'
  | 'archived'
  | 'withdrawn'
  | 'voided';

export const SURVEY_STATUSES = [
  'pending',
  'draft',
  'pending-fill',
  'pending-confirm',
  'matching-reviewing',
  'section-filling',
  'section-reviewing',
  'archived',
  'withdrawn',
  'voided',
] as const satisfies readonly SurveyStatus[];

/** 任务优先级（天枢下发字段）：紧急 / 高 / 中 / 低 */
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low';

export const TASK_PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const satisfies readonly TaskPriority[];

/** 来源标识（F-SURV-09）：手工创建 / Excel 导入。 */
export type SurveySource = 'manual' | 'excel';

export const SURVEY_SOURCES = ['manual', 'excel'] as const satisfies readonly SurveySource[];

/**
 * 角色可见范围（F-SURV-02）使用的角色枚举。
 * mock 口径，待服务端角色接口替换：auth store 当前只有登录态（admin 账号），
 * 没有角色字段，这里先在模块内声明最小角色模型，接服务端后改为接口返回值。
 */
export type SurveyRole = 'owner' | 'compliance' | 'readonly';

export interface SurveyCurrentUser {
  accountId: string;
  name: string;
  role: SurveyRole;
}

export interface SurveyReturnInfo {
  /** 退回原因（业务自由文本，任何语言读数据层原文） */
  reason: string;
  /** 退回操作人 */
  operator: string;
  /** 退回时间，YYYY-MM-DD HH:mm:ss */
  time: string;
  /** 匹配审批驳回时需重新确认的条款号；整卷或分区退回可为空 */
  clauseNos?: string[];
}

/** 单条款人工确认（BR-018 manual 列；判否原因必填见 BR-021） */
export interface ClauseConfirm {
  /** 人工确认值：是=适用 / 否=不适用（05 §3.2 两态口径，02 主流程「逐条款 是 或 否」） */
  value: 'applicable' | 'not-applicable';
  /** 原因：人工判否必填；改判适用（D4）可选填差异理由 */
  reason: string;
}

/**
 * 条款匹配审核记录（匹配审核中阶段，审批人逐条/批量「通过 / 拒绝」）。
 * 通过 = 该条款匹配结果审核完成（全部条款通过 ⇒ 问卷直接进入「分区填写中」）；
 * 拒绝 = 该条款退回重新确认（人工确认值清除，问卷状态回退待确认并留退回痕迹）。
 */
export interface ClauseMatchReview {
  result: 'approved' | 'rejected';
  /** 审核人（取记录当前审核责任人） */
  by: string;
  /** 审核备注；拒绝时即退回意见（必填） */
  note: string;
  /** 审核时间，YYYY-MM-DD HH:mm:ss */
  at: string;
}

/** 已关闭的匹配审批轮次：退回后保留逐条结论；通过的条款继续锁定。 */
export interface ClauseMatchReviewRound {
  returnedAt: string;
  returnedBy: string;
  reason: string;
  rejectedClauses: string[];
  reviews: Record<string, ClauseMatchReview>;
}

/**
 * 匹配快照（v1.3 `matchSnapshot` 轴）：基于现行判定规则的自动初筛结果与人工确认值。
 * 重算只写 autoResults（BR-009），manual 不被覆盖；answersFingerprint 用于
 * 检测「作答已变更」并提示重算（05 §3.3 重算联动）。
 */
export interface SurveyMatching {
  ruleSetVersion: string;
  /** 初筛计算时间，YYYY-MM-DD HH:mm:ss */
  evaluatedAt: string;
  /** 初筛时的作答指纹（JSON），变更后进入步骤3触发重算提示 */
  answersFingerprint: string;
  /** 自动初筛：条款号 → 'applicable' 适用 | 'not-hit' 初筛不命中 | 'undetermined' 待核验（命中题含待定，BR-020） */
  autoResults: Record<string, 'applicable' | 'not-hit' | 'undetermined'>;
  /** 人工确认：条款号 → 确认值与原因 */
  manual: Record<string, ClauseConfirm>;
  /** 当前有效的匹配审批结论；已通过条款跨退回轮次保留 */
  reviews?: Record<string, ClauseMatchReview>;
  /** 已退回的匹配审批历史，用于展示驳回留痕并兼容旧本地记录 */
  reviewRounds?: ClauseMatchReviewRound[];
}

/** 通过条款跨轮次锁定；历史轮次回退兼容此前清空 reviews 的本地记录。 */
export function approvedClauseReview(matching: SurveyMatching | undefined, no: string): ClauseMatchReview | undefined {
  const current = matching?.reviews?.[no];
  if (current?.result === 'approved') return current;
  const rounds = matching?.reviewRounds ?? [];
  for (let index = rounds.length - 1; index >= 0; index -= 1) {
    const review = rounds[index].reviews[no];
    if (review?.result === 'approved') return review;
  }
  return undefined;
}

/** 最近一次驳回留痕，供重新确认时展示审核人与时间。 */
export function lastRejectedClauseReview(matching: SurveyMatching | undefined, no: string): ClauseMatchReview | undefined {
  const rounds = matching?.reviewRounds ?? [];
  for (let index = rounds.length - 1; index >= 0; index -= 1) {
    const review = rounds[index].reviews[no];
    if (review?.result === 'rejected') return review;
  }
  return undefined;
}

export interface SurveyRecord {
  id: string;
  /** 天枢-任务中心下发的任务名称（列表主标识，全局唯一） */
  taskName: string;
  /** 任务优先级（天枢下发）：紧急 / 高 / 中 / 低 */
  priority: TaskPriority;
  /** 任务描述（天枢下发，可选；列表默认隐藏） */
  taskDescription?: string;
  /** 任务截止时间（天枢下发，YYYY-MM-DD；逾期未完成显示「已延期 n 天」） */
  deadline?: string;
  /** 功能所属 FuLi ID（标识符，不做翻译） */
  fuliId: string;
  /** 功能名称（业务专有名词，不做翻译） */
  functionName: string;
  status: SurveyStatus;
  /** 功能负责人（角色可见范围按此过滤） */
  owner: string;
  /** 填表人 */
  respondent: string;
  /**
   * 审核人（F-SURV-02 列表必显字段）：当前阶段的审核责任人。
   * 匹配审核中 = 合规审核人；分区审核中 = 分区审核员；已完成 = 最终审核人。
   * 草稿/待确认/分区填写中尚无审核责任人，为空（列表显示「—」）。
   */
  reviewer?: string;
  source: SurveySource;
  /** 手工创建人；Excel 导入时为导入人 */
  sourceOperator: string;
  createdAt: string;
  /** Excel 导入时间（仅 excel 来源存在，F-SURV-09） */
  importedAt?: string;
  updatedAt: string;
  /** 最近一次更新人（列表/详情「更新人」字段；天枢下发数据由任务带入） */
  updatedBy?: string;
  /** 参与条目数（适用条款 x/64 的 x；DEV-03：为 0 时显示「—」） */
  matchedCount: number;
  /** 总条目数，GB 44464 条款表固定 64 */
  totalCount: number;
  /** 清单外功能（FR-01 主数据对账口径），列表页显示角标 */
  offLedger: boolean;
  /** 新建任务时选用的任务编排（系统设置「任务编排」编号；天枢下发的任务无此值） */
  orchestrationId?: string;
  /** 新建任务的附件（仅文件名与大小，mock 不落真实文件） */
  attachments?: { name: string; size: number }[];
  /** 退回标记：存在于当前阶段上，非独立状态 */
  returnInfo?: SurveyReturnInfo;
  /**
   * 逐题作答记录：key = 题目键（Q1…，随模板版本），value = 三态答案。
   * 草稿与待填写可部分作答；待确认及以后阶段必须全部有值（N2 门禁）。
   */
  answers?: Record<string, SurveyAnswer>;
  /** 匹配快照：N2 完成作答时由「服务端」（mock 规则引擎）计算，步骤3 人工确认读写 */
  matching?: SurveyMatching;
  creationSnapshot?: SurveyCreationSnapshot;
}

/** GB 44464 条款总条目数 */
export const SURVEY_TOTAL_CLAUSES = 64;

/**
 * 当前登录用户与角色。
 * mock 口径，待服务端角色接口替换：登录后真实姓名与角色应由用户/权限接口下发；
 * 这里取一名「合规专员」视角以便演示全部数据，负责人/只读视角由
 * visibleSurveysFor 的纯函数覆盖（见下），替换时只改这一处。
 */
export const MOCK_CURRENT_USER: SurveyCurrentUser = { accountId: 'demo-wang', name: '王建国', role: 'compliance' };

/**
 * 角色可见范围（F-SURV-02）：
 * - 功能负责人（owner）：仅见自己名下问卷；
 * - 合规专员/管理员（compliance）：见全部；
 * - 只读用户（readonly）：仅见已归档。
 * 纯函数便于单测与替换为服务端过滤。
 */
export function visibleSurveysFor(records: SurveyRecord[], user: SurveyCurrentUser): SurveyRecord[] {
  switch (user.role) {
    case 'compliance':
      return records;
    case 'owner':
      return records.filter((record) => record.owner === user.name);
    case 'readonly':
      return records.filter((record) => record.status === 'archived');
    default: {
      const exhausted: never = user.role;
      void exhausted;
      return [];
    }
  }
}

const seedSurveys: SurveyRecord[] = [
  {
    id: 'S-2026-0317', taskName: '车辆共享授权数据安全自评', priority: 'high', deadline: '2026-11-06',
    fuliId: '', functionName: '', status: 'pending',
    owner: '王建国', respondent: '王建国', source: 'manual', sourceOperator: '王建国',
    createdAt: '2026-03-31 16:40', updatedAt: '2026-03-31 16:40:00',
    matchedCount: 0, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
    taskDescription: '天枢-任务中心下发：请执行任务并绑定功能与判定规则后开始自评。',
  },
  {
    id: 'S-2026-0301', taskName: '车辆位置查询数据安全自评', priority: 'high', deadline: '2026-11-15',
    fuliId: 'FL-2025-0002', functionName: '车辆位置查询', status: 'draft',
    owner: '王建国', respondent: '李晓彤', source: 'manual', sourceOperator: '王建国',
    createdAt: '2026-03-28 14:10', updatedAt: '2026-03-30 15:20:00',
    matchedCount: 38, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
    taskDescription: '按 GB 44464 草案完成车辆位置查询功能的合规自评问卷。',
  },
  {
    id: 'S-2026-0309', taskName: '蓝牙钥匙数据安全自评', priority: 'urgent', deadline: '2026-11-08',
    fuliId: 'FL-2025-0009', functionName: '蓝牙钥匙', status: 'draft',
    owner: '陈志远', respondent: '周明', source: 'manual', sourceOperator: '陈志远',
    createdAt: '2026-03-29 10:05', updatedAt: '2026-03-29 10:05:00',
    matchedCount: 0, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
    taskDescription: '蓝牙数字钥匙功能涉及敏感动作控制，须重点核对身份鉴别条款。',
  },
  {
    id: 'S-2026-0316', taskName: '车辆数据导出合规评估', priority: 'high', deadline: '2026-11-05',
    fuliId: 'FL-2025-0016', functionName: '车辆数据导出', status: 'pending-fill',
    owner: '王建国', respondent: '李晓彤', source: 'manual', sourceOperator: '王建国',
    createdAt: '2026-03-31 09:15', updatedAt: '2026-03-31 09:15:00',
    matchedCount: 0, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
  },
  {
    id: 'S-2026-0302', taskName: '车辆状态查看数据安全自评', priority: 'medium', deadline: '2026-11-20',
    fuliId: 'FL-2025-0003', functionName: '车辆状态查看', status: 'pending-confirm',
    owner: '陈志远', respondent: '陈志远', source: 'excel', sourceOperator: '王建国',
    createdAt: '2026-03-12 09:40', importedAt: '2026-03-12 09:40', updatedAt: '2026-03-30 11:05:00',
    matchedCount: 41, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
  },
  {
    id: 'S-2026-0310', taskName: '充电预约合规评估', priority: 'medium', deadline: '2026-12-10',
    fuliId: 'FL-2025-0005', functionName: '充电预约', status: 'pending-confirm',
    owner: '赵敏', respondent: '赵敏', source: 'excel', sourceOperator: '李晓彤',
    createdAt: '2026-03-15 09:55', importedAt: '2026-03-15 09:55', updatedAt: '2026-03-28 11:50:00',
    matchedCount: 44, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
  },
  {
    id: 'S-2026-0320', taskName: '车辆共享授权匹配驳回复核', priority: 'high', deadline: '2026-11-20',
    fuliId: 'FL-2025-0015', functionName: '车辆共享授权', status: 'pending-confirm',
    owner: '王建国', respondent: '李晓彤', source: 'manual', sourceOperator: '王建国',
    createdAt: '2026-11-03 14:16:33', updatedAt: '2026-11-11 16:42:38',
    matchedCount: SURVEY_TOTAL_CLAUSES, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
    taskDescription: '车辆共享授权功能的数据安全合规自评待确认任务。',
    answers: Object.fromEntries(questionCodes().map((code) => [code, 'yes' as const])),
    returnInfo: {
      reason: '条款 6.1.1、6.1.6 的适用性依据不足，请重新确认后提交。',
      operator: '匹配审核员 赵敏', time: '2026-11-11 16:42:38',
      clauseNos: ['6.1.1', '6.1.6'],
    },
  },
  {
    id: 'S-2026-0303', taskName: '远程车门解锁合规评估', priority: 'urgent', deadline: '2026-10-25',
    fuliId: 'FL-2025-0001', functionName: '远程车门解锁', status: 'matching-reviewing',
    owner: '王建国', respondent: '赵敏', reviewer: '赵敏', source: 'manual', sourceOperator: '王建国',
    createdAt: '2026-03-18 10:00', updatedAt: '2026-03-30 09:48:00',
    matchedCount: 45, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
    taskDescription: '车型 C11 量产前须完成远程车门解锁功能的数据安全合规确认。',
  },
  {
    id: 'S-2026-0311', taskName: '导航目的地同步合规评估', priority: 'low', deadline: '2026-12-15',
    fuliId: 'FL-2025-0010', functionName: '导航目的地同步', status: 'matching-reviewing',
    owner: '刘思远', respondent: '李晓彤', reviewer: '赵敏', source: 'manual', sourceOperator: '刘思远',
    createdAt: '2026-03-16 14:20', updatedAt: '2026-03-28 09:35:00',
    matchedCount: 49, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
  },
  {
    id: 'S-2026-0304', taskName: '远程空调控制合规评估', priority: 'high', deadline: '2026-10-28',
    fuliId: 'FL-2025-0004', functionName: '远程空调控制', status: 'section-filling',
    owner: '刘思远', respondent: '刘思远', source: 'excel', sourceOperator: '李晓彤',
    createdAt: '2026-03-10 15:30', importedAt: '2026-03-10 15:30', updatedAt: '2026-03-29 18:12:00',
    matchedCount: 52, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
  },
  {
    id: 'S-2026-0305', taskName: '语音助手数据安全自评', priority: 'medium', deadline: '2026-11-30',
    fuliId: 'FL-2025-0012', functionName: '语音助手', status: 'section-filling',
    owner: '陈志远', respondent: '李晓彤', source: 'manual', sourceOperator: '陈志远',
    createdAt: '2026-03-05 09:20', updatedAt: '2026-03-29 17:40:00',
    matchedCount: 47, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
    returnInfo: { reason: '分区 B 的证据材料缺失，请补传后继续填写。', operator: '分区审核员 周明', time: '2026-03-27 14:05' },
  },
  {
    id: 'S-2026-0312', taskName: '蓝牙数字钥匙合规评估', priority: 'high', deadline: '2026-10-26',
    fuliId: 'FL-2024-0112', functionName: '蓝牙数字钥匙', status: 'section-filling',
    owner: '王建国', respondent: '赵敏', source: 'excel', sourceOperator: '王建国',
    createdAt: '2026-03-09 16:10', importedAt: '2026-03-09 16:10', updatedAt: '2026-03-27 19:02:00',
    matchedCount: 58, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: true,
  },
  {
    id: 'S-2026-0313', taskName: '软件更新提醒数据安全自评', priority: 'medium', deadline: '2026-11-25',
    fuliId: 'FL-2025-0011', functionName: '软件更新提醒', status: 'section-filling',
    owner: '陈志远', respondent: '陈志远', source: 'manual', sourceOperator: '陈志远',
    createdAt: '2026-03-04 10:30', updatedAt: '2026-03-26 14:44:00',
    matchedCount: 57, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
  },
  {
    id: 'S-2026-0306', taskName: '紧急呼叫合规评估', priority: 'urgent', deadline: '2026-11-10',
    fuliId: 'FL-2025-0014', functionName: '紧急呼叫', status: 'section-reviewing',
    owner: '王建国', respondent: '王建国', reviewer: '周明', source: 'excel', sourceOperator: '李晓彤',
    createdAt: '2026-03-08 11:15', importedAt: '2026-03-08 11:15', updatedAt: '2026-03-29 10:26:00',
    matchedCount: 55, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
  },
  {
    id: 'S-2026-0314', taskName: '车主身份验证合规评估', priority: 'high', deadline: '2026-11-12',
    fuliId: 'FL-2025-0008', functionName: '车主身份验证', status: 'section-reviewing',
    owner: '赵敏', respondent: '周明', reviewer: '赵敏', source: 'manual', sourceOperator: '赵敏',
    createdAt: '2026-03-06 09:10', updatedAt: '2026-03-25 17:20:00',
    matchedCount: 51, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
  },
  {
    id: 'S-2026-0307', taskName: '行程记录数据安全自评', priority: 'low', deadline: '2026-03-31',
    fuliId: 'FL-2025-0006', functionName: '行程记录', status: 'archived',
    owner: '赵敏', respondent: '赵敏', reviewer: '周明', source: 'manual', sourceOperator: '赵敏',
    createdAt: '2026-02-19 08:50', updatedAt: '2026-03-28 16:30:00',
    matchedCount: 60, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
  },
  {
    id: 'S-2026-0308', taskName: '电池热管理监测合规评估', priority: 'medium', deadline: '2026-03-31',
    fuliId: 'FL-2024-0108', functionName: '电池热管理监测', status: 'archived',
    owner: '刘思远', respondent: '周明', reviewer: '赵敏', source: 'excel', sourceOperator: '王建国',
    createdAt: '2026-02-26 13:40', importedAt: '2026-02-26 13:40', updatedAt: '2026-03-27 15:08:00',
    matchedCount: 33, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: true,
  },
  {
    id: 'S-2026-0315', taskName: '车内摄像头查看数据安全自评', priority: 'low', deadline: '2026-03-31',
    fuliId: 'FL-2025-0013', functionName: '车内摄像头查看', status: 'archived',
    owner: '刘思远', respondent: '李晓彤', reviewer: '周明', source: 'excel', sourceOperator: '李晓彤',
    createdAt: '2026-02-20 15:00', importedAt: '2026-02-20 15:00', updatedAt: '2026-03-24 09:12:00',
    matchedCount: 42, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
  },
  {
    id: 'S-2026-0318', taskName: '座舱氛围灯数据采集评估', priority: 'low', deadline: '2026-10-15',
    fuliId: 'FL-2024-0115', functionName: '座舱氛围灯', status: 'withdrawn',
    owner: '陈志远', respondent: '陈志远', source: 'manual', sourceOperator: '陈志远',
    createdAt: '2026-03-02 10:00', updatedAt: '2026-03-20 14:30:00',
    matchedCount: 18, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
    taskDescription: '该任务已由天枢任务发起人撤销，仅保留记录供追溯。',
  },
  {
    id: 'S-2026-0319', taskName: '行车记录仪云端同步评估', priority: 'medium', deadline: '2026-10-18',
    fuliId: 'FL-2024-0116', functionName: '行车记录仪云端同步', status: 'voided',
    owner: '刘思远', respondent: '李晓彤', source: 'excel', sourceOperator: '李晓彤',
    createdAt: '2026-02-28 09:30', importedAt: '2026-02-28 09:30', updatedAt: '2026-03-15 11:05:00',
    matchedCount: 36, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
    taskDescription: '该任务已由天枢管理员作废：功能方案变更，评估对象不再适用。',
  },

];

/**
 * 种子问卷的确定性 mock 答案：待确认及以后阶段按 N2 门禁应已完整作答，
 * 这里按问卷编号哈希生成稳定的答案分布（约 70% 是 / 20% 否 / 10% 待定），
 * 仅用于演示，接入真实数据后删除；草稿与待填写（作答进行中）保持未作答。
 */
function seedMockAnswers(seedId: string): Record<string, SurveyAnswer> {
  let hash = 0;
  for (const ch of seedId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const answers: Record<string, SurveyAnswer> = {};
  for (const [index, code] of questionCodes().entries()) {
    hash = (hash * 1103515245 + 12345 + index * 7919) >>> 0;
    const bucket = hash % 10;
    answers[code] = bucket >= 8 ? 'no' : bucket === 7 ? 'pending' : 'yes';
  }
  return answers;
}

for (const record of seedSurveys) {
  // 演示数据：更新人默认取创建/导入人（接入真实接口后由服务端下发）
  record.updatedBy = record.sourceOperator;
  if (record.status !== 'pending' && record.status !== 'draft' && record.status !== 'pending-fill') {
    record.answers = seedMockAnswers(record.id);
  }
}

/* -------------------------------------------- 种子任务快照补齐（2026-11-04 用户裁决） */

/**
 * 业务事实：任务在「待处理」执行时即绑定功能与判定规则（CreateSurveyPage 提交必选），
 * 因此除「待处理」外的种子任务都应有创建快照——中后段种子此前缺快照是数据缺口，
 * 不该在界面上让用户再选一遍规则。这里按「已绑定现行基线规则 v1（GB 44464 条款触发规则）」
 * 补齐：题目集 = v1 题库 Q1–Q12；条目映射缺省（消费端回落条目目录默认值）；
 * 分区映射缺省（回落现行 CLAUSE_SECTIONS 映射）；功能快照按 FuLi ID 从台账种子回填
 * （FL-2024 离台账功能不冻结，详情页保持台账→问卷记录回落链）。接入真实数据后删除。
 */
const SEED_RULE_VERSION = 'v1';
const SEED_TEMPLATE_NAME = 'GB 44464 基础问卷';
/** 与 templates.STANDARD_BASELINE 同源的字面量（该模块 import 本模块，避免环） */
const SEED_STANDARD_BASELINE = {
  standardDraftDate: '2026-07-03',
  standardPdfSha256: 'fdae27d0ee157802f8f5f6e39cebc8a277228867779b8f15dd069480b4941e03',
} as const;

function seedFrozenQuestions(): SurveyQuestionSnapshot[] {
  // v1 题集（Q1–Q12）：题干与指引合并为一段自由文本，与 CreateSurveyPage.persist 同构
  return questionCodes('v1').map((code) => {
    const bank = QUESTION_BANK.find((question) => question.code === code);
    return {
      code,
      title: bank?.title ?? '',
      guide: bank ? [bank.guide.basis, ...bank.guide.scenarios, bank.guide.notApplicable].filter(Boolean).join('\n') : '',
    };
  });
}

for (const record of seedSurveys) {
  if (record.status === 'pending' || record.creationSnapshot) continue;
  const master = MOCK_FUNCTION_RECORDS.find((item) => item.fuliId === record.fuliId);
  // 离台账功能（如 FL-2024-*）：按问卷记录的功能标识合成最小快照，详情页不再走台账回落
  const functionInput: FunctionInput = master
    ? {
      platformName: master.platformName, fuliId: master.fuliId, functionName: master.functionName,
      functionDescription: master.functionDescription ?? '',
      subfunctions: master.subfunctions.map((item) => ({ ...item })),
      owner: master.owner, department: master.department,
      responsibles: master.responsibles?.map((person) => ({ ...person })) ?? [],
      developmentLocation: master.developmentLocation, masterEcu: master.masterEcu,
    }
    : {
      platformName: '', fuliId: record.fuliId, functionName: record.functionName,
      functionDescription: '', subfunctions: [], owner: record.owner, department: '',
      responsibles: [], developmentLocation: '', masterEcu: '',
    };
  record.creationSnapshot = {
    function: functionInput,
    masterUpdatedAt: master?.updatedAt ?? record.updatedAt,
    templateId: 'TPL-2026-001',
    templateName: SEED_TEMPLATE_NAME,
    templateVersion: 'v1',
    templateUpdatedAt: '2026-07-03 00:00:00',
    templateNote: '',
    questions: seedFrozenQuestions(),
    questionCount: 12,
    ruleSetVersion: SEED_RULE_VERSION,
    mappingVersion: SEED_RULE_VERSION,
    ...SEED_STANDARD_BASELINE,
  };
}

/**
 * 演示用答案修正：S-2026-0304「远程空调控制」是不含生物识别、无口令输入、无车外影像、
 * 无账号体系、不涉及出境的简单功能，把 Q7/Q8/Q10/Q11/Q12 固定为「否」，
 * 使 6.4.3 / 6.5.1 / 6.5.2 / 6.6.1.3 / 6.6.2.* / 6.7.4 / 6.8 判为不适用，
 * 用于验证条目「未参与」分支与恒等式（三态 + 未参与 = 64）。接入真实数据后删除。
 */
const demoTailRecord = seedSurveys.find((item) => item.id === 'S-2026-0304');
if (demoTailRecord?.answers) {
  for (const code of ['Q7', 'Q8', 'Q10', 'Q11', 'Q12']) demoTailRecord.answers[code] = 'no';
}

/** 模块内可变 mock 数据源：复制/删除等列表操作直接写回这里 */
export const surveyRecords = reactive<SurveyRecord[]>(seedSurveys);

/** 本地浏览器库中的草稿 id 集合（localSurveyDraftIds 别名）：与 matching.ts 共用同一集合 */

export function mergeLocalSurveyDrafts(records: SurveyRecord[]) {
  for (const record of records) {
    if (!surveyRecords.some((item) => item.id === record.id)) surveyRecords.unshift(record);
    localDraftIds.add(record.id);
  }
}

export function addSurveyDraft(record: SurveyRecord) {
  surveyRecords.unshift(record);
  localDraftIds.add(record.id);
}

function nowText(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * 编辑保存（仅草稿可编辑，入口层限制状态）：按 id 原地更新内存记录；
 * 本地草稿同步回浏览器库（put 覆盖），种子数据只更新内存 mock。
 */
export async function updateSurveyDraft(next: SurveyRecord): Promise<void> {
  const existing = surveyRecords.find((item) => item.id === next.id);
  if (!existing) throw new Error('Survey not found');
  if (localDraftIds.has(next.id)) await updateLocalSurveyDraft(next);
  Object.assign(existing, next);
}

/**
 * 提交问卷（F-SURV 列表动作）：草稿 → 待填写（2026-10-26 用户裁决：提交 = 分派给填表人，
 * 由填表人完成 12 问作答后再进入待确认）。仅草稿可提交；
 * 本地草稿同步回浏览器库，失败时回滚内存状态并抛错给入口层提示。
 */
export async function submitSurvey(recordId: string): Promise<void> {
  const record = surveyRecords.find((item) => item.id === recordId);
  if (!record || record.status !== 'draft') throw new Error('Only drafts can be submitted');
  record.status = 'pending-fill';
  record.updatedAt = nowText();
  record.updatedBy = MOCK_CURRENT_USER.name;
  try {
    if (localDraftIds.has(recordId)) await updateLocalSurveyDraft(record);
  } catch (error) {
    record.status = 'draft';
    throw error;
  }
}

/**
 * 生成人类可读问卷编号（人类识别问卷的唯一稳定键，03 §8 `survey_no`）。
 * mock 口径沿用种子数据的 `S-YYYY-####` 形态并按当年流水号递增；
 * 服务端定稿形态为 `S-YYYYMMDD-####`，接入 API 后由后端下发，前端不再自造。
 */
export function nextSurveyNo(records: SurveyRecord[] = surveyRecords): string {
  const year = new Date().getFullYear();
  const pattern = new RegExp(`^S-${year}-(\\d{4})$`);
  const max = records.reduce((current, record) => {
    const matched = pattern.exec(record.id);
    return matched ? Math.max(current, Number(matched[1])) : current;
  }, 0);
  return `S-${year}-${String(max + 1).padStart(4, '0')}`;
}

/** 删除问卷（F-SURV-05）：仅草稿可删，入口层已限制状态，这里只做数据移除 */
export async function deleteSurvey(recordId: string) {
  await deleteLocalSurveyDraft(recordId);
  const index = surveyRecords.findIndex((record) => record.id === recordId);
  if (index !== -1) surveyRecords.splice(index, 1);
}

/* ------------------------------------------------------------ 任务编排（mock） */

/** 任务编排节点：提交 → 审核（可多层）→ 结束（结构对齐系统设置「任务编排」，待接入） */
export interface TaskOrchestrationNode {
  kind: 'submit' | 'review' | 'end';
  label: string;
  /** 节点说明：提交人 / 指定成员 / 流程已结束 */
  detail: string;
}

export interface TaskOrchestration {
  id: string;
  name: string;
  nodes: TaskOrchestrationNode[];
}

/** 系统设置「任务编排」演示数据（暂无系统设置模块，内置 mock 供新建任务选择） */
export const TASK_ORCHESTRATIONS: TaskOrchestration[] = [
  {
    id: 'ORC-001', name: '合规自评标准编排',
    nodes: [
      { kind: 'submit', label: '提交', detail: '提交人：全部成员' },
      { kind: 'review', label: '审核', detail: '指定成员：合规专员' },
      { kind: 'end', label: '结束', detail: '流程已结束' },
    ],
  },
  {
    id: 'ORC-002', name: '量产前快速评估编排',
    nodes: [
      { kind: 'submit', label: '提交', detail: '提交人：功能负责人' },
      { kind: 'review', label: '审核', detail: '指定成员：数据安全委员会' },
      { kind: 'review', label: '复核', detail: '指定成员：合规专员' },
      { kind: 'end', label: '结束', detail: '流程已结束' },
    ],
  },
];

/**
 * 新建任务（2026-10-30 用户裁决：本地补回「新建任务」入口）：
 * 任务状态初始为「待处理」，置顶写入列表；填表人 / 审批人 / 创建人均由任务带入，
 * 这里默认创建人兼任填表人，功能与规则在任务详情「基础信息」中绑定。
 */
export async function createTask(input: {
  taskName: string;
  taskDescription?: string;
  priority: TaskPriority;
  deadline?: string;
  orchestrationId: string;
  attachments?: { name: string; size: number }[];
}): Promise<SurveyRecord> {
  const timestamp = nowText().slice(0, 16);
  const record: SurveyRecord = {
    id: nextSurveyNo(),
    taskName: input.taskName,
    priority: input.priority,
    ...(input.taskDescription ? { taskDescription: input.taskDescription } : {}),
    ...(input.deadline ? { deadline: input.deadline } : {}),
    ...(input.attachments?.length ? { attachments: input.attachments.map((item) => ({ ...item })) } : {}),
    fuliId: '', functionName: '', status: 'pending',
    owner: MOCK_CURRENT_USER.name, respondent: MOCK_CURRENT_USER.name,
    source: 'manual', sourceOperator: MOCK_CURRENT_USER.name,
    orchestrationId: input.orchestrationId,
    createdAt: timestamp, updatedAt: nowText(), updatedBy: MOCK_CURRENT_USER.name,
    matchedCount: 0, totalCount: SURVEY_TOTAL_CLAUSES, offLedger: false,
  };
  surveyRecords.unshift(record);
  return record;
}

/** 作答可写的阶段：草稿与待填写（填表人作答）；待确认仅走「修改作答」（入口层二次确认后放行） */
export function isAnswerEditable(status: SurveyStatus): boolean {
  return status === 'draft' || status === 'pending-fill' || status === 'pending-confirm';
}

/**
 * 逐题即存（F-QUES-01 三态保存）：更新单题答案并刷新更新时间。
 * 本地草稿同步回浏览器库，失败时回滚内存状态并抛错给入口层提示。
 */
export async function setSurveyAnswer(recordId: string, code: string, value: SurveyAnswer): Promise<void> {
  const record = surveyRecords.find((item) => item.id === recordId);
  if (!record) throw new Error('Survey not found');
  if (!isAnswerEditable(record.status)) throw new Error('Answers are read-only at this stage');
  const previousAnswers = record.answers;
  const previousUpdatedAt = record.updatedAt;
  record.answers = { ...(record.answers ?? {}), [code]: value };
  record.updatedAt = nowText();
  record.updatedBy = MOCK_CURRENT_USER.name;
  try {
    if (localDraftIds.has(recordId)) await updateLocalSurveyDraft(record);
  } catch (error) {
    record.answers = previousAnswers;
    record.updatedAt = previousUpdatedAt;
    throw error;
  }
}

/**
 * 显式存草稿（答题界面「存草稿」）：作答内容已即存，这里固化更新时间并
 * 保证本地草稿落库；种子数据仅刷新内存记录。
 */
export async function saveSurveyAnswersDraft(recordId: string): Promise<void> {
  const record = surveyRecords.find((item) => item.id === recordId);
  if (!record) throw new Error('Survey not found');
  if (!isAnswerEditable(record.status)) throw new Error('Answers are read-only at this stage');
  const previousUpdatedAt = record.updatedAt;
  record.updatedAt = nowText();
  record.updatedBy = MOCK_CURRENT_USER.name;
  try {
    if (localDraftIds.has(recordId)) await updateLocalSurveyDraft(record);
  } catch (error) {
    record.updatedAt = previousUpdatedAt;
    throw error;
  }
}

/**
 * 完成作答（F-QUES-02/05，N2 门禁）：当前模板题集全部有值才可通过；
 * 草稿 / 待填写 → 待确认（触发自动初筛），待确认下的修改作答保持原状态重算。
 * 缺题返回缺失题号列表，由入口层定位到第一道未答题；本地草稿落库失败回滚状态。
 */
export async function completeSurveyAnswers(recordId: string, codes: readonly string[]): Promise<{ missing: string[] }> {
  const record = surveyRecords.find((item) => item.id === recordId);
  if (!record) throw new Error('Survey not found');
  if (!isAnswerEditable(record.status)) throw new Error('Answers are read-only at this stage');
  const missing = codes.filter((code) => !record.answers?.[code]);
  if (missing.length) return { missing };
  const previousStatus = record.status;
  const previousUpdatedAt = record.updatedAt;
  if (record.status === 'draft' || record.status === 'pending-fill') record.status = 'pending-confirm';
  record.updatedAt = nowText();
  record.updatedBy = MOCK_CURRENT_USER.name;
  try {
    if (localDraftIds.has(recordId)) await updateLocalSurveyDraft(record);
  } catch (error) {
    record.status = previousStatus;
    record.updatedAt = previousUpdatedAt;
    throw error;
  }
  return { missing: [] };
}
