#!/usr/bin/env node
/**
 * 天枢 i18n 提取 / 校验脚本
 * ---------------------------------------------------------------------------
 * 只做三件事，且都不联网、不依赖额外安装的包（复用项目已有的 typescript）：
 *
 *   1. extract  扫描 src 下所有 .vue / .ts，提取代码里的 t() / te() / $t() key，
 *               与 src/app/i18n.ts 里的 messages 对账，导出给翻译用的清单。
 *   2. check    CI 用。有缺失 key 就退出码 1；--strict 时未使用的 key 也算失败。
 *   3. cjk      巡检 .vue 模板里没走 i18n、直接写死的中文（辅助人工判断边界）。
 *
 * 用法：
 *   node scripts/i18n.mjs extract            # 导出 i18n-report/keys.csv + keys.json
 *   node scripts/i18n.mjs check              # 缺失即失败
 *   node scripts/i18n.mjs check --strict     # 缺失或未使用都失败
 *   node scripts/i18n.mjs cjk                # 硬编码中文巡检
 *   node scripts/i18n.mjs extract --out i18n-report
 *
 * 翻译边界约定（与《多语言翻译边界》一致）：
 *   - 静态文案 key、系统枚举字典项 → 进 i18n 翻译
 *   - 用户录入的业务数据、ID、编码、自由文本 → 不进 i18n，也不该进本清单
 *   - 枚举在库里存 code，前端用 t(`ns.${code}`) 渲染
 *
 * 脚本读不到、也不猜的东西：
 *   - 变量 key（如 t(setting.labelKey)）无法静态解析，单独列出，需人工确认
 *   - 动态 key（如 t(`tasks.statuses.${value}`)）只校验"至少命中一条"，
 *     具体枚举项是否齐全，必须由枚举字典那一侧保证
 */
import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC_DIR = resolve(ROOT, 'src');
const I18N_FILE = resolve(SRC_DIR, 'app/i18n.ts');
const DEFAULT_OUT = resolve(ROOT, 'i18n-report');

/** 视为 i18n key 的字面量：至少一段，且必须带命名空间（含点） */
const KEY_PATTERN = /^[A-Za-z][\w-]*(?:\.[\w-]+)+$/;
/** 只看这几种调用，t / te / tm / tc / $t；前面不能紧邻标识符，避免命中 create / entries */
const CALL_RE = /(?<![\w$])(\$t|t|te|tm|tc)\s*\(/g;
const BINDING_RE = /(?:\bconst|\blet|\bvar)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+?)?=\s*/g;
const DYNAMIC_RE = /\$\{[\s\S]*?\}/g;
const HAS_DYNAMIC = /\$\{[\s\S]*?\}/;

/* ========================================================================== *
 * 通用小工具
 * ========================================================================== */

function walk(dir, ext, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, out);
    else if (ext.some((suffix) => entry.name.endsWith(suffix))) out.push(full);
  }
  return out;
}

const toRel = (file) => relative(ROOT, file).split(sep).join('/');

