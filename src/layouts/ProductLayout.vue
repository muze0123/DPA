<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  IconApps, IconCheck, IconClose, IconDown, IconFile, IconLanguage, IconList,
  IconMenuFold, IconMenuUnfold, IconMoon, IconNotification, IconSun, IconUp,
} from '@arco-design/web-vue/es/icon';
import { useLocaleStore } from '../app/stores/locale';
import { useUserProfileStore } from '../app/stores/userProfile';
import { sidebarNavigationItems, type NavigationItem } from '../app/navigation';
import { useTaskCenterStore } from '../modules/task-center/stores/taskCenter';
import { setThemeMode, themeMode } from '../design/theme';
import TaskCenterDrawer from '../modules/task-center/components/TaskCenterDrawer.vue';
import avatarPlaceholder from '../assets/user-avatar-placeholder.svg';

const { t } = useI18n();
const route = useRoute();
const localeStore = useLocaleStore();
const userProfileStore = useUserProfileStore();
const taskCenterStore = useTaskCenterStore();
const sidebarStorageKey = 'app-sidebar-collapsed:product';
const avatarLoadFailed = ref(false);
const avatarSrc = computed(() =>
  userProfileStore.profile.avatarUrl && !avatarLoadFailed.value
    ? userProfileStore.profile.avatarUrl
    : avatarPlaceholder,
);
watch(() => userProfileStore.profile.avatarUrl, () => { avatarLoadFailed.value = false; });

interface Notice {
  id: number;
  titleKey: string;
  detailKey: string;
  time: string;
}

const themeOpen = ref(false);
const languageOpen = ref(false);
const taskTooltipVisible = ref(false);
const notificationsOpen = ref(false);
const notices = ref<Notice[]>([
  { id: 1, titleKey: 'notices.system', detailKey: 'notices.license', time: '10:21' },
  { id: 2, titleKey: 'notices.overdue', detailKey: 'notices.overdueDetail', time: '09:48' },
  { id: 3, titleKey: 'notices.alert', detailKey: 'notices.alertDetail', time: '09:12' },
]);

function selectTheme(value: unknown) {
  if (value === 'light' || value === 'dark') setThemeMode(value);
  themeOpen.value = false;
}

function selectLocale(value: unknown) {
  localeStore.setLocale(value);
  languageOpen.value = false;
}

function readSidebarCollapsed() {
  try {
    return localStorage.getItem(sidebarStorageKey) === 'true';
  } catch {
    return false;
  }
}

const sidebarCollapsed = ref(readSidebarCollapsed());
const sidebarNav = ref<HTMLElement | null>(null);
const narrowViewport = ref(window.innerWidth <= 900);

/* 二级菜单分组（2026-10-28）：不再只服务「分区管理」，任一一级菜单带 children 即可展开，
   展开态按分组名独立保存；激活判定以路由路径前缀为准，跨层级别名路由单独列明。 */
type MenuGroup = (typeof sidebarNavigationItems)[number] & { children: NonNullable<NavigationItem['children']> };
const menuGroups = sidebarNavigationItems.filter((item): item is MenuGroup => Boolean(item.children?.length));

function isChildActive(child: MenuGroup['children'][number]) {
  return route.path === child.path || route.path.startsWith(`${child.path}/`);
}
function activeGroupName(): string | undefined {
  return menuGroups.find((group) => group.children.some((child) => isChildActive(child)))?.name;
}
const activeGroup = computed(() => activeGroupName());
const openGroups = ref<Record<string, boolean>>(Object.fromEntries(
  menuGroups.map((group) => [group.name, group.children.some((child) => isChildActive(child))]),
));
function groupVisible(name: string) {
  return Boolean(openGroups.value[name]) && (!sidebarCollapsed.value || narrowViewport.value);
}

