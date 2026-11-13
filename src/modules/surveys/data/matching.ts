/**
 * 条款匹配数据层（步骤3）：38 条款目录 + 自动初筛引擎 + 人工确认操作。
 *
 * 行为真值源 = 项目建设/业务流程与状态机.md：
 * - §10.2 项目初筛表达式表（38 条款的触发表达式、条目数、第 9 章测试方法）；
 * - §7.2 差异判定决策表 D1–D7（最终适用性 = 人工确认 ?? 自动值；待定/未命中
 *   ≠ 不适用，显示「待核验」中性态，BR-020）；
 * - §7.3 重算只写自动列（BR-009），适用性翻转联动参与条目（BR-031）；
 * - §10.4 BR-021 提交门禁（38 条款全部确认 + 判否原因非空）。
 *
 * 条款原文为 mock 摘要（指定 PDF 为唯一真值源），待条款库接口下发后替换。
 * 求值在本模块完成（mock「服务端」权威，BR-068 前端镜像仅预览的口径在接入
 * 真实后端后由接口替换，页面不改动）。
 */
import type { ClauseConfirm, SurveyMatching, SurveyRecord, SurveyStatus } from './surveys';
import { SURVEY_TOTAL_CLAUSES, approvedClauseReview, surveyRecords } from './surveys';
import { localSurveyDraftIds, updateLocalSurveyDraft } from './drafts';
import {
  DEFAULT_QUESTION_VERSION, isKnownCode, questionCodes, questionsForVersion,
} from './questions';
import { ITEM_CATALOG } from './items';
import { extensionFor } from '../../compliance/data/mapping';
import {
  clausesForVersion, effectiveItemIdsFor, itemIdOfRef, legacyRuleVersionId, sectionDriversFor,
} from '../../compliance/data/ruleVersions';
import { standardNode, standardSection } from '../../compliance/data/standardLibrary';

export type ClauseAutoResult = 'applicable' | 'not-hit' | 'undetermined';

/** 最终适用性（D1–D7 投影）：applicable 适用 / not-applicable 不适用 / pending-review 待核验 */
export type FinalApplicability = 'applicable' | 'not-applicable' | 'pending-review';

export type ClauseGroupKey = '6.1' | '6.2' | '6.3' | '6.4' | '6.5' | '6.6' | '6.7' | '6.8';

export interface ClauseDef {
  no: string;
  group: ClauseGroupKey;
  /** 第 6 章条款原文（mock 摘要，PDF 为唯一真值源） */
  original: string;
  /** 第 9 章测试方法章节号 */
  testChapter: string;
  /** 测试方法摘要 */
  testMethod: string;
  /** 项目初筛表达式（§10.2），操作数为题库题号（2026-11-01 起 code 即唯一标识） */
  expr: string;
  /** 中文可读式 */
  exprReadable: string;
  /** 命中题目（题库题号，供界面展示与回跳；判定运算唯一依据） */
  hits: string[];
  /** 由「追加判定维度」并入的题目（题库题号） */
  extendedBy: string[];
  /** 安全需求条目数 */
  itemCount: number;
}


/** 8 个分组 = 第 6 章二级节 6.1–6.8（编号与标题同源标准条款库 STANDARD_SECTIONS） */
export const CLAUSE_GROUPS: readonly ClauseGroupKey[] = ['6.1', '6.2', '6.3', '6.4', '6.5', '6.6', '6.7', '6.8'];

/** 分组标题 = GB 44464 第 6 章二级节标题原文（2026-10-27 起「告知与提示」等自拟名下线） */
export function clauseGroupTitle(key: ClauseGroupKey): string {
  return standardSection(key)?.title ?? key;
}

/** 表达式里出现的题号（按出现顺序去重） */
function codesIn(expr: string): string[] {
  return [...new Set(expr.match(/Q\d+/g) ?? [])];
}

/**
 * 38 条款目录（§10.2 表逐行）。条目数合计 64（9+13+1+1+1+7 + 8 + 7 + 3 + 2 + 7 + 4 + 1）。
 * `expr` 以题库题号书写（code 即唯一标识，2026-11-01 起 Q01 稳定标识口径下线）。
 */
