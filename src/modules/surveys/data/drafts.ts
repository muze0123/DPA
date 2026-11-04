import { isFunctionEnabled, surveyPhaseFromStatus, type FunctionRecord } from '../../function-ledger/data/ledger';
import type { SurveyRecord } from './surveys';

// The prototype shares the function register's browser database. It is not a server API.
const DB_NAME = 'csa-function-ledger';

/**
 * 本地浏览器库中的草稿 id 集合（surveys.ts 与 matching.ts 共用）：
 * 编辑/提交/确认时才需要回写浏览器库，种子数据只改内存。
 */
export const localSurveyDraftIds = new Set<string>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      const functions = db.createObjectStore('functions', { keyPath: 'id' });
      functions.createIndex('fuliId', 'fuliId', { unique: true });
      const surveys = db.createObjectStore('surveys', { keyPath: 'id' });
      surveys.createIndex('functionId', 'functionId');
      db.createObjectStore('audit', { keyPath: 'id' });
    };
  });
}

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

/** 合法任务编号形态（S-YYYY-####）；早期原型曾在浏览器库残留时间戳形态脏数据 */
const VALID_DRAFT_ID = /^S-\d{4}-\d{4}$/;

export async function loadLocalSurveyDrafts(): Promise<SurveyRecord[]> {
  const db = await openDatabase();
  try {
    const tx = db.transaction('surveys', 'readonly');
    const done = completed(tx);
    const result = new Promise<unknown[]>((resolve, reject) => {
      const request = tx.objectStore('surveys').getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error);
    });
    const rows = await result;
    await done;
    // 编号不合法的历史残留行（如 S-<时间戳>）直接清除，不再进入列表
    const malformedIds = rows
      .filter((row): row is { id: string } => typeof row === 'object' && row !== null
        && 'id' in row && typeof (row as { id: unknown }).id === 'string'
        && !VALID_DRAFT_ID.test((row as { id: string }).id))
      .map((row) => row.id);
    if (malformedIds.length) {
      const cleanup = db.transaction('surveys', 'readwrite');
      for (const id of malformedIds) cleanup.objectStore('surveys').delete(id);
      await completed(cleanup).catch(() => undefined);
    }
    return rows.filter((row): row is SurveyRecord =>
      typeof row === 'object' && row !== null && 'fuliId' in row && 'respondent' in row && 'status' in row
      && 'id' in row && typeof (row as { id: unknown }).id === 'string'
      && VALID_DRAFT_ID.test((row as { id: string }).id));
  } finally { db.close(); }
}

/** 校验绑定功能仍可用且 FuLi ID 一致（新建草稿保存前守卫）；不可用时中止事务并抛错 */
async function assertMasterAvailable(tx: IDBTransaction, functionId: string | undefined, fuliId: string, forCreation: boolean): Promise<void> {
  if (!functionId) return;
  const master = await new Promise<FunctionRecord | undefined>((resolve, reject) => {
    const request = tx.objectStore('functions').get(functionId);
    request.onsuccess = () => resolve(request.result as FunctionRecord | undefined);
    request.onerror = () => reject(request.error);
  });
  if (!master || master.deletedAt || master.fuliId !== fuliId) {
    tx.abort();
    await completed(tx).catch(() => undefined);
    throw new Error('Function is no longer available');
  }
  if (forCreation && !isFunctionEnabled(master)) {
    tx.abort();
    await completed(tx).catch(() => undefined);
    throw new Error('Function is disabled');
  }
}

/** 内存记录可能是响应式代理（嵌套对象含 Proxy），structured clone 会抛 DataCloneError，先深拷贝为纯对象 */
function toPlain(record: SurveyRecord): SurveyRecord {
  return JSON.parse(JSON.stringify(record)) as SurveyRecord;
}

/**
 * 落库行 = 问卷记录 + 绑定功能 + 派生的快照阶段。
 * 台账按 `phase` 派生功能状态，而问卷记录只有业务状态 `status`，
 * 因此写入时同步补 phase（读取侧另有 status→phase 兜底，兼容历史数据）。
 */
function snapshotRow(record: SurveyRecord, functionId: string | undefined) {
  return { ...toPlain(record), functionId, phase: surveyPhaseFromStatus(record.status) };
}

export async function saveLocalSurveyDraft(record: SurveyRecord, functionId: string): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(['functions', 'surveys', 'audit'], 'readwrite');
    const done = completed(tx);
    await assertMasterAvailable(tx, functionId, record.fuliId, true);
    tx.objectStore('surveys').add(snapshotRow(record, functionId));
    tx.objectStore('audit').add({
      id: crypto.randomUUID(), functionId, action: 'create-survey', actor: record.sourceOperator,
      time: new Date().toISOString(), target: record.id,
    });
    await done;
  } finally { db.close(); }
}

/**
 * 编辑/提交/作答回写：put 语义按 id 覆盖，审计记 update-survey。
 * functionId 未显式给出时继承库中既有绑定（in-memory 记录不携带该字段）。
 *
 * 绑定校验只做「尽力对齐」，不再中止事务（2026-11-04 用户反馈修复）：
 * 作答/保存是核心动作，不能因台账漂移（历史 FuLi ID 规范化、绑定功能被删）而
 * 整体失败——绑定量仍按 functionId 保留；主数据在且未删除时以其 FuLi ID 为准
 * 回写记录（修复 DEMO-FL 前缀历史草稿），主数据缺失时按记录原值落库。
 * 完整性强校验只保留在新建草稿入口（saveLocalSurveyDraft）。
 */
export async function updateLocalSurveyDraft(record: SurveyRecord, functionId?: string): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(['functions', 'surveys', 'audit'], 'readwrite');
    const done = completed(tx);
    const store = tx.objectStore('surveys');
    const storedFunctionId = functionId ?? await new Promise<string | undefined>((resolve, reject) => {
      const request = store.get(record.id);
      request.onsuccess = () => resolve((request.result as (SurveyRecord & { functionId?: string }) | undefined)?.functionId);
      request.onerror = () => reject(request.error);
    });
    const master = storedFunctionId
      ? await new Promise<FunctionRecord | undefined>((resolve, reject) => {
        const request = tx.objectStore('functions').get(storedFunctionId);
        request.onsuccess = () => resolve(request.result as FunctionRecord | undefined);
        request.onerror = () => reject(request.error);
      })
      : undefined;
    if (master && !master.deletedAt && master.fuliId !== record.fuliId) record.fuliId = master.fuliId;
    store.put(snapshotRow(record, storedFunctionId));
    tx.objectStore('audit').add({
      id: crypto.randomUUID(), functionId: storedFunctionId, action: 'update-survey', actor: record.sourceOperator,
      time: new Date().toISOString(), target: record.id,
    });
    await done;
  } finally { db.close(); }
}

export async function deleteLocalSurveyDraft(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction('surveys', 'readwrite');
    tx.objectStore('surveys').delete(id);
    await completed(tx);
  } finally { db.close(); }
}
