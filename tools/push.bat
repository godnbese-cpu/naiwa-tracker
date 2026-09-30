@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title 奶蛙观测站 · 补推未上传的提交

cd /d "%~dp0.."
echo ============================================================
echo   🐸 补推助手：把本地还没上传的提交推到 GitHub
echo ============================================================
echo   工作目录：%CD%
echo.
echo   用法：
echo     push.bat                  用已配置的凭据推送
echo     push.bat ghp_你的token    用指定 token 推送（不写入任何配置文件）
echo.
echo   注意：如果你要推送 .github/workflows/ 里的文件，
echo         token 必须带 workflow 权限，否则 GitHub 会拒绝。
echo         （当前这个工作流文件已在本地排除，不影响推送）
echo ============================================================
echo.

set TOKEN=%~1
if "%TOKEN%"=="" (
  set REMOTE=https://github.com/godnbese-cpu/naiwa-tracker.git
) else (
  set REMOTE=https://godnbese-cpu:!TOKEN!@github.com/godnbese-cpu/naiwa-tracker.git
)

echo [*] 本地待推送的提交：
git log --oneline origin/main..HEAD 2>nul
if errorlevel 1 git log --oneline -n 3
echo.

for /l %%i in (1,1,6) do (
  echo [*] 第 %%i 次推送尝试…
  git push "!REMOTE!" main
  if !errorlevel! equ 0 (
    echo.
    echo [√] 推送成功！约 1 分钟后生效：
    echo     https://godnbese-cpu.github.io/naiwa-tracker/
    goto done
  )
  echo    失败，等 6 秒重试…
  timeout /t 6 /nobreak >nul
)

echo.
echo [X] 6 次都失败了。常见原因：
echo     - 网络到 github.com:443 不通（换网络 / 开代理后再试）
echo     - token 无效或已过期（去 GitHub 重新生成）
echo     - token 缺 workflow 权限（只影响 .github/workflows/ 下的文件）
echo.
echo 手动重试：
echo     git push https://github.com/godnbese-cpu/naiwa-tracker.git main

:done
echo.
pause
endlocal
