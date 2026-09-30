#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================
 🗺️ 地图数据瘦身器  (naiwa_shrink_map.py)
================================================================

为什么要它
----------
`world.json` 有 987 KB，而首页首屏总共要下 2.19 MB。在同一条抖动的
链路上，这是致命的——小页面能打开，大页面断在半路。

这个脚本把 GeoJSON 压缩到原来的零头：
  1. 坐标精度从 6~7 位小数降到可配置位数（1 位 ≈ 11 公里，画地图足够）
  2. 丢掉面积很小的多边形（小岛、飞地）——可配置阈值
  3. 按「道格拉斯-普克」简化轮廓点，保留形状特征
  4. 丢掉用不到的属性字段，只留 name
  5. 顺便输出一份「每个国家的多边形数量」报告

用法
----
    python tools/naiwa_shrink_map.py                       # 默认参数
    python tools/naiwa_shrink_map.py --precision 1 --min-area 1.5
    python tools/naiwa_shrink_map.py --dry-run             # 只看压缩率
================================================================
"""

from __future__ import annotations

import argparse
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "world.json")
# 输出到两个地方：站点根目录（首页 fetch 用）+ 静态包目录
OUTS = [
    os.path.join(ROOT, "world.json"),
    os.path.join(ROOT, "dist-cn", "world.json"),
]


def log(m):
    print(m, flush=True)


# 重点地区保护名单：这些地方面积很小（新加坡/香港/台湾…），
# 但恰好是有真实访问数据的地区，绝不能被面积阈值筛掉。
KEEP_NAMES = {
    "Taiwan", "Hong Kong", "Macau", "Singapore", "Bahrain", "Malta",
    "Luxembourg", "Cyprus", "Brunei", "Palestine", "Kuwait", "Qatar",
    "Lebanon", "Israel", "Djibouti", "Gambia", "Eswatini", "Lesotho",
}


def rdp(points, eps):
    """道格拉斯-普克简化。eps 单位与坐标一致（度）。"""
    if len(points) < 3 or eps <= 0:
        return points
    # 迭代实现，避免超长轮廓递归爆栈
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        ax, ay = points[i]
        bx, by = points[j]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        best, bi = -1.0, -1
        for k in range(i + 1, j):
            px, py = points[k]
            if seg2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / seg2
                t = 0.0 if t < 0 else (1.0 if t > 1 else t)
                d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if d2 > best:
                best, bi = d2, k
        if best > eps * eps and bi > 0:
            keep[bi] = True
            stack.append((i, bi))
            stack.append((bi, j))
    return [p for p, k in zip(points, keep) if k]


def ring_area(ring):
    a = 0.0
    for i in range(len(ring) - 1):
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(a) / 2


def main() -> int:
    ap = argparse.ArgumentParser(description="压缩 world.json 地图数据")
    ap.add_argument("--src", default=SRC)
    ap.add_argument("--precision", type=int, default=1,
                    help="坐标保留小数位（1 位 ≈ 11 公里，默认 1）")
    ap.add_argument("--min-area", type=float, default=1.0,
                    help="丢弃面积小于该值的多边形（平方度，默认 1.0）")
    ap.add_argument("--simplify", type=float, default=0.02,
                    help="轮廓简化容差（度，0 = 不简化，默认 0.02）")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(args.src):
        log(f"✖ 找不到 {args.src}")
        return 1
    before = os.path.getsize(args.src)
    log(f"📖 读取 {args.src}（{before/1024:.0f} KB）")

    with open(args.src, "r", encoding="utf-8") as f:
        geo = json.load(f)

    q = 10 ** args.precision
    kept_feat = dropped_feat = kept_poly = dropped_poly = 0
    out_features = []

    for feat in geo.get("features", []):
        props = feat.get("properties") or {}
        name = props.get("name")
        g = feat.get("geometry")
        if not name or not g or not g.get("coordinates"):
            dropped_feat += 1
            continue

        raw_polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        protected = name in KEEP_NAMES
        new_polys = []
        for poly in raw_polys:
            if not poly or len(poly[0]) < 4:
                continue
            outer = poly[0]
            # 受保护地区不做面积筛选（宁可贵一点也要把地图画全）
            if not protected and ring_area(outer) < args.min_area:
                dropped_poly += 1
                continue
            rings = []
            for ri, ring in enumerate(poly):
                # 只保留外环和内环；内环也要简化，但用更小的阈值避免洞消失
                eps = args.simplify * (1.0 if ri == 0 else 0.5)
                simp = rdp(ring, eps) if args.simplify > 0 else ring
                if len(simp) < 4:
                    if ri > 0:
                        continue          # 内环太小就丢掉，别让洞破形
                    simp = ring
                quant = [[round(x * q) / q, round(y * q) / q] for x, y in simp]
                # 去掉连续重复点
                dedup = [quant[0]]
                for pt in quant[1:]:
                    if pt != dedup[-1]:
                        dedup.append(pt)
                if len(dedup) >= 4:
                    rings.append(dedup)
            if rings:
                new_polys.append(rings)
                kept_poly += 1

        if not new_polys:
            dropped_feat += 1
            continue

        out_features.append({
            "type": "Feature",
            "properties": {"name": name},
            "geometry": {
                "type": "Polygon" if len(new_polys) == 1 and raw_polys and
                        g["type"] == "Polygon" else "MultiPolygon",
                "coordinates": new_polys[0] if (len(new_polys) == 1 and raw_polys and
                                                g["type"] == "Polygon") else new_polys,
            },
        })
        kept_feat += 1

    out = {"type": "FeatureCollection", "features": out_features}
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    after = len(text.encode("utf-8"))

    log(f"✅ 国家要素：保留 {kept_feat} / 丢弃 {dropped_feat}")
    log(f"   多边形：保留 {kept_poly} / 丢弃 {dropped_poly}")
    log(f"📉 体积：{before/1024:.0f} KB → {after/1024:.0f} KB"
        f"（压缩到 {after/before*100:.1f}%）")

    if args.dry_run:
        log("🧪 干跑模式：未写文件")
        return 0

    for dst in OUTS:
        if os.path.isdir(os.path.dirname(dst)):
            with open(dst, "w", encoding="utf-8") as f:
                f.write(text)
            log(f"💾 已写出 {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
