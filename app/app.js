/* =========================
   IPTV ENGINE – STABLE CORE
========================= */

const App = (() => {

  const S = {
    rows: [],
    flat: [],
    focusRow: 0,
    focusCol: 0,
    player: null,
    isPlaying: false,
    rowOffset: {}
  };

  const DOM = {
    rows: document.getElementById("rows"),
    overlay: document.getElementById("overlay"),
    ui: document.getElementById("ui")
  };

  const PLAYLIST = "https://iptv-org.github.io/iptv/languages/tel.m3u";

  /* =========================
     INIT
  ========================== */
  async function init() {
    try {
      S.player = webapis.avplay;
    } catch (e) {
      console.error("AVPlay not available", e);
    }

    const txt = await fetch(PLAYLIST).then(r => r.text());
    const channels = parse(txt);

    buildRows(channels);
    render();
    setFocus();

    document.addEventListener("keydown", onKey);
  }

  /* =========================
     PARSE
  ========================== */
  function parse(text) {
    const lines = text.split("\n");
    let res = [], meta = {};

    for (let l of lines) {
      l = l.trim();

      if (l.startsWith("#EXTINF")) {
        meta.name = l.split(",").pop();
        const g = l.match(/group-title="([^"]+)"/);
        meta.group = g ? g[1] : "Other";
      }
      else if (l && !l.startsWith("#")) {
        res.push({ ...meta, url: l });
      }
    }

    return res;
  }

  /* =========================
     GROUPING
  ========================== */
  function buildRows(channels) {
    const map = {};

    channels.forEach(ch => {
      if (!map[ch.group]) map[ch.group] = [];
      map[ch.group].push(ch);
    });

    S.rows = Object.keys(map).map(k => ({
      title: k,
      items: map[k]
    }));

    S.flat = channels;
  }

  /* =========================
     RENDER
  ========================== */
  function render() {
    DOM.rows.innerHTML = "";

    S.rows.forEach((row, r) => {

      const rowEl = div("row");
      const title = div("row-title", row.title);
      const items = div("row-items");

      row.items.forEach((ch, c) => {
        const card = div("card", ch.name);

        card.dataset.r = r;
        card.dataset.c = c;
        card.tabIndex = 0;

        items.appendChild(card);
      });

      rowEl.appendChild(title);
      rowEl.appendChild(items);
      DOM.rows.appendChild(rowEl);
    });
  }

  /* =========================
     FOCUS + SCROLL (FIXED)
  ========================== */
  function setFocus() {

    document.querySelectorAll(".card").forEach(e => e.classList.remove("active"));

    const rowEl = DOM.rows.children[S.focusRow];
    if (!rowEl) return;

    const items = rowEl.children[1];
    const card = items.children[S.focusCol];

    if (!card) return;

    card.classList.add("active");

    // SCROLL FIX
    if (!S.rowOffset[S.focusRow]) S.rowOffset[S.focusRow] = 0;

    let offset = S.rowOffset[S.focusRow];

    if (S.focusCol >= offset + 5) offset = S.focusCol - 4;
    if (S.focusCol < offset) offset = S.focusCol;

    S.rowOffset[S.focusRow] = offset;

    items.style.transform = `translateX(${-offset * 280}px)`;
  }

  /* =========================
     PLAYER (FIXED AVPLAY)
  ========================== */
  function playChannel() {

    const ch = S.rows[S.focusRow].items[S.focusCol];
    if (!ch) return;

    console.log("PLAY:", ch.name, ch.url);

    DOM.ui.style.display = "none";

    try {
      S.player.stop();
      S.player.close();
    } catch {}

    try {
      S.player.open(ch.url);

      S.player.setDisplayRect(0, 0, 1920, 1080);

      S.player.setListener({
        onbufferingstart: () => console.log("Buffering..."),
        onbufferingcomplete: () => console.log("Buffer done"),
        onstreamcompleted: () => console.log("Stream ended"),
        onerror: e => console.error("AVPlay error", e)
      });

      S.player.prepareAsync(
        () => {
          S.player.play();
          S.isPlaying = true;
        },
        err => console.error("Prepare error", err)
      );

    } catch (e) {
      console.error("Playback failed", e);
    }
  }

  function stopPlayer() {
    try {
      S.player.stop();
      S.player.close();
    } catch {}

    DOM.ui.style.display = "block";
    S.isPlaying = false;
  }

  /* =========================
     REMOTE CONTROL (FIXED)
  ========================== */
  function onKey(e) {

    if (S.isPlaying) {
      if (e.key === "Return" || e.key === "Escape") {
        stopPlayer();
      }
      return;
    }

    switch (e.key) {
      case "ArrowRight": S.focusCol++; break;
      case "ArrowLeft": S.focusCol--; break;
      case "ArrowDown": S.focusRow++; S.focusCol = 0; break;
      case "ArrowUp": S.focusRow--; S.focusCol = 0; break;

      case "Enter":
        playChannel();  // 🔥 FIXED
        return;
    }

    clamp();
    setFocus();
  }

  function clamp() {
    S.focusRow = Math.max(0, Math.min(S.focusRow, S.rows.length - 1));

    const max = S.rows[S.focusRow].items.length - 1;
    S.focusCol = Math.max(0, Math.min(S.focusCol, max));
  }

  function div(cls, txt) {
    const d = document.createElement("div");
    d.className = cls;
    if (txt) d.textContent = txt;
    return d;
  }

  return { init };
})();

App.init();