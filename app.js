let channels = [];
let rowIndex = 0;
let colIndex = 0;
let mode = "browse";

async function loadChannels() {
  const res = await fetch("https://iptv-org.github.io/iptv/languages/telugu.m3u");
  const text = await res.text();

  channels = text.split("#EXTINF").slice(1).map(item => ({
    name: item.match(/,(.*)/)?.[1],
    logo: item.match(/tvg-logo="(.*?)"/)?.[1],
    url: item.split("\n")[1],
    group: item.match(/group-title="(.*?)"/)?.[1]
  }));

  render();
}

function groupData() {
  return {
    News: channels.filter(c => c.group?.includes("News")),
    Movies: channels.filter(c => c.group?.includes("Movies")),
    Entertainment: channels.filter(c => c.group?.includes("Entertainment")),
    All: channels
  };
}

function render() {
  if(mode==="player") return;

  const data = groupData();
  const app = document.getElementById("app");

  let rowsHTML = "";
  let rowKeys = Object.keys(data);

  rowKeys.forEach((key, r) => {
    rowsHTML += `
      <div class="row">
        <h2>${key}</h2>
        <div class="row-scroll">
          ${data[key].map((c,i)=>`
            <div class="tile ${(r===rowIndex && i===colIndex)?'active':''}">
              <img src="${c.logo}">
              <p>${c.name}</p>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  });

  const heroChannel = data[rowKeys[rowIndex]][colIndex];

  app.innerHTML = `
    <div class="hero">
      <video src="${heroChannel?.url}" autoplay muted loop></video>
      <div class="overlay">${heroChannel?.name}</div>
    </div>
    ${rowsHTML}
  `;
}

function play() {
  const data = groupData();
  const rowKeys = Object.keys(data);
  const ch = data[rowKeys[rowIndex]][colIndex];

  mode="player";
  document.body.innerHTML = `
    <div class="player">
      <video src="${ch.url}" controls autoplay style="width:100%;height:100%"></video>
    </div>
  `;
}

window.addEventListener("keydown", (e)=>{
  if(mode==="player" && e.keyCode===10009){ // back
    location.reload();
  }

  const data = groupData();
  const rowKeys = Object.keys(data);

  if(e.keyCode===39) colIndex++;
  if(e.keyCode===37) colIndex--;
  if(e.keyCode===40) { rowIndex++; colIndex=0; }
  if(e.keyCode===38) { rowIndex--; colIndex=0; }
  if(e.keyCode===13) play();

  if(rowIndex<0) rowIndex=0;
  if(rowIndex>=rowKeys.length) rowIndex=rowKeys.length-1;

  const maxCol = data[rowKeys[rowIndex]].length-1;
  if(colIndex<0) colIndex=0;
  if(colIndex>maxCol) colIndex=maxCol;

  render();
});

loadChannels();
