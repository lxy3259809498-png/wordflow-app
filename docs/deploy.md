# 让手机直接访问：部署指南

## 你要的效果

> 手机浏览器输入一个固定网址就能用，不用连电脑、不用开热点，记录还能存住。

这需要三件事同时成立：

| 条件 | 为什么 |
| --- | --- |
| **固定网址（HTTPS）** | 浏览器按网址隔离 IndexedDB。网址一变（比如 IP 变了），旧记录就读不到，等于丢了 |
| **HTTPS** | 只有 HTTPS 才允许 Service Worker → 才能"添加到主屏幕"和离线打开 |
| **服务端只是个静态文件托管** | 数据全在手机本地，不需要服务器数据库 |

本项目已改造成可直接部署的形态，下面三种方式任选一种。

---

## 方式一：GitHub Pages（免费、固定域名、推荐）

### 一次性准备（需要你操作，约 3 分钟）

我只能改代码，**无法替你登录 GitHub**。你需要：

1. 打开终端执行 `gh auth login`，按提示在浏览器里授权
2. 或者直接在 github.com 网页上手动创建仓库

### 然后执行

```bash
cd wordflow

# 登录（已登录可跳过）
gh auth login

# 创建仓库并推送（把 wordflow-app 换成你想要的名字）
gh repo create wordflow-app --public --source=. --push

# 打开 Pages：仓库 → Settings → Pages → Source 选 "GitHub Actions"
gh browse --settings
```

推送后 GitHub Actions 会自动构建并发布（`.github/workflows/deploy-pages.yml` 已写好）。约 1~2 分钟后访问：

```
https://<你的用户名>.github.io/wordflow-app/
```

这个网址**永久固定**，手机浏览器输入即可，也可以"添加到主屏幕"当 App 用。

### 工作流已处理的细节

- `VITE_BASE=/<仓库名>/` —— Pages 项目站点在子路径下，资源路径必须匹配
- 路由 `basename` 自动跟随 base —— 否则 `/decks` 这类页面会 404
- `index.html` 复制为 `404.html` —— Pages 没有重写规则，深链接首次访问靠它兜底
- 已本地实测：`/wordflow/decks` 直接访问正常，Service Worker scope 正确

---

## 方式二：Netlify / Cloudflare Pages（拖拽即可，更快）

不需要 Git：

1. 本机构建：

```bash
cd wordflow
npm run build
```

2. 把 **`dist` 文件夹**直接拖到：
   - Netlify：<https://app.netlify.com/drop>
   - 或 Cloudflare Pages → Create project → Direct upload

3. 得到形如 `https://random-name-123.netlify.app` 的 HTTPS 网址

**注意**：Netlify/Cloudflare 的根路径部署**不需要**设置 `VITE_BASE`，用默认的 `npm run build` 即可。

想固定域名可在面板里改（如 `wordflow-你的名字.netlify.app`）。

---

## 方式三：自己的一台服务器 / VPS

```bash
cd wordflow
npm run build
# 把 dist/ 上传到服务器，用 Nginx 托管
```

Nginx 关键配置（SPA 必须有 `try_files`）：

```nginx
server {
  listen 443 ssl http2;
  server_name your-domain.com;

  root /var/www/wordflow;
  index index.html;

  # 深链接回退到 index.html，否则 /decks 会 404
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Service Worker 必须不缓存，否则更新不生效
  location = /sw.js {
    add_header Cache-Control "no-cache";
  }
}
```

HTTPS 证书用 certbot 免费签：

```bash
sudo certbot --nginx -d your-domain.com
```

---

## 部署后：手机上的数据保存

**不需要任何账号或配置。** 首次打开后：

1. 应用自动把 1.4 万词写入手机浏览器的 IndexedDB（约 5~15 秒）
2. 之后学的每个词、每次复习、错词本、统计全部存在本地
3. 关掉浏览器、重启手机都不丢

### 什么时候会丢

| 情况 | 结果 |
| --- | --- |
| 关闭标签页 / 重启浏览器 | ✅ 保留 |
| 重启手机 | ✅ 保留 |
| 手机清理"网站数据" | ❌ 丢失 |
| 用无痕/隐私模式 | ❌ 关闭即清空 |
| **换网址访问**（IP 变了、换域名） | ❌ 读不到旧数据（数据还在，但浏览器认为不是同一个站） |
| iOS Safari 连续 7 天未访问 | ⚠️ 可能被系统清理 |

所以：**网址必须固定**。这也是为什么推荐 GitHub Pages / Netlify，而不是局域网 IP。

### 备份习惯

「设置 → 数据与备份 → 导出 JSON 备份」，存到网盘或发给自己。恢复时同一页面导入即可。

---

## 手机与电脑的数据不互通

IndexedDB 存在各自浏览器里。想在两端同步进度：

1. 电脑导出 JSON 备份
2. 传到手机（微信/邮件/网盘）
3. 手机打开同一网址 → 选择备份文件 → 覆盖恢复

---

## 部署前本地验证（可选）

```bash
cd wordflow
npm run build
npm run preview
# 打开 http://127.0.0.1:4173
```

`localhost` 属于"安全上下文"，所以 Service Worker 在这里可以注册，能提前验证 PWA 行为。

## 实测记录

| 项目 | 结果 |
| --- | --- |
| 子路径构建（`VITE_BASE=/wordflow/`） | 资源全部带前缀，manifest 用相对路径 |
| 子路径深链接 `/wordflow/decks` | 页面正常，无 404 |
| 子路径内跳转 | URL 保持 `/wordflow/decks`，未跳出 base |
| Service Worker（子路径） | 注册成功，scope = `/wordflow/` |
| 预缓存体积 | 50 项 / 669 KB |
| 局域网 HTTP 下 Service Worker | **无法注册**（`isSecureContext=false`），故不能离线 |

> 最后一行说明：**局域网 IP 方式永远无法获得 PWA 能力**，这是浏览器规则，不是配置问题。想要完整能力必须部署到 HTTPS。
