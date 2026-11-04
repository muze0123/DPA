/**
 * 语言的唯一注册表 + 持久化读写。
 *
 * 这里刻意不依赖 vue-i18n、也不依赖 pinia：
 * - src/app/i18n.ts 在应用启动最早期就要读它（决定 createI18n 的初始 locale）；
 * - src/app/stores/locale.ts 在使用时也要读它。
 * 两边共用同一份校验逻辑，才不会出现"i18n 认这种语言、store 不认"的漂移。
 *
 * 加一门语言 = 在这个数组里加一行 + 补 shell.<lang> 文案，其它地方不用改。
 */

export const LOCALE_KEY = 'app-locale';

export interface LocaleOption {
  /** BCP 47 语言标记，同时就是持久化存进 localStorage 的值 */
  code: 'zh-CN' | 'en-US';
  /** 语言菜单里的文案 key —— 语言名本身也要能翻译 */
  labelKey: string;
  /** 写进 <html lang> 的值，影响屏幕阅读器发音与浏览器断字规则 */
  htmlLang: string;
}

export const LOCALES = [
  { code: 'zh-CN', labelKey: 'shell.chinese', htmlLang: 'zh-CN' },
  { code: 'en-US', labelKey: 'shell.english', htmlLang: 'en-US' },
] as const satisfies readonly LocaleOption[];

/** 当前支持的语言，从 LOCALES 推导，不手写第二份 */
export type AppLocale = (typeof LOCALES)[number]['code'];

/** 兜底语言：也是未登录 / 存储不可用时的默认语言 */
export const DEFAULT_LOCALE: AppLocale = 'zh-CN';

export const SUPPORTED_LOCALES: readonly AppLocale[] = LOCALES.map((item) => item.code);

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function localeOption(code: AppLocale): LocaleOption {
  return LOCALES.find((item) => item.code === code) ?? LOCALES[0];
}

/** localStorage 在隐私模式 / 被禁用时会抛错，统一在这里收口 */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * 读持久化的语言。任何脏值（旧版本遗留、人为改坏、非支持语言）都退回默认语言，
 * 保证 createI18n 拿到的一定是合法值。
 */
export function readStoredLocale(): AppLocale {
  const stored = storage()?.getItem(LOCALE_KEY);
  return isAppLocale(stored) ? stored : DEFAULT_LOCALE;
}

/** 写持久化。失败时静默：本次切换依然生效，只是下次进来回到默认语言 */
export function writeStoredLocale(locale: AppLocale): void {
  try {
    storage()?.setItem(LOCALE_KEY, locale);
  } catch {
    /* 存储不可用，忽略 */
  }
}
