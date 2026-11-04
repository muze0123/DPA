import { functionStatus, isFunctionEnabled, normalizeInput, normalizeFuliId, normalizeSubfunctions, validateInput, type FunctionInput, type FunctionRecord, type SurveySnapshot } from './ledger';
import { MOCK_FUNCTION_RECORDS } from './mockLedger';

const DB_NAME = 'csa-function-ledger';
const DB_VERSION = 1;
const SETTINGS_KEY = 'csa-function-ledger-preferences-v1';
let databasePromise: Promise<IDBDatabase> | null = null;
let mockBootstrapPromise: Promise<void> | null = null;
let seedNormalizePromise: Promise<void> | null = null;

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'));
  });
}

/** IDBTransaction.readyState 未进入 TS lib.dom 类型，按可选属性读取，仅 active 时才安全中止 */
function transactionActive(tx: IDBTransaction): boolean {
  return (tx as { readyState?: string }).readyState === 'active';
}

function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const pending = indexedDB.open(DB_NAME, DB_VERSION);
      pending.onupgradeneeded = () => {
        const db = pending.result;
        const functions = db.createObjectStore('functions', { keyPath: 'id' });
        functions.createIndex('fuliId', 'fuliId', { unique: true });
        const surveys = db.createObjectStore('surveys', { keyPath: 'id' });
        surveys.createIndex('functionId', 'functionId');
        db.createObjectStore('audit', { keyPath: 'id' });
      };
      pending.onsuccess = () => resolve(pending.result);
      pending.onerror = () => reject(pending.error);
      pending.onblocked = () => reject(new Error('Database upgrade blocked by another tab'));
    }).catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
  }
  // catch 回调里会把 databasePromise 置回 null，收窄在这里失效；此行同步执行时不可能为 null
  return databasePromise as Promise<IDBDatabase>;
}

export async function loadLedger(): Promise<{ records: FunctionRecord[]; surveys: SurveySnapshot[] }> {
  const db = await openDatabase();
  await ensureMockLedger(db);
  await normalizeSeedFuliIds(db);
  const tx = db.transaction(['functions', 'surveys'], 'readonly');
  const records = request(tx.objectStore('functions').getAll() as IDBRequest<FunctionRecord[]>);
  const surveys = request(tx.objectStore('surveys').getAll() as IDBRequest<SurveySnapshot[]>);
  const result = await Promise.all([records, surveys, transactionDone(tx)]);
  return {
    // 子功能 1:N（2026-10-29）：旧记录存的是 { name, controller }，读取时归一为 controllers 数组
    records: result[0].filter((record) => !record.deletedAt).map((record) => ({ ...record, subfunctions: normalizeSubfunctions(record.subfunctions) })),
    surveys: result[1],
  };
}

/**
 * 一次性数据规范化（2026-10-26）：早期种子数据把 FuLi ID 生成为 DEMO-FL-00N，
 * 属于演示标识，不应出现在业务界面（同一功能也会出现在问卷创建、导出等场景）。
 * 这里把已存在的本地库中该前缀改写为 FL-2025-NNNN：幂等、不改记录主键，
 * 问卷快照通过 functionId 关联因此不受影响；唯一索引冲突时跳过该条，不覆盖用户数据。
 * 2026-11-04 补充：surveys 草稿行的 fuliId 一并改写——此前只改 functions，
 * 历史草稿残留 DEMO 前缀导致 updateLocalSurveyDraft 绑定校验永远失败、无法作答。
 */
function normalizeSeedFuliIds(db: IDBDatabase): Promise<void> {
  if (!seedNormalizePromise) {
    seedNormalizePromise = (async () => {
      const tx = db.transaction(['functions', 'surveys'], 'readwrite');
      const store = tx.objectStore('functions');
      const surveys = tx.objectStore('surveys');
      const done = transactionDone(tx);
      try {
        const all = await request(store.getAll() as IDBRequest<FunctionRecord[]>);
        for (const record of all) {
          const match = /^DEMO-FL-(\d+)$/.exec(record.fuliId);
          if (!match) continue;
          const nextId = `FL-2025-${match[1].padStart(4, '0')}`;
          const clash = await request(store.index('fuliId').get(nextId) as IDBRequest<FunctionRecord | undefined>);
          if (clash && clash.id !== record.id) continue;
          store.put({ ...record, fuliId: nextId });
        }
        const drafts = await request(surveys.getAll() as IDBRequest<{ id: string; fuliId: string }[]>);
        for (const draft of drafts) {
          const match = /^DEMO-FL-(\d+)$/.exec(draft.fuliId);
          if (!match) continue;
          surveys.put({ ...draft, fuliId: `FL-2025-${match[1].padStart(4, '0')}` });
        }
        await done;
      } catch (error) {
        if (transactionActive(tx)) tx.abort();
        await done.catch(() => undefined);
        throw error;
      }
    })().catch((error: unknown) => {
      seedNormalizePromise = null;
      throw error;
    });
  }
  return seedNormalizePromise;
}

