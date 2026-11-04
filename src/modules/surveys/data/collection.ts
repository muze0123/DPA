/**
 * 完成度与收集（步骤 7 / 原型 tab ⑤，FR-12）。
 *
 * 与步骤 6「证据与导出」共用同一份证据数据（`data/evidence.ts`），不新建第二套收集口径：
 * - 测试输入收集率 = 已填「必要测试输入」的参与条目 / 参与条目（BR-038 分母口径）；
 * - 缺口行只读证据内容，本模块只负责「预计提供时间」与「提醒状态」；
 *   证据正文仍在步骤 6 录入（单一录入入口，避免同一数据两处可写）。
 *
 * 提醒状态（演示级，对齐原型 B 块）：
 *   provided（已提供）> overdue（已逾期·提醒合规专员）> reminded（已提醒 FO）
 *   > wait（待提醒，预计时间未到）> none（待提醒，未填预计时间）
 * 逾期判定沿用 `evidence.ts`：expectedAt < 今天 才算逾期（当天到期仍为待提醒）。
 *
 * 全功能完成度（对齐原型 C 块）：以功能为单位四档归档，档位由「问卷状态 + 证据收集率」推导：
 *   ① 待填写/填写中 ② 已完成需求释放（条目锁定、待收集）③ 测试输入收集中 ④ 已完成（终态）
 *
 * 当前为前端 mock：提醒留痕存本机 localStorage，无定时任务、无站内待办推送；
 * 接服务端后把 `markReminded` 换成提醒接口即可，页面不改。
 */
import { reactive } from 'vue';
import { ITEM_CATALOG } from './items';
import { ensureItemReview } from './itemReview';
import { evidenceOf, saveEvidence, type EvidenceEntry } from './evidence';
import { SURVEY_STATUSES, type SurveyRecord, type SurveyRole, type SurveyStatus } from './surveys';

/* ------------------------------------------------------------ 时间与基础 */

export type ReminderState = 'provided' | 'none' | 'wait' | 'overdue' | 'reminded';

/** 缺失字段：与证据录入的 4 项对应，测试输入单列（提醒只看这一项） */
export type MissingField = 'satisfied' | 'how' | 'testInput';

