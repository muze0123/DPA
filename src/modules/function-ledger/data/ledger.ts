export type DevelopmentLocation = 'china' | 'germany';
export type FunctionStatus = 'not-started' | 'in-progress' | 'completed';

/**
 * 子功能与控制器为 1:N（2026-10-29 用户裁决）：一个子功能可配置多个控制器。
 * 旧记录（本地库）存的是 { name, controller } 单控制器结构，读取时由
 * normalizeSubfunctions 归一为 controllers 数组，写入统一用新结构。
 */
export interface Subfunction {
  name: string;
  controllers: string[];
}

/** 兼容读取旧版子功能结构（controller 单数），新结构原样返回 */
export function normalizeSubfunctions(subfunctions: unknown): Subfunction[] {
  if (!Array.isArray(subfunctions)) return [];
  return subfunctions
    .map((item): Subfunction | null => {
      if (typeof item !== 'object' || item === null) return null;
      const { name } = item as { name?: unknown };
      const rawControllers = (item as { controllers?: unknown }).controllers;
      const legacyController = (item as { controller?: unknown }).controller;
      const controllers = Array.isArray(rawControllers)
        ? rawControllers.map((value) => String(value ?? '').trim()).filter(Boolean)
        : [String(legacyController ?? '').trim()].filter(Boolean);
      return { name: String(name ?? '').trim(), controllers };
    })
    .filter((item): item is Subfunction => Boolean(item));
}

/** 展示用「子功能 / 控制器」文本；兼容旧快照中单控制器（controller）结构 */
export function subfunctionSummary(item: Subfunction): string {
  const controllers = normalizeSubfunctions([item])[0]?.controllers ?? [];
  return `${item.name} / ${controllers.join('、')}`;
}

export interface ResponsibleDepartment {
  name: string;
  department: string;
}

export interface FunctionInput {
  platformName: string;
  fuliId: string;
  functionName: string;
  /**
   * 功能描述（2026-10-27 用户裁决 · 方案 A）：工作簿封面「功能基本信息」的功能级主数据。
   * 基本信息分区的「功能说明」（C 列）只读引用本字段随问卷快照带入，不再单独填写。
   * 选填：导入旧版工作簿（无该列）不视为错误。
   */
  functionDescription: string;
  subfunctions: Subfunction[];
  owner: string;
  department: string;
  responsibles?: ResponsibleDepartment[];
  developmentLocation: DevelopmentLocation | '';
  masterEcu: string;
}

export interface FunctionRecord extends FunctionInput {
  developmentLocation: DevelopmentLocation;
  id: string;
  creator: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  disabledAt?: string | null;
  availabilityReason?: string;
}

export function isFunctionEnabled(record: FunctionRecord): boolean {
  return !record.deletedAt && !record.disabledAt;
}

export type SurveyPhase =
  | 'draft' | 'pending-confirm' | 'matching-reviewing'
  | 'section-filling' | 'section-reviewing' | 'completed' | 'archived';

export interface SurveySnapshot {
  id: string;
  functionId: string;
  /** 台账侧快照自带阶段；问卷库中的记录只有业务状态（status），二者取其一 */
  phase?: SurveyPhase;
  status?: string;
  updatedAt: string;
}

const LOCKED_PHASES: ReadonlySet<SurveyPhase> = new Set([
  'section-filling', 'section-reviewing', 'completed', 'archived',
]);

/**
 * 问卷业务状态 → 台账快照阶段。
 * 「待填写」与「草稿」同属未进入匹配审核的阶段，归入 draft；其余同名直映。
 * 问卷库记录不写 phase 字段，派生功能状态时需要这层映射兜底。
 */
export function surveyPhaseFromStatus(status: string | undefined): SurveyPhase | undefined {
  switch (status) {
    case 'draft':
    case 'pending':
    case 'pending-fill':
      return 'draft';
    case 'pending-confirm':
    case 'matching-reviewing':
    case 'section-filling':
    case 'section-reviewing':
    case 'completed':
    case 'archived':
      return status;
    default:
      return undefined;
  }
}

/**
 * 功能评估状态 = 该功能「最新一份问卷」的阶段派生（不落库，每次计算）：
 * 最新问卷处于锁定及之后阶段 → 已评估完；否则 → 进行中；无问卷 → 未开始。
 * 同一功能可有多份问卷，新建即成为最新一份，状态随之回落「进行中」。
 */
export function functionStatus(record: FunctionRecord, surveys: SurveySnapshot[]): FunctionStatus {
  const latest = surveys
    .filter((survey) => survey.functionId === record.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))[0];
  if (!latest) return 'not-started';
  const phase = latest.phase ?? surveyPhaseFromStatus(latest.status);
  return phase && LOCKED_PHASES.has(phase) ? 'completed' : 'in-progress';
}

export function normalizeFuliId(value: string): string {
  return value.trim();
}

export function responsibleDepartments(input: Pick<FunctionInput, 'owner' | 'department' | 'responsibles'>): ResponsibleDepartment[] {
  if (Array.isArray(input.responsibles)) return input.responsibles;
  return input.owner || input.department ? [{ name: input.owner, department: input.department }] : [];
}

export function normalizeInput(input: FunctionInput): FunctionInput {
  const responsibles = responsibleDepartments(input).map(({ name, department }) => ({
    name: name.trim(), department: department.trim(),
  }));
  return {
    platformName: input.platformName.trim(),
    fuliId: normalizeFuliId(input.fuliId),
    functionName: input.functionName.trim(),
    functionDescription: (input.functionDescription ?? '').trim(),
    subfunctions: normalizeSubfunctions(input.subfunctions),
    owner: responsibles[0]?.name ?? '',
    department: responsibles[0]?.department ?? '',
    responsibles,
    developmentLocation: input.developmentLocation,
    masterEcu: input.masterEcu.trim(),
  };
}

export type ValidationField = 'platformName' | 'fuliId' | 'functionName' | 'responsibles' | 'developmentLocation' | 'subfunctions';

export function validateInput(input: FunctionInput): ValidationField[] {
  const errors: ValidationField[] = [];
  if (!input.platformName.trim()) errors.push('platformName');
  if (!input.fuliId.trim()) errors.push('fuliId');
  else if (input.fuliId.trim().length > 32) errors.push('fuliId');
  if (!input.functionName.trim()) errors.push('functionName');
  const responsibles = responsibleDepartments(input);
  if (!responsibles.length || responsibles.some(({ name, department }) => !name.trim() || !department.trim())) errors.push('responsibles');
  if (!['china', 'germany'].includes(input.developmentLocation)) errors.push('developmentLocation');
  if (input.subfunctions.some(({ name, controllers }) => !name.trim() || !controllers.length || controllers.some((controller) => !controller.trim()) || name.includes('|') || controllers.some((controller) => controller.includes('|')))) errors.push('subfunctions');
  return errors;
}