/** 位置 → 行号；先把每行起点缓存下来，避免 O(n²) */
function makeLineIndex(code) {
  const starts = [0];
  for (let i = 0; i < code.length; i += 1) if (code[i] === '\n') starts.push(i + 1);
  return (pos) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** 等长掩码：把一段代码抹成空格但保留换行，这样行号不会漂 */
function blanket(text) {
  return text.replace(/[^\n]/g, ' ');
}

function maskRange(code, start, end) {
  return code.slice(0, start) + blanket(code.slice(start, end)) + code.slice(end);
}

/**
 * 抹掉 JS 注释（等长替换）。自己走状态机而不是用正则，
 * 是因为模板里的 `https://` 会被 `//` 正则误伤。
 */
function maskComments(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const literal = readLiteral(code, i);
      if (literal) {
        out += code.slice(i, literal.end);
        i = literal.end;
        continue;
      }
    }
    if (ch === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? code.length : end;
      out += blanket(code.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      out += blanket(code.slice(i, stop));
      i = stop;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** 从 start（必须是引号）读一个字符串/模板字面量，返回原文与结束位置 */
function readLiteral(code, start) {
  const quote = code[start];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  let i = start + 1;
  let text = '';
  while (i < code.length) {
    const ch = code[i];
    if (ch === '\\') {
      text += code.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (quote === '`' && ch === '$' && code[i + 1] === '{') {
      const segStart = i;
      let depth = 1;
      i += 2;
      while (i < code.length && depth > 0) {
        const inner = code[i];
        if (inner === '{') depth += 1;
        else if (inner === '}') depth -= 1;
        else if (inner === "'" || inner === '"' || inner === '`') {
          const nested = readLiteral(code, i);
          if (nested) {
            i = nested.end;
            continue;
          }
        }
        i += 1;
      }
      text += code.slice(segStart, i);
      continue;
    }
    if (ch === quote) return { text, end: i + 1 };
    text += ch;
    i += 1;
  }
  return null;
}

function skipSpace(code, index) {
  let i = index;
  while (i < code.length && /\s/.test(code[i])) i += 1;
  return i;
}

/** 取 vue-i18n 的具名插值参数：'{count} 条/页' → ['count'] */
function extractParams(value) {
  return new Set(
    [...String(value).matchAll(/\{\s*([A-Za-z_$][\w$]*)\s*\}/g)].map((match) => match[1])
  );
}

/** 取调用实参原文（到顶层逗号或右括号为止） */
function readArgument(code, start) {
  let depth = 0;
  let i = start;
  while (i < code.length) {
    const ch = code[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const literal = readLiteral(code, i);
      if (literal) {
        i = literal.end;
        continue;
      }
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) return code.slice(start, i).trim();
      depth -= 1;
    } else if (ch === ',' && depth === 0) {
      return code.slice(start, i).trim();
    }
    i += 1;
  }
  return code.slice(start).trim();
}

/* ========================================================================== *
 * 1. 读 src/app/i18n.ts 里的 messages
 * ========================================================================== */

let capturedOptions = null;
const moduleCache = new Map();

const EXTERNALS = {
  'vue-i18n': () => ({
    createI18n: (options) => {
      capturedOptions = options;
      return { global: { locale: { value: options.locale } }, ...options };
    },
  }),
};

/** 用 typescript 把 TS 编成 CJS，再塞一个假的 require 执行——不落地、不依赖构建产物 */
function loadModule(file) {
  if (moduleCache.has(file)) return moduleCache.get(file).exports;
  const source = readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: file,
  }).outputText;

  const mod = { exports: {} };
  moduleCache.set(file, mod);

  const requireShim = (id) => {
    if (id.startsWith('.')) {
      const base = resolve(dirname(file), id);
      for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) {
        try {
          return loadModule(candidate);
        } catch {
          /* 继续试下一个后缀 */
        }
      }
      throw new Error(`${toRel(file)} 引用的模块解析失败：${id}`);
    }
    const external = EXTERNALS[id];
    if (external) return external();
    throw new Error(`离线环境无法解析外部模块：${id}（${toRel(file)}）`);
  };

  const previousStorage = globalThis.localStorage;
  if (!previousStorage) {
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
  try {
    new Function('module', 'exports', 'require', js)(mod, mod.exports, requireShim);
  } finally {
    if (!previousStorage) delete globalThis.localStorage;
  }
  return mod.exports;
}

function loadMessages() {
  capturedOptions = null;
  moduleCache.clear();
  loadModule(I18N_FILE);
  if (!capturedOptions || !capturedOptions.messages) {
    throw new Error('没能从 src/app/i18n.ts 里读到 createI18n({ messages }) 的配置');
  }
  return capturedOptions.messages;
}

/** 语言菜单的菜单项按惯例用"本语言自称"（简体中文 / English），不算漏翻 */
function loadLocaleLabelKeys() {
  const registry = loadModule(resolve(SRC_DIR, 'app/locale.ts'));
  const options = registry.LOCALES ?? [];
  return new Set(options.map((item) => item.labelKey));
}

function flatten(tree, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, out);
    else out.set(path, String(value));
  }
  return out;
}

/* ========================================================================== *
 * 2. 扫描源码里的 key
 * ========================================================================== */

function maskVue(source, { keepScript = true } = {}) {
  let code = source;
  const patterns = [/<style[\s\S]*?<\/style>/g, /<!--[\s\S]*?-->/g];
  // 巡检硬编码文案时要把 <script> 一起去掉，否则数据表里的中文会被当成界面文案
  if (!keepScript) patterns.push(/<script[\s\S]*?<\/script>/g);
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(code))) {
      code = maskRange(code, match.index, match.index + match[0].length);
    }
  }
  return code;
}

