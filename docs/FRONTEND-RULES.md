# Frontend Development Rules

> These rules apply to this Vue frontend project. `AGENTS.md` is the primary rule source; `CLAUDE.md` mirrors it for Claude Code. Keep the two files synchronized. If they ever conflict, follow `AGENTS.md`.
> `DESIGN.md` governs visual design, component usage, and interaction conventions. A module PRD, when one exists, governs that module's content and business behavior. Read all relevant sources before implementation; reading a document does not authorize changing it.
> The division of responsibility is: **AGENTS.md / CLAUDE.md: how to implement and verify · DESIGN.md: visual and interaction standards · module PRD: what the feature must do.**

## 0. AI Design System Workflow

Implementation priority is **Metritag semantic tokens (DESIGN.md) → Arco → shared compositions → verified page patterns → concise AI entry → automated checks**.

- Start page work with `AI-DESIGN.md` and `pnpm design:context <list|form|detail|confirmation>`. Read the returned component implementations and applicable DESIGN.md sections together with the module PRD. This focused retrieval replaces reading unrelated design history on every task.
- `src/design/registry.json` lists actual reusable components. Use a matching composition when available, then compose Arco primitives using Metritag tokens for uncovered cases.
- Edit `tokens.core.json` / `tokens.project.json` only for an authorized design-system change and run `pnpm design:tokens`. CSS output is generated and checked for drift.
- `project.json` records approved project differences, including brand and field punctuation. Consult the project specification before changing these values.
- Run `pnpm verify` and `pnpm build`. Both enforce design checks. Run `pnpm design:browser` against the development server for shared UI changes, and exercise the affected real route as required below.
- `design-report/check.json` exposes historical design debt. New violations fail. `pnpm design:audit` fails on historical violations too. Expanding `legacy-baseline.json` requires an explicit baseline review, with the changed rules and reasons documented.
- `pnpm design:sync` checks common files against the configured peer projects. Authorized shared changes may be propagated with `node scripts/design-sync.mjs --write`, followed by generation and validation in each project.
- Delivery evidence must distinguish automated assertions, manually inspected screenshots, and business routes actually exercised.

## 1. Scope and Document Authorization

- By default, change only the Vue component, module styles, data, and logic needed for the user's requested feature. Change shared routes, layout, state, theme, or components only when the feature requires it. Do not refactor unrelated modules.
- **Do not update a PRD automatically.** A change in business behavior, UI state, or page structure is not authorization to rewrite product documentation. Update a PRD only when the current user request explicitly asks to update/synchronize it or names that file.
- **Do not update `DESIGN.md` automatically.** Use it as a source of truth, but change it only when the user explicitly requests a design-specification update or names it. The same rule applies to design-system documentation and showcase pages.
- Do not treat permission to read source material as permission to write it. Do not make post-delivery documentation changes without authorization.
- Preserve unrelated work and existing user changes. Inspect files before editing; do not delete or revert work outside the requested scope.
- Execute routine requested commands and edits directly. Ask for clarification when a missing business rule, ownership boundary, or destructive scope cannot be determined safely.

## 2. Role and Deliverable

Act as a senior frontend engineer building maintainable, accessible, production-oriented Vue pages for this project. A deliverable is a Vue single-file component (`.vue`) integrated with the application router, state, theme, and shared layout as appropriate. Business pages are **not** standalone `.html` files. The root `index.html` is only Vite's application entry point, not a template for new pages.

Implement complete user workflows with realistic states and interactions rather than static screenshots. Keep code understandable and reusable by developers without prematurely extracting a shared abstraction for one page.

## 3. Technology Stack

| Concern | Project standard |
| --- | --- |
| Application | Vue 3 with Composition API and `<script setup lang="ts">` |
| Language and build | TypeScript and Vite; use the versions resolved by `package.json` and `pnpm-lock.yaml` |
| UI components | `@arco-design/web-vue`; prefer existing Arco components and project wrappers |
| Icons | Arco icons from `@arco-design/web-vue/es/icon`; no emoji used as interface icons |
| Styling | `DESIGN.md` combined with Arco semantic tokens and the existing `src/design/tokens.css` / `src/styles/global.css` conventions; component-local styles for page-specific needs |
| Routing | Vue Router; define routes and guards in `src/app/router.ts` following existing conventions |
| State | Pinia for shared application/domain state; local Vue reactive state for page-only concerns |
| Localization | Vue I18n; all pages must support the shell's `zh-CN` and `en-US` locales, with Simplified Chinese as the default |
| Data | Module-scoped typed mock data until an API contract is supplied; do not present mock behavior as a real backend |
| Charts | Add a charting dependency only when the feature requires it and the project has approved the choice; use semantic colors and text alternatives |

