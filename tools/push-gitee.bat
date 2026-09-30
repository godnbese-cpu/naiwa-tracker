@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title 奶蛙观测站 · 推送到 Gitee（国内镜像）

set GIT_EXE=git
where git >nul 2>nul || set GIT_EXE=C:\Users\38197\.workbuddy\vendor\PortableGit\cmd\git.exe
if not exist "%GIT_EXE%" (
  if "%GIT_EXE%"=="git" ( rem 走 PATH
  ) else (
    echo [X] 找不到 git，请先安装 Git for Windows，或把 git 加入 PATH。
    pause & exit /b 1
  )
)

set REPO=https://gitee.com/godblessweek/naiwa.git
cd /d "%~dp0.."
echo ============================================================
echo   🐸 推送到 Gitee（国内镜像）
echo ============================================================
echo   源目录：%CD%\dist-cn
echo   目标  ：%REPO%
echo ============================================================
echo.
echo   提示：令牌只在本次命令内使用，不会写入任何配置文件。
echo         获取方式：Gitee -^> 设置 -^> 安全设置 -^> 私人令牌 -^> 生成新令牌
echo         权限勾选 projects 即可。
echo.

set TOKEN=%~1
if "%TOKEN%"=="" set /p TOKEN=请粘贴 Gitee 访问令牌（回车确认）：

if "%TOKEN%"=="" (
  echo [X] 没有令牌，无法推送。
  pause & exit /b 1
)

cd /d "%~dp0..\dist-cn"
if not exist ".git" (
  echo [*] 初始化本地仓库…
  "%GIT_EXE%" init -q
  "%GIT_EXE%" branch -M main
  "%GIT_EXE%" add -A
  "%GIT_EXE%" -c user.name=naiwa-mirror -c user.email=naiwa@local commit -q -m "🐸 奶蛙观测站 · 国内镜像"
)

set PUSH_URL=https://oauth2:%TOKEN%@gitee.com/godblessweek/naiwa.git

echo.
echo [*] 推送中…（首次约需 10-30 秒）
"%GIT_EXE%" push -f "%PUSH_URL%" main
set CODE=%errorlevel%

if %CODE%==0 (
  echo.
  echo ============================================================
  echo   [√] 推送成功！
  echo ============================================================
  echo.
  echo   接下来（网页操作，只需一次）：
  echo     1. 打开 https://gitee.com/godblessweek/naiwa
  echo     2. 顶部菜单「服务」-^> 「Gitee Pages」
  echo     3. 部署分支选 main，部署目录留空
  echo     4. 勾选「强制 HTTPS」，点「启动」
  echo     5. 得到地址：https://godblessweek.gitee.io/naiwa
  echo.
  echo   以后每次更新：重新跑这个脚本，再回网页点一次「更新」。
  echo ============================================================
) else (
  echo.
  echo [X] 推送失败（错误码 %CODE%）。常见原因：
  echo     - 令牌错误或已过期（重新生成一个）
  echo     - 令牌权限不足（需要 projects 权限）
  echo     - 仓库地址不对：%REPO%
  echo     - 网络问题（重试一次）
)

echo.
pause
endlocal