/**
 * 收集 `const key = '...'` / `const key = `...`` 这类绑定。
 * 同一个文件里会有多个同名局部变量（每个函数各一个 key），所以按位置全部记下来，
 * 解析时取"调用点之前最近的那个"，近似词法作用域。
 */
function collectBindings(code) {
  const map = new Map();
  BINDING_RE.lastIndex = 0;
  let match;
  while ((match = BINDING_RE.exec(code))) {
    const literal = readLiteral(code, skipSpace(code, match.index + match[0].length));
    const list = map.get(match[1]) ?? [];
    list.push({ literal: literal ? literal.text : null, pos: match.index });
    map.set(match[1], list);
  }
  return map;
}

function resolveBinding(bindings, name, callPos) {
  const list = bindings.get(name);
  if (!list) return null;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].pos <= callPos) return list[i];
  }
  return null;
}

function literalToHit(name, text, file, line) {
  if (HAS_DYNAMIC.test(text)) {
    return { kind: 'dynamic', key: text, pattern: toPattern(text), file, line };
  }
  if (!KEY_PATTERN.test(text)) {
    return text.includes('.') ? null : { kind: 'suspicious', key: text, file, line };
  }
  return { kind: 'static', key: text, file, line };
}

/** `tasks.statuses.${value}` → `^tasks\.statuses\.[^.]+$`（一个插值 = 一个 key 段） */
function toPattern(template) {
  const parts = template.split(DYNAMIC_RE);
  const body = parts
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^.]+');
  return new RegExp(`^${body}$`);
}

function scanSource(code, relFile) {
  const lineOf = makeLineIndex(code);
  const bindings = collectBindings(code);
  const hits = [];
  CALL_RE.lastIndex = 0;
  let match;
  while ((match = CALL_RE.exec(code))) {
    const callName = match[1];
    const argStart = skipSpace(code, match.index + match[0].length);
    const literal = readLiteral(code, argStart);

    if (literal) {
      if (!/^\s*[,)]/.test(code.slice(literal.end, literal.end + 8))) continue;
      const hit = literalToHit(callName, literal.text, relFile, lineOf(match.index));
      if (hit) hits.push(hit);
      continue;
    }

    const expr = readArgument(code, argStart);
    if (!expr || expr.length > 120) continue;
    if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(expr)) continue;

    const bound = resolveBinding(bindings, expr, match.index);
    if (bound && bound.literal !== null) {
      const hit = literalToHit(callName, bound.literal, relFile, lineOf(match.index));
      if (hit) hits.push(hit);
      continue;
    }
    hits.push({ kind: 'variable', key: expr, file: relFile, line: lineOf(match.index) });
  }
  return hits;
}

/**
 * 变量的 key（t(setting.labelKey)、t(item.labelKey)）脚本追不到运行时值，
 * 但这类 key 在源码里一定以字面量形式存在（数据表里的 labelKey: 'nav.tasks'）。
 * 所以把所有"长得像 key 且文案表里确实有"的字符串字面量也算作一次引用，
 * 否则会把大量间接引用的文案误报成"未使用"。
 */
function collectKeyLiterals(code, relFile, existingKeys) {
  const lineOf = makeLineIndex(code);
  const found = new Map();
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i];
    if (ch !== "'" && ch !== '"' && ch !== '`') continue;
    const literal = readLiteral(code, i);
    if (!literal) continue;
    if (KEY_PATTERN.test(literal.text) && existingKeys.has(literal.text)) {
      const ref = `${relFile}:${lineOf(i)}`;
      const entry = found.get(literal.text) ?? { key: literal.text, refs: [] };
      if (!entry.refs.includes(ref)) entry.refs.push(ref);
      found.set(literal.text, entry);
    }
    i = literal.end - 1;
  }
  return found;
}

/* ========================================================================== *
 * 3. 对账
 * ========================================================================== */

