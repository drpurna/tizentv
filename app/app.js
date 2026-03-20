/* ================================================================
IPTV v1.0.1 — app.js  (FIXED BUILD)
Fixes:

- App not launching (DOMContentLoaded guard, no ES2020 syntax)
- Laggy channels (virtual list, no full innerHTML rebuild on nav)
- Stream not working (AVPlay → native HLS → hls.js → direct)
- Playlist switch broken (loadPlaylist reads input correctly)
- URL/Search focus trap (Escape/Back returns to list)
- Double-click / Enter in player → fullscreen toggle
  ================================================================ */

‘use strict’;

var DEFAULT_PLAYLISTS = [
{ label: ‘Telugu’,  url: ‘https://iptv-org.github.io/iptv/languages/tel.m3u’ },
{ label: ‘Hindi’,   url: ‘https://iptv-org.github.io/iptv/languages/hin.m3u’ },
{ label: ‘English’, url: ‘https://iptv-org.github.io/iptv/languages/eng.m3u’ },
{ label: ‘Kids’,    url: ‘https://iptv-org.github.io/iptv/categories/kids.m3u’ },
{ label: ‘News’,    url: ‘https://iptv-org.github.io/iptv/categories/news.m3u’ },
{ label: ‘Sports’,  url: ‘https://iptv-org.github.io/iptv/categories/sports.m3u’ },
{ label: ‘Movies’,  url: ‘https://iptv-org.github.io/iptv/categories/movies.m3u’ },
];

var SK_URL   = ‘iptv:lastUrl’;
var SK_VOL   = ‘iptv:vol’;
var SK_PLIDX = ‘iptv:plIdx’;

document.addEventListener(‘DOMContentLoaded’, function () {

/* ── DOM refs ── */
var playlistUrlEl    = document.getElementById(‘playlistUrl’);
var loadBtn          = document.getElementById(‘loadBtn’);
var defaultBtn       = document.getElementById(‘defaultBtn’);
var searchInput      = document.getElementById(‘searchInput’);
var channelListEl    = document.getElementById(‘channelList’);
var countBadge       = document.getElementById(‘countBadge’);
var nowPlayingEl     = document.getElementById(‘nowPlaying’);
var nowGroupEl       = document.getElementById(‘nowGroup’);
var statusPill       = document.getElementById(‘statusPill’);
var statusTextEl     = document.getElementById(‘statusText’);
var video            = document.getElementById(‘video’);
var idleScreen       = document.getElementById(‘idleScreen’);
var videoOverlay     = document.getElementById(‘videoOverlay’);
var overlayChannel   = document.getElementById(‘overlayChannel’);
var overlayStatus    = document.getElementById(‘overlayStatus’);
var bufferingSpinner = document.getElementById(‘bufferingSpinner’);
var playPauseBtn     = document.getElementById(‘playPauseBtn’);
var stopBtn          = document.getElementById(‘stopBtn’);
var prevBtn          = document.getElementById(‘prevBtn’);
var nextBtn          = document.getElementById(‘nextBtn’);
var volSlider        = document.getElementById(‘volSlider’);
var qualityInfo      = document.getElementById(‘qualityInfo’);
var videoWrap        = document.getElementById(‘videoWrap’);

/* ── State ── */
var channels     = [];
var filtered     = [];
var selIdx       = 0;
var focusArea    = ‘list’;  // ‘list’ | ‘url’ | ‘search’ | ‘player’
var hls          = null;
var osdTimer     = null;
var plIdx        = 0;
var isFullscreen = false;
var lastTapTime  = 0;

/* ── HLS.js config — conservative for Tizen ── */
var HLS_CFG = {
enableWorker: false,
lowLatencyMode: false,
startLevel: -1,
autoStartLoad: true,
maxBufferLength: 30,
maxMaxBufferLength: 60,
maxBufferSize: 30000000,
maxBufferHole: 1,
fragLoadingMaxRetry: 6,
fragLoadingRetryDelay: 2000,
manifestLoadingMaxRetry: 4,
levelLoadingMaxRetry: 4,
};

/* ═══════════ STATUS ═══════════ */
function setStatus(msg, state) {
state = state || ‘idle’;
statusTextEl.textContent = String(msg).toUpperCase();
statusPill.className = ‘status-pill ’ + state;
bufferingSpinner.className = ‘buffering-spinner’ + (state === ‘buffering’ ? ’ visible’ : ‘’);
}

function showOSD(title, sub) {
overlayChannel.textContent = title || ‘’;
overlayStatus.textContent  = sub   || ‘’;
videoOverlay.className = ‘video-overlay visible’;
clearTimeout(osdTimer);
osdTimer = setTimeout(function () {
videoOverlay.className = ‘video-overlay’;
}, 4000);
}

/* ═══════════ FOCUS MANAGEMENT ═══════════
focusArea is the single source of truth.
Inputs only receive focus when explicitly
set; Escape/Back always returns to list.
════════════════════════════════════════ */
function setFocus(area) {
focusArea = area;
document.body.setAttribute(‘data-focus’, area);
if (area === ‘url’) {
playlistUrlEl.focus();
} else if (area === ‘search’) {
searchInput.focus();
} else {
if (document.activeElement && document.activeElement !== document.body) {
document.activeElement.blur();
}
if (area === ‘list’) scrollToSelected();
}
}

/* ═══════════ VIRTUAL LIST ═══════════ */
var ITEM_H       = 66;
var _lastScroll  = -999;
var _lastSel     = -1;

function renderList(force) {
var total = filtered.length;
countBadge.textContent = total;

if (total === 0) {
channelListEl.innerHTML = ‘<li class="no-channels">No channels found</li>’;
_lastScroll = _lastSel = -1;
return;
}

var cH      = channelListEl.clientHeight || 600;
var st      = channelListEl.scrollTop;
var vis     = Math.ceil(cH / ITEM_H) + 6;
var si      = Math.max(0, Math.floor(st / ITEM_H) - 2);
var ei      = Math.min(total - 1, si + vis);

if (!force && Math.abs(st - _lastScroll) < ITEM_H / 2 && _lastSel === selIdx) return;
_lastScroll = st;
_lastSel    = selIdx;

var frag = document.createDocumentFragment();

var top = document.createElement(‘li’);
top.style.cssText = ‘height:’ + (si * ITEM_H) + ‘px;min-height:0;padding:0;margin:0;border:none;background:transparent;pointer-events:none;’;
frag.appendChild(top);

for (var i = si; i <= ei; i++) {
var ch = filtered[i];
var li = document.createElement(‘li’);
if (i === selIdx) li.className = ‘active’;
li.innerHTML = ‘<div class="ch-name">’ + esc(ch.name) + ‘</div><div class="ch-group">’ + esc(ch.group) + ‘</div>’;
(function (idx) {
li.addEventListener(‘click’, function () {
selIdx = idx;
setFocus(‘list’);
renderList(true);
playSelected();
});
})(i);
frag.appendChild(li);
}

var bot = document.createElement(‘li’);
var bh  = (total - 1 - ei) * ITEM_H;
bot.style.cssText = ‘height:’ + (bh > 0 ? bh : 0) + ‘px;min-height:0;padding:0;margin:0;border:none;background:transparent;pointer-events:none;’;
frag.appendChild(bot);

channelListEl.innerHTML = ‘’;
channelListEl.appendChild(frag);
}

function scrollToSelected() {
var top = selIdx * ITEM_H;
var cH  = channelListEl.clientHeight || 600;
var st  = channelListEl.scrollTop;
if (top < st || top + ITEM_H > st + cH) {
channelListEl.scrollTop = Math.max(0, top - Math.floor(cH / 2));
}
}

var _sraf = false;
channelListEl.addEventListener(‘scroll’, function () {
if (_sraf) return;
_sraf = true;
requestAnimationFrame(function () { renderList(false); _sraf = false; });
});

function esc(s) {
return String(s)
.replace(/&/g,’&’).replace(/</g,’<’)
.replace(/>/g,’>’).replace(/”/g,’"’);
}

function moveSelection(d) {
if (!filtered.length) return;
selIdx = Math.max(0, Math.min(filtered.length - 1, selIdx + d));
scrollToSelected();
renderList(true);
}

/* ═══════════ SEARCH ═══════════ */
searchInput.addEventListener(‘input’, function () {
var q = searchInput.value.trim().toLowerCase();
filtered = q
? channels.filter(function (c) {
return c.name.toLowerCase().indexOf(q) >= 0 ||
c.group.toLowerCase().indexOf(q) >= 0;
})
: channels.slice(0);
selIdx = 0;
channelListEl.scrollTop = 0;
renderList(true);
});

/* ═══════════ M3U PARSER ═══════════ */
function parseM3U(text) {
var lines = text.split(/\r?\n/);
var out   = [];
var meta  = null;
for (var i = 0; i < lines.length; i++) {
var line = lines[i].trim();
if (!line) continue;
if (line.indexOf(’#EXTINF’) === 0) {
var ci   = line.indexOf(’,’);
var name = ci >= 0 ? line.slice(ci + 1).trim() : ‘Unknown’;
var gm   = line.match(/group-title=”([^”]+)”/i);
meta = { name: name || ‘Unknown’, group: gm ? gm[1] : ‘General’ };
continue;
}
if (line.indexOf(’#’) !== 0 && line.length > 6) {
out.push({ name: meta ? meta.name : ‘Unknown’, group: meta ? meta.group : ‘General’, url: line });
meta = null;
}
}
return out;
}

/* ═══════════ FETCH (XHR — reliable on Tizen) ═══════════ */
function fetchText(url, ms) {
ms = ms || 20000;
return new Promise(function (resolve, reject) {
var xhr  = new XMLHttpRequest();
var done = false;
var tid  = setTimeout(function () {
if (done) return; done = true; xhr.abort(); reject(new Error(‘Timeout’));
}, ms);
xhr.onload = function () {
if (done) return; done = true; clearTimeout(tid);
xhr.status >= 200 && xhr.status < 400 ? resolve(xhr.responseText) : reject(new Error(’HTTP ’ + xhr.status));
};
xhr.onerror = function () {
if (done) return; done = true; clearTimeout(tid); reject(new Error(‘Net error’));
};
xhr.open(‘GET’, url, true);
xhr.setRequestHeader(‘Cache-Control’, ‘no-cache’);
xhr.send();
});
}

function githubMirror(url) {
try {
var u = new URL(url);
if (u.hostname !== ‘raw.githubusercontent.com’) return null;
var p = u.pathname.split(’/’).filter(function (s) { return s; });
if (p.length < 4) return null;
return ‘https://cdn.jsdelivr.net/gh/’ + p[0] + ‘/’ + p[1] + ‘@’ + p[2] + ‘/’ + p.slice(3).join(’/’);
} catch (e) { return null; }
}

/* ═══════════ LOAD PLAYLIST ═══════════ */
function loadPlaylist(urlOverride) {
var url = (urlOverride || playlistUrlEl.value).trim();
if (!url) { setStatus(‘Enter a URL’, ‘error’); return; }
playlistUrlEl.value = url;
setStatus(‘Loading\u2026’, ‘buffering’);
loadBtn.disabled = true;

function onDone() { loadBtn.disabled = false; }

fetchText(url, 20000)
.catch(function (e) {
var m = githubMirror(url);
if (!m) throw e;
setStatus(‘Mirror\u2026’, ‘buffering’);
return fetchText(m, 20000);
})
.then(function (text) {
channels = parseM3U(text);
filtered = channels.slice(0);
selIdx   = 0;
channelListEl.scrollTop = 0;
renderList(true);
try { localStorage.setItem(SK_URL, url); } catch (e) {}
setStatus(channels.length + ’ channels’, ‘idle’);
setFocus(‘list’);
onDone();
})
.catch(function (err) {
setStatus(’Failed: ’ + (err.message || ‘?’), ‘error’);
onDone();
});
}

/* ═══════════ PLAYBACK ═══════════ */
function destroyHls() {
if (!hls) return;
try { hls.destroy(); } catch (e) {}
hls = null;
}

function playSelected() {
if (!filtered.length) return;
var ch = filtered[selIdx];
if (!ch) return;

nowPlayingEl.textContent = ch.name;
nowGroupEl.textContent   = ch.group || ‘\u2014’;
idleScreen.className     = ‘video-idle-screen hidden’;
setStatus(‘Buffering\u2026’, ‘buffering’);
showOSD(ch.name, ch.group);
updatePP(false);
qualityInfo.textContent = ‘\u2026’;

destroyHls();
try { video.pause(); } catch (e) {}
video.removeAttribute(‘src’);
try { video.load(); } catch (e) {}

var url   = ch.url;
var isHls = /.m3u8($|?)/i.test(url) || url.indexOf(‘m3u8’) >= 0;

/* 1 — Tizen AVPlay */
if (window.webapis && window.webapis.avplay) {
qualityInfo.textContent = ‘AVPLAY’;
try {
var av = window.webapis.avplay;
try { av.close(); } catch (e) {}
av.open(url);
av.setDisplayRect(0, 0, window.screen.width, window.screen.height);
av.setListener({
onbufferingstart:    function () { setStatus(‘Buffering\u2026’, ‘buffering’); },
onbufferingcomplete: function () { setStatus(‘Playing’, ‘playing’); },
onerror: function (err) { setStatus(’AVPlay: ’ + err, ‘error’); },
});
av.prepareAsync(
function () { av.play(); setStatus(‘Playing’, ‘playing’); updatePP(false); },
function ()  { setStatus(‘AVPlay prep error’, ‘error’); }
);
return;
} catch (e) { /* fall through */ }
}

/* 2 — Native HLS */
if (isHls && video.canPlayType(‘application/vnd.apple.mpegurl’)) {
qualityInfo.textContent = ‘NATIVE’;
video.src = url;
video.play().catch(function () {});
return;
}

/* 3 — hls.js */
if (isHls && window.Hls && Hls.isSupported()) {
qualityInfo.textContent = ‘HLS’;
hls = new Hls(HLS_CFG);
hls.loadSource(url);
hls.attachMedia(video);
hls.on(Hls.Events.MANIFEST_PARSED, function () {
video.play().catch(function () {});
});
hls.on(Hls.Events.LEVEL_SWITCHED, function (ev, d) {
var lvl = hls.levels[d.level];
qualityInfo.textContent = (lvl && lvl.height) ? lvl.height + ‘p’ : ‘HLS’;
});
hls.on(Hls.Events.ERROR, function (ev, d) {
if (!d.fatal) return;
if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
setStatus(‘Net err\u2014retry’, ‘buffering’);
setTimeout(function () { try { hls.startLoad(); } catch (e) {} }, 2000);
} else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
setStatus(‘Media err\u2014recover’, ‘buffering’);
try { hls.recoverMediaError(); } catch (e) {}
} else {
setStatus(‘Stream error’, ‘error’);
destroyHls();
}
});
return;
}

/* 4 — Direct */
qualityInfo.textContent = ‘DIRECT’;
video.src = url;
video.play().catch(function () {});
}

function updatePP(paused) { playPauseBtn.textContent = paused ? ‘\u23F5’ : ‘\u23F8’; }

/* ═══════════ FULLSCREEN ═══════════ */
function enterFS() {
var el = videoWrap;
var fn = el.requestFullscreen || el.webkitRequestFullscreen ||
el.mozRequestFullScreen || el.msRequestFullscreen;
if (fn) { fn.call(el); return; }
/* Tizen CSS fallback */
document.getElementById(‘sidebar’).style.display = ‘none’;
el.style.cssText += ‘;position:fixed!important;inset:0!important;z-index:9999!important;margin:0!important;border-radius:0!important;’;
isFullscreen = true;
}
function exitFS() {
var fn = document.exitFullscreen || document.webkitExitFullscreen ||
document.mozCancelFullScreen || document.msExitFullscreen;
if (fn) { fn.call(document); return; }
document.getElementById(‘sidebar’).style.display = ‘’;
videoWrap.style.cssText = ‘’;
isFullscreen = false;
}
function toggleFS() { isFullscreen ? exitFS() : enterFS(); }

document.addEventListener(‘fullscreenchange’, function () {
isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
});
document.addEventListener(‘webkitfullscreenchange’, function () {
isFullscreen = !!(document.webkitFullscreenElement || document.fullscreenElement);
});

/* Double-click video → fullscreen */
video.addEventListener(‘dblclick’, function () { toggleFS(); });

/* Touch double-tap → fullscreen */
video.addEventListener(‘click’, function () {
var now = Date.now();
if (now - lastTapTime < 400) toggleFS();
lastTapTime = now;
});

/* ═══════════ VIDEO EVENTS ═══════════ */
video.addEventListener(‘playing’, function () { setStatus(‘Playing’,‘playing’); updatePP(false); showOSD(nowPlayingEl.textContent,’’); });
video.addEventListener(‘pause’,   function () { setStatus(‘Paused’,‘idle’);     updatePP(true);  });
video.addEventListener(‘waiting’, function () { setStatus(‘Buffering\u2026’,‘buffering’); });
video.addEventListener(‘stalled’, function () { setStatus(‘Stalled\u2026’,‘buffering’); });
video.addEventListener(‘error’,   function () { setStatus(‘Playback error’,‘error’); });
video.addEventListener(‘ended’,   function () { setStatus(‘Ended’,‘idle’); });

/* ═══════════ CONTROL BAR ═══════════ */
loadBtn.addEventListener(‘click’, function () { loadPlaylist(); });

defaultBtn.addEventListener(‘click’, function () {
plIdx = (plIdx + 1) % DEFAULT_PLAYLISTS.length;
try { localStorage.setItem(SK_PLIDX, plIdx); } catch (e) {}
var pl = DEFAULT_PLAYLISTS[plIdx];
defaultBtn.textContent = pl.label;
playlistUrlEl.value = pl.url;
loadPlaylist(pl.url);
});

playPauseBtn.addEventListener(‘click’, function () {
if (video.paused || video.ended) video.play().catch(function () {}); else video.pause();
});

stopBtn.addEventListener(‘click’, function () {
destroyHls();
try { video.pause(); } catch (e) {}
video.removeAttribute(‘src’);
try { video.load(); } catch (e) {}
idleScreen.className = ‘video-idle-screen’;
setStatus(‘Stopped’, ‘idle’);
updatePP(true);
if (isFullscreen) exitFS();
});

prevBtn.addEventListener(‘click’, function () { moveSelection(-1); playSelected(); });
nextBtn.addEventListener(‘click’, function () { moveSelection(1);  playSelected(); });

volSlider.addEventListener(‘input’, function () {
video.volume = parseFloat(volSlider.value);
try { localStorage.setItem(SK_VOL, volSlider.value); } catch (e) {}
});

/* ═══════════ TIZEN KEY REGISTRATION ═══════════ */
(function () {
try {
if (window.tizen && tizen.tvinputdevice) {
[‘MediaPlay’,‘MediaPause’,‘MediaPlayPause’,‘MediaStop’,
‘MediaFastForward’,‘MediaRewind’,
‘ColorF0Red’,‘ColorF1Green’,‘ColorF2Yellow’,‘ColorF3Blue’,
‘ChannelUp’,‘ChannelDown’,‘Back’].forEach(function (k) {
try { tizen.tvinputdevice.registerKey(k); } catch (e) {}
});
}
} catch (e) {}
})();

/* ═══════════ REMOTE / KEYBOARD ═══════════ */
window.addEventListener(‘keydown’, function (e) {
var key  = e.key;
var code = e.keyCode;

/* Escape / Back — always release input, exit fullscreen, or exit app */
if (key === ‘Escape’ || key === ‘Back’ || code === 10009 || code === 27) {
if (focusArea === ‘url’ || focusArea === ‘search’) {
setFocus(‘list’); e.preventDefault(); return;
}
if (isFullscreen) { exitFS(); e.preventDefault(); return; }
try { tizen.application.getCurrentApplication().exit(); } catch (ex) {}
e.preventDefault(); return;
}

/* While URL or Search has focus, only intercept Enter; let all other keys type */
if (focusArea === ‘url’ || focusArea === ‘search’) {
if (key === ‘Enter’) {
if (focusArea === ‘url’) loadPlaylist();
setFocus(‘list’);
e.preventDefault();
}
return;
}

/* Navigation */
if (key === ‘ArrowUp’)   { if (focusArea === ‘list’) moveSelection(-1); e.preventDefault(); return; }
if (key === ‘ArrowDown’) { if (focusArea === ‘list’) moveSelection(1);  e.preventDefault(); return; }
if (key === ‘ArrowLeft’) { if (isFullscreen) exitFS(); else setFocus(‘list’);   e.preventDefault(); return; }
if (key === ‘ArrowRight’) { focusArea = ‘player’; e.preventDefault(); return; }
if (key === ‘PageUp’)   { moveSelection(-10); e.preventDefault(); return; }
if (key === ‘PageDown’) { moveSelection(10);  e.preventDefault(); return; }

/* Enter */
if (key === ‘Enter’) {
if (focusArea === ‘list’)   { playSelected(); }
else if (focusArea === ‘player’) { toggleFS(); }
e.preventDefault(); return;
}

/* Media keys */
if (key === ‘MediaPlayPause’ || code === 10252) { video.paused ? video.play().catch(function(){}) : video.pause(); e.preventDefault(); return; }
if (key === ‘MediaPlay’      || code === 415)   { video.play().catch(function(){}); e.preventDefault(); return; }
if (key === ‘MediaPause’     || code === 19)    { video.pause(); e.preventDefault(); return; }
if (key === ‘MediaStop’      || code === 413)   { stopBtn.click(); e.preventDefault(); return; }
if (key === ‘MediaFastForward’|| code === 417)  { moveSelection(1);  playSelected(); e.preventDefault(); return; }
if (key === ‘MediaRewind’    || code === 412)   { moveSelection(-1); playSelected(); e.preventDefault(); return; }
if (key === ‘ChannelUp’      || code === 427)   { moveSelection(1);  playSelected(); e.preventDefault(); return; }
if (key === ‘ChannelDown’    || code === 428)   { moveSelection(-1); playSelected(); e.preventDefault(); return; }

/* Colour buttons */
if (key === ‘ColorF0Red’    || code === 403) { setFocus(‘url’);    e.preventDefault(); return; }
if (key === ‘ColorF1Green’  || code === 404) { loadPlaylist();     e.preventDefault(); return; }
if (key === ‘ColorF2Yellow’ || code === 405) { setFocus(‘search’); e.preventDefault(); return; }
if (key === ‘ColorF3Blue’   || code === 406) { defaultBtn.click(); e.preventDefault(); return; }
});

/* ═══════════ INIT ═══════════ */
(function init() {
try { var sv = parseFloat(localStorage.getItem(SK_VOL)); if (!isNaN(sv)) { video.volume = sv; volSlider.value = sv; } } catch (e) {}
try { var si = parseInt(localStorage.getItem(SK_PLIDX), 10); if (!isNaN(si) && si < DEFAULT_PLAYLISTS.length) plIdx = si; } catch (e) {}
defaultBtn.textContent = DEFAULT_PLAYLISTS[plIdx].label;

var lastUrl = ‘’;
try { lastUrl = localStorage.getItem(SK_URL) || ‘’; } catch (e) {}
if (!lastUrl) lastUrl = DEFAULT_PLAYLISTS[plIdx].url;
playlistUrlEl.value = lastUrl;
setFocus(‘list’);
loadPlaylist(lastUrl);
})();

}); /* end DOMContentLoaded */