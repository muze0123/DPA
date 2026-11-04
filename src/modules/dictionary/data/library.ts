import { reactive } from 'vue';

export const ATTRIBUTE_CODES = [
  'level', 'category', 'personal', 'sensitive', 'cockpit', 'biometric',
  'secret', 'account', 'minor', 'outside',
] as const;
export type AttributeCode = typeof ATTRIBUTE_CODES[number];
export type FlagCode = Exclude<AttributeCode, 'level' | 'category'>;
export const FLAG_CODES = ATTRIBUTE_CODES.slice(2) as readonly FlagCode[];
export const REVIEW_CODES = ['pending', 'approved', 'rejected'] as const;
export type ReviewCode = typeof REVIEW_CODES[number];
export const PHASE_CODES = ['before', 'during'] as const;
export type PhaseCode = typeof PHASE_CODES[number];
export const BASIS_CODES = ['chapter9', 'document6'] as const;
export type BasisCode = typeof BASIS_CODES[number];

export interface DictionaryItem {
  id: string;
  name: string;
  alias: string;
  level: string;
  category: string;
  flags: Record<FlagCode, boolean | null>;
  review: ReviewCode;
  /** 拒绝原因：仅 review=rejected 时有值，列表内悬浮可查 */
  rejectReason?: string;
}
export interface MaterialItem {
  id: string;
  name: string;
  phase: PhaseCode;
  basis: BasisCode;
  form: string;
  method: string;
  clauses: string[];
}

const initialNames = [
  '位置信息', '人脸', '指纹', '声纹', '虹膜', '车外视频', '汽车号牌',
  'VIN', '账号信息', '登录口令/账号口令', '支付口令', '未成年人个人信息', '权限调用记录',
] as const;

export const initialDictionary: DictionaryItem[] = initialNames.map((name, index) => ({
  id: `D-${String(index + 1).padStart(3, '0')}`, name, alias: '', level: '', category: '',
  flags: Object.fromEntries(FLAG_CODES.map((code) => [code, null])) as Record<FlagCode, null>,
  review: 'pending',
}));

// Illustrative catalog entries, not a validated source-to-clause mapping or survey preparation record.
export const initialMaterials: MaterialItem[] = [
  { id: 'M-001', name: '测试环境与条件说明', phase: 'before', basis: 'chapter9', form: '文档', method: '测试前提供', clauses: [] },
  { id: 'M-002', name: '应用分发平台清单', phase: 'before', basis: 'document6', form: '清单', method: '导出平台配置', clauses: ['6.1.4'] },
  { id: 'M-003', name: '未成年人信息处理规则', phase: 'during', basis: 'document6', form: '规则文本', method: '提供现行规则', clauses: ['6.1.5'] },
  { id: 'M-004', name: '数据传输保护方案', phase: 'before', basis: 'chapter9', form: '方案文档', method: '整理技术方案', clauses: ['6.6.1.2'] },
  { id: 'M-005', name: '匿名化测试样本与记录', phase: 'during', basis: 'chapter9', form: '测试记录', method: '测试中记录', clauses: ['6.6.2.2.1', '6.6.2.2.2'] },
  { id: 'M-006', name: '权限调用记录规则', phase: 'during', basis: 'document6', form: '规则文档', method: '提供现行规则', clauses: ['6.1.6'] },
  { id: 'M-007', name: '状态恢复与变更方法说明', phase: 'before', basis: 'chapter9', form: '操作说明', method: '测试前提供', clauses: [] },
  { id: 'M-008', name: '车外敏感信息清单', phase: 'during', basis: 'document6', form: '清单', method: '按测试范围整理', clauses: ['6.6.1.2'] },
];

const STORAGE_KEY = 'metritag-dictionary-materials:preview-v1';
interface LibrarySnapshot { dictionary: DictionaryItem[]; materials: MaterialItem[] }

function isSnapshot(value: unknown): value is LibrarySnapshot {
  if (!value || typeof value !== 'object' || !('dictionary' in value) || !('materials' in value)) return false;
  const snapshot = value as LibrarySnapshot;
  return Array.isArray(snapshot.dictionary) && snapshot.dictionary.every((item) =>
    typeof item?.id === 'string' && typeof item.name === 'string' && typeof item.alias === 'string' &&
    typeof item.level === 'string' && typeof item.category === 'string' &&
    REVIEW_CODES.includes(item.review) && item.flags &&
    FLAG_CODES.every((code) => item.flags[code] === null || typeof item.flags[code] === 'boolean') &&
    (item.rejectReason === undefined || typeof item.rejectReason === 'string')) &&
    Array.isArray(snapshot.materials) && snapshot.materials.every((item) =>
      typeof item?.id === 'string' && typeof item.name === 'string' &&
      PHASE_CODES.includes(item.phase) && BASIS_CODES.includes(item.basis) &&
      typeof item.form === 'string' && typeof item.method === 'string' &&
      Array.isArray(item.clauses) && item.clauses.every((code) => typeof code === 'string'));
}

function load(): LibrarySnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      if (isSnapshot(value)) return value;
    }
  } catch { /* Preview data is usable without storage. */ }
  return { dictionary: structuredClone(initialDictionary), materials: structuredClone(initialMaterials) };
}

const loaded = load();
export const dictionary = reactive<DictionaryItem[]>(loaded.dictionary);
export const materials = reactive<MaterialItem[]>(loaded.materials);

export function persistLibrary(next: LibrarySnapshot): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    dictionary.splice(0, dictionary.length, ...next.dictionary);
    materials.splice(0, materials.length, ...next.materials);
    return true;
  } catch { return false; }
}

export function nextId(prefix: string, rows: { id: string }[]): string {
  const maximum = rows.reduce((value, row) => Math.max(value, Number(row.id.match(/\d+$/)?.[0] ?? 0)), 0);
  return `${prefix}-${String(maximum + 1).padStart(3, '0')}`;
}
