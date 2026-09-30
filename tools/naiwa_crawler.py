#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================
 🐸 奶蛙数据模块 · 网络图片采集器  (naiwa_crawler.py)
================================================================

用途
----
从网络上合法采集「奶蛙」相关图片，去重、筛选、生成清单，
产出可被网站直接读取的数据模块：

    assets/naiwa-images/manifest.json   图片清单（哈希/尺寸/来源/授权）
    assets/naiwa-images/naiwa-data.js   浏览器端数据模块（自动生成）
    assets/naiwa-images/*.png|jpg|webp  下载的图片本体

设计原则（请务必遵守）
----------------------
1. 只抓取**允许抓取**的内容：默认遵循 robots.txt，禁止用于绕过付费墙/登录墙。
2. 尊重版权：`--license-only` 参数只保留标记为自由授权（CC / 公有领域 / 官方开放档案）
   的条目。商用请自行确认授权，脚本会把来源 URL 全部记进清单。
3. 限速礼貌：默认每个域名 1.2 秒间隔，可调，不要给别人的服务器压力。
4. 不抓取个人隐私内容、不抓取需要登录的页面。

依赖
----
可选：requests（推荐，没有则回退到 urllib）。Pillow 可选，用于格式转换与尺寸校验。

用法
----
    # 1) 只做一次“干跑”，看看能从哪些源拿到什么（不下载）
    python tools/naiwa_crawler.py --list-sources
    python tools/naiwa_crawler.py --dry-run

    # 2) 正式采集（默认源，最多 120 张）
    python tools/naiwa_crawler.py --limit 120

    # 3) 只保留自由授权内容
    python tools/naiwa_crawler.py --license-only

    # 4) 只用自定义源文件（每行一个页面 URL 或图片直链）
    python tools/naiwa_crawler.py --sources my-sources.txt --limit 60

    # 5) 之后在 Python 里使用这份数据
    python -c "from naiwa_data import load; d=load(); print(len(d['images']))"

    # 6) 生成奶蛙商品/角色衍生数据模块
    python tools/naiwa_crawler.py --emit-derived
================================================================
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import re
import sys
import time
import urllib.parse
import urllib.robotparser as robotparser
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone

# ------------------------------------------------------------------
# 可选依赖：优雅降级
# ------------------------------------------------------------------
try:
    import requests  # type: ignore
    HAS_REQUESTS = True
except Exception:  # pragma: no cover
    HAS_REQUESTS = False

try:
    from PIL import Image  # type: ignore
    HAS_PIL = True
except Exception:  # pragma: no cover
    HAS_PIL = False

import urllib.request
import urllib.error

# 文件页 → 授权信息（从 File: 页面 HTML 里抓到的授权字样），key 是图片直链 URL
API_LIC_PARSE: dict = {}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "naiwa-images")
MANIFEST = os.path.join(OUT_DIR, "manifest.json")
DATA_JS = os.path.join(OUT_DIR, "naiwa-data.js")
UA = "NaiwaTrackerBot/1.0 (non-commercial fan project; +https://github.com/godnbese-cpu/naiwa-tracker)"
# ⚠️ HTTP 头只能是 ASCII（latin-1），绝对不能把中文/emoji 放进 User-Agent，
#    否则 urllib 会抛 "'latin-1' codec can't encode characters"。

IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".bmp")
IMG_SRC_RE = re.compile(
    r"""(?:src|data-src|data-original|data-lazy-src|href|content)\s*=\s*["']([^"']+\.(?:png|jpe?g|webp|gif|avif))(?:\?[^"']*)?["']""",
    re.I,
)

# ------------------------------------------------------------------
# 图片源
# ------------------------------------------------------------------
# 说明：
#   kind = "page"   → 先抓 HTML，再从中解析图片链接
#   kind = "api"    → 调用开放 API（推荐：返回 JSON + 授权信息，且明确允许机器人）
#   kind = "direct" → 直接是图片直链（例如官方档案文件）
#   license         → free | official-open | unknown
#
# ⚠️ 为什么默认用 API 而不是扒 HTML：
#    很多站点的 robots.txt 会禁止抓取 /search 这类路径（这是对的，我们就该遵守）。
#    而 Wikimedia 的 MediaWiki API 是官方开放接口，允许程序访问，
#    并且会在 extmetadata 里直接返回 LicenseShortName / Artist，授权信息更干净。
DEFAULT_SOURCES = [
    {
        "name": "Wikimedia Commons · Ranidae 蛙科分类",
        "kind": "page",
        "url": "https://commons.wikimedia.org/wiki/Category:Ranidae",
        "license": "free",
        "note": "CC / 公有领域。页面里每个 File: 链接会被解析成原图直链并抓取",
        "max": 30,
    },
    {
        "name": "Wikimedia Commons · Frogs 青蛙分类",
        "kind": "page",
        "url": "https://commons.wikimedia.org/wiki/Category:Frogs",
        "license": "free",
        "note": "同上，换一个分类增加多样性",
        "max": 25,
    },
    {
        "name": "Wikimedia Commons · 青蛙视频/媒体分类",
        "kind": "page",
        "url": "https://commons.wikimedia.org/wiki/Category:Videos_of_frogs",
        "license": "free",
        "note": "视频分类里的静态缩略图同样是自由授权",
        "max": 10,
    },
    # --- 你自己的奶蛙官方档案：把 URL 换成真实地址即可 ---
    {
        "name": "naiwa.world 官方档案（需自行确认地址与授权）",
        "kind": "page",
        "url": "https://naiwa.world/",
        "license": "official-open",
        "note": "官方三姿态原图出处；请遵守站点条款，仅作非商用玩梗",
        "enabled": False,   # 默认关闭，确认条款后把 False 改成 True
    },
]


# ------------------------------------------------------------------
# 数据结构
# ------------------------------------------------------------------
@dataclass
class ImageRec:
    url: str
    source: str
    license: str
    file: str = ""
    sha1: str = ""
    bytes: int = 0
    width: int = 0
    height: int = 0
    fmt: str = ""
    status: str = "pending"     # downloaded | skipped-dup | failed | dry-run
    error: str = ""
    fetched_at: str = ""
    derived: list = field(default_factory=list)


# ------------------------------------------------------------------
# 工具
# ------------------------------------------------------------------
def log(msg: str, quiet: bool = False) -> None:
    if not quiet:
        print(msg, flush=True)


def domain_of(url: str) -> str:
    try:
        return urllib.parse.urlsplit(url).netloc.lower()
    except Exception:
        return ""


def abs_url(base: str, href: str) -> str:
    return urllib.parse.urljoin(base, href)


def http_get(url: str, timeout: int = 25) -> tuple[bytes | None, str, int]:
    """返回 (内容, content-type, status)。失败返回 (None, err, 0)。"""
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    if HAS_REQUESTS:
        try:
            r = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)
            return r.content, r.headers.get("Content-Type", ""), r.status_code
        except Exception as e:
            return None, str(e), 0
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read(), resp.headers.get("Content-Type", ""), resp.status
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}", e.code
    except Exception as e:
        return None, str(e), 0


class Robots:
    """按域名缓存 robots.txt 判定。"""

    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self._cache: dict[str, robotparser.RobotFileParser | None] = {}

    def allowed(self, url: str) -> bool:
        if not self.enabled:
            return True
        dom = domain_of(url)
        if not dom:
            return False
        if dom not in self._cache:
            rp = robotparser.RobotFileParser()
            rp.set_url(f"https://{dom}/robots.txt")
            try:
                body, ctype, code = http_get(f"https://{dom}/robots.txt", timeout=12)
                if body is None or code >= 400:
                    rp = None  # 没有 robots.txt → 视为允许
                else:
                    rp.parse(body.decode("utf-8", "ignore").splitlines())
            except Exception:
                rp = None
            self._cache[dom] = rp
        rp = self._cache[dom]
        if rp is None:
            return True
        try:
            # ⚠️ 关键：urllib.robotparser.can_fetch() 只接受「路径+查询」，
            #    传完整 URL（https://host/path）会被它的 urlparse 解析错，
            #    结果是明明允许的地址被判成禁止。必须自己拆出 path?query。
            parts = urllib.parse.urlsplit(url)
            uri = parts.path or "/"
            if parts.query:
                uri += "?" + parts.query
            return rp.can_fetch(UA, uri)
        except Exception:
            return True


def img_dims(data: bytes) -> tuple[int, int, str]:
    """不依赖 Pillow 探测尺寸；有 Pillow 时更准。"""
    if HAS_PIL:
        try:
            import io
            im = Image.open(io.BytesIO(data))
            return im.width, im.height, (im.format or "").lower()
        except Exception:
            pass
    # PNG
    if data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) > 24:
        w = int.from_bytes(data[16:20], "big")
        h = int.from_bytes(data[20:24], "big")
        return w, h, "png"
    # GIF
    if data[:6] in (b"GIF87a", b"GIF89a") and len(data) > 10:
        w = int.from_bytes(data[6:8], "little")
        h = int.from_bytes(data[8:10], "little")
        return w, h, "gif"
    # WebP
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return 0, 0, "webp"
    # JPEG 扫描 SOF
    if data[:2] == b"\xff\xd8":
        i = 2
        n = len(data)
        while i < n - 9:
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h = int.from_bytes(data[i + 5:i + 7], "big")
                w = int.from_bytes(data[i + 7:i + 9], "big")
                return w, h, "jpeg"
            seg = int.from_bytes(data[i + 2:i + 4], "big")
            i += 2 + seg
        return 0, 0, "jpeg"
    return 0, 0, ""


def is_image(data: bytes, ctype: str) -> bool:
    if ctype and ctype.lower().startswith("image/"):
        return True
    if data[:8] == b"\x89PNG\r\n\x1a\n" or data[:2] == b"\xff\xd8":
        return True
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return True
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return True
    return False


def safe_name(url: str, sha1: str, fmt: str) -> str:
    base = os.path.basename(urllib.parse.urlsplit(url).path) or "naiwa"
    # Special:FilePath/File:XXX.jpg → 取 File: 后面那段当名字
    if ":" in base:
        base = base.split(":")[-1]
    base = re.sub(r"[^A-Za-z0-9._-]", "_", base)[:48]
    stem, ext = os.path.splitext(base)
    ext = ext.lower() if ext.lower() in IMAGE_EXT else ("." + (fmt or "png"))
    return f"{stem[:40]}-{sha1[:8]}{ext}"


# ------------------------------------------------------------------
# 采集核心
# ------------------------------------------------------------------
def api_license(meta: dict) -> str:
    """从 Commons extmetadata 里抽出可读的授权信息。"""
    if not meta:
        return "unknown"
    em = meta.get("extmetadata") or {}
    short = (em.get("LicenseShortName") or {}).get("value", "")
    lic = (em.get("License") or {}).get("value", "")
    return (short or lic or "unknown").strip()


def discover(source: dict, rb: Robots, stats: dict, quiet: bool,
             thumb_width: int = 960) -> list[tuple[str, str]]:
    """从一个源里发现图片链接。返回 [(url, license), ...]"""
    url = source["url"]
    src_lic = source.get("license", "unknown")

    if source.get("kind") == "direct":
        return [(url, src_lic)]

    if not rb.allowed(url):
        log(f"  ⛔ robots.txt 不允许：{url}", quiet)
        stats["robots_blocked"] += 1
        return []

    body, ctype, code = http_get(url)
    if body is None:
        log(f"  ✖ 抓取失败（{code}）：{ctype}", quiet)
        stats["page_failed"] += 1
        return []

    text = body.decode("utf-8", "ignore")

    # ---------- API 源：解析 JSON，顺手把授权信息带出来 ----------
    if source.get("kind") == "api":
        try:
            data = json.loads(text)
        except Exception as e:
            log(f"  ✖ API 返回不是合法 JSON：{e}", quiet)
            stats["page_failed"] += 1
            return []
        pages = ((data.get("query") or {}).get("pages") or {})
        out: list[tuple[str, str]] = []
        for _, pg in pages.items():
            ii = (pg.get("imageinfo") or [{}])[0]
            u = ii.get("url") or ii.get("thumburl")
            if not u or not u.lower().split("?")[0].endswith(IMAGE_EXT):
                continue
            lic = api_license(ii.get("extmetadata")) if source.get("use_api_license") is not False else src_lic
            # 官方 API 返回的授权信息比源配置更准，优先用它
            out.append((u, lic if lic != "unknown" else src_lic))
        log(f"  发现 {len(out)} 个候选图片（带授权信息）", quiet)
        if not out:
            log(f"  ⚠️  API 返回了 0 条结果，检查分类名/关键词是否正确", quiet)
        return out

    # ---------- 普通页面：先找 File: 页，再逐个解析成原图直链 ----------
    found: list[str] = []
    for m in IMG_SRC_RE.finditer(text):
        u = abs_url(url, m.group(1))
        if u.startswith("data:"):
            continue
        if u not in found:
            found.append(u)
    for m in re.finditer(r'"(https?://upload\.wikimedia\.org/[^"]+?\.(?:png|jpe?g|webp|gif))"', text, re.I):
        u = m.group(1)
        if u not in found:
            found.append(u)

    # Commons 分类页：抽出 /wiki/File:XXX 条目，再抓每个文件页拿原图
    file_pages: list[str] = []
    for m in re.finditer(r'/wiki/(File:[^"\'#?]+?\.(?:png|jpe?g|webp|gif))', text, re.I):
        raw = urllib.parse.unquote(m.group(1)).replace(" ", "_")
        fp = "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(raw, safe=":_(),!-")
        if fp not in file_pages:
            file_pages.append(fp)

    cap = int(source.get("max") or 30)
    if file_pages:
        log(f"  分类页里发现 {len(file_pages)} 个文件条目，逐个解析原图（上限 {cap}）", quiet)
    for fp in file_pages[:cap]:
        if not rb.allowed(fp):
            stats["robots_blocked"] += 1
            continue
        pbody, pctype, pcode = http_get(fp)
        if pbody is None:
            stats["page_failed"] += 1
            continue
        ptext = pbody.decode("utf-8", "ignore")

        # 从文件页 URL 反推文件名，然后用 Special:FilePath 要**缩略图**。
        # 为什么不直接拿原图：Commons 上动辄几十 MB 的原图既慢又占仓库体积，
        # 960px 缩略图对网页/换色精灵完全够用，而且 FilePath 是稳定接口。
        mname = re.search(r"/wiki/(File:[^'#?]+)$", urllib.parse.unquote(fp))
        if not mname:
            continue
        fname = mname.group(1)[len("File:"):]
        cand = ("https://commons.wikimedia.org/wiki/Special:FilePath/"
                + urllib.parse.quote(fname, safe="(),!-_")
                + f"?width={thumb_width}")

        # 顺手把文件页里的作者/授权字样抓出来，写进清单便于核对
        lic = source.get("license", "unknown")
        lm = re.search(r'(CC BY-SA[^<"\n]{0,12}|CC BY[^<"\n]{0,12}|CC0|Public domain|公有领域)', ptext, re.I)
        if lm:
            lic = lm.group(1).strip()
        if cand not in found:
            found.append(cand)
        if lic and lic != "unknown":
            API_LIC_PARSE[cand] = lic
        if len(found) >= cap:
            break

    log(f"  共发现 {len(found)} 个候选图片链接", quiet)
    return [(u, src_lic) for u in found]


def crawl(sources: list[dict], limit: int, out_dir: str, license_only: bool,
          min_px: int, delay: float, no_robots: bool, quiet: bool,
          keep_existing: bool, timeout: int, thumb_width: int = 960,
          max_kb: int = 6000) -> dict:
    os.makedirs(out_dir, exist_ok=True)
    rb = Robots(enabled=not no_robots)
    stats = {"robots_blocked": 0, "page_failed": 0, "candidates": 0,
             "downloaded": 0, "dup": 0, "failed": 0, "filtered": 0, "by_source": {}}

    manifest: dict = {"generated_at": "", "sources": [], "images": [], "stats": {}}
    seen_hash: dict[str, str] = {}

    if keep_existing and os.path.exists(MANIFEST):
        try:
            with open(MANIFEST, "r", encoding="utf-8") as f:
                old = json.load(f)
            manifest["images"] = old.get("images", [])
            for rec in manifest["images"]:
                if rec.get("sha1"):
                    seen_hash[rec["sha1"]] = rec.get("file", "")
            log(f"♻️  载入已有清单：{len(manifest['images'])} 条记录（按哈希去重）", quiet)
        except Exception as e:
            log(f"⚠️  旧清单读取失败，忽略：{e}", quiet)

    last_hit: dict[str, float] = {}
    for src in sources:
        if not src.get("enabled", True):
            log(f"⏭️  跳过（已禁用）：{src['name']}", quiet)
            continue
        if license_only and src.get("license") not in ("free", "official-open"):
            log(f"⏭️  跳过（授权未知，--license-only）：{src['name']}", quiet)
            stats["filtered"] += 1
            continue

        log(f"\n🔎 来源：{src['name']}\n    {src['url'][:110]}", quiet)
        manifest["sources"].append({k: src.get(k) for k in ("name", "url", "license", "kind", "note")})
        pairs = discover(src, rb, stats, quiet, thumb_width)
        got_here = 0

        for u, item_lic in pairs:
            if stats["downloaded"] >= limit:
                break
            stats["candidates"] += 1
            # 从 File: 页面解析出来的更精确授权信息优先
            item_lic = API_LIC_PARSE.get(u, item_lic)
            if not u.lower().startswith("http"):
                continue
            if not u.lower().split("?")[0].endswith(IMAGE_EXT):
                continue
            if not rb.allowed(u):
                stats["robots_blocked"] += 1
                continue

            # 礼貌限速：同域名间隔
            dom = domain_of(u)
            gap = time.time() - last_hit.get(dom, 0)
            if gap < delay:
                time.sleep(delay - gap)
            last_hit[dom] = time.time()

            data, ctype, code = http_get(u, timeout=timeout)
            if data is None or not is_image(data, ctype):
                stats["failed"] += 1
                continue

            # 体积保护：太大的图直接跳过，避免下载几十 MB 的原图
            if max_kb and len(data) > max_kb * 1024:
                stats["filtered"] += 1
                log(f"  ⏭️  跳过过大文件（{len(data)//1024}KB > {max_kb}KB）", quiet)
                continue

            w, h, fmt = img_dims(data)
            if min_px and w and h and (w < min_px or h < min_px):
                stats["filtered"] += 1
                continue
            # 尺寸探测失败的保护：WebP/GIF 等格式可能拿不到宽高，
            # 这时用「体积下限」兜底，避免 1KB 的小图标混进图片库。
            if min_px and (not w or not h) and len(data) < 12 * 1024:
                stats["filtered"] += 1
                log(f"  ⏭️  跳过过小文件（{len(data)}B，尺寸未知）", quiet)
                continue

            sha1 = hashlib.sha1(data).hexdigest()
            if sha1 in seen_hash:
                stats["dup"] += 1
                manifest["images"].append(asdict(ImageRec(
                    url=u, source=src["name"], license=item_lic,
                    file=seen_hash[sha1], sha1=sha1, bytes=len(data), width=w, height=h, fmt=fmt,
                    status="skipped-dup", fetched_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                )))
                continue

            name = safe_name(u, sha1, fmt)
            path = os.path.join(out_dir, name)
            try:
                with open(path, "wb") as f:
                    f.write(data)
            except Exception as e:
                stats["failed"] += 1
                log(f"  ✖ 写入失败 {name}: {e}", quiet)
                continue

            seen_hash[sha1] = name
            stats["downloaded"] += 1
            got_here += 1
            manifest["images"].append(asdict(ImageRec(
                url=u, source=src["name"], license=item_lic,
                file=name, sha1=sha1, bytes=len(data), width=w, height=h, fmt=fmt,
                status="downloaded",
                fetched_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            )))
            log(f"  ✅ [{stats['downloaded']:>3}/{limit}] {name}  {w}×{h}  {len(data)//1024}KB", quiet)

        stats["by_source"][src["name"]] = got_here
        if stats["downloaded"] >= limit:
            log(f"\n🛑 已达到数量上限 {limit}，停止采集", quiet)
            break

    manifest["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    manifest["stats"] = stats
    return manifest


# ------------------------------------------------------------------
# 衍生数据（供网站直接使用）
# ------------------------------------------------------------------
PALETTES = [
    ("big", "大奶蛙", "#ffd94d"), ("small", "小奶蛙", "#7ec850"),
    ("rainbow", "彩虹奶蛙", "#ff6ec7"), ("gold", "金曜奶蛙", "#ffb300"),
    ("ice", "冰霜奶蛙", "#5aa8ff"), ("flame", "烈焰奶蛙", "#ff5a3c"),
    ("ninja", "影忍奶蛙", "#8a6bff"), ("samurai", "武侍奶蛙", "#e8ecff"),
    ("healer", "治疗奶蛙", "#ff8ac8"), ("thunder", "雷电奶蛙", "#ffe14d"),
    ("shadow", "幽冥奶蛙", "#3a2f6b"), ("boss", "奶蛙之神", "#ffffff"),
]


def build_derived(images: list[dict]) -> dict:
    """把采集到的图片与 12 位斗士配色组合成衍生数据模块。"""
    downloaded = [i for i in images if i.get("status") == "downloaded" and i.get("file")]
    # 优先选大图、方图作为角色底图
    downloaded.sort(key=lambda i: (-(i.get("width", 0) * i.get("height", 0))))
    base_pool = downloaded[:12]
    variants = []
    for idx, (fid, name, color) in enumerate(PALETTES):
        base = base_pool[idx % len(base_pool)] if base_pool else None
        variants.append({
            "fighterId": fid, "name": name, "tint": color,
            "baseImage": base["file"] if base else None,
            "baseSource": base["url"] if base else None,
            "license": base["license"] if base else "generated",
            "note": "换色变体由前端 canvas 程序化生成（NAIWA.tintSprite）",
        })
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(downloaded),
        "totalBytes": sum(i.get("bytes", 0) for i in downloaded),
        "tiles": [{
            "file": i["file"], "w": i.get("width"), "h": i.get("height"),
            "source": i.get("source"), "license": i.get("license"), "url": i.get("url"),
        } for i in downloaded],
        "fighterVariants": variants,
    }


def write_outputs(manifest: dict, out_dir: str, quiet: bool) -> None:
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    derived = build_derived(manifest["images"])
    with open(os.path.join(out_dir, "derived.json"), "w", encoding="utf-8") as f:
        json.dump(derived, f, ensure_ascii=False, indent=2)
    with open(os.path.join(out_dir, "naiwa-data.js"), "w", encoding="utf-8") as f:
        f.write("/* 自动生成 · 请勿手改 —— python tools/naiwa_crawler.py */\n")
        f.write("(function(g){var D=")
        json.dump({"manifest": manifest, "derived": derived}, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";g.NAIWA_IMAGES=D;")
        f.write("g.NAIWA_IMAGE_DIR='assets/naiwa-images/';")
        f.write("})(typeof window!=='undefined'?window:globalThis);\n")
    log(f"\n📦 已写出：\n  {os.path.join(out_dir, 'manifest.json')}\n"
        f"  {os.path.join(out_dir, 'derived.json')}\n  {os.path.join(out_dir, 'naiwa-data.js')}", quiet)


