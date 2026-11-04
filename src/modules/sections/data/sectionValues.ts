/**
 * 新增分区（生物特征与口令 / 匿名化）的字段值本地库。
 *
 * 与 consent.ts 同一形态：按问卷 id 存 localStorage，只保留目录中已承载的字段、
 * 单值长度上限 500。mock 阶段不接后端，读写失败由调用方提示。
 */
import { fieldsOf, type SectionKey } from './sectionCatalog';

const KEY_PREFIX = 'csa-section-values:v1';

const NEW_SECTIONS: readonly SectionKey[] = ['biometric', 'anonymization'];

function storageKey(section: SectionKey, surveyId: string): string {
  return `${KEY_PREFIX}:${section}:${surveyId}`;
}

export function loadSectionValues(section: SectionKey, surveyId: string): Record<string, string> {
  if (!NEW_SECTIONS.includes(section)) return {};
  try {
    const raw = localStorage.getItem(storageKey(section, surveyId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const values = parsed as Record<string, unknown>;
    return Object.fromEntries(fieldsOf(section).flatMap((field) => {
      const value = values[field.code];
      return typeof value === 'string' && value.length <= 500 ? [[field.code, value]] : [];
    }));
  } catch {
    return {};
  }
}

export function saveSectionValues(section: SectionKey, surveyId: string, values: Record<string, string>): void {
  if (!NEW_SECTIONS.includes(section)) return;
  const allowed = Object.fromEntries(fieldsOf(section)
    .map((field) => [field.code, (values[field.code] ?? '').slice(0, 500)]));
  localStorage.setItem(storageKey(section, surveyId), JSON.stringify(allowed));
}
