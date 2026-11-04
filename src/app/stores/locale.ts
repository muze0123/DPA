import { computed } from 'vue';
import { defineStore } from 'pinia';
import enUS from '@arco-design/web-vue/es/locale/lang/en-us';
import zhCN from '@arco-design/web-vue/es/locale/lang/zh-cn';
import i18n from '../i18n';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_KEY,
  isAppLocale,
  localeOption,
  writeStoredLocale,
  type AppLocale,
} from '../locale';

/** Arco 组件库自己的语言包，和 vue-i18n 的语言一一对应 */
const ARCO_LOCALES = {
  'zh-CN': zhCN,
  'en-US': enUS,
} as const;

interface ApplyOptions {
  /** 是否写 localStorage。跨标签页跟读时传 false，避免两端反复回写 */
  persist?: boolean;
}

/**
 * 语言切换的全局状态。
 *
 * 关键设计：**vue-i18n 的 i18n.global.locale 是唯一真相来源**，这个 store 只是它的
 * 读写门面 + 副作用收口（持久化 / <html lang> / Arco 语言包），不再另存一份 ref。
 * 因此页面里既可以直接用 useI18n().locale，也可以用 localeStore.locale，两者永远同步。
 */
export const useLocaleStore = defineStore('locale', () => {
  /** 当前语言。set 走统一入口，非法值不会到达 i18n */
  const locale = computed<AppLocale>({
    get: () => {
      const active = i18n.global.locale.value;
      return isAppLocale(active) ? active : DEFAULT_LOCALE;
    },
    set: (next) => apply(next),
  });

  /** 当前语言的完整描述（文案 key、html lang），菜单渲染与 <html lang> 都用它 */
  const current = computed(() => localeOption(locale.value));
  const isEnglish = computed(() => locale.value === 'en-US');
  const arcoLocale = computed(() => ARCO_LOCALES[locale.value]);
  const options = LOCALES;

  function syncDocumentLang(next: AppLocale) {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = localeOption(next).htmlLang;
  }

  function apply(next: AppLocale, { persist = true }: ApplyOptions = {}) {
    // 相同时不赋值，避免无谓地触发所有依赖 locale 的 watch（图表重绘等）
    if (i18n.global.locale.value !== next) i18n.global.locale.value = next;
    syncDocumentLang(next);
    if (persist) writeStoredLocale(next);
  }

  /**
   * 对外唯一入口。收到下拉框 / URL 参数 / 存储里的任意脏值都只是返回 false，
   * 不会把 i18n 和 localStorage 弄成不合法的状态。
   */
  function setLocale(next: unknown, applyOptions?: ApplyOptions): boolean {
    if (!isAppLocale(next)) return false;
    apply(next, applyOptions);
    return true;
  }

  function toggleLocale(): boolean {
    return setLocale(isEnglish.value ? 'zh-CN' : 'en-US');
  }

  function resetLocale(): boolean {
    return setLocale(DEFAULT_LOCALE);
  }

  /**
   * 多标签页同步：一个标签页切了语言，其它标签页跟着切。
   * 只跟读不回写，否则两个标签页会互相触发。
   */
  function startStorageSync() {
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', (event) => {
      if (event.key !== LOCALE_KEY || !isAppLocale(event.newValue)) return;
      apply(event.newValue, { persist: false });
    });
  }

  // 首次使用时对齐一次 <html lang>，避免刷新后 lang 与已保存的语言不一致
  syncDocumentLang(locale.value);
  startStorageSync();

  return { locale, current, isEnglish, arcoLocale, options, setLocale, toggleLocale, resetLocale };
});
