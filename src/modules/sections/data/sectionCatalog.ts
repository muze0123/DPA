/**
 * 填写分区（S4）字段目录 —— 6 分区 54 业务字段的唯一口径。
 *
 * 真值源（不得自行增删）：
 * - 字段名与列位 = `产品需求/GB44464_需求文档/GB44464_静态.xlsx`「功能清单」表头
 *   （功能说明 → 状态恢复/变更方法说明 共 50 列）+ v1 工作簿分区列位快照（C–Z 等）；
 * - 条款 ↔ 分区 ↔ 字段位 = 同工作簿「需求筛选」!A77:C114 映射表；
 * - 分区规模 = 05 页面设计方案 §4.1：基础信息 10 · 告知与同意 24 · 数据传输 5 ·
 *   传感器 4 · 生物特征与口令 6 · 匿名化 5 = 54（条款驱动的六分区，口径锚点）。
 *
 * 第七个分区「通用材料」（2026-10-27 用户裁决）不来自「需求筛选」映射，而取自
 * 同工作簿「通用材料」工作表 C–E 列：需提供的测试材料清单 / 状态恢复、变更方法说明 / 备注。
 * 三列没有驱动条款，按 `alwaysCounted` 恒参与完成度（备注为选填，`optional` 无色不计分母），
 * 因此 54 字段口径不受影响，两套分母并列呈现。
 *
 * `carried` = 该字段是否已被对应分区任务的数据模型承载（现有页面可填）。
 * 未承载字段只参与口径展示，不计入完成度分母（避免无法填写的死结）；
 * 接入真实后端或页面补齐后改为 true 即可。
 */

import { ANONYMIZATION_FIELD_META } from './anonymization';

export type SectionKey =
  | 'basicInfo' | 'consent' | 'transmission' | 'sensors' | 'biometric' | 'anonymization'
  /** 通用材料：功能级（跨问卷复用），非条款驱动 */
  | 'materials';

export type FieldKind = 'text' | 'long' | 'boolean' | 'select';

/** 生物特征类型枚举（工作簿「生物特征与口令」C 列取值：人脸/指纹/声纹/虹膜/掌纹） */
export const BIOMETRIC_TYPE_CODES = ['face', 'fingerprint', 'voiceprint', 'iris', 'palm'] as const;
export type BiometricTypeCode = typeof BIOMETRIC_TYPE_CODES[number];

export interface CatalogField {
  section: SectionKey;
  /** 分区内字段位（工作簿列位字母） */
  code: string;
  labelZh: string;
  labelEn: string;
  kind: FieldKind;
  /** 驱动条款号（1–3 个）；空数组 = 补充字段（C1 无色，不参与完成度） */
  drivers: string[];
  /** 是否已被当前分区任务的字段模型承载 */
  carried: boolean;
  /** 填写提示（阈值/判定口径），随字段一起展示；无则为空 */
  hintZh?: string;
  hintEn?: string;
  /**
   * 非条款驱动字段恒参与完成度：有值即白、无值即黄。
   * 仅用于「通用材料」——工作簿该表没有条款映射，但三列是必交的测试输入。
   */
  alwaysCounted?: boolean;
  /** 选填字段：无色、不计完成度分母（如通用材料的「备注」） */
  optional?: boolean;
  /** 单字段长度上限；缺省 500（通用材料的材料清单为分行列举，上限 1000） */
  maxLength?: number;
  /**
   * 表单配置的选项文案（2026-11-01 接线）：仅运行时字段（`sectionRuntime`）会带，
   * 目录字段的选项域由各分区页按字段位硬编码；页面在硬编码选项为空时回退到这里。
   */
  formOptions?: string[];
}

export interface SectionDef {
  key: SectionKey;
  /** 05 §4.1 分区页签顺序 */
  order: number;
  fieldCount: number;
  /** 非条款驱动分区（无「需求筛选」映射）：字段按是否已填着色，不读条款适用性 */
  driverless?: boolean;
  /** 分区触发说明（原型「填写分区」分区头 note，依据 v1 题集 Q 编号归纳）；无则为空 */
  triggerZh?: string;
  triggerEn?: string;
}

