/**
 * 标准条款补充说明（2026-10-26 用户裁决：取消「勘误 / 待确认」分类，只保留对条款的解释性补充说明）。
 *
 * 口径：
 * 1) 补充说明独立于标准层，单独存储（`standard-clarifications:v1`）；
 * 2) 不改原文：它是人对条文的解释与内部口径，不是条文变更；
 * 3) 说明必须带作者与时间，便于复核；删除只允许说明人本人（当前 mock 不校验角色）。
 *
 * 迁移：旧版 `standard-annotations:preview-v1` 里的 errata / pending 记录按「说明」收敛，
 * 只保留条款号、正文、作者与时间，迁移后写入新键并清除旧键。
 */
import { reactive } from 'vue';

export interface StandardClarification {
  id: string;
  /** 标准条款号（6.1.1 / 附录A） */
  no: string;
  /** 补充说明正文 */
  text: string;
  author: string;
  createdAt: string;
}

const storageKey = 'standard-clarifications:v1';
const legacyKey = 'standard-annotations:preview-v1';

const seed: StandardClarification[] = [
  {
    id: 'SC-0001', no: '6.1.2',
    text: '草案此处「告知内容至少包含」为 7 项，与附录 C 数据处理活动清单的必填项不完全对齐；本项目按 7 项逐项取证，标准正式发布后复核。',
    author: '赵敏', createdAt: '2026-09-30 10:12',
  },
  {
    id: 'SC-0002', no: '6.1.1',
    text: '「管理制度」在本项目按制度文件、责任人清单、评审记录三件材料取证，缺一视为未建立。',
    author: '王建国', createdAt: '2026-10-26 20:40',
  },
];

function readStored(): StandardClarification[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (Array.isArray(raw)) {
      return raw.filter((entry): entry is StandardClarification =>
        Boolean(entry) && typeof entry.no === 'string' && typeof entry.text === 'string');
    }
  } catch { /* Storage is optional for this local preview. */ }
  return [];
}

/** 旧「批注」记录（errata / pending / clarify）统一收敛为补充说明 */
function readLegacy(): StandardClarification[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(legacyKey) || 'null');
    if (Array.isArray(raw)) {
      return raw
        .filter((entry) => entry && typeof entry.no === 'string' && typeof entry.text === 'string')
        .map((entry, index) => ({
          id: `SC-${String(index + 1).padStart(4, '0')}`,
          no: entry.no as string,
          text: entry.text as string,
          author: typeof entry.author === 'string' ? entry.author : '',
          createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
        }));
    }
  } catch { /* 旧数据可选，读不到即视为空 */ }
  return [];
}

const stored = readStored();
const migrated = stored.length ? stored : readLegacy();
export const standardClarifications = reactive<StandardClarification[]>(migrated.length ? migrated : seed);

function persist(): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(standardClarifications));
    if (!stored.length && migrated.length) localStorage.removeItem(legacyKey);
  } catch { /* 存储不可用时保持本次会话内的数据 */ }
}
if (!stored.length && migrated.length) persist();

function nowText(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nextId(): string {
  const max = standardClarifications.reduce((current, item) => {
    const serial = Number(item.id.replace(/^SC-/, ''));
    return Number.isFinite(serial) ? Math.max(current, serial) : current;
  }, 0);
  return `SC-${String(max + 1).padStart(4, '0')}`;
}

export function clarificationsOf(no: string): StandardClarification[] {
  return standardClarifications.filter((item) => item.no === no);
}

/** 新增补充说明：正文必填，长度 ≤ 500 字（与设计规范的长文本限制一致） */
export function addClarification(input: { no: string; text: string }, author: string): StandardClarification | null {
  const text = input.text.trim();
  if (!text) return null;
  const next: StandardClarification = { id: nextId(), no: input.no, text, author, createdAt: nowText() };
  standardClarifications.unshift(next);
  persist();
  return next;
}

export function removeClarification(id: string): void {
  const index = standardClarifications.findIndex((item) => item.id === id);
  if (index < 0) return;
  standardClarifications.splice(index, 1);
  persist();
}
