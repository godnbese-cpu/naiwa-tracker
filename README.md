# 🐸 奶蛙宇宙（NAIWA Universe）

庆祝奶蛙诞生的全网观测站 · **奶蛙格斗游戏** · 极速杯赛车 · **淘宝式奶蛙购** · 数据实验室。

**在线访问**：<https://godnbese-cpu.github.io/naiwa-tracker/>

纯静态站点：**零构建、零依赖、零后端**。每个页面双击就能跑，推上 GitHub Pages 就能上线。

---

## 📄 页面

| 页面 | 内容 |
| --- | --- |
| `index.html` | **观测站**：实时计数大屏、全球光络图、实时数据流、24h 趋势、场景饼图、全球排行榜、发光线编年史、砸箱子、送票 |
| `battle.html` | **⚔️ 奶蛙决斗场**：死神VS火影式 2D 格斗，12 位斗士、连段浮空、超必杀、四大场地 |
| `race.html` | **🏎️ 奶蛙极速杯**：Canvas 赛车，彩虹奶蛙对手程序化换色生成 |
| `shop.html` | **🛒 奶蛙购**：淘宝式商城，搜索、多维筛选、秒杀、优惠券、SKU、购物车、三段式结算、订单 |
| `lab.html` | **🧪 数据实验室**：爬虫数据可视化、换色精灵引擎、斗士数值面板、数据 API 控制台 |

---

## ⚔️ 决斗场（本次重做的核心）

参考《死神VS火影》的手感，做了完整的格斗系统而不是简单对撞：

**战斗系统**
- 帧数据驱动：每个招式都有 `startup / active / recovery`（前摇·判定·后摇），可开关**帧数据悬浮显示**
- **判定框可视化**：一键显示攻击框（黄）与受击框（红）
- **8 段连段链**：轻攻 → 连拍 → 扫尾，自动分支出招，可接空中攻击
- **浮空与浮空连段**：挑击起手 → 空中踏追击
- **霸体（armor）与无敌帧（invuln）**：部分招式起步硬吃一下也不中断
- **反击架势（counter）**：武侍奶蛙「居合拔刀」、小奶蛙「装死の极致」
- **投技**：无视普通防御，`K+U` 或 `G`
- **防御与削减**：面向攻方才能防，防御吃 `chip` 削减伤害
- **连段伤害缩放**：连得越长，单次伤害越低（第 8 段降到 45%）
- **能量三档**：命中涨能量，满 100 放超必杀
- **状态效果**：减速（冰霜）、灼烧（烈焰）、吸能（幽冥）
- **打击感**：命中定格（hitstop）、屏幕震动、白闪、KO 慢镜、残像拖影、冲击环
- **墙角压制 + 墙反弹**

**12 位斗士**（全部由原图程序化换色生成，`assets/fighters.js`）

大奶蛙 · 小奶蛙 · 彩虹奶蛙 · 金曜奶蛙 · 冰霜奶蛙 · 烈焰奶蛙 ·
影忍奶蛙 · 武侍奶蛙 · 治疗奶蛙 · 雷电奶蛙 · 幽冥奶蛙 · 奶蛙之神（BOSS）

**4 种模式**：单人闯关（6 连胜打到 BOSS）· 双人对战 · 生存模式（血量继承）· 训练营

**4 个场地**：霓虹决斗场 · 奶蛙古寺 · 数据实验室 · 深空奶蛙（各有独立视差背景与氛围粒子）

**操作**

| 按键 | 动作 |
| --- | --- |
| `A` `D` | 左右移动 |
| `W` | 跳跃（可二段/三段，视角色而定） |
| `S` | 下蹲 |
| `Shift` | 冲刺 |
| `J` | 轻攻（连段起手） |
| `K` | 重攻 |
| `U` | 挑击（浮空起手） |
| `K`+`U` | 抓取 |
| `L` `I` | 技能① 技能② |
| `O` | 超必杀（需满能量） |
| `P` | 防御 |

手机端右下角有虚拟按键，自动显示。

---

## 🛒 奶蛙购（淘宝式模块）

- 顶部**搜索栏** + 热词快捷搜索
- 左侧**分类导航**（带商品数）与**价格区间筛选**
- 6 种排序：综合 / 销量 / 价格↑↓ / 好评 / 折扣
- 商品卡：折扣角标、满减标签、评分、已售、**库存进度条**、加购 & 立即买
- **限时秒杀**倒计时横幅
- **优惠券**：5 档满减，可领取，结算自动匹配最优券
- **商品详情层**：多 SKU 规格选择、参数表、用户评价
- **购物车抽屉**：改数量、小计、优惠券、运费、合计
- **三段式结算**：收货信息 → 支付方式（含「奶蛙币」）→ 下单成功，带订单号
- **我的订单**：保存在浏览器 localStorage

---

## 🧪 数据实验室 与 Python 数据模块

### 爬虫采集器 `tools/naiwa_crawler.py`

```bash
python tools/naiwa_crawler.py --list-sources          # 看内置了哪些来源
python tools/naiwa_crawler.py --dry-run               # 干跑：只探测候选链接，不下载
python tools/naiwa_crawler.py --limit 120 --license-only   # 正式采集
python tools/naiwa_crawler.py --sources my-sources.txt     # 用自己的源文件
```

采集器的设计（请务必遵守）：

