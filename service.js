module.exports = {
  name: "Tizen TV",

  async start(ctx){
    const storage = {
      get(key, fallback=null){
        try{ const v=localStorage.getItem(key); return v?JSON.parse(v):fallback;}catch{return fallback;}
      },
      set(key,value){
        try{localStorage.setItem(key,JSON.stringify(value));}catch{}
      }
    };

    const DEFAULT_PLAYLIST = "https://iptv-org.github.io/iptv/languages/tel.m3u";
    const playlist = storage.get("custom_playlist", DEFAULT_PLAYLIST);
    const lastChannel = storage.get("last_channel", null);
    const lastPosition = storage.get("last_position", 0);

    const appUrl = ctx.modulePath + "/app/index.html?v=" + Date.now();

    ctx.openApp({
      url: appUrl,
      fullscreen: true,
      data: { playlist, lastChannel, lastPosition }
    });

    ctx.on?.("appExit",()=>console.log("App closed"));
    ctx.on?.("appError",(err)=>console.error("App error:",err));
  }
};