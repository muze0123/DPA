/**
 * 条款匹配审核（步骤 3 · 匹配审核中阶段）：审批人对 38 条款的匹配结果
 * 逐条 / 批量「通过 / 拒绝」（2026-10-27 用户裁决）。
 *
 * - 通过 = 该条款匹配结果审核完成并锁定；38 条全部通过 ⇒ 问卷进入「分区填写中」。
 * - 拒绝 = 该条款退回重新确认：人工确认值清除、问卷退回待确认（复用整卷退回
 *   BR-027 管线：待审核条目回待确认、退回痕迹写入 returnInfo），重新提交审核时
 *   上一轮审核记录整轮清空（见 matching.submitMatchingForReview）。
 * - 取消审核 = 已通过条款回到待审核（仅匹配审核中阶段可操作）。
 *
 * 与步骤 5 的 64 条目审核分属两个阶段：本模块只审「条款匹配结果」，
 * 条目内容审核在分区提交后的条目复核（itemReview）完成。
 */
import {
  CLAUSES, recomputeMatchedCount,
  type ClauseDef,
} from './matching';
import { returnSurvey, promoteItemsToReview } from './itemReview';
import { surveyRecords, type ClauseMatchReview, type SurveyRecord } from './surveys';
import { localSurveyDraftIds, updateLocalSurveyDraft } from './drafts';

type ReviewResult = ClauseMatchReview['result'];

