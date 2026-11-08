# 麦唐页面模式

开发环境访问 `/__design-system`，页面使用当前项目的 Vue Router、Pinia、I18n、Arco 配置和产品 shell。生产构建通过 `import.meta.env.DEV` 去除该路由。

## 列表模式

筛选区和列表区作为同级区域，区域间距使用 `--mt-ds-space-4`。筛选字段使用 `AppFieldLabel` 的 filter 上下文。分页使用 `AppPagination` 固定总数、条数、页码和跳转顺序。工具栏使用 `AppListToolbar`，标题、总数、操作区自动换行，业务按钮放入 actions 插槽。

模块持有筛选、分页、排序、加载和失败状态。示例包含 18 条记录、关键词筛选、分页、空数据、无匹配、加载和失败恢复。实际业务接口决定请求策略与权限。

三个项目的审计页已接入共享工具栏。既有审计业务流程继续在模块内维护。

## 表单和详情模式

`AppFormLayout` 提供 500px 且随容器收缩的字段列。内部 `a-form` 使用 vertical 布局，模块传入 model 和 rules。`#label` 使用 `AppFieldLabel`，Arco required 负责必填星号。详情字段用 `AppDetailList`。

示例展示必填校验、保留输入、本地模拟保存、未修改直接关闭、修改后确认丢弃、取消丢弃继续编辑。真实业务提交需要按模块契约实现加载、失败恢复和重复提交保护。

## 确认框 API

`ConfirmDialog` 接收 `v-model:visible`、title、description、icon、okLoading、dismissible、single 和按钮文案，触发 confirm。确认事件由业务处理，组件保持打开直至调用方更新 visible。异步处理中传 `okLoading=true` 和 `dismissible=false`，结束后恢复。

## 验证

运行 `pnpm design:browser`，结果保存到 `design-report/browser.json`。截图目录包含当前项目的浏览器参考图。`design-baselines` 保存经过检查的初始基线，正常运行会比较截图字节，差异返回失败。视觉变化经过确认后使用 `pnpm design:browser -- --update-baselines` 更新并重新检查截图。页面结构、Token、组件 API 或业务规则变化后重新验证。

`design:browser` 同时执行计算样式、用户交互和截图比较。截图字节比较要求一致的操作系统、浏览器、字体和缩放环境，跨环境应独立建立基线。状态、焦点和主题的断言覆盖范围列在测试脚本及运行报告中。