function collect() {
  const files = walk(SRC_DIR, ['.vue', '.ts', '.tsx']).filter(
    (file) => file !== I18N_FILE && !file.endsWith('.d.ts')
  );

  const rawMessages = loadMessages();
  const locales = Object.keys(rawMessages);
  const messages = new Map(locales.map((locale) => [locale, flatten(rawMessages[locale])]));
  const localeLabelKeys = loadLocaleLabelKeys();
  const existingKeys = new Set();
  for (const table of messages.values()) for (const key of table.keys()) existingKeys.add(key);

  const staticKeys = new Map();
  const dynamicKeys = new Map();
  const variableKeys = new Map();
  const indirectKeys = new Map();
  const suspicious = [];

  for (const file of files) {
    const relFile = toRel(file);
    const source = readFileSync(file, 'utf8');
    const code = maskComments(maskVue(source));
    for (const hit of scanSource(code, relFile)) {
      const ref = `${hit.file}:${hit.line}`;
      const bucket =
        hit.kind === 'static'
          ? staticKeys
          : hit.kind === 'dynamic'
            ? dynamicKeys
            : hit.kind === 'variable'
              ? variableKeys
              : null;
      if (!bucket) {
        suspicious.push({ key: hit.key, ref });
        continue;
      }
      const entry = bucket.get(hit.key) ?? { key: hit.key, pattern: hit.pattern, refs: [] };
      if (!entry.refs.includes(ref)) entry.refs.push(ref);
      bucket.set(hit.key, entry);
    }

    for (const [key, entry] of collectKeyLiterals(code, relFile, existingKeys)) {
      if (staticKeys.has(key)) continue;
      const target = indirectKeys.get(key) ?? { key, refs: [] };
      for (const ref of entry.refs) if (!target.refs.includes(ref)) target.refs.push(ref);
      indirectKeys.set(key, target);
    }
  }

  return {
    files,
    locales,
    messages,
    localeLabelKeys,
    fallbackLocale: typeof capturedOptions.fallbackLocale === 'string' ? capturedOptions.fallbackLocale : null,
    staticKeys,
    dynamicKeys,
    variableKeys,
    indirectKeys,
    suspicious,
  };
}

function buildReport(data) {
  const { locales, messages, staticKeys, dynamicKeys, indirectKeys, localeLabelKeys } = data;
  const allLocaleKeys = new Set();
  for (const table of messages.values()) for (const key of table.keys()) allLocaleKeys.add(key);

  const missing = locales.map((locale) => ({
    locale,
    keys: [...staticKeys.keys()].filter((key) => !messages.get(locale).has(key)).sort(),
  }));

  const patterns = [...dynamicKeys.values()];
  const matched = new Set();
  const deadPatterns = [];
  for (const entry of patterns) {
    const hits = [...allLocaleKeys].filter((key) => entry.pattern.test(key));
    if (!hits.length) deadPatterns.push(entry);
    for (const key of hits) if (!staticKeys.has(key)) matched.add(key);
  }

  const unused = [...allLocaleKeys]
    .filter((key) => !staticKeys.has(key) && !matched.has(key) && !indirectKeys.has(key))
    .sort();

  // 默认语言是回退语言：它可以用数据层原文兜底，不必给每条业务数据再抄一份。
  // 所以不对称只在一个方向上算错——非默认语言漏了默认语言的 key，界面上就会露出别种语言。
  const defaultLocale =
    data.fallbackLocale && locales.includes(data.fallbackLocale) ? data.fallbackLocale : locales[0];
  const defaultKeys = messages.get(defaultLocale);
  const missingInNonDefault = locales
    .filter((locale) => locale !== defaultLocale)
    .map((locale) => ({
      locale,
      keys: [...defaultKeys.keys()].filter((key) => !messages.get(locale).has(key)).sort(),
    }));
  // 反方向：只存在于非默认语言的 key，是"覆盖项"，合法
  const overrideOnly = [...allLocaleKeys].filter((key) => !defaultKeys.has(key)).sort();

  // 同一 key 各语言的插值参数必须一致，否则某一种语言会把 {count} 原样吐到界面上
  const paramMismatch = [];
  for (const key of allLocaleKeys) {
    const perLocale = locales.map((locale) => messages.get(locale).get(key));
    if (perLocale.some((value) => value === undefined)) continue;
    const signatures = perLocale.map((value) => [...extractParams(value)].sort().join(','));
    if (new Set(signatures).size > 1) {
      paramMismatch.push({
        key,
        detail: locales.map((locale, index) => `${locale} {${signatures[index]}}`).join('  vs  '),
      });
    }
  }

  // 非中文语言里残留中文：基本等于漏翻（品牌名 / 业务数据会误报，所以只提示不拦截）
  const untranslated = [];
  for (const locale of locales) {
    if (/^zh(-|$)/.test(locale)) continue;
    for (const [key, value] of messages.get(locale)) {
      if (localeLabelKeys.has(key)) continue;
      if (CJK.test(value)) untranslated.push({ locale, key, value: value.slice(0, 48) });
    }
  }

  const rows = [...new Set([...staticKeys.keys(), ...allLocaleKeys])].sort().map((key) => {
    const refs = staticKeys.get(key)?.refs ?? indirectKeys.get(key)?.refs ?? [];
    const absent = locales.filter((locale) => !messages.get(locale).has(key));
    const isOverride = !defaultKeys.has(key);
    let status = 'OK';
    if (isOverride) status = unused.includes(key) ? '未使用' : '覆盖项';
    else if (absent.length) status = `缺 ${absent.join(' / ')}`;
    else if (paramMismatch.some((item) => item.key === key)) status = '参数不一致';
    else if (unused.includes(key)) status = '未使用';
    else if (!staticKeys.has(key) && !matched.has(key)) status = '间接引用';
    return { key, values: locales.map((locale) => messages.get(locale).get(key)), status, refs };
  });

  return {
    rows,
    missing,
    unused,
    defaultLocale,
    missingInNonDefault,
    overrideOnly,
    paramMismatch,
    untranslated,
    patterns,
    deadPatterns,
    indirectCount: indirectKeys.size,
  };
}

