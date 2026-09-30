#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================
 🐸 国内镜像部署助手（Gitee Pages / 静态包导出）
================================================================

背景
----
`*.github.io` 在国内的可达性很不稳定（常被阻断），所以「别人打不开」
不是网站的问题，而是域名被墙。这个脚本提供两条出路：

  ① gitee  —— 把站点镜像到 Gitee 仓库，用 Gitee Pages 发布（国内直连）
  ② pack   —— 导出一个「零外部请求」的静态包，可以直接丢到任何国内
              虚拟主机 / 对象存储 / 宝塔面板上

用法
----
    # 只导出静态包（不需要任何账号，最省事）
    python tools/deploy_cn.py pack

    # 镜像到 Gitee（需要 Gitee 仓库地址与访问令牌）
    python tools/deploy_cn.py gitee --repo https://gitee.com/你的名字/naiwa-tracker.git
    python tools/deploy_cn.py gitee --repo <地址> --token <你的Gitee令牌>

    # 看看会打包哪些文件，不实际写
    python tools/deploy_cn.py pack --dry-run

⚠️ 说明
--------
- 脚本会先把「不应该发布的东西」排除掉：.git、tools、调试截图、构建缓存。
- 不会修改你的 GitHub 仓库，只是在本地另推一份到 Gitee。
- Gitee Pages 需要在网页端手动开启（服务 → Gitee Pages），
  并且需要实名认证。首次发布后，每次更新可以再点一次「更新」。
================================================================
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 需要发布的文件/目录（白名单思路：只发布站点真正需要的东西）
INCLUDE_FILES = [
    "index.html", "battle.html", "race.html", "shop.html", "lab.html", "404.html",
    "naiwa-common.js", "echarts.min.js", "world.json",
    "naiwa.webp", "naiwa-standing.webp", "naiwa-smiling.webp", "naiwa-thinking.webp",
    "README.md", ".nojekyll",
]
INCLUDE_DIRS = ["assets"]

# 明确排除
EXCLUDE_NAMES = {".git", ".github", "tools", "node_modules", "__pycache__",
                 "_shots", "dump", ".acl-recovery"}
EXCLUDE_EXT = {".pyc", ".log", ".tmp"}

# assets/naiwa-images/ 里的图片是采集来的素材，页面并不引用它们
# （12 位斗士用的是仓库根目录的 naiwa*.webp），带上只会白白多出几 MB。
EXCLUDE_IMAGE_DIR = os.path.join("assets", "naiwa-images")
EXCLUDE_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def find_git():
    """git 可能不在 PATH 里（本机就是这种情况），顺手找几个常见位置。"""
    exe = shutil.which("git")
    if exe:
        return exe
    for c in [
        r"C:\Users\38197\.workbuddy\vendor\PortableGit\cmd\git.exe",
        r"C:\Program Files\Git\cmd\git.exe",
        r"C:\Program Files (x86)\Git\cmd\git.exe",
    ]:
        if os.path.exists(c):
            return c
    return None


def collect(out_dir):
    """把要发布的文件复制到 out_dir。"""
    os.makedirs(out_dir, exist_ok=True)
    n_files = n_bytes = 0

    def copy_one(src, dst):
        nonlocal n_files, n_bytes
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        n_files += 1
        n_bytes += os.path.getsize(dst)

    for f in INCLUDE_FILES:
        p = os.path.join(ROOT, f)
        if os.path.exists(p):
            copy_one(p, os.path.join(out_dir, f))

    for d in INCLUDE_DIRS:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            continue
        for cur, dirs, files in os.walk(base):
            dirs[:] = [x for x in dirs if x not in EXCLUDE_NAMES]
            for fn in files:
                if fn in EXCLUDE_NAMES or os.path.splitext(fn)[1] in EXCLUDE_EXT:
                    continue
                src = os.path.join(cur, fn)
                rel = os.path.relpath(src, ROOT)
                # 跳过采集素材的图片本体（页面不引用，避免包体虚高）
                if rel.startswith(EXCLUDE_IMAGE_DIR) and os.path.splitext(fn)[1].lower() in EXCLUDE_IMAGE_EXT:
                    continue
                copy_one(src, os.path.join(out_dir, rel))

    return n_files, n_bytes


