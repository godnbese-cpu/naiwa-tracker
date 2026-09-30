# 🐸 奶蛙观测站（NAIWA Tracker）

全网奶蛙使用频率实时观测站：全球热力图 + 传播飞线动画 + 奶蛙编年史 + 砸箱子 + 送票互动。

## 本地预览

直接用浏览器打开 `index.html` 即可（地图与图表依赖 CDN，需联网）。

## 部署到 GitHub Pages（获得简洁域名）

1. 在 GitHub 上新建一个公开仓库，推荐名为 `naiwa-tracker`
2. 把本文件夹推上去（在本目录执行）：

```bash
git remote add origin https://github.com/<你的用户名>/naiwa-tracker.git
git branch -M main
git push -u origin main
```

3. 打开仓库 → Settings → Pages → Source 选择 `main` 分支 `/ (root)` → Save
4. 等待约 1 分钟，即可通过以下地址访问：

```
https://<你的用户名>.github.io/naiwa-tracker/
```

想要更短的根域名 `<用户名>.github.io`：把仓库命名为 `<你的用户名>.github.io` 再推送即可。

## 数据接入

页面当前为演示模式（高仿真模拟数据流）。接入真实数据：把爬虫/平台 API 的输出对接到 `/api/stream`，前端零改动。

## 文件说明

- `index.html` — 观测站全部页面逻辑（纯静态单页）
- `naiwa.webp` — 奶蛙形象原图
