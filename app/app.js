// ================================================================
// IPTV — app.js v7.2 | Samsung TV 2025 / TizenBrew
// ================================================================
// v7.2 Fixes:
// • VS viewport height measured after DOM paint (rAF) — fixes blank list
// • VS _paint guard: re-measure vh if still 0
// • JioTV click → modal shown correctly; stored token restored properly
// • JioTV API endpoints corrected (tv.media.jio.com)
// • Stream URL always re-fetched (no stale cache)
// • applyAutoAspect fires on playing + loadedmetadata (Tizen timing fix)
// • Smart AR: SD→Wide, native 16:9 HD→Cover, non-16:9 HD→Fit
// • Manual AR cycle preserved — auto only on first load of each channel
// • HLS.js replaced with Shaka Player (shaka.js in app folder)
// ================================================================

(function checkShaka(){
  if(window.shaka) console.log('[IPTV] Shaka Player', shaka.Player.version);
  else console.error('[IPTV] shaka.js MISSING — add shaka.js to app folder');
})();

/* ── DOM ──────────────────────────────────────────────────── */
const searchInput   = document.getElementById('searchInput');
const searchWrap    = document.getElementById('searchWrap');
const tabBar        = document.getElementById('tabBar');
const channelListEl = document.getElementById('channelList');
const countBadge    = document.getElementById('countBadge');
const nowPlayingEl  = document.getElementById('nowPlaying');
const npChNumEl     = document.getElementById('npChNum');
const statusBadge   = document.getElementById('statusBadge');
const video         = document.getElementById('video');
const videoWrap     = document.getElementById('videoWrap');
const videoOverlay  = document.getElementById('videoOverlay');
const fsHint        = document.getElementById('fsHint');
const loadBar       = document.getElementById('loadBar');
const chDialer      = document.getElementById('chDialer');
const chDialerNum   = document.getElementById('chDialerNum');
const arBtn         = document.getElementById('arBtn');

/* ── Playlists ───────────────────────────────────────────── */
const PLAYLISTS = [
  { name:'Telugu', url:'https://iptv-org.github.io/iptv/languages/tel.m3u' },
  { name:'India',  url:'https://iptv-org.github.io/iptv/countries/in.m3u'  },
];
const FAV_IDX    = 2;
const JIO_IDX    = 3;
const TOTAL_TABS = PLAYLISTS.length + 2; // 4
const FAV_KEY      = 'iptv:favs';
const PLAYLIST_KEY = 'iptv:lastPl';

/* ── Shaka Player config ─────────────────────────────────── */
const SHAKA_CFG = {
  streaming: {
    bufferingGoal: 30,
    rebufferingGoal: 4,
    bufferBehind: 20,
    retryParameters: {
      maxAttempts: 4,
      baseDelay: 500,
      backoffFactor: 2,
      fuzzFactor: 0.5,
      timeout: 12000,
    },
  },
  manifest: {
    retryParameters: {
      maxAttempts: 3,
      baseDelay: 500,
      backoffFactor: 2,
      fuzzFactor: 0.5,
      timeout: 15000,
    },
  },
  abr: {
    enabled: true,
    defaultBandwidthEstimate: 1000000,
  },
};

/* ── Aspect ratio modes ──────────────────────────────────── */
const AR_MODES = [
  { cls:'',         label:'Fit'  },
  { cls:'ar-fill',  label:'Fill' },
  { cls:'ar-cover', label:'Crop' },
  { cls:'ar-wide',  label:'Wide' },
];
let arIdx = 0;
let arManuallySet = false;

/* ── State ───────────────────────────────────────────────── */
let channels      = [];
let allChannels   = [];
let filtered      = [];
let selectedIndex = 0;
let focusArea     = 'list';
let shakaPlayer   = null;
let plIdx         = 0;
let isFullscreen  = false;
let hasPlayed     = false;
let fsHintTimer   = null;
let loadBarTimer  = null;
let previewTimer  = null;
const PREVIEW_DELAY = 700;
let dialBuffer = '';
let dialTimer  = null;

/* ── Jio TV state ────────────────────────────────────────── */
let jioChannels = [];
let jioToken    = null;

/* ── Jio API constants ───────────────────────────────────── */
const JIO_OTP_BASE     = 'https://tv.media.jio.com/apis/v2.0/loginotp';
const JIO_CHANNELS_URL = 'https://jiotv.data.cdn.jio.com/apis/v3.0/getMobileChannelList/get/?os=android&devicetype=phone&usertype=tvYR7NSNn7rymo3F&version=285';
const JIO_STREAM_BASE  = 'https://jiotvapi.media.jio.com/playback/apis/v1.1/geturl?langId=6';
const JIO_REFRESH_URL  = 'https://auth.media.jio.com/tokenservice/apis/v1/refreshtoken?langId=6';

