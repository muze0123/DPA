/**
 * 安全需求条目目录（RequirementItem，v1 模板 64 条）。
 *
 * 来源与口径（2026-10-26 用户裁决：工作簿原文抽取，草案 PDF 为核心标准）：
 * - 条目 = `产品需求/GB44464_需求文档/GB44464_静态.xlsx`「需求筛选」表 E 列「安全需求」的原文行，
 *   D 列「填写分区」与 B 列「第 6 章技术要求」逐行对齐；条文本身以
 *   `项目建设/GB_44464_Draft_20260703_clean.pdf` 第 6 章为准。
 * - 数量口径沿用产品定案（产品架构与功能清单 §条目总数 = 64）：6.1.1=9、6.1.2=13、6.1.6=7，
 *   其余 35 个单条目条款各 1。编号规则 `clauseNo-index`（F-ITEM-01）。
 * - 其中 5 条为工作簿的「Device:」/「Document:」段落标题行：它们是 64 条计数的一部分，
 *   建模为 `kind: 'segment'` 的结构项，生成即锁定、不参与逐条审核（详见 data/itemReview.ts）。
 * - `summary` 为审核表一列使用的短摘要（对原文的忠实压缩，不改判口径）；`content` 为原文，
 *   仅做去首尾空白、合并换行、去掉开头的「Device：」标签；单条目条款的文档侧要求拆到 `documentText`。
 * - 条目文本属业务数据，任何语言读原文，不进 i18n 词典。
 */
export type ItemSegment = 'device' | 'document';

/** requirement = 可逐条审核的要求行；segment = Device/Document 段标题行（结构项） */
export type ItemKind = 'requirement' | 'segment';

export interface RequirementItem {
  /** 条目号：`条款号-序号`，例 6.1.1-2（稳定可复现，F-ITEM-01） */
  readonly id: string;
  /** 所属条款号 */
  readonly no: string;
  /** 条款内序号，从 1 开始 */
  readonly index: number;
  /** 段类型（RequirementItem.segment） */
  readonly segment: ItemSegment;
  readonly kind: ItemKind;
  /** 审核表用短摘要 */
  readonly summary: string;
  /** 工作簿「安全需求」原文 */
  readonly content: string;
  /** 单条目条款中文档侧要求（原文含「Document：」段落时拆出） */
  readonly documentText?: string;
}

