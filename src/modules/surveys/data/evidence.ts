/**
 * 证据与测试输入（05 §6 / F-EVID-01~07、BR-037/038、T12、X6）。
 *
 * 收集口径（BR-037）：证据**仅对「适用且已锁定」的条目**开放录入；未锁定条目不进入收集范围。
 * 释放后（X6）：证据内容保留可查，但不计入收集率与缺口统计 —— 本模块以 `released` 状态表达。
 *
 * 每条参与条目 4 项录入（F-EVID-01）：
 * 1. 已满足证据 satisfied —— 本条要求中已被证据覆盖的部分
 * 2. 如何满足的证据 how（CR 口径）—— 实现方式与证据指向
 * 3. 提供证据时间 providedAt —— 已实际提供则填日期
 * 4. 必要测试输入 testInput —— 第 9 章测试所需输入
 * 外加：预计提供时间 expectedAt（F-EVID-04：无法提供时必须给日期）、外链 links、附件 files（仅登记元数据）。
 *
 * 缺口口径（F-EVID-03）：未填视为缺口；「已满足证据」「如何满足的证据」为空，或时间两项都为空 → 缺。
 * 收集率分母 = 参与条目数（BR-038），为 0 时显示「—」。
 *
 * 附件的真实性：本轮为本地演示，只登记文件名/大小/类型/时间，不读文件内容、不上传服务端
 * （Q-22 的单文件上限与类型白名单待定，页面据此提示）。接入内网存储后替换 saveAttachment。
 */
import { reactive } from 'vue';
import type { SurveyRecord } from './surveys';

export interface EvidenceFile {
  name: string;
  /** 字节数 */
  size: number;
  /** MIME 类型，取浏览器的 File.type；为空时由扩展名推断 */
  type: string;
  addedAt: string;
}

export interface EvidenceEntry {
  satisfied: string;
  how: string;
  /** 提供证据时间 YYYY-MM-DD */
  providedAt?: string;
  /** 预计提供时间 YYYY-MM-DD（未提供时必填） */
  expectedAt?: string;
  testInput: string;
  links: string[];
  files: EvidenceFile[];
  updatedAt?: string;
  updatedBy?: string;
}

export type EvidenceState = 'missing' | 'pending' | 'overdue' | 'collected' | 'released';

export const EVIDENCE_STATES = ['missing', 'pending', 'overdue', 'collected', 'released'] as const satisfies readonly EvidenceState[];

const emptyEntry = (): EvidenceEntry => ({ satisfied: '', how: '', testInput: '', links: [], files: [] });

/* ------------------------------------------------------------ 结构归一 */

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeFile(raw: unknown): EvidenceFile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const file = raw as Partial<EvidenceFile>;
  const name = textOf(file.name).trim();
  if (!name) return null;
  return {
    name,
    size: typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : 0,
    type: textOf(file.type),
    addedAt: textOf(file.addedAt),
  };
}

/**
 * 证据条目归一（2026-10-27 修复步骤 7 空白）：
 * 本机存储的条目可能来自旧版本、被外部写入或字段被置空，此时 `satisfied` 等字段为
 * null/undefined，下游 `.trim()` 会抛 TypeError，computed 中断导致整个步骤内容区白屏
 * （只剩概要卡与步进条）。读取与写入各过一次归一，保证 4 个文本字段恒为字符串、
 * `links` / `files` 恒为数组，下游不再需要逐处判空。
 */
export function normalizeEntry(raw: unknown): EvidenceEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyEntry();
  const entry = raw as Partial<EvidenceEntry>;
  return {
    satisfied: textOf(entry.satisfied),
    how: textOf(entry.how),
    testInput: textOf(entry.testInput),
    providedAt: textOf(entry.providedAt) || undefined,
    expectedAt: textOf(entry.expectedAt) || undefined,
    links: Array.isArray(entry.links) ? entry.links.filter((link): link is string => typeof link === 'string') : [],
    files: Array.isArray(entry.files)
      ? entry.files.map(normalizeFile).filter((file): file is EvidenceFile => file !== null)
      : [],
    updatedAt: textOf(entry.updatedAt) || undefined,
    updatedBy: textOf(entry.updatedBy) || undefined,
  };
}

/* ------------------------------------------------------------ 存储（按问卷） */

const STORAGE_PREFIX = 'csa-evidence:v1:';

const stores = reactive<Record<string, Record<string, EvidenceEntry>>>({});

function storageKey(surveyId: string): string {
  return `${STORAGE_PREFIX}${surveyId}`;
}

function readStored(surveyId: string): Record<string, EvidenceEntry> {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(surveyId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const store: Record<string, EvidenceEntry> = {};
    for (const [itemId, entry] of Object.entries(parsed as Record<string, unknown>)) {
      store[itemId] = normalizeEntry(entry);
    }
    return store;
  } catch {
    return {};
  }
}

function persist(surveyId: string): void {
  try {
    globalThis.localStorage?.setItem(storageKey(surveyId), JSON.stringify(stores[surveyId] ?? {}));
  } catch {
    // 隐私模式 / 配额不足：保留内存态即可，不阻断录入
  }
}

/**
 * 演示种子：已归档问卷 S-2026-0307 预置 3 条证据，覆盖「已提供 / 待提供 / 逾期」三态，
 * 让证据缺口表的黄/白/红与逾期置顶在演示环境里可被看到（真实环境由用户录入，不预置）。
 * 仅在该问卷本地存储为空时生效，用户录入后以存储为准。
 */
