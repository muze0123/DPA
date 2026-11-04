import { fieldsOf, type SectionKey } from './sectionCatalog';

/** Survey-scoped local drafts supplement the existing task fixtures. */
const KEY_PREFIX = 'csa-inline-section-draft:v1';
const INLINE_SECTIONS: readonly SectionKey[] = ['basicInfo', 'consent', 'transmission', 'sensors'];

function key(surveyId: string): string {
  return `${KEY_PREFIX}:${surveyId}`;
}

export function loadInlineSectionDraft(surveyId: string): Partial<Record<SectionKey, Record<string, string>>> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key(surveyId)) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const draft = parsed as Record<string, unknown>;
    const result: Partial<Record<SectionKey, Record<string, string>>> = {};
    for (const section of INLINE_SECTIONS) {
      const entry = draft[section];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const values = entry as Record<string, unknown>;
      result[section] = Object.fromEntries(fieldsOf(section).flatMap((field) => {
        const value = values[field.code];
        return field.carried && !(section === 'basicInfo' && field.code === 'C')
          && typeof value === 'string' && value.length <= 500 ? [[field.code, value]] : [];
      }));
    }
    return result;
  } catch {
    return {};
  }
}

export function saveInlineSectionDraft(section: SectionKey, surveyId: string, values: Record<string, string>): void {
  if (!INLINE_SECTIONS.includes(section)) throw new Error('Unsupported inline section');
  const next = loadInlineSectionDraft(surveyId);
  next[section] = Object.fromEntries(fieldsOf(section).flatMap((field) =>
    field.carried && !(section === 'basicInfo' && field.code === 'C')
      ? [[field.code, (values[field.code] ?? '').slice(0, 500)]] : [],
  ));
  localStorage.setItem(key(surveyId), JSON.stringify(next));
}