function ensureMockLedger(db: IDBDatabase): Promise<void> {
  if (!mockBootstrapPromise) {
    mockBootstrapPromise = (async () => {
      const tx = db.transaction(['functions', 'surveys'], 'readwrite');
      const functions = tx.objectStore('functions');
      const surveys = tx.objectStore('surveys');
      const done = transactionDone(tx);
      try {
        const [functionCount, surveyCount] = await Promise.all([request(functions.count()), request(surveys.count())]);
        if (functionCount === 0 && surveyCount === 0) {
          for (const record of MOCK_FUNCTION_RECORDS) functions.put(record);
        } else {
          for (const record of MOCK_FUNCTION_RECORDS.filter((item) => item.subfunctions.length > 1)) {
            const stored = await request(functions.get(record.id) as IDBRequest<FunctionRecord | undefined>);
            if (!stored) continue;
            const { responsibles: _responsibles, ...previous } = record;
            const oldSubfunctions = { ...previous, subfunctions: previous.subfunctions.slice(0, 1) };
            if (JSON.stringify(stored) === JSON.stringify(previous) || JSON.stringify(stored) === JSON.stringify(oldSubfunctions)) {
              functions.put(record);
            }
          }
          // 演示数据迁移（2026-10-29）：种子记录的 master ECU 从短代码升级为
          // 天枢「零部件」下拉参数（零部件编号-零部件名称），仅限旧格式行
          for (const record of MOCK_FUNCTION_RECORDS) {
            const stored = await request(functions.get(record.id) as IDBRequest<FunctionRecord | undefined>);
            if (!stored || stored.masterEcu === record.masterEcu || /^PN-/.test(stored.masterEcu)) continue;
            functions.put({ ...stored, masterEcu: record.masterEcu });
          }
        }
        // 演示快照清理（2026-10-29）：survey-snapshot-N 只用于早期的状态派生演示，
        // 现状状态与关联问卷计数均以问卷工作台真实问卷为准；这些行没有 status，
        // 却会让删除守卫/存储层「已关联问卷」校验误判，一次性删除
        const allSurveys = await request(surveys.getAll() as IDBRequest<SurveySnapshot[]>);
        for (const snapshot of allSurveys) {
          if (snapshot.id.startsWith('survey-snapshot-')) surveys.delete(snapshot.id);
        }
        await done;
      } catch (error) {
        if (transactionActive(tx)) tx.abort();
        await done.catch(() => undefined);
        throw error;
      }
    })().catch((error: unknown) => {
      mockBootstrapPromise = null;
      throw error;
    });
  }
  return mockBootstrapPromise;
}

function makeRecord(input: FunctionInput, old: FunctionRecord | undefined, actor: string): FunctionRecord {
  const now = new Date().toISOString();
  const normalized = normalizeInput(input);
  if (validateInput(normalized).length) throw new Error('Invalid function data');
  if (!normalized.developmentLocation) throw new Error('Missing development location');
  return {
    ...normalized, developmentLocation: normalized.developmentLocation, id: old?.id ?? crypto.randomUUID(),
    creator: old?.creator ?? actor, createdAt: old?.createdAt ?? now,
    updatedAt: now, deletedAt: null, disabledAt: old?.disabledAt ?? null,
    availabilityReason: old?.availabilityReason ?? '',
  };
}

function addAudit(tx: IDBTransaction, action: string, record: FunctionRecord, actor: string) {
  tx.objectStore('audit').add({
    id: crypto.randomUUID(), functionId: record.id, action, actor,
    fuliId: record.fuliId, at: new Date().toISOString(),
  });
}

