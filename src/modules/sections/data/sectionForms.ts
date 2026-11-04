/**
 * 分区表单（2026-10-30 用户裁决）：分区管理落地页的数据层。
 *
 * 口径：
 * - 「分区管理」一级菜单直接进入本模块列表页，原 7 个二级菜单取消；
 *   7 个分区以**预置 7 行**的形式落到列表里（编号与名称预填、状态**已发布**，
 *   表单设计 = 主数据占位（locked：功能编号/功能名称，基础信息另有功能说明）+ xlsx 分区业务字段，2026-10-30 用户裁决），
 *   各分区的「表单版本 / 填写记录」只能通过列表行操作进入。
 * - 状态两态：草稿 / 已发布。「已发布」仍可编辑，保存后**保持已发布**
 *   （不回退草稿、不升版本号）——与规则管理同一口径。
 * - 停用语义由「是否启用」开关承载，与状态正交；缺省视为启用（兼容存量数据）。
 * - 填写记录入口只属于「绑定了填写分区」的预置行（`sectionKey`）；
 *   自定义新建的表单没有对应分区页面，不提供该入口。
 * - 字段顺序 = `fields` 数组下标，不另设 order 字段。
 */
import { reactive } from 'vue';
import { SECTION_DEFS, catalogField, fieldsOf, type SectionKey } from './sectionCatalog';

export type SectionFormStatus = 'draft' | 'published';

export const SECTION_FORM_STATUSES = ['draft', 'published'] as const satisfies readonly SectionFormStatus[];

/**
 * 字段类型（2026-10-30 用户裁决）：单行文本 / 多行文本 / 单选框 / 复选框。
 * 旧「下拉单选（select）」与「是否（开关，boolean）」一并下线——是否语义由单选框承载；
 * 读取存量数据时 select → radio（选项保留）、boolean → radio（选项 是/否）。
 */
export type SectionFormFieldType = 'text' | 'textarea' | 'radio' | 'checkbox';

export const SECTION_FORM_FIELD_TYPES = ['text', 'textarea', 'radio', 'checkbox'] as const satisfies readonly SectionFormFieldType[];

/** 带选项的字段类型（单选框 / 复选框），表单设计页据此渲染选项配置区 */
export const SECTION_FORM_OPTION_TYPES = ['radio', 'checkbox'] as const satisfies readonly SectionFormFieldType[];

export type SectionFieldOptionType = (typeof SECTION_FORM_OPTION_TYPES)[number];

export function isOptionField(field: SectionFormField): boolean {
  return (SECTION_FORM_OPTION_TYPES as readonly string[]).includes(field.type);
}

/** 必填规则（2026-10-30 用户裁决）：待业务确认 / 适用时可选 / 适用时必填，与分区版本页同口径 */
export type SectionFieldRequiredness = 'unconfirmed' | 'optional' | 'required';

export const SECTION_FORM_REQUIREDNESS = ['unconfirmed', 'optional', 'required'] as const satisfies readonly SectionFieldRequiredness[];

export interface SectionFormField {
  /**
   * 字段标识（2026-11-01 接线）：规则映射端点与填写值的键。
   * 预置字段 = 工作簿字段位字母（C/D/E…），与 `sectionCatalog` 的 code 一致，
   * 因此既有填写值（按字母键存储）不受影响；自定义新增字段取 `F<序号>`。
   */
  id?: string;
  name: string;
  type: SectionFormFieldType;
  requiredness: SectionFieldRequiredness;
  /** 选项文案（type = radio/checkbox）；其他类型恒为空数组 */
  options: string[];
  /**
   * 驱动条款号（规则映射端点）：空数组 = 补充字段（无色、不计完成度）。
   * 预置字段取自 `sectionCatalog`；运行时以问卷所属规则的 `sectionAssignments` 为准（规则优先）。
   */
  drivers?: string[];
  /**
   * 主数据占位（2026-10-30 / 2026-11-01 用户裁决）：功能编号 / 功能名称由任务-基本信息配置带入，
   * 基础信息另含 C「功能说明」（引用功能台账「功能描述」）。表单设计里作占位字段——
   * 名称/类型/必填规则控件禁用、不可删除，仅可随表格排序；不参与分区内填写。
   */
  locked?: boolean;
}

