/**
 * 数据类型分析（标准层解读视图）。口径 = 业务真值源工作簿
 * `产品需求/GB44464_需求文档/GB44464_静态.xlsx` 的「数据类型分析」工作表（2026-10-28 用户裁决）。
 *
 * 两张互相咬合的表，不可互相推导，故并列维护：
 * 1) 类型视角（15 个正式类型）：某类数据被哪些条款约束。`clauses` 是**语义闭包**——
 *    含有包含关系的条款也计入（例如「人脸」同时出现在 6.6.1.3 车外图像条款下）；
 *    「关联问题/问题描述」逐字对齐业务表（题号为业务表口径，如 Q5=敏感个人信息、Q7=生物特征）。
 * 2) 条款视角（38 行，与第 6 章条款一一对应）：每条条款涉及什么数据对象、关注点是什么。
 *    `kinds` 是**主归类**——每条只挂它的主题类型，不展开包含关系；6.2.5.1/6.3.3/6.3.4/6.8
 *    按业务表附块「未明确涉及特定数据类型」处理（kinds 为空）。
 *
 * 题号双轨说明（历史教训）：业务表题号与平台题库「同号不同义」（业务 Q5=敏感个人信息，
 * 平台 Q5=车外拍摄）。`code/label` 是业务表原文（仅供展示与对表），`ref` 是该题在平台
 * 题库中的实现题（问卷联动判定用它解析 qid）；平台题库无对应题时 ref 省略，联动标「无题覆盖」。
 *
 * 本文件只存 code 与原文；类型名走 i18n（`standard.dataTypes.names.<code>`），
 * 定义/问题描述属业务表原文，与条文原文同性质，不翻译。
 */
import { clauseByNo } from '../../surveys/data/matching';

/** 数据类型目录：15 个正式类型 + `sensor`（仅出现在条款明细的补充归类，不成条目） */
export type DataTypeCode =
  | 'personal-info' | 'sensitive-pi' | 'important-data' | 'biometric' | 'location'
  | 'cabin' | 'exterior-image' | 'face' | 'plate' | 'exterior-personal' | 'minor'
  | 'account' | 'credential' | 'permission' | 'vehicle-data' | 'sensor';

/** 判定题引用：业务表原文（code/label/coverage）+ 平台题库实现题（ref，问卷联动判定用） */
export interface DataTypeQuestionRef {
  /** 业务表关联问题题号（展示与对表用） */
  code: string;
  /** 业务表问题描述原文（展示用） */
  label: string;
  /** 覆盖口径：业务表未标注 = direct；仅重要数据标注「已纳入」= partial */
  coverage: 'direct' | 'partial';
  /** 平台题库实现题题号（联动判定解析 qid 用）；平台无对应题时省略 */
  ref?: string;
}

export interface DataTypeDef {
  code: DataTypeCode;
  /** 定义（业务表原文） */
  definition: string;
  /** 问卷落点说明（无判定题时兼作问题描述列的展示文案） */
  note: string;
  /** 涉及条款（语义闭包，逐字对齐业务表「涉及条款」列） */
  clauses: readonly string[];
  /** 关联问题（逐字对齐业务表）；空数组 = 业务表「无直接对应问题」 */
  questions: readonly DataTypeQuestionRef[];
  /** 是否为独立数据类型条目 */
  formal: boolean;
}

/**
 * 类型目录，逐行对齐业务表「数据类型分析」工作表 A2:E16。
 * `ref` 为平台题库实现题：业务 Q1→平台 Q1、业务 Q4(位置/座舱/重要/权限)按语义分别落
 * Q4(位置)/Q17(重要数据)/无(座舱采集、权限)、业务 Q10(车外影像出车)→Q5(车外拍摄)、
 * 业务 Q3(未成年人)→Q14、业务 Q11(账号功能)→Q11、业务 Q8(口令)→Q8。
 */