const CLAUSE_ROWS: readonly Omit<ClauseDef, 'extendedBy'>[] = [

  { no: '6.1.1', group: '6.1', original: '处理者应在合理区域内以显著方式告知个人信息处理规则，并按附录 B 声明基本功能涉及的个人信息类型。', testChapter: '9.3.1', testMethod: '按附录 B 确认基本功能数据类型声明', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 9 },
  { no: '6.1.2', group: '6.1', original: '收集个人信息前应以显著方式向用户告知处理者名称、处理目的、方式、种类与保存期限等事项。', testChapter: '9.3.2', testMethod: '确认告知方式已完整实施', expr: 'OR(Q1,Q5)', exprReadable: 'Q1 或 Q5', hits: ['Q1', 'Q5'], itemCount: 13 },
  { no: '6.1.3', group: '6.1', original: '处理目的、方式、种类发生变更时，应重新以显著方式告知用户。', testChapter: '9.3.3', testMethod: '更新后重新显著告知', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 1 },
  { no: '6.1.4', group: '6.1', original: '应通过用户界面等适当平台展示个人信息处理规则，保证用户可查阅。', testChapter: '9.3.4', testMethod: '检查平台展示', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 1 },
  { no: '6.1.5', group: '6.1', original: '处理敏感类别个人信息或特定人群信息的，应制定并展示专门处理规则。', testChapter: '9.3.5', testMethod: '检查专门规则', expr: 'Q3', exprReadable: 'Q3', hits: ['Q3'], itemCount: 1 },
  { no: '6.1.6', group: '6.1', original: '应记录并展示收集敏感个人信息及座舱外数据的情况，供用户随时查看。', testChapter: '9.3.6', testMethod: '检查记录和展示', expr: 'Q4', exprReadable: 'Q4', hits: ['Q4'], itemCount: 7 },
  { no: '6.2.1.1', group: '6.2', original: '处理个人信息应取得用户同意；处理敏感个人信息等法定情形应取得单独同意。', testChapter: '9.4.1', testMethod: '检查同意与单独同意机制', expr: 'OR(Q1,Q5)', exprReadable: 'Q1 或 Q5', hits: ['Q1', 'Q5'], itemCount: 1 },
  { no: '6.2.1.2', group: '6.2', original: '委托供应商处理个人信息的，应逐接收方核实委托关系并取得功能级单独同意。', testChapter: '9.4.1', testMethod: '逐接收方核实委托关系及功能级单独同意', expr: 'Q6', exprReadable: 'Q6', hits: ['Q6'], itemCount: 1 },
  { no: '6.2.2', group: '6.2', original: '符合法定例外情形的，应逐项说明例外功能、理由与路径并留存记录。', testChapter: '9.4.2', testMethod: '附录 E 的例外功能、理由、路径须逐项核实', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 1 },
  { no: '6.2.3', group: '6.2', original: '应提供拒绝、撤回同意的途径，并明确同意的有效期限。', testChapter: '9.4.3', testMethod: '检查拒绝/同意/期限', expr: 'OR(Q1,Q5)', exprReadable: 'Q1 或 Q5', hits: ['Q1', 'Q5'], itemCount: 1 },
  { no: '6.2.4.1', group: '6.2', original: '用户拒绝或撤回同意后，应在约定期限内停止相应处理活动。', testChapter: '9.4.4', testMethod: '触发期限检查', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 1 },
  { no: '6.2.4.2', group: '6.2', original: '处理规则变更后应重新取得用户同意，未同意前不得按新规则处理。', testChapter: '9.4.5', testMethod: '变更检查', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 1 },
  { no: '6.2.5.1', group: '6.2', original: '应提供便捷的撤回同意途径，撤回不影响此前已完成的处理效力。', testChapter: '9.4.6', testMethod: '检查撤回途径', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 1 },
  { no: '6.2.5.2', group: '6.2', original: '用户撤回同意后，应仅保留履行法定义务所需的最小数据。', testChapter: '9.4.7', testMethod: '检查撤回后效力', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 1 },
  { no: '6.3.1', group: '6.3', original: '个人信息的收集应遵循默认不收集原则，非必要不扩大收集范围。', testChapter: '9.5.1', testMethod: '检查默认不收集', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 1 },
  { no: '6.3.2', group: '6.3', original: '收集位置、座舱等敏感个人信息的，应满足单独告知与法定例外条件。', testChapter: '9.5.2', testMethod: '位置/座舱敏感个人信息及例外条件', expr: 'Q4', exprReadable: 'Q4', hits: ['Q4'], itemCount: 1 },
  { no: '6.3.3', group: '6.3', original: '传感器数据的收集应与功能目的直接相关，并公示传感器参数。', testChapter: '9.5.3', testMethod: '检查传感器参数', expr: 'Q4', exprReadable: 'Q4', hits: ['Q4'], itemCount: 1 },
  { no: '6.3.4', group: '6.3', original: '位置等数据收集应采用满足功能所需的最小精度。', testChapter: '9.5.3', testMethod: '检查最小精度', expr: 'Q4', exprReadable: 'Q4', hits: ['Q4'], itemCount: 1 },
  { no: '6.3.5', group: '6.3', original: '未激活的功能权限不得后台开启数据收集。', testChapter: '9.5.4', testMethod: '检查未激活权限', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 1 },
  { no: '6.3.6', group: '6.3', original: '用户拒绝基本功能以外的数据收集时，不应影响基本功能使用。', testChapter: '9.5.5', testMethod: '检查基本功能被拒', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 1 },
  { no: '6.3.7', group: '6.3', original: '数据收集时机应与功能触发时点一致，不得提前或延后收集。', testChapter: '9.5.6', testMethod: '检查收集时机', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 1 },
  { no: '6.4.1', group: '6.4', original: '个人信息存储期限应为实现处理目的所必要的最短时间，期限届满应删除。', testChapter: '9.6.1', testMethod: '检查存储期限', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 1 },
  { no: '6.4.2', group: '6.4', original: '存储的个人信息与重要数据应采取加密等安全措施。', testChapter: '9.6.2', testMethod: '检查加密措施', expr: 'OR(Q5,Q4)', exprReadable: 'Q5 或 Q4', hits: ['Q5', 'Q4'], itemCount: 1 },
  { no: '6.4.3', group: '6.4', original: '应在告知的位置存储个人信息，存储位置变更应重新告知。', testChapter: '9.6.3', testMethod: '检查存储位置', expr: 'Q7', exprReadable: 'Q7', hits: ['Q7'], itemCount: 1 },
  { no: '6.5.1', group: '6.5', original: '车辆基于个人同意处理生物特征识别信息的，使用生物特征识别信息进行身份识别时，应同时提供不基于生物特征识别信息的其他身份识别方式。', testChapter: '9.7.1', testMethod: '检查生物识别替代鉴别方式是否提供', expr: 'Q7', exprReadable: 'Q7', hits: ['Q7'], itemCount: 1 },
  { no: '6.5.2', group: '6.5', original: '车辆在显示口令以及用户输入或设置网络支付平台登录口令、支付口令（包括网络支付交易口令、快捷支付口令、银行卡支付口令等）时应提供隐藏全部或部分信息的方式。', testChapter: '9.7.2', testMethod: '检查口令显示与输入隐藏方式', expr: 'Q8', exprReadable: 'Q8', hits: ['Q8'], itemCount: 1 },
  { no: '6.6.1.1', group: '6.6', original: '座舱数据向车外传输时应逐通道核查并保障传输安全。', testChapter: '9.8.1', testMethod: '检查座舱数据出车', expr: 'AND(Q4,Q9)', exprReadable: 'Q4 且 Q9', hits: ['Q4', 'Q9'], itemCount: 1 },
  { no: '6.6.1.2', group: '6.6', original: '含敏感个人信息的数据出车时应采取加密等保密措施。', testChapter: '9.8.2', testMethod: '抓包检查保密', expr: 'AND(Q9,OR(Q5,Q4))', exprReadable: 'Q9 且（Q5 或 Q4）', hits: ['Q9', 'Q5', 'Q4'], itemCount: 1 },
  { no: '6.6.1.3', group: '6.6', original: '车外传输的视频数据应先在车端完成匿名化处理。', testChapter: '9.8.3', testMethod: '检查车端匿名化', expr: 'AND(Q5,Q9)', exprReadable: 'Q5 且 Q9', hits: ['Q5', 'Q9'], itemCount: 1 },
  { no: '6.6.2.1.1', group: '6.6', original: '含人脸的视频数据向车外传输前应匿名化，确保无法识别特定自然人。', testChapter: '9.8.4', testMethod: '验证人脸目标', expr: 'AND(Q5,Q9)', exprReadable: 'Q5 且 Q9', hits: ['Q5', 'Q9'], itemCount: 1 },
  { no: '6.6.2.1.2', group: '6.6', original: '含车牌的视频数据向车外传输前应匿名化，确保无法识别特定车辆。', testChapter: '9.8.4', testMethod: '验证号牌目标', expr: 'AND(Q5,Q9)', exprReadable: 'Q5 且 Q9', hits: ['Q5', 'Q9'], itemCount: 1 },
  { no: '6.6.2.2.1', group: '6.6', original: '人脸、号牌匿名化应达到规定场景下 ≥90% 的不可识别率。', testChapter: '9.8.4', testMethod: '人脸/号牌分别 ≥90%，按样本量和计数测试', expr: 'AND(Q5,Q9)', exprReadable: 'Q5 且 Q9', hits: ['Q5', 'Q9'], itemCount: 1 },
  { no: '6.6.2.2.2', group: '6.6', original: '不可识别性应通过机器测试与人工核验双重确认。', testChapter: '9.8.4', testMethod: '不可识别性需机器与人工测试', expr: 'AND(Q5,Q9)', exprReadable: 'Q5 且 Q9', hits: ['Q5', 'Q9'], itemCount: 1 },
  { no: '6.7.1', group: '6.7', original: '应向用户提供删除个人信息的途径。', testChapter: '9.9.1', testMethod: '检查删除途径', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 1 },
  { no: '6.7.2', group: '6.7', original: '存储期限届满或用户注销等触发条件成立时，应删除相应个人信息。', testChapter: '9.9.2', testMethod: '触发删除检查', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 1 },
  { no: '6.7.3', group: '6.7', original: '删除应使个人信息保持不可检索、不可访问的状态。', testChapter: '9.9.3', testMethod: '检查删除效果', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 1 },
  { no: '6.7.4', group: '6.7', original: '应提供账号删除功能，删除后按要求处理账号关联的个人信息。', testChapter: '9.9.4', testMethod: '检查账号删除', expr: 'Q1', exprReadable: 'Q1', hits: ['Q1'], itemCount: 1 },
  { no: '6.8', group: '6.8', original: '个人信息向境外传输应满足数据出境安全评估等法定要求；车辆直接向境外传输任何数据属禁止性风险。', testChapter: '9.10', testMethod: '所有通道多状态抓包 ≥3600s', expr: 'Q12', exprReadable: 'Q12', hits: ['Q12'], itemCount: 1 },
];

