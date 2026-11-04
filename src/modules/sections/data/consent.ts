/** v1 工作簿「告知与同意」C–Z 列位的本地配置快照；不代表获批的字段必填矩阵。 */
export type ConsentGroup = 'notice' | 'choice' | 'rights' | 'exceptions' | 'special';
export type Applicability = 'applicable' | 'pending' | 'not-applicable' | 'plain';

export interface ConsentField {
  code: string;
  group: ConsentGroup;
  kind: 'text' | 'long' | 'boolean';
}

export const CONSENT_GROUPS: readonly ConsentGroup[] = ['notice', 'choice', 'rights', 'exceptions', 'special'];

export const CONSENT_FIELDS: readonly ConsentField[] = [
  { code: 'C', group: 'notice', kind: 'text' },
  { code: 'D', group: 'choice', kind: 'text' },
  { code: 'E', group: 'choice', kind: 'boolean' },
  { code: 'F', group: 'choice', kind: 'text' },
  { code: 'G', group: 'rights', kind: 'boolean' },
  { code: 'H', group: 'rights', kind: 'text' },
  { code: 'I', group: 'rights', kind: 'text' },
  { code: 'J', group: 'notice', kind: 'text' },
  { code: 'K', group: 'notice', kind: 'text' },
  { code: 'L', group: 'rights', kind: 'text' },
  { code: 'M', group: 'rights', kind: 'text' },
  { code: 'N', group: 'rights', kind: 'boolean' },
  { code: 'O', group: 'exceptions', kind: 'boolean' },
  { code: 'P', group: 'exceptions', kind: 'text' },
  { code: 'Q', group: 'exceptions', kind: 'text' },
  { code: 'R', group: 'exceptions', kind: 'long' },
  { code: 'S', group: 'exceptions', kind: 'text' },
  { code: 'T', group: 'special', kind: 'boolean' },
  { code: 'U', group: 'special', kind: 'boolean' },
  { code: 'V', group: 'special', kind: 'boolean' },
  { code: 'W', group: 'special', kind: 'text' },
  { code: 'X', group: 'notice', kind: 'text' },
  { code: 'Y', group: 'special', kind: 'long' },
  { code: 'Z', group: 'special', kind: 'boolean' },
];

export const CONSENT_BOOLEAN_CODES = ['yes', 'no', 'pending'] as const;

/** 仅用于读取迁移前的问卷草稿；新编辑统一保存到 inlineSectionDraft。 */
export function loadConsentDraft(surveyId: string): Record<string, string> {
  if (!import.meta.env.DEV) return {};
  try {
    const raw = localStorage.getItem(`csa-consent-draft:v1:${surveyId}`);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const values = parsed as Record<string, unknown>;
    return Object.fromEntries(CONSENT_FIELDS.flatMap((field) => {
      const value = values[field.code];
      return typeof value === 'string' && value.length <= 500 ? [[field.code, value]] : [];
    }));
  } catch { return {}; }
}
