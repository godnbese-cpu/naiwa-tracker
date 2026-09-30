#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================
 🐸 奶蛙数据模块 · 真实流量采集器  (naiwa_pageviews.py)
================================================================

为什么需要它
------------
首页那张世界地图原来是**纯推演**的数字（手写的百分比 + 随机抖动）。
这个脚本改用 Wikimedia 官方开放的 **Pageviews API**，拿到**真实测得**的
页面访问量，让地图分区有真实依据。

API
---
    https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/
        {project}/all-access/user/{article}/monthly/{start}/{end}

- 数据来源：Wikimedia REST API（官方开放，无需密钥）
- 粒度：按「维基百科语言版本」×「月份」的真实访问量
- 维度：per-article（具体条目），也可以取 project 总量

⚠️ 诚实的边界说明
------------------
1. 维基百科访问量 ≈ **有查证/了解意愿的人群**，不等于抖音播放量，
   也不等于奶蛙表情包的实际使用次数。两者只能当作「热度风向标」。
2. 数据按**语言版本**统计，不是按国家。语言版本与国家的对应关系在
   下面的 LANG_REGION 里，属于**合理近似**，脚本会把这一点写进产出文件。
3. 适合当基准的条目：`奶龙`（奶蛙的共同源头，中文维基真实条目）。
   `Frog` / `青蛙` 这类通用条目可用作对照基线。

用法
----
    python tools/naiwa_pageviews.py                 # 采集并写出数据模块
    python tools/naiwa_pageviews.py --months 18     # 取最近 18 个月
    python tools/naiwa_pageviews.py --articles 奶龙 naiwa 青蛙
    python tools/naiwa_pageviews.py --dry-run       # 只看能拿到什么，不写文件
================================================================
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "naiwa-data")
OUT_JS = os.path.join(OUT_DIR, "naiwa-reality.js")
OUT_JSON = os.path.join(OUT_DIR, "reality.json")

UA = "NaiwaTrackerBot/1.0 (non-commercial fan project; +https://github.com/godnbese-cpu/naiwa-tracker)"
API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{proj}/all-access/user/{art}/monthly/{s}/{e}"
# 整个语言版本的总流量（用来算「真实地区权重」，比条目本身可靠得多）
API_PROJECT = "https://wikimedia.org/api/rest_v1/metrics/pageviews/aggregate/{proj}/all-access/user/monthly/{s}/{e}"
# 真实分国家访问量（最有价值的接口：Wikimedia 直接按国家给数据）
API_TOP_COUNTRY = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top-by-country/{proj}/all-access/{y}/{m}"

# ISO 国家代码 → 中文名（覆盖首页地图上用到的主要国家 + 常见地区）
CC_TO_ZH = {
    "CN": "中国", "TW": "台湾地区", "HK": "香港地区", "MO": "澳门地区",
    "US": "美国", "JP": "日本", "KR": "韩国", "KP": "朝鲜",
    "IN": "印度", "TH": "泰国", "VN": "越南", "MY": "马来西亚", "SG": "新加坡",
    "ID": "印度尼西亚", "PH": "菲律宾", "MM": "缅甸", "KH": "柬埔寨", "LA": "老挝",
    "BN": "文莱", "TL": "东帝汶", "NP": "尼泊尔", "PK": "巴基斯坦", "BD": "孟加拉国",
    "LK": "斯里兰卡", "MN": "蒙古", "KZ": "哈萨克斯坦", "UZ": "乌兹别克斯坦",
    "GB": "英国", "IE": "爱尔兰", "FR": "法国", "DE": "德国", "IT": "意大利",
    "ES": "西班牙", "PT": "葡萄牙", "NL": "荷兰", "BE": "比利时", "CH": "瑞士",
    "AT": "奥地利", "SE": "瑞典", "NO": "挪威", "DK": "丹麦", "FI": "芬兰",
    "IS": "冰岛", "PL": "波兰", "CZ": "捷克", "SK": "斯洛伐克", "HU": "匈牙利",
    "RO": "罗马尼亚", "BG": "保加利亚", "GR": "希腊", "HR": "克罗地亚",
    "RS": "塞尔维亚", "SI": "斯洛文尼亚", "UA": "乌克兰", "BY": "白俄罗斯",
    "RU": "俄罗斯", "LT": "立陶宛", "LV": "拉脱维亚", "EE": "爱沙尼亚",
    "TR": "土耳其", "IL": "以色列", "SA": "沙特阿拉伯", "AE": "阿联酋",
    "QA": "卡塔尔", "KW": "科威特", "OM": "阿曼", "JO": "约旦", "LB": "黎巴嫩",
    "IQ": "伊拉克", "IR": "伊朗", "EG": "埃及", "MA": "摩洛哥", "DZ": "阿尔及利亚",
    "TN": "突尼斯", "LY": "利比亚", "NG": "尼日利亚", "KE": "肯尼亚",
    "ZA": "南非", "ET": "埃塞俄比亚", "GH": "加纳", "TZ": "坦桑尼亚",
    "UG": "乌干达", "SN": "塞内加尔", "CI": "科特迪瓦", "CM": "喀麦隆",
    "CA": "加拿大", "MX": "墨西哥", "BR": "巴西", "AR": "阿根廷", "CL": "智利",
    "CO": "哥伦比亚", "PE": "秘鲁", "VE": "委内瑞拉", "EC": "厄瓜多尔",
    "BO": "玻利维亚", "PY": "巴拉圭", "UY": "乌拉圭", "CU": "古巴",
    "DO": "多米尼加", "GT": "危地马拉", "CR": "哥斯达黎加", "PA": "巴拿马",
    "AU": "澳大利亚", "NZ": "新西兰", "FJ": "斐济", "PG": "巴布亚新几内亚",
}

