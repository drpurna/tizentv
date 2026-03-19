const PLAYLIST = "https://iptv-org.github.io/iptv/languages/tel.m3u";

const video = document.createElement("video");
video.style.position = "fixed";
video.style.inset = "0";
video.style.width = "100%";
video.style.height = "100%";
video.style.background = "black";
video.style.zIndex = "1";
video.autoplay = true;

document.body.appendChild(video);

const rowsEl = document.getElementById("rows");

let channels = [];

// 🔹 LOAD PLAYLIST
async function init() {
  const text = await fetch(PLAYLIST).then(r => r.text());
  channels = parse(text);
  render();
}

function parse(txt) {
  const lines = txt.split("\n");
  let res = [], meta = {};

  for (let l of lines) {
    l = l.trim();

    if (l.startsWith("#EXTINF")) {
      meta.name = l.split(",").pop();
    }
    else if (l && !l.startsWith("#")) {
      res.push({ ...meta, url: l });
    }
  }

  return res.slice(0, 50); // keep small for testing
}

// 🔹 RENDER SIMPLE GRID
function render() {
  rowsEl.innerHTML = "";

  channels.forEach((ch, i) => {

    const card = document.createElement("div");
    card.style.padding = "20px";
    card.style.margin = "10px";
    card.style.display = "inline-block";
    card.style.background = "#222";
    card.style.cursor = "pointer";

    card.textContent = ch.name;

    // 🔥 CLICK MUST WORK
    card.onclick = () => {
      console.log("CLICKED:", ch.name, ch.url);
      play(ch.url);
    };

    rowsEl.appendChild(card);
  });
}

// 🔹 PLAY (HTML5 ONLY — MOST RELIABLE TEST)
function play(url) {
  video.src = url;
  video.play().catch(() => {
    alert("Playback failed");
  });
}

init();