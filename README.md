# 功能数据安全合规自评平台

面向汽车行业的数据安全合规自评工作台，依据 **GB 44464** 标准，支持从功能台账维护、问卷任务执行、条款匹配审核，到证据收集与审计留痕的完整闭环。

---

## 目录

- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [功能模块](#功能模块)
- [问卷工作区七步流程](#问卷工作区七步流程)
- [项目结构](#项目结构)
- [路由与导航](#路由与导航)
- [国际化](#国际化)
- [测试](#测试)
- [构建与部署](#构建与部署)
- [开发规范](#开发规范)

---

## 项目概述

本平台是「天枢」合规体系的前端执行端，承接天枢任务中心下发的自评任务，负责：

- **功能台账**：维护车型/平台下的功能与子功能主数据（FuLi ID、master ECU、负责人等）
- **问卷执行**：七步式工作区驱动合规自评全流程——从题目作答、条款匹配，到分区填写、审批、证据导出
- **合规配置**：管理 GB 44464 标准条款、判定规则版本、数据类型与测试方法映射
- **数据支撑**：维护数据字典、材料清单，为自评提供口径依据
- **审计留痕**：只读检索全平台操作记录，支持按条件导出审计报告

> **注意**：当前版本使用本地 mock 数据驱动原型，尚未接入生产后端。用户与授权入口由天枢统一用户中心提供，本平台不独立管理账号。

---

## 技术栈

| 关注点 | 选型 |
|---|---|
| 框架 | Vue 3 · Composition API · `<script setup lang="ts">` |
| 语言与构建 | TypeScript 5 · Vite 6 |
| UI 组件库 | `@arco-design/web-vue` 2.58 |
| 图标 | Arco 官方图标（`@arco-design/web-vue/es/icon`） |
| 状态管理 | Pinia（共享状态）/ Vue 响应式（页面本地状态） |
| 路由 | Vue Router 4（History 模式） |
| 国际化 | Vue I18n 11（`zh-CN` 默认 / `en-US`） |
| 图表 | ECharts 6（按需加载，仅在第 7 步使用） |
| 数据处理 | ExcelJS 4（导出）· PapaParse 5（CSV 导入解析） |
| 时间处理 | Day.js |
| 包管理 | pnpm（workspace） |

---

## 快速开始

### 环境要求

- Node.js ≥ 18
- pnpm ≥ 9

### 安装与启动

```bash
# 安装依赖
pnpm install

# 启动开发服务器（绑定 0.0.0.0，支持反向代理访问）
pnpm dev
```

开发服务器默认监听 `http://127.0.0.1:5173`，首页自动重定向到 `/functions`（功能台账）。

### 常用命令

```bash
pnpm dev            # 启动开发服务
pnpm build          # 类型检查 + Vite 构建
pnpm preview        # 本地预览构建产物
pnpm typecheck      # 仅运行 vue-tsc 类型检查
pnpm verify         # 类型检查 + i18n 完整性检查（CI 用）

# i18n 工具
pnpm i18n:extract   # 导出翻译清单到 i18n-report/keys.csv
pnpm i18n:check     # 检查缺失/单边 key（缺失则退出码 1）
pnpm i18n:cjk       # 扫描模板内未走 t() 的硬编码中文

# 测试
node --test tests/*.test.mjs
```

---

## 功能模块

侧边栏导航顺序按「执行入口 → 业务对象 → 判定输入 → 填写端点 → 数据口径 → 装配规则 → 留痕治理」排列：

### 工作台（`/surveys`）

问卷任务的核心入口。列表视图分为「全部」「我负责」「我参与」三个视角，支持按状态、来源、关键字筛选。

- **任务来源**：当前支持天枢任务中心下发（`manual`）和 Excel 导入（`excel`）两种方式
- **任务状态**：`待处理 → 待提交 → 待填写 → 待确认 → 匹配审核中 → 分区填写中 → 分区审核中 → 已完成`
- **工作区**：七步式流程容器，各步骤是否可进入由当前阶段决定；支持 A4 打印视图（`/surveys/:id/print`）

### 功能台账（`/functions`）

维护车型功能主数据，是问卷身份的来源。

- 字段包括：FuLi ID、功能名称、平台名称、子功能与控制器、开发地、master ECU、负责人及部门、功能状态
- 支持**批量导入**（`.xlsx` / UTF-8 `.csv`，按 FuLi ID 更新已有功能）和**导出**
- 已关联问卷的功能禁止修改 FuLi ID 和删除
- 导入/导出任务在「任务中心—导入任务/下载任务」中查看进度

### 问卷问题（`/templates`）

维护用于自评的题集（问题库），是新建问卷时的选题来源。

- 题库状态：`draft → published → disabled`；只有已发布的库可被新建问卷选用
- 发布前可运行结构检查：阻断性错误（题号重复、规则绑定无效）阻止发布；警告（指引为空、条款未覆盖）不阻断
- 创建问卷时冻结题库快照（编号、名称、版本、题目、规则引用）
- 支持从当前规则版本导入题集，以及 Excel 批量导入/导出

### 分区表单（`/sections`）

分为两个二级菜单：

| 菜单 | 路由 | 说明 |
|---|---|---|
| 表单配置 | `/sections/forms` | 表单列表，支持新建/编辑/发布/复制/删除 |
| 填写记录 | `/sections/records` | 一行 = 一个表单 × 一份任务，记录分区填写历史 |

表单编辑页（`/sections/forms/new` 或 `/:formId/edit`）支持字段版本管理，内含多类分区（基础信息、匿名化、生物特征、传感器、材料、数据传输、同意书等）。

### 数据材料（`/data-materials`）

收纳三个二级菜单，维护数据口径与佐证材料目录：

| 菜单 | 路由 | 说明 |
|---|---|---|
| 数据类型 | `/data-materials/types` | 15 类数据类型的定义与条款归属 |
| 数据字典 | `/data-materials/dictionary` | 数据字典条目维护 |
| 材料清单 | `/data-materials/materials` | 佐证材料目录 |

### 测试方法（`/rules/test-methods`）

维护 GB 44464 标准条款与第 9 章测试方法之间的关联映射。在平台侧先行维护，规则配置选用标准库来源后自动回显对应测试方法。

### 规则配置（`/rules/versions`）

管理条款判定规则的版本化发布：

| 路由 | 说明 |
|---|---|
| `/rules/versions` | 规则版本列表（草稿 / 已发布 / 已停用） |
| `/rules/versions/new` | 新建规则（`?from=vX` 从现有规则复制映射起步） |
| `/rules/versions/:id/edit` | 编辑规则（已发布编辑保存即重新发布生效） |
| `/rules/versions/:id/detail` | 规则详情：基本信息 + 条款触发规则表 |
| `/rules/standard-clauses` | GB 44464 条文原文只读视图（菜单入口已隐藏，深链保留） |

### 审计管理（`/audit`）

全链路操作记录的只读检索与导出。支持按操作人、时间段、事件类型、来源模块、结果和关键字筛选，单条详情查看，以及按当前筛选导出审计报告（`.xlsx`）。

> 审计记录由各业务模块产生，本页不写入、不修改、不删除任何记录。

---

## 问卷工作区七步流程

工作区路由为 `/surveys/:id` 和 `/surveys/:id/steps/:n`，步骤是否可进入由阶段决定：

| 步骤 | 名称 | 核心内容 |
|---|---|---|
| 1 | 基础信息 | 主数据快照（功能 + 规则版本），只读；待处理/待提交阶段的行动步 |
| 2 | 逐题作答 | 三栏作答界面（题目 / 选项 / 说明），按规则快照逐题应答 |
| 3 | 条款匹配确认 | 条款 × 问题的映射确认，提交后进入匹配审核 |
| 4 | 填写分区 | 针对本次评估功能填写分区表单；匹配审批通过后的行动步 |
| 5 | 审批与看板 | 合规专员审批视图，展示审批链路和看板；匹配审核中的行动步 |
| 6 | 证据与导出 | 材料备料、证据补录、导出评估报告；从分区审核中起开放 |
| 7 | 完成度与收集 | 收集统计、排期提醒、全功能完成度看板（ECharts 按需加载） |

---

## 项目结构

```
src/
├── app/                    # 应用引导层
│   ├── App.vue
│   ├── main.ts
│   ├── router.ts           # 路由定义（含历史路径兼容重定向）
│   ├── navigation.ts       # 侧边栏菜单配置与排序
│   ├── i18n.ts             # 完整 i18n 消息字典（zh-CN + en-US）
│   ├── locale.ts           # 语言注册表、持久化、html lang 同步
│   ├── providers.ts        # 全局 provider 注册
│   └── stores/
│       ├── locale.ts       # 语言切换 store（唯一入口）
│       └── userProfile.ts  # 用户信息 store
│
├── layouts/
│   ├── ProductLayout.vue   # 主应用壳（顶栏 + 侧边栏 + 内容区）
│   ├── DefaultLayout.vue   # 无侧边栏布局
│   └── GlobalAssistant.vue # 全局智能助手浮层
│
├── design/
│   ├── tokens.css          # 设计令牌（CSS 自定义属性）
│   ├── theme.ts            # Arco 主题配置
│   ├── status.ts           # 通用状态色映射
│   └── charts/theme.ts     # ECharts 主题
│
├── shared/
│   ├── components/
│   │   └── ColumnSettingsPopover.vue   # 表格列设置通用组件
│   └── services/
│       └── exportGateway.ts            # 导出任务统一网关
│
├── styles/
│   └── global.css          # 全局样式（Arco 覆盖、通用工具类）
│
└── modules/                # 功能模块（按领域划分）
    ├── function-ledger/    # 功能台账
    ├── surveys/            # 工作台 & 问卷工作区
    ├── templates/          # 问卷问题（问题库）
    ├── sections/           # 分区表单
    ├── compliance/         # 规则配置 & 数据材料 & 测试方法
    ├── dictionary/         # 数据字典 & 材料清单
    ├── audit/              # 审计管理
    ├── dashboard/          # 消息中心 & 待建模块占位页
    └── task-center/        # 任务中心抽屉（导入/下载任务）

scripts/
└── i18n.mjs                # i18n 提取 / 校验 / CJK 巡检脚本

tests/                      # Node built-in test runner 测试套件
PRD/                        # 产品需求文档（问题库、审计管理）
```

每个 `modules/<feature>/` 下的标准结构：

```
pages/      # 路由页面组件（.vue）
components/ # 该模块的局部组件
data/       # 类型定义、mock 数据、业务逻辑（纯 TS）
stores/     # 模块级 Pinia store（如有）
styles/     # 模块局部样式（如有）
labels.ts   # 枚举 → 显示标签的映射函数（走 i18n）
```

---

## 路由与导航

路由使用 HTML5 History 模式，根路径 `/` 重定向到 `/functions`。

**历史路径兼容**：平台经历多轮导航重构，保留了若干重定向以兼容旧书签和深链：

| 旧路径 | 重定向目标 |
|---|---|
| `/standard` | `/rules/standard-clauses` 或 `/data-materials/types` |
| `/dicts` | `/data-materials/dictionary` 或 `/data-materials/materials` |
| `/rules/data-types` | `/data-materials/types` |
| `/rules/clauses` | `/rules/versions/:latestPublished/detail` |
| `/sections/:any` | `/sections/forms` |
| `/admin/audit` | `/audit` |

---

## 国际化

### 核心约定

语言切换**必须**通过 `useLocaleStore()`（`src/app/stores/locale.ts`），它统一处理持久化、`<html lang>` 属性、Arco 语言包加载和跨标签页同步。**不要**在组件内直接赋值 `i18n.global.locale`。

### 翻译边界

| 内容类型 | 是否走 i18n |
|---|---|
| 静态 UI 文案、按钮/选项文字、空状态/错误状态、无障碍名称 | ✅ zh-CN + en-US 各一条 key |
| 系统枚举（状态、优先级、动作类型等） | ✅ 存 code，用 `t(\`ns.${code}\`)` 渲染 |
| 固有名词：人名、项目名、任务名、FuLi ID、时间戳 | ❌ 原样渲染，不进字典 |
| 自由文本业务内容（描述、备注、任务内容） | 默认语言读记录本身；其他语言可用 `<ns>.records.<id>.<field>` 覆盖 |

### i18n 工具链

```bash
# 导出翻译清单供翻译团队使用
pnpm i18n:extract
# → i18n-report/keys.csv（key、两种语言、状态、代码引用）

# CI 质量门禁（缺失 key 或单边翻译 → 退出码 1）
pnpm i18n:check

# 扫描模板内硬编码中文（辅助人工判断边界）
pnpm i18n:cjk
```

`pnpm verify` = `vue-tsc --noEmit && i18n:check`，是提交前的完整校验入口。

---

## 测试

使用 **Node.js 内置 test runner**（无需额外安装），测试文件位于 `tests/`：

```bash
node --test tests/*.test.mjs
```

当前覆盖：

| 测试文件 | 覆盖内容 |
|---|---|
| `collection.test.mjs` | 工作台通用材料投影与完成度计算 |
| `compliance.test.mjs` | 合规规则匹配逻辑 |
| `materials.test.mjs` | 材料清单数据处理 |
| `matchingReview.test.mjs` | 条款匹配审核规则 |
| `dataTypes.test.mjs` | 数据类型定义与条款归属 |
| `anonymization.test.mjs` | 匿名化版本校验与保存 |
| `biometric.test.mjs` | 生物特征版本草稿校验 |
| `sensors.test.mjs` | 传感器版本与分区目录字段 |

当前通过：**48 / 48**。

---

## 构建与部署

```bash
# 构建生产产物（输出到 dist/）
pnpm build

# 本地预览构建产物
pnpm preview
```

Vite 配置（`vite.config.ts`）：
- 使用 `@arco-plugins/vite-vue` 实现 Arco 按需加载 CSS
- `server` 与 `preview` 均绑定 `0.0.0.0` 并放行任意 Host，以支持沙箱环境下的反向代理访问

**部署注意**：应用使用 HTML5 History 路由，Web 服务器需将所有未匹配路径回退到 `index.html`（Nginx `try_files $uri /index.html`）。

---

## 开发规范

完整规范见 `AGENTS.md`（与 `CLAUDE.md` 保持同步），以下是关键要点：

### 技术规范

- 所有页面使用 `<script setup lang="ts">`，props / emits / 业务数据结构均需 TypeScript 类型
- UI 组件优先使用 Arco Design，样式优先使用 `src/design/tokens.css` 中的 CSS 自定义属性
- 图标全部使用 Arco 官方图标，不用 emoji 作为界面图标
- 不在组件 template 或 computed 中写业务数据和副作用

### 文档授权边界

- **不自动更新 PRD**：业务行为变更不等于授权修改产品文档
- **不自动更新 DESIGN.md**：以它为真相来源，仅在用户明确要求时修改
- `AGENTS.md` 是首要规范来源；若 `CLAUDE.md` 与其冲突，以 `AGENTS.md` 为准

### 交付前检查

每次功能交付前需确认：

- [ ] 路由直链、刷新、前进/后退正常
- [ ] `zh-CN` 和 `en-US` 全量覆盖，语言切换实时生效
- [ ] 加载、空状态、错误、禁用等状态均已实现
- [ ] 桌面宽度与最小宽度下无溢出/截断/重叠
- [ ] `pnpm verify`（typecheck + i18n check）通过
- [ ] 相关测试通过，无 runtime 错误和 console 警告
