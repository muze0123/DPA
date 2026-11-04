/**
 * 问卷模板库（模块内 mock 数据层，待模板服务接口替换）。
 *
 * 业务口径（2026-10-26 用户裁决；2026-10-29 收口）：
 * - 模板两态：草稿 draft / 已发布 published；状态域不再有「已停用」——
 *   停用语义由「是否启用」开关（enabled）承载：停用库不进新建问卷候选，历史问卷不受影响。
 *   只有「已发布且启用」可被新建问卷选用。
 * - 编辑已发布的模板 → 保存后内部自动升小版本（v1.0 → v1.1），
 *   已创建问卷仍绑定创建时冻结的题目快照（历史不漂移）。
 *   版本号自 2026-11-04 起不在问题库界面展示、也不进导出工作簿，仅保留为内部字段。
 * - 删除 = 硬删除：仅当没有任何「进行中」（未归档）问卷引用时可删；
 *   历史问卷的题目快照与模板名已随创建快照冻结，模板移除后仍可追溯。
 * - 使用次数 = 引用该模板的全部问卷数（含已归档），点击跳问卷工作台按模板筛选。
 * - 问题库解绑判定规则（2026-10-29 用户裁决）：问题库作为问题数据的最基本单元，
 *   仅问题信息的增删改查，不关联判定规则；题目以题号 code 为唯一标识
 *   （2026-11-01 用户裁决：Q01 稳定标识口径下线），条款映射关系由「规则管理」（DPA 平台）维护。
 *
 * 题目在模板内自定义录入（用户裁决）：题号 Q1…Qn 由顺序自动生成，题干与判断指引可编辑。
 */
import { reactive } from 'vue';
import { DEFAULT_QUESTION_VERSION, QUESTION_SETS } from '../../surveys/data/questions';
import { coverageOf, type TemplateCoverage } from './coverage';
import { surveyRecords, type SurveyRecord } from '../../surveys/data/surveys';
import { FEATURE_JUDGMENT_QUESTIONS } from './feature-judgment';

export type TemplateStatus = 'draft' | 'published';

export const TEMPLATE_STATUSES = ['draft', 'published'] as const satisfies readonly TemplateStatus[];

export interface TemplateQuestion {
  /**
   * 题号（唯一标识，2026-11-01 用户裁决）：题库题沿用题库题号（Q1…Q18），
   * 表达式只认题号；题号不在题库内的题视为自建题，不参与判定（只作为附加说明题留档）。
   */
  code: string;
  /**
   * 自建题命中的条款（2026-10-28 用户裁决）：自建题由管理员直接声明它作为哪些条款的判定依据，
   * 问卷匹配时以「或」语义并入所选条款（相当于按库声明的追加判定维度）。
   * 题号在题库内的题不使用本字段——映射由题号唯一决定，避免双写漂移。
   */
  clauseNos?: string[];
  /** 完整题干 */
  title: string;
  /** 判断指引（法规依据 / 典型场景 / 不适用场景的自由文本） */
  guide: string;
}

export interface SurveyTemplate {
  /** 模板编号（人类可读、唯一，TPL-YYYY-###） */
  id: string;
  name: string;
  /**
   * 版本号（内部字段，2026-11-04 用户裁决：界面不再展示，不再出现在导出工作簿）：
   * v1.0 起，编辑已发布模板自动升小版本；仅供问卷创建快照冻结与历史溯源使用。
   */
  version: string;
  status: TemplateStatus;
  /**
   * 是否启用（2026-10-29 用户裁决）：主数据开关，与「草稿/已发布」状态正交，承载「停用」语义；
   * 缺省视为启用（`!== false`），兼容无此字段的存量数据。
   * 停用的问题库不出现在新建问卷的模板候选中，历史问卷引用不受影响。
   */
  enabled?: boolean;
  questions: TemplateQuestion[];
  /** 说明（模板用途、适用车型范围等自由文本） */
  note: string;
  creator: string;
  createdAt: string;
  updater: string;
  updatedAt: string;
  /**
   * 兼容口径：该模板承接的历史题集版本（v1/v2/v3）。
   * 无创建快照的历史问卷按默认题集 v1 计入，据此把老问卷挂回对应模板。
   */
  legacyVersion?: string;
}

/** 标准文件基线（标准草案日期与 PDF 哈希属标准文件，不随模板变化） */
export const STANDARD_BASELINE = {
  standardDraftDate: '2026-07-03',
  standardPdfSha256: 'fdae27d0ee157802f8f5f6e39cebc8a277228867779b8f15dd069480b4941e03',
} as const;

