/**
 * 触发规则问题树（2026-11-01 用户裁决）：
 * 38 条款的触发规则改为「问题树」配置——顶层问题/子级组之间共享一个 且/或 关系，
 * 子级组内部同样支持 且/或，可多层组合；「设为子级」并入相邻项（上一个为子级组则并入，
 * 自己是第一项则与下一个成组）；「取消子级」（2026-11-04）把组内问题移回上一层级，
 * 与设为子级互为逆操作；组内仅剩一个问题时自动上浮到上一层（遵循上一层逻辑关系）。
 *
 * 与判定内核表达式文法一一对应（Q1 | NOT(Q1) | AND(…) | OR(…)），本模块只做结构与文法的互转；
 * 叶子带 `negated` 即「期望答否」（NOT），组级否定不在此建模（落到高级表达式模式）；
 * 深度 ≤5、叶子 ≤12 的语义校验仍由 ruleVersionIssues → validateExpressionSyntax 承担。
 * 序列化不加空格（`AND(Q1,OR(Q2,Q3))`），与 flatExprModel / validateExpressionSyntax 的
 * 紧凑口径一致。
 */

export type TriggerOp = 'AND' | 'OR';

export interface TriggerLeaf {
  kind: 'leaf';
  code: string;
  /** true = 期望该题答「否」（序列化为 NOT(Q1)）；缺省 = 期望答「是」 */
  negated?: boolean;
}
export interface TriggerGroup { kind: 'group'; op: TriggerOp; children: TriggerNode[] }
export type TriggerNode = TriggerLeaf | TriggerGroup;

/** 问题树顶层：children 之间共享 op；children 为空表示未配置触发规则 */
export interface TriggerTree { op: TriggerOp; children: TriggerNode[] }

/** 节点路径：从顶层 children 起的各级下标（[] 表示顶层容器本身） */
export type TriggerPath = readonly number[];

const cloneNode = (node: TriggerNode): TriggerNode =>
  node.kind === 'leaf'
    ? { kind: 'leaf', code: node.code, negated: node.negated }
    : { kind: 'group', op: node.op, children: node.children.map(cloneNode) };

/** 深拷贝问题树（页面状态替换式更新用） */
export function cloneTree(tree: TriggerTree | null): TriggerTree | null {
  return tree ? { op: tree.op, children: tree.children.map(cloneNode) } : null;
}

/**
 * 表达式 → 问题树。单叶子（Q1）解析为单节点树；解析失败（语法错误/超出文法）返回 null，
 * 调用方回退高级表达式模式。
 */
