# Metritag Design — 麦唐产品设计规范

> The design specification of record for 麦唐科技 (Metritag) products, synchronized from the Figma source of truth. This is a **proprietary design system that overrides Arco Design defaults**: where a value below differs from an Arco default, the value below wins.

**Source:** Figma file `BIaI9TEH8NiVlkKtbHaCh3` — 麦唐产品设计规范 · cover **Metritag Design v0.1.0** · changelog entry `2024.12.13 — 版本 1.0.0 结合品牌和产品制定设计规范` · cached file `lastModified 2026-01-12T14:04:10Z`, version `2316142384288859459`. The cover and changelog use different version labels; neither is silently promoted to a resolved release number. The cache inventories 37 pages, but is not a complete, current export; see Source coverage.

**Implementation:** Vue 3 + TypeScript + `@arco-design/web-vue`. Arco supplies component mechanics; use measured Metritag values for the components and states actually specified in Figma. Unspecified cases follow the fallback contract under Component selection.

**Theme:** the cached light palette is Figma-backed. A complete Figma dark-mode token mapping is **not verified by the available cache** (variable inventory is unavailable); absence cannot be inferred. The dark mapping below is an **implemented project extension**, marked **[Project-Dark]**, not a verified Figma specification or proof that every rendered state passes contrast. An authenticated Figma dark specification, if confirmed, supersedes this project mapping where they differ.

**UI language:** Simplified Chinese. This document is written in English; the product interface is not.

**Production use:** the Figma-backed values below are a design reference, not proof that the current Vue application implements every value or passes release acceptance. The open gates under Governance apply to the affected routes and components. Do not close a gate by editing this document alone.

## How to read this document

Values in Figma-backed tables are read from the cached nodes or source prose. Where the source gives only a visual example, the rule is generalized from readable geometry, fills, strokes, and variant state names — those entries are marked **[Derived]**. Source wording is marked **[Stated]**. Project-level implementation contracts that Figma does not cover (routing, data, permissions, testing) are marked **[Project]**; their implementation status does not itself prove product or design approval. Cache gaps and disputed interpretations are listed under Source coverage.

Precedence: law/security/accessibility obligations > approved business rules and module PRD > this document > Arco defaults. An Arco demo does not establish a Metritag rule.

## Governance

- At project kickoff record the locked Vue/Arco versions, router/store, default language and time zone, supported browsers and minimum viewport, roles and tenants, and acceptance owners. Product owns field dictionaries, state transitions, permissions, and exceptions; design owns structure, tokens, interaction, and all visible states; frontend owns implementation and tests; QA checks each route against the release checklist.
- “Must” and “must not” are release gates; “should” is the default requiring a recorded exception; “may” depends on context. Record a deviation's clause, reason, affected routes, approvers, version, evidence, review date, and rollback path. A local `.vue` style override is not a platform decision.
- Scope: desktop-first admin, operations, CRM, approval, finance, and configuration products. Marketing sites, native mobile, embedded microfrontends, and display walls need separate specifications.
- When this document and the Figma file disagree, the Figma file wins **unless an explicit, scoped user-approved update is recorded below**. The recorded Figure 1 / Figure 2 page-shell update is such an exception; other Figma component rules remain in force. When this document and an Arco default disagree, this document wins.
- **Layout update, 2026-10-22:** the user-supplied Figure 1 and Figure 2 explicitly replace the older cached Figma Layout page's shell dimensions for the two page patterns below. This override is limited to page-shell geometry; the original Figma navigation component variants remain source evidence, not automatic page-shell widths.
- **Page-title removal, 2026-10-24:** by user decision, business pages render **no page title and no subtitle inside the content area** — page identity is carried by the shell navigation. The former 18px/600/26 page-title role and every reference to it (Typography · Title roles, Spacing, Composition, Review checklist) are removed from this document. Panel, card, dialog, and drawer titles at 16px/600/24 are unchanged, and standalone full-screen routes keep their own hero scale.
- **Ledger list update, 2026-10-25:** by user decision, recorded under the affected sections — (1) filter strips wrap on a uniform grid with right-aligned labels / left-aligned controls and the action group trailing the last filter (Filter control surface rule); (2) icon-only settings triggers render on the `#DDDDDD` fill (Icon-only toolbar controls) — **superseded 2026-10-26, see the next entry**; (3) business drawers use the `#F7F8FA` canvas with white header/footer/content-group cards, and read-only drawers close on mask click with a linear slide-right (Drawer).
- **Icon trigger fill update, 2026-10-26:** by user decision, the 筛选条件设置 and 列设置 icon-only triggers drop the `#DDDDDD` fill and render on the **white business surface** (`app-btn-neutral`), matching the text buttons beside them in the same toolbar. The 2026-10-25 grey-fill rule and its `app-icon-trigger` implementation are retired; the authoritative wording now lives under Icon-only toolbar controls.
- **Form field layout, 2026-11-01:** by user decision, configuration/edit forms use label-above + **500px control width** + left-side required asterisk, and read-only views switch to the `字段名：值` summary list (Form field layout under Components). Forms made of several equally mandatory parts split those parts into tabs; there is no extra progress strip (Mandatory-part headers under Lists).
- **Row drag-reorder language, 2026-11-01:** by user decision, the 列设置 popover's drag-reorder grammar is promoted to the **project-wide standard** for pointer-driven row reordering: source row fades to `opacity: .55` with `grabbing` cursor, the valid destination row tints with `--color-primary-light-1` and carries a 3px `--app-accent` insertion line on the approached edge, and the drag snapshot must be the whole row via `dataTransfer.setDragImage` — never the bare 20×28 handle. Authoritative wording lives under Row drag-and-drop reorder (Components).

### Decision and release gates [Project]

`Open` means the decision or its verification evidence is missing. Owners are roles, not implied approvals. Close a gate only with the decision, affected routes/components, Figma version or implementation commit, measured evidence, approver, and date. A gate blocks release of the **affected surface**; other independently verified surfaces need not wait for an unrelated proposal.

| ID | Status | Open decision / evidence | Owner | Release condition |
|---|---|---|---|---|
| DS-01 | Open | Full Table subtree, Figma variable modes, and the authoritative cover/changelog version are unverified in the cache | Design | Obtain a complete versioned export or approve an explicitly limited component scope; do not claim full Figma coverage |
| DS-02 | Open | Documented semantic aliases and the current CSS token mappings differ | Frontend + design | Reconcile the mapping table under Colors, then inspect computed styles in both themes for affected components |
| DS-03 | Open | White-on-primary hover, readable placeholder, and success/warning marks have failing contrast pairings | Design + accessibility | Approve contrast-safe variants and verify actual rendered normal/hover/focus/disabled states before releasing affected controls |
| DS-04 | Open | Minimum supported browser width and narrow/zoomed business-route behaviour are not approved | Product + QA | Record route support matrix and verify navigation, forms, tables, and overlays at the approved floor and zoom levels |
| DS-05 | Open | Dark theme is implemented as a project extension, but Figma dark variables and full-state acceptance are unverified | Product + design + QA | Approve dark-mode scope and verify token mapping, contrast, overlays, and first paint before calling it production-supported |

The icon npm/sprite pipeline is a separate **proposal**, not a release gate while this codebase stays on the installed Arco icon set. For any Figma rule not covered by the cache, preserve the existing non-conflicting project rule and mark its authority; do not silently promote an inference into a Figma requirement.

## Colors

The Metritag palette is an 8-step brand ramp plus functional, neutral, text, and border ramps. **Do not substitute Arco's `#165DFF` primary or Arco's semantic ramps.** Map these values into application-semantic CSS variables; never put a raw HEX in page code.

### Theme color 主题色

Brand ramp. `Theme-6 #005BF5` is the primary action and selection color.

| Token | Value | Role (from source) |
|---|---|---|
| `Theme-1` | `#E8F2FF` | 浅色/白底悬浮 — light fill, hover on white |
| `Theme-2` | `#BFD9FF` | 文字禁用 — disabled text |
| `Theme-3` | `#96BDFF` | 一般禁用 — general disabled |
| `Theme-4` | `#6E9EFF` | 特殊场景 — special cases |
| `Theme-5` | `#437AFA` | 悬浮 — hover |
| **`Theme-6`** | **`#005BF5`** | **主题色 — primary** |
| `Theme-7` | `#0C38C7` | 点击 — active/pressed |
| `Theme-8` | `#191C71` | 品牌色 — brand deep |

### Subsidiary color 辅助色

| Token | Value | Role |
|---|---|---|
| `Subsidiary-1` | `#EBFFFD` | 浅色/白底悬浮 |
| `Subsidiary-2` | `#C2FFFB` | 文字禁用 |
| `Subsidiary-3` | `#99FFFC` | 一般禁用 |
| `Subsidiary-4` | `#70FFFF` | 特殊场景 |
| `Subsidiary-5` | `#47F9FF` | 悬浮 |
| **`Subsidiary-6`** | **`#1DE4F3`** | **辅助色 — accent** |
| `Subsidiary-7` | `#0EB9CC` | 点击 |
| `Subsidiary-8` | `#0390A6` | 深色 |

### Functional colors 功能色

Each functional ramp is ordered by the source as regular → hover → active → disabled → special → light background. Note the ramps are **not** monotonic by index: `-6` is the regular value, `-4` is hover, `-7` is active.

| Role | `-1` light bg | `-2` special | `-3` disabled | `-4` hover | `-6` regular | `-7` active |
|---|---|---|---|---|---|---|
| Success 成功 | `#DCF5DE` | `#95E89D` | `#69DB78` | `#42CF5A` | **`#00B42A`** | `#008F26` |
| Warn 警示 | `#FFF4E6` | `#FFD6A3` | `#FFBF7A` | `#FFA552` | **`#FF6B00`** | `#D95300` |
| Error 错误 | `#FFECE8` | `#F6BCB3` | `#EE8D82` | `#E55D53` | **`#D40000`** | `#B20006` |

### Neutral fills 背景填充色

| Token | Value | Role |
|---|---|---|
| `Fill-1` | `#F7F8FA` | 默认页面底色背景 — page canvas |
| `Fill-2` | `#F2F3F5` | 容器背景/表头背景 — container, table header |
| `Fill-3` | `#E7E7E7` | 组件背景 — component background |
| `Fill-4` | `#DCDCDC` | 组件背景悬浮 — component hover |
| `Fill-5` | `#A6A6A6` | 组件背景点击 — component active |
| `Fill-6` | `#000000 @ 50%` | 遮罩层 — overlay mask |
| `Fill-7` | `#FFFFFF` | 白色/卡片背景 — surface, card |

### Text 文字

| Token | Value | Role |
|---|---|---|
| `Text-1` | `#FFFFFF` | 纯白文字 — on dark/brand fills |
| `Text-2` | `#CCCCCC` | 置灰信息 — disabled |
| `Text-3` | `#999999` | 备注/底纹词 — source placeholder/caption role; not contrast-safe for readable text on white |
| `Text-4` | `#666666` | 次要信息 — secondary |
| `Text-5` | `#333333` | 次强调/正文标题 — body, sub-emphasis |
| `Text-6` | `#1A1C20` | 强调/正文标题 — emphasis, titles |

### Border 边框

| Token | Value | Role |
|---|---|---|
| `Border-1` | `#EEEEEE` | 分割线 — divider |
| `Border-2` | `#FFE696` | 单选/多选 — radio/checkbox accent |
| `Border-3` | `#DDDDDD` | 默认边框 — default control border |

### Interaction tints not in the base palette

**[Derived]** The Button and Select components use a finer primary interaction ramp than the eight-step Theme scale. These values are measured source states for controls, even though the Colors page does not list them. Their presence does not certify contrast; the white-on-`#2D7EF7` hover pair remains an accessibility issue below.

| Value | Measured use |
|---|---|
| `#2D7EF7` | Primary emphasize/outline **hover** fill and stroke |
| `#0044CB` | Primary emphasize/outline **active** fill and stroke |
| `#E6F3FF` | Secondary-primary **normal** fill; text-button primary hover fill; selected menu item; Alert info background |
| `#B8DBFD` | Secondary-primary **hover** fill; primary emphasize **disabled** fill; text-button primary active fill |
| `#7AB8FF` | Secondary-primary **active** fill; primary outline/text **disabled** stroke and text |

Where `#E6F3FF` and `Theme-1 #E8F2FF` both appear as a pale primary tint, **components use `#E6F3FF`**. Treat `Theme-1` as the page-level pale primary and `#E6F3FF` as the control-level one; do not swap them.

### Rules [Stated]

- Basic conventional colors comprise theme color, neutral color, text color, mask color, and functional colors.
- Each product has at least one theme color and may define additional auxiliary theme colors.
- The page defines **system-level** color. Product-level color may be adjusted per business need, but adjustment is a recorded decision, not a page-local choice.
- Colors carry brand/VI identity and are used for primary buttons, primary tags, and icons that must express brand character.

### Application semantic layer [Project]

Keep three distinct layers: **Figma primitive** (the measured tables above), **application semantic role** (stable `--app-*` contract), and **Arco adapter** (central mapping to its installed theme variables). The table gives the *light-mode target* and the observed implementation as of this document revision; an alias existing in CSS is not evidence that it resolves to the Figma value. Current source: `src/design/tokens.css` and `src/styles/global.css`.

| Semantic role | Light-mode Figma target | Current project mapping | Status |
|---|---|---|---|
| `--app-page` | `Fill-1 #F7F8FA` | `--mt-fill-1` in `global.css` | Bound: light resolves to `#F7F8FA` and is painted by `body` + `.product-shell`; dark resolves through Arco `--color-bg-1` (`rgb(23, 23, 26)`), not the `--mt-d-bg-1 #17181C` table value |
| `--app-surface` | `Fill-7 #FFFFFF` | `--color-bg-2` in `global.css` | Verify resolved value and use on page/card surfaces |
| `--app-accent` | `Theme-6 #005BF5` | `rgb(var(--primary-6))`; no project `--primary-6` assignment in `src/` | **Open DS-02:** Arco fallback may differ from Figma |
| `--app-text-primary` | `Text-6 #1A1C20` | `--color-text-1` in `tokens.css` | Verify resolved value and contrast |
| `--app-divider` | `Border-1 #EEEEEE` | `--color-border-2` in `global.css` and `tokens.css` | Verify resolved value; distinguish divider from control border |
| `--app-control-border` | `Border-3 #DDDDDD` | `#DDDDDD` in `tokens.css` | Light value aligned; verify dark and focus states |

`--app-page-bg` appears in earlier examples but is **not** a defined project alias; use the actual `--app-page` name when updating the implementation contract. The palette tables are authoritative Figma evidence; this mapping table is an implementation gap register, not permission to swap a Metritag value for an Arco default. Resolve DS-02 by defining one central adapter, checking the computed value for every role in light/dark, then updating this table and the code together. Do not duplicate raw HEX values in individual pages. Status meaning must never depend on color alone.

## Dark theme [Project-Dark]

**Status.** Not verified as a Figma dark specification in this cache. This is an implemented project-authored mapping of the Metritag light palette onto a dark surface model, subordinate to any authenticated dark mapping from design. The numerical pairings below are checks of selected tokens, not a complete WCAG 2.2 AA audit of rendered controls and states. Product and design ownership of the dark-mode release remains to be confirmed.

**Method.** Surfaces invert into a four-step elevation ladder (darker = lower). The brand and functional hues are **lifted in lightness**, not merely reused: `#005BF5` on a dark surface measures 2.93:1 and fails, so dark mode uses a lifted `#4D8DF8` at 4.97:1. The text ramp is rebuilt rather than inverted, because a straight inversion of `#CCCCCC`/`#999999` reproduces the same failures in the opposite direction.

### Surfaces

Light mode layers by *lightness descending* (`#FFFFFF` card on `#F7F8FA` page). Dark mode layers by *lightness ascending* — the raised surface is lighter. Do not carry the light-mode ordering across.

| Dark token | Value | Light counterpart | Role |
|---|---|---|---|
| `--mt-d-bg-1` | `#17181C` | `Fill-1 #F7F8FA` | Page canvas |
| `--mt-d-bg-2` | `#1F2126` | `Fill-7 #FFFFFF` | Card / business surface |
| `--mt-d-bg-3` | `#26282E` | `Fill-2 #F2F3F5` | Container, table header, input fill |
| `--mt-d-bg-4` | `#2E3138` | `Fill-3 #E7E7E7` | Component background, hover |
| `--mt-d-bg-5` | `#3C4049` | `Fill-4 #DCDCDC` | Component active |
| `--mt-d-bg-popup` | `#26282E` | `Fill-7 #FFFFFF` | Dropdowns, dialogs, drawers, tooltips |
| `--mt-d-mask` | `rgba(0,0,0,.65)` | `Fill-6 #000000 @50%` | Overlay mask — raised from 50% because a 50% mask over a dark page no longer separates the layer |

### Text

| Dark token | Value | Light counterpart | On `bg-2` | On `bg-1` |
|---|---|---|---|---|
| `--mt-d-text-6` | `#F2F3F5` | `Text-6 #1A1C20` | 14.51:1 | 15.98:1 |
| `--mt-d-text-5` | `#D4D6DB` | `Text-5 #333333` | 11.08:1 | 12.20:1 |
| `--mt-d-text-4` | `#9CA0A8` | `Text-4 #666666` | 6.14:1 | 6.76:1 |
| `--mt-d-text-3` | `#878B94` | `Text-3 #999999` | **4.72:1** | 5.20:1 |
| `--mt-d-text-2` | `#5A5E68` | `Text-2 #CCCCCC` | 2.42:1 — disabled only | — |
| `--mt-d-text-1` | `#0A0C10` | `Text-1 #FFFFFF` | — | Label on a lifted brand fill |

`--mt-d-text-3` is deliberately lighter than a literal inversion so that **placeholder text passes AA in dark mode** — a case that fails in light mode. `--mt-d-text-2` remains below AA by design, matching light mode: it is for disabled text only, and disabled state must never be signalled by color alone.

Note `--mt-d-text-1` is near-black, not white: on a lifted brand fill such as `#4D8DF8`, dark text (6.04:1) outperforms white (2.9:1).

### Brand and functional

| Dark token | Value | Light counterpart | On `bg-2` |
|---|---|---|---|
| `--mt-d-primary` | `#4D8DF8` | `Theme-6 #005BF5` | 4.97:1 |
| `--mt-d-primary-hover` | `#6FA5FF` | `#2D7EF7` | 6.52:1 |
| `--mt-d-primary-active` | `#2E6FD9` | `#0044CB` | — fill only |
| `--mt-d-primary-pale` | `#1C2B45` | `#E6F3FF` | Selected row, pale fill |
| `--mt-d-primary-pale-hover` | `#223656` | `#B8DBFD` | — |
| `--mt-d-success` | `#3FD15F` | `#00B42A` | 8.05:1 |
| `--mt-d-success-bg` | `#15291A` | `#DCF5DE` | — |
| `--mt-d-warn` | `#FF9A4D` | `#FF6B00` | 7.66:1 |
| `--mt-d-warn-bg` | `#2E2015` | `#FFF4E6` | — |
| `--mt-d-error` | `#FF6A5E` | `#D40000` | 5.73:1 |
| `--mt-d-error-bg` | `#2E1A18` | `#FFECE8` | — |
| `--mt-d-accent` | `#1DE4F3` | `Subsidiary-6 #1DE4F3` | Unchanged — already passes at 10.4:1 |

The pale semantic backgrounds are **not** the light values darkened by opacity. They are hue-matched near-neutrals; an alpha-blended light tint turns muddy over a dark surface.

### Borders

Dark mode needs a **two-tier** border system, because one value cannot serve both roles at AA.

| Dark token | Value | Light counterpart | Role | Contrast vs `bg-2` |
|---|---|---|---|---|
| `--mt-d-border-1` | `#2E3138` | `Border-1 #EEEEEE` | Divider — decorative, exempt from 3:1 | 1.24:1 |
| `--mt-d-border-3` | `#6E7684` | `Border-3 #DDDDDD` | **Control border** — input, select, outline button | **3.52:1 PASS** |
| `--mt-d-border-2` | `#C9A227` | `Border-2 #FFE696` | Radio/checkbox accent | 5.0:1 |

A control border must reach 3:1 as a meaningful non-text boundary; a divider between rows need not. Using `--mt-d-border-1` on an input would fail the audit.

### Implementation status