export const DATA_TYPES: readonly DataTypeDef[] = [
  {
    code: 'personal-info',
    definition: '个人基本信息（姓名、电话、住址等）及附录 A 表 A.1 列出的所有类别。',
    note: '由「是否处理个人信息」一题判定，是适用范围最广的类型。',
    clauses: [
      '6.1.1', '6.1.2', '6.1.3', '6.1.4', '6.2.1.1', '6.2.1.2', '6.2.2', '6.2.3', '6.2.4.1', '6.2.4.2',
      '6.2.5.2', '6.3.1', '6.3.2', '6.3.5', '6.3.6', '6.3.7', '6.4.1', '6.7.1', '6.7.2', '6.7.4',
    ],
    questions: [{ code: 'Q1', label: '是否处理个人信息', coverage: 'direct', ref: 'Q1' }],
    formal: true,
  },
  {
    code: 'sensitive-pi',
    definition: '附录 A 表 A.2 所列类别：生物特征、行踪轨迹、金融账户、健康信息、未成年人信息等。',
    note: '由「是否处理敏感个人信息」一题判定。',
    clauses: ['6.1.2', '6.2.1.1', '6.2.3', '6.3.2', '6.4.2', '6.6.1.2'],
    questions: [{ code: 'Q5', label: '是否处理敏感个人信息', coverage: 'direct', ref: 'Q4' }],
    formal: true,
  },
  {
    code: 'important-data',
    definition: '一旦泄露可能危害国家安全、经济运行或公共利益的数据。',
    note: '业务表将其纳入「位置信息/座舱内数据/重要数据」一题，部分覆盖；平台题库另有重要数据专门题用于联动判定。',
    clauses: ['6.4.2', '6.6.1.2'],
    questions: [{ code: 'Q4', label: '已纳入Q4（位置信息/座舱内数据/重要数据）', coverage: 'partial', ref: 'Q17' }],
    formal: true,
  },
  {
    code: 'biometric',
    definition: '人脸、指纹、虹膜、声纹等用于身份识别的生物特征信息。',
    note: '由「是否收集/使用/向车外传输生物特征识别信息」一题判定；平台题库暂无该题的落地实现。',
    clauses: ['6.4.3', '6.5.1'],
    questions: [{ code: 'Q7', label: '是否收集/使用/向车外传输生物特征识别信息', coverage: 'direct' }],
    formal: true,
  },
  {
    code: 'location',
    definition: 'GPS 坐标、行车轨迹、目的地等地理位置数据。',
    note: '由「是否采集位置信息或座舱内数据」一题判定，题干已明确含精确位置与行踪轨迹。',
    clauses: ['6.3.2', '6.6.1.2'],
    questions: [{ code: 'Q4', label: '是否采集位置信息或座舱内数据', coverage: 'direct', ref: 'Q4' }],
    formal: true,
  },
  {
    code: 'cabin',
    definition: '通过摄像头、传声器、传感器在座舱内采集的数据。',
    note: '由「是否采集位置信息或座舱内数据」一题判定；平台题库暂无覆盖座舱内数据采集的落地实现。',
    clauses: ['6.3.2', '6.6.1.1'],
    questions: [{ code: 'Q4', label: '是否采集位置信息或座舱内数据', coverage: 'direct' }],
    formal: true,
  },
  {
    code: 'exterior-image',
    definition: '车外摄像头采集的、可能含人脸或车牌的图像或视频。',
    note: '由「是否涉及车外的图像/视频且向车外提供」一题判定，是匿名化要求的前置条件。',
    clauses: ['6.6.1.3', '6.6.2.1.1', '6.6.2.1.2', '6.6.2.2.1', '6.6.2.2.2'],
    questions: [{ code: 'Q10', label: '是否涉及车外的图像/视频且向车外提供', coverage: 'direct', ref: 'Q5' }],
    formal: true,
  },
  {
    code: 'face',
    definition: '图像或视频中可识别自然人身份的面部特征数据。',
    note: '由「是否涉及车外的图像/视频且向车外提供」一题判定。',
    clauses: ['6.6.1.3', '6.6.2.1.1', '6.6.2.2.1', '6.6.2.2.2'],
    questions: [{ code: 'Q10', label: '是否涉及车外的图像/视频且向车外提供', coverage: 'direct', ref: 'Q5' }],
    formal: true,
  },
  {
    code: 'plate',
    definition: '图像或视频中可识别的机动车号牌信息。',
    note: '与「人脸」同源，由「是否涉及车外的图像/视频且向车外提供」一题判定。',
    clauses: ['6.6.1.3', '6.6.2.1.2', '6.6.2.2.1', '6.6.2.2.2'],
    questions: [{ code: 'Q10', label: '是否涉及车外的图像/视频且向车外提供', coverage: 'direct', ref: 'Q5' }],
    formal: true,
  },
  {
    code: 'exterior-personal',
    definition: '车外场景中采集或涉及的非车主个人信息。',
    note: '并入「是否涉及车外的图像/视频且向车外提供」一题判定，无独立题。',
    clauses: ['6.2.2', '6.6.1.3'],
    questions: [{ code: 'Q10', label: '是否涉及车外的图像/视频且向车外提供', coverage: 'direct', ref: 'Q5' }],
    formal: true,
  },
  {
    code: 'minor',
    definition: '不满十四周岁未成年人的个人信息。',
    note: '由「是否处理不满14周岁未成年人个人信息」一题判定。',
    clauses: ['6.1.5'],
    questions: [{ code: 'Q3', label: '是否处理不满14周岁未成年人个人信息', coverage: 'direct', ref: 'Q14' }],
    formal: true,
  },
  {
    code: 'account',
    definition: '账号 ID、昵称、密码等账号相关数据。',
    note: '由「是否提供账号注册/登录/管理功能」一题判定。',
    clauses: ['6.7.4'],
    questions: [{ code: 'Q11', label: '是否提供账号注册/登录/管理功能', coverage: 'direct', ref: 'Q11' }],
    formal: true,
  },
  {
    code: 'credential',
    definition: '用于身份鉴别的字符序列（PIN、登录口令、支付口令等）。',
    note: '由「是否涉及口令/密码/PIN的输入、存储或处理」一题判定，口径最清晰的一类。',
    clauses: ['6.5.2'],
    questions: [{ code: 'Q8', label: '是否涉及口令/密码/PIN的输入、存储或处理', coverage: 'direct', ref: 'Q8' }],
    formal: true,
  },
  {
    code: 'permission',
    definition: '摄像头、位置、传声器等功能调用权限。',
    note: '由「是否采集位置信息或座舱内数据」一题判定；平台题库暂无权限调用类的落地实现。',
    clauses: ['6.1.6', '6.2.3', '6.3.5'],
    questions: [{ code: 'Q4', label: '是否采集位置信息或座舱内数据', coverage: 'direct' }],
    formal: true,
  },
  {
    code: 'vehicle-data',
    definition: '汽车设计、生产、使用过程中产生或采集的数据。',
    note: '该数据类型未在问卷中独立设问，由其他问题间接覆盖。',
    clauses: ['6.7.3'],
    questions: [],
    formal: true,
  },
  {
    code: 'sensor',
    definition: '摄像头、激光雷达、4D 毫米波雷达等感知设备及其精度参数。',
    note: '不是独立数据类型条目，仅作为 6.3.3、6.3.4 的归类标签出现。',
    clauses: ['6.3.3', '6.3.4'],
    questions: [],
    formal: false,
  },
];

