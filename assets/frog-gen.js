/* ============================================================
   🐸 奶蛙斗士 · 程序化角色生成器  (assets/frog-gen.js)
   ------------------------------------------------------------
   为什么需要它：
   原来 12 位斗士都是「同一张 naiwa 原图 + 换色」，轮廓完全一样，
   打起来分不清谁是谁，一张图翻来覆去也确实难看。
   这个模块改为**用 Canvas 现画**，每位斗士都有自己独立的：
     体型 / 头身比 / 眼睛 / 嘴型 / 花纹 / 四肢 / 装饰
   全部是矢量绘制，任意尺寸都清晰，且不含任何第三方素材。

   用法：
     var cv = NAIWA.genFrog("ninja", 128);        // 得到一张 canvas
     ctx.drawImage(cv, 0, 0, w, h);
     NAIWA.FROG_SPECS.ninja                         // 查看该角色参数
   ============================================================ */
(function (global) {
  "use strict";
  var NAIWA = global.NAIWA = global.NAIWA || {};

  /* ---------------- 工具 ---------------- */
  var h;
  function rgba(hex, a) {
    if (NAIWA.rgba) return NAIWA.rgba(hex, a);
    h = String(hex).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var v = parseInt(h, 16);
    return "rgba(" + ((v >> 16) & 255) + "," + ((v >> 8) & 255) + "," + (v & 255) + "," + a + ")";
  }
  /* 颜色明暗调整 */
  function shade(hex, amt) {
    var c = NAIWA.hex2rgb ? NAIWA.hex2rgb(hex) : [255, 255, 255];
    var f = function (x) { return Math.max(0, Math.min(255, Math.round(x + amt * 255))); };
    return "rgb(" + f(c[0]) + "," + f(c[1]) + "," + f(c[2]) + ")";
  }
  function rr(ctx, x, y, w, hh, r) {
    r = Math.min(r, w / 2, hh / 2);
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, hh, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + hh - r); ctx.quadraticCurveTo(x + w, y + hh, x + w - r, y + hh);
    ctx.lineTo(x + r, y + hh); ctx.quadraticCurveTo(x, y + hh, x, y + hh - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ---------------- 12 位斗士的外观参数 ---------------- */
  /* body: 身体宽(相对)    head: 头宽(相对)   eye: 眼距   pupil: 瞳孔大小
     mouth: smile|flat|fang|grin|wave   brow: none|angry|cool|sad|flame
     pattern: none|spots|stripes|crack|fade|camo   ears/arms/legs 各自形状
     extras: 数组，装饰物名称 */
  var SPECS = {
    big: {
      name: "大奶蛙", body: 1.34, head: 0.86, eye: 0.36, pupil: 0.40, eyeR: 1.00,
      mouth: "grin", brow: "none", pattern: "fade", limbs: "thick", markings: ["cheek"],
      extras: [], belly: true, legs: "wide"
    },
    small: {
      name: "小奶蛙", body: 0.92, head: 1.10, eye: 0.40, pupil: 0.62, eyeR: 1.16,
      mouth: "smile", brow: "sad", pattern: "none", limbs: "thin", markings: ["cheek"],
      extras: [], belly: true, legs: "short"
    },
    rainbow: {
      name: "彩虹奶蛙", body: 1.06, head: 0.96, eye: 0.38, pupil: 0.44, eyeR: 1.04,
      mouth: "grin", brow: "none", pattern: "fade", limbs: "normal",
      markings: ["cheek", "rainbow"], extras: ["rainbowAura"], belly: true, legs: "normal"
    },
    gold: {
      name: "金曜奶蛙", body: 1.22, head: 0.90, eye: 0.36, pupil: 0.36, eyeR: 0.98,
      mouth: "flat", brow: "cool", pattern: "fade", limbs: "thick",
      markings: ["shine"], extras: ["crown", "medal"], belly: true, legs: "wide"
    },
    ice: {
      name: "冰霜奶蛙", body: 1.02, head: 1.00, eye: 0.38, pupil: 0.40, eyeR: 1.06,
      mouth: "wave", brow: "cool", pattern: "crack", limbs: "normal",
      markings: ["ice"], extras: ["iceCrystals"], belly: true, legs: "normal"
    },
    flame: {
      name: "烈焰奶蛙", body: 1.10, head: 0.94, eye: 0.36, pupil: 0.34, eyeR: 0.96,
      mouth: "fang", brow: "flame", pattern: "fade", limbs: "muscular",
      markings: ["blaze"], extras: ["fireAura"], belly: false, legs: "wide"
    },
    ninja: {
      name: "影忍奶蛙", body: 1.00, head: 0.98, eye: 0.36, pupil: 0.34, eyeR: 0.98,
      mouth: "flat", brow: "angry", pattern: "none", limbs: "normal",
      markings: ["mask"], extras: ["scarf", "shuriken"], belly: false, legs: "normal"
    },
    samurai: {
      name: "武侍奶蛙", body: 1.04, head: 0.94, eye: 0.34, pupil: 0.32, eyeR: 0.94,
      mouth: "flat", brow: "angry", pattern: "stripes", limbs: "normal",
      markings: ["headband"], extras: ["katana"], belly: false, legs: "normal"
    },
    healer: {
      name: "治疗奶蛙", body: 1.06, head: 1.02, eye: 0.40, pupil: 0.50, eyeR: 1.10,
      mouth: "smile", brow: "none", pattern: "spots", limbs: "normal",
      markings: ["cheek", "cross"], extras: ["cap"], belly: true, legs: "normal"
    },
    thunder: {
      name: "雷电奶蛙", body: 0.98, head: 1.00, eye: 0.42, pupil: 0.44, eyeR: 1.12,
      mouth: "grin", brow: "angry", pattern: "fade", limbs: "thin",
      markings: ["bolt"], extras: ["bolts", "antenna"], belly: true, legs: "short"
    },
    shadow: {
      name: "幽冥奶蛙", body: 1.04, head: 0.96, eye: 0.38, pupil: 0.30, eyeR: 1.00,
      mouth: "flat", brow: "cool", pattern: "fade", limbs: "normal",
      markings: ["shadow", "glowEyes"], extras: ["shadowAura"], belly: false, legs: "normal"
    },
    boss: {
      name: "奶蛙之神", body: 1.30, head: 1.00, eye: 0.38, pupil: 0.42, eyeR: 1.08,
      mouth: "grin", brow: "cool", pattern: "fade", limbs: "thick",
      markings: ["halo", "cheek"], extras: ["halo", "wings", "crown"], belly: true, legs: "wide"
    }
  };

  /* ---------------- 主绘制函数 ---------------- */
  var cache = {};

  /**
   * 生成一位斗士的立绘
   * @param {string} id     斗士 id
   * @param {number} size   像素边长
   * @param {object} colors {body, glow, accent} 不传则用 NAIWA.FIGHTERS 里的配色
   * @returns {HTMLCanvasElement}
   */
  NAIWA.genFrog = function (id, size, colors) {
    size = Math.max(24, Math.round(size || 128));
    var f = (NAIWA.FIGHTERS && NAIWA.FIGHTERS.byId) ? NAIWA.FIGHTERS.byId(id) : null;
    colors = colors || {};
    var body0 = colors.body || (f && f.color) || "#7ec850";
    var glow = colors.glow || (f && f.glow) || body0;
    var accent = colors.accent || (f && f.accent) || "#ffd94d";
    var key = id + "|" + size + "|" + body0 + "|" + accent;
    if (cache[key]) return cache[key];

    var spec = SPECS[id] || SPECS.big;
    var cv = document.createElement("canvas");
    cv.width = size; cv.height = size;
    var ctx = cv.getContext("2d");
    var S = size / 100;              /* 以 100 为设计基准，便于按比例换算 */
    ctx.save();
    ctx.translate(size / 2, size * 0.97);   /* 原点放在脚底中央 */
    ctx.scale(S, S);

    var bodyW = 62 * spec.body;              /* 身体半宽 */
    var headW = 30 * spec.head;              /* 头半宽 */
    var headY = -58 * (0.86 + spec.body * 0.14);  /* 头部中心高度 */
    var bodyY = -20;                          /* 身体中心高度 */
    var bodyH = 26 * (0.9 + spec.body * 0.2);
    var dark = shade(body0, -0.22);
    var light = shade(body0, 0.24);

    /* ---------- 1. 后腿（在身体后面） ---------- */
    ctx.fillStyle = dark;
    var legSpread = spec.legs === "wide" ? 1.18 : spec.legs === "short" ? 0.82 : 1.0;
    [-1, 1].forEach(function (sgn) {
      ctx.save();
      ctx.translate(sgn * bodyW * 0.72 * legSpread, -4);
      ctx.rotate(sgn * 0.28);
      ctx.beginPath();
      ctx.ellipse(0, 0, 20 * spec.body * 0.7, 14 * spec.body * 0.62, 0, 0, 7);
      ctx.fill();
      /* 脚掌 */
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.ellipse(sgn * 6, 12, 15, 6.5, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.restore();
    });

    /* ---------- 2. 手臂 ---------- */
    var armLen = spec.limbs === "thin" ? 0.62 : spec.limbs === "muscular" ? 1.02 : 0.82;
    ctx.fillStyle = dark;
    [-1, 1].forEach(function (sgn) {
      ctx.save();
      ctx.translate(sgn * bodyW * 0.86, bodyY - 2);
      ctx.rotate(sgn * (0.45 - armLen * 0.12));
      ctx.beginPath();
      ctx.ellipse(0, 6 * armLen, 7.5 * armLen, 15 * armLen, 0, 0, 7);
      ctx.fill();
      /* 手 */
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.arc(0, 14 * armLen + 6 * armLen, 6 * armLen, 0, 7);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.restore();
    });

    /* ---------- 3. 身体（梨形） ---------- */
    var bodyGrad = ctx.createLinearGradient(0, bodyY - bodyH, 0, bodyY + bodyH + 10);
    bodyGrad.addColorStop(0, light);
    bodyGrad.addColorStop(0.55, body0);
    bodyGrad.addColorStop(1, dark);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    /* 用贝塞尔画一个下大上小的梨形 */
    ctx.moveTo(-bodyW * 0.62, bodyY - bodyH * 0.9);
    ctx.bezierCurveTo(-bodyW * 1.04, bodyY - bodyH * 0.1, -bodyW * 1.0, bodyY + bodyH * 0.95, 0, bodyY + bodyH * 1.12);
    ctx.bezierCurveTo(bodyW * 1.0, bodyY + bodyH * 0.95, bodyW * 1.04, bodyY - bodyH * 0.1, bodyW * 0.62, bodyY - bodyH * 0.9);
    ctx.closePath();
    ctx.fill();

    /* 肚皮 */
    if (spec.belly) {
      var bg = ctx.createLinearGradient(0, bodyY, 0, bodyY + bodyH * 1.1);
      bg.addColorStop(0, rgba("#ffffff", 0.5));
      bg.addColorStop(1, rgba("#ffffff", 0.05));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.ellipse(0, bodyY + bodyH * 0.28, bodyW * 0.58, bodyH * 0.72, 0, 0, 7);
      ctx.fill();
    }

    /* ---------- 4. 花纹 ---------- */
    ctx.save();
    ctx.globalAlpha = 0.32;
    if (spec.pattern === "spots") {
      ctx.fillStyle = dark;
      var spots = [[-0.45, -0.5], [0.4, -0.35], [-0.2, 0.2], [0.5, 0.25], [-0.55, 0.4], [0.15, -0.7]];
      spots.forEach(function (p) {
        ctx.beginPath();
        ctx.ellipse(p[0] * bodyW, bodyY + p[1] * bodyH, 7, 5.5, 0.4, 0, 7);
        ctx.fill();
      });
    } else if (spec.pattern === "stripes") {
      ctx.strokeStyle = dark; ctx.lineWidth = 4; ctx.lineCap = "round";
      for (var i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * bodyW * 0.24, bodyY - bodyH * 0.55);
        ctx.quadraticCurveTo(i * bodyW * 0.3, bodyY, i * bodyW * 0.34, bodyY + bodyH * 0.6);
        ctx.stroke();
      }
    } else if (spec.pattern === "crack") {
      ctx.strokeStyle = rgba("#ffffff", 0.85); ctx.lineWidth = 1.6;
      [[-0.4, -0.3, 0.1, 0.4], [0.3, -0.5, 0.5, 0.1], [-0.1, 0.1, -0.4, 0.55]].forEach(function (l) {
        ctx.beginPath();
        ctx.moveTo(l[0] * bodyW, bodyY + l[1] * bodyH);
        ctx.lineTo(l[2] * bodyW, bodyY + l[3] * bodyH);
        ctx.stroke();
      });
    } else if (spec.pattern === "fade") {
      var fg = ctx.createRadialGradient(0, bodyY - bodyH * 0.4, 4, 0, bodyY, bodyW * 1.2);
      fg.addColorStop(0, rgba(light, 0.9));
      fg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.ellipse(0, bodyY, bodyW, bodyH * 1.1, 0, 0, 7); ctx.fill();
    }
    ctx.restore();

    /* ---------- 5. 头 ---------- */
    var headGrad = ctx.createLinearGradient(0, headY - headW, 0, headY + headW);
    headGrad.addColorStop(0, light);
    headGrad.addColorStop(0.6, body0);
    headGrad.addColorStop(1, dark);
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(0, headY, headW, headW * 0.94, 0, 0, 7);
    ctx.fill();

    /* ---------- 6. 眼睛（凸起在头顶两侧） ---------- */
    var eyeR = 11 * spec.eyeR * spec.head;
    var eyeX = headW * spec.eye * 2 * 0.52 + 4;
    [-1, 1].forEach(function (sgn) {
      var ex = sgn * eyeX, ey = headY - headW * 0.72;
      /* 眼白 */
      ctx.fillStyle = "#f7fbff";
      ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, 7); ctx.fill();
      ctx.strokeStyle = rgba(dark, 0.55); ctx.lineWidth = 1.4; ctx.stroke();
      /* 瞳孔：跟着朝向偏一点，看起来有神 */
      var pR = eyeR * spec.pupil;
      var px = ex + sgn * eyeR * 0.16, py = ey + eyeR * 0.1;
      if (spec.markings.indexOf("glowEyes") >= 0) {
        ctx.save();
        ctx.shadowBlur = 12; ctx.shadowColor = accent;
        ctx.fillStyle = accent;
        ctx.restore();
      }
      var pg = ctx.createRadialGradient(px - pR * .3, py - pR * .3, 1, px, py, pR);
      pg.addColorStop(0, spec.markings.indexOf("glowEyes") >= 0 ? accent : "#1a1030");
      pg.addColorStop(1, "#05060f");
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(px, py, pR, 0, 7); ctx.fill();
      /* 高光 */
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.beginPath(); ctx.arc(px - pR * 0.34, py - pR * 0.36, pR * 0.3, 0, 7); ctx.fill();
      /* 眼影 / 眼罩 */
      if (spec.markings.indexOf("mask") >= 0) {
        ctx.fillStyle = rgba("#0d1030", 0.92);
        ctx.beginPath();
        ctx.ellipse(ex, ey - eyeR * 0.1, eyeR * 1.25, eyeR * 0.72, 0, 0, 7);
        ctx.fill();
      }
    });

    /* ---------- 7. 眉毛 ---------- */
    if (spec.brow && spec.brow !== "none") {
      ctx.strokeStyle = dark; ctx.lineWidth = 2.6; ctx.lineCap = "round";
      [-1, 1].forEach(function (sgn) {
        var ex = sgn * eyeX, ey = headY - headW * 0.72 - eyeR * 1.1;
        ctx.beginPath();
        if (spec.brow === "angry") {
          ctx.moveTo(ex - sgn * eyeR * 0.9, ey - 1);
          ctx.lineTo(ex + sgn * eyeR * 0.85, ey + eyeR * 0.42);
        } else if (spec.brow === "cool") {
          ctx.moveTo(ex - eyeR * 0.9, ey + 1);
          ctx.lineTo(ex + eyeR * 0.9, ey - 1);
        } else if (spec.brow === "sad") {
          ctx.moveTo(ex - sgn * eyeR * 0.85, ey + eyeR * 0.3);
          ctx.lineTo(ex + sgn * eyeR * 0.9, ey - 2);
        } else if (spec.brow === "flame") {
          ctx.moveTo(ex - eyeR * 0.9, ey + 3);
          ctx.quadraticCurveTo(ex, ey - 9, ex + eyeR * 0.9, ey + 2);
        }
        ctx.stroke();
      });
    }

    /* ---------- 8. 嘴 ---------- */
    var my = headY + headW * 0.34;
    ctx.strokeStyle = "#2a1a30";
    ctx.lineCap = "round";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    if (spec.mouth === "grin") {
      ctx.moveTo(-headW * 0.62, my - 2);
      ctx.quadraticCurveTo(0, my + headW * 0.5, headW * 0.62, my - 2);
    } else if (spec.mouth === "smile") {
      ctx.moveTo(-headW * 0.4, my);
      ctx.quadraticCurveTo(0, my + headW * 0.26, headW * 0.4, my);
    } else if (spec.mouth === "flat") {
      ctx.moveTo(-headW * 0.44, my + 2);
      ctx.lineTo(headW * 0.44, my + 2);
    } else if (spec.mouth === "wave") {
      ctx.moveTo(-headW * 0.5, my + 1);
      ctx.quadraticCurveTo(-headW * 0.25, my - 5, 0, my + 1);
      ctx.quadraticCurveTo(headW * 0.25, my + 7, headW * 0.5, my + 1);
    }
    ctx.stroke();
    /* 獠牙 */
    if (spec.mouth === "fang") {
      ctx.fillStyle = "#fff";
      [-1, 1].forEach(function (sgn) {
        ctx.beginPath();
        ctx.moveTo(sgn * headW * 0.3, my + 1);
        ctx.lineTo(sgn * headW * 0.38, my + 9);
        ctx.lineTo(sgn * headW * 0.2, my + 2);
        ctx.closePath(); ctx.fill();
      });
    }

    /* ---------- 9. 脸上标记 ---------- */
    if (spec.markings.indexOf("cheek") >= 0) {
      [-1, 1].forEach(function (sgn) {
        ctx.fillStyle = rgba(accent, 0.42);
        ctx.beginPath();
        ctx.ellipse(sgn * headW * 0.72, my + 2, 6.5, 4.2, sgn * 0.2, 0, 7);
        ctx.fill();
      });
    }
    if (spec.markings.indexOf("cross") >= 0) {
      ctx.strokeStyle = "#ff5a5a"; ctx.lineWidth = 3.4; ctx.lineCap = "round";
      var cx2 = -headW * 0.62, cy2 = headY - headW * 0.1;
      ctx.beginPath(); ctx.moveTo(cx2 - 5, cy2); ctx.lineTo(cx2 + 5, cy2);
      ctx.moveTo(cx2, cy2 - 5); ctx.lineTo(cx2, cy2 + 5); ctx.stroke();
    }
    if (spec.markings.indexOf("bolt") >= 0) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(headW * 0.2, headY - headW * 0.5);
      ctx.lineTo(headW * 0.55, headY - headW * 0.05);
      ctx.lineTo(headW * 0.3, headY - headW * 0.05);
      ctx.lineTo(headW * 0.62, headY + headW * 0.55);
      ctx.lineTo(headW * 0.24, headY + headW * 0.02);
      ctx.lineTo(headW * 0.44, headY + headW * 0.02);
      ctx.closePath(); ctx.fill();
    }
    if (spec.markings.indexOf("shine") >= 0) {
      ctx.save();
      ctx.globalAlpha = .55; ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(-bodyW * 0.34, bodyY - bodyH * 0.42, 8, 16, -0.5, 0, 7); ctx.fill();
      ctx.restore();
    }
    if (spec.markings.indexOf("blaze") >= 0) {
      ctx.save();
      ctx.globalAlpha = .5; ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(0, bodyY + bodyH * 0.5, bodyW * 0.5, bodyH * 0.7, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    }
    if (spec.markings.indexOf("ice") >= 0) {
      ctx.save();
      ctx.globalAlpha = .5; ctx.fillStyle = "#dff1ff";
      [[-0.5, -0.2], [0.45, 0.1], [-0.15, 0.55], [0.55, 0.5]].forEach(function (p) {
        ctx.beginPath();
        ctx.arc(p[0] * bodyW, bodyY + p[1] * bodyH, 3.4, 0, 7);
        ctx.fill();
      });
      ctx.restore();
    }
    if (spec.markings.indexOf("shadow") >= 0) {
      ctx.save();
      ctx.globalAlpha = .45; ctx.fillStyle = "#0a0618";
      ctx.beginPath();
      ctx.ellipse(0, bodyY + bodyH * 0.25, bodyW * 0.8, bodyH * 0.9, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    }
    if (spec.markings.indexOf("rainbow") >= 0) {
      var rb = ["#ff5a5a", "#ffd94d", "#7ec850", "#22d3ee", "#8a6bff", "#ff6ec7"];
      ctx.save();
      ctx.globalAlpha = .38; ctx.lineWidth = 3.4; ctx.lineCap = "round";
      rb.forEach(function (col, i) {
        ctx.strokeStyle = col;
        ctx.beginPath();
        ctx.arc(0, bodyY + bodyH * 0.2, bodyW * (0.5 + i * 0.09), Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
      });
      ctx.restore();
    }

    /* ---------- 10. 头饰 / 装饰 ---------- */
    ctx.save();
    if (spec.markings.indexOf("headband") >= 0) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(0, headY - headW * 0.28, headW * 1.02, 5.4, 0, 0, 7);
      ctx.fill();
      /* 飘带 */
      ctx.strokeStyle = accent; ctx.lineWidth = 3.4; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-headW * 0.9, headY - headW * 0.3);
      ctx.quadraticCurveTo(-headW * 1.7, headY - headW * 0.1, -headW * 1.5, headY + headW * 0.4);
      ctx.stroke();
    }
    if (spec.extras.indexOf("crown") >= 0) {
      ctx.fillStyle = "#ffd94d";
      ctx.strokeStyle = "#c08a00"; ctx.lineWidth = 1.4;
      var cw = headW * 0.72, cy = headY - headW * 1.12;
      ctx.beginPath();
      ctx.moveTo(-cw, cy + 10);
      ctx.lineTo(-cw, cy - 3);
      ctx.lineTo(-cw * 0.45, cy + 5);
      ctx.lineTo(0, cy - 9);
      ctx.lineTo(cw * 0.45, cy + 5);
      ctx.lineTo(cw, cy - 3);
      ctx.lineTo(cw, cy + 10);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (spec.extras.indexOf("cap") >= 0) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(0, headY - headW * 0.95, headW * 0.62, headW * 0.46, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(-2.6, headY - headW * 1.35, 5.2, 8);
      ctx.fillRect(-7.5, headY - headW * 1.2, 15, 4.6);
    }
    if (spec.extras.indexOf("antenna") >= 0) {
      ctx.strokeStyle = accent; ctx.lineWidth = 2.6;
      [-1, 1].forEach(function (sgn) {
        ctx.beginPath();
        ctx.moveTo(sgn * headW * 0.5, headY - headW * 0.85);
        ctx.quadraticCurveTo(sgn * headW * 0.8, headY - headW * 1.7, sgn * headW * 0.4, headY - headW * 1.9);
        ctx.stroke();
        ctx.fillStyle = accent;
        ctx.beginPath(); ctx.arc(sgn * headW * 0.4, headY - headW * 1.95, 3.6, 0, 7); ctx.fill();
      });
    }
    if (spec.extras.indexOf("scarf") >= 0) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(0, headY + headW * 0.92, headW * 0.92, 6.4, 0, 0, 7);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(headW * 0.6, headY + headW * 0.95);
      ctx.quadraticCurveTo(headW * 1.8, headY + headW * 1.2, headW * 1.5, headY + headW * 2.0);
      ctx.lineTo(headW * 0.9, headY + headW * 1.5);
      ctx.closePath(); ctx.fill();
    }
    if (spec.extras.indexOf("medal") >= 0) {
      ctx.strokeStyle = accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-8, bodyY - bodyH * 0.3); ctx.lineTo(0, bodyY + bodyH * 0.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, bodyY - bodyH * 0.3); ctx.lineTo(0, bodyY + bodyH * 0.1); ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(0, bodyY + bodyH * 0.22, 7, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 8px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("¥", 0, bodyY + bodyH * 0.22 + 3);
    }
    if (spec.extras.indexOf("katana") >= 0) {
      ctx.save();
      ctx.translate(bodyW * 0.95, bodyY - bodyH * 0.2);
      ctx.rotate(-0.85);
      ctx.fillStyle = "#d8e2ff";
      ctx.fillRect(-2.4, -34, 4.8, 56);
      ctx.fillStyle = "#8a6bff";
      ctx.fillRect(-4.4, 20, 8.8, 5);
      ctx.fillStyle = "#3a2f5b";
      ctx.fillRect(-2.8, 24, 5.6, 12);
      ctx.restore();
    }
    if (spec.extras.indexOf("shuriken") >= 0) {
      ctx.save();
      ctx.translate(-bodyW * 1.15, bodyY - bodyH * 0.55);
      ctx.rotate(0.4);
      ctx.fillStyle = "#c9d2ff";
      for (var k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(9, -3); ctx.lineTo(0, -12); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    if (spec.extras.indexOf("bolts") >= 0) {
      ctx.save();
      ctx.strokeStyle = accent; ctx.lineWidth = 2.4; ctx.lineCap = "round";
      ctx.globalAlpha = .9;
      [[-1, -0.3], [1, 0.15], [0.4, -0.75]].forEach(function (p) {
        var bx = p[0] * bodyW * 1.1, by = bodyY + p[1] * bodyH;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + p[0] * 8, by + 6);
        ctx.lineTo(bx + p[0] * 3, by + 9);
        ctx.lineTo(bx + p[0] * 11, by + 17);
        ctx.stroke();
      });
      ctx.restore();
    }
    if (spec.extras.indexOf("halo") >= 0) {
      ctx.save();
      ctx.globalAlpha = .75;
      ctx.strokeStyle = "#ffd94d"; ctx.lineWidth = 3.4;
      ctx.shadowBlur = 16; ctx.shadowColor = "#ffd94d";
      ctx.beginPath();
      ctx.ellipse(0, headY - headW * 1.5, headW * 0.95, headW * 0.24, 0, 0, 7);
      ctx.stroke();
      ctx.restore();
    }
    if (spec.extras.indexOf("wings") >= 0) {
      ctx.save();
      ctx.globalAlpha = .5;
      ctx.fillStyle = rgba("#ffffff", 0.8);
      [-1, 1].forEach(function (sgn) {
        ctx.beginPath();
        ctx.moveTo(sgn * bodyW * 0.5, bodyY - bodyH * 0.5);
        ctx.quadraticCurveTo(sgn * bodyW * 2.2, bodyY - bodyH * 1.8, sgn * bodyW * 2.4, bodyY - bodyH * 0.1);
        ctx.quadraticCurveTo(sgn * bodyW * 1.6, bodyY + bodyH * 0.2, sgn * bodyW * 0.5, bodyY + bodyH * 0.3);
        ctx.closePath(); ctx.fill();
      });
      ctx.restore();
    }
    if (spec.extras.indexOf("iceCrystals") >= 0) {
      ctx.save();
      ctx.globalAlpha = .8; ctx.fillStyle = "#cfeeff";
      [[-1.25, -0.7, 6], [1.3, -0.3, 5], [0.2, -1.5, 4.4]].forEach(function (p) {
        ctx.save();
        ctx.translate(p[0] * bodyW, bodyY + p[1] * bodyH);
        for (var a = 0; a < 3; a++) {
          ctx.rotate(Math.PI / 3);
          ctx.fillRect(-1.2, -p[2], 2.4, p[2] * 2);
        }
        ctx.restore();
      });
      ctx.restore();
    }
    if (spec.extras.indexOf("fireAura") >= 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      [[-1, 0.2, 9], [1, 0.35, 8], [-0.4, -0.9, 7], [0.5, -1.1, 6]].forEach(function (p, i) {
        var fx = p[0] * bodyW * 0.9, fy = bodyY + p[1] * bodyH;
        var g2 = ctx.createRadialGradient(fx, fy, 1, fx, fy, p[2]);
        g2.addColorStop(0, rgba(i % 2 ? "#ffd94d" : "#ff8a3c", .9));
        g2.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(fx, fy, p[2], 0, 7); ctx.fill();
      });
      ctx.restore();
    }
    if (spec.extras.indexOf("shadowAura") >= 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = .35;
      var sg = ctx.createRadialGradient(0, bodyY, 4, 0, bodyY, bodyW * 1.8);
      sg.addColorStop(0, rgba("#8a6bff", .7));
      sg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.ellipse(0, bodyY, bodyW * 1.8, bodyH * 2.0, 0, 0, 7); ctx.fill();
      ctx.restore();
    }
    if (spec.extras.indexOf("rainbowAura") >= 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = .3;
      ["#ff5a5a", "#ffd94d", "#7ec850", "#22d3ee", "#8a6bff"].forEach(function (col, i) {
        var ag = ctx.createRadialGradient(0, bodyY, 4, 0, bodyY, bodyW * (1.4 + i * .12));
        ag.addColorStop(0, rgba(col, .5));
        ag.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = ag;
        ctx.beginPath(); ctx.ellipse(0, bodyY, bodyW * (1.4 + i * .12), bodyH * (1.6 + i * .1), 0, 0, 7); ctx.fill();
      });
      ctx.restore();
    }
    ctx.restore();

    /* ---------- 11. 脚 ---------- */
    ctx.fillStyle = light;
    [-1, 1].forEach(function (sgn) {
      ctx.beginPath();
      ctx.ellipse(sgn * bodyW * 0.52 * legSpread, 6, 14 * spec.body * 0.7, 5.5, 0, 0, 7);
      ctx.fill();
    });

    ctx.restore();

    /* 外发光（画在画布范围里，用 lighter 叠一层轮廓） */
    if (glow) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-over";
      ctx.globalAlpha = .35;
      ctx.shadowBlur = 18; ctx.shadowColor = glow;
      ctx.drawImage(cv, 0, 0, size, size);
      ctx.restore();
    }

    cache[key] = cv;
    return cv;
  };

  /* 让外部（实验室页面等）能读到参数表 */
  NAIWA.FROG_SPECS = SPECS;

  /* 一次性生成全部 12 位（选人界面用） */
  NAIWA.genAllFrogs = function (size) {
    var out = {};
    Object.keys(SPECS).forEach(function (id) { out[id] = NAIWA.genFrog(id, size); });
    return out;
  };

})(typeof window !== "undefined" ? window : globalThis);
