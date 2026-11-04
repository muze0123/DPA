import type { App } from 'vue';
import type { Pinia } from 'pinia';
import ArcoVue from '@arco-design/web-vue';
import '@arco-design/web-vue/es/style/index.css';
import router from './router';
import i18n from './i18n';
import '../styles/global.css';
import '../design/tokens.css';

export function installProviders(app: App, pinia: Pinia) {
  app.use(ArcoVue, { componentPrefix: 'a' });
  app.use(pinia);
  app.use(router);
  app.use(i18n);
}