export interface SectionForm {
  /** 表单编号（人类可读、唯一） */
  id: string;
  /** 表单名称 */
  name: string;
  status: SectionFormStatus;
  /** 表单说明 */
  note: string;
  fields: SectionFormField[];
  /** 绑定的填写分区：仅预置 7 行有值，决定「填写记录」入口与跳转路径 */
  sectionKey?: SectionKey;
  /** 是否启用（缺省启用）；与「草稿/已发布」正交 */
  enabled?: boolean;
  creator: string;
  createdAt: string;
  updater: string;
  updatedAt: string;
}

export interface SectionFormInput {
  id: string;
  name: string;
  note: string;
  fields: SectionFormField[];
}

const SEED_OPERATOR = '系统预置';
const SEED_TIME = '2026-10-30 09:00';

/** 预置 7 行：编号与名称预填，状态已发布，字段 = 分区主数据占位 + xlsx 业务字段（2026-10-30 用户裁决） */
const SEED_NAMES: Record<SectionKey, string> = {
  basicInfo: '基础信息',
  consent: '告知与同意',
  transmission: '数据传输',
  sensors: '传感器',
  biometric: '生物特征与口令',
  anonymization: '匿名化',
  materials: '通用材料',
};

/* ---------------- 预置字段（真值源：GB44464_静态.xlsx 七个分区工作表 + 各分区表单版本页字段预置） ---------------- */
/* 类型映射（2026-10-30 用户裁决「按语义映射」）：（是/否）→ 单选框(是/否)；可多选 → 复选框；
   说明/清单/结论类 → 多行文本；其余 → 单行文本；选项集与各分区「新建表单版本」页的字段预置一致。
   必填规则统一「适用时必填」（用户裁决）；功能编号 / 功能名称 / 基础信息的功能说明为锁定占位（locked）。 */

const lockedField = (name: string): SectionFormField => ({ name, type: 'text', requiredness: 'required', options: [], locked: true });
const field = (name: string, type: SectionFormFieldType, options: string[] = []): SectionFormField =>
  ({ name, type, requiredness: 'required', options });

const YES_NO = ['是', '否'];

/** 主数据占位：功能编号 / 功能名称（任务-基本信息带入，占位用；基础信息另含功能说明，见 PRESET_BUSINESS_FIELDS） */
const MASTER_FIELDS: readonly SectionFormField[] = [lockedField('功能编号'), lockedField('功能名称')];

/** 主数据占位字段标识（不参与分区填写，取值不落填写值） */
const MASTER_IDS: Record<string, string> = { 功能编号: 'MASTER-NO', 功能名称: 'MASTER-NAME' };

/** 字段位目录里该标识对应字段的驱动条款（预置字段的映射默认值） */
function catalogDriversOf(section: SectionKey, code: string): string[] {
  return [...(catalogField(section, code)?.drivers ?? [])];
}

/**
 * 预置业务字段身份补全（2026-11-01）：按字段位顺序把 `sectionCatalog` 的字母键与驱动条款
 * 写到预置字段上（PRESET_BUSINESS_FIELDS 与目录字段顺序逐位一致）。
 * 已有 id 的字段不改写——保证管理端编辑后再次读取不会被回滚。
 */
function withCatalogIdentity(section: SectionKey, fields: readonly SectionFormField[]): SectionFormField[] {
  const catalog = fieldsOf(section);
  return fields.map((item, index) => {
    const code = item.id ?? catalog[index]?.code ?? `F${index + 1}`;
    return {
      ...item,
      options: [...item.options],
      id: code,
      drivers: item.drivers ? [...item.drivers] : catalogDriversOf(section, code),
    };
  });
}

/** 完整预置字段集：主数据占位（不可填）+ 业务字段（带字段位标识与驱动条款） */
function presetFieldsOf(section: SectionKey): SectionFormField[] {
  return [
    ...MASTER_FIELDS.map((item) => ({ ...item, options: [...item.options], id: MASTER_IDS[item.name], drivers: [] })),
    ...withCatalogIdentity(section, PRESET_BUSINESS_FIELDS[section]),
  ];
}