// v2：2026-10-27 新增「功能判断标准问卷」种子（TPL-2026-005），升键让浏览器里缓存的旧种子列表让位
const storageKey = 'survey-templates:preview-v3';
const seedCreator = '王建国';

function seedQuestions(version: string): TemplateQuestion[] {
  return QUESTION_SETS[version].map((question) => ({
    code: question.code,
    title: question.title,
    // 题库把指引拆成「法规依据 / 典型场景 / 不适用场景」三段，模板内合并为一段自由文本
    guide: [question.guide.basis, ...question.guide.scenarios, question.guide.notApplicable]
      .filter(Boolean)
      .join('\n'),
  }));
}

const seedTemplates: SurveyTemplate[] = [
  {
    id: 'TPL-2026-001', name: 'GB 44464 基础问卷', version: 'v1.2', status: 'published',
    questions: seedQuestions('v1'), note: '现行基线模板：覆盖 12 道判定题与 38 条款自动初筛。',
    creator: seedCreator, createdAt: '2026-03-02 09:20', updater: seedCreator, updatedAt: '2026-09-18 16:40',
    legacyVersion: 'v1',
  },
  {
    id: 'TPL-2026-002', name: 'GB 44464 扩展问卷', version: 'v1.0', status: 'published',
    questions: seedQuestions('v2'), note: '在基础问卷之上补充两道数据训练相关判定题。',
    creator: seedCreator, createdAt: '2026-05-11 10:05', updater: seedCreator, updatedAt: '2026-07-22 14:12',
    legacyVersion: 'v2',
  },
  {
    id: 'TPL-2026-003', name: 'GB 44464 增强问卷', version: 'v0.9', status: 'draft',
    questions: seedQuestions('v3'), note: '扩展题集草案，待合规复核后发布。',
    creator: '赵敏', createdAt: '2026-09-30 11:30', updater: '赵敏', updatedAt: '2026-10-08 15:20',
    legacyVersion: 'v3',
  },
  {
    // 2026-10-29 状态域去掉「已停用」：试点库改为 已发布 + 是否启用=否（停用语义由开关承载）
    id: 'TPL-2026-004', name: '2026 试点问卷', version: 'v1.0', status: 'published', enabled: false,
    questions: seedQuestions('v1'), note: '试点期使用的模板，已停止新问卷选用；历史问卷不受影响。',
    creator: '赵敏', createdAt: '2026-04-06 08:40', updater: seedCreator, updatedAt: '2026-08-19 17:05',
  },
  {
    // 「功能判断」工作簿 12 问原文录入（2026-10-27）：已发布，支撑功能判断口径的问卷/条款匹配测试
    id: 'TPL-2026-005', name: 'GB 44464 功能判断标准问卷', version: 'v1.0', status: 'published',
    questions: FEATURE_JUDGMENT_QUESTIONS,
    note: '按「功能判断」工作簿 12 问原文录入：11 题挂接题库登记题参与条款自动判定，第 2 问（应用下载平台）为附加说明题。',
    creator: seedCreator, createdAt: '2026-10-15 09:30', updater: seedCreator, updatedAt: '2026-10-26 17:40',
  },
];

function readLocalTemplates(): SurveyTemplate[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!Array.isArray(raw)) return [];
    // 迁移（2026-10-29 状态域去掉「已停用」）：历史 retired 记录归并为 已发布 + 是否启用=否
    const entries = raw.map((entry) => {
      const record = entry as SurveyTemplate | null;
      if (!record || typeof record !== 'object' || (record.status as string) !== 'retired') return entry;
      return { ...record, status: 'published' as TemplateStatus, enabled: record.enabled ?? false };
    });
    if (entries.every((entry) =>
      entry && typeof entry.id === 'string' && typeof entry.name === 'string'
      && TEMPLATE_STATUSES.includes((entry as SurveyTemplate).status)
      && Array.isArray((entry as SurveyTemplate).questions)
      && (entry as SurveyTemplate).questions.every((question: TemplateQuestion) => typeof question?.code === 'string' && typeof question?.title === 'string'))) {
      // 迁移（2026-10-26 用户裁决）：名称去掉「（n 题）」后缀——列表已有「题目数量」列，不再重复
      return (entries as SurveyTemplate[]).map((entry) => ({
        ...entry,
        name: entry.name.replace(/（\d+\s*题）$/, ''),
      }));
    }
  } catch { /* Storage is optional for this local preview. */ }
  return [];
}

const localTemplates = readLocalTemplates();

/** 模块内可变数据源：新建/编辑/复制/删除直接写回这里，并尝试落 localStorage */
export const surveyTemplates = reactive<SurveyTemplate[]>(localTemplates.length ? localTemplates : seedTemplates);

