// ===== ELEMENTS =====
const grid = document.getElementById("grid");
const loader = document.getElementById("loader");
const player = document.getElementById("playerContainer");

// ===== STATE =====
let channels = [];
let categories = {};
let flatChannels = [];
let indexMap = new Map(); // fast index lookup

const PLAYLISTS = [
  { name: "Telugu", url: "https://iptv-org.github.io/iptv/languages/tel.m3u" },
  { name: "India", url: "https://iptv-org.github.io/iptv/countries/in.m3u" }
];

const cache = {};

// ===== INIT =====
renderPlaylists();
setTimeout(() => document.querySelector(".playlist-btn")?.click(), 300);

// ===== PLAYLIST UI =====
function renderPlaylists() {
  const bar = document.getElementById("playlistBar");
  bar.innerHTML = "";

  PLAYLISTS.forEach(p => {
    const btn = document.createElement("div");
    btn.className = "playlist-btn";
    btn.innerText = p.name;
    btn.tabIndex = 0;

    btn.onclick = () => loadPlaylist(p, btn);

    bar.appendChild(btn);
  });
}

// ===== LOAD PLAYLIST =====
async function loadPlaylist(p, btn) {

  loader.style.display = "block";
  grid.innerHTML = "";

  document.querySelectorAll(".playlist-btn")
    .forEach(b => b.classList.remove("active"));
  btn.classList.add("active");

  if (cache[p.url]) {
    channels = cache[p.url];
    finish();
    return;
  }

  try {
    const res = await fetch(p.url);
    const text = await res.text();

    channels = parseM3U(text);

    console.log("Channels loaded:", channels.length);

    cache[p.url] = channels;

    finish();

  } catch (e) {
    alert("Playlist failed");
  }
}

// ===== FAST PARSER (NO FILTER) =====
function parseM3U(data) {

  const lines = data.split("\n");
  const result = [];

  let name = "", logo = "", group = "";

  for (let i = 0; i < lines.length; i++) {

    const line = lines[i];

    if (line.startsWith("#EXTINF")) {

      name = line.split(",")[1] || "";

      const l = line.match(/tvg-logo="(.*?)"/);
      const g = line.match(/group-title="(.*?)"/);

      logo = l ? l[1] : "";
      group = g ? g[1] : "Other";

    } else if (line.startsWith("http")) {

      result.push({
        name,
        logo,
        group,
        url: line.trim()
      });
    }
  }

  return result;
}

// ===== BUILD CATEGORY (FAST + INDEX MAP) =====
function buildCategories() {

  categories = {};
  flatChannels = [];
  indexMap.clear();

  for (let i = 0; i < channels.length; i++) {

    const ch = channels[i];

    let cat = ch.group || "Other";

    if (cat.toLowerCase().includes("religion")) {
      cat = "Devotional";
    }

    if (!categories[cat]) categories[cat] = [];

    categories[cat].push(ch);

    indexMap.set(ch, flatChannels.length);
    flatChannels.push(ch);
  }
}

// ===== RENDER (OPTIMIZED) =====
function render() {

  grid.innerHTML = "";

  const fragment = document.createDocumentFragment();

  Object.keys(categories).forEach(cat => {

    const row = document.createElement("div");
    row.className = "row";

    const title = document.createElement("div");
    title.className = "row-title";
    title.innerText = cat;

    const items = document.createElement("div");
    items.className = "row-items";

    // 🚀 LIMIT PER ROW FOR PERFORMANCE
    const list = categories[cat].slice(0, 80);

    list.forEach(ch => {

      const index = indexMap.get(ch);

      const card = document.createElement("div");
      card.className = "card";
      card.tabIndex = 0;

      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = ch.logo || "https://via.placeholder.com/300x150?text=TV";
      img.onerror = () => img.src = "https://via.placeholder.com/300x150?text=TV";

      card.appendChild(img);

      card.onclick = () => play(ch.url, index);

      items.appendChild(card);
    });

    row.appendChild(title);
    row.appendChild(items);
    fragment.appendChild(row);
  });

  grid.appendChild(fragment);
}

// ===== FINISH =====
function finish() {
  buildCategories();
  render();
  loader.style.display = "none";
}

// ===== PLAY ENGINE (FAST + STABLE) =====
function play(url, index = 0) {

  if (!url) return;

  console.log("Play:", url);

  player.style.display = "block";
  loader.style.display = "block";

  try {
    webapis.avplay.stop();
    webapis.avplay.close();
  } catch(e) {}

  try {
    webapis.avplay.open(url);

    webapis.avplay.setListener({

      onbufferingstart: () => loader.style.display = "block",

      onbufferingcomplete: () => {
        loader.style.display = "none";
      },

      onstreamcompleted: () => playNext(index),

      onerror: () => playNext(index)

    });

    webapis.avplay.prepareAsync(() => {
      webapis.avplay.play();
    });

    // ⚡ FAST FAIL → QUICK SKIP
    setTimeout(() => {
      if (loader.style.display === "block") {
        playNext(index);
      }
    }, 6000);

  } catch (e) {
    playNext(index);
  }
}

// ===== AUTO SKIP (FAST LOOP) =====
function playNext(currentIndex) {

  for (let i = currentIndex + 1; i < flatChannels.length; i++) {

    const next = flatChannels[i];

    if (next && next.url) {
      play(next.url, i);
      return;
    }
  }

  alert("No playable channels");
}

// ===== REMOTE EXIT =====
document.addEventListener("keydown", e => {

  if (e.key === "Return") {

    player.style.display = "none";

    try {
      webapis.avplay.stop();
    } catch(e) {}

  }
});