(function () {
  var B = window.__NAIWA_BATTLE;
  if (!B) return "no-hook";
  var F = NAIWA.FIGHTERS, Rig = NAIWA.Rig;
  var out = [];
  [0, 1].forEach(function (i) {
    var e = B.P[i];
    if (!e) { out.push("P" + i + " null"); return; }
    var f = e.def;
    var cv = Rig.frame(f, "idle", 0.3, 128);
    var c = document.createElement("canvas");
    c.width = cv.width; c.height = cv.height;
    var x = c.getContext("2d");
    x.drawImage(cv, 0, 0);
    var d = x.getImageData(0, 0, cv.width, cv.height).data;
    var W = cv.width, H = cv.height;
    /* 逐行统计非透明像素数，找出"躯干那一行段"的宽度 */
    var rows = [];
    for (var y = 0; y < H; y += 4) {
      var n = 0, mn = 1e9, mx = -1;
      for (var xx = 0; xx < W; xx++) {
        if (d[(y * W + xx) * 4 + 3] > 40) { n++; if (xx < mn) mn = xx; if (xx > mx) mx = xx; }
      }
      rows.push(y + ":" + n + (mx >= 0 ? "(" + mn + "-" + mx + ")" : ""));
    }
    out.push("P" + i + " " + f.name + " size=" + W + "x" + H +
      " BODY=" + JSON.stringify(Rig.BODY[f.id] || {}) +
      "\n  行扫描(每4px): " + rows.join(" "));
  });
  return out.join("\n");
})()
