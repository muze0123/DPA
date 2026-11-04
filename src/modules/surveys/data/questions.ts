/**
 * 问卷题库（按模板版本的题集）。
 *
 * 题干与判断指引是平台配置数据（05 方案 §2.2：题干不可改，管理员在规则库维护）；
 * 当前为模块内 mock 数据，题干/指引文本待题库接口下发后整体替换，
 * 页面不硬编码题目内容。Q1–Q12 与 GB 44464 条款的触发关系以
 * 项目建设/业务流程与状态机.md §10.2 的项目表达式表为依据。
 *
 * 模板题集（用户裁决 2026-10-26：12/14/18 问模板都存在）：
 * - v1 = Q1–Q12（当前基线）
 * - v2 = v1 + Q13–Q14
 * - v3 = v2 + Q15–Q18
 */

export type SurveyAnswer = 'yes' | 'no' | 'pending';

/** 语义域：跨模板统计与「追加判定维度」扩展的锚点（方案 §2.3） */
export type SemanticDomain =
  | 'notice' | 'consent' | 'collect' | 'store' | 'transfer' | 'delete'
  | 'cross-border' | 'biometric' | 'credential' | 'anonymize' | 'minor'
  | 'automation' | 'third-party' | 'training' | 'important-data' | 'offline';

/** 题库原始条目（只有内容，不含标识） */
interface QuestionSource {
  code: string;
  title: string;
  guide: { basis: string; scenarios: string[]; notApplicable: string };
}

export interface SurveyQuestion extends QuestionSource {
  /** 题目唯一标识（Q1…Q18）：答案按 code 存储，条款表达式一律引用 code（2026-11-01 用户裁决：Q01 稳定标识口径下线） */
  code: string;
  /** 语义域 */
  semanticDomain: SemanticDomain;
  /** 完整题干 */
  title: string;
  guide: {
    /** 法规依据（GB 44464 条款依据） */
    basis: string;
    /** 典型场景 */
    scenarios: string[];
    /** 不适用场景 */
    notApplicable: string;
  };
}

/**
 * 语义域登记表：与题干分离，题干可改、语义不可原地改
 * （改语义 = 新题号，随判定规则修订一并更新，见方案 §5.3）。
 */
const QUESTION_DOMAINS: Record<string, SemanticDomain> = {
  Q1: 'collect',
  Q2: 'notice',
  Q3: 'biometric',
  Q4: 'collect',
  Q5: 'collect',
  Q6: 'third-party',
  Q7: 'store',
  Q8: 'credential',
  Q9: 'transfer',
  Q10: 'anonymize',
  Q11: 'delete',
  Q12: 'cross-border',
  Q13: 'automation',
  Q14: 'minor',
  Q15: 'third-party',
  Q16: 'offline',
  Q17: 'important-data',
  Q18: 'training',
};

function withMeta(list: readonly QuestionSource[]): SurveyQuestion[] {
  return list.map((question) => {
    const domain = QUESTION_DOMAINS[question.code];
    if (!domain) throw new Error(`Question ${question.code} has no semantic domain registration`);
    return { ...question, semanticDomain: domain };
  });
}

