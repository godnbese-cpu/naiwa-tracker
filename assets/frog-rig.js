/* ============================================================
   🐸 奶蛙斗士 · 骨骼动画建模系统  (assets/frog-rig.js)
   ------------------------------------------------------------
   为什么要它：
   之前无论是"原图换色"还是"程序化立绘"，本质都是**一张静态图**，
   只能靠平移/缩放假装动作，看起来就是贴纸在滑。
   真格斗游戏（死神VS火影那类）的角色是**分部件建模**的：
   头、躯干、上臂、前臂、手、大腿、小腿、脚各自独立，
   按关节层级变换，所以能摆出真正的出招姿势。

   这个模块做的事：
   1. 把奶蛙拆成 14 个部件（头/眼/嘴/躯干/肚皮/左右上臂/前臂/手/大腿/小腿/脚…）
   2. 建立关节父子关系（层级变换）
   3. 用关键帧姿势描述每个动作（待机/走/跑/跳/轻拳/重拳/踢/防/受击/倒地/装死…）
   4. 逐帧预渲染成精灵帧缓存，战斗中直接 drawImage，性能与贴图一样
   5. 每个部件支持线性渐变着色，整体有体积感而不是纯色块

   用法：
     NAIWA.Rig.frame(fighterId, "punch", 0.5, 96)   // 取某一帧的 canvas
     NAIWA.Rig.poses                                 // 全部姿势表
   ============================================================ */