Do not replace Vue with native-script business pages, React, jQuery, or a CDN-based prototype stack. Do not introduce a second UI library, icon library, or build system for a single feature. Add a dependency only when existing project capabilities cannot satisfy the requirement.

## 4. Project Structure and Runtime Ownership

- `src/app/` owns application bootstrapping, providers, routing, and localization. `src/layouts/` owns the application shell. `src/modules/<feature>/` owns feature pages, components, data, and domain state. `src/design/` owns design tokens and shared design primitives; `src/shared/` owns cross-domain utilities.
- Follow the existing route and layout model. A page must not create a second app root, top bar, sidebar, or global provider inside a module. Global feedback/configuration is managed at the app level; a module owns its local content and business overlays.
- Register stable route names and paths in Vue Router. Use `router-link` or router navigation for internal routes, not direct file navigation. Direct load, refresh, back/forward, guarded routes, and active navigation must remain consistent.
- Keep authentication and session behavior in the auth store and router guard. The current mock login is for development; it is not production authentication. Never store plaintext passwords or claim a mock token is secure.
- Use TypeScript types for props, emits, domain records, and API boundaries. Keep DOM manipulation inside Vue's reactive rendering model; do not duplicate rendered markup with imperative JS.

## 5. Visual Standards

- Read `AI-DESIGN.md` and applicable `DESIGN.md` sections before changing a page. Use its applicable Vue/Arco guidance for layout, typography, color roles, surfaces, spacing, density, responsive behavior, and accessibility. Sections explicitly marked `[Legacy]` describe a former prototype and are not automatic implementation requirements for this Vue project.
- For a two-Tab section list with new/detail child routes, check `DESIGN.md` “Section list and child-route composition”: keep each Tab's filter and list as sibling regions and the child route in the existing shell. Only apply this pattern where the feature calls for it.
- Prefer Metritag semantic tokens, then the project-adapted Arco variables. Use primary for the main action/selection, success for positive outcomes, warning for attention, danger for errors/destructive actions, and neutral/info for information. Pair color with text or icons so meaning does not depend on color alone.
- Do not copy raw color values, radii, or font sizes from unrelated examples. If a needed design case is not covered, first use the nearest existing token/component pattern; document a new shared decision only with authorization.
- Build quiet, task-oriented enterprise UI: clear hierarchy, predictable controls, useful information density, and restrained surfaces. Use `a-card` for a genuinely framed tool or repeated item, not as a wrapper around every section or inside another card.
- In data lists, render column headers, field names, parameter values, row text, links, and row badges at regular font weight (400).
- Keep user-facing copy concise and in Simplified Chinese unless the product requirement explicitly specifies another language. English code and documentation do not change the UI language.
- Check light/dark theme behavior when the affected surface supports both. Verify hover, selected, focus, disabled, loading, and error treatments, not only the default screenshot.

## 6. Interaction and State Requirements

| Area | Expected behavior |
| --- | --- |
| Navigation and tabs | Clicking changes the active route or visible panel; selection and content stay synchronized. |
| Dialogs and drawers | Open/close, focus entry/return, mask/Escape behavior, scroll ownership, and unsaved-change policy are deliberate. |
| Forms | Required/format/cross-field rules as specified; visible error messages, first-error focus or scroll, retained values after failure, and duplicate-submit prevention. |
| Search and filters | Apply to actual displayed records or API queries; distinguish draft filters from applied filters where the UI requires it. |
| Lists and tables | Loading, empty, no-match, error, pagination, sort, and selection states work when those controls are present. |
| Feedback | Show loading during the request; announce success only after success is confirmed; provide a recovery path for failure. |
| Controls | Every visible button, link, menu item, and option performs an action. Do not show an inert or misleading control. |

Use Arco's Vue component APIs (`:model`, `field`, `v-model`, named `v-model:*`, slots, and events) rather than React-specific patterns or direct DOM workarounds. Keep business data and side effects out of templates and computed getters.

### Localization contract

- Every new or modified page must react to the existing language switch without a reload. Put user-facing copy in matching `zh-CN` and `en-US` Vue I18n keys: headings, controls, options, table fields, tooltips, dialogs, feedback, empty/error states, accessible names, and chart legends/tooltips/announcements.
- Keep stable IDs, enums, numeric values, timestamps, and masked identifiers in module data; resolve mock display labels and descriptions through the active locale. Preserve technical identifiers and product names only when they are intentionally language-independent. Do not use Chinese display strings as domain keys or concatenate untranslated phrases in templates.
- Reuse the app-level locale and Arco locale configuration. Locale changes must update open overlays and charts as well as the base page. Check direct load/refresh with the saved locale, both directions of switching, long English text, keyboard/accessible text, and missing-key or fallback warnings.