function jioHeaders(tok) {
  const h = {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
    'os':           'android',
    'devicetype':   'phone',
    'versionCode':  '285',
    'User-Agent':   'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36',
    'Origin':       'https://jiotv.com',
    'Referer':      'https://jiotv.com/',
  };
  if (tok) {
    h['accessToken']   = tok.accessToken  || tok.ssoToken || '';
    h['ssoToken']      = tok.ssoToken     || '';
    h['subscriberId']  = tok.subscriberId || '';
    h['uniqueId']      = tok.uniqueId     || '';
    h['crm']           = tok.crm          || '';
    h['Authorization'] = 'Bearer ' + (tok.accessToken || tok.ssoToken || '');
  }
  return h;
}

/* ── Favourites ──────────────────────────────────────────── */
let favSet = new Set();
(function(){
  try{ const r = localStorage.getItem(FAV_KEY); if(r) favSet = new Set(JSON.parse(r)); }catch(e){}
})();
function saveFavs(){ try{ localStorage.setItem(FAV_KEY, JSON.stringify([...favSet])); }catch(e){} }
function favKey(ch){ return ch.channelId ? 'jio:'+ch.channelId : ch.url; }
function isFav(ch){ return favSet.has(favKey(ch)); }

function showFavourites(){
  filtered = allChannels.filter(c => favSet.has(favKey(c)));
  selectedIndex = 0;
  renderList();
  setStatus(filtered.length ? filtered.length + ' favourites' : 'No favourites yet', 'idle');
}

function toggleFav(ch){
  const k = favKey(ch);
  favSet.has(k) ? favSet.delete(k) : favSet.add(k);
  saveFavs();
  if(plIdx === FAV_IDX) showFavourites();
  VS.refresh();
  showToast(isFav(ch) ? '★ Added to Favourites' : '✕ Removed from Favourites');
}

