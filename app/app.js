/* =========================
   Tizen TV IPTV ENGINE v6
========================= */
const App = (() => {
  const S = {
    channels: [],
    rows: [],
    flat: [],
    focusRow: 0,
    focusCol: 0,
    currentIndex: 0,
    rowScroll: {},
    player: null,
    isFullscreen: false,
    dom: {
      rows: document.getElementById("rows"),
      overlay: document.getElementById("overlay"),
      player: document.getElementById("player"),
      ui: document.getElementById("ui"),
      searchBtn: document.getElementById("searchBtn"),
      addBtn: document.getElementById("addBtn")
    }
  };

  const CONFIG = {
    PLAYLIST: localStorage.getItem("custom_playlist") || "https://iptv-org.github.io/iptv/languages/tel.m3u",
    BUFFER: "300",
    TILE_WIDTH: 260,
    VISIBLE_COUNT: 6
  };

  /* =========================
     INIT
  ========================== */
  async function init() {
    try { S.player = webapis.avplay; } catch(e){}

    const text = await fetch(CONFIG.PLAYLIST).then(r=>r.text());
    S.channels = parse(text);
    buildRows();
    renderRows();
    setFocus();

    // Attach search/add handlers
    S.dom.searchBtn.addEventListener("click", () => alert("Search overlay TBD"));
    S.dom.addBtn.addEventListener("click", addPlaylistPrompt);
  }

  /* =========================
     PARSE M3U
  ========================== */
  function parse(text) {
    const lines = text.split("\n");
    let res=[], meta={};
    for(let l of lines){
      l=l.trim();
      if(l.startsWith("#EXTINF")){
        meta.name = l.split(",").pop();
        const g=l.match(/group-title="([^"]+)"/);
        const logo=l.match(/tvg-logo="([^"]+)"/);
        meta.group=g?g[1]:"Other";
        meta.logo=logo?logo[1]:"";
      } else if(l && !l.startsWith("#")) {
        res.push({...meta, url:l});
      }
    }
    return res;
  }

  /* =========================
     BUILD ROWS
  ========================== */
  function buildRows() {
    const map = {};
    S.channels.forEach(ch => {
      if(!map[ch.group]) map[ch.group]=[];
      map[ch.group].push(ch);
    });
    const groups = Object.keys(map).sort((a,b)=>a.localeCompare(b));
    S.rows = groups.map(g=>({title:g, items:map[g]}));
    S.flat = S.channels;
  }

  /* =========================
     RENDER ROWS
  ========================== */
  function renderRows() {
    const frag = document.createDocumentFragment();
    S.rows.forEach((row, r)=>{
      const rowEl = div("row");
      const title = div("row-title", row.title);
      const items = div("row-items");

      row.items.forEach((ch,c)=>{
        const card = div("card");
        card._r=r;
        card._c=c;
        if(ch.logo){
          const img=new Image();
          img.src=ch.logo;
          card.appendChild(img);
        } else card.textContent=ch.name;

        items.appendChild(card);
      });

      rowEl.appendChild(title);
      rowEl.appendChild(items);
      frag.appendChild(rowEl);
    });
    S.dom.rows.innerHTML="";
    S.dom.rows.appendChild(frag);
  }

  /* =========================
     SET FOCUS
  ========================== */
  function setFocus() {
    document.querySelectorAll(".card.active").forEach(e=>e.classList.remove("active"));
    const rowEl = S.dom.rows.children[S.focusRow];
    if(!rowEl) return;
    const items=rowEl.children[1];
    const el = items.children[S.focusCol];
    if(el) el.classList.add("active");
    scrollRow(items);
    showOverlay(el);
  }

  /* =========================
     SCROLL ROW
  ========================== */
  function scrollRow(items){
    if(!S.rowScroll[S.focusRow]) S.rowScroll[S.focusRow]=0;
    let scroll=S.rowScroll[S.focusRow];
    if(S.focusCol>=scroll+CONFIG.VISIBLE_COUNT) scroll=S.focusCol-CONFIG.VISIBLE_COUNT+1;
    if(S.focusCol<scroll) scroll=S.focusCol;
    S.rowScroll[S.focusRow]=scroll;
    const offset=scroll*CONFIG.TILE_WIDTH;
    items.style.transform=`translateX(${-offset}px)`;
  }

  /* =========================
     OVERLAY
  ========================== */
  function showOverlay(el){
    if(!el) return;
    S.dom.overlay.textContent=el.querySelector("img")?.alt || el.textContent;
    S.dom.overlay.style.opacity=1;
  }

  /* =========================
     PLAY CHANNEL
  ========================== */
  function play(index){
    const ch=S.flat[index];
    if(!ch||!S.player) return;
    S.currentIndex=index;
    S.isFullscreen=true;
    S.dom.ui.style.display="none";

    try{S.player.stop();S.player.close();}catch(e){}

    try{
      S.player.open(ch.url);
      S.player.setDisplayRect(0,0,1920,1080);
      S.player.setStreamingProperty("BUFFERING_TIME", CONFIG.BUFFER);
      S.player.prepareAsync(()=>S.player.play(), err=>console.log(err));
    } catch(e){console.log("play error",e);}
  }

  /* =========================
     STOP PLAYER
  ========================== */
  function stopPlayer(){
    try{S.player.stop();S.player.close();}catch(e){}
    S.isFullscreen=false;
    S.dom.ui.style.display="block";
  }

  /* =========================
     CHANNEL ZAP
  ========================== */
  function zap(dir){
    let i=S.currentIndex+dir;
    if(i<0) i=S.flat.length-1;
    if(i>=S.flat.length) i=0;
    play(i);
  }

  /* =========================
     SEARCH / ADD PLAYLIST
  ========================== */
  function addPlaylistPrompt(){
    const url=prompt("Enter M3U Playlist URL:");
    if(url) {
      localStorage.setItem("custom_playlist", url);
      location.reload();
    }
  }

  /* =========================
     CLAMP
  ========================== */
  function clamp(){
    S.focusRow=Math.max(0,Math.min(S.focusRow,S.rows.length-1));
    const max=S.rows[S.focusRow].items.length-1;
    S.focusCol=Math.max(0,Math.min(S.focusCol,max));
  }

  /* =========================
     DIV HELPER
  ========================== */
  function div(cls, txt){const d=document.createElement("div"); if(cls)d.className=cls; if(txt)d.textContent=txt; return d;}

  /* =========================
     KEY HANDLER
  ========================== */
  function onKey(e){
    if(S.isFullscreen){
      switch(e.key){
        case "ChannelUp":
        case "ArrowUp": zap(1); return;
        case "ChannelDown":
        case "ArrowDown": zap(-1); return;
        case "Return":
        case "Escape": stopPlayer(); return;
      }
      return;
    }

    switch(e.key){
      case "ArrowDown": S.focusRow++; S.focusCol=0; break;
      case "ArrowUp": S.focusRow--; S.focusCol=0; break;
      case "ArrowRight": S.focusCol++; break;
      case "ArrowLeft": S.focusCol--; break;
      case "Enter": 
        const row=S.rows[S.focusRow];
        const ch=row.items[S.focusCol];
        play(S.flat.indexOf(ch));
        return;
    }
    clamp();
    setFocus();
  }

  window.addEventListener("keydown", onKey);

  return { init };
})();

App.init();