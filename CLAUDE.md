# Frontend Development Rules

`AGENTS.md` is the primary implementation rule source. `CLAUDE.md` mirrors it byte for byte. Detailed implementation contracts live in `docs/FRONTEND-RULES.md`. Read the sections relevant to the task.

## Design entry

Implementation priority is **麦唐语义 Token（DESIGN.md 麦唐设计规范） → Arco → 少量通用组合组件 → 已验证页面模式 → 简短 AI 入口 → 自动检查**.

Start with `AI-DESIGN.md` and `pnpm design:context list` (or `form`, `detail`, `confirmation`). Read the returned actual components, project profile and applicable DESIGN.md sections. Module PRDs govern business fields, permissions and transitions.

`src/design/registry.json` is the component and pattern index. Reuse a matching composition before assembling another implementation. `src/design/project.json` preserves approved project differences. Update design JSON only when a design-system change is authorized, then run `pnpm design:tokens`. Generated CSS is checked on build.

## Scope and ownership

- Preserve existing user and concurrent edits. Inspect source before changing it. Limit edits to the requested feature and required shared dependencies.
- PRDs, DESIGN.md, design-system documentation and showcase changes require explicit authorization in the current request. Reading a source grants read access only.
- Deliver business pages as Vue SFCs in `src/modules/<feature>`. Use the existing router, shell, providers and stores.
- Keep app bootstrapping/routing/i18n in `src/app`, shell in `src/layouts`, design primitives in `src/design`, cross-domain utilities in `src/shared`.
- Execute routine authorized work directly. Resolve missing business rules or destructive scope before dependent changes.

## Implementation contracts

- Use Vue 3 Composition API with `<script setup lang="ts">`, TypeScript, Vite, Vue Router, Pinia, Vue I18n and `@arco-design/web-vue`. Read resolved versions from package.json and lockfile.
- Use Arco icons. Additional dependencies require a concrete gap in existing capabilities. Use Vue bindings, typed props/emits and reactive rendering.
- Metritag semantic tokens govern visual values and Arco adaptation. Keep private page styles scoped and theme adaptation centralized.
- Business pages begin with toolbar, filters or business content. Shell navigation identifies the route. Section/dialog/drawer titles remain applicable.
- List headers, values, labels, row links and badge text use weight 400. Use semantic color and layout for hierarchy.
- Keep filters and lists as sibling regions where the specified page pattern requires them. Use cards only for framed tools or repeated items.
- Every visible control performs its action. Implement relevant loading, error, empty, no-match, disabled and recovery states. Searches, pagination and sort affect displayed data.
- Forms preserve values after failures, prevent duplicate submits and expose validation with first-error focus/scroll. Deliberately handle close, Escape, mask, focus return and dirty-state policies for each overlay.
- Use shared ConfirmDialog for confirmations. The caller owns async completion, loading and visibility. Use the project's field-label component/helper and punctuation profile.
- Use typed module mock data until an API contract exists. Mask sensitive identifiers and distinguish simulated saves from server-confirmed results. Authentication stays in auth store/router guards.
- Support live zh-CN/en-US switching through useLocaleStore. Static UI copy and enums need matching keys. Records store enum codes. Proper nouns and IDs render verbatim. Free-text overrides follow the detailed localization contract.
- For enum label helpers write key prefixes inline so scripts/i18n.mjs can inspect them. Keep names outside translation dictionaries. Preserve all existing translation boundary rules in docs/FRONTEND-RULES.md.
- Use semantic HTML, programmatic input names, icon-action accessible names, visible focus and keyboard operation. Pair status color with text. Respect reduced motion.
- Verify the affected light/dark scope, desktop and supported narrow layouts, long English text, opened overlays and table-only horizontal scrolling.
- Preserve direct-load, refresh, back/forward, route guards and active navigation. Keep console free of introduced errors and translation warnings.

## Required verification

1. Run `pnpm verify` and `pnpm build`. Both run design checks. Verify also runs typecheck, i18n and the design-rule regression tests.
2. Run `pnpm design:browser` for shared UI/pattern changes. It starts an isolated development server unless DESIGN_BASE_URL is supplied, uses an isolated browser context, and records evidence in design-report/browser.json.
3. Exercise the real affected route and business interactions in a browser. Build success alone does not establish visual or interaction acceptance.
4. Run `pnpm design:audit` to include historical static findings as failures. Baseline expansion requires explicit review. Inspect design-report/check.json for the actual coverage and findings.
5. Run `pnpm design:sync` for authorized shared changes. `node scripts/design-sync.mjs --write` propagates only listed shared files to configured peers. Regenerate and verify each target separately.
6. Report changed files, tests, observed browser states and remaining limitations accurately. Keep documentation updates within the user's authorization.

## Detailed rules

Use `docs/FRONTEND-RULES.md` for full scope, interaction matrices, localization/data boundaries, accessibility and the pre-delivery checklist. DESIGN.md remains authoritative for visual rules, and a module PRD remains authoritative for business behavior.