/* ========================================================================== *
 * 4. 输出
 * ========================================================================== */

const pad = (text, width) => String(text).padEnd(width);

function printSummary(data, report) {
  const { files, locales, messages } = data;
  console.log('');
  console.log('i18n 对账');
  console.log('─'.repeat(64));
  console.log(`  扫描文件      ${files.length} 个 .vue / .ts`);
  console.log(`  静态 key      ${data.staticKeys.size} 个`);
  console.log(`  动态 key      ${data.dynamicKeys.size} 个模板（含 \${} 插值）`);
  console.log(`  变量 key      ${data.variableKeys.size} 处（脚本无法静态解析）`);
  console.log(`  间接引用      ${data.indirectKeys.size} 条（数据表里以字符串字面量持有）`);
  for (const locale of locales) {
    console.log(`  ${pad(locale, 12)}  ${messages.get(locale).size} 条文案`);
  }

  const missingTotal = report.missing.reduce((sum, item) => sum + item.keys.length, 0);
  console.log('');
  console.log(`缺失 ${missingTotal} 处`);
  if (!missingTotal) console.log('  ✓ 代码里用到的 key 在每种语言里都存在');
  for (const item of report.missing) {
    if (!item.keys.length) continue;
    console.log(`  ${item.locale}`);
    for (const key of item.keys) {
      const refs = data.staticKeys.get(key)?.refs ?? [];
      console.log(`    - ${pad(key, 42)}${refs[0] ? ` ${refs[0]}` : ''}`);
    }
  }

  const nonDefaultMissing = report.missingInNonDefault.reduce((sum, item) => sum + item.keys.length, 0);
  console.log('');
  console.log(`漏译 ${nonDefaultMissing} 处（默认语言 ${report.defaultLocale} 有、其它语言没有）`);
  if (!nonDefaultMissing) console.log('  ✓ 各非默认语言覆盖了默认语言的全部 key');
  for (const item of report.missingInNonDefault) {
    if (!item.keys.length) continue;
    console.log(`  ${item.locale}`);
    for (const key of item.keys.slice(0, 15)) console.log(`    - ${key}`);
  }

  console.log('');
  console.log(`覆盖项 ${report.overrideOnly.length} 条（只在非默认语言存在，默认语言用数据层原文）`);
  for (const key of report.overrideOnly.slice(0, 8)) console.log(`  - ${key}`);
  if (report.overrideOnly.length > 8) console.log(`  … 其余 ${report.overrideOnly.length - 8} 条见 keys.csv`);

  console.log('');
  console.log(`参数不一致 ${report.paramMismatch.length} 条（同一 key 各语言的 {占位符} 不同，会原样吐到界面上）`);
  if (!report.paramMismatch.length) console.log('  ✓ 各语言的插值参数一致');
  for (const item of report.paramMismatch.slice(0, 20)) {
    console.log(`  - ${item.key}`);
    console.log(`      ${item.detail}`);
  }

  if (report.untranslated.length) {
    console.log('');
    console.log(`残留中文 ${report.untranslated.length} 条（非中文语言里的中文，多为漏翻；品牌名/业务数据会误报）`);
    for (const item of report.untranslated.slice(0, 15)) {
      console.log(`  - ${pad(item.locale, 7)} ${pad(item.key, 40)} ${item.value}`);
    }
  }

  console.log('');
  console.log(`未使用 ${report.unused.length} 条（文案存在、代码里没有任何引用）`);
  const groups = new Map();
  for (const key of report.unused) {
    const parts = key.split('.');
    const namespace = parts.length > 2 ? `${parts[0]}.${parts[1]}.*` : `${parts[0]}.*`;
    groups.set(namespace, (groups.get(namespace) ?? 0) + 1);
  }
  const grouped = [...groups.entries()].sort((left, right) => right[1] - left[1]);
  if (grouped.length) {
    console.log(`  按命名空间：${grouped.map(([namespace, count]) => `${namespace} ${count}`).join('  ')}`);
  }
  for (const key of report.unused.slice(0, 25)) console.log(`  - ${key}`);
  if (report.unused.length > 25) console.log(`  … 其余 ${report.unused.length - 25} 条见 keys.csv`);

  if (report.deadPatterns.length) {
    console.log('');
    console.log(`动态 key 未命中任何文案 ${report.deadPatterns.length} 处`);
    for (const entry of report.deadPatterns) {
      console.log(`  - ${pad(entry.key, 46)} ${entry.refs[0]}`);
    }
  }

  if (data.variableKeys.size) {
    console.log('');
    console.log('变量 key（需人工确认，脚本读不到运行时值）');
    for (const entry of [...data.variableKeys.values()].slice(0, 20)) {
      console.log(`  - ${pad(entry.key, 32)} ${entry.refs[0]}`);
    }
  }

  if (data.suspicious.length) {
    console.log('');
    console.log('不像 key 的字符串实参（已忽略，仅提示）');
    for (const item of data.suspicious.slice(0, 12)) console.log(`  - ${pad(item.key, 32)} ${item.ref}`);
  }
}

