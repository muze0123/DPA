import { useI18n } from 'vue-i18n';
import type { SurveySource, SurveyStatus } from './data/surveys';

/**
 * 问卷模块的枚举字典渲染。
 *
 * 与 tasks/labels.ts 同一约定：key 用模板串写死前缀，`scripts/i18n.mjs`
 * 才能把它识别成 `surveys.statuses.<code>` 这样的动态 key 模式。
 * 字典缺项时返回 code 本身，而不是 key 路径。
 */
export function useSurveyLabels() {
  const { t, te } = useI18n({ useScope: 'global' });

  function statusLabel(code: SurveyStatus): string {
    const key = `surveys.statuses.${code}`;
    return te(key) ? t(key) : code;
  }

  function sourceLabel(code: SurveySource): string {
    const key = `surveys.sources.${code}`;
    return te(key) ? t(key) : code;
  }

  return { statusLabel, sourceLabel };
}

/**
 * 任务状态 → Arco 语义色，沿用 DESIGN.md 语义层与 src/design/status.ts 的用法：
 * 待提交/已撤回/已作废 = 中性(gray)、待处理 = warning(orange)、
 * 审核中(匹配审核中/分区填写中/分区审核中) = info(arcoblue)、已完成 = success(green)、待确认 = warning(orange)。
 * 退回是阶段上的标记，不是状态，用红色标签表达，不在此表。
 */
export const surveyStatusColors: Record<SurveyStatus, string> = {
  pending: 'orange',
  draft: 'gray',
  'pending-fill': 'gray',
  'pending-confirm': 'orange',
  'matching-reviewing': 'arcoblue',
  'section-filling': 'arcoblue',
  'section-reviewing': 'arcoblue',
  archived: 'green',
  withdrawn: 'gray',
  voided: 'gray',
};

export function surveyStatusColor(status: SurveyStatus): string {
  return surveyStatusColors[status] ?? 'gray';
}
