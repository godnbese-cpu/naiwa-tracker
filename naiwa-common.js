/* ============================================================
   🐸 奶蛙宇宙 · 共享引擎  (naiwa-common.js)
   全站通用：导航注入 / 光络背景 / 换色精灵 / 粒子 / 音效 / 提示
   零依赖，纯原生 JS。所有页面 <script src="naiwa-common.js"></script> 即可。
   ============================================================ */
(function (global) {
  "use strict";

  var NAIWA = global.NAIWA = global.NAIWA || {};
  NAIWA.version = "2.0.0";

  /* ---------------- 站点定义 ---------------- */
  NAIWA.PAGES = [
    { href: "index.html",  icon: "📊", label: "观测站", hot: false },
    { href: "battle.html", icon: "⚔️", label: "决斗场", hot: true  },
    { href: "race.html",   icon: "🏎️", label: "极速杯", hot: false },
    { href: "shop.html",   icon: "🛒", label: "奶蛙购", hot: true  },
    { href: "lab.html",    icon: "🧪", label: "数据实验室", hot: false }
  ];

  NAIWA.currentPage = function () {
    var p = location.pathname.split("/").pop();
    return p && p.length ? p : "index.html";
  };

  /* ---------------- 导航注入 ---------------- */
  NAIWA.mountNav = function () {
    var host = document.querySelector("nav[data-naiwa-nav]");
    if (!host) return;
    var cur = NAIWA.currentPage();
    var inner = host.querySelector(".inner") || host;
    inner.innerHTML = NAIWA.PAGES.map(function (p) {
      var active = p.href === cur;
      return '<a href="' + p.href + '"' +
        (p.hot ? ' class="hot"' : "") +
        (active ? ' data-active="1"' : "") +
        ' style="' + (active ? "background:linear-gradient(135deg,rgba(34,211,238,.22),rgba(255,217,77,.22));border-color:rgba(34,211,238,.55);color:#fff" : "") +
        '">' + p.icon + " " + p.label + "</a>";
    }).join("");
  };

  /* ---------------- 工具 ---------------- */
  NAIWA.$ = function (s, r) { return (r || document).querySelector(s); };
  NAIWA.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  NAIWA.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  NAIWA.rand = function (a, b) { return a + Math.random() * (b - a); };
  NAIWA.randInt = function (a, b) { return Math.floor(NAIWA.rand(a, b + 1)); };
  NAIWA.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  NAIWA.lerp = function (a, b, t) { return a + (b - a) * t; };
  NAIWA.fmt = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); };
  NAIWA.hex2rgb = function (h) {
    h = String(h).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var v = parseInt(h, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  NAIWA.rgba = function (hex, a) {
    var c = NAIWA.hex2rgb(hex);
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  };

  /* ---------------- 本地存档 ---------------- */
  NAIWA.store = {
    get: function (k, d) {
      try {
        var v = localStorage.getItem("naiwa:" + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem("naiwa:" + k, JSON.stringify(v)); return true; }
      catch (e) { return false; }
    }
  };

  /* ---------------- 提示条 ---------------- */
  NAIWA.toast = function (msg, color) {
    var el = document.getElementById("naiwaToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "naiwaToast";
      el.style.cssText =
        "position:fixed;left:50%;bottom:96px;transform:translateX(-50%) translateY(24px);" +
        "z-index:9999;background:rgba(13,20,48,.96);border:1px solid #7ec850;color:#7ec850;" +
        "font:700 13.5px/1.4 'PingFang SC','Microsoft YaHei',sans-serif;padding:12px 26px;" +
        "border-radius:30px;opacity:0;transition:all .3s cubic-bezier(.2,.9,.3,1);pointer-events:none;" +
        "box-shadow:0 10px 40px rgba(0,0,0,.5);max-width:86vw;text-align:center";
      document.body.appendChild(el);
    }
    el.style.borderColor = color || "#7ec850";
    el.style.color = color || "#7ec850";
    el.textContent = msg;
    el.style.opacity = "1";
    el.style.transform = "translateX(-50%) translateY(0)";
    clearTimeout(el._t);
    el._t = setTimeout(function () {
      el.style.opacity = "0";
      el.style.transform = "translateX(-50%) translateY(24px)";
    }, 1900);
  };

  /* ---------------- 图片加载 ---------------- */
  var imgCache = {};
  NAIWA.loadImage = function (src) {
    if (imgCache[src]) return imgCache[src];
    var p = new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { if (imgCache[src]) imgCache[src]._img = im; res(im); };
      im.onerror = function () { rej(new Error("load fail: " + src)); };
      im.src = src;
    });
    imgCache[src] = p;
    return p;
  };

  /* 奶蛙原图（三姿态 + 主图） */
  NAIWA.SOURCES = {
    stand: "naiwa-standing.webp",
    smile: "naiwa-smiling.webp",
    think: "naiwa-thinking.webp",
    main: "naiwa.webp"
  };
  NAIWA.allSources = function () {
    return Object.keys(NAIWA.SOURCES).map(function (k) { return NAIWA.SOURCES[k]; });
  };
  NAIWA.preloadFrogs = function (extra) {
    return Promise.all(NAIWA.allSources().concat(extra || []).map(function (s) {
      return NAIWA.loadImage(s).catch(function () { return null; });
    }));
  };

  /* ---------------- 换色精灵（程序化生成奶蛙军团） ---------------- */
  var _spriteCache = {};

  /**
   * 生成奶蛙换色精灵（同步；需先 await NAIWA.preloadFrogs()）
   * @param {string} src 源图路径
   * @param {string} hex 叠加色
   * @param {object} opt {hue,sat,alpha,blend,stroke,size}
   * @returns {HTMLCanvasElement}
   */
  NAIWA.tintSprite = function (src, hex, opt) {
    opt = opt || {};
    var size = opt.size || 256;
    var key = [src, hex || "", opt.hue || 0, opt.alpha, opt.blend || "multiply", opt.stroke || "", size].join("|");
    if (_spriteCache[key]) return _spriteCache[key];

    var cv = document.createElement("canvas");
    cv.width = size; cv.height = size;
    var ctx = cv.getContext("2d");
    var im = imgCache[src] && imgCache[src]._img;

    if (!im || !im.width) {
      /* 图未就绪的占位：抽象蛙脸 */
      ctx.fillStyle = hex || "#7ec850";
      ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 3.2, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(5,7,26,.85)";
      ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 3.2, 0, 7); ctx.fill();
      ctx.fillStyle = hex || "#7ec850";
      ctx.font = "bold " + Math.round(size / 3.4) + "px 'PingFang SC',sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("蛙", size / 2, size / 2 + size / 40);
      _spriteCache[key] = cv;
      return cv;
    }

    /* 1. 基础绘制（可带色相滤镜） */
    if (opt.hue || opt.sat) {
      try {
        ctx.filter = "hue-rotate(" + (opt.hue || 0) + "deg) saturate(" + (opt.sat || 1) + ")";
      } catch (e) { }
    }
    ctx.drawImage(im, 0, 0, size, size);
    ctx.filter = "none";

    /* 2. 颜色叠加，只作用于已有像素 */
    if (hex) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = opt.alpha === undefined ? 0.72 : opt.alpha;
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, size, size);
      if ((opt.blend || "multiply") === "multiply") {
        ctx.globalCompositeOperation = "overlay";
        ctx.globalAlpha = 0.3;
        ctx.fillRect(0, 0, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    /* 3. 描边光晕（战斗剪影） */
    if (opt.stroke) {
      var halo = document.createElement("canvas");
      halo.width = size; halo.height = size;
      var hc = halo.getContext("2d");
      hc.globalAlpha = 0.5;
      for (var a = 0; a < 12; a++) {
        var ang = a / 12 * Math.PI * 2;
        hc.drawImage(im, Math.cos(ang) * 3, Math.sin(ang) * 3, size, size);
      }
      hc.globalCompositeOperation = "source-in";
      hc.fillStyle = opt.stroke;
      hc.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = "destination-over";
      ctx.drawImage(halo, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      _spriteCache[key] = cv;
      return cv;
    }

    _spriteCache[key] = cv;
    return cv;
  };

  /* CSS 滤镜版精灵 */
  NAIWA.filterSprite = function (src, filter, size) {
    size = size || 256;
    var key = "F|" + src + "|" + filter + "|" + size;
    if (_spriteCache[key]) return _spriteCache[key];
    var cv = document.createElement("canvas");
    cv.width = size; cv.height = size;
    var ctx = cv.getContext("2d");
    var im = imgCache[src] && imgCache[src]._img;
    if (im && im.width) {
      try { ctx.filter = filter; } catch (e) { }
      ctx.drawImage(im, 0, 0, size, size);
      ctx.filter = "none";
    }
    _spriteCache[key] = cv;
    return cv;
  };

  /* ---------------- 光络背景（粒子网络） ---------------- */
  NAIWA.netBackground = function (canvas, opt) {
    opt = opt || {};
    if (!canvas) return { stop: function () { }, burst: function () { } };
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, dpr = Math.min(global.devicePixelRatio || 1, 2);
    var density = opt.density || 20000;
    var linkDist = opt.link || 120;
    var dotColor = opt.dotColor || "rgba(255,217,77,.55)";
    var lineColor = opt.lineColor || "34,211,238";
    var pts = [], raf = 0, running = true;

    function resize() {
      W = canvas.clientWidth || global.innerWidth;
      H = canvas.clientHeight || global.innerHeight;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = opt.count || Math.max(22, Math.min(80, Math.round(W * H / density)));
      pts = [];
      for (var i = 0; i < n; i++) {
        pts.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - .5) * .45, vy: (Math.random() - .5) * .45,
          r: .9 + Math.random() * 1.5
        });
      }
    }

    function tick() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      var i, p;
      for (i = 0; i < pts.length; i++) {
        p = pts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      }
      /* 邻近连线（网格加速） */
      var cell = linkDist, grid = {}, k;
      for (i = 0; i < pts.length; i++) {
        k = Math.floor(pts[i].x / cell) + "," + Math.floor(pts[i].y / cell);
        (grid[k] = grid[k] || []).push(pts[i]);
      }
      ctx.lineWidth = 1;
      for (k in grid) {
        var arr = grid[k];
        for (var a = 0; a < arr.length; a++) {
          for (var b = a + 1; b < arr.length; b++) {
            var d = Math.hypot(arr[a].x - arr[b].x, arr[a].y - arr[b].y);
            if (d < linkDist) {
              ctx.strokeStyle = "rgba(" + lineColor + "," + ((1 - d / linkDist) * .26).toFixed(3) + ")";
              ctx.beginPath();
              ctx.moveTo(arr[a].x, arr[a].y);
              ctx.lineTo(arr[b].x, arr[b].y);
              ctx.stroke();
            }
          }
        }
      }
      ctx.fillStyle = dotColor;
      for (i = 0; i < pts.length; i++) {
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, pts[i].r, 0, 7);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    }

    resize();
    global.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!running) { running = true; tick(); }
    });
    tick();
    return {
      stop: function () { running = false; cancelAnimationFrame(raf); },
      burst: function (x, y, n) {
        n = n || 6;
        for (var i = 0; i < n; i++) pts.push({ x: x, y: y, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3, r: 1.4 });
      },
      resize: resize
    };
  };

  /* ---------------- 程序化音效（WebAudio，无音频文件） ---------------- */
  NAIWA.audio = (function () {
    var ac = null;
    var enabled = NAIWA.store.get("sound", true);
    function ctx() {
      if (!ac) {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        try { ac = new AC(); } catch (e) { return null; }
      }
      if (ac.state === "suspended") { try { ac.resume(); } catch (e) { } }
      return ac;
    }
    function tone(freq, dur, type, vol, slideTo) {
      var a = ctx(); if (!a || !enabled) return;
      var o = a.createOscillator(), g = a.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, a.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), a.currentTime + dur);
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(vol || .12, a.currentTime + .008);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g); g.connect(a.destination);
      o.start(); o.stop(a.currentTime + dur + .02);
    }
    function noise(dur, vol, hp) {
      var a = ctx(); if (!a || !enabled) return;
      var len = Math.max(1, Math.floor(a.sampleRate * dur));
      var buf = a.createBuffer(1, len, a.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var s = a.createBufferSource(); s.buffer = buf;
      var f = a.createBiquadFilter();
      f.type = "highpass"; f.frequency.value = hp || 600;
      var g = a.createGain(); g.gain.value = vol || .18;
      s.connect(f); f.connect(g); g.connect(a.destination);
      s.start();
    }
    return {
      get enabled() { return enabled; },
      toggle: function () { enabled = !enabled; NAIWA.store.set("sound", enabled); return enabled; },
      swing: function () { noise(.09, .07, 1400); },
      hitLight: function () { tone(320, .1, "square", .1, 150); noise(.06, .12, 900); },
      hitHeavy: function () { tone(160, .22, "sawtooth", .14, 60); noise(.12, .2, 400); },
      block: function () { noise(.1, .16, 2600); tone(760, .07, "triangle", .07); },
      special: function () { tone(220, .5, "sawtooth", .12, 900); noise(.3, .1, 300); },
      super: function () { tone(120, 1.0, "sawtooth", .16, 1200); },
      ko: function () { tone(400, .9, "square", .16, 60); },
      round: function () { tone(660, .18, "triangle", .12); setTimeout(function () { tone(990, .22, "triangle", .12); }, 150); },
      select: function () { tone(880, .06, "square", .08); },
      coin: function () { tone(1180, .07, "square", .08); setTimeout(function () { tone(1560, .1, "square", .08); }, 70); },
      error: function () { tone(150, .25, "square", .1, 90); },
      charge: function () { tone(300, .6, "triangle", .1, 1500); }
    };
  })();

  /* ---------------- 页面进入动效 ---------------- */
  NAIWA.pageIn = function () {
    var s = document.createElement("style");
    s.textContent =
      "@keyframes naiwaFade{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}" +
      "body{animation:naiwaFade .5s ease both}";
    document.head.appendChild(s);
  };

  /* ---------------- 数字滚动 ---------------- */
  NAIWA.countTo = function (el, target, dur, fmtFn) {
    if (!el) return;
    var from = parseFloat(el.dataset.v || "0") || 0, t0 = performance.now();
    dur = dur || 1200;
    (function step(now) {
      var t = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      var v = from + (target - from) * e;
      el.textContent = fmtFn ? fmtFn(v) : NAIWA.fmt(Math.round(v));
      if (t < 1) requestAnimationFrame(step);
      else el.dataset.v = target;
    })(t0);
  };

  /* ---------------- 自动挂载 ---------------- */
  function boot() {
    NAIWA.mountNav();
    NAIWA.pageIn();
    var bg = document.getElementById("netbg");
    if (bg) NAIWA.netBackground(bg, { dotColor: "rgba(255,217,77,.5)" });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

})(window);