# 维基百科语言版本 → 主要覆盖地区（合理近似，不是精确国别统计）
LANG_REGION = [
    ("zh.wikipedia", "中国",         "中文维基（含大陆/港台/海外华人）"),
    ("en.wikipedia", "美国",         "英文维基（全球，主要落在英语国家）"),
    ("ja.wikipedia", "日本",         "日文维基"),
    ("ko.wikipedia", "韩国",         "韩文维基"),
    ("vi.wikipedia", "越南",         "越南文维基"),
    ("th.wikipedia", "泰国",         "泰文维基"),
    ("id.wikipedia", "印度尼西亚",   "印尼文维基"),
    ("ms.wikipedia", "马来西亚",     "马来文维基"),
    ("hi.wikipedia", "印度",         "印地文维基"),
    ("ru.wikipedia", "俄罗斯",       "俄文维基"),
    ("de.wikipedia", "德国",         "德文维基"),
    ("fr.wikipedia", "法国",         "法文维基"),
    ("es.wikipedia", "西班牙",       "西班牙文维基"),
    ("it.wikipedia", "意大利",       "意大利文维基"),
    ("pt.wikipedia", "巴西",         "葡萄牙文维基"),
    ("ar.wikipedia", "埃及",         "阿拉伯文维基"),
    ("tr.wikipedia", "土耳其",       "土耳其文维基"),
    ("pl.wikipedia", "波兰",         "波兰文维基"),
]

# 候选条目：真正的奶蛙源头 + 对照基线
DEFAULT_ARTICLES = [
    ("奶龙", "奶蛙的共同源头。星野 AI 智能体畸变出的形象，中文维基有真实条目"),
    ("naiwa", "奶蛙的罗马字写法，中文维基条目别名"),
    ("青蛙", "通用条目，作为主要基线"),
    ("Frog", "通用条目英文版，作为国际基线"),
]


def log(msg, quiet=False):
    if not quiet:
        print(msg, flush=True)


def get_json(url: str, timeout: int = 25):
    """取 JSON；失败抛异常，由调用方决定怎么处理。"""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "ignore"))


def month_range(months: int):
    """返回 (start, end)，格式 YYYYMMDD00，end 取上个月末（当月数据不完整）。"""
    today = datetime.now(timezone.utc)
    first_this_month = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = first_this_month - timedelta(days=1)          # 上月末
    start = (end.replace(day=1) - timedelta(days=months * 30)).replace(day=1)
    return start.strftime("%Y%m%d00"), end.strftime("%Y%m%d00")


def fetch_article(project: str, article: str, start: str, end: str, timeout: int):
    url = API.format(proj=project, art=urllib.parse.quote(article, safe=""), s=start, e=end)
    d = get_json(url, timeout=timeout)
    items = d.get("items", [])
    out = []
    for it in items:
        ts = str(it.get("timestamp", ""))
        if len(ts) >= 6:
            out.append({"month": ts[:4] + "-" + ts[4:6], "views": int(it.get("views", 0))})
    return out


def fetch_project_total(project: str, start: str, end: str, timeout: int):
    """取整个维基语言版本的真实总访问量（用户访问，不含爬虫）。"""
    url = API_PROJECT.format(proj=project, s=start, e=end)
    d = get_json(url, timeout=timeout)
    rows = []
    for it in d.get("items", []):
        ts = str(it.get("timestamp", ""))
        if len(ts) >= 6:
            rows.append({"month": ts[:4] + "-" + ts[4:6], "views": int(it.get("views", 0))})
    return rows


