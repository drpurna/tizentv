module.exports = {

  name: "Tizen TV",

  async start(ctx){

    // ---------- SAFE STORAGE (SERVICE SIDE) ----------
    const storage = {
      get(key, fallback = null) {
        try {
          const v = localStorage.getItem(key);
          return v ? JSON.parse(v) : fallback;
        } catch (e) {
          return fallback;
        }
      },
      set(key, value) {
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {}
      }
    };

    // ---------- DEFAULT CONFIG ----------
    const DEFAULT_PLAYLIST = "https://iptv-org.github.io/iptv/languages/tel.m3u";

    // Load saved data
    const playlist = storage.get("playlist_url", DEFAULT_PLAYLIST);
    const lastChannel = storage.get("last_channel", null);
    const lastPosition = storage.get("last_position", 0);

    // ---------- CACHE BUSTING ----------
    // Clear old cache folder to ensure fresh launch
    try {
      const fs = ctx.fs;
      const CACHE_DIR = ctx.modulePath + "/app/cache";
      await fs.rmdir(CACHE_DIR, { recursive: true });
      console.log("Cache cleared on service launch");
    } catch(e) {
      // ignore if folder doesn't exist
    }

    // Force version-based cache invalidation
    const APP_VERSION = "1.0.3"; // increment this on each update
    const storedVersion = storage.get("app_version", null);
    if (storedVersion !== APP_VERSION) {
      localStorage.clear();
      storage.set("app_version", APP_VERSION);
      console.log("LocalStorage cleared for new version", APP_VERSION);
    }

    // ---------- APP LAUNCH ----------
    ctx.openApp({
      url: ctx.modulePath + "/app/index.html",
      fullscreen: true,
      data: {
        playlist,
        lastChannel,
        lastPosition,
        launchedAt: Date.now()
      }
    });

    // ---------- OPTIONAL HOOKS ----------
    ctx.on?.("appExit", () => {
      console.log("App closed");
    });

    ctx.on?.("appError", (err) => {
      console.error("App error:", err);
    });

  }

}