const App = (() => {

  const DEFAULT_PLAYLIST = "https://iptv-org.github.io/iptv/languages/tel.m3u";

  const S = {
    rows: [],
    flat: [],
    focusRow: 0,
    focusCol: 0,
    player: null,
    video: null,
    playing: false,
    offset: {},
    currentIndex: 0
  };

  const DOM = {
    rows: document.getElementById("rows"),
    overlay: document.getElementById("overlay"),
    player: document.getElementById("player")
  };

  /* INIT */
  async function init() {

    try { S.player = webapis.avplay; } catch {}

    // HTML5 fallback
    S.video = document.createElement("video");
    S.video.style.width = "100%";
    S.video.style.height = "100%";
    S.video.autoplay = true;
    DOM.player.appendChild(S.video);

    // Load playlist
    let playlist = localStorage.getItem("custom_playlist")
      ? JSON.parse(localStorage.getItem("custom_playlist"))
      : DEFAULT_PLAYLIST;

    let text = "";

    try {
      text = await fetch(playlist).then(r => r.text());
    } catch {
      text = await fetch(DEFAULT_PLAYLIST).then(r => r.text());
    }

    showOverlay("Loading Telugu Channels...");

    const channels = parse(text);
    group(channels);

    S.flat = channels;

    render();
    focus();

    document.addEventListener("keydown", onKey);
  }

  /* PARSE */
  function parse(txt) {
    const lines = txt.split("\n");
    let res = [], meta = {};

    for (let l of lines) {
      l = l.trim();

      if (l.startsWith("#EXTINF")) {
        meta.name = l.split(",").pop();

        const g = l.match(/group-title="([^"]+)"/);
        const logo = l.match(/tvg-logo="([^"]+)"/);

        meta.group = g ? g[1] : "Other";
        meta.logo = logo ? logo[1] : "";
      }
      else if (l && !l.startsWith("#")) {
        res.push({ ...meta, url: l });
      }
    }

    return res;
  }

  /* GROUP + SORT */
  function group(channels) {
    const map = {};

    channels.forEach(ch => {
      if (!map[ch.group]) map[ch.group] = [];
      map[ch.group].push(ch);
    });

    const sorted = Object.keys(map).sort((a,b)=>a.localeCompare(b));

    S.rows = sorted.map(k => ({
      title: k,
      items: map[k]
    }));
  }

  /* RENDER */
  function render() {
    DOM.rows.innerHTML = "";

    S.rows.forEach((row, r) => {
      const rowEl = div("row");
      const title = div("row-title", row.title);
      const items = div("row-items");

      row.items.forEach((ch, c) => {

        const card = document.createElement("div");
        card.className = "card";

        if (ch.logo) {
          const img = document.createElement("img");
          img.src = ch.logo;
          img.onerror = () => {
            img.remove();
            card.textContent = ch.name;
          };
          card.appendChild(img);
        } else {
          card.textContent = ch.name;
        }

        items.appendChild(card);
      });

      rowEl.appendChild(title);
      rowEl.appendChild(items);
      DOM.rows.appendChild(rowEl);
    });
  }

  /* FOCUS */
  function focus() {
    document.querySelectorAll(".card").forEach(e => e.classList.remove("active"));

    const row = DOM.rows.children[S.focusRow];
    if (!row) return;

    const items = row.children[1];
    const card = items.children[S.focusCol];
    if (!card) return;

    card.classList.add("active");

    if (!S.offset[S.focusRow]) S.offset[S.focusRow] = 0;

    let off = S.offset[S.focusRow];

    if (S.focusCol >= off + 5) off = S.focusCol - 4;
    if (S.focusCol < off) off = S.focusCol;

    S.offset[S.focusRow] = off;

    items.style.transform = `translateX(${-off * 260}px)`;

    showOverlay(card.textContent);
  }

  function showOverlay(txt) {
    DOM.overlay.textContent = txt;
    DOM.overlay.style.opacity = 1;
    setTimeout(()=>DOM.overlay.style.opacity=0,1500);
  }

  /* PLAY */
  function play() {

    const ch = S.rows[S.focusRow].items[S.focusCol];
    const index = S.flat.indexOf(ch);
    S.currentIndex = index;

    showOverlay("Loading: " + ch.name);

    if (playAV(ch.url)) return;
    playHTML5(ch.url);
  }

  function playAV(url) {

    if (!S.player) return false;

    try {
      S.player.stop();
      S.player.close();
    } catch {}

    try {
      S.player.open(url);

      S.player.setDisplayRect(0,0,1920,1080);
      S.player.setStreamingProperty("BUFFERING_TIME","200");
      S.player.setStreamingProperty("ADAPTIVE_INFO","FIXED_MAX_RESOLUTION=1920X1080");

      let fallback = setTimeout(()=>{
        playHTML5(url);
      },6000);

      S.player.prepareAsync(()=>{
        clearTimeout(fallback);
        S.player.play();
        S.playing = true;
        document.body.classList.add("fullscreen");
      });

      return true;

    } catch {
      return false;
    }
  }

  function playHTML5(url) {
    S.video.src = url;
    S.video.play();

    S.video.onerror = ()=>showOverlay("Stream failed");

    S.playing = true;
    document.body.classList.add("fullscreen");
  }

  function stop() {
    try { S.player.stop(); S.player.close(); } catch {}
    S.video.pause();
    S.video.src = "";

    S.playing = false;
    document.body.classList.remove("fullscreen");
  }

  /* NAV */
  function onKey(e) {

    if (S.playing) {
      if (e.key === "Return") stop();
      if (e.key === "ChannelUp") zap(1);
      if (e.key === "ChannelDown") zap(-1);
      return;
    }

    switch(e.key){
      case "ArrowRight": S.focusCol++; break;
      case "ArrowLeft": S.focusCol--; break;
      case "ArrowDown": S.focusRow++; S.focusCol=0; break;
      case "ArrowUp": S.focusRow--; S.focusCol=0; break;
      case "Enter": play(); return;
    }

    clamp();
    focus();
  }

  function zap(dir){
    let i = S.currentIndex + dir;
    if(i<0) i=S.flat.length-1;
    if(i>=S.flat.length) i=0;

    const ch = S.flat[i];

    S.focusRow = S.rows.findIndex(r=>r.items.includes(ch));
    S.focusCol = S.rows[S.focusRow].items.indexOf(ch);

    focus();
    play();
  }

  function clamp(){
    S.focusRow = Math.max(0, Math.min(S.focusRow, S.rows.length-1));
    const max = S.rows[S.focusRow].items.length-1;
    S.focusCol = Math.max(0, Math.min(S.focusCol, max));
  }

  function div(cls, txt){
    const d = document.createElement("div");
    d.className = cls;
    if(txt) d.textContent = txt;
    return d;
  }

  return { init };

})();

App.init();