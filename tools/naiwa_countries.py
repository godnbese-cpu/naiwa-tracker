#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================
 🐸 真实分国家访问量 · 静态数据生成器  (naiwa_countries.py)
================================================================

为什么需要它
------------
原来首页地图是在浏览器里**实时调用** Wikimedia 的 API 拿分国家数据。
问题是：那个 API 在国内访问不稳定，而且多一次跨域请求就多一次失败机会。

这个脚本改成**构建期一次性抓取 → 落成本地静态文件**，
之后浏览器只读同源文件，**零外部请求**，谁都能打开。

产出
----
    assets/naiwa-data/countries.json     真实分国家访问量（ISO 码）
    assets/naiwa-data/naiwa-countries.js 前端可直接引用的数据模块

用法
----
    python tools/naiwa_countries.py                 # 抓最近 3 个月
    python tools/naiwa_countries.py --months 3
    python tools/naiwa_countries.py --dry-run       # 只看结果不写文件
================================================================
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "naiwa-data")

UA = ("NaiwaTrackerBot/1.0 (non-commercial fan project; "
      "+https://github.com/godnbese-cpu/naiwa-tracker)")
API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top-by-country/{proj}/all-access/{y}/{m}"

# 语言版本：覆盖面越广，分国家数据越完整
PROJECTS = [
    "en.wikipedia", "zh.wikipedia", "ja.wikipedia", "ko.wikipedia",
    "vi.wikipedia", "th.wikipedia", "id.wikipedia", "ms.wikipedia",
    "hi.wikipedia", "ru.wikipedia", "de.wikipedia", "fr.wikipedia",
    "es.wikipedia", "it.wikipedia", "pt.wikipedia", "ar.wikipedia",
    "tr.wikipedia", "pl.wikipedia",
]


def log(msg):
    print(msg, flush=True)


def get_json(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "ignore"))


def recent_months(n):
    """最近 n 个已结束的月份，最新的在前。"""
    today = datetime.now(timezone.utc).replace(day=1)
    out, y, m = [], today.year, today.month
    for _ in range(n):
        m -= 1
        if m == 0:
            m, y = 12, y - 1
        out.append((str(y), f"{m:02d}"))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="生成真实分国家访问量静态数据")
    ap.add_argument("--months", type=int, default=3, help="累计月数（默认 3）")
    ap.add_argument("--out", default=OUT_DIR)
    ap.add_argument("--delay", type=float, default=0.2, help="请求间隔秒")
    ap.add_argument("--timeout", type=int, default=15, help="单次请求超时秒")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    months = recent_months(args.months)
    log(f"📅 统计月份：{', '.join(y + '-' + m for y, m in months)}")
    log(f"🌐 语言版本：{len(PROJECTS)} 个\n")

    totals: dict[str, int] = {}
    ok = fail = 0
    total_req = len(PROJECTS) * len(months)
    done = 0

    for proj in PROJECTS:
        got = 0
        for (y, m) in months:
            url = API.format(proj=proj, y=y, m=m)
            done += 1
            try:
                d = get_json(url, timeout=args.timeout)
            except Exception:
                fail += 1
                print(f"    [{done}/{total_req}] {proj} {y}-{m} ✖", flush=True)
                time.sleep(args.delay)
                continue
            for it in d.get("items", []):
                for c in it.get("countries", []):
                    cc = c.get("country")
                    if not cc or cc == "--":
                        continue
                    totals[cc] = totals.get(cc, 0) + int(c.get("views_ceil") or 0)
            got += 1
            ok += 1
            print(f"    [{done}/{total_req}] {proj} {y}-{m} ✓", flush=True)
            time.sleep(args.delay)
        if got == 0:
            log(f"  ⚠️ {proj} 全部月份都没取到")

    if not totals:
        log("\n❌ 一条数据都没取到，检查网络或换个月份再试。")
        return 1

    grand = sum(totals.values()) or 1
    ranked = sorted(totals.items(), key=lambda x: -x[1])

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "Wikimedia Pageviews API · top-by-country",
        "apiDoc": "https://wikimedia.org/api/rest_v1/",
        "months": [y + "-" + m for y, m in months],
        "projects": PROJECTS,
        "totalViews": grand,
        "countries": {k: v for k, v in ranked},
        "top": [{"iso": k, "views": v, "share": round(v / grand * 100, 4)}
                for k, v in ranked[:30]],
        "caveats": [
            "数据来源：Wikimedia 官方 top-by-country 接口，按 ISO 国家统计的真实去重访问量。",
            "已累计 " + str(len(months)) + " 个月、覆盖 " + str(len(PROJECTS)) + " 个语言版本。",
            "该接口对低于 1000 的访问量做区间合并（隐私保护），极低频国家会偏小。",
            "⚠️ 维基百科在中国大陆无法直接访问，因此「中国大陆(CN)」在这份数据里被严重低估。",
            "维基百科访问量反映「查证/了解意愿」，不等于短视频播放量或表情包使用次数。",
        ],
    }

    log(f"\n{'='*58}")
    log(f" ✅ 成功 {ok} 次 / 失败 {fail} 次")
    log(f" 📊 覆盖 {len(totals)} 个国家/地区，总计 {grand:,} 次")
    log(f" 🏆 前 10：")
    for iso, v in ranked[:10]:
        log(f"      {iso:<4} {v:>15,}  {v/grand*100:>6.2f}%")
    log(f"{'='*58}")

    if args.dry_run:
        log("🧪 干跑模式：未写文件")
        return 0

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "countries.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(args.out, "naiwa-countries.js"), "w", encoding="utf-8") as f:
        f.write("/* 自动生成 · 请勿手改 —— python tools/naiwa_countries.py */\n")
        f.write("/* 数据来源：Wikimedia Pageviews API（top-by-country，真实分国家访问量） */\n")
        f.write("(function(g){g.NAIWA_COUNTRIES=")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";})(typeof window!=='undefined'?window:globalThis);\n")

    log(f"\n📦 已写出：")
    log(f"  {os.path.join(args.out, 'countries.json')}")
    log(f"  {os.path.join(args.out, 'naiwa-countries.js')}")
    log("\n👉 首页会自动读取这个文件，浏览器不再需要访问任何外部 API。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