The dark tables above are the **project mapping target**, not an exact copy of the current CSS. `src/design/theme.ts` toggles `body[arco-theme='dark']`; `src/design/tokens.css` currently defines only a subset of the dark roles, with several aliases still resolved through Arco. Reconcile them through the same semantic layer as light mode (DS-02), then verify all visible states (DS-05). Page components should not each maintain a second dark palette.

The current application offers light and dark, not a system-following choice. Such a choice would need product approval plus an initial-mode, persistence, and OS-change policy. Test first paint rather than assuming a later theme toggle prevents a flash.

### What dark mode does not change

Geometry is theme-independent: control heights (40/32/24), radii (2/4/8), the default 4px sizing rhythm (with the 205px sidebar as the one explicit shell-size exception), and fixed overlay widths do not change with theme. Both updated page layouts retain a 56px header and 16px content margin; the top-side-content shell retains a 205px sidebar and 16px gap between modules. The separate Figma navigation component's 240px/64px variants are not page-shell widths.

### Verification required before shipping dark mode

Shadows are near-invisible on dark surfaces — the three elevation levels must be re-verified and will likely need a border or a lighter raised surface to carry separation instead. Also check: chart series legibility, upload previews and user images against the dark canvas, icon stroke weight, focus-ring visibility, third-party widgets, and first-paint flash.

**Dark mode is not released until every state in the interaction-states table has been inspected in dark.** A light-mode pass is not evidence.

## Typography

**Family:** `PingFang SC` throughout the source. [Stated] Prefer each platform's official system font; this specification governs the Chinese desktop web product.

```css
:root {
  --mt-font-sans: 'PingFang SC', -apple-system, BlinkMacSystemFont,
    'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
}
```

### Type scale

Thirteen size/weight/line-height combinations across eight sizes. Weight `600` is `PingFangSC-Semibold`; `400` is `PingFangSC-Regular`. There is no 500-weight step in the scale.

| Size | Weight | Line-height | Name (source) | Use |
|---|---|---|---|---|
| 48px | 600 | 56px | 运营标题-中 | Marketing/large display headline |
| 36px | 600 | 44px | 运营标题-小 | Marketing/small display headline |
| 24px | 600 | 32px | 标题-大 | Detail-page or standalone page title, emphasized |
| 24px | 400 | 32px | 标题-大 | Detail-page or standalone page title, regular |
| 20px | 600 | 28px | 标题-中/模块标题 | Overview heading that leads a scroll region — **not** a card, dialog, drawer, or section title |
| 20px | 400 | 28px | 标题-中/模块标题 | Overview heading, regular — same restriction |
| **16px** | **600** | **24px** | 标题-小 | **Card, dialog, drawer, and section titles** |
| 16px | 400 | 24px | 标题-小 | Emphasised body, large control and Tag text |
| **14px** | **600** | **22px** | 正文-常规-加粗 | **Body emphasized — table headers, field labels** |
| **14px** | **400** | **22px** | 正文-常规 | **Body default — the primary UI size** |
| 12px | 600 | 20px | 辅助文案/标签文字 | Caption/tag emphasized |
| 12px | 400 | 20px | 辅助文案/标签文字 | Caption/tag, metadata, timestamps |

14px/400/22 is the default control and table text. 14px/600/22 is the table header and emphasized label. The 36px and 48px steps are operational/marketing sizes and do not belong on a dense business route.

**[Derived]** Line-heights are fixed per step, not a ratio: 12→20, 14→22, 16→24, 18→26, 20→28, 24→32, 36→44, 48→56. Use the paired value; do not compute `1.5×` and round.

**[Project]** Use tabular numerals for aligned numeric columns where the font supports them. Align monetary amounts right with declared currency and precision; keep IDs copyable. Test long Chinese, English, numeric, and mixed strings and 200% text enlargement. Do not scale core type with viewport units.

### Title roles and vertical rhythm [Project]

Two title roles are in scope on a business route. Size carries grouping; weight `600` plus `Text-1` colour carries emphasis. Never rely on colour alone, and never add a fourth size that differs from its neighbour by less than 4px. Business pages render **no page title and no subtitle** in the content area (see the 2026-10-24 decision note at the top of this document); page identity is carried by the shell navigation.

| Role | Spec | Where | Count per page |
|---|---|---|---|
| Card / dialog / drawer / section title | **16px/600/24** | Panel headers, `a-card` title, dialog and drawer headers, section dividers | One per panel or section |
| Group label inside a panel | 14px/600/22 | Form groups, table headers, field labels | As needed |

**Why 16px for panel titles.** 16px/600 is the Arco card, dialog, and drawer title default, and this specification already assigned 16px/600 to Drawer and Popconfirm titles. Promoting it to a single panel-title role removes the earlier split where one visual role was 20px in a card and 16px in a drawer, and it removes the need for a per-component font override. Card and dialog titles at 20px also read as marketing headings rather than panel labels once body copy is 14px.

**Separation at 16px.** A 16px/600 title over 14px/400 body separates by 2px of size and one weight step. That is enough only when the title also differs in colour (`Text-1` against `Text-2`/`Text-3`) and when the title-to-content gap is consistent. Do not restore 20px to fix a weak title — if a panel title still reads as body copy, the cause is spacing or colour, not scale.

**Title block.** Treat a title as a block: its line box plus 8px above and below. A 16px panel title therefore occupies 40px (24 + 8 + 8). Keep 12px between a title block and the content it governs, and do not stack an additional 16px or 20px margin on top of the block.

**20px.** 20px/600/28 survives only for an overview heading that leads a whole scroll region. It is not a card, dialog, drawer, or section title. The Empty component's 20px/400/28 caption remains its own sanctioned use. 24px and above belong to detail-page and standalone page heroes; do not introduce them inside a panel.

**Components with measured header gaps.** A measured header gap is not a typography value, and a title must never be enlarged to fill one that is too big for it. The Dialog is the worked case: its 40px header-to-body gap was measured against a 20px title, so the title block rule required it to be re-derived to 24px — see Dialog 对话框. Apply the same review to any other measured header gap: keep the gap only if it still reads as attached at 16px, otherwise re-derive it from the title block and record the change.

### User-facing language [Project]

Titles, labels, table headings, buttons, status, help, and empty/error copy are concise Simplified Chinese. Reject decorative English eyebrow labels, side-by-side bilingual headings, and acronym-only metric names (`DAU` → `日活跃用户`, `GMV` → `成交金额`). Technical values, IDs, event names, API keys, file types, and versions keep their original spelling. English documentation does not change UI copy. The product supports `zh-CN` and `en-US`: every business page, route, overlay, table, filter/column setting, feedback message, tooltip, and accessible name must use matching Vue I18n keys in both locales; do not hardcode user-facing Chinese or English in templates, and do not use display strings as domain keys. Switching locale must update the page and any open overlay without a reload, including Arco component text. Before delivery, verify switching in both directions, direct load/refresh with the saved locale, long English labels, keyboard/accessible text, and missing-key/fallback warnings. Other locales require a decision, domain-keyed translations, a synchronized Arco locale, long-label tests, and localized export headers.

## Product copy [Project]

### Data provenance and copy

**Production surfaces speak as real product.** Do not add decorative “demo / prototype / sample” labels to a real workflow. Equally, do not present a mock result, mock login, or unavailable backend capability as a confirmed live service. These are separate requirements: concise product copy never overrides truthful data provenance.

**Development and review environments:** typed module-scoped mocks may drive credible lists without marking every row as a sample. The environment or affected workflow must nevertheless be identifiable as non-production wherever a reviewer could mistake the results for live data or act on them as such. A delivery note alone is insufficient for an independently accessible preview. State actual integration gaps precisely, and never announce a mock write as a server-confirmed success.

**Production gate:** do not release a mock-backed business workflow as live. If a backend is unavailable, expose the actual unavailable state and recovery path instead of fabricated records or a success toast. Product decides the exact environment-level disclosure copy; it need not become a banner on every screen.

Never prefill real credentials or print a password on a sign-in page. If local demo credentials are explicitly required for a controlled test, identify them as local mock behavior, keep them out of production, and follow `AGENTS.md`'s masking and secret-handling rules.

## Spacing & Layout

### Canvas and breakpoints [Source reference + approved layout update]

- The cached Figma Layout page recommends a **1440px** artboard and lists **1280px** as its minimum design size and **1920px** as its maximum reference size. These are design references, not a supported-browser-width contract.
- The two page shells below follow the **2026-10-22 Figure 1 / Figure 2 update**: their content regions are fluid, with 16px outer margins. The older fixed 1200px content column and frozen width above 1920px do **not** apply to these updated patterns. A future maximum content width requires a separate, explicit decision.

### Size increment [Stated]

**Use 4 as the default minimum increment** for element size, padding, and margin. Padding progresses in 4px steps. The **56px header** follows that rhythm and needs no exception. The user-specified **205px sidebar** is the single explicit shell-size exception; do not round it to 204px or 208px.

**[Project] Header height revision.** The source measured the page-shell header at 55px, but the Figma navigation component's own brand row is 56px and the implemented shell renders 56px. Adopting **56px** makes the shell and the navigation component agree and keeps the height on the 4px rhythm, so no one-pixel exception is needed. Previous 55px references, including the Figure 1 / Figure 2 descriptions, are superseded; do not reintroduce 55px.

This replaces Arco's own rhythm as the governing rule. The updated 16px outer margins, the 16px module gap, and the 16px panel inset are all multiples of 4 and now share one value; they remain **distinct rules** with distinct scopes. The source's 20px module-card-to-inner-content distance is superseded by the 16px panel inset — do not treat the three 16px rules as interchangeable, and do not reinstate 20px inside a panel.

### Spacing by scope [Source + approved layout update]

| Value | Meaning |
|---|---|
| **16px** | The outer content margin on all four sides in both updated page layouts (Figures 1 and 2) |
| **16px** | Gap between adjacent content modules in the top-side-content layout (Figure 2) |
| **16px** | Panel content inset — the distance from a card's or panel's edge to its content. Revised from the source's 20px together with the 16px panel-title role |
| **12px** | Distance from a title block to the content it governs, inside a panel (see Typography · Title roles and vertical rhythm) |
| 4px | The increment all other padding follows |

### Two page layout patterns [User-approved update, Figures 1 and 2]

**1 — Top-content (顶部-内容区布局, Figure 1).** The full-width **56px** header holds logo, first-level navigation, and auxiliary actions (user, settings, notifications), in that order from left to right. Below it, the content region fills the remaining available width and height. Its **outer margin is 16px on all four sides** (including the space below the header); the content div stretches within that margin. Do not apply the older 1200px fixed width, 64px header, or mandatory footer to this pattern. Any footer is a separate, explicit page requirement.

**Header inset.** The header's horizontal padding equals the content outer margin (**16px**), so the brand mark and the content region below it share one left edge, and the trailing actions share one right edge. The header itself spans the full viewport width; only its contents are inset. In Pattern 2 the header also spans full width, but its leading content aligns to the sidebar's own item inset rather than to the content margin — do not apply 16px there merely because the rule exists for Pattern 1.

Figure 1 does not specify the gap between multiple modules inside this content region; do not reuse the old Figma 20px module gap as an automatic rule. Define that gap with the page's design or module PRD when multiple modules are present.

**2 — Top-side-content (顶部-侧边-内容区布局, Figure 2).** The full-width **56px** header sits above the sidebar and content. Below it, the sidebar begins flush at the left edge (**margin 0px**), measures **205px wide**, and adapts its height to the available area. The content region occupies the remaining width and available height, with **16px outer margin on all four sides** between its boundary and the sidebar/header/viewport. Adjacent modules **inside the content region** have a **16px gap**. This is the baseline pattern for most back-office pages; the older 240px Figma navigation-component width does not override the 205px page-shell width.

```text
Pattern 1 — top-content (Figure 1)
  Header 56px       [logo | L1 nav items | auxiliary menu]
  Content area      [16px margin | fluid content | 16px margin]

Pattern 2 — top-side-content (Figure 2)
  Header 56px       [logo | L1 nav items | auxiliary menu]
  Sider 205px       [flush left and bottom, margin 0, height below header]  ⇄ 64px collapsed rail
  Content area      [16px margin | fluid content; module gap 16px | 16px margin]
```

**Content region canvas [Project, 2026-10-24].** The system framework paints **one page background across the whole viewport**: `Fill-1 #F7F8FA` (`--app-page`; in dark mode the token remaps through Arco `--color-bg-1`), **including the 16px gutters around the content region** — no white frame remains between the shell and the content. The content region is built as an independent div **on top of this canvas**: the shell owns the 16px canvas gutters — top 16px above the content, right edge 16px, bottom 16px, and 16px between the sidebar and the content provided by the `.product-body` flex gap — and each page's root node is itself a **white business panel** (`--app-surface`, corners-1 2px radius, 16px content inset) that fills the content region (天枢 models-content 同构).

- The 56px header and the 205/64px sidebar keep the white surface (`--app-surface`) as chrome over the page canvas; the sidebar sits flush left at full height below the header and is separated from the content by the 16px canvas gap, not by a border.
- Gutter geometry belongs to the shell and the panel is white: a page root must not re-add its own 16px margin or paint itself `Fill-1`; on this shell a `Fill-1`-filled or margin-carrying page root is a leftover of the retired white-frame architecture, not a variant.
- Verification anchor: the computed `background-color` of `body` and `.product-shell` resolves to `#F7F8FA` in light mode; the page root (`.surveys-page`, `.ledger-page`), the header, and the sidebar resolve to `#FFFFFF`. In dark mode `--app-page` resolves to Arco `--color-bg-1` (`rgb(23, 23, 26)`), which differs from the `--mt-d-bg-1 #17181C` table value above — reconcile that mapping at the next dark-token audit.

**Sidebar footprint [Project, 2026-10-23].** Two geometric rules that every Pattern 2 sidebar must satisfy, in both the expanded and the collapsed state:

- **The bottom edge is flush with the page bottom.** The sidebar ends exactly at the viewport bottom — no page-wrapper `padding-bottom`, no strip of page canvas under it, no rounding at the bottom corners. The 16px breathing room at the bottom of a screen belongs to the content region (its own bottom margin), never to the wrapper that holds the sidebar; otherwise the sidebar is pushed up and the two bottom edges stop matching.
- **The height is fixed, not content-driven.** The sidebar is `position: sticky` with `height: calc(100dvh - 56px)` and `top: 56px`, so a long page scrolls inside the content region while the sidebar stays pinned. It must never be `align-self: stretch` inside a `min-height` page: that makes it grow with the document, scroll away with it, and re-open the bottom gap. Menu entries that overflow the available height scroll inside the sidebar, above the 44px toggle.

**Sidebar collapse [Project, 2026-10-23].** Navigation sidebars in Pattern 2 (system settings, model projects) can be collapsed to an icon-only rail. This section records the decision the earlier shell specification left open: it fixed the 205px expanded width but named no collapsed width or breakpoint.

| Property | Expanded | Collapsed |
|---|---|---|
| Width | **205px** (the Pattern 2 shell value) | **64px** — reuses the Figma navigation component's 64px icon-only variant, now adopted as the shell rail width |
| Height | fills the area below the 56px header (`calc(100dvh - 56px)`), sticky at `top: 56px`; the menu list scrolls inside it | same |
| Item composition | 16px icon + label, 10px icon-to-label gap, **40px** row (5px/16px padding), 14px/22px text, **20px** left inset in every shell | icon centred at 18px, label removed |
| Group trigger | label + caret, children listed underneath | icon only; activating it expands the sidebar and opens that group instead of toggling an invisible list |
| Active state | primary text on the `theme-1` fill | icon keeps the same colour and fill; the active icon is the only position cue, so nothing else may rely on the label |
| Toggle | 44px footer row with the `menu-fold` icon and 收起侧栏, above a hairline divider | `menu-unfold` icon and 展开侧栏 |
| Motion | width transition 200ms ease, disabled under `prefers-reduced-motion` | — |

- The toggle is a real button, not a decorative chevron: `aria-expanded` reflects the sidebar state, its accessible name switches between 收起侧栏 and 展开侧栏, and focus stays on the button after toggling.
- Collapsed items keep their accessible name through `aria-label` plus a `title` tooltip, because the visible label is removed; an icon alone is never the only name of a menu entry.
- The state is remembered per shell in `localStorage` (`tianshu-sidebar-collapsed:<shell>`), so refresh, back/forward, and a direct link into a child route keep the user's choice. When storage is unavailable the fallback is session-only, never a broken layout.
- Content margins stay 16px in both states: collapsing widens the content region, it does not change content padding or the 16px gap between sidebar and content.
- The sidebar stops being sticky and hides its toggle below **901px** in every shell. The page stacks the sidebar above its content at its own narrow breakpoint — **901px** in system settings, **761px** in model projects, whose card grid needs the full width sooner — and from there the sidebar is a full-width block. A 64px rail cannot carry a six-item menu plus submenus on a narrow viewport.
- Only navigation sidebars collapse. Content panels that happen to sit on the left — the task-detail flow column, the overview notification/app column — are not sidebars and keep their own layout.

**One sidebar for every shell [Project, 2026-10-23].** Every Pattern 2 sidebar is the same component (`src/shared/components/AppSidebar.vue`). Geometry, row metrics, hover/active/focus states, the group accordion and the collapse toggle live there; a page only supplies its menu data — label, icon, target, active flag, children. System settings and model projects pass different menus and nothing else, which is how the two shells stay identical, and a new page with a left menu reuses the component instead of restyling a sidebar of its own.

A first-level entry comes in three shapes:

| Shape | Has | Behaviour |
|---|---|---|
| Link | a route | navigates; `aria-current="page"` and the active fill when the route matches |
| Group | children | expands/collapses only (see below); never navigates |
| Action | neither | renders as a `<button>`, triggers a command or a "not yet available" message (for example 问题管理 in model projects). It must never look like a link or steal the active state |

**Sidebar groups — one expanded at a time [Project, 2026-10-23].** A Pattern 2 sidebar contains two kinds of first-level entry: **leaves** (they navigate) and **groups** (they hold one flat level of children). The sidebar behaves as an **accordion**: at most one group is expanded at any moment. Expanding a group collapses whichever group was open before it, so a user who opens a page under one group and then clicks a second group never ends up with two open submenus pushing the menu — and the toggle at the bottom — out of place.

| Situation | Result |
|---|---|
| Initial load, or a direct link into a child route | Only the group containing the active page is expanded; every other group starts collapsed |
| Initial load on a leaf entry (no group involved) | No group is expanded — zero open groups is a valid state, not an empty sidebar |
| Activating another group | That group expands and the previously expanded one collapses in the same interaction |
| Activating the group that is already expanded | It collapses; the accordion may hold zero open groups |
| Navigating into a child of a collapsed group (breadcrumb, in-page link, browser back/forward) | That group expands and the previous one collapses — the active page is always visible in the sidebar |
| Sidebar collapsed to the 64px rail | Activating a group expands the sidebar and opens that group; the rail never holds a hidden submenu state |
| Sub-items | One flat level directly under the group. Do not nest a third level in a sidebar; if a domain needs three levels, split it into separate first-level pages |

- The group trigger shows its state with the caret (`down` icon, rotated 180° when open) and `aria-expanded`; do not animate list height — the sublist appears at once, because a height transition under a scrolling menu reads as lag.
- Group expansion is **view state, not stored preference**: unlike the collapsed width it is not persisted, it is re-derived from the current route on every entry. A refresh therefore always lands with the active page's group open, and a stale localStorage value can never hide the page the user is on.
- Only groups participate. A leaf entry neither opens nor closes a group, and activating it must not change another group's state.
- A group trigger only expands or collapses — it never navigates, and neither does collapsing it. When the area has an obvious landing page, list it as the group's first child rather than making the group label jump.


### Border radius [Stated]

Three levels, chosen by the designer per scenario.

| Token | Value | Scope |
|---|---|---|
| `corners-1` | **2px** | Controls — buttons, inputs, selects, tags, table cells |
| `corners-2` | **4px** | Containers — dialogs, alerts, messages, popconfirm |
| `corners-3` | **8px** | Large panels and illustrative/explanatory blocks |

There is no 6px, 10px, or 12px step in the specification. Circular elements (switch track, avatar) use a full radius.

## Elevation

The Figma source defines three shadow levels [Stated], each a three-layer composite. Keep those values unchanged. **Level 4 is a project-approved addition dated 2026-10-26**, scoped to persistent top navigation; it is not a Figma token or a replacement for the three floating/drag layers.

