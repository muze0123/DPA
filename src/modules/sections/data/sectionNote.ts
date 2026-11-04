/**
 * 问卷级「整体备注」（原型「填写分区」noteBox）：
 * 不参与四态着色与完成度统计，随问卷本地草稿保存（localStorage）。
 * 键：`csa-section-note:v1:<surveyId>`；上限 500 字，读取与写入都截断。
 */
const KEY_PREFIX = 'csa-section-note:v1';
export const SECTION_NOTE_MAX_LENGTH = 500;

function key(surveyId: string): string {
  return `${KEY_PREFIX}:${surveyId}`;
}

export function readSectionNote(surveyId: string): string {
  try {
    const value = localStorage.getItem(key(surveyId));
    return typeof value === 'string' ? value.slice(0, SECTION_NOTE_MAX_LENGTH) : '';
  } catch {
    return '';
  }
}

export function saveSectionNote(surveyId: string, note: string): void {
  localStorage.setItem(key(surveyId), (note ?? '').slice(0, SECTION_NOTE_MAX_LENGTH));
}