function nowText(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function findRecord(recordId: string): SurveyRecord {
  const record = surveyRecords.find((item) => item.id === recordId);
  if (!record || !record.matching) throw new Error('Matching snapshot missing');
  if (record.status !== 'matching-reviewing') throw new Error('Clause review is only available during matching review');
  record.matching.reviews ??= {};
  return record;
}

/** 该条款是否已审核（通过或拒绝留痕均算有记录，拒绝记录在退回后保留至重新提交） */
export function isClauseReviewed(record: SurveyRecord, no: string): boolean {
  return record.matching?.reviews?.[no] !== undefined;
}

/** 待审核（尚无审核记录）条款列表 */
export function pendingReviewClauses(record: SurveyRecord): ClauseDef[] {
  return CLAUSES.filter((clause) => !isClauseReviewed(record, clause.no));
}

/**
 * 全部条款已通过 ⇒ 问卷直接进入分区填写中（BR-033 的条款匹配口径）。
 * 无「已锁定（待分配）」阶段：审批通过即由判定规则确定各分区字段必填/选填/不填，
 * 分区任务由天枢按天数工作流派发、未配置时管理员兜底，不构成业务阶段。
 */
function aggregateAfterApproval(record: SurveyRecord): void {
  const reviews = record.matching?.reviews ?? {};
  const allApproved = CLAUSES.every((clause) => reviews[clause.no]?.result === 'approved');
  if (allApproved && record.status === 'matching-reviewing') record.status = 'section-filling';
}

/**
 * 持久化包装：本地草稿写库失败时按快照回滚（与 setClauseConfirm 同一口径）。
 * rollback 由调用方闭包恢复内存态；条目轴的变更通过重新提升/退回对冲。
 */
async function persist(record: SurveyRecord, rollback: () => void): Promise<void> {
  try {
    if (localSurveyDraftIds.has(recordIdOf(record))) await updateLocalSurveyDraft(record);
  } catch (error) {
    rollback();
    throw error;
  }
}

function recordIdOf(record: SurveyRecord): string {
  return record.id;
}

/** 逐条审核：通过或拒绝（拒绝意见必填，触发整卷退回待确认） */
export async function reviewClauseMatch(
  recordId: string,
  no: string,
  result: ReviewResult,
  note: string,
): Promise<void> {
  const record = findRecord(recordId);
  const trimmed = note.trim();
  if (result === 'rejected' && !trimmed) throw new Error('I3: reject reason required');
  const reviews = record.matching!.reviews!;
  const snapshot: ClauseMatchReview = {
    result,
    by: record.reviewer ?? '',
    note: trimmed,
    at: nowText(),
  };
  const previousReview = reviews[no];
  const previousManual = record.matching!.manual[no];
  const previousStatus = record.status;
  const previousReturnInfo = record.returnInfo;
  const previousUpdatedAt = record.updatedAt;

  reviews[no] = snapshot;
  if (result === 'approved') {
    aggregateAfterApproval(record);
  } else {
    // 拒绝 → 该条款人工确认清除（回退为未确认），整卷退回待确认（BR-027 管线）
    delete record.matching!.manual[no];
    recomputeMatchedCount(record);
    returnSurvey(record, trimmed || `条款 ${no} 匹配审核未通过`, snapshot.by);
  }
  record.updatedAt = nowText();
  await persist(record, () => {
    if (previousReview) reviews[no] = previousReview;
    else delete reviews[no];
    if (previousManual) record.matching!.manual[no] = previousManual;
    delete record.returnInfo;
    if (previousReturnInfo) record.returnInfo = previousReturnInfo;
    record.status = previousStatus;
    record.updatedAt = previousUpdatedAt;
    recomputeMatchedCount(record);
    // 整卷退回管线把待审核条目降级过，回滚时按原阶段重新提升
    if (previousStatus === 'matching-reviewing') promoteItemsToReview(record);
  });
}

/** 取消审核：已通过条款回到待审核（仅匹配审核中阶段） */
export async function unreviewClauseMatch(recordId: string, no: string): Promise<void> {
  const record = findRecord(recordId);
  const reviews = record.matching!.reviews!;
  if (!reviews[no]) return;
  if (reviews[no].result !== 'approved') {
    throw new Error('Only approved clauses can be un-reviewed');
  }
  delete reviews[no];
  record.updatedAt = nowText();
  await persist(record, () => {
    reviews[no] = { result: 'approved', by: record.reviewer ?? '', note: '', at: nowText() };
  });
}

/** 批量审核通过：全部待审核条款置为已通过；全通过则问卷进入分区填写中。返回通过条数 */
export async function approveAllClauseReviews(recordId: string): Promise<number> {
  const record = findRecord(recordId);
  const reviews = record.matching!.reviews!;
  const targets = pendingReviewClauses(record);
  if (!targets.length) return 0;
  const snapshot = { ...reviews };
  const previousStatus = record.status;
  const previousUpdatedAt = record.updatedAt;
  const at = nowText();
  for (const clause of targets) {
    reviews[clause.no] = { result: 'approved', by: record.reviewer ?? '', note: '', at };
  }
  aggregateAfterApproval(record);
  record.updatedAt = at;
  await persist(record, () => {
    record.matching!.reviews = snapshot;
    record.status = previousStatus;
    record.updatedAt = previousUpdatedAt;
  });
  return targets.length;
}

/** 批量审核拒绝：全部待审核条款退回重新确认（意见必填，整卷退回待确认）。返回拒绝条数 */
export async function rejectAllClauseReviews(recordId: string, note: string): Promise<number> {
  const record = findRecord(recordId);
  const trimmed = note.trim();
  if (!trimmed) throw new Error('I3: reject reason required');
  const reviews = record.matching!.reviews!;
  const targets = pendingReviewClauses(record);
  if (!targets.length) return 0;
  const snapshot = { ...reviews };
  const previousManual = { ...record.matching!.manual };
  const previousStatus = record.status;
  const previousReturnInfo = record.returnInfo;
  const previousUpdatedAt = record.updatedAt;
  const at = nowText();
  for (const clause of targets) {
    reviews[clause.no] = { result: 'rejected', by: record.reviewer ?? '', note: trimmed, at };
    delete record.matching!.manual[clause.no];
  }
  recomputeMatchedCount(record);
  returnSurvey(record, trimmed, record.reviewer ?? '');
  record.updatedAt = at;
  await persist(record, () => {
    record.matching!.reviews = snapshot;
    record.matching!.manual = previousManual;
    delete record.returnInfo;
    if (previousReturnInfo) record.returnInfo = previousReturnInfo;
    record.status = previousStatus;
    record.updatedAt = previousUpdatedAt;
    recomputeMatchedCount(record);
    if (previousStatus === 'matching-reviewing') promoteItemsToReview(record);
  });
  return targets.length;
}
