import App from './App.vue';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { installProviders } from './providers';
import router from './router';

const app = createApp(App);

installProviders(app, createPinia());

// 等路由解析完成再挂载：挂载过早时 route.meta 尚为空，App.vue 会先渲染
// DefaultLayout（顶部导航壳子）一帧、路由就绪后才切到 ProductLayout，
// 刷新时表现为导航栏闪现。isReady 后首帧即是正确的左侧菜单壳子。
router.isReady().then(() => app.mount('#app'));
