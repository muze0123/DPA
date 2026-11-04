/**
 * 生物特征与口令分区（F-FORM-05）的记录投影。
 *
 * 口径：
 * - 一份记录 = 一份问卷在该分区的填写情况；字段值取自 sectionValues 的
 *   生物特征与口令存储（与问卷工作区步骤 4 同一份存储，不另建第二套）；
 * - 字段四态着色、参与字段（完成度分母）全部走 sectionProgress 的 C1–C7 引擎；
 * - 分区在匹配审批通过后开放，故记录范围为分区填写及其后的阶段。
 */
import { ensureSurveyMatching } from '../../surveys/data/matching';
import {
  MOCK_CURRENT_USER, surveyRecords, visibleSurveysFor,
  type SurveyRecord, type SurveyStatus,
} from '../../surveys/data/surveys';
import { fieldsOf, type CatalogField, type SectionKey } from './sectionCatalog';
import {
  fieldDriverMap, fieldShade, readSectionValues, sectionOverview,
  type FieldShade, type SectionProgress,
} from './sectionProgress';

export const BIOMETRIC_SECTION: SectionKey = 'biometric';

/** 分区已开放的问卷阶段（匹配审批通过进入分区填写 → 已归档） */
export const BIOMETRIC_OPEN_STATUSES = [
  'section-filling', 'section-reviewing', 'archived',
] as const satisfies readonly SurveyStatus[];

/** 分区填写状态：已完成 / 待填写 / 无适用条款 */
export type BiometricCompletion = 'complete' | 'pending' | 'not-applicable';

export const BIOMETRIC_COMPLETIONS = ['complete', 'pending', 'not-applicable'] as const;

export interface BiometricFieldView {
  field: CatalogField;
  value: string;
  shade: FieldShade;
}

export interface BiometricRecordView {
  /** 问卷编号（列表首列与详情标识） */
  id: string;
  fuliId: string;
  functionName: string;
  respondent: string;
  status: SurveyStatus;
  updatedAt: string;
  fields: BiometricFieldView[];
  progress: SectionProgress;
  completion: BiometricCompletion;
}

function openSurveys(): SurveyRecord[] {
  return visibleSurveysFor(surveyRecords, MOCK_CURRENT_USER)
    .filter((record) => (BIOMETRIC_OPEN_STATUSES as readonly SurveyStatus[]).includes(record.status));
}

/**
 * 进入页面前补算条款匹配快照：无快照时全部字段按 C6 判未判定（灰），
 * 会把「适用」误报成「不适用」。与工作区步骤 4 的懒补算同一做法，
 * 在挂载期调用，避免在 computed 内写响应式状态。
 */
export function prepareBiometricRecords(): void {
  for (const record of openSurveys()) ensureSurveyMatching(record);
}

export function completionOf(progress: SectionProgress): BiometricCompletion {
  if (progress.participating === 0) return 'not-applicable';
  return progress.pending > 0 ? 'pending' : 'complete';
}

function toView(record: SurveyRecord): BiometricRecordView {
  const values = readSectionValues(record.id)[BIOMETRIC_SECTION];
  // 驱动条款按问卷选用的规则解析（2026-11-01 接线）：创建快照冻结优先
  const drivers = fieldDriverMap(record);
  const progress = sectionOverview(record.id, record.matching, undefined, drivers)
    .sections.find((section) => section.key === BIOMETRIC_SECTION)
    ?? { key: BIOMETRIC_SECTION, total: 0, carried: 0, participating: 0, filled: 0, pending: 0, gray: 0, plain: 0, notCarried: 0 };
  return {
    id: record.id,
    fuliId: record.fuliId,
    functionName: record.functionName,
    respondent: record.respondent,
    status: record.status,
    updatedAt: record.updatedAt,
    fields: fieldsOf(BIOMETRIC_SECTION).map((field) => ({
      field,
      value: values[field.code] ?? '',
      shade: fieldShade(field, values[field.code], record.matching, drivers),
    })),
    progress,
    completion: completionOf(progress),
  };
}

/** 记录列表：最近更新在前 */
export function listBiometricRecords(): BiometricRecordView[] {
  return openSurveys()
    .map(toView)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function getBiometricRecord(surveyId: string): BiometricRecordView | null {
  const record = openSurveys().find((item) => item.id === surveyId);
  return record ? toView(record) : null;
}
