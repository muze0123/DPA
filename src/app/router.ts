import { createRouter, createWebHistory } from 'vue-router';
import { pendingNavigationItems } from './navigation';
import { defaultRuleVersionId, listRuleVersions } from '../modules/compliance/data/ruleVersions';

/** 最近已发布规则（深链 /rules/clauses 重定向目标；数据层为 mock，直接读即可） */
function latestPublishedRuleId(): string {
  const published = listRuleVersions().filter((version) => version.status === 'published');
  const latest = [...published].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return latest?.id ?? defaultRuleVersionId();
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/functions',
    },
    {
      path: '/functions',
      name: 'function-ledger',
      component: () => import('../modules/function-ledger/pages/FunctionLedgerPage.vue'),
      meta: { layout: 'product' },
    },
    {
      // 规则管理（2026-10-28）：原「标准条款」「判定规则」两个一级菜单合并为二级菜单，
      // 五个功能各自独立成页（原页签取消）；/rules 与 /standard 保留兼容重定向
      path: '/rules',
      redirect: '/rules/versions',
    },
    {
      // 规则版本：判定规则的版本化发布（草稿 / 已发布 / 已停用）
      path: '/rules/versions',
      name: 'rule-versions',
      component: () => import('../modules/compliance/pages/RuleVersionsPage.vue'),
      meta: { layout: 'product' },
    },
    {
      // 测试方法映射维护（2026-11-02 用户裁决：独立一级菜单）：条款 ↔ 第 9 章测试方法关联，
      // 本平台先行维护（依据 GB 44464 标准文档）；修改对后续新建规则生效
      path: '/rules/test-methods',
      name: 'rule-test-methods',
      component: () => import('../modules/compliance/pages/TestMethodsPage.vue'),
      meta: { layout: 'product' },
    },
    {
      // 新建规则（2026-11 子页面化）：?from=vX 从现有规则复制映射起步
      path: '/rules/versions/new',
      name: 'rule-version-new',
      component: () => import('../modules/compliance/pages/RuleVersionConfigPage.vue'),
      meta: { layout: 'product' },
    },
    {
      // 编辑规则（全部状态可原地编辑；已发布编辑保存即重新发布生效）
      path: '/rules/versions/:versionId/edit',
      name: 'rule-version-edit',
      component: () => import('../modules/compliance/pages/RuleVersionConfigPage.vue'),
      meta: { layout: 'product' },
    },
    {
      // 规则详情（2026-10-30 用户裁决）：基本信息 + 条款触发规则表（原「条款判定」页整体迁入）
      path: '/rules/versions/:versionId/detail',
      name: 'rule-version-detail',
      component: () => import('../modules/compliance/pages/RuleVersionDetailPage.vue'),
      meta: { layout: 'product' },
    },
    {
      // 条款判定已并入规则详情子页面（2026-10-30 用户裁决，菜单入口同步下线）：
      // 深链 ?clause=<条款号>（标准条款页、数据材料页仍会发出）转到最近已发布规则的详情页
      path: '/rules/clauses',
      redirect: (to) => ({ path: `/rules/versions/${latestPublishedRuleId()}/detail`, query: to.query }),
    },
    {
      // 数据材料（2026-11-01 用户裁决）：一级菜单收纳三个二级页。
      // 数据类型 = 15 类数据类型的定义与条款归属（原「条款数据明细」已并入「查看明细」抽屉）
      path: '/data-materials',
      redirect: '/data-materials/types',
    },
    {
      path: '/data-materials/types',
      name: 'data-materials-types',
      component: () => import('../modules/compliance/pages/DataTypesPage.vue'),
      meta: { layout: 'product' },
    },
    {
      // 数据字典与材料清单共用一页组件，视图由路由 props 决定（页面内无页签，2026-11-01 第二轮）
      path: '/data-materials/dictionary',
      name: 'data-materials-dictionary',
      component: () => import('../modules/dictionary/pages/DictionaryMaterialsPage.vue'),
      props: { tab: 'dictionary' },
      meta: { layout: 'product' },
    },
    {
      path: '/data-materials/materials',
      name: 'data-materials-materials',
      component: () => import('../modules/dictionary/pages/DictionaryMaterialsPage.vue'),
      props: { tab: 'materials' },
      meta: { layout: 'product' },
    },
    {
      // 兼容旧路径：数据类型原挂在规则管理下（2026-11-01 迁至数据材料，深链保留）
      path: '/rules/data-types',
      redirect: (to) => ({ path: '/data-materials/types', query: to.query }),
    },
    {
      // 兼容：条款数据明细已并入数据类型页的「操作 · 查看明细」弹窗（2026-10-28）
      path: '/rules/data-type-clauses',
      redirect: (to) => ({ path: '/data-materials/types', query: to.query }),
    },
    {
      // 标准条款：GB 44464 条文原文（只读）+ 补充说明
      path: '/rules/standard-clauses',
      name: 'rule-standard-clauses',
      component: () => import('../modules/compliance/pages/ClauseListPage.vue'),
      meta: { layout: 'product' },
    },
    {
      path: '/templates',
      name: 'templates',
      component: () => import('../modules/templates/pages/TemplatesPage.vue'),
      meta: { layout: 'product' },
    },
    {
      path: '/surveys',
      name: 'surveys',
      component: () => import('../modules/surveys/pages/SurveysPage.vue'),
      meta: { layout: 'product' },
    },
    {
      // 分区表单 · 表单配置（2026-11-01 第二轮用户裁决）：原页内「表单配置 / 填写记录」两个页签
      // 拆成两个二级菜单与两条独立路由，页面不再有页签；本页 = 表单列表 + 新建/编辑/发布/复制/删除。
      // 7 个分区页面的「表单版本 / 填写记录」页面与路由此前已下线（表单版本职能由表单配置承担）。
      path: '/sections/forms',
      name: 'section-forms',
      component: () => import('../modules/sections/pages/SectionFormsPage.vue'),
      meta: { layout: 'product' },
    },
    {
      // 分区表单 · 填写记录：一行 = 一个表单 × 一份任务/问卷（见 data/formRecords.ts）
      path: '/sections/records',
      name: 'section-records',
      component: () => import('../modules/sections/pages/SectionFormsPage.vue'),
      meta: { layout: 'product' },
    },
    {
      // 旧一级入口（/sections 带 ?tab=records）兜底到表单配置
      path: '/sections',
      redirect: () => ({ name: 'section-forms' }),
      meta: { layout: 'product' },
    },
    {
      path: '/sections/forms/new',
      name: 'section-forms-new',
      component: () => import('../modules/sections/pages/SectionFormEditPage.vue'),
      meta: { layout: 'product' },
    },
    {
      path: '/sections/forms/:formId/edit',
      name: 'section-forms-edit',
      component: () => import('../modules/sections/pages/SectionFormEditPage.vue'),
      meta: { layout: 'product' },
    },
    {
      // 旧分区页面 / 版本页 / 分区填写深链（2026-11-01 下线）：统一回表单配置，
      // 避免历史书签或演示链接落到空白页。更具体的 /sections 子路由先于本兜底匹配。
      path: '/sections/:pathMatch(.*)*',
      redirect: () => ({ name: 'section-forms' }),
      meta: { layout: 'product' },
    },
    {
      // 旧「数据传输分区填写」深链：回问卷工作区（分区填写入口统一在第 4 步）
      path: '/surveys/:id/sections/:sectionTaskId',
      redirect: (to) => ({ name: 'survey-detail', params: { id: String(to.params.id) } }),
      meta: { layout: 'product' },
    },
    {
      // 新建/复制问卷入口已随天枢任务下发口径移除（2026-10-30 用户裁决）：
      // 任务由天枢-任务中心创建并下发到本平台，本平台只承接执行，不再本地新建。
      // 问卷 A4 打印视图（F-EXP-04）：裸页承载，页眉含功能名与填写日期
      path: '/surveys/:id/print',
      name: 'survey-print',
      component: () => import('../modules/surveys/pages/SurveyPrintPage.vue'),
      meta: { layout: false },
    },
    {
      // 问卷详情（工作区容器）：无 step 深链时由页面归一到当前行动步
      path: '/surveys/:id',
      name: 'survey-detail',
      component: () => import('../modules/surveys/pages/SurveyDetailPage.vue'),
      meta: { layout: 'product' },
    },
    {
      // 工作区步骤路由：step 归一在页面内做（非法/该阶段不可进入 → 回当前行动步）
      path: '/surveys/:id/steps/:step(\\d+)',
      name: 'survey-detail-steps',
      component: () => import('../modules/surveys/pages/SurveyDetailPage.vue'),
      meta: { layout: 'product' },
    },
    {
      path: '/audit',
      name: 'audit',
      component: () => import('../modules/audit/pages/AuditManagementPage.vue'),
      meta: { layout: 'product' },
    },
    {
      // 兼容旧路径：/dicts 已并入数据材料分组（2026-11-01），按 ?tab= 分流到对应二级页
      path: '/dicts',
      redirect: (to) => {
        const query = { ...to.query };
        const tab = typeof query.tab === 'string' ? query.tab : '';
        delete query.tab;
        const path = tab === 'materials' || typeof to.query.clause === 'string'
          ? '/data-materials/materials'
          : '/data-materials/dictionary';
        return { path, query };
      },
    },
    ...pendingNavigationItems.map((item) => ({
      path: item.path,
      name: item.name,
      component: () => import('../modules/dashboard/pages/PendingModulePage.vue'),
      props: { labelKey: item.labelKey },
      meta: { layout: 'product' },
    })),
    {
      path: '/messages',
      name: 'messages',
      component: () => import('../modules/dashboard/pages/MessageCenterPage.vue'),
    },
    // 历史路径兼容
    {
      // 原「标准条款」一级菜单：旧 `?view=` 三段视图分别落到对应二级菜单
      path: '/standard',
      redirect: (to) => {
        const view = typeof to.query.view === 'string' ? to.query.view : '';
        const query = { ...to.query };
        delete query.view;
        const path = view === 'data-types' || view === 'data-type-clauses'
          ? '/data-materials/types'
          : '/rules/standard-clauses';
        return { path, query };
      },
    },
    { path: '/admin/audit', redirect: '/audit' },
    { path: '/login', redirect: '/functions' },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/functions',
    },
  ],
});

export default router;
