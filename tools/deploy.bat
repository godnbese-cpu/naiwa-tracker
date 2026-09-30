@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title 奶蛙观测站 · 一键部署

set REPO=https://github.com/godnbese-cpu/naiwa-tracker.git
cd /d "%~dp0.."

echo ============================================================
echo   🐸 奶蛙观测站 · 部署助手
echo ============================================================
echo   工作目录：%CD%
echo ============================================================
echo.
echo   [1] 推送到 GitHub（自动提交并 push）
echo   [2] 本地预览（python -m http.server 8000）
echo   [3] 采集奶蛙图片（python tools/naiwa_crawler.py）
echo   [4] 查看采集数据统计
echo   [5] 退出
echo.
set /p choice=请输入选项数字并回车：

if "%choice%"=="1" goto deploy
if "%choice%"=="2" goto serve
if "%choice%"=="3" goto crawl
if "%choice%"=="4" goto stats
goto end

:deploy
echo.
where git >nul 2>nul
if errorlevel 1 (
  echo [X] 没找到 git，请先安装 Git for Windows：https://git-scm.com/download/win
  goto end
)
if not exist ".git" (
  echo [*] 初始化 git 仓库…
  git init
  git branch -M main
)
git remote get-url origin >nul 2>nul
if errorlevel 1 (
  echo [*] 添加远端 %REPO%
  git remote add origin %REPO%
)
echo.
echo [*] 当前改动：
git status --short
echo.
set /p msg=提交说明（直接回车用默认）：
if "!msg!"=="" set msg=🐸 更新奶蛙宇宙
echo.
git add -A
git commit -m "!msg!"
if errorlevel 1 echo [i] 没有新的改动需要提交，继续推送。
echo [*] 推送到 %REPO% …
git push -u origin main
if errorlevel 1 (
  echo.
  echo [X] 推送失败。常见原因：
  echo     - 没有登录/没有权限：用 Personal Access Token 当密码，或配置 SSH
  echo     - 远端有新提交：先执行 git pull --rebase origin main 再推
  echo     - 详见 DEPLOY.md 第七节
) else (
  echo.
  echo [√] 推送成功！约 1 分钟后访问：
  echo     https://godnbese-cpu.github.io/naiwa-tracker/
)
goto end

:serve
echo.
where python >nul 2>nul
if errorlevel 1 (
  echo [X] 没找到 python。装一个，或直接双击 index.html 预览。
  goto end
)
echo [*] 启动本地服务器：http://localhost:8000   （Ctrl+C 停止）
start "" http://localhost:8000
python -m http.server 8000
goto end

:crawl
echo.
where python >nul 2>nul
if errorlevel 1 (
  echo [X] 没找到 python。请安装 Python 3.9+。
  goto end
)
echo [*] 先干跑探测一下来源…
python tools\naiwa_crawler.py --list-sources
echo.
set /p lim=最多下载多少张（回车=60）：
if "!lim!"=="" set lim=60
python tools\naiwa_crawler.py --limit !lim! --license-only
goto end

:stats
where python >nul 2>nul
if errorlevel 1 (
  echo [X] 没找到 python。
  goto end
)
python tools\naiwa_data.py stats
pause
goto end

:end
echo.
pause
endlocal
