import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { vitePluginForArco } from '@arco-plugins/vite-vue';

export default defineConfig({
  plugins: [
    vue(),
    vitePluginForArco({ style: 'css' }),
  ],
  /* 部署（2026-11-02）：发布沙箱经反向代理访问，dev/preview 需绑定 0.0.0.0
     并放行任意 Host，否则 Vite 以 "Blocked request. This host is not allowed." 拒绝 */
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
});