export function todayText(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export interface ReminderRecord {
  /** 提醒时间 YYYY-MM-DD HH:mm */
  at: string;
  by: string;
}

/**
 * 提醒状态（纯函数，便于单测）。
 * @param input.provided 该条目的必要测试输入是否已填
 * @param input.dueDate  预计提供时间 YYYY-MM-DD
 * @param input.reminded 是否已提醒功能负责人
 * @param today          今天 YYYY-MM-DD
 */
export function reminderStateOf(
  input: { provided: boolean; dueDate?: string; reminded?: boolean },
  today: string,
): ReminderState {
  if (input.provided) return 'provided';
  if (input.dueDate && input.dueDate < today) return 'overdue';
  if (input.reminded) return 'reminded';
  if (!input.dueDate) return 'none';
  return 'wait';
}

/* ------------------------------------------------------------ 提醒留痕存储 */

const REMINDER_PREFIX = 'csa-reminders:v1:';

const reminderStores = reactive<Record<string, Record<string, ReminderRecord>>>({});

function reminderKey(surveyId: string): string {
  return `${REMINDER_PREFIX}${surveyId}`;
}

function readReminders(surveyId: string): Record<string, ReminderRecord> {
  try {
    const raw = globalThis.localStorage?.getItem(reminderKey(surveyId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ReminderRecord>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistReminders(surveyId: string): void {
  try {
    globalThis.localStorage?.setItem(reminderKey(surveyId), JSON.stringify(reminderStores[surveyId] ?? {}));
  } catch {
    // 隐私模式 / 配额不足：保留内存态即可
  }
}

/** 取该问卷的提醒留痕表（首次访问从本地存储水合） */
export function ensureReminders(surveyId: string): Record<string, ReminderRecord> {
  const existing = reminderStores[surveyId];
  if (existing) return existing;
  const stored = readReminders(surveyId);
  reminderStores[surveyId] = stored;
  return stored;
}

export function reminderOf(surveyId: string, itemId: string): ReminderRecord | undefined {
  return ensureReminders(surveyId)[itemId];
}

/* ------------------------------------------------------------ 缺口行与统计 */

export interface CollectionRow {
  itemId: string;
  /** 条目号，例 6.1.1-2 */
  no: string;
  summary: string;
  /** 缺失字段（按录入顺序） */
  missing: MissingField[];
  /** 必要测试输入是否已填 */
  provided: boolean;
  expectedAt?: string;
  state: ReminderState;
  reminded?: ReminderRecord;
}

/** 参与条目 = 已锁定的安全需求条目（段落标题行不计） */
function participatingItems(record: SurveyRecord) {
  const store = ensureItemReview(record);
  return ITEM_CATALOG
    .filter((item) => item.kind === 'requirement')
    .map((item) => ({
      item,
      locked: (store[item.id]?.state ?? 'pending-confirm') === 'locked',
      entry: evidenceOf(record.id, item.id),
    }))
    .filter((row) => row.locked);
}

/** 字段安全取值：证据条目可能来自旧版本本地存储，字段为 null/undefined 时不应让整个步骤白屏 */
function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function missingFieldsOf(entry: EvidenceEntry): MissingField[] {
  const missing: MissingField[] = [];
  if (!textOf(entry.satisfied).trim()) missing.push('satisfied');
  if (!textOf(entry.how).trim()) missing.push('how');
  if (!textOf(entry.testInput).trim()) missing.push('testInput');
  return missing;
}
/** 全部参与条目（含已收集）——统计与缺口共用同一遍扫描 */
export function collectionRows(record: SurveyRecord, today: string = todayText()): CollectionRow[] {
  const reminders = ensureReminders(record.id);
  return participatingItems(record).map(({ item, entry }) => {
    const provided = Boolean(textOf(entry.testInput).trim());
    return {
      itemId: item.id,
      no: item.no,
      summary: item.summary,
      missing: missingFieldsOf(entry),
      provided,
      expectedAt: entry.expectedAt,
      state: reminderStateOf({ provided, dueDate: entry.expectedAt, reminded: Boolean(reminders[item.id]) }, today),
      reminded: reminders[item.id],
    };
  });
}

export interface CollectionSummary {
  /** 适用（参与）条目数 */
  applicable: number;
  /** 测试输入项总数 = 适用条目数（一条目一项） */
  inputTotal: number;
  inputFilled: number;
  inputMissing: number;
  /** 测试输入收集率（%），无参与条目时为 null */
  rate: number | null;
  /** 待提醒（none + wait） */
  pending: number;
  reminded: number;
  overdue: number;
  provided: number;
  /** 证据未齐备（含缺测试输入）的条目数，用于与步骤 6 对齐提示 */
  evidenceMissing: number;
}

export function summarizeCollection(rows: readonly CollectionRow[]): CollectionSummary {
  const summary: CollectionSummary = {
    applicable: rows.length,
    inputTotal: rows.length,
    inputFilled: 0,
    inputMissing: 0,
    rate: null,
    pending: 0,
    reminded: 0,
    overdue: 0,
    provided: 0,
    evidenceMissing: 0,
  };
  for (const row of rows) {
    if (row.provided) summary.inputFilled += 1;
    if (row.state === 'provided') summary.provided += 1;
    else if (row.state === 'overdue') summary.overdue += 1;
    else if (row.state === 'reminded') summary.reminded += 1;
    else summary.pending += 1;
    if (row.missing.length) summary.evidenceMissing += 1;
  }
  summary.inputMissing = summary.inputTotal - summary.inputFilled;
  summary.rate = summary.inputTotal === 0 ? null : Math.round((summary.inputFilled / summary.inputTotal) * 100);
  return summary;
}

export function collectionSummaryOf(record: SurveyRecord, today: string = todayText()): CollectionSummary {
  return summarizeCollection(collectionRows(record, today));
}

/** 缺口行：缺任一字段的参与条目，按提醒严重度排序（逾期 → 待提醒 → 已提醒 → 已提供） */
const STATE_WEIGHT: Record<ReminderState, number> = { overdue: 0, none: 1, wait: 2, reminded: 3, provided: 4 };

export function gapRows(rows: readonly CollectionRow[]): CollectionRow[] {
  return rows
    .filter((row) => row.missing.length > 0)
    .slice()
    .sort((left, right) => (STATE_WEIGHT[left.state] - STATE_WEIGHT[right.state])
      || left.itemId.localeCompare(right.itemId, 'en'));
}

/* ------------------------------------------------------------ 写入：预计时间与提醒 */

/** 只改预计提供时间（证据正文留空时也可先排期）；空值 = 清除排期 */
export function setExpectedAt(record: SurveyRecord, itemId: string, date: string | undefined, operator: string): void {
  saveEvidence(record.id, itemId, { expectedAt: date || undefined }, operator);
}

/** 批量登记「已提醒」（演示级：只写留痕与状态，不推送站内待办） */
export function markReminded(record: SurveyRecord, itemIds: readonly string[], operator: string): number {
  if (!itemIds.length) return 0;
  const store = ensureReminders(record.id);
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const at = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  for (const itemId of itemIds) store[itemId] = { at, by: operator };
  persistReminders(record.id);
  return itemIds.length;
}

/* ------------------------------------------------------------ 全功能完成度 */

export type CompletionStage = 1 | 2 | 3 | 4;

export const COMPLETION_STAGES = [1, 2, 3, 4] as const satisfies readonly CompletionStage[];

/** 全功能完成度看板可见性（FR-02 / FR-03）：功能负责人不可见 */
export function canViewCompletionBoard(role: SurveyRole): boolean {
  return role !== 'owner';
}

/**
 * 四档归档（与原型 C 块同义，映射到本项目状态机）：
 * ① 待填写/填写中：尚未完成需求释放的全部阶段；
 * ② 已完成需求释放：分区审核中（条目已全部锁定，等待收集）；
 * ③ 测试输入收集中：已归档但证据未收集齐；
 * ④ 已完成（终态）：已归档且收集率 100%。
 */
export function completionStageOf(status: SurveyStatus, rate: number | null): CompletionStage {
  if (status === 'archived') return rate === 100 ? 4 : 3;
  if (status === 'section-reviewing') return 2;
  return 1;
}

export interface CompletionItem {
  surveyId: string;
  fuliId: string;
  functionName: string;
  owner: string;
  status: SurveyStatus;
  stage: CompletionStage;
  rate: number | null;
}

export interface CompletionBoard {
  counts: Record<CompletionStage, number>;
  total: number;
  items: CompletionItem[];
  /** 当前问卷所属功能在汇总中的归档 */
  current: CompletionItem | null;
}

const STATUS_ORDER: Record<SurveyStatus, number> = SURVEY_STATUSES.reduce((acc, status, index) => {
  acc[status] = index;
  return acc;
}, {} as Record<SurveyStatus, number>);

/**
 * 以功能为单位汇总：同一 FuLi ID 有多份问卷时，取阶段最靠后的一份（同阶段取更新时间晚的）。
 * 纯函数：传入记录与「问卷 id → 收集率」的查询函数，避免在渲染层反复扫描证据。
 */
export function completionBoardOf(
  records: readonly SurveyRecord[],
  rateOf: (record: SurveyRecord) => number | null,
  currentSurveyId?: string,
): CompletionBoard {
  const counts: Record<CompletionStage, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const byFunction = new Map<string, SurveyRecord>();
  for (const record of records) {
    const existing = byFunction.get(record.fuliId);
    if (!existing) {
      byFunction.set(record.fuliId, record);
      continue;
    }
    const diff = STATUS_ORDER[record.status] - STATUS_ORDER[existing.status];
    if (diff > 0 || (diff === 0 && record.updatedAt > existing.updatedAt)) byFunction.set(record.fuliId, record);
  }

  const items: CompletionItem[] = [];
  for (const record of byFunction.values()) {
    const rate = rateOf(record);
    const stage = completionStageOf(record.status, rate);
    counts[stage] += 1;
    items.push({
      surveyId: record.id,
      fuliId: record.fuliId,
      functionName: record.functionName,
      owner: record.owner,
      status: record.status,
      stage,
      rate,
    });
  }
  items.sort((left, right) => left.stage - right.stage || left.fuliId.localeCompare(right.fuliId, 'en'));

  const currentRecord = currentSurveyId ? records.find((record) => record.id === currentSurveyId) : undefined;
  const current = currentRecord ? items.find((item) => item.fuliId === currentRecord.fuliId) ?? null : null;
  return { counts, total: items.length, items, current };
}

/** 未进入收集范围的条目：既非已锁定，也不含「未参与（不适用）」（与步骤 6 的未开放口径一致） */
export function notOpenCount(record: SurveyRecord): number {
  const store = ensureItemReview(record);
  return ITEM_CATALOG
    .filter((item) => item.kind === 'requirement')
    .filter((item) => {
      const state = store[item.id]?.state ?? 'pending-confirm';
      return state !== 'locked' && state !== 'excluded';
    }).length;
}
