/**
 * 第一阶段匹配复核：安全需求条目的状态机与聚合（状态机 §4 IT1–IT8、BR-030~BR-036）。
 *
 * 三态 + 旁路不参与（02 §4.2）：
 * - `pending-confirm` 待确认：条款适用但功能负责人尚未确认内容（IT1/IT8）
 * - `pending-review`  待审核：已提交复核，等待合规专员逐条审核（IT3）
 * - `locked`          已锁定：审核通过，写入审核人与时间（IT4）
 * - `excluded`        旁路不参与：所属条款最终适用性 = 不适用（IT2/IT7），不计入分母
 *
 * 恒等式（BR-038）：待确认 + 待审核 + 已锁定 + 未参与 = 64（v1 绑定版本条目总数）。
 * 其中 5 条是工作簿 Device/Document 段标题行（`kind: 'segment'`）：它们是 64 条计数的一部分，
 * 生成即锁定（审核人「系统」），不进入逐条审核，因此上式的「已锁定」在审核开始前即为 5。
 *
 * 派生量：条款锁定 = 该条款下全部参与条目已锁定（BR-032，不落库）；38 条款全锁定 ⇒
 * 问卷进入「分区填写中」（BR-033）。释放任一条目 ⇒ 该条款锁定失效（BR-034），
 * 问卷按 02 §3.4 派生优先级回退。无参与条目的条款视为已满足，不阻断锁定（BR-035）。
 *
 * 当前为模块内 mock 状态（按问卷 id 存内存），接入真实 API 后由服务端持有并鉴权。
 */
import { reactive } from 'vue';
import {
  CLAUSE_COUNT, CLAUSES, engagedItemIndex, ensureSurveyMatching, finalApplicability, isClauseDiff,
  type ClauseGroupKey,
} from './matching';
import { ITEM_CATALOG, SEGMENT_ITEM_TOTAL, itemById, itemsOfClause } from './items';
import { approvedClauseReview, type SurveyRecord, type SurveyReturnInfo } from './surveys';
import { localSurveyDraftIds, updateLocalSurveyDraft } from './drafts';

/** 系统行为（条目生成/适用性翻转）的审核人标记，属业务数据不翻译 */
export const SYSTEM_AUDITOR = '系统';

export type ItemState = 'pending-confirm' | 'pending-review' | 'locked' | 'excluded';

export const ITEM_STATES = ['pending-confirm', 'pending-review', 'locked', 'excluded'] as const satisfies readonly ItemState[];

/** 释放留痕（IT6） */
export interface ItemRelease {
  reason: string;
  operator: string;
  time: string;
}

export interface ItemAudit {
  state: ItemState;
  /** 审核人（仅 locked，IT4 必填） */
  reviewer?: string;
  /** 审核时间，YYYY-MM-DD HH:mm */
  reviewedAt?: string;
  /** 最近一次释放留痕 */
  release?: ItemRelease;
  /** 条目级退回留痕（IT5，意见必填） */
  rejected?: ItemRelease;
}

/** 问卷 id → 条目号 → 审核状态 */
const stores = reactive<Record<string, Record<string, ItemAudit>>>({});