export function persistTemplates(): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(surveyTemplates));
    return true;
  } catch { return false; }
}

/* ------------------------------------------------------------------ 文本与时序 */

function nowText(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 模板编号：TPL-YYYY-### 当年最大值 +1（服务端定稿后由后端下发）。
 *  同时把历史问卷快照引用过的编号计入最大值，避免删除模板后编号被复用导致快照指向歧义。 */
export function nextTemplateNo(records: readonly SurveyTemplate[] = surveyTemplates): string {
  const year = new Date().getFullYear();
  const prefix = `TPL-${year}-`;
  const serial = (id: string) => (id.startsWith(prefix) ? Number(id.slice(prefix.length)) || 0 : 0);
  const fromTemplates = records.reduce((acc, item) => Math.max(acc, serial(item.id)), 0);
  const fromSnapshots = surveyRecords.reduce((acc, record) => Math.max(acc, serial(record.creationSnapshot?.templateId ?? '')), 0);
  return `${prefix}${String(Math.max(fromTemplates, fromSnapshots) + 1).padStart(3, '0')}`;
}

/** 编辑已发布模板 → 小版本 +1（v1.0 → v1.1；主版本固定 1） */
export function bumpVersion(version: string): string {
  const match = /^v(\d+)\.(\d+)$/.exec(version);
  if (!match) return version;
  return `v${match[1]}.${Number(match[2]) + 1}`;
}

/** 题号按顺序重排为 Q1…Qn（删除/移动题目后调用，避免出现空号） */
export function renumberQuestions(questions: TemplateQuestion[]): TemplateQuestion[] {
  return questions.map((question, index) => ({ ...question, code: `Q${index + 1}` }));
}

/* ------------------------------------------------------------------ 引用关系 */

/** 问卷引用的模板编号：优先取创建快照；无快照的历史问卷按题集版本回落 */
export function templateIdOfRecord(record: SurveyRecord, records: readonly SurveyTemplate[] = surveyTemplates): string | undefined {
  const snapshot = record.creationSnapshot;
  if (snapshot?.templateId) return snapshot.templateId;
  const version = snapshot?.templateVersion ?? DEFAULT_QUESTION_VERSION;
  return records.find((item) => item.legacyVersion === version)?.id;
}

export interface TemplateUsage { total: number; inProgress: number }

/** 使用次数：全部问卷（含已归档）；inProgress = 未归档问卷数，删除守卫用 */
export function templateUsage(records: readonly SurveyTemplate[] = surveyTemplates): Record<string, TemplateUsage> {
  const usage: Record<string, TemplateUsage> = {};
  for (const template of records) usage[template.id] = { total: 0, inProgress: 0 };
  for (const record of surveyRecords) {
    const id = templateIdOfRecord(record, records);
    if (!id || !usage[id]) continue;
    usage[id].total += 1;
    if (record.status !== 'archived') usage[id].inProgress += 1;
  }
  return usage;
}

/** 新建问卷可选的模板：仅「已发布」且未被「是否启用」开关停用 */
export function publishedTemplates(records: readonly SurveyTemplate[] = surveyTemplates): SurveyTemplate[] {
  return records
    .filter((item) => item.status === 'published' && isTemplateEnabled(item))
    .map((item) => JSON.parse(JSON.stringify(item)) as SurveyTemplate);
}

/** 启用判定：缺省启用（存量数据无此字段），仅显式 false 视为停用 */
export function isTemplateEnabled(template: SurveyTemplate): boolean {
  return template.enabled !== false;
}

/**
 * 「是否启用」开关（2026-10-29 用户裁决）：直接切换、留操作痕迹（updater/updatedAt），
 * 不走 updateTemplate（那会对已发布库自动升版）；不改 status。
 */
export function setTemplateEnabled(id: string, enabled: boolean, operator: string): void {
  const target = surveyTemplates.find((item) => item.id === id);
  if (!target || isTemplateEnabled(target) === enabled) return;
  target.enabled = enabled;
  target.updater = operator;
  target.updatedAt = nowText();
  persistTemplates();
}

/* ------------------------------------------------------------------ 覆盖度（派生） */

/** 模板覆盖度（派生，实时计算；列表与抽屉共用） */
export function templateCoverage(template: SurveyTemplate): TemplateCoverage {
  return coverageOf(template.questions);
}

/* ------------------------------------------------------------------ 写操作 */

export interface TemplateInput {
  name: string;
  note: string;
  questions: TemplateQuestion[];
}

export function createTemplate(input: TemplateInput, operator: string): SurveyTemplate {
  const timestamp = nowText();
  const template: SurveyTemplate = {
    id: nextTemplateNo(),
    name: input.name.trim(),
    version: 'v1.0',
    status: 'draft',
    enabled: true,
    questions: renumberQuestions(input.questions.map((question) => ({ ...question, title: question.title.trim(), guide: question.guide.trim() }))),
    note: input.note.trim(),
    creator: operator,
    createdAt: timestamp,
    updater: operator,
    updatedAt: timestamp,
  };
  surveyTemplates.unshift(template);
  persistTemplates();
  return template;
}

/** 导入只生成新的本地草稿；整批存储成功后才更新页面数据，避免部分写入。 */
export function importTemplateDrafts(inputs: readonly TemplateInput[], operator: string): SurveyTemplate[] {
  const timestamp = nowText();
  const drafts: SurveyTemplate[] = [];
  for (const input of inputs) {
    drafts.push({
      id: nextTemplateNo([...surveyTemplates, ...drafts]),
      name: input.name.trim(),
      version: 'v1.0',
      status: 'draft',
      enabled: true,
      questions: renumberQuestions(input.questions.map((question) => ({
        ...question, title: question.title.trim(), guide: question.guide.trim(),
      }))),
      note: input.note.trim(),
      creator: operator,
      createdAt: timestamp,
      updater: operator,
      updatedAt: timestamp,
    });
  }
  const newestFirst = drafts.slice().reverse();
  try {
    localStorage.setItem(storageKey, JSON.stringify([...newestFirst, ...surveyTemplates]));
  } catch { throw new Error('TEMPLATE_STORAGE_FAILED'); }
  surveyTemplates.unshift(...newestFirst);
  return drafts;
}

/**
 * 编辑保存：
 * - 草稿：原地更新，不升版；
 * - 已发布：更新后自动升小版本（历史问卷绑定原版本快照；版本号仅在内部维护）。
 */
export function updateTemplate(id: string, input: TemplateInput, operator: string): { template: SurveyTemplate; versionBumped: boolean } {
  const target = surveyTemplates.find((item) => item.id === id);
  if (!target) throw new Error('Template not found');
  const bump = target.status !== 'draft';
  Object.assign(target, {
    name: input.name.trim(),
    note: input.note.trim(),
    questions: renumberQuestions(input.questions.map((question) => ({ ...question, title: question.title.trim(), guide: question.guide.trim() }))),
    version: bump ? bumpVersion(target.version) : target.version,
    updater: operator,
    updatedAt: nowText(),
  });
  persistTemplates();
  return { template: target, versionBumped: bump };
}

/** 删除（硬删除）：存在进行中（未归档）问卷引用时拒绝 */
export function deleteTemplate(id: string): void {
  const index = surveyTemplates.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Template not found');
  const usage = templateUsage()[id];
  if (usage && usage.inProgress > 0) throw new Error('TEMPLATE_IN_USE');
  surveyTemplates.splice(index, 1);
  persistTemplates();
}

export function publishTemplate(id: string, operator: string): void {
  const target = surveyTemplates.find((item) => item.id === id);
  if (!target) return;
  target.status = 'published';
  target.updater = operator;
  target.updatedAt = nowText();
  persistTemplates();
}

/* ------------------------------------------------------------------ 问卷页数据源 */

export interface PublishedTemplateView {
  id: string;
  name: string;
  version: string;
  updatedAt: string;
  /** 模板说明（用途、适用车型范围等自由文本）：随创建快照冻结到问卷详情「版本引用」 */
  note: string;
  questionCount: number;
  /** 可自动判定的条款数（创建问卷时的覆盖度徽标） */
  coverageJudgeable: number;
  /** 无题目依据、需人工判定的条款号 */
  coverageUncovered: string[];
  standardDraftDate: string;
  standardPdfSha256: string;
  questions: TemplateQuestion[];
}

/** 新建问卷页的模板下拉数据源：仅已发布模板（按编号倒序，最新在前） */
export async function loadPublishedTemplates(): Promise<PublishedTemplateView[]> {
  return publishedTemplates()
    .sort((left, right) => right.id.localeCompare(left.id))
    .map((template) => ({
      id: template.id,
      name: template.name,
      version: template.version,
      updatedAt: template.updatedAt,
      note: template.note,
      questionCount: template.questions.length,
      coverageJudgeable: coverageOf(template.questions).judgeable.length,
      coverageUncovered: coverageOf(template.questions).uncovered.map((clause) => clause.no),
      standardDraftDate: STANDARD_BASELINE.standardDraftDate,
      standardPdfSha256: STANDARD_BASELINE.standardPdfSha256,
      questions: template.questions.map((question) => ({ ...question })),
    }));
}
