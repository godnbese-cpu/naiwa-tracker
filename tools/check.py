#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自检脚本：把每个 HTML 页面里的内联 <script> 抽出来，交给 node --check 做语法校验。
同时检查关键资源引用是否存在、ID 引用是否都有对应元素。

用法：
    python tools/check.py
退出码 0 = 全部通过；1 = 有问题。
"""
import os
import re
import subprocess
import sys
import tempfile

# Windows 控制台默认 GBK，强制 UTF-8 输出，避免中文/emoji 报错
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE_CANDIDATES = [
    r"C:\Users\38197\.workbuddy\binaries\node\versions\22.22.2\node.exe",
    r"C:\Users\38197\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe",
    "node",
]

PAGES = ["index.html", "battle.html", "race.html", "shop.html", "lab.html", "404.html"]
SCRIPT_RE = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S | re.I)
SRC_RE = re.compile(r"<script[^>]*\bsrc=[\"']([^\"']+)[\"']", re.I)
GETEL_RE = re.compile(r"""getElementById\(\s*["']([^"']+)["']\s*\)""")
ID_RE = re.compile(r"""\bid=["']([^"']+)["']""")


def find_node():
    for c in NODE_CANDIDATES:
        if os.path.sep in c:
            if os.path.exists(c):
                return c
        else:
            from shutil import which
            p = which(c)
            if p:
                return p
    return None


def check_js(node, name, code):
    if not code.strip():
        return True, "空脚本，跳过"
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False,
                                     encoding="utf-8", newline="\n") as f:
        f.write(code)
        path = f.name
    try:
        r = subprocess.run([node, "--check", path], capture_output=True, text=True)
        if r.returncode == 0:
            return True, "语法 OK"
        return False, (r.stderr or r.stdout).strip()[:1500]
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def main():
    node = find_node()
    if not node:
        print("✖ 找不到 node，无法做 JS 语法校验。")
        print("  可以手动跑：node --check <文件>")
        return 1
    print(f"🔧 使用 node：{node}\n")

    problems = []
    for page in PAGES:
        path = os.path.join(ROOT, page)
        if not os.path.exists(path):
            print(f"⚠️  缺少页面：{page}")
            problems.append(f"{page} 不存在")
            continue
        html = open(path, "r", encoding="utf-8").read()
        print(f"📄 {page}")

        # 1) 内联脚本语法
        blocks = SCRIPT_RE.findall(html)
        for i, code in enumerate(blocks, 1):
            ok, msg = check_js(node, f"{page}#{i}", code)
            tag = "  ✅" if ok else "  ❌"
            print(f"{tag} 内联脚本 #{i}（{len(code)} 字符）：{msg.splitlines()[0] if msg else ''}")
            if not ok:
                problems.append(f"{page} 第 {i} 段内联脚本语法错误：\n{msg}")

        # 2) 外部脚本引用是否存在
        for src in SRC_RE.findall(html):
            if src.startswith(("http:", "https:", "//")):
                continue
            p = os.path.join(ROOT, src.replace("/", os.sep))
            if not os.path.exists(p):
                # lab.html 的数据模块允许不存在
                if "naiwa-data.js" in src:
                    print(f"  ℹ️  可选数据模块尚未生成：{src}（跑一次爬虫即可）")
                else:
                    print(f"  ❌ 引用的脚本不存在：{src}")
                    problems.append(f"{page} 引用了不存在的脚本 {src}")

        # 3) getElementById 是否有对应 id
        ids = set(ID_RE.findall(html))
        for gid in sorted(set(GETEL_RE.findall(html))):
            if gid not in ids:
                print(f"  ❌ getElementById('{gid}') 找不到对应元素")
                problems.append(f"{page} 缺少 id=\"{gid}\" 的元素")
        print()

    # 4) 关键资源
    print("📦 关键资源")
    for f in ["naiwa.webp", "naiwa-standing.webp", "naiwa-smiling.webp", "naiwa-thinking.webp",
              "naiwa-common.js", "assets/fighters.js", "assets/naiwa-charts.js", "assets/frog-rig.js", "world.json",
              "README.md", "DEPLOY.md", ".gitignore", ".github/workflows/pages.yml",
              "tools/naiwa_crawler.py", "tools/naiwa_data.py", "404.html"]:
        p = os.path.join(ROOT, f.replace("/", os.sep))
        ok = os.path.exists(p)
        print(f"  {'✅' if ok else '❌'} {f}" + ("" if ok else "  ← 缺失"))
        if not ok:
            problems.append(f"缺少文件 {f}")

    print("\n" + "=" * 60)
    if problems:
        print(f"❌ 发现 {len(problems)} 个问题：")
        for i, p in enumerate(problems, 1):
            print(f"\n[{i}] {p}")
        return 1
    print("✅ 全部检查通过：语法、引用、元素 id、关键资源都正常。")
    return 0


if __name__ == "__main__":
    sys.exit(main())

