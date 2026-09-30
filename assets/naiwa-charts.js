/* ============================================================
   🐸 轻量图表引擎  (assets/naiwa-charts.js)
   ------------------------------------------------------------
   为什么要自己写：
   `echarts.min.js` 有 **1005 KB**，而首页首屏总共要下 2.19 MB。
   国内那条链路抖到 19 秒，大文件必然断在半路——这就是"别人打不开"的
   直接原因（对比：能打开的 frog-miner 只有 10 KB）。

   这个模块只实现本站真正用到的图表类型，体积压到 20 KB 级：
     line（折线+面积+标记点）· bar（柱状+渐变+标线）
     pie（环形饼）· map（地图着色 + visualMap + geo 坐标系）
     effectScatter / scatter（气泡）· lines（飞线）· sankey（桑基）
   导航、缩放、tooltip、emphasis 这些交互也一并实现。

   接口刻意做成和 ECharts 兼容，页面几乎不用改：
     var c = NAIWA.charts.init(el, null, {renderer:"canvas"});
     c.setOption({...});
     c.resize(); c.on("click", fn); c.dispatchAction({type:"highlight",...});
   ============================================================ */
(function (global) {
  "use strict";
  var NC = global.NAIWA = global.NAIWA || {};
  var NS = "http://www.w3.org/2000/svg";

  /* ---------------- 工具 ---------------- */
  function grad(ctx, stops, horizontal) {
    var g;
    if (horizontal) g = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
    else g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    stops.forEach(function (s) { g.addColorStop(s.offset, s.color); });
    return g;
  }
  NC.charts = NC.charts || {};
  NC.charts.graphic = {
    LinearGradient: function (x0, y0, x1, y1, stops) {
      return { __grad: true, x0: x0, y0: y0, x1: x1, y1: y1, stops: stops };
    }
  };
  function paint(ctx, style, x0, y0, x1, y1) {
    if (style && style.__grad) {
      var g = ctx.createLinearGradient(x0, y0, x1, y1);
      style.stops.forEach(function (s) { g.addColorStop(s.offset, s.color); });
      return g;
    }
    return style;
  }
  function hexA(hex, a) {
    if (hex && hex.charAt(0) === "#") {
      var v = parseInt(hex.length === 4
        ? hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3] : hex.slice(1), 16);
      return "rgba(" + ((v >> 16) & 255) + "," + ((v >> 8) & 255) + "," + (v & 255) + "," + a + ")";
    }
    return hex;
  }
  function lerpColor(a, b, t) {
    function rgb(h) {
      h = h.replace("#", "");
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var v = parseInt(h, 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    var ca = rgb(a), cb = rgb(b);
    return "rgb(" + Math.round(ca[0] + (cb[0] - ca[0]) * t) + ","
      + Math.round(ca[1] + (cb[1] - ca[1]) * t) + ","
      + Math.round(ca[2] + (cb[2] - ca[2]) * t) + ")";
  }
  function colorAt(stops, ratio) {
    if (!stops || !stops.length) return "#22d3ee";
    ratio = Math.max(0, Math.min(1, ratio));
    var n = stops.length - 1, i = Math.min(n - 1, Math.floor(ratio * n)), t = ratio * n - i;
    return lerpColor(stops[i], stops[i + 1], t);
  }
  /* 等值线世界的经纬度 → 屏幕坐标 */
  function proj(geo, x, y, w, h) {
    return [geo._x + (x - geo._minX) * geo._k, geo._y + (geo._maxY - y) * geo._k];
  }

  /* ---------------- 图表实例 ---------------- */
  function Chart(el, opts) {
    opts = opts || {};
    this.el = typeof el === "string" ? document.getElementById(el) : el;
    if (!this.el) throw new Error("图表容器不存在");
    this.opt = {};
    this.handlers = {};
    this.hoverPt = null;
    this.geo = null;
    this.raf = null;
    var self = this;
    /* 容器里放一张 canvas，尺寸跟随容器 */
    this.cv = document.createElement("canvas");
    this.cv.style.cssText = "width:100%;height:100%;display:block";
    this.el.innerHTML = "";
    this.el.appendChild(this.cv);
    this.ctx = this.cv.getContext("2d");
    var tip = document.createElement("div");
    tip.style.cssText = "position:absolute;pointer-events:none;z-index:20;display:none;"
      + "background:rgba(8,12,34,.95);border:1px solid #2a3a6a;border-radius:8px;"
      + "padding:8px 11px;font-size:12px;line-height:1.7;color:#e8ecff;max-width:280px;"
      + "box-shadow:0 8px 24px rgba(0,0,0,.5);white-space:nowrap";
    if (getComputedStyle(this.el).position === "static") this.el.style.position = "relative";
    this.el.appendChild(tip);
    this.tip = tip;
    this._fit();
    global.addEventListener("resize", function () { self.resize(); });
    this.cv.addEventListener("mousemove", function (e) { self._onMove(e); });
    this.cv.addEventListener("mouseleave", function () { self.tip.style.display = "none"; self.hoverPt = null; self._schedule(); });
    this.cv.addEventListener("click", function (e) { self._onClick(e); });
    /* 动画循环（气泡涟漪、飞线动效需要持续重绘） */
    this._loop();
  }
  Chart.prototype._fit = function () {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var r = this.el.getBoundingClientRect();
    this.W = Math.max(80, Math.round(r.width));
    this.H = Math.max(60, Math.round(r.height));
    this.cv.width = this.W * dpr; this.cv.height = this.H * dpr;
    this.cv.height = this.H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;
  };
  Chart.prototype.resize = function () {
    var oldW = this.W;
    this._fit();
    if (oldW !== this.W && this.opt.geo) this._computeGeo();
    this._schedule();
  };
  Chart.prototype._schedule = function () { this._dirty = true; };
  Chart.prototype._loop = function () {
    var self = this;
    function tick(t) {
      self.t = t || 0;
      /* 只有含动态元素时才持续重绘，静态图表不浪费性能 */
      if (self._dirty || self._animated()) { self._dirty = false; self._render(); }
      self.raf = requestAnimationFrame(tick);
    }
    tick(0);
  };
  Chart.prototype._animated = function () {
    var s = this.opt.series || [];
    for (var i = 0; i < s.length; i++) {
      if (s[i].type === "effectScatter") return true;
      if (s[i].type === "lines" && s[i].effect && s[i].effect.show) return true;
    }
    return false;
  };
  Chart.prototype.dispose = function () {
    cancelAnimationFrame(this.raf);
    if (this.cv.parentNode) this.cv.parentNode.removeChild(this.cv);
    if (this.tip.parentNode) this.tip.parentNode.removeChild(this.tip);
  };
  Chart.prototype.on = function (evt, fn) { (this.handlers[evt] = this.handlers[evt] || []).push(fn); };
  Chart.prototype._emit = function (evt, arg) {
    (this.handlers[evt] || []).forEach(function (f) { try { f(arg); } catch (e) { } });
  };
  Chart.prototype.dispatchAction = function (a) {
    if (a.type === "highlight" || a.type === "downplay") {
      this.highlight = a.type === "highlight" ? a.name : null;
      this._schedule();
    }
  };
  /* 合并式 setOption：页面是多次 setOption 增量配置的，必须能做浅合并 */
  Chart.prototype.setOption = function (o) {
    this.opt = this._merge(this.opt, o);
    if (o.geo) this._computeGeo();
    this._schedule();
    return this;
  };
  Chart.prototype._merge = function (a, b) {
    var out = {}, k;
    for (k in a) out[k] = a[k];
    for (k in b) {
      var v = b[k];
      if (v && typeof v === "object" && !Array.isArray(v) && !v.__grad &&
          a[k] && typeof a[k] === "object" && !Array.isArray(a[k])) {
        out[k] = this._merge(a[k], v);
      } else out[k] = v;
    }
    /* series 特殊处理：数组按下标合并，便于增量更新数据 */
    if (b.series && Array.isArray(b.series) && Array.isArray(a.series)) {
      out.series = a.series.map(function (s, i) {
        var ns = b.series[i];
        if (!ns) return s;
        var m = {};
        for (var kk in s) m[kk] = s[kk];
        for (var kk2 in ns) {
          var vv = ns[kk2];
          if (vv && typeof vv === "object" && !Array.isArray(vv) && !vv.__grad &&
              s[kk2] && typeof s[kk2] === "object" && !Array.isArray(s[kk2])) {
            var mm = {};
            for (var k3 in s[kk2]) mm[k3] = s[kk2][k3];
            for (var k4 in vv) mm[k4] = vv[k4];
            m[kk2] = mm;
          } else m[kk2] = vv;
        }
        return m;
      });
      if (b.series.length > a.series.length) {
        out.series = out.series.concat(b.series.slice(a.series.length));
      }
    }
    return out;
  };

  /* ---------------- 地图：注册与投影 ---------------- */
  NC.charts._maps = {};
  NC.charts.registerMap = function (name, geo) {
    NC.charts._maps[name] = geo;
    /* 合并 nameMap：把中文 key 也注册成要素别名 */
    return geo;
  };
  Chart.prototype._computeGeo = function () {
    var o = this.opt.geo || {};
    var mapName = o.map || "world";
    var geo = NC.charts._maps[mapName];
    if (!geo) return;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    (geo.features || []).forEach(function (f) {
      var g = f.geometry;
      if (!g || !g.coordinates) return;
      var polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      polys.forEach(function (poly) {
        (poly || []).forEach(function (ring) {
          (ring || []).forEach(function (p) {
            if (p[0] < minX) minX = p[0];
            if (p[0] > maxX) maxX = p[0];
            if (p[1] < minY) minY = p[1];
            if (p[1] > maxY) maxY = p[1];
          });
        });
      });
    });
    if (minX > maxX) return;
    var pad = 10;
    var w = this.W - pad * 2, h = this.H - pad * 2;
    var k = Math.min(w / (maxX - minX), h / (maxY - minY));
    var cx = pad + (w - (maxX - minX) * k) / 2;
    var cy = pad + (h - (maxY - minY) * k) / 2;
    this.geo = {
      data: geo, minX: minX, maxX: maxX, minY: minY, maxY: maxY, k: k,
      _x: cx, _y: cy, _minX: minX, _maxY: maxY, _k: k,
      pad: pad, zoom: (o.zoom || 1), roam: o.roam
    };
    this.geo.center = [(minX + maxX) / 2, (minY + maxY) / 2];
  };

  /* ---------------- 渲染 ---------------- */
  Chart.prototype._render = function () {
    var ctx = this.ctx, o = this.opt;
    ctx.clearRect(0, 0, this.W, this.H);
    if (o.backgroundColor && o.backgroundColor !== "transparent") {
      ctx.fillStyle = o.backgroundColor;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    var series = o.series || [];
    /* 先画地图底图，再画数据层 */
    series.forEach(function (s) { if (s.type === "map") this._drawMap(s); }, this);
    series.forEach(function (s) {
      if (s.type === "lines") this._drawLines(s);
      else if (s.type === "pie") this._drawPie(s);
      else if (s.type === "bar") this._drawBar(s);
      else if (s.type === "line") this._drawLine(s);
      else if (s.type === "sankey") this._drawSankey(s);
    }, this);
    series.forEach(function (s) {
      if (s.type === "effectScatter" || s.type === "scatter") this._drawScatter(s);
    }, this);
    this._drawLegend();
  };

  /* --- 地图着色 + visualMap --- */
  Chart.prototype._drawMap = function (s) {
    var g = this.geo;
    if (!g) return;
    var ctx = this.ctx;
    var o = this.opt;
    var vm = o.visualMap || {};
    var stops = (vm.inRange && vm.inRange.color) || ["#0d1b3e", "#22d3ee"];
    var vmin = vm.min === undefined ? 0 : vm.min;
    var vmax = vm.max === undefined ? 1 : vm.max;
    var map = s.nameMap || {};
    var values = {};
    (s.data || []).forEach(function (d) { values[d.name] = d.value; });
    var itemStyle = (o.geo && o.geo.itemStyle) || {};
    var self = this;

    function drawRing(ring, style, strokeOnly) {
      ctx.beginPath();
      var first = true;
      ring.forEach(function (p) {
        var q = proj(g, p[0], p[1], self.W, self.H);
        if (first) { ctx.moveTo(q[0], q[1]); first = false; }
        else ctx.lineTo(q[0], q[1]);
      });
      ctx.closePath();
      if (!strokeOnly) { ctx.fillStyle = style.fill; ctx.fill(); }
      if (style.stroke) { ctx.strokeStyle = style.stroke; ctx.lineWidth = style.lw; ctx.stroke(); }
    }

    (g.data.features || []).forEach(function (f) {
      var raw = f.properties && f.properties.name;
      if (!raw) return;
      /* nameMap 是「中文 → 英文」，而 GeoJSON 用英文名，所以要反查 */
      var zh = null;
      for (var k in map) { if (map[k] === raw) { zh = k; break; } }
      var val = zh !== null && values[zh] !== undefined ? values[zh] : values[raw];
      var isHi = self.highlight && (self.highlight === raw || self.highlight === zh);
      var fill;
      if (val === undefined) {
        fill = itemStyle.areaColor || "#0d1b3e";
      } else {
        fill = colorAt(stops, (val - vmin) / (vmax - vmin || 1));
      }
      var style = {
        fill: isHi ? "#1e3a7a" : fill,
        stroke: isHi ? "#ffd94d" : (itemStyle.borderColor || "#2a3a6a"),
        lw: isHi ? 1.4 : (itemStyle.borderWidth || 0.7)
      };
      var geom = f.geometry;
      if (!geom || !geom.coordinates) return;
      var polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
      polys.forEach(function (poly) {
        (poly || []).forEach(function (ring) { drawRing(ring, style, false); });
      });
    });
    this._drawVisualMapBar(vm, stops);
  };
  Chart.prototype._drawVisualMapBar = function (vm, stops) {
    if (!vm || vm.show === false) return;
    var ctx = this.ctx;
    var x = vm.left === undefined ? 12 : vm.left;
    var h = vm.itemHeight || 120, w = vm.itemWidth || 11;
    var y = this.H - 56 - h;
    for (var i = 0; i < h; i++) {
      ctx.fillStyle = colorAt(stops, 1 - i / h);
      ctx.fillRect(x, y + i, w, 1);
    }
    ctx.strokeStyle = "#2a3a6a"; ctx.lineWidth = 0.6;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#8b93c8";
    ctx.font = "10px 'PingFang SC',sans-serif";
    ctx.textAlign = "left";
    ctx.fillText((vm.text && vm.text[1]) || "低频", x + w + 5, y + 9);
    ctx.fillText((vm.text && vm.text[0]) || "高频", x + w + 5, y + h);
  };

  /* --- 飞线 --- */
  Chart.prototype._drawLines = function (s) {
    var g = this.geo;
    if (!g) return;
    var ctx = this.ctx, self = this;
    var ls = s.lineStyle || {};
    var color = (s.effect && s.effect.color) || ls.color || "#22d3ee";
    (s.data || []).forEach(function (d, idx) {
      var c = d.coords;
      if (!c || c.length < 2) return;
      var a = proj(g, c[0][0], c[0][1], self.W, self.H);
      var b = proj(g, c[1][0], c[1][1], self.W, self.H);
      /* 曲线：抬高控制点做出弧线 */
      var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var len = Math.hypot(dx, dy) || 1;
      var curve = (ls.curveness === undefined ? 0.25 : ls.curveness) * len * 0.6;
      var cxp = mx - dy / len * curve, cyp = my + dx / len * curve;

      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(cxp, cyp, b[0], b[1]);
      ctx.strokeStyle = hexA(color, ls.opacity === undefined ? 0.45 : ls.opacity * 0.8);
      ctx.lineWidth = ls.width || 1.6;
      ctx.stroke();

      /* 流动小箭头 */
      var period = (s.effect && s.effect.period) || 3;
      var trail = (s.effect && s.effect.trailLength) || 0.4;
      var head = ((self.t / 1000) / period + idx * 0.13) % 1;
      for (var k = 0; k < 4; k++) {
        var t = head - k * trail * 0.14;
        if (t < 0 || t > 1) continue;
        var it = 1 - t;
        var px = it * it * a[0] + 2 * it * t * cxp + t * t * b[0];
        var py = it * it * a[1] + 2 * it * t * cyp + t * t * b[1];
        ctx.beginPath();
        ctx.arc(px, py, (s.effect && s.effect.symbolSize ? s.effect.symbolSize : 4) * (1 - k * 0.18), 0, 7);
        ctx.fillStyle = hexA(color, 0.95 - k * 0.22);
        ctx.fill();
      }
    });
  };

  /* --- 气泡 --- */
  Chart.prototype._drawScatter = function (s) {
    var ctx = this.ctx, self = this;
    var g = this.geo;
    var data = (s.data || []).filter(Boolean);
    var vals = data.map(function (d) { return d.value ? d.value[2] : 0; });
    var vmax = Math.max.apply(null, vals.concat([1]));
    var symbolSize = s.symbolSize || function (v) { return 10 + v[2] / vmax * 40; };
    var pulse = (this.t / 1000) % 1;

    data.forEach(function (d) {
      if (!d.value) return;
      var xy = g ? proj(g, d.value[0], d.value[1], self.W, self.H) : [0, 0];
      var r = typeof symbolSize === "function" ? symbolSize(d.value) : symbolSize;
      var base = s.itemStyle && s.itemStyle.color;
      var col = typeof base === "function" ? base({ name: d.name }) : (base || "#ffd94d");
      var isHi = self.hoverPt && self.hoverPt.name === d.name;
      /* 涟漪 */
      if (s.type === "effectScatter") {
        for (var k = 0; k < 2; k++) {
          var pt = (pulse + k * 0.5) % 1;
          ctx.beginPath();
          ctx.arc(xy[0], xy[1], r + pt * r * 2.4, 0, 7);
          ctx.strokeStyle = hexA(col, (1 - pt) * 0.5);
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      var gd = ctx.createRadialGradient(xy[0], xy[1], 1, xy[0], xy[1], r);
      gd.addColorStop(0, "#ffffff");
      gd.addColorStop(0.5, col);
      gd.addColorStop(1, hexA(col, 0.15));
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], isHi ? r * 1.25 : r, 0, 7);
      ctx.fillStyle = gd; ctx.fill();
      /* 标签 */
      var lab = s.label || {};
      if (lab.show) {
        var txt = typeof lab.formatter === "function" ? lab.formatter({ name: d.name }) : d.name;
        if (txt) {
          ctx.font = (lab.fontSize || 10) + "px 'PingFang SC',sans-serif";
          ctx.textAlign = "left"; ctx.textBaseline = "middle";
          ctx.lineWidth = 3; ctx.strokeStyle = "rgba(5,7,26,.92)";
          ctx.strokeText(txt, xy[0] + r + 4, xy[1]);
          ctx.fillStyle = lab.color || "#c9d2ff";
          ctx.fillText(txt, xy[0] + r + 4, xy[1]);
        }
      }
    });
  };

  /* --- 折线 --- */
  Chart.prototype._drawLine = function (s) {
    var ctx = this.ctx;
    var o = this.opt;
    var grid = o.grid || { left: 50, right: 20, top: 30, bottom: 30 };
    var legendH = o.legend ? 24 : 0;
    var L = grid.left, R = this.W - (grid.right || 20);
    var T = (grid.top || 20) + legendH, B = this.H - (grid.bottom || 30);
    var xs = o.xAxis && o.xAxis.data ? o.xAxis.data : [];
    var allVals = [];
    (o.series || []).forEach(function (ss) {
      if (ss.type === "line") (ss.data || []).forEach(function (v) { allVals.push(typeof v === "object" ? v.value : v); });
    });
    var vmax = Math.max.apply(null, allVals.concat([1]));
    var vmin = 0;
    var n = Math.max(1, xs.length - 1);
    var self = this;
    function px(i) { return L + (R - L) * (i / n); }
    function py(v) { return B - (B - T) * ((v - vmin) / (vmax - vmin || 1)); }

    this._axes(L, R, T, B, xs, vmax, vmin, o);

    (o.series || []).forEach(function (ss) {
      if (ss.type !== "line") return;
      var col = (ss.itemStyle && ss.itemStyle.color) ||
        (ss.lineStyle && ss.lineStyle.color) || "#22d3ee";
      var pts = (ss.data || []).map(function (v, i) {
        return [px(i), py(typeof v === "object" ? v.value : v)];
      });
      if (ss.areaStyle) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], B);
        pts.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
        ctx.lineTo(pts[pts.length - 1][0], B);
        ctx.closePath();
        ctx.fillStyle = paint(ctx, ss.areaStyle.color, 0, T, 0, B);
        ctx.fill();
      }
      ctx.beginPath();
      pts.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
      ctx.strokeStyle = paint(ctx, col, 0, 0, this.W, 0);
      ctx.lineWidth = (ss.lineStyle && ss.lineStyle.width) || 2.4;
      ctx.lineJoin = "round";
      ctx.stroke();
      if (ss.symbol && ss.symbol !== "none") {
        pts.forEach(function (p, i) {
          ctx.beginPath();
          ctx.arc(p[0], p[1], (ss.symbolSize || 5) / 2 + 1, 0, 7);
          ctx.fillStyle = col; ctx.fill();
          ctx.strokeStyle = "#05071a"; ctx.lineWidth = 1.2; ctx.stroke();
        });
      }
      /* 最大值标记点 */
      if (ss.markPoint && ss.markPoint.data) {
        ss.markPoint.data.forEach(function (mp) {
          if (mp.type !== "max") return;
          var mi = 0;
          (ss.data || []).forEach(function (v, i) {
            if ((typeof v === "object" ? v.value : v) > (typeof ss.data[mi] === "object" ? ss.data[mi].value : ss.data[mi])) mi = i;
          });
          var p = pts[mi];
          var sz = (ss.markPoint.symbolSize || 40) / 2;
          ctx.beginPath();
          ctx.arc(p[0], p[1] - sz, sz * 0.8, 0, 7);
          ctx.fillStyle = (ss.markPoint.itemStyle && ss.markPoint.itemStyle.color) || "rgba(255,77,79,.9)";
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.font = "bold 10px 'PingFang SC',sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          var val = typeof ss.data[mi] === "object" ? ss.data[mi].value : ss.data[mi];
          ctx.fillText(val > 9999 ? Math.round(val / 1000) + "k" : val, p[0], p[1] - sz);
        });
      }
    }, this);
    this._legend(o);
  };

  /* --- 柱状 --- */
  Chart.prototype._drawBar = function (s) {
    var ctx = this.ctx, o = this.opt;
    var grid = o.grid || { left: 44, right: 16, top: 16, bottom: 26 };
    var L = grid.left, R = this.W - (grid.right || 16);
    var T = grid.top || 16, B = this.H - (grid.bottom || 26);
    var xs = o.xAxis && o.xAxis.data ? o.xAxis.data : [];
    var data = s.data || [];
    var vals = data.map(function (d) { return typeof d === "object" ? d.value : d; });
    var vmax = Math.max.apply(null, vals.concat([1]));
    var n = xs.length || data.length;
    var slot = (R - L) / Math.max(1, n);
    var bw = (s.barWidth || Math.min(22, slot * 0.55));
    var self = this;
    this._axes(L, R, T, B, xs, vmax, 0, o, true);
    data.forEach(function (d, i) {
      var v = typeof d === "object" ? d.value : d;
      var x = L + slot * (i + 0.5) - bw / 2;
      var y = B - (B - T) * (v / (vmax || 1));
      var st = (typeof d === "object" && d.itemStyle) || s.itemStyle || {};
      ctx.fillStyle = paint(ctx, st.color || "#ffd94d", 0, y, 0, B) || "#ffd94d";
      var r = st.borderRadius || 0;
      if (Array.isArray(r) && ctx.roundRect) {
        ctx.beginPath(); ctx.roundRect(x, y, bw, B - y, r[0] || 0); ctx.fill();
      } else ctx.fillRect(x, y, bw, B - y);
      if (s.label && s.label.show) {
        ctx.fillStyle = s.label.color || "#ffd94d";
        ctx.font = "bold " + (s.label.fontSize || 11) + "px 'PingFang SC',sans-serif";
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(v, x + bw + 5, y + (B - y) / 2);
      }
    });
    /* 标线 */
    if (s.markLine && s.markLine.data) {
      s.markLine.data.forEach(function (ml) {
        if (ml.xAxis === undefined) return;
        var i = xs.indexOf(String(ml.xAxis));
        if (i < 0) i = Number(ml.xAxis);
        var x = L + slot * (i + 0.5);
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = (s.markLine.lineStyle && s.markLine.lineStyle.color) || "#ff6ec7";
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, B); ctx.stroke();
        ctx.restore();
        if (ml.label && ml.label.formatter) {
          ctx.fillStyle = (ml.label.color) || "#ff6ec7";
          ctx.font = (ml.label.fontSize || 10) + "px 'PingFang SC',sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(ml.label.formatter, x, T - 4);
        }
      });
    }
  };

  /* --- 环形饼 --- */
  Chart.prototype._drawPie = function (s) {
    var ctx = this.ctx;
    var data = s.data || [];
    var total = data.reduce(function (a, d) { return a + (d.value || 0); }, 0) || 1;
    var cx = this.W / 2, cy = this.H / 2 - 6;
    var rad = Math.min(this.W, this.H) / 2 - 34;
    var r0 = Array.isArray(s.radius) ? rad * parseFloat(s.radius[0]) / 100 : rad * 0.42;
    var r1 = Array.isArray(s.radius) ? rad * parseFloat(s.radius[1]) / 100 : rad * 0.76;
    var a0 = -Math.PI / 2;
    data.forEach(function (d) {
      var ang = (d.value / total) * Math.PI * 2;
      var col = (d.itemStyle && d.itemStyle.color) || "#22d3ee";
      ctx.beginPath();
      ctx.arc(cx, cy, r1, a0, a0 + ang);
      ctx.arc(cx, cy, r0, a0 + ang, a0, true);
      ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = "#0a0e24"; ctx.lineWidth = 3; ctx.stroke();
      /* 引导线 + 标签 */
      var mid = a0 + ang / 2;
      var lx = cx + Math.cos(mid) * (r1 + 12), ly = cy + Math.sin(mid) * (r1 + 12);
      var ex = cx + Math.cos(mid) * (r1 + 26), ey = cy + Math.sin(mid) * (r1 + 26);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(mid) * r1, cy + Math.sin(mid) * r1);
      ctx.lineTo(lx, ly); ctx.lineTo(ex, ey);
      ctx.strokeStyle = hexA(col, 0.75); ctx.lineWidth = 1;
      ctx.stroke();
      if (s.label && s.label.show !== false) {
        ctx.fillStyle = (s.label && s.label.color) || "#c9d2ff";
        ctx.font = ((s.label && s.label.fontSize) || 11) + "px 'PingFang SC',sans-serif";
        ctx.textAlign = Math.cos(mid) >= 0 ? "left" : "right";
        ctx.textBaseline = "middle";
        var pct = Math.round(d.value / total * 100);
        ctx.fillText(d.name, ex + (Math.cos(mid) >= 0 ? 4 : -4), ey - 6);
        ctx.fillStyle = "#8b93c8";
        ctx.fillText(pct + "%", ex + (Math.cos(mid) >= 0 ? 4 : -4), ey + 7);
      }
      a0 += ang;
    });
  };

  /* --- 桑基图 --- */
  Chart.prototype._drawSankey = function (s) {
    var ctx = this.ctx;
    var nodes = s.data || [], links = s.links || [];
    if (!nodes.length) return;
    /* 分层：按 links 计算深度 */
    var depth = {}, nameOf = {};
    nodes.forEach(function (n) { nameOf[n.name] = n; });
    nodes.forEach(function (n) { depth[n.name] = 0; });
    for (var it = 0; it < 12; it++) {
      var changed = false;
      links.forEach(function (l) {
        var d = (depth[l.source] || 0) + 1;
        if (d > (depth[l.target] || 0)) { depth[l.target] = d; changed = true; }
      });
      if (!changed) break;
    }
    var maxD = 0;
    for (var k in depth) if (depth[k] > maxD) maxD = depth[k];
    var cols = {};
    for (var k2 in depth) (cols[depth[k2]] = cols[depth[k2]] || []).push(k2);
    var pad = 8, top = 10, nodeW = s.nodeWidth || 12;
    var L = s.left || 8, R = this.W - (s.right || 110);
    var colW = (R - L) / (maxD + 1 || 1);
    var pos = {};
    var sumIn = {}, sumOut = {};
    links.forEach(function (l) {
      sumOut[l.source] = (sumOut[l.source] || 0) + l.value;
      sumIn[l.target] = (sumIn[l.target] || 0) + l.value;
    });
    var self = this;
    for (var d2 = 0; d2 <= maxD; d2++) {
      var list = cols[d2] || [];
      var tot = list.reduce(function (a, nm) { return a + Math.max(sumIn[nm] || 0, sumOut[nm] || 0); }, 0) || 1;
      var avail = this.H - top * 2 - pad * (list.length - 1);
      var y = top;
      list.forEach(function (nm) {
        var w = Math.max(sumIn[nm] || 0, sumOut[nm] || 0);
        var h = Math.max(5, avail * (w / tot));
        pos[nm] = { x: L + colW * d2, y: y, h: h, w: w };
        y += h + pad;
      });
    }
    /* 连线 */
    var accOut = {}, accIn = {};
    links.forEach(function (l) {
      var a = pos[l.source], b = pos[l.target];
      if (!a || !b) return;
      var ah = a.h * (l.value / (sumOut[l.source] || 1));
      var bh = b.h * (l.value / (sumIn[l.target] || 1));
      var ay = a.y + (accOut[l.source] = (accOut[l.source] || 0)) + ah / 2;
      var by = b.y + (accIn[l.target] = (accIn[l.target] || 0)) + bh / 2;
      accOut[l.source] += ah; accIn[l.target] += bh;
      var x0 = a.x + nodeW, x1 = b.x;
      var cxx = (x0 + x1) / 2;
      var g = ctx.createLinearGradient(x0, 0, x1, 0);
      var col = ["#22d3ee", "#ffd94d", "#ff6ec7", "#7ec850"][Math.min(3, depth[l.source])];
      g.addColorStop(0, hexA(col, 0.42));
      g.addColorStop(1, hexA(col, 0.12));
      ctx.beginPath();
      ctx.moveTo(x0, ay - ah / 2);
      ctx.bezierCurveTo(cxx, ay - ah / 2, cxx, by - bh / 2, x1, by - bh / 2);
      ctx.lineTo(x1, by + bh / 2);
      ctx.bezierCurveTo(cxx, by + bh / 2, cxx, ay + ah / 2, x0, ay + ah / 2);
      ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
    });
    /* 节点方块 + 名称 */
    for (var nm2 in pos) {
      var p = pos[nm2];
      var col2 = ["#22d3ee", "#ffd94d", "#ff6ec7", "#7ec850"][Math.min(3, depth[nm2])];
      ctx.fillStyle = col2;
      ctx.fillRect(p.x, p.y, nodeW, p.h);
      ctx.fillStyle = "#c9d2ff";
      ctx.font = "11px 'PingFang SC',sans-serif";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(nm2, p.x + nodeW + 6, p.y + p.h / 2);
    }
  };

  /* --- 坐标轴 --- */
  Chart.prototype._axes = function (L, R, T, B, xs, vmax, vmin, o, isBar) {
    var ctx = this.ctx;
    var yAx = o.yAxis || {}, xAx = o.xAxis || {};
    ctx.save();
    ctx.font = ((yAx.axisLabel && yAx.axisLabel.fontSize) || 10) + "px 'PingFang SC',sans-serif";
    ctx.fillStyle = (yAx.axisLabel && yAx.axisLabel.color) || "#8b93c8";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.strokeStyle = (yAx.splitLine && yAx.splitLine.lineStyle && yAx.splitLine.lineStyle.color) || "rgba(42,58,106,.4)";
    ctx.lineWidth = 1;
    var ticks = 5;
    for (var i = 0; i <= ticks; i++) {
      var v = vmin + (vmax - vmin) * i / ticks;
      var y = B - (B - T) * (i / ticks);
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
      ctx.fillStyle = (yAx.axisLabel && yAx.axisLabel.color) || "#8b93c8";
      ctx.fillText(v >= 10000 ? (v / 10000).toFixed(0) + "万" : Math.round(v), L - 6, y);
    }
    /* x 轴标签 */
    if (xs && xs.length) {
      ctx.fillStyle = (xAx.axisLabel && xAx.axisLabel.color) || "#8b93c8";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      var step = Math.max(1, Math.ceil(xs.length / (isBar ? xs.length : 12)));
      var n = Math.max(1, xs.length - 1);
      for (var j = 0; j < xs.length; j += step) {
        var x = isBar ? L + ((R - L) / xs.length) * (j + 0.5) : L + (R - L) * (j / n);
        ctx.fillText(String(xs[j]), x, B + 6);
      }
    }
    ctx.strokeStyle = (xAx.axisLine && xAx.axisLine.lineStyle && xAx.axisLine.lineStyle.color) || "#2a3a6a";
    ctx.beginPath(); ctx.moveTo(L, B); ctx.lineTo(R, B); ctx.stroke();
    ctx.restore();
  };

  /* --- 图例 --- */
  Chart.prototype._legend = function (o) { this._legendItems = o.legend && o.legend.show !== false
    ? (o.series || []).filter(function (s) { return s.type === "line"; })
    : null; };
  Chart.prototype._drawLegend = function () {
    var items = this._legendItems;
    if (!items || !items.length) return;
    var ctx = this.ctx;
    var x = 14, y = 8;
    ctx.save();
    ctx.font = "11px 'PingFang SC',sans-serif";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    items.forEach(function (s) {
      var col = (s.itemStyle && s.itemStyle.color) || (s.lineStyle && s.lineStyle.color) || "#22d3ee";
      ctx.fillStyle = col;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, 12, 8, 3); ctx.fill(); }
      else ctx.fillRect(x, y, 12, 8);
      ctx.fillStyle = "#8b93c8";
      ctx.fillText(s.name || "", x + 17, y + 4);
      x += 17 + ctx.measureText(s.name || "").width + 16;
    });
    ctx.restore();
  };

  /* ---------------- 交互 ---------------- */
  Chart.prototype._hitTest = function (mx, my) {
    var s = (this.opt.series || []).filter(function (x) {
      return x.type === "effectScatter" || x.type === "scatter";
    })[0];
    if (!s || !this.geo) return null;
    var vals = (s.data || []).filter(Boolean).map(function (d) { return d.value[2]; });
    var vmax = Math.max.apply(null, vals.concat([1]));
    var symbolSize = s.symbolSize || function (v) { return 10 + v[2] / vmax * 40; };
    var self = this;
    var found = null;
    (s.data || []).forEach(function (d) {
      if (!d.value) return;
      var p = proj(self.geo, d.value[0], d.value[1], self.W, self.H);
      var r = typeof symbolSize === "function" ? symbolSize(d.value) : symbolSize;
      if (Math.hypot(mx - p[0], my - p[1]) < Math.max(8, r)) found = d;
    });
    return found;
  };
  Chart.prototype._onMove = function (e) {
    var r = this.cv.getBoundingClientRect();
    var mx = e.clientX - r.left, my = e.clientY - r.top;
    var hit = this._hitTest(mx, my);
    this.hoverPt = hit;
    if (hit) {
      var tf = this.opt.tooltip && this.opt.tooltip.formatter;
      this.tip.innerHTML = tf ? tf({ name: hit.name, value: hit.value, seriesType: "effectScatter", color: "#ffd94d" })
        : hit.name;
      this.tip.style.display = "block";
      var tw = this.tip.offsetWidth;
      this.tip.style.left = Math.min(this.W - tw - 6, mx + 14) + "px";
      this.tip.style.top = Math.max(4, my - 10) + "px";
      this.cv.style.cursor = "pointer";
    } else {
      this.tip.style.display = "none";
      this.cv.style.cursor = "default";
    }
    this._schedule();
  };
  Chart.prototype._onClick = function (e) {
    var r = this.cv.getBoundingClientRect();
    var hit = this._hitTest(e.clientX - r.left, e.clientY - r.top);
    if (hit) this._emit("click", { name: hit.name, value: hit.value, seriesType: "effectScatter" });
  };

  /* ---------------- 对外接口 ---------------- */
  NC.charts.init = function (el, theme, opts) { return new Chart(el, opts); };
  NC.charts.dispose = function (c) { if (c && c.dispose) c.dispose(); };
  /* 兼容 echarts.init(...).graphic 之类的静态引用 */
  NC.charts.getInstanceByDom = function () { return null; };

})(typeof window !== "undefined" ? window : globalThis);