def cmd_pack(args):
    out = os.path.abspath(args.out)
    print(f"📦 导出静态包 → {out}")
    if args.dry_run:
        print("🧪 干跑：只列出会打包的文件\n")
        n = 0
        for f in INCLUDE_FILES:
            p = os.path.join(ROOT, f)
            if os.path.exists(p):
                print("  +", f); n += 1
        for d in INCLUDE_DIRS:
            base = os.path.join(ROOT, d)
            if not os.path.isdir(base):
                continue
            for cur, dirs, files in os.walk(base):
                dirs[:] = [x for x in dirs if x not in EXCLUDE_NAMES]
                for fn in files:
                    if fn in EXCLUDE_NAMES or os.path.splitext(fn)[1] in EXCLUDE_EXT:
                        continue
                    print("  +", os.path.relpath(os.path.join(cur, fn), ROOT)); n += 1
        print(f"\n共 {n} 个文件")
        return 0

    n_files, n_bytes = collect(out)
    print(f"✅ 完成：{n_files} 个文件，{n_bytes/1048576:.2f} MB")
    print("\n下一步（任选）：")
    print("  1) 直接丢到国内虚拟主机 / 对象存储 / 宝塔面板 → 解压即用")
    print("  2) 上传到 Gitee 仓库并开启 Gitee Pages")
    print("  3) 本地预览：进入该目录执行  python -m http.server 8080")
    print("\n💡 这个包里没有任何外部请求，断网也能正常显示。")
    return 0


def cmd_gitee(args):
    git = find_git()
    if not git:
        print("✖ 找不到 git，无法推送。请安装 Git 或把 git 加进 PATH。")
        return 2

    repo = args.repo
    if not repo:
        print("✖ 需要 --repo，例如：")
        print("    python tools/deploy_cn.py gitee --repo https://gitee.com/你的名字/naiwa-tracker.git")
        return 2

    token = args.token or os.environ.get("GITEE_TOKEN", "")
    if token:
        # 把令牌嵌进 URL（只在本次命令内使用，不写入任何配置文件）
        import re
        m = re.match(r"https://(?:[^@/]+@)?gitee\.com/(.+)", repo)
        if m:
            repo = f"https://oauth2:{token}@gitee.com/{m.group(1)}"
            print("🔑 已使用提供的访问令牌（不会写入 git 配置）")

    pack_dir = os.path.abspath(args.out)
    print(f"📦 先导出静态包 → {pack_dir}")
    if os.path.isdir(pack_dir):
        shutil.rmtree(pack_dir)
    n_files, n_bytes = collect(pack_dir)
    print(f"    {n_files} 个文件，{n_bytes/1048576:.2f} MB")

    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"   # 不弹交互
    env["GIT_ASKPASS"] = "echo"

    def run(*cmd, cwd=pack_dir):
        print("  $", " ".join(c if isinstance(c, str) else c for c in cmd))
        r = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True)
        if r.stdout.strip():
            print("   ", r.stdout.strip()[:400])
        if r.returncode != 0 and r.stderr.strip():
            print("   ⚠️", r.stderr.strip()[:400])
        return r.returncode

    if not os.path.isdir(os.path.join(pack_dir, ".git")):
        run(git, "init")
        run(git, "branch", "-M", "main")
    run(git, "-c", "user.name=naiwa-mirror", "-c", "user.email=naiwa@local",
        "add", "-A")
    run(git, "-c", "user.name=naiwa-mirror", "-c", "user.email=naiwa@local",
        "commit", "-m", args.message or "🐸 奶蛙观测站 · 国内镜像同步")
    code = run(git, "push", "-f", repo, "main")

    print()
    if code == 0:
        print("✅ 已推送到 Gitee。接下来（网页操作，只需一次）：")
        print("   1. 打开你的 Gitee 仓库 → 服务 → Gitee Pages")
        print("   2. 部署分支选 main，目录留空，勾选强制 HTTPS")
        print("   3. 点『启动』，会得到一个 gitee.io 地址，国内可直接访问")
        print("   4. 以后每次更新，再来这里点一次『更新』即可")
        return 0
    print("❌ 推送失败。常见原因：")
    print("   · 仓库地址不对（要在 Gitee 上先建好同名仓库）")
    print("   · 令牌权限不足或已过期（需要 projects 权限）")
    print("   · 需要实名认证后才能使用 Gitee Pages")
    return 1


def main():
    ap = argparse.ArgumentParser(
        description="国内镜像部署助手（Gitee Pages / 静态包导出）",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")

    p1 = sub.add_parser("pack", help="导出零外部依赖的静态包")
    p1.add_argument("--out", default=os.path.join(ROOT, "dist-cn"))
    p1.add_argument("--dry-run", action="store_true")
    p1.set_defaults(func=cmd_pack)

    p2 = sub.add_parser("gitee", help="镜像到 Gitee 并使用 Gitee Pages")
    p2.add_argument("--repo", help="Gitee 仓库地址（https 形式）")
    p2.add_argument("--token", help="Gitee 访问令牌（也可用环境变量 GITEE_TOKEN）")
    p2.add_argument("--out", default=os.path.join(ROOT, "dist-cn"))
    p2.add_argument("--message", help="提交说明")
    p2.set_defaults(func=cmd_gitee)

    args = ap.parse_args()
    if not args.cmd:
        ap.print_help()
        print("\n最省事的用法（不需要账号）：python tools/deploy_cn.py pack")
        return 0
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
