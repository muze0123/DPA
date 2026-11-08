import { parse } from 'vue/compiler-sfc';
import ts from 'typescript';
import { createHash } from 'node:crypto';

export function scanSource(file, source) {
  const findings = [];
  const add = (rule, snippet, offset) => findings.push({ file, rule, snippet: snippet.trim(), line: source.slice(0, offset).split('\n').length });
  const blocks = file.endsWith('.vue') ? parse(source).descriptor.styles.map(block => ({ content: block.content, offset: block.loc.start.offset })) : file.endsWith('.css') ? [{ content: source, offset: 0 }] : [];
  for (const block of blocks) {
    const css = block.content.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '));
    for (const match of css.matchAll(/(?:#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(\s*[\d.])/gi)) {
      const start = css.lastIndexOf(';', match.index) + 1;
      const end = css.indexOf(';', match.index);
      add('literal-color', css.slice(start, end < 0 ? css.length : end).split('{').at(-1), block.offset + match.index);
    }
  }
  const script = file.endsWith('.vue') ? parse(source).descriptor.scriptSetup ?? parse(source).descriptor.script : null;
  const scriptText = script?.content ?? (file.endsWith('.ts') ? source : '');
  const ast = ts.createSourceFile(file, scriptText, ts.ScriptTarget.Latest, true);
  const modalNames = new Set();
  for (const node of ast.statements) {
    if (!ts.isImportDeclaration(node) || node.moduleSpecifier.text !== '@arco-design/web-vue') continue;
    const bindings = node.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === 'Modal') modalNames.add(element.name.text);
    }
  }
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const expression = node.expression;
      if (modalNames.has(expression.expression.getText(ast)) && ['confirm', 'info', 'warning', 'success', 'error'].includes(expression.name.text)) {
        add('imperative-confirmation', node.getText(ast), (script?.loc.start.offset ?? 0) + node.getStart(ast));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const template = file.endsWith('.vue') ? parse(source).descriptor.template : null;
  if (template) {
    for (const match of template.content.matchAll(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/g)) {
      if (/#(?:[\da-f]{3,8})\b|\brgba?\(\s*\d/i.test(match[2])) add('literal-inline-color', match[0], template.loc.start.offset + match.index);
    }
    for (const match of template.content.matchAll(/<(?:h1|h2)[^>]*class=["'][^"']*\bpage-(?:title|subtitle)\b[^"']*["'][^>]*>/g)) add('business-page-heading', match[0], template.loc.start.offset + match.index);
  }
  return findings;
}

export function fingerprint(finding) {
  return createHash('sha256').update(`${finding.file}\n${finding.rule}\n${finding.snippet}`).digest('hex');
}

export function classify(findings, baseline) {
  const remaining = new Map(Object.entries(baseline));
  const introduced = [];
  const historical = [];
  for (const finding of findings) {
    const key = fingerprint(finding);
    const count = remaining.get(key) ?? 0;
    if (count > 0) { historical.push(finding); remaining.set(key, count - 1); }
    else introduced.push(finding);
  }
  return { introduced, historical };
}