function revealActiveNavigation() {
  if (!narrowViewport.value) return;
  void nextTick(() => {
    const nav = sidebarNav.value;
    const active = nav?.querySelector<HTMLElement>('.product-menu-child.is-active, .product-menu-link.is-active');
    if (nav && active) nav.scrollLeft = active.offsetLeft - nav.offsetLeft - (nav.clientWidth - active.clientWidth) / 2;
  });
}

watch(() => route.fullPath, () => {
  // 进入分组内任一页面时自动展开该分组（其余分组保持用户当下选择）；
  // 进入无二级菜单的一级页面时，不改动任何分组的展开态。
  const group = activeGroupName();
  if (group) openGroups.value = expandGroupExclusively(group);
  revealActiveNavigation();
});
watch([openGroups, sidebarCollapsed, narrowViewport], revealActiveNavigation);

function updateViewport() {
  narrowViewport.value = window.innerWidth <= 900;
  revealActiveNavigation();
}
onMounted(() => {
  window.addEventListener('resize', updateViewport);
  revealActiveNavigation();
});
onBeforeUnmount(() => window.removeEventListener('resize', updateViewport));

/* 手风琴语义（2026-10-29）：展开某个带二级菜单的一级菜单时，收起其余全部分组
   （同一时间至多一个分组展开）；点无二级菜单的一级菜单（router-link）不经过此处，
   各分组展开态保持不变。 */
function expandGroupExclusively(name: string): Record<string, boolean> {
  return Object.fromEntries(menuGroups.map((group) => [group.name, group.name === name]));
}

function toggleGroup(name: string) {
  if (sidebarCollapsed.value && !narrowViewport.value) {
    // 收起态只能看到图标：点分组先展开侧栏，再展开该分组（其余分组收起）
    sidebarCollapsed.value = false;
    openGroups.value = expandGroupExclusively(name);
    persistSidebar();
  } else if (openGroups.value[name]) {
    openGroups.value = { ...openGroups.value, [name]: false };
  } else {
    openGroups.value = expandGroupExclusively(name);
  }
}

function persistSidebar() {
  try {
    localStorage.setItem(sidebarStorageKey, String(sidebarCollapsed.value));
  } catch {
    // Keep the choice for this session when browser storage is unavailable.
  }
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  persistSidebar();
}
</script>