**一级投影 (Level 1)** — warning and popup components, e.g. global message / notification:
```css
box-shadow: 0 1px 2px -2px rgba(0,0,0,.16), 0 3px 6px 0 rgba(0,0,0,.12), 0 5px 12px 4px rgba(0,0,0,.08);
```

**二级投影 (Level 2)** — dropdown components, e.g. dropdown menu / popconfirm / picker:
```css
box-shadow: 0 3px 6px -4px rgba(0,0,0,.12), 0 6px 16px 0 rgba(0,0,0,.04), 0 9px 28px 8px rgba(0,0,0,.05);
```

**三级投影 (Level 3)** — component hover states, e.g. table and tree drag:
```css
box-shadow: 0 6px 16px -8px rgba(0,0,0,.08), 0 9px 28px 0 rgba(0,0,0,.04), 0 12px 48px 16px rgba(0,0,0,.02);
```

**四级投影 (Level 4) [Project]** — a lighter, low-spread separation under a persistent top navigation bar, replacing its bottom border:
```css
box-shadow: 0 2px 6px rgba(0,0,0,.06);
```
Use `--app-shadow-4` in the shared header for both light and dark themes. Do not use this level for menus, notices, dialogs, or dragged elements. Its single soft layer is intentionally shallower than the three source composites; verify the rendered separation on each theme without adding a bottom stroke.

**[Derived]** Measured assignments: Message uses Level 3's composite; Tooltip uses Level 2; Dialog at 560px uses Level 3. Prefer spacing and surface contrast over shadow; use Levels 1–3 for their specified floating/drag contexts and Level 4 only for the persistent header. Centralize z-index and overlay containment.

## Surfaces

| Surface | Fill | Notes |
|---|---|---|
| Page canvas | `#F7F8FA` (`Fill-1`) | **Whole-page background** — `body` and `.product-shell`, including the 16px gutter around the content region (Content region canvas, 2026-10-24) |
| Card / business surface | `#FFFFFF` (`Fill-7`) | Framed content, panels |
| Container / table header | `#F2F3F5` (`Fill-2`) | Grouping and table head |
| Component background | `#E7E7E7` → hover `#DCDCDC` → active `#A6A6A6` | `Fill-3/4/5` |
| Overlay mask | `#000000 @ 50%` | `Fill-6` |
| Explanatory block | `#F2F3F5`, radius 8px | **[Derived]** the source's own 整体说明 blocks |

Not every route needs a white card. Separate content with space first; add a container only when the content is genuinely a framed tool, a repeated record, or an independently loading region. Do not nest cards inside cards.

## Icons

**[Stated]** A linear icon set for business scenarios, designed to universal standards, matching the Metritag brand: **linear, rounded**.

**Grid.** Draw on a unified **24×24px** grid. Inside the grid, align to pixel points wherever possible to preserve clarity.

**Keyline shapes** inside the 24px grid:

| Shape | Size |
|---|---|
| Square 正方形 | 18×18 |
| Horizontal rectangle 水平矩形 | 22×18 |
| Vertical rectangle 垂直矩形 | 18×22 |
| Circle 圆形 | 20×20 |

**Design principles [Stated]**
- **简单 Simple** — simplify parameters when drawing; eliminate decimal points and non-integer angles. Avoid unnecessary decoration on output.
- **精确 Precise** — avoid ambiguous figures; when one concept has several common depictions, pick the most widely circulated one and strengthen it where needed. Follow naming conventions on output so others can find the icon.
- **节奏 Rhythm** — maintain line rhythm even in necessarily dense icons so they feel comfortable rather than oppressive. A series of icons follows a principle of moderation: keep variation within a bounded range.

**Pixel alignment [Stated].** Non-integer pixels render as grey and damage clarity and meaning — align to the pixel grid. When handling symmetrical figures, centre them; do not break visual balance merely to meet the grid.

**Angles [Stated].** Where a line must slant, keep it parallel to the grid's 45° guide, or use multiples of 15° (the page illustrates 30°, 45°, 60°, 120°). This preserves line clarity at low resolution.

**Categories.** 方向指示类图标 (directional), 通用型图标 (general), 编辑类图标 (editing), plus a 面性图标-fill (filled) set alongside the linear default.

### Rendered sizes [Project]

The 24×24 grid governs the artwork; the rendered size is chosen by context:

| Context | Rendered size | Colour |
|---|---|---|
| Inline auxiliary icon in a title or field-label row (for example the metric card's `IconInfoCircle`) | **16px** | `Text-3`, never a semantic colour — help affordance is carried by the tooltip, not by the icon's colour |
| Icon inside a control (button, input affix, menu item) | Matches the control's text size, minimum 14px | Inherits the control's colour |
| Standalone illustrative icon (app tile, empty state) | 36px and up, per the component | Own palette |

An inline auxiliary icon never carries status meaning on its own; if the icon signals a state, pair it with text or a Tag. A 16px render of the 24px grid artwork keeps 2:3 proportions and stays crisp because the grid's keylines land on whole pixels at that size.


### Icon library inventory
**Library name [Stated]: IRS图标库.** The source directs that teams reference this library across different scenarios and projects to build a consistent user experience — it is the named, shared asset, not a per-project icon folder.

**[Derived]** The file ships **282 uniquely named icon components**, all drawn at **24×24px**, organized in three namespaces. Icon names are the contract — reference an icon by its full path (`general/search`), not by appearance. 39 icons have a paired `-fill` solid variant; the default is linear.
| Namespace | Count | Scope |
|---|---|---|
| `direction/` | 49 | Arrows, carets, expand/collapse, pagination jumps, rotate, swap |
| `edit/` | 27 | Text formatting, alignment, lists, sort, clipboard, color |
| `general/` | 206 | Business, status, media, file, system, and domain icons |

Complete name list, for reference when mapping a UI action to an icon:

<details>
<summary>IRS icon names in the cached Figma inventory (reference only)</summary>

This snapshot is not an import contract. Check the current Figma component name before using an icon; the naming defects below are not valid package API names.

**`direction/`** — `add-square`, `add-square-fill`, `arrow- rise`, `arrow-down`, `arrow-fall`, `arrow-left`, `arrow-right`, `arrow-up`, `caret- right`, `caret-down`, `caret-left`, `caret-up`, `check-square`, `check-square-fill`, `close-square`, `close-square-fill`, `down`, `down-circle`, `down-square`, `down-square-fill`, `down.double`, `expand`, `left`, `left-circle`, `left-square`, `left-square-fill`, `left.double`, `minus-square`, `minus-square-fill`, `page-first`, `page-last`, `right`, `right-circle`, `right-square`, `right-square-fill`, `right.double`, `rotate-left`, `rotate-right`, `shrink`, `swap`, `to-bottom`, `to-left`, `to-right`, `to-top`, `up`, `up-circle`, `up-square`, `up-square-fill`, `up.double`

**`edit/`** — `align-center`, `align-left`, `align-right`, `bg-colors`, `bold`, `brush`, `edit`, `eraser`, `find-replace`, `font-colors`, `formula`, `h`, `highlight`, `italic`, `language`, `line-height`, `ordered-list`, `original-size`, `paste`, `scissor`, `sort`, `sort-ascending`, `sort-descending`, `strikethrough`, `text`, `underline`, `unordered-list`

**`general/`** — `Launch`, `adjust`, `archive`, `at`, `back`, `bar chart`, `batch add`, `batch export`, `book`, `browser`, `bug`, `building`, `building-fill`, `business`, `business-fill`, `calendar`, `calendar-fill`, `camera`, `certificate`, `chart`, `chart-fill`, `check`, `check-circle`, `check-circle-fill`, `checkin`, `clock-circle`, `clock-circle-fill`, `close`, `close-circle`, `close-circle-fill`, `cloud`, `cloud-download`, `cloud-upload`, `code`, `code-block`, `code-square`, `command`, `common`, `compass`, `copy`, `copyright`, `customer`, `customer-fill`, `customer-service`, `dashboard`, `data`, `data-2`, `delete`, `demand docking`, `demo`, `desktop`, `double line chart`, `download`, `draft`, `drag-arrow`, `drag-dot`, `drag-dot-vertical`, `drive-file`, `early-warning`, `edit-fill`, `email`, `empty`, `exclamation`, `exclamation-circle`, `exclamation-circle-fill`, `export`, `eye`, `eye-fill`, `eye-invisible`, `eye-invisible-fill`, `face-frown`, `face-frown-fill`, `face-meh`, `face-meh-fill`, `face-smile`, `face-smile-fill`, `file`, `file-add`, `file-audio`, `file-image`, `file-pdf`, `file-video`, `filter-o`, `flow`, `folder`, `folder-add`, `folder-delete`, `gift`, `heart`, `heart-fill`, `history`, `home`, `hotline`, `idcard`, `idea`, `image`, `image-close`, `import`, `info`, `info-circle`, `info-circle-fill`, `journal`, `knowledge`, `layering`, `line chart`, `link`, `list`, `loading`, `loading-black`, `loading-blue`, `loading-white`, `location`, `lock`, `man`, `menu`, `menu-fold`, `menu-unfold`, `message`, `message-banned`, `message-fill`, `mind-mapping`, `minus`, `minus-circle`, `minus-circle-fill`, `more`, `more-circle`, `more-circle-fill`, `more-vertical`, `nav`, `nav-grid`, `notification`, `notification-close`, `notification-fill`, `objection`, `old-version`, `plus`, `plus-circle`, `plus-circle-fill`, `portrait`, `poweroff`, `process`, `pushpin`, `pushpin-fill`, `qrcode`, `question`, `question-circle`, `question-circle-fill`, `read all`, `redo`, `refresh`, `revise`, `robot`, `robot-add`, `safe`, `save`, `scan`, `schedule`, `search`, `select-all`, `send`, `settings`, `settings-fill`, `share-alt`, `share-external`, `share-internal`, `shopping`, `show`, `stacked graph`, `star`, `star-fill`, `stop`, `storage`, `subscribe`, `subscribe-add`, `subscribed`, `sync`, `table`, `table-add`, `text`, `thumb-down`, `thumb-down-fill`, `thumb-up`, `thumb-up-fill`, `tools`, `trophy`, `undo`, `undo-circle`, `unlink`, `unlock`, `upload`, `user`, `user-add`, `user-external`, `user-fill`, `user-gronp`, `user-management`, `user-management-fill`, `user-purview`, `video-camera`, `voice`, `wallet`, `warning`, `warning-fill`, `woman`, `zoom-in`, `zoom-out`

Once the IRS library has an approved distribution path and a route is migrated, use its icons consistently within that route. Until then, this codebase stays on Arco icons; do not copy individual Figma SVGs into a mixed family. Request missing IRS equivalents from design before migration.

</details>

### Icon library delivery — one source, three channels [Project proposal]

**[Project proposal, not a Figma delivery requirement.]** The Figma source contains 282 IRS icons on a 24×24 grid. If product/design approve a distribution pipeline, the following three channels could share that source. Neither an npm package nor a sprite is present merely because this proposal is documented.

| Channel | Audience | Form |
|---|---|---|
| **Figma library** | Designers | Source components on the 24×24 grid with `namespace/name` names; publishing status requires separate verification. |
| **NPM package (proposed)** | Business projects after approval and publication | Tree-shakable ES modules with typed exports. |
| **SVG sprite (proposed)** | Low-code and legacy projects after approval | A `<symbol>` sheet referenced by `<use>`. |

**Proposed precedence after delivery.** A Vue business project would use the npm package; the sprite would be a fallback where a bundler is unavailable. Until approval, publication, and migration, this codebase continues to use Arco icons.

#### Source of truth and naming

Under the proposed distribution contract, the Figma component name propagates into both artifacts: `direction/arrow-left` → `IconDirectionArrowLeft` (npm) → `#irs-direction-arrow-left` (sprite). Once published, renaming becomes a breaking API change requiring versioning and a deprecation alias.

The source currently contains naming inconsistencies that must be normalized **before** the first publish, because they become API once published: `direction/arrow- rise` and `direction/caret- right` carry a stray space; `general/user-gronp` is a typo for `user-group`; `direction/down.double` uses a dot where its siblings use a hyphen. Fix these in Figma first.

#### Package contract

- **Name:** `@maitang/irs-icons` (or the org's registry equivalent).
- **Format:** ESM with `"sideEffects": false` so unused icons are dropped. Ship a CJS fallback only if a consumer needs it.
- **One file per icon**, re-exported from an index — a single barrel file defeats tree-shaking in some bundlers.
- **Typed:** every icon is a Vue component accepting `size`, `color`, and the standard SVG attributes; `color` defaults to `currentColor` so icons inherit text color and themes automatically.
- **No hardcoded fills.** An icon that bakes in a hex cannot follow the dark theme.
- **Accessibility:** default `aria-hidden="true"` with `focusable="false"`; an icon conveying meaning on its own takes an explicit `aria-label` from the call site.
- **Versioning:** semver. Adding an icon is a minor; changing or removing a name is a major.

#### Sprite contract

- Built from the same export, emitted as `irs-sprite.svg` with one `<symbol id="irs-<namespace>-<name>" viewBox="0 0 24 24">` per icon.
- Served from the application origin, **not a public CDN** — the sprite is reachable on unauthenticated routes and must not leak a third-party request.
- Consumed as `<svg><use href="/assets/irs-sprite.svg#irs-general-user"/></svg>`, with `fill="currentColor"` on the symbol so theming still works.
- Version the filename (`irs-sprite.v1.svg`) so a cached sheet cannot silently change meaning.

#### Migration status and gate

**This codebase stays on Arco icons until the npm package exists.** Mixing families is worse than one consistent family, and the spec forbids ad-hoc mixing.

**Blocking gap — three icons in current use have no IRS equivalent:** `IconApps`, `IconFullscreen`, `IconFullscreenExit`. Migration cannot complete until design adds them or a documented substitute is agreed. Most other icons in use map directly (`general/lock`, `general/user`, `general/send`, `general/notification`, `general/exclamation-circle`, `general/info-circle`).

**Migration sequence, once published:** add the dependency → replace imports namespace by namespace, not file by file → verify stroke weight and optical size against the 24×24 grid at every call site → remove the Arco icon import → confirm no `@arco-design/web-vue/es/icon` import remains. Do not run the migration and a feature change in the same commit.

**Never** hand-copy an individual SVG out of Figma into the repo. It forks the source of truth and the copy will drift.

**[Project]** Use one icon family consistently. Give every icon-only action an accessible name and a tooltip; never replace an icon with a punctuation character. Task-critical actions must not exist only on hover.

## Components

Figma-backed geometry, fills, and variant states below come from the named component sets. Not every control or state is specified there; use the Unspecified component fallback for gaps. Arco supplies interaction mechanics.

### Component handoff and state contract [Project]

For a route using one of these components, record the Figma node/variant, the extra project or PRD rule, and the route-specific test result. The Figma column is **not** evidence that every listed interaction was designed there. The module PRD owns business data and state transitions; `AGENTS.md` owns implementation mechanics.

| Component | Figma-backed appearance | Additional acceptance before release |
|---|---|---|
| Button | 40/32/24px sizes; measured normal/hover/active/disabled, theme, icon, shape | Visible keyboard focus, loading/duplicate-submit prevention, disabled explanation where necessary, and the DS-03 hover-contrast resolution |
| Input / Select | 32px trigger, source focus/disabled variants; Select option rows 32/39px | Label and required rule, readable help/error, first-error focus, long option/scroll behaviour, keyboard selection, and meaningful placeholder contrast |
| Table / Pagination | Source cell/header and pagination variants; Table subtree is **partially cached** | Loading/empty/no-match/error, sort/filter semantics, stable row key, selection scope, horizontal scrolling, keyboard path, and a scoped DS-01 evidence check |
| Tag / icon action | Tag 32/24/20px visual sizes and icon/close variants | Text conveys the status without colour; check actual click/close target and spacing separately from the 20px visual box (24×24px target or an applicable spacing/equivalent exception) |
| Dialog / Drawer / Popconfirm | Measured geometry, themes, and overlay types | Focus entry/return, Escape/mask/X policy, dirty-state protection, one scroll owner, footer visibility, and low-risk-only Popconfirm use |

Use this matrix as an index into the detailed component sections below, not as a replacement for their measured tokens. Mark a state **Project** or **PRD** when Figma does not specify it; never write “matches the measured matrix” for an unmeasured loading, keyboard, or server-error state.

### Button 按钮

**Purpose [Stated].** Starts an immediate action in response to a click, triggering business logic. Use it when the user must be told the content is an interactive trigger, or must be guided to click.

**Sizes [Stated].** Three sizes; height fixed, width hugs the text.

| Size | Height | Padding V | Padding H | Text |
|---|---|---|---|---|
| large 大尺寸 | **40px** | 8px | 24px | 16px / line-height 24 |
| medium 中尺寸 | **32px** | 5px | 16px | 14px / line-height 22 |
| small 小尺寸 | **24px** | 2px | 8px | 12px / line-height 20 |

**Radius:** 2px (`corners-1`) for all sizes and variants.

**Variant axes** (616 measured components): `variant类型` = emphasize 强调 / outline 线性按钮 / text 文字按钮 · `theme 主题样式` = primary 主要 / secondary 次要 / danger 危险 / 次要危险 · `size尺寸` = large / medium / small · `state 状态` = normal 默认 / hover 悬停 / active 点击 · `disabled 禁用` = true / false · `icon 图标` = true / false with `icon type` = prefixIcon 前置图标 / suffixIcon 后置图标 / singleIcon 独立图标 · `shape 形状` = rectangle 矩形 / square 方形 / circle 圆形.

**Measured state matrix.** Fill / border / text per variant, theme, and state:

| Variant | Theme | State | Fill | Border | Text |
|---|---|---|---|---|---|
| emphasize | primary | normal | `#005BF5` | — | `#FFFFFF` |
| emphasize | primary | hover | `#2D7EF7` | — | `#FFFFFF` |
| emphasize | primary | active | `#0044CB` | — | `#FFFFFF` |
| emphasize | primary | disabled | `#B8DBFD` | — | `#FFFFFF` |
| emphasize | secondary | normal | `#E6F3FF` | — | `#005BF5` |
| emphasize | secondary | hover | `#B8DBFD` | — | `#005BF5` |
| emphasize | secondary | active | `#7AB8FF` | — | `#005BF5` |
| emphasize | secondary | disabled | `#E6F3FF` | — | `#7AB8FF` |
| emphasize | danger | normal | `#D40000` | — | `#FFFFFF` |
| emphasize | danger | hover | `#E55D53` | — | `#FFFFFF` |
| emphasize | danger | active | `#B20006` | — | `#FFFFFF` |
| emphasize | danger | disabled | `#F6BCB3` | — | `#FFFFFF` |
| emphasize | 次要危险 | normal | `#FFECE8` | — | `#D40000` |
| emphasize | 次要危险 | hover | `#F6BCB3` | — | `#D40000` |
| emphasize | 次要危险 | active | `#EE8D82` | — | `#D40000` |
| emphasize | 次要危险 | disabled | `#FFECE8` | — | `#EE8D82` |
| outline | primary | normal | — | `#005BF5` | `#005BF5` |
| outline | primary | hover | — | `#2D7EF7` | `#2D7EF7` |
| outline | primary | active | — | `#0044CB` | `#0044CB` |
| outline | primary | disabled | — | `#7AB8FF` | `#7AB8FF` |
| outline | secondary | normal | — | `#DDDDDD` | `#333333` |
| outline | secondary | hover | — | `#2D7EF7` | `#2D7EF7` |
| outline | secondary | active | — | `#0044CB` | `#0044CB` |
| outline | secondary | disabled | — | `#DDDDDD` | `#CCCCCC` |
| outline | danger | normal | — | `#D40000` | `#D40000` |
| outline | danger | hover | — | `#E55D53` | `#E55D53` |
| outline | danger | active | — | `#B20006` | `#B20006` |
| outline | danger | disabled | — | `#EE8D82` | `#EE8D82` |
| text | primary | normal | — | — | `#005BF5` |
| text | primary | hover | `#E6F3FF` | — | `#005BF5` |
| text | primary | active | `#B8DBFD` | — | `#005BF5` |
| text | primary | disabled | — | — | `#7AB8FF` |
| text | secondary | normal | — | — | `#333333` |
| text | secondary | hover | `#F2F3F5` | — | `#333333` |
| text | secondary | active | `#E7E7E7` | — | `#333333` |
| text | secondary | disabled | — | — | `#CCCCCC` |
| text | danger | normal | — | — | `#D40000` |
| text | danger | hover | `#FFECE8` | — | `#D40000` |
| text | danger | active | `#F6BCB3` | — | `#D40000` |
| text | danger | disabled | — | — | `#EE8D82` |

Note the asymmetries, which are intentional and must be preserved:
- **Outline secondary** changes hue on hover (neutral `#DDDDDD`/`#333333` → primary `#2D7EF7`), unlike outline primary/danger which only shift lightness.
- **Emphasize disabled** keeps white text on a pale fill rather than greying the label.
- Secondary (pale) and text variants keep a **constant** text color across normal/hover/active; only the fill changes.

**[Project]** One primary command per region; supporting actions use secondary or outline; row utilities use text; destructive actions use danger plus a scope-aware confirmation that names the target. Labels are verb + object, not a generic “确定”. A loading state is specified (按钮加载状态) and must block duplicate submission.

**[Project] Non-emphasized button surface.** The measured matrix above has **no** filled-gray secondary variant: the quiet, non-highlighted button is `outline secondary` — the white business surface `Fill-7 #FFFFFF`, a 1px `Border-3 #DDDDDD` border, body text `#333333`, with hover/active shifting border and text to the primary hue. A non-highlighted button therefore defaults to a **white** background, not to Arco's default `secondary` gray fill (`Fill-2 #F2F3F5`), which is not a button surface in this system. Implement it as the shared `app-btn-neutral` class so the white fill holds on any canvas (transparent fill would inherit whatever sits behind the button); the reset actions on the task-center and project-management list pages use it. Existing buttons still rendering Arco's gray `secondary` fill (card copy actions, dialog cancel, member-toolbar reset) are recorded drift, to be migrated when those pages are next touched.

### Navigation 导航

**Purpose [Stated].** A menu list providing navigation to pages and features. **Top navigation** carries global categories and functions; **side navigation** provides the multi-level structure that organizes the site architecture.

**Top navigation [Stated].** Placed at the page top; left to right: logo, navigation items, auxiliary menu (user, settings, notifications).

**Side navigation component geometry [Derived from the older Figma component page]:** the following variants describe the **menu component itself**, not the page-shell sidebar. For the updated top-side-content page shell, the sidebar is **205px wide with 0px margin** as specified under Spacing & Layout. Fit or adapt the menu within that shell; do not silently enlarge the shell to the 240px component sample. The 64px collapsed variant remains source evidence but does not establish a collapsed shell width or breakpoint for the updated layout.

| Property | Value |
|---|---|
| Expanded width | **240px** |
| Collapsed width | **64px** |
| Menu item height | **48px** |
| Header/brand row height | **56px** |
| Item gap | 12px |
| L1 item padding-left | **20px** |
| L2 item padding-left | **52px** |
| L3 item padding-left | **84px** |
| Collapsed item padding-left | 22px |

Indentation steps by **32px** per level (20 → 52 → 84).

**Measured item states:**

| State | Fill |
|---|---|
| normal 默认 | `#FFFFFF` |
| hover 悬浮 | `#F7F8FA` |
| click 点击 | `#F2F3F5` |
| select 选中 | `#E6F3FF` |

**Menu typography [Derived].** L1 item 16px — weight 500 when active, 400 when not. L2/L3 items 14px, same weight rule. System name in the brand row: 17px/700.

**Disabled menu items [Derived].** Every menu component set — `item/Menu/1st`, `/2rd`, `/base`, and all three `item/collapsedMenu/*` sets — carries a `disable 禁用` on/off axis. A disabled menu item is therefore a specified state, not an improvisation. Per the standing rule, convey it by more than the greyed fill: set `aria-disabled`, keep it non-focusable as a link, and where the reason is not evident, state it. **A disabled menu item is not a permission boundary** — the server authorizes, and a hidden or disabled item never substitutes for that.

**Collapsed navigation structure [Derived].** The source's collapsed menu is a separate 64px **component variant**, not merely the 240px sample narrowed in place. Its three component sets (`item/collapsedMenu/base`, `/1st`, `/2rd`) have an `expanded 展开` axis and `items 数量` of 1–8. Collapsed parent items open a flyout rather than expanding in place. The `1st` and `2rd` sets carry the same `normal / hover / click / select` states plus `disable` as their expanded counterparts. Using that component in the updated 205px shell requires an explicit collapse and integration decision.

**Component types [Stated].** Side navigation ships as: 基础菜单 (base), 常规单层/双层/三层导航 (regular 1/2/3-level), 分组单层/双层/三层导航 (grouped 1/2/3-level), 折叠导航 (collapsed). **Collapse is supported only for regular navigation with icons** (仅支持带图标常规导航折叠). Menu item roles are named `1st group menu item`, `1st menu item`, `2rd menu item`, `base menu item`.

Top navigation states cover 一级菜单 normal/hover/select, 顶部导航二级菜单 normal/hover/select, and 顶部导航右侧菜单 normal/hover plus a two-level variant.

**[Project]** Route metadata, active menu, title, and permissions derive from one source. Group by task/domain; review grouping and search after seven modules; generally limit to two levels and give an occasional third level an unambiguous breadcrumb. Direct URLs, reload, favourites, back/forward, tenant changes, and unsaved drafts have defined outcomes. A hidden menu is never an authorization boundary.

### Breadcrumb 面包屑

**Purpose [Stated].** Shows the current page's position in the system hierarchy and allows navigating back up. Use when the system has **more than two levels**, when the user must be told "where am I", or when upward navigation is needed.

**Variants:** `item 数量` = 2–7 · `state 状态` = normal 默认 / hover 悬浮 / current 当前.

**[Derived]** Ancestor items are 14px/400; the current item is 14px/600 and is not a link. Hover applies to ancestor items only.

### Pagination 分页

**Purpose [Stated].** Splits a long list into pages, loading one page at a time. Use when loading all data would take too long.

**Pagination variants:** `totalcontent 总条数` · `pagesize 一页条数` · `jumper 跳转` · `numberbtn 数字按钮` — each on/off. **Child button variants:** `item/page arrow btn` has `type 类型` = left 左 / right 右 for the **previous/next arrow direction**, not overall pagination alignment. Number and arrow buttons carry their applicable normal / hover / click / select states.

**Composed parts [Derived]**, in source order: 共 101 项数据 (total count) · 10 条/页 (page-size select) · page number buttons · 跳至 [ 11 ] /20 页 (jumper). Body text 14px/400/22.

**[Project] Control surface.** The pager's controls share the white business surface: `Fill-7 #FFFFFF` fill, 1px `Border-3 #DDDDDD` border, 2px radius, 32px height. This covers the page-size select (132px wide), the jumper input (72px wide), and the enabled page-number and arrow buttons; hover keeps the white surface, focus switches the border to primary. The selected page number uses the primary fill with white text, and a disabled arrow keeps the `#DDDDDD` border but switches to the neutral disabled surface `Fill-2 #F2F3F5` with a `not-allowed` cursor. Arco's default gray select fill (`Fill-2`) must be overridden in the footer — an enabled pager control never renders gray. These surfaces are implemented once as the shared `app-pagination` block (with `app-page-size` / `app-page-jump` on the two inputs) so both list pages cannot drift apart.

**[Project] Pagination implementation contract.** The default business-list footer uses the complete source order above: total count, page-size select, previous arrow, visible page-number buttons, next arrow, then the jumper label, input, and total-pages suffix. Each interactive control is 32px high with a 2px radius; the selected page uses the primary fill and white text, while disabled arrows use the neutral disabled surface. Page-size changes reset to page one. The visible page-number window may be limited to five buttons for compact desktop layouts, but it must preserve the current page and provide previous/next controls. Every label, aria name, and suffix is localized through the active `zh-CN` or `en-US` locale.

**[Project]** A query change normally resets to page one; if the total invalidates the current page, choose a valid page and explain. Prefer server pagination except for a demonstrably small complete local set.

**[Project] List footer contract.** In a business data list, align the footer to the right and compose it in this order: total count, page-size selector, previous/next and page-number controls, then the jumper. Use the same 32px control height and 2px radius as other medium controls, keep 16px between the total and pagination group, and do not add a separate container border. The total count must remain visible even when the component's built-in total slot is replaced for localization. Page-size, number, arrow, hover, selected, disabled, focus, and jumper labels must update with the active locale.

### Input 输入框

**Purpose [Stated].** A text field that carries user information entry; used in forms, dialogs, and similar contexts.

**Measured geometry:** height **32px**, radius **2px**, padding 8px left/right, internal gap 8px, border `1px #DDDDDD`, fill `#FFFFFF`, text 14px/400/22.

**Measured states:**

| State | Border | Fill |
|---|---|---|
| normal 默认 | `#DDDDDD` | `#FFFFFF` |
| hover 悬浮 | `#DDDDDD` | `#FFFFFF` |
| focus 聚焦 | **`#005BF5`** | `#FFFFFF` |
| disabled 禁用 | `#DDDDDD` | **`#F2F3F5`** |

The Figma placeholder (暗提示) uses `Text-3 #999999`; entered content uses the body color. For a released input, meaningful placeholder copy follows the contrast resolution under Accessibility rather than treating this measured source value as an exemption.

**Types [Stated]:** 基本文本框 (basic), 多行文本框 (textarea), 前后缀输入框 (with prefix/suffix, e.g. `http://` … `.com`), 密码输入框 (password).

**Variant axes:** `prefixIcon 前置图标` · `prepend 前置标签` · `append 后置标签` · `clearable 清空` · `maxcharacter 限制字符` · `tips 提示` · `error 出错` · `browse 浏览` · `disable 禁用` — each off/on · `state 状态` = normal / hover / focus / filled 填充.

**Specified states [Stated, normalized labels]:** normal 默认 · hover 悬浮 · filled 填充 · focus 聚焦 · disable 禁用 · filled-disable 已填写禁用 · clearable 清空 · tips 提示 · error 出错. The Figma variant's `naomal` / `narmal` spelling is a source defect, not a state to reproduce.

**Auxiliary text [Derived].** Helper and counter text is 12px/400/20 and sits below the field. The source notes the field **wraps rather than truncates** when the helper text is long (“文字过多时输入框宽度折行”). The character counter renders as `5/150`.

**[Project] Fill is enforced globally.** The white fill above is not left to each page: `src/styles/global.css` sets `background: var(--app-surface)` and the `#DDDDDD` control border on every editable control (`.arco-input-wrapper`, `.arco-textarea-wrapper`, `.arco-input-number`, `.arco-select-view`, `.arco-input-tag`, `.arco-picker`) in normal, hover, and focus states, with focus border `--app-accent` (#005BF5). Disabled controls keep Arco's `#F2F3F5` fill. A business page that shows a grey editable input is a defect against this rule, not a variant.

**[Project] Editable vs disabled surface — 2026-10-26 user decision.** This rule is unconditional and restated here because it was violated repeatedly: **every editable control renders on the white business surface, and only a disabled control may render grey.** It is not scoped to list filters and it does not depend on a page-level class — the earlier implementation only covered `.app-filter-control`, so a plain form `a-select` trigger kept Arco's default `Fill-2` grey beside a white input in the same row, which is exactly the grey-select defect this note closes. Consequences for implementation: (1) the global defaults live in `global.css` for all six wrappers and apply inside forms, tables, drawers, dialogs, and overlays alike; (2) a page must not add a white-fill patch for a single control, and must not paint an editable control grey; (3) the disabled state (`#F2F3F5` fill, `#DDDDDD` border, Arco's disabled text) is the only sanctioned grey, and the white rule must never win over it; (4) verification reads the computed `background-color` of the control in normal, hover, focus, and disabled states — a passing typecheck or build proves nothing here.

### Form field layout [Project, 2026-11-01 user decision]

Applies to every configuration/edit form, not only the rule-management screens: **label above the control, control fixed at 500px, required asterisk to the left of the label** (`*` in `--app-color-danger`, 4px gap). Field rows stack vertically with a 16px gap; the label is 14px/400/22 in Text-2, the control keeps the 32px Input/Select geometry above. Options, helper text, and inline validation text sit under the control and stay inside the 500px column, so a long placeholder never widens the field. Read-only versions of the same form convert to a summary list — `字段名：值` on one baseline, label in Text-3, value in Text-1, no asterisk, no disabled input boxes.

**Mandatory-part headers [Project].** When a page carries several parts that must *all* be completed before submission, the parts stay as tabs (one part per tab, never stacked into one pane) and each tab title states its own obligation: asterisk + part name + `已配置 x/总` progress chip + the count of unresolved issues. No separate progress strip is rendered above the tabs (2026-11-01 user decision: the strip was removed; each tab title already carries the progress chip, and an item-navigation column anchors the first tab).

**Deferred validation copy [Project].** Field- and row-level validation text appears only after the user attempts a save or publish (`publishChecked` / `submitted`), never on first paint — an untouched form must not render a wall of red.

### Select 选择器

**Purpose [Stated].** Selects one or more values from a set of options; used in forms and data filtering.

**Anatomy [Stated]:** 文本标签字段 (label) · 星号 (required asterisk, **to the left of the label**) · 选择器 (trigger) · 下拉面板 (panel — a container for all options whose height may be controlled by option count).

**Scrolling rule [Stated].** When options overflow and must scroll, **show 50% of the last visible menu item's height** so the scrollability is visible.

**Measured geometry.** Trigger: height 32px, radius 2px, padding 8px, gap 8px — identical to Input, with the same `#DDDDDD` → `#005BF5` focus border and `#F2F3F5` disabled fill. The `item/selectOption` and `item/multiOption` outer boxes measure **32px without a divider** and **39px with the divider**. Their 22px text line is not the menu item's outer height; do not compress the clickable row to 24px. Keep the variant's spacing and divider treatment when implementing the menu.

**Measured menu item states:**

| State | Fill |
|---|---|
| normal 默认 | transparent |
| hover 悬停 | `#F2F3F5` |
| click 点击 | `#E7E7E7` |
| select 选中 | **`#E6F3FF`** |
| disabled | `#EEEEEE` with `#DDDDDD` border |

**Variants:** 单选选择器 (single), 多选选择器 (multiple), 分割线分组选择器 (grouped with divider) · axes `多选` · `分割线` · `前置图标` · `展开` · `填充` · `禁用` — off/on · `数量` = 1–6 · `状态` = normal 默认 / hover 悬停 / 聚焦 / 点击 / 选中.

Trigger states are specified both empty and filled: Normal · Hover · Focus · Select · Disabled, plus filed/Normal · filed/Hover · filed/Focus.

### Filter control surface rule [Project]

Filter inputs and Select triggers in list query areas use the white business surface `Fill-7 #FFFFFF` through the semantic token `--app-surface`. They must not inherit `Fill-2`, `Fill-3`, or another gray fill in normal, hover, focus, or filled states. The disabled state is the exception and uses the specified neutral disabled fill `Fill-2 #F2F3F5`. New filter controls must carry the shared `app-filter-control` class so the Arco wrapper and its internal Select trigger receive the same surface rule; page-local raw HEX overrides are not allowed. A page canvas may remain `Fill-1 #F7F8FA`, and a table header may remain `Fill-2 #F2F3F5`; neither changes the filter-control requirement.

**[Project] Filter geometry.** In desktop list query areas, each filter input or Select trigger is `200px` wide and `32px` high. The control may shrink to the available grid track without exceeding the 200px target; at the narrow breakpoint it may become fluid (`width: 100%`). Keep the label visible and preserve the white surface rule above. **The date-range picker follows the same 200px width** (2026-10-29 user decision: the earlier 260px range-picker deviation is retired globally — all `filter-field--range` variants use the 200px unit like every other filter control). **No exceptions: long-option Selects (e.g. rule-management 标准库/问题库/安全需求) also stay at 200px** (2026-10-29 second user decision — an earlier same-day adaptive-width exception up to 640px was implemented and then withdrawn; long option values are handled by the dropdown panel, not by widening the trigger). **The dropdown panel itself adapts** (2026-10-29 third decision, clarifying the second): the popup does not shrink to the 200px trigger width — it grows to show the longest option on one line with no ellipsis (Arco `trigger-props` `autoFitPopupWidth: false` + `autoFitPopupMinWidth: true` + the shared `rule-source-dropdown` content class in `global.css`, 200px floor, `min(720px, 100vw - 48px)` ceiling). Those three source Selects are also `allow-search` so a keyword filters the options.

**[Project] Filter strip packing ("栅栏") — 2026-10-25 user decisions (two same-day follow-ups).** In a list query area each filter renders as one **label + control unit** (an inline grid of a `max-content` label and a `200px` control with an 8px inner gap) laid out on a **wrapping row with a uniform 16px row and column gap**. Units **hug their content**: no blank gap may remain to the **left of a label** or to the **right of a control** — a unit is exactly as wide as its label + gap + control, never stretched to a grid track (2026-10-25 follow-up: equal-width grid columns were tried and rejected because they left ragged blanks beside labels and controls). A label and its control **always stay on one line** — stacking a label above its control is a defect. The query (查询, primary), reset (重置, neutral outline), and filter-settings icon buttons follow **immediately after the last filter unit with the same 16px gap** (wrapping to the next row only when the row is full). The 查询 and 重置 buttons both keep their leading icons; if one carries an icon, the other must too. First applied on 功能台账; other list pages adopt it when their filter strips are reworked.

**[Project] Jump-in filter params — 跨页带参筛选（2026-10-27 user decision）.** When a page is opened with filter parameters in the URL (e.g. `?clause=`, `?keyword=`, `?template=` from another page's link), the parameter must be written **directly into the matching filter control** (both the draft value and the applied value) and the query must run immediately — the control visibly carries the condition, and the result list, count, and pagination reflect it like any manually applied filter. The page **must not** render a separate "applied condition + clear" chip/label row (e.g. 「关联条款 6.1.1 的材料 ＋ 清除条款筛选」) for jump-in params: such detached condition rows are removed wherever they exist. If the target field has no visible filter control, add or reveal one in the filter strip instead of showing a detached label. Once consumed, the parameter is dropped from the URL and the filter lives entirely in the control: clearing the control (or pressing 重置) is the only clear affordance, and the filter persists across in-page tab switches like the other controls. First applied on 数据材料–材料清单 (`?clause=` lands in the 关联条款 select); 问卷工作台 (`?keyword=` / `?template=`) and 判定规则 (`?clause=` into the keyword control) already follow the same pattern, and no list page may reintroduce the chip-row variant.

### List settings popover — 筛选条件设置 / 列设置 [Project]

Two toolbar controls share one popover component and one interaction contract: **筛选条件设置** decides which query fields appear in the filter strip and in what order; **列设置** decides which table columns appear and in what order. Both are anchored to an icon-only 32×32 trigger, open on click, and dismiss on outside click or Escape.

**Anatomy, top to bottom.**

| Part | Rule |
| --- | --- |
| Header | None. No title row and no close button — the trigger's Tooltip carries the name, and outside-click / Escape is the only dismissal affordance. |
| Row list | Checkbox + label + drag handle (`IconDragDotVertical`, Text-4, 16px). Row min-height 36px, radius 4px, hover `Fill-2`. List scrolls at `max-height: 360px`. |
| Reorder preview | While dragging, fade the source row and tint the valid destination row with the semantic primary-light fill (`--color-primary-light-1`). Draw a 3px primary insertion line (`--app-accent`) across that row's top or bottom edge, without changing row height or pushing the list. The line shows the actual insertion boundary, not merely a hovered item. **Promoted 2026-11-01 to the project-wide row drag standard — see Row drag-and-drop reorder; that entry is authoritative where the two texts differ.** |
| Footer | A hairline `--app-divider` rule spanning the **full popover width**, then **恢复默认** as the only action: left-aligned, 12px, full-row hit area, hover tint `Fill-2`. The divider must be drawn by the footer container, not by the button's own border — an inline-flex button only paints a line as wide as its text. |

**Behavior.**

- **Live apply.** Every checkbox change, drag, or restore writes through to page state immediately. There is no draft layer, so there is no 确定 / 取消 pair; closing the popover never reverts a change.
- **Drag-only reordering in the UI.** No ↑ / ↓ buttons appear in either popover. Rows stay `draggable` with the drag handle visible, and each row exposes the keyboard equivalent `Alt+ArrowUp` / `Alt+ArrowDown` (`aria-keyshortcuts`) so ordering remains reachable without a pointer.
- **Placement preview and commit (2026-10-27 user update).** Crossing a destination row's midpoint changes the line from **before** to **after** that row; hovering below the final row's midpoint shows a bottom insertion line and allows appending. The preview updates throughout pointer movement and disappears on drag end, leave, cancellation, popover close, or completed drop. Drop commits exactly the indicated position and applies immediately. Never show a valid drop marker for an unchanged position or a move that would shift a locked row; locked rows remain fixed, including when another item crosses them.
- **恢复默认** resets both order and visibility in one step and takes effect immediately.

**Scope.**

- The 操作 column is a fixed table column. It never appears in 列设置 and cannot be hidden or reordered; it always renders as the last column.
- A module's identifying **column** row (e.g. 序号 or 操作时间) is locked visible (`disabled`) when that module requires it; fixed action columns stay outside the list. A module may also lock an essential filter (e.g. the primary keyword search). Other filters remain hideable. Locked rows are neither draggable nor valid crossing points for another row.

**Migration status.** 项目管理, 任务中心, 用户管理, and 角色管理 all implement this pattern in full; no list page may reintroduce the legacy filter-settings modal (title, close button, ↑/↓ buttons, 取消/确定).

### Row drag-and-drop reorder — 行拖拽排序 [Project, 2026-11-01 user decision]

The drag-reorder interaction defined by the 列设置 popover (Reorder preview and Placement preview above) is the **project-wide interaction language** for pointer-driven row reordering — it applies beyond popovers wherever rows are reordered by drag, including editor-embedded lists such as the section form editor's field blocks and option rows. One visual grammar, three mandatory parts:

| State | Rule |
| --- | --- |
| Dragging source | Fade the whole source row to `opacity: .55` and switch the cursor to `grabbing` (the drag handle itself shows `grab`). The row keeps its position, height, and content while dragging — nothing is removed from the list, and the row must stay identifiable as the one being moved. |
| Placement preview | Tint the valid destination row with `--color-primary-light-1` and draw a **3px primary insertion line** (`--app-accent`, `border-radius: 2px`, `pointer-events: none`) across that row's approached edge. Pointer above the destination row's vertical midpoint means **before**, below means **after**; when the source moves down, the commit index is `insertion − 1`. The line marks the actual insertion boundary — it must never appear for a position that would leave the order unchanged, and it disappears on drag end, leave, cancel, or completed drop. |
| Drag image | The drag snapshot must be **the whole row**, not the handle: on drag start call `dataTransfer.setDragImage(rowElement, cursorOffsetX, cursorOffsetY)`. When `draggable` sits on a 20×28 handle, the browser's default snapshot is that handle only — a small dot beside the pointer from which the user cannot tell which row is being dragged. This is the failure mode the rule exists to prevent. |

**Behavior and scope.**

- Insertion preview and commit share one computation; a drop commits exactly the indicated position and applies immediately (live write, no draft layer).
- Locked or non-reorderable rows (e.g. master-data placeholder fields) never become insertion points that would shift a locked row, matching the 列设置 locked-row rule.
- Radius of the tinted destination row follows its own surface: 4px inside popovers, 2px on business-surface lists. Colors and line geometry come only from the tokens above — no new hues, no per-page variants.
- Keyboard equivalence (`Alt+ArrowUp` / `ArrowDown`) is mandatory where the 列设置 pattern applies (see that entry); editor row lists may instead rely on drag plus their visible ↑ / ↓ buttons.
- Reference implementations: `src/shared/components/ColumnSettingsPopover.vue` (popovers) and `src/modules/sections/pages/SectionFormEditPage.vue` (editor field/option rows, 2026-11-01). Any row list that reorders by drag must match this grammar; introducing per-page drag visuals that drift from it is the regression to avoid.

### Icon-only toolbar controls [Project]

Toolbar controls that carry no visible text render as a 32×32 icon button (icon 16px, Text-3) and must keep both an accessible name (`aria-label` in the active locale) and a hover Tooltip whose content is the button name — the Tooltip supplements the name, it never replaces the accessible one. Removing the text label is allowed only when the icon is unambiguous within the toolbar context; if a hover bubble would be the only way to learn what the control does, keep the text label instead. Nested trigger components on the same element (Tooltip over a Popover trigger) are permitted as long as hover and click map to different layers.

**[Project] Trigger fill — 2026-10-26 user decision (supersedes the 2026-10-25 grey fill).** Icon-only toolbar triggers (筛选条件设置 and 列设置) use the **non-emphasized button surface**: `Fill-7 #FFFFFF` fill, 1px `Border-3 #DDDDDD` border, body-color 16px icon, so the two icon triggers read as the same control family as the 查询 / 重置 / 导出 buttons that sit beside them in the same toolbar or filter strip. Hover and press keep the white fill and shift border + icon to the primary hue, focus adds the standard primary focus ring, and the disabled state uses the outline-secondary disabled pair (`#DDDDDD` border, `#CCCCCC` icon). The shared implementation is the `app-btn-neutral` class in `src/styles/global.css` combined with a page-level 32×32 icon-only sizing class; the former `#DDDDDD` trigger fill (`app-icon-trigger`) is retired, and painting these two triggers grey again is the drift. Recorded history: first applied grey on 功能台账 (2026-10-25), converted to white on 标准条款 (2026-10-26); 功能台账, 审计管理, 问卷工作台, and 问卷模板 already render the white variant, so every list page now matches this rule.

### Radio 单选框

**Purpose [Stated].** The user may select exactly one option from a group of related, mutually exclusive data. Unlike a Select, **all options are visible by default** so the user can compare — therefore keep the option count small.

**Types [Stated]:** 基础单选框 (basic) and 按钮单选框 (button-style).

**Button-radio sizes [Stated].** Three sizes, heights **40 / 32 / 24**, width hugs the text, **radius 2px**.

**States [Stated]:** 未选中 (unselected) · 已选中 (selected) · 悬停项 (hover) · 不可选 (disabled) · 选中不可点 (selected + disabled).

**Variants:** `size 尺寸` = large/medium/small · `checked 已选` · `disable 禁用` — true/false · `state 状态` = normal 默认 / hover 悬停 / select 选中 · `item 数量` = 2–8 · `position位置` = left左 / mid中 / right右 (position within a button group).

**[Derived]** Basic-radio control size is 16px against 14px/400/22 label text; the button-radio group shares the Button size ladder but keeps radius 2px.

> **Incomplete in source.** The size sentence ends mid-clause: 「宽度根据文本内容自适应（基于」 — the parenthetical naming what the width is based on was never finished. The three heights (40/32/24) and the hug-width behavior are unambiguous; the unstated basis is presumed to be the Button padding ladder, which the measurements match. Confirm with design if a button-radio group ever renders at a width the Button spec does not predict.

### Checkbox 多选框

**Purpose [Stated].** The user may select one or more items from a group. Typical uses: filtering or batch operations over page/menu data, and terms-and-conditions acceptance.

**States [Stated]:** 多选未选 (unchecked) · 多选已选 (checked) · 部分选中 (indeterminate) · 多选悬停 (hover) · 未选不可点 · 已选不可点 · 半选不可点 (each disabled form).

**Variants:** `checked 已选` · `disable 禁用` · `indeterminate 部分选择` — true/false · `state 状态` = normal默认 / hover悬停 · `布局` = 水平 (horizontal) / 垂直 (vertical) · `item数量` = 2–8.

**Measured layout [Derived].** Control **16px**, label **14px**, horizontal group gap **24px**, vertical group gap **12px**.

**[Project] Permission matrix (角色管理 · 操作权限).** The role form's permission table is a headerless `15% / 20% / 65%` grid (一级功能 / 二级功能 / 操作权限; the header row exists only for screen readers) carrying plain checkboxes:

- **Same-level leaf nodes merge into one cell** — second-level items with no third-level children share one cell, and likewise all third-level items under one second-level item; chips run horizontally and wrap when they overflow. A cell with nothing to show renders an em dash.
- **The first column (一级功能) carries a select-all checkbox** for the whole branch: checked when every second- and third-level node under the group is checked, **indeterminate** when only part is, and clearing it removes the entire branch. Its accessible name is the group name through the standard toggle aria-label.
- **Cascade:** checking a second-level item checks all of its thirds; checking any third checks its parent second automatically; clearing a third keeps its siblings.
- **No grey fills in the matrix.** All cells — including the first column — share the white card surface (`--app-surface`); rows are separated by the hairline divider only. A tinted first column is a defect.
- The readonly detail view keeps the same matrix with every checkbox disabled; state is computed from the stored `checkedIds`, never hard-coded.

### DatePicker 日期选择器

**Purpose [Stated].** Selects a specific date or a date range.

**Types [Stated]:** 基本类型 (basic — 日期选择 date / 月份选择 month / 年份选择 year) · 范围选择器 (range) · 日期时间选择 (datetime). Range selection is specified as "先选择开始日期时间" — the start is chosen first.

**Trigger states [Derived].** Identical to Input: height 32px, radius 2px, border `#DDDDDD`, focus `#005BF5`, disabled fill `#F2F3F5`. Placeholders: 请选择日期 / 请选择月份 / 请选择年份.

**Variants:** `类型` = date 日期 / dateRange 日期区间 / datetimesRange 日期时间区间 / 年份 / 月份 / 日期时间 · `状态` = normal 默认 / hover 悬浮 / focus 聚焦 · `纬度` = 年 / 月 · plus per-cell axes `选中 active` · `选中开始` · `选中结束` · `范围` · `hightlight` · `此刻` · `预设范围` · `额外 additional` · `上一个` / `下一个` · `禁用`.

**[Derived]** The panel year header is 14px/600/22; month labels (一月…十二月) are 14px/400/22. A range renders a distinct start cell, end cell, and in-range highlight — three separate states that must all be implemented.

### TimePicker 时间选择器

**Purpose [Stated].** Selects a specific time or a time range.

**Types [Stated]:** 基本类型 (basic) and 范围选择 (range, with 开始时间 / 结束时间 fields).

**[Derived]** Trigger matches Input geometry with placeholder 请选择时间. The panel lists two-digit time units at 14px/400/**line-height 20**, with the selected unit at weight 500. The panel footer provides 当前时间 (now) and 确定 (confirm). Trigger states: Normal 默认 / Hover 悬停 / Focus 聚焦.

### Switch 开关

**Purpose [Stated].** A control for two mutually exclusive options — turning an option on or off.

**Measured sizes:**

| Size | Track height | Track radius | Inset |
|---|---|---|---|
| large 大 | **24px** | full (32) | 4px |
| medium 中 | **20px** | full (32) | 3px |
| small 小 | **16px** | full (32) | 2px |

**Variants:** `size 尺寸` = large/medium/small · `checked 开关` = true/false · `disabled` = true/false · `loading加载` = true/false · `label标签` = none / text 文字.

**States [Stated]:** 默认 (default) · 禁用 (disabled) · **加载中（不可点击）** — the loading state is explicitly non-clickable.

**[Derived]** The optional inline label is 12px/400/20 and sits inside the track; its presence increases the leading padding.

**[Project]** Use Switch only where the change takes effect immediately. Settings that apply on Save belong in staged form state, not a Switch.

### Table 表格

**Purpose [Stated].** Displays multiple rows of like-structured data for organizing, comparing, and analysing, with search, filter, and sort operations. Comprises **表头 (header), 数据行 (rows), and 表尾 (footer)**.

**Specified column configurations [Stated].** The source ships ten table archetypes, which define the supported structural cases:

| Configuration | Meaning |
|---|---|
| 三列 | 3 columns |
| 三列+可选 | 3 columns + row selection |
| 四列+拖拽 | 4 columns + drag reorder |
| 5列+拓展 | 5 columns + expandable row |
| 6列 / 7列 / 8列 | 6 / 7 / 8 columns |
| 8列+固定首列 | 8 columns, first column fixed |
| 8列+尾部固定 | 8 columns, last column fixed |
| 8列+首尾部固定 | 8 columns, first and last fixed |

**Header cell [Derived].** Text 14px/**600**/22, fill `#F6F7F9` in the light theme and the semantic dark-theme fill token in the dark theme. Header affordances are separate component sets, each with on/off states: `.sorter` (`排序` = 默认 / 升序 / 降序), `.filter`, `.search`, `.expand`.

**Content cell [Derived].** Text 14px/400/22 on `#FFFFFF`. The content-cell set defines which payloads a cell may carry, each independently toggleable: `text` · `icon` · `icon+text` · `text+tag` · `tag` · `link` (可跳转文字链接) · `switch`. Actions are a dedicated `table-cell/action` set carrying 1–3 text buttons (管理 / 编辑 / 删除).

**[Project] Row action overflow — 前 2 个直显 + 「…」（2026-11-02 user decision）.** When a row has more than two actions, only the **first two text links** render directly (by convention 详情 and 编辑); every further action moves into a hover-triggered「…」dropdown — a 24px `IconMore` mini button (`更多操作` accessible name + title), `position="br"`, popup container `body`, shared `content-class="row-more-dropdown"` (global.css: 104px min-width, 4px inset, 4px radius, hover fill, destructive option in danger color). Order follows frequency: 详情、编辑 →（草稿）发布 → 复制 → 删除 (danger). Conditional actions (e.g. 发布 on drafts only) enter the dropdown at the front; they never promote the direct links beyond two. The rule applies to every business list with more than two row actions; the overflow dropdown is the single overflow mechanism — never a third visible link.

**[Project] Enterprise list presentation.** For the default business-list pattern, use a white table surface with no outer border, no zebra striping, and one subtle horizontal divider between rows. Keep the header on the same white surface unless a module explicitly requires the measured `Fill-2` header variant. Actions are text links/buttons using the primary semantic color; destructive actions use the danger semantic color. Horizontal overflow belongs to the table region, not the page shell.

**Row controls [Derived].** The `操作` axis on the first column defines the leading control: `checkbox` · `radio` · `drag` · `expand` · `n/a`. A row has `悬停` and `激活` states; the expand control has two levels (`展开` = 1 / 2).

**Footer [Derived].** The table footer can use the Pagination component, with total count / page size / page buttons / jumper as applicable. The pagination arrow's `type=left/right` means previous/next direction, **not** footer alignment.

**[Project]** Define a stable `row-key` (never the page index), field meaning/type/unit, width limits, alignment, truncation and full-view behaviour, server sort/filter keys, and row-action permissions. Distinguish `0`, `false`, `''`, `null`, and forbidden values. Amounts align right with currency and precision; dates show the time zone. Fixed columns must preserve identity and critical actions. Cross-page selection distinguishes selected IDs from "all records matching the query", shows page and total counts, and documents its reset policy. The server rechecks each item in a bulk action and reports partial success. Verify keyboard, screen reader, expanded rows, and fixed-column geometry before enabling virtual scrolling.

**[Project] Compact tables inside a panel.** Keep the panel's 16px content inset and add a cell inset (at least 8px; 12px on the outermost cells) so first/last headers, values, and row actions do not sit against the panel edge. When a table must scroll horizontally, scroll the table inside that inset rather than removing its outer cell padding. This is a project composition rule, not a measured Figma cell dimension.

**[Project] Models list refinement.** The default list has no outer border or zebra striping; every data row, including the last row, retains a subtle bottom divider. The first field is plain text by default and becomes the primary-color text on hover/focus; clicking it opens the row's detail/edit entry. The action column header and cell content are left-aligned. Row actions are text links, never icon-only controls, with a fixed 12px gap.

**[Project] Rule-management cell display (2026-10-29 user decisions, three same-day reversals).** On the rule list, 规则名称 / 标准库 / 问题库 / 安全需求 cells **wrap to full display** (no ellipsis, row height grows with content). 规则说明 and the short text columns keep the single-line ellipsis. The single-line truncation is carried by Arco `column.ellipsis` (dynamic `arco-table-text-ellipsis` on `.arco-table-td-content`), never by a custom static-class span in a cell slot: Arco keys body cells `td-${index}`, so toggling columns in 列设置 reuses Td instances, and Vue's compiled slot vnodes (patchFlag TEXT-only) update the text but not a static class — a later-enabled column inherits the previous column's class and wraps wrong. Plain-text slots plus the Arco dynamic class patch correctly.

**[Project] Multi-line clamping inside a modal table (2026-11-01).** When a cell must show 2–3 lines and then ellipsis, the clamp lives on an **inner** `<span>`: `.picker-clamp { display:-webkit-box; -webkit-box-orient:vertical; overflow:hidden; -webkit-line-clamp:n }`. `-webkit-line-clamp` only takes effect with `display:-webkit-box`, and putting that on the `<td>` replaces `display:table-cell`, collapsing the cell box so every column visually merges into the first one. Never place `-webkit-box`, `flex`, or `grid` on a `<td>`; size and clip through the child element and keep the cell itself a table cell.

**[Project] Filter field composition.** In desktop query areas, labels are right-aligned and controls are left-aligned in a two-column field group with an 8px label-control gap. Input and select controls target 200px width and use a white surface in the light theme, including hover and focus states unless focus styling requires the semantic primary border. The group must hug its content rather than reserve an empty right-side area. The filter-settings trigger is the same 32px icon-only `IconFilter` button pattern used by Task Center, with a localized accessible name and visible hover/focus state.

**[Project] Column settings popover.** Column settings open in a popover anchored below the toolbar trigger, never a centered modal. The popover contains only the field list and an optional “restore defaults” action; the title, explanatory paragraph, arrow buttons, Cancel, and Confirm controls are not rendered as visible content. Checkbox changes and drag-and-drop reordering apply immediately. The first field is visible by default, cannot be unchecked, and cannot be moved below another field. The popover is a reusable shared component and its list, checkbox labels, restore action, and dialog label are localized.

### Tag 标签

> The source's purpose copy for Tag, Tooltip, and Badge is duplicated from Table; use the component variants here rather than that copy. See Defects found in the source.

**Measured sizes:**

| Size | Height | Padding H | Padding V | Text |
|---|---|---|---|---|
| large 大尺寸 | **32px** | 12px | 4px | 16px/400/24 |
| medium 中尺寸 | **24px** | 8px | 1px | 14px/400/22 |
| small 小尺寸 | **20px** | 4px | — | 12px/400/20 |

**Radius:** 2px for every size.

> The Tag prose reverses the size/height order. Use the measured table above; the source defect is recorded once under Source coverage.

**Variants:** `variant 类型` = dark 深色 / light 亮色 / outline 描边 / light-outline 描边亮色 · `theme 主题` = default 默认 / primary 主要色 / success 成功色 / warning 警告色 / danger 危险色 · `size 尺寸` · `icon 图标` · `closable 关闭` · `disabled 禁用`.

The four variants are a complete cross-product with the five themes: `dark` is a solid semantic fill with white text, `light` a pale fill with semantic text, `outline` a semantic border on transparent, `light-outline` a pale fill **and** semantic border.

**[Project]** Map a business enum centrally to text, optional icon, and semantic color. Status must stay legible without color — pair every tag with its text label.

### Tooltip 文字提示

**Type [Stated]:** 基础用法 — a tooltip carries **text content only** (文字提示仅展示文本内容). Anything richer belongs in a Popover or Popconfirm.

**Variants:** `placement 位置` — eight positions: top-left / top-center / top-right · bottom-left / bottom-center / bottom-right · left-center · right-center.

**[Derived] Measured:** the bubble is **`#FFFFFF`**, radius **4px** (`corners-2`), with a 10×6px arrow in the same white, carrying the Level-2 shadow. It is a light surface, not a dark one. Text 14px/400/22.

### Tree 树结构

**Purpose [Stated].** For folders, category directories, organizational structures, and other deeply nested content, a tree shows the hierarchy clearly and supports expand, collapse, and select.

**Types [Stated]:** 基础树结构 / 基础树 (basic) and 可功能操作树 (with actions).

**Depth [Stated].** Five levels are specified: 一级树 through 五级树/最底层 (the deepest level).

**States [Stated]:** Normal · Hover · Active · Disabled.

**Variants:** `数量` = 1–8 · `⬑二级数量` = 1–6 / n/a · `子集` (has children) · `展开` · `悬停` · `禁用` · `高亮` · `操作` — each off/on.

**[Derived]** Node text is 14px/400/22; hover and active reuse the navigation fills (`#F7F8FA` / `#E6F3FF`). Drag feedback uses the Level-3 shadow, per the elevation page's stated use ("组件 hover 状态使用，例如表格和树拖动").

### Descriptions 描述列表

**Purpose [Stated].** Displays a group of multiple read-only fields; typical on a detail page.

**Types [Stated]:** 基础样式 (basic) · 上下排列样式 (stacked label above value) · 带边框样式 (bordered).

**[Derived]** Labels are 14–16px/400 in `Text-4 #666666`; values are 14–16px/400–500 in `Text-5/6`. The basic style writes the label with a trailing colon (`标题一：`). Real-world sample fields in the source — 法定负责人, 统一社会信用代码, 成立日期, 核准日期, 营业期限, 经验范围 — indicate this component's intended use for registry/company detail panes.

**[Project]** Use Descriptions for read-only facts rather than a disabled form that only looks editable.

**[Project] Read-only detail drawers use the label-value row list (2026-10-26 user decision).** Inside read-only detail drawers (功能详情, 审计详情, and later non-editing panels), read-only facts no longer render as the bordered Descriptions table. Each field is one row of the shared `.app-detail-list` (implemented once in `src/styles/global.css`): a label column (14px, Text-2, minimum 112px wide, sizing to the longest label) + a left-aligned value column (14px, Text-1) with a **16px gap between label and value** and a **10px vertical gap between consecutive field rows** (22px text line inside the row), and **no cell borders**. Status/role/action-type/result keep their Tag / dot rendering inside the value column (e.g. 功能状态 renders as a colored Tag). The bordered Descriptions table itself remains sanctioned outside drawers where a denser matrix is genuinely needed; a detail drawer reintroducing the bordered table is a defect from this date on.

### Empty 空状态

**Purpose [Stated].** Represents the state where the current scenario has no corresponding data.

**Specified empty states [Stated].** Eight distinct illustrations and messages — these are the sanctioned set, and the distinction between them is normative:

| State | Message |
|---|---|
| No data | 暂无数据 |
| No search result | 搜索不到相关内容 |
| Page lost | 404错误，页面丢失 (illustrated `404` / `ERROR`) |
| No files | 暂无文件 |
| No notifications | 暂无消息通知 |
| Network error | 网络异常 |
| Under construction | 系统建设中 |
| No permission | 暂无权限 |

**[Project]** "No data", "no match", "network error", and "no permission" are four different states with different recovery actions — never collapse them into one blank panel. Caption text is 20px/400/28.

### Badge 徽标

**Styles [Stated]:** 基础样式 (basic) · 红点样式 (dot) · 红点数字样式 (dot with number, e.g. `99+`) · 创新样式 (feature badge, e.g. `NEW`).

**Variants:** `dot 红点` = yes / no.

**[Derived]** Badge text is 12px/400/20; the host content label is 14px/400/22.

### Dialog 对话框

**Purpose [Stated].** A temporary window used when the overall task flow should not be interrupted, but information must be shown or a response obtained — a dialog opens in the page to carry that information and its actions.

**Measured geometry:**

| Property | Value |
|---|---|
| Width (information dialog) | **456px fixed** (固定456px宽度) |
| Width (content dialog) | **560px**, or 自适应 for the basic content type |
| Radius | **4px** (`corners-2`) |
| Fill | `#FFFFFF` |
| Padding | 20px (unchanged; a floating dialog keeps its measured inset) |
| Header-to-body gap | **24px** — revised from the source's measured 40px, which was sized for a 20px title. A 16px/24 title leaves 40px reading as an empty band |
| Shadow | Level 3 |

**[Project] Why the header gap changed.** The 40px figure was measured against a 20px module title. With the panel title at 16px/600/24 (Typography · Title roles and vertical rhythm), 40px is 1.67× the title's line box and the header no longer reads as attached to its body. 24px equals one title line box, so the gap reads as breathing room rather than an empty band, and it stays a 4px multiple. Do not spend the reclaimed space by enlarging the title; spend it on content.

**Types [Stated]:** 基础信息对话框 (basic information) · 有图标信息对话框 (with icon) · 可关闭信息对话框 (closable) · plus 信息类 (information) vs 基础类 (basic/content) groups with a dedicated 内容区 (content region).

**Variants:** `theme 主题` = default 默认 / info 信息 / success 成功 / warning 警告 / error 错误 · `closeBtn 关闭按钮` = on / off.

**[Derived]** Title 16px/600/24; body copy 14px/400/22; footer actions are 取消 (secondary) then 确定 (primary), right-aligned.

**[Project] Title alignment — left (2026-10-23).** The Figma Dialog page does not specify header title alignment, and the Arco default (`titleAlign: center`) centers the title in the 48px header — measured on a 456px information dialog, the text sat 196px from each edge. The recorded product decision is that a dialog **title is left-aligned**: it starts on the same 20px inset as the body copy and footer, so title, message, and actions share one left edge, and the title keeps a 24px right reserve so a long label never runs under the close button (12px icon at the 20px inset). The 16px/600/24 title type and the right-aligned footer actions are unchanged. The rule is implemented once in `src/styles/global.css` (`.arco-modal .arco-modal-header .arco-modal-title`, specificity above Arco's `title-align-*` variants) so every `a-modal` dialog follows it regardless of stylesheet order. Drawers and popovers are not covered by this rule.

### Drawer 抽屉

**Purpose [Stated].** Opened by clicking an adjacent control; a floating panel that slides in from the screen edge — also called a half-screen modal.

**Measured sizes [Stated]:**

| Size | Width |
|---|---|
| Default | **500px** |
| Medium 中号 | **800px** |
| Large 大号 | **1000px** |

**Structure [Stated]:** 标题名称和关闭按钮 (title + close) in a **56px** header; body; and 操作按钮区，固定底部 — **the action area is fixed to the bottom**, not scrolled with the content.

**[Derived]** Fill `#FFFFFF`; title 16px/600; footer carries 取消 and 确定.

**[Project]** A Drawer holding unsaved input must not close silently on mask click or Escape. Define one vertical scroll owner for the body; the fixed footer must reserve its own space rather than overlay the last field.

**[Project] Business-drawer surface and grouping — 2026-10-25 user decision.** A business drawer (form/detail/import-style panels, e.g. 功能台账) renders on the page canvas `Fill-1 #F7F8FA` (`--mt-fill-1`, dark theme follows the token) instead of a full-white panel; the 56px header and the fixed bottom action bar stay on the white business surface (`--app-surface`), as does every **content block**: the body is a vertical stack with 16px padding and 16px gaps, and each logical block is wrapped in its own white card with 16px padding and 2px radius — in the 添加功能 drawer, **区块A = 基本信息** and **区块B = 子功能与控制器** are separate white cards, each sitting **16px from the body's top/left/right edges, 16px apart from each other, and 16px above the bottom action bar** (the import drawer packs its dropzone, the `#F8FBFF` 注意事项 sub-block, and the template link into one white card). Editable controls inside the drawer keep the white input surface; disabled (non-editable) controls keep the neutral gray `Fill-2 #F2F3F5` fill — a gray *editable* control is a defect (same rule as Inputs). Title 16px/600/24 in the white header; the footer keeps 取消 (neutral outline) + 确定 (primary), right-aligned. Inline utility buttons inside a block (e.g. 添加子功能) hug their content width and align to the block's start edge — never stretch to the block width.

**[Project] Drawer form-control detail — 2026-10-26 user decision.** Apply the global editable/disabled surface contract above to every input and selector in a business drawer, including open, hover, focus, error, filled and empty states. Editable controls use `--app-surface` (white in light mode) with a 1px `--app-control-border` outline; focus uses the semantic primary border, and validation errors change the border rather than painting the field gray or red. A text input with a specified maximum length shows the live `0/n` counter **inside its right edge**, with enough room that placeholder or entered text does not overlap it; this drawer-specific placement overrides the generic Input example whose auxiliary counter sits below the field. Selectors without a character limit do not show a fabricated counter. When an editable value is empty, show a concise locale-aware action placeholder such as `请输入平台名称` / `请选择所属部门`; it remains a hint, not a substitute for the visible label or validation message. A preselected value is not empty and should render as its value instead. Disabled controls alone use the neutral gray `Fill-2` fill (`--color-fill-2` in the implemented theme) with the neutral control border, and cannot be edited; a page-level white-surface override must not win over the disabled style. Read-only facts in a detail drawer use `a-descriptions` instead of disguising an editable control as disabled. Verify computed fills, borders, placeholder/counter spacing, and both locales in the actual open drawer.

**[Project] 问题库主抽屉宽度 — 2026-11-04 user decision.** The 问题库 page's single drawer (新建 / 复制 / 编辑 / 详情 share one `a-drawer`) uses the **Medium 800px** width (`min(800px, 100vw)`), replacing the earlier `min(1200px, 100vw)`. All four modes keep the same width — no per-mode resizing — and the 800px body still fits the 题目编排 table without horizontal overflow (734px table, two 257px text areas). Other drawers keep their own widths: 批量导入 560px, 来源详情 / 规则详情 / 新建任务 already 800px.

**[Project] Dismissal and motion.** Read-only drawers (detail, import upload, and later non-editing panels) close on mask click and Escape; editing drawers with unsaved input keep the confirm-and-discard guard and do not close on mask click. Every drawer slides out to the right with a **linear** timing function (Arco's `slide-right-drawer-leave-active` gets `transition-timing-function: linear`), matching the task-center drawer. This interaction is recorded here on 2026-10-25 by user decision; subsequent non-editing drawers adopt it by default.

### Batch import — 功能台账-批量导入 baseline [Project, 2026-10-26]

The cached Figma source does not define a uniform batch-import workflow. Use the 功能台账 import drawer as the **project baseline** for later business-module imports, adapting field rules and file limits to each module's approved contract. This is a user-approved project pattern, not a Figma-measured component and not evidence that other modules already implement it.

- Keep the upload/drop target, the `#F8FBFF` 注意事项 sub-block in light mode, and the template-download command in one white drawer content block as specified above. In dark mode the notes use a semantic dark fill with readable theme text, not the light-blue fill. The upload target has a dashed semantic control border, centered folder icon, filename/instruction, and a primary upload action. Preserve the surrounding 16px inset, theme-aware surfaces, visible keyboard focus, and a fixed footer.
- Before selection, the instruction must say that users can **click to upload or drag a file here**. The target supports pointer, keyboard, and drag-and-drop. Once a file is selected, show its actual name **inside** the target, replace the primary action with **重新上传**, and do not duplicate the filename below the target. Long names wrap without clipping. A replacement clears the previous parsed result before validation; invalid files retain a visible error and a retry path. Disable duplicate submission while processing.
- Pre-generate a downloadable template when the import drawer opens so its download command can initiate the file synchronously from a user click. Show the link's loading state while preparing; on failure keep a retry path and give a specific error rather than claiming success. Name the file `当前业务模块导入模版.xlsx` without extra separators; for this module it is **`功能台账导入模版.xlsx`**. The workbook must round-trip through the same parser used by import.
- 功能台账注意事项第 5 条 reads: “子功能与控制器用竖线分隔，多个子功能换行输入，按顺序一一对应”. The existing workbook retains separate 子功能 and 控制器 columns: multiple values in each column use `|` followed by a line break, matched by position. Existing single-line pipe-separated workbooks remain accepted. Other modules must document their own row schema rather than copying this business-specific rule.
- **Submission → 任务中心 handoff [Project, 2026-10-29].** The fixed footer's 确定 (primary) submits the whole workbook with **partial-success semantics**: rows that match an existing business ID (e.g. 功能 ID) update that record; failed rows never block successful rows. While submitting, duplicate submission is disabled. On success the drawer closes, a success `Message` appears, the list reloads, and the **任务中心 opens on the 导入任务 tab** showing the created/updated/failed counts. When any row failed, an error workbook is attached to the task as **`当前业务模块_导入错误数据_<日期时间>.xlsx`** (功能台账: `功能台账_导入错误数据_YYYY-MM-DD_HHmmss.xlsx`, generated from the same `stampText(date, 'datetime')` helper used for the task stamp). The in-drawer immediate “下载错误数据” command must use the **same timestamped name** — an un-timestamped duplicate of the same artifact is a defect. On submit failure keep the drawer open with a retry path.

### Batch export — 导出确认弹窗 → 任务中心下载任务 baseline [Project, 2026-10-29]

The cached Figma source does not define a uniform export workflow. The 功能台账 and 数据材料 export chain (确认弹窗 → 任务中心下载任务) is the **project baseline** for business-module list exports. This is a user-approved project pattern, not a Figma-measured component; the chain is shared, while each module defines its own column set and file format.

- **Toolbar trigger.** The list toolbar places a labeled neutral button (`app-btn-neutral`, text 导出 with the download icon, text 导入 with the upload icon) in the right-hand action group beside the primary 新建 button — labeled text buttons, never icon-only (the icon-only rule covers filter/settings-class compact controls only).
- **Pre-condition.** Export always runs against the **currently applied filter result**, not the raw store. When the filtered result is empty, an info `Message` says so and no confirmation dialog opens.
- **Confirmation dialog.** A 456px information dialog per the Dialog section: title 导出提示, one 24px warning icon followed by two left-aligned lines — line 1 states the scope (“本次将导出所选时间范围内的所有数据” or the module's equivalent), line 2 points to 「任务中心–下载任务」. 取消 (neutral) stays enabled; 确认导出 (primary) shows loading while the task is being created and duplicate triggers are disabled; mask close cannot confirm an in-flight export.
- **Confirm action.** Build the workbook from the applied result (export may append read-only columns such as 评估状态/启停/创建人/创建时间 beyond the import schema), then hand it to the **任务中心 as a 下载任务**, show a success `Message`, and open the task center on the 下载任务 tab. On failure keep the dialog open with a retry path.
- **File naming.** `当前业务模块_日期.扩展名` with no extra separators around the underscore — 功能台账 exports `功能台账_YYYY-MM-DD.xlsx` (Excel), 数据材料 exports `数据材料_YYYY-MM-DD.csv` (UTF-8 CSV). The date is the client-local calendar date, matching the timestamp helpers used by the import task stamps.

### Alert 警告

**Purpose [Stated].** A warning prompt presenting information that needs attention. It is a **non-floating, static** presentation: always visible, never auto-dismissing, and the user may click to close it.

**Measured geometry:**

| Property | Value |
|---|---|
| Height (title only) | **48px** |
| Height (title + description) | **78px** |
| Radius | **4px** |
| Padding | 20px horizontal, 13px vertical |
| Gap | 8px |

**Measured theme fills:**

| Theme | Fill |
|---|---|
| 提示 info | `#E6F3FF` |
| 成功 success | `#DCF5DE` |
| 警告 warning | `#FFF4E6` |
| 错误 error | `#FFECE8` |

**Types [Stated]:** 基础样式 · 可关闭的提示 (closable) · 有跳转的提示 (with link) · 有辅助性文字 (with description) · 有图标 (with icon).

**Variants:** `主题` = 提示/成功/警告/错误 · `图标` · `关闭` · `描述文案` · `操作` — yes/no · `自定义操作` = none / text (e.g. 不再提醒, 相关操作).

**[Derived]** Title 14px/600/22, description 14px/400/22. Alert carries **no shadow** — it is in-flow, not floating.

### Message 全局提示

**Purpose [Stated].** Lightweight **global** feedback on a user action.

**Measured geometry:** height **38px**, radius **4px**, fill `#FFFFFF`, padding 20px horizontal / 8px vertical, gap 8px, Level-3 shadow.

**Variants:** `theme 主题` = info 默认 / success 成功 / warning 警告 / wrong 错误 / **loading 等待**.

Unlike Alert, Message is a white floating surface with a semantic **icon** rather than a semantic background fill. The `loading` theme has no Alert equivalent and is the correct choice for "等待反馈" (awaiting response).

### Popconfirm 气泡确认框

**Purpose [Stated].** For secondary confirmation of actions **that will not cause serious consequences**. It pops over the clicked element. **It has no mask** — clicking outside closes it.

**Measured geometry:** width **334px fixed** (334px固定宽度), **20px fixed spacing** (20px固定间距), radius 4px, Level-2 shadow.

**Types [Stated]:** 基础对话框 (basic) and 有图标对话框 (with icon).

**[Derived]** Title 16px/600/24; description 14px/400/22; footer 取消 then 确定 using small buttons.

**Boundary.** Popconfirm is explicitly scoped to low-risk confirmation. A destructive or irreversible action requires a Dialog that names the target and its impact.

## Page patterns

### Login route — current project exception [Project]

The Figma Landing Page remains `进行中`; it is **not** a binding screen specification. `src/modules/auth/pages/LoginPage.vue` and `src/styles/global.css` contain the current split-panel layout and responsive breakpoints. Those implementation details are not repeated as global design rules here; review them against the completed Figma screen when one is issued.

The following values are **route-specific implementation deviations**, not Figma approvals and not defaults for business routes. Product/design must accept them as a recorded exception before release.

| Deviation | Spec value | Login value | Rationale |
|---|---|---|---|
| Input height | 32px | **52px** (48px ≤ 640px) | Two fields on an otherwise empty page; touch-comfortable target at the product's front door |
| Submit button height | 40px max (large) | **52px** (48px ≤ 640px) | Matches the input height so the column reads as one stack |
| Title size | Standalone hero scale (24px) | **28px** | Page is the whole screen, not a module within a shell |

All other applicable typography, color, validation, and focus rules remain in force. The local artwork is `src/assets/login-bg.svg`; any replacement must recheck the white headline's contrast on the **rendered image**, including its scrim and fallback fill. The auth store is still a **mock**, not a production identity provider: do not print credentials or present a mock login as real authorization. An independently accessible preview needs an identifiable non-production scope (see Product copy). Sign-in acceptance belongs to the auth module: verify keyboard order, retained values after failure, duplicate-submit prevention, redirect validation, and the 1100px/640px transitions before release.

### Composition [Project]

```text
Application shell (Pattern 2 — top + side)
  Header 56px            global identity / tenant / user actions
  Sider 205px            flush left and bottom, margin 0, height = viewport − 56px (sticky), one group expanded; collapses to a 64px icon rail
  Content 自适应         white page panel on the Fill-1 page canvas (whole-page background; the shell owns the 16px gutters); 16px between modules
    Breadcrumb + page-level action
    Scope / summary → query / filter → toolbar / bulk commands
    Table, detail, form, approval, configuration, or analysis
    Pagination / auxiliary state
```

- **List:** keep common conditions visible and house advanced conditions by usage; applied filters are removable and query semantics are declared in shareable URL parameters. Draft filter changes do not silently affect results. Group refresh, density, columns, and export. Distinguish first load, local refresh, no data, no match, failure, forbidden, and stale replies.
- **Detail / create / edit:** object name, ID, status, impact, and key actions stay visible. Use Descriptions for read-only facts. Dialog for few fields, Drawer to preserve context, a route for long, multi-step, or shareable work. Restore list filters, page, and necessary scroll position on return.
- **Approval / configuration:** show the original request, before/after values, attachments, risk, comment, history, and irreversible impact. Distinguish an immediate Switch from a staged Save. On a concurrent version conflict offer refresh / compare / retry; never silently overwrite.
- **Analysis:** show measurement definition, time range, refresh time, unit, and latency. Provide a visible data table when comparison or exact-value inspection is part of the requirement; otherwise use an accessible chart summary and keyboard-accessible values without adding an unsolicited "view chart data" control.

One page-level primary action. Use spacing before adding framed containers; never nest cards.

### Section list and child-route composition [Project, 2026-10-26]

For a two-Tab section workspace such as 基础信息, the **first-level route** follows the 问卷工作台 layout: the Tab strip sits above its content, and each Tab owns two sibling `div` regions, not nested cards. The first white region contains the query form (label/control units and actions follow Filter control surface rule); the second white region contains the list heading, actions, table/empty state, and pagination. Both use a 16px inset and the approved 16px inter-module gap on the Fill-1 page canvas. Changing Tabs switches the visible panel and keeps its filters tied to that panel. The first-level list does not need a breadcrumb because the shell navigation and Tab identify it.

The **new / edit / detail child route** follows the 新建问卷 composition: a separate shareable Vue route, a white sticky top operation band beneath the 56px shell header with the parent link/current context and return plus save/other permitted actions; below it, separate white content groups with 16px insets and 16px gaps. Keep the object identifier, current status, and material context visible. For a read-only detail, use Descriptions rather than disabled input controls. A new/edit page protects unsaved changes on route exit and browser close; save errors retain user input, and preview must not masquerade as publication or confirmed backend data. This composition does not require a second application shell or apply to every business route.

### Rule version config composition [Project, 2026-11-01 user decision]

`规则配置 → 新建/编辑规则` uses one sticky operation band (breadcrumb on the left, 取消 + 保存草稿 / 提交发布 on the right) over two content groups: **基本信息**, then a single group titled **规则配置**. The three former Tabs (触发条件 / 需求条目 / 分区分配) are retired — the clause is the unit of work, so every clause card carries all of its own configuration.

```text
White group「规则配置」
  divider → 16px → two columns, 16px gap
    条目导航 240px, sticky (top 112px)        clause list (flex 1)
      章级 group banner (6.1 … 6.5 …)          clause card × n, 16px apart
                                                  ├ 触发规则   ── 高级表达式 switch (header, right)
                                                  ├ 需求条目   ── + 添加安全需求
                                                  ├ 测试方法   ── 只读回显（来自「测试方法」映射模块）
                                                  └ 分区分配   ── 分区表单 → 字段位
```

- **Spacing.** The 「规则配置」 header row sits **16px** above both the 条目导航 column and the first 章级 banner (`.cfg-columns` margin; no divider line since Round I); the same 16px governs clause cards inside a chapter. Do not add a second inner container — spacing, not framing, separates the groups.
- **Sub-block order is fixed** (触发规则 → 需求条目 → 测试方法 → 分区分配) and identical in every clause card, so the same field sits at the same position across 38 clauses. Each block header carries its own counter and actions; 高级表达式 is the only control in the 触发规则 header, aligned right.
- **Navigation active state** reports *the chapter currently being edited*, not a clicked link: the 章级 whose banner has passed a 120px threshold is highlighted (accent text, `arcoblue-1` fill, 600 weight, `aria-current`). It updates while scrolling, including during the sticky measurement pass. A chapter with zero configured clauses keeps its dimmed `0/n` badge and is never disabled.
- **Advanced expression has three states.** Empty input may open and close freely with no hint at all. Invalid input shows the readable-form line in danger red (「表达式语法错误，可读式待修正」) and refuses to close, with a warning toast naming the constraint; the text the user typed is preserved. Valid input shows the readable form in secondary text and closes normally. Never surface an error line for an untouched field.
- **Question-tree nesting is reversible (2026-11-04):** leaf rows inside a child group carry both 「设为子级」(merge into the adjacent neighbour, existing rule) and 「取消子级」 — the latter moves that question back into the parent level, inserted right after the group it leaves; when the group drops to a single child it auto-dissolves and floats that child up (existing collapse semantics). Top-level leaf rows never show 「取消子级」 (they are already at the highest level). The two actions are exact inverses and both re-serialize the expression immediately.
- **Group headers carry no divider and no asterisk** (Round I, 2026-11-02): the 基本信息 and 规则配置 title rows are plain heading rows — no bottom border, and the 规则配置 title does not repeat the required mark. Spacing below the header is the 16px column gap, nothing else. Required marks live on the field labels only.
- **Empty-state pattern**: when a sub-block is gated, the action button sits **left of the gate hint** inside one row — 触发规则 shows 【+ 添加问题】(disabled until 基本信息「问题库」has a source, hint 「请先在基本信息中选择「问题库」来源」); 需求条目 shows 【+ 添加安全需求】 left of 「请先在基本信息中选择「安全需求」来源」. Once the source is chosen the hint disappears and the original empty text (「未配置触发规则…」) returns.
- **规则配置 gating by 标准库 (2026-11-02):** the whole two-column block (条目导航 + clause cards) renders **only after** 基本信息「标准库」has a source — clause data comes from the standard library, so with no source the panel shows one centered `a-empty` (`.cfg-rules-empty`, 48px vertical padding) reading 「请先在基本信息中选择「标准库」来源」 and nothing else below the 基本信息 group.
- **Source changes ask for confirmation (2026-11-02):** the three source selects are controlled (`:model-value` + `@change`); changing one **while dependent data exists** opens a 420px confirm modal (「确认更换来源」/「确认更换」): 问题库 → clears every clause's trigger rules; 安全需求 → clears every clause's linked requirement items; 标准库 → clears all per-clause configuration (trigger rules, requirement items, section assignments; test methods re-echo from the new source via the existing watch). Cancel keeps the old value (the select never moved). With nothing configured the change applies directly with no modal.
- **Source gating is progressive.** 需求条目 stays disabled until 基本信息「安全需求」has a source; 分区分配 opens with an empty 分区表单 reading 「请选择分区表单」and 字段位 disabled until a form is chosen, and both selects are 500px wide; **测试方法 is no longer a basic-info field and no longer user-configured per clause** (2026-11-02 decision: clause ↔ Chapter-9 mapping is maintained on this platform in the standalone「测试方法」module). Per clause, the 测试方法 block is a **read-only echo**: before 基本信息「标准库」has a source it shows the secondary-text hint 「请先在基本信息中选择「标准库」来源」; once chosen, the mapping-module value per clause fills in automatically — no interaction, no reset/clear controls. A new rule therefore starts empty everywhere a user must choose.
- **Selected 安全需求 rows** show `SR-###` plus the source cell text, clamped to four lines. One spreadsheet cell in 需求数据·安全需求 is one entry (38 entries), not one row per sentence inside the cell — counts, dedupe, and the 64-item downstream identity all follow the cell, never the sentence.
- **添加需求条目弹窗 lists all 139 entries (2026-11-02 second decision):** the picker's data source is the **full** set of `RF-…-DEV/DOC<n>` entries parsed from the 需求筛选 sheet's column E (139 entries, all 38 clauses covered) — not just the current clause's entries — and the user picks freely for the triggering clause. **No source-note line is shown above the type switch** (2026-11-04 user decision: the 数据来源 text, its `sourceNote` i18n key and the `.srpicker-source` style were removed); the code column shows the full `RF-<条款>-DEV/DOC<n>` id (128px column) so entries stay distinguishable across clauses. Echo is by stored id: reopening the picker restores checked state and the 「已选择 {count} 条」 tally accumulates across both type tabs. The tally is rendered **once only, in the bottom pagination bar** — the duplicate count at the right end of the filter row was removed on 2026-11-04 from both this picker and the 选择问题弹窗; the remaining `<b>` carries `aria-live="polite"` so screen readers still announce changes. confirm rewrites the clause's list in candidate order (Device → Document) and preserves any legacy (non-RF) refs that have no candidate row.
- **已选行标识是完整 RF id (2026-11-02 fix):** `srRefOf` returns the **full id** (`RF-<条款>-DEV/DOC<n>`) for RF entries — never the group-local sequence (`DEV-1`) — because the selected-row list dedupes by code and group-local codes from different clauses would collapse cross-clause selections (50 picked → ~10 shown). Dedupe by code remains only for legacy `'条目号-摘要'` refs that merge into the same cell entry.

### Test-method mapping module [Project, 2026-11-02 user decision]

**「测试方法」is a standalone top-level menu** (sidebar order: 数据材料 → 测试方法 → 规则配置 — the raw material is maintained before the rules that consume it), route `/rules/test-methods`, one page, no tabs. It maintains the 38-clause ↔ Chapter-9 test-method mapping that used to live in 天枢's 标准库 but belongs to this platform, sourced from the GB 44464 standard document (same values as the 需求数据 workbook's 「第9章段落」+「测试方法」columns).

- **Table**: 原生 table 风格 a-table (`.tm-table`), five columns — 条款号 (110px, tabular) / 条款主题 (300px) / 第9章 (96px, reverse-looked-up from the method options) / 测试方法 (440px, inline `a-select allow-search`, 400px wide) / 操作 (120px, 「恢复默认」a-link). Shared `app-pagination` with the five pageSize tiers [10, 20, 50, 100, 200]; total count reads 「共 38 条条款」.
- **Header** shows the note sentence (mapping basis + effective-scope explanation) and 「{count} 条已调整」 only when count > 0 (`v-if`, so 0 renders nothing), plus 「全部恢复默认」 with a 420px confirm modal.
- **Row semantics**: each row's select lists all 38 method options; saving fires a success toast and persists to `test-method-mappings:v1` (full 38-key record; invalid values are rejected and re-rendered from storage). 「恢复默认」 is **disabled while the row equals the standard default**; after a row is adjusted it re-enables and restores that one clause. 「全部恢复默认」 persists the full default mapping.
- **Effective scope**: edits take effect for rules created *afterwards*. Saved rules keep a snapshot (`RuleVersion.testMethods`) captured at save time and are never overwritten by later mapping edits — the rule-config page refills its echo from the snapshot on edit/copy and from the current mapping only on a brand-new rule once 基本信息「标准库」is chosen. The 规则列表 drops its 测试方法 column and filter; the rule detail keeps the 测试方法 column in the clause table (snapshot-first, static fallback) but its 基本信息 has no 测试方法 row.

## Charts [Project]

**Library: ECharts [Project implementation].** `echarts` is installed and used by the current dashboard. Its approval history is not recorded in the Figma cache; keep this choice for existing charts, and review any new chart requirements with product/design. Use explicit per-chart imports (`echarts/core` plus the needed charts, components, and the canvas renderer) rather than the full bundle; register the Metritag theme once in the chart module. Do not add a second charting library for one feature.

The Figma source contains **no chart specification** — everything here is a project decision built on the Metritag palette.

### Metric card anatomy [Project]

The KPI card on the overview page has four fixed slots. Sizes come from the type scale and the icon rendered-size table; nothing on the card is off-scale.

| Slot | Spec |
|---|---|
| Metric label (指标字段) | **14/600/22**, `Text-2` — deliberately grey so the value owns the card's emphasis |
| Info icon after the label | **16px**, `Text-3`, `cursor: help`, wrapped in a tooltip that carries the field description; the icon is decoration for the affordance, the tooltip is the content |
| Metric value | **24/600/32**, `Text-1`, tabular numerals, single line |
| Change indicator | **12/400/20**, `Text-2`, sits **10px** below the value; the directional arrow uses 语义色 with the Chinese market mapping — up = `Danger` red, down = `Success` green — and never carries the meaning alone |
| Trend graphic (sparkline / mini-bars / progress) | `min(45%, 160px)` wide, **absolutely positioned at the card's bottom-right content inset** — its bottom edge is flush with the change text's bottom edge, and it never contributes to the card's height |

**Vertical rhythm.** The card height is content-driven (自适应) — there is no fixed min-height; equal heights inside a row come from grid stretch, not from a reserved size. The change text sits **10px** below the value as a fixed distance — not a floating one; 10px is a user-approved exception to the 4px increment rule (Spacing · Size increment), scoped to this card and not reusable as a generic spacing value. The label-to-value distance stays 8px. The trend graphic is out of the flow: it is pinned to the card's bottom-right content inset, so its bottom edge stays flush with the change text's bottom edge regardless of card height, and it must never be stretched to fill space — keep the sparkline's aspect ratio and let the card height be whatever the text stack needs. On ≤480px viewports the trend returns to normal flow and spans the full card width below the change text. Keep values short: the value is `nowrap` and the trend occupies the right 45% of the card, so an overlong value can run under the trend; truncate or shorten the data rather than wrapping.

The label stays grey even though it is 600-weight: weight signals structure, colour signals emphasis, and on this card emphasis belongs to the value. Do not promote the label to `Text-1` or enlarge it to 16px — that competes with the value and flattens the card's hierarchy.

### Metric-card mini trends [Project]

The small, read-only trend inside a KPI card is a compact visual cue, not a full ECharts plot. A data-driven SVG is appropriate here; the full-size analytical chart still uses ECharts. For the line variant, the current project overview reference (237×83, ratio approximately 2.86:1) uses a **smooth cubic curve** rather than a straight-segment polyline, closing the area to the bottom baseline. Its light area is a vertical `Theme-6` 18%-opacity to `Theme-1` 22%-opacity gradient with a 2.5px rounded `Theme-6` stroke. This is a **project example, not a Figma-approved chart rule**; review it with the module owner before generalizing. Dark mode follows corresponding tokens rather than a hardcoded light fill. Each SVG on a page needs its own gradient ID.

Keep the aspect ratio when the card resizes; do not stretch the path or clip peaks. The line and shaded area are secondary to the metric value and must not introduce axes, point markers, controls, or a data-detail panel. Preserve a concise accessible name for the trend, and do not use red/green area colors as an implicit success/failure signal. Bar and progress miniatures retain their respective established forms.

### Series palette

Eight categorical colors, ordered. Each reaches at least 3:1 against its canvas (graphical-object threshold) and is distinguishable from its neighbours. Assign **by position in the series order**, not by meaning.

| # | Light | Dark |
|---|---|---|
| 1 | `#005BF5` | `#6FA5FF` |
| 2 | `#0E7C8A` | `#1DE4F3` |
| 3 | `#C25400` | `#FF9A4D` |
| 4 | `#8B5CF6` | `#B18AFF` |
| 5 | `#00913A` | `#3FD15F` |
| 6 | `#E5308C` | `#FF6FB0` |
| 7 | `#7A4E00` | `#D9A441` |
| 8 | `#5B7083` | `#A8B2C0` |

Light-mode series 2, 3, and 5 are **deliberately darker** than the corresponding brand tokens (`Subsidiary-6`, `Warn-6`, `Success-6`), which sit at 1.56–2.94:1 on white and are illegible as thin chart marks. Do not "restore" them to the brand values.

**Semantic separation rule.** Series colors describe categories, not outcomes. A categorical series must never be read as success/warning/error. When a chart genuinely encodes outcome — a pass/fail bar, an error-rate line — use the functional tokens explicitly and label them; do not leave it to palette position.

### Sequential and diverging

- **Sequential** (one measure, low→high): interpolate `#E6F3FF → #005BF5 → #0C38C7` in light; `#1C2B45 → #4D8DF8 → #A8C9FF` in dark.
- **Diverging** (a meaningful midpoint): `#D40000 → #F2F3F5 → #005BF5` in light; `#FF6A5E → #3C4049 → #6FA5FF` in dark. Anchor the neutral at the real zero or baseline, never at the data midpoint.

### Chart typography and chrome

| Element | Value |
|---|---|
| Chart title | 16px/600/24, `Text-6` |
| Axis label, legend, tooltip body | 12px/400/20, `Text-4` |
| Value label on a mark | 12px/400/20, `Text-5` |
| Axis line and ticks | `Border-3 #DDDDDD` (dark: `--mt-d-border-3`) |
| Grid line | `Border-1 #EEEEEE` (dark: `--mt-d-border-1`) |
| Tooltip surface | `#FFFFFF`, radius 4px, Level-2 shadow (dark: `--mt-d-bg-popup`) |

Grid lines are decorative and exempt from 3:1; axis lines that carry meaning are not.

### Required metadata [Project]

Every production chart declares, visibly or one interaction away: **metric definition · time window · unit · baseline or target · last refresh time · data latency · how missing and outlier values are handled · drill-down destination**. A chart without a stated window and unit is not shippable.

### Accessibility

- Every chart needs a concise accessible summary and keyboard-reachable values. Provide a visible, keyboard-reachable table of the same data when the requirement calls for chart data detail, precise comparison, or export; do not add a data-detail toggle by default to a visual overview.
- Do not encode a distinction by color alone: pair color with shape, dash pattern, direct labels, or ordering.
- Keep series color assignment **stable across renders and filters** so a series does not change color when the data reshapes.
- Tooltips must be reachable by keyboard focus, not hover only.
- For bar/line charts, hovering a mark or its category axis reveals a tooltip with the category and numeric value(s), including all series at that category. Keep the tooltip within the chart's visible bounds and verify mouse and keyboard paths.
- Resize the ECharts instance with its container (including full-screen and panel-width changes); do not stretch a fixed-viewBox chart or scale its canvas with CSS. Axis text and circular point symbols must retain their native proportions at each supported width.
- Respect `prefers-reduced-motion`: disable the initial animation and transitions when set.

### Implementation

The current registration lives in `src/design/charts/theme.ts`; the categorical palette and typography tables above are the design contract, not a second implementation file. Load chart code only on routes that need it, resize with the container, dispose on unmount, and verify theme changes and large datasets with real chart views. Do not copy an example theme from this document into a competing registration.

## Imagery [Project]

Enterprise imagery shows a real workflow, state, or data relationship — never decoration. Empty states pair a restrained illustration with a recovery action, using the eight sanctioned Empty states. For chart metadata, semantic colors, and accessible values, use the single contract under Charts; do not maintain another copy here. Upload and preview define type, size, progress, failure, retry, access, and removal. No decorative hero images, gradients, or ornamental 3D.

## Responsive and scroll ownership

- The cached Figma source recommends **1280px to 1920px** design canvases with **1440px** as reference. The approved Figure 1 / Figure 2 update supersedes its fixed-content example: **both content regions are fluid with 16px outer margins**, including above 1920px unless a new maximum width is explicitly approved.
- The supported browser minimum is **open DS-04**, not inferred from the 1280px artboard. Product and QA must record per-route support (login vs business routes), input method, minimum viewport, and the outcome below it. A narrow login fallback does not promise full mobile business workflows.
- The old Figma menu component includes a **64px collapsed variant only for regular navigation with icons**; the 205px page shell originally named no collapsed width or breakpoint. That gap is now closed by **Sidebar collapse** under the page layout patterns: navigation sidebars collapse 205px ⇄ 64px, remember the choice per shell, and fall back to the stacked layout below 901px. Stack fields or move secondary actions only when the approved narrow layout remains functional. A wide data table may scroll in its own region while identity and key actions remain reachable.
- Define **one** vertical scroll owner per region. The Drawer's fixed footer and the Dialog's fixed 24px header gap must reserve their own space; a sticky footer must not overlay the last field.
- Test the Figma reference widths (1280/1440/1920px) and the approved browser floor separately. If claiming WCAG 2.2 AA, include 400% zoom / 320 CSS px equivalent reflow checks on form, navigation, and overlays; document justified two-dimensional scrolling only for content such as wide tables, not the whole page. Prevent clipping, overlap, and jumps at 100%, 200%, and the required zoomed state.

**[Project] Sticky rail nav (条目导航 / 分组导航, 2026-11-01).** Long clause or item lists carry a left rail nav that (a) starts flush with the top of the adjacent content column and (b) sticks below the module top bar once the page scrolls onto it — never occluded, never clipped away. Two implementation constraints apply:

- The rail is `position: sticky` with `top` = top-bar height + 8px gap, `align-self: flex-start` inside a `display:flex; align-items:stretch` row, and a solid `--app-surface` background plus `z-index` so list content scrolls behind it rather than through it.
- Arco tabs kill sticky at three nested wrappers: `.arco-tabs` (`overflow:hidden; position:relative`), `.arco-tabs-content`, and `.arco-tabs-content-item-active`. A nav inside a tabbed panel needs `overflow: visible` restored on all three through `:deep()`. Inactive panes keep their own `height:0; overflow:hidden` clipping, so nothing bleeds through. The untabbed step page already relies on this nav, which is why its sticky rail worked before the tabbed config page did.
- Anchor jumps use `scroll-margin-top` equal to the same offset, so a jumped-to block is not hidden behind the bar.

## Accessibility and interaction states [Project]

Target WCAG 2.2 AA, subject to the project's accessibility owners: normal text at least 4.5:1, large text and meaningful non-text boundaries at least 3:1, with manual checks beyond automation.

### Measured contrast and resolutions [Project]

The ratios below describe selected Figma light-mode pairings. Passing ratios do not certify a whole page; failing ratios are **unresolved release issues**, except where the element is genuinely inactive and the applicable criterion exempts it. Keep the measured Figma colors in the source tables, and record any accessibility-driven implementation change as a project/design decision rather than attributing it to Figma.

**Passing — use freely**

| Pairing | Ratio |
|---|---|
| `Text-4 #666666` on `#FFFFFF` | 5.74:1 |
| `Text-5 #333333` on `#FFFFFF` | 12.63:1 |
| `Text-6 #1A1C20` on `#FFFFFF` | 17.06:1 |
| `Text-4 #666666` on page `#F7F8FA` | 5.40:1 |
| `Theme-6 #005BF5` on `#FFFFFF` | 5.50:1 |
| `Error #D40000` on `#FFFFFF` | 5.53:1 |
| White on primary `#005BF5` | 5.50:1 |
| White on primary-active `#0044CB` | 7.81:1 |
| White on danger `#D40000` | 5.53:1 |

**Failing or conditional — do not infer compliance from the default state**

| Pairing | Ratio | Resolution |
|---|---|---|
| `Text-3 #999999` on `#FFFFFF` | 2.85:1 | Figma records this color for placeholder/hint text, but a visible label does **not** exempt readable placeholder text from contrast. When the placeholder contains an example or instruction, use a tested text color such as `Text-4` and keep the visible label. Reserve the source value for genuinely non-informational ornament, not functional copy. |
| `Text-3 #999999` on `#F7F8FA` | 2.68:1 | Same issue on the page canvas; use a tested stronger text role for any readable content. |
| `Text-2 #CCCCCC` on `#FFFFFF` | 1.61:1 | **Disabled text only.** WCAG exempts disabled controls, so this is compliant — but disabled state must additionally be conveyed by `aria-disabled`/`disabled` and by non-color means. |
| `Success #00B42A` as text/icon on `#FFFFFF` | 2.78:1 | Fails ordinary text and a meaningful non-text icon/dot at the project's 3:1 target. Use a tested darker semantic role for meaning-bearing marks; a pale `light` tag with dark text is an alternative. Do not assume a green icon becomes compliant merely because words appear beside it. |
| `Warn #FF6B00` as text/icon on `#FFFFFF` | 2.86:1 | Same issue for warning text and meaningful marks. Choose a tested contrast-safe role or pair a sufficiently contrasting shape and label; check the actual surface. |
| White on primary-hover `#2D7EF7` | 3.86:1 | Figma specifies this button state, but a transient hover is **not** an AA exemption for its 14–16px label. Do not claim this state passes. Pending a design-approved accessible revision, keep the passing `Theme-6 #005BF5` fill and add a separately tested hover affordance on releasable screens; record that deviation. |
| White on emphasize-disabled `#B8DBFD` / `#F6BCB3` | 1.44:1 / 1.65:1 | Disabled exemption applies. **Mandatory companion rule:** a disabled button must carry the `disabled` attribute so assistive technology announces it, and where the reason is not obvious, a tooltip or adjacent text must state it. Never rely on the pale fill alone. |
| `Border-2 #FFE696` radio/checkbox accent | — | **Never the sole selection signal.** Selection must also be carried by the control's checked glyph and by the accessible checked state. |

**Standing rules**
- Status is never conveyed by color alone — every semantic color pairs with text, an icon, or a glyph.
- A functional color at `-6` is a palette role, not automatic permission to use it for text or a meaning-bearing icon; test each foreground/background pairing. `Error #D40000` and `Theme-6 #005BF5` pass against white in the measured examples.
- When a required pairing is not listed here, compute it before shipping; do not assume.

**Keyboard focus [Project, not specified by the Figma state matrices].** Preserve the source's selected, hover, and active states, but add a distinct `:focus-visible` treatment for keyboard operation. Start with a 2px outline and 2px offset using a semantic focus token; resolve its color per adjacent surface and theme so the indicator remains visible at the 3:1 non-text target. Do not rely on a hover fill, placeholder color, or box shadow alone. Test focus on buttons, inputs, menus, table actions, pagination, and overlays at normal and zoomed/reflow widths before calling the treatment accepted.

**Pointer targets [Project].** Keep the Figma visual size (for example, a 20px small Tag), but verify a 24×24 CSS px interactive target or an applicable spacing/equivalent-target exception for close icons, pagination arrows, compact row actions, and other pointer controls. The hit area is not necessarily the artwork size. Confirm that enlargement does not overlap adjacent controls or obstruct keyboard focus.

| State | Visible treatment | Recovery / acceptance |
|---|---|---|
| Initial | Title, scope, defaults, permission coherent | Direct load and reload restore a valid state |
| Hover / focus | Visible mouse and keyboard affordance | Predictable Tab order; help does not cover controls |
| Disabled / read-only | Distinct semantics and a discoverable reason | Not grey alone |
| Initial loading / partial refresh | Stable skeleton or local spinner | No large jump; a stale reply cannot win |
| Empty / no match | One of the eight sanctioned Empty states | Create or clear filters; an error is not an empty |
| Field error / request error | Local cause with the draft retained | Focus the first error; retry where safe; distinguish 401/403/404/5xx |
| Forbidden | 暂无权限, separate from no data | UI and API both deny, with a return or request-access path |
| Submitting / success | Loading, no duplicate submit, verified result | Announce success only after the server confirms |
| Cancel / close | Dirty-state decision | Mask, Escape, X, tab, and route share one policy |
| Long job | Progress, ID, result, retry | Result traceable after reload |

Give every input a visible label or programmatic name; associate help and error text; give icon-only buttons an action name; never make status color-only. Keyboard paths cover menu, search, pagination, date, bulk actions, and overlays; focus enters an overlay and returns to its trigger. Charts have text or table alternatives. Respect reduced-motion preferences for non-essential motion.

## Vue/Arco integration [Project]

`AGENTS.md` owns the Vue stack, bootstrapping, routing, domain state, request behaviour, and verification workflow. The current implementation lives in `src/app/providers.ts`, `src/design/tokens.css`, and `src/styles/global.css`; do not treat an older snippet in a design document as executable project setup. Map Metritag primitives to Arco once through the semantic layer in Colors, then inspect computed styles rather than assuming the override worked. Do not mutate internal component-service properties as a theme configuration shortcut.

Design review of the adapter covers medium controls (32px), 2px/4px radii, focus visibility, table header fill, disabled states, overlay shadows, and menu selection. A typecheck or build cannot establish those visual results. Use the domain PRD for field dictionaries, units, validation, permissions, time zone, and business-state rules.

### Component selection

| Task | Arco Vue choice | Boundary |
|---|---|---|
| Structured comparison and bulk operations | `a-table` | `a-list` for unstructured entries; `a-descriptions` for one read-only object |
| Input and validation | `a-form` + `a-form-item` | No hand-built label/error semantics |
| Short blocking choice | `a-modal` → Dialog spec | Drawer or route for long content |
| Low-risk inline confirmation | `a-popconfirm` → Popconfirm spec | Dialog for destructive or irreversible actions |
| Context-preserving detail/edit | `a-drawer` → Drawer spec (500/800/1000px) | Route for deep navigation or long workflows |
| Exclusive / multiple choice | `a-radio-group` / `a-checkbox-group` | Searchable `a-select` for large option sets |
| Immediate binary effect | `a-switch` | Staged form state for settings applied on Save |
| Hierarchy | `a-tree`, `a-tree-select`, `a-cascader` | Never invent hierarchy where none exists |
| Dates and time | `a-date-picker`, `a-time-picker` | Agree on precision and time zones first |
| Short help | `a-tooltip` → Tooltip spec (text only) | `a-popover` for rich help; critical rules stay visible |
| Transient / persistent / actionable feedback | `Message` / `a-alert` / `Notification` | Do not triple-report one failure |
| Data visualization | ECharts with the `metritag` theme | Accessible summary and keyboard values; add a visible table when data detail is required |

Reuse order: official component → project composition → domain component → approved deep customization. Require multiple use cases and a stable API before promoting a wrapper. No copied library source, `node_modules` patch, or broad `.arco-*` override.

**Unspecified component fallback [Project].** Figma has named pages and variants for the components inventoried under Source coverage, not every Arco control or every keyboard/async state. For an unlisted component or state, first use the nearest Metritag semantic token and the existing project pattern; retain Arco's accessible mechanics and default geometry only where no Metritag rule conflicts. Record the missing case and seek a design decision before promoting a new global token or claiming it is a Figma value. The `:focus-visible` contract above is such a project fallback, not a measured Figma variant.

### Form handoff [Project]

The module PRD owns each field's label, order, unit, defaults, required/read-only/permission state, null/empty semantics, validation and error copy, masking, and API/export meaning. Design specifies how labels, help, errors, loading, and disabled states appear; `AGENTS.md` owns Vue/Arco binding and request mechanics. The handoff must cover first-error focus, retained values after failure, duplicate-submit prevention, and unsaved changes across overlays and routes. A typed mock submission must not be announced as a backend-confirmed save. Avoid copying illustrative form code from a design specification into production.

### Operational boundary

`AGENTS.md` owns authorization, tenant isolation, request cancellation/idempotency, data mocking, code quality, and performance testing. This document owns the **visible** distinction among forbidden (`暂无权限`), empty (`暂无数据`), no-match, loading, failure, and confirmed success. Backend authorization remains final; visual hiding is not access control. Product copy defines how independently accessible previews disclose mock behaviour.

## Project defaults [Project]

The Figma source does not settle these product choices. **Pending** is not an approval or a universal default; apply the scope and gate in the first section before treating a row as a release promise.

| Decision | Default | Note |
|---|---|---|
| Minimum supported browser width | **Pending DS-04** | Figma states a **1280px minimum design canvas**, not a browser-support contract; approve the floor per route and verify zoom/reflow separately. |
| Maximum content growth for Figures 1/2 | **Fluid; no fixed cap specified** | The 2026-10-22 layout update supersedes the older cached 1920px content-freeze rule for these two page shells. |
| Mobile business routes | **Not committed** | The login route has a narrow-width fallback, but that is not a mobile support promise for tables, drawers, bulk actions, or long forms. Approve their strategy separately. |
| RTL | **Not supported** | No RTL locale is planned. Revisit only with an explicit requirement. |
| Multi-tenant | **Product/PRD decision pending** | If tenants exist, switching must invalidate prior views, selections, caches, and responses; do not infer tenancy from a design mockup. |
| Accessibility target | **WCAG 2.2 AA project goal** | DS-03 and the DS-04 reflow scope must close; failing Figma pairings are not accepted exceptions. |
| Theme | **Light default; dark implemented as a project extension** | Dark production scope is pending DS-05; system-following behaviour is not implemented. |
| Charting | **ECharts in the current dashboard** | Registered `metritag` / `metritag-dark` themes; not a Figma-specified library. |
| Density | **Default** | Per the measured 32px control height. A dense variant needs approval. |
| Time zone | **Declare explicitly per project** | Storage, transport, and display zones; range endpoints; DST. Not inferable. |

### Status roles and domain ownership [Project]

The design system owns how `success / warning / danger / neutral / info` **look** in light and dark themes. A module PRD and its domain code own each business enum, visible Chinese label, allowed transition, and role mapping. Do not force unrelated domains into one global enum dictionary or invent a display label from a color. `src/design/status.ts` currently contains four colour-named sample entries; it is not evidence that every product state has an approved mapping.

A legible text label is already a non-colour cue. Add an icon or shape when it helps scanning, distinguishes similar labels, or meets a specific accessibility need; do not require one for every Tag. Choose a contrast-safe variant for the actual surface: `Success #00B42A` and `Warn #FF6B00` fail as text on white, so use a tested pale-fill/dark-text or darker semantic treatment. An unmapped status must not become a blank cell: show a safe neutral fallback and expose the unmapped code to diagnostics without leaking sensitive values to end users.

Product owns field dictionaries, state machines, permissions, and the status-to-label mapping. Design owns role-to-appearance. Frontend owns the implementation and verifies the mapping with each domain's representative states.

## Acceptance

### Page specification template

Record per route: route name · Figma node/variant and source version · applicable layout pattern · product-owned field/state dictionary · design tokens and any approved deviation · measured Figma states versus project/PRD states · approved browser/theme scope · keyboard and pointer path · mock or API provenance · open DS gate IDs · evidence and acceptance owner. `AGENTS.md` separately specifies route, permission, request, and build checks.

### Release checklist

- [ ] Each applied rule links to a Figma node/version, an approved project extension, or a named PRD requirement; any source gap is scoped under DS-01.
- [ ] The semantic token table matches the computed styles on the affected route in light and, where supported, dark; DS-02 is closed. No page-local HEX silently overrides a shared role.
- [ ] Figma-measured geometry and states are checked separately from keyboard focus, loading, validation, empty, and failure states added by project/PRD rules. Exceptions name their owner and evidence.
- [ ] For Figure 1 / Figure 2 page shells, verify a 56px full-width header, fluid content with 16px outer margins, and, for Figure 2, a flush-left 205px sidebar with 16px between content modules. Do not use the old fixed 1200px column or the 240px navigation-component sample as the shell width.
- [ ] For a collapsible Pattern 2 sidebar, verify the 205px/64px states and their transition, the toggle's `aria-expanded` and 收起侧栏/展开侧栏 name, the icon-plus-tooltip fallback for hidden labels, the remembered state after refresh and direct child-route entry, and the ≤900px stacked fallback with the toggle hidden.
- [ ] For a Pattern 2 sidebar, measure the bottom edge against the viewport bottom in both the expanded and collapsed states, at the top of the page and after scrolling a long page to the end: the gap must be 0 in every case, and the sidebar must stay pinned rather than scroll away with the content.
- [ ] For a Pattern 2 sidebar with groups, verify at most one group is expanded at a time: initial load opens only the active page's group, activating a second group collapses the first, re-activating the open group closes it, and navigating into a child of a collapsed group moves the expansion there. Check `aria-expanded` on the group trigger matches what is visible.
- [ ] Every Pattern 2 sidebar comes from the shared sidebar component — a shell that hand-rolls its own is a defect, not a variant. Compare two shells side by side and confirm identical row height (40px), left inset (20px), icon (16px) and text (14px/22px) sizes, hover/active colours, 205/64px widths, 44px toggle and a 0px bottom gap; an action item (no route, no children) renders as a button that never takes the active state.
- [ ] Typography roles are not mixed: 16px/600/24 for every card, dialog, drawer, and section title, and no 20px panel title; panel content sits at a 16px inset with 12px below its title block. Shell business pages render no page title and no subtitle in the content area (2026-10-24 decision).
- [ ] Affected text, meaningful icons/borders, hover, focus, placeholder, and status states meet the accessibility target on their actual surfaces; DS-03 is closed. Small close/arrow/action targets meet the pointer-target rule or document its exception.
- [ ] The approved DS-04 route matrix is tested at its browser floor and the 1280/1440/1920px design references; claimed AA reflow is checked at 400% zoom / 320 CSS px equivalent. Table-only horizontal scrolling is scoped, and focused controls are not obscured by overlays or sticky footers.
- [ ] If dark mode is in scope, DS-05 is closed with state, contrast, overlay, chart, and first-paint evidence. Light-mode approval does not approve dark.
- [ ] Empty, no-match, failure, forbidden, and confirmed success are visually distinct with usable recovery; independently accessible mock previews do not masquerade as live backends.
- [ ] Charts, when present, expose metric, window, unit, refresh/latency, stable series meaning, keyboard-reachable values, and a visible table when precise comparison is required.
- [ ] Store desktop/narrow screenshots, measured contrast and hit-area results, keyboard path, open/closed gate IDs, reviewer, and date. Engineering route/build/API tests follow `AGENTS.md`; passing them alone is not design acceptance.

## Design change control [Project]

1. **Acquire** a complete Figma revision and record its file key, version, modified date, page/node IDs, and export completeness. A changed page title or a cached screenshot alone is not a token diff.
2. **Classify** each difference as Figma-stated, measured/derived, project extension, or module PRD; list impacted aliases, components, themes, routes, and accessibility pairings. Keep a migration/rollback note for renamed tokens and icon components.
3. **Decide** conflicting or missing cases with product, design, and accessibility owners. Record an exception's affected scope, reason, approver, date, and expiry/review point; no local CSS override becomes a silent global rule.
4. **Implement and verify** the one semantic token mapping, component states, keyboard/pointer paths, narrow and zoomed layout, and both approved themes. Close the relevant DS gates only with evidence; update this document and the code in the same reviewed change when the implementation contract changes.

## Source coverage

The cached Figma page index lists **37 pages**. The 28 named specification pages below were consulted, but the cached response is **not a complete export of every nested node**. A page appearing in this inventory proves its presence, not exhaustive coverage of all its variants. Do not claim 100% synchronization until the gaps in the evidence table are closed.

- **基础样式** — Colors 色彩 · Fonts 字体 · Effect Styles 效果样式
- **通用** — Layout 布局 · Navigation 导航 · Icon 图标 · Button 按钮 · Breadcrumb 面包屑 · Pagination 分页
- **数据录入** — Input 输入框 · Select 选择器 · Radio 单选框 · Checkbox 多选框 · DatePicker 日期选择器 · TimePicker 时间选择器 · Switch 开关
- **数据展示** — Table 表格 · Tag 标签 · Tooltip 文字提示 · Tree 树结构 · Descriptions 描述列表 · Empty 空状态 · Badge 徽标
- **消息提醒** — Dialog 对话框 · Alert 警告 · Message 全局提示 · Popconfirm 气泡确认框 · Drawer 抽屉
- **典型页面** — Landing Page 登陆页 (marked 进行中; recorded as non-binding)

Also consulted: 封面 (system name and cover version) and 更新日志 (changelog version). The six remaining pages are titled section dividers (`🎨 基础样式`, `🗒 通用`, `🗒 数据录入`, `🗒 数据展示`, `🗒 消息提醒`, `🗒 典型页面`); their titles do not establish component rules. The `🎨 基础样式` divider's subtree is not in the cached node files, so its contents are not asserted empty.

The cached page titles do not mark a page as deprecated or historical. Landing Page is explicitly `进行中`, so it is non-binding. The cover's `v0.1.0` and the changelog's `版本 1.0.0` conflict as release labels; design should identify the authoritative version before this document uses either as its own release number.

### Evidence and open coverage

| Cache scope | Verified state | Needed to close the gap |
|---|---|---|
| `/tmp/figsync/top.json` | Valid JSON with the 37-page index and source version/modified timestamp | Recheck against the live Figma file when declaring a later revision current |
| `/tmp/figsync/n_colors.json`, `n_fonts.json`, `n_effects.json` and most `nodes/pNN.json` | Valid node snapshots for the named foundations and component pages | Spot-check nested states and node/style IDs when a rule is changed |
| `/tmp/figsync/full.json` and `nodes/p22.json` (Table) | Truncated, invalid JSON; **not** full-file or full-Table evidence | Re-export a complete, parseable snapshot; reconcile against the valid `p22_d2.json` and `t22_*` partial Table extracts |
| `/tmp/figsync/variables_local.json` | API returned 403; variable inventory unavailable, including any dark-mode variables | Obtain authorized variable data and check the file's light/dark style modes before claiming a complete palette or its absence |

The cached node/style references are useful for measured examples, but do not prove that **only one** variable binding exists across the full Figma file. Do not treat a missing node in a truncated response as absence. Retain Figma's measured values where the evidence is clear; tag any unverified exactness as pending instead of replacing it with an Arco default.

`/tmp/figsync` is transient audit evidence, not a durable design repository. Preserve a complete, versioned export in an approved location before depending on these exact paths for a later release audit.

### Corrected interpretation of measured components

| Page | Earlier reading | Cache-backed interpretation |
|---|---|---|
| Select 选择器 | Menu option outer height 24px | `item/selectOption` and `item/multiOption` are 32px, or 39px with a divider; 22px is text line height |
| Pagination 分页 | `type=left/right` means whole-control alignment | It belongs to `item/page arrow btn` and means previous/next arrow direction |
| Layout 布局 (historical cache) | 64px side gutter around a fixed 1200px column | The old 1440px example centred 1200px with 120px side margins; 64px measured header height. **Superseded for the two page shells by Figures 1/2: 56px header, fluid content with 16px margin, and 205px flush-left sidebar in Figure 2.** |

### Defects found in the source

Recorded here so they are corrected upstream rather than silently absorbed. In every case this document carries the **measured** value.

| Page | Defect | Resolution here |
|---|---|---|
| Tag 标签 | Prose says heights are 「20、24、32」 for 大、中、小 — labels and numbers in opposite order | Measured: large 32 / medium 24 / small 20 |
| Tag · Tooltip · Badge | All three carry the **Table** component's description verbatim (copy-paste never replaced) | Purpose statements derived from measured variants and actual use |
| Radio 单选框 | Size sentence truncated mid-clause: 「宽度根据文本内容自适应（基于」 | Heights 40/32/24 and hug-width documented; unstated basis flagged |
| Input 输入框 | Variant values misspelled `naomal` / `narmal` 默认 | Documented as `normal 默认` |
| Dialog 对话框 | Theme value misspelled `iinfo 信息` | Documented as `info 信息` |
| Button 按钮 | Icon-type value cased `prefixicon` against `suffixIcon` | Documented as `prefixIcon` |
| DatePicker | An unnamed placeholder variant `类型=类型3` | Excluded; the six named types are documented |
| Navigation | `state 状态=collapsedMenu` appears as a state value rather than a structural axis | Documented structurally, as a flyout |

**Project extensions beyond the Figma source**, marked in place: the implemented dark theme mapping `[Project-Dark]`, accessibility resolutions and pending deviations, charting, the proposed icon distribution, project defaults, and Vue/Arco implementation contracts `[Project]`. Their presence in this document does not make them Figma-authored or automatically approved for every product.