export const SECTION_DEFS: readonly SectionDef[] = [
  {
    key: 'basicInfo', order: 1, fieldCount: 10,
    triggerZh: '触发：处理个人信息的功能均需填写（Q1=是）',
    triggerEn: 'Trigger: required for every function processing personal information (Q1 = Yes)',
  },
  {
    key: 'consent', order: 2, fieldCount: 24,
    triggerZh: '触发：Q1=是（个人信息告知同意）',
    triggerEn: 'Trigger: Q1 = Yes (personal information notice & consent)',
  },
  {
    key: 'transmission', order: 3, fieldCount: 5,
    triggerZh: '触发：Q9=是（数据传输至车外）或 Q12=是（涉及出境）',
    triggerEn: 'Trigger: Q9 = Yes (data transferred off-board) or Q12 = Yes (cross-border transfer)',
  },
  {
    key: 'sensors', order: 4, fieldCount: 4,
    triggerZh: '触发：Q4=是（采集位置信息/座舱内数据等）',
    triggerEn: 'Trigger: Q4 = Yes (location or in-cabin data collected)',
  },
  {
    key: 'biometric', order: 5, fieldCount: 6,
    triggerZh: '触发：Q7=是（生物特征）或 Q8=是（口令）',
    triggerEn: 'Trigger: Q7 = Yes (biometrics) or Q8 = Yes (passcodes)',
  },
  {
    key: 'anonymization', order: 6, fieldCount: 5,
    triggerZh: '触发：Q10=是（车外图像/视频匿名化）或 Q11=是（账号删除）',
    triggerEn: 'Trigger: Q10 = Yes (off-board image/video anonymization) or Q11 = Yes (account deletion)',
  },
  { key: 'materials', order: 7, fieldCount: 3, driverless: true },
];

export const SECTION_KEYS: readonly SectionKey[] = SECTION_DEFS.map((section) => section.key);

/** 条款驱动的六分区（54 字段口径的锚点；不含通用材料） */
export const CLAUSE_SECTION_KEYS: readonly SectionKey[] = SECTION_KEYS.filter((key) => key !== 'materials');

/** 全部字段位（条款驱动 54 + 通用材料 3）；两套分母不得相加换算 */
export const SECTION_FIELD_TOTAL = SECTION_DEFS.reduce((total, section) => total + section.fieldCount, 0);

const basic = (code: string, labelZh: string, labelEn: string, kind: FieldKind, drivers: string[]): CatalogField => (
  { section: 'basicInfo', code, labelZh, labelEn, kind, drivers, carried: true }
);

const consentField = (code: string, labelZh: string, labelEn: string, kind: FieldKind, drivers: string[]): CatalogField => (
  { section: 'consent', code, labelZh, labelEn, kind, drivers, carried: true }
);

/**
 * 基础信息 C–L（10）：驱动条款与 basicInfoVersions 的字段定义一致。
 * C「功能说明」= 封面主数据字段（方案 A，2026-10-27）：只读引用功能台账「功能描述」、
 * 随问卷创建快照带入，不参与分区内填写；无驱动条款，本就不计入完成度分母。
 */
const BASIC_FIELDS: readonly CatalogField[] = [
  basic('C', '功能说明', 'Function description', 'text', []),
  basic('D', '功能分类', 'Function category', 'select', ['6.3.6']),
  basic('E', '涉及数据类型', 'Data types involved', 'text', ['6.1.1', '6.3.5', '6.3.7']),
  basic('F', '数据收集方式', 'Collection method', 'select', ['6.3.1']),
  basic('G', '数据收集时机', 'Collection timing', 'select', []),
  basic('H', '数据收集位置', 'Collection location', 'select', ['6.1.6']),
  basic('I', '数据存储位置', 'Storage location', 'select', ['6.4.2']),
  basic('J', '存储期限', 'Retention period', 'text', ['6.4.1']),
  basic('K', '数据处理目的', 'Processing purpose', 'long', []),
  basic('L', '数据使用方式', 'How data is used', 'select', []),
];

