/**
 * 分区管理 · 「填写记录」聚合（2026-11-01 用户裁决）。
 *
 * 口径：
 * - 一行 = **一个表单 × 一份任务/问卷**：「表单名称」列才有区分意义，
 *   也才能从表单配置列表点「填写记录」带入表单名称筛出该表单的全部明细；
 * - 只聚合绑定了填写分区的表单（`SectionForm.sectionKey`）；自定义表单没有填写存储，不出记录；
 * - 字段值与完成度一律读 `readSectionValues`（问卷工作区第 4 步的同一份存储，不另建第二套）；
 * - 通用材料是功能级资料库（跨问卷共用），行粒度 = 功能：任务编号空、填表人取功能负责人；
 * - 状态归一为 待填写 / 填写中 / 审核中 / 已完成 / 已退回 五态（各分区原始状态映射见下表），
 *   避免七个分区各自的枚举直接混进同一列；
 * - 读取失败的来源整段跳过（功能台账不可用等），不阻断其它分区；
 *   基础信息 / 匿名化 两个网关在未接后端时抛 service-unavailable，此处回落到同口径的本地派生视图。
 */
import { MOCK_CURRENT_USER, surveyRecords, visibleSurveysFor, type SurveyStatus } from '../../surveys/data/surveys';
import { ensureSurveyMatching } from '../../surveys/data/matching';
import { loadLedger } from '../../function-ledger/data/storage';
import { ANONYMIZATION_STATUS_BY_PHASE, type AnonymizationRecord } from './anonymization';
import { anonymizationGateway } from './anonymizationGateway';
import { basicInfoTasks, type BasicInfoTask } from './basicInfo';
import { basicInfoGateway } from './basicInfoGateway';
import { listBiometricRecords, prepareBiometricRecords } from './biometric';
import { fieldsOf, type SectionKey } from './sectionCatalog';
import { readSectionValues, sectionOverview } from './sectionProgress';
import { materialRows, offLedgerFunctions, type MaterialFunction } from './materials';
import { sensorTasks } from './sensors';
import { sectionForms, type SectionForm } from './sectionForms';
import { transmissionTasks } from './transmission';

export type FormRecordStatus = 'pending' | 'filling' | 'reviewing' | 'complete' | 'returned';

export const FORM_RECORD_STATUSES = ['pending', 'filling', 'reviewing', 'complete', 'returned'] as const satisfies readonly FormRecordStatus[];

/** 分区任务的原始状态 → 归一状态 */
const SURVEY_PHASE_STATUS: Partial<Record<SurveyStatus, FormRecordStatus>> = {
  'section-filling': 'filling',
  'section-reviewing': 'reviewing',
  archived: 'complete',
};

/** 基础信息任务状态（filling/submitted/returned/reviewed） */
const BASIC_TASK_STATUS: Record<string, FormRecordStatus> = {
  filling: 'filling', submitted: 'reviewing', returned: 'returned', reviewed: 'complete',
};

/** 数据传输 / 传感器任务状态（filling/reviewing/archived） */
const TASK_STATUS: Record<string, FormRecordStatus> = { filling: 'filling', reviewing: 'reviewing', archived: 'complete' };

/** 匿名化任务状态（pending/filling/reviewing/archived） */
const ANONYMIZATION_STATUS: Record<string, FormRecordStatus> = {
  pending: 'pending', filling: 'filling', reviewing: 'reviewing', archived: 'complete',
};

/** 通用材料完成度（empty/partial/complete） */
const MATERIAL_STATUS: Record<string, FormRecordStatus> = { empty: 'pending', partial: 'filling', complete: 'complete' };

export interface FormRecordField {
  code: string;
  labelZh: string;
  labelEn: string;
  value: string;
  /**
   * 主数据字段（只读引用功能台账、创建问卷时快照带入）。
   * 判定口径与表单配置一致：取该分区表单里 `locked` 的字段名，不在此硬编码字段位，
   * 因此基础信息只有「功能说明」会被标为主数据（功能编号/功能名称是身份列，不在目录字段里）。
   */
  master: boolean;
}

