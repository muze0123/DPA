import type { Component } from 'vue';
import {
  IconDashboard, IconApps, IconBranch, IconCopy, IconFile, IconHistory, IconLink, IconOrderedList, IconStorage,
} from '@arco-design/web-vue/es/icon';

export interface NavigationChild {
  name: string;
  path: string;
  labelKey: string;
}

export interface NavigationItem {
  name: string;
  path: string;
  labelKey: string;
  icon: Component;
  children?: NavigationChild[];
}

/** 本系统左侧菜单；用户与授权入口由天枢统一用户中心提供。
 *  命名口径：任务执行入口称「任务管理」；配置类菜单仍沿用 2026-11-01 的业务对象名称。 */
export const navigationItems: NavigationItem[] = [
  { name: 'workbench', path: '/workbench', labelKey: 'workbench.title', icon: IconDashboard },
  // 功能台账（2026-11-01 第二轮：由「功能管理」改回原名）：功能 / 子功能 / 主 ECU 主数据，问卷身份来源
  { name: 'function-ledger', path: '/functions', labelKey: 'nav.ledger', icon: IconApps },
  { name: 'surveys', path: '/surveys', labelKey: 'nav.surveys', icon: IconFile },
  // 问卷问题（2026-11-01 第二轮：问题库 → 问题管理 → 问卷问题）：题面与选项维护，
  // 规则配置「触发条件」的原料；列名/计数里的「问题库」是对象名，不改
  { name: 'templates', path: '/templates', labelKey: 'nav.templates', icon: IconCopy },
  // 测试方法（2026-11-02 用户裁决：独立一级菜单）：条款 ↔ 第 9 章测试方法关联在本平台
  // 先行维护（依据 GB 44464 标准文档，天枢侧不维护）；规则配置选标准库来源后自动回显
  { name: 'rule-test-methods', path: '/rules/test-methods', labelKey: 'nav.testMethods', icon: IconLink },
  // 规则配置（2026-10-29 两轮更名：规则版本 → 条款规则 → 规则管理 → 2026-11-01 规则配置）：
  // 条款 × 问题的映射规则；条款判定已并入其「规则详情」子页面，一级菜单入口同步下线
  { name: 'rule-versions', path: '/rules/versions', labelKey: 'nav.ruleVersions', icon: IconBranch },
  // 数据材料（2026-11-01 第二轮：去掉「管理」后缀）：一级菜单，收纳数据类型 / 数据字典 /
  // 材料清单三个二级菜单。原「数据类型」一级入口与「数据材料」单页入口合并到本分组。
  // 与「功能台账」「问卷问题」的区别：这里维护数据口径（类型/字典）和佐证材料目录。
  {
    name: 'data-materials', path: '/data-materials/types', labelKey: 'nav.dataMaterials', icon: IconStorage,
    children: [
      { name: 'data-types', path: '/data-materials/types', labelKey: 'nav.dataTypes' },
      { name: 'data-dictionary', path: '/data-materials/dictionary', labelKey: 'nav.dataDictionary' },
      { name: 'material-list', path: '/data-materials/materials', labelKey: 'nav.materialList' },
    ],
  },
  // 「标准条款」入口已隐藏（2026-10-29 用户裁决）：条文改为调用「天枢」系统平台「标准库」数据。
  // 路由 /rules/standard-clauses 保留：数据类型页「查看条款」、条款判定页条文引用等深链仍直达该页。
  // 分区表单（2026-11-01 第二轮：表单管理 → 分区表单并升级为分组）：原页内两个页签拆成两个
  // 二级菜单——表单配置（列表 + 新建/编辑/发布）与填写记录（一行 = 一个表单 × 一份任务），
  // 各自独立路由，页面不再有页签。图标用 IconOrderedList：编号化的表单字段条目。
  {
    name: 'sections', path: '/sections/forms', labelKey: 'nav.sections', icon: IconOrderedList,
    children: [
      { name: 'section-forms', path: '/sections/forms', labelKey: 'nav.sectionForms' },
      { name: 'section-records', path: '/sections/records', labelKey: 'nav.sectionRecords' },
    ],
  },
  { name: 'audit', path: '/audit', labelKey: 'nav.audit', icon: IconHistory },
];

// 阅读顺序（2026-11-01 第三轮用户裁决：数据材料下移到分区表单之后）：按「执行入口 → 业务对象 →
// 判定输入 → 填写端点 → 数据口径与佐证 → 装配规则 → 留痕治理」排列；数据材料（数据类型 / 数据字典 /
// 材料清单）由「先定口径再答题」改为「填完再补口径与佐证」，与执行链路一致：问卷和分区表单是日常动作，
// 数据材料是按需核对的支撑资料。配置段内部仍「先原料、后配方」，规则配置收口在配置段末尾。
// 任务管理（默认落地页）、审计（只读、跨模块、事后）两端位置固定。
// 任务管理 → 功能台账 → 问卷问题 → 分区表单（表单配置/填写记录）→ 数据材料（数据类型/数据字典/材料清单）→ 测试方法 → 规则配置 → 审计管理
// 一句话读法：谁（功能）→ 问什么 → 填什么 → 用什么数据佐证 → 怎么判 → 谁改过。
const sidebarOrder = ['workbench', 'surveys', 'function-ledger', 'templates', 'sections', 'data-materials', 'rule-test-methods', 'rule-versions', 'audit'];
const sidebarRank = new Map(sidebarOrder.map((name, index) => [name, index]));
export const sidebarNavigationItems = [...navigationItems].sort((left, right) =>
  (sidebarRank.get(left.name) ?? sidebarOrder.length) - (sidebarRank.get(right.name) ?? sidebarOrder.length));

/** 保留原占位路由的直达能力，不再作为本系统菜单入口。 */
export const pendingNavigationItems: NavigationChild[] = [
  { name: 'accounts', path: '/accounts', labelKey: 'nav.accounts' },
  { name: 'grants', path: '/grants', labelKey: 'nav.grants' },
];