/** 独立类型条目（类型视图的表格数据源） */
export const FORMAL_DATA_TYPES: readonly DataTypeDef[] = DATA_TYPES.filter((item) => item.formal);

export const DATA_TYPE_BY_CODE = new Map<DataTypeCode, DataTypeDef>(DATA_TYPES.map((item) => [item.code, item]));

/** 条款视角的一行（对应「条款 / 涉及对象·数据 / 数据类型归类 / 条款关注点」四列） */
export interface DataTypeClauseRow {
  no: string;
  /** 涉及对象或数据（标准分析原文） */
  subject: string;
  /** 主归类（规范化 code；空 = 该条款不指向具体数据类型） */
  kinds: readonly DataTypeCode[];
  /** 条款关注点（标准分析原文） */
  focus: string;
}

/**
 * 38 行条款明细，行序与 `CLAUSES` 一致。
 * 判定题不进本表——由 `clauseQuestions()` 从条款目录的初筛表达式派生，避免两处维护。
 */
export const DATA_TYPE_CLAUSES: readonly DataTypeClauseRow[] = [
  { no: '6.1.1', subject: '个人信息（所有类别）', kinds: ['personal-info'], focus: '最小必要原则' },
  { no: '6.1.2', subject: '个人信息、敏感个人信息', kinds: ['personal-info', 'sensitive-pi'], focus: '告知义务与内容' },
  { no: '6.1.3', subject: '个人信息', kinds: ['personal-info'], focus: '告知内容变更时更新' },
  { no: '6.1.4', subject: '应用下载平台信息（运营者名称、联系方式、权限）', kinds: ['personal-info'], focus: '应用分发平台的信息展示' },
  { no: '6.1.5', subject: '不满 14 周岁未成年人个人信息', kinds: ['minor'], focus: '专门处理规则' },
  { no: '6.1.6', subject: '摄像头、位置、传声器调用情况', kinds: ['permission'], focus: '权限调用记录与展示' },
  { no: '6.2.1.1', subject: '个人信息、敏感个人信息', kinds: ['personal-info', 'sensitive-pi'], focus: '同意与单独同意' },
  { no: '6.2.1.2', subject: '个人信息（向第三方提供）', kinds: ['personal-info'], focus: '第三方提供的单独同意' },
  { no: '6.2.2', subject: '个人信息（例外情形）', kinds: ['personal-info'], focus: '不需取得同意的例外' },
  { no: '6.2.3', subject: '个人信息（同意、拒绝选项）', kinds: ['personal-info'], focus: '同意与拒绝选项设置' },
  { no: '6.2.4.1', subject: '个人信息', kinds: ['personal-info'], focus: '同意期限内处理' },
  { no: '6.2.4.2', subject: '个人信息', kinds: ['personal-info'], focus: '目的或方式变化时重新同意' },
  { no: '6.2.5.1', subject: '—', kinds: [], focus: '撤回同意途径（流程要求）' },
  { no: '6.2.5.2', subject: '个人信息', kinds: ['personal-info'], focus: '撤回不影响此前处理' },
  { no: '6.3.1', subject: '个人信息', kinds: ['personal-info'], focus: '默认不收集' },
  { no: '6.3.2', subject: '位置信息、座舱数据中的敏感个人信息', kinds: ['location', 'sensitive-pi'], focus: '收集状态提示（浮窗、弹窗、提示音等）' },
  { no: '6.3.3', subject: '摄像头、激光雷达、4D 毫米波雷达', kinds: ['sensor'], focus: '覆盖范围、分辨率等精度参数' },
  { no: '6.3.4', subject: '同一设备上的多个传感器', kinds: ['sensor'], focus: '多功能时至少一个符合精度要求' },
  { no: '6.3.5', subject: '摄像头、位置、传声器权限', kinds: ['permission'], focus: '无功能时不应调权限' },
  { no: '6.3.6', subject: 'VIN（仅车内处理的功能）', kinds: ['personal-info'], focus: '不得拒绝基本功能' },
  { no: '6.3.7', subject: '个人信息', kinds: ['personal-info'], focus: '不超出同意范围收集' },
  { no: '6.4.1', subject: '个人信息', kinds: ['personal-info'], focus: '存储期限与同意一致' },
  { no: '6.4.2', subject: '车内的敏感个人信息、重要数据', kinds: ['sensitive-pi', 'important-data'], focus: '加密等安全保护' },
  { no: '6.4.3', subject: '车内的生物特征识别信息', kinds: ['biometric'], focus: '仅存储于车内' },
  { no: '6.5.1', subject: '生物特征识别信息', kinds: ['biometric'], focus: '提供非生物特征替代方式' },
  { no: '6.5.2', subject: '支付口令、登录口令', kinds: ['credential'], focus: '输入与显示时隐藏' },
  { no: '6.6.1.1', subject: '座舱数据（向车外提供）', kinds: ['cabin'], focus: '不应向车外提供座舱数据' },
  { no: '6.6.1.2', subject: '向车外发送的敏感个人信息、重要数据', kinds: ['sensitive-pi', 'important-data'], focus: '保密性保护措施' },
  { no: '6.6.1.3', subject: '车外图像、视频（人脸、车牌）', kinds: ['exterior-image'], focus: '车端匿名化处理' },
  { no: '6.6.2.1.1', subject: '图像或视频中的人脸目标', kinds: ['face'], focus: '匿名化对象（人脸）' },
  { no: '6.6.2.1.2', subject: '图像或视频中的汽车号牌目标', kinds: ['plate'], focus: '匿名化对象（号牌）' },
  { no: '6.6.2.2.1', subject: '人脸目标、汽车号牌目标', kinds: ['face', 'plate'], focus: '检出率不低于 90%' },
  { no: '6.6.2.2.2', subject: '已匿名化的人脸、号牌', kinds: ['face', 'plate'], focus: '匿名化后不可识别' },
  { no: '6.7.1', subject: '车端个人信息', kinds: ['personal-info'], focus: '提供删除途径' },
  { no: '6.7.2', subject: '个人信息', kinds: ['personal-info'], focus: '主动删除要求' },
  { no: '6.7.3', subject: '已被删除的汽车数据', kinds: ['vehicle-data'], focus: '不可检索、不可访问' },
  { no: '6.7.4', subject: '账号数据（含个人信息）', kinds: ['account'], focus: '提供本地删除账号功能' },
  // 6.8 按业务表附块归入「未明确涉及特定数据类型」（与 UNTYPED_CLAUSE_NOS 同口径）
  { no: '6.8', subject: '境内生成的数据', kinds: [], focus: '不应直接向境外传输' },
];