const PRESET_BUSINESS_FIELDS: Record<SectionKey, readonly SectionFormField[]> = {
  basicInfo: [
    // C 功能说明：封面主数据字段（方案 A）——引用功能台账「功能描述」、随问卷创建快照带入，
    // 与功能编号/功能名称同属主数据占位，不参与分区内填写（2026-11-01 用户裁决）。
    lockedField('功能说明'),
    field('功能分类', 'radio', ['基本功能', '非基本功能']),
    field('涉及数据类型', 'text'),
    field('数据收集方式', 'radio', ['自动采集', '用户输入', '系统生成']),
    field('数据收集时机', 'radio', ['首次启动', '每次使用', '后台运行']),
    field('数据收集位置', 'radio', ['座舱内', '车外']),
    field('数据存储位置', 'radio', ['车端ECU', '云端', '第三方']),
    field('存储期限', 'text'),
    field('数据处理目的', 'textarea'),
    field('数据使用方式', 'radio', ['本地处理', '云端处理', '第三方处理']),
  ],
  consent: [
    field('告知方式', 'checkbox', ['用户手册', '车载面板', '语音', '短信', '应用']),
    field('同意获取方式', 'radio', ['弹窗', '勾选', '语音确认']),
    field('是否需单独同意', 'radio', YES_NO),
    field('同意期限及规则', 'text'),
    field('是否提供撤回同意途径', 'radio', YES_NO),
    field('撤回同意方式', 'text'),
    field('拒绝方式', 'text'),
    field('权限调用记录展示方式', 'text'),
    field('数据收集提示方式', 'text'),
    field('数据删除途径', 'text'),
    field('删除触发条件', 'text'),
    field('删除后是否可检索访问', 'radio', YES_NO),
    field('是否适用个人同意例外', 'radio', YES_NO),
    field('例外情形类型', 'text'),
    field('例外涉及数据类型', 'text'),
    field('例外理由说明', 'textarea'),
    field('例外告知说明路径', 'text'),
    field('是否涉及未成年人个人信息', 'radio', YES_NO),
    field('是否有未成年人专门规则', 'radio', YES_NO),
    field('是否涉及应用分发平台', 'radio', YES_NO),
    field('平台运营者信息展示方式', 'text'),
    field('权限调用记录保存期限', 'text'),
    field('第三方接收方补充信息', 'textarea'),
    field('用户画像与精准推送独立拒绝方式', 'radio', YES_NO),
  ],
  transmission: [
    field('数据加密方式', 'text'),
    field('是否涉及境外传输', 'radio', YES_NO),
    field('境外传输目的地', 'text'),
    field('是否向第三方提供', 'radio', YES_NO),
    field('第三方名称及接收目的', 'text'),
  ],
  sensors: [
    field('传感器类型', 'radio', ['摄像头', '激光雷达', '毫米波雷达', '4D 毫米波雷达', '超声波雷达', '其他']),
    field('是否至少一个功能符合最小精度要求', 'radio', YES_NO),
    field('传感器安装位置', 'text'),
    field('传感器对应功能', 'text'),
  ],
  biometric: [
    field('生物特征类型', 'radio', ['人脸', '指纹', '声纹', '虹膜', '掌纹']),
    field('是否有非生物识别替代方式', 'radio', YES_NO),
    field('是否涉及口令/密码/PIN', 'radio', YES_NO),
    field('口令输入/显示时是否隐藏', 'radio', YES_NO),
    field('生物特征是否仅存储于车内', 'radio', YES_NO),
    field('是否向车外传输生物特征', 'radio', YES_NO),
  ],
  anonymization: [
    field('是否需匿名化处理', 'radio', YES_NO),
    field('匿名化方式', 'radio', ['删除画面', '降低分辨率', '局部轮廓化（高斯模糊/马赛克/色块）', '其他']),
    field('匿名化对象标准确认', 'radio', YES_NO),
    field('匿名化检出率结论', 'textarea'),
    field('匿名化效果确认', 'radio', YES_NO),
  ],
  materials: [
    field('需提供的测试材料清单', 'textarea'),
    field('状态恢复/变更方法说明', 'textarea'),
    field('备注', 'textarea'),
  ],
};

/** 预置表单完整字段集：主数据占位（locked）+ 分区业务字段；只读消费方请自行克隆 */
export const PRESET_SECTION_FIELDS = Object.fromEntries(
  (Object.keys(PRESET_BUSINESS_FIELDS) as SectionKey[]).map((key) => [key, presetFieldsOf(key)]),
) as unknown as Record<SectionKey, readonly SectionFormField[]>;

const seedForms = (): SectionForm[] => SECTION_DEFS.map((section, index) => ({
  id: `FORM-2026-${String(index + 1).padStart(3, '0')}`,
  name: SEED_NAMES[section.key],
  status: 'published' as SectionFormStatus,
  note: '',
  fields: PRESET_SECTION_FIELDS[section.key].map((item) => ({ ...item, options: [...item.options] })),
  sectionKey: section.key,
  enabled: true,
  creator: SEED_OPERATOR,
  createdAt: SEED_TIME,
  updater: SEED_OPERATOR,
  updatedAt: SEED_TIME,
}));

