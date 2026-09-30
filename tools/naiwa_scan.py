#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 assets/naiwa-images/ 里**已经下载好的**图片扫描成数据模块。

用途：采集器是逐张下载的（Wikimedia 比较慢），如果你中途停下来，
用这个脚本可以立刻把已下载的图片变成可用的数据模块，不必重跑采集。

用法：
    python tools/naiwa_scan.py
    python tools/naiwa_scan.py --source "Wikimedia Commons · Ranidae 蛙科分类"

产出与采集器一致：
    manifest.json / derived.json / naiwa-data.js
"""
import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from naiwa_crawler import (  # noqa: E402
    OUT_DIR, img_dims, is_image, build_derived, write_outputs, print_summary,
)

EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".bmp")


def main() -> int:
    ap = argparse.ArgumentParser(description="扫描已下载的奶蛙图片并生成数据模块")
    ap.add_argument("--dir", default=OUT_DIR, help="图片目录（默认 assets/naiwa-images）")
    ap.add_argument("--source", default="Wikimedia Commons（自由授权）", help="来源名称，写进清单")
    ap.add_argument("--license", default="free", help="授权名称，写进清单")
    args = ap.parse_args()

    if not os.path.isdir(args.dir):
        print(f"✖ 找不到目录：{args.dir}")
        return 1

    images = []
    files = sorted(f for f in os.listdir(args.dir)
                   if f.lower().endswith(EXTS) and os.path.isfile(os.path.join(args.dir, f)))
    for name in files:
        path = os.path.join(args.dir, name)
        with open(path, "rb") as fh:
            data = fh.read()
        if not is_image(data, ""):
            continue
        w, h, fmt = img_dims(data)
        images.append({
            "url": f"(本地文件) {name}",
            "source": args.source,
            "license": args.license,
            "file": name,
            "sha1": hashlib.sha1(data).hexdigest(),
            "bytes": len(data),
            "width": w,
            "height": h,
            "fmt": fmt,
            "status": "downloaded",
            "error": "",
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "derived": [],
        })
        print(f"  · {name}  {w}×{h}  {len(data)//1024}KB  [{fmt}]")

    if not images:
        print("📭 目录里没有可用图片。先跑：python tools/naiwa_crawler.py --limit 20")
        return 1

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": [{"name": args.source, "url": "", "license": args.license,
                     "kind": "local-scan", "note": "由 tools/naiwa_scan.py 扫描已下载文件生成"}],
        "images": images,
        "stats": {
            "candidates": len(images), "downloaded": len(images), "dup": 0,
            "failed": 0, "filtered": 0, "robots_blocked": 0,
            "by_source": {args.source: len(images)},
        },
    }
    write_outputs(manifest, args.dir, False)
    print_summary(manifest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