/* ── Toast ───────────────────────────────────────────────── */
let toastEl = null, toastTm = null;
function showToast(msg){
  if(!toastEl){ toastEl = document.createElement('div'); toastEl.id = 'toast'; document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.style.opacity = '1';
  clearTimeout(toastTm); toastTm = setTimeout(() => { toastEl.style.opacity = '0'; }, 2200);
}

/* ── Status / load bar ───────────────────────────────────── */
function setStatus(t, c){ statusBadge.textContent = t; statusBadge.className = 'status-badge ' + (c || 'idle'); }

function startLoadBar(){
  clearTimeout(loadBarTimer);
  loadBar.style.width = '0%'; loadBar.classList.add('active');
  let w = 0;
  const tick = () => { w = Math.min(w + Math.random()*9, 85); loadBar.style.width = w+'%'; if(w < 85) loadBarTimer = setTimeout(tick, 220); };
  loadBarTimer = setTimeout(tick, 100);
}

function finishLoadBar(){
  clearTimeout(loadBarTimer); loadBar.style.width = '100%';
  setTimeout(() => { loadBar.classList.remove('active'); loadBar.style.width = '0%'; }, 400);
}

/* ── Clean channel name ──────────────────────────────────── */
function cleanName(raw){
  return raw
    .replace(/\s*[\[(][^\]*)]*[\])]/g, '')
    .replace(/\b(4K|UHD|FHD|HLS|HEVC|H264|H\.264|SD|HD|576[piP]?|720[piP]?|1080[piP]?|2160[piP]?)\b/gi, '')
    .replace(/[\|\-\u2013\u2014]+\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ── M3U parser ──────────────────────────────────────────── */
function parseM3U(text){
  const lines = text.split(/\r?\n/), out = []; let meta = null;
  for(const raw of lines){
    const line = raw.trim(); if(!line) continue;
    if(line.startsWith('#EXTINF')){
      const namePart = line.includes(',') ? line.split(',').slice(1).join(',').trim() : 'Unknown';
      const gm = line.match(/group-title="([^"]+)"/i);
      const lm = line.match(/tvg-logo="([^"]+)"/i);
      meta = { name: cleanName(namePart) || namePart, group: gm ? gm[1] : 'Other', logo: lm ? lm[1] : '' };
      continue;
    }
    if(!line.startsWith('#') && meta){ out.push({ name:meta.name, group:meta.group, logo:meta.logo, url:line }); meta = null; }
  }
  return out;
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function initials(n){ return n.replace(/[^a-zA-Z0-9]/g,' ').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?'; }

/* ================================================================
   VIRTUAL SCROLL ENGINE v3.1
   FIX: vh measured after first rAF so DOM is fully laid out
================================================================ */
const VS = {
  ITEM_H: 88,
  OVERSCAN: 6,
  c:null, inner:null, vh:0, st:0, total:0,
  rs:-1, re:-1, nodes:[], raf:null,

  init(el){
    this.c = el;
    this.inner = document.createElement('div');
    this.inner.id = 'vsInner';
    this.c.appendChild(this.inner);

    const measureVh = () => {
      this.vh = this.c.clientHeight || this.c.offsetHeight || 700;
      if(this.vh < 10){ requestAnimationFrame(measureVh); }
    };
    requestAnimationFrame(measureVh);

    this.c.addEventListener('scroll', () => {
      if(this.raf) return;
      this.raf = requestAnimationFrame(() => {
        this.raf = null;
        this.st = this.c.scrollTop;
        this._paint();
      });
    }, { passive: true });

    window.addEventListener('resize', () => {
      this.vh = this.c.clientHeight || 700;
      this.rs = -1; this.re = -1;
      this._paint();
    });
  },

  setData(n){
    this.total = n; this.rs = -1; this.re = -1;
    this.inner.textContent = ''; this.nodes = [];
    this.inner.style.cssText = 'position:relative;width:100%;height:' + (n*this.ITEM_H) + 'px;';
    this.c.scrollTop = 0; this.st = 0;
    this.vh = this.c.clientHeight || this.c.offsetHeight || 700;
    this._paint();
  },

  scrollToIndex(idx){
    const top = idx*this.ITEM_H, bot = top+this.ITEM_H, st = this.c.scrollTop;
    if(top < st) this.c.scrollTop = top;
    else if(bot > st + this.vh) this.c.scrollTop = bot - this.vh;
    this.st = this.c.scrollTop;
    this._paint();
  },

  scrollToIndexCentered(idx){
    const center = idx*this.ITEM_H - (this.vh/2) + (this.ITEM_H/2);
    this.c.scrollTop = Math.max(0, center);
    this.st = this.c.scrollTop;
    this.rs = -1; this.re = -1;
    this._paint();
  },

  _paint(){
    if(!this.total) return;
    if(this.vh < 10){
      this.vh = this.c.clientHeight || this.c.offsetHeight || 700;
      if(this.vh < 10){ requestAnimationFrame(() => this._paint()); return; }
    }
    const H = this.ITEM_H, os = this.OVERSCAN;
    const start = Math.max(0, Math.floor(this.st/H) - os);
    const end   = Math.min(this.total-1, Math.ceil((this.st+this.vh)/H) + os);
    if(start === this.rs && end === this.re) return;
    this.rs = start; this.re = end;

    this.nodes = this.nodes.filter(nd => {
      if(nd._i < start || nd._i > end){ this.inner.removeChild(nd); return false; }
      return true;
    });

    const have = new Set(this.nodes.map(n => n._i));
    const frag = document.createDocumentFragment();
    for(let i = start; i <= end; i++){ if(!have.has(i)) frag.appendChild(this._build(i)); }
    if(frag.childNodes.length) this.inner.appendChild(frag);
    this.nodes = [...this.inner.children];

    const sel = selectedIndex;
    for(const nd of this.nodes){
      const on = nd._i === sel;
      if(on !== nd._on){
        nd._on = on;
        nd.classList.toggle('active', on);
        if(nd._nm) nd._nm.style.color = on ? '#000' : '';
        if(nd._nu) nd._nu.style.color = on ? '#999' : '';
      }
    }
  },

  _build(i){
    const ch = filtered[i];
    const li = document.createElement('li');
    li._i = i; li._on = false;
    li.style.cssText = 'position:absolute;top:'+(i*this.ITEM_H)+'px;left:0;right:0;height:'+this.ITEM_H+'px;';

    const ini  = esc(initials(ch.name));
    const logo = ch.logo
      ? `<div class="ch-logo"><img src="${esc(ch.logo)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextSibling.style.display='flex'"/><span class="ch-logo-fb" style="display:none">${ini}</span></div>`
      : `<div class="ch-logo"><span class="ch-logo-fb">${ini}</span></div>`;

    li.innerHTML = logo
      + `<div class="ch-info"><div class="ch-name">${esc(ch.name)}</div></div>`
      + (isFav(ch) ? '<span class="ch-fav">\u2605</span>' : '')
      + `<span class="ch-num">${i+1}</span>`;

    li._nm = li.querySelector('.ch-name');
    li._nu = li.querySelector('.ch-num');

    if(i === selectedIndex){
      li._on = true; li.classList.add('active');
      if(li._nm) li._nm.style.color = '#000';
      if(li._nu) li._nu.style.color = '#999';
    }

    li.addEventListener('click', () => { selectedIndex = i; VS.refresh(); schedulePreview(); });
    return li;
  },

  refresh(){ this.rs = -1; this.re = -1; this._paint(); },
};

/* ── Render list ─────────────────────────────────────────── */
function renderList(){
  countBadge.textContent = filtered.length;
  if(!filtered.length){
    VS.setData(0);
    const li = document.createElement('li');
    li.style.cssText = 'position:absolute;top:0;left:0;right:0;padding:24px 16px;color:#444;';
    li.textContent = 'No channels';
    VS.inner.appendChild(li);
    return;
  }
  VS.setData(filtered.length);
  VS.scrollToIndex(selectedIndex);
}

/* ── Search ──────────────────────────────────────────────── */
let sdTm = null;
function applySearch(){
  clearTimeout(sdTm);
  sdTm = setTimeout(() => {
    const q = searchInput.value.trim().toLowerCase();
    const src = plIdx === JIO_IDX
      ? jioChannels
      : plIdx === FAV_IDX
        ? allChannels.filter(c => favSet.has(favKey(c)))
        : channels;
    filtered = !q ? src.slice() : src.filter(c => c.name.toLowerCase().includes(q) || (c.group||'').toLowerCase().includes(q));
    selectedIndex = 0;
    renderList();
  }, 120);
}
function commitSearch(){ setFocus('list'); if(filtered.length === 1){ selectedIndex = 0; VS.refresh(); schedulePreview(); } }
function clearSearch(){ searchInput.value = ''; applySearch(); setFocus('list'); }
searchInput.addEventListener('input', applySearch);

/* ── XHR ─────────────────────────────────────────────────── */
function xhrFetch(url, ms, cb){
  let done = false;
  const xhr = new XMLHttpRequest();
  const tid = setTimeout(() => { if(done)return; done=true; xhr.abort(); cb(new Error('Timeout'), null); }, ms);
  xhr.onreadystatechange = function(){
    if(xhr.readyState !== 4 || done) return;
    done = true; clearTimeout(tid);
    xhr.status >= 200 && xhr.status < 400 ? cb(null, xhr.responseText) : cb(new Error('HTTP '+xhr.status), null);
  };
  xhr.onerror = function(){ if(done)return; done=true; clearTimeout(tid); cb(new Error('Net'), null); };
  xhr.open('GET', url, true); xhr.send();
}

function mirrorUrl(url){
  try{
    const u = new URL(url);
    if(u.hostname !== 'raw.githubusercontent.com') return null;
    const p = u.pathname.split('/').filter(Boolean);
    if(p.length < 4) return null;
    return 'https://cdn.jsdelivr.net/gh/'+p[0]+'/'+p[1]+'@'+p[2]+'/'+p.slice(3).join('/');
  }catch(e){ return null; }
}

/* ── Load playlist ───────────────────────────────────────── */
function loadPlaylist(urlOv){
  cancelPreview();
  if(plIdx === FAV_IDX && !urlOv){ showFavourites(); return; }
  const url = urlOv || PLAYLISTS[plIdx].url;
  setStatus('Loading\u2026', 'loading'); startLoadBar();
  xhrFetch(url, 25000, (err, text) => {
    if(err){
      const m = mirrorUrl(url);
      if(m){ setStatus('Retrying\u2026','loading'); xhrFetch(m, 25000, (e2,t2) => { finishLoadBar(); e2 ? setStatus('Failed','error') : onLoaded(t2); }); }
      else{ finishLoadBar(); setStatus('Failed','error'); }
      return;
    }
    finishLoadBar(); onLoaded(text);
  });
}

function onLoaded(text){
  channels = parseM3U(text);
  const seen = new Set(allChannels.map(c => c.url));
  channels.forEach(c => { if(!seen.has(c.url)) allChannels.push(c); });
  filtered = channels.slice(); selectedIndex = 0; renderList();
  try{ localStorage.setItem(PLAYLIST_KEY, String(plIdx)); }catch(e){}
  setStatus('Ready \u00b7 ' + channels.length + ' ch', 'idle');
  setFocus('list');
}

/* ================================================================
   ASPECT RATIO
   SD (<=576p)          → Wide  (stretch to fill 16:9)
   Native 16:9 HD       → Cover (fills screen, no black bars)
   Non-16:9 HD          → Fit   (preserve AR, show bars)
   Manual cycle always overrides auto until next channel load.
================================================================ */
function setAR(idx, label){
  video.classList.remove('ar-fill','ar-cover','ar-wide');
  arIdx = idx;
  const m = AR_MODES[idx];
  if(m.cls) video.classList.add(m.cls);
  arBtn.textContent = '\u26f6 ' + m.label;
  arBtn.className = 'ar-btn' + (m.cls ? ' '+m.cls : '');
  if(label) showToast(label);
}

function resetAspectRatio(){
  arManuallySet = false;
  setAR(0);
}

function applyAutoAspect(){
  if(arManuallySet) return;
  const W = video.videoWidth;
  const H = video.videoHeight;
  if(!W || !H) return;

  const streamAR = W / H;
  const screenAR = 16 / 9;

  if(H <= 576){
    const wideIdx = AR_MODES.findIndex(m => m.cls === 'ar-wide');
    if(arIdx !== wideIdx) setAR(wideIdx, `Auto Wide (${H}p)`);
  } else if(Math.abs(streamAR - screenAR) < 0.08){
    const coverIdx = AR_MODES.findIndex(m => m.cls === 'ar-cover');
    if(arIdx !== coverIdx) setAR(coverIdx, `Auto Fill (${W}\u00d7${H})`);
  } else {
    if(arIdx !== 0) setAR(0, `Auto Fit (${W}\u00d7${H})`);
  }
}

function cycleAR(){
  arManuallySet = true;
  video.classList.remove('ar-fill','ar-cover','ar-wide');
  arIdx = (arIdx + 1) % AR_MODES.length;
  const m = AR_MODES[arIdx];
  if(m.cls) video.classList.add(m.cls);
  arBtn.textContent = '\u26f6 ' + m.label;
  arBtn.className = 'ar-btn' + (m.cls ? ' '+m.cls : '');
  showToast('Aspect: ' + m.label);
}
arBtn.addEventListener('click', cycleAR);
function setARFocus(on){ arBtn.classList.toggle('focused', on); }

/* ================================================================
   PREVIEW / PLAYBACK — Shaka Player
================================================================ */
let previewLock = false;

function cancelPreview(){ clearTimeout(previewTimer); previewTimer = null; }

async function destroyPlayer(){
  if(!shakaPlayer) return;
  try{ await shakaPlayer.destroy(); }catch(e){}
  shakaPlayer = null;
}

function schedulePreview(){
  cancelPreview();
  previewTimer = setTimeout(() => {
    previewTimer = null;
    if(previewLock) return;
    startPreview(selectedIndex);
  }, PREVIEW_DELAY);
}

function startPreview(idx){
  if(!filtered.length) return;
  const ch = filtered[idx];
  if(!ch) return;

  if(ch.channelId){
    if(!jioToken){ showJioLoginModal(); return; }
    if(jioToken.expires && jioToken.expires <= Date.now()){
      localStorage.removeItem('jioToken'); jioToken = null;
      showJioLoginModal(); return;
    }
    ch.url = null;
    setStatus('Fetching stream\u2026', 'loading');
    startLoadBar();
    jioGetStreamUrl(ch.channelId)
      .then(url => { ch.url = url; doPlayPreview(ch, idx); })
      .catch(err => { finishLoadBar(); setStatus('Jio stream error: ' + err.message, 'error'); });
    return;
  }

  doPlayPreview(ch, idx);
}

async function doPlayPreview(ch, idx){
  resetAspectRatio();

  nowPlayingEl.textContent = ch.name;
  npChNumEl.textContent = 'CH ' + (idx+1);
  videoOverlay.classList.add('hidden');
  hasPlayed = true;
  setStatus('Buffering\u2026', 'loading');
  startLoadBar();

  previewLock = true;
  await destroyPlayer();
  video.removeAttribute('src');
  video.load();
  previewLock = false;

  const url = ch.url;

  const onMeta = () => { applyAutoAspect(); };
  const onPlay = () => {
    video.removeEventListener('playing', onPlay);
    applyAutoAspect();
  };
  video.addEventListener('loadedmetadata', onMeta, { once: true });
  video.addEventListener('playing', onPlay);

  if(!window.shaka || !shaka.Player.isBrowserSupported()){
    setStatus('Shaka unsupported', 'error');
    finishLoadBar();
    return;
  }

  try{
    shakaPlayer = new shaka.Player();
    await shakaPlayer.attach(video);
    shakaPlayer.configure(SHAKA_CFG);

    shakaPlayer.addEventListener('error', e => {
      const err = e.detail;
      console.error('[Shaka] Error', err.code, err.message);
      if(err.severity === shaka.util.Error.Severity.CRITICAL){
        setStatus('Stream error ' + err.code, 'error');
        finishLoadBar();
      } else {
        setStatus('Buffering\u2026', 'loading');
      }
    });

    shakaPlayer.addEventListener('buffering', e => {
      if(e.buffering){ setStatus('Buffering\u2026','loading'); startLoadBar(); }
    });

    await shakaPlayer.load(url);
    video.play().catch(() => {});
  }catch(e){
    console.error('[Shaka] Load error:', e);
    finishLoadBar();
    setStatus('Play error: ' + (e.message || e.code || 'unknown'), 'error');
  }
}

function playSelected(){ cancelPreview(); startPreview(selectedIndex); }

/* ── Navigation ──────────────────────────────────────────── */
function moveSel(d){
  if(!filtered.length) return;
  cancelPreview();
  selectedIndex = Math.max(0, Math.min(filtered.length-1, selectedIndex+d));
  VS.scrollToIndex(selectedIndex);
  VS.refresh();
  schedulePreview();
}

function setFocus(a){
  focusArea = a;
  setARFocus(a === 'ar');
  if(a === 'search'){ searchWrap.classList.add('active'); searchInput.focus(); }
  else{ searchWrap.classList.remove('active'); if(document.activeElement === searchInput) searchInput.blur(); }
}

/* ── Tab switch ──────────────────────────────────────────── */
function switchTab(idx){
  plIdx = idx;
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', i === idx));
  if(idx === JIO_IDX){ handleJioTab(); }
  else{ loadPlaylist(); }
}
tabBar.querySelectorAll('.tab').forEach((b,i) => b.addEventListener('click', () => switchTab(i)));

/* ── Number dial ─────────────────────────────────────────── */
function handleDigit(d){
  clearTimeout(dialTimer);
  dialBuffer += d;
  chDialerNum.textContent = dialBuffer;
  chDialer.classList.add('visible');
  dialTimer = setTimeout(() => {
    const num = parseInt(dialBuffer, 10);
    dialBuffer = '';
    chDialer.classList.remove('visible');
    if(!filtered.length || isNaN(num)) return;
    const idx = Math.max(0, Math.min(filtered.length-1, num-1));
    cancelPreview(); selectedIndex = idx;
    VS.scrollToIndexCentered(idx);
    playSelected();
    showToast('CH '+(idx+1)+' \u2014 '+filtered[idx].name);
  }, 1500);
}

/* ── Fullscreen ──────────────────────────────────────────── */
function showFsHint(){ clearTimeout(fsHintTimer); fsHint.classList.add('visible'); fsHintTimer = setTimeout(() => fsHint.classList.remove('visible'), 3000); }
function enterFS(){
  const fn = videoWrap.requestFullscreen || videoWrap.webkitRequestFullscreen || videoWrap.mozRequestFullScreen;
  if(fn){ try{ fn.call(videoWrap); }catch(e){} }
  document.body.classList.add('fullscreen'); isFullscreen = true; showFsHint();
}
function exitFS(){
  const fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
  if(fn){ try{ fn.call(document); }catch(e){} }
  document.body.classList.remove('fullscreen'); isFullscreen = false; fsHint.classList.remove('visible');
}
function toggleFS(){ isFullscreen ? exitFS() : enterFS(); }

document.addEventListener('fullscreenchange', () => { isFullscreen = !!(document.fullscreenElement||document.webkitFullscreenElement); if(!isFullscreen){ document.body.classList.remove('fullscreen'); fsHint.classList.remove('visible'); } });
document.addEventListener('webkitfullscreenchange', () => { isFullscreen = !!(document.webkitFullscreenElement||document.fullscreenElement); if(!isFullscreen){ document.body.classList.remove('fullscreen'); fsHint.classList.remove('visible'); } });
video.addEventListener('dblclick', toggleFS);

/* ── Video events ────────────────────────────────────────── */
video.addEventListener('playing', () => { setStatus('Playing','playing'); finishLoadBar(); });
video.addEventListener('pause',   () => setStatus('Paused','paused'));
video.addEventListener('waiting', () => { setStatus('Buffering\u2026','loading'); startLoadBar(); });
video.addEventListener('stalled', () => setStatus('Buffering\u2026','loading'));
video.addEventListener('error',   () => { setStatus('Error','error'); finishLoadBar(); });

/* ── Tizen key registration ──────────────────────────────── */
(function(){
  try{
    if(window.tizen && tizen.tvinputdevice){
      ['MediaPlay','MediaPause','MediaPlayPause','MediaStop','MediaFastForward','MediaRewind',
       'ColorF0Red','ColorF1Green','ColorF2Yellow','ColorF3Blue','ChannelUp','ChannelDown','Back',
       '0','1','2','3','4','5','6','7','8','9']
      .forEach(k => { try{ tizen.tvinputdevice.registerKey(k); }catch(e){} });
    }
  }catch(e){}
})();

/* ── Keyboard / remote ───────────────────────────────────── */
window.addEventListener('keydown', e => {
  const k = e.key, c = e.keyCode;

  if((c>=48&&c<=57)||(c>=96&&c<=105)){
    if(focusArea !== 'search'){ handleDigit(String(c>=96?c-96:c-48)); e.preventDefault(); return; }
  }

  if(k==='Escape'||k==='Back'||k==='GoBack'||c===10009||c===27){
    if(isFullscreen){ exitFS(); e.preventDefault(); return; }
    if(focusArea==='ar'){ setFocus('list'); e.preventDefault(); return; }
    if(focusArea==='search'){ clearSearch(); e.preventDefault(); return; }
    try{ if(window.tizen) tizen.application.getCurrentApplication().exit(); }catch(ex){}
    e.preventDefault(); return;
  }

  if(focusArea==='ar'){
    if(k==='Enter'||c===13){ cycleAR(); e.preventDefault(); return; }
    if(k==='ArrowLeft'||c===37||k==='ArrowDown'||c===40){ setFocus('list'); e.preventDefault(); return; }
    if(k==='ArrowRight'||c===39||k==='ArrowUp'||c===38){ cycleAR(); e.preventDefault(); return; }
    e.preventDefault(); return;
  }

  if(focusArea==='search'){
    if(k==='Enter'||c===13){ commitSearch(); e.preventDefault(); return; }
    if(k==='ArrowDown'||k==='ArrowUp'||c===40||c===38){ commitSearch(); }
    else return;
  }

  if(k==='ArrowUp'  ||c===38){ isFullscreen?showFsHint():moveSel(-1);  e.preventDefault(); return; }
  if(k==='ArrowDown'||c===40){ isFullscreen?showFsHint():moveSel(1);   e.preventDefault(); return; }
  if(k==='ArrowLeft'||c===37){ isFullscreen?exitFS():setFocus('list'); e.preventDefault(); return; }
  if(k==='ArrowRight'||c===39){
    if(isFullscreen){ showFsHint(); e.preventDefault(); return; }
    setFocus('ar'); e.preventDefault(); return;
  }

  if(k==='Enter'||c===13){
    if(isFullscreen){ exitFS(); e.preventDefault(); return; }
    if(focusArea==='list'){ playSelected(); setTimeout(() => { if(hasPlayed) enterFS(); }, 600); }
    e.preventDefault(); return;
  }

  if(k==='PageUp')  { moveSel(-10); e.preventDefault(); return; }
  if(k==='PageDown'){ moveSel(10);  e.preventDefault(); return; }

  if(k==='MediaPlayPause'||c===10252){ video.paused?video.play().catch(()=>{}):video.pause(); e.preventDefault(); return; }
  if(k==='MediaPlay'     ||c===415)  { video.play().catch(()=>{}); e.preventDefault(); return; }
  if(k==='MediaPause'    ||c===19)   { video.pause(); e.preventDefault(); return; }
  if(k==='MediaStop'     ||c===413)  { cancelPreview(); destroyPlayer(); video.pause(); video.removeAttribute('src'); video.load(); setStatus('Stopped','idle'); finishLoadBar(); e.preventDefault(); return; }
  if(k==='MediaFastForward'||c===417){ moveSel(1);  e.preventDefault(); return; }
  if(k==='MediaRewind'   ||c===412)  { moveSel(-1); e.preventDefault(); return; }
  if(k==='ChannelUp'     ||c===427)  { moveSel(1);  e.preventDefault(); return; }
  if(k==='ChannelDown'   ||c===428)  { moveSel(-1); e.preventDefault(); return; }

  if(k==='ColorF0Red'  ||c===403){ switchTab((plIdx+1) % TOTAL_TABS); e.preventDefault(); return; }
  if(k==='ColorF1Green'||c===404){ if(filtered.length&&focusArea==='list') toggleFav(filtered[selectedIndex]); e.preventDefault(); return; }
  if(k==='ColorF2Yellow'||c===405){ setFocus('search'); e.preventDefault(); return; }
  if(k==='ColorF3Blue' ||c===406){ if(hasPlayed) toggleFS(); e.preventDefault(); return; }
});

/* ================================================================
   JIO TV API
================================================================ */
async function jioFetch(url, opts){
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 15000);
  try{
    const res = await fetch(url, { ...opts, signal: ctrl.signal, mode:'cors', credentials:'omit' });
    clearTimeout(tid);
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  }catch(err){
    clearTimeout(tid); throw err;
  }
}