const storageKey = 'csa-section-forms:v1';

/** 读取迁移（2026-10-30 用户裁决）：
 *  - 类型 select → radio（选项原样保留）、boolean → radio（选项 是/否）；
 *  - 必填 required:boolean → requiredness（true → 适用时必填，false → 待业务确认）。 */
function migrateField(value: unknown): SectionFormField | null {
  if (!value || typeof value !== 'object') return null;
  const field = value as {
    id?: unknown; name?: unknown; type?: unknown; required?: unknown; requiredness?: unknown;
    options?: unknown; locked?: unknown; drivers?: unknown;
  };
  if (typeof field.name !== 'string' || !Array.isArray(field.options) || !field.options.every((option) => typeof option === 'string')) return null;
  let type = field.type;
  if (type === 'select' || type === 'boolean') type = 'radio';
  if (!SECTION_FORM_FIELD_TYPES.includes(type as SectionFormFieldType)) return null;
  let requiredness = field.requiredness;
  if (requiredness !== 'optional' && requiredness !== 'required') requiredness = field.required === true ? 'required' : 'unconfirmed';
  return {
    id: typeof field.id === 'string' && field.id.trim() ? field.id : undefined,
    name: field.name,
    type: type as SectionFormFieldType,
    requiredness: requiredness as SectionFieldRequiredness,
    options: type === 'radio' && field.type === 'boolean' && !field.options.length ? ['是', '否'] : [...field.options],
    drivers: Array.isArray(field.drivers) ? field.drivers.filter((driver): driver is string => typeof driver === 'string') : undefined,
    locked: field.locked === true,
  };
}

/**
 * 存量表单字段身份补全（2026-11-01）：缺 id/drivers 时按「名称匹配字段位 → 同位置字段位 → F序号」
 * 依次补全，一次性写回；此后管理端改名/排序不会改变既有字段的标识。
 */
function ensureFormIdentity(form: SectionForm): SectionForm {
  const section = form.sectionKey;
  const catalog = section ? fieldsOf(section) : [];
  const byName = new Map(catalog.map((item) => [item.labelZh, item.code]));
  const used = new Set<string>();
  form.fields = form.fields.map((item, index) => {
    if (item.id) {
      used.add(item.id);
      return { ...item, drivers: item.drivers ?? (section ? catalogDriversOf(section, item.id) : []) };
    }
    const candidates = [byName.get(item.name), catalog[index]?.code, `F${index + 1}`];
    const id = candidates.find((code): code is string => Boolean(code) && !used.has(code as string)) ?? `F${index + 1}`;
    used.add(id);
    return { ...item, id, drivers: item.drivers ?? (section ? catalogDriversOf(section, id) : []) };
  });
  return form;
}

function isStoredForm(value: unknown): value is SectionForm {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SectionForm>;
  return typeof item.id === 'string' && typeof item.name === 'string'
    && SECTION_FORM_STATUSES.includes(item.status as SectionFormStatus)
    && typeof item.note === 'string' && Array.isArray(item.fields)
    && item.fields.every((field) => migrateField(field) !== null)
    && typeof item.creator === 'string' && typeof item.createdAt === 'string'
    && typeof item.updater === 'string' && typeof item.updatedAt === 'string';
}

function readLocalForms(): SectionForm[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!Array.isArray(raw) || !raw.length) return [];
    if (!raw.every(isStoredForm)) return [];
    const forms = syncPresetForms(raw.map((form) => ({
      ...form,
      fields: form.fields.map((field) => migrateField(field) as SectionFormField),
    }))).map(ensureFormIdentity);
    return normalizeMasterFields(forms);
  } catch {
    // Storage is optional for this local preview.
    return [];
  }
}

/**
 * 预置行一次性同步（2026-10-30 用户裁决）：存量数据里 7 个预置表单
 * 状态改为已发布、表单设计同步为 xlsx 预置字段（含主数据占位）。
 * 以一次性标记控制，只覆盖一次——此后管理员对预置表单的编辑不再被回滚。
 */
const PRESET_SYNC_FLAG = 'csa-section-forms:preset-published:v1';