<template>
  <div class="product-shell">
    <header class="product-header">
      <router-link class="product-brand" to="/workbench" aria-label="功能数据安全合规自评">
        <span class="product-mark" aria-hidden="true"><IconApps :size="21" /></span>
        <strong>功能数据安全合规自评</strong>
      </router-link>
      <div class="product-tools">
        <a-dropdown v-model:popup-visible="themeOpen" trigger="hover" position="br" @select="selectTheme">
          <button class="shell-icon-button" type="button" :aria-label="t('shell.theme')" @click="themeOpen = true">
            <IconMoon v-if="themeMode === 'dark'" :size="19" /><IconSun v-else :size="19" />
          </button>
          <template #content>
            <a-doption value="light" :class="{ 'shell-option-selected': themeMode === 'light' }">
              {{ t('shell.light') }}<IconCheck v-if="themeMode === 'light'" class="shell-option-check" />
            </a-doption>
            <a-doption value="dark" :class="{ 'shell-option-selected': themeMode === 'dark' }">
              {{ t('shell.dark') }}<IconCheck v-if="themeMode === 'dark'" class="shell-option-check" />
            </a-doption>
          </template>
        </a-dropdown>

        <a-dropdown v-model:popup-visible="languageOpen" trigger="hover" position="br" @select="selectLocale">
          <button class="shell-icon-button" type="button" :aria-label="t('shell.language')" @click="languageOpen = true">
            <IconLanguage :size="19" />
          </button>
          <template #content>
            <a-doption
              v-for="option in localeStore.options"
              :key="option.code"
              :value="option.code"
              :class="{ 'shell-option-selected': localeStore.locale === option.code }"
            >
              {{ t(option.labelKey) }}<IconCheck v-if="localeStore.locale === option.code" class="shell-option-check" />
            </a-doption>
          </template>
        </a-dropdown>

        <a-tooltip v-model:popup-visible="taskTooltipVisible" :content="t('taskCenter.title')" position="bottom" content-class="app-tooltip-light" arrow-class="app-tooltip-light-arrow">
          <button
            class="shell-icon-button shell-task-trigger"
            type="button"
            :aria-label="t('taskCenter.title')"
            @focus="taskTooltipVisible = true"
            @blur="taskTooltipVisible = false"
            @click="taskTooltipVisible = false; taskCenterStore.open()"
          >
            <IconList :size="19" />
            <span
              v-if="taskCenterStore.processingCount > 0"
              class="shell-task-badge"
              aria-hidden="true"
            >{{ taskCenterStore.processingCount > 99 ? '99+' : taskCenterStore.processingCount }}</span>
          </button>
        </a-tooltip>

        <a-popover v-model:popup-visible="notificationsOpen" trigger="hover" position="br" content-class="shell-notifications-popover" arrow-class="shell-notifications-arrow">
          <button class="shell-icon-button shell-notice-trigger" type="button" :aria-label="t('shell.notifications')" @click="notificationsOpen = true">
            <IconNotification :size="19" /><span v-if="notices.length" class="shell-unread-dot" aria-hidden="true" />
          </button>
          <template #content>
            <section class="shell-notifications" :aria-label="t('shell.notifications')">
              <p v-if="!notices.length" class="shell-notification-empty">{{ t('shell.noNotifications') }}</p>
              <article v-for="notice in notices" :key="notice.id" class="shell-notification">
                <span class="shell-notification-dot" aria-hidden="true" />
                <div class="shell-notification-body">
                  <div class="shell-notification-heading"><strong>{{ t(notice.titleKey) }}</strong><time>{{ notice.time }}</time></div>
                  <p>{{ t(notice.detailKey) }}</p>
                </div>
                <button type="button" class="shell-dismiss" :aria-label="`${t('shell.dismiss')}: ${t(notice.titleKey)}`" @click="notices = notices.filter((item) => item.id !== notice.id)">
                  <IconClose :size="15" />
                </button>
              </article>
            </section>
          </template>
        </a-popover>

        <span class="product-account">
          <a-avatar :size="28" :auto-fix-font-size="false">
            <img :src="avatarSrc" alt="" @error="avatarLoadFailed = true" />
          </a-avatar>
          <span>{{ userProfileStore.profile.displayName }}</span>
        </span>
      </div>
    </header>
    <div class="product-body">
      <aside class="product-sidebar" :class="{ 'is-collapsed': sidebarCollapsed }" :aria-label="t('ledger.navigation')">
        <nav ref="sidebarNav">
          <template v-for="item in sidebarNavigationItems" :key="item.name">
            <div v-if="item.children" class="product-menu-group">
              <button
                type="button"
                class="product-menu-link product-menu-group-trigger"
                :class="{ 'is-group-active': activeGroup === item.name }"
                :aria-label="sidebarCollapsed && !narrowViewport ? t(item.labelKey) : undefined"
                :aria-expanded="groupVisible(item.name)"
                :aria-controls="`product-menu-${item.name}`"
                :title="t(item.labelKey)"
                @click="toggleGroup(item.name)"
              >
                <component :is="item.icon" :size="16" />
                <span class="product-menu-label">{{ t(item.labelKey) }}</span>
                <IconDown class="product-menu-caret" :class="{ 'is-open': groupVisible(item.name) }" :size="14" />
              </button>
              <div
                :id="`product-menu-${item.name}`"
                class="product-menu-children"
                :class="{ 'is-open': groupVisible(item.name) }"
              >
                <div class="product-menu-children-inner">
                  <router-link
                    v-for="child in item.children"
                    :key="child.name"
                    :to="child.path"
                    class="product-menu-link product-menu-child"
                    :class="{ 'is-active': isChildActive(child) }"
                    active-class="is-active"
                    :aria-current="isChildActive(child) ? 'page' : undefined"
                    :title="t(child.labelKey)"
                  >{{ t(child.labelKey) }}</router-link>
                </div>
              </div>
            </div>
            <router-link
              v-else
              :to="item.path"
              class="product-menu-link"
              active-class="is-active"
              :aria-label="sidebarCollapsed ? t(item.labelKey) : undefined"
              :title="t(item.labelKey)"
            >
              <component :is="item.icon" :size="16" /><span class="product-menu-label">{{ t(item.labelKey) }}</span>
            </router-link>
          </template>
        </nav>
        <button
          class="product-sidebar-toggle"
          type="button"
          :aria-expanded="!sidebarCollapsed"
          :aria-label="t(sidebarCollapsed ? 'ledger.expandSidebar' : 'ledger.collapseSidebar')"
          :title="t(sidebarCollapsed ? 'ledger.expandSidebar' : 'ledger.collapseSidebar')"
          @click="toggleSidebar"
        >
          <IconMenuUnfold v-if="sidebarCollapsed" :size="18" />
          <IconMenuFold v-else :size="18" />
          <span class="product-toggle-label">{{ t(sidebarCollapsed ? 'ledger.expandSidebar' : 'ledger.collapseSidebar') }}</span>
        </button>
      </aside>
      <main class="product-main"><slot /></main>
    </div>
    <TaskCenterDrawer />
  </div>
