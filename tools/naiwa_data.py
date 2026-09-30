#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================
 🐸 奶蛙数据模块 · 读取与分析  (naiwa_data.py)
================================================================

把采集器产出的 manifest.json 读成一等公民数据结构，并提供
统计分析、筛选、导出能力。零第三方依赖。

用法
----
    from naiwa_data import load, stats, tops, by_license, export_json

    d = load()                       # 找不到清单时返回空骨架，不抛异常
    print(stats(d)["count"], "张图片")
    for row in tops(d, 5):
        print(row["file"], row["width"], "×", row["height"])

命令行
------
    python tools/naiwa_data.py stats
    python tools/naiwa_data.py list --limit 20
    python tools/naiwa_data.py export --out naiwa-export.json
================================================================
"""

from __future__ import annotations

import json
import os
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "assets", "naiwa-images", "manifest.json")
DERIVED = os.path.join(ROOT, "assets", "naiwa-images", "derived.json")

EMPTY = {"generated_at": "", "sources": [], "images": [], "stats": {}}


# ------------------------------------------------------------------
def load(path: str | None = None) -> dict:
    """读取图片清单；文件不存在或损坏时返回空骨架。"""
    p = path or MANIFEST
    if not os.path.exists(p):
        return dict(EMPTY)
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"⚠️  清单解析失败（{p}）：{e}", file=sys.stderr)
        return dict(EMPTY)
    data.setdefault("images", [])
    data.setdefault("sources", [])
    data.setdefault("stats", {})
    return data


def load_derived(path: str | None = None) -> dict:
    p = path or DERIVED
    if not os.path.exists(p):
        return {}
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


# ------------------------------------------------------------------
def ok_images(data: dict) -> list[dict]:
    """只要真正下载成功、且文件确实存在于磁盘上的条目。"""
    out = []
    base = os.path.dirname(MANIFEST)
    for rec in data.get("images", []):
        if rec.get("status") != "downloaded":
            continue
        f = rec.get("file")
        rec = dict(rec)
        rec["exists"] = bool(f) and os.path.exists(os.path.join(base, f))
        out.append(rec)
    return out


def stats(data: dict | None = None) -> dict:
    data = data or load()
    imgs = ok_images(data)
    sizes = [i.get("bytes", 0) for i in imgs]
    dims = [(i.get("width", 0), i.get("height", 0)) for i in imgs]
    sq = sum(1 for w, h in dims if w and h and abs(w - h) <= max(w, h) * 0.15)
    return {
        "count": len(imgs),
        "total_bytes": sum(sizes),
        "total_mb": round(sum(sizes) / 1048576, 2),
        "avg_kb": round(sum(sizes) / len(sizes) / 1024, 1) if sizes else 0,
        "max_px": max((w * h for w, h in dims), default=0),
        "square_ratio": round(sq / len(imgs), 3) if imgs else 0,
        "licenses": dict(Counter(i.get("license", "unknown") for i in imgs)),
        "sources": dict(Counter(i.get("source", "?") for i in imgs)),
        "formats": dict(Counter((i.get("fmt") or "?").lower() for i in imgs)),
        "missing_files": sum(1 for i in imgs if not i["exists"]),
        "generated_at": data.get("generated_at", ""),
    }


def by_license(data: dict, lic: str) -> list[dict]:
    return [i for i in ok_images(data) if i.get("license") == lic]


def search(data: dict, kw: str) -> list[dict]:
    kw = kw.lower()
    return [i for i in ok_images(data)
            if kw in (i.get("url", "") + i.get("file", "") + i.get("source", "")).lower()]


def tops(data: dict, n: int = 10, key: str = "px") -> list[dict]:
    imgs = ok_images(data)

    def score(i):
        if key == "bytes":
            return i.get("bytes", 0)
        if key == "square":
            w, h = i.get("width", 0), i.get("height", 0)
            return -(abs(w - h)) * 1000 + w * h
        return i.get("width", 0) * i.get("height", 0)

    return sorted(imgs, key=score, reverse=True)[:n]


def export_json(data: dict | None = None, out: str = "naiwa-export.json") -> str:
    data = data or load()
    payload = {
        "stats": stats(data),
        "images": ok_images(data),
        "derived": load_derived(),
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return os.path.abspath(out)


# ------------------------------------------------------------------
def _cli(argv: list[str]) -> int:
    cmd = argv[0] if argv else "stats"
    data = load()

    if cmd == "stats":
        s = stats(data)
        if not s["count"]:
            print("📭 还没有图片。先运行：python tools/naiwa_crawler.py --limit 60")
            return 0
        print("\n🐸 奶蛙图片库统计")
        print("-" * 46)
        print(f"  数量        : {s['count']} 张")
        print(f"  总体积      : {s['total_mb']} MB（平均 {s['avg_kb']} KB）")
        print(f"  方图占比    : {s['square_ratio']*100:.1f}%（适合做头像/立绘）")
        print(f"  最大像素    : {s['max_px']:,}")
        print(f"  缺失文件    : {s['missing_files']}")
        print(f"  采集时间    : {s['generated_at']}")
        for k, v in (("授权分布", s["licenses"]), ("格式分布", s["formats"]), ("来源分布", s["sources"])):
            print(f"  {k}  :")
            for kk, vv in sorted(v.items(), key=lambda x: -x[1]):
                print(f"      {vv:>4}  {kk}")
        return 0

    if cmd == "list":
        n = 20
        if "--limit" in argv:
            try:
                n = int(argv[argv.index("--limit") + 1])
            except Exception:
                pass
        rows = tops(data, n)
        if not rows:
            print("📭 没有可用图片。")
            return 0
        print(f"{'文件':<50}{'尺寸':>12}{'KB':>8}  授权")
        print("-" * 84)
        for r in rows:
            dim = f"{r.get('width',0)}×{r.get('height',0)}"
            print(f"{r['file'][:48]:<50}{dim:>12}{r.get('bytes',0)//1024:>8}  {r.get('license','?')}")
        return 0

    if cmd == "export":
        out = "naiwa-export.json"
        if "--out" in argv:
            out = argv[argv.index("--out") + 1]
        p = export_json(data, out)
        print(f"✅ 已导出：{p}")
        return 0

    if cmd == "search":
        if len(argv) < 2:
            print("用法：python tools/naiwa_data.py search <关键词>")
            return 2
        rows = search(data, argv[1])
        print(f"🔍 命中 {len(rows)} 条")
        for r in rows[:40]:
            print("  ·", r["file"], "←", r["url"][:90])
        return 0

    print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(_cli(sys.argv[1:]))