export interface SectionFormRecord {
  /** 行键：表单编号 + 分区 + 任务维度唯一值 */
  key: string;
  formId: string;
  formName: string;
  sectionKey: SectionKey;
  /** 任务编号（= 问卷唯一编号 S-YYYY-####）；通用材料为功能级，留空 */
  taskNo: string;
  /** 任务名称（天枢下发的任务名称）；通用材料为功能级，留空 */
  taskName: string;
  functionName: string;
  fuliId: string;
  respondent: string;
  status: FormRecordStatus;
  filled: number;
  total: number;
  updatedAt: string;
  fields: FormRecordField[];
}

/** 分区内字段（排除选填）作为完成度口径：已填字段数 / 参与字段数 */
function countFilled(section: SectionKey, values: Record<string, string>): { filled: number; total: number } {
  const counted = fieldsOf(section).filter((field) => !field.optional);
  return {
    filled: counted.filter((field) => (values[field.code] ?? '').trim()).length,
    total: counted.length,
  };
}

/** 该分区表单里被标记为主数据的字段名（`locked`），用于明细抽屉的主数据徽标 */
function masterFieldNames(section: SectionKey): Set<string> {
  const form = sectionForms.find((item) => item.sectionKey === section);
  return new Set((form?.fields ?? []).filter((field) => field.locked).map((field) => field.name.trim()));
}

/**
 * 预置表单的前置主数据占位字段：A 功能编号、B 功能名称（`sectionForms` 的 MASTER_FIELDS）。
 * 七个预置表单的字段序列都是「A、B + 业务字段 C 起」，明细必须同序展示，
 * 值取记录的身份列（`fuliId` / `functionName`），与表单配置的字段数一致。
 */
function masterIdentityFields(fuliId: string, functionName: string): FormRecordField[] {
  return [
    { code: 'A', labelZh: '功能编号', labelEn: 'Function ID', value: fuliId, master: true },
    { code: 'B', labelZh: '功能名称', labelEn: 'Function name', value: functionName, master: true },
  ];
}

function buildFields(section: SectionKey, values: Record<string, string>): FormRecordField[] {
  const masters = masterFieldNames(section);
  return fieldsOf(section).map((field) => ({
    code: field.code,
    labelZh: field.labelZh,
    labelEn: field.labelEn,
    value: (values[field.code] ?? '').trim(),
    master: masters.has(field.labelZh.trim()),
  }));
}

/** 同一份问卷的分区值只读一次（7 个分区共享缓存，避免重复读 storage） */
function createValuesReader() {
  const cache = new Map<string, Record<SectionKey, Record<string, string>>>();
  return (surveyId: string): Record<SectionKey, Record<string, string>> => {
    if (!surveyId) return {} as Record<SectionKey, Record<string, string>>;
    const cached = cache.get(surveyId);
    if (cached) return cached;
    const values = readSectionValues(surveyId);
    cache.set(surveyId, values);
    return values;
  };
}

/**
 * 网关未接后端时的本地派生视图：生产构建里 basicInfo / anonymization 网关按契约抛
 * service-unavailable（生产不回落本地数据），此处与两个 Gateway 的 localRecords 同口径派生，
 * 保证原型在 dev 与预览构建里看到同一份记录。接入真实后端后网关正常返回，不再走这里。
 */
interface BasicRow extends BasicInfoTask { functionName: string; fuliId: string }

function localBasicRecords(): BasicRow[] {
  const surveys = new Map(visibleSurveysFor(surveyRecords, MOCK_CURRENT_USER).map((survey) => [survey.id, survey]));
  return basicInfoTasks.flatMap((task) => {
    const survey = surveys.get(task.surveyId);
    return survey ? [{ ...task, functionName: survey.functionName, fuliId: survey.fuliId }] : [];
  });
}