function nowText(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 已提交复核的阶段：参与条目在生成时直接落「待审核」（对应 IT3 已由功能负责人确认） */
function isSubmitted(record: SurveyRecord): boolean {
  return record.status !== 'draft' && record.status !== 'pending' && record.status !== 'pending-fill'
    && record.status !== 'pending-confirm';
}

/** 第一阶段已结束的阶段（匹配审批通过即进入分区填写，故从分区填写中起）：条目按历史结果回填为已锁定 */
const LOCKED_STAGES: readonly SurveyRecord['status'][] = ['section-filling', 'section-reviewing', 'archived'];

function baseAudit(record: SurveyRecord, clauseNo: string): ItemAudit {
  if (record.matching && finalApplicability(record.matching, clauseNo) === 'not-applicable') return { state: 'excluded' };
  if (LOCKED_STAGES.includes(record.status)) {
    // 历史数据回填：该阶段的条目在第一阶段已审完，审核人取记录的审核责任人，缺失时标系统
    return { state: 'locked', reviewer: record.reviewer ?? SYSTEM_AUDITOR, reviewedAt: record.updatedAt };
  }
  return { state: isSubmitted(record) ? 'pending-review' : 'pending-confirm' };
}

/**
 * IT7/IT8：条款适用性翻转时同步条目参与标记；已锁定条目不动（BR-031 只作用于待确认/旁路）。
 * 2026-11-01 起先按规则映射过滤：不在映射内的条目恒为「未参与」，不随条款适用性翻转回待确认。
 */
function syncApplicability(record: SurveyRecord, store: Record<string, ItemAudit>): void {
  if (!record.matching) return;
  const engaged = engagedItemIndex(record);
  for (const item of ITEM_CATALOG) {
    const audit = store[item.id];
    if (!audit) continue;
    if (engaged && !engaged.has(item.id)) { audit.state = 'excluded'; continue; }
    if (item.kind === 'segment') continue;
    const applicability = finalApplicability(record.matching, item.no);
    if (applicability === 'not-applicable' && audit.state === 'pending-confirm') audit.state = 'excluded';
    else if (applicability === 'applicable' && audit.state === 'excluded') audit.state = 'pending-confirm';
  }
}

/**
 * 取（或按当前匹配快照生成）该问卷的条目状态表。
 * 生成口径：结构项直接锁定；不在规则条目映射内 → 未参与；条款不适用 → 未参与；
 * 适用 → 待审核/待确认（按是否已提交复核）。
 */
export function ensureItemReview(record: SurveyRecord): Record<string, ItemAudit> {
  // 懒补算匹配快照：条目参与标记依赖条款最终适用性，缺快照会把全部条目误判为未参与/待确认
  if (!record.matching && record.answers) ensureSurveyMatching(record);
  const existing = stores[record.id];
  if (existing) {
    syncApplicability(record, existing);
    return existing;
  }
  const engaged = engagedItemIndex(record);
  const store: Record<string, ItemAudit> = {};
  for (const item of ITEM_CATALOG) {
    // 规则未映射该条目（2026-11-01 接线）：未参与，不计入待确认/待审核，恒等式左端仍合计 64
    if (engaged && !engaged.has(item.id)) {
      store[item.id] = { state: 'excluded' };
      continue;
    }
    if (item.kind === 'segment') {
      store[item.id] = { state: 'locked', reviewer: SYSTEM_AUDITOR, reviewedAt: record.matching?.evaluatedAt };
      continue;
    }
    store[item.id] = baseAudit(record, item.no);
  }
  stores[record.id] = store;
  return store;
}

/** 单条目审核状态（未初始化时按快照生成） */
export function itemAudit(record: SurveyRecord, itemId: string): ItemAudit {
  return ensureItemReview(record)[itemId] ?? { state: 'pending-confirm' };
}

/* ---------------------------------------------------------------- 迁移 */

function requireItem(record: SurveyRecord, itemId: string): ItemAudit {
  const item = itemById(itemId);
  if (!item) throw new Error(`Unknown item: ${itemId}`);
  const audit = ensureItemReview(record)[itemId];
  if (!audit) throw new Error(`Item not initialised: ${itemId}`);
  return audit;
}

/** IT4 逐条审核通过：待审核 → 已锁定（审核人 + 时间必填），随后重算聚合 */
export function approveItem(record: SurveyRecord, itemId: string, reviewer: string): void {
  const audit = requireItem(record, itemId);
  if (audit.state !== 'pending-review') throw new Error('I1: item is not pending review');
  audit.state = 'locked';
  audit.reviewer = reviewer;
  audit.reviewedAt = nowText();
  record.updatedAt = nowText();
  aggregateSurvey(record, reviewer);
}

/** IT5 条目级退回：待审核 → 待确认（意见必填） */
export function rejectItem(record: SurveyRecord, itemId: string, reason: string, operator: string): void {
  const audit = requireItem(record, itemId);
  if (!reason.trim()) throw new Error('I3: reject reason required');
  if (audit.state !== 'pending-review') throw new Error('I3: item is not pending review');
  audit.state = 'pending-confirm';
  audit.rejected = { reason: reason.trim(), operator, time: nowText() };
  delete audit.reviewer;
  delete audit.reviewedAt;
  record.updatedAt = nowText();
}

/** IT6 释放：已锁定 → 待确认（释放原因必填，留痕），并重算聚合（BR-034） */
export function releaseItem(record: SurveyRecord, itemId: string, reason: string, operator: string): void {
  const audit = requireItem(record, itemId);
  if (!reason.trim()) throw new Error('I2: release reason required');
  if (audit.state !== 'locked') throw new Error('I2: item is not locked');
  audit.state = 'pending-confirm';
  audit.release = { reason: reason.trim(), operator, time: nowText() };
  delete audit.reviewer;
  delete audit.reviewedAt;
  record.updatedAt = nowText();
  aggregateSurvey(record, operator);
}

/**
 * 一键审核通过（05 §5.2.3）：只作用于当前问卷的全部「待审核」条目，
 * 不触碰待确认与未参与；返回实际锁定条数（确认层据此显示「将锁定 n 条」）。
 */
export function approveAllPending(record: SurveyRecord, reviewer: string): number {
  const store = ensureItemReview(record);
  let count = 0;
  const at = nowText();
  for (const item of ITEM_CATALOG) {
    const audit = store[item.id];
    if (!audit || audit.state !== 'pending-review') continue;
    audit.state = 'locked';
    audit.reviewer = reviewer;
    audit.reviewedAt = at;
    count += 1;
  }
  if (count > 0) {
    record.updatedAt = at;
    record.reviewer = reviewer;
    aggregateSurvey(record, reviewer);
  }
  return count;
}

/** 待审核条目数（一键审核确认层用） */
export function pendingReviewCount(record: SurveyRecord): number {
  return Object.values(ensureItemReview(record)).filter((audit) => audit.state === 'pending-review').length;
}

/**
 * IT3 功能负责人重新确认内容：待确认（条款已适用）→ 待审核。
 * 释放/条目级退回后的重新审核入口：功能负责人重新确认 → 重新提交复核。
 */
export function promoteItemsToReview(record: SurveyRecord): number {
  const store = ensureItemReview(record);
  let count = 0;
  for (const item of ITEM_CATALOG) {
    const audit = store[item.id];
    if (!audit || item.kind === 'segment') continue;
    if (audit.state !== 'pending-confirm') continue;
    if (!record.matching || finalApplicability(record.matching, item.no) !== 'applicable') continue;
    audit.state = 'pending-review';
    delete audit.rejected;
    count += 1;
  }
  if (count > 0) record.updatedAt = nowText();
  aggregateSurvey(record);
  return count;
}

/* -------------------------------------------------------------- 问卷级 */

/**
 * 问卷级退回（02 §3.2 T6 + BR-027）：仅「待审核」阶段可退回；
 * 意见必填；退回后问卷回到功能负责人可编辑的阶段（待确认），
 * 待审核条目回待确认，已锁定条目保留（退回只重开受影响内容）。
 * I4（待确认不可退回）与 I5（已锁定只能通过释放回退）在此拒绝。
 */
export function returnSurvey(record: SurveyRecord, reason: string, operator: string, clauseNos: readonly string[] = []): SurveyReturnInfo {
  if (!reason.trim()) throw new Error('I3: return reason required');
  if (record.status !== 'matching-reviewing') {
    throw new Error('I4/I5: survey is not in a returnable stage');
  }
  const store = ensureItemReview(record);
  const at = nowText();
  const affected = new Set(clauseNos);
  for (const item of ITEM_CATALOG) {
    if (affected.size && !affected.has(item.no)) continue;
    const audit = store[item.id];
    if (!audit) continue;
    if (audit.state !== 'pending-review') continue;
    audit.state = 'pending-confirm';
    delete audit.reviewer;
    delete audit.reviewedAt;
  }
  const info: SurveyReturnInfo = {
    reason: reason.trim(), operator, time: at,
    ...(clauseNos.length ? { clauseNos: [...clauseNos] } : {}),
  };
  record.returnInfo = info;
  record.status = 'pending-confirm';
  record.updatedAt = at;
  return info;
}

/**
 * T8 已退回 → 待确认「点修改」：清除退回标记并回到功能负责人可编辑的阶段。
 * 匹配复核的退回落回待确认（条款匹配可改后重新提交）；分区退回保持在分区填写阶段。
 * 原始审批实例与退回留痕由平台侧审计保存，前端只清除当前标记。
 */
export function resumeFromReturn(record: SurveyRecord): void {
  if (!record.returnInfo) return;
  delete record.returnInfo;
  if (record.status === 'matching-reviewing') record.status = 'pending-confirm';
  record.updatedAt = nowText();
}

/**
 * 本地草稿持久化包装（与 clauseReview.persist 同口径）：写入失败时按回滚闭包恢复内存态。
 * 仅当该问卷已落本地库时才写库，纯内存种子不受影响。
 */
async function persist(record: SurveyRecord, rollback: () => void): Promise<void> {
  try {
    if (localSurveyDraftIds.has(record.id)) await updateLocalSurveyDraft(record);
  } catch (error) {
    rollback();
    throw error;
  }
}

/**
 * 第二阶段分区终审通过（section-reviewing → archived / 已完成）：分区提交后的条目复核全部完成、
 * 合规专员确认无误后整卷归档。要求全部参与条目已锁定（BR-032 派生），未参与条目不阻断。
 * 写入本地草稿并审计留痕（record.reviewer / updatedAt）。
 */
export async function approveSectionReview(record: SurveyRecord, operator: string): Promise<void> {
  if (record.status !== 'section-reviewing') {
    throw new Error('Section final review can only be approved during section review');
  }
  const store = ensureItemReview(record);
  const allLocked = ITEM_CATALOG
    .filter((item) => item.kind !== 'segment')
    .every((item) => {
      const audit = store[item.id];
      return audit?.state === 'locked' || audit?.state === 'excluded';
    });
  if (!allLocked) throw new Error('I1: not all engaged items are locked');
  const previousStatus = record.status;
  const previousReviewer = record.reviewer;
  const previousUpdatedAt = record.updatedAt;
  record.status = 'archived';
  record.reviewer = operator || record.reviewer;
  record.updatedAt = nowText();
  await persist(record, () => {
    record.status = previousStatus;
    record.reviewer = previousReviewer;
    record.updatedAt = previousUpdatedAt;
  });
}

/**
 * 分区终审退回（section-reviewing → section-filling / 分区填写中）：合规专员退回后由填表人修改，
 * 重新提交分区审核（BR-027 管线在分区维度沿用；与匹配审核退回回到待确认不同，分区退回保持在分区填写阶段）。
 * 退回意见必填；写入本地草稿。
 */
export async function returnSectionReview(record: SurveyRecord, reason: string, operator: string): Promise<void> {
  if (!reason.trim()) throw new Error('I3: return reason required');
  if (record.status !== 'section-reviewing') {
    throw new Error('I4/I5: survey is not in section review');
  }
  const previousStatus = record.status;
  const previousReturnInfo = record.returnInfo;
  const previousUpdatedAt = record.updatedAt;
  const previousReviewer = record.reviewer;
  const previousUpdatedBy = record.updatedBy;
  const at = nowText();
  record.returnInfo = { reason: reason.trim(), operator, time: at };
  record.status = 'section-filling';
  delete record.reviewer;
  record.updatedBy = operator;
  record.updatedAt = at;
  await persist(record, () => {
    record.status = previousStatus;
    record.returnInfo = previousReturnInfo;
    record.reviewer = previousReviewer;
    record.updatedBy = previousUpdatedBy;
    record.updatedAt = previousUpdatedAt;
  });
}

/* ---------------------------------------------------------------- 聚合 */

/** 条款锁定（BR-032，派生量）：该条款无参与条目视为已满足（BR-035） */
export function clauseLocked(record: SurveyRecord, clauseNo: string): boolean {
  const store = ensureItemReview(record);
  const items = itemsOfClause(clauseNo);
  if (!items.length) return true;
  const engaged = items.filter((item) => store[item.id]?.state !== 'excluded');
  if (!engaged.length) return true;
  return engaged.every((item) => store[item.id]?.state === 'locked');
}

export interface ClauseLockRow {
  no: string;
  group: ClauseGroupKey;
  locked: boolean;
  engaged: number;
  lockedCount: number;
}

/** 38 条款锁定派生表（不入库，每次由条目状态重算） */
export function clauseLocks(record: SurveyRecord): ClauseLockRow[] {
  return CLAUSES.map((clause) => {
    const store = ensureItemReview(record);
    const items = itemsOfClause(clause.no);
    const engaged = items.filter((item) => store[item.id]?.state !== 'excluded');
    const lockedCount = engaged.filter((item) => store[item.id]?.state === 'locked').length;
    return {
      no: clause.no,
      group: clause.group,
      engaged: engaged.length,
      lockedCount,
      locked: engaged.length === 0 ? true : lockedCount === engaged.length,
    };
  });
}

/**
 * 问卷派生状态（02 §3.4 优先级，仅匹配快照轴）：
 * 1 已退回（人工态，不自动改写）→ 3 当前轮匹配审批与全部参与条目均通过 ⇒ 分区填写中 →
 * 4 存在待审核 ⇒ 待审核（保守取值）。
 * 仅在 matching-reviewing / section-filling 之间流转，不改写退回与更后阶段。
 */
export function aggregateSurvey(record: SurveyRecord, actor?: string): void {
  if (record.status !== 'matching-reviewing' && record.status !== 'section-filling') return;
  const locks = clauseLocks(record);
  const allLocked = locks.every((row) => row.locked);
  if (!allLocked) {
    // T10 释放后降级：已锁定 → 待审核（分区任务与已填数据保留，重审期间填写只读）
    if (record.status === 'section-filling') record.status = 'matching-reviewing';
    return;
  }
  if (record.status === 'matching-reviewing') {
    // 条目锁定不能越过本轮条款匹配审批；尤其避免退回后沿用旧轮结论直接进入分区填写。
    if (record.matching?.reviews
      && !CLAUSES.every((clause) => approvedClauseReview(record.matching, clause.no))) return;
    record.status = 'section-filling';
    if (actor) record.updatedBy = actor;
    delete record.reviewer;
    record.updatedAt = nowText();
  }
}

/* ---------------------------------------------------------------- 统计 */

export interface ItemStats {
  /** 绑定版本条目总数（含 5 条结构项）= 64 */
  total: number;
  pendingConfirm: number;
  pendingReview: number;
  /** 已锁定（含生成即锁定的结构项） */
  locked: number;
  /** 未参与（条款不适用） */
  excluded: number;
  /** 参与条目数 = total - excluded（BR-038 分母口径） */
  engaged: number;
  /** 结构项条数（5） */
  structural: number;
  /** 条款级差异数（D4/D5） */
  diff: number;
  /** 已锁定条款数 / 38 */
  lockedClauses: number;
  totalClauses: number;
  allLocked: boolean;
  /** 审核人 = 提交人（Q-21 默认不强制，仅提示自审） */
  selfReview: boolean;
}

export function itemStats(record: SurveyRecord): ItemStats {
  const store = ensureItemReview(record);
  const stats: ItemStats = {
    total: ITEM_CATALOG.length,
    pendingConfirm: 0,
    pendingReview: 0,
    locked: 0,
    excluded: 0,
    engaged: 0,
    structural: SEGMENT_ITEM_TOTAL,
    diff: 0,
    lockedClauses: 0,
    totalClauses: CLAUSE_COUNT,
    allLocked: false,
    selfReview: false,
  };
  for (const audit of Object.values(store)) {
    if (audit.state === 'pending-confirm') stats.pendingConfirm += 1;
    else if (audit.state === 'pending-review') stats.pendingReview += 1;
    else if (audit.state === 'locked') stats.locked += 1;
    else stats.excluded += 1;
  }
  stats.engaged = stats.total - stats.excluded;
  const locks = clauseLocks(record);
  stats.lockedClauses = locks.filter((row) => row.locked).length;
  stats.allLocked = locks.every((row) => row.locked);
  if (record.matching) {
    stats.diff = CLAUSES.filter((clause) => isClauseDiff(record.matching!, clause.no)).length;
  }
  stats.selfReview = Boolean(record.reviewer && record.respondent === record.reviewer);
  return stats;
}

/** 审核表一行的视图数据 */
export interface ReviewRow {
  id: string;
  no: string;
  segment: 'device' | 'document';
  kind: 'requirement' | 'segment';
  summary: string;
  content: string;
  state: ItemState;
  reviewer?: string;
  reviewedAt?: string;
  release?: ItemRelease;
  clauseApplicability: 'applicable' | 'not-applicable' | 'pending-review';
}

export interface ReviewGroup {
  key: ClauseGroupKey;
  clauses: {
    no: string;
    origin: string;
    locked: boolean;
    rows: ReviewRow[];
  }[];
}

/** 按 8 组 / 38 条款组织的审核表（05 §5.1：主区按组折叠）；只列该问卷规则映射内参与审核的条目 */
export function reviewGroups(record: SurveyRecord): ReviewGroup[] {
  const store = ensureItemReview(record);
  const engaged = engagedItemIndex(record);
  const groups = new Map<ClauseGroupKey, ReviewGroup>();
  for (const clause of CLAUSES) {
    const auditState = record.matching ? finalApplicability(record.matching, clause.no) : 'pending-review';
    const rows: ReviewRow[] = itemsOfClause(clause.no)
      .filter((item) => !engaged || engaged.has(item.id))
      .map((item) => {
        const audit = store[item.id];
        return {
          id: item.id,
          no: item.no,
          segment: item.segment,
          kind: item.kind,
          summary: item.summary,
          content: item.content,
          state: audit?.state ?? 'pending-confirm',
          reviewer: audit?.reviewer,
          reviewedAt: audit?.reviewedAt,
          release: audit?.release,
          clauseApplicability: auditState,
        };
      });
    const group = groups.get(clause.group);
    const entry = {
      no: clause.no,
      origin: clause.original,
      locked: clauseLocked(record, clause.no),
      rows,
    };
    if (group) group.clauses.push(entry);
    else groups.set(clause.group, { key: clause.group, clauses: [entry] });
  }
  return [...groups.values()];
}
