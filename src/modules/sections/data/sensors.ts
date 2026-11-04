import { reactive } from 'vue';

export type SensorStatus = 'filling' | 'reviewing' | 'archived';
export type SensorType = '' | 'camera' | 'lidar' | 'radar' | 'radar4d' | 'ultrasonic' | 'other';
export type PrecisionAnswer = '' | 'yes' | 'no' | 'unverified';

export interface SensorRow {
  id: string;
  type: SensorType;
  typeNote: string;
  precision: PrecisionAnswer;
  location: string;
  function: string;
}

export interface SensorTask {
  id: string;
  surveyId: string;
  fuliId: string;
  functionName: string;
  assignee: string;
  status: SensorStatus;
  updatedAt: string;
  /** Supplied as mock task context, never inferred from a questionnaire answer. */
  applicability: 'applicable' | 'unverified' | 'not-applicable';
  rows: SensorRow[];
}

export const SENSOR_TYPES = ['camera', 'lidar', 'radar', 'radar4d', 'ultrasonic', 'other'] as const;
export const PRECISION_ANSWERS = ['yes', 'no', 'unverified'] as const;
export const SENSOR_STATUSES = ['filling', 'reviewing', 'archived'] as const;
export const MOCK_SENSOR_ACTOR = '张三';
const STORAGE_KEY = 'sensor-task-drafts:v1';
interface SensorDraft { rows: SensorRow[]; updatedAt: string }

const seed: SensorTask[] = [
  { id: 'SE-0305', surveyId: 'S-2026-0305', fuliId: 'FL-2025-0012', functionName: '语音助手', assignee: MOCK_SENSOR_ACTOR, status: 'filling', updatedAt: '2026-03-29 17:40', applicability: 'applicable',
    rows: [{ id: '1', type: 'camera', typeNote: '', precision: 'unverified', location: '座舱内后视镜区域', function: '驾驶员状态识别' }] },
  { id: 'SE-0313', surveyId: 'S-2026-0313', fuliId: 'FL-2025-0011', functionName: '软件更新提醒', assignee: MOCK_SENSOR_ACTOR, status: 'filling', updatedAt: '2026-03-26 14:44', applicability: 'unverified', rows: [] },
  { id: 'SE-0314', surveyId: 'S-2026-0314', fuliId: 'FL-2025-0008', functionName: '车主身份验证', assignee: MOCK_SENSOR_ACTOR, status: 'filling', updatedAt: '2026-03-25 17:20', applicability: 'applicable',
    rows: [{ id: '1', type: 'radar4d', typeNote: '', precision: 'yes', location: '前保险杠', function: '前向目标检测' }, { id: '2', type: 'ultrasonic', typeNote: '', precision: '', location: '后保险杠', function: '泊车辅助' }] },
  { id: 'SE-0306', surveyId: 'S-2026-0306', fuliId: 'FL-2025-0014', functionName: '紧急呼叫', assignee: '李晓彤', status: 'reviewing', updatedAt: '2026-03-29 10:26', applicability: 'not-applicable', rows: [] },
  { id: 'SE-0307', surveyId: 'S-2026-0307', fuliId: 'FL-2025-0006', functionName: '行程记录', assignee: '赵敏', status: 'archived', updatedAt: '2026-03-28 16:30', applicability: 'applicable',
    rows: [{ id: '1', type: 'camera', typeNote: '', precision: 'yes', location: '前挡风玻璃', function: '行车影像记录' }] },
  { id: 'SE-0315', surveyId: 'S-2026-0315', fuliId: 'FL-2025-0013', functionName: '车内摄像头查看', assignee: '李晓彤', status: 'archived', updatedAt: '2026-03-24 09:12', applicability: 'applicable',
    rows: [{ id: '1', type: 'camera', typeNote: '', precision: 'no', location: '座舱顶棚', function: '座舱影像采集' }] },
];

function validRow(value: unknown): value is SensorRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<SensorRow>;
  return typeof row.id === 'string' && row.id.length <= 40
    && (row.type === '' || SENSOR_TYPES.includes(row.type as typeof SENSOR_TYPES[number]))
    && (row.precision === '' || PRECISION_ANSWERS.includes(row.precision as typeof PRECISION_ANSWERS[number]))
    && typeof row.typeNote === 'string' && row.typeNote.length <= 120
    && typeof row.location === 'string' && row.location.length <= 120
    && typeof row.function === 'string' && row.function.length <= 120;
}

function validRows(value: unknown): value is SensorRow[] {
  return Array.isArray(value) && value.length <= 32 && value.every(validRow)
    && new Set(value.map((row: SensorRow) => row.id)).size === value.length;
}

function readDrafts(): Record<string, SensorDraft> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([id, value]) => {
      const original = seed.find((task) => task.id === id && task.status === 'filling' && task.assignee === MOCK_SENSOR_ACTOR);
      if (!original) return [];
      // The earlier local-only format held rows directly; retain those drafts on upgrade.
      if (validRows(value)) return [[id, { rows: value, updatedAt: original.updatedAt }]];
      if (!value || typeof value !== 'object') return [];
      const draft = value as Partial<SensorDraft>;
      return validRows(draft.rows) && typeof draft.updatedAt === 'string'
        && /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(draft.updatedAt)
        ? [[id, { rows: draft.rows, updatedAt: draft.updatedAt }]] : [];
    })) as Record<string, SensorDraft>;
  } catch { return {}; }
}

const drafts = readDrafts();
export const sensorTasks = reactive<SensorTask[]>(seed.map((task) => ({
  ...task,
  updatedAt: drafts[task.id]?.updatedAt ?? task.updatedAt,
  rows: (drafts[task.id]?.rows ?? task.rows).map((row) => ({ ...row })),
})));

export function saveSensorDraft(taskId: string, rows: SensorRow[]): boolean {
  const task = sensorTasks.find((item) => item.id === taskId);
  if (!task || task.status !== 'filling' || task.assignee !== MOCK_SENSOR_ACTOR
    || task.applicability !== 'applicable' || !validRows(rows)) return false;
  try {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const updatedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readDrafts(), [taskId]: { rows, updatedAt } }));
    task.rows = rows.map((row) => ({ ...row }));
    task.updatedAt = updatedAt;
    return true;
  } catch { return false; }
}