/**
 * 目录构建：并入「追加判定维度」；派生 hits（题库题号）。
 * 表达式保持 §10.2 的可读结构（OR/AND 嵌套），操作数即题号。
 */
export const CLAUSES: readonly ClauseDef[] = CLAUSE_ROWS.map((row) => {
  const extended = extensionFor(row.no);
  const expr = extended ? `OR(${row.expr},${extended})` : row.expr;
  const hits = codesIn(expr);
  // 以 PDF 原文为准（2026-10-26 用户裁决）：标准层有条文时用它替换历史转录摘要，
  // 冲突一律以草案原文为准；标准层缺该条款时保留原摘要并标注（见 standardSource）。
  const standard = standardNode(row.no);
  return {
    ...row,
    original: standard?.text ?? row.original,
    expr,
    hits,
    extendedBy: extended ? [extended] : [],
  };
});

/** 条款原文来源：standard = 草案原文（含页码），transcript = 历史转录摘要 */
export interface ClauseSource {
  kind: 'standard' | 'transcript';
  page?: number;
}

export function clauseSource(no: string): ClauseSource {
  const node = standardNode(no);
  if (!node) return { kind: 'transcript' };
  return { kind: 'standard', page: node.page };
}

/** 条款总数与条目总数（全平台统一常量，禁止各处自行推导） */
export const CLAUSE_COUNT = CLAUSES.length;
export const CLAUSE_ITEM_TOTAL = CLAUSES.reduce((total, clause) => total + clause.itemCount, 0);

export function clauseByNo(no: string): ClauseDef {
  const clause = CLAUSES.find((item) => item.no === no);
  if (!clause) throw new Error(`Unknown clause ${no}`);
  return clause;
}

/**
 * 反向关联：第 9 章测试方法节点 → 使用它的第 6 章条款。
 * testChapter 粒度粗于条款库节点（如 9.8.4 下还有 9.8.4.3.3.2 等子级），
 * 按「等于 testChapter 或为其子级」前缀匹配；第 4/5/7/8/10/11 章与附录无 testChapter，恒返回空。
 */
export function clausesByTestChapter(no: string): ClauseDef[] {
  return CLAUSES.filter((clause) => clause.testChapter === no || no.startsWith(`${clause.testChapter}.`));
}

/**
 * 条款主题（条款卡标题，如「6.1.1 最小必要原则」）。
 * 主题是条款的业务定语，随条款目录存储（同原文口径，不做翻译）。
 */
const CLAUSE_TOPICS: Record<string, string> = {
  '6.1.1': '最小必要原则', '6.1.2': '告知义务', '6.1.3': '告知更新', '6.1.4': '规则展示',
  '6.1.5': '专门规则', '6.1.6': '收集记录',
  '6.2.1.1': '一般同意', '6.2.1.2': '委托处理', '6.2.2': '例外情形', '6.2.3': '同意选项',
  '6.2.4.1': '撤回停止', '6.2.4.2': '变更重获', '6.2.5.1': '撤回途径', '6.2.5.2': '撤回效力',
  '6.3.1': '默认不收集', '6.3.2': '敏感提示', '6.3.3': '传感器公示', '6.3.4': '最小精度',
  '6.3.5': '未激活权限', '6.3.6': '拒绝基本功能', '6.3.7': '收集时机',
  '6.4.1': '存储期限', '6.4.2': '安全存储', '6.4.3': '存储位置',
  '6.5.1': '生物识别替代', '6.5.2': '口令隐藏',
  '6.6.1.1': '座舱数据出车', '6.6.1.2': '传输保密', '6.6.1.3': '车外匿名化',
  '6.6.2.1.1': '人脸匿名化', '6.6.2.1.2': '号牌匿名化', '6.6.2.2.1': '不可识别率', '6.6.2.2.2': '双重核验',
  '6.7.1': '删除途径', '6.7.2': '触发删除', '6.7.3': '删除效果', '6.7.4': '账号删除',
  '6.8': '数据出境',
};