async function jioRequestOtp(mobile){
  const data = await jioFetch(`${JIO_OTP_BASE}/sendotp`, {
    method:'POST', headers: jioHeaders(null),
    body: JSON.stringify({ number: mobile }),
  });
  const id = data.OTPId || data.otpId || data.requestId;
  if(!id) throw new Error(data.message || 'No OTP ID returned');
  return id;
}

async function jioVerifyOtp(mobile, otp, otpId){
  const data = await jioFetch(`${JIO_OTP_BASE}/verifyotp`, {
    method:'POST', headers: jioHeaders(null),
    body: JSON.stringify({ number: mobile, otp, otpId }),
  });
  const accessToken  = data.authToken    || data.access_token  || data.accessToken;
  const ssoToken     = data.ssoToken     || data.sso_token     || accessToken;
  const refreshToken = data.refreshToken || data.refresh_token || '';
  const expiresIn    = data.tokenExpiry  || data.expires_in    || 3600;
  const user         = (data.sessionAttributes && data.sessionAttributes.user) || {};
  if(!accessToken) throw new Error(data.message || 'Login failed');
  return { accessToken, ssoToken, refreshToken, expiresIn,
           subscriberId: user.subscriberId||'', uniqueId: user.uniqueId||'', crm: user.subscriberId||'' };
}