export function triggerTreeFromExpr(expr: string): TriggerTree | null {
  const text = expr.replace(/\s+/g, '');
  if (!text) return null;
  let cursor = 0;
  function read(): TriggerNode | null {
    const leaf = /^Q\d+/.exec(text.slice(cursor));
    if (leaf) { cursor += leaf[0].length; return { kind: 'leaf', code: leaf[0] }; }
    // 叶子级否定：NOT(Q1)。组级否定（NOT(AND(...)) 等）不进问题树，交由高级表达式模式
    const negated = /^NOT\(Q\d+\)/.exec(text.slice(cursor));
    if (negated) {
      cursor += negated[0].length;
      return { kind: 'leaf', code: negated[0].slice(4, -1), negated: true };
    }
    const operation = /^(AND|OR)\(/.exec(text.slice(cursor));
    if (!operation) return null;
    cursor += operation[0].length;
    const children: TriggerNode[] = [];
    for (;;) {
      const child = read();
      if (!child) return null;
      children.push(child);
      if (text[cursor] === ',') { cursor += 1; continue; }
      break;
    }
    if (text[cursor] !== ')' || children.length < 2) return null;
    cursor += 1;
    return { kind: 'group', op: operation[1] as TriggerOp, children };
  }
  const node = read();
  if (!node || cursor !== text.length) return null;
  return node.kind === 'leaf' ? { op: 'OR', children: [node] } : { op: node.op, children: node.children };
}

function nodeExpr(node: TriggerNode): string {
  if (node.kind === 'leaf') return node.negated ? `NOT(${node.code})` : node.code;
  return `${node.op}(${node.children.map(nodeExpr).join(',')})`;
}

/** 问题树 → 表达式；空树返回空串（数据层按「未配置」处理） */
export function triggerExprOf(tree: TriggerTree | null): string {
  if (!tree || !tree.children.length) return '';
  if (tree.children.length === 1) return nodeExpr(tree.children[0]!);
  return `${tree.op}(${tree.children.map(nodeExpr).join(',')})`;
}

/** 树内全部叶子题号（按出现顺序去重） */
export function triggerLeafCodes(tree: TriggerTree | null): string[] {
  const codes: string[] = [];
  const walk = (node: TriggerNode) => {
    if (node.kind === 'leaf') { if (!codes.includes(node.code)) codes.push(node.code); return; }
    node.children.forEach(walk);
  };
  tree?.children.forEach(walk);
  return codes;
}

/** 未配置（无任何问题） */
export function isTreeEmpty(tree: TriggerTree | null): boolean {
  return !tree || triggerLeafCodes(tree).length === 0;
}

/** 组内仅剩一个问题时上浮到上一层（遵循上一层逻辑关系）；空组丢弃 */
function collapse(nodes: TriggerNode[]): TriggerNode[] {
  const result: TriggerNode[] = [];
  for (const node of nodes) {
    if (node.kind !== 'group') { result.push(node); continue; }
    const children = collapse(node.children);
    if (children.length === 1) result.push(children[0]!);
    else if (children.length > 1) result.push({ kind: 'group', op: node.op, children });
  }
  return result;
}

function collapsed(tree: TriggerTree): TriggerTree {
  return { op: tree.op, children: collapse(tree.children) };
}

/** 按路径定位容器（path = [] 表示顶层；各级必须是 group） */
function containerOf(tree: TriggerTree, path: TriggerPath): TriggerTree | TriggerGroup | null {
  let container: TriggerTree | TriggerGroup = tree;
  for (const index of path) {
    const next: TriggerNode | undefined = container.children[index];
    if (!next || next.kind !== 'group') return null;
    container = next;
  }
  return container;
}

/** 删除叶子（path 指向该叶子）；随后做单子级上浮折叠 */
export function removeLeafAt(tree: TriggerTree, path: TriggerPath): TriggerTree {
  const next = cloneTree(tree)!;
  const container = containerOf(next, path.slice(0, -1));
  if (!container) return next;
  container.children.splice(path[path.length - 1]!, 1);
  return collapsed(next);
}

/**
 * 「设为子级」（path 指向叶子，并入相邻项）：
 * - 上一个兄弟是子级组 → 并入该组（追加）；
 * - 上一个兄弟是叶子 → 与它组成新组（默认「或」）；
 * - 自己是第一项 → 与下一个成组（下一个是组则并入其首位）。
 */
export function setChildAt(tree: TriggerTree, path: TriggerPath): TriggerTree {
  const next = cloneTree(tree)!;
  const container = containerOf(next, path.slice(0, -1));
  if (!container) return next;
  const index = path[path.length - 1]!;
  const siblings = container.children;
  if (siblings.length < 2) return next;
  const leaf = siblings[index];
  if (!leaf || leaf.kind !== 'leaf') return next;
  const previous = siblings[index - 1];
  if (previous) {
    if (previous.kind === 'group') {
      previous.children.push(leaf);
      siblings.splice(index, 1);
    } else {
      siblings.splice(index - 1, 2, { kind: 'group', op: 'OR', children: [previous, leaf] });
    }
  } else {
    const sibling = siblings[1]!;
    if (sibling.kind === 'group') {
      sibling.children.unshift(leaf);
      siblings.splice(0, 1);
    } else {
      siblings.splice(0, 2, { kind: 'group', op: 'OR', children: [leaf, sibling] });
    }
  }
  return collapsed(next);
}

/** 修改容器（path = [] 为顶层）的 且/或 关系 */
export function setOpAt(tree: TriggerTree, path: TriggerPath, op: TriggerOp): TriggerTree {
  const next = cloneTree(tree)!;
  const container = containerOf(next, path);
  if (!container) return next;
  container.op = op;
  return next;
}

/**
 * 「取消子级」（2026-11-04 用户需求：设为子级后可撤销）：把叶子移出所在子级组，
 * 插回到父容器中该组**之后**的位置（紧跟原组，层级顺序直观）；随后折叠：
 * 组内仅剩 1 项时该组自动上浮解散（collapse 语义）。path 至少两级（顶层叶子无此操作）。
 */
export function unsetChildAt(tree: TriggerTree, path: TriggerPath): TriggerTree {
  const next = cloneTree(tree)!;
  if (path.length < 2) return next;
  const parent = containerOf(next, path.slice(0, -2));
  if (!parent) return next;
  const groupIndex = path[path.length - 2]!;
  const group = parent.children[groupIndex];
  if (!group || group.kind !== 'group') return next;
  const leafIndex = path[path.length - 1]!;
  const leaf = group.children[leafIndex];
  if (!leaf || leaf.kind !== 'leaf') return next;
  group.children.splice(leafIndex, 1);
  // 插到该组之后；若组已空（原仅 1 个叶子不可能走到这——组最少 2 项才存在，仍防御）则原位替换
  parent.children.splice(groupIndex + (group.children.length ? 1 : 0), 0, leaf);
  return collapsed(next);
}

/** 追加叶子（去重）；空树默认「或」关系（2026-11-01 用户裁决：2 个及以上默认「或」） */
export function appendLeaves(tree: TriggerTree | null, codes: readonly string[]): TriggerTree {
  const base: TriggerTree = tree && tree.children.length ? cloneTree(tree)! : { op: 'OR', children: [] };
  const existing = new Set(triggerLeafCodes(base));
  for (const code of codes) {
    if (existing.has(code)) continue;
    existing.add(code);
    base.children.push({ kind: 'leaf', code });
  }
  return base;
}

/**
 * 以弹窗选择结果同步问题树：先剪掉未勾选的叶子（折叠空组/单子级组），
 * 再把新勾选的题号追加到顶层；结果为空返回 null（未配置）。
 */
export function syncTreeSelection(tree: TriggerTree | null, codes: readonly string[]): TriggerTree | null {
  const selected = new Set(codes);
  let next: TriggerTree | null = tree && tree.children.length ? cloneTree(tree)! : null;
  if (next) {
    const prune = (nodes: TriggerNode[]): TriggerNode[] => nodes
      .map((node): TriggerNode => (node.kind === 'group'
        ? { kind: 'group', op: node.op, children: prune(node.children) }
        : { kind: 'leaf', code: node.code, negated: node.negated }))
      .filter((node) => (node.kind === 'leaf' ? selected.has(node.code) : node.children.length > 0));
    next = collapsed(prune(next.children).length ? { op: next.op, children: prune(next.children) } : { op: next.op, children: [] });
    if (!next.children.length) next = null;
  }
  const missing = codes.filter((code) => !next || !triggerLeafCodes(next).includes(code));
  if (!missing.length) return next;
  return appendLeaves(next, missing);
}

/** 切换叶子「期望答案」（是 ⇄ 否）；path 指向该叶子 */
export function toggleLeafNegationAt(tree: TriggerTree, path: TriggerPath): TriggerTree {
  const next = cloneTree(tree)!;
  const container = containerOf(next, path.slice(0, -1));
  if (!container) return next;
  const node = container.children[path[path.length - 1]!];
  if (!node || node.kind !== 'leaf') return next;
  node.negated = node.negated ? undefined : true;
  return next;
}