const BASE_QUESTIONS: QuestionSource[] = [
  {
    code: 'Q1',
    title: '该功能是否涉及处理汽车数据（包括收集、存储、使用、加工、传输、提供、公开、删除等任一环节）？',
    guide: {
      basis: 'GB 44464 第 6.1/6.2/6.3/6.4/6.7 章：告知、同意、收集、存储、删除等通用要求均以「处理汽车数据」为前提，是触发条款最多的一道判断题。',
      scenarios: [
        '车机收集车辆位置、行驶轨迹并上传云端用于导航或远程查询。',
        '行车记录仪录制影像并保存在本地或云端。',
        '用户通过手机 App 远程查看车辆状态数据。',
      ],
      notApplicable: '功能完全离线且不采集、不生成任何可回溯的数据记录（如纯机械控制功能），方可答「否」。',
    },
  },
  {
    code: 'Q2',
    title: '该功能是否通过车机屏幕、手机 App 等用户界面，向用户展示个人信息处理规则（隐私政策等）？',
    guide: {
      basis: 'GB 44464 第 6.1.4 条：处理者应通过用户可见界面展示个人信息处理规则。',
      scenarios: [
        '车机首次开机引导中展示隐私政策摘要与全文入口。',
        '手机 App 「设置–隐私」页展示个人信息处理规则。',
      ],
      notApplicable: '功能不涉及个人信息处理，或处理规则仅通过车外渠道（如官网）展示而产品界面无任何入口时答「否」。',
    },
  },
  {
    code: 'Q3',
    title: '该功能是否涉及为特定人群或特定数据类型提供专门的处理规则（如儿童信息、生物特征信息的单独规则）？',
    guide: {
      basis: 'GB 44464 第 6.1.5 条：处理敏感类别个人信息或特定人群信息时，应制定专门处理规则。',
      scenarios: [
        '车载人脸识别功能采集人脸特征信息并制定专门的生物特征信息规则。',
        '后排儿童遗留监测功能涉及儿童个人信息。',
      ],
      notApplicable: '仅处理一般车辆运行数据、不涉及敏感类别信息与特定人群信息时答「否」。',
    },
  },
  {
    code: 'Q4',
    title: '该功能是否收集座舱数据以外的敏感个人信息（如精确位置、行踪轨迹、身份證件信息等）？',
    guide: {
      basis: 'GB 44464 第 6.1.6、6.3.2–6.3.4 条：敏感个人信息需逐项记录展示，收集须满足单独告知、最小精度与传感器参数要求。',
      scenarios: [
        '导航功能持续收集精确地理位置与行踪轨迹。',
        '身份认证功能收集驾驶员身份证件信息。',
      ],
      notApplicable: '仅处理车辆工况数据（车速、电量等）且无位置、轨迹类敏感信息时答「否」。',
    },
  },
  {
    code: 'Q5',
    title: '该功能是否包含车外拍摄或录像能力（摄像头采集车辆周边环境数据）？',
    guide: {
      basis: 'GB 44464 第 6.1.2、6.2.1.1、6.2.3、6.4.2、6.6.1.2 条：车外拍摄数据涉及告知同意、存储加密与出车传输保密等要求。',
      scenarios: [
        '全景影像/行车记录仪采集车外视频。',
        '自动泊车功能使用环视摄像头识别车位线。',
      ],
      notApplicable: '功能不使用任何朝向车外的摄像头（仅车内摄像头或无摄像头）时答「否」。',
    },
  },
  {
    code: 'Q6',
    title: '该功能是否涉及委托供应商或第三方处理个人信息（供应商代表处理者处理数据）？',
    guide: {
      basis: 'GB 44464 第 6.2.1.2 条：委托处理须逐接收方核实委托关系并取得功能级单独同意。',
      scenarios: [
        '语音助手由第三方供应商提供语义识别服务并接触语音数据。',
        '代客泊车功能由供应商云端处理车辆感知数据。',
      ],
      notApplicable: '全部数据处理均在自有系统内完成、无外部受托方时答「否」。注意：答「否」不等于供应商条款自动不适用，须在匹配确认阶段复核。',
    },
  },
  {
    code: 'Q7',
    title: '该功能是否将个人信息或重要数据存储在车外（云端服务器、远程平台等）？',
    guide: {
      basis: 'GB 44464 第 6.4.3、6.5.1 条：车外存储须明确存储位置并保障远程访问的鉴别方式。',
      scenarios: [
        '行驶轨迹数据上传云端保存 30 天。',
        '远程车控指令记录存储在车企云平台。',
      ],
      notApplicable: '数据仅在车端本地存储、不出车且远程不可访问时答「否」。',
    },
  },
  {
    code: 'Q8',
    title: '该功能是否涉及用户账号口令/密码的设置或使用？',
    guide: {
      basis: 'GB 44464 第 6.5.2 条：口令输入时应隐蔽显示，不得明文展示。',
      scenarios: [
        '车机登录账号需输入密码。',
        '访客模式切换需要车主输入 PIN 码。',
      ],
      notApplicable: '功能通过蓝牙钥匙、人脸等方式鉴权，全程无口令/密码输入时答「否」。',
    },
  },
  {
    code: 'Q9',
    title: '该功能是否存在座舱数据向车外传输（通过联网通道上传数据）？',
    guide: {
      basis: 'GB 44464 第 6.6.1.1、6.6.1.2 条：座舱数据出车须逐通道核查，且传输过程须采取保密措施。',
      scenarios: [
        '语音数据上传云端识别。',
        '车内摄像头数据上传用于疲劳驾驶分析。',
      ],
      notApplicable: '座舱数据仅在车端处理、无任何联网上传通道时答「否」。',
    },
  },
  {
    code: 'Q10',
    title: '车外传输的视频/影像数据是否已做匿名化处理（人脸、车牌可识别性满足标准）？',
    guide: {
      basis: 'GB 44464 第 6.6.1.3、6.6.2 条：车外传输含人脸、车牌的数据须匿名化，可识别性有量化测试要求（如 ≥90% 场景下不可识别）。',
      scenarios: [
        '行车记录上传前对人脸与车牌自动打码。',
        '训练数据回传前经脱敏流水线处理。',
      ],
      notApplicable: '车外传输的数据不含任何视频/影像内容时答「否」，并在匹配确认阶段复核是否触发匿名化条款。',
    },
  },
  {
    code: 'Q11',
    title: '该功能是否提供用户账号注销或个人信息删除的途径？',
    guide: {
      basis: 'GB 44464 第 6.7.4 条：应提供账号删除功能，删除后个人信息按要求处理。',
      scenarios: [
        'App 提供账号注销入口，注销后云端数据删除。',
        '车机提供「清除个人数据」功能。',
      ],
      notApplicable: '功能不涉及用户账号体系且无个人数据留存时答「否」。',
    },
  },
  {
    code: 'Q12',
    title: '该功能是否涉及向境外传输个人信息（数据出境，含境外云端处理与境外接收方）？',
    guide: {
      basis: 'GB 44464 第 6.8 章：数据出境须满足出境安全评估等要求。注意：车辆直接向境外传输任何数据属禁止性风险，答「否」不等于出境条款自动不适用，须逐通道复核。',
      scenarios: [
        '导航地图数据由境外服务商云端提供。',
        '研发数据回传至境外服务器分析。',
      ],
      notApplicable: '所有数据存储与处理均在境内完成、无任何境外接收方时答「否」。',
    },
  },
];

