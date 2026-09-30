# 🐸 奶蛙观测站 · 部署说明（GitHub Pages）

本项目是**纯静态站点**：没有构建步骤、没有依赖、直接打开 HTML 就能跑。
所以部署只需要把文件推到 GitHub，开启 Pages 即可。

在线地址：<https://godnbese-cpu.github.io/naiwa-tracker/>

---

## 一、最快路径（推荐）

在项目根目录（就是有 `index.html` 的那一层）执行：

```bash
git init                      # 如果还不是 git 仓库
git add -A
git commit -m "🐸 奶蛙宇宙 v2：决斗场引擎 / 淘宝式奶蛙购 / 数据实验室 / 爬虫模块"
git branch -M main
git remote add origin https://github.com/godnbese-cpu/naiwa-tracker.git
git push -u origin main --force
```

> 如果仓库已经存在并且你不想覆盖远端历史，去掉 `--force`，先 `git pull --rebase origin main` 再推。

推送后 GitHub Pages 会自动发布（约 1 分钟）。地址就是
`https://<你的用户名>.github.io/<仓库名>/`。

---

## 二、首次开启 Pages（只需要做一次）

1. 打开仓库 → **Settings** → 左侧 **Pages**
2. **Source** 选 `Deploy from a branch`
3. **Branch** 选 `main`，目录选 `/ (root)`
4. 点 **Save**

之后每次 `git push` 都会自动更新线上站点。

---

## 三、用 GitHub Actions 自动部署（可选）

仓库里已经放好了 `.github/workflows/pages.yml`。
如果你想用它，把 Pages 的 Source 改成 **GitHub Actions** 即可：

1. Settings → Pages → Source → **GitHub Actions**
2. 推送到 `main` 后，Actions 会自动打包并发布
3. 在 Actions 页面能看到每次部署的状态

两种方式选一种就行，不要同时开（否则可能互相覆盖）。

---

## 四、本地预览

因为页面用了 `fetch` 和 `localStorage`，**建议用本地服务器**打开，别直接双击文件：

```bash
# 任选一种
python -m http.server 8000
npx serve .
php -S localhost:8000
```

然后浏览器打开 <http://localhost:8000>。

Windows 一键：双击 `tools/deploy.bat`，选 `2` 启动本地预览。

---

## 五、提交前自检清单

- [ ] 打开 `index.html`，图表正常、彩带在飘
- [ ] 打开 `battle.html`，能选人、能打、KO 有慢镜
- [ ] 打开 `shop.html`，能搜索、能加购、能走完结算
- [ ] 打开 `lab.html`，换色引擎滑块生效
- [ ] 手机尺寸下导航和触屏按键正常
- [ ] 没有把 `assets/naiwa-images/` 里几十 MB 的图片一起推上去（看 `.gitignore` 说明）

---

## 六、关于爬虫采集到的图片

`tools/naiwa_crawler.py` 采到的图片默认会写进 `assets/naiwa-images/`。
这些是**第三方图片**，直接推上公开仓库有两个风险：体积膨胀 + 版权问题。

建议：

```bash
# 只提交清单和衍生数据，不提交图片本体
git add assets/naiwa-images/manifest.json
git add assets/naiwa-images/derived.json
git add assets/naiwa-images/naiwa-data.js
```

`.gitignore` 里已经默认忽略了图片本体，只保留这三个数据文件。
如果你确认这些图片可以公开分发，再去掉对应的忽略规则。

---

## 七、常见问题

**Q：推送时报 `refusing to allow a Personal Access Token to create or update workflow`**
A：你的 token 没有 **`workflow`** 权限。GitHub 规定：**任何**对 `.github/workflows/` 下文件的
创建/修改都必须带 `workflow` 权限，普通 `repo` 权限也不行。两种解决办法：

1. 去 GitHub → Settings → Developer settings → Personal access tokens，
   重新生成 token 时**勾上 `workflow`**，然后用它推；
2. 或者干脆不用 Actions 部署，改用在 Settings → Pages 里选 `main` 分支发布
   （本项目默认就是这个方式，`.github/workflows/pages.yml` 只是可选项）。

**Q：推送时提示 `remote: Support for password authentication was removed`**
A：GitHub 不再接受账号密码。用 Personal Access Token（Settings → Developer settings →
Personal access tokens）当密码，或者配置 SSH key：

```bash
ssh-keygen -t ed25519 -C "你的邮箱"
# 把 ~/.ssh/id_ed25519.pub 的内容贴到 GitHub → Settings → SSH and GPG keys
git remote set-url origin git@github.com:godnbese-cpu/naiwa-tracker.git
```

**Q：页面 404 / 样式丢失**
A：Pages 对仓库名大小写敏感，确认所有资源都是**相对路径**引用（本项目已经是）。

**Q：改了页面但线上没变**
A：等 1 分钟；或去 Actions 看构建是否失败；再强制刷新浏览器（Ctrl+F5）。

**Q：ECharts 图表不显示**
A：`index.html` 会优先用仓库自带的 `echarts.min.js`，没有才走 CDN。确认这个文件在根目录。
