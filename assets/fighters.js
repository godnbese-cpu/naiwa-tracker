/* ============================================================
   🐸 奶蛙格斗 · 角色数据模块  (assets/fighters.js)
   ------------------------------------------------------------
   奶蛙军团 12 位斗士的完整数值/招式/配色定义。
   所有形象均由原图 naiwa-standing.webp 等程序化换色生成，
   无需外部素材，也便于 Python 模块（tools/naiwa_data.py）
   导出同一份数据。
   ============================================================ */
(function (global) {
  "use strict";

  var NAIWA = global.NAIWA = global.NAIWA || {};

  /* ---------------- 招式模板工具 ---------------- */
  function norm(m) {
    m = m || {};
    return {
      key: m.key || "",
      name: m.name || "招式",
      type: m.type || "melee",          // melee | projectile | dash | grab | counter | buff | aoe
      startup: m.startup === undefined ? 6 : m.startup,   // 前摇帧
      active: m.active === undefined ? 4 : m.active,      // 判定帧
      recovery: m.recovery === undefined ? 10 : m.recovery, // 后摇帧
      dmg: m.dmg === undefined ? 8 : m.dmg,
      chip: m.chip === undefined ? 0.18 : m.chip,         // 防御削减比
      hitstun: m.hitstun === undefined ? 16 : m.hitstun,
      knock: m.knock === undefined ? 5 : m.knock,         // 水平击退
      pop: m.pop === undefined ? 6 : m.pop,               // 垂直弹起
      meterGain: m.meterGain === undefined ? 8 : m.meterGain,
      meterCost: m.meterCost || 0,
      range: m.range === undefined ? 74 : m.range,
      hy: m.hy === undefined ? 0.55 : m.hy,               // 判定中心高度比（相对身高）
      hh: m.hh === undefined ? 0.6 : m.hh,                // 判定高度比
      proj: m.proj || null,                               // {vx,vy,r,life,pierce,homing}
      invuln: m.invuln || 0,                              // 无敌帧
      armor: m.armor || 0,                                // 霸体帧
      heal: m.heal || 0,
      dashV: m.dashV || 0,
      aoe: m.aoe || null,                                 // {r,h,dur}
      desc: m.desc || ""
    };
  }

  /* 基础三连：轻拳 → 轻拳 → 中踢 */
  function lightChain() {
    return {
      light: norm({ key: "light", name: "轻拍", dmg: 5, startup: 4, active: 3, recovery: 7, hitstun: 13, knock: 2.5, pop: 0, range: 66, meterGain: 6, desc: "出手最快的连段起手" }),
      light2: norm({ key: "light2", name: "连拍", dmg: 5, startup: 4, active: 3, recovery: 8, hitstun: 13, knock: 2.5, pop: 0, range: 68, meterGain: 6, desc: "连段第二下" }),
      light3: norm({ key: "light3", name: "扫尾", dmg: 9, startup: 7, active: 4, recovery: 14, hitstun: 20, knock: 6, pop: 4, range: 78, meterGain: 10, desc: "连段收尾，击退明显" }),
      heavy: norm({ key: "heavy", name: "重压", dmg: 13, startup: 12, active: 5, recovery: 20, hitstun: 24, knock: 8, pop: 7, range: 84, meterGain: 12, desc: "慢但伤害高，可击倒" }),
      air: norm({ key: "air", name: "空中踏", dmg: 8, startup: 5, active: 6, recovery: 10, hitstun: 16, knock: 4, pop: -2, range: 70, hy: 1.15, meterGain: 8, desc: "空中下劈" }),
      up: norm({ key: "up", name: "挑击", dmg: 7, startup: 6, active: 4, recovery: 16, hitstun: 26, knock: 1, pop: -11, range: 62, hy: 0.2, meterGain: 8, desc: "对空起手，浮空连段" })
    };
  }

  /* 投技（贴身抓取） */
  function grabMove(dmg) {
    return norm({
      key: "grab", name: "奶蛙抓", type: "grab", dmg: dmg || 18,
      startup: 8, active: 5, recovery: 26, hitstun: 40, knock: 12, pop: -9,
      range: 58, meterGain: 14, desc: "贴身抓取，无视普通防御"
    });
  }

  /* ---------------- 角色名单 ---------------- */
  var FIGHTERS = [
    {
      id: "big", name: "大奶蛙", title: "笑与哭之主", emoji: "🐸",
      src: "naiwa-standing.webp", atkSrc: "naiwa-smiling.webp", sadSrc: "naiwa-thinking.webp",
      color: "#ffd94d", glow: "#ffe98a", accent: "#ff6ec7",
      hp: 105, speed: 4.4, jump: 15.2, weight: 1.15, dashV: 13, airJumps: 1,
      lore: "梨形的身躯里装着整个互联网的情绪，笑起来能震碎玻璃，哭起来能淹掉机房。",
      moves: Object.assign(lightChain(), {
        s1: norm({ key: "s1", name: "齁齁齁声波", type: "projectile", dmg: 7, startup: 10, active: 22, recovery: 16, hitstun: 14, knock: 3, meterGain: 9, meterCost: 0, proj: { vx: 11, vy: 0, r: 22, life: 90, grow: 1.1, pierce: 0 }, desc: "三连音波，可穿屏压制" }),
        s2: norm({ key: "s2", name: "泪之瀑布", type: "aoe", dmg: 16, startup: 18, active: 34, recovery: 24, hitstun: 30, knock: 6, pop: -8, meterGain: 12, meterCost: 25, aoe: { r: 190, h: 220, dur: 1.1 }, desc: "前方泪雨倾盆，浮空起手" }),
        s3: norm({ key: "s3", name: "情绪爆发·全体治疗", type: "buff", dmg: 0, startup: 24, active: 4, recovery: 28, meterCost: 50, heal: 28, meterGain: 0, invuln: 30, desc: "消耗 50 能量回复 28 点生命（无敌起手）" })
      })
    },
    {
      id: "small", name: "小奶蛙", title: "装死艺术大师", emoji: "🐣",
      src: "naiwa-thinking.webp", atkSrc: "naiwa-standing.webp", sadSrc: "naiwa-smiling.webp",
      color: "#7ec850", glow: "#b6f08a", accent: "#22d3ee",
      hp: 82, speed: 6.3, jump: 14.4, weight: 0.78, dashV: 16, airJumps: 2,
      lore: "体型只有大奶蛙的三分之一，却掌握了让所有人血压升高的核心科技：装死。",
      moves: Object.assign(lightChain(), {
        s1: norm({ key: "s1", name: "装死突袭", type: "dash", dmg: 15, startup: 12, active: 12, recovery: 18, hitstun: 32, knock: 10, pop: -8, meterGain: 12, meterCost: 0, invuln: 26, dashV: 21, desc: "先躺下无敌，再瞬间暴起撞飞对手" }),
        s2: norm({ key: "s2", name: "胆怯翻滚", type: "dash", dmg: 4, startup: 4, active: 8, recovery: 12, hitstun: 10, knock: 4, meterGain: 5, meterCost: 0, invuln: 18, dashV: 17, desc: "带无敌帧的位移，可穿过对手" }),
        s3: norm({ key: "s3", name: "装死の极致", type: "counter", dmg: 26, startup: 6, active: 22, recovery: 32, meterCost: 40, invuln: 24, hitstun: 44, knock: 14, pop: -12, meterGain: 0, desc: "受击瞬间反击：被击中则对手吃满伤害" })
      })
    },
    {
      id: "rainbow", name: "彩虹奶蛙", title: "七色速攻", emoji: "🌈",
      src: "naiwa-smiling.webp", atkSrc: "naiwa-standing.webp", sadSrc: "naiwa-thinking.webp",
      color: "#ff6ec7", glow: "#ffd0f0", accent: "#ffd94d", hue: 120, sat: 1.35,
      hp: 92, speed: 5.5, jump: 15.8, weight: 0.95, dashV: 15, airJumps: 2,
      lore: "在极速杯上被程序化换色生成出来的物种，意外获得了七彩光速，从此沉迷连段。",
      moves: Object.assign(lightChain(), {
        s1: norm({ key: "s1", name: "七色连闪", type: "dash", dmg: 9, startup: 5, active: 18, recovery: 12, hitstun: 18, knock: 4, meterGain: 8, invuln: 14, dashV: 19, desc: "极快突进，可接空中连段" }),
        s2: norm({ key: "s2", name: "彩虹光弹", type: "projectile", dmg: 6, startup: 8, active: 12, recovery: 14, hitstun: 12, knock: 3, meterGain: 7, proj: { vx: 9.5, vy: -1.2, r: 16, life: 80, gravity: 0.08 }, desc: "三发弧形光弹，封锁走位" }),
        s3: norm({ key: "s3", name: "彩虹爆裂", type: "aoe", dmg: 22, startup: 14, active: 20, recovery: 26, hitstun: 34, knock: 9, pop: -6, meterCost: 45, aoe: { r: 150, h: 200, dur: .7 }, meterGain: 0, desc: "以自身为中心炸开七色光环" })
      })
    },
    {
      id: "gold", name: "金曜奶蛙", title: "限定金色传说", emoji: "🏆",
      src: "naiwa-standing.webp", atkSrc: "naiwa-smiling.webp", sadSrc: "naiwa-thinking.webp",
      color: "#ffb300", glow: "#ffe9a8", accent: "#ffd94d", hue: 25, sat: 1.6,
      hp: 118, speed: 3.9, jump: 13.6, weight: 1.35, dashV: 11, airJumps: 1,
      lore: "999 足金（假的），但硬是真的硬。据说摆在家里能招财，摆上擂台能招打。",
      moves: Object.assign(lightChain(), {
        s1: norm({ key: "s1", name: "无敌霸体冲撞", type: "dash", dmg: 18, startup: 14, active: 16, recovery: 24, hitstun: 30, knock: 12, pop: -8, meterGain: 12, armor: 30, dashV: 15, desc: "起步即霸体，硬吃一下也要撞到你" }),
        s2: norm({ key: "s2", name: "金元宝投掷", type: "projectile", dmg: 12, startup: 12, active: 10, recovery: 18, hitstun: 18, knock: 5, meterGain: 9, proj: { vx: 8, vy: -3.4, r: 20, life: 110, gravity: .34 }, desc: "抛射金元宝，落地还有小范围震荡" }),
        s3: norm({ key: "s3", name: "招财金身", type: "buff", dmg: 0, startup: 20, active: 4, recovery: 30, meterCost: 50, heal: 20, armor: 120, meterGain: 0, desc: "金身附体：120 帧霸体 + 回复 20 生命" })
      })
    },
    {
      id: "ice", name: "冰霜奶蛙", title: "冷静的控场者", emoji: "❄️",
      src: "naiwa-thinking.webp", atkSrc: "naiwa-standing.webp", sadSrc: "naiwa-smiling.webp",
      color: "#5aa8ff", glow: "#cfe6ff", accent: "#22d3ee", hue: 190, sat: 1.2,
      hp: 95, speed: 4.9, jump: 15.0, weight: 1.0, dashV: 13, airJumps: 1,
      lore: "「让我想想」是它的口头禅，想明白的时候，你已经被冻在原地了。",
      moves: Object.assign(lightChain(), {
        s1: norm({ key: "s1", name: "寒霜之息", type: "projectile", dmg: 8, startup: 12, active: 16, recovery: 16, hitstun: 30, knock: 2, meterGain: 9, proj: { vx: 7, vy: -.4, r: 26, life: 95, slow: 1.6 }, desc: "命中后减速对手 1.6 秒" }),
        s2: norm({ key: "s2", name: "冰晶地刺", type: "aoe", dmg: 14, startup: 16, active: 22, recovery: 20, hitstun: 26, knock: 4, pop: -9, meterGain: 10, aoe: { r: 170, h: 150, dur: .6 }, desc: "地面爆发冰刺，浮空起手" }),
        s3: norm({ key: "s3", name: "绝对零度", type: "aoe", dmg: 26, startup: 22, active: 26, recovery: 30, hitstun: 48, knock: 6, pop: -10, meterCost: 45, aoe: { r: 260, h: 300, dur: 1.2 }, meterGain: 0, desc: "全屏冻结 2.5 秒，谁都别想动" })
      })
    },
    {
      id: "flame", name: "烈焰奶蛙", title: "暴走伤害怪", emoji: "🔥",
      src: "naiwa-smiling.webp", atkSrc: "naiwa-standing.webp", sadSrc: "naiwa-thinking.webp",
      color: "#ff5a3c", glow: "#ffc0a8", accent: "#ffd94d", hue: -35, sat: 1.5,
      hp: 100, speed: 5.0, jump: 15.2, weight: 1.05, dashV: 14, airJumps: 1,
      lore: "情绪一上头就自燃，伤害全游戏最高，代价是把自己也烧得只剩半条命。",
      moves: Object.assign(lightChain(), {
        s1: norm({ key: "s1", name: "喷射火花", type: "projectile", dmg: 6, startup: 7, active: 14, recovery: 12, hitstun: 12, knock: 3, meterGain: 7, proj: { vx: 12, vy: -.6, r: 14, life: 70, burn: 2 }, desc: "高速火花，附带灼烧" }),
        s2: norm({ key: "s2", name: "浴火冲锋", type: "dash", dmg: 20, startup: 12, active: 16, recovery: 26, hitstun: 34, knock: 13, pop: -8, meterGain: 12, armor: 20, dashV: 20, selfDmg: 5, desc: "霸体冲锋，自身承受 5 点反噬" }),
        s3: norm({ key: "s3", name: "自爆奶蛙", type: "aoe", dmg: 40, startup: 26, active: 18, recovery: 44, hitstun: 60, knock: 16, pop: -12, meterCost: 50, selfDmg: 18, aoe: { r: 300, h: 340, dur: 1.0 }, meterGain: 0, desc: "全场核爆，自己也掉 18 点血" })
      })
    },
    {
      id: "ninja", name: "影忍奶蛙", title: "瞬移暗杀者", emoji: "🥷",
      src: "naiwa-thinking.webp", atkSrc: "naiwa-standing.webp", sadSrc: "naiwa-smiling.webp",
      color: "#8a6bff", glow: "#d6c8ff", accent: "#22d3ee", hue: 250, sat: 1.1,
      hp: 88, speed: 6.0, jump: 16.4, weight: 0.85, dashV: 18, airJumps: 3,
      lore: "奶蛙界的忍者，三段空中跳跃，落地之前你根本不知道它在哪。",
      moves: Object.assign(lightChain(), {
        s1: norm({ key: "s1", name: "苦无手里剑", type: "projectile", dmg: 7, startup: 8, active: 8, recovery: 12, hitstun: 12, knock: 3, meterGain: 8, proj: { vx: 14, vy: 0, r: 12, life: 80, pierce: 1 }, desc: "可穿透一名敌人的手里剑" }),
        s2: norm({ key: "s2", name: "影分身瞬移", type: "dash", dmg: 12, startup: 4, active: 10, recovery: 14, hitstun: 26, knock: 8, pop: -6, meterGain: 10, invuln: 22, dashV: 26, desc: "瞬移到对手身后并背刺" }),
        s3: norm({ key: "s3", name: "千蛙斩", type: "dash", dmg: 34, startup: 10, active: 24, recovery: 34, hitstun: 54, knock: 14, pop: -10, meterCost: 45, invuln: 30, dashV: 24, meterGain: 0, desc: "30 帧无敌的多段斩击" })
      })
    },
    {
      id: "samurai", name: "武侍奶蛙", title: "一击必杀", emoji: "⚔️",
      src: "naiwa-standing.webp", atkSrc: "naiwa-thinking.webp", sadSrc: "naiwa-smiling.webp",
      color: "#e8ecff", glow: "#ffffff", accent: "#ff5a5a",
      hp: 98, speed: 4.6, jump: 14.6, weight: 1.1, dashV: 12, airJumps: 1,
      lore: "拔刀只有一瞬，收刀已分胜负。它的哲学是：不用连段，只要一刀。",
      moves: Object.assign(lightChain(), {
        s1: norm({ key: "s1", name: "居合拔刀", type: "counter", dmg: 30, startup: 5, active: 14, recovery: 30, hitstun: 46, knock: 12, pop: -10, meterGain: 14, invuln: 20, desc: "架势反击：受击瞬间斩出 30 点" }),
        s2: norm({ key: "s2", name: "半月斩", type: "projectile", dmg: 13, startup: 14, active: 12, recovery: 22, hitstun: 24, knock: 7, meterGain: 10, proj: { vx: 10, vy: 0, r: 30, life: 60, pierce: 2 }, desc: "巨大剑气，穿透两名敌人" }),
        s3: norm({ key: "s3", name: "无想一刀", type: "dash", dmg: 46, startup: 16, active: 20, recovery: 40, hitstun: 70, knock: 15, pop: -14, meterCost: 50, invuln: 26, dashV: 22, meterGain: 0, desc: "全屏冲刺一刀，命中即宣布结束" })
      })
    },
    {
      id: "healer", name: "治疗奶蛙", title: "奶糖补给站", emoji: "💊",
      src: "naiwa-smiling.webp", atkSrc: "naiwa-standing.webp", sadSrc: "naiwa-thinking.webp",
      color: "#ff8ac8", glow: "#ffd9ee", accent: "#7ec850", hue: 320, sat: 1.25,
      hp: 90, speed: 5.2, jump: 15.4, weight: 0.92, dashV: 14, airJumps: 2,
      lore: "奶糖味儿的奶蛙，随手一撒就是回血包——但它自己其实最怕疼。",
      moves: Object.assign(lightChain(), {
        s1: norm({ key: "s1", name: "奶糖弹幕", type: "projectile", dmg: 7, startup: 9, active: 16, recovery: 14, hitstun: 12, knock: 4, meterGain: 8, proj: { vx: 8.5, vy: -3, r: 18, life: 90, gravity: .3, count: 3 }, desc: "三连抛射奶糖" }),
        s2: norm({ key: "s2", name: "紧急治疗", type: "buff", dmg: 0, startup: 16, active: 4, recovery: 22, meterCost: 30, heal: 22, invuln: 24, meterGain: 0, desc: "消耗 30 能量回复 22 生命" }),
        s3: norm({ key: "s3", name: "甜蜜风暴", type: "aoe", dmg: 20, startup: 18, active: 24, recovery: 28, hitstun: 40, knock: 8, pop: -8, meterCost: 45, heal: 12, aoe: { r: 210, h: 260, dur: .9 }, meterGain: 0, desc: "奶糖风暴：伤害敌人的同时回复自身" })
      })
    },
    {
      id: "thunder", name: "雷电奶蛙", title: "高速电磁炮", emoji: "⚡",
      src: "naiwa-standing.webp", atkSrc: "naiwa-smiling.webp", sadSrc: "naiwa-thinking.webp",
      color: "#ffe14d", glow: "#fffbd0", accent: "#8a6bff", hue: 55, sat: 2.1,
      hp: 86, speed: 6.6, jump: 16.0, weight: 0.8, dashV: 19, airJumps: 2,
      lore: "神经反应速度是其他奶蛙的 4 倍，代价是血条薄得像张纸。",
      moves: Object.assign(lightChain(), {
        s1: norm({ key: "s1", name: "雷光弹", type: "projectile", dmg: 9, startup: 6, active: 8, recovery: 10, hitstun: 14, knock: 3, meterGain: 8, proj: { vx: 17, vy: 0, r: 14, life: 60, chain: 1 }, desc: "极速雷弹，命中后电弧连锁" }),
        s2: norm({ key: "s2", name: "瞬雷闪", type: "dash", dmg: 11, startup: 3, active: 10, recovery: 12, hitstun: 22, knock: 6, pop: -5, meterGain: 9, invuln: 16, dashV: 24, desc: "3 帧启动的瞬移突袭" }),
        s3: norm({ key: "s3", name: "雷霆万钧", type: "aoe", dmg: 30, startup: 20, active: 30, recovery: 32, hitstun: 52, knock: 10, pop: -12, meterCost: 50, aoe: { r: 280, h: 400, dur: 1.3 }, meterGain: 0, desc: "天降落雷覆盖整个擂台" })
      })
    },
    {
      id: "shadow", name: "幽冥奶蛙", title: "暗影吞噬", emoji: "🌑",
      src: "naiwa-thinking.webp", atkSrc: "naiwa-smiling.webp", sadSrc: "naiwa-standing.webp",
      color: "#3a2f6b", glow: "#a99bff", accent: "#ff6ec7", hue: 265, sat: .75,
      hp: 96, speed: 5.1, jump: 15.0, weight: 1.0, dashV: 15, airJumps: 2,
      lore: "从数据流深处爬出来的奶蛙，专门吞噬别人的能量条。",
      moves: Object.assign(lightChain(), {
        s1: norm({ key: "s1", name: "暗影球", type: "projectile", dmg: 8, startup: 10, active: 14, recovery: 14, hitstun: 16, knock: 3, meterGain: 6, proj: { vx: 8, vy: 0, r: 22, life: 100, drain: 6 }, desc: "命中后吸取对手能量" }),
        s2: norm({ key: "s2", name: "潜入阴影", type: "dash", dmg: 10, startup: 6, active: 8, recovery: 16, hitstun: 24, knock: 5, pop: -4, meterGain: 8, invuln: 30, dashV: 18, desc: "长时间无敌的潜行位移" }),
        s3: norm({ key: "s3", name: "幽冥吞噬", type: "grab", dmg: 34, startup: 12, active: 8, recovery: 36, hitstun: 60, knock: 10, pop: -12, meterCost: 45, drain: 20, meterGain: 0, desc: "抓取吸取：伤害 + 抽干对手 20 能量" })
      })
    },
    {
      id: "boss", name: "奶蛙之神", title: "最终 BOSS", emoji: "👑",
      src: "naiwa.webp", atkSrc: "naiwa-smiling.webp", sadSrc: "naiwa-thinking.webp",
      color: "#ffffff", glow: "#ffd94d", accent: "#ff6ec7", hue: 0, sat: 1.15,
      hp: 145, speed: 5.2, jump: 16.6, weight: 1.5, dashV: 18, airJumps: 3,
      boss: true,
      lore: "诞生于整个互联网的情绪总和，凡人之躯无法战胜，除非你真的很想赢。",
      moves: Object.assign(lightChain(), {
        s1: norm({ key: "s1", name: "创世声波", type: "projectile", dmg: 11, startup: 10, active: 20, recovery: 14, hitstun: 18, knock: 5, meterGain: 10, proj: { vx: 12, vy: 0, r: 30, life: 120, pierce: 3, grow: 1.15 }, desc: "三道巨型声波，可穿透" }),
        s2: norm({ key: "s2", name: "万象流转", type: "dash", dmg: 16, startup: 6, active: 18, recovery: 16, hitstun: 30, knock: 9, pop: -8, meterGain: 12, invuln: 28, dashV: 26, desc: "无视距离的瞬间接近" }),
        s3: norm({ key: "s3", name: "终焉·奶蛙降临", type: "aoe", dmg: 48, startup: 26, active: 34, recovery: 40, hitstun: 80, knock: 18, pop: -16, meterCost: 50, invuln: 40, aoe: { r: 380, h: 460, dur: 1.6 }, meterGain: 0, desc: "全屏终极技：一击定胜负" })
      })
    }
  ];

  /* ---------------- 场地 ---------------- */
  var STAGES = [
    {
      id: "neon", name: "霓虹决斗场", emoji: "🌃",
      sky: ["#0a0e28", "#05071a"], ground: "#ff5a5a",
      accent: "#22d3ee", fog: "rgba(34,211,238,.06)",
      props: "city", desc: "最标准的擂台，霓虹灯牌下人人平等"
    },
    {
      id: "temple", name: "奶蛙古寺", emoji: "⛩️",
      sky: ["#1a0f2e", "#0a0518"], ground: "#ffd94d",
      accent: "#ff6ec7", fog: "rgba(255,110,199,.05)",
      props: "torii", desc: "樱花与鸟居，适合一刀定胜负"
    },
    {
      id: "lab", name: "数据实验室", emoji: "🧪",
      sky: ["#001a1a", "#00100f"], ground: "#7ec850",
      accent: "#7ec850", fog: "rgba(126,200,80,.06)",
      props: "grid", desc: "代码在脚下流淌，能量回复更快"
    },
    {
      id: "space", name: "深空奶蛙", emoji: "🌌",
      sky: ["#05000f", "#02000a"], ground: "#8a6bff",
      accent: "#8a6bff", fog: "rgba(138,107,255,.07)",
      props: "stars", desc: "失重边缘的最终战场"
    }
  ];

  /* ---------------- 导出 ---------------- */
  var api = {
    version: "2.0.0",
    list: FIGHTERS,
    stages: STAGES,
    byId: function (id) {
      for (var i = 0; i < FIGHTERS.length; i++) if (FIGHTERS[i].id === id) return FIGHTERS[i];
      return FIGHTERS[0];
    },
    byIndex: function (i) { return FIGHTERS[((i % FIGHTERS.length) + FIGHTERS.length) % FIGHTERS.length]; },
    /** 生成精灵所需的所有 (源图, 色, hue, sat) 组合 */
    spriteJobs: function () {
      return FIGHTERS.map(function (f) {
        return { src: f.src, color: f.color, hue: f.hue || 0, sat: f.sat || 1, id: f.id };
      });
    },
    /** 战斗等级：用于 AI 强度 / 排行 */
    tier: function (f) {
      return Math.round((f.hp / 100) * 40 + f.speed * 6 + f.jump * 2);
    }
  };

  NAIWA.FIGHTERS = api;
  global.NAIWA_FIGHTERS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

})(typeof window !== "undefined" ? window : globalThis);
