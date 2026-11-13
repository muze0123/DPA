import type { SurveyCurrentUser, SurveyRecord, SurveyStatus } from '../../surveys/data/surveys';
import { belongsToSurveyView } from '../../surveys/data/surveyRelations';

export type WorkbenchFilter = 'todo' | 'all' | 'active' | 'overdue' | 'dueSoon' | 'returned' | 'completed' | SurveyStatus;
const terminal = new Set<SurveyStatus>(['archived', 'withdrawn', 'voided']);
export const isActiveTask = (record: SurveyRecord) => !terminal.has(record.status);
// Current module role adapter only. Replace with server-authorized identity and scoped queries.
export const isPlatformManager = (user: SurveyCurrentUser) => user.role === 'compliance';
export function visibleWorkbenchTasks(records: SurveyRecord[], user: SurveyCurrentUser): SurveyRecord[] {
  if (isPlatformManager(user)) return records;
  if (!user.accountId || !user.name) return [];
  return records.filter(record => [record.owner, record.respondent, record.reviewer, record.sourceOperator].includes(user.name)
    || (['pending', 'handled', 'initiated'] as const).some(view => belongsToSurveyView(record, view, user)));
}
export function isWorkbenchTodo(record: SurveyRecord, user: SurveyCurrentUser): boolean {
  if (!isActiveTask(record)) return false;
  if (isPlatformManager(user)) return true;
  if (!user.accountId || !user.name || user.role === 'readonly') return false;
  if (belongsToSurveyView(record, 'pending', user)) return true;
  if (record.status === 'matching-reviewing' || record.status === 'section-reviewing') return record.reviewer === user.name;
  if (record.status === 'pending-fill') return record.respondent === user.name;
  if (record.status === 'pending' || record.status === 'draft' || record.status === 'pending-confirm') return record.owner === user.name;
  return false; // Section assignments require an explicit pending relationship, not inferred ownership.
}
export function localCalendarDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function deadlineKind(record: SurveyRecord, today: string): 'overdue' | 'dueSoon' | 'normal' {
  if (!isActiveTask(record) || !record.deadline || !/^\d{4}-\d{2}-\d{2}$/.test(record.deadline)) return 'normal';
  if (record.deadline < today) return 'overdue';
  const end = new Date(`${today}T12:00:00`);
  end.setDate(end.getDate() + 7);
  return record.deadline <= localCalendarDay(end) ? 'dueSoon' : 'normal';
}
export function matchesWorkbenchFilter(record: SurveyRecord, filter: WorkbenchFilter, user: SurveyCurrentUser, today: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'todo') return isWorkbenchTodo(record, user);
  if (filter === 'active') return isActiveTask(record);
  if (filter === 'completed') return record.status === 'archived';
  if (filter === 'returned') return isActiveTask(record) && Boolean(record.returnInfo);
  if (filter === 'overdue' || filter === 'dueSoon') return deadlineKind(record, today) === filter;
  return record.status === filter;
}
const priorities = { urgent: 0, high: 1, medium: 2, low: 3 };
export function compareWorkbenchTasks(a: SurveyRecord, b: SurveyRecord): number {
  return (a.deadline || '9999').localeCompare(b.deadline || '9999') || priorities[a.priority] - priorities[b.priority] || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
}

/** Creation counts only; current status cannot reconstruct historical completions. */
export function monthlyTaskCreation(records: SurveyRecord[], today: string, months = 12): { month: string; count: number }[] {
  const anchor = new Date(`${today}T12:00:00`);
  const buckets = Array.from({ length: months }, (_, index) => {
    const date = new Date(anchor.getFullYear(), anchor.getMonth() - months + 1 + index, 1, 12);
    return { month: localCalendarDay(date).slice(0, 7), count: 0 };
  });
  const counts = new Map(buckets.map(bucket => [bucket.month, bucket]));
  for (const record of records) {
    const day = record.createdAt?.slice(0, 10);
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) continue;
    const bucket = counts.get(day.slice(0, 7));
    if (bucket) bucket.count += 1;
  }
  return buckets;
}
