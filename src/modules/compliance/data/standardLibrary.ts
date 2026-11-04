/**
 * 天枢标准库接入层（2026-10-29 用户裁决）。
 *
 * 背景：「规则管理 · 标准条款」菜单已隐藏，标准条文改为调用「天枢」系统平台「标准库」的数据。
 * 本文件是唯一的取数入口：页面与判定引擎只依赖这里的函数，不直接依赖 mock 数据文件。
 *
 * 当前阶段（演示）：
 * - 天枢标准库接口尚未开放，`./standard`（GB 44464 条文库）作为 mock 数据源；
 * - `TIANSHU_STANDARD_LIBRARY.useMock = true`，`fetchFromTianshu` 保持未实现。
 *
 * 上线接入真实接口时只需改本文件，其余消费方（标准条款页、数据类型页、条款判定页、
 * 判定引擎 matching.ts / rules.ts）无需改动：
 * 1) 实现 `fetchFromTianshu()`（按 `TIANSHU_STANDARD_LIBRARY.endpoint` 发起请求并做字段映射）；
 * 2) 把 `useMock` 改为 false；
 * 3) 删除 `mockPayload()` 与 `import * as mockStandard`，并删除 mock 数据文件 `./standard.ts`。
 *
 * 契约（StandardLibraryPayload）按天枢标准库口径假定：文档信息 + 章节目录 + 条款节点
 * （条款号、条文原文、页码、附表、附图、公式）。字段如有出入，仅需调整 `mockPayload()` 的映射。
 */
import * as mockStandard from './standard';
import type {
  StandardChapter, StandardSection, StandardNode,
} from './standard';

export type {
  StandardChapter, StandardChapterType, StandardFigure, StandardFormula, StandardFormulaTerm,
  StandardNode, StandardSection, StandardTable, StandardTableCell,
} from './standard';

/** 天枢标准库文档信息 */
export interface StandardLibraryDoc {
  /** 天枢标准库文档 ID（演示期为派生值） */
  libraryId: string;
  /** 标准编号，如 GB 44464—202X */
  code: string;
  /** 标准名称 */
  title: string;
  /** 版次（草案日期或正式发布版次） */
  revision: string;
  /** 发布日期 */
  publishedAt: string;
  /** 总页数 */
  pageTotal: number;
  /** 来源文件（天枢侧入库文件名） */
  sourceFile: string;
  /** 来源文件摘要，用于溯源与问卷快照 */
  sha256: string;
}

/** 天枢标准库响应体 */
export interface StandardLibraryPayload {
  doc: StandardLibraryDoc;
  /** 章目录（含章内条目数，供筛选下拉与计数） */
  chapters: readonly StandardChapter[];
  /** 二级节目录（章节层级路径推导） */
  sections: readonly StandardSection[];
  /** 三级及更深的节标题（章节层级路径推导，仅含带标题的层级） */
  subsections: readonly StandardSection[];
  /** 条款节点（含条文原文、页码、附表、附图、公式） */
  clauses: readonly StandardNode[];
}

/** 天枢标准库接入配置 */
export const TIANSHU_STANDARD_LIBRARY = {
  /** 真实接口地址（假定值，按天枢网关实际路径替换） */
  endpoint: '/tianshu/api/v1/standard-library',
  /** 演示期开关：true = 使用本地 mock；接入真实接口后改为 false */
  useMock: true,
  /** 演示期数据来源标注（用于页面提示与导出溯源） */
  mockLabel: '天枢标准库（本地演示数据）',
} as const;

/* ------------------------------------------------------------------ 取数 */

/**
 * 本地 mock 装载（演示期）。
 * 上线接入天枢标准库后：删除本函数与文件顶部的 `mockStandard` import。
 */
function mockPayload(): StandardLibraryPayload {
  return {
    doc: {
      libraryId: `TS-STD-${mockStandard.STANDARD_DOC.code.replace(/[^0-9A-Z]/gi, '')}`,
      code: mockStandard.STANDARD_DOC.code,
      title: mockStandard.STANDARD_DOC.title,
      revision: mockStandard.STANDARD_DOC.draftDate,
      publishedAt: mockStandard.STANDARD_DOC.draftDate,
      pageTotal: mockStandard.STANDARD_DOC.pageTotal,
      sourceFile: mockStandard.STANDARD_DOC.pdfFile,
      sha256: mockStandard.STANDARD_DOC.pdfSha256,
    },
    chapters: mockStandard.STANDARD_CHAPTERS,
    sections: mockStandard.STANDARD_SECTIONS,
    subsections: mockStandard.STANDARD_SUBSECTIONS,
    clauses: mockStandard.STANDARD_NODES,
  };
}

/** 调用天枢标准库真实接口（待接入，接入时实现本函数） */
async function fetchFromTianshu(): Promise<StandardLibraryPayload> {
  throw new Error(`天枢标准库接口未接入：${TIANSHU_STANDARD_LIBRARY.endpoint}`);
}

let cache: StandardLibraryPayload | null = null;

/**
 * 异步取数（页面首屏调用）。真实接口不可用且处于演示期时回退本地 mock，
 * 保证整条业务演示链路不中断。
 */
export async function fetchStandardLibrary(): Promise<StandardLibraryPayload> {
  if (cache) return cache;
  if (TIANSHU_STANDARD_LIBRARY.useMock) {
    cache = mockPayload();
    return cache;
  }
  try {
    cache = await fetchFromTianshu();
  } catch (error) {
    console.warn('[standard-library] 天枢标准库不可用，回退本地演示数据', error);
    cache = mockPayload();
  }
  return cache;
}

/** 幂等预热：与 fetchStandardLibrary 等价，供页面 onMounted 调用 */
export const ensureStandardLibrary = fetchStandardLibrary;

/**
 * 同步取数。判定引擎（matching.ts / rules.ts）与模板需要同步读取；
 * 演示期首次调用即惰性装载 mock。接入真实接口后应由应用启动时 `fetchStandardLibrary()`
 * 预热缓存，本函数保持不变。
 */
export function standardLibrary(): StandardLibraryPayload {
  if (!cache) cache = mockPayload();
  return cache;
}

/* ------------------------------------------------------------------ 同步 selector（消费方统一入口） */

export function standardNodes(): readonly StandardNode[] {
  return standardLibrary().clauses;
}

export function standardChapters(): readonly StandardChapter[] {
  return standardLibrary().chapters;
}

export function standardDoc(): StandardLibraryDoc {
  return standardLibrary().doc;
}

export function standardNode(no: string): StandardNode | undefined {
  return standardLibrary().clauses.find((node) => node.no === no);
}

export function standardSection(no: string): StandardSection | undefined {
  return standardLibrary().sections.find((section) => section.no === no);
}

/** 章节层级路径（章 → 二级节 → 条款），列表「章节层级」列与抽屉共用 */
export function sectionPathOf(node: StandardNode): string {
  const library = standardLibrary();
  const segments = node.no.split('.');
  const parts: string[] = [];
  const chapter = library.chapters.find((entry) => entry.no === node.chapter);
  if (chapter) parts.push(`${chapter.no} ${chapter.title}`);
  for (let depth = 2; depth < segments.length; depth++) {
    const prefix = segments.slice(0, depth).join('.');
    const title = library.sections.find((entry) => entry.no === prefix)?.title
      ?? library.subsections.find((entry) => entry.no === prefix)?.title
      ?? library.clauses.find((entry) => entry.no === prefix)?.title;
    if (title) parts.push(`${prefix} ${title}`);
  }
  return parts.join(' / ');
}