function localAnonymizationRecords(read: (surveyId: string) => Record<SectionKey, Record<string, string>>): AnonymizationRecord[] {
  const visible = new Set(visibleSurveysFor(surveyRecords, MOCK_CURRENT_USER).map((record) => record.id));
  return surveyRecords
    .filter((record) => visible.has(record.id) && ANONYMIZATION_STATUS_BY_PHASE[record.status])
    .flatMap<AnonymizationRecord>((record) => {
      ensureSurveyMatching(record);
      const progress = sectionOverview(record.id, record.matching).sections
        .find((section) => section.key === 'anonymization');
      const status = ANONYMIZATION_STATUS_BY_PHASE[record.status];
      if (!progress || progress.participating === 0 || !status) return [];
      return [{
        id: `AN-${record.id.slice(-4)}`,
        surveyId: record.id,
        fuliId: record.fuliId,
        functionName: record.functionName,
        assignee: record.respondent,
        owner: record.owner,
        status,
        updatedAt: record.updatedAt,
        values: { ...(read(record.id).anonymization ?? {}) },
        participating: progress.participating,
        filled: progress.filled,
      }];
    });
}

interface SourceRow {
  unique: string;
  taskNo: string;
  taskName: string;
  functionName: string;
  fuliId: string;
  respondent: string;
  status: FormRecordStatus;
  updatedAt: string;
  values: Record<string, string>;
}