</template>

<style scoped>
/* 天枢同构布局（顶部导航 + 左侧菜单 + 右侧内容区）：header 以下整体为 Fill-1 灰画布
   （--app-page），侧栏为贴左满高的白色 div，内容区与侧栏/导航栏/右缘/底部各留 16px。
   页面根节点即白色业务面板，直接铺满内容区。 */
.product-shell { min-height: 100vh; padding-top: 56px; background: var(--app-page); color: var(--color-text-1); }
.product-header { position: fixed; inset: 0 0 auto; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 20px; height: 56px; padding: 0 16px; background: var(--app-surface); box-shadow: var(--app-shadow-4); }
.product-brand { display: inline-flex; align-items: center; min-width: 0; gap: 10px; color: var(--color-text-1); text-decoration: none; white-space: nowrap; }
.product-brand strong { overflow: hidden; font-size: 16px; font-weight: 600; text-overflow: ellipsis; }
.product-mark { display: grid; flex: 0 0 32px; width: 32px; height: 32px; place-items: center; border-radius: 4px; color: var(--app-accent); border: 1px solid var(--app-divider); background: var(--app-surface); }
.product-account { display: inline-flex; align-items: center; flex: none; gap: 8px; font-size: 14px; }
.product-tools { display: inline-flex; align-items: center; gap: 10px; }
.product-account :deep(.arco-avatar) { flex: none; background: var(--color-fill-2); }
.product-account :deep(.arco-avatar img) { display: block; width: 100%; height: 100%; object-fit: cover; }
/* 固定侧栏不参与文档流，内容区自行保留 16px 画布间距。 */
.product-body { display: flex; align-items: flex-start; min-height: calc(100vh - 56px); padding: 0 16px 0 0; }
.product-sidebar { position: fixed; top: 56px; bottom: 0; left: 0; z-index: 10; display: flex; flex-direction: column; width: 205px; height: calc(100dvh - 56px); padding: 16px 8px 0; background: var(--app-surface); transition: width 200ms ease; }
.product-sidebar.is-collapsed { width: 64px; }
.product-sidebar > nav { flex: 1; min-height: 0; overflow-y: auto; }
.product-menu-link { display: flex; align-items: center; width: 100%; min-height: 40px; gap: 10px; padding: 8px 12px; border: 0; border-radius: 4px; color: var(--color-text-2); background: transparent; text-decoration: none; text-align: left; cursor: pointer; font: inherit; font-size: 14px; line-height: 20px; }
.product-menu-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.product-menu-link :deep(svg) { flex: none; }
.product-menu-link:hover, .product-sidebar-toggle:hover { background: var(--color-fill-2); }
.product-menu-link:focus-visible, .product-sidebar-toggle:focus-visible { outline: 2px solid var(--app-accent); outline-offset: -2px; }
.product-menu-link.is-active { color: var(--app-accent); background: var(--color-primary-light-1); font-weight: 600; }
.product-menu-group-trigger.is-group-active { color: var(--app-accent); font-weight: 600; }
.product-menu-caret { margin-left: auto; transition: transform 200ms ease; }
.product-menu-caret.is-open { transform: rotate(180deg); }
/* 分组二级菜单：常驻容器 + grid-rows 高度过渡——展开/收起线性滑动，收起时向上收拢。
   visibility 延迟到收起动画结束后再隐藏，保证键盘焦点不会落在已收起的链接上。 */