/** 告知与同意 C–Z（24）：驱动条款取自工作簿「需求筛选」映射表 */
const CONSENT_FIELDS: readonly CatalogField[] = [
  consentField('C', '告知方式', 'Notice method', 'text', ['6.1.2', '6.1.3']),
  consentField('D', '同意获取方式', 'Consent acquisition', 'text', ['6.2.3']),
  consentField('E', '是否需单独同意', 'Separate consent required', 'boolean', ['6.2.1.1', '6.2.4.2']),
  consentField('F', '同意期限及规则', 'Consent validity', 'text', ['6.2.4.1']),
  consentField('G', '是否提供撤回同意途径', 'Withdrawal channel provided', 'boolean', ['6.2.5.1', '6.2.5.2']),
  consentField('H', '撤回同意方式', 'Withdrawal method', 'text', []),
  consentField('I', '拒绝方式', 'Refusal method', 'text', []),
  consentField('J', '权限调用记录展示方式', 'Permission log display', 'text', []),
  consentField('K', '数据收集提示方式', 'Collection prompt', 'text', []),
  consentField('L', '数据删除途径', 'Deletion channel', 'text', ['6.7.1', '6.7.4']),
  consentField('M', '删除触发条件', 'Deletion trigger', 'text', ['6.7.2']),
  consentField('N', '删除后是否可检索访问', 'Irretrievable after deletion', 'boolean', ['6.7.3']),
  consentField('O', '是否适用个人同意例外', 'Consent exception applies', 'boolean', ['6.2.2']),
  consentField('P', '例外情形类型', 'Exception type', 'text', []),
  consentField('Q', '例外涉及数据类型', 'Exception data types', 'text', []),
  consentField('R', '例外理由说明', 'Exception justification', 'long', []),
  consentField('S', '例外告知说明路径', 'Exception notice path', 'text', []),
  consentField('T', '是否涉及未成年人个人信息', 'Minors involved', 'boolean', ['6.1.5']),
  consentField('U', '是否有未成年人专门规则', 'Minors-specific rules', 'boolean', []),
  consentField('V', '是否涉及应用分发平台', 'App distribution platform', 'boolean', ['6.1.4']),
  consentField('W', '平台运营者信息展示方式', 'Platform operator disclosure', 'text', []),
  consentField('X', '权限调用记录保存期限', 'Permission log retention', 'text', []),
  consentField('Y', '第三方接收方补充信息', 'Recipient supplementary info', 'long', []),
  consentField('Z', '用户画像与精准推送独立拒绝方式', 'Profiling opt-out', 'boolean', []),
];

/** 数据传输（5）：字段名按 §4.2「是否向第三方提供」属于本分区（Q-27 口径） */
const TRANSMISSION_FIELDS: readonly CatalogField[] = [
  { section: 'transmission', code: 'C', labelZh: '数据加密方式', labelEn: 'Encryption method', kind: 'select', drivers: ['6.6.1.1', '6.6.1.2'], carried: true },
  { section: 'transmission', code: 'D', labelZh: '是否涉及境外传输', labelEn: 'Cross-border transfer', kind: 'select', drivers: ['6.8'], carried: true },
  { section: 'transmission', code: 'E', labelZh: '境外传输目的地', labelEn: 'Transfer destination', kind: 'text', drivers: ['6.8'], carried: true },
  { section: 'transmission', code: 'F', labelZh: '是否向第三方提供', labelEn: 'Provided to third parties', kind: 'boolean', drivers: ['6.2.1.2'], carried: false },
  { section: 'transmission', code: 'G', labelZh: '第三方名称及接收目的', labelEn: 'Recipient name & purpose', kind: 'text', drivers: ['6.2.1.2'], carried: false },
];

/** 传感器 D–G（4）：工作簿「需求筛选」6.3.3/6.3.4 均指向「传感器」D3。 */
const SENSOR_FIELDS: readonly CatalogField[] = [
  { section: 'sensors', code: 'D', labelZh: '传感器类型', labelEn: 'Sensor type', kind: 'select', drivers: ['6.3.3', '6.3.4'], carried: true },
  { section: 'sensors', code: 'E', labelZh: '是否至少一个功能符合最小精度要求', labelEn: 'At least one function meets minimum accuracy', kind: 'select', drivers: [], carried: true },
  { section: 'sensors', code: 'F', labelZh: '传感器安装位置', labelEn: 'Installation position', kind: 'text', drivers: [], carried: true },
  { section: 'sensors', code: 'G', labelZh: '传感器对应功能', labelEn: 'Associated function', kind: 'text', drivers: [], carried: true },
];

/**
 * 生物特征与口令（6）：字段名与取值域取自工作簿「生物特征与口令」C–H 列实际表单
 * （= 《产品架构与功能清单》§5.5.2 该分区 6 个业务字段）；
 * 驱动条款：6.4.3 → 生物特征类型/仅存储车内/车外传输，6.5.1 → 非生物识别替代，
 * 6.5.2 → 涉及口令/口令隐藏。
 */
