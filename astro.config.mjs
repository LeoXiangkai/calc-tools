// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 部署前把 site 改成实际域名（含 https://）
// 当前用 *.pages.dev 临时占位，等绑域名后改
export default defineConfig({
  site: 'https://calc-tools.pages.dev',
  trailingSlash: 'never',
  build: {
    inlineStylesheets: 'auto',
  },
  integrations: [sitemap()],
});