def print_summary(manifest: dict) -> None:
    s = manifest["stats"]
    print("\n" + "=" * 62)
    print(" 🐸 奶蛙图片采集报告")
    print("=" * 62)
    print(f"  候选链接      : {s['candidates']}")
    print(f"  成功下载      : {s['downloaded']}")
    print(f"  重复跳过      : {s['dup']}")
    print(f"  尺寸/授权过滤 : {s['filtered']}")
    print(f"  失败          : {s['failed']}")
    print(f"  robots 拦截   : {s['robots_blocked']}")
    if s.get("by_source"):
        print("  ---- 各来源贡献 ----")
        for k, v in s["by_source"].items():
            print(f"    {v:>3} 张 ← {k}")
    print("=" * 62)
    print("  下一步：在 shop.html / battle.html 里引入")
    print('    <script src="assets/naiwa-images/naiwa-data.js"></script>')
    print("  即可通过 window.NAIWA_IMAGES.derived.tiles 使用这些图片。")
    print("  ⚠️  使用前请逐条检查 manifest.json 中的 license 与 url 字段。")


# ------------------------------------------------------------------
# CLI
# ------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="🐸 奶蛙图片采集器（遵循 robots.txt / 记录授权 / 哈希去重）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="示例：python tools/naiwa_crawler.py --limit 120 --license-only",
    )
    ap.add_argument("--limit", type=int, default=120, help="最多下载多少张（默认 120）")
    ap.add_argument("--out", default=OUT_DIR, help="输出目录（默认 assets/naiwa-images）")
    ap.add_argument("--sources", help="自定义源文件：每行一个 URL，可选 'page|direct' 前缀")
    ap.add_argument("--license-only", action="store_true", help="只采集标记为自由授权的来源")
    ap.add_argument("--min-px", type=int, default=180, help="最小边长，过滤小图（默认 180）")
    ap.add_argument("--thumb-width", type=int, default=960, help="抓取缩略图宽度（默认 960，设 0 用原图）")
    ap.add_argument("--max-kb", type=int, default=6000, help="单张图片体积上限 KB（默认 6000，0 = 不限）")
    ap.add_argument("--delay", type=float, default=1.2, help="同域名请求间隔秒数（默认 1.2）")
    ap.add_argument("--no-robots", action="store_true", help="⚠️ 忽略 robots.txt（请确认你有权限）")
    ap.add_argument("--dry-run", action="store_true", help="只探测候选链接，不下载")
    ap.add_argument("--no-keep", action="store_true", help="不继承旧清单（默认继承并按哈希去重）")
    ap.add_argument("--list-sources", action="store_true", help="列出所有内置源后退出")
    ap.add_argument("--emit-derived", action="store_true", help="仅根据现有清单重新生成衍生数据")
    ap.add_argument("--timeout", type=int, default=25, help="单次请求超时秒数")
    ap.add_argument("--quiet", action="store_true", help="安静模式")
    args = ap.parse_args(argv)

    if args.list_sources:
        print("\n🐸 内置图片源：\n")
        for i, s in enumerate(DEFAULT_SOURCES, 1):
            flag = "✔ 启用" if s.get("enabled", True) else "✗ 已禁用"
            print(f"{i}. [{flag}] {s['name']}")
            print(f"   类型   : {s.get('kind')}")
            print(f"   地址   : {s['url']}")
            print(f"   授权   : {s.get('license')}")
            print(f"   备注   : {s.get('note', '')}\n")
        print("自己加源：复制上面的 dict 到 DEFAULT_SOURCES，或用 --sources 传文件。\n")
        return 0

    if args.emit_derived:
        if not os.path.exists(MANIFEST):
            print(f"✖ 找不到 {MANIFEST}，请先运行一次采集。")
            return 2
        with open(MANIFEST, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        write_outputs(manifest, args.out, args.quiet)
        print_summary(manifest)
        return 0

    sources = [dict(s) for s in DEFAULT_SOURCES]
    if args.sources:
        if not os.path.exists(args.sources):
            print(f"✖ 源文件不存在：{args.sources}")
            return 2
        custom = []
        with open(args.sources, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                kind = "direct" if line.lower().split("?")[0].endswith(IMAGE_EXT) else "page"
                if "|" in line:
                    kind, line = [x.strip() for x in line.split("|", 1)]
                custom.append({
                    "name": f"自定义源 · {domain_of(line) or line[:32]}",
                    "kind": kind, "url": line, "license": "unknown",
                    "note": "来自 --sources 文件，授权需自行确认",
                })
        if custom:
            sources = custom
            print(f"📄 使用自定义源 {len(custom)} 条")
        else:
            print("⚠️  源文件为空，回退到内置源")

    if not HAS_REQUESTS:
        print("ℹ️  未安装 requests，使用标准库 urllib（功能相同，速度略慢）。")
        print("   pip install requests 可获得更好的兼容性。\n")
    if not HAS_PIL:
        print("ℹ️  未安装 Pillow，尺寸探测使用内置 PNG/JPEG/GIF/WebP 解析器。\n")

    if args.dry_run:
        rb = Robots(enabled=not args.no_robots)
        stats = {"robots_blocked": 0, "page_failed": 0, "candidates": 0,
                 "downloaded": 0, "dup": 0, "failed": 0, "filtered": 0, "by_source": {}}
        print("🧪 干跑模式：只探测，不下载\n")
        for s in sources:
            if not s.get("enabled", True):
                continue
            print(f"🔎 {s['name']}")
            pairs = discover(s, rb, stats, args.quiet, args.thumb_width or 960)
            for u, lic in pairs[:6]:
                print(f"    · [{lic}] {u[:110]}")
            if len(pairs) > 6:
                print(f"    … 其余 {len(pairs)-6} 个")
            print()
        return 0

    manifest = crawl(
        sources=sources, limit=args.limit, out_dir=args.out,
        license_only=args.license_only, min_px=args.min_px, delay=args.delay,
        no_robots=args.no_robots, quiet=args.quiet,
        keep_existing=not args.no_keep, timeout=args.timeout,
        thumb_width=args.thumb_width or 0, max_kb=args.max_kb,
    )
    write_outputs(manifest, args.out, args.quiet)
    print_summary(manifest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