### Translation boundary and tooling

| Content | Goes through i18n? |
| --- | --- |
| Static UI copy, labels, system enum dictionary items, button/option text, empty/error states, accessible names | Yes — a key in **both** `zh-CN` and `en-US` |
| Proper nouns and identifiers: person names, project/task names, record IDs, codes, timestamps, brand/product names | No — render verbatim in every locale; never enter the dictionary and never get a locale override |
| Free-text business content: descriptions, notes, task content | Default locale renders the record; other locales may override via `<ns>.records.<id>.<field>` |
| System enums | Store the `code` in the data and render with `t(\`ns.${code}\`)`, so a new value never requires touching templates |

- A key missing from one language falls back to the raw key path, which is a visible defect. `pnpm i18n:check` fails on missing, one-sided keys, and mismatched `{placeholder}` parameters across languages; `pnpm verify` runs it together with `vue-tsc`.
- `pnpm i18n:extract` writes `i18n-report/keys.csv` (key, both languages, status, source references) for translation hand-off. `pnpm i18n:cjk` lists Chinese literals rendered from templates that never went through `t()`, for a human to judge against the boundary above.
- Switch language only through `useLocaleStore()` in `src/app/stores/locale.ts`. It owns persistence, `<html lang>`, the Arco locale pack, and cross-tab sync, while `vue-i18n`'s `locale` remains the single source of truth. Do not assign `i18n.global.locale` or write `localStorage` from a component.
- Supported languages live in `src/app/locale.ts`; adding one is a registry row plus its `shell.<lang>` copy — the switch UI needs no change.

#### Enums and business data

Two different mechanisms, do not mix them:

| Kind | Where the value lives | How it renders |
| --- | --- | --- |
| System enum (app, project, status, priority, action type, stage, gate, member role, brand, vehicle, template, country) | A `*_CODES` tuple in the module's `data/` file; records store the **code** | A per-enum function in the module's `labels.ts` (`tasks/appLabels`, `models/data/stages`, …) |
| Proper noun / identifier (project name, person name, task name, project code) | The record itself, in the source language | Verbatim in every locale. Person names live in a plain map in the module's `data/` file (e.g. `PEOPLE` in `models/data/projects.ts`); names are read directly off the record, never through `t()` — no dictionary entry, no locale override |
| Free-text business content (project description, task description, task content) | The record itself, in the source language | `te(key) ? t(key) : record.field` — the default locale reads the record, other locales may override |

- Never map Chinese display text to English inside a component. That is what the dictionary is for, and a hand-written map silently drifts from it (this repo had four, all stale). Enum keys are codes, never Chinese strings.
- Proper nouns are never translated, not even transliterated into a dictionary. A project name or person name is the record's identity: an English rewriting of it breaks the link to the source record in logs, exports, and support. Do not add `<ns>.records.<id>.name` or `<ns>.data.users`-style keys — `models.records.<id>.name` and the English person-name dictionary were removed for exactly this reason.
- In `labels.ts`, write the key prefix as an inline template literal (`const key = \`models.data.stages.${code}\``). Do not wrap `t`/`te` in a shared `read(key, fallback)` helper: `scripts/i18n.mjs` only sees the prefix when the literal is written out, so a helper turns every enum key in the module into an unverifiable runtime variable.
- Keep one key per enum member per language so the two stay symmetrical; `i18n:check` fails on 漏译 (a non-default locale missing a key the default locale has).
- Overrides (`<ns>.records.<id>.<field>`) are allowed to exist only in non-default locales, and only for free-text content fields; `i18n:check` reports them as 覆盖项 rather than as an error. Deleting the default-locale copy is the point: it removes the duplicate that drifts.

## 7. Data and Mocking

- Use typed, module-scoped mock arrays/objects to drive prototype lists and views until real APIs exist. Do not hardcode repeated table rows in templates.
- Make mock data credible for the new feature and include the states necessary to exercise its filters, badges, errors, and pagination. For a paginated prototype list, provide enough records to demonstrate more than one state/page; do not impose a list-data requirement on a login or form page.
- Mask sensitive identifiers and credentials in sample records. Demo credentials, when explicitly needed, must be clearly identified as local mock behavior and must not be prefilled with real secrets.
- Separate mocked results from backend claims. When integrating an API, define loading, empty, timeout, authorization, stale-response, and failure behavior from the approved contract.

## 8. Responsive and Accessibility Requirements

