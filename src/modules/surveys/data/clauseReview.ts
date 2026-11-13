/**
 * 条款匹配审核（步骤 3 · 匹配审核中阶段）：审批人对 38 条款的匹配结果
 * 逐条 / 批量「通过 / 拒绝」（2026-10-27 用户裁决）。
 *
 * - 通过 = 该条款匹配结果审核完成并锁定；38 条全部通过 ⇒ 问卷进入「分区填写中」。
 * - 拒绝 = 受影响条款退回重新确认：人工确认值清除、问卷退回待确认；本轮审批
 *   结论归入历史，已通过条款持续锁定，重新提交只复核未通过条款。
 * - 取消审核 = 已通过条款回到待审核（仅匹配审核中阶段可操作）。
 *
 * 与步骤 5 的 64 条目审核分属两个阶段：本模块只审「条款匹配结果」，
 * 条目内容审核在分区提交后的条目复核（itemReview）完成。
 */
import {
  CLAUSES, recomputeMatchedCount,
  type ClauseDef,
} from './matching';
import { approveAllPending, ensureItemReview, returnSurvey, type ItemAudit } from './itemReview';
import { approvedClauseReview, surveyRecords, type ClauseMatchReview, type SurveyRecord } from './surveys';
import { localSurveyDraftIds, updateLocalSurveyDraft } from './drafts';

type ReviewResult = ClauseMatchReview['result'];