function syncPresetForms(forms: SectionForm[]): SectionForm[] {
  let synced = false;
  try { synced = localStorage.getItem(PRESET_SYNC_FLAG) === '1'; } catch { synced = true; }
  if (synced) return forms;
  for (const form of forms) {
    const preset = form.sectionKey ? PRESET_SECTION_FIELDS[form.sectionKey] : undefined;
    if (!preset) continue;
    form.status = 'published';
    form.fields = preset.map((item) => ({ ...item, options: [...item.options] }));
  }
  try {
    localStorage.setItem(PRESET_SYNC_FLAG, '1');
    localStorage.setItem(storageKey, JSON.stringify(forms));
  } catch { /* storage optional */ }
  return forms;
}

/**
 * 主数据口径与字段身份归位（2026-11-01 用户裁决，第二轮修正）：
 * 「功能编号 / 功能名称」在 7 个分区都是主数据占位，基础信息另含 C「功能说明」。
 *
 * **为什么不能按 id 判定**：更早的预置版本把主数据占位的 id 直接写成目录字母（C/D），
 * 目录身份补全就顺着位置把业务字段整体后移——存量数据是
 * 「C 功能编号 / D 功能名称 / E 功能说明 / … / F11 数据处理目的 / F12 数据使用方式」。
 * 这种数据里 `id === 'C'` 指向的是「功能编号」（本来就 locked），`find` 提前命中且无需修改，
 * 功能说明永远补不上标记，界面就一直缺「主数据」徽标。
 *
 * 因此判定顺序改为**名称优先、id / 位置兜底**；同时把字段 id 归位到目录字母——
 * 残缺 id（F11 / F12 这类）会让字段位与填写值（基础信息按 C–L、其余分区按各自的字母区间存储）、
 * 规则映射键 `${section}:${code}` 脱节：填写区读不到已存值，驱动条款也挂不上。
 * 错位是旧预置一次性写入的，7 个分区里都存在，所以归位对全部分区生效。
 *
 * 刻意做成**幂等**（每次读取都跑）而不是一次性迁移：一次性标记一旦置位就再也补不上。
 * 只动 `locked` / `id` / `drivers`，不动名称 / 类型 / 必填规则 / 选项 / 字段顺序。
 */
const FUNCTION_DESCRIPTION_NAMES = ['功能说明', '功能描述'];

/** 名称是否属于「功能说明」口径（含改名后缀兜底） */
function isFunctionDescription(name: string): boolean {
  const text = name.trim();
  return FUNCTION_DESCRIPTION_NAMES.includes(text) || text.includes('功能说明') || text.includes('功能描述');
}

/**
 * 字段身份归位：主数据固定 `MASTER-*`，业务字段按
 * 「目录同名 → 现有合法 id → 目录同位 → F序号」取号（不与已用 id 冲突）。
 * 返回是否有改动。
 */
function reconcileFieldIdentity(section: SectionKey, fields: SectionFormField[]): boolean {
  const catalog = fieldsOf(section);
  const codeByName = new Map(catalog.map((item) => [item.labelZh, item.code]));
  const catalogCodes = new Set(catalog.map((item) => item.code));
  const used = new Set<string>();
  let changed = false;
  fields.forEach((item, index) => {
    const name = item.name.trim();
    const masterId = MASTER_IDS[name];
    const existing = item.id && catalogCodes.has(item.id) ? item.id : undefined;
    const candidates = masterId
      ? [masterId]
      : [codeByName.get(name), existing, catalog[index]?.code, `F${index + 1}`];
    const id = candidates.find((code): code is string => Boolean(code) && !used.has(code as string)) ?? `F${index + 1}`;
    used.add(id);
    const drivers = masterId ? [] : catalogDriversOf(section, id);
    if (item.id !== id) {
      item.id = id;
      item.drivers = drivers;
      changed = true;
    } else if (!item.drivers) {
      item.drivers = drivers;
      changed = true;
    }
  });
  return changed;
}