export const ITEM_CATALOG: readonly RequirementItem[] = [
  { id: "6.1.1-1", no: "6.1.1", index: 1, segment: "device", kind: "segment", summary: "Device 段标题 · 本段 4 项设备侧要求", content: "Device:" },
  { id: "6.1.1-2", no: "6.1.1", index: 2, segment: "device", kind: "requirement", summary: "区分基本功能必要信息与非基本功能非必要信息", content: "1. 针对附录B中提到的功能所处理的个人信息，应区分支持基本功能实现的必要的个人信息，和非基本功能所需的非必要个人信息。" },
  { id: "6.1.1-3", no: "6.1.1", index: 3, segment: "device", kind: "requirement", summary: "必要信息可随隐私政策一并同意，非必要不得捆绑", content: "2. 所有的基本功能服务的必要个人信息可以放在隐私政策获取同意并告知，但是非必要的个人信息不能和基本信息绑定一起获取用户同意。" },
  { id: "6.1.1-4", no: "6.1.1", index: 4, segment: "device", kind: "requirement", summary: "拒绝语音等单项授权不得导致基本导航不可用", content: "3. 例如：不应因用户拒绝了语音信息就连基本的导航服务也不提供。" },
  { id: "6.1.1-5", no: "6.1.1", index: 5, segment: "device", kind: "requirement", summary: "按功能分别征得位置、传声器、摄像头权限", content: "4. 潜在满足上述要求的方案可以是通过弹窗的方式分开获取同意，或者通过类似如下的勾选方式： 允许处理位置信息的功能：地图导航类、语音交互类、个人账号类、通信类 允许处理传声器信息的功能：地图导航类、语音交互类、个人账号类、通信类 允许处理摄像头信息的功能：地图导航类、语音交互类、个人账号类、通信类" },
  { id: "6.1.1-6", no: "6.1.1", index: 6, segment: "document", kind: "segment", summary: "Document 段标题 · 本段 3 项文档侧要求", content: "Document:" },
  { id: "6.1.1-7", no: "6.1.1", index: 7, segment: "document", kind: "requirement", summary: "需提供功能获取用户同意的设计方案", content: "1. 功能获取用户同意的设计方案。" },
  { id: "6.1.1-8", no: "6.1.1", index: 8, segment: "document", kind: "requirement", summary: "需提供功能必要信息与非必要信息清单", content: "2. 功能的必要信息和非必要信息。" },
  { id: "6.1.1-9", no: "6.1.1", index: 9, segment: "document", kind: "requirement", summary: "需提供附录 B 功能对应的个人信息处理清单", content: "3. 提供附录B中的功能，其个人信息处理的清单。" },
  { id: "6.1.2-1", no: "6.1.2", index: 1, segment: "document", kind: "requirement", summary: "首次处理个人信息前以显著方式完整告知处理规则", content: "1. 车辆在首次处理（首次处理指的是车辆完全没有处理过任何个人信息，通常是在R&P、RNR之后）个人信息前，应以显著方式、清晰易懂的语言真实、准确、完整地向用户告知处理个人信息的处理规则。" },
  { id: "6.1.2-2", no: "6.1.2", index: 2, segment: "document", kind: "requirement", summary: "告知方式至少覆盖手册、车机面板、语音、APP 之一", content: "2. 告知方式至少选取如下一种方式：用户手册、车载显示面板、语音、汽车使用相关应用程序。" },
  { id: "6.1.2-3", no: "6.1.2", index: 3, segment: "document", kind: "requirement", summary: "告知须含目的、种类、方式、权限名称及敏感信息影响", content: "3. 告知内容应包含每项功能处理个人信息的种类、处理各类个人信息的必要性，具体包括：目的、种类、方式、调用权限名称等，并说明处理敏感个人信息对用户权益的影响。" },
  { id: "6.1.2-4", no: "6.1.2", index: 4, segment: "document", kind: "requirement", summary: "以结构化清单（表格或固定列项）呈现告知内容", content: "4. 内容格式请使用结构化清单（表格）或固定列项的方式告知（例如如下列项方式）： 功能场景一：账号注册、登录、账号管理 收集目的：验证用户身份有效性，实现账号注册与登录，显示运营商信息，支持账号信息管理与第三方账号登录 收集方式：用户主动填写、系统自动验证、SIM卡信息识别、第三方授权获取 个人信息种类：手机号码、短信验证码、SIM卡运营商信息、昵称、头像、账号名、实名认证信息、第三方账号登录信息 调用权限名称：无 收集频度：注册时、登录时、信息修改时触发 敏感个人信息必要性：未收集敏感个人信息 对用户权益的影响：不提供手机号码无法注册登录；不补充昵称、头像等不影响核心登录功能；不授权第三方无法使用第三方登录；未登录可使用浏览、搜索功能 保存期限：账号存续期间长期保存；账号注销后依法律法规删除或匿名化 到期处理方式：删除或匿名化；法律法规要求留存除外 保存期限确定方法：以实现服务目的的最短必要期限为基础，结合法律法规强制要求确定" },
  { id: "6.1.2-5", no: "6.1.2", index: 5, segment: "document", kind: "requirement", summary: "逐功能场景列明收集目的、种类、方式与保存期限", content: "5. 功能场景二：下单、订单管理、支付、配送、客服、发票开具、交易安全风控 收集目的：身份核验、确定交易、支付结算、完成配送、订单查询、客服咨询与售后服务、保障交易安全、监测异常行为 收集方式：用户主动填写、系统自动生成、位置权限获取 个人信息种类：收货人姓名、收货地址、手机号码、订单号、商品/服务信息、下单时间、货款金额、支付方式、联系电话、邮箱、发票抬头、纳税人识别号、位置信息（仅异常行为时） 调用权限名称：位置权限（仅触发异常行为时） 收集频度：下单、支付、配送、售后、风控触发时 敏感个人信息必要性：未收集敏感个人信息 对用户权益的影响：不填写收货人姓名、地址、手机号无法完成订单；可选信息不填不影响订单生成；拒绝位置权限不影响正常下单 保存期限：订单存续及售后保障期；法律法规规定的争议处理、税务、审计留存期限 到期处理方式：保存期满删除或匿名化；法律法规要求留存的按规定保存 保存期限确定方法：以交易完成、售后保障、争议处理、法律法规强制留存期限综合确定" },
  { id: "6.1.2-6", no: "6.1.2", index: 6, segment: "document", kind: "requirement", summary: "告知须说明收集情境与停止收集的方式途径", content: "6. 告知内容应包含收集各类个人信息的具体情境以及停止收集的方式和途径。" },
  { id: "6.1.2-7", no: "6.1.2", index: 7, segment: "document", kind: "requirement", summary: "告知须说明存储位置、期限与到期处理方式", content: "7. 告知内容应包含个人信息存储位置、存储期限、到期后的处理方式，或者确定存储位置、存储期限、到期后的处理方式的规则。" },
  { id: "6.1.2-8", no: "6.1.2", index: 8, segment: "document", kind: "requirement", summary: "告知须说明查阅、复制、更正、删除、撤回同意途径", content: "8. 告知内容应包含便捷的查阅、复制、转移、更正、补充、删除、限制处理个人信息以及删除和/或注销账号、撤回同意的方法和途径。" },
  { id: "6.1.2-9", no: "6.1.2", index: 9, segment: "document", kind: "requirement", summary: "告知须提供用户权益联系人姓名与联系方式", content: "9. 告知内容应包含用户权益事务联系人的姓名和联系方式。" },
  { id: "6.1.2-10", no: "6.1.2", index: 10, segment: "document", kind: "requirement", summary: "告知须列明第三方接收方名称、目的、方式与信息种类", content: "10. 告知内容应包含向第三方提供（第三方是指除用户和功能运营主体及其委托处理的组织或个人。受OEM委托进行开发运营的供应商不属于第三方，属于第二方）个人信息的接收方的名称或者姓名、联系方式、处理目的、处理方式和个人信息的种类，若适用。" },
  { id: "6.1.2-11", no: "6.1.2", index: 11, segment: "document", kind: "requirement", summary: "告知内容变更须更新规则并显著告知更新内容", content: "11. 当车辆涉及上述告知内容发生变化时，车辆应更新个人信息处理规则，并通过弹窗、消息推送等显著方式向用户告知更新的具体内容。" },
  { id: "6.1.2-12", no: "6.1.2", index: 12, segment: "document", kind: "requirement", summary: "6.2.2 例外情形同样纳入个人信息梳理范围", content: "12. 针对6.2.2中提到的例外情形，也包含在车辆梳理个人信息的情况，也要符合。" },
  { id: "6.1.2-13", no: "6.1.2", index: 13, segment: "document", kind: "segment", summary: "Document 段标题 · 本段无文档侧要求", content: "Document:（无）" },
  { id: "6.1.3-1", no: "6.1.3", index: 1, segment: "document", kind: "requirement", summary: "与 6.1.2 共用需求，告知变更按 6.1.2 显著更新", content: "同 6.1.2（本条与 6.1.2 共用安全需求，不重复列示；当 6.1.2 所述告知内容发生变化时，按 6.1.2 要求更新个人信息处理规则并显著告知）。", documentText: "Document： （无）" },
  { id: "6.1.4-1", no: "6.1.4", index: 1, segment: "document", kind: "requirement", summary: "应用下载平台须展示运营者、功能、权限清单与规则", content: "车辆如搭载应用程序下载平台，例如 app store或其他具备应用安装和管理能力的功能，应在应用程序下载平台清晰展示下列信息: --应用程序运营者名称或者姓名、联系方式; --应用程序主要功能介绍; --应用程序运行所需具体权限列表; --个人信息处理规则文本或者链接。", documentText: "Document： 提供应用程序下载平台的清单，清单中，至少包含支持下载的应用清单和个人信息处理规则文本或者链接。" },
  { id: "6.1.5-1", no: "6.1.5", index: 1, segment: "document", kind: "requirement", summary: "处理不满十四周岁信息须有专门规则与独立页面", content: "如果您的功能处理了不满十四周岁的未成年人个人信息，应制定专门的个人信息处理规则，且需要实现独立的未成年人保护页面或弹窗页面，不能放在隐私协议的整体内容章节中。 处理不满十四岁未成年人信息一般指采集存储传输删除处理了不满十四岁未成年人的信息，如果只是面向未成年人设计了一些功能但是并未处理未成年人的信息，不算处理，不在6.1.5讨论的范围内。", documentText: "Document： 提供的未成年人信息的处理规则" },
  { id: "6.1.6-1", no: "6.1.6", index: 1, segment: "device", kind: "segment", summary: "Device 段标题 · 本段 3 项设备侧要求", content: "Device:" },
  { id: "6.1.6-2", no: "6.1.6", index: 2, segment: "device", kind: "requirement", summary: "车端集中展示权限调用统计（摄像头/传声器/位置）", content: "1. 如果车辆存在调用摄像头/传声器以及位置信息的功能，则应在车端集中展示出统计期限内对应的摄像头、传声器和位置信息权限调用的统计情况，具体统计多长时间（48小时或7天内）由ECU结合实际情况定义。" },
  { id: "6.1.6-3", no: "6.1.6", index: 3, segment: "device", kind: "requirement", summary: "记录并展示各权限调用情况（含调用时间）", content: "2. 记录功能调用摄像头、传声器和位置信息权限的调用情况，例如： 拍照功能-摄像头权限调用记录 序号 | 调用时间 1 | xxxx.xx.xx XX XX XX 2 | xxxx.xx.xx XX XX XX 3 | xxxx.xx.xx XX XX XX" },
  { id: "6.1.6-4", no: "6.1.6", index: 4, segment: "device", kind: "requirement", summary: "告知权限调用记录规则与记录保存期限", content: "3. 车辆应告知摄像头、传声器和位置信息使用情况的记录规则，记录规则包括记录的权限调用情况、记录保存期限等，保存期限可由ECU根据实际情况自行定义。" },
  { id: "6.1.6-5", no: "6.1.6", index: 5, segment: "document", kind: "segment", summary: "Document 段标题 · 本段 2 项文档侧要求", content: "Document:" },
  { id: "6.1.6-6", no: "6.1.6", index: 6, segment: "document", kind: "requirement", summary: "填写汽车数据处理活动清单（General）", content: "1. 填写汽车数据处理活动清单 → General。" },
  { id: "6.1.6-7", no: "6.1.6", index: 7, segment: "document", kind: "requirement", summary: "提供满足记录与展示要求的设计方案", content: "2. 提供满足上述要求的设计方案。" },
  { id: "6.2.1.1-1", no: "6.2.1.1", index: 1, segment: "document", kind: "requirement", summary: "处理个人信息须取得同意，拒绝后 48h 内不重复索要", content: "【a】车辆处理个人信息应取得个人同意，若用户拒绝，车辆不得在48小时内重新主动索要。 48小时的计时方法是从用户点拒绝开始，到48小时，可以重新主动弹窗。如果48小时内用户主动trigger了功能服务触发了同意弹窗，不算车辆主动索要。 【b】处理敏感个人信息，车辆按照功能和敏感个人信息类型取得用户单独同意。", documentText: "Document： 提供的个人信息处理功能清单" },
  { id: "6.2.1.2-1", no: "6.2.1.2", index: 1, segment: "document", kind: "requirement", summary: "向第三方提供个人信息须按功能取得单独同意", content: "车辆的功能，如果存在向第三方提供个人信息的情况，则应按功能取得用户的单独同意之后，才可以提供。 第三方是指除用户和功能运营主体及其委托处理的组织或个人。受OEM委托进行开发运营的供应商不属于第三方，属于第二方。", documentText: "Document： 提供的个人信息处理功能清单" },
  { id: "6.2.2-1", no: "6.2.2", index: 1, segment: "document", kind: "requirement", summary: "仅法定例外可免同意，须逐项说明依据与必要性", content: "除了以下情形，所有处理了个人信息的功能都要获取个人同意。如果不符合如下情形也无法获取个人同意的功能，需考虑禁用或设计其他满足方案。 有下列例外情形之一的，车辆处理个人信息可不取得个人同意： --用于紧急情况下为保护自然人的生命健康和财产安全所必需的功能; --在合理范围内处理个人自行公开或者其他已经合法公开的个人信息; --因保证行车安全和财产安全需要，无法征得个人同意收集到车外个人信息; --法律、行政法规和强制性国家标准等规定的其他情形。", documentText: "Document： 提供的个人信息处理功能清单含豁免清单，说明豁免依据和功能必要性" },
  { id: "6.2.3-1", no: "6.2.3", index: 1, segment: "document", kind: "requirement", summary: "提供自愿明确的同意/拒绝方式与敏感信息单独同意", content: "【a】取得个人同意的选项设置： --提供自愿、明确的同意和拒绝的方式； --用户画像、精准推送、智能推荐、自动化决策、用户体验计划等用于服务及体验提升的功能处理个人信息，具备独立、便捷的拒绝方式。 【b】索要车内摄像头、位置、车内传声器等权限时，车辆按照功能和敏感个人信息类型（分类方法可参考本标准附录A.2，也可参考DPO的分类方法）征得用户单独同意。 【c】提供自主设定处理敏感个人信息同意期限的途径，且期限不为仅始终允许或永久。", documentText: "Document： 提供的个人信息处理功能清单 提供车辆首次处理个人信息状态恢复方式" },
  { id: "6.2.4.1-1", no: "6.2.4.1", index: 1, segment: "document", kind: "requirement", summary: "同意期限届满即停止处理，续期须重新取得同意", content: "1. 个人信息处理活动到同意期限后，应立即停止处理活动。 2. 若要继续超过同意期限的数据处理活动，应重新取得个人同意。 3. 当个人信息的处理目的、处理方式、处理种类等情况发生变化时，车辆应重新取得用户同意。 4. 车辆应提供撤回个人同意的途径，撤回个人同意，不应影响撤回前基于个人同意已进行的车辆处理个人信息活动的效力。", documentText: "Document： 1. 提供个人同意期限届满后的处理方案文档。 2. 根据个人同意期限届满后的处理方案，提供期限届满触发的方式 3. 提供的个人信息处理功能清单、首次处理个人信息状态恢复方式 4. 提供个人信息处理目的、处理方式、处理种类等情况发生变化时后重新征得用户同意的文档说明。 5. 提供撤回个人同意的功能设计文档。" },
  { id: "6.2.4.2-1", no: "6.2.4.2", index: 1, segment: "document", kind: "requirement", summary: "目的、方式、种类变化须重新取得同意（原文同 6.2.4.1）", content: "1. 个人信息处理活动到同意期限后，应立即停止处理活动。 2. 若要继续超过同意期限的数据处理活动，应重新取得个人同意。 3. 当个人信息的处理目的、处理方式、处理种类等情况发生变化时，车辆应重新取得用户同意。 4. 车辆应提供撤回个人同意的途径，撤回个人同意，不应影响撤回前基于个人同意已进行的车辆处理个人信息活动的效力。", documentText: "Document： 1. 提供个人同意期限届满后的处理方案文档。 2. 根据个人同意期限届满后的处理方案，提供期限届满触发的方式 3. 提供的个人信息处理功能清单、首次处理个人信息状态恢复方式 4. 提供个人信息处理目的、处理方式、处理种类等情况发生变化时后重新征得用户同意的文档说明。 5. 提供撤回个人同意的功能设计文档。" },
  { id: "6.2.5.1-1", no: "6.2.5.1", index: 1, segment: "document", kind: "requirement", summary: "提供撤回同意途径，且不影响撤回前处理效力", content: "1. 个人信息处理活动到同意期限后，应立即停止处理活动。 2. 若要继续超过同意期限的数据处理活动，应重新取得个人同意。 3. 当个人信息的处理目的、处理方式、处理种类等情况发生变化时，车辆应重新取得用户同意。 4. 车辆应提供撤回个人同意的途径，撤回个人同意，不应影响撤回前基于个人同意已进行的车辆处理个人信息活动的效力。", documentText: "Document： 1. 提供个人同意期限届满后的处理方案文档。 2. 根据个人同意期限届满后的处理方案，提供期限届满触发的方式 3. 提供的个人信息处理功能清单、首次处理个人信息状态恢复方式 4. 提供个人信息处理目的、处理方式、处理种类等情况发生变化时后重新征得用户同意的文档说明。 5. 提供撤回个人同意的功能设计文档。" },
  { id: "6.2.5.2-1", no: "6.2.5.2", index: 1, segment: "document", kind: "requirement", summary: "撤回同意途径的可用性与留痕要求（原文同 6.2.4.1）", content: "1. 个人信息处理活动到同意期限后，应立即停止处理活动。 2. 若要继续超过同意期限的数据处理活动，应重新取得个人同意。 3. 当个人信息的处理目的、处理方式、处理种类等情况发生变化时，车辆应重新取得用户同意。 4. 车辆应提供撤回个人同意的途径，撤回个人同意，不应影响撤回前基于个人同意已进行的车辆处理个人信息活动的效力。", documentText: "Document： 1. 提供个人同意期限届满后的处理方案文档。 2. 根据个人同意期限届满后的处理方案，提供期限届满触发的方式 3. 提供的个人信息处理功能清单、首次处理个人信息状态恢复方式 4. 提供个人信息处理目的、处理方式、处理种类等情况发生变化时后重新征得用户同意的文档说明。 5. 提供撤回个人同意的功能设计文档。" },
  { id: "6.3.1-1", no: "6.3.1", index: 1, segment: "document", kind: "requirement", summary: "除用户自主设定或法定例外，个人信息默认不收集", content: "除非用户自主设定或符合6.2.2规定的例外情形，否则个人信息默认不收集。", documentText: "Document： 提供获取用户同意的方案" },
  { id: "6.3.2-1", no: "6.3.2", index: 1, segment: "document", kind: "requirement", summary: "收集座舱数据/敏感信息/位置须以可感知方式提示", content: "车辆收集座舱数据、敏感个人信息及位置应提示收集状态，具体要求如下: 以浮窗、弹窗、提示音、振动、状态栏图标、状态灯等至少一种可直接感知的方式提示且提示方式应不影响行车安全。 同种提示方式下，不同种类敏感个人信息的提示以不同形式区分。例如 1:在状态栏图标提示方式下，语音和定位提示分别以麦克风图标和定位图标显示。 2:在状态灯闪烁提示方式下，语音和定位提示分别以蓝光和绿光显示。 符合6.2.2规定的例外情形不需要满足此条。 车外的语音视频指纹都不在讨论范围内。 这种应该整个座舱提供一套提示方案，让各功能选择使用更为合适-Zhe 座舱数据：通过摄像头、红外传感器、指纹传感器或传声器等各种方式从汽车座舱处理的包含个人信息的数据。", documentText: "Document： 1. 提供敏感数据采集提示的功能设计文档。 2 . 个人信息处理功能清单" },
  { id: "6.3.3-1", no: "6.3.3", index: 1, segment: "document", kind: "requirement", summary: "摄像头、雷达覆盖范围与分辨率不得高于功能需求", content: "当车辆通过摄像头、雷达等设备收集个人信息和重要数据时，摄像头、雷达等设备的覆盖范围、分辨率应根据功能的需求而定，不允许高于功能需求装配摄像头、雷达等设备。即使一个数据收集设备对应多个功能，那每个功能都应该满足上述要求，针对不满足要求的情况，需要做出合理说明。", documentText: "Document： 1. 车辆摄像头、雷达等数据收集设备参数信息 2. 个人信息处理功能清单，判断功能是否收集使用摄像头，雷达等设备，使用采集器的选择，说明所需精度参数和参数必要性" },
  { id: "6.3.4-1", no: "6.3.4", index: 1, segment: "document", kind: "requirement", summary: "采集设备参数须与功能需求匹配并说明参数必要性", content: "当车辆通过摄像头、雷达等设备收集个人信息和重要数据时，摄像头、雷达等设备的覆盖范围、分辨率应根据功能的需求而定，不允许高于功能需求装配摄像头、雷达等设备。即使一个数据收集设备对应多个功能，那每个功能都应该满足上述要求，针对不满足要求的情况，需要做出合理说明。", documentText: "Document： 1. 车辆摄像头、雷达等数据收集设备参数信息 2. 个人信息处理功能清单，判断功能是否收集使用摄像头，雷达等设备，使用采集器的选择，说明所需精度参数和参数必要性" },
  { id: "6.3.5-1", no: "6.3.5", index: 1, segment: "document", kind: "requirement", summary: "未激活相关功能时不得调用摄像头/位置/传声器", content: "1. 当车辆的功能使用摄像头、位置、传声器时，应满足最小必要的原则，没有相关功能或未激活相关功能时，不应调用摄像头、位置、传声器的权限或收集非必要的个人信息。", documentText: "Document： 1.个人信息处理功能清单" },
  { id: "6.3.6-1", no: "6.3.6", index: 1, segment: "document", kind: "requirement", summary: "不得因拒绝或撤回同意而拒绝提供无需信息的功能", content: "车辆不得以个人信息主体不同意收集其个人信息或者撤回同意为由，拒绝提供不需处理个人信息即可实现的功能。 如果某个车辆功能在提供服务时仅在车内处理VIN，即使用户拒绝了个人信息的收集，以下功能也可以处理VIN并提供服务。例如： 制动、转向、换挡等行车安全相关； 收音机、空调、音量控制、座椅和方向盘调节及加热、仪表等。 document: 个人信息处理功能清单 首次处理个人信息状态恢复方式(R&P & RNR后拿到full service list以后，但是车机端没有使用任何收集个人信息的服务之前？） 车辆唤醒界面完成后，引导程序中" },
  { id: "6.3.7-1", no: "6.3.7", index: 1, segment: "document", kind: "requirement", summary: "征得同意前不得收集，且不得超出同意的目的范围", content: "1. 车辆不应在征得同意前收集个人信息。 2. 车辆不应超出用户同意的目的、方式、种类收集个人信息", documentText: "Document： 1. 个人信息处理功能清单 2. 首次处理个人信息状态恢复方式 3. 提供针对个人信息的用户同意的功能设计方案。 4. 提供车辆功能的个人信息处理规则。" },
  { id: "6.4.1-1", no: "6.4.1", index: 1, segment: "document", kind: "requirement", summary: "实际存储期限与告知一致，届满按告知方式删除或覆写", content: "个人信息的实际存储期限应与告知期限一致。存储期限届满时，应按照告知的处理方式处理个人信息，如：自动删除或覆写。", documentText: "Document： 1. 个人信息处理功能清单中应包含用户告知内容并说明存储期限/存储规则。 2. 提供触发车辆在车端存储个人信息的存储期限或存储规则的方法" },
  { id: "6.4.2-1", no: "6.4.2", index: 1, segment: "document", kind: "requirement", summary: "敏感个人信息与重要数据须访问控制或加密保护", content: "【a】ECU应具备安全机制（访问控制或加密）保护存储的敏感个人信息： --若采用访问控制：安全机制应同时实现在调试软件和客户软件及硬件中（如调试接口全部禁用；若敏感个人信息可通过诊断读取且持久化存储，应实施SFD）； --若采用加密：ECU不得以明文存储敏感个人信息，加密算法参考大众集团标准VW80180-1。 【b】ECU应具备安全机制（访问控制或加密）保护存储的重要数据，并填写数据分类文档（数据清单，如存储路径、保护方式、加密算法）提供给采购方。" },
  { id: "6.4.3-1", no: "6.4.3", index: 1, segment: "document", kind: "requirement", summary: "生物特征信息应在车内存储，出车须单独同意", content: "1. 车辆收集的生物特征识别信息，应进存储在车内。如果需要向车外传输，则需要单独获取用户同意，且是独立于车内生物识别特征信息处理的单独同意； 生物特征识别信息 biometric information：对自然人的物理、生物或行为特征进行技术处理得到的、能够单独或者与其他信息结合识别该自然人身份的个人信息。 注1：生物特征识别信息包括个人面部识别特征、虹膜、指纹、基因、声纹、步态、掌纹、耳廓、眼纹等。 注2：生物特征识别信息包含生物特征识别原始信息以及生物特征识别比对信息。", documentText: "Document： 1. 填写并提供个人信息处理功能清单（general for each function) 2.提供处理，存储，传输生物特征识别信息相关功能的技术设计文档。 3. 如果存储的生物特征识别信息是加密保存的，则需要提供解密访问的方法。" },
  { id: "6.5.1-1", no: "6.5.1", index: 1, segment: "document", kind: "requirement", summary: "不得以生物特征作为唯一鉴别方式，须提供替代方式", content: "不能将生物识别特征信息作为唯一一种身份鉴别的方式。基于个人同意处理生物特征识别信息的，使用生物识别信息进行身份识别时，应同时提供不基于生物特征识别信息的其他身份识别方式， 例如 账号密码等。", documentText: "Document： 汽车数据处理活动清单" },
  { id: "6.5.2-1", no: "6.5.2", index: 1, segment: "document", kind: "requirement", summary: "显示与输入支付口令须提供隐藏全部或部分信息", content: "车辆在显示口令以及用户输入或设置网络支付平台登录口令、支付口令(包括网络支付交易口令、快捷支付口令、银行卡支付口令等)时应提供隐藏全部或部分信息的方式。", documentText: "Document： 汽车数据处理活动清单" },
  { id: "6.6.1.1-1", no: "6.6.1.1", index: 1, segment: "document", kind: "requirement", summary: "座舱数据出车须取得同意，豁免情形按 6.2.2 处理", content: "1. 只有在取得了个人同意的情况下，座舱数据才能向车外提供。 座舱数据 cabin data 通过摄像头、红外传感器、指纹传感器或传声器等各种方式在汽车座舱内处理的包含个人信息的数据。 2. 满足6.2.2豁免的座舱数据可以出车。", documentText: "Document： 1. 汽车数据处理活动清单" },
  { id: "6.6.1.2-1", no: "6.6.1.2", index: 1, segment: "document", kind: "requirement", summary: "出车的敏感个人信息与重要数据须全通道加密", content: "【a】车辆应确保通过蜂窝网络、WLAN、蓝牙和BLE通道发送到车外的所有敏感个人信息均已加密，加密算法应公开、已发布且有效。 【b】车辆应确保通过蜂窝网络、WLAN、蓝牙和BLE通道发送到车外的所有重要数据均已加密，加密算法应公开、已发布且有效。", documentText: "Documentation： All functions shall provide a documentation listing sensitive personal information transmitted outside the vehicle and the used channel and the used protection mechanism during transmission." },
  { id: "6.6.1.3-1", no: "6.6.1.3", index: 1, segment: "document", kind: "requirement", summary: "车外视频含人脸、车牌须车端匿名化后再出车", content: "1. 从车外收集的视频图像，如包含人脸、车牌等个人信息且向车外提，则进行匿名化处理，包括删除含有能够识别自然人的画面，或者对画面中的人脸信息或汽车号牌信息等进行局部轮廓化处理等，匿名化处理应符合6.6.2的要求。匿名化处理完成后，过程数据不应向车外提供 。", documentText: "Document： 1. 提供向车外传输的车外个人信息的功能设计文档。 2.汽车数据处理活动清单" },
  { id: "6.6.2.1.1-1", no: "6.6.2.1.1", index: 1, segment: "document", kind: "requirement", summary: "人脸边界框 ≥28px 且五官可见的须匿名化", content: "1. 同时满足以下规则的人脸目标图像或视频，应进行匿名化处理： a. 人脸边界框最小边大于等于28像素; b. 人脸边界框内可见范围比值大于50%且可见范围内眼睛、鼻子或嘴清晰可见。", documentText: "Document： 1. 提供人脸匿名化处理方案文档。" },
  { id: "6.6.2.1.2-1", no: "6.6.2.1.2", index: 1, segment: "document", kind: "requirement", summary: "号牌 ≥16px 且无遮挡可识别的须匿名化", content: "1. 同时满足以下规则的汽车号牌图像或视频，应进行匿名化处理： a. 汽车号牌边界框最小边长像素大于等于16像素; b. 汽车号牌目标无遮挡且可识别全部数字及文字内容。", documentText: "Document： 1. 提供车外数据匿名化处理方案文档。" },
  { id: "6.6.2.2.1-1", no: "6.6.2.2.1", index: 1, segment: "document", kind: "requirement", summary: "应匿名化目标的检出率须 ≥90%", content: "1. 检出需要进行匿名化的目标/应进行匿名化的目标 >= 90%", documentText: "Document： 1. 提供匿名化检出率测试报告。" },
  { id: "6.6.2.2.2-1", no: "6.6.2.2.2", index: 1, segment: "document", kind: "requirement", summary: "匿名化后须不可识别具体人员或车牌", content: "1. 匿名化处理后的数据，无法识别具体人员或车牌信息。", documentText: "Document： 1. 提供匿名化功能的测试通过报告。" },
  { id: "6.7.1-1", no: "6.7.1", index: 1, segment: "document", kind: "requirement", summary: "车端持久化存储的个人信息用户须可删除", content: "If the function store any personal information in the vehicle persistently, the stored personal information shall be able to be deleted by user e.g via factory reset or any other ways. Note: The personal information shall not include the personal information that must be retained as specified in laws, administrative regulations and mandatory national standards.", documentText: "Document： Below relevant document shall be provided to the purchaser: The storage path of the personal information. The test method of store and delete personal information." },
  { id: "6.7.2-1", no: "6.7.2", index: 1, segment: "document", kind: "requirement", summary: "目的实现、期限届满、撤回同意等情形须主动删除", content: "1. 以下情形中，车辆应主动删除个人信息： 个人信息处理目的已实现、无法实现或者为实现处理目的不再必要; 停止提供产品或服务，或者保存期限已届满; 个人撒回同意; 违反法律法规或者违反约定处理个人信息; 法律法规所规定的其他情形。 以上情形中，车辆未主动删除的，个人有权请求删除 2. 满足以上条件且由于各种原因（例如法律法规规定的保存期限未届满，或者技术上难以实现）无法删除的个人信息，则需说明原因并停止处理个人信息，或只进行存储和必要的保护措施，不进行其他处理。", documentText: "Document： 1. 个人信息的功能清单或汽车数据处理活动清单中应包含个人信息的删除方式说明，提供用户个人数据删除的功能设计文档。 2. 若存储的个人信息进行了加密处理，则需提供解密方法确认存储的个人信息。" },
  { id: "6.7.3-1", no: "6.7.3", index: 1, segment: "document", kind: "requirement", summary: "已删除的个人信息须不可检索且不可访问", content: "1. 已经被删除的xxx，应不可检索且不可访问。", documentText: "Document： 1. 提供车内删除的功能设计文档。 2. 汽车数据处理功能清单" },
  { id: "6.7.4-1", no: "6.7.4", index: 1, segment: "document", kind: "requirement", summary: "账号管理功能须提供车端本地删除账号能力", content: "若车辆存在账号管理功能，车辆应为用户提供本地删除账号的便捷功能。用户在车端删除账号后，车辆应删除已收集的该账号相关个人信息或者进行匿名化处理，法律、行政法规另有规定的除外。", documentText: "Document： 提供一个可用的车机用户登录账号和密码 汽车数据活动处理清单中包含账号的删除方式" },
  { id: "6.8-1", no: "6.8", index: 1, segment: "document", kind: "requirement", summary: "不得经任何通道直接向境外传输数据或访问境外 IP", content: "The vehicles shall not directly transmit data overseas via any communication channel, any access to out of China Mainland IP address shall not be allowed. Trigger your function to communicate with backend and catch the ConMod tcpdump package for security compliance team to further check . Please note to perform such test within China Mainland. Note: This provision does not apply to users who access overseas websites through browsers, send messages overseas using communication software, install third-party applications that may involve cross-border data transfer, or engage in other autonomous user actions.", documentText: "Document： Below relevant document shall be provided to the purchaser: The tcpdump log of the function shall be provided, below catch log steps and command for your reference: CL30 Off->2.CL30 On->3.Run Catch log command in Host PC->4.Trigger your function to access backend->5.Finish catch. Catch log command: adb exec-out \"tcpdump -vni any -w - 2>/dev/null\" > xxx.pcap" },
];

