import seed from './legacy-seed.json';
import { standardNode } from './standardLibrary';

/**
 * 判定规则数据模型（2026-10-27 用户裁决：去版本化）：
 * 条款触发规则有且仅有一份现行规范，内容以国有规范文档 GB_44464（草案 2026-07-03）PDF
 * 与产品需求文档 §8.2「38 条款触发规则表」为准；国家后续修订条款文档时在系统内同步更新，
 * 不再存在草稿/发布/历史版本概念。
 */
export interface Question { no: string; text: string; guide: string }
export interface Clause {
  code: string; chapter: string; topic: string; chapter6: string;
  chapter9: string; testMethod: string; trigger: string; requirements: string[];
  /** 条文取自草案 PDF 时的印刷页码（溯源用） */
  standardPage?: number;
}
export interface RuleSet {
  id: string; name: string; source: string; generatedAt: string;
  questions: Question[]; clauses: Clause[];
}

export const RULE_SET_ID = 'v1';
/** 去版本化之前，模板/问卷快照绑定的历史版本号（仅作存量数据识别，不再可选用） */
export const LEGACY_RULE_IDS = ['v1.0.0', 'v1.1.0', 'v1.2.0'] as const;

/** 存量绑定值是否指向现行规则集（历史版本号一律归并到唯一现行规则） */
export function knownRuleBinding(id: string | undefined | null): boolean {
  return id === RULE_SET_ID || LEGACY_RULE_IDS.includes(id as (typeof LEGACY_RULE_IDS)[number]);
}

/**
 * 以 PDF 原文为准（2026-10-26 用户裁决）：条文（chapter6）取标准层草案原文并记录页码。
 * 测试方法（testMethod）保留 §8.2 表格口径的短名（「按附录B确认基本功能数据类型声明」等），
 * 第 9 章草案原文在详情抽屉内按 chapter9 编号实时引用标准层，不在此覆盖。
 */
function alignToStandard(clauses: Clause[]): Clause[] {
  for (const clause of clauses) {
    const article = standardNode(clause.code);
    if (article?.text) {
      clause.chapter6 = article.text;
      clause.standardPage = article.page;
    }
  }
  return clauses;
}

export const ruleSet: RuleSet = {
  id: RULE_SET_ID,
  name: 'GB 44464 条款触发规则（草案 2026-07-03）',
  source: seed.source,
  generatedAt: seed.generatedAt,
  questions: seed.questions,
  clauses: alignToStandard(seed.clauses),
};

export type Expression = { kind: 'question'; no: string } | { kind: 'and' | 'or'; children: Expression[] };

/** The old template grammar is intentionally narrow: Qn="是", AND(...), OR(...). */
export function parseExpression(source: string, knownQuestions: Set<string>): Expression {
  const text = source.replace(/\s+/g, '');
  let cursor = 0;
  let leaves = 0;
  function read(depth: number): Expression {
    if (depth > 5) throw new Error('depth');
    const match = /^(Q\d+)="是"/.exec(text.slice(cursor));
    if (match) {
      cursor += match[0].length;
      if (!knownQuestions.has(match[1])) throw new Error('reference');
      if (++leaves > 8) throw new Error('leaves');
      return { kind: 'question', no: match[1] };
    }
    const operation = /^(AND|OR)\(/.exec(text.slice(cursor));
    if (!operation) throw new Error('syntax');
    cursor += operation[0].length;
    const children: Expression[] = [read(depth + 1)];
    while (text[cursor] === ',') {
      cursor += 1;
      children.push(read(depth + 1));
    }
    if (children.length < 2 || text[cursor] !== ')') throw new Error('syntax');
    cursor += 1;
    return { kind: operation[1] === 'AND' ? 'and' : 'or', children };
  }
  const expression = read(1);
  if (cursor !== text.length) throw new Error('syntax');
  return expression;
}

/** 表达式叶子（题号）集合 */
function leavesOf(expression: Expression, into = new Set<string>()): Set<string> {
  if (expression.kind === 'question') into.add(expression.no);
  else expression.children.forEach((child) => leavesOf(child, into));
  return into;
}

/**
 * 触发解释（需求 §8.2 可解释性）：把触发表达式实时派生为人类可读中文/英文，
 * 如 AND(Q9="是",OR(Q5="是",Q4="是")) → 「Q9=是 且（Q5=是 或 Q4=是）」/ "Q9=yes AND (Q5=yes OR Q4=yes)"。
 * 解释只读表达式派生，不落库；括号按运算优先级补齐（子节点运算符与父节点不同时加括号）。
 */
export type ExplanationLocale = 'zh' | 'en';

export function explainExpression(expression: Expression, locale: ExplanationLocale = 'zh'): string {
  if (expression.kind === 'question') return locale === 'zh' ? `${expression.no}=是` : `${expression.no}=yes`;
  const joiner = expression.kind === 'and' ? (locale === 'zh' ? ' 且 ' : ' AND ') : (locale === 'zh' ? ' 或 ' : ' OR ');
  const text = expression.children
    .map((child) => {
      const childText = explainExpression(child, locale);
      const needsParens = (child.kind === 'and' || child.kind === 'or') && child.kind !== expression.kind;
      if (!needsParens) return childText;
      return locale === 'zh' ? `（${childText}）` : `(${childText})`;
    })
    .join(joiner);
  // 中文全角括号自带分隔视觉，吸收括号前的连接空格：Q9=是 且（Q5=是 或 Q4=是）
  return locale === 'zh' ? text.replaceAll(' （', '（') : text;
}

/** 解析失败的触发表达式返回空串（解释只做展示不抛错） */
export function triggerExplanation(trigger: string, knownQuestions: Set<string>, locale: ExplanationLocale = 'zh'): string {
  try {
    return explainExpression(parseExpression(trigger, knownQuestions), locale);
  } catch {
    return '';
  }
}

/** 表达式引用的题号（按出现顺序去重）；解析失败返回空数组，供涉及问题徽标与反向引用使用 */
export function triggerLeaves(trigger: string, knownQuestions: Set<string>): string[] {
  try {
    return [...leavesOf(parseExpression(trigger, knownQuestions))];
  } catch {
    return [];
  }
}
