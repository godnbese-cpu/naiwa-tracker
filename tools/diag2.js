(function(){
  var out=[];
  out.push("地图 IIFE 是否已注册 __NAIWA_renderReality: "+(typeof window.__NAIWA_renderReality));
  out.push("mapChart 是否存在: "+(typeof mapChart));
  out.push("world.json 能否直接 fetch:");
  return out.join("\n");
})()
