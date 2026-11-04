/**
 * 分区完成度与字段四态着色引擎（05 方案 §4.2 + 状态机 §8.2 决策表 C1–C7）。
 *
 * 口径（02 §8.3，两套口径必须同时标注）：
 * - 字段着色：驱动条款全部不适用或未判定 → 灰（未作答按自动值兜底为不适用）；
 * - 参与字段（完成度分母）＝ 至少 1 条驱动条款最终适用 且 字段在任务模型内（carried）；
 * - 补充字段（无驱动条款，C1）无色、不计完成度；
 * - 通用材料（第七分区）没有条款映射：必交字段 `alwaysCounted` 恒参与（有值即白、无值即黄），
 *   备注 `optional` 无色、不计分母；
 * - 完成度分母为 0 → 显示「—」不显示 0%（BR-038 / DEV-03）。
 *
 * 字段值来源为该分区既有任务模型（基础信息任务 / 告知与同意草稿 / 传输任务 /
 * 传感器任务 / 新增两分区的本地库），不在此另建第二套存储。
 */
import {
  finalApplicability, sectionDriversOfMatching, sectionDriversOfRecord,
} from '../../surveys/data/matching';
import type { SurveyMatching } from '../../surveys/data/surveys';
import { localSurveyDraftIds, updateLocalSurveyDraft } from '../../surveys/data/drafts';
import { surveyRecords, type SurveyRecord } from '../../surveys/data/surveys';
import { basicInfoTasks } from './basicInfo';
import { loadConsentDraft } from './consent';
import { sensorTasks } from './sensors';
import { transmissionTasks } from './transmission';
import { loadSectionValues } from './sectionValues';
import { loadMaterialValuesOfSurvey } from './materials';
import { anonymizationSamples } from './anonymization';
import { loadInlineSectionDraft } from './inlineSectionDraft';
import {
  SECTION_DEFS, SECTION_KEYS,
  type CatalogField, type SectionKey,
} from './sectionCatalog';
import { runtimeFieldsOf } from './sectionRuntime';

/** 四态着色（C1–C7）：无色 / 灰 / 黄 / 白 */
export type FieldShade = 'plain' | 'gray' | 'yellow' | 'white';

/** 规则驱动的字段位映射：`${分区}:${字段位字母}` → 驱动该字段的条款号[]（2026-11-01 接线） */
export type FieldDriverMap = Record<string, string[]>;

/** 该问卷的字段驱动映射（快照冻结优先 → 现行规则 → null 回退字段目录静态 drivers） */
export function fieldDriverMap(record: SurveyRecord): FieldDriverMap | null {
  return sectionDriversOfRecord(record);
}

/**
 * 字段的驱动条款：有规则映射时以规则为准（键缺失即补充字段，返回空数组，
 * 对应「该条款已被改配到其他字段位」的语义）；无规则信息时回退字段目录静态值。
 */
export function driversOfField(field: CatalogField, drivers?: FieldDriverMap | null): string[] {
  if (!drivers) return field.drivers;
  return drivers[`${field.section}:${field.code}`] ?? [];
}

export function fieldShade(
  field: CatalogField,
  value: string | undefined,
  matching?: SurveyMatching,
  drivers?: FieldDriverMap | null,
): FieldShade {
  // 选填字段（通用材料「备注」）：无色、不计分母
  if (field.optional) return 'plain';
  // 非条款驱动但必交（通用材料 C/D）：不读条款适用性，有值即白
  if (field.alwaysCounted) return (value ?? '').trim() ? 'white' : 'yellow';
  const list = driversOfField(field, drivers);
  if (!list.length) return 'plain';
  if (!matching) return 'gray';
  const finals = list.map((no) => finalApplicability(matching, no));
  if (finals.includes('applicable')) return (value ?? '').trim() ? 'white' : 'yellow';
  // 全部不适用（C2/C3/C7）或含未判定（C6）→ 灰，不可编辑、不计完成度
  return 'gray';
}