function normalizeMasterFields(forms: SectionForm[]): SectionForm[] {
  let changed = false;
  for (const form of forms) {
    const section = form.sectionKey;
    if (!section) continue;
    if (reconcileFieldIdentity(section, form.fields)) changed = true;
    // 功能说明只有一个字段位（C）：先精确名，再模糊名，命中的那一个才上主数据标记
    const description = section === 'basicInfo'
      ? (form.fields.find((item) => FUNCTION_DESCRIPTION_NAMES.includes(item.name.trim()))
        ?? form.fields.find((item) => isFunctionDescription(item.name)))
      : undefined;
    for (const item of form.fields) {
      const isMaster = Boolean(MASTER_IDS[item.name.trim()]) || item === description;
      if (isMaster && !item.locked) {
        item.locked = true;
        changed = true;
      }
    }
  }
  // 归位后回写一次，保证 localStorage 与界面口径一致（写失败不影响界面）
  if (changed) {
    try { localStorage.setItem(storageKey, JSON.stringify(forms)); } catch { /* storage optional */ }
  }
  return forms;
}

/** 模块内可变数据源：新建/编辑/复制/删除直接写回这里，并尝试落 localStorage */
const localForms = readLocalForms();
export const sectionForms = reactive<SectionForm[]>(
  localForms.length ? localForms : normalizeMasterFields(seedForms()),
);

export function persistSectionForms(): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(sectionForms));
    return true;
  } catch { return false; }
}

/* ------------------------------------------------------------------ 时序与编号 */

function nowText(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 表单编号：FORM-YYYY-### 当年最大值 +1（服务端定稿后由后端下发） */
export function nextFormNo(records: readonly SectionForm[] = sectionForms): string {
  const year = new Date().getFullYear();
  const prefix = `FORM-${year}-`;
  const serial = (id: string) => (id.startsWith(prefix) ? Number(id.slice(prefix.length)) || 0 : 0);
  const max = records.reduce((acc, item) => Math.max(acc, serial(item.id)), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/* ------------------------------------------------------------------ 查询与开关 */

export function findForm(id: string, records: readonly SectionForm[] = sectionForms): SectionForm | undefined {
  return records.find((form) => form.id === id);
}

/** 启用判定：缺省启用（存量数据无此字段），仅显式 false 视为停用 */
export function isFormEnabled(form: SectionForm): boolean {
  return form.enabled !== false;
}

/** 「是否启用」开关：直接切换并留操作痕迹（updater/updatedAt），不改状态 */
export function setFormEnabled(id: string, enabled: boolean, operator: string): void {
  const form = findForm(id);
  if (!form) return;
  form.enabled = enabled;
  form.updater = operator;
  form.updatedAt = nowText();
  persistSectionForms();
}

/* ------------------------------------------------------------------ 写操作 */

function cloneFields(fields: readonly SectionFormField[]): SectionFormField[] {
  return fields.map((field) => ({ ...field, options: [...field.options] }));
}

/** 新建：恒为草稿；编号留空时自动取号。返回新建的表单 */
export function createForm(input: SectionFormInput, operator: string): SectionForm {
  const id = input.id.trim() || nextFormNo();
  const now = nowText();
  const form: SectionForm = {
    id,
    name: input.name.trim(),
    status: 'draft',
    note: input.note.trim(),
    fields: cloneFields(input.fields),
    enabled: true,
    creator: operator,
    createdAt: now,
    updater: operator,
    updatedAt: now,
  };
  sectionForms.unshift(form);
  persistSectionForms();
  return form;
}

/**
 * 保存编辑（2026-10-30 用户裁决）：已发布编辑保存后**仍为已发布**——
 * 不回退草稿、不升版本号；新建项没有版本号概念，保存即内容生效。
 */
export function updateForm(id: string, input: SectionFormInput, operator: string): SectionForm | null {
  const form = findForm(id);
  if (!form) return null;
  form.name = input.name.trim();
  form.note = input.note.trim();
  form.fields = cloneFields(input.fields);
  form.updater = operator;
  form.updatedAt = nowText();
  persistSectionForms();
  return form;
}

/** 复制：以源表单内容新建一份草稿，编号自动取号 */
export function copyForm(id: string, operator: string): SectionForm | null {
  const source = findForm(id);
  if (!source) return null;
  return createForm(
    { id: nextFormNo(), name: `${source.name} 副本`, note: source.note, fields: source.fields },
    operator,
  );
}

/** 发布：草稿 → 已发布（已发布重复发布为幂等操作） */
export function publishForm(id: string, operator: string): void {
  const form = findForm(id);
  if (!form) return;
  form.status = 'published';
  form.updater = operator;
  form.updatedAt = nowText();
  persistSectionForms();
}

export function deleteForm(id: string): void {
  const index = sectionForms.findIndex((form) => form.id === id);
  if (index < 0) return;
  sectionForms.splice(index, 1);
  persistSectionForms();
}
