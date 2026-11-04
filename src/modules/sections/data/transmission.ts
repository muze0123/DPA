import { reactive } from 'vue';

export type TransmissionStatus = 'filling' | 'reviewing' | 'archived';
export type EncryptionCode = '' | 'tls' | 'mutual-tls' | 'other';
export type OverseasCode = '' | 'yes' | 'no' | 'unknown';

export interface TransmissionValues {
  encryption: EncryptionCode;
  encryptionNote: string;
  overseas: OverseasCode;
  destination: string;
}

export interface TransmissionTask {
  id: string;
  surveyId: string;
  fuliId: string;
  functionName: string;
  assignee: string;
  status: TransmissionStatus;
  updatedAt: string;
  /** The applicability decision is recorded independently of any current field value. */
  destinationScope: 'applicable' | 'unverified' | 'not-applicable';
  values: TransmissionValues;
}

export const TRANSMISSION_STATUSES = ['filling', 'reviewing', 'archived'] as const;
export const ENCRYPTION_CODES = ['tls', 'mutual-tls', 'other'] as const;
export const OVERSEAS_CODES = ['yes', 'no', 'unknown'] as const;
export const MOCK_TRANSMISSION_ACTOR = '张三';
const STORAGE_KEY = 'transmission-task-drafts:v1';

const seed: TransmissionTask[] = [
  {
    id: 'TR-0313', surveyId: 'S-2026-0313', fuliId: 'FL-2025-0011', functionName: '软件更新提醒',
    assignee: MOCK_TRANSMISSION_ACTOR, status: 'filling', updatedAt: '2026-03-26 14:44',
    destinationScope: 'unverified',
    values: { encryption: 'tls', encryptionNote: '', overseas: 'unknown', destination: '' },
  },
  {
    id: 'TR-0305', surveyId: 'S-2026-0305', fuliId: 'FL-2025-0012', functionName: '语音助手',
    assignee: '李晓彤', status: 'reviewing', updatedAt: '2026-03-29 17:40',
    destinationScope: 'applicable',
    values: { encryption: 'mutual-tls', encryptionNote: '', overseas: 'yes', destination: '德国' },
  },
  {
    id: 'TR-0307', surveyId: 'S-2026-0307', fuliId: 'FL-2025-0006', functionName: '行程记录',
    assignee: '赵敏', status: 'archived', updatedAt: '2026-03-28 16:30',
    destinationScope: 'not-applicable',
    values: { encryption: 'other', encryptionNote: '车内专用链路加密', overseas: 'no', destination: '' },
  },
];

function isValues(value: unknown): value is TransmissionValues {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<TransmissionValues>;
  return (item.encryption === '' || ENCRYPTION_CODES.includes(item.encryption as typeof ENCRYPTION_CODES[number]))
    && (item.overseas === '' || OVERSEAS_CODES.includes(item.overseas as typeof OVERSEAS_CODES[number]))
    && typeof item.encryptionNote === 'string' && typeof item.destination === 'string';
}

function readDrafts(): Record<string, TransmissionValues> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([id, value]) =>
      seed.some((task) => task.id === id && task.status === 'filling') && isValues(value),
    )) as Record<string, TransmissionValues>;
  } catch {
    return {};
  }
}

const drafts = readDrafts();
export const transmissionTasks = reactive<TransmissionTask[]>(seed.map((task) => ({
  ...task, values: { ...(drafts[task.id] ?? task.values) },
})));

export function saveTransmissionDraft(taskId: string, values: TransmissionValues): boolean {
  const task = transmissionTasks.find((item) => item.id === taskId);
  if (!task || task.status !== 'filling' || task.assignee !== MOCK_TRANSMISSION_ACTOR || !isValues(values)) return false;
  try {
    const next = { ...readDrafts(), [taskId]: { ...values } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    task.values = { ...values };
    return true;
  } catch {
    return false;
  }
}