/** 不指向具体数据类型的条款（流程要求、设备参数要求、行为禁令） */
export const UNTYPED_CLAUSE_NOS: readonly string[] = ['6.2.5.1', '6.3.3', '6.3.4', '6.8'];

/** 条款的判定题（取自条款目录的初筛表达式命中题，故与问卷侧恒一致） */
export function clauseQuestions(no: string): string[] {
  try {
    return [...clauseByNo(no).hits];
  } catch {
    return [];
  }
}

/**
 * 某类型的「条款数据明细」行（2026-10-28）：以主表「涉及条款」为索引，取详表中条款号命中的行。
 *
 * 为什么按条款号关联、而不是按归类过滤：主表「涉及条款」是语义闭包（含包含关系，例如「人脸」
 * 也计入 6.6.1.3 车外图像条款），详表「数据类型归类」是每条条款的主归类；两者口径不同。
 * 「车外个人信息」这类只在主表登记、未在详表归类中出现的类型，按归类过滤会查到 0 行，
 * 与主表「涉及条款」自相矛盾。按条款号关联可保证：弹窗行数 = 主表「涉及条款」条数。
 */
export function clauseDetailRowsOf(code: DataTypeCode): DataTypeClauseRow[] {
  const def = DATA_TYPE_BY_CODE.get(code);
  if (!def) return [];
  const nos = new Set(def.clauses);
  return DATA_TYPE_CLAUSES.filter((row) => nos.has(row.no));
}