const DEMO_EVIDENCE: Record<string, Record<string, Partial<EvidenceEntry>>> = {
  'S-2026-0307': {
    '6.1.1-2': {
      satisfied: '已按基本功能必要信息 / 非基本功能非必要信息拆分功能清单，非必要项未与基本功能绑定告知。',
      how: '隐私政策 3.1 节分列必要与非必要个人信息，非必要项在权限弹窗中单独勾选，未勾选不影响导航等基本功能。',
      providedAt: '2026-03-20',
      testInput: '隐私政策文本 v3.2、首次启动权限弹窗截图、功能清单（附录 B 对照）',
      links: ['intranet://compliance/privacy-policy-3.2'],
      files: [{ name: '隐私政策_v3.2.pdf', size: 812345, type: 'application/pdf', addedAt: '2026-03-20 10:12' }],
    },
    '6.1.1-3': {
      satisfied: '非必要个人信息已从基本功能授权流程中剥离。',
      how: '语音、位置等非必要授权改为按功能逐项申请，拒绝授权时基本导航仍可用。',
      expectedAt: '2026-12-31',
      testInput: '逐项拒绝授权的回归脚本',
    },
    '6.1.1-4': {
      satisfied: '拒绝语音授权后基本导航仍可用。',
      how: '导航服务不依赖语音模块，语音授权拒绝仅关闭语音交互入口。',
      expectedAt: '2026-03-01',
      testInput: '关闭语音权限后的导航可用性测试记录',
    },
  },
};

/** 取该问卷的证据表（首次访问从本地存储水合，演示问卷补种子） */
export function ensureEvidence(surveyId: string): Record<string, EvidenceEntry> {
  const existing = stores[surveyId];
  if (existing) return existing;
  const stored = readStored(surveyId);
  const seed = DEMO_EVIDENCE[surveyId];
  if (seed && !Object.keys(stored).length) {
    const hydrated: Record<string, EvidenceEntry> = { ...stored };
    for (const [itemId, patch] of Object.entries(seed)) hydrated[itemId] = normalizeEntry({ ...emptyEntry(), ...patch });
    stores[surveyId] = hydrated;
    return stores[surveyId];
  }
  stores[surveyId] = stored;
  return stores[surveyId];
}

export function evidenceOf(surveyId: string, itemId: string): EvidenceEntry {
  return ensureEvidence(surveyId)[itemId] ?? emptyEntry();
}

export function hasEvidence(entry: EvidenceEntry): boolean {
  return Boolean(entry.satisfied || entry.how || entry.testInput || entry.providedAt || entry.expectedAt
    || entry.files?.length || entry.links?.length);
}

function nowText(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 保存一条条目的证据（4 项 + 时间 + 外链 + 附件元数据） */
export function saveEvidence(surveyId: string, itemId: string, patch: Partial<EvidenceEntry>, operator: string): EvidenceEntry {
  const store = ensureEvidence(surveyId);
  const next = normalizeEntry({
    ...(store[itemId] ?? emptyEntry()),
    ...patch,
    updatedAt: nowText(),
    updatedBy: operator,
  });
  store[itemId] = next;
  persist(surveyId);
  return next;
}

/** 附件登记（不读内容、不上传；同一文件重复选择时覆盖同名项） */
export function addAttachment(surveyId: string, itemId: string, file: EvidenceFile, operator: string): EvidenceEntry {
  const current = evidenceOf(surveyId, itemId);
  const files = [...current.files.filter((item) => item.name !== file.name), file];
  return saveEvidence(surveyId, itemId, { files }, operator);
}

export function removeAttachment(surveyId: string, itemId: string, name: string, operator: string): EvidenceEntry {
  const current = evidenceOf(surveyId, itemId);
  return saveEvidence(surveyId, itemId, { files: current.files.filter((item) => item.name !== name) }, operator);
}

/* ------------------------------------------------------------ 状态与统计 */

function todayText(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 条目证据状态；locked=false 表示该条目已不参与（未锁定/未参与/被释放），证据只保留可查 */
export function evidenceState(entry: EvidenceEntry, locked: boolean): EvidenceState {
  if (!locked) return hasEvidence(entry) ? 'released' : 'missing';
  if (!textOf(entry.satisfied).trim() || !textOf(entry.how).trim()) return 'missing';
  if (entry.providedAt) return 'collected';
  if (entry.expectedAt) return entry.expectedAt < todayText() ? 'overdue' : 'pending';
  return 'missing';
}

export interface EvidenceStats {
  /** 参与条目数（= 已锁定且适用条目，BR-038 分母） */
  engaged: number;
  collected: number;
  pending: number;
  overdue: number;
  missing: number;
  /** 已释放/未锁定但留有证据的条目数（不计入分母，X6） */
  released: number;
  /** 收集率（%），参与条目为 0 时为 null → 显示「—」 */
  rate: number | null;
  /** 未锁定、尚未进入收集范围的条目数 */
  notOpen: number;
}

export function evidenceStats(rows: readonly { state: EvidenceState }[], notOpen: number): EvidenceStats {
  const stats: EvidenceStats = {
    engaged: 0, collected: 0, pending: 0, overdue: 0, missing: 0, released: 0, rate: null, notOpen,
  };
  for (const row of rows) {
    if (row.state === 'released') {
      stats.released += 1;
      continue;
    }
    stats.engaged += 1;
    if (row.state === 'collected') stats.collected += 1;
    else if (row.state === 'overdue') stats.overdue += 1;
    else if (row.state === 'pending') stats.pending += 1;
    else stats.missing += 1;
  }
  stats.rate = stats.engaged === 0 ? null : Math.round((stats.collected / stats.engaged) * 100);
  return stats;
}

/** 证据对条目内容不可反改（BR-037/T12）：只影响收集统计，不改条目与问卷阶段 */
export function isEvidenceEditable(record: SurveyRecord, itemLocked: boolean): boolean {
  return itemLocked && record.status !== 'archived';
}
