<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import {
  IconCheck, IconClose, IconLanguage, IconList,
  IconNotification, IconSun,
} from '@arco-design/web-vue/es/icon';
import { navigationItems } from '../app/navigation';
import { useLocaleStore } from '../app/stores/locale';
import { useTaskCenterStore } from '../modules/task-center/stores/taskCenter';
import TaskCenterDrawer from '../modules/task-center/components/TaskCenterDrawer.vue';
import { setThemeMode, themeMode } from '../design/theme';
import GlobalAssistant from './GlobalAssistant.vue';
import tianhengLogo from '../assets/tianheng-logo.svg';

interface Notice {
  id: number;
  titleKey: string;
  detailKey: string;
  time: string;
}

const route = useRoute();
const localeStore = useLocaleStore();
const taskCenterStore = useTaskCenterStore();
const { t } = useI18n({ useScope: 'global' });
const themeOpen = ref(false);
const languageOpen = ref(false);
const taskTooltipVisible = ref(false);
const notificationsOpen = ref(false);
const navRef = ref<HTMLElement | null>(null);
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

function revealActiveNavigation() {
  nextTick(() => {
    const nav = navRef.value;
    const active = nav?.querySelector<HTMLElement>('a.active');
    if (!nav || !active) return;
    nav.scrollLeft = active.offsetLeft - nav.offsetLeft - (nav.clientWidth - active.clientWidth) / 2;
  });
}

/** 嵌套路由由父级记录保持一级导航高亮 */
function isNavigationActive(name: string) {
  return route.matched.some((record) => record.name === name);
}

onMounted(revealActiveNavigation);
watch([() => route.name, () => localeStore.locale], revealActiveNavigation);
</script>

<template>
  <a-layout class="default-layout">
    <a-layout-header class="default-layout-header">
      <div class="shell-leading">
        <router-link class="default-brand" to="/functions" :aria-label="t('ledger.title')">
          <span class="default-brand-mark" aria-hidden="true"><img :src="tianhengLogo" alt="" /></span>
          <strong>功能数据安全合规自评</strong>
        </router-link>
      </div>

      <nav ref="navRef" class="default-module-nav" :aria-label="t('shell.navigation')">
        <router-link v-for="item in navigationItems" :key="item.name" :to="item.path" :class="{ active: isNavigationActive(item.name) }">
          <component :is="item.icon" :size="18" />
          <span>{{ t(item.labelKey) }}</span>
        </router-link>
      </nav>

      <div class="shell-actions">
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
      </div>
    </a-layout-header>
    <a-layout-content class="default-layout-content"><slot /></a-layout-content>
    <GlobalAssistant />
    <TaskCenterDrawer />
  </a-layout>
</template>