/** 旧任务值作初始值；详情页按问卷隔离的本地填写覆盖该问卷的旧任务投影。 */
export function readSectionValues(surveyId: string): Record<SectionKey, Record<string, string>> {
  const inline = loadInlineSectionDraft(surveyId);
  const basic = basicInfoTasks.find((task) => task.surveyId === surveyId)?.values ?? {};
  const transmission = transmissionTasks.find((task) => task.surveyId === surveyId)?.values;
  const sensorRow = sensorTasks.find((task) => task.surveyId === surveyId)?.rows[0];
  return {
    basicInfo: { ...Object.fromEntries(Object.entries(basic).map(([code, value]) => [code, value ?? ''])), ...inline.basicInfo },
    consent: { ...loadConsentDraft(surveyId), ...inline.consent },
    transmission: transmission
      ? { C: transmission.encryption, D: transmission.overseas, E: transmission.destination, ...inline.transmission }
      : { ...inline.transmission },
    // 通用 54 字段视图只投影功能主行；多条传感器明细仍由任务模型独立保存。
    sensors: sensorRow
      ? {
        D: sensorRow.type,
        E: sensorRow.precision,
        F: sensorRow.location,
        G: sensorRow.function,
        ...inline.sensors,
      }
      : { ...inline.sensors },
    biometric: loadSectionValues('biometric', surveyId),
    // 匿名化：历史分区值作初始值，本页保存的分区草稿覆盖它（与其余分区同口径）
    anonymization: { ...anonymizationSamples[surveyId], ...loadSectionValues('anonymization', surveyId) },
    // 通用材料：功能级资料库（跨问卷共用），按问卷的 FuLi ID 投影
    materials: loadMaterialValuesOfSurvey(surveyId),
  };
}

export interface SectionProgress {
  key: SectionKey;
  /** 目录字段数（口径展示用，如 24） */
  total: number;
  /** 已承载字段数（现任务模型可填） */
  carried: number;
  /** 参与字段数 = 完成度分母 */
  participating: number;
  /** 已填（白） */
  filled: number;
  /** 必填未填（黄） */
  pending: number;
  /** 不适用/未判定（灰） */
  gray: number;
  /** 补充字段（无色） */
  plain: number;
  /** 该分区未承载字段数（不计入分母，口径提示用） */
  notCarried: number;
}

export interface SectionOverview {
  sections: SectionProgress[];
  participating: number;
  filled: number;
  pending: number;
}

export function sectionOverview(
  surveyId: string,
  matching?: SurveyMatching,
  values: Record<SectionKey, Record<string, string>> = readSectionValues(surveyId),
  drivers?: FieldDriverMap | null,
): SectionOverview {
  // 驱动条款来源：显式传入的问卷级映射（含创建快照冻结）> 快照规则版本的现行映射 > 字段目录静态值
  const driverMap = drivers ?? sectionDriversOfMatching(matching);
  const sections = SECTION_DEFS.map<SectionProgress>((def) => {
    const fields = runtimeFieldsOf(def.key);
    const progress: SectionProgress = {
      key: def.key, total: fields.length, carried: 0, participating: 0,
      filled: 0, pending: 0, gray: 0, plain: 0, notCarried: 0,
    };
    for (const field of fields) {
      if (!field.carried) {
        // 未承载字段（页面尚不可填）：只计入口径提示，不参与着色与完成度分母
        progress.notCarried += 1;
        continue;
      }
      progress.carried += 1;
      const shade = fieldShade(field, values[def.key][field.code], matching, driverMap);
      if (shade === 'plain') progress.plain += 1;
      else if (shade === 'gray') progress.gray += 1;
      else {
        progress.participating += 1;
        if (shade === 'white') progress.filled += 1;
        else progress.pending += 1;
      }
    }
    return progress;
  });
  return {
    sections,
    participating: sections.reduce((sum, section) => sum + section.participating, 0),
    filled: sections.reduce((sum, section) => sum + section.filled, 0),
    pending: sections.reduce((sum, section) => sum + section.pending, 0),
  };
}