const BIOMETRIC_FIELDS: readonly CatalogField[] = [
  { section: 'biometric', code: 'C', labelZh: '生物特征类型', labelEn: 'Biometric type', kind: 'select', drivers: ['6.4.3'], carried: true },
  { section: 'biometric', code: 'D', labelZh: '是否有非生物识别替代方式', labelEn: 'Non-biometric alternative available', kind: 'boolean', drivers: ['6.5.1'], carried: true },
  { section: 'biometric', code: 'E', labelZh: '是否涉及口令/密码/PIN', labelEn: 'Passcode, password or PIN involved', kind: 'boolean', drivers: ['6.5.2'], carried: true },
  { section: 'biometric', code: 'F', labelZh: '口令输入/显示时是否隐藏', labelEn: 'Passcode masked on input and display', kind: 'boolean', drivers: ['6.5.2'], carried: true },
  { section: 'biometric', code: 'G', labelZh: '生物特征是否仅存储于车内', labelEn: 'Biometrics stored only in the vehicle', kind: 'boolean', drivers: ['6.4.3'], carried: true },
  { section: 'biometric', code: 'H', labelZh: '是否向车外传输生物特征', labelEn: 'Biometrics transmitted off-board', kind: 'boolean', drivers: ['6.4.3'], carried: true },
];

/**
 * 匿名化（5）：按「匿名化」工作表第 3 行表头与「需求筛选」!A110:C114 校正（2026-10-27 用户裁决）——
 * 6.6.1.3→C、6.6.2.1.1/6.6.2.1.2→E、6.6.2.2.1→F、6.6.2.2.2→G；D「匿名化方式」无驱动条款，
 * 因此为补充字段（无色、不计完成度）。字段名与提示统一取自 anonymization.ts 的字段元数据。
 */
const ANONYMIZATION_FIELDS: readonly CatalogField[] = ANONYMIZATION_FIELD_META.map((meta) => ({
  section: 'anonymization',
  code: meta.code,
  labelZh: meta.labelZh,
  labelEn: meta.labelEn,
  kind: meta.widget === 'textarea' ? 'long' : 'select',
  drivers: [...meta.drivers],
  carried: true,
  hintZh: meta.hintZh,
  hintEn: meta.hintEn,
}));

/**
 * 通用材料 C–E（3）：取自工作簿「通用材料」工作表表头（A 功能编号 / B 功能名称为身份列，
 * 由功能台账携带，不再作为分区字段）。三列在「需求筛选」中没有映射，故无驱动条款：
 * C、D 为必交测试输入 → `alwaysCounted`；E 备注选填 → `optional`（无色、不计分母）。
 */
const MATERIAL_FIELDS: readonly CatalogField[] = [
  {
    section: 'materials', code: 'C', labelZh: '需提供的测试材料清单', labelEn: 'Required test materials',
    kind: 'long', drivers: [], carried: true, alwaysCounted: true, maxLength: 1000,
    hintZh: '每行填写一项，如：策略文档、加密方案、APK 包、测试账号。',
    hintEn: 'One item per line, e.g. strategy document, encryption plan, APK package, test account.',
  },
  {
    section: 'materials', code: 'D', labelZh: '状态恢复/变更方法说明', labelEn: 'State restore / change method',
    kind: 'long', drivers: [], carried: true, alwaysCounted: true, maxLength: 1000,
    hintZh: '说明如何恢复或变更功能状态，使同一测试可重复执行。',
    hintEn: 'Describe how to restore or change the function state so the test can be repeated.',
  },
  {
    section: 'materials', code: 'E', labelZh: '备注', labelEn: 'Notes',
    kind: 'long', drivers: [], carried: true, optional: true, maxLength: 1000,
    hintZh: '选填：材料准备或状态恢复的补充说明。',
    hintEn: 'Optional: extra context on preparing materials or restoring state.',
  },
];

export const SECTION_FIELDS: readonly CatalogField[] = [
  ...BASIC_FIELDS, ...CONSENT_FIELDS, ...TRANSMISSION_FIELDS,
  ...SENSOR_FIELDS, ...BIOMETRIC_FIELDS, ...ANONYMIZATION_FIELDS, ...MATERIAL_FIELDS,
];

export function fieldsOf(section: SectionKey): CatalogField[] {
  return SECTION_FIELDS.filter((field) => field.section === section);
}

/** 分区内字段位 → 字段（未承载字段也返回，便于口径展示） */
export function catalogField(section: SectionKey, code: string): CatalogField | undefined {
  return SECTION_FIELDS.find((field) => field.section === section && field.code === code);
}