export function clauseTopic(no: string): string {
  return CLAUSE_TOPICS[no] ?? '';
}

/**
 * 三值逻辑（2026-11-01 用户裁决）：题目的答案映射为 是=true / 否=false / 未答或不确定=unknown。
 * 表达式文法扩充为 expr := Qn | NOT(expr) | AND(expr,…) | OR(expr,…)：
 * - 字面量 Q1 表示「该题答是」成立；
 * - NOT(Q1) 表示「该题答否」成立（unknown 的否定仍是 unknown，不会被当成「否」）；
 * - AND 有 false 即 false（无 false 但有 unknown 则 unknown），OR 有 true 即 true（无 true 但有 unknown 则 unknown）。
 * 这修掉了旧实现「任一题不确定即整条待核验」的分支短路问题：OR 分支已成立时不再被另一题的未答拖成待核验。
 */
export type Truth = 'true' | 'false' | 'unknown';

export function truthOfAnswer(answer: string | undefined): Truth {
  if (answer === 'yes') return 'true';
  if (answer === 'no') return 'false';
  return 'unknown';
}

function notTruth(value: Truth): Truth {
  if (value === 'true') return 'false';
  if (value === 'false') return 'true';
  return 'unknown';
}

function andTruth(values: readonly Truth[]): Truth {
  if (values.some((value) => value === 'false')) return 'false';
  return values.some((value) => value === 'unknown') ? 'unknown' : 'true';
}

function orTruth(values: readonly Truth[]): Truth {
  if (values.some((value) => value === 'true')) return 'true';
  return values.some((value) => value === 'unknown') ? 'unknown' : 'false';
}

/**
 * 递归下降三值求值器：expr := Qn | NOT(expr) | OR(expr,…) | AND(expr,…)。
 * 相比按顶层连接符拆分更简洁且天然支持任意层级嵌套；解析失败按 unknown 处理（不误判不适用）。
 */