/** 完成率：分母 0 → null（页面渲染「—」，禁止 0%，BR-038） */
export function completionRate(overview: SectionOverview): number | null {
  return overview.participating === 0 ? null : Math.round((overview.filled / overview.participating) * 100);
}

export interface SectionGap {
  section: SectionKey;
  codes: string[];
}

export interface GateResult {
  ok: boolean;
  gaps: SectionGap[];
  /** 黄格总数 */
  pending: number;
}

/** 提交填写门禁（05 §4.2.6）：参与字段全部转白；缺项按分区列出字段位供定位 */
export function checkSectionGate(record: SurveyRecord): GateResult {
  const values = readSectionValues(record.id);
  const drivers = fieldDriverMap(record);
  const gaps: SectionGap[] = [];
  let pending = 0;
  for (const key of SECTION_KEYS) {
    const codes = runtimeFieldsOf(key)
      .filter((field) => field.carried
        && fieldShade(field, values[key][field.code], record.matching, drivers) === 'yellow')
      .map((field) => field.code);
    if (codes.length) {
      gaps.push({ section: key, codes });
      pending += codes.length;
    }
  }
  return { ok: pending === 0, gaps, pending };
}

/**
 * 提交填写（N5）：待填写分区 → 分区审核中；门禁未通过时返回缺项不迁移。
 * 与步骤3 的提交同口径：本地草稿落库失败回滚状态。
 */
export async function submitSectionFilling(recordId: string): Promise<GateResult> {
  const record = surveyRecords.find((item) => item.id === recordId);
  if (!record) throw new Error('Survey not found');
  if (record.status !== 'section-filling') throw new Error('Only section-filling surveys can be submitted');
  const gate = checkSectionGate(record);
  if (!gate.ok) return gate;
  const previousStatus = record.status;
  const previousUpdatedAt = record.updatedAt;
  record.status = 'section-reviewing';
  record.reviewer = '赵敏';
  record.updatedAt = nowText();
  try {
    if (localSurveyDraftIds.has(recordId)) await updateLocalSurveyDraft(record);
  } catch (error) {
    record.status = previousStatus;
    record.updatedAt = previousUpdatedAt;
    throw error;
  }
  return gate;
}

function nowText(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/* ------------------------------------------------------------ 改答重算检测 */

const SNAPSHOT_PREFIX = 'csa-section-states:v1';

/**
 * 着色快照比对（05 §4.3）：本次进入页面时与上次快照比较，
 * 返回「灰→黄」与「黄→灰」的格数供横幅提示。快照本身只存在浏览器本地。
 */
export function diffShadeSnapshot(record: SurveyRecord): { grayToYellow: number; yellowToGray: number } {
  const values = readSectionValues(record.id);
  const drivers = fieldDriverMap(record);
  const current: Record<string, FieldShade> = {};
  for (const key of SECTION_KEYS) {
    for (const field of runtimeFieldsOf(key)) {
      const shade = fieldShade(field, values[key][field.code], record.matching, drivers);
      if (shade !== 'plain') current[`${key}.${field.code}`] = shade;
    }
  }
  let grayToYellow = 0;
  let yellowToGray = 0;
  try {
    const raw = localStorage.getItem(`${SNAPSHOT_PREFIX}:${record.id}`);
    if (raw) {
      const previous = JSON.parse(raw) as Record<string, FieldShade>;
      for (const [key, shade] of Object.entries(current)) {
        const before = previous[key];
        if (before === 'gray' && shade === 'yellow') grayToYellow += 1;
        if (before === 'yellow' && shade === 'gray') yellowToGray += 1;
      }
    }
    localStorage.setItem(`${SNAPSHOT_PREFIX}:${record.id}`, JSON.stringify(current));
  } catch {
    // 本地库不可用时只跳过横幅，不影响页面统计
  }
  return { grayToYellow, yellowToGray };
}
