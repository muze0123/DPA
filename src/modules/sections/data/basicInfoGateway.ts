import { basicInfoTasks, type BasicInfoTask } from './basicInfo';
import {
  findBasicVersion, readBasicVersions, saveBasicDraft, type BasicFormVersion,
} from './basicInfoVersions';
import { MOCK_CURRENT_USER, surveyRecords, visibleSurveysFor } from '../../surveys/data/surveys';

export interface BasicRecordView extends BasicInfoTask {
  functionName: string;
  fuliId: string;
  /**
   * 功能说明（方案 A，2026-10-27）：来自功能台账「功能描述」，随问卷创建快照只读带入；
   * 任务模型不再承载该字段（历史 values.C 仅作兜底）。
   */
  functionDescription: string;
}

export interface BasicPublication {
  version: BasicFormVersion;
  activeVersionId: string;
  publishedAt: string;
}

/** Backend integration contract. Authentication and resource authorization must be enforced by the server. */
export interface BasicInfoGateway {
  listVersions(): Promise<BasicFormVersion[]>;
  getVersion(id: string): Promise<BasicFormVersion | null>;
  saveDraft(version: BasicFormVersion, expectedRevision: number): Promise<BasicFormVersion>;
  /** Atomically make exactly one version current for new surveys, without changing existing survey snapshots. */
  publishVersion(id: string, expectedRevision: number): Promise<BasicPublication>;
  listRecords(): Promise<BasicRecordView[]>;
  getRecord(id: string): Promise<BasicRecordView | null>;
}

let connectedGateway: BasicInfoGateway | null = null;

/** Install the authenticated API adapter during app bootstrap when its contract is available. */
export function installBasicInfoGateway(gateway: BasicInfoGateway): void {
  connectedGateway = gateway;
}

export function canPublishBasicVersion(): boolean { return connectedGateway !== null; }

function localRecords(): BasicRecordView[] {
  const surveys = new Map(visibleSurveysFor(surveyRecords, MOCK_CURRENT_USER)
    .map((survey) => [survey.id, survey]));
  return basicInfoTasks.flatMap((task) => {
    const survey = surveys.get(task.surveyId);
    return survey ? [{
      ...task, functionName: survey.functionName, fuliId: survey.fuliId,
      functionDescription: survey.creationSnapshot?.function.functionDescription ?? '',
    }] : [];
  });
}

// Development-only adapter. Production never falls back to localStorage or hard-coded records.
const developmentGateway: BasicInfoGateway = {
  async listVersions() { return readBasicVersions(); },
  async getVersion(id) { return findBasicVersion(id) ?? null; },
  async saveDraft(version, revision) { return saveBasicDraft(version, revision); },
  async publishVersion() { throw new Error('service-unavailable'); },
  async listRecords() { return localRecords(); },
  async getRecord(id) { return localRecords().find((record) => record.id === id) ?? null; },
};

function gateway(): BasicInfoGateway {
  if (connectedGateway) return connectedGateway;
  if (import.meta.env.DEV) return developmentGateway;
  throw new Error('service-unavailable');
}

export const basicInfoGateway: BasicInfoGateway = {
  listVersions: () => gateway().listVersions(),
  getVersion: (id) => gateway().getVersion(id),
  saveDraft: (version, revision) => gateway().saveDraft(version, revision),
  publishVersion: (id, revision) => gateway().publishVersion(id, revision),
  listRecords: () => gateway().listRecords(),
  getRecord: (id) => gateway().getRecord(id),
};
