/**
 * 匿名化分区（工作簿「匿名化」C–G 五个业务字段）。
 *
 * 真值源（不得自行增删字段或改写提示中的阈值）：
 * - 字段位与字段名 = `产品需求/GB44464_需求文档/GB44464_静态.xlsx`「匿名化」第 3 行表头
 *   （C 是否需匿名化处理 … G 匿名化效果确认），与《产品架构与功能清单》§5.5.2 一致；
 * - 条款 ↔ 字段位 = 同工作簿「需求筛选」!A110:C114：6.6.1.3→C、6.6.2.1.1/6.6.2.1.2→E、
 *   6.6.2.2.1→F、6.6.2.2.2→G；D「匿名化方式」在该映射表中无对应条款，按补充字段处理
 *   （不参与着色与完成度分母）。
 *
 * 本模块不建第二套填写存储：字段值仍写在 `sectionValues` 的匿名化分区里，
 * 记录视图由问卷阶段派生（2026-10-27 用户裁决）。
 */

export const ANONYMIZATION_FIELD_CODES = ['C', 'D', 'E', 'F', 'G'] as const;
export type AnonymizationFieldCode = (typeof ANONYMIZATION_FIELD_CODES)[number];

/** 匿名化方式（C 之外的 D 字段）：工作簿示例「删除画面/降低分辨率/局部轮廓化（高斯模糊/马赛克/色块）」 */
export const ANONYMIZATION_METHODS = ['frame-removal', 'downscale', 'outline', 'other'] as const;
export type AnonymizationMethod = (typeof ANONYMIZATION_METHODS)[number];

/** C/E/G 为「是/否」确认项，不含「待定」：未核验时留空即计入必填未填 */
export const ANONYMIZATION_ANSWERS = ['yes', 'no'] as const;
export type AnonymizationAnswer = (typeof ANONYMIZATION_ANSWERS)[number];

export interface AnonymizationOption {
  code: string;
  labelZh: string;
  labelEn: string;
}

const option = (code: string, labelZh: string, labelEn: string): AnonymizationOption => ({ code, labelZh, labelEn });

/** 「是/否」选项集：C/E/G 共用，表单版本内只能改中英文名，不可增删 */
export const ANONYMIZATION_ANSWER_OPTIONS: readonly AnonymizationOption[] = [
  option('yes', '是', 'Yes'), option('no', '否', 'No'),
];

/** 「匿名化方式」选项集：取工作簿示例的三种方式 + 其他，版本内可增删与改名 */
export const ANONYMIZATION_METHOD_OPTIONS: readonly AnonymizationOption[] = [
  option('frame-removal', '删除画面', 'Remove the frame'),
  option('downscale', '降低分辨率', 'Reduce resolution'),
  option('outline', '局部轮廓化（高斯模糊/马赛克/色块）', 'Local contouring (blur, mosaic, colour blocks)'),
  option('other', '其他', 'Other'),
];

export type AnonymizationWidget = 'select' | 'textarea';

export interface AnonymizationFieldMeta {
  code: AnonymizationFieldCode;
  labelZh: string;
  labelEn: string;
  widget: AnonymizationWidget;
  /** 驱动条款；空数组 = 补充字段（C1 无色，不进完成度分母） */
  drivers: string[];
  /** 填写提示（阈值、判定口径），随字段一起展示，避免填报口径漂移 */
  hintZh: string;
  hintEn: string;
}

