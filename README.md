# 🐸 奶蛙诞生庆典观测站（NAIWA Tracker）

庆祝奶蛙诞生的全网观测站 + 奶蛙赛车大奖赛：全球光络图（传播飞线）+ 诞生编年史 + 砸箱子 + 送票 + 极速杯赛车游戏。

**在线访问**：https://godnbese-cpu.github.io/naiwa-tracker/

## 页面

- `index.html` — 观测站主页：实时计数大屏、全球光络图（多地图源容错）、实时数据流、24h 趋势、场景饼图、全球排行榜、诞生编年史（发光时间轴）、砸箱子、送票
- `race.html` — 🏎️ 奶蛙极速杯：Canvas 赛车游戏，彩虹奶蛙对手经过程序化换色生成，支持键盘/触屏，成绩存 localStorage

## 本地预览

直接用浏览器打开 `index.html`（图表与地图依赖 CDN，需联网）。

## 部署到 GitHub Pages

```bash
git push origin main
```

仓库已配置 Pages（main 分支 / 根目录），推送后约 1 分钟生效。

## 数据接入

页面当前为演示模式（高仿真模拟数据流）。接入真实数据：把爬虫/平台 API 的输出对接到 `/api/stream`，前端零改动。

## 文件说明

- `index.html` — 观测站主页
- `race.html` — 赛车游戏
- `naiwa.webp` — 奶蛙形象原图（彩虹对手为程序化换色变体）