export function evaluateTruth(expr: string, lookup: (code: string) => Truth): Truth {
  const input = expr.trim();
  if (!input) return 'unknown';
  const notMatch = /^NOT\(/.exec(input);
  if (notMatch) {
    if (!input.endsWith(')')) return 'unknown';
    return notTruth(evaluateTruth(input.slice(notMatch[0].length, -1), lookup));
  }
  const opMatch = /^(OR|AND)\(/.exec(input);
  if (opMatch) {
    const op = opMatch[1];
    const args: string[] = [];
    let depth = 0;
    let current = '';
    // opMatch[0] = "OR(" 或 "AND("，从其后的第一个字符开始扫描参数
    for (let index = opMatch[0].length; index < input.length; index += 1) {
      const ch = input[index];
      if (ch === '(') depth += 1;
      if (ch === ')') {
        if (depth === 0) {
          args.push(current);
          current = '';
          break;
        }
        depth -= 1;
      }
      if (ch === ',' && depth === 0) {
        args.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    if (current) return 'unknown';
    if (!args.length) return 'unknown';
    const values = args.map((arg) => evaluateTruth(arg, lookup));
    return op === 'OR' ? orTruth(values) : andTruth(values);
  }
  if (!/^Q\d+$/.test(input)) return 'unknown';
  return lookup(input);
}

/**
 * 条款初筛（§10.2）：表达式命中 → 'applicable'；
 * 命中题含待定/未答 → 'undetermined'（BR-020：不得据此判不适用）。
 * 「未答」包含模板未覆盖该题的情况——覆盖度缺口统一落为待核验，交由人工判定，
 * 不默认判不适用（方案 §2.5）。
 *
 * 模板层扩展（2026-10-28 用户裁决）：自建题可在新建问题库时声明「命中条款」，
 * 问卷匹配时以「或」语义并入这些条款——答「是」即判适用（相当于按库声明的追加判定维度）。
 */
export function evaluateClause(clause: ClauseDef, index: AnswerIndex, extensionCodes: readonly string[] = []): ClauseAutoResult {
  // 自建题按「或」并入（答「是」即命中），与规则表达式一起走同一套三值合成
  const extensionTruth = orTruth(extensionCodes.map((code) => truthOfAnswer(index[extensionKey(code)])));
  const truth = orTruth([evaluateTruth(clause.expr, (code) => truthOfAnswer(index[code])), extensionTruth]);
  if (truth === 'true') return 'applicable';
  if (truth === 'unknown') return 'undetermined';
  return 'not-hit';
}

/** 答案索引：题号 → 答案（题号即唯一标识，2026-11-01 起） */
export type AnswerIndex = Record<string, string | undefined>;

/** 自建题答案在索引里的键前缀：避免与题库题号（Q1…Q18）撞键 */
export function extensionKey(code: string): string {
  return `C${code}`;
}

/**
 * 模板层条款扩展（2026-10-28）：clauseNo → 声明命中该条款的自建题答案键。
 * 自建题（声明了 clauseNos 的题）不冒充题库题号，答案只进扩展键。
 */
export function clauseExtensionsOf(record: SurveyRecord): Record<string, string[]> {
  const frozen = record.creationSnapshot?.questions as readonly { code: string; clauseNos?: string[] }[] | undefined;
  const map: Record<string, string[]> = {};
  for (const question of frozen ?? []) {
    if (!question.clauseNos?.length) continue;
    for (const no of question.clauseNos) (map[no] ??= []).push(question.code);
  }
  return map;
}

/**
 * 由问卷记录构建答案索引（2026-11-01 起 key = 题号 code）：
 * - 题库题（code 在题库内且未声明 clauseNos）→ `index[code]`；
 * - 自建题（声明 clauseNos 或 code 不在题库内）→ 只进扩展键（extensionKey），
 *   供「命中条款」求值使用，不冒充题库题号。
 */
export function answerIndexOf(record: SurveyRecord): AnswerIndex {
  const frozen = record.creationSnapshot?.questions as
    readonly { code: string; clauseNos?: string[] }[] | undefined;
  const fallback = questionsForVersion(record.creationSnapshot?.templateVersion ?? DEFAULT_QUESTION_VERSION);
  const list: readonly { code: string; clauseNos?: string[] }[] = frozen?.length ? frozen : fallback;
  const index: AnswerIndex = {};
  for (const question of list) {
    const answer = record.answers?.[question.code];
    if (question.clauseNos?.length || !isKnownCode(question.code)) {
      // 自建题：答案只进入扩展键，供「命中条款」求值使用，不冒充题库题号
      index[extensionKey(question.code)] = answer;
      continue;
    }
    index[question.code] = answer;
  }
  return index;
}

/** 答案指纹：题号取创建时冻结的模板题目，无冻结题目时按题集版本回落 */
function answersFingerprint(record: SurveyRecord): string {
  const frozen = record.creationSnapshot?.questions?.map((question) => question.code);
  const codes = frozen?.length ? frozen : questionCodes(record.creationSnapshot?.templateVersion ?? DEFAULT_QUESTION_VERSION);
  return JSON.stringify(codes.map((code) => [code, record.answers?.[code] ?? null]));
}

function nowText(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * 按问卷快照解析条款表（2026-10-28 恢复版本化）：条款清单恒 38 条，
 * 触发表达式取该问卷创建时选用的判定规则版本。2026-10-29 起版本支持原地编辑：
 * 已发布版本更新后由 `recalculateSurveysForRuleVersion` 联动重算未锁定问卷，
 * 匹配审批已通过（已锁定）的问卷保持既有结果不变。
 * 顶层不调用（ruleVersions.ts 懒初始化读 CLAUSES，ESM 循环安全）。
 */
export function clausesForRecord(record: SurveyRecord): readonly ClauseDef[] {
  const clauses = clausesForVersion(record.creationSnapshot?.ruleSetVersion);
  // 2026-11-02 用户裁决：触发规则按问卷实际题集投影——12 问问卷不得出现 Q13+ 题号，
  // 追加判定维度（Q13–Q18）只对题集包含该题的问卷生效
  const available = availableCodesOf(record);
  if (!available.size) return clauses;
  return clauses.map((clause) => projectClause(clause, available));
}

/* ------------------------------------------ 按问卷题集投影（12/14/18 问模板） */

/** 问卷可用题号集合：创建快照冻结题目优先，无快照时按题集版本回落（与 answerIndexOf 同口径） */
function availableCodesOf(record: SurveyRecord): ReadonlySet<string> {
  const frozen = record.creationSnapshot?.questions;
  if (frozen?.length) return new Set(frozen.map((question) => question.code));
  return new Set(questionCodes(record.creationSnapshot?.templateVersion ?? DEFAULT_QUESTION_VERSION));
}

/** 顶层逗号拆参（与 evaluateTruth 同一套括号深度规则） */
function splitTopLevelArgs(input: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      args.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) args.push(current);
  return args.map((arg) => arg.trim()).filter(Boolean);
}

/**
 * 表达式按可用题集投影（返回 null = 整支在该问卷下不可求值，调用方按剔除处理）：
 * - OR 分支剔除问卷未包含的题号（追加判定维度语义「扩表达式不扩条款」：题不在题集 = 维度不存在；
 *   OR 少一个操作数语义不变，同时消除「该题永不可答 → OR 恒 unknown → 条款永远待核验」的死锁）；
 * - AND / NOT 含未包含题号 → 整支剔除（贡献 unknown 交人工判定，不得据未问题目判真/假）；
 * - 叶子题号不在题集 → 剔除；不可解析片段原样保留（求值器按 unknown 处理）。
 */
function projectExpr(expr: string, available: ReadonlySet<string>): string | null {
  const input = expr.trim();
  if (!input) return null;
  const notMatch = /^NOT\((.*)\)$/.exec(input);
  if (notMatch) {
    const inner = projectExpr(notMatch[1], available);
    return inner ? `NOT(${inner})` : null;
  }
  const opMatch = /^(OR|AND)\((.*)\)$/.exec(input);
  if (opMatch) {
    const args = splitTopLevelArgs(opMatch[2]);
    const kept = args.map((arg) => projectExpr(arg, available)).filter((value): value is string => value !== null);
    if (!kept.length) return null;
    if (opMatch[1] === 'AND' && kept.length < args.length) return null;
    if (kept.length === 1) return kept[0];
    return `${opMatch[1]}(${kept.join(',')})`;
  }
  if (/^Q\d+$/.test(input)) return available.has(input) ? input : null;
  return input;
}

/** 由表达式重建中文可读式（投影后规则原文可读式不再适用时使用；嵌套层加全角括号） */
function readableExpr(expr: string, nested = false): string {
  const input = expr.trim();
  const notMatch = /^NOT\((.*)\)$/.exec(input);
  if (notMatch) return `非(${readableExpr(notMatch[1], true)})`;
  const opMatch = /^(OR|AND)\((.*)\)$/.exec(input);
  if (opMatch) {
    const args = splitTopLevelArgs(opMatch[2]);
    const text = args.map((arg) => readableExpr(arg, true)).join(opMatch[1] === 'OR' ? ' 或 ' : ' 且 ');
    return nested && args.length > 1 ? `（${text}）` : text;
  }
  return input;
}

/** 单条款投影：表达式含问卷外题号时重建 expr / exprReadable / hits / extendedBy */
function projectClause(clause: ClauseDef, available: ReadonlySet<string>): ClauseDef {
  const projected = projectExpr(clause.expr, available);
  if (!projected || projected === clause.expr) return clause;
  const hits = codesIn(projected);
  return {
    ...clause,
    expr: projected,
    exprReadable: readableExpr(projected),
    hits,
    extendedBy: clause.extendedBy.filter((code) => hits.includes(code)),
  };
}

/** N2 完成作答时的初筛计算（mock 服务端权威）：生成匹配快照并联动参与条目数 */
export function buildSurveyMatching(record: SurveyRecord): SurveyMatching {
  const clauses = clausesForRecord(record);
  const index = answerIndexOf(record);
  const extensions = clauseExtensionsOf(record);
  const snapshot: SurveyMatching = {
    ruleSetVersion: record.creationSnapshot?.ruleSetVersion ?? DEFAULT_QUESTION_VERSION,
    evaluatedAt: nowText(),
    answersFingerprint: answersFingerprint(record),
    autoResults: Object.fromEntries(clauses.map((clause) => [clause.no, evaluateClause(clause, index, extensions[clause.no])])),
    manual: {},
  };
  record.matching = snapshot;
  recomputeMatchedCount(record);
  return snapshot;
}

/** 懒初始化：历史数据进入步骤3时补算初筛（已存在则原样返回） */
export function ensureSurveyMatching(record: SurveyRecord): SurveyMatching {
  // 退回样例的上一轮审核结论按条款目录生成；批准项继续锁定，驳回项留空供再次确认。
  if (record.id === 'S-2026-0320' && !record.matching) {
    const matching = buildSurveyMatching(record);
    const rejectedNos = new Set(record.returnInfo?.clauseNos ?? []);
    const at = record.returnInfo?.time ?? record.updatedAt;
    const by = record.returnInfo?.operator ?? '赵敏';
    const reviews = Object.fromEntries(CLAUSES.map((clause) => [clause.no, {
      result: rejectedNos.has(clause.no) ? 'rejected' as const : 'approved' as const,
      by, note: rejectedNos.has(clause.no) ? record.returnInfo?.reason ?? '' : '', at,
    }]));
    matching.manual = Object.fromEntries(CLAUSES.filter((clause) => !rejectedNos.has(clause.no))
      .map((clause) => [clause.no, matching.autoResults[clause.no] === 'not-hit'
        ? { value: 'not-applicable' as const, reason: '自动初筛不命中，经审核确认。' }
        : { value: 'applicable' as const, reason: '' }]));
    matching.reviews = Object.fromEntries(Object.entries(reviews).filter(([, review]) => review.result === 'approved'));
    matching.reviewRounds = [{
      returnedAt: at, returnedBy: by, reason: record.returnInfo?.reason ?? '',
      rejectedClauses: [...rejectedNos], reviews,
    }];
    recomputeMatchedCount(record);
    return matching;
  }
  return record.matching ?? buildSurveyMatching(record);
}

/**
 * 重算联动（05 §3.3.3 / BR-009）：作答指纹变化时仅重写 autoResults，
 * 绝不触碰 manual；返回自动结果发生变化的条款数供横幅提示。
 */
export function recalculateSurveyMatching(record: SurveyRecord): { changed: number } {
  const matching = ensureSurveyMatching(record);
  const fingerprint = answersFingerprint(record);
  if (fingerprint === matching.answersFingerprint) return { changed: 0 };
  let changed = 0;
  const clauses = clausesForRecord(record);
  const index = answerIndexOf(record);
  const extensions = clauseExtensionsOf(record);
  for (const clause of clauses) {
    const next = evaluateClause(clause, index, extensions[clause.no]);
    if (matching.autoResults[clause.no] !== next) changed += 1;
    matching.autoResults[clause.no] = next;
  }
  matching.answersFingerprint = fingerprint;
  matching.evaluatedAt = nowText();
  // BR-031 适用性翻转联动参与条目：自动列变化可能改变最终适用性（人工值未动的条款）
  recomputeMatchedCount(record);
  return { changed };
}

/* ------------------------------------------------------------------ 规则版本联动 */

/**
 * 「已锁定问卷」口径（2026-10-29 用户裁决）：匹配审批已通过的问卷，
 * 即已进入分区填写中 / 分区审核中 / 已归档阶段的记录；规则版本重新发布不重算。
 */
const RULE_RECALC_LOCKED_STATUSES = new Set<SurveyStatus>(['section-filling', 'section-reviewing', 'archived']);

/** 绑定某规则版本的问卷分组：可重算（已有匹配快照且未锁定）与已锁定两部分 */
function surveysBoundToRuleVersion(versionId: string): { recalcable: SurveyRecord[]; locked: number } {
  const recalcable: SurveyRecord[] = [];
  let locked = 0;
  for (const record of surveyRecords) {
    if (legacyRuleVersionId(record.creationSnapshot?.ruleSetVersion) !== versionId) continue;
    if (RULE_RECALC_LOCKED_STATUSES.has(record.status)) { locked += 1; continue; }
    // 无匹配快照（草稿/待填写）的问卷进入步骤 3 时按现行规则现算，无需回写
    if (record.matching) recalcable.push(record);
  }
  return { recalcable, locked };
}

/** 规则版本重新发布的影响预览（不落库）：供发布/保存确认弹窗展示计数 */
export function ruleVersionRecalcImpact(versionId: string): { recalculated: number; locked: number } {
  const { recalcable, locked } = surveysBoundToRuleVersion(versionId);
  return { recalculated: recalcable.length, locked };
}

/**
 * 规则版本更新发布后的联动重算（BR-009 同口径）：绑定该版本且匹配审批未通过的
 * 问卷按新规则重写 autoResults，manual（人工确认值）与 reviews 绝不触碰；
 * 已锁定问卷跳过。作答指纹不变（重算由规则变化驱动，与作答无关）。
 */
export function recalculateSurveysForRuleVersion(versionId: string): { recalculated: number; locked: number } {
  const { recalcable, locked } = surveysBoundToRuleVersion(versionId);
  for (const record of recalcable) {
    const matching = record.matching!;
    const clauses = clausesForRecord(record);
    const index = answerIndexOf(record);
    const extensions = clauseExtensionsOf(record);
    for (const clause of clauses) {
      matching.autoResults[clause.no] = evaluateClause(clause, index, extensions[clause.no]);
    }
    matching.evaluatedAt = nowText();
    // 参与条目数联动（人工值未动的条款适用性可能翻转）
    recomputeMatchedCount(record);
  }
  return { recalculated: recalcable.length, locked };
}

export interface RuleVersionUsage { total: number; inProgress: number }

/** 规则被问卷引用统计：total = 全部问卷（含已归档，历史快照冻结可追溯）；inProgress = 未归档问卷数，删除守卫用 */
export function ruleVersionUsage(): Record<string, RuleVersionUsage> {
  const usage: Record<string, RuleVersionUsage> = {};
  for (const record of surveyRecords) {
    const id = legacyRuleVersionId(record.creationSnapshot?.ruleSetVersion);
    if (!id) continue;
    usage[id] ??= { total: 0, inProgress: 0 };
    usage[id].total += 1;
    if (record.status !== 'archived') usage[id].inProgress += 1;
  }
  return usage;
}

/**
 * D1–D7 最终适用性投影（人工确认优先 BR-018）：
 * - 人工有值 → 人工值（D3–D6）；
 * - 自动命中 → 适用（D2）、自动不命中 → 不适用（D1，浅灰卡）；
 * - 自动未判定（命中题含待定，问卷未彻底完成）→ 待核验（D7，BR-020：不得判不适用）。
 */
export function finalApplicability(matching: SurveyMatching, no: string): FinalApplicability {
  const manual = matching.manual[no];
  if (manual) return manual.value;
  const auto = matching.autoResults[no];
  if (auto === 'applicable') return 'applicable';
  if (auto === 'not-hit') return 'not-applicable';
  return 'pending-review';
}

/** 差异判定（决策表 D4/D5）：自动与人工方向相反；D6（不命中→判否）方向一致不算差异 */
export function isClauseDiff(matching: SurveyMatching, no: string): boolean {
  const manual = matching.manual[no];
  if (!manual) return false;
  const auto = matching.autoResults[no];
  return (auto === 'applicable' && manual.value === 'not-applicable')
    || (auto === 'not-hit' && manual.value === 'applicable');
}

/**
 * 该问卷的安全需求条目映射（2026-11-01 接线）：快照冻结值优先 → 现行规则 → null（回退静态条目目录）。
 * 返回「条款 → 条目号[]」，问卷侧据此判断条目是否参与（不再恒按 64 条全集）。
 *
 * 结构项（Device/Document 段标题行，`kind: 'segment'`）**不可配置**：它们是 64 条计数与
 * 审核表分段的骨架，规则只配置「安全需求要求行」，故此处按条目目录顺序并入本条结构项，
 * 保证「全部条款条目都被映射」时合计仍为 64（BR-038 恒等式右端不变）。
 */
export function itemIdsOfRecord(record: SurveyRecord): Record<string, string[]> | null {
  const frozen = record.creationSnapshot?.ruleItems;
  let mapped: Record<string, string[]> | null;
  if (frozen) {
    mapped = {};
    for (const [no, refs] of Object.entries(frozen)) mapped[no] = refs.map(itemIdOfRef);
  } else {
    mapped = effectiveItemIdsFor(record.creationSnapshot?.ruleSetVersion);
  }
  if (!mapped) return null;
  const result: Record<string, string[]> = {};
  for (const clause of CLAUSES) {
    const engaged = new Set(mapped[clause.no] ?? []);
    result[clause.no] = ITEM_CATALOG
      .filter((item) => item.no === clause.no && (item.kind === 'segment' || engaged.has(item.id)))
      .map((item) => item.id);
  }
  return result;
}

/**
 * 该问卷的分区字段驱动映射（2026-11-01 接线）：快照冻结值优先 → 现行规则 → null（回退字段目录静态 drivers）。
 * 键为 `${section}:${字段位字母}`，与 sectionCatalog 的字段 code 一致（工作簿 E2 → E）。
 */
export function sectionDriversOfRecord(record: SurveyRecord): Record<string, string[]> | null {
  const frozen = record.creationSnapshot?.ruleSections;
  if (!frozen) return sectionDriversOfLive(record);
  const result: Record<string, string[]> = {};
  for (const [no, ref] of Object.entries(frozen)) {
    if (!ref?.section || !ref.field) continue;
    const letter = (/^[A-Z]+/.exec(ref.field) ?? [ref.field])[0]!;
    (result[`${ref.section}:${letter}`] ??= []).push(no);
  }
  return result;
}

function sectionDriversOfLive(record: SurveyRecord): Record<string, string[]> | null {
  return sectionDriversFor(record.creationSnapshot?.ruleSetVersion);
}

/** 仅有匹配快照（无记录）时的字段驱动解析：按快照里的规则版本取现行映射 */
export function sectionDriversOfMatching(matching?: SurveyMatching): Record<string, string[]> | null {
  return sectionDriversFor(matching?.ruleSetVersion);
}

/**
 * 参与条目数（BR-030/031）：最终适用性=适用的条款的**有效条目**数之和。
 * 2026-11-01 起不再用静态 `clause.itemCount`：条目集合来自该问卷冻结的规则映射
 * （`requirementItems`），规则少配条目时参与数随之减少；无规则信息时才回退静态条目数。
 */
export function recomputeMatchedCount(record: SurveyRecord): number {
  const matching = record.matching;
  if (!matching) return record.matchedCount;
  const itemIds = itemIdsOfRecord(record);
  const engaged = CLAUSES
    .filter((clause) => finalApplicability(matching, clause.no) === 'applicable')
    .reduce((total, clause) => total + (itemIds ? (itemIds[clause.no]?.length ?? 0) : clause.itemCount), 0);
  record.matchedCount = engaged;
  // 分母同步（2026-11-03 用户裁决）：适用条款 n/分母 的分母 = 该问卷绑定规则的有效条目总数，
  // 不再恒 64——不同标准库/少配规则的问卷分母如实反映其口径；无规则信息的历史数据回退 64
  record.totalCount = effectiveItemTotalOf(itemIds);
  return engaged;
}

/**
 * 该问卷的有效条目总数（列表/详情/打印「n/分母」的分母）：
 * 有规则条目映射时 = 全部条款条目数求和；无映射（历史数据回退静态目录）= 64（SURVEY_TOTAL_CLAUSES）。
 * 与 recomputeMatchedCount 的分子口径同源（同一个 itemIdsOfRecord）。
 */
export function effectiveItemTotalOf(itemIds: Record<string, string[]> | null): number {
  if (!itemIds) return SURVEY_TOTAL_CLAUSES;
  const total = Object.values(itemIds).reduce((sum, ids) => sum + ids.length, 0);
  return total > 0 ? total : SURVEY_TOTAL_CLAUSES;
}

/**
 * 参与审核的条目索引（条目号 → 所属条款号），供步骤 5 过滤「不在规则映射内」的条目；
 * 返回 null 表示该问卷没有可解析的规则映射（历史数据），调用方按全量条目参与。
 */
export function engagedItemIndex(record: SurveyRecord): Map<string, string> | null {
  const map = itemIdsOfRecord(record);
  if (!map) return null;
  const index = new Map<string, string>();
  for (const [no, ids] of Object.entries(map)) for (const id of ids) index.set(id, no);
  return index;
}

/** 退回后仅被驳回条款可重新确认；已通过条款跨轮次锁定。 */
export function canConfirmClause(record: SurveyRecord, no: string): boolean {
  if (record.status !== 'pending-confirm' || approvedClauseReview(record.matching, no)) return false;
  const returnedNos = record.returnInfo?.clauseNos;
  return !returnedNos?.length || returnedNos.includes(no);
}

/**
 * 逐条款确认（BR-022/024）：写入人工值与原因并联动参与条目数；
 * 本地草稿同步回浏览器库，失败回滚。入口层负责只放开可编辑阶段。
 */
export async function setClauseConfirm(
  recordId: string,
  no: string,
  value: ClauseConfirm['value'],
  reason: string,
): Promise<void> {
  const record = surveyRecords.find((item) => item.id === recordId);
  if (!record || !record.matching) throw new Error('Matching snapshot missing');
  if (!canConfirmClause(record, no)) throw new Error('Clause confirmation is locked');
  const previous = record.matching.manual[no];
  const previousUpdatedAt = record.updatedAt;
  record.matching.manual[no] = { value, reason: reason.trim() };
  recomputeMatchedCount(record);
  record.updatedAt = nowText();
  try {
    if (localSurveyDraftIds.has(recordId)) await updateLocalSurveyDraft(record);
  } catch (error) {
    if (previous) record.matching.manual[no] = previous;
    else delete record.matching.manual[no];
    recomputeMatchedCount(record);
    record.updatedAt = previousUpdatedAt;
    throw error;
  }
}

/**
 * 批量「全部采用自动判定」（05 §3.3：采用自动值为有效确认）：
 * 仅填充未确认且自动已有判定的条款——命中 → 适用；不命中 → 不适用并生成
 * 说明性原因（写明初筛依据，非人工理由）。自动未判定（含待定题）的条款跳过，
 * 保持待核验（BR-020：不得批量代判不适用），由用户回步骤 2 补答后重算。
 * reasonBuilder 由页面注入（含 i18n 与条款上下文），避免数据层硬编码文案。
 */
export async function adoptAutoResults(
  recordId: string,
  reasonBuilder: (clause: ClauseDef) => string,
): Promise<number> {
  const record = surveyRecords.find((item) => item.id === recordId);
  if (!record || !record.matching) throw new Error('Matching snapshot missing');
  if (record.status !== 'pending-confirm') throw new Error('Clause confirmation is read-only at this stage');
  const backup = { ...record.matching.manual };
  const previousUpdatedAt = record.updatedAt;
  let adopted = 0;
  for (const clause of CLAUSES) {
    if (!canConfirmClause(record, clause.no) || record.matching.manual[clause.no]) continue;
    const auto = record.matching.autoResults[clause.no];
    if (auto === 'undetermined') continue;
    record.matching.manual[clause.no] = auto === 'applicable'
      ? { value: 'applicable', reason: '' }
      : { value: 'not-applicable', reason: reasonBuilder(clause) };
    adopted += 1;
  }
  recomputeMatchedCount(record);
  record.updatedAt = nowText();
  try {
    if (localSurveyDraftIds.has(recordId)) await updateLocalSurveyDraft(record);
  } catch (error) {
    record.matching.manual = backup;
    recomputeMatchedCount(record);
    record.updatedAt = previousUpdatedAt;
    throw error;
  }
  return adopted;
}

/**
 * 撤销人工确认（人工确认下拉选「未确认」）：删除该条款人工值并联动参与条目数。
 * 仅待确认阶段可操作；本地草稿同步回浏览器库，失败回滚。
 */
export async function clearClauseConfirm(recordId: string, no: string): Promise<void> {
  const record = surveyRecords.find((item) => item.id === recordId);
  if (!record || !record.matching) throw new Error('Matching snapshot missing');
  if (!canConfirmClause(record, no)) throw new Error('Clause confirmation is locked');
  if (!record.matching.manual[no]) return;
  const previous = record.matching.manual[no];
  const previousUpdatedAt = record.updatedAt;
  delete record.matching.manual[no];
  recomputeMatchedCount(record);
  record.updatedAt = nowText();
  try {
    if (localSurveyDraftIds.has(recordId)) await updateLocalSurveyDraft(record);
  } catch (error) {
    record.matching.manual[no] = previous;
    recomputeMatchedCount(record);
    record.updatedAt = previousUpdatedAt;
    throw error;
  }
}

/**
 * 提交并发起匹配复核（N3，BR-021 门禁）：首次需确认全部条款；退回后仅重验被驳回条款。
 * 通过后 待确认 → 匹配审核中；独立审核人 mock 指定为另一名合规专员（接入天枢
 * 审批实例后由回调写入真实审核人）。重新提交保留已通过条款的锁定结论，
 * 审批人仅复核本轮未通过条款；历史轮次保留在 reviewRounds。
 */
export async function submitMatchingForReview(recordId: string): Promise<
  { ok: true } | { ok: false; unconfirmed: string[]; missingReason: string[] }
> {
  const record = surveyRecords.find((item) => item.id === recordId);
  if (!record || !record.matching) throw new Error('Matching snapshot missing');
  if (record.status !== 'pending-confirm') throw new Error('Only pending-confirm surveys can be submitted');
  const requiredClauses = record.returnInfo?.clauseNos?.length
    ? CLAUSES.filter((clause) => record.returnInfo?.clauseNos?.includes(clause.no))
    : CLAUSES;
  const unconfirmed = requiredClauses.filter((clause) => !record.matching?.manual[clause.no]).map((clause) => clause.no);
  const missingReason = requiredClauses
    .filter((clause) => record.matching?.manual[clause.no]?.value === 'not-applicable'
      && !record.matching.manual[clause.no]?.reason.trim())
    .map((clause) => clause.no);
  if (unconfirmed.length || missingReason.length) return { ok: false, unconfirmed, missingReason };
  const previousReviews = record.matching.reviews ? { ...record.matching.reviews } : undefined;
  const previousReturnInfo = record.returnInfo;
  const previousStatus = record.status;
  const previousUpdatedAt = record.updatedAt;
  const previousReviewer = record.reviewer;
  const previousUpdatedBy = record.updatedBy;
  record.status = 'matching-reviewing';
  record.reviewer = '赵敏';
  // 演示任务由功能负责人完成本步确认；真实操作人待天枢身份/审批实例回传。
  record.updatedBy = record.owner;
  record.matching.reviews = Object.fromEntries(
    Object.entries(previousReviews ?? {}).filter(([, review]) => review.result === 'approved'),
  );
  delete record.returnInfo;
  record.updatedAt = nowText();
  try {
    if (localSurveyDraftIds.has(recordId)) await updateLocalSurveyDraft(record);
  } catch (error) {
    record.status = previousStatus;
    record.updatedAt = previousUpdatedAt;
    record.reviewer = previousReviewer;
    record.updatedBy = previousUpdatedBy;
    if (previousReviews) record.matching.reviews = previousReviews;
    else delete record.matching.reviews;
    if (previousReturnInfo) record.returnInfo = previousReturnInfo;
    throw error;
  }
  return { ok: true };
}
