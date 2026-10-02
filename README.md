# GULAI Solar · 云端网站仓库

这是从旧对话「gulai太阳能网站」迁入的第 27 版网站，面向墨西哥进口商和经销商，提供太阳能照明与储能产品。保留西语、英语、原始产品图片、工厂照片、字体、4 本 PDF 画册和现有联系方式。

## 在云端开发

需要 Node.js 22 或更新版本、npm 和 Python 3。当前云环境已提供，项目没有第三方运行或构建依赖，无需安装软件到你的 Mac。

在 `/workspace/Solar-landing-page` 中运行：

```bash
npm run dev
```

该命令先构建页面，再在 4173 端口运行开发服务器。编辑源文件后，另开终端执行 `npm run build`，然后刷新浏览器；服务器不自动重新构建。只需要查看已构建的网站时，可运行 `npm run preview`。

源码目录与用途：

| 路径 | 用途 |
| --- | --- |
| `src/template.html` | 英西双语共享页面结构 |
| `src/site.css` / `src/site.js` | 样式、导航、语言切换、WeChat 复制、WhatsApp 浮动入口 |
| `src/locales/es.json` / `src/locales/en.json` | 西语与英语文案 |
| `src/data/products.json` | 产品分类、图片和画册路径 |
| `public/assets/` | 永久保存的图片、字体和 PDF 画册 |
| `dist/` | 自动构建的发布文件，已排除出 Git，可重新生成 |
| `.openai/hosting.json` | 从原网站保留的发布配置 |

每个云端任务已有隔离环境，直接使用已有仓库，无需另建 Git worktree。

## 验证

```bash
npm run build
npm test
```

测试覆盖全新构建、静态资源完整性、双语页面、确定性构建和翻译缺失时的错误处理。

当前云环境也提供 Playwright 和 Chromium。启动服务器后运行：

```bash
npm run test:browser
```

浏览器检查覆盖英西双语在手机、平板、电脑上的布局，以及菜单、语言切换、微信复制、WhatsApp 和画册入口。可用 `GULAI_TEST_URL` 指定测试服务器；系统 Chromium 路径不同时可用 `GULAI_CHROMIUM_PATH` 指定。浏览器测试不自动向 WhatsApp、邮箱或社交账号发送消息。

## 构建和发布

`npm run build` 从 `src/` 和 `public/assets/` 完整生成 `dist/`，包括 `/`、`/es/`、`/en/`、`robots.txt` 和 `sitemap.xml`。默认首页为西语，英语入口为 `/en/`。不要直接编辑 `dist/`；下一次构建会替换这些生成文件。

正式域名配置保留为 `https://gulaisolar.com`。云端开发、Git 版本保存与正式上线是独立步骤；运行构建命令不会发布网站。发布前应在待发布版本上完成上述检查，并确认目标项目与域名。

## 迁移来源

原始文件：`gulai-site-v27-source.zip`，49 个文件，压缩包完整性检查通过。最初导入后重新构建的全部文件与压缩包内容逐字节一致。随后将永久素材移入 `public/assets/`，补上可重建流程和双语键盘跳转入口。

压缩包 SHA-256：

```text
5a6e26250a6a1dd5a69858426262804c0302461337e325b476b9c7af20974c76
```