function nowText(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function findRecord(recordId: string): SurveyRecord {
  const record = surveyRecords.find((item) => item.id === recordId);
  if (!record || !record.matching) throw new Error('Matching snapshot missing');
  if (record.status !== 'matching-reviewing') throw new Error('Clause review is only available during matching review');
  return record;
}

/** 已通过条款跨轮次锁定；其余以当前轮次审核记录为准。 */
export function isClauseReviewed(record: SurveyRecord, no: string): boolean {
  return record.matching?.reviews?.[no] !== undefined || approvedClauseReview(record.matching, no) !== undefined;
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
function aggregateAfterApproval(record: SurveyRecord): boolean {
  const allApproved = CLAUSES.every((clause) => approvedClauseReview(record.matching, clause.no));
  if (allApproved && record.status === 'matching-reviewing') {
    // 匹配复核全部通过后，前序条目与问卷阶段一并锁定。
    const reviewer = record.reviewer ?? '';
    approveAllPending(record, reviewer);
    record.status = 'section-filling';
    delete record.reviewer;
    record.updatedBy = reviewer;
  }
  return allApproved;
}

function snapshotAudits(store: Record<string, ItemAudit>): Record<string, ItemAudit> {
  return Object.fromEntries(Object.entries(store).map(([id, audit]) => [id, { ...audit }]));
}

function restoreAudits(store: Record<string, ItemAudit>, snapshot: Record<string, ItemAudit>): void {
  for (const id of Object.keys(store)) delete store[id];
  Object.assign(store, snapshot);
}

/**
 * 持久化包装：本地草稿写库失败时按快照回滚（与 setClauseConfirm 同一口径）。
 * rollback 由调用方闭包恢复内存态。
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

/** 拒绝一个或多个条款时关闭整轮审批，保留历史并准确回滚本地写入失败。 */
async function rejectClauses(record: SurveyRecord, nos: readonly string[], reason: string): Promise<void> {
  if (!reason.trim()) throw new Error('I3: reject reason required');
  if (!nos.length || nos.some((no) => !CLAUSES.some((clause) => clause.no === no))) {
    throw new Error('Unknown clause');
  }
  const matching = record.matching!;
  const previousReviews = matching.reviews ? { ...matching.reviews } : undefined;
  if (nos.some((no) => previousReviews?.[no] || approvedClauseReview(matching, no))) {
    throw new Error('Clause already reviewed');
  }
  const previousManual = { ...matching.manual };
  const previousRounds = matching.reviewRounds ? [...matching.reviewRounds] : undefined;
  const previousReturnInfo = record.returnInfo;
  const previousStatus = record.status;
  const previousReviewer = record.reviewer;
  const previousUpdatedAt = record.updatedAt;
  const previousUpdatedBy = record.updatedBy;
  const auditStore = ensureItemReview(record);
  const previousAudits = snapshotAudits(auditStore);
  const at = nowText();
  const by = record.reviewer ?? '';
  const reviews = { ...(previousReviews ?? {}) };
  for (const no of nos) {
    reviews[no] = { result: 'rejected', by, note: reason.trim(), at };
    delete matching.manual[no];
  }
  recomputeMatchedCount(record);
  try {
    const returnInfo = returnSurvey(record, reason, by, nos);
    matching.reviewRounds = [
      ...(previousRounds ?? []),
      { returnedAt: returnInfo.time, returnedBy: by, reason: reason.trim(), rejectedClauses: [...nos], reviews },
    ];
    matching.reviews = Object.fromEntries(
      Object.entries(previousReviews ?? {}).filter(([, review]) => review.result === 'approved'),
    );
    delete record.reviewer;
    record.updatedBy = by;
    await persist(record, () => {
      matching.manual = previousManual;
      if (previousReviews) matching.reviews = previousReviews;
      else delete matching.reviews;
      if (previousRounds) matching.reviewRounds = previousRounds;
      else delete matching.reviewRounds;
      if (previousReturnInfo) record.returnInfo = previousReturnInfo;
      else delete record.returnInfo;
      record.status = previousStatus;
      record.reviewer = previousReviewer;
      record.updatedAt = previousUpdatedAt;
      record.updatedBy = previousUpdatedBy;
      recomputeMatchedCount(record);
      restoreAudits(auditStore, previousAudits);
    });
  } catch (error) {
    // returnSurvey 的同步校验失败同样不能留下已删除的人工确认。
    if (record.status === previousStatus && matching.manual !== previousManual) {
      matching.manual = previousManual;
      recomputeMatchedCount(record);
    }
    throw error;
  }
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
  if (result === 'rejected') return rejectClauses(record, [no], trimmed);
  if (!CLAUSES.some((clause) => clause.no === no)) throw new Error('Unknown clause');
  const hadReviews = Boolean(record.matching!.reviews);
  const reviews = record.matching!.reviews ??= {};
  if (reviews[no] || approvedClauseReview(record.matching, no)) throw new Error('Clause already reviewed');
  const snapshot: ClauseMatchReview = {
    result,
    by: record.reviewer ?? '',
    note: trimmed,
    at: nowText(),
  };
  const previousReview = reviews[no];
  const previousStatus = record.status;
  const previousUpdatedAt = record.updatedAt;
  const previousReviewer = record.reviewer;
  const previousUpdatedBy = record.updatedBy;
  const auditStore = ensureItemReview(record);
  const previousAudits = snapshotAudits(auditStore);

  reviews[no] = snapshot;
  aggregateAfterApproval(record);
  if (record.status === 'matching-reviewing') record.updatedBy = snapshot.by;
  record.updatedAt = nowText();
  await persist(record, () => {
    if (previousReview) reviews[no] = previousReview;
    else delete reviews[no];
    if (!hadReviews) delete record.matching!.reviews;
    record.status = previousStatus;
    record.updatedAt = previousUpdatedAt;
    record.reviewer = previousReviewer;
    record.updatedBy = previousUpdatedBy;
    restoreAudits(auditStore, previousAudits);
  });
}

/** 取消审核：已通过条款回到待审核（仅匹配审核中阶段） */
export async function unreviewClauseMatch(recordId: string, no: string): Promise<void> {
  const record = findRecord(recordId);
  const reviews = record.matching!.reviews;
  if (!reviews?.[no]) return;
  if (reviews[no].result !== 'approved') {
    throw new Error('Only approved clauses can be un-reviewed');
  }
  if (record.matching?.reviewRounds?.some((round) => round.reviews[no]?.result === 'approved')) {
    throw new Error('Previously approved clauses are locked');
  }
  const previousReview = reviews[no];
  const previousUpdatedAt = record.updatedAt;
  delete reviews[no];
  record.updatedAt = nowText();
  await persist(record, () => {
    reviews[no] = previousReview;
    record.updatedAt = previousUpdatedAt;
  });
}

/** 批量审核通过：全部待审核条款置为已通过；全通过则问卷进入分区填写中。返回通过条数 */
export async function approveAllClauseReviews(recordId: string): Promise<number> {
  const record = findRecord(recordId);
  const targets = pendingReviewClauses(record);
  if (!targets.length) return 0;
  const hadReviews = Boolean(record.matching!.reviews);
  const reviews = record.matching!.reviews ??= {};
  const snapshot = { ...reviews };
  const previousStatus = record.status;
  const previousUpdatedAt = record.updatedAt;
  const previousReviewer = record.reviewer;
  const previousUpdatedBy = record.updatedBy;
  const auditStore = ensureItemReview(record);
  const previousAudits = snapshotAudits(auditStore);
  const at = nowText();
  for (const clause of targets) {
    reviews[clause.no] = { result: 'approved', by: record.reviewer ?? '', note: '', at };
  }
  aggregateAfterApproval(record);
  if (record.status === 'matching-reviewing') record.updatedBy = record.reviewer;
  record.updatedAt = at;
  await persist(record, () => {
    if (hadReviews) record.matching!.reviews = snapshot;
    else delete record.matching!.reviews;
    record.status = previousStatus;
    record.updatedAt = previousUpdatedAt;
    record.reviewer = previousReviewer;
    record.updatedBy = previousUpdatedBy;
    restoreAudits(auditStore, previousAudits);
  });
  return targets.length;
}

/** 批量审核拒绝：全部待审核条款退回重新确认（意见必填，整卷退回待确认）。返回拒绝条数 */
export async function rejectAllClauseReviews(recordId: string, note: string): Promise<number> {
  const record = findRecord(recordId);
  const trimmed = note.trim();
  if (!trimmed) throw new Error('I3: reject reason required');
  const targets = pendingReviewClauses(record);
  if (!targets.length) return 0;
  await rejectClauses(record, targets.map((clause) => clause.no), trimmed);
  return targets.length;
}
