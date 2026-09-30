(function () {
  var B = window.__NAIWA_BATTLE;
  if (!B) return "❌ 没有 __NAIWA_BATTLE";
  var o = [];
  o.push("phase=" + B.state.phase + "  timer=" + Math.round(B.state.timer));
  for (var i = 0; i < 2; i++) {
    var e = B.P[i];
    if (!e) { o.push("P" + i + "=null"); continue; }
    var sp = B.sprites[e.def.id];
    var keys = sp && sp.size ? Object.keys(sp.size) : [];
    var fr = (sp && sp.rig) ? NAIWA.Rig.frame(e.def, "idle", 0, 128) : null;
    o.push("P" + i + " " + e.def.name +
      " x=" + Math.round(e.x) + " y=" + Math.round(e.y) +
      " w=" + e.w + " h=" + e.h +
      " state=" + e.state + " hp=" + Math.round(e.hp) +
      " | rig=" + !!(sp && sp.rig) +
      " 尺寸缓存=[" + keys.join(",") + "]" +
      " rig帧=" + (fr ? fr.width + "x" + fr.height : "-"));
  }
  /* Canvas 实际尺寸与 CSS 显示尺寸，用来换算坐标 */
  var cv = document.getElementById("game");
  var r = cv.getBoundingClientRect();
  o.push("canvas 内部分辨率=" + cv.width + "x" + cv.height +
    " 显示尺寸=" + Math.round(r.width) + "x" + Math.round(r.height) +
    " 缩放=" + (r.width / cv.width).toFixed(3) +
    " 左边距=" + Math.round(r.left));
  o.push("换算：P0 应在屏幕 x=" + Math.round(r.left + B.P[0].x * r.width / cv.width) +
    "  P1 应在屏幕 x=" + Math.round(r.left + B.P[1].x * r.width / cv.width));
  return o.join("\n");
})()