/** 绑定版本条目总数（v1 = 64，BR-038 恒等式右端） */
export const ITEM_TOTAL = ITEM_CATALOG.length;

/** 结构项目条数（Device/Document 段标题行，5 条，生成即锁定） */
export const SEGMENT_ITEM_TOTAL = ITEM_CATALOG.filter((item) => item.kind === 'segment').length;

/** 可审核要求条目数（59 条） */
export const REQUIREMENT_TOTAL = ITEM_TOTAL - SEGMENT_ITEM_TOTAL;

const byId = new Map(ITEM_CATALOG.map((item) => [item.id, item]));

/** 条目号 → 条目定义 */
export function itemById(id: string): RequirementItem | undefined {
  return byId.get(id);
}

const byClause = new Map<string, RequirementItem[]>();
for (const item of ITEM_CATALOG) {
  const list = byClause.get(item.no);
  if (list) list.push(item);
  else byClause.set(item.no, [item]);
}

/** 条款号 → 该条款下的全部条目（含结构项，按序号升序） */
export function itemsOfClause(no: string): readonly RequirementItem[] {
  return byClause.get(no) ?? [];
}

/** 条款号 → 该条款下的可审核要求条目（不含结构项） */
export function requirementsOfClause(no: string): readonly RequirementItem[] {
  return itemsOfClause(no).filter((item) => item.kind === 'requirement');
}

