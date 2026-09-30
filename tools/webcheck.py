#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
用无头 Edge + DevTools 协议做截图验证。

为什么需要它：骨骼动画、Canvas 战斗画面这类东西，静态检查（node --check）
只能证明"没有语法错误"，证明不了"画出来了"。这个脚本真正打开页面、
按脚本点击、然后把画面截下来，这样视觉问题能被发现。

用法：
    python tools/webcheck.py                      # 默认：决斗场自动开打并截图
    python tools/webcheck.py --url /index.html --wait 6 --out shot.png
    python tools/webcheck.py --click "#startBtn" --click "#fightBtn"

实现说明：
- 只用标准库：手写最小 WebSocket 客户端（Client→Server 帧要掩码）
- 协议流程：/json/new 开标签页 → 连 webSocketDebuggerUrl →
  Page.navigate → Runtime.evaluate 执行 JS → Page.captureScreenshot
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import socket
import struct
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from http.client import HTTPConnection

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDGE_CANDIDATES = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]


# ----------------------------------------------------------------------
# 最小 WebSocket 客户端（只支持文本帧，够用）
# ----------------------------------------------------------------------
class WS:
    def __init__(self, url, timeout=25):
        u = urllib.parse.urlsplit(url)
        self.host = u.hostname
        self.port = u.port or 80
        self.path = u.path + ("?" + u.query if u.query else "")
        self.sock = socket.create_connection((self.host, self.port), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET {self.path} HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            "Upgrade: websocket\r\nConnection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError("WebSocket 握手失败")
            buf += chunk
        if b"101" not in buf.split(b"\r\n")[0]:
            raise RuntimeError("WebSocket 未升级: " + buf[:120].decode("utf-8", "ignore"))
        self.buf = buf.split(b"\r\n\r\n", 1)[1]
        self._id = 0

    def _recv_exact(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise RuntimeError("连接关闭")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send(self, text):
        data = text.encode()
        header = bytearray([0x81])
        n = len(data)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack(">H", n)
        else:
            header.append(0x80 | 127)
            header += struct.pack(">Q", n)
        mask = os.urandom(4)
        header += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        self.sock.sendall(bytes(header) + masked)

    def recv(self):
        while True:
            b0, b1 = self._recv_exact(2)
            opcode = b0 & 0x0F
            length = b1 & 0x7F
            if length == 126:
                length = struct.unpack(">H", self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack(">Q", self._recv_exact(8))[0]
            payload = self._recv_exact(length) if length else b""
            if opcode == 0x8:
                raise RuntimeError("服务器关闭连接")
            if opcode == 0x9:
                continue
            if opcode in (0x1, 0x2):
                return payload.decode("utf-8", "ignore")
            # 其它帧继续读

    def call(self, method, params=None):
        self._id += 1
        mid = self._id
        self.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"{method} 失败: {msg['error']}")
                return msg.get("result", {})

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass


# ----------------------------------------------------------------------
def find_browser():
    for p in EDGE_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


def devtools_port_open(port):
    try:
        c = HTTPConnection("127.0.0.1", port, timeout=2)
        c.request("GET", "/json/version")
        r = c.getresponse()
        r.read()
        return r.status == 200
    except Exception:
        return False


def new_tab(port):
    c = HTTPConnection("127.0.0.1", port, timeout=10)
    c.request("PUT", "/json/new?about:blank")
    r = c.getresponse()
    body = r.read().decode("utf-8", "ignore")
    if r.status not in (200, 201):
        raise RuntimeError("无法新建标签页: " + body[:200])
    return json.loads(body)


def main() -> int:
    ap = argparse.ArgumentParser(description="无头浏览器截图验证（DevTools 协议）")
    ap.add_argument("--url", default="/battle.html", help="页面路径或完整 URL")
    ap.add_argument("--out", default=os.path.join(ROOT, "tools", "web-shot.png"))
    ap.add_argument("--wait", type=float, default=3.0, help="导航后等待秒数")
    ap.add_argument("--after", type=float, default=3.5, help="点击后再等秒数")
    ap.add_argument("--scroll", type=int, default=0, help="截图前滚动到指定像素高度")
    ap.add_argument("--click", action="append", default=[], help="要点击的元素选择器（可多次）")
    ap.add_argument("--eval", action="append", default=[], help="要执行的 JS（可多次）")
    ap.add_argument("--eval-file", default=None,
                    help="从文件读取要执行的 JS（推荐：避免命令行引号被 shell 吞掉）")
    ap.add_argument("--probe", action="store_true", help="把 --eval 的结果也写进页面左上角，方便截图查看")
    ap.add_argument("--hook-file", default=None,
                    help="在页面脚本运行前注入的 JS 文件（用于挂钩子，例如抓 canvas 像素）")
    ap.add_argument("--dump-js", default=None,
                    help="截图前额外执行的 JS 文件，其结果若是一段 dataURL 会被保存成同名 -dump.png")
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--height", type=int, default=1000)
    ap.add_argument("--port", type=int, default=9411)
    ap.add_argument("--keep-open", action="store_true", help="不关闭浏览器（调试用）")
    args = ap.parse_args()

    browser = find_browser()
    if not browser:
        print("✖ 找不到 Edge 或 Chrome")
        return 2

    base = f"http://127.0.0.1:{args.port}"
    proc = None
    started_here = False
    if not devtools_port_open(args.port):
        profile = os.path.join(os.environ.get("TEMP", "/tmp"), f"naiwa-webcheck-{args.port}")
        cmd = [browser, "--headless=new", "--disable-gpu", "--hide-scrollbars",
               "--no-first-run", "--no-default-browser-check", "--mute-audio",
               f"--remote-debugging-port={args.port}",
               f"--user-data-dir={profile}",
               f"--window-size={args.width},{args.height}",
               "about:blank"]
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        started_here = True
        for _ in range(40):
            if devtools_port_open(args.port):
                break
            time.sleep(0.5)
        else:
            print("✖ 浏览器调试端口未就绪")
            return 2
        time.sleep(0.8)

    if not args.url.startswith("http"):
        print("✖ 请传完整地址，例如：--url http://127.0.0.1:8935/battle.html")
        if started_here and proc:
            proc.terminate()
        return 2
    url = args.url

    tab = new_tab(args.port)
    ws = WS(tab["webSocketDebuggerUrl"])
    try:
        ws.call("Page.enable")
        ws.call("Runtime.enable")
        # 早期注入错误收集器，navigate 前执行
        try:
            ws.call("Page.addScriptToEvaluateOnNewDocument", {"source":
                "window.__errs=[];window.__consoleErrs=[];"
                "window.addEventListener('error',function(e){"
                "try{window.__errs.push('ERR: '+(e.message||'')+' @'+(e.filename||'')+':'+(e.lineno||0)+"
                "' target='+((e.target&&(e.target.src||e.target.href))||''));}catch(x){}},true);"
                # 异步 Promise 里的异常只有这个事件抓得到（地图/图表代码大多是 async）
                "window.addEventListener('unhandledrejection',function(e){"
                "try{var r=e.reason;window.__errs.push('REJECT: '+((r&&(r.stack||r.message))||String(r)));}"
                "catch(x){}},true);"
                "var _ce=console.error;console.error=function(){"
                "try{window.__consoleErrs.push(Array.prototype.slice.call(arguments).join(' '));}catch(x){}"
                "return _ce.apply(console,arguments);};"})
        except Exception as e:
            print("  （注入错误收集器失败，忽略）", e)

        # 用户自定义的注入脚本（在页面自身脚本之前运行）
        if args.hook_file:
            with open(args.hook_file, "r", encoding="utf-8") as fh:
                src = fh.read()
            ws.call("Page.addScriptToEvaluateOnNewDocument", {"source": src})
            print("  已注入 hook:", os.path.basename(args.hook_file))
        ws.call("Emulation.setDeviceMetricsOverride",
                {"width": args.width, "height": args.height, "deviceScaleFactor": 1, "mobile": False})
        ws.call("Page.navigate", {"url": url})
        time.sleep(args.wait)

        # 控制台错误收集（很多渲染问题的真正原因都在这里）
        try:
            evs = ws.call("Runtime.evaluate", {"expression":
                "JSON.stringify((window.__consoleErrs||[]).concat(window.__errs||[]))",
                "returnByValue": True})
            val = evs.get("result", {}).get("value")
            if val and val not in ("[]", "null"):
                print("  📋 页面错误:", val[:600])
        except Exception:
            pass
        # 资源加载失败列表
        try:
            res = ws.call("Runtime.evaluate", {"expression":
                "JSON.stringify(performance.getEntriesByType('resource').filter(function(r){"
                "return r.responseStatus && r.responseStatus>=400;}).map(function(r){return r.name;}));",
                "returnByValue": True})
            rv = res.get("result", {}).get("value")
            if rv and rv not in ("[]", "null"):
                print("  📋 加载失败资源:", rv[:600])
        except Exception:
            pass

        for sel in args.click:
            js = f"(function(){{var e=document.querySelector({json.dumps(sel)});if(e){{e.click();return 'clicked';}}return 'not-found';}})()"
            r = ws.call("Runtime.evaluate", {"expression": js, "returnByValue": True})
            print(f"  点击 {sel} → {r.get('result',{}).get('value')}")
            time.sleep(0.9)

        if args.eval_file:
            with open(args.eval_file, "r", encoding="utf-8") as fh:
                js = fh.read().strip()
            if js:
                r = ws.call("Runtime.evaluate", {"expression": js, "returnByValue": True})
                v = r.get("result", {})
                val = str(v.get("value"))
                print(f"  probe → {val[:300]}")
                if args.probe:
                    body = json.dumps(val)
                    ws.call("Runtime.evaluate", {"expression":
                        "(function(){var e=document.getElementById('__probe')||(function(){"
                        "var d=document.createElement('div');d.id='__probe';"
                        "d.style.cssText='position:fixed;left:0;top:0;z-index:2147483647;background:#000;color:#0f0;"
                        "font:13px Consolas,monospace;padding:6px;max-width:100vw;white-space:pre-wrap';"
                        "document.body.appendChild(d);return d;})();"
                        "e.textContent += " + body + " + '\\n';})()"})

        for expr in args.eval:
            r = ws.call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
            v = r.get("result", {})
            print(f"  执行 → {str(v.get('value'))[:200]}")
            # 结果写进 DOM 固定面板，截图里就能直接看到（不依赖终端输出）
            if args.probe:
                body = json.dumps(str(v.get("value")))
                ws.call("Runtime.evaluate", {"expression":
                    "(function(){var e=document.getElementById('__probe')||(function(){"
                    "var d=document.createElement('div');d.id='__probe';"
                    "d.style.cssText='position:fixed;left:0;top:0;z-index:2147483647;background:#000;color:#0f0;"
                    "font:12px Consolas,monospace;padding:4px;max-width:100vw;white-space:pre-wrap';"
                    "document.body.appendChild(d);return d;})();"
                    "e.textContent += " + body + " + '\\n';})()"})

        if args.click or args.eval:
            time.sleep(args.after)

        if args.scroll:
            ws.call("Runtime.evaluate", {"expression":
                f"window.scrollTo(0,{args.scroll}); document.documentElement.scrollTop={args.scroll};"})
            time.sleep(1.2)

        # 导出页面里某个 canvas 的原始像素（dataURL → png 文件）
        if args.dump_js:
            with open(args.dump_js, "r", encoding="utf-8") as fh:
                djs = fh.read().strip()
            r = ws.call("Runtime.evaluate", {"expression": djs, "returnByValue": True})
            url = r.get("result", {}).get("value")
            if isinstance(url, str) and url.startswith("data:image"):
                b64 = url.split(",", 1)[1]
                dp = args.out.rsplit(".", 1)[0] + "-dump.png"
                with open(dp, "wb") as f:
                    f.write(base64.b64decode(b64))
                print(f"  🖼️ Canvas 原始像素已导出：{dp}（{os.path.getsize(dp)//1024} KB）")
            else:
                print("  ⚠️ dump-js 没有返回 dataURL：", str(url)[:200])

        # 顺便把页面里的错误收集一下
        errs = ws.call("Runtime.evaluate", {
            "expression": "(window.__errs||[]).join(' | ') || (window.onerror? '' : '')",
            "returnByValue": True})
        err = errs.get("result", {}).get("value")
        if err:
            print("  ⚠️ 页面错误:", err)

        shot = ws.call("Page.captureScreenshot", {"format": "png"})
        data = shot.get("data")
        if not data:
            print("✖ 截图数据为空")
            return 1
        with open(args.out, "wb") as f:
            f.write(base64.b64decode(data))
        print(f"✅ 截图已保存：{args.out}（{os.path.getsize(args.out)//1024} KB）")
        return 0
    finally:
        ws.close()
        if started_here and proc and not args.keep_open:
            proc.terminate()


if __name__ == "__main__":
    sys.exit(main())
