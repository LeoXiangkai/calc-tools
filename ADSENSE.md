# AdSense 接入与过审 checklist

## 提审前自检（按 Google 公开审核标准）

| 项目 | 状态 | 说明 |
|------|:---:|------|
| 站点已上线、可被 Google 抓取 | ⏳ | 部署后 + `robots.txt` 已允许抓取 |
| HTTPS | ✅ | Cloudflare Pages 默认 |
| 隐私政策 | ✅ | `/privacy`，含 cookie 与 AdSense 说明 |
| 服务条款 | ✅ | `/terms`，含计算结果免责 |
| 联系方式 | ✅ | `/contact`，邮箱可达 |
| 关于页 | ✅ | `/about`，说明站点定位 |
| 原创、有价值的内容 | ✅ | FAQ + 房贷入门长文 + 工具公式说明 |
| 移动端友好 | ✅ | viewport meta + 响应式 CSS |
| 页面体积小、加载快 | ✅ | Astro 静态导出 + 无重 JS 框架（dist ≈ 80 KB）|
| 无空页 / 占位页 | ✅ | 所有页面都有实质内容 |
| 没有违反内容政策的素材 | ✅ | 无成人 / 暴力 / 仇恨 / 假信息 |

## 提审步骤

1. **确认部署稳定**：站点可正常访问 ≥ 7 天，让 Google 完成抓取
2. **登录 [AdSense 后台](https://adsense.google.com/)**
3. **添加站点**：填入 `https://calc-tools.pages.dev`（或绑定的自定义域名）
4. **粘贴验证代码**：把 AdSense 给的 `<script>` 加到 `src/layouts/Base.astro` 的 `<head>` 内（已留好注释占位）
5. **填写 ads.txt**：把 AdSense 提供的一行复制到 `public/ads.txt`，重新部署
6. **提交审核**：Google 审核期通常 数天 ~ 数周

## 关于 `*.pages.dev` 子域

Google AdSense 对 **二级 pages.dev 子域** 的审核策略不稳定，可能因"非顶级域名"被拒。

### 推荐策略

- **方案 A（保险）**：先注册一个便宜域名（如 `.com.cn` / `.tools` / `.app`，约 50-200 元/年），绑到 Cloudflare Pages，再提审
- **方案 B（先试）**：直接用 `*.pages.dev` 提审一次，若被拒说明是子域问题，再绑域名重提

## 上线后操作

### 加广告位（过审后）

在 `src/layouts/Base.astro` 的 `<head>` 内插入 AdSense 自动广告脚本：

```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
```

或在具体页面用手动广告单元（控制位置和频率，UX 更可控）。

### 监控

- AdSense 后台看 CTR / RPM / 拒登原因
- 关注 **CLS（布局偏移）**：广告加载会推动内容，需要给广告位留固定高度
- 关注 **LCP**：广告 JS 不要阻塞首屏

## 已知风险

| 风险 | 应对 |
|------|------|
| `*.pages.dev` 子域被拒 | 准备自有域名 plan B |
| 内容被判"工具站、价值不足" | 已经在 `/faq` 和 `/guides/` 加原创长文，后续每两周补 1 篇科普 |
| 移动端 CLS 超标 | 广告位用占位 CSS 锁高度（接入时再处理）|
| 国内访问速度 | Cloudflare Pages 在国内速度一般，重要时切换域名服务或换托管 |