.product-menu-children { display: grid; visibility: hidden; grid-template-rows: 0fr; transition: grid-template-rows 200ms linear, visibility 0s linear 200ms; }
.product-menu-children.is-open { visibility: visible; grid-template-rows: 1fr; transition: grid-template-rows 200ms linear; }
.product-menu-children-inner { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.product-menu-child { padding-left: 44px; }
.product-sidebar.is-collapsed .product-menu-link { justify-content: center; padding: 0; }
.product-sidebar.is-collapsed .product-menu-caret { display: none; }
.product-sidebar.is-collapsed .product-menu-label, .product-sidebar.is-collapsed .product-toggle-label { display: none; }
.product-sidebar-toggle { display: flex; flex: none; align-items: center; width: 100%; height: 44px; gap: 10px; padding: 0 12px; border: 0; border-top: 1px solid var(--app-divider); background: transparent; color: var(--color-text-2); font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
.product-sidebar.is-collapsed .product-sidebar-toggle { justify-content: center; padding: 0; }
/* 内容区与侧栏保持 16px 间距，侧栏收起时跟随让出宽度。 */
.product-main { flex: 1; min-width: 0; margin-left: 221px; padding-top: 16px; margin-bottom: 16px; }
.product-sidebar.is-collapsed + .product-main { margin-left: 80px; }
@media (max-width: 900px) {
  /* 窄屏改为文档流中的横向菜单，正文不再预留左侧宽度。 */
  .product-body { flex-direction: column; align-items: stretch; gap: 0; padding: 16px; }
  .product-main, .product-sidebar.is-collapsed + .product-main { margin-left: 0; margin-bottom: 0; padding-top: 16px; }
  .product-sidebar, .product-sidebar.is-collapsed { position: static; z-index: auto; flex: none; width: 100%; height: auto; margin-bottom: 16px; padding: 8px 16px; border-bottom: 1px solid var(--app-divider); }
  .product-sidebar > nav { display: flex; gap: 8px; overflow-x: auto; }
  .product-sidebar > nav > .product-menu-link, .product-sidebar > nav > .product-menu-group { flex: 0 0 auto; width: auto; white-space: nowrap; }
  .product-menu-group { display: flex; flex-direction: column; align-items: flex-start; gap: 0; }
  .product-menu-children-inner { flex-direction: row; align-items: center; gap: 8px; }
  .product-menu-group-trigger { flex: 0 0 auto; width: auto; }
  .product-menu-child { width: auto; padding: 0 12px; }
  .product-sidebar.is-collapsed .product-menu-link { justify-content: flex-start; padding: 0 12px; }
  .product-sidebar.is-collapsed .product-menu-caret { display: block; }
  .product-sidebar.is-collapsed .product-menu-label { display: inline; }
  .product-sidebar-toggle { display: none; }
}
@media (max-width: 760px) {
  .product-brand strong { max-width: 48vw; }
}
@media (prefers-reduced-motion: reduce) {
  .product-sidebar, .product-menu-caret, .product-menu-children { transition: none; }
}
</style>