- **遵循 robots.txt**，默认开启，可用 `--no-robots` 关闭（关闭前请确认你有权限）
- **按 SHA1 去重**，重复图片只记一条 `skipped-dup` 记录
- **限速**：默认同域名 1.2 秒间隔（`--delay` 可调）
- **过滤小图**：默认丢弃短边小于 180px 的图（`--min-px` 可调）
- **记录授权与来源**：每张图都带 `url` / `source` / `license`
- `--license-only` 只保留标记为自由授权的来源
- 有 `requests` 用 `requests`，没有就回退 `urllib`；有 `Pillow` 用 `Pillow`，没有就用内置 PNG/JPEG/GIF/WebP 头部解析

> **为什么默认走 `/wiki/Category:` 而不是 MediaWiki API？**
> Wikimedia 的 robots.txt 里 `Disallow: /w/`、`Disallow: /api/`，
> 只放开了 `mobileview` 等少数接口。所以脚本改为解析**允许抓取的分类页**，
> 再逐个打开 `File:` 页面取出原图直链，同时把页面上的 CC / 公有领域字样记进清单。
> 这是对站点规则更尊重的做法，也顺便证明了 robots 判定是真的在生效。
>
> 顺带一提，这里踩过一个真实的坑：`urllib.robotparser.can_fetch()` 只接受
> **路径 + 查询**，传完整 URL（`https://host/path`）会被内部 `urlparse` 解析错，
> 把明明允许的地址判成禁止。脚本里已经自己拆好 `path?query` 再传。

产出：

```
assets/naiwa-images/manifest.json   完整清单（来源 URL + 授权 + 尺寸 + 哈希）
assets/naiwa-images/derived.json    衍生数据（12 位斗士的换色映射）
assets/naiwa-images/naiwa-data.js   前端可直接 <script> 引用的数据模块
assets/naiwa-images/*.png|jpg|webp  图片本体
```

### 数据分析 `tools/naiwa_data.py`

```bash
python tools/naiwa_data.py stats                        # 统计：数量/体积/授权分布/格式分布
python tools/naiwa_data.py list --limit 30              # 按像素排序列出
python tools/naiwa_data.py search 青蛙                   # 关键词检索
python tools/naiwa_data.py export --out export.json     # 导出合并数据
```

### 自检 `tools/check.py`

改完页面跑一下，会检查：每个页面内联 JS 的**语法**（调用 node --check）、
外部脚本引用是否存在、`getElementById` 是否有对应元素、关键资源是否齐全。

```bash
python tools/check.py
```

输出示例：

```
📄 battle.html
  ✅ 内联脚本 #1（51164 字符）：语法 OK
📦 关键资源
  ✅ naiwa-common.js
✅ 全部检查通过：语法、引用、元素 id、关键资源都正常。
```

### 前端换色引擎

采集到的图片不是必须的——**12 位斗士的形象全部由原图在 canvas 上程序化换色生成**
（`NAIWA.tintSprite()`，见 `naiwa-common.js`）。所以站点离线也能完整运行。
`lab.html` 里可以实时拖动滑块调色相 / 叠加色 / 强度 / 描边，看 12 位斗士同时变化。

> ⚠️ 采集第三方图片请注意版权。推送到公开仓库前先看 `manifest.json` 里的 `license` 字段，
> `.gitignore` 默认只提交三个数据文件、不提交图片本体。

---

## 🚀 部署

完整说明见 **[DEPLOY.md](DEPLOY.md)**。

```bash
git add -A
git commit -m "🐸 奶蛙宇宙更新"
git push origin main
```

推送后约 1 分钟生效。Windows 用户也可以双击 `tools/deploy.bat`，里面有
「推送 / 本地预览 / 采集图片 / 数据统计」四项菜单。

仓库里也带了 `.github/workflows/pages.yml`：想把 Pages 的 Source 改成 **GitHub Actions**
就能自动发布（二选一，别和 branch 模式同时开）。

### 本地预览

```bash
python -m http.server 8000     # 然后打开 http://localhost:8000
```

---

## 📁 文件结构

```
naiwa-tracker/
├── index.html                 观测站主页
├── battle.html                ⚔️ 决斗场（格斗引擎）
├── race.html                  🏎️ 极速杯
├── shop.html                  🛒 奶蛙购
├── lab.html                   🧪 数据实验室
├── naiwa-common.js            共享引擎：导航/光络背景/换色精灵/音效/提示
├── assets/
│   ├── fighters.js            12 位斗士数据模块
│   └── naiwa-images/          爬虫产出（manifest / derived / naiwa-data.js）
├── tools/
│   ├── naiwa_crawler.py       🕷️ 图片采集器
│   ├── naiwa_data.py          📊 数据分析模块
│   └── deploy.bat             Windows 一键部署助手
├── .github/workflows/pages.yml
├── DEPLOY.md
├── package.json               npm scripts 别名（可选）
├── assets/naiwa-charts.js      自写轻量图表引擎（32KB，替代 1MB 的 ECharts）
├── world.json                 地图 GeoJSON
└── naiwa*.webp                奶蛙原图（站立/大笑/思考/主图）
```

---

## 🔧 技术栈

原生 HTML + CSS + Canvas 2D + WebAudio，**没有任何框架、没有构建步骤、没有 npm 依赖**。
图表用 ECharts（仅观测站一页，且优先读本地文件）。
音效是 WebAudio 实时合成的，所以仓库里没有任何音频文件。

---

## 📜 数据与致谢

编年史部分为真实考证整理，来源见页面底部：失传媒体中文维基、新浪新闻、今日头条、naiwa.world。

奶蛙形象版权归原作者所有，本项目为非商用玩梗。

## License

MIT（代码部分）
