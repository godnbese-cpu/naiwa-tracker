(function(){
  var out=[];
  out.push("typeof COUNTRIES_DATA = "+ (typeof COUNTRIES_DATA));
  try{ out.push("COUNTRIES_DATA 国家数 = "+(COUNTRIES_DATA&&COUNTRIES_DATA.countries?Object.keys(COUNTRIES_DATA.countries).length:"null")); }catch(e){ out.push("访问 COUNTRIES_DATA 抛错: "+e.message); }
  try{ out.push("typeof EN2ZH = "+(typeof EN2ZH)+"  键数="+(typeof EN2ZH==="object"&&EN2ZH?Object.keys(EN2ZH).length:"-")); }catch(e){ out.push("访问 EN2ZH 抛错: "+e.message); }
  out.push("window.__NAIWA_REAL_COUNTRIES = "+(typeof window.__NAIWA_REAL_COUNTRIES));
  out.push("mapSrc 文本 = "+(document.getElementById("mapSrc")||{}).textContent);
  out.push("NAIWA_COUNTRIES.US = "+(window.NAIWA_COUNTRIES?window.NAIWA_COUNTRIES.countries.US:"-"));
  return out.join("\n");
})()