async function jioRefreshToken(){
  const data = await jioFetch(JIO_REFRESH_URL, {
    method:'POST', headers: jioHeaders(jioToken),
    body: JSON.stringify({ refreshToken: jioToken.refreshToken }),
  });
  const accessToken = data.authToken || data.access_token || data.accessToken;
  if(!accessToken) throw new Error('Refresh failed');
  jioToken.accessToken = accessToken;
  jioToken.ssoToken    = data.ssoToken || jioToken.ssoToken;
  jioToken.expires     = Date.now() + ((data.tokenExpiry||data.expires_in||3600)*1000);
  localStorage.setItem('jioToken', JSON.stringify(jioToken));
}

async function jioEnsureToken(){
  if(!jioToken) throw new Error('Not logged in');
  if(jioToken.expires && jioToken.expires - Date.now() < 120000){
    try{ await jioRefreshToken(); }catch(e){ console.warn('Token refresh failed:', e.message); }
  }
}

async function jioGetStreamUrl(channelId, quality){
  await jioEnsureToken();
  quality = quality || 'HD';
  const data = await jioFetch(`${JIO_STREAM_BASE}&channelId=${channelId}&quality=${quality}`, {
    headers: jioHeaders(jioToken),
  });
  const url = data.result || data.url || data.stream_url || data.streamUrl;
  if(!url) throw new Error(data.message || 'No stream URL');
  return url;
}

