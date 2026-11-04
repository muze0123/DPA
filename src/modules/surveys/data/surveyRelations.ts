import type { SurveyCurrentUser, SurveyRecord, SurveyStatus } from './surveys';

export const SURVEY_VIEW_KEYS = ['all', 'pending', 'handled', 'initiated', 'copied'] as const;
export type SurveyViewKey = (typeof SURVEY_VIEW_KEYS)[number];

type RelationKind = 'pending' | 'handled' | 'copied';

interface SurveyRelation {
  id: string;
  surveyId: string;
  accountId: string;
  kind: RelationKind;
  activeStatus?: SurveyStatus;
}

// Local-only relationship fixtures. Replace these with task and copy-recipient IDs from TianShu.
const accountIdsByName: Record<string, string> = {
  '王建国': 'demo-wang', '陈志远': 'demo-chen', '刘思远': 'demo-liu',
  '赵敏': 'demo-zhao', '李晓彤': 'demo-xiao', '周明': 'demo-zhou',
};

const relations: readonly SurveyRelation[] = [
  { id: 'task-confirm-0302', surveyId: 'S-2026-0302', accountId: 'demo-wang', kind: 'pending', activeStatus: 'pending-confirm' },
  { id: 'task-consent-0305', surveyId: 'S-2026-0305', accountId: 'demo-wang', kind: 'pending', activeStatus: 'section-filling' },
  { id: 'task-basic-0305', surveyId: 'S-2026-0305', accountId: 'demo-wang', kind: 'pending', activeStatus: 'section-filling' },
  { id: 'task-section-0313', surveyId: 'S-2026-0313', accountId: 'demo-wang', kind: 'pending', activeStatus: 'section-filling' },
  { id: 'task-match-0304', surveyId: 'S-2026-0304', accountId: 'demo-wang', kind: 'handled' },
  { id: 'task-section-0305-old', surveyId: 'S-2026-0305', accountId: 'demo-wang', kind: 'handled' },
  { id: 'task-review-0307', surveyId: 'S-2026-0307', accountId: 'demo-wang', kind: 'handled' },
  { id: 'copy-0307', surveyId: 'S-2026-0307', accountId: 'demo-wang', kind: 'copied' },
  { id: 'copy-0314', surveyId: 'S-2026-0314', accountId: 'demo-wang', kind: 'copied' },
];

export function belongsToSurveyView(record: SurveyRecord, view: SurveyViewKey, user: SurveyCurrentUser): boolean {
  if (view === 'all') return true;
  if (view === 'initiated') return accountIdsByName[record.sourceOperator] === user.accountId;
  if (view === 'pending' && record.status === 'draft' && accountIdsByName[record.sourceOperator] === user.accountId) return true;
  if (view === 'pending' && record.status === 'pending-fill' && accountIdsByName[record.respondent] === user.accountId) return true;
  return relations.some((relation) => relation.surveyId === record.id && relation.accountId === user.accountId
    && relation.kind === view && (!relation.activeStatus || relation.activeStatus === record.status));
}
