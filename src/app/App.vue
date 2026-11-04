<script setup lang="ts">
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import ProductLayout from '../layouts/ProductLayout.vue';
import { applyTheme, themeMode } from '../design/theme';
import { useLocaleStore } from './stores/locale';

const route = useRoute();
// 语言持久化、<html lang>、跨标签页同步都收在 store 里，这里只消费结果
const localeStore = useLocaleStore();
watch(themeMode, applyTheme, { immediate: true });

/** 左侧菜单壳子（ProductLayout）承载全部业务路由；其余走顶部导航壳子（DefaultLayout） */
</script>

<template>
  <a-config-provider
    :locale="localeStore.arcoLocale"
    size="medium"
  >
    <router-view v-slot="{ Component }">
      <component :is="route.meta.layout === false ? Component : route.meta.layout === 'product' ? ProductLayout : DefaultLayout">
        <component v-if="route.meta.layout !== false" :is="Component" />
      </component>
    </router-view>
  </a-config-provider>
</template>