async function loadJioChannels(){
  if(!jioToken) return false;
  try{
    setStatus('Fetching Jio channels\u2026','loading'); startLoadBar();
    await jioEnsureToken();
    const data = await jioFetch(JIO_CHANNELS_URL, { headers: jioHeaders(jioToken) });
    const list = data.result || data.channels || data.channel_list || [];
    if(!list.length) throw new Error('Empty channel list');
    jioChannels = list.map(ch => ({
      name:      ch.channel_name || ch.channelName || ch.name || 'Unknown',
      logo:      ch.logoUrl      || ch.logo_url    || ch.logo || '',
      channelId: ch.channel_id   || ch.channelId,
      group:     ch.genre        || ch.category    || 'Jio TV',
      url:       null,
    }));
    jioChannels.forEach(c => { if(!allChannels.find(x => x.channelId === c.channelId)) allChannels.push(c); });
    channels = jioChannels.slice();
    filtered = channels.slice();
    selectedIndex = 0;
    finishLoadBar(); renderList();
    setStatus(`Jio TV \u00b7 ${channels.length} channels`, 'idle');
    return true;
  }catch(err){
    finishLoadBar();
    setStatus('Jio error: ' + err.message, 'error');
    console.error('loadJioChannels:', err);
    return false;
  }
}

