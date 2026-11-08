# 麦唐设计系统落地记录

2026-11-07，功能数据安全合规自评。

实现优先级为麦唐语义 Token（DESIGN.md） → Arco → 少量通用组合组件 → 已验证页面模式 → 简短 AI 入口 → 自动检查。

## 已交付

- JSON 设计变量、格式 Schema、确定性 CSS 生成和漂移检查。保留项目品牌与字段标点差异，补齐蓝色项目 Arco 主色交互映射。
- 七项可查询组件，包括列表工具栏、分页、表单布局、字段标签、详情列表、确认框和既有列设置。
- 开发环境模式路由 `/__design-system`，展示完整的列表、状态、编辑与详情流程。生产构建去除该路由。
- 三项目审计页接入共享工具栏及确认组件。扫描发现的 63 处历史项已整改，各项目基线允许项均清零，原记录保存在 resolvedFindings 中。
- AGENTS.md 和 CLAUDE.md 精简为相同入口，详细契约保存在 docs/FRONTEND-RULES.md。按任务运行 design:context 获取相关源码与规范小节位置。
- 公共实现的跨项目漂移检查和显式同步命令。

## 已执行验证

| 项目 | 结果 |
| --- | --- |
| pnpm check | 通过，包含 verify、build 和 design:browser |
| 类型与 i18n | 通过，缺失键和占位符不一致为零 |
| 静态设计检查 | 新增与历史允许项均为零 |
| 规则回归测试 | 5 项通过 |
| 浏览器断言 | 83 项通过 |
| 截图比较 | 12 张与已检查基线一致 |
| 公共文件同步 | design:sync 检查一致 |

浏览器矩阵覆盖 375、900、1440 宽度，zh-CN / en-US，以及 light / dark。交互证据覆盖模式页筛选、分页、空数据、无匹配、加载、失败恢复、必填校验、500px 表单列、560px 确认框、未保存修改、保存、刷新与返回前进，以及真实审计路由筛选和导出取消。自评项目还检查材料编辑放弃、删除取消与存储失败保留记录。

证据位于 design-report/browser.json、design-report/check.json 和 design-baselines/review.json。截图在 design-report/screenshots 和 design-baselines 中。基线由 Codex 检查，使用 macOS arm64 和固定的 Playwright 1.65.0 环境。

## 维护入口

日常完整检查使用 `pnpm check`。首次配置浏览器执行 `pnpm exec playwright install chromium`。仅查询规范使用 `pnpm design:context list`，其他模式有 form、detail、confirmation。共同实现调整后执行 `pnpm design:sync`，授权同步使用 `node scripts/design-sync.mjs --write`，再逐项目运行完整检查。

## 当前边界

本次浏览器验收针对共享模式页、审计页及自评材料确认流程。其他历史业务路由的全部状态、Figma 缓存缺口、暗色对比度和原有 DS 发布门禁保留各自的验证要求。现有构建存在大于 500KB 的 chunk 提示。截图字节比较依赖一致的浏览器、操作系统、字体和缩放环境。入口文件体积缩减可直接核对，实际 Token 消耗仍需在真实任务中测量。
