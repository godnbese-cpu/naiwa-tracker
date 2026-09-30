(function () {
  var F = NAIWA.FIGHTERS, Rig = NAIWA.Rig;
  var W = 1200, H = 460;
  var cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  cv.id = "rigprobe";
  cv.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647";
  document.body.appendChild(cv);
  var ctx = cv.getContext("2d");
  ctx.fillStyle = "#08122a"; ctx.fillRect(0, 0, W, H);

  var clips = ["idle", "punch1", "strike", "kick", "guard", "hurt", "ko", "walk"];
  ctx.font = "13px Consolas"; ctx.fillStyle = "#7ec850";

  /* 第一行：Rig.frame 直接以 128 输出，再按 128 显示 */
  clips.forEach(function (cl, i) {
    var f = F.byId("big");
    var c = Rig.frame(f, cl, 0.3, 128);
    var x = 10 + i * 148, y = 26;
    ctx.fillStyle = "#0d1330"; ctx.fillRect(x - 4, y - 4, 140, 140);
    ctx.drawImage(c, x, y, 128, 128);
    ctx.fillStyle = "#8b93c8"; ctx.font = "11px Consolas";
    ctx.fillText(cl, x, y + 152);
    ctx.fillText(c.width + "x" + c.height, x, y + 166);
  });

  /* 第二行：模拟战斗里的绘制方式（缩放到 117，以脚底为基准） */
  var gy = 420;
  ctx.strokeStyle = "#ff5a5a"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
  clips.forEach(function (cl, i) {
    var f = F.byId("big");
    var c = Rig.frame(f, cl, 0.3, 128);
    var x = 80 + i * 148;
    ctx.drawImage(c, x - 117 / 2, gy - 117, 117, 117);
    ctx.fillStyle = "#ffd94d"; ctx.font = "10px Consolas";
    ctx.fillText("117px", x - 16, gy + 12);
  });
  return "probe 已绘制 " + clips.length + " 帧";
})()