/* ── Jio login modal ─────────────────────────────────────── */
function showJioLoginModal(){
  const modal     = document.getElementById('jioModal');
  const step1     = document.getElementById('jioLoginStep1');
  const step2     = document.getElementById('jioLoginStep2');
  const statusDiv = document.getElementById('jioStatus');
  const mobileIn  = document.getElementById('jioMobile');
  const otpIn     = document.getElementById('jioOtp');
  const reqBtn    = document.getElementById('jioRequestOtp');
  const verifyBtn = document.getElementById('jioVerifyOtp');
  const closeBtn  = document.getElementById('jioCloseModal');

  step1.style.display = 'block'; step2.style.display = 'none';
  statusDiv.innerHTML = ''; mobileIn.value = ''; otpIn.value = '';
  let otpId = null;

  reqBtn.onclick = async () => {
    const mobile = mobileIn.value.trim();
    if(!/^\d{10}$/.test(mobile)){ statusDiv.innerHTML = '<span style="color:#e50000">Enter a valid 10-digit mobile number</span>'; return; }
    statusDiv.innerHTML = 'Sending OTP\u2026'; reqBtn.disabled = true;
    try{
      otpId = await jioRequestOtp(mobile);
      statusDiv.innerHTML = 'OTP sent to +91' + mobile;
      step1.style.display = 'none'; step2.style.display = 'block';
      setTimeout(() => { try{ otpIn.focus(); }catch(e){} }, 100);
    }catch(err){ statusDiv.innerHTML = '<span style="color:#e50000">Error: '+err.message+'</span>'; }
    finally{ reqBtn.disabled = false; }
  };

  verifyBtn.onclick = async () => {
    const mobile = mobileIn.value.trim(), otp = otpIn.value.trim();
    if(!otp){ statusDiv.innerHTML = '<span style="color:#e50000">Enter the OTP</span>'; return; }
    statusDiv.innerHTML = 'Verifying\u2026'; verifyBtn.disabled = true;
    try{
      const t = await jioVerifyOtp(mobile, otp, otpId);
      jioToken = {
        accessToken: t.accessToken, ssoToken: t.ssoToken,
        refreshToken: t.refreshToken, subscriberId: t.subscriberId,
        uniqueId: t.uniqueId, crm: t.crm,
        expires: Date.now() + (t.expiresIn * 1000),
      };
      localStorage.setItem('jioToken', JSON.stringify(jioToken));
      statusDiv.innerHTML = '\u2713 Login successful! Loading channels\u2026';
      modal.style.display = 'none';
      await loadJioChannels();
      setFocus('list');
    }catch(err){ statusDiv.innerHTML = '<span style="color:#e50000">Error: '+err.message+'</span>'; }
    finally{ verifyBtn.disabled = false; }
  };

  closeBtn.onclick = () => {
    modal.style.display = 'none';
    if(plIdx === JIO_IDX && !jioChannels.length) switchTab(0);
  };

  modal.style.display = 'flex';
  setTimeout(() => { try{ mobileIn.focus(); }catch(e){} }, 100);
}