export const ANONYMIZATION_FIELD_META: readonly AnonymizationFieldMeta[] = [
  {
    code: 'C', labelZh: '是否需匿名化处理', labelEn: 'Anonymization required', widget: 'select',
    drivers: ['6.6.1.3'],
    hintZh: '车外图像或视频需向车外提供前匿名化，或账号删除后需匿名化处理时选「是」。',
    hintEn: 'Select Yes when exterior images or video must be anonymized before leaving the vehicle, or when anonymization is required after account deletion.',
  },
  {
    code: 'D', labelZh: '匿名化方式', labelEn: 'Anonymization method', widget: 'select',
    drivers: [],
    hintZh: '按主要采用的方式选择；采用局部轮廓化时注明高斯模糊、马赛克或色块。',
    hintEn: 'Choose the primary method; for local contouring, state Gaussian blur, mosaic, or colour blocks.',
  },
  {
    code: 'E', labelZh: '匿名化对象标准确认', labelEn: 'Target criteria confirmed', widget: 'select',
    drivers: ['6.6.2.1.1', '6.6.2.1.2'],
    hintZh: '人脸 ≥28 像素、可见面积 >50%、眼鼻嘴清晰；号牌 ≥16 像素、可见面积 >50% 且可识别。两项均满足才选「是」。',
    hintEn: 'Face: ≥28 px, more than 50% visible, eyes/nose/mouth clear. Plate: ≥16 px, more than 50% visible and legible. Select Yes only when both hold.',
  },
  {
    code: 'F', labelZh: '匿名化检出率结论', labelEn: 'Detection rate conclusion', widget: 'textarea',
    drivers: ['6.6.2.2.1'],
    hintZh: '人脸、号牌分别统计（≥90%），R_d = Na/(Na+Nm)，正检遮盖率 ≥50%；不得用整体平均值替代。',
    hintEn: 'Report face and plate separately (≥90%); R_d = Na/(Na+Nm); correct detections need ≥50% coverage. A combined average is not acceptable.',
  },
  {
    code: 'G', labelZh: '匿名化效果确认', labelEn: 'Effect confirmed', widget: 'select',
    drivers: ['6.6.2.2.2'],
    hintZh: '匿名化后经机器识别与人工抽样核对均无法识别为「是」。',
    hintEn: 'Select Yes only when neither automated recognition nor manual sampling can identify the subject after anonymization.',
  },
];

export function anonymizationMeta(code: AnonymizationFieldCode): AnonymizationFieldMeta | undefined {
  return ANONYMIZATION_FIELD_META.find((field) => field.code === code);
}

/** 分区任务状态：由问卷阶段派生，不落库 */
export type AnonymizationStatus = 'pending' | 'filling' | 'reviewing' | 'archived';
export const ANONYMIZATION_STATUSES = ['pending', 'filling', 'reviewing', 'archived'] as const;

/** 只有进入分区填写及之后阶段的问卷才存在匿名化分区任务 */
export const ANONYMIZATION_STATUS_BY_PHASE: Readonly<Record<string, AnonymizationStatus>> = {
  'section-filling': 'filling',
  'section-reviewing': 'reviewing',
  archived: 'archived',
};

export interface AnonymizationRecord {
  /** 分区任务编号，由问卷编号派生（AN-0315） */
  id: string;
  surveyId: string;
  fuliId: string;
  functionName: string;
  /** 填表人（问卷的被指派人） */
  assignee: string;
  owner: string;
  status: AnonymizationStatus;
  updatedAt: string;
  /** 字段位 → 值；空字符串表示尚未填写，不等于不适用 */
  values: Record<string, string>;
  /** 参与字段数（完成度分母，按驱动条款适用性计算） */
  participating: number;
  filled: number;
}

/**
 * 历史分区值的初始值：与基础信息/传感器任务模型同一形态——旧任务值作初始值，
 * 详情页按问卷保存的分区草稿覆盖它。接入真实数据后由后端返回，删除此处。
 */
export const anonymizationSamples: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'S-2026-0307': {
    C: 'yes', D: 'outline', E: 'yes',
    F: '人脸 96.4%（Na=252，Nm=9，R_d=96.6%），号牌 95.1%（Na=214，Nm=11，R_d=95.1%）；正检遮盖率均值 82%。',
    G: 'yes',
  },
  'S-2026-0315': {
    C: 'yes', D: 'frame-removal', E: 'yes',
    F: '人脸 98.2%（Na=276，Nm=5）；号牌不涉及。正检遮盖率均值 91%。',
    G: 'yes',
  },
  'S-2026-0314': {
    C: 'yes', D: 'outline', E: 'yes',
    F: '人脸 91.7%（Na=198，Nm=18，R_d=91.7%）；号牌不涉及。',
  },
  'S-2026-0313': { C: 'yes', D: 'outline' },
};