(function (global) {
  "use strict";
  var NAIWA = global.NAIWA = global.NAIWA || {};

  /* ---------------- 颜色工具 ---------------- */
  function hex2rgb(h) {
    h = String(h).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var v = parseInt(h, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function shade(hex, amt) {
    var c = hex2rgb(hex);
    function f(x) { return Math.max(0, Math.min(255, Math.round(x + amt * 255))); }
    return "rgb(" + f(c[0]) + "," + f(c[1]) + "," + f(c[2]) + ")";
  }
  function rgba(hex, a) {
    var c = hex2rgb(hex);
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }
  function mix(a, b, t) {
    var ca = hex2rgb(a), cb = hex2rgb(b);
    return "rgb(" + Math.round(ca[0] + (cb[0] - ca[0]) * t) + "," +
      Math.round(ca[1] + (cb[1] - ca[1]) * t) + "," +
      Math.round(ca[2] + (cb[2] - ca[2]) * t) + ")";
  }

  /* ---------------- 体型参数：每位斗士一套 ---------------- */
  /* 单位是"设计单位"，1 单位 ≈ 角色高度的 1/100 */
  var BODY = {
    big:     { torsoW: 31, torsoH: 28, headR: 19.0, eyeR: 7.4, eyeGap: 12.0, limbT: 5.6, limbL: 0.96, legL: 1.02, neck: 4, foot: 9.5 },
    small:   { torsoW: 19, torsoH: 20, headR: 16.8, eyeR: 7.8, eyeGap: 10.8, limbT: 3.8, limbL: 0.76, legL: 0.82, neck: 6, foot: 7.4 },
    rainbow: { torsoW: 24, torsoH: 25, headR: 15.8, eyeR: 6.8, eyeGap: 10.2, limbT: 4.6, limbL: 0.9, legL: 0.96, neck: 5, foot: 8.2 },
    gold:    { torsoW: 29, torsoH: 26, headR: 16.8, eyeR: 6.4, eyeGap: 10.8, limbT: 5.4, limbL: 0.92, legL: 0.98, neck: 4, foot: 8.8 },
    ice:     { torsoW: 23, torsoH: 24, headR: 16.4, eyeR: 6.6, eyeGap: 10.4, limbT: 4.4, limbL: 0.88, legL: 0.95, neck: 5, foot: 8.2 },
    flame:   { torsoW: 26, torsoH: 25, headR: 16.2, eyeR: 6.2, eyeGap: 10.2, limbT: 5.1, limbL: 0.94, legL: 1.0, neck: 4, foot: 8.6 },
    ninja:   { torsoW: 22, torsoH: 24.5, headR: 16.4, eyeR: 6.4, eyeGap: 10.2, limbT: 4.2, limbL: 0.9, legL: 0.97, neck: 5, foot: 8.2 },
    samurai: { torsoW: 23.5, torsoH: 24.5, headR: 16.0, eyeR: 6.0, eyeGap: 10.0, limbT: 4.5, limbL: 0.9, legL: 0.97, neck: 5, foot: 8.2 },
    healer:  { torsoW: 24, torsoH: 24.5, headR: 17.4, eyeR: 7.6, eyeGap: 11.2, limbT: 4.5, limbL: 0.88, legL: 0.95, neck: 5, foot: 8.2 },
    thunder: { torsoW: 21, torsoH: 23.5, headR: 16.6, eyeR: 7.4, eyeGap: 10.8, limbT: 3.9, limbL: 0.82, legL: 0.88, neck: 6, foot: 7.6 },
    shadow:  { torsoW: 23.5, torsoH: 24.5, headR: 16.2, eyeR: 5.8, eyeGap: 10.0, limbT: 4.4, limbL: 0.9, legL: 0.97, neck: 5, foot: 8.2 },
    boss:    { torsoW: 33, torsoH: 29, headR: 19.4, eyeR: 7.6, eyeGap: 12.4, limbT: 6.0, limbL: 1.04, legL: 1.08, neck: 4, foot: 9.8 }
  };

  /* ---------------- 姿势表 ----------------
     每个姿势返回各关节的偏移量（单位：设计单位 / 弧度）
     关节名：root 髋 / torso 躯干 / head 头
             armA 后臂(远侧) armB 前臂(近侧)：肩→肘→手
             legA 后腿 legB 前腿：髋→膝→脚                                   */
  function P(extra) {
    var base = {
      rootY: 0, rootRot: 0, rootX: 0,
      torsoRot: 0, torsoY: 0, torsoX: 0,
      headRot: 0, headY: 0, headX: 0,
      /* B = 靠近镜头那条腿/臂（默认右），A = 远侧 */
      armA: { sh: 0, el: 0, sc: 1 }, armB: { sh: 0, el: 0, sc: 1 },
      legA: { hip: 0, kn: 0, sc: 1 }, legB: { hip: 0, kn: 0, sc: 1 },
      squashX: 1, squashY: 1, lean: 0
    };
    if (extra) for (var k in extra) {
      if (k === "armA" || k === "armB" || k === "legA" || k === "legB") {
        for (var kk in extra[k]) base[k][kk] = extra[k][kk];
      } else base[k] = extra[k];
    }
    return base;
  }

  /* 角度用度数写，方便调 */
  function d(v) { return v * Math.PI / 180; }

  var POSES = {
    /* ===== 待机：轻微呼吸 + 手臂放松 ===== */
    idle: function (t) {
      var b = Math.sin(t * Math.PI * 2);
      return P({
        rootY: -Math.abs(b) * 1.2, torsoRot: d(2 + b * 1.6), headRot: d(-2 - b * 2),
        headY: -1 - b * 0.6,
        armA: { sh: d(58 + b * 5), el: d(24 - b * 4) },
        armB: { sh: d(-58 - b * 5), el: d(-24 + b * 4) },
        legA: { hip: d(-6), kn: d(8) }, legB: { hip: d(6), kn: d(-8) }
      });
    },
    /* ===== 蹲下 ===== */
    crouch: function () {
      return P({
        rootY: 15, torsoRot: d(9), headRot: d(-7),
        armA: { sh: d(74), el: d(52) }, armB: { sh: d(-74), el: d(-52) },
        legA: { hip: d(-46), kn: d(74) }, legB: { hip: d(46), kn: d(-74) },
        squashY: 0.86, squashX: 1.08
      });
    },
    /* ===== 走路 ===== */
    walk: function (t) {
      var s = Math.sin(t * Math.PI * 2), c = Math.cos(t * Math.PI * 2);
      return P({
        rootY: -Math.abs(s) * 2.2, torsoRot: d(6), headRot: d(-3),
        armA: { sh: d(52), el: d(26 + s * 14) },
        armB: { sh: d(-52), el: d(-26 - s * 14) },
        legA: { hip: d(-s * 30), kn: d(Math.max(0, s) * 34 + 8) },
        legB: { hip: d(s * 30), kn: d(Math.max(0, -s) * 34 + 8) },
        lean: 3
      });
    },
    /* ===== 跑：身体前倾、摆臂更大 ===== */
    run: function (t) {
      var s = Math.sin(t * Math.PI * 2);
      return P({
        rootY: -Math.abs(s) * 3.4 - 1, torsoRot: d(17), headRot: d(-12),
        armA: { sh: d(40 + s * 26), el: d(58) },
        armB: { sh: d(-40 - s * 26), el: d(-58) },
        legA: { hip: d(-s * 46), kn: d(Math.max(0, s) * 52 + 12) },
        legB: { hip: d(s * 46), kn: d(Math.max(0, -s) * 52 + 12) },
        lean: 7
      });
    },
    /* ===== 跳跃：收腿、举手 ===== */
    jump: function () {
      return P({
        rootY: -3, torsoRot: d(-5), headRot: d(4),
        armA: { sh: d(20), el: d(30) }, armB: { sh: d(-20), el: d(-30) },
        legA: { hip: d(-40), kn: d(66) }, legB: { hip: d(34), kn: d(-58) },
        squashY: 1.1, squashX: 0.94
      });
    },
    /* ===== 下落 ===== */
    fall: function () {
      return P({
        rootY: -1, torsoRot: d(6), headRot: d(-4),
        armA: { sh: d(96), el: d(16) }, armB: { sh: d(-96), el: d(-16) },
        legA: { hip: d(-16), kn: d(26) }, legB: { hip: d(22), kn: d(-30) },
        squashY: 1.06, squashX: 0.97
      });
    },
    /* ===== 轻拳：前手直拳（三段幅度不同） ===== */
    punch1: function () {
      return P({
        torsoRot: d(-4), rootRot: d(-3), headRot: d(3),
        armB: { sh: d(-96), el: d(-6), sc: 1.06 },
        armA: { sh: d(66), el: d(66) },
        legA: { hip: d(-16), kn: d(20) }, legB: { hip: d(14), kn: d(-18) }
      });
    },
    punch2: function () {
      return P({
        torsoRot: d(-8), rootRot: d(-5), headRot: d(5), lean: 4,
        armB: { sh: d(-104), el: d(0), sc: 1.1 },
        armA: { sh: d(56), el: d(80) },
        legA: { hip: d(-22), kn: d(26) }, legB: { hip: d(20), kn: d(-24) }
      });
    },
    /* 上勾拳 */
    uppercut: function () {
      return P({
        torsoRot: d(-14), rootY: -3, headRot: d(8), lean: 5,
        armB: { sh: d(-128), el: d(-14), sc: 1.12 },
        armA: { sh: d(78), el: d(70) },
        legA: { hip: d(-26), kn: d(34) }, legB: { hip: d(26), kn: d(-30) }
      });
    },
    /* ===== 重击：沉肩蓄力下砸 ===== */
    heavy: function () {
      return P({
        torsoRot: d(12), rootY: 4, headRot: d(-10),
        armA: { sh: d(-118), el: d(-92), sc: 1.08 },
        armB: { sh: d(58), el: d(52) },
        legA: { hip: d(-34), kn: d(46) }, legB: { hip: d(40), kn: d(-44) },
        squashY: 0.94, squashX: 1.06
      });
    },
    /* ===== 踢腿 ===== */
    kick: function () {
      return P({
        torsoRot: d(17), rootY: 2, headRot: d(-13),
        armA: { sh: d(84), el: d(46) }, armB: { sh: d(-72), el: d(-58) },
        legB: { hip: d(86), kn: d(-8), sc: 1.08 }, legA: { hip: d(-14), kn: d(16) }
      });
    },
    /* ===== 扫尾（低位横扫） ===== */
    sweep: function () {
      return P({
        rootY: 13, torsoRot: d(30), headRot: d(-22),
        armA: { sh: d(112), el: d(20) }, armB: { sh: d(-92), el: d(-30) },
        legB: { hip: d(120), kn: d(-6), sc: 1.1 }, legA: { hip: d(-52), kn: d(80) },
        squashY: 0.9, squashX: 1.1
      });
    },
    /* ===== 防御：双臂交叉在身前 ===== */
    guard: function () {
      return P({
        rootY: 7, torsoRot: d(13), headRot: d(-9),
        armA: { sh: d(64), el: d(104) }, armB: { sh: d(-64), el: d(-104) },
        legA: { hip: d(-24), kn: d(32) }, legB: { hip: d(28), kn: d(-34) },
        squashY: 0.95, squashX: 1.04
      });
    },
    /* ===== 蓄力（起手） ===== */
    charge: function () {
      return P({
        rootY: 6, torsoRot: d(-11), headRot: d(7),
        armA: { sh: d(96), el: d(78) }, armB: { sh: d(-96), el: d(-78) },
        legA: { hip: d(-30), kn: d(40) }, legB: { hip: d(30), kn: d(-40) },
        squashY: 0.92, squashX: 1.09
      });
    },
    /* ===== 出招（通用判定帧：转身冲拳） ===== */
    strike: function () {
      return P({
        torsoRot: d(-16), rootRot: d(-8), headRot: d(11), lean: 8,
        armB: { sh: d(-112), el: d(-4), sc: 1.14 },
        armA: { sh: d(46), el: d(98) },
        legA: { hip: d(-40), kn: d(30) }, legB: { hip: d(34), kn: d(-20) }
      });
    },
    /* ===== 施法：双手前推 ===== */
    cast: function () {
      return P({
        torsoRot: d(-9), headRot: d(6),
        armA: { sh: d(104), el: d(18) }, armB: { sh: d(-104), el: d(-18) },
        legA: { hip: d(-20), kn: d(24) }, legB: { hip: d(20), kn: d(-24) }
      });
    },
    /* ===== 浮空（被打飞） ===== */
    air: function () {
      return P({
        rootRot: d(-24), torsoRot: d(-10), headRot: d(20),
        armA: { sh: d(130), el: d(24) }, armB: { sh: d(-124), el: d(-34) },
        legA: { hip: d(-52), kn: d(30) }, legB: { hip: d(44), kn: d(-22) },
        squashY: 1.05, squashX: 0.96
      });
    },
    /* ===== 受击：后仰缩身 ===== */
    hurt: function () {
      return P({
        rootY: 3, torsoRot: d(-21), headRot: d(25),
        armA: { sh: d(118), el: d(34) }, armB: { sh: d(-112), el: d(-42) },
        legA: { hip: d(-24), kn: d(34) }, legB: { hip: d(30), kn: d(-38) },
        squashY: 0.93, squashX: 1.08
      });
    },
    /* ===== 倒地 ===== */
    ko: function () {
      return P({
        rootRot: d(-78), rootY: 26, torsoRot: d(-16), headRot: d(18),
        armA: { sh: d(126), el: d(12) }, armB: { sh: d(-134), el: d(-16) },
        legA: { hip: d(-14), kn: d(24) }, legB: { hip: d(20), kn: d(-30) }
      });
    },
    /* ===== 装死：整个躺平 ===== */
    dead: function (t) {
      var b = Math.sin(t * Math.PI * 2) * 2;
      return P({
        rootRot: d(-88), rootY: 30, torsoRot: d(4 + b * 0.35), headRot: d(14),
        armA: { sh: d(150), el: d(6) }, armB: { sh: d(-150), el: d(-6) },
        legA: { hip: d(-6), kn: d(12) }, legB: { hip: d(8), kn: d(-14) }
      });
    },
    /* ===== 冲刺：极度前倾 ===== */
    dash: function () {
      return P({
        torsoRot: d(31), rootRot: d(-7), headRot: d(-22), lean: 10,
        armA: { sh: d(150), el: d(10) }, armB: { sh: d(-30), el: d(-80) },
        legA: { hip: d(-54), kn: d(70) }, legB: { hip: d(48), kn: d(-16) },
        squashX: 0.94, squashY: 1.08
      });
    },
    /* ===== 胜利 ===== */
    win: function (t) {
      var b = Math.sin(t * Math.PI * 4) * 0.5 + 0.5;
      return P({
        rootY: -6 - b * 5, torsoRot: d(-4), headRot: d(6 - b * 4),
        armA: { sh: d(24 - b * 14), el: d(20) }, armB: { sh: d(-24 + b * 14), el: d(-20) },
        legA: { hip: d(-6), kn: d(6) }, legB: { hip: d(6), kn: d(-6) }
      });
    }
  };

  /* 动作名 → (姿势名, 帧数, 是否循环) */
  var CLIPS = {
    idle: ["idle", 1, true], walk: ["walk", 12, true], run: ["run", 10, true],
    jump: ["jump", 1, false], fall: ["fall", 1, false], crouch: ["crouch", 1, false],
    guard: ["guard", 1, false], charge: ["charge", 1, false], strike: ["strike", 1, false],
    cast: ["cast", 1, false], dash: ["dash", 1, false], air: ["air", 1, false],
    hurt: ["hurt", 1, false], ko: ["ko", 1, false], dead: ["dead", 16, true],
    win: ["win", 20, true],
    punch1: ["punch1", 1, false], punch2: ["punch2", 1, false],
    uppercut: ["uppercut", 1, false], heavy: ["heavy", 1, false],
    kick: ["kick", 1, false], sweep: ["sweep", 1, false]
  };

  /* ---------------- 画单个部件 ----------------
     用「圆头描边」而不是矩形：线段两端是半圆，下一段从端点接着画就天然无缝，
     这是骨骼动画里最常见的做法，能彻底避免"香肠断开"的接缝问题。 */
  function limb(ctx, len, thick, c1, c2) {
    var g = ctx.createLinearGradient(-thick, 0, thick, 0);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.strokeStyle = g;
    ctx.lineWidth = thick * 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, len);
    ctx.stroke();
  }
  /* 关节圆球：把两段之间的接缝完全盖住 */
  function joint(ctx, r, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 7);
    ctx.fill();
  }

  /* ---------------- 核心：把一只奶蛙按姿势画出来 ---------------- */
  function drawRig(ctx, fighter, pose, opts) {
    opts = opts || {};
    var b = BODY[fighter.id] || BODY.big;
    var body = fighter.color || "#7ec850";
    var dark = shade(body, -0.24);
    var mid = body;
    var light = shade(body, 0.26);
    var accent = fighter.accent || "#ffd94d";
    var glow = fighter.glow || light;
    var face = opts.face || "grin";
    var mark = opts.markings || [];

    /* 整体容器：以「脚底中点」为原点，向上为负。
       站立时脚底正好落在地面：两段腿(22+21)*legL 加上髋点到躯干下缘的偏移 */
    var segA = 22 * b.legL, segB = 21 * b.legL;
    var standFoot = (segA + segB) - 3;
    ctx.save();
    ctx.rotate(pose.rootRot);
    ctx.translate(pose.rootX, -standFoot + pose.rootY);
    ctx.scale(pose.squashX, pose.squashY);

    var hipY = 0;
    var torsoH = b.torsoH, torsoW = b.torsoW;

    /* ---------- 1. 后腿（远侧，颜色暗一点做景深） ---------- */
    (function () {
      var L = pose.legA;
      ctx.save();
      ctx.translate(-b.torsoW * 0.46, hipY + 2);   /* 髋点移到躯干下缘之内，腿才像长在身上 */
      ctx.rotate(L.hip);
      ctx.scale(L.sc, L.sc);
      joint(ctx, b.limbT * 1.05, shade(body, -0.3));
      limb(ctx, segA, b.limbT * 0.94, shade(body, -0.34), shade(body, -0.2));
      ctx.translate(0, segA);
      joint(ctx, b.limbT * 0.9, shade(body, -0.28));
      ctx.rotate(L.kn);
      limb(ctx, segB, b.limbT * 0.78, shade(body, -0.34), shade(body, -0.2));
      /* 脚 */
      ctx.translate(0, segB);
      ctx.rotate(-L.kn * 0.55 - L.hip * 0.4);
      ctx.fillStyle = shade(body, -0.3);
      ctx.beginPath();
      ctx.ellipse(b.foot * 0.5, 0, b.foot * 1.05, b.foot * 0.5, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    })();

    /* ---------- 2. 后臂（远侧） ---------- */
    (function () {
      var A = pose.armA;
      ctx.save();
      /* 肩点贴住躯干上侧的边缘，而不是飘在外面 */
      ctx.translate(-b.torsoW * 0.78, -torsoH * 0.78);
      ctx.rotate(A.sh);
      ctx.scale(A.sc, A.sc);
      joint(ctx, b.limbT * 0.94, shade(body, -0.28));
      limb(ctx, b.limbL * 15, b.limbT * 0.82, shade(body, -0.32), shade(body, -0.18));
      ctx.translate(0, b.limbL * 15);
      joint(ctx, b.limbT * 0.74, shade(body, -0.26));
      ctx.rotate(A.el);
      limb(ctx, b.limbL * 14, b.limbT * 0.68, shade(body, -0.32), shade(body, -0.18));
      /* 手 */
      ctx.translate(0, b.limbL * 14);
      ctx.fillStyle = shade(body, -0.26);
      ctx.beginPath(); ctx.arc(0, 0, b.limbT * 0.8, 0, 7); ctx.fill();
      ctx.restore();
    })();

    /* ---------- 3. 躯干（梨形）+ 肚皮 ---------- */
    ctx.save();
    ctx.rotate(pose.torsoRot);
    ctx.translate(0, pose.torsoY);
    /* 骨盆：把躯干和双腿连成一体，消除"腿浮在空中"的断层
       ⚠️ 必须画在躯干**之下**（先画），否则会盖住肚皮和躯干下半部，
       看起来就像身体被切成了方块。 */
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, torsoH * 0.1, torsoW * 0.84, torsoH * 0.42, 0, 0, 7);
    ctx.fill();
    var tg = ctx.createLinearGradient(0, -torsoH, 0, 0);
    tg.addColorStop(0, light); tg.addColorStop(0.5, mid); tg.addColorStop(1, dark);
    ctx.fillStyle = tg;
    ctx.beginPath();
    /* 上窄下宽的梨形；底部收得比较平，方便接骨盆 */
    ctx.moveTo(-torsoW * 0.66, -torsoH);
    ctx.bezierCurveTo(-torsoW * 1.14, -torsoH * 0.5, -torsoW * 1.06, torsoH * 0.1, -torsoW * 0.72, torsoH * 0.2);
    ctx.quadraticCurveTo(0, torsoH * 0.34, torsoW * 0.72, torsoH * 0.2);
    ctx.bezierCurveTo(torsoW * 1.06, torsoH * 0.1, torsoW * 1.14, -torsoH * 0.5, torsoW * 0.66, -torsoH);
    ctx.closePath();
    ctx.fill();
    /* 肚皮高光 */
    var bg = ctx.createLinearGradient(0, -torsoH * 0.7, 0, torsoH * 0.2);
    bg.addColorStop(0, rgba("#ffffff", 0.42));
    bg.addColorStop(1, rgba("#ffffff", 0.02));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(0, -torsoH * 0.34, torsoW * 0.56, torsoH * 0.58, 0, 0, 7);
    ctx.fill();
    /* 花纹 */
    if (mark.indexOf("spots") >= 0) {
      ctx.fillStyle = rgba(dark, 0.5);
      [[-0.5, -0.62], [0.42, -0.5], [-0.22, -0.2], [0.5, -0.12], [-0.5, -0.02], [0.12, -0.78]].forEach(function (p) {
        ctx.beginPath();
        ctx.ellipse(p[0] * torsoW, p[1] * torsoH, torsoW * 0.16, torsoH * 0.13, 0.4, 0, 7);
        ctx.fill();
      });
    } else if (mark.indexOf("stripes") >= 0) {
      ctx.strokeStyle = rgba(dark, 0.55); ctx.lineWidth = 2.6; ctx.lineCap = "round";
      for (var i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * torsoW * 0.22, -torsoH * 0.86);
        ctx.quadraticCurveTo(i * torsoW * 0.3, -torsoH * 0.45, i * torsoW * 0.34, -torsoH * 0.05);
        ctx.stroke();
      }
    } else if (mark.indexOf("crack") >= 0) {
      ctx.strokeStyle = rgba("#ffffff", 0.75); ctx.lineWidth = 1.3;
      [[-0.5, -0.6, 0.06, -0.2], [0.4, -0.75, 0.5, -0.3], [-0.2, -0.35, -0.44, 0.02]].forEach(function (l) {
        ctx.beginPath();
        ctx.moveTo(l[0] * torsoW, l[1] * torsoH);
        ctx.lineTo(l[2] * torsoW, l[3] * torsoH);
        ctx.stroke();
      });
    }

    /* ---------- 4. 前腿（近侧） ---------- */
    (function () {
      var L = pose.legB;
      ctx.save();
      ctx.translate(b.torsoW * 0.46, hipY + 2);
      ctx.rotate(L.hip);
      ctx.scale(L.sc, L.sc);
      joint(ctx, b.limbT * 1.1, mid);
      limb(ctx, segA, b.limbT, mid, dark);
      ctx.translate(0, segA);
      joint(ctx, b.limbT * 0.94, mid);
      ctx.rotate(L.kn);
      limb(ctx, segB, b.limbT * 0.86, mid, dark);
      ctx.translate(0, segB);
      ctx.rotate(-L.kn * 0.55 - L.hip * 0.4);
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.ellipse(b.foot * 0.6, 0, b.foot * 1.15, b.foot * 0.54, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    })();

    /* ---------- 5. 头 ---------- */
    ctx.save();
    /* 把头往下压，让它和躯干顶部重叠，中间不留缝 */
    ctx.translate(pose.headX, -torsoH - b.headR * 0.62 + pose.headY);
    ctx.rotate(pose.headRot);
    /* 脖子：一小段描边把头接到躯干上。
       宽度只用躯干的 40%，太宽会从躯干背后露出一截，看起来像身体被切成方块。 */
    ctx.strokeStyle = mid; ctx.lineWidth = b.torsoW * 0.4; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, b.headR * 0.5);
    ctx.lineTo(0, b.headR * 1.35);
    ctx.stroke();

    /* 头部轮廓：略扁的椭圆 */
    var hg = ctx.createRadialGradient(-b.headR * 0.3, -b.headR * 0.4, b.headR * 0.2, 0, 0, b.headR * 1.15);
    hg.addColorStop(0, light);
    hg.addColorStop(0.62, mid);
    hg.addColorStop(1, dark);
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(0, 0, b.headR, b.headR * 0.92, 0, 0, 7);
    ctx.fill();

    /* 眼睛（凸起在头顶两侧） */
    var eyeR = b.eyeR, ex = b.eyeGap;
    var pupilK = fighter.id === "shadow" ? 0.34 : 0.46;
    [-1, 1].forEach(function (sgn) {
      var px = sgn * ex, py = -b.headR * 0.62;
      ctx.fillStyle = "#f8fbff";
      ctx.beginPath(); ctx.arc(px, py, eyeR, 0, 7); ctx.fill();
      ctx.strokeStyle = rgba(dark, 0.5); ctx.lineWidth = 1.1; ctx.stroke();
      var pr = eyeR * pupilK;
      var gg = ctx.createRadialGradient(px - pr * .3, py - pr * .3, 1, px, py, pr);
      if (mark.indexOf("glowEyes") >= 0) {
        gg.addColorStop(0, accent); gg.addColorStop(1, "#0a0618");
      } else {
        gg.addColorStop(0, "#241a3a"); gg.addColorStop(1, "#05060f");
      }
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(px + sgn * 0.6, py + 0.5, pr, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.beginPath(); ctx.arc(px - pr * .34 + sgn * 0.6, py - pr * .4, pr * .3, 0, 7); ctx.fill();
      if (mark.indexOf("mask") >= 0) {
        ctx.fillStyle = "rgba(10,12,36,.94)";
        ctx.beginPath(); ctx.ellipse(px, py - eyeR * .08, eyeR * 1.3, eyeR * .74, 0, 0, 7); ctx.fill();
      }
    });

    /* 嘴 */
    var my = b.headR * 0.34;
    ctx.strokeStyle = "#2b1a2e"; ctx.lineWidth = 2.1; ctx.lineCap = "round";
    ctx.beginPath();
    if (face === "grin") {
      ctx.moveTo(-b.headR * 0.6, my - 1);
      ctx.quadraticCurveTo(0, my + b.headR * 0.44, b.headR * 0.6, my - 1);
    } else if (face === "smile") {
      ctx.moveTo(-b.headR * 0.36, my);
      ctx.quadraticCurveTo(0, my + b.headR * 0.24, b.headR * 0.36, my);
    } else if (face === "fang") {
      ctx.moveTo(-b.headR * 0.55, my - 1);
      ctx.quadraticCurveTo(0, my + b.headR * 0.4, b.headR * 0.55, my - 1);
      ctx.fillStyle = "#fff";
      [-1, 1].forEach(function (sgn) {
        ctx.beginPath();
        ctx.moveTo(sgn * b.headR * 0.3, my + 1);
        ctx.lineTo(sgn * b.headR * 0.36, my + b.headR * 0.34);
        ctx.lineTo(sgn * b.headR * 0.18, my + 2);
        ctx.closePath(); ctx.fill();
      });
    } else if (face === "wave") {
      ctx.moveTo(-b.headR * 0.46, my + 1);
      ctx.quadraticCurveTo(-b.headR * 0.22, my - 4, 0, my + 1);
      ctx.quadraticCurveTo(b.headR * 0.22, my + 6, b.headR * 0.46, my + 1);
    } else { /* flat */
      ctx.moveTo(-b.headR * 0.4, my + 1);
      ctx.lineTo(b.headR * 0.4, my + 1);
    }
    ctx.stroke();

    /* 腮红 */
    if (mark.indexOf("cheek") >= 0) {
      [-1, 1].forEach(function (sgn) {
        ctx.fillStyle = rgba(accent, 0.4);
        ctx.beginPath();
        ctx.ellipse(sgn * b.headR * 0.68, my + 1, b.headR * 0.24, b.headR * 0.15, 0, 0, 7);
        ctx.fill();
      });
    }

    /* 头饰 / 装饰 */
    ctx.save();
    if (mark.indexOf("headband") >= 0) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(0, -b.headR * 0.3, b.headR * 1.02, 3.4, 0, 0, 7);
      ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 2.6; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-b.headR * 0.9, -b.headR * 0.32);
      ctx.quadraticCurveTo(-b.headR * 1.7, -b.headR * 0.1, -b.headR * 1.5, b.headR * 0.4);
      ctx.stroke();
    }
    if (mark.indexOf("crown") >= 0) {
      var cw = b.headR * 0.7, cy = -b.headR * 1.12;
      ctx.fillStyle = "#ffd94d"; ctx.strokeStyle = "#c08a00"; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-cw, cy + 7); ctx.lineTo(-cw, cy - 2);
      ctx.lineTo(-cw * 0.45, cy + 4); ctx.lineTo(0, cy - 6);
      ctx.lineTo(cw * 0.45, cy + 4); ctx.lineTo(cw, cy - 2);
      ctx.lineTo(cw, cy + 7); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    if (mark.indexOf("cap") >= 0) {
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.ellipse(0, -b.headR * 0.98, b.headR * 0.6, b.headR * 0.44, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(-1.9, -b.headR * 1.4, 3.8, 6);
      ctx.fillRect(-5.5, -b.headR * 1.25, 11, 3.4);
    }
    if (mark.indexOf("halo") >= 0) {
      ctx.save();
      ctx.globalAlpha = .8;
      ctx.strokeStyle = "#ffd94d"; ctx.lineWidth = 2.4;
      ctx.shadowBlur = 14; ctx.shadowColor = "#ffd94d";
      ctx.beginPath();
      ctx.ellipse(0, -b.headR * 1.55, b.headR * 0.95, b.headR * 0.22, 0, 0, 7);
      ctx.stroke();
      ctx.restore();
    }
    if (mark.indexOf("bolt") >= 0) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(b.headR * 0.18, -b.headR * 0.5);
      ctx.lineTo(b.headR * 0.52, -b.headR * 0.05);
      ctx.lineTo(b.headR * 0.28, -b.headR * 0.05);
      ctx.lineTo(b.headR * 0.58, b.headR * 0.5);
      ctx.lineTo(b.headR * 0.22, b.headR * 0.02);
      ctx.lineTo(b.headR * 0.4, b.headR * 0.02);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.restore(); /* 头结束 */

    /* ---------- 6. 前臂（近侧，画在躯干之上，颜色更亮做景深） ---------- */
    (function () {
      var A = pose.armB;
      ctx.save();
      ctx.translate(b.torsoW * 0.78, -torsoH * 0.78);
      ctx.rotate(A.sh);
      ctx.scale(A.sc, A.sc);
      joint(ctx, b.limbT, light);
      limb(ctx, b.limbL * 15, b.limbT * 0.92, light, mid);
      ctx.translate(0, b.limbL * 15);
      joint(ctx, b.limbT * 0.8, light);
      ctx.rotate(A.el);
      limb(ctx, b.limbL * 14, b.limbT * 0.76, light, mid);
      ctx.translate(0, b.limbL * 14);
      ctx.fillStyle = light;
      ctx.beginPath(); ctx.arc(0, 0, b.limbT * 0.92, 0, 7); ctx.fill();
      /* 武器 / 道具挂在前手 */
      if (mark.indexOf("katana") >= 0) {
        ctx.save();
        ctx.rotate(d(-58));
        ctx.fillStyle = "#dfe7ff";
        ctx.fillRect(-1.7, -34, 3.4, 48);
        ctx.fillStyle = rgba("#ffffff", .7);
        ctx.fillRect(-1.7, -34, 1.1, 48);
        ctx.fillStyle = "#8a6bff"; ctx.fillRect(-3.4, 12, 6.8, 3.6);
        ctx.fillStyle = "#332a52"; ctx.fillRect(-2.2, 15.6, 4.4, 8);
        ctx.restore();
      }
      if (mark.indexOf("shuriken") >= 0) {
        ctx.save();
        ctx.rotate(d(20));
        ctx.fillStyle = "#c9d2ff";
        for (var k = 0; k < 4; k++) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(7, -2.4); ctx.lineTo(0, -9); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
    })();

    ctx.restore(); /* 躯干结束 */
    ctx.restore(); /* 整体结束 */
  }

  /* ---------------- 帧缓存 ----------------
     每个 (角色, 动作, 帧序, 尺寸, 风格) 只渲染一次，之后直接复用。 */
  var cache = {};
  var STYLE_KEYS = {};

  function specFor(fighter) {
    /* 从 fighters.js 的数据推导出脸部/花纹/装饰，保持与数据模块一致 */
    var id = fighter.id;
    var map = {
      big:     { face: "grin",  markings: ["cheek", "spots"] },
      small:   { face: "smile", markings: ["cheek"] },
      rainbow: { face: "grin",  markings: ["cheek", "rainbow"] },
      gold:    { face: "flat",  markings: ["crown", "shine"] },
      ice:     { face: "wave",  markings: ["crack", "glowEyes"] },
      flame:   { face: "fang",  markings: ["blaze", "glowEyes"] },
      ninja:   { face: "flat",  markings: ["mask", "headband", "shuriken"] },
      samurai: { face: "flat",  markings: ["headband", "katana", "stripes"] },
      healer:  { face: "smile", markings: ["cheek", "spots", "cap"] },
      thunder: { face: "grin",  markings: ["bolt", "glowEyes"] },
      shadow:  { face: "flat",  markings: ["mask", "glowEyes", "shadow"] },
      boss:    { face: "grin",  markings: ["halo", "crown", "cheek"] }
    };
    return map[id] || map.big;
  }

  /**
   * 取一帧骨骼动画
   * @param {object|string} fighter 斗士数据对象或 id
   * @param {string} clip          动作名（idle/walk/punch1/ko…）
   * @param {number} phase         0..1 动作进度（循环动作用它就够了）
   * @param {number} size          渲染尺寸（像素）
   * @param {object} opt           {faceFlip:boolean}
   */
  function frame(fighter, clip, phase, size, opt) {
    if (typeof fighter === "string") {
      fighter = (NAIWA.FIGHTERS && NAIWA.FIGHTERS.byId) ? NAIWA.FIGHTERS.byId(fighter) : { id: fighter, color: "#7ec850" };
    }
    opt = opt || {};
    size = Math.max(16, Math.round(size || 128));
    var clipDef = CLIPS[clip] || CLIPS.idle;
    var poseName = clipDef[0], frames = clipDef[1], loop = clipDef[2];
    var idx = loop ? (Math.floor((phase % 1) * frames + frames) % frames) : 0;
    var key = fighter.id + "|" + clip + "|" + idx + "|" + size + "|" + (opt.glow ? 1 : 0);

    if (cache[key]) return cache[key];
    var spec = specFor(fighter);
    /* 用一个带内边距的临时画布渲染：发光需要空间扩散，
       如果直接在紧贴边缘的画布上做发光，光晕会被裁掉变成一块方形色块。 */
    var PAD = opt.glow ? Math.round(size * 0.14) : 0;
    var pad = document.createElement("canvas");
    pad.width = size + PAD * 2; pad.height = size + PAD * 2;
    var pctx = pad.getContext("2d");
    var k = size / 104;
    pctx.save();
    pctx.translate(PAD + size / 2, PAD + size * 0.955);
    pctx.scale(k, k);

    var t = loop ? idx / Math.max(1, frames) : 0;
    var pose;
    try {
      pose = POSES[poseName](t);
    } catch (e) {
      pose = POSES.idle(0);
    }
    drawRig(pctx, fighter, pose, { face: spec.face, markings: spec.markings });

    /* 发光：在 padding 区域里做柔和的背光 */
    if (opt.glow) {
      pctx.setTransform(1, 0, 0, 1, 0, 0);
      pctx.globalCompositeOperation = "destination-over";
      pctx.globalAlpha = 0.38;
      pctx.shadowBlur = Math.round(size * 0.22);
      pctx.shadowColor = fighter.accent || fighter.color;
      pctx.drawImage(pad, 0, 0);
      pctx.globalAlpha = 1;
      pctx.globalCompositeOperation = "source-over";
    }
    pctx.restore();

    /* 自动裁剪到实际内容边界，避免精灵四周留一堆空白影响判定与定位 */
    var cv = document.createElement("canvas");
    cv.width = size; cv.height = size;
    var ctx = cv.getContext("2d");
    var sx = 0, sy = 0, sw = pad.width, sh = pad.height;
    try {
      var img = pctx.getImageData(0, 0, pad.width, pad.height).data;
      var minX = pad.width, maxX = -1, minY = pad.height, maxY = -1;
      for (var yy = 0; yy < pad.height; yy++) {
        for (var xx = 0; xx < pad.width; xx++) {
          if (img[(yy * pad.width + xx) * 4 + 3] > 6) {
            if (xx < minX) minX = xx;
            if (xx > maxX) maxX = xx;
            if (yy < minY) minY = yy;
            if (yy > maxY) maxY = yy;
          }
        }
      }
      if (maxX > minX && maxY > minY) {
        sx = minX; sy = minY; sw = maxX - minX + 1; sh = maxY - minY + 1;
      }
    } catch (e) { /* getImageData 失败（极少见）时退化为不裁剪 */ }
    ctx.drawImage(pad, sx, sy, sw, sh, 0, 0, size, size);

    cache[key] = cv;
    return cv;
  }

  /* 把一个动作的所有帧一次性生成（战斗中直接按帧取，零计算） */
  function warm(fighter, clips, size) {
    (clips || Object.keys(CLIPS)).forEach(function (c) {
      var def = CLIPS[c];
      if (def[1] > 1) {
        for (var i = 0; i < def[1]; i++) frame(fighter, c, i / def[1], size);
      } else {
        frame(fighter, c, 0, size);
      }
    });
  }

  NAIWA.Rig = {
    BODY: BODY,
    POSES: POSES,
    CLIPS: CLIPS,
    frame: frame,
    warm: warm,
    spec: specFor,
    clearCache: function () { cache = {}; }
  };

})(typeof window !== "undefined" ? window : globalThis);
