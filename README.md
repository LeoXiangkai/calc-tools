# calc-tools

中文在线计算器工具集（房贷、个税…）。Astro 静态站点，部署在 Cloudflare Pages，目标变现是 Google AdSense。

## 当前状态

- ✅ 工具集骨架（首页 / About / Privacy / Terms / Contact / FAQ）
- ✅ 房贷计算器 5 Tab（基础对比 / 组合贷 / 提前还款 / 购房力 / 利率重定价）
- ✅ **个税计算器 5 Tab**（月度预扣 / 年度汇算 / 年终奖对比 / 劳务稿酬 / 经营所得）
- ✅ **税率表速查页**（5 张完整税率表 + 专项附加扣除标准）
- ✅ 买房税费计算器（契税 + 增值税 + 个税，按 2025-12 新政分档）
- ✅ 配套长文 3 篇：房贷入门 / 提前还款指南 / **专项附加扣除完整指南**
- ✅ **62 项算法 sanity test 全过**
- ⏳ 部署到 Cloudflare Pages（待用户操作）
- ⏳ AdSense 提审

## 开发

```bash
pnpm install
pnpm dev          # 本地预览 http://localhost:4321
pnpm build        # 静态构建，输出到 dist/
pnpm preview      # 预览 build 结果
```

算法 sanity check：

```bash
node --experimental-strip-types test-calc.mjs
```

## 项目结构

```
src/
├── layouts/Base.astro
├── pages/
│   ├── index.astro
│   ├── mortgage.astro          # 房贷 5 Tab
│   ├── tax.astro               # 个税 5 Tab
│   ├── tax-rate-tables.astro   # 税率表速查
│   ├── transaction-tax.astro   # 买房税费
│   ├── about.astro / privacy.astro / terms.astro / contact.astro / faq.astro
│   └── guides/
│       ├── mortgage-basics.astro
│       ├── prepayment.astro
│       └── tax-deductions.astro
├── lib/
│   ├── mortgage.ts             # calcMortgage / Combined / Prepay / Repricing / Affordability
│   ├── tax.ts                  # calcTransactionTax
│   └── income-tax.ts           # 综合税率 + 累计预扣 + 年度汇算 + 年终奖 + 劳务稿酬 + 经营所得
└── styles/global.css

public/
├── robots.txt
└── ads.txt                     # AdSense 通过审核后填真实 publisher id
```

## 部署到 Cloudflare Pages

### 1. 新建 GitHub 仓库

```bash
cd ~/AI_Content/develop/calc-tools
git init -b main
git add .
git commit -m "feat: 工具集骨架 + 房贷计算器首期"
gh repo create calc-tools --public --source=. --push
```

### 2. 连接 Cloudflare Pages

在 Cloudflare Dashboard 选择 **Workers & Pages → Create → Pages → Connect to Git**：

- 选刚创建的 `calc-tools` 仓库
- **Build command**：`pnpm build`
- **Build output directory**：`dist`
- **Node version**：`20` 或 `22`（Settings → Environment variables → `NODE_VERSION=22`）
- 触发首次部署，分配域名 `calc-tools.pages.dev`（或自定义子域）

### 3. 验证

部署完成后访问 `https://calc-tools.pages.dev/`：

- 首页能加载、卡片可点
- `/mortgage` 修改输入框，月供与明细表实时刷新
- `/sitemap-index.xml` 与 `/robots.txt` 可访问
- 移动端打开（或 Chrome DevTools 模拟）布局正常

## AdSense 提审准备

详见 [`ADSENSE.md`](./ADSENSE.md)。