function handleJioTab(){
  if(jioChannels.length){
    channels = jioChannels.slice(); filtered = channels.slice();
    selectedIndex = 0; renderList();
    setStatus(`Jio TV \u00b7 ${channels.length} channels`, 'idle');
    setFocus('list');
  } else if(jioToken && jioToken.expires > Date.now()){
    loadJioChannels();
  } else {
    if(jioToken){ localStorage.removeItem('jioToken'); jioToken = null; }
    showJioLoginModal();
  }
}

/* ── Init Jio from stored token ──────────────────────────── */
async function initJio(){
  const stored = localStorage.getItem('jioToken');
  if(!stored) return;
  try{
    const t = JSON.parse(stored);
    if(!t.accessToken && !t.ssoToken){ localStorage.removeItem('jioToken'); return; }
    jioToken = t;
    if(t.expires && t.expires <= Date.now()){
      if(t.refreshToken){
        try{ await jioRefreshToken(); }
        catch(e){ localStorage.removeItem('jioToken'); jioToken = null; return; }
      } else {
        localStorage.removeItem('jioToken'); jioToken = null; return;
      }
    }
    if(plIdx === JIO_IDX) await loadJioChannels();
  }catch(e){ localStorage.removeItem('jioToken'); jioToken = null; }
}

/* ── Init ────────────────────────────────────────────────── */
(function init(){
  if(window.shaka) shaka.polyfill.installAll();

  try{
    const s = localStorage.getItem(PLAYLIST_KEY);
    if(s) plIdx = Math.min(parseInt(s,10)||0, TOTAL_TABS-1);
  }catch(e){}
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', i === plIdx));
  VS.init(channelListEl);
  if(plIdx === JIO_IDX){
    initJio().then(() => { if(!jioChannels.length) handleJioTab(); });
  } else {
    loadPlaylist();
    initJio();
  }
})();