def fetch_top_by_country(project: str, year: str, month: str, timeout: int):
    """取某个语言版本在某月的「真实分国家访问量」。

    这是整套数据里最有价值的一个接口：Wikimedia 直接按国家给出去重后的
    页面访问量。返回值里 views 是区间字符串（如 "1000000-9999999"），
    同时带一个 views_ceil（区间上界估计值），我们用 views_ceil 累加。

    ⚠️ 小于 1000 的访问量会被并进 "100-999" 之类的桶，属于隐私保护，
       所以极低频国家会偏小。这是官方数据的已知限制。
    """
    url = API_TOP_COUNTRY.format(proj=project, y=year, m=month)
    d = get_json(url, timeout=timeout)
    out = {}
    for it in d.get("items", []):
        for c in it.get("countries", []):
            cc = c.get("country")
            if not cc or cc == "--":
                continue
            out[cc] = out.get(cc, 0) + int(c.get("views_ceil") or 0)
    return out


def recent_months(n: int):
    """返回最近 n 个已完成月份的 (year, month) 列表，最新的在前。"""
    today = datetime.now(timezone.utc).replace(day=1)
    out = []
    y, m = today.year, today.month
    for _ in range(n):
        m -= 1
        if m == 0:
            m = 12; y -= 1
        out.append((str(y), f"{m:02d}"))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="采集维基百科真实页面访问量，作为地图的真实热度依据")
    ap.add_argument("--months", type=int, default=14, help="回看月数（默认 14）")
    ap.add_argument("--articles", nargs="*", default=None, help="要查的条目名（默认：奶龙 naiwa 青蛙 Frog）")
    ap.add_argument("--out", default=OUT_DIR, help="输出目录")
    ap.add_argument("--dry-run", action="store_true", help="只打印结果，不写文件")
    ap.add_argument("--delay", type=float, default=0.35, help="请求间隔秒数")
    ap.add_argument("--timeout", type=int, default=25, help="单次请求超时")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    arts = args.articles if args.articles else [a for a, _ in DEFAULT_ARTICLES]
    notes = {a: n for a, n in DEFAULT_ARTICLES}
    start, end = month_range(args.months)
    log(f"📅 统计区间：{start[:6]} → {end[:6]}（{args.months} 个月）", args.quiet)
    log(f"🔎 条目：{', '.join(arts)}", args.quiet)
    log(f"🌐 语言版本：{len(LANG_REGION)} 个\n", args.quiet)

    series: dict = {}
    lang_totals: dict = {}
    ok_calls = 0
    fail_calls = 0

    for art in arts:
        art_data = {}
        log(f"── 条目「{art}」", args.quiet)
        for proj, region, _desc in LANG_REGION:
            try:
                rows = fetch_article(proj, art, start, end, args.timeout)
            except Exception as e:
                fail_calls += 1
                code = getattr(e, "code", "")
                if code == 404:
                    log(f"    · {proj:<16} 无此条目", args.quiet)
                else:
                    log(f"    · {proj:<16} 失败：{str(e)[:60]}", args.quiet)
                time.sleep(args.delay)
                continue
            ok_calls += 1
            if not rows:
                time.sleep(args.delay)
                continue
            art_data[region] = rows
            total = sum(r["views"] for r in rows)
            lang_totals[region] = lang_totals.get(region, 0) + total
            last = rows[-1]
            log(f"    · {proj:<16} {region:<8} {len(rows):>2} 个月  合计 {total:>9,}  最新 {last['month']} {last['views']:>8,}", args.quiet)
            time.sleep(args.delay)
        if art_data:
            series[art] = art_data
        log("", args.quiet)

    if not series:
        print("❌ 一个条目都没取到。检查网络，或换一个条目名试试。")
        return 1

    # ---- 真实分国家权重：各语言版本 × 最近几个月 ----
    proj_totals = {}
    country_real = {}          # 中文国名 → 真实访问量
    country_iso = {}           # 中文国名 → ISO 代码
    country_by_lang = {}       # 语言版本 → 该国访问量合计（用于展示）
    months_back = recent_months(3)
    log(f"\n🌐 采集真实分国家访问量（{len(LANG_REGION)} 个语言版本 × {len(months_back)} 个月）…", args.quiet)
    for proj, region, desc in LANG_REGION:
        got_any = False
        for (yy, mm) in months_back:
            try:
                cc = fetch_top_by_country(proj, yy, mm, args.timeout)
            except Exception as e:
                log(f"    · {proj:<16} {yy}-{mm} 失败：{str(e)[:44]}", args.quiet)
                time.sleep(args.delay)
                continue
            if cc:
                got_any = True
                for iso, v in cc.items():
                    zh = CC_TO_ZH.get(iso, iso)
                    country_real[zh] = country_real.get(zh, 0) + v
                    country_iso[zh] = iso
                country_by_lang[region] = country_by_lang.get(region, 0) + sum(cc.values())
            time.sleep(args.delay)
        if got_any:
            log(f"    · {proj:<16} {region:<8} ✅ 已获取", args.quiet)

    # 按国家排序，取前若干
    real_rank = sorted(
        [{"region": k, "iso": country_iso.get(k, ""), "views": v} for k, v in country_real.items()],
        key=lambda x: -x["views"],
    )
    real_sum = sum(r["views"] for r in real_rank) or 1
    for r in real_rank:
        r["share"] = round(r["views"] / real_sum * 100, 4)

    # ---- 汇总 ----
    # 1) 「奶龙」条目的真实月度趋势（这是最有故事性的一组数据）
    trend_art = "奶龙" if "奶龙" in series else next(iter(series))
    months_set = sorted({r["month"] for rows in series[trend_art].values() for r in rows})
    trend = []
    for m in months_set:
        v = 0
        for rows in series[trend_art].values():
            for r in rows:
                if r["month"] == m:
                    v += r["views"]
        trend.append({"month": m, "views": v})

    # 2) 真实地区占比：直接用 Wikimedia 的分国家数据
    weight_sum = real_sum
    region_share = real_rank
    # 2b) 条目在各语言版本的真实访问量（说明它实际被谁看到）
    article_region = {}
    for region, rows in series[trend_art].items():
        article_region[region] = sum(r["views"] for r in rows)
    article_total = sum(article_region.values()) or 1

    # 3) 峰值月
    peak = max(trend, key=lambda x: x["views"]) if trend else None

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "Wikimedia Pageviews API (per-article, monthly)",
        "apiDoc": "https://wikimedia.org/api/rest_v1/",
        "period": {"start": start[:6], "end": end[:6], "months": args.months},
        "articles": {a: notes.get(a, "") for a in series.keys()},
        "series": series,
        "trendArticle": trend_art,
        "trend": trend,
        "regionShare": region_share,
        "regionWeights": country_real,
        "byLanguage": country_by_lang,
        "articleByRegion": article_region,
        "articleTotal": article_total,
        "peak": peak,
        "caveats": [
            "「奶龙」趋势、峰值、条目访问量：维基百科真实测得数据。",
            "地区占比：Wikimedia 官方 top-by-country 接口，按 ISO 国家统计的真实去重访问量，累加最近 3 个月。",
            "该接口对低于 1000 的访问量做区间合并（隐私保护），所以极低频国家会偏小。",
            "维基百科访问量反映「查证/了解意愿」，不等于短视频播放量或表情包使用次数，只能当热度风向标。",
            "国家维度已按 ISO 代码归一，同一国家在不同语言版本下的访问量会被合并。",
            "当月数据不完整，已截断到上个月末。",
        ],
    }

    log("=" * 62, args.quiet)
    log(f" ✅ 成功请求 {ok_calls} 次，失败 {fail_calls} 次", args.quiet)
    log(f" 📈 「{trend_art}」真实趋势共 {len(trend)} 个月", args.quiet)
    if peak:
        log(f" 🔥 峰值：{peak['month']} 达到 {peak['views']:,} 次浏览", args.quiet)
    log(" 🌍 真实分国家访问量（Wikimedia top-by-country，前 12）：", args.quiet)
    if region_share and region_share[0].get("views"):
        for r in region_share[:12]:
            log(f"      {r['region']:<12} {r.get('iso',''):<3} {r['views']:>13,} 次  {r['share']:>6.2f}%", args.quiet)
    else:
        log("      （未取到分国家数据，可能是接口限流或该月无数据）", args.quiet)
    log("", args.quiet)
    log(f" 📄 「{trend_art}」条目实际被访问的语言版本：", args.quiet)
    for k, v in sorted(article_region.items(), key=lambda x: -x[1])[:6]:
        log(f"      {k:<10} {v:>8,} 次", args.quiet)
    log("=" * 62, args.quiet)

    if args.dry_run:
        log("🧪 干跑模式：未写文件", args.quiet)
        return 0

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "reality.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    with open(os.path.join(args.out, "naiwa-reality.js"), "w", encoding="utf-8") as f:
        f.write("/* 自动生成 · 请勿手改 —— python tools/naiwa_pageviews.py */\n")
        f.write("/* 数据来源：Wikimedia Pageviews API（真实页面访问量） */\n")
        f.write("(function(g){g.NAIWA_REALITY=")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";})(typeof window!=='undefined'?window:globalThis);\n")

    log(f"\n📦 已写出：\n  {os.path.join(args.out, 'reality.json')}\n  {os.path.join(args.out, 'naiwa-reality.js')}", args.quiet)
    log('\n下一步：index.html 里加一行\n  <script src="assets/naiwa-data/naiwa-reality.js"></script>\n地图就会自动改用这组真实数据。', args.quiet)
    return 0


if __name__ == "__main__":
    sys.exit(main())