- Build desktop-first business pages that remain usable at the project's declared minimum width. Check intermediate widths and mobile where that route is intended to support it. Use responsive Grid/Flex layouts; allow wide tables to scroll rather than squeeze or overflow.
- Prevent clipping, overlap, and unintended jumps when dropdowns, popovers, menus, validation messages, or long content appear. Keep overlay layering and scroll ownership coherent.
- Use semantic elements within Vue templates. Give every input a visible label or programmatic name, every icon-only action an accessible name, and every meaningful image alternative text. Maintain a logical Tab order, visible focus, keyboard operation, and sufficient contrast according to `DESIGN.md`.
- Respect reduced-motion preferences for nonessential motion. Do not make a status or a required action perceivable only by color or hover.

## 9. Code Quality

- Use readable, cohesive `<script setup lang="ts">`, `<template>`, and scoped or deliberately shared styles. Name components, classes, and state by their domain purpose; avoid global selectors for a local feature.
- Keep comments brief and explain non-obvious behavior or business constraints. Do not add narration for self-evident assignments. Reuse established components and helpers before introducing a new abstraction.
- Ensure imports, routes, state, and styles are consistent after a module is added or removed. Do not leave dead links, stale assets, unreachable controls, or duplicated implementation.
- No runtime errors or avoidable console warnings. Do not log plaintext credentials, tokens, personal data, or sensitive identifiers.

## 10. Workflow for Each Page

1. Read `AGENTS.md` / `CLAUDE.md`, `AI-DESIGN.md`, applicable `DESIGN.md` sections, the relevant module PRD (if present), and the target route/components. Identify the requested behavior and affected shared dependencies.
2. Define the page's field labels, states, interactions, route behavior, mock/API data, responsive needs, and acceptance cases from the supplied requirements. Clarify genuinely unresolved business rules before implementation.
3. Implement the page as Vue components with Arco controls, semantic tokens, typed state, and working interactions. Update shared route/layout/state files only when required.
4. Run `pnpm verify` and `pnpm build` (or the project's current equivalent), plus focused tests where available. Fix introduced errors and inspect the output for stale imports/assets.
5. Verify the real route in a browser at representative desktop and narrow widths in both supported languages. Exercise language switching, valid and invalid actions, keyboard access, refresh/back/forward, overflow, and the console. A static build alone is not visual or interaction verification.
6. Respect the document-update authorization boundaries in Section 1. Report the files changed, tests run, browser checks performed, and any remaining limitations without claiming unperformed verification.

## 11. Pre-Delivery Checklist

- [ ] The route renders a Vue component in the intended application layout; direct load, refresh, and back/forward work.
- [ ] The page follows applicable `DESIGN.md` guidance and Arco component patterns; no former-prototype instructions were imported by accident.
- [ ] Semantic colors, typography, spacing, surface treatments, icons, and focus styles are consistent.
- [ ] Relevant mock data is typed, credible, rendered from data, and masks sensitive information.
- [ ] Every visible control works; validation, loading, success, failure, empty, and disabled states are usable where applicable.
- [ ] Desktop and supported narrow layouts do not overflow, clip, or overlap; long content and opened overlays remain usable.
- [ ] Semantic labels and keyboard behavior are present; status is not conveyed by color alone.
- [ ] `zh-CN` and `en-US` cover the whole route and its overlays/linked flows; switching updates visible and accessible copy without clipping or missing keys.
- [ ] No dead routes, stale imports/assets, duplicate shell, runtime errors, or avoidable console warnings remain.
- [ ] Typecheck/build and relevant tests pass; actual browser states were inspected where the environment allows.
- [ ] No PRD, `DESIGN.md`, or unrelated documentation was changed without explicit authorization.

## 12. Prohibited Shortcuts

- Do not create standalone business `.html` files, a parallel application shell, iframe-based module routing, or a CDN prototype in place of a Vue page.
- Do not introduce an unapproved framework or library, or invent a visual system that departs from `DESIGN.md` and Arco.
- Do not make controls visually clickable but nonfunctional, or report mock behavior as a completed backend integration.
- Do not hardcode repeated data rows, expose sensitive mock values, or store plaintext passwords.
- Do not treat passing TypeScript or a successful build as proof that the responsive layout and interactions work.
- Do not silently modify product/design documentation or unrelated modules to make an implementation appear complete.

## 13. Example Task Instruction

> "Read `AGENTS.md`, `DESIGN.md`, and the relevant module PRD. Implement the requested page as a Vue component under `src/modules/<feature>/`, connect it through Vue Router, use Arco components and the project's design tokens, then complete the pre-delivery checklist."
