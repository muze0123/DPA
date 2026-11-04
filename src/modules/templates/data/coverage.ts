/**
 * 模板覆盖度（方案 §2.5 / §4.4）：模板题集 ⊂ 判定规则题集时，未覆盖的条款必须人工判定。
 *
 * 三个不变式：
 * 1) 条款清单恒为判定规则全量（当前 38 条），覆盖度只改变「判定来源」，不改变条款数量；
 * 2) 未覆盖 ≠ 不适用：缺题条款的自动值保持 undetermined（待核验），由人工填依据；
 * 3) 覆盖度是派生量，不落库、不进模板版本号（实时计算，判定规则由国家修订同步更新）。
 */
import { CLAUSES, type ClauseDef } from '../../surveys/data/matching';
import { isKnownCode } from '../../surveys/data/questions';

/**
 * 模板题目最小形状：只依赖题号与自建题声明的条款。
 *
 * 题号（code）即题目唯一标识（2026-11-01 用户裁决：Q01 稳定标识口径下线）；
 * 题号在题库内的题参与判定，自建题可通过 clauseNos 直接声明命中的条款
 * （2026-10-28 用户裁决），同样视为有题目依据。
 */
export interface QuestionRefLike {
  code: string;
  clauseNos?: string[];
}

export interface TemplateCoverage {
  /** 模板声明的题号集合（题库题；自建题不参与判定） */
  declared: string[];
  /** 可自动判定的条款 */
  judgeable: ClauseDef[];
  /** 无题目依据、须人工判定的条款 */
  uncovered: ClauseDef[];
  /** 覆盖率（0–1） */
  ratio: number;
  gate: 'auto' | 'manual-required';
}

export const COVERAGE_TOTAL = CLAUSES.length;

/** 条款缺失的题号（表达式引用了、但模板题集没有） */
export function missingCodes(clause: ClauseDef, declared: readonly string[]): string[] {
  return clause.hits.filter((code) => !declared.includes(code));
}

export function coverageOf(questions: readonly QuestionRefLike[], clauses: readonly ClauseDef[] = CLAUSES): TemplateCoverage {
  const declared = [...new Set(questions.map((question) => question.code).filter((code) => isKnownCode(code)))];
  // 自建题声明的条款：有题目依据即可自动初筛（判定时以「或」并入表达式，见 matching.ts#evaluateClause）
  const declaredClauses = new Set(questions.flatMap((question) => question.clauseNos ?? []));
  const judgeable: ClauseDef[] = [];
  const uncovered: ClauseDef[] = [];
  for (const clause of clauses) {
    if (missingCodes(clause, declared).length && !declaredClauses.has(clause.no)) uncovered.push(clause);
    else judgeable.push(clause);
  }
  return {
    declared,
    judgeable,
    uncovered,
    ratio: clauses.length ? judgeable.length / clauses.length : 0,
    gate: uncovered.length ? 'manual-required' : 'auto',
  };
}

/** 题库中不存在的题号（数据错误，非覆盖度问题） */
export function unknownCodes(clauses: readonly ClauseDef[] = CLAUSES): string[] {
  const unknown: string[] = [];
  for (const clause of clauses) for (const code of clause.hits) if (!isKnownCode(code)) unknown.push(`${clause.no}:${code}`);
  return [...new Set(unknown)];
}