/** v2 新增题（Q13–Q14）：mock 题干，待题库接口替换 */
const V2_EXTRA_QUESTIONS: QuestionSource[] = [
  {
    code: 'Q13',
    title: '该功能是否涉及基于个人信息的自动化决策（如个性化推荐、自动化处置）？',
    guide: {
      basis: '依据 GB 44464 及配套实施要求：自动化决策应保证透明度与结果公平合理，并提供拒绝途径。',
      scenarios: [
        '根据驾驶习惯个性化推送保养服务。',
        '基于用户画像自动调整内容推荐。',
      ],
      notApplicable: '功能输出与个人身份无关的通用结果时答「否」。',
    },
  },
  {
    code: 'Q14',
    title: '该功能是否涉及处理不满十四周岁未成年人的个人信息？',
    guide: {
      basis: '依据 GB 44464 及个人信息保护要求：处理未成年人信息须取得监护人单独同意并制定专门规则。',
      scenarios: [
        '儿童模式采集儿童语音指令。',
        '后排儿童监测功能留存儿童影像。',
      ],
      notApplicable: '功能明确不面向儿童且不采集可识别儿童的信息时答「否」。',
    },
  },
];

/** v3 新增题（Q15–Q18）：mock 题干，待题库接口替换 */
const V3_EXTRA_QUESTIONS: QuestionSource[] = [
  {
    code: 'Q15',
    title: '该功能是否集成第三方 SDK 或组件处理个人信息？',
    guide: {
      basis: '依据 GB 44464 配套实施要求：集成第三方 SDK 须逐项登记其数据处理行为并纳入告知同意范围。',
      scenarios: [
        '集成第三方地图 SDK 采集位置信息。',
        '语音能力由第三方 SDK 提供。',
      ],
      notApplicable: '全部代码组件自研或开源组件无数据处理行为时答「否」。',
    },
  },
  {
    code: 'Q16',
    title: '该功能是否支持完全离线运行（不联网即可完成基本功能）？',
    guide: {
      basis: '依据 GB 44464 配套实施要求：离线能力影响收集必要性与传输条款的适用判定。',
      scenarios: [
        '本地语音识别，断网可用。',
        '离线地图导航。',
      ],
      notApplicable: '基本功能依赖联网通道，断网即不可用时答「否」。',
    },
  },
  {
    code: 'Q17',
    title: '该功能是否涉及重要数据的处理（如敏感区域地理信息、车流量等可能危害国家安全的数据）？',
    guide: {
      basis: '依据 GB 44464 第 3 章及配套要求：重要数据处理须满足出境评估、安全报告等更严格要求。',
      scenarios: [
        '采集军事管理区周边地理信息。',
        '统计并对外提供区域车流量数据。',
      ],
      notApplicable: '仅处理个人信息与车辆工况数据、不涉及重要数据目录所列类型时答「否」。',
    },
  },
  {
    code: 'Q18',
    title: '该功能是否将用户数据回传用于算法训练或产品改进？',
    guide: {
      basis: '依据 GB 44464 配套实施要求：训练数据回传须单独告知同意并做匿名化/最小化处理。',
      scenarios: [
        '语音数据回传用于识别模型训练。',
        '驾驶行为数据用于改进驾驶策略。',
      ],
      notApplicable: '数据仅用于向用户提供功能本身、不用于训练或改进时答「否」。',
    },
  },
];

