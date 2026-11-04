/**
 * 匿名化分区的读写网关。
 *
 * - 表单版本：走匿名化版本库（开发态 localStorage，生产由后端版本服务承接）；
 * - 填写记录：不另建任务表（2026-10-27 用户裁决）——按问卷阶段派生分区任务，
 *   字段值读分区存储，因此步骤 4 内联填写与本页始终同源。
 *
 * 生产环境不回落 localStorage：未安装后端适配器时抛 service-unavailable。
 */
import { MOCK_CURRENT_USER, surveyRecords, visibleSurveysFor } from '../../surveys/data/surveys';
import { ensureSurveyMatching } from '../../surveys/data/matching';
import {
  ANONYMIZATION_STATUS_BY_PHASE, type AnonymizationRecord,
} from './anonymization';
import {
  findAnonymizationVersion, readAnonymizationVersions, saveAnonymizationDraft,
  type AnonymizationFormVersion,
} from './anonymizationVersions';
import { fieldDriverMap, readSectionValues, sectionOverview } from './sectionProgress';

export interface AnonymizationPublication {
  version: AnonymizationFormVersion;
  activeVersionId: string;
  publishedAt: string;
}

/** Backend integration contract. Authentication and resource authorization must be enforced by the server. */
export interface AnonymizationGateway {
  listVersions(): Promise<AnonymizationFormVersion[]>;
  getVersion(id: string): Promise<AnonymizationFormVersion | null>;
  saveDraft(version: AnonymizationFormVersion, expectedRevision: number): Promise<AnonymizationFormVersion>;
  /** Atomically make exactly one version current for new section tasks, without changing filled records. */
  publishVersion(id: string, expectedRevision: number): Promise<AnonymizationPublication>;
  listRecords(): Promise<AnonymizationRecord[]>;
  getRecord(id: string): Promise<AnonymizationRecord | null>;
}

let connectedGateway: AnonymizationGateway | null = null;

/** Install the authenticated API adapter during app bootstrap when its contract is available. */
export function installAnonymizationGateway(gateway: AnonymizationGateway): void {
  connectedGateway = gateway;
}

export function canPublishAnonymizationVersion(): boolean {
  return connectedGateway !== null;
}

/**
 * 参与字段为 0 的问卷不生成匿名化分区任务（六分区按适用条款生成并行任务），
 * 因此不进入记录列表；任务编号沿用分区任务口径 AN-<问卷序号>。
 */
function localRecords(): AnonymizationRecord[] {
  const visible = new Set(visibleSurveysFor(surveyRecords, MOCK_CURRENT_USER).map((record) => record.id));
  return surveyRecords
    .filter((record) => visible.has(record.id) && ANONYMIZATION_STATUS_BY_PHASE[record.status])
    .flatMap<AnonymizationRecord>((record) => {
      ensureSurveyMatching(record);
      // 驱动条款按问卷选用的规则解析（2026-11-01 接线）：参与字段为 0 则不生成分区任务
      const progress = sectionOverview(record.id, record.matching, undefined, fieldDriverMap(record)).sections
        .find((section) => section.key === 'anonymization');
      if (!progress || progress.participating === 0) return [];
      const status = ANONYMIZATION_STATUS_BY_PHASE[record.status];
      if (!status) return [];
      return [{
        id: `AN-${record.id.slice(-4)}`,
        surveyId: record.id,
        fuliId: record.fuliId,
        functionName: record.functionName,
        assignee: record.respondent,
        owner: record.owner,
        status,
        updatedAt: record.updatedAt,
        values: { ...readSectionValues(record.id).anonymization },
        participating: progress.participating,
        filled: progress.filled,
      }];
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

// Development-only adapter. Production never falls back to localStorage or derived records.
const developmentGateway: AnonymizationGateway = {
  async listVersions() { return readAnonymizationVersions(); },
  async getVersion(id) { return findAnonymizationVersion(id) ?? null; },
  async saveDraft(version, revision) { return saveAnonymizationDraft(version, revision); },
  async publishVersion() { throw new Error('service-unavailable'); },
  async listRecords() { return localRecords(); },
  async getRecord(id) { return localRecords().find((record) => record.id === id) ?? null; },
};

function gateway(): AnonymizationGateway {
  if (connectedGateway) return connectedGateway;
  if (import.meta.env.DEV) return developmentGateway;
  throw new Error('service-unavailable');
}

export const anonymizationGateway: AnonymizationGateway = {
  listVersions: () => gateway().listVersions(),
  getVersion: (id) => gateway().getVersion(id),
  saveDraft: (version, revision) => gateway().saveDraft(version, revision),
  publishVersion: (id, revision) => gateway().publishVersion(id, revision),
  listRecords: () => gateway().listRecords(),
  getRecord: (id) => gateway().getRecord(id),
};