export async function saveFunction(input: FunctionInput, actor: string, editId?: string, expectedUpdatedAt?: string): Promise<FunctionRecord> {
  const normalized = normalizeInput(input);
  if (normalizeFuliId(normalized.fuliId) === '') throw new Error('Missing FuLi ID');
  const db = await openDatabase();
  const tx = db.transaction(['functions', 'surveys', 'audit'], 'readwrite');
  const store = tx.objectStore('functions');
  const done = transactionDone(tx);
  try {
    const existing = editId ? await request(store.get(editId) as IDBRequest<FunctionRecord | undefined>) : undefined;
    if (editId && (!existing || existing.deletedAt)) throw new Error('Record not found');
    if (existing && existing.updatedAt !== expectedUpdatedAt) throw new Error('Record changed');
    if (existing && existing.fuliId !== normalized.fuliId) {
      const links = await request(tx.objectStore('surveys').index('functionId').count(existing.id));
      if (links) throw new Error('Linked FuLi ID');
    }
    const duplicate = await request(store.index('fuliId').get(normalized.fuliId) as IDBRequest<FunctionRecord | undefined>);
    if (duplicate && duplicate.id !== editId && !duplicate.deletedAt) throw new Error('Duplicate FuLi ID');
    // Re-create a previously deleted ID in place so its audit identity stays stable.
    const record = makeRecord(normalized, existing ?? duplicate, actor);
    store.put(record);
    addAudit(tx, existing ? 'edit' : duplicate ? 'restore' : 'create', record, actor);
    await done;
    return record;
  } catch (error) {
    if (transactionActive(tx)) tx.abort();
    await done.catch(() => undefined);
    throw error;
  }
}

export async function deleteFunction(record: FunctionRecord, surveys: SurveySnapshot[], actor: string): Promise<void> {
  if (surveys.some((survey) => survey.functionId === record.id)) throw new Error('Linked questionnaire');
  const db = await openDatabase();
  const tx = db.transaction(['functions', 'surveys', 'audit'], 'readwrite');
  const done = transactionDone(tx);
  try {
    const stored = await request(tx.objectStore('functions').get(record.id) as IDBRequest<FunctionRecord | undefined>);
    if (!stored || stored.deletedAt) throw new Error('Record not found');
    const links = await request(tx.objectStore('surveys').index('functionId').count(record.id));
    if (links) throw new Error('Linked questionnaire');
    const next = { ...stored, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    tx.objectStore('functions').put(next);
    addAudit(tx, 'delete', next, actor);
    await done;
  } catch (error) {
    if (transactionActive(tx)) tx.abort();
    await done.catch(() => undefined);
    throw error;
  }
}

/**
 * 启用/停用（2026-10-29 用户裁决）：改用列表「是否启用」开关直接切换，
 * 不再要求填写原因；reason 参数保留可选，便于后续接入真实原因时兼容。
 */
export async function setFunctionEnabled(record: FunctionRecord, enabled: boolean, actor: string, reason = ''): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(['functions', 'audit'], 'readwrite');
  const done = transactionDone(tx);
  try {
    const store = tx.objectStore('functions');
    const stored = await request(store.get(record.id) as IDBRequest<FunctionRecord | undefined>);
    if (!stored || stored.deletedAt) throw new Error('Record not found');
    if (stored.updatedAt !== record.updatedAt) throw new Error('Record changed');
    if (isFunctionEnabled(stored) === enabled) throw new Error('Record changed');
    const now = new Date().toISOString();
    const next = { ...stored, disabledAt: enabled ? null : now, availabilityReason: reason.trim(), updatedAt: now };
    store.put(next);
    tx.objectStore('audit').add({
      id: crypto.randomUUID(), functionId: record.id, action: enabled ? 'enable' : 'disable', actor,
      fuliId: record.fuliId, reason: reason.trim(), at: now,
    });
    await done;
  } catch (error) {
    if (transactionActive(tx)) tx.abort();
    await done.catch(() => undefined);
    throw error;
  }
}

export interface ImportItem { row: number; input: FunctionInput }
export interface ImportFailure { row: number; input: FunctionInput; reason: string }

export async function importFunctions(items: ImportItem[], actor: string): Promise<{ created: number; updated: number; failures: ImportFailure[] }> {
  const db = await openDatabase();
  const tx = db.transaction(['functions', 'audit'], 'readwrite');
  const done = transactionDone(tx);
  const store = tx.objectStore('functions');
  const failures: ImportFailure[] = [];
  let created = 0;
  let updated = 0;
  try {
    for (const { row, input } of items) {
      const normalized = normalizeInput(input);
      const existing = await request(store.index('fuliId').get(normalized.fuliId) as IDBRequest<FunctionRecord | undefined>);
      const record = makeRecord(normalized, existing, actor);
      store.put(record);
      addAudit(tx, existing ? 'import-update' : 'import-create', record, actor);
      if (existing && !existing.deletedAt) updated += 1;
      else created += 1;
    }
    await done;
    return { created, updated, failures };
  } catch (error) {
    if (transactionActive(tx)) tx.abort();
    await done.catch(() => undefined);
    throw error;
  }
}

export function readPreferences(): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>; }
  catch { return {}; }
}

export function savePreferences(value: Record<string, unknown>): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
}

export { functionStatus };