function writeCsv(outDir, report, locales) {
  const header = ['key', ...locales, '状态', '引用位置'];
  const lines = [header.join(',')];
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  for (const row of report.rows) {
    lines.push([
      escape(row.key),
      ...row.values.map(escape),
      escape(row.status),
      escape(row.refs.join(' ')),
    ].join(','));
  }
  const file = resolve(outDir, 'keys.csv');
  writeFileSync(file, `\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
  return file;
}

function writeJson(outDir, report, data) {
  const payload = {
    generatedAt: new Date().toISOString(),
    locales: data.locales,
    stats: {
      files: data.files.length,
      staticKeys: data.staticKeys.size,
      dynamicKeys: data.dynamicKeys.size,
      variableKeys: data.variableKeys.size,
      missing: report.missing.reduce((sum, item) => sum + item.keys.length, 0),
      defaultLocale: report.defaultLocale,
      missingInNonDefault: report.missingInNonDefault.reduce((sum, item) => sum + item.keys.length, 0),
      overrideOnly: report.overrideOnly.length,
      paramMismatch: report.paramMismatch.length,
      untranslated: report.untranslated.length,
      unused: report.unused.length,
    },
    keys: report.rows.map((row) => ({
      key: row.key,
      values: Object.fromEntries(data.locales.map((locale, index) => [locale, row.values[index] ?? null])),
      status: row.status,
      refs: row.refs,
    })),
    overrideOnly: report.overrideOnly,
    paramMismatch: report.paramMismatch,
    untranslated: report.untranslated,
    dynamic: [...data.dynamicKeys.values()].map((entry) => ({ template: entry.key, refs: entry.refs })),
    variables: [...data.variableKeys.values()].map((entry) => ({ expression: entry.key, refs: entry.refs })),
  };
  const file = resolve(outDir, 'keys.json');
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return file;
}

/* ========================================================================== *
 * 5. 硬编码中文巡检
 * ========================================================================== */

const CJK = /[\u4e00-\u9fa5]/;
const ATTR_RE = /\s(?::|v-bind:)?(placeholder|title|label|aria-label|alt|content)="([^"]*)"/g;

function scanHardcodedCjk() {
  const findings = [];
  const files = walk(SRC_DIR, ['.vue']);
  for (const file of files) {
    const relFile = toRel(file);
    const source = readFileSync(file, 'utf8');
    const lineOf = makeLineIndex(source);
    const masked = maskVue(source, { keepScript: false });

    // 文本节点：先抹掉 {{ ... }}（那是表达式，已经在用 t()），再看剩下的
    const textProbe = masked.replace(/\{\{[\s\S]*?\}\}/g, (chunk) => blanket(chunk));
    let cursor = 0;
    const tagRe = /<[^>]+>/g;
    let tag;
    const push = (text, index) => {
      const trimmed = text.trim();
      if (trimmed.length < 1 || !CJK.test(trimmed)) return;
      findings.push({
        file: relFile,
        line: lineOf(index + text.indexOf(trimmed)),
        text: trimmed.slice(0, 60),
        kind: 'text',
      });
    };
    while ((tag = tagRe.exec(textProbe))) {
      push(textProbe.slice(cursor, tag.index), cursor);
      cursor = tag.index + tag[0].length;
    }
    push(textProbe.slice(cursor), cursor);

    // 静态属性：placeholder / title / label / aria-label / alt 没写成 :attr="t(...)"
    ATTR_RE.lastIndex = 0;
    let attr;
    while ((attr = ATTR_RE.exec(source))) {
      const value = attr[2];
      // 已经走 t() 的部分先摘掉，只看剩下的裸中文
      const bare = value.replace(/t\((['"`])(?:\\.|(?!\1)[\s\S])*?\1/g, '');
      if (!CJK.test(bare)) continue;
      findings.push({
        file: relFile,
        line: lineOf(attr.index),
        text: `${attr[1]}="${value.slice(0, 50)}"`,
        kind: 'attr',
      });
    }
  }
  return findings;
}