/** 读取七个分区的记录来源，按「表单 × 任务」拍平成统一行 */
export async function listFormRecords(): Promise<SectionFormRecord[]> {
  const forms = new Map<SectionKey, SectionForm>();
  for (const form of sectionForms) if (form.sectionKey) forms.set(form.sectionKey, form);

  const readValues = createValuesReader();
  const rows: SectionFormRecord[] = [];

  const push = (section: SectionKey, row: SourceRow) => {
    const form = forms.get(section);
    if (!form) return;
    rows.push({
      key: `${form.id}|${section}|${row.unique}`,
      formId: form.id,
      formName: form.name,
      sectionKey: section,
      taskNo: row.taskNo,
      taskName: row.taskName,
      functionName: row.functionName,
      fuliId: row.fuliId,
      respondent: row.respondent,
      status: row.status,
      updatedAt: row.updatedAt,
      ...countFilled(section, row.values),
      fields: [...masterIdentityFields(row.fuliId, row.functionName), ...buildFields(section, row.values)],
    });
  };

  const visible = visibleSurveysFor(surveyRecords, MOCK_CURRENT_USER);
  const visibleIds = new Set(visible.map((record) => record.id));
  /** 任务名称随问卷带入（通用材料为功能级，无任务名称） */
  const surveyById = new Map(visible.map((record) => [record.id, record]));

  /* 基础信息：分区任务（BI-####）挂问卷编号 */
  let basicRows: BasicRow[];
  try { basicRows = await basicInfoGateway.listRecords(); }
  catch { basicRows = localBasicRecords(); }
  for (const record of basicRows) {
    push('basicInfo', {
      unique: record.surveyId,
      taskNo: record.surveyId,
      taskName: surveyById.get(record.surveyId)?.taskName ?? '',
      functionName: record.functionName,
      fuliId: record.fuliId,
      respondent: record.assignee,
      status: BASIC_TASK_STATUS[record.status] ?? 'filling',
      updatedAt: record.updatedAt,
      values: readValues(record.surveyId).basicInfo ?? {},
    });
  }

  /* 告知与同意：问卷阶段派生的分区记录（无独立任务号） */
  for (const survey of visible) {
    const status = SURVEY_PHASE_STATUS[survey.status];
    if (!status) continue;
    push('consent', {
      unique: survey.id,
      taskNo: survey.id,
      taskName: survey.taskName,
      functionName: survey.functionName,
      fuliId: survey.fuliId,
      respondent: survey.respondent,
      status,
      updatedAt: survey.updatedAt,
      values: readValues(survey.id).consent ?? {},
    });
  }

  /* 数据传输 / 传感器：分区任务表（TR-#### / SE-####），任务号仍按问卷编号展示 */
  for (const task of transmissionTasks) {
    if (!visibleIds.has(task.surveyId)) continue;
    push('transmission', {
      unique: task.id,
      taskNo: task.surveyId,
      taskName: surveyById.get(task.surveyId)?.taskName ?? '',
      functionName: task.functionName,
      fuliId: task.fuliId,
      respondent: task.assignee,
      status: TASK_STATUS[task.status] ?? 'filling',
      updatedAt: task.updatedAt,
      values: readValues(task.surveyId).transmission ?? {},
    });
  }
  for (const task of sensorTasks) {
    if (!visibleIds.has(task.surveyId)) continue;
    push('sensors', {
      unique: task.id,
      taskNo: task.surveyId,
      taskName: surveyById.get(task.surveyId)?.taskName ?? '',
      functionName: task.functionName,
      fuliId: task.fuliId,
      respondent: task.assignee,
      status: TASK_STATUS[task.status] ?? 'filling',
      updatedAt: task.updatedAt,
      values: readValues(task.surveyId).sensors ?? {},
    });
  }

  /* 生物特征与口令：问卷阶段投影（进入分区填写及之后才存在） */
  try {
    prepareBiometricRecords();
    for (const record of listBiometricRecords()) {
      push('biometric', {
        unique: record.id,
        taskNo: record.id,
        taskName: surveyById.get(record.id)?.taskName ?? '',
        functionName: record.functionName,
        fuliId: record.fuliId,
        respondent: record.respondent,
        status: SURVEY_PHASE_STATUS[record.status] ?? 'filling',
        updatedAt: record.updatedAt,
        values: readValues(record.id).biometric ?? {},
      });
    }
  } catch { /* 同上 */ }

  /* 匿名化：只有参与字段 > 0 的问卷才有分区任务 */
  let anonymizationRows: AnonymizationRecord[];
  try { anonymizationRows = await anonymizationGateway.listRecords(); }
  catch { anonymizationRows = localAnonymizationRecords(readValues); }
  for (const record of anonymizationRows) {
    push('anonymization', {
      unique: record.id,
      taskNo: record.surveyId,
      taskName: surveyById.get(record.surveyId)?.taskName ?? '',
      functionName: record.functionName,
      fuliId: record.fuliId,
      respondent: record.assignee,
      status: ANONYMIZATION_STATUS[record.status] ?? 'filling',
      updatedAt: record.updatedAt,
      values: readValues(record.surveyId).anonymization ?? {},
    });
  }

  /* 通用材料：功能级资料库，一行 = 一个功能（任务编号留空、填表人取功能负责人） */
  try {
    const { records: ledger } = await loadLedger();
    const ordered = [...ledger].sort((left, right) => left.createdAt.localeCompare(right.createdAt)
      || left.fuliId.localeCompare(right.fuliId));
    const ledgerIds = new Set(ordered.map((record) => record.fuliId));
    const functions: MaterialFunction[] = [
      ...ordered.map((record) => ({
        fuliId: record.fuliId,
        functionName: record.functionName,
        platformName: record.platformName,
        owner: record.owner,
      })),
      ...offLedgerFunctions(ledgerIds),
    ];
    for (const row of materialRows(functions)) {
      push('materials', {
        unique: row.fuliId,
        taskNo: '',
        taskName: '',
        functionName: row.functionName,
        fuliId: row.fuliId,
        respondent: row.owner,
        status: MATERIAL_STATUS[row.completion] ?? 'pending',
        updatedAt: row.updatedAt,
        values: row.values,
      });
    }
  } catch { /* 功能台账不可用：跳过通用材料 */ }

  return rows.sort((left, right) => (right.updatedAt || '').localeCompare(left.updatedAt || ''));
}