/** 已发布模板版本 → 题集。与 templates.ts 的目录版本一一对应 */
export const QUESTION_SETS: Record<string, readonly SurveyQuestion[]> = {
  v1: withMeta(BASE_QUESTIONS),
  v2: withMeta([...BASE_QUESTIONS, ...V2_EXTRA_QUESTIONS]),
  v3: withMeta([...BASE_QUESTIONS, ...V2_EXTRA_QUESTIONS, ...V3_EXTRA_QUESTIONS]),
};

/** 全量题库（18 题，含未纳入任何模板的题；code 唯一） */
export const QUESTION_BANK: readonly SurveyQuestion[] = QUESTION_SETS.v3;

const BANK_CODES = new Set(QUESTION_BANK.map((question) => question.code));

/** 题库中是否存在该题号（表达式校验/判定参与口径用） */
export function isKnownCode(code: string): boolean {
  return BANK_CODES.has(code);
}

/** 语义域查询（跨模板覆盖度与统计口径） */
export function domainOf(code: string): SemanticDomain | undefined {
  return QUESTION_BANK.find((question) => question.code === code)?.semanticDomain;
}

/** 默认题集版本：无创建快照的历史问卷按 v1 处理（mock 口径，接入快照接口后由数据决定） */
export const DEFAULT_QUESTION_VERSION = 'v1';

export function questionsForVersion(version?: string): SurveyQuestion[] {
  return [...(QUESTION_SETS[version ?? DEFAULT_QUESTION_VERSION] ?? QUESTION_SETS[DEFAULT_QUESTION_VERSION])];
}

/** 当前版本题集的题目键列表（作答校验与答案存储的 key 顺序来源） */
export function questionCodes(version?: string): string[] {
  return questionsForVersion(version).map((question) => question.code);
}