/* ========================================================================== *
 * 6. 入口
 * ========================================================================== */

function parseArgs(argv) {
  const flags = { cmd: argv[0] ?? 'extract', out: DEFAULT_OUT, strict: false };
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--out') flags.out = resolve(ROOT, argv[i + 1] ?? DEFAULT_OUT);
    else if (argv[i] === '--strict') flags.strict = true;
  }
  return flags;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.cmd === 'cjk') {
    const findings = scanHardcodedCjk();
    console.log('');
    console.log(`硬编码中文巡检：${findings.length} 处`);
    console.log('─'.repeat(64));
    console.log('这些是渲染到界面上的中文字面量。是否要进 i18n，按翻译边界判断：');
    console.log('系统文案/枚举 → 抽 key；品牌名、用户业务数据 → 保留原样。');
    console.log('');
    for (const item of findings) {
      console.log(`  ${item.file}:${item.line}  ${item.kind === 'attr' ? '[属性] ' : ''}${item.text}`);
    }
    mkdirSync(flags.out, { recursive: true });
    const file = resolve(flags.out, 'hardcoded-cjk.json');
    writeFileSync(file, `${JSON.stringify(findings, null, 2)}\n`, 'utf8');
    console.log('');
    console.log(`已写出 ${toRel(file)}`);
    return;
  }

  const data = collect();
  const report = buildReport(data);
  printSummary(data, report);

  mkdirSync(flags.out, { recursive: true });
  const csv = writeCsv(flags.out, report, data.locales);
  const json = writeJson(flags.out, report, data);
  console.log('');
  console.log(`已写出 ${toRel(csv)}（给翻译）与 ${toRel(json)}（给工具）`);

  if (flags.cmd === 'check') {
    const missingTotal = report.missing.reduce((sum, item) => sum + item.keys.length, 0);
    const nonDefaultMissing = report.missingInNonDefault.reduce((sum, item) => sum + item.keys.length, 0);
    const failures = [];
    if (missingTotal) failures.push(`缺失 ${missingTotal} 个 key`);
    if (nonDefaultMissing) failures.push(`漏译 ${nonDefaultMissing} 个 key`);
    if (report.paramMismatch.length) failures.push(`插值参数不一致 ${report.paramMismatch.length} 个 key`);
    if (flags.strict && report.unused.length) failures.push(`未使用 ${report.unused.length} 个 key`);
    if (flags.strict && report.untranslated.length) failures.push(`残留中文 ${report.untranslated.length} 条`);
    if (report.deadPatterns.length) failures.push(`动态 key 模板 ${report.deadPatterns.length} 处没有命中任何文案`);
    if (failures.length) {
      console.log('');
      console.error(`✗ i18n 校验未通过：${failures.join('；')}`);
      process.exitCode = 1;
      return;
    }
    console.log('');
    console.log('✓ i18n 校验通过');
  }
}

main();
