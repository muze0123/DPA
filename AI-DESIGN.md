# 麦唐 AI 设计入口

实现优先级为 **麦唐语义 Token（DESIGN.md） → Arco → 少量通用组合组件 → 已验证页面模式 → 简短 AI 入口 → 自动检查**。

## 每次页面任务

1. 运行 `pnpm design:context list`。按任务可选 `form`、`detail`、`confirmation`。读取返回的项目配置、组件源码和相关规范小节。实现细则按需查阅 `docs/FRONTEND-RULES.md`。
2. 从 `src/design/registry.json` 选择已有组件和页面模式。模块 PRD 决定字段、权限、业务流转和数据语义。
3. 使用 `src/design/tokens.core.json` 的语义变量。现有 `--app-*` 变量仍可使用。Arco 的交互能力通过项目 Token 适配。
4. 复用匹配的通用组件。表单组合接收业务状态，模块持有请求、校验和权限逻辑。
5. 完成后运行 `pnpm check`，依次执行类型、翻译、静态规则、回归测试、构建和浏览器模式验证。真实业务路由仍需验证本次新增行为。

## 固定约束

- 页面在现有 shell 内从筛选、工具栏或业务内容开始。
- 列表字段、表头、值和行内链接使用 400 字重。区域标题使用标题 Token。
- 布局间距、尺寸、字体和颜色优先引用 Token。适用值缺失时读取 DESIGN.md 的对应条款。
- 确认、提示、告警使用 `src/shared/components/ConfirmDialog.vue`。异步提交由调用方持有 visible/loading，成功后关闭，失败时保留输入并提供恢复操作。
- 编辑抽屉的关闭检查只在值发生变化时触发。具体业务关闭策略以对应项目规范为准。
- 字段标签传入无标点的翻译文案，`AppFieldLabel` 按项目配置和当前语言显示冒号。
- 每个新增 UI 文案同时提供 zh-CN 和 en-US。项目名、人员名、记录 ID 原样显示。
- 组件私有样式保持 scoped，主题与 Arco 适配集中维护。

## 规则与文件

| 文件 | 职责 |
| --- | --- |
| DESIGN.md | 已批准视觉与交互规则、来源、适用范围 |
| src/design/tokens.core.json | 三项目共用的基础几何与语义别名 |
| src/design/tokens.project.json | 项目主题、既有兼容变量和暗色扩展 |
| src/design/project.json | 品牌、字段标点等项目差异 |
| src/design/registry.json | 真实组件 API、模式、适用场景和证据位置 |
| src/design/patterns/README.md | 列表与编辑流程的组合方式和验证范围 |
| design-report/check.json | 当前扫描结果及存量问题明细 |
| design-report/browser.json | 最近一次浏览器运行的断言与截图位置 |

JSON 采用项目的 `metritag-css-tokens-v1` 格式。`pnpm design:tokens` 生成 CSS，`pnpm design:tokens:check` 检查生成物漂移。

规范更新时由已批准的设计变更驱动 JSON、组件和相应测试。`pnpm design:sync` 检查三项目公共实现是否一致，`pnpm design:sync -- --write` 从当前项目同步公共文件到配置的两个项目，再分别运行 Token 生成和验证。

## 浏览器环境

首次运行执行 `pnpm exec playwright install chromium`。`pnpm design:browser` 自动启动临时开发服务并在结束后清理，也可通过 DESIGN_BASE_URL 指向已有服务。截图以固定的 Playwright 版本和 Chromium 环境为基准。

## 验收边界

`design:check` 拦截新增静态违规，并保留 `legacy-baseline.json` 中的存量明细。`design:audit` 对全部存量也返回失败。基线修改需专项整改或明确审批，交付任务中不得扩大基线以消除失败。

静态检查覆盖颜色字面量、命令式确认框和部分页面标题形式。浏览器检查覆盖组件模式的尺寸、语言、主题和交互。业务路由仍需按任务验收，页面模式证据按 `registry.json` 中的路径查阅。
